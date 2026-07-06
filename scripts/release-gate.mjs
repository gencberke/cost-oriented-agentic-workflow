#!/usr/bin/env node
// Candidate/final release gate for Phase 7A/7B.
//
// Candidate mode proves the repository is mechanically ready while live evidence
// remains pending. Final mode proves the recorded live evidence manifest is
// complete and deterministic before the 0.5.0 version bump.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const die = (code, msg) => {
  console.error(code);
  if (msg) console.error(msg);
  process.exit(1);
};
const defaultRoot = () => path.resolve(execFileSync('git', ['-C', here, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());

let mode = 'candidate';
let root = defaultRoot();
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--mode=candidate') mode = 'candidate';
  else if (arg === '--mode=final') mode = 'final';
  else if (arg === '--root') {
    const next = args[++i];
    if (!next) die('INVALID_RELEASE_GATE_ARGUMENT', '--root requires a path.');
    root = path.resolve(next);
  }
  else die('INVALID_RELEASE_GATE_ARGUMENT', `unknown argument: ${arg}`);
}

const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const TARGET_FINAL_VERSION = '0.5.0';
const SOURCE_VERSION = '0.4.2';
const EVIDENCE_DIR = 'docs/release-evidence/0.5.0';
const EVIDENCE_MANIFEST = `${EVIDENCE_DIR}/live-evidence.json`;
const REQUIRED_GATES = [
  'phase3b2ReviewLifecycle',
  'phase4ResumeCompact',
  'phase5AskDeny',
  'phase6BehavioralCost',
];
const ALLOWED_STATUSES = new Set(['accepted', 'pending', 'rejected']);
const ALLOWED_ARTIFACT_KINDS = new Set([
  'gate-summary-json',
  'phase6-run-record',
  'phase6-aggregate-json',
  'phase6-aggregate-markdown',
  'decision-log-markdown',
]);
const SHA256_RE = /^[a-f0-9]{64}$/i;
const GIT_SHA_RE = /^[a-f0-9]{7,40}$/i;
const LOCAL_PATH_RE = /[A-Za-z]:\\{1,2}Users\\{1,2}|[A-Za-z]:[\\/]|\/c\/Users\/|\/Users\/[A-Za-z]|gencberke|cost-oriented-agentic-workflow-phase\w+/i;

function isRepoRelative(p) {
  if (typeof p !== 'string' || p.length === 0) return false;
  if (p.includes('\\') || path.isAbsolute(p) || LOCAL_PATH_RE.test(p)) return false;
  const norm = path.posix.normalize(p);
  return norm === p && norm !== '..' && !norm.startsWith('../') && !norm.includes('/../');
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function gitTracked(rel) {
  try {
    execFileSync('git', ['-C', root, 'ls-files', '--error-unmatch', '--', rel], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function artifactErrors(gateName, gateStatus, artifact) {
  const errs = [];
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return [`${gateName}: artifact must be an object`];
  if (!isRepoRelative(artifact.path)) errs.push(`${gateName}: artifact path must be repo-relative: ${artifact.path || '(missing)'}`);
  if (artifact.path && !artifact.path.startsWith(`${EVIDENCE_DIR}/`)) errs.push(`${gateName}: artifact must live under ${EVIDENCE_DIR}`);
  if (artifact.path === EVIDENCE_MANIFEST) errs.push(`${gateName}: manifest cannot cite itself as evidence`);
  if (!ALLOWED_ARTIFACT_KINDS.has(artifact.kind)) errs.push(`${gateName}: unsupported artifact kind ${artifact.kind || '(missing)'}`);
  if (!SHA256_RE.test(artifact.sha256 || '')) errs.push(`${gateName}: artifact sha256 must be 64 hex chars`);
  if (errs.length) return errs;

  const abs = path.join(root, artifact.path);
  if (!fs.existsSync(abs)) return [`${gateName}: artifact missing: ${artifact.path}`];
  if (!gitTracked(artifact.path)) return [`${gateName}: artifact is not tracked by Git: ${artifact.path}`];
  const bytes = fs.readFileSync(abs);
  const text = bytes.toString('utf8');
  if (sha256(bytes) !== artifact.sha256) errs.push(`${gateName}: artifact sha256 mismatch: ${artifact.path}`);
  if (LOCAL_PATH_RE.test(text)) errs.push(`${gateName}: artifact contains a personal or absolute local path: ${artifact.path}`);

  if (artifact.path.endsWith('.json') || artifact.kind.endsWith('-json') || artifact.kind === 'phase6-run-record') {
    let parsed;
    try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch (e) { errs.push(`${gateName}: artifact JSON is malformed: ${artifact.path}: ${e.message}`); }
    if (parsed && artifact.kind === 'gate-summary-json') {
      if (parsed.schemaVersion !== 1 || parsed.evidenceKind !== 'phase7b-gate-summary'
        || parsed.gate !== gateName || parsed.status !== gateStatus) {
        errs.push(`${gateName}: gate summary artifact does not match the gate status`);
      }
    }
    if (parsed && artifact.kind === 'phase6-run-record') {
      if (parsed.schemaVersion !== 1 || typeof parsed.runId !== 'string' || typeof parsed.semanticResult !== 'string') {
        errs.push(`${gateName}: phase6 run record has malformed summary shape`);
      }
    }
  }
  return errs;
}

function validateEvidenceManifest() {
  const abs = path.join(root, EVIDENCE_MANIFEST);
  if (!fs.existsSync(abs)) return { state: 'missing', errors: [] };
  if (!gitTracked(EVIDENCE_MANIFEST)) {
    return { state: 'invalid', errors: [`manifest is not tracked by Git: ${EVIDENCE_MANIFEST}`] };
  }

  const raw = fs.readFileSync(abs, 'utf8');
  if (LOCAL_PATH_RE.test(raw)) return { state: 'invalid', errors: ['manifest contains a personal or absolute local path'] };
  let manifest;
  try { manifest = JSON.parse(raw.replace(/^\uFEFF/, '')); }
  catch (e) { return { state: 'invalid', errors: [`manifest JSON is malformed: ${e.message}`] }; }

  const errors = [];
  if (manifest.schemaVersion !== 1) errors.push('manifest schemaVersion must be 1');
  if (manifest.release !== TARGET_FINAL_VERSION) errors.push(`manifest release must be ${TARGET_FINAL_VERSION}`);
  if (manifest.sourceVersion !== SOURCE_VERSION) errors.push(`manifest sourceVersion must be ${SOURCE_VERSION}`);
  if (!GIT_SHA_RE.test(manifest.commit || '')) errors.push('manifest commit must be a Git SHA');
  if (!manifest.generatedAt || Number.isNaN(Date.parse(manifest.generatedAt))) errors.push('manifest generatedAt must be an ISO date');
  if (!manifest.gates || typeof manifest.gates !== 'object' || Array.isArray(manifest.gates)) errors.push('manifest gates must be an object');

  let accepted = true;
  const pendingGates = [];
  for (const gate of REQUIRED_GATES) {
    const g = manifest.gates && manifest.gates[gate];
    if (!g || typeof g !== 'object' || Array.isArray(g)) {
      errors.push(`missing required gate: ${gate}`);
      accepted = false;
      pendingGates.push(gate);
      continue;
    }
    if (!ALLOWED_STATUSES.has(g.status)) errors.push(`${gate}: invalid status ${g.status || '(missing)'}`);
    if (g.status !== 'accepted') {
      accepted = false;
      pendingGates.push(gate);
    }
    if (!Array.isArray(g.artifacts)) errors.push(`${gate}: artifacts must be an array`);
    if (g.status === 'accepted' && Array.isArray(g.artifacts) && g.artifacts.length === 0) {
      errors.push(`${gate}: accepted gate must cite at least one committed artifact`);
    }
    if (Array.isArray(g.artifacts)) {
      for (const artifact of g.artifacts) errors.push(...artifactErrors(gate, g.status, artifact));
    }
  }

  const gateNames = manifest.gates && typeof manifest.gates === 'object' ? Object.keys(manifest.gates) : [];
  for (const gate of gateNames) {
    if (!REQUIRED_GATES.includes(gate)) errors.push(`unexpected gate in manifest: ${gate}`);
  }

  if (!Array.isArray(manifest.rawProvenance)) errors.push('rawProvenance must be an array');
  if (Array.isArray(manifest.rawProvenance)) {
    for (const [i, rawEntry] of manifest.rawProvenance.entries()) {
      if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
        errors.push(`rawProvenance[${i}] must be an object`);
        continue;
      }
      if (!isRepoRelative(rawEntry.path) || !rawEntry.path.startsWith('.cost-oriented-agentic-workflow/eval/phase7b/')) {
        errors.push(`rawProvenance[${i}].path must be repo-relative ignored Phase 7B provenance`);
      }
      if (!SHA256_RE.test(rawEntry.sha256 || '')) errors.push(`rawProvenance[${i}].sha256 must be 64 hex chars`);
    }
  }

  if (errors.length) return { state: 'invalid', errors };
  return { state: accepted ? 'accepted' : 'pending', errors: [], pendingGates };
}

const plugin = readJSON('.claude-plugin/plugin.json');
const pkg = readJSON('package.json');
const market = readJSON('.claude-plugin/marketplace.json');
const marketEntry = (market.plugins || []).find((p) => p.name === plugin.name);
if (!marketEntry) die('RELEASE_GATE_FAILED', 'marketplace.json does not list the plugin.');
if (plugin.version !== pkg.version || plugin.version !== marketEntry.version) {
  die('VERSION_MISMATCH', JSON.stringify({ plugin: plugin.version, package: pkg.version, marketplace: marketEntry.version }));
}
if (pkg.dependencies || pkg.devDependencies) die('RUNTIME_DEPENDENCY_VIOLATION', 'package.json must not declare runtime or dev dependencies.');
if (fs.existsSync(path.join(root, 'hooks/hooks.json'))) die('ACTIVE_HOOKS_JSON_PRESENT', 'hooks/hooks.json must remain absent.');

const agents = fs.readdirSync(path.join(root, 'agents')).filter((f) => f.endsWith('.md'));
if (agents.length !== 4) die('AGENT_COUNT_MISMATCH', `expected 4 agents, found ${agents.length}.`);

const releaseDoc = path.join(root, 'docs/RELEASE_0.5.0.md');
if (!fs.existsSync(releaseDoc)) die('RELEASE_DOC_MISSING', 'docs/RELEASE_0.5.0.md is required for Phase 7A.');
const releaseText = fs.readFileSync(releaseDoc, 'utf8');
const evidence = validateEvidenceManifest();
if (evidence.state === 'invalid') die('LIVE_EVIDENCE_INVALID', evidence.errors.join('\n'));
if (evidence.state !== 'accepted' && !/LIVE EVIDENCE REQUIRED BEFORE FINAL RELEASE/.test(releaseText)) {
  die('LIVE_EVIDENCE_STATUS_AMBIGUOUS', 'release handoff must keep the live-evidence gate explicit until accepted evidence exists.');
}

if (mode === 'final') {
  if (evidence.state !== 'accepted') {
    die('LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE',
      `Pending live evidence gates: ${(evidence.pendingGates || REQUIRED_GATES).join(', ')}.`);
  }
  console.log('PHASE_7B_FINAL_EVIDENCE_GATE_PASSED');
  console.log(JSON.stringify({
    mode,
    version: plugin.version,
    targetFinalVersion: TARGET_FINAL_VERSION,
    agents: agents.sort(),
    activeHooksJson: false,
    liveEvidence: 'accepted',
  }, null, 2));
  process.exit(0);
}

console.log('PHASE_7A_CANDIDATE_GATE_PASSED');
console.log(JSON.stringify({
  mode,
  version: plugin.version,
  targetFinalVersion: TARGET_FINAL_VERSION,
  agents: agents.sort(),
  activeHooksJson: false,
  liveEvidence: evidence.state === 'accepted' ? 'accepted' : 'pending',
}, null, 2));

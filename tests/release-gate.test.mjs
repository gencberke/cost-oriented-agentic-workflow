#!/usr/bin/env node
// Focused Phase 7B final-evidence release gate tests. Node stdlib only.

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_GATES = [
  'phase3b2ReviewLifecycle',
  'phase4ResumeCompact',
  'phase5AskDeny',
  'phase6BehavioralCost',
];

let passes = 0;
let fails = 0;
const tmps = [];

function check(cond, msg) {
  if (cond) passes += 1;
  else {
    fails += 1;
    console.error(`FAIL: ${msg}`);
  }
}

function run(args, cwd = repoRoot) {
  return spawnSync(args[0], args.slice(1), { cwd, encoding: 'utf8' });
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function writeJSON(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

function makeRoot({ releaseDocMarker = true, evidence = null, activeHooks = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cow-release-gate-'));
  tmps.push(root);
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });

  writeJSON(path.join(root, '.claude-plugin/plugin.json'), {
    name: 'cost-oriented-agentic-workflow',
    version: '0.4.2',
  });
  writeJSON(path.join(root, '.claude-plugin/marketplace.json'), {
    plugins: [{ name: 'cost-oriented-agentic-workflow', version: '0.4.2' }],
  });
  writeJSON(path.join(root, 'package.json'), { version: '0.4.2' });
  for (const f of ['cow-debug-investigator.md', 'cow-implementer.md', 'cow-repo-investigator.md', 'cow-reviewer.md']) {
    fs.writeFileSync(path.join(root, 'agents', f), `# ${f}\n`);
  }
  fs.writeFileSync(path.join(root, 'docs/RELEASE_0.5.0.md'),
    releaseDocMarker
      ? 'Status: LIVE EVIDENCE REQUIRED BEFORE FINAL RELEASE.\n'
      : 'Status: Phase 7B final evidence accepted by manifest.\n');
  if (activeHooks) fs.writeFileSync(path.join(root, 'hooks/hooks.json'), '{"hooks":{}}\n');
  if (evidence) writeEvidence(root, evidence);

  run(['git', 'init', '-q'], root);
  run(['git', 'config', 'user.email', 'test@example.com'], root);
  run(['git', 'config', 'user.name', 'test'], root);
  run(['git', 'add', '-A'], root);
  const commit = run(['git', 'commit', '-qm', 'seed'], root);
  check(commit.status === 0, 'fixture root commits tracked files');
  return root;
}

function writeEvidence(root, overrides = {}) {
  const evidenceDir = path.join(root, 'docs/release-evidence/0.5.0');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const gates = {};
  for (const gate of REQUIRED_GATES) {
    const rel = `docs/release-evidence/0.5.0/${gate}.summary.json`;
    const body = JSON.stringify({
      schemaVersion: 1,
      evidenceKind: 'phase7b-gate-summary',
      gate,
      status: 'accepted',
    }, null, 2) + '\n';
    fs.writeFileSync(path.join(root, rel), body);
    gates[gate] = {
      status: 'accepted',
      artifacts: [{ path: rel, kind: 'gate-summary-json', sha256: sha256(body) }],
    };
  }
  const evidence = {
    schemaVersion: 1,
    release: '0.5.0',
    sourceVersion: '0.4.2',
    commit: '0123456789abcdef0123456789abcdef01234567',
    generatedAt: '2026-07-04T00:00:00.000Z',
    gates,
    rawProvenance: [{
      path: '.cost-oriented-agentic-workflow/eval/phase7b/example.stream.jsonl',
      sha256: 'a'.repeat(64),
    }],
    ...overrides,
  };
  writeJSON(path.join(root, 'docs/release-evidence/0.5.0/live-evidence.json'), evidence);
}

console.log('Running Phase 7B release gate tests...');

{
  const root = makeRoot({ evidence: null, releaseDocMarker: true });
  const r = run([process.execPath, path.join(repoRoot, 'scripts/release-gate.mjs'), '--mode=final', '--root', root]);
  check(r.status !== 0 && /LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE/.test(r.stderr),
    'final gate fails without evidence manifest');
}

{
  const gates = Object.fromEntries(REQUIRED_GATES.map((gate) => [gate, { status: 'pending', artifacts: [] }]));
  const root = makeRoot({ evidence: { gates }, releaseDocMarker: true });
  const candidate = run([process.execPath, path.join(repoRoot, 'scripts/release-gate.mjs'), '--mode=candidate', '--root', root]);
  check(candidate.status === 0 && /PHASE_7A_CANDIDATE_GATE_PASSED/.test(candidate.stdout),
    'candidate gate passes while evidence is pending');
  const finalGate = run([process.execPath, path.join(repoRoot, 'scripts/release-gate.mjs'), '--mode=final', '--root', root]);
  check(finalGate.status !== 0 && /LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE/.test(finalGate.stderr),
    'final gate fails with pending evidence manifest');
}

{
  const root = makeRoot({
    evidence: { rawProvenance: [{ path: 'C:\\Users\\someone\\raw.stream.jsonl', sha256: 'b'.repeat(64) }] },
    releaseDocMarker: true,
  });
  const r = run([process.execPath, path.join(repoRoot, 'scripts/release-gate.mjs'), '--mode=final', '--root', root]);
  check(r.status !== 0 && /LIVE_EVIDENCE_INVALID/.test(r.stderr),
    'final gate rejects absolute raw provenance paths in JSON');
}

{
  const root = makeRoot({ evidence: {}, releaseDocMarker: false });
  const r = run([process.execPath, path.join(repoRoot, 'scripts/release-gate.mjs'), '--mode=final', '--root', root]);
  check(r.status === 0 && /PHASE_7B_FINAL_EVIDENCE_GATE_PASSED/.test(r.stdout),
    'final gate passes with accepted committed evidence and no old release-doc blocker');
}

{
  const root = makeRoot({ evidence: {}, activeHooks: true });
  const r = run([process.execPath, path.join(repoRoot, 'scripts/release-gate.mjs'), '--mode=candidate', '--root', root]);
  check(r.status !== 0 && /ACTIVE_HOOKS_JSON_PRESENT/.test(r.stderr),
    'candidate gate still rejects active hooks/hooks.json');
}

for (const d of tmps) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

console.log(`Phase 7B release gate tests: ${passes} passed, ${fails} failed.`);
if (fails) process.exit(1);

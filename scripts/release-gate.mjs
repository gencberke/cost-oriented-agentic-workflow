#!/usr/bin/env node
// Candidate/final release gate for Phase 7A.
//
// Candidate mode proves the repository is mechanically ready while live evidence
// remains pending. Final mode intentionally refuses release until those live
// gates are accepted in a later pass.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(execFileSync('git', ['-C', here, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const die = (code, msg) => {
  console.error(code);
  if (msg) console.error(msg);
  process.exit(1);
};
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

let mode = 'candidate';
for (const arg of process.argv.slice(2)) {
  if (arg === '--mode=candidate') mode = 'candidate';
  else if (arg === '--mode=final') mode = 'final';
  else die('INVALID_RELEASE_GATE_ARGUMENT', `unknown argument: ${arg}`);
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
if (!/LIVE EVIDENCE REQUIRED BEFORE FINAL RELEASE/.test(releaseText)) {
  die('LIVE_EVIDENCE_STATUS_AMBIGUOUS', 'release handoff must keep the live-evidence gate explicit.');
}

if (mode === 'final') {
  die('LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE',
    'Phase 3B.2, Phase 4, Phase 5, and sufficient Phase 6 live evidence remain pending.');
}

console.log('PHASE_7A_CANDIDATE_GATE_PASSED');
console.log(JSON.stringify({
  mode,
  version: plugin.version,
  targetFinalVersion: '0.5.0',
  agents: agents.sort(),
  activeHooksJson: false,
  liveEvidence: 'pending',
}, null, 2));

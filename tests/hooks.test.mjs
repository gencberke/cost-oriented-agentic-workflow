// Deterministic, zero-dependency tests for cow-hook.mjs (Layer 3: SessionStart, PreToolUse, PreCompact)
// Run throwaway repo test cases under OS temp dir.
// Run: node tests/hooks.test.mjs

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { defaultState, SCHEMA_VERSION } from '../skills/execution-routing/scripts/cow-state-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOOK_SCRIPT = path.resolve(here, '../skills/execution-routing/scripts/cow-hook.mjs');

let fails = 0;
let passes = 0;
const check = (cond, msg) => { if (cond) { passes += 1; } else { fails += 1; console.error('FAIL: ' + msg); } };

const tmps = [];
function freshRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cow-hook-'));
  tmps.push(dir);
  const g = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  g('init', '-q');
  g('config', 'user.email', 'test@example.com');
  g('config', 'user.name', 'test');
  g('config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(dir, 'README.md'), 'seed\n');
  g('add', '-A');
  g('commit', '-qm', 'seed');
  const root = g('rev-parse', '--show-toplevel').stdout.trim();
  return { dir, root, git: g };
}

const runDir = (root) => path.join(root, '.cost-oriented-agentic-workflow', 'run');
const stateFile = (root) => path.join(runDir(root), 'state.json');
const markerFile = (root) => path.join(runDir(root), 'state.active');
const obsLogFile = (root) => path.join(runDir(root), 'hook-observations.log');
const clearLog = (root) => { try { fs.unlinkSync(obsLogFile(root)); } catch {} };

function callHook(cwd, op, stdinPayload = '', env = {}) {
  const r = spawnSync('node', [HOOK_SCRIPT, op], {
    cwd,
    input: typeof stdinPayload === 'string' ? stdinPayload : JSON.stringify(stdinPayload),
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function writeState(root, stateObj, activeMarker = true) {
  fs.mkdirSync(runDir(root), { recursive: true });
  if (stateObj) {
    fs.writeFileSync(stateFile(root), JSON.stringify(stateObj));
  }
  if (activeMarker) {
    fs.writeFileSync(markerFile(root), 'marker\n');
  }
}

console.log('Running Phase 4 Stage 3 (PreToolUse & PreCompact) tests...');

// ── 1. State Classes: ABSENT / INACTIVE / ACTIVE_CORRUPT ──
{
  const { dir, root } = freshRepo();

  // ABSENT
  const rAbsent = callHook(dir, 'session-start');
  check(rAbsent.status === 0, 'ABSENT: exits 0');
  check(rAbsent.stdout === '', 'ABSENT: empty stdout');
  check(!fs.existsSync(obsLogFile(root)), 'ABSENT: no log file created');

  // INACTIVE
  const inactiveState = defaultState('2026-06-28T00:00:00Z');
  inactiveState.active = false;
  writeState(root, inactiveState, false);
  const rInactive = callHook(dir, 'session-start');
  check(rInactive.status === 0, 'INACTIVE: exits 0');
  check(rInactive.stdout === '', 'INACTIVE: empty stdout');
  check(!fs.existsSync(obsLogFile(root)), 'INACTIVE: no log file created');

  // ACTIVE_CORRUPT (Marker present, state file missing)
  clearLog(root);
  try { fs.unlinkSync(stateFile(root)); } catch {}
  writeState(root, null, true); // missing state file
  const rCorrupt = callHook(dir, 'session-start');
  check(rCorrupt.status === 0, 'ACTIVE_CORRUPT: exits 0 (fails open)');
  check(rCorrupt.stdout === '', 'ACTIVE_CORRUPT: no context injection');
  check(fs.existsSync(obsLogFile(root)), 'ACTIVE_CORRUPT: log file created');
  let corruptLog = JSON.parse(fs.readFileSync(obsLogFile(root), 'utf8'));
  check(corruptLog.stateClass === 'ACTIVE_CORRUPT', 'ACTIVE_CORRUPT: stateClass is ACTIVE_CORRUPT');
  check(corruptLog.errorCode === 'STATE_CORRUPT', 'ACTIVE_CORRUPT: errorCode is STATE_CORRUPT');
  check(corruptLog.matchedRuleIds.includes('R8'), 'ACTIVE_CORRUPT: matched R8');

  // ACTIVE_CORRUPT (Malformed state file)
  clearLog(root);
  fs.writeFileSync(stateFile(root), 'invalid json');
  callHook(dir, 'pre-tool-use');
  corruptLog = JSON.parse(fs.readFileSync(obsLogFile(root), 'utf8'));
  check(corruptLog.stateClass === 'ACTIVE_CORRUPT', 'Malformed JSON: stateClass is ACTIVE_CORRUPT');
  check(corruptLog.errorCode === 'STATE_CORRUPT', 'Malformed JSON: errorCode is STATE_CORRUPT');

  // ACTIVE_CORRUPT (Schema-invalid state file)
  clearLog(root);
  fs.writeFileSync(stateFile(root), JSON.stringify({ schemaVersion: 1, active: true })); // missing mode/phase
  callHook(dir, 'pre-tool-use');
  corruptLog = JSON.parse(fs.readFileSync(obsLogFile(root), 'utf8'));
  check(corruptLog.stateClass === 'ACTIVE_CORRUPT', 'Schema-invalid JSON: stateClass is ACTIVE_CORRUPT');
}

// ── 2. PreCompact tests ──
{
  const { dir, root } = freshRepo();
  const activeState = {
    schemaVersion: 1, active: true, mode: 'standard', phase: 'triage', processLane: 'none',
    repositoryProfile: { status: 'absent', fingerprint: null, snapshotPath: null, profilePath: null, updatedAt: null },
    discoveryRoute: 'none', implementationRoute: 'none', risk: 'low',
    rootCause: { status: 'none', reportPath: null }, plan: { status: 'none', path: null },
    currentUnit: { id: null, allowedPaths: [], base: null }, verification: { status: 'none', command: null },
    review: { status: 'none', required: false, scope: 'none', packagePath: null, reportPath: null, acceptedFindingIds: [], pendingBlockingFindingIds: [], targetedRereviewStatus: 'none', wholeWorkReviewStatus: 'none' },
    attempts: { implementer: 0, max: 2 }, remediationWaves: { count: 0, max: 2 },
    commitPolicy: 'controller-per-unit', blocked: { code: null, artifactPath: null, priorPhase: null },
    timestamps: { createdAt: '2026-06-28T00:00:00Z', updatedAt: '2026-06-28T00:00:00Z' }
  };
  writeState(root, activeState);

  // Manual Trigger
  clearLog(root);
  const rManual = callHook(dir, 'pre-compact', { trigger: 'manual', custom_instructions: 'secret', transcript_path: 'foo/bar' });
  check(rManual.status === 0, 'pre-compact: exits 0');
  check(rManual.stdout === '', 'pre-compact: empty stdout');
  
  let logObj = JSON.parse(fs.readFileSync(obsLogFile(root), 'utf8'));
  check(logObj.event === 'pre-compact', 'pre-compact log event');
  check(logObj.subjectKind === 'compact-trigger', 'pre-compact log subjectKind');
  check(logObj.subjectValue === 'manual', 'pre-compact log trigger is manual');
  check(!JSON.stringify(logObj).includes('secret'), 'pre-compact excludes custom_instructions');
  check(!JSON.stringify(logObj).includes('foo/bar'), 'pre-compact excludes transcript_path');

  // Auto Trigger
  clearLog(root);
  callHook(dir, 'pre-compact', { type: 'auto' });
  logObj = JSON.parse(fs.readFileSync(obsLogFile(root), 'utf8'));
  check(logObj.subjectValue === 'auto', 'pre-compact log trigger is auto');

  // Unknown Trigger
  clearLog(root);
  callHook(dir, 'pre-compact', { trigger: 'other-trigger' });
  logObj = JSON.parse(fs.readFileSync(obsLogFile(root), 'utf8'));
  check(logObj.subjectValue === 'unknown', 'pre-compact log trigger is unknown for invalid trigger value');

  // State byte-identical check
  const stateBefore = fs.readFileSync(stateFile(root), 'utf8');
  callHook(dir, 'pre-compact', { trigger: 'manual' });
  const stateAfter = fs.readFileSync(stateFile(root), 'utf8');
  check(stateBefore === stateAfter, 'pre-compact leaves state completely unchanged');
}

// ── 3. Fixed Observation Schema & Key Order ──
{
  const { dir, root } = freshRepo();
  writeState(root, {
    schemaVersion: 1, active: true, mode: 'standard', phase: 'diagnosis-readonly', processLane: 'none',
    repositoryProfile: { status: 'absent', fingerprint: null, snapshotPath: null, profilePath: null, updatedAt: null },
    discoveryRoute: 'none', implementationRoute: 'none', risk: 'low',
    rootCause: { status: 'none', reportPath: null }, plan: { status: 'none', path: null },
    currentUnit: { id: null, allowedPaths: [], base: null }, verification: { status: 'none', command: null },
    review: { status: 'none', required: false, scope: 'none', packagePath: null, reportPath: null, acceptedFindingIds: [], pendingBlockingFindingIds: [], targetedRereviewStatus: 'none', wholeWorkReviewStatus: 'none' },
    attempts: { implementer: 0, max: 2 }, remediationWaves: { count: 0, max: 2 },
    commitPolicy: 'controller-per-unit', blocked: { code: null, artifactPath: null, priorPhase: null },
    timestamps: { createdAt: '2026-06-28T00:00:00Z', updatedAt: '2026-06-28T00:00:00Z' }
  });

  clearLog(root);
  fs.writeFileSync(path.join(dir, 'README.md'), 'changed\n');
  callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'README.md' } });

  const rawLine = fs.readFileSync(obsLogFile(root), 'utf8').trim();
  const logObj = JSON.parse(rawLine);
  
  // Verify ordered keys
  const expectedKeys = [
    'schemaVersion', 'observedAt', 'event', 'stateClass', 'mode', 'phase',
    'toolName', 'matchedRuleIds', 'wouldBeDecision', 'actualDecision',
    'subjectKind', 'subjectValue', 'errorCode'
  ];
  const actualKeys = Object.keys(logObj);
  check(JSON.stringify(actualKeys) === JSON.stringify(expectedKeys), 'observation schema key order is stable and matches spec');
}

// ── 3b. PreToolUse writes at most one observation per invocation ──
{
  const { dir, root } = freshRepo();
  const activeState = defaultState('2026-06-28T00:00:00Z');
  activeState.mode = 'production';
  activeState.phase = 'diagnosis-readonly';
  activeState.implementationRoute = 'planned-sequential';
  activeState.plan.status = 'drafting';
  writeState(root, activeState);

  clearLog(root);
  callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'README.md' } });

  const rawLines = fs.readFileSync(obsLogFile(root), 'utf8').trim().split('\n').filter(Boolean);
  check(rawLines.length === 1, 'pre-tool-use writes at most one observation when multiple rules match');
  const logObj = JSON.parse(rawLines[0]);
  check(JSON.stringify(logObj.matchedRuleIds) === JSON.stringify(['R1', 'R2']), 'pre-tool-use combines overlapping rule ids in one observation');
  check(logObj.wouldBeDecision === 'deny', 'pre-tool-use keeps strongest overlapping decision');
}

// ── 4. Log Record Size Limits & Truncation ──
{
  const { dir, root } = freshRepo();
  writeState(root, {
    schemaVersion: 1, active: true, mode: 'standard', phase: 'implementing', processLane: 'none',
    repositoryProfile: { status: 'absent', fingerprint: null, snapshotPath: null, profilePath: null, updatedAt: null },
    discoveryRoute: 'none', implementationRoute: 'none', risk: 'low',
    rootCause: { status: 'none', reportPath: null }, plan: { status: 'none', path: null },
    currentUnit: { id: '1', allowedPaths: ['src/'], base: null, briefPath: null, reportPath: null, commitSha: null, baselinePath: null, currentAttempt: null, acceptedAttempt: null },
    verification: { status: 'none', command: null },
    review: { status: 'none', required: false, scope: 'none', packagePath: null, reportPath: null, acceptedFindingIds: [], pendingBlockingFindingIds: [], targetedRereviewStatus: 'none', wholeWorkReviewStatus: 'none' },
    attempts: { implementer: 0, max: 2 }, remediationWaves: { count: 0, max: 2 },
    commitPolicy: 'controller-per-unit', blocked: { code: null, artifactPath: null, priorPhase: null },
    timestamps: { createdAt: '2026-06-28T00:00:00Z', updatedAt: '2026-06-28T00:00:00Z' }
  });

  // Safe path size check (subjectValue max 256 bytes)
  const longPath = 'a/'.repeat(200) + 'test.js'; // 407 characters
  clearLog(root);
  callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: longPath } });
  let logObj = JSON.parse(fs.readFileSync(obsLogFile(root), 'utf8'));
  check(Buffer.byteLength(logObj.subjectValue, 'utf8') <= 256, 'subjectValue truncated to maximum 256 bytes');

  // Triggering size limit > 1 KiB
  const extremePath = 'a/'.repeat(500) + 'test.js'; // 1007 characters
  clearLog(root);
  callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: extremePath } });
  const rawLine = fs.readFileSync(obsLogFile(root), 'utf8').trim();
  check(Buffer.byteLength(rawLine, 'utf8') <= 1024, 'record size strictly <= 1 KiB');
  logObj = JSON.parse(rawLine);
  check(logObj.subjectValue === null, 'oversized subjectValue replaced with null');
  check(logObj.errorCode === 'OBSERVATION_TRUNCATED', 'oversized record sets errorCode to OBSERVATION_TRUNCATED');
}

// ── 5. Bash Command Rules ──
{
  const { dir, root } = freshRepo();
  writeState(root, {
    schemaVersion: 1, active: true, mode: 'standard', phase: 'diagnosis-readonly', processLane: 'none',
    repositoryProfile: { status: 'absent', fingerprint: null, snapshotPath: null, profilePath: null, updatedAt: null },
    discoveryRoute: 'none', implementationRoute: 'none', risk: 'low',
    rootCause: { status: 'none', reportPath: null }, plan: { status: 'none', path: null },
    currentUnit: { id: null, allowedPaths: [], base: null }, verification: { status: 'none', command: null },
    review: { status: 'none', required: false, scope: 'none', packagePath: null, reportPath: null, acceptedFindingIds: [], pendingBlockingFindingIds: [], targetedRereviewStatus: 'none', wholeWorkReviewStatus: 'none' },
    attempts: { implementer: 0, max: 2 }, remediationWaves: { count: 0, max: 2 },
    commitPolicy: 'controller-per-unit', blocked: { code: null, artifactPath: null, priorPhase: null },
    timestamps: { createdAt: '2026-06-28T00:00:00Z', updatedAt: '2026-06-28T00:00:00Z' }
  });

  // Mutating Git
  clearLog(root);
  callHook(dir, 'pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'git commit -m "changed"' } });
  let logObj = JSON.parse(fs.readFileSync(obsLogFile(root), 'utf8'));
  check(logObj.matchedRuleIds.includes('R6'), 'mutating git matches R6');
  check(logObj.subjectValue === 'git-commit', 'mutating git classified git-commit');
  check(!JSON.stringify(logObj).includes('changed'), 'mutating git does not log command arguments');

  // redirection mutating
  clearLog(root);
  callHook(dir, 'pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'echo "dirty" > file.js' } });
  logObj = JSON.parse(fs.readFileSync(obsLogFile(root), 'utf8'));
  check(logObj.matchedRuleIds.includes('R6'), 'redirection matches R6');
  check(logObj.subjectValue === 'redirection', 'redirection classified as redirection');

  // redirection to ignored workspace scratch is ignored
  clearLog(root);
  callHook(dir, 'pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'echo "dirty" > .cost-oriented-agentic-workflow/run/temp.txt' } });
  check(!fs.existsSync(obsLogFile(root)), 'redirection to workspace scratch is ignored');
}

// Cleanup tmp dirs
for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
console.log(`PreToolUse & PreCompact tests: ${passes} passed, ${fails} failed.`);
if (fails > 0) process.exit(1);

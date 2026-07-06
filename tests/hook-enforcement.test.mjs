#!/usr/bin/env node
// Deterministic, zero-dependency tests for cow-hook.mjs enforcement mode
// (Phase 5A). Shadow mode is verified byte-identically by tests/hooks.test.mjs;
// this file covers --decision-mode=enforce behavior only.
// Run: node tests/hook-enforcement.test.mjs   (or: npm run test:enforcement)

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { defaultState } from '../skills/execution-routing/scripts/cow-state-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOOK_SCRIPT = path.resolve(here, '../skills/execution-routing/scripts/cow-hook.mjs');
const FIXTURE_DIR = path.resolve(here, 'fixtures/hook-enforcement');

let fails = 0;
let passes = 0;
const check = (cond, msg) => { if (cond) { passes += 1; } else { fails += 1; console.error('FAIL: ' + msg); } };

const tmps = [];
function freshRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cow-enforce-'));
  tmps.push(dir);
  const g = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  g('init', '-q');
  g('config', 'user.email', 'test@example.com');
  g('config', 'user.name', 'test');
  g('config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(dir, 'README.md'), 'seed\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.cost-oriented-agentic-workflow/\ntmp/\n');
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

function callHook(cwd, op, stdinPayload = '', env = {}, extraArgs = []) {
  const r = spawnSync(process.execPath, [HOOK_SCRIPT, op, ...extraArgs], {
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

function trackFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  spawnSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8' });
  spawnSync('git', ['-C', dir, 'commit', '-qm', 'track'], { encoding: 'utf8' });
}

function deepMerge(target, src) {
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])
      && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      deepMerge(target[k], src[k]);
    } else {
      target[k] = src[k];
    }
  }
  return target;
}
function mkState(overrides = {}, now = '2026-06-30T00:00:00Z') {
  return deepMerge(defaultState(now), overrides);
}
function mkUnit(allowedPaths, id = '1') {
  return { id, allowedPaths, base: null, briefPath: null, reportPath: null,
    commitSha: null, baselinePath: null, currentAttempt: null, acceptedAttempt: null };
}

const ENFORCE = ['--decision-mode=enforce'];
const SHADOW = ['--decision-mode=shadow'];
const NOW = '2026-06-30T00:00:00Z';

function parseOut(stdout) {
  const t = stdout.trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch { return null; }
}

console.log('Running Phase 5A enforcement tests...');

// ── 1. Mode selection ───────────────────────────────────────────────────────
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n' });
  const st = mkState({ phase: 'diagnosis-readonly' });
  writeState(root, st);

  // Default (no flag) stays shadow: a would-be E1 match produces NO stdout,
  // only an observation whose actualDecision is 'none'.
  clearLog(root);
  const rDefault = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } });
  check(rDefault.status === 0, 'default: exits 0');
  check(rDefault.stdout === '', 'default (shadow): no stdout on a would-be enforce match');
  const defLog = JSON.parse(fs.readFileSync(obsLogFile(root), 'utf8'));
  check(defLog.actualDecision === 'none', 'default (shadow): observation actualDecision is none');
  check(!('reasonCode' in defLog), 'default (shadow): observation has no reasonCode field');

  // Explicit shadow flag: same shadow behavior.
  clearLog(root);
  const rShadow = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, SHADOW);
  check(rShadow.status === 0, 'explicit shadow: exits 0');
  check(rShadow.stdout === '', 'explicit shadow: no stdout');

  // Explicit enforce flag: now emits a decision.
  clearLog(root);
  const rEnforce = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  check(rEnforce.status === 0, 'enforce: exits 0');
  check(rEnforce.stdout !== '', 'enforce: emits stdout for a matched rule');
  const en = parseOut(rEnforce.stdout);
  check(en && en.hookSpecificOutput && en.hookSpecificOutput.permissionDecision === 'ask', 'enforce: emits ask for E1 standard');
}

// ── 2. Exact ask / deny JSON shape ──────────────────────────────────────────
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n', 'lib/x.js': 'x\n' });

  // Exact ask JSON (E2 standard).
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const rAsk = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'lib/x.js' } }, {}, ENFORCE);
  const ask = parseOut(rAsk.stdout);
  check(ask && ask.hookSpecificOutput
    && ask.hookSpecificOutput.hookEventName === 'PreToolUse'
    && ask.hookSpecificOutput.permissionDecision === 'ask'
    && ask.hookSpecificOutput.permissionDecisionReason === 'COW E2: target is outside the current unit\'s allowed path boundary.',
    'exact ask JSON matches spec (E2)');

  // Exact deny JSON (E4, both modes deny).
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const rDeny = callHook(dir, 'pre-tool-use',
    { tool_name: 'Edit', tool_input: { file_path: 'lib/x.js' }, agent_type: 'cow-repo-investigator' }, {}, ENFORCE);
  const deny = parseOut(rDeny.stdout);
  check(deny && deny.hookSpecificOutput
    && deny.hookSpecificOutput.hookEventName === 'PreToolUse'
    && deny.hookSpecificOutput.permissionDecision === 'deny'
    && deny.hookSpecificOutput.permissionDecisionReason === 'COW E4: the active investigator role is read-only.',
    'exact deny JSON matches spec (E4)');
}

// ── 3. No match + internal failure fail open ────────────────────────────────
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n' });
  writeState(root, mkState({ phase: 'triage' }));

  // No match (edit during triage is not diagnosis-readonly/implementing).
  clearLog(root);
  const rNoMatch = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  check(rNoMatch.status === 0, 'no-match: exits 0');
  check(rNoMatch.stdout === '', 'no-match: empty stdout');

  // Internal failure: tool_input is null -> guarded fail open (no stdout, exit 0).
  clearLog(root);
  const rFail = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: null }, {}, ENFORCE);
  check(rFail.status === 0, 'internal failure: exits 0');
  check(rFail.stdout === '', 'internal failure: empty stdout (fail open)');
}

// ── 4. E1–E7 standard and production ────────────────────────────────────────
// E1: tracked Edit/Write during diagnosis-readonly, outside COW workspace.
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n' });
  writeState(root, mkState({ phase: 'diagnosis-readonly' }));
  clearLog(root);
  const r1s = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  const e1s = parseOut(r1s.stdout);
  check(e1s && e1s.hookSpecificOutput.permissionDecision === 'ask', 'E1 standard: ask');
  check(e1s && e1s.hookSpecificOutput.permissionDecisionReason.startsWith('COW E1:'), 'E1 reason text');

  writeState(root, mkState({ mode: 'production', phase: 'diagnosis-readonly' }));
  clearLog(root);
  const r1p = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  const e1p = parseOut(r1p.stdout);
  check(e1p && e1p.hookSpecificOutput.permissionDecision === 'deny', 'E1 production: deny');

  const contaminatedIndex = path.join(os.tmpdir(), `cow-contaminated-index-${Date.now()}`);
  const r1env = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } },
    { GIT_INDEX_FILE: contaminatedIndex }, ENFORCE);
  const e1env = parseOut(r1env.stdout);
  check(e1env && e1env.hookSpecificOutput.permissionDecision === 'deny', 'E1 production: ignores inherited Git index env');

  if (process.platform === 'win32' && fs.existsSync('C:\\Program Files\\Git\\cmd\\git.exe')) {
    const r1path = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } },
      { PATH: '', Path: '' }, ENFORCE);
    const e1path = parseOut(r1path.stdout);
    check(e1path && e1path.hookSpecificOutput.permissionDecision === 'deny', 'E1 production: finds Git when hook PATH omits it');
  }
}

// E2: Edit/Write outside current unit allowedPaths during implementing.
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n', 'lib/x.js': 'x\n' });
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const r2s = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'lib/x.js' } }, {}, ENFORCE);
  const e2s = parseOut(r2s.stdout);
  check(e2s && e2s.hookSpecificOutput.permissionDecision === 'ask', 'E2 standard: ask');

  writeState(root, mkState({ mode: 'production', phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const r2p = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'lib/x.js' } }, {}, ENFORCE);
  const e2p = parseOut(r2p.stdout);
  check(e2p && e2p.hookSpecificOutput.permissionDecision === 'deny', 'E2 production: deny');
}

// E3: Edit/Write during implementing with no allowedPaths boundary.
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'lib/x.js': 'x\n' });
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit([]) }));
  clearLog(root);
  const r3s = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'lib/x.js' } }, {}, ENFORCE);
  const e3s = parseOut(r3s.stdout);
  check(e3s && e3s.hookSpecificOutput.permissionDecision === 'ask', 'E3 standard: ask');
  check(e3s && e3s.hookSpecificOutput.permissionDecisionReason.startsWith('COW E3:'), 'E3 reason text');

  writeState(root, mkState({ mode: 'production', phase: 'implementing', currentUnit: mkUnit([]) }));
  clearLog(root);
  const r3p = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'lib/x.js' } }, {}, ENFORCE);
  const e3p = parseOut(r3p.stdout);
  check(e3p && e3p.hookSpecificOutput.permissionDecision === 'deny', 'E3 production: deny');
}

// E4: repo/debug investigator attempts Edit/Write outside COW workspace (deny both).
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n' });
  for (const ag of ['cow-repo-investigator', 'cow-debug-investigator']) {
    writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
    clearLog(root);
    const r = callHook(dir, 'pre-tool-use',
      { tool_name: 'Write', tool_input: { file_path: 'src/a.js' }, agent_type: ag }, {}, ENFORCE);
    const e = parseOut(r.stdout);
    check(e && e.hookSpecificOutput.permissionDecision === 'deny', `E4 ${ag}: deny`);
    check(e && e.hookSpecificOutput.permissionDecisionReason.startsWith('COW E4:'), `E4 ${ag}: reason text`);
  }
  // standard mode also deny (E4 is deny in both modes)
  writeState(root, mkState({ mode: 'standard', phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const r4s = callHook(dir, 'pre-tool-use',
    { tool_name: 'Write', tool_input: { file_path: 'src/a.js' }, agent_type: 'cow-debug-investigator' }, {}, ENFORCE);
  const e4s = parseOut(r4s.stdout);
  check(e4s && e4s.hookSpecificOutput.permissionDecision === 'deny', 'E4 standard: deny (deny in both modes)');
}

// E5: production Edit/Write on planned-sequential/delegated-batch without an
// executable approved plan (plan.status approved/executing/done AND non-empty
// plan.path). No plan contents are read.
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n' });

  // standard mode: E5 is "none" -> no enforcement even without approved plan.
  writeState(root, mkState({ mode: 'standard', phase: 'implementing',
    implementationRoute: 'planned-sequential', plan: { status: 'drafting', path: null },
    currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const r5std = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  check(r5std.stdout === '', 'E5 standard: none (no enforcement)');

  // production, drafting plan, planned-sequential -> deny (no approved status).
  writeState(root, mkState({ mode: 'production', phase: 'implementing',
    implementationRoute: 'planned-sequential', plan: { status: 'drafting', path: null },
    currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const r5p = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  const e5p = parseOut(r5p.stdout);
  check(e5p && e5p.hookSpecificOutput.permissionDecision === 'deny', 'E5 production planned-sequential drafting: deny');
  check(e5p && e5p.hookSpecificOutput.permissionDecisionReason.startsWith('COW E5:'), 'E5 reason text');

  // production, delegated-batch, drafting -> deny.
  writeState(root, mkState({ mode: 'production', phase: 'implementing',
    implementationRoute: 'delegated-batch', plan: { status: 'drafting', path: null },
    currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const r5b = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  const e5b = parseOut(r5b.stdout);
  check(e5b && e5b.hookSpecificOutput.permissionDecision === 'deny', 'E5 production delegated-batch drafting: deny');

  // production, approved status but NULL plan path -> deny (not executable).
  writeState(root, mkState({ mode: 'production', phase: 'implementing',
    implementationRoute: 'planned-sequential', plan: { status: 'approved', path: null },
    currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const r5nullPath = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  const e5nullPath = parseOut(r5nullPath.stdout);
  check(e5nullPath && e5nullPath.hookSpecificOutput.permissionDecision === 'deny',
    'E5 production approved status + null plan.path: deny (no executable plan)');

  // production, approved status + empty-string plan path -> deny (not executable).
  writeState(root, mkState({ mode: 'production', phase: 'implementing',
    implementationRoute: 'planned-sequential', plan: { status: 'approved', path: '' },
    currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const r5emptyPath = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  const e5emptyPath = parseOut(r5emptyPath.stdout);
  check(e5emptyPath && e5emptyPath.hookSpecificOutput.permissionDecision === 'deny',
    'E5 production approved status + empty plan.path: deny (no executable plan)');

  // production, approved status + non-empty plan path -> no E5 (in-scope edit).
  writeState(root, mkState({ mode: 'production', phase: 'implementing',
    implementationRoute: 'planned-sequential', plan: { status: 'approved', path: 'plan.md' },
    currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const r5ok = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  check(r5ok.stdout === '', 'E5 production approved + non-empty plan.path: no enforcement (in-scope)');

  // production, executing status + non-empty plan path -> no E5 (in-scope).
  writeState(root, mkState({ mode: 'production', phase: 'implementing',
    implementationRoute: 'delegated-batch', plan: { status: 'executing', path: 'plan.md' },
    currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const r5exec = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  check(r5exec.stdout === '', 'E5 production executing + non-empty plan.path (delegated-batch): no enforcement (in-scope)');
}

// E6: structured COW agent + simple git commit -> deny both.
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n' });
  for (const ag of ['cow-implementer', 'cow-reviewer', 'cow-repo-investigator', 'cow-debug-investigator']) {
    writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
    clearLog(root);
    const r = callHook(dir, 'pre-tool-use',
      { tool_name: 'Bash', tool_input: { command: 'git commit -m "msg"' }, agent_type: ag }, {}, ENFORCE);
    const e = parseOut(r.stdout);
    check(e && e.hookSpecificOutput.permissionDecision === 'deny', `E6 ${ag}: deny`);
    check(e && e.hookSpecificOutput.permissionDecisionReason.startsWith('COW E6:'), `E6 ${ag}: reason text`);
  }
}

// E7: broad staging during a controlled unit (implementing).
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n' });
  for (const cmd of ['git add .', 'git add -A', 'git add --all', 'git commit -a']) {
    writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
    clearLog(root);
    const rS = callHook(dir, 'pre-tool-use', { tool_name: 'Bash', tool_input: { command: cmd } }, {}, ENFORCE);
    const eS = parseOut(rS.stdout);
    check(eS && eS.hookSpecificOutput.permissionDecision === 'ask', `E7 standard "${cmd}": ask`);
    check(eS && eS.hookSpecificOutput.permissionDecisionReason.startsWith('COW E7:'), `E7 standard "${cmd}": reason text`);

    writeState(root, mkState({ mode: 'production', phase: 'implementing', currentUnit: mkUnit(['src/']) }));
    clearLog(root);
    const rP = callHook(dir, 'pre-tool-use', { tool_name: 'Bash', tool_input: { command: cmd } }, {}, ENFORCE);
    const eP = parseOut(rP.stdout);
    check(eP && eP.hookSpecificOutput.permissionDecision === 'deny', `E7 production "${cmd}": deny`);
  }
  // E7 NOT during implementing (triage) -> no enforcement.
  writeState(root, mkState({ phase: 'triage' }));
  clearLog(root);
  const r7tri = callHook(dir, 'pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'git add .' } }, {}, ENFORCE);
  check(r7tri.stdout === '', 'E7 not during implementing: no enforcement');
  // git add src/a.js (specific, not broad) -> no E7.
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const r7spec = callHook(dir, 'pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'git add src/a.js' } }, {}, ENFORCE);
  check(r7spec.stdout === '', 'E7 specific git add (not broad): no enforcement');
}

// ── 5. State classes: absent / inactive / corrupt fail open in enforce ──────
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n' });

  // ABSENT (no state) in enforce -> exit 0, empty stdout.
  const rAbs = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  check(rAbs.status === 0, 'enforce ABSENT: exits 0');
  check(rAbs.stdout === '', 'enforce ABSENT: empty stdout');

  // INACTIVE in enforce -> exit 0, empty stdout.
  const inactive = mkState({}); inactive.active = false;
  writeState(root, inactive, false);
  const rIn = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  check(rIn.status === 0, 'enforce INACTIVE: exits 0');
  check(rIn.stdout === '', 'enforce INACTIVE: empty stdout');

  // ACTIVE_CORRUPT (marker present, state missing) in enforce -> exit 0, empty stdout, R8 obs.
  clearLog(root);
  try { fs.unlinkSync(stateFile(root)); } catch {}
  writeState(root, null, true);
  const rCo = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  check(rCo.status === 0, 'enforce ACTIVE_CORRUPT: exits 0 (fail open)');
  check(rCo.stdout === '', 'enforce ACTIVE_CORRUPT: empty stdout (no enforcement)');
  const coLog = JSON.parse(fs.readFileSync(obsLogFile(root), 'utf8'));
  check(coLog.matchedRuleIds.includes('R8'), 'enforce ACTIVE_CORRUPT: logs R8');
  check(coLog.actualDecision === 'none', 'enforce ACTIVE_CORRUPT: actualDecision none');

  // ACTIVE_CORRUPT (malformed json) in enforce -> fail open.
  clearLog(root);
  fs.writeFileSync(stateFile(root), 'not json');
  const rMj = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  check(rMj.status === 0 && rMj.stdout === '', 'enforce malformed-json: fail open');
}

// ── 6. Missing / ambiguous / non-COW metadata ───────────────────────────────
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n' });

  // No agent_type (controller) editing inside unit during implementing -> no E4, no E2 (in-scope).
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const rNoAg = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  check(rNoAg.stdout === '', 'no metadata (controller) in-scope edit: no enforcement');

  // Non-COW agent -> not subject to E4/E6.
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const rOther = callHook(dir, 'pre-tool-use',
    { tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' }, agent_type: 'general-purpose' }, {}, ENFORCE);
  check(rOther.stdout === '', 'non-COW agent git commit: no E6 (not a structured COW agent)');

  // Ambiguous agent string that contains "investigator" but is not the exact id -> not E4.
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const rAmb = callHook(dir, 'pre-tool-use',
    { tool_name: 'Write', tool_input: { file_path: 'src/a.js' }, agent_type: 'my-investigator-tool' }, {}, ENFORCE);
  check(rAmb.stdout === '', 'ambiguous agent substring is not treated as a COW investigator');

  // Empty agent_type string -> controller, no E4.
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const rEmpty = callHook(dir, 'pre-tool-use',
    { tool_name: 'Write', tool_input: { file_path: 'src/a.js' }, agent_type: '' }, {}, ENFORCE);
  check(rEmpty.stdout === '', 'empty agent_type: no E4 (in-scope, controller)');
}

// ── 7. Path boundary lookalikes + tracked vs untracked ──────────────────────
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n', 'src/nested/b.js': 'b\n', 'src-old/c.js': 'c\n' });

  // allowed dir src/: src/a.js inside, src/nested/a.js inside, src-old/a.js outside.
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));

  clearLog(root);
  const rIn = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  check(rIn.stdout === '', 'lookalike: src/a.js is inside src/');

  clearLog(root);
  const rNested = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/nested/b.js' } }, {}, ENFORCE);
  check(rNested.stdout === '', 'lookalike: src/nested/b.js is inside src/');

  clearLog(root);
  const rOld = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src-old/c.js' } }, {}, ENFORCE);
  const eOld = parseOut(rOld.stdout);
  check(eOld && eOld.hookSpecificOutput.permissionDecision === 'ask', 'lookalike: src-old/c.js is outside src/ (E2)');

  // Tracked vs untracked during diagnosis-readonly: E1 requires tracked.
  writeState(root, mkState({ phase: 'diagnosis-readonly' }));
  fs.writeFileSync(path.join(dir, 'untracked.js'), 'u\n'); // not committed
  clearLog(root);
  const rUntr = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'untracked.js' } }, {}, ENFORCE);
  check(rUntr.stdout === '', 'E1: untracked file during diagnosis-readonly is not enforced (not tracked)');
  clearLog(root);
  const rTr = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  const eTr = parseOut(rTr.stdout);
  check(eTr && eTr.hookSpecificOutput.permissionDecision === 'ask', 'E1: tracked file during diagnosis-readonly is enforced');
}

// ── 8. Supported and unsupported Bash shapes ────────────────────────────────
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n' });
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));

  // Unsupported shapes (fail open: no E6 even for a COW agent).
  const unsupported = [
    'git commit -m "a && b"',     // compound &&
    'git commit -m "a || b"',     // compound ||
    'git commit; echo done',      // semicolon
    'git commit | tee log',       // pipe
    'echo `git commit`',          // backtick (also exe=echo)
    'git commit $(echo m)',       // command substitution
    'git commit < file',          // input redirect
    'git commit > out.txt',       // output redirect
    'FOO=bar git commit -m "x"',  // env-prefixed
    'bash -c "git commit"',       // nested shell
    'sh -c "git commit"',         // nested shell
    'git commit -m "x"\ngit push',// multiline
    'echo git commit',            // deceptive substring (exe=echo)
  ];
  for (const cmd of unsupported) {
    clearLog(root);
    const r = callHook(dir, 'pre-tool-use',
      { tool_name: 'Bash', tool_input: { command: cmd }, agent_type: 'cow-implementer' }, {}, ENFORCE);
    check(r.stdout === '', `unsupported bash shape not enforced: ${JSON.stringify(cmd)}`);
  }

  // git commit -am "msg" is a simple command: E6 fires for an agent (any git
  // commit), but the combined -am flag is NOT E7's exact -a. Verify the -am
  // flag alone does not create an E7 broad-staging decision for a non-agent.
  clearLog(root);
  const rAm = callHook(dir, 'pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'git commit -am "msg"' } }, {}, ENFORCE);
  check(rAm.stdout === '', 'git commit -am by non-agent: not E7 (combined flag is not exact -a), not E6 (no agent)');

  // Supported shapes that ARE enforced.
  clearLog(root);
  const rSup = callHook(dir, 'pre-tool-use',
    { tool_name: 'Bash', tool_input: { command: 'git commit -m "msg"' }, agent_type: 'cow-implementer' }, {}, ENFORCE);
  const eSup = parseOut(rSup.stdout);
  check(eSup && eSup.hookSpecificOutput.permissionDecision === 'deny', 'supported: simple git commit by agent -> E6 deny');

  // Benign git commands that are NOT commit/add-broad -> no enforcement.
  for (const cmd of ['git status', 'git diff', 'git log --oneline', 'npm test', 'ls -la', 'node tests/x.test.mjs']) {
    clearLog(root);
    const r = callHook(dir, 'pre-tool-use', { tool_name: 'Bash', tool_input: { command: cmd } }, {}, ENFORCE);
    check(r.stdout === '', `benign bash not enforced: ${JSON.stringify(cmd)}`);
  }
}

// ── 9. Controller / no-agent behavior ───────────────────────────────────────
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n' });

  // Controller editing inside unit -> no enforcement.
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const rCtrl = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } }, {}, ENFORCE);
  check(rCtrl.stdout === '', 'controller in-scope edit: no enforcement');

  // Controller running git commit (no agent metadata) -> NOT E6 (only agents are E6-bound).
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const rCtrlCommit = callHook(dir, 'pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' } }, {}, ENFORCE);
  check(rCtrlCommit.stdout === '', 'controller git commit: no E6 (E6 is agent-bound)');

  // Controller broad staging during implementing -> E7 (E7 is not agent-bound).
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const rCtrlAdd = callHook(dir, 'pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'git add .' } }, {}, ENFORCE);
  const eCtrlAdd = parseOut(rCtrlAdd.stdout);
  check(eCtrlAdd && eCtrlAdd.hookSpecificOutput.permissionDecision === 'ask', 'controller broad staging -> E7 (not agent-bound)');
}

// ── 10. No allow / defer / deprecated fields, no exit 2 ─────────────────────
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n', 'lib/x.js': 'x\n' });
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const r = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'lib/x.js' } }, {}, ENFORCE);
  check(r.status !== 2, 'enforce never exits 2');
  const txt = r.stdout;
  const e = parseOut(txt);
  // Precise decision-value checks (the word "allowed" legitimately appears in
  // reason text, so match the decision value, not a loose substring).
  check(!e || e.hookSpecificOutput.permissionDecision !== 'allow', 'no "allow" decision emitted');
  check(!e || e.hookSpecificOutput.permissionDecision !== 'defer', 'no "defer" decision emitted');
  check(!/updatedInput/i.test(txt), 'no updatedInput field emitted');
  // Only the two allowed top-level-ish fields under hookSpecificOutput.
  check(e && Object.keys(e).length === 1 && 'hookSpecificOutput' in e, 'output has only hookSpecificOutput top-level');
  check(e && Object.keys(e.hookSpecificOutput).length === 3
    && 'hookEventName' in e.hookSpecificOutput
    && 'permissionDecision' in e.hookSpecificOutput
    && 'permissionDecisionReason' in e.hookSpecificOutput,
    'hookSpecificOutput has exactly the 3 allowed fields');
}

// ── 11. Observation actualDecision and reasonCode ───────────────────────────
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n', 'lib/x.js': 'x\n' });
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'lib/x.js' } }, {}, ENFORCE);
  const logObj = JSON.parse(fs.readFileSync(obsLogFile(root), 'utf8'));
  check(logObj.actualDecision === 'ask', 'observation actualDecision is ask');
  check(logObj.reasonCode === 'E2', 'observation reasonCode is E2');
  check(logObj.matchedRuleIds.includes('E2'), 'observation matchedRuleIds includes E2');
  // The bounded target path is the subjectValue (consistent with Phase 4);
  // full Bash commands, source contents, prompts, and state are never logged.
  check(logObj.subjectKind === 'path', 'observation subjectKind is path');
  check(!('command' in logObj) && !('tool_input' in logObj) && !('prompt' in logObj),
    'observation never carries full command/prompt/state fields');
  // reasonCode sits right after actualDecision in key order.
  const keys = Object.keys(logObj);
  check(keys.indexOf('reasonCode') === keys.indexOf('actualDecision') + 1, 'reasonCode follows actualDecision in key order');
  // shadow observations still have NO reasonCode field (byte-identical).
  clearLog(root);
  callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'lib/x.js' } }); // default shadow
  const shLog = JSON.parse(fs.readFileSync(obsLogFile(root), 'utf8'));
  check(!('reasonCode' in shLog), 'shadow observation has no reasonCode (byte-identical)');
  check(shLog.actualDecision === 'none', 'shadow observation actualDecision remains none');
}

// ── 12. Benign fixture corpus (0 ask / 0 deny) ──────────────────────────────
const fixtureFiles = fs.existsSync(FIXTURE_DIR)
  ? fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json')).sort()
  : [];
let benignAsk = 0;
let benignDeny = 0;
for (const f of fixtureFiles) {
  const fx = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, f), 'utf8'));
  const { dir, root } = freshRepo();
  // Ignore scratch so it never gets tracked.
  fs.writeFileSync(path.join(dir, '.gitignore'), '.cost-oriented-agentic-workflow/\ntmp/\n');
  for (const [rel, content] of Object.entries(fx.setupFiles || {})) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  spawnSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8' });
  spawnSync('git', ['-C', dir, 'commit', '-qm', 'setup'], { encoding: 'utf8' });
  const state = mkState(fx.stateOverrides || {});
  writeState(root, state);
  clearLog(root);
  const r = callHook(dir, 'pre-tool-use', fx.payload, {}, ENFORCE);
  check(r.status === 0, `${f}: benign fixture exits 0`);
  if (r.stdout !== '') {
    const e = parseOut(r.stdout);
    if (e && e.hookSpecificOutput) {
      if (e.hookSpecificOutput.permissionDecision === 'ask') benignAsk += 1;
      if (e.hookSpecificOutput.permissionDecision === 'deny') benignDeny += 1;
    }
  }
  check(r.stdout === '', `${f}: benign fixture produced no ask/deny (got: ${r.stdout.trim() || '<empty>'})`);
}
check(fixtureFiles.length >= 5, `benign fixture corpus has at least 5 fixtures (${fixtureFiles.length})`);
check(benignAsk === 0, `benign corpus: 0 ask decisions (got ${benignAsk})`);
check(benignDeny === 0, `benign corpus: 0 deny decisions (got ${benignDeny})`);

// ── 13. Reason byte length under 256 ────────────────────────────────────────
{
  const { dir, root } = freshRepo();
  trackFiles(dir, { 'src/a.js': 'a\n', 'lib/x.js': 'x\n' });
  writeState(root, mkState({ phase: 'implementing', currentUnit: mkUnit(['src/']) }));
  clearLog(root);
  const r = callHook(dir, 'pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: 'lib/x.js' } }, {}, ENFORCE);
  const e = parseOut(r.stdout);
  check(e && Buffer.byteLength(e.hookSpecificOutput.permissionDecisionReason, 'utf8') < 256, 'reason under 256 UTF-8 bytes');
}

// Cleanup tmp dirs
for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
console.log(`Phase 5A enforcement tests: ${passes} passed, ${fails} failed.`);
if (fails > 0) process.exit(1);

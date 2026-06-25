#!/usr/bin/env node
// Deterministic, zero-dependency behavioral tests for cow-state.mjs.
// Uses throwaway git repositories and a linked worktree under the OS temp dir;
// never touches the developer's repository state. Run: npm run test:foundation
//   (or: node tests/state.test.mjs)

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(here, '../skills/execution-routing/scripts/cow-state.mjs');

let fails = 0;
let passes = 0;
const check = (cond, msg) => { if (cond) { passes += 1; } else { fails += 1; console.error('FAIL: ' + msg); } };

const tmps = [];
function freshRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cow-state-'));
  tmps.push(dir);
  const g = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  g('init', '-q');
  g('config', 'user.email', 'test@example.com');
  g('config', 'user.name', 'test');
  g('config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(dir, 'README.md'), 'seed\n');
  g('add', '-A');
  g('commit', '-qm', 'seed');
  // Canonical root, matching what cow-state resolves via --show-toplevel.
  const root = g('rev-parse', '--show-toplevel').stdout.trim();
  return { dir, root, git: g };
}
const runDir = (root) => path.join(root, '.cost-oriented-agentic-workflow', 'run');
const stateFile = (root) => path.join(runDir(root), 'state.json');
const markerFile = (root) => path.join(runDir(root), 'state.active');
const readState = (root) => JSON.parse(fs.readFileSync(stateFile(root), 'utf8'));

function cow(cwd, ...args) {
  const r = spawnSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// ── absent state ─────────────────────────────────────────────────────────────
{
  const { dir, root } = freshRepo();
  const r = cow(dir, 'status');
  check(r.status === 0, 'absent: status exits 0');
  check(/absent/.test(r.stdout), 'absent: status reports absent');
  const j = cow(dir, 'status', '--json');
  check(j.status === 0 && /"classification": "ABSENT"/.test(j.stdout), 'absent: --json classification ABSENT');
  check(!fs.existsSync(stateFile(root)), 'absent: status does not create state.json');
}

// ── initialization + valid active state ──────────────────────────────────────
{
  const { dir, root } = freshRepo();
  const r = cow(dir, 'init');
  check(r.status === 0, 'init: exits 0');
  check(fs.existsSync(stateFile(root)), 'init: creates state.json');
  check(fs.existsSync(markerFile(root)), 'init: creates the active marker');
  check(fs.readFileSync(path.join(runDir(root), '.gitignore'), 'utf8').trim() === '*', 'init: run dir self-ignores');
  const s = readState(root);
  check(s.schemaVersion === 1 && s.active === true && s.phase === 'triage' && s.mode === 'standard', 'init: valid default active state');
  check(typeof s.timestamps.createdAt === 'string' && typeof s.timestamps.updatedAt === 'string', 'init: timestamps present');
  const st = cow(dir, 'status');
  check(st.status === 0 && /active/.test(st.stdout) && /phase=triage/.test(st.stdout), 'active-valid: status reports active position');
  const dbl = cow(dir, 'init');
  check(dbl.status !== 0, 'init: refuses to clobber an already-active workflow');
}

// ── inactive state + completion restrictions ─────────────────────────────────
{
  const { dir, root } = freshRepo();
  cow(dir, 'init');
  const c = cow(dir, 'complete');
  check(c.status === 0, 'complete: exits 0 from a normal phase');
  check(readState(root).active === false, 'complete: sets active=false');
  check(!fs.existsSync(markerFile(root)), 'complete: removes the active marker');
  const st = cow(dir, 'status');
  check(st.status === 0 && /inactive/.test(st.stdout), 'inactive: status reports inactive (exit 0)');
  const tr = cow(dir, 'transition', '--phase', 'implementing');
  check(tr.status !== 0, 'inactive: transition is rejected after completion');
}

// ── malformed (unclassified JSON) preservation ───────────────────────────────
{
  const { dir, root } = freshRepo();
  cow(dir, 'init');
  const garbage = '{ this is : not json';
  fs.writeFileSync(stateFile(root), garbage);
  const st = cow(dir, 'status');
  check(st.status === 3, 'malformed: status exits 3');
  check(fs.readFileSync(stateFile(root), 'utf8') === garbage, 'malformed: state.json is not overwritten');
  const tr = cow(dir, 'transition', '--phase', 'planning');
  check(tr.status === 3 && fs.readFileSync(stateFile(root), 'utf8') === garbage, 'malformed: transition fails and preserves the file');
}

// ── ACTIVE_CORRUPT: marker present but state.json missing ────────────────────
{
  const { dir, root } = freshRepo();
  cow(dir, 'init');
  fs.unlinkSync(stateFile(root)); // marker survives
  const st = cow(dir, 'status');
  check(st.status === 3, 'active-corrupt: marker-without-state exits 3');
  check(/marker/.test(st.stderr), 'active-corrupt: reports the active-marker evidence');
  // reconstruct recovers explicitly
  const rc = cow(dir, 'init', '--reconstruct');
  check(rc.status === 0 && fs.existsSync(stateFile(root)), 'active-corrupt: init --reconstruct recovers');
}

// ── schema-version rejection ─────────────────────────────────────────────────
{
  const { dir, root } = freshRepo();
  cow(dir, 'init');
  const s = readState(root); s.schemaVersion = 2;
  fs.writeFileSync(stateFile(root), JSON.stringify(s));
  const st = cow(dir, 'status');
  check(st.status === 3, 'schema-version: a future schemaVersion is rejected (exit 3)');
  check(JSON.parse(fs.readFileSync(stateFile(root), 'utf8')).schemaVersion === 2, 'schema-version: corrupt file is not overwritten');
}

// ── legal + illegal transitions, no mutation after failure ───────────────────
{
  const { dir, root } = freshRepo();
  cow(dir, 'init');
  check(cow(dir, 'transition', '--phase', 'planning').status === 0, 'legal: triage -> planning');
  check(cow(dir, 'transition', '--phase', 'implementing').status === 0, 'legal: planning -> implementing');
  check(readState(root).phase === 'implementing', 'legal: phase updated to implementing');
  const before = fs.readFileSync(stateFile(root), 'utf8');
  const bad = cow(dir, 'transition', '--phase', 'finishing'); // implementing -> finishing is illegal
  check(bad.status !== 0, 'illegal: implementing -> finishing rejected');
  check(fs.readFileSync(stateFile(root), 'utf8') === before, 'illegal: state is not mutated after a failed transition');
  check(cow(dir, 'transition', '--phase', 'verifying').status === 0, 'legal: implementing -> verifying');
  check(cow(dir, 'transition', '--phase', 'idle').status === 0, 'legal: verifying -> idle (light path)');
}

// ── root-cause gate on the debug lane ────────────────────────────────────────
{
  const { dir, root } = freshRepo();
  cow(dir, 'init');
  check(cow(dir, 'transition', '--phase', 'diagnosis-readonly').status === 0, 'debug: triage -> diagnosis-readonly');
  check(readState(root).processLane === 'debug', 'debug: diagnosis entry sets the debug lane');
  const blocked = cow(dir, 'transition', '--phase', 'implementing');
  check(blocked.status !== 0, 'debug: implementing is blocked while root cause is pending');
  check(cow(dir, 'root-cause', '--status', 'evidenced').status === 0, 'debug: root-cause evidenced recorded');
  check(cow(dir, 'transition', '--phase', 'implementing').status === 0, 'debug: implementing allowed once root cause is evidenced');
}

// ── plan-required route gate ─────────────────────────────────────────────────
{
  const { dir, root } = freshRepo();
  cow(dir, 'init');
  cow(dir, 'route', '--implementation', 'planned-sequential');
  cow(dir, 'transition', '--phase', 'planning');
  const early = cow(dir, 'transition', '--phase', 'implementing');
  check(early.status !== 0, 'plan-gate: planned route cannot implement before plan approval');
  cow(dir, 'plan', '--approve', '--path', 'docs/plans/p.md');
  check(cow(dir, 'transition', '--phase', 'implementing').status === 0, 'plan-gate: implementing allowed after plan approval');
}

// ── invalid route combination ────────────────────────────────────────────────
{
  const { dir } = freshRepo();
  cow(dir, 'init');
  cow(dir, 'route', '--discovery', 'parallel-investigators');
  const bad = cow(dir, 'route', '--implementation', 'inline');
  check(bad.status !== 0, 'route: parallel-investigators + inline is rejected (02 B.4)');
}

// ── JSON and oneline status ──────────────────────────────────────────────────
{
  const { dir } = freshRepo();
  cow(dir, 'init');
  const j = cow(dir, 'status', '--json');
  let parsed = null; try { parsed = JSON.parse(j.stdout); } catch { /* parsed stays null */ }
  check(parsed && parsed.schemaVersion === 1 && parsed.active === true, 'status --json: emits parseable state');
  const o = cow(dir, 'status', '--oneline');
  check(o.status === 0 && o.stdout.trim().split('\n').length === 1 && /phase=triage/.test(o.stdout), 'status --oneline: single line with position tokens');
}

// ── path normalization + rejection ───────────────────────────────────────────
{
  const { dir, root } = freshRepo();
  cow(dir, 'init');
  const okp = cow(dir, 'unit', '--id', '1', '--paths', 'src\\a.ts,./src/b.ts');
  check(okp.status === 0, 'paths: mixed-separator relative paths accepted');
  const s = readState(root);
  check(JSON.stringify(s.currentUnit.allowedPaths) === JSON.stringify(['src/a.ts', 'src/b.ts']), 'paths: normalized to forward-slash repo-relative');
  const before = fs.readFileSync(stateFile(root), 'utf8');
  check(cow(dir, 'unit', '--id', '2', '--paths', '/etc/passwd').status !== 0, 'paths: POSIX absolute rejected');
  check(cow(dir, 'unit', '--id', '2', '--paths', 'C:\\Windows\\x').status !== 0, 'paths: Windows absolute rejected');
  check(cow(dir, 'unit', '--id', '2', '--paths', '../escape.ts').status !== 0, 'paths: traversal rejected');
  check(fs.readFileSync(stateFile(root), 'utf8') === before, 'paths: rejected path leaves state unmutated');
}

// ── attempt counter boundaries ───────────────────────────────────────────────
{
  const { dir, root } = freshRepo();
  cow(dir, 'init');
  check(cow(dir, 'attempt', '--inc').status === 0, 'attempt: inc 0 -> 1');
  check(cow(dir, 'attempt', '--inc').status === 0, 'attempt: inc 1 -> 2');
  check(readState(root).attempts.implementer === 2, 'attempt: counter at max (2)');
  const over = cow(dir, 'attempt', '--inc');
  check(over.status !== 0, 'attempt: inc beyond max is rejected (retry-exhausted)');
  check(readState(root).attempts.implementer === 2, 'attempt: rejected inc does not exceed the ceiling');
  check(cow(dir, 'attempt', '--reset').status === 0 && readState(root).attempts.implementer === 0, 'attempt: reset -> 0');
}

// ── remediation-wave boundaries ──────────────────────────────────────────────
{
  const { dir, root } = freshRepo();
  cow(dir, 'init');
  cow(dir, 'review', '--start');
  check(cow(dir, 'review', '--wave').status === 0, 'waves: wave 0 -> 1');
  check(cow(dir, 'review', '--wave').status === 0, 'waves: wave 1 -> 2');
  const over = cow(dir, 'review', '--wave');
  check(over.status !== 0, 'waves: third wave is rejected (remediation-exhausted)');
  check(readState(root).remediationWaves.count === 2, 'waves: counter capped at 2');
}

// ── blocked state + cannot silently complete ─────────────────────────────────
{
  const { dir, root } = freshRepo();
  cow(dir, 'init');
  cow(dir, 'transition', '--phase', 'implementing');
  const b = cow(dir, 'block', '--reason', 'retry-exhausted', '--artifact', '.cost-oriented-agentic-workflow/run/diag.md');
  check(b.status === 0, 'blocked: block exits 0');
  const s = readState(root);
  check(s.phase === 'blocked' && s.blocked.code === 'retry-exhausted', 'blocked: phase + code recorded');
  check(s.blocked.artifactPath === '.cost-oriented-agentic-workflow/run/diag.md' && s.blocked.priorPhase === 'implementing', 'blocked: artifact path + prior phase recorded');
  const c = cow(dir, 'complete');
  check(c.status !== 0, 'blocked: a blocked workflow cannot be completed');
  const resume = cow(dir, 'transition', '--phase', 'implementing');
  check(resume.status === 0 && readState(root).phase === 'implementing', 'blocked: resume returns to the prior phase');
}

// ── atomic-write cleanup: no leftover temp files ─────────────────────────────
{
  const { dir, root } = freshRepo();
  cow(dir, 'init');
  cow(dir, 'transition', '--phase', 'planning');
  cow(dir, 'route', '--implementation', 'delegated');
  cow(dir, 'unit', '--id', '1', '--paths', 'src/a.ts');
  const leftovers = fs.readdirSync(runDir(root)).filter((f) => f.includes('.tmp'));
  check(leftovers.length === 0, 'atomic: no leftover .tmp files after a sequence of writes');
}

// ── separate state per linked worktree ───────────────────────────────────────
{
  const { dir, root, git } = freshRepo();
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'cow-state-wt-')); tmps.push(wt);
  fs.rmSync(wt, { recursive: true, force: true }); // git worktree add needs a non-existent path
  const add = git('worktree', 'add', '-q', '-b', 'wt-branch', wt);
  check(add.status === 0, 'worktree: linked worktree created');
  const wtRoot = spawnSync('git', ['-C', wt, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
  cow(dir, 'init', '--mode', 'standard');
  cow(wt, 'init', '--mode', 'production');
  check(fs.existsSync(stateFile(root)) && fs.existsSync(stateFile(wtRoot)), 'worktree: each checkout has its own state.json');
  check(stateFile(root) !== stateFile(wtRoot), 'worktree: state paths are distinct');
  // Mutating the worktree state must not affect the main state.
  cow(wt, 'transition', '--phase', 'planning');
  check(readState(root).phase === 'triage' && readState(wtRoot).phase === 'planning', 'worktree: state is independent per checkout');
  check(readState(root).mode === 'standard' && readState(wtRoot).mode === 'production', 'worktree: modes are independent');
  git('worktree', 'remove', '--force', wt);
}

// ── reconstruction from the ledger anchor ────────────────────────────────────
{
  const { dir, root } = freshRepo();
  fs.mkdirSync(runDir(root), { recursive: true });
  fs.writeFileSync(path.join(runDir(root), 'progress.md'),
    'PLAN_FILE: docs/plans/p.md\nMODE: production\nCOMMIT_POLICY: controller-per-unit\nBASE_BRANCH: main\nMERGE_BASE_SHA: abc123\n\n'
    + 'Unit 1 | route=delegate | risk=low | files=src/a.ts\nreview=required:clean | waves=0 | verify=pass\ncommit=base..head\n');
  const rc = cow(dir, 'init', '--reconstruct');
  check(rc.status === 0, 'reconstruct: exits 0 from an anchored ledger');
  const s = readState(root);
  check(s.mode === 'production' && s.plan.path === 'docs/plans/p.md' && s.baseBranch === 'main' && s.mergeBaseSha === 'abc123', 'reconstruct: anchor fields restored');
  check(s.phase === 'implementing' && s.plan.status === 'executing', 'reconstruct: a unit in the ledger yields an executing/implementing state');
}

// ── reconstruction preserves exhausted remediation budget ────────────────────
{
  const { dir, root } = freshRepo();
  fs.mkdirSync(runDir(root), { recursive: true });
  fs.writeFileSync(path.join(runDir(root), 'progress.md'),
    'PLAN_FILE: docs/plans/p.md\nMODE: standard\nCOMMIT_POLICY: controller-per-unit\nBASE_BRANCH: main\nMERGE_BASE_SHA: abc\n\n'
    + 'Unit 1 | route=delegate | risk=high | files=src/a.ts\nreview=required | waves=2 | verify=fail blocked\n');
  cow(dir, 'init', '--reconstruct');
  const s = readState(root);
  check(s.phase === 'blocked' && s.blocked.code === 'remediation-exhausted' && s.remediationWaves.count === 2,
    'reconstruct: an exhausted/blocked ledger stays blocked at waves=2');
}

// ── usage / invalid invocation ───────────────────────────────────────────────
{
  const { dir } = freshRepo();
  check(cow(dir).status !== 0, 'usage: no command exits non-zero');
  check(cow(dir, 'bogus').status !== 0, 'usage: unknown command exits non-zero');
  check(cow(dir, 'transition').status !== 0, 'usage: transition without --phase exits non-zero');
}

// ── cleanup + summary ────────────────────────────────────────────────────────
for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } }
console.log(`\nstate: ${passes} checks passed, ${fails} failed.`);
if (fails > 0) process.exit(1);
console.log('state foundation OK.');

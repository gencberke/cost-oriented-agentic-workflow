#!/usr/bin/env node
// Deterministic, zero-dependency behavioral tests for implementation-report.mjs.
// Uses throwaway git repositories under the OS temp dir; never touches the
// developer's repository. Run: npm run test:report
//   (or: node tests/implementation-report.test.mjs)

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(here, '../skills/execution-routing/scripts/implementation-report.mjs');
const UW = path.resolve(here, '../skills/execution-routing/scripts/unit-worktree.mjs');

let fails = 0, passes = 0;
const check = (cond, msg) => { if (cond) { passes += 1; } else { fails += 1; console.error('FAIL: ' + msg); } };

const tmps = [];
function freshRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cow-report-'));
  tmps.push(dir);
  const g = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  g('init', '-q');
  g('config', 'user.email', 'test@example.com');
  g('config', 'user.name', 'test');
  g('config', 'core.autocrlf', 'false');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'export const a = 1;\n');
  g('add', '-A');
  g('commit', '-qm', 'seed');
  const root = g('rev-parse', '--show-toplevel').stdout.trim();
  return { dir, root, git: g };
}
function impl(cwd, ...args) {
  const r = spawnSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function uw(cwd, ...args) {
  const r = spawnSync('node', [UW, ...args], { cwd, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', json: (() => { try { return JSON.parse(r.stdout); } catch { return null; } })() };
}
// Reports/briefs live in the self-ignored workflow workspace, exactly as in a
// real run — so they never count as a unit's source change in compare-worktree.
function ws(dir) { const d = path.join(dir, '.cost-oriented-agentic-workflow', 'run'); fs.mkdirSync(d, { recursive: true }); return d; }
const writeJson = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2));
const validReport = () => ({
  schemaVersion: 1, status: 'DONE', unitId: 'task-1',
  filesChanged: ['src/a.js'],
  outcomes: [{ id: 'outcome-1', status: 'DONE', behaviorImplemented: 'a now returns 2', acceptanceEvidence: ['unit test passes'] }],
  verification: [{ command: 'npm test', exitCode: 0, testCount: 3, summary: '3/3 passing' }],
  selfReview: { status: 'PASS', concerns: [] },
  remainingRisks: [], attemptsUsed: 1,
});

// ── valid schema + inspect + deterministic render ────────────────────────────
{
  const { dir } = freshRepo();
  const rp = path.join(ws(dir), 'report.json'); writeJson(rp, validReport());
  const v = impl(dir, 'validate', rp);
  check(v.status === 0 && /valid/.test(v.stdout), 'valid: schema validation passes');
  const ins = impl(dir, 'inspect', rp);
  let parsed = null; try { parsed = JSON.parse(ins.stdout); } catch { /* null */ }
  check(ins.status === 0 && parsed && parsed.unitId === 'task-1' && parsed.outcomes.length === 1, 'inspect: emits a parseable summary');
  const r1 = impl(dir, 'render', rp);
  const r2 = impl(dir, 'render', rp);
  check(r1.status === 0 && /# Implementation report: task-1/.test(r1.stdout), 'render: produces bounded markdown from valid JSON');
  check(r1.stdout === r2.stdout, 'render: deterministic (identical output across runs)');
  check(!/chain|secret|password/i.test(r1.stdout), 'render: no smuggled content');
}

// ── malformed JSON ───────────────────────────────────────────────────────────
{
  const { dir } = freshRepo();
  const rp = path.join(ws(dir), 'report.json'); fs.writeFileSync(rp, '{ not: valid json,,, ');
  const v = impl(dir, 'validate', rp);
  check(v.status !== 0 && /not valid JSON/i.test(v.stderr), 'malformed: invalid JSON is rejected');
  check(fs.readFileSync(rp, 'utf8') === '{ not: valid json,,, ', 'malformed: report file is preserved as evidence');
}

// ── wrong schema version ─────────────────────────────────────────────────────
{
  const { dir } = freshRepo();
  const rp = path.join(ws(dir), 'report.json'); const r = validReport(); r.schemaVersion = 2; writeJson(rp, r);
  const v = impl(dir, 'validate', rp);
  check(v.status !== 0 && /schemaVersion/.test(v.stderr), 'schema-version: a wrong schemaVersion is rejected');
}

// ── unsafe path in filesChanged ──────────────────────────────────────────────
{
  const { dir } = freshRepo();
  const rp = path.join(ws(dir), 'report.json'); const r = validReport(); r.filesChanged = ['../escape.js']; writeJson(rp, r);
  check(impl(dir, 'validate', rp).status !== 0, 'unsafe-path: traversal in filesChanged is rejected');
  const r2 = validReport(); r2.filesChanged = ['/etc/passwd']; writeJson(rp, r2);
  check(impl(dir, 'validate', rp).status !== 0, 'unsafe-path: absolute path in filesChanged is rejected');
}

// ── duplicate outcome id ─────────────────────────────────────────────────────
{
  const { dir } = freshRepo();
  const rp = path.join(ws(dir), 'report.json'); const r = validReport();
  r.outcomes = [
    { id: 'outcome-1', status: 'DONE', behaviorImplemented: 'x', acceptanceEvidence: [] },
    { id: 'outcome-1', status: 'DONE', behaviorImplemented: 'y', acceptanceEvidence: [] },
  ];
  writeJson(rp, r);
  const v = impl(dir, 'validate', rp);
  check(v.status !== 0 && /duplicate outcome/i.test(v.stderr), 'duplicate-outcome: repeated outcome id is rejected');
}

// ── missing brief outcome + unit-id agreement ────────────────────────────────
{
  const { dir } = freshRepo();
  const rp = path.join(ws(dir), 'report.json'); writeJson(rp, validReport());
  const bp = path.join(ws(dir), 'brief.md');
  fs.writeFileSync(bp, 'UNIT_ID: task-1\n\nOUTCOME_1: make a return 2\nOUTCOME_2: add a regression test\n');
  const v = impl(dir, 'validate', rp, '--brief', bp);
  check(v.status !== 0 && /outcome "2" is missing/i.test(v.stderr), 'brief: an unrepresented brief outcome is rejected');
  // unit-id mismatch
  const bp2 = path.join(ws(dir), 'brief2.md'); fs.writeFileSync(bp2, 'UNIT_ID: task-9\n\nOUTCOME_1: x\n');
  const v2 = impl(dir, 'validate', rp, '--brief', bp2);
  check(v2.status !== 0 && /does not match the brief/i.test(v2.stderr), 'brief: unit-id disagreement is rejected');
  // matching brief passes
  const bp3 = path.join(ws(dir), 'brief3.md'); fs.writeFileSync(bp3, 'UNIT_ID: task-1\n\nOUTCOME_1: a now returns 2\n');
  check(impl(dir, 'validate', rp, '--brief', bp3).status === 0, 'brief: a matching brief validates clean');
}

// ── DONE with an incomplete outcome ──────────────────────────────────────────
{
  const { dir } = freshRepo();
  const rp = path.join(ws(dir), 'report.json'); const r = validReport();
  r.status = 'DONE';
  r.outcomes = [{ id: 'outcome-1', status: 'PARTIAL', behaviorImplemented: 'half', acceptanceEvidence: [] }];
  writeJson(rp, r);
  const v = impl(dir, 'validate', rp);
  check(v.status !== 0 && /DONE but an outcome is not DONE/i.test(v.stderr), 'done-consistency: DONE with a non-DONE outcome is rejected');
}

// ── oversized report ─────────────────────────────────────────────────────────
{
  const { dir } = freshRepo();
  const rp = path.join(ws(dir), 'report.json'); const r = validReport();
  r.remainingRisks = Array(25).fill('x'.repeat(400)); // schema-valid entries, but > 8 KB total
  writeJson(rp, r);
  const v = impl(dir, 'validate', rp);
  check(v.status !== 0 && /exceeds the 8192-byte ceiling/.test(v.stderr), 'oversized: a report over 8 KB is rejected');
}

// ── invalid attempt counter ──────────────────────────────────────────────────
{
  const { dir } = freshRepo();
  const rp = path.join(ws(dir), 'report.json');
  const lo = validReport(); lo.attemptsUsed = 0; writeJson(rp, lo);
  check(impl(dir, 'validate', rp).status !== 0, 'attempts: 0 is rejected (initial attempt is 1)');
  const hi = validReport(); hi.attemptsUsed = 4; writeJson(rp, hi);
  check(impl(dir, 'validate', rp).status !== 0, 'attempts: 4 exceeds the initial+2 ceiling');
}

// ── clean worktree comparison ────────────────────────────────────────────────
{
  const { dir } = freshRepo();
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'export const a = 2;\n'); // modify the tracked file
  const rp = path.join(ws(dir), 'report.json'); writeJson(rp, validReport());
  const c = impl(dir, 'compare-worktree', rp, '--base', 'HEAD', '--allowed-path', 'src');
  let parsed = null; try { parsed = JSON.parse(c.stdout); } catch { /* null */ }
  check(c.status === 0 && parsed && parsed.violations.length === 0, 'compare: matching report + diff is clean');
  check(parsed && parsed.actualChanged.includes('src/a.js'), 'compare: actual changed path detected');
}

// ── omitted changed file (actual diff is authoritative) ──────────────────────
{
  const { dir } = freshRepo();
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'export const a = 2;\n');
  fs.writeFileSync(path.join(dir, 'src', 'b.js'), 'export const b = 3;\n'); // untracked, NOT in the report
  const rp = path.join(ws(dir), 'report.json'); writeJson(rp, validReport()); // lists only src/a.js
  const c = impl(dir, 'compare-worktree', rp, '--base', 'HEAD', '--allowed-path', 'src');
  let parsed = null; try { parsed = JSON.parse(c.stdout); } catch { /* null */ }
  check(c.status !== 0, 'omitted: an unreported change fails the comparison');
  check(parsed && parsed.violations.some((v) => v.code === 'OMITTED_CHANGED_FILE' && v.paths.includes('src/b.js')),
    'omitted: the unreported (untracked) file is named');
}

// ── falsely reported unchanged file ──────────────────────────────────────────
{
  const { dir } = freshRepo();
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'export const a = 2;\n');
  const rp = path.join(ws(dir), 'report.json'); const r = validReport();
  r.filesChanged = ['src/a.js', 'src/ghost.js']; writeJson(rp, r); // ghost was never changed
  const c = impl(dir, 'compare-worktree', rp, '--base', 'HEAD', '--allowed-path', 'src');
  let parsed = null; try { parsed = JSON.parse(c.stdout); } catch { /* null */ }
  check(c.status !== 0 && parsed && parsed.violations.some((v) => v.code === 'REPORTED_UNCHANGED_FILE' && v.paths.includes('src/ghost.js')),
    'false-report: a reported-but-unchanged file is flagged');
}

// ── change outside the allowed paths ─────────────────────────────────────────
{
  const { dir } = freshRepo();
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'export const a = 2;\n');
  fs.mkdirSync(path.join(dir, 'other'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'other', 'd.js'), 'leak\n'); // outside allowed scope
  const rp = path.join(ws(dir), 'report.json'); const r = validReport();
  r.filesChanged = ['src/a.js', 'other/d.js']; writeJson(rp, r);
  const c = impl(dir, 'compare-worktree', rp, '--base', 'HEAD', '--allowed-path', 'src');
  let parsed = null; try { parsed = JSON.parse(c.stdout); } catch { /* null */ }
  check(c.status !== 0 && parsed && parsed.violations.some((v) => v.code === 'OUTSIDE_ALLOWED_PATH' && v.paths.includes('other/d.js')),
    'allowed-path: an out-of-scope change is flagged');
}

// ── compare ignores the self-ignored workflow workspace ──────────────────────
{
  const { dir } = freshRepo();
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'export const a = 2;\n');
  fs.mkdirSync(path.join(dir, '.cost-oriented-agentic-workflow', 'run'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.cost-oriented-agentic-workflow', 'run', 'state.json'), '{}');
  const rp = path.join(ws(dir), 'report.json'); writeJson(rp, validReport());
  const c = impl(dir, 'compare-worktree', rp, '--base', 'HEAD', '--allowed-path', 'src');
  let parsed = null; try { parsed = JSON.parse(c.stdout); } catch { /* null */ }
  check(c.status === 0 && parsed && !parsed.actualChanged.some((p) => p.startsWith('.cost-oriented-agentic-workflow/')),
    'compare: the ignored workflow workspace is excluded from actual changes');
}

// ── render refuses an invalid report ─────────────────────────────────────────
{
  const { dir } = freshRepo();
  const rp = path.join(ws(dir), 'report.json'); const r = validReport(); r.schemaVersion = 9; writeJson(rp, r);
  check(impl(dir, 'render', rp).status !== 0, 'render: refuses to render an invalid report');
}

// ── unsafe --allowed-path is rejected ────────────────────────────────────────
{
  const { dir } = freshRepo();
  const rp = path.join(ws(dir), 'report.json'); writeJson(rp, validReport());
  check(impl(dir, 'compare-worktree', rp, '--base', 'HEAD', '--allowed-path', '../x').status !== 0,
    'compare: an unsafe --allowed-path is rejected');
  check(impl(dir, 'compare-worktree', rp).status !== 0, 'compare: missing --base is rejected');
}

// ── Phase 3B.1.1: attempt + baseline fields, attempt-qualified validation ────
{
  const { dir } = freshRepo();
  const r = validReport(); r.attemptNumber = 1; r.baselinePath = '.cost-oriented-agentic-workflow/run/task-1-baseline.json';
  const rp = path.join(ws(dir), 'task-1-attempt-1-report.json'); writeJson(rp, r);
  check(impl(dir, 'validate', rp).status === 0, 'attempt: attemptNumber + baselinePath fields validate');
  check(impl(dir, 'validate', rp, '--attempt', '1').status === 0, 'attempt: --attempt 1 agrees with attemptNumber + attempt-qualified name');
  check(impl(dir, 'validate', rp, '--attempt', '2').status !== 0, 'attempt: --attempt 2 disagreeing with attemptNumber is rejected');
  check(impl(dir, 'validate', rp, '--baseline', '.cost-oriented-agentic-workflow/run/task-1-baseline.json').status === 0, 'attempt: --baseline agreeing with baselinePath passes');
  check(impl(dir, 'validate', rp, '--baseline', '.cost-oriented-agentic-workflow/run/other-baseline.json').status !== 0, 'attempt: --baseline disagreeing with baselinePath is rejected');
  // a report whose filename is not attempt-qualified fails --attempt
  const rp2 = path.join(ws(dir), 'report.json'); writeJson(rp2, r);
  check(impl(dir, 'validate', rp2, '--attempt', '1').status !== 0, 'attempt: a non-attempt-qualified report path fails --attempt');
  // invalid attemptNumber range
  const bad = validReport(); bad.attemptNumber = 4; const rp3 = path.join(ws(dir), 'task-1-attempt-4-report.json'); writeJson(rp3, bad);
  check(impl(dir, 'validate', rp3).status !== 0, 'attempt: attemptNumber out of 1..3 is rejected');
}

// ── compare-worktree --baseline uses the unit ownership delta ─────────────────
{
  const { dir } = freshRepo();
  // user pre-dirties an out-of-scope file BEFORE the unit baseline is captured
  fs.writeFileSync(path.join(dir, 'src', 'keep.js'), 'export const keep = 9;\n');
  const blRel = '.cost-oriented-agentic-workflow/run/task-1-baseline.json';
  uw(dir, 'capture', '--unit', 'task-1', '--output', blRel, '--allowed-path', 'src/a.js');
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'export const a = 2;\n'); // unit work
  const rp = path.join(ws(dir), 'task-1-attempt-1-report.json'); writeJson(rp, validReport());
  const c = impl(dir, 'compare-worktree', rp, '--baseline', blRel);
  let parsed = null; try { parsed = JSON.parse(c.stdout); } catch { /* null */ }
  check(c.status === 0 && parsed && parsed.violations.length === 0, 'baseline-compare: pre-existing out-of-scope dirt does not contaminate the unit delta');
  check(parsed && parsed.unitOwned.join() === 'src/a.js' && parsed.preserved.includes('src/keep.js'), 'baseline-compare: only the unit file is owned; the user file is preserved');
}
{
  const { dir } = freshRepo();
  const blRel = '.cost-oriented-agentic-workflow/run/task-1-baseline.json';
  uw(dir, 'capture', '--unit', 'task-1', '--output', blRel, '--allowed-path', 'src/a.js');
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'export const a = 2;\n');
  fs.writeFileSync(path.join(dir, 'src', 'keep.js'), 'leak\n'); // unit touched an out-of-scope path
  const rp = path.join(ws(dir), 'task-1-attempt-1-report.json'); const r = validReport(); r.filesChanged = ['src/a.js', 'src/keep.js']; writeJson(rp, r);
  const c = impl(dir, 'compare-worktree', rp, '--baseline', blRel);
  let parsed = null; try { parsed = JSON.parse(c.stdout); } catch { /* null */ }
  check(c.status !== 0 && parsed && parsed.violations.some((v) => v.code === 'OUTSIDE_ALLOWED_PATH' && v.paths.includes('src/keep.js')), 'baseline-compare: an out-of-scope unit change is flagged');
}

// ── cleanup + summary ────────────────────────────────────────────────────────
for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } }
console.log(`\nimplementation-report: ${passes} checks passed, ${fails} failed.`);
if (fails > 0) process.exit(1);
console.log('implementation report helper OK.');

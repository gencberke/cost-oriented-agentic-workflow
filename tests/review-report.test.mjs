#!/usr/bin/env node
// Deterministic, zero-dependency behavioral tests for the Phase 3B.2 review
// helpers: review-report.mjs (reviewer report validation) and review-package.mjs
// (reviewer package descriptor). Uses throwaway git repositories under the OS
// temp dir; never touches the developer's repository. Run: npm run test:review-report

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPORT = path.resolve(here, '../skills/requesting-review/scripts/review-report.mjs');
const PACKAGE = path.resolve(here, '../skills/requesting-review/scripts/review-package.mjs');

let fails = 0, passes = 0;
const check = (cond, msg) => { if (cond) { passes += 1; } else { fails += 1; console.error('FAIL: ' + msg); } };

const tmps = [];
function freshRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cow-review-'));
  tmps.push(dir);
  const g = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  g('init', '-q'); g('config', 'user.email', 't@e.com'); g('config', 'user.name', 't'); g('config', 'core.autocrlf', 'false');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'export const a = 1;\n');
  g('add', '-A'); g('commit', '-qm', 'seed');
  return { dir, git: g };
}
function run(script, cwd, ...args) {
  const r = spawnSync('node', [script, ...args], { cwd, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
const rr = (cwd, ...a) => run(REPORT, cwd, ...a);
const rp = (cwd, ...a) => run(PACKAGE, cwd, ...a);
function ws(dir) { const d = path.join(dir, '.cost-oriented-agentic-workflow', 'run'); fs.mkdirSync(d, { recursive: true }); return d; }
const writeJson = (p, obj) => fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));

const validUnitReport = (over = {}) => ({
  schemaVersion: 1, reviewScope: 'UNIT_REVIEW', reviewTargetId: 'task-1',
  mode: 'standard', risk: 'high',
  specVerdict: 'PASS', qualityVerdict: 'PASS', overallVerdict: 'APPROVE',
  findings: [], reviewedArtifacts: ['src/a.js'], remainingRisks: [], ...over,
});
const finding = (over = {}) => ({
  id: 'F-001', severity: 'IMPORTANT', causality: 'INTRODUCED', status: 'OPEN',
  path: 'src/a.js', line: 2, title: 'unchecked input', evidence: 'no guard at a.js:2',
  recommendation: 'add a guard', blocking: true, ...over,
});

// ── review-report: valid reports + inspect + render + summarize ───────────────
{
  const { dir } = freshRepo(); const f = path.join(ws(dir), 'review.json');
  writeJson(f, validUnitReport());
  check(rr(dir, 'validate', f).status === 0, 'valid unit report passes validation');
  const r1 = rr(dir, 'render', f); const r2 = rr(dir, 'render', f);
  check(r1.status === 0 && /# Review report: task-1/.test(r1.stdout), 'render: bounded markdown from valid JSON');
  check(r1.stdout === r2.stdout, 'render: deterministic');
  const ins = rr(dir, 'inspect', f); let pj = null; try { pj = JSON.parse(ins.stdout); } catch { /* */ }
  check(ins.status === 0 && pj && pj.overallVerdict === 'APPROVE', 'inspect: parseable summary');
  const sm = rr(dir, 'summarize-findings', f); let sj = null; try { sj = JSON.parse(sm.stdout); } catch { /* */ }
  check(sm.status === 0 && sj && Array.isArray(sj.openBlockingIds), 'summarize-findings: parseable');
}

// valid CHANGES_REQUIRED unit report with an open blocking finding
{
  const { dir } = freshRepo(); const f = path.join(ws(dir), 'review.json');
  writeJson(f, validUnitReport({ specVerdict: 'FAIL', qualityVerdict: 'CONCERNS', overallVerdict: 'CHANGES_REQUIRED', findings: [finding()] }));
  check(rr(dir, 'validate', f).status === 0, 'valid CHANGES_REQUIRED report with open blocking finding');
}

// valid whole-work report
{
  const { dir } = freshRepo(); const f = path.join(ws(dir), 'review.json');
  writeJson(f, validUnitReport({ reviewScope: 'WHOLE_WORK_REVIEW', reviewTargetId: 'whole-work', mode: 'production' }));
  check(rr(dir, 'validate', f).status === 0, 'valid whole-work report passes');
}

// valid targeted re-review (accepted finding resolved)
{
  const { dir } = freshRepo(); const f = path.join(ws(dir), 'review.json');
  writeJson(f, validUnitReport({ reviewScope: 'TARGETED_REREVIEW', findings: [finding({ status: 'RESOLVED', blocking: true })] }));
  const r = rr(dir, 'validate', f, '--accepted-finding-ids', 'F-001');
  check(r.status === 0, 'valid targeted re-review with accepted finding resolved');
}

// ── rejections ───────────────────────────────────────────────────────────────
const rejectCases = [
  ['malformed JSON', '{ not json'],
  ['unknown schemaVersion', validUnitReport({ schemaVersion: 2 })],
  ['invalid reviewScope', validUnitReport({ reviewScope: 'NOPE' })],
  ['invalid mode', validUnitReport({ mode: 'turbo' })],
  ['invalid risk (medium not in matrix)', validUnitReport({ risk: 'medium' })],
  ['unsafe finding path', validUnitReport({ findings: [finding({ path: '../etc/passwd' })] })],
  ['duplicate finding id', validUnitReport({ overallVerdict: 'CHANGES_REQUIRED', findings: [finding(), finding({ title: 'dup' })] })],
  ['invalid severity', validUnitReport({ findings: [finding({ severity: 'HUGE', blocking: false, status: 'OPEN' })] })],
  ['invalid causality', validUnitReport({ findings: [finding({ causality: 'MAYBE', blocking: false })] })],
  ['invalid finding status', validUnitReport({ findings: [finding({ status: 'WIP', blocking: false })] })],
  ['blocking MINOR rejected', validUnitReport({ overallVerdict: 'CHANGES_REQUIRED', findings: [finding({ severity: 'MINOR' })] })],
  ['blocking PRE_EXISTING rejected', validUnitReport({ overallVerdict: 'CHANGES_REQUIRED', findings: [finding({ causality: 'PRE_EXISTING' })] })],
  ['APPROVE with open blocking finding', validUnitReport({ overallVerdict: 'APPROVE', findings: [finding()] })],
  ['chain-of-thought / code fence smuggled', validUnitReport({ findings: [finding({ blocking: false, status: 'OPEN', evidence: 'see ```js\nsecret\n```' })] })],
  ['oversized report', validUnitReport({ remainingRisks: Array.from({ length: 50 }, () => 'x'.repeat(500)) })],
];
for (const [label, obj] of rejectCases) {
  const { dir } = freshRepo(); const f = path.join(ws(dir), 'review.json');
  writeJson(f, obj);
  check(rr(dir, 'validate', f).status !== 0, `reject: ${label}`);
}

// targeted re-review omitting an accepted finding
{
  const { dir } = freshRepo(); const f = path.join(ws(dir), 'review.json');
  writeJson(f, validUnitReport({ reviewScope: 'TARGETED_REREVIEW', findings: [] }));
  check(rr(dir, 'validate', f, '--accepted-finding-ids', 'F-001').status !== 0, 'reject: targeted re-review omits accepted finding');
}
// targeted re-review with a non-accepted, non-introduced finding
{
  const { dir } = freshRepo(); const f = path.join(ws(dir), 'review.json');
  writeJson(f, validUnitReport({ reviewScope: 'TARGETED_REREVIEW', findings: [
    finding({ id: 'F-001', status: 'RESOLVED' }),
    finding({ id: 'F-099', causality: 'PRE_EXISTING', blocking: false, status: 'OPEN' }),
  ] }));
  check(rr(dir, 'validate', f, '--accepted-finding-ids', 'F-001').status !== 0, 'reject: targeted re-review carries an unrelated non-introduced finding');
}

// ── package builder + cross-check ────────────────────────────────────────────
{
  const { dir } = freshRepo(); const w = ws(dir);
  const diff = path.join(w, 'unit.diff'); fs.writeFileSync(diff, '# diff\n');
  const pkgPath = '.cost-oriented-agentic-workflow/run/pkg.json';
  const b = rp(dir, 'build', '--scope', 'UNIT_REVIEW', '--target', 'task-1', '--mode', 'standard', '--risk', 'high',
    '--output', pkgPath, '--diff', '.cost-oriented-agentic-workflow/run/unit.diff',
    '--unit-owned-path', 'src/a.js', '--base-sha', 'abc1234', '--head-sha', 'def5678');
  check(b.status === 0 && fs.existsSync(path.join(dir, pkgPath)), 'package build: writes a valid unit package');
  check(rp(dir, 'validate', path.join(dir, pkgPath)).status === 0, 'package validate: built package is valid');

  // report agrees with package
  const f = path.join(w, 'review.json'); writeJson(f, validUnitReport());
  check(rr(dir, 'validate', f, '--package', path.join(dir, pkgPath)).status === 0, 'report+package: agreeing scope/mode/risk passes');

  // report disagrees on risk
  const f2 = path.join(w, 'review2.json'); writeJson(f2, validUnitReport({ risk: 'low' }));
  check(rr(dir, 'validate', f2, '--package', path.join(dir, pkgPath)).status !== 0, 'report+package: risk mismatch rejected');

  // finding outside scope without OUT_OF_SCOPE
  const f3 = path.join(w, 'review3.json');
  writeJson(f3, validUnitReport({ overallVerdict: 'CHANGES_REQUIRED', findings: [finding({ path: 'src/other.js' })] }));
  check(rr(dir, 'validate', f3, '--package', path.join(dir, pkgPath)).status !== 0, 'report+package: in-unit finding outside scope rejected');

  // same finding allowed when marked OUT_OF_SCOPE (non-blocking)
  const f4 = path.join(w, 'review4.json');
  writeJson(f4, validUnitReport({ findings: [finding({ path: 'src/other.js', status: 'OUT_OF_SCOPE', blocking: false, causality: 'PRE_EXISTING' })] }));
  check(rr(dir, 'validate', f4, '--package', path.join(dir, pkgPath)).status === 0, 'report+package: OUT_OF_SCOPE finding outside scope allowed');
}

// package per-scope required fields + unsafe path
{
  const { dir } = freshRepo();
  const bad = rp(dir, 'build', '--scope', 'UNIT_REVIEW', '--target', 'task-1', '--mode', 'standard', '--risk', 'high',
    '--output', '.cost-oriented-agentic-workflow/run/bad.json');
  check(bad.status !== 0, 'package build: UNIT_REVIEW without scope/diff/sha rejected');
  const trav = rp(dir, 'build', '--scope', 'UNIT_REVIEW', '--target', 'task-1', '--mode', 'standard', '--risk', 'high',
    '--output', '.cost-oriented-agentic-workflow/run/trav.json', '--diff', '../escape.diff',
    '--unit-owned-path', 'src/a.js', '--base-sha', 'abc1234', '--head-sha', 'def5678');
  check(trav.status !== 0, 'package build: path traversal in --diff rejected');
  const tr = rp(dir, 'build', '--scope', 'TARGETED_REREVIEW', '--target', 'task-1', '--mode', 'standard', '--risk', 'high',
    '--output', '.cost-oriented-agentic-workflow/run/tr.json');
  check(tr.status !== 0, 'package build: TARGETED_REREVIEW without prior report / accepted ids rejected');
}

// package --output path safety
{
  const { dir } = freshRepo();
  const w = ws(dir);
  const diff = path.join(w, 'unit.diff');
  fs.writeFileSync(diff, '# diff\n');

  const runBuild = (outPath) => rp(dir, 'build',
    '--scope', 'UNIT_REVIEW', '--target', 'task-1', '--mode', 'standard', '--risk', 'high',
    '--output', outPath,
    '--diff', '.cost-oriented-agentic-workflow/run/unit.diff',
    '--unit-owned-path', 'src/a.js',
    '--base-sha', 'abc1234',
    '--head-sha', 'def5678');

  const relOut = '.cost-oriented-agentic-workflow/run/pkg.json';
  const ok = runBuild(relOut);
  check(ok.status === 0, 'package build: valid relative --output succeeds');
  check(fs.existsSync(path.join(dir, relOut)), 'package build: valid relative --output file exists');

  const suffix = () => Math.random().toString(36).slice(2, 10);
  const badOutputs = [
    ['platform-native absolute path', path.resolve(dir, `outside-abs-${suffix()}.json`)],
    ['Windows drive-qualified backslash', `C:\\outside-win-back-${suffix()}.json`],
    ['Windows drive-qualified forward slash', `C:/outside-win-forward-${suffix()}.json`],
    ['root-qualified forward slash', `/outside-root-slash-${suffix()}.json`],
    ['root-qualified backslash', `\\outside-root-back-${suffix()}.json`],
    ['traversal path', `../outside-trav-${suffix()}.json`],
  ];

  const beforeRootFiles = new Set(fs.readdirSync(dir));
  for (const [label, outPath] of badOutputs) {
    const res = runBuild(outPath);
    check(res.status !== 0, `package build: rejected ${label} exits non-zero`);
    const resolved = path.isAbsolute(outPath) || /^[A-Za-z]:[\\/]/.test(outPath)
      ? outPath
      : path.resolve(dir, outPath);
    check(!fs.existsSync(resolved), `package build: rejected ${label} does not create output file`);
    check(!fs.existsSync(resolved + '.tmp'), `package build: rejected ${label} does not leave .tmp file`);
    check(!fs.existsSync(path.join(dir, outPath)), `package build: rejected ${label} does not create file inside worktree`);
    check(!fs.existsSync(path.join(dir, outPath + '.tmp')), `package build: rejected ${label} does not leave .tmp file inside worktree`);
  }
  const newRootFiles = fs.readdirSync(dir).filter((f) => !beforeRootFiles.has(f));
  check(newRootFiles.length === 0, 'package build: rejected paths do not create unrelated files in the repo root');

  // Repo-relative but outside the workflow workspace: the helper never writes
  // source paths, so a tracked file or a new repo-root file must be refused.
  const beforeA = fs.readFileSync(path.join(dir, 'src', 'a.js'), 'utf8');
  const rSrc = runBuild('src/a.js');
  check(rSrc.status !== 0, 'package build: rejected tracked-source --output (src/a.js) exits non-zero');
  check(fs.readFileSync(path.join(dir, 'src', 'a.js'), 'utf8') === beforeA,
    'package build: rejected tracked-source --output does not overwrite the file');
  const rReadme = runBuild('README.md');
  check(rReadme.status !== 0, 'package build: rejected repo-root --output (README.md) exits non-zero');
  check(!fs.existsSync(path.join(dir, 'README.md')), 'package build: rejected repo-root --output creates no file');
}

// ── summary ──────────────────────────────────────────────────────────────────
for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } }
console.log(`\nreview-report + review-package: ${passes} checks passed, ${fails} failed.`);
if (fails > 0) process.exit(1);
console.log('review report helper OK.');

#!/usr/bin/env node
// Deterministic, zero-dependency behavioral tests for unit-worktree.mjs.
// Throwaway git repositories under the OS temp dir; never touches the developer's
// repository. Run: npm run test:unit-worktree

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(here, '../skills/execution-routing/scripts/unit-worktree.mjs');
let fails = 0, passes = 0;
const check = (c, m) => { if (c) passes += 1; else { fails += 1; console.error('FAIL: ' + m); } };

const tmps = [];
function freshRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cow-uw-'));
  tmps.push(dir);
  const g = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  g('init', '-q'); g('config', 'user.email', 't@e.com'); g('config', 'user.name', 't'); g('config', 'core.autocrlf', 'false');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(dir, 'src', 'keep.js'), 'export const keep = 1;\n');
  g('add', '-A'); g('commit', '-qm', 'seed');
  return { dir, git: g, root: g('rev-parse', '--show-toplevel').stdout.trim() };
}
function uw(cwd, ...args) { const r = spawnSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8' }); return { status: r.status, out: r.stdout || '', err: r.stderr || '', json: parse(r.stdout) }; }
function parse(s) { try { return JSON.parse(s); } catch { return null; } }
const BL = '.cost-oriented-agentic-workflow/run/task-1-baseline.json';
const w = (dir, rel, txt) => fs.writeFileSync(path.join(dir, rel), txt);
const capture = (dir, allowed, unit = 'task-1', out = BL) => uw(dir, 'capture', '--unit', unit, '--output', out, ...allowed.flatMap((a) => ['--allowed-path', a]));

// ── clean baseline + deterministic inspect + atomic write ────────────────────
{
  const { dir, root } = freshRepo();
  const c = capture(dir, ['src/a.js']);
  check(c.status === 0 && c.json && c.json.preExistingCount === 0, 'clean: capture succeeds with no pre-existing dirt');
  const b = uw(dir, 'inspect', BL);
  check(b.status === 0 && b.json.schemaVersion === 1 && b.json.unitId === 'task-1' && /^[0-9a-f]{40}$/.test(b.json.head), 'clean: inspect emits a valid baseline');
  const b2 = uw(dir, 'inspect', BL);
  check(b.out === b2.out, 'inspect: deterministic across runs');
  const leftovers = fs.readdirSync(path.join(root, '.cost-oriented-agentic-workflow', 'run')).filter((f) => f.includes('.tmp'));
  check(leftovers.length === 0, 'atomic: no leftover .tmp baseline files');
}

// ── pre-existing dirt outside allowed scope is recorded + preserved ──────────
{
  const { dir } = freshRepo();
  w(dir, 'src/keep.js', 'export const keep = 999; // user edit\n');   // dirty BEFORE capture
  const c = capture(dir, ['src/a.js']);
  check(c.json.preExistingCount === 1, 'preserve: pre-existing tracked dirt recorded at capture');
  w(dir, 'src/a.js', 'export const a = 2; // unit\n');                // unit work
  const cmp = uw(dir, 'compare', BL);
  check(cmp.status === 0 && cmp.json.unitOwned.join() === 'src/a.js', 'preserve: only the unit file is unit-owned');
  check(cmp.json.preserved.join() === 'src/keep.js' && cmp.json.violations.length === 0, 'preserve: the user dirty file is preserved, not owned');
}

// ── staged user change + untracked user file preserved ───────────────────────
{
  const { dir, git } = freshRepo();
  w(dir, 'src/keep.js', 'export const keep = 7;\n'); git('add', 'src/keep.js');   // staged user change
  w(dir, 'note.txt', 'user scratch\n');                                            // untracked user file
  const c = capture(dir, ['src/a.js']);
  const kinds = c.status === 0 ? uw(dir, 'inspect', BL).json.preExisting.map((e) => `${e.path}:${e.kind}`).sort() : [];
  check(kinds.includes('src/keep.js:STAGED') && kinds.includes('note.txt:UNTRACKED'), 'capture: classifies STAGED + UNTRACKED pre-existing paths');
  w(dir, 'src/a.js', 'export const a = 2;\n');
  const cmp = uw(dir, 'compare', BL);
  check(cmp.json.unitOwned.join() === 'src/a.js' && cmp.json.preserved.includes('note.txt') && cmp.json.violations.length === 0,
    'preserve: staged + untracked user paths preserved while the unit owns only its file');
}

// ── dirty inside allowed scope blocks (file + directory overlap) ─────────────
{
  const { dir } = freshRepo();
  w(dir, 'src/a.js', 'export const a = 99; // user pre-dirtied the allowed file\n');
  capture(dir, ['src/a.js']);
  const ov = uw(dir, 'check-overlap', BL);
  check(ov.status === 1 && ov.json.status === 'BLOCKED_DIRTY_OVERLAP' && ov.json.overlap.join() === 'src/a.js', 'overlap: dirty allowed FILE blocks');
}
{
  const { dir } = freshRepo();
  w(dir, 'src/keep.js', 'export const keep = 5;\n');
  capture(dir, ['src']); // directory allow-path
  const ov = uw(dir, 'check-overlap', BL);
  check(ov.status === 1 && ov.json.overlap.includes('src/keep.js'), 'overlap: a directory allow-path overlaps a contained dirty path');
}
{
  const { dir } = freshRepo();
  w(dir, 'src/keep.js', 'export const keep = 5;\n');
  capture(dir, ['src/a.js']);
  const ov = uw(dir, 'check-overlap', BL);
  check(ov.status === 0 && ov.json.status === 'OK', 'overlap: dirt outside the allowed file does not block');
}

// ── post-baseline ownership: allowed change / out-of-scope / pre-existing mod ─
{
  const { dir } = freshRepo();
  capture(dir, ['src/a.js']);
  w(dir, 'src/a.js', 'export const a = 2;\n'); w(dir, 'src/keep.js', 'export const keep = 2;\n'); // touched an out-of-scope file
  const cmp = uw(dir, 'compare', BL);
  check(cmp.status === 1 && cmp.json.violations.some((v) => v.code === 'OUTSIDE_ALLOWED_PATH' && v.path === 'src/keep.js'), 'ownership: a post-baseline out-of-scope change is rejected');
}
{
  const { dir } = freshRepo();
  w(dir, 'src/keep.js', 'export const keep = 8;\n'); capture(dir, ['src/a.js']);
  w(dir, 'src/keep.js', 'export const keep = 8888; // modified AFTER baseline\n'); // tamper a pre-existing path
  const cmp = uw(dir, 'compare', BL);
  check(cmp.status === 1 && cmp.json.violations.some((v) => v.code === 'PRE_EXISTING_PATH_MODIFIED' && v.path === 'src/keep.js'), 'ownership: modifying a pre-existing path after baseline is rejected');
}

// ── new file / deletion / rename within and out of scope ─────────────────────
{
  const { dir } = freshRepo();
  capture(dir, ['src/new.js']);
  w(dir, 'src/new.js', 'export const n = 1;\n');
  const cmp = uw(dir, 'compare', BL);
  check(cmp.status === 0 && cmp.json.unitOwned.join() === 'src/new.js', 'new: an allowed new file is unit-owned');
}
{
  const { dir } = freshRepo();
  capture(dir, ['src/a.js']);
  fs.rmSync(path.join(dir, 'src/a.js'));
  const cmp = uw(dir, 'compare', BL);
  check(cmp.status === 0 && cmp.json.unitOwned.join() === 'src/a.js', 'delete: an allowed deletion is unit-owned');
}
{
  const { dir, git } = freshRepo();
  capture(dir, ['src']);
  git('mv', 'src/a.js', 'src/b.js');
  const cmp = uw(dir, 'compare', BL);
  check(cmp.status === 0 && cmp.json.unitOwned.includes('src/a.js') && cmp.json.unitOwned.includes('src/b.js'), 'rename: an in-scope rename owns both old and new paths');
}
{
  const { dir, git } = freshRepo();
  capture(dir, ['src/a.js']);
  fs.mkdirSync(path.join(dir, 'top'), { recursive: true }); git('mv', 'src/a.js', 'top/b.js');
  const cmp = uw(dir, 'compare', BL);
  check(cmp.status === 1 && cmp.json.violations.some((v) => v.code === 'OUTSIDE_ALLOWED_PATH' && v.path === 'top/b.js'), 'rename: a rename into an out-of-scope path is rejected');
}

// ── safe path validation + BOM tolerance ─────────────────────────────────────
{
  const { dir } = freshRepo();
  check(capture(dir, ['../escape.js']).status !== 0, 'safe-path: a traversal allowed-path is rejected');
  check(capture(dir, ['/etc/passwd']).status !== 0, 'safe-path: an absolute allowed-path is rejected');
}
{
  const { dir, root } = freshRepo();
  capture(dir, ['src/a.js']);
  const bp = path.join(root, BL);
  fs.writeFileSync(bp, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), fs.readFileSync(bp)])); // prepend a UTF-8 BOM
  check(uw(dir, 'inspect', BL).status === 0, 'bom: a baseline with a leading BOM still parses');
}

// ── linked worktree behavior ─────────────────────────────────────────────────
{
  const { dir, git } = freshRepo();
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'cow-uw-wt-')); tmps.push(wt);
  fs.rmSync(wt, { recursive: true, force: true });
  check(git('worktree', 'add', '-q', '-b', 'wt', wt).status === 0, 'worktree: linked worktree created');
  const c = capture(wt, ['src/a.js']);
  check(c.status === 0 && fs.existsSync(path.join(wt, BL)), 'worktree: baseline is captured in the linked worktree root');
  git('worktree', 'remove', '--force', wt);
}

// ── stage verification ───────────────────────────────────────────────────────
{
  const { dir, git } = freshRepo();
  capture(dir, ['src/a.js']);
  w(dir, 'src/a.js', 'export const a = 2;\n'); git('add', 'src/a.js');
  const vs = uw(dir, 'verify-stage', BL);
  check(vs.status === 0 && vs.json.violations.length === 0 && vs.json.staged.join() === 'src/a.js', 'stage: exact unit-owned path staged passes');
}
{
  const { dir, git } = freshRepo();
  w(dir, 'src/keep.js', 'export const keep = 3;\n'); capture(dir, ['src/a.js']);
  w(dir, 'src/a.js', 'export const a = 2;\n'); git('add', '-A'); // broad staging sweeps in the user file
  const vs = uw(dir, 'verify-stage', BL);
  check(vs.status === 1 && vs.json.violations.some((v) => v.code === 'STAGED_PREEXISTING_PATH' && v.path === 'src/keep.js'), 'stage: broad staging that includes a pre-existing path is rejected');
}
{
  const { dir, git } = freshRepo();
  capture(dir, ['src/a.js']); w(dir, 'src/a.js', 'export const a = 2;\n');
  git('add', 'src/keep.js'); // stage something not unit-owned (won't exist as change; stage a fresh edit)
  w(dir, 'src/keep.js', 'x\n'); git('add', 'src/keep.js');
  const vs = uw(dir, 'verify-stage', BL);
  check(vs.status === 1 && vs.json.violations.some((v) => v.code === 'STAGED_NON_UNIT_OWNED' || v.code === 'OUTSIDE_ALLOWED_PATH'), 'stage: a staged non-unit-owned path is rejected');
}
{
  const { dir } = freshRepo();
  capture(dir, ['src/a.js']); w(dir, 'src/a.js', 'export const a = 2;\n'); // unit-owned but NOT staged
  const vs = uw(dir, 'verify-stage', BL);
  check(vs.status === 1 && vs.json.violations.some((v) => v.code === 'MISSING_STAGED_UNIT_PATH' || v.code === 'NO_STAGED_CHANGES'), 'stage: a missing unit-owned staged path is rejected');
}

// ── cleanup + summary ────────────────────────────────────────────────────────
for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } }
console.log(`\nunit-worktree: ${passes} checks passed, ${fails} failed.`);
if (fails > 0) process.exit(1);
console.log('unit worktree baseline helper OK.');

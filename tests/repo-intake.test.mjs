#!/usr/bin/env node
// Deterministic, zero-dependency tests for repo-snapshot.mjs + the repository
// profile contract + the runtime-allowlist path guarantee. Uses throwaway git
// repositories under the OS temp dir. Run: npm run test:foundation
//   (or: node tests/repo-intake.test.mjs)

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

// The real package rules (shared by builder + inspector) — imported directly
// so this guarantee can never drift from what actually ships.
import { ALLOW_PREFIX, DENY_PREFIX } from '../scripts/runtime-package-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..');
const SNAP = path.join(REPO, 'skills/repository-intake/scripts/repo-snapshot.mjs');
const COW_STATE = path.join(REPO, 'skills/execution-routing/scripts/cow-state.mjs');

let fails = 0, passes = 0;
const check = (cond, msg) => { if (cond) { passes += 1; } else { fails += 1; console.error('FAIL: ' + msg); } };

const tmps = [];
function gitIn(dir) { return (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' }); }
function newRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cow-snap-'));
  tmps.push(dir);
  const g = gitIn(dir);
  g('init', '-q'); g('config', 'user.email', 't@e.com'); g('config', 'user.name', 't'); g('config', 'core.autocrlf', 'false');
  return { dir, g, root: g('rev-parse', '--show-toplevel').stdout.trim() };
}
function W(dir, rel, content) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
// A small, realistic fixture repository.
function fixtureRepo() {
  const r = newRepo();
  W(r.dir, 'package.json', JSON.stringify({ name: 'fix', version: '1.0.0', main: 'src/index.ts', scripts: { build: 'tsc', test: 'node t' } }, null, 2) + '\n');
  W(r.dir, 'CLAUDE.md', '# Project rules\nUse the workflow.\n');
  W(r.dir, 'src/index.ts', 'export const x = 1;\n');
  W(r.dir, 'src/api/handler.ts', 'export function h() { return 0; }\n');
  W(r.dir, 'src/util.ts', 'export const SECRET_MARKER = "do-not-leak";\n');
  W(r.dir, 'test/x.test.ts', 'import { x } from "../src/index";\n');
  W(r.dir, '.github/workflows/ci.yml', 'name: ci\non: [push]\n');
  r.g('add', '-A'); r.g('commit', '-qm', 'init');
  return r;
}

function snap(cwd, env) {
  const r = spawnSync('node', [SNAP, 'print'], { cwd, encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env });
  return { status: r.status, json: (() => { try { return JSON.parse(r.stdout); } catch { return null; } })(), raw: r.stdout };
}
function fp(cwd) { return spawnSync('node', [SNAP, 'fingerprint'], { cwd, encoding: 'utf8' }).stdout.trim(); }
function checkProfile(cwd, file) { const r = spawnSync('node', [SNAP, 'check-profile', file], { cwd, encoding: 'utf8' }); return { status: r.status, out: (r.stdout || '').trim() }; }

// ── deterministic output + sorted lists + no secrets/env ─────────────────────
{
  const { dir } = fixtureRepo();
  const a = snap(dir); const b = snap(dir);
  check(a.json && b.json, 'snapshot: print emits valid JSON');
  const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.generatedAt; return JSON.stringify(c); };
  check(strip(a.json) === strip(b.json), 'snapshot: deterministic across runs (modulo generatedAt)');
  // languages are deterministically ordered by fileCount desc, then name/ext.
  const ls = a.json.languages;
  const langOrdered = ls.every((l, i) => i === 0 || ls[i - 1].fileCount > l.fileCount
    || (ls[i - 1].fileCount === l.fileCount && ls[i - 1].name <= l.name));
  check(langOrdered, 'snapshot: languages ordered by fileCount desc (stable)');
  check(JSON.stringify(a.json.topLevelDirs) === JSON.stringify([...a.json.topLevelDirs].sort()), 'snapshot: topLevelDirs sorted');
  check(JSON.stringify(a.json.manifests.map((m) => m.path)) === JSON.stringify([...a.json.manifests.map((m) => m.path)].sort()), 'snapshot: manifests sorted');
  check(!a.raw.includes('SECRET_MARKER') && !a.raw.includes('do-not-leak'), 'snapshot: no source file contents');
  const e = snap(dir, { COW_ENV_PROBE: 'ENVSECRET_MARKER_XYZ' });
  check(!e.raw.includes('ENVSECRET_MARKER_XYZ'), 'snapshot: no environment values');
}

// ── instruction + manifest metadata (hash/size, never content) ───────────────
{
  const { dir } = fixtureRepo();
  const s = snap(dir).json;
  const claude = s.instructionFiles.find((i) => i.path === 'CLAUDE.md');
  check(claude && /^[0-9a-f]{64}$/.test(claude.sha256) && claude.bytes > 0, 'snapshot: instruction file recorded with sha256 + bytes');
  const pkg = s.manifests.find((m) => m.path === 'package.json');
  check(pkg && pkg.type === 'npm' && /^[0-9a-f]{64}$/.test(pkg.sha256), 'snapshot: manifest recorded with type + sha256');
  check(s.buildCommands.includes('npm run build') && s.testCommands.includes('npm test'), 'snapshot: build/test commands parsed from manifest');
  check(s.ciConfig.includes('.github/workflows/ci.yml'), 'snapshot: CI config detected');
}

// ── fingerprint contract ─────────────────────────────────────────────────────
{
  const { dir, g } = fixtureRepo();
  const base = fp(dir);
  // source-only commit: content of an existing tracked file changes -> fp stable
  fs.appendFileSync(path.join(dir, 'src/util.ts'), 'export const y = 2;\n');
  g('add', '-A'); g('commit', '-qm', 'edit source');
  check(fp(dir) === base, 'fingerprint: source-only commit does not change the fingerprint');
}
{
  const { dir } = fixtureRepo();
  const base = fp(dir);
  fs.appendFileSync(path.join(dir, 'src/util.ts'), '// dirty scratch edit\n'); // uncommitted
  check(fp(dir) === base, 'fingerprint: a dirty source edit alone does not change the fingerprint');
}
{
  const { dir } = fixtureRepo();
  const base = fp(dir);
  fs.appendFileSync(path.join(dir, 'CLAUDE.md'), 'New rule.\n');
  check(fp(dir) !== base, 'fingerprint: an instruction-file change changes the fingerprint');
}
{
  const { dir } = fixtureRepo();
  const base = fp(dir);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  pkg.dependencies = { left: '^1.0.0' };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  check(fp(dir) !== base, 'fingerprint: a manifest change changes the fingerprint');
}
{
  const { dir, g } = fixtureRepo();
  const base = fp(dir);
  W(dir, 'newmod/feature.ts', 'export const z = 3;\n');
  g('add', '-A'); // tracked => appears in structure
  check(fp(dir) !== base, 'fingerprint: a new top-level directory changes the fingerprint');
}

// ── heavy-dir exclusion ──────────────────────────────────────────────────────
{
  const { dir, g } = fixtureRepo();
  W(dir, 'node_modules/leftpad/index.js', 'module.exports = 0;\n');
  g('add', '-A', '-f');
  const s = snap(dir).json;
  check(!s.topLevelDirs.includes('node_modules'), 'snapshot: node_modules excluded from topLevelDirs');
  check(!s.directoryShape.some((d) => d.dir === 'node_modules'), 'snapshot: node_modules excluded from directoryShape');
}

// ── truncation + size cap ────────────────────────────────────────────────────
{
  const { dir, g } = newRepo();
  for (let i = 0; i < 60; i++) W(dir, `d${String(i).padStart(2, '0')}/f.txt`, 'x\n');
  g('add', '-A'); g('commit', '-qm', 'many dirs');
  const s = snap(dir).json;
  check(s.topLevelDirs.length === 50, 'snapshot: topLevelDirs capped at 50');
  check(s.truncated.topLevelDirs === true, 'snapshot: truncation is explicit when a cap is hit');
}
{
  const { dir } = fixtureRepo();
  const s = snap(dir).json;
  check(Buffer.byteLength(JSON.stringify(s, null, 2), 'utf8') <= 16384, 'snapshot: serialized output within the 16 KB cap');
}

// ── worktree identity distinct ───────────────────────────────────────────────
{
  const { dir, g } = fixtureRepo();
  const main = snap(dir).json;
  check(main.worktree.isLinked === false, 'snapshot: main worktree is not linked');
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'cow-snap-wt-')); tmps.push(wt);
  fs.rmSync(wt, { recursive: true, force: true });
  g('worktree', 'add', '-q', '-b', 'wtb', wt);
  const linked = snap(wt).json;
  check(linked.worktree.isLinked === true, 'snapshot: linked worktree reports isLinked=true');
  check(linked.worktree.branch === 'wtb' && main.worktree.branch !== 'wtb', 'snapshot: worktree identity (branch) is distinct');
  g('worktree', 'remove', '--force', wt);
}

// ── profile freshness classification (VALID/STALE/MISSING/INVALID) ───────────
{
  const { dir } = fixtureRepo();
  const current = fp(dir);
  const pPath = path.join(dir, 'profile.json');
  fs.writeFileSync(pPath, JSON.stringify({ schemaVersion: 1, fingerprint: current }));
  check(checkProfile(dir, 'profile.json').out === 'VALID', 'check-profile: matching fingerprint => VALID (exit 0)');
  check(checkProfile(dir, 'profile.json').status === 0, 'check-profile: VALID exits 0');

  fs.writeFileSync(pPath, JSON.stringify({ schemaVersion: 1, fingerprint: '0'.repeat(64) }));
  let r = checkProfile(dir, 'profile.json');
  check(r.out === 'STALE' && r.status === 2, 'check-profile: fingerprint mismatch => STALE (exit 2)');

  fs.writeFileSync(pPath, JSON.stringify({ schemaVersion: 2, fingerprint: current }));
  check(checkProfile(dir, 'profile.json').out === 'STALE', 'check-profile: schema bump => STALE');

  r = checkProfile(dir, 'does-not-exist.json');
  check(r.out === 'MISSING' && r.status === 3, 'check-profile: absent file => MISSING (exit 3)');

  fs.writeFileSync(pPath, 'not json {');
  r = checkProfile(dir, 'profile.json');
  check(r.out === 'INVALID' && r.status === 4, 'check-profile: unparseable => INVALID (exit 4)');

  fs.writeFileSync(pPath, JSON.stringify({ schemaVersion: 1 })); // no fingerprint
  check(checkProfile(dir, 'profile.json').out === 'INVALID', 'check-profile: missing fingerprint => INVALID');
}

// ── git-unavailable / not-a-repo behaviour ───────────────────────────────────
{
  const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'cow-norepo-')); tmps.push(nonRepo);
  const r = spawnSync('node', [SNAP, 'print'], { cwd: nonRepo, encoding: 'utf8' });
  check(r.status !== 0, 'snapshot: outside a git repo exits non-zero with a clear message');
}

// ── §10.3 runtime-package allowlist path guarantee ───────────────────────────
{
  check(fs.existsSync(SNAP), 'runtime-path: repo-snapshot.mjs exists at the colocated skills path');
  check(fs.existsSync(COW_STATE), 'runtime-path: cow-state.mjs exists at the colocated skills path');
  check(ALLOW_PREFIX.includes('skills/'), 'runtime-path: package rules ALLOW_PREFIX includes skills/');
  check(ALLOW_PREFIX.includes('agents/'), 'runtime-path: package rules ALLOW_PREFIX includes agents/');
  const rels = ['skills/repository-intake/scripts/repo-snapshot.mjs', 'skills/execution-routing/scripts/cow-state.mjs'];
  for (const rel of rels) {
    check(ALLOW_PREFIX.some((p) => rel.startsWith(p)), `runtime-path: ${rel} is allowlisted`);
    check(!DENY_PREFIX.some((p) => rel.startsWith(p)), `runtime-path: ${rel} is not denylisted`);
  }
}

// ── cleanup + summary ────────────────────────────────────────────────────────
for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } }
console.log(`\nrepo-intake: ${passes} checks passed, ${fails} failed.`);
if (fails > 0) process.exit(1);
console.log('repository intake foundation OK.');

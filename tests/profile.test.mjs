#!/usr/bin/env node
// Deterministic tests for the Phase 3A discovery control plane's deterministic
// pieces: repo-profile.mjs (profile acceptance) and `cow-state.mjs profile`.
// Throwaway git repos under the OS temp dir. Run: npm run test:profile

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..');
const PROFILE = path.join(REPO, 'skills/repository-intake/scripts/repo-profile.mjs');
const SNAP = path.join(REPO, 'skills/repository-intake/scripts/repo-snapshot.mjs');
const STATE = path.join(REPO, 'skills/execution-routing/scripts/cow-state.mjs');

let fails = 0, passes = 0;
const check = (c, m) => { if (c) passes += 1; else { fails += 1; console.error('FAIL: ' + m); } };
const tmps = [];

function newRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cow-profile-'));
  tmps.push(dir);
  const g = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  g('init', '-q'); g('config', 'user.email', 't@e.com'); g('config', 'user.name', 't'); g('config', 'core.autocrlf', 'false');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "name":"f","version":"1.0.0","scripts":{"build":"x","test":"y"} }\n');
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# rules\n');
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'export const a=1;\n');
  g('add', '-A'); g('commit', '-qm', 'init');
  return { dir, g, root: g('rev-parse', '--show-toplevel').stdout.trim() };
}
const runDir = (root) => path.join(root, '.cost-oriented-agentic-workflow', 'run');
const profPath = (root) => path.join(runDir(root), 'repo-profile.json');
const node = (script, cwd, ...args) => spawnSync('node', [script, ...args], { cwd, encoding: 'utf8' });
function setupSnapshot(dir) {
  node(SNAP, dir, 'write');
  return node(SNAP, dir, 'fingerprint').stdout.trim();
}
function validProfile(fp, over = {}) {
  return Object.assign({
    schemaVersion: 1, fingerprint: fp, status: 'ready', generatedAtCommit: null,
    instructionSources: ['CLAUDE.md'],
    languages: [{ name: 'JavaScript', ext: '.js' }],
    buildCommands: [{ command: 'npm run build', confidence: 'inferred' }],
    testCommands: [{ command: 'npm test', confidence: 'inferred' }],
    subsystems: [{ name: 'core', paths: ['src/**'], status: 'mapped', confidence: 'inferred', notes: 'entry' }],
    conventions: ['esm modules'], riskHotspots: ['src/auth/**'], unmapped: [], uncertainty: ['none'],
  }, over);
}
function envelope(status, profileObj, { dupes = 1, trailing = '' } = {}) {
  let body = `STATUS: ${status}\n`;
  for (let i = 0; i < dupes; i++) body += `PROFILE_JSON_BEGIN\n${JSON.stringify(profileObj, null, 2)}\nPROFILE_JSON_END\n`;
  body += `UNCERTAINTIES_BEGIN\n- none\nUNCERTAINTIES_END\n${trailing}`;
  return body;
}
function writeRaw(root, text) {
  fs.mkdirSync(runDir(root), { recursive: true });
  const p = path.join(runDir(root), 'repo-profile-agent-output.txt');
  fs.writeFileSync(p, text);
  return p;
}
const accept = (dir, raw) => node(PROFILE, dir, 'accept-agent-output', raw, '--snapshot', path.join(runDir(dir), 'repo-snapshot.json'));
const validateOut = (dir, raw) => node(PROFILE, dir, 'validate-agent-output', raw, '--snapshot', path.join(runDir(dir), 'repo-snapshot.json'));

// ── 13.1 profile acceptance ──────────────────────────────────────────────────
{
  const { dir, root } = newRepo();
  const fp = setupSnapshot(dir);
  const raw = writeRaw(root, envelope('READY', validProfile(fp)));
  const v = validateOut(dir, raw);
  check(v.status === 0 && /VALID/.test(v.stdout), 'valid envelope validates');
  const a = accept(dir, raw);
  check(a.status === 0 && /ACCEPTED/.test(a.stdout), 'valid envelope accepted');
  check(fs.existsSync(profPath(root)), 'repo-profile.json written');
  check(fs.existsSync(path.join(runDir(root), 'repo-profile.md')), 'repo-profile.md rendered');
  check(fs.existsSync(path.join(runDir(root), 'repo-profile.candidate.json')), 'candidate written');
  check(JSON.parse(fs.readFileSync(profPath(root), 'utf8')).fingerprint === fp, 'accepted profile carries the snapshot fingerprint');
  const leftover = fs.readdirSync(runDir(root)).filter((f) => f.includes('.tmp'));
  check(leftover.length === 0, 'atomic: no leftover .tmp files');
}
{
  const { dir, root } = newRepo(); const fp = setupSnapshot(dir);
  check(accept(dir, writeRaw(root, 'no status, no delimiters')).status === 3, 'malformed envelope rejected');
  check(accept(dir, writeRaw(root, envelope('READY', validProfile(fp), { dupes: 2 }))).status === 3, 'duplicate JSON blocks rejected');
  check(accept(dir, writeRaw(root, envelope('BLOCKED_INPUT', validProfile(fp)))).status === 3, 'BLOCKED_INPUT rejected (no profile)');
  check(accept(dir, writeRaw(root, envelope('READY', validProfile(fp, { schemaVersion: 2 })))).status === 3, 'wrong schemaVersion rejected');
  check(accept(dir, writeRaw(root, envelope('READY', validProfile('0'.repeat(64))))).status === 3, 'wrong fingerprint rejected');
  check(accept(dir, writeRaw(root, envelope('READY', validProfile(fp, { riskHotspots: ['../escape'] })))).status === 3, 'unsafe path rejected');
  check(accept(dir, writeRaw(root, envelope('READY', validProfile(fp, { buildCommands: [{ command: 'npm run build', confidence: 'verified' }] })))).status === 3, 'verified command from agent rejected');
  const big = validProfile(fp, { conventions: Array.from({ length: 400 }, (_, i) => 'convention number ' + i + ' padding padding padding') });
  check(accept(dir, writeRaw(root, envelope('READY', big))).status === 3, 'oversized profile rejected');
  // a secret-like field
  check(accept(dir, writeRaw(root, envelope('READY', validProfile(fp, { conventions: ['api_key= sk-abcdef'] })))).status === 3, 'secret-like field rejected');
}
{ // PARTIAL not promoted to VALID
  const { dir, root } = newRepo(); const fp = setupSnapshot(dir);
  const a = accept(dir, writeRaw(root, envelope('PARTIAL', validProfile(fp, { status: 'ready' }))));
  check(a.status === 0 && JSON.parse(fs.readFileSync(profPath(root), 'utf8')).status === 'partial', 'PARTIAL envelope stored as status=partial');
  const st = node(PROFILE, dir, 'status', '--snapshot', path.join(runDir(dir), 'repo-snapshot.json'));
  check(st.status === 2 && /PARTIAL/.test(st.stdout), 'status reports PARTIAL, not VALID');
}
{ // previous valid profile preserved after a failed acceptance
  const { dir, root } = newRepo(); const fp = setupSnapshot(dir);
  accept(dir, writeRaw(root, envelope('READY', validProfile(fp))));
  const before = fs.readFileSync(profPath(root), 'utf8');
  const bad = accept(dir, writeRaw(root, envelope('READY', validProfile('0'.repeat(64)))));
  check(bad.status === 3, 'second (bad) acceptance fails');
  check(fs.readFileSync(profPath(root), 'utf8') === before, 'previous valid profile preserved after failure');
}
{ // deterministic render + status VALID
  const { dir, root } = newRepo(); const fp = setupSnapshot(dir);
  accept(dir, writeRaw(root, envelope('READY', validProfile(fp))));
  node(PROFILE, dir, 'render'); const md1 = fs.readFileSync(path.join(runDir(root), 'repo-profile.md'), 'utf8');
  node(PROFILE, dir, 'render'); const md2 = fs.readFileSync(path.join(runDir(root), 'repo-profile.md'), 'utf8');
  check(md1 === md2 && md1.split('\n').length <= 151, 'deterministic, bounded Markdown render');
  const st = node(PROFILE, dir, 'status', '--snapshot', path.join(runDir(dir), 'repo-snapshot.json'));
  check(st.status === 0 && /VALID/.test(st.stdout), 'status reports VALID for a ready profile matching the snapshot');
  // STALE after a manifest change
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "name":"f","version":"2.0.0","dependencies":{"x":"^1"} }\n');
  node(SNAP, dir, 'write');
  const st2 = node(PROFILE, dir, 'status', '--snapshot', path.join(runDir(dir), 'repo-snapshot.json'));
  check(st2.status === 2 && /STALE/.test(st2.stdout), 'status reports STALE after a manifest change');
}
{ // MISSING / INVALID status
  const { dir } = newRepo(); setupSnapshot(dir);
  check(/MISSING/.test(node(PROFILE, dir, 'status', '--snapshot', path.join(runDir(dir), 'repo-snapshot.json')).stdout), 'status MISSING when no profile');
}

// ── 13.2 cow-state.mjs profile command ───────────────────────────────────────
const cow = (dir, ...args) => node(STATE, dir, ...args);
const readState = (root) => JSON.parse(fs.readFileSync(path.join(runDir(root), 'state.json'), 'utf8'));
{
  const { dir, root } = newRepo();
  cow(dir, 'init');
  const r = cow(dir, 'profile', '--status', 'warm', '--snapshot', '.cost-oriented-agentic-workflow/run/repo-snapshot.json', '--profile', '.cost-oriented-agentic-workflow/run/repo-profile.json', '--fingerprint', 'a'.repeat(64));
  check(r.status === 0, 'profile --status warm succeeds');
  const s = readState(root).repositoryProfile;
  check(s.status === 'warm' && s.profilePath.endsWith('repo-profile.json') && s.fingerprint === 'a'.repeat(64) && typeof s.updatedAt === 'string', 'repositoryProfile fields recorded');
  check(cow(dir, 'profile', '--status', 'stale').status === 0 && readState(root).repositoryProfile.status === 'stale', 'profile --status stale (STALE→stale)');
  check(cow(dir, 'profile', '--status', 'absent').status === 0 && readState(root).repositoryProfile.status === 'absent', 'profile --status absent (MISSING/INVALID→absent)');
}
{
  const { dir, root } = newRepo();
  cow(dir, 'init');
  const before = fs.readFileSync(path.join(runDir(root), 'state.json'), 'utf8');
  check(cow(dir, 'profile', '--status', 'bogus').status !== 0, 'invalid profile status rejected');
  check(cow(dir, 'profile', '--status', 'warm', '--profile', '../escape.json').status !== 0, 'unsafe profile path rejected');
  check(fs.readFileSync(path.join(runDir(root), 'state.json'), 'utf8') === before, 'no mutation after a failed profile update');
  // profile command does not touch phase or other fields
  cow(dir, 'profile', '--status', 'warm');
  check(readState(root).phase === 'triage', 'profile command does not change phase');
}

// ── BOM tolerance (Phase 3A.1): a leading UTF-8 BOM must not read as INVALID ──
{
  const { dir, root } = newRepo();
  const fp = setupSnapshot(dir);
  fs.writeFileSync(profPath(root), '\uFEFF' + JSON.stringify(validProfile(fp), null, 2) + '\n');
  const st = node(PROFILE, dir, 'status', '--snapshot', path.join(runDir(dir), 'repo-snapshot.json'));
  check(st.status === 0 && /VALID/.test(st.stdout), 'BOM: a BOM-prefixed profile reads as VALID, not INVALID');
  // a BOM-prefixed snapshot is also tolerated by acceptance
  const snap = path.join(runDir(root), 'repo-snapshot.json');
  fs.writeFileSync(snap, '\uFEFF' + fs.readFileSync(snap, 'utf8'));
  const raw = writeRaw(root, '\uFEFF' + envelope('READY', validProfile(fp)));
  check(accept(dir, raw).status === 0, 'BOM: a BOM-prefixed snapshot + envelope still accept');
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } }
console.log(`\nprofile: ${passes} checks passed, ${fails} failed.`);
if (fails > 0) process.exit(1);
console.log('profile acceptance + state OK.');

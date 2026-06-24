#!/usr/bin/env node
// Build a MINIMAL, installable runtime package for the plugin — only the files
// Claude Code needs to load and run it — outside the source repository.
//
// Node standard library + Git only. No npm dependency. The package is built
// from GIT-TRACKED content (never the live working tree), filtered through an
// explicit ALLOWLIST, cross-checked against a DENYLIST, and self-validated
// before success is reported. The development repository (tests, docs, scripts,
// evals, CHANGELOG, .git, …) is intentionally excluded.
//
// Usage:
//   node scripts/build-runtime-package.mjs            # -> ../<name>-runtime/
//   node scripts/build-runtime-package.mjs --out DIR  # custom output root (must be outside the repo)

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

// ── Runtime allowlist / denylist ────────────────────────────────────────────
const ALLOW_EXACT = new Set([
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'hooks/session-start',
  'hooks/run-hook.cmd',
  'hooks/README.md',
  'hooks/hooks.json.example',
  'README.md',
  'LICENSE',
]);
const ALLOW_PREFIX = ['commands/', 'skills/'];

// Files that must be present for a usable runtime package.
const REQUIRED = [
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'commands/cost-oriented-agentic-workflow.md',
  'commands/production.md',
  'skills/using-cost-oriented-workflow/SKILL.md',
  'skills/execution-routing/SKILL.md',
  'hooks/session-start',
  'README.md',
  'LICENSE',
];

// Tracked files that must carry the executable bit in the runtime package.
const EXEC_REQUIRED = [
  'hooks/session-start',
  'skills/execution-routing/scripts/cow-workspace',
  'skills/execution-routing/scripts/task-brief',
  'skills/execution-routing/scripts/review-package',
];

const DENY_PREFIX = [
  '.git/', '.github/', '.cost-oriented-agentic-workflow/', 'tests/', 'docs/',
  'scripts/', 'dist/', 'node_modules/',
];
const DENY_EXACT = new Set([
  'package.json', 'package-lock.json', 'CHANGELOG.md', '.gitignore',
]);

const isAllowed = (p) => ALLOW_EXACT.has(p) || ALLOW_PREFIX.some((pre) => p.startsWith(pre));
const isDenied = (p) => DENY_EXACT.has(p) || DENY_PREFIX.some((pre) => p.startsWith(pre));

// ── Small utilities ─────────────────────────────────────────────────────────
const here = path.dirname(fileURLToPath(import.meta.url));
const die = (msg) => { console.error(`build-runtime-package: ERROR: ${msg}`); process.exit(1); };
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const toGit = (p) => p.split(path.sep).join('/');

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: REPO, maxBuffer: 1 << 28, ...opts });
}
function gitStr(args) {
  return git(args, { encoding: 'utf8' }).trim();
}

function requireGit() {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); }
  catch { die('git is required but was not found on PATH.'); }
}

function resolveRepoRoot() {
  const top = execFileSync('git', ['-C', here, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  return path.resolve(top);
}

function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));
}

function walkFiles(root, base = root, acc = []) {
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const abs = path.join(root, e.name);
    if (e.isDirectory()) walkFiles(abs, base, acc);
    else acc.push(toGit(path.relative(base, abs)));
  }
  return acc;
}

// Minimal ZIP central-directory reader (no zip64; sufficient for git-archive
// output). Returns [{ name, unixMode }] for every entry.
function readZipEntries(buf) {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) die('ZIP end-of-central-directory record not found.');
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) die('ZIP central-directory record malformed.');
    const externalAttr = buf.readUInt32LE(off + 38);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    out.push({ name, unixMode: (externalAttr >>> 16) & 0xffff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ── Resolve repository + git ────────────────────────────────────────────────
requireGit();
let REPO;
try { REPO = resolveRepoRoot(); }
catch { die('could not resolve the repository root (is this a git checkout?).'); }

// ── Args ────────────────────────────────────────────────────────────────────
let outArg = null;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') outArg = argv[++i];
  else die(`unknown argument: ${argv[i]}`);
}

// ── Version agreement ───────────────────────────────────────────────────────
const plugin = readJSON('.claude-plugin/plugin.json');
const pkg = readJSON('package.json');
const market = readJSON('.claude-plugin/marketplace.json');
const NAME = plugin.name;
const marketEntry = (market.plugins || []).find((p) => p.name === NAME);
if (!marketEntry) die(`marketplace.json does not list plugin "${NAME}".`);
const versions = { plugin: plugin.version, package: pkg.version, marketplace: marketEntry.version };
const VERSION = plugin.version;
if (versions.package !== VERSION || versions.marketplace !== VERSION) {
  die(`version mismatch: ${JSON.stringify(versions)}`);
}

// ── HEAD + clean tracked tree ───────────────────────────────────────────────
const HEAD = gitStr(['rev-parse', 'HEAD']);
const statusBefore = gitStr(['status', '--porcelain']);
if (statusBefore !== '') {
  die('working tree is not clean (tracked changes present). Commit or stash before packaging.\n' + statusBefore);
}

// ── Enumerate tracked files + modes, filter through the allowlist ────────────
const tracked = gitStr(['ls-files', '-s']).split('\n').filter(Boolean).map((line) => {
  // <mode> <sha> <stage>\t<path>
  const [meta, p] = line.split('\t');
  const [mode] = meta.split(' ');
  return { mode, path: p };
});
const trackedSet = new Set(tracked.map((t) => t.path));
const allowed = tracked.filter((t) => isAllowed(t.path)).sort((a, b) => (a.path < b.path ? -1 : 1));

for (const f of allowed) {
  if (isDenied(f.path)) die(`allowlist/denylist conflict: ${f.path} is both allowed and denied.`);
}
for (const r of REQUIRED) {
  if (!allowed.some((f) => f.path === r)) die(`required runtime file is missing from tracked content: ${r}`);
}
for (const x of EXEC_REQUIRED) {
  const f = allowed.find((t) => t.path === x);
  if (!f) die(`required executable missing: ${x}`);
  if (f.mode !== '100755') die(`required executable lacks the git index exec bit: ${x} (mode ${f.mode})`);
}

// ── Resolve + guard the output location ─────────────────────────────────────
const defaultOut = path.resolve(REPO, '..', `${NAME}-runtime`);
const outRoot = outArg ? path.resolve(outArg) : defaultOut;
const relFromRepo = path.relative(REPO, outRoot);
const insideRepo = relFromRepo === '' || (!relFromRepo.startsWith('..') && !path.isAbsolute(relFromRepo));
if (insideRepo) die(`refusing unsafe output root inside the repository: ${outRoot}`);
if (path.basename(outRoot) === '.git' || outRoot.split(path.sep).includes('.git')) {
  die(`refusing output root in a .git path: ${outRoot}`);
}

const runtimeDir = path.join(outRoot, `${NAME}-${VERSION}`);
const zipPath = path.join(outRoot, `${NAME}-${VERSION}.zip`);
const shaPath = path.join(outRoot, `${NAME}-${VERSION}.sha256`);
const manifestPath = path.join(outRoot, `${NAME}-${VERSION}.manifest.json`);

// Only the exact versioned outputs may be replaced, and only inside outRoot.
const insideOut = (p) => {
  const rel = path.relative(outRoot, p);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};
fs.mkdirSync(outRoot, { recursive: true });
for (const target of [runtimeDir, zipPath, shaPath, manifestPath]) {
  if (fs.existsSync(target)) {
    if (!insideOut(target)) die(`refusing to replace a path outside the output root: ${target}`);
    fs.rmSync(target, { recursive: true, force: true });
  }
}

// ── Build the runtime directory from tracked content ────────────────────────
const manifestFiles = [];
for (const f of allowed) {
  const content = git(['show', `HEAD:${f.path}`]); // Buffer of the tracked blob
  const dest = path.join(runtimeDir, f.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
  fs.chmodSync(dest, f.mode === '100755' ? 0o755 : 0o644);
  manifestFiles.push({ path: f.path, sha256: sha256(content), mode: f.mode });
}
manifestFiles.sort((a, b) => (a.path < b.path ? -1 : 1));

// ── Build the ZIP via git archive (tracked content, exec bits preserved) ─────
git(['archive', '--format=zip', `--output=${toGit(zipPath)}`, 'HEAD', '--', ...allowed.map((f) => f.path)]);
const zipBuf = fs.readFileSync(zipPath);
const zipHash = sha256(zipBuf);
fs.writeFileSync(shaPath, `${zipHash}  ${path.basename(zipPath)}\n`);

// ── Manifest ────────────────────────────────────────────────────────────────
const manifest = {
  name: NAME,
  version: VERSION,
  sourceCommit: HEAD,
  fileCount: manifestFiles.length,
  files: manifestFiles,
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// ── Self-validation ─────────────────────────────────────────────────────────
const checks = [];
const ok = (name) => checks.push(`PASS: ${name}`);
const bad = (name) => { checks.push(`FAIL: ${name}`); };

ok(`versions agree (${VERSION})`);
ok(`source HEAD known (${HEAD.slice(0, 12)})`);
ok('tracked working tree was clean');

// directory ↔ manifest
const dirFiles = walkFiles(runtimeDir).sort();
const manifestPaths = manifestFiles.map((f) => f.path).sort();
(dirFiles.length === manifest.fileCount && JSON.stringify(dirFiles) === JSON.stringify(manifestPaths))
  ? ok(`runtime directory matches manifest (${manifest.fileCount} files)`)
  : bad('runtime directory matches manifest');

// every file: tracked source, not denied, write-back hash == source hash
let hashOk = true, sourceOk = true, denyOk = true;
for (const f of manifestFiles) {
  if (!trackedSet.has(f.path)) sourceOk = false;
  if (isDenied(f.path)) denyOk = false;
  const onDisk = sha256(fs.readFileSync(path.join(runtimeDir, f.path)));
  const fromGit = sha256(git(['show', `HEAD:${f.path}`]));
  if (onDisk !== f.sha256 || fromGit !== f.sha256) hashOk = false;
}
sourceOk ? ok('every runtime file came from a tracked source file') : bad('every runtime file came from a tracked source file');
denyOk ? ok('no forbidden path in the runtime package') : bad('no forbidden path in the runtime package');
hashOk ? ok('every runtime file hash matches its tracked source content') : bad('every runtime file hash matches its tracked source content');

// executable modes in the directory + git index
let dirExecOk = true;
for (const x of EXEC_REQUIRED) {
  const entry = manifestFiles.find((f) => f.path === x);
  if (!entry || entry.mode !== '100755') dirExecOk = false;
  if (process.platform !== 'win32') {
    const m = fs.statSync(path.join(runtimeDir, x)).mode;
    if (!(m & 0o100)) dirExecOk = false;
  }
}
dirExecOk
  ? ok(`executable modes match the git index${process.platform === 'win32' ? ' (manifest; fs bits not enforced on win32)' : ''}`)
  : bad('executable modes match the git index');

// ZIP: created, entries == manifest, no forbidden, exec bits preserved, checksum present
let zipOk = fs.existsSync(zipPath) && zipBuf.length > 0;
const zipEntries = readZipEntries(zipBuf);
const zipFiles = zipEntries.filter((e) => !e.name.endsWith('/')).map((e) => e.name).sort();
const zipMatches = JSON.stringify(zipFiles) === JSON.stringify(manifestPaths);
const zipNoForbidden = zipFiles.every((n) => !isDenied(n));
let zipExecOk = true;
for (const x of EXEC_REQUIRED) {
  const e = zipEntries.find((z) => z.name === x);
  if (!e || !(e.unixMode & 0o111)) zipExecOk = false;
}
zipOk ? ok(`ZIP created (${zipBuf.length} bytes)`) : bad('ZIP created');
zipMatches ? ok('ZIP entries match the runtime allowlist') : bad('ZIP entries match the runtime allowlist');
zipNoForbidden ? ok('no forbidden path in the ZIP') : bad('no forbidden path in the ZIP');
zipExecOk ? ok('ZIP preserves Unix executable metadata') : bad('ZIP preserves Unix executable metadata');
fs.existsSync(shaPath) ? ok('ZIP SHA-256 checksum written') : bad('ZIP SHA-256 checksum written');

// package does not contain itself
const selfContained = [zipPath, shaPath, manifestPath].some((p) => {
  const rel = path.relative(runtimeDir, p);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
});
selfContained ? bad('runtime package does not contain itself') : ok('runtime package does not contain itself');

// source repo unmodified by the build
const statusAfter = gitStr(['status', '--porcelain']);
const headAfter = gitStr(['rev-parse', 'HEAD']);
(statusAfter === statusBefore && headAfter === HEAD)
  ? ok('source repository was not modified by the build')
  : bad('source repository was not modified by the build');

// ── Report ──────────────────────────────────────────────────────────────────
for (const line of checks) console.log(line);
const failed = checks.filter((c) => c.startsWith('FAIL')).length;
console.log('');
console.log(`output root : ${outRoot}`);
console.log(`runtime dir : ${runtimeDir}  (${manifest.fileCount} files)`);
console.log(`zip         : ${zipPath}  (${zipBuf.length} bytes)`);
console.log(`sha256      : ${zipHash}`);
console.log(`manifest    : ${manifestPath}`);
console.log(`source HEAD : ${HEAD}`);
console.log('');
if (failed) die(`${failed} validation check(s) failed — package is NOT trustworthy.`);
console.log(`runtime package ${NAME}-${VERSION} READY (${manifest.fileCount} files, all validations passed).`);

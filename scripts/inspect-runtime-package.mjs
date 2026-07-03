#!/usr/bin/env node
// Inspect a generated runtime package WITHOUT rebuilding it.
//
// The inspector's job is to catch a stale, tampered, or incomplete artifact,
// so it re-verifies the package against the same shared rules the builder
// used: manifest-internal consistency, manifest ↔ runtime-directory set
// equality, per-file SHA-256 content hashes, required files, executable
// modes (manifest, filesystem, and ZIP), ZIP entry equality, deny rules,
// the personal-path defense, and the checksum sidecar. Any mismatch exits
// non-zero. Node standard library only; zero runtime dependencies.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

import {
  isDenied, isSafePackagePath, PERSONAL_PATH_RE,
  REQUIRED, EXEC_REQUIRED, sha256, walkFiles, readZipEntries,
} from './runtime-package-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(execFileSync('git', ['-C', here, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const die = (msg) => { console.error(`inspect-runtime-package: ERROR: ${msg}`); process.exit(1); };

function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(repo, rel), 'utf8'));
}

let outArg = null;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') outArg = argv[++i];
  else die(`unknown argument: ${argv[i]}`);
}

const plugin = readJSON('.claude-plugin/plugin.json');
const outRoot = outArg ? path.resolve(outArg) : path.resolve(repo, '..', `${plugin.name}-runtime`);
const base = `${plugin.name}-${plugin.version}`;
const runtimeDir = path.join(outRoot, base);
const manifestPath = path.join(outRoot, `${base}.manifest.json`);
const zipPath = path.join(outRoot, `${base}.zip`);
const shaPath = path.join(outRoot, `${base}.sha256`);

for (const p of [runtimeDir, manifestPath, zipPath, shaPath]) {
  if (!fs.existsSync(p)) die(`missing generated package artifact: ${p}`);
}

// ── Manifest-internal consistency ────────────────────────────────────────────
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1) die('manifest schemaVersion must be 1.');
if (manifest.packageKind !== 'runtime-candidate') die('manifest packageKind must be runtime-candidate.');
if (manifest.name !== plugin.name || manifest.version !== plugin.version) die('manifest identity does not match plugin.json.');
if (!Array.isArray(manifest.files) || manifest.files.length === 0) die('manifest.files must be a non-empty array.');

const paths = manifest.files.map((f) => f.path);
const sorted = [...paths].sort();
if (manifest.fileCount !== paths.length) die(`manifest fileCount (${manifest.fileCount}) does not match files length (${paths.length}).`);
if (JSON.stringify(paths) !== JSON.stringify(sorted)) die('manifest file ordering is not deterministic.');
if (new Set(paths).size !== paths.length) die('manifest contains duplicate paths.');
for (const p of paths) {
  if (!isSafePackagePath(p)) die(`unsafe manifest path: ${p}`);
  if (isDenied(p)) die(`forbidden path in manifest: ${p}`);
}
if (paths.includes('hooks/hooks.json')) die('active hooks/hooks.json is present in the manifest.');
for (const r of REQUIRED) {
  if (!paths.includes(r)) die(`required runtime file missing from manifest: ${r}`);
}
const agents = paths.filter((p) => p.startsWith('agents/') && p.endsWith('.md'));
if (agents.length !== 4) die(`expected exactly four packaged agents, found ${agents.length}.`);

// ── Runtime directory ↔ manifest set equality ────────────────────────────────
const dirFiles = walkFiles(runtimeDir).sort();
if (JSON.stringify(dirFiles) !== JSON.stringify(sorted)) {
  const dirSet = new Set(dirFiles);
  const manSet = new Set(paths);
  const extra = dirFiles.filter((f) => !manSet.has(f));
  const missing = paths.filter((f) => !dirSet.has(f));
  die(`runtime directory does not match the manifest (extra: ${JSON.stringify(extra)}; missing: ${JSON.stringify(missing)}).`);
}
if (dirFiles.includes('hooks/hooks.json')) die('active hooks/hooks.json is present in the runtime directory.');
if (dirFiles.filter((p) => p.startsWith('agents/') && p.endsWith('.md')).length !== 4) {
  die('runtime directory does not contain exactly four agents.');
}

// ── Per-file content hashes + personal-path defense ──────────────────────────
for (const f of manifest.files) {
  const buf = fs.readFileSync(path.join(runtimeDir, f.path));
  if (sha256(buf) !== f.sha256) die(`content hash mismatch: ${f.path} on disk differs from the manifest.`);
  if (PERSONAL_PATH_RE.test(buf.toString('utf8'))) die(`personal absolute path found in packaged file: ${f.path}`);
}

// ── Executable modes (manifest + filesystem where enforceable) ───────────────
const modeByPath = new Map(manifest.files.map((f) => [f.path, f.mode]));
for (const x of EXEC_REQUIRED) {
  if (modeByPath.get(x) !== '100755') die(`required executable lacks mode 100755 in the manifest: ${x}`);
  if (process.platform !== 'win32') {
    const m = fs.statSync(path.join(runtimeDir, x)).mode;
    if (!(m & 0o100)) die(`required executable lacks the filesystem exec bit: ${x}`);
  }
}

// ── ZIP entries, exec metadata, and checksum sidecar ─────────────────────────
const zipBuf = fs.readFileSync(zipPath);
let zipEntries;
try { zipEntries = readZipEntries(zipBuf); }
catch (e) { die(`ZIP is unreadable: ${e.message}`); }
const zipFiles = zipEntries.filter((e) => !e.name.endsWith('/')).map((e) => e.name).sort();
if (JSON.stringify(zipFiles) !== JSON.stringify(sorted)) die('ZIP entries do not match the manifest.');
if (zipFiles.includes('hooks/hooks.json')) die('active hooks/hooks.json is present in the ZIP.');
for (const x of EXEC_REQUIRED) {
  const e = zipEntries.find((z) => z.name === x);
  if (!e || !(e.unixMode & 0o111)) die(`ZIP does not preserve executable metadata for: ${x}`);
}
const zipHash = sha256(zipBuf);
const shaText = fs.readFileSync(shaPath, 'utf8').trim();
if (!shaText.startsWith(zipHash + '  ')) die('zip checksum file does not match zip bytes.');

console.log(JSON.stringify({
  name: manifest.name,
  version: manifest.version,
  sourceCommit: manifest.sourceCommit,
  fileCount: manifest.fileCount,
  agentCount: agents.length,
  zipSha256: zipHash,
  manifestPath,
  zipPath,
}, null, 2));

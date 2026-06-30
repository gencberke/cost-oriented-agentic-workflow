#!/usr/bin/env node
// Inspect a generated runtime package manifest/checksum without rebuilding it.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(execFileSync('git', ['-C', here, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const die = (msg) => { console.error(`inspect-runtime-package: ERROR: ${msg}`); process.exit(1); };
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

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

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1) die('manifest schemaVersion must be 1.');
if (manifest.packageKind !== 'runtime-candidate') die('manifest packageKind must be runtime-candidate.');
if (manifest.name !== plugin.name || manifest.version !== plugin.version) die('manifest identity does not match plugin.json.');

const paths = manifest.files.map((f) => f.path);
const sorted = [...paths].sort();
if (JSON.stringify(paths) !== JSON.stringify(sorted)) die('manifest file ordering is not deterministic.');
if (new Set(paths).size !== paths.length) die('manifest contains duplicate paths.');
if (paths.includes('hooks/hooks.json')) die('active hooks/hooks.json is present in the runtime package.');
const agents = paths.filter((p) => p.startsWith('agents/') && p.endsWith('.md'));
if (agents.length !== 4) die(`expected exactly four packaged agents, found ${agents.length}.`);
for (const deny of ['tests/', 'docs/', 'scripts/', 'dist/', '.git/', 'node_modules/']) {
  if (paths.some((p) => p.startsWith(deny))) die(`forbidden runtime path prefix present: ${deny}`);
}

const zipHash = sha256(fs.readFileSync(zipPath));
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

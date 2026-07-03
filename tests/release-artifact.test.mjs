#!/usr/bin/env node
// Phase 7A runtime package and release-gate tests. Node stdlib only.

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passes = 0;
let fails = 0;
const tmps = [];

function check(cond, msg) {
  if (cond) {
    passes += 1;
  } else {
    fails += 1;
    console.error(`FAIL: ${msg}`);
  }
}
function run(args, opts = {}) {
  return spawnSync(args[0], args.slice(1), { cwd: root, encoding: 'utf8', ...opts });
}
function tmpdir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cow-release-'));
  tmps.push(d);
  return d;
}
function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function walk(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, base, acc);
    else acc.push(path.relative(base, abs).replace(/\\/g, '/'));
  }
  return acc;
}

console.log('Running Phase 7A release package tests...');

const out1 = path.join(tmpdir(), 'out');
const out2 = path.join(tmpdir(), 'out');
const build1 = run([process.execPath, 'scripts/build-runtime-package.mjs', '--out', out1]);
check(build1.status === 0, 'runtime build succeeds from a clean tree');
if (build1.status !== 0) console.error(build1.stderr || build1.stdout);

const plugin = readJSON(path.join(root, '.claude-plugin/plugin.json'));
const base = `${plugin.name}-${plugin.version}`;
const runtimeDir = path.join(out1, base);
const manifestPath = path.join(out1, `${base}.manifest.json`);
const zipPath = path.join(out1, `${base}.zip`);
const shaPath = path.join(out1, `${base}.sha256`);

check(fs.existsSync(runtimeDir), 'runtime directory exists');
check(fs.existsSync(manifestPath), 'runtime manifest exists');
check(fs.existsSync(zipPath), 'runtime zip exists');
check(fs.existsSync(shaPath), 'runtime sha256 exists');

const manifest = fs.existsSync(manifestPath) ? readJSON(manifestPath) : { files: [] };
const paths = manifest.files.map((f) => f.path);
const pathSet = new Set(paths);
check(manifest.schemaVersion === 1 && manifest.packageKind === 'runtime-candidate', 'manifest carries runtime-candidate schema metadata');
check(paths.length === manifest.fileCount && paths.length === pathSet.size, 'manifest file count and uniqueness are correct');
check(JSON.stringify(paths) === JSON.stringify([...paths].sort()), 'manifest file ordering is deterministic');
check(paths.includes('.claude-plugin/plugin.json') && paths.includes('.claude-plugin/marketplace.json'), 'runtime contains plugin manifests');
check(paths.includes('README.md') && paths.includes('LICENSE'), 'runtime contains README and LICENSE');
check(paths.some((p) => p.startsWith('commands/')), 'runtime contains commands');
check(paths.some((p) => p.startsWith('skills/')), 'runtime contains skills');
check(paths.filter((p) => p.startsWith('agents/') && p.endsWith('.md')).length === 4, 'runtime contains exactly four agents');
check(!paths.includes('hooks/session-start') && !paths.includes('hooks/run-hook.cmd'), 'deprecated hook wrappers are not packaged');
check(paths.includes('hooks/hooks.json.example') && paths.includes('hooks/hooks.enforcement.json.example'), 'runtime contains inactive hook examples');
check(!paths.includes('hooks/hooks.json'), 'active hooks/hooks.json is not packaged');
check(!paths.some((p) => /^(tests|docs|scripts|dist|node_modules|\.git)\//.test(p)), 'development-only directories do not leak into runtime');
check(!paths.some((p) => /^phase_.*\.md$/i.test(p) || p.startsWith('analyze-apply-project-rules/')), 'phase prompts and local workspaces do not leak into runtime');

const dirFiles = fs.existsSync(runtimeDir) ? walk(runtimeDir).sort() : [];
check(JSON.stringify(dirFiles) === JSON.stringify([...paths].sort()), 'runtime directory exactly matches manifest');

const zipHash = fs.existsSync(zipPath) ? sha256(fs.readFileSync(zipPath)) : '';
const shaText = fs.existsSync(shaPath) ? fs.readFileSync(shaPath, 'utf8') : '';
check(shaText.startsWith(`${zipHash}  ${path.basename(zipPath)}`), 'zip SHA-256 file matches zip bytes');

let fileHashesOk = true;
let personalPathsOk = true;
for (const f of manifest.files) {
  const abs = path.join(runtimeDir, f.path);
  const buf = fs.existsSync(abs) ? fs.readFileSync(abs) : Buffer.from('');
  if (sha256(buf) !== f.sha256) fileHashesOk = false;
  if (/\b[A-Za-z]:\\Users\\|\/c\/Users\/|\/Users\/|gencberke/i.test(buf.toString('utf8'))) personalPathsOk = false;
}
check(fileHashesOk, 'manifest per-file hashes match runtime bytes');
check(personalPathsOk, 'no packaged file contains personal absolute paths');

const enforcementExample = fs.existsSync(path.join(runtimeDir, 'hooks/hooks.enforcement.json.example'))
  ? readJSON(path.join(runtimeDir, 'hooks/hooks.enforcement.json.example'))
  : {};
check(/INACTIVE EXAMPLE/i.test(enforcementExample._comment || ''), 'enforcement example is explicitly inactive');

const readme = fs.existsSync(path.join(runtimeDir, 'README.md')) ? fs.readFileSync(path.join(runtimeDir, 'README.md'), 'utf8') : '';
check(!/\]\(docs\//.test(readme) && !/\]\(AGENTS\.md\)/.test(readme), 'runtime README does not link to excluded source docs');
const modifiedReadmeHash = sha256(Buffer.from(readme + '\nchanged\n'));
const readmeEntry = manifest.files.find((f) => f.path === 'README.md');
check(readmeEntry && modifiedReadmeHash !== readmeEntry.sha256, 'checksum changes when runtime content changes');

const inspect = run([process.execPath, 'scripts/inspect-runtime-package.mjs', '--out', out1]);
check(inspect.status === 0 && /"agentCount": 4/.test(inspect.stdout), 'runtime inspector accepts generated package');

// Inspector must reject corrupted/incomplete artifacts. Each scenario corrupts
// a fresh copy of the generated package so failures cannot mask each other.
function corruptCase(label, mutate) {
  if (!fs.existsSync(runtimeDir)) {
    check(false, `inspector rejects ${label} (no generated package to corrupt)`);
    return;
  }
  const copyRoot = tmpdir();
  fs.cpSync(out1, copyRoot, { recursive: true });
  mutate(copyRoot, path.join(copyRoot, base));
  const r = run([process.execPath, 'scripts/inspect-runtime-package.mjs', '--out', copyRoot]);
  check(r.status !== 0, `inspector rejects ${label}`);
}
corruptCase('tampered runtime file bytes', (root, dir) => {
  fs.appendFileSync(path.join(dir, 'skills/execution-routing/scripts/cow-hook.mjs'), '\n// tampered\n');
});
corruptCase('deleted required runtime file', (root, dir) => {
  fs.rmSync(path.join(dir, 'LICENSE'));
});
corruptCase('extra file injected into runtime dir', (root, dir) => {
  fs.writeFileSync(path.join(dir, 'extra.txt'), 'x\n');
});
corruptCase('falsified manifest fileCount', (root) => {
  const mp = path.join(root, `${base}.manifest.json`);
  const m = readJSON(mp);
  m.fileCount = 999;
  fs.writeFileSync(mp, JSON.stringify(m, null, 2) + '\n');
});
corruptCase('injected active hooks.json', (root, dir) => {
  fs.writeFileSync(path.join(dir, 'hooks/hooks.json'), '{"hooks":{}}\n');
});
corruptCase('unsafe manifest path', (root) => {
  const mp = path.join(root, `${base}.manifest.json`);
  const m = readJSON(mp);
  m.files[0] = { ...m.files[0], path: '../evil.md' };
  fs.writeFileSync(mp, JSON.stringify(m, null, 2) + '\n');
});
corruptCase('zip bytes changed after checksum', (root) => {
  fs.appendFileSync(path.join(root, `${base}.zip`), Buffer.from([0x00]));
});

fs.writeFileSync(path.join(out1, 'keep.txt'), 'keep\n');
const rebuild = run([process.execPath, 'scripts/build-runtime-package.mjs', '--out', out1]);
check(rebuild.status === 0 && fs.existsSync(path.join(out1, 'keep.txt')), 'existing output root is handled narrowly');

const build2 = run([process.execPath, 'scripts/build-runtime-package.mjs', '--out', out2]);
check(build2.status === 0, 'second runtime build succeeds');
const manifest2 = readJSON(path.join(out2, `${base}.manifest.json`));
const sha2 = fs.readFileSync(path.join(out2, `${base}.sha256`), 'utf8');
check(JSON.stringify(manifest) === JSON.stringify(manifest2), 'identical input produces identical manifest');
check(shaText === sha2, 'identical input produces identical zip checksum');

const unsafeOut = path.join(root, 'runtime-output-inside-repo');
const unsafe = run([process.execPath, 'scripts/build-runtime-package.mjs', '--out', unsafeOut]);
check(unsafe.status !== 0 && /refusing unsafe output root/.test(unsafe.stderr), 'unsafe output directory inside source tree is rejected');
check(!fs.existsSync(unsafeOut), 'unsafe output directory is not created');

const candidate = run([process.execPath, 'scripts/release-gate.mjs', '--mode=candidate']);
check(candidate.status === 0 && /PHASE_7A_CANDIDATE_GATE_PASSED/.test(candidate.stdout), 'candidate release gate passes');
const finalGate = run([process.execPath, 'scripts/release-gate.mjs', '--mode=final']);
check(finalGate.status !== 0 && /LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE/.test(finalGate.stderr), 'final release gate blocks on pending live evidence');

const versionDry = run([process.execPath, 'scripts/version-finalize.mjs', '--target', '0.5.0', '--dry-run']);
check(versionDry.status === 0 && /"targetVersion": "0.5.0"/.test(versionDry.stdout) && /README\.md/.test(versionDry.stdout),
  'final version dry-run locates authoritative version fields and version-neutral README install docs');
check(/tests\/validate-structure\.mjs/.test(versionDry.stdout) && /tests\/agent-contracts\.test\.mjs/.test(versionDry.stdout)
  && /"kind": "test-pin"/.test(versionDry.stdout),
  'final version dry-run lists the deterministic-test version pins');

const mismatchRoot = tmpdir();
fs.mkdirSync(path.join(mismatchRoot, '.claude-plugin'), { recursive: true });
fs.copyFileSync(path.join(root, '.claude-plugin/plugin.json'), path.join(mismatchRoot, '.claude-plugin/plugin.json'));
fs.copyFileSync(path.join(root, '.claude-plugin/marketplace.json'), path.join(mismatchRoot, '.claude-plugin/marketplace.json'));
const badPkg = readJSON(path.join(root, 'package.json'));
badPkg.version = '0.4.999';
fs.writeFileSync(path.join(mismatchRoot, 'package.json'), JSON.stringify(badPkg, null, 2) + '\n');
fs.writeFileSync(path.join(mismatchRoot, 'CHANGELOG.md'), '## [0.5.0] - Pending\n');
fs.writeFileSync(path.join(mismatchRoot, 'README.md'), '/plugin marketplace add <runtime-package-dir>\n');
const mismatch = run([process.execPath, 'scripts/version-finalize.mjs', '--root', mismatchRoot, '--target', '0.5.0', '--dry-run']);
check(mismatch.status !== 0 && /current versions are not synchronized/.test(mismatch.stderr), 'version mismatch blocks finalization dry-run');

const staleReadmeRoot = tmpdir();
fs.mkdirSync(path.join(staleReadmeRoot, '.claude-plugin'), { recursive: true });
fs.copyFileSync(path.join(root, '.claude-plugin/plugin.json'), path.join(staleReadmeRoot, '.claude-plugin/plugin.json'));
fs.copyFileSync(path.join(root, '.claude-plugin/marketplace.json'), path.join(staleReadmeRoot, '.claude-plugin/marketplace.json'));
fs.copyFileSync(path.join(root, 'package.json'), path.join(staleReadmeRoot, 'package.json'));
fs.writeFileSync(path.join(staleReadmeRoot, 'CHANGELOG.md'), '## [0.5.0] - Pending\n');
fs.writeFileSync(path.join(staleReadmeRoot, 'README.md'), '/plugin marketplace add <path-to-runtime-output>/cost-oriented-agentic-workflow-0.4.2\n');
const staleReadme = run([process.execPath, 'scripts/version-finalize.mjs', '--root', staleReadmeRoot, '--target', '0.5.0', '--dry-run']);
check(staleReadme.status !== 0 && /version-neutral/.test(staleReadme.stderr), 'version dry-run rejects stale version-specific README install docs');

for (const d of tmps) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

console.log(`Phase 7A release package tests: ${passes} passed, ${fails} failed.`);
if (fails) process.exit(1);

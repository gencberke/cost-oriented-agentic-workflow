#!/usr/bin/env node
// repo-snapshot — deterministic repository metadata for the cost-oriented
// workflow's repository-intake foundation (0.5.0, Phase 1).
//
// Emits a FIXED, BOUNDED, SORTED structural map of a repository so the
// controller never has to read broadly itself. Output is deterministic
// metadata — NOT an LLM-written summary, and NEVER file contents, diffs,
// environment values, or secrets. Instruction/manifest files contribute only
// their path + SHA-256 + byte size, never their text.
//
// Node standard library + git only. Zero runtime dependencies. Cross-platform.
//   node <plugin>/skills/repository-intake/scripts/repo-snapshot.mjs <command>
// Commands: write [--out PATH] | print | fingerprint | check-profile <profile.json>

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const SNAPSHOT_SCHEMA_VERSION = 1;
const PROFILE_SCHEMA_VERSION = 1;

// ── Discovery bounds (§7.2) — explicit, documented, testable ────────────────
const BOUNDS = {
  depth: 2,                 // directory-shape depth
  dirEntries: 200,          // directoryShape entries
  topLevelDirs: 50,
  dirtyPaths: 200,
  recentCommits: 20,
  instructionFiles: 20,
  manifests: 20,
  languages: 10,
  entryPoints: 20,
  outputBytes: 16384,       // 16 KB serialized cap
};

// Generated / heavy / VCS dirs never walked into the structural map.
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'target', '.next', '.nuxt',
  'coverage', '.gradle', '.idea', '.vscode', 'vendor', '__pycache__', '.venv',
  'venv', '.dart_tool', '.pub-cache', 'Pods', '.terraform', 'bin', 'obj',
  '.cost-oriented-agentic-workflow',
]);

const EXT_LANG = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.py': 'Python', '.go': 'Go', '.rs': 'Rust',
  '.java': 'Java', '.kt': 'Kotlin', '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#',
  '.cpp': 'C++', '.cc': 'C++', '.cxx': 'C++', '.c': 'C', '.swift': 'Swift',
  '.dart': 'Dart', '.scala': 'Scala', '.sh': 'Shell', '.sql': 'SQL', '.css': 'CSS',
  '.scss': 'CSS', '.html': 'HTML', '.vue': 'Vue', '.md': 'Markdown',
};

const MANIFEST_TYPE = {
  'package.json': 'npm', 'pyproject.toml': 'python', 'setup.py': 'python',
  'setup.cfg': 'python', 'requirements.txt': 'python', 'go.mod': 'go',
  'Cargo.toml': 'rust', 'pom.xml': 'maven', 'build.gradle': 'gradle',
  'build.gradle.kts': 'gradle', 'pubspec.yaml': 'dart', 'Gemfile': 'ruby',
  'composer.json': 'php',
};
const LOCKFILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'poetry.lock',
  'Gemfile.lock', 'go.sum', 'composer.lock',
]);
const INSTRUCTION_BASENAMES = new Set([
  'CLAUDE.md', 'AGENTS.md', 'GEMINI.md', 'CONVENTIONS.md', '.cursorrules', '.windsurfrules',
]);
const INSTRUCTION_PATHS = new Set(['.github/copilot-instructions.md']);
const CI_EXACT = new Set(['.gitlab-ci.yml', '.circleci/config.yml', 'azure-pipelines.yml', 'Jenkinsfile']);

// ── Plumbing ────────────────────────────────────────────────────────────────
const die = (msg, code = 1) => { process.stderr.write(`repo-snapshot: ERROR: ${msg}\n`); process.exit(code); };
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
// Tolerate a leading UTF-8 BOM so a BOM-prefixed manifest or profile still parses.
const stripBom = (s) => s.replace(/^\uFEFF/, '');

function requireGit() {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); }
  catch { die('git is required but was not found on PATH.'); }
}
function git(args, { cwd = process.cwd(), allowFail = false } = {}) {
  // stderr discarded: probes like `@{u}` print "fatal: no upstream" on absence,
  // which is handled by allowFail — we don't want that noise on stderr.
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\r?\n$/, ''); }
  catch (e) { if (allowFail) return null; throw e; }
}
function worktreeRoot() {
  const top = git(['rev-parse', '--show-toplevel'], { allowFail: true });
  if (!top) die('not inside a git worktree (could not resolve --show-toplevel).');
  return path.resolve(top);
}
function ensureRunDir(root) {
  const dir = path.join(root, '.cost-oriented-agentic-workflow', 'run');
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n');
  return dir;
}
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isSkipped = (rel) => rel.split('/').some((seg) => SKIP_DIRS.has(seg));

// ── Snapshot construction ────────────────────────────────────────────────────
function buildSnapshot(root) {
  const g = (args, allowFail = true) => git(args, { cwd: root, allowFail });

  const trackedRaw = g(['ls-files']);
  const tracked = (trackedRaw ? trackedRaw.split('\n') : []).filter(Boolean);
  const trackedFileCount = tracked.length;
  const files = tracked.filter((f) => !isSkipped(f)); // structural files only

  const truncated = {};
  const cap = (arr, n, key) => { if (arr.length > n) { truncated[key] = true; return arr.slice(0, n); } return arr; };

  // Languages (by extension; only recognized languages; fileCount excluded from fingerprint)
  const langCounts = new Map();
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const name = EXT_LANG[ext];
    if (!name) continue;
    const key = `${name} ${ext}`;
    langCounts.set(key, (langCounts.get(key) || 0) + 1);
  }
  let languages = [...langCounts.entries()].map(([k, fileCount]) => {
    const [name, ext] = k.split(' ');
    return { name, ext, fileCount };
  }).sort((a, b) => (b.fileCount - a.fileCount) || byStr(a.name, b.name) || byStr(a.ext, b.ext));
  languages = cap(languages, BOUNDS.languages, 'languages');

  // Directory structure (depth <= 2)
  const dirSet = new Set();
  const dirFileCount = new Map();
  const childDirs = new Map();
  for (const f of files) {
    const segs = f.split('/');
    if (segs.length < 2) continue; // top-level file, no dir
    const d1 = segs[0];
    dirSet.add(d1);
    dirFileCount.set(d1, (dirFileCount.get(d1) || 0) + 1);
    if (segs.length >= 3) {
      const d2 = `${segs[0]}/${segs[1]}`;
      dirSet.add(d2);
      if (!childDirs.has(d1)) childDirs.set(d1, new Set());
      childDirs.get(d1).add(segs[1]);
    }
  }
  let topLevelDirs = [...new Set([...dirSet].filter((d) => !d.includes('/')))].sort(byStr);
  topLevelDirs = cap(topLevelDirs, BOUNDS.topLevelDirs, 'topLevelDirs');
  let directoryShape = topLevelDirs.map((d) => ({
    dir: d,
    childDirs: [...(childDirs.get(d) || [])].sort(byStr),
    fileCount: dirFileCount.get(d) || 0,
  }));
  directoryShape = cap(directoryShape, BOUNDS.dirEntries, 'directoryShape');

  // Manifests + lockfiles
  const manifests = [];
  const lockfiles = [];
  for (const f of files) {
    const base = path.basename(f);
    let type = MANIFEST_TYPE[base];
    if (!type && base.endsWith('.csproj')) type = 'dotnet';
    if (type) {
      const abs = path.join(root, f);
      let bytes = 0, hash = null;
      try { const buf = fs.readFileSync(abs); bytes = buf.length; hash = sha256(buf); } catch { /* unreadable */ }
      manifests.push({ path: f, type, sha256: hash, bytes });
    }
    if (LOCKFILES.has(base)) lockfiles.push(base);
  }
  manifests.sort((a, b) => byStr(a.path, b.path));
  const manifestsCapped = cap(manifests, BOUNDS.manifests, 'manifests');

  // Build / test / entry points (best-effort, manifest-declared only)
  const buildCommands = new Set();
  const testCommands = new Set();
  const entryPoints = new Set();
  for (const m of manifestsCapped) {
    if (m.type === 'npm') {
      try {
        const pkg = JSON.parse(stripBom(fs.readFileSync(path.join(root, m.path), 'utf8')));
        const scripts = pkg.scripts || {};
        if (scripts.build) buildCommands.add('npm run build');
        if (scripts.test) testCommands.add('npm test');
        if (typeof pkg.main === 'string') entryPoints.add(pkg.main.replace(/\\/g, '/'));
        if (pkg.bin && typeof pkg.bin === 'object') { for (const v of Object.values(pkg.bin)) if (typeof v === 'string') entryPoints.add(v.replace(/\\/g, '/')); }
        else if (typeof pkg.bin === 'string') entryPoints.add(pkg.bin.replace(/\\/g, '/'));
      } catch { /* best-effort: a bad manifest never throws (A.11) */ }
    } else if (m.type === 'go') { buildCommands.add('go build ./...'); testCommands.add('go test ./...'); }
    else if (m.type === 'rust') { buildCommands.add('cargo build'); testCommands.add('cargo test'); }
    else if (m.type === 'python') { testCommands.add('pytest'); }
    else if (m.type === 'dart') { testCommands.add('dart test'); }
  }

  // Instruction files (path + hash + size only; never content)
  const instructionFiles = [];
  for (const f of files) {
    if (INSTRUCTION_BASENAMES.has(path.basename(f)) || INSTRUCTION_PATHS.has(f)) {
      const abs = path.join(root, f);
      let bytes = 0, hash = null;
      try { const buf = fs.readFileSync(abs); bytes = buf.length; hash = sha256(buf); } catch { /* unreadable */ }
      instructionFiles.push({ path: f, sha256: hash, bytes });
    }
  }
  instructionFiles.sort((a, b) => byStr(a.path, b.path));
  const instructionCapped = cap(instructionFiles, BOUNDS.instructionFiles, 'instructionFiles');

  // CI config + test roots
  const ciConfig = files.filter((f) => f.startsWith('.github/workflows/') || CI_EXACT.has(f)).sort(byStr);
  const TEST_DIR_NAMES = new Set(['test', 'tests', '__tests__', 'spec', 'specs']);
  const testRoots = [...new Set([
    ...topLevelDirs.filter((d) => TEST_DIR_NAMES.has(d)),
    ...(files.some((f) => /\.(test|spec)\.[a-z0-9]+$/i.test(f)) ? ['glob:*.{test,spec}.*'] : []),
  ])].sort(byStr);

  // Notable signals
  const notable = [];
  notable.push(`monorepo:${manifests.length > 1 && manifests.some((m) => m.path.includes('/')) ? 'true' : 'false'}`);
  for (const lf of [...new Set(lockfiles)].sort(byStr)) notable.push(`lockfile:${lf}`);
  notable.sort(byStr);

  // Recent commits (informational; NOT fingerprinted). A SHA is exactly 40 hex
  // chars, so the first space unambiguously separates it from the subject.
  const logRaw = g(['log', '-n', String(BOUNDS.recentCommits), '--format=%H %s']);
  let recentCommits = (logRaw ? logRaw.split('\n') : []).filter(Boolean).map((line) => {
    const i = line.indexOf(' ');
    return i < 0 ? { sha: line, subject: '' } : { sha: line.slice(0, i), subject: line.slice(i + 1) };
  });
  recentCommits = cap(recentCommits, BOUNDS.recentCommits, 'recentCommits');

  // Git identity / worktree
  const rootCommitRaw = g(['rev-list', '--max-parents=0', 'HEAD']);
  const rootCommit = rootCommitRaw ? rootCommitRaw.split('\n').sort(byStr)[0] : null;
  const head = g(['rev-parse', 'HEAD']) || null;
  let branch = g(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch || branch === 'HEAD') branch = head ? 'DETACHED' : null;
  const upstream = g(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']) || null;
  const gitDir = path.resolve(root, g(['rev-parse', '--git-dir']) || '.git');
  const commonDir = path.resolve(root, g(['rev-parse', '--git-common-dir']) || '.git');
  const isLinked = gitDir !== commonDir;

  const statusRaw = g(['-c', 'core.quotepath=false', 'status', '--porcelain']);
  const statusLines = statusRaw ? statusRaw.split('\n').filter(Boolean) : [];
  let dirtyPaths = statusLines.map((l) => {
    const rest = l.slice(3);
    const arrow = rest.indexOf(' -> ');
    return arrow >= 0 ? rest.slice(arrow + 4) : rest;
  }).sort(byStr);
  const dirty = dirtyPaths.length > 0;
  dirtyPaths = cap(dirtyPaths, BOUNDS.dirtyPaths, 'dirtyPaths');

  // ── Fingerprint (§7.3): structure + config inputs only; never HEAD, dirty,
  // recent history, timestamps, or source content / file counts. ───────────
  const allDirs = [...dirSet].sort(byStr);
  const fpInput = {
    repository: rootCommit,
    instructionFiles: instructionFiles.map((i) => ({ path: i.path, sha256: i.sha256 })),
    manifests: manifests.map((m) => ({ path: m.path, sha256: m.sha256 })),
    structure: { dirs: allDirs, testRoots, ciConfig, lockfiles: [...new Set(lockfiles)].sort(byStr) },
    languages: languages.map((l) => ({ name: l.name, ext: l.ext })),
  };
  const fingerprint = sha256(JSON.stringify(fpInput));

  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    repository: { rootCommit, name: path.basename(root) },
    worktree: { isLinked, branch, head, upstream, dirty, trackedFileCount, dirtyPaths },
    instructionFiles: instructionCapped,
    manifests: manifestsCapped,
    languages,
    buildCommands: [...buildCommands].sort(byStr),
    testCommands: [...testCommands].sort(byStr),
    entryPoints: cap([...entryPoints].sort(byStr), BOUNDS.entryPoints, 'entryPoints'),
    topLevelDirs,
    directoryShape,
    testRoots,
    ciConfig,
    recentCommits,
    notable,
    truncated,
    fingerprint,
  };

  // Overall size cap: trim lowest-value sections first, flag truncation.
  const size = (s) => Buffer.byteLength(JSON.stringify(s, null, 2), 'utf8');
  if (size(snapshot) > BOUNDS.outputBytes) {
    snapshot.recentCommits = []; snapshot.truncated.recentCommits = true; snapshot.truncated.output = true;
  }
  if (size(snapshot) > BOUNDS.outputBytes) {
    snapshot.directoryShape = []; snapshot.truncated.directoryShape = true; snapshot.truncated.output = true;
  }
  return snapshot;
}

// The fingerprint never depends on generatedAt/head/recentCommits, so it is
// stable across re-runs on an unchanged tree.
function computeFingerprint(root) { return buildSnapshot(root).fingerprint; }

// ── Commands ──────────────────────────────────────────────────────────────────
function cmdWrite(root, argv) {
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i];
    else die(`unknown argument: ${argv[i]}`);
  }
  const snapshot = buildSnapshot(root);
  const body = JSON.stringify(snapshot, null, 2) + '\n';
  const dest = out ? path.resolve(process.cwd(), out) : path.join(ensureRunDir(root), 'repo-snapshot.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body);
  process.stdout.write(`repo-snapshot: wrote ${dest} (${Buffer.byteLength(body, 'utf8')} bytes, fingerprint ${snapshot.fingerprint.slice(0, 12)})\n`);
}
function cmdPrint(root) { process.stdout.write(JSON.stringify(buildSnapshot(root), null, 2) + '\n'); }
function cmdFingerprint(root) { process.stdout.write(computeFingerprint(root) + '\n'); }

function cmdCheckProfile(root, argv) {
  const file = argv[0];
  if (!file) die('check-profile requires a <repo-profile.json> path');
  const abs = path.resolve(process.cwd(), file);
  if (!fs.existsSync(abs)) { process.stdout.write('MISSING\n'); process.exit(3); }
  let profile;
  try { profile = JSON.parse(stripBom(fs.readFileSync(abs, 'utf8'))); }
  catch { process.stdout.write('INVALID\n'); process.exit(4); }
  if (!profile || typeof profile !== 'object' || typeof profile.fingerprint !== 'string' || typeof profile.schemaVersion !== 'number') {
    process.stdout.write('INVALID\n'); process.exit(4);
  }
  if (profile.schemaVersion !== PROFILE_SCHEMA_VERSION) { process.stdout.write('STALE\n'); process.exit(2); }
  const current = computeFingerprint(root);
  if (profile.fingerprint === current) { process.stdout.write('VALID\n'); process.exit(0); }
  process.stdout.write('STALE\n'); process.exit(2);
}

const USAGE = `repo-snapshot — deterministic repository metadata (Node + git, zero deps)

Usage: node repo-snapshot.mjs <command>
  write [--out PATH]            build + write snapshot (default: workspace run dir)
  print                         build + print snapshot JSON to stdout
  fingerprint                   print the profile fingerprint (sha256)
  check-profile <profile.json>  classify a profile vs the live repo:
                                VALID(0) | STALE(2) | MISSING(3) | INVALID(4)

Emits structure only — never file contents, diffs, env values, or secrets.
Profile *generation* is a future investigator's job; this only validates it.`;

function main() {
  const [, , command, ...argv] = process.argv;
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(USAGE + '\n');
    process.exit(command ? 0 : 1);
  }
  requireGit();
  const root = worktreeRoot();
  if (command === 'write') return cmdWrite(root, argv);
  if (command === 'print') return cmdPrint(root);
  if (command === 'fingerprint') return cmdFingerprint(root);
  if (command === 'check-profile') return cmdCheckProfile(root, argv);
  process.stderr.write(`repo-snapshot: unknown command "${command}".\n\n${USAGE}\n`);
  process.exit(1);
}

main();

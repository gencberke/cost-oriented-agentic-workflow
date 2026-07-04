#!/usr/bin/env node
// unit-worktree — deterministic per-unit worktree ownership for the
// cost-oriented-agentic-workflow control plane (0.5.0, Phase 3B.1.1).
//
// A pinned base SHA cannot tell a pre-existing dirty USER change apart from a
// change the current implementation unit created. This helper captures a per-unit
// BASELINE (head + the dirty paths that existed before the unit) and computes, by
// comparing the post-unit worktree against that baseline, exactly which paths the
// unit OWNS — so the controller stages and commits only those, never the user's
// pre-existing work.
//
//   unit-worktree.mjs capture --unit <id> --output <baseline> --allowed-path <p>...
//   unit-worktree.mjs inspect <baseline>
//   unit-worktree.mjs check-overlap <baseline>
//   unit-worktree.mjs compare <baseline> [--report <attempt-report>]
//   unit-worktree.mjs verify-stage <baseline>
//
// Stable JSON output; non-zero exit on any violation. Node stdlib + git only.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const SCHEMA_VERSION = 1;
const KINDS = ['TRACKED', 'STAGED', 'UNTRACKED'];
const WORKSPACE = '.cost-oriented-agentic-workflow/';

const die = (msg, code = 1) => { process.stderr.write(`unit-worktree: ERROR: ${msg}\n`); process.exit(code); };
const stripBom = (s) => (s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s);
const normPath = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');
const nowISO = () => new Date().toISOString();

function git(args, { cwd = process.cwd(), allowFail = false } = {}) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 }).replace(/\r?\n$/, ''); }
  catch (e) { if (allowFail) return null; throw e; }
}
function gitZ(args, cwd) {
  const out = execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
  return out.split('\0').filter((s) => s !== '');
}
function worktreeRoot() {
  const top = git(['rev-parse', '--show-toplevel'], { allowFail: true });
  if (!top) die('not inside a git worktree (could not resolve --show-toplevel).', 2);
  return path.resolve(top);
}

// Repo-relative, forward-slash, no escapes; must resolve inside the worktree.
function safeRepoPath(root, value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label}: a non-empty path is required`);
  const raw = value.trim();
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('/') || raw.startsWith('\\')) throw new Error(`${label}: absolute paths are rejected ("${raw}")`);
  const parts = raw.split(/[\\/]+/);
  if (parts.some((p) => p === '..')) throw new Error(`${label}: path traversal ("..") is rejected ("${raw}")`);
  const rel = parts.filter((p) => p !== '.' && p !== '').join('/');
  if (rel === '') throw new Error(`${label}: empty path after normalization ("${raw}")`);
  const resolved = path.resolve(root, rel);
  const within = path.relative(root, resolved);
  if (within === '' || within.startsWith('..') || path.isAbsolute(within)) throw new Error(`${label}: path resolves outside the worktree ("${raw}")`);
  return rel;
}
// A path is "under" an allowed entry if equal, under an allowed dir, or (for an
// absolute worktree path) ends with the allowed suffix.
const underAllowed = (p, allowed) => {
  const c = normPath(p);
  return allowed.some((a0) => { const a = normPath(a0).replace(/\/+$/, ''); return c === a || c.startsWith(a + '/') || c.endsWith('/' + a) || c.includes('/' + a + '/'); });
};

function worktreeHash(root, rel) {
  const abs = path.join(root, rel);
  try { const st = fs.lstatSync(abs); if (st.isSymbolicLink()) return 'symlink:' + crypto.createHash('sha256').update(fs.readlinkSync(abs)).digest('hex'); if (!st.isFile()) return null; return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'); }
  catch { return null; }
}
const indexObject = (root, rel) => { const o = git(['rev-parse', `:${rel}`], { cwd: root, allowFail: true }); return o || null; };

// ── baseline I/O ──────────────────────────────────────────────────────────────
function writeJsonAtomic(root, file, obj) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  let fd;
  try {
    fd = fs.openSync(tmp, 'w'); fs.writeFileSync(fd, JSON.stringify(obj, null, 2) + '\n');
    try { fs.fsyncSync(fd); } catch { /* best effort */ } fs.closeSync(fd); fd = undefined; fs.renameSync(tmp, file);
  } catch (err) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* ignore */ } }
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
    die(`atomic write failed: ${err.message}`);
  }
}
function loadBaseline(file) {
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch (e) { die(`cannot read baseline ${file}: ${e.message}`, 2); }
  let b; try { b = JSON.parse(stripBom(text)); } catch (e) { die(`baseline is not valid JSON: ${e.message}`); }
  const errs = validateBaseline(b);
  if (errs.length) die(`baseline failed validation: ${errs.join('; ')}`);
  return b;
}
function validateBaseline(b) {
  const e = [];
  if (!b || typeof b !== 'object') return ['baseline is not an object'];
  if (b.schemaVersion !== SCHEMA_VERSION) e.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (typeof b.unitId !== 'string' || !b.unitId.trim()) e.push('unitId must be a non-empty string');
  if (typeof b.head !== 'string' || !/^[0-9a-f]{7,40}$/.test(b.head)) e.push('head must be a git sha');
  if (b.branch != null && typeof b.branch !== 'string') e.push('branch must be a string or null');
  if (!Array.isArray(b.allowedPaths) || b.allowedPaths.length < 1) e.push('allowedPaths must be a non-empty array');
  if (typeof b.capturedAt !== 'string') e.push('capturedAt must be a string');
  if (!Array.isArray(b.preExisting)) e.push('preExisting must be an array');
  else for (const p of b.preExisting) {
    if (!p || typeof p !== 'object') { e.push('each preExisting entry must be an object'); continue; }
    if (typeof p.path !== 'string') e.push('preExisting.path must be a string');
    if (!KINDS.includes(p.kind)) e.push(`preExisting.kind invalid: ${JSON.stringify(p.kind)}`);
  }
  return e;
}

// ── capture ───────────────────────────────────────────────────────────────────
function cmdCapture(root, argv) {
  const { flags } = parseArgs(argv, { value: ['unit', 'output'], repeat: ['allowed-path'] });
  if (!flags.unit) die('capture requires --unit <id>', 2);
  if (!flags.output) die('capture requires --output <baseline-path>', 2);
  if (!flags['allowed-path'] || flags['allowed-path'].length === 0) die('capture requires at least one --allowed-path', 2);
  let allowed;
  try { allowed = flags['allowed-path'].map((p) => safeRepoPath(root, p, 'allowed-path')); } catch (e) { die(e.message, 2); }

  const head = git(['rev-parse', 'HEAD'], { cwd: root, allowFail: true });
  if (!head) die('cannot resolve HEAD (the repository has no commits).', 2);
  const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: root, allowFail: true }) || null;

  // Dirty paths from porcelain v1 (-z, rename-aware): XY then path (+ orig for R/C).
  const toks = gitZ(['status', '--porcelain=v1', '-z', '--untracked-files=all'], root);
  const preExisting = [];
  for (let i = 0; i < toks.length; i++) {
    const entry = toks[i];
    const xy = entry.slice(0, 2); const p = normPath(entry.slice(3));
    if ((xy[0] === 'R' || xy[0] === 'C')) i += 1; // consume the rename/copy source token
    if (p.startsWith(WORKSPACE)) continue; // the workflow workspace is never user content
    const untracked = xy === '??';
    const staged = !untracked && xy[0] !== ' ' && xy[0] !== '?';
    preExisting.push({
      path: p,
      kind: untracked ? 'UNTRACKED' : (staged ? 'STAGED' : 'TRACKED'),
      worktreeHash: worktreeHash(root, p),
      indexObject: untracked ? null : indexObject(root, p),
    });
  }
  preExisting.sort((a, b) => a.path.localeCompare(b.path));
  const baseline = { schemaVersion: SCHEMA_VERSION, unitId: flags.unit, head, branch, allowedPaths: allowed, capturedAt: nowISO(), preExisting };
  let outRel; try { outRel = safeRepoPath(root, flags.output, 'output'); } catch (e) { die(e.message, 2); }
  writeJsonAtomic(root, path.join(root, outRel), baseline);
  process.stdout.write(JSON.stringify({ captured: outRel, unitId: baseline.unitId, head, preExistingCount: preExisting.length }, null, 2) + '\n');
}

// ── overlap (pre-implementation gate) ────────────────────────────────────────
function overlap(baseline) {
  return baseline.preExisting.filter((e) => underAllowed(e.path, baseline.allowedPaths)).map((e) => e.path);
}
function cmdCheckOverlap(root, argv) {
  const { positional } = parseArgs(argv, {});
  const b = loadBaseline(resolveBaseline(root, positional[0]));
  const o = overlap(b);
  const out = { unitId: b.unitId, allowedPaths: b.allowedPaths, overlap: o, status: o.length ? 'BLOCKED_DIRTY_OVERLAP' : 'OK' };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  if (o.length) process.exit(1);
}

// ── ownership comparison (post-unit, relative to baseline) ───────────────────
function computeOwnership(root, baseline) {
  const allowed = baseline.allowedPaths;
  const preMap = new Map(baseline.preExisting.map((e) => [e.path, e]));
  const trackedChanged = (git(['diff', '--name-only', '--no-renames', baseline.head, '--'], { cwd: root, allowFail: true }) || '')
    .split(/\r?\n/).map((s) => normPath(s.trim())).filter(Boolean);
  const untrackedNow = gitZ(['ls-files', '-z', '--others', '--exclude-standard'], root).map(normPath);
  const current = [...new Set([...trackedChanged, ...untrackedNow])].filter((p) => !p.startsWith(WORKSPACE));

  const unitOwned = []; const preserved = []; const violations = [];
  for (const e of baseline.preExisting) {
    if (e.path.startsWith(WORKSPACE)) continue;
    const changed = worktreeHash(root, e.path) !== e.worktreeHash; // null (deleted) vs hash counts as changed
    if (changed) violations.push({ code: 'PRE_EXISTING_PATH_MODIFIED', path: e.path });
    else preserved.push(e.path);
  }
  for (const p of current) {
    if (preMap.has(p)) continue; // pre-existing → handled above
    if (underAllowed(p, allowed)) unitOwned.push(p);
    else violations.push({ code: 'OUTSIDE_ALLOWED_PATH', path: p });
  }
  return { unitOwned: [...new Set(unitOwned)].sort(), preserved: preserved.sort(), violations };
}

function cmdCompare(root, argv) {
  const { positional, flags } = parseArgs(argv, { value: ['report'] });
  const b = loadBaseline(resolveBaseline(root, positional[0]));
  const own = computeOwnership(root, b);
  const out = { unitId: b.unitId, baselineHead: b.head, allowedPaths: b.allowedPaths, ...own };
  if (flags.report) {
    let rep; try { rep = JSON.parse(stripBom(fs.readFileSync(flags.report, 'utf8'))); } catch (e) { die(`cannot read report ${flags.report}: ${e.message}`, 2); }
    const reported = [...new Set((rep.filesChanged || []).map(normPath))];
    const omitted = own.unitOwned.filter((p) => !reported.includes(p));
    const falsely = reported.filter((p) => !own.unitOwned.includes(p));
    if (omitted.length) out.violations.push({ code: 'OMITTED_CHANGED_FILE', paths: omitted });
    if (falsely.length) out.violations.push({ code: 'REPORTED_UNCHANGED_FILE', paths: falsely });
    out.reportedChanged = reported.sort();
  }
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  if (out.violations.length) process.exit(1);
}

// ── stage verification (exact unit-owned delta only) ─────────────────────────
function cmdVerifyStage(root, argv) {
  const { positional } = parseArgs(argv, {});
  const b = loadBaseline(resolveBaseline(root, positional[0]));
  const own = computeOwnership(root, b);
  const preSet = new Set(b.preExisting.map((e) => e.path));
  const staged = (git(['diff', '--cached', '--name-only', '--no-renames'], { cwd: root, allowFail: true }) || '')
    .split(/\r?\n/).map((s) => normPath(s.trim())).filter(Boolean).filter((p) => !p.startsWith(WORKSPACE));
  const ownedSet = new Set(own.unitOwned);
  const violations = [...own.violations];
  for (const s of staged) {
    if (preSet.has(s)) violations.push({ code: 'STAGED_PREEXISTING_PATH', path: s });
    else if (!ownedSet.has(s)) violations.push({ code: 'STAGED_NON_UNIT_OWNED', path: s });
  }
  const stagedSet = new Set(staged);
  for (const p of own.unitOwned) if (!stagedSet.has(p)) violations.push({ code: 'MISSING_STAGED_UNIT_PATH', path: p });
  if (staged.length === 0 && own.unitOwned.length > 0) violations.push({ code: 'NO_STAGED_CHANGES', detail: 'unit-owned paths exist but nothing is staged' });
  const out = { unitId: b.unitId, staged: staged.sort(), unitOwned: own.unitOwned, preserved: own.preserved, violations };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  if (violations.length) process.exit(1);
}

function cmdInspect(root, argv) {
  const { positional } = parseArgs(argv, {});
  const b = loadBaseline(resolveBaseline(root, positional[0]));
  process.stdout.write(JSON.stringify(b, null, 2) + '\n');
}

// ── CLI plumbing ──────────────────────────────────────────────────────────────
function resolveBaseline(root, p) {
  if (!p) die('a <baseline-path> argument is required', 2);
  return path.isAbsolute(p) ? p : path.join(root, normPath(p));
}
function parseArgs(argv, spec) {
  const flags = {}; const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { positional.push(a); continue; }
    const key = a.slice(2);
    if (spec.repeat && spec.repeat.includes(key)) { const v = argv[++i]; if (v === undefined) die(`flag --${key} requires a value`); (flags[key] ||= []).push(v); continue; }
    if (spec.value && spec.value.includes(key)) { const v = argv[++i]; if (v === undefined) die(`flag --${key} requires a value`); flags[key] = v; continue; }
    die(`unknown flag: --${key}`);
  }
  return { flags, positional };
}

const USAGE = `unit-worktree — per-unit worktree ownership baseline (Node + git, zero deps)

  capture --unit <id> --output <baseline> --allowed-path <p>...
  inspect <baseline>
  check-overlap <baseline>          exit 1 on BLOCKED_DIRTY_OVERLAP
  compare <baseline> [--report <r>] exit 1 on any ownership violation
  verify-stage <baseline>           exit 1 unless staged == unit-owned delta

The unit baseline distinguishes pre-existing dirty USER paths from unit-owned
changes, so only unit-owned paths are ever staged and committed.`;

function main() {
  const [, , command, ...argv] = process.argv;
  if (!command || ['help', '--help', '-h'].includes(command)) { process.stdout.write(USAGE + '\n'); process.exit(command ? 0 : 1); }
  const root = worktreeRoot();
  const handlers = { capture: cmdCapture, inspect: cmdInspect, 'check-overlap': cmdCheckOverlap, compare: cmdCompare, 'verify-stage': cmdVerifyStage };
  const h = handlers[command];
  if (!h) { process.stderr.write(`unit-worktree: unknown command "${command}".\n\n${USAGE}\n`); process.exit(1); }
  h(root, argv);
}

export { computeOwnership, loadBaseline, validateBaseline, overlap, underAllowed, safeRepoPath };

import { fileURLToPath } from 'url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

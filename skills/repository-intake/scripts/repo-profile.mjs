#!/usr/bin/env node
// repo-profile — deterministic acceptance of a repository-profile DRAFT for the
// cost-oriented workflow's discovery control plane (0.5.0, Phase 3A).
//
// The cow-repo-investigator agent returns a profile DRAFT inside a delimited
// envelope but cannot write files. This helper owns profile parsing, validation,
// fingerprint comparison, and ATOMIC promotion — so the controller never trusts an
// unvalidated agent profile and a PARTIAL draft is never silently promoted to VALID.
//
// Node standard library + git only. Zero runtime dependencies. Cross-platform.
//   node <plugin>/skills/repository-intake/scripts/repo-profile.mjs <command> [flags]
// Commands:
//   validate-agent-output <raw-path> --snapshot <snapshot-path>
//   accept-agent-output   <raw-path> --snapshot <snapshot-path>
//   validate              <candidate-json-path> --snapshot <snapshot-path>
//   status                [--snapshot <snapshot-path>]
//   render

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const PROFILE_SCHEMA_VERSION = 1;
const MAX_PROFILE_BYTES = 8192;          // §A.7 / §6.3 oversize guard
const CONFIDENCE = ['verified', 'inferred', 'unknown'];
const PROFILE_STATUS = ['ready', 'partial'];
// Obvious secret / environment-value signals — a profile records STRUCTURE only.
const SECRET_RE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|password\s*[:=]|secret\s*[:=]|api[_-]?key\s*[:=]|process\.env\.|\b[A-Z][A-Z0-9_]{3,}=[^\s]+)/i;

const die = (msg, code = 1) => { process.stderr.write(`repo-profile: ERROR: ${msg}\n`); process.exit(code); };
// Tolerate a leading UTF-8 BOM (e.g. a profile written by a BOM-adding editor or by
// PowerShell `Set-Content -Encoding utf8`) so it never reads as INVALID.
const stripBom = (s) => s.replace(/^\uFEFF/, '');
const readJson = (p) => JSON.parse(stripBom(fs.readFileSync(p, 'utf8')));

// ── git / workspace plumbing ─────────────────────────────────────────────────
function requireGit() {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { die('git is required but was not found on PATH.'); }
}
function git(args, { allowFail = false } = {}) {
  try { return execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\r?\n$/, ''); }
  catch (e) { if (allowFail) return null; throw e; }
}
function worktreeRoot() {
  const top = git(['rev-parse', '--show-toplevel'], { allowFail: true });
  if (!top) die('not inside a git worktree (could not resolve --show-toplevel).');
  return path.resolve(top);
}
function runDir(root) {
  const dir = path.join(root, '.cost-oriented-agentic-workflow', 'run');
  fs.mkdirSync(dir, { recursive: true });
  const ig = path.join(dir, '.gitignore');
  if (!fs.existsSync(ig)) fs.writeFileSync(ig, '*\n');
  return dir;
}
const paths = (root) => {
  const dir = runDir(root);
  return {
    dir,
    snapshot: path.join(dir, 'repo-snapshot.json'),
    candidate: path.join(dir, 'repo-profile.candidate.json'),
    profile: path.join(dir, 'repo-profile.json'),
    md: path.join(dir, 'repo-profile.md'),
  };
};

// repo-relative, forward-slash, no traversal/absolute, inside the worktree.
function safePath(root, value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label}: non-empty path required`);
  const raw = value.trim();
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('/') || raw.startsWith('\\')) throw new Error(`${label}: absolute path rejected ("${raw}")`);
  const parts = raw.split(/[\\/]+/);
  if (parts.some((p) => p === '..')) throw new Error(`${label}: traversal rejected ("${raw}")`);
  const rel = parts.filter((p) => p !== '.' && p !== '').join('/');
  if (rel === '') throw new Error(`${label}: empty after normalization ("${raw}")`);
  const resolved = path.resolve(root, rel);
  const within = path.relative(root, resolved);
  if (within === '' || within.startsWith('..') || path.isAbsolute(within)) throw new Error(`${label}: resolves outside worktree ("${raw}")`);
  return rel;
}
// Glob-ish path values (riskHotspots/unmapped/subsystem paths) may contain '*'/'**'.
function safeGlob(root, value, label) {
  return safePath(root, String(value).replace(/\*/g, 'x'), label) && String(value).trim();
}

function atomicWrite(dir, target, body) {
  const tmp = path.join(dir, `${path.basename(target)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  let fd;
  try {
    fd = fs.openSync(tmp, 'w'); fs.writeFileSync(fd, body);
    try { fs.fsyncSync(fd); } catch { /* best-effort */ }
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(tmp, target);
  } catch (err) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* ignore */ } }
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

// ── envelope extraction (§6.2) ───────────────────────────────────────────────
// Returns { status, json } or throws. Extracts ONLY the delimited JSON; rejects
// multiple profile blocks and BLOCKED_INPUT.
function extractEnvelope(raw) {
  const statusM = raw.match(/^STATUS:\s*(READY|PARTIAL|BLOCKED_INPUT)\s*$/m);
  if (!statusM) throw new Error('envelope has no "STATUS: READY|PARTIAL|BLOCKED_INPUT" line');
  const status = statusM[1];
  if (status === 'BLOCKED_INPUT') throw new Error('agent returned BLOCKED_INPUT — no profile to accept');
  const begins = [...raw.matchAll(/^PROFILE_JSON_BEGIN\s*$/gm)];
  const ends = [...raw.matchAll(/^PROFILE_JSON_END\s*$/gm)];
  if (begins.length === 0 || ends.length === 0) throw new Error('missing PROFILE_JSON_BEGIN/END delimiters');
  if (begins.length > 1 || ends.length > 1) throw new Error('multiple PROFILE_JSON blocks — exactly one profile object is allowed');
  const start = begins[0].index + begins[0][0].length;
  const end = ends[0].index;
  if (end <= start) throw new Error('PROFILE_JSON_END precedes PROFILE_JSON_BEGIN');
  const jsonText = raw.slice(start, end).trim();
  // Ambiguity guard: the delimited region must be exactly one JSON object.
  if (!jsonText.startsWith('{') || !jsonText.endsWith('}')) throw new Error('delimited region is not a single JSON object');
  let json;
  try { json = JSON.parse(jsonText); } catch (e) { throw new Error(`delimited profile is not valid JSON: ${e.message}`); }
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('profile must be a JSON object');
  return { status, json };
}

// ── profile validation (§6.3) ────────────────────────────────────────────────
// fromAgent=true forbids confidence:"verified" (the agent has no shell).
function validateProfile(root, profile, snapshot, { fromAgent } = {}) {
  const errors = [];
  const arr = (k) => Array.isArray(profile[k]);
  if (profile.schemaVersion !== PROFILE_SCHEMA_VERSION) errors.push(`schemaVersion must be ${PROFILE_SCHEMA_VERSION} (got ${JSON.stringify(profile.schemaVersion)})`);
  if (typeof profile.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(profile.fingerprint)) errors.push('fingerprint must be a sha256 hex string');
  else if (snapshot && profile.fingerprint !== snapshot.fingerprint) errors.push('fingerprint does not match the current snapshot (STALE/INVALID)');
  if (!PROFILE_STATUS.includes(profile.status)) errors.push(`status must be one of ${PROFILE_STATUS.join('|')}`);
  for (const k of ['instructionSources', 'languages', 'buildCommands', 'testCommands', 'subsystems', 'conventions', 'riskHotspots', 'unmapped', 'uncertainty']) {
    if (!arr(k)) errors.push(`${k} must be an array`);
  }
  // path-bearing fields
  try { (profile.instructionSources || []).forEach((p, i) => safePath(root, p, `instructionSources[${i}]`)); } catch (e) { errors.push(e.message); }
  for (const k of ['riskHotspots', 'unmapped']) {
    try { (profile[k] || []).forEach((p, i) => safeGlob(root, p, `${k}[${i}]`)); } catch (e) { errors.push(e.message); }
  }
  (profile.subsystems || []).forEach((s, i) => {
    if (!s || typeof s !== 'object') { errors.push(`subsystems[${i}] must be an object`); return; }
    if (!Array.isArray(s.paths)) errors.push(`subsystems[${i}].paths must be an array`);
    else { try { s.paths.forEach((p, j) => safeGlob(root, p, `subsystems[${i}].paths[${j}]`)); } catch (e) { errors.push(e.message); } }
    if (!['mapped', 'unmapped'].includes(s.status)) errors.push(`subsystems[${i}].status must be mapped|unmapped`);
    if (s.confidence !== undefined && !CONFIDENCE.includes(s.confidence)) errors.push(`subsystems[${i}].confidence must be ${CONFIDENCE.join('|')}`);
  });
  // verified/inferred/unknown distinction on commands
  for (const k of ['buildCommands', 'testCommands']) {
    (profile[k] || []).forEach((c, i) => {
      if (!c || typeof c !== 'object') { errors.push(`${k}[${i}] must be an object {command,confidence}`); return; }
      if (typeof c.command !== 'string' || !c.command) errors.push(`${k}[${i}].command must be a non-empty string`);
      if (!CONFIDENCE.includes(c.confidence)) errors.push(`${k}[${i}].confidence must be ${CONFIDENCE.join('|')}`);
      else if (fromAgent && c.confidence === 'verified') errors.push(`${k}[${i}] cannot be "verified" in an agent draft (the agent has no shell)`);
    });
  }
  // secrets / env values
  const serialized = JSON.stringify(profile);
  if (SECRET_RE.test(serialized)) errors.push('profile contains a secret or environment-value-like field');
  // size
  const bytes = Buffer.byteLength(JSON.stringify(profile, null, 2) + '\n', 'utf8');
  if (bytes > MAX_PROFILE_BYTES) errors.push(`profile exceeds ${MAX_PROFILE_BYTES} bytes (${bytes})`);
  return errors;
}

function readSnapshot(p) {
  if (!fs.existsSync(p)) die(`snapshot not found: ${p}. Run repo-snapshot.mjs write first.`, 2);
  try { return readJson(p); } catch (e) { die(`snapshot is not valid JSON: ${e.message}`); }
}

// ── Markdown render (deterministic, bounded ≤150 lines) ──────────────────────
function renderMarkdown(profile) {
  const lines = [];
  lines.push(`# Repository Profile`, '');
  lines.push(`- **Status:** ${profile.status}`);
  lines.push(`- **Fingerprint:** \`${profile.fingerprint}\``);
  lines.push(`- **Generated at commit:** ${profile.generatedAtCommit ? '`' + profile.generatedAtCommit + '`' : 'n/a'}`);
  lines.push(`- **Updated:** ${profile.updatedAt || 'n/a'}`, '');
  lines.push(`## Stack`, '');
  lines.push(`- **Languages:** ${(profile.languages || []).map((l) => `${l.name}${l.ext ? ' (' + l.ext + ')' : ''}`).join(', ') || 'none'}`);
  const cmd = (c) => `\`${c.command}\` *(${c.confidence})*`;
  lines.push(`- **Build:** ${(profile.buildCommands || []).map(cmd).join('; ') || 'none'}`);
  lines.push(`- **Test:** ${(profile.testCommands || []).map(cmd).join('; ') || 'none'}`);
  lines.push(`- **Instruction sources:** ${(profile.instructionSources || []).map((p) => '`' + p + '`').join(', ') || 'none'}`, '');
  lines.push(`## Subsystems`, '', '| Subsystem | Paths | Status | Confidence |', '|---|---|---|---|');
  for (const s of (profile.subsystems || []).slice(0, 50)) {
    lines.push(`| ${s.name} | ${(s.paths || []).map((p) => '`' + p + '`').join(', ')} | ${s.status} | ${s.confidence || 'unknown'} |`);
  }
  lines.push('', `## Risk hotspots`, '', ...(profile.riskHotspots || []).map((p) => `- \`${p}\``), '');
  lines.push(`## Unmapped`, '', ...(profile.unmapped || []).map((p) => `- \`${p}\``), '');
  lines.push(`## Uncertainty`, '', ...(profile.uncertainty || []).map((u) => `- ${u}`), '');
  return lines.slice(0, 150).join('\n') + '\n';
}

// ── commands ──────────────────────────────────────────────────────────────────
function parseFlags(argv) {
  const flags = {}; const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--snapshot') flags.snapshot = argv[++i];
    else if (argv[i].startsWith('--')) die(`unknown flag: ${argv[i]}`);
    else pos.push(argv[i]);
  }
  return { flags, pos };
}

function loadAndValidateFromAgent(root, p, rawPath, snapPath) {
  if (!rawPath) die('a <raw-output-path> is required');
  if (!fs.existsSync(rawPath)) die(`raw agent output not found: ${rawPath}`, 2);
  const snapshot = readSnapshot(snapPath || p.snapshot);
  const raw = stripBom(fs.readFileSync(rawPath, 'utf8'));
  let env;
  try { env = extractEnvelope(raw); } catch (e) { die(`envelope: ${e.message}`, 3); }
  const profile = env.json;
  // Force status from the envelope; never silently promote PARTIAL to a warm profile.
  profile.status = env.status === 'READY' ? 'ready' : 'partial';
  const errors = validateProfile(root, profile, snapshot, { fromAgent: true });
  return { snapshot, profile, errors, envStatus: env.status };
}

function cmdValidateAgentOutput(root, p, argv) {
  const { flags, pos } = parseFlags(argv);
  const { profile, errors, envStatus } = loadAndValidateFromAgent(root, p, pos[0], flags.snapshot);
  if (errors.length) { process.stderr.write('INVALID\n' + errors.map((e) => '  - ' + e).join('\n') + '\n'); process.exit(3); }
  process.stdout.write(`${envStatus === 'READY' ? 'VALID' : 'VALID_PARTIAL'} (status=${profile.status})\n`);
}

function cmdAcceptAgentOutput(root, p, argv) {
  const { flags, pos } = parseFlags(argv);
  const { profile, errors } = loadAndValidateFromAgent(root, p, pos[0], flags.snapshot);
  if (errors.length) {
    // Preserve the previous valid profile on failure — write nothing.
    process.stderr.write('INVALID — previous profile preserved\n' + errors.map((e) => '  - ' + e).join('\n') + '\n');
    process.exit(3);
  }
  if (!profile.updatedAt) profile.updatedAt = new Date().toISOString();
  const body = JSON.stringify(profile, null, 2) + '\n';
  atomicWrite(p.dir, p.candidate, body);   // candidate first
  atomicWrite(p.dir, p.profile, body);      // then promote
  atomicWrite(p.dir, p.md, renderMarkdown(profile));
  process.stdout.write(`ACCEPTED status=${profile.status} -> ${p.profile} (+ .md)\n`);
}

function cmdValidate(root, p, argv) {
  const { flags, pos } = parseFlags(argv);
  if (!pos[0]) die('a <candidate-json-path> is required');
  if (!fs.existsSync(pos[0])) die(`candidate not found: ${pos[0]}`, 2);
  const snapshot = readSnapshot(flags.snapshot || p.snapshot);
  let profile;
  try { profile = readJson(pos[0]); } catch (e) { process.stderr.write(`INVALID\n  - not valid JSON: ${e.message}\n`); process.exit(3); }
  const errors = validateProfile(root, profile, snapshot, { fromAgent: false });
  if (errors.length) { process.stderr.write('INVALID\n' + errors.map((e) => '  - ' + e).join('\n') + '\n'); process.exit(3); }
  process.stdout.write(`VALID (status=${profile.status})\n`);
}

function cmdStatus(root, p, argv) {
  const { flags } = parseFlags(argv);
  if (!fs.existsSync(p.profile)) { process.stdout.write('MISSING\n'); process.exit(3); }
  let profile;
  try { profile = readJson(p.profile); } catch { process.stdout.write('INVALID\n'); process.exit(4); }
  const snapPath = flags.snapshot || p.snapshot;
  if (!fs.existsSync(snapPath)) { process.stdout.write('MISSING\n  - no snapshot to compare\n'); process.exit(3); }
  const snapshot = readSnapshot(snapPath);
  if (profile.schemaVersion !== PROFILE_SCHEMA_VERSION || typeof profile.fingerprint !== 'string') { process.stdout.write('INVALID\n'); process.exit(4); }
  if (profile.fingerprint !== snapshot.fingerprint) { process.stdout.write('STALE\n'); process.exit(2); }
  if (profile.status !== 'ready') { process.stdout.write(`PARTIAL\n`); process.exit(2); }
  process.stdout.write('VALID\n'); process.exit(0);
}

function cmdRender(root, p) {
  if (!fs.existsSync(p.profile)) die('no repo-profile.json to render', 2);
  let profile;
  try { profile = readJson(p.profile); } catch (e) { die(`repo-profile.json is not valid JSON: ${e.message}`); }
  atomicWrite(p.dir, p.md, renderMarkdown(profile));
  process.stdout.write(`rendered ${p.md}\n`);
}

const USAGE = `repo-profile — validated repository-profile acceptance (Node + git, zero deps)

Usage: node repo-profile.mjs <command> [args]
  validate-agent-output <raw-path> --snapshot <snap>   validate an agent envelope (no write)
  accept-agent-output   <raw-path> --snapshot <snap>   validate + atomically promote
  validate <candidate.json> --snapshot <snap>          validate a raw candidate JSON
  status [--snapshot <snap>]                           VALID(0)|STALE(2)|MISSING(3)|INVALID(4)|PARTIAL(2)
  render                                               re-render repo-profile.md

Never trusts an unvalidated agent profile; never promotes PARTIAL to VALID;
preserves the previous valid profile on failure; writes atomically.`;

function main() {
  const [, , command, ...argv] = process.argv;
  if (!command || command === '-h' || command === '--help' || command === 'help') { process.stdout.write(USAGE + '\n'); process.exit(command ? 0 : 1); }
  requireGit();
  const root = worktreeRoot();
  const p = paths(root);
  switch (command) {
    case 'validate-agent-output': return cmdValidateAgentOutput(root, p, argv);
    case 'accept-agent-output': return cmdAcceptAgentOutput(root, p, argv);
    case 'validate': return cmdValidate(root, p, argv);
    case 'status': return cmdStatus(root, p, argv);
    case 'render': return cmdRender(root, p);
    default: process.stderr.write(`repo-profile: unknown command "${command}".\n\n${USAGE}\n`); process.exit(1);
  }
}

main();

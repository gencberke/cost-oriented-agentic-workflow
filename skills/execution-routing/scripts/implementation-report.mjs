#!/usr/bin/env node
// implementation-report — deterministic validation of a delegated unit's
// implementation report against its brief and the ACTUAL git worktree.
// (cost-oriented-agentic-workflow 0.5.0, Phase 3B.1.)
//
// The implementer's report is MODEL-AUTHORED and is never trusted as the source
// of truth. This helper validates the report's SHAPE (compact schema, safe
// repo-relative paths, bounded size), cross-checks it against the controller's
// brief (unit-id agreement, every brief outcome represented), and — most
// importantly — compares it against the REAL git diff. The actual git diff is
// always authoritative over the report's `filesChanged`: an omitted change, a
// falsely reported change, or any change outside the allowed paths is a hard
// failure. The helper NEVER modifies source files; it only reads and reports.
//
//   implementation-report.mjs validate  <report> [--brief <brief>]
//   implementation-report.mjs inspect   <report>
//   implementation-report.mjs render    <report>
//   implementation-report.mjs compare-worktree <report> --base <sha> [--allowed-path <p> ...]
//
// Node standard library + git only. Zero runtime dependencies. Cross-platform.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { computeOwnership, loadBaseline } from './unit-worktree.mjs';

// ── Schema bounds (§7) ───────────────────────────────────────────────────────
const SCHEMA_VERSION = 1;
const MAX_REPORT_BYTES = 8192;        // strict size ceiling (§7.2)
const MAX_ATTEMPTS = 3;               // initial attempt + 2 additional (§11)
const MAX_STRING = 600;               // a bounded factual field, never a log
const MAX_ARRAY = 25;                 // bounded list (outcomes, evidence, risks)
const UNIT_STATUS = ['DONE', 'PARTIAL', 'BLOCKED'];
const SELF_REVIEW_STATUS = ['PASS', 'CONCERNS'];
const TOP_KEYS = new Set([
  'schemaVersion', 'status', 'unitId', 'filesChanged', 'outcomes',
  'verification', 'selfReview', 'remainingRisks', 'attemptsUsed',
  // Phase 3B.1.1: attempt-qualified evidence + the unit baseline it was judged against.
  'attemptNumber', 'baselinePath',
]);
const OUTCOME_KEYS = new Set(['id', 'status', 'behaviorImplemented', 'acceptanceEvidence']);
const VERIFICATION_KEYS = new Set(['command', 'exitCode', 'testCount', 'summary']);
const SELF_REVIEW_FIELDS = new Set(['status', 'concerns']);

// ── plumbing ─────────────────────────────────────────────────────────────────
const die = (msg, code = 1) => { process.stderr.write(`implementation-report: ERROR: ${msg}\n`); process.exit(code); };
const stripBom = (s) => (s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s);
const isInt = (n) => Number.isInteger(n);
const isStr = (s) => typeof s === 'string';

function git(args, { cwd = process.cwd(), allowFail = false } = {}) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 }).replace(/\r?\n$/, ''); }
  catch (e) { if (allowFail) return null; throw e; }
}
function worktreeRoot() {
  const top = git(['rev-parse', '--show-toplevel'], { allowFail: true });
  if (!top) die('not inside a git worktree (could not resolve --show-toplevel).', 2);
  return path.resolve(top);
}

// Repo-relative, forward-slash, no escapes; must resolve inside the worktree.
// Returns the normalized path, or throws with a precise reason.
function safeRepoPath(root, value, label) {
  if (!isStr(value) || value.trim() === '') throw new Error(`${label}: a non-empty path is required`);
  const raw = value.trim();
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('/') || raw.startsWith('\\')) {
    throw new Error(`${label}: absolute paths are rejected ("${raw}")`);
  }
  const parts = raw.split(/[\\/]+/);
  if (parts.some((p) => p === '..')) throw new Error(`${label}: path traversal ("..") is rejected ("${raw}")`);
  const rel = parts.filter((p) => p !== '.' && p !== '').join('/');
  if (rel === '') throw new Error(`${label}: empty path after normalization ("${raw}")`);
  const resolved = path.resolve(root, rel);
  const within = path.relative(root, resolved);
  if (within === '' || within.startsWith('..') || path.isAbsolute(within)) {
    throw new Error(`${label}: path resolves outside the worktree ("${raw}")`);
  }
  return rel;
}
const normPath = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');
// Equal, or one is the worktree-relative suffix of the other (abs vs rel tolerant).
const matchPath = (a, b) => { if (a == null || b == null) return false; const x = normPath(a), y = normPath(b); return x === y || x.endsWith('/' + y) || y.endsWith('/' + x); };
// Outcome identity is compared loosely so a brief `OUTCOME_1` matches a report
// `outcome-1`: lower-case, drop a leading `outcome` separator, trim non-alnum.
const normOutcome = (s) => String(s).trim().toLowerCase().replace(/^outcome[-_\s]?/, '').replace(/[^a-z0-9]+$/, '');

const boundedStr = (v) => isStr(v) && v.length <= MAX_STRING;
const boundedStrArray = (v) => Array.isArray(v) && v.length <= MAX_ARRAY && v.every(boundedStr);

// ── 1. Schema validation (shape only; no git) ───────────────────────────────
function validateSchema(report, rawBytes, root) {
  const e = [];
  if (rawBytes > MAX_REPORT_BYTES) e.push(`report exceeds the ${MAX_REPORT_BYTES}-byte ceiling (${rawBytes} bytes)`);
  if (!report || typeof report !== 'object' || Array.isArray(report)) return ['report is not a JSON object'];

  for (const k of Object.keys(report)) if (!TOP_KEYS.has(k)) e.push(`unexpected top-level key "${k}" (no chain-of-thought, logs, or diffs)`);
  if (report.schemaVersion !== SCHEMA_VERSION) e.push(`schemaVersion must be ${SCHEMA_VERSION} (got ${JSON.stringify(report.schemaVersion)})`);
  if (!UNIT_STATUS.includes(report.status)) e.push(`status invalid: ${JSON.stringify(report.status)}`);
  if (!isStr(report.unitId) || report.unitId.trim() === '') e.push('unitId must be a non-empty string');

  if (!Array.isArray(report.filesChanged)) e.push('filesChanged must be an array');
  else {
    if (report.filesChanged.length > MAX_ARRAY) e.push(`filesChanged exceeds ${MAX_ARRAY} entries`);
    for (const f of report.filesChanged) {
      try { safeRepoPath(root, f, 'filesChanged'); } catch (err) { e.push(err.message); }
    }
  }

  if (!Array.isArray(report.outcomes) || report.outcomes.length < 1) e.push('outcomes must be a non-empty array');
  else {
    if (report.outcomes.length > MAX_ARRAY) e.push(`outcomes exceeds ${MAX_ARRAY} entries`);
    const seen = new Set();
    let anyIncomplete = false;
    for (const o of report.outcomes) {
      if (!o || typeof o !== 'object') { e.push('each outcome must be an object'); continue; }
      for (const k of Object.keys(o)) if (!OUTCOME_KEYS.has(k)) e.push(`outcome has unexpected key "${k}"`);
      if (!isStr(o.id) || o.id.trim() === '') e.push('outcome.id must be a non-empty string');
      else { const key = normOutcome(o.id); if (seen.has(key)) e.push(`duplicate outcome id "${o.id}"`); seen.add(key); }
      if (!UNIT_STATUS.includes(o.status)) e.push(`outcome.status invalid: ${JSON.stringify(o.status)}`);
      else if (o.status !== 'DONE') anyIncomplete = true;
      if (!boundedStr(o.behaviorImplemented)) e.push('outcome.behaviorImplemented must be a bounded string');
      if (!boundedStrArray(o.acceptanceEvidence)) e.push('outcome.acceptanceEvidence must be a bounded string array');
    }
    if (report.status === 'DONE' && anyIncomplete) e.push('status is DONE but an outcome is not DONE');
  }

  if (!Array.isArray(report.verification) || report.verification.length < 1) e.push('verification must be a non-empty array');
  else {
    if (report.verification.length > MAX_ARRAY) e.push(`verification exceeds ${MAX_ARRAY} entries`);
    for (const v of report.verification) {
      if (!v || typeof v !== 'object') { e.push('each verification entry must be an object'); continue; }
      for (const k of Object.keys(v)) if (!VERIFICATION_KEYS.has(k)) e.push(`verification has unexpected key "${k}"`);
      if (!boundedStr(v.command)) e.push('verification.command must be a bounded string');
      if (!isInt(v.exitCode)) e.push('verification.exitCode must be an integer');
      if (!isInt(v.testCount) || v.testCount < 0) e.push('verification.testCount must be a non-negative integer');
      if (!boundedStr(v.summary)) e.push('verification.summary must be a bounded string');
    }
  }

  if (!report.selfReview || typeof report.selfReview !== 'object') e.push('selfReview must be an object');
  else {
    for (const k of Object.keys(report.selfReview)) if (!SELF_REVIEW_FIELDS.has(k)) e.push(`selfReview has unexpected key "${k}"`);
    if (!SELF_REVIEW_STATUS.includes(report.selfReview.status)) e.push(`selfReview.status invalid: ${JSON.stringify(report.selfReview.status)}`);
    if (!boundedStrArray(report.selfReview.concerns)) e.push('selfReview.concerns must be a bounded string array');
  }

  if (!boundedStrArray(report.remainingRisks)) e.push('remainingRisks must be a bounded string array');
  if (!isInt(report.attemptsUsed) || report.attemptsUsed < 1 || report.attemptsUsed > MAX_ATTEMPTS) {
    e.push(`attemptsUsed must be an integer in 1..${MAX_ATTEMPTS} (got ${JSON.stringify(report.attemptsUsed)})`);
  }
  if ('attemptNumber' in report && (!isInt(report.attemptNumber) || report.attemptNumber < 1 || report.attemptNumber > MAX_ATTEMPTS)) {
    e.push(`attemptNumber must be an integer in 1..${MAX_ATTEMPTS} (got ${JSON.stringify(report.attemptNumber)})`);
  }
  if ('baselinePath' in report) {
    try { safeRepoPath(root, report.baselinePath, 'baselinePath'); } catch (err) { e.push(err.message); }
  }
  return e;
}

// ── 2. Brief cross-check (unit-id agreement + outcome coverage) ──────────────
function parseBrief(text) {
  const t = stripBom(text);
  let unitId = null;
  const m = t.match(/^\s*UNIT_ID:\s*(\S+)/m);
  if (m) unitId = m[1].trim();
  else { const h = t.match(/^#+\s*Task\s+(\S+)/m); if (h) unitId = `task-${h[1].replace(/[:.].*$/, '')}`; }
  const keys = new Set();
  for (const mm of t.matchAll(/^\s*(?:[-*]\s*)?OUTCOME[_-]?(\w+)\b/gim)) keys.add(normOutcome(mm[1]));
  for (const mm of t.matchAll(/^\s*[-*]\s*id:\s*(\S+)/gim)) keys.add(normOutcome(mm[1]));
  keys.delete('');
  return { unitId, outcomeKeys: keys };
}
function validateAgainstBrief(report, briefText) {
  const e = [];
  const brief = parseBrief(briefText);
  if (brief.unitId && normOutcome(report.unitId) !== normOutcome(brief.unitId)
      && report.unitId.trim() !== brief.unitId.trim()) {
    e.push(`unitId "${report.unitId}" does not match the brief's "${brief.unitId}"`);
  }
  const reportKeys = new Set((report.outcomes || []).map((o) => normOutcome(o.id)));
  for (const k of brief.outcomeKeys) if (!reportKeys.has(k)) e.push(`brief outcome "${k}" is missing from the report`);
  return e;
}

// ── 3. Worktree comparison (the actual git diff is authoritative) ────────────
function actualChangedPaths(root, base) {
  const sha = git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { cwd: root, allowFail: true });
  if (!sha) die(`bad --base: ${base}`, 2);
  const out = new Set();
  const tracked = git(['diff', '--name-only', '--no-renames', `${sha}`, '--'], { cwd: root, allowFail: true }) || '';
  for (const l of tracked.split(/\r?\n/)) if (l.trim()) out.add(normPath(l.trim()));
  const untracked = git(['ls-files', '--others', '--exclude-standard'], { cwd: root, allowFail: true }) || '';
  for (const l of untracked.split(/\r?\n/)) if (l.trim()) out.add(normPath(l.trim()));
  // The self-ignored workflow workspace is never a unit's source change.
  return [...out].filter((p) => !p.startsWith('.cost-oriented-agentic-workflow/')).sort();
}
const underAllowed = (p, allowed) => allowed.some((a) => p === a || p.startsWith(a.replace(/\/+$/, '') + '/'));

function compareWorktree(root, report, base, allowedPaths) {
  const actual = actualChangedPaths(root, base);
  const reported = [...new Set((report.filesChanged || []).map(normPath))].sort();
  const omittedChanged = actual.filter((p) => !reported.includes(p));               // changed but not reported
  const falselyReported = reported.filter((p) => !actual.includes(p));              // reported but not changed
  const outsideAllowed = allowedPaths.length ? actual.filter((p) => !underAllowed(p, allowedPaths)) : [];
  return { actual, reported, omittedChanged, falselyReported, outsideAllowed };
}

// ── report I/O ────────────────────────────────────────────────────────────────
function readReport(file) {
  let rawBytes, text;
  try { const buf = fs.readFileSync(file); rawBytes = buf.length; text = buf.toString('utf8'); }
  catch (err) { die(`cannot read report ${file}: ${err.message}`, 2); }
  let parsed;
  try { parsed = JSON.parse(stripBom(text)); }
  catch (err) { return { rawBytes, parsed: null, parseError: err.message }; }
  return { rawBytes, parsed, parseError: null };
}

// ── render (bounded Markdown from VALIDATED JSON only) ───────────────────────
function renderMarkdown(r) {
  const L = [];
  L.push(`# Implementation report: ${r.unitId}`, '');
  L.push(`- Status: ${r.status}`);
  L.push(`- Attempts used: ${r.attemptsUsed}`);
  L.push(`- Files changed: ${r.filesChanged.length ? r.filesChanged.join(', ') : '(none)'}`, '');
  L.push('## Outcomes');
  for (const o of r.outcomes) {
    L.push(`- **${o.id}** — ${o.status}: ${o.behaviorImplemented}`);
    for (const ev of o.acceptanceEvidence) L.push(`  - evidence: ${ev}`);
  }
  L.push('', '## Verification');
  for (const v of r.verification) L.push(`- \`${v.command}\` → exit ${v.exitCode}, ${v.testCount} test(s): ${v.summary}`);
  L.push('', `## Self-review: ${r.selfReview.status}`);
  for (const c of r.selfReview.concerns) L.push(`- ${c}`);
  L.push('', '## Remaining risks');
  if (r.remainingRisks.length) for (const x of r.remainingRisks) L.push(`- ${x}`);
  else L.push('- (none)');
  return L.join('\n') + '\n';
}

// ── CLI ────────────────────────────────────────────────────────────────────
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

const USAGE = `implementation-report — validate a delegated unit report (Node + git, zero deps)

Usage:
  implementation-report.mjs validate <report> [--brief <brief>] [--attempt <n>] [--baseline <path>]
  implementation-report.mjs inspect <report>
  implementation-report.mjs render <report>
  implementation-report.mjs compare-worktree <report> --baseline <path> | --base <sha> [--allowed-path <p> ...]

The unit baseline (preferred) separates pre-existing dirty USER paths from
unit-owned changes; the actual git diff is authoritative over the report's
filesChanged. The helper never modifies source files; a failed report is
preserved as evidence.`;

function main() {
  const [, , command, ...rest] = process.argv;
  if (!command || ['help', '--help', '-h'].includes(command)) { process.stdout.write(USAGE + '\n'); process.exit(command ? 0 : 1); }
  const root = worktreeRoot();

  if (command === 'validate') {
    const { flags, positional } = parseArgs(rest, { value: ['brief', 'attempt', 'baseline'] });
    const file = positional[0]; if (!file) die('validate requires <report>', 2);
    const { rawBytes, parsed, parseError } = readReport(file);
    if (parseError) die(`report is not valid JSON: ${parseError}`);
    const errs = validateSchema(parsed, rawBytes, root);
    if (flags.brief) {
      let bt; try { bt = fs.readFileSync(flags.brief, 'utf8'); } catch (err) { die(`cannot read brief ${flags.brief}: ${err.message}`, 2); }
      errs.push(...validateAgainstBrief(parsed, bt));
    }
    // Phase 3B.1.1: attempt + baseline agreement, and attempt-qualified naming.
    if (flags.attempt !== undefined) {
      const n = Number(flags.attempt);
      if (parsed && parsed.attemptNumber !== n) errs.push(`report attemptNumber ${JSON.stringify(parsed.attemptNumber)} does not match dispatch attempt ${n}`);
      if (!new RegExp(`attempt-${n}-report\\.json$`).test(normPath(file))) errs.push(`report path is not attempt-qualified for attempt ${n} (expected task-<id>-attempt-${n}-report.json)`);
    }
    if (flags.baseline !== undefined) {
      const want = normPath(flags.baseline); const got = parsed && parsed.baselinePath != null ? normPath(parsed.baselinePath) : null;
      if (!matchPath(got, want)) errs.push(`report baselinePath ${JSON.stringify(parsed && parsed.baselinePath)} does not match the unit baseline ${flags.baseline}`);
    }
    if (errs.length) { for (const m of errs) process.stderr.write(`  - ${m}\n`); die(`report failed validation (${errs.length} problem(s)); preserved as evidence.`); }
    process.stdout.write(`OK: ${file} valid (unit ${parsed.unitId}, status ${parsed.status}, ${parsed.outcomes.length} outcome(s)).\n`);
    return;
  }

  if (command === 'inspect') {
    const { positional } = parseArgs(rest, {});
    const file = positional[0]; if (!file) die('inspect requires <report>', 2);
    const { parsed, parseError } = readReport(file);
    if (parseError) die(`report is not valid JSON: ${parseError}`);
    const summary = {
      unitId: parsed.unitId ?? null, status: parsed.status ?? null,
      filesChanged: Array.isArray(parsed.filesChanged) ? parsed.filesChanged.map(normPath) : [],
      outcomes: Array.isArray(parsed.outcomes) ? parsed.outcomes.map((o) => ({ id: o && o.id, status: o && o.status })) : [],
      verification: Array.isArray(parsed.verification) ? parsed.verification.map((v) => ({ command: v && v.command, exitCode: v && v.exitCode, testCount: v && v.testCount })) : [],
      attemptsUsed: parsed.attemptsUsed ?? null,
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    return;
  }

  if (command === 'render') {
    const { positional } = parseArgs(rest, {});
    const file = positional[0]; if (!file) die('render requires <report>', 2);
    const { rawBytes, parsed, parseError } = readReport(file);
    if (parseError) die(`report is not valid JSON: ${parseError}`);
    const errs = validateSchema(parsed, rawBytes, root);
    if (errs.length) die(`refusing to render an invalid report (${errs.length} problem(s)).`);
    process.stdout.write(renderMarkdown(parsed));
    return;
  }

  if (command === 'compare-worktree') {
    const { flags, positional } = parseArgs(rest, { value: ['base', 'baseline'], repeat: ['allowed-path'] });
    const file = positional[0]; if (!file) die('compare-worktree requires <report>', 2);
    if (!flags.base && !flags.baseline) die('compare-worktree requires --baseline <path> (preferred) or --base <sha>', 2);
    const { rawBytes, parsed, parseError } = readReport(file);
    if (parseError) die(`report is not valid JSON: ${parseError}`);
    const errs = validateSchema(parsed, rawBytes, root);
    if (errs.length) { for (const m of errs) process.stderr.write(`  - ${m}\n`); die('report is invalid; comparison not attempted (preserved as evidence).'); }
    // Phase 3B.1.1: the unit baseline is the authoritative ownership source —
    // it separates pre-existing dirty USER paths from unit-owned changes.
    if (flags.baseline) {
      const baseline = loadBaseline(path.isAbsolute(flags.baseline) ? flags.baseline : path.join(root, normPath(flags.baseline)));
      const own = computeOwnership(root, baseline);
      const reported = [...new Set((parsed.filesChanged || []).map(normPath))].sort();
      // Normalize the helper's per-path violations into grouped {code, paths},
      // matching the legacy --base output shape.
      const grouped = {};
      for (const v of own.violations) (grouped[v.code] ||= []).push(v.path);
      const violations = Object.entries(grouped).map(([code, paths]) => ({ code, paths: paths.sort() }));
      const omitted = own.unitOwned.filter((p) => !reported.includes(p));
      const falsely = reported.filter((p) => !own.unitOwned.includes(p));
      if (omitted.length) violations.push({ code: 'OMITTED_CHANGED_FILE', paths: omitted });
      if (falsely.length) violations.push({ code: 'REPORTED_UNCHANGED_FILE', paths: falsely });
      const out = { baseline: normPath(flags.baseline), unitOwned: own.unitOwned, preserved: own.preserved, reportedChanged: reported, violations };
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      if (violations.length) process.exit(1);
      return;
    }
    let allowed = [];
    try { allowed = (flags['allowed-path'] || []).map((p) => safeRepoPath(root, p, 'allowed-path')); }
    catch (err) { die(err.message, 2); }
    const c = compareWorktree(root, parsed, flags.base, allowed);
    const violations = [];
    if (c.omittedChanged.length) violations.push({ code: 'OMITTED_CHANGED_FILE', paths: c.omittedChanged });
    if (c.falselyReported.length) violations.push({ code: 'REPORTED_UNCHANGED_FILE', paths: c.falselyReported });
    if (c.outsideAllowed.length) violations.push({ code: 'OUTSIDE_ALLOWED_PATH', paths: c.outsideAllowed });
    const out = {
      base: flags.base, allowedPaths: allowed,
      actualChanged: c.actual, reportedChanged: c.reported, violations,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    if (violations.length) process.exit(1);
    return;
  }

  process.stderr.write(`implementation-report: unknown command "${command}".\n\n${USAGE}\n`);
  process.exit(1);
}

main();

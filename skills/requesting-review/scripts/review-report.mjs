#!/usr/bin/env node
// review-report — deterministic validation of an independent reviewer's report.
// (cost-oriented-agentic-workflow 0.5.0, Phase 3B.2 — Review Control Plane.)
//
// The scoped `cow-reviewer` is read-only and has no Write tool: it returns a
// compact delimited JSON verdict in its final message. The controller persists
// that JSON to the review-report path and validates it HERE before adjudicating.
// The report is EVIDENCE for controller adjudication — it never self-executes a
// workflow decision. This helper validates the report's SHAPE (compact schema,
// safe repo-relative paths, bounded size), the causality/blocking model (only
// INTRODUCED/WORSENED Critical/Important may block; never a blocking Minor or a
// blocking pre-existing finding), verdict consistency (no APPROVE with an open
// blocking finding), and — given the review package — scope agreement and that
// every accepted blocking finding is re-adjudicated in a targeted re-review. It
// NEVER modifies source files; a failed report is preserved as evidence.
//
//   review-report.mjs validate <report> [--package <pkg>] [--accepted-finding-ids a,b]
//   review-report.mjs inspect  <report>
//   review-report.mjs render   <report>
//   review-report.mjs summarize-findings <report>
//
// Node standard library + git only. Zero runtime dependencies. Cross-platform.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// ── Schema bounds (§10) ──────────────────────────────────────────────────────
const SCHEMA_VERSION = 1;
const MAX_REPORT_BYTES = 12288;       // strict 12 KB ceiling (§10)
const MAX_STRING = 600;               // a bounded factual field, never a log
const MAX_ARRAY = 50;                 // bounded list (findings, artifacts, risks)

const SCOPES = ['UNIT_REVIEW', 'TARGETED_REREVIEW', 'WHOLE_WORK_REVIEW'];
const MODES = ['standard', 'production'];
// COW's live mode/risk matrix uses low|elevated|high (preserved, not redesigned).
// faz_3.C's §10.1 schema sketch shows low|medium|high illustratively; the live
// matrix governs, so the report mirrors the dispatched RISK token.
const RISKS = ['low', 'elevated', 'high'];
const VERDICTS = ['PASS', 'CONCERNS', 'FAIL'];
const OVERALL = ['APPROVE', 'CHANGES_REQUIRED', 'BLOCKED'];
const SEVERITY = ['CRITICAL', 'IMPORTANT', 'MINOR'];
const CAUSALITY = ['INTRODUCED', 'WORSENED', 'PRE_EXISTING', 'UNCERTAIN'];
const FINDING_STATUS = ['OPEN', 'RESOLVED', 'NOT_RESOLVED', 'OUT_OF_SCOPE'];
// Only these causalities may carry blocking=true (matrix §11).
const BLOCKING_CAUSALITY = new Set(['INTRODUCED', 'WORSENED']);
const OPEN_STATUS = new Set(['OPEN', 'NOT_RESOLVED']);

const TOP_KEYS = new Set([
  'schemaVersion', 'reviewScope', 'reviewTargetId', 'mode', 'risk',
  'specVerdict', 'qualityVerdict', 'overallVerdict', 'findings',
  'reviewedArtifacts', 'remainingRisks',
]);
const FINDING_KEYS = new Set([
  'id', 'severity', 'causality', 'status', 'path', 'line',
  'title', 'evidence', 'recommendation', 'blocking',
]);
const PKG_TOP_KEYS = new Set([
  'schemaVersion', 'reviewScope', 'reviewTargetId', 'mode', 'risk',
  'taskBriefPath', 'planPath', 'ledgerPath', 'unitBaselinePath',
  'implementationReportPath', 'acceptedAttempt', 'unitOwnedPaths', 'allowedPaths',
  'knownPreExistingPaths', 'baseSha', 'headSha', 'diffArtifactPath',
  'verificationSummaryPath', 'priorReviewReportPath', 'acceptedFindingIds',
  'remediationWave', 'changedPathsSinceReview', 'unitCommitList',
  'unitReviewReportPaths', 'findingLedgerPath',
]);

// ── plumbing ─────────────────────────────────────────────────────────────────
const die = (msg, code = 1) => { process.stderr.write(`review-report: ERROR: ${msg}\n`); process.exit(code); };
const stripBom = (s) => (s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s);
const isInt = (n) => Number.isInteger(n);
const isStr = (s) => typeof s === 'string';
const isBool = (b) => typeof b === 'boolean';

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
function safeRepoPath(root, value, label) {
  if (!isStr(value) || value.trim() === '') throw new Error(`${label}: a non-empty path is required`);
  const raw = value.trim();
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('/') || raw.startsWith('\\')) {
    throw new Error(`${label}: absolute paths are rejected ("${raw}")`);
  }
  const parts = raw.split(/[\\/]+/);
  if (parts.some((p) => p === '..')) throw new Error(`${label}: path traversal ("..") is rejected ("${raw}")`);
  const relp = parts.filter((p) => p !== '.' && p !== '').join('/');
  if (relp === '') throw new Error(`${label}: empty path after normalization ("${raw}")`);
  const resolved = path.resolve(root, relp);
  const within = path.relative(root, resolved);
  if (within === '' || within.startsWith('..') || path.isAbsolute(within)) {
    throw new Error(`${label}: path resolves outside the worktree ("${raw}")`);
  }
  return relp;
}
const normPath = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');
const boundedStr = (v) => isStr(v) && v.length <= MAX_STRING;
const nonEmptyBoundedStr = (v) => isStr(v) && v.trim() !== '' && v.length <= MAX_STRING;
const boundedStrArray = (v) => Array.isArray(v) && v.length <= MAX_ARRAY && v.every(boundedStr);
// Forbidden in a bounded factual field: chain-of-thought, code fences, full diffs.
const SMELLS = [/```/, /\bdiff --git\b/, /^@@ /m, /<thinking>/i, /sk-[a-z0-9]{16,}/i, /-----BEGIN [A-Z ]*PRIVATE KEY/];
const looksUnsafe = (v) => isStr(v) && SMELLS.some((re) => re.test(v));

// Is `p` inside the package scope (allowed/unit-owned paths)?
const underAny = (p, set) => set.some((a) => {
  const aa = normPath(a).replace(/\/+$/, '');
  const pp = normPath(p);
  return pp === aa || pp.startsWith(aa + '/');
});

// ── schema validation (shape + causality/blocking + verdict consistency) ──────
function validateSchema(report, rawBytes, root) {
  const e = [];
  if (rawBytes > MAX_REPORT_BYTES) e.push(`report exceeds the ${MAX_REPORT_BYTES}-byte ceiling (${rawBytes} bytes)`);
  if (!report || typeof report !== 'object' || Array.isArray(report)) return ['report is not a JSON object'];

  for (const k of Object.keys(report)) if (!TOP_KEYS.has(k)) e.push(`unexpected top-level key "${k}" (no chain-of-thought, logs, or diffs)`);
  if (report.schemaVersion !== SCHEMA_VERSION) e.push(`schemaVersion must be ${SCHEMA_VERSION} (got ${JSON.stringify(report.schemaVersion)})`);
  if (!SCOPES.includes(report.reviewScope)) e.push(`reviewScope invalid: ${JSON.stringify(report.reviewScope)}`);
  if (!nonEmptyBoundedStr(report.reviewTargetId)) e.push('reviewTargetId must be a non-empty bounded string');
  if (!MODES.includes(report.mode)) e.push(`mode invalid: ${JSON.stringify(report.mode)}`);
  if (!RISKS.includes(report.risk)) e.push(`risk invalid: ${JSON.stringify(report.risk)} (expected ${RISKS.join('|')})`);
  if (!VERDICTS.includes(report.specVerdict)) e.push(`specVerdict invalid: ${JSON.stringify(report.specVerdict)}`);
  if (!VERDICTS.includes(report.qualityVerdict)) e.push(`qualityVerdict invalid: ${JSON.stringify(report.qualityVerdict)}`);
  if (!OVERALL.includes(report.overallVerdict)) e.push(`overallVerdict invalid: ${JSON.stringify(report.overallVerdict)}`);

  const findings = report.findings;
  let anyOpenBlocking = false;
  if (!Array.isArray(findings)) e.push('findings must be an array');
  else {
    if (findings.length > MAX_ARRAY) e.push(`findings exceeds ${MAX_ARRAY} entries`);
    const seen = new Set();
    for (const f of findings) {
      if (!f || typeof f !== 'object' || Array.isArray(f)) { e.push('each finding must be an object'); continue; }
      for (const k of Object.keys(f)) if (!FINDING_KEYS.has(k)) e.push(`finding has unexpected key "${k}"`);
      if (!isStr(f.id) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(f.id)) e.push(`finding.id invalid: ${JSON.stringify(f.id)}`);
      else { if (seen.has(f.id)) e.push(`duplicate finding id "${f.id}"`); seen.add(f.id); }
      if (!SEVERITY.includes(f.severity)) e.push(`finding.severity invalid: ${JSON.stringify(f.severity)}`);
      if (!CAUSALITY.includes(f.causality)) e.push(`finding.causality invalid: ${JSON.stringify(f.causality)}`);
      if (!FINDING_STATUS.includes(f.status)) e.push(`finding.status invalid: ${JSON.stringify(f.status)}`);
      if ('path' in f && f.path !== null) { try { safeRepoPath(root, f.path, `finding ${f.id} path`); } catch (err) { e.push(err.message); } }
      if ('line' in f && f.line !== null && (!isInt(f.line) || f.line < 0)) e.push(`finding ${f.id} line must be a non-negative integer`);
      if (!nonEmptyBoundedStr(f.title)) e.push(`finding ${f.id} title must be a non-empty bounded string`);
      if (!boundedStr(f.evidence)) e.push(`finding ${f.id} evidence must be a bounded string`);
      if (!boundedStr(f.recommendation)) e.push(`finding ${f.id} recommendation must be a bounded string`);
      if (!isBool(f.blocking)) e.push(`finding ${f.id} blocking must be a boolean`);
      for (const [k, v] of [['title', f.title], ['evidence', f.evidence], ['recommendation', f.recommendation]]) {
        if (looksUnsafe(v)) e.push(`finding ${f.id} ${k} contains forbidden content (code fence, diff, key, or chain-of-thought)`);
      }
      // Causality/blocking model (§11): only INTRODUCED/WORSENED Critical/Important may block.
      if (f.blocking === true) {
        if (f.severity === 'MINOR') e.push(`finding ${f.id} is a blocking MINOR — the matrix never blocks on Minor`);
        if (!BLOCKING_CAUSALITY.has(f.causality)) e.push(`finding ${f.id} is blocking but causality is ${f.causality} (only INTRODUCED/WORSENED may block)`);
        if (OPEN_STATUS.has(f.status)) anyOpenBlocking = true;
      }
    }
  }

  if (!boundedStrArray(report.reviewedArtifacts)) e.push('reviewedArtifacts must be a bounded string array');
  else for (const a of report.reviewedArtifacts) { try { safeRepoPath(root, a, 'reviewedArtifacts'); } catch (err) { e.push(err.message); } }
  if (!boundedStrArray(report.remainingRisks)) e.push('remainingRisks must be a bounded string array');
  else for (const r of report.remainingRisks) if (looksUnsafe(r)) e.push('remainingRisks contains forbidden content');

  // Verdict consistency: APPROVE cannot ship with an open blocking finding.
  if (report.overallVerdict === 'APPROVE' && anyOpenBlocking) {
    e.push('overallVerdict is APPROVE but an open/not-resolved blocking finding remains');
  }
  return e;
}

// ── package cross-check (scope agreement + finding scope + re-review coverage) ─
function validateAgainstPackage(report, pkg, acceptedIds) {
  const e = [];
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return ['review package is not a JSON object'];
  for (const k of Object.keys(pkg)) if (!PKG_TOP_KEYS.has(k)) e.push(`package has unexpected top-level key "${k}"`);
  if (pkg.schemaVersion !== SCHEMA_VERSION) e.push(`package schemaVersion must be ${SCHEMA_VERSION}`);
  if (pkg.reviewScope !== report.reviewScope) e.push(`report reviewScope "${report.reviewScope}" != package "${pkg.reviewScope}"`);
  if (pkg.reviewTargetId !== report.reviewTargetId) e.push(`report reviewTargetId "${report.reviewTargetId}" != package "${pkg.reviewTargetId}"`);
  if (pkg.mode !== report.mode) e.push(`report mode "${report.mode}" != package "${pkg.mode}"`);
  if (pkg.risk !== report.risk) e.push(`report risk "${report.risk}" != package "${pkg.risk}"`);

  // Findings must live within the package scope unless explicitly OUT_OF_SCOPE
  // or PRE_EXISTING (already-broken debt the reviewer is allowed to surface).
  const scopePaths = [
    ...(Array.isArray(pkg.unitOwnedPaths) ? pkg.unitOwnedPaths : []),
    ...(Array.isArray(pkg.allowedPaths) ? pkg.allowedPaths : []),
    ...(Array.isArray(pkg.changedPathsSinceReview) ? pkg.changedPathsSinceReview : []),
  ];
  const wholeWork = report.reviewScope === 'WHOLE_WORK_REVIEW';
  for (const f of (report.findings || [])) {
    if (!f || !f.path) continue;
    if (f.status === 'OUT_OF_SCOPE' || f.causality === 'PRE_EXISTING' || wholeWork) continue;
    if (scopePaths.length && !underAny(f.path, scopePaths)) {
      e.push(`finding ${f.id} path "${f.path}" is outside the package scope without status OUT_OF_SCOPE`);
    }
  }

  // Targeted re-review coverage (accepted ids may come from the package too).
  if (report.reviewScope === 'TARGETED_REREVIEW') {
    const accepted = acceptedIds.length ? acceptedIds
      : (Array.isArray(pkg.acceptedFindingIds) ? pkg.acceptedFindingIds : []);
    e.push(...validateTargetedRereview(report, accepted));
  }
  return e;
}

// Targeted re-review: every accepted (prior blocking) finding must be
// re-adjudicated here with a terminal status; any other finding may appear
// only as a newly INTRODUCED remediation regression.
function validateTargetedRereview(report, accepted) {
  const e = [];
  const byId = new Map((report.findings || []).map((f) => [f.id, f]));
  for (const id of accepted) {
    const f = byId.get(id);
    if (!f) { e.push(`targeted re-review omits accepted finding "${id}"`); continue; }
    if (f.status !== 'RESOLVED' && f.status !== 'NOT_RESOLVED') {
      e.push(`accepted finding "${id}" must be RESOLVED or NOT_RESOLVED in a targeted re-review (got ${f.status})`);
    }
  }
  const acceptedSet = new Set(accepted);
  for (const f of (report.findings || [])) {
    if (acceptedSet.has(f.id)) continue;
    if (f.causality !== 'INTRODUCED') {
      e.push(`finding "${f.id}" is not an accepted finding and not an INTRODUCED remediation regression`);
    }
  }
  return e;
}

// ── report I/O ────────────────────────────────────────────────────────────────
function readJson(file, label) {
  let rawBytes, text;
  try { const buf = fs.readFileSync(file); rawBytes = buf.length; text = buf.toString('utf8'); }
  catch (err) { die(`cannot read ${label} ${file}: ${err.message}`, 2); }
  let parsed;
  try { parsed = JSON.parse(stripBom(text)); }
  catch (err) { return { rawBytes, parsed: null, parseError: err.message }; }
  return { rawBytes, parsed, parseError: null };
}

// ── render (bounded Markdown from VALIDATED JSON only) ────────────────────────
function renderMarkdown(r) {
  const L = [];
  L.push(`# Review report: ${r.reviewTargetId} (${r.reviewScope})`, '');
  L.push(`- Mode/risk: ${r.mode} / ${r.risk}`);
  L.push(`- Spec: ${r.specVerdict} · Quality: ${r.qualityVerdict} · Overall: **${r.overallVerdict}**`, '');
  L.push('## Findings');
  if (!r.findings.length) L.push('- (none)');
  for (const f of r.findings) {
    const loc = f.path ? ` ${f.path}${f.line != null ? ':' + f.line : ''}` : '';
    L.push(`- **${f.id}** [${f.severity}/${f.causality}/${f.status}]${f.blocking ? ' (blocking)' : ''}${loc}: ${f.title}`);
    if (f.evidence) L.push(`  - evidence: ${f.evidence}`);
    if (f.recommendation) L.push(`  - recommendation: ${f.recommendation}`);
  }
  L.push('', '## Reviewed artifacts');
  if (r.reviewedArtifacts.length) for (const a of r.reviewedArtifacts) L.push(`- ${a}`); else L.push('- (none)');
  L.push('', '## Remaining risks');
  if (r.remainingRisks.length) for (const x of r.remainingRisks) L.push(`- ${x}`); else L.push('- (none)');
  return L.join('\n') + '\n';
}

function summarizeFindings(r) {
  const blocking = r.findings.filter((f) => f.blocking === true);
  const openBlocking = blocking.filter((f) => OPEN_STATUS.has(f.status));
  const bySeverity = {};
  for (const f of r.findings) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  return {
    reviewScope: r.reviewScope, reviewTargetId: r.reviewTargetId,
    overallVerdict: r.overallVerdict, specVerdict: r.specVerdict, qualityVerdict: r.qualityVerdict,
    findingCount: r.findings.length, bySeverity,
    blockingIds: blocking.map((f) => f.id),
    openBlockingIds: openBlocking.map((f) => f.id),
    introducedOrWorsenedIds: r.findings.filter((f) => f.causality === 'INTRODUCED' || f.causality === 'WORSENED').map((f) => f.id),
    preExistingIds: r.findings.filter((f) => f.causality === 'PRE_EXISTING').map((f) => f.id),
    uncertainIds: r.findings.filter((f) => f.causality === 'UNCERTAIN').map((f) => f.id),
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────
function parseArgs(argv, spec) {
  const flags = {}; const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { positional.push(a); continue; }
    const key = a.slice(2);
    if (spec.value && spec.value.includes(key)) { const v = argv[++i]; if (v === undefined) die(`flag --${key} requires a value`); flags[key] = v; continue; }
    die(`unknown flag: --${key}`);
  }
  return { flags, positional };
}

const USAGE = `review-report — validate an independent reviewer's report (Node + git, zero deps)

Usage:
  review-report.mjs validate <report> [--package <pkg>] [--accepted-finding-ids a,b]
  review-report.mjs inspect <report>
  review-report.mjs render <report>
  review-report.mjs summarize-findings <report>

The reviewer is read-only; the controller persists the returned JSON and validates
it here before adjudicating. The report is evidence, never a self-executing
decision. The helper never modifies source files; a failed report is preserved.`;

function loadValid(file, root, { withPackage, acceptedIds, pkgFile } = {}) {
  const { rawBytes, parsed, parseError } = readJson(file, 'report');
  if (parseError) die(`report is not valid JSON: ${parseError}`);
  const errs = validateSchema(parsed, rawBytes, root);
  if (withPackage) {
    const { parsed: pkg, parseError: pErr } = readJson(pkgFile, 'package');
    if (pErr) die(`review package is not valid JSON: ${pErr}`);
    errs.push(...validateAgainstPackage(parsed, pkg, acceptedIds));
  } else if (parsed && parsed.reviewScope === 'TARGETED_REREVIEW' && acceptedIds && acceptedIds.length) {
    errs.push(...validateTargetedRereview(parsed, acceptedIds));
  }
  return { parsed, errs };
}

function main() {
  const [, , command, ...rest] = process.argv;
  if (!command || ['help', '--help', '-h'].includes(command)) { process.stdout.write(USAGE + '\n'); process.exit(command ? 0 : 1); }
  const root = worktreeRoot();

  if (command === 'validate') {
    const { flags, positional } = parseArgs(rest, { value: ['package', 'accepted-finding-ids'] });
    const file = positional[0]; if (!file) die('validate requires <report>', 2);
    const acceptedIds = (flags['accepted-finding-ids'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const { parsed, errs } = loadValid(file, root, { withPackage: !!flags.package, acceptedIds, pkgFile: flags.package });
    if (errs.length) { for (const m of errs) process.stderr.write(`  - ${m}\n`); die(`review report failed validation (${errs.length} problem(s)); preserved as evidence.`); }
    process.stdout.write(`OK: ${file} valid (${parsed.reviewScope} ${parsed.reviewTargetId}, overall ${parsed.overallVerdict}, ${parsed.findings.length} finding(s)).\n`);
    return;
  }

  if (command === 'inspect') {
    const { positional } = parseArgs(rest, {});
    const file = positional[0]; if (!file) die('inspect requires <report>', 2);
    const { parsed, parseError } = readJson(file, 'report');
    if (parseError) die(`report is not valid JSON: ${parseError}`);
    const summary = {
      reviewScope: parsed.reviewScope ?? null, reviewTargetId: parsed.reviewTargetId ?? null,
      mode: parsed.mode ?? null, risk: parsed.risk ?? null,
      specVerdict: parsed.specVerdict ?? null, qualityVerdict: parsed.qualityVerdict ?? null,
      overallVerdict: parsed.overallVerdict ?? null,
      findings: Array.isArray(parsed.findings) ? parsed.findings.map((f) => ({ id: f && f.id, severity: f && f.severity, causality: f && f.causality, status: f && f.status, blocking: f && f.blocking })) : [],
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    return;
  }

  if (command === 'render') {
    const { positional } = parseArgs(rest, {});
    const file = positional[0]; if (!file) die('render requires <report>', 2);
    const { parsed, errs } = loadValid(file, root, {});
    if (errs.length) die(`refusing to render an invalid report (${errs.length} problem(s)).`);
    process.stdout.write(renderMarkdown(parsed));
    return;
  }

  if (command === 'summarize-findings') {
    const { positional } = parseArgs(rest, {});
    const file = positional[0]; if (!file) die('summarize-findings requires <report>', 2);
    const { parsed, errs } = loadValid(file, root, {});
    if (errs.length) die(`refusing to summarize an invalid report (${errs.length} problem(s)).`);
    process.stdout.write(JSON.stringify(summarizeFindings(parsed), null, 2) + '\n');
    return;
  }

  process.stderr.write(`review-report: unknown command "${command}".\n\n${USAGE}\n`);
  process.exit(1);
}

main();

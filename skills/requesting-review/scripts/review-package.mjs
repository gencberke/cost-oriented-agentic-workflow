#!/usr/bin/env node
// review-package — deterministic builder/validator for the review PACKAGE
// descriptor handed to the scoped `cow-reviewer`. (0.5.0, Phase 3B.2.)
//
// The reviewer receives bounded ARTIFACT PATHS, never large raw logs in the
// dispatch prompt. This helper writes a compact JSON descriptor that references
// the diff artifact (produced by the bash `review-package` diff generator), the
// brief, the unit baseline, the implementation report, and the verification
// summary — and records the scope facts (base/head SHA, unit-owned/allowed
// paths, known pre-existing paths). It validates SHAPE, safe repo-relative
// paths, bounded size, and per-scope required fields. It NEVER modifies source.
//
//   review-package.mjs build --scope <S> --target <id> --mode <m> --risk <r>
//                            --output <pkg> [--diff p] [--brief p] [--baseline p]
//                            [--report p] [--base-sha X] [--head-sha Y]
//                            [--unit-owned-path p]... [--allowed-path p]...
//                            [--known-preexisting p]... [--verification-summary p]
//                            [--accepted-attempt N] [--plan p] [--ledger p]
//                            [--prior-review-report p] [--accepted-finding-id id]...
//                            [--remediation-wave N] [--changed-path p]...
//                            [--unit-commit sha]... [--unit-review-report p]...
//   review-package.mjs validate <pkg>
//   review-package.mjs inspect  <pkg>
//
// Node standard library + git only. Zero runtime dependencies. Cross-platform.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const SCHEMA_VERSION = 1;
const MAX_PACKAGE_BYTES = 8192;       // descriptor references artifacts; stays small
const MAX_ARRAY = 100;
const SCOPES = ['UNIT_REVIEW', 'TARGETED_REREVIEW', 'WHOLE_WORK_REVIEW'];
const MODES = ['standard', 'production'];
const RISKS = ['low', 'elevated', 'high'];

// The single authoritative package key set (review-report cross-checks a subset).
export const PKG_TOP_KEYS = new Set([
  'schemaVersion', 'reviewScope', 'reviewTargetId', 'mode', 'risk',
  'taskBriefPath', 'planPath', 'ledgerPath', 'unitBaselinePath',
  'implementationReportPath', 'acceptedAttempt', 'unitOwnedPaths', 'allowedPaths',
  'knownPreExistingPaths', 'baseSha', 'headSha', 'diffArtifactPath',
  'verificationSummaryPath', 'priorReviewReportPath', 'acceptedFindingIds',
  'remediationWave', 'changedPathsSinceReview', 'unitCommitList',
  'unitReviewReportPaths', 'findingLedgerPath',
]);
const PATH_FIELDS = ['taskBriefPath', 'planPath', 'ledgerPath', 'unitBaselinePath',
  'implementationReportPath', 'diffArtifactPath', 'verificationSummaryPath',
  'priorReviewReportPath', 'findingLedgerPath'];
const PATH_ARRAY_FIELDS = ['unitOwnedPaths', 'allowedPaths', 'knownPreExistingPaths',
  'changedPathsSinceReview', 'unitReviewReportPaths'];

const die = (msg, code = 1) => { process.stderr.write(`review-package: ERROR: ${msg}\n`); process.exit(code); };
const stripBom = (s) => (s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s);
const isStr = (s) => typeof s === 'string';
const isInt = (n) => Number.isInteger(n);

function git(args, { allowFail = false } = {}) {
  try { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 26 }).replace(/\r?\n$/, ''); }
  catch (e) { if (allowFail) return null; throw e; }
}
function worktreeRoot() {
  const top = git(['rev-parse', '--show-toplevel'], { allowFail: true });
  if (!top) die('not inside a git worktree (could not resolve --show-toplevel).', 2);
  return path.resolve(top);
}
function safeRepoPath(root, value, label) {
  if (!isStr(value) || value.trim() === '') throw new Error(`${label}: a non-empty path is required`);
  const raw = value.trim();
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('/') || raw.startsWith('\\')) throw new Error(`${label}: absolute paths are rejected ("${raw}")`);
  const parts = raw.split(/[\\/]+/);
  if (parts.some((p) => p === '..')) throw new Error(`${label}: path traversal ("..") is rejected ("${raw}")`);
  const relp = parts.filter((p) => p !== '.' && p !== '').join('/');
  if (relp === '') throw new Error(`${label}: empty path after normalization ("${raw}")`);
  const resolved = path.resolve(root, relp);
  const within = path.relative(root, resolved);
  if (within === '' || within.startsWith('..') || path.isAbsolute(within)) throw new Error(`${label}: path resolves outside the worktree ("${raw}")`);
  return relp;
}
const isSha = (s) => isStr(s) && /^[0-9a-f]{7,40}$/i.test(s.trim());

export function validatePackage(pkg, rawBytes, root) {
  const e = [];
  if (rawBytes > MAX_PACKAGE_BYTES) e.push(`package exceeds the ${MAX_PACKAGE_BYTES}-byte ceiling (${rawBytes} bytes)`);
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return ['package is not a JSON object'];
  for (const k of Object.keys(pkg)) if (!PKG_TOP_KEYS.has(k)) e.push(`unexpected top-level key "${k}"`);
  if (pkg.schemaVersion !== SCHEMA_VERSION) e.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (!SCOPES.includes(pkg.reviewScope)) e.push(`reviewScope invalid: ${JSON.stringify(pkg.reviewScope)}`);
  if (!isStr(pkg.reviewTargetId) || pkg.reviewTargetId.trim() === '') e.push('reviewTargetId must be a non-empty string');
  if (!MODES.includes(pkg.mode)) e.push(`mode invalid: ${JSON.stringify(pkg.mode)}`);
  if (!RISKS.includes(pkg.risk)) e.push(`risk invalid: ${JSON.stringify(pkg.risk)}`);

  for (const f of PATH_FIELDS) if (f in pkg && pkg[f] != null) { try { safeRepoPath(root, pkg[f], f); } catch (err) { e.push(err.message); } }
  for (const f of PATH_ARRAY_FIELDS) if (f in pkg && pkg[f] != null) {
    if (!Array.isArray(pkg[f]) || pkg[f].length > MAX_ARRAY) e.push(`${f} must be a bounded array`);
    else for (const p of pkg[f]) { try { safeRepoPath(root, p, f); } catch (err) { e.push(err.message); } }
  }
  for (const f of ['baseSha', 'headSha']) if (f in pkg && pkg[f] != null && !isSha(pkg[f])) e.push(`${f} must be a git SHA`);
  if ('acceptedAttempt' in pkg && pkg.acceptedAttempt != null && (!isInt(pkg.acceptedAttempt) || pkg.acceptedAttempt < 1)) e.push('acceptedAttempt must be a positive integer');
  if ('remediationWave' in pkg && pkg.remediationWave != null && (!isInt(pkg.remediationWave) || pkg.remediationWave < 1 || pkg.remediationWave > 2)) e.push('remediationWave must be 1 or 2');
  if ('acceptedFindingIds' in pkg && pkg.acceptedFindingIds != null) {
    if (!Array.isArray(pkg.acceptedFindingIds) || pkg.acceptedFindingIds.length > MAX_ARRAY) e.push('acceptedFindingIds must be a bounded array');
    else for (const id of pkg.acceptedFindingIds) if (!isStr(id) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(id)) e.push(`acceptedFindingIds entry invalid: ${JSON.stringify(id)}`);
  }
  if ('unitCommitList' in pkg && pkg.unitCommitList != null) {
    if (!Array.isArray(pkg.unitCommitList) || pkg.unitCommitList.length > MAX_ARRAY) e.push('unitCommitList must be a bounded array');
    else for (const s of pkg.unitCommitList) if (!isSha(s)) e.push(`unitCommitList entry must be a git SHA: ${JSON.stringify(s)}`);
  }

  // Per-scope required fields (§9).
  if (pkg.reviewScope === 'UNIT_REVIEW') {
    const ownsScope = (Array.isArray(pkg.unitOwnedPaths) && pkg.unitOwnedPaths.length)
      || (Array.isArray(pkg.allowedPaths) && pkg.allowedPaths.length);
    if (!ownsScope) e.push('UNIT_REVIEW package requires unitOwnedPaths or allowedPaths');
    if (!pkg.diffArtifactPath) e.push('UNIT_REVIEW package requires diffArtifactPath');
    if (!pkg.baseSha || !pkg.headSha) e.push('UNIT_REVIEW package requires baseSha and headSha');
  } else if (pkg.reviewScope === 'TARGETED_REREVIEW') {
    if (!pkg.priorReviewReportPath) e.push('TARGETED_REREVIEW package requires priorReviewReportPath');
    if (!Array.isArray(pkg.acceptedFindingIds) || !pkg.acceptedFindingIds.length) e.push('TARGETED_REREVIEW package requires non-empty acceptedFindingIds');
    if (pkg.remediationWave == null) e.push('TARGETED_REREVIEW package requires remediationWave');
  } else if (pkg.reviewScope === 'WHOLE_WORK_REVIEW') {
    if (!pkg.planPath) e.push('WHOLE_WORK_REVIEW package requires planPath');
    if (!pkg.diffArtifactPath) e.push('WHOLE_WORK_REVIEW package requires diffArtifactPath');
    if (!pkg.baseSha || !pkg.headSha) e.push('WHOLE_WORK_REVIEW package requires baseSha and headSha');
  }
  return e;
}

function readJson(file) {
  let rawBytes, text;
  try { const buf = fs.readFileSync(file); rawBytes = buf.length; text = buf.toString('utf8'); }
  catch (err) { die(`cannot read package ${file}: ${err.message}`, 2); }
  try { return { rawBytes, parsed: JSON.parse(stripBom(text)), parseError: null }; }
  catch (err) { return { rawBytes, parsed: null, parseError: err.message }; }
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

const USAGE = `review-package — build/validate the reviewer package descriptor (Node + git, zero deps)

Usage:
  review-package.mjs build --scope <UNIT_REVIEW|TARGETED_REREVIEW|WHOLE_WORK_REVIEW>
                           --target <id> --mode <standard|production> --risk <low|elevated|high>
                           --output <pkg> [path/sha flags...]
  review-package.mjs validate <pkg>
  review-package.mjs inspect <pkg>

The descriptor references bounded artifacts (diff, brief, baseline, report,
verification summary) rather than duplicating their content.`;

function main() {
  const [, , command, ...rest] = process.argv;
  if (!command || ['help', '--help', '-h'].includes(command)) { process.stdout.write(USAGE + '\n'); process.exit(command ? 0 : 1); }
  const root = worktreeRoot();

  if (command === 'build') {
    const { flags } = parseArgs(rest, {
      value: ['scope', 'target', 'mode', 'risk', 'output', 'diff', 'brief', 'baseline', 'report',
        'base-sha', 'head-sha', 'verification-summary', 'accepted-attempt', 'plan', 'ledger',
        'prior-review-report', 'remediation-wave', 'finding-ledger'],
      repeat: ['unit-owned-path', 'allowed-path', 'known-preexisting', 'changed-path',
        'accepted-finding-id', 'unit-commit', 'unit-review-report'],
    });
    if (!flags.output) die('build requires --output <pkg>', 2);
    let relOut;
    try {
      relOut = safeRepoPath(root, flags.output, '--output');
    } catch (err) {
      die(err.message, 2);
    }
    const pkg = { schemaVersion: SCHEMA_VERSION, reviewScope: flags.scope, reviewTargetId: flags.target, mode: flags.mode, risk: flags.risk };
    const set = (k, v) => { if (v !== undefined && v !== null) pkg[k] = v; };
    const arr = (k, v) => { if (v && v.length) pkg[k] = v; };
    set('taskBriefPath', flags.brief); set('planPath', flags.plan); set('ledgerPath', flags.ledger);
    set('unitBaselinePath', flags.baseline); set('implementationReportPath', flags.report);
    set('diffArtifactPath', flags.diff); set('verificationSummaryPath', flags['verification-summary']);
    set('priorReviewReportPath', flags['prior-review-report']); set('findingLedgerPath', flags['finding-ledger']);
    set('baseSha', flags['base-sha']); set('headSha', flags['head-sha']);
    if (flags['accepted-attempt'] !== undefined) set('acceptedAttempt', Number(flags['accepted-attempt']));
    if (flags['remediation-wave'] !== undefined) set('remediationWave', Number(flags['remediation-wave']));
    arr('unitOwnedPaths', flags['unit-owned-path']); arr('allowedPaths', flags['allowed-path']);
    arr('knownPreExistingPaths', flags['known-preexisting']); arr('changedPathsSinceReview', flags['changed-path']);
    arr('acceptedFindingIds', flags['accepted-finding-id']); arr('unitCommitList', flags['unit-commit']);
    arr('unitReviewReportPaths', flags['unit-review-report']);

    const text = JSON.stringify(pkg, null, 2) + '\n';
    const errs = validatePackage(pkg, Buffer.byteLength(text, 'utf8'), root);
    if (errs.length) { for (const m of errs) process.stderr.write(`  - ${m}\n`); die(`refusing to write an invalid package (${errs.length} problem(s)).`); }
    const out = path.join(root, relOut);
    const tmp = out + '.tmp';
    fs.writeFileSync(tmp, text); fs.renameSync(tmp, out);
    process.stdout.write(`wrote ${flags.output}: ${pkg.reviewScope} ${pkg.reviewTargetId}.\n`);
    return;
  }

  if (command === 'validate') {
    const { positional } = parseArgs(rest, {});
    const file = positional[0]; if (!file) die('validate requires <pkg>', 2);
    const { rawBytes, parsed, parseError } = readJson(file);
    if (parseError) die(`package is not valid JSON: ${parseError}`);
    const errs = validatePackage(parsed, rawBytes, root);
    if (errs.length) { for (const m of errs) process.stderr.write(`  - ${m}\n`); die(`package failed validation (${errs.length} problem(s)).`); }
    process.stdout.write(`OK: ${file} valid (${parsed.reviewScope} ${parsed.reviewTargetId}).\n`);
    return;
  }

  if (command === 'inspect') {
    const { positional } = parseArgs(rest, {});
    const file = positional[0]; if (!file) die('inspect requires <pkg>', 2);
    const { parsed, parseError } = readJson(file);
    if (parseError) die(`package is not valid JSON: ${parseError}`);
    process.stdout.write(JSON.stringify(parsed, null, 2) + '\n');
    return;
  }

  process.stderr.write(`review-package: unknown command "${command}".\n\n${USAGE}\n`);
  process.exit(1);
}

import { fileURLToPath } from 'url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

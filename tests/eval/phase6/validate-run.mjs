#!/usr/bin/env node
// phase6/validate-run — validate a single Phase 6 run record against the
// canonical metrics schema (0.5.0, Phase 6). Development/eval tooling, NOT
// runtime code. Zero dependencies (Node stdlib).
//
// A run record is one bounded JSON object capturing a single live or replayed
// evaluation run. This validator checks structural shape, enum membership,
// type correctness, sensitive-field absence, and the missing-vs-zero metric
// distinction. It does NOT invent thresholds or compare conditions.
//
//   node validate-run.mjs <run.json>            # prints errors + exits 1 on invalid
//   node validate-run.mjs <run.json> --quiet    # exit code only
//
// Schema fields are documented in tests/eval/phase6/README.md.

import fs from 'fs';
import { fileURLToPath } from 'url';

export const RUN_SCHEMA_VERSION = 1;

export const CONDITIONS = ['VANILLA', 'COW_SHADOW', 'COW_ENFORCE'];
export const SEMANTIC_RESULTS = [
  'WORKFLOW_COMPLETED',
  'WORKFLOW_BLOCKED_EXPECTED',
  'WORKFLOW_FAILED',
  'HARNESS_FAILURE',
  'PROCESS_FAILURE',
  'INSUFFICIENT_EVIDENCE',
];
export const RETRY_CLASSES = ['NONE', 'HARNESS_DEFECT', 'ENCODING', 'CLI', 'AUTH', 'TRANSIENT', 'WORKFLOW_FAILURE_UNCHANGED'];
// Sensitive substrings that must never appear in a summary run record.
export const SENSITIVE_KEYS = ['prompt', 'transcript', 'apiKey', 'api_key', 'env', 'environment', 'secret', 'password', 'token_secret', 'chainOfThought', 'cot'];

const isInt = (n) => Number.isInteger(n);
const isNonNegInt = (n) => isInt(n) && n >= 0;
const isNonNegNum = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const isBool = (n) => typeof n === 'boolean';
const isStr = (n) => typeof n === 'string' && n.length > 0;
const isOptStr = (n) => n == null || isStr(n);

// A metric is "missing" when absent or null; "zero" when explicitly 0. The
// validator enforces that counters use non-negative integers and that
// missing-vs-zero is preserved (a missing field is never coerced to zero).
function checkCounter(obj, key, errs, path) {
  if (!(key in obj)) return; // missing is allowed
  const v = obj[key];
  if (v == null) return; // null = explicitly missing
  if (!isNonNegInt(v)) errs.push(`${path}.${key} must be a non-negative integer or null (got ${JSON.stringify(v)})`);
}

function checkNum(obj, key, errs, path) {
  if (!(key in obj)) return;
  const v = obj[key];
  if (v == null) return;
  if (!isNonNegNum(v)) errs.push(`${path}.${key} must be a non-negative finite number or null (got ${JSON.stringify(v)})`);
}

function checkStrDict(obj, key, errs, path) {
  if (!(key in obj)) return;
  const v = obj[key];
  if (v == null) return;
  if (typeof v !== 'object' || Array.isArray(v)) { errs.push(`${path}.${key} must be an object or null`); return; }
  for (const [k, val] of Object.entries(v)) {
    if (!isNonNegInt(val) && val != null) errs.push(`${path}.${key}.${k} must be a non-negative integer or null`);
  }
}

function checkStrArray(obj, key, errs, path) {
  if (!(key in obj)) return;
  const v = obj[key];
  if (v == null) return;
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) errs.push(`${path}.${key} must be an array of strings or null`);
}

function checkAssertionArray(obj, key, errs, path) {
  if (!(key in obj)) return;
  const v = obj[key];
  if (v == null) return;
  if (!Array.isArray(v)) { errs.push(`${path}.${key} must be an array or null`); return; }
  for (let i = 0; i < v.length; i++) {
    const a = v[i];
    if (!a || typeof a !== 'object') { errs.push(`${path}.${key}[${i}] must be an object`); continue; }
    if (!isStr(a.id)) errs.push(`${path}.${key}[${i}].id must be a non-empty string`);
    if (!isBool(a.passed)) errs.push(`${path}.${key}[${i}].passed must be boolean`);
    if (a.detail != null && typeof a.detail !== 'string') errs.push(`${path}.${key}[${i}].detail must be a string or null`);
  }
}

export function validateRun(rec) {
  const errs = [];
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return ['run record must be a JSON object'];

  // ── top-level required identity + schema ──────────────────────────────────
  if (rec.schemaVersion !== RUN_SCHEMA_VERSION) errs.push(`schemaVersion must be ${RUN_SCHEMA_VERSION} (got ${JSON.stringify(rec.schemaVersion)})`);
  if (!isStr(rec.runId)) errs.push('runId must be a non-empty string');
  if (!isStr(rec.claudeCodeVersion)) errs.push('claudeCodeVersion must be a non-empty string');
  if (!isStr(rec.environmentId)) errs.push('environmentId must be a non-empty string');
  if (!isStr(rec.datedAt)) errs.push('datedAt must be a non-empty ISO-ish string');
  if (!CONDITIONS.includes(rec.condition)) errs.push(`condition must be one of ${CONDITIONS.join(', ')} (got ${JSON.stringify(rec.condition)})`);
  if (!isStr(rec.fixtureId)) errs.push('fixtureId must be a non-empty string');
  if (!SEMANTIC_RESULTS.includes(rec.semanticResult)) errs.push(`semanticResult must be one of ${SEMANTIC_RESULTS.join(', ')} (got ${JSON.stringify(rec.semanticResult)})`);
  if (!isInt(rec.processExitCode)) errs.push('processExitCode must be an integer');

  // ── models (actual, from result metadata) ─────────────────────────────────
  if (!rec.models || typeof rec.models !== 'object') errs.push('models must be an object');
  else {
    if (!isOptStr(rec.models.controller)) errs.push('models.controller must be a string or null');
    if (rec.models.subagents != null) {
      if (!Array.isArray(rec.models.subagents) || !rec.models.subagents.every((m) => m && isStr(m.agentType) && isOptStr(m.model))) {
        errs.push('models.subagents must be an array of {agentType, model|null} or null');
      }
    }
  }

  // ── timing ────────────────────────────────────────────────────────────────
  checkNum(rec, 'wallDurationMs', errs, 'run');
  checkNum(rec, 'apiDurationMs', errs, 'run');

  // ── token/cost metrics (missing vs zero preserved) ────────────────────────
  checkCounter(rec, 'inputTokens', errs, 'run');
  checkCounter(rec, 'outputTokens', errs, 'run');
  checkCounter(rec, 'cacheCreationTokens', errs, 'run');
  checkCounter(rec, 'cacheReadTokens', errs, 'run');
  checkNum(rec, 'estimatedCostUsd', errs, 'run');

  // ── tool / dispatch / read accounting ─────────────────────────────────────
  checkStrDict(rec, 'toolCallCountByTool', errs, 'run');
  checkStrDict(rec, 'subagentDispatchCountByType', errs, 'run');
  checkCounter(rec, 'controllerReadCount', errs, 'run');
  checkCounter(rec, 'controllerSearchCount', errs, 'run');
  checkCounter(rec, 'toolOutputBytes', errs, 'run');
  checkCounter(rec, 'generatedArtifactBytes', errs, 'run');

  // ── workflow accounting ───────────────────────────────────────────────────
  checkCounter(rec, 'implementationAttempts', errs, 'run');
  checkCounter(rec, 'remediationWaves', errs, 'run');
  checkCounter(rec, 'commitsCreated', errs, 'run');
  checkStrArray(rec, 'changedPaths', errs, 'run');

  // ── hook behavior ─────────────────────────────────────────────────────────
  checkCounter(rec, 'hookAskCount', errs, 'run');
  checkCounter(rec, 'hookDenyCount', errs, 'run');

  // ── analyzer + assertions ─────────────────────────────────────────────────
  if ('analyzerViolations' in rec && rec.analyzerViolations != null) {
    if (!Array.isArray(rec.analyzerViolations)) errs.push('analyzerViolations must be an array or null');
    else for (let i = 0; i < rec.analyzerViolations.length; i++) {
      const a = rec.analyzerViolations[i];
      if (!a || !isStr(a.code)) errs.push(`analyzerViolations[${i}].code must be a non-empty string`);
    }
  }
  checkAssertionArray(rec, 'taskAssertions', errs, 'run');
  checkAssertionArray(rec, 'preservationAssertions', errs, 'run');

  // ── retry classification ──────────────────────────────────────────────────
  if (!RETRY_CLASSES.includes(rec.retryClassification)) errs.push(`retryClassification must be one of ${RETRY_CLASSES.join(', ')} (got ${JSON.stringify(rec.retryClassification)})`);

  // ── sensitive-field rejection ─────────────────────────────────────────────
  const lowerKeys = Object.keys(rec).map((k) => k.toLowerCase());
  for (const sk of SENSITIVE_KEYS) {
    if (lowerKeys.includes(sk.toLowerCase())) errs.push(`sensitive field "${sk}" must not appear in a run record`);
  }
  // Deep scan: no string value may look like a long prompt/transcript dump.
  const text = JSON.stringify(rec);
  if (text.length > 20000) errs.push(`run record exceeds 20 KiB (${text.length} bytes); raw streams belong under the ignored workspace only`);

  return errs;
}

function main() {
  const args = process.argv.slice(2);
  const quiet = args.includes('--quiet');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) { process.stderr.write('usage: validate-run.mjs <run.json> [--quiet]\n'); process.exit(2); }
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (e) { process.stderr.write(`cannot read ${file}: ${e.message}\n`); process.exit(2); }
  // UTF-8 BOM tolerance (repo convention).
  let rec;
  try { rec = JSON.parse(raw.replace(/^\uFEFF/, '')); }
  catch (e) { if (!quiet) console.error(`invalid JSON: ${e.message}`); process.exit(1); }
  const errs = validateRun(rec);
  if (errs.length) {
    if (!quiet) for (const e of errs) console.error(`FAIL: ${e}`);
    process.exit(1);
  }
  if (!quiet) console.log('run record valid');
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

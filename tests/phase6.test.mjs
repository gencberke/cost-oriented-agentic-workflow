#!/usr/bin/env node
// Deterministic, zero-dependency tests for the Phase 6 evaluation harness.
// Covers: valid/invalid run records, missing-vs-zero metrics, malformed JSONL,
// incomplete final result, model/fixture/environment mismatch, process success
// with semantic failure, expected enforcement block, harness failure
// classification, one-retry ceiling, preservation failures, aggregation
// arithmetic, percentage with zero baseline, outlier reporting, sensitive-field
// rejection, mixed Windows path separators, UTF-8 BOM tolerance.
// Run: node tests/phase6.test.mjs   (or: npm run test:phase6)

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { validateRun, RUN_SCHEMA_VERSION, CONDITIONS, SEMANTIC_RESULTS, RETRY_CLASSES, SENSITIVE_KEYS } from '../tests/eval/phase6/validate-run.mjs';
import { aggregate } from '../tests/eval/phase6/aggregate-runs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PHASE6_DIR = path.resolve(here, 'eval/phase6');

let fails = 0;
let passes = 0;
const check = (cond, msg) => { if (cond) { passes += 1; } else { fails += 1; console.error('FAIL: ' + msg); } };

function validRun(overrides = {}) {
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    runId: 'run-1',
    datedAt: '2026-06-30T12:00:00Z',
    environmentId: 'env-win-1',
    claudeCodeVersion: '1.0.0-test',
    condition: 'VANILLA',
    fixtureId: 'F1-bounded-implementation',
    semanticResult: 'WORKFLOW_COMPLETED',
    processExitCode: 0,
    models: { controller: 'claude-opus-test', subagents: [] },
    retryClassification: 'NONE',
    ...overrides,
  };
}

const tmps = [];
function tmpFile(content, bom = false) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'p6-'));
  tmps.push(d);
  const p = path.join(d, 'run.json');
  fs.writeFileSync(p, (bom ? '\uFEFF' : '') + content, 'utf8');
  return p;
}

console.log('Running Phase 6 harness tests...');

// ── 1. Valid run record ────────────────────────────────────────────────────
{
  const errs = validateRun(validRun());
  check(errs.length === 0, `valid run record passes (${errs.join('; ')})`);
}

// ── 2. Invalid run records (each required field broken) ────────────────────
{
  check(validateRun(validRun({ schemaVersion: 2 })).some((e) => /schemaVersion/.test(e)), 'wrong schemaVersion rejected');
  check(validateRun(validRun({ runId: '' })).some((e) => /runId/.test(e)), 'empty runId rejected');
  check(validateRun(validRun({ runId: null })).some((e) => /runId/.test(e)), 'null runId rejected');
  check(validateRun(validRun({ claudeCodeVersion: '' })).some((e) => /claudeCodeVersion/.test(e)), 'empty claudeCodeVersion rejected');
  check(validateRun(validRun({ environmentId: '' })).some((e) => /environmentId/.test(e)), 'empty environmentId rejected');
  check(validateRun(validRun({ datedAt: '' })).some((e) => /datedAt/.test(e)), 'empty datedAt rejected');
  check(validateRun(validRun({ condition: 'COW' })).some((e) => /condition/.test(e)), 'invalid condition rejected');
  check(validateRun(validRun({ fixtureId: '' })).some((e) => /fixtureId/.test(e)), 'empty fixtureId rejected');
  check(validateRun(validRun({ semanticResult: 'OK' })).some((e) => /semanticResult/.test(e)), 'invalid semanticResult rejected');
  check(validateRun(validRun({ processExitCode: '0' })).some((e) => /processExitCode/.test(e)), 'non-integer processExitCode rejected');
  check(validateRun(validRun({ retryClassification: 'RETRY' })).some((e) => /retryClassification/.test(e)), 'invalid retryClassification rejected');
  check(validateRun(validRun({ models: null })).some((e) => /models/.test(e)), 'null models rejected');
  check(validateRun(validRun({ models: { controller: 123 } })).some((e) => /models\.controller/.test(e)), 'non-string controller model rejected');
  check(validateRun(null).length > 0, 'null record rejected');
  check(validateRun([]).length > 0, 'array record rejected');
}

// ── 3. Missing vs zero metrics ─────────────────────────────────────────────
{
  // missing (absent) is allowed; null is allowed; 0 is allowed; negative/string rejected.
  check(validateRun(validRun({})).length === 0, 'absent optional metrics are allowed');
  check(validateRun(validRun({ inputTokens: null })).length === 0, 'null metric is allowed (explicitly missing)');
  check(validateRun(validRun({ inputTokens: 0 })).length === 0, 'zero metric is allowed');
  check(validateRun(validRun({ inputTokens: -1 })).some((e) => /inputTokens/.test(e)), 'negative counter rejected');
  check(validateRun(validRun({ inputTokens: 1.5 })).some((e) => /inputTokens/.test(e)), 'non-integer counter rejected');
  check(validateRun(validRun({ estimatedCostUsd: -0.1 })).some((e) => /estimatedCostUsd/.test(e)), 'negative cost rejected');
  check(validateRun(validRun({ estimatedCostUsd: '1.0' })).some((e) => /estimatedCostUsd/.test(e)), 'string cost rejected');
  check(validateRun(validRun({ toolCallCountByTool: { Read: -1 } })).some((e) => /toolCallCountByTool\.Read/.test(e)), 'negative tool count rejected');
}

// ── 4. Assertion arrays ────────────────────────────────────────────────────
{
  check(validateRun(validRun({ taskAssertions: [{ id: 'a', passed: true }] })).length === 0, 'valid task assertion accepted');
  check(validateRun(validRun({ taskAssertions: [{ id: '', passed: true }] })).some((e) => /taskAssertions.*id/.test(e)), 'empty assertion id rejected');
  check(validateRun(validRun({ taskAssertions: [{ id: 'a', passed: 'yes' }] })).some((e) => /taskAssertions.*passed/.test(e)), 'non-boolean passed rejected');
  check(validateRun(validRun({ taskAssertions: 'x' })).some((e) => /taskAssertions/.test(e)), 'non-array assertions rejected');
  check(validateRun(validRun({ preservationAssertions: [{ id: 'p', passed: false, detail: 'd' }] })).length === 0, 'failed preservation assertion with detail accepted');
}

// ── 5. Sensitive-field rejection ───────────────────────────────────────────
{
  for (const sk of ['prompt', 'transcript', 'apiKey', 'env', 'secret']) {
    check(validateRun(validRun({ [sk]: 'x' })).some((e) => /sensitive field/.test(e)), `sensitive field "${sk}" rejected`);
  }
  // oversize record rejected (simulates a transcript dump)
  const big = validRun({ bigDump: 'x'.repeat(21000) });
  check(validateRun(big).some((e) => /20 KiB/.test(e)), 'oversize run record rejected');
}

// ── 6. Malformed JSONL (validate-run on a malformed file) ──────────────────
{
  const p = tmpFile('not json{');
  const r = runCLI(['node', path.resolve(PHASE6_DIR, 'validate-run.mjs'), p]);
  check(r.status !== 0, 'malformed JSON file rejected by CLI');
}

// ── 7. UTF-8 BOM tolerance ─────────────────────────────────────────────────
{
  const rec = validRun();
  const p = tmpFile(JSON.stringify(rec), true);
  const r = runCLI(['node', path.resolve(PHASE6_DIR, 'validate-run.mjs'), p]);
  check(r.status === 0, 'BOM-prefixed run record validated');
}

// ── 8. Mixed Windows path separators in changedPaths ───────────────────────
{
  check(validateRun(validRun({ changedPaths: ['src\\a.js', 'lib/x.js'] })).length === 0, 'mixed path separators accepted in changedPaths');
  check(validateRun(validRun({ changedPaths: ['src\\a.js', 123] })).some((e) => /changedPaths/.test(e)), 'non-string path rejected');
}

// ── 9. Incomplete final result (INSUFFICIENT_EVIDENCE) ─────────────────────
{
  const rec = validRun({ semanticResult: 'INSUFFICIENT_EVIDENCE', processExitCode: 0 });
  check(validateRun(rec).length === 0, 'INSUFFICIENT_EVIDENCE is a valid semantic result');
}

// ── 10. Process success with semantic failure ──────────────────────────────
{
  const rec = validRun({ semanticResult: 'WORKFLOW_FAILED', processExitCode: 0 });
  check(validateRun(rec).length === 0, 'process exit 0 with WORKFLOW_FAILED is a valid (and honest) record');
}

// ── 11. Expected enforcement block ─────────────────────────────────────────
{
  const rec = validRun({ condition: 'COW_ENFORCE', semanticResult: 'WORKFLOW_BLOCKED_EXPECTED',
    processExitCode: 0, hookAskCount: 1, hookDenyCount: 0 });
  check(validateRun(rec).length === 0, 'expected enforcement block record is valid');
}

// ── 12. Harness failure classification ─────────────────────────────────────
{
  const rec = validRun({ semanticResult: 'HARNESS_FAILURE', processExitCode: 2, retryClassification: 'HARNESS_DEFECT' });
  check(validateRun(rec).length === 0, 'harness failure with HARNESS_DEFECT retry is valid');
}

// ── 13. One-retry ceiling (aggregator does not enforce; validator accepts all classes) ──
{
  for (const rc of RETRY_CLASSES) {
    check(validateRun(validRun({ retryClassification: rc })).length === 0, `retryClassification "${rc}" accepted`);
  }
  // A record claiming two retries via a non-enum value is rejected.
  check(validateRun(validRun({ retryClassification: 'RETRY_2' })).some((e) => /retryClassification/.test(e)), 'non-enum retry class rejected');
}

// ── 14. Aggregation arithmetic + percentage with zero baseline ─────────────
{
  const a = validRun({ runId: 'a', condition: 'VANILLA', fixtureId: 'F1', inputTokens: 100, outputTokens: 50, wallDurationMs: 1000 });
  const b = validRun({ runId: 'b', condition: 'COW_SHADOW', fixtureId: 'F1', inputTokens: 80, outputTokens: 50, wallDurationMs: 1000 });
  const rep = aggregate([{ rec: a }, { rec: b }]);
  check(rep.invalidCount === 0, 'aggregator: both valid records accepted');
  check(rep.comparisons.length === 1, 'aggregator: one comparison for F1');
  const c = rep.comparisons[0];
  check(!c.refused, 'aggregator: matched comparison not refused');
  check(c.metrics.inputTokens.absoluteDiff === 20, 'aggregator: absolute diff correct (100-80=20)');
  check(c.metrics.inputTokens.percentDiff === 25, 'aggregator: percent diff correct (25%)');
  // zero baseline: outputTokens both 50 -> diff 0, pct 0; if b were 0, pct null.
  check(c.metrics.outputTokens.percentDiff === 0, 'aggregator: equal metrics -> 0% diff');
  const a2 = validRun({ runId: 'a2', condition: 'VANILLA', fixtureId: 'F1', inputTokens: 100 });
  const b2 = validRun({ runId: 'b2', condition: 'COW_SHADOW', fixtureId: 'F1', inputTokens: 0 });
  const rep2 = aggregate([{ rec: a2 }, { rec: b2 }]);
  const c2 = rep2.comparisons[0];
  check(c2.metrics.inputTokens.percentDiff === null, 'aggregator: zero baseline -> null percent diff (absolute only)');
  check(c2.metrics.inputTokens.absoluteDiff === 100, 'aggregator: zero baseline still reports absolute diff');
}

// ── 15. Model / fixture / environment mismatch refusal ─────────────────────
{
  // Fixture mismatch: runs land in different fixture groups, so NO cross-fixture
  // comparison is produced (grouping by fixtureId is the structural refusal).
  const a = validRun({ runId: 'a', condition: 'VANILLA', fixtureId: 'F1', environmentId: 'env1', models: { controller: 'm1', subagents: [] } });
  const b = validRun({ runId: 'b', condition: 'COW_SHADOW', fixtureId: 'F2-diagnosis-fix', environmentId: 'env1', models: { controller: 'm1', subagents: [] } });
  const rep = aggregate([{ rec: a }, { rec: b }]);
  check(rep.comparisons.length === 0, 'aggregator: fixture mismatch produces no comparison (different groups)');

  // Environment mismatch within the same fixture -> refused comparison.
  const c = validRun({ runId: 'c', condition: 'VANILLA', fixtureId: 'F1', environmentId: 'env1', models: { controller: 'm1', subagents: [] } });
  const d = validRun({ runId: 'd', condition: 'COW_SHADOW', fixtureId: 'F1', environmentId: 'env2', models: { controller: 'm1', subagents: [] } });
  const rep2 = aggregate([{ rec: c }, { rec: d }]);
  check(rep2.comparisons[0].refused && rep2.comparisons[0].mismatch.envMismatch, 'aggregator: environment mismatch refused within fixture');

  // Controller model mismatch within the same fixture -> refused comparison.
  const e = validRun({ runId: 'e', condition: 'VANILLA', fixtureId: 'F1', environmentId: 'env1', models: { controller: 'opus', subagents: [] } });
  const f = validRun({ runId: 'f', condition: 'COW_SHADOW', fixtureId: 'F1', environmentId: 'env1', models: { controller: 'sonnet', subagents: [] } });
  const rep3 = aggregate([{ rec: e }, { rec: f }]);
  check(rep3.comparisons[0].refused && rep3.comparisons[0].mismatch.modelMismatch, 'aggregator: controller model mismatch refused within fixture');
}

// ── 16. Invalid records collected separately, not silently dropped ─────────
{
  const a = validRun({ runId: 'a', condition: 'VANILLA', fixtureId: 'F1' });
  const bad = validRun({ runId: 'bad', condition: 'BAD', fixtureId: 'F1' });
  const rep = aggregate([{ rec: a }, { rec: bad, source: 'bad.json' }]);
  check(rep.invalidCount === 1, 'aggregator: invalid record counted separately');
  check(rep.invalid[0].errors.some((e) => /condition/.test(e)), 'aggregator: invalid record carries its errors');
  check(rep.comparisons.length === 0, 'aggregator: no comparison when one side invalid');
}

// ── 17. Outlier reporting (not deleted) ────────────────────────────────────
{
  const runs = [
    validRun({ runId: 'a', condition: 'VANILLA', fixtureId: 'F1', inputTokens: 100 }),
    validRun({ runId: 'b', condition: 'COW_SHADOW', fixtureId: 'F1', inputTokens: 110 }),
    validRun({ runId: 'c', condition: 'COW_ENFORCE', fixtureId: 'F1', inputTokens: 1000 }),
  ];
  const rep = aggregate(runs.map((r) => ({ rec: r })));
  check(rep.outliers.some((o) => o.runId === 'c' && o.metric === 'inputTokens'), 'aggregator: outlier flagged (>3x median)');
  check(rep.outliers.every((o) => /not deleted/.test(o.note)), 'aggregator: outliers are reported, not deleted');
}

// ── 18. Cost-improvement claim gated on correctness + preservation ─────────
{
  // both correct + preserved -> claim allowed
  const a = validRun({ runId: 'a', condition: 'VANILLA', fixtureId: 'F1', semanticResult: 'WORKFLOW_COMPLETED',
    taskAssertions: [{ id: 't', passed: true }], preservationAssertions: [{ id: 'p', passed: true }] });
  const b = validRun({ runId: 'b', condition: 'COW_SHADOW', fixtureId: 'F1', semanticResult: 'WORKFLOW_COMPLETED',
    taskAssertions: [{ id: 't', passed: true }], preservationAssertions: [{ id: 'p', passed: true }] });
  const rep = aggregate([{ rec: a }, { rec: b }]);
  check(rep.comparisons[0].costImprovementClaimAllowed === true, 'cost claim allowed when both correct + preserved');

  // one failed preservation -> claim not allowed
  const bBad = validRun({ runId: 'bBad', condition: 'COW_SHADOW', fixtureId: 'F1', semanticResult: 'WORKFLOW_COMPLETED',
    taskAssertions: [{ id: 't', passed: true }], preservationAssertions: [{ id: 'p', passed: false }] });
  const rep2 = aggregate([{ rec: a }, { rec: bBad }]);
  check(rep2.comparisons[0].costImprovementClaimAllowed === false, 'cost claim disallowed when preservation failed');

  // one workflow failed -> claim not allowed (correctness before cost)
  const bFail = validRun({ runId: 'bFail', condition: 'COW_SHADOW', fixtureId: 'F1', semanticResult: 'WORKFLOW_FAILED',
    taskAssertions: [{ id: 't', passed: false }], preservationAssertions: [{ id: 'p', passed: true }] });
  const rep3 = aggregate([{ rec: a }, { rec: bFail }]);
  check(rep3.comparisons[0].costImprovementClaimAllowed === false, 'cost claim disallowed when correctness failed');
}

// ── 19. Fixture manifest set is present and well-formed ────────────────────
{
  const fixtureRoot = path.join(PHASE6_DIR, 'fixtures');
  const expected = ['F1-bounded-implementation', 'F2-diagnosis-fix', 'F3-review-remediation', 'F4-enforcement', 'F5-resume-compact'];
  for (const fx of expected) {
    const mpath = path.join(fixtureRoot, fx, 'manifest.json');
    check(fs.existsSync(mpath), `fixture manifest present: ${fx}/manifest.json`);
    check(fs.existsSync(path.join(fixtureRoot, fx, 'task.md')), `fixture task present: ${fx}/task.md`);
    if (fs.existsSync(mpath)) {
      const m = JSON.parse(fs.readFileSync(mpath, 'utf8'));
      check(m.fixtureId === fx, `fixture ${fx}: manifest fixtureId matches dir`);
      check(Array.isArray(m.conditions) && m.conditions.every((c) => CONDITIONS.includes(c)), `fixture ${fx}: conditions valid`);
      check(typeof m.purpose === 'string' && m.purpose.length > 0, `fixture ${fx}: purpose present`);
    }
  }
  // F1 carries assertions.json
  check(fs.existsSync(path.join(fixtureRoot, 'F1-bounded-implementation', 'assertions.json')), 'F1 assertions.json present');
}

// ── 20. Harness docs present ───────────────────────────────────────────────
{
  check(fs.existsSync(path.join(PHASE6_DIR, 'README.md')), 'phase6 README present');
  check(fs.existsSync(path.join(PHASE6_DIR, 'phase6h-experiment.md')), 'phase6h experiment spec present');
  const h = fs.readFileSync(path.join(PHASE6_DIR, 'phase6h-experiment.md'), 'utf8');
  for (const token of ['No memory or learn features', 'No output shaping', 'No code compression', 'Exact contract/path/SHA preservation', 'Separate correctness and token']) {
    check(h.includes(token), `phase6h spec requires: ${token}`);
  }
}

// ── 21. CLI smoke: validate-run accepts a valid file and rejects invalid ───
{
  const p = tmpFile(JSON.stringify(validRun()));
  const rOk = runCLI(['node', path.resolve(PHASE6_DIR, 'validate-run.mjs'), p, '--quiet']);
  check(rOk.status === 0, 'validate-run CLI: valid file exits 0');
  const pBad = tmpFile(JSON.stringify(validRun({ condition: 'BAD' })));
  const rBad = runCLI(['node', path.resolve(PHASE6_DIR, 'validate-run.mjs'), pBad, '--quiet']);
  check(rBad.status !== 0, 'validate-run CLI: invalid file exits non-zero');
}

// ── 22. Aggregator CLI smoke with --json and --markdown ────────────────────
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'p6agg-')); tmps.push(d);
  const r1 = path.join(d, 'r1.json'); const r2 = path.join(d, 'r2.json');
  fs.writeFileSync(r1, JSON.stringify(validRun({ runId: 'r1', condition: 'VANILLA', fixtureId: 'F1', inputTokens: 100 })));
  fs.writeFileSync(r2, JSON.stringify(validRun({ runId: 'r2', condition: 'COW_SHADOW', fixtureId: 'F1', inputTokens: 80 })));
  const jsonOut = path.join(d, 'agg.json'); const mdOut = path.join(d, 'agg.md');
  const r = runCLI(['node', path.resolve(PHASE6_DIR, 'aggregate-runs.mjs'), r1, r2, '--json', jsonOut, '--markdown', mdOut]);
  check(r.status === 0, 'aggregate-runs CLI: exits 0 on valid inputs');
  const agg = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
  check(agg.runCount === 2 && agg.comparisons.length === 1, 'aggregate-runs CLI: JSON output has 2 runs, 1 comparison');
  const md = fs.readFileSync(mdOut, 'utf8');
  check(/F1.*VANILLA vs COW_SHADOW/.test(md), 'aggregate-runs CLI: Markdown has comparison header');
  check(/inputTokens/.test(md), 'aggregate-runs CLI: Markdown has metric table');
}

// ── 23. stream-to-run: synthetic stream-json parsing ──────────────────────
{
  const streamLines = [
    JSON.stringify({ type: 'system', subtype: 'init', sessionId: 's1' }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', model: 'claude-opus-actual', usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'src/a.js' } }] } }),
    JSON.stringify({ type: 'system', subtype: 'task_started', subagent_type: 'cow-implementer', tool_use_id: 't1', prompt: 'SECRET PROMPT TEXT' }),
    JSON.stringify({ type: 'assistant', subagent_type: 'cow-implementer', parent_tool_use_id: 't1', message: { role: 'assistant', model: 'claude-sonnet-actual', usage: { input_tokens: 40, output_tokens: 10 }, content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/a.js' } }] } }),
    JSON.stringify({ type: 'hook', hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'COW E2' } }),
    JSON.stringify({ type: 'hook', hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'COW E4' } }),
    JSON.stringify({ type: 'result', result: { subtype: 'completed', exit_code: 0, duration_ms: 1500, model: 'claude-opus-actual', usage: { input_tokens: 140, output_tokens: 30, cache_read_input_tokens: 50, cost_usd: 0.012 } } }),
  ];
  const streamFile = tmpFile(streamLines.join('\n'));
  const { parseStream } = await import(pathToFileURL(path.resolve(PHASE6_DIR, "stream-to-run.mjs")).href);
  const text = fs.readFileSync(streamFile, 'utf8');
  const rec = parseStream(text, { runId: 'rs1', condition: 'COW_ENFORCE', fixtureId: 'F4-enforcement', environmentId: 'env-1', claudeCodeVersion: '1.0.0' });
  // validator must accept the produced record
  check(validateRun(rec).length === 0, 'stream-to-run: emits a valid schema-v1 record');
  check(rec.models.controller === 'claude-opus-actual', 'stream-to-run: actual controller model from result metadata');
  check(rec.models.subagents.length === 1 && rec.models.subagents[0].agentType === 'cow-implementer' && rec.models.subagents[0].model === 'claude-sonnet-actual', 'stream-to-run: actual subagent model recorded');
  check(rec.toolCallCountByTool.Read === 1 && rec.toolCallCountByTool.Edit === 1, 'stream-to-run: tool calls counted by tool');
  check(rec.subagentDispatchCountByType['cow-implementer'] === 1, 'stream-to-run: subagent dispatch counted by type');
  check(rec.hookAskCount === 1 && rec.hookDenyCount === 1, 'stream-to-run: hook ask/deny counted');
  check(rec.inputTokens === 140 && rec.outputTokens === 30 && rec.cacheReadTokens === 50, 'stream-to-run: token metrics from final result (max)');
  check(rec.estimatedCostUsd === 0.012, 'stream-to-run: cost extracted');
  check(rec.wallDurationMs === 1500, 'stream-to-run: wall duration extracted');
  check(rec.semanticResult === 'WORKFLOW_COMPLETED', 'stream-to-run: semantic result inferred from result subtype');
  check(!JSON.stringify(rec).includes('SECRET PROMPT TEXT'), 'stream-to-run: rejects raw prompts from summary record');
}

// ── 23b. stream-to-run: top-level result cost extraction ───────────────────
{
  const streamLines = [
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', model: 'claude-sonnet-actual', usage: { input_tokens: 3, output_tokens: 1 }, content: [] } }),
    JSON.stringify({ type: 'result', subtype: 'success', result: 'OK', total_cost_usd: 0.045, duration_ms: 1200, duration_api_ms: 900 }),
  ];
  const { parseStream } = await import(pathToFileURL(path.resolve(PHASE6_DIR, 'stream-to-run.mjs')).href);
  const rec = parseStream(streamLines.join('\n'), { runId: 'rs-cost', condition: 'VANILLA', fixtureId: 'F1', environmentId: 'env-1', claudeCodeVersion: '1.0.0' });
  check(validateRun(rec).length === 0, 'stream-to-run: top-level result cost record validates');
  check(rec.estimatedCostUsd === 0.045, 'stream-to-run: top-level total_cost_usd extracted');
  check(rec.apiDurationMs === 900, 'stream-to-run: top-level duration_api_ms extracted');
}

// ── 23c. stream-to-run: live hook_response output parsing ──────────────────
{
  const askOutput = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'COW E2' } });
  const denyOutput = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'COW E1' } });
  const streamLines = [
    JSON.stringify({ type: 'system', subtype: 'hook_response', hook_event: 'PreToolUse', output: askOutput, stdout: '' }),
    JSON.stringify({ type: 'system', subtype: 'hook_response', hook_event: 'PreToolUse', output: '', stdout: denyOutput }),
    JSON.stringify({ type: 'result', subtype: 'success', result: 'OK', total_cost_usd: 0.01, duration_ms: 100, duration_api_ms: 90 }),
  ];
  const { parseStream } = await import(pathToFileURL(path.resolve(PHASE6_DIR, 'stream-to-run.mjs')).href);
  const rec = parseStream(streamLines.join('\n'), { runId: 'rs-hook-response', condition: 'COW_ENFORCE', fixtureId: 'F4-enforcement', environmentId: 'env-1', claudeCodeVersion: '1.0.0' });
  check(validateRun(rec).length === 0, 'stream-to-run: hook_response output record validates');
  check(rec.hookAskCount === 1 && rec.hookDenyCount === 1, 'stream-to-run: live hook_response output ask/deny counted');
}

// ── 24. stream-to-run: malformed JSONL + missing final result ──────────────
{
  const streamLines = [
    'not valid json{',
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', model: 'm1', usage: { input_tokens: 10 }, content: [] } }),
    '',
  ];
  const { parseStream } = await import(pathToFileURL(path.resolve(PHASE6_DIR, 'stream-to-run.mjs')).href);
  const rec = parseStream(streamLines.join('\n'), { runId: 'rs2', condition: 'COW_SHADOW', fixtureId: 'F1', environmentId: 'env-1', claudeCodeVersion: '1.0.0' });
  check(validateRun(rec).length === 0, 'stream-to-run: malformed JSONL still yields a structurally valid record');
  // Malformed + no final result -> HARNESS_FAILURE (not a silently clean record)
  check(rec.semanticResult === 'HARNESS_FAILURE', 'stream-to-run: malformed + no final result -> HARNESS_FAILURE');
  check(rec.analyzerViolations != null && rec.analyzerViolations.some((v) => v.code === 'MALFORMED_JSONL' && v.count === 1),
    'stream-to-run: malformed line count preserved in analyzerViolations');
  check(rec.inputTokens === 10, 'stream-to-run: partial token evidence preserved (max from assistant message)');
  check(rec.cacheReadTokens == null, 'stream-to-run: missing cache metric stays null (not zero)');
  check(rec.hookAskCount == null, 'stream-to-run: zero hook events -> null (missing), not 0');

  // CLI exits non-zero on malformed JSONL (surfaces the harness defect)
  const sf = tmpFile(streamLines.join('\n'));
  const r = runCLI(['node', path.resolve(PHASE6_DIR, 'stream-to-run.mjs'), sf, '--run-id', 'x', '--condition', 'COW_SHADOW', '--fixture-id', 'F1', '--environment-id', 'e', '--claude-code-version', 'v']);
  check(r.status !== 0, 'stream-to-run CLI: exits non-zero when malformed JSONL present');

  // malformed JSONL but WITH a final result -> INSUFFICIENT_EVIDENCE + violation preserved
  const rec2 = parseStream(['not json', JSON.stringify({ type: 'result', result: { subtype: 'completed', exit_code: 0 } })].join('\n'),
    { runId: 'rs3', condition: 'COW_SHADOW', fixtureId: 'F1', environmentId: 'env-1', claudeCodeVersion: '1.0.0' });
  check(rec2.semanticResult === 'INSUFFICIENT_EVIDENCE', 'stream-to-run: malformed + final result present -> INSUFFICIENT_EVIDENCE (not silently WORKFLOW_COMPLETED)');
  check(rec2.analyzerViolations != null && rec2.analyzerViolations.some((v) => v.code === 'MALFORMED_JSONL'), 'stream-to-run: malformed violation preserved even with final result');
}

// ── 25. stream-to-run: CLI --validate accepts a clean stream ───────────────
{
  const streamLines = [
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', model: 'm1', usage: { input_tokens: 5 }, content: [] } }),
    JSON.stringify({ type: 'result', result: { subtype: 'completed', exit_code: 0 } }),
  ];
  const sf = tmpFile(streamLines.join('\n'));
  const r = runCLI(['node', path.resolve(PHASE6_DIR, 'stream-to-run.mjs'), sf, '--run-id', 'c1', '--condition', 'VANILLA', '--fixture-id', 'F1', '--environment-id', 'e1', '--claude-code-version', 'v', '--validate']);
  check(r.status === 0, 'stream-to-run CLI --validate: exits 0 on a clean (non-malformed) stream');
  // A clean stream with a final result carries no MALFORMED_JSONL violation
  const { parseStream } = await import(pathToFileURL(path.resolve(PHASE6_DIR, 'stream-to-run.mjs')).href);
  const rec = parseStream(streamLines.join('\n'), { runId: 'c1', condition: 'VANILLA', fixtureId: 'F1', environmentId: 'e1', claudeCodeVersion: 'v' });
  check(rec.analyzerViolations == null, 'stream-to-run: clean stream produces no analyzerViolations');
  check(rec.semanticResult === 'WORKFLOW_COMPLETED', 'stream-to-run: clean completed stream -> WORKFLOW_COMPLETED');
}

// ── 26. Fixtures reproducible via setup.mjs (F1, F2, F3, F4) ────────────────
{
  const setup = path.resolve(PHASE6_DIR, 'fixtures', 'setup.mjs');
  check(fs.existsSync(setup), 'fixture setup.mjs exists');
  // F1
  const d1 = fs.mkdtempSync(path.join(os.tmpdir(), 'p6f1-')); tmps.push(d1);
  const r1 = runCLI(['node', setup, 'F1-bounded-implementation', d1]);
  check(r1.status === 0, 'setup F1: exits 0');
  const root1 = r1.stdout.trim();
  check(fs.existsSync(path.join(root1, 'src/sum.js')), 'setup F1: src/sum.js created');
  check(fs.existsSync(path.join(root1, 'test/sum.test.mjs')), 'setup F1: test/sum.test.mjs created');
  check(fs.existsSync(path.join(root1, 'notes-user.md')), 'setup F1: untracked notes-user.md created');
  // notes-user.md must NOT be staged (git status shows it untracked)
  const st1 = runCLI(['git', '-C', root1, 'status', '--short', '--porcelain']);
  check(/\?\? notes-user\.md/.test(st1.stdout), 'setup F1: notes-user.md is untracked, not staged');
  // F1 bug present: sum returns a-b (ESM export, not module.exports)
  const sumSrc = fs.readFileSync(path.join(root1, 'src/sum.js'), 'utf8');
  check(/return a - b/.test(sumSrc), 'setup F1: sum.js seeded with the bug (a - b)');
  check(/export function sum/.test(sumSrc), 'setup F1: sum.js uses ESM export (not module.exports)');
  // F1 failure is the expected ASSERTION failure (sum(2,3)===5 fails because 2-3=-1),
  // NOT an import/export SyntaxError from a CJS/ESM mismatch.
  const t1 = runCLI(['node', '--test', path.join(root1, 'test/sum.test.mjs')]);
  check(t1.status !== 0, 'setup F1: sum.test.mjs fails (the bug)');
  const t1out = (t1.stdout || '') + (t1.stderr || '');
  check(/AssertionError|expected 5 to equal|AssertionError/i.test(t1out) || /failing/i.test(t1out),
    'setup F1: failure is an assertion failure, not a SyntaxError');
  check(!/SyntaxError|ERR_REQUIRE_ESM|require\(/i.test(t1out), 'setup F1: no ESM/CJS import SyntaxError');

  // F2
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'p6f2-')); tmps.push(d2);
  const r2 = runCLI(['node', setup, 'F2-diagnosis-fix', d2]);
  check(r2.status === 0, 'setup F2: exits 0');
  const root2 = r2.stdout.trim();
  check(fs.existsSync(path.join(root2, 'src/normalize.js')), 'setup F2: src/normalize.js created');
  const normSrc = fs.readFileSync(path.join(root2, 'src/normalize.js'), 'utf8');
  check(/export function normalize/.test(normSrc), 'setup F2: normalize.js uses ESM export (not module.exports)');
  // the normalize test actually fails for the off-by-one boundary (deterministic),
  // and the failure is the intended normalize assertion, NOT an import SyntaxError
  const t2 = runCLI(['node', '--test', path.join(root2, 'test/normalize.test.mjs')]);
  check(t2.status !== 0, 'setup F2: normalize.test.mjs deterministically fails (the bug)');
  const t2out = (t2.stdout || '') + (t2.stderr || '');
  check(/AssertionError|expected 'abc' to equal|AssertionError/i.test(t2out) || /failing/i.test(t2out),
    'setup F2: failure is the intended normalize assertion failure');
  check(!/SyntaxError|ERR_REQUIRE_ESM|require\(/i.test(t2out), 'setup F2: no ESM/CJS import SyntaxError');

  // F3
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'p6f3-')); tmps.push(d3);
  const r3 = runCLI(['node', setup, 'F3-review-remediation', d3]);
  check(r3.status === 0, 'setup F3: exits 0');
  const root3 = r3.stdout.trim();
  check(fs.existsSync(path.join(root3, 'src/cart.js')), 'setup F3: src/cart.js created');
  check(fs.existsSync(path.join(root3, 'test/cart.test.mjs')), 'setup F3: test/cart.test.mjs created');
  check(fs.existsSync(path.join(root3, 'task.md')), 'setup F3: task.md copied into disposable repo');
  const f3Task = fs.readFileSync(path.join(root3, 'task.md'), 'utf8');
  check(/targeted re-review after the fix/.test(f3Task), 'setup F3: copied task names targeted re-review');
  const t3 = runCLI(['node', '--test', path.join(root3, 'test/cart.test.mjs')]);
  check(t3.status === 0, 'setup F3: baseline cart tests pass');

  // F4
  const d4 = fs.mkdtempSync(path.join(os.tmpdir(), 'p6f4-')); tmps.push(d4);
  const r4 = runCLI(['node', setup, 'F4-enforcement', d4]);
  check(r4.status === 0, 'setup F4: exits 0');
  const root4 = r4.stdout.trim();
  check(fs.existsSync(path.join(root4, '.cost-oriented-agentic-workflow/run/state.json')), 'setup F4: COW state.json placed');
  check(fs.existsSync(path.join(root4, '.cost-oriented-agentic-workflow/run/state.active')), 'setup F4: state.active marker placed');
  check(fs.existsSync(path.join(root4, 'hooks.json')), 'setup F4: evaluation-only hooks.json created INSIDE disposable repo');
  // the COW source tree must NOT gain a hooks/hooks.json
  check(!fs.existsSync(path.resolve(here, '..', 'hooks', 'hooks.json')), 'setup F4: no hooks/hooks.json created in COW source tree');
  const hj = JSON.parse(fs.readFileSync(path.join(root4, 'hooks.json'), 'utf8'));
  check(hj.hooks.PreToolUse[0].hooks[0].args.includes('--decision-mode=enforce'), 'setup F4: disposable hooks.json uses --decision-mode=enforce');
  // The disposable hooks.json must point to a cow-hook.mjs that actually exists
  // under the real COW source repo's skills path.
  const cowHookArg = hj.hooks.PreToolUse[0].hooks[0].args[0];
  check(fs.existsSync(cowHookArg), 'setup F4: disposable hooks.json points to an existing cow-hook.mjs (real repo skills path)');
  check(/skills[\\/]+execution-routing[\\/]+scripts[\\/]+cow-hook\.mjs$/.test(cowHookArg), 'setup F4: cowHook path is under the real skills/ path');

  // setup.mjs must REFUSE a target inside the real COW source tree.
  const repoRoot = path.resolve(here, '..');
  const refuse = runCLI(['node', setup, 'F1-bounded-implementation', repoRoot]);
  check(refuse.status !== 0, 'setup: refuses to create a fixture repo inside the real COW source tree');
  check(/refusing to create a fixture repo inside the COW source tree/i.test((refuse.stderr || '') + (refuse.stdout || '')),
    'setup: refusal message names the COW source tree');
}

// ── 27. Cost-claim gate: missing preservation disallows cost claims ────────
{
  const a = validRun({ runId: 'a', condition: 'VANILLA', fixtureId: 'F1', semanticResult: 'WORKFLOW_COMPLETED',
    taskAssertions: [{ id: 't', passed: true }] }); // NO preservationAssertions
  const b = validRun({ runId: 'b', condition: 'COW_SHADOW', fixtureId: 'F1', semanticResult: 'WORKFLOW_COMPLETED',
    taskAssertions: [{ id: 't', passed: true }], preservationAssertions: [{ id: 'p', passed: true }] });
  const rep = aggregate([{ rec: a }, { rec: b }]);
  check(rep.comparisons[0].costImprovementClaimAllowed === false, 'cost claim disallowed when one side has NO preservation assertions');
  check(rep.comparisons[0].costClaimGate.preservationPresent === false, 'cost gate reports preservationPresent=false');

  // both missing preservation -> disallowed
  const a2 = validRun({ runId: 'a2', condition: 'VANILLA', fixtureId: 'F1', semanticResult: 'WORKFLOW_COMPLETED', taskAssertions: [{ id: 't', passed: true }] });
  const b2 = validRun({ runId: 'b2', condition: 'COW_SHADOW', fixtureId: 'F1', semanticResult: 'WORKFLOW_COMPLETED', taskAssertions: [{ id: 't', passed: true }] });
  check(aggregate([{ rec: a2 }, { rec: b2 }]).comparisons[0].costImprovementClaimAllowed === false, 'cost claim disallowed when both sides lack preservation assertions');

  // failed preservation -> disallowed (already covered, re-confirm with new gate)
  const bBad = validRun({ runId: 'bBad', condition: 'COW_SHADOW', fixtureId: 'F1', semanticResult: 'WORKFLOW_COMPLETED', taskAssertions: [{ id: 't', passed: true }], preservationAssertions: [{ id: 'p', passed: false }] });
  check(aggregate([{ rec: a }, { rec: bBad }]).comparisons[0].costImprovementClaimAllowed === false, 'cost claim disallowed when preservation failed');

  // task assertions expected but missing on one side -> disallowed
  const aT = validRun({ runId: 'aT', condition: 'VANILLA', fixtureId: 'F1', semanticResult: 'WORKFLOW_COMPLETED', taskAssertions: [{ id: 't', passed: true }], preservationAssertions: [{ id: 'p', passed: true }] });
  const bNoTask = validRun({ runId: 'bNoTask', condition: 'COW_SHADOW', fixtureId: 'F1', semanticResult: 'WORKFLOW_COMPLETED', preservationAssertions: [{ id: 'p', passed: true }] });
  const rep2 = aggregate([{ rec: aT }, { rec: bNoTask }]);
  check(rep2.comparisons[0].costImprovementClaimAllowed === false, 'cost claim disallowed when task expected but missing on one side');
  check(rep2.comparisons[0].costClaimGate.taskGateOk === false, 'cost gate reports taskGateOk=false');

  // both correct + preserved + tasks pass -> allowed
  const aOk = validRun({ runId: 'aOk', condition: 'VANILLA', fixtureId: 'F1', semanticResult: 'WORKFLOW_COMPLETED', taskAssertions: [{ id: 't', passed: true }], preservationAssertions: [{ id: 'p', passed: true }] });
  const bOk = validRun({ runId: 'bOk', condition: 'COW_SHADOW', fixtureId: 'F1', semanticResult: 'WORKFLOW_COMPLETED', taskAssertions: [{ id: 't', passed: true }], preservationAssertions: [{ id: 'p', passed: true }] });
  check(aggregate([{ rec: aOk }, { rec: bOk }]).comparisons[0].costImprovementClaimAllowed === true, 'cost claim allowed when both correct + preserved + tasks pass');

  // F4-style: no task assertions on either side is legitimate -> gate passes on task dimension
  const aF4 = validRun({ runId: 'aF4', condition: 'COW_SHADOW', fixtureId: 'F4-enforcement', semanticResult: 'WORKFLOW_BLOCKED_EXPECTED', preservationAssertions: [{ id: 'src-unchanged', passed: true }] });
  const bF4 = validRun({ runId: 'bF4', condition: 'COW_ENFORCE', fixtureId: 'F4-enforcement', semanticResult: 'WORKFLOW_BLOCKED_EXPECTED', preservationAssertions: [{ id: 'src-unchanged', passed: true }] });
  const repF4 = aggregate([{ rec: aF4 }, { rec: bF4 }]);
  check(repF4.comparisons[0].costClaimGate.taskGateOk === true, 'cost gate: task dimension ok when task assertions legitimately absent on both sides');
}

// ── 28. Subagent model identity mismatch refusal ───────────────────────────
{
  // same controller, different subagent model -> refused
  const a = validRun({ runId: 'a', condition: 'VANILLA', fixtureId: 'F1', environmentId: 'e1',
    models: { controller: 'opus', subagents: [{ agentType: 'cow-implementer', model: 'sonnet-a' }] } });
  const b = validRun({ runId: 'b', condition: 'COW_SHADOW', fixtureId: 'F1', environmentId: 'e1',
    models: { controller: 'opus', subagents: [{ agentType: 'cow-implementer', model: 'sonnet-b' }] } });
  const rep = aggregate([{ rec: a }, { rec: b }]);
  check(rep.comparisons[0].refused && rep.comparisons[0].mismatch.subagentModelMismatch, 'aggregator: subagent model mismatch refused');

  // same set, different order -> NOT refused (order-insensitive)
  const c = validRun({ runId: 'c', condition: 'VANILLA', fixtureId: 'F1', environmentId: 'e1',
    models: { controller: 'opus', subagents: [{ agentType: 'cow-implementer', model: 'sonnet' }, { agentType: 'cow-reviewer', model: 'sonnet' }] } });
  const d = validRun({ runId: 'd', condition: 'COW_SHADOW', fixtureId: 'F1', environmentId: 'e1',
    models: { controller: 'opus', subagents: [{ agentType: 'cow-reviewer', model: 'sonnet' }, { agentType: 'cow-implementer', model: 'sonnet' }] } });
  const rep2 = aggregate([{ rec: c }, { rec: d }]);
  check(!rep2.comparisons[0].refused, 'aggregator: same subagent model set in different order is not a mismatch');

  // null model preserved: one side null, other side has model -> mismatch
  const e = validRun({ runId: 'e', condition: 'VANILLA', fixtureId: 'F1', environmentId: 'e1',
    models: { controller: 'opus', subagents: [{ agentType: 'cow-implementer', model: null }] } });
  const f = validRun({ runId: 'f', condition: 'COW_SHADOW', fixtureId: 'F1', environmentId: 'e1',
    models: { controller: 'opus', subagents: [{ agentType: 'cow-implementer', model: 'sonnet' }] } });
  const rep3 = aggregate([{ rec: e }, { rec: f }]);
  check(rep3.comparisons[0].refused && rep3.comparisons[0].mismatch.subagentModelMismatch, 'aggregator: null vs non-null subagent model is a mismatch (null preserved)');

  // both null -> not a mismatch
  const g = validRun({ runId: 'g', condition: 'VANILLA', fixtureId: 'F1', environmentId: 'e1',
    models: { controller: 'opus', subagents: [{ agentType: 'cow-implementer', model: null }] } });
  const h = validRun({ runId: 'h', condition: 'COW_SHADOW', fixtureId: 'F1', environmentId: 'e1',
    models: { controller: 'opus', subagents: [{ agentType: 'cow-implementer', model: null }] } });
  const rep4 = aggregate([{ rec: g }, { rec: h }]);
  check(!rep4.comparisons[0].refused, 'aggregator: both-null subagent model is not a mismatch');
}

// Helpers
function runCLI(argv) {
  return spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' });
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
console.log(`Phase 6 harness tests: ${passes} passed, ${fails} failed.`);
if (fails > 0) process.exit(1);

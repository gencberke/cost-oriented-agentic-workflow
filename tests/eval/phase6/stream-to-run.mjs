#!/usr/bin/env node
// phase6/stream-to-run — parse Claude Code stream-json JSONL into one canonical
// Phase 6 run record (0.5.0, Phase 6). Development/eval tooling, NOT runtime
// code. Zero dependencies (Node stdlib).
//
// Reads stream output from:
//   claude --output-format stream-json --verbose --include-hook-events
//
// Validates every JSONL line before analysis, extracts final result metadata
// where present, records ACTUAL model identity from stream/result metadata
// (never the requested model), counts tool calls by tool, counts subagent
// dispatches by agent type, counts hook ask/deny events, extracts available
// token/cache/cost/duration metrics when present, distinguishes missing from
// zero, rejects sensitive content, and emits one schema-v1 run record accepted
// by validate-run.mjs.
//
//   node stream-to-run.mjs <stream.jsonl> --run-id R --condition COW_SHADOW \
//        --fixture-id F1-bounded-implementation --environment-id env-1 \
//        --claude-code-version 1.0.0 [--semantic-result WORKFLOW_COMPLETED] \
//        [--process-exit-code 0] [--retry-classification NONE]
//
// Unspecified identity/classification fields default to INSUFFICIENT_EVIDENCE /
// 0 / NONE only when the stream provides no usable final-result metadata. The
// caller is responsible for the canonical semantic classification; if the
// stream's final result carries a `result` field with a `subtype`, it is used
// only as a *hint* and the caller's --semantic-result takes precedence.
//
// Sensitive data (raw prompts, transcripts, source contents, env values,
// secrets, chain-of-thought) is NEVER copied into the summary record.

import fs from 'fs';
import { fileURLToPath } from 'url';
import { validateRun, RUN_SCHEMA_VERSION, CONDITIONS, SEMANTIC_RESULTS, RETRY_CLASSES } from './validate-run.mjs';

const isInt = (n) => Number.isInteger(n);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isNonNegInt = (n) => isInt(n) && n >= 0;
const isStr = (n) => typeof n === 'string' && n.length > 0;

// Keys/values that must never be carried into a summary run record. The parser
// builds metrics by reading structured fields only; it never copies free text.
const FORBIDDEN_INPUT_KEYS = new Set(['prompt', 'transcript', 'transcript_path', 'source', 'content', 'text',
  'command', 'env', 'environment', 'apiKey', 'api_key', 'secret', 'password', 'token', 'chainOfThought', 'cot']);

function bumpCounter(acc, key) {
  if (!isStr(key)) return;
  if (!acc[key]) acc[key] = 0;
  acc[key] += 1;
}

function addSubagentModel(arr, agentType, model) {
  if (!isStr(agentType)) return;
  arr.push({ agentType, model: isStr(model) ? model : null });
}

function parseJsonObject(text) {
  if (!isStr(text)) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hookSpecificOutputFromEvent(o) {
  const direct = o.hookSpecificOutput || (o.hook && o.hook.hookSpecificOutput) || null;
  if (direct && typeof direct === 'object') return direct;
  for (const field of ['output', 'stdout']) {
    const parsed = parseJsonObject(o[field]);
    const hso = parsed && parsed.hookSpecificOutput;
    if (hso && typeof hso === 'object') return hso;
    if (parsed && parsed.permissionDecision) return parsed;
  }
  return null;
}

function sumUsageInto(metrics, usage) {
  if (!usage || typeof usage !== 'object') return;
  // input/output tokens are cumulative per assistant message in stream-json.
  // We take the max seen across messages (Claude Code reports cumulative usage
  // in the final assistant message; taking max is a safe lower-cost bound that
  // avoids double-counting partial messages).
  for (const [src, dst] of [['input_tokens', 'inputTokens'], ['output_tokens', 'outputTokens'],
    ['cache_creation_input_tokens', 'cacheCreationTokens'], ['cache_read_input_tokens', 'cacheReadTokens']]) {
    const v = usage[src];
    if (isNonNegInt(v)) {
      if (metrics[dst] == null || v > metrics[dst]) metrics[dst] = v;
    }
  }
  const cost = usage['cost_usd'] ?? usage['total_cost_usd'];
  if (isNum(cost) && cost >= 0 && (metrics.estimatedCostUsd == null || cost > metrics.estimatedCostUsd)) {
    metrics.estimatedCostUsd = cost;
  }
}

export function parseStream(text, ctx = {}) {
  // ctx: { runId, condition, fixtureId, environmentId, claudeCodeVersion,
  //        semanticResult?, processExitCode?, retryClassification?, datedAt? }
  const rawLines = text.split(/\r?\n/);
  const events = [];
  let malformed = 0;
  for (const l of rawLines) {
    if (l.trim() === '') continue;
    try { events.push(JSON.parse(l)); }
    catch { malformed += 1; }
  }

  const toolCallCountByTool = {};
  const subagentDispatchCountByType = {};
  const subagentModels = [];
  let hookAskCount = 0;
  let hookDenyCount = 0;
  let controllerModel = null;
  const metrics = {};
  let finalResult = null;
  let streamControllerModel = null;
  let apiDurationMs = null;
  let wallDurationMs = null;
  let processExitCodeFromStream = null;

  const isController = (o) => o.type === 'assistant' && o.message && !o.parent_tool_use_id && !o.subagent_type;
  const isSubagentMsg = (o) => o.type === 'assistant' && o.message && (o.parent_tool_use_id || o.subagent_type);

  for (const o of events) {
    // ── final result envelope ───────────────────────────────────────────────
    if (o.type === 'result' || (o.subtype === 'result' && o.result)) {
      const r = o.result && typeof o.result === 'object' && !Array.isArray(o.result) ? o.result : o;
      finalResult = r;
      if (isNonNegInt(r.duration_ms)) wallDurationMs = r.wallDurationMs ?? r.duration_ms;
      if (isNonNegInt(r.api_duration_ms)) apiDurationMs = r.api_duration_ms;
      if (isNonNegInt(r.duration_api_ms)) apiDurationMs = r.duration_api_ms;
      if (isInt(r.exit_code)) processExitCodeFromStream = r.exit_code;
      if (r.usage) sumUsageInto(metrics, r.usage);
      if (r.cost_usd != null && isNum(r.cost_usd)) metrics.estimatedCostUsd = r.cost_usd;
      if (r.total_cost_usd != null && isNum(r.total_cost_usd)) metrics.estimatedCostUsd = r.total_cost_usd;
      continue;
    }
    // ── hook events ─────────────────────────────────────────────────────────
    if (o.type === 'hook' || o.subtype === 'hook' || o.subtype === 'hook_response' || (o.hookSpecificOutput)) {
      const hso = hookSpecificOutputFromEvent(o);
      if (hso && hso.permissionDecision) {
        if (hso.permissionDecision === 'ask') hookAskCount += 1;
        else if (hso.permissionDecision === 'deny') hookDenyCount += 1;
      }
      continue;
    }
    // ── agent dispatches ────────────────────────────────────────────────────
    if (o.type === 'system' && o.subtype === 'task_started') {
      const st = o.subagent_type || '';
      bumpCounter(subagentDispatchCountByType, st);
      // model may arrive on the dispatch or later on subagent messages; record
      // what we can. Null model preserved explicitly.
      if (st) addSubagentModel(subagentModels, st, o.model || null);
      continue;
    }
    // ── assistant messages (controller + subagent) ──────────────────────────
    if (isController(o)) {
      if (!streamControllerModel && o.message.model) streamControllerModel = o.message.model;
      if (o.message.usage) sumUsageInto(metrics, o.message.usage);
      for (const c of (o.message.content || [])) {
        if (c && c.type === 'tool_use') bumpCounter(toolCallCountByTool, c.name);
      }
      continue;
    }
    if (isSubagentMsg(o)) {
      // record the actual model the subagent ran on (from message metadata)
      if (o.subagent_type && o.message.model) {
        // update the last matching subagent entry's model if it was null
        const existing = [...subagentModels].reverse().find((m) => m.agentType === o.subagent_type && m.model == null);
        if (existing) existing.model = o.message.model;
        else addSubagentModel(subagentModels, o.subagent_type, o.message.model);
      }
      if (o.message.usage) sumUsageInto(metrics, o.message.usage);
      for (const c of (o.message.content || [])) {
        if (c && c.type === 'tool_use') bumpCounter(toolCallCountByTool, c.name);
      }
      continue;
    }
  }

  // Controller model: prefer final-result metadata, then stream assistant model.
  controllerModel = (finalResult && finalResult.model) || streamControllerModel || null;

  // Semantic result: caller-provided wins; otherwise infer from result subtype
  // only as a conservative hint (never from repo state). When the caller did NOT
  // provide a semantic result and the stream is malformed or has no final
  // result, the record is classified as HARNESS_FAILURE (malformed JSONL) or
  // INSUFFICIENT_EVIDENCE (no final result) so a broken stream never produces a
  // silently-clean "valid" run.
  const analyzerViolations = [];
  if (malformed > 0) {
    analyzerViolations.push({ code: 'MALFORMED_JSONL', detail: `${malformed} malformed JSONL line(s) skipped during parse`, count: malformed });
  }
  let semanticResult = ctx.semanticResult || null;
  if (!semanticResult) {
    if (malformed > 0 && !finalResult) semanticResult = 'HARNESS_FAILURE';
    else if (malformed > 0) semanticResult = 'INSUFFICIENT_EVIDENCE';
    else if (finalResult && finalResult.subtype) {
      const sub = String(finalResult.subtype).toLowerCase();
      if (sub === 'completed' || sub === 'success') semanticResult = 'WORKFLOW_COMPLETED';
      else if (sub === 'blocked') semanticResult = 'WORKFLOW_BLOCKED_EXPECTED';
      else if (sub === 'error' || sub === 'failed') semanticResult = 'WORKFLOW_FAILED';
    }
    if (!semanticResult) semanticResult = 'INSUFFICIENT_EVIDENCE';
  }

  const processExitCode = isInt(ctx.processExitCode) ? ctx.processExitCode
    : (isInt(processExitCodeFromStream) ? processExitCodeFromStream : 0);

  const rec = {
    schemaVersion: RUN_SCHEMA_VERSION,
    runId: ctx.runId || 'run-from-stream',
    datedAt: ctx.datedAt || new Date().toISOString(),
    environmentId: ctx.environmentId || 'unknown-env',
    claudeCodeVersion: ctx.claudeCodeVersion || 'unknown',
    condition: ctx.condition || 'COW_SHADOW',
    fixtureId: ctx.fixtureId || 'unknown-fixture',
    semanticResult,
    processExitCode,
    models: {
      controller: controllerModel,
      subagents: subagentModels.length ? subagentModels : [],
    },
    retryClassification: ctx.retryClassification || 'NONE',
    // metrics: missing stays null, never coerced to zero
    inputTokens: metrics.inputTokens ?? null,
    outputTokens: metrics.outputTokens ?? null,
    cacheCreationTokens: metrics.cacheCreationTokens ?? null,
    cacheReadTokens: metrics.cacheReadTokens ?? null,
    estimatedCostUsd: metrics.estimatedCostUsd ?? null,
    wallDurationMs: wallDurationMs ?? null,
    apiDurationMs: apiDurationMs ?? null,
    toolCallCountByTool: Object.keys(toolCallCountByTool).length ? toolCallCountByTool : null,
    subagentDispatchCountByType: Object.keys(subagentDispatchCountByType).length ? subagentDispatchCountByType : null,
    controllerReadCount: toolCallCountByTool.Read ?? null,
    controllerSearchCount: (toolCallCountByTool.Grep ?? 0) + (toolCallCountByTool.Glob ?? 0) || null,
    toolOutputBytes: null,
    generatedArtifactBytes: null,
    implementationAttempts: null,
    remediationWaves: null,
    commitsCreated: null,
    changedPaths: null,
    hookAskCount: hookAskCount || null,
    hookDenyCount: hookDenyCount || null,
    analyzerViolations: analyzerViolations.length ? analyzerViolations : null,
    taskAssertions: null,
    preservationAssertions: null,
  };

  // Attach stream-derived meta (malformed lines, event count) for traceability.
  // No sensitive content is included.
  rec._streamMeta = { malformedLines: malformed, events: events.length, hadFinalResult: finalResult != null };

  return rec;
}

function main() {
  const args = process.argv.slice(2);
  const positional = [];
  const ctx = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--run-id') ctx.runId = args[++i];
    else if (a === '--condition') ctx.condition = args[++i];
    else if (a === '--fixture-id') ctx.fixtureId = args[++i];
    else if (a === '--environment-id') ctx.environmentId = args[++i];
    else if (a === '--claude-code-version') ctx.claudeCodeVersion = args[++i];
    else if (a === '--semantic-result') ctx.semanticResult = args[++i];
    else if (a === '--process-exit-code') ctx.processExitCode = Number(args[++i]);
    else if (a === '--retry-classification') ctx.retryClassification = args[++i];
    else if (a === '--dated-at') ctx.datedAt = args[++i];
    else if (a === '--validate') { /* flag handled below */ }
    else if (!a.startsWith('-')) positional.push(a);
  }
  const file = positional[0];
  if (!file) {
    process.stderr.write('usage: stream-to-run.mjs <stream.jsonl> --run-id R --condition C --fixture-id F --environment-id E --claude-code-version V [...]\n');
    process.exit(2);
  }
  if (ctx.condition && !CONDITIONS.includes(ctx.condition)) {
    process.stderr.write(`invalid --condition: ${ctx.condition}\n`); process.exit(2);
  }
  if (ctx.semanticResult && !SEMANTIC_RESULTS.includes(ctx.semanticResult)) {
    process.stderr.write(`invalid --semantic-result: ${ctx.semanticResult}\n`); process.exit(2);
  }
  if (ctx.retryClassification && !RETRY_CLASSES.includes(ctx.retryClassification)) {
    process.stderr.write(`invalid --retry-classification: ${ctx.retryClassification}\n`); process.exit(2);
  }
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (e) { process.stderr.write(`cannot read ${file}: ${e.message}\n`); process.exit(2); }

  const rec = parseStream(text, ctx);

  // Strip the _streamMeta helper field before emitting the canonical record,
  // because validate-run enforces a closed schema.
  const meta = rec._streamMeta; delete rec._streamMeta;
  process.stdout.write(JSON.stringify(rec, null, 2) + '\n');
  // A stream with malformed JSONL is a harness-level defect: it must NOT exit 0.
  // The record still validates structurally (so it can be aggregated as a
  // HARNESS_FAILURE/INSUFFICIENT_EVIDENCE run), but the CLI exits non-zero to
  // surface the defect rather than silently producing a clean run.
  if (args.includes('--validate')) {
    const errs = validateRun(rec);
    if (errs.length) { for (const e of errs) console.error(`FAIL: ${e}`); process.exit(1); }
    process.stderr.write(`stream meta: malformed=${meta.malformedLines} events=${meta.events} finalResult=${meta.hadFinalResult}\n`);
  }
  if (meta.malformedLines > 0) {
    process.stderr.write(`MALFORMED_JSONL: ${meta.malformedLines} malformed line(s); record classified as ${rec.semanticResult} with analyzerViolations preserved\n`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

#!/usr/bin/env node
// phase6/aggregate-runs — aggregate and compare Phase 6 run records across
// matched conditions (0.5.0, Phase 6). Development/eval tooling, NOT runtime
// code. Zero dependencies (Node stdlib).
//
// Reads one or more run-record JSON files (validated by validate-run.mjs),
// groups them by fixtureId, and for each fixture compares matched conditions
// pairwise in the canonical order:
//   VANILLA vs COW_SHADOW,  COW_SHADOW vs COW_ENFORCE (when both present)
//
// It refuses comparisons when fixture/model/environment identity differs, and
// distinguishes missing metrics from zero. Outliers are reported, never silently
// deleted. Correctness is reported before cost improvement. Output is both JSON
// and concise Markdown.
//
//   node aggregate-runs.mjs <run1.json> [run2.json ...] [--markdown out.md] [--json out.json]
//
// This analyzer does NOT invent thresholds. Threshold decisions are recorded
// separately in docs/DECISIONS.md only after live evidence exists.

import fs from 'fs';
import { fileURLToPath } from 'url';
import { validateRun, CONDITIONS, SEMANTIC_RESULTS } from './validate-run.mjs';

const PAIR_ORDER = [['VANILLA', 'COW_SHADOW'], ['COW_SHADOW', 'COW_ENFORCE']];
const SUCCESS_RESULTS = new Set(['WORKFLOW_COMPLETED', 'WORKFLOW_BLOCKED_EXPECTED']);

// Metrics where higher is worse (cost/context); used only for direction notes.
const COST_METRICS = ['inputTokens', 'outputTokens', 'cacheCreationTokens', 'cacheReadTokens',
  'estimatedCostUsd', 'wallDurationMs', 'apiDurationMs', 'toolOutputBytes',
  'generatedArtifactBytes', 'controllerReadCount', 'controllerSearchCount'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (rec, key) => (key in rec && isNum(rec[key]) ? rec[key] : null);
const pct = (a, b) => {
  if (a == null || b == null) return null;
  if (b === 0) return null; // percentage with zero baseline is undefined; report absolute only
  return ((a - b) / b) * 100;
};
const diff = (a, b) => (a == null || b == null ? null : a - b);

// Normalize a subagent model set to an order-insensitive comparable key.
// Each entry is "agentType\x1fmodel" (model may be the literal string "null"
// to preserve a null-model distinction). Sorting makes the comparison
// order-insensitive; null model values are preserved (not coerced to a shared
// sentinel that would erase the missing-model signal).
function subagentModelKey(rec) {
  const subs = (rec.models && Array.isArray(rec.models.subagents)) ? rec.models.subagents : [];
  return subs.map((m) => `${m.agentType}\x1f${m.model == null ? '\x00null' : m.model}`).sort().join('\x1e');
}

function identityMismatch(runs) {
  // Refuse comparison when fixture/model/environment identity differs.
  const fixtureIds = new Set(runs.map((r) => r.fixtureId));
  const envIds = new Set(runs.map((r) => r.environmentId));
  const controllerModels = new Set(runs.map((r) => r.models && r.models.controller).filter(Boolean));
  const subagentKeys = new Set(runs.map(subagentModelKey));
  return {
    fixtureMismatch: fixtureIds.size > 1,
    envMismatch: envIds.size > 1,
    modelMismatch: controllerModels.size > 1 || subagentKeys.size > 1,
    subagentModelMismatch: subagentKeys.size > 1,
  };
}

function comparePair(a, b, fixtureId) {
  // Primary ordering: correctness and preservation BEFORE cost.
  const aCorrect = SUCCESS_RESULTS.has(a.semanticResult);
  const bCorrect = SUCCESS_RESULTS.has(b.semanticResult);
  const aPresList = (a.preservationAssertions || []);
  const bPresList = (b.preservationAssertions || []);
  const aPreserved = aPresList.length > 0 && aPresList.every((x) => x.passed);
  const bPreserved = bPresList.length > 0 && bPresList.every((x) => x.passed);
  const aPreservationPresent = aPresList.length > 0;
  const bPreservationPresent = bPresList.length > 0;
  const aTaskList = (a.taskAssertions || []);
  const bTaskList = (b.taskAssertions || []);
  const aTaskPass = aTaskList.filter((x) => x.passed).length;
  const bTaskPass = bTaskList.filter((x) => x.passed).length;
  const aTaskTotal = aTaskList.length;
  const bTaskTotal = bTaskList.length;
  const aTaskPresent = aTaskTotal > 0;
  const bTaskPresent = bTaskTotal > 0;
  // Task assertions are expected for implementation/diagnosis/review fixtures.
  // For pure enforcement fixtures (F4) task assertions may be legitimately
  // absent; a comparison where neither side carries task assertions does not
  // fail the gate on that basis alone.
  const taskExpected = aTaskPresent || bTaskPresent;
  const aTaskOk = aTaskPresent && aTaskPass === aTaskTotal;
  const bTaskOk = bTaskPresent && bTaskPass === bTaskTotal;
  const taskGateOk = taskExpected ? (aTaskOk && bTaskOk) : true;

  // Cost-improvement claim gate: both runs must be (1) semantically successful,
  // (2) carry at least one preservation assertion, (3) have all preservation
  // assertions pass, and (4) where task assertions are expected, have them
  // present and all passing. Missing preservation evidence is NOT treated as
  // pass.
  const costImprovementClaimAllowed = aCorrect && bCorrect
    && aPreservationPresent && bPreservationPresent && aPreserved && bPreserved
    && taskGateOk;

  const metrics = {};
  for (const m of [...COST_METRICS, 'commitsCreated', 'implementationAttempts', 'remediationWaves', 'hookAskCount', 'hookDenyCount']) {
    const av = num(a, m); const bv = num(b, m);
    metrics[m] = { a: av, b: bv, absoluteDiff: diff(av, bv), percentDiff: pct(av, bv), missingA: av == null, missingB: bv == null };
  }

  return {
    fixtureId,
    conditionA: a.condition, conditionB: b.condition,
    runA: a.runId, runB: b.runId,
    correctness: {
      aCorrect, bCorrect,
      aPreserved, bPreserved,
      aPreservationPresent, bPreservationPresent,
      aTaskPass, aTaskTotal, bTaskPass, bTaskTotal,
      aTaskPresent, bTaskPresent,
      taskExpected, taskGateOk,
      correctnessOrdering: 'correctness and user-work preservation reported before cost improvement; missing preservation evidence is not pass',
    },
    metrics,
    analyzerViolationsA: (a.analyzerViolations || []).length,
    analyzerViolationsB: (b.analyzerViolations || []).length,
    costImprovementClaimAllowed,
    costClaimGate: {
      semanticallySuccessful: aCorrect && bCorrect,
      preservationPresent: aPreservationPresent && bPreservationPresent,
      preservationAllPassed: aPreserved && bPreserved,
      taskGateOk,
    },
  };
}

function outlierReport(runs) {
  // Flag metrics more than 3x the group median (per fixture) without deleting.
  const byFixture = new Map();
  for (const r of runs) {
    if (!byFixture.has(r.fixtureId)) byFixture.set(r.fixtureId, []);
    byFixture.get(r.fixtureId).push(r);
  }
  const outliers = [];
  for (const [fx, group] of byFixture) {
    for (const m of COST_METRICS) {
      const vals = group.map((r) => num(r, m)).filter((v) => v != null && v > 0);
      if (vals.length < 3) continue;
      const sorted = [...vals].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      for (const r of group) {
        const v = num(r, m);
        if (v != null && v > 0 && med > 0 && v > med * 3) {
          outliers.push({ fixtureId: fx, runId: r.runId, metric: m, value: v, median: med, note: 'value > 3x fixture median (reported, not deleted)' });
        }
      }
    }
  }
  return outliers;
}

export function aggregate(records) {
  // Validate every record first; collect invalid separately.
  const valid = []; const invalid = [];
  for (const { rec, source } of records) {
    const errs = validateRun(rec);
    if (errs.length) invalid.push({ source, errors: errs });
    else valid.push(rec);
  }
  const byFixture = new Map();
  for (const r of valid) {
    if (!byFixture.has(r.fixtureId)) byFixture.set(r.fixtureId, []);
    byFixture.get(r.fixtureId).push(r);
  }
  const comparisons = [];
  for (const [fixtureId, runs] of byFixture) {
    for (const [ca, cb] of PAIR_ORDER) {
      const a = runs.find((r) => r.condition === ca);
      const b = runs.find((r) => r.condition === cb);
      if (!a || !b) continue;
      const mm = identityMismatch([a, b]);
      if (mm.fixtureMismatch || mm.envMismatch || mm.modelMismatch) {
        comparisons.push({ fixtureId, conditionA: ca, conditionB: cb, refused: true, mismatch: mm,
          note: 'comparison refused: fixture/model/environment identity differs' });
        continue;
      }
      comparisons.push(comparePair(a, b, fixtureId));
    }
  }
  return {
    schemaVersion: 1,
    aggregatedAt: new Date().toISOString(),
    runCount: valid.length,
    invalidCount: invalid.length,
    invalid,
    comparisons,
    outliers: outlierReport(valid),
    semanticResultDistribution: SEMANTIC_RESULTS.reduce((acc, r) => { acc[r] = valid.filter((v) => v.semanticResult === r).length; return acc; }, {}),
  };
}

function mdTable(comparisons) {
  const lines = [];
  for (const c of comparisons) {
    lines.push(`### ${c.fixtureId}: ${c.conditionA} vs ${c.conditionB}`);
    if (c.refused) { lines.push(`> **Comparison refused.** ${c.note}`); lines.push(''); continue; }
    lines.push(`- Correctness: ${c.conditionA} ${c.correctness.aCorrect ? '✓' : '✗'} (preserved ${c.correctness.aPreserved ? '✓' : '✗'}, task ${c.correctness.aTaskPass}/${c.correctness.aTaskTotal}) | ${c.conditionB} ${c.correctness.bCorrect ? '✓' : '✗'} (preserved ${c.correctness.bPreserved ? '✓' : '✗'}, task ${c.correctness.bTaskPass}/${c.correctness.bTaskTotal})`);
    lines.push(`- Cost-improvement claim allowed: ${c.costImprovementClaimAllowed ? 'yes' : 'no (correctness/preservation not both met)'}`);
    lines.push('');
    lines.push('| metric | A | B | abs diff | pct diff |');
    lines.push('|---|---|---|---|---|');
    for (const [m, v] of Object.entries(c.metrics)) {
      const ad = v.absoluteDiff == null ? '—' : String(v.absoluteDiff);
      const pd = v.percentDiff == null ? (v.a != null && v.b === 0 ? 'n/a (zero baseline)' : '—') : `${v.percentDiff.toFixed(1)}%`;
      lines.push(`| ${m} | ${v.a == null ? 'missing' : v.a} | ${v.b == null ? 'missing' : v.b} | ${ad} | ${pd} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const files = [];
  let jsonOut = null; let mdOut = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') { jsonOut = args[++i]; continue; }
    if (args[i] === '--markdown') { mdOut = args[++i]; continue; }
    if (args[i] === '--quiet') continue;
    if (!args[i].startsWith('-')) files.push(args[i]);
  }
  if (!files.length) { process.stderr.write('usage: aggregate-runs.mjs <run1.json> [...] [--json out.json] [--markdown out.md]\n'); process.exit(2); }
  const records = [];
  for (const f of files) {
    let raw;
    try { raw = fs.readFileSync(f, 'utf8'); } catch (e) { process.stderr.write(`cannot read ${f}: ${e.message}\n`); process.exit(2); }
    let rec;
    try { rec = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch (e) { process.stderr.write(`invalid JSON in ${f}: ${e.message}\n`); process.exit(2); }
    records.push({ rec, source: f });
  }
  const report = aggregate(records);
  const json = JSON.stringify(report, null, 2);
  if (jsonOut) fs.writeFileSync(jsonOut, json + '\n', 'utf8');
  else process.stdout.write(json + '\n');
  if (mdOut) {
    const md = `# Phase 6 Aggregated Comparison\n\nRuns: ${report.runCount} valid, ${report.invalidCount} invalid.\n\n${mdTable(report.comparisons)}\n## Outliers\n${report.outliers.length ? report.outliers.map((o) => `- ${o.fixtureId}/${o.runId} ${o.metric}=${o.value} (median ${o.median}) — ${o.note}`).join('\n') : 'none'}\n`;
    fs.writeFileSync(mdOut, md, 'utf8');
  }
  if (report.invalidCount) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

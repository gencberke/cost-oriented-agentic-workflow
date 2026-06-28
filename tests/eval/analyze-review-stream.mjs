#!/usr/bin/env node
// analyze-review-stream — deterministic accounting for Phase 3B.2 review smokes
// (0.5.0). Development/eval tooling, NOT runtime code.
//
// Parses a Claude Code stream-JSONL transcript and reports, as stable JSON: the
// reviewer dispatches with their declared scope/model/package/report paths;
// report-validation runs; adjudication artifacts; remediation waves; targeted
// re-reviews; whole-work reviews; commits; and a conservative violation list.
// Zero dependencies (Node stdlib).
//
//   node analyze-review-stream.mjs <stream.jsonl> [--assert] [--exit-code N]
//
// LIMITS (honoured deliberately): a stream shows dispatches, tool calls, and
// receipts — not the real mode/risk matrix decision. So "reviewer dispatched
// when the matrix says none" and "remediation for a non-blocking finding" cannot
// be proven from the stream alone; we record them as UNCERTAINTIES, never as a
// false violation. What IS structural — wrong reviewer type, automatic selection,
// a reviewer that wrote/ran shell/committed/spawned, a missing package or report,
// adjudication ordering, the two-wave ceiling, and production model mismatch — is
// asserted.

import fs from 'fs';

const REVIEWER = /cow-reviewer/;
const IMPLEMENTER = /cow-implementer/;
const SCOPES = ['UNIT_REVIEW', 'TARGETED_REREVIEW', 'WHOLE_WORK_REVIEW'];
const COMMIT_RE = /\bgit\s+commit\b/;
const COW_STATE_RE = /cow-state(\.mjs)?\b|run[\\/]state\.json/;
const REPORT_VALIDATE_RE = /review-report(\.mjs)?\b[^\n|;&]*\bvalidate\b/;
const PKG_RE = /review-package(\.mjs)?\b/;
const ADJUDICATION_RE = /review-adjudication\.json|review\s+--findings/i;
const WAVE_RE = /review\s+--wave/i;

const normPath = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');
const field = (prompt, name) => { const m = String(prompt).match(new RegExp(`${name}\\s*[:=]\\s*(\\S+)`, 'i')); return m ? m[1].trim() : null; };
const scopeOf = (prompt) => { const m = String(prompt).match(/REVIEW_SCOPE\s*[:=]\s*(\w+)/i); return m && SCOPES.includes(m[1].toUpperCase()) ? m[1].toUpperCase() : null; };

export function analyze(text, opts = {}) {
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const events = [];
  let malformed = 0;
  for (const l of rawLines) { try { events.push(JSON.parse(l)); } catch { malformed += 1; } }

  const isController = (o) => o.type === 'assistant' && o.message && !o.parent_tool_use_id && !o.subagent_type;
  const isSubagentMsg = (o) => o.type === 'assistant' && o.message && (o.parent_tool_use_id || o.subagent_type);

  const out = {
    reviewDispatches: [], reviewScopes: [], reviewModels: [], reviewPackages: [],
    reviewReports: [], reportValidations: [], adjudications: [], remediationWaves: [],
    targetedRereviews: [], wholeWorkReviews: [], commits: [],
    processExitCode: (typeof opts.exitCode === 'number' ? opts.exitCode : null),
    workflowSemanticResult: null, uncertainties: [], violations: [],
    meta: { malformedLines: malformed, events: events.length, attributionOk: true },
  };
  const addV = (code, detail) => out.violations.push({ code, detail });
  const addU = (code, detail) => out.uncertainties.push({ code, detail });
  if (events.length === 0) { out.meta.attributionOk = false; addV('EMPTY_STREAM', 'no parseable events'); out.workflowSemanticResult = 'HARNESS_FAILURE'; return out; }
  if (!events.some(isController)) { out.meta.attributionOk = false; addV('NO_CONTROLLER', 'no controller assistant message found'); }

  const tasksById = new Map();           // tool_use_id -> reviewer dispatch record
  const adjudicationAt = [];             // event indices of adjudication artifacts
  let anyCommit = false; let anyCompletion = false; let waveCount = 0; let i = -1;

  for (const o of events) {
    i += 1;
    // ── reviewer / implementer dispatches ───────────────────────────────────
    if (o.type === 'system' && o.subtype === 'task_started') {
      const stype = o.subagent_type || '';
      const prompt = o.prompt || '';
      const looksReview = /REVIEW_SCOPE/i.test(prompt) || /REVIEW_PACKAGE_PATH/i.test(prompt) || REVIEWER.test(stype);
      if (looksReview) {
        const scope = scopeOf(prompt);
        const pkg = field(prompt, 'REVIEW_PACKAGE_PATH');
        const reportPath = field(prompt, 'REVIEW_REPORT_PATH');
        const rec = { agentType: stype || null, toolUseId: o.tool_use_id || null, scope,
          scopedCowReviewer: REVIEWER.test(stype), packagePath: pkg ? normPath(pkg) : null,
          reportPath: reportPath ? normPath(reportPath) : null, model: null,
          wroteOrRanOrCommitted: false };
        if (o.tool_use_id) tasksById.set(o.tool_use_id, rec);
        out.reviewDispatches.push(rec);
        if (scope) out.reviewScopes.push(scope);
        if (pkg) out.reviewPackages.push(normPath(pkg));
        if (reportPath) out.reviewReports.push(normPath(reportPath));
        if (scope === 'TARGETED_REREVIEW') out.targetedRereviews.push(rec.toolUseId);
        if (scope === 'WHOLE_WORK_REVIEW') out.wholeWorkReviews.push({ id: rec.toolUseId, mode: (field(prompt, 'MODE') || '').toLowerCase() || null, model: null });
        if (!REVIEWER.test(stype)) {
          if (!stype) addV('AUTOMATIC_AGENT_SELECTION', 'a review dispatch did not name a subagent type');
          else addV('WRONG_REVIEWER_TYPE', `review dispatch is "${stype}", not cost-oriented-agentic-workflow:cow-reviewer`);
        }
        if (!pkg) addV('MISSING_REVIEW_PACKAGE', 'reviewer dispatched without a REVIEW_PACKAGE_PATH');
        if (!reportPath) addV('MISSING_REVIEW_REPORT', 'reviewer dispatched without a REVIEW_REPORT_PATH');
        if (!scope) addU('REVIEW_SCOPE_UNKNOWN', 'reviewer dispatch did not name a recognizable REVIEW_SCOPE');
      }
      continue;
    }

    // ── subagent messages: reviewer must remain read-only ───────────────────
    if (isSubagentMsg(o)) {
      const rec = (o.parent_tool_use_id && tasksById.get(o.parent_tool_use_id)) || null;
      if (!rec) continue; // not a reviewer subagent we are tracking
      if (!rec.model && o.message.model) {
        rec.model = o.message.model;
        out.reviewModels.push({ scope: rec.scope, model: o.message.model });
        const ww = out.wholeWorkReviews.find((w) => w.id === rec.toolUseId);
        if (ww) ww.model = o.message.model;
      }
      for (const c of o.message.content || []) {
        if (c.type !== 'tool_use') continue;
        const inp = c.input || {};
        if (c.name === 'Write' || c.name === 'Edit') { rec.wroteOrRanOrCommitted = true; addV('REVIEWER_ATTEMPTED_WRITE', 'the reviewer subagent attempted a Write/Edit'); }
        if (c.name === 'Agent' || c.name === 'Task') addV('REVIEWER_SPAWNED_AGENT', 'the reviewer subagent attempted to spawn another agent');
        if (c.name === 'Bash' && inp.command) {
          rec.wroteOrRanOrCommitted = true;
          addV('REVIEWER_RAN_SHELL', 'the reviewer subagent ran a shell command (read-only contract)');
          if (COMMIT_RE.test(inp.command)) addV('REVIEWER_ATTEMPTED_COMMIT', 'the reviewer subagent attempted git commit');
          if (COW_STATE_RE.test(inp.command)) addV('REVIEWER_TOUCHED_STATE', 'the reviewer subagent invoked cow-state / wrote state.json');
        }
      }
      continue;
    }

    if (!isController(o)) continue;

    // ── controller tool calls ───────────────────────────────────────────────
    for (const c of o.message.content || []) {
      if (c.type === 'text' && c.text && /(\bWORKFLOW (COMPLETE|FINISHED)\b|finishing-a-development-branch)/i.test(c.text)) anyCompletion = true;
      if (c.type !== 'tool_use') continue;
      const inp = c.input || {};
      if (c.name === 'Bash' && inp.command) {
        const cmd = inp.command;
        if (REPORT_VALIDATE_RE.test(cmd)) out.reportValidations.push(cmd.slice(0, 80));
        if (PKG_RE.test(cmd) && /\bbuild\b/.test(cmd)) { const m = cmd.match(/--output\s+(\S+)/); if (m) out.reviewPackages.push(normPath(m[1].replace(/["']/g, ''))); }
        if (WAVE_RE.test(cmd)) { waveCount += 1; out.remediationWaves.push(waveCount); if (waveCount > 2) addV('REMEDIATION_WAVE_CEILING_EXCEEDED', `remediation wave ${waveCount} exceeds the 2-wave ceiling`); }
        if (COMMIT_RE.test(cmd)) { anyCommit = true; out.commits.push(cmd.slice(0, 60)); }
      }
      if ((c.name === 'Write' || c.name === 'Edit') && inp.file_path && ADJUDICATION_RE.test(normPath(inp.file_path))) {
        out.adjudications.push(normPath(inp.file_path)); adjudicationAt.push(i);
      }
      if (c.name === 'Bash' && inp.command && /review\s+--findings/i.test(inp.command)) { out.adjudications.push(inp.command.slice(0, 60)); adjudicationAt.push(i); }
    }
  }
  // remediation implementer dispatched before any adjudication artifact → blind apply
  let firstRemediationAt = -1; let j = -1;
  for (const o of events) {
    j += 1;
    if (o.type === 'system' && o.subtype === 'task_started' && IMPLEMENTER.test(o.subagent_type || '')
        && /REMEDIATION_WAVE|ACCEPTED_FINDING_IDS/i.test(o.prompt || '')) { firstRemediationAt = j; break; }
  }
  if (firstRemediationAt >= 0 && !adjudicationAt.some((a) => a < firstRemediationAt)) {
    addV('FINDINGS_APPLIED_BEFORE_ADJUDICATION', 'a remediation implementer was dispatched before any controller adjudication artifact');
  }
  // production whole-work review should run on opus when supported
  for (const w of out.wholeWorkReviews) {
    if (w.mode === 'production' && w.model && !/opus/i.test(w.model)) {
      addV('PRODUCTION_WHOLE_WORK_MODEL_MISMATCH', `production whole-work review ran on ${w.model}, not an Opus override`);
    }
  }
  // semantic classification — never inferred from repository state alone
  const hadViolations = out.violations.length > 0;
  if (!out.meta.attributionOk) out.workflowSemanticResult = 'HARNESS_FAILURE';
  else if (anyCompletion && !hadViolations) out.workflowSemanticResult = 'WORKFLOW_COMPLETED';
  else if (anyCommit && !hadViolations) out.workflowSemanticResult = 'WORKFLOW_COMPLETED';
  else if (out.processExitCode != null && out.processExitCode !== 0) out.workflowSemanticResult = 'PROCESS_FAILURE';
  else out.workflowSemanticResult = (anyCommit || anyCompletion) ? 'WORKFLOW_COMPLETED' : null;

  out.reviewScopes = [...new Set(out.reviewScopes)];
  out.reviewPackages = [...new Set(out.reviewPackages)];
  out.reviewReports = [...new Set(out.reviewReports)];
  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const assert = args.includes('--assert');
  const positional = []; let exitCode;
  for (let k = 0; k < args.length; k++) {
    if (args[k] === '--assert') continue;
    if (args[k] === '--exit-code') { exitCode = Number(args[++k]); continue; }
    positional.push(args[k]);
  }
  const file = positional[0];
  if (!file) { process.stderr.write('usage: analyze-review-stream.mjs <stream.jsonl> [--assert] [--exit-code N]\n'); process.exit(2); }
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { process.stderr.write(`cannot read ${file}: ${e.message}\n`); process.exit(2); }
  const report = analyze(text, { exitCode });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!report.meta.attributionOk) process.exit(3);
  if (assert && report.violations.length) process.exit(1);
}

import { fileURLToPath } from 'url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

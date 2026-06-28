#!/usr/bin/env node
// Deterministic tests for the review stream analyzer (Phase 3B.2).
// Builds synthetic stream-JSONL and asserts reviewer-dispatch accounting, the
// read-only reviewer contract, adjudication ordering, the two-wave ceiling, and
// the production whole-work model override. Run: npm run test:review-stream

import { analyze } from './eval/analyze-review-stream.mjs';

let fails = 0, passes = 0;
const check = (c, m) => { if (c) passes += 1; else { fails += 1; console.error('FAIL: ' + m); } };
const has = (r, code) => r.violations.some((v) => v.code === code);

const ctrl = (...content) => JSON.stringify({ type: 'assistant', parent_tool_use_id: null, message: { model: 'claude-opus-4-8', content } });
const ctrlText = (t) => ctrl({ type: 'text', text: t });
const ctrlBash = (cmd) => ctrl({ type: 'tool_use', name: 'Bash', input: { command: cmd } });
const ctrlWrite = (fp) => ctrl({ type: 'tool_use', name: 'Write', input: { file_path: fp } });
const taskStarted = (id, type, prompt) => JSON.stringify({ type: 'system', subtype: 'task_started', tool_use_id: id, subagent_type: type, prompt });
const sub = (id, type, name, input, model = 'claude-sonnet-4-6') => JSON.stringify({ type: 'assistant', parent_tool_use_id: id, subagent_type: type, message: { model, content: name ? [{ type: 'tool_use', name, input }] : [{ type: 'text', text: 'verdict' }] } });
const join = (...lines) => lines.join('\n') + '\n';

const REV = 'cost-oriented-agentic-workflow:cow-reviewer';
const IMPL = 'cost-oriented-agentic-workflow:cow-implementer';
const RUN = '.cost-oriented-agentic-workflow/run';
const RPT = 'node skills/requesting-review/scripts/review-report.mjs';

function revPrompt({ scope = 'UNIT_REVIEW', target = 'task-1', mode = 'standard', risk = 'high',
  pkg = `${RUN}/task-1-review-package.json`, report = `${RUN}/task-1-review-report.json`, omit = [] } = {}) {
  const fields = { REVIEW_SCOPE: scope, REVIEW_TARGET_ID: target, MODE: mode, RISK: risk,
    REVIEW_PACKAGE_PATH: pkg, REVIEW_REPORT_PATH: report, WORKTREE_ROOT: '.' };
  return Object.entries(fields).filter(([k]) => !omit.includes(k)).map(([k, v]) => `${k}: ${v}`).join('\n');
}
const validateReport = (report = `${RUN}/task-1-review-report.json`, pkg = `${RUN}/task-1-review-package.json`) =>
  ctrlBash(`${RPT} validate ${report} --package ${pkg}`);
const adjudicate = (n = 1) => ctrlWrite(`${RUN}/task-${n}-review-adjudication.json`);
const remediationPrompt = () => `UNIT_ID: task-1\nREMEDIATION_WAVE: 1\nACCEPTED_FINDING_IDS: F-001\nBASELINE_PATH: ${RUN}/task-1-baseline.json`;

// ── clean unit review (no violations) ────────────────────────────────────────
{
  const r = analyze(join(
    ctrlText('Route: lane=plan; implementation=delegated; risk=high'),
    taskStarted('rv1', REV, revPrompt()),
    sub('rv1', REV, 'Read', { file_path: `${RUN}/task-1-review-package.json` }),
    validateReport(), adjudicate(), ctrlBash('git commit -m "task 1"')));
  check(r.violations.length === 0, `clean unit review has no violations (${JSON.stringify(r.violations)})`);
  check(r.reviewDispatches.length === 1 && r.reviewDispatches[0].scopedCowReviewer, 'scoped cow-reviewer dispatch recorded');
  check(r.reviewScopes.includes('UNIT_REVIEW') && r.reportValidations.length === 1, 'scope + report validation recorded');
  check(r.reviewModels.some((m) => /sonnet/.test(m.model)), 'reviewer model recorded as sonnet');
}

// ── wrong reviewer type + automatic selection ────────────────────────────────
check(has(analyze(join(taskStarted('rv1', 'general-purpose', revPrompt()))), 'WRONG_REVIEWER_TYPE'), 'non-cow-reviewer dispatch flagged');
check(has(analyze(join(taskStarted('rv1', '', revPrompt()))), 'AUTOMATIC_AGENT_SELECTION', 'empty subagent type flagged'), 'automatic agent selection flagged');

// ── missing package / report ─────────────────────────────────────────────────
check(has(analyze(join(taskStarted('rv1', REV, revPrompt({ omit: ['REVIEW_PACKAGE_PATH'] })))), 'MISSING_REVIEW_PACKAGE'), 'missing review package flagged');
check(has(analyze(join(taskStarted('rv1', REV, revPrompt({ omit: ['REVIEW_REPORT_PATH'] })))), 'MISSING_REVIEW_REPORT'), 'missing review report flagged');

// ── reviewer read-only contract ──────────────────────────────────────────────
check(has(analyze(join(taskStarted('rv1', REV, revPrompt()), sub('rv1', REV, 'Write', { file_path: 'src/a.js' }))), 'REVIEWER_ATTEMPTED_WRITE'), 'reviewer Write flagged');
check(has(analyze(join(taskStarted('rv1', REV, revPrompt()), sub('rv1', REV, 'Bash', { command: 'npm test' }))), 'REVIEWER_RAN_SHELL'), 'reviewer shell flagged');
check(has(analyze(join(taskStarted('rv1', REV, revPrompt()), sub('rv1', REV, 'Bash', { command: 'git commit -m x' }))), 'REVIEWER_ATTEMPTED_COMMIT'), 'reviewer commit flagged');
check(has(analyze(join(taskStarted('rv1', REV, revPrompt()), sub('rv1', REV, 'Bash', { command: 'node skills/execution-routing/scripts/cow-state.mjs review --clean' }))), 'REVIEWER_TOUCHED_STATE'), 'reviewer state mutation flagged');
check(has(analyze(join(taskStarted('rv1', REV, revPrompt()), sub('rv1', REV, 'Agent', { subagent_type: 'x' }))), 'REVIEWER_SPAWNED_AGENT'), 'reviewer agent spawn flagged');

// ── adjudication ordering ────────────────────────────────────────────────────
check(has(analyze(join(taskStarted('rv1', REV, revPrompt()), validateReport(),
  taskStarted('im1', IMPL, remediationPrompt()))), 'FINDINGS_APPLIED_BEFORE_ADJUDICATION'),
  'remediation before adjudication flagged');
check(!has(analyze(join(taskStarted('rv1', REV, revPrompt()), validateReport(), adjudicate(),
  taskStarted('im1', IMPL, remediationPrompt()))), 'FINDINGS_APPLIED_BEFORE_ADJUDICATION'),
  'remediation after adjudication is clean');

// ── targeted re-review recorded ──────────────────────────────────────────────
{
  const r = analyze(join(taskStarted('rv2', REV, revPrompt({ scope: 'TARGETED_REREVIEW' })), validateReport()));
  check(r.targetedRereviews.length === 1 && r.reviewScopes.includes('TARGETED_REREVIEW'), 'targeted re-review recorded');
}

// ── remediation wave ceiling ─────────────────────────────────────────────────
{
  const SD = 'node skills/execution-routing/scripts/cow-state.mjs';
  const r = analyze(join(ctrlBash(`${SD} review --wave`), ctrlBash(`${SD} review --wave`), ctrlBash(`${SD} review --wave`)));
  check(has(r, 'REMEDIATION_WAVE_CEILING_EXCEEDED'), 'third remediation wave flagged');
  check(!has(analyze(join(ctrlBash(`${SD} review --wave`), ctrlBash(`${SD} review --wave`))), 'REMEDIATION_WAVE_CEILING_EXCEEDED'), 'two waves are within the ceiling');
}

// ── production whole-work model override ──────────────────────────────────────
{
  const good = analyze(join(taskStarted('ww', REV, revPrompt({ scope: 'WHOLE_WORK_REVIEW', target: 'whole-work', mode: 'production' })),
    sub('ww', REV, 'Read', { file_path: 'x' }, 'claude-opus-4-8'), validateReport(), adjudicate(), ctrlText('WORKFLOW COMPLETE')));
  check(!has(good, 'PRODUCTION_WHOLE_WORK_MODEL_MISMATCH') && good.wholeWorkReviews.length === 1, 'production whole-work on Opus is clean');
  const bad = analyze(join(taskStarted('ww', REV, revPrompt({ scope: 'WHOLE_WORK_REVIEW', target: 'whole-work', mode: 'production' })),
    sub('ww', REV, 'Read', { file_path: 'x' }, 'claude-sonnet-4-6')));
  check(has(bad, 'PRODUCTION_WHOLE_WORK_MODEL_MISMATCH'), 'production whole-work on Sonnet is flagged');
}

// ── attribution / empty stream ───────────────────────────────────────────────
check(analyze('').workflowSemanticResult === 'HARNESS_FAILURE', 'empty stream → HARNESS_FAILURE');

console.log(`\nreview-stream analyzer: ${passes} checks passed, ${fails} failed.`);
if (fails > 0) process.exit(1);
console.log('review stream analyzer OK.');

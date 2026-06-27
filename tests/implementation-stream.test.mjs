#!/usr/bin/env node
// Deterministic tests for the implementation stream analyzer (Phase 3B.1).
// Builds synthetic stream-JSONL and asserts attribution, dispatch field checks,
// agent commit/state/spawn detection, allowed-path edits, and the
// commit-ordering contract violations. Run: npm run test:impl-stream

import { analyze } from './eval/analyze-implementation-stream.mjs';

let fails = 0, passes = 0;
const check = (c, m) => { if (c) passes += 1; else { fails += 1; console.error('FAIL: ' + m); } };
const has = (r, code) => r.violations.some((v) => v.code === code);

// ── synthetic builders ───────────────────────────────────────────────────────
const ctrl = (...content) => JSON.stringify({ type: 'assistant', parent_tool_use_id: null, message: { model: 'claude-opus-4-8', content } });
const ctrlText = (t) => ctrl({ type: 'text', text: t });
const ctrlBash = (cmd) => ctrl({ type: 'tool_use', name: 'Bash', input: { command: cmd } });
const ctrlEdit = (fp) => ctrl({ type: 'tool_use', name: 'Edit', input: { file_path: fp } });
const taskStarted = (id, type, prompt) => JSON.stringify({ type: 'system', subtype: 'task_started', tool_use_id: id, subagent_type: type, prompt });
const sub = (id, type, name, input) => JSON.stringify({ type: 'assistant', parent_tool_use_id: id, subagent_type: type, message: { model: 'claude-sonnet-4-6', content: [{ type: 'tool_use', name, input }] } });
const subBash = (id, type, cmd) => sub(id, type, 'Bash', { command: cmd });
const subEdit = (id, type, fp) => sub(id, type, 'Edit', { file_path: fp });
const subWrite = (id, type, fp) => sub(id, type, 'Write', { file_path: fp });
const subAgent = (id, type) => sub(id, type, 'Agent', { subagent_type: 'x' });
const join = (...lines) => lines.join('\n') + '\n';

const IMPL = 'cost-oriented-agentic-workflow:cow-implementer';
const REV = 'cost-oriented-agentic-workflow:cow-reviewer';
const REPORT = '.cost-oriented-agentic-workflow/run/task-1-report.json';
const receipt = (impl, risk = 'low') => ctrlText(`Route: lane=plan; repository=warm; discovery=controller-map; implementation=${impl}; risk=${risk}`);
function implPrompt({ allowed = 'src', report = REPORT, omit = [], unit = 'task-1' } = {}) {
  const fields = {
    TASK_BRIEF_PATH: '.cost-oriented-agentic-workflow/run/task-1-brief.md',
    REPORT_PATH: report, ALLOWED_PATHS: allowed, VERIFICATION_COMMANDS: 'npm test',
    COMMIT_POLICY: 'controller', WORKTREE_ROOT: '.', UNIT_ID: unit,
  };
  return Object.entries(fields).filter(([k]) => !omit.includes(k)).map(([k, v]) => `${k}: ${v}`).join('\n');
}
const validate = () => ctrlBash(`node skills/execution-routing/scripts/implementation-report.mjs validate ${REPORT} --brief b.md`);
const compare = () => ctrlBash(`node skills/execution-routing/scripts/implementation-report.mjs compare-worktree ${REPORT} --base HEAD --allowed-path src`);

// ── clean delegated unit ─────────────────────────────────────────────────────
{
  const r = analyze(join(
    receipt('delegated'), taskStarted('t1', IMPL, implPrompt()),
    subWrite('t1', IMPL, REPORT), subEdit('t1', IMPL, 'src/a.js'),
    validate(), compare(), ctrlBash('npm test'), ctrlBash('git commit -m "task 1"')));
  check(r.violations.length === 0, `clean delegated unit has no violations (${JSON.stringify(r.violations)})`);
  check(r.route === 'delegated', 'route captured from the receipt');
  check(r.implementerDispatches.length === 1, 'one implementer dispatch recorded');
  check(r.changedPaths.includes('src/a.js'), 'agent edit within allowed paths captured');
  check(r.reportPaths.includes(REPORT), 'report path captured');
  check(r.agentModels.some((m) => m.model === 'claude-sonnet-4-6'), 'agent model captured');
  check(r.verificationCommands.includes('npm test'), 'verification command captured');
}

// ── clean inline unit (no implementer) ───────────────────────────────────────
{
  const r = analyze(join(receipt('inline'), ctrlEdit('src/a.js'), ctrlBash('npm test'), ctrlBash('git commit -m x')));
  check(r.violations.length === 0, `clean inline unit has no violations (${JSON.stringify(r.violations)})`);
  check(r.implementerDispatches.length === 0, 'inline unit dispatches no implementer');
}

// ── implementer on an inline route ───────────────────────────────────────────
{
  const r = analyze(join(receipt('inline'), taskStarted('t1', IMPL, implPrompt())));
  check(has(r, 'IMPLEMENTER_ON_INLINE_ROUTE'), 'implementer on an inline route is flagged');
}
// ── wrong agent type for an implementation-shaped dispatch ────────────────────
{
  const r = analyze(join(receipt('delegated'), taskStarted('t1', 'general-purpose', implPrompt())));
  check(has(r, 'WRONG_AGENT_TYPE'), 'a non-cow-implementer implementation dispatch is flagged');
}
// ── missing required dispatch field ──────────────────────────────────────────
{
  const r = analyze(join(receipt('delegated'), taskStarted('t1', IMPL, implPrompt({ omit: ['UNIT_ID'] }))));
  check(r.violations.some((v) => v.code === 'MISSING_DISPATCH_FIELDS' && /UNIT_ID/.test(v.detail)), 'a missing UNIT_ID is flagged');
}
// ── agent attempted a commit / state mutation / nested spawn ──────────────────
{
  const r = analyze(join(receipt('delegated'), taskStarted('t1', IMPL, implPrompt()), subBash('t1', IMPL, 'git commit -m sneaky')));
  check(has(r, 'AGENT_ATTEMPTED_COMMIT') && r.commitAttemptsByAgent.length === 1, 'agent git commit is flagged');
}
{
  const r = analyze(join(receipt('delegated'), taskStarted('t1', IMPL, implPrompt()), subBash('t1', IMPL, 'node skills/execution-routing/scripts/cow-state.mjs unit --id 1')));
  check(has(r, 'AGENT_INVOKED_COW_STATE') && r.stateMutationsByAgent.length === 1, 'agent cow-state invocation is flagged');
}
{
  const r = analyze(join(receipt('delegated'), taskStarted('t1', IMPL, implPrompt()), subAgent('t1', IMPL)));
  check(has(r, 'AGENT_SPAWNED_AGENT'), 'agent spawning another agent is flagged');
}
// ── report missing / outside workspace ───────────────────────────────────────
{
  const r = analyze(join(receipt('delegated'), taskStarted('t1', IMPL, implPrompt()), subEdit('t1', IMPL, 'src/a.js')));
  check(has(r, 'REPORT_MISSING'), 'an implementer that never wrote its report is flagged');
}
{
  const r = analyze(join(receipt('delegated'), taskStarted('t1', IMPL, implPrompt({ report: 'reports/task-1-report.json' }))));
  check(has(r, 'REPORT_OUTSIDE_WORKSPACE'), 'a report path outside the workspace is flagged');
}
// ── changed path outside allowed scope ───────────────────────────────────────
{
  const r = analyze(join(receipt('delegated'), taskStarted('t1', IMPL, implPrompt({ allowed: 'src' })),
    subWrite('t1', IMPL, REPORT), subEdit('t1', IMPL, 'other/d.js')));
  check(r.violations.some((v) => v.code === 'CHANGED_PATH_OUTSIDE_ALLOWED' && /other\/d\.js/.test(v.detail)),
    'an agent edit outside ALLOWED_PATHS is flagged');
}
// ── commit ordering: before validation / verification / review ───────────────
{
  const r = analyze(join(receipt('delegated'), taskStarted('t1', IMPL, implPrompt()),
    subWrite('t1', IMPL, REPORT), subEdit('t1', IMPL, 'src/a.js'), ctrlBash('npm test'), ctrlBash('git commit -m x')));
  check(has(r, 'COMMIT_BEFORE_VALIDATION'), 'committing a delegated unit before report validation is flagged');
  check(!has(r, 'COMMIT_BEFORE_VERIFICATION'), 'verification that did run is not falsely flagged');
}
{
  const r = analyze(join(receipt('delegated'), taskStarted('t1', IMPL, implPrompt()),
    subWrite('t1', IMPL, REPORT), validate(), compare(), ctrlBash('git commit -m x')));
  check(has(r, 'COMMIT_BEFORE_VERIFICATION'), 'committing without a fresh verification run is flagged');
}
{
  const elevated = analyze(join(receipt('delegated', 'elevated'), taskStarted('t1', IMPL, implPrompt()),
    subWrite('t1', IMPL, REPORT), validate(), ctrlBash('npm test'), ctrlBash('git commit -m x')));
  check(has(elevated, 'COMMIT_BEFORE_REVIEW'), 'an elevated-risk unit committed with no review is flagged');
  const low = analyze(join(receipt('delegated', 'low'), taskStarted('t1', IMPL, implPrompt()),
    subWrite('t1', IMPL, REPORT), validate(), ctrlBash('npm test'), ctrlBash('git commit -m x')));
  check(!has(low, 'COMMIT_BEFORE_REVIEW'), 'a low-risk unit (review=none) is not falsely flagged for missing review');
}
// ── overlapping planned units executed concurrently ──────────────────────────
{
  const r = analyze(join(receipt('planned-sequential'),
    taskStarted('t1', IMPL, implPrompt({ allowed: 'src', unit: 'task-1' })),
    taskStarted('t2', IMPL, implPrompt({ allowed: 'src', unit: 'task-2', report: '.cost-oriented-agentic-workflow/run/task-2-report.json' }))));
  check(has(r, 'OVERLAPPING_PLANNED_UNITS_CONCURRENT'), 'two DIFFERENT open implementer units with overlapping paths are flagged');
}
// ── a same-unit retry is NOT overlapping concurrency ─────────────────────────
{
  const r = analyze(join(receipt('delegated'),
    taskStarted('t1', IMPL, implPrompt({ allowed: 'src', unit: 'task-1' })),
    subWrite('t1', IMPL, REPORT), subEdit('t1', IMPL, 'src/a.js'), ctrlBash('npm test'),
    taskStarted('t2', IMPL, implPrompt({ allowed: 'src', unit: 'task-1' })),
    subWrite('t2', IMPL, REPORT)));
  check(!has(r, 'OVERLAPPING_PLANNED_UNITS_CONCURRENT'), 'a same-unit retry (failed attempt then fresh re-dispatch) is not flagged as overlapping');
}
// ── route receipt missing ────────────────────────────────────────────────────
{
  const r = analyze(join(ctrlText('let me start'), taskStarted('t1', IMPL, implPrompt())));
  check(has(r, 'ROUTE_RECEIPT_MISSING_OR_INCONSISTENT'), 'a delegated dispatch with no route receipt is flagged');
}
// ── reviewer dispatch is recorded; the scoped cow-reviewer is detectable ──────
{
  const legacy = analyze(join(receipt('delegated'), taskStarted('r1', 'general-purpose', 'REVIEW_KIND=task REVIEW_PACKAGE_PATH=pkg.diff')));
  check(legacy.reviewerDispatches.length === 1 && legacy.reviewerDispatches[0].scopedCowReviewer === false,
    'a legacy general-purpose reviewer dispatch is recorded (not the scoped cow-reviewer)');
  const scoped = analyze(join(receipt('delegated'), taskStarted('r1', REV, 'REVIEW_KIND=task')));
  check(scoped.reviewerDispatches.length === 1 && scoped.reviewerDispatches[0].scopedCowReviewer === true,
    'a scoped cow-reviewer dispatch is detectable (must remain unused in 3B.1)');
}
// ── attribution failures ─────────────────────────────────────────────────────
{
  const empty = analyze('');
  check(!empty.meta.attributionOk && has(empty, 'EMPTY_STREAM'), 'empty stream fails attribution');
  const noctrl = analyze(join(taskStarted('t1', IMPL, implPrompt()), subWrite('t1', IMPL, REPORT)));
  check(!noctrl.meta.attributionOk && has(noctrl, 'NO_CONTROLLER'), 'a stream with no controller fails attribution');
}
// ── malformed lines are counted, analysis continues ──────────────────────────
{
  const r = analyze('{bad json\n' + receipt('inline') + '\n' + '{partial\n');
  check(r.meta.malformedLines === 2 && r.route === 'inline', 'malformed lines counted; analysis continues');
}

console.log(`\nimplementation-stream: ${passes} checks passed, ${fails} failed.`);
if (fails > 0) process.exit(1);
console.log('implementation stream analyzer OK.');

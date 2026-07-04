#!/usr/bin/env node
// Deterministic tests for the implementation stream analyzer (Phase 3B.1 + 3B.1.1).
// Builds synthetic stream-JSONL and asserts attribution, dispatch field checks,
// agent commit/state/spawn detection, allowed-path edits, the commit-ordering
// contract, and the unit-baseline / attempt-evidence / staging gates.
// Run: npm run test:implementation-stream

import { analyze } from './eval/analyze-implementation-stream.mjs';

let fails = 0, passes = 0;
const check = (c, m) => { if (c) passes += 1; else { fails += 1; console.error('FAIL: ' + m); } };
const has = (r, code) => r.violations.some((v) => v.code === code);

// ── synthetic builders ───────────────────────────────────────────────────────
const ctrl = (...content) => JSON.stringify({ type: 'assistant', parent_tool_use_id: null, message: { model: 'claude-opus-4-8', content } });
const ctrlText = (t) => ctrl({ type: 'text', text: t });
const ctrlBash = (cmd) => ctrl({ type: 'tool_use', name: 'Bash', input: { command: cmd } });
const ctrlEdit = (fp) => ctrl({ type: 'tool_use', name: 'Edit', input: { file_path: fp } });
const userResult = (obj) => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] }] } });
const taskStarted = (id, type, prompt) => JSON.stringify({ type: 'system', subtype: 'task_started', tool_use_id: id, subagent_type: type, prompt });
const sub = (id, type, name, input) => JSON.stringify({ type: 'assistant', parent_tool_use_id: id, subagent_type: type, message: { model: 'claude-sonnet-4-6', content: [{ type: 'tool_use', name, input }] } });
const subBash = (id, type, cmd) => sub(id, type, 'Bash', { command: cmd });
const subEdit = (id, type, fp) => sub(id, type, 'Edit', { file_path: fp });
const subWrite = (id, type, fp) => sub(id, type, 'Write', { file_path: fp });
const subAgent = (id, type) => sub(id, type, 'Agent', { subagent_type: 'x' });
const join = (...lines) => lines.join('\n') + '\n';

const IMPL = 'cost-oriented-agentic-workflow:cow-implementer';
const REV = 'cost-oriented-agentic-workflow:cow-reviewer';
const RUN = '.cost-oriented-agentic-workflow/run';
const BASELINE = `${RUN}/task-1-baseline.json`;
const REPORT = `${RUN}/task-1-attempt-1-report.json`;
const UW = 'node skills/execution-routing/scripts/unit-worktree.mjs';
const IR = 'node skills/execution-routing/scripts/implementation-report.mjs';
const receipt = (impl, risk = 'low') => ctrlText(`Route: lane=plan; repository=warm; discovery=controller-map; implementation=${impl}; risk=${risk}`);
const capture = (unit = 'task-1', out = BASELINE) => ctrlBash(`${UW} capture --unit ${unit} --output ${out} --allowed-path src`);
const overlap = (status, bl = BASELINE) => join(ctrlBash(`${UW} check-overlap ${bl}`), userResult(status === 'OK' ? { status: 'OK', overlap: [] } : { status: 'BLOCKED_DIRTY_OVERLAP', overlap: ['src/a.js'] }));
const verifyStage = (bl = BASELINE) => ctrlBash(`${UW} verify-stage ${bl}`);
const validateCmd = () => ctrlBash(`${IR} validate ${REPORT} --brief b.md --attempt 1 --baseline ${BASELINE}`);
const compareCmd = () => ctrlBash(`${IR} compare-worktree ${REPORT} --baseline ${BASELINE}`);
function implPrompt({ allowed = 'src', report = REPORT, baseline = BASELINE, attempt = 1, unit = 'task-1', omit = [] } = {}) {
  const fields = {
    TASK_BRIEF_PATH: `${RUN}/task-1-brief.md`, REPORT_PATH: report, ALLOWED_PATHS: allowed,
    VERIFICATION_COMMANDS: 'npm test', COMMIT_POLICY: 'controller', WORKTREE_ROOT: '.',
    UNIT_ID: unit, ATTEMPT_NUMBER: attempt, BASELINE_PATH: baseline,
  };
  return Object.entries(fields).filter(([k]) => !omit.includes(k)).map(([k, v]) => `${k}: ${v}`).join('\n');
}

// ── clean delegated unit (full baseline lifecycle) ───────────────────────────
{
  const r = analyze(join(
    receipt('delegated'), capture(), overlap('OK'),
    taskStarted('t1', IMPL, implPrompt()), subWrite('t1', IMPL, REPORT), subEdit('t1', IMPL, 'src/a.js'),
    validateCmd(), compareCmd(), ctrlBash('npm test'),
    ctrlBash('git add src/a.js'), verifyStage(), ctrlBash('git commit -m "task 1"')));
  check(r.violations.length === 0, `clean delegated unit has no violations (${JSON.stringify(r.violations)})`);
  check(r.route === 'delegated' && r.implementerDispatches.length === 1, 'route + one dispatch recorded');
  check(r.baselinePaths.includes(BASELINE) && r.attemptReports.length === 1 && r.attemptReports[0].attemptNumber === 1, 'baseline + attempt report recorded');
  check(r.stageVerification.length === 1 && r.workflowSemanticResult === 'WORKFLOW_COMPLETED', 'stage verified; classified WORKFLOW_COMPLETED');
}
// ── clean inline unit ────────────────────────────────────────────────────────
{
  const r = analyze(join(receipt('inline'), capture(), overlap('OK'), ctrlEdit('src/a.js'), ctrlBash('npm test'), ctrlBash('git add src/a.js'), verifyStage(), ctrlBash('git commit -m x')));
  check(r.violations.length === 0, `clean inline unit has no violations (${JSON.stringify(r.violations)})`);
  check(r.implementerDispatches.length === 0, 'inline dispatches no implementer');
}

// ── 3B.1 carryover violations ────────────────────────────────────────────────
check(has(analyze(join(receipt('inline'), capture(), overlap('OK'), taskStarted('t1', IMPL, implPrompt()))), 'IMPLEMENTER_ON_INLINE_ROUTE'), 'implementer on an inline route is flagged');
check(has(analyze(join(receipt('delegated'), capture(), overlap('OK'), taskStarted('t1', 'general-purpose', implPrompt()))), 'WRONG_AGENT_TYPE'), 'a non-cow-implementer implementation dispatch is flagged');
check(has(analyze(join(receipt('delegated'), capture(), overlap('OK'), taskStarted('t1', IMPL, implPrompt({ omit: ['UNIT_ID'] })))), 'MISSING_DISPATCH_FIELDS'), 'a missing dispatch field is flagged');
check(has(analyze(join(receipt('delegated'), capture(), overlap('OK'), taskStarted('t1', IMPL, implPrompt({ omit: ['BASELINE_PATH'] })))), 'MISSING_DISPATCH_FIELDS'), 'a missing BASELINE_PATH is flagged');
check(has(analyze(join(receipt('delegated'), capture(), overlap('OK'), taskStarted('t1', IMPL, implPrompt()), subBash('t1', IMPL, 'git commit -m x'))), 'AGENT_ATTEMPTED_COMMIT'), 'agent git commit is flagged');
check(has(analyze(join(receipt('delegated'), capture(), overlap('OK'), taskStarted('t1', IMPL, implPrompt()), subBash('t1', IMPL, `${UW} verify-stage ${BASELINE}`.replace('unit-worktree', 'cow-state')))), 'AGENT_INVOKED_COW_STATE'), 'agent cow-state invocation is flagged');
check(has(analyze(join(receipt('delegated'), capture(), overlap('OK'), taskStarted('t1', IMPL, implPrompt()), subAgent('t1', IMPL))), 'AGENT_SPAWNED_AGENT'), 'agent spawning another agent is flagged');
check(has(analyze(join(receipt('delegated'), capture(), overlap('OK'), taskStarted('t1', IMPL, implPrompt()), subEdit('t1', IMPL, 'src/a.js'))), 'REPORT_MISSING'), 'an implementer that never wrote its report is flagged');
check(has(analyze(join(receipt('delegated'), capture(), overlap('OK'), taskStarted('t1', IMPL, implPrompt({ report: 'reports/task-1-attempt-1-report.json' })))), 'REPORT_OUTSIDE_WORKSPACE'), 'a report path outside the workspace is flagged');
check(analyze(join(receipt('delegated'), capture(), overlap('OK'), taskStarted('t1', IMPL, implPrompt()), subWrite('t1', IMPL, REPORT), subEdit('t1', IMPL, 'other/d.js'))).violations.some((v) => v.code === 'CHANGED_PATH_OUTSIDE_ALLOWED'), 'an agent edit outside ALLOWED_PATHS is flagged');

// ── 3B.1.1: baseline lifecycle violations ────────────────────────────────────
check(has(analyze(join(receipt('delegated'), taskStarted('t1', IMPL, implPrompt()))), 'BASELINE_NOT_CAPTURED_BEFORE_IMPLEMENTATION'), 'dispatch before any capture is flagged');
check(has(analyze(join(receipt('delegated'), capture(), taskStarted('t1', IMPL, implPrompt()))), 'DISPATCH_BEFORE_OVERLAP_CHECK'), 'dispatch before check-overlap is flagged');
check(has(analyze(join(receipt('delegated'), capture(), overlap('BLOCKED'), taskStarted('t1', IMPL, implPrompt()))), 'DIRTY_OVERLAP_IGNORED'), 'dispatch after a BLOCKED_DIRTY_OVERLAP is flagged');
check(has(analyze(join(receipt('inline'), capture(), overlap('BLOCKED'), ctrlEdit('src/a.js'))), 'DIRTY_OVERLAP_IGNORED'), 'inline edit after a BLOCKED_DIRTY_OVERLAP is flagged');
check(has(analyze(join(receipt('inline'), ctrlEdit('src/a.js'))), 'BASELINE_NOT_CAPTURED_BEFORE_IMPLEMENTATION'), 'inline edit before any capture is flagged');

// ── 3B.1.1: broad-staging tripwires ──────────────────────────────────────────
for (const cmd of ['git add -A', 'git add .', 'git add --all', 'git commit -a -m x']) {
  check(has(analyze(join(receipt('delegated'), capture(), overlap('OK'), taskStarted('t1', IMPL, implPrompt()), subWrite('t1', IMPL, REPORT), validateCmd(), ctrlBash('npm test'), verifyStage(), ctrlBash(cmd))), 'BROAD_STAGE_COMMAND'), `broad staging "${cmd}" is flagged`);
}
check(!has(analyze(join(receipt('delegated'), capture(), overlap('OK'), taskStarted('t1', IMPL, implPrompt()), subWrite('t1', IMPL, REPORT), validateCmd(), ctrlBash('npm test'), verifyStage(), ctrlBash('git add src/a.js && git commit -m x'))), 'BROAD_STAGE_COMMAND'), 'exact-path staging is not flagged as broad');

// ── 3B.1.1: attempt artifacts ────────────────────────────────────────────────
{
  // a retry reusing the SAME report path across attempts
  const r = analyze(join(receipt('delegated'), capture(), overlap('OK'),
    taskStarted('t1', IMPL, implPrompt({ attempt: 1 })), subWrite('t1', IMPL, REPORT), ctrlBash('npm test'),
    taskStarted('t2', IMPL, implPrompt({ attempt: 2 }))));  // attempt 2 reuses attempt-1 report path
  check(has(r, 'REUSED_REPORT_PATH_ACROSS_ATTEMPTS'), 'reusing a report path across attempts is flagged');
}
check(has(analyze(join(receipt('delegated'), capture(), overlap('OK'), taskStarted('t1', IMPL, implPrompt({ attempt: 1, report: `${RUN}/task-1-attempt-2-report.json` })))), 'ATTEMPT_REPORT_NUMBER_MISMATCH'), 'attempt number / report-path mismatch is flagged');
{
  const r = analyze(join(receipt('delegated'), capture(), overlap('OK'),
    taskStarted('t1', IMPL, implPrompt({ attempt: 1 })), subWrite('t1', IMPL, REPORT), ctrlBash('npm test'),
    taskStarted('t2', IMPL, implPrompt({ attempt: 2, report: `${RUN}/task-1-attempt-2-report.json`, baseline: `${RUN}/task-1-baseline-NEW.json` }))));
  check(has(r, 'BASELINE_CHANGED_BETWEEN_RETRIES'), 'a baseline change across retries is flagged');
}
// a legitimate retry (distinct attempt report, same baseline) is NOT flagged for reuse/baseline-change
{
  const r = analyze(join(receipt('delegated'), capture(), overlap('OK'),
    taskStarted('t1', IMPL, implPrompt({ attempt: 1 })), subWrite('t1', IMPL, REPORT), ctrlBash('npm test'),
    taskStarted('t2', IMPL, implPrompt({ attempt: 2, report: `${RUN}/task-1-attempt-2-report.json` }))));
  check(!has(r, 'REUSED_REPORT_PATH_ACROSS_ATTEMPTS') && !has(r, 'BASELINE_CHANGED_BETWEEN_RETRIES') && !has(r, 'OVERLAPPING_PLANNED_UNITS_CONCURRENT'), 'a clean retry (distinct report, same baseline) is not falsely flagged');
}

// ── 3B.1.1: commit-before-stage-verification ─────────────────────────────────
check(has(analyze(join(receipt('delegated'), capture(), overlap('OK'), taskStarted('t1', IMPL, implPrompt()), subWrite('t1', IMPL, REPORT), validateCmd(), ctrlBash('npm test'), ctrlBash('git commit -m x'))), 'COMMIT_BEFORE_STAGE_VERIFICATION'), 'committing without verify-stage is flagged');

// ── 3B.1.1: ownership breach surfaced from a helper result before commit ──────
{
  const r = analyze(join(receipt('delegated'), capture(), overlap('OK'), taskStarted('t1', IMPL, implPrompt()), subWrite('t1', IMPL, REPORT),
    validateCmd(), userResult({ violations: [{ code: 'PRE_EXISTING_PATH_MODIFIED', paths: ['src/keep.js'] }] }), ctrlBash('npm test'), verifyStage(), ctrlBash('git commit -m x')));
  check(has(r, 'PRE_EXISTING_PATH_MODIFIED'), 'a pre-existing-path-modified result before a commit is surfaced');
}

// ── 3B.1.1: process exit classification ──────────────────────────────────────
{
  const completed = join(receipt('delegated'), capture(), overlap('OK'), taskStarted('t1', IMPL, implPrompt()), subWrite('t1', IMPL, REPORT), validateCmd(), compareCmd(), ctrlBash('npm test'), ctrlBash('git add src/a.js'), verifyStage(), ctrlBash('git commit -m x'));
  const r1 = analyze(completed, { exitCode: 1 });
  check(r1.workflowSemanticResult === 'WORKFLOW_COMPLETED' && !has(r1, 'PROCESS_EXIT_NONZERO_UNCLASSIFIED'), 'a completed workflow with a nonzero process exit is not a process failure');
  const r2 = analyze(join(receipt('delegated'), capture()), { exitCode: 1 });
  check(r2.workflowSemanticResult === 'PROCESS_FAILURE' && has(r2, 'PROCESS_EXIT_NONZERO_UNCLASSIFIED'), 'an unexplained nonzero process exit is a PROCESS_FAILURE');
  const r3 = analyze(join(receipt('delegated'), capture(), overlap('BLOCKED')), { exitCode: 0 });
  check(r3.workflowSemanticResult === 'WORKFLOW_BLOCKED', 'a dirty-overlap block with no commit classifies WORKFLOW_BLOCKED');
}

// ── overlapping DIFFERENT planned units (one-at-a-time) ──────────────────────
check(has(analyze(join(receipt('planned-sequential'), capture('task-1'), overlap('OK'),
  taskStarted('t1', IMPL, implPrompt({ unit: 'task-1' })),
  taskStarted('t2', IMPL, implPrompt({ unit: 'task-2', baseline: `${RUN}/task-2-baseline.json`, report: `${RUN}/task-2-attempt-1-report.json` })))), 'OVERLAPPING_PLANNED_UNITS_CONCURRENT'), 'two different open units with overlapping paths are flagged');

// ── reviewer dispatch recorded; attribution; malformed ───────────────────────
{
  const legacy = analyze(join(receipt('delegated'), taskStarted('r1', 'general-purpose', 'REVIEW_KIND=task REVIEW_PACKAGE_PATH=pkg.diff')));
  check(legacy.reviewerDispatches.length === 1 && legacy.reviewerDispatches[0].scopedCowReviewer === false, 'a legacy reviewer dispatch is recorded (not the scoped cow-reviewer)');
  const scoped = analyze(join(receipt('delegated'), taskStarted('r1', REV, 'REVIEW_KIND=task')));
  check(scoped.reviewerDispatches[0].scopedCowReviewer === true, 'a scoped cow-reviewer dispatch is detectable (must stay unused)');
}
{
  const empty = analyze('');
  check(!empty.meta.attributionOk && has(empty, 'EMPTY_STREAM') && empty.workflowSemanticResult === 'HARNESS_FAILURE', 'empty stream is a HARNESS_FAILURE');
  const noctrl = analyze(join(taskStarted('t1', IMPL, implPrompt())));
  check(!noctrl.meta.attributionOk && has(noctrl, 'NO_CONTROLLER'), 'a stream with no controller fails attribution');
  const mal = analyze('{bad json\n' + receipt('inline') + '\n' + '{partial\n');
  check(mal.meta.malformedLines === 2 && mal.route === 'inline', 'malformed lines counted; analysis continues');
}

console.log(`\nimplementation-stream: ${passes} checks passed, ${fails} failed.`);
if (fails > 0) process.exit(1);
console.log('implementation stream analyzer OK.');

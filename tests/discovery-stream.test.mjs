#!/usr/bin/env node
// Deterministic tests for the discovery stream analyzer (Phase 3A.1). Builds
// synthetic stream-JSONL and asserts the analyzer's attribution, read counting,
// discovery-purpose classification, controller-map budget, and duplicate signal.
// Run: npm run test:discovery-stream

import path from 'path';
import { fileURLToPath } from 'url';
import { analyze, BUDGET } from './eval/analyze-discovery-stream.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
void here;
let fails = 0, passes = 0;
const check = (c, m) => { if (c) passes += 1; else { fails += 1; console.error('FAIL: ' + m); } };

// ── synthetic stream builders ────────────────────────────────────────────────
const ctrl = (...content) => JSON.stringify({ type: 'assistant', parent_tool_use_id: null, message: { model: 'claude-opus-4-8', content } });
const ctrlRead = (fp) => ctrl({ type: 'tool_use', name: 'Read', input: { file_path: fp } });
const ctrlGlob = () => ctrl({ type: 'tool_use', name: 'Glob', input: { pattern: '**/*' } });
const ctrlText = (t) => ctrl({ type: 'text', text: t });
const ctrlBash = (cmd) => ctrl({ type: 'tool_use', name: 'Bash', input: { command: cmd } });
const dispatch = (id, type, prompt) => JSON.stringify({ type: 'assistant', parent_tool_use_id: null, message: { model: 'claude-opus-4-8', content: [{ type: 'tool_use', name: 'Agent', id, input: { subagent_type: type, prompt } }] } });
const taskStarted = (id, type, prompt) => JSON.stringify({ type: 'system', subtype: 'task_started', tool_use_id: id, subagent_type: type, prompt });
const subRead = (id, type, fp) => JSON.stringify({ type: 'assistant', parent_tool_use_id: id, subagent_type: type, message: { model: 'claude-sonnet-4-6', content: [{ type: 'tool_use', name: 'Read', input: { file_path: fp } }] } });
const join = (...lines) => lines.join('\n') + '\n';

const REPO = 'cost-oriented-agentic-workflow:cow-repo-investigator';
const DBG = 'cost-oriented-agentic-workflow:cow-debug-investigator';

// ── profile-draft dispatch ───────────────────────────────────────────────────
{
  const s = join(taskStarted('t1', REPO, 'draft ... OUTPUT_FORMAT: PROFILE_DRAFT ...'), subRead('t1', REPO, 'src/x.js'));
  const r = analyze(s);
  check(r.agents.length === 1 && r.agents[0].purpose === 'PROFILE_DRAFT', 'profile-draft dispatch classified PROFILE_DRAFT');
  check(r.agents[0].model === 'claude-sonnet-4-6', 'agent model captured from subagent message');
  check(r.controller.sourceReadsBeforeFirstDispatch === 0 && r.controller.sourceReadsAfterFirstDispatch === 0, "subagent read is NOT counted as a controller read");
}
// ── task-discovery dispatch ──────────────────────────────────────────────────
{
  const r = analyze(join(
    ctrlText('Route: lane=plan; repository=warm; discovery=investigator; implementation=pending; risk=low'),
    dispatch('t1', REPO, 'OUTPUT_FORMAT=TASK_DISCOVERY scope ...'),
    taskStarted('t1', REPO, 'OUTPUT_FORMAT=TASK_DISCOVERY scope ...')));
  check(r.agents[0].purpose === 'TASK_DISCOVERY', 'task-discovery dispatch classified TASK_DISCOVERY');
  check(r.violations.length === 0, 'task-discovery has no violations');
}
// ── debug-investigator dispatch ──────────────────────────────────────────────
{
  const r = analyze(join(taskStarted('t1', DBG, 'symptom ...')));
  check(r.agents[0].purpose === 'DEBUG_DIAGNOSIS', 'debug investigator classified DEBUG_DIAGNOSIS (no OUTPUT_FORMAT needed)');
}
// ── multiple scoped investigators ────────────────────────────────────────────
{
  const r = analyze(join(taskStarted('t1', DBG, 'a'), taskStarted('t2', DBG, 'b')));
  check(r.agents.length === 2 && r.agents.every((a) => a.purpose === 'DEBUG_DIAGNOSIS'), 'two debug investigators classified');
}
// ── controller vs subagent attribution + exact read counting ─────────────────
{
  const s = join(ctrlRead('src/a.js'), ctrlRead('src/b.js'),
    dispatch('t1', DBG, 'x'), taskStarted('t1', DBG, 'x'),
    subRead('t1', DBG, 'src/c.js'), subRead('t1', DBG, 'src/d.js'));
  const r = analyze(s);
  check(r.controller.sourceReadsBeforeFirstDispatch === 2, 'exactly two controller target reads before dispatch');
  check(r.controller.sourceReadsAfterFirstDispatch === 0, 'subagent reads after dispatch not attributed to controller');
}
// ── allowed control-plane reads do not consume the source allowance ──────────
{
  const s = join(ctrlRead('.cost-oriented-agentic-workflow/run/state.json'),
    ctrlRead('.cost-oriented-agentic-workflow/run/repo-profile.json'),
    ctrlRead('CLAUDE.md'), ctrlRead('src/a.js'));
  const r = analyze(s);
  check(r.controller.controlPlaneReads === 2, 'control-plane reads counted separately (2)');
  check(r.controller.instructionReads === 1, 'instruction read counted separately (1)');
  check(r.controller.sourceReadsBeforeFirstDispatch === 1, 'only the real source read consumes the allowance (1)');
}
// ── controller-map budget pass ───────────────────────────────────────────────
{
  const s = join(ctrlRead('src/a.js'), ctrlRead('src/b.js'), ctrlRead('src/c.js'), ctrlGlob(),
    taskStarted('t1', DBG, 'x'));
  const r = analyze(s);
  check(r.controller.sourceReadsBeforeFirstDispatch === 3 && r.controller.boundedQueriesBeforeFirstDispatch === 1, 'budget edge counts (3 reads, 1 broad)');
  check(r.violations.length === 0, 'controller-map budget pass: no violation at the limit');
}
// ── controller-map budget failure (before) ───────────────────────────────────
{
  const s = join(ctrlRead('src/a.js'), ctrlRead('src/b.js'), ctrlRead('src/c.js'), ctrlRead('src/d.js'),
    ctrlGlob(), ctrlGlob(), taskStarted('t1', DBG, 'x'));
  const r = analyze(s);
  check(r.violations.some((v) => v.code === 'BUDGET_BEFORE_TARGET'), 'over-budget target reads flagged');
  check(r.violations.some((v) => v.code === 'BUDGET_BEFORE_BROAD'), 'over-budget broad queries flagged');
}
// ── repeated source read after delegation (duplicate investigation) ──────────
{
  const s = join(ctrlRead('src/a.js'), taskStarted('t1', DBG, 'x'), ctrlRead('src/a.js'));
  const r = analyze(s);
  check(r.duplicateInvestigation.some((d) => d.code === 'REREAD_TARGET'), 'reread of a pre-dispatch target flagged');
  check(r.controller.sourceReadsAfterFirstDispatch === 1, 'after-dispatch adjudication read counted (1)');
  check(!r.violations.some((v) => v.code === 'BUDGET_AFTER_TARGET'), 'one adjudication read is within budget');
}
// ── broad query after delegation (no Re-route) ───────────────────────────────
{
  const s = join(taskStarted('t1', DBG, 'x'), ctrlGlob());
  const r = analyze(s);
  check(r.duplicateInvestigation.some((d) => d.code === 'BROAD_QUERY_AFTER_DISPATCH'), 'broad query after dispatch flagged');
  check(r.violations.some((v) => v.code === 'BUDGET_AFTER_BROAD'), 'broad query after dispatch without Re-route is a budget violation');
}
// ── broad query after delegation WITH a Re-route is allowed ──────────────────
{
  const s = join(taskStarted('t1', DBG, 'x'), ctrlText('Re-route: reason=scope-insufficient; discovery=investigator; implementation=pending'), ctrlGlob());
  const r = analyze(s);
  check(!r.violations.some((v) => v.code === 'BUDGET_AFTER_BROAD'), 'Re-route excuses a post-dispatch broad query');
  check(r.receipts.some((x) => /^Re-route:/.test(x)), 'Re-route receipt captured');
}
// ── control-plane Glob/Grep is NOT a budget-consuming BROAD_QUERY (§5.2) ─────
{
  const s = join(
    ctrl({ type: 'tool_use', name: 'Glob', input: { path: 'skills', pattern: '**/repo-profile.mjs' } }),
    ctrl({ type: 'tool_use', name: 'Grep', input: { pattern: 'cow-repo-investigator' } }),
    ctrl({ type: 'tool_use', name: 'Glob', input: { pattern: '**/repo-profile.json' } }),
    ctrlGlob(), // the one real task-code broad query
    taskStarted('t1', DBG, 'x'));
  const r = analyze(s);
  check(r.controller.boundedQueriesBeforeFirstDispatch === 1, 'control-plane Glob/Grep excluded from the broad-query budget (only the task query counts)');
  check(!r.violations.some((v) => v.code === 'BUDGET_BEFORE_BROAD'), 'one task broad query stays within budget despite control-plane navigation');
}

// ── missing OUTPUT_FORMAT on a repo-investigator dispatch ────────────────────
{
  const r = analyze(join(taskStarted('t1', REPO, 'just go map the repo please')));
  check(r.agents[0].purpose === 'UNKNOWN' && r.violations.some((v) => v.code === 'MISSING_OUTPUT_FORMAT'), 'repo-investigator without OUTPUT_FORMAT is a violation');
}
// ── malformed + partial stream ───────────────────────────────────────────────
{
  const s = '{ this is not json\n' + ctrlRead('src/a.js') + '\n' + '{"partial":\n';
  const r = analyze(s);
  check(r.meta.malformedLines === 2, 'malformed lines counted (2)');
  check(r.controller.sourceReadsBeforeFirstDispatch === 1, 'analysis continues past malformed lines');
}
{
  const r = analyze('');
  check(!r.meta.attributionOk && r.violations.some((v) => v.code === 'EMPTY_STREAM'), 'empty stream flagged, attribution not ok');
}
// ── no-controller stream fails attribution clearly ───────────────────────────
{
  const r = analyze(join(taskStarted('t1', DBG, 'x'), subRead('t1', DBG, 'src/c.js')));
  check(!r.meta.attributionOk && r.violations.some((v) => v.code === 'NO_CONTROLLER'), 'stream with no controller message fails attribution');
}
// ── BUDGET constants are the Phase 3A limits ─────────────────────────────────
check(BUDGET.beforeTargetReads === 3 && BUDGET.beforeBroadQueries === 1 && BUDGET.afterTargetReads === 1 && BUDGET.afterBroadQueries === 0,
  'BUDGET encodes the exact Phase 3A controller-map limits');

console.log(`\ndiscovery-stream: ${passes} checks passed, ${fails} failed.`);
if (fails > 0) process.exit(1);
console.log('discovery stream analyzer OK.');

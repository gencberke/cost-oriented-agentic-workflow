#!/usr/bin/env node
// analyze-implementation-stream — deterministic accounting for Phase 3B.1
// implementation smokes (0.5.0). Development/eval tooling, NOT runtime code.
//
// Parses a Claude Code stream-JSONL transcript and reports, as stable JSON:
// the implementation route receipt; implementer/reviewer dispatches with their
// declared inputs; controller vs subagent tool attribution; agent commit/state
// attempts; agent-edited paths vs the dispatch's ALLOWED_PATHS; report paths;
// and a conservative list of contract violations. Zero dependencies (Node stdlib).
//
//   node analyze-implementation-stream.mjs <stream.jsonl> [--assert]
// `--assert` exits non-zero if any violation is present.
//
// LIMITS (honoured deliberately): a stream shows dispatches, tool calls, and
// receipts — not the real git diff or the mode. So "changed path outside allowed
// paths" is detected only from a subagent's own Write/Edit targets; per-task
// review enforcement is inferred from the receipt `risk=` field (elevated/high);
// and "fresh verification" is a heuristic over controller test-runner commands.
// We do not claim semantic certainty where the stream is insufficient.

import fs from 'fs';

const IMPL_ROUTES = ['inline', 'delegated', 'planned-sequential', 'delegated-batch'];
const REQUIRED_DISPATCH_FIELDS = ['TASK_BRIEF_PATH', 'REPORT_PATH', 'ALLOWED_PATHS',
  'VERIFICATION_COMMANDS', 'COMMIT_POLICY', 'WORKTREE_ROOT', 'UNIT_ID'];
const IMPLEMENTER = /cow-implementer/;
const REVIEWER = /cow-reviewer/;
const VERIFY_HEURISTIC = /\b(npm|pnpm|yarn|pytest|jest|vitest|mocha|go test|cargo test|cargo check|mvn|gradle|ctest|rspec|phpunit|dotnet test|make test|node\s+\S*test)\b/i;
const COMMIT_RE = /\bgit\s+commit\b/;
const COW_STATE_RE = /cow-state(\.mjs)?\b|run[\\/]state\.json/;
const WORKSPACE = /\.cost-oriented-agentic-workflow\//;

const normPath = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');
// Suffix-aware so an ABSOLUTE subagent edit path (e.g. C:/tmp/repo/src/a.js)
// still matches a repo-relative allowed path (src or src/a.js). A real stream
// carries whatever the agent typed — often absolute paths.
const pathUnder = (changed, allowed) => {
  if (allowed.length === 0) return true;
  const c = normPath(changed);
  return allowed.some((a0) => {
    const a = normPath(a0).replace(/\/+$/, '');
    return c === a || c.endsWith('/' + a) || c.startsWith(a + '/') || c.includes('/' + a + '/');
  });
};
const sameFile = (changed, target) => {
  if (!target) return false;
  const c = normPath(changed); const t = normPath(target).replace(/\/+$/, '');
  return c === t || c.endsWith('/' + t);
};

// Pull ALLOWED_PATHS off a dispatch prompt: the comma/space list on that line.
function parseAllowedPaths(prompt) {
  const m = String(prompt).match(/ALLOWED_PATHS\s*[:=]\s*([^\n]+)/i);
  if (!m) return [];
  return m[1].split(/[,\s]+/).map((s) => normPath(s.trim())).filter(Boolean);
}
function reportPathOf(prompt) {
  const m = String(prompt).match(/REPORT_PATH\s*[:=]\s*(\S+)/i);
  return m ? normPath(m[1]) : null;
}
function unitIdOf(prompt) {
  const m = String(prompt).match(/UNIT_ID\s*[:=]\s*(\S+)/i);
  return m ? m[1].trim() : null;
}

export function analyze(text) {
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const events = [];
  let malformed = 0;
  for (const l of rawLines) { try { events.push(JSON.parse(l)); } catch { malformed += 1; } }

  const isController = (o) => o.type === 'assistant' && o.message && !o.parent_tool_use_id && !o.subagent_type;
  const isSubagentMsg = (o) => o.type === 'assistant' && o.message && (o.parent_tool_use_id || o.subagent_type);

  const out = {
    route: null,
    implementerDispatches: [], reviewerDispatches: [],
    agentModels: [], controllerToolCalls: [], agentToolCalls: [],
    stateMutationsByAgent: [], commitAttemptsByAgent: [],
    changedPaths: [], verificationCommands: [], reportPaths: [],
    violations: [],
    meta: { malformedLines: malformed, events: events.length, attributionOk: true },
  };
  const addV = (code, detail) => out.violations.push({ code, detail });
  if (events.length === 0) { out.meta.attributionOk = false; addV('EMPTY_STREAM', 'no parseable events'); return out; }
  if (!events.some(isController)) { out.meta.attributionOk = false; addV('NO_CONTROLLER', 'no controller assistant message found'); }

  const tasksById = new Map();      // tool_use_id -> dispatch record
  let lastRisk = null;              // from the most recent receipt
  let routeBeforeFirstImplDispatch = null;
  // Per-commit cycle markers + the open delegated window (one-at-a-time check).
  let cycle = { dispatch: false, validate: false, review: false, verify: false, risk: null };
  let openImpl = [];               // implementer dispatches since the last validate/commit

  for (const o of events) {
    // ── agent dispatches (system task_started) ──────────────────────────────
    if (o.type === 'system' && o.subtype === 'task_started') {
      const stype = o.subagent_type || '';
      const prompt = o.prompt || '';
      const looksImplementer = /TASK_BRIEF_PATH/.test(prompt) && /REPORT_PATH/.test(prompt);
      const rec = { agentType: stype || null, toolUseId: o.tool_use_id || null,
        unitId: unitIdOf(prompt), allowedPaths: parseAllowedPaths(prompt), reportPath: reportPathOf(prompt),
        wroteReport: false, model: null };
      if (o.tool_use_id) tasksById.set(o.tool_use_id, rec);

      if (IMPLEMENTER.test(stype) || looksImplementer) {
        out.implementerDispatches.push(rec);
        if (out.implementerDispatches.length === 1) routeBeforeFirstImplDispatch = out.route;
        if (!IMPLEMENTER.test(stype)) addV('WRONG_AGENT_TYPE', `implementation dispatch is "${stype || '(none)'}", not cost-oriented-agentic-workflow:cow-implementer`);
        const missing = REQUIRED_DISPATCH_FIELDS.filter((f) => !new RegExp(f).test(prompt));
        if (missing.length) addV('MISSING_DISPATCH_FIELDS', `cow-implementer dispatch missing: ${missing.join(', ')}`);
        if (out.route === 'inline') addV('IMPLEMENTER_ON_INLINE_ROUTE', 'a cow-implementer was dispatched while the recorded route is inline');
        if (!IMPL_ROUTES.slice(1).includes(out.route)) addV('ROUTE_RECEIPT_MISSING_OR_INCONSISTENT', `cow-implementer dispatched without a delegated route receipt (route=${out.route ?? 'none'})`);
        if (rec.reportPath && !WORKSPACE.test(rec.reportPath)) addV('REPORT_OUTSIDE_WORKSPACE', `REPORT_PATH is outside the workflow workspace: ${rec.reportPath}`);
        if (rec.reportPath) out.reportPaths.push(rec.reportPath);
        // A re-dispatch of the SAME unit id is a retry, not a concurrent unit — it
        // supersedes the prior open entry. Overlap is only a violation across
        // DIFFERENT units running at once (planned-sequential is one-at-a-time).
        openImpl = openImpl.filter((prev) => prev.unitId == null || rec.unitId == null || prev.unitId !== rec.unitId);
        for (const prev of openImpl) {
          const overlap = rec.allowedPaths.some((p) => prev.allowedPaths.some((q) => p === q || p.startsWith(q + '/') || q.startsWith(p + '/')));
          if (overlap) addV('OVERLAPPING_PLANNED_UNITS_CONCURRENT', `two implementer units with overlapping allowed paths are open at once (${prev.unitId || '?'} / ${rec.unitId || '?'})`);
        }
        openImpl.push(rec);
        cycle.dispatch = true;
      } else if (REVIEWER.test(stype) || /REVIEW_PACKAGE|REVIEW_KIND|reviewer/i.test(prompt)) {
        out.reviewerDispatches.push({ agentType: stype || null, scopedCowReviewer: REVIEWER.test(stype) });
        cycle.review = true;
      }
      continue;
    }

    // ── subagent assistant messages (tools, commit/state attempts, edits) ────
    if (isSubagentMsg(o)) {
      const rec = (o.parent_tool_use_id && tasksById.get(o.parent_tool_use_id))
        || out.implementerDispatches.find((a) => a.agentType === o.subagent_type) || null;
      const label = (rec && (rec.reportPath || rec.agentType)) || o.subagent_type || 'subagent';
      if (rec && !rec.model && o.message.model) { rec.model = o.message.model; out.agentModels.push({ agentType: rec.agentType, model: o.message.model }); }
      for (const c of o.message.content || []) {
        if (c.type !== 'tool_use') continue;
        if (!out.agentToolCalls.includes(c.name)) out.agentToolCalls.push(c.name);
        const inp = c.input || {};
        if (c.name === 'Agent' || c.name === 'Task') addV('AGENT_SPAWNED_AGENT', `subagent ${label} attempted to spawn another agent`);
        if (c.name === 'Bash' && inp.command) {
          if (COMMIT_RE.test(inp.command)) { out.commitAttemptsByAgent.push({ agent: label, command: inp.command }); addV('AGENT_ATTEMPTED_COMMIT', `subagent ${label} attempted git commit`); }
          if (COW_STATE_RE.test(inp.command)) { out.stateMutationsByAgent.push({ agent: label, command: inp.command }); addV('AGENT_INVOKED_COW_STATE', `subagent ${label} invoked cow-state / wrote state.json`); }
        }
        if ((c.name === 'Write' || c.name === 'Edit') && inp.file_path) {
          const fp = normPath(inp.file_path);
          if (rec && sameFile(fp, rec.reportPath)) { rec.wroteReport = true; continue; }
          if (WORKSPACE.test(fp)) continue; // workflow artifacts are not unit source changes
          out.changedPaths.push(fp);
          if (rec && !pathUnder(fp, rec.allowedPaths)) addV('CHANGED_PATH_OUTSIDE_ALLOWED', `subagent ${label} edited ${fp} outside ALLOWED_PATHS [${rec.allowedPaths.join(', ')}]`);
        }
      }
      continue;
    }

    if (!isController(o)) continue;

    // ── controller assistant message ────────────────────────────────────────
    for (const c of o.message.content || []) {
      if (c.type === 'text' && c.text) {
        for (const m of c.text.matchAll(/^(Route:|Re-route:)[^\n]*/gim)) {
          const recv = m[0];
          const ri = recv.match(/implementation=([a-z-]+)/i);
          if (ri && IMPL_ROUTES.includes(ri[1])) out.route = ri[1];
          const rk = recv.match(/risk=([a-z]+)/i);
          if (rk) { lastRisk = rk[1]; cycle.risk = rk[1]; }
        }
      }
      if (c.type !== 'tool_use') continue;
      if (!out.controllerToolCalls.includes(c.name)) out.controllerToolCalls.push(c.name);
      const inp = c.input || {};
      if (c.name === 'Bash' && inp.command) {
        const cmd = inp.command;
        // The helper path may be quoted/variable-expanded (e.g. "$SD/...mjs" validate),
        // so detect the helper and the subcommand independently in the same command.
        const usesHelper = /implementation-report\.mjs/.test(cmd);
        if (usesHelper && /\bvalidate\b/.test(cmd)) { cycle.validate = true; openImpl = []; }
        if (usesHelper && /\bcompare-worktree\b/.test(cmd)) { cycle.validate = true; openImpl = []; }
        if (/review-package\b/.test(cmd)) cycle.review = true;
        if (VERIFY_HEURISTIC.test(cmd) && !/implementation-report\.mjs|cow-state/.test(cmd)) { cycle.verify = true; if (!out.verificationCommands.includes(cmd)) out.verificationCommands.push(cmd); }
        if (COMMIT_RE.test(cmd)) {
          // a controller commit closes the unit cycle — check ordering
          if (cycle.dispatch && !cycle.validate) addV('COMMIT_BEFORE_VALIDATION', 'controller committed a delegated unit before validating its report against the diff');
          if (!cycle.verify) addV('COMMIT_BEFORE_VERIFICATION', 'controller committed without an identifiable fresh verification run in this cycle');
          if ((cycle.risk === 'elevated' || cycle.risk === 'high') && !cycle.review) addV('COMMIT_BEFORE_REVIEW', `controller committed an ${cycle.risk}-risk unit with no preceding review dispatch`);
          cycle = { dispatch: false, validate: false, review: false, verify: false, risk: lastRisk };
          openImpl = [];
        }
      } else if (c.name === 'Read' && inp.file_path && /report\.json$/.test(String(inp.file_path))) {
        const rp = normPath(inp.file_path); if (!out.reportPaths.includes(rp)) out.reportPaths.push(rp);
      }
    }
  }

  // post-pass: a dispatched implementer that never wrote its declared report
  for (const d of out.implementerDispatches) {
    if (d.reportPath && !d.wroteReport) addV('REPORT_MISSING', `cow-implementer (${d.reportPath}) returned without writing its report`);
  }
  // a route receipt naming an implementation route must exist when work happened
  if (out.implementerDispatches.length === 0 && out.route === null && out.controllerToolCalls.length > 0) {
    // inline-only runs still need a receipt; only flag if any edit/commit happened
    const didWork = out.controllerToolCalls.includes('Edit') || out.controllerToolCalls.includes('Write')
      || out.controllerToolCalls.includes('Bash');
    if (didWork) addV('ROUTE_RECEIPT_MISSING_OR_INCONSISTENT', 'controller performed work with no implementation route receipt');
  }
  out.reportPaths = [...new Set(out.reportPaths)];
  out.changedPaths = [...new Set(out.changedPaths)];
  void routeBeforeFirstImplDispatch;
  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const assert = args.includes('--assert');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) { process.stderr.write('usage: analyze-implementation-stream.mjs <stream.jsonl> [--assert]\n'); process.exit(2); }
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { process.stderr.write(`cannot read ${file}: ${e.message}\n`); process.exit(2); }
  const report = analyze(text);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!report.meta.attributionOk) process.exit(3);
  if (assert && report.violations.length) process.exit(1);
}

import { fileURLToPath } from 'url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

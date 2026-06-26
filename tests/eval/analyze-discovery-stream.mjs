#!/usr/bin/env node
// analyze-discovery-stream — deterministic accounting for Phase 3A discovery
// smokes (0.5.0, Phase 3A.1). Development/eval tooling, NOT runtime code.
//
// Parses a Claude Code stream-JSONL transcript and reports, as stable JSON:
// controller vs subagent attribution, categorized controller reads (numeric,
// before/after the first investigator dispatch), each agent dispatch classified
// by its explicit OUTPUT_FORMAT contract, controller-map budget pass/fail, and a
// conservative duplicate-investigation signal. Zero dependencies (Node stdlib).
//
//   node analyze-discovery-stream.mjs <stream.jsonl> [--assert]
// `--assert` exits non-zero if any budget/contract violation is present.

import fs from 'fs';

// ── Controller-map budget (Phase 3A §9.2 / §7) ──────────────────────────────
export const BUDGET = {
  beforeTargetReads: 3,   // TARGET_SOURCE_OR_CONFIG_READ before first dispatch
  beforeBroadQueries: 1,  // BROAD_QUERY before first dispatch
  afterTargetReads: 1,    // targeted adjudication read after delegation
  afterBroadQueries: 0,   // new broad queries after delegation (unless Re-route)
};

const base = (p) => String(p).split(/[\\/]/).pop();
const INSTRUCTION = new Set(['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', 'CONVENTIONS.md', '.cursorrules', '.windsurfrules']);
const CTRL_BASENAMES = new Set([
  'state.json', 'state.active', 'repo-snapshot.json', 'repo-profile.json',
  'repo-profile.candidate.json', 'repo-profile.md', 'repo-profile-agent-output.txt', 'progress.md',
]);
// A Glob/Grep is BROAD_QUERY (budget-consuming) only when it scans TASK code (§5.2).
// Queries that locate control-plane assets (the workflow skills/references, the
// helpers, the agents, the profile/snapshot) are control-plane navigation, not task
// discovery, and do not consume the controller-map broad-query allowance.
const CONTROL_PLANE_QUERY = /skills|references|\.cost-oriented-agentic-workflow|cow-state|cow-repo-investigator|cow-debug-investigator|repo-profile|repo-snapshot|profile.?contract|SKILL\.md/i;

function categorizeRead(p) {
  const s = String(p).replace(/\\/g, '/');
  const b = base(s);
  if (/\.cost-oriented-agentic-workflow\//.test(s) || CTRL_BASENAMES.has(b)
      || b === 'SKILL.md' || /\/(skills|references)\//.test(s)
      || /repository-profile-contract|repository-readiness|discovery-routing/.test(s)) {
    return 'CONTROL_PLANE_READ';
  }
  if (INSTRUCTION.has(b) || /\.github\/copilot-instructions\.md$/.test(s)) return 'INSTRUCTION_READ';
  return 'TARGET_SOURCE_OR_CONFIG_READ';
}

// Mutating Bash prefixes (controller mutating actions) — the literal allowlist
// from the hook design; here used only for reporting.
const MUTATING_BASH = [/\bgit\s+commit\b/, /\bgit\s+reset\b/, /\bgit\s+checkout\s+--/, /\bgit\s+clean\b/,
  /\bgit\s+stash\b/, /\bgit\s+rebase\b/, /\bgit\s+merge\b/, /\brm\s+-rf\b/, /\bnpm\s+install\b/, /\bpip\s+install\b/];

function purposeOf(subagentType, prompt) {
  const t = subagentType || '';
  if (/cow-debug-investigator/.test(t)) return { purpose: 'DEBUG_DIAGNOSIS', violation: null };
  if (/cow-repo-investigator/.test(t)) {
    if (/OUTPUT_FORMAT\s*[:=]?\s*PROFILE_DRAFT/i.test(prompt)) return { purpose: 'PROFILE_DRAFT', violation: null };
    if (/OUTPUT_FORMAT\s*[:=]?\s*TASK_DISCOVERY/i.test(prompt)) return { purpose: 'TASK_DISCOVERY', violation: null };
    return { purpose: 'UNKNOWN', violation: 'repo-investigator dispatch lacks an explicit OUTPUT_FORMAT' };
  }
  return { purpose: 'UNKNOWN', violation: `unexpected subagent_type: ${t}` };
}

export function analyze(text) {
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const events = [];
  let malformed = 0;
  for (const l of rawLines) { try { events.push(JSON.parse(l)); } catch { malformed += 1; } }

  const isController = (o) => o.type === 'assistant' && o.message && !o.parent_tool_use_id && !o.subagent_type;
  const isSubagentMsg = (o) => o.type === 'assistant' && o.message && (o.parent_tool_use_id || o.subagent_type);

  const out = {
    controller: {
      model: null, toolCalls: [],
      sourceReadsBeforeFirstDispatch: 0, sourceReadsAfterFirstDispatch: 0,
      boundedQueriesBeforeFirstDispatch: 0, boundedQueriesAfterFirstDispatch: 0,
      controlPlaneReads: 0, instructionReads: 0, bashHelperRuns: 0,
    },
    agents: [], receipts: [], statePaths: [], profilePaths: [], mutatingActions: [],
    duplicateInvestigation: [], violations: [], meta: { malformedLines: malformed, events: events.length, attributionOk: true },
  };
  if (events.length === 0) { out.meta.attributionOk = false; out.violations.push({ code: 'EMPTY_STREAM', detail: 'no parseable events' }); return out; }

  // attribution sanity: at least one controller assistant message must exist
  if (!events.some(isController)) { out.meta.attributionOk = false; out.violations.push({ code: 'NO_CONTROLLER', detail: 'no controller (parent-less, non-subagent) assistant message found' }); }

  let dispatched = false;
  const beforeTargetPaths = new Set();
  const tasksById = new Map();

  for (const o of events) {
    // agent dispatches surface as system task_started (subagent_type + prompt)
    if (o.type === 'system' && o.subtype === 'task_started') {
      const { purpose, violation } = purposeOf(o.subagent_type, o.prompt || '');
      const agent = { agentType: o.subagent_type || null, model: null, purpose, tools: [], toolUseId: o.tool_use_id || null };
      out.agents.push(agent);
      if (o.tool_use_id) tasksById.set(o.tool_use_id, agent);
      if (violation) out.violations.push({ code: 'MISSING_OUTPUT_FORMAT', detail: violation });
      dispatched = true; // first investigator dispatch boundary
      continue;
    }
    // subagent assistant messages → model + tools for the owning task
    if (isSubagentMsg(o)) {
      const agent = (o.parent_tool_use_id && tasksById.get(o.parent_tool_use_id))
        || out.agents.find((a) => a.agentType === o.subagent_type) || null;
      if (agent) {
        if (!agent.model && o.message.model) agent.model = o.message.model;
        for (const c of o.message.content || []) if (c.type === 'tool_use') { if (!agent.tools.includes(c.name)) agent.tools.push(c.name); }
      }
      continue;
    }
    if (!isController(o)) continue;

    // controller assistant message
    if (!out.controller.model) out.controller.model = o.message.model || null;
    for (const c of o.message.content || []) {
      if (c.type === 'text' && c.text) {
        for (const m of c.text.matchAll(/^(Route:|Re-route:)[^\n]*/gim)) out.receipts.push(m[0].trim());
      }
      if (c.type !== 'tool_use') continue;
      out.controller.toolCalls.push(c.name);
      const inp = c.input || {};
      if (c.name === 'Read' && inp.file_path) {
        const cat = categorizeRead(inp.file_path);
        const sp = String(inp.file_path).replace(/\\/g, '/');
        if (/repo-profile/.test(sp)) out.profilePaths.push(sp);
        if (/state\.json/.test(sp)) out.statePaths.push(sp);
        if (cat === 'CONTROL_PLANE_READ') out.controller.controlPlaneReads += 1;
        else if (cat === 'INSTRUCTION_READ') out.controller.instructionReads += 1;
        else if (cat === 'TARGET_SOURCE_OR_CONFIG_READ') {
          if (!dispatched) { out.controller.sourceReadsBeforeFirstDispatch += 1; beforeTargetPaths.add(base(sp)); }
          else {
            out.controller.sourceReadsAfterFirstDispatch += 1;
            if (beforeTargetPaths.has(base(sp))) out.duplicateInvestigation.push({ code: 'REREAD_TARGET', detail: sp });
          }
        }
      } else if (c.name === 'Glob' || c.name === 'Grep') {
        const tgt = `${inp.path || ''} ${inp.pattern || inp.glob || ''}`;
        if (CONTROL_PLANE_QUERY.test(tgt)) {
          out.controller.controlPlaneReads += 1; // control-plane navigation, not task discovery
        } else if (!dispatched) out.controller.boundedQueriesBeforeFirstDispatch += 1;
        else { out.controller.boundedQueriesAfterFirstDispatch += 1; out.duplicateInvestigation.push({ code: 'BROAD_QUERY_AFTER_DISPATCH', detail: c.name }); }
      } else if (c.name === 'Bash' && inp.command) {
        out.controller.bashHelperRuns += 1;
        for (const re of MUTATING_BASH) if (re.test(inp.command)) out.mutatingActions.push({ tool: 'Bash', command: inp.command });
      } else if (c.name === 'Write' || c.name === 'Edit') {
        out.mutatingActions.push({ tool: c.name, path: inp.file_path || null });
      }
    }
  }

  // ── budget assertions ──────────────────────────────────────────────────────
  const cc = out.controller;
  const hasReroute = out.receipts.some((r) => /^Re-route:/i.test(r));
  if (cc.sourceReadsBeforeFirstDispatch > BUDGET.beforeTargetReads) out.violations.push({ code: 'BUDGET_BEFORE_TARGET', detail: `${cc.sourceReadsBeforeFirstDispatch} > ${BUDGET.beforeTargetReads}` });
  if (cc.boundedQueriesBeforeFirstDispatch > BUDGET.beforeBroadQueries) out.violations.push({ code: 'BUDGET_BEFORE_BROAD', detail: `${cc.boundedQueriesBeforeFirstDispatch} > ${BUDGET.beforeBroadQueries}` });
  if (cc.sourceReadsAfterFirstDispatch > BUDGET.afterTargetReads) out.violations.push({ code: 'BUDGET_AFTER_TARGET', detail: `${cc.sourceReadsAfterFirstDispatch} > ${BUDGET.afterTargetReads}` });
  if (cc.boundedQueriesAfterFirstDispatch > BUDGET.afterBroadQueries && !hasReroute) out.violations.push({ code: 'BUDGET_AFTER_BROAD', detail: `${cc.boundedQueriesAfterFirstDispatch} > ${BUDGET.afterBroadQueries} without Re-route` });

  out.statePaths = [...new Set(out.statePaths)];
  out.profilePaths = [...new Set(out.profilePaths)];
  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const assert = args.includes('--assert');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) { process.stderr.write('usage: analyze-discovery-stream.mjs <stream.jsonl> [--assert]\n'); process.exit(2); }
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { process.stderr.write(`cannot read ${file}: ${e.message}\n`); process.exit(2); }
  const report = analyze(text);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!report.meta.attributionOk) process.exit(3);
  if (assert && report.violations.length) process.exit(1);
}

import { fileURLToPath } from 'url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

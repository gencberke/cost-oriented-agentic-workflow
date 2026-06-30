#!/usr/bin/env node
// cow-hook — deterministic hook-enforcement script for the
// cost-oriented-agentic-workflow control plane (0.5.0, Phase 4 + Phase 5A).
//
// Zero deps. Exits 0, fails open on missing/inactive/corrupt state.
// Shadow mode (default): evaluates rules R1-R9, logs decisions, returns no blocks.
// Enforcement mode (--decision-mode=enforce, PreToolUse only): may emit ask/deny
// for the zero-false-positive binary rules E1-E7. Never allow/defer/updatedInput.
// SessionStart (R10): injects the lean COW_RESUME_POINTER_V1 context pointer.
// SessionStart and PreCompact ignore the decision-mode flag.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import {
  paths, classify, oneline
} from './cow-state-core.mjs';

const USAGE = `cow-hook — workflow hook evaluator (Node + git, zero deps)
Usage: node cow-hook.mjs <session-start|pre-tool-use|pre-compact> [--decision-mode=shadow|enforce]
Default decision-mode is shadow. Only the exact value 'enforce' enables enforcement
(PreToolUse only); shadow emits no stdout and only writes observations.`;

function getRoot() {
  try {
    const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout) {
      return path.resolve(r.stdout.trim());
    }
  } catch (e) {
    // Ignore and fallback
  }
  return path.resolve(process.cwd());
}

function normalizePath(root, pth) {
  if (!pth) return '';
  const resolved = path.resolve(root, pth);
  const rel = path.relative(root, resolved);
  return rel.replace(/\\/g, '/');
}

function isScratch(relPath) {
  if (!relPath) return true;
  const norm = relPath.replace(/\\/g, '/');
  return norm.startsWith('.cost-oriented-agentic-workflow/') || norm.startsWith('tmp/');
}

function isUnderAllowed(relPath, allowedPaths) {
  if (!allowedPaths || allowedPaths.length === 0) return true;
  const norm = relPath.toLowerCase();
  for (const p of allowedPaths) {
    const ap = p.replace(/\\/g, '/').toLowerCase();
    if (norm === ap || norm.startsWith(ap.endsWith('/') ? ap : ap + '/')) {
      return true;
    }
  }
  return false;
}

function isGitTracked(root, relPath) {
  if (!relPath || relPath.startsWith('..')) return false;
  try {
    const r = spawnSync('git', ['ls-files', '--error-unmatch', '--', relPath], {
      cwd: root,
      encoding: 'utf8'
    });
    return r.status === 0;
  } catch (e) {
    return false;
  }
}

function classifyBash(root, command) {
  if (!command) return null;
  const cmd = command.trim();
  
  const tokens = cmd.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  
  // Check redirect
  if (cmd.includes('>') || cmd.includes('>>')) {
    const idx = tokens.findIndex(t => t === '>' || t === '>>');
    if (idx !== -1 && tokens[idx + 1]) {
      const target = tokens[idx + 1].replace(/['"]/g, '');
      const relTarget = normalizePath(root, target);
      if (!isScratch(relTarget)) {
        return 'redirection';
      }
    } else {
      return 'redirection';
    }
    return null;
  }
  
  const exe = tokens[0].toLowerCase();
  
  if (exe === 'git' && tokens[1]) {
    const sub = tokens[1].toLowerCase();
    if (sub === 'commit') return 'git-commit';
    if (sub === 'push') return 'git-push';
    if (sub === 'clean') return 'git-clean';
    if (sub === 'merge') return 'git-merge';
    if (sub === 'rebase') return 'git-rebase';
    if (sub === 'reset') {
      if (tokens.some(t => t === '--hard')) {
        return 'git-reset-hard';
      }
    }
  }
  
  if (exe === 'rm') {
    if (tokens.some(t => t.startsWith('-') && t.includes('r') && t.includes('f'))) {
      return 'rm-rf';
    }
  }
  
  if (exe === 'npm' && tokens[1]) {
    const sub = tokens[1].toLowerCase();
    if (['install', 'i', 'ci'].includes(sub)) {
      return 'npm-install';
    }
  }
  
  if (exe === 'pip' && tokens[1]) {
    const sub = tokens[1].toLowerCase();
    if (sub === 'install') {
      return 'pip-install';
    }
  }
  
  return 'other-bash';
}

function logObservation(p, event, stateClass, mode, phase, toolName, matchedRuleIds, wouldBeDecision, subjectKind, subjectValue, errorCode, actualDecision, reasonCode) {
  try {
    const logPath = path.join(p.dir, 'hook-observations.log');

    const record = {
      schemaVersion: 1,
      observedAt: new Date().toISOString(),
      event,
      stateClass,
      mode: mode || null,
      phase: phase || null,
      toolName: toolName || null,
      matchedRuleIds: matchedRuleIds || [],
      wouldBeDecision: wouldBeDecision || 'none',
      actualDecision: actualDecision || 'none',
    };
    if (reasonCode !== undefined && reasonCode !== null) {
      record.reasonCode = reasonCode;
    }
    record.subjectKind = subjectKind || 'none';
    record.subjectValue = subjectValue || null;
    record.errorCode = errorCode || null;

    let line = JSON.stringify(record) + '\n';
    if (Buffer.byteLength(line, 'utf8') > 1024) {
      record.subjectValue = null;
      record.errorCode = 'OBSERVATION_TRUNCATED';
      line = JSON.stringify(record) + '\n';
    } else {
      let safeSubjVal = record.subjectValue;
      if (typeof safeSubjVal === 'string') {
        const buf = Buffer.from(safeSubjVal, 'utf8');
        if (buf.length > 256) {
          safeSubjVal = buf.subarray(0, 256).toString('utf8');
          record.subjectValue = safeSubjVal;
          line = JSON.stringify(record) + '\n';
        }
      }
    }

    fs.mkdirSync(p.dir, { recursive: true });
    fs.appendFileSync(logPath, line, 'utf8');

    let content = '';
    try {
      content = fs.readFileSync(logPath, 'utf8');
    } catch (e) {
      return;
    }
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length > 500) {
      const keep = lines.slice(lines.length - 400);
      const tmp = logPath + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
      fs.writeFileSync(tmp, keep.join('\n') + '\n', 'utf8');
      fs.renameSync(tmp, logPath);
    }
  } catch (e) {
    // Fail-open
  }
}

function handleSessionStart(root, p, c, payload) {
  const s = c.state;
  const statusStr = oneline(c);
  
  const ctx = `COW_RESUME_POINTER_V1
State Path: .cost-oriented-agentic-workflow/run/state.json
Status: ${statusStr}
Entry Skill: cost-oriented-agentic-workflow:using-cost-oriented-workflow
Instructions: A Cost-Oriented Agentic Workflow session is active. Re-anchor context using the Git log, the progress.md ledger, the plan, and the run state. Do not re-run or re-delegate completed units. Use the entry skill to execute the next planned step.`;

  let source = 'startup';
  if (payload.trigger === 'startup' || payload.trigger === 'resume' || payload.trigger === 'clear' || payload.trigger === 'compact') {
    source = payload.trigger;
  } else if (payload.type === 'startup' || payload.type === 'resume' || payload.type === 'clear' || payload.type === 'compact') {
    source = payload.type;
  }

  logObservation(
    p,
    'session-start',
    'ACTIVE_VALID',
    s.mode,
    s.phase,
    null,
    ['R10'],
    'none',
    'session-source',
    source,
    null
  );

  const payloadOut = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: ctx
    }
  };
  process.stdout.write(JSON.stringify(payloadOut, null, 2) + '\n');
  process.exit(0);
}

function handlePreToolUseShadow(root, p, c, payload) {
  const s = c.state;
  const mode = s.mode;
  const phase = s.phase;
  const planStatus = s.plan.status;
  
  const toolName = payload.tool_name || '';
  const toolInput = payload.tool_input || {};
  let agentType = payload.agent_type || payload.agent_id || '';
  if (toolName === 'Agent') {
    agentType = toolInput.subagent_type || agentType;
  }

  let relPath = '';
  const isEditWrite = ['Edit', 'Write'].includes(toolName);
  if (isEditWrite) {
    const rawPath = toolInput.file_path || toolInput.path || '';
    relPath = normalizePath(root, rawPath);
  }

  const matchedRuleIds = [];
  let wouldBeDecision = 'none';
  let subjectKind = 'none';
  let subjectValue = null;

  const decisionRank = { none: 0, ask: 1, warn: 2, deny: 3 };
  const observeRule = (ruleId, decision, kind, value) => {
    matchedRuleIds.push(ruleId);
    if (decisionRank[decision] > decisionRank[wouldBeDecision]) {
      wouldBeDecision = decision;
    }
    if (subjectKind === 'none') {
      subjectKind = kind;
      subjectValue = value;
    }
  };

  // R1: diagnosis-readonly edit
  if (phase === 'diagnosis-readonly' && isEditWrite && isGitTracked(root, relPath)) {
    const wouldBe = mode === 'production' ? 'deny' : 'ask';
    observeRule('R1', wouldBe, 'path', relPath);
  }

  // R2: Production plan approved
  const isPlanApproved = ['approved', 'executing', 'done'].includes(planStatus);
  if (mode === 'production' && !isPlanApproved && isEditWrite && isGitTracked(root, relPath)) {
    observeRule('R2', 'deny', 'path', relPath);
  }

  // R3: Edit outside allowed paths
  const isRoutingPhase = ['implementing', 'verifying', 'reviewing'].includes(phase);
  const allowed = s.currentUnit.allowedPaths || [];
  if (isRoutingPhase && allowed.length > 0 && isEditWrite) {
    if (!isScratch(relPath) && !isUnderAllowed(relPath, allowed)) {
      const wouldBe = mode === 'production' ? 'deny' : 'ask';
      observeRule('R3', wouldBe, 'path', relPath);
    }
  }

  // R4: Investigator write outside workspace
  const isInvestigator = agentType === 'cow-repo-investigator' || agentType.includes('investigator');
  if (isInvestigator && isEditWrite && !isScratch(relPath)) {
    observeRule('R4', 'deny', 'path', relPath);
  }

  // R5: Wrong agent warning
  if (phase === 'implementing' && s.implementationRoute === 'delegated' && agentType === 'invalid-agent') {
    observeRule('R5', 'warn', 'agent', agentType);
  }

  // R6: Mutating Bash
  if (toolName === 'Bash') {
    const command = toolInput.command || '';
    const bashClass = classifyBash(root, command);
    if (bashClass && bashClass !== 'other-bash') {
      const wouldBe = mode === 'production' ? 'deny' : 'ask';
      observeRule('R6', wouldBe, 'bash-class', bashClass);
    }
  }

  if (matchedRuleIds.length > 0) {
    logObservation(
      p,
      'pre-tool-use',
      'ACTIVE_VALID',
      mode,
      phase,
      toolName,
      matchedRuleIds,
      wouldBeDecision,
      subjectKind,
      subjectValue,
      null
    );
  }

  process.exit(0);
}

// ── Phase 5A enforcement (PreToolUse only) ───────────────────────────────────
// Only the exact value 'enforce' reaches this function. It reuses the Phase 4
// path/state helpers (no second normalization system). It may emit only ask or
// deny; no match / uncertainty / internal error fails open (exit 0, empty stdout).

const ENFORCE_REASONS = {
  E1: 'COW E1: tracked source edits are not allowed during read-only diagnosis.',
  E2: "COW E2: target is outside the current unit's allowed path boundary.",
  E3: 'COW E3: implementation has no valid current-unit path boundary.',
  E4: 'COW E4: the active investigator role is read-only.',
  E5: 'COW E5: production implementation requires an approved executable plan.',
  E6: 'COW E6: workflow agents may not create Git commits.',
  E7: 'COW E7: broad staging is prohibited for a controlled unit.',
};
const COW_AGENTS = ['cow-repo-investigator', 'cow-debug-investigator', 'cow-implementer', 'cow-reviewer'];
const INVESTIGATORS = ['cow-repo-investigator', 'cow-debug-investigator'];
const ENFORCE_RANK = { none: 0, ask: 1, deny: 2 };

// A "simple" command is a single, unambiguous command line that is safe to
// tokenize. Compound/redirect/substitution/env-prefix/nested-shell/multiline
// shapes are NOT enforced (fail open) to keep false positives at zero.
function isSimpleCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') return false;
  if (/[\r\n]/.test(cmd)) return false;                 // multiline
  if (/[&|;`$<>]/.test(cmd)) return false;              // compound / redirect / substitution
  const tokens = cmd.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) return false; // env-prefixed
  const exe = tokens[0].toLowerCase();
  if (['bash', 'sh', 'zsh', 'dash'].includes(exe) && tokens.includes('-c')) return false; // nested shell
  return true;
}

function handlePreToolUseEnforce(root, p, c, payload) {
  try {
    const s = c.state;
    const mode = s.mode;
    const phase = s.phase;
    const toolName = payload.tool_name || '';
    const toolInput = payload.tool_input || {};
    let agentType = payload.agent_type || payload.agent_id || '';
    if (toolName === 'Agent') {
      agentType = toolInput.subagent_type || agentType;
    }

    const isEditWrite = ['Edit', 'Write'].includes(toolName);
    let relPath = '';
    if (isEditWrite) {
      const rawPath = toolInput.file_path || toolInput.path || '';
      relPath = normalizePath(root, rawPath);
    }

    // Each match: { code, decision, kind, value }. Strongest decision wins;
    // ties keep the first-evaluated match as the deciding reasonCode.
    const matches = [];
    const addMatch = (code, decision, kind, value) => {
      matches.push({ code, decision, kind, value });
    };

    const allowed = (s.currentUnit && s.currentUnit.allowedPaths) || [];
    // E5 "executable approved plan": plan.status is approved/executing/done AND
    // plan.path is a non-empty string. No plan contents are read (no broad IO).
    const planPath = s.plan && typeof s.plan.path === 'string' ? s.plan.path : '';
    const hasExecutableApprovedPlan = ['approved', 'executing', 'done'].includes(s.plan.status)
      && planPath.length > 0;

    if (isEditWrite && !isScratch(relPath)) {
      // E1: tracked Edit/Write during diagnosis-readonly, outside COW workspace.
      if (phase === 'diagnosis-readonly' && isGitTracked(root, relPath)) {
        addMatch('E1', mode === 'production' ? 'deny' : 'ask', 'path', relPath);
      }
      // E2: Edit/Write outside current unit allowedPaths during implementing.
      if (phase === 'implementing' && allowed.length > 0 && !isUnderAllowed(relPath, allowed)) {
        addMatch('E2', mode === 'production' ? 'deny' : 'ask', 'path', relPath);
      }
      // E3: Edit/Write during implementing with no/invalid current-unit boundary.
      if (phase === 'implementing' && allowed.length === 0) {
        addMatch('E3', mode === 'production' ? 'deny' : 'ask', 'path', relPath);
      }
      // E4: repo/debug investigator attempts Edit/Write outside COW workspace.
      if (INVESTIGATORS.includes(agentType)) {
        addMatch('E4', 'deny', 'agent', agentType);
      }
      // E5: production Edit/Write on planned-sequential/delegated-batch without
      // an executable approved plan (standard mode: none -> not enforced).
      if (mode === 'production'
        && (s.implementationRoute === 'planned-sequential' || s.implementationRoute === 'delegated-batch')
        && !hasExecutableApprovedPlan) {
        addMatch('E5', 'deny', 'path', relPath);
      }
    }

    // E6 / E7: Bash rules (simple commands only).
    if (toolName === 'Bash') {
      const command = toolInput.command || '';
      if (isSimpleCommand(command)) {
        const tokens = command.trim().split(/\s+/).filter(Boolean);
        const exe = tokens[0] ? tokens[0].toLowerCase() : '';
        if (exe === 'git' && tokens[1]) {
          const sub = tokens[1].toLowerCase();
          // E6: structured COW agent + simple git commit.
          if (sub === 'commit' && COW_AGENTS.includes(agentType)) {
            addMatch('E6', 'deny', 'bash', 'git-commit');
          }
          // E7: broad staging during a controlled unit (implementing).
          if (phase === 'implementing') {
            const isBroad = (sub === 'add' && (tokens.includes('.') || tokens.includes('-A') || tokens.includes('--all')))
              || (sub === 'commit' && tokens.includes('-a'));
            if (isBroad) {
              addMatch('E7', mode === 'production' ? 'deny' : 'ask', 'bash',
                sub === 'add' ? 'git-add-broad' : 'git-commit-a');
            }
          }
        }
      }
    }

    // No match -> fail open.
    if (matches.length === 0) {
      process.exit(0);
    }

    let winner = matches[0];
    for (const m of matches) {
      if (ENFORCE_RANK[m.decision] > ENFORCE_RANK[winner.decision]) winner = m;
    }

    const actualDecision = winner.decision;
    const reasonCode = winner.code;
    const reason = ENFORCE_REASONS[reasonCode];
    const matchedRuleIds = matches.map((m) => m.code);

    // Bounded observation: actualDecision + reasonCode (shadow stays field-free).
    // subjectValue carries a bounded label, never a full command or prompt.
    let subjectValue = winner.value;
    if (typeof subjectValue === 'string') {
      const buf = Buffer.from(subjectValue, 'utf8');
      if (buf.length > 256) subjectValue = buf.subarray(0, 256).toString('utf8');
    }

    logObservation(
      p,
      'pre-tool-use',
      'ACTIVE_VALID',
      mode,
      phase,
      toolName,
      matchedRuleIds,
      actualDecision,
      winner.kind,
      subjectValue,
      null,
      actualDecision,
      reasonCode
    );

    // Emit only ask/deny; build the full string before writing so an error
    // between decision selection and output never produces partial stdout.
    const out = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: actualDecision,
        permissionDecisionReason: reason,
      }
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    process.exit(0);
  } catch (e) {
    // Internal error / uncertainty -> fail open.
    process.exit(0);
  }
}

function handlePreCompact(root, p, c, payload) {
  const s = c.state;
  let trigger = 'unknown';
  if (payload.trigger === 'manual' || payload.trigger === 'auto') {
    trigger = payload.trigger;
  } else if (payload.type === 'manual' || payload.type === 'auto') {
    trigger = payload.type;
  }

  logObservation(
    p,
    'pre-compact',
    'ACTIVE_VALID',
    s.mode,
    s.phase,
    null,
    [],
    'none',
    'compact-trigger',
    trigger,
    null
  );
  process.exit(0);
}

function main() {
  const args = process.argv.slice(2);
  let command = '';
  let decisionMode = 'shadow';
  for (const a of args) {
    if (a.startsWith('--decision-mode=')) {
      if (a.slice('--decision-mode='.length) === 'enforce') decisionMode = 'enforce';
      // any other value (or repeated) keeps the default shadow
    } else if (!a.startsWith('-') && !command) {
      command = a;
    }
  }
  if (!command || ['help', '--help', '-h'].includes(command) || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(USAGE + '\n');
    process.exit(command && command !== '' ? 0 : 1);
  }

  const root = getRoot();
  const p = paths(root);
  const c = classify(p);


  // Read stdin
  let stdin = '';
  try {
    stdin = fs.readFileSync(0, 'utf8');
  } catch (e) {
    // Ignore and proceed with empty stdin
  }

  let payload = {};
  if (stdin.trim()) {
    try {
      payload = JSON.parse(stdin);
    } catch (e) {
      // Malformed JSON is ignored, fail-open
    }
  }

  // State class specific behaviors. These fail open regardless of decision
  // mode: missing/inactive/corrupt state never produces a block.
  if (c.kind === 'ABSENT' || c.kind === 'INACTIVE') {
    // R7 and R9: exit 0, empty stdout, no observation
    process.exit(0);
  }

  if (c.kind === 'ACTIVE_CORRUPT') {
    // R8: exit 0, empty stdout for PreToolUse and PreCompact, no context for SessionStart, log R8 observation
    logObservation(
      p,
      command === 'session-start' ? 'session-start' : (command === 'pre-compact' ? 'pre-compact' : 'pre-tool-use'),
      'ACTIVE_CORRUPT',
      null, null, null,
      ['R8'],
      'none',
      'none',
      null,
      'STATE_CORRUPT'
    );
    process.exit(0);
  }

  // ACTIVE_VALID state. SessionStart and PreCompact ignore the decision mode.
  if (command === 'session-start') {
    handleSessionStart(root, p, c, payload);
  } else if (command === 'pre-tool-use') {
    if (decisionMode === 'enforce') {
      handlePreToolUseEnforce(root, p, c, payload);
    } else {
      handlePreToolUseShadow(root, p, c, payload);
    }
  } else if (command === 'pre-compact') {
    handlePreCompact(root, p, c, payload);
  } else {
    process.exit(0);
  }
}

main();

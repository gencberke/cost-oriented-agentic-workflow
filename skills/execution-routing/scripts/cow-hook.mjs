#!/usr/bin/env node
// cow-hook — deterministic hook-enforcement script for the
// cost-oriented-agentic-workflow control plane (0.5.0, Phase 4).
//
// Zero deps. Exits 0, fails open on missing/inactive/corrupt state.
// Shadow mode: evaluates rules R1-R9, logs decisions, returns no blocks.
// SessionStart (R10): injects the lean COW_RESUME_POINTER_V1 context pointer.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import {
  paths, classify, oneline
} from './cow-state-core.mjs';

const USAGE = `cow-hook — workflow hook evaluator (Node + git, zero deps)
Usage: node cow-hook.mjs <session-start|pre-tool-use|pre-compact>`;

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

function logObservation(p, event, stateClass, mode, phase, toolName, matchedRuleIds, wouldBeDecision, subjectKind, subjectValue, errorCode) {
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
      actualDecision: 'none',
      subjectKind: subjectKind || 'none',
      subjectValue: subjectValue || null,
      errorCode: errorCode || null
    };

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

function handlePreToolUse(root, p, c, payload) {
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
  const [, , command] = process.argv;
  if (!command || ['help', '--help', '-h'].includes(command)) {
    process.stdout.write(USAGE + '\n');
    process.exit(command ? 0 : 1);
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

  // State class specific behaviors
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

  // ACTIVE_VALID state
  if (command === 'session-start') {
    handleSessionStart(root, p, c, payload);
  } else if (command === 'pre-tool-use') {
    handlePreToolUse(root, p, c, payload);
  } else if (command === 'pre-compact') {
    handlePreCompact(root, p, c, payload);
  } else {
    process.exit(0);
  }
}

main();

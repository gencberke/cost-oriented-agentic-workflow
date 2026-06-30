#!/usr/bin/env node
// cow-state — deterministic workflow control-state helper for the
// cost-oriented-agentic-workflow control plane (0.5.0, Phase 1 foundation).
//
// Owns the state schema, validation, transition rules, reading, and ATOMIC
// writing of `<worktree-root>/.cost-oriented-agentic-workflow/run/state.json`.
// The model never edits that JSON by hand — it calls these subcommands.
//
// State is a VALIDATED PROJECTION and coordination cache. It is never more
// authoritative than Git, the approved plan, or the progress ledger; it is
// reconstructable from them (`init --reconstruct`). It records OBSERVABLE
// control position only — enums, paths, SHAs, counters — never reasoning,
// diffs, file contents, env values, secrets, or logs.
//
// Node standard library + git only. Zero runtime dependencies. Cross-platform
// (Windows is a first-class target). Invoke as:
//   node <plugin>/skills/execution-routing/scripts/cow-state.mjs <command> [flags]

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

import {
  SCHEMA_VERSION, MODES, PHASES, PROCESS_LANES, PROFILE_STATUS,
  DISCOVERY_ROUTES, IMPLEMENTATION_ROUTES, RISKS, ROOTCAUSE_STATUS,
  PLAN_STATUS, VERIFY_STATUS, REVIEW_STATUS, REVIEW_SCOPE_STATE,
  SUB_REVIEW_STATUS, FINDING_ID_RE, COMMIT_POLICIES, BLOCK_CODES,
  isInt, inEnum, stripBom, paths, defaultState, validateState, classify, oneline
} from './cow-state-core.mjs';

const hasOpenReviewWork = (s) => {
  const openStatuses = ['in-progress', 'findings-open'];
  return (s.review.pendingBlockingFindingIds && s.review.pendingBlockingFindingIds.length > 0)
    || openStatuses.includes(s.review.status)
    || openStatuses.includes(s.review.targetedRereviewStatus)
    || openStatuses.includes(s.review.wholeWorkReviewStatus);
};

const TRANSITIONS = {
  idle: ['triage'],
  triage: ['diagnosis-readonly', 'planning', 'implementing', 'idle'],
  'diagnosis-readonly': ['triage', 'diagnosis-elevated', 'planning', 'implementing'],
  'diagnosis-elevated': ['planning', 'implementing', 'triage'],
  planning: ['implementing', 'triage'],
  implementing: ['reviewing', 'verifying', 'triage'],
  reviewing: ['verifying', 'implementing'],
  verifying: ['finishing', 'idle', 'triage', 'implementing'],
  finishing: ['idle', 'triage'],
  blocked: [], // resume is validated against priorPhase, below
};

const die = (msg, code = 1) => { process.stderr.write(`cow-state: ERROR: ${msg}\n`); process.exit(code); };

function requireGit() {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); }
  catch { die('git is required but was not found on PATH.'); }
}

function git(args, { cwd = process.cwd(), allowFail = false } = {}) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 }).replace(/\r?\n$/, ''); }
  catch (e) { if (allowFail) return null; throw e; }
}

function worktreeRoot() {
  const top = git(['rev-parse', '--show-toplevel'], { allowFail: true });
  if (!top) die('not inside a git worktree (could not resolve --show-toplevel).');
  return path.resolve(top);
}

function ensureRunDir(root) {
  const dir = path.join(root, '.cost-oriented-agentic-workflow', 'run');
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n');
  return dir;
}

function safeRepoPath(root, value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label}: a non-empty path is required`);
  }
  const raw = value.trim();
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('/') || raw.startsWith('\\')) {
    throw new Error(`${label}: absolute paths are rejected ("${raw}")`);
  }
  const parts = raw.split(/[\\/]+/);
  if (parts.some((p) => p === '..')) {
    throw new Error(`${label}: path traversal ("..") is rejected ("${raw}")`);
  }
  const rel = parts.filter((p) => p !== '.' && p !== '').join('/');
  if (rel === '') throw new Error(`${label}: empty path after normalization ("${raw}")`);
  const resolved = path.resolve(root, rel);
  const within = path.relative(root, resolved);
  if (within === '' || within.startsWith('..') || path.isAbsolute(within)) {
    throw new Error(`${label}: path resolves outside the worktree ("${raw}")`);
  }
  return rel;
}

// Read a usable active/inactive state or fail clearly (never overwrite corrupt).
function requireReadableState(p) {
  const c = classify(p);
  if (c.kind === 'ACTIVE_CORRUPT') die(`corrupt workflow state — ${c.reason}. Not modified. Run "init --reconstruct" to rebuild from git/plan/ledger.`, 3);
  if (c.kind === 'ABSENT') die('no workflow state (run "init" first).', 2);
  return c.state;
}

// ── Atomic write (§6.6): validate → tmp+fsync → rename; never partial ────────
function writeStateAtomic(root, p, next) {
  const errs = validateState(next);
  if (errs.length) die(`refusing to write invalid state: ${errs.join('; ')}`);
  ensureRunDir(root);
  const tmp = path.join(p.dir, `state.json.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  const body = JSON.stringify(next, null, 2) + '\n';
  let fd;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeFileSync(fd, body);
    try { fs.fsyncSync(fd); } catch { /* fsync best-effort */ }
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(tmp, p.state);
  } catch (err) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* ignore */ } }
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
    die(`atomic write failed (live state.json untouched): ${err.message}`);
  }
  // Keep the active marker in sync with an active workflow.
  if (next.active) { try { if (!fs.existsSync(p.marker)) fs.writeFileSync(p.marker, next.timestamps.createdAt + '\n'); } catch { /* ignore */ } }
}

const nowISO = () => new Date().toISOString();
function stamp(s) { s.timestamps.updatedAt = nowISO(); return s; }

// ── Reconstruction (§4.2 / 04 A.4): rebuild from anchor + ledger + git ───────
function parseAnchor(progressText) {
  const out = {};
  const grab = (key) => {
    const m = progressText.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
    return m ? m[1].trim() : '';
  };
  out.planFile = grab('PLAN_FILE');
  out.mode = grab('MODE');
  out.commitPolicy = grab('COMMIT_POLICY');
  out.baseBranch = grab('BASE_BRANCH');
  out.mergeBaseSha = grab('MERGE_BASE_SHA');
  return out;
}

function reconstruct(root, p) {
  const now = nowISO();
  const s = defaultState(now);
  let ledger = '';
  if (fs.existsSync(p.progress)) { try { ledger = fs.readFileSync(p.progress, 'utf8'); } catch { ledger = ''; } }
  const anchor = ledger ? parseAnchor(ledger) : {};

  if (inEnum(anchor.mode, MODES)) s.mode = anchor.mode;
  if (inEnum(anchor.commitPolicy, COMMIT_POLICIES)) s.commitPolicy = anchor.commitPolicy;
  if (anchor.baseBranch) s.baseBranch = anchor.baseBranch;
  if (anchor.mergeBaseSha && anchor.mergeBaseSha !== '') s.mergeBaseSha = anchor.mergeBaseSha;
  if (anchor.planFile) { try { s.plan.path = safeRepoPath(root, anchor.planFile, 'plan.path'); } catch { s.plan.path = null; } }

  // Unit lines and exhausted-budget evidence from the ledger.
  const unitLines = ledger.split(/\r?\n/).filter((l) => /^Unit\s+\S+\s*\|/.test(l));
  const exhausted = /waves=2/.test(ledger) && /blocked/i.test(ledger);

  if (exhausted) {
    s.phase = 'blocked';
    s.blocked = { code: 'remediation-exhausted', artifactPath: null, priorPhase: 'reviewing' };
    s.remediationWaves.count = 2;
    s.plan.status = s.plan.path ? 'executing' : 'none';
  } else if (unitLines.length > 0) {
    s.phase = 'implementing';
    s.plan.status = s.plan.path ? 'executing' : 'none';
  } else if (s.plan.path) {
    s.phase = 'planning';
    s.plan.status = 'approved';
  } else {
    s.phase = 'triage';
  }
  return stamp(s);
}

// ── Argument parsing (compact, scriptable; no arbitrary JSON patching) ───────
function parseFlags(argv, spec) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) die(`unexpected argument: ${a}`);
    const key = a.slice(2);
    if (spec.bool && spec.bool.includes(key)) { flags[key] = true; continue; }
    if (spec.value && spec.value.includes(key)) {
      const v = argv[++i];
      if (v === undefined) die(`flag --${key} requires a value`);
      flags[key] = v; continue;
    }
    die(`unknown flag: --${key}`);
  }
  return flags;
}

// Output ───────────────────────────────────────────────────────────────────

function emit(c, fmt, ok = true) {
  if (fmt === 'json') {
    const payload = c.state ? c.state : { schemaVersion: SCHEMA_VERSION, classification: c.kind, reason: c.reason || null };
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else if (fmt === 'oneline') {
    process.stdout.write(oneline(c) + '\n');
  } else {
    process.stdout.write(oneline(c) + '\n');
  }
  return ok;
}

function detectFmt(flags) { return flags.json ? 'json' : flags.oneline ? 'oneline' : 'human'; }

// ── Commands ──────────────────────────────────────────────────────────────────
function cmdInit(root, p, argv) {
  const flags = parseFlags(argv, {
    bool: ['reconstruct', 'json', 'oneline'],
    value: ['mode', 'commit-policy', 'base-branch', 'merge-base', 'plan'],
  });
  const fmt = detectFmt(flags);
  const existing = classify(p);

  if (flags.reconstruct) {
    // Explicit, non-silent rebuild. Preserve any corrupt evidence first.
    if (existing.kind === 'ACTIVE_CORRUPT' && fs.existsSync(p.state)) {
      const backup = `${p.state}.corrupt-${Date.now()}`;
      try { fs.renameSync(p.state, backup); } catch { /* keep going; reconstruct will overwrite */ }
    }
    const s = reconstruct(root, p);
    writeStateAtomic(root, p, s);
    return emit({ kind: 'ACTIVE_VALID', state: s }, fmt);
  }

  if (existing.kind === 'ACTIVE_VALID') die('a workflow is already active. Use "status", or "init --reconstruct" to rebuild, or "complete" first.', 2);
  if (existing.kind === 'ACTIVE_CORRUPT') die(`refusing to overwrite corrupt state — ${existing.reason}. Use "init --reconstruct" (preserves evidence).`, 3);

  const now = nowISO();
  const s = defaultState(now);
  if (flags.mode !== undefined) { if (!inEnum(flags.mode, MODES)) die(`invalid --mode: ${flags.mode}`); s.mode = flags.mode; }
  if (flags['commit-policy'] !== undefined) { if (!inEnum(flags['commit-policy'], COMMIT_POLICIES)) die(`invalid --commit-policy: ${flags['commit-policy']}`); s.commitPolicy = flags['commit-policy']; }
  if (flags['base-branch'] !== undefined) s.baseBranch = flags['base-branch'];
  if (flags['merge-base'] !== undefined) s.mergeBaseSha = flags['merge-base'];
  if (flags.plan !== undefined) { s.plan.path = safeRepoPath(root, flags.plan, 'plan'); s.plan.status = 'approved'; }
  writeStateAtomic(root, p, s);
  return emit({ kind: 'ACTIVE_VALID', state: s }, fmt);
}

function cmdStatus(root, p, argv) {
  const flags = parseFlags(argv, { bool: ['json', 'oneline'], value: [] });
  const fmt = detectFmt(flags);
  const c = classify(p);
  if (c.kind === 'ACTIVE_CORRUPT') {
    if (fmt === 'json') process.stdout.write(JSON.stringify({ classification: 'ACTIVE_CORRUPT', reason: c.reason }, null, 2) + '\n');
    else process.stderr.write(oneline(c) + '\n');
    process.exit(3);
  }
  emit(c, fmt); // ABSENT / INACTIVE / ACTIVE_VALID all succeed (exit 0)
}

function mutate(root, p, fn, fmt) {
  const s = requireReadableState(p);
  if (!s.active) die('workflow is inactive; run "init" to start a new run.', 2);
  fn(s);
  stamp(s);
  writeStateAtomic(root, p, s);
  return emit({ kind: 'ACTIVE_VALID', state: s }, fmt);
}

function cmdTransition(root, p, argv) {
  const flags = parseFlags(argv, { bool: ['reroute', 'json', 'oneline'], value: ['phase', 'lane'] });
  const fmt = detectFmt(flags);
  const target = flags.phase;
  if (!target) die('transition requires --phase <phase>');
  if (!inEnum(target, PHASES)) die(`invalid --phase: ${target}`);
  if (target === 'blocked') die('use "block --reason <code>" to enter the blocked phase.');
  if (flags.lane !== undefined && !inEnum(flags.lane, PROCESS_LANES)) die(`invalid --lane: ${flags.lane}`);
  return mutate(root, p, (s) => {
    const from = s.phase;
    if (from === 'blocked') {
      const allowed = [s.blocked.priorPhase, 'triage'].filter(Boolean);
      if (!allowed.includes(target)) die(`from blocked, only resume to ${allowed.join(' or ')} is allowed (got ${target}).`);
      s.blocked = { code: null, artifactPath: null, priorPhase: null };
    } else {
      const allowed = TRANSITIONS[from] || [];
      if (!allowed.includes(target)) die(`illegal transition: ${from} -> ${target}.`);
    }
    if (flags.reroute && !(from === 'diagnosis-readonly' && target === 'triage')) {
      die('--reroute is only valid for diagnosis-readonly -> triage.');
    }
    if (target === 'implementing') {
      if (s.processLane === 'debug' && s.rootCause.status !== 'evidenced') {
        die('cannot enter implementing in a debug lane until rootCause.status is "evidenced".');
      }
      if (['planned-sequential', 'delegated-batch'].includes(s.implementationRoute)
          && !['approved', 'executing'].includes(s.plan.status)) {
        die(`cannot enter implementing on a ${s.implementationRoute} route until plan.status is approved/executing.`);
      }
    }
    if (from === 'reviewing' && target === 'verifying') {
      if (hasOpenReviewWork(s)) {
        die('cannot leave review for verification while open review work or pending blocking findings remain.', 2);
      }
    }
    // Lane: explicit --lane wins; otherwise entering diagnosis implies the debug
    // lane (04 A.3). Lanes are never silently cleared.
    if (flags.lane !== undefined) s.processLane = flags.lane;
    else if (target === 'diagnosis-readonly' || target === 'diagnosis-elevated') s.processLane = 'debug';
    s.phase = target;
  }, fmt);
}

function cmdRoute(root, p, argv) {
  const flags = parseFlags(argv, { bool: ['json', 'oneline'], value: ['discovery', 'implementation'] });
  const fmt = detectFmt(flags);
  if (flags.discovery === undefined && flags.implementation === undefined) die('route requires --discovery V or --implementation V');
  return mutate(root, p, (s) => {
    const d = flags.discovery !== undefined ? flags.discovery : s.discoveryRoute;
    const i = flags.implementation !== undefined ? flags.implementation : s.implementationRoute;
    if (flags.discovery !== undefined && !inEnum(flags.discovery, DISCOVERY_ROUTES)) die(`invalid --discovery: ${flags.discovery}`);
    if (flags.implementation !== undefined && !inEnum(flags.implementation, IMPLEMENTATION_ROUTES)) die(`invalid --implementation: ${flags.implementation}`);
    if (d === 'parallel-investigators' && i === 'inline') {
      die('invalid route combination: parallel-investigators discovery cannot resolve to a single inline unit (02 B.4).');
    }
    if (flags.discovery !== undefined) s.discoveryRoute = flags.discovery;
    if (flags.implementation !== undefined) s.implementationRoute = flags.implementation;
  }, fmt);
}

// Record the repository-profile result. Updates ONLY repositoryProfile.* — the
// profile helper (repo-profile.mjs) is authoritative for validity; state records it.
function cmdProfile(root, p, argv) {
  const flags = parseFlags(argv, { bool: ['json', 'oneline'], value: ['status', 'snapshot', 'profile', 'fingerprint'] });
  const fmt = detectFmt(flags);
  if (!flags.status) die(`profile requires --status <${PROFILE_STATUS.join('|')}>`);
  if (!inEnum(flags.status, PROFILE_STATUS)) die(`invalid --status: ${flags.status}`);
  return mutate(root, p, (s) => {
    s.repositoryProfile.status = flags.status;
    if (flags.snapshot !== undefined) s.repositoryProfile.snapshotPath = safeRepoPath(root, flags.snapshot, 'snapshot');
    if (flags.profile !== undefined) s.repositoryProfile.profilePath = safeRepoPath(root, flags.profile, 'profile');
    if (flags.fingerprint !== undefined) s.repositoryProfile.fingerprint = flags.fingerprint;
    s.repositoryProfile.updatedAt = nowISO();
  }, fmt);
}

function cmdRootCause(root, p, argv) {
  const flags = parseFlags(argv, { bool: ['json', 'oneline'], value: ['status', 'report'] });
  const fmt = detectFmt(flags);
  if (!flags.status) die('root-cause requires --status <none|investigating|evidenced|failed>');
  if (!inEnum(flags.status, ROOTCAUSE_STATUS)) die(`invalid --status: ${flags.status}`);
  return mutate(root, p, (s) => {
    s.rootCause.status = flags.status;
    if (flags.report !== undefined) s.rootCause.reportPath = safeRepoPath(root, flags.report, 'report');
  }, fmt);
}

function cmdPlan(root, p, argv) {
  const flags = parseFlags(argv, { bool: ['start', 'approve', 'done', 'json', 'oneline'], value: ['path'] });
  const fmt = detectFmt(flags);
  const acts = ['start', 'approve', 'done'].filter((a) => flags[a]);
  if (acts.length !== 1) die('plan requires exactly one of --start | --approve | --done');
  return mutate(root, p, (s) => {
    if (flags.path !== undefined) s.plan.path = safeRepoPath(root, flags.path, 'path');
    if (flags.start) s.plan.status = 'drafting';
    else if (flags.approve) s.plan.status = 'approved';
    else if (flags.done) s.plan.status = 'done';
  }, fmt);
}

function cmdUnit(root, p, argv) {
  const flags = parseFlags(argv, { bool: ['json', 'oneline'], value: ['id', 'paths', 'base', 'brief', 'report', 'commit', 'baseline', 'attempt', 'accepted-attempt'] });
  const fmt = detectFmt(flags);
  if (flags.id === undefined) die('unit requires --id N');
  return mutate(root, p, (s) => {
    s.currentUnit.id = flags.id;
    if (flags.paths !== undefined) {
      const list = flags.paths.split(',').map((x) => x.trim()).filter(Boolean);
      s.currentUnit.allowedPaths = list.map((x) => safeRepoPath(root, x, 'paths'));
    }
    if (flags.base !== undefined) s.currentUnit.base = flags.base;
    // Brief/report/baseline are repo-relative artifact paths (the run workspace);
    // the commit SHA is recorded only after the controller commits the unit.
    if (flags.brief !== undefined) s.currentUnit.briefPath = safeRepoPath(root, flags.brief, 'brief');
    if (flags.report !== undefined) s.currentUnit.reportPath = safeRepoPath(root, flags.report, 'report');
    if (flags.baseline !== undefined) s.currentUnit.baselinePath = safeRepoPath(root, flags.baseline, 'baseline');
    if (flags.attempt !== undefined) {
      const n = Number(flags.attempt);
      if (!Number.isInteger(n) || n < 1 || n > 3) die('--attempt must be an integer in 1..3');
      s.currentUnit.currentAttempt = n;
    }
    if (flags['accepted-attempt'] !== undefined) {
      const n = Number(flags['accepted-attempt']);
      if (!Number.isInteger(n) || n < 1 || n > 3) die('--accepted-attempt must be an integer in 1..3');
      if (s.currentUnit.currentAttempt != null && n > s.currentUnit.currentAttempt) die('--accepted-attempt cannot exceed currentAttempt');
      s.currentUnit.acceptedAttempt = n;
    }
    if (flags.commit !== undefined) {
      if (flags.commit.trim() === '') die('--commit requires a non-empty SHA');
      s.currentUnit.commitSha = flags.commit.trim();
    }
    if (s.plan.status === 'approved') s.plan.status = 'executing';
  }, fmt);
}

function cmdVerify(root, p, argv) {
  const flags = parseFlags(argv, { bool: ['pending', 'passed', 'failed', 'json', 'oneline'], value: ['cmd'] });
  const fmt = detectFmt(flags);
  const acts = ['pending', 'passed', 'failed'].filter((a) => flags[a]);
  if (acts.length !== 1) die('verify requires exactly one of --pending | --passed | --failed');
  return mutate(root, p, (s) => {
    s.verification.status = acts[0];
    if (flags.cmd !== undefined) s.verification.command = flags.cmd;
  }, fmt);
}

function cmdReview(root, p, argv) {
  const flags = parseFlags(argv, {
    bool: ['start', 'clean', 'findings', 'wave', 'required', 'not-required', 'json', 'oneline'],
    value: ['scope', 'package', 'report', 'accepted-finding-ids', 'pending-blocking', 'targeted', 'whole-work'],
  });
  const fmt = detectFmt(flags);
  const acts = ['start', 'clean', 'findings', 'wave'].filter((a) => flags[a]);
  const setterKeys = ['required', 'not-required', 'scope', 'package', 'report',
    'accepted-finding-ids', 'pending-blocking', 'targeted', 'whole-work'];
  const setters = setterKeys.filter((k) => flags[k] !== undefined);
  if (acts.length > 1) die('review accepts at most one of --start | --clean | --findings | --wave');
  if (acts.length === 0 && setters.length === 0) die('review requires an action (--start|--clean|--findings|--wave) or a field setter');
  if (flags.required && flags['not-required']) die('review: --required and --not-required conflict');
  const idList = (v) => {
    const ids = String(v).split(',').map((x) => x.trim()).filter(Boolean);
    for (const id of ids) if (!FINDING_ID_RE.test(id)) die(`invalid finding id: ${id}`);
    return ids;
  };
  return mutate(root, p, (s) => {
    if (flags.start) { s.review.status = 'in-progress'; s.remediationWaves.count = 0; }
    else if (flags.clean) s.review.status = 'clean';
    else if (flags.findings) s.review.status = 'findings-open';
    else if (flags.wave) {
      if (s.remediationWaves.count >= s.remediationWaves.max) {
        die(`remediation budget exhausted (${s.remediationWaves.count}/${s.remediationWaves.max}). Budget exhausted != approved; "block --reason remediation-exhausted".`, 2);
      }
      s.remediationWaves.count += 1;
    }
    if (flags.required) s.review.required = true;
    if (flags['not-required']) s.review.required = false;
    if (flags.scope !== undefined) { if (!inEnum(flags.scope, REVIEW_SCOPE_STATE)) die(`invalid --scope: ${flags.scope}`); s.review.scope = flags.scope; }
    if (flags.package !== undefined) s.review.packagePath = safeRepoPath(root, flags.package, 'package');
    if (flags.report !== undefined) s.review.reportPath = safeRepoPath(root, flags.report, 'report');
    if (flags['accepted-finding-ids'] !== undefined) s.review.acceptedFindingIds = idList(flags['accepted-finding-ids']);
    if (flags['pending-blocking'] !== undefined) s.review.pendingBlockingFindingIds = idList(flags['pending-blocking']);
    if (flags.targeted !== undefined) { if (!inEnum(flags.targeted, SUB_REVIEW_STATUS)) die(`invalid --targeted: ${flags.targeted}`); s.review.targetedRereviewStatus = flags.targeted; }
    if (flags['whole-work'] !== undefined) { if (!inEnum(flags['whole-work'], SUB_REVIEW_STATUS)) die(`invalid --whole-work: ${flags['whole-work']}`); s.review.wholeWorkReviewStatus = flags['whole-work']; }
    if (s.review.status === 'clean' && s.review.pendingBlockingFindingIds && s.review.pendingBlockingFindingIds.length > 0) {
      die('cannot set review status to clean while pending blocking finding IDs remain.', 2);
    }
  }, fmt);
}

function cmdAttempt(root, p, argv) {
  const flags = parseFlags(argv, { bool: ['inc', 'reset', 'json', 'oneline'], value: [] });
  const fmt = detectFmt(flags);
  const acts = ['inc', 'reset'].filter((a) => flags[a]);
  if (acts.length !== 1) die('attempt requires exactly one of --inc | --reset');
  return mutate(root, p, (s) => {
    if (flags.reset) s.attempts.implementer = 0;
    else {
      if (s.attempts.implementer >= s.attempts.max) {
        die(`retry budget exhausted (${s.attempts.implementer}/${s.attempts.max}). "block --reason retry-exhausted".`, 2);
      }
      s.attempts.implementer += 1;
    }
  }, fmt);
}

function cmdBlock(root, p, argv) {
  const flags = parseFlags(argv, { bool: ['json', 'oneline'], value: ['reason', 'artifact'] });
  const fmt = detectFmt(flags);
  if (!flags.reason) die(`block requires --reason <${BLOCK_CODES.join('|')}>`);
  if (!inEnum(flags.reason, BLOCK_CODES)) die(`invalid --reason: ${flags.reason}`);
  return mutate(root, p, (s) => {
    const prior = s.phase === 'blocked' ? s.blocked.priorPhase : s.phase;
    s.blocked = {
      code: flags.reason,
      artifactPath: flags.artifact !== undefined ? safeRepoPath(root, flags.artifact, 'artifact') : null,
      priorPhase: prior,
    };
    s.phase = 'blocked';
  }, fmt);
}

function cmdComplete(root, p, argv) {
  const flags = parseFlags(argv, { bool: ['json', 'oneline'], value: [] });
  const fmt = detectFmt(flags);
  const s = requireReadableState(p);
  if (!s.active) die('workflow is already inactive.', 2);
  if (s.phase === 'blocked') die('a blocked workflow cannot be completed; resume and finish, or re-init.', 2);
  if (hasOpenReviewWork(s)) {
    die('cannot complete workflow while open review work or pending blocking findings remain.', 2);
  }
  s.active = false;
  s.phase = 'idle';
  stamp(s);
  writeStateAtomic(root, p, s);
  try { if (fs.existsSync(p.marker)) fs.unlinkSync(p.marker); } catch { /* ignore */ }
  return emit({ kind: 'INACTIVE', state: s }, fmt);
}

const USAGE = `cow-state — workflow control-state helper (Node + git, zero deps)

Usage: node cow-state.mjs <command> [flags]   ([--json|--oneline] on every command)

  init [--reconstruct] [--mode M] [--commit-policy P] [--base-branch B]
       [--merge-base SHA] [--plan PATH]   create or rebuild state
  status                                  print position (ABSENT/INACTIVE ok; corrupt -> exit 3)
  transition --phase X [--reroute]        move phase (guards enforced)
  route --discovery V | --implementation V  record a route choice
  profile --status V [--snapshot P] [--profile P] [--fingerprint F]  record repo-profile result
  root-cause --status V [--report PATH]   record diagnosis status
  plan --start|--approve|--done [--path PATH]
  unit --id N [--paths a,b] [--base SHA] [--brief P] [--report P] [--commit SHA]
       [--baseline P] [--attempt 1..3] [--accepted-attempt 1..3]
                                          open/advance a unit + its artifacts
  verify --pending|--passed|--failed [--cmd C]
  review --start|--clean|--findings|--wave   (+ field setters below)
         [--required|--not-required] [--scope S] [--package P] [--report P]
         [--accepted-finding-ids a,b] [--pending-blocking a,b]
         [--targeted V] [--whole-work V]      record review-control-plane state
  attempt --inc|--reset                   implementer retry counter (max 2)
  block --reason <code> [--artifact PATH]
  complete                                end the workflow cleanly

State: <worktree-root>/.cost-oriented-agentic-workflow/run/state.json (ignored).
The model never edits that JSON by hand — only these subcommands write it.`;

function main() {
  const [, , command, ...argv] = process.argv;
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(USAGE + '\n');
    process.exit(command ? 0 : 1);
  }
  requireGit();
  const root = worktreeRoot();
  const p = paths(root);
  const handlers = {
    init: cmdInit, status: cmdStatus, transition: cmdTransition, route: cmdRoute,
    profile: cmdProfile, 'root-cause': cmdRootCause, plan: cmdPlan, unit: cmdUnit, verify: cmdVerify,
    review: cmdReview, attempt: cmdAttempt, block: cmdBlock, complete: cmdComplete,
  };
  const h = handlers[command];
  if (!h) { process.stderr.write(`cow-state: unknown command "${command}".\n\n${USAGE}\n`); process.exit(1); }
  h(root, p, argv);
}

main();

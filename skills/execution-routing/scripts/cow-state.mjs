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

const SCHEMA_VERSION = 1;

// ── Enumerations (the only legal values for each field) ─────────────────────
const MODES = ['standard', 'production'];
const PHASES = ['idle', 'triage', 'diagnosis-readonly', 'diagnosis-elevated',
  'planning', 'implementing', 'reviewing', 'verifying', 'finishing', 'blocked'];
const PROCESS_LANES = ['none', 'light-inline', 'brainstorm', 'plan', 'debug'];
const PROFILE_STATUS = ['absent', 'building', 'ready', 'warm', 'stale'];
const DISCOVERY_ROUTES = ['none', 'controller-map', 'investigator', 'parallel-investigators'];
const IMPLEMENTATION_ROUTES = ['none', 'inline', 'delegated', 'planned-sequential', 'delegated-batch'];
const RISKS = ['low', 'elevated', 'high'];
const ROOTCAUSE_STATUS = ['none', 'investigating', 'evidenced', 'failed'];
const PLAN_STATUS = ['none', 'drafting', 'approved', 'executing', 'done'];
const VERIFY_STATUS = ['none', 'pending', 'passed', 'failed'];
const REVIEW_STATUS = ['none', 'required', 'in-progress', 'clean', 'findings-open'];
// Phase 3B.2: the review scope and the per-scope sub-statuses (whole-work +
// targeted re-review tracked separately from the current unit review.status).
const REVIEW_SCOPE_STATE = ['none', 'UNIT_REVIEW', 'TARGETED_REREVIEW', 'WHOLE_WORK_REVIEW'];
const SUB_REVIEW_STATUS = ['none', 'in-progress', 'clean', 'findings-open'];
const FINDING_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const COMMIT_POLICIES = ['controller-per-unit', 'implementer', 'user-owned', 'none'];
const BLOCK_CODES = ['retry-exhausted', 'remediation-exhausted', 'plan-conflict',
  'ambiguous', 'needs-credential', 'baseline-failed', 'human-checkpoint'];

// Legal phase transitions (active workflow only). `block` and `complete` are
// separate commands, not generic transitions.
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

// ── Process / git plumbing ──────────────────────────────────────────────────
const die = (msg, code = 1) => { process.stderr.write(`cow-state: ERROR: ${msg}\n`); process.exit(code); };

function requireGit() {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); }
  catch { die('git is required but was not found on PATH.'); }
}

function git(args, { cwd = process.cwd(), allowFail = false } = {}) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 }).replace(/\r?\n$/, ''); }
  catch (e) { if (allowFail) return null; throw e; }
}

// Resolve the current worktree root (per-checkout; linked worktrees differ).
function worktreeRoot() {
  const top = git(['rev-parse', '--show-toplevel'], { allowFail: true });
  if (!top) die('not inside a git worktree (could not resolve --show-toplevel).');
  return path.resolve(top);
}

// Ensure the self-ignored, per-worktree run directory, matching cow-workspace.
function ensureRunDir(root) {
  const dir = path.join(root, '.cost-oriented-agentic-workflow', 'run');
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n');
  return dir;
}

function paths(root) {
  const dir = path.join(root, '.cost-oriented-agentic-workflow', 'run');
  return {
    dir,
    state: path.join(dir, 'state.json'),
    marker: path.join(dir, 'state.active'),
    progress: path.join(dir, 'progress.md'),
  };
}

// ── Path safety (§6.3): repo-relative, forward-slash, no escapes ─────────────
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
  // Must resolve inside the worktree.
  const resolved = path.resolve(root, rel);
  const within = path.relative(root, resolved);
  if (within === '' || within.startsWith('..') || path.isAbsolute(within)) {
    throw new Error(`${label}: path resolves outside the worktree ("${raw}")`);
  }
  return rel;
}

// ── Default state + validation ───────────────────────────────────────────────
function defaultState(now) {
  return {
    schemaVersion: SCHEMA_VERSION,
    active: true,
    mode: 'standard',
    phase: 'triage',
    processLane: 'none',
    repositoryProfile: { status: 'absent', fingerprint: null, snapshotPath: null, profilePath: null, updatedAt: null },
    discoveryRoute: 'none',
    implementationRoute: 'none',
    risk: 'low',
    rootCause: { status: 'none', reportPath: null },
    plan: { status: 'none', path: null },
    currentUnit: { id: null, allowedPaths: [], base: null, briefPath: null, reportPath: null, commitSha: null, baselinePath: null, currentAttempt: null, acceptedAttempt: null },
    verification: { status: 'none', command: null },
    review: {
      status: 'none', required: false, scope: 'none',
      packagePath: null, reportPath: null,
      acceptedFindingIds: [], pendingBlockingFindingIds: [],
      targetedRereviewStatus: 'none', wholeWorkReviewStatus: 'none',
    },
    attempts: { implementer: 0, max: 2 },
    remediationWaves: { count: 0, max: 2 },
    baseBranch: null,
    mergeBaseSha: null,
    commitPolicy: 'controller-per-unit',
    blocked: { code: null, artifactPath: null, priorPhase: null },
    timestamps: { createdAt: now, updatedAt: now },
  };
}

const isInt = (n) => Number.isInteger(n);
const inEnum = (v, set) => set.includes(v);

// Validate a complete state object. Returns an array of error strings (empty = ok).
function validateState(s) {
  const e = [];
  if (!s || typeof s !== 'object') return ['state is not an object'];
  if (s.schemaVersion !== SCHEMA_VERSION) e.push(`schemaVersion must be ${SCHEMA_VERSION} (got ${JSON.stringify(s.schemaVersion)})`);
  if (typeof s.active !== 'boolean') e.push('active must be boolean');
  if (!inEnum(s.mode, MODES)) e.push(`mode invalid: ${JSON.stringify(s.mode)}`);
  if (!inEnum(s.phase, PHASES)) e.push(`phase invalid: ${JSON.stringify(s.phase)}`);
  if (!inEnum(s.processLane, PROCESS_LANES)) e.push(`processLane invalid: ${JSON.stringify(s.processLane)}`);
  if (!s.repositoryProfile || !inEnum(s.repositoryProfile.status, PROFILE_STATUS)) e.push('repositoryProfile.status invalid');
  else {
    for (const k of ['snapshotPath', 'profilePath', 'updatedAt']) {
      if (s.repositoryProfile[k] != null && typeof s.repositoryProfile[k] !== 'string') e.push(`repositoryProfile.${k} must be a string or null`);
    }
  }
  if (!inEnum(s.discoveryRoute, DISCOVERY_ROUTES)) e.push(`discoveryRoute invalid: ${JSON.stringify(s.discoveryRoute)}`);
  if (!inEnum(s.implementationRoute, IMPLEMENTATION_ROUTES)) e.push(`implementationRoute invalid: ${JSON.stringify(s.implementationRoute)}`);
  if (!inEnum(s.risk, RISKS)) e.push(`risk invalid: ${JSON.stringify(s.risk)}`);
  if (!s.rootCause || !inEnum(s.rootCause.status, ROOTCAUSE_STATUS)) e.push('rootCause.status invalid');
  if (!s.plan || !inEnum(s.plan.status, PLAN_STATUS)) e.push('plan.status invalid');
  if (!s.verification || !inEnum(s.verification.status, VERIFY_STATUS)) e.push('verification.status invalid');
  if (!s.review || !inEnum(s.review.status, REVIEW_STATUS)) e.push('review.status invalid');
  else {
    if (typeof s.review.required !== 'boolean') e.push('review.required must be boolean');
    if (!inEnum(s.review.scope, REVIEW_SCOPE_STATE)) e.push(`review.scope invalid: ${JSON.stringify(s.review.scope)}`);
    if (!inEnum(s.review.targetedRereviewStatus, SUB_REVIEW_STATUS)) e.push('review.targetedRereviewStatus invalid');
    if (!inEnum(s.review.wholeWorkReviewStatus, SUB_REVIEW_STATUS)) e.push('review.wholeWorkReviewStatus invalid');
    for (const k of ['packagePath', 'reportPath']) {
      if (s.review[k] != null && typeof s.review[k] !== 'string') e.push(`review.${k} must be a string or null`);
    }
    for (const k of ['acceptedFindingIds', 'pendingBlockingFindingIds']) {
      if (!Array.isArray(s.review[k])) e.push(`review.${k} must be an array`);
      else if (!s.review[k].every((id) => typeof id === 'string' && FINDING_ID_RE.test(id))) e.push(`review.${k} entries must be finding ids`);
    }
  }
  if (!inEnum(s.commitPolicy, COMMIT_POLICIES)) e.push(`commitPolicy invalid: ${JSON.stringify(s.commitPolicy)}`);
  if (!s.currentUnit || !Array.isArray(s.currentUnit.allowedPaths)) e.push('currentUnit.allowedPaths must be an array');
  else {
    for (const k of ['briefPath', 'reportPath', 'commitSha', 'baselinePath']) {
      if (s.currentUnit[k] != null && typeof s.currentUnit[k] !== 'string') e.push(`currentUnit.${k} must be a string or null`);
    }
    const ca = s.currentUnit.currentAttempt; const aa = s.currentUnit.acceptedAttempt;
    if (ca != null && (!isInt(ca) || ca < 1 || ca > 3)) e.push('currentUnit.currentAttempt must be an integer in 1..3 or null');
    if (aa != null && (!isInt(aa) || aa < 1 || aa > 3)) e.push('currentUnit.acceptedAttempt must be an integer in 1..3 or null');
    if (aa != null && ca != null && aa > ca) e.push('currentUnit.acceptedAttempt cannot exceed currentAttempt');
    if (aa != null && ca == null) e.push('currentUnit.acceptedAttempt requires a currentAttempt');
  }
  if (!s.attempts || !isInt(s.attempts.implementer) || !isInt(s.attempts.max) || s.attempts.implementer < 0 || s.attempts.max < 0) {
    e.push('attempts counters must be non-negative integers');
  } else if (s.attempts.implementer > s.attempts.max) e.push('attempts.implementer exceeds attempts.max');
  if (!s.remediationWaves || !isInt(s.remediationWaves.count) || !isInt(s.remediationWaves.max)
      || s.remediationWaves.count < 0 || s.remediationWaves.max < 0) {
    e.push('remediationWaves counters must be non-negative integers');
  } else if (s.remediationWaves.count > s.remediationWaves.max) e.push('remediationWaves.count exceeds remediationWaves.max');
  if (!s.blocked || (s.blocked.code !== null && !inEnum(s.blocked.code, BLOCK_CODES))) e.push('blocked.code invalid');
  if (!s.timestamps || typeof s.timestamps.createdAt !== 'string' || typeof s.timestamps.updatedAt !== 'string') {
    e.push('timestamps.createdAt/updatedAt must be ISO strings');
  }
  return e;
}

// ── Classification (§4.2): ABSENT | INACTIVE | ACTIVE_VALID | ACTIVE_CORRUPT ──
function classify(p) {
  const stateExists = fs.existsSync(p.state);
  const markerExists = fs.existsSync(p.marker);
  if (!stateExists) {
    return markerExists
      ? { kind: 'ACTIVE_CORRUPT', reason: 'active marker present but state.json is missing' }
      : { kind: 'ABSENT', reason: 'no workflow state in this worktree' };
  }
  let raw;
  try { raw = fs.readFileSync(p.state, 'utf8'); }
  catch (err) { return { kind: 'ACTIVE_CORRUPT', reason: `state.json unreadable: ${err.message}` }; }
  let parsed;
  try { parsed = JSON.parse(raw.replace(/^\uFEFF/, '')); } // tolerate a leading UTF-8 BOM
  catch { return { kind: 'ACTIVE_CORRUPT', reason: 'state.json is not valid JSON' }; }
  const errs = validateState(parsed);
  if (errs.length) return { kind: 'ACTIVE_CORRUPT', reason: `state.json failed schema validation: ${errs[0]}` };
  return { kind: parsed.active ? 'ACTIVE_VALID' : 'INACTIVE', state: parsed };
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

// ── Output ───────────────────────────────────────────────────────────────────
function oneline(c) {
  if (c.kind === 'ABSENT') return 'cow-state: absent';
  if (c.kind === 'ACTIVE_CORRUPT') return `cow-state: corrupt (${c.reason})`;
  const s = c.state;
  if (c.kind === 'INACTIVE') return `cow-state: inactive mode=${s.mode}`;
  const u = s.currentUnit.id == null ? '-' : s.currentUnit.id;
  return `cow-state: active mode=${s.mode} phase=${s.phase} lane=${s.processLane} `
    + `discovery=${s.discoveryRoute} impl=${s.implementationRoute} risk=${s.risk} `
    + `unit=${u} attempts=${s.attempts.implementer}/${s.attempts.max} `
    + `waves=${s.remediationWaves.count}/${s.remediationWaves.max} `
    + `review=${s.review.status}/${s.review.scope} whole-work=${s.review.wholeWorkReviewStatus}`;
}

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
    if (from === 'reviewing' && target === 'verifying' && s.review.status === 'findings-open') {
      die('cannot leave review for verification while review.status is "findings-open".');
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

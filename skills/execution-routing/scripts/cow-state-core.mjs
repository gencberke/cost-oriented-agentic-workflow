// Core workflow state validation, schema, and path helpers (Strategy A)
// Shared by cow-state.mjs and cow-hook.mjs. Zero dependencies.

import fs from 'fs';
import path from 'path';

export const SCHEMA_VERSION = 1;

// ── Enumerations (the only legal values for each field) ─────────────────────
export const MODES = ['standard', 'production'];
export const PHASES = ['idle', 'triage', 'diagnosis-readonly', 'diagnosis-elevated',
  'planning', 'implementing', 'reviewing', 'verifying', 'finishing', 'blocked'];
export const PROCESS_LANES = ['none', 'light-inline', 'brainstorm', 'plan', 'debug'];
export const PROFILE_STATUS = ['absent', 'building', 'ready', 'warm', 'stale'];
export const DISCOVERY_ROUTES = ['none', 'controller-map', 'investigator', 'parallel-investigators'];
export const IMPLEMENTATION_ROUTES = ['none', 'inline', 'delegated', 'planned-sequential', 'delegated-batch'];
export const RISKS = ['low', 'elevated', 'high'];
export const ROOTCAUSE_STATUS = ['none', 'investigating', 'evidenced', 'failed'];
export const PLAN_STATUS = ['none', 'drafting', 'approved', 'executing', 'done'];
export const VERIFY_STATUS = ['none', 'pending', 'passed', 'failed'];
export const REVIEW_STATUS = ['none', 'required', 'in-progress', 'clean', 'findings-open'];
export const REVIEW_SCOPE_STATE = ['none', 'UNIT_REVIEW', 'TARGETED_REREVIEW', 'WHOLE_WORK_REVIEW'];
export const SUB_REVIEW_STATUS = ['none', 'in-progress', 'clean', 'findings-open'];
export const FINDING_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
export const COMMIT_POLICIES = ['controller-per-unit', 'implementer', 'user-owned', 'none'];
export const BLOCK_CODES = ['retry-exhausted', 'remediation-exhausted', 'plan-conflict',
  'ambiguous', 'needs-credential', 'baseline-failed', 'human-checkpoint'];

export const isInt = (n) => Number.isInteger(n);
export const inEnum = (v, set) => set.includes(v);
export const stripBom = (s) => (s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s);

export function paths(root) {
  const dir = path.join(root, '.cost-oriented-agentic-workflow', 'run');
  return {
    dir,
    state: path.join(dir, 'state.json'),
    marker: path.join(dir, 'state.active'),
    progress: path.join(dir, 'progress.md'),
  };
}

export function defaultState(now) {
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

export function validateState(s) {
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

export function classify(p) {
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

export function oneline(c) {
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

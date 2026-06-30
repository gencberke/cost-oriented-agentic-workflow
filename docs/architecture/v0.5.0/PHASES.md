# v0.5.0 Phase Ledger And Roadmap

The version stays `0.4.2` until Phase 7. Each phase must preserve user work,
runtime zero dependencies, the review matrix, and controller-owned state/commit
authority.

Status terms:

- `source-present`: the implementation is present in this working tree.
- `static-verified`: deterministic tests or structure checks cover the contract.
- `behavioral-evidence-required`: live model behavior must be reported separately
  before a release claim.
- `planned`: not implemented or not activated yet.

## Delivered Or Source-Present Phases

### Phase 1: State And Repository Intake

- Status: source-present, static-verified by the foundation tests.
- Evidence: `cow-state.mjs`, repository snapshot/profile helpers, state and
  intake fixtures.
- Deferred behavior: none for the deterministic substrate; live routing depends
  on later phases.

### Phase 2: Plugin Agents

- Status: source-present, static-verified by agent contract tests.
- Evidence: four `agents/cow-*.md` files and exact scoped dispatch fixtures.
- Deferred behavior: generated runtime package does not yet ship top-level
  `agents/**`; release packaging waits for Phase 7.

### Phase 3A: Discovery Control Plane

- Status: source-present; live behavior evidence is reported separately from
  fixture/schema tests.
- Evidence: repository readiness, warm/stale profile handling, controller-map
  budgets, investigator dispatch fixtures, and discovery stream analyzer.
- Deferred behavior: Phase 6 repeats and cost calibration.

### Phase 3B.1: Implementation Control Plane

- Status: source-present; deterministic report/analyzer tests cover the static
  contract.
- Evidence: implementation routing references, validated implementation report
  helper, and implementation stream analyzer.
- Deferred behavior: Phase 6 behavioral/cost sampling.

### Phase 3B.1.1: Unit Ownership And Attempt Evidence

- Status: source-present, static-verified by unit ownership tests.
- Evidence: per-unit baselines, dirty-overlap protection, immutable
  attempt-qualified reports, and baseline-relative compare behavior.
- Deferred behavior: hook enforcement of ownership rules waits for Phase 5.

### Phase 3B.2: Review Control Plane

- Status: source-present and structurally integrated; behavioral acceptance must
  remain separate from static claims.
- Evidence: scoped reviewer contracts, review package/report helpers, causality
  classification, targeted re-review fixtures, whole-work review support, and
  review stream analyzer.
- Deferred behavior: live smoke conclusions and Phase 6 repeat sampling.

### Phase 4: Shadow Hooks And Lean Resume

- Status: source-present, static-verified by `npm run test:hooks`.
- Evidence: `cow-state-core.mjs`, `cow-hook.mjs`, direct hook examples, lean
  `COW_RESUME_POINTER_V1` SessionStart context, PreToolUse observation,
  PreCompact observation, bounded hook logs, and hook tests.
- Deferred behavior: no active `hooks/hooks.json`, no ASK/DENY enforcement, no
  runtime-package activation.

## Remaining Roadmap

### Phase 5: Selective Enforcement

- Status: planned.
- Goal: promote only zero-false-positive binary hook rules to `ASK` or `DENY`.
- Acceptance: no-op when inactive/missing/corrupt state, active hook packaged
  intentionally, benign-command false positives remain zero.

### Phase 6: Behavioral, Token, And Cost Evaluation

- Status: planned.
- Goal: run full route-only and full-path dogfood, collect stream evidence,
  measure controller/subagent/cache token behavior, and tune numeric budgets only
  from recorded evidence.

### Phase 7: Release Candidate And v0.5.0

- Status: planned.
- Goal: bump versions together, update changelog and release docs, finalize
  runtime package allowlist, include agents and active hooks only if their gates
  are green, run full release verification, and produce the v0.5.0 artifact.

## Deferred Or Rejected

- Persistent agent memory.
- Automatic agent teams.
- Automatic worktree isolation as a default.
- Broad hook shell parsing.
- Headroom or other external dependency as a baseline requirement.
- Lossy transformation of structured evidence.


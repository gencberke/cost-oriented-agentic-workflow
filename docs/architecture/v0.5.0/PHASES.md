# v0.5.0 Phase Ledger And Roadmap

The version stays `0.4.2` through Phase 7A release-candidate preparation. The
final `0.5.0` bump happens only after deferred live evidence gates are accepted.
Each phase must preserve user work, runtime zero dependencies, the review
matrix, and controller-owned state/commit authority.

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
- Release-candidate package behavior: Phase 7A runtime packaging includes all
  four `agents/**` definitions.

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

### Phase 5A: Selective Enforcement (Static)

- Status: source-present, static-verified by `npm run test:enforcement` plus
  `npm run test:hooks` (shadow preserved byte-identically). Live ASK/DENY
  behavior is reported separately and deferred to Phase 6.
- Evidence: `--decision-mode=enforce` PreToolUse path in `cow-hook.mjs`
  (default stays shadow; only the exact value `enforce` enables enforcement),
  E1–E7 zero-false-positive binary rules, `isSimpleCommand` guard, additive
  observation `actualDecision`/`reasonCode` fields, `tests/hook-enforcement.test.mjs`
  (130 checks), a benign fixture corpus under
  `tests/fixtures/hook-enforcement/`, an inactive
  `hooks/hooks.enforcement.json.example`, and structural checks in
  `validate-structure.mjs`.
- Enforced rules: E1 tracked edit during read-only diagnosis; E2 edit outside
  the current unit's `allowedPaths`; E3 edit during implementing with no unit
  boundary; E4 investigator read-only write; E5 production edit on
  planned-sequential/delegated-batch without an approved plan; E6 structured
  COW agent `git commit`; E7 broad staging (`git add .`/`-A`/`--all`/`commit -a`)
  during a controlled unit. Standard/production decisions follow the phase
  matrix; E8 destructive git and judgment rules stay shadow-only.
- Fail-open invariants preserved: no match, uncertainty, internal error, and
  absent/inactive/corrupt state all exit 0 with empty stdout. Enforcement may
  emit only `ask` or `deny` (never `allow`/`defer`/`updatedInput`); no exit 2.
- Deferred behavior: no active `hooks/hooks.json` is created; runtime
  activation of enforcement is deferred to Phase 6. The shadow example is
  unchanged. State schema version, agents, routing, review matrix, runtime
  packaging, and package version are unchanged.

## Remaining Roadmap

### Phase 6: Behavioral, Token, And Cost Evaluation

- Status: harness-ready, static-verified by `npm run test:phase6`. Live evidence
  is partial/deferred — the deterministic harness, run-schema validator,
  aggregator, F1–F5 fixtures, and Phase 6H experiment spec are present; no live
  Claude runs were executed in this pass.
- Goal: run full route-only and full-path dogfood, collect stream evidence,
  measure controller/subagent/cache token behavior, tune numeric budgets only
  from recorded evidence, and accept (or reject) live ASK/DENY enforcement
  behavior before any active enforcement `hooks.json` ships.
- Evidence so far: `tests/eval/phase6/validate-run.mjs` (run-schema validator),
  `aggregate-runs.mjs` (matched-condition comparison + outlier + Markdown),
  F1–F5 fixture manifests, `tests/phase6.test.mjs` (171 checks), and the Phase
  6H optional Headroom experiment specification.
- Deferred behavior: live runs (F1 VANILLA/COW_SHADOW, F4 ask/deny minimum
  matrix; F2/F3/F5 when budget allows), threshold decisions in
  `docs/DECISIONS.md` (only after evidence), and any active enforcement hook
  activation.

### Phase 7A: Release Candidate Repository Preparation

- Status: source-present after Phase 7A implementation; final release remains
  blocked by live evidence.
- Evidence: runtime package allowlist includes plugin metadata, commands,
  skills, all four agents, inactive hook examples, README, and license;
  candidate/final release gates are distinct; final versioning is dry-run only;
  release handoff lives at [`../../RELEASE_0.5.0.md`](../../RELEASE_0.5.0.md).
- Deferred behavior: final `0.5.0` version bump, active enforcement hook
  activation, tag/publish/release creation, and live-evidence acceptance.

### Phase 7B: Final v0.5.0 Release

- Status: planned.
- Goal: accept live evidence, run final release validation, bump versions
  together, rebuild/inspect the runtime package, and only then decide whether to
  tag, push, publish, or install.


## Deferred Or Rejected

- Persistent agent memory.
- Automatic agent teams.
- Automatic worktree isolation as a default.
- Broad hook shell parsing.
- Headroom or other external dependency as a baseline requirement.
- Lossy transformation of structured evidence.

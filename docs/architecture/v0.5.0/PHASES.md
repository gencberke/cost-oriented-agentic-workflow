# PHASES — 0.5.0 Implementation Sequence

Seven phases, dependency-ordered so each consumes only prior artifacts (no circular
dependencies — `10` #10). Each phase is one branch increment with its own commit
boundary, deterministic gate, and rollback point. The version stays **0.4.2** until
Phase 7 bumps it. Constraints in `09` hold throughout (zero runtime deps, clean
packaging, light path, review matrix, controller-per-unit, no secrets/CoT in state).

Global prerequisite: this Phase-0 doc set committed on `feat/v0.5.0-control-plane`.

---

## Phase 1 — State & repository-intake foundation

- **Objective:** Land the deterministic substrate: `cow-state` + `state.json`
  schema, and `repository-intake` + `repo-snapshot.mjs` + profile. No routing,
  agents, or hooks yet.
- **Likely files:** `skills/execution-routing/scripts/cow-state.mjs`;
  `skills/repository-intake/SKILL.md` + `scripts/repo-snapshot.mjs`;
  `tests/state.test.mjs` + `tests/repo-intake.test.mjs` (new zero-dep Node suites,
  run via `test:foundation`); `tests/validate-structure.mjs` (+prose-budget split
  for the on-demand skill, +runtime-path check); `docs/architecture/v0.5.0/*`.
- **Allowed scope:** new helper + new skill + tests + their docs.
- **Prohibited scope:** editing routing skills' behavior, launchers, agents, hooks,
  version, runtime allowlist (beyond what `skills/**` already covers), review matrix.
- **Prerequisites:** Phase 0.
- **Tasks:** implement `cow-state` subcommands (`04` A.8) with atomic write +
  schema validation + `--reconstruct`; implement `repo-snapshot.mjs` (`02` A.6)
  with field allowlist + size caps + fingerprint; write `repository-intake/SKILL.md`
  (triggers, warm/skip, stale, failure).
- **Tests (L1,L2):** schema checks; temp-repo behavioral tests — init/transition/
  reconstruct/corruption(non-zero, no overwrite)/atomic-write; snapshot determinism
  + dirty-tree + size caps + no-secrets.
- **Acceptance gate:** L1+L2 green; `cow-state` never writes prose; snapshot
  re-run byte-identical (modulo timestamp); reconstruct rebuilds from anchor+ledger.
- **Rollback point:** revert the commits; 0.4.2 behavior is untouched (new files only).
- **Commit boundary:** two commits — `feat: add workflow state foundation` then
  `feat: add repository intake foundation` (state lands first; intake depends on the
  shared workspace convention). See `PHASE-1-HANDOFF.md`.
- **Artifacts for next phase:** `state.json` schema + helper; snapshot + profile
  contract; `PHASE-1-HANDOFF.md`.

## Phase 2 — Plugin agents

- **Objective:** Add `agents/` with the four cost-pinned agents (`03`); wire the
  runtime builder to package `agents/**`.
- **Likely files:** `agents/cow-repo-investigator.md`, `cow-debug-investigator.md`,
  `cow-implementer.md`, `cow-reviewer.md`; `scripts/build-runtime-package.mjs`
  (allowlist +`agents/**`); `tests/agents/*` (L4); `tests/release-artifact.test.sh`
  (+agents present); `tests/validate-structure.mjs` (+agent frontmatter checks).
- **Allowed scope:** agent files; runtime allowlist for `agents/**`; agent-contract
  tests. Agents may *reference* `cow-state`/intake but skills don't dispatch them yet.
- **Prohibited scope:** changing routing-skill behavior to auto-dispatch agents;
  hooks; version; review matrix; `memory`/`isolation` fields (must be absent).
- **Prerequisites:** Phase 1 (agents' bodies reference state/workspace).
- **Tasks:** author agent bodies (role contracts migrated from implementer/reviewer
  prompts — `06` SPLIT); set `model/effort/maxTurns/tools/disallowedTools`; exclude
  `Skill` where required; omit `memory`/`isolation`.
- **Tests (L4,L8):** frontmatter present & valid; `memory`/`isolation` absent;
  investigators exclude `Edit/Write/Skill`; runtime package contains `agents/**`,
  no dev leak.
- **Acceptance gate:** L1+L4+L8 green; `claude plugin validate . --strict` passes
  with agents present.
- **Rollback point:** revert; agents are inert until Phase 3 dispatches them.
- **Commit boundary:** `feat: add cost-pinned plugin agents`.
- **Artifacts for next phase:** four agents callable by automatic delegation.

## Phase 3 — Dual-routing integration

- **Objective:** Make the skills use the dual axis (`02` B) and dispatch the agents;
  record routes/units/root-cause via `cow-state`. This is the behavioral core.
- **Likely files (MODIFY):** `using-cost-oriented-workflow`, `systematic-debugging`,
  `execution-routing`, `dispatching-parallel-agents`, `preparing-subagent-prompts`,
  `requesting-review`; SPLIT of the two prompt templates into agent references.
- **Allowed scope:** routing prose + receipts + `cow-state` calls + agent dispatch;
  keep runtime prose ≤ 86,000 bytes (existing budget).
- **Prohibited scope:** hooks; version; review matrix; retry/remediation budgets;
  light-path removal.
- **Prerequisites:** Phases 1–2.
- **Tasks:** wire discovery vs implementation routing, receipts→`cow-state`,
  diagnosis phase, re-route on tracked edit, repository-intake warm/skip, agent
  dispatch with file handoffs; preserve light-inline + risk-overrides-cost.
- **Tests (L1,L5):** structural invariants (extend the 0.4.1 route guards); route-
  only fixtures incl. the new dual-routing scenarios (`05`).
- **Acceptance gate:** L1 green + L5 blockers pass 3 fresh runs each; prose budget
  respected; light path + matrix unchanged.
- **Rollback point:** revert to Phase-2 tag (agents inert again).
- **Commit boundary:** `feat: integrate dual routing and agent dispatch`.
- **Artifacts for next phase:** state reliably reflects live phase/route/unit.

## Phase 4 — Shadow hooks & resume

- **Objective:** Add hooks in **shadow/observe** mode (all `defer`, log decisions)
  and the lean SessionStart/PostCompact injection; prove resume.
- **Likely files:** `hooks/hooks.json.example` (+PreToolUse/PreCompact, shadow);
  `hooks/` decision script(s) (Node, via `run-hook.cmd`); `hooks/session-start`
  (lean injection + `cow-state status --oneline`); `tests/hooks/*` (L3).
- **Allowed scope:** hooks in shadow only; SessionStart injection; hook-decision
  tests.
- **Prohibited scope:** any `deny`/`ask` (enforcement) yet; version; routing
  behavior; review matrix; shipping an active `hooks/hooks.json`.
- **Prerequisites:** Phases 1–3 (hooks read state).
- **Tasks:** implement the decision script reading stdin + `state.json` (`04` B);
  all rules return `defer` + append to `hook-observations.log`; implement lean
  injection + reconstruct-on-resume.
- **Tests (L3,L5):** stdin+state fixtures → expected *shadow* decision (`defer`) and
  correct *would-be* decision logged; resume-after-new-session and
  compact-during-diagnosis scenarios.
- **Acceptance gate:** L3 green; zero behavior change confirmed (shadow); resume
  reconstructs state; FP observations collected.
- **Rollback point:** revert; remove the example hook entries.
- **Commit boundary:** `feat: add shadow hooks and lean resume injection`.
- **Artifacts for next phase:** measured false-positive data per rule.

## Phase 5 — Selective enforcement

- **Objective:** Promote zero-FP rules to `ASK`/`DENY` (standard), then the
  production column; ship an **active** `hooks/hooks.json` that no-ops when inactive.
- **Likely files:** `hooks/hooks.json` (new, active); decision script (enforce
  branch); `scripts/build-runtime-package.mjs` (+`hooks/hooks.json` to allowlist);
  `tests/hooks/*`, `tests/release-artifact.test.sh`.
- **Allowed scope:** promote only rules with 0 FP (`05`); per-rule standard vs
  production behavior; runtime allowlist for the active hook.
- **Prohibited scope:** enforcing R5 as DENY; broad shell parsing; version; review
  matrix; any rule not in `04` B.1.
- **Prerequisites:** Phase 4 shadow data.
- **Tasks:** flip calibrated rules to enforce; gate production rules on
  `mode=production`; ensure inactive/missing/malformed state ⇒ `defer`; add the
  active hook to the runtime package.
- **Tests (L3,L8):** decision fixtures for allow/deny/ask/defer incl. inactive +
  malformed + benign-Bash false-positive; package contains active hook; no-op-when-
  inactive verified.
- **Acceptance gate:** L1–L4+L8 green; FP rate 0 on the benign set; enforced
  scenarios (`tracked-diagnostic-harness`, `investigator-source-write`,
  `edit-outside-allowed-paths`) deny correctly; inactive workflow untouched.
- **Rollback point:** set hooks back to shadow (single matrix flag); or revert.
- **Commit boundary:** `feat: enable selective hook enforcement`.
- **Artifacts for next phase:** enforced control plane ready for full dogfood.

## Phase 6 — Behavioral / cost eval & tuning

- **Objective:** Run the full route-only + full-path dogfood and the token/cost
  acceptance; calibrate numeric budgets (`maxTurns`, controller-read ceilings,
  parallel caps) from measured evidence.
- **Likely files:** `tests/eval/**` (fixtures, analyzer config), `docs/DOGFOOD.md`
  (extend protocol), `docs/DECISIONS.md` (dated measured results); agent `maxTurns`
  tuning only if evidence-justified.
- **Allowed scope:** eval fixtures, dogfood protocol, measured threshold tuning,
  decision log.
- **Prohibited scope:** new features; review-matrix/budget changes without a
  separately approved decision; version bump.
- **Prerequisites:** Phases 1–5.
- **Tasks:** execute L5/L6/L7 across all `05` scenarios; record token budgets per
  scenario; tune only with measured runs; document accepted thresholds.
- **Tests (L5,L6,L7):** blockers 3×; controls ≥1×; token budgets met; standard vs
  production behavior confirmed; no regression in light path.
- **Acceptance gate:** behavioral acceptance gate met; measured budgets recorded;
  any threshold change has a dated DECISIONS entry.
- **Rollback point:** revert tuning commit; behavior reverts to Phase-5 defaults.
- **Commit boundary:** `test: behavioral and cost acceptance for control plane`.
- **Artifacts for next phase:** green behavioral gate + recorded budgets.

## Phase 7 — Release candidate & v0.5.0

- **Objective:** Final docs, version bump, runtime package, release.
- **Likely files:** `.claude-plugin/plugin.json`, `marketplace.json`,
  `package.json` (→ `0.5.0`); `CHANGELOG.md`; `README.md`; `docs/HANDOFF.md`;
  `docs/DECISIONS.md`.
- **Allowed scope:** version bump (all three together), changelog/docs, final
  runtime build + verification.
- **Prohibited scope:** new behavior; touching the review matrix; pushing/merging
  unless asked.
- **Prerequisites:** Phases 1–6 all green.
- **Tasks:** bump versions; CHANGELOG `0.5.0` (control plane: state, intake, agents,
  dual routing, selective hooks, evals); update HANDOFF/DECISIONS; build & validate
  the runtime package (now incl. `agents/**` + active `hooks/hooks.json`).
- **Tests (all L1–L8):** full deterministic gate + `verify:all` + `runtime:build` +
  `test:release`; strict validate.
- **Acceptance gate:** every gate green; runtime package contains the full control
  plane and no dev leak; versions agree at `0.5.0`.
- **Rollback point:** the release commit is isolated; revert restores 0.4.2-behavior
  RC.
- **Commit boundary:** `chore: release cost-oriented workflow v0.5.0`.
- **Artifacts:** shipped `0.5.0`.

---

## Dependency graph (acyclic)

```text
Phase 0 (docs)
   └─► Phase 1 (state + intake)
          └─► Phase 2 (agents)
                 └─► Phase 3 (dual routing uses state+agents)
                        └─► Phase 4 (shadow hooks read state)
                               └─► Phase 5 (enforce, using Phase-4 FP data)
                                      └─► Phase 6 (eval/tune the enforced plane)
                                             └─► Phase 7 (release)
```

Each arrow is a strict prerequisite; nothing later feeds an earlier phase. Hooks
(4/5) depend on state (1) and routing (3) but neither depends on hooks, so the
control plane is functional (just unenforced) even if 4/5 are deferred.

# Phase 3A.1 Handoff — Discovery Control-Plane Hardening

Status: **discovery control plane hardened.** The three Phase 3A acceptance gaps are
closed: intake-vs-task-discovery dispatches are classified from explicit
`OUTPUT_FORMAT`; the controller-map budget is measured numerically; and the always-on
prose bucket has maintainable headroom. A real readiness-contract gap (Smoke F) was
fixed. Implementation/review agents remain unintegrated. Version stays **0.4.2**.

## Existing-evidence audit (§4)

Every `cow-repo-investigator` dispatch in the Phase 3A streams was classified by its
delegation `OUTPUT_FORMAT` (not by `subagent_type` alone):

| Smoke | Dispatch | Conclusion |
|---|---|---|
| A unknown | `OUTPUT_FORMAT: PROFILE_DRAFT` | correct intake |
| B warm | none | correct warm skip |
| C stale | `OUTPUT_FORMAT: PROFILE_DRAFT` | correct re-intake |
| D bug | `cow-debug-investigator` | DEBUG_DIAGNOSIS |
| E disjoint | 2× `cow-debug-investigator` | DEBUG_DIAGNOSIS; **2 broad queries before dispatch (budget ≤1)** |
| **F dirty** | **`OUTPUT_FORMAT: PROFILE_DRAFT`** | **WRONG — profile regenerated for a VALID-but-dirty repo** |

**Smoke F conclusion:** the controller dispatched `cow-repo-investigator` with
`OUTPUT_FORMAT: PROFILE_DRAFT` — the prompt literally said "producing a repository
profile DRAFT … for the cost-oriented workflow intake." It **regenerated** the
profile rather than using the existing valid one. Evidence:
`.cost-oriented-agentic-workflow/eval/agents/smokeF-dirty-tree.stream.jsonl` (ignored).
This is the §8.1 "fix" branch, not the "just correct the wording" branch.

The audit also surfaced (hidden by Phase 3A's "bounded" wording) that **E and F
exceeded the ≤1 broad-query controller-map budget** (2 each) before dispatch.

## Stream analyzer (§5)

`tests/eval/analyze-discovery-stream.mjs` (Node, zero deps) — dev/eval tooling. Parses
stream-JSONL → stable JSON.

- **Attribution (§5.1):** a tool call is the **controller's** iff its assistant
  message has `parent_tool_use_id == null` **and** no `subagent_type`; otherwise it is
  a subagent's. Empty/attribution-impossible streams fail (`attributionOk:false`).
- **Read categories (§5.2):** `CONTROL_PLANE_READ` (state/snapshot/profile/refs),
  `INSTRUCTION_READ` (CLAUDE.md …), `TARGET_SOURCE_OR_CONFIG_READ`, `BROAD_QUERY`
  (Glob/Grep). Bash helper runs are recorded separately, not as source reads.
- **Purpose (§5.3):** `repo-investigator` + `OUTPUT_FORMAT=PROFILE_DRAFT|TASK_DISCOVERY`
  → that purpose; `cow-debug-investigator` → `DEBUG_DIAGNOSIS`; a repo-investigator
  with no explicit `OUTPUT_FORMAT` → `UNKNOWN` + a violation.
- **Duplicate investigation (§5.4):** flags a re-read of a pre-dispatch target or a
  new broad query after delegation; conservative (reading the report, one adjudication
  read, and helper runs are not flagged).
- Output: `controller{model,toolCalls,sourceReads*,boundedQueries*,controlPlaneReads,
  instructionReads,bashHelperRuns}`, `agents[]`, `receipts`, `statePaths`,
  `profilePaths`, `mutatingActions`, `duplicateInvestigation`, `violations`, `meta`.
- Tests: `tests/discovery-stream.test.mjs` (`npm run test:discovery-stream`), **29**
  checks over synthetic fixtures.

## Controller-map budget (§7) — exact, encoded

`BUDGET = { beforeTargetReads: 3, beforeBroadQueries: 1, afterTargetReads: 1,
afterBroadQueries: 0 }`. Before the first investigator dispatch: ≤3
`TARGET_SOURCE_OR_CONFIG_READ` + ≤1 `BROAD_QUERY`. After delegation: ≤1 targeted
adjudication read, 0 new broad queries unless a visible `Re-route:` explains why.
Control-plane and instruction reads are reported but do **not** consume the
three-source allowance. Over-limit evidence is a violation, not "bounded."

## Warm-profile rule (§8) — runtime fix

The authoritative `repository-readiness.md` now states: **profile validity controls
repository intake; task uncertainty controls task-specific discovery; they are
separate decisions.** `VALID` ⇒ no `PROFILE_DRAFT`; `VALID` + semantic need ⇒
`TASK_DISCOVERY` (fingerprint unchanged); **dirty source alone ⇒ neither stale nor
`PROFILE_DRAFT`** (a warm, dirty repo stays warm). The entry skill carries the
one-line rule; structural invariants in `validate-structure.mjs` enforce both.

## Prose headroom (§11)

- **Before:** 85,995 / 86,000 (5 bytes). **After:** 84,991 / 86,000 (~1,009 bytes
  headroom); the structural gate is now **≤85,000** (86,000 stays the absolute ceiling).
- **Removed duplication from** `using-cost-oriented-workflow/SKILL.md`: the "Positive
  route cues" table → `references/routing-cues.md`; the anchor-header field list (owned
  by writing-plans) condensed; several judgment-call/posture lines tightened.
- **Authoritative references:** `references/routing-cues.md` (route priors),
  `references/repository-readiness.md` (warm rule), `references/discovery-routing.md`.
- **Safety preserved (asserted):** entry keeps Risk classification + Hard exclusions +
  the mandatory readiness ordering; systematic-debugging keeps the root-cause Iron Law
  and the tracked-edit re-route; moved detail remains reachable in references.

## Preload-proof correction (§12)

The originally-requested **zero-tool recall procedure did not pass** — the agent
prioritized its operational diagnosis contract and used tools rather than replying
from context. Preload was instead demonstrated with a random marker present only in
the temporary preloaded skill copy, with **no agent tool accessing the temporary
plugin path** (every tool call hit the throwaway fixture). That is an **equivalent
accessibility proof**, not literal compliance with the zero-tool procedure. The
original procedure is not claimed as passed. `PHASE-3A-HANDOFF.md` is corrected to match.

## Focused live smokes (§10)

Fresh `claude --plugin-dir <repo>` sessions; disposable repos; every stream run
through `analyze-discovery-stream.mjs` (numeric counts, not "bounded"). Evidence
(uncommitted) under `.cost-oriented-agentic-workflow/eval/agents/`.

| Scenario | Profile | Dispatch purpose | Ctrl source reads (before/after) | Broad queries (before/after) | Dup investigation | Result | Evidence |
|---|---|---|---|---|---|---|---|
| 1 warm-trivial | VALID | none | 0 / 0 | 0 / 0 | 0 | warm; no investigator; **0 PROFILE_DRAFT** | `s1-warm-trivial.stream.jsonl` |
| 2 warm-task-discovery | VALID | **TASK_DISCOVERY** (1) | 1 / 0 | 1 / 0 | 0 | **0 PROFILE_DRAFT**; fingerprint unchanged (no regen) | `s2-warm-taskdisc.stream.jsonl` |
| 3 warm-dirty | VALID (dirty) | none | 0 / 0 | 1 / 0 | 0 | **0 PROFILE_DRAFT**; user edits preserved; no reset/clean | `s3-warm-dirty.stream.jsonl` |
| 4 stale | STALE | **PROFILE_DRAFT** (1) | 1 / 0 | 0 / 0 | 0 | exactly one re-intake; new fingerprint accepted | `smokeC-stale-reintake.stream.jsonl` |

All four are **within the controller-map budget** (≤3 target reads + ≤1 broad query
before dispatch; ≤1 adjudication read + 0 broad queries after), with **no violations**
and **no duplicate investigation**. The validity/task-uncertainty separation is
proven live: a VALID profile yields zero PROFILE_DRAFT (1/2/3) while still allowing
TASK_DISCOVERY (2); only STALE re-intakes (4).

**Runtime fix.** The real cause of the Phase 3A "Smoke F regeneration" was a **UTF-8
BOM** on the pre-seeded profile (PowerShell `Set-Content -Encoding utf8`), which made
`JSON.parse` reject it → `INVALID` → the controller *correctly* re-intook. Fix:
`repo-profile.mjs`, `repo-snapshot.mjs`, and `cow-state.mjs` now **strip a leading
BOM** before parsing (real Windows-footgun robustness), covered by
`profile.test.mjs`. With BOM-tolerance, Smoke 3 (warm-dirty) is **0 PROFILE_DRAFT**.
The warm-rule prose hardening + structural invariants remain as the explicit contract.

**Analyzer correction.** `BROAD_QUERY` now counts only Glob/Grep over **task code**
(§5.2); control-plane navigation (locating the profile/snapshot/helpers/agents/
contract) is reported as a control-plane read and does not consume the broad-query
allowance. Before this, the analyzer over-counted (Smoke 2 showed 6 → actually 1).

## Phase 3B readiness

**Discovery is stable enough for Phase 3B implementation/review integration.** The
discovery half is now classified (intake vs task-discovery by `OUTPUT_FORMAT`),
numerically measured (controller-map budget, attribution, duplicate signal), and
verified live across the four focused scenarios with zero violations; the warm
boundary (validity ≠ task-uncertainty; dirty ≠ regeneration) holds in live runs.

Concrete remaining risks for Phase 3B:

- **Budget self-discipline is prose + measurement, not enforcement.** The analyzer
  *detects* over-budget broad queries / post-delegation reinvestigation, but nothing
  *prevents* them at runtime; deterministic enforcement is the later PreToolUse hook
  phase. Phase 3B should keep grading streams with the analyzer, not assume the
  controller is always within budget.
- **Read-only Bash for investigators remains contract-enforced only** (no hook yet).
- **Implementation route is still `pending`/legacy.** Phase 3B lifts it to the dual
  axis (`inline | delegated | planned-sequential | delegated-batch`) and integrates
  `cow-implementer`/`cow-reviewer` **without** reopening discovery routing; the
  mode/risk matrix, retry/remediation ceilings, and commit policy stay unchanged.
- **`repo-profile-agent-output.txt` retention.** When the controller dispatches
  TASK_DISCOVERY it should not overwrite the intake raw-output artifact; Phase 3B
  should pick distinct artifact names per dispatch if it persists task-discovery output.
- **Token budgets are still unmeasured** (controller-map reads, agent `maxTurns`,
  parallel caps) — a later eval/tuning concern.

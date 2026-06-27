# Phase 3B.1 Handoff — Implementation Control Plane

Status: **the implementation half of dual routing is live.** The controller selects
an implementation route, dispatches the exact scoped `cow-implementer` for delegated
work, validates the model-authored report against the **actual git diff**, runs its
own fresh verification, applies the **existing** review gate, and owns the commit.
`cow-reviewer` is **not** integrated; the review matrix and path are unchanged. No
active hooks. Version stays **0.4.2**.

> **Superseded in part by Phase 3B.1.1.** This phase compared the worktree against a
> pinned **base SHA** (`compare-worktree --base UNIT_BASE`). A base SHA alone cannot
> tell a pre-existing dirty USER path apart from unit-owned work. Phase 3B.1.1
> replaces it with a per-unit worktree **baseline** (`unit-worktree.mjs` + the
> preferred `compare-worktree --baseline`), captured before the unit and used to
> compute the unit-owned delta, so only unit-owned changes are ever staged/committed.
> The `--base` interface is retained only for compatibility. See
> `PHASE-3B.1.1-HANDOFF.md`.

## Implementation routes (§6)

`inline | delegated | planned-sequential | delegated-batch`, selected per unit and
**independent** of the discovery route. Selection rules, positive examples, the
receipt format, and the per-unit `UNIT_EXECUTION` tag live in
`skills/execution-routing/references/implementation-routing.md`.

- **inline** — one user-visible outcome, one seam, low risk, mechanically obvious,
  no dependency/config/schema/auth trigger, known verification, controller cost <
  delegation cost. Never dispatches `cow-implementer`. Still requires dirty-tree
  preservation, an allowed-path declaration, fresh verification, the review gate,
  and a controller commit.
- **delegated** — one bounded, non-trivial, self-specifiable unit; one fresh
  `cost-oriented-agentic-workflow:cow-implementer` (never automatic selection).
- **planned-sequential** — two or more independent outcomes; one unit at a time,
  never overlapping writes; a fresh implementer per delegated unit; review/verify/
  commit per unit. Same-file outcomes do not collapse (writing-plans owns the unit
  boundary).
- **delegated-batch** — outcomes tightly coupled by one responsibility, one seam,
  one verification setup, one allowed-path set; one implementer; the controller
  verifies **every outcome separately**. Same-file overlap alone is insufficient.

### Route receipt (§6.1)

```text
Route: lane=<lane>; repository=<warm|intake>; discovery=<route>; implementation=<inline|delegated|planned-sequential|delegated-batch>; risk=<risk>
```

A route-only change on stable code emits `Re-route: reason=stable-code;
implementation=<new-route>`. The recorded discovery route is never overwritten.
Recorded through `cow-state.mjs route --implementation <value>`.

## Report validation (§7)

`skills/execution-routing/scripts/implementation-report.mjs` (Node + git, zero deps).
Compact JSON schema v1 (`status`, `unitId`, `filesChanged`, `outcomes[]`,
`verification[]`, `selfReview`, `remainingRisks`, `attemptsUsed`); strict **8 KB**
ceiling; no chain-of-thought / logs / diffs / secrets (unknown keys rejected).

Commands: `validate <report> [--brief <brief>]`, `inspect`, `render`,
`compare-worktree <report> --base <sha> [--allowed-path <p> ...]`.

- `validate` enforces the schema, safe repo-relative paths (no traversal/absolute),
  unit-id agreement with the brief, every brief outcome present, no duplicate
  outcome ids, no `DONE` over an incomplete outcome, the size ceiling, and a valid
  attempt counter (1..3).
- `compare-worktree` compares reported paths against the REAL git diff (tracked
  `git diff --name-only <base>` ∪ untracked, excluding the workflow workspace) and
  flags `OMITTED_CHANGED_FILE`, `REPORTED_UNCHANGED_FILE`, and `OUTSIDE_ALLOWED_PATH`.
  **The actual git diff is authoritative over `filesChanged`.**
- The helper never modifies source files; a failed report is preserved as evidence;
  `render` emits bounded Markdown only from validated JSON.

Covered by `tests/implementation-report.test.mjs` (28 checks).

## State extensions (§12)

`cow-state.mjs` `currentUnit` gained `briefPath`, `reportPath`, `commitSha` (schema
**v1**, all nullable, safe-path enforced), recorded through the narrow `unit`
command (`--brief`, `--report`, `--commit`). No new mutation surface; the ledger
(`progress.md`) remains the durable chronological record, state a reconstructable
projection. The `implementationRoute` enum and the `route --implementation`,
`unit`, `attempt`, `verify`, `review` commands already existed (Phase 1).

## Implementer dispatch contract (§8)

Dispatch the exact `cost-oriented-agentic-workflow:cow-implementer` (Sonnet, high
effort) with `TASK_BRIEF_PATH, REPORT_PATH, ALLOWED_PATHS, VERIFICATION_COMMANDS,
COMMIT_POLICY=controller, WORKTREE_ROOT, UNIT_ID`. It inspects dirty paths, reads
the brief, edits only allowed paths, runs verification, writes `task-<N>-report.json`,
and returns ≤8 lines (`STATUS, UNIT_ID, REPORT_PATH, FILES_CHANGED_COUNT,
VERIFICATION, BLOCKER`). It never commits, never updates state, never marks the unit
complete, never spawns another agent.

## Verification / commit ordering (§9, §10)

Per delegated unit: pin `UNIT_BASE`; record route+unit+paths+brief+report → generate
brief → dispatch → `validate` → `compare-worktree` → reject unreported/out-of-scope
→ **existing review path** (unchanged mode/risk matrix) → **controller-owned fresh
verification** → commit only after every applicable gate → record `commit=` + the
unit commit SHA → next unit. The controller never accepts agent claims without
artifacts, agent verification in place of its own, zero discovered tests as success,
a restored-clean-tree trick, a pre-final report, or budget exhaustion as approval.

## Attempts vs. remediation waves (§11)

Implementation attempts: initial + at most 2, each a **fresh** invocation with
changed evidence / narrowed scope / corrected brief / different approach — never an
identical re-dispatch. Entirely separate from the review path's two remediation
waves; the counters are never merged and the ceilings are unchanged.

## Prose-budget changes (§5)

Refactored the implementation detail out of `execution-routing/SKILL.md` into three
on-demand references (`implementation-routing.md` ≤4500, `delegated-execution.md`
≤4500, `implementation-report.md` ≤4000); the primary skill keeps the route gate,
the dispatch contract, the validation tripwires, and the review/verify/commit order.

```text
always-on prose: 84,991 -> 84,263  (gate <= 85,000; target <= 84,500 met)
execution-routing/SKILL.md: ~14,540 -> 13,812
```

## Execution stream analyzer (§13)

`tests/eval/analyze-implementation-stream.mjs` (dev/eval tooling). Reports the route
receipt, implementer/reviewer dispatches with declared inputs, controller vs
subagent attribution, agent commit/state/spawn attempts, agent-edited paths vs
`ALLOWED_PATHS`, report paths, verification commands, and violations
(`IMPLEMENTER_ON_INLINE_ROUTE`, `WRONG_AGENT_TYPE`, `MISSING_DISPATCH_FIELDS`,
`AGENT_ATTEMPTED_COMMIT`, `AGENT_INVOKED_COW_STATE`, `AGENT_SPAWNED_AGENT`,
`REPORT_MISSING`, `REPORT_OUTSIDE_WORKSPACE`, `CHANGED_PATH_OUTSIDE_ALLOWED`,
`COMMIT_BEFORE_VALIDATION`, `COMMIT_BEFORE_VERIFICATION`, `COMMIT_BEFORE_REVIEW`,
`OVERLAPPING_PLANNED_UNITS_CONCURRENT`, `ROUTE_RECEIPT_MISSING_OR_INCONSISTENT`).
Covered by `tests/implementation-stream.test.mjs` (31 checks).

**Honoured limits.** Path matching is suffix-aware (real streams carry absolute
edit paths); helper detection is independent of the quoting around the helper path;
a same-unit re-dispatch is a retry, not concurrency; per-task review enforcement is
inferred from the receipt `risk=` (elevated/high); fresh verification is a
test-runner heuristic. We do not claim semantic certainty where the stream is
insufficient (e.g. the real diff is the helper's job, not the analyzer's).

## Focused live smokes (§16)

Fresh `claude --plugin-dir <repo>` sessions; disposable repos; every stream graded
with `analyze-implementation-stream.mjs`. Evidence (uncommitted) under
`.cost-oriented-agentic-workflow/eval/agents/`.

| Scenario | Route | Implementers | Reports | Review path | Verification | Commits | Result | Evidence |
|---|---|---|---|---|---|---|---|---|
| A trivial-inline | inline | 0 | — | standard/low self-review (matrix) | `node test/greet.test.js` pass | 1 (controller) | warm; 0 violations | `s3b1-A-inline.stream.jsonl` |
| B single-delegated | delegated | 1 (sonnet) | `task-1` validated + compared | matrix (standard/low) | `node test/duration.test.js` 3/3 | 1 | agent no commit/state; 0 violations | `s3b1-B-delegated.stream.jsonl` |
| C same-file-sequential | planned-sequential | 2 (fresh each) | `task-1` + `task-2` | matrix per unit | `node test/config.test.js` 3/3 | 2 | sequential; not collapsed; 0 violations | `s3b1-C-sequential.stream.jsonl` |
| D coherent-batch | delegated-batch | 1 | `task-1`, OUTCOME_1/2 | matrix | `node test/api.test.js` 4/4 (each outcome) | 1 | per-outcome verified; 0 violations | `s3b1-D-batch.stream.jsonl` |
| E rejection | adjudication (controlled) | 0 | invalid/omitting report | n/a | `validate` OK, `compare-worktree` **FAIL** | **0** | `OMITTED`+`OUTSIDE_ALLOWED` → no commit, no silent acceptance | `s3b1-E-rejection.stream.jsonl` |
| F retry | delegated | 2 (fresh, same unit) | `task-1` | matrix | attempt 1 **fails** → attempt 2 3/3 | 1 | `attempt --inc`×1, within initial+2; 0 violations | `s3b1-F-retry.stream.jsonl` |

In B/C/D/F the implementer made **zero** commits and **zero** state mutations; the
controller validated each report against the real diff, ran fresh verification, and
owned every commit. E proves the rejection path: an out-of-scope change the report
omitted was caught by `compare-worktree` and **no commit** was made.

## Non-integration confirmation

```text
cow-reviewer was not integrated.
The existing review matrix and review path remain authoritative.
No active hooks were added.
Discovery routing was not redesigned.
The runtime-package builder was not changed.
The package version remains 0.4.2.
```

## Phase 3B.2 readiness — concrete remaining risks

- **Allowed-path and no-commit are validated, not yet hook-enforced.** The
  controller catches an out-of-scope change *after the fact* with `compare-worktree`,
  and the implementer's no-commit/no-state rules are contract + agent-frontmatter
  only. Deterministic prevention is the later PreToolUse hook phase; keep grading
  streams with the analyzer.
- **`cow-reviewer` remains unintegrated.** Phase 3B.2 swaps the legacy reviewer
  dispatch for the scoped `cow-reviewer` **without** changing the mode/risk matrix,
  remediation waves, finding adjudication, or whole-work review. The analyzer
  already records reviewer dispatches and flags whether the scoped reviewer was used.
- **The runtime package still does not ship `agents/`.** A plugin consumer loading
  the built runtime package does not get the cost-pinned agents; that packaging
  decision is unchanged here.
- **Budget/ordering checks are measured, not enforced.** `COMMIT_BEFORE_*`,
  `OVERLAPPING_*`, and review-gate inference are analyzer signals over the stream,
  not runtime guards.
- **Report retention.** A delegated batch reuses one report id with per-outcome
  entries; planned-sequential uses one report per unit. A future task-discovery or
  multi-attempt persist must keep distinct artifact names (the attempt loop reuses
  `task-N-report.json` across attempts by design — only the final state is committed).

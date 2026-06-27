# Phase 3B.1.1 Handoff — Unit Ownership and Attempt Evidence

Status: **unit ownership and attempt evidence are hardened.** A controller commit
can no longer include a pre-existing user change, and retries no longer overwrite
failed-attempt evidence. The base-SHA comparison is superseded by a per-unit
worktree **baseline** that distinguishes pre-existing dirty USER paths from
unit-owned changes. `cow-reviewer` is **not** integrated; the review matrix/path,
implementation routes, and discovery routing are unchanged. No active hooks.
Version stays **0.4.2**.

## The ownership ambiguity this phase fixes

A pinned base SHA cannot tell a pre-existing dirty USER path apart from unit work.
Reproduced before any change: with `compare-worktree --base HEAD --allowed-path src`,
a pre-existing dirty `src/keep.js` the unit never touched appears in `actualChanged`
alongside the unit's file — and `git add src` (or a report that lists it) would
commit the user's edit. A base SHA is insufficient for ownership.

## Unit baseline helper (§5)

`skills/execution-routing/scripts/unit-worktree.mjs` (Node + git, zero deps).
Commands: `capture | inspect | check-overlap | compare | verify-stage`; stable JSON,
non-zero exit on violation. Baseline schema v1: `{ schemaVersion, unitId, head,
branch, allowedPaths, capturedAt, preExisting[] }` where each `preExisting` entry
is `{ path, kind: TRACKED|STAGED|UNTRACKED, worktreeHash, indexObject }` — observable
git/worktree facts only (no source, diffs, logs, secrets). Paths are
repo-relative/forward-slash; traversal and absolute paths are rejected;
BOM-tolerant; atomic baseline writes.

## Dirty classification + ownership rules (§6)

- **Pre-existing dirty outside the allowed set** → preserved, excluded from the
  unit delta, never staged/committed. Modifying it after baseline →
  `PRE_EXISTING_PATH_MODIFIED` (unit fails).
- **Pre-existing dirty inside the allowed set** → `check-overlap` returns
  `BLOCKED_DIRTY_OVERLAP` (exit 1) **before** any edit or dispatch; no hunk-level
  merge. A directory allow-path overlaps every contained dirty path.
- **Unit-owned** = clean/absent at baseline, changed/created after, inside the
  allowed set. Out-of-scope new/changed paths → `OUTSIDE_ALLOWED_PATH`.
- **Deletions/renames** are deterministic (rename into out-of-scope fails; deleting
  a pre-existing dirty path fails).

## Stage + commit boundary (§7)

The controller computes the unit-owned set from the baseline comparison, stages
**only** those exact paths, runs `unit-worktree.mjs verify-stage` (staged set must
equal the unit-owned delta — no pre-existing, no out-of-scope, none missing), and
only then commits. **`git add .` / `git add -A` / `git commit -a` are forbidden**
for a COW unit; if safe partial staging can't be proven, the controller blocks.

## Attempt-qualified evidence (§8) + state (§10)

Artifacts are attempt-qualified and immutable: `task-N-attempt-K-report.json` and
`task-N-attempt-K-return.txt`; a retry never overwrites a prior attempt. State
(`cow-state.mjs`, schema v1) `currentUnit` gained `baselinePath`, `currentAttempt`
(1..3), and `acceptedAttempt` (≤ currentAttempt, null until acceptance), set
through the narrow `unit` command (`--baseline/--attempt/--accepted-attempt`). The
ledger records attempt number, report path, verification result, and
acceptance/rejection — never prose.

## Report contract (§9)

`implementation-report.mjs` adds `attemptNumber` + `baselinePath` to the schema and
`validate ... --attempt <n> --baseline <p>` (report attempt agrees with dispatch,
baseline agrees with state, report path attempt-qualified). `compare-worktree
--baseline <p>` uses the helper's ownership delta (pre-existing dirty preserved,
never owned); the legacy `--base <sha>` mode remains for compatibility but cannot
separate pre-existing dirt from unit work. The actual git diff is authoritative.

## Implementer contract (§12)

`cow-implementer` now requires `ATTEMPT_NUMBER` + `BASELINE_PATH`, writes
`task-N-attempt-K-report.json`, and additionally must **not** stage, clean/reset/
checkout/stash, change the baseline, overwrite another attempt's report, or modify
a pre-existing dirty path (on top of the existing no-commit/no-state/no-spawn rules).
Inline and both delegated routes capture a baseline; planned-sequential captures a
**fresh** baseline per unit from the new committed HEAD.

## Analyzer extensions (§13)

`analyze-implementation-stream.mjs` adds `baselinePaths`, `attemptReports`,
`dirtyOverlapChecks`, `stageVerification`, `broadStageCommands`, `processExitCode`,
`workflowSemanticResult`, and new violations: `BASELINE_NOT_CAPTURED_BEFORE_IMPLEMENTATION`,
`DISPATCH_BEFORE_OVERLAP_CHECK`, `DIRTY_OVERLAP_IGNORED`, `BASELINE_CHANGED_BETWEEN_RETRIES`,
`REUSED_REPORT_PATH_ACROSS_ATTEMPTS`, `ATTEMPT_REPORT_NUMBER_MISMATCH`,
`PRE_EXISTING_PATH_MODIFIED`, `STAGED_NON_UNIT_OWNED`, `BROAD_STAGE_COMMAND`,
`COMMIT_BEFORE_STAGE_VERIFICATION`, `MISSING_ACCEPTED_ATTEMPT_EVIDENCE`,
`PROCESS_EXIT_NONZERO_UNCLASSIFIED`. It classifies `PROCESS_FAILURE / WORKFLOW_BLOCKED /
WORKFLOW_COMPLETED / HARNESS_FAILURE` and never infers semantic success from repo
state alone. Honoured limits: ownership breaches are matched from the helper's JSON
output shape (not bare tokens, so reading a reference/source file that names a code
does not trip it); path args stop at shell metacharacters; variable-expanded
baseline paths are accepted as overlap-checked. Covered by
`implementation-stream.test.mjs` (41 checks).

## Static validation

- `unit-worktree.test.mjs` (27): clean baseline, deterministic inspect, preserved
  tracked/staged/untracked dirt, file+directory overlap blocking, allowed change /
  out-of-scope / pre-existing-modified, new/delete/rename in & out of scope, safe
  paths, BOM tolerance, linked worktree, exact-path/broad/missing staging.
- `implementation-report.test.mjs` (38), `state.test.mjs` (102), `agent-contracts`
  (153) extended for attempt/baseline fields and the implementer prohibitions.
- `validate-structure.mjs` (318): the Phase 3B.1.1 block proves both routes capture
  a baseline, overlap blocks before edit/dispatch, exact-path staging + verify-stage
  are mandatory, broad staging is forbidden, retry artifacts are attempt-qualified +
  immutable, the baseline is stable across retries, the unit baseline is the
  ownership authority, the review gate order is unchanged, and cow-reviewer stays
  unintegrated.
- Eval (24): `unit-ownership/` fixtures (8) + the contract class.
- `claude plugin validate . --strict` passes.

## Focused live smokes (§16)

Fresh `claude --plugin-dir` sessions, disposable repos, graded with the extended
analyzer (evidence under the ignored `.cost-oriented-agentic-workflow/eval/agents/`).

| Scenario | Initial dirty state | Implementers | Baselines | Attempt reports | Unit-owned | Preserved | Commits | Result | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| A unrelated-dirty | `src/other.js` modified (outside) | 1 (sonnet) | `task-1` | `attempt-1` | `src/feature.js` | `src/other.js` byte-identical | 1 (only feature.js) | WORKFLOW_COMPLETED; verify-stage ran | `o-A-unrelated-dirty.stream.jsonl` |
| B dirty-overlap | the allowed file `src/feature.js` dirty | 0 | `task-1` | — | — | `src/feature.js` | **0** | WORKFLOW_BLOCKED (`BLOCKED_DIRTY_OVERLAP`) before edit/dispatch | `o-B-overlap.stream.jsonl` |
| C retry | clean | 2 | `task-1` (stable) | `attempt-1` + `attempt-2` (both on disk, immutable) | `src/slug.js` | — | 1 | WORKFLOW_COMPLETED; distinct reports, same baseline | `o-C-retry.stream.jsonl` |
| D planned-seq + dirty | `docs/NOTES.md` modified (outside) | 2 (task-1 retried) | `task-1` + `task-2` (fresh per unit) | per unit | `src/config.js` (×2) | `docs/NOTES.md` byte-identical | 2 (neither incl. NOTES.md) | PASS via ground-truth repo† | `o-D-planned-seq` repo + partial stream |
| E broad-stage | `src/dirty.js` modified (outside) | 0 (controlled) | `task-1` | — | (`src/x.js` edited, not committed) | `src/dirty.js` | **0** | `BROAD_STAGE_COMMAND` detected; verify-stage caught it; no commit | `o-E-broad-stage.stream.jsonl` |

† Smoke D's work completed (two sequential commits, each only `src/config.js`; no
commit touched `docs/NOTES.md`; the user file stayed byte-identical and uncommitted;
fresh baseline per unit) but the 10-minute test-wrapper timeout truncated the
in-memory stream capture, so D is graded from ground-truth repo state rather than
the analyzer. **Driving artifact:** A/B/C/E streams each carry a
`ROUTE_RECEIPT_MISSING_OR_INCONSISTENT` flag because the smokes were driven with
explicit numbered steps (the controller executed the protocol but did not emit the
conversational `Route:` receipt); the ownership behavior is correct in every case.

## Non-integration confirmation

```text
cow-reviewer was not integrated.
The existing review matrix and review path remain authoritative.
Implementation-route selection was not redesigned.
Discovery routing was not redesigned.
No active hooks were added.
The runtime-package builder was not changed.
The package version remains 0.4.2.
```

## Phase 3B.2 readiness

Unit ownership and attempt evidence are now safe enough for custom-reviewer
integration: only unit-owned changes can be staged/committed, pre-existing user
work is preserved, retries keep distinct immutable evidence, and the review-package
the reviewer will read is now a clean per-unit delta rather than a base-SHA diff
contaminated by pre-existing dirt. Remaining risks for 3B.2:

- **Ownership is validated, not hook-enforced.** `check-overlap`/`compare`/
  `verify-stage` are controller-invoked; the implementer's no-stage/no-baseline-edit
  rules are contract + frontmatter only. Deterministic prevention is the PreToolUse
  hook phase — keep grading streams with the analyzer.
- **`cow-reviewer` stays unintegrated.** 3B.2 swaps the legacy reviewer dispatch for
  the scoped agent without changing the matrix, remediation waves, or whole-work
  review; the analyzer already records reviewer dispatches and flags whether the
  scoped reviewer was used.
- **The runtime package still does not ship `agents/`.**
- **Semantic classification is a stream signal, not ground truth** (the analyzer
  refuses to infer success from repo state; a nonzero process exit on a completed
  workflow is recorded, not treated as failure).

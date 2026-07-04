# Delegated execution: baseline, dispatch, validation, acceptance

Loaded on demand from execution-routing. The controller owns the seams and the
worktree ownership; a fresh `cost-oriented-agentic-workflow:cow-implementer`
(Sonnet) owns one unit's interior. The report is evidence, never the source of
truth.

## Capture the unit baseline first (§5, §6)

Before any inline edit or implementer dispatch, capture a per-unit baseline:

```text
unit-worktree.mjs capture --unit <id> --output <baseline> --allowed-path <p>...
unit-worktree.mjs check-overlap <baseline>
```

`capture` records the head SHA, branch, allowed paths, and every pre-existing dirty
path (TRACKED/STAGED/UNTRACKED with content hashes). `check-overlap` **blocks**
(`BLOCKED_DIRTY_OVERLAP`, exit 1) when a pre-existing dirty path is inside the
allowed set — do not edit or dispatch; the user's dirty content is never folded
into the unit. A directory allow-path overlaps every contained dirty path. No
hunk-level merging in this phase.

## Ownership (§6)

After the unit runs, `unit-worktree.mjs compare <baseline>` classifies every path:

- **unit-owned** — clean/absent at baseline, changed/created after, inside the
  allowed set. Only these may be staged and committed.
- **preserved** — a pre-existing dirty USER path, untouched. Never staged.
- **violation** — `OUTSIDE_ALLOWED_PATH` (a new/changed path outside the allowed
  set) or `PRE_EXISTING_PATH_MODIFIED` (a pre-existing user path changed after
  baseline; the stronger failure). Deletions/renames are deterministic: a rename
  into an out-of-scope path fails; deleting a pre-existing dirty path fails.

The actual git diff is authoritative over the report.

## cow-implementer dispatch inputs (§12)

```text
UNIT_ID, ATTEMPT_NUMBER, BASELINE_PATH, TASK_BRIEF_PATH, REPORT_PATH,
ALLOWED_PATHS, VERIFICATION_COMMANDS, COMMIT_POLICY=controller, WORKTREE_ROOT
```

The implementer edits only allowed paths, runs verification, writes
`task-<id>-attempt-<n>-report.json`, returns ≤8 lines, and never commits, **stages**,
cleans/resets/checks out/stashes, updates state, changes the baseline, overwrites
another attempt's report, or modifies a pre-existing dirty path.

## Controller sequence per delegated unit (§7, §9)

1. Capture the baseline + `check-overlap` (block on overlap).
2. Record route + unit + allowed paths + baseline + brief + report (attempt 1) via
   `cow-state`.
3. Generate the bounded brief (unit id, outcomes, acceptance, allowed paths,
   verification, mode/risk, commit policy).
4. Dispatch the exact `cow-implementer` with `ATTEMPT_NUMBER` + `BASELINE_PATH`.
   Save the raw return as `task-<id>-attempt-<n>-return.txt`.
5. `implementation-report.mjs validate <report> --brief <brief> --attempt <n> --baseline <baseline>`.
6. `implementation-report.mjs compare-worktree <report> --baseline <baseline>`;
   reject any out-of-scope or pre-existing-path change.
7. Existing review path (unchanged mode/risk matrix).
8. Controller-owned **fresh** verification.
9. Stage **only** the computed unit-owned paths (exact pathspecs), then
   `unit-worktree.mjs verify-stage <baseline>`. Never `git add .` / `git add -A` /
   `git commit -a`. If safe partial staging cannot be proven, block.
10. Commit; record `commit=` + the unit commit SHA + `acceptedAttempt` via
    `cow-state`. Move to the next unit (a fresh baseline).

## Attempt-qualified evidence + retries (§8, §11)

Each attempt writes its own immutable `task-<id>-attempt-<n>-report.json` and
`-return.txt`; never overwrite a prior attempt. A retry (attempt 2 or 3) keeps the
**same baseline**, receives the previous failed report path + new error evidence,
and is a fresh `cow-implementer` with the next `ATTEMPT_NUMBER`. The final compare
is always relative to the original unit baseline. Implementation attempts (initial
+ ≤2) are **separate** from the review path's two remediation waves; never merge the
counters. State points at the accepted attempt (`currentUnit.reportPath`,
`acceptedAttempt`).

## The controller must NOT accept

agent claims without artifacts; agent verification in place of fresh controller
verification; zero discovered tests as success; a restored-clean-tree trick hiding
an attempted mutation; a report written before the final code state; a broad-staged
or mixed-ownership commit; or budget exhaustion as approval. The implementer's
self-review is evidence — never a substitute for independent review, and never
commit authority.

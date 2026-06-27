# Delegated execution: dispatch, validation, and acceptance

Loaded on demand from execution-routing. The controller owns the seams; a fresh
`cost-oriented-agentic-workflow:cow-implementer` (Sonnet) owns one unit's
interior. The implementer's report is evidence, never the source of truth — the
actual git diff is authoritative.

## cow-implementer dispatch inputs (§8)

Dispatch the exact scoped identifier with every input named:

```text
TASK_BRIEF_PATH, REPORT_PATH, ALLOWED_PATHS, VERIFICATION_COMMANDS,
COMMIT_POLICY=controller, WORKTREE_ROOT, UNIT_ID
```

The implementer inspects dirty paths, reads the brief, edits ONLY allowed paths,
runs verification, writes `task-<N>-report.json`, and returns ≤8 lines. It never
commits, never updates state, never marks the unit complete, never spawns another
agent.

## Controller sequence per delegated unit (§9)

1. Pin the unit's base SHA (`UNIT_BASE = HEAD`); record route + unit + allowed
   paths + base + brief + report through `cow-state`.
2. Generate the bounded brief; confirm it names the unit id, outcomes, acceptance
   criteria, allowed paths, verification commands, mode/risk, and commit policy.
3. Dispatch the exact `cow-implementer`. Save the raw agent return separately from
   the report file.
4. `implementation-report.mjs validate <report> --brief <brief>`.
5. `implementation-report.mjs compare-worktree <report> --base UNIT_BASE
   --allowed-path <p>...`; inspect the actual diff stat + changed paths.
6. Reject any unreported or out-of-scope change.
7. Enter the existing review path (the mode/risk matrix is unchanged).
8. Run controller-owned **fresh** verification.
9. Commit only after every applicable gate passes; record `commit=UNIT_BASE..HEAD`
   in the ledger and the unit commit SHA via `cow-state`.
10. Move to the next unit.

## The controller must NOT accept

- agent claims without artifacts;
- agent verification in place of fresh controller verification;
- zero discovered tests as meaningful success;
- a restored-clean-tree trick that hides an attempted out-of-scope mutation;
- a report generated before the final code state;
- commit-budget or retry exhaustion as approval.

## Attempts vs. remediation waves (§11)

Implementation attempts: the initial attempt + at most 2 more, each with changed
evidence, narrowed scope, a corrected brief, or a materially different approach —
a fresh cow-implementer invocation, never the same prompt re-sent. This is
**separate** from the review path's two remediation waves; never merge the
counters, and never alter the existing ceilings.

## Self-review is not review

The implementer's self-review is evidence. It never replaces the independent
review the mode/risk matrix requires, and it never authorizes a commit.

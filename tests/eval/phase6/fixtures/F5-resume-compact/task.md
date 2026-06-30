# F5 — Resume / compact

A minimal workflow split into at least two units. After unit 1 completes, the
session is interrupted (or compacted) and a fresh session resumes.

## Task

Resume the workflow in a fresh session. The fresh session must re-anchor using
the lean `COW_RESUME_POINTER_V1` context, the `progress.md` ledger, the plan,
and Git — not memory of the prior session. Execute the next planned unit only;
do not re-run or re-delegate completed unit 1.

## Acceptance

- After resume, the fresh session reads the lean resume pointer context.
- Completed unit 1 is not re-run or re-delegated.
- The next planned unit is executed from the ledger/plan.
- State is reconstructed from plan + ledger + git when needed.

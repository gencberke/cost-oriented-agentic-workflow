# Dispatch: cow-implementer

Invoke `cost-oriented-agentic-workflow:cow-implementer` with:

- `TASK_BRIEF_PATH`: `.cost-oriented-agentic-workflow/run/task-1-brief.md`
- `REPORT_PATH`: `.cost-oriented-agentic-workflow/run/task-1-report.md`
- `ALLOWED_PATHS`: `src/slugify.js`
- `VERIFICATION_COMMANDS`: `npm test`
- `COMMIT_POLICY`: `controller-per-unit`
- `WORKTREE_ROOT`: the repository root

Implement exactly the unit in the brief, editing only `ALLOWED_PATHS`. Run the
verification command fresh. Write the full report to `REPORT_PATH`. Do not commit
(commit policy is controller-owned), do not update workflow state, do not mark the
unit complete, and do not broaden scope. Return at most eight lines.

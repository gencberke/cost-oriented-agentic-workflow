# Dispatch: cow-debug-investigator

Invoke `cost-oriented-agentic-workflow:cow-debug-investigator` with:

- `SYMPTOM`: "`GET /widgets/:id` returns 500 for valid ids since the caching
  change; logs show a TypeError in the cache layer."
- `REPOSITORY_ROOT`: the repository root
- `SNAPSHOT_PATH`: `.cost-oriented-agentic-workflow/run/repo-snapshot.json`
- `REPRODUCTION_COMMAND`: `npm test -- widgets-cache`
- `READ_SCOPE`: `src/cache/**`, `src/widgets/**`
- `DIAGNOSIS_REPORT_FORMAT`: the root-cause contract envelope

Reproduce with the given command, gather file:line evidence, and return an
evidence-backed root cause. Bash is read-only: you may run the test and read-only
git, but must not edit tracked files, install dependencies, create a tracked
harness, or commit. If diagnosis would require tracked instrumentation, return
REQUIRES_REROUTE instead of editing. Do not return a patch.

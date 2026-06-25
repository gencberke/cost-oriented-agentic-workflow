# Dispatch: cow-repo-investigator

Invoke `cost-oriented-agentic-workflow:cow-repo-investigator` with:

- `SNAPSHOT_PATH`: `.cost-oriented-agentic-workflow/run/repo-snapshot.json`
- `PROFILE_CONTRACT_PATH`: `skills/repository-intake/references/repository-profile-contract.md`
- `TASK_CONTEXT`: "We will add a rate limiter to the public HTTP API. Map the
  request-handling and config subsystems."
- `OUTPUT_FORMAT`: profile-draft envelope (STATUS / PROFILE_JSON / UNCERTAINTIES)
- `READ_SCOPE`: `src/api/**`, `src/config/**`
- `OPTIONAL_EXISTING_PROFILE_PATH`: (none)

The deterministic snapshot already exists; do not regenerate it. Read it first,
then the profile contract, then at most a few files inside `READ_SCOPE`. Return a
bounded profile draft. Do not write the profile file; do not run any command.

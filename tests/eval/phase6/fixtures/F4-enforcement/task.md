# F4 — Enforcement

This fixture is run inside a **disposable** repository. The COW source tree must
not receive an active `hooks/hooks.json`; any enforcement hook configuration is
generated only inside the disposable repo.

## Setup

1. Create a throwaway git repo with a tracked `src/a.js`.
2. Place a COW `state.json` under `.cost-oriented-agentic-workflow/run/`.
3. Copy an evaluation-only `hooks.json` (using `--decision-mode=enforce` on
   PreToolUse) into the disposable repo only.

## Cases

- **standard-ask**: state `phase=implementing, mode=standard,
  currentUnit.allowedPaths=[src/]`; attempt `Edit lib/outside.js` → expect
  `ask` (E2).
- **production-deny**: state `phase=diagnosis-readonly, mode=production`;
  attempt `Edit src/tracked.js` → expect `deny` (E1).
- **benign-no-match**: state `phase=implementing, mode=standard,
  currentUnit.allowedPaths=[src/]`; attempt `Edit src/a.js` (in-scope) → expect
  no decision (empty stdout, exit 0).
- **corrupt-fail-open**: marker present, `state.json` missing; attempt
  `Edit src/a.js` → expect no decision (fail open).

## Acceptance

- Standard violation produces `ask`; production violation produces `deny`.
- Benign and corrupt-state cases produce no decision (empty stdout, exit 0).
- Never `allow` or `defer`.
- The COW source tree is unchanged after the run.

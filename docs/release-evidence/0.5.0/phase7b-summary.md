# Phase 7B Live Evidence Summary

Status: final release remains blocked. The live model evidence gates were not
accepted in this run because Claude Code API calls returned
`authentication_failed` before model execution.

## Baseline

- `npm.cmd run check`: 467 checks passed, 0 failed.
- `npm.cmd run release:check:candidate`: passed with
  `PHASE_7A_CANDIDATE_GATE_PASSED`.
- `npm.cmd run release:check:final`: failed as expected with
  `LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE`.

## Live Attempts

- F1 VANILLA live stream:
  `.cost-oriented-agentic-workflow/eval/phase7b/F1-vanilla.stream.jsonl`.
- Minimal auth confirmation stream:
  `.cost-oriented-agentic-workflow/eval/phase7b/auth-default-smoke.stream.jsonl`.
- Converted F1 run record:
  `.cost-oriented-agentic-workflow/eval/phase7b/F1-vanilla.auth-failed.run.json`.
- The converted run record validated successfully and is classified as
  `PROCESS_FAILURE` with retry classification `AUTH`.
- Token and cost numbers for the failed live calls were zero input tokens, zero
  output tokens, and zero completed-model cost.

## Partial Deterministic Evidence

- `npm.cmd run test:enforcement` passed with 130 checks and 0 failures.
- Raw log:
  `.cost-oriented-agentic-workflow/eval/phase7b/phase5-enforcement-tests.log`.
- This is not accepted as final live ASK/DENY activation evidence because no
  Claude hook-event stream completed under the current authentication state.

## Gate Decisions

- `phase3b2ReviewLifecycle`: pending due to `AUTH`.
- `phase4ResumeCompact`: pending due to `AUTH`.
- `phase5AskDeny`: pending; deterministic enforcement passed, live stream
  activation remains blocked by `AUTH`.
- `phase6BehavioralCost`: pending due to `AUTH`.

No version bump, tag, push, publish, install, or final release claim was made.

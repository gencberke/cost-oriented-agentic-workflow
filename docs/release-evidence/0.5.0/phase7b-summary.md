# Phase 7B Live Evidence Summary

Status: final release remains blocked. Claude authentication was refreshed and
Phase 5 ASK/DENY live hook evidence is accepted, but Phase 3B.2, Phase 4, and
sufficient Phase 6 evidence remain pending.

## Baseline

- `npm.cmd run check`: 475 checks passed, 0 failed.
- `npm.cmd run release:check:candidate`: passed with
  `PHASE_7A_CANDIDATE_GATE_PASSED`.
- `npm.cmd run release:check:final`: failed as expected with
  `LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE`.

## Live Attempts

- F1 VANILLA and F1 COW_SHADOW live streams completed after auth refresh and
  were converted to valid run records.
- F4 standard ASK live stream completed and produced `permissionDecision=ask`
  for COW E2.
- F4 production DENY live stream completed and produced
  `permissionDecision=deny` for COW E1.
- Earlier auth-failed streams remain raw provenance only and are not accepted as
  successful gate evidence.

## Phase 5 Evidence

- `npm.cmd run test:enforcement` passed with 132 checks and 0 failures.
- Accepted ASK stream:
  `.cost-oriented-agentic-workflow/eval/phase7b/F4-standard-ask-r2.stream.jsonl`.
- Accepted DENY stream:
  `.cost-oriented-agentic-workflow/eval/phase7b/F4-production-deny-safe-r2.stream.jsonl`.
- Both blocked target files were externally checked unchanged after the live
  runs.
- The DENY run exposed Git `safe.directory` behavior in disposable evaluation
  repositories; `cow-hook.mjs` now uses per-command safe.directory for read-only
  Git classification.

## Gate Decisions

- `phase3b2ReviewLifecycle`: pending.
- `phase4ResumeCompact`: pending.
- `phase5AskDeny`: accepted.
- `phase6BehavioralCost`: pending; F1 live data exists, but sufficient measured
  thresholds are not accepted yet.

No version bump, tag, push, publish, install, or final release claim was made.

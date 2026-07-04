# Phase 7B Live Evidence Summary

Status: final release remains blocked. Claude authentication was refreshed and
Phase 4 resume/compact plus Phase 5 ASK/DENY live hook evidence is accepted,
but Phase 3B.2 and sufficient Phase 6 evidence remain pending.

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
- F5 startup/resume/compact live streams completed and showed
  `COW_RESUME_POINTER_V1`, resumed plan/progress re-anchoring, manual compact,
  and PreCompact observation.
- Earlier auth-failed streams remain raw provenance only and are not accepted as
  successful gate evidence.

## Phase 4 Evidence

- Accepted startup stream:
  `.cost-oriented-agentic-workflow/eval/phase7b/F5-resume-startup-r2.stream.jsonl`.
- Accepted resume stream:
  `.cost-oriented-agentic-workflow/eval/phase7b/F5-resume-resumed-r2.stream.jsonl`.
- Accepted compact stream:
  `.cost-oriented-agentic-workflow/eval/phase7b/F5-resume-compact-r2.stream.jsonl`.
- The resumed session re-read `plan.md` and `progress.md`, reported
  `Unit 2: Report pending marker`, and did not re-run Unit 1.
- The fixture diff was empty; only evaluation-only hook/state files remained
  untracked in the disposable repository.

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
- `phase4ResumeCompact`: accepted.
- `phase5AskDeny`: accepted.
- `phase6BehavioralCost`: pending; F1 live data exists, but sufficient measured
  thresholds are not accepted yet.

No version bump, tag, push, publish, install, or final release claim was made.

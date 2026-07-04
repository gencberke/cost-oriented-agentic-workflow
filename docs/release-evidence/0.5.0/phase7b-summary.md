# Phase 7B Live Evidence Summary

Status: live evidence accepted. Claude authentication was refreshed and Phase
3B.2 review lifecycle, Phase 4 resume/compact, Phase 5 ASK/DENY, and
conservative Phase 6 behavioral/cost evidence are accepted. The final release
still requires the normal release checks and the separate `0.5.0` version bump.

## Baseline

- `npm.cmd run check`: 479 checks passed, 0 failed.
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
- F1 VANILLA vs COW_SHADOW was aggregated with 2 valid runs and 0 invalid runs.
  The aggregate rejects any cost-improvement claim because preservation
  assertions are absent.
- Phase 3B.2 F3 review/remediation smokes progressed beyond authentication.
  R5 completed behaviorally but failed the strict package/report and targeted
  accepted-id validation contract. R6 observed literal review package/report
  fields with zero analyzer violations, then stopped at the Claude session limit
  before targeted re-review completion. R7 completed the full lifecycle and is
  accepted.
- Earlier auth-failed and incomplete F3 streams remain raw provenance only and
  are not accepted as successful gate evidence.

## Phase 3B.2 Evidence

- Accepted R7 stream:
  `.cost-oriented-agentic-workflow/eval/phase7b/F3-review-remediation-r7.utf8.stream.jsonl`.
- Accepted R7 run record:
  `.cost-oriented-agentic-workflow/eval/phase7b/F3-review-remediation-r7.run.json`.
- Accepted R7 review analysis:
  `.cost-oriented-agentic-workflow/eval/phase7b/F3-review-remediation-r7.review-analysis.json`.
- The original PowerShell-captured stream is retained as encoded raw
  provenance:
  `.cost-oriented-agentic-workflow/eval/phase7b/F3-review-remediation-r7.stream.jsonl`.
- Rejected R5 stream:
  `.cost-oriented-agentic-workflow/eval/phase7b/F3-review-remediation-r5.stream.jsonl`.
- Incomplete R6 stream:
  `.cost-oriented-agentic-workflow/eval/phase7b/F3-review-remediation-r6.stream.jsonl`.
- R7 contains UNIT_REVIEW and TARGETED_REREVIEW dispatches to
  `cost-oriented-agentic-workflow:cow-reviewer` with literal
  `REVIEW_PACKAGE_PATH` and `REVIEW_REPORT_PATH` fields.
- UNIT_REVIEW validation passed, F-001 was accepted, F-002 was rejected as a
  process-timing artifact of controller-owned final commit, and F-003 was
  non-blocking.
- One remediation wave fixed F-001, targeted re-review validated with accepted
  finding id F-001, fresh fixture verification passed 11/11, and the disposable
  fixture created local commit `3947c75`.

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

## Phase 6 Evidence

- Accepted F1 aggregate JSON:
  `.cost-oriented-agentic-workflow/eval/phase7b/F1-r2.aggregate.json`.
- Accepted F1 aggregate Markdown:
  `.cost-oriented-agentic-workflow/eval/phase7b/F1-r2.aggregate.md`.
- Conservative accepted threshold: small Phase 7B smoke runs should budget at
  least `0.15` USD per run on this local Windows environment.
- No cost-improvement claim is accepted for this release evidence set.

## Gate Decisions

- `phase3b2ReviewLifecycle`: accepted.
- `phase4ResumeCompact`: accepted.
- `phase5AskDeny`: accepted.
- `phase6BehavioralCost`: accepted with conservative measured thresholds and no
  cost-improvement claim.

No version bump, tag, push, publish, install, or final release claim was made
while collecting live evidence.

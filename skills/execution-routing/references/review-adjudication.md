# Controller adjudication of review findings

Loaded on demand. **The validated reviewer report is evidence, not a self-executing
decision.** After `review-report.mjs validate` passes, the controller adjudicates
**each actionable finding** before any fix is dispatched (receiving-code-review:
verify before implementing; no performative agreement). Auto-applying a wrong
finding wastes a dispatch and can break working code.

## Causality + blocking model (preserved)

```text
INTRODUCED   — this diff created it
WORSENED     — pre-existing, made more reachable/severe by this diff
PRE_EXISTING — already there, untouched
UNCERTAIN    — cannot tell from the package
```

- Only **INTRODUCED / WORSENED Critical or Important** findings block the current
  unit. The report helper enforces this: a blocking Minor, or a blocking
  PRE_EXISTING/UNCERTAIN, fails validation.
- A **pre-existing Critical/Important** is its own decision (fix under newly
  approved scope, or recorded risk acceptance) — never silently blamed on the
  current unit, and never bundled into a flat polish list. A hardcoded secret is
  the canonical case (rotate + assess history; moving it is not a fix).
- An **uncertain** finding needs more evidence → controller adjudicates; do not
  auto-block or auto-dismiss.

## Adjudication decisions + reason codes

For each finding record a bounded entry in
`.cost-oriented-agentic-workflow/run/task-N-review-adjudication.json`:

```text
findingId  decision  reasonCode  evidencePath  remediationRequired
```

Decisions: `ACCEPT | REJECT | DEFER_PRE_EXISTING | REQUEST_CLARIFICATION`.
Reason codes: `SUPPORTED_BY_DIFF | SUPPORTED_BY_TEST | OUTSIDE_CURRENT_UNIT |
PRE_EXISTING | DUPLICATE | INCORRECT_EVIDENCE | POLICY_NON_BLOCKING |
NEEDS_MORE_EVIDENCE`. No hidden reasoning or long prose — enums, ids, and paths.

## Verify reviewer claims before acting

Check each claim against the **unit-owned diff**, the task brief/plan, the
implementation report, the actual files, and the verification evidence. Push back
with file:line evidence on a finding that is wrong, duplicated, or outside the
unit. A finding that conflicts with what the plan mandates is the human's call —
present both and ask which governs. Do **not** automatically implement every
reviewer recommendation. Only **ACCEPT**ed findings that require changes start a
remediation wave (see remediation-and-rereview.md).

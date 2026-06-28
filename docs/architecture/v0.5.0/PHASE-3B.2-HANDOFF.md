# Phase 3B.2 Handoff - Review Control Plane

Status: **STATIC-INTEGRATED; LIVE-SMOKE GATE BLOCKED PENDING EXPLICIT USER APPROVAL**.

Do **not** mark Phase 3B.2 ready yet. The scoped reviewer control plane is wired and
covered by deterministic tests, but the required live `claude --plugin-dir` smokes were
not run because that sends local plugin/workspace content to the external Claude
service. The escalation request was rejected by the safety reviewer until the user gives
explicit approval after being told that risk.

## Git state while authored

- Branch: `feat/v0.5.0-control-plane`.
- Incoming HEAD before this working-tree patch: `1447c52` (`feat: add validated review reports`).
- Version remains `0.4.2`.
- Runtime packaging was not changed.
- Active hooks remain absent (`hooks/hooks.json` still not shipped).
- Latest completed phase remains **Phase 3B.1.1**. Phase 3B.2 is not completion-eligible
  until the live smoke gate is satisfied.

## What changed

- The legacy review path now names the exact scoped
  `cost-oriented-agentic-workflow:cow-reviewer` for independent review dispatch.
- `cow-reviewer` now returns bounded review report schema v1 evidence for
  `UNIT_REVIEW`, `TARGETED_REREVIEW`, and `WHOLE_WORK_REVIEW`.
- `execution-routing` keeps the unchanged mode/risk matrix and points detailed review
  mechanics to on-demand references:
  - `skills/execution-routing/references/review-routing.md`
  - `skills/execution-routing/references/review-package.md`
  - `skills/execution-routing/references/review-adjudication.md`
  - `skills/execution-routing/references/remediation-and-rereview.md`
- `requesting-review` now requires explicit scoped reviewer dispatch, report validation,
  controller adjudication, and the bounded remediation loop.
- `cow-state.mjs` tracks review observability fields: `required`, `scope`,
  `packagePath`, `reportPath`, accepted/pending finding ids, targeted re-review status,
  and whole-work status.
- Static validators now assert: four agents only, no version bump, no runtime packaging
  change, no active hooks, explicit reviewer dispatch, validate-before-adjudicate, the
  three scopes, production whole-work `model: opus` override, causality/blocking rules,
  and two remediation waves.

## Review policy preserved

The matrix was not redesigned:

| Mode / unit | Independent per-task review |
|---|---|
| `standard / low` | `none` - self-review + final whole-work gate |
| `standard / elevated` | `required-if-non-obvious` |
| `standard / high` | `required` |
| `production / any planned task` | `required` |
| `Critical/Important fix` | `required:fresh-targeted` |

Whole-work review remains: standard -> Sonnet; production -> same `cow-reviewer`
with per-invocation `model: opus` override, not a fifth agent. Production never skips
whole-work review. Standard may skip only for a single planned unit that already had
independent review.

Causality remains `INTRODUCED | WORSENED | PRE_EXISTING | UNCERTAIN`; only introduced
or worsened Critical/Important findings can block the current unit. Pre-existing
Critical/Important findings are separate controller decisions, not unit blockers.

## Helper and report contract

The existing Phase 3B.2 helper commit (`1447c52`) provides:

- `skills/requesting-review/scripts/review-package.mjs`
- `skills/requesting-review/scripts/review-report.mjs`
- `tests/eval/analyze-review-stream.mjs`
- `tests/review-report.test.mjs`
- `tests/review-stream.test.mjs`

The package descriptor is schema v1 and bounded to 8 KB. The review report is schema v1
and bounded to 12 KB. The controller must persist the reviewer JSON and run
`review-report.mjs validate <report> --package <pkg>` before adjudication or remediation.

## Controller adjudication

Reviewer output is evidence, not a workflow decision. The controller adjudicates each
actionable finding as:

```text
ACCEPT | REJECT | DEFER_PRE_EXISTING | REQUEST_CLARIFICATION
```

Only accepted introduced/worsened Critical/Important findings start remediation. A
remediation wave is one fresh fixer plus tests plus fresh `TARGETED_REREVIEW`. There
are at most two remediation waves; budget exhaustion is never approval.

## Static fixtures added

New review control-plane fixtures live under `tests/eval/review-control-plane/`:

- `review-not-required`
- `unit-review-approve`
- `unit-review-changes-required`
- `preexisting-finding-deferred`
- `remediation-targeted-rereview`
- `whole-work-standard`
- `whole-work-production`
- `review-wave-exhausted`

They validate the matrix, review scope, required artifacts, adjudication, targeted
re-review, whole-work review, production Opus override expectation, remediation-wave
ceiling, and forbidden shortcuts.

## Deterministic verification

Fresh static results from this working tree:

| Command | Result |
|---|---|
| `npm.cmd run check` | 369 checks passed, 0 failed |
| `npm.cmd run test:scripts` | 40 PASS lines; all checks passed |
| `npm.cmd run test:eval` | 27 Python unittest tests, OK |
| `npm.cmd run test:foundation` | state 115 + repo-intake 39, 0 failed |
| `npm.cmd run test:agents` | 154 checks passed, 0 failed |
| `npm.cmd run test:profile` | 34 checks passed, 0 failed |
| `npm.cmd run test:discovery-stream` | 31 checks passed, 0 failed |
| `npm.cmd run test:report` | 38 checks passed, 0 failed |
| `npm.cmd run test:implementation-stream` | 41 checks passed, 0 failed |
| `npm.cmd run test:unit-worktree` | 27 checks passed, 0 failed |
| `npm.cmd run test:review-report` | 34 checks passed, 0 failed |
| `npm.cmd run test:review-stream` | 21 checks passed, 0 failed |
| `claude plugin validate . --strict` | passed |

Git Bash was used for `test:scripts` and `test:eval` on Windows.

## Live smoke gate

Required but not run:

1. Standard unit review + ownership sanity.
2. Finding -> adjudication -> remediation -> targeted re-review.
3. Production whole-work review with the Opus override, or a documented limitation if
   the CLI cannot support the override.

Attempted command class: `claude -p ... --output-format stream-json --verbose
--permission-mode bypassPermissions --plugin-dir <repo>`. The approval request was
denied because loading the local plugin into Claude would transmit private workspace
content to an external service. Do not fabricate live evidence or substitute static
tests for this gate.

## Next exact action

After explicit user approval for the external Claude CLI data transfer risk, run at most
the three focused smokes above from disposable repos, capture raw JSONL under the ignored
`.cost-oriented-agentic-workflow/eval/agents/`, analyze each with
`tests/eval/analyze-review-stream.mjs --exit-code <code>`, and update this handoff plus
the master handoff with the concrete analyzer results.

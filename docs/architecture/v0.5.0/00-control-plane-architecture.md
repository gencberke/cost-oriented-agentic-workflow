# v0.5.0 Control Plane Architecture

The v0.5.0 control plane keeps the controller lean while preserving correctness:
state records control position, agents do bounded work, reviewers gate quality,
and hooks backstop only deterministic binary rules.

## Goals

- Reduce controller token load by moving bulk reading, writing, and review into
  scoped file handoffs.
- Preserve user work and make unit ownership explicit.
- Keep runtime dependencies at zero.
- Separate discovery routing from implementation routing.
- Preserve the standard/production review matrix.
- Add deterministic state and hook backstops without making hooks interpret
  judgment-heavy workflow rules.

## Core Flow

```text
task
  -> triage and repository readiness
  -> discovery route
  -> plan or light path
  -> implementation route
  -> unit ownership and verification
  -> scoped review and adjudication
  -> bounded remediation
  -> whole-work review
  -> final verification and finish
```

The light path remains available only for truly trivial low-risk work. Evidence
that scope, risk, diagnosis, or ownership changed forces re-triage.

## Cost Model

- The controller owns decisions: plan, route, adjudicate, verify, and commit.
- Sonnet agents do token-heavy investigation, implementation, and review when
  delegation is cheaper or safer.
- Production mode spends more to reduce risk. Every planned production unit gets
  independent review.
- Token/cost budgets are measured in Phase 6, not guessed into policy.

## Authoritative Layers

1. Git, the plan, the progress ledger, review packages, reports, and test output
   are evidence.
2. `state.json` is a reconstructable cache of control position.
3. Skills define the meaning of the process and the review matrix.
4. Hooks enforce only high-confidence mechanical gates after calibration.

No layer may silently override user-owned work or erase evidence from another
layer.

## Runtime Components

- Entry skill: `skills/using-cost-oriented-workflow/SKILL.md`.
- Routing skill: `skills/execution-routing/SKILL.md` plus references.
- State helper: `skills/execution-routing/scripts/cow-state.mjs`.
- Hook evaluator: `skills/execution-routing/scripts/cow-hook.mjs`.
- Repository intake helpers: `skills/repository-intake/scripts/`.
- Agents: `agents/cow-repo-investigator.md`, `cow-debug-investigator.md`,
  `cow-implementer.md`, and `cow-reviewer.md`.
- Hook template: `hooks/hooks.json.example`.

## Agent Contracts

- Repository investigator: builds bounded repo/profile evidence and does not
  mutate source.
- Debug investigator: performs read-only root-cause investigation and reports
  evidence.
- Implementer: changes only unit-owned files and returns a structured report.
  It never commits; `COMMIT_POLICY` is controller-owned metadata and cannot
  grant commit authority to a plugin agent.
- Reviewer: reads scoped packages, classifies findings by causality and severity,
  and never writes files or updates workflow state.

Automatic agent selection is not trusted for correctness. Dispatches name the
exact scoped agent identifier.

## Migration Shape

The source tree adds the control plane while keeping version `0.4.2` through
Phase 7A release-candidate preparation. Existing 0.4.x plans and ledgers remain
usable: without active state, hooks no-op; with reconstruction, state is rebuilt
from the plan, ledger, and Git.

The Phase 7A generated runtime package includes the v0.5.0 candidate control
plane, including all four `agents/**` definitions. Active `hooks/hooks.json`
remains deferred until live evidence gates pass.

## Non-Goals

- No persistent agent memory.
- No automatic worktree isolation.
- No broad shell parsing in hooks.
- No lossy compression of structured evidence.
- No review-matrix, retry-budget, remediation-budget, or version change as part
  of documentation cleanup or hook shadow work.

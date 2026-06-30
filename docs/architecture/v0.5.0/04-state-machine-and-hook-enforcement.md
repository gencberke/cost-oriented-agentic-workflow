# State Machine And Hook Enforcement

State records workflow position. Hooks read state and observe or enforce a small
set of deterministic gates. Skills remain authoritative for meaning.

## State Path And Ownership

Workflow state lives per checkout:

```text
<repo-root>/.cost-oriented-agentic-workflow/run/state.json
<repo-root>/.cost-oriented-agentic-workflow/run/state.active
```

Only `cow-state.mjs` writes state. Hooks read state and never mutate it.

## State Schema

`schemaVersion` is `1`. State contains observable control facts only:

- `active`
- `mode`: `standard | production`
- `phase`: `idle | triage | diagnosis-readonly | diagnosis-elevated |
  planning | implementing | reviewing | verifying | finishing | blocked`
- `processLane`
- `repositoryProfile`
- `discoveryRoute`
- `implementationRoute`
- `risk`
- `rootCause`
- `plan`
- `currentUnit`
- `verification`
- `review`
- `attempts`
- `remediationWaves`
- `baseBranch`
- `mergeBaseSha`
- `commitPolicy`
- `blocked`
- `timestamps`

State stores no chain-of-thought, raw diffs, review prose, or long diagnostics.
Those live in artifacts referenced by path.

## State Classes

- `ABSENT`: no state and no active marker. Hooks exit 0, emit no stdout, and do
  not log.
- `INACTIVE`: valid state with `active=false`. Hooks exit 0, emit no stdout, and
  do not log.
- `ACTIVE_VALID`: valid active state. Hooks execute their active behavior.
- `ACTIVE_CORRUPT`: active marker exists but state is missing, malformed, or
  schema-invalid. `cow-state` refuses mutating commands; hooks fail open and log
  one bounded `STATE_CORRUPT` observation where applicable.

Recovery is explicit reconstruction from Git, plan, and ledger.

## Phase 4 Shadow Hooks

Phase 4 ships hook substrate, not enforcement.

- `SessionStart` emits a compact `COW_RESUME_POINTER_V1` context pointer for an
  active valid workflow.
- `PreToolUse` evaluates mechanical rules and writes at most one bounded
  observation line per invocation when one or more rules match.
- `PreCompact` records only the bounded trigger class: `manual`, `auto`, or
  `unknown`.
- Hooks exit 0, do not block, and never write workflow state.
- No active `hooks/hooks.json` is shipped in this phase.

Observation records use stable top-level keys:

```text
schemaVersion, observedAt, event, stateClass, mode, phase, toolName,
matchedRuleIds, wouldBeDecision, actualDecision, subjectKind, subjectValue,
errorCode
```

Records are bounded to 1 KiB. `subjectValue` is bounded to 256 UTF-8 bytes.
Sensitive payloads, transcripts, full shell commands, and compaction content are
not logged.

## Rule Set

- R1: tracked Edit/Write during read-only diagnosis.
- R2: production tracked edit before required plan approval.
- R3: Edit/Write outside current unit allowed paths.
- R4: investigator write outside the workflow workspace.
- R5: invalid agent/model during mandatory delegation; observe/warn only.
- R6: high-confidence mutating Bash class.
- R7: absent state.
- R8: corrupt state.
- R9: inactive workflow.
- R10: compact/resume context pointer.

Mutating Bash classification is intentionally narrow: Git commit/push/reset-hard,
Git clean/merge/rebase, recursive forced removal, package installs, and
redirection to a non-workspace target. Everything else is ignored by the hook
unless a future phase adds a measured rule.

## Phase 5 Enforcement Contract

Phase 5 may promote only zero-false-positive binary rules to `ASK` or `DENY`.
The first candidates are R1, R2, R3, R4, and high-confidence R6 cases. R5 stays
warn/observe because role inference is not a safe hard-deny signal.

Enforcement must keep these invariants:

- missing, inactive, and corrupt state fail open;
- hooks never emit blanket allow decisions;
- hooks do not parse arbitrary shell semantics;
- hooks name the state gate and the action needed to proceed;
- active `hooks/hooks.json` is shipped only when no-op-when-inactive behavior is
  verified.


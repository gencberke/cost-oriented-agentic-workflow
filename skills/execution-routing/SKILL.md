---
name: execution-routing
description: Use when implementing a planned change under the cost-oriented workflow - selects the implementation route (inline vs the scoped cow-implementer), validates the report against the real diff, and runs the review/verify/commit loop while keeping the controller lean.
---

# Execution Routing

Turn a plan into working code while spending Opus only where it changes the outcome. Per unit you route, validate, review, verify, and commit; the scoped Sonnet `cow-implementer` writes bounded interiors. Bulk artifacts move as files, never pasted code bodies.

## Plan Pre-Flight

Before Task 1, scan once for Global-Constraint/task conflicts, Acceptance/interface contradictions, and plan-mandated defects. Emit `Pre-flight scan: clean.` or one batched question; do not proceed on ambiguity. A single trivial unit skips this scan.

## Repository State

Before Task 1, require `git status --porcelain` empty for planned/delegated work. If dirty, stop for human classification; never absorb unknown changes. Default `controller-per-unit` must be clean again after each reviewed commit.

Resume exception for `user-owned`/`none`: allow dirty paths only when every path is inside completed ledger `files=` scopes.

## Run Identity

`SKILL_DIR` is the exact **Base directory for this skill** supplied at load. Before artifact access, run absolute `"$SKILL_DIR/scripts/cow-workspace"`. Repo-relative `scripts/...` and suppressed helper failures (`2>/dev/null`, `||`) are forbidden. After artifact writes and at the final gate, `git status --short -- .cost-oriented-agentic-workflow/` **must be empty**.

Before Task 1, create/read the workspace `progress.md` header:

```text
PLAN_FILE:
MODE:
COMMIT_POLICY:
BASE_BRANCH:
MERGE_BASE_SHA:
```

For a new run, set plan path, mode, and commit policy. Resolve the base from an explicit decision or one credible repo-default/`main`/`master`/`develop` candidate; never mistake the feature branch's upstream for its base. Ask if ambiguous. Record `MERGE_BASE_SHA = git merge-base HEAD "$BASE_BRANCH"` once. Never recompute mid-run; resume reads the ledger.

## Implementation Route

Discovery routing decided *how you learned*; implementation routing decides *how you change code*, independent of discovery. Select exactly one per unit: `inline | delegated | planned-sequential | delegated-batch`. Definitions, receipt, and `UNIT_EXECUTION` live in [references/implementation-routing.md](references/implementation-routing.md).

Emit one receipt only when a field changed; if only implementation changes on stable code, emit `Re-route: reason=stable-code; implementation=<new-route>`. Record it with `cow-state.mjs route --implementation <value>`; never overwrite discovery.

**The routing gate is contract cost.** Start from the plan's non-binding `Route hint`; runtime evidence still governs. If scope, coupling, or risk changes the route, emit `Re-route: <route> - <observable trigger>` before editing. Record only the actual `route=` in the ledger. Small, low-risk, single-outcome edits go inline; the rest delegate. **Never dispatch cow-implementer on a true inline route.**

## Risk And Models

Contract cost never overrides safety. Classify with using-cost-oriented-workflow's hard exclusions; those units never take the light path. Review follows the mode/risk matrix. Carry mode + risk into every dispatch.

**Always specify the model on every dispatch.** Writer = scoped `cow-implementer` Sonnet; reviewer = a different Sonnet instance unless production whole-work uses the Opus override; controller = Opus.

Pin only between-unit facts: files, signatures, data shapes, integration points, acceptance, and verification. Leave within-unit interiors to the implementer. Standard is thin; production pins key behaviors/tests.

## Delegated Dispatch And Validation

**Capture a unit baseline first** (`unit-worktree.mjs capture`) and run `check-overlap` before any edit or dispatch: a pre-existing dirty path inside `ALLOWED_PATHS` **blocks** (`BLOCKED_DIRTY_OVERLAP`).

Dispatch the exact `cost-oriented-agentic-workflow:cow-implementer` (never automatic selection) with every input named: `TASK_BRIEF_PATH, REPORT_PATH, ALLOWED_PATHS, VERIFICATION_COMMANDS, COMMIT_POLICY=controller, WORKTREE_ROOT, UNIT_ID, ATTEMPT_NUMBER, BASELINE_PATH`. It writes `task-<N>-attempt-<K>-report.json` and returns <=8 lines; it never commits, stages, updates state, or spawns an agent.

The report is **evidence, not truth.** Before accepting: `implementation-report.mjs validate <report> --brief <brief> --attempt K --baseline <baseline>`, then `compare-worktree <report> --baseline <baseline>`. The actual git diff is authoritative over `filesChanged`; the **unit baseline** separates pre-existing dirty user paths from unit-owned changes. Run fresh controller verification; stage **only** the unit-owned paths, run `verify-stage`, and commit - never `git add .`/`-A`/`commit -a`. Details: [delegated-execution.md](references/delegated-execution.md), [implementation-report.md](references/implementation-report.md).

## Execute And Review Each Unit

When a unit reaches `DONE` and the real diff is validated, branch on the central mode/risk matrix: **Mode/risk matrix requires independent task review?** - no -> verify; yes -> independent review -> adjudicate -> bounded remediation gate -> verify. Then the controller commits after review and writes the ledger. Standard/low uses self-review + final whole-work review; production sends every planned task to an independent reviewer; high risk is always independently reviewed.

**Independent review uses the exact scoped `cost-oriented-agentic-workflow:cow-reviewer`** (`REVIEW_SCOPE=UNIT_REVIEW`, read-only; never automatic selection). Build both artifacts before dispatch: the bounded diff with `"$SKILL_DIR/scripts/review-package"` and the JSON descriptor with `skills/requesting-review/scripts/review-package.mjs build --output <pkg>`. Dispatch with the literal named fields `REVIEW_PACKAGE_PATH=<pkg>` and `REVIEW_REPORT_PATH=<report>`; do not substitute `REVIEW_PACKAGE` or omit the report path. Persist the returned JSON, run `review-report.mjs validate <report> --package <pkg>` before adjudication, then **adjudicate every finding before any fix is dispatched**. Only accepted introduced/worsened Critical/Important findings start a wave, each confirmed by a fresh `TARGETED_REREVIEW` whose dispatch includes `PRIOR_REVIEW_REPORT_PATH`, `ACCEPTED_FINDING_IDS`, `REMEDIATION_WAVE`, `REVIEW_PACKAGE_PATH`, and `REVIEW_REPORT_PATH`; validate it with `review-report.mjs validate <rereview-report> --package <rereview-pkg> --accepted-finding-ids <ids>`. Targeted re-review reports include accepted ids and new introduced remediation regressions only; omit deferred/out-of-scope prior findings. Details: [review-routing.md](references/review-routing.md), [review-package.md](references/review-package.md), [review-adjudication.md](references/review-adjudication.md), [remediation-and-rereview.md](references/remediation-and-rereview.md).

## File Handoffs

Code bodies, full diffs, and full reports stay in files. Workspace: `cow-workspace`; brief: `task-brief`; report: validated JSON; task diff: `"$SKILL_DIR/scripts/review-package" UNIT_BASE HEAD -- PATH...`; review descriptor: `review-package.mjs build --output <pkg> --diff <diff> ...`; whole-work diff: `"$SKILL_DIR/scripts/review-package" MERGE_BASE HEAD`. Use `UNIT_BASE`, never `HEAD~1`.

## Commit Policy

Default: **controller-per-unit.** Writers leave changes uncommitted; **the controller commits after review.** Persist `UNIT_BASE = HEAD`; record `commit=UNIT_BASE..new_HEAD` - never substitute `MERGE_BASE_SHA`. Confirm a clean tree before the next unit.

Override only by repo/user preference in the anchor: `implementer`, `user-owned`, or `none`. A trivial light-path edit does not force a commit.

## Implementer Status

- **DONE** - validate + compare, then review.
- **DONE_WITH_CONCERNS** - resolve correctness/scope concerns first.
- **NEEDS_CONTEXT** - provide missing context, re-dispatch.
- **BLOCKED / BLOCKED_INPUT** - assess context, model, split, root cause, or plan error.

**Retry budget (D8):** initial attempt + at most **2 extra**, each changed and fresh; never resend the same prompt. For bugs/failing tests, find root cause first (systematic-debugging).

**The only reroute edge is `diagnosis-readonly` back to `triage`** via `transition --phase triage --reroute` (used when an investigator returns `REQUIRES_REROUTE`); it is single-use per symptom — see discovery-routing.

## Bounded Remediation Gate

Allow at most **2 remediation waves** per task or final whole-work review. A wave = one fresh fixer for all accepted introduced/worsened Critical/Important findings + tests, then targeted re-review. False positives, deferred pre-existing findings, and plan conflicts use no wave. After wave 2, open Critical/Important stops with evidence. **Budget exhausted ≠ approved.** Implementation attempts are separate; never merge counters. Detail: [remediation-and-rereview.md](references/remediation-and-rereview.md).

## Batching And Parallelism

- **Batch** one coherent seam into `delegated-batch`; verify each outcome separately.
- **Parallel** only strict non-overlapping file ownership; same-file chunks are sequenced.

## Durable Progress

Write every completed unit to `<repo-root>/.cost-oriented-agentic-workflow/run/progress.md`:

```text
Unit N | route=<inline|delegate> | risk=<low|elevated|high> | files=<paths>
review=<none|required:clean> | waves=<0..2> | verify=<result>
commit=<base..head>
```

Never mark a unit complete with open Critical/Important findings. Record final-review state too; before surfacing exhaustion, persist `waves=2` + open findings as blocked so resume cannot reset the budget. On resume trust ledger + `git log`; git remains the fallback.

## When All Units Are Done

The per-unit loop gates each task in isolation; it does not catch cross-unit problems.

1. **One independent whole-work review** - read ledger `MERGE_BASE_SHA`, build the package, and dispatch fresh `cost-oriented-agentic-workflow:cow-reviewer` with `REVIEW_SCOPE=WHOLE_WORK_REVIEW`: standard -> Sonnet, production -> per-invocation `model: opus` override (not a fifth agent). This is never controller self-review. Validate, adjudicate, remediate. Standard may skip only for one unit already independently reviewed; production never skips.
2. **Integrate** - hand off to **finishing-a-development-branch**.

## Red Flags

- cow-implementer on true inline; automatic agent selection; any subagent without a model.
- Trusting reports without validation; pasting full text/diffs/code into context.
- Self-review replacing required independent review; committing with open Critical/Important findings.

## Templates And References

- [implementation-routing.md](references/implementation-routing.md), [delegated-execution.md](references/delegated-execution.md), [implementation-report.md](references/implementation-report.md)
- [review-routing.md](references/review-routing.md), [review-package.md](references/review-package.md), [review-adjudication.md](references/review-adjudication.md), [remediation-and-rereview.md](references/remediation-and-rereview.md)
- [implementer-prompt.md](implementer-prompt.md) (the cow-implementer dispatch prompt body)

**Related:** preparing-subagent-prompts (contract packaging) | requesting-review (review depth by mode) | receiving-code-review (adjudicate findings before fixing) | verification-before-completion (evidence) | systematic-debugging (root-cause before re-dispatch) | dispatching-parallel-agents (parallel + file ownership) | finishing-a-development-branch (integrate).

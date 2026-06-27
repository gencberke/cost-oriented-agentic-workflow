---
name: execution-routing
description: Use when implementing a planned change under the cost-oriented workflow — selects the implementation route (inline vs the scoped cow-implementer), validates the report against the real diff, and runs the review/verify/commit loop while keeping the controller lean.
---

# Execution Routing

Turn a plan into working code while spending the controller's expensive tokens only where they change the outcome. Per unit you decide once — **write it inline or delegate it to the scoped Sonnet `cow-implementer`** — then run the loop. **Core economy:** you (Opus) route, validate, and review; the implementer does the token-heavy writing; bulk artifacts move as files, so the controller reads summaries, a validated report, and verification — never pasted code bodies.

## Plan pre-flight

Before Task 1, scan once for Global-Constraint/task conflicts, Acceptance/interface contradictions, and plan-mandated defects. Emit `Pre-flight scan: clean.` or one batched question quoting each conflicting plan line and asking which governs. Do not proceed on ambiguity. A single trivial unit skips this scan.

## Repository-state pre-flight

Before Task 1, require `git status --porcelain` empty for planned/delegated work. If dirty, stop and offer commit, stash, or isolated-worktree choices; never absorb unknown changes. Default `controller-per-unit` must be clean again after each reviewed commit.

Resume exception for `user-owned`/`none`: allow dirty paths only when every path is inside completed ledger `files=` scopes. Any outside path hard-stops for human classification.

## Pin run identity once

`SKILL_DIR` is the exact **Base directory for this skill** supplied at load (Windows Bash: normalize `\` to `/`). Before any artifact access, run absolute `"$SKILL_DIR/scripts/cow-workspace"`. Repo-relative `scripts/...` and suppressed helper failures (`2>/dev/null`, `||`) are forbidden and hard-stop. After artifact writes and at the final gate, `git status --short -- .cost-oriented-agentic-workflow/` **must be empty**.

Before Task 1, create or read the workspace `progress.md` header:

```text
PLAN_FILE:
MODE:
COMMIT_POLICY:
BASE_BRANCH:
MERGE_BASE_SHA:
```

For a new run, set the plan path, mode, and active commit policy (default `controller-per-unit`). Resolve the base from an explicit decision or one credible repo-default/`main`/`master`/`develop` candidate; never mistake the feature branch's upstream for its base. If ambiguous, ask before Task 1. Record `MERGE_BASE_SHA = git merge-base HEAD "$BASE_BRANCH"` once. Never recompute either value mid-run; resume reads the ledger.

## Dual routing: discovery is decided; now choose the implementation route

Discovery routing already decided *how you learned*. Implementation routing decides *how you change code*, **independent** of discovery: a broad investigator discovery can still resolve to a tiny inline fix; a cheap controller-map can feed a non-trivial delegated unit. Select exactly one per unit: `inline | delegated | planned-sequential | delegated-batch`. Definitions, selection criteria, the receipt format, and the per-unit `UNIT_EXECUTION` tag live in **[references/implementation-routing.md](references/implementation-routing.md)**.

Emit one receipt after triage (only when a field changed); if only the implementation route changes on stable code, emit `Re-route: reason=stable-code; implementation=<new-route>`. Record it with `cow-state.mjs route --implementation <value>` — never overwrite the recorded discovery route.

**The routing gate is contract cost.** Delegating is not free — you pay to write the contract, dispatch, and validate the return; it wins only when the code you'd save outweighs that overhead. Start from the plan's non-binding `Route hint`, then compare it with actual scope; runtime evidence still governs. If scope, coupling, or risk changes the route, emit one `Re-route: <route> — <observable trigger>.` line before editing. Record only the actual `route=` in the ledger. Small, tightly-coupled, low-risk, single-outcome edits go inline; the rest delegate. **Never dispatch cow-implementer on a true inline route.**

## Risk gate (overrides the size gate)

Contract cost never overrides safety. Classify with using-cost-oriented-workflow's hard exclusions; those units never take the light path. They may be inline, but review follows the mode/risk matrix. Carry mode + risk into every dispatch.

## Model selection (pin it explicitly)

**Always specify the model on every dispatch** — an omitted model inherits your expensive controller model and defeats the economy. Writer = the scoped `cow-implementer` (Sonnet, already cost-pinned); reviewer = a *different* Sonnet instance; controller = you (Opus). **production only:** dispatch an Opus subagent as the writer for a very large or genuinely complex generation; the reviewer stays independent.

## Pin the seams, free the interior

The contract pins only **between-unit** facts — file names, signatures, data shapes, integration points, acceptance criteria, the exact verification command — and leaves the **within-unit** interior to the implementer, so drift lands in the cheap interior while the expensive seams stay locked. Mode sets thickness: **standard** pins the interface only; **production** also pins key behaviors and required tests.

## Delegated dispatch and validation

Dispatch the exact `cost-oriented-agentic-workflow:cow-implementer` (never automatic selection) with every input named — `TASK_BRIEF_PATH, REPORT_PATH, ALLOWED_PATHS, VERIFICATION_COMMANDS, COMMIT_POLICY=controller, WORKTREE_ROOT, UNIT_ID`. It writes `task-<N>-report.json`, returns ≤8 lines, and never commits, updates state, or spawns an agent.

The report is **evidence, not truth.** Before accepting a delegated unit: `implementation-report.mjs validate <report> --brief <brief>`, then `implementation-report.mjs compare-worktree <report> --base UNIT_BASE --allowed-path <p>...`. **The actual git diff is authoritative over `filesChanged`** — reject any unreported or out-of-scope change, and never accept agent verification in place of fresh controller verification or budget exhaustion as approval. Full sequence + the must-not-accept list: **[references/delegated-execution.md](references/delegated-execution.md)**; report schema + commands: **[references/implementation-report.md](references/implementation-report.md)**.

## Execute and review each unit

When an inline or delegated unit reaches `DONE` and (for delegated) its report has been validated against the real diff, branch on the central mode/risk matrix: **Mode/risk matrix requires independent task review?** — no → verify; yes → independent Sonnet review → bounded remediation gate → verify. Then the controller commits (default policy) and writes the ledger. Standard/low uses self-review + final whole-work review; production sends every planned task to an independent Sonnet; high risk is always independently reviewed.

## Return protocol: hand work over as files, not pasted text

Code bodies, full diffs, and full reports stay in files; the controller reads only summaries, the validated report, and verification.
- **Workspace:** `"$SKILL_DIR/scripts/cow-workspace"` resolves the self-ignored artifact dir at `<repo-root>/.cost-oriented-agentic-workflow/run/`.
- **Brief:** `"$SKILL_DIR/scripts/task-brief" PLAN_FILE N` extracts the task into `task-N-brief.md`; the dispatch points to it.
- **Report:** the implementer writes `task-N-report.json` beside the brief; validate + render it with `implementation-report.mjs`.
- **Task diff:** `"$SKILL_DIR/scripts/review-package" UNIT_BASE HEAD -- PATH...` (the task's exact `Files`). Use the base recorded before dispatch — never `HEAD~1`.
- **Whole-work diff:** omit paths: `"$SKILL_DIR/scripts/review-package" MERGE_BASE HEAD`. Branch mode includes committed work only and exits `4` with dirty filenames when HEAD is dirty.

## Commit policy

Default: **controller-per-unit.** Writers leave changes uncommitted; **the controller commits after review.** Persist `UNIT_BASE = HEAD` before edits; review from it, then record `commit=UNIT_BASE..new_HEAD` — never substitute `MERGE_BASE_SHA`. Confirm a clean tree before the next unit; each commit is a recovery boundary.

Override only by repo or user preference, noting it in the anchor when non-default:
- `implementer` — the delegated worker commits its own unit (then the dispatch and return protocol ask for commit SHAs).
- `user-owned` — leave units uncommitted for the human to commit.
- `none` — throwaway/experimental; no commits.

A trivial light-path edit does not force a commit under any policy.

## Handling implementer status

- **DONE** — validate the report + compare the worktree, then go to review.
- **DONE_WITH_CONCERNS** — resolve correctness/scope concerns before review.
- **NEEDS_CONTEXT** — provide what was missing, re-dispatch.
- **BLOCKED / BLOCKED_INPUT** — assess: more context? a more capable model? split the task? root-cause a bug (systematic-debugging)? plan wrong (escalate)?

**Retry budget (D8):** an implementer gets the initial attempt + at most **2 extra**, each with something changed (more context, a more capable model, a smaller scope, or a corrected brief) and a **fresh** invocation — never the same prompt re-sent. **When the failure is a bug or a failing test**, find the root cause first (**systematic-debugging**) and dispatch the fix *with* that cause stated, not "make the test pass."

## Bounded remediation gate

- Allow at most **2 remediation waves** per task or final whole-work review. One wave = one fixer addressing all accepted *introduced/worsened* Critical/Important findings, covering tests, then a fresh targeted independent reviewer.
- False-positive adjudication uses no wave. A pre-existing Critical/Important uses no original-unit wave: get risk acceptance, or make the human-approved scope a new unit. A plan conflict also uses no wave; ask the human which governs.
- If the same finding survives wave 1, do not apply a second blind fix: use systematic-debugging/root cause or controller adjudication first.
- After wave 2, any open Critical/Important stops autonomous execution and is surfaced with evidence. **Budget exhausted ≠ approved.** The implementer's 2-extra-attempt budget above is separate; never merge the counters.

## Batching and parallelism

- **Batch** a coherent cluster — interdependent files or one subsystem under one verification seam — into a single `delegated-batch` package so the contract overhead is amortized once; the controller still verifies each outcome separately.
- **Parallel:** independent chunks can run as separate subagents at once (**dispatching-parallel-agents**) under **strict non-overlapping file ownership.** **Chunks touching the same file are not parallelizable — sequence them.** A worktree isolates checkouts; it does not make two concurrent edits to one file merge cleanly.

## Durable progress (anti-drift)

Write every completed unit to `<repo-root>/.cost-oriented-agentic-workflow/run/progress.md`:

```text
Unit N | route=<inline|delegate> | risk=<low|elevated|high> | files=<paths>
review=<none|required:clean> | waves=<0..2> | verify=<result>
commit=<base..head>
```

Never mark a unit complete with open Critical/Important findings. Record final-review state too; before surfacing exhaustion, persist `waves=2` + open findings as blocked so resume cannot reset the budget. `scripts/cow-workspace` copies a missing ledger from legacy `<git-dir>/cow/progress.md` without deleting it. On resume trust ledger + `git log`; `git clean -fdx` may delete the ignored ledger, so git remains the fallback.

## When all units are done

The per-unit loop gates each task in isolation; it does not catch problems that only appear where units meet. After the last unit, before claiming the branch is finished:

1. **One independent whole-work review** — read ledger `MERGE_BASE_SHA`, build `"$SKILL_DIR/scripts/review-package" MERGE_BASE_SHA HEAD`, and dispatch fresh: standard → Sonnet, production → Opus. This is never controller self-review, even on the target model. Apply bounded remediation. Standard may skip only for one unit already independently reviewed; production never skips.
2. **Integrate** — hand off to **finishing-a-development-branch**: verify tests, then merge / PR / keep / discard, then clean up.

## Red flags

- cow-implementer on a true inline route; automatic agent selection; any subagent without a model (inherits Opus).
- Trusting the report without validating it against the actual diff; pasting full text, diffs, or subagent code back into context.
- Self-review replacing independent review on a risky change; committing with open Critical/Important findings.

## Templates and references

- [references/implementation-routing.md](references/implementation-routing.md) — the four routes, selection rules, receipt
- [references/delegated-execution.md](references/delegated-execution.md) — dispatch + validation sequence, attempts
- [references/implementation-report.md](references/implementation-report.md) — report schema + helper commands
- [implementer-prompt.md](implementer-prompt.md) — legacy general-purpose writer template · [task-reviewer-prompt.md](task-reviewer-prompt.md) — independent reviewer

**Related:** preparing-subagent-prompts (contract packaging) · requesting-review (review depth by mode) · receiving-code-review (adjudicate findings before fixing) · verification-before-completion (evidence) · systematic-debugging (root-cause a failed/blocked unit before re-dispatching) · dispatching-parallel-agents (parallel + file ownership) · finishing-a-development-branch (integrate when all units are done).

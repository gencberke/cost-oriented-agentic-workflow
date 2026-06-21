---
name: writing-plans
description: Use when you have a design or requirements for a multi-step task under the cost-oriented workflow, before touching code — produces the plan/task file, the anchor header, and right-sized tasks with pinned interfaces.
---

# Writing Plans

The plan is two things at once: the **contract** execution-routing runs, and the **anchor** that survives compaction. Write it so a subagent with zero session context can execute one task from it, and so you can recover your place after a compaction by re-reading it.

**Save to:** `docs/plans/YYYY-MM-DD-<feature>.md` (or the harness plan file; user preferences override). Announce: "Using writing-plans to write the plan."

## Anchor header (REQUIRED — the very top of the file)

This block is the compaction lifeline. Keep it current; it is the cheap artifact you re-read each loop.

```markdown
> **Cost-oriented workflow — anchor. Re-read this block each loop.**
> MODE: standard | production
> ROUTING: brainstorm-gate → this plan/contract → delegate-by-contract-cost (inline when the contract would cost more than the code) → review-per-risk-matrix → verify-before-done
> CADENCE: continuous — run planned tasks without pausing; STOP only on: blocked · decision ambiguity · plan/code conflict · scope or risk escalation · external/irreversible action · retry budget exhausted · new credential or permission · failed baseline/verification · human asked to checkpoint
> ON RESUME/COMPACTION: re-invoke cost-oriented-agentic-workflow:using-cost-oriented-workflow, then trust this file + the per-worktree ledger (`<repo-root>/.cost-oriented-agentic-workflow/run/progress.md`) + git log over memory. The ignored workspace can be removed by `git clean -fdx`; git log remains the fallback.

# [Feature] Plan

**Goal:** [one sentence]
**Approach:** [2-3 sentences]

## Global Constraints
[Project-wide binding requirements — version floors, dependency limits, naming/copy
rules, platform requirements — one line each, exact values verbatim. Every task
implicitly includes this section; the reviewer reads it as its attention lens.]

---
```

## Decomposition (C3 — mandatory, granularity scales with complexity)

Before tasks, map which files each task creates/modifies and its one responsibility. Files that change together live together; split by responsibility, not by technical layer. A **task** is the smallest unit that carries its own verification and is worth a fresh reviewer's gate — fold setup/scaffolding/docs into the task whose deliverable needs them. Simple work → few tasks; complex work → more, smaller tasks. Merge two items into one task only when they share the **same responsibility and the same seam** (e.g. two edits to one method); items that touch the *same file* but different responsibilities stay **separate and sequential** — same-file ≠ same-unit, and overlapping edits are sequenced, never parallelized.

## Task structure

Use `### Task N:` headings exactly (the `task-brief` script extracts by "Task N").

````markdown
### Task N: [Component]

**Files:**
- Create: `exact/path.ext`
- Modify: `exact/existing.ext`

**Interfaces (pin the seams — D4):**
- Consumes: [what earlier tasks expose — exact signatures]
- Produces: [exact names/types later tasks rely on — the implementer sees only
  this task, so this is how neighbors learn its surface]

**Risk:** elevated | high — [one-line reason]   ← omit this line when low (low is the default)
**Acceptance:** [observable criteria — what "done" means for this task]
**Verify:** `exact command` → expected result
````

Set **Risk** by the hard-exclusion list + blast-radius principle in using-cost-oriented-workflow (auth, migrations, money, privacy, shared state, public API, dependencies, prod/CI config, irreversible side effects → elevated or high regardless of size). It drives review depth downstream, so a task that touches those gets its level recorded even when its diff is tiny. For **elevated/high** tasks, write **behavioral** Acceptance and a Verify that exercises it — the observable behaviors the change must exhibit (e.g. "expired token → 401, not 500"), not "compiles".

- **standard mode:** pin the interface, acceptance, and the verify command; leave the interior to the implementer. You need not pre-write every line of code.
- **production mode:** also write bite-sized steps with the actual test and implementation code (TDD), exact commands, and expected output — see test-driven-development.

## No placeholders

These are plan failures — never write them: "TBD"/"TODO"/"implement later"; "add appropriate error handling/validation"; "write tests for the above" without the criteria; "similar to Task N" (state it); references to types/functions defined in no task. In production, code steps must show the code.

## Self-review (you run this — not a subagent)

1. **Coverage:** point each spec requirement to a task; list gaps and fill them.
2. **Placeholder scan:** fix any of the above.
3. **Interface consistency:** names/signatures used in later tasks match what earlier tasks Produce. `clearLayers()` in Task 3 vs `clearFullLayers()` in Task 7 is a bug.
4. **Internal consistency:** the Global Constraints, each task's Interfaces, and each task's Acceptance must not contradict each other or themselves — a field the constraints say to *keep* but an acceptance calls "ignored"; a heuristic whose condition (`A or B present`) differs from its acceptance (`only B`). These are the conflicts execution-routing's pre-flight scan must also catch. **Re-run items 3-4 after any mid-flight edit to the plan** — a correction that touches one section but not the others is how contradictions get introduced.

Fix inline; no re-review needed.

## Handoff

Plan saved and anchor header in place → invoke **`cost-oriented-agentic-workflow:execution-routing`** to implement task-by-task. Do not invoke any other skill here.

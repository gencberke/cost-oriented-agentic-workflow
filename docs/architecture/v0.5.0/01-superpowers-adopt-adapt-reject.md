# 01 — Superpowers Adopt / Adapt / Reject

Authoritative source inspected: **Superpowers 6.0.3** (local cache
`C:\Users\gencberke\.claude\plugins\cache\claude-plugins-official\superpowers\6.0.3`,
author Jesse Vincent, MIT). COW is already a cost-tuned fork of Superpowers'
`using-superpowers` + `subagent-driven-development` + `systematic-debugging`; this
matrix records what 0.5.0 keeps, changes, or refuses, **with attribution** so
patterns are adapted rather than copied blindly (`10` self-review point 8).

Legend: **ADOPT** = use as-is in spirit; **ADAPT** = use a cost/enforcement-tuned
variant; **REJECT** = deliberately not used; **DEFER** = revisit in a later phase.

## Summary matrix

| # | Superpowers pattern (6.0.3 file) | Verdict | COW 0.5.0 home |
|---|---|---|---|
| 1 | Skill-first process selection (`using-superpowers`) | **ADAPT** | entry skill + SessionStart pointer + (Phase 5) hook backstop |
| 2 | systematic-debugging 4 phases + Iron Law (`systematic-debugging`) | **ADAPT** | `systematic-debugging` + dual-routing + state phase |
| 2b | Phase-1.4 "add diagnostic instrumentation" (same) | **ADAPT** | split tracked vs ephemeral; tracked ⇒ re-route |
| 3 | Fresh subagent per task (`subagent-driven-development`) | **ADOPT→formalize** | `cow-implementer` plugin agent |
| 4 | Task review (spec+quality) (`subagent-driven-development`, `requesting-code-review`) | **ADOPT** | `cow-reviewer` + mode/risk matrix |
| 5 | Whole-work review (`requesting-code-review/code-reviewer.md`) | **ADOPT** | execution-routing terminal + `cow-reviewer`/Opus |
| 6 | Complete plan/task contracts (`writing-plans`) | **ADOPT** | `writing-plans` (KEEP) |
| 7 | SessionStart full entry-skill injection (`hooks/session-start`) | **ADAPT** | lean pointer + sentinel + state line |
| 8 | Worktree discipline (`using-git-worktrees`, `dispatching-parallel-agents`) | **ADAPT / REJECT-auto** | manual/production only; agent `isolation` OFF |
| 9 | Pressure testing (`tests/explicit-skill-requests`, `tests/claude-code`) | **ADOPT→extend** | route-only + hook-decision + agent-contract evals |
| 10 | Continuous execution (`subagent-driven-development`) | **ADOPT** | entry-skill cadence (KEEP) |
| 11 | Fixed retry / "3+ fixes = architecture" (`systematic-debugging`, SDD) | **ADOPT** | bounded retries + state counters |
| 12 | `executing-plans` (parallel-session fallback) | **REJECT** | COW is single-session; not shipped |
| 13 | Forbidden "You're absolutely right!" (`receiving-code-review`) | **ADOPT** | `receiving-code-review` (KEEP) |
| 14 | Domain map before parallel dispatch (`dispatching-parallel-agents` Step 1) | **ADOPT** | dual-routing discovery axis |

COW additions **not** present in SP 6.0.3 (kept, not from SP): mode/risk review
matrix; finding **causality** (introduced/worsened/pre-existing) — SP's
`code-reviewer.md` has no causality axis; task-scoped review packages with
extended context; controller-per-unit commit policy; immutable merge-base/base
recording; offline token analyzer + hidden-ground-truth review fixtures.

## Per-pattern detail

### 1 — Skill-first process selection — ADAPT
- **Original:** `using-superpowers` mandates invoking any plausibly-relevant skill
  *before any response or action* ("even 1% chance"), wrapped in
  `<EXTREMELY-IMPORTANT>`, with a rationalization "Red Flags" table and
  process-skills-first ordering.
- **Why it works:** Pre-commits the model to the workflow before it can "just look."
- **Cost fit:** Supports it — routing before exploration prevents W1/W3 token waste.
- **COW change:** Keep the process-first ordering and the red-flags idea, but
  replace the stern `<EXTREMELY-IMPORTANT>` framing with COW's "anti-drift is
  structure, not stern wording" (already done in 0.3–0.4). 0.5.0 adds the
  *deterministic* backstop for the binary part: a PreToolUse hook (Phase 5) that
  denies a tracked edit when state shows no agreed route yet — turning W4 ("rules
  rationalized away") from prose-hope into enforcement. The skill remains
  authoritative for *meaning*; the hook only enforces position.
- **Regression risk:** Over-eager hook denies a legitimate trivial edit. Mitigation:
  hook keys off explicit state gates only, ships shadow→standard→strict (`04`).

### 2 — systematic-debugging phases + Iron Law — ADAPT
- **Original:** Four phases (Root Cause → Pattern → Hypothesis → Implementation),
  Iron Law "NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST", "3+ fixes ⇒ question
  architecture".
- **Why it works:** Root-cause-first is cheaper than guess-and-check thrashing.
- **Cost fit:** Strong. COW already adopted the Iron Law + the 3-fix stop.
- **COW change:** Keep all of it; add the **discovery axis** (W2): diagnosis is its
  own routing decision (`controller-map` | `investigator` | `parallel-investigators`)
  recorded in state, separate from implementation routing. The state `phase` makes
  "are we still in read-only diagnosis?" machine-checkable for hooks.
- **Regression risk:** Adding routing ceremony to a one-line bug. Mitigation: a bug
  with an obvious root cause stays a single controller-map → light-inline (eval
  scenario `one-bug-obvious-root-cause`).

### 2b — Phase-1.4 "add diagnostic instrumentation" — ADAPT (the key tension)
- **Original:** SP `systematic-debugging` Phase 1 step 4 instructs, for
  multi-component systems, to **add diagnostic instrumentation** (logging at
  component boundaries) *before* proposing fixes — i.e. it edits code during
  diagnosis.
- **Why it works for SP:** Surfaces which layer fails.
- **Cost/safety fit for COW:** Partial — COW 0.4.1 found this is exactly W5: a
  *tracked* diagnostic edit silently inheriting the light diagnosis route.
- **COW change:** Split "instrumentation" into **ephemeral** (untracked scratch,
  scratch logging, throwaway repro — still allowed read-only diagnosis) vs
  **tracked** (a dependency, harness, config, schema, committed test). The first
  *tracked* diagnostic edit **ends read-only diagnosis**: emit `Re-route:`, return
  to triage, open a planned elevated diagnostic unit. 0.5.0 makes the boundary
  enforceable: state `phase = diagnosis-readonly` + a PreToolUse hook on tracked
  Write/Edit (`04`).
- **Regression risk:** Blocking legitimate scratch logging. Mitigation: hook targets
  *tracked* paths only; ephemeral scratch lives in the ignored workspace.

### 3 — Fresh subagent per task — ADOPT → formalize as a plugin agent
- **Original:** SDD dispatches a fresh implementer per task with constructed
  context (never session history); returns status + files + one-line test summary.
- **Why it works:** Isolated context; controller stays lean.
- **Cost fit:** Core to COW. 0.4.x does this via prose + `general-purpose`.
- **COW change:** Promote to a **named plugin agent** `cow-implementer` with pinned
  `model`, `maxTurns`, `tools`, `disallowedTools`, `skills` (CC docs confirm all
  supported for plugin agents). This pins cost deterministically instead of relying
  on "always specify the model" prose (which W6 shows is skippable).
- **Regression risk:** A too-tight `maxTurns` aborts legitimate work. Mitigation:
  budgets calibrated in Phase 6 evals; BLOCKED handling unchanged.

### 4 — Task review (spec + quality) — ADOPT
- **Original:** SDD reviews each task (spec compliance AND code quality), independent
  reviewer, `review-package BASE HEAD` file, never `HEAD~1`.
- **COW change:** Keep, governed by COW's **mode/risk matrix** (a COW addition).
  Reviewer becomes `cow-reviewer` (independent instance, pinned model). Keep
  causality + task-scoped packages (COW additions).
- **Regression risk:** None expected; matrix preserved.

### 5 — Whole-work review — ADOPT
- **Original:** SP final review uses the most capable model on `MERGE_BASE..HEAD`.
- **COW change:** Keep at execution-routing terminal; standard→Sonnet,
  production→Opus. **Decided in `03`:** production final review uses a **separate
  model-pinned dispatch of `cow-reviewer` with `model: opus`** (or per-invocation
  override), not a distinct agent file — fewer agents, same independence.
- **Regression risk:** None; mirrors 0.4.x.

### 6 — Complete plan/task contracts — ADOPT
- **Original:** `writing-plans` requires Global Constraints (verbatim), Files,
  Interfaces, numbered code steps, and a "no placeholders" rule.
- **COW change:** Keep `writing-plans` essentially as-is; it already carries COW's
  outcome-boundary rule (0.4.1). State records `plan.status`/`plan.path`.
- **Regression risk:** None.

### 7 — SessionStart full entry-skill injection — ADAPT (lean)
- **Original:** SP/COW `hooks/session-start` injects the **entire** entry skill
  (~13 KB) on `startup|clear|compact`.
- **Why it works:** Guarantees the workflow is present.
- **Cost fit:** Poor at scale (W6) — full injection every session/compaction.
- **COW change:** Inject a **short pointer** (≤ ~30 lines): the `COW_ENTRY_INJECTED`
  sentinel, the one-line resume rule, and a one-line state summary
  (`cow-state status --oneline`). The full skill loads on demand via the `Skill`
  tool. CC docs: post-compaction re-attaches skills up to 5k/25k tokens anyway, so
  full injection is redundant.
- **Regression risk:** Model fails to load the entry skill when needed. Mitigation:
  pointer explicitly names the skill + the idempotency sentinel; evals
  `resume-after-new-session`, `compact-during-diagnosis`.

### 8 — Worktree discipline — ADAPT (manual) / REJECT (automatic)
- **Original:** SP uses git worktrees for isolation; `isolation: worktree` agent
  field exists (CC docs).
- **Decision:** COW keeps manual worktrees for **production/parallel-disjoint** work
  only (0.4.x rule). **Automatic `isolation: worktree` on agents is REJECTED for the
  baseline** because CC docs confirm it **branches from the default branch, not the
  parent HEAD**, which would detach `cow-implementer` from the feature branch and
  break controller-per-unit commits + immutable merge-base. File-ownership +
  sequential same-file rule remain the cheap isolation mechanism.
- **Regression risk:** Two writers on one file. Mitigation: overlapping-file work is
  sequenced (KEEP); enforced by `allowedPaths` + a Phase-5 hook.

### 9 — Pressure testing — ADOPT → extend
- **Original:** SP `tests/explicit-skill-requests/` drives `claude -p` and greps the
  stream-JSON for a `Skill` tool invocation (incl. multi-turn "skips skill after
  long conversation"); `tests/claude-code/*-integration.sh` runs a full SDD plan and
  asserts tool events + `npm test`. No `evals/` dir in 6.0.3 (drill not yet lifted).
- **COW change:** Adopt the `claude -p` + signal-grep mechanism for the cheap layer,
  but keep COW's honesty rule: a grep is a *signal*, not proof of behavior. Extend
  with COW's route-only fixtures (0.4.1) + new **hook-decision tests** (pure, no
  model) + **agent-contract tests** (frontmatter schema). Full layering in `05`.
- **Regression risk:** Treating regex as proof. Mitigation: explicit three-layer
  separation (schema / auto-signal / human adjudication) — already COW policy.

### 10 — Continuous execution — ADOPT
- **Original:** SDD: don't pause between tasks; only stop on BLOCKED / ambiguity /
  done.
- **COW change:** Keep COW's cadence + explicit STOP list (anchor). State counters
  make "budget exhausted" a hard, machine-checked STOP.
- **Regression risk:** None.

### 11 — Fixed retry behavior — ADOPT
- **Original:** SP implementer retry only with changed conditions; "3+ fixes ⇒
  architecture".
- **COW change:** Keep COW's bounded **2 extra attempts** + **2 remediation waves**;
  0.5.0 records them as **state counters** so resume can't reset the budget (fixes
  the 0.4.x prose-only persistence). `budget exhausted ≠ approved` preserved.
- **Regression risk:** Counter desync after corruption. Mitigation: counters
  reconstruct conservatively (treat unknown as exhausted-safe); `04` corruption rule.

### 12 — `executing-plans` — REJECT
- COW is single-session controller+subagents; the parallel-session fallback adds no
  value and would split the source-of-truth. Not shipped.

### 13 — Anti-sycophancy in review receipt — ADOPT
- `receiving-code-review`'s "evaluate, don't auto-apply" + forbidden performative
  agreement is already COW's `receiving-code-review`. KEEP.

### 14 — Domain map before parallel dispatch — ADOPT
- SP `dispatching-parallel-agents` Step 1 "Identify Independent Domains" is exactly
  COW's discovery-routing trigger: a cheap domain map precedes any parallel
  investigator dispatch. Formalized as `discoveryRoute` in `02`.

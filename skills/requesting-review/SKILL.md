---
name: requesting-review
description: Use after a unit or branch of work is implemented, before claiming done or merging — dispatches an independent reviewer (a different instance from the writer) and scales depth to mode and risk.
---

# Requesting Review

A reviewer that reads its own diff (on its own cheap tokens) and returns a verdict keeps the controller lean while still gating quality. **The reviewer is always a different instance from the writer** — a writer reviewing itself is not review.

## Two scopes

- **Per-task** (inside execution-routing, when the task's risk calls for it — see the matrix below): use [execution-routing/task-reviewer-prompt.md](../execution-routing/task-reviewer-prompt.md) — spec compliance + code quality on one task's diff.
- **Whole-work** (once, at the end of a branch/feature): use [code-reviewer.md](code-reviewer.md) — broad plan-alignment, architecture, integration.

## Who reviews, and when (the risk matrix governs)

The risk matrix in using-cost-oriented-workflow decides *whether* an independent review happens; mode decides *how deep*. The reviewer always reads its own diff from a package file (`execution-routing/scripts/review-package BASE HEAD`) on its own cheap tokens.

**Per task:**
- **Risk low** → the implementer's self-review is the per-task gate. Don't dispatch a separate reviewer for every low-risk task — the one whole-work review at the end is the independent gate. (This is the cost-optimal default.)
- **Risk elevated** → independent reviewer when the change is non-obvious (judgment).
- **Risk high** → an independent reviewer is **required**, even when you wrote the unit inline. The controller reading sensitive code itself is both expensive and not independent — dispatch a *different Sonnet instance* (Opus or security-lensed in production); do not self-review it. And don't pre-focus that review on the risk you already suspect — a review handed your hypothesis only *confirms* it. Give at least one reviewer the **raw diff + a general security lens** so it can surface the blind spot you didn't think to ask about (discovery, not just confirmation).

**Whole-work review (once, at the end of planned multi-task work) — required.** Dispatch the broad reviewer over the full branch diff ([code-reviewer.md](code-reviewer.md)): standard → a Sonnet instance; production → Opus or an Opus subagent. If the branch touched **security-sensitive** surfaces (auth, secrets, permissions, tokens, data exposure, injection, dependency or migration changes), add the **security lens** — our own reviewer pointed at those risks, no external plugin. See the security block in code-reviewer.md.

After the independent review, you (Opus) take a **thin seam/diff-level glance** at the verdict and the integration points — a glance, not a re-investigation, and never a substitute for the independent review the matrix requires.

## Reviewer construction (discipline)

- **Don't pre-judge.** Never tell a reviewer what *not* to flag, and never pre-rate a finding's severity ("treat as Minor at most"). A human decision goes in as a **binding requirement to check** — "Binding decision: X — review the implementation against it" — never "X is intentional, do NOT flag it"; the reviewer can still flag a *bad implementation* of X. If you think something is a false positive, let the reviewer raise it and adjudicate in the loop.
- **Constraints travel with the brief.** `task-brief` embeds the plan's Global Constraints into the brief file, so the reviewer reads them there — no hand-copying the whole plan. In the dispatch prompt itself, also paste the *short* binding constraints inline as the attention lens (a few lines is nearly free and keeps them front-and-center), and point to the brief for the rest. Never reduce them to a vague "read the contract."
- **Hand the diff as a file** (review-package), never pasted. The package never enters your context.
- **One task's worth of scope.** The dispatch describes the work under review, not the session's history.

## The loop

Reviewer returns a verdict + findings (Critical/Important/Minor). Adjudicate them before applying — see receiving-code-review (evaluate each finding, don't auto-apply or perform agreement). Dispatch a fix subagent for Critical/Important (one fixer with the full findings list, not one per finding); record Minor findings for the whole-work review to triage.

**Re-review after a Critical/Important fix is mandatory and targeted.** The fix is new code no independent eye has seen, often in the riskiest spot — skipping its review to save tokens is the worst place to economize. Give the reviewer (a *fresh instance*, not the writer or the fixer) the prior findings, the fix commit range, the affected seam/context, and the fix's test evidence; it re-checks the fix, not the whole branch — and for high-risk code it confirms a **regression test** now reproduces-then-prevents the bug (a fix to risky code without a test that would catch its return isn't done; no test infra → a surfaced decision, not a silent skip). Don't move on with open Critical/Important items. A finding that conflicts with what the plan mandates is the human's call — present both, ask which governs.

**A pre-existing Critical/Important is a distinct decision, not a polish item.** When a review surfaces something already broken that this work left untouched, don't fold it into a flat "which nits should I fix?" list. Present it by severity as its own call: *fix it under newly-approved scope*, or *proceed with explicit, recorded risk acceptance*. A hardcoded secret is the canonical case — moving it to an env var is not a fix: if it was ever committed it is compromised, so the decision includes **rotating it and assessing the git-history exposure**.

Verdicts and findings come back as text; the diff stays in the file. Your context holds the verdict, not the code.

---
name: requesting-review
description: Use after a unit or branch of work is implemented, before claiming done or merging — dispatches an independent reviewer (a different instance from the writer) and scales depth to mode and risk.
---

# Requesting Review

A reviewer that reads its own diff (on its own cheap tokens) and returns a verdict keeps the controller lean while still gating quality. **The reviewer is always a different instance from the writer** — a writer reviewing itself is not review.

## Two scopes

- **Per-task** (inside execution-routing, when the mode/risk matrix calls for it): use [execution-routing/task-reviewer-prompt.md](../execution-routing/task-reviewer-prompt.md) — spec compliance + code quality on one task's diff.
- **Whole-work** (once, at the end of a branch/feature): use [code-reviewer.md](code-reviewer.md) — broad plan-alignment, architecture, integration.

## Who reviews, and when (the risk matrix governs)

The risk matrix in using-cost-oriented-workflow decides *whether* an independent review happens; mode decides *how deep*. The reviewer always reads its own diff from a package file on its own cheap tokens: per-task uses `execution-routing/scripts/review-package BASE HEAD -- PATH...` with the plan's exact `Files`; whole-work omits paths and reads committed branch work from a clean tree.

**Per task:** standard/low → self-review; standard/elevated → independent review when non-obvious; standard/high → required. Production → every planned task required. The reviewer is always a different Sonnet instance, including production. For security-sensitive work, give the raw diff + general security lens rather than only your suspected bug, preserving discovery.

**Whole-work review:** standard → Sonnet; production → Opus/Opus subagent. Production never skips it. Standard requires it for multi-task plans and for a single planned unit that had no independent task review. Add the [code-reviewer.md](code-reviewer.md) security lens when applicable.

After the independent review, you (Opus) take a **thin seam/diff-level glance** at the verdict and the integration points — a glance, not a re-investigation, and never a substitute for the independent review the matrix requires.

## Reviewer construction (discipline)

- **Don't pre-judge.** Never tell a reviewer what *not* to flag, and never pre-rate a finding's severity ("treat as Minor at most"). A human decision goes in as a **binding requirement to check** — "Binding decision: X — review the implementation against it" — never "X is intentional, do NOT flag it"; the reviewer can still flag a *bad implementation* of X. If you think something is a false positive, let the reviewer raise it and adjudicate in the loop.
- **Constraints travel with the brief.** `task-brief` embeds the plan's Global Constraints into the brief file, so the reviewer reads them there — no hand-copying the whole plan. In the dispatch prompt itself, also paste the *short* binding constraints inline as the attention lens (a few lines is nearly free and keeps them front-and-center), and point to the brief for the rest. Never reduce them to a vague "read the contract."
- **Hand the diff as a file** (review-package), never pasted. The package never enters your context.
- **One task's worth of scope.** The dispatch describes the work under review, not the session's history.

## The loop

Adjudicate the verdict before applying it — see receiving-code-review. For accepted introduced/worsened Critical/Important findings, use execution-routing's two-wave remediation gate: one fixer for the full list + covering tests + a fresh targeted reviewer. For high-risk behavior, require a regression test (no test infra → surfaced decision). Never move on with open Critical/Important findings; budget exhaustion is not approval.

**A pre-existing Critical/Important is a distinct decision, not a polish item.** When a review surfaces something already broken that this work left untouched, don't fold it into a flat "which nits should I fix?" list. Present it by severity as its own call: *fix it under newly-approved scope*, or *proceed with explicit, recorded risk acceptance*. A hardcoded secret is the canonical case — moving it to an env var is not a fix: if it was ever committed it is compromised, so the decision includes **rotating it and assessing the git-history exposure**.

Verdicts and findings come back as text; the diff stays in the file. Your context holds the verdict, not the code.

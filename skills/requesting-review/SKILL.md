---
name: requesting-review
description: Use after a unit or branch of work is implemented, before claiming done or merging — dispatches the exact scoped cow-reviewer (a different instance from the writer) and scales depth to mode and risk.
---

# Requesting Review

A reviewer that reads its own diff (on its own cheap tokens) and returns a verdict keeps the controller lean while still gating quality. **The reviewer is always a different instance from the writer** — a writer reviewing itself is not review.

## Who reviews: the exact scoped `cow-reviewer`

Every independent review is dispatched to `cost-oriented-agentic-workflow:cow-reviewer` (Sonnet, read-only). **Name it explicitly — never rely on automatic agent selection, never fall back to a generic reviewer.** It has no Write/Bash: it returns a compact JSON report (schema v1) that the controller persists and validates with `review-report.mjs` **before adjudicating**. The report is **evidence**, not a workflow decision.

## When, and at what scope (the matrix governs)

The mode/risk matrix in using-cost-oriented-workflow decides *whether* an independent review happens; mode decides *how deep*. Integration changed the mechanism, **not** the policy — a `none` cell still means no per-task reviewer, even though the agent now exists. Scopes: `UNIT_REVIEW`, `TARGETED_REREVIEW`, `WHOLE_WORK_REVIEW`. **Whole-work** runs once at the branch end: standard → Sonnet; **production → a per-invocation `model: opus` override** of the same `cow-reviewer` (not a fifth agent); production never skips it. Matrix, scopes, whole-work conditions, and the package/report contract live in the execution-routing references: [review-routing.md](../execution-routing/references/review-routing.md) · [review-package.md](../execution-routing/references/review-package.md).

After the independent review, you (Opus) take a **thin seam/diff-level glance** at the verdict and integration points — a glance, never a substitute for the review the matrix requires.

## Construction + the loop

Hand the diff as a **file** (it never enters your context). **Don't pre-judge:** never tell a reviewer what *not* to flag or pre-rate a severity; a human decision goes in as a **binding requirement to check**, never "X is intentional, do NOT flag it". For security-sensitive work give the raw diff + a general security lens ([code-reviewer.md](code-reviewer.md)).

**Adjudicate before applying** — verify each finding against the diff/plan/report/files and decide `ACCEPT`/`REJECT`/`DEFER_PRE_EXISTING`/`REQUEST_CLARIFICATION` (see receiving-code-review + [review-adjudication.md](../execution-routing/references/review-adjudication.md)). Only accepted introduced/worsened Critical/Important findings start a bounded **two-wave** remediation (fresh fixer + tests, then a fresh `TARGETED_REREVIEW`): [remediation-and-rereview.md](../execution-routing/references/remediation-and-rereview.md). A pre-existing Critical/Important is a distinct decision (fix under newly-approved scope, or recorded risk acceptance — a hardcoded secret means rotate + assess history), never folded into a nit list. Never move on with open Critical/Important findings; budget exhaustion is not approval.

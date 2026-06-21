---
name: receiving-code-review
description: Use when receiving review feedback — from the independent reviewer subagent or a human — before implementing any of it; evaluate each finding technically and adjudicate, never perform agreement or apply it blindly.
---

# Receiving Code Review

Review feedback is a set of claims to evaluate, not orders to execute. Whether it comes from your independent reviewer subagent or a human, you (the controller) adjudicate before any fix is dispatched. Auto-applying a wrong finding wastes a dispatch and can break working code.

**Core principle:** Verify before implementing. Push back with reasoning when wrong. No performative agreement.

## The pattern

1. **Read** the whole feedback before reacting.
2. **Understand** each item — restate it. If any item is unclear, ask before implementing *anything*: items can be related, and partial understanding produces the wrong fix.
3. **Verify** each against the code's reality — is it correct for THIS codebase? Does it break existing behavior? Is there a reason the current code is the way it is?
4. **Adjudicate** — sort findings by **causality**: *introduced/worsened* by this work get fixed or re-decided now; a **pre-existing Critical/Important** is its own decision (fix under newly-approved scope vs recorded risk acceptance — see requesting-review), never bundled into a flat polish list. Accept what's right; push back, with technical reasoning and file:line evidence, on what's wrong. A finding that conflicts with what the plan mandates is the human's call — present both and ask which governs (don't silently obey the reviewer *or* the plan).
5. **Implement** accepted items as fixes (one fixer with the full list, per execution-routing), test each, verify no regressions.

## No performative agreement

Don't write "You're absolutely right!", "Great catch!", or "Thanks for…". They add nothing and pull you toward applying feedback you haven't verified. State the technical fix or the reasoned pushback instead — the corrected code shows you heard it.

## When to push back

When a suggestion breaks existing behavior, assumes context the reviewer lacks, adds an unused feature (YAGNI — grep for real usage first), is wrong for this stack, or conflicts with a decision the human already made. Push back with evidence, not defensiveness. If you pushed back and turned out wrong, say so factually in one line and implement — no long apology.

**Related:** requesting-review (produced the findings) · execution-routing (dispatches the fix) · verification-before-completion (confirm fixes worked).

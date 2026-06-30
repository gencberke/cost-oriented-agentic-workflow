---
name: test-driven-development
description: Use in production mode, or when the human asks for TDD, before writing implementation code — write the failing test first, watch it fail, write minimal code to pass, then refactor.
---

# Test-Driven Development

**Mode note:** This discipline is for **production** work, or when the human explicitly asks for it. In **standard** mode, write only the tests that genuinely protect the change (execution-routing decides) — do not impose full TDD on every small task.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Wrote code before the test? In production, that's a violation — the test written after just asserts "what the code does", not "what it should do".

## RED — GREEN — REFACTOR

1. **RED:** write one test for the next behavior. Run it. **Watch it fail**, and confirm it fails for the right reason (not a typo, not a missing import). A test you never saw fail proves nothing.
2. **GREEN:** write the *minimal* code to make it pass. No extra features (YAGNI). Run it — see it pass.
3. **REFACTOR:** clean up names, duplication, structure while the test stays green. Re-run.

Repeat per behavior. Record each green checkpoint with its test evidence. A plugin implementer never commits; the controller owns controlled commits after review and verification.

## What a good test verifies

- **Real behavior, not mocks.** A test that only asserts a mock was called proves nothing about the system.
- **The edge cases the task cares about** — not every theoretical input.
- **Pristine output** — no stray warnings or noise; warnings are findings.

## Red flags — STOP

- "I'll write the test after" — tests-after rationalize the code that exists.
- "Too simple to test" — simple code breaks; the test is 30 seconds.
- "I already manually tested it" — manual ≠ a repeatable regression test.
- A regression test you never watched fail — revert the fix, run it, confirm it goes red, restore.

## Verification

Claiming the tests pass requires running them and reading the output this turn — see verification-before-completion.

In production, the implementer's report must show the **RED evidence** (the failing test first, failing for the right reason) and the **GREEN evidence** (passing after the minimal implementation) — not just a final green. That RED→GREEN trail is the auditable proof TDD was actually followed; a test only ever seen passing proves nothing about the order.

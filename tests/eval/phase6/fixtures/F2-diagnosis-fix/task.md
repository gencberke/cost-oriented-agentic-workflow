# F2 — Diagnosis and fix

You are working in a disposable repository. A module `src/normalize.js` has a
reproducible bug: for a specific input it returns the wrong output. The test
`test/normalize.test.mjs` currently fails for that input.

## Task

Diagnose the root cause before modifying anything. Then fix the root cause so
the failing test passes without introducing new failures. Do not mask the
symptom; address the actual cause.

## Verification command

```text
node --test test/normalize.test.mjs
```

## Acceptance

- The previously failing test passes.
- No new failing tests are introduced.
- The fix addresses the root cause, not the symptom.

---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs — requires running the verification command and reading its output before any success claim; evidence before assertions always.
---

# Verification Before Completion

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always. Violating the letter of this rule violates its spirit.

## The Iron Law

```
NO COMPLETION CLAIM WITHOUT FRESH VERIFICATION EVIDENCE
```

Evidence is fresh only for the exact state that produced it. A run from this turn may satisfy later checks without duplication only while HEAD, index, and working tree are unchanged. Any state change invalidates it; a merge always requires a new run on the merged result.

## The gate

```
BEFORE claiming any status or expressing satisfaction:
1. IDENTIFY  — which command proves this claim?
2. RUN       — execute the full command unless this turn already has evidence for the identical state
3. READ      — full output, exit code, failure count, and how many tests ran
4. VERIFY    — does the output actually confirm the claim?
5. ONLY THEN — make the claim, with the evidence
Skip a step = claiming, not verifying.
```

## Common failures

| Claim | Requires | Not sufficient |
|-------|----------|----------------|
| Tests pass | Test output: **N tests ran, 0 failed** (N>0) | "should pass", a previous run, **a green run that discovered 0 tests** |
| Linter clean | Linter output: 0 errors | partial check |
| Build succeeds | Build command: exit 0 | "linter passed" |
| Bug fixed | Original symptom retested: passes | code changed, assumed fixed |
| Subagent completed | The diff/VCS shows the changes | the agent reported "success" |
| Requirements met | Line-by-line checklist | tests passing |

Note the last two: a **subagent reporting success is a claim, not evidence** — check the diff. "Tests pass" is not "requirements met" — re-read the plan and check each line.

**Zero tests is not a pass.** A test command that compiles and exits 0 having discovered **no tests** proves nothing — report it honestly ("test lifecycle exited 0; no automated tests found"), never as "tests passed". Then decide whether this change needed one: by the risk matrix, high-risk work and any fixed Critical/Important behavior bug want a regression test before the unit is called done (see writing-plans, requesting-review).

## Red flags — STOP

- "should", "probably", "seems to"
- "Great!"/"Perfect!"/"Done!" before running verification
- about to commit/push/PR unverified
- trusting a subagent's success report
- "just this once" / "I'm tired" / "I'm confident"
- any wording implying success without having run the command

| Excuse | Reality |
|--------|---------|
| "Should work now" | Run it. |
| "I'm confident" | Confidence ≠ evidence. |
| "Subagent said success" | Verify against the diff. |
| "Partial check is enough" | Partial proves nothing. |
| "Different words, so the rule doesn't apply" | Spirit over letter. |

## Bottom line

Run the command. Read the output. Then claim the result. No shortcuts.

---
name: systematic-debugging
description: Use when you hit a bug, test failure, or unexpected behavior, before repository inspection or any fix — diagnose the root cause, then return to implementation triage because guess-and-check is the most expensive loop.
---

# Systematic Debugging

A bug is where the cost-oriented workflow leaks the most tokens. Guessing — change something, re-run, change something else — burns a controller turn or a subagent dispatch per attempt and routinely costs more than the task that introduced it. Root-cause-first is not rigor for its own sake; it is the cheaper path.

## The Iron Law

```
NO FIX WITHOUT ROOT CAUSE FIRST
```

You may not propose or dispatch a fix until you can name *why* it breaks. "Try X and see" is not a hypothesis.

## Diagnosis lane

This skill owns diagnosis, not implementation routing. Existing tests, git history, logs, searches, and read-only inspection are diagnosis. A tracked diagnostic edit, new test dependency, or test harness is implementation scope: stop and return to size/risk triage before writing it — read-only diagnosis ends at that first tracked edit.

For multiple symptoms, make one cheap domain map first. If they plausibly share state or a root cause, investigate together (sequential diagnosis stays valid — do not force investigators from symptom count alone). If the map evidences disjoint subsystems and non-overlapping scopes, invoke `cost-oriented-agentic-workflow:dispatching-parallel-agents` and dispatch one read-only Sonnet investigator per problem domain. **Route this from the domain map, not from the eventual fix size:** disjoint-domain diagnosis delegation is decided independently of how small the fixes look, and apparent smallness never keeps the token-heavy investigation in the controller. Smallness shapes implementation routing only after diagnosis.

**The first tracked diagnostic edit is a route transition.** Emit the visible `Re-route:` receipt before that first tracked edit, never after it, then return to triage: a new dependency, package manifest, configuration, integration harness, tracked diagnostic test, migration, or schema becomes a planned elevated diagnostic unit (writing-plans → execution-routing). User approval of a diagnostic technique answers "may we use this method?", not "how is this expanded work routed?" — approval never preserves the earlier light-inline route. A temporary diagnostic dependency or harness carries an explicit cleanup disposition: removed once evidence is collected, or deliberately retained as a justified regression test.

## The loop (compressed)

1. **Root cause.** Read the actual error and stack trace — they often name the fix. Reproduce it reliably (if you can't, gather data; don't guess). Check what changed recently (`git diff`, new deps, config). Trace the bad value back to where it originates and fix it at the source, not where the symptom surfaced.
2. **Pattern.** Find similar working code in the repo; list every difference from the broken path, however small. The difference is usually the cause.
3. **Hypothesis.** State one: "X is the root cause because Y." Make the smallest change that tests it — one variable at a time. Wrong? Form a new hypothesis; don't stack fixes on top of each other.
4. **Hand off.** State the evidenced root cause and the smallest behavior that would prove it fixed. Return to using-cost-oriented-workflow's implementation triage. That route decides inline vs plan/delegate; only then write the failing regression test, implement, and verify.

## Stop condition: 3 fixes failed → question the architecture

If each fix reveals a new problem somewhere else, or a fix would need "massive refactoring," the pattern is wrong — not the attempt. Stop and bring it to the human as a design conversation. A fourth guess is the most expensive thing you can do here.

This **replaces a blind retry.** In execution-routing a subagent's retry budget is for *changed* conditions (more context, a better model, a smaller scope); a bug is a root-cause investigation first, never a re-dispatch of the same guess.

## Red flags — STOP, return to root cause

- "Quick fix for now, investigate later" — the first fix sets the pattern; do it right.
- "Just try changing X" — that is guessing; name the cause first.
- "One more attempt" after 2+ failures — that is the architecture signal, not bad luck.
- Several changes at once — you won't know which worked, and you'll add new bugs.
- A regression fix you never watched fail — revert it, confirm it goes red, restore.

## Cost note

Systematic is *faster and cheaper* than thrashing: a short root-cause pass spends no dispatch per wrong guess. When you delegate the fix, hand the subagent the root cause you found — not "make the test pass."

**Related:** dispatching-parallel-agents (disjoint diagnosis) · test-driven-development (the post-triage failing test) · verification-before-completion (confirm the fix worked) · execution-routing (where a BLOCKED or failed unit lands).

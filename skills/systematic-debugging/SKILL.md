---
name: systematic-debugging
description: Use when you hit a bug, test failure, or unexpected behavior, before repository inspection or any fix — diagnose the root cause, then return to implementation triage because guess-and-check is the most expensive loop.
---

# Systematic Debugging

A bug is where the workflow leaks the most tokens: guessing burns a controller turn or a dispatch per attempt and routinely costs more than the task that introduced it. Root-cause-first is the cheaper path, not rigor for its own sake.

## The Iron Law

```
NO FIX WITHOUT ROOT CAUSE FIRST
```

You may not propose or dispatch a fix until you can name *why* it breaks. "Try X and see" is not a hypothesis.

## Diagnosis lane

This skill owns diagnosis, not implementation routing. Existing tests, git history, logs, searches, and read-only inspection are diagnosis. A tracked diagnostic edit, new test dependency, or test harness is implementation scope: stop and return to size/risk triage before writing it — read-only diagnosis ends at that first tracked edit.

For multiple symptoms, make one cheap domain map first. If they plausibly share state or a root cause, investigate together (sequential diagnosis stays valid — do not force investigators from symptom count alone). If the map evidences disjoint subsystems and non-overlapping scopes, invoke `cost-oriented-agentic-workflow:dispatching-parallel-agents` and dispatch one read-only Sonnet investigator per problem domain. **Route this from the domain map, not from the eventual fix size:** disjoint-domain diagnosis delegation is decided independently of how small the fixes look, and apparent smallness never keeps the token-heavy investigation in the controller. Smallness shapes implementation routing only after diagnosis. Delegated diagnosis dispatches the exact `cost-oriented-agentic-workflow:cow-debug-investigator` (read-only, ≤2 for disjoint domains); record `processLane=debug`, `phase=diagnosis-readonly`, and the discovery route via `cow-state` **before** dispatch (detail: `using-cost-oriented-workflow/references/discovery-routing.md`).

**The first tracked diagnostic edit is a route transition.** Emit the visible `Re-route:` receipt before that first tracked edit, never after it, then return to triage: a new dependency, package manifest, configuration, integration harness, tracked diagnostic test, migration, or schema becomes a planned elevated diagnostic unit (writing-plans → execution-routing). User approval of a diagnostic technique answers "may we use this method?", not "how is this expanded work routed?" — approval never preserves the earlier light-inline route. A temporary diagnostic dependency or harness carries an explicit cleanup disposition: removed once evidence is collected, or deliberately retained as a justified regression test.

## The loop (compressed)

1. **Root cause.** Read the error and stack trace (they often name the fix). Reproduce reliably; if you can't, gather data, don't guess. Check what changed (`git diff`, new deps, config). Fix at the source, not where the symptom surfaced.
2. **Pattern.** Find similar working code; list every difference from the broken path. The difference is usually the cause.
3. **Hypothesis.** State one: "X is the root cause because Y." Make the smallest change that tests it — one variable. Wrong? New hypothesis; don't stack fixes.
4. **Hand off.** State the evidenced root cause and the smallest behavior that would prove it fixed. The **controller** (not the investigator) adjudicates the diagnosis and records it with `cow-state.mjs root-cause --status <evidenced|partial|requires-reroute|blocked>`; evidenced returns to using-cost-oriented-workflow's implementation triage with `implementationRoute` still **`pending`** (the legacy execution path is unchanged). A `REQUIRES_REROUTE: TRACKED_DIAGNOSTIC_INSTRUMENTATION` return forces the `Re-route:` before any tracked edit. Only then write the failing regression test, implement, and verify.

## Stop condition: 3 fixes failed → question the architecture

If each fix reveals a new problem, or a fix would need "massive refactoring," the pattern is wrong — not the attempt. Stop and bring it to the human. A subagent's retry budget is for *changed* conditions (more context, a better model, a smaller scope); a bug is root-cause-first, never a re-dispatch of the same guess.

## Red flags — STOP, return to root cause

- "Just try changing X" / "quick fix for now" — that is guessing; name the cause first.
- "One more attempt" after 2+ failures — that is the architecture signal, not bad luck.
- Several changes at once, or a regression fix you never watched go red — revert, reproduce, then fix.

When you delegate the fix, hand the subagent the root cause — not "make the test pass."

**Related:** dispatching-parallel-agents (disjoint diagnosis) · test-driven-development (the post-triage failing test) · verification-before-completion (confirm the fix worked) · execution-routing (where a BLOCKED or failed unit lands).

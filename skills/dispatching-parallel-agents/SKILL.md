---
name: dispatching-parallel-agents
description: Use when facing 2+ independent chunks (tasks or failures) that can be worked without shared state or sequential dependencies — dispatch one subagent per chunk with strict non-overlapping file ownership.
---

# Dispatching Parallel Agents

Independent chunks — separate subsystems, unrelated test failures, disjoint files — can be worked concurrently. Dispatch one subagent per chunk; let them run at once. This preserves your context for coordination and finishes N problems in the time of one.

**Core principle:** one subagent per independent chunk, each with its own isolated context that you construct.

## When to use

```dot
digraph w {
    "2+ chunks?" [shape=diamond];
    "Independent (no shared state, no ordering)?" [shape=diamond];
    "One subagent investigates/handles together" [shape=box];
    "Partition by file ownership" [shape=box];
    "Parallel dispatch (all in one response)" [shape=box];

    "2+ chunks?" -> "Independent (no shared state, no ordering)?" [label="yes"];
    "Independent (no shared state, no ordering)?" -> "One subagent investigates/handles together" [label="no - related/coupled"];
    "Independent (no shared state, no ordering)?" -> "Partition by file ownership" [label="yes"];
    "Partition by file ownership" -> "Parallel dispatch (all in one response)";
}
```

Do not dispatch from symptom count alone. First make a cheap domain map. Use parallel read-only investigators when that map evidences disjoint subsystems and non-overlapping scopes, even before each root cause is known. Keep one investigation when a shared root cause/state is plausible, fixing one may fix another, or full-system context is required.

## Strict file ownership (the conflict guard — D7)

Before an implementation dispatch, **partition the files** so each subagent owns a disjoint set. Two writing subagents must never edit the same file. A diagnosis dispatch is explicitly read-only and gets a bounded subsystem/path scope. State the scope in every prompt. This non-overlap — not a worktree — prevents collisions.

**Worktrees (D9):** not needed in standard single-stream work, and not needed for parallel work you can partition by file. **If two chunks would touch the same file, they are not parallelizable — sequence them; a worktree isolates checkouts but does not make concurrent edits to one file merge cleanly.** Reach for a git worktree only for production isolation, or to give disjoint parallel subagents their own checkouts. See using-git-worktrees.

## Dispatch

Issue all dispatches in **one response** — that is what makes them run in parallel (one per response is sequential). Each prompt is focused (one chunk), self-contained (all context it needs, constructed by you — never your session history), specific about owned files, and explicit about what to return. Always specify the model.

## Integrate

When they return: read each summary, check that changes don't conflict (they shouldn't, given disjoint ownership), run the full verification once over the combined result, and spot-check — parallel subagents can make the same systematic error independently.

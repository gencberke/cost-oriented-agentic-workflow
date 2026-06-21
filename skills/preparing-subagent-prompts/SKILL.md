---
name: preparing-subagent-prompts
description: Use when packing a dispatch prompt for an implementer or reviewer subagent — keeps the prompt to one task, hands bulk over as files, and pins exact values so a context-free subagent succeeds.
---

# Preparing Subagent Prompts

A subagent starts cold. It has none of your conversation. Your prompt must construct exactly what it needs — and nothing it doesn't, because everything you paste in (and everything it prints back) stays resident in your context and is re-read every later turn.

## One task, not the session's history

A dispatch describes **one task**: its requirements, the interfaces it touches, and the binding constraints. Never paste accumulated prior-task summaries ("state after Tasks 1-3"). A real session's dispatch hit 42k characters, 99% pasted history. A fresh subagent needs its task — nothing else.

## Hand bulk over as files

- **Workspace:** `execution-routing/scripts/cow-workspace` resolves the self-ignored, per-worktree artifact directory at `<repo-root>/.cost-oriented-agentic-workflow/run/`.
- **Brief:** `execution-routing/scripts/task-brief PLAN N` extracts the task to `task-N-brief.md` there. Point the dispatch at it: "read this first — it is your requirements, exact values verbatim." Exact values (numbers, magic strings, signatures, test cases) live only in the brief.
- **Report:** place `task-N-report.md` beside the brief; the subagent writes its full report there and returns only a short status.
- **Diff (for reviewers):** for a task, run `execution-routing/scripts/review-package BASE HEAD -- PATH...` with exactly its plan `Files`; for whole-work review, omit `-- PATH...` and require a clean current tree. Pass the resulting package path. It never enters your context.

## Pin the seams, free the interior

Specify between-unit facts exactly: file names, signatures, data shapes, how it integrates, acceptance criteria, the verification command. Leave the interior to the subagent. This is where drift gets confined to the cheap, catchable inside.

## Always specify the model

An omitted model silently inherits your expensive controller model. Writer = Sonnet high effort (Opus only for very large/complex production generation); reviewer = a different Sonnet instance.

## For reviewer prompts: don't pre-judge

Never tell a reviewer what *not* to flag, and never pre-rate a finding's severity. A human decision (e.g. "we deliberately set `verified=true` on register") goes in as a **binding requirement to check against** — write "Binding decision: X — review the implementation against it," never "X is intentional, do NOT flag it." The reviewer stays free to flag a *bad implementation* of the decision; you only remove its license to re-litigate the decision itself. The short binding Global Constraints go inline as the attention lens (and travel with the brief via `task-brief`); the process rules already live in the reviewer template.

## The return contract

State what to return: **status + files changed + one-line verification summary + concerns + the report-file path** (the implementer leaves work uncommitted; the controller commits after review — see execution-routing Commit policy). Code bodies and full diffs stay in files. Your context holds summaries and verdicts, never the code.

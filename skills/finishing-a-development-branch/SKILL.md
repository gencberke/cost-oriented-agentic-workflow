---
name: finishing-a-development-branch
description: Use when all units are implemented, reviewed, and verified and you need to integrate the work — verifies tests, detects the workspace, and presents merge/PR/keep/discard as concrete options instead of an open-ended question.
---

# Finishing a Development Branch

The work is done and reviewed; now integrate it deliberately. Don't ask "what next?" — verify, then present concrete options and execute the chosen one cleanly.

**Core:** verify tests → detect workspace → present options → execute → clean up.

## 1. Own final verification

Finishing owns the final evidence. Reuse a fresh run only when it was produced this turn against the identical HEAD and working-tree state; otherwise run the project's verification command and read its output. On failure, stop before offering merge/PR. A merge changes state, so always re-run on the merged result.

## 2. Detect the workspace and the base branch

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
BRANCH=$(git branch --show-current)

ROOT=$(git rev-parse --show-toplevel)
LEDGER="$ROOT/.cost-oriented-agentic-workflow/run/progress.md"
BASE_BRANCH=$(sed -n 's/^BASE_BRANCH:[[:space:]]*//p' "$LEDGER" | head -1)
MERGE_BASE_SHA=$(sed -n 's/^MERGE_BASE_SHA:[[:space:]]*//p' "$LEDGER" | head -1)
HEAD_SHA=$(git rev-parse HEAD)
```

Require the ledger values; do not redetect or recompute them here. Verify that
`BASE_BRANCH` resolves under `refs/heads/` and that `MERGE_BASE_SHA^{commit}`
resolves; stop if either check fails. `BASE_BRANCH` is the local branch name used
for merge options; `MERGE_BASE_SHA` remains the immutable review split point.

`GIT_DIR == GIT_COMMON` → normal checkout. `GIT_DIR != GIT_COMMON` → linked worktree. No `BRANCH` means detached HEAD: preserve `HEAD_SHA` for review/keep/PR and never offer local merge.

## 3. Present options (concrete, not open-ended)

Normal repo or named-branch worktree:

```
Implementation complete. What would you like to do?
1. Merge back to <BASE_BRANCH> locally
2. Push and open a Pull Request
3. Keep the branch as-is
4. Discard this work
```

Detached HEAD → only: 1. Push as a new branch + PR · 2. Keep as-is · 3. Discard.

## 4. Execute the choice

- **Merge:** from the main checkout — `git checkout <BASE_BRANCH> && git pull && git merge <branch>` → **re-run tests on the merged result** → then clean up the worktree (step 5) and `git branch -d <branch>`.
- **PR:** `git push -u origin <branch>`, then open the PR. **Keep the worktree** — the user iterates on feedback. Pushing is outward-facing: confirm before it (hard rule).
- **Keep:** report the branch and worktree path; change nothing.
- **Discard:** show exactly what will be deleted (branch + commit list + worktree) and require a typed `discard` to confirm. Only then clean up (step 5) and `git branch -D <branch>`.

## 5. Clean up (merge & discard only)

Only worktrees you created (under `.worktrees/`) are yours to remove. Run from the **main repo root**, never from inside the worktree being removed:

```bash
cd "$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)"
git worktree remove .worktrees/<branch>
git worktree prune
```

A harness-owned workspace is not yours — leave it in place. PR and Keep always preserve the worktree.

**Related:** verification-before-completion (step 1) · requesting-review (the whole-work review precedes this) · using-git-worktrees (created the workspace).

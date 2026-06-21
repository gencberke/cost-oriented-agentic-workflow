---
name: finishing-a-development-branch
description: Use when all units are implemented, reviewed, and verified and you need to integrate the work — verifies tests, detects the workspace, and presents merge/PR/keep/discard as concrete options instead of an open-ended question.
---

# Finishing a Development Branch

The work is done and reviewed; now integrate it deliberately. Don't ask "what next?" — verify, then present concrete options and execute the chosen one cleanly.

**Core:** verify tests → detect workspace → present options → execute → clean up.

## 1. Verify first

Run the project's test/verification command and read the output (verification-before-completion). If tests fail, **stop** — you cannot offer merge or PR until they pass. Show the failures and resolve them first (systematic-debugging if it's a real bug).

## 2. Detect the workspace and the base branch

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
BRANCH=$(git branch --show-current)

# Base BRANCH NAME (what you check out and merge into) — prefer the start branch the
# plan/ledger recorded; else the upstream's branch; else the first of main/master/develop.
BASE_BRANCH=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null | sed 's@^[^/]*/@@')
if [ -z "$BASE_BRANCH" ]; then
  for b in main master develop; do
    git show-ref --verify --quiet "refs/heads/$b" && { BASE_BRANCH=$b; break; }
  done
fi
# Split point (a SHA — for the review range / "split from", NOT something to check out):
BASE_COMMIT=$(git merge-base HEAD "$BASE_BRANCH" 2>/dev/null)
```

`BASE_BRANCH` is a branch **name** you check out and merge into; `BASE_COMMIT` is the split-point SHA — never `git checkout` a SHA as if it were a branch. If the plan recorded no start branch and detection is ambiguous, ask: "This branch split from `<BASE_BRANCH>` — correct?"

`GIT_DIR == GIT_COMMON` → normal checkout. `GIT_DIR != GIT_COMMON` → linked worktree (cleanup is provenance-based, step 5). No `BRANCH` (detached HEAD) → use the reduced menu (no local merge).

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

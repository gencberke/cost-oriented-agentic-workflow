---
name: using-git-worktrees
description: Use in production, or to give disjoint parallel subagents their own checkouts — create an isolated git worktree (preferring the harness's native tool) so concurrent work does not collide on one checkout. Overlapping-file work stays sequential, never split across worktrees.
---

# Using Git Worktrees

**When this applies (D9):** Most work does not need a worktree. Standard single-stream work shares the checkout fine, and parallel work is kept safe by **strict non-overlapping file ownership** (dispatching-parallel-agents). Reach for a worktree only when:

- you are in **production** and want the feature branch fully isolated from the main checkout, or
- you are running **disjoint** parallel subagents and want each in its own checkout for cleanliness (still under strict non-overlapping ownership).

A worktree is **isolation, not parallelization permission** — it stops two checkouts from colliding, but it does not make two concurrent edits to the *same file* merge cleanly. **Overlapping-file work is always sequential;** never split it across worktrees to run at once. If you can partition by file, that's cheaper than a worktree anyway.

## Step 0: Are you already isolated?

Before creating anything, check — nesting a worktree inside a worktree is a common, confusing mistake.

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
```

If `GIT_DIR != GIT_COMMON` you may already be in a linked worktree — but a **submodule** also trips this. Rule it out before concluding you're isolated:

```bash
git rev-parse --show-superproject-working-tree 2>/dev/null   # prints a path → submodule, treat as a normal repo
```

Already in a linked worktree → skip creation, go to Setup. Normal checkout (or submodule) → continue. Don't start implementation on `main`/`master` without consent — get the user's worktree preference first (or branch in place if they decline).

## Step 1: Prefer the harness's native worktree tool

If your harness exposes a native worktree mechanism — a tool named something like `EnterWorktree`, a `/worktree` command, or a `--worktree` flag — **use it.** Native tools place the directory, create the branch, and clean up where the harness can see them. Running `git worktree add` when a native tool exists creates **phantom state the harness can't track** — the single most common worktree mistake. Fall back to raw git only when no native tool is available.

## Step 2: Git fallback

```bash
# Location: an existing .worktrees/ (preferred) or worktrees/, else default to .worktrees/.
# It MUST be ignored first, or the worktree's contents get tracked. Use the repo's
# LOCAL excludes so you don't make an unsolicited commit to the user's .gitignore:
git check-ignore -q .worktrees || echo ".worktrees/" >> "$(git rev-parse --git-dir)/info/exclude"

git worktree add .worktrees/<feature> -b <feature>
cd .worktrees/<feature>
```

If `git worktree add` fails with a permission/sandbox error: in **standard**, tell the user and work in place. In **production**, isolation was requested for reliability — do **not** silently work in place; stop and ask the user how to proceed (retry elsewhere, or explicitly accept the main checkout).

## Setup + clean baseline

In the new worktree, install dependencies (`npm install` / `cargo build` / `pip install -r requirements.txt` / `go mod download`, as applicable) and run the test suite once. A worktree that starts red can't distinguish new breakage from pre-existing failures — report and ask before implementing on a failing baseline.

## Finish

After review + verification, integrate and clean up **from the main checkout** — never from inside the worktree being removed:

```bash
cd "$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)"
git worktree remove .worktrees/<feature>   # after merge or PR
git worktree prune                         # clear any stale registration
git branch -d <feature>                    # once merged
```

Only remove worktrees you created (those under `.worktrees/`); leave a harness-owned workspace to the harness. Stale worktrees confuse later sessions. (For the full merge/PR/keep/discard decision, this is where finishing-a-development-branch belongs once it ships.)

#!/usr/bin/env bash
# Behavioral tests for the workflow helper scripts against a real throwaway
# repository and linked worktree. Run: npm run test:scripts (requires bash + git)
set -u

SCRIPTS_DIR="$(cd "$(dirname "$0")/../skills/execution-routing/scripts" && pwd)"
COW="$SCRIPTS_DIR/cow-workspace"
TB="$SCRIPTS_DIR/task-brief"
RP="$SCRIPTS_DIR/review-package"
fails=0
check() { if [ "$1" = ok ]; then printf 'PASS: %s\n' "$2"; else printf 'FAIL: %s\n' "$2"; fails=$((fails + 1)); fi; }

REPO=$(mktemp -d)
OUT=$(mktemp -d)
trap 'rm -rf "$REPO" "$OUT"' EXIT

cd "$REPO"
git init -q
git config user.email test@example.com
git config user.name test
git config core.autocrlf false

mkdir -p docs/plans
cat > docs/plans/plan.md <<'PLAN'
> anchor
> MODE: standard
# Feature Plan

## Global Constraints
- CONSTRAINT_MARKER_XYZ

---

## Decomposition
| Task | x |

---

### Task 1: First
**Acceptance:** TASK1_MARKER

```
### Task 99: fenced peer heading
FENCED_HEADING_MARKER
```

AFTER_FENCE_MARKER

#### Detail
SUBHEADING_MARKER

### Task 2: Second
**Acceptance:** TASK2_MARKER

## Appendix
APPENDIX_MARKER

### Task 3: Third
**Acceptance:** TASK3_MARKER

### Notes
TRAILING_EQUAL_MARKER
PLAN

git add docs/plans/plan.md
git commit -qm c1
BASE=$(git rev-parse HEAD)

# ---- cow-workspace ----
LEGACY=$(git rev-parse --git-path cow)
mkdir -p "$LEGACY"
printf 'LEGACY_PROGRESS_MARKER\n' > "$LEGACY/progress.md"
mkdir -p nested/path
COW_DIR=$(cd nested/path && "$COW")
EXPECTED_COW="$(pwd)/.cost-oriented-agentic-workflow/run"
[ "$COW_DIR" = "$EXPECTED_COW" ] && r=ok || r=no; check "$r" "cow-workspace: resolves repo root from a nested directory"
grep -qx '\*' "$COW_DIR/.gitignore" 2>/dev/null && r=ok || r=no; check "$r" "cow-workspace: self-ignore rule"
grep -q LEGACY_PROGRESS_MARKER "$COW_DIR/progress.md" 2>/dev/null && r=ok || r=no; check "$r" "cow-workspace: migrates legacy ledger"
grep -q LEGACY_PROGRESS_MARKER "$LEGACY/progress.md" 2>/dev/null && r=ok || r=no; check "$r" "cow-workspace: preserves legacy ledger"

printf 'artifact\n' > "$COW_DIR/task-99-report.md"
[ -z "$(git status --porcelain)" ] && r=ok || r=no; check "$r" "cow-workspace: artifacts stay out of git status"
git add -A
git diff --cached --quiet && r=ok || r=no; check "$r" "cow-workspace: git add -A cannot stage artifacts"

WT="$OUT/linked-worktree"
git worktree add -q -b cow-workspace-test "$WT"
WT_COW=$(cd "$WT" && "$COW")
[ "$WT_COW" = "$WT/.cost-oriented-agentic-workflow/run" ] && [ "$WT_COW" != "$COW_DIR" ] && r=ok || r=no
check "$r" "cow-workspace: linked worktree gets a distinct workspace"
printf 'linked artifact\n' > "$WT_COW/task-1-report.md"
[ -z "$(git -C "$WT" status --porcelain)" ] && r=ok || r=no; check "$r" "cow-workspace: linked-worktree artifacts are ignored"

# ---- task-brief ----
"$TB" docs/plans/plan.md 1 >/dev/null 2>&1
DEFAULT_T1="$COW_DIR/task-1-brief.md"
[ -f "$DEFAULT_T1" ] && r=ok || r=no; check "$r" "task-brief: default output uses workspace"
grep -q CONSTRAINT_MARKER_XYZ "$DEFAULT_T1" 2>/dev/null && r=ok || r=no; check "$r" "task-brief: includes Global Constraints"
grep -q TASK1_MARKER "$DEFAULT_T1" 2>/dev/null && r=ok || r=no; check "$r" "task-brief: includes requested task"
grep -q AFTER_FENCE_MARKER "$DEFAULT_T1" 2>/dev/null && r=ok || r=no; check "$r" "task-brief: fenced peer heading does not terminate task"
grep -q SUBHEADING_MARKER "$DEFAULT_T1" 2>/dev/null && r=ok || r=no; check "$r" "task-brief: preserves lower-level task headings"
grep -q TASK2_MARKER "$DEFAULT_T1" 2>/dev/null && r=no || r=ok; check "$r" "task-brief: excludes next task"

"$TB" docs/plans/plan.md 2 "$OUT/t2.md" >/dev/null 2>&1
grep -q APPENDIX_MARKER "$OUT/t2.md" 2>/dev/null && r=no || r=ok; check "$r" "task-brief: excludes higher-level Appendix"

"$TB" docs/plans/plan.md 3 "$OUT/t3.md" >/dev/null 2>&1
grep -q TASK3_MARKER "$OUT/t3.md" 2>/dev/null && r=ok || r=no; check "$r" "task-brief: finds task after unrelated section"
grep -q TRAILING_EQUAL_MARKER "$OUT/t3.md" 2>/dev/null && r=no || r=ok; check "$r" "task-brief: excludes equal-level trailing section"
if "$TB" docs/plans/plan.md 99 "$OUT/t99.md" >/dev/null 2>&1; then r=no; else r=ok; fi; check "$r" "task-brief: missing task exits nonzero"

# ---- review-package ----
printf 'x\n' > a.ts
git add a.ts
git commit -qm c2
HEAD=$(git rev-parse HEAD)

printf 'mod\n' >> a.ts
printf 'UNTRACKED_BODY_MARKER\n' > new.ts
printf '\x00\x01BIN\x00' > blob.bin
"$RP" "$BASE" "$HEAD" "$OUT/rp.md" >/dev/null 2>&1
grep -q '^## Diff' "$OUT/rp.md" 2>/dev/null && r=ok || r=no; check "$r" "review-package: committed diff present"
grep -qE '^## Uncommitted working-tree changes' "$OUT/rp.md" 2>/dev/null && r=ok || r=no; check "$r" "review-package: uncommitted section when dirty"
grep -q UNTRACKED_BODY_MARKER "$OUT/rp.md" 2>/dev/null && r=ok || r=no; check "$r" "review-package: untracked CONTENT (not just name)"
grep -qi 'blob.bin' "$OUT/rp.md" 2>/dev/null && r=ok || r=no; check "$r" "review-package: untracked binary referenced"

"$RP" "$BASE" "$HEAD" >/dev/null 2>&1
DEFAULT_REVIEW="$COW_DIR/review-$(git rev-parse --short "$BASE")..$(git rev-parse --short "$HEAD").diff"
[ -f "$DEFAULT_REVIEW" ] && r=ok || r=no; check "$r" "review-package: default output uses workspace"

git add -A
git commit -qm c3
H3=$(git rev-parse HEAD)
git ls-files --error-unmatch '.cost-oriented-agentic-workflow/*' >/dev/null 2>&1 && r=no || r=ok
check "$r" "cow-workspace: artifacts never enter commits"
"$RP" "$BASE" "$H3" "$OUT/rp2.md" >/dev/null 2>&1
grep -qE '^## Uncommitted working-tree changes' "$OUT/rp2.md" 2>/dev/null && r=no || r=ok; check "$r" "review-package: no section on clean tree"

printf 'dirty\n' >> a.ts
"$RP" "$BASE" "$HEAD" "$OUT/rp3.md" >/dev/null 2>&1
grep -qE '^## Uncommitted working-tree changes' "$OUT/rp3.md" 2>/dev/null && r=no || r=ok; check "$r" "review-package: no worktree noise for historical range"

echo
if [ "$fails" -eq 0 ]; then echo "scripts: all checks passed."; else echo "scripts: $fails failed."; exit 1; fi

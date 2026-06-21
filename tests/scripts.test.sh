#!/usr/bin/env bash
# Behavioral tests for the helper scripts (task-brief, review-package) against a
# real throwaway git repo. The Node validator (validate-structure.mjs) only
# checks structure; these exercise the scripts' actual output — including the
# regression that review-package must include untracked file CONTENT, not just
# names. Run: npm run test:scripts   (requires bash + git)
set -u

SCRIPTS_DIR="$(cd "$(dirname "$0")/../skills/execution-routing/scripts" && pwd)"
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

### Task 2: Second
**Acceptance:** TASK2_MARKER

prose mentioning Task 1 must not break extraction.

```
### Task 1: fenced decoy
FENCED_DECOY_MARKER must be ignored
```
PLAN

# ---- task-brief ----
"$TB" docs/plans/plan.md 1 "$OUT/t1.md" >/dev/null 2>&1
grep -q CONSTRAINT_MARKER_XYZ "$OUT/t1.md" 2>/dev/null && r=ok || r=no; check "$r" "task-brief: includes Global Constraints"
grep -q TASK1_MARKER "$OUT/t1.md" 2>/dev/null && r=ok || r=no; check "$r" "task-brief: includes requested task"
grep -q TASK2_MARKER "$OUT/t1.md" 2>/dev/null && r=no || r=ok; check "$r" "task-brief: excludes other task"
grep -q FENCED_DECOY_MARKER "$OUT/t1.md" 2>/dev/null && r=no || r=ok; check "$r" "task-brief: fence-aware"
if "$TB" docs/plans/plan.md 99 "$OUT/t99.md" >/dev/null 2>&1; then r=no; else r=ok; fi; check "$r" "task-brief: missing task exits nonzero"

# ---- review-package ----
printf 'x\n' > a.ts; git add -A; git commit -qm c1; BASE=$(git rev-parse HEAD)
printf 'export const x = 1;\n' > a.ts; git add a.ts; git commit -qm c2; HEAD=$(git rev-parse HEAD)

printf 'mod\n' >> a.ts                      # tracked unstaged change
printf 'UNTRACKED_BODY_MARKER\n' > new.ts   # untracked text
printf '\x00\x01BIN\x00' > blob.bin         # untracked binary
"$RP" "$BASE" "$HEAD" "$OUT/rp.md" >/dev/null 2>&1
grep -q '^## Diff' "$OUT/rp.md" 2>/dev/null && r=ok || r=no; check "$r" "review-package: committed diff present"
grep -qE '^## Uncommitted working-tree changes' "$OUT/rp.md" 2>/dev/null && r=ok || r=no; check "$r" "review-package: uncommitted section when dirty"
grep -q UNTRACKED_BODY_MARKER "$OUT/rp.md" 2>/dev/null && r=ok || r=no; check "$r" "review-package: untracked CONTENT (not just name)"
grep -qi 'blob.bin' "$OUT/rp.md" 2>/dev/null && r=ok || r=no; check "$r" "review-package: untracked binary referenced"

git add -A; git commit -qm c3; H3=$(git rev-parse HEAD)
"$RP" "$BASE" "$H3" "$OUT/rp2.md" >/dev/null 2>&1
grep -qE '^## Uncommitted working-tree changes' "$OUT/rp2.md" 2>/dev/null && r=no || r=ok; check "$r" "review-package: no section on clean tree"

printf 'dirty\n' >> a.ts
"$RP" "$BASE" "$HEAD" "$OUT/rp3.md" >/dev/null 2>&1   # head != current HEAD
grep -qE '^## Uncommitted working-tree changes' "$OUT/rp3.md" 2>/dev/null && r=no || r=ok; check "$r" "review-package: no worktree noise for historical range"

echo
if [ "$fails" -eq 0 ]; then echo "scripts: all checks passed."; else echo "scripts: $fails failed."; exit 1; fi

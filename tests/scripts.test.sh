#!/usr/bin/env bash
# Behavioral tests for the workflow helper scripts against a real throwaway
# repository and linked worktree. Run: npm run test:scripts (requires bash + git)
set -u

SCRIPTS_DIR="$(cd "$(dirname "$0")/../skills/execution-routing/scripts" && pwd)"
COW="$SCRIPTS_DIR/cow-workspace"
TB="$SCRIPTS_DIR/task-brief"
RP="$SCRIPTS_DIR/review-package"
# The SessionStart hook is cow-hook.mjs directly (the legacy bash wrapper was
# removed); this suite keeps covering the same absent/active behaviors. The
# hook reads stdin to EOF, so close it explicitly — an inherited open pipe
# (npm, CI, background shells) would otherwise block forever.
HOOK() { node "$SCRIPTS_DIR/cow-hook.mjs" session-start < /dev/null; }
fails=0
check() { if [ "$1" = ok ]; then printf 'PASS: %s\n' "$2"; else printf 'FAIL: %s\n' "$2"; fails=$((fails + 1)); fi; }

REPO=$(mktemp -d)
OUT=$(mktemp -d)
trap 'rm -rf "$REPO" "$OUT"' EXIT

# ---- SessionStart / compact anchor (Absent State) ----
HOOK > "$OUT/hook_absent.json"
[ ! -s "$OUT/hook_absent.json" ] && r=ok || r=no
check "$r" "session-start: absent state emits no stdout"

cd "$REPO"
git init -q
git config user.email test@example.com
git config user.name test
git config core.autocrlf false

# ---- SessionStart / compact anchor (Active Valid State) ----
node "$SCRIPTS_DIR/cow-state.mjs" init --mode standard >/dev/null 2>&1
HOOK > "$OUT/hook_active.json"
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$OUT/hook_active.json" >/dev/null 2>&1 && r=ok || r=no
check "$r" "session-start: emits valid JSON"
grep -q COW_RESUME_POINTER_V1 "$OUT/hook_active.json" 2>/dev/null && r=ok || r=no
check "$r" "session-start: emits resume sentinel"
grep -q 'using-cost-oriented-workflow' "$OUT/hook_active.json" 2>/dev/null && \
grep -q 'State Path:' "$OUT/hook_active.json" 2>/dev/null && \
grep -q 'Instructions:' "$OUT/hook_active.json" 2>/dev/null && \
! grep -q 'COW_ENTRY_INJECTED' "$OUT/hook_active.json" 2>/dev/null && r=ok || r=no
check "$r" "session-start: contains resume pointer details and excludes legacy sentinel"

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

mkdir -p src
printf 'INITIAL_ALLOWED\n' > src/allowed.ts
printf 'INITIAL_UNRELATED\n' > src/unrelated.ts
printf 'RENAME_SOURCE_CONTENT\n' > src/rename-source.ts
git add docs/plans/plan.md src
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
printf 'COMMITTED_ALLOWED_MARKER\n' > src/allowed.ts
printf 'COMMITTED_UNRELATED_MARKER\n' > src/unrelated.ts
git add src/allowed.ts src/unrelated.ts
git commit -qm c2
HEAD=$(git rev-parse HEAD)

printf 'UNSTAGED_ALLOWED_MARKER\n' >> src/allowed.ts
printf 'UNSTAGED_UNRELATED_MARKER\n' >> src/unrelated.ts
printf 'STAGED_ALLOWED_MARKER\n' > src/staged.ts
git add src/staged.ts
git mv src/rename-source.ts src/rename-destination.ts
printf 'UNTRACKED_ALLOWED_MARKER\n' > src/allowed-new.ts
printf 'UNTRACKED_UNRELATED_MARKER\n' > src/unrelated-new.ts
printf '\x00\x01BIN_CONTENT_MUST_NOT_RENDER\x00' > src/blob.bin
printf 'WORKSPACE_ARTIFACT_MARKER\n' > "$COW_DIR/internal-review.diff"

task_summary=$(cd nested/path && "$RP" "$BASE" "$HEAD" "$OUT/task.md" -- \
  src/allowed.ts src/staged.ts src/rename-destination.ts \
  src/allowed-new.ts src/blob.bin)
printf '%s\n' "$task_summary" | grep -qF "wrote $OUT/task.md:" && \
  printf '%s\n' "$task_summary" | grep -qE '[0-9]+ commit\(s\), [0-9]+ bytes$' && r=ok || r=no
check "$r" "review-package: reports output path, commit count, and byte size"
grep -q COMMITTED_ALLOWED_MARKER "$OUT/task.md" 2>/dev/null && r=ok || r=no; check "$r" "review-package task mode: committed scoped diff"
grep -q STAGED_ALLOWED_MARKER "$OUT/task.md" 2>/dev/null && r=ok || r=no; check "$r" "review-package task mode: staged scoped diff"
grep -q UNSTAGED_ALLOWED_MARKER "$OUT/task.md" 2>/dev/null && r=ok || r=no; check "$r" "review-package task mode: unstaged scoped diff"
grep -q UNTRACKED_ALLOWED_MARKER "$OUT/task.md" 2>/dev/null && r=ok || r=no; check "$r" "review-package task mode: allowed untracked content"
grep -q 'Binary file: src/blob.bin (' "$OUT/task.md" 2>/dev/null && r=ok || r=no; check "$r" "review-package task mode: binary metadata without content"
grep -q RENAME_SOURCE_CONTENT "$OUT/task.md" 2>/dev/null && ! grep -q 'rename-source.ts' "$OUT/task.md" 2>/dev/null && r=ok || r=no
check "$r" "review-package task mode: rename cannot expose an out-of-scope path"
if grep -qE 'COMMITTED_UNRELATED_MARKER|UNSTAGED_UNRELATED_MARKER|UNTRACKED_UNRELATED_MARKER|WORKSPACE_ARTIFACT_MARKER' "$OUT/task.md" 2>/dev/null; then r=no; else r=ok; fi
check "$r" "review-package task mode: unrelated and workspace content cannot leak"

(cd nested/path && "$RP" "$BASE" "$HEAD" -- src/allowed.ts) >/dev/null 2>&1
DEFAULT_TASK_REVIEW="$COW_DIR/review-$(git rev-parse --short "$BASE")..$(git rev-parse --short "$HEAD").diff"
grep -q COMMITTED_ALLOWED_MARKER "$DEFAULT_TASK_REVIEW" 2>/dev/null && r=ok || r=no
check "$r" "review-package task mode: optional OUTFILE defaults to workspace"

"$RP" "$BASE" "$HEAD" "$OUT/branch-dirty.md" >"$OUT/branch-dirty.stdout" 2>"$OUT/branch-dirty.stderr"
rc=$?
[ "$rc" -eq 4 ] && r=ok || r=no; check "$r" "review-package branch mode: dirty current tree exits 4"
[ ! -e "$OUT/branch-dirty.md" ] && r=ok || r=no; check "$r" "review-package branch mode: dirty failure writes no package"
grep -q 'src/allowed.ts' "$OUT/branch-dirty.stderr" 2>/dev/null && ! grep -q UNSTAGED_ALLOWED_MARKER "$OUT/branch-dirty.stderr" 2>/dev/null && r=ok || r=no
check "$r" "review-package branch mode: dirty failure reports filenames, not content"

"$RP" "$BASE" "$HEAD" "$OUT/traversal.md" -- ../escape >/dev/null 2>&1
[ "$?" -eq 2 ] && r=ok || r=no; check "$r" "review-package task mode: rejects parent traversal"
"$RP" "$BASE" "$HEAD" "$OUT/absolute.md" -- "$REPO/src/allowed.ts" >/dev/null 2>&1
[ "$?" -eq 2 ] && r=ok || r=no; check "$r" "review-package task mode: rejects absolute paths"
"$RP" "$BASE" "$HEAD" "$OUT/windows-absolute.md" -- 'C:\outside\file.ts' >/dev/null 2>&1
[ "$?" -eq 2 ] && r=ok || r=no; check "$r" "review-package task mode: rejects Windows absolute paths"

git add -A
git commit -qm c3
H3=$(git rev-parse HEAD)
git ls-files --error-unmatch '.cost-oriented-agentic-workflow/*' >/dev/null 2>&1 && r=no || r=ok
check "$r" "cow-workspace: artifacts never enter commits"

"$RP" "$BASE" "$H3" >/dev/null 2>&1
DEFAULT_REVIEW="$COW_DIR/review-$(git rev-parse --short "$BASE")..$(git rev-parse --short "$H3").diff"
[ -f "$DEFAULT_REVIEW" ] && r=ok || r=no; check "$r" "review-package branch mode: clean default output uses workspace"
if grep -qE '^## (Staged|Unstaged|Untracked)|WORKSPACE_ARTIFACT_MARKER' "$DEFAULT_REVIEW" 2>/dev/null; then r=no; else r=ok; fi
check "$r" "review-package branch mode: package is committed-only"

printf 'HISTORICAL_NOISE_MARKER\n' >> src/unrelated.ts
"$RP" "$BASE" "$HEAD" "$OUT/historical.md" >/dev/null 2>&1
grep -q HISTORICAL_NOISE_MARKER "$OUT/historical.md" 2>/dev/null && r=no || r=ok; check "$r" "review-package branch mode: historical range ignores working-tree noise"

echo
if [ "$fails" -eq 0 ]; then echo "scripts: all checks passed."; else echo "scripts: $fails failed."; exit 1; fi

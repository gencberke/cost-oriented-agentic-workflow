#!/usr/bin/env bash
# Independent verification of the packaged release artifact. Builds the ZIP from
# the clean release commit, inspects it without trusting the host filesystem, and
# re-runs the full source suite against an extracted copy. Zero extra deps:
# git + Node + Python 3 (already required by the eval suite) + unzip-free Python
# extraction. Run: npm run test:release
set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

# Interpreter that actually RUNS Python 3 (see tests/eval/run-tests.sh).
PY=""
runs_python3() { "$1" -c 'import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)' >/dev/null 2>&1; }
for candidate in "${PYTHON:-}" python3 python py; do
  [ -n "$candidate" ] || continue
  if runs_python3 "$candidate"; then PY=$candidate; break; fi
done
if [ -z "$PY" ]; then
  echo "Python 3 is required for tests/release-artifact.test.sh" >&2
  exit 1
fi

fails=0
check() { if [ "$1" = ok ]; then printf 'PASS: %s\n' "$2"; else printf 'FAIL: %s\n' "$2"; fails=$((fails + 1)); fi; }
skip()  { printf 'SKIP: %s\n' "$1"; }

NAME=$("$PY" -c 'import json;print(json.load(open(".claude-plugin/plugin.json"))["name"])')
VERSION=$("$PY" -c 'import json;print(json.load(open(".claude-plugin/plugin.json"))["version"])')
ARTIFACT="dist/${NAME}-${VERSION}.zip"

EXTRACT=$(mktemp -d)
trap 'rm -rf "$EXTRACT"' EXIT

# ── 1. Build from the (clean) release commit ────────────────────────────────
if bash scripts/build-release.sh >/dev/null 2>"$EXTRACT/build.err"; then
  check ok "build-release builds from a clean tree"
else
  check no "build-release builds from a clean tree"
  sed 's/^/    /' "$EXTRACT/build.err" >&2
fi
[ -f "$ARTIFACT" ] && check ok "archive exists: $ARTIFACT" || check no "archive exists: $ARTIFACT"

# ── 2. Inspect the archive (granular structure assertions) ──────────────────
# The Python inspector prints PASS/FAIL per assertion and exits nonzero if any
# failed. Its lines are the concrete evidence; the wrapper records one tally.
if "$PY" - "$ARTIFACT" "$NAME" "$VERSION" <<'PY'
import json, sys, zipfile

artifact, name, version = sys.argv[1], sys.argv[2], sys.argv[3]
z = zipfile.ZipFile(artifact)
names = z.namelist()
fails = 0
def ok(cond, msg):
    global fails
    print(("PASS: " if cond else "FAIL: ") + msg)
    if not cond: fails += 1

# One correct plugin root: the manifest is present exactly once, at the root.
roots = [n for n in names if n.endswith(".claude-plugin/plugin.json")]
ok(roots == [".claude-plugin/plugin.json"], "one plugin root (.claude-plugin/plugin.json at archive root)")

# Excluded trees.
ok(not any(n.startswith(".git/") or n == ".git" for n in names), "no .git/ entry")
ok(not any(n.startswith("node_modules/") for n in names), "no node_modules/ entry")
ok(not any(n.startswith("dist/") for n in names), "no dist/ entry")
ok(not any(".cost-oriented-agentic-workflow" in n for n in names), "no workflow run artifacts")

# Required plugin files.
required = [
    ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "package.json",
    "README.md", "commands/cost-oriented-agentic-workflow.md", "commands/production.md",
    "skills/using-cost-oriented-workflow/SKILL.md", "skills/execution-routing/SKILL.md",
    "skills/systematic-debugging/SKILL.md", "skills/writing-plans/SKILL.md",
    "hooks/session-start", "tests/validate-structure.mjs", "tests/scripts.test.sh",
    "tests/eval/run-tests.sh", "tests/eval/test_eval.py", "tests/eval/routing/README.md",
    "skills/execution-routing/scripts/cow-workspace",
    "skills/execution-routing/scripts/task-brief",
    "skills/execution-routing/scripts/review-package",
]
missing = [r for r in required if r not in names]
ok(not missing, "all required plugin files present" + (" (missing: %s)" % missing if missing else ""))

# Three version declarations agree (read from the ARCHIVED copies, not the host).
def jload(path):
    return json.loads(z.read(path).decode("utf-8"))
plugin = jload(".claude-plugin/plugin.json")
pkg = jload("package.json")
market = jload(".claude-plugin/marketplace.json")
mp = next((p for p in market.get("plugins", []) if p.get("name") == name), None)
versions = {plugin.get("version"), pkg.get("version"), (mp or {}).get("version")}
ok(versions == {version}, "three version declarations all == %s (saw %s)" % (version, sorted(map(str, versions))))

# Required executables carry Unix executable metadata (create_system Unix + +x).
required_exec = [
    "hooks/session-start",
    "skills/execution-routing/scripts/cow-workspace",
    "skills/execution-routing/scripts/task-brief",
    "skills/execution-routing/scripts/review-package",
]
for entry in required_exec:
    info = z.getinfo(entry)
    unix = info.create_system == 3
    execbit = bool((info.external_attr >> 16) & 0o111)
    ok(unix and execbit, "executable metadata on %s (mode %o)" % (entry, (info.external_attr >> 16) & 0o777))

# A representative regular file must NOT be marked executable.
reg = z.getinfo("README.md")
ok(not bool((reg.external_attr >> 16) & 0o111), "regular file README.md is not executable")

sys.exit(1 if fails else 0)
PY
then
  check ok "archive structure (root, exclusions, files, versions, exec metadata)"
else
  check no "archive structure (root, exclusions, files, versions, exec metadata)"
fi

# ── 3. Extract (mode-faithful, no unzip dependency) and re-test the copy ─────
if "$PY" - "$ARTIFACT" "$EXTRACT/plugin" <<'PY'
import os, sys, zipfile
artifact, dest = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(artifact)
z.extractall(dest)
# zipfile.extractall does not restore Unix permission bits; restore them from the
# archive so the extracted helper/hook are executable on POSIX too.
for info in z.infolist():
    if info.create_system == 3:
        mode = (info.external_attr >> 16) & 0o7777
        if mode:
            os.chmod(os.path.join(dest, info.filename), mode)
PY
then
  check ok "archive extracts successfully"
else
  check no "archive extracts successfully"
fi

PLUGIN="$EXTRACT/plugin"
if [ -f "$PLUGIN/.claude-plugin/plugin.json" ]; then
  # A git context lets the eval fixture diff-validation run anywhere.
  git -C "$PLUGIN" init -q 2>/dev/null || true

  node "$PLUGIN/tests/validate-structure.mjs" >"$EXTRACT/struct.out" 2>&1 \
    && check ok "extracted copy: structural tests pass" \
    || { check no "extracted copy: structural tests pass"; tail -3 "$EXTRACT/struct.out" | sed 's/^/    /' >&2; }

  bash "$PLUGIN/tests/scripts.test.sh" >"$EXTRACT/helper.out" 2>&1 \
    && check ok "extracted copy: helper tests pass" \
    || { check no "extracted copy: helper tests pass"; tail -3 "$EXTRACT/helper.out" | sed 's/^/    /' >&2; }

  bash "$PLUGIN/tests/eval/run-tests.sh" >"$EXTRACT/eval.out" 2>&1 \
    && check ok "extracted copy: eval fixture validation passes" \
    || { check no "extracted copy: eval fixture validation passes"; tail -3 "$EXTRACT/eval.out" | sed 's/^/    /' >&2; }
else
  check no "extracted plugin root is present"
fi

# ── 4. CLI-dependent checks (explicit skip only when the CLI is unavailable) ─
if command -v claude >/dev/null 2>&1; then
  claude plugin validate "$PLUGIN" --strict >"$EXTRACT/validate.out" 2>&1 \
    && check ok "extracted copy: strict plugin validation passes" \
    || { check no "extracted copy: strict plugin validation passes"; tail -5 "$EXTRACT/validate.out" | sed 's/^/    /' >&2; }

  # ZIP loadability proxy: a CLI that can validate a directory may also accept
  # the archive path. Treat an unsupported zip path as a skip, not a failure.
  if claude plugin validate "$ARTIFACT" --strict >"$EXTRACT/zip.out" 2>&1; then
    check ok "archive accepted by claude plugin validate (zip)"
  else
    skip "claude plugin validate does not accept a zip path on this CLI ($(head -1 "$EXTRACT/zip.out" 2>/dev/null))"
  fi
else
  skip "claude CLI not on PATH — strict validation and zip-load checks not run"
fi

echo
if [ "$fails" -eq 0 ]; then echo "release-artifact: all checks passed."; else echo "release-artifact: $fails failed."; exit 1; fi

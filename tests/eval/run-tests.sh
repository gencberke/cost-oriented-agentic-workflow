#!/usr/bin/env bash
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)

# Pick an interpreter that actually RUNS Python 3 — not just a name on PATH.
# On Windows the "App execution alias" stub for python/python3 resolves on PATH
# but exits without running, so probe by executing, not by `command -v`. The
# Windows `py` launcher is included for that case; it is harmless elsewhere.
PY=""
runs_python3() { "$1" -c 'import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)' >/dev/null 2>&1; }
for candidate in "${PYTHON:-}" python3 python py; do
  [ -n "$candidate" ] || continue
  if runs_python3 "$candidate"; then PY=$candidate; break; fi
done
if [ -z "$PY" ]; then
  echo "Python 3 is required to run tests/eval (tried: \$PYTHON, python3, python, py)" >&2
  exit 1
fi

cd "$ROOT"
"$PY" tests/eval/test_eval.py

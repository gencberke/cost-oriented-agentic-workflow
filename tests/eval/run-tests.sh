#!/usr/bin/env bash
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
if [ -n "${PYTHON:-}" ]; then
  PY=$PYTHON
elif command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "Python 3 is required for tests/eval/analyze-token-usage.py" >&2
  exit 1
fi

cd "$ROOT"
"$PY" tests/eval/test_eval.py

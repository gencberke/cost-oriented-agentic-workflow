#!/usr/bin/env bash
# Reproducible release builder for the cost-oriented-agentic-workflow plugin.
#
# Zero runtime dependencies: git + Node (already required by `npm run check`).
# Archives TRACKED content from the current (release) commit with `git archive`,
# so .git/, node_modules/, dist/, the ignored workflow workspace, and every other
# untracked file are excluded by construction, and tracked Unix executable bits
# are preserved in the ZIP. The artifact is deterministic for a given commit
# (git archive stamps every entry with the commit time).
#
# Usage:
#   bash scripts/build-release.sh                 # build dist/<name>-<version>.zip
#   bash scripts/build-release.sh --allow-dirty   # build HEAD anyway (dev/testing
#                                                 # only; still archives the commit,
#                                                 # never uncommitted changes)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

allow_dirty=""
[ "${1:-}" = "--allow-dirty" ] && allow_dirty=1

# Read a top-level string field from a JSON file (Node built-ins only).
json_field() {
  node -e 'const o=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=o[process.argv[2]];if(v===undefined){console.error("missing "+process.argv[2]+" in "+process.argv[1]);process.exit(3);}process.stdout.write(String(v));' "$1" "$2"
}

NAME=$(json_field .claude-plugin/plugin.json name)
VERSION=$(json_field .claude-plugin/plugin.json version)
PKG_VERSION=$(json_field package.json version)
MARKET_VERSION=$(node -e 'const o=JSON.parse(require("fs").readFileSync(".claude-plugin/marketplace.json","utf8"));const p=(o.plugins||[]).find(x=>x.name===process.argv[1]);if(!p){console.error("plugin not listed in marketplace: "+process.argv[1]);process.exit(3);}process.stdout.write(String(p.version));' "$NAME")

# Authoritative versions must agree before a build is allowed.
if [ "$VERSION" != "$PKG_VERSION" ] || [ "$VERSION" != "$MARKET_VERSION" ]; then
  echo "version mismatch: plugin.json=$VERSION package.json=$PKG_VERSION marketplace=$MARKET_VERSION" >&2
  exit 1
fi

# A release must be reproducible from a commit, so refuse a dirty tree by default.
if [ -z "$allow_dirty" ] && [ -n "$(git status --porcelain)" ]; then
  echo "refusing to build from a dirty tree; commit or stash first (or --allow-dirty to archive HEAD)" >&2
  exit 1
fi

mkdir -p dist
ARTIFACT="dist/${NAME}-${VERSION}.zip"
rm -f "$ARTIFACT"

# Tracked content of the release commit only. git archive never includes .git/,
# only-tracked files (so node_modules/, dist/, and the ignored workspace are out),
# and it preserves the index executable bits in the ZIP's external attributes.
git archive --format=zip -9 --output="$ARTIFACT" HEAD

SIZE=$(wc -c < "$ARTIFACT" | tr -d ' ')
echo "built $ARTIFACT ($SIZE bytes) from $(git rev-parse --short HEAD) (version $VERSION)"

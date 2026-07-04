# Evaluation And Release Gates

This project separates static structure, deterministic helper behavior, live
model behavior, token/cost measurement, and release packaging. A green static
test never proves live behavior by itself.

## Lightweight Gate

Use this for documentation-only or narrow static changes:

```text
npm.cmd run check
```

For the documentation reset, also ensure stale architecture references are gone:

```text
rg "<stale architecture reference pattern>" README.md docs tests skills commands agents
```

## Deterministic Suites

- `npm run check`: manifests, cross references, docs links, policy invariants,
  budgets, agent count, hook substrate, and structural contracts.
- `npm run test:foundation`: state and repository-intake helpers.
- `npm run test:agents`: static plugin-agent contracts.
- `npm run test:profile`: repository profile behavior.
- `npm run test:report`: implementation report validation.
- `npm run test:review-report`: review report validation.
- `npm run test:unit-worktree`: unit ownership and baseline behavior.
- `npm run test:hooks`: Phase 4 hook observation behavior.
- `npm run test:enforcement`: Phase 5A enforcement-mode behavior.
- `npm run test:phase6`: Phase 6 evaluation harness (run-schema validator,
  aggregator arithmetic, mismatch refusal, outlier reporting, sensitive-field
  rejection, fixture manifests).
- stream analyzer tests for discovery, implementation, and review.

On Windows, Bash suites should be run through Git Bash when plain `bash`
resolves to WSL. The package scripts route Bash suites through
`scripts/run-bash.mjs`, which prefers Git Bash on Windows. Eval suites still
require Python 3; if it is not on `PATH`, set `PYTHON` in the local environment
for verification.

## Fixture Layers

Fixtures under `tests/eval/` validate contract shape and analyzer expectations.
They do not prove model behavior. Live streams are graded separately and retained
as evidence when a phase requires them.

The major fixture groups cover:

- routing pressure tests;
- repository discovery and warm-profile hardening;
- scoped agent contracts;
- implementation routing and report contracts;
- unit ownership;
- review control and targeted re-review;
- hidden-ground-truth review fixtures;
- token usage parsing.

## Live Dogfood

Live smokes are expensive and environment-sensitive. Use
[`../../DOGFOOD.md`](../../DOGFOOD.md) for protocol, repeat policy, grading
rules, and token/cost evidence. Record accepted conclusions in
[`../../DECISIONS.md`](../../DECISIONS.md).

Static and live results must be reported separately. A process exit code is not
the semantic result; analyzers classify the saved stream.

## Release Gate

Phase 7A prepares the release-candidate runtime package shape but does not bump
versions. Candidate validation and final publishable validation are separate:

- `npm run release:check:candidate`: may pass while live evidence is explicitly
  pending.
- `npm run release:check:final`: must fail with
  `LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE` until live gates are accepted.
- `npm run release:version:dry`: proves every final `0.5.0` version location is
  known without mutating files.
- `npm run runtime:build` / `npm run runtime:inspect`: build and inspect the
  minimal runtime package.

Before final release:

- all deterministic suites pass;
- Phase 3B.2, Phase 4, Phase 5, and sufficient Phase 6 live behavior gates are
  accepted;
- token/cost conclusions are recorded from measured evidence;
- runtime package contains exactly the intended allowlist, including all four
  agents and no active `hooks/hooks.json` until activation is proven;
- plugin manifests and `package.json` agree on version `0.5.0`;
- release artifact verification passes.

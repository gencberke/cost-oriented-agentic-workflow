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
- stream analyzer tests for discovery, implementation, and review.

On Windows, Bash suites should be run through Git Bash when plain `bash`
resolves to WSL.

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

Phase 7 is the only phase that bumps versions and changes final runtime package
shape. Before release:

- all deterministic suites pass;
- live behavior gates for the completed phases are accepted;
- token/cost conclusions are recorded;
- runtime package contains exactly the intended allowlist, including agents and
  active hooks only when their phases have shipped;
- plugin manifests and `package.json` agree on version `0.5.0`;
- release artifact verification passes.

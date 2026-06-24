# Changelog

All notable changes to the cost-oriented-agentic-workflow plugin are documented
here. This project adheres to [Semantic Versioning](https://semver.org/).

## [0.4.1] - 2026-06-23

A narrowly scoped stabilization release. It closes the three routing escape
hatches the Flutter debugging dogfood exposed and makes the release artifact
reproducible, clean, cross-platform-aware, and independently testable. The core
purpose is unchanged: Opus is the lean controller; a Sonnet subagent does the
token-heavy investigation and implementation where delegation is economical;
risk can override cost; reviews stay independent; retry and remediation loops
stay bounded; verification is evidence-based; runtime dependencies remain zero.

### Fixed — routing escape hatches

- **Disjoint diagnosis is no longer collapsed because the bugs look small.**
  Once a cheap domain map evidences disjoint problem domains, diagnosis is
  delegated to bounded read-only investigators; the apparent size of the
  eventual fixes cannot keep the token-heavy investigation in the controller.
  Smallness shapes implementation routing only after diagnosis.
  (`systematic-debugging`, `dispatching-parallel-agents`, entry skill)
- **A tracked diagnostic edit ends read-only diagnosis.** Adding or modifying a
  dependency, manifest, configuration, integration harness, tracked diagnostic
  test, migration, or schema now requires a visible `Re-route:` receipt before
  the edit, a return to triage, and a planned elevated diagnostic unit. User
  approval of a technique does not preserve the earlier light-inline route, and
  temporary instrumentation carries an explicit cleanup disposition.
  (`systematic-debugging`, launchers)
- **The same file no longer merges independent outcomes.** A unit boundary is
  outcome + responsibility + verification seam, not the file set. Two independent
  user-visible outcomes are separate sequential units or one delegated batch with
  separate acceptance and regression per outcome — never one light-inline change.
  (`writing-plans`, `execution-routing`, entry skill)

### Added

- 12 structural invariants guarding the rules above
  (`tests/validate-structure.mjs`).
- `tests/eval/routing/` — six route-only pressure-test fixtures (three release
  blockers: small disjoint diagnosis, tracked diagnostic harness, same-file
  independent outcomes; three regression controls: unknown-repo disjoint domains,
  warm-repo trivial edit, dirty working tree preservation), a schema validator
  (`RoutingFixtureContractTests`), and a README documenting the three grading
  layers (schema validation, automatic receipt checks, human adjudication).
- A live route-only dogfood protocol in `docs/DOGFOOD.md`.
- A reproducible, zero-runtime-dependency release builder
  (`scripts/build-release.sh`) and an independent artifact verifier
  (`tests/release-artifact.test.sh`); `release:build`, `test:release`, and
  `verify:all` package scripts.

### Changed

- `hooks/session-start` now carries the executable bit in the git index
  (100644 → 100755); the helper suite invokes it directly and SessionStart runs
  it as a command, so it broke on POSIX without the bit.
- The eval runner now probes for a working Python 3 by executing it — the
  Windows "App execution alias" resolves on PATH but does not run — and tries the
  `py` launcher, so `npm run test:eval` runs on Windows as well as POSIX.
- Removed the anchor-header block that was duplicated between the entry skill and
  `writing-plans` (writing-plans remains the canonical owner). Runtime prose is
  85,432 / 86,000 bytes.
- The structural validator no longer scans the ignored runtime workspace
  (`.cost-oriented-agentic-workflow/`) or `dist/`, so `npm run check` depends
  only on tracked plugin content and is deterministic regardless of run
  artifacts.

### Deferred to 0.5.0 (explicitly out of scope here)

- repository-intake skill, repo-snapshot helper, `agents/` definitions, a
  machine-readable workflow state engine, an active `PreToolUse` enforcement
  hook, the full discovery/implementation dual-routing state machine, automatic
  runtime cost feedback, a full session driver, and any new runtime dependency,
  review tier, or changed review/retry/remediation budget.

# Changelog

All notable changes to the cost-oriented-agentic-workflow plugin are documented
here. This project adheres to [Semantic Versioning](https://semver.org/).

## [0.5.0] - Pending

Release-candidate preparation for the v0.5.0 control-plane series. Repository
versions intentionally remain `0.4.2` during Phase 7A; the final version bump is
prepared but not performed.

### Added

- Runtime package surface for the v0.5.0 candidate: `.claude-plugin/`,
  `commands/`, `skills/`, all four `agents/`, inactive hook examples,
  `README.md`, and `LICENSE`.
- Candidate/final release gates. Candidate validation may pass with live gates
  pending; final validation refuses release with
  `LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE`.
- Deterministic runtime package inspection, final-version dry-run, and Node
  release artifact tests covering allowlists, SHA-256 checksums, reproducible
  manifests, inactive hook status, and package safety.

### Changed

- Bash-backed test scripts are routed through a Node wrapper that prefers Git
  Bash on Windows, avoiding accidental WSL launcher failures.
- Runtime documentation now distinguishes source-repository commands from
  installed runtime usage and avoids personal absolute paths.

### Deferred

- Phase 3B.2 live review lifecycle evidence.
- Phase 4 live resume/compact evidence.
- Phase 5 live ASK/DENY evidence.
- Sufficient Phase 6 behavioral, token, and cost evidence.

## [0.4.2] - 2026-06-24

A cleanup and packaging release. It separates the development repository from a
minimal, installable runtime package and removes stale generated artifacts.
There are no routing, behavior, architecture, review, or quality changes.

### Added

- `scripts/build-runtime-package.mjs` — a deterministic, zero-dependency runtime
  packager (Node standard library + Git). It builds an **allowlist-only** package
  from Git-tracked content (`.claude-plugin/`, `commands/`, `skills/`, the opt-in
  `hooks/` files, `README.md`, `LICENSE`), cross-checked against a denylist, into
  a clean plugin directory + ZIP (`git archive`, executable modes preserved) + a
  SHA-256 checksum + a deterministic sorted manifest. Output is written
  **outside** the repository (default `../cost-oriented-agentic-workflow-runtime/`)
  so a clean install never imports development artifacts. The builder refuses
  unsafe output paths and a dirty tracked tree, and self-validates (versions,
  hashes, modes, ZIP entries, no self-containment, source unmodified) before
  reporting success.
- `scripts/clean-generated.mjs` — a narrow, hardcoded-allowlist cleaner for
  `dist/` and `.cost-oriented-agentic-workflow/eval/`; dry-run by default,
  `--apply` to delete. It never runs `git clean`, and never removes tracked
  source, `.git`, or the `.cost-oriented-agentic-workflow/run/` recovery state.
- `runtime:build`, `clean:generated`, and `clean:generated:dry` package scripts;
  a "Development repository vs. runtime package" section in `README.md`; and a
  dated decision in `docs/DECISIONS.md`.

### Changed

- Versions bumped to `0.4.2` across `.claude-plugin/plugin.json`,
  `.claude-plugin/marketplace.json`, and `package.json`. No skill prose, command,
  launcher, or workflow-behavior change.

### Notes

- Packaging only: the full test suites and the live dogfood were intentionally
  not rerun, and no installation, marketplace update, or cache change was
  performed. The next feature phase remains `0.5.0`.

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

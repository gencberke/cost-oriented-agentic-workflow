# Current Handoff

This is the concise operational snapshot for `cost-oriented-agentic-workflow`.
For first-read guidance, see [`../AGENTS.md`](../AGENTS.md). For release
candidate status, see [`RELEASE_0.5.0.md`](RELEASE_0.5.0.md).

## Verified State

- Source root: the current checkout or worktree containing this file.
- Branch: `codex/phase-7a-release-candidate`.
- Baseline: `308be7c` contains the committed Phase 6 deterministic harness.
- Package version: `0.4.2`; the final `0.5.0` bump is prepared only as a dry-run.
- Runtime dependencies: zero.
- Agent count: exactly four COW agents.
- Active hook file: none. `hooks/hooks.json` must remain absent.
- Runtime package: release-candidate surface includes plugin metadata, commands,
  skills, all four agents, inactive hook examples, README, and license.

## Implemented Control Plane

- State and workspace: validated per-checkout run state, reconstruction support,
  repository snapshot/profile helpers, and conservative resume.
- Agents: four scoped workers for repository investigation, debug investigation,
  implementation, and review. Agents never commit or update workflow state.
- Routing: discovery and implementation remain separate; implementation supports
  inline, delegated, planned-sequential, and delegated-batch paths.
- Review: scoped reviewer contracts, causality-aware findings, targeted
  re-review, whole-work review, and a two-wave remediation ceiling.
- Hooks: Phase 4 shadow observation and lean SessionStart resume pointer; Phase
  5A opt-in enforcement mode for E1-E7. No active source-controlled hook config.
- Evaluation: Phase 6 deterministic run schema, stream parser, aggregator,
  fixtures, and optional Headroom spec. Live evidence remains pending.
- Release preparation: Phase 7A runtime package allowlist, candidate/final gate
  distinction, package inspection, and final-version dry-run.
- Phase 7B evidence gate: committed pending manifest and deterministic final
  evidence validator are present; live Claude model evidence is blocked by
  authentication failure, so final release remains closed.

## Current Risks

- Phase 3B.2, Phase 4, Phase 5, and Phase 6 live evidence gates are still open.
- `release:check:final` must fail with
  `LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE` until those gates are accepted.
- `docs/release-evidence/0.5.0/live-evidence.json` is pending evidence, not a
  final release approval.
- No token savings or behavior guarantees may be claimed from static tests alone.
- No active `hooks/hooks.json` may ship in the source tree or runtime package.
- Preserve unrelated dirty or untracked work in any checkout you touch.

## Next Work

1. Run and record the deferred live evidence matrix.
2. Resolve Claude Code authentication for non-interactive live smokes, then
   accept or reject enforcement/live behavior based on saved stream evidence.
3. Record conservative token/cost thresholds only from measured data.
4. Perform the final `0.5.0` version bump after final release gates are green.

## Verification

Focused Phase 7A checks:

```text
npm.cmd run check
npm.cmd run test:phase6
npm.cmd run test:release
claude plugin validate . --strict
```

Full deterministic suite remains required before a Phase 7A handoff is complete.

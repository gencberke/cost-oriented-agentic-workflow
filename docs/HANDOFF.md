# Current Handoff

This is the concise operational snapshot for `cost-oriented-agentic-workflow`.
For first-read agent guidance, see [`../AGENTS.md`](../AGENTS.md). For compact
design detail, see [`architecture/v0.5.0/`](architecture/v0.5.0/). For deep
context recovery, see
[`architecture/v0.5.0/COW-MASTER-HANDOFF.md`](architecture/v0.5.0/COW-MASTER-HANDOFF.md).

## Verified State

- Source root: `C:\Users\gencberke\Desktop\cost-oriented-agentic-workflow`.
- Branch: `feat/v0.5.0-phase-4-shadow-hooks`.
- HEAD at this handoff update: `75406c5` (Phase 4 substrate committed); Phase 5A
  work is present as uncommitted changes on top.
- Package version: `0.4.2`.
- Runtime dependencies: zero.
- Last targeted verification before this handoff update:
  - `npm.cmd run check`: 393 checks passed, 0 failed.
  - `npm.cmd run test:hooks`: 39 checks passed, 0 failed (shadow preserved).
  - `npm.cmd run test:enforcement`: 127 checks passed, 0 failed.
  - `claude plugin validate . --strict`: passed.
- Working tree: dirty with Phase 5A enforcement work (intentionally uncommitted;
  the phase mandates no commit). There is an unrelated untracked
  `analyze-apply-project-rules/` folder and the `phase_5.md` task spec under the
  source root; neither is canonical project content.
- Active hook file: none. `hooks/hooks.json` must not exist before the Phase 6
  live-activation gate. `hooks/hooks.enforcement.json.example` is an inactive
  example only.
- Runtime package capability: the generated `0.4.2` runtime package is not yet
  the complete v0.5.0 control-plane distribution. Top-level `agents/**` and
  active hooks are release-path work. `test:release` requires a clean tree and
  is therefore blocked during Phase 5A by the no-commit policy, not by a code
  defect.

## Implemented Control Plane

- State and workspace: per-checkout ignored run directory, `cow-state.mjs`,
  schema validation, corruption refusal, reconstruction support, and conservative
  resume from plan, ledger, and Git.
- Repository intake: deterministic snapshot/profile helpers and discovery
  readiness rules.
- Agents: four scoped plugin agents for repository investigation, debug
  investigation, implementation, and review. Dispatch uses exact scoped
  identifiers. Agents never commit or update state.
- Discovery routing: controller map, investigator, and parallel-investigator
  routes with bounded controller reads and profile warm/stale handling.
- Implementation routing: inline, delegated, planned sequential, and delegated
  batch routes with per-unit ownership, immutable attempt reports, and review
  package support.
- Review control: scoped reviewer integration, causality-aware findings,
  targeted re-review after Critical/Important fixes, and the two-wave remediation
  ceiling. Live behavior evidence remains separate from static structure.
- Phase 4 hooks: SessionStart lean resume pointer, PreToolUse observation, and
  PreCompact observation. Hooks fail open and do not block in this phase.
- Phase 5A enforcement: explicit `--decision-mode=enforce` PreToolUse mode that
  emits `ask`/`deny` for E1–E7 zero-false-positive binary rules. Shadow mode is
  preserved byte-identically. No active `hooks/hooks.json`; enforcement runtime
  activation is deferred to Phase 6.

## Current Risks

- Phase 5A static enforcement is present (`--decision-mode=enforce` for E1–E7),
  but live ASK/DENY runtime activation is deferred to Phase 6. Static tests
  prove the contract shape, not model behavior.
- There is no active `hooks/hooks.json`; runtime packages must not ship one yet.
  `hooks/hooks.enforcement.json.example` is an inactive example only.
- Behavioral and token/cost budgets are not final until Phase 6 evidence is
  collected.
- Live model smokes are expensive and environment-sensitive. Static tests and
  live behavior must be reported separately.
- The repository may contain unrelated dirty or untracked work. Preserve it.

## Next Work

1. Phase 6: accept (or reject) live ASK/DENY enforcement behavior, run
   behavioral, token, and cost evaluation, and tune numeric budgets only with
   measured evidence and a dated `DECISIONS.md` entry.
2. Phase 7: release candidate, version bump to `0.5.0`, final package allowlist,
   changelog, and full verification.

## Lightweight Verification

For docs-only changes:

```text
npm.cmd run check
```

Run broader Bash/eval/release suites only when the change touches runtime
behavior, packaging, or a lightweight check exposes a structural risk.

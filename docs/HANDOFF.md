# Current Handoff

This is the concise operational snapshot for `cost-oriented-agentic-workflow`.
For first-read agent guidance, see [`../AGENTS.md`](../AGENTS.md). For compact
design detail, see [`architecture/v0.5.0/`](architecture/v0.5.0/). For deep
context recovery, see
[`architecture/v0.5.0/COW-MASTER-HANDOFF.md`](architecture/v0.5.0/COW-MASTER-HANDOFF.md).

## Verified State

- Source root: `C:\Users\gencberke\Desktop\cost-oriented-agentic-workflow`.
- Branch: `feat/v0.5.0-phase-4-shadow-hooks`.
- HEAD at this handoff update: `4f0c4f0`.
- Package version: `0.4.2`.
- Runtime dependencies: zero.
- Last targeted verification before this handoff update:
  - `npm.cmd run check`: 378 checks passed, 0 failed.
  - `npm.cmd run test:hooks`: 39 checks passed, 0 failed.
- Working tree: dirty with Phase 4 hook integration plus documentation reset
  edits. There is an unrelated untracked `analyze-apply-project-rules/` folder
  under the source root; do not treat it as canonical project content.
- Active hook file: none. `hooks/hooks.json` must not exist before the
  enforcement phase.
- Runtime package capability: the generated `0.4.2` runtime package is not yet
  the complete v0.5.0 control-plane distribution. Top-level `agents/**` and
  active hooks are release-path work.

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

## Current Risks

- Shadow hooks are not enforcement. Allowed-path, no-commit, investigator-write,
  and mutating-Bash protection still depend on skill contracts plus tests until
  Phase 5.
- There is no active `hooks/hooks.json`; runtime packages must not ship one yet.
- Behavioral and token/cost budgets are not final until Phase 6 evidence is
  collected.
- Live model smokes are expensive and environment-sensitive. Static tests and
  live behavior must be reported separately.
- The repository may contain unrelated dirty or untracked work. Preserve it.

## Next Work

1. Phase 5: selectively enforce only zero-false-positive binary hook rules.
2. Phase 6: run behavioral, token, and cost evaluation; tune numeric budgets only
   with measured evidence and a dated `DECISIONS.md` entry.
3. Phase 7: release candidate, version bump to `0.5.0`, final package allowlist,
   changelog, and full verification.

## Lightweight Verification

For docs-only changes:

```text
npm.cmd run check
```

Run broader Bash/eval/release suites only when the change touches runtime
behavior, packaging, or a lightweight check exposes a structural risk.

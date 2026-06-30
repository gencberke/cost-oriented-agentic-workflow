# COW Master Handoff

This is the deep context recovery document for the v0.5.0 control-plane series.
It is not the first-read document; start with [`../../../AGENTS.md`](../../../AGENTS.md)
and [`../../HANDOFF.md`](../../HANDOFF.md). Use this file when an incoming agent
needs more continuity than the compact handoff provides.

## Repository Snapshot

- Source root: `C:\Users\gencberke\Desktop\cost-oriented-agentic-workflow`.
- Package version: `0.4.2`.
- Runtime dependencies: zero.
- Active hook file: none. `hooks/hooks.json` is intentionally absent.
- Current architecture docs are compact and canonical. Old per-phase handoffs
  were removed from the working tree; Git history is the exact text archive.

## Product Intent

COW is a token-economy Claude Code workflow. The controller owns expensive
judgment: planning, routing, adjudication, verification, and commits. Scoped
agents perform bounded investigation, implementation, and review through files.
The system spends where correctness changes, not by ritual.

## Load-Bearing Invariants

1. Preserve user-owned work.
2. Never reset, clean, checkout, stash, or overwrite unrelated changes without
   explicit user request.
3. Agents never update workflow state.
4. Agents never commit or stage; controlled commits are controller-owned.
5. Review feedback is adjudicated, never blindly applied.
6. Root cause precedes fixes.
7. Discovery and implementation routing are separate axes.
8. Same-file overlap does not make one unit; unit boundaries are outcome,
   responsibility, and verification seam.
9. Reports and review packages never replace Git evidence.
10. Exhausted retry or remediation budgets never imply approval.
11. Runtime dependencies stay zero.
12. Static and live evidence are reported separately.

## Delivered Control Plane

- Phase 1: workflow state helper, state schema, reconstruction, repository
  snapshot/profile foundation.
- Phase 2: four scoped plugin agents with static contracts.
- Phase 3A: repository readiness and discovery routing.
- Phase 3B.1: implementation routing, implementer dispatch, validated reports,
  and controller-owned verification.
- Phase 3B.1.1: per-unit baselines, dirty-overlap protection, immutable attempt
  reports, and baseline-relative compare.
- Phase 3B.2: scoped review control, causality-aware findings, targeted
  re-review, whole-work review, and two-wave remediation ceiling.
- Phase 4: lean SessionStart pointer, PreToolUse/PreCompact shadow observation,
  bounded hook logs, and fail-open hook behavior. No enforcement yet.
- Phase 5A: selective static enforcement. `--decision-mode=enforce` PreToolUse
  path emits only `ask`/`deny` for E1–E7 zero-false-positive binary rules;
  shadow mode is preserved byte-identically; no active `hooks/hooks.json`.
  Live ASK/DENY behavior is deferred to Phase 6.

## Evidence Map

- Structural gate: `npm.cmd run check`.
- Hook gate: `npm.cmd run test:hooks`.
- State/intake: `npm run test:foundation`.
- Agent contracts: `npm run test:agents`.
- Discovery/implementation/review stream analyzers: `tests/*-stream.test.mjs`.
- Eval fixtures and token tooling: `tests/eval/`.
- Behavioral dogfood policy: [`../../DOGFOOD.md`](../../DOGFOOD.md).
- Current phase ledger: [`PHASES.md`](PHASES.md).

## Runtime Packaging Gap

The source tree has v0.5.0 control-plane substrate, but the generated `0.4.2`
runtime package is still intentionally narrower. It does not yet ship top-level
`agents/**` or active `hooks/hooks.json`. Those are release-path changes after
Phase 5/Phase 7 gates. Source dogfood with `claude --plugin-dir <repo>` must be
reported separately from installed-runtime evidence.

## Remaining Roadmap

- Phase 6: accept (or reject) live ASK/DENY enforcement behavior, run behavioral,
  token, and cost evaluation, and tune budgets only from measured evidence.
- Phase 7: bump versions to `0.5.0`, update changelog/release docs, package the
  full runtime control plane, and run the full release gate.

## Incoming-Agent Procedure

1. Read `AGENTS.md`, `docs/HANDOFF.md`, this file, and `PHASES.md`.
2. Check branch, HEAD, status, and package version yourself.
3. Classify dirty/untracked work before acting; preserve unrelated changes.
4. Use deterministic checks first.
5. Do not run live smokes unless the phase requires evidence that static tests
   cannot provide.
6. Do not activate hooks, bump versions, or change runtime package allowlists
   outside their scheduled phase.


# v0.5.0 Architecture Index

This folder is the compact canonical architecture set for the v0.5.0 control
plane. Older per-phase handoffs were removed from the working tree; Git history
is the archive for their exact text. A current `COW-MASTER-HANDOFF.md` remains
for deep context recovery.

## Files

- [`00-control-plane-architecture.md`](00-control-plane-architecture.md):
  high-level architecture, cost model, adopted/adapted Superpowers ideas, agent
  roles, and migration shape.
- [`04-state-machine-and-hook-enforcement.md`](04-state-machine-and-hook-enforcement.md):
  workflow state schema, hook behavior, shadow observations, and selective
  enforcement contract.
- [`05-evaluation-and-release-gates.md`](05-evaluation-and-release-gates.md):
  deterministic checks, fixture layers, live dogfood gates, and release gates.
- [`PHASES.md`](PHASES.md): completed phase ledger and remaining roadmap.
- [`COW-MASTER-HANDOFF.md`](COW-MASTER-HANDOFF.md): deep context recovery for
  incoming agents that need more continuity than the compact handoff.

## Status Legend

- `implemented`: code exists in the source tree.
- `shadow`: code observes and records but does not block.
- `planned`: design exists but runtime behavior must not be claimed as shipped.
- `release-only`: allowed only in the release candidate phase.

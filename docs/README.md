# Documentation Index

Start with [`../AGENTS.md`](../AGENTS.md). It is the canonical onboarding file
for agents and maintainers.

## Current Documents

- [`HANDOFF.md`](HANDOFF.md) is the concise operational snapshot for the current
  source tree.
- [`DECISIONS.md`](DECISIONS.md) is the dated decision log. It keeps historical
  rationale without making old phase handoffs canonical.
- [`DOGFOOD.md`](DOGFOOD.md) defines behavioral smoke and cost-evaluation
  protocol.
- [`RELEASE_0.5.0.md`](RELEASE_0.5.0.md) is the concise Phase 7A release
  candidate handoff and final-release procedure.
- [`architecture/v0.5.0/`](architecture/v0.5.0/) contains the compact v0.5.0
  architecture, state/hook contract, gates, and roadmap.
- [`architecture/v0.5.0/COW-MASTER-HANDOFF.md`](architecture/v0.5.0/COW-MASTER-HANDOFF.md)
  is the deep context recovery document for agents that need more than the
  compact handoff.

## Historical Material

The old per-phase handoff files were removed from the working tree during the
documentation reset. Their durable facts were folded into the compact
architecture docs, `HANDOFF.md`, and the current master handoff; Git history
remains the archive for exact old text.

## Maintenance Rules

- Keep future-facing documentation in English.
- Prefer updating `AGENTS.md`, `HANDOFF.md`, `PHASES.md`, and `DECISIONS.md`
  over adding another long handoff file.
- Do not document an implementation as complete unless the corresponding code
  and evidence exist in the source tree.
- Keep runtime behavior, hook activation, version bumps, and packaging changes
  out of documentation-only cleanup.

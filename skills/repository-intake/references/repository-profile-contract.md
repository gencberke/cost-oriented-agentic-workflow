# Repository Profile Contract

The **repository profile** is the controller-owned, semantic map of a repository,
synthesized from the deterministic `repo-snapshot.json` (and, from Phase 2, an
optional read-only investigator's notes). It is what makes a repo *warm*: a valid
profile lets the controller skip broad re-exploration.

This document is the **contract** the profile must satisfy. Phase 1 only *defines
and validates* this contract (via `repo-snapshot.mjs check-profile`). It does **not**
author profiles — generation is a future investigator's job. Do not hand-wave a
profile into existence here.

Artifacts (both in the ignored workspace `<repo-root>/.cost-oriented-agentic-workflow/run/`):

- `repo-profile.json` — machine-readable profile (the source of truth for warm/stale).
- `repo-profile.md` — a short human-readable echo of the same facts.

## Required fields (`repo-profile.json`)

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | number | profile schema version (currently `1`) |
| `fingerprint` | string | the `repo-snapshot.mjs` fingerprint this profile was built against; basis for warm/stale |
| `status` | enum | `ready` \| `warm` \| `stale` \| `partial` — overall profile state |
| `generatedAtCommit` | string\|null | the HEAD sha when the profile was synthesized (informational, **not** part of the fingerprint) |
| `instructionSources` | array | instruction files that govern the repo (`CLAUDE.md`, etc.) — **paths only**, mirrored from the snapshot |
| `languages` | array | declared language/stack signals (mirrors the snapshot) |
| `buildCommands` | array | build commands — **verified** or explicitly marked unverified (see below) |
| `testCommands` | array | test commands — same verified/unverified rule |
| `subsystems` | array | module boundaries: `{ name, paths[], status: mapped\|unmapped, notes }` |
| `conventions` | array | short, observable repo conventions (e.g. "tests colocated as `*.test.ts`") |
| `riskHotspots` | array | hard-exclusion surfaces (auth, migrations, money, secrets, …) — paths/globs |
| `unmapped` | array | subsystems/paths not yet read; the deep-read backlog |
| `uncertainty` | array | explicit unknowns/assumptions ("DI framework inferred, not confirmed") |
| `verifiedCommands` | array | the subset of build/test commands actually run and observed to succeed, each with how it was verified |
| `generatedAt` / `updatedAt` | string | ISO 8601 creation / last-update timestamps |

## Verified vs. unverified commands

A command may appear in `buildCommands` / `testCommands` as a **candidate** (parsed
from a manifest), but it must **not** be presented as verified unless it is listed
in `verifiedCommands` with evidence of an actual successful run. Never label an
unrun command "verified."

## Forbidden content (hard rules)

The profile records **structure and observable facts only**. It must never contain:

- source-code dumps or file bodies;
- long logs or command transcripts;
- secrets, tokens, credentials, or environment-variable values;
- reasoning transcripts / chain-of-thought;
- arbitrary conversation history;
- unverified commands presented as verified.

These mirror the snapshot's safety rules and the control-plane constraint that no
secrets or hidden reasoning are persisted.

## Size limits

- `repo-profile.json` ≤ 8 KB; `repo-profile.md` ≤ 150 lines.
- Bulk detail belongs in a scoped notes file referenced by path, never inlined.

## Freshness

`repo-snapshot.mjs check-profile <repo-profile.json>` is the only authority on
freshness. It returns `VALID` (fingerprint matches), `STALE` (structure/config or
schema changed), `MISSING` (no file), or `INVALID` (unparseable / no fingerprint).
A profile whose `fingerprint` no longer matches the live repo is stale regardless
of how recently it was written. See `repository-profile-template.json` and
`repository-profile-template.md` for shapes.

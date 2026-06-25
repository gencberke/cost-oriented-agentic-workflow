# Repository Profile Contract

The **repository profile** is the controller-owned, semantic map of a repository,
synthesized from the deterministic `repo-snapshot.json` (and, from Phase 2, an
optional read-only investigator's notes). It is what makes a repo *warm*: a valid
profile lets the controller skip broad re-exploration.

This document is the **contract** the profile must satisfy. As of Phase 3A,
`repo-profile.mjs` enforces it: the `cow-repo-investigator` agent returns a profile
**draft** inside a delimited envelope, and `repo-profile.mjs accept-agent-output`
validates and atomically promotes it. The controller never trusts an unvalidated
profile, and a `PARTIAL` draft is never promoted to a warm (`VALID`) profile.

Artifacts (all in the ignored workspace `<repo-root>/.cost-oriented-agentic-workflow/run/`):

- `repo-profile-agent-output.txt` — the raw agent envelope (input to acceptance).
- `repo-profile.candidate.json` — the extracted candidate (written atomically first).
- `repo-profile.json` — the promoted, validated profile (source of truth for warm/stale).
- `repo-profile.md` — a bounded human-readable echo, rendered from the JSON.

## Required fields (`repo-profile.json`) — enforced by `repo-profile.mjs`

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | number | profile schema version (currently `1`) |
| `fingerprint` | string | sha256; must equal the current `repo-snapshot.json` fingerprint (basis for warm/stale) |
| `status` | enum | `ready` \| `partial` — `ready` = complete (promotable to warm); `partial` = bound hit / unmapped subsystems remain |
| `generatedAtCommit` | string\|null | HEAD sha when synthesized (informational, **not** part of the fingerprint) |
| `instructionSources` | string[] | instruction files (`CLAUDE.md`, …) — **repo-relative paths only**, mirrored from the snapshot |
| `languages` | `{name,ext}[]` | declared language/stack signals (mirrors the snapshot) |
| `buildCommands` | `{command,confidence}[]` | `confidence ∈ verified\|inferred\|unknown` (see below) |
| `testCommands` | `{command,confidence}[]` | same shape and rule |
| `subsystems` | `{name,paths[],status,confidence,notes}[]` | `status ∈ mapped\|unmapped`; `paths` are repo-relative (globs allowed) |
| `conventions` | string[] | short, observable repo conventions |
| `riskHotspots` | string[] | hard-exclusion surfaces (auth, migrations, money, secrets, …) — repo-relative paths/globs |
| `unmapped` | string[] | subsystems/paths not yet read; the deep-read backlog |
| `uncertainty` | string[] | explicit unknowns/assumptions |
| `updatedAt` | string | ISO 8601 (set on acceptance if absent) |

## Confidence: verified / inferred / unknown

Every command and subsystem carries a `confidence` tag. The investigator has **no
shell**, so in an agent **draft** a command may be `inferred` (parsed from a
manifest) or `unknown` — **never `verified`**; `repo-profile.mjs validate-agent-output`
rejects a draft that labels a command `verified`. Only the controller, after an
actual successful run, may promote a command to `verified` (a later phase).

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

Two deterministic helpers, same vocabulary: `repo-snapshot.mjs check-profile` and
`repo-profile.mjs status` both return `VALID` (fingerprint matches), `STALE`
(structure/config or schema changed), `MISSING` (no file), or `INVALID`
(unparseable / no fingerprint); `repo-profile.mjs status` additionally reports
`PARTIAL` for an accepted-but-incomplete profile. A profile whose `fingerprint` no
longer matches the live repo is stale regardless of how recently it was written.
The controller maps the result onto the state enum via `cow-state.mjs profile`
(`VALID→warm`, `STALE→stale`, `MISSING/INVALID→absent`). See
`repository-profile-template.json` and `repository-profile-template.md` for shapes.

---
name: repository-intake
description: Use before working in an unfamiliar or possibly-changed repository: get a cheap cached structural map via the deterministic repo-snapshot helper instead of reading broadly, and check a cached repo-profile's freshness by fingerprint. Skip for warm repos and trivial light-inline edits.
---

# Repository Intake

Give the controller a **cheap, cached map** so it never reads broadly itself (broad
reading is the cost leak this removes). Intake is a **fast path, not ceremony** —
skip it whenever the map is already warm.

## When intake runs

Only when the controller lacks a current map: a first non-trivial task with **no
`repo-profile.json`**, a **stale** profile, or a task touching an `unmapped`
subsystem.

## Warm-repo skip (the default)

Skip intake — emit `Profile: warm — skip intake.` — when **any** holds:
- a current `repo-profile.json` exists and `check-profile` reports `VALID`; or
- the repo is already in the controller's working context this session; or
- the task is a trivial, low-risk, single-outcome **light-inline** edit (the light
  path is never gated on intake); or
- `mode = standard` and the task is fully specified against known paths.

## Snapshot helper (deterministic, zero-dependency)

`repo-snapshot.mjs` emits structure only — paths, hashes, sizes, language/dir
shape — **never file contents, diffs, env values, or secrets**. Invoke with Node
(`SKILL_DIR` = this skill's supplied base dir; `<ws>` =
`<repo-root>/.cost-oriented-agentic-workflow`, the ignored workspace):

```text
node "$SKILL_DIR/scripts/repo-snapshot.mjs" write                # -> <ws>/run/repo-snapshot.json
node "$SKILL_DIR/scripts/repo-snapshot.mjs" check-profile <ws>/run/repo-profile.json
```

## Profile freshness — classify, don't guess

`check-profile` prints one word and a non-ambiguous exit code:

| Result | Exit | Meaning | Action |
|---|---|---|---|
| `VALID` | 0 | fingerprint matches | warm — reuse the profile |
| `STALE` | 2 | structure/config/schema changed | re-snapshot, refresh profile |
| `MISSING` | 3 | no profile file | run intake |
| `INVALID` | 4 | unparseable / no fingerprint | run intake |

Fingerprint = manifests + instruction files + directory shape + languages, **not**
`HEAD` — ordinary source commits don't invalidate it; only dependency / structure /
instruction changes do.

## Responsibilities

- **Controller:** run the snapshot (one cheap call); decide if a deeper read is
  needed; **synthesize** `repo-profile.json` / `.md`; mark subsystems
  `mapped` / `unmapped`. Never read the tree broadly.
- **Future repository investigator (Phase 2 — does not exist yet):** deep-reads an
  `unmapped` subsystem, read-only. Until it ships the controller does a minimal
  scoped read itself; **do not dispatch an agent that does not exist.**

The profile is **semantic** output; this skill defines and validates its contract,
it does not author it —
[references/repository-profile-contract.md](references/repository-profile-contract.md).

## Failure behavior

`git` unavailable / not a repo → the helper exits non-zero clearly; fall back to a
minimal scoped map, record the profile absent. A bad manifest never aborts the
snapshot, which never fails the task.

> Phase 1 status: foundation only — not yet wired into the entry skill or routing.
> Invoke intake deliberately; integration is Phase 3.

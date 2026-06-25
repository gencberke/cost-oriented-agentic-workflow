---
name: repository-intake
description: Use before working in an unfamiliar or possibly-changed repository: get a cheap cached structural map via the deterministic repo-snapshot helper instead of reading broadly, and check a cached repo-profile's freshness by fingerprint. Skip for warm repos and trivial light-inline edits.
---

# Repository Intake

Give the controller a **cheap, cached map** so it never reads broadly itself. Intake
is a **fast path, not ceremony** — skip it whenever the map is already warm.

## When intake runs

Only when the controller lacks a current map: a first non-trivial task with **no
`repo-profile.json`**, a **stale** profile, or a task touching an `unmapped`
subsystem.

## Warm-repo skip (the default)

Skip intake — emit `Profile: warm — skip intake.` — when **any** holds:
- a current `repo-profile.json` exists and `check-profile` reports `VALID`; or
- the repo is already in the controller's working context this session; or
- the task is a trivial, low-risk, single-outcome **light-inline** edit; or
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

Fingerprint excludes `HEAD`: ordinary source commits don't invalidate it; only
dependency / structure / instruction changes do.

## Responsibilities

- **Controller:** run the snapshot (one cheap call); decide if a deeper read is
  needed; **synthesize** `repo-profile.json` / `.md`; mark subsystems
  `mapped` / `unmapped`. Never read the tree broadly.
- **Repository investigator** (`cost-oriented-agentic-workflow:cow-repo-investigator`):
  dispatched read-only with `OUTPUT_FORMAT=PROFILE_DRAFT` to draft the profile (or
  `TASK_DISCOVERY` for one subsystem). Dispatch the exact scoped id — never
  auto-select, never a generic fallback.

The profile is **semantic** output; the agent drafts it, `repo-profile.mjs` validates
and atomically promotes it (the controller never trusts it unvalidated), and this
skill defines its contract —
[references/repository-profile-contract.md](references/repository-profile-contract.md).

## Failure behavior

`git` unavailable / not a repo → the helper exits non-zero; fall back to a minimal
scoped map and record the profile absent. A bad manifest never aborts the snapshot.

> Phase 3A: intake is **live** — the entry skill establishes repository readiness on
> activation (`using-cost-oriented-workflow/references/repository-readiness.md`), and
> profile acceptance is mandatory via `repo-profile.mjs`. Implementation routing is
> still the legacy path.

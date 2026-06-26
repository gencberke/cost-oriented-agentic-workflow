# Repository readiness (activation order)

Loaded on demand from the entry skill. This is the **mandatory ordering** that runs
before any broad repository exploration, plus the intake-dispatch and warm-path
rules. Detailed discovery-route selection lives in `discovery-routing.md`.

`<ws>` = `<repo-root>/.cost-oriented-agentic-workflow`; helpers are Node-invoked
from their owning skill's `scripts/` dir.

## Activation order (§8.1)

When the workflow launcher is used, in this order:

1. **Resolve the worktree root** (`git rev-parse --show-toplevel`).
2. **Read workflow-state status** — `cow-state.mjs status`.
3. **ABSENT → init** — `cow-state.mjs init --mode <standard|production>` (or
   `init --reconstruct` when a plan/ledger exists but `state.json` does not).
4. **ACTIVE_CORRUPT → block, preserve evidence** — do not overwrite; surface it and
   recover only via the explicit `init --reconstruct`.
5. **Run/refresh the deterministic snapshot** —
   `node "$SKILL_DIR/scripts/repo-snapshot.mjs" write` (repository-intake skill).
6. **Check profile status** — `repo-profile.mjs status` (or `repo-snapshot.mjs
   check-profile <ws>/run/repo-profile.json`): `VALID | STALE | MISSING | INVALID`.
7. **VALID → warm path** — skip intake (see Warm fast path).
8. **MISSING / STALE / INVALID → run repository intake** (see Intake dispatch).
9. **Only after repository readiness, classify the process lane** (light-inline /
   brainstorm / plan / debug).
10. **Select the discovery route before broad exploration** (`discovery-routing.md`).
11. **Leave the implementation route pending** until later implementation triage —
    Phase 3A does not choose it.

Before readiness the controller may inspect **only**: the snapshot, the validated
profile, instruction files the snapshot identified, and manifests needed to confirm
the repository lane. It must **not** broadly read source files before readiness and
discovery routing.

## Intake dispatch (§8.2)

Dispatch **exactly** the scoped agent — never rely on automatic selection:

```text
cost-oriented-agentic-workflow:cow-repo-investigator   (OUTPUT_FORMAT=PROFILE_DRAFT)
```

Supply every required input from its contract (`SNAPSHOT_PATH`,
`PROFILE_CONTRACT_PATH`, `TASK_CONTEXT`, `OUTPUT_FORMAT`, `READ_SCOPE`). Then the
controller:

1. saves the raw agent output to `<ws>/run/repo-profile-agent-output.txt`;
2. runs `repo-profile.mjs validate-agent-output … --snapshot …`;
3. accepts it only after validation passes (`accept-agent-output`, atomic);
4. records the result with `cow-state.mjs profile --status <warm|stale|absent> …`;
5. **never** manually declares an unvalidated profile valid.

If the scoped agent is unavailable: do **not** silently fall back to a generic
agent. Return a clear blocked status. The generic prompt templates remain for
compatibility but are **not** used in the 0.5 discovery path.

One corrected redispatch is allowed after a validation failure (the validation
errors are the changed context); a second failure blocks intake.

## Warm fast path (§8.3)

A `VALID` profile **skips** the intake dispatch — emit a `repository=warm` receipt
and reuse the profile.

- A normal source-only commit must **not** cause intake to repeat (the fingerprint
  excludes `HEAD`).
- A changed instruction file, manifest, build/test config, or relevant structural
  signature produces `STALE` → run intake again.
- Dirty source edits **alone** never auto-invalidate the profile; the snapshot
  records dirty paths and proceeds read-only (no reset/stash/clean).

### Profile validity vs. task discovery — two separate decisions

**Profile validity controls repository intake. Task uncertainty controls
task-specific discovery. They are separate decisions** — never conflate them:

- **profile `VALID` → no `PROFILE_DRAFT` dispatch.** A valid profile is warm; do not
  regenerate it. `PROFILE_DRAFT` (intake) is for `MISSING`/`STALE`/`INVALID` only.
- **profile `VALID` + the task needs semantic discovery → `TASK_DISCOVERY` may be
  dispatched** (`cow-repo-investigator` with `OUTPUT_FORMAT=TASK_DISCOVERY`) to map
  one subsystem — this does **not** rebuild the profile and leaves its fingerprint
  unchanged.
- **dirty source paths alone do not change profile validity and do not authorize
  `PROFILE_DRAFT`.** A dirty tree may affect allowed paths, ownership, risk, or
  implementation sequencing — but it must **not**, by itself, trigger repository-
  profile regeneration. Only a fingerprint change (manifest / instruction /
  structure) makes a profile `STALE`.

So: a warm, dirty repository is still warm. If a dirty-tree task needs deeper
mapping, that is `TASK_DISCOVERY`, never `PROFILE_DRAFT`.

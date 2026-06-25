# Phase 1 Handoff — State & Repository-Intake Foundation

Status: **delivered**. The deterministic substrate of the 0.5.0 control plane is
implemented, tested, and committed on `feat/v0.5.0-control-plane`. It is **not**
wired into the entry skill, routing, agents, or hooks (that is Phases 2–5). Package
version stays **0.4.2**. Existing 0.4.2 behavior is unchanged (new files + an
additive prose-budget split only).

## Implemented files

| File | Role |
|---|---|
| `skills/execution-routing/scripts/cow-state.mjs` | workflow control-state helper (Node + git, zero deps, mode 100644) |
| `skills/repository-intake/scripts/repo-snapshot.mjs` | deterministic repository snapshot + fingerprint + profile check (mode 100644) |
| `skills/repository-intake/SKILL.md` | compact, on-demand intake process contract (3,463 B; on-demand ceiling 3,500) |
| `skills/repository-intake/references/repository-profile-contract.md` | the repo-profile contract (fields, forbidden content, size limits) |
| `skills/repository-intake/references/repository-profile-template.json` | profile shape (machine-readable) |
| `skills/repository-intake/references/repository-profile-template.md` | profile shape (human echo) |
| `tests/state.test.mjs` | 76 deterministic temp-repo tests for `cow-state` |
| `tests/repo-intake.test.mjs` | 39 deterministic temp-repo tests for snapshot/profile + runtime-path |
| `tests/validate-structure.mjs` | prose-budget split (on-demand skill ceiling) |
| `package.json` | `test:foundation` script (runs both Node suites) |

## Command interfaces

`cow-state.mjs` (worktree root from CWD via `git rev-parse --show-toplevel`):
`init [--reconstruct] [--mode] [--commit-policy] [--base-branch] [--merge-base] [--plan]`,
`status`, `transition --phase X [--reroute] [--lane]`,
`route --discovery V | --implementation V`, `root-cause --status V [--report]`,
`plan --start|--approve|--done [--path]`, `unit --id N [--paths a,b] [--base]`,
`verify --pending|--passed|--failed [--cmd]`, `review --start|--clean|--findings|--wave`,
`attempt --inc|--reset`, `block --reason <code> [--artifact]`, `complete`. Every
command takes `--json` / `--oneline`.

`repo-snapshot.mjs`: `write [--out PATH]`, `print`, `fingerprint`,
`check-profile <profile.json>` → `VALID(0)` / `STALE(2)` / `MISSING(3)` / `INVALID(4)`.

## Versions

- **State schema:** `schemaVersion 1`.
- **Snapshot schema:** `schemaVersion 1`.
- **Profile contract:** `schemaVersion 1`.

## Tests & counts (all green; commands in §Verification of the report)

- `npm run check` (structural / Layer 1): **192** checks, 0 failed (was 187; +5 for
  the new skill + the on-demand-ceiling check).
- `npm run test:foundation`: `state` **76** + `repo-intake` **39** = **115** checks, 0 failed.
- `npm run test:scripts` (helper, unchanged): **40**, 0 failed.
- `npm run test:eval` (unchanged): **9**, OK.
- `claude plugin validate . --strict`: passed.

## Decisions Phase 2 may rely on

- **Helper paths are stable and runtime-allowlisted** via `skills/**`:
  `skills/execution-routing/scripts/cow-state.mjs`,
  `skills/repository-intake/scripts/repo-snapshot.mjs`. Both Node-invoked, mode
  100644 (no exec bit). The runtime builder needs **no** allowlist change for them.
- **State is authoritative for position only** and reconstructable from
  Git + plan + ledger; corruption is fail-loud (exit 3), never silently replaced.
  Agents/hooks must **read** via `cow-state`, never hand-edit `state.json`.
- **`allowedPaths`, `currentUnit`, routes, attempts, remediationWaves** are already
  recorded — the Phase-5 path/scope hooks can read them directly.
- **Schema corrections from Phase 0** (now in `04`): `blocked {code,artifactPath,priorPhase}`,
  `timestamps {createdAt,updatedAt}`, no `review.waves` (use `remediationWaves.count`).
- **Fingerprint** covers manifests + instruction files + dir-name shape + languages
  (name/ext), over working-tree content; it excludes HEAD/dirty/history/file-counts.
  A warm/stale decision needs **no LLM** — `check-profile` is deterministic.
- **Profile generation is unbuilt by design.** Phase 2's `cow-repo-investigator`
  produces the semantic `repo-profile.json/.md` against the contract in
  `references/repository-profile-contract.md`. Phase 1 only validates that contract.

## Unresolved risks for Phase 2

- **Auto-delegation wording** for `cow-repo-investigator` is unproven — whether the
  controller reliably picks it from a `description` alone is a Phase-2/3 eval risk
  (not a foundation risk).
- **Reconstruct heuristics are conservative.** `init --reconstruct` derives phase
  from ledger presence (`implementing` if any unit line, `blocked` if `waves=2` +
  `blocked`); a richer ledger vocabulary in later phases may want finer mapping. The
  budget-exhaustion rule (never reset) is honored.
- **`processLane` is only auto-set to `debug`** on diagnosis entry (or via `--lane`);
  Phase 3 routing integration will set the other lanes when it wires intake/routing
  to the entry skill.
- **Profile freshness vs. partial maps:** `check-profile` validates the fingerprint,
  not subsystem `mapped/unmapped` coverage. Phase 2 must decide when an
  `unmapped`-but-VALID profile still triggers an investigator dispatch (`02` A.2).

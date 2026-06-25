# Phase 3A Handoff — Discovery Control Plane

Status: **discovery control plane integrated and live (source-loaded).** Repository
intake and discovery routing are wired into the entry skill + systematic-debugging;
implementation routing is still the **legacy 0.4.x path**. Custom implementer/reviewer
agents remain **unintegrated** (Phase 3B). Package version stays **0.4.2**.

## Preload sentinel proof (§5)

A random `COW_PRELOAD_SENTINEL_<hex>` was appended to `systematic-debugging/SKILL.md`
in a **temporary `git archive HEAD` copy outside the repo**, then a fresh
`claude --plugin-dir <temp copy>` dispatched the scoped
`cost-oriented-agentic-workflow:cow-debug-investigator`, which **returned the marker
verbatim**. The marker was never in the dispatch prompt; the agent's only tool calls
targeted a throwaway fixture repo, never the temp plugin (the marker's only
location). So the marker could only come from the **injected preload** — proving the
qualified `skills:` preload works at runtime. Source repo unchanged. Evidence:
`.cost-oriented-agentic-workflow/eval/agents/preload-sentinel-proof.stream.jsonl`
(ignored). The strict "zero tool calls" procedure was infeasible (the agent prioritizes
its diagnosis contract over a contentless recall, observed across three framings); the
random-sentinel-unreachable-by-tools proof establishes the same fact and is documented
openly, not weakened.

## Profile acceptance (§6)

`skills/repository-intake/scripts/repo-profile.mjs` (Node + git, zero deps) owns
parsing, validation, fingerprint comparison, and atomic promotion. Commands:
`validate-agent-output`, `accept-agent-output`, `validate`, `status`
(`VALID`/`STALE`/`MISSING`/`INVALID`/`PARTIAL`), `render`. It extracts only the
delimited `PROFILE_JSON` from the agent envelope (rejecting multiple blocks /
ambiguous text / `BLOCKED_INPUT`), validates schemaVersion + fingerprint-vs-snapshot
+ safe repo-relative paths + verified/inferred/unknown confidence (rejecting a
`verified` command from a shell-less agent) + a secret/env denylist + an 8 KB cap;
**preserves the previous valid profile on failure**; never promotes `PARTIAL` to
`VALID`; writes candidate → final → Markdown atomically. Run-dir artifacts:
`repo-profile-agent-output.txt` → `repo-profile.candidate.json` → `repo-profile.json`
→ `repo-profile.md`.

## State profile command (§7)

`cow-state.mjs profile --status <absent|building|ready|warm|stale> [--snapshot P]
[--profile P] [--fingerprint F]` updates **only** `repositoryProfile.*`
(`status, snapshotPath, profilePath, fingerprint, updatedAt`). The helper is
authoritative for validity; state records the mapped result
(`VALID→warm`, `STALE→stale`, `MISSING`/`INVALID→absent`). State stays a projection
of Git + approved artifacts + ledger.

## Live control flow (§8) and route receipt (§9)

Activation order (entry skill + `references/repository-readiness.md`): resolve root →
`cow-state status` → init/`--reconstruct` if absent → block if active-corrupt →
`repo-snapshot.mjs write` → check profile → `VALID`=warm else intake → classify lane →
select discovery route → leave implementation route **pending**. Before readiness the
controller may read only the snapshot, profile, instruction files, and lane-confirming
manifests — never broad source.

Stable receipt:
`Route: lane=<lane>; repository=<warm|intake>; discovery=<controller-map|investigator|parallel-investigators>; implementation=pending; risk=<risk>`;
re-route: `Re-route: reason=<code>; discovery=<new-route>; implementation=pending`.

Controller-map budget (release gate): snapshot + profile + instruction files + **≤3**
targeted source/config reads + **≤1** bounded Grep/Glob; else dispatch an
investigator. Disjoint debugging dispatches **≤2** `cow-debug-investigator` instances.

## Static validation

- `npm run check` (structural, incl. 12 routing-structure invariants + reference
  ceilings): **246**.
- `npm run test:profile` (profile acceptance + state profile): **32**.
- `npm run test:foundation`: **115** (state 76 + repo-intake 39).
- `npm run test:agents`: **152**.
- `npm run test:eval` (incl. 3 discovery-fixture validators): **15 tests OK**.
- `npm run test:scripts`: **40**. `claude plugin validate . --strict`: passed.
- Always-on prose **85,995 / 86,000**; `repository-intake/SKILL.md` **3,496 / 3,500**;
  references measured separately (`repository-readiness.md`, `discovery-routing.md`
  ≤ 4,500 each).

## Live smokes (§15)

Claude Code **2.1.186**; `claude --plugin-dir <repo>`; disposable temp git repos;
`--output-format stream-json`; raw evidence (uncommitted) under
`.cost-oriented-agentic-workflow/eval/agents/`. `subagent_type` in the stream is
authoritative for spawn counts (a prose mention of an agent is not a dispatch).

| Smoke | Profile | Discovery / scoped agent | Mutations | Result |
|---|---|---|---|---|
| A unknown-repo | MISSING → **warm** | intake → `cow-repo-investigator` (sonnet) | none | profile.json accepted (status=warm), Route receipt, stopped at triage |
| B warm-repo | **VALID** reused | **none** — no investigator | none | `repository=warm` receipt, no re-intake, stopped |
| C stale-profile | **STALE → warm** | one `cow-repo-investigator` re-intake | none | new fingerprint accepted, **no silent reuse** of the stale profile |
| D single-bug | warm | one `cow-debug-investigator` | none (bug left unfixed) | root cause evidenced via `cow-state root-cause`; no implementer; stopped, route pending |
| E disjoint-bugs | warm | **two** `cow-debug-investigator` (≤2, disjoint scopes) | none | both diagnosed; no implementer; stopped |
| F dirty-tree | **VALID** despite dirty | (see note) | none — **user edits preserved**, no reset/clean/checkout/stash | profile VALID; dirty paths recorded read-only |

All six pass. Controllers ran on Opus; investigators on Sonnet; every dispatch used
the exact scoped identifier; in every smoke the controller **stopped at implementation
triage with `implementationRoute` pending** and dispatched no `cow-implementer`/`cow-reviewer`.

Notes (recorded for honesty, not weakening): (1) Smoke A's first run was cut by an
**account session limit** before profile finalization — an environment limit, not a
repo defect; the re-run (after reset) completed cleanly. (2) Smoke B was retried once
for a **harness defect** — a `--token` in the task wording was parsed by the `claude`
CLI as an option; reworded, it passed. (3) Smoke F: the controller dispatched a
`cow-repo-investigator` even though the profile was VALID (a minor deviation — the
strict warm-skip seen in B was not taken under a dirty tree); all **required**
dirty-handling assertions (preserve user edits, no destructive git, VALID-despite-dirty)
passed. This warm-skip-under-dirty nuance is a Phase 3B calibration item.

## Boundary statements (must hold entering Phase 3B)

- **Repository intake is live**; **discovery routing is live**.
- **Implementation routing is still the legacy 0.4.x path** — `implementationRoute`
  stays `pending` through diagnosis; nothing in execution-routing changed.
- **`cow-implementer` and `cow-reviewer` remain unintegrated** — never dispatched here.
- **State has no hook enforcement yet** — readiness/route/no-commit hold by adherence.
- **Read-only Bash (debug-investigator) is contract-enforced only** — no PreToolUse hook.
- **The runtime builder still does not ship `agents/**`** — loaded via `--plugin-dir`.
- **Generic prompt templates remain compatibility fallbacks** — present, not used in the
  0.5 discovery path.

## Phase 3B requirements / risks

- **Integrate implementation + review agents without redoing discovery routing.**
  `cow-implementer`/`cow-reviewer` plug into execution-routing's implementation route;
  discovery routing (this phase) stays as-is.
- The implementation route must be lifted from `pending` to the dual-axis values
  (`inline | delegated | planned-sequential | delegated-batch`) and recorded via
  `cow-state route --implementation`.
- The mode/risk review matrix, retry/remediation ceilings, and commit policy are
  unchanged here and must be honored by the agent integration.
- Token-budget calibration (controller-map reads, agent `maxTurns`, parallel caps)
  remains a later eval/tuning concern; record measured dispatch costs.

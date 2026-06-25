# 04 — State Machine & Hook Enforcement

Solves **W4** (rules rationalized away), **W5** (tracked diagnostic edits before
re-triage), **W7** (fragile resume/compact), **W8** (no deterministic enforcement).
State records *position*; hooks enforce a small *binary* subset that trusts state;
skills remain authoritative for *meaning* (`00` §6).

---

## Part A — Workflow state model (`7.5`)

### A.1 Path & ownership
`<repo-root>/.cost-oriented-agentic-workflow/run/state.json` — ignored, per-checkout
(linked worktrees do not share, like the existing workspace). **Written only by the
`cow-state` helper; the model never edits the JSON by hand.** Hooks **read** it,
never write it.

### A.2 Schema (`schemaVersion: 1`) — observable control only, no reasoning prose

```jsonc
{
  "schemaVersion": 1,
  "active": true,                       // global hook guard
  "mode": "standard",                   // standard | production
  "phase": "triage",                    // see A.3 enum (idle when inactive; init lands at triage)
  "processLane": "none",                // none | light-inline | brainstorm | plan | debug
  "repositoryProfile": { "status": "absent", "fingerprint": null },
                                        // absent | building | ready | warm | stale
  "discoveryRoute": "none",             // none | controller-map | investigator | parallel-investigators
  "implementationRoute": "none",        // none | inline | delegated | planned-sequential | delegated-batch
  "risk": "low",                        // low | elevated | high
  "rootCause": { "status": "none", "reportPath": null },
                                        // none | investigating | evidenced | failed
  "plan": { "status": "none", "path": null },
                                        // none | drafting | approved | executing | done
  "currentUnit": { "id": null, "allowedPaths": [], "base": null },
  "verification": { "status": "none", "command": null },
                                        // none | pending | passed | failed
  "review": { "status": "none" },       // none | required | in-progress | clean | findings-open
  "attempts": { "implementer": 0, "max": 2 },
  "remediationWaves": { "count": 0, "max": 2 },
  "baseBranch": null,
  "mergeBaseSha": null,
  "commitPolicy": "controller-per-unit",// controller-per-unit | implementer | user-owned | none
  "blocked": { "code": null, "artifactPath": null, "priorPhase": null },
                                        // code: enum token or null; artifactPath: repo-relative or null
  "timestamps": { "createdAt": "<ISO8601>", "updatedAt": "<ISO8601>" }
}
```

Required: `schemaVersion, active, mode, phase, timestamps`. All others optional with
the defaults shown. `blocked.code` is a short token from a fixed set
(`retry-exhausted | remediation-exhausted | plan-conflict | ambiguous | needs-credential
| baseline-failed | human-checkpoint`) — never free prose (`10` point 5); any longer
diagnosis lives in a separate ignored artifact referenced by `blocked.artifactPath`.

> **Phase 1 corrections (implemented in `cow-state.mjs`; this doc updated to match,
> per the task's §6.2 contradiction rule).** Three Phase-0 fields were refined:
> (1) `blockedReason` (bare string) → `blocked: { code, artifactPath, priorPhase }`
> — pairs the enum code with an optional artifact path and the phase to resume to;
> (2) `updatedAt` → `timestamps: { createdAt, updatedAt }`; (3) `review.waves` was
> **removed** — it duplicated `remediationWaves.count`, which is the single
> authoritative wave counter (reset to 0 by `review --start`, incremented by
> `review --wave`, capped at `max`). No semantic gate changed.

### A.3 `phase` enum & transition table

```text
idle → triage → {light-inline path}            → verifying → idle
              → diagnosis-readonly → triage (re-route on tracked edit)
              → diagnosis-readonly → diagnosis-elevated (planned diagnostic unit)
              → planning → implementing → reviewing → verifying → finishing → idle
any → blocked (on STOP condition)   blocked → (human) → resumes prior phase
```

| From | To | Effected by | Guard |
|---|---|---|---|
| idle | triage | `cow-state init` / first task | — |
| triage | diagnosis-readonly | `cow-state route --discovery …` (bug) | processLane=debug |
| diagnosis-readonly | triage | `cow-state transition --reroute` | emits Re-route receipt |
| diagnosis-readonly | diagnosis-elevated | `cow-state root-cause` + plan | tracked diagnostic unit |
| triage/diagnosis | planning | `cow-state plan --start` | multi-step/elevated |
| planning | implementing | `cow-state plan --approve` then `unit` | production: approval required |
| implementing | reviewing | `cow-state review --start` | matrix says required |
| reviewing | verifying | `cow-state review --clean` | no open Critical/Important |
| verifying | finishing/idle | `cow-state verify --passed` | evidence present |
| any | blocked | `cow-state block --reason <token>` | STOP condition |

### A.4 Reconstruction / fallback (`W7`)
`cow-state init --reconstruct` rebuilds a usable state from the **authoritative**
layers when `state.json` is missing:
- `mode`, `commitPolicy`, `baseBranch`, `mergeBaseSha`, `plan.path` ← plan anchor
  header (existing 0.4.x anchor).
- completed units and ledger `waves=N` (→ `remediationWaves.count`),
  blocked-with-`waves=2` ← `progress.md` ledger.
- committed work ← `git log` (KEEP: ledger + git log are ground truth on resume).
- counters reconstruct **conservatively**: a unit the ledger marks blocked at
  `waves=2` stays exhausted (resume cannot reset the budget — existing rule). If the
  ledger is gone (`git clean -fdx`), counters reset to 0 but `repositoryProfile` and
  `plan` are re-derived from git; the controller re-confirms before continuing.

### A.5 Corruption behavior & state classification
State is a **validated projection and coordination cache** — never more
authoritative than Git, the approved plan, or the progress ledger (`00` §6). Every
read classifies the worktree into exactly one of four states, using `state.json`
plus an `state.active` marker file (written by `init`, removed by `complete`) that
distinguishes "never activated" from "active but state lost":

| Class | Evidence | `status` | Mutating commands |
|---|---|---|---|
| **ABSENT** | no `state.json`, no marker | succeeds, reports `absent` (exit 0) | refuse (`init` first) |
| **INACTIVE** | valid `state.json`, `active=false` | succeeds, reports `inactive` (exit 0) | refuse (`init` to start) |
| **ACTIVE_VALID** | valid `state.json`, `active=true` | prints position | operate normally |
| **ACTIVE_CORRUPT** | marker present but `state.json` missing, **or** `state.json` unparseable/schema-invalid/wrong `schemaVersion` | **fails (exit 3)**, preserves the file | refuse |

`cow-state` validates JSON + `schemaVersion` + every enum/counter on each read. On
any corruption it **exits non-zero (3) with a clear message** and **never
overwrites** the file — corrupt evidence is preserved. It never silently
reinterprets a corrupt state as inactive. Recovery is the **explicit**
`init --reconstruct`, which first renames any corrupt `state.json` aside
(`state.json.corrupt-<ts>`) before rebuilding from the authoritative layers. Hooks
(Phases 4–5) treat absent/inactive/unreadable state as **no-op (fail-open)**; that
hook behavior is **not** implemented in Phase 1.

### A.6 Atomic write & concurrency
- **Atomic write:** write to `state.json.tmp` then `fs.renameSync` over
  `state.json` (atomic on one filesystem). Never partial-write the live file.
- **Concurrency:** single controller per checkout; the helper is the sole writer;
  linked worktrees use separate workspaces. No lock needed. If a future need for
  concurrency arises it is **DEFERRED** (out of baseline scope).

### A.7 What stays authoritative elsewhere (not in state)
Git (commits, merge-base, base branch), the plan file, and the `progress.md`
ledger remain authoritative (`00` §6). State is a **reconstructable cache** of
control position, never the source of truth for code or completion.

### A.8 `cow-state` helper interface (model calls these; never edits JSON)

| Command | Reads | Writes | Purpose |
|---|---|---|---|
| `cow-state init [--reconstruct]` | plan, ledger, git | state | create/rebuild state |
| `cow-state status [--json\|--oneline]` | state | — | print position (oneline for SessionStart) |
| `cow-state transition --phase X [--reroute]` | state | phase | move phase; `--reroute` stamps a Re-route marker |
| `cow-state route --discovery V \| --implementation V` | state | routes | record a route choice |
| `cow-state root-cause --status V [--report P]` | state | rootCause | record diagnosis status |
| `cow-state plan --start\|--approve\|--done [--path P]` | state | plan | plan lifecycle |
| `cow-state unit --id N --paths a,b --base SHA` | state | currentUnit | open a unit + allowed paths |
| `cow-state verify --pending\|--passed\|--failed [--cmd C]` | state | verification | record verification |
| `cow-state review --start\|--clean\|--findings\|--wave` | state | review, remediationWaves | review/remediation |
| `cow-state attempt --inc\|--reset` | state | attempts | implementer retry counter |
| `cow-state block --reason <token>` | state | blocked | hard STOP |
| `cow-state complete` | state | active=false | end the workflow cleanly |

Node stdlib + git only; lives at `skills/execution-routing/scripts/cow-state.mjs`
(runtime-allowlisted via `skills/**`; §4.1). It is **Node-invoked** (mode 100644,
no exec bit): `node <plugin>/skills/execution-routing/scripts/cow-state.mjs <cmd>`.
The `cow-state <cmd>` shorthand in this table and the receipts (`02` B.3) names that
invocation. The worktree root is resolved from the caller's CWD via
`git rev-parse --show-toplevel`, so each linked worktree gets its own state. Every
command accepts `--json` / `--oneline`; mutating commands print the new position.

---

## Part B — Hook-enforcement matrix (`7.6`)

Hooks are plugin hooks (`hooks/hooks.json`) invoked via the existing cross-platform
`run-hook.cmd` → a Node decision script (zero deps). CC facts used: PreToolUse stdin
carries `tool_name`, `tool_input` (`.command` for Bash, `.file_path` for Edit/Write),
and `agent_id`/`agent_type` in subagent context; output is
`permissionDecision: allow|deny|ask|defer` + `permissionDecisionReason` (shown to the
model); exit 2 also blocks with stderr.

### B.0 Global invariants (every rule)
1. **Inactive ⇒ no-op.** If `state.json` is absent, unreadable, malformed, or
   `active=false` → return `defer` immediately (fail-open). (R7/R8/R9.)
2. **Never `allow`.** Hooks only return `deny`, `ask`, or `defer` — never a blanket
   `allow` that could suppress the user's settings (`09`).
3. **No arbitrary shell semantics.** Bash rules match a **tiny literal prefix
   allowlist** of unambiguous mutators; everything else defers.
4. **Cross-platform.** Decision logic is Node reading stdin + `state.json`; no
   bash-only parsing.
5. **Actionable reason.** Every `deny`/`ask` names the state gate and the exact
   `cow-state`/receipt action to proceed.

### B.1 Rule table

| ID | Rule | Event / matcher | Inspected | State prereq | Standard | Production | False-positive risk → mitigation |
|---|---|---|---|---|---|---|---|
| R1 | Tracked Write/Edit during read-only diagnosis | PreToolUse / `Edit\|Write` | `file_path` is tracked & outside `<ws>` | `phase=diagnosis-readonly` | **ASK** | **DENY** | Editing scratch in workspace → workspace paths excluded |
| R2 | Tracked edit before required plan approval | PreToolUse / `Edit\|Write` | tracked `file_path` | `mode=production` ∧ `implementationRoute∈{planned-*}` ∧ `plan.status≠approved` | NO-OP | **DENY** | Production light-inline (processLane=light-inline) → not gated |
| R3 | Edit outside the unit's allowed paths | PreToolUse / `Edit\|Write` | `file_path` ∉ `currentUnit.allowedPaths` | `phase=implementing` ∧ allowedPaths≠∅ | **ASK** | **DENY** | Legit neighbor file → surface scope (`unit --add-path`) — this *is* the no-silent-scope rule |
| R4 | Investigator writing outside the workspace | PreToolUse / `Edit\|Write\|Bash` | `agent_type∈{cow-*-investigator}` ∧ target outside `<ws>` | none (agent_type) | **DENY** | **DENY** | Workspace writes allowed → workspace paths excluded; Bash via R6 prefixes only |
| R5 | Invalid agent/model during mandatory delegation | PreToolUse / `Agent` | `tool_input.subagent_type`,`.model` | review/route says delegation mandatory | **OBSERVE/WARN** | **WARN** (no hard DENY) | Role/model inference is fuzzy → never DENY; observe + warn only |
| R6 | High-confidence mutating Bash in read-only state | PreToolUse / `Bash` | `command` matches literal prefix allowlist | `phase=diagnosis-readonly` ∨ `agent_type∈investigator` | **ASK** | **DENY** | Over-broad parsing → tiny prefix list only (below) |
| R7 | Missing state | any PreToolUse | state absent | — | NO-OP | NO-OP | — |
| R8 | Malformed state | any PreToolUse | parse fails | — | NO-OP + observe-log | NO-OP + observe-log | Never block on bad state |
| R9 | Inactive workflow | any | `active=false`/absent | — | NO-OP | NO-OP | Global guard (B.0.1) |
| R10 | Compact/resume context injection | SessionStart / `startup\|resume\|clear\|compact` | state | — | inject pointer + `status --oneline` | same | Not a deny hook; lean injection (`01` #7) |

R6 literal mutating-prefix allowlist (the only Bash patterns ever matched):
`git commit`, `git push`, `git reset --hard`, `git checkout -- `, `git clean`,
`git merge`, `git rebase`, `rm -rf `, `npm install `, `pip install `,
`> ` / `>> ` redirection to a path outside `<ws>`. Anything else → `defer`. This is
the entirety of the "shell understanding" — no semantic parsing (`09`).

### B.2 Authoritative-layer note (no duplicated rule without an owner — `10` #3)
For every enforced rule the **skill is authoritative for meaning**, **state is
authoritative for current position**, and **the hook is a mechanical guard** that
denies only when state says the gate is active and the input deterministically
violates it. Example (R1): `systematic-debugging` defines *why* a tracked edit ends
read-only diagnosis; `state.phase` records *that* we are in `diagnosis-readonly`;
the hook denies the tracked Edit and tells the model to emit `Re-route:` +
`cow-state transition`. If state is stale/absent the hook stands down and the skill
rule still governs via model adherence (defense in depth, not double jeopardy).

### B.3 Rollout path
1. **Shadow / observe (Phase 4).** All rules return `defer` and append a one-line
   decision record to `<ws>/run/hook-observations.log`. Zero behavior change; used
   to measure false-positive rates against the eval scenarios.
2. **Calibrated standard (Phase 5).** Promote rules whose shadow false-positive rate
   is ~0 to `ASK`/`DENY` per the "Standard" column. R5 stays OBSERVE/WARN.
3. **Strict production (Phase 5).** Apply the "Production" column (more `DENY`s),
   gated on `mode=production` read from state.

### B.4 Why these and not more
Only rules that are **binary, observable, and state-decidable** are enforced.
Judgment-heavy rules (is this the *right* route? is the review *deep enough*?) stay
in skills and the review matrix — hooks must not adjudicate judgment (`09`,
`10` #4). R5 is deliberately capped at WARN because "wrong agent for mandatory
delegation" requires role inference that is not high-confidence binary.

# COW Master Handoff & Session Baton — v0.5.0 Control Plane

> Authoritative resume document for `cost-oriented-agentic-workflow` (COW). A fresh
> agent with no access to prior conversations can resume the project from this file
> plus the repository. The Markdown file is authoritative; a byte-identical
> `COW-MASTER-HANDOFF.txt` sits beside it for non-Markdown contexts.
>
> Evidence labels used throughout (precise, per the project's accuracy rule):
> **implemented** (code exists), **integrated** (wired into the live control flow),
> **validated** (a deterministic test asserts it), **observed** (seen in a live
> smoke), **enforced** (a hook deterministically prevents it), **planned**,
> **deferred**. A design document existing does **not** make a feature live; a
> contract being validated or analyzer-detected does **not** make it enforced.

---

## 1. Incoming Agent Instructions

Do this in order; do not skip to implementation.

1. **Verify the repository** (Section 2 has expected values — treat them as hints, re-verify):
   `git -C <repo> rev-parse --abbrev-ref HEAD` (expect `feat/v0.5.0-control-plane`),
   `git rev-parse HEAD`, `git status --short`, `git log --oneline -15`.
2. **Preserve dirty work.** Never `git reset/checkout/clean/stash` user changes. If the
   tree is dirty, classify before doing anything (Section 24, invariants 1–2).
3. **Run the full baseline** (Section 15 command inventory) and record exact counts;
   distinguish repository / environment / harness / transient-account failures.
4. **Read the phase handoffs** in `docs/architecture/v0.5.0/` (PHASE-1 → PHASE-3B.1.1)
   and the design docs `00`–`06` + `PHASES.md`. This file summarizes them but they are
   the primary record.
5. **Identify the active phase** from Git + the newest handoff (currently **Phase 3B.2**;
   Section 18).
6. **Reproduce the active problem** before editing runtime behavior (Section 18).
7. **Implement only the active scope.** Do not start a later phase early (invariant 25).
8. Run **static tests**, then **focused live smokes** (separately reported).
9. **Write/refresh the phase handoff**; keep this master file current.
10. **Commit logically** (the per-phase commit discipline); do **not** push, merge, or
    bump the version unless explicitly authorized.

If repository state has diverged from this document, trust Git + code and record the
divergence; do not silently merge incompatible versions.

---

## 2. Verified Repository State

Verified live while writing this document (not copied from memory):

| Property | Value | Source |
|---|---|---|
| Repository root | `C:/Users/gencberke/Desktop/cost-oriented-agentic-workflow` | `git rev-parse --show-toplevel` |
| Branch | `feat/v0.5.0-control-plane` | git |
| HEAD | `1447c52` (`feat: add validated review reports`) | `git rev-parse --short HEAD` |
| Working tree | **dirty** with Phase 3B.2 static integration + handoff edits; live smoke gate still blocked | `git status --porcelain=v1` |
| Version | `0.4.2` — `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `package.json` all agree | code |
| Custom agents | **4** — `cow-repo-investigator`, `cow-debug-investigator`, `cow-implementer`, `cow-reviewer` | `agents/` |
| Active hooks | **none** — only `hooks/hooks.json.example`, `hooks/session-start` (template), `README.md`, `run-hook.cmd`; **no `hooks/hooks.json`** | code |
| Runtime dependencies | **zero** (`package.json` has no `dependencies`) | code |
| Runtime package | does **NOT** ship `agents/**` or an active `hooks/hooks.json` yet (deferred — Sections 12/15/19) | `06`, Phase-2/3B handoffs |
| Latest completed phase | **Phase 3B.1.1** (unit ownership + attempt evidence); `1447c52` added Phase 3B.2 helper/analyzer groundwork | git + `PHASE-3B.1.1-HANDOFF.md` |
| Active / next phase | **Phase 3B.2 - Review Control Plane**: static integration present, live-smoke gate blocked pending explicit approval | this file + `PHASE-3B.2-HANDOFF.md` |

**Test + validation baseline (fresh, this session):**

| Command | Count / result |
|---|---|
| `npm run check` (structural, Layer 1) | **369** checks, 0 failed |
| `npm run test:foundation` | **154** = state **115** + repo-intake **39** |
| `npm run test:agents` | **154** checks |
| `npm run test:profile` | **34** checks |
| `npm run test:report` | **38** checks |
| `npm run test:unit-worktree` | **27** checks |
| `npm run test:discovery-stream` | **31** checks |
| `npm run test:implementation-stream` | **41** checks |
| `npm run test:review-report` | **34** checks |
| `npm run test:review-stream` | **21** checks |
| `npm run test:scripts` (helper, bash) | **40** PASS lines |
| `npm run test:eval` (Python unittest) | **27** tests, OK |
| `claude plugin validate . --strict` | **passed** |
| Live Phase 3B.2 smokes | **not run** - blocked because `claude --plugin-dir` would send local plugin/workspace content to the external Claude service without explicit user approval |

Harness notes that affected verification (Section 22): `bash` resolves to WSL (not
installed) — use Git Bash for `test:scripts`/`test:eval`; PowerShell `>` redirection
writes UTF-16+BOM; the model-safety classifier was briefly unavailable once and one
live smoke wrapper hit a 10-minute timeout (Section 22).

---

## 3. Product Thesis and Non-Goals

**Thesis.** COW is a *token-economy agentic workflow* for Claude Code: an **Opus
controller** plans, routes, validates, reviews, and commits while staying **lean**
(it reads summaries, state, the repo profile, and verification — never pasted code
bodies or broad source). The **token-heavy work** — repository mapping, bug
diagnosis, implementation, and default review — is delegated to **cost-pinned Sonnet
plugin agents** in fresh isolated contexts, with bulk artifacts moving as **files**.

0.4.x ran this entirely through **prose skills**. Dogfooding (the 0.4.1 Flutter
debug) proved the prose layer correct but *leaky*: binary gates get rationalized
away, and the controller explores unknown repos itself (expensive). 0.5.0 converts
the **binary, observable** invariants from prose-only into a **hybrid** of: (a)
process skills (meaning/judgment/HOW), (b) deterministic state + repo artifacts
(machine-readable position), (c) cost-pinned plugin agents (bounded delegation), (d)
selective hooks (enforce only high-confidence binary gates — later phases), and (e)
behavioral + cost evals. The eight weaknesses W1–W8 (`00` §1) each map to an owning
component and a test.

Principles that explain the design:
- **Opus stays a lean controller** because controller tokens are the most expensive
  and its context is the scarcest resource; broad exploration there is the core 0.4.x
  waste (W1).
- **Sonnet does investigation/implementation/default review** in fresh contexts so
  cost is pinned and the controller never inherits bulk.
- **More agents is not the goal** — the minimum viable set is four (`03` §"do not add
  more"); adding agents adds dispatch + context cost.
- **Risk overrides cost** — hard-exclusion surfaces (auth, secrets, migrations, money,
  privacy, concurrency, public API, supply-chain, prod/CI, irreversible effects)
  leave the light path regardless of size.
- **Deterministic evidence beats model claims** — the actual Git diff (now: a per-unit
  baseline delta) is authoritative over an implementer's `filesChanged`; fresh
  controller verification beats an agent's "tests pass."
- **State is a reconstructable projection**, never the top authority — Git + plan +
  ledger remain ground truth; state is rebuilt by `cow-state init --reconstruct`.
- **Zero runtime dependencies** — every helper is Node stdlib + git, cross-platform
  (Windows is first-class).

**Non-goals (explicit, `00` §2):** no general workflow DSL; no database/daemon; no
orchestration MCP server; no agent teams; no self-modifying prompts; no persistent
agent memory; no hook that parses arbitrary shell semantics; no automatic worktree
isolation. The review matrix, retry/remediation budgets, standard/production split,
and zero-dependency rule are **preserved, not redesigned**.

---

## 4. Runtime and Platform Constraints

- **Zero runtime deps**; helpers are Node + git only; everything is cross-platform.
- **Windows is a first-class target.** Operational footguns (Section 22): Git Bash vs
  WSL; PowerShell UTF-16/BOM on `>`; BOM-tolerant JSON parsing in every helper.
- **Plugin-agent capability facts (Claude Code 2.1.186):** plugin agents honor
  `name, description, model, effort, maxTurns, tools, disallowedTools, skills, memory,
  background, isolation`; `hooks`/`mcpServers`/`permissionMode` are **ignored**;
  `tools`/`disallowedTools` are **enforced**; per-invocation `model` overrides the
  default; nesting depth caps at 5; subagents get fresh isolated context. `skills:`
  injects the full skill content (proven by smoke; `--strict` does not resolve it).
- **Workspace:** the ignored, per-worktree `<repo>/.cost-oriented-agentic-workflow/run/`
  holds state/profile/snapshot/brief/report/baseline artifacts and the eval evidence;
  linked worktrees do not share it.
- **No secrets / no chain-of-thought** in state, snapshot, profile, or reports
  (allowlisted fields + size caps + denylist checks).

---

## 5. Source-of-Truth Hierarchy

When the same fact appears in multiple layers, this order governs (`00` §6):

```text
1. Git (commits, merge-base, base branch)   ── code truth, immutable
2. Plan file + progress.md ledger (.md)      ── the plan & durable completion record
3. state.json (via cow-state)                ── current CONTROL position only
4. Process skills (prose)                    ── the MEANING of every rule
5. Hooks (later phases)                       ── mechanical guards that trust (3)
```

Rules of precedence: skills define rules; state records position; hooks (when they
exist) enforce only a binary subset and **never invent a rule**. State is
reconstructable, never primary — if `state.json` is missing/corrupt, Git + plan +
ledger remain authoritative and hooks fail **open** (no-op). No reasoning prose ever
lives in state (enums, paths, SHAs, counters only).

---

## 6. Architecture Overview

Component map (`00` §3): a lean Opus **controller** invokes **process skills** (via
the Skill tool) and dispatches **plugin agents** (via the Agent tool, model-pinned).
Skills read/transition **deterministic artifacts** (`cow-state`/`state.json`,
`repo-snapshot`/`repo-profile`, the run workspace). Agents return files only. Hooks
(later) read state + tool input to enforce a binary subset.

One owner per component (`00` §4): skills own *meaning*; state owns *position*; repo
artifacts own a *cached map*; agents own *bounded execution of one role*; hooks own
*deterministic enforcement of a binary subset*; Git/plan/ledger own *code truth +
durable completion*.

**Intended full control flow** (happy path, standard mode):

```text
activation → SessionStart pointer (lean; Phase 4) 
→ cow-state init/resume (reconstruct if needed)
→ repo-snapshot (deterministic)            ┐
→ repo-profile warm? else intake           │ DISCOVERY half (live since 3A)
→ discovery route (controller-map | investigator | parallel-investigators)
→ diagnosis (systematic-debugging) or task discovery
→ implementation triage                    ┐
→ implementation route (inline | delegated | planned-sequential | delegated-batch)
→ capture unit baseline + check-overlap     │ IMPLEMENTATION half (live since 3B.1;
→ inline edit or cow-implementer dispatch   │  ownership hardened in 3B.1.1)
→ attempt-qualified report validation
→ unit-baseline ownership/diff validation
→ scoped cow-reviewer review gate           ┐ REVIEW half (static 3B.2 integration;
→ controller fresh verification             │  live-smoke acceptance still blocked)
→ stage only unit-owned paths → verify-stage → controller commit
→ cow-state + progress.md ledger update
→ (all units) independent whole-work review → finishing-a-development-branch
```

Status of each half: **discovery = integrated + observed**; **implementation +
ownership = integrated + observed**; **review = statically integrated but not
live-smoke accepted**; **hooks = not present (planned 4/5)**.

---

## 7. Dual Routing Model

Two **independent** axes, decided in order, each with a visible receipt and a
`cow-state` record (`02` Part B). They are never chosen together.

**Discovery routing** (*how we learn*) — `discoveryRoute ∈ {controller-map,
investigator, parallel-investigators}`:
- `controller-map` — cheap, bounded classification: the validated profile + snapshot +
  instruction files + **≤3 targeted source/config reads + ≤1 bounded Grep/Glob**. If
  that budget is insufficient, dispatch an investigator. Control-plane navigation
  (locating skills/helpers/profile) does **not** consume the budget.
- `investigator` — one bounded domain needs tracing, or large output would otherwise
  enter controller context; dispatch the exact scoped `cow-repo-investigator`
  (`OUTPUT_FORMAT=TASK_DISCOVERY`) or `cow-debug-investigator`.
- `parallel-investigators` — only after a cheap domain map evidences **disjoint**
  domains; **max 2**; read-only; never fan out on symptom count alone.

**Implementation routing** (*how we change code*) — `implementationRoute ∈ {inline,
delegated, planned-sequential, delegated-batch}`:
- `inline` — one user-visible outcome, one responsibility/seam, low risk, mechanically
  obvious, no hard-exclusion trigger, known verification, controller cost < delegation
  cost. **Never dispatches cow-implementer.**
- `delegated` — one bounded non-trivial self-specifiable unit → one fresh
  `cow-implementer`.
- `planned-sequential` — two or more **independent** outcomes; one unit at a time;
  fresh baseline + (if delegated) fresh implementer per unit; never overlapping writes.
- `delegated-batch` — outcomes tightly coupled by **one responsibility + one seam + one
  verification setup + one allowed-path set**; one implementer; controller verifies
  each outcome separately.

The axes are independent: a broad/expensive investigation can still resolve to a tiny
`inline` fix (smallness never retroactively downgrades a justified investigation —
`02` B.6). **Routes are not defined by file count.** The unit boundary is:

```text
unit = outcome + responsibility + verification seam   (NOT the file set)
```

Therefore: same file ≠ one unit; two independent same-file outcomes are
`planned-sequential` (separate units) or `delegated-batch` (one batch, **per-outcome**
acceptance + regression) — never one `inline`; same-file overlap forces sequencing,
never parallel writes; `delegated-batch` requires a genuinely coherent shared seam,
not mere file overlap. (`02` B.4/B.7; validated by `validate-structure.mjs` + eval
fixtures; observed in 3B.1 smokes C/D and 3B.1.1 smoke D.)

---

## 8. Agent Catalog

Four agents in `agents/` (read from **frontmatter**, verified live; `03`'s top
"Phase 2 implemented contracts" table is authoritative and supersedes its lower
Phase-0 tables). **All four are `model: sonnet`** — note the Phase-0 design
(`00`/`02`/`03` lower tables) anticipated `haiku` for the repo-investigator; the
**implementation pinned Sonnet** for uniform judgment, and that is the live truth.

| Agent (scoped id `cost-oriented-agentic-workflow:<name>`) | model | effort | maxTurns | tools | skills preload | Write/Edit | Bash | State | Commit | Integration |
|---|---|---|---|---|---|---|---|---|---|---|
| `cow-repo-investigator` | sonnet | low | 10 | Read, Glob, Grep | — | no | no | no | no | **integrated** (3A) |
| `cow-debug-investigator` | sonnet | medium | 14 | Read, Glob, Grep, Bash | `…:systematic-debugging` | no | read-only (contract) | no | no | **integrated** (3A) |
| `cow-implementer` | sonnet | high | 30 | Read, Glob, Grep, Bash, Write, Edit | — | yes (allowed paths only) | yes | no | no | **integrated** (3B.1; 3B.1.1 added baseline/attempt inputs) |
| `cow-reviewer` | sonnet | medium | 12 | Read, Glob, Grep | — | no | no | no | no | **implemented, NOT integrated** (Phase 3B.2) |

Common: `background: false`; **no** `Agent`, `Skill`, MCP, or `PowerShell` tool; **no**
`memory` or `isolation` field (both deliberately omitted — `memory` would inject
`MEMORY.md` and force-enable Write/Edit, defeating read-only and persisting
reasoning; `isolation: worktree` branches from the **default branch not parent HEAD**,
which would detach the implementer from the feature branch and break per-unit commits).
Production whole-work review is a **per-invocation `model: opus` override** of
`cow-reviewer`, not a fifth agent.

Output contracts (return caps; bulk → files): repo-investigator ≤80 lines
(`STATUS`/`PROFILE_JSON`|`DISCOVERY_REPORT`/`UNCERTAINTIES`; a shell-less draft may
never mark a command `verified`); debug-investigator ≤70 lines (10-field root-cause
contract; `REQUIRES_REROUTE` when tracked instrumentation is needed; `BLOCKED` when it
cannot reproduce); implementer ≤8 lines (`STATUS, UNIT_ID, REPORT_PATH,
FILES_CHANGED_COUNT, VERIFICATION, BLOCKER`) + a JSON report file; reviewer ≤60 lines
(schema v1 JSON: `specVerdict`, `qualityVerdict`, `overallVerdict`,
causality-classified findings, and blocking flags).

Responsibility boundaries: investigators never edit/commit/route; the implementer
implements one unit's interior within allowed paths and writes the report (never
commits, never updates state, never stages, never touches a pre-existing dirty path,
never changes the baseline, never spawns an agent); the reviewer is read-only and
never writes/commits/runs shell/spawns agents. Validated by
`tests/agent-contracts.test.mjs` (154 checks);
read-only Bash for the debug-investigator is **contract-level, not enforced** (no hook
yet).

---

## 9. State and Artifact Model

**`cow-state.mjs`** (`skills/execution-routing/scripts/cow-state.mjs`, Node + git,
zero deps) is the **sole writer** of `state.json`; the model never edits the JSON by
hand. State path: `<repo-root>/.cost-oriented-agentic-workflow/run/state.json`
(ignored, per-checkout) with a `state.active` marker.

- **Schema version 1.** Classifications: `ABSENT` (no state, no marker — exit 0),
  `INACTIVE` (`active=false` — exit 0), `ACTIVE_VALID`, `ACTIVE_CORRUPT` (marker but no
  state, or unparseable/schema-invalid/wrong-version — **exit 3, never overwrites**).
- **Fields:** `schemaVersion, active, mode, phase, processLane, repositoryProfile{
  status, fingerprint, snapshotPath, profilePath, updatedAt}, discoveryRoute,
  implementationRoute, risk, rootCause{status, reportPath}, plan{status, path},
  currentUnit, verification{status, command}, review{status}, attempts{implementer,
  max}, remediationWaves{count, max}, baseBranch, mergeBaseSha, commitPolicy,
  blocked{code, artifactPath, priorPhase}, timestamps{createdAt, updatedAt}`.
- **`currentUnit` (extended through 3B.1 + 3B.1.1):** `{ id, allowedPaths[], base,
  briefPath, reportPath, commitSha, baselinePath, currentAttempt(1..3),
  acceptedAttempt(≤currentAttempt, null until acceptance) }`. (The design doc `04` A.2
  shows the original `{id, allowedPaths, base}`; the implemented shape is the
  authoritative one here.)
- **Commands:** `init [--reconstruct]`, `status`, `transition --phase [--reroute]
  [--lane]`, `route --discovery|--implementation`, `profile --status [...]`,
  `root-cause`, `plan`, `unit --id [--paths --base --brief --report --commit
  --baseline --attempt --accepted-attempt]`, `verify`, `review --start|--clean|
  --findings|--wave`, `attempt --inc|--reset` (max 2), `block --reason <token>`,
  `complete`. Every command takes `--json`/`--oneline`. Atomic write (tmp + rename);
  BOM-tolerant read.
- **Reconstruction philosophy:** `init --reconstruct` rebuilds from the plan anchor
  (`MODE/COMMIT_POLICY/BASE_BRANCH/MERGE_BASE_SHA/PLAN_FILE`) + `progress.md` ledger
  (units, `waves=2`+blocked → exhausted) + `git log`; budgets reconstruct
  conservatively (an exhausted budget never resets).
- **Forbidden in state:** reasoning prose, diffs, file contents, secrets, env values,
  logs. `blocked.code` is a fixed token set, never free text.

**Implementation artifacts** (all under the ignored run workspace, attempt-qualified
since 3B.1.1): `task-N-baseline.json`, `task-N-brief.md`,
`task-N-attempt-K-report.json`, `task-N-attempt-K-return.txt`,
`task-N-attempt-K-report.md` (rendered). The **progress.md ledger** is the durable
chronological record; state is its reconstructable projection.

Validated by `tests/state.test.mjs` (102) + `tests/repo-intake.test.mjs` (39).

---

## 10. Repository Intake

- **`repo-snapshot.mjs`** (`skills/repository-intake/scripts/`, Node + git): emits a
  fixed, bounded, deterministic `repo-snapshot.json` (schema v1; ≤16 KB; field
  allowlist; **no file contents/secrets**) — identity, worktree, instruction files,
  manifests, languages, build/test commands, dir shape (depth ≤2), test roots, CI,
  recent commits, fingerprint. Re-runs byte-identical modulo `generatedAt`.
- **Fingerprint** = SHA-256 over **navigation structure** (root-commit identity +
  instruction files + manifests + dir-name shape + languages name/ext), over
  **working-tree** content. Excludes HEAD/dirty/history/timestamps/**file-counts** — so
  an ordinary source commit does **not** invalidate the profile (kills W1
  re-exploration); only dependency/structure/instruction changes do.
- **`repo-profile.mjs`** (`skills/repository-intake/scripts/`, Phase 3A): deterministic
  acceptance pipeline. `cow-repo-investigator` returns a profile **draft** (it cannot
  write files); the helper extracts only the delimited JSON, validates schemaVersion +
  fingerprint-vs-snapshot + safe paths + verified/inferred/unknown confidence
  (rejecting a `verified` command from a shell-less agent) + secret/env denylist + the
  8 KB cap, preserves the previous valid profile on failure, and writes atomically.
  Commands: `validate-agent-output`, `accept-agent-output`, `validate`, `status`
  (`VALID/STALE/MISSING/INVALID/PARTIAL`), `render`. A `PARTIAL` draft is never
  promoted to warm. BOM-tolerant.
- **Profile states → behavior:** `VALID`→warm (skip intake), `STALE`→re-intake,
  `MISSING/INVALID`→absent. **Profile validity controls intake; task uncertainty
  controls task-discovery — separate decisions.** A **dirty tree alone never
  authorizes intake (`PROFILE_DRAFT`)**: a warm dirty repo stays warm; deeper mapping
  of a dirty repo is `TASK_DISCOVERY`, never profile regeneration (the load-bearing
  3A.1 fix; a UTF-8 BOM on a pre-seeded profile had caused a false re-intake, fixed by
  BOM-tolerance in all three helpers).
- One corrected investigator redispatch is allowed after a validation failure; a second
  blocks intake.

Validated by `tests/repo-intake.test.mjs` (39) + `tests/profile.test.mjs` (34);
discovery behavior graded by `tests/eval/analyze-discovery-stream.mjs` + its 31-check
test + the `discovery/` and `discovery-hardening/` eval fixtures.

---

## 11. Discovery Control Plane

**Status: integrated (Phase 3A) + hardened (Phase 3A.1) + observed.** On activation
the controller runs readiness (state → snapshot → profile → intake-if-not-warm →
discovery route) **before** broad source reading, emits one `Route:` receipt, and
dispatches the **exact scoped** investigator (never automatic selection; no silent
generic fallback). The controller-map read budget (≤3 targeted reads + ≤1 bounded
query before dispatch; ≤1 adjudication read + 0 broad queries after, unless a visible
`Re-route:`) is **numerically measured** by `analyze-discovery-stream.mjs`, not
"bounded" prose. Diagnosis adjudication + `cow-state root-cause` recording + the
tracked-instrumentation re-route are owned by `systematic-debugging`. Implementation
routing stays `pending` **during discovery** and is selected later by
`execution-routing`. Six discovery smokes (3A) + four focused 3A.1 smokes were
observed within budget with zero violations.

---

## 12. Implementation Control Plane

**Status: integrated (Phase 3B.1) + observed.** Per unit the controller selects an
implementation route (Section 7), and for delegated work dispatches the exact
`cow-implementer` with every named input. The model-authored report is **evidence,
never the source of truth**: it is a compact JSON (`implementation-report.mjs`, schema
v1, 8 KB ceiling, no CoT/logs/diffs/secrets — unknown keys rejected) that the
controller **validates** and **compares against the actual diff** before acceptance,
then runs **fresh controller verification**, applies the **existing review gate**, and
**owns the commit**. Agents never commit and never touch state.

`implementation-report.mjs` commands: `validate <report> [--brief --attempt
--baseline]`, `inspect`, `render`, `compare-worktree <report> --baseline <p>`
(preferred) | `--base <sha>` (legacy). The **actual git diff is authoritative over
`filesChanged`**. Retry: initial attempt + ≤2, each a fresh invocation with changed
evidence/scope/brief — separate from the review path's two remediation waves (never
merged). Planned-sequential runs one unit at a time with per-unit review/verify/commit;
delegated-batch is one implementer with per-outcome verification. Validated by
`tests/implementation-report.test.mjs` (38) + structural invariants; graded by
`tests/eval/analyze-implementation-stream.mjs` (+41-check test); six 3B.1 smokes
observed (A inline, B delegated, C planned-sequential, D delegated-batch, E rejection,
F retry).

---

## 13. Unit Ownership and Attempt Evidence

**Status: implemented + integrated + validated + observed (Phase 3B.1.1).** This phase
closed two gaps: (1) a pinned base SHA can't tell a pre-existing dirty USER path from
unit work; (2) reusing `task-N-report.json` across retries overwrote failed-attempt
evidence.

- **Unit worktree baseline** — `unit-worktree.mjs`
  (`skills/execution-routing/scripts/`, Node + git): `capture | inspect | check-overlap
  | compare | verify-stage`. Baseline schema v1: `{ schemaVersion, unitId, head,
  branch, allowedPaths, capturedAt, preExisting[] }` where each `preExisting` entry is
  `{ path, kind: TRACKED|STAGED|UNTRACKED, worktreeHash, indexObject }` — observable
  git facts only; repo-relative/forward-slash, traversal/absolute rejected;
  BOM-tolerant; atomic writes.
- **Dirty-overlap policy:** `check-overlap` returns `BLOCKED_DIRTY_OVERLAP` (exit 1)
  when a pre-existing dirty path is **inside** the allowed set — **before** any edit or
  dispatch; no hunk-level merge. A directory allow-path overlaps every contained dirty
  path.
- **Unit-owned delta:** `compare` classifies each path — **unit-owned** (clean/absent
  at baseline, changed/created after, in the allowed set), **preserved** (pre-existing
  dirty USER path, untouched), or a **violation** (`OUTSIDE_ALLOWED_PATH`, or the
  stronger `PRE_EXISTING_PATH_MODIFIED`). Deletions/renames deterministic (rename into
  out-of-scope fails; deleting a pre-existing dirty path fails).
- **Exact-path staging:** the controller stages **only** the unit-owned paths, then
  `verify-stage` (staged set must equal the unit-owned delta — no pre-existing, no
  out-of-scope, none missing) before commit. **`git add .` / `git add -A` /
  `git commit -a` are forbidden.**
- **Attempt-qualified, immutable artifacts:** `task-N-attempt-K-report.json` +
  `-return.txt`; a retry never overwrites a prior attempt and keeps the **same
  baseline**; the final compare is baseline-relative. State records `baselinePath`,
  `currentAttempt`, `acceptedAttempt`. Planned-sequential captures a **fresh** baseline
  per unit from the new committed HEAD.

Validated by `tests/unit-worktree.test.mjs` (27) + report/state/structural extensions
+ the `unit-ownership/` eval fixtures (8). Five live smokes observed: A unrelated-dirty
preserved + commit only the unit file; B dirty-overlap → zero implementers/commits,
file byte-identical; C retry → two immutable attempt reports, stable baseline,
acceptedAttempt; D planned-sequential with an outside dirty file preserved across two
commits (graded from ground-truth repo state — the wrapper timed out after the work
completed); E broad-stage detected + verify-stage caught it + no commit. **Honoured
limit:** ownership safety is **validated, not enforced** (no hook yet); the smokes
also surfaced a `ROUTE_RECEIPT_MISSING` analyzer flag that is a prompt-driving artifact
(numbered-step prompts suppressed the conversational receipt), not an ownership breach.

---

## 14. Review Control Plane

**Status: Phase 3B.2 static integration is present; required live smokes are blocked
pending explicit user approval.** Do not mark 3B.2 ready. The scoped
`cost-oriented-agentic-workflow:cow-reviewer` is now named from the review surfaces,
the report/package helpers and review-stream analyzer exist, and deterministic tests
cover the contract. The missing gate is live `claude --plugin-dir` evidence, which
requires sending local plugin/workspace content to the external Claude service.

Read the matrix from `skills/using-cost-oriented-workflow/SKILL.md`; it is unchanged:

- **Mode/risk matrix** (per-task independent review): `standard/low` -> `none`
  (self-review + final whole-work gate); `standard/elevated` -> `required-if-non-obvious`;
  `standard/high` -> `required`; `production / any planned task` -> `required`;
  `Critical/Important fix` -> `required:fresh-targeted`.
- **Whole-work review:** standard -> the same scoped reviewer on Sonnet; production ->
  the same scoped reviewer with a per-invocation `model: opus` override, not a fifth
  agent. Standard may skip only for a single unit already independently reviewed;
  production never skips. Never controller self-review.
- **Finding causality:** `INTRODUCED | WORSENED | PRE_EXISTING | UNCERTAIN`; only
  introduced/worsened Critical/Important findings block the current unit.
- **Controller adjudication:** validated reviewer reports are evidence, not decisions.
  The controller records `ACCEPT | REJECT | DEFER_PRE_EXISTING |
  REQUEST_CLARIFICATION` before remediation.
- **Bounded remediation:** at most 2 remediation waves per task/whole-work review; each
  wave is a fresh fixer plus tests plus fresh `TARGETED_REREVIEW`; budget exhaustion is
  never approval.

The detailed mechanics live in
`skills/execution-routing/references/review-{routing,package,adjudication}.md` and
`skills/execution-routing/references/remediation-and-rereview.md`.
`tests/eval/analyze-review-stream.mjs` is the live-smoke grader for scoped reviewer
dispatch, report validation, adjudication ordering, targeted re-review, read-only
reviewer behavior, the two-wave ceiling, and production whole-work Opus mismatch.

---

## 15. Hooks and Resume Strategy

**Status: no active hooks (planned — Phases 4 shadow, 5 enforce).** Present today:
`hooks/hooks.json.example` (declares a SessionStart hook), `hooks/session-start`
(template injection), `hooks/run-hook.cmd` (cross-platform launcher), `hooks/README.md`.
There is **no `hooks/hooks.json`**, so a COW checkout behaves exactly as 0.4.x to the
hook layer.

Designed hook model (`04` Part B): plugin PreToolUse/SessionStart/PreCompact hooks via
`run-hook.cmd` → a Node decision script (zero deps). **Global invariants:** inactive/
absent/malformed state ⇒ `defer` (fail-open); hooks emit only `deny/ask/defer` —
**never a blanket `allow`**; Bash rules match only a **tiny literal mutating-prefix
allowlist** (no arbitrary shell semantics); every `deny/ask` names the state gate +
the exact `cow-state`/receipt action. Rule catalog R1–R10 (e.g. R1 tracked edit during
read-only diagnosis, R3 edit outside allowed paths, R4 investigator write outside the
workspace, R6 mutating Bash in read-only state, R10 lean SessionStart injection).

Rollout: **Phase 4** ships all rules in **shadow** (return `defer`, log the would-be
decision; zero behavior change; measure false positives) + the lean SessionStart
pointer (`COW_ENTRY_INJECTED` sentinel + resume rule + `cow-state status --oneline`,
not the ~13 KB entry skill). **Phase 5** promotes only **0-false-positive** rules to
`ASK`/`DENY`, gates the production column on `mode=production`, and ships an **active**
`hooks/hooks.json` that no-ops when inactive. Hooks must **never** decide anything
semantic (route correctness, review depth) — that stays in skills.

Resume/compact today relies on the entry skill's idempotency sentinel + state
reconstruction; the lean SessionStart injection is the Phase-4 deliverable.

---

## 16. Historical Phase Ledger

Commit hashes verified against `git log`. Branch `feat/v0.5.0-control-plane` builds on
the 0.3.2 baseline; version stays 0.4.2 until Phase 7.

| Milestone | Key commits | Introduced / decided | Evidence |
|---|---|---|---|
| **v0.3.2 baseline** | `7ebfc74` | fork baseline of the prose workflow | — |
| **0.4.0** | …`e31373a` (release) | workspace move, task-scoped review packages, bounded remediation, resume base-branch unification | structural/helper/eval suites |
| **0.4.1 routing hardening** | `ae9df1f`, `4d6feb7`, `673b202` … `24b6b15` (release) | closed three routing escape hatches (small-disjoint-inline; tracked diagnostic edit inheriting the light route; same-file independent outcomes collapsing); route-only pressure-test fixtures; cross-platform eval | route fixtures + `test_eval.py` |
| **0.4.2 clean packaging** | `ce2d49d`, `27e6cba` (release) | runtime-package builder + allowlist (`skills/**`, `commands/**`, 4 `hooks/*`, manifests, README, LICENSE); dev `scripts/` excluded | `test:release` |
| **Phase 0 — design** | `2b2d029` | the `00`–`06` + `PHASES.md` design set; W1–W8 → component → test traceability; DECIDED contracts | docs only |
| **Phase 1 — state + intake foundation** | `b263af9` (state), `8750a90` (intake) | `cow-state.mjs` + `state.json` schema v1; `repo-snapshot.mjs` + fingerprint; `repository-intake` skill + profile contract; `state.test.mjs` (76 then) + `repo-intake.test.mjs` (39); prose-budget split | `test:foundation`; not wired into routing |
| **Phase 2 — plugin agents** | `764474a` (agents), `3f98058` (contract gates) | four cost-pinned agents (all sonnet; corrected from Phase-0 haiku); `agent-contracts.test.mjs`; agent eval fixtures | static gates + 4 live `--plugin-dir` smokes; agents inert (not dispatched) |
| **Phase 3A — discovery control plane** | `5d3cd5b` (profile acceptance), `92b39ac` (integrate intake+discovery routing), `7992976` (discovery gates) | `repo-profile.mjs` acceptance pipeline; live readiness + discovery routing + investigator dispatch; `analyze-discovery-stream.mjs` | structural + discovery fixtures + 6 smokes; implementation stayed `pending` |
| **Phase 3A.1 — discovery hardening** | `340c1f7` (stream accounting), `9cc0a52` (warm-profile boundaries) | numeric controller-map budget; warm-profile boundary (validity ≠ task-uncertainty; dirty ≠ regeneration); BOM-tolerance in all three helpers | discovery-stream test (31) + 4 focused smokes |
| **Phase 3B.1 — implementation control plane** | `3cf07a9` (validated reports), `cc5dbb0` (integrate implementer routing), `6cf66e9` (control-plane gates) | implementation routes live; `cow-implementer` integrated; `implementation-report.mjs` + actual-diff authority; controller-owned verify/commit; `analyze-implementation-stream.mjs` | report test (28 then) + impl-stream test (31 then) + 6 smokes; `cow-reviewer` NOT integrated |
| **Phase 3B.1.1 — unit ownership + attempt evidence** | `f612b44` (baselines), `25c59bd` (attempt evidence), `7774ecf` (dirty-worktree gates) | `unit-worktree.mjs`; per-unit baseline ownership; dirty-overlap block; exact-path staging + verify-stage; attempt-qualified immutable reports; state `baselinePath/currentAttempt/acceptedAttempt`; `compare-worktree --baseline` supersedes `--base` | unit-worktree test (27) + report (38)/state (102)/impl-stream (41)/structural (318) + 8 fixtures + 5 smokes |

(`PHASES.md` planned "Phase 3" as one step; it was executed as 3A/3A.1/3B.1/3B.1.1.
The remaining planned phases keep the original numbering: 4 shadow hooks, 5 enforce,
6 eval/tune, 7 release.)

---

## 17. Current Test and Validation Baseline

See the table in Section 2 for fresh counts. Command inventory (Section 15-equivalent
of `05`'s layers):

| Command | Purpose | Layer | Fresh result |
|---|---|---|---|
| `npm run check` | structural/schema invariants (`tests/validate-structure.mjs`) | L1 | 369, 0 failed |
| `npm run test:scripts` | bash helper behavioral (`cow-workspace`/`task-brief`/`review-package`) | L2 | 40 PASS |
| `npm run test:foundation` | `cow-state` + `repo-snapshot`/profile temp-repo tests | L2 | 154 (115+39) |
| `npm run test:agents` | agent frontmatter/tool/contract gates | L4 | 154 |
| `npm run test:profile` | profile acceptance + state | L2 | 34 |
| `npm run test:report` | `implementation-report.mjs` validation + `--baseline` compare | L2 | 38 |
| `npm run test:unit-worktree` | `unit-worktree.mjs` baseline/overlap/compare/verify-stage | L2 | 27 |
| `npm run test:discovery-stream` | discovery stream analyzer | L5-aid | 31 |
| `npm run test:implementation-stream` | implementation stream analyzer | L5-aid | 41 |
| `npm run test:review-report` | review package/report helper validation | L2 | 34 |
| `npm run test:review-stream` | review stream analyzer | L5-aid | 21 |
| `npm run test:eval` | Python contract tests over all eval fixtures | L5-shape | 27 |
| `claude plugin validate . --strict` | manifest/plugin validation | L1 | passed |
| `npm run verify:all` | check + scripts + eval + release | aggregate | (release builder is dev tooling) |
| `npm run runtime:build` | build the runtime package (dev tooling) | L8 | not run this session |

Run bash suites via Git Bash on Windows (Section 22). The stream analyzers are
**dev/eval tooling**, not runtime; they grade live smoke transcripts and never claim
semantic certainty where the stream is insufficient.

---

## 18. Active Phase and Exact Task Boundary

**Phase 3B.1.1 is complete and verified** (Section 13). The **active phase remains
Phase 3B.2 - Review Control Plane**. Static integration of the scoped `cow-reviewer`
is present in the working tree, but the phase is **not ready** because the required
live smokes are blocked pending explicit approval for external Claude CLI data
transfer.

Decisive acceptance question for 3B.2:

```text
Can COW integrate the exact scoped cow-reviewer as the independent reviewer across
the unchanged mode/risk matrix — preserving causality classification, targeted
re-review, the two-remediation-wave ceiling, whole-work review (production → Opus
override), and controller adjudication of findings — while the reviewer never writes,
commits, runs mutating shell, or touches state, and while NO review decision differs
from what the legacy path would have produced?
```

In-scope for 3B.2 (from `PHASES.md` Phase 3 review portion + `03`/`01` review
decisions): replace the legacy reviewer dispatch with `cost-oriented-agentic-workflow:
cow-reviewer` (per-task + whole-work); pass it the review-package file + brief +
verbatim binding constraints + `MERGE_BASE_SHA` for whole-work; production whole-work
uses a per-invocation `model: opus` override; record review state via `cow-state`;
grade with `tests/eval/analyze-review-stream.mjs`. **Out of scope / unchanged:** the
matrix, standard/production semantics, causality rules, remediation budgets, retry
budgets, discovery and implementation routing, hooks (still none), version, runtime
packaging.

Do not mark 3B.2 complete on static tests alone. Remaining gate: at most three focused
live smokes (standard unit review + ownership, finding/remediation/targeted re-review,
production whole-work Opus override) captured as stream JSONL and analyzed. The current
blocked reason is explicit: `claude --plugin-dir` would transmit local plugin/workspace
content to the external Claude service, and the safety reviewer rejected that run
without explicit user approval.

---

## 19. Remaining Roadmap

### Phase 3B.2 — Review Control Plane (active, live-smoke blocked)
Static integration is present: scoped `cow-reviewer`, review package/report helpers,
review-state fields, adjudication/remediation references, review-stream analyzer, and
review-control fixtures. Remaining gate: the focused live smokes in Section 18 after
explicit approval for external Claude CLI data transfer. Preserve the matrix,
standard/production, causality, targeted re-review, two waves, whole-work review
(+production Opus override), controller adjudication, and no blind application of
feedback.

### Phase 4 — Shadow Hooks & Resume/Compact (planned)
Lean SessionStart/PostCompact pointer (sentinel + resume rule + `status --oneline`);
all PreToolUse/PreCompact rules in **shadow** (`defer` + log); valid resume via
`init --reconstruct`; corrupt-state fail-open; measure per-rule false positives. No
`deny`/`ask` yet; no active `hooks/hooks.json` shipped.

### Phase 5 — Selective Enforcement (planned)
Promote only 0-false-positive **binary** rules to `ASK`/`DENY`: allowed-path
enforcement (R3), investigator write/Bash-mutation prevention (R4/R6), tracked-edit-
in-read-only-diagnosis (R1), production plan-gate (R2). Exact staging/commit
constraints only where safely detectable. Calibrated standard vs stricter production.
Ship the active no-op-when-inactive `hooks/hooks.json` + add it to the runtime
allowlist. R5 (wrong-agent) stays WARN (role inference is not high-confidence).

### Phase 6 — Behavioral, Token & Cost Evaluation (planned)
Full route-only + full-path dogfood; measure controller/subagent tokens, cache
creation/read tokens, tool-output/artifact bytes, duplicate reads, retry cost,
latency, completion rate; tune numeric budgets (`maxTurns`, controller-read ceilings,
parallel caps) **only on measured evidence** with dated DECISIONS entries; confirm
standard vs production behavior.

### Phase 6H — Optional Headroom Compatibility (decision recorded; not on the active path)
Headroom is **not** a core dependency. It may later be tested as an **external optional
companion**; COW remains fully functional without it; **no lossy transformation** of
state, Git, tests, reports, or review evidence is acceptable; compatibility requires
**zero correctness degradation**. Not part of the roadmap before Phase 6 (Section 21).

### Phase 7 — Release Candidate & v0.5.0 (planned)
Migration cleanup; runtime-package allowlist changes (**add `agents/**` + active
`hooks/hooks.json`**); full L1–L8 verification matrix; clean package build with no dev
leak; bump all three manifests to `0.5.0` together; CHANGELOG + HANDOFF/DECISIONS;
release handoff. This is the **only** phase that bumps the version or changes runtime
packaging.

---

## 20. Superpowers Adoption Decisions

COW is a cost-tuned fork of Superpowers (6.0.3, MIT, Jesse Vincent). `01` records the
attributed matrix.

- **Adopted (as-is in spirit):** process-first / skill-first selection; root-cause-first
  debugging + the Iron Law + "3+ fixes ⇒ question architecture"; fresh subagent per
  task (formalized as `cow-implementer`); task review (spec + quality) and whole-work
  review; complete plan/task contracts (`writing-plans`); continuous execution with an
  explicit STOP list; anti-sycophancy in review receipt (`receiving-code-review`);
  domain-map-before-parallel-dispatch; bounded retries; pressure testing (extended).
- **Adapted (cost/enforcement-tuned variant):** skill-first framing → "structure not
  stern wording" + (later) a hook backstop; systematic-debugging → adds the separate
  **discovery axis** and a `phase=diagnosis-readonly` that splits ephemeral vs tracked
  instrumentation; SessionStart full-injection → **lean pointer**; one reviewer
  producing multiple verdict dimensions + **causality** (a COW addition SP lacks);
  model pinning via agent frontmatter; controller-managed (manual) worktrees.
- **Rejected / deferred:** automatic `isolation: worktree` (branches off default
  branch — breaks per-unit commits); persistent agent memory; agent teams; mandatory
  heavy ceremony for trivial tasks; automatic double review for every unit; full
  entry-skill injection every session; `executing-plans` parallel-session fallback
  (COW is single-session); unbounded autonomous loops.

COW additions not in SP: the mode/risk review matrix; finding causality; task-scoped
review packages with extended context; controller-per-unit commit policy; immutable
merge-base/base recording; the offline token analyzer + hidden-ground-truth review
fixtures; the deterministic state machine; the per-unit ownership baseline.

---

## 21. Headroom Decision

Direct Headroom integration was **rejected** for the baseline because it conflicts
with COW's load-bearing constraints: the **zero-runtime-dependency** rule; **Windows
and proxy** risk; **lossy evidence** risk (any compression/shaping of structured agent
contracts — reports, review packages, state, diffs — is unsafe because COW's
correctness depends on exact structured evidence); and **CCR/tool-allowlist** conflict.
Output shaping is specifically unsafe for the JSON report / review-package / baseline
contracts.

Ideas that **may** be adapted natively (not via a dependency): canonical prompt
prefixes; stable JSON key order (already practiced); artifact references instead of
inlined bulk (already practiced); net-cost measurement; A/B evaluation. Any Headroom
compatibility is an **optional Phase 6 experiment** only — never presented as part of
the active implementation roadmap, and only acceptable with zero correctness
degradation and no lossy transformation of structured evidence.

---

## 22. Windows and Eval Operations

Operational lessons a future agent needs (verified this program; see the memory note
`windows-eval-harness`):

- **`bash` resolves to WSL** (not installed here) → run bash suites via Git Bash:
  `& "C:\Program Files\Git\bin\bash.exe" -lc "cd /c/Users/.../repo && <cmd>"`.
  `npm run test:scripts` / `test:eval` fail under PowerShell for this reason.
- **PowerShell `>` redirection writes UTF-16 + BOM**, which corrupts captured
  stream-JSON / JSON files. Capture into a variable and
  `[System.IO.File]::WriteAllLines(path, $out)` (UTF-8, no BOM), or convert after.
- **Never type a literal BOM into a regex** (use `﻿` or `charCodeAt(0)===0xFEFF`);
  helpers are BOM-tolerant on read for the same reason.
- **CLI-looking task text** (e.g. a prompt containing `--limit`, `--base`) is data, not
  flags — quote/escape carefully.
- **Live smokes:** `claude -p "<prompt>" --output-format stream-json --verbose
  --permission-mode bypassPermissions --plugin-dir <repo>` from a disposable git repo
  (`Push-Location`); the controller must be told to FIRST invoke
  `cost-oriented-agentic-workflow:using-cost-oriented-workflow` (no active SessionStart
  hook). Keep raw streams in the **ignored** `.cost-oriented-agentic-workflow/eval/`.
- **Grade with the analyzers** (`analyze-*-stream.mjs`), passing the real process exit
  via `--exit-code`. **Process exit ≠ semantic result:** a completed workflow can exit
  non-zero (a Claude process quirk); the analyzer classifies
  `WORKFLOW_COMPLETED/WORKFLOW_BLOCKED/PROCESS_FAILURE/HARNESS_FAILURE` and never infers
  success from repo state. Real streams carry **absolute** edit paths and
  **quoted/variable** helper invocations — match by suffix, stop path args at shell
  metacharacters, treat a variable baseline path as checked.
- **Account/classifier limits are real** (one classifier outage + one 10-minute wrapper
  timeout occurred). **One retry per smoke** is allowed only for a demonstrated harness
  defect; record it honestly. A `ROUTE_RECEIPT_MISSING` flag on a numbered-step-driven
  smoke is a driving artifact, not a behavior defect.

---

## 23. Important File Map

| Area | Path(s) | Why it matters |
|---|---|---|
| Plugin manifests | `.claude-plugin/plugin.json`, `marketplace.json`, `package.json` | identity + version (0.4.2, agree) + npm scripts |
| Entry skill | `skills/using-cost-oriented-workflow/SKILL.md` (+ `references/`) | authoritative *meaning*: posture, routing flow, risk matrix, hard rules; emits receipts |
| Routing skills | `skills/execution-routing/SKILL.md` (+ `references/{implementation-routing,delegated-execution,implementation-report}.md`), `systematic-debugging`, `writing-plans`, `dispatching-parallel-agents`, `preparing-subagent-prompts` | dual routing, diagnosis lane, plans, parallelism |
| Review skills | `skills/requesting-review/` (+ `code-reviewer.md`), `receiving-code-review/`, `execution-routing/task-reviewer-prompt.md` | legacy review path (authoritative until 3B.2) |
| Intake skill | `skills/repository-intake/SKILL.md` (+ `references/`, `scripts/`) | on-demand repo mapping + profile contract |
| Custom agents | `agents/cow-{repo-investigator,debug-investigator,implementer,reviewer}.md` | the four cost-pinned workers (Section 8) |
| Runtime helpers | `skills/execution-routing/scripts/{cow-state.mjs, implementation-report.mjs, unit-worktree.mjs, cow-workspace, task-brief, review-package}`, `skills/repository-intake/scripts/{repo-snapshot.mjs, repo-profile.mjs}` | state, report validation, ownership baseline, workspace/brief/package, snapshot/profile (zero-dep) |
| Analyzers (dev/eval) | `tests/eval/analyze-{discovery,implementation}-stream.mjs`, `tests/eval/analyze-token-usage.py` | grade live smoke transcripts + token telemetry |
| Tests | `tests/{validate-structure, state, repo-intake, agent-contracts, profile, implementation-report, unit-worktree, discovery-stream, implementation-stream}.{mjs}`, `tests/scripts.test.sh`, `tests/eval/test_eval.py` | the deterministic gate + analyzer tests |
| Fixtures | `tests/eval/{routing, agents, discovery, discovery-hardening, implementation, unit-ownership, fixtures}/` | route/agent/discovery/implementation/ownership pressure tests (shape, not behavior) |
| Architecture docs | `docs/architecture/v0.5.0/{00..06, PHASES.md, PHASE-*-HANDOFF.md, COW-MASTER-HANDOFF.md}` | the design contracts + per-phase handoffs + this file |
| Runtime-package builder | `scripts/build-runtime-package.mjs` (+ `build-release.sh`, `clean-generated.mjs`) | dev tooling; allowlist that does **not** yet ship `agents/**` or active hooks |
| Hook templates | `hooks/{hooks.json.example, session-start, run-hook.cmd, README.md}` | inert templates; the Phase 4/5 substrate |

---

## 24. Non-Negotiable Invariants

1. Preserve user-owned work.
2. Never silently reset, clean, checkout, or stash.
3. Risk overrides cost.
4. Root cause precedes fixes.
5. Discovery and implementation routing are separate axes.
6. Broad investigation leaves the controller (use an investigator).
7. Same file does not imply the same unit (`unit = outcome + responsibility +
   verification seam`).
8. A tracked diagnostic edit ends read-only diagnosis and requires a visible `Re-route:`.
9. Agents never update workflow state.
10. Agents never commit (controller-owned commit; `implementer` policy only when the
    anchor sets it).
11. The controller owns fresh verification.
12. The controller owns commits.
13. Reports never replace Git evidence (actual diff / unit baseline is authoritative).
14. Review feedback is adjudicated, never blindly applied.
15. Standard and Production remain distinct.
16. Implementation attempts and review remediation waves are separate counters.
17. Exhausted budgets never imply approval.
18. Runtime dependencies remain zero.
19. No active hooks before their scheduled phase (4/5).
20. No runtime-package migration before the release migration (Phase 7).
21. No version bump before release (Phase 7).
22. No persistent agent memory.
23. No automatic worktree isolation.
24. No agent teams.
25. No future phase implemented early.
26. No broad staging (`git add .`/`-A`/`commit -a`) for a controlled unit commit;
    stage only the unit-owned delta and `verify-stage` before commit (3B.1.1).
27. No invisible compression of structured evidence (state/reports/diffs/review).
28. Static tests and live behavior are reported separately.
29. Every completion claim requires fresh evidence.
30. Final repository appearance does not erase an attempted violation (a restored clean
    tree does not prove no out-of-scope mutation was attempted).
31. Attempt artifacts are attempt-qualified and immutable; a retry keeps the same
    baseline (3B.1.1).
32. The exact scoped agent identifier is always named at dispatch; never rely on
    automatic agent selection; no silent generic fallback.

---

## 25. Incoming-Agent Resume Checklist

1. Verify repository root, branch, HEAD, clean tree, version, agent count, hook state
   (Section 2) — re-derive, don't trust hints.
2. Preserve any dirty work; classify before acting (invariants 1–2).
3. Run the full baseline (Section 17); record exact counts; classify any failure.
4. Read the phase handoffs (PHASE-1 → PHASE-3B.1.1) and `00`–`06` + `PHASES.md`.
5. Identify the active phase = **3B.2** (until a newer handoff says otherwise).
6. Reproduce the active problem (3B.2: how the legacy review path dispatches today)
   before changing runtime behavior.
7. Implement only the active scope; do not start Phase 4+ early.
8. Run static tests (all green) — report counts.
9. Run focused live smokes; grade with the analyzers; report separately from static.
10. Create/update the phase handoff and keep this master file current.
11. Commit in logical commits (the per-phase discipline); leave the tree clean.
12. Do not push, merge, or bump the version unless explicitly authorized.

---

## 26. Definition of 0.5.0 Success

0.5.0 ships only when it demonstrates, with evidence: deterministic repository
readiness; bounded discovery; cost-pinned agents; safe implementation routing;
**unit-owned commits** that preserve every pre-existing user change; **immutable retry
evidence**; **independent reviewer integration** (3B.2); resume/compact continuity
(Phase 4); **narrow hook enforcement** of only high-confidence binary gates (Phase 5);
bounded retry/remediation; measured standard vs production behavior and **measured net
cost** (Phase 6); clean runtime packaging that ships `agents/**` + an active no-op-
when-inactive hook (Phase 7); **no correctness regression**, **no user-work loss**, and
**no hidden dependency expansion**.

---

## 27. Open Risks and Known Limitations

- **Ownership/route/budget safety is validated + observed, not enforced.** Allowed-path,
  no-commit, no-stage, dirty-overlap, and controller-map budgets are contract +
  analyzer signals, not runtime guards, until Phases 4–5. Keep grading streams.
- **Phase 3B.2 live smokes are blocked pending explicit approval.** Static scoped
  `cow-reviewer` integration is present, but live `claude --plugin-dir` evidence would
  send local plugin/workspace content to the external Claude service and was denied by
  the safety reviewer without explicit user approval.
- **The runtime package does not ship `agents/**` or active hooks** — a consumer of the
  built package today gets neither; deferred to Phase 5/7.
- **Read-only Bash for the debug-investigator is contract-only** (no hook).
- **Live-smoke driving is fragile/expensive** (headless ordering, 10-min wrapper
  timeout, classifier outages); smokes are graded with documented analyzer limits and a
  one-retry-for-harness-defect rule. One 3B.1.1 smoke (D) is graded from ground-truth
  repo state because the wrapper timed out after the work completed.
- **Token/cost budgets are unmeasured** (Phase 6) — `maxTurns`, controller-read
  ceilings, and parallel caps are design values, not calibrated from data.
- **Design-vs-implementation note:** the Phase-0 cost model named `haiku` for the
  repo-investigator; the implementation pinned **sonnet** for all four agents (the live
  truth). Always read agent frontmatter, not the Phase-0 tables.

---

## 28. Final Session Baton

- **Where are we?** `feat/v0.5.0-control-plane` @ `1447c52`, dirty with Phase 3B.2
  static integration/handoff edits, version 0.4.2. Discovery and implementation +
  ownership are integrated and observed live; review is statically integrated but not
  live-smoke accepted.
- **What is verified?** Static gate green (check 369; foundation 154; agents 154;
  profile 34; report 38; unit-worktree 27; discovery-stream 31; implementation-stream
  41; review-report 34; review-stream 21; helper 40; eval 27; strict pass). Phases 1,
  2, 3A, 3A.1, 3B.1, 3B.1.1 delivered with commits + tests + live smokes.
- **What is still only planned or blocked?** Phase 3B.2 live smokes; shadow + enforced
  hooks (4/5); resume/compact lean injection (4); cost/behavioral eval (6); runtime
  packaging of agents + active hooks and the version bump (7).
- **What is the immediate next task?** Run the Phase **3B.2 - Review Control Plane**
  live-smoke gate after explicit user approval for `claude --plugin-dir` external data
  transfer.
- **What must not be changed?** The 32 invariants in Section 24 — especially: preserve
  user work; agents never commit/touch state; the actual diff / unit baseline is
  authoritative; the review matrix, standard/production split, budgets, zero deps, and
  0.4.2 version are untouched until their scheduled phase; no early phases; no broad
  staging.
- **What exact evidence is required before advancing?** For 3B.2: the deterministic
  tests above plus focused live smokes proving the scoped `cow-reviewer` is dispatched
  (per-task and whole-work, production → Opus override), is read-only (no
  write/commit/state), and preserves matrix decisions, causality, targeted re-review,
  and the two-wave ceiling. Live evidence must be raw stream JSONL plus
  `analyze-review-stream.mjs` reports.

**Decisive question for the active phase (3B.2):** *Can COW make the independent
reviewer a scoped, cost-pinned `cow-reviewer` — read-only, causality-classified,
matrix-governed, with targeted re-review and bounded remediation — without changing a
single review decision the legacy path would have made, and without the reviewer ever
writing, committing, running mutating shell, or touching workflow state?*

# 0.5.0 Control-Plane Architecture

> Phase 0 design document. **No runtime behavior is implemented here.** This is the
> evidence-backed contract that Phases 1–7 implement. Status of each decision is
> **DECIDED** unless explicitly marked DEFER.

Evidence base:
- Current repo: `cost-oriented-agentic-workflow` v0.4.2 @ `27e6cba` (branch
  `feat/v0.5.0-control-plane`). Baseline verified: structural 187/0, helper 40,
  eval 9, strict-validate pass, runtime prose 85,432/86,000.
- Superpowers **6.0.3** (local cache `…/claude-plugins-official/superpowers/6.0.3`,
  author Jesse Vincent, MIT). Patterns cited in `01-…`.
- Claude Code docs fetched 2026-06-24 (`code.claude.com/docs`: sub-agents,
  plugins-reference, hooks, hooks-guide, skills, costs). Capabilities cited in
  `03-…` and `04-…`.

## 1. Problem statement

COW 0.4.x routes a token-economy workflow entirely through **prose skills** read
by an Opus controller. Dogfooding (Flutter debug, 0.4.1) showed the prose layer
is correct but leaky: binary gates are *rationalized away*, and the controller
explores unknown repos itself (expensive). The eight concrete weaknesses:

| # | Weakness | Root cause |
|---|----------|------------|
| W1 | Expensive controller-led exploration in unknown repos | No cheap, cached repo map; controller reads broadly |
| W2 | Diagnosis vs. implementation routing conflated | One implicit "route"; no separate discovery vs implementation axis |
| W3 | Process skills skipped before repo inspection | "Let me look first" beats a prose rule |
| W4 | Prose rules rationalized away | No deterministic enforcement of binary gates |
| W5 | Tracked diagnostic edits before re-triage | The re-route receipt is prose-only, easy to skip |
| W6 | Context growth from broad exploration + repeated prompt contracts | Everything lives in the controller's context |
| W7 | Fragile resume/compact behavior | Control position lives only in prose + a ledger |
| W8 | No deterministic enforcement for binary gates | Hooks not used |

### 1.1 Traceability (failure → component → test)

Every weakness maps to a named owner component and an eval (`10` self-review #1):

| Weakness | Owning component | Test (`05` layer / scenario) |
|---|---|---|
| W1 broad controller exploration | repository-intake + `cow-repo-investigator` (`02`,`03`) | L2 snapshot; L5 `unknown-existing-repo`, `warm-repo-trivial-edit`; L7 budgets |
| W2 diagnosis vs implementation conflated | dual routing (`02` B) | L5 `small-disjoint-bugs`, `broad-investigation-then-tiny-fix` |
| W3 skills skipped before inspection | entry skill + SessionStart pointer; hook backstop (`01`,`04`) | L5 route-only receipts; L3 R1 |
| W4 prose rationalized away | hooks R1–R3/R6 (`04`) | L3 hook-decision cases |
| W5 tracked diagnostic edit before re-triage | diagnosis phase + R1/R6 + systematic-debugging (`02b`,`04`) | L3 R1/R6; L5 `tracked-diagnostic-harness` |
| W6 context growth | agent budgets + lean injection (`03`) | L7 token acceptance; L5 `compact-during-diagnosis` |
| W7 fragile resume/compact | `state.json` + `--reconstruct` + lean SessionStart (`04` A.4) | L2 reconstruct/corruption; L5 `resume-after-new-session` |
| W8 no deterministic enforcement | hooks (`04`) | L3 hook-decision; L5 enforced scenarios |

## 2. Goals / non-goals

**Goals.** Convert binary, observable invariants from prose-only to a **hybrid**
of (a) process skills (judgment/HOW), (b) deterministic state + repo artifacts
(machine-readable position), (c) cost-pinned plugin agents (bounded delegation),
(d) selective hooks (enforce only high-confidence binary gates), (e) behavioral +
cost evals. Each weakness W1–W8 maps to a named component and a test (`05-…`).

**Non-goals (this program).** No general workflow DSL, no database/daemon, no
orchestration MCP server, no agent teams, no self-modifying prompts, no persistent
agent memory, no hook that parses arbitrary shell semantics. The review matrix,
retry/remediation budgets, standard/production split, and zero-runtime-dependency
rule are **preserved**, not redesigned.

## 3. Architecture (component map)

```text
                         ┌──────────────────────────────────────────┐
                         │  CONTROLLER (Opus)  — lean orchestrator    │
                         │  reads: summaries, state, profile, ledger  │
                         └───────────────┬────────────────────────────┘
              invoke (Skill tool)        │  dispatch (Agent, model-pinned)
        ┌───────────────────────────┐    │    ┌───────────────────────────────┐
        │ PROCESS SKILLS (prose/HOW) │    │    │ PLUGIN AGENTS (bounded workers)│
        │ using-cost-oriented-workflow│   │    │ cow-repo-investigator (haiku)  │
        │ systematic-debugging        │   │    │ cow-debug-investigator (sonnet)│
        │ repository-intake (NEW)     │   │    │ cow-implementer (sonnet)       │
        │ writing-plans               │   │    │ cow-reviewer (sonnet)          │
        │ execution-routing           │   │    └───────────────┬───────────────┘
        │ requesting/receiving-review │    │                    │ files only
        └───────────────┬─────────────┘   │                    ▼
                        │ read/transition  │      ┌─────────────────────────────┐
                        ▼                  │      │ IGNORED WORKSPACE            │
        ┌───────────────────────────────┐ │      │ <repo>/.cost-oriented-…/run/ │
        │ DETERMINISTIC ARTIFACTS        │ │      │  state.json (NEW)            │
        │  cow-state helper (NEW)        │◄┘      │  progress.md (ledger)        │
        │  repo-snapshot.mjs (NEW)       │        │  repo-profile.{json,md} (NEW)│
        │  cow-workspace/task-brief/     │        │  task-N-brief/report,*.diff  │
        │  review-package (KEEP)         │        └─────────────────────────────┘
        └───────────────────────────────┘
                        ▲ read state                ▲ read state + tool_input
        ┌───────────────┴────────────────────────────┴───────────────┐
        │ SELECTIVE HOOKS (PreToolUse / SessionStart / PreCompact)     │
        │ no-op when inactive · deny only high-confidence binary gates │
        └──────────────────────────────────────────────────────────────┘
```

## 4. Component boundaries (one owner each)

| Component | Owns | Does NOT own |
|---|---|---|
| **Process skills** | The *meaning* of every rule; judgment, calibration, HOW | Current position; enforcement |
| **State (`state.json` + `cow-state`)** | Observable control *position* (phase, routes, risk, allowed paths, counters) | Rules; reasoning; code truth |
| **Repo artifacts (`repo-snapshot`/`repo-profile`)** | A cheap, cached *map* of an unknown repo | Per-task decisions |
| **Plugin agents** | Bounded execution of one role (investigate / implement / review) | Routing decisions; commits (except implementer policy) |
| **Hooks** | Deterministic *enforcement* of a small binary subset, using state | Defining rules; semantic judgment |
| **Git / plan / ledger** | Code truth; the plan; durable completion record | Transient control position |

## 5. Control flow (happy path, standard mode)

1. **Session start** → SessionStart hook injects a *short* pointer + sentinel +
   one-line state summary (not the full entry skill). Controller invokes
   `using-cost-oriented-workflow` on demand.
2. **Triage** → controller emits a `Route:` receipt; `cow-state init`/`transition`
   records `mode`, `processLane`.
3. **Discovery routing** (`02-…`): warm repo → skip; unknown repo → cheap
   `controller-map` or dispatch `cow-repo-investigator`(s). Profile cached to
   `repo-profile.json`.
4. **Debugging** (if bug) → `systematic-debugging`; read-only diagnosis; disjoint
   domains → `cow-debug-investigator`(s). First tracked diagnostic edit ⇒
   `Re-route:` + state transition back to triage.
5. **Implementation routing** (`02-…`): inline | delegated | planned-sequential |
   delegated-batch. Risk overrides cost. Light-inline stays available.
6. **Execute** → `cow-implementer` per unit (or inline); `cow-reviewer` per
   mode/risk matrix; bounded remediation (≤2 waves); verify; controller commits
   per unit (default policy).
7. **Finish** → whole-work review (standard→Sonnet, production→Opus); integrate.

## 6. Source-of-truth hierarchy (authoritative layering)

When the same fact appears in more than one layer, this order governs
(`10` self-review point 3):

```text
1. Git (commits, merge-base, base branch)      ── code truth, immutable
2. Plan file + progress ledger (.md)           ── the plan & durable completion
3. state.json (cow-state)                       ── current CONTROL position only
4. Process skills (prose)                        ── the MEANING of every rule
5. Hooks                                         ── mechanical guards that trust (3)
```

Rules of precedence:
- **Skills define rules; state records position; hooks enforce a subset.** A hook
  never invents a rule — it denies only when *state* says a gate is active AND the
  tool input deterministically violates it.
- **State is reconstructable, never primary.** If `state.json` is missing or
  malformed, git + plan + ledger remain authoritative; hooks **fail-open**
  (no-op) and the controller rebuilds state via `cow-state init --reconstruct`.
- **No reasoning prose in state** (`10` point 5). State holds enums, paths, SHAs,
  counters — never "why".

## 7. Cost model (token contract → `03`/`05`)

The economy is "spend where it changes the outcome." Concrete budgets:

| Lever | 0.4.x | 0.5.0 target | Mechanism |
|---|---|---|---|
| Controller repo reads (unknown repo) | unbounded | ≤ ~15 cheap reads, else investigator | repository-intake warm/skip; `cow-repo-investigator` on haiku |
| Investigator return text | prose, variable | ≤ 40 lines, files for bulk | agent return-line cap + report file |
| Agent prompt | up to 42k chars seen in SP dogfood | brief file + ≤ ~15 lines dispatch | file handoffs (KEEP from SDD) |
| Agent report | pasted | report **file**; ≤ 8-line return | KEEP implementer contract |
| Preloaded skills/agent | n/a | ≤ 1 small skill per agent | `skills:` frontmatter, minimal |
| SessionStart/PostCompact ctx | full ~13 KB entry skill | short pointer + sentinel + 1-line state | lean injection (ADAPT) |
| Parallel investigators | 2 (prose) | ≤ 2 | repository-intake / dispatching rule |
| Max agent turns | unbounded | pinned per agent (`maxTurns`) | agent frontmatter |
| Autonomous retries | 2 (prose) | 2, state-counted | `cow-state` attempt counters |

Avoids: pasting diffs into controller context (review-package files), repeating
task history (brief files, no pasted history), loading every skill into every
agent (minimal `skills:` preload), full entry-skill injection every session (lean
SessionStart), duplicate repo exploration (cached `repo-profile`).

## 8. Failure model

| Failure | Detection | Response |
|---|---|---|
| `state.json` missing | `cow-state status` | Reconstruct from git/plan/ledger; hooks no-op meanwhile |
| `state.json` malformed | JSON parse fails | `cow-state` exits non-zero; hooks **fail-open**; controller re-inits |
| Agent timeout (`maxTurns`) | agent returns truncated/BLOCKED | bounded retry (changed context/model/scope), then escalate |
| Failed hypothesis (debug) | verify red | new hypothesis; ≥3 ⇒ architecture escalation (SP iron law) |
| Retry budget exhausted | attempt counter = 2 | stop; `cow-state block`; surface to human |
| Remediation budget exhausted | wave counter = 2 | `budget exhausted ≠ approved`; block |
| Investigator writes source | PreToolUse hook (agent_type) | DENY with reason (Phase 5); shadow-WARN earlier |
| Stale repo profile | fingerprint mismatch | re-run snapshot; profile rebuilt |
| Corrupted workspace (`git clean -fdx`) | artifacts gone | git + plan are fallback (KEEP) |

## 9. Security / safety

- **No secrets in state or profile** (`09` constraint): snapshot/profile record
  structure (languages, build/test commands, dir shape) — never file contents,
  env values, or tokens. `repo-snapshot.mjs` has an explicit field allowlist.
- **No hidden chain-of-thought persistence**: state stores observable enums only;
  agent memory is **disabled** (`03`) — enabling it would inject `MEMORY.md` and
  force-enable Write/Edit (CC docs), defeating read-only and persisting reasoning.
- **Hooks never silently approve** (`04`): they emit `deny`/`ask`/`defer`, never a
  blanket `allow`. They no-op when the workflow is inactive.
- **No unrestricted destructive cleaner / no cache mutation**: 0.4.2 rules KEEP.
- **Confirm before irreversible/outward actions**: preserved from entry skill.

See `04-state-machine-and-hook-enforcement.md` for enforcement detail,
`03-agent-contracts.md` for agent budgets, and `06-migration-map.md` for the
0.4.2→0.5.0 file mapping.

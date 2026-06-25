# 03 — Plugin-Agent Catalog & Context/Token Contract

Solves **W6** (context growth, repeated prompt contracts) by replacing prose
"always specify the model / hand files not text" with **cost-pinned plugin
agents**. Capability facts below are from CC docs (fetched 2026-06-24): plugin
agents support `name, description, model, effort, maxTurns, tools, disallowedTools,
skills, memory, background, isolation`; `hooks/mcpServers/permissionMode` are
**ignored** for plugin agents; `tools`/`disallowedTools` **are enforced**;
per-invocation `model` overrides the frontmatter default; nesting depth is capped
at 5; subagents get fresh isolated context.

Minimum viable set (do not add more — `7.4`): `cow-repo-investigator`,
`cow-debug-investigator`, `cow-implementer`, `cow-reviewer`. All live in
`agents/` at the plugin root.

## Phase 2 implemented contracts (AUTHORITATIVE — supersede the per-agent tables below where they differ)

Implemented in `agents/*.md`, validated by `tests/agent-contracts.test.mjs`, and
confirmed by live `--plugin-dir` smokes (Claude Code 2.1.186). Scoped dispatch
identifiers: `cost-oriented-agentic-workflow:cow-repo-investigator`,
`…:cow-debug-investigator`, `…:cow-implementer`, `…:cow-reviewer`.

| Agent | model | effort | maxTurns | tools | skills preload | return cap | body bytes |
|---|---|---|---|---|---|---|---|
| cow-repo-investigator | sonnet | low | 10 | Read, Glob, Grep | — | 80 lines | 2186/4500 |
| cow-debug-investigator | sonnet | medium | 14 | Read, Glob, Grep, Bash | `cost-oriented-agentic-workflow:systematic-debugging` | 70 lines | 2407/6000 |
| cow-implementer | sonnet | high | 30 | Read, Glob, Grep, Bash, Write, Edit | — | 8 lines | 2264/6500 |
| cow-reviewer | sonnet | medium | 12 | Read, Glob, Grep | — | 80 lines | 2305/5500 |

Corrections vs the Phase-0 tables below (decided with evidence, per the task's §2):
- **Model: `sonnet` for all four** (Phase 0 set `cow-repo-investigator` to haiku). The
  investigator now drafts a *semantic* profile (judgment); the deterministic snapshot
  is `repo-snapshot.mjs` (Phase 1), which it does not redo. Uniform Sonnet also matches
  the global invariant. A production whole-work `cow-reviewer` may still be dispatched
  with a per-invocation `model: opus` override (no fifth agent).
- **`maxTurns` tightened** (repo 15→10, debug 20→14, reviewer 15→12; implementer 30).
- **Tool boundaries finalized:** `Bash` **removed** from `cow-repo-investigator` (no shell;
  it reads the snapshot, never runs it) and from `cow-reviewer` (pure read-only review).
  Only `cow-implementer` has `Write`/`Edit`; only it and `cow-debug-investigator` have
  `Bash`. No agent has `Agent`, `Skill`, MCP, or `PowerShell`.
- **Skill preload, not the Skill tool:** no agent lists `Skill` in `tools`
  (CC docs: "to preload Skills, use the `skills` field rather than listing `Skill`").
  `cow-debug-investigator` preloads exactly `cost-oriented-agentic-workflow:systematic-debugging`
  — the **qualified** form, which disambiguates from Superpowers' same-named skill.
  `claude plugin validate --strict` does **not** resolve `skills:` references (it passed
  with a deliberately bogus name), so runtime injection was **proven by smoke**: the
  agent quoted the skill's Iron Law verbatim with no Skill tool and no access to the
  file. The Phase-0 "implementer may load `test-driven-development` via the Skill tool"
  is **removed**; TDD guidance lives in the brief/body.
- **`cow-debug-investigator` Bash is read-only by contract** (tests, builds, read-only
  git, log filtering). Tracked edits/installs/commits are forbidden; it returns
  `REQUIRES_REROUTE` instead. Deterministic Bash enforcement is deferred to the hook phase.
- **Output contracts** are the explicit envelopes in `agents/*.md` (e.g. the
  investigators' multi-field contracts), superseding Phase 0's "≤40-line" caps.
- **`memory` and `isolation` are omitted** on every agent (confirmed in the CC plugin
  schema); enabling either would persist reasoning or detach the feature branch.
- **Runtime allowlist NOT changed in Phase 2.** The agent files exist in the repo but the
  runtime-package builder does **not** yet ship `agents/**`; that addition is deferred
  (`06`). Until then the agents are loaded from source via `--plugin-dir`.

## Cross-cutting decisions (apply to all four)

- **`memory`: DISABLED (omit the field).** Enabling it (CC docs) auto-injects
  `MEMORY.md` into the system prompt **and force-enables Read/Write/Edit regardless
  of `tools`** — which would break read-only investigators and persist reasoning,
  violating "no hidden chain-of-thought persistence" and "no persistent agent
  memory in the baseline" (`09`). Durable control state lives in `state.json`
  (observable enums), not agent memory.
- **`isolation: worktree`: DISABLED (omit the field).** CC docs: a worktree branches
  from the **default branch, not the parent HEAD**, and auto-cleans if unchanged.
  That would detach `cow-implementer` from the feature branch and break
  controller-per-unit commits + the immutable merge-base/base-branch contract.
  Cheap isolation stays file-ownership + sequential same-file (`02` B.7). Manual
  worktrees remain available for production/parallel-disjoint work via the existing
  `using-git-worktrees` skill.
- **Production final review = model override, not a new agent.** `cow-reviewer` is
  dispatched with `model: opus` for production whole-work review (per-invocation
  override is supported and takes precedence over the agent default). Avoids a
  redundant fifth agent; independence is preserved because every dispatch is a
  fresh isolated instance.
- **`permissionMode` is ignored for plugin agents**, so least-privilege is achieved
  via `tools`/`disallowedTools` (enforced) plus state-gated hooks (`04`).
- **Always file handoffs** (KEEP from SDD): brief in, report out, review-package as
  a file. Nothing bulk is pasted into the controller or an agent prompt.

## Agent: `cow-repo-investigator`

| Field | Value |
|---|---|
| Responsibility | Read-only mapping of an unknown subsystem; run/parse `repo-snapshot.mjs`; return a bounded map summary + notes file. Never decides routes. |
| Auto-delegation `description` | "Use to map an unfamiliar repository or subsystem read-only and return a concise structure/convention summary. Read-only; writes only the workflow workspace." |
| `model` | `haiku` (CC cost guidance: haiku for read-only exploration) |
| `effort` | `low` (raise to `medium` only for tangled trees) |
| `maxTurns` | 15 |
| `tools` | `Read, Grep, Glob, Bash` |
| `disallowedTools` | `Edit, Write, NotebookEdit, Skill, Agent` |
| `skills` preload | none (the dispatch brief is the full contract) |
| `Skill` tool | **removed** (no skill loading; stays lean) |
| Artifact inputs | dispatch brief (scope + paths); optional `repo-snapshot.json` |
| Artifact outputs | `repo-snapshot.json` (if it runs the script) + `<ws>/run/repo-notes-*.md` |
| Return-line limit | ≤ 40 lines (summary + suspect paths); bulk → notes file |
| Stop conditions | brief answered; or out-of-scope discovered (report + stop); or `maxTurns` |
| Retry/escalation | controller may re-dispatch ≤2 with **changed** scope/model; else controller does a minimal map itself |

`Bash` is allowed (to run `node repo-snapshot.mjs` and read-only git); source
mutation is blocked by removing `Edit/Write` and, from Phase 5, by a hook that
denies a mutating Bash/Write when `agent_type` is an investigator and the target is
outside the workspace.

## Agent: `cow-debug-investigator`

| Field | Value |
|---|---|
| Responsibility | Read-only root-cause diagnosis of **one** problem domain; return an evidenced hypothesis + file:line evidence. **No fix, no tracked edit.** |
| Auto-delegation `description` | "Use to diagnose one bug domain read-only and return an evidenced root-cause hypothesis. Never edits code; never proposes the implementation route." |
| `model` | `sonnet` (diagnosis needs judgment) |
| `effort` | `medium` |
| `maxTurns` | 20 |
| `tools` | `Read, Grep, Glob, Bash` |
| `disallowedTools` | `Edit, Write, NotebookEdit, Skill, Agent` |
| `skills` preload | none |
| `Skill` tool | removed |
| Artifact inputs | dispatch brief: the one domain, symptoms, scope paths, repro hint |
| Artifact outputs | `<ws>/run/diag-<domain>-report.md` (evidence) |
| Return-line limit | ≤ 40 lines (root-cause hypothesis + evidence + suspect file:line) |
| Stop conditions | evidenced root cause; or "cannot reproduce / need data" (report + stop); `maxTurns` |
| Retry/escalation | controller re-dispatches ≤2 with changed scope/model; ≥3 failed fixes downstream ⇒ architecture escalation (SP iron law) |

Parallel cap: at most **2** debug-investigators concurrently, and only after a
cheap domain map evidences disjoint domains (`02` B; SP `dispatching-parallel`).

## Agent: `cow-implementer`

| Field | Value |
|---|---|
| Responsibility | Implement **one** unit from a task brief; test it; self-review; write a report. Does **not** commit under the default policy. |
| Auto-delegation `description` | "Use to implement one specified unit from a task brief, test it, and report. Edits only the unit's allowed paths." |
| `model` | `sonnet` (default); per-invocation override allowed for very large/complex generation in production (→ `opus`) |
| `effort` | `high` |
| `maxTurns` | 30 |
| `tools` | `Read, Grep, Glob, Edit, Write, Bash, Skill` |
| `disallowedTools` | `Agent` (no nesting), `NotebookEdit` (unless task needs it) |
| `skills` preload | none by default; the agent body carries the implementer contract (from `implementer-prompt.md`). In production it may load `test-driven-development` via the `Skill` tool on demand. |
| `Skill` tool | **available** (for TDD / verification-before-completion on demand) |
| Artifact inputs | `task-N-brief.md`, report path, interfaces/decisions, `allowedPaths` |
| Artifact outputs | `task-N-report.md` (full report) |
| Return-line limit | ≤ 8 lines: status, files changed, one-line test summary, concerns, report path |
| Stop conditions | DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED (KEEP from 0.4.x) |
| Retry/escalation | ≤ **2 extra attempts**, each with changed context/model/scope (state-counted); never re-loop same model+prompt; BLOCKED → controller assesses |

Commit policy: default `controller-per-unit` → implementer leaves work uncommitted;
controller commits after review. `implementer` policy only when the anchor sets it.
`allowedPaths` come from `cow-state unit`; a Phase-5 hook denies edits outside them.

## Agent: `cow-reviewer`

| Field | Value |
|---|---|
| Responsibility | Independent review of a task-scoped or whole-work review package; return verdict + findings with causality. **Read-only.** |
| Auto-delegation `description` | "Use to review a prepared diff package independently and return Critical/Important/Minor findings with causality and a verdict. Read-only; never edits." |
| `model` | `sonnet` (default; scale effort to diff). Whole-work **production** → dispatched with `model: opus`. |
| `effort` | scaled to diff size/risk (`low`–`high`) |
| `maxTurns` | 15 |
| `tools` | `Read, Grep, Glob, Bash` (read-only; reads the package file, may run a named check) |
| `disallowedTools` | `Edit, Write, NotebookEdit, Skill, Agent` |
| `skills` preload | none (the agent body carries the review rubric from `code-reviewer.md`) |
| `Skill` tool | removed |
| Artifact inputs | review-package file (`review-*.diff`), brief, **binding constraints block** (verbatim), `MERGE_BASE_SHA` for whole-work |
| Artifact outputs | verdict + findings (returned concise) |
| Return-line limit | every valid Critical/Important; ≤ 3 highest-impact Minor; strengths ≤ 1 line; no preamble/process narration (KEEP from 0.4.x) |
| Stop conditions | verdict produced; `maxTurns` |
| Retry/escalation | fresh targeted re-review after accepted Critical/Important fix (matrix); ≤2 remediation waves; `budget exhausted ≠ approved` |

Independence: a reviewer instance is always distinct from the implementer instance
(fresh isolated context per dispatch). The mode/risk matrix decides *whether* a
per-task reviewer runs; this agent is the *how*.

## Context / token contract (`7.7`)

| Budget | Value | Enforced by |
|---|---|---|
| Controller repo reads (unknown repo) | prefer 1 deterministic snapshot; ≤ ~15 cheap reads before delegating | repository-intake warm/skip (`02`) |
| Investigator return text | ≤ 40 lines; bulk → notes/report file | agent contract + dispatch instruction |
| Implementer return text | ≤ 8 lines | implementer contract (KEEP) |
| Agent prompt size | brief file + ≤ ~15-line dispatch; **no pasted session history** | file handoffs (KEEP); SP anti-pattern (42k-char dispatch) avoided |
| Agent report size | unbounded but **in a file**, never returned inline | report-file contract |
| Preloaded skills per agent | ≤ 1 small skill; default none | `skills:` frontmatter kept minimal |
| SessionStart / PostCompact context | short pointer + sentinel + 1-line `cow-state status` (not the ~13 KB entry skill) | lean SessionStart (`01` #7, `04`) |
| Parallel investigator count | ≤ 2 | `02` / dispatching rule |
| Max agent turns | pinned per agent (15/20/30/15) | `maxTurns` frontmatter |
| Autonomous retries | 2 extra implementer attempts; 2 remediation waves | `cow-state` counters (`04`) |

How the design avoids the named cost leaks:
- **No diffs in controller context** — review-package is a file the reviewer Reads.
- **No repeated task history** — each dispatch carries only its brief + interfaces.
- **No "every skill in every agent"** — minimal/zero `skills:` preload; `Skill`
  removed from investigators/reviewer.
- **No full entry-skill injection per session** — lean SessionStart pointer.
- **No duplicate repo exploration** — cached fingerprinted `repo-profile.json`.

# Phase 2 Handoff — Plugin-Agent Catalog

Status: **delivered**. The four cost-pinned plugin agents exist, pass static
contract gates, and were each confirmed by a live `--plugin-dir` smoke. They are
**not** wired into routing. Package version stays **0.4.2**.

## What this phase added

- `agents/cow-repo-investigator.md`, `cow-debug-investigator.md`,
  `cow-implementer.md`, `cow-reviewer.md`.
- `tests/agent-contracts.test.mjs` (+ `npm run test:agents`) — deterministic
  frontmatter/tool/budget/contract checks.
- `tests/eval/agents/**` fixtures + `AgentFixtureContractTests` in
  `tests/eval/test_eval.py` (a malformed agent fixture now fails the eval suite).
- `tests/validate-structure.mjs` — §5 now resolves a qualified
  `cost-oriented-agentic-workflow:<agent>` reference against `agents/` too.

## Final agent frontmatter (authoritative; mirrors `03` corrections)

| Agent | model | effort | maxTurns | tools | skills preload | background |
|---|---|---|---|---|---|---|
| cow-repo-investigator | sonnet | low | 10 | Read, Glob, Grep | — | false |
| cow-debug-investigator | sonnet | medium | 14 | Read, Glob, Grep, Bash | `cost-oriented-agentic-workflow:systematic-debugging` | false |
| cow-implementer | sonnet | high | 30 | Read, Glob, Grep, Bash, Write, Edit | — | false |
| cow-reviewer | sonnet | medium | 12 | Read, Glob, Grep | — | false |

- **Tool boundaries:** only `cow-implementer` has `Write`/`Edit`; only it and
  `cow-debug-investigator` have `Bash`; `cow-repo-investigator` and `cow-reviewer`
  have **no shell**. No agent has `Agent`, `Skill`, MCP, or `PowerShell`. None has
  `memory` or `isolation`; none has the plugin-ignored `hooks`/`mcpServers`/`permissionMode`.
- **Skill-preload decision:** preloading uses the `skills` frontmatter field, never a
  `Skill` tool. The **qualified** identifier `cost-oriented-agentic-workflow:systematic-debugging`
  is used (disambiguates Superpowers' same-named skill). `claude plugin validate --strict`
  does **not** resolve `skills:` references (it passed with a bogus name), so injection
  was proven by smoke, not by validation.
- **Read-only Bash (debug-investigator) is contract-level only** — tests, builds,
  read-only git, log filtering; it returns `REQUIRES_REROUTE` rather than making a
  tracked edit. **Deterministic Bash enforcement is NOT yet in place** (hook phase).
- **Output contracts / return caps:** repo 80 lines (STATUS/PROFILE_JSON/UNCERTAINTIES);
  debug 70 lines (10-field root-cause contract); implementer 8-line return + an ignored
  report artifact; reviewer 80 lines (SPEC + QUALITY verdicts, causality-classified findings).
- **Prompt budgets:** bodies 2186 / 2407 / 2264 / 2305 bytes (ceilings 4500 / 6000 /
  6500 / 5500); aggregate 9162/20000; each description ≤ 450.

## Manual scoped invocation identifiers (Phase 3 must use these exactly)

```text
cost-oriented-agentic-workflow:cow-repo-investigator
cost-oriented-agentic-workflow:cow-debug-investigator
cost-oriented-agentic-workflow:cow-implementer
cost-oriented-agentic-workflow:cow-reviewer
```

## Live smoke results

Claude Code **2.1.186**; plugin loaded from source via `claude --plugin-dir <repo>`;
disposable temp git repos; `--output-format stream-json`; raw evidence preserved
(uncommitted) under `.cost-oriented-agentic-workflow/eval/agents/`.

| Agent | Scoped type spawned | Model | Mutations | Contract result |
|---|---|---|---|---|
| repo-investigator | yes (`task_started.subagent_type`) | claude-sonnet-4-6 | none — Read/Glob only | `STATUS: READY` profile draft |
| debug-investigator | yes | sonnet | none — read-only Bash; git status+HEAD identical; no patch | `ROOT_CAUSE_EVIDENCED` |
| implementer | yes | sonnet | only `src/slugify.js`; **0 commits**; report written; test exit 1→0 | `STATUS: DONE` |
| reviewer | yes | sonnet | none — Read only | `SPEC_VERDICT: FAIL`, `QUALITY_VERDICT: CHANGES_REQUIRED`; INTRODUCED blocks, PRE_EXISTING does not |

**systematic-debugging preload proven:** a fresh `cow-debug-investigator` dispatch
quoted the skill's Iron Law `NO FIX WITHOUT ROOT CAUSE FIRST` verbatim — obtainable
only from the injected preload (no Skill tool, skill file absent from the fixture).
Automatic description-based selection was not probed; Phase 3 dispatches the scoped
identifiers explicitly (it is not a Phase 2 gate).

## Boundary statements (must stay true entering Phase 3)

- **Agents are not wired into live routing.** No entry skill, launcher,
  `systematic-debugging`, or `execution-routing` behavior was changed.
- **The controller still owns state transitions** (`cow-state`) — agents never write
  `state.json` or the ledger.
- **The controller still owns commits** — `COMMIT_POLICY` resolves to controller-owned;
  no agent commits.
- **Read-only Bash is not yet deterministically enforced** — it is a contract the agent
  keeps; the PreToolUse hook that denies investigator mutation is a later phase.
- **The runtime builder does not yet ship `agents/**`** — they load from `--plugin-dir`;
  packaging is deferred (`06`).
- **Generic prompt templates remain compatibility fallbacks** —
  `execution-routing/implementer-prompt.md`, `task-reviewer-prompt.md`, and
  `requesting-review/code-reviewer.md` are unchanged; Phase 3 migrates dispatch to the
  agents but does not delete the templates.

## Risks for Phase 3 (dual-routing integration)

- **Dispatch must name the scoped identifier**, not rely on auto-selection; the entry
  prompt the controller composes must pass every required input the agent contract
  lists, or the agent returns `BLOCKED_INPUT`.
- **No hook backstop yet:** until the hook phase, the read-only/allowed-paths/no-commit
  rules depend on agent adherence. Phase 3 should not assume enforcement.
- **`cow-repo-investigator` writes no profile** — the controller must persist the
  drafted `repo-profile.json` itself and set `repositoryProfile` via `cow-state`.
- **Per-invocation model override** (production whole-work reviewer → `opus`) must be
  set at dispatch time; the agent default stays Sonnet.
- **Token-budget calibration** (the per-agent ceilings, parallel caps) remains a later
  eval/tuning concern; Phase 3 should record real dispatch costs, not assume them.

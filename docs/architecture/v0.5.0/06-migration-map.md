# 06 — Migration Map (0.4.2 → 0.5.0)

Classification: **KEEP** (unchanged), **MODIFY** (edit in place), **SPLIT** (one
file becomes several roles), **REPLACE** (superseded by a new component),
**REMOVE LATER** (deprecate after the replacement is proven). No file is touched in
Phase 0 — this is the contract Phases 1–7 execute.

## Component map

| 0.4.2 component | Verdict | Target in 0.5.0 | Notes |
|---|---|---|---|
| `skills/using-cost-oriented-workflow` (entry) | **MODIFY** | + dual-routing receipts, + repository-intake reference, + state-receipt language; keep judgment/calibration & "structure not stern wording" | Authoritative for *meaning*; emits receipts that map to `cow-state` calls |
| `skills/systematic-debugging` | **MODIFY** | + `discoveryRoute` for diagnosis, + `phase=diagnosis-readonly` state, keep all 0.4.1 invariants (tracked-edit ⇒ re-route, smallness-independence, cleanup disposition) | Owner of the diagnosis lane (`02` B) |
| `skills/writing-plans` | **KEEP** | minor: controller records `plan.status/path` via `cow-state` | Already carries the 0.4.1 outcome-boundary rule |
| `skills/execution-routing` | **MODIFY + SPLIT** | implementation-routing → `02` B; discovery-routing → repository-intake + systematic-debugging; delegation → plugin agents; records routes/units via `cow-state` | The single 0.4.x "route" becomes the dual axis |
| `skills/dispatching-parallel-agents` | **MODIFY** | becomes the `parallel-investigators` discovery mechanism; binds to `cow-repo-investigator`/`cow-debug-investigator`; keep ≤2 + domain-map-first | SP Step-1 domain map = COW discovery trigger |
| `skills/preparing-subagent-prompts` | **MODIFY** | "how to compose the brief + dispatch" referencing the agent catalog; role contracts move into agent bodies | File handoffs preserved |
| `skills/execution-routing/implementer-prompt.md` | **SPLIT** | role contract → `agents/cow-implementer.md` body; dispatch-composition guidance → preparing-subagent-prompts/execution-routing | Template becomes an agent |
| `skills/execution-routing/task-reviewer-prompt.md` | **SPLIT** | review rubric → `agents/cow-reviewer.md` body; dispatch-composition → requesting-review | Template becomes an agent |
| `skills/requesting-review/code-reviewer.md` (whole-work) | **MODIFY** | whole-work review dispatches `cow-reviewer` (production: `model: opus`); causality + matrix unchanged | Independence preserved |
| `skills/requesting-review` / `receiving-code-review` | **KEEP** | matrix + adjudication unchanged (`09` constraint) | — |
| `hooks/session-start` (opt-in) | **MODIFY** | lean injection: `COW_ENTRY_INJECTED` + resume rule + `cow-state status --oneline`, not the full entry skill | `01` #7 |
| `hooks/hooks.json.example` | **MODIFY → REPLACE LATER** | gains `PreToolUse` + `PreCompact` entries; once enforcement is proven, ship an **active** `hooks/hooks.json` that no-ops when inactive | Stays `.example` until Phase 5 |
| `skills/execution-routing/scripts/{cow-workspace,task-brief,review-package}` | **KEEP** | unchanged; `cow-state` added alongside | Runtime helpers (allowlisted via `skills/**`) |
| (new) `skills/execution-routing/scripts/cow-state` | **ADD** | state helper (`04` A.8) | runtime |
| (new) `skills/repository-intake/SKILL.md` + `scripts/repo-snapshot.mjs` | **ADD** | repository intake (`02` A) | runtime |
| (new) `agents/cow-{repo-investigator,debug-investigator,implementer,reviewer}.md` | **ADD** | plugin agents (`03`) | runtime |
| `scripts/{build-release.sh,clean-generated.mjs,build-runtime-package.mjs}` | **KEEP** | dev tooling; runtime builder gains `agents/**` to the allowlist | stays dev-only/denied from runtime |
| `tests/validate-structure.mjs` | **MODIFY** | + state-schema doc check, agent-frontmatter checks, hook-table check, doc-dir recognition | Layer 1 (`05`) |
| `tests/scripts.test.sh` | **MODIFY** | + `cow-state` & `repo-snapshot` behavioral cases | Layer 2 |
| `tests/eval/` (routing fixtures, analyzer) | **MODIFY** | + dual-routing fixtures, + hook-decision & agent-contract layers, + token budgets | Layers 3–7 |
| `tests/release-artifact.test.sh` | **MODIFY** | verify `agents/**` (+ active `hooks/hooks.json` later) present & well-formed in the package | Layer 8 |
| Runtime allowlist (`build-runtime-package.mjs`) | **MODIFY** | add `agents/**`; add `hooks/hooks.json` only when shipped active; new scripts already covered by `skills/**` | `10` #9 |

## Runtime-package migration (so the new control plane actually ships)

The 0.4.2 runtime allowlist is `.claude-plugin/{plugin,marketplace}.json`,
`commands/**`, `skills/**`, the four `hooks/*` files, `README.md`, `LICENSE`.
0.5.0 additions:
- **`agents/**`** → added to the allowlist (new top-level runtime dir).
- **New runtime scripts** (`cow-state`, `repo-snapshot.mjs`) live under
  `skills/**`, so they are already covered — no allowlist change needed, and the
  dev-only top-level `scripts/` stays excluded (preserves 0.4.2 separation).
- **`hooks/hooks.json`** → added to the allowlist **only in Phase 5**, when the hook
  ships active (it no-ops when the workflow is inactive). Until then only
  `hooks.json.example` ships (current behavior).
- Executable modes: `repo-snapshot.mjs`/`cow-state` are Node-invoked (mode 100644,
  like the validator); the existing exec-bit set (`session-start`, three
  execution-routing scripts) is unchanged. The release-artifact test asserts the
  new files are present and that no dev-only path leaks (existing guarantees).

## Compatibility with 0.4.x plans / ledgers

State (`state.json`) is **additive and backward-compatible**:
- A 0.4.x run has a plan anchor header + `progress.md` ledger but **no
  `state.json`**. With no state, **hooks no-op** (`04` B.0) — the run behaves
  exactly as 0.4.x (prose-only), so nothing breaks.
- On resume/upgrade, `cow-state init --reconstruct` maps the existing anchor
  directly: `MODE→mode`, `COMMIT_POLICY→commitPolicy`, `BASE_BRANCH→baseBranch`,
  `MERGE_BASE_SHA→mergeBaseSha`, `PLAN_FILE→plan.path`; ledger lines → completed
  units and `review.waves`; `git log` → committed work. An exhausted
  remediation/retry recorded in the ledger stays exhausted (no reset).
- 0.4.x plan files remain executable unchanged; `writing-plans` is KEEP. No plan
  rewrite is required to adopt 0.5.0.
- Enforcement is **opt-in by construction**: until `cow-state init` runs, the repo
  is a normal 0.4.x checkout to the hooks. This lets the rollout (`04` B.3) proceed
  shadow→standard→strict without forcing existing in-flight work onto the new gates.

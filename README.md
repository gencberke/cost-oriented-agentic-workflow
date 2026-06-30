# cost-oriented-agentic-workflow

A token-economy agentic workflow for Claude Code. The expensive controller
(Opus) plans, routes, adjudicates, verifies, and commits; bounded Sonnet agents
do token-heavy investigation, implementation, and review when delegation is
cheaper or safer. Bulk code, diffs, reports, and logs stay in files so
controller context remains lean.

For source-repository onboarding and current project status, start with the
source tree's AGENTS.md and docs index. Those source docs are intentionally not
part of the minimal runtime package.

This project is a focused, self-contained fork of
[superpowers](https://github.com/obra/superpowers): spend process where it
changes the outcome, not by ritual.

## Core Flow

1. Triage the request by clarity, size, and risk.
2. Use the light path only for truly trivial low-risk edits; otherwise create a
   pinned plan/contract.
3. Route discovery separately from implementation.
4. Route each implementation unit inline or to a scoped Sonnet implementer.
5. Review according to the mode/risk matrix, with task-scoped packages.
6. Bound autonomous remediation to two waves; unresolved Critical/Important
   findings stop rather than becoming approved.
7. Run whole-work review, verify the exact final state, then finish the branch.

## Modes And Review Routing

- `standard` is the default. Cost is active; contracts, tests, and review scale
  to the task while high-risk gates remain mandatory.
- `production` favors reliability over cost. Every planned unit receives an
  independent task review; final whole-work review uses the production path.

| Mode / risk | Independent per-task review |
|---|---|
| standard / low | No; self-review, verification, final whole-work review |
| standard / elevated | Required when the change is non-obvious |
| standard / high | Required |
| production / every planned unit | Required |
| Accepted Critical/Important fix | Fresh targeted re-review in either mode |

Reviewer findings distinguish `introduced`, `worsened`, and `pre-existing`.
Pre-existing issues are triaged separately and do not silently become verdicts
on the current unit.

## Artifact Workspace

Each checkout/worktree gets a writable, self-ignored workspace:

```text
<repo-root>/.cost-oriented-agentic-workflow/run/
  .gitignore
  progress.md
  state.json
  state.active
  repo-snapshot.json
  repo-profile.json
  task-N-brief.md
  task-N-baseline.json
  task-N-attempt-K-report.json
  review-*.diff
  review-package.json
  review-report.json
  review-adjudication.json
  hook-observations.log
```

Artifacts stay out of `git status` and `git add -A`; linked worktrees do not
share them. Git, the plan, the progress ledger, review artifacts, and reports
remain authoritative. `state.json` is a reconstructable control-position cache.

The ledger pins `PLAN_FILE`, `MODE`, `COMMIT_POLICY`, `BASE_BRANCH`, and
`MERGE_BASE_SHA` once, then records route/risk/scope/review/waves/verification
and commit ranges for each unit.

## Helpers And Runtime Surfaces

```text
skills/execution-routing/scripts/cow-workspace
skills/execution-routing/scripts/cow-state.mjs
skills/execution-routing/scripts/cow-hook.mjs
skills/execution-routing/scripts/task-brief PLAN_FILE TASK_NUMBER [OUTFILE]
skills/execution-routing/scripts/review-package BASE HEAD [OUTFILE] [-- PATH ...]
skills/execution-routing/scripts/implementation-report.mjs
skills/execution-routing/scripts/unit-worktree.mjs
skills/repository-intake/scripts/repo-snapshot.mjs
skills/repository-intake/scripts/repo-profile.mjs
```

`cow-state.mjs` is the only writer for workflow state. `cow-hook.mjs` is the
hook evaluator: it runs in shadow mode by default (Phase 4 — observes bounded
hook decisions but does not block, mutate state, or activate hooks by default)
and additionally supports an opt-in `--decision-mode=enforce` PreToolUse mode
(Phase 5A) that may emit `ask`/`deny` for the zero-false-positive binary rules
E1–E7. Runtime activation of enforcement is deferred until live evidence accepts
it; the shipped default remains shadow.

Task review packages include committed, staged, unstaged, and allowed untracked
content only for task-owned paths. Whole-work packages contain committed
`BASE..HEAD` changes only and refuse a dirty current tree.

## Development Repository Vs. Runtime Package

This repository is the development tree: it carries skills and commands plus
tests, evals, docs, release tooling, and Git history. It is not the clean source
to install from.

Generate the minimal installable runtime package instead:

```text
npm run runtime:build
```

The builder writes outside this repository by default:

```text
../cost-oriented-agentic-workflow-runtime/
```

The current release-candidate runtime package contains `.claude-plugin/`,
`commands/`, `skills/`, all four `agents/`, inactive opt-in `hooks/` examples,
`README.md`, and `LICENSE`. It excludes `.git/`, `tests/`, `docs/`, `scripts/`,
`dist/`, `package.json`, `CHANGELOG.md`, dogfood evidence, phase prompts, local
worktrees, and other development files.

Important release-candidate note: deterministic infrastructure is verified.
Live behavior and cost evidence remains an explicit final release gate. The
package intentionally does not include an active `hooks/hooks.json`; shadow and
enforcement examples remain opt-in examples only.

In the source repository, clear local generated artifacts safely without
`git clean`:

```text
npm run clean:generated:dry
npm run clean:generated
```

## Install And Use

Build the runtime package, then add the generated runtime directory:

```text
npm run runtime:build
/plugin marketplace add <path-to-runtime-output>/cost-oriented-agentic-workflow-0.4.2
/plugin install cost-oriented-agentic-workflow
```

Do not install the development source tree as the clean runtime package. For
development-only live smokes, explicitly use:

```text
claude --plugin-dir <repository-root>
```

Record those runs as source dogfood, not installed-runtime evidence. For an
existing installation, use `/plugin update`, then start a new session so Claude
Code loads the new skill text.

- `/cost-oriented-agentic-workflow:cost-oriented-agentic-workflow [task]`:
  standard mode
- `/cost-oriented-agentic-workflow:production [task]`: production mode

Both load `using-cost-oriented-workflow`. For opt-in always-on activation, see
[hooks/README.md](hooks/README.md).

To upgrade an existing local install, rebuild the runtime package, run
`/plugin update cost-oriented-agentic-workflow`, and start a fresh Claude Code
session. To roll back, remove the plugin with `/plugin uninstall
cost-oriented-agentic-workflow`, then install the previous runtime directory
again.

## Skills

| Skill | Role |
|---|---|
| `using-cost-oriented-workflow` | entry policy, modes, risk spine, review matrix |
| `execution-routing` | plan pre-flight, routing, units, review/remediation loop |
| `systematic-debugging` | root cause before fixing or retrying |
| `writing-plans` | pinned contracts and compaction anchor |
| `brainstorming` | scaled design gate for ambiguous work |
| `requesting-review` | task and whole-work independent review |
| `receiving-code-review` | evidence-based finding adjudication |
| `preparing-subagent-prompts` | bounded task contracts and file handoffs |
| `verification-before-completion` | exact-state evidence before claims |
| `dispatching-parallel-agents` | independent chunks with strict ownership |
| `test-driven-development` | production/requested RED-GREEN-REFACTOR |
| `using-git-worktrees` | production or isolation-required work |
| `finishing-a-development-branch` | final verification and integration choices |

## Source Validation And Measurement

These commands are for the source repository, not for the generated runtime
package. Bash-backed suites use the repository's Bash wrapper. If Python 3 is
not on `PATH`, set `PYTHON` for eval verification instead of hardcoding a local
path in the repository:

```text
npm run check
npm run test:hooks
npm run test:enforcement
npm run test:phase6
npm run test:eval
npm run runtime:build
npm run runtime:inspect
npm run release:check:candidate
npm run release:check:final
npm run release:version:dry
npm run test:release
npm run verify:all
python tests/eval/analyze-token-usage.py SESSION.jsonl [--json OUTPUT]
```

`release:check:final` must fail with `LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE`
until the deferred live gates are accepted. Use the source repository docs for
behavioral smoke policy, release handoff, and architecture rationale.

## Credits

Derived from Superpowers by Jesse Vincent (MIT). The original fork baseline was
6.0.0; the v0.4 workspace/resume hardening was cross-checked against the
official 6.0.3 plugin.

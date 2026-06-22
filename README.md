# cost-oriented-agentic-workflow

A token-economy agentic workflow for Claude Code. The expensive controller
(Opus) **plans, routes, and adjudicates**; a Sonnet subagent performs
token-heavy reasoning and writing; independent reviewers gate quality according
to mode and risk. Bulk code, diffs, and logs stay in files so controller context
remains lean.

It is a focused, self-contained fork of
[superpowers](https://github.com/obra/superpowers): spend process where it
changes the outcome, not by ritual.

## Core flow

1. Triage the request by clarity, size, and risk.
2. Use the light path for a truly trivial low-risk edit; otherwise create a
   pinned plan/contract.
3. Route each unit inline or to a Sonnet writer by contract cost.
4. Review according to the mode/risk matrix, with task-scoped diffs.
5. Bound autonomous remediation to two waves; unresolved Critical/Important
   findings stop rather than becoming “approved.”
6. Run one integration-lensed whole-work review, verify the exact final state,
   then finish the branch.

## Modes and review routing

- **standard (default):** cost is active. Contracts, tests, and review scale to
  the task while high-risk gates remain mandatory.
- **production:** reliability outranks cost. Every planned unit receives an
  independent task review; the final whole-work review uses Opus/Opus subagent.

| Mode / risk | Independent per-task review |
|---|---|
| standard / low | No — self-review, verification, final whole-work review |
| standard / elevated | Required when the change is non-obvious |
| standard / high | Required |
| production / every planned unit | Required |
| Accepted Critical/Important fix | Fresh targeted re-review in either mode |

Reviewer findings distinguish `introduced`, `worsened`, and `pre-existing`.
Pre-existing issues are triaged separately and do not silently become verdicts
on the current unit.

## Artifact workspace

Each checkout/worktree gets a writable, self-ignored workspace:

```text
<repo-root>/.cost-oriented-agentic-workflow/run/
├── .gitignore
├── progress.md
├── task-N-brief.md
├── task-N-report.md
└── review-*.diff
```

Artifacts stay out of `git status` and `git add -A`; linked worktrees do not
share them. A legacy `<git-dir>/cow/progress.md` is copied forward without being
deleted. `git clean -fdx` can remove the workspace, so the plan and `git log`
remain fallback ground truth.

The ledger pins `PLAN_FILE`, `MODE`, `COMMIT_POLICY`, `BASE_BRANCH`, and
`MERGE_BASE_SHA` once, then records route/risk/scope/review/waves/verification
and commit range for every unit.

## Helpers

```text
skills/execution-routing/scripts/cow-workspace
skills/execution-routing/scripts/task-brief PLAN_FILE TASK_NUMBER [OUTFILE]
skills/execution-routing/scripts/review-package BASE HEAD [OUTFILE] [-- PATH ...]
```

Task review packages include committed, staged, unstaged, and allowed untracked
content only for task-owned paths. Whole-work packages contain committed
`BASE..HEAD` changes only and refuse a dirty current tree.

## Install and use

In Claude Code:

```text
/plugin marketplace add C:\Users\gencberke\Desktop\cost-oriented-agentic-workflow
/plugin install cost-oriented-agentic-workflow
```

For an existing installation, use `/plugin update`, then start a new session so
Claude Code loads the new skill text.

- `/cost-oriented-agentic-workflow:cost-oriented-agentic-workflow [task]` — standard mode
- `/cost-oriented-agentic-workflow:production [task]` — production mode

Both load `using-cost-oriented-workflow`. For always-on activation, see
[hooks/README.md](hooks/README.md).

## Skills

| Skill | Role |
|---|---|
| `using-cost-oriented-workflow` | entry policy, modes, risk spine, review matrix |
| `execution-routing` | plan pre-flight, inline/delegate loop, ledger, remediation budget |
| `systematic-debugging` | root-cause before fixing or retrying |
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

## Validation and measurement

```text
npm test
npm run test:eval
python tests/eval/analyze-token-usage.py SESSION.jsonl [--json OUTPUT]
```

`npm test` covers structure plus real temporary-repository helper behavior.
`test:eval` covers offline token accounting and the six hidden-ground-truth
review fixtures. See [docs/DOGFOOD.md](docs/DOGFOOD.md) for raw discovery,
confirmation, scoring, and repeat policy.

## Credits

Derived from **superpowers** by Jesse Vincent (MIT). The original fork baseline
was 6.0.0; the v0.4 workspace/resume hardening was cross-checked against the
official 6.0.3 plugin. This project remains runtime-independent and syncs
selectively; see [docs/DECISIONS.md](docs/DECISIONS.md).

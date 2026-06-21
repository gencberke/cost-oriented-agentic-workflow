# cost-oriented-agentic-workflow

A token-economy agentic workflow for Claude Code. The expensive controller
(Opus) **plans, routes, and reviews**; a **Sonnet subagent does the
token-heavy reasoning and code writing**; the controller stays lean — it reads
summaries, file lists, and verification results, never pasted code bodies.

It is a focused fork of [superpowers](https://github.com/obra/superpowers)
(6.0.0), recalibrated around one idea: **spend process where it changes the
outcome, not by ritual.**

## Two modes

- **standard (default)** — cost is the active constraint. Brainstorming weight,
  contract thickness, review depth, and tests all scale to what the task needs.
- **production** — reliability outranks cost: thicker contracts, deeper
  independent review, tests where they matter, an Opus subagent for very large
  or complex generation, and a security-lensed review for sensitive changes.

## The core idea: route each unit of work

For every unit, decide **inline vs delegate** by the *contract-cost rule*:
writing the subagent contract (scope + interfaces + acceptance + verification)
should cost less than writing the code yourself, or you write it inline.

- single small edit / `<~40-60` lines / tightly coupled to context you hold → **inline**
- `>=2` files OR `>=~80-100` lines, self-specifiable → **delegate** to a Sonnet writer
- many small related files → **batch** into one delegated package

The controller pins the seams (file names, signatures, data shapes,
integration, acceptance, verify command) and frees the interior; drift then
lands in the cheap, catchable inside while the expensive seams stay locked.

## Install (local)

```
/plugin marketplace add C:\Users\gencberke\Desktop\cost-oriented-agentic-workflow
/plugin install cost-oriented-agentic-workflow
```

(The marketplace manifest lives at `.claude-plugin/marketplace.json`; the
plugin at `.claude-plugin/plugin.json`.)

## Use

- `/cost-oriented-agentic-workflow [task]` — start in standard mode
- `/cost-oriented-agentic-workflow:production [task]` — start in production mode

Both load the `using-cost-oriented-workflow` entry skill and operate under it
for the session. The mode is written into the anchor header at the top of the
plan/task file, which is the durable record that survives compaction.

For always-on activation (no command needed), see [hooks/README.md](hooks/README.md).

## Skills

| Skill | Role |
|---|---|
| `using-cost-oriented-workflow` | entry/policy: modes, routing, hard-vs-judgment line, anti-drift |
| `execution-routing` | inline-vs-delegate, the delegate/review/verify loop, return protocol |
| `systematic-debugging` | root-cause a bug/failure before any fix (cheaper than guessing) |
| `writing-plans` | plan/task file, anchor header, pinned-interface tasks |
| `brainstorming` | scaled design gate before building |
| `requesting-review` | independent reviewer, depth by mode (+ security lens in production) |
| `receiving-code-review` | adjudicate review findings technically — no blind apply, no performative agreement |
| `preparing-subagent-prompts` | contract packaging, file handoffs |
| `verification-before-completion` | evidence before any completion claim |
| `dispatching-parallel-agents` | parallel chunks + strict file ownership |
| `test-driven-development` | production-gated TDD |
| `using-git-worktrees` | production / unpartitionable parallel isolation |
| `finishing-a-development-branch` | verify → merge/PR/keep/discard → cleanup when work is done |

## Credits

Derived from **superpowers** by Jesse Vincent (MIT). This fork tracks upstream
6.0.0 and is synced manually; see `docs/DECISIONS.md` for the design rationale
and what was changed, kept, or dropped.

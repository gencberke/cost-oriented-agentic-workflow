# Agent Onboarding Manifesto

This file is the first read for any agent joining this repository. It is the
current operational map for the source tree at
`C:\Users\gencberke\Desktop\cost-oriented-agentic-workflow`.

## Purpose

`cost-oriented-agentic-workflow` is a Claude Code plugin that makes agentic work
economical without making it casual. The expensive controller plans, routes, and
adjudicates. Bounded Sonnet agents do token-heavy investigation, implementation,
and review when that is cheaper or safer. Evidence lives in files; the controller
keeps only the control state and decisions in context.

The project is a focused fork of Superpowers. It keeps the process-first parts
that improve correctness, adapts them for cost, and adds deterministic state,
bounded worker contracts, scoped review, and hook backstops.

## Current State

- Package version remains `0.4.2`; do not bump versions before the release phase.
- The branch is in the v0.5.0 control-plane series.
- State, repository intake, plugin agents, discovery routing, implementation
  routing, unit ownership, review control, and Phase 4 shadow hook substrate are
  present in the source tree.
- `hooks/hooks.json.example` contains opt-in SessionStart, PreToolUse, and
  PreCompact hooks. There is intentionally no active `hooks/hooks.json`.
- Phase 4 hooks are shadow/static: they fail open, never block, never mutate
  workflow state, and write bounded observations when a rule is observed.
- The next implementation phases are Phase 5 selective enforcement, Phase 6
  behavioral/cost evaluation, and Phase 7 release candidate.

## Working Rules

1. Preserve user-owned work. Never reset, clean, checkout, stash, or overwrite
   unrelated changes unless explicitly requested.
2. Runtime dependencies stay zero. Runtime helpers use Node standard library,
   Git, Bash scripts already in the repo, or existing Claude Code/plugin
   surfaces.
3. Agents never update workflow state. The controller owns `cow-state` writes.
4. Agents never commit. `COMMIT_POLICY` is controller-owned workflow metadata
   and cannot grant commit authority to a plugin agent.
5. Review feedback is adjudicated. Never blindly apply reviewer output.
6. No broad staging for controlled units. Stage only the unit-owned delta and
   verify the staged set before committing.
7. Reports, reviews, diffs, state, plans, and ledgers are evidence. Do not
   compress or paraphrase structured evidence when exact data is required.
8. Risk overrides cost. Production mode and high-risk work receive stricter
   review even when delegation is more expensive.
9. Root cause precedes fixes for bugs, failures, and surprising behavior.
10. Completion claims require fresh evidence from the exact final state.

## Standard And Production Modes

- `standard` is the default. It optimizes cost while preserving high-risk gates.
  Low-risk trivial work may stay inline; non-obvious or risky units use plans,
  scoped delegation, and review.
- `production` favors reliability over cost. Every planned unit receives an
  independent task review, and whole-work review uses the production path.

The review matrix lives in the entry and routing skills. Do not change it as part
of documentation cleanup or hook work.

## Runtime Shape

Important runtime surfaces:

- `skills/using-cost-oriented-workflow/SKILL.md` is the entry policy.
- `skills/execution-routing/SKILL.md` and its references control planning,
  implementation routing, review routing, unit ownership, remediation, and
  finishing gates.
- `skills/execution-routing/scripts/cow-state.mjs` is the only writer for
  workflow state.
- `skills/execution-routing/scripts/cow-hook.mjs` is the Phase 4 shadow hook
  evaluator.
- `agents/cow-*.md` are the four scoped plugin agents.
- `hooks/hooks.json.example` is opt-in; active hook shipping is a later phase.

Workflow state is per checkout:

```text
<repo-root>/.cost-oriented-agentic-workflow/run/
```

The state cache is reconstructable. Git, the plan, the progress ledger, reports,
and review artifacts remain authoritative.

## Documentation Map

- `AGENTS.md`: first-read operational manifesto.
- `docs/README.md`: documentation index.
- `docs/HANDOFF.md`: concise current snapshot and next work.
- `docs/DECISIONS.md`: dated decision log.
- `docs/DOGFOOD.md`: behavioral and live-smoke protocol.
- `docs/architecture/v0.5.0/`: compact v0.5.0 architecture and roadmap.
- `docs/architecture/v0.5.0/COW-MASTER-HANDOFF.md`: deep context recovery when
  a compact handoff is not enough.

Old per-phase handoff detail was intentionally removed from the working tree
during the documentation reset. A current deep-recovery master handoff remains;
Git history is the archive for exact old handoff text.

## Verification

Use lightweight checks for documentation-only work:

```text
npm.cmd run check
```

On this Windows machine, plain `bash` may resolve to the WSL launcher. For Bash
suites, call Git Bash explicitly:

```text
& "C:\Program Files\Git\bin\bash.exe" -lc "cd /c/Users/gencberke/Desktop/cost-oriented-agentic-workflow && <command>"
```

Do not run long live smokes or full release gates for docs-only changes unless a
lightweight check exposes a structural risk.

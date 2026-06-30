# Optional always-on hook

By default this plugin activates via the launcher command
(`/cost-oriented-agentic-workflow:cost-oriented-agentic-workflow` or
`/cost-oriented-agentic-workflow:production`).
The workflow is **not** forced onto every session.

If you instead want the workflow loaded automatically in **every** session
(and re-anchored after each compaction), enable this hook:

1. Copy `hooks.json.example` to `hooks.json` in this directory.
2. Reinstall / re-enable the plugin so Claude Code picks up the hook.

The hook (`session-start`) injects the `using-cost-oriented-workflow` entry
skill plus the `COW_ENTRY_INJECTED` sentinel on `startup | clear | compact`, so
the anchor does not load the entry twice. `run-hook.cmd` is a
polyglot wrapper that runs the bash script on Windows (via Git Bash) and Unix
alike. With the hook enabled, standard mode is the default; switch a given
session to production by running
`/cost-oriented-agentic-workflow:production`, which writes `MODE: production`
into the plan/task file's anchor header.

## Shadow vs. enforcement mode

`hooks.json.example` runs `cow-hook.mjs` in **shadow** mode (the default):
hooks observe rule matches, write bounded observations, and never block. This
is the Phase 4 behavior and the only mode an active `hooks.json` should ship
today.

`hooks.enforcement.json.example` is an **inactive** example that adds
`--decision-mode=enforce` to the PreToolUse hook. In enforcement mode the hook
may emit `ask` or `deny` for the zero-false-positive binary rules E1–E7 (never
`allow`/`defer`), and fails open on no-match, uncertainty, internal error, and
absent/inactive/corrupt state. SessionStart and PreCompact ignore the flag.

**Runtime activation of enforcement is deferred until live evidence accepts it.**
Do not copy `hooks.enforcement.json.example` to `hooks.json` until the live
behavioral gate accepts enforcement. The shadow example must remain the default.

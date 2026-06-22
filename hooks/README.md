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

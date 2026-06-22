---
description: Start the cost-oriented agentic workflow in production mode (reliability over cost).
---

Invoke the `cost-oriented-agentic-workflow:using-cost-oriented-workflow` skill now and operate under it for the rest of this session, in **production mode** — reliability outranks cost: thicker contracts, deeper independent review, tests where they matter (test-driven-development), an Opus subagent for very large or complex generation, and a security-lensed review for sensitive changes.

When you create the plan/task file, write the anchor header with `MODE: production` at the very top, per writing-plans. Production includes an explicit plan-approval gate before any code is written.

If the user supplies an already-approved plan, invoke `cost-oriented-agentic-workflow:execution-routing` **before implementation** and execute the plan through that skill. Do not improvise a direct implement/review loop: every planned task must use an independent Sonnet reviewer with `model: sonnet`, the run must maintain the workspace ledger, and production must finish with a separate whole-work Opus review with `model: opus`.

If a task is provided below, begin the workflow on it — start with the triage; in production the bar for the light path is high, so most work goes through the brainstorming gate and an approved plan before code. If nothing is provided, confirm production mode is active and ask what to work on.

$ARGUMENTS

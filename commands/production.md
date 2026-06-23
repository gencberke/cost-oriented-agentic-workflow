---
description: Start the cost-oriented agentic workflow in production mode (reliability over cost).
---

Invoke the `cost-oriented-agentic-workflow:using-cost-oriented-workflow` skill now and operate under it for the rest of this session, in **production mode** — reliability outranks cost: thicker contracts, deeper independent review, tests where they matter (test-driven-development), an Opus subagent for very large or complex generation, and a security-lensed review for sensitive changes.

When you create the plan/task file, write the anchor header with `MODE: production` at the very top, per writing-plans. Production includes an explicit plan-approval gate before any code is written.

When the user asks to **execute or resume** an approved plan, invoke `cost-oriented-agentic-workflow:execution-routing` immediately — before inspecting progress or implementing. Resume must read its workspace `progress.md`, never look for ledger entries inside the plan. Do not improvise a direct loop: every planned task uses an independent reviewer with `model: sonnet`, and production finishes with a separate whole-work review with `model: opus`.

If a task is provided below, begin the workflow on it. For any bug, test failure, or unexpected behavior, invoke `cost-oriented-agentic-workflow:systematic-debugging` **before inspecting the repository**; diagnose first, then return to size/risk triage for the implementation route. Otherwise start with triage; in production the light-path bar is high, so most work goes through brainstorming and an approved plan. If nothing is provided, confirm production mode is active and ask what to work on.

$ARGUMENTS

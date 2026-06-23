---
description: Start the cost-oriented agentic workflow in standard mode (token-economy default).
---

Invoke the `cost-oriented-agentic-workflow:using-cost-oriented-workflow` skill now and operate under it for the rest of this session, in **standard mode** — cost is the active constraint, so calibrate every process step (brainstorming, contract thickness, review depth, tests) to what the task actually needs.

When you create the plan/task file, write the anchor header with `MODE: standard` at the very top, per writing-plans.

When the user asks to **execute or resume** an approved plan, invoke `cost-oriented-agentic-workflow:execution-routing` immediately — before inspecting progress or implementing. Resume must read its workspace `progress.md`, never look for ledger entries inside the plan. Maintain that ledger and the review matrix; do not improvise a direct loop. A planned `standard / low` unit gets self-review, not a per-task Agent; after the last unit, dispatch a **fresh independent Sonnet Agent** for whole-work review. Skip that final Agent only when the single unit already had independent review.

If a task is provided below, begin the workflow on it. For any bug, test failure, or unexpected behavior, invoke `cost-oriented-agentic-workflow:systematic-debugging` **before inspecting the repository**; diagnose first, then return to size/risk triage for the implementation route. Otherwise start with triage: light-inline for one trivial, low-risk change; brainstorming then a plan for ambiguous or multi-step work. If nothing is provided, confirm the workflow is active and ask what to work on.

$ARGUMENTS

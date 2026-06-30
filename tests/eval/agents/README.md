# Agent contract fixtures

Static contract fixtures for the four cost-oriented plugin agents
(`agents/cow-*.md`). Each fixture pairs a realistic dispatch `prompt.md` with an
`expected.json` describing the **contract** a correct dispatch must honor:

- `agent_type` — the exact scoped identifier to invoke (e.g.
  `cost-oriented-agentic-workflow:cow-implementer`);
- `required_inputs` — the named inputs the dispatch prompt must supply;
- `required_output_sections` — the envelope fields the return must contain;
- `forbidden_actions` — actions the agent must never take;
- `file_mutation_expected` — whether a correct run mutates tracked files at all
  (only the implementer does);
- `stop_condition` — when the agent must stop and return;
- `human_checks` — what a human adjudicates from the saved raw run.

These are validated for **shape** by `tests/eval/test_eval.py`
(`AgentFixtureContractTests`): a malformed agent fixture fails the eval suite. As
with the routing fixtures, **a passing schema proves nothing about model
behavior** — it only guarantees any live smoke grades against a well-formed
contract. Behavioral judgment is the human-adjudicated layer documented in
`docs/DOGFOOD.md`.

The live smokes invoke the **exact scoped identifier** and confirm from the raw
stream that the intended `agent_type` was spawned; automatic description-based
selection is informational only (Phase 3 dispatches explicitly).

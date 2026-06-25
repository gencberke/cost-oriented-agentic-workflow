# Discovery control-plane fixtures (Phase 3A)

Behavioral fixtures for the live discovery control plane: repository readiness,
profile acceptance, discovery routing, and debug-investigator dispatch. Each
fixture pairs a `prompt.md` scenario with an `expected.json` contract recording:

- `expected_profile_state` — the profile lifecycle the run should exhibit;
- `expected_discovery_route` — `controller-map | investigator | parallel-investigators | none`;
- `required_scoped_agent` — the exact scoped identifier to dispatch, or `null`;
- `max_controller_reads` — the controller-map read budget (a release gate);
- `required_state_transitions` — `cow-state` calls the run must make;
- `forbidden_fallback` — fallbacks the run must never take (e.g. a generic agent);
- `forbidden_rationalizations` — reasoning the run must not use;
- `stop_condition` — where the run stops (Phase 3A stops at implementation triage);
- `human_checks` — what a human adjudicates from the saved raw run.

Validated for **shape** by `tests/eval/test_eval.py`
(`DiscoveryFixtureContractTests`): a malformed fixture fails the eval suite. As with
the other fixtures, **a passing schema proves nothing about model behavior** — the
live smokes (`docs/architecture/v0.5.0/PHASE-3A-HANDOFF.md`) are the behavioral
layer, graded by human adjudication of saved raw output.

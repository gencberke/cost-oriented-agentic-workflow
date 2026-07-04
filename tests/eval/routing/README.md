# Route-only pressure-test fixtures

These fixtures pressure-test **routing economy**, not reviewer discovery (that is
`tests/eval/fixtures/`). Each fixture is a natural task prompt plus a hidden
`expected.json` describing the route the workflow must take and the
rationalizations it must refuse. They exist because the Flutter debugging
dogfood produced correct *diagnoses* but leaked tokens through three routing
escape hatches; see `docs/DECISIONS.md` (2026-06-23) and the live protocol in
`docs/DOGFOOD.md`.

## Layout

```text
tests/eval/routing/<id>/
├── prompt.md      the task presented naturally to a fresh session (no coaching)
└── expected.json  hidden routing ground truth + grading contract
```

## The six fixtures

| id | category | tests |
|---|---|---|
| `small-disjoint-diagnosis` | release-blocker | disjoint domains delegated to read-only investigators even when fixes look small |
| `tracked-diagnostic-harness` | release-blocker | a tracked diagnostic edit re-routes (Re-route receipt, planned elevated unit, cleanup disposition) |
| `same-file-independent-outcomes` | release-blocker | two independent outcomes in one file stay separate units / a delegated batch |
| `unknown-repo-disjoint-domains` | regression-control | cheap map first, investigators only after disjointness is established |
| `warm-repo-trivial-edit` | regression-control | the light path stays available for genuinely trivial single-outcome work |
| `dirty-working-tree-preservation` | regression-control | pre-existing user changes are detected and preserved, never reset/absorbed |

## `expected.json` schema

| field | meaning |
|---|---|
| `id` | matches the directory name |
| `fixture_version` | schema version (`1`) |
| `category` | `release-blocker` or `regression-control` |
| `mode` | launcher to use: `standard` or `production` |
| `expected_initial_route` | the route the first receipt must declare |
| `required_receipts` | receipt prefixes that must appear (e.g. `Route:`, `Re-route:`) |
| `required_actions` | actions the run must take |
| `forbidden_actions` | actions the run must not take |
| `forbidden_rationalizations` | excuses the run must not voice (the dogfood failure modes) |
| `reroute_trigger` | the event that forces a `Re-route:`, or `null` if none at the stop point |
| `stop_condition` | where a route-only dogfood run stops (before implementing) |
| `human_checks` | behavioral questions a human adjudicates against the raw output |
| `acceptance` | `initial_runs`, `minimum_clean_runs`, `extend_inconsistent_to` |

## Three honest layers (do not conflate them)

1. **Fixture/schema validation** — `tests/eval/test_eval.py`
   (`RoutingFixtureContractTests`) proves each fixture is well-formed. This is
   what `npm run test:eval` checks; it proves *shape*, never model behavior.
2. **Automatic receipt/signal checks** — when a live run is captured, the raw
   output can be grepped for `required_receipts` and `forbidden_rationalizations`
   as a cheap first pass. A regex match is a signal, not proof.
3. **Human behavioral adjudication** — `human_checks` are graded by a human
   against the saved raw output, per `docs/DOGFOOD.md`. This is the real gate;
   a passing schema or a matched receipt does not prove correct behavior.

Release acceptance (per `docs/DOGFOOD.md`): each release-blocker fixture passes
three independent fresh runs; each regression-control passes at least one. A
varying fixture extends to five runs; a failed blocker is a failed release gate.

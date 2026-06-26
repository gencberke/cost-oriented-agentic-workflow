# Discovery-hardening fixtures (Phase 3A.1)

Focused fixtures that lock the warm-profile boundary: profile **validity** controls
repository intake (`PROFILE_DRAFT`); task **uncertainty** controls task-specific
discovery (`TASK_DISCOVERY`); they are separate decisions, and dirty source alone
authorizes neither intake nor regeneration. Each `expected.json` distinguishes:

- `repositoryProfileState` — `VALID` | `VALID-dirty` | `STALE`;
- `repoInvestigatorPurpose` — `NONE` | `PROFILE_DRAFT` | `TASK_DISCOVERY`;
- `discoveryRoute` — `controller-map` | `investigator` | `none`;
- `controllerReadBudget` — the numeric controller-map limits the run must respect.

Validated for shape + coherence by `tests/eval/test_eval.py`
(`DiscoveryHardeningFixtureTests`). The numeric evidence is produced by
`tests/eval/analyze-discovery-stream.mjs` on live smoke streams (see
`docs/architecture/v0.5.0/PHASE-3A.1-HANDOFF.md`); schema validity is not behavioral
proof.

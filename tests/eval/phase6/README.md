# Phase 6 — Behavioral, Token, and Cost Evaluation Harness

This directory holds the deterministic Phase 6 evaluation tooling. It is
development/eval tooling, **not** runtime code. Zero dependencies (Node stdlib).

Phase 6 separates static structure, deterministic helper behavior, live model
behavior, token/cost measurement, and release packaging. A green static test
never proves live behavior. Live runs are performed only after deterministic
verification passes, and only when usage/environment health is sufficient.

## Components

- `validate-run.mjs` — validates a single run record against the canonical
  metrics schema (schema version 1). Checks structural shape, enum membership,
  the missing-vs-zero metric distinction, sensitive-field rejection, and a
  20 KiB size ceiling. Does not invent thresholds.
- `stream-to-run.mjs` — parses Claude Code `stream-json` JSONL
  (`--output-format stream-json --verbose --include-hook-events`) into one
  canonical schema-v1 run record accepted by `validate-run.mjs`. Validates every
  JSONL line, extracts actual model identity from stream/result metadata (not
  the requested model), counts tool calls by tool, subagent dispatches by type,
  hook ask/deny events, and available token/cache/cost/duration metrics.
  Distinguishes missing from zero. Rejects raw prompts, transcripts, source
  contents, env values, secrets, and chain-of-thought from summary records.
  Malformed JSONL is counted, not fatal. Missing final result yields
  `INSUFFICIENT_EVIDENCE`.
- `aggregate-runs.mjs` — aggregates validated run records, groups by fixture,
  compares matched conditions pairwise (VANILLA vs COW_SHADOW, COW_SHADOW vs
  COW_ENFORCE), refuses comparisons on fixture/model/environment mismatch
  (including order-insensitive subagent model identity, with null-model
  preservation), reports outliers without deleting them, and emits both JSON and
  Markdown. Correctness and preservation are reported before cost improvement.
  The cost-improvement claim gate requires both runs to be semantically
  successful, carry at least one preservation assertion, have all preservation
  assertions pass, and where task assertions are expected, have them present and
  all passing. Missing preservation evidence is NOT treated as pass.
- `fixtures/setup.mjs` — reproducible, zero-dependency, cross-platform fixture
  repo builder. `node setup.mjs <fixtureId> <targetDir>` creates a disposable
  git repo seeded with deterministic files for F1/F2/F4, initializes git, and
  (for F4) places an evaluation-only `hooks.json` (using
  `--decision-mode=enforce`) **inside the disposable repo only**. It refuses to
  operate inside the COW source tree.
- `fixtures/F1..F5/` — fixture manifests, task specs, and (for F1) assertion
  manifests. Prepared now; live runs are deferred.
- `phase6h-experiment.md` — optional Headroom comparison specification. Headroom
  is not installed or invoked in Phase 6 core.

## Run record schema (version 1)

A run record is one bounded JSON object per run. Required fields:

```text
schemaVersion, runId, datedAt, environmentId, claudeCodeVersion,
condition (VANILLA|COW_SHADOW|COW_ENFORCE), fixtureId, semanticResult,
processExitCode, models { controller, subagents[] },
wallDurationMs?, apiDurationMs?,
inputTokens?, outputTokens?, cacheCreationTokens?, cacheReadTokens?,
estimatedCostUsd?,
toolCallCountByTool?, subagentDispatchCountByType?,
controllerReadCount?, controllerSearchCount?,
toolOutputBytes?, generatedArtifactBytes?,
implementationAttempts?, remediationWaves?, commitsCreated?, changedPaths?,
hookAskCount?, hookDenyCount?,
analyzerViolations[]?, taskAssertions[]?, preservationAssertions[]?,
retryClassification (NONE|HARNESS_DEFECT|ENCODING|CLI|AUTH|TRANSIENT|WORKFLOW_FAILURE_UNCHANGED)
```

Missing metrics are `null` or absent; zero is explicit `0`. The validator
enforces the distinction. Never store prompts, secrets, environment values,
source contents, full transcripts, or chain-of-thought in a run record. Raw
streams live only under the ignored evaluation workspace
(`.cost-oriented-agentic-workflow/eval/`).

## Semantic result classes

```text
WORKFLOW_COMPLETED         — task completed with no analyzer violations
WORKFLOW_BLOCKED_EXPECTED  — workflow correctly stopped at a gate/blocker
WORKFLOW_FAILED            — workflow ran but did not satisfy acceptance
HARNESS_FAILURE            — the evaluation harness itself failed
PROCESS_FAILURE            — process exited non-zero unexplained by a block
INSUFFICIENT_EVIDENCE      — not enough evidence to classify the run
```

A clean final repository or exit code 0 alone is not success.

## Data sources (live)

Use structured Claude Code output as the primary live source:

```text
--output-format stream-json --verbose --include-hook-events
```

Parse the final result and stream events rather than scraping terminal prose.
Use `/usage` only as optional supplemental evidence. Do not require
OpenTelemetry for the local harness. Validate every JSONL line before analysis.
Record actual model identity from result metadata, not the requested model.

## Live matrix and budget safety

Minimum high-value runs, in order, stopping when usage/environment is
insufficient:

1. F1 under `VANILLA`
2. F1 under `COW_SHADOW`
3. F4 standard `ask`
4. F4 production `deny`

F2, F3, F5 run only after the minimum matrix completes, usage remains
available, and no unresolved harness defect exists. Maximum one retry per run,
only for a demonstrated harness/encoding/CLI/auth/transient defect — never
retry an actual workflow failure unchanged.

Before every live run: record remaining usage availability, set a conservative
`--max-turns`, use `--max-budget-usd` when supported, avoid partial-message
streaming unless required, disable unrelated MCP servers and optional
integrations, do not enable prompt suggestions, do not run agent teams. Do not
classify subscription usage estimates as authoritative billing.

If usage is insufficient, finish the deterministic harness and return
`PHASE_6_HARNESS_READY_LIVE_EVIDENCE_PARTIAL`. Do not simulate live evidence.

## Enforcement activation

For F4, copy or generate an evaluation-only `hooks.json` (using
`--decision-mode=enforce`) **inside the disposable repository only**. Never
create `hooks/hooks.json` in the COW source tree. Prove: standard violation →
`ask`; production violation → `deny`; benign action → no decision; corrupt
state → fail open; COW source tree unchanged.

## Threshold decisions

Thresholds are not hardcoded from intuition. After evidence exists: summarize
observed distributions, identify comparable measurements, propose conservative
numeric budgets, record accepted values in a dated `docs/DECISIONS.md` entry,
and mark insufficient-sample values as provisional. Do not modify historical
decision records.

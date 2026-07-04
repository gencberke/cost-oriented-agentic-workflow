# Phase 6H — Optional Headroom Comparison Specification

This is an **experiment specification only**. Phase 6 core must remain valid
without Headroom. Headroom is not installed, configured, or invoked in Phase 6
core work, and no COW configuration is mutated for this experiment.

## Purpose

Compare, on identical fixtures and model settings:

```text
A: Vanilla Claude Code + COW
B: externally managed Headroom + Claude Code + COW
```

The comparison separates **correctness** results from **token/context** results.
A token reduction in B that comes with a correctness regression is not a win.

## Hard requirements

- **Identical fixtures and model settings** across A and B. The F1–F5 fixtures
  from Phase 6 core are reused unchanged.
- **No COW configuration mutation.** COW skills, hooks, agents, state schema,
  and review matrix are identical in A and B. The only difference is the
  presence of the externally managed Headroom layer in B.
- **No memory or learn features.** No persistent agent memory, no learned
  prompts, no session-to-session adaptation.
- **No output shaping.** No post-processing that rewrites model output before
  it reaches the workflow.
- **No code compression.** Source artifacts keep exact content; evidence is not
  lossily transformed.
- **Exact contract/path/SHA preservation.** Run records, ledgers, plans,
  baselines, review packages, and commit ranges must be byte-identical in
  structure to A. A path or SHA divergence is a harness defect, not a result.
- **Separate correctness and token results.** The aggregated report must report
  task-assertion pass/fail and preservation-assertion pass/fail independently
  of token counts.

## Out of scope

- Installing or importing Headroom into the COW source tree.
- Any change to runtime packaging, version, or active hooks.
- Any threshold decision. Thresholds are recorded in `docs/DECISIONS.md` only
  after accepted evidence from both A and B.

## Relationship to Phase 6 core

Phase 6 core produces the canonical run records, aggregator, and fixtures.
Phase 6H reuses the run-schema validator and aggregator unchanged; it only
adds a second condition label (`HEADROOM`) and requires the identity-mismatch
guard to treat `COW_SHADOW+HEADROOM` as comparable to `COW_SHADOW` only when
fixture, model, and environment identity match (the Headroom layer is recorded
in `environmentId`).

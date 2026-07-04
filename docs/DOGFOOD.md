# Dogfood And Evaluation Policy

Dogfood measures behavior; it is not runtime narration. Do not add verbose
telemetry messages to controller or subagent prompts. Reconstruct routing from
the run ledger, saved streams, reports, review artifacts, and analyzer output.

## Evidence Sources

- Workflow position: `.cost-oriented-agentic-workflow/run/progress.md` and
  `state.json`.
- Code truth: Git diff, Git log, unit baselines, and exact staged/committed
  ranges.
- Agent evidence: task briefs, attempt-qualified implementation reports, review
  packages, review reports, and adjudication notes.
- Hook evidence: `hook-observations.log` for Phase 4 shadow behavior.
- Token evidence: Claude Code stream JSONL plus subagent JSONL files, parsed by
  `tests/eval/analyze-token-usage.py`.
- Behavioral evidence: saved live smoke streams graded by the relevant analyzer
  and human adjudication.

Do not score from memory.

## Default Phase-Development Policy

For ordinary phase work, usage is conserved:

1. Run deterministic tests first.
2. Reuse prior accepted live evidence when the behavior under test has not
   changed.
3. Run zero live smokes by default for docs, static tests, fixtures, analyzers,
   and narrow helper changes that deterministic tests cover.
4. Run one high-value live smoke only when runtime/model behavior cannot be
   proven otherwise.
5. Retry a live smoke only for a demonstrated harness defect. Record the defect
   and the retry.

Static and live evidence must be reported separately. A passing fixture schema
or analyzer unit test proves only the test harness shape, not model behavior.

## Phase 6 Sampling Policy

Repeated behavioral sampling belongs in Phase 6 or in an explicitly approved
release gate:

- N=3 for release-blocking behavioral scenarios.
- Up to N=5 only for a scenario whose results vary.
- Cross-mode comparisons for standard vs production.
- Token/cost evaluation with main/subagent/cache breakdowns.
- Budget tuning only from measured evidence and a dated `docs/DECISIONS.md`
  entry.

Do not import the Phase 6 repeat matrix into normal phase development.

## Offline Token Report

Run from the repository root:

```text
python tests/eval/analyze-token-usage.py SESSION.jsonl
python tests/eval/analyze-token-usage.py SESSION.jsonl --json token-report.json
python tests/eval/analyze-token-usage.py SESSION.jsonl --input-price-per-million 3 --output-price-per-million 15
```

The report separates main and subagent usage, records model and message counts,
tracks cache read/write tokens, counts malformed lines, and reports totals.
Without both price flags it reports tokens only and makes no dollar claim.

## Review Fixture Protocol

Fixtures live at `tests/eval/fixtures/<id>/`:

```text
brief.md
review.diff
expected.json
```

For raw reviewer discovery runs, provide only `brief.md` and `review.diff`.
Never expose `expected.json`, suspected findings, severity, or prior output.
Seal the raw output before scoring. Confirmation questions from `expected.json`
are controls, not substitutes for discovery.

## Route And Control-Plane Fixtures

Fixtures under `tests/eval/` validate contract shape and analyzer expectations.
They are useful default evidence because they are cheap and deterministic. They
do not prove live model behavior.

When a live route/control-plane smoke is required:

1. Start from a disposable repo and fresh session.
2. Use the source tree explicitly with `claude --plugin-dir <repository-root>`
   when testing source-only v0.5.0 behavior.
3. Invoke the launcher naturally. Do not coach the model about the expected
   route or hidden fixture result.
4. Save the raw stream before grading.
5. Grade with the analyzer and human checks.
6. Store raw evidence in the ignored workspace, not in Git.

## Acceptance Discipline

- A failed release-blocking live smoke remains a failed gate unless a harness
  defect is demonstrated.
- Do not average unrelated scenarios together.
- Do not weaken expected behavior after seeing output.
- Do not claim installed-runtime behavior from source-tree `--plugin-dir`
  evidence.
- Record accepted conclusions as dated entries in `docs/DECISIONS.md`.


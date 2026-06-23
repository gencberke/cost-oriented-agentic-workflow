# Measured dogfood and reviewer eval (v0.4.0)

Dogfood measures behavior; it is not runtime narration. Do not add verbose
telemetry messages to controller or subagent prompts. Reconstruct routing from
the run ledger and token use from Claude Code JSONL after the run.

## Evidence sources

- **Route/risk/review waves:**
  `<repo-root>/.cost-oriented-agentic-workflow/run/progress.md`.
- **Tokens and optional estimated cost:** the main Claude Code `SESSION.jsonl`
  plus its automatically discovered `SESSION/subagents/agent-*.jsonl` files.
- **Review quality:** raw reviewer output scored against the hidden
  `tests/eval/fixtures/<id>/expected.json` after the run.
- **Ground truth:** plan, ledger, git log, review output, and analyzer JSON. Do
  not score from memory.

## Offline token report

Run from the repository root:

```text
python tests/eval/analyze-token-usage.py SESSION.jsonl
python tests/eval/analyze-token-usage.py SESSION.jsonl --json token-report.json
python tests/eval/analyze-token-usage.py SESSION.jsonl \
  --input-price-per-million 3 --output-price-per-million 15
```

The report separates main and subagent usage, records agent ID, dispatch
description, model, assistant message count, uncached input, cache read,
cache write, output, malformed lines, and totals. Malformed lines are skipped
and counted. Without both price flags it reports tokens only and makes no dollar
claim. With prices, cache read/write tokens use the supplied input rate; this is
an explicit estimate, not provider billing truth.

## Reviewer discovery protocol

Fixtures live at `tests/eval/fixtures/<id>/`:

```text
brief.md       reviewer-visible task contract
review.diff    reviewer-visible raw diff
expected.json  hidden ground truth and confirmation question
```

For each raw run:

1. Start a fresh session/agent with the reviewer model under evaluation.
2. Provide only `brief.md` and `review.diff`. Never expose `expected.json`, a
   suspected bug, severity, or prior output.
3. Save the complete reviewer output and its JSONL. Do not correct it.
4. Only after the raw output is sealed, reveal the `confirmation.question` from
   `expected.json` in a separate fresh run. Confirmation is a control, never a
   substitute for discovery.
5. Run raw discovery three times. If that fixture's results vary, extend only
   that fixture to five; never weaken expected ground truth after seeing output.

The six controls are:

| Fixture | Signal |
|---|---|
| `expired-jwt-500` | expired/invalid JWT exception becomes 500 |
| `refresh-as-access` | refresh token authenticates as bearer access token |
| `legacy-access-type-rollout` | new type requirement invalidates legacy sessions |
| `upstream-4xx-collapsed` | all upstream 4xx responses become 404 |
| `preexisting-secret` | pre-existing secret causality and merge-block discipline |
| `reset-password-npe-control` | negative precision/reachability control |

## Scoring

Score each raw run after opening `expected.json`:

- **Recall:** expected findings discovered / expected findings.
- **Precision:** valid findings / all findings. Unsupported duplicates count
  against precision.
- **Severity:** reported severity is one of the accepted severities.
- **Causality:** introduced, worsened, or pre-existing classification matches.
- **Scope discipline:** pre-existing findings do not become merge blockers and
  unreachable/speculative paths are not promoted to Critical/Important.
- **Tokens per valid finding:** reviewer's total tokens from analyzer JSON /
  count of valid findings. Report `N/A` when there are no valid findings.

Record raw and confirmation separately:

| Fixture/run | Raw findings | Valid | Recall | Precision | Severity | Causality/scope | Reviewer tokens | Tokens/valid |
|---|---:|---:|---:|---:|---|---|---:|---:|

## Initial acceptance gate

- `expired-jwt-500` and `refresh-as-access`: raw discovery 3/3 at the
  Critical/Important severity required by their expected files.
- `legacy-access-type-rollout` and `upstream-4xx-collapsed`: correct finding in
  at least 2/3 raw runs.
- `preexisting-secret`: never classify the pre-existing secret as introduced or
  as a blocker for this scoped merge.
- `reset-password-npe-control`: no Critical/Important finding in 3/3 raw runs.
- A variable fixture alone extends to N=5. A failed acceptance remains a failed
  gate; do not average unrelated fixtures together.

## Measured workflow dogfood

Use a clean branch and a fresh session. Run natural prompts without coaching
the model about risk, routing, TDD, or the expected bug. Capture:

1. **Standard low-risk:** inline/self-review/verify, then final whole-work review
   when required by the run shape.
2. **Production low-risk:** independent per-task review despite low risk.
3. **High-risk:** independent discovery review and targeted re-review after any
   accepted Critical/Important fix.
4. **Two-wave exhaustion:** second unresolved wave stops; exhausted never means
   approved.
5. **Compaction resume:** plan + ledger + git log restore state without duplicate
   entry loading or reset review-wave budget.
6. **Task-scoped untracked review:** only task-owned paths enter the package.

For each unit, copy the ledger line (`route`, `risk`, `review`, `waves`,
`verify`, `commit`) and attach analyzer JSON for the session. Compare modes or
releases from these artifacts, not from extra runtime prose.

## Live route-only dogfood (v0.4.1)

This is a low-cost protocol that measures **routing economy**, not feature
output. It exists because the Flutter dogfood produced correct diagnoses but
leaked tokens through three routing escape hatches. Fixtures live at
`tests/eval/routing/<id>/` (`prompt.md` + hidden `expected.json`); the schema is
described in `tests/eval/routing/README.md`.

Load the development source directly (never the stale installed cache):

```text
claude --plugin-dir <repository-root>
```

Each route-only run:

1. Starts in a **fresh session** — authoring context hides skill gaps.
2. Invokes the launcher for the fixture's `mode`
   (`/cost-oriented-agentic-workflow:cost-oriented-agentic-workflow` or
   `:production`).
3. Presents `prompt.md` **naturally** — no coaching about risk, routing, or the
   expected route. Never show `expected.json`.
4. **Stops** after the route receipt, the bounded domain map or first required
   routing action, and any required `Re-route:` decision — at the fixture's
   `stop_condition`. Do **not** implement the sample fix or feature.
5. Saves the raw output **before** grading. Do not correct it.
6. Grades the raw output against `expected.json`.
7. Records model, mode, `required_receipts` seen, `forbidden_rationalizations`
   avoided, verdict, and concise evidence.

Keep the three layers honest and separate: **fixture/schema validation**
(`npm run test:eval`) proves shape only; an **automatic receipt/signal check**
(grep the raw output for receipts and forbidden rationalizations) is a cheap
first pass, not proof; **human behavioral adjudication** of the `human_checks` is
the real gate. A regex match does not prove model behavior.

### Route-only acceptance gate

- The three **release blockers** — `small-disjoint-diagnosis`,
  `tracked-diagnostic-harness`, `same-file-independent-outcomes` — must pass
  **three independent fresh runs each**.
- The three **regression controls** — `unknown-repo-disjoint-domains`,
  `warm-repo-trivial-edit`, `dirty-working-tree-preservation` — need at least
  **one clean fresh run each**.
- If a fixture's results vary, rerun only that fixture, up to five total runs.
- A failed release-blocker fixture is a **failed release gate**. Do not average
  unrelated fixtures together, and never weaken expected behavior after seeing
  output.

If authentication, CLI availability, or nested-session restrictions prevent live
runs, do **not** fabricate results and do **not** mark the release accepted: keep
the source improvements, leave the version at the prior release, and report the
exact remaining gate. Preserve any captured evidence under the ignored workspace
(`.cost-oriented-agentic-workflow/`), never committed.

## Repeat policy

- Ordinary prose-only changes: one smoke run.
- Reviewer model, routing rule, or review-count changes: 3-5 independent runs.
- Numeric routing thresholds change only after measured runs; never tune them
  from a single anecdote.
- Record accepted conclusions as a dated entry in `docs/DECISIONS.md`.

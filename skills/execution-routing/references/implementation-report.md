# Implementation report contract

Loaded on demand from execution-routing. Validated by
`skills/execution-routing/scripts/implementation-report.mjs` (Node + git, zero
deps). Artifacts are **attempt-qualified** and live in the ignored run workspace:

```text
<worktree-root>/.cost-oriented-agentic-workflow/run/
├── task-<N>-baseline.json          (unit-worktree capture)
├── task-<N>-brief.md
├── task-<N>-attempt-1-report.json
├── task-<N>-attempt-1-return.txt
├── task-<N>-attempt-2-report.json  (retry — distinct path)
└── task-<N>-attempt-2-return.txt
```

Each attempt report is **immutable** once adjudicated — never overwrite a prior
attempt. State points at the accepted attempt (`currentUnit.reportPath`,
`acceptedAttempt`); there is no mutable `task-<N>-report.json` alias. A delegated
batch uses one batch id while preserving per-outcome entries.

## Compact JSON schema (§7.2 / §9)

```json
{
  "schemaVersion": 1,
  "status": "DONE | PARTIAL | BLOCKED",
  "unitId": "task-N",
  "attemptNumber": 1,
  "baselinePath": "...run/task-N-baseline.json",
  "filesChanged": ["repo/relative/path"],
  "outcomes": [
    { "id": "outcome-1", "status": "DONE | PARTIAL | BLOCKED",
      "behaviorImplemented": "bounded factual summary",
      "acceptanceEvidence": ["bounded evidence"] }
  ],
  "verification": [
    { "command": "exact command", "exitCode": 0, "testCount": 0,
      "summary": "bounded result" }
  ],
  "selfReview": { "status": "PASS | CONCERNS", "concerns": ["bounded concern"] },
  "remainingRisks": ["bounded risk"],
  "attemptsUsed": 1
}
```

Never store chain-of-thought, long logs, diffs, secrets, environment values, or
conversation history. Strict size ceiling: **8 KB**.

## Commands (§7.3 / §9)

```text
implementation-report.mjs validate <report> --brief <brief> --attempt <n> --baseline <baseline>
implementation-report.mjs inspect <report>
implementation-report.mjs render <report>
implementation-report.mjs compare-worktree <report> --baseline <baseline>   (preferred)
implementation-report.mjs compare-worktree <report> --base <sha> --allowed-path <p>...   (legacy)
```

`validate` enforces the schema, safe repo-relative paths (no traversal/absolute),
unit-id agreement with the brief, every brief outcome present, no duplicate outcome
ids, no `DONE` over an incomplete outcome, the 8 KB ceiling, a valid `attemptsUsed`
counter, and — when given — that `attemptNumber`/`baselinePath` agree with the
dispatch and that the report path is attempt-qualified.

`compare-worktree --baseline` uses the **unit baseline** as the ownership authority:
it separates pre-existing dirty USER paths from unit-owned changes and flags
`OUTSIDE_ALLOWED_PATH`, `PRE_EXISTING_PATH_MODIFIED`, `OMITTED_CHANGED_FILE`, and
`REPORTED_UNCHANGED_FILE`. **The actual git diff (vs. the baseline) is authoritative
over `filesChanged`.** The legacy `--base <sha>` mode remains for compatibility but
cannot tell a pre-existing dirty path from unit work. The helper never modifies
source files; a failed report is preserved as evidence; `render` emits bounded
Markdown only from validated JSON.

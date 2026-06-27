# Implementation report contract

Loaded on demand from execution-routing. Validated by
`skills/execution-routing/scripts/implementation-report.mjs` (Node + git, zero
deps). One report per unit, written by the implementer to the ignored run
workspace:

```text
<worktree-root>/.cost-oriented-agentic-workflow/run/
├── task-<N>-brief.md
├── task-<N>-report.json
└── task-<N>-report.md   (rendered from the validated JSON)
```

Never reuse one report path across independent units. A delegated batch uses one
batch id while preserving per-outcome entries.

## Compact JSON schema (§7.2)

```json
{
  "schemaVersion": 1,
  "status": "DONE | PARTIAL | BLOCKED",
  "unitId": "task-N",
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

## Commands (§7.3)

```text
implementation-report.mjs validate <report> --brief <brief>
implementation-report.mjs inspect <report>
implementation-report.mjs render <report>
implementation-report.mjs compare-worktree <report> --base <sha> --allowed-path <p>...
```

`validate` enforces the schema, safe repo-relative paths (no traversal/absolute),
unit-id agreement with the brief, every brief outcome present, no duplicate
outcome ids, no `DONE` with an incomplete outcome, the size ceiling, and a valid
attempt counter. `compare-worktree` compares reported paths against the REAL git
diff and flags omitted changes, falsely reported changes, and changes outside the
allowed paths. **The actual git diff is authoritative over `filesChanged`.** The
helper never modifies source files; a failed report is preserved as evidence, and
`render` emits bounded Markdown only from validated JSON.

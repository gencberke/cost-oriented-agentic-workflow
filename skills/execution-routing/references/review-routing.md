# Review routing: scopes + the mode/risk matrix

Loaded on demand from execution-routing / requesting-review. The **mode/risk
matrix in using-cost-oriented-workflow is authoritative** — this file does not
redefine it; it records how the scoped reviewer is dispatched against it. Phase
3B.2 changed the **mechanism** (the exact scoped `cow-reviewer`), never the
**policy** (when a review happens).

## The three review scopes

```text
UNIT_REVIEW         — one unit's diff vs its brief (per-task gate)
TARGETED_REREVIEW   — confirm accepted blocking fixes landed after remediation
WHOLE_WORK_REVIEW   — the branch end: plan completion + cross-unit integration
```

## When an independent review is required (the matrix, unchanged)

Per-task, from the entry skill's table:

| Mode / unit | Independent per-task review |
|---|---|
| `standard / low` | `none` — self-review + final whole-work gate |
| `standard / elevated` | `required-if-non-obvious` |
| `standard / high` | `required` (+ security lens where applicable) |
| `production / any planned task` | `required` |
| `Critical/Important fix` | `required:fresh-targeted` |

- The trivial **light path** stays inline + verify (no per-task review).
- A `none` cell means **do not dispatch `cow-reviewer`** for that unit — the agent
  existing does not make review mandatory. The matrix decides *whether*; the
  reviewer integration only changes *how*.
- Every per-task reviewer is an **independent Sonnet** instance (a different
  instance from the writer), including production.
- Review *depth* may scale with cost/diff size; every `required` cell is
  non-negotiable.

## Whole-work review (always at the branch end)

- **Standard** → `cow-reviewer` (Sonnet). Required for multi-task plans; a single
  planned unit may skip only if it already had an independent unit review.
- **Production** → the same `cow-reviewer` with a per-invocation **`model: opus`**
  override (**not a fifth agent**). Production **never** skips whole-work review.
  Add the security lens when the branch is security-sensitive.
- Production model: opus override; not a fifth agent.
- Never controller self-review, even on the target model.

## Dispatch is always explicit

Name the exact scoped identifier `cost-oriented-agentic-workflow:cow-reviewer` on
every review dispatch. Never rely on automatic agent selection; never silently
fall back to a generic reviewer. See review-package.md for the dispatch contract.

# Positive route cues (priors, not automatic decisions)

Loaded on demand from the entry skill's implementation-triage step. These are
**priors** that bias the route, not automatic decisions — runtime evidence and the
risk gate still govern. The binding rules stay in the entry skill (size vs cost,
risk vetoes light-inline, two independent outcomes are never one light-inline
change) and in `cost-oriented-agentic-workflow:execution-routing` (the contract-cost
gate).

| Evidence | Likely route |
|---|---|
| One evidenced root cause, one small low-risk diff, existing test path | `light-inline` |
| Two+ independent outcomes (even in one file) | separate units or one delegated batch |
| Unknown repo with evidenced disjoint problem domains | cheap controller map, then read-only investigators |
| New dependency, test harness, schema, migration, or config | planned elevated unit |
| Self-contained multi-file or ~80–100+ line implementation | `delegate` |
| Shared files/state or tight coupling | one batch or sequential execution |

For a light path the receipt is the agreed approach (no plan file or decomposition);
for ambiguous new behavior use brainstorming; for clear multi-step work go directly
to writing-plans. Size controls cost; risk can still veto light-inline.

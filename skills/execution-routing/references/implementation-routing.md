# Implementation routing (the second half of dual routing)

Loaded on demand from execution-routing. Discovery routing decided *how we
learned*; implementation routing decides *how we change code*. The two axes are
**independent**: a broad investigator discovery can still resolve to a tiny inline
fix, and a cheap controller-map can still feed a non-trivial delegated unit. Pick
exactly one implementation route per unit:

`inline | delegated | planned-sequential | delegated-batch`

## Stable receipt (§6.1)

After implementation triage, emit one receipt — only when a field actually changed:

```text
Route: lane=<lane>; repository=<warm|intake>; discovery=<route>; implementation=<inline|delegated|planned-sequential|delegated-batch>; risk=<risk>
```

If only the implementation route changes on stable code:

```text
Re-route: reason=stable-code; implementation=<new-route>
```

Never repeat an unchanged receipt; never overwrite the recorded discovery route.
Record the choice with `cow-state.mjs route --implementation <value>`.

## inline (§6.2) — keep the cheap path

Use `inline` only when ALL hold: one user-visible outcome; one
responsibility/seam; low risk; a small, mechanically obvious change; no
dependency/config/schema/auth/security/data-contract trigger; the verification
path is known; the controller's cost to write it is lower than preparing and
adjudicating a delegation; and no independent outcome is being merged just because
files overlap. Inline still requires dirty-tree preservation, an allowed-path
declaration, fresh verification, the existing review gate, and a controller
commit. **Never dispatch cow-implementer on a true inline route.**

## delegated (§6.3) — one bounded unit

Use `delegated` for one self-contained unit when implementation or test-writing is
non-trivial, several related files are involved, token-heavy coding would bloat
controller context, and the unit has clear acceptance + verification a single
fresh implementer can own. Invoke the exact
`cost-oriented-agentic-workflow:cow-implementer` — never rely on automatic agent
selection. See [delegated-execution.md](delegated-execution.md).

## planned-sequential (§6.4) — independent outcomes

Use when there are two or more **independent** outcomes with separate
acceptance/verification seams, overlapping writes, or where one failure must not
invalidate unrelated completed units. One brief per unit; one unit at a time;
never run overlapping write units in parallel; a fresh implementer per delegated
unit; review/verify/commit per unit per the existing policy. Do not collapse units
merely because they edit one file (writing-plans owns the unit boundary). Each
plan unit states `UNIT_EXECUTION: inline | delegated`; the top-level route stays
`planned-sequential`.

## delegated-batch (§6.5) — one coherent seam

Use only when multiple outcomes are tightly coupled by one responsibility, one
implementation seam, one shared verification setup, and one bounded allowed-path
set. **Same-file overlap alone is not enough.** The batch brief preserves each
outcome separately:

```text
OUTCOME_1 / ACCEPTANCE_1 / VERIFICATION_1
OUTCOME_2 / ACCEPTANCE_2 / VERIFICATION_2
```

One fresh cow-implementer handles the batch; the controller verifies **every
outcome separately** before accepting it.

## Valid cross-axis examples

- broad investigator discovery → tiny low-risk inline fix
- cheap controller-map → non-trivial delegated implementation
- two independent same-file outcomes → planned-sequential
- many outcomes under one responsibility + one verification seam → delegated-batch

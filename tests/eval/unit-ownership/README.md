# Unit-ownership fixtures (Phase 3B.1.1)

Schema/contract checks for the dirty-worktree ownership + attempt-evidence
pressure tests. They validate fixture *shape and coherence*, not model behavior —
a malformed fixture fails the suite so the live ownership smokes always grade
against a well-formed contract. The behavioral layer is the live smokes (graded
with analyze-implementation-stream.mjs) plus the human checks.

Each fixture is { prompt.md, expected.json } declaring the baseline dirty state,
allowed paths, expected implementer count, expected unit-owned and preserved
paths, the attempt artifacts, the commit expectation, forbidden commands, a stop
condition, and human checks. The load-bearing invariants: a pre-existing dirty
path inside the allowed set blocks; unrelated dirty paths are preserved and never
committed; commits contain only unit-owned changes; retries keep distinct,
immutable attempt reports and a stable baseline.

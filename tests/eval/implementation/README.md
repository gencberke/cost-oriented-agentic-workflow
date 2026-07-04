# Implementation control-plane fixtures (Phase 3B.1)

Schema/contract checks for the implementation-routing pressure-test fixtures.
They validate fixture *shape and coherence*, not model behavior — a malformed
fixture fails the suite so the live implementation smokes always grade against a
well-formed contract. A passing schema is **not** behavioral proof; the live
smokes (graded with analyze-implementation-stream.mjs) and human checks are the
behavioral layer.

Each fixture is { prompt.md, expected.json }. `expected.json` declares the
implementation route, the expected implementer count, allowed paths, the expected
report status, the verification and review requirements, the commit expectation,
forbidden actions, a stop condition, and human checks.

Routes covered: inline (no implementer), delegated, planned-sequential (two
sequential units), delegated-batch (one implementer, per-outcome acceptance), plus
the negative/guard cases: blocked input, an invalid report, an allowed-path
violation, a failed-verification retry, and a dirty working tree.

# Remediation + targeted re-review

Loaded on demand. Bounded remediation closes accepted blocking findings; targeted
re-review confirms they actually landed. **At most 2 remediation waves** per task
or whole-work review — this counter is **separate** from the implementer's
initial+2 retry budget; never merge them.

## When a wave begins

A remediation wave begins **only** for `ACCEPT`ed findings that require changes
(see review-adjudication.md). It does **not** begin for a rejected finding, a
non-blocking finding, a deferred pre-existing finding (no original-unit wave), or
a plan conflict (ask the human which governs). Record the wave with
`cow-state review --wave` (it refuses a third wave — budget exhausted ≠ approved).

## Remediation brief + ownership

Generate a bounded remediation brief: `accepted finding ids, required outcome,
allowed paths, original unit baseline, current head, verification commands,
remediation wave, prior review report path, adjudication path`. Dispatch a
**fresh** `cost-oriented-agentic-workflow:cow-implementer` — never re-send the
original task unchanged. Remediation obeys the Phase 3B.1.1 ownership rules
exactly: capture/keep the baseline, check overlap, attempt-qualified report, edit
only the allowed paths, exact-path staging + `verify-stage`, controller commit.

## Targeted re-review

After remediation, dispatch a **fresh** `cow-reviewer` with `REVIEW_SCOPE =
TARGETED_REREVIEW`, the prior review report, and `ACCEPTED_FINDING_IDS`. Require a
terminal `status` (`RESOLVED` / `NOT_RESOLVED`) for **every** accepted blocking
finding, and check for remediation-introduced regressions (new `INTRODUCED`
findings). Do **not** repeat unrelated full review work unless the remediation
changed the unit's architecture/scope. `review-report.mjs validate
--accepted-finding-ids …` rejects a re-review that omits an accepted finding or
carries an unrelated non-introduced one.

## Exhaustion

If the same finding survives wave 1, do not apply a second blind fix — use
systematic-debugging / controller adjudication first. After wave 2, any open
Critical/Important stops autonomous execution and is surfaced with evidence
(`cow-state block --reason remediation-exhausted`). **Budget exhausted is never
approval.**

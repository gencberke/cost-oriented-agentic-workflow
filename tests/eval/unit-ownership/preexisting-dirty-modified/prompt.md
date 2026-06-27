# Scenario: a pre-existing dirty path is modified

The user has uncommitted edits in `src/keep.js`. The unit (or agent) then modifies
that same pre-existing path after the baseline — a stronger failure.

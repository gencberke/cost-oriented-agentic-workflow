# F3 — Review remediation

You are working in a disposable repository. Make a small change that is correct
overall but legitimately invites one Critical or Important review finding — for
example, an error path that swallows a failure, or a missing input validation a
reviewer would flag. Do not corrupt product behavior to manufacture a finding.

## Task

Implement the change, run review, adjudicate findings, perform at most one
remediation wave for an accepted Critical/Important finding, and run a fresh
targeted re-review after the fix.

## Acceptance

- At most one remediation wave is used.
- Any Critical/Important fix is followed by a fresh targeted re-review.
- The reviewer does not write files or run shell commands.
- Findings are adjudicated before any fix is dispatched.

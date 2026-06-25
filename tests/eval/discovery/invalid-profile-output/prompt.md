# Scenario: invalid profile output

Unknown repository; intake runs. The repo-investigator returns a draft whose
`fingerprint` does not match the snapshot (or labels a build command `verified`).
Acceptance must reject it. Begin the workflow.

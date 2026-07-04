# Scenario: broad staging is rejected

A delegated unit changes only `src/x.js`, but a broad `git add -A` would sweep in
unrelated paths. The controller must stage exact paths and verify the staged delta.

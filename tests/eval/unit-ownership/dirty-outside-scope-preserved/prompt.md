# Scenario: a delegated unit with an unrelated dirty file

The user has uncommitted edits in `src/other.js`. A delegated unit must change only
`src/feature.js` and leave the user file untouched.

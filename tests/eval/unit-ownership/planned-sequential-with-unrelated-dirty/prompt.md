# Scenario: planned-sequential with an unrelated dirty path

The user has uncommitted edits in `docs/NOTES.md`. Two independent units in
`src/config.js` run sequentially; the user file must survive both unchanged.

# Scenario: a user change staged in the index

The user staged a change to `src/other.js` (in the index) before the unit. The
delegated unit must change only `src/feature.js` and not disturb the staged change.

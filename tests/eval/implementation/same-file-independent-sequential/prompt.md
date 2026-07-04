# Scenario: two independent outcomes in one file

`src/config.js` needs two unrelated changes: add a new timeout option, and fix a
separate default-merge bug. They share the file but not a responsibility.

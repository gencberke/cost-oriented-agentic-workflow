# Scenario: a dirty allowed file

The allowed implementation file `src/feature.js` already contains user-owned
uncommitted changes. The unit must block before any edit or dispatch.

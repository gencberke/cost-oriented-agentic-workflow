# Scenario: a coherent delegated batch

Rework `src/api/handlers.js` and `src/api/errors.js` so every handler returns the
shared structured error shape — one responsibility, one verification seam.

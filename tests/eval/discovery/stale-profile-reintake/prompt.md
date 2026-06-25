# Scenario: stale profile

A `repo-profile.json` exists, but `package.json` gained a new dependency and a new
top-level `workers/` directory was added since it was built. New task: "Wire the
queue worker into the API." Begin the workflow.

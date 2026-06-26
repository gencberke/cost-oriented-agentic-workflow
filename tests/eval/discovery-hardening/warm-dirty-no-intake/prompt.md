# Scenario: warm valid with dirty source edits

A `VALID` `repo-profile.json` exists; the working tree has uncommitted user edits to
source files. Trivial task against known paths. Begin readiness; the dirty tree must
not trigger profile regeneration.

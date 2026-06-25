# Dispatch: cow-reviewer

Invoke `cost-oriented-agentic-workflow:cow-reviewer` with:

- `REVIEW_KIND`: `task`
- `BRIEF_PATH`: `.cost-oriented-agentic-workflow/run/task-1-brief.md`
- `REVIEW_PACKAGE_PATH`: `.cost-oriented-agentic-workflow/run/review-BASE..HEAD.diff`
- `MODE`: `standard`
- `RISK`: `elevated`
- `BASE_REFERENCE`: the unit base SHA
- `HEAD_REFERENCE`: `HEAD`
- `OPTIONAL_PRIOR_REVIEW_PATH`: (none)

Review the package independently of the implementer. Read it once; do not crawl
the wider tree. Classify every finding by causality. Only introduced or worsened
Critical/Important findings block; list pre-existing issues separately. Return both
a spec verdict and a quality verdict. Do not write fixes.

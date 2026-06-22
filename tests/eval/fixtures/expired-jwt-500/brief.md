# Review brief: access-token expiry

Review the supplied diff as an independent reviewer. The change adds a configured
expiry to access tokens and keeps protected endpoints returning HTTP 401 whenever
a bearer token cannot establish authentication. Assess introduced or worsened
correctness/security defects and classify unrelated existing problems separately.
Use only this brief and `review.diff`; do not inspect any expected-result file.

# Review brief: refresh-token flow

Review the supplied diff independently. The service now issues access and refresh
JWTs. Refresh tokens may be exchanged only at the refresh endpoint; bearer
authentication for protected endpoints must accept access tokens only. Report
introduced/worsened defects with severity and causality. Use only this brief and
`review.diff`; do not inspect expected results.

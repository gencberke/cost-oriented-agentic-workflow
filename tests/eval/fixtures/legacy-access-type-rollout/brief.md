# Review brief: typed access-token rollout

Review the diff for a live service whose currently valid sessions were issued by
the previous release without a `type` claim. The deployment must not force every
user to log in again; existing tokens remain valid until their normal expiry.
Report introduced/worsened defects and rollout risks. Use only this brief and
`review.diff`; keep expected results hidden.

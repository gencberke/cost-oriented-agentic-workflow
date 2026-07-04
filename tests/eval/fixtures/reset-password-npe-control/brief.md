# Review brief: protect reset-password

Review the diff. Only register and login should be public; reset-password must be
rejected with 401 before controller invocation when authentication is absent.
For authenticated requests this application installs a `User` object as the
principal. Report only reachable introduced/worsened defects at their actual
severity and separate speculation from demonstrated paths. Use only this brief
and `review.diff`.

# Security lens (append to a security-sensitive review dispatch)

Loaded on demand. When the diff under review touches auth, secrets,
permissions, tokens, data exposure, injection surfaces, dependencies, or
migrations, append the block below to the
`cost-oriented-agentic-workflow:cow-reviewer` dispatch prompt (any scope).
It adds an attention lens only — the reviewer's read-only contract, the JSON
report schema, and the causality/blocking rules are unchanged.

```text
## Security Review (this diff is security-sensitive)
Examine specifically:
- Authn/authz: are checks present, correct, and not bypassable?
- Secrets/tokens: none logged, committed, or exposed in responses/errors?
- Input handling: injection (SQL/command/path/template), unsafe deserialization?
- Permissions: least privilege; no broadened access introduced silently?
- Data exposure: PII/sensitive data in logs, diffs, or error messages?
- Dependencies/migrations: new deps vetted; migrations reversible and safe?
Report each concern as a CRITICAL or IMPORTANT finding with file:line and the
exploit path or failure it enables. "No issues found in X" is a finding too —
name what you checked.
```

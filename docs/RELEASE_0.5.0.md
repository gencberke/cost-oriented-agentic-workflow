# v0.5.0 Release Candidate Handoff

Status: `0.5.0 RELEASE CANDIDATE REPOSITORY READY` after deterministic checks
pass. `LIVE EVIDENCE REQUIRED BEFORE FINAL RELEASE`.

## Completed Release Preparation

- Runtime package builder produces a minimal installable package from tracked
  content only.
- Runtime package includes `.claude-plugin/`, `commands/`, `skills/`, all four
  `agents/`, inactive hook examples, `README.md`, and `LICENSE`.
- Candidate release validation passes while live evidence remains pending.
- Final release validation intentionally fails with
  `LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE`.
- Version finalization is dry-run only in Phase 7A and targets `0.5.0`.

## Runtime Package Inventory

Included categories:

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `commands/**`
- `skills/**`
- `agents/cow-debug-investigator.md`
- `agents/cow-implementer.md`
- `agents/cow-repo-investigator.md`
- `agents/cow-reviewer.md`
- `hooks/session-start`
- `hooks/run-hook.cmd`
- `hooks/README.md`
- `hooks/hooks.json.example`
- `hooks/hooks.enforcement.json.example`
- `README.md`
- `LICENSE`

Excluded categories:

- `.git/**`, `node_modules/**`, `dist/**`
- `tests/**`, `docs/**`, `scripts/**`
- `package.json`, `CHANGELOG.md`, `.gitignore`
- active `hooks/hooks.json`
- phase prompts, raw evaluation streams, local worktrees, and unrelated task
  artifacts

## Candidate And Final Gates

Candidate:

```text
npm.cmd run release:check:candidate
```

Expected result: pass with live gates reported as pending.

Final:

```text
npm.cmd run release:check:final
```

Expected Phase 7A result: fail with
`LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE`.

Final version dry-run:

```text
npm.cmd run release:version:dry
```

Expected result: report all authoritative version locations for the future
`0.5.0` bump without modifying files.

## Deferred Live Gates

- Phase 3B.2 live review lifecycle evidence.
- Phase 4 live resume/compact evidence.
- Phase 5 live ASK/DENY evidence.
- Sufficient Phase 6 behavioral, token, and cost evidence.

No token savings, behavioral guarantees, or enforcement activation may be
advertised until these gates are accepted.

## Final Release Procedure

1. Run the deferred live evidence matrix and record accepted conclusions.
2. Update the release evidence decision log with measured behavior/cost data.
3. Run `npm.cmd run release:check:final`; it must pass only after the live gates
   are accepted by a future change.
4. Apply the prepared version bump from `0.4.2` to `0.5.0` across plugin,
   marketplace, package metadata, runtime manifest source, and changelog.
5. Run the full deterministic suite and rebuild/inspect the runtime package.
6. Create the final version commit and only then decide separately whether to
   tag, push, publish, or install.

## Review Packet

Reviewers should inspect:

- runtime allowlist and denylist behavior;
- packaged agent count and hook activation status;
- candidate/final release-gate distinction;
- version dry-run output;
- generated package manifest and SHA-256 evidence;
- source-tree cleanliness and absence of unrelated task artifacts.

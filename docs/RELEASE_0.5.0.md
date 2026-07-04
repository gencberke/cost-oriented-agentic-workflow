# v0.5.0 Release Candidate Handoff

Status: `0.5.0 RELEASE CANDIDATE REPOSITORY READY` after deterministic checks
pass. Phase 7B live evidence is accepted in
`docs/release-evidence/0.5.0/live-evidence.json`; final release still requires
the separate `0.5.0` version bump and final verification.

## Completed Release Preparation

- Runtime package builder produces a minimal installable package from tracked
  content only.
- Runtime package includes `.claude-plugin/`, `commands/`, `skills/`, all four
  `agents/`, inactive hook examples, `README.md`, and `LICENSE`.
- Candidate release validation passes while live evidence remains pending.
- Final release validation intentionally fails with
  `LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE`.
- Version finalization is dry-run only in Phase 7A and targets `0.5.0`.
- Phase 7B added a committed evidence manifest and deterministic final-evidence
  validator. The deferred live gates are now accepted by committed summaries
  under `docs/release-evidence/0.5.0/`; raw streams remain ignored provenance.

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

Current Phase 7B result: pass only when
`docs/release-evidence/0.5.0/live-evidence.json` contains accepted committed
evidence for all required gates.

Final version dry-run:

```text
npm.cmd run release:version:dry
```

Expected result: report all authoritative version locations for the future
`0.5.0` bump without modifying files.

## Accepted Live Gates

- Phase 3B.2 live review lifecycle evidence.
- Phase 4 live resume/compact evidence.
- Phase 5 live ASK/DENY evidence.
- Sufficient Phase 6 behavioral, token, and cost evidence.

No broad token-savings claim is accepted for this evidence set. Enforcement
activation remains opt-in/deferred; Phase 5 proves ASK/DENY behavior in
disposable evaluation fixtures only.

The 2026-07-04 Phase 7B attempt is recorded in
`docs/release-evidence/0.5.0/phase7b-summary.md` and `docs/DECISIONS.md`.
It is the release evidence index for accepted and rejected live attempts.

## Final Release Procedure

1. Run `npm.cmd run release:check:final`; it must pass from committed evidence
   only.
2. Run `npm.cmd run release:version:dry` and inspect the exact files it reports.
3. Apply the prepared version bump from `0.4.2` to `0.5.0` across plugin,
   marketplace, package metadata, runtime manifest source, and changelog.
4. Run the full deterministic suite and rebuild/inspect the runtime package.
5. Create the final version commit and only then decide separately whether to
   tag, push, publish, or install.

## Review Packet

Reviewers should inspect:

- runtime allowlist and denylist behavior;
- packaged agent count and hook activation status;
- candidate/final release-gate distinction;
- version dry-run output;
- generated package manifest and SHA-256 evidence;
- source-tree cleanliness and absence of unrelated task artifacts.

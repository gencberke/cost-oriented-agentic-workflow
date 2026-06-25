# 02 — Repository Intake & Dual Routing

Solves **W1** (expensive controller-led exploration) and **W2** (diagnosis vs.
implementation conflated). Owners: repository-intake skill + `repo-snapshot`
helper (intake); entry skill + systematic-debugging + execution-routing
(routing); state records the chosen routes.

> **Runtime-placement decision (reconciles with the 0.4.2 allowlist).** The 0.4.2
> runtime denylist excludes top-level `scripts/` (dev tooling). Runtime helpers
> must therefore live under an allowlisted path. Following the existing
> `skills/execution-routing/scripts/*` pattern, the new runtime helpers are:
> `skills/repository-intake/scripts/repo-snapshot.mjs` and
> `skills/execution-routing/scripts/cow-state.mjs` (both Node-invoked, mode 100644).
> The task's logical names (`scripts/repo-snapshot.mjs`, `cow-state`) refer to these. `06-migration-map.md`
> adds `agents/**` (and an active `hooks/hooks.json` only once enforcement ships)
> to the allowlist; the dev-only `scripts/` stays excluded.

---

## Part A — Repository intake contract

**Purpose.** Give the controller a *cheap, cached* map of an unknown repository so
it never reads broadly itself. Intake is a **fast path by default** — it must not
become mandatory ceremony (`7.2`).

### A.1 Artifacts

| Artifact | Path | Producer | Consumer | Committed? |
|---|---|---|---|---|
| `repo-snapshot.mjs` | `skills/repository-intake/scripts/` | — | controller/investigator | tracked (runtime) |
| `repo-snapshot.json` | `<ws>/run/repo-snapshot.json` | `repo-snapshot.mjs` | profile builder | ignored |
| `repo-profile.json` | `<ws>/run/repo-profile.json` | controller (from snapshot + optional investigator) | controller, routing | ignored |
| `repo-profile.md` | `<ws>/run/repo-profile.md` | controller | human-readable echo | ignored |

`<ws>` = `<repo-root>/.cost-oriented-agentic-workflow` (existing ignored workspace).

### A.2 Trigger conditions (when intake runs)

Intake runs **only** when the controller lacks a current map of the repo:

- First non-trivial task in a repo with **no `repo-profile.json`**, OR
- profile present but **stale** (A.4), OR
- task touches a subsystem the profile marks `unmapped`.

### A.3 Warm-repo skip conditions (the fast path)

Skip intake entirely when **any** holds:
- A current `repo-profile.json` exists and its fingerprint matches (A.5); **or**
- the repo is already in the controller's working context this session
  (controller authored/just explored it); **or**
- the task is a **trivial light-inline** single-outcome change to a file the
  controller already holds (light path is never gated on intake); **or**
- `mode = standard` and the task is fully specified against known paths.

Skip is the default. A `Profile: warm — skip intake.` receipt is emitted; no
snapshot is run.

### A.4 Stale-profile conditions

A profile is stale when:
- the **fingerprint** (A.5) no longer matches, **or**
- `repo-profile.json.generatedAtCommitMissing` (the recorded commit is no longer
  an ancestor — e.g. history rewrite), **or**
- profile `schemaVersion` is older than the helper's, **or**
- the user explicitly requests a refresh.

### A.5 Profile fingerprint (why ordinary HEAD changes do NOT invalidate it)

The fingerprint is a SHA-256 over **structure that affects how the repo is
navigated**, *not* over HEAD:

```text
fingerprint = sha256(JSON(
    repository identity:             root (first) commit sha
  + instruction files + hashes:     CLAUDE.md, AGENTS.md, .cursorrules,
                                     .github/copilot-instructions.md, …   (Phase-1 add)
  + manifest files + their hashes:  package.json, pyproject.toml, go.mod,
                                     pom.xml, build.gradle, Cargo.toml, *.csproj,
                                     pubspec.yaml, Gemfile, composer.json, …
  + directory names (depth 1–2) + test roots + CI config + lockfile names
  + declared languages (name + ext only — NOT file counts)
))
```

> **Phase 1 correction (`§7.3`).** The fingerprint now also covers **instruction
> files** (so a `CLAUDE.md`/equivalent change invalidates it) and the repository's
> **root-commit identity**. File **counts** are deliberately excluded so that adding
> a source file to an already-mapped directory does not churn the fingerprint —
> only new directory *names* (navigation shape) do. Manifest/instruction hashes are
> over **working-tree** content, so an uncommitted dependency edit is reflected.

Excluded from the fingerprint (so they never cause false staleness): `HEAD`,
commit timestamps, dirty status, recent commit history, snapshot creation time,
and source-file contents/counts. Ordinary commits (editing source inside an
already-mapped tree) change none of the hashed inputs, so the fingerprint — and the
profile — stay valid. Only dependency/structure/instruction changes (which DO
change navigation) invalidate it. This avoids W1's re-exploration on every commit.

### A.6 `repo-snapshot.json` — deterministic snapshot fields

`repo-snapshot.mjs` (Node stdlib + git only, zero deps) emits a **fixed, bounded**
schema. **No file contents, no secrets** (`09`):

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "<ISO8601>",                     // NOT hashed
  "repository": { "rootCommit": "<sha>", "name": "<dir basename>" },  // identity
  "worktree": {
    "isLinked": false,                            // git-dir != git-common-dir
    "branch": "main", "head": "<sha>",            // head recorded, NOT hashed
    "upstream": "origin/main" /* or null */,
    "dirty": false, "trackedFileCount": 0,
    "dirtyPaths": []                              // paths only, no diff content
  },
  "instructionFiles": [{ "path": "CLAUDE.md", "sha256": "...", "bytes": 0 }],  // Phase-1 add
  "manifests": [{ "path": "package.json", "type": "npm", "sha256": "...", "bytes": 0 }],
  "languages": [{ "name": "TypeScript", "ext": ".ts", "fileCount": 0 }],   // top N, count desc
  "buildCommands": ["npm run build"],   // parsed from manifest scripts only
  "testCommands": ["npm test"],         // parsed from manifest scripts only
  "entryPoints": ["src/index.ts"],      // declared (manifest main/bin), not guessed
  "topLevelDirs": ["src", "test", "docs"],
  "directoryShape": [{ "dir": "src", "childDirs": ["api","ui"], "fileCount": 42 }], // depth ≤ 2
  "testRoots": ["test", "glob:*.{test,spec}.*"],
  "ciConfig": [".github/workflows/ci.yml"],
  "recentCommits": [{ "sha": "<sha>", "subject": "..." }],   // informational, NOT hashed
  "notable": ["monorepo:false", "lockfile:package-lock.json"],
  "truncated": { "languages": false /* per-section + "output" flag */ },
  "fingerprint": "<sha256>"
}
```

> **Phase 1 correction.** Flat `git`/`headCommit` became `repository` + `worktree`
> objects; `instructionFiles` and `recentCommits` were added; `truncated` is a
> per-section object (not a bare bool). Structure is derived from `git ls-files`
> (tracked), so gitignored heavy dirs never appear; an explicit skip-list is the
> belt-and-suspenders. Determinism: every list is sorted (languages by count desc
> then name); no timestamps inside hashed inputs. Re-running on the same tree yields
> byte-identical output except `generatedAt`.

### A.7 Output-size limits (concrete bounds, `§7.2`)

Every discovery bound is explicit and enforced by `repo-snapshot.mjs` (constant
`BOUNDS`); on overflow the section is sliced and its `truncated.<section>` flag set
(ordering preserved, never silently dropped):

- `languages` ≤ 10; `manifests` ≤ 20; `instructionFiles` ≤ 20; `topLevelDirs` ≤ 50;
  `directoryShape` depth ≤ 2 and ≤ 200 dir entries; `entryPoints` ≤ 20;
  `dirtyPaths` ≤ 200; `recentCommits` ≤ 20.
- Overall `repo-snapshot.json` ≤ 16 KB (16384 bytes): if the serialized snapshot
  exceeds the cap, the lowest-value sections (`recentCommits`, then
  `directoryShape`) are trimmed and `truncated.output` is set.
- `repo-profile.json` ≤ 8 KB; `repo-profile.md` ≤ 150 lines. The controller reads
  the **profile**, not the raw tree.

### A.8 Investigator vs controller responsibilities

| Step | Owner | Output |
|---|---|---|
| Run `repo-snapshot.mjs` (deterministic) | controller (1 cheap call) or `cow-repo-investigator` | `repo-snapshot.json` |
| Decide if a deeper read is needed | controller | discoveryRoute |
| Deep, scoped reading of an unknown subsystem | `cow-repo-investigator` (haiku, read-only) | a ≤40-line summary + notes file |
| Synthesize `repo-profile.json/.md` | **controller** | profile artifacts |
| Mark subsystems `mapped`/`unmapped` | controller | profile |

The controller never does broad reading itself; the snapshot is deterministic and
the deep read is delegated to the cheap investigator.

### A.9 `repo-profile.json` schema (controller-owned synthesis)

```jsonc
{
  "schemaVersion": 1,
  "fingerprint": "<sha256>",            // matches snapshot; basis for warm/stale
  "generatedAtCommit": "<sha>",
  "languages": [...], "buildCommands": [...], "testCommands": [...],
  "subsystems": [
    { "name": "auth", "paths": ["src/auth/**"], "status": "mapped",
      "notes": "JWT filter at src/auth/JwtAuthFilter; tests in test/auth" }
  ],
  "conventions": ["tests colocated as *.test.ts", "DI via constructor"],
  "riskHotspots": ["src/auth/**", "migrations/**"],   // hard-exclusion surfaces
  "unmapped": ["src/legacy/**"]
}
```

### A.10 Dirty-tree & worktree handling

- **Dirty tree:** snapshot records `git.dirty=true` and proceeds (read-only, never
  mutates). Intake never resets/stashes. Routing (Part B) treats pre-existing dirty
  paths as *to-preserve* (existing 0.4.1 rule).
- **Worktree:** snapshot resolves the repo root via `git rev-parse --show-toplevel`
  and writes to that checkout's own ignored workspace (linked worktrees do not
  share — existing `cow-workspace` behavior). Fingerprint is per-checkout.

### A.11 Failure behavior

- `git` unavailable → snapshot exits non-zero with a clear message; controller
  falls back to a minimal `controller-map` and records `profile:absent`.
- Manifest parse error → that manifest is recorded with `type:"unknown"`; snapshot
  still succeeds (best-effort, never throws on one bad file).
- Snapshot never fails the task; absence of a profile just means "no warm path."

---

### A.12 Profile acceptance (Phase 3A) — `repo-profile.mjs`

The `cow-repo-investigator` returns a profile **draft** but cannot write files, so a
deterministic helper owns parsing, validation, fingerprint comparison, and **atomic
promotion**: `skills/repository-intake/scripts/repo-profile.mjs` (Node + git, zero
deps). The controller never trusts an unvalidated profile; a `PARTIAL` draft is never
promoted to a warm (`VALID`) profile.

Agent envelope (`OUTPUT_FORMAT=PROFILE_DRAFT`, controller-selected, never inferred):

```text
STATUS: READY | PARTIAL | BLOCKED_INPUT
PROFILE_JSON_BEGIN
<exactly one JSON object — the schema in references/repository-profile-contract.md>
PROFILE_JSON_END
UNCERTAINTIES_BEGIN
- ...
UNCERTAINTIES_END
```

Run-dir artifacts (all ignored, worktree-local): `repo-profile-agent-output.txt`
(raw) → `repo-profile.candidate.json` (extracted, written first) →
`repo-profile.json` (promoted) → `repo-profile.md` (rendered). Commands:
`validate-agent-output`, `accept-agent-output`, `validate`, `status`
(`VALID`/`STALE`/`MISSING`/`INVALID`/`PARTIAL`), `render`. It extracts only the
delimited JSON (rejecting multiple blocks/ambiguous text), checks
schemaVersion + fingerprint-vs-snapshot + safe paths + verified/inferred/unknown
confidence (rejecting a `verified` command from a shell-less agent) + secret/env
denylist + the 8 KB cap, preserves the previous valid profile on failure, and writes
atomically. The controller records the result via `cow-state.mjs profile` (`04` A.8):
`VALID→warm`, `STALE→stale`, `MISSING`/`INVALID→absent`. One corrected redispatch is
allowed after a validation failure (errors as changed context); a second blocks intake.

## Part B — Dual routing contract

Two **independent** axes, decided in order, each with a visible receipt and a state
record. Replaces 0.4.x's single implicit route (fixes W2).

```text
discoveryRoute  ∈ { controller-map, investigator, parallel-investigators }
implementationRoute ∈ { inline, delegated, planned-sequential, delegated-batch }
```

### B.1 Decision inputs

| Axis | Inputs |
|---|---|
| discoveryRoute | repo warm/unknown (profile), #disjoint domains (domain map), whether full-system context is needed, mode |
| implementationRoute | #independent outcomes, scope/size, coupling, file overlap, **risk** (hard-exclusions), contract-cost, mode |

### B.2 Transition order (the spine)

```text
triage
  → [if bug] systematic-debugging: discoveryRoute for DIAGNOSIS (read-only)
  → evidenced root cause  →  exit diagnosis
  → implementation triage: implementationRoute
  → execute → review (matrix) → verify → commit
```

Discovery routing governs **how we learn** (mapping/diagnosis); implementation
routing governs **how we change code**. They are never chosen together.

### B.3 Receipts (observable, not chain-of-thought)

```text
Profile: warm — skip intake.
Discovery: controller-map — single subsystem, profile mapped.
Discovery: parallel-investigators — 2 disjoint domains (auth, export); read-only.
Route: systematic-debugging → diagnosis (read-only).
Re-route: tracked diagnostic edit (mock-server dep) — planned elevated unit.
Implementation: inline — one small low-risk single-outcome edit.
Implementation: delegated-batch — 2 same-file outcomes, separate acceptance.
```

Each receipt has a matching `cow-state route`/`transition` call (`04`).

### B.4 Valid / invalid combinations

| discoveryRoute | implementationRoute | Valid? | Note |
|---|---|---|---|
| controller-map | inline | ✅ | warm/trivial path |
| investigator | inline | ✅ | **expensive investigation → small fix is normal** (B.6) |
| parallel-investigators | planned-sequential / delegated-batch | ✅ | disjoint domains, then planned |
| parallel-investigators | inline (single unit covering all domains) | ❌ | disjoint domains ≠ one inline unit |
| controller-map | delegated-batch | ✅ | known repo, batched cluster |
| (any) | inline for 2+ independent outcomes | ❌ | independent outcomes never one light-inline (B.7) |
| controller-led broad read | (any) | ❌ | broad controller exploration is W1 — use investigator |

### B.5 Route-change triggers (re-route)

Emit exactly one `Re-route:` before the next tracked edit when:
- first **tracked** diagnostic edit (dependency/harness/config/schema/committed
  test) ⇒ leave read-only diagnosis → planned elevated unit;
- a second independent outcome/subsystem appears;
- scope/risk rises above the current route's envelope;
- hypothesis fails / bug not reproducible;
- a hard-exclusion surface is touched (risk overrides — B.8).

### B.6 Expensive investigation → small inline fix

Investigation cost and fix size are **independent**. A `parallel-investigators`
discovery that costs many tokens may still conclude with a one-line `inline` fix.
The discovery route is justified by *uncertainty about where/why*; the
implementation route is justified by *the size/risk of the change*. The controller
records both; smallness of the fix never retroactively downgrades the (already
spent, justified) investigation. (Eval: `broad-investigation-then-tiny-fix`.)

### B.7 Independent outcomes in one file

Two independent user-visible outcomes remain independent **even in one file**
(0.4.1 rule, preserved): unit boundary = outcome + responsibility + verification
seam, not the file set. Route = `planned-sequential` (separate units) or
`delegated-batch` (one batch, separate acceptance + regression per outcome) — never
a single `inline`. Same-file overlap forces **sequential**, never parallel writes.

### B.8 Risk overrides cost

Hard-exclusion surfaces (auth, secrets, migrations, money, privacy, concurrency,
public API, dependency/supply-chain, prod/CI config, irreversible side effects)
force the unit off the light path regardless of size: `risk ∈ {elevated, high}`,
review per the matrix. The size/contract-cost gate chooses inline vs delegated
*within* that constraint; it never relaxes it.

### B.9 Light-inline stays available

A single trivial, low-risk, single-outcome change to context the controller
already holds → `discoveryRoute = controller-map` (or skip) + `implementationRoute
= inline` + verify. No profile, no plan, no agent, no ceremony. The light path is a
feature; intake and routing must not make trivial warm-repo work heavier (`09`).
(Eval: `warm-repo-trivial-edit`.)

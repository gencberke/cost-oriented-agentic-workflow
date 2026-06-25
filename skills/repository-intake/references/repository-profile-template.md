# Repository Profile — &lt;repo name&gt;

> Human-readable echo of `repo-profile.json`. Keep it short (≤ 150 lines).
> Structure and observable facts only — no source bodies, logs, secrets, or
> reasoning. The JSON is the source of truth; this mirrors it for humans.

- **Fingerprint:** `<sha256 from repo-snapshot.mjs>`
- **Status:** ready | partial
- **Generated at commit:** `<HEAD sha or n/a>` (informational; not fingerprinted)
- **Updated:** `<ISO 8601>`

## Stack

- **Languages:** TypeScript (.ts), …
- **Build:** `npm run build` *(inferred)*
- **Test:** `npm test` *(inferred)*  — confidence is `verified` only after an actual run
- **Instruction sources:** `CLAUDE.md`

## Subsystems

| Subsystem | Paths | Status | Confidence |
|---|---|---|---|
| example-subsystem | `src/example/**` | mapped | inferred |
| legacy | `src/legacy/**` | unmapped | unknown |

## Conventions

- tests colocated as `*.test.ts`
- dependency injection via constructor

## Risk hotspots (hard-exclusion surfaces)

- `src/auth/**`
- `migrations/**`

## Unmapped (deep-read backlog)

- `src/legacy/**`

## Uncertainty

- DI framework inferred from imports, not confirmed

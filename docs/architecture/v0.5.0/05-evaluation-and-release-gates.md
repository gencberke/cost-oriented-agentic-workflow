# 05 — Evaluation & Release Gates

Eight layers, cheapest/most-deterministic first. **Honesty rule (KEEP from
0.4.x):** a regex/signal match is evidence of a *signal*, never proof of model
behavior. Layers 1–4 are deterministic (no model); 5–6 involve a live model and are
graded by signal + **human adjudication**; 7 is measured; 8 is packaging.

## Layer definitions

| L | Layer | Mechanism | Deterministic? | Where |
|---|---|---|---|---|
| 1 | Schema / structural | `node tests/validate-structure.mjs` — extend with: state JSON schema doc present, agent frontmatter fields valid, hook rule table present, doc dir recognized | yes | extends existing 187-check suite |
| 2 | Helper behavioral | temp-repo runs of `cow-state` + `repo-snapshot.mjs` (+ existing cow-workspace/task-brief/review-package) | yes | extends `tests/scripts.test.sh` |
| 3 | Hook decision | feed PreToolUse/SessionStart **stdin fixtures** + `state.json` fixtures to the hook script; assert `permissionDecision`; **no model** | yes | new `tests/hooks/*.test.*` |
| 4 | Agent contract | parse each `agents/*.md` frontmatter; assert `model/maxTurns/tools/disallowedTools` set, `memory` absent, `isolation` absent, `Skill` excluded where required | yes | new `tests/agents/*.test.*` |
| 5 | Route-only behavioral | fresh `claude --plugin-dir` sessions on prompt fixtures; stop at the route receipt; grade receipts + forbidden-rationalizations (signal) + human adjudication | model + human | extends `tests/eval/routing/` |
| 6 | Full-path dogfood | live end-to-end on sample repos; ledger + analyzer evidence; human-graded | model + human | `docs/DOGFOOD.md` protocol |
| 7 | Token / cost acceptance | `analyze-token-usage.py` on session JSONL; assert budgets (`03`) | measured | dogfood + analyzer |
| 8 | Release / runtime-package | `build-runtime-package.mjs` self-validation incl. new `agents/**` (+ `hooks/hooks.json` once active) | yes | extends `tests/release-artifact.test.sh` |

Layers 1–4 and 8 are the **deterministic release gate** (must pass to ship a
phase). Layers 5–7 are the **behavioral acceptance gate** (must pass to ship the
release candidate / v0.5.0). Layer 3's mechanism (pure stdin→decision) is what makes
hook enforcement testable without a live model — the key new capability.

## Scenario → layer → measurable acceptance

| Scenario | Primary layer(s) | Measurable acceptance |
|---|---|---|
| Unknown existing repository | 2,5 | `repo-snapshot.json` produced with all required fields, ≤16 KB, deterministic re-run; live run dispatches `cow-repo-investigator` (not broad controller reads) in ≥ blocker threshold runs |
| Warm repository trivial edit | 5,7 | live run takes light-inline, **no** snapshot/plan/agent; controller reads ≤ N files; verification still required |
| One bug, obvious root cause | 5 | single `controller-map` diagnosis → small inline fix; no investigator dispatched; root cause stated before fix |
| Small but disjoint bugs | 5 | cheap domain map → `parallel-investigators` (≤2), read-only; **no** "they're small → inline" rationalization |
| Broad investigation → tiny fix | 5 | discovery=`investigator`/`parallel` **and** implementation=`inline` both recorded; fix size does not retroactively downgrade the investigation (B.6) |
| Tracked diagnostic harness | 3,5 | L3: hook DENYs tracked Edit while `phase=diagnosis-readonly`; L5: `Re-route:` precedes the edit, planned elevated unit, cleanup disposition |
| Same-file independent outcomes | 5 | two outcomes → `planned-sequential`/`delegated-batch` with per-outcome acceptance+regression; never one inline |
| Dirty working tree | 2,5 | snapshot records `dirty=true`, no reset/stash; live run preserves pre-existing changes, keeps them out of the unit |
| Resume after new session | 2,5 | `cow-state init --reconstruct` rebuilds phase/route/counters from plan+ledger+git; completed units not re-dispatched |
| Compact during diagnosis | 3,5 | SessionStart `compact` injects pointer + `status --oneline`; `phase=diagnosis-readonly` survives; no full entry-skill reinjection |
| Stale repo profile | 2 | fingerprint mismatch on a manifest/dir change ⇒ `status=stale`; ordinary source commit ⇒ stays `ready` (HEAD-independence) |
| Corrupted state | 2,3 | `cow-state status` exits non-zero, no overwrite; hooks `defer` (fail-open); `init --reconstruct` recovers |
| Investigator attempted source write | 3,4 | L4: investigator frontmatter excludes `Edit/Write`; L3: hook DENYs investigator Edit/Bash-mutation outside `<ws>` |
| Bash mutation false positive | 3 | a benign command **not** in the literal prefix allowlist (e.g. `grep`, `ls`, `cat`) ⇒ hook `defer` (no false DENY); shadow FP rate ~0 before promotion |
| Agent timeout | 2 (sim) ,5 | `maxTurns` reached ⇒ BLOCKED handling; bounded retry with changed context; no infinite loop |
| Failed hypothesis | 5 | new hypothesis formed; ≥3 failed ⇒ architecture escalation; no stacked fixes |
| Bounded retry exhaustion | 2,5 | implementer attempt counter caps at 2 (state); `block --reason retry-exhausted`; `budget exhausted ≠ approved` |
| Standard vs production | 3,4,5 | production: per-task review mandatory, whole-work `model: opus`, R2 plan-gate DENY; standard: light path + final Sonnet review; matrix unchanged |

## Acceptance criteria & policy

- **Deterministic gate (L1–4, L8):** 100% pass; counts reported (e.g., structural
  N checks, hook-decision M cases, agent-contract K cases). No phase ships red.
- **Hook false-positive budget (L3 + shadow):** before any rule is promoted from
  shadow to enforce (`04` B.3), its false-positive rate on the L3 fixtures **and**
  the shadow-observation log must be **0** on the curated benign set; otherwise it
  stays shadow.
- **Route-only blockers (L5):** the three 0.4.1 blockers + the new dual-routing
  blockers (`tracked-diagnostic-harness`, `same-file-independent-outcomes`,
  `small-disjoint-diagnosis`, `broad-investigation-then-tiny-fix`) pass **3
  independent fresh runs each**; regression controls (`warm-repo-trivial-edit`,
  `unknown-existing-repo`, `dirty-working-tree`, `resume-after-new-session`)
  ≥ 1 clean run each; a varying fixture extends to 5; a failed blocker is a failed
  gate. Grading is human adjudication of saved raw output, never regex-only.
- **Token/cost (L7):** measured per-scenario against `03` budgets — e.g.
  warm-trivial run controller input tokens below a recorded ceiling; unknown-repo
  run spends investigation tokens in the **investigator** (haiku), not the
  controller. Numeric ceilings are calibrated in Phase 6 from real runs, not
  guessed; thresholds change only on measured evidence (existing policy).
- **No regex-as-proof:** L5/L6 verdicts separate (a) schema/fixture validity,
  (b) automatic receipt/signal checks, (c) human behavioral adjudication —
  explicitly, as in the current `tests/eval/routing/README.md`.

## Reuse of Superpowers test mechanism (attributed)
The live behavioral mechanism reuses Superpowers 6.0.3's approach
(`tests/explicit-skill-requests/`, `tests/claude-code/*-integration.sh`): drive
`claude -p`/`--plugin-dir`, then grep the stream-JSON for tool/skill-invocation
signals and read the session JSONL for token telemetry. COW adds the dual-routing
fixtures, the deterministic L3 hook-decision layer (which Superpowers 6.0.3 lacks —
it has no `evals/` dir yet), and the human-adjudication honesty rule.

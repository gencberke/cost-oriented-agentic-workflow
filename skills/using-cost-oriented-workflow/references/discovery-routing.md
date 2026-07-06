# Discovery routing (the first half of dual routing)

Loaded on demand. Discovery routing decides **how we learn** (mapping / diagnosis);
implementation routing decides **how we change code** and stays **`pending`**
through discovery — it is selected later by `execution-routing` (live since Phase
3B.1), so a discovery receipt always shows `implementation=pending`. Run repository
readiness (`repository-readiness.md`) first.

Discovery-route values: `controller-map | investigator | parallel-investigators`.

## Stable receipt (§9.1)

Emit exactly one receipt; do not repeat it while nothing changes:

```text
Route: lane=<lane>; repository=<warm|intake>; discovery=<controller-map|investigator|parallel-investigators>; implementation=pending; risk=<low|elevated|high>
```

On a genuine change emit one:

```text
Re-route: reason=<stable-code>; discovery=<new-route>; implementation=pending
```

Record the same decision through `cow-state.mjs route --discovery <value>` (and
`transition`/`root-cause` as the phase moves).

## Controller-map budget (§9.2) — a release gate

`controller-map` is a cheap classification step, **not** full diagnosis. It may use
the snapshot, the validated profile, instruction files, **at most three** targeted
source/config reads, and **at most one** bounded Grep or Glob. It must not trace
multiple subsystems, read long logs, inspect more than three candidate files, run
repeated hypotheses, do repository-wide searches, or absorb large tool output into
controller context. If that budget is insufficient, **dispatch an investigator**.
The controller must not justify broad inline discovery because the expected fix
looks small.

## Route selection (§9.3)

- **`controller-map`** only when: the profile is `VALID`, one subsystem and one seam
  are already evident, and the evidence fits the cheap-map budget.
- **`investigator`** when: investigation is broad or uncertain; one bounded domain
  needs tracing; large logs or several candidate files would otherwise enter
  controller context; or repository context is valid but task-specific subsystem
  coverage is insufficient.
- **`parallel-investigators`** only after the cheap map evidences **disjoint**
  domains. Maximum **2**. Do not fan out merely because there are two symptoms. Do
  not parallelize overlapping work; investigators are read-only in this phase.

## Task-specific investigator dispatch (§10)

Always dispatch the **exact scoped identifier**; supply every contract input;
save each raw agent output under `<ws>/run/`.

**Non-debugging discovery** → `cost-oriented-agentic-workflow:cow-repo-investigator`
with `OUTPUT_FORMAT=TASK_DISCOVERY`. Give it: task context, validated profile path,
snapshot path, explicit `READ_SCOPE`, an explicit file/read bound, one domain, and
the required report format. Do not ask it to regenerate the full profile unless
intake is actually stale.

**Debugging diagnosis** → `cost-oriented-agentic-workflow:cow-debug-investigator`
with all required inputs. Update state **before** dispatch:
`processLane=debug` (systematic-debugging), `phase=diagnosis-readonly`,
`discoveryRoute=<selected>`. After delegating, the controller does **not** perform
the investigator's tracing itself.

**Disjoint debugging** (§10.3): when the domain map evidences disjoint domains,
create two non-overlapping read scopes, dispatch **at most two**
`cow-debug-investigator` instances with separate diagnosis reports, keep eventual
fix size out of the discovery decision, and adjudicate whether the reports reveal
independent root causes or one shared root cause — never merge outcomes merely
because they eventually touch the same file.

Diagnosis adjudication and the `cow-state.mjs root-cause` recording (`--status`
enum `none|investigating|evidenced|failed`; the investigator's `PARTIAL` maps to
`investigating`, `BLOCKED` to `failed`, and `REQUIRES_REROUTE` re-routes via
`transition --phase triage --reroute`), plus the tracked-instrumentation
re-route, are owned by `cost-oriented-agentic-workflow:systematic-debugging`.

**A reroute is spent the moment it fires: at most one reroute per symptom.** If
a second `REQUIRES_REROUTE` comes back for the same symptom without materially
new evidence, do not dispatch again — record a block and surface the impasse
to the user.

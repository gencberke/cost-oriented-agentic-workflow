# Review control-plane fixtures (Phase 3B.2)

Static behavioral contracts for the scoped `cow-reviewer` integration. These
fixtures validate shape and coherence only; they are not model-behavior proof.
Live smokes and stream analyzers provide behavioral evidence.

Each fixture contains `prompt.md` and `expected.json`. The expected contract
records mode/risk matrix behavior, review scope, required artifacts, controller
adjudication, remediation waves, targeted re-review, whole-work review, and
forbidden shortcuts such as automatic reviewer selection or applying findings
before adjudication.

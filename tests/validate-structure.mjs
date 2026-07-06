#!/usr/bin/env node
// Structural validator for the cost-oriented-agentic-workflow plugin.
//
// This fork is synced from upstream by hand (see docs/DECISIONS.md). A manual
// sync — or any content edit — can silently break a cross-reference, a
// relative link, or a frontmatter invariant. This check is the safety net for
// that: it asserts STRUCTURE, not prose, so it survives content rewrites.
//
// Run: npm run check   (or: node tests/validate-structure.mjs)
// Exit non-zero on any failure. Zero runtime dependencies (Node built-ins only).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Real cow-state enums: packaged prose that documents CLI values is checked
// against these so a skill can never teach a command that fails at runtime.
import {
  PHASES as STATE_PHASES, ROOTCAUSE_STATUS, BLOCK_CODES, COMMIT_POLICIES,
  DISCOVERY_ROUTES, IMPLEMENTATION_ROUTES,
} from '../skills/execution-routing/scripts/cow-state-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
let passes = 0;

function ok(msg) { passes += 1; /* quiet on pass; summary at end */ }
function fail(msg) { failures += 1; console.error('FAIL: ' + msg); }
function check(cond, msg) { cond ? ok(msg) : fail(msg); }

const rel = (p) => path.relative(root, p).replace(/\\/g, '/');
const read = (p) => fs.readFileSync(p, 'utf8');
const isDir = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory();

// Skip VCS, dependencies, build output, and the self-ignored runtime workspace.
// The structural result must depend only on tracked plugin content, never on
// generated or ignored artifacts (a run ledger or release zip must not be able
// to add or fail a check).
const WALK_SKIP = new Set(['.git', 'node_modules', 'dist', '.cost-oriented-agentic-workflow']);
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (WALK_SKIP.has(e.name)) continue;
      walk(path.join(dir, e.name), acc);
    } else {
      acc.push(path.join(dir, e.name));
    }
  }
  return acc;
}

// Parse a leading `---\n...\n---` YAML-ish frontmatter block (name/description only).
function frontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = text.slice(3, end);
  const out = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

// ── 1. Manifests are valid JSON and agree ──────────────────────────────────
const jsonFiles = [
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'hooks/hooks.json.example',
  'hooks/hooks.enforcement.json.example',
  'package.json',
];
const parsed = {};
for (const f of jsonFiles) {
  const abs = path.join(root, f);
  if (!fs.existsSync(abs)) { fail(`${f} exists`); continue; }
  try { parsed[f] = JSON.parse(read(abs)); ok(`${f} is valid JSON`); }
  catch (e) { fail(`${f} is valid JSON — ${e.message}`); }
}

const plugin = parsed['.claude-plugin/plugin.json'];
const market = parsed['.claude-plugin/marketplace.json'];
const packageMeta = parsed['package.json'];
if (plugin && market) {
  check(typeof plugin.name === 'string' && plugin.name.length > 0, 'plugin.json has a name');
  const mp = (market.plugins || []).find((p) => p.name === plugin.name);
  check(!!mp, `marketplace lists plugin "${plugin.name}"`);
  if (mp) check(mp.version === plugin.version, `marketplace version matches plugin.json (${plugin.version})`);
}
if (plugin && packageMeta) {
  check(plugin.version === packageMeta.version,
    `package version matches plugin.json (${plugin.version})`);
  check(!!(packageMeta.scripts && packageMeta.scripts['test:hooks'] === 'node tests/hooks.test.mjs'),
    'package.json has test:hooks script pointing to node tests/hooks.test.mjs');
  check(!!(packageMeta.scripts && packageMeta.scripts['test:scripts'] === 'node scripts/run-bash.mjs tests/scripts.test.sh'),
    'package.json routes test:scripts through the cross-platform Bash wrapper');
  check(!!(packageMeta.scripts && packageMeta.scripts['test:eval'] === 'node scripts/run-bash.mjs tests/eval/run-tests.sh'),
    'package.json routes test:eval through the cross-platform Bash wrapper');
  check(!!(packageMeta.scripts && packageMeta.scripts['release:build'] === 'node scripts/build-runtime-package.mjs'),
    'package.json release:build builds the runtime package');
  check(!!(packageMeta.scripts && packageMeta.scripts['runtime:inspect'] === 'node scripts/inspect-runtime-package.mjs'),
    'package.json exposes runtime:inspect');
  check(!!(packageMeta.scripts && packageMeta.scripts['release:check:candidate'] === 'node scripts/release-gate.mjs --mode=candidate'),
    'package.json exposes candidate release gate');
  check(!!(packageMeta.scripts && packageMeta.scripts['release:check:final'] === 'node scripts/release-gate.mjs --mode=final'),
    'package.json exposes final release gate');
  check(!!(packageMeta.scripts && packageMeta.scripts['release:version:dry'] === 'node scripts/version-finalize.mjs --target 0.5.0 --dry-run'),
    'package.json exposes final version dry-run');
}
check(!fs.existsSync(path.join(root, 'hooks/hooks.json')), 'no active hooks/hooks.json exists');

// hooks.json.example must declare direct exec-form hooks for SessionStart, PreToolUse, and PreCompact
const hooksEx = parsed['hooks/hooks.json.example'];
if (hooksEx) {
  check(!!(hooksEx.hooks && hooksEx.hooks.SessionStart), 'hooks.json.example declares a SessionStart hook');
  check(!!(hooksEx.hooks && hooksEx.hooks.PreToolUse), 'hooks.json.example declares a PreToolUse hook');
  check(!!(hooksEx.hooks && hooksEx.hooks.PreCompact), 'hooks.json.example declares a PreCompact hook');

  const assertExecForm = (list, op) => {
    if (!Array.isArray(list)) return fail(`hooks list for ${op} is not an array`);
    const cmd = list[0];
    if (!cmd || cmd.type !== 'command' || cmd.command !== 'node') {
      fail(`hook for ${op} must use command "node"`);
    }
    if (!Array.isArray(cmd.args) || !cmd.args[0].includes('cow-hook.mjs') || cmd.args[1] !== op) {
      fail(`hook for ${op} args must target cow-hook.mjs and "${op}"`);
    }
  };

  if (hooksEx.hooks) {
    if (hooksEx.hooks.SessionStart && hooksEx.hooks.SessionStart[0]) assertExecForm(hooksEx.hooks.SessionStart[0].hooks, 'session-start');
    if (hooksEx.hooks.PreToolUse && hooksEx.hooks.PreToolUse[0]) assertExecForm(hooksEx.hooks.PreToolUse[0].hooks, 'pre-tool-use');
    if (hooksEx.hooks.PreCompact && hooksEx.hooks.PreCompact[0]) assertExecForm(hooksEx.hooks.PreCompact[0].hooks, 'pre-compact');
  }
}

// Phase 4 Hook & state-core files must exist
const stateCorePath = path.join(root, 'skills/execution-routing/scripts/cow-state-core.mjs');
check(fs.existsSync(stateCorePath), 'skills/execution-routing/scripts/cow-state-core.mjs exists');
const cowHookPath = path.join(root, 'skills/execution-routing/scripts/cow-hook.mjs');
check(fs.existsSync(cowHookPath), 'skills/execution-routing/scripts/cow-hook.mjs exists');

// ── Phase 5A: selective enforcement (shadow preserved, no active hooks) ───────
const cowHookText = fs.existsSync(cowHookPath) ? read(cowHookPath) : '';
check(cowHookText.includes('--decision-mode='), 'cow-hook.mjs parses --decision-mode=');
check(/decisionMode\s*=\s*['"]enforce['"]/.test(cowHookText) || /===\s*['"]enforce['"]/.test(cowHookText),
  'cow-hook.mjs enables enforcement only for the exact value enforce');
check(cowHookText.includes('handlePreToolUseEnforce') && cowHookText.includes('handlePreToolUseShadow'),
  'cow-hook.mjs separates enforce and shadow PreToolUse handlers');
check(cowHookText.includes('permissionDecision') && !/updatedInput\s*:/.test(cowHookText),
  'cow-hook.mjs emits permissionDecision and never emits updatedInput as a key');
check(/COW E[1-7]:/.test(cowHookText), 'cow-hook.mjs carries the fixed E1-E7 reason prefixes');
check(cowHookText.includes('isSimpleCommand'), 'cow-hook.mjs guards Bash matching with isSimpleCommand');
// The simple-command guard rejects compound/redirect/substitution operators
// (&& || ; | ` $( < >) via a single char-class regex that covers each one.
check(cowHookText.includes('[&|;`$<>]'),
  'cow-hook.mjs simple-command guard rejects compound/redirect/substitution operators (&& || ; | ` $( < >)');
check(fs.existsSync(path.join(root, 'tests/hook-enforcement.test.mjs')),
  'tests/hook-enforcement.test.mjs exists');
check(!!(packageMeta.scripts && packageMeta.scripts['test:enforcement'] === 'node tests/hook-enforcement.test.mjs'),
  'package.json has test:enforcement script pointing to node tests/hook-enforcement.test.mjs');
check(fs.existsSync(path.join(root, 'tests/fixtures/hook-enforcement')),
  'tests/fixtures/hook-enforcement benign corpus exists');
const enforceExPath = path.join(root, 'hooks/hooks.enforcement.json.example');
check(fs.existsSync(enforceExPath), 'hooks/hooks.enforcement.json.example exists as an inactive example');
const enforceEx = fs.existsSync(enforceExPath) ? JSON.parse(read(enforceExPath)) : null;
if (enforceEx) {
  const ptu = enforceEx.hooks && enforceEx.hooks.PreToolUse && enforceEx.hooks.PreToolUse[0];
  const ptuArgs = ptu && ptu.hooks && ptu.hooks[0] && ptu.hooks[0].args;
  check(Array.isArray(ptuArgs) && ptuArgs.includes('--decision-mode=enforce'),
    'enforcement example PreToolUse uses --decision-mode=enforce');
  check(typeof enforceEx._comment === 'string' && /INACTIVE EXAMPLE/i.test(enforceEx._comment)
    && /deferred until live evidence accepts it/i.test(enforceEx._comment),
    'enforcement example states runtime activation is deferred until live evidence accepts it');
}
check(!fs.existsSync(path.join(root, 'hooks/hooks.json')),
  'Phase 5A: no active hooks/hooks.json exists (enforcement stays inactive)');

// ── Phase 6: behavioral/token/cost evaluation harness (deterministic) ────────
const phase6Dir = path.join(root, 'tests/eval/phase6');
check(fs.existsSync(path.join(phase6Dir, 'validate-run.mjs')), 'Phase 6: validate-run.mjs exists');
check(fs.existsSync(path.join(phase6Dir, 'aggregate-runs.mjs')), 'Phase 6: aggregate-runs.mjs exists');
check(fs.existsSync(path.join(phase6Dir, 'README.md')), 'Phase 6: harness README exists');
check(fs.existsSync(path.join(phase6Dir, 'phase6h-experiment.md')), 'Phase 6: 6H experiment spec exists');
check(fs.existsSync(path.join(root, 'tests/phase6.test.mjs')), 'Phase 6: phase6.test.mjs exists');
check(!!(packageMeta.scripts && packageMeta.scripts['test:phase6'] === 'node tests/phase6.test.mjs'),
  'package.json has test:phase6 script pointing to node tests/phase6.test.mjs');
const phase6FixtureRoot = path.join(phase6Dir, 'fixtures');
for (const fx of ['F1-bounded-implementation', 'F2-diagnosis-fix', 'F3-review-remediation', 'F4-enforcement', 'F5-resume-compact']) {
  check(fs.existsSync(path.join(phase6FixtureRoot, fx, 'manifest.json')), `Phase 6: fixture ${fx}/manifest.json exists`);
  check(fs.existsSync(path.join(phase6FixtureRoot, fx, 'task.md')), `Phase 6: fixture ${fx}/task.md exists`);
}
const validateRunText = fs.existsSync(path.join(phase6Dir, 'validate-run.mjs')) ? read(path.join(phase6Dir, 'validate-run.mjs')) : '';
check(validateRunText.includes('RUN_SCHEMA_VERSION') && validateRunText.includes('SENSITIVE_KEYS'),
  'Phase 6: validate-run carries schema version + sensitive-key rejection');
check(/WORKFLOW_COMPLETED.*WORKFLOW_BLOCKED_EXPECTED.*WORKFLOW_FAILED.*HARNESS_FAILURE.*PROCESS_FAILURE.*INSUFFICIENT_EVIDENCE/s.test(validateRunText),
  'Phase 6: validate-run defines all six semantic result classes');
// Phase 6 stream-to-run parser + reproducible fixture setup (remediation pass)
check(fs.existsSync(path.join(phase6Dir, 'stream-to-run.mjs')), 'Phase 6: stream-to-run.mjs parser exists');
check(fs.existsSync(path.join(phase6FixtureRoot, 'setup.mjs')), 'Phase 6: fixtures/setup.mjs reproducible builder exists');
const streamText = fs.existsSync(path.join(phase6Dir, 'stream-to-run.mjs')) ? read(path.join(phase6Dir, 'stream-to-run.mjs')) : '';
check(streamText.includes('parseStream') && streamText.includes('hookAskCount') && streamText.includes('subagentDispatchCountByType'),
  'Phase 6: stream-to-run parses streams, counts hooks + subagent dispatches');
check(streamText.includes('FORBIDDEN_INPUT_KEYS') || streamText.includes('sensitive'),
  'Phase 6: stream-to-run rejects sensitive content in summary records');
const setupText = fs.existsSync(path.join(phase6FixtureRoot, 'setup.mjs')) ? read(path.join(phase6FixtureRoot, 'setup.mjs')) : '';
check(setupText.includes('F1-bounded-implementation') && setupText.includes('F3-review-remediation') && setupText.includes('F4-enforcement'),
  'Phase 6: setup.mjs builds F1, F3, and F4 reproducible repos');
check(/refusing to create a fixture repo inside the COW source tree/.test(setupText),
  'Phase 6: setup.mjs refuses to operate inside the COW source tree');
check(setupText.includes('--decision-mode=enforce'),
  'Phase 6: setup.mjs F4 disposable hooks.json uses enforcement mode (in disposable repo only)');
const aggregateText = fs.existsSync(path.join(phase6Dir, 'aggregate-runs.mjs')) ? read(path.join(phase6Dir, 'aggregate-runs.mjs')) : '';
check(aggregateText.includes('PAIR_ORDER') && aggregateText.includes('outliers') && aggregateText.includes('costImprovementClaimAllowed'),
  'Phase 6: aggregator compares matched pairs, reports outliers, gates cost claims on correctness');
const phase6hText = fs.existsSync(path.join(phase6Dir, 'phase6h-experiment.md')) ? read(path.join(phase6Dir, 'phase6h-experiment.md')) : '';
check(/No memory or learn features/.test(phase6hText) && /No output shaping/.test(phase6hText)
  && /No code compression/.test(phase6hText) && /Exact contract.path.SHA preservation/.test(phase6hText),
  'Phase 6H: spec enforces identical fixtures, no memory/learn, no output shaping, no compression, exact preservation');

// ── 2. Every skill: frontmatter, name == dir, description present & bounded ──
// Phase 7A release-candidate package and gate structure
const runtimeBuilderPath = path.join(root, 'scripts/build-runtime-package.mjs');
const runtimeLibPath = path.join(root, 'scripts/runtime-package-lib.mjs');
const runtimeInspectorPath = path.join(root, 'scripts/inspect-runtime-package.mjs');
// The package rules live in one shared module; the token checks below run
// against builder + lib together so the extraction cannot silently drop a rule.
const runtimeBuilderOnlyText = fs.existsSync(runtimeBuilderPath) ? read(runtimeBuilderPath) : '';
const runtimeLibText = fs.existsSync(runtimeLibPath) ? read(runtimeLibPath) : '';
const runtimeInspectorText = fs.existsSync(runtimeInspectorPath) ? read(runtimeInspectorPath) : '';
const runtimeBuilderText = runtimeBuilderOnlyText + '\n' + runtimeLibText;
check(fs.existsSync(path.join(root, 'scripts/run-bash.mjs')), 'Phase 7A: cross-platform Bash wrapper exists');
check(fs.existsSync(runtimeLibPath), 'Phase 7A: shared runtime-package rule module exists');
check(fs.existsSync(runtimeInspectorPath), 'Phase 7A: runtime package inspector exists');
check(runtimeBuilderOnlyText.includes('./runtime-package-lib.mjs') && runtimeInspectorText.includes('./runtime-package-lib.mjs'),
  'Phase 7A: builder and inspector import the shared runtime-package rule module');
check(['fileCount', 'walkFiles', 'sha256(', 'readZipEntries', 'EXEC_REQUIRED', 'PERSONAL_PATH_RE', 'REQUIRED']
  .every((t) => runtimeInspectorText.includes(t)),
  'Phase 7A: inspector verifies fileCount, directory contents, hashes, exec modes, required files, and ZIP entries');
check(fs.existsSync(path.join(root, 'scripts/release-gate.mjs')), 'Phase 7A: release gate script exists');
check(fs.existsSync(path.join(root, 'scripts/version-finalize.mjs')), 'Phase 7A: version finalization dry-run script exists');
check(fs.existsSync(path.join(root, 'tests/release-artifact.test.mjs')), 'Phase 7A: Node release artifact test exists');
check(fs.existsSync(path.join(root, 'tests/release-gate.test.mjs')), 'Phase 7B: focused release gate test exists');
check(runtimeBuilderText.includes("'agents/'") && runtimeBuilderText.includes('hooks/hooks.enforcement.json.example'),
  'Phase 7A: runtime builder allowlists agents and the inactive enforcement example');
check(runtimeBuilderText.includes("'hooks/hooks.json'") && runtimeBuilderText.includes('PERSONAL_PATH_RE'),
  'Phase 7A: runtime builder denies active hooks and personal absolute paths');
check(runtimeBuilderText.includes('validateMarkdownLinks') && runtimeBuilderText.includes('runtime-candidate'),
  'Phase 7A: runtime builder validates packaged links and writes runtime-candidate metadata');
const releaseGatePath = path.join(root, 'scripts/release-gate.mjs');
const releaseGateText = fs.existsSync(releaseGatePath) ? read(releaseGatePath) : '';
check(/LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE/.test(releaseGateText)
  && /PHASE_7A_CANDIDATE_GATE_PASSED/.test(releaseGateText),
  'Phase 7A: release gate distinguishes candidate pass from final live-evidence block');
check(/PHASE_7B_FINAL_EVIDENCE_GATE_PASSED/.test(releaseGateText)
  && /LIVE_EVIDENCE_INVALID/.test(releaseGateText)
  && /rawProvenance/.test(releaseGateText),
  'Phase 7B: release gate validates final evidence manifest and raw provenance shape');
const versionDryPath = path.join(root, 'scripts/version-finalize.mjs');
const versionDryText = fs.existsSync(versionDryPath) ? read(versionDryPath) : '';
check(/dry-run only/.test(versionDryText) && /CHANGELOG\.md must contain a pending/.test(versionDryText)
  && /CHANGELOG\.md must contain a finalized/.test(versionDryText),
  'Phase 7B: version finalization dry-run handles pending and finalized changelog states');
check(/README\.md must keep the runtime install example version-neutral/.test(versionDryText),
  'Phase 7A: version dry-run guards README install docs against stale versioned paths');
check(fs.existsSync(path.join(root, 'docs/RELEASE_0.5.0.md')), 'Phase 7A: concise release handoff exists');

const skillsDir = path.join(root, 'skills');
const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name);
check(skillDirs.length > 0, 'skills/ contains at least one skill');

const skillNames = new Set(skillDirs);
for (const name of skillDirs) {
  const sp = path.join(skillsDir, name, 'SKILL.md');
  if (!fs.existsSync(sp)) { fail(`skills/${name}/SKILL.md exists`); continue; }
  const fm = frontmatter(read(sp));
  if (!fm) { fail(`skills/${name}/SKILL.md has frontmatter`); continue; }
  check(fm.name === name, `skills/${name}: frontmatter name matches dir`);
  check(!!fm.description, `skills/${name}: has a description`);
  if (fm.description) {
    check(fm.description.length <= 1024, `skills/${name}: description within 1024 chars (${fm.description.length})`);
  }
}

// ── 3. Commands have a frontmatter description ──────────────────────────────
const cmdDir = path.join(root, 'commands');
if (isDir(cmdDir)) {
  for (const f of fs.readdirSync(cmdDir).filter((f) => f.endsWith('.md'))) {
    const fm = frontmatter(read(path.join(cmdDir, f)));
    check(fm && !!fm.description, `commands/${f}: has a frontmatter description`);
  }
}

const qualifiedLauncher = '/cost-oriented-agentic-workflow:cost-oriented-agentic-workflow';
check(read(path.join(root, 'README.md')).includes(qualifiedLauncher),
  'README uses the qualified standard launcher command');
check(/\/plugin marketplace add <runtime-package-dir>/.test(read(path.join(root, 'README.md'))),
  'README uses a version-neutral runtime install path');
check(read(path.join(root, 'hooks/README.md')).includes(qualifiedLauncher),
  'hooks README uses the qualified standard launcher command');
const agentsDoc = read(path.join(root, 'AGENTS.md'));
const handoffDoc = read(path.join(root, 'docs', 'HANDOFF.md'));
const hooksReadme = read(path.join(root, 'hooks', 'README.md'));
const phaseLedger = read(path.join(root, 'docs', 'architecture', 'v0.5.0', 'PHASES.md'));
const hookArchitecture = read(path.join(root, 'docs', 'architecture', 'v0.5.0', '04-state-machine-and-hook-enforcement.md'));
const masterHandoff = read(path.join(root, 'docs', 'architecture', 'v0.5.0', 'COW-MASTER-HANDOFF.md'));
const currentDocs = [
  ['AGENTS.md', agentsDoc],
  ['docs/HANDOFF.md', handoffDoc],
  ['hooks/README.md', hooksReadme],
  ['docs/architecture/v0.5.0/PHASES.md', phaseLedger],
  ['docs/architecture/v0.5.0/04-state-machine-and-hook-enforcement.md', hookArchitecture],
  ['docs/architecture/v0.5.0/COW-MASTER-HANDOFF.md', masterHandoff],
];
// No doc may hardcode a local checkout path, a personal path, or the local
// username — checked generically across ALL docs, not a named subset.
const LOCAL_PATH_DOC_RE = /[A-Za-z]:\\{1,2}Users\\{1,2}|\/c\/Users\/|\/Users\/[A-Za-z]|gencberke|cost-oriented-agentic-workflow-phase\w+/i;
const pathCheckDocs = walk(path.join(root, 'docs')).filter((f) => f.endsWith('.md') || f.endsWith('.json'))
  .concat([path.join(root, 'README.md'), path.join(root, 'AGENTS.md'), path.join(root, 'hooks', 'README.md')]);
for (const f of pathCheckDocs) {
  check(!LOCAL_PATH_DOC_RE.test(read(f)), `${rel(f)}: no hardcoded local checkout, personal path, or username`);
}
for (const [docName, docText] of [
  ['AGENTS.md', agentsDoc],
  ['docs/architecture/v0.5.0/PHASES.md', phaseLedger],
  ['docs/architecture/v0.5.0/04-state-machine-and-hook-enforcement.md', hookArchitecture],
  ['docs/architecture/v0.5.0/COW-MASTER-HANDOFF.md', masterHandoff],
]) {
  check(!/deferred to Phase 6/i.test(docText),
    `${docName}: current docs defer live enforcement to evidence, not a stale phase number`);
}
check(/COW_RESUME_POINTER_V1/.test(hooksReadme) && !/COW_ENTRY_INJECTED sentinel/.test(hooksReadme),
  'hooks README documents the actual SessionStart resume pointer, not a nonexistent injected sentinel');
check(/Preserve unrelated dirty or untracked work/.test(handoffDoc) && !/phase_7\.md|analyze-apply-project-rules/.test(handoffDoc),
  'handoff uses generic preservation guidance instead of local task artifacts');

// ── 4. Relative markdown links resolve to a real file ───────────────────────
const mdFiles = walk(root).filter((f) => f.endsWith('.md'));
const linkRe = /\[[^\]]+\]\(([^)]+)\)/g;
for (const file of mdFiles) {
  const text = read(file);
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    let target = m[1].trim();
    if (/^(https?:|mailto:|#)/i.test(target)) continue; // external / anchor
    target = target.split('#')[0];               // strip anchor
    if (!target) continue;
    const resolved = path.resolve(path.dirname(file), target);
    check(fs.existsSync(resolved), `${rel(file)}: link "${target}" resolves`);
  }
}

// ── 5. Qualified cross-refs point at a real skill, command, OR agent ────────
// `cost-oriented-agentic-workflow:<name>` is valid if <name> is a skill dir, a
// command (e.g. `:production`), or a plugin agent (e.g. `:cow-implementer` — the
// scoped identifier used to dispatch a plugin agent, added in v0.5.0 Phase 2).
const commandNames = isDir(cmdDir)
  ? fs.readdirSync(cmdDir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
  : [];
const agentsDir = path.join(root, 'agents');
const agentNames = isDir(agentsDir)
  ? fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
  : [];
const validRefs = new Set([...skillNames, ...commandNames, ...agentNames]);
const refRe = /cost-oriented-agentic-workflow:([a-z][a-z0-9-]*)/g;
const textExt = new Set(['.md', '.mjs', '.json', '.cmd', '.sh', '.txt']);
for (const file of walk(root)) {
  if (!textExt.has(path.extname(file))) continue;
  const text = read(file);
  let m;
  while ((m = refRe.exec(text)) !== null) {
    const n = m[1];
    check(validRefs.has(n), `${rel(file)}: ref cost-oriented-agentic-workflow:${n} resolves (skill, command, or agent)`);
  }
}

// ── 6. Policy invariants (load-bearing P0/P1 anchors) ───────────────────────
// These are intentionally few and loose. If you deliberately rename a concept,
// update the token here in the same commit. They guard against a sync silently
// deleting a core gate, not against rewording.
function grepSkill(name, re, label) {
  const sp = path.join(skillsDir, name, 'SKILL.md');
  if (!fs.existsSync(sp)) return fail(`policy: skills/${name} exists (${label})`);
  check(re.test(read(sp)), `policy: ${label}`);
}
grepSkill('using-cost-oriented-workflow', /light[- ]path/i, 'entry skill keeps the triage light-path');
grepSkill('using-cost-oriented-workflow', /main`?\/`?master/i, 'entry skill keeps the main/master guard');
grepSkill('using-cost-oriented-workflow', /Risk classification/i, 'entry skill keeps the risk-classification spine');
grepSkill('using-cost-oriented-workflow', /Hard exclusions/i, 'entry skill keeps the light-path hard exclusions');
grepSkill('using-cost-oriented-workflow', /observable facts.*not hidden chain-of-thought.*Route:/is,
  'entry skill emits a bounded visible route receipt');
grepSkill('using-cost-oriented-workflow', /Light-path escape hatch.*second independent outcome.*dependency.*test harness.*hypothesis fails.*scope\/risk rises/is,
  'entry skill re-triages concrete light-path expansion signals');
grepSkill('writing-plans', /MODE:\s*standard/i, 'writing-plans keeps the anchor header');
grepSkill('writing-plans', /CADENCE:/i, 'writing-plans anchor keeps the cadence line');
grepSkill('writing-plans', /Route hint:\*\* inline \| delegate.*advisory/is,
  'writing-plans records a non-binding per-task route hint');
grepSkill('execution-routing', /HEAD~1/i, 'execution-routing keeps the HEAD~1 warning');
grepSkill('execution-routing', /non-binding `Route hint`.*runtime evidence still governs.*Record only the actual `route=`/is,
  'execution-routing may override route hints and records the actual route');
grepSkill('verification-before-completion', /NO COMPLETION CLAIM/i, 'verification keeps its Iron Law');
grepSkill('systematic-debugging', /ROOT CAUSE/i, 'systematic-debugging keeps its Iron Law');
grepSkill('systematic-debugging', /tracked diagnostic edit.*return to size\/risk triage.*before writing/is,
  'systematic-debugging separates diagnosis from implementation');
grepSkill('systematic-debugging', /cheap domain map.*disjoint subsystems.*read-only Sonnet investigator/is,
  'systematic-debugging routes evidenced disjoint domains to investigators');
grepSkill('dispatching-parallel-agents', /symptom count alone.*cheap domain map.*read-only investigators/is,
  'parallel diagnosis requires a domain map before dispatch');

// ── v0.4.1 routing escape-hatch invariants ──────────────────────────────────
// Three loopholes the Flutter routing dogfood exposed: (1) "the fixes are small,
// so I'll investigate the disjoint domains inline"; (2) a tracked diagnostic
// edit silently inheriting the light diagnosis route; (3) two independent
// outcomes collapsing onto one light-inline change because they share a file.
// The tested language lives in the authoritative skill sections, not as loose
// phrases — if a concept is reworded, update the token here in the same commit.

// 6.1 — disjoint diagnosis is delegated independently of eventual fix size.
grepSkill('systematic-debugging', /disjoint-domain diagnosis delegation is decided independently of how small the fixes look/i,
  'systematic-debugging: diagnosis delegation is decided independently of eventual fix size');
grepSkill('systematic-debugging', /apparent smallness never keeps the token-heavy investigation in the controller/i,
  'systematic-debugging: smallness is not a valid override for disjoint diagnosis delegation');

// 6.2 — a tracked diagnostic edit ends read-only diagnosis and re-routes first.
grepSkill('systematic-debugging', /read-only diagnosis ends at that first tracked edit/i,
  'systematic-debugging: a tracked diagnostic edit ends read-only diagnosis');
grepSkill('systematic-debugging', /Re-route:[^\n]*receipt before that first tracked edit, never after/i,
  'systematic-debugging: the Re-route receipt precedes the first tracked edit');
grepSkill('systematic-debugging', /dependency.*configuration.*harness.*schema becomes a planned elevated diagnostic unit/is,
  'systematic-debugging: dependency/harness/config/schema expansion becomes a planned elevated diagnostic unit');
grepSkill('systematic-debugging', /approval of a diagnostic technique.*never preserves the earlier light-inline route/is,
  'systematic-debugging: user approval of a method does not inherit the earlier route');
grepSkill('systematic-debugging', /temporary diagnostic dependency or harness carries an explicit cleanup disposition/i,
  'systematic-debugging: temporary diagnostic instrumentation carries a cleanup disposition');

// 6.3 — file overlap is not a unit boundary; independent outcomes stay separate.
grepSkill('writing-plans', /outcome \+ responsibility \+ verification seam.*not the file set/is,
  'writing-plans: unit boundary is outcome + responsibility + verification seam, not the file set');
grepSkill('writing-plans', /Two independent outcomes in one file are either separate sequential units or one .*delegated batch.*separate acceptance criteria and separate regression verification/is,
  'writing-plans: same-file independent outcomes are separate units or a delegated batch with separate acceptance/verification');
grepSkill('writing-plans', /same-file . same-unit, and overlapping edits are sequenced, never parallelized/i,
  'writing-plans: same-file overlap is sequenced, not merged into one unit');
grepSkill('using-cost-oriented-workflow', /Two independent user-visible outcomes are never one light-inline change/i,
  'entry skill: two independent outcomes cannot remain light-inline');
grepSkill('using-cost-oriented-workflow', /Same file, each fix small.*does not license light-inline/i,
  'entry skill: "same file, each fix small" does not license light-inline');

const productionCommandText = read(path.join(cmdDir, 'production.md'));
const standardCommandText = read(path.join(cmdDir, 'cost-oriented-agentic-workflow.md'));
check(/execute or resume.*approved plan.*execution-routing.*before inspecting progress or implementing/is.test(standardCommandText),
  'standard launcher routes approved-plan execution and resume before progress inspection');
check(/Resume must read.*workspace `progress\.md`.*never look for ledger entries inside the plan/is.test(standardCommandText),
  'standard launcher reads resume state from the workspace ledger');
check(/standard \/ low.*self-review, not a per-task Agent.*fresh independent Sonnet Agent.*whole-work review/is.test(standardCommandText),
  'standard launcher preserves low-risk task economy and requires independent final review');
check(/bug, test failure, or unexpected behavior.*systematic-debugging.*before inspecting the repository/is.test(standardCommandText),
  'standard launcher invokes systematic debugging before bug exploration');
check(/execute or resume.*approved plan.*execution-routing.*before inspecting progress or implementing/is.test(productionCommandText),
  'production launcher routes approved-plan execution and resume before progress inspection');
check(/Resume must read.*workspace `progress\.md`.*never look for ledger entries inside the plan/is.test(productionCommandText),
  'production launcher reads resume state from the workspace ledger');
check(/every planned task.*independent reviewer.*model: sonnet/is.test(productionCommandText),
  'production launcher pins planned-task reviewers to Sonnet');
check(/whole-work review.*model: opus/is.test(productionCommandText),
  'production launcher pins the final whole-work reviewer to Opus');
check(/bug, test failure, or unexpected behavior.*systematic-debugging.*before inspecting the repository/is.test(productionCommandText),
  'production launcher invokes systematic debugging before bug exploration');

// Mode-aware review routing is data-driven so standard/low cannot silently
// inherit production's mandatory per-task reviewer (or vice versa).
const routingFixturePath = path.join(root, 'tests/fixtures/review-routing.json');
let routingCases = [];
try {
  const fixture = JSON.parse(read(routingFixturePath));
  routingCases = Array.isArray(fixture.cases) ? fixture.cases : [];
  ok('review-routing fixture is valid JSON');
} catch (e) {
  fail(`review-routing fixture is valid JSON — ${e.message}`);
}

const entryText = read(path.join(skillsDir, 'using-cost-oriented-workflow', 'SKILL.md'));
const matrixRows = entryText.split(/\r?\n/)
  .filter((line) => line.startsWith('|') && line.includes('/'))
  .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));

function matrixDecision(mode, risk) {
  const exact = `${mode} / ${risk}`;
  const row = matrixRows.find((cells) => {
    const key = (cells[0] || '').replace(/[`*]/g, '').trim().toLowerCase();
    return key === exact || (mode === 'production' && key === 'production / any planned task');
  });
  const token = row?.[1]?.match(/`([^`]+)`/);
  return token ? token[1] : null;
}

check(routingCases.length >= 6, 'review-routing fixture covers the mode/risk matrix');
for (const c of routingCases) {
  check(matrixDecision(c.mode, c.risk) === c.expected,
    `review-routing: ${c.mode}/${c.risk} => ${c.expected}`);
}
check(matrixDecision('standard', 'low') !== matrixDecision('production', 'low'),
  'review-routing keeps standard-low distinct from production-low');
grepSkill('using-cost-oriented-workflow', /Critical\/Important fix.*required:fresh-targeted/i,
  'review-routing requires a fresh targeted review after Critical/Important fixes');

grepSkill('execution-routing', /Mode\/risk matrix requires independent task review\?/i,
  'execution-routing branches on mode/risk review routing');
grepSkill('execution-routing', /at most \*\*2 remediation waves\*\*/i,
  'execution-routing caps autonomous remediation at two waves');
grepSkill('execution-routing', /Budget exhausted ≠ approved/i,
  'execution-routing never treats exhausted budget as approval');
grepSkill('execution-routing', /Unit N.*route=<inline\|delegate>.*risk=<low\|elevated\|high>.*files=<paths>.*review=<none\|required:clean>.*waves=<0\.\.2>.*verify=<result>.*commit=<base\.\.head>/s,
  'execution-routing ledger records route, risk, scope, review, waves, verification, and commits');
grepSkill('execution-routing', /persist `waves=2`.*blocked.*resume cannot reset the budget/i,
  'execution-routing persists exhausted remediation state across resume');
grepSkill('execution-routing', /Base directory for this skill.*\$SKILL_DIR.*cow-workspace/is,
  'execution-routing resolves helpers from the supplied skill base directory');
grepSkill('execution-routing', /Repo-relative `scripts\/\.\.\.`.*suppressed helper failures/is,
  'execution-routing forbids repo-relative helpers and swallowed initialization failures');
grepSkill('execution-routing', /git status --short -- \.cost-oriented-agentic-workflow\/.*must be empty/is,
  'execution-routing verifies workspace artifacts remain ignored at the final gate');
grepSkill('execution-routing', /commit=UNIT_BASE\.\.new_HEAD.*never substitute `MERGE_BASE_SHA`/is,
  'execution-routing records per-unit commit ranges from the unit base');
grepSkill('execution-routing', /independent whole-work review.*never controller self-review/is,
  'execution-routing keeps final review independent from the controller');

// Phase 4 contracts: run identity, compaction idempotency, commit authority,
// bounded outputs, verification ownership, and runtime prose budget.
const executionText = read(path.join(skillsDir, 'execution-routing', 'SKILL.md'));
const writingText = read(path.join(skillsDir, 'writing-plans', 'SKILL.md'));
const finishingText = read(path.join(skillsDir, 'finishing-a-development-branch', 'SKILL.md'));
const verificationText = read(path.join(skillsDir, 'verification-before-completion', 'SKILL.md'));
const tddText = read(path.join(skillsDir, 'test-driven-development', 'SKILL.md'));
const implementerText = read(path.join(skillsDir, 'execution-routing', 'implementer-prompt.md'));
const cowReviewerText = read(path.join(root, 'agents', 'cow-reviewer.md'));
const securityLensPath = path.join(skillsDir, 'requesting-review', 'references', 'security-lens.md');

check(/PLAN_FILE:.*MODE:.*COMMIT_POLICY:.*BASE_BRANCH:.*MERGE_BASE_SHA:/s.test(executionText),
  'execution-routing pins the complete run-identity ledger header');
check(/MERGE_BASE_SHA.*ledger.*review/s.test(executionText) && !/git merge-base main HEAD/.test(executionText),
  'execution-routing final review uses the recorded merge-base SHA');
check(/never mistake the feature branch's upstream for its base/i.test(executionText),
  'execution-routing does not confuse feature upstream with base branch');
check(/BASE_BRANCH=.*LEDGER/.test(finishingText) && /MERGE_BASE_SHA=.*LEDGER/.test(finishingText),
  'finishing reads base branch and merge-base SHA from the ledger');
check(/BASE_BRANCH.*refs\/heads\/.*MERGE_BASE_SHA\^\{commit\}.*stop/s.test(finishingText),
  'finishing rejects unresolved ledger branch and merge-base values');
check(/detached HEAD.*never offer local merge/i.test(finishingText),
  'finishing removes local merge from detached HEAD');

// The deprecated hooks/session-start and hooks/run-hook.cmd wrappers were
// removed; SessionStart behavior lives in cow-hook.mjs and is covered by
// tests/hooks.test.mjs. No wrapper file may reappear.
check(!fs.existsSync(path.join(root, 'hooks/session-start')) && !fs.existsSync(path.join(root, 'hooks/run-hook.cmd')),
  'deprecated hook wrapper scripts stay removed (hooks/session-start, hooks/run-hook.cmd)');
check(/COW_ENTRY_INJECTED.*absent.*exactly once.*present.*do not reload/s.test(writingText),
  'writing-plans makes entry loading idempotent after compaction');
check(/green checkpoint.*controller owns controlled commits/s.test(tddText),
  'TDD records green checkpoints without granting agent commit authority');
check(/Never commit or stage.*COMMIT_POLICY.*metadata/s.test(implementerText),
  'implementer never commits; COMMIT_POLICY is controller-owned metadata');

check(/at most 8 lines/i.test(implementerText) && /test count/i.test(implementerText)
  && /never full logs/i.test(implementerText),
  'implementer output and full-report evidence are bounded');
// The reviewer role is the scoped cow-reviewer agent (the legacy
// general-purpose reviewer templates were retired); its contract must keep
// preserving C/I findings while bounding low-value output.
check(/Return every Critical and Important finding/.test(cowReviewerText)
  && /cap Minor at 3/.test(cowReviewerText)
  && /≤ 60 lines/.test(cowReviewerText)
  && /No\s+prose, chain-of-thought/s.test(cowReviewerText),
  'cow-reviewer preserves C/I findings while bounding low-value output');
const securityLensText = fs.existsSync(securityLensPath) ? read(securityLensPath) : '';
check(/cow-reviewer/.test(securityLensText) && /Authn\/authz/.test(securityLensText)
  && /Secrets\/tokens/.test(securityLensText) && /Dependencies\/migrations/.test(securityLensText),
  'security lens reference exists and targets the cow-reviewer dispatch');
check(read(path.join(skillsDir, 'requesting-review', 'SKILL.md')).includes('references/security-lens.md'),
  'requesting-review routes security-sensitive review through the security lens reference');
{
  const gpFiles = walk(skillsDir)
    .concat(isDir(agentsDir) ? walk(agentsDir) : [], isDir(cmdDir) ? walk(cmdDir) : [])
    .filter((f) => f.endsWith('.md') && read(f).includes('Subagent (general-purpose)'))
    .map(rel);
  check(gpFiles.length === 0,
    `no packaged prose instructs a general-purpose dispatch (${gpFiles.join(', ') || 'clean'})`);

  // Packaged prose is read by installed-runtime users who have no phase
  // ledger — dev-internal phase annotations that contradict shipped behavior
  // must not survive into skills or agents.
  const STALE_PHRASES = ['once it ships', 'still the legacy path', 'in Phase 2 this is a contract'];
  const staleHits = walk(skillsDir).concat(isDir(agentsDir) ? walk(agentsDir) : [])
    .filter((f) => f.endsWith('.md'))
    .flatMap((f) => STALE_PHRASES.filter((p) => read(f).includes(p)).map((p) => `${rel(f)}: "${p}"`));
  check(staleHits.length === 0,
    `packaged prose carries no known-stale phase annotations (${staleHits.join('; ') || 'clean'})`);
}
check(/this turn.*HEAD, index, and working tree are unchanged/s.test(verificationText)
  && /merge always requires a new run/i.test(verificationText),
  'verification reuses only identical-state evidence and re-runs after merge');

const dispatchTemplates = [
  'skills/execution-routing/implementer-prompt.md',
];
// Runtime prose budget, refined for the 0.5.0 control plane (Phase 1).
//
// The "always-on" core — the entry/routing skills the controller loads as part of
// steady-state context, plus the dispatch templates — is capped together at 86,000
// bytes to protect controller context. An ON-DEMAND skill is loaded only when its
// specific process runs (e.g. repository-intake fires only when a repo needs
// mapping); it is NOT part of the steady-state controller context. Such skills are
// therefore measured SEPARATELY against their own small ceilings. This keeps a new
// on-demand skill from silently inflating the always-on budget, and — because the
// always-on set is unchanged — guarantees the existing counted prose does not grow.
const ON_DEMAND_SKILL_CEILINGS = { 'repository-intake': 3500 };
const runtimeProseFiles = [
  ...skillDirs.filter((name) => !(name in ON_DEMAND_SKILL_CEILINGS)).map((name) => `skills/${name}/SKILL.md`),
  ...dispatchTemplates,
];
const runtimeBytes = runtimeProseFiles.reduce((sum, file) =>
  sum + Buffer.byteLength(read(path.join(root, file)), 'utf8'), 0);
// 86,000 is the absolute ceiling; Phase 3A.1 tightened the maintainable GATE to
// 85,000 (≥1,000 bytes headroom for Phase 3B) by moving duplicated operational
// detail into on-demand references — never by deleting safety rules.
check(runtimeBytes <= 85000, `always-on runtime prose stays within the 85000-byte gate (${runtimeBytes}; absolute ceiling 86000)`);
for (const [name, ceiling] of Object.entries(ON_DEMAND_SKILL_CEILINGS)) {
  const f = `skills/${name}/SKILL.md`;
  if (!fs.existsSync(path.join(root, f))) { fail(`on-demand skill ${f} exists`); continue; }
  const bytes = Buffer.byteLength(read(path.join(root, f)), 'utf8');
  check(bytes <= ceiling, `${f} within its on-demand ceiling (${bytes}/${ceiling})`);
}

const baselineBytes = {
  'skills/using-cost-oriented-workflow/SKILL.md': 13013,
  'skills/execution-routing/SKILL.md': 13248,
  'skills/execution-routing/implementer-prompt.md': 4355,
};
for (const [file, baseline] of Object.entries(baselineBytes)) {
  const current = Buffer.byteLength(read(path.join(root, file)), 'utf8');
  check(current <= baseline * 1.10,
    `${file} stays within 110% of v0.3.2 baseline (${current}/${baseline})`);
}

// Phase 5 contracts: offline token telemetry and hidden-ground-truth review evals.
const analyzerPath = path.join(root, 'tests/eval/analyze-token-usage.py');
const analyzerText = read(analyzerPath);
for (const token of ['--json', '--input-price-per-million', '--output-price-per-million',
  'cache_read_input_tokens', 'cache_creation_input_tokens', 'malformed_lines']) {
  check(analyzerText.includes(token), `token analyzer keeps ${token}`);
}
const evalFixtureRoot = path.join(root, 'tests/eval/fixtures');
const evalFixtureIds = [
  'expired-jwt-500',
  'refresh-as-access',
  'legacy-access-type-rollout',
  'upstream-4xx-collapsed',
  'preexisting-secret',
  'reset-password-npe-control',
];
for (const id of evalFixtureIds) {
  for (const file of ['brief.md', 'review.diff', 'expected.json']) {
    check(fs.existsSync(path.join(evalFixtureRoot, id, file)), `review eval ${id}/${file} exists`);
  }
}
const dogfoodText = read(path.join(root, 'docs/DOGFOOD.md'));
check(/ledger.*JSONL/s.test(dogfoodText) && /no dollar\s+claim/s.test(dogfoodText),
  'dogfood separates ledger routing from optional JSONL cost estimates');
check(/provide only `brief\.md` and `review\.diff`.*Never expose `expected\.json`/is.test(dogfoodText),
  'dogfood protects raw discovery from expected-result leakage');
check(/Run zero live smokes by default/s.test(dogfoodText)
  && /N=3 for release-blocking behavioral scenarios/s.test(dogfoodText)
  && /Up to N=5 only for a scenario whose results vary/s.test(dogfoodText),
  'dogfood defaults to usage-efficient smokes and reserves repeat sampling for Phase 6');

// ── Phase 3A: discovery control-plane structure + reference budgets ──────────
// Detailed readiness/discovery rules live in on-demand references (measured
// separately from the always-on bucket); the entry skill keeps only the ordering
// and pointers. These assert the live discovery contract in coherent groups.
const readRef = (rel) => { const ap = path.join(root, rel); return fs.existsSync(ap) ? read(ap) : ''; };
const READINESS = 'skills/using-cost-oriented-workflow/references/repository-readiness.md';
const DISCOVERY = 'skills/using-cost-oriented-workflow/references/discovery-routing.md';
const ROUTING_CUES = 'skills/using-cost-oriented-workflow/references/routing-cues.md';
for (const [relRef, ceil] of [[READINESS, 5500], [DISCOVERY, 4500], [ROUTING_CUES, 2500]]) {
  const b = Buffer.byteLength(readRef(relRef), 'utf8');
  check(b > 0 && b <= ceil, `${relRef} within its on-demand reference ceiling (${b}/${ceil})`);
}
// Normalize markdown emphasis + line wraps so assertions check semantic content.
const norm = (s) => s.replace(/\*/g, '').replace(/\s+/g, ' ');
const readinessRef = norm(readRef(READINESS));
const discoveryRef = norm(readRef(DISCOVERY));
const rawReadiness = readRef(READINESS);
const rawDiscovery = readRef(DISCOVERY);
const entrySkillText = norm(read(path.join(skillsDir, 'using-cost-oriented-workflow', 'SKILL.md')));
const sysDebugText = norm(read(path.join(skillsDir, 'systematic-debugging', 'SKILL.md')));

check(/Repository readiness precedes broad exploration/i.test(entrySkillText),
  'routing: entry skill orders repository readiness before broad exploration');
check(/Activation order/i.test(readinessRef) && /must not broadly read source files/i.test(readinessRef),
  'routing: readiness reference defines the activation order and forbids broad source reading first');
check(rawReadiness.includes('cost-oriented-agentic-workflow:cow-repo-investigator')
  && rawDiscovery.includes('cost-oriented-agentic-workflow:cow-debug-investigator'),
  'routing: references name the exact scoped investigator identifiers');
check(/never rely on automatic selection/i.test(readinessRef) && /never auto-select/i.test(entrySkillText),
  'routing: exact scoped dispatch, never automatic agent selection');
check(/silently fall back to a generic agent/i.test(readinessRef),
  'routing: no silent generic fallback');
check(/(validate-agent-output|accept-agent-output)/.test(readinessRef)
  && /never manually declares an unvalidated profile valid/i.test(readinessRef),
  'routing: profile acceptance is mandatory before the profile is trusted');
check(/stays `pending` here/.test(entrySkillText) && /implementation=pending/.test(entrySkillText),
  'routing: entry skill keeps discovery separate from a pending implementation route');
check(/stays `pending` through discovery/.test(discoveryRef) && /execution-routing[^)]{0,8}\(live since Phase 3B\.1\)/i.test(discoveryRef),
  'routing: implementation stays pending through discovery; execution-routing (live since 3B.1) selects it');
check(/at most three targeted source\/config reads/i.test(discoveryRef) && /at most one bounded Grep or Glob/i.test(discoveryRef),
  'routing: controller-map has a concrete read budget');
check(/Maximum 2\./.test(discoveryRef) && /at most two .{0,3}cow-debug-investigator/i.test(discoveryRef),
  'routing: disjoint domains dispatch at most two investigators');
check(/REQUIRES_REROUTE/.test(sysDebugText) && /TRACKED_DIAGNOSTIC_INSTRUMENTATION/.test(sysDebugText)
  && /Re-route:[^\n]*before that first tracked edit/i.test(sysDebugText),
  'routing: tracked diagnostic instrumentation re-routes before any tracked edit');
check(/cow-state.mjs root-cause/.test(sysDebugText) && /controller[^.]*adjudicates the diagnosis/i.test(sysDebugText),
  'routing: the controller (not the investigator) owns diagnosis adjudication + state');

// ── Skill-followability: documented CLI enum values must be real ─────────────
// A packaged skill or agent that documents an invalid cow-state value teaches
// the controller a command that fails at runtime (`invalid --status`). Every
// `<a|b|c>` / `(a|b|c)` value list adjacent to a cow-state flag must be a
// subset of the enum exported by cow-state-core.mjs. The pattern is
// conservative: only bracketed lists of two or more plain tokens are checked.
{
  const ENUM_LIST_RE = (flag) => new RegExp(`${flag}\\s*[<(]\`?([a-z0-9-]+(?:\\s*[|/]\\s*[a-z0-9-]+)+)\`?[>)]`, 'g');
  const FLAG_ENUMS = [
    ['root-cause --status', ROOTCAUSE_STATUS],
    ['block --reason', BLOCK_CODES],
    ['transition --phase', STATE_PHASES],
    ['route --discovery', DISCOVERY_ROUTES],
    ['route --implementation', IMPLEMENTATION_ROUTES],
    ['--commit-policy', COMMIT_POLICIES],
  ];
  const followFiles = walk(skillsDir).concat(isDir(agentsDir) ? walk(agentsDir) : []).filter((f) => f.endsWith('.md'));
  let followLists = 0;
  for (const file of followFiles) {
    const text = read(file);
    for (const [flag, allowed] of FLAG_ENUMS) {
      const re = ENUM_LIST_RE(flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      let m;
      while ((m = re.exec(text)) !== null) {
        followLists += 1;
        for (const v of m[1].split(/[|/]/).map((x) => x.trim()).filter(Boolean)) {
          check(allowed.includes(v), `${rel(file)}: documented \`${flag}\` value "${v}" is a real cow-state enum value`);
        }
      }
    }
  }
  check(followLists >= 1, 'skill-followability: at least one documented cow-state enum list is under test');
}

// ── Phase 3A.1: warm-profile boundary + moved-content + safety invariants ────
check(/Profile validity controls repository intake\. Task uncertainty controls/i.test(readinessRef),
  'warm rule: profile validity (intake) and task uncertainty (task discovery) are separate decisions');
check(/VALID`?[^\n]*no `?PROFILE_DRAFT`? dispatch/i.test(readinessRef),
  'warm rule: a VALID profile triggers no PROFILE_DRAFT dispatch');
check(/do not authorize `?PROFILE_DRAFT`?/i.test(readinessRef),
  'warm rule: dirty source paths alone do not authorize PROFILE_DRAFT');
check(/dirty tree alone never authorizes intake/i.test(entrySkillText),
  'warm rule: entry skill states a dirty tree alone never authorizes intake');
const cuesRef = readRef('skills/using-cost-oriented-workflow/references/routing-cues.md');
check(/Positive route cues/i.test(cuesRef) && /light-inline/.test(cuesRef) && /delegate/i.test(cuesRef),
  'moved detail: the positive route cues live in routing-cues.md');
check(/references\/routing-cues\.md/.test(entrySkillText),
  'moved detail: the entry skill points to the routing-cues reference');
check(/Hard exclusions/i.test(entrySkillText) && /Risk classification/i.test(entrySkillText),
  'safety: the reclaim kept risk classification + hard exclusions in the entry skill');
check(/NO FIX WITHOUT ROOT CAUSE FIRST/.test(sysDebugText),
  'safety: systematic-debugging keeps the root-cause Iron Law after the reclaim');

// ── Phase 3B.1: implementation control-plane structure + reference budgets ───
// Detailed routing tables, the dispatch/validation sequence, and the report
// schema live in on-demand references (measured separately); the primary skill
// keeps the route gate, the dispatch contract, and the validation tripwires.
const IMPL_ROUTING = 'skills/execution-routing/references/implementation-routing.md';
const DELEGATED_EXEC = 'skills/execution-routing/references/delegated-execution.md';
const IMPL_REPORT_REF = 'skills/execution-routing/references/implementation-report.md';
for (const [relRef, ceil] of [[IMPL_ROUTING, 4500], [DELEGATED_EXEC, 4500], [IMPL_REPORT_REF, 4000]]) {
  const b = Buffer.byteLength(readRef(relRef), 'utf8');
  check(b > 0 && b <= ceil, `${relRef} within its on-demand reference ceiling (${b}/${ceil})`);
}
const implRoutingRef = norm(readRef(IMPL_ROUTING));
const delegatedExecRef = norm(readRef(DELEGATED_EXEC));
const implReportRef = norm(readRef(IMPL_REPORT_REF));
const execNorm = norm(executionText);

// exact scoped implementer + never automatic selection
check(readRef(DELEGATED_EXEC).includes('cost-oriented-agentic-workflow:cow-implementer')
  && readRef(IMPL_ROUTING).includes('cost-oriented-agentic-workflow:cow-implementer')
  && executionText.includes('cost-oriented-agentic-workflow:cow-implementer'),
  '3B.1: the exact scoped cow-implementer identifier is named in the skill and references');
check(/never automatic selection/i.test(execNorm) && /never rely on automatic agent selection/i.test(implRoutingRef),
  '3B.1: dispatch is explicit — never automatic agent selection');

// the four routes; inline keeps no implementer; delegated dispatches it
check(/inline \| delegated \| planned-sequential \| delegated-batch/.test(execNorm),
  '3B.1: the skill names the four implementation routes');
check(/never dispatch cow-implementer on a true inline route/i.test(execNorm)
  && /never dispatch cow-implementer on a true inline route/i.test(implRoutingRef),
  '3B.1: a true inline route dispatches no implementer');
check(/dispatch the exact .{0,3}cost-oriented-agentic-workflow:cow-implementer/i.test(execNorm),
  '3B.1: delegated work dispatches the exact scoped implementer');

// report is validated against the ACTUAL diff before acceptance
check(/implementation-report\.mjs validate/.test(executionText) && /compare-worktree/.test(executionText),
  '3B.1: the skill validates the report and compares the worktree before acceptance');
check(/the report is evidence, not truth/i.test(execNorm),
  '3B.1: the implementer report is evidence, not the source of truth');
check(/the actual git diff is authoritative over .{0,3}filesChanged/i.test(execNorm)
  && /the actual git diff is authoritative/i.test(delegatedExecRef),
  '3B.1: the actual git diff is authoritative over the report');

// fresh verification + commit belong to the controller; the review gate is kept
check(/fresh controller verification/i.test(execNorm),
  '3B.1: fresh verification belongs to the controller');
check(/the controller commits after review/i.test(execNorm),
  '3B.1: the controller owns the commit, after review');
check(/Mode\/risk matrix requires independent task review\?/i.test(executionText),
  '3B.1: the existing review gate remains in the loop order');

// planned units are sequential; same-file outcomes do not collapse; batches keep per-outcome
check(/one unit at a time; never run overlapping write units in parallel/i.test(implRoutingRef),
  '3B.1: planned-sequential executes one unit at a time, never overlapping writes');
check(/do not collapse units merely because they edit one file/i.test(implRoutingRef),
  '3B.1: same-file independent outcomes do not collapse automatically');
check(/same-file overlap alone is not enough/i.test(implRoutingRef)
  && /the batch brief preserves each outcome separately/i.test(implRoutingRef),
  '3B.1: a delegated batch preserves per-outcome acceptance');

// attempts vs remediation are separate; the report schema is bounded + safe
check(/separate from the review path.s two remediation waves; never merge the counters/i.test(delegatedExecRef),
  '3B.1: implementation attempts are separate from remediation waves');
check(/schemaVersion/.test(implReportRef) && /8 KB/.test(readRef(IMPL_REPORT_REF))
  && /never store chain-of-thought/i.test(implReportRef),
  '3B.1: the report schema is bounded (8 KB) and stores no chain-of-thought');

// cow-reviewer IS integrated as of Phase 3B.2 (see the 3B.2 section below); no
// active hooks; the implementation-report helper exists.
const dispatchSurfaces = walk(skillsDir).concat(isDir(cmdDir) ? walk(cmdDir) : [])
  .filter((f) => f.endsWith('.md')).map((f) => read(f)).join('\n');
check(/cost-oriented-agentic-workflow:cow-reviewer/.test(dispatchSurfaces),
  '3B.2: cow-reviewer is dispatched from the review skills/commands (integrated)');
check(!fs.existsSync(path.join(root, 'hooks/hooks.json')),
  '3B.1: no active hooks/hooks.json (only the .example template)');
check(fs.existsSync(path.join(root, 'skills/execution-routing/scripts/implementation-report.mjs')),
  '3B.1: the implementation-report helper exists');

// ── Phase 3B.1.1: unit-ownership baselines + attempt evidence ────────────────
const rawImplRouting = readRef(IMPL_ROUTING);
const rawDelegated = readRef(DELEGATED_EXEC);
check(fs.existsSync(path.join(root, 'skills/execution-routing/scripts/unit-worktree.mjs')),
  '3B.1.1: the unit-worktree baseline helper exists');
// both routes capture a baseline + check overlap before edit/dispatch
check(executionText.includes('Capture a unit baseline first') && executionText.includes('before any edit or dispatch')
  && executionText.includes('BLOCKED_DIRTY_OVERLAP'),
  '3B.1.1: the skill captures a baseline and checks overlap before edit/dispatch');
check(implRoutingRef.includes('not exempt from ownership safety') && implRoutingRef.includes('capture a unit baseline'),
  '3B.1.1: the inline route also captures a unit baseline');
// exact-path staging mandatory; broad staging forbidden
check(executionText.includes('stage **only** the unit-owned paths') && executionText.includes('verify-stage'),
  '3B.1.1: exact-path staging + verify-stage are mandatory before commit');
check(executionText.includes('never `git add .`/`-A`/`commit -a`'),
  '3B.1.1: broad staging commands are forbidden in the skill');
// the unit baseline is the ownership authority + attempt-qualified artifacts
check(executionText.includes('separates pre-existing dirty user paths from unit-owned changes'),
  '3B.1.1: the unit baseline is the ownership authority');
check(executionText.includes('ATTEMPT_NUMBER, BASELINE_PATH') && executionText.includes('task-<N>-attempt-<K>-report.json'),
  '3B.1.1: the dispatch contract names ATTEMPT_NUMBER + BASELINE_PATH and attempt-qualified reports');
check(rawDelegated.includes('attempt-<n>-report.json') && rawDelegated.includes('never overwrite a prior attempt'),
  '3B.1.1: retry artifacts are attempt-qualified and immutable');
check(delegatedExecRef.includes('same baseline') && delegatedExecRef.includes('final compare is always relative to the original unit baseline'),
  '3B.1.1: a retry keeps the same baseline; the compare is baseline-relative');
check(rawImplRouting.includes('fresh baseline'),
  '3B.1.1: planned-sequential captures a fresh baseline per unit');
// the existing review gate + non-integration still hold
check(/Mode\/risk matrix requires independent task review\?/i.test(executionText),
  '3B.1.1: the existing review gate remains in the loop order');
check(/cost-oriented-agentic-workflow:cow-implementer/.test(dispatchSurfaces)
  && /cost-oriented-agentic-workflow:cow-reviewer/.test(dispatchSurfaces),
  '3B.1.1/3B.2: the implementer and reviewer roles are both integrated and remain distinct');

// ── Phase 3B.2: review control plane (scoped cow-reviewer integration) ────────
// Detailed review routing, the package/report contract, adjudication, and
// remediation/re-review live in on-demand references (measured separately); the
// primary skills keep the scoped reviewer identifier, the validate-before-
// adjudicate tripwire, and the matrix pointer. The mode/risk matrix above is
// PRESERVED, not redesigned (still asserted by the routing-fixture checks).
const REVIEW_ROUTING = 'skills/execution-routing/references/review-routing.md';
const REVIEW_PACKAGE = 'skills/execution-routing/references/review-package.md';
const REVIEW_ADJUDICATION = 'skills/execution-routing/references/review-adjudication.md';
const REMEDIATION_REREVIEW = 'skills/execution-routing/references/remediation-and-rereview.md';
for (const [relRef, ceil] of [[REVIEW_ROUTING, 3000], [REVIEW_PACKAGE, 4000], [REVIEW_ADJUDICATION, 3000], [REMEDIATION_REREVIEW, 3000]]) {
  const b = Buffer.byteLength(readRef(relRef), 'utf8');
  check(b > 0 && b <= ceil, `${relRef} within its on-demand reference ceiling (${b}/${ceil})`);
}
const reviewRoutingRef = norm(readRef(REVIEW_ROUTING));
const reviewPackageRef = norm(readRef(REVIEW_PACKAGE));
const reviewAdjRef = norm(readRef(REVIEW_ADJUDICATION));
const remediationRef = norm(readRef(REMEDIATION_REREVIEW));
const requestingText = read(path.join(skillsDir, 'requesting-review', 'SKILL.md'));

// the helpers exist (zero-dep, Node + git)
check(fs.existsSync(path.join(root, 'skills/requesting-review/scripts/review-report.mjs')),
  '3B.2: the review-report validation helper exists');
check(fs.existsSync(path.join(root, 'skills/requesting-review/scripts/review-package.mjs')),
  '3B.2: the review-package descriptor helper exists');
const reviewPackageHelperText = read(path.join(root, 'skills', 'requesting-review', 'scripts', 'review-package.mjs'));
check(/safeRepoPath\(root, flags\.output, '--output'\)/.test(reviewPackageHelperText)
  && /const out = path\.join\(root, relOut\)/.test(reviewPackageHelperText),
  '3B.2: review-package --output is repo-relative and path-safe before writing');
check(/input evidence/.test(reviewPackageRef) && /output evidence/.test(reviewPackageRef)
  && !/findingLedgerPath,\s*remainingRisks/.test(reviewPackageRef),
  '3B.2: review package docs keep package inputs separate from report remainingRisks output');

// the exact scoped reviewer is named where review is dispatched; never automatic
check(executionText.includes('cost-oriented-agentic-workflow:cow-reviewer')
  && requestingText.includes('cost-oriented-agentic-workflow:cow-reviewer'),
  '3B.2: the exact scoped cow-reviewer is named in execution-routing and requesting-review');
check(/never rely on automatic agent selection/i.test(requestingText) || /never automatic selection/i.test(norm(executionText)),
  '3B.2: review dispatch is explicit — never automatic agent selection');

// validate the report before adjudicating; adjudicate before any fix.
// The primary skill keeps the terse tripwire; the full rule lives in the refs.
check(/review-report\.mjs/.test(executionText) && /adjudicate every finding before any fix is dispatched/i.test(norm(executionText)),
  '3B.2: execution-routing keeps the validate + adjudicate-before-fix tripwire');
check(/REVIEW_PACKAGE_PATH=<pkg>/.test(executionText) && /REVIEW_REPORT_PATH=<report>/.test(executionText),
  '3B.2: execution-routing names review package/report dispatch fields literally');
check(/review-report\.mjs validate <report> --package <pkg>/.test(executionText)
  && /--accepted-finding-ids <ids>/.test(executionText),
  '3B.2: execution-routing validates review reports with package and targeted accepted ids');
check(/omit deferred\/out-of-scope prior findings/i.test(executionText),
  '3B.2: execution-routing tells targeted re-review to omit deferred findings');
check(/review-report\.mjs validate.{0,40}before/is.test(reviewPackageRef),
  '3B.2: the report is validated before adjudication (review-package reference)');
check(/adjudicates each actionable finding before any fix is dispatched/i.test(reviewAdjRef),
  '3B.2: findings are adjudicated before any fix is dispatched (adjudication reference)');
check(/the validated reviewer report is evidence, not a self-executing decision/i.test(reviewAdjRef),
  '3B.2: the reviewer report is evidence, not a self-executing decision');

// the three review scopes are defined in the reference
check(['UNIT_REVIEW', 'TARGETED_REREVIEW', 'WHOLE_WORK_REVIEW'].every((s) => reviewRoutingRef.includes(s)),
  '3B.2: review-routing names the three review scopes');
// the matrix is preserved (the reference mirrors it without redefining policy)
check(/mode\/risk matrix in using-cost-oriented-workflow is authoritative/i.test(reviewRoutingRef)
  && /a `?none`? cell means.{0,40}do not dispatch/i.test(reviewRoutingRef),
  '3B.2: review-routing preserves the matrix and the none-cell (no review) rule');
// production whole-work uses an Opus override of the same reviewer, not a fifth agent
check(/production.{0,40}model: ?opus.{0,40}override/is.test(reviewRoutingRef)
  && /not a fifth agent/i.test(reviewRoutingRef),
  '3B.2: production whole-work review uses a per-invocation Opus override, not a fifth agent');

// causality + blocking model preserved in the package/report + adjudication refs
check(['INTRODUCED', 'WORSENED', 'PRE_EXISTING', 'UNCERTAIN'].every((c) => reviewAdjRef.includes(c))
  && /only.{0,30}INTRODUCED.{0,20}WORSENED.{0,40}block/is.test(reviewAdjRef),
  '3B.2: adjudication preserves causality and the introduced/worsened-only blocking rule');
check(/ACCEPT.{0,30}REJECT.{0,30}DEFER_PRE_EXISTING.{0,30}REQUEST_CLARIFICATION/is.test(reviewAdjRef),
  '3B.2: adjudication defines the four controller decisions');
// the report contract names schema v1 + the 12 KB ceiling
check(/schema.{0,12}v?1/i.test(reviewPackageRef) && /12 ?KB/.test(readRef(REVIEW_PACKAGE)),
  '3B.2: the review report contract is bounded (schema v1, 12 KB)');

// remediation ceiling unchanged (2 waves), separate from retry attempts
check(/at most 2 remediation waves/i.test(remediationRef)
  && /separate.{0,40}retry budget|retry budget.{0,40}separate|never merge/i.test(remediationRef),
  '3B.2: remediation stays at two waves, separate from the retry budget');
check(/TARGETED_REREVIEW/.test(remediationRef) && /fresh `?cow-reviewer`?/i.test(remediationRef),
  '3B.2: targeted re-review uses a fresh cow-reviewer');

// exactly four agents; final release version is consistent
const agentCount = isDir(agentsDir) ? fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')).length : 0;
check(agentCount === 4, `3B.2: exactly four agents remain (no fifth reviewer) (${agentCount})`);
check(plugin && plugin.version === '0.5.0' && packageMeta && packageMeta.version === '0.5.0',
  'final release: the package version is finalized at 0.5.0');

// ── v0.5.1: cost-guard prose safeguards ───────────────────────────────
check(rawDiscovery.includes('at most one reroute per symptom'),
  'v0.5.1: discovery-routing bounds the reroute cycle');
check(executionText.includes('The only reroute edge is'),
  'v0.5.1: execution-routing names the reroute edge');
check(read(path.join(skillsDir, 'dispatching-parallel-agents', 'SKILL.md')).includes('at most 3 concurrent subagent dispatches'),
  'v0.5.1: parallel dispatch has a default width cap');
check(remediationRef.includes('never one fixer per finding'),
  'v0.5.1: remediation forbids per-finding fix fan-out');
check(entryText.includes('Cost red flags'),
  'v0.5.1: entry skill carries the cost red-flags block');

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passes} checks passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
console.log('Structure OK.');

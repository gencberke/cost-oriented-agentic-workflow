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
}

// hooks.json.example must declare a SessionStart hook (the opt-in always-on path)
const hooksEx = parsed['hooks/hooks.json.example'];
if (hooksEx) {
  check(!!(hooksEx.hooks && hooksEx.hooks.SessionStart), 'hooks.json.example declares a SessionStart hook');
}

// ── 2. Every skill: frontmatter, name == dir, description present & bounded ──
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
check(read(path.join(root, 'hooks/README.md')).includes(qualifiedLauncher),
  'hooks README uses the qualified standard launcher command');

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
const taskReviewerText = read(path.join(skillsDir, 'execution-routing', 'task-reviewer-prompt.md'));
const wholeReviewerText = read(path.join(skillsDir, 'requesting-review', 'code-reviewer.md'));
const hookText = read(path.join(root, 'hooks/session-start'));

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

check(hookText.includes('COW_ENTRY_INJECTED'), 'SessionStart hook emits the entry sentinel');
check(/COW_ENTRY_INJECTED.*absent.*exactly once.*present.*do not reload/s.test(writingText),
  'writing-plans makes entry loading idempotent after compaction');
check(/green checkpoint.*COMMIT_POLICY.*controller-per-unit/s.test(tddText),
  'TDD records green checkpoints without granting commit authority');
check(/Commit only when.*COMMIT_POLICY.*implementer/s.test(implementerText),
  'implementer commits only under the implementer policy');

check(/at most 8 lines/i.test(implementerText) && /test count/i.test(implementerText)
  && /never full logs/i.test(implementerText),
  'implementer output and full-report evidence are bounded');
for (const [label, text] of [['task reviewer', taskReviewerText], ['whole reviewer', wholeReviewerText]]) {
  check(/Return every valid\s+Critical and Important\s+finding/s.test(text)
    && /at most the 3\s+highest-impact Minor/s.test(text)
    && /Strengths are at most one line/i.test(text)
    && /no preamble,\s+process narration, or closing summary/s.test(text),
  `${label} preserves C/I findings while bounding low-value output`);
}
check(wholeReviewerText.includes('[PLAN_FILE]') && wholeReviewerText.includes('[BINDING_CONSTRAINTS]')
  && !wholeReviewerText.includes('[PLAN_OR_REQUIREMENTS]'),
  'whole-work reviewer uses plan path plus short binding constraints');
check(/this turn.*HEAD, index, and working tree are unchanged/s.test(verificationText)
  && /merge always requires a new run/i.test(verificationText),
  'verification reuses only identical-state evidence and re-runs after merge');

const dispatchTemplates = [
  'skills/execution-routing/implementer-prompt.md',
  'skills/execution-routing/task-reviewer-prompt.md',
  'skills/requesting-review/code-reviewer.md',
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
  'skills/execution-routing/task-reviewer-prompt.md': 6044,
  'skills/requesting-review/code-reviewer.md': 4557,
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
check(/Provide only `brief\.md` and `review\.diff`.*Never expose `expected\.json`/s.test(dogfoodText),
  'dogfood protects raw discovery from expected-result leakage');
check(/three times.*extend only\s+that fixture to five/s.test(dogfoodText),
  'dogfood uses per-fixture 3-to-5 repeat policy');

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

// cow-reviewer is NOT integrated; no active hooks; the helper exists
const dispatchSurfaces = walk(skillsDir).concat(isDir(cmdDir) ? walk(cmdDir) : [])
  .filter((f) => f.endsWith('.md')).map((f) => read(f)).join('\n');
check(!/cost-oriented-agentic-workflow:cow-reviewer/.test(dispatchSurfaces),
  '3B.1: cow-reviewer is not dispatched from any skill or command (not integrated)');
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
check(!/cost-oriented-agentic-workflow:cow-reviewer/.test(dispatchSurfaces),
  '3B.1.1: cow-reviewer is still not dispatched from any skill or command');

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passes} checks passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
console.log('Structure OK.');

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

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (['.git', 'node_modules'].includes(e.name)) continue;
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
if (plugin && market) {
  check(typeof plugin.name === 'string' && plugin.name.length > 0, 'plugin.json has a name');
  const mp = (market.plugins || []).find((p) => p.name === plugin.name);
  check(!!mp, `marketplace lists plugin "${plugin.name}"`);
  if (mp) check(mp.version === plugin.version, `marketplace version matches plugin.json (${plugin.version})`);
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

// ── 5. Qualified cross-refs point at a real skill OR command ────────────────
// `cost-oriented-agentic-workflow:<name>` is valid if <name> is a skill dir or
// a command (e.g. `:production` is the production launcher command, not a skill).
const commandNames = isDir(cmdDir)
  ? fs.readdirSync(cmdDir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
  : [];
const validRefs = new Set([...skillNames, ...commandNames]);
const refRe = /cost-oriented-agentic-workflow:([a-z][a-z0-9-]*)/g;
const textExt = new Set(['.md', '.mjs', '.json', '.cmd', '.sh', '.txt']);
for (const file of walk(root)) {
  if (!textExt.has(path.extname(file))) continue;
  const text = read(file);
  let m;
  while ((m = refRe.exec(text)) !== null) {
    const n = m[1];
    check(validRefs.has(n), `${rel(file)}: ref cost-oriented-agentic-workflow:${n} resolves (skill or command)`);
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
grepSkill('using-cost-oriented-workflow', /light path/i, 'entry skill keeps the triage light-path');
grepSkill('using-cost-oriented-workflow', /main`?\/`?master/i, 'entry skill keeps the main/master guard');
grepSkill('using-cost-oriented-workflow', /Risk classification/i, 'entry skill keeps the risk-classification spine');
grepSkill('using-cost-oriented-workflow', /Hard exclusions/i, 'entry skill keeps the light-path hard exclusions');
grepSkill('writing-plans', /MODE:\s*standard/i, 'writing-plans keeps the anchor header');
grepSkill('writing-plans', /CADENCE:/i, 'writing-plans anchor keeps the cadence line');
grepSkill('execution-routing', /HEAD~1/i, 'execution-routing keeps the HEAD~1 warning');
grepSkill('verification-before-completion', /NO COMPLETION CLAIM/i, 'verification keeps its Iron Law');
grepSkill('systematic-debugging', /ROOT CAUSE/i, 'systematic-debugging keeps its Iron Law');

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
const runtimeProseFiles = [
  ...skillDirs.map((name) => `skills/${name}/SKILL.md`),
  ...dispatchTemplates,
];
const runtimeBytes = runtimeProseFiles.reduce((sum, file) =>
  sum + Buffer.byteLength(read(path.join(root, file)), 'utf8'), 0);
check(runtimeBytes <= 86000, `runtime prose stays within 86000 bytes (${runtimeBytes})`);

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

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passes} checks passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
console.log('Structure OK.');

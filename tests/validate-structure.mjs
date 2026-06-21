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

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passes} checks passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
console.log('Structure OK.');

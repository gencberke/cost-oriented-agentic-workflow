#!/usr/bin/env node
// Deterministic, zero-dependency contract tests for the four cost-oriented
// plugin agents. Parses the actual Markdown frontmatter + body and asserts the
// cost-pinning, tool-surface, isolation, and contract invariants — in coherent
// groups, not single magic phrases. Run: npm run test:agents

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const agentsDir = path.join(root, 'agents');
let fails = 0, passes = 0;
const check = (cond, msg) => { if (cond) { passes += 1; } else { fails += 1; console.error('FAIL: ' + msg); } };

// Minimal frontmatter parser: scalars (`k: v`), inline comma lists (tools),
// and block lists (`k:` then `  - item`). Returns { fields, listKeys, body }.
function parse(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return null;
  const fmLines = m[1].split(/\r?\n/);
  const fields = {}; const lists = {}; const present = new Set();
  let lastKey = null;
  for (const line of fmLines) {
    const li = line.match(/^\s*-\s+(.*)$/);
    if (li && lastKey) { (lists[lastKey] ||= []).push(li[1].trim()); continue; }
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) { lastKey = kv[1]; present.add(kv[1]); if (kv[2] !== '') fields[kv[1]] = kv[2].trim(); }
  }
  return { fields, lists, present, body: m[2] };
}
const toolList = (v) => (v ? v.split(',').map((t) => t.trim()).filter(Boolean) : []);

// Expected per-agent contract (Phase 2 spec §7).
const SPEC = {
  'cow-repo-investigator': {
    effort: 'low', maxTurns: 10, tools: ['Read', 'Glob', 'Grep'], skills: [], bodyMax: 4500,
    inputs: ['SNAPSHOT_PATH', 'PROFILE_CONTRACT_PATH', 'TASK_CONTEXT', 'OUTPUT_FORMAT', 'READ_SCOPE'],
    outputs: ['STATUS', 'PROFILE_JSON', 'UNCERTAINTIES'], lineCap: 80, shell: false, writes: false,
  },
  'cow-debug-investigator': {
    effort: 'medium', maxTurns: 14, tools: ['Read', 'Glob', 'Grep', 'Bash'],
    skills: ['cost-oriented-agentic-workflow:systematic-debugging'], bodyMax: 6000,
    inputs: ['SYMPTOM', 'REPOSITORY_ROOT', 'READ_SCOPE', 'DIAGNOSIS_REPORT_FORMAT'],
    outputs: ['STATUS', 'REPRODUCTION', 'EVIDENCE', 'ROOT_CAUSE', 'CONFIDENCE', 'AFFECTED_SEAM',
      'IMPLEMENTATION_CONTRACT', 'ALLOWED_PATH_CANDIDATES', 'REGRESSION_BEHAVIOR', 'UNCERTAINTIES'],
    lineCap: 70, shell: true, writes: false,
    extra: (b) => /REQUIRES_REROUTE/.test(b) && /REROUTE_TRIGGER/.test(b) && /3\b.*hypothes/is.test(b),
  },
  'cow-implementer': {
    effort: 'high', maxTurns: 30, tools: ['Read', 'Glob', 'Grep', 'Bash', 'Write', 'Edit'], skills: [], bodyMax: 6500,
    inputs: ['TASK_BRIEF_PATH', 'REPORT_PATH', 'ALLOWED_PATHS', 'VERIFICATION_COMMANDS', 'COMMIT_POLICY', 'WORKTREE_ROOT'],
    outputs: ['STATUS', 'FILES_CHANGED', 'BEHAVIOR_IMPLEMENTED', 'VERIFICATION_COMMANDS', 'VERIFICATION_RESULTS',
      'TEST_COUNT', 'SELF_REVIEW', 'REMAINING_RISKS'], lineCap: 8, shell: true, writes: true,
    extra: (b) => /not\W*commit/i.test(b) && /(state\.json|cow-state)/.test(b) && /ledger/i.test(b)
      && /mark the unit complete/i.test(b) && /allowed.?paths?/i.test(b),
  },
  'cow-reviewer': {
    effort: 'medium', maxTurns: 12, tools: ['Read', 'Glob', 'Grep'], skills: [], bodyMax: 5500,
    inputs: ['REVIEW_KIND', 'BRIEF_PATH', 'REVIEW_PACKAGE_PATH', 'MODE', 'RISK', 'BASE_REFERENCE', 'HEAD_REFERENCE'],
    outputs: ['SPEC_VERDICT', 'QUALITY_VERDICT', 'FINDINGS', 'MINOR_FINDINGS', 'FINAL_VERDICT'], lineCap: 80,
    shell: false, writes: false,
    extra: (b) => ['INTRODUCED', 'WORSENED', 'PRE_EXISTING', 'UNCERTAIN'].every((c) => b.includes(c)),
  },
};
const FORBIDDEN_KEYS = ['memory', 'isolation', 'hooks', 'mcpServers', 'permissionMode'];

// ── enumerate agent files ────────────────────────────────────────────────────
const files = fs.existsSync(agentsDir)
  ? fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'))
  : [];
check(files.length === 4, `exactly four agent definitions exist (found ${files.length})`);
check(files.every((f) => f.startsWith('cow-')), 'every agent file is a cow-* definition');

const seenNames = new Set();
let totalBody = 0;

for (const file of files.sort()) {
  const base = file.replace(/\.md$/, '');
  const spec = SPEC[base];
  const text = fs.readFileSync(path.join(agentsDir, file), 'utf8');
  const p = parse(text);
  if (!p) { check(false, `${file}: parseable frontmatter`); continue; }
  if (!spec) { check(false, `${file}: is a known cow-* agent`); continue; }

  const f = p.fields;
  const tools = toolList(f.tools);
  const skills = p.lists.skills || [];

  // identity
  check(f.name === base, `${file}: name matches filename (${f.name})`);
  check(!seenNames.has(f.name), `${file}: name is unique`); seenNames.add(f.name);

  // cost pinning
  check(f.model === 'sonnet', `${base}: model is sonnet (${f.model})`);
  check(f.effort === spec.effort, `${base}: effort is ${spec.effort} (${f.effort})`);
  check(Number(f.maxTurns) === spec.maxTurns, `${base}: maxTurns is ${spec.maxTurns} (${f.maxTurns})`);
  check(f.background === 'false', `${base}: background is false`);

  // explicit, restricted tool surface (no inheritance)
  check(p.present.has('tools') && tools.length > 0, `${base}: has an explicit non-empty tools allowlist`);
  check(JSON.stringify(tools) === JSON.stringify(spec.tools), `${base}: tools exactly ${spec.tools.join(', ')} (got ${tools.join(', ')})`);
  check(!tools.includes('Agent'), `${base}: no Agent tool (no nested spawning)`);
  check(!tools.includes('Skill'), `${base}: no Skill tool (preload via skills field)`);
  check(!tools.some((t) => /^mcp__/.test(t)), `${base}: no MCP tools`);
  check(tools.includes('Bash') === spec.shell, `${base}: Bash presence matches contract (${spec.shell})`);
  check(!tools.includes('PowerShell'), `${base}: no PowerShell tool`);
  const hasWrite = tools.includes('Write') || tools.includes('Edit');
  check(hasWrite === spec.writes, `${base}: Write/Edit presence matches contract (${spec.writes})`);

  // forbidden / ignored frontmatter keys
  for (const k of FORBIDDEN_KEYS) check(!p.present.has(k), `${base}: no ${k} frontmatter key`);

  // skill preload
  check(JSON.stringify(skills) === JSON.stringify(spec.skills),
    `${base}: skills preload is [${spec.skills.join(', ')}] (got [${skills.join(', ')}])`);

  // budgets
  const descBytes = Buffer.byteLength(f.description || '', 'utf8');
  const bodyBytes = Buffer.byteLength(p.body, 'utf8');
  totalBody += bodyBytes;
  check(!!f.description && descBytes <= 450, `${base}: description present and <= 450 bytes (${descBytes})`);
  check(bodyBytes <= spec.bodyMax, `${base}: body within ${spec.bodyMax} bytes (${bodyBytes})`);

  // contract content (input/output fields appear in the right place)
  for (const inp of spec.inputs) check(p.body.includes(inp), `${base}: input contract names ${inp}`);
  for (const out of spec.outputs) check(p.body.includes(out), `${base}: output contract names ${out}`);

  // return-line cap stated
  check(new RegExp(`(<=|≤)\\s*${spec.lineCap}\\s*lines`).test(p.body), `${base}: states its ${spec.lineCap}-line return cap`);

  // read-only agents forbid source edits; implementer forbids commit/state
  if (!spec.writes) {
    check(/read-only/i.test(p.body) && /(do not (write|edit)|never edits|no edits|not\b.*edit tracked)/i.test(p.body),
      `${base}: explicitly read-only / forbids source edits`);
  }
  if (spec.extra) check(spec.extra(p.body), `${base}: role-specific contract invariants present`);
}

// aggregate body budget
check(totalBody <= 20000, `all four agent bodies within 20000 bytes total (${totalBody})`);

// version unchanged by this phase
for (const [f, vpath] of [
  ['.claude-plugin/plugin.json', 'version'],
  ['package.json', 'version'],
]) {
  const v = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'))[vpath];
  check(v === '0.4.2', `${f} version remains 0.4.2 (${v})`);
}
const market = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/marketplace.json'), 'utf8'));
check((market.plugins || []).every((pl) => pl.version === '0.4.2'), 'marketplace version remains 0.4.2');

console.log(`\nagent-contracts: ${passes} checks passed, ${fails} failed.`);
if (fails > 0) process.exit(1);
console.log('agent contracts OK.');

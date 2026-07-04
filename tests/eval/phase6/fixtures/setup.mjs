#!/usr/bin/env node
// phase6/fixtures/setup.mjs — reproducible fixture repo builder for Phase 6
// live matrix runs. Zero-dependency Node (stdlib only), cross-platform.
//
// Usage:
//   node setup.mjs <fixtureId> <targetDir>
//
// Creates a disposable git repo under <targetDir> seeded with the fixture's
// deterministic files, initializes git, and (for F4) places an evaluation-only
// hooks.json INSIDE the disposable repo only — never in the COW source tree.
// Prints the absolute repo root on stdout.
//
// This script does NOT create hooks/hooks.json in the COW source repository.

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = {
  'F1-bounded-implementation': () => ({
    files: {
      'src/sum.js': 'export function sum(a, b) {\n  return a - b;\n}\n',
      'test/sum.test.mjs': 'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { sum } from "../src/sum.js";\n\ntest("sum returns a+b", () => {\n  assert.equal(sum(2, 3), 5);\n});\n',
      'package.json': '{ "type": "module" }\n',
    },
    untracked: { 'notes-user.md': '# my notes\nkeep me untouched\n' },
    gitignore: '.cost-oriented-agentic-workflow/\ntmp/\n',
  }),
  'F2-diagnosis-fix': () => ({
    files: {
      'src/normalize.js': 'export function normalize(s) {\n  if (s == null) return s;\n  return s.trim().toLowerCase().slice(0, 3);\n}\n',
      'test/normalize.test.mjs': 'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { normalize } from "../src/normalize.js";\n\ntest("null handled", () => {\n  assert.equal(normalize(null), null);\n});\n\ntest("trims and lowercases", () => {\n  assert.equal(normalize("  Hello  "), "hel");\n});\n\ntest("off-by-one boundary", () => {\n  // bug: slice(0,3) truncates a 4-char word; spec wants length-preserving\n  // normalization (no truncation) so "abcd" -> "abcd", not "abc"\n  assert.equal(normalize("abcd"), "abcd");\n});\n',
      'package.json': '{ "type": "module" }\n',
    },
    untracked: {},
    gitignore: '.cost-oriented-agentic-workflow/\ntmp/\n',
  }),
  'F3-review-remediation': () => ({
    files: {
      'src/cart.js': 'export function addItem(cart, item) {\n  if (!Array.isArray(cart)) throw new TypeError("cart must be an array");\n  if (!item || typeof item.sku !== "string" || item.sku.trim() === "") throw new TypeError("sku is required");\n  if (!Number.isInteger(item.cents) || item.cents < 0) throw new TypeError("cents must be a non-negative integer");\n  if (!Number.isInteger(item.qty) || item.qty <= 0) throw new TypeError("qty must be a positive integer");\n  return [...cart, { sku: item.sku.trim(), cents: item.cents, qty: item.qty }];\n}\n\nexport function totalCents(cart) {\n  if (!Array.isArray(cart)) throw new TypeError("cart must be an array");\n  return cart.reduce((sum, item) => sum + item.cents * item.qty, 0);\n}\n',
      'test/cart.test.mjs': 'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { addItem, totalCents } from "../src/cart.js";\n\ntest("addItem appends a normalized item", () => {\n  assert.deepEqual(addItem([], { sku: " ABC ", cents: 250, qty: 2 }), [\n    { sku: "ABC", cents: 250, qty: 2 },\n  ]);\n});\n\ntest("addItem rejects invalid quantities", () => {\n  assert.throws(() => addItem([], { sku: "ABC", cents: 250, qty: 0 }), /qty/);\n});\n\ntest("totalCents multiplies cents by quantity", () => {\n  const cart = addItem([], { sku: "ABC", cents: 250, qty: 2 });\n  assert.equal(totalCents(cart), 500);\n});\n',
      'package.json': '{ "type": "module", "scripts": { "test": "node --test test/*.test.mjs" } }\n',
      'task.md': fs.readFileSync(path.join(here, 'F3-review-remediation', 'task.md'), 'utf8'),
    },
    untracked: {},
    gitignore: '.cost-oriented-agentic-workflow/\ntmp/\n',
  }),
  'F4-enforcement': (repoDir) => {
    const setup = {
      files: {
        'src/a.js': 'module.exports = "a";\n',
        'src/tracked.js': 'module.exports = "tracked";\n',
        'lib/outside.js': 'module.exports = "outside";\n',
      },
      untracked: {},
      gitignore: '.cost-oriented-agentic-workflow/\ntmp/\n',
    };
    // Place COW state files for the four enforcement cases. The active
    // evaluation-only hooks.json is written into the disposable repo only.
    const runDir = path.join(repoDir, '.cost-oriented-agentic-workflow', 'run');
    setup._postInit = (root) => {
      fs.mkdirSync(runDir, { recursive: true });
      const state = {
        schemaVersion: 1, active: true, mode: 'standard', phase: 'implementing',
        processLane: 'none',
        repositoryProfile: { status: 'absent', fingerprint: null, snapshotPath: null, profilePath: null, updatedAt: null },
        discoveryRoute: 'none', implementationRoute: 'delegated', risk: 'low',
        rootCause: { status: 'none', reportPath: null },
        plan: { status: 'approved', path: 'plan.md' },
        currentUnit: { id: '1', allowedPaths: ['src/'], base: null, briefPath: null, reportPath: null, commitSha: null, baselinePath: null, currentAttempt: null, acceptedAttempt: null },
        verification: { status: 'none', command: null },
        review: { status: 'none', required: false, scope: 'none', packagePath: null, reportPath: null, acceptedFindingIds: [], pendingBlockingFindingIds: [], targetedRereviewStatus: 'none', wholeWorkReviewStatus: 'none' },
        attempts: { implementer: 0, max: 2 }, remediationWaves: { count: 0, max: 2 },
        baseBranch: null, mergeBaseSha: null, commitPolicy: 'controller-per-unit',
        blocked: { code: null, artifactPath: null, priorPhase: null },
        timestamps: { createdAt: '2026-06-30T00:00:00Z', updatedAt: '2026-06-30T00:00:00Z' },
      };
      fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify(state));
      fs.writeFileSync(path.join(runDir, 'state.active'), 'marker\n');
      // Evaluation-only hooks.json INSIDE the disposable repo (NOT the COW source).
      // Uses --decision-mode=enforce on PreToolUse, pointing at the COW script by
      // absolute path so the disposable repo can invoke it during live eval.
      // `here` is .../<repo>/tests/eval/phase6/fixtures, so the repo root is four
      // levels up (../../../..). cowHook lives at <repo>/skills/.../cow-hook.mjs.
      const cowHook = path.resolve(here, '..', '..', '..', '..', 'skills', 'execution-routing', 'scripts', 'cow-hook.mjs').replace(/\\/g, '/');
      const hooksJson = {
        _comment: 'EVALUATION-ONLY — generated by phase6 setup.mjs into a disposable repo. Do not copy into the COW source tree.',
        hooks: {
          SessionStart: [{ matcher: 'startup|resume|clear|compact', hooks: [{ type: 'command', command: 'node', args: [cowHook, 'session-start'], timeout: 5 }] }],
          PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'node', args: [cowHook, 'pre-tool-use', '--decision-mode=enforce'], timeout: 5 }] }],
          PreCompact: [{ matcher: '*', hooks: [{ type: 'command', command: 'node', args: [cowHook, 'pre-compact'], timeout: 5 }] }],
        },
      };
      fs.writeFileSync(path.join(root, 'hooks.json'), JSON.stringify(hooksJson, null, 2));
    };
    return setup;
  },
};

function git(root, ...args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (r.status !== 0) { process.stderr.write(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}\n`); process.exit(3); }
  return r;
}

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

function main() {
  const [fixtureId, targetDir] = process.argv.slice(2);
  if (!fixtureId || !targetDir) { process.stderr.write('usage: setup.mjs <fixtureId> <targetDir>\n'); process.exit(2); }
  if (!FIX[fixtureId]) { process.stderr.write(`unknown fixture: ${fixtureId}\n`); process.exit(2); }
  fs.mkdirSync(targetDir, { recursive: true });
  const root = path.resolve(targetDir);
  // refuse to operate inside the COW source tree. `here` is
  // .../<repo>/tests/eval/phase6/fixtures, so the repo root is four levels up.
  const cowRoot = path.resolve(here, '..', '..', '..', '..');
  if (root === cowRoot || root.startsWith(cowRoot + path.sep)) {
    process.stderr.write('refusing to create a fixture repo inside the COW source tree\n'); process.exit(4);
  }
  const spec = FIX[fixtureId](root);
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'eval@example.com');
  git(root, 'config', 'user.name', 'eval');
  git(root, 'config', 'core.autocrlf', 'false');
  if (spec.gitignore) fs.writeFileSync(path.join(root, '.gitignore'), spec.gitignore);
  writeTree(root, spec.files || {});
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', `${fixtureId} seed`);
  // untracked user-owned files (must NOT be staged)
  for (const [rel, content] of Object.entries(spec.untracked || {})) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  if (typeof spec._postInit === 'function') spec._postInit(root);
  process.stdout.write(root + '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

#!/usr/bin/env node
// Safe, narrow cleaner for this repository's KNOWN generated artifacts.
//
// Node standard library only. Dry-run by default; deletes only with --apply.
// The set of removable paths is HARDCODED — this script never accepts an
// arbitrary path to delete, never touches tracked source, and never runs a
// recursive `git clean`. It exists so generated artifacts can be removed
// deterministically without `git clean -fdx` (which would also wipe the
// self-ignored runtime workspace and any recovery state).
//
// Usage:
//   node scripts/clean-generated.mjs           # dry-run: list what WOULD be removed
//   node scripts/clean-generated.mjs --apply    # actually remove

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot() {
  try {
    const top = execFileSync('git', ['-C', here, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).trim();
    if (top) return path.resolve(top);
  } catch {
    /* fall through to filesystem fallback */
  }
  // Fallback: scripts/ lives at the repo root.
  return path.resolve(here, '..');
}

const REPO = resolveRepoRoot();

// HARDCODED removable generated paths (repo-relative). Narrowly scoped.
const REMOVABLE = [
  'dist',
  '.cost-oriented-agentic-workflow/eval',
];

// Defense-in-depth: a removable entry whose top-level segment is protected is
// refused even if REMOVABLE is edited carelessly. The runtime workspace root
// (.cost-oriented-agentic-workflow) is intentionally NOT protected — only its
// generated eval/ subtree is listed above; run/ (recovery state) is never listed.
const PROTECTED_TOP = new Set([
  '.git', 'tests', 'docs', 'skills', 'commands', 'scripts', 'hooks', '.claude-plugin', 'README.md', 'LICENSE', 'package.json',
]);

function isInsideRepo(abs) {
  const rel = path.relative(REPO, abs);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

const apply = process.argv.includes('--apply');

console.log(`clean-generated: repo = ${REPO}`);
console.log(apply ? 'mode: APPLY (removing listed artifacts)' : 'mode: dry-run (no deletion; pass --apply to remove)');

let acted = 0;
let absent = 0;
let refused = 0;

for (const rel of REMOVABLE) {
  const abs = path.resolve(REPO, rel);
  const top = rel.split(/[\\/]/)[0];

  if (!isInsideRepo(abs)) {
    console.error(`REFUSE (outside repo): ${rel}`);
    refused++;
    continue;
  }
  if (PROTECTED_TOP.has(top)) {
    console.error(`REFUSE (protected path): ${rel}`);
    refused++;
    continue;
  }
  if (!fs.existsSync(abs)) {
    console.log(`absent  : ${rel}`);
    absent++;
    continue;
  }
  if (apply) {
    fs.rmSync(abs, { recursive: true, force: true });
    console.log(`removed : ${rel}`);
  } else {
    console.log(`would rm: ${rel}`);
  }
  acted++;
}

console.log(
  `clean-generated: ${apply ? 'removed' : 'would remove'} ${acted}, absent ${absent}` +
    (refused ? `, refused ${refused}` : ''),
);
if (refused) process.exitCode = 1;

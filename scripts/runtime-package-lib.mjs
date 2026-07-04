// Shared runtime-package rules for build-runtime-package.mjs and
// inspect-runtime-package.mjs. One module owns the allowlist, denylist,
// required-file set, executable set, path safety, personal-path defense,
// hashing, and ZIP reading so the builder and the inspector can never drift
// apart. Node standard library only; zero runtime dependencies.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ── Runtime allowlist / denylist ────────────────────────────────────────────
export const ALLOW_EXACT = new Set([
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'hooks/README.md',
  'hooks/hooks.json.example',
  'hooks/hooks.enforcement.json.example',
  'README.md',
  'LICENSE',
]);
export const ALLOW_PREFIX = ['agents/', 'commands/', 'skills/'];

// Files that must be present for a usable runtime package.
export const REQUIRED = [
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'agents/cow-debug-investigator.md',
  'agents/cow-implementer.md',
  'agents/cow-repo-investigator.md',
  'agents/cow-reviewer.md',
  'commands/cost-oriented-agentic-workflow.md',
  'commands/production.md',
  'hooks/README.md',
  'skills/using-cost-oriented-workflow/SKILL.md',
  'skills/execution-routing/SKILL.md',
  'skills/execution-routing/scripts/cow-hook.mjs',
  'skills/execution-routing/scripts/cow-state-core.mjs',
  'skills/execution-routing/scripts/cow-state.mjs',
  'hooks/hooks.json.example',
  'hooks/hooks.enforcement.json.example',
  'README.md',
  'LICENSE',
];

// Tracked files that must carry the executable bit in the runtime package.
export const EXEC_REQUIRED = [
  'skills/execution-routing/scripts/cow-workspace',
  'skills/execution-routing/scripts/task-brief',
  'skills/execution-routing/scripts/review-package',
];

export const DENY_PREFIX = [
  '.git/', '.github/', '.cost-oriented-agentic-workflow/', 'tests/', 'docs/',
  'scripts/', 'dist/', 'node_modules/', 'analyze-apply-project-rules/',
];
export const DENY_EXACT = new Set([
  'package.json', 'package-lock.json', 'CHANGELOG.md', '.gitignore',
  'hooks/hooks.json',
]);
export const DENY_PATTERNS = [/^phase_.*\.md$/i, /^.*_walkthrough\.md$/i];

export const isAllowed = (p) => ALLOW_EXACT.has(p) || ALLOW_PREFIX.some((pre) => p.startsWith(pre));
export const isDenied = (p) => DENY_EXACT.has(p) || DENY_PREFIX.some((pre) => p.startsWith(pre)) || DENY_PATTERNS.some((re) => re.test(p));
export const isSafePackagePath = (p) => p && !path.posix.isAbsolute(p) && !p.split('/').includes('..') && !p.includes('\\');
// \\{1,2} also catches the JSON-escaped form (C:\\Users\\name) that appears
// inside string literals in packaged .json/.mjs files.
export const PERSONAL_PATH_RE = /\b[A-Za-z]:\\{1,2}Users\\{1,2}|\/c\/Users\/|\/Users\/|gencberke/i;

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function walkFiles(root, base = root, acc = []) {
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const abs = path.join(root, e.name);
    if (e.isDirectory()) walkFiles(abs, base, acc);
    else acc.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return acc;
}

// Minimal ZIP central-directory reader (no zip64; sufficient for git-archive
// output). Returns [{ name, unixMode }] for every entry. Throws on a
// malformed archive — callers decide how to report it.
export function readZipEntries(buf) {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP end-of-central-directory record not found.');
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('ZIP central-directory record malformed.');
    const externalAttr = buf.readUInt32LE(off + 38);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    out.push({ name, unixMode: (externalAttr >>> 16) & 0xffff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

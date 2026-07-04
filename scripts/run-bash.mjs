#!/usr/bin/env node
// Run a Bash test script with a Windows-safe Bash lookup.
//
// On Windows, plain "bash" may resolve to the WSL launcher even when no distro is
// installed. Prefer Git Bash when it is present, then fall back to PATH.

import fs from 'fs';
import { spawnSync } from 'child_process';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node scripts/run-bash.mjs <script> [args...]');
  process.exit(2);
}

const candidates = [];
if (process.env.BASH) candidates.push(process.env.BASH);
if (process.platform === 'win32') {
  candidates.push(
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  );
}
candidates.push('bash');

let bash = null;
for (const c of candidates) {
  if (c !== 'bash' && !fs.existsSync(c)) continue;
  const probe = spawnSync(c, ['--version'], { encoding: 'utf8' });
  if (probe.status === 0) {
    bash = c;
    break;
  }
}

if (!bash) {
  console.error('Bash is required. Install Git Bash or set BASH to a working bash executable.');
  process.exit(1);
}

const result = spawnSync(bash, args, { stdio: 'inherit', env: process.env });
process.exit(result.status === null ? 1 : result.status);

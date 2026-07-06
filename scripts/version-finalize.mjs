#!/usr/bin/env node
// Dry-run the final 0.5.0 version finalization locations.
//
// This script is dry-run only. Before the final bump it proves the authoritative
// fields are known; after the bump it proves the repository is finalized
// consistently without mutating anything.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(execFileSync('git', ['-C', here, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const die = (msg) => { console.error(`version-finalize: ERROR: ${msg}`); process.exit(1); };

let root = defaultRoot;
let target = '0.5.0';
let dryRun = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') root = path.resolve(argv[++i]);
  else if (argv[i] === '--target') target = argv[++i];
  else if (argv[i] === '--dry-run') dryRun = true;
  else die(`unknown argument: ${argv[i]}`);
}
if (!dryRun) die('version finalization script is dry-run only; do not mutate versions from this helper.');
if (!/^\d+\.\d+\.\d+$/.test(target)) die(`target must be a semver x.y.z value (got ${target}).`);

function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

const plugin = readJSON('.claude-plugin/plugin.json');
const pkg = readJSON('package.json');
const market = readJSON('.claude-plugin/marketplace.json');
const marketIndex = (market.plugins || []).findIndex((p) => p.name === plugin.name);
if (marketIndex < 0) die(`marketplace.json does not list plugin "${plugin.name}".`);
const current = {
  plugin: plugin.version,
  package: pkg.version,
  marketplace: market.plugins[marketIndex].version,
};
if (new Set(Object.values(current)).size !== 1) {
  die(`current versions are not synchronized: ${JSON.stringify(current)}`);
}
const alreadyCurrent = current.plugin === target;

const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const escapedTarget = target.replace(/\./g, '\\.');
if (!alreadyCurrent && !new RegExp(`## \\[${escapedTarget}\\] - Pending`).test(changelog)) {
  die(`CHANGELOG.md must contain a pending ${target} section.`);
}
if (alreadyCurrent && !new RegExp(`## \\[${escapedTarget}\\] - \\d{4}-\\d{2}-\\d{2}`).test(changelog)) {
  die(`CHANGELOG.md must contain a finalized ${target} section.`);
}
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
if (!/\/plugin marketplace add <runtime-package-dir>/.test(readme)) {
  die('README.md must keep the runtime install example version-neutral.');
}

// Deliberate anti-accidental-bump tripwires: these tests pin the current
// version as a literal and MUST be updated in the same final-release commit,
// or the deterministic suite fails after the bump. The dry run verifies each
// pin still exists so this location list can never go stale silently.
const TEST_PIN_FILES = ['tests/validate-structure.mjs', 'tests/agent-contracts.test.mjs'];
for (const f of TEST_PIN_FILES) {
  let text;
  try { text = fs.readFileSync(path.join(root, f), 'utf8'); }
  catch (err) { die(`cannot read version test-pin file ${f}: ${err.message}`); }
  if (!text.includes(`'${current.plugin}'`)) {
    die(`${f} no longer pins the current version '${current.plugin}'; update the finalization location list.`);
  }
}

const locations = [
  { file: '.claude-plugin/plugin.json', jsonPath: '$.version', from: current.plugin, to: target },
  { file: '.claude-plugin/marketplace.json', jsonPath: `$.plugins[${marketIndex}].version`, from: current.marketplace, to: target },
  { file: 'package.json', jsonPath: '$.version', from: current.package, to: target },
  { file: 'tests/validate-structure.mjs', kind: 'test-pin', from: current.plugin, to: target },
  { file: 'tests/agent-contracts.test.mjs', kind: 'test-pin', from: current.plugin, to: target },
  { file: 'CHANGELOG.md', heading: `## [${target}] - Pending`, finalHeading: `## [${target}] - YYYY-MM-DD` },
  { file: 'README.md', installExample: '<runtime-package-dir>', action: 'keep version-neutral' },
  { file: 'runtime manifest', field: 'version', source: '.claude-plugin/plugin.json' },
];

console.log(JSON.stringify({
  dryRun: true,
  alreadyCurrent,
  currentVersion: current.plugin,
  targetVersion: target,
  locations,
}, null, 2));

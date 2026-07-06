#!/usr/bin/env node
// scripts/zip.mjs — package a Chrome Web Store upload zip of the extension.
// Excludes dev-only and store-listing files so only what Chrome loads ships.
//
// ponytail: shells out to the system `zip` (present on macOS/Linux) instead of
// pulling an archiver dependency. Upgrade path: swap in a JS zip lib if this
// ever needs to run on a machine without the `zip` binary (e.g. bare Windows).

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Everything the store build must NOT contain (dev tooling, docs, unpacked
// vendor sources, and the listing doc). vendor/transformers + models ARE
// shipped (they are the bundled on-device engine), so they are not excluded.
const EXCLUDES = [
  '.git/*',
  'node_modules/*',
  'test/*',
  'scripts/*',
  'docs/*',
  'stage/*',
  'CHROMEWEBSTORE.md',
  '*.zip',
  '.DS_Store',
  '*/.DS_Store',
];

const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
})();

const OUT = join(ROOT, `sada-${VERSION}.zip`);

// Start clean so a rebuild never appends to a stale archive.
rmSync(OUT, { force: true });

const args = ['-r', OUT, '.', '-x', ...EXCLUDES];

try {
  execFileSync('zip', args, { cwd: ROOT, stdio: 'inherit' });
  console.log(`\nPacked ${OUT.slice(ROOT.length + 1)} (v${VERSION}).`);
} catch (err) {
  console.error(`zip failed: ${err.message}`);
  process.exit(1);
}

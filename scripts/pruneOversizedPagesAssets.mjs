import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Cloudflare Pages rejects any asset over 25 MiB. The output directory is the repository
// root, so oversized source/data files (the legacy protective-device catalog and its
// dist copy, large research dumps) fail the whole deployment. The app loads the sharded
// catalog instead, so these files are removed from the ephemeral Pages build checkout.
const MAX_BYTES = 25 * 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git']);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Guard against deleting files from a developer checkout.
if (process.env.CF_PAGES !== '1' && !process.argv.includes('--force')) {
  console.log('[pages-prune] Skipped; not running inside Cloudflare Pages (set CF_PAGES=1 or pass --force).');
  process.exit(0);
}

async function walk(dir, found = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(full, found);
    } else if (entry.isFile()) {
      const { size } = await fs.stat(full);
      if (size > MAX_BYTES) found.push({ full, size });
    }
  }
  return found;
}

const oversized = await walk(root);
for (const { full, size } of oversized) {
  await fs.rm(full);
  console.log(`[pages-prune] Removed ${path.relative(root, full)} (${(size / 1024 / 1024).toFixed(1)} MiB)`);
}
console.log(`[pages-prune] ${oversized.length} oversized file(s) removed.`);

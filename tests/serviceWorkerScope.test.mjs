import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const serviceWorker = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function it(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err.message || err);
    process.exitCode = 1;
  }
}

console.log('service worker scope handling');

it('resolves precache assets against the registration scope', () => {
  assert.match(serviceWorker, /new URL\(path, self\.registration\.scope\)\.href/);
  assert.match(serviceWorker, /new URL\('offline\.html', self\.registration\.scope\)\.href/);
});

it('keeps precache paths project-relative for GitHub Pages subpath hosting', () => {
  const listMatch = serviceWorker.match(/const PRECACHE_PATHS = \[([\s\S]*?)\];/);
  assert.ok(listMatch, 'Could not find PRECACHE_PATHS in sw.js');
  const entries = [...listMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.ok(entries.length > 0, 'PRECACHE_PATHS should contain shell assets');
  assert.deepEqual(entries.filter(entry => entry.startsWith('/')), []);
});

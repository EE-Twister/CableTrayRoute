import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { discoverNodeTestFiles } from '../scripts/runNodeTests.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err.message || err);
    process.exitCode = 1;
  }
}

describe('Node test gate coverage', () => {
  const files = discoverNodeTestFiles({ cwd: ROOT });

  it('discovers all active Node test files under tests/ and analysis/', () => {
    for (const file of [
      'tests/costEstimate.test.mjs',
      'tests/equipmentArrangementsPage.test.cjs',
      'tests/reportPackage.test.mjs',
      'tests/loadflow/deepNestedLoadSafety.test.mjs',
      'tests/shortcircuit/cablePerKmImpedance.test.mjs',
      'analysis/loadFlowModel.test.mjs',
    ]) {
      assert.ok(files.includes(file), `missing ${file}`);
    }
  });

  it('does not pull Playwright browser specs into the Node lane', () => {
    assert.ok(!files.some(file => file.startsWith('playwright-tests/')));
  });

  it('returns a stable sorted list without duplicates', () => {
    assert.deepStrictEqual(files, [...files].sort());
    assert.strictEqual(new Set(files).size, files.length);
  });

  it('wires npm test:full to the discovery runner', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.strictEqual(pkg.scripts.test, 'npm run test:full');
    assert.strictEqual(pkg.scripts['test:full'], 'node scripts/runNodeTests.mjs');
  });
});

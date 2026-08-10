import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { extractLocalModuleSpecifiers, inspectModuleCycles } from '../scripts/checkModuleCycles.mjs';

describe('production module cycle gate', () => {
  it('extracts multiline, side-effect, and re-export declarations without treating type comments as imports', () => {
    const source = `
      import {
        value
      } from './value.mjs';
      import './setup.js';
      export { result } from './result.js';
      const lazy = () => import('./lazy.js');
      /** @returns {import('./self.mjs').Thing} */
    `;
    assert.deepEqual(extractLocalModuleSpecifiers(source).sort(), [
      './lazy.js',
      './result.js',
      './setup.js',
      './value.mjs'
    ]);
  });

  it('reports a concrete cycle path', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-cycle-test-'));
    try {
      await fs.writeFile(path.join(directory, 'a.mjs'), "import './b.mjs';\n");
      await fs.writeFile(path.join(directory, 'b.mjs'), "import './a.mjs';\n");
      const result = await inspectModuleCycles(directory);
      assert.deepEqual(result.cycles, [['a.mjs', 'b.mjs', 'a.mjs']]);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps the current production graph cycle-free', async () => {
    const result = await inspectModuleCycles();
    assert.deepEqual(result.cycles, []);
    assert.ok(result.filesInspected > 400);
  });
});

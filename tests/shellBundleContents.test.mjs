/**
 * Every page bundles the shell (site.js, navigation, workflow status). The
 * design rule checker, deliverable readiness, and pull-card code are only
 * needed by the home page and the pages that use them, so they must not reach
 * the shell through any import chain (modernization plan A2).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { rollup } from 'rollup';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const configs = require(path.join(root, 'rollup.config.cjs'));

const SHELL_ONLY_ENTRY = '404.js';
const HEAVY_MODULES = [
  'analysis/projectWorkflowCore.mjs',
  'analysis/designRuleChecker.mjs',
  'analysis/deliverableWorkflow.mjs',
  'analysis/pullCards.mjs',
];

async function bundledModules(entryFile) {
  const config = configs.find(item => path.basename(item.output.file) === entryFile);
  assert.ok(config, `${entryFile} is a build entry`);
  let ids = [];
  const capture = { name: 'capture-modules', buildEnd() { ids = [...this.getModuleIds()]; } };
  await rollup({
    input: path.join(root, config.input),
    external: config.external,
    plugins: [nodeResolve({ browser: true }), json(), capture],
    onwarn() {},
  });
  return new Set(ids.map(id => path.relative(root, id).split(path.sep).join('/')));
}

const shell = await bundledModules(SHELL_ONLY_ENTRY);
assert.ok(shell.has('site.js'), 'the 404 page carries the shell');
for (const heavy of HEAVY_MODULES) {
  assert.ok(!shell.has(heavy), `${heavy} must not be bundled into every page through the shell`);
}

const home = await bundledModules('index.js');
assert.ok(home.has('analysis/projectWorkflowCore.mjs'), 'the home page still builds its workflow diagnostics');

console.log('shell bundle contents tests passed');

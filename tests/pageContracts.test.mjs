import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  NAV_ROUTES
} from '../src/components/navigation.js';
import {
  PAGE_CONTRACT_SCHEMA_VERSION,
  PAGE_CONTRACTS_BY_HREF,
  READINESS_VOCABULARY,
  getPageContract,
  getPageContractCoverage,
  getPageContractReadiness,
  getPageContractReadinessMessages
} from '../src/pageContracts.js';

const workflowSteps = new Set([
  null,
  'equipmentList',
  'loadList',
  'oneLineDiagram',
  'cableSchedule',
  'racewaySchedule',
  'fillRouting',
  'studies',
  'deliverables'
]);

const kinds = new Set(['schedule', 'model', 'study-result', 'setting', 'export']);
const knownKeys = new Set([
  'equipment',
  'loadList',
  'oneLineDiagram',
  'panelSchedule',
  'cableSchedule',
  'cableTypicals',
  'mccLineups',
  'traySchedule',
  'conduitSchedule',
  'ductbankSchedule',
  'studyResults',
  'export-only'
]);

function assertText(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert.ok(value.trim(), `${label} must not be empty`);
  assert.ok(!/\b(TBD|TODO)\b/i.test(value), `${label} must not contain placeholder text`);
}

function assertStorageKey(key) {
  assertText(key, 'contract key');
  assert.ok(
    knownKeys.has(key) || key.startsWith('studyResults.') || key.startsWith('settings.'),
    `Unexpected contract key: ${key}`
  );
}

const scopedRoutes = NAV_ROUTES.filter(route => route.section === 'Workflow' || route.section === 'Studies');
const routeHrefs = new Set(NAV_ROUTES.map(route => route.href));
const coverage = getPageContractCoverage(NAV_ROUTES);

assert.equal(PAGE_CONTRACT_SCHEMA_VERSION, 1);
assert.deepStrictEqual(READINESS_VOCABULARY, {
  ready: 'Ready',
  missingInputs: 'Missing inputs',
  downstreamHandoff: 'Downstream handoff'
});
assert.equal(scopedRoutes.length, 71);
assert.equal(coverage.totalRoutes, scopedRoutes.length);
assert.equal(coverage.totalContracts, scopedRoutes.length);
assert.deepStrictEqual(coverage.missing, []);
assert.deepStrictEqual(coverage.extra, []);

for (const route of scopedRoutes) {
  assert.ok(existsSync(path.resolve(route.href)), `${route.href} must exist`);
  const pageContract = getPageContract(route.href);
  assert.ok(pageContract, `${route.href} must have a page contract`);
  assert.equal(PAGE_CONTRACTS_BY_HREF[route.href], pageContract);
  assert.ok(workflowSteps.has(pageContract.workflowStep), `${route.href} has invalid workflowStep`);

  assert.ok(Array.isArray(pageContract.standaloneInputs), `${route.href} standaloneInputs must be an array`);
  assert.ok(pageContract.standaloneInputs.length > 0, `${route.href} must list standalone inputs`);
  pageContract.standaloneInputs.forEach((item, index) => assertText(item, `${route.href} standaloneInputs[${index}]`));

  assert.ok(Array.isArray(pageContract.projectInputs), `${route.href} projectInputs must be an array`);
  pageContract.projectInputs.forEach((item, index) => {
    assertStorageKey(item.key);
    assert.ok(kinds.has(item.kind), `${route.href} projectInputs[${index}] has invalid kind`);
    assert.equal(typeof item.required, 'boolean', `${route.href} projectInputs[${index}].required must be boolean`);
    assertText(item.purpose, `${route.href} projectInputs[${index}].purpose`);
  });

  assert.ok(Array.isArray(pageContract.outputs), `${route.href} outputs must be an array`);
  assert.ok(pageContract.outputs.length > 0, `${route.href} must list at least one output`);
  pageContract.outputs.forEach((item, index) => {
    assertStorageKey(item.key);
    assert.ok(kinds.has(item.kind), `${route.href} outputs[${index}] has invalid kind`);
    assertText(item.purpose, `${route.href} outputs[${index}].purpose`);
    assert.ok(Array.isArray(item.consumers), `${route.href} outputs[${index}].consumers must be an array`);
    item.consumers.forEach(consumer => assert.ok(routeHrefs.has(consumer), `${route.href} output consumer ${consumer} is not a navigation route`));
  });

  assert.ok(pageContract.readiness && typeof pageContract.readiness === 'object', `${route.href} readiness is required`);
  assertText(pageContract.readiness.readyWhen, `${route.href} readiness.readyWhen`);
  assert.ok(Array.isArray(pageContract.readiness.blockers), `${route.href} readiness.blockers must be an array`);
  assert.ok(pageContract.readiness.blockers.length > 0, `${route.href} must list readiness blockers`);
  pageContract.readiness.blockers.forEach((item, index) => assertText(item, `${route.href} readiness.blockers[${index}]`));

  assert.ok(Array.isArray(pageContract.downstream), `${route.href} downstream must be an array`);
  pageContract.downstream.forEach(href => assert.ok(routeHrefs.has(href), `${route.href} downstream ${href} is not a navigation route`));

  assert.ok(Array.isArray(pageContract.notes), `${route.href} notes must be an array`);
  pageContract.notes.forEach((item, index) => assertText(item, `${route.href} notes[${index}]`));

  const readiness = getPageContractReadiness(route.href);
  assert.equal(readiness.href, route.href);
  assert.equal(readiness.terms, READINESS_VOCABULARY);
  assert.equal(readiness.readyWhen, pageContract.readiness.readyWhen);
  assert.deepStrictEqual(readiness.blockers, pageContract.readiness.blockers);
  readiness.downstream.forEach(item => {
    assert.ok(routeHrefs.has(item.href), `${route.href} downstream readiness href ${item.href} is not a navigation route`);
    assertText(item.label, `${route.href} downstream readiness label`);
  });

  const messages = getPageContractReadinessMessages(route.href);
  assert.ok(messages.ready.startsWith(`${READINESS_VOCABULARY.ready}: `));
  assert.ok(messages.missingInputs.startsWith(`${READINESS_VOCABULARY.missingInputs}: `));
  assert.ok(messages.downstreamHandoff.startsWith(`${READINESS_VOCABULARY.downstreamHandoff}: `));
}

const docsCheck = spawnSync(process.execPath, ['scripts/generatePageContractsDocs.mjs', '--check'], {
  encoding: 'utf8'
});
assert.equal(docsCheck.status, 0, docsCheck.stderr || docsCheck.stdout);

console.log('page contracts verified');

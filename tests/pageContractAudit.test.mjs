import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  NAV_ROUTES
} from '../src/components/navigation.js';
import {
  PAGE_CONTRACTS_BY_HREF
} from '../src/pageContracts.js';
import {
  buildPageContractAudit,
  renderPageContractAuditMarkdown
} from '../scripts/auditPageContracts.mjs';

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
const directStorageClassifications = new Set(['page-preference', 'session-handoff']);

function assertStorageKey(key) {
  assert.equal(typeof key, 'string', 'detected storage key must be a string');
  assert.ok(key.trim(), 'detected storage key must not be empty');
  assert.ok(
    knownKeys.has(key) || key.startsWith('studyResults.') || key.startsWith('settings.'),
    `Unexpected detected storage key: ${key}`
  );
}

function assertDetectedKeyObject(object, label) {
  assert.ok(object && typeof object === 'object' && !Array.isArray(object), `${label} must be an object`);
  for (const [key, evidence] of Object.entries(object)) {
    assertStorageKey(key);
    assert.ok(Array.isArray(evidence), `${label}.${key} evidence must be an array`);
    assert.ok(evidence.length > 0, `${label}.${key} evidence must not be empty`);
    evidence.forEach(item => {
      assert.equal(typeof item, 'string', `${label}.${key} evidence item must be a string`);
      assert.match(item, /:\d+ /, `${label}.${key} evidence item should include file and line`);
    });
  }
}

const scopedRoutes = NAV_ROUTES.filter(route => route.section === 'Workflow' || route.section === 'Studies');
const scopedHrefs = new Set(scopedRoutes.map(route => route.href));
const contractHrefs = new Set(Object.keys(PAGE_CONTRACTS_BY_HREF));
const audit = await buildPageContractAudit();
const routesByHref = new Map(audit.routes.map(route => [route.href, route]));

assert.equal(audit.generatedAt, '1970-01-01T00:00:00.000Z');
assert.equal(audit.summary.totalRoutes, scopedRoutes.length);
assert.equal(audit.summary.totalContracts, scopedRoutes.length);
assert.equal(audit.routes.length, scopedRoutes.length);
assert.deepStrictEqual(audit.summary.missingContracts, []);
assert.deepStrictEqual(audit.summary.extraContracts, []);
assert.deepStrictEqual(audit.summary.routesWithoutSources, []);
assert.equal(audit.summary.unclassifiedDirectStorageHits, 0);

for (const href of scopedHrefs) {
  assert.ok(contractHrefs.has(href), `${href} must have a contract`);
  assert.ok(routesByHref.has(href), `${href} must have an audit entry`);
}

for (const route of audit.routes) {
  assert.ok(scopedHrefs.has(route.href), `${route.href} must be a Workflow or Studies route`);
  assert.equal(typeof route.label, 'string', `${route.href} label must be a string`);
  assert.ok(route.label.trim(), `${route.href} label must not be empty`);
  assert.ok(existsSync(route.href), `${route.href} HTML file must exist`);
  assert.ok(Array.isArray(route.entryFiles), `${route.href} entryFiles must be an array`);
  assert.ok(route.entryFiles.length > 0, `${route.href} must resolve at least one entry file`);
  assert.ok(Array.isArray(route.sourceFiles), `${route.href} sourceFiles must be an array`);
  assert.ok(route.sourceFiles.length > 0, `${route.href} must resolve at least one source file`);
  route.entryFiles.forEach(file => {
    assert.equal(typeof file, 'string', `${route.href} entry file must be a string`);
    assert.ok(!/^https?:\/\//i.test(file), `${route.href} entry file must not be an external URL`);
    assert.ok(!file.includes('\\'), `${route.href} entry file must use posix separators`);
  });
  route.sourceFiles.forEach(file => {
    assert.equal(typeof file, 'string', `${route.href} source file must be a string`);
    assert.ok(existsSync(file), `${route.href} source file ${file} must exist`);
    assert.ok(!file.includes('\\'), `${route.href} source file must use posix separators`);
  });
  assertDetectedKeyObject(route.detectedReads, `${route.href}.detectedReads`);
  assertDetectedKeyObject(route.detectedWrites, `${route.href}.detectedWrites`);
  route.declaredInputsNotRead.forEach(assertStorageKey);
  route.declaredOutputsNotWritten.forEach(assertStorageKey);
  route.undocumentedReads.forEach(assertStorageKey);
  route.undocumentedWrites.forEach(assertStorageKey);
  route.directStorage.forEach(item => {
    assert.equal(typeof item.file, 'string', `${route.href} direct storage file must be a string`);
    assert.equal(typeof item.line, 'number', `${route.href} direct storage line must be a number`);
    assert.ok(['localStorage', 'sessionStorage'].includes(item.storage), `${route.href} direct storage type is invalid`);
    assert.ok(['getItem', 'setItem', 'removeItem', 'clear'].includes(item.operation), `${route.href} direct storage operation is invalid`);
    assert.equal(typeof item.key, 'string', `${route.href} direct storage key must be a string`);
    assert.ok(directStorageClassifications.has(item.classification), `${route.href} direct storage classification is invalid`);
    assert.equal(typeof item.purpose, 'string', `${route.href} direct storage purpose must be a string`);
    assert.ok(item.purpose.trim(), `${route.href} direct storage purpose must not be empty`);
  });
}

const markdown = renderPageContractAuditMarkdown(audit);
assert.ok(markdown.includes('# Page Contract Code Audit'));
assert.ok(markdown.includes(`- Routes audited: ${scopedRoutes.length}`));

const docsCheck = spawnSync(process.execPath, ['scripts/auditPageContracts.mjs', '--check'], {
  encoding: 'utf8'
});
assert.equal(docsCheck.status, 0, docsCheck.stderr || docsCheck.stdout);

console.log('page contract audit verified');

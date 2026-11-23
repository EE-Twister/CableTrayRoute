import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BENCHMARKS, runBenchmark } from '../analysis/benchmarkRunner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'validationBenchmarks.json'), 'utf8'));
const catalogById = new Map(catalog.benchmarks.map(item => [item.id, item]));
const ledger = catalog.evidenceLedger || {};
const priorityFixtureIds = new Set([
  'iec60909-short-circuit',
  'iec60287-cable-rating',
]);
const manifestPath = path.join(ROOT, 'dist', 'validationManifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const inventory = manifest.evidenceCoverage?.moduleEvidence;
  assert.ok(Array.isArray(inventory) && inventory.length > 0,
    'generated manifest must expose a non-empty evidence module inventory');
  assert.equal(inventory.some(item => item.module.startsWith('analysis/benchmarks/')), false,
    'benchmark fixture helpers must be excluded from the production analysis inventory');
}

function executableForFixture(fixture) {
  const executableId = ledger[fixture.id]?.executableBenchmarkId;
  return executableId ? BENCHMARKS.find(item => item.id === executableId) : null;
}

function hasCompleteEvidenceContract(fixture) {
  return priorityFixtureIds.has(fixture.id) || Boolean(fixture.source);
}

for (const fixture of catalog.benchmarks) {
  if (!hasCompleteEvidenceContract(fixture)) continue;

  const executableId = ledger[fixture.id]?.executableBenchmarkId;
  assert.ok(executableId, `${fixture.id}: complete evidence contract requires an executableBenchmarkId`);
  const executable = executableForFixture(fixture);
  assert.ok(executable, `${fixture.id}: executable benchmark ${executableId} not found`);
  assert.equal(executable.fixtureId, fixture.id, `${fixture.id}: executable fixtureId drift`);
  if (executable.evidenceClass) {
    assert.equal(ledger[fixture.id].evidenceClass, executable.evidenceClass,
      `${fixture.id}: evidence classification drift`);
  }

  assert.deepStrictEqual(executable.inputs, fixture.inputs, `${fixture.id}: documented inputs drift from executable inputs`);
  assert.deepStrictEqual(executable.inputUnits, fixture.inputUnits, `${fixture.id}: input units drift`);
  assert.deepStrictEqual(executable.source, fixture.source, `${fixture.id}: source provenance drift`);
  assert.deepStrictEqual(executable.inputSource || null, fixture.inputSource || null, `${fixture.id}: input source drift`);
  assert.deepStrictEqual(executable.additionalSources || [], fixture.additionalSources || [], `${fixture.id}: additional sources drift`);
  assert.equal(executable.independentDerivation || executable.derivation || '', fixture.independentDerivation || '',
    `${fixture.id}: independent derivation drift`);
  assert.deepStrictEqual(executable.assumptions || [], fixture.assumptions || [], `${fixture.id}: assumptions drift`);
  assert.ok(Array.isArray(fixture.limitations) && fixture.limitations.length > 0,
    `${fixture.id}: limitations are required`);
  assert.deepStrictEqual(executable.limitations, fixture.limitations, `${fixture.id}: limitations drift`);

  assert.equal(typeof fixture.source.title, 'string');
  assert.match(fixture.source.url, /^https:\/\//);
  assert.equal(fixture.source.url, executable.source.url, `${fixture.id}: source URL drift`);
  assert.equal(fixture.source.url, fixture.sourceUrl, `${fixture.id}: sourceUrl alias drift`);
  assert.equal(typeof fixture.source.locator, 'string');
  assert.match(fixture.source.accessedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(['published_values', 'equation_basis'].includes(fixture.source.kind),
    `${fixture.id}: invalid source kind`);

  const expectedKeys = Object.keys(fixture.expectedOutputs || {}).sort();
  const checkKeys = executable.checks.map(check => check.key).sort();
  assert.deepStrictEqual(expectedKeys, checkKeys, `${fixture.id}: expectedOutputs keys must equal executable check keys`);
  for (const check of executable.checks) {
    assert.equal(typeof check.unit, 'string', `${fixture.id}/${check.key}: numeric check unit required`);
    assert.equal(typeof check.toleranceBasis, 'string', `${fixture.id}/${check.key}: toleranceBasis required`);
    const expected = fixture.expectedOutputs[check.key];
    assert.equal(expected.value, check.expectedVal, `${fixture.id}/${check.key}: expected value drift`);
    assert.equal(expected.tolerance, check.tolerance, `${fixture.id}/${check.key}: tolerance drift`);
    assert.equal(expected.unit, check.unit, `${fixture.id}/${check.key}: unit drift`);
    assert.equal(expected.toleranceBasis, check.toleranceBasis, `${fixture.id}/${check.key}: tolerance basis drift`);
  }
}

const newEvidenceResults = BENCHMARKS
  .filter(benchmark => benchmark.source && !priorityFixtureIds.has(benchmark.fixtureId))
  .map(runBenchmark);
for (const result of newEvidenceResults) {
  assert.equal(result.pass, true,
    `${result.id}: newly integrated evidence benchmark failed: ${result.error || JSON.stringify(result.checks)}`);
}

for (const benchmark of BENCHMARKS.filter(item => item.source)) {
  assert.ok(benchmark.fixtureId, `${benchmark.id}: source-bearing executable benchmark needs fixtureId`);
  assert.ok(catalogById.has(benchmark.fixtureId), `${benchmark.id}: fixture record missing`);
  for (const check of benchmark.checks) {
    if (check.type === 'boolean') continue;
    assert.equal(typeof check.unit, 'string', `${benchmark.id}/${check.key}: numeric check unit required`);
    assert.equal(typeof check.toleranceBasis, 'string', `${benchmark.id}/${check.key}: toleranceBasis required`);
  }
}

console.log('✓ priority benchmark evidence contract matches executable metadata and provenance');

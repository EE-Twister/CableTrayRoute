import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BIM_CONNECTOR_PACKAGE_SCHEMA } from '../analysis/bimConnectorContract.mjs';
import { buildConnectorValidationReport } from '../tools/bim-connector-validator.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const projectStatePath = 'examples/bim-connectors/project-state.json';
const revitPath = 'examples/bim-connectors/revit-return-package.json';
const autocadPath = 'examples/bim-connectors/autocad-return-package.json';
const genericPath = 'examples/bim-connectors/generic-return-package.json';

describe('BIM connector validator harness', () => {
  it('locks the exported connector schema descriptor', () => {
    assert.equal(BIM_CONNECTOR_PACKAGE_SCHEMA.version, 'bim-connector-contract-v1');
    assert.deepEqual(BIM_CONNECTOR_PACKAGE_SCHEMA.connectorTypes, ['revit', 'autocad', 'aveva', 'smartplant', 'generic']);
    ['version', 'connectorType', 'elements', 'quantities', 'issues', 'mappingHints'].forEach(field => {
      assert(BIM_CONNECTOR_PACKAGE_SCHEMA.requiredFields.includes(field));
    });
    ['guid', 'sourceId', 'elementType', 'tag', 'mappedProjectId'].forEach(field => {
      assert(BIM_CONNECTOR_PACKAGE_SCHEMA.elementFields.includes(field));
    });
  });

  it('validates the Revit reference package with project-state preview context', () => {
    const report = buildConnectorValidationReport({
      payload: readJson(revitPath),
      projectState: readJson(projectStatePath),
      previousPackage: readJson(genericPath),
      generatedAt: '2026-04-27T13:00:00.000Z',
    });
    assert.equal(report.valid, true);
    assert.equal(report.connectorType, 'revit');
    assert.equal(report.summary.elementCount, 2);
    assert.equal(report.summary.acceptedElements, 2);
    assert(report.summary.quantityDeltas >= 1);
    assert.equal(report.schema.version, BIM_CONNECTOR_PACKAGE_SCHEMA.version);
  });

  it('validates AutoCAD and generic fixtures without native SDK dependencies', () => {
    const projectState = readJson(projectStatePath);
    const autocad = buildConnectorValidationReport({ payload: readJson(autocadPath), projectState });
    const generic = buildConnectorValidationReport({ payload: readJson(genericPath), projectState });
    assert.equal(autocad.valid, true);
    assert.equal(autocad.connectorType, 'autocad');
    assert.equal(generic.valid, true);
    assert.equal(generic.connectorType, 'generic');
    assert(generic.summary.mappingDeltas >= 1);
  });

  it('prints CLI JSON reports and supports file output', () => {
    const stdout = execFileSync(process.execPath, [
      'tools/bim-connector-validator.mjs',
      revitPath,
      '--project-state',
      projectStatePath,
    ], { encoding: 'utf8' });
    const report = JSON.parse(stdout);
    assert.equal(report.valid, true);
    assert.equal(report.connectorType, 'revit');

    const tempDir = mkdtempSync(join(tmpdir(), 'bim-connector-'));
    const outPath = join(tempDir, 'report.json');
    execFileSync(process.execPath, [
      'tools/bim-connector-validator.mjs',
      autocadPath,
      '--project-state',
      projectStatePath,
      '--out',
      outPath,
      '--pretty',
    ]);
    const written = readJson(outPath);
    assert.equal(written.connectorType, 'autocad');
    assert.equal(written.valid, true);
  });

  it('returns nonzero for invalid packages unless --no-fail is supplied', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bim-connector-invalid-'));
    const invalidPath = join(tempDir, 'invalid.json');
    writeFileSync(invalidPath, JSON.stringify({ connectorType: 'navisworks', elements: [{}] }));
    const invalid = spawnSync(process.execPath, [
      'tools/bim-connector-validator.mjs',
      invalidPath,
    ], { encoding: 'utf8' });
    assert.equal(invalid.status, 1);

    const noFail = spawnSync(process.execPath, [
      'tools/bim-connector-validator.mjs',
      invalidPath,
      '--no-fail',
    ], { encoding: 'utf8' });
    assert.equal(noFail.status, 0);
  });
});

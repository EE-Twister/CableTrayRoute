import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTOCAD_NATIVE_SYNC_VERSION,
  buildAutoCadNativeExportMapping,
  buildAutoCadNativeSyncPackage,
  normalizeAutoCadNativeSyncCase,
  renderAutoCadNativeSyncHTML,
  validateAutoCadNativeSourceManifest,
} from '../analysis/autocadConnectorBridge.mjs';
import { validateConnectorImportPackage } from '../analysis/bimConnectorContract.mjs';

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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFiles = [
  'connectors/native/autocad/Commands.cs',
  'connectors/native/autocad/ConnectorJsonService.cs',
  'connectors/native/autocad/PackageContents.xml',
].map(file => ({
  path: file,
  content: fs.readFileSync(path.join(repoRoot, file), 'utf8'),
}));

const projectState = {
  projectName: 'AutoCAD <Plant>',
  projectId: 'autocad-plant',
  trays: [{ tray_id: 'TR-1', tag: 'TR-1', lengthFt: 120, system: 'Power', level: 'L1' }],
  conduits: [{ conduit_id: 'CD-1', tag: 'CD-1', lengthFt: 80, system: 'Control', level: 'L1' }],
  equipment: [{ id: 'SWBD-1', tag: 'SWBD-1', category: 'switchboard' }],
  bimObjectFamilies: [{
    manufacturer: 'Acme',
    catalogNumber: 'TR-12',
    category: 'tray',
    familyName: 'Tray Block <DWG>',
    typeName: '12 inch',
    nativeFormat: 'autocadBlock',
    ifcClass: 'IfcCableCarrierSegment',
    approved: true,
  }],
  productCatalog: [{ manufacturer: 'Acme', catalogNumber: 'TR-12', category: 'tray', approved: true }],
};

describe('Functional AutoCAD native sync bridge', () => {
  it('normalizes native sync cases and reports invalid versions/contracts', () => {
    const normalized = normalizeAutoCadNativeSyncCase({ targetVersion: '2026' });
    assert.equal(normalized.version, AUTOCAD_NATIVE_SYNC_VERSION);
    assert.equal(normalized.descriptor.connectorType, 'autocad');
    assert.equal(normalized.reviewOnly, true);
    assert.equal(normalized.supportsNativeMutation, false);
    assert(normalized.includeObjectTypes.includes('BlockReference'));

    const invalid = normalizeAutoCadNativeSyncCase({
      version: 'old',
      contractVersion: 'old-contract',
      supportsNativeMutation: true,
      reviewOnly: false,
    });
    assert(invalid.warnings.some(warning => warning.includes('Unsupported AutoCAD native sync version')));
    assert(invalid.warnings.some(warning => warning.includes('contract version')));
    assert(invalid.warnings.some(warning => warning.includes('Automatic AutoCAD drawing mutation')));
    assert(invalid.warnings.some(warning => warning.includes('review-only')));
  });

  it('validates source manifest command classes, template files, entity collection, and bundle coverage', () => {
    const manifest = validateAutoCadNativeSourceManifest({ sourceFiles });
    assert.equal(manifest.version, AUTOCAD_NATIVE_SYNC_VERSION);
    assert.equal(manifest.status, 'pass');
    assert.equal(manifest.commandRows.length, 4);
    assert(manifest.commandRows.every(row => row.status === 'pass'));
    assert(manifest.validationRows.some(row => row.id === 'entity-collector' && row.status === 'pass'));
    assert(manifest.validationRows.some(row => row.id === 'json-service-validation' && row.status === 'pass'));
    assert(manifest.validationRows.some(row => row.id === 'bundle-manifest' && row.status === 'pass'));
    assert(manifest.templateFiles.some(file => file.endsWith('Commands.cs')));
  });

  it('builds export mapping rows for cable trays, conduits, equipment, supports, blocks, MEP objects, and generic entities', () => {
    const rows = buildAutoCadNativeExportMapping(projectState);
    const objectTypes = rows.map(row => row.autocadObjectType).sort();
    assert.deepEqual(objectTypes, ['BlockReference', 'CableTray', 'Conduit', 'ElectricalEquipment', 'Entity', 'MepObject', 'Support']);
    assert(rows.some(row => row.elementType === 'cableTray' && row.familyName === 'Tray Block <DWG>'));
    assert(rows.some(row => row.autocadObjectType === 'BlockReference'));
    assert(rows.some(row => row.autocadObjectType === 'MepObject'));
    assert(rows.some(row => row.elementType === 'generic' && row.status === 'review'));
  });

  it('builds sample AutoCAD export payloads compatible with the connector contract', () => {
    const pkg = buildAutoCadNativeSyncPackage({
      projectState,
      sourceFiles,
      generatedAt: '2026-04-28T00:00:00.000Z',
      createdAt: '2026-04-28T00:00:00.000Z',
    });
    assert.equal(pkg.version, AUTOCAD_NATIVE_SYNC_VERSION);
    assert.equal(pkg.summary.commandReadyCount, 4);
    assert(pkg.commandRows.every(row => row.status === 'pass'));
    const validation = validateConnectorImportPackage(pkg.samplePayload);
    assert.equal(validation.valid, true);
    assert.equal(pkg.samplePayload.connectorType, 'autocad');
    assert(pkg.samplePayload.elements.some(row => row.tag === 'TR-1'));
  });

  it('previews AutoCAD round trips without mutating project state', () => {
    const original = structuredClone(projectState);
    const payload = {
      version: 'bim-connector-contract-v1',
      connectorType: 'autocad',
      sourceApplication: 'AutoCAD Plant 3D 2026',
      elements: [
        { guid: 'handle-1', sourceId: '1A', elementType: 'cableTray', tag: 'TR-1', lengthFt: 130, mappedProjectId: 'TR-1' },
        { elementType: 'equipment', tag: '' },
      ],
      issues: [{ title: 'Review <AutoCAD> clearance', elementIds: ['handle-1'] }],
    };
    const pkg = buildAutoCadNativeSyncPackage({ projectState, payload, sourceFiles });
    assert.equal(pkg.summary.acceptedPreviewRows, 1);
    assert.equal(pkg.summary.rejectedPreviewRows, 1);
    assert(pkg.syncPreviewRows.some(row => row.status === 'rejected'));
    assert.equal(pkg.issueRows.length, 1);
    assert.deepEqual(projectState, original);
  });

  it('renders escaped native sync HTML', () => {
    const pkg = buildAutoCadNativeSyncPackage({
      projectState,
      sourceFiles,
      exportMappingRows: [{
        autocadObjectType: 'BlockReference',
        elementType: 'generic',
        layerPattern: 'E-TRAY <LAYER>',
        blockNamePattern: 'Tray <Block>',
        mappedProjectType: 'generic',
        warnings: ['Review <block> mapping.'],
      }],
      payload: {
        version: 'bim-connector-contract-v1',
        connectorType: 'autocad',
        sourceApplication: 'AutoCAD <Drawing>',
        elements: [{ guid: 'handle-2', sourceId: '2B', elementType: 'generic', tag: 'CAD <1>' }],
        warnings: ['Payload <warning>'],
      },
    });
    const html = renderAutoCadNativeSyncHTML(pkg);
    assert(html.includes('Functional AutoCAD Add-In Sync Readiness'));
    assert(html.includes('E-TRAY &lt;LAYER&gt; Tray &lt;Block&gt;'));
    assert(html.includes('Review &lt;block&gt; mapping.'));
    assert(html.includes('Payload &lt;warning&gt;'));
    assert(!html.includes('Payload <warning>'));
  });
});

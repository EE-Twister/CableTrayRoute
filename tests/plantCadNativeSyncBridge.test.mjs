import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLANT_CAD_NATIVE_SYNC_VERSION,
  buildPlantCadNativeExportMapping,
  buildPlantCadNativeSyncPackage,
  normalizePlantCadNativeSyncCase,
  renderPlantCadNativeSyncHTML,
  validatePlantCadNativeSourceManifest,
} from '../analysis/plantCadConnectorBridge.mjs';
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
  'connectors/native/plantcad/README.md',
  'connectors/native/plantcad/aveva-native-commands.pml',
  'connectors/native/plantcad/smartplant-native-commands.md',
  'connectors/native/plantcad/plantcad-json-service-template.md',
  'connectors/native/plantcad/plantcad-mapping-notes.md',
].map(file => ({
  path: file,
  content: fs.readFileSync(path.join(repoRoot, file), 'utf8'),
}));

const projectState = {
  projectName: 'Plant <A>',
  projectId: 'plant-a',
  trays: [{ tray_id: 'TR-1', tag: 'TR-1', lengthFt: 120, system: 'Power', level: 'Rack <1>' }],
  conduits: [{ conduit_id: 'CD-1', tag: 'CD-1', lengthFt: 40, system: 'Control' }],
  equipment: [{ id: 'PMP-1', tag: 'Pump <Main>', category: 'pump' }],
  cables: [{ id: 'C-101', tag: 'C-101', length: 80 }],
  bimObjectFamilies: [{
    manufacturer: 'Acme',
    catalogNumber: 'TR-12',
    category: 'tray',
    familyName: 'Tray Family <Plant>',
    nativeFormat: 'ifcObjectType',
    ifcClass: 'IfcCableCarrierSegment',
    approved: true,
  }],
  productCatalog: [{ manufacturer: 'Acme', catalogNumber: 'TR-12', category: 'tray', approved: true }],
};

describe('Functional plant-CAD native sync bridge', () => {
  it('normalizes AVEVA and SmartPlant native sync cases and reports invalid assumptions', () => {
    const normalized = normalizePlantCadNativeSyncCase({});
    assert.equal(normalized.version, PLANT_CAD_NATIVE_SYNC_VERSION);
    assert.deepEqual(normalized.connectorTypes, ['aveva', 'smartplant']);
    assert.equal(normalized.reviewOnly, true);
    assert.equal(normalized.supportsNativeMutation, false);

    const invalid = normalizePlantCadNativeSyncCase({
      version: 'old',
      contractVersion: 'old-contract',
      supportsNativeMutation: true,
      reviewOnly: false,
    });
    assert(invalid.warnings.some(warning => warning.includes('Unsupported plant-CAD native sync version')));
    assert(invalid.warnings.some(warning => warning.includes('contract version')));
    assert(invalid.warnings.some(warning => warning.includes('model mutation')));
    assert(invalid.warnings.some(warning => warning.includes('review-only')));
  });

  it('validates source manifest coverage for required command templates and service files', () => {
    const manifest = validatePlantCadNativeSourceManifest({ sourceFiles });
    assert.equal(manifest.version, PLANT_CAD_NATIVE_SYNC_VERSION);
    assert.equal(manifest.status, 'pass');
    assert.equal(manifest.commandRows.length, 8);
    assert(manifest.commandRows.every(row => row.status === 'pass'));
    assert(manifest.validationRows.some(row => row.id === 'native-object-collector' && row.status === 'pass'));
    assert(manifest.validationRows.some(row => row.id === 'json-service-validation' && row.status === 'pass'));
    assert(manifest.templateFiles.some(file => file.endsWith('aveva-native-commands.pml')));
    assert(manifest.templateFiles.some(file => file.endsWith('smartplant-native-commands.md')));
  });

  it('builds export mappings for plant raceways, equipment, supports, cables, generic objects, and issues', () => {
    const rows = buildPlantCadNativeExportMapping(projectState);
    const objectTypes = rows.map(row => row.plantObjectType).sort();
    assert.deepEqual(objectTypes, ['Cable', 'CableTray', 'Conduit', 'Equipment', 'GenericPlantObject', 'IssueRecord', 'Support']);
    assert(rows.some(row => row.elementType === 'cableTray' && row.familyName === 'Tray Family <Plant>'));
    assert(rows.some(row => row.elementType === 'cable'));
    assert(rows.some(row => row.mappedProjectType === 'issue'));
    assert(rows.some(row => row.elementType === 'generic' && row.status === 'review'));
  });

  it('builds AVEVA and SmartPlant sample payloads compatible with the connector contract', () => {
    const pkg = buildPlantCadNativeSyncPackage({
      projectState,
      sourceFiles,
      generatedAt: '2026-04-28T00:00:00.000Z',
      createdAt: '2026-04-28T00:00:00.000Z',
    });
    assert.equal(pkg.version, PLANT_CAD_NATIVE_SYNC_VERSION);
    assert.equal(pkg.summary.commandReadyCount, 8);
    assert(pkg.commandRows.every(row => row.status === 'pass'));
    assert(pkg.samplePayloads.some(row => row.connectorType === 'aveva'));
    assert(pkg.samplePayloads.some(row => row.connectorType === 'smartplant'));
    pkg.samplePayloads.forEach(payload => assert.equal(validateConnectorImportPackage(payload).valid, true));
  });

  it('previews plant-CAD round trips without mutating project state', () => {
    const original = structuredClone(projectState);
    const pkg = buildPlantCadNativeSyncPackage({
      projectState,
      sourceFiles,
      payloads: [{
        version: 'bim-connector-contract-v1',
        connectorType: 'smartplant',
        sourceApplication: 'Hexagon SmartPlant 3D <Model>',
        elements: [
          { sourceId: 'sp3d-1', elementType: 'equipment', tag: 'PMP-1', quantity: 1, mappedProjectId: 'PMP-1' },
          { elementType: 'cableTray', tag: '' },
        ],
        issues: [{ title: 'Review <SP3D> issue', elementIds: ['sp3d-1'] }],
      }],
    });
    assert.equal(pkg.summary.acceptedPreviewRows, 1);
    assert.equal(pkg.summary.rejectedPreviewRows, 1);
    assert(pkg.syncPreviewRows.some(row => row.status === 'rejected'));
    assert.equal(pkg.issueRows.length, 1);
    assert.deepEqual(projectState, original);
  });

  it('renders escaped native sync HTML', () => {
    const pkg = buildPlantCadNativeSyncPackage({
      projectState,
      sourceFiles,
      exportMappingRows: [{
        plantObjectType: 'GenericPlantObject',
        elementType: 'generic',
        nativeClasses: 'Rack <Object>',
        mappedProjectType: 'generic',
        quantityBasis: 'Count',
        warnings: ['Review <generic> mapping.'],
      }],
      payload: {
        version: 'bim-connector-contract-v1',
        connectorType: 'aveva',
        sourceApplication: 'AVEVA <Model>',
        elements: [{ sourceId: 'dbref-2', elementType: 'generic', tag: 'Plant <1>' }],
        warnings: ['Payload <warning>'],
      },
    });
    const html = renderPlantCadNativeSyncHTML(pkg);
    assert(html.includes('Functional Plant CAD Add-In Sync Readiness'));
    assert(html.includes('Rack &lt;Object&gt;'));
    assert(html.includes('Review &lt;generic&gt; mapping.'));
    assert(html.includes('Payload &lt;warning&gt;'));
    assert(!html.includes('Payload <warning>'));
  });
});

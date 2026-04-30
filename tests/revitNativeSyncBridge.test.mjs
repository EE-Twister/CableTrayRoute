import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REVIT_NATIVE_SYNC_VERSION,
  buildRevitNativeExportMapping,
  buildRevitNativeSyncPackage,
  normalizeRevitNativeSyncCase,
  renderRevitNativeSyncHTML,
  validateRevitNativeSourceManifest,
} from '../analysis/revitConnectorBridge.mjs';
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
  'connectors/native/revit/Commands.cs',
  'connectors/native/revit/ConnectorJsonService.cs',
  'connectors/native/revit/CableTrayRoute.RevitConnector.addin',
].map(file => ({
  path: file,
  content: fs.readFileSync(path.join(repoRoot, file), 'utf8'),
}));

const projectState = {
  projectName: 'Revit <Plant>',
  projectId: 'revit-plant',
  trays: [{ tray_id: 'TR-1', tag: 'TR-1', lengthFt: 120, system: 'Power', level: 'L1' }],
  conduits: [{ conduit_id: 'CD-1', tag: 'CD-1', lengthFt: 80, system: 'Control', level: 'L1' }],
  equipment: [{ id: 'SWBD-1', tag: 'SWBD-1', category: 'switchboard' }],
  bimObjectFamilies: [{
    manufacturer: 'Acme',
    catalogNumber: 'TR-12',
    category: 'tray',
    familyName: 'Tray Family <RFA>',
    typeName: '12 inch',
    nativeFormat: 'revitFamily',
    ifcClass: 'IfcCableCarrierSegment',
    approved: true,
  }],
  productCatalog: [{ manufacturer: 'Acme', catalogNumber: 'TR-12', category: 'tray', approved: true }],
};

describe('Functional Revit native sync bridge', () => {
  it('normalizes native sync cases and reports invalid versions/contracts', () => {
    const normalized = normalizeRevitNativeSyncCase({ targetVersion: '2026' });
    assert.equal(normalized.version, REVIT_NATIVE_SYNC_VERSION);
    assert.equal(normalized.descriptor.connectorType, 'revit');
    assert.equal(normalized.reviewOnly, true);
    assert.equal(normalized.supportsNativeMutation, false);
    assert(normalized.includeCategories.includes('OST_CableTray'));

    const invalid = normalizeRevitNativeSyncCase({
      version: 'old',
      contractVersion: 'old-contract',
      supportsNativeMutation: true,
      reviewOnly: false,
    });
    assert(invalid.warnings.some(warning => warning.includes('Unsupported Revit native sync version')));
    assert(invalid.warnings.some(warning => warning.includes('contract version')));
    assert(invalid.warnings.some(warning => warning.includes('Automatic Revit model mutation')));
    assert(invalid.warnings.some(warning => warning.includes('review-only')));
  });

  it('validates source manifest command classes, template files, collector use, and addin coverage', () => {
    const manifest = validateRevitNativeSourceManifest({
      sourceFiles,
      addinManifest: sourceFiles.find(file => file.path.endsWith('.addin')).content,
    });
    assert.equal(manifest.version, REVIT_NATIVE_SYNC_VERSION);
    assert.equal(manifest.status, 'pass');
    assert.equal(manifest.commandRows.length, 4);
    assert(manifest.commandRows.every(row => row.status === 'pass'));
    assert(manifest.validationRows.some(row => row.id === 'filtered-element-collector' && row.status === 'pass'));
    assert(manifest.validationRows.some(row => row.id === 'json-service-validation' && row.status === 'pass'));
    assert(manifest.templateFiles.some(file => file.endsWith('Commands.cs')));
  });

  it('builds export mapping rows for cable trays, conduits, equipment, supports, and generic rows', () => {
    const rows = buildRevitNativeExportMapping(projectState);
    const types = rows.map(row => row.elementType).sort();
    assert.deepEqual(types, ['cableTray', 'conduit', 'equipment', 'generic', 'support']);
    assert(rows.some(row => row.revitCategory === 'OST_CableTray'));
    assert(rows.some(row => row.elementType === 'generic' && row.status === 'review'));
    assert(rows.some(row => row.familyName === 'Tray Family <RFA>'));
  });

  it('builds sample Revit export payloads compatible with the connector contract', () => {
    const pkg = buildRevitNativeSyncPackage({
      projectState,
      sourceFiles,
      generatedAt: '2026-04-28T00:00:00.000Z',
      createdAt: '2026-04-28T00:00:00.000Z',
    });
    assert.equal(pkg.version, REVIT_NATIVE_SYNC_VERSION);
    assert.equal(pkg.summary.commandReadyCount, 4);
    assert(pkg.commandRows.every(row => row.status === 'pass'));
    const validation = validateConnectorImportPackage(pkg.samplePayload);
    assert.equal(validation.valid, true);
    assert.equal(pkg.samplePayload.connectorType, 'revit');
    assert(pkg.samplePayload.elements.some(row => row.tag === 'TR-1'));
  });

  it('previews Revit round trips without mutating project state', () => {
    const original = structuredClone(projectState);
    const payload = {
      version: 'bim-connector-contract-v1',
      connectorType: 'revit',
      sourceApplication: 'Autodesk Revit 2026',
      elements: [
        { guid: 'uid-1', sourceId: '123', elementType: 'cableTray', tag: 'TR-1', lengthFt: 130, mappedProjectId: 'TR-1' },
        { elementType: 'equipment', tag: '' },
      ],
      issues: [{ title: 'Review <Revit> clearance', elementIds: ['uid-1'] }],
    };
    const pkg = buildRevitNativeSyncPackage({ projectState, payload, sourceFiles });
    assert.equal(pkg.summary.acceptedPreviewRows, 1);
    assert.equal(pkg.summary.rejectedPreviewRows, 1);
    assert(pkg.syncPreviewRows.some(row => row.status === 'rejected'));
    assert.equal(pkg.issueRows.length, 1);
    assert.deepEqual(projectState, original);
  });

  it('renders escaped native sync HTML', () => {
    const pkg = buildRevitNativeSyncPackage({
      projectState,
      sourceFiles,
      exportMappingRows: [{
        revitCategory: 'OST_CableTray',
        elementType: 'cableTray',
        familyName: 'Family <Unsafe>',
        mappedProjectType: 'tray',
        warnings: ['Review <family> mapping.'],
      }],
      payload: {
        version: 'bim-connector-contract-v1',
        connectorType: 'revit',
        sourceApplication: 'Revit <Model>',
        elements: [{ guid: 'uid-2', elementType: 'generic', tag: 'GEN <1>' }],
        warnings: ['Payload <warning>'],
      },
    });
    const html = renderRevitNativeSyncHTML(pkg);
    assert(html.includes('Functional Revit Add-In Sync Readiness'));
    assert(html.includes('Review &lt;family&gt; mapping.'));
    assert(html.includes('Payload &lt;warning&gt;'));
    assert(!html.includes('Payload <warning>'));
  });
});

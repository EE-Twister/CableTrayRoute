import assert from 'node:assert/strict';
import {
  AUTOCAD_BRIDGE_COMMANDS,
  buildAutoCadExportRequest,
  buildAutoCadNativeSyncPackage,
  buildAutoCadRoundTripPreview,
  buildAutoCadSyncReadinessPackage,
  normalizeAutoCadBridgeDescriptor,
  renderAutoCadSyncReadinessHTML,
  validateAutoCadConnectorPayload,
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

const projectState = {
  projectName: 'North <Unit>',
  projectId: 'north-unit',
  scenario: 'base',
  trays: [{
    tray_id: 'TR-1',
    tag: 'TR-1',
    system: 'Power',
    level: 'L1',
    area: 'Unit A',
    lengthFt: 120,
    manufacturer: 'Acme',
    catalogNumber: 'TR-12',
    category: 'tray',
  }],
  conduits: [{ conduit_id: 'CD-1', tag: 'CD-1', lengthFt: 40, system: 'Control', level: 'L1' }],
  equipment: [{ id: 'SWBD-1', tag: 'SWBD <Main>', category: 'Switchboard' }],
  cables: [{ id: 'C-101', tag: 'C-101', length: 80 }],
  productCatalog: [{ manufacturer: 'Acme', catalogNumber: 'TR-12', category: 'tray', approved: true }],
  bimObjectFamilies: [{
    manufacturer: 'Acme',
    catalogNumber: 'TR-12',
    category: 'tray',
    familyName: 'Tray Family <DWG>',
    nativeFormat: 'autocadBlock',
    ifcClass: 'IfcCableCarrierSegment',
    connectorTypes: ['power'],
    nominalDimensions: { widthIn: 12, heightIn: 4 },
    approved: true,
  }],
};

describe('AutoCAD connector bridge', () => {
  it('normalizes descriptors with AutoCAD defaults and all bridge commands', () => {
    const descriptor = normalizeAutoCadBridgeDescriptor({ targetVersion: '2026' });
    assert.equal(descriptor.version, 'autocad-connector-bridge-v1');
    assert.equal(descriptor.connectorType, 'autocad');
    assert.equal(descriptor.contractVersion, 'bim-connector-contract-v1');
    assert.equal(descriptor.validation.valid, true);
    assert(AUTOCAD_BRIDGE_COMMANDS.every(command => descriptor.commands.some(row => row.name === command)));
    assert(descriptor.installPaths.some(path => path.includes('/Autodesk/ApplicationPlugins/')));
    assert(descriptor.templateFiles.some(path => path.endsWith('ConnectorJsonService.cs')));
    assert(descriptor.packageContentsXml.includes('OpenCableTrayRouteBridge'));
  });

  it('reports invalid bridge versions, contract versions, and missing commands', () => {
    const descriptor = normalizeAutoCadBridgeDescriptor({
      version: 'bad',
      contractVersion: 'old',
      commands: ['ExportCableTrayRouteJson'],
      supportsLiveModelMutation: true,
    });
    assert.equal(descriptor.validation.valid, false);
    assert(descriptor.validation.errors.some(error => error.includes('Unsupported AutoCAD bridge version')));
    assert(descriptor.validation.errors.some(error => error.includes('contract version')));
    assert(descriptor.validation.errors.some(error => error.includes('OpenCableTrayRouteBridge')));
    assert(descriptor.warnings.some(warning => warning.includes('write-back')));
  });

  it('builds AutoCAD export requests compatible with the connector contract and BIM family hints', () => {
    const request = buildAutoCadExportRequest(projectState, {
      createdAt: '2026-04-28T00:00:00.000Z',
    });
    const validation = validateConnectorImportPackage(request.connectorPackage);
    assert.equal(validation.valid, true);
    assert.equal(request.connectorPackage.connectorType, 'autocad');
    assert(request.connectorPackage.elements.some(row => row.tag === 'TR-1'));
    assert(request.connectorPackage.propertySets.some(row => row.name === 'CableTrayRoute.BimObjectFamily'));
    assert(request.connectorPackage.mappingHints.some(row => row.familyName === 'Tray Family <DWG>'));
    assert.equal(request.bridge.reviewOnly, true);
  });

  it('keeps functional native AutoCAD sample payloads compatible with the bridge contract', () => {
    const pkg = buildAutoCadNativeSyncPackage({
      projectState,
      generatedAt: '2026-04-28T00:00:00.000Z',
      createdAt: '2026-04-28T00:00:00.000Z',
    });
    assert.equal(pkg.nativeSyncCase.descriptor.connectorType, 'autocad');
    assert(pkg.exportMappingRows.some(row => row.autocadObjectType === 'BlockReference'));
    const validation = validateAutoCadConnectorPayload(pkg.samplePayload);
    assert.equal(validation.valid, true);
    assert(pkg.samplePayload.elements.some(row => row.elementType === 'cableTray'));
  });

  it('validates AutoCAD payloads and rejects wrong connector types', () => {
    const valid = validateAutoCadConnectorPayload({
      version: 'bim-connector-contract-v1',
      connectorType: 'autocad',
      sourceApplication: 'AutoCAD Plant 3D <2026>',
      elements: [{ sourceId: 'handle-1A', elementType: 'cableTray', tag: 'TR-1' }],
    });
    assert.equal(valid.valid, true);
    assert(valid.warnings.every(warning => !warning.includes('Expected AutoCAD')));

    const invalid = validateAutoCadConnectorPayload({
      version: 'bim-connector-contract-v1',
      connectorType: 'revit',
      elements: [{ guid: 'revit-guid-1', elementType: 'cableTray', tag: 'TR-1' }],
    });
    assert.equal(invalid.valid, false);
    assert(invalid.errors.some(error => error.includes('Expected AutoCAD connector payload')));
  });

  it('builds round-trip previews without mutating project state', () => {
    const original = structuredClone(projectState);
    const preview = buildAutoCadRoundTripPreview({
      projectState,
      payload: {
        version: 'bim-connector-contract-v1',
        connectorType: 'autocad',
        sourceApplication: 'AutoCAD MEP',
        elements: [
          { sourceId: 'handle-new-1', elementType: 'equipment', tag: 'MCC-1', quantity: 1 },
          { elementType: 'cableTray', tag: '' },
        ],
        issues: [{ title: 'Review <CAD> clash', elementIds: ['handle-new-1'] }],
      },
    });
    assert.equal(preview.acceptedElements.length, 1);
    assert.equal(preview.rejectedElements.length, 1);
    assert.equal(preview.issueRows.length, 1);
    assert(preview.syncPreviewRows.some(row => row.status === 'rejected'));
    assert.deepEqual(projectState, original);
  });

  it('builds readiness packages with validation, preview, warnings, and escaped HTML', () => {
    const pkg = buildAutoCadSyncReadinessPackage({
      projectState,
      generatedAt: '2026-04-28T00:00:00.000Z',
      createdAt: '2026-04-28T00:00:00.000Z',
      payload: {
        version: 'bim-connector-contract-v1',
        connectorType: 'autocad',
        sourceApplication: 'AutoCAD <Connector>',
        elements: [{ sourceId: 'cad-handle-1', elementType: 'cableTray', tag: 'TR <1>', lengthFt: 130 }],
        warnings: ['Review <bridge> payload.'],
      },
    });
    assert.equal(pkg.version, 'autocad-connector-bridge-v1');
    assert.equal(pkg.summary.contractVersion, 'bim-connector-contract-v1');
    assert.equal(pkg.summary.commandCount, AUTOCAD_BRIDGE_COMMANDS.length);
    assert(pkg.validationRows.some(row => row.id === 'descriptor' && row.status === 'pass'));
    assert(pkg.syncPreviewRows.some(row => row.tag === 'TR <1>'));
    const html = renderAutoCadSyncReadinessHTML(pkg);
    assert(html.includes('AutoCAD Connector Sync Readiness'));
    assert(html.includes('TR &lt;1&gt;'));
    assert(html.includes('Review &lt;bridge&gt; payload.'));
    assert(!html.includes('TR <1>'));
  });
});

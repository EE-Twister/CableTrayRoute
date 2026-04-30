import assert from 'node:assert/strict';
import {
  PLANT_CAD_BRIDGE_COMMANDS,
  buildPlantCadExportRequest,
  buildPlantCadNativeSyncPackage,
  buildPlantCadRoundTripPreview,
  buildPlantCadSyncReadinessPackage,
  normalizePlantCadBridgeDescriptor,
  renderPlantCadSyncReadinessHTML,
  validatePlantCadConnectorPayload,
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

const projectState = {
  projectName: 'North <Unit>',
  projectId: 'north-unit',
  scenario: 'base',
  trays: [{
    tray_id: 'TR-1',
    tag: 'TR-1',
    system: 'Power',
    level: 'Pipe Rack <1>',
    area: 'Unit A',
    lengthFt: 120,
    manufacturer: 'Acme',
    catalogNumber: 'TR-12',
    category: 'tray',
  }],
  conduits: [{ conduit_id: 'CD-1', tag: 'CD-1', lengthFt: 40, system: 'Control', level: 'L1' }],
  equipment: [{ id: 'PMP-1', tag: 'Pump <Main>', category: 'Pump' }],
  cables: [{ id: 'C-101', tag: 'C-101', length: 80 }],
  productCatalog: [{ manufacturer: 'Acme', catalogNumber: 'TR-12', category: 'tray', approved: true }],
  bimObjectFamilies: [{
    manufacturer: 'Acme',
    catalogNumber: 'TR-12',
    category: 'tray',
    familyName: 'Tray Family <Plant>',
    nativeFormat: 'ifcObjectType',
    ifcClass: 'IfcCableCarrierSegment',
    connectorTypes: ['power'],
    nominalDimensions: { widthIn: 12, heightIn: 4 },
    approved: true,
  }],
};

describe('plant-CAD connector bridge', () => {
  it('normalizes AVEVA and SmartPlant descriptors with deterministic defaults', () => {
    const aveva = normalizePlantCadBridgeDescriptor({ connectorType: 'e3d' });
    const smartplant = normalizePlantCadBridgeDescriptor({ connectorType: 'sp3d' });
    assert.equal(aveva.version, 'plant-cad-connector-bridge-v1');
    assert.equal(aveva.connectorType, 'aveva');
    assert.equal(smartplant.connectorType, 'smartplant');
    assert.equal(aveva.validation.valid, true);
    assert.equal(smartplant.validation.valid, true);
    assert(PLANT_CAD_BRIDGE_COMMANDS.every(command => aveva.commands.some(row => row.name === command)));
    assert(aveva.templateFiles.some(file => file.includes('plantcad')));
    assert(smartplant.warnings.some(warning => warning.includes('Certified AVEVA and SmartPlant SDK plugins remain deferred')));
  });

  it('reports invalid versions, contract versions, and missing commands', () => {
    const descriptor = normalizePlantCadBridgeDescriptor({
      connectorType: 'aveva',
      version: 'bad',
      contractVersion: 'old',
      commands: ['ExportCableTrayRouteJson'],
      supportsLiveModelMutation: true,
    });
    assert.equal(descriptor.validation.valid, false);
    assert(descriptor.validation.errors.some(error => error.includes('Unsupported plant-CAD bridge version')));
    assert(descriptor.validation.errors.some(error => error.includes('contract version')));
    assert(descriptor.validation.errors.some(error => error.includes('OpenCableTrayRouteBridge')));
    assert(descriptor.warnings.some(warning => warning.includes('write-back')));
  });

  it('builds AVEVA and SmartPlant export requests compatible with the connector contract', () => {
    const aveva = buildPlantCadExportRequest(projectState, {
      descriptor: { connectorType: 'aveva' },
      createdAt: '2026-04-28T00:00:00.000Z',
    });
    const smartplant = buildPlantCadExportRequest(projectState, {
      descriptor: { connectorType: 'smartplant' },
      createdAt: '2026-04-28T00:00:00.000Z',
    });
    assert.equal(aveva.connectorPackage.connectorType, 'aveva');
    assert.equal(smartplant.connectorPackage.connectorType, 'smartplant');
    assert.equal(validateConnectorImportPackage(aveva.connectorPackage).valid, true);
    assert.equal(validateConnectorImportPackage(smartplant.connectorPackage).valid, true);
    assert(aveva.connectorPackage.propertySets.some(row => row.name === 'CableTrayRoute.PlantCad'));
    assert(smartplant.connectorPackage.mappingHints.some(row => row.familyName === 'Tray Family <Plant>'));
  });

  it('keeps functional native plant-CAD sample payloads compatible with existing bridge validation', () => {
    const pkg = buildPlantCadNativeSyncPackage({
      projectState,
      generatedAt: '2026-04-28T00:00:00.000Z',
      createdAt: '2026-04-28T00:00:00.000Z',
    });
    assert(pkg.samplePayloads.some(row => row.connectorType === 'aveva'));
    assert(pkg.samplePayloads.some(row => row.connectorType === 'smartplant'));
    pkg.samplePayloads.forEach(payload => assert.equal(validatePlantCadConnectorPayload(payload).valid, true));
    assert(pkg.exportMappingRows.some(row => row.plantObjectType === 'CableTray'));
  });

  it('validates plant-CAD payloads and rejects non-plant connector types', () => {
    const valid = validatePlantCadConnectorPayload({
      version: 'bim-connector-contract-v1',
      connectorType: 'aveva',
      sourceApplication: 'AVEVA E3D <Bridge>',
      elements: [{ sourceId: 'dbref-1', elementType: 'cableTray', tag: 'TR-1' }],
    });
    assert.equal(valid.valid, true);

    const invalid = validatePlantCadConnectorPayload({
      version: 'bim-connector-contract-v1',
      connectorType: 'autocad',
      sourceApplication: 'AutoCAD',
      elements: [{ sourceId: 'cad-1', elementType: 'cableTray', tag: 'TR-1' }],
    });
    assert.equal(invalid.valid, false);
    assert(invalid.errors.some(error => error.includes('Expected AVEVA or SmartPlant connector payload')));
  });

  it('builds round-trip previews without mutating project state', () => {
    const original = structuredClone(projectState);
    const preview = buildPlantCadRoundTripPreview({
      projectState,
      payload: {
        version: 'bim-connector-contract-v1',
        connectorType: 'smartplant',
        sourceApplication: 'Hexagon SmartPlant 3D',
        elements: [
          { sourceId: 'sp3d-new-1', elementType: 'equipment', tag: 'MCC-1', quantity: 1 },
          { elementType: 'cableTray', tag: '' },
        ],
        issues: [{ title: 'Review <SP3D> support clash', elementIds: ['sp3d-new-1'] }],
      },
    });
    assert.equal(preview.acceptedElements.length, 1);
    assert.equal(preview.rejectedElements.length, 1);
    assert.equal(preview.issueRows.length, 1);
    assert(preview.syncPreviewRows.some(row => row.status === 'rejected'));
    assert.deepEqual(projectState, original);
  });

  it('builds readiness packages with AVEVA and SmartPlant rows and escaped HTML', () => {
    const pkg = buildPlantCadSyncReadinessPackage({
      projectState,
      generatedAt: '2026-04-28T00:00:00.000Z',
      createdAt: '2026-04-28T00:00:00.000Z',
      payloads: [{
        version: 'bim-connector-contract-v1',
        connectorType: 'aveva',
        sourceApplication: 'AVEVA <Connector>',
        elements: [{ sourceId: 'aveva-dbref-1', elementType: 'cableTray', tag: 'TR <1>', lengthFt: 130 }],
        warnings: ['Review <plant> payload.'],
      }],
    });
    assert.equal(pkg.version, 'plant-cad-connector-bridge-v1');
    assert.equal(pkg.summary.contractVersion, 'bim-connector-contract-v1');
    assert.equal(pkg.summary.descriptorCount, 2);
    assert(pkg.descriptors.some(row => row.connectorType === 'aveva'));
    assert(pkg.descriptors.some(row => row.connectorType === 'smartplant'));
    assert(pkg.syncPreviewRows.some(row => row.tag === 'TR <1>'));
    const html = renderPlantCadSyncReadinessHTML(pkg);
    assert(html.includes('Plant CAD Connector Sync Readiness'));
    assert(html.includes('TR &lt;1&gt;'));
    assert(html.includes('Review &lt;plant&gt; payload.'));
    assert(!html.includes('TR <1>'));
  });
});

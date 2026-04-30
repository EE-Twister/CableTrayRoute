import assert from 'node:assert/strict';
import {
  buildNativeConnectorInstallChecklist,
  buildNativeConnectorKitPackage,
  buildNativeConnectorManifest,
  buildNativeConnectorSamplePayload,
  normalizeNativeConnectorDescriptor,
  renderNativeConnectorKitHTML,
  validateNativeConnectorDescriptor,
} from '../analysis/nativeBimConnectorKit.mjs';
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
  projectName: 'North Unit',
  scenario: 'base',
  trays: [{ tray_id: 'TR-1', tag: 'TR-1', lengthFt: 120, system: 'Power', level: 'L1', area: 'Unit A' }],
  conduits: [{ conduit_id: 'CD-1', tag: 'CD-1', lengthFt: 40, system: 'Control', level: 'L1' }],
  cables: [{ id: 'C-101', tag: 'C-101', length: 80 }],
  equipment: [{ id: 'SWBD-1', tag: 'SWBD-1', category: 'Switchboard' }],
  bimObjectFamilies: [{
    manufacturer: 'Generic',
    catalogNumber: 'TR-1',
    category: 'tray',
    familyName: 'Generic Tray',
    nativeFormat: 'revitFamily',
    ifcClass: 'IfcCableCarrierSegment',
    connectorTypes: ['power'],
    approved: true,
  }],
};

describe('native BIM/CAD connector starter kit', () => {
  it('normalizes Revit, AutoCAD, plant-CAD, and generic descriptors with deterministic defaults', () => {
    const revit = normalizeNativeConnectorDescriptor({ connectorType: 'rvt', targetApplication: 'Revit <2026>' });
    const autocad = normalizeNativeConnectorDescriptor({ connectorType: 'cad' });
    const aveva = normalizeNativeConnectorDescriptor({ connectorType: 'e3d' });
    const smartplant = normalizeNativeConnectorDescriptor({ connectorType: 'sp3d' });
    const generic = normalizeNativeConnectorDescriptor({ connectorType: 'other' });
    assert.equal(revit.connectorType, 'revit');
    assert.equal(autocad.connectorType, 'autocad');
    assert.equal(aveva.connectorType, 'aveva');
    assert.equal(smartplant.connectorType, 'smartplant');
    assert.equal(generic.connectorType, 'generic');
    assert(revit.templateFiles.some(file => file.includes('revit')));
    assert(autocad.installPaths.some(path => path.includes('ApplicationPlugins')));
    assert(aveva.targetApplication.includes('AVEVA'));
    assert(smartplant.targetApplication.includes('SmartPlant'));
    assert(aveva.templateFiles.some(file => file.includes('plantcad')));
    assert(revit.commands.some(command => command.name === 'ExportCableTrayRouteJson'));
  });

  it('rejects invalid connector descriptors and write-back assumptions', () => {
    const invalid = validateNativeConnectorDescriptor({
      version: 'bad-version',
      connectorType: 'navisworks',
      contractVersion: 'old',
      commands: [{ name: 'ExportCableTrayRouteJson', mutatesNativeModel: true }],
      installPaths: [],
      templateFiles: [],
    });
    assert.equal(invalid.valid, false);
    assert(invalid.errors.some(error => error.includes('Unsupported native connector type')));
    assert(invalid.errors.some(error => error.includes('contract version')));
    assert(invalid.warnings.some(warning => warning.includes('model-mutating') || warning.includes('write-back')));
  });

  it('builds native manifests and install checklist rows', () => {
    const descriptor = normalizeNativeConnectorDescriptor({ connectorType: 'revit' });
    const manifest = buildNativeConnectorManifest(descriptor);
    const checklist = buildNativeConnectorInstallChecklist({
      descriptors: [descriptor],
      connectorPackages: [],
      activeConnectorPackageId: '',
    });
    assert.equal(manifest.validation.valid, true);
    assert(checklist.some(row => row.id === 'active-connector-package' && row.status === 'missingData'));
    assert(checklist.some(row => row.item.includes('template files') && row.status === 'pass'));
  });

  it('builds sample payloads compatible with the existing connector contract', () => {
    for (const connectorType of ['autocad', 'aveva', 'smartplant']) {
      const payload = buildNativeConnectorSamplePayload({
        connectorType,
        projectState,
        createdAt: '2026-04-28T00:00:00.000Z',
      });
      const validation = validateConnectorImportPackage(payload);
      assert.equal(payload.connectorType, connectorType);
      assert.equal(validation.valid, true);
      assert(payload.elements.some(row => row.tag === 'TR-1'));
      assert(payload.mappingHints.length > 0);
    }
  });

  it('builds readiness package summaries deterministically', () => {
    const pkg = buildNativeConnectorKitPackage({
      projectState,
      connectorPackages: [{ id: 'connector-r1' }],
      activeConnectorPackageId: 'connector-r1',
      generatedAt: '2026-04-28T00:00:00.000Z',
      createdAt: '2026-04-28T00:00:00.000Z',
    });
    assert.equal(pkg.version, 'native-bim-connector-kit-v1');
    assert.equal(pkg.summary.descriptorCount, 5);
    assert.equal(pkg.summary.validDescriptorCount, 5);
    assert.equal(pkg.summary.samplePayloadCount, 5);
    assert(pkg.descriptors.some(row => row.connectorType === 'aveva'));
    assert(pkg.descriptors.some(row => row.connectorType === 'smartplant'));
    assert.equal(pkg.summary.missingChecklistItems, 0);
    assert.equal(pkg.summary.nativeWriteBackSupported, false);
  });

  it('renders escaped HTML output', () => {
    const pkg = buildNativeConnectorKitPackage({
      descriptors: [{ connectorType: 'revit', targetApplication: 'Revit <Connector>' }],
      projectState,
      connectorPackages: [{ id: 'connector-r1' }],
      activeConnectorPackageId: 'connector-r1',
    });
    const html = renderNativeConnectorKitHTML(pkg);
    assert(html.includes('Revit &lt;Connector&gt;'));
    assert(!html.includes('Revit <Connector>'));
    assert(html.includes('Native BIM/CAD Connector Starter Kit'));
  });
});

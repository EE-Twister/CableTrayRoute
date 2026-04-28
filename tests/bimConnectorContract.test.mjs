import assert from 'node:assert/strict';
import {
  applyConnectorImportPreview,
  buildConnectorExportPackage,
  buildConnectorReadinessPackage,
  buildConnectorRoundTripDiff,
  normalizeConnectorManifest,
  renderConnectorReadinessHTML,
  validateConnectorImportPackage,
} from '../analysis/bimConnectorContract.mjs';

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
  projectId: 'north-unit',
  scenario: 'base',
  cables: [{ id: 'C-101', tag: 'C-101', from: 'SWBD-1', to: 'P-101', length: 80 }],
  trays: [{ tray_id: 'TR-1', system: 'Power', level: 'L1', area: 'Unit A', lengthFt: 100, supportType: 'trapeze', drawingRef: 'E-201' }],
  conduits: [{ conduit_id: 'CD-1', system: 'Control', level: 'L1', area: 'Unit A', lengthFt: 40 }],
  equipment: [{ id: 'SWBD-1', tag: 'SWBD-1', category: 'Switchboard', level: 'L1' }],
  bimElements: [
    {
      guid: 'g-tr-1',
      sourceId: 'revit-tr-1',
      elementType: 'cableTray',
      tag: 'TR-1',
      system: 'Power',
      level: 'L1',
      area: 'Unit A',
      lengthFt: 110,
    },
  ],
  bimIssues: [
    {
      id: 'issue-1',
      title: 'Resolve tray delta',
      status: 'open',
      priority: 'high',
      elementIds: ['g-tr-1'],
      createdAt: '2026-04-27T10:00:00.000Z',
    },
  ],
};

describe('BIM/CAD connector contract helpers', () => {
  it('normalizes Revit, AutoCAD, and generic connector manifests deterministically', () => {
    const revit = normalizeConnectorManifest({
      connectorType: 'rvt',
      sourceApplication: 'Revit <2026>',
      projectId: 'north',
      createdAt: '2026-04-27T10:00:00.000Z',
      elements: [{ guid: 'g-1', elementType: 'Cable Tray', tag: 'TR-1' }],
    });
    const autocad = normalizeConnectorManifest({ connectorType: 'cad', elements: [] });
    const generic = normalizeConnectorManifest({ connectorType: 'other', elements: [] });
    assert.equal(revit.connectorType, 'revit');
    assert.equal(autocad.connectorType, 'autocad');
    assert.equal(generic.connectorType, 'generic');
    assert.equal(revit.elements[0].elementType, 'cableTray');
    assert(revit.id.includes('connector-revit'));
  });

  it('exports schedules, BIM elements, mapping hints, quantities, and issue records', () => {
    const pkg = buildConnectorExportPackage(projectState, {
      connectorType: 'revit',
      createdAt: '2026-04-27T10:00:00.000Z',
    });
    assert.equal(pkg.connectorType, 'revit');
    assert(pkg.elements.some(row => row.tag === 'TR-1'));
    assert(pkg.mappingHints.some(row => row.projectType === 'cableTray'));
    assert(pkg.quantities.some(row => row.elementType === 'cableTray'));
    assert(pkg.elements.some(row => row.sourceProperties?.racewayConstruction?.drawingRef === 'E-201'));
    assert(pkg.propertySets.some(row => row.name === 'CableTrayRoute.RacewayConstruction'));
    assert.equal(pkg.issues.length, 1);
    assert(pkg.assumptions.some(row => row.includes('review records')));
  });

  it('rejects invalid imports with missing version, unsupported type, duplicates, and malformed elements', () => {
    assert.equal(validateConnectorImportPackage({ connectorType: 'revit' }).valid, false);
    assert(validateConnectorImportPackage({ version: 'x', connectorType: 'navisworks' }).errors.some(err => err.includes('Unsupported connector type')));
    const duplicate = validateConnectorImportPackage({
      version: 'bim-connector-contract-v1',
      connectorType: 'revit',
      elements: [
        { guid: 'g-1', elementType: 'cableTray', tag: 'TR-1' },
        { guid: 'g-1', elementType: 'cableTray', tag: 'TR-1 Copy' },
      ],
    });
    assert(duplicate.errors.some(err => err.includes('Duplicate connector element identifier')));
    const malformed = validateConnectorImportPackage({
      version: 'bim-connector-contract-v1',
      connectorType: 'generic',
      elements: [{ elementType: 'cableTray' }],
    });
    assert(malformed.errors.some(err => err.includes('missing id') || err.includes('stable')));
  });

  it('previews accepted and rejected connector rows without mutating project state', () => {
    const original = structuredClone(projectState);
    const preview = applyConnectorImportPreview({
      projectState,
      payload: {
        version: 'bim-connector-contract-v1',
        connectorType: 'revit',
        elements: [
          { guid: 'g-new', elementType: 'equipment', tag: 'MCC-1', quantity: 1 },
          { elementType: 'cableTray', tag: '' },
        ],
        issues: [{ title: 'Connector issue', elementIds: ['g-new'] }],
      },
    });
    assert.equal(preview.acceptedElements.length, 1);
    assert.equal(preview.rejectedElements.length, 1);
    assert.equal(preview.newIssues.length, 1);
    assert.deepEqual(projectState, original);
  });

  it('detects added, removed, changed, unmapped, and quantity-delta rows in round trips', () => {
    const previousPackage = buildConnectorExportPackage(projectState, {
      connectorType: 'generic',
      createdAt: '2026-04-27T10:00:00.000Z',
    });
    const importPackage = normalizeConnectorManifest({
      ...previousPackage,
      createdAt: '2026-04-27T11:00:00.000Z',
      elements: [
        { ...previousPackage.elements[0], name: 'Tray changed', lengthFt: 160 },
        { guid: 'g-new', elementType: 'equipment', tag: 'MCC-2', quantity: 1 },
      ],
      quantities: [{ elementType: 'cableTray', system: 'Power', level: 'L1', area: 'Unit A', quantity: 160 }],
    });
    const diff = buildConnectorRoundTripDiff({ previousPackage, importPackage, projectState });
    assert(diff.elements.added.length >= 1);
    assert(diff.elements.removed.length >= 1);
    assert(diff.elements.changed.length >= 1);
    assert(diff.mappingDeltas.some(row => row.elementId));
    assert(diff.quantityDeltas.some(row => row.elementType === 'cableTray'));
  });

  it('builds readiness packages and escapes rendered HTML', () => {
    const active = normalizeConnectorManifest({
      connectorType: 'revit',
      sourceApplication: 'Revit <Connector>',
      projectId: 'north',
      createdAt: '2026-04-27T10:00:00.000Z',
      elements: [{ guid: 'g-tr-1', elementType: 'cableTray', tag: 'TR <1>', lengthFt: 140 }],
      issues: [{ title: 'Resolve <issue>', status: 'open' }],
      warnings: ['Review <connector> warning'],
    });
    const pkg = buildConnectorReadinessPackage({
      packages: [active],
      activePackageId: active.id,
      projectState,
      now: '2026-04-27T12:00:00.000Z',
    });
    assert.equal(pkg.summary.packageCount, 1);
    assert.equal(pkg.summary.activeConnectorType, 'revit');
    const html = renderConnectorReadinessHTML(pkg);
    assert(html.includes('Revit &lt;Connector&gt;'));
    assert(html.includes('Review &lt;connector&gt; warning'));
    assert(!html.includes('Revit <Connector>'));
  });
});

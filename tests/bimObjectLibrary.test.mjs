import assert from 'node:assert/strict';
import {
  BIM_OBJECT_LIBRARY_VERSION,
  buildBimObjectConnectorHints,
  buildBimObjectLibraryPackage,
  buildBimObjectPropertySets,
  mapCatalogRowsToBimFamilies,
  normalizeBimObjectFamily,
  normalizeBimObjectLibrary,
  renderBimObjectLibraryHTML,
  validateBimObjectFamily,
} from '../analysis/bimObjectLibrary.mjs';

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

const catalogRows = [
  {
    id: 'tray-a',
    manufacturer: 'Cooper',
    catalogNumber: 'TR-12',
    series: 'XTR',
    category: 'tray',
    description: '12 in ladder tray',
    approved: true,
    approvalStatus: 'approved',
    approvedBy: 'QA',
    lastVerified: '2026-04-01',
  },
  {
    id: 'breaker-a',
    manufacturer: 'Eaton',
    catalogNumber: 'BRK-100',
    category: 'protectiveDevice',
    description: '100 A breaker',
    approved: true,
    approvalStatus: 'approved',
    lastVerified: '2026-04-01',
  },
];

const familyRows = [
  {
    manufacturer: 'Cooper',
    catalogNumber: 'TR-12',
    series: 'XTR',
    category: 'tray',
    familyName: 'Tray <12>',
    familyType: '12x4',
    nativeFormat: 'rfa',
    ifcClass: 'IfcCableCarrierSegment',
    revitCategory: 'Cable Trays',
    connectorTypes: 'power;data',
    width_in: 12,
    depth_in: 4,
    approved: true,
    approvalStatus: 'approved',
    lastVerified: '2026-04-01',
  },
];

describe('BIM object library', () => {
  it('normalizes empty and legacy library inputs deterministically', () => {
    const empty = normalizeBimObjectLibrary();
    assert.equal(empty.version, BIM_OBJECT_LIBRARY_VERSION);
    assert.deepEqual(empty.familyRows, []);
    const row = normalizeBimObjectFamily(familyRows[0]);
    assert.equal(row.nativeFormat, 'revitFamily');
    assert.equal(row.category, 'tray');
    assert.deepEqual(row.connectorTypes, ['data', 'power']);
    assert.equal(row.nominalDimensions.widthIn, 12);
  });

  it('validates required family metadata and warns for missing dimensions/connectors', () => {
    const invalid = validateBimObjectFamily({ manufacturer: 'Bad <Maker>', category: 'tray' }, catalogRows);
    assert.equal(invalid.valid, false);
    assert(invalid.errors.some(error => error.includes('catalogNumber')));
    assert(invalid.errors.some(error => error.includes('familyName')));
    assert(invalid.errors.some(error => error.includes('nativeFormat')));
    assert(invalid.warnings.some(warning => warning.includes('connectorTypes')));
  });

  it('maps catalog rows to BIM families by exact key and deterministic missing coverage', () => {
    const coverage = mapCatalogRowsToBimFamilies({ catalogRows, familyRows });
    const tray = coverage.rows.find(row => row.catalogNumber === 'TR-12');
    const breaker = coverage.rows.find(row => row.catalogNumber === 'BRK-100');
    assert.equal(tray.status, 'ready');
    assert.equal(tray.matchType, 'exact');
    assert.equal(breaker.status, 'missingFamily');
    assert.equal(coverage.summary.missingFamily, 1);
  });

  it('detects conflicting catalog-family mappings', () => {
    const coverage = mapCatalogRowsToBimFamilies({
      catalogRows: [catalogRows[0]],
      familyRows: [
        familyRows[0],
        { ...familyRows[0], id: 'alternate-family', familyName: 'Tray Alternate' },
      ],
    });
    assert.equal(coverage.rows[0].status, 'conflict');
    assert(coverage.rows[0].warnings.some(warning => warning.includes('Multiple')));
  });

  it('builds property sets and connector hints for BIM handoff', () => {
    const propertySets = buildBimObjectPropertySets({ familyRows, catalogRows });
    const hints = buildBimObjectConnectorHints({
      familyRows,
      projectState: {
        trays: [{ id: 'TR-1', tag: 'TR-1', manufacturer: 'Cooper', catalogNumber: 'TR-12', category: 'tray' }],
        equipment: [{ id: 'SWBD-1', tag: 'SWBD-1', manufacturer: 'Generic', catalogNumber: 'SWBD', category: 'equipment' }],
      },
    });
    assert.equal(propertySets[0].properties.familyName, 'Tray <12>');
    assert.equal(hints.find(row => row.projectId === 'TR-1').status, 'ready');
    assert.equal(hints.find(row => row.projectId === 'SWBD-1').status, 'genericPlaceholder');
  });

  it('builds package JSON with warnings, assumptions, and escaped HTML', () => {
    const pkg = buildBimObjectLibraryPackage({
      projectName: 'North <Unit>',
      catalogRows,
      familyRows,
      projectState: {
        trays: [{ id: 'TR-1', tag: 'TR-1', manufacturer: 'Cooper', catalogNumber: 'TR-12', category: 'tray' }],
      },
      generatedAt: '2026-04-28T00:00:00.000Z',
    });
    assert.equal(pkg.version, BIM_OBJECT_LIBRARY_VERSION);
    assert.equal(pkg.summary.familyCount, 1);
    assert.equal(pkg.summary.catalogRows, 2);
    assert.equal(pkg.summary.missingFamilyCount, 1);
    assert(pkg.propertySets.length > 0);
    assert(pkg.connectorHints.length > 0);
    assert(pkg.assumptions.some(text => text.includes('not proprietary')));
    const html = renderBimObjectLibraryHTML(pkg);
    assert(html.includes('Tray &lt;12&gt;'));
    assert(!html.includes('Tray <12>'));
    assert(html.includes('BIM Object Library and Family Metadata'));
  });
});

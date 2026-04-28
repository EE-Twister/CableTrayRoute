import assert from 'node:assert/strict';
import {
  buildBimElementIndex,
  buildBimQuantityReconciliation,
  buildBimRoundTripPackage,
  createBimIssue,
  mapBimElementsToProject,
  normalizeBimElement,
  parseBimImportPayload,
  renderBimRoundTripHTML,
  updateBimIssue,
} from '../analysis/bimRoundTrip.mjs';
import { buildConnectorExportPackage } from '../analysis/bimConnectorContract.mjs';

function makeStorage() {
  const store = new Map();
  return {
    get length() { return store.size; },
    key(index) { return [...store.keys()][index] || null; },
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
}

global.localStorage = makeStorage();
const dataStore = await import('../dataStore.mjs');

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

describe('BIM round-trip helpers', () => {
  it('normalizes BIM elements with stable IDs and defaults', () => {
    const row = normalizeBimElement({
      GlobalId: '2YkGuid',
      UniqueId: 'revit-101',
      type: 'Cable Tray',
      Tag: 'TR-101',
      LengthFt: '40',
      level: 'L2',
    });
    assert.equal(row.guid, '2YkGuid');
    assert.equal(row.sourceId, 'revit-101');
    assert.equal(row.elementType, 'cableTray');
    assert.equal(row.tag, 'TR-101');
    assert.equal(row.lengthFt, 40);
    assert.equal(row.level, 'L2');
  });

  it('parses Revit-style JSON and simplified IFC metadata payloads', () => {
    const revit = parseBimImportPayload({
      cableTrays: [{ guid: 'g-tr-1', id: 'TR-1', lengthFt: 30, system: 'Power' }],
      conduits: [{ guid: 'g-cd-1', conduit_id: 'CD-1', lengthFt: 12 }],
      equipment: [{ guid: 'g-swbd', tag: 'SWBD-1' }],
    });
    assert.equal(revit.elements.length, 3);
    assert(revit.elements.some(row => row.elementType === 'equipment'));

    const ifc = parseBimImportPayload("#20=IFCCABLECARRIERSEGMENT('ifc-guid-1',$,'TR-IFC',$,$)IFCPOLYLINE((0,0,0),(10,0,0));");
    assert.equal(ifc.elements.length, 1);
    assert.equal(ifc.elements[0].guid, 'ifc-guid-1');
    assert.equal(ifc.elements[0].lengthFt, 10);
  });

  it('builds lookup indexes by GUID, source ID, and tag', () => {
    const index = buildBimElementIndex([
      { guid: 'GUID-1', sourceId: 'S-1', tag: 'TR-1', elementType: 'cableTray' },
    ]);
    assert.equal(index.byGuid.get('guid1').tag, 'TR-1');
    assert.equal(index.bySourceId.get('s1').tag, 'TR-1');
    assert.equal(index.byTag.get('tr1').guid, 'GUID-1');
  });

  it('maps imported elements to project records by GUID, source ID, tag, and name', () => {
    const mappings = mapBimElementsToProject({
      bimElements: [
        { guid: 'g-1', tag: 'Other', elementType: 'cableTray' },
        { sourceId: 'revit-2', tag: 'Other', elementType: 'conduit' },
        { tag: 'SWBD-1', elementType: 'equipment' },
        { name: 'C-101', elementType: 'cable' },
      ],
      trays: [{ id: 'TR-1', guid: 'g-1' }],
      conduits: [{ conduit_id: 'CD-1', sourceId: 'revit-2' }],
      equipment: [{ id: 'EQ-1', tag: 'SWBD-1' }],
      cables: [{ id: 'C-101' }],
    });
    assert.deepEqual(mappings.map(row => row.method), ['guid', 'sourceId', 'tag', 'name']);
    assert(mappings.every(row => row.status === 'mapped'));
  });

  it('generates quantity reconciliation rows for missing, added, and changed groups', () => {
    const result = buildBimQuantityReconciliation({
      bimElements: [
        { elementType: 'cableTray', tag: 'TR-1', system: 'Power', level: 'L1', area: 'A', lengthFt: 120 },
        { elementType: 'conduit', tag: 'CD-BIM', system: 'Power', level: 'L1', area: 'A', lengthFt: 20 },
      ],
      projectState: {
        trays: [{ tray_id: 'TR-1', system: 'Power', level: 'L1', area: 'A', lengthFt: 100 }],
        conduits: [{ conduit_id: 'CD-PROJ', system: 'Control', level: 'L1', area: 'A', lengthFt: 10 }],
        equipment: [],
        cables: [],
      },
      tolerancePct: 5,
    });
    assert(result.rows.some(row => row.elementType === 'cableTray' && row.status === 'changed'));
    assert(result.rows.some(row => row.elementType === 'conduit' && row.status === 'bimOnly'));
    assert(result.rows.some(row => row.elementType === 'conduit' && row.status === 'projectOnly'));
  });

  it('creates and updates BCF-style issues without mutating the original', () => {
    const issue = createBimIssue({
      title: 'Resolve tray clash',
      elementIds: ['bim-1'],
      assignee: 'BIM Lead',
      comments: ['Initial issue'],
      createdAt: '2026-04-27T10:00:00.000Z',
    });
    const updated = updateBimIssue(issue, { status: 'resolved', updatedAt: '2026-04-27T11:00:00.000Z' });
    assert.equal(issue.status, 'open');
    assert.equal(updated.status, 'resolved');
    assert.equal(updated.resolvedAt, '2026-04-27T11:00:00.000Z');
    assert.equal(updated.comments[0].body, 'Initial issue');
  });

  it('builds package JSON and escapes rendered HTML', () => {
    const pkg = buildBimRoundTripPackage({
      projectName: 'North <Unit>',
      bimElements: [{ elementType: 'equipment', tag: 'SWBD <1>', guid: 'g-swbd' }],
      equipment: [{ tag: 'SWBD <1>' }],
      bimIssues: [createBimIssue({
        title: 'Fix <markup>',
        description: 'Review <bad> element',
        assignee: 'A <B>',
        elementIds: ['g-swbd'],
        createdAt: '2026-04-27T10:00:00.000Z',
      })],
    });
    assert.equal(pkg.version, 'bim-round-trip-v1');
    assert.equal(pkg.summary.elementCount, 1);
    assert.equal(pkg.issues.length, 1);
    const html = renderBimRoundTripHTML(pkg);
    assert(html.includes('Fix &lt;markup&gt;'));
    assert(html.includes('A &lt;B&gt;'));
    assert(!html.includes('Fix <markup>'));
  });

  it('persists BIM elements and issues through scenario storage helpers', () => {
    assert.deepEqual(dataStore.getBimElements(), []);
    assert.deepEqual(dataStore.getBimIssues(), []);
    dataStore.addBimElements([{ elementType: 'cableTray', tag: 'TR-1', guid: 'g-tr-1' }]);
    const issue = dataStore.addBimIssue({ title: 'Open BIM item', elementIds: ['g-tr-1'], createdAt: '2026-04-27T10:00:00.000Z' });
    assert.equal(dataStore.getBimElements().length, 1);
    assert.equal(dataStore.getBimIssues().length, 1);
    dataStore.updateBimIssue(issue.id, { status: 'resolved', updatedAt: '2026-04-27T11:00:00.000Z' });
    assert.equal(dataStore.getBimIssues()[0].status, 'resolved');
  });

  it('interoperates with connector exchange packages and storage helpers', () => {
    const connectorPackage = buildConnectorExportPackage({
      projectName: 'North Unit',
      trays: [{ tray_id: 'TR-2', lengthFt: 50, supportType: 'trapeze', drawingRef: 'E-201', labelId: 'LBL-TR-2' }],
      bimElements: [{ guid: 'g-tr-2', elementType: 'cableTray', tag: 'TR-2', lengthFt: 50 }],
      bimIssues: [],
    }, {
      connectorType: 'autocad',
      createdAt: '2026-04-27T12:00:00.000Z',
    });
    assert.equal(connectorPackage.connectorType, 'autocad');
    assert(connectorPackage.elements.every(row => normalizeBimElement(row).id));
    const trayElement = connectorPackage.elements.find(row => row.tag === 'TR-2');
    assert.equal(trayElement.sourceProperties.racewayConstruction.supportType, 'trapeze');
    assert(connectorPackage.propertySets.some(row => row.name === 'CableTrayRoute.RacewayConstruction'));
    dataStore.addBimConnectorPackage(connectorPackage);
    dataStore.setActiveBimConnectorPackageId(connectorPackage.id);
    assert.equal(dataStore.getBimConnectorPackages().length, 1);
    assert.equal(dataStore.getActiveBimConnectorPackageId(), connectorPackage.id);
  });
});

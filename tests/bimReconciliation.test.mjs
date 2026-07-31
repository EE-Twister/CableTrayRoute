import assert from 'assert';
import {
  createBimIssue,
  createBimSnapshot,
  exportBimIssueExchange,
  importBimIssueExchange,
  reconcileBimSnapshot
} from '../analysis/bimReconciliation.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (error) {
    console.error('  ✗', name, error.message || error);
    process.exitCode = 1;
  }
}

describe('BIM reconciliation', () => {
  it('keeps imported IFC/Revit GUIDs in a read-only snapshot', () => {
    const snapshot = createBimSnapshot({
      trays: [{ id: 'TR-01', bim_guid: '2Yx$ABC', start_x: 0, start_y: 0, start_z: 0, end_x: 12, end_y: 0, end_z: 0 }]
    }, { sourceName: 'coordination.ifc', importedAt: '2026-07-31T00:00:00.000Z' });
    assert.strictEqual(snapshot.sourceName, 'coordination.ifc');
    assert.strictEqual(snapshot.elements[0].sourceGuid, '2Yx$ABC');
    assert.strictEqual(snapshot.elements[0].stableId, 'tray:2Yx$ABC');
    assert.strictEqual(snapshot.elements[0].length, 12);
  });

  it('maps schedule records by GUID and reports geometry, schedule-only, and BIM-only differences', () => {
    const snapshot = createBimSnapshot({
      trays: [
        { id: 'TR-01', bim_guid: 'GUID-1', start_x: 0, start_y: 0, start_z: 0, end_x: 13, end_y: 0, end_z: 0 },
        { id: 'TR-NEW', bim_guid: 'GUID-2', start_x: 0, start_y: 0, start_z: 0, end_x: 4, end_y: 0, end_z: 0 }
      ]
    });
    const result = reconcileBimSnapshot({
      trays: [
        { tray_id: 'TR-01', bim_guid: 'GUID-1', start_x: 0, start_y: 0, start_z: 0, end_x: 10, end_y: 0, end_z: 0 },
        { tray_id: 'TR-SCHEDULE', start_x: 0, start_y: 0, start_z: 0, end_x: 4, end_y: 0, end_z: 0 }
      ]
    }, snapshot);
    assert.strictEqual(result.summary.geometry_changed, 1);
    assert.strictEqual(result.summary.schedule_only, 1);
    assert.strictEqual(result.summary.bim_only, 1);
    assert.strictEqual(result.differences.find(row => row.id === 'TR-01').lengthDelta, 3);
  });

  it('summarizes quantity deltas by type and coordination grouping', () => {
    const snapshot = createBimSnapshot({
      conduits: [{ conduit_id: 'C-01', system: 'Process', voltage: '480V', level: 'L1', area: 'North', start_x: 0, start_y: 0, start_z: 0, end_x: 20, end_y: 0, end_z: 0 }]
    });
    const result = reconcileBimSnapshot({
      conduits: [{ conduit_id: 'C-01', system: 'Process', voltage: '480V', level: 'L1', area: 'North', start_x: 0, start_y: 0, start_z: 0, end_x: 15, end_y: 0, end_z: 0 }]
    }, snapshot);
    assert.strictEqual(result.quantities.length, 1);
    assert.strictEqual(result.quantities[0].countDelta, 0);
    assert.strictEqual(result.quantities[0].lengthDelta, 5);
  });

  it('retains imported equipment and supports as BIM-only coordination targets', () => {
    const snapshot = createBimSnapshot({
      equipment: [{ id: 'MCC-1', bim_guid: 'EQ-GUID-1', family: 'MCC', manufacturer: 'Contoso', x: 10, y: 20, z: 0 }],
      supports: [{ id: 'HGR-1', bim_guid: 'SUP-GUID-1', supportType: 'Trapeze', hostId: 'TR-01', x: 12, y: 0, z: 8 }]
    });
    const result = reconcileBimSnapshot({}, snapshot);
    assert.strictEqual(result.summary.bim_only, 2);
    assert.deepStrictEqual(result.differences.map(row => row.kind).sort(), ['equipment', 'support']);
    assert.strictEqual(snapshot.elements.find(element => element.kind === 'support').hostId, 'TR-01');
  });

  it('round-trips BCF-like issue metadata including assignee, comments, and evidence', () => {
    const issue = createBimIssue({
      id: 'CTR-BCF-001',
      title: 'Tray length differs',
      elementIds: ['GUID-1'],
      assignee: 'Model coordinator',
      comment: 'Confirm installed routing.',
      author: 'Electrical engineer',
      screenshot: 'coordination-view.png',
      createdAt: '2026-07-31T00:00:00.000Z'
    });
    const exchange = exportBimIssueExchange([issue], { sourceName: 'coordination.ifc' });
    const imported = importBimIssueExchange(JSON.stringify(exchange));
    assert.strictEqual(imported[0].id, 'CTR-BCF-001');
    assert.strictEqual(imported[0].assignee, 'Model coordinator');
    assert.strictEqual(imported[0].comments[0].text, 'Confirm installed routing.');
    assert.strictEqual(imported[0].screenshot, 'coordination-view.png');
  });
});

import assert from 'node:assert/strict';

import {
  buildDuctbankConduitIndex,
  resolveDuctbankConduitAssignment,
  resolveRouteResultConduits,
} from '../analysis/ductbankConduitAssignment.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (error) { console.error('  ✗', name, error.message || error); process.exitCode = 1; }
}

const ductbanks = [
  {
    tag: 'DB-1',
    conduits: [
      { conduit_id: 'C-1', type: 'PVC Sch 40', trade_size: '2' },
      { conduit_id: 'C-2', type: 'PVC Sch 40', trade_size: '2' },
    ],
  },
  {
    tag: 'DB-2',
    conduits: [
      { conduit_id: 'C-1', type: 'PVC Sch 40', trade_size: '4' },
    ],
  },
];

describe('ductbank internal-conduit assignment', () => {
  const index = buildDuctbankConduitIndex({ ductbanks });

  it('scopes duplicate conduit IDs by ductbank', () => {
    const db1 = resolveDuctbankConduitAssignment(
      { type: 'conduit', ductbankTag: 'DB-1', conduit_id: 'C-1' },
      {},
      index
    );
    const db2 = resolveDuctbankConduitAssignment(
      { type: 'conduit', ductbankTag: 'DB-2', conduit_id: 'C-1' },
      {},
      index
    );
    assert.equal(db1.identity, 'DB-1:C-1');
    assert.equal(db1.record.trade_size, '2');
    assert.equal(db2.identity, 'DB-2:C-1');
    assert.equal(db2.record.trade_size, '4');
  });

  it('uses an explicit cable assignment for a parent-only ductbank segment', () => {
    const result = resolveDuctbankConduitAssignment(
      { type: 'ductbank', ductbankTag: 'DB-1', tray_id: 'DB-1' },
      { tag: 'CBL-1', conduit_id: 'C-2' },
      index
    );
    assert.equal(result.status, 'resolved');
    assert.equal(result.source, 'cable-explicit');
    assert.equal(result.identity, 'DB-1:C-2');
  });

  it('accepts a scope-qualified cable-schedule alias without losing the parent scope', () => {
    const result = resolveDuctbankConduitAssignment(
      { type: 'ductbank', ductbankTag: 'DB-1', tray_id: 'DB-1' },
      { tag: 'CBL-1', conduit_id: 'DB-1-C-2' },
      index
    );
    assert.equal(result.status, 'resolved');
    assert.equal(result.identity, 'DB-1:C-2');
  });

  it('does not guess when a ductbank contains multiple eligible conduits', () => {
    const result = resolveDuctbankConduitAssignment(
      { type: 'ductbank', ductbankTag: 'DB-1', tray_id: 'DB-1' },
      {},
      index
    );
    assert.equal(result.status, 'missing');
    assert.deepEqual(result.candidates.sort(), ['DB-1:C-1', 'DB-1:C-2']);
  });

  it('normalizes route and breakdown handoffs to the same canonical identity', () => {
    const [result] = resolveRouteResultConduits([
      {
        cable: 'CBL-1',
        route_segments: [{ type: 'ductbank', ductbankTag: 'DB-1', tray_id: 'DB-1' }],
        breakdown: [{ type: 'ductbank', ductbankTag: 'DB-1', tray_id: 'DB-1' }],
      },
    ], [{ tag: 'CBL-1', conduit_id: 'C-2' }], { ductbanks });
    assert.equal(result.route_segments[0].conduit_identity, 'DB-1:C-2');
    assert.equal(result.breakdown[0].conduit_identity, 'DB-1:C-2');
    assert.equal(result.route_segments[0].conduit_assignment_source, 'cable-explicit');
    assert.equal(result.conduit_assignment_warnings.length, 0);
  });
});

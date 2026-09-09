import assert from 'node:assert/strict';

import {
  buildRacewayAssurance,
  routeAssuranceSignature,
} from '../analysis/racewayAssurance.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (error) { console.error('  ✗', name, error.message || error); process.exitCode = 1; }
}

const tray = {
  tray_id: 'TR-1',
  tray_type: 'Ladder',
  inside_width: 12,
  tray_depth: 6,
  allowed_cable_group: 'LV',
};

const cable = {
  tag: 'CBL-1',
  cable_type: 'Power',
  conductors: 3,
  conductor_size: '#2 AWG',
  cable_area: 1,
  allowed_cable_group: 'LV',
  start_x: 0,
  start_y: 0,
  start_z: 10,
  end_x: 100,
  end_y: 0,
  end_z: 10,
};

function route(overrides = {}) {
  return {
    cable: 'CBL-1',
    status: 'Routed',
    total_length: 100,
    route_segments: [
      { type: 'tray', tray_id: 'TR-1', start: [0, 0, 10], end: [100, 0, 10], length: 100 },
    ],
    ...overrides,
  };
}

function assurance(overrides = {}) {
  return buildRacewayAssurance({
    routeResults: { inputFingerprint: 'current', batchResults: [route()] },
    currentInputFingerprint: 'current',
    cables: [cable],
    trays: [tray],
    conduits: [],
    ductbanks: [],
    ...overrides,
  });
}

describe('raceway assurance', () => {
  it('passes a continuous, current, compatible route with selected fill evidence', () => {
    const result = assurance();
    assert.equal(result.status, 'pass');
    assert.equal(result.summary.routesChecked, 1);
    assert.equal(result.summary.capacityChecks, 1);
    assert.equal(result.summary.blockingIssues, 0);
    assert.match(result.resultChecks[0].signature, /^[0-9a-f]{8}$/);
  });

  it('produces a deterministic signature for identical route geometry', () => {
    assert.equal(routeAssuranceSignature(route()), routeAssuranceSignature(route()));
    assert.notEqual(
      routeAssuranceSignature(route()),
      routeAssuranceSignature(route({
        total_length: 101,
        route_segments: [{ type: 'tray', tray_id: 'TR-1', start: [0, 0, 10], end: [101, 0, 10], length: 101 }],
      }))
    );
  });

  it('blocks discontinuous segment geometry', () => {
    const result = assurance({
      routeResults: {
        inputFingerprint: 'current',
        batchResults: [route({
          route_segments: [
            { type: 'tray', tray_id: 'TR-1', start: [0, 0, 10], end: [40, 0, 10], length: 40 },
            { type: 'tray', tray_id: 'TR-1', start: [41, 0, 10], end: [100, 0, 10], length: 59 },
          ],
          total_length: 99,
        })],
      },
    });
    assert.equal(result.status, 'blocked');
    assert.ok(result.blockingIssues.some(issue => issue.code === 'ROUTE-DISCONTINUITY'));
  });

  it('blocks missing raceway references and incompatible cable groups', () => {
    const missing = assurance({
      routeResults: {
        inputFingerprint: 'current',
        batchResults: [route({ route_segments: [{ type: 'tray', tray_id: 'TR-X', start: [0, 0, 10], end: [100, 0, 10], length: 100 }] })],
      },
    });
    const mismatch = assurance({ trays: [{ ...tray, allowed_cable_group: 'HV' }] });
    assert.ok(missing.blockingIssues.some(issue => issue.code === 'ROUTE-RACEWAY-NOT-FOUND'));
    assert.ok(mismatch.blockingIssues.some(issue => issue.code === 'ROUTE-CABLE-GROUP-MISMATCH'));
  });

  it('blocks stale or untraceable route-result fingerprints', () => {
    const stale = assurance({ currentInputFingerprint: 'changed' });
    const missing = assurance({
      routeResults: { batchResults: [route()] },
      currentInputFingerprint: 'current',
    });
    assert.ok(stale.blockingIssues.some(issue => issue.code === 'ROUTE-RESULTS-STALE'));
    assert.ok(missing.blockingIssues.some(issue => issue.code === 'ROUTE-FINGERPRINT-MISSING'));
  });

  it('derives an auditable field-route basis from saved geometry', () => {
    const result = assurance({
      routeResults: {
        inputFingerprint: 'current',
        batchResults: [route({
          route_segments: [{ type: 'field', start: [0, 0, 10], end: [100, 0, 10], length: 100 }],
        })],
      },
    });
    assert.equal(result.status, 'pass');
    assert.equal(result.resultChecks[0].fieldRouteBasis.code, 'direct-field-path');
    assert.match(result.resultChecks[0].fieldRouteBasis.explanation, /field review/i);
  });

  it('blocks exceeded or incomplete tray capacity evidence', () => {
    const exceededCable = { ...cable, cable_area: 15 };
    const exceeded = assurance({ cables: [exceededCable] });
    const incompleteCable = { ...cable };
    delete incompleteCable.cable_area;
    const incomplete = assurance({ cables: [incompleteCable] });
    assert.ok(exceeded.blockingIssues.some(issue => issue.code === 'TRAY-FILL-EXCEEDED'));
    assert.ok(incomplete.blockingIssues.some(issue => issue.code === 'TRAY-FILL-EVIDENCE-INCOMPLETE'));
  });

  it('checks conduit count-based fill for routed conduit segments', () => {
    const conduitCable = { ...cable, cable_area: 0.25 };
    const result = assurance({
      cables: [conduitCable],
      trays: [],
      conduits: [{ conduit_id: 'CND-1', conduit_type: 'EMT', trade_size: '1/2', allowed_cable_group: 'LV' }],
      routeResults: {
        inputFingerprint: 'current',
        batchResults: [route({
          route_segments: [{ type: 'conduit', conduit_id: 'CND-1', start: [0, 0, 10], end: [100, 0, 10], length: 100 }],
        })],
      },
    });
    assert.ok(result.blockingIssues.some(issue => issue.code === 'CONDUIT-FILL-EXCEEDED'));
  });

  it('resolves a parent-only ductbank route from the cable assignment and records a scoped capacity ledger', () => {
    const result = assurance({
      cables: [{ ...cable, conduit_id: 'C-2', cable_area: 0.5 }],
      trays: [],
      ductbanks: [{
        tag: 'DB-1',
        conduits: [
          { conduit_id: 'C-1', type: 'PVC Sch 40', trade_size: '2', allowed_cable_group: 'LV' },
          { conduit_id: 'C-2', type: 'PVC Sch 40', trade_size: '2', allowed_cable_group: 'LV' },
        ],
      }],
      routeResults: {
        inputFingerprint: 'current',
        batchResults: [route({
          route_segments: [{ type: 'ductbank', ductbankTag: 'DB-1', tray_id: 'DB-1', start: [0, 0, 10], end: [100, 0, 10], length: 100 }],
        })],
      },
    });
    assert.equal(result.status, 'pass');
    assert.equal(result.resultChecks[0].conduitAssignments[0].identity, 'DB-1:C-2');
    assert.equal(result.resultChecks[0].conduitAssignments[0].source, 'cable-explicit');
    assert.equal(result.capacityChecks[0].racewayId, 'DB-1:C-2');
    assert.equal(result.capacityChecks[0].result.fillPercent.toFixed(3), '15.193');
    assert.equal(result.summary.internalConduitAssignments, 1);
    assert.equal(result.summary.unresolvedConduitAssignments, 0);
  });

  it('changes the route signature when a parent-only route changes internal-conduit assignment', () => {
    const routeResults = {
      inputFingerprint: 'current',
      batchResults: [route({
        route_segments: [{ type: 'ductbank', ductbankTag: 'DB-1', tray_id: 'DB-1', start: [0, 0, 10], end: [100, 0, 10], length: 100 }],
      })],
    };
    const ductbanks = [{ tag: 'DB-1', conduits: [
      { conduit_id: 'C-1', type: 'PVC Sch 40', trade_size: '2' },
      { conduit_id: 'C-2', type: 'PVC Sch 40', trade_size: '2' },
    ] }];
    const first = assurance({ routeResults, trays: [], ductbanks, cables: [{ ...cable, conduit_id: 'C-1', cable_area: 0.5 }] });
    const second = assurance({ routeResults, trays: [], ductbanks, cables: [{ ...cable, conduit_id: 'C-2', cable_area: 0.5 }] });
    assert.notEqual(first.resultChecks[0].signature, second.resultChecks[0].signature);
  });

  it('blocks a parent-only ductbank route when multiple internal conduits are unassigned', () => {
    const result = assurance({
      cables: [{ ...cable, cable_area: 0.5 }],
      trays: [],
      ductbanks: [{
        tag: 'DB-1',
        conduits: [
          { conduit_id: 'C-1', type: 'PVC Sch 40', trade_size: '2' },
          { conduit_id: 'C-2', type: 'PVC Sch 40', trade_size: '2' },
        ],
      }],
      routeResults: {
        inputFingerprint: 'current',
        batchResults: [route({
          route_segments: [{ type: 'ductbank', ductbankTag: 'DB-1', tray_id: 'DB-1', start: [0, 0, 10], end: [100, 0, 10], length: 100 }],
        })],
      },
    });
    assert.equal(result.status, 'blocked');
    assert.ok(result.blockingIssues.some(issue => issue.code === 'DUCTBANK-CONDUIT-ASSIGNMENT-MISSING'));
    assert.equal(result.summary.unresolvedConduitAssignments, 1);
    assert.equal(result.capacityChecks.length, 0);
  });
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PROTECTIVE_DEVICE_TYPES,
  evaluateDamageLimitConstraint,
  evaluateEquipmentConstraints,
  evaluateRideThroughConstraint,
  isProtectiveDeviceType,
  resolveEquipmentProtectiveEntry
} from '../../analysis/tcc/equipmentConstraintModel.mjs';
import {
  addDirectedConnection,
  createDirectedConnectionMap
} from '../../analysis/tccContext.mjs';

const flatCurve = time => [
  { current: 100, time },
  { current: 1000, time }
];

const protectiveEntry = (uid, type, minTime, maxTime = minTime, componentId = '') => ({
  selection: {
    uid,
    kind: componentId ? 'component' : 'library',
    componentId,
    baseDevice: { type }
  },
  scaled: {
    curve: flatCurve(minTime),
    minCurve: flatCurve(minTime),
    maxCurve: flatCurve(maxTime)
  }
});

const buildAssociationContext = (componentIds, edges, assignments) => {
  const componentFlowMap = createDirectedConnectionMap(componentIds);
  edges.forEach(([from, to]) => addDirectedConnection(componentFlowMap, from, to));
  return {
    componentFlowMap,
    componentDeviceUidMap: new Map(assignments)
  };
};

console.log('TCC equipment constraint model');

assert.ok(Object.isFrozen(PROTECTIVE_DEVICE_TYPES));
assert.equal(isProtectiveDeviceType('Relay 87'), true);
assert.equal(isProtectiveDeviceType('load'), false);

{
  const slower = protectiveEntry('slow', 'breaker', 0.5);
  const result = evaluateRideThroughConstraint({
    kind: 'motorStart',
    lockedRotor: 500,
    startTime: 0.3
  }, slower);
  assert.ok(result);
  assert.equal(result.kind, 'rideThrough');
  assert.equal(result.status, 'ok');
  assert.equal(result.entry, slower);
  assert.equal(result.current, 500);
  assert.ok(Math.abs(result.margin - 0.2) < 1e-12);
  console.log('  ✓ evaluates ride-through against one protective minimum curve');
}

{
  const slower = protectiveEntry('slow', 'breaker', 0.5, 0.5);
  const result = evaluateDamageLimitConstraint({
    kind: 'cable',
    curve: [
      { current: 100, time: 1 },
      { current: 1000, time: 0.1 }
    ]
  }, slower);
  assert.ok(result);
  assert.equal(result.kind, 'damageLimit');
  assert.equal(result.status, 'warning');
  assert.equal(result.entry, slower);
  assert.deepEqual(result.point, { current: 1000, time: 0.1 });
  assert.ok(Math.abs(result.margin - -0.4) < 1e-12);
  console.log('  ✓ preserves the limiting damage point for one protective maximum curve');
}

{
  const associated = protectiveEntry('component:CB-MOTOR', 'breaker', 0.5, 0.5, 'CB-MOTOR');
  const unrelatedLibraryFast = protectiveEntry('library-fast', 'fuse', 0.05);
  const unrelatedComponentFast = protectiveEntry('component:CB-OTHER', 'relay', 0.05, 0.05, 'CB-OTHER');
  const context = buildAssociationContext(
    ['CB-MOTOR', 'MOTOR-1', 'CB-OTHER', 'LOAD-OTHER'],
    [['CB-MOTOR', 'MOTOR-1'], ['CB-OTHER', 'LOAD-OTHER']],
    [['CB-MOTOR', 'component:CB-MOTOR'], ['CB-OTHER', 'component:CB-OTHER']]
  );
  const results = evaluateEquipmentConstraints(
    [associated, unrelatedLibraryFast, unrelatedComponentFast],
    [{ kind: 'motorStart', sourceId: 'MOTOR-1', lockedRotor: 500, startTime: 0.3 }],
    context
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'ok');
  assert.equal(results[0].entry, associated);
  assert.ok(Math.abs(results[0].margin - 0.2) < 1e-12);
  console.log('  ✓ excludes unrelated component curves and unassigned library curves from ride-through checks');
}

{
  const context = buildAssociationContext(['MOTOR-1'], [], []);
  const [result] = evaluateEquipmentConstraints(
    [],
    [{ kind: 'motorStart', sourceId: 'MOTOR-1', lockedRotor: 500, startTime: 0.3 }],
    context
  );
  assert.equal(result.status, 'review');
  assert.equal(result.screeningStatus, 'unknown');
  assert.equal(result.associationReason, 'no_nearest_upstream_device');
  assert.equal(result.entry, null);
  console.log('  ✓ returns an explicit unknown review when no upstream association exists');
}

{
  const libraryOnly = protectiveEntry('component:CB-1', 'breaker', 0.05);
  const context = buildAssociationContext(
    ['CB-1', 'MOTOR-1'],
    [['CB-1', 'MOTOR-1']],
    [['CB-1', 'component:CB-1']]
  );
  const [result] = evaluateEquipmentConstraints(
    [libraryOnly],
    [{ kind: 'motorStart', sourceId: 'MOTOR-1', lockedRotor: 500, startTime: 0.3 }],
    context
  );
  assert.equal(result.status, 'review');
  assert.equal(result.screeningStatus, 'unknown');
  assert.equal(result.associationReason, 'associated_device_not_plotted');
  console.log('  ✓ never substitutes a library-only curve for the associated one-line device');
}

{
  const breakerA = protectiveEntry('component:CB-A', 'breaker', 0.4, 0.4, 'CB-A');
  const breakerB = protectiveEntry('component:CB-B', 'breaker', 0.6, 0.6, 'CB-B');
  const context = buildAssociationContext(
    ['CB-A', 'CB-B', 'MOTOR-1'],
    [['CB-A', 'MOTOR-1'], ['CB-B', 'MOTOR-1']],
    [['CB-A', 'component:CB-A'], ['CB-B', 'component:CB-B']]
  );
  const association = resolveEquipmentProtectiveEntry(
    { kind: 'motorStart', sourceId: 'MOTOR-1' },
    [breakerA, breakerB],
    context
  );
  assert.equal(association.entry, null);
  assert.equal(association.reason, 'ambiguous_nearest_upstream_devices');
  const [result] = evaluateEquipmentConstraints(
    [breakerA, breakerB],
    [{ kind: 'motorStart', sourceId: 'MOTOR-1', lockedRotor: 500, startTime: 0.3 }],
    context
  );
  assert.equal(result.status, 'review');
  assert.equal(result.screeningStatus, 'unknown');
  console.log('  ✓ withholds a pass result for branched nearest-upstream ambiguity');
}

{
  const associated = protectiveEntry('component:CB-CABLE', 'breaker', 0.5, 0.5, 'CB-CABLE');
  associated.scaled.maxCurve = [
    { current: 100, time: 0.2 },
    { current: 1000, time: 0.8 }
  ];
  const unrelatedFast = protectiveEntry('component:CB-OTHER', 'fuse', 0.05, 0.05, 'CB-OTHER');
  const context = buildAssociationContext(
    ['CB-CABLE', 'LOAD-1', 'CB-OTHER'],
    [['CB-CABLE', 'LOAD-1']],
    [['CB-CABLE', 'component:CB-CABLE'], ['CB-OTHER', 'component:CB-OTHER']]
  );
  const [result] = evaluateEquipmentConstraints(
    [associated, unrelatedFast],
    [{
      kind: 'cable',
      sourceId: 'CB-CABLE',
      targetId: 'LOAD-1',
      curve: [
        { current: 100, time: 0.5 },
        { current: 1000, time: 0.6 }
      ]
    }],
    context
  );
  assert.equal(result.entry, associated);
  assert.equal(result.status, 'warning');
  assert.deepEqual(result.point, { current: 1000, time: 0.6 });
  assert.ok(Math.abs(result.margin - -0.2) < 1e-12);
  console.log('  ✓ uses the cable downstream target and the same associated device at every damage point');
}

{
  const breaker = protectiveEntry('component:CB-1', 'breaker', 0.5, 0.5, 'CB-1');
  const context = buildAssociationContext(
    ['CB-1', 'TX-1'],
    [['CB-1', 'TX-1']],
    [['CB-1', 'component:CB-1']]
  );
  const results = evaluateEquipmentConstraints([breaker], [
    { kind: 'annotation', sourceId: 'TX-1', current: 500, duration: 0.1 },
    { kind: 'transformerDamage', sourceId: 'TX-1', curve: [{ current: 500, time: 1 }] }
  ], context);
  assert.equal(results.length, 1);
  assert.equal(results[0].entry, breaker);
  assert.deepEqual(evaluateEquipmentConstraints([], []), []);
  assert.equal(evaluateRideThroughConstraint({ kind: 'inrush' }, breaker), null);
  assert.equal(evaluateDamageLimitConstraint({ kind: 'cable', curve: [] }, breaker), null);
  console.log('  ✓ filters non-equipment overlays and incomplete direct constraint inputs');
}

{
  const source = await readFile(new URL('../../analysis/tcc/equipmentConstraintModel.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:document|window|HTMLElement|HTMLCanvasElement|d3)\b/);
  console.log('  ✓ remains independent of browser and chart APIs');
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDesignSynthesisLoadDispositions } from '../analysis/designSynthesisLoadDisposition.mjs';

test('accounts for every original row and preserves source values without mutation', () => {
  const input = { equipment: [{ id: 'M1', tag: 'P-1', kw: 10 }, null, { id: 'M3', tag: 'P-3', kw: 20 }] };
  const before = structuredClone(input);
  const result = buildDesignSynthesisLoadDispositions(input, { acceptedIds: ['M1'] });
  assert.deepEqual(input, before);
  assert.equal(result.loadDispositions.length, 3);
  assert.equal(result.loadDispositions[0].status, 'accepted');
  assert.equal(result.loadDispositions[1].status, 'rejected');
  assert.equal(result.loadDispositions[1].inputIndex, 1);
  assert.equal(result.loadDispositions[1].id, null);
  assert.deepEqual(result.loadDispositions[2].original, input.equipment[2]);
});

test('separates global blockers and defers otherwise valid rows', () => {
  const input = { equipment: [{ id: 'M1', tag: 'P-1', kw: 10 }, { id: 'M2', tag: 'P-2', kw: 20 }] };
  const result = buildDesignSynthesisLoadDispositions(input, {
    issues: [{ code: 'SOURCE_CAPACITY_EXCEEDED', path: 'supply.capacityKva', severity: 'blocking', message: 'Too much load.' }],
  });
  assert.equal(result.globalBlockingIssues.length, 1);
  assert.deepEqual(result.loadDispositions.map(row => row.status), ['deferred', 'deferred']);
});

test('global blockers prevent acceptance even when generated ids are supplied', () => {
  const result = buildDesignSynthesisLoadDispositions({ equipment: [{ id: 'M1', kw: 10 }] }, {
    acceptedIds: ['M1'],
    issues: [{ code: 'SOURCE_CAPACITY_EXCEEDED', path: 'supply.capacityKva', severity: 'blocking' }],
  });
  assert.equal(result.loadDispositions[0].status, 'deferred');
});

test('attaches indexed and identity issue paths to the affected row', () => {
  const input = { equipment: [{ id: 'M1', tag: 'P-1' }, { id: 'M2', tag: 'P-2' }] };
  const result = buildDesignSynthesisLoadDispositions(input, {
    issues: [
      { code: 'INVALID_LOAD_KW', path: 'equipment[0].kw', severity: 'blocking' },
      { code: 'DUPLICATE_LOAD_ID', path: 'equipment.M2', severity: 'blocking' },
    ],
  });
  assert.equal(result.loadDispositions[0].status, 'rejected');
  assert.equal(result.loadDispositions[1].status, 'rejected');
  assert.equal(result.loadDispositions[0].issues[0].path, 'equipment[0].kw');
  assert.equal(result.loadDispositions[1].issues[0].path, 'equipment.M2');
  assert.equal(result.globalBlockingIssues.length, 0);
});

test('routes downstream load and cable issue identities to the source row', () => {
  const input = { equipment: [{ id: 'M1', tag: 'P-1' }] };
  const result = buildDesignSynthesisLoadDispositions(input, {
    issues: [
      { code: 'CABLE_AMPACITY_NOT_SATISFIED', path: 'load.M1', severity: 'blocking' },
      { code: 'ROUTE_THERMAL_BLOCKED', cable: 'C-M1', severity: 'blocking' },
    ],
  });
  assert.equal(result.loadDispositions[0].status, 'rejected');
  assert.equal(result.loadDispositions[0].issues.length, 2);
  assert.equal(result.loadDispositions[0].issues[1].cable, 'C-M1');
  assert.equal(result.globalBlockingIssues.length, 0);
});

test('attributes plural loads paths from motor-starting studies to the correct input row', () => {
  const result = buildDesignSynthesisLoadDispositions({ equipment: [{ id: 'M1' }, { id: 'M2' }] }, {
    acceptedIds: ['M1', 'M2'],
    issues: [{ code: 'MOTOR_START_NONCONVERGENCE', path: 'loads.M2.motor', severity: 'blocking' }],
  });
  assert.deepEqual(result.loadDispositions.map(row => row.status), ['accepted', 'rejected']);
  assert.equal(result.loadDispositions[1].issues[0].code, 'MOTOR_START_NONCONVERGENCE');
  assert.equal(result.globalBlockingIssues.length, 0);
});

test('normalizes numeric identities when routing global issue paths', () => {
  const result = buildDesignSynthesisLoadDispositions({ equipment: [{ id: 0, kw: 10 }] }, {
    issues: [{ code: 'INVALID_LOAD_KW', path: 'equipment.0.kw', severity: 'blocking' }],
  });
  assert.equal(result.globalBlockingIssues.length, 0);
  assert.equal(result.loadDispositions[0].status, 'rejected');
});

test('does not invent an identity for missing ids', () => {
  const result = buildDesignSynthesisLoadDispositions({ equipment: [{ tag: 'NO-ID', kw: 10 }] }, {
    issues: [{ code: 'GLOBAL', path: 'equipment.undefined', severity: 'blocking' }],
  });
  assert.equal(result.globalBlockingIssues.length, 1);
  assert.equal(result.loadDispositions[0].status, 'deferred');
});

test('accepted status requires an explicit generated-row identity', () => {
  const input = { equipment: [{ id: 'M1' }, { id: 'M1' }, { tag: 'NO-ID' }] };
  const result = buildDesignSynthesisLoadDispositions(input, { acceptedIds: ['M1'], acceptedIndices: [1] });
  assert.deepEqual(result.loadDispositions.map(row => row.status), ['deferred', 'accepted', 'deferred']);
  assert.deepEqual(result.loadDispositions.map(row => row.inputIndex), [0, 1, 2]);
});

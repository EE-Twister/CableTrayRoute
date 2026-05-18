const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

import assert from 'assert';
import { runReliability } from '../analysis/reliability.js';

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

describe('runReliability - component filtering', () => {
  it('excludes annotation components from componentStats', () => {
    const components = [
      { id: 'ann-1', type: 'annotation', mtbf: 1000, mttr: 10 }
    ];
    const result = runReliability(components);
    assert.ok(!('ann-1' in result.componentStats));
  });

  it('excludes dimension components from componentStats', () => {
    const components = [
      { id: 'dim-1', type: 'dimension', mtbf: 1000, mttr: 10 }
    ];
    const result = runReliability(components);
    assert.ok(!('dim-1' in result.componentStats));
  });

  it('includes cable-type connectors in componentStats', () => {
    const connectorTypes = ['cable', 'link', 'feeder', 'conductor', 'tap', 'splice'];
    for (const type of connectorTypes) {
      const components = [{ id: `conn-${type}`, type, mtbf: 1000, mttr: 10 }];
      const result = runReliability(components);
      assert.ok((`conn-${type}` in result.componentStats),
        `Expected ${type} to be included in componentStats`);
    }
  });

  it('includes connector types with mixed casing', () => {
    const components = [
      { id: 'cable-upper', type: 'CABLE', mtbf: 1000, mttr: 10 },
      { id: 'feeder-mixed', type: 'PowerFeeder', mtbf: 1000, mttr: 10 }
    ];
    const result = runReliability(components);
    assert.ok('cable-upper' in result.componentStats);
    assert.ok('feeder-mixed' in result.componentStats);
  });

  it('includes bus and breaker components in componentStats', () => {
    const components = [
      { id: 'bus-1', type: 'bus', mtbf: 8760, mttr: 4 },
      { id: 'brk-1', type: 'breaker', mtbf: 4380, mttr: 8 }
    ];
    const result = runReliability(components);
    assert.ok('bus-1' in result.componentStats);
    assert.ok('brk-1' in result.componentStats);
  });
});

describe('runReliability - availability calculation', () => {
  it('computes availability as mtbf / (mtbf + mttr)', () => {
    const components = [
      { id: 'comp-1', type: 'bus', mtbf: 8760, mttr: 4 }
    ];
    const result = runReliability(components);
    const expected = 8760 / (8760 + 4);
    assert.ok(Math.abs(result.componentStats['comp-1'].availability - expected) < 1e-10);
  });

  it('computes expected downtime as (8760 / mtbf) * mttr hours per year', () => {
    const components = [
      { id: 'comp-2', type: 'bus', mtbf: 8760, mttr: 8 }
    ];
    const result = runReliability(components);
    const expectedDowntime = (8760 / 8760) * 8; // = 8 hours/year
    assert.ok(Math.abs(result.componentStats['comp-2'].downtime - expectedDowntime) < 1e-10);
  });

  it('excludes components with mtbf = 0', () => {
    const components = [
      { id: 'zero-mtbf', type: 'bus', mtbf: 0, mttr: 4 }
    ];
    const result = runReliability(components);
    assert.ok(!('zero-mtbf' in result.componentStats));
  });

  it('excludes components with negative mtbf', () => {
    const components = [
      { id: 'neg-mtbf', type: 'bus', mtbf: -100, mttr: 4 }
    ];
    const result = runReliability(components);
    assert.ok(!('neg-mtbf' in result.componentStats));
  });

  it('excludes components with missing mtbf', () => {
    const components = [
      { id: 'no-mtbf', type: 'bus', mttr: 4 }
    ];
    const result = runReliability(components);
    assert.ok(!('no-mtbf' in result.componentStats));
  });

  it('includes components with mttr = 0 (instantly repairable)', () => {
    const components = [
      { id: 'instant-repair', type: 'bus', mtbf: 8760, mttr: 0 }
    ];
    const result = runReliability(components);
    assert.ok('instant-repair' in result.componentStats);
    assert.strictEqual(result.componentStats['instant-repair'].availability, 1);
    assert.strictEqual(result.componentStats['instant-repair'].downtime, 0);
  });
});

describe('runReliability - expectedOutage', () => {
  it('sums downtime across all eligible components', () => {
    const components = [
      { id: 'comp-a', type: 'bus', mtbf: 8760, mttr: 4 },
      { id: 'comp-b', type: 'breaker', mtbf: 4380, mttr: 8 }
    ];
    const result = runReliability(components);
    const expectedA = (8760 / 8760) * 4; // 4 hr/year
    const expectedB = (8760 / 4380) * 8; // 16 hr/year
    assert.ok(Math.abs(result.expectedOutage - (expectedA + expectedB)) < 1e-9);
  });

  it('returns 0 expectedOutage when no eligible components have mtbf/mttr', () => {
    const components = [
      { id: 'ann', type: 'annotation', mtbf: 1000, mttr: 1 }
    ];
    const result = runReliability(components);
    assert.strictEqual(result.expectedOutage, 0);
  });

  it('returns 0 expectedOutage for empty component list', () => {
    const result = runReliability([]);
    assert.strictEqual(result.expectedOutage, 0);
  });
});

describe('runReliability - result structure', () => {
  it('detects n1Failures for radial topologies while keeping n2Failures empty', () => {
    const components = [
      { id: 'source', type: 'bus', mtbf: 1000, mttr: 10, connections: [{ target: 'breaker' }] },
      { id: 'breaker', type: 'breaker', mtbf: 1000, mttr: 10, connections: [{ target: 'source' }, { target: 'load' }] },
      { id: 'load', type: 'bus', mtbf: 1000, mttr: 10, connections: [{ target: 'breaker' }] }
    ];
    const result = runReliability(components);
    assert.deepStrictEqual(result.n1Failures, ['breaker']);
    assert.deepStrictEqual(result.n2Failures, []);
  });

  it('returns n1FailureDetails for detected failures', () => {
    const result = runReliability([
      { id: 'source', type: 'bus', mtbf: 1000, mttr: 10, connections: [{ target: 'breaker' }] },
      { id: 'breaker', type: 'breaker', mtbf: 1000, mttr: 10, connections: [{ target: 'source' }, { target: 'load' }] },
      { id: 'load', type: 'bus', mtbf: 1000, mttr: 10, connections: [{ target: 'breaker' }] }
    ]);
    assert.deepStrictEqual(result.n1FailureDetails, { breaker: { isolatedLoads: ['load'] } });
  });

  it('systemAvailability drops below 1 when N-1 analysis detects failures', () => {
    const result = runReliability([
      { id: 'source', type: 'bus', mtbf: 1000, mttr: 10, connections: [{ target: 'breaker' }] },
      { id: 'breaker', type: 'breaker', mtbf: 1000, mttr: 10, connections: [{ target: 'source' }, { target: 'load' }] },
      { id: 'load', type: 'bus', mtbf: 1000, mttr: 10, connections: [{ target: 'breaker' }] }
    ]);
    assert.ok(result.systemAvailability < 1);
  });

  it('returns all expected keys in result', () => {
    const result = runReliability([]);
    const expectedKeys = ['systemAvailability', 'expectedOutage', 'componentStats',
      'n1Failures', 'n2Failures', 'n1Impacts', 'n2Impacts', 'n1FailureDetails'];
    for (const key of expectedKeys) {
      assert.ok(key in result, `Missing key: ${key}`);
    }
  });
});

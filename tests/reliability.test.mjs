/**
 * Tests for analysis/reliability.js
 */
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

// ---------------------------------------------------------------------------
describe('runReliability — empty input', () => {
  it('returns systemAvailability 1 for empty component list', () => {
    const result = runReliability([]);
    assert.strictEqual(result.systemAvailability, 1);
  });

  it('returns expectedOutage 0 for empty input', () => {
    const result = runReliability([]);
    assert.strictEqual(result.expectedOutage, 0);
  });

  it('returns all required fields', () => {
    const result = runReliability([]);
    assert.ok('systemAvailability' in result);
    assert.ok('expectedOutage' in result);
    assert.ok('componentStats' in result);
    assert.ok('n1Failures' in result);
    assert.ok('n2Failures' in result);
    assert.ok('n1Impacts' in result);
    assert.ok('n2Impacts' in result);
  });
});

// ---------------------------------------------------------------------------
describe('runReliability — visual components excluded', () => {
  it('filters out dimension and annotation types', () => {
    const comps = [
      { id: 'd1', type: 'dimension', mtbf: 8760, mttr: 4 },
      { id: 'a1', type: 'annotation', mtbf: 8760, mttr: 4 },
    ];
    const result = runReliability(comps);
    assert.strictEqual(Object.keys(result.componentStats).length, 0);
  });
});

// ---------------------------------------------------------------------------
describe('runReliability — connector components excluded', () => {
  const connTypes = ['cable', 'feeder', 'link', 'conductor', 'tap', 'splice'];
  connTypes.forEach(type => {
    it(`excludes type "${type}"`, () => {
      const comps = [{ id: 'c1', type, mtbf: 8760, mttr: 4 }];
      const result = runReliability(comps);
      assert.strictEqual(Object.keys(result.componentStats).length, 0);
    });
  });
});

// ---------------------------------------------------------------------------
describe('runReliability — component with MTBF/MTTR', () => {
  const comps = [
    { id: 'B1', type: 'breaker', mtbf: 8760, mttr: 4 },
  ];

  it('computes availability = MTBF / (MTBF + MTTR)', () => {
    const result = runReliability(comps);
    const expected = 8760 / (8760 + 4);
    assert.ok(Math.abs(result.componentStats.B1.availability - expected) < 1e-9);
  });

  it('computes downtime = (8760/MTBF) * MTTR', () => {
    const result = runReliability(comps);
    const expected = (8760 / 8760) * 4;  // = 4 hr/yr
    assert.ok(Math.abs(result.componentStats.B1.downtime - expected) < 1e-9);
  });

  it('total expected outage matches single component', () => {
    const result = runReliability(comps);
    assert.ok(Math.abs(result.expectedOutage - result.componentStats.B1.downtime) < 1e-9);
  });
});

// ---------------------------------------------------------------------------
describe('runReliability — components without MTBF skip gracefully', () => {
  it('component with no MTBF/MTTR is excluded from stats', () => {
    const comps = [
      { id: 'T1', type: 'transformer' },  // no mtbf/mttr
      { id: 'B1', type: 'breaker', mtbf: 8760, mttr: 4 },
    ];
    const result = runReliability(comps);
    assert.ok(!('T1' in result.componentStats));
    assert.ok('B1' in result.componentStats);
  });
});

// ---------------------------------------------------------------------------
describe('runReliability — multiple components', () => {
  const comps = [
    { id: 'B1', type: 'breaker', mtbf: 8760, mttr: 4 },
    { id: 'B2', type: 'breaker', mtbf: 4380, mttr: 8 },
  ];

  it('returns stats for all eligible components', () => {
    const result = runReliability(comps);
    assert.ok('B1' in result.componentStats);
    assert.ok('B2' in result.componentStats);
  });

  it('expectedOutage is sum of individual downtimes', () => {
    const result = runReliability(comps);
    const sumDowntime = Object.values(result.componentStats).reduce((s, c) => s + c.downtime, 0);
    assert.ok(Math.abs(result.expectedOutage - sumDowntime) < 1e-9);
  });
});

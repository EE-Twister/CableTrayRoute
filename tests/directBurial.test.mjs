/**
 * Tests for analysis/directBurial.mjs — parallel direct-buried circuit sizing.
 */
import assert from 'assert';
import {
  normalizeDirectBurialInputs,
  rowAmpacity,
  runDirectBurial,
  CONDUCTOR_SIZES,
} from '../analysis/directBurial.mjs';
import { calcAmpacity } from '../analysis/iec60287.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}
function it(name, fn) {
  fn();
  console.log('  ✓', name);
}

describe('normalizeDirectBurialInputs', () => {
  it('defaults to 102 A at 24 in cover', () => {
    const n = normalizeDirectBurialInputs({});
    assert.strictEqual(n.requiredCurrentA, 102);
    assert.strictEqual(Math.round(n.cover.coverMm / 25.4), 24);
  });
  it('rejects a non-positive current', () => {
    assert.throws(() => normalizeDirectBurialInputs({ requiredCurrentA: 0 }), /Required current/);
  });
  it('rejects an unknown arrangement', () => {
    assert.throws(() => normalizeDirectBurialInputs({ cable: { arrangement: 'ring' } }), /arrangement/);
  });
  it('requires at least one size', () => {
    assert.throws(() => normalizeDirectBurialInputs({ sizes: ['nope'] }), /size/i);
  });
});

describe('rowAmpacity', () => {
  const inputs = normalizeDirectBurialInputs({});
  const size = CONDUCTOR_SIZES.find(s => s.label === '2 AWG');
  const build = {
    base: {
      sizeMm2: size.sizeMm2, material: 'Cu', insulation: 'XLPE', insulThickMm: 1.4, outerSheathMm: 1.5,
      nCores: 1, installMethod: 'direct-burial', soilResistivity: 1, ambientTempC: 20, frequencyHz: 60, interpolateResistance: true,
    },
    odMm: 10,
  };

  it('a single circuit is never rated above an isolated cable', () => {
    const isolated = calcAmpacity({ ...build.base, burialDepthMm: inputs.cover.coverMm + 5 }).I_base;
    assert.ok(rowAmpacity(build, inputs, 1, 200).ampacityA <= isolated + 0.1);
  });
  it('ampacity falls as circuits are added', () => {
    const a = [1, 2, 4, 8].map(n => rowAmpacity(build, inputs, n, 200).ampacityA);
    for (let i = 1; i < a.length; i += 1) assert.ok(a[i] < a[i - 1]);
  });
  it('wider spacing raises ampacity', () => {
    const tight = rowAmpacity(build, inputs, 5, 0).ampacityA;
    const wide = rowAmpacity(build, inputs, 5, 600).ampacityA;
    assert.ok(wide > tight);
  });
  it('lower soil resistivity raises ampacity', () => {
    const backfill = normalizeDirectBurialInputs({ soil: { resistivityKmW: 0.7 } });
    const inBackfill = { ...build, base: { ...build.base, soilResistivity: 0.7 } };
    assert.ok(rowAmpacity(inBackfill, backfill, 4, 200).ampacityA > rowAmpacity(build, inputs, 4, 200).ampacityA);
  });
});

describe('runDirectBurial', () => {
  it('bigger conductors and wider spacing never reduce the circuit count', () => {
    const { rows } = runDirectBurial({ maxCircuits: 12 });
    const get = (size, mm) => rows.find(r => r.size === size && r.clearanceMm === mm).maxCircuits;
    assert.ok(get('1/0 AWG', 200) >= get('4 AWG', 200));
    assert.ok(get('4 AWG', 450) >= get('4 AWG', 100));
  });
  it('every reported max circuit count actually meets the target', () => {
    const { rows, targetAmpacityA } = runDirectBurial({ maxCircuits: 10 });
    for (const r of rows.filter(x => x.maxCircuits > 0)) {
      assert.ok(r.ampacityByCircuits[r.maxCircuits - 1] >= targetAmpacityA);
    }
  });
  it('recommends the cheapest feasible option for the requested circuit count', () => {
    const result = runDirectBurial({ requiredCircuits: 6 });
    assert.ok(result.best);
    const feasible = result.rows.filter(r => r.feasible);
    assert.ok(feasible.every(r => r.cost.totalCostPerFt >= result.best.cost.totalCostPerFt));
    assert.ok(result.best.maxCircuits >= 6);
  });
  it('reports no recommendation when the requirement cannot be met', () => {
    const result = runDirectBurial({ requiredCurrentA: 5000, sizes: ['6 AWG'], requiredCircuits: 3 });
    assert.strictEqual(result.best, null);
    assert.ok(result.notes[0].includes('No size'));
  });
  it('a continuous-load multiplier tightens the result', () => {
    const base = runDirectBurial({ sizes: ['2 AWG'], spacingsMm: [200], maxCircuits: 20 }).rows[0].maxCircuits;
    const cont = runDirectBurial({ sizes: ['2 AWG'], spacingsMm: [200], maxCircuits: 20, continuousFactor: 1.25 }).rows[0].maxCircuits;
    assert.ok(cont <= base);
  });
});

console.log('directBurial tests passed');

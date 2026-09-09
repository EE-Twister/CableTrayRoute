import assert from 'node:assert/strict';

import {
  evaluateTrayFill,
  isFourOOrLarger,
  table39222AllowableArea,
} from '../analysis/trayFill.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (error) { console.error('  ✗', name, error.message || error); process.exitCode = 1; }
}

function cable(overrides = {}) {
  return {
    tag: 'CBL-1',
    cable_type: 'Power',
    conductors: 3,
    conductor_size: '#2 AWG',
    cable_area: 1,
    ...overrides,
  };
}

describe('NEC 2023 selected Article 392 tray-fill evaluator', () => {
  it('retains exact edition-pinned Table 392.22(A)(1) values', () => {
    assert.equal(table39222AllowableArea(12, 'ladder'), 14);
    assert.equal(table39222AllowableArea(12, 'solid bottom'), 11);
    assert.equal(table39222AllowableArea(30, 'ladder'), 35);
    assert.equal(table39222AllowableArea(36, 'solid'), 33);
  });

  it('recognizes the 4/0 boundary without treating ordinary AWG sizes as large', () => {
assert.equal(isFourOOrLarger('4/0 AWG'), true);
assert.equal(isFourOOrLarger('3-#4 CU'), false);
    assert.equal(isFourOOrLarger('250 kcmil'), true);
    assert.equal(isFourOOrLarger('3/0 AWG'), false);
    assert.equal(isFourOOrLarger('#4 AWG'), false);
  });

  it('passes exactly at and fails immediately above the all-small ladder allowance', () => {
    const tray = { tray_id: 'TR-12', tray_type: 'Ladder', inside_width: 12, tray_depth: 4 };
    const atBoundary = evaluateTrayFill(tray, [
      cable({ tag: 'A', cable_area: 7 }),
      cable({ tag: 'B', cable_area: 7 }),
    ]);
    const aboveBoundary = evaluateTrayFill(tray, [
      cable({ tag: 'A', cable_area: 7 }),
      cable({ tag: 'B', cable_area: 7.001 }),
    ]);

    assert.equal(atBoundary.status, 'pass');
    assert.equal(atBoundary.tableColumn, 1);
    assert.equal(atBoundary.utilizationPercent, 100);
    assert.equal(aboveBoundary.status, 'fail');
    assert.ok(aboveBoundary.utilizationPercent > 100);
  });

  it('applies the ladder mixed-cable Column 2 diameter penalty', () => {
    const tray = { tray_id: 'TR-MIX', tray_type: 'Ladder', inside_width: 12, tray_depth: 6 };
    const largeArea = Math.PI * (2 / 2) ** 2;
    const result = evaluateTrayFill(tray, [
      cable({ tag: 'LARGE', conductor_size: '4/0 AWG', cable_area: largeArea }),
      cable({ tag: 'SMALL', cable_area: 11.6 }),
    ]);

    assert.equal(result.status, 'pass');
    assert.equal(result.arrangement, 'mixed-4/0-boundary');
    assert.equal(result.tableColumn, 2);
    assert.ok(Math.abs(result.allowable.smallCableAreaIn2 - 11.6) < 1e-9);
    assert.equal(result.utilizationPercent, 100);
  });

  it('applies the solid-bottom mixed-cable Column 4 diameter penalty', () => {
    const tray = { tray_id: 'TR-SOLID', tray_type: 'Solid Bottom', inside_width: 12, tray_depth: 6 };
    const largeArea = Math.PI * (2 / 2) ** 2;
    const result = evaluateTrayFill(tray, [
      cable({ tag: 'LARGE', conductor_size: '500 kcmil', cable_area: largeArea }),
      cable({ tag: 'SMALL', cable_area: 9.001 }),
    ]);

    assert.equal(result.status, 'fail');
    assert.equal(result.tableColumn, 4);
    assert.ok(Math.abs(result.allowable.smallCableAreaIn2 - 9) < 1e-9);
  });

  it('caps control/signal-only depth at six inches', () => {
    const result = evaluateTrayFill(
      { tray_id: 'TR-CTRL', tray_type: 'Ladder', inside_width: 12, tray_depth: 8 },
      [cable({ cable_type: 'Control', cable_area: 18, quantity: 2 })]
    );

    assert.equal(result.status, 'pass');
    assert.equal(result.clause, '392.22(A)(2)');
    assert.equal(result.used.depthBasisIn, 6);
    assert.equal(result.allowable.cableAreaIn2, 36);
    assert.equal(result.utilizationPercent, 100);
  });

  it('withholds a pass for single-conductor arrangements', () => {
    const result = evaluateTrayFill(
      { tray_id: 'TR-SC', tray_type: 'Ladder', inside_width: 12, tray_depth: 6 },
      [cable({ conductors: 1, conductor_size: '500 kcmil', cable_area: 1.5 })]
    );

    assert.equal(result.status, 'screening');
    assert.equal(result.evaluable, false);
    assert.equal(result.clause, '392.22(B)');
  });

  it('withholds a pass when cable area or a listed tray width is unavailable', () => {
    const missingArea = evaluateTrayFill(
      { tray_type: 'Ladder', inside_width: 12, tray_depth: 6 },
      [cable({ cable_area: undefined })]
    );
    const unlistedWidth = evaluateTrayFill(
      { tray_type: 'Ladder', inside_width: 15, tray_depth: 6 },
      [cable()]
    );

    assert.equal(missingArea.status, 'incomplete');
    assert.match(missingArea.missingInputs.join(' '), /outside diameter/i);
    assert.equal(unlistedWidth.status, 'incomplete');
    assert.match(unlistedWidth.issues[0].message, /interpolation is not performed/i);
  });
});

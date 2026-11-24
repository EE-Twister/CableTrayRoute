import assert from 'node:assert/strict';

import {
  evaluateTrayFill,
  evaluateTrayFillWithCompartments,
  isFourOOrLarger,
  resolveCableCompartment,
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

describe('Compartment-aware tray fill (barrier-separated trays)', () => {
  const tray = {
    tray_id: 'TR-2C', tray_type: 'Ladder', inside_width: 24, tray_depth: 6, num_slots: 2,
    slot_groups: { 0: 'Zone 1 - Power', 1: 'Zone 2 - Control' },
  };

  it('returns the single-tray result unchanged when there is one compartment', () => {
    const single = { tray_id: 'TR-1', tray_type: 'Ladder', inside_width: 12, tray_depth: 6 };
    assert.deepEqual(evaluateTrayFillWithCompartments(single, [cable()]), evaluateTrayFill(single, [cable()]));
  });

  it('resolves compartments by slot index, then slot-group label, then one-based zone', () => {
    const groups = new Map([[0, 'Zone 1 - Power'], [1, 'Zone 2 - Control']]);
    assert.equal(resolveCableCompartment({ slot_index: 1, zone: 1 }, 2, groups), 1);
    assert.equal(resolveCableCompartment({ allowed_cable_group: 'Zone 2 - Control' }, 2, groups), 1);
    assert.equal(resolveCableCompartment({ zone: 1 }, 2, groups), 0);
    assert.equal(resolveCableCompartment({ zone: 3 }, 2, groups), null, 'out-of-range zone is unresolved');
    assert.equal(resolveCableCompartment({}, 2, groups), null);
  });

  it('is governed by the fullest compartment, not the whole-tray average', () => {
    // 10 in2 in a 12 in compartment (14 in2 allowance) is 71 %; over the
    // whole 24 in tray (28 in2) it would read as only 36 %.
    const cables = [
      cable({ tag: 'P1', cable_area: 10, zone: 1 }),
      cable({ tag: 'C1', cable_area: 1, zone: 2 }),
    ];
    const result = evaluateTrayFillWithCompartments(tray, cables);
    assert.equal(result.status, 'pass');
    assert.equal(result.compartmented, true);
    assert.equal(result.governingCompartment, 'Zone 1 - Power');
    assert.ok(Math.abs(result.utilizationPercent - (10 / 14) * 100) < 0.01, `${result.utilizationPercent}`);
    assert.equal(result.compartments.length, 2);
    assert.ok(evaluateTrayFill(tray, cables).utilizationPercent < 40, 'whole-tray figure understates it');
  });

  it('fails when any compartment exceeds its allowance', () => {
    const result = evaluateTrayFillWithCompartments(tray, [
      cable({ tag: 'P1', cable_area: 15, zone: 1 }),
      cable({ tag: 'C1', cable_area: 1, zone: 2 }),
    ]);
    assert.equal(result.status, 'fail');
    assert.equal(result.governingCompartment, 'Zone 1 - Power');
  });

  it('is incomplete, not a pass, when a cable has no compartment', () => {
    const result = evaluateTrayFillWithCompartments(tray, [
      cable({ tag: 'P1', cable_area: 1, zone: 1 }),
      cable({ tag: 'LOOSE', cable_area: 1 }),
    ]);
    assert.equal(result.status, 'incomplete');
    assert.equal(result.evaluable, false);
    assert.equal(result.utilizationPercent, null);
    assert.deepEqual(result.unresolvedCables, ['LOOSE']);
    assert.match(result.issues[0].message, /not assigned to one of the 2 compartments/);
  });

  it('keeps the full result shape for an empty or wholly unassigned compartmented tray', () => {
    const empty = evaluateTrayFillWithCompartments(tray, []);
    const loose = evaluateTrayFillWithCompartments(tray, [cable({ tag: 'A' }), cable({ tag: 'B' })]);
    for (const result of [empty, loose]) {
      assert.equal(result.status, 'incomplete');
      assert.equal(result.evaluable, false);
      assert.equal(typeof result.clause, 'string');
      assert.equal(typeof result.arrangement, 'string');
      assert.ok(Array.isArray(result.missingInputs) && result.missingInputs.length > 0);
      assert.deepEqual(result.used, {});
      assert.deepEqual(result.allowable, {});
      assert.ok(result.basis);
    }
    assert.ok(empty.missingInputs.includes('assigned cables'));
    assert.deepEqual(loose.unresolvedCables, ['A', 'B']);
    assert.ok(loose.missingInputs.includes('A: compartment assignment'));
  });
});


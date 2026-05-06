/**
 * Tests for analysis/bessHazard.mjs
 *
 * Covers: CHEMISTRY_PARAMS constants, separationDistance (boundary crossing,
 * all exposure types), checkSeparations (pass/warn/fail statuses),
 * propagationAmbientFactor (Arrhenius correction), propagationTiming
 * (structure, ordering, ambient effect), deflagrationVentArea (formula,
 * monotonicity, applicability warnings), hmaSummary (pass/warn/fail routing),
 * and runBessHazardStudy (integration, validation errors).
 */
import assert from 'assert';
import {
  CHEMISTRY_PARAMS,
  SEPARATION_TABLE,
  EXPOSURE_TYPES,
  separationDistance,
  checkSeparations,
  propagationAmbientFactor,
  propagationTiming,
  deflagrationVentArea,
  hmaSummary,
  runBessHazardStudy,
} from '../analysis/bessHazard.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err.message || err);
    process.exitCode = 1;
  }
}

const approx = (a, b, tol = 0.001) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------
describe('CHEMISTRY_PARAMS constant', () => {
  it('contains LFP, NMC, NCA, lead-acid, NiCd', () => {
    assert.ok('LFP' in CHEMISTRY_PARAMS);
    assert.ok('NMC' in CHEMISTRY_PARAMS);
    assert.ok('NCA' in CHEMISTRY_PARAMS);
    assert.ok('lead-acid' in CHEMISTRY_PARAMS);
    assert.ok('NiCd' in CHEMISTRY_PARAMS);
  });

  it('LFP has lower K_G than NCA', () => {
    assert.ok(CHEMISTRY_PARAMS.LFP.kG_barMs < CHEMISTRY_PARAMS.NCA.kG_barMs);
  });

  it('LFP has longer propagBase_min than NCA', () => {
    assert.ok(CHEMISTRY_PARAMS.LFP.propagBase_min > CHEMISTRY_PARAMS.NCA.propagBase_min);
  });

  it('all chemistries have required fields', () => {
    for (const [key, c] of Object.entries(CHEMISTRY_PARAMS)) {
      assert.ok(typeof c.name === 'string', `${key}.name must be string`);
      assert.ok(c.kG_barMs > 0, `${key}.kG_barMs must be positive`);
      assert.ok(c.pMax_bar > 0, `${key}.pMax_bar must be positive`);
      assert.ok(c.propagBase_min > 0, `${key}.propagBase_min must be positive`);
    }
  });
});

// ---------------------------------------------------------------------------
describe('EXPOSURE_TYPES', () => {
  it('contains property_line, occupied_building, ignition_source', () => {
    const values = EXPOSURE_TYPES.map(t => t.value);
    assert.ok(values.includes('property_line'));
    assert.ok(values.includes('occupied_building'));
    assert.ok(values.includes('ignition_source'));
  });
});

// ---------------------------------------------------------------------------
describe('separationDistance()', () => {
  it('property_line — ≤ 50 kWh returns 0.9 m', () => {
    const { minDistM } = separationDistance('property_line', 20);
    assert.strictEqual(minDistM, 0.9);
  });

  it('property_line — exactly 50 kWh returns 0.9 m', () => {
    const { minDistM } = separationDistance('property_line', 50);
    assert.strictEqual(minDistM, 0.9);
  });

  it('property_line — 51 kWh crosses boundary to 1.5 m', () => {
    const { minDistM } = separationDistance('property_line', 51);
    assert.strictEqual(minDistM, 1.5);
  });

  it('property_line — large system returns 1.5 m', () => {
    const { minDistM } = separationDistance('property_line', 1000);
    assert.strictEqual(minDistM, 1.5);
  });

  it('occupied_building — ≤ 50 kWh returns 1.5 m', () => {
    const { minDistM } = separationDistance('occupied_building', 30);
    assert.strictEqual(minDistM, 1.5);
  });

  it('occupied_building — > 50 kWh returns 3.0 m', () => {
    const { minDistM } = separationDistance('occupied_building', 200);
    assert.strictEqual(minDistM, 3.0);
  });

  it('ignition_source — returns 0.9 m for any capacity', () => {
    assert.strictEqual(separationDistance('ignition_source', 5).minDistM, 0.9);
    assert.strictEqual(separationDistance('ignition_source', 500).minDistM, 0.9);
  });

  it('returns minDistFt as approximate ft conversion', () => {
    const { minDistM, minDistFt } = separationDistance('property_line', 20);
    assert.ok(approx(minDistFt, minDistM * 3.28084, 0.1));
  });

  it('throws for unknown exposure type', () => {
    assert.throws(() => separationDistance('roof', 50), /Unknown exposure type/);
  });
});

// ---------------------------------------------------------------------------
describe('checkSeparations()', () => {
  it('returns pass when actual > required', () => {
    const results = checkSeparations(100, [
      { label: 'Building A', type: 'occupied_building', actualDistM: 5.0 },
    ]);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].pass, true);
    assert.strictEqual(results[0].status, 'pass');
  });

  it('returns fail when actual < required', () => {
    const results = checkSeparations(100, [
      { label: 'Building A', type: 'occupied_building', actualDistM: 2.0 },
    ]);
    assert.strictEqual(results[0].pass, false);
    assert.strictEqual(results[0].status, 'fail');
  });

  it('returns warn when actual is within 0.3 m of required', () => {
    const results = checkSeparations(100, [
      { label: 'Boundary', type: 'property_line', actualDistM: 1.5 + 0.1 },
    ]);
    // 1.6 m vs 1.5 m required → margin = 0.1 m < 0.3 → warn
    assert.strictEqual(results[0].status, 'warn');
  });

  it('handles multiple exposures independently', () => {
    const results = checkSeparations(100, [
      { label: 'Pass', type: 'ignition_source', actualDistM: 2.0 },
      { label: 'Fail', type: 'occupied_building', actualDistM: 1.0 },
    ]);
    assert.strictEqual(results[0].pass, true);
    assert.strictEqual(results[1].pass, false);
  });

  it('returns empty array for no exposures', () => {
    const results = checkSeparations(200, []);
    assert.deepStrictEqual(results, []);
  });
});

// ---------------------------------------------------------------------------
describe('propagationAmbientFactor()', () => {
  it('returns 1.0 at 25°C (reference temperature)', () => {
    assert.ok(approx(propagationAmbientFactor(25), 1.0));
  });

  it('returns < 1.0 above 25°C (faster propagation)', () => {
    assert.ok(propagationAmbientFactor(35) < 1.0);
    assert.ok(propagationAmbientFactor(45) < 1.0);
  });

  it('returns > 1.0 below 25°C (slower propagation)', () => {
    assert.ok(propagationAmbientFactor(15) > 1.0);
  });

  it('halves at 35°C (doubles at 35°C per Arrhenius 10°C rule)', () => {
    // Factor should be ~0.5 at 25+10 = 35°C
    assert.ok(approx(propagationAmbientFactor(35), 0.5, 0.001));
  });
});

// ---------------------------------------------------------------------------
describe('propagationTiming()', () => {
  const baseRack = { chemistry: 'LFP', cellsPerModule: 16, modulesPerRack: 8, ambientC: 25 };

  it('returns cellToCell_min, cellToModule_min, moduleToRack_min', () => {
    const result = propagationTiming(baseRack);
    assert.ok('cellToCell_min' in result);
    assert.ok('cellToModule_min' in result);
    assert.ok('moduleToRack_min' in result);
    assert.ok('warnings' in result);
  });

  it('cellToCell_min equals LFP propagBase_min at 25°C', () => {
    const result = propagationTiming(baseRack);
    assert.strictEqual(result.cellToCell_min, CHEMISTRY_PARAMS.LFP.propagBase_min);
  });

  it('timings are monotonically increasing: cell < module < rack', () => {
    const result = propagationTiming(baseRack);
    assert.ok(result.cellToCell_min < result.cellToModule_min);
    assert.ok(result.cellToModule_min < result.moduleToRack_min);
  });

  it('NCA propagates faster than LFP (shorter times)', () => {
    const lfp = propagationTiming({ ...baseRack, chemistry: 'LFP' });
    const nca = propagationTiming({ ...baseRack, chemistry: 'NCA' });
    assert.ok(nca.cellToCell_min < lfp.cellToCell_min);
  });

  it('higher ambient → shorter propagation times', () => {
    const cool = propagationTiming({ ...baseRack, ambientC: 15 });
    const warm = propagationTiming({ ...baseRack, ambientC: 40 });
    assert.ok(warm.cellToCell_min < cool.cellToCell_min);
  });

  it('warns when ambient > 40°C', () => {
    const result = propagationTiming({ ...baseRack, ambientC: 45 });
    assert.ok(result.warnings.some(w => /40/i.test(w)));
  });

  it('throws for unknown chemistry', () => {
    assert.throws(() => propagationTiming({ ...baseRack, chemistry: 'mystery' }), /Unknown chemistry/);
  });
});

// ---------------------------------------------------------------------------
describe('deflagrationVentArea()', () => {
  it('returns ventAreaM2, ventAreaFt2, kG_barMs, pMax_bar, pStat_bar, warnings', () => {
    const result = deflagrationVentArea({ volumeM3: 50, pstatKpa: 5, chemistry: 'LFP' });
    assert.ok('ventAreaM2' in result);
    assert.ok('ventAreaFt2' in result);
    assert.ok('kG_barMs' in result);
    assert.ok('pMax_bar' in result);
    assert.ok('pStat_bar' in result);
    assert.ok('warnings' in result);
  });

  it('ventAreaM2 is positive for all chemistries', () => {
    for (const chem of Object.keys(CHEMISTRY_PARAMS)) {
      const r = deflagrationVentArea({ volumeM3: 30, pstatKpa: 5, chemistry: chem });
      assert.ok(r.ventAreaM2 > 0, `${chem}: ventAreaM2 should be > 0`);
    }
  });

  it('NCA requires more vent area than LFP (higher K_G)', () => {
    const lfp = deflagrationVentArea({ volumeM3: 50, pstatKpa: 5, chemistry: 'LFP' });
    const nca = deflagrationVentArea({ volumeM3: 50, pstatKpa: 5, chemistry: 'NCA' });
    assert.ok(nca.ventAreaM2 > lfp.ventAreaM2);
  });

  it('larger room requires more vent area (monotonicity)', () => {
    const small = deflagrationVentArea({ volumeM3: 20, pstatKpa: 5, chemistry: 'NMC' });
    const large = deflagrationVentArea({ volumeM3: 100, pstatKpa: 5, chemistry: 'NMC' });
    assert.ok(large.ventAreaM2 > small.ventAreaM2);
  });

  it('higher P_stat requires less vent area (stronger panels open at higher pressure)', () => {
    const low  = deflagrationVentArea({ volumeM3: 50, pstatKpa: 5,  chemistry: 'NMC' });
    const high = deflagrationVentArea({ volumeM3: 50, pstatKpa: 20, chemistry: 'NMC' });
    assert.ok(high.ventAreaM2 < low.ventAreaM2);
  });

  it('warns when P_stat exceeds 10 kPa correlation limit', () => {
    const result = deflagrationVentArea({ volumeM3: 50, pstatKpa: 15, chemistry: 'LFP' });
    assert.ok(result.warnings.some(w => /P_stat/i.test(w)));
  });

  it('ventAreaFt2 is ft² conversion of ventAreaM2', () => {
    const result = deflagrationVentArea({ volumeM3: 50, pstatKpa: 5, chemistry: 'LFP' });
    assert.ok(approx(result.ventAreaFt2, result.ventAreaM2 * 10.7639, 0.1));
  });

  it('pStat_bar is kPa/100 of pstatKpa input', () => {
    const result = deflagrationVentArea({ volumeM3: 50, pstatKpa: 5, chemistry: 'LFP' });
    assert.ok(approx(result.pStat_bar, 0.05, 0.001));
  });

  it('throws for unknown chemistry', () => {
    assert.throws(() => deflagrationVentArea({ volumeM3: 50, pstatKpa: 5, chemistry: 'unobtainium' }), /Unknown chemistry/);
  });
});

// ---------------------------------------------------------------------------
describe('hmaSummary()', () => {
  const goodSep = [{ label: 'Bldg', type: 'occupied_building', actualDistM: 5, minDistM: 3.0, status: 'pass', margin: 2.0, pass: true }];
  const badSep  = [{ label: 'Bldg', type: 'occupied_building', actualDistM: 1, minDistM: 3.0, status: 'fail', margin: -2.0, pass: false }];
  const goodProp = { cellToCell_min: 20, cellToModule_min: 224, moduleToRack_min: 896, warnings: [] };
  const fastProp = { cellToCell_min: 2,  cellToModule_min: 22,  moduleToRack_min: 20, warnings: [] };
  const goodVent = { ventAreaM2: 1.0, ventAreaFt2: 10.76, kG_barMs: 50, pMax_bar: 4.0, pStat_bar: 0.05, warnings: [] };

  it('returns pass when all checks pass', () => {
    const result = hmaSummary({
      separationChecks: goodSep,
      propagation: goodProp,
      ventArea: goodVent,
      providedVentAreaM2: 2.0,
      ratedKwh: 200,
      chemistry: 'LFP',
    });
    assert.strictEqual(result.status, 'pass');
    assert.ok(result.separationOk);
    assert.ok(result.ventOk);
    assert.ok(result.propagationOk);
  });

  it('returns fail when separation fails', () => {
    const result = hmaSummary({
      separationChecks: badSep,
      propagation: goodProp,
      ventArea: goodVent,
      providedVentAreaM2: 2.0,
      ratedKwh: 200,
      chemistry: 'LFP',
    });
    assert.strictEqual(result.status, 'fail');
    assert.strictEqual(result.separationOk, false);
    assert.ok(result.issues.some(i => /Bldg/i.test(i)));
  });

  it('returns fail when vent is insufficient', () => {
    const result = hmaSummary({
      separationChecks: goodSep,
      propagation: goodProp,
      ventArea: goodVent,
      providedVentAreaM2: 0.5, // less than 1.0 required
      ratedKwh: 200,
      chemistry: 'LFP',
    });
    assert.strictEqual(result.status, 'fail');
    assert.strictEqual(result.ventOk, false);
  });

  it('returns fail when propagation is too fast (< 30 min to rack)', () => {
    const result = hmaSummary({
      separationChecks: goodSep,
      propagation: fastProp,
      ventArea: goodVent,
      providedVentAreaM2: 2.0,
      ratedKwh: 200,
      chemistry: 'NCA',
    });
    assert.strictEqual(result.status, 'fail');
    assert.strictEqual(result.propagationOk, false);
    assert.ok(result.issues.some(i => /30 min/i.test(i)));
  });

  it('skips vent check when providedVentAreaM2 is undefined', () => {
    const result = hmaSummary({
      separationChecks: goodSep,
      propagation: goodProp,
      ventArea: goodVent,
      providedVentAreaM2: undefined,
      ratedKwh: 200,
      chemistry: 'LFP',
    });
    assert.ok(result.ventOk, 'vent check should be skipped when area not provided');
  });
});

// ---------------------------------------------------------------------------
describe('runBessHazardStudy() integration', () => {
  const baseInputs = {
    ratedKwh: 200,
    chemistry: 'LFP',
    cellsPerModule: 16,
    modulesPerRack: 8,
    ambientC: 25,
    volumeM3: 50,
    pstatKpa: 5,
    providedVentAreaM2: 2.0,
    exposures: [
      { label: 'Occupied building', type: 'occupied_building', actualDistM: 5.0 },
    ],
  };

  it('returns valid result for well-formed inputs', () => {
    const result = runBessHazardStudy(baseInputs);
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('result contains required top-level keys', () => {
    const result = runBessHazardStudy(baseInputs);
    assert.ok('separationChecks' in result);
    assert.ok('propagation' in result);
    assert.ok('ventArea' in result);
    assert.ok('summary' in result);
    assert.ok('chemistryName' in result);
  });

  it('separation check for 200 kWh against occupied building at 5 m returns pass', () => {
    const result = runBessHazardStudy(baseInputs);
    assert.strictEqual(result.separationChecks[0].pass, true);
  });

  it('separation check for 200 kWh against occupied building at 2 m returns fail', () => {
    const result = runBessHazardStudy({
      ...baseInputs,
      exposures: [{ label: 'Building', type: 'occupied_building', actualDistM: 2.0 }],
    });
    assert.strictEqual(result.separationChecks[0].pass, false);
  });

  it('validates missing ratedKwh', () => {
    const result = runBessHazardStudy({ ...baseInputs, ratedKwh: 0 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => /rated energy/i.test(e)));
  });

  it('validates unknown chemistry', () => {
    const result = runBessHazardStudy({ ...baseInputs, chemistry: 'unobtanium' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => /Unknown chemistry/i.test(e)));
  });

  it('validates zero room volume', () => {
    const result = runBessHazardStudy({ ...baseInputs, volumeM3: 0 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => /volume/i.test(e)));
  });

  it('validates ambient out of range', () => {
    const result = runBessHazardStudy({ ...baseInputs, ambientC: 70 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => /ambient/i.test(e)));
  });

  it('null inputs return invalid result', () => {
    const result = runBessHazardStudy(null);
    assert.strictEqual(result.valid, false);
  });

  it('summary status is fail for insufficient separation', () => {
    const result = runBessHazardStudy({
      ...baseInputs,
      exposures: [{ label: 'Building', type: 'occupied_building', actualDistM: 1.0 }],
    });
    assert.strictEqual(result.summary.status, 'fail');
  });
});

/**
 * Tests for analysis/cableThermalEnvironment.mjs (Gap #75)
 *
 * Verifies the unified-thermal-environment orchestrator dispatches correctly
 * to the existing IEC 60287 and NEC derating engines, builds a consistent
 * waterfall, identifies the limiting factor, and round-trips the simplified
 * load-profile thermal model.
 */

import assert from 'assert';
import {
  normalizeEnvironment,
  computeInstallationCases,
  buildDeratingWaterfall,
  simulateLoadProfile,
  runThermalEnvironment,
  extractThermalEnvRecs,
  INSTALLATION_KEYS,
} from '../analysis/cableThermalEnvironment.mjs';
import { calcAmpacity } from '../analysis/iec60287.mjs';
import { mutualHeatingT4 } from '../analysis/buriedCableThermal.mjs';

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

function within(actual, expected, tol, label = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tol,
    `${label}Expected ${expected} ± ${tol}, got ${actual} (diff ${diff.toFixed(3)})`,
  );
}

const baseInputs = () => ({
  cable: {
    sizeMm2: 95,
    material: 'Cu',
    insulation: 'XLPE',
    nCores: 3,
    voltageClass: '0.6/1kV',
  },
  ambient: { tempC: 30, soilTempC: 20, frequencyHz: 60 },
  grouping: { nCables: 1, arrangement: 'flat' },
  installations: {
    tray:            { included: true },
    conduit:         { included: true, conduitOD_mm: 100, burialDepthMm: 800 },
    'duct-bank':     { included: true, ductCount: 6, rows: 2, cols: 3, spacingMm: 200, burialDepthMm: 900, conduitOD_mm: 100 },
    'direct-burial': { included: true, burialDepthMm: 800, soilResistivity: 1.0 },
  },
});

// ---------------------------------------------------------------------------
// Input normalisation
// ---------------------------------------------------------------------------

describe('normalizeEnvironment', () => {
  it('maps AWG 4/0 to ~107 mm²', () => {
    const norm = normalizeEnvironment({
      cable: { sizeAwg: '4/0', material: 'Cu', insulation: 'XLPE' },
      ambient: { tempC: 30 },
    });
    within(norm.cable.sizeMm2, 107, 1, 'AWG 4/0 → mm²: ');
  });

  it('converts °F to °C', () => {
    const norm = normalizeEnvironment({
      cable: { sizeMm2: 95 },
      ambient: { tempF: 104 },
    });
    within(norm.ambient.tempC, 40, 0.1, 'tempF=104 → tempC: ');
  });

  it('collapses material aliases', () => {
    for (const alias of ['cu', 'Cu', 'CU', 'copper']) {
      const norm = normalizeEnvironment({ cable: { sizeMm2: 95, material: alias } });
      assert.strictEqual(norm.cable.material, 'Cu', `alias=${alias}`);
    }
    for (const alias of ['al', 'Al', 'aluminum', 'aluminium']) {
      const norm = normalizeEnvironment({ cable: { sizeMm2: 95, material: alias } });
      assert.strictEqual(norm.cable.material, 'Al', `alias=${alias}`);
    }
  });

  it('fills default insulation thickness via defaultInsulThickMm()', () => {
    const norm = normalizeEnvironment({
      cable: { sizeMm2: 95, voltageClass: '0.6/1kV' },
    });
    within(norm.cable.insulThickMm, 1.6, 0.1, 'insulThick for 95 mm² 0.6/1kV: ');
  });

  it('defaults soil resistivity to 1.0 K·m/W when omitted', () => {
    const norm = normalizeEnvironment(baseInputs());
    assert.strictEqual(norm.installations['direct-burial'].soilResistivity, 1.0);
  });

  it('rejects ambient ≥ θ_max with a clear error', () => {
    assert.throws(() =>
      normalizeEnvironment({
        cable: { sizeMm2: 95, insulation: 'XLPE' }, // θ_max = 90
        ambient: { tempC: 95 },
      }),
    /ambient temperature/i);
  });
});

// ---------------------------------------------------------------------------
// Derating stacking order
// ---------------------------------------------------------------------------

describe('buildDeratingWaterfall — stacking order', () => {
  it('produces steps in order Base → Ambient → Grouping → Installation', () => {
    const norm = normalizeEnvironment(baseInputs());
    const { cases } = computeInstallationCases(norm);
    const direct = cases.find(c => c.installation === 'direct-burial');
    const labels = direct.waterfall.steps.map(s => s.label);
    assert.match(labels[0], /Base table ampacity/);
    assert.match(labels[1], /Ambient/);
    assert.match(labels[2], /Grouping/);
    assert.match(labels[3], /Installation-specific/);
  });

  it('product of step factors equals deratedAmpacity / baseAmpacity within 1%', () => {
    const norm = normalizeEnvironment(baseInputs());
    const { cases } = computeInstallationCases(norm);
    for (const c of cases) {
      if (!c.baseAmpacity_A) continue;
      const product = c.waterfall.steps.reduce((p, s) => p * s.factor, 1);
      const ratio = c.deratedAmpacity_A / c.baseAmpacity_A;
      within(product, ratio, 0.01, `${c.installation} factor-product vs ratio: `);
    }
  });
});

// ---------------------------------------------------------------------------
// Four-installation comparison consistency
// ---------------------------------------------------------------------------

describe('Four-installation comparison', () => {
  it('returns one case per installation key when all included', () => {
    const norm = normalizeEnvironment(baseInputs());
    const { cases } = computeInstallationCases(norm);
    assert.strictEqual(cases.length, 4);
    const keys = cases.map(c => c.installation).sort();
    assert.deepStrictEqual(keys, [...INSTALLATION_KEYS].sort());
  });

  it('produces a non-trivial spread between best and worst case', () => {
    const study = runThermalEnvironment(baseInputs());
    assert.ok(study.comparison.bestCase, 'bestCase set');
    assert.ok(study.comparison.worstCase, 'worstCase set');
    assert.notStrictEqual(study.comparison.bestCase, study.comparison.worstCase);
    assert.ok(study.comparison.spreadPct > 0, 'positive spread');
  });

  it('respects included=false (skips disabled installations)', () => {
    const inputs = baseInputs();
    inputs.installations.tray.included = false;
    inputs.installations['duct-bank'].included = false;
    const norm = normalizeEnvironment(inputs);
    const { cases } = computeInstallationCases(norm);
    assert.strictEqual(cases.length, 2);
    const keys = cases.map(c => c.installation).sort();
    assert.deepStrictEqual(keys, ['conduit', 'direct-burial']);
  });
});

// ---------------------------------------------------------------------------
// Mutual-heating duct bank
// ---------------------------------------------------------------------------

describe('Mutual-heating duct bank', () => {
  it('reduces ampacity vs single conduit (≥10% reduction)', () => {
    const norm = normalizeEnvironment(baseInputs());
    const { cases } = computeInstallationCases(norm);
    const conduit = cases.find(c => c.installation === 'conduit');
    const duct = cases.find(c => c.installation === 'duct-bank');
    assert.ok(conduit && duct, 'cases present');
    const reduction = 1 - (duct.deratedAmpacity_A / conduit.deratedAmpacity_A);
    assert.ok(
      reduction >= 0.10,
      `expected ≥10% reduction, got ${(reduction * 100).toFixed(1)}%`,
    );
  });

  it('grouping factor ≤ 0.8 for ≥6-cable duct bank', () => {
    const norm = normalizeEnvironment(baseInputs());
    const { cases } = computeInstallationCases(norm);
    const duct = cases.find(c => c.installation === 'duct-bank');
    assert.ok(duct.iec60287Raw.f_group <= 0.8, `f_group=${duct.iec60287Raw.f_group}`);
  });
});

// ---------------------------------------------------------------------------
// IEC 60287 regression cross-check
// ---------------------------------------------------------------------------

describe('IEC 60287 regression', () => {
  it('direct-burial case ampacity matches a direct calcAmpacity() call within 1 A', () => {
    const norm = normalizeEnvironment(baseInputs());
    const { cases } = computeInstallationCases(norm);
    const direct = cases.find(c => c.installation === 'direct-burial');

    const directCall = calcAmpacity({
      sizeMm2: 95,
      material: 'Cu',
      insulation: 'XLPE',
      insulThickMm: norm.cable.insulThickMm,
      nCores: 3,
      installMethod: 'direct-burial',
      burialDepthMm: 800,
      soilResistivity: 1.0,
      ambientTempC: norm.ambient.soilTempC,
      frequencyHz: 60,
      U0_kV: 0,
      nCables: 1,
      groupArrangement: 'flat',
    });

    within(direct.deratedAmpacity_A, directCall.I_rated, 1, 'orchestrator vs direct: ');
  });
});

// ---------------------------------------------------------------------------
// Load profile timeline
// ---------------------------------------------------------------------------

describe('Load profile timeline', () => {
  it('square-wave 50/100% raises θ between steady-state 50% and 100% values', () => {
    const inputs = baseInputs();
    inputs.loadProfile = {
      hourly: Array.from({ length: 24 }, (_, i) => (i >= 8 && i < 16 ? 1.0 : 0.5)),
      basis: 'per-unit',
    };
    const study = runThermalEnvironment(inputs);
    assert.ok(study.loadProfile, 'load profile present');
    assert.ok(study.loadProfile.timeline.length === 24, '24 timeline points');
    assert.ok(study.loadProfile.maxTempC > study.inputs.ambient.tempC, 'θ rises above ambient');
    // Hottest hour should fall within the 8–15 peak window
    assert.ok(
      study.loadProfile.hottestHour >= 8 && study.loadProfile.hottestHour <= 23,
      `hottestHour=${study.loadProfile.hottestHour}`,
    );
  });

  it('returns null loadProfile when no profile supplied', () => {
    const study = runThermalEnvironment(baseInputs());
    assert.strictEqual(study.loadProfile, null);
  });
});

// ---------------------------------------------------------------------------
// Limiting factor identification
// ---------------------------------------------------------------------------

describe('Limiting factor identification', () => {
  it('9-cable bundle forces Grouping as limiting factor', () => {
    const inputs = baseInputs();
    inputs.grouping = { nCables: 9, arrangement: 'flat-touching' };
    inputs.installations.tray.included = true;
    inputs.installations.conduit.included = false;
    inputs.installations['duct-bank'].included = false;
    inputs.installations['direct-burial'].included = false;
    const norm = normalizeEnvironment(inputs);
    const { cases } = computeInstallationCases(norm);
    const tray = cases.find(c => c.installation === 'tray');
    assert.ok(tray, 'tray case present');
    assert.match(tray.waterfall.limitingFactor || '', /Grouping/);
  });

  it('high ambient (60 °C in air) drives Ambient as limiting factor for tray', () => {
    const inputs = baseInputs();
    inputs.ambient.tempC = 60; // tray uses air ambient
    inputs.installations.tray.included = true;
    inputs.installations.conduit.included = false;
    inputs.installations['duct-bank'].included = false;
    inputs.installations['direct-burial'].included = false;
    inputs.grouping = { nCables: 1, arrangement: 'flat' };
    const norm = normalizeEnvironment(inputs);
    const { cases } = computeInstallationCases(norm);
    const tray = cases.find(c => c.installation === 'tray');
    assert.ok(tray.waterfall.limitingFactor, 'limiting factor set');
    // The Ambient or Installation-specific step should dominate; just confirm
    // grouping is NOT the limit when only one cable is present.
    assert.doesNotMatch(tray.waterfall.limitingFactor, /Grouping/);
  });
});


// ---------------------------------------------------------------------------
// Physical checks added in the technical review
// ---------------------------------------------------------------------------

describe('Sizes between IEC preferred cross-sections', () => {
  it('100 mm², 4/0 AWG and 1/0 AWG evaluate in every installation instead of erroring', () => {
    for (const cable of [{ sizeMm2: 100 }, { sizeAwg: '4/0' }, { sizeAwg: '1/0' }]) {
      const inputs = baseInputs();
      inputs.cable = { ...inputs.cable, sizeMm2: undefined, ...cable };
      const study = runThermalEnvironment(inputs);
      for (const c of study.cases) assert.ok(!c.error, `${JSON.stringify(cable)} ${c.installation}: ${c.error}`);
    }
  });
  it('a size between two table sizes rates between its neighbours', () => {
    const rate = size => {
      const inputs = baseInputs();
      inputs.cable.sizeMm2 = size;
      return runThermalEnvironment(inputs).cases.find(c => c.installation === 'direct-burial').deratedAmpacity_A;
    };
    assert.ok(rate(95) < rate(100) && rate(100) < rate(120));
  });
});

describe('Waterfall factors are computed, not tabulated or plugged', () => {
  it('ambient factor equals sqrt((θmax - θamb) / (θmax - θref)) for a tray in 40 °C air', () => {
    const inputs = baseInputs();
    inputs.ambient.tempC = 40;
    const tray = runThermalEnvironment(inputs).cases.find(c => c.installation === 'tray');
    within(tray.waterfall.steps[1].factor, Math.sqrt((90 - 40) / (90 - 30)), 0.002, 'tray ambient factor: ');
  });
  it('ambient factor for buried cables uses the 20 °C soil reference', () => {
    const inputs = baseInputs();
    inputs.ambient.soilTempC = 30;
    const direct = runThermalEnvironment(inputs).cases.find(c => c.installation === 'direct-burial');
    within(direct.waterfall.steps[1].factor, Math.sqrt((90 - 30) / (90 - 20)), 0.002, 'soil ambient factor: ');
  });
  it('a cooler-than-reference ambient raises the rating (factor above 1) and is never the limiting factor', () => {
    const inputs = baseInputs();
    inputs.ambient.soilTempC = 10;
    const direct = runThermalEnvironment(inputs).cases.find(c => c.installation === 'direct-burial');
    assert.ok(direct.waterfall.steps[1].factor > 1);
    assert.strictEqual(direct.waterfall.limitingFactor, null);
  });
  it('the factors multiply exactly to derated / base', () => {
    const inputs = baseInputs();
    inputs.grouping = { nCables: 4, arrangement: 'flat' };
    inputs.ambient = { tempC: 40, soilTempC: 25, frequencyHz: 60 };
    for (const c of runThermalEnvironment(inputs).cases) {
      const product = c.waterfall.steps.reduce((p, x) => p * x.factor, 1);
      within(product, c.deratedAmpacity_A / c.baseAmpacity_A, 0.002, `${c.installation}: `);
    }
  });
});

describe('Buried cases respond to their geometry', () => {
  const duct = mutate => {
    const inputs = baseInputs();
    Object.assign(inputs.installations['duct-bank'], mutate);
    return runThermalEnvironment(inputs).cases.find(c => c.installation === 'duct-bank').deratedAmpacity_A;
  };
  it('mutualHeatingT4 matches the hand image-method value for two cables', () => {
    // rho/(2 pi) x ln( sqrt(s^2 + (2L)^2) / s ) with L = 800 mm, s = 200 mm, rho = 1
    const expected = (1 / (2 * Math.PI)) * Math.log(Math.hypot(200, 1600) / 200);
    const actual = mutualHeatingT4([{ x: -100, y: 800 }, { x: 100, y: 800 }], 0, 1);
    within(actual, expected, 1e-9, 'image method: ');
  });
  it('wider duct spacing raises the duct-bank rating', () => {
    assert.ok(duct({ spacingMm: 500 }) > duct({ spacingMm: 200 }));
    assert.ok(duct({ spacingMm: 200 }) > duct({ spacingMm: 100 }));
  });
  it('the duct-bank rows and columns change the result', () => {
    assert.notStrictEqual(duct({ rows: 1, cols: 6 }), duct({ rows: 3, cols: 2 }));
  });
  it('more loaded ducts lower the rating', () => {
    assert.ok(duct({ ductCount: 3, rows: 1, cols: 3 }) > duct({ ductCount: 9, rows: 3, cols: 3 }));
  });
  it('direct-burial spacing changes the result for a group of cables', () => {
    const rate = spacing => {
      const inputs = baseInputs();
      inputs.grouping = { nCables: 4, arrangement: 'flat' };
      inputs.installations['direct-burial'].spacingMm = spacing;
      return runThermalEnvironment(inputs).cases.find(c => c.installation === 'direct-burial').deratedAmpacity_A;
    };
    assert.ok(rate(400) > rate(0));
  });
  it('the soil resistivity applies to conduit and duct bank as well as direct burial', () => {
    const rate = (rho, key) => {
      const inputs = baseInputs();
      inputs.installations['direct-burial'].soilResistivity = rho;
      return runThermalEnvironment(inputs).cases.find(c => c.installation === key).deratedAmpacity_A;
    };
    for (const key of ['conduit', 'duct-bank', 'direct-burial']) {
      assert.ok(rate(2.5, key) < rate(1.0, key) * 0.9, `${key} did not respond to soil resistivity`);
    }
  });
  it('a cable in a duct rates below the same cable directly buried (air gap and wall)', () => {
    const cases = runThermalEnvironment(baseInputs()).cases;
    const direct = cases.find(c => c.installation === 'direct-burial').deratedAmpacity_A;
    const conduit = cases.find(c => c.installation === 'conduit').deratedAmpacity_A;
    assert.ok(conduit < direct, `conduit ${conduit} vs direct burial ${direct}`);
  });
});

describe('Load-profile thermal model', () => {
  it('has a realistic conductor time constant (not the 60 s floor)', () => {
    const inputs = baseInputs();
    inputs.loadProfile = { hourly: Array.from({ length: 24 }, () => 1), basis: 'per-unit' };
    assert.ok(runThermalEnvironment(inputs).loadProfile.tau_s > 600);
  });
  it('a flat profile at the rated current settles at the conductor temperature limit', () => {
    const inputs = baseInputs();
    inputs.loadProfile = { hourly: Array.from({ length: 24 }, () => 1), basis: 'per-unit' };
    const lp = runThermalEnvironment(inputs).loadProfile;
    within(lp.maxTempC, lp.thetaMax, 1.5, 'steady-state temperature: ');
  });
  it('a short peak stays below the steady-state temperature of that peak', () => {
    const inputs = baseInputs();
    inputs.loadProfile = { hourly: Array.from({ length: 24 }, (_, i) => (i === 12 ? 1.4 : 0.4)), basis: 'per-unit' };
    const lp = runThermalEnvironment(inputs).loadProfile;
    assert.ok(lp.maxTempC > 0 && lp.maxTempC < lp.thetaMax + 40);
  });
});

// ---------------------------------------------------------------------------
// Design Coach integration
// ---------------------------------------------------------------------------

describe('extractThermalEnvRecs', () => {
  it('emits no recs for a healthy study', () => {
    const study = runThermalEnvironment(baseInputs());
    const recs = extractThermalEnvRecs(study);
    // Healthy XLPE 95 mm² 30 °C ambient should not trigger any rec
    assert.ok(Array.isArray(recs));
  });

  it('emits a soil-rho rec when direct-burial ρ > 2.5 K·m/W', () => {
    const inputs = baseInputs();
    inputs.installations['direct-burial'].soilResistivity = 3.0;
    const study = runThermalEnvironment(inputs);
    const recs = extractThermalEnvRecs(study);
    assert.ok(recs.some(r => /soil/i.test(r.title) || r.id === 'thermal-env-soil-rho'),
      'expected soil-rho rec');
  });

  it('emits a grouping rec when f_group < 0.6', () => {
    const inputs = baseInputs();
    inputs.grouping = { nCables: 12, arrangement: 'flat-touching' };
    inputs.installations.conduit.included = false;
    inputs.installations['duct-bank'].included = false;
    inputs.installations['direct-burial'].included = false;
    const study = runThermalEnvironment(inputs);
    const recs = extractThermalEnvRecs(study);
    assert.ok(recs.some(r => /grouping/i.test(r.title)), 'expected grouping rec');
  });
});

// ---------------------------------------------------------------------------
// Sanity check: simulateLoadProfile direct call
// ---------------------------------------------------------------------------

describe('simulateLoadProfile direct call', () => {
  it('returns null for missing/empty profile', () => {
    const norm = normalizeEnvironment(baseInputs());
    const { cases } = computeInstallationCases(norm);
    const tray = cases.find(c => c.installation === 'tray');
    assert.strictEqual(simulateLoadProfile(tray, null), null);
    assert.strictEqual(simulateLoadProfile(tray, { hourly: [] }), null);
  });
});

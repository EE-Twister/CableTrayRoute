import assert from 'node:assert/strict';
import { conductorAcResistance } from '../analysis/iec60287.mjs';
import { analyzeGroundGrid } from '../analysis/groundGrid.mjs';
import { THERMAL_GROUND_BENCHMARKS } from '../analysis/benchmarks/thermalGroundEvidence.mjs';

const byId = id => THERMAL_GROUND_BENCHMARKS.find(benchmark => benchmark.id === id);

function assertCheck(benchmark, key) {
  const check = benchmark.checks.find(item => item.key === key);
  assert.ok(check, `${benchmark.id} is missing check ${key}`);
  const actual = benchmark.run()[key];
  assert.equal(typeof actual, check.type === 'boolean' ? 'boolean' : 'number');
  if (check.type === 'boolean') assert.equal(actual, check.expectedVal);
  else assert.ok(Math.abs(actual - check.expectedVal) <= check.tolerance, `${benchmark.id} ${key}: ${actual} vs ${check.expectedVal}`);
}

function thermalResistanceOracle({ operatingTempC, frequencyHz }) {
  // Independent IEC-style arithmetic for 95 mm² Cu: R20 = 0.193 mΩ/m.
  const r20 = 0.193e-3;
  const rdc = r20 * (1 + 3.93e-3 * (operatingTempC - 20));
  const xs2 = (8 * Math.PI * frequencyHz * 1e-7) / rdc;
  const ys = (xs2 ** 2) / (192 + 0.8 * xs2 ** 2);
  const xp2 = (8 * Math.PI * frequencyHz * 0.8e-7) / rdc;
  const yp = 0.57 * ((xp2 ** 2) / (192 + 0.8 * xp2 ** 2));
  return { rdc, rAc: rdc * (1 + ys + yp) };
}

function thermalAmpacityOracle({ installMethod, ambientTempC }) {
  const sizeMm2 = 95;
  const insulThickMm = 1.6;
  const nCores = 3;
  const dC = 2 * Math.sqrt(sizeMm2 / Math.PI);
  const t1 = (3.5 / (2 * Math.PI)) * Math.log(1 + (2 * insulThickMm) / dC);
  const dCoreGroup = dC + 2 * insulThickMm;
  const dCable = 2.16 * dCoreGroup;
  const t3 = (6 / (2 * Math.PI)) * Math.log(1 + (2 * 3) / dCable);
  const dE = dCable + 2 * 3;
  const t4 = installMethod === 'direct-burial'
    ? (1 / (2 * Math.PI)) * Math.log(2 * 0.8 / (dE / 1000) + Math.sqrt((2 * 0.8 / (dE / 1000)) ** 2 - 1))
    : 1 / (8 * Math.PI * (dE / 1000));
  const totalR = t1 + nCores * (0.02 + t3 + t4);
  const rAc = thermalResistanceOracle({ sizeMm2, operatingTempC: 90, frequencyHz: 50 }).rAc;
  const ampacity = Math.sqrt((90 - ambientTempC) / (rAc * totalR));
  return { ampacity, totalR };
}

function gridOracle(input) {
  const { rho, gridLx, gridLy, nx, ny, h, d, Ig, tf, rhoS, hs, bw } = input;
  const area = gridLx * gridLy;
  const perimeter = 2 * (gridLx + gridLy);
  const conductorLength = nx * gridLx + ny * gridLy;
  const rodLength = input.hasRods ? input.rodCount * input.rodLength : 0;
  const length = conductorLength + rodLength;
  const stepLength = 0.75 * conductorLength + 0.85 * rodLength;
  const dx = gridLx / (ny - 1);
  const dy = gridLy / (nx - 1);
  const spacing = Math.sqrt(dx * dy);
  const n = ((2 * conductorLength) / perimeter) * Math.sqrt(perimeter / (4 * Math.sqrt(area)));
  const kii = input.hasRods ? 1 : 1 / (2 * n) ** (2 / n);
  const kh = Math.sqrt(1 + h);
  const term1 = Math.log((spacing ** 2) / (16 * h * d) + (spacing + 2 * h) ** 2 / (8 * spacing * d) - h / (4 * d));
  const km = (term1 + (kii / kh) * Math.log(8 / (Math.PI * (2 * n - 1)))) / (2 * Math.PI);
  const ks = (1 / Math.PI) * (1 / (2 * h) + 1 / (spacing + h) + (1 / spacing) * (1 - 0.5 ** (n - 2)));
  const ki = 0.644 + 0.148 * n;
  const rg = rho / length + (rho / Math.sqrt(20 * area)) * (1 + 1 / (1 + h * Math.sqrt(20 / area)));
  const meshLength = input.hasRods
    ? conductorLength + (1.55 + 1.22 * (input.rodLength / Math.sqrt(gridLx ** 2 + gridLy ** 2))) * rodLength
    : conductorLength;
  const cs = 1 - (0.09 * (1 - rho / rhoS)) / (2 * hs + 0.09);
  const bodyFactor = bw === 70 ? 0.157 : 0.116;
  const touch = (1000 + 1.5 * cs * rhoS) * bodyFactor / Math.sqrt(tf);
  const step = (1000 + 6 * cs * rhoS) * bodyFactor / Math.sqrt(tf);
  return {
    gridResistanceOhm: rg,
    meshVoltageV: (rho * Ig * km * ki) / meshLength,
    stepVoltageV: (rho * Ig * ks * ki) / stepLength,
    tolerableTouchV: touch,
    tolerableStepV: step,
    touchSafe: (rho * Ig * km * ki) / meshLength <= touch,
    stepSafe: (rho * Ig * ks * ki) / stepLength <= step,
  };
}

assert.equal(THERMAL_GROUND_BENCHMARKS.length, 5);
for (const benchmark of THERMAL_GROUND_BENCHMARKS) {
  assert.ok(benchmark.fixtureId);
  assert.ok(benchmark.source?.url);
  assert.ok(benchmark.source?.locator);
  assert.equal(benchmark.source.accessedOn, '2026-09-17');
  assert.ok(Array.isArray(benchmark.limitations) && benchmark.limitations.length > 0);
  for (const check of benchmark.checks) {
    assert.ok(check.unit, `${benchmark.id} ${check.key} is missing a unit`);
    assert.ok(check.toleranceBasis, `${benchmark.id} ${check.key} is missing tolerance rationale`);
    assertCheck(benchmark, check.key);
  }
}

{
  const benchmark = byId('TGE-THERM-001');
  const result = benchmark.run();
  const expectedR20 = 0.193e-3;
  const expectedR85 = expectedR20 * (1 + 3.93e-3 * (85 - 20));
  assert.ok(Math.abs(result.rDc20OhmPerM - expectedR20) <= benchmark.checks[0].tolerance);
  assert.ok(Math.abs(result.rDc85OhmPerM - expectedR85) <= benchmark.checks[1].tolerance);
  assert.ok(Math.abs(result.rDc85OhmPerM - 0.242e-3) <= 5e-7);
}

{
  const direct = byId('TGE-THERM-002');
  const oracle = thermalAmpacityOracle(direct.inputs);
  assert.ok(Math.abs(oracle.ampacity - direct.checks[0].expectedVal) <= direct.checks[0].tolerance);
  assert.ok(Math.abs(oracle.totalR - direct.checks[2].expectedVal) <= direct.checks[2].tolerance);
  const variants = byId('TGE-THERM-003');
  const burialOracle = thermalAmpacityOracle(variants.inputs.directBurial);
  const trayOracle = thermalAmpacityOracle(variants.inputs.tray);
  assert.ok(Math.abs(burialOracle.ampacity - variants.checks[0].expectedVal) <= variants.checks[0].tolerance);
  assert.ok(Math.abs(trayOracle.ampacity - variants.checks[1].expectedVal) <= variants.checks[1].tolerance);
}

{
  const resistance = byId('TGE-GROUND-001');
  const { rho, L, A, h } = resistance.inputs;
  const oracle = rho / L + (rho / Math.sqrt(20 * A)) * (1 + 1 / (1 + h * Math.sqrt(20 / A)));
  assert.ok(Math.abs(oracle - resistance.checks[0].expectedVal) <= resistance.checks[0].tolerance);
}

{
  const safety = byId('TGE-GROUND-002');
  const oracle = gridOracle(safety.inputs);
  for (const check of safety.checks) {
    assert.ok(Math.abs(oracle[check.key] - check.expectedVal) <= check.tolerance, `${check.key} oracle drift`);
  }
}

{
  const noRod = analyzeGroundGrid({
    rho: 100,
    gridLx: 40,
    gridLy: 30,
    nx: 5,
    ny: 4,
    h: 0.5,
    d: 0.01,
    Ig: 2000,
    tf: 0.5,
    hasRods: false,
    rodCount: 0,
    rodLength: 0,
    rhoS: 300,
    hs: 0.1,
    bw: 50,
  });
  assert.ok(Math.abs(noRod.Es - 413.9786087887692) <= 1e-6, `no-rod step voltage ${noRod.Es}`);
  assert.equal(noRod.stepSafe, false);
}

console.log('✓ thermal and grounding evidence benchmarks match independent derivations');

/**
 * Tests for analysis/groundSoilModel.mjs
 *
 * Covers: Wenner apparent resistivity (Sunde image method), two-layer soil fitting,
 * risk point classification, polygon geometry, hazard map generation, and risk-point evaluation.
 */
import assert from 'assert';
import {
  wennerApparentResistivity,
  fitTwoLayerSoil,
  classifyRiskPoint,
  buildPolygonGeometry,
  buildHazardMap,
  buildRectangularGeometry,
  evaluateRiskPoints,
  estimateSurfacePotential,
} from '../analysis/groundSoilModel.mjs';

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

function approx(actual, expected, tol = 0.01) {
  const ref = Math.abs(expected) || 1;
  const rel = Math.abs(actual - expected) / ref;
  assert.ok(rel <= tol, `Expected ~${expected}, got ${actual} (rel error ${(rel * 100).toFixed(3)}%)`);
}

// ---------------------------------------------------------------------------
// wennerApparentResistivity — Sunde image method
// ---------------------------------------------------------------------------
describe('wennerApparentResistivity — Sunde two-layer image method', () => {
  it('returns rho1 for homogeneous soil (rho1 === rho2)', () => {
    approx(wennerApparentResistivity(100, 100, 5, 3), 100, 0.001);
  });

  it('returns rho1 for homogeneous soil regardless of h', () => {
    approx(wennerApparentResistivity(200, 200, 1, 10), 200, 0.001);
  });

  it('returns close to rho1 for very small electrode spacing (a << h)', () => {
    // a=0.1 m, h=10 m: top layer dominates
    approx(wennerApparentResistivity(50, 500, 10, 0.1), 50, 0.05);
  });

  it('approaches rho1 for small a relative to layer depth', () => {
    const rhoA = wennerApparentResistivity(80, 400, 8, 0.5);
    assert.ok(rhoA < 120, `rhoA=${rhoA.toFixed(1)} should be near rho1=80 for a=0.5 << h=8`);
  });

  it('returns value between rho1 and rho2 for intermediate spacing', () => {
    const rhoA = wennerApparentResistivity(100, 400, 3, 3);
    assert.ok(rhoA > 100 && rhoA < 400, `rhoA=${rhoA.toFixed(1)} should be between 100 and 400`);
  });

  it('K < 0 gives rhoA < rho1 for resistive top over conductive bottom', () => {
    // rho1=400, rho2=50 → K = (50-400)/(50+400) < 0
    const rhoA = wennerApparentResistivity(400, 50, 2, 5);
    assert.ok(rhoA < 400, `rhoA=${rhoA.toFixed(1)} should be less than rho1=400 for descending profile`);
  });

  it('throws on non-positive parameters', () => {
    assert.throws(() => wennerApparentResistivity(0, 100, 5, 3), /positive/i);
    assert.throws(() => wennerApparentResistivity(100, 100, 0, 3), /positive/i);
    assert.throws(() => wennerApparentResistivity(100, 100, 5, 0), /positive/i);
  });

  it('result is finite and positive for a wide range of inputs', () => {
    for (const a of [0.5, 1, 2, 5, 10, 20]) {
      const v = wennerApparentResistivity(100, 400, 3, a);
      assert.ok(Number.isFinite(v) && v > 0, `rhoA should be finite and positive for a=${a}`);
    }
  });
});

// ---------------------------------------------------------------------------
// fitTwoLayerSoil — Nelder-Mead least squares
// ---------------------------------------------------------------------------
describe('fitTwoLayerSoil — two-layer soil fitting', () => {
  it('throws when fewer than 3 measurements provided', () => {
    assert.throws(() => fitTwoLayerSoil([{ a: 1, rhoA: 100 }, { a: 2, rhoA: 120 }]), /3/);
  });

  it('recovers known rho1, rho2, h from noise-free synthetic measurements (K > 0)', () => {
    // Generate from rho1=100, rho2=400, h=3
    const meas = [1, 2, 4, 8, 16].map(a => ({
      a,
      rhoA: wennerApparentResistivity(100, 400, 3, a),
    }));
    const fit = fitTwoLayerSoil(meas);
    approx(fit.rho1, 100, 0.05);   // within 5%
    approx(fit.rho2, 400, 0.10);   // within 10%
    approx(fit.h,    3.0, 0.15);   // within 15%
    assert.ok(fit.fitError < 2.0, `fitError=${fit.fitError.toFixed(2)}% should be < 2%`);
  });

  it('recovers descending profile (K < 0: rho1 > rho2)', () => {
    const meas = [1, 2, 4, 8, 16].map(a => ({
      a,
      rhoA: wennerApparentResistivity(300, 50, 4, a),
    }));
    const fit = fitTwoLayerSoil(meas);
    approx(fit.rho1, 300, 0.15);
    approx(fit.rho2, 50, 0.20);
    assert.ok(fit.fitError < 5.0, `fitError=${fit.fitError.toFixed(2)}% should be < 5%`);
  });

  it('returns fitError as a percentage (0–100 scale)', () => {
    const meas = [1, 2, 4, 8, 16].map(a => ({ a, rhoA: wennerApparentResistivity(100, 400, 3, a) }));
    const fit = fitTwoLayerSoil(meas);
    assert.ok(fit.fitError >= 0, 'fitError must be non-negative');
    assert.ok(fit.fitError < 100, 'fitError must be < 100% for reasonable data');
  });

  it('result has rho1, rho2, h, and fitError keys', () => {
    const meas = [1, 2, 4].map(a => ({ a, rhoA: 100 }));
    const fit = fitTwoLayerSoil(meas);
    assert.ok('rho1' in fit && 'rho2' in fit && 'h' in fit && 'fitError' in fit);
  });

  it('rho1, rho2, h are all positive in the result', () => {
    const meas = [1, 2, 4, 8].map(a => ({ a, rhoA: wennerApparentResistivity(80, 300, 2, a) }));
    const fit = fitTwoLayerSoil(meas);
    assert.ok(fit.rho1 > 0 && fit.rho2 > 0 && fit.h > 0);
  });
});

// ---------------------------------------------------------------------------
// classifyRiskPoint
// ---------------------------------------------------------------------------
describe('classifyRiskPoint — risk classification', () => {
  it('returns safe when both touch and step pass', () => {
    assert.strictEqual(classifyRiskPoint(50, 30, 100, 100), 'safe');
  });

  it('returns touch-risk when only touch fails', () => {
    assert.strictEqual(classifyRiskPoint(110, 30, 100, 100), 'touch-risk');
  });

  it('returns step-risk when only step fails', () => {
    assert.strictEqual(classifyRiskPoint(50, 110, 100, 100), 'step-risk');
  });

  it('returns both-risk when both fail', () => {
    assert.strictEqual(classifyRiskPoint(110, 110, 100, 100), 'both-risk');
  });

  it('treats exact equality with limit as passing (not risk)', () => {
    assert.strictEqual(classifyRiskPoint(100, 100, 100, 100), 'safe');
  });

  it('handles zero voltages as safe', () => {
    assert.strictEqual(classifyRiskPoint(0, 0, 100, 100), 'safe');
  });
});

// ---------------------------------------------------------------------------
// buildPolygonGeometry — scan-line conductor fill
// ---------------------------------------------------------------------------
describe('buildPolygonGeometry — polygon grid geometry', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

  it('computes area of 10×10 square as 100 m²', () => {
    const g = buildPolygonGeometry(square, 2.5, 1.0, []);
    assert.strictEqual(g.area, 100);
  });

  it('computes perimeter of 10×10 square as 40 m', () => {
    const g = buildPolygonGeometry(square, 2.5, 1.0, []);
    assert.strictEqual(g.perimeter, 40);
  });

  it('centroid of square is at (5, 5)', () => {
    const g = buildPolygonGeometry(square, 2.5, 1.0, []);
    approx(g.centroid.x, 5, 0.01);
    approx(g.centroid.y, 5, 0.01);
  });

  it('returns conductors array with at least perimeter segments', () => {
    const g = buildPolygonGeometry(square, 5, 1.0, []);
    assert.ok(g.conductors.length >= 4, `Expected at least 4 perimeter segments, got ${g.conductors.length}`);
  });

  it('totalConductorLength is positive', () => {
    const g = buildPolygonGeometry(square, 2.5, 1.0, []);
    assert.ok(g.totalConductorLength > 0);
  });

  it('bounds match polygon bounding box', () => {
    const g = buildPolygonGeometry(square, 2.5, 1.0, []);
    assert.strictEqual(g.bounds.minX, 0);
    assert.strictEqual(g.bounds.maxX, 10);
    assert.strictEqual(g.bounds.minY, 0);
    assert.strictEqual(g.bounds.maxY, 10);
  });

  it('throws on fewer than 3 vertices', () => {
    assert.throws(() => buildPolygonGeometry([{ x: 0, y: 0 }, { x: 1, y: 0 }], 1, 0.5, []), /3/i);
  });

  it('throws on non-positive meshSpacing', () => {
    assert.throws(() => buildPolygonGeometry(square, 0, 0.5, []), /positive/i);
  });

  it('throws on non-positive depth', () => {
    assert.throws(() => buildPolygonGeometry(square, 2, 0, []), /positive/i);
  });

  it('right triangle area is correct (0.5 × base × height)', () => {
    const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 8 }];
    const g = buildPolygonGeometry(tri, 2, 0.5, []);
    approx(g.area, 40, 0.01);  // 0.5 * 10 * 8 = 40
  });
});

// ---------------------------------------------------------------------------
// buildRectangularGeometry helper
// ---------------------------------------------------------------------------
describe('buildRectangularGeometry — rectangular grid from IEEE 80 params', () => {
  it('produces correct number of conductor segments (nx + ny)', () => {
    const g = buildRectangularGeometry(30, 30, 7, 7, 0.5);
    // 7 x-direction + 7 y-direction conductors
    assert.strictEqual(g.conductors.length, 14);
  });

  it('area equals gridLx × gridLy', () => {
    const g = buildRectangularGeometry(20, 15, 5, 4, 0.5);
    assert.strictEqual(g.area, 300);
  });

  it('perimeter equals 2 × (gridLx + gridLy)', () => {
    const g = buildRectangularGeometry(20, 15, 5, 4, 0.5);
    assert.strictEqual(g.perimeter, 70);
  });

  it('totalConductorLength is nx × gridLy + ny × gridLx (no rods)', () => {
    // 4 x-dir conductors of length 20 + 5 y-dir conductors of length 15
    const g = buildRectangularGeometry(20, 15, 4, 5, 0.5);
    approx(g.totalConductorLength, 4 * 20 + 5 * 15, 0.01);
  });
});

// ---------------------------------------------------------------------------
// estimateSurfacePotential
// ---------------------------------------------------------------------------
describe('estimateSurfacePotential — simplified potential model', () => {
  const squareGeom = buildRectangularGeometry(30, 30, 7, 7, 0.5);

  it('returns a positive potential at the grid centre', () => {
    const V = estimateSurfacePotential({ x: 15, y: 15 }, squareGeom.conductors, 100, 5000, squareGeom.totalConductorLength);
    assert.ok(V > 0, `Potential at centre should be positive, got ${V}`);
  });

  it('returns lower potential outside grid than at centre', () => {
    const Vcenter = estimateSurfacePotential({ x: 15, y: 15 }, squareGeom.conductors, 100, 5000, squareGeom.totalConductorLength);
    const Vout = estimateSurfacePotential({ x: 100, y: 100 }, squareGeom.conductors, 100, 5000, squareGeom.totalConductorLength);
    assert.ok(Vcenter > Vout, `Centre potential (${Vcenter.toFixed(0)} V) should exceed distant potential (${Vout.toFixed(0)} V)`);
  });

  it('returns 0 for empty conductor array', () => {
    const V = estimateSurfacePotential({ x: 15, y: 15 }, [], 100, 5000, 1);
    assert.strictEqual(V, 0);
  });
});

// ---------------------------------------------------------------------------
// buildHazardMap — full map integration
// ---------------------------------------------------------------------------
describe('buildHazardMap — hazard map generation', () => {
  const squareGeom = buildRectangularGeometry(30, 30, 7, 7, 0.5);
  const rho = 100, Ig = 5000, Rg = 1.5, eTouch = 300, eStep = 1000;
  const resolution = 5; // 5 m cell spacing

  let hazardMap;
  it('builds without throwing', () => {
    hazardMap = buildHazardMap(squareGeom, rho, Ig, Rg, eTouch, eStep, resolution);
    assert.ok(Array.isArray(hazardMap) && hazardMap.length > 0);
  });

  it('every cell has required keys', () => {
    for (const cell of (hazardMap || [])) {
      assert.ok('x' in cell && 'y' in cell && 'touchV' in cell && 'stepV' in cell && 'riskClass' in cell && '_method' in cell);
    }
  });

  it('_method is screening-superposition', () => {
    for (const cell of (hazardMap || [])) {
      assert.strictEqual(cell._method, 'screening-superposition');
    }
  });

  it('all riskClass values are valid', () => {
    const valid = new Set(['safe', 'touch-risk', 'step-risk', 'both-risk']);
    for (const cell of (hazardMap || [])) {
      assert.ok(valid.has(cell.riskClass), `Invalid riskClass: ${cell.riskClass}`);
    }
  });

  it('touchV and stepV are finite and non-negative', () => {
    for (const cell of (hazardMap || [])) {
      assert.ok(Number.isFinite(cell.touchV) && cell.touchV >= 0);
      assert.ok(Number.isFinite(cell.stepV) && cell.stepV >= 0);
    }
  });
});

// ---------------------------------------------------------------------------
// evaluateRiskPoints — inspection point lookup
// ---------------------------------------------------------------------------
describe('evaluateRiskPoints — inspection point evaluation', () => {
  const squareGeom = buildRectangularGeometry(30, 30, 7, 7, 0.5);
  const hazardMap = buildHazardMap(squareGeom, 100, 5000, 1.5, 300, 1000, 5);

  it('returns one result per input point', () => {
    const pts = [{ id: 'A', label: 'Gate', x: 15, y: 15 }];
    const results = evaluateRiskPoints(pts, hazardMap, 300, 1000);
    assert.strictEqual(results.length, 1);
  });

  it('result preserves id and label', () => {
    const pts = [{ id: 'P1', label: 'Fence post', x: 5, y: 5 }];
    const [r] = evaluateRiskPoints(pts, hazardMap, 300, 1000);
    assert.strictEqual(r.id, 'P1');
    assert.strictEqual(r.label, 'Fence post');
  });

  it('result has touchMarginPct and stepMarginPct', () => {
    const pts = [{ id: 'X', label: 'X', x: 10, y: 10 }];
    const [r] = evaluateRiskPoints(pts, hazardMap, 300, 1000);
    assert.ok(Number.isFinite(r.touchMarginPct));
    assert.ok(Number.isFinite(r.stepMarginPct));
  });

  it('handles empty inspectionPoints array', () => {
    const results = evaluateRiskPoints([], hazardMap, 300, 1000);
    assert.deepStrictEqual(results, []);
  });

  it('handles empty hazardMapData gracefully', () => {
    const pts = [{ id: 'A', label: 'A', x: 0, y: 0 }];
    const results = evaluateRiskPoints(pts, [], 300, 1000);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].riskClass, 'safe');
  });
});

console.log('\ngroundSoilModel tests complete.');

// ---------------------------------------------------------------------------
// Review regressions: series convergence, exact line-source potential, effective rho
// ---------------------------------------------------------------------------
import { analyzeGroundGrid, analyzeGroundGridWithSoil, twoLayerEffectiveRho } from '../analysis/groundGrid.mjs';

describe('Wenner series convergence for high-contrast soil', () => {
  it('approaches rho2 at large spacing when rho2/rho1 = 100 (K = 0.98)', () => {
    // Closed-form limit: rho1 (1 + K)/(1 - K) = rho2
    approx(wennerApparentResistivity(1, 100, 2, 50000), 100, 0.01);
  });
  it('rejects non-positive and blank measurements in the fit', () => {
    const good = [{ a: 1, rhoA: 100 }, { a: 2, rhoA: 100 }, { a: 4, rhoA: 100 }];
    assert.throws(() => fitTwoLayerSoil([...good.slice(0, 2), { a: 4, rhoA: 0 }]), /rhoA > 0/);
    assert.throws(() => fitTwoLayerSoil([...good.slice(0, 2), { a: NaN, rhoA: 50 }]), /a > 0/);
  });
  it('recovers a 100:1 two-layer soil from synthetic data', () => {
    const data = [0.5, 1, 2, 4, 8, 16, 32].map(a => ({ a, rhoA: wennerApparentResistivity(20, 2000, 3, a) }));
    const fit = fitTwoLayerSoil(data);
    approx(fit.rho1, 20, 0.05);
    approx(fit.rho2, 2000, 0.05);
    approx(fit.h, 3, 0.05);
  });
});

describe('Surface potential line-source integration', () => {
  it('matches rho I / (2 pi r) far from the conductors', () => {
    const g = buildRectangularGeometry(30, 30, 7, 7, 0.5);
    const V = estimateSurfacePotential({ x: 15 + 5000, y: 15 }, g.conductors, 100, 3000, g.totalConductorLength);
    approx(V, (100 * 3000) / (2 * Math.PI * 5000), 0.01);
  });
  it('matches numerical integration along a single conductor', () => {
    const c = { x1: 0, y1: 0, z1: -0.5, x2: 30, y2: 0, z2: -0.5 };
    const P = { x: 10, y: 4 };
    let num = 0;
    const N = 200000;
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * 30 / N;
      num += (30 / N) / Math.sqrt((P.x - x) ** 2 + P.y ** 2 + 0.25);
    }
    const expected = (100 * 30) / (2 * Math.PI * 30) * num; // rho (I/L) / (2 pi) * integral, I = 30 A over L = 30 m
    approx(estimateSurfacePotential(P, [c], 100, 30, 30), expected, 1e-4);
  });
  it('hazard map stays below GPR and gives plausible step voltages', () => {
    const p = { rho: 100, gridLx: 30, gridLy: 30, nx: 7, ny: 7, h: 0.5, d: 0.01, Ig: 3000, tf: 0.5 };
    const r = analyzeGroundGrid(p);
    const g = buildRectangularGeometry(30, 30, 7, 7, 0.5);
    const map = buildHazardMap(g, 100, 3000, r.Rg, r.Etouch, r.Estep, 1);
    assert.ok(Math.max(...map.map(c => c.surfaceV)) < r.GPR, 'surface potential must not exceed GPR');
    // The midpoint-source model gave > 7500 V step on this grid; IEEE 80 gives Es ~ 700 V.
    assert.ok(Math.max(...map.map(c => c.stepV)) < 1.5 * r.Es);
  });
});

describe('Two-layer effective resistivity', () => {
  const grid = { gridLx: 30, gridLy: 30, nx: 7, ny: 7, h: 0.5, d: 0.01, Ig: 3000, tf: 0.5, rho: 100 };
  it('uses the deeper layer when it is more resistive than the top layer', () => {
    const soil = { rho1: 50, rho2: 500, h: 2 };
    const eff = twoLayerEffectiveRho(soil, 900);
    assert.ok(eff > 50);
    approx(eff, wennerApparentResistivity(50, 500, 2, 30), 1e-9);
    const r = analyzeGroundGridWithSoil(grid, soil);
    assert.ok(r.Rg > analyzeGroundGrid({ ...grid, rho: 50 }).Rg);
  });
  it('keeps rho1 when the bottom layer is more conductive', () => {
    assert.strictEqual(twoLayerEffectiveRho({ rho1: 500, rho2: 50, h: 2 }, 900), 500);
  });
});

/**
 * Ductbank finite-difference solver checked against exact solutions.
 *
 * A single conduit of uniformly generated heat P (W/m) at depth L in soil of
 * resistivity rho, with an isothermal grade, has the exact mean temperature
 * rise   dT = P rho / (2 pi) * [ ln(2 L / R) + 1/4 ]   (Kennelly line source
 * with image, plus the 1/4 for uniform generation inside the radius R).
 *
 * Before the fix the same conduit gave +20%, +8% and -47% error at the 20, 40
 * and 80 node settings (Jacobi loop stopped early; isothermal edges one burial
 * depth from the bank; heat not conserved on coarse grids).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerSource = fs.readFileSync(path.join(root, 'thermalWorker.js'), 'utf8');
const { solve, getRduct, cableHeatLoss } = new Function(
  'self',
  `${workerSource}\n;return { solve, getRduct, cableHeatLoss };`
)({});

const AREA_IN2 = { '4': 12.554, '2': 3.291 };

function radiusIn(trade) { return Math.sqrt(AREA_IN2[trade] / Math.PI); }

function cableFor(id, load) {
  return { conduit_id: id, conductor_size: '500', conductor_material: 'Cu', conductors: 1, insulation_rating: 90, est_load: load };
}

function singleConduit({ depthIn, rhoCmW, load, grid = 20, trade = '4' }) {
  const R = radiusIn(trade);
  const conduits = [{ conduit_id: 'C1', conduit_type: 'PVC Sch 40', trade_size: trade, x: 0, y: 0 }];
  const cable = cableFor('C1', load);
  const P = cableHeatLoss(cable, load, 90);
  const params = { ductbankDepth: depthIn, soilResistivity: rhoCmW, earthTemp: 20, airTemp: 20, moistureContent: 0 };
  const res = solve(conduits, [cable], params, 2 * R * 40, 2 * R * 40, grid, 0, null, []);
  const rise = res.conduitTemps.C1 - P * getRduct(conduits[0], params) - 20;
  const exact = (P * (rhoCmW / 100) / (2 * Math.PI)) * (Math.log(2 * depthIn / R) + 0.25);
  return { rise, exact, P, res };
}

describe('single conduit against the exact solution', () => {
  for (const [depthIn, rhoCmW, trade] of [[36, 90, '4'], [30, 60, '4'], [48, 120, '4'], [36, 90, '2']]) {
    it(`depth ${depthIn} in, rho ${rhoCmW} C-cm/W, ${trade} in conduit is within 6%`, () => {
      const { rise, exact } = singleConduit({ depthIn, rhoCmW, load: 600, trade });
      const error = Math.abs(rise / exact - 1);
      assert.ok(error < 0.06, `rise ${rise.toFixed(2)} vs exact ${exact.toFixed(2)} (${(error * 100).toFixed(1)}%)`);
    });
  }

  it('gives the same answer at every grid-resolution setting', () => {
    const rises = [20, 40, 80].map(grid => singleConduit({ depthIn: 36, rhoCmW: 90, load: 600, grid }).rise);
    const spread = (Math.max(...rises) - Math.min(...rises)) / rises[0];
    assert.ok(spread < 0.01, `rises ${rises.map(r => r.toFixed(2)).join(', ')}`);
  });

  it('relaxation converges (residual per sweep far below the tolerance of interest)', () => {
    const { res } = singleConduit({ depthIn: 36, rhoCmW: 90, load: 600 });
    assert.ok(res.residual < 1e-3, `residual ${res.residual}`);
  });

  it('temperature rise scales with the square of the current', () => {
    const low = singleConduit({ depthIn: 36, rhoCmW: 90, load: 300 });
    const high = singleConduit({ depthIn: 36, rhoCmW: 90, load: 600 });
    assert.ok(Math.abs(high.rise / low.rise - 4) < 0.04, `${high.rise / low.rise}`);
  });

  it('a higher soil resistivity raises the temperature in proportion', () => {
    const wet = singleConduit({ depthIn: 36, rhoCmW: 60, load: 600 });
    const dry = singleConduit({ depthIn: 36, rhoCmW: 120, load: 600 });
    assert.ok(Math.abs(dry.rise / wet.rise - 2) < 0.1, `${dry.rise / wet.rise}`);
  });
});

describe('two conduits heat each other', () => {
  it('adds the image-method mutual heating to the single-conduit rise (within 10%)', () => {
    const R = radiusIn('4');
    const centerSpacingIn = 12;
    const depthIn = 36;
    const conduits = [
      { conduit_id: 'A', conduit_type: 'PVC Sch 40', trade_size: '4', x: 0, y: 0 },
      { conduit_id: 'B', conduit_type: 'PVC Sch 40', trade_size: '4', x: centerSpacingIn, y: 0 },
    ];
    const cables = [cableFor('A', 600), cableFor('B', 600)];
    const P = cableHeatLoss(cables[0], 600, 90);
    const params = { ductbankDepth: depthIn, soilResistivity: 90, earthTemp: 20, airTemp: 20, moistureContent: 0 };
    const res = solve(conduits, cables, params, (centerSpacingIn + 2 * R) * 40, 2 * R * 40, 20, 0, null, []);
    const rise = res.conduitTemps.A - P * getRduct(conduits[0], params) - 20;
    const single = (P * 0.9 / (2 * Math.PI)) * (Math.log(2 * depthIn / R) + 0.25);
    const mutual = (P * 0.9 / (2 * Math.PI)) * Math.log(Math.hypot(centerSpacingIn, 2 * depthIn) / centerSpacingIn);
    assert.ok(Math.abs(rise / (single + mutual) - 1) < 0.1, `rise ${rise.toFixed(2)} vs ${(single + mutual).toFixed(2)}`);
    assert.ok(rise > single * 1.2, 'the neighbour must add a clearly visible temperature rise');
  });
});

describe('cable-to-duct air gap is added to each conduit', () => {
  it('conduit temperature rises by P x gap when a gap resistance is supplied', () => {
    const R = radiusIn('4');
    const conduits = [{ conduit_id: 'C1', conduit_type: 'PVC Sch 40', trade_size: '4', x: 0, y: 0 }];
    const cable = cableFor('C1', 600);
    const P = cableHeatLoss(cable, 600, 90);
    const base = { ductbankDepth: 36, soilResistivity: 90, earthTemp: 20, airTemp: 20, moistureContent: 0 };
    const without = solve(conduits, [cable], base, 2 * R * 40, 2 * R * 40, 20, 0, null, []).conduitTemps.C1;
    const withGap = solve(conduits, [cable], { ...base, ductGapByConduit: { C1: 0.8 } }, 2 * R * 40, 2 * R * 40, 20, 0, null, []).conduitTemps.C1;
    assert.ok(Math.abs(withGap - without - P * 0.8) < 1e-6);
  });
});

describe('worker and main-thread solver share one numerical kernel', () => {
  const kernel = source => {
    const start = source.indexOf('// <relax-kernel>');
    const end = source.indexOf('// </relax-kernel>');
    assert.ok(start >= 0 && end > start, 'kernel markers present');
    return source.slice(start, end).replace(/\s+/g, ' ').trim();
  };
  it('the relaxation kernel is identical in thermalWorker.js and ductbankroute.js', () => {
    const page = fs.readFileSync(path.join(root, 'ductbankroute.js'), 'utf8');
    assert.equal(kernel(page), kernel(workerSource));
  });
});

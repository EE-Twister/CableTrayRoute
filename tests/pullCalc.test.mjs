import assert from 'node:assert/strict';
import { calcPullTension, calcStiffnessTension, calcSidewallPressure } from '../src/pullCalc.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function near(actual, expected, tolerance = 0.01, label = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(diff <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, got ${actual} (diff=${diff.toFixed(6)})`);
}

// ---------------------------------------------------------------------------
// calcSidewallPressure
// ---------------------------------------------------------------------------

{
  assert.equal(calcSidewallPressure(0, 500), 0, 'zero radius → 0');
  near(calcSidewallPressure(3, 300), 100, 0.001, 'sidewall pressure 300/3');
}

// ---------------------------------------------------------------------------
// calcStiffnessTension
// ---------------------------------------------------------------------------

{
  // Zero inputs → 0
  assert.equal(calcStiffnessTension(0, 1, 'cu', Math.PI / 2, 3), 0, 'zero kcmil → 0');
  assert.equal(calcStiffnessTension(500, 0, 'cu', Math.PI / 2, 3), 0, 'zero OD → 0');
  assert.equal(calcStiffnessTension(500, 1, 'cu', Math.PI / 2, 0), 0, 'zero radius → 0');

  // 500 kcmil Cu, 1.1 in OD, 90° bend, 3 ft radius
  // E_cu = 17,500,000 psi × 144 = 2,520,000,000 lb/ft²
  // A = 500 × 0.000785398 / 144 = 0.002727 ft²
  // d = 1.1/12 = 0.09167 ft
  // I = 0.002727 × (0.09167/4)² × 0.1 = 0.002727 × 0.000524 × 0.1 = 1.429e-7 ft⁴
  // EI = 2.52e9 × 1.429e-7 = 360.1 lb·ft²
  // ΔT = 360.1 × (π/2) / 9 = 360.1 × 0.1745 = 62.9 lbf
  const dT500cu = calcStiffnessTension(500, 1.1, 'cu', Math.PI / 2, 3);
  near(dT500cu, 63, 5, '500 kcmil Cu 90° @3ft stiffness ≈63 lbf');

  // Same with Al: E_al = 10,150,000 psi → lower by ratio 10.15/17.5 = 0.58
  const dT500al = calcStiffnessTension(500, 1.1, 'al', Math.PI / 2, 3);
  near(dT500al, dT500cu * (10150000 / 17500000), 5, '500 kcmil Al stiffness scales with E');
  assert.ok(dT500al < dT500cu, 'Al stiffness < Cu stiffness');

  // Small cable (1/0 AWG ≈ 105 kcmil, 0.425 in OD) should be much smaller
  const dTSmall = calcStiffnessTension(105, 0.425, 'cu', Math.PI / 2, 3);
  assert.ok(dTSmall < 5, `Small cable stiffness should be <5 lbs, got ${dTSmall.toFixed(3)}`);
}

// ---------------------------------------------------------------------------
// calcPullTension — baseline (no new params → same as original capstan model)
// ---------------------------------------------------------------------------

{
  // Empty route
  const r = calcPullTension([], { weight: 5, mu: 0.35 });
  assert.equal(r.totalTension, 0);
  assert.equal(r.maxTension, 0);
  assert.equal(r.staticFrictionApplied, false);
  assert.equal(r.stiffnessCorrectionLbs, 0);
}

{
  // Single straight segment, T = weight × mu × length = 10 × 0.35 × 100 = 350
  const segs = [{ type: 'straight', length: 100 }];
  const r = calcPullTension(segs, { weight: 10, mu: 0.35 });
  near(r.totalTension, 350, 0.001, 'straight tension');
  assert.equal(r.stiffnessCorrectionLbs, 0);
}

{
  // Single 90° bend, no weight, no stiffness → pure capstan
  // T = 0 * exp(0.35 * π/2)  = 0 (starting tension is 0, capstan multiplies by e^(mu*θ))
  // But wait — if starting tension is 0, capstan = 0 × e^(...) = 0
  // That's correct: a zero-weight cable with no initial tension has zero pull tension.
  // Let's test with a straight segment before the bend to create non-zero tension first.
  const segs = [
    { type: 'straight', length: 100 },  // T = 10 × 0.35 × 100 = 350
    { type: 'bend', angle: Math.PI / 2, length: 0, radius: 3 },  // T *= e^(0.35*π/2)
  ];
  const r = calcPullTension(segs, { weight: 10, mu: 0.35 });
  const expectedAfterBend = 350 * Math.exp(0.35 * Math.PI / 2);
  near(r.totalTension, expectedAfterBend, 0.01, 'capstan after straight');
}

// ---------------------------------------------------------------------------
// calcPullTension — temperature-dependent friction
// ---------------------------------------------------------------------------

{
  // 50°C PVC → muAdj = 0.35 × (1 + 0.005 × 20) = 0.35 × 1.1 = 0.385
  const segs = [{ type: 'straight', length: 100 }];
  const r = calcPullTension(segs, { weight: 10, mu: 0.35, ambientTempC: 50, jacketMaterial: 'PVC' });
  near(r.effectiveMu, 0.385, 0.0001, 'warm PVC mu');
  near(r.tempFrictionFactor, 1.1, 0.0001, 'warm PVC factor');
  near(r.totalTension, 10 * 0.385 * 100, 0.01, 'warm PVC tension');
}

{
  // 10°C PVC → muAdj = 0.35 × (1 + 0.005 × (10-30)) = 0.35 × 0.9 = 0.315
  const segs = [{ type: 'straight', length: 100 }];
  const r = calcPullTension(segs, { weight: 10, mu: 0.35, ambientTempC: 10, jacketMaterial: 'PVC' });
  near(r.effectiveMu, 0.315, 0.0001, 'cold PVC mu');
  near(r.tempFrictionFactor, 0.9, 0.0001, 'cold PVC factor');
}

{
  // XLPE less sensitive than PVC at same temperature delta
  const segs = [{ type: 'straight', length: 100 }];
  const mu = 0.35;
  const rPVC  = calcPullTension(segs, { weight: 10, mu, ambientTempC: 50, jacketMaterial: 'PVC'  });
  const rXLPE = calcPullTension(segs, { weight: 10, mu, ambientTempC: 50, jacketMaterial: 'XLPE' });
  // XLPE alpha=0.003 < PVC alpha=0.005, so XLPE correction is smaller
  assert.ok(rXLPE.effectiveMu < rPVC.effectiveMu,
    `XLPE (${rXLPE.effectiveMu}) should be less than PVC (${rPVC.effectiveMu}) at 50°C`);
}

{
  // At 30°C reference → no correction, effectiveMu = mu
  const segs = [{ type: 'straight', length: 50 }];
  const r = calcPullTension(segs, { weight: 5, mu: 0.35, ambientTempC: 30, jacketMaterial: 'PVC' });
  near(r.effectiveMu, 0.35, 0.0001, '30°C reference = no correction');
  near(r.tempFrictionFactor, 1.0, 0.0001, '30°C factor = 1');
}

// ---------------------------------------------------------------------------
// calcPullTension — static friction on first segment
// ---------------------------------------------------------------------------

{
  // isInitialPull=true → first segment uses mu × 1.35
  const segs = [
    { type: 'straight', length: 100 },
    { type: 'straight', length: 100 },
  ];
  const mu = 0.35;
  const rDynamic = calcPullTension(segs, { weight: 10, mu });
  const rStatic  = calcPullTension(segs, { weight: 10, mu, isInitialPull: true });

  // Static pull should be higher
  assert.ok(rStatic.totalTension > rDynamic.totalTension,
    'static pull tension > dynamic');
  assert.equal(rStatic.staticFrictionApplied, true);
  assert.equal(rDynamic.staticFrictionApplied, false);

  // First segment static: 10 × (0.35×1.35) × 100 = 472.5
  // Second segment dynamic: 472.5 + 10 × 0.35 × 100 = 472.5 + 350 = 822.5
  near(rStatic.totalTension, 10 * (mu * 1.35) * 100 + 10 * mu * 100, 0.01,
    'static first segment then dynamic');
}

// ---------------------------------------------------------------------------
// calcPullTension — bending stiffness
// ---------------------------------------------------------------------------

{
  // 500 kcmil Cu, 1.1 in OD, two 90° bends at 3 ft radius
  // Stiffness per bend ≈ 63 lbf, two bends ≈ 126 lbf
  const segs = [
    { type: 'straight', length: 50 },
    { type: 'bend', angle: Math.PI / 2, length: 4.7, radius: 3 },
    { type: 'straight', length: 50 },
    { type: 'bend', angle: Math.PI / 2, length: 4.7, radius: 3 },
  ];
  const propsNoStiff = { weight: 5, mu: 0.35 };
  const propsStiff   = { weight: 5, mu: 0.35, sizeKcmil: 500, outerDiameterIn: 1.1, conductorMaterial: 'cu' };
  const rNoStiff = calcPullTension(segs, propsNoStiff);
  const rStiff   = calcPullTension(segs, propsStiff);

  assert.ok(rStiff.totalTension > rNoStiff.totalTension, 'stiffness increases total tension');
  assert.ok(rStiff.stiffnessCorrectionLbs > 50, `stiffness correction >50 lbs, got ${rStiff.stiffnessCorrectionLbs}`);
}

// ---------------------------------------------------------------------------
// calcPullTension — backward compatibility (no new props → identical result)
// ---------------------------------------------------------------------------

{
  const segs = [
    { type: 'straight', length: 200 },
    { type: 'bend', angle: Math.PI / 2, length: 4.7, radius: 3 },
    { type: 'straight', length: 100 },
  ];
  const props = { weight: 8, coeffFriction: 0.4, maxTension: 2000 };

  const r = calcPullTension(segs, props);

  // Manual calculation (original capstan only):
  // seg1: T = 8×0.4×200 = 640
  // seg2: T = 640 + 8×0.4×4.7 = 640+15.04 = 655.04; T *= e^(0.4×π/2) = 655.04×1.874 = 1227.4
  // seg3: T = 1227.4 + 8×0.4×100 = 1227.4+320 = 1547.4
  near(r.totalTension, 1547, 2, 'backward compat: total tension');
  assert.equal(r.allowableTension, 2000, 'backward compat: allowable tension');
  near(r.effectiveMu, 0.4, 0.0001, 'backward compat: effectiveMu = mu at 30°C XLPE');
  assert.equal(r.stiffnessCorrectionLbs, 0, 'backward compat: no stiffness when not specified');
  assert.equal(r.staticFrictionApplied, false, 'backward compat: no static friction');
}

// ---------------------------------------------------------------------------
// calcPullTension — combined all factors
// ---------------------------------------------------------------------------

{
  // Warm PVC + large cable stiffness + initial static friction
  const segs = [
    { type: 'straight', length: 100 },
    { type: 'bend', angle: Math.PI / 2, length: 4.7, radius: 3 },
  ];
  const props = {
    weight: 8, mu: 0.35,
    ambientTempC: 45, jacketMaterial: 'PVC',
    sizeKcmil: 500, outerDiameterIn: 1.1, conductorMaterial: 'cu',
    isInitialPull: true,
  };
  const r = calcPullTension(segs, props);

  // All three factors active
  assert.ok(r.tempFrictionFactor > 1.0, 'temperature factor > 1 at 45°C');
  assert.ok(r.stiffnessCorrectionLbs > 0, 'stiffness correction active');
  assert.equal(r.staticFrictionApplied, true, 'static friction applied');
  // Total should be significantly higher than plain capstan
  const rBaseline = calcPullTension(segs, { weight: 8, mu: 0.35 });
  assert.ok(r.totalTension > rBaseline.totalTension, 'combined factors raise total tension');
}

console.log('pullCalc tests passed');

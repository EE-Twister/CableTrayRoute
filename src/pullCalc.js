// ---------------------------------------------------------------------------
// Jacket-material temperature-friction correction coefficients (per °C from 30 °C)
// Source: Southwire Cable Installation Manual; AEIC CG5
// ---------------------------------------------------------------------------
const JACKET_TEMP_ALPHA = { PVC: 0.005, XLPE: 0.003 };

// Young's modulus for conductor materials (psi)
const CONDUCTOR_E_PSI = { cu: 17_500_000, al: 10_150_000 };

// Static-to-kinetic friction ratio at pull start (AEIC CG5 §4.3)
const STATIC_FRICTION_FACTOR = 1.35;

/**
 * Calculate the bending stiffness tension increment for a single bend segment.
 *
 * Model: ΔT_stiff (lbf) = EI (lb·ft²) × θ (rad) / R² (ft²)
 * EI ≈ E_conductor × A_conductor × (d_outer / 4)² × 0.1
 * The 0.1 empirical factor accounts for stranded-cable compliance
 * (Southwire Cable Installation Manual, 4th ed., Section 3.2).
 *
 * Units check: [lb/ft²] × [ft²] × [ft²] × [ft²] / [ft²] = lb = lbf ✓
 *
 * @param {number} sizeKcmil      - conductor size in kcmil
 * @param {number} outerDiameterIn - cable outer diameter in inches
 * @param {string} conductorMaterial - 'cu' | 'al'
 * @param {number} angleRad       - bend angle in radians
 * @param {number} radiusFt       - bend radius in feet
 * @returns {number} additional tension in lbf (0 if inputs are zero/invalid)
 */
export function calcStiffnessTension(sizeKcmil, outerDiameterIn, conductorMaterial, angleRad, radiusFt) {
  if (!sizeKcmil || !outerDiameterIn || !radiusFt) return 0;
  const ePsi = CONDUCTOR_E_PSI[conductorMaterial] ?? CONDUCTOR_E_PSI.cu;
  const eLbFt2 = ePsi * 144;                               // psi → lb/ft²
  const aFt2   = (sizeKcmil * 0.000785398) / 144;          // kcmil → in² → ft²
  const dFt    = outerDiameterIn / 12;                     // in → ft
  const iFt4   = aFt2 * Math.pow(dFt / 4, 2) * 0.1;       // empirical stranded factor
  const EI     = eLbFt2 * iFt4;                            // lb·ft²
  return EI * angleRad / (radiusFt * radiusFt);            // lbf
}

export function calcSidewallPressure(bendRadius, tension) {
  if (!bendRadius) return 0;
  return tension / bendRadius;
}

/**
 * Calculate pull tension along a cable route using the exponential capstan
 * friction model, extended with three additional corrections:
 *
 *   1. Temperature-dependent friction — jacket stiffness increases friction
 *      at temperatures below the 30 °C reference (PVC more sensitive than XLPE).
 *   2. Static-to-kinetic friction transition — at pull start, static friction
 *      is ~35% higher than kinetic friction (applied to the first segment only).
 *   3. Conductor bending stiffness — large cables resist conforming to bends,
 *      adding tension at each corner proportional to EI/R².
 *
 * All three new parameters are optional; omitting them reproduces the original
 * capstan-only result exactly.
 *
 * @param {Array}  routeSegments - array of {type, length, angle?, radius?} objects
 * @param {Object} cableProps
 * @param {number}  [cableProps.mu]               - friction coefficient (alias: coeffFriction, default 0.35)
 * @param {number}  [cableProps.weight]            - cable weight in lb/ft (default 0)
 * @param {number}  [cableProps.maxTension]        - allowable tension in lbs
 * @param {number}  [cableProps.maxSidewallPressure] - allowable sidewall pressure
 * @param {string}  [cableProps.conductorMaterial] - 'cu' | 'al' (default 'cu')
 * @param {string}  [cableProps.jacketMaterial]    - 'PVC' | 'XLPE' (default 'XLPE')
 * @param {number}  [cableProps.ambientTempC]      - ambient temperature °C (default 30 = no correction)
 * @param {number}  [cableProps.sizeKcmil]         - conductor size in kcmil (default 0 = no stiffness)
 * @param {number}  [cableProps.outerDiameterIn]   - cable OD in inches (default 0 = no stiffness)
 * @param {boolean} [cableProps.isInitialPull]     - true = apply static friction on first segment
 * @returns {Object} tension results plus diagnostic fields
 */
export function calcPullTension(routeSegments = [], cableProps = {}) {
  const mu                = cableProps.coeffFriction ?? cableProps.mu ?? 0.35;
  const weight            = cableProps.weight ?? 0;
  const conductorMaterial = cableProps.conductorMaterial ?? 'cu';
  const jacketMaterial    = cableProps.jacketMaterial    ?? 'XLPE';
  const ambientTempC      = cableProps.ambientTempC      ?? 30;
  const sizeKcmil         = cableProps.sizeKcmil         ?? 0;
  const outerDiameterIn   = cableProps.outerDiameterIn   ?? 0;
  const isInitialPull     = cableProps.isInitialPull     ?? false;

  // --- Temperature-dependent friction ---
  const alpha  = JACKET_TEMP_ALPHA[jacketMaterial] ?? 0.004;
  const muAdj  = Math.min(2.0 * mu, Math.max(0.5 * mu,
    mu * (1 + alpha * (ambientTempC - 30))
  ));

  let tension       = 0;
  let maxTension    = 0;
  let maxSidewall   = 0;
  let stiffnessLbs  = 0;
  let staticApplied = false;
  let firstSegment  = true;

  for (const seg of routeSegments) {
    if (!seg) continue;

    // Effective friction for this segment
    const muEff = (isInitialPull && firstSegment)
      ? muAdj * STATIC_FRICTION_FACTOR
      : muAdj;
    if (firstSegment) {
      if (isInitialPull) staticApplied = true;
      firstSegment = false;
    }

    if (seg.type === 'bend') {
      const angle  = seg.angle  || 0;
      const radius = seg.radius || 1;

      // Straight friction along the arc length
      tension += weight * muEff * (seg.length || 0);

      // Capstan exponential
      tension *= Math.exp(muEff * angle);

      // Stiffness correction
      const dT = calcStiffnessTension(sizeKcmil, outerDiameterIn, conductorMaterial, angle, radius);
      tension    += dT;
      stiffnessLbs += dT;

      const swp = calcSidewallPressure(radius, tension);
      if (swp > maxSidewall) maxSidewall = swp;
    } else {
      tension += weight * muEff * (seg.length || 0);
    }

    if (tension > maxTension) maxTension = tension;
  }

  return {
    totalTension:              tension,
    maxTension,
    maxSidewallPressure:       maxSidewall,
    allowableTension:
      cableProps.maxTension ??
      cableProps.allowableTension ??
      cableProps.max_tension ??
      Infinity,
    allowableSidewallPressure:
      cableProps.maxSidewallPressure ??
      cableProps.allowableSidewallPressure ??
      cableProps.max_sidewall_pressure ??
      Infinity,
    // Diagnostics
    effectiveMu:            muAdj,
    tempFrictionFactor:     mu > 0 ? Math.round((muAdj / mu) * 10000) / 10000 : 1,
    stiffnessCorrectionLbs: Math.round(stiffnessLbs * 100) / 100,
    staticFrictionApplied:  staticApplied,
  };
}

if (typeof self !== 'undefined') {
  self.calcPullTension       = calcPullTension;
  self.calcSidewallPressure  = calcSidewallPressure;
  self.calcStiffnessTension  = calcStiffnessTension;
}

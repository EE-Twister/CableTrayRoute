/**
 * ASCE 7-22 Section 2.3 LRFD Load Combinations for Cable Tray Support Structures
 *
 * Computes factored load combinations and identifies the controlling (envelope)
 * case for cable tray structural support design.
 *
 * Applicable combinations for cable tray (no live load L, no roof live load Lr,
 * no rain load R — per ASCE 7-22 §2.3.2):
 *
 *   LC-W1:  1.2D + 1.6W             Wind dominant
 *   LC-W2:  0.9D + 1.0W             Wind + minimum gravity
 *   LC-S1:  1.2D + 1.0E + 0.2S     Seismic + snow (vertical E_v included in E)
 *   LC-S2:  0.9D + 1.0E             Seismic + minimum gravity (E_v included)
 *
 * where:
 *   D  = dead load (tray self-weight + cable weight), lbs/ft — always downward
 *   W  = wind lateral force per linear foot, lbs/ft
 *        (from windLoad.calcWindForce → windForce_per_ft)
 *   E  = seismic force, resolved into lateral (E_lat) and vertical (E_v) components
 *        (from seismicBracing.calcBraceForces → lateralForce, verticalForce)
 *   S  = snow load per linear foot of tray, lbs/ft
 *
 * The seismic vertical force (E_v = ±0.2 × SDS × D per ASCE 7-22 §12.4.2) is
 * passed in as the magnitude already computed by seismicBracing.mjs (verticalForce).
 * It is added additively to the gravity term because the load combination already
 * incorporates the critical sign (additive for LC-S1/S2 worst case).
 *
 * References:
 *   ASCE 7-22 — Minimum Design Loads, §2.3.2 (LRFD combinations)
 *   ASCE 7-22 — §12.4.2 (seismic load effect E definition)
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** LRFD load factors per ASCE 7-22 §2.3.2. */
const FACTORS = {
  LC_W1: { D: 1.2, W: 1.6 },
  LC_W2: { D: 0.9, W: 1.0 },
  LC_S1: { D: 1.2, E: 1.0, S: 0.2 },
  LC_S2: { D: 0.9, E: 1.0 },
};

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/**
 * @param {object} inputs
 * @param {number} inputs.D_lbs_ft      Dead load (lbs/ft), required > 0
 * @param {number} [inputs.E_lat_lbs_ft=0]  Seismic lateral force (lbs/ft)
 * @param {number} [inputs.E_v_lbs_ft=0]    Seismic vertical force (lbs/ft, magnitude)
 * @param {number} [inputs.W_lbs_ft=0]      Wind lateral force (lbs/ft)
 * @param {number} [inputs.S_lbs_ft=0]      Snow load (lbs/ft)
 */
function validateInputs(inputs) {
  const { D_lbs_ft, E_lat_lbs_ft = 0, E_v_lbs_ft = 0, W_lbs_ft = 0, S_lbs_ft = 0 } = inputs;

  if (!Number.isFinite(D_lbs_ft) || D_lbs_ft <= 0) {
    throw new Error('D_lbs_ft (dead load) must be a positive number (lbs/ft)');
  }
  if (!Number.isFinite(E_lat_lbs_ft)) {
    throw new Error('E_lat_lbs_ft must be a finite number');
  }
  if (!Number.isFinite(E_v_lbs_ft)) {
    throw new Error('E_v_lbs_ft must be a finite number');
  }
  if (!Number.isFinite(W_lbs_ft)) {
    throw new Error('W_lbs_ft must be a finite number');
  }
  if (!Number.isFinite(S_lbs_ft) || S_lbs_ft < 0) {
    throw new Error('S_lbs_ft (snow load) must be a non-negative number');
  }
}

// ---------------------------------------------------------------------------
// Core combination calculator
// ---------------------------------------------------------------------------

/**
 * Compute the four ASCE 7-22 §2.3.2 LRFD load combinations for cable tray.
 *
 * @param {object} inputs
 * @param {number} inputs.D_lbs_ft          Dead load per linear foot (lbs/ft), required > 0
 * @param {number} [inputs.E_lat_lbs_ft=0]  Seismic lateral force (lbs/ft) — from
 *   seismicBracing.calcBraceForces().lateralForce
 * @param {number} [inputs.E_v_lbs_ft=0]    Seismic vertical force (lbs/ft, magnitude) — from
 *   seismicBracing.calcBraceForces().verticalForce
 * @param {number} [inputs.W_lbs_ft=0]      Wind lateral force (lbs/ft) — from
 *   windLoad.calcWindForce().windForce_per_ft
 * @param {number} [inputs.S_lbs_ft=0]      Snow load per linear foot of tray (lbs/ft).
 *   = ground snow load × tray width × Ce × Ct × Cs × I_s. Use 0 for indoor/warm sites.
 * @returns {{
 *   LC_W1: CombinationResult,
 *   LC_W2: CombinationResult,
 *   LC_S1: CombinationResult,
 *   LC_S2: CombinationResult,
 * }}
 *
 * @typedef {object} CombinationResult
 * @property {string}  id                  Identifier: 'LC-W1' | 'LC-W2' | 'LC-S1' | 'LC-S2'
 * @property {string}  label               Human-readable name
 * @property {string}  formula             Literal combination formula string
 * @property {number}  vertical_lbs_ft     Net factored vertical force (lbs/ft, downward positive)
 * @property {number}  horizontal_lbs_ft   Net factored horizontal force (lbs/ft)
 * @property {number}  resultant_lbs_ft    √(vertical² + horizontal²)
 * @property {boolean} applicable          false when key lateral load (W or E) is zero
 * @property {object}  nec                 Code citation
 * @property {string}  nec.rule
 * @property {string}  nec.description
 */
export function calcLoadCombinations(inputs) {
  validateInputs(inputs);

  const D   = inputs.D_lbs_ft;
  const E_l = inputs.E_lat_lbs_ft ?? 0;
  const E_v = inputs.E_v_lbs_ft   ?? 0;
  const W   = inputs.W_lbs_ft     ?? 0;
  const S   = inputs.S_lbs_ft     ?? 0;

  const windApplicable    = W > 0;
  const seismicApplicable = E_l > 0 || E_v > 0;

  function round2(v) { return Math.round(v * 100) / 100; }
  function resultant(v, h) { return round2(Math.sqrt(v * v + h * h)); }

  // LC-W1: 1.2D + 1.6W
  const w1_v = round2(FACTORS.LC_W1.D * D);
  const w1_h = round2(FACTORS.LC_W1.W * W);
  const LC_W1 = {
    id:               'LC-W1',
    label:            'Wind Governing (1.2D + 1.6W)',
    formula:          '1.2D + 1.6W',
    vertical_lbs_ft:  w1_v,
    horizontal_lbs_ft: w1_h,
    resultant_lbs_ft: resultant(w1_v, w1_h),
    applicable:       windApplicable,
    nec: {
      rule:        'ASCE 7-22 Section 2.3.2',
      description: 'LRFD combination with wind as the dominant lateral load. ' +
                   'Factored dead load 1.2D plus factored wind 1.6W.',
    },
  };

  // LC-W2: 0.9D + 1.0W
  const w2_v = round2(FACTORS.LC_W2.D * D);
  const w2_h = round2(FACTORS.LC_W2.W * W);
  const LC_W2 = {
    id:               'LC-W2',
    label:            'Wind + Minimum Gravity (0.9D + 1.0W)',
    formula:          '0.9D + 1.0W',
    vertical_lbs_ft:  w2_v,
    horizontal_lbs_ft: w2_h,
    resultant_lbs_ft: resultant(w2_v, w2_h),
    applicable:       windApplicable,
    nec: {
      rule:        'ASCE 7-22 Section 2.3.2',
      description: 'LRFD combination with minimum gravity and wind. ' +
                   'Minimum factored dead 0.9D plus unfactored wind 1.0W.',
    },
  };

  // LC-S1: 1.2D + 1.0E + 0.2S
  // Vertical: 1.2D + E_v (seismic vertical additive) + 0.2S
  // Horizontal: 1.0 × E_lat
  const s1_v = round2(FACTORS.LC_S1.D * D + FACTORS.LC_S1.E * E_v + FACTORS.LC_S1.S * S);
  const s1_h = round2(FACTORS.LC_S1.E * E_l);
  const LC_S1 = {
    id:               'LC-S1',
    label:            'Seismic + Snow (1.2D + 1.0E + 0.2S)',
    formula:          '1.2D + 1.0E + 0.2S',
    vertical_lbs_ft:  s1_v,
    horizontal_lbs_ft: s1_h,
    resultant_lbs_ft: resultant(s1_v, s1_h),
    applicable:       seismicApplicable,
    nec: {
      rule:        'ASCE 7-22 Section 2.3.2',
      description: 'LRFD combination with seismic as dominant lateral load plus snow. ' +
                   '1.2D + seismic (lateral + vertical) + 0.2S.',
    },
  };

  // LC-S2: 0.9D + 1.0E
  // Vertical: 0.9D + E_v
  // Horizontal: 1.0 × E_lat
  const s2_v = round2(FACTORS.LC_S2.D * D + FACTORS.LC_S2.E * E_v);
  const s2_h = round2(FACTORS.LC_S2.E * E_l);
  const LC_S2 = {
    id:               'LC-S2',
    label:            'Seismic + Minimum Gravity (0.9D + 1.0E)',
    formula:          '0.9D + 1.0E',
    vertical_lbs_ft:  s2_v,
    horizontal_lbs_ft: s2_h,
    resultant_lbs_ft: resultant(s2_v, s2_h),
    applicable:       seismicApplicable,
    nec: {
      rule:        'ASCE 7-22 Section 2.3.2',
      description: 'LRFD combination with minimum gravity and seismic. ' +
                   'Minimum factored dead 0.9D plus seismic (lateral + vertical).',
    },
  };

  return { LC_W1, LC_W2, LC_S1, LC_S2 };
}

// ---------------------------------------------------------------------------
// Envelope (controlling combination)
// ---------------------------------------------------------------------------

/**
 * Identify the controlling (envelope) load combination by maximum resultant force.
 *
 * Only applicable combinations are considered. Returns null if no combination is
 * applicable (all lateral loads are zero).
 *
 * @param {{ LC_W1: CombinationResult, LC_W2: CombinationResult, LC_S1: CombinationResult, LC_S2: CombinationResult }} combinations
 * @returns {{
 *   controllingId:           string,
 *   controllingLabel:        string,
 *   maxResultant_lbs_ft:     number,
 *   maxVertical_lbs_ft:      number,
 *   maxHorizontal_lbs_ft:    number,
 *   recommendation:          string,
 * } | null}
 */
export function findControllingCombination(combinations) {
  const all = [
    combinations.LC_W1,
    combinations.LC_W2,
    combinations.LC_S1,
    combinations.LC_S2,
  ];

  const applicable = all.filter(c => c.applicable);
  if (!applicable.length) return null;

  const controlling = applicable.reduce((best, c) =>
    c.resultant_lbs_ft > best.resultant_lbs_ft ? c : best
  );

  // Envelope vertical and horizontal across all applicable combinations
  const maxVertical   = Math.max(...applicable.map(c => c.vertical_lbs_ft));
  const maxHorizontal = Math.max(...applicable.map(c => c.horizontal_lbs_ft));

  return {
    controllingId:        controlling.id,
    controllingLabel:     controlling.label,
    maxResultant_lbs_ft:  controlling.resultant_lbs_ft,
    maxVertical_lbs_ft:   Math.round(maxVertical * 100) / 100,
    maxHorizontal_lbs_ft: Math.round(maxHorizontal * 100) / 100,
    recommendation:
      `Controlling combination: ${controlling.id} — ${controlling.label}. ` +
      `Design resultant = ${controlling.resultant_lbs_ft.toFixed(2)} lbs/ft ` +
      `(vertical = ${controlling.vertical_lbs_ft.toFixed(2)} lbs/ft, ` +
      `horizontal = ${controlling.horizontal_lbs_ft.toFixed(2)} lbs/ft). ` +
      `Envelope: max vertical = ${maxVertical.toFixed(2)} lbs/ft, ` +
      `max horizontal = ${maxHorizontal.toFixed(2)} lbs/ft. ` +
      `Per ASCE 7-22 §2.3.2.`,
  };
}

// ---------------------------------------------------------------------------
// Convenience wrapper
// ---------------------------------------------------------------------------

/**
 * Compute load combinations and identify the controlling (envelope) case in one call.
 *
 * @param {object} inputs  See calcLoadCombinations for full parameter description.
 * @returns {{ combinations: ReturnType<calcLoadCombinations>, envelope: ReturnType<findControllingCombination> }}
 */
export function evaluateLoadCombinations(inputs) {
  const combinations = calcLoadCombinations(inputs);
  const envelope     = findControllingCombination(combinations);
  return { combinations, envelope };
}

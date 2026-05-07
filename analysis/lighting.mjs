/**
 * Photometric / Egress & Emergency Lighting Calculator — Gap #95
 *
 * Pure calculation helpers for room illuminance (lumen method),
 * IES LM-63 photometric file parsing, point-by-point workplane grid,
 * and NFPA 101 §7.9.2 egress compliance checks.
 *
 * Standards:
 *   IES LM-63-2019   Standard File Format for Electronic Transfer of Photometric Data
 *   IES HB-10-11     IES Lighting Handbook 10th Edition — lumen method (§9)
 *   NFPA 101-2021    Life Safety Code §7.9.2.1 — emergency egress illuminance
 *                    avg ≥ 1 fc, min ≥ 0.1 fc on the path of egress
 *   NEC 700/701      Emergency / Legally Required Standby Systems
 *
 * Photometric type C (the IES standard for indoor luminaires) is assumed
 * throughout. The cosine-cube point-by-point method assumes a horizontal
 * workplane and a down-light luminaire (nadir = straight down).
 *
 * Ampacity data source: CU table values are representative of a generic
 * efficient direct-component LED troffer/panel luminaire. Final designs
 * should use the CU table from the manufacturer's IES photometric file.
 */

// ---------------------------------------------------------------------------
// Coefficient of Utilisation (CU) — generic LED troffer/panel
// ---------------------------------------------------------------------------

/**
 * Reflectance combination presets mapped to CU table column index.
 * ceiling / wall reflectance (floor assumed 20%).
 *   0 → High   (cc=80%, w=70%)
 *   1 → Medium (cc=70%, w=50%)
 *   2 → Low    (cc=50%, w=30%)
 */
export const CU_REFLECTANCE_PRESETS = Object.freeze([
  { label: 'High (80/70)',   ceilingMin: 75, wallMin: 60, col: 0 },
  { label: 'Medium (70/50)', ceilingMin: 60, wallMin: 40, col: 1 },
  { label: 'Low (50/30)',    ceilingMin:  0, wallMin:  0, col: 2 },
]);

/**
 * Generic CU table for a direct-component LED troffer/panel (typical efficient
 * category, BF=1.0).  Rows = RCR 0–10; columns = reflectance preset 0/1/2.
 * Source: representative data based on published manufacturer IES CU tables
 * for commercial LED ceiling fixtures (2×4 ft troffer, diffuse lens).
 */
export const GENERIC_CU_TABLE = Object.freeze([
  // RCR  High   Med   Low
  /*  0 */ [1.19, 1.09, 0.98],
  /*  1 */ [1.01, 0.92, 0.83],
  /*  2 */ [0.87, 0.79, 0.71],
  /*  3 */ [0.76, 0.69, 0.62],
  /*  4 */ [0.67, 0.61, 0.55],
  /*  5 */ [0.59, 0.54, 0.49],
  /*  6 */ [0.53, 0.48, 0.44],
  /*  7 */ [0.47, 0.43, 0.39],
  /*  8 */ [0.43, 0.40, 0.36],
  /*  9 */ [0.39, 0.36, 0.33],
  /* 10 */ [0.35, 0.33, 0.30],
]);

// ---------------------------------------------------------------------------
// NFPA 101 egress thresholds
// ---------------------------------------------------------------------------

/** NFPA 101-2021 §7.9.2.1 — average illuminance threshold on egress path. */
export const NFPA_EGRESS_AVG_FC  = 1.0;
/** NFPA 101-2021 §7.9.2.1 — minimum illuminance threshold on egress path. */
export const NFPA_EGRESS_MIN_FC  = 0.1;

// ---------------------------------------------------------------------------
// IES LM-63 photometric file parser
// ---------------------------------------------------------------------------

/**
 * Parse an ANSI/IES LM-63-2002/2019 photometric data file (ASCII format).
 *
 * Supports photometric type C (vertical angles 0–90° nadir hemisphere) with
 * TILT=NONE only.  The returned `candelaSets` array has one entry per
 * horizontal angle: each entry is a Float32Array of candela values indexed
 * in step with `vertAngles`.
 *
 * @param {string} text  Full text content of the .ies file.
 * @returns {{ totalLumens: number, numLamps: number, lumensPerLamp: number,
 *             ballastFactor: number, inputWatts: number, photType: number,
 *             vertAngles: number[], horizAngles: number[],
 *             candelaSets: Float32Array[] }}
 */
export function parseIES(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Find TILT= line
  let tiltIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().toUpperCase().startsWith('TILT=')) {
      tiltIdx = i;
      break;
    }
  }
  if (tiltIdx < 0) throw new Error('IES file missing TILT= line');

  const tiltValue = lines[tiltIdx].trim().slice(5).trim().toUpperCase();
  if (tiltValue !== 'NONE') {
    throw new Error(`IES TILT=${tiltValue} is not supported; only TILT=NONE is handled`);
  }

  // Collect all numeric tokens after TILT= line
  const tokens = [];
  for (let i = tiltIdx + 1; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    for (const p of parts) {
      if (p) tokens.push(p);
    }
  }

  if (tokens.length < 13) throw new Error('IES file truncated: insufficient data after TILT=');

  let idx = 0;
  const nextNum = (label) => {
    const v = parseFloat(tokens[idx++]);
    if (!isFinite(v)) throw new Error(`IES parse error at token ${idx}: expected number for ${label}`);
    return v;
  };

  // Line 1: lamp/photometric description
  const numLamps    = Math.round(nextNum('numLamps'));
  const lumensPerLamp = nextNum('lumensPerLamp');
  const candMult    = nextNum('candeleMult');
  const nVert       = Math.round(nextNum('nVertAngles'));
  const nHoriz      = Math.round(nextNum('nHorizAngles'));
  const photType    = Math.round(nextNum('photType'));   // 1=C, 2=B, 3=A
  nextNum('unitsType');   // 1=feet, 2=meters — ignored
  nextNum('width');
  nextNum('length');
  nextNum('height');

  // Line 2: electrical
  const ballastFactor = nextNum('ballastFactor');
  nextNum('photLampFactor');
  const inputWatts = nextNum('inputWatts');

  if (nVert < 1 || nHoriz < 1) throw new Error('IES: nVert and nHoriz must be ≥ 1');

  const vertAngles = [];
  for (let i = 0; i < nVert; i++) vertAngles.push(nextNum(`vertAngle[${i}]`));

  const horizAngles = [];
  for (let i = 0; i < nHoriz; i++) horizAngles.push(nextNum(`horizAngle[${i}]`));

  // candelaSets[j] → candela array for horizAngles[j]
  const candelaSets = [];
  for (let j = 0; j < nHoriz; j++) {
    const row = new Float32Array(nVert);
    for (let i = 0; i < nVert; i++) {
      row[i] = nextNum(`cd[${j}][${i}]`) * candMult;
    }
    candelaSets.push(row);
  }

  return {
    totalLumens: numLamps * lumensPerLamp * ballastFactor,
    numLamps,
    lumensPerLamp,
    ballastFactor,
    inputWatts,
    photType,
    vertAngles,
    horizAngles,
    candelaSets,
  };
}

// ---------------------------------------------------------------------------
// Lumen method
// ---------------------------------------------------------------------------

/**
 * Room Cavity Ratio — IES Lighting Handbook 10th Ed. §9.
 *
 * RCR = 5 × H_c × (L + W) / (L × W)
 * where H_c = mounting height above workplane.
 *
 * @param {number} lengthFt
 * @param {number} widthFt
 * @param {number} mountingHeightFt  Height of fixture above floor.
 * @param {number} workplaneHeightFt Height of workplane above floor (typically 2.5 ft).
 * @returns {number}
 */
export function roomCavityRatio(lengthFt, widthFt, mountingHeightFt, workplaneHeightFt) {
  if (lengthFt <= 0) throw new Error('Room length must be > 0');
  if (widthFt <= 0) throw new Error('Room width must be > 0');
  if (mountingHeightFt <= workplaneHeightFt) {
    throw new Error('Mounting height must be above the workplane height');
  }
  const hc = mountingHeightFt - workplaneHeightFt;
  return 5 * hc * (lengthFt + widthFt) / (lengthFt * widthFt);
}

/**
 * Select the CU table column index for the given reflectances.
 * Snaps to the closest preset (High, Medium, Low).
 */
export function cuReflectanceColumn(ceilingReflPct, wallReflPct) {
  for (const preset of CU_REFLECTANCE_PRESETS) {
    if (ceilingReflPct >= preset.ceilingMin && wallReflPct >= preset.wallMin) {
      return preset.col;
    }
  }
  return 2; // Low
}

/**
 * Coefficient of Utilization via bilinear interpolation on the generic CU table.
 *
 * @param {number} rcr           Room cavity ratio (clamped to 0–10).
 * @param {number} ceilingReflPct  Ceiling reflectance percentage.
 * @param {number} wallReflPct     Wall reflectance percentage.
 * @returns {number}
 */
export function coefficientOfUtilization(rcr, ceilingReflPct, wallReflPct) {
  const col = cuReflectanceColumn(ceilingReflPct, wallReflPct);
  const rcrClamped = Math.max(0, Math.min(10, rcr));
  const rcrFloor = Math.floor(rcrClamped);
  if (rcrFloor >= 10) return GENERIC_CU_TABLE[10][col];
  const t = rcrClamped - rcrFloor;
  const cu0 = GENERIC_CU_TABLE[rcrFloor][col];
  const cu1 = GENERIC_CU_TABLE[rcrFloor + 1][col];
  return cu0 + t * (cu1 - cu0);
}

/**
 * Lumen method average illuminance in foot-candles.
 *
 * E_avg = (N × F × CU × LLF) / A
 *   N = number of fixtures
 *   F = lumens per fixture (initial rated)
 *   CU = coefficient of utilization
 *   LLF = light loss factor (maintained condition)
 *   A = room area (ft²)
 *
 * @param {number} numFixtures
 * @param {number} lumensPerFixture  Initial rated lumens (from manufacturer/IES).
 * @param {number} cu               Coefficient of utilization.
 * @param {number} llf              Light loss factor (0–1, default 0.80).
 * @param {number} roomAreaSqFt
 * @returns {number}  Average maintained illuminance in foot-candles.
 */
export function averageIlluminance(numFixtures, lumensPerFixture, cu, llf, roomAreaSqFt) {
  if (numFixtures <= 0) throw new Error('Number of fixtures must be > 0');
  if (lumensPerFixture <= 0) throw new Error('Lumens per fixture must be > 0');
  if (cu <= 0 || cu > 2) throw new Error('CU must be in range (0, 2]');
  if (llf <= 0 || llf > 1) throw new Error('LLF must be in range (0, 1]');
  if (roomAreaSqFt <= 0) throw new Error('Room area must be > 0');
  return (numFixtures * lumensPerFixture * cu * llf) / roomAreaSqFt;
}

// ---------------------------------------------------------------------------
// Point-by-point illuminance grid
// ---------------------------------------------------------------------------

/**
 * Interpolate candela value at a given vertical angle by linear interpolation.
 *
 * @param {number[]}       vertAngles  Sorted vertical angles in degrees.
 * @param {Float32Array|number[]} candelas  Candela values at each vertical angle.
 * @param {number}         thetaDeg    Target vertical angle in degrees.
 * @returns {number}  Candela value.
 */
export function interpolateCandela(vertAngles, candelas, thetaDeg) {
  const theta = Math.max(vertAngles[0], Math.min(vertAngles[vertAngles.length - 1], thetaDeg));
  for (let i = 0; i + 1 < vertAngles.length; i++) {
    if (theta <= vertAngles[i + 1]) {
      const t = (theta - vertAngles[i]) / (vertAngles[i + 1] - vertAngles[i]);
      return candelas[i] + t * (candelas[i + 1] - candelas[i]);
    }
  }
  return candelas[candelas.length - 1];
}

/**
 * Calculate a point-by-point illuminance grid on the horizontal workplane.
 *
 * Uses the cosine-cube (inverse-square) method:
 *   E = I(θ) × cos(θ) / D²  [fc]
 * where D = √(H² + d²), cos(θ) = H/D, d = horizontal distance to fixture.
 *
 * For multi-horizontal-angle IES files the phi=0 candela set is used (valid
 * for rotationally symmetric and bilateral-symmetric fixtures, which covers
 * the vast majority of indoor downlights, troffers, and linear panels).
 *
 * @param {{ x: number, y: number }[]} fixtures  Fixture positions in room (ft from origin corner).
 * @param {number}   mountingHeightFt   Fixture height above workplane (ft).
 * @param {number[]} vertAngles         Vertical angles from IES data (degrees, 0=nadir).
 * @param {Float32Array|number[]} candelas  Candela values at each vertAngle.
 * @param {number}   roomLengthFt
 * @param {number}   roomWidthFt
 * @param {{ rows?: number, cols?: number }} [options]  Grid resolution (default 10×10).
 * @returns {{ grid: Float32Array, rows: number, cols: number,
 *             minFc: number, maxFc: number, avgFc: number }}
 */
export function pointIlluminanceGrid(
  fixtures, mountingHeightFt, vertAngles, candelas,
  roomLengthFt, roomWidthFt,
  { rows = 10, cols = 10 } = {},
) {
  if (!fixtures || fixtures.length === 0) throw new Error('At least one fixture position required');
  if (mountingHeightFt <= 0) throw new Error('Mounting height must be > 0');

  const cellW = roomLengthFt / cols;
  const cellH = roomWidthFt  / rows;
  const H     = mountingHeightFt;
  const H2    = H * H;
  const grid  = new Float32Array(rows * cols);

  for (let r = 0; r < rows; r++) {
    const py = (r + 0.5) * cellH;
    for (let c = 0; c < cols; c++) {
      const px = (c + 0.5) * cellW;
      let E = 0;
      for (const fix of fixtures) {
        const dx    = px - fix.x;
        const dy    = py - fix.y;
        const d2    = dx * dx + dy * dy;
        const D2    = H2 + d2;
        const D     = Math.sqrt(D2);
        const cosT  = H / D;
        const thetaDeg = Math.atan2(Math.sqrt(d2), H) * 180 / Math.PI;
        const I     = interpolateCandela(vertAngles, candelas, thetaDeg);
        // E = I × cos(θ) / D²  [fc when I in cd, D in ft]
        E += I * cosT / D2;
      }
      grid[r * cols + c] = E;
    }
  }

  let minFc = Infinity, maxFc = -Infinity, sumFc = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] < minFc) minFc = grid[i];
    if (grid[i] > maxFc) maxFc = grid[i];
    sumFc += grid[i];
  }
  const avgFc = sumFc / grid.length;

  return {
    grid,
    rows,
    cols,
    minFc:  +minFc.toFixed(4),
    maxFc:  +maxFc.toFixed(4),
    avgFc:  +avgFc.toFixed(4),
  };
}

// ---------------------------------------------------------------------------
// Egress compliance check
// ---------------------------------------------------------------------------

/**
 * Check NFPA 101-2021 §7.9.2.1 egress illuminance requirements.
 *
 * Pass criteria:
 *   - average illuminance ≥ 1.0 fc along the path of egress
 *   - minimum illuminance ≥ 0.1 fc at any point on the path
 *
 * If `minFc` is null the minimum check is skipped (lumen-method-only mode).
 *
 * @param {{ avgFc: number, minFc?: number|null }} result
 * @returns {{ pass: boolean, avgFc: number, minFc: number|null,
 *             avgThresholdFc: number, minThresholdFc: number, violations: string[] }}
 */
export function egressComplianceCheck({ avgFc, minFc = null } = {}) {
  const violations = [];

  if (avgFc < NFPA_EGRESS_AVG_FC) {
    violations.push(
      `Average illuminance ${avgFc.toFixed(2)} fc is below the NFPA 101 §7.9.2.1 ` +
      `minimum of ${NFPA_EGRESS_AVG_FC} fc`,
    );
  }
  if (minFc !== null && minFc < NFPA_EGRESS_MIN_FC) {
    violations.push(
      `Minimum illuminance ${minFc.toFixed(2)} fc is below the NFPA 101 §7.9.2.1 ` +
      `minimum of ${NFPA_EGRESS_MIN_FC} fc`,
    );
  }

  return {
    pass:             violations.length === 0,
    avgFc:            +avgFc.toFixed(4),
    minFc:            minFc !== null ? +minFc.toFixed(4) : null,
    avgThresholdFc:   NFPA_EGRESS_AVG_FC,
    minThresholdFc:   NFPA_EGRESS_MIN_FC,
    violations,
  };
}

// ---------------------------------------------------------------------------
// Unified study runner
// ---------------------------------------------------------------------------

function _validateInput(input) {
  const errors = [];
  const n = (v, label) => {
    if (v == null || !isFinite(v)) errors.push(`${label} is required`);
    return v;
  };
  n(input.roomLengthFt,    'Room length (ft)');
  n(input.roomWidthFt,     'Room width (ft)');
  n(input.mountingHeightFt, 'Mounting height (ft)');
  n(input.numFixtures,     'Number of fixtures');
  n(input.lumensPerFixture, 'Lumens per fixture');

  if (isFinite(input.roomLengthFt)    && input.roomLengthFt    <= 0) errors.push('Room length must be > 0');
  if (isFinite(input.roomWidthFt)     && input.roomWidthFt     <= 0) errors.push('Room width must be > 0');
  if (isFinite(input.numFixtures)     && input.numFixtures      < 1) errors.push('Number of fixtures must be ≥ 1');
  if (isFinite(input.lumensPerFixture) && input.lumensPerFixture <= 0) errors.push('Lumens per fixture must be > 0');

  const wph = input.workplaneHeightFt ?? 2.5;
  if (isFinite(input.mountingHeightFt) && isFinite(wph) && input.mountingHeightFt <= wph) {
    errors.push('Mounting height must be above the workplane height');
  }

  const llf = input.llf ?? 0.80;
  if (isFinite(llf) && (llf <= 0 || llf > 1)) errors.push('LLF must be in range (0, 1]');

  return errors;
}

/**
 * Unified entry point for the lighting study.
 *
 * @param {{
 *   roomLengthFt: number,
 *   roomWidthFt: number,
 *   mountingHeightFt: number,
 *   workplaneHeightFt?: number,   // default 2.5 ft
 *   numFixtures: number,
 *   lumensPerFixture: number,
 *   llf?: number,                  // light loss factor, default 0.80
 *   ceilingReflPct?: number,       // 80, 70, or 50; default 80
 *   wallReflPct?: number,          // 70, 50, or 30; default 70
 *   fixturePositions?: {x,y}[],   // for point-by-point (optional)
 *   vertAngles?: number[],         // from IES file (optional)
 *   candelas?: number[]|Float32Array, // from IES file (optional)
 * }} input
 * @returns {{ valid: boolean, errors: string[], warnings: string[],
 *             lumenMethod: object, pointGrid: object|null,
 *             egressCheck: object, _inputs: object }}
 */
export function runLightingStudy(input) {
  const errors = _validateInput(input);
  if (errors.length) return { valid: false, errors, warnings: [] };

  const {
    roomLengthFt,
    roomWidthFt,
    mountingHeightFt,
    workplaneHeightFt = 2.5,
    numFixtures,
    lumensPerFixture,
    llf            = 0.80,
    ceilingReflPct = 80,
    wallReflPct    = 70,
    fixturePositions = null,
    vertAngles       = null,
    candelas         = null,
  } = input;

  const roomAreaSqFt = roomLengthFt * roomWidthFt;
  const rcr = roomCavityRatio(roomLengthFt, roomWidthFt, mountingHeightFt, workplaneHeightFt);
  const cu  = coefficientOfUtilization(rcr, ceilingReflPct, wallReflPct);
  const avgFc = averageIlluminance(numFixtures, lumensPerFixture, cu, llf, roomAreaSqFt);

  const lumenMethod = {
    roomAreaSqFt: +roomAreaSqFt.toFixed(1),
    cavityHeightFt: +(mountingHeightFt - workplaneHeightFt).toFixed(2),
    rcr:    +rcr.toFixed(3),
    cu:     +cu.toFixed(3),
    llf:    +llf.toFixed(3),
    avgFc:  +avgFc.toFixed(2),
    ceilingReflPct,
    wallReflPct,
  };

  const warnings = [];

  // Point-by-point (optional — requires fixture positions and candela data)
  let pointGrid = null;
  if (fixturePositions && fixturePositions.length > 0 && vertAngles && candelas) {
    pointGrid = pointIlluminanceGrid(
      fixturePositions, mountingHeightFt, vertAngles, candelas,
      roomLengthFt, roomWidthFt,
    );
  } else {
    warnings.push(
      'Point-by-point grid not computed — no fixture positions or IES photometric data provided. ' +
      'Upload an IES file and add fixture positions for minimum-illuminance calculations.',
    );
  }

  // Egress check — use point grid if available, else avg only
  const egressInput = pointGrid
    ? { avgFc: pointGrid.avgFc, minFc: pointGrid.minFc }
    : { avgFc };
  const egressCheck = egressComplianceCheck(egressInput);

  if (llf < 0.70) warnings.push('Light loss factor below 0.70 — verify maintenance schedule and cleaning interval.');
  if (cu < 0.50) warnings.push('CU below 0.50 — consider increasing fixture height or room reflectances.');

  return {
    valid:       true,
    errors:      [],
    warnings,
    lumenMethod,
    pointGrid,
    egressCheck,
    _inputs:     input,
  };
}

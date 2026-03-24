/**
 * NEC Equipment Auto-Sizing
 *
 * Automatically selects conductor sizes, overcurrent device ratings, and transformer
 * kVA ratings based on NEC 2023 rules.
 *
 * Key NEC references:
 *   NEC 210.20  — Overcurrent protection for continuous loads (125%)
 *   NEC 215.3   — Feeders for continuous loads (125%)
 *   NEC 240.4   — Protection of conductors
 *   NEC 240.6(A)— Standard ampere ratings for fuses and circuit breakers
 *   NEC 310.15  — Ampacity tables (Table 310.15(B)(16) used as baseline)
 *   NEC 430.22  — Motor branch circuit conductor sizing (125% of FLC)
 *   NEC 430.52  — Motor branch circuit short-circuit and ground-fault protection
 *   NEC 430.250 — Full load current — three-phase AC motors (Table)
 *   NEC 430.248 — Full load current — single-phase AC motors (Table)
 *   NEC 450.3   — Transformer overcurrent protection
 */

// ---------------------------------------------------------------------------
// Standard breaker/fuse ratings — NEC 240.6(A)
// ---------------------------------------------------------------------------
export const STANDARD_OCPD_RATINGS = [
  15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90,
  100, 110, 125, 150, 175, 200, 225, 250, 300, 350,
  400, 450, 500, 600, 700, 800, 1000, 1200, 1600,
  2000, 2500, 3000, 4000, 5000, 6000
];

// ---------------------------------------------------------------------------
// NEC Table 310.15(B)(16) — Ampacity of insulated conductors rated 0–2000V
// in conduit/cable, 60/75/90°C columns, 30°C ambient, ≤3 current-carrying conductors
//
// Format: [size, ampacity_60C_Cu, ampacity_75C_Cu, ampacity_90C_Cu,
//                ampacity_75C_Al, ampacity_90C_Al]
// ---------------------------------------------------------------------------
export const NEC_AMPACITY_TABLE = [
  // size       60°C Cu  75°C Cu  90°C Cu  75°C Al  90°C Al
  { size: '#14 AWG',  cu60: 15,  cu75: 20,  cu90: 25,  al75: null, al90: null  },
  { size: '#12 AWG',  cu60: 20,  cu75: 25,  cu90: 30,  al75: 20,   al90: 25    },
  { size: '#10 AWG',  cu60: 30,  cu75: 35,  cu90: 40,  al75: 30,   al90: 35    },
  { size: '#8 AWG',   cu60: 40,  cu75: 50,  cu90: 55,  al75: 40,   al90: 45    },
  { size: '#6 AWG',   cu60: 55,  cu75: 65,  cu90: 75,  al75: 50,   al90: 60    },
  { size: '#4 AWG',   cu60: 70,  cu75: 85,  cu90: 95,  al75: 65,   al90: 75    },
  { size: '#3 AWG',   cu60: 85,  cu75: 100, cu90: 110, al75: 75,   al90: 85    },
  { size: '#2 AWG',   cu60: 95,  cu75: 115, cu90: 130, al75: 90,   al90: 100   },
  { size: '#1 AWG',   cu60: 110, cu75: 130, cu90: 145, al75: 100,  al90: 115   },
  { size: '1/0 AWG',  cu60: 125, cu75: 150, cu90: 170, al75: 120,  al90: 135   },
  { size: '2/0 AWG',  cu60: 145, cu75: 175, cu90: 195, al75: 135,  al90: 150   },
  { size: '3/0 AWG',  cu60: 165, cu75: 200, cu90: 225, al75: 155,  al90: 175   },
  { size: '4/0 AWG',  cu60: 195, cu75: 230, cu90: 260, al75: 180,  al90: 205   },
  { size: '250 kcmil',cu60: 215, cu75: 255, cu90: 290, al75: 205,  al90: 230   },
  { size: '300 kcmil',cu60: 240, cu75: 285, cu90: 320, al75: 230,  al90: 255   },
  { size: '350 kcmil',cu60: 260, cu75: 310, cu90: 350, al75: 250,  al90: 280   },
  { size: '400 kcmil',cu60: 280, cu75: 335, cu90: 380, al75: 270,  al90: 305   },
  { size: '500 kcmil',cu60: 320, cu75: 380, cu90: 430, al75: 310,  al90: 350   },
  { size: '600 kcmil',cu60: 355, cu75: 420, cu90: 475, al75: 340,  al90: 385   },
  { size: '750 kcmil',cu60: 400, cu75: 475, cu90: 535, al75: 385,  al90: 435   },
  { size: '1000 kcmil',cu60: 455,cu75: 545, cu90: 615, al75: 445,  al90: 500   },
];

// ---------------------------------------------------------------------------
// NEC Table 430.250 — Full Load Current (FLC), Three-Phase AC Motors, 60 Hz
// Format: { hp, v115, v200, v208, v230, v460, v575 }
// ---------------------------------------------------------------------------
export const MOTOR_FLC_3PH = [
  { hp: 0.5,  v200: 2.5,  v208: 2.4,  v230: 2.2,  v460: 1.1,  v575: 0.9  },
  { hp: 0.75, v200: 3.7,  v208: 3.5,  v230: 3.2,  v460: 1.6,  v575: 1.3  },
  { hp: 1,    v200: 4.8,  v208: 4.6,  v230: 4.2,  v460: 2.1,  v575: 1.7  },
  { hp: 1.5,  v200: 6.9,  v208: 6.6,  v230: 6.0,  v460: 3.0,  v575: 2.4  },
  { hp: 2,    v200: 7.8,  v208: 7.5,  v230: 6.8,  v460: 3.4,  v575: 2.7  },
  { hp: 3,    v200: 11,   v208: 10.6, v230: 9.6,  v460: 4.8,  v575: 3.9  },
  { hp: 5,    v200: 17.5, v208: 16.7, v230: 15.2, v460: 7.6,  v575: 6.1  },
  { hp: 7.5,  v200: 25.3, v208: 24.2, v230: 22,   v460: 11,   v575: 9    },
  { hp: 10,   v200: 32.2, v208: 30.8, v230: 28,   v460: 14,   v575: 11   },
  { hp: 15,   v200: 48.3, v208: 46.2, v230: 42,   v460: 21,   v575: 17   },
  { hp: 20,   v200: 62.1, v208: 59.4, v230: 54,   v460: 27,   v575: 22   },
  { hp: 25,   v200: 78.2, v208: 74.8, v230: 68,   v460: 34,   v575: 27   },
  { hp: 30,   v200: 92,   v208: 88,   v230: 80,   v460: 40,   v575: 32   },
  { hp: 40,   v200: 120,  v208: 114,  v230: 104,  v460: 52,   v575: 41   },
  { hp: 50,   v200: 150,  v208: 143,  v230: 130,  v460: 65,   v575: 52   },
  { hp: 60,   v200: 177,  v208: 169,  v230: 154,  v460: 77,   v575: 62   },
  { hp: 75,   v200: 221,  v208: 211,  v230: 192,  v460: 96,   v575: 77   },
  { hp: 100,  v200: 285,  v208: 273,  v230: 248,  v460: 124,  v575: 99   },
  { hp: 125,  v200: 359,  v208: 343,  v230: 312,  v460: 156,  v575: 125  },
  { hp: 150,  v200: 414,  v208: 396,  v230: 360,  v460: 180,  v575: 144  },
  { hp: 200,  v200: 552,  v208: 528,  v230: 480,  v460: 240,  v575: 192  },
  { hp: 250,  v460: 302,  v575: 242  },
  { hp: 300,  v460: 361,  v575: 289  },
  { hp: 350,  v460: 414,  v575: 336  },
  { hp: 400,  v460: 477,  v575: 382  },
  { hp: 450,  v460: 515,  v575: 412  },
  { hp: 500,  v460: 590,  v575: 472  },
];

// ---------------------------------------------------------------------------
// NEC Table 430.248 — Full Load Current (FLC), Single-Phase AC Motors, 60 Hz
// ---------------------------------------------------------------------------
export const MOTOR_FLC_1PH = [
  { hp: 0.17, v115: 4.4,  v230: 2.2  },
  { hp: 0.25, v115: 5.8,  v230: 2.9  },
  { hp: 0.33, v115: 7.2,  v230: 3.6  },
  { hp: 0.5,  v115: 9.8,  v230: 4.9  },
  { hp: 0.75, v115: 13.8, v230: 6.9  },
  { hp: 1,    v115: 16,   v230: 8.0  },
  { hp: 1.5,  v115: 20,   v230: 10   },
  { hp: 2,    v115: 24,   v230: 12   },
  { hp: 3,    v115: 34,   v230: 17   },
  { hp: 5,    v115: 56,   v230: 28   },
  { hp: 7.5,  v115: 80,   v230: 40   },
  { hp: 10,   v115: 100,  v230: 50   },
];

// ---------------------------------------------------------------------------
// Standard transformer kVA ratings
// ---------------------------------------------------------------------------
export const STANDARD_XFMR_KVA = [
  5, 7.5, 10, 15, 25, 37.5, 50, 75, 100, 167, 225, 300, 500,
  750, 1000, 1500, 2000, 2500
];

// ---------------------------------------------------------------------------
// NEC Table 310.15(B)(1)(a) — Ambient temperature correction factors
// Applied when ambient temperature differs from the 30°C reference.
// Rows: [maxAmbientC, factor_60C, factor_75C, factor_90C]
// ---------------------------------------------------------------------------
const AMBIENT_TEMP_CORRECTION = [
  { maxAmbientC: 10,  cu60: 1.29, cu75: 1.20, cu90: 1.15 },
  { maxAmbientC: 15,  cu60: 1.22, cu75: 1.15, cu90: 1.12 },
  { maxAmbientC: 20,  cu60: 1.15, cu75: 1.11, cu90: 1.08 },
  { maxAmbientC: 25,  cu60: 1.08, cu75: 1.05, cu90: 1.04 },
  { maxAmbientC: 30,  cu60: 1.00, cu75: 1.00, cu90: 1.00 },
  { maxAmbientC: 35,  cu60: 0.91, cu75: 0.94, cu90: 0.96 },
  { maxAmbientC: 40,  cu60: 0.82, cu75: 0.88, cu90: 0.91 },
  { maxAmbientC: 45,  cu60: 0.71, cu75: 0.82, cu90: 0.87 },
  { maxAmbientC: 50,  cu60: 0.58, cu75: 0.75, cu90: 0.82 },
  { maxAmbientC: 55,  cu60: 0.41, cu75: 0.67, cu90: 0.76 },
  { maxAmbientC: 60,  cu60: 0.00, cu75: 0.58, cu90: 0.71 },
  { maxAmbientC: 65,  cu60: 0.00, cu75: 0.47, cu90: 0.65 },
  { maxAmbientC: 70,  cu60: 0.00, cu75: 0.33, cu90: 0.58 },
  { maxAmbientC: 75,  cu60: 0.00, cu75: 0.00, cu90: 0.50 },
  { maxAmbientC: 80,  cu60: 0.00, cu75: 0.00, cu90: 0.41 },
  { maxAmbientC: 85,  cu60: 0.00, cu75: 0.00, cu90: 0.29 },
  { maxAmbientC: 90,  cu60: 0.00, cu75: 0.00, cu90: 0.00 },
];

// ---------------------------------------------------------------------------
// NEC 310.15(C)(1) — Bundling / adjustment factors for more than 3
// current-carrying conductors in a raceway or cable.
// ---------------------------------------------------------------------------
const BUNDLING_FACTORS = [
  { maxConductors:  3, factor: 1.00 },
  { maxConductors:  6, factor: 0.80 },
  { maxConductors:  9, factor: 0.70 },
  { maxConductors: 20, factor: 0.50 },
  { maxConductors: 30, factor: 0.45 },
  { maxConductors: 40, factor: 0.40 },
  { maxConductors: Infinity, factor: 0.35 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the NEC 310.15(B)(1)(a) ambient temperature correction factor.
 *
 * @param {number} ambientTempC  Actual ambient temperature in °C.
 * @param {60|75|90} tempRating  Conductor insulation temperature rating.
 * @returns {number}  Correction factor (≤1.0 above 30°C, ≥1.0 below 30°C).
 *                   Returns 0 when the ambient exceeds the conductor rating.
 */
export function ambientTempFactor(ambientTempC, tempRating = 75) {
  const col = tempRating >= 90 ? 'cu90' : tempRating >= 75 ? 'cu75' : 'cu60';
  const row = AMBIENT_TEMP_CORRECTION.find(r => ambientTempC <= r.maxAmbientC);
  return row ? (row[col] ?? 0) : 0;
}

/**
 * Return the NEC 310.15(C)(1) bundling adjustment factor.
 *
 * @param {number} bundledConductors  Number of current-carrying conductors in raceway/cable.
 * @returns {number}  Derating factor (1.0 when ≤3 conductors).
 */
export function bundlingFactor(bundledConductors) {
  const row = BUNDLING_FACTORS.find(r => bundledConductors <= r.maxConductors);
  return row ? row.factor : BUNDLING_FACTORS[BUNDLING_FACTORS.length - 1].factor;
}

/**
 * Find the next standard OCPD rating at or above the required ampacity.
 *
 * @param {number} requiredAmps
 * @returns {number|null} Standard OCPD rating, or null if > 6000A
 */
export function nextStandardOcpd(requiredAmps) {
  return STANDARD_OCPD_RATINGS.find(r => r >= requiredAmps) ?? null;
}

/**
 * Find the next standard transformer kVA at or above the required kVA.
 *
 * @param {number} requiredKva
 * @returns {number|null}
 */
export function nextStandardXfmrKva(requiredKva) {
  return STANDARD_XFMR_KVA.find(kva => kva >= requiredKva) ?? null;
}

/**
 * Select conductor size from NEC Table 310.15(B)(16) for a required ampacity,
 * optionally applying ambient temperature and bundling correction factors.
 *
 * When derating factors are provided the required ampacity is divided by the
 * combined factor before table lookup, ensuring the installed (derated) ampacity
 * meets the load requirement per NEC 310.15(B)(1)(a) and 310.15(C)(1).
 *
 * @param {number} requiredAmps         Load current requiring protection
 * @param {'copper'|'aluminum'} material
 * @param {60|75|90} tempRating         Conductor insulation temperature rating (°C)
 * @param {object}  [options]
 * @param {number}  [options.ambientTempC=30]        Ambient temperature in °C
 * @param {number}  [options.bundledConductors=1]    Number of current-carrying conductors in raceway
 * @returns {{size: string, ampacity: number, deratingFactor: number}|null}
 */
export function selectConductorSize(requiredAmps, material = 'copper', tempRating = 75, options = {}) {
  const { ambientTempC = 30, bundledConductors = 1 } = options;

  const tempFactor = ambientTempFactor(ambientTempC, tempRating);
  const bundleFactor = bundlingFactor(bundledConductors);
  const combinedFactor = tempFactor * bundleFactor;

  if (combinedFactor <= 0) return null; // ambient exceeds conductor rating

  // Gross up required ampacity so that: table_value × combined_factor ≥ requiredAmps
  const adjustedRequired = combinedFactor < 1 ? requiredAmps / combinedFactor : requiredAmps;

  const col = material === 'aluminum'
    ? (tempRating >= 90 ? 'al90' : 'al75')
    : (tempRating >= 90 ? 'cu90' : tempRating >= 75 ? 'cu75' : 'cu60');

  const entry = NEC_AMPACITY_TABLE.find(row => {
    const amp = row[col];
    return amp !== null && amp >= adjustedRequired;
  });
  if (!entry) return null;
  return { size: entry.size, ampacity: entry[col], deratingFactor: combinedFactor };
}

/**
 * Look up the three-phase motor FLC from NEC Table 430.250.
 *
 * @param {number} hp   Motor nameplate horsepower
 * @param {number} voltage  System voltage (115, 200, 208, 230, 460, 575)
 * @returns {number|null} Full load current in amperes
 */
export function motorFLC3Ph(hp, voltage) {
  const vKey = `v${voltage}`;
  // Find exact match first, then interpolate to nearest hp
  let row = MOTOR_FLC_3PH.find(r => r.hp === hp);
  if (!row) {
    // Find closest hp entry that has the required voltage column
    const candidates = MOTOR_FLC_3PH.filter(r => r[vKey] != null);
    if (!candidates.length) return null;
    // Round up to next standard HP
    row = candidates.find(r => r.hp >= hp);
    if (!row) row = candidates[candidates.length - 1];
  }
  return row[vKey] ?? null;
}

/**
 * Look up the single-phase motor FLC from NEC Table 430.248.
 *
 * @param {number} hp   Motor nameplate horsepower
 * @param {number} voltage  115 or 230
 * @returns {number|null}
 */
export function motorFLC1Ph(hp, voltage) {
  const vKey = `v${voltage}`;
  let row = MOTOR_FLC_1PH.find(r => r.hp === hp);
  if (!row) {
    const candidates = MOTOR_FLC_1PH.filter(r => r[vKey] != null);
    row = candidates.find(r => r.hp >= hp);
    if (!row) row = candidates[candidates.length - 1];
  }
  return row ? (row[vKey] ?? null) : null;
}

// ---------------------------------------------------------------------------
// Load sizing — general feeder / branch circuits
// ---------------------------------------------------------------------------

/**
 * Size a feeder or branch circuit for a general load (NEC 210.20 / 215.3 / 240.4).
 *
 * Rules applied:
 *   - If continuous: required ampacity = 125% of load current (NEC 210.20/215.3)
 *   - If non-continuous: required ampacity = 100% of load current
 *   - Conductor: select smallest NEC 310.15(B)(16) size ≥ required ampacity after
 *     applying ambient temperature correction (NEC 310.15(B)(1)(a)) and bundling
 *     adjustment factor (NEC 310.15(C)(1)) when installation conditions are provided
 *   - OCPD: next standard size ≥ conductor ampacity (NEC 240.4(B))
 *
 * @param {object} params
 * @param {number} params.loadAmps              Load current (A)
 * @param {boolean} [params.continuous]         True if load is continuous (≥3 hours). Default: true
 * @param {'copper'|'aluminum'} [params.material]  Conductor material. Default: 'copper'
 * @param {60|75|90} [params.tempRating]        Conductor temperature rating. Default: 75
 * @param {number} [params.ambientTempC]        Ambient temperature in °C. Default: 30
 * @param {number} [params.bundledConductors]   Number of current-carrying conductors in raceway. Default: 1
 * @returns {object} Sizing results
 */
export function sizeFeeder(params) {
  const {
    loadAmps,
    continuous = true,
    material = 'copper',
    tempRating = 75,
    ambientTempC = 30,
    bundledConductors = 1,
  } = params;

  if (loadAmps <= 0) throw new Error('Load current must be positive');

  const requiredAmps = continuous ? loadAmps * 1.25 : loadAmps;
  const conductor = selectConductorSize(requiredAmps, material, tempRating, { ambientTempC, bundledConductors });
  if (!conductor) return { error: 'Load exceeds maximum single-conductor capacity; use parallel conductors' };

  const ocpd = nextStandardOcpd(conductor.ampacity);
  const derating = conductor.deratingFactor;

  return {
    loadAmps,
    continuous,
    requiredAmps: Math.round(requiredAmps * 100) / 100,
    conductorSize: conductor.size,
    conductorAmpacity: conductor.ampacity,
    installedAmpacity: Math.round(conductor.ampacity * derating * 10) / 10,
    deratingFactor: derating,
    ambientTempC,
    bundledConductors,
    material,
    tempRating,
    ocpdRating: ocpd,
    nec: {
      continuousRule: 'NEC 210.20(A) / 215.3 — 125% of continuous load',
      conductorRule: 'NEC 310.15(B)(16) — 75°C column',
      ambientRule: ambientTempC !== 30 ? `NEC 310.15(B)(1)(a) — ambient ${ambientTempC}°C correction factor ${derating.toFixed(2)}` : null,
      bundlingRule: bundledConductors > 3 ? `NEC 310.15(C)(1) — ${bundledConductors} conductors bundling factor ${bundlingFactor(bundledConductors).toFixed(2)}` : null,
      ocpdRule: 'NEC 240.4(B) — next standard size above conductor ampacity',
    }
  };
}

// ---------------------------------------------------------------------------
// Motor branch circuit sizing — NEC 430
// ---------------------------------------------------------------------------

/**
 * Size a motor branch circuit per NEC 430 (conductor + OCPD + starter overload relay).
 *
 * Rules applied:
 *   - Branch circuit conductor: 125% of motor FLC (NEC 430.22)
 *   - Branch circuit OCPD (inverse time breaker): 250% of FLC, next standard size
 *     (NEC 430.52, Table 430.52 — standard AC squirrel cage motor)
 *   - Overload relay (thermal protection): 115% of FLC for motors > 1.15 service factor
 *     or 125% otherwise (NEC 430.32(A))
 *   - Ambient temperature and bundling correction factors applied when provided
 *     (NEC 310.15(B)(1)(a) and 310.15(C)(1))
 *
 * @param {object} params
 * @param {number} params.hp                     Motor nameplate HP
 * @param {number} params.voltage                System voltage (V)
 * @param {'3ph'|'1ph'} [params.phase]           Motor phase. Default '3ph'
 * @param {'copper'|'aluminum'} [params.material]  Default 'copper'
 * @param {boolean} [params.highSF]              True if service factor ≥ 1.15. Default: true
 * @param {number} [params.ambientTempC]         Ambient temperature in °C. Default: 30
 * @param {number} [params.bundledConductors]    Number of current-carrying conductors in raceway. Default: 1
 * @returns {object} Motor branch circuit sizing
 */
export function sizeMotorBranch(params) {
  const {
    hp,
    voltage,
    phase = '3ph',
    material = 'copper',
    highSF = true,
    ambientTempC = 30,
    bundledConductors = 1,
  } = params;

  if (hp <= 0) throw new Error('Motor HP must be positive');
  if (voltage <= 0) throw new Error('Voltage must be positive');

  const flc = phase === '1ph' ? motorFLC1Ph(hp, voltage) : motorFLC3Ph(hp, voltage);
  if (flc === null) {
    return { error: `No FLC data for ${hp} HP at ${voltage}V (${phase})` };
  }

  // Branch circuit conductor: 125% of FLC (NEC 430.22)
  const conductorRequired = flc * 1.25;
  const conductor = selectConductorSize(conductorRequired, material, 75, { ambientTempC, bundledConductors });

  // Branch circuit OCPD: 250% for inverse time breaker (NEC 430.52, Table 430.52)
  // If 250% doesn't correspond to a standard size, next standard size above is allowed
  // per NEC 430.52(C)(1)
  const ocpdRequired = flc * 2.5;
  const ocpd = nextStandardOcpd(ocpdRequired);

  // Overload relay: 115% if high service factor, else 125% (NEC 430.32(A)(1))
  const overloadPercent = highSF ? 1.15 : 1.25;
  const overloadSetpoint = flc * overloadPercent;

  const derating = conductor ? conductor.deratingFactor : 1;

  return {
    hp,
    voltage,
    phase,
    flc: Math.round(flc * 10) / 10,
    // Branch circuit conductor
    conductorRequired: Math.round(conductorRequired * 100) / 100,
    conductorSize: conductor ? conductor.size : null,
    conductorAmpacity: conductor ? conductor.ampacity : null,
    installedAmpacity: conductor ? Math.round(conductor.ampacity * derating * 10) / 10 : null,
    deratingFactor: derating,
    ambientTempC,
    bundledConductors,
    material,
    // Branch circuit OCPD (inverse time breaker)
    ocpdRequired: Math.round(ocpdRequired * 100) / 100,
    ocpdRating: ocpd,
    ocpdType: 'Inverse time breaker',
    // Overload relay
    overloadSetpoint: Math.round(overloadSetpoint * 10) / 10,
    overloadPercent: Math.round(overloadPercent * 100),
    nec: {
      flcSource: phase === '1ph' ? 'NEC Table 430.248' : 'NEC Table 430.250',
      conductorRule: 'NEC 430.22 — 125% of motor FLC',
      ambientRule: ambientTempC !== 30 ? `NEC 310.15(B)(1)(a) — ambient ${ambientTempC}°C correction factor ${ambientTempFactor(ambientTempC, 75).toFixed(2)}` : null,
      bundlingRule: bundledConductors > 3 ? `NEC 310.15(C)(1) — ${bundledConductors} conductors bundling factor ${bundlingFactor(bundledConductors).toFixed(2)}` : null,
      ocpdRule: 'NEC 430.52, Table 430.52 — 250% FLC (inverse time breaker)',
      overloadRule: `NEC 430.32(A)(1) — ${overloadPercent * 100}% of FLC`,
    }
  };
}

// ---------------------------------------------------------------------------
// Transformer sizing and protection — NEC 450
// ---------------------------------------------------------------------------

/**
 * Size a transformer and its overcurrent protection per NEC 450.3(B).
 *
 * Rules applied (for transformers ≤600V primary):
 *   - Primary OCPD: 125% of primary rated current (NEC 450.3(B), Table 450.3(B))
 *   - If primary OCPD ≤ 9A: 167% is permitted
 *   - Secondary OCPD: 125% of secondary rated current
 *   - Transformer kVA: next standard size above required load kVA
 *
 * @param {object} params
 * @param {number} params.loadKva         Required transformer load (kVA)
 * @param {number} params.primaryVoltage  Primary voltage (V)
 * @param {number} params.secondaryVoltage Secondary voltage (V)
 * @param {'3ph'|'1ph'} [params.phase]   Default '3ph'
 * @returns {object} Transformer sizing results
 */
export function sizeTransformer(params) {
  const {
    loadKva,
    primaryVoltage,
    secondaryVoltage,
    phase = '3ph'
  } = params;

  if (loadKva <= 0) throw new Error('Load kVA must be positive');
  if (primaryVoltage <= 0 || secondaryVoltage <= 0) throw new Error('Voltages must be positive');

  const xfmrKva = nextStandardXfmrKva(loadKva);
  const sqrtPhase = phase === '3ph' ? Math.sqrt(3) : 1;

  const primaryRatedAmps = (xfmrKva * 1000) / (sqrtPhase * primaryVoltage);
  const secondaryRatedAmps = (xfmrKva * 1000) / (sqrtPhase * secondaryVoltage);

  // Primary OCPD: 125%, or 167% if ≤ 9A (NEC 450.3(B), Table 450.3(B))
  const primaryOcpdFactor = primaryRatedAmps <= 9 ? 1.67 : 1.25;
  const primaryOcpdRequired = primaryRatedAmps * primaryOcpdFactor;
  const primaryOcpd = nextStandardOcpd(primaryOcpdRequired);

  // Secondary OCPD: 125% (NEC 450.3(B))
  const secondaryOcpdRequired = secondaryRatedAmps * 1.25;
  const secondaryOcpd = nextStandardOcpd(secondaryOcpdRequired);

  // Size secondary conductors: 125% of secondary rated current (continuous load rule)
  const secondaryConductor = selectConductorSize(secondaryRatedAmps * 1.25, 'copper', 75);

  return {
    loadKva,
    xfmrKva,
    phase,
    primaryVoltage,
    secondaryVoltage,
    primaryRatedAmps: Math.round(primaryRatedAmps * 10) / 10,
    primaryOcpdRequired: Math.round(primaryOcpdRequired * 10) / 10,
    primaryOcpdRating: primaryOcpd,
    primaryOcpdFactor: primaryOcpdFactor === 1.25 ? '125%' : '167%',
    secondaryRatedAmps: Math.round(secondaryRatedAmps * 10) / 10,
    secondaryOcpdRequired: Math.round(secondaryOcpdRequired * 10) / 10,
    secondaryOcpdRating: secondaryOcpd,
    secondaryConductorSize: secondaryConductor ? secondaryConductor.size : null,
    secondaryConductorAmpacity: secondaryConductor ? secondaryConductor.ampacity : null,
    nec: {
      xfmrSizing: 'Next standard kVA ≥ required load kVA',
      primaryRule: `NEC 450.3(B), Table 450.3(B) — ${primaryOcpdFactor === 1.25 ? '125%' : '167%'} of primary rated current`,
      secondaryRule: 'NEC 450.3(B), Table 450.3(B) — 125% of secondary rated current',
      conductorRule: 'NEC 310.15(B)(16) — secondary conductor at 125% rated current',
    }
  };
}

// ---------------------------------------------------------------------------
// Convenience: size from kW/kVAR load instead of amps
// ---------------------------------------------------------------------------

/**
 * Convert a kW/PF load to current and call sizeFeeder.
 *
 * @param {object} params
 * @param {number} params.kw              Real power (kW)
 * @param {number} [params.pf]            Power factor (0–1). Default 0.85
 * @param {number} params.voltage         Line-to-line voltage (V)
 * @param {'3ph'|'1ph'} [params.phase]   Default '3ph'
 * @param {boolean} [params.continuous]   Default: true
 * @param {'copper'|'aluminum'} [params.material]
 * @param {60|75|90} [params.tempRating]
 * @returns {object}
 */
export function sizeFeederFromKw(params) {
  const {
    kw,
    pf = 0.85,
    voltage,
    phase = '3ph',
    ...rest
  } = params;

  if (kw <= 0) throw new Error('kW must be positive');
  if (pf <= 0 || pf > 1) throw new Error('Power factor must be between 0 and 1');
  if (voltage <= 0) throw new Error('Voltage must be positive');

  const sqrtPhase = phase === '3ph' ? Math.sqrt(3) : 1;
  const loadAmps = (kw * 1000) / (sqrtPhase * voltage * pf);

  return {
    ...sizeFeeder({ loadAmps, ...rest }),
    kw,
    pf,
    voltage,
    phase,
    loadAmps: Math.round(loadAmps * 10) / 10,
  };
}

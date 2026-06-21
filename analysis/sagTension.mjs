/**
 * Overhead-Line Conductor Sag / Tension (Gap #90)
 *
 * Screening-level sag-tension for overhead spans: catenary and parabolic
 * geometry, ruling-span averaging, NESC ice/wind loading districts, the
 * elastic/thermal change-of-state equation, and a stringing table for the
 * installation contractor.
 *
 * Conventions (US customary, the dominant units for IEEE 524 / NESC work):
 *   span / ruling span S    ft
 *   horizontal tension H    lb
 *   conductor weight w      lb/ft
 *   sag D                   ft
 *   diameter d              in
 *   area A                  in²
 *   modulus E               psi
 *   thermal coeff α         1/°F
 *   temperature t           °F
 *
 * References:
 *   IEEE Std 524 — Guide to the Installation of Overhead Transmission Line Conductors.
 *   NESC (IEEE C2) §250 — Loading districts and load factors.
 *   ASCE Manual 74 — Guidelines for Electrical Transmission Line Structural Loading.
 *   Ehrenburg, D.O. (1935), "Transmission-line catenary calculations".
 */

/** Density of ice for radial-ice loading (lb/ft³), per NESC. */
export const ICE_DENSITY_LBFT3 = 57;

/**
 * NESC loading districts (IEEE C2 §250). Radial ice (in), wind pressure
 * (lb/ft²), constant load adder K (lb/ft), and temperature (°F).
 */
export const NESC_DISTRICTS = {
  heavy:  { label: 'Heavy',  iceIn: 0.50, windPsf: 4, kLbFt: 0.30, tempF: 0 },
  medium: { label: 'Medium', iceIn: 0.25, windPsf: 4, kLbFt: 0.20, tempF: 15 },
  light:  { label: 'Light',  iceIn: 0.00, windPsf: 9, kLbFt: 0.05, tempF: 30 },
};

/**
 * Representative bare-conductor library. Values are typical published data;
 * verify against the manufacturer's datasheet before final design.
 * area in², diameter in, weight lb/ft, UTS lb, E psi (final modulus),
 * alpha 1/°F (composite coefficient of thermal expansion).
 */
export const CONDUCTOR_LIBRARY = [
  { name: 'ACSR Drake 795 kcmil 26/7',  diameter: 1.108, area: 0.7264, weight: 1.094, uts: 31500, e: 11.2e6, alpha: 10.6e-6 },
  { name: 'ACSR Linnet 336.4 kcmil 26/7', diameter: 0.720, area: 0.3326, weight: 0.463, uts: 14100, e: 11.2e6, alpha: 10.9e-6 },
  { name: 'ACSR Hawk 477 kcmil 26/7',   diameter: 0.858, area: 0.4596, weight: 0.657, uts: 19500, e: 11.2e6, alpha: 10.7e-6 },
  { name: 'AAC 477 kcmil Cosmos',       diameter: 0.795, area: 0.3744, weight: 0.4476, uts: 7890, e: 10.0e6, alpha: 12.8e-6 },
  { name: 'AAAC 477 kcmil Greeley',     diameter: 0.793, area: 0.3768, weight: 0.4452, uts: 13300, e: 10.4e6, alpha: 12.96e-6 },
];

// ---------------------------------------------------------------------------
// Geometry — catenary and parabolic
// ---------------------------------------------------------------------------

/**
 * Exact catenary sag for a level span.
 * @param {number} w - Conductor weight (lb/ft)
 * @param {number} S - Span (ft)
 * @param {number} H - Horizontal tension (lb)
 * @returns {number} Sag (ft)
 */
export function catenarySag(w, S, H) {
  const c = H / w;                       // catenary constant
  return c * (Math.cosh(S / (2 * c)) - 1);
}

/**
 * Parabolic (small-sag) approximation of span sag.
 * @returns {number} Sag (ft)
 */
export function parabolicSag(w, S, H) {
  return (w * S * S) / (8 * H);
}

/** Exact catenary conductor length over a level span (ft). */
export function catenaryLength(w, S, H) {
  const c = H / w;
  return 2 * c * Math.sinh(S / (2 * c));
}

/** Parabolic conductor length over a level span (ft). */
export function parabolicLength(w, S, H) {
  return S * (1 + (w * w * S * S) / (24 * H * H));
}

/**
 * Conductor tension at the support (maximum tension) for a level span,
 * H plus the vertical component carried at the attachment.
 * @returns {number} Support tension (lb)
 */
export function supportTension(H, w, sag) {
  return H + w * sag;
}

// ---------------------------------------------------------------------------
// Ruling span
// ---------------------------------------------------------------------------

/**
 * Ruling (equivalent) span for a line section: sqrt(Σ Sᵢ³ / Σ Sᵢ).
 * @param {number[]} spans - Individual span lengths (ft)
 * @returns {number} Ruling span (ft)
 */
export function rulingSpan(spans) {
  const list = (spans || []).filter(s => Number.isFinite(s) && s > 0);
  if (list.length === 0) return NaN;
  const sumCube = list.reduce((s, x) => s + x * x * x, 0);
  const sumLin = list.reduce((s, x) => s + x, 0);
  return Math.sqrt(sumCube / sumLin);
}

// ---------------------------------------------------------------------------
// Ice and wind loading
// ---------------------------------------------------------------------------

/**
 * Weight of radial ice per unit length.
 * @param {number} diameter - Bare conductor diameter (in)
 * @param {number} iceThk - Radial ice thickness (in)
 * @param {number} [density=ICE_DENSITY_LBFT3] - Ice density (lb/ft³)
 * @returns {number} Ice weight (lb/ft)
 */
export function iceWeight(diameter, iceThk, density = ICE_DENSITY_LBFT3) {
  if (iceThk <= 0) return 0;
  const areaIn2 = Math.PI * iceThk * (diameter + iceThk); // annulus area
  return (areaIn2 / 144) * density;                        // in² → ft², × density
}

/**
 * Transverse wind load per unit length on the (possibly iced) conductor.
 * @param {number} diameter - Bare conductor diameter (in)
 * @param {number} iceThk - Radial ice thickness (in)
 * @param {number} pressurePsf - Wind pressure (lb/ft²)
 * @returns {number} Wind load (lb/ft)
 */
export function windLoad(diameter, iceThk, pressurePsf) {
  const projectedFt = (diameter + 2 * iceThk) / 12; // projected width (ft)
  return pressurePsf * projectedFt;
}

/**
 * Resultant transverse + vertical weight including the NESC constant K.
 * @param {number} wBare - Bare conductor weight (lb/ft)
 * @param {number} wIce - Ice weight (lb/ft)
 * @param {number} wWind - Wind load (lb/ft)
 * @param {number} [kConst=0] - NESC constant adder (lb/ft)
 * @returns {number} Resultant unit load (lb/ft)
 */
export function resultantWeight(wBare, wIce, wWind, kConst = 0) {
  const vertical = wBare + wIce;
  return Math.sqrt(vertical * vertical + wWind * wWind) + kConst;
}

/**
 * Effective unit load on a conductor for a given NESC district.
 * @param {{diameter:number, weight:number}} conductor
 * @param {{iceIn:number, windPsf:number, kLbFt:number}} district
 * @returns {{wIce:number, wWind:number, wResultant:number}}
 */
export function districtLoad(conductor, district) {
  const wIce = iceWeight(conductor.diameter, district.iceIn);
  const wWind = windLoad(conductor.diameter, district.iceIn, district.windPsf);
  const wResultant = resultantWeight(conductor.weight, wIce, wWind, district.kLbFt);
  return { wIce, wWind, wResultant };
}

// ---------------------------------------------------------------------------
// Change-of-state (elastic + thermal) equation
// ---------------------------------------------------------------------------

/**
 * Solve the parabolic change-of-state equation for the new horizontal
 * tension H₂ given an initial state (H₁, w₁, t₁) and a new state (w₂, t₂):
 *
 *   H₂²·[H₂ − H₁ + αEA(t₂−t₁) + EA·w₁²S²/(24H₁²)] = EA·w₂²S²/24
 *
 * which rearranges to the cubic  H₂³ − K·H₂² − EA·w₂²S²/24 = 0, where
 *   K = H₁ − αEA(t₂−t₁) − EA·w₁²S²/(24H₁²).
 * There is exactly one positive real root; found by Newton iteration with a
 * bisection fallback.
 *
 * @param {{e:number, area:number, alpha:number}} cond - E (psi), area (in²), α (1/°F)
 * @param {number} S - Ruling span (ft)
 * @param {number} H1 - Initial horizontal tension (lb)
 * @param {number} w1 - Initial unit load (lb/ft)
 * @param {number} t1 - Initial temperature (°F)
 * @param {number} w2 - New unit load (lb/ft)
 * @param {number} t2 - New temperature (°F)
 * @returns {number} New horizontal tension H₂ (lb)
 */
export function changeOfStateTension(cond, S, H1, w1, t1, w2, t2) {
  const EA = cond.e * cond.area;
  const K = H1 - cond.alpha * EA * (t2 - t1) - (EA * w1 * w1 * S * S) / (24 * H1 * H1);
  const rhs = (EA * w2 * w2 * S * S) / 24;
  const f = H => H * H * H - K * H * H - rhs;
  const fp = H => 3 * H * H - 2 * K * H;

  // Newton from H1; clamp to positive.
  let H = H1 > 0 ? H1 : 1;
  for (let i = 0; i < 60; i++) {
    const d = fp(H);
    if (Math.abs(d) < 1e-9) break;
    const step = f(H) / d;
    let next = H - step;
    if (!(next > 0)) next = H / 2;
    if (Math.abs(next - H) < 1e-7) { H = next; break; }
    H = next;
  }
  if (H > 0 && Math.abs(f(H)) < 1e-3) return H;

  // Bisection fallback over a generous bracket.
  let lo = 1e-3, hi = Math.max(H1, rhs ** (1 / 3)) * 10 + 1e3;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Stringing table
// ---------------------------------------------------------------------------

/**
 * Generate a bare-conductor stringing table across a temperature range,
 * starting from a known design (limiting) condition.
 *
 * @param {Object} conductor - Library entry (weight, area, e, alpha, ...).
 * @param {number} S - Ruling span (ft).
 * @param {number} designH - Horizontal tension at the design condition (lb).
 * @param {number} designW - Unit load at the design condition (lb/ft).
 * @param {number} designTemp - Temperature of the design condition (°F).
 * @param {number[]} temps - Stringing temperatures (°F), bare conductor.
 * @returns {Array<{tempF:number, tensionLb:number, sagFt:number, supportTensionLb:number}>}
 */
export function stringingTable(conductor, S, designH, designW, designTemp, temps) {
  const cond = { e: conductor.e, area: conductor.area, alpha: conductor.alpha };
  return temps.map(t => {
    const H = changeOfStateTension(cond, S, designH, designW, designTemp, conductor.weight, t);
    const sag = parabolicSag(conductor.weight, S, H);
    return {
      tempF: t,
      tensionLb: H,
      sagFt: sag,
      supportTensionLb: supportTension(H, conductor.weight, sag),
    };
  });
}

function rangeTemps(min, max, step) {
  const out = [];
  const s = step > 0 ? step : 10;
  for (let t = min; t <= max + 1e-9; t += s) out.push(Math.round(t * 100) / 100);
  if (out.length === 0) out.push(min);
  return out;
}

// ---------------------------------------------------------------------------
// Top-level study runner
// ---------------------------------------------------------------------------

/**
 * Run the sag-tension study.
 *
 * @param {Object} config
 * @param {Object} config.conductor - Conductor properties (library entry shape).
 * @param {number[]} [config.spans] - Individual spans (ft); ruling span derived.
 * @param {number} [config.rulingSpan] - Ruling span (ft) if spans not given.
 * @param {string} [config.district='heavy'] - NESC district key.
 * @param {number} [config.designTensionPct=33.33] - Max tension as % of UTS at the design (loaded) condition.
 * @param {{min:number,max:number,step:number}} [config.stringingTemps] - Bare-conductor stringing range (°F).
 * @returns {SagTensionResult}
 */
export function runSagTension(config = {}) {
  const conductor = config.conductor;
  if (!conductor || !Number.isFinite(conductor.weight) || !Number.isFinite(conductor.uts) || conductor.uts <= 0) {
    throw new Error('Select a conductor with valid weight and rated strength (UTS).');
  }
  const RS = Array.isArray(config.spans) && config.spans.length
    ? rulingSpan(config.spans)
    : Number(config.rulingSpan);
  if (!Number.isFinite(RS) || RS <= 0) {
    throw new Error('Provide a ruling span or at least one positive span length.');
  }

  const districtKey = config.district && NESC_DISTRICTS[config.district] ? config.district : 'heavy';
  const district = NESC_DISTRICTS[districtKey];

  const designTensionPct = Number.isFinite(config.designTensionPct) ? config.designTensionPct : 33.33;
  if (designTensionPct <= 0 || designTensionPct >= 100) {
    throw new Error('Design tension must be between 0 and 100 % of UTS.');
  }

  // Loaded design condition: limiting tension at the NESC district loading.
  const load = districtLoad(conductor, district);
  const designH = (designTensionPct / 100) * conductor.uts;
  const designSag = parabolicSag(load.wResultant, RS, designH);
  const designSupportTension = supportTension(designH, load.wResultant, designSag);

  // Per-loading-case summary at the design horizontal tension reference.
  const loadingCases = Object.entries(NESC_DISTRICTS).map(([key, d]) => {
    const l = districtLoad(conductor, d);
    const H = changeOfStateTension(
      { e: conductor.e, area: conductor.area, alpha: conductor.alpha },
      RS, designH, load.wResultant, district.tempF, l.wResultant, d.tempF
    );
    const sag = parabolicSag(l.wResultant, RS, H);
    return {
      key,
      label: d.label,
      tempF: d.tempF,
      unitLoad: l.wResultant,
      tensionLb: H,
      tensionPctUts: (supportTension(H, l.wResultant, sag) / conductor.uts) * 100,
      sagFt: sag,
    };
  });

  // Bare-conductor stringing table.
  const st = config.stringingTemps || { min: 0, max: 120, step: 20 };
  const temps = rangeTemps(st.min, st.max, st.step);
  const table = stringingTable(conductor, RS, designH, load.wResultant, district.tempF, temps);

  const warnings = [];
  const maxFinalPct = Math.max(...loadingCases.map(c => c.tensionPctUts));
  if (maxFinalPct > 60) {
    warnings.push(`Peak conductor tension reaches ${maxFinalPct.toFixed(1)}% of UTS under loading — review design tension or span.`);
  }
  const coldString = table[0];
  if (coldString && (coldString.supportTensionLb / conductor.uts) * 100 > 35) {
    warnings.push(`Initial (cold) stringing tension is ${((coldString.supportTensionLb / conductor.uts) * 100).toFixed(1)}% of UTS — exceeds the common 35% unloaded limit.`);
  }
  if (designSag > RS * 0.08) {
    warnings.push(`Design sag (${designSag.toFixed(1)} ft) exceeds 8% of the ruling span — confirm ground clearance.`);
  }
  if (catenarySag(load.wResultant, RS, designH) - designSag > 0.05 * designSag) {
    warnings.push('Parabolic and catenary sag differ by more than 5% — span is in the large-sag regime; treat results as approximate.');
  }

  return {
    inputs: { conductor, rulingSpan: RS, district: districtKey, designTensionPct, stringingTemps: st },
    rulingSpan: RS,
    district: { key: districtKey, ...district },
    loading: load,
    designTensionLb: designH,
    designTensionPctUts: designTensionPct,
    designSagFt: designSag,
    designSupportTensionLb: designSupportTension,
    loadingCases,
    stringingTable: table,
    warnings,
  };
}

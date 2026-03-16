/**
 * Cable Tray Support Span Calculator
 * Per NEMA VE 1-2017 — Cable Tray Systems
 *
 * Methodology:
 *   Maximum support span is governed by the L/100 deflection limit defined in
 *   NEMA VE 1. For a uniformly distributed load on a simple span the midpoint
 *   deflection is δ = 5wL⁴ / (384EI). Setting δ = L/100 and solving for L
 *   gives L ∝ (EI/w)^(1/3). Since the tray's EI is constant, the span scales
 *   as:
 *
 *     max_span = L_rated × (w_rated / w_actual)^(1/3)
 *
 *   where L_rated and w_rated come from the NEMA load-class rating and
 *   w_actual is the total cable weight per linear foot of tray.
 *
 * References:
 *   NEMA VE 1-2017 — Cable Tray Systems, Section 4 (Load Classification)
 *   NEMA FG 1-2014 — Fiberglass Cable Tray Systems
 */

/**
 * NEMA VE 1 load-class definitions.
 * ratedLoad  – working load in lbs per linear foot of tray
 * ratedSpan  – standard test span in feet
 *
 * All standard aluminum/steel classes use a 12-ft test span.
 * High-capacity classes (8C, 12C …) use the same span with heavier sections.
 */
export const NEMA_LOAD_CLASSES = {
  '8A':  { ratedLoad:  8, ratedSpan: 12 },
  '12A': { ratedLoad: 12, ratedSpan: 12 },
  '16A': { ratedLoad: 16, ratedSpan: 12 },
  '20A': { ratedLoad: 20, ratedSpan: 12 },
  '25A': { ratedLoad: 25, ratedSpan: 12 },
  '32A': { ratedLoad: 32, ratedSpan: 12 },
};

/**
 * Representative cable weight data in lbs per linear foot.
 * Source: typical manufacturer published data (ICEA / NEC tables).
 * Key format: "<conductors>C-<size>" e.g. "3C-500 kcmil"
 * These values are approximate averages across THHN/XHHW/XLPE insulations.
 */
export const CABLE_WEIGHT_LB_FT = {
  /* Single-conductor power cable */
  '1C-#14 AWG':    0.03,
  '1C-#12 AWG':    0.04,
  '1C-#10 AWG':    0.05,
  '1C-#8 AWG':     0.07,
  '1C-#6 AWG':     0.10,
  '1C-#4 AWG':     0.14,
  '1C-#2 AWG':     0.19,
  '1C-#1 AWG':     0.22,
  '1C-1/0 AWG':    0.27,
  '1C-2/0 AWG':    0.32,
  '1C-3/0 AWG':    0.38,
  '1C-4/0 AWG':    0.46,
  '1C-250 kcmil':  0.57,
  '1C-350 kcmil':  0.75,
  '1C-500 kcmil':  1.03,
  '1C-750 kcmil':  1.48,
  '1C-1000 kcmil': 1.93,
  /* Three-conductor power cable (typical multiconductor with jacket) */
  '3C-#14 AWG':    0.09,
  '3C-#12 AWG':    0.11,
  '3C-#10 AWG':    0.15,
  '3C-#8 AWG':     0.21,
  '3C-#6 AWG':     0.30,
  '3C-#4 AWG':     0.41,
  '3C-#2 AWG':     0.55,
  '3C-#1 AWG':     0.65,
  '3C-1/0 AWG':    0.78,
  '3C-2/0 AWG':    0.94,
  '3C-3/0 AWG':    1.13,
  '3C-4/0 AWG':    1.36,
  '3C-250 kcmil':  1.65,
  '3C-350 kcmil':  2.18,
  '3C-500 kcmil':  2.94,
  '3C-750 kcmil':  4.21,
  /* Control/instrument cable */
  '7C-#16 AWG':    0.10,
  '12C-#16 AWG':   0.15,
  '19C-#16 AWG':   0.22,
  '24C-#16 AWG':   0.27,
  '37C-#16 AWG':   0.38,
};

/**
 * Calculate the maximum allowable support span.
 *
 * @param {number} actualLoad  – Cable weight per linear foot of tray (lbs/ft)
 * @param {string} loadClass   – NEMA load class identifier (e.g. '16A')
 * @returns {{
 *   maxSpan:         number,   // ft, rounded to 2 decimal places
 *   ratedSpan:       number,   // ft — the class reference span
 *   ratedLoad:       number,   // lbs/ft — the class rated load
 *   utilizationRatio:number,   // actualLoad / ratedLoad (dimensionless)
 *   status:          string,   // 'OK' | 'OVERLOADED'
 *   recommendation:  string,   // human-readable guidance
 * }}
 */
export function calcMaxSpan(actualLoad, loadClass) {
  const cls = NEMA_LOAD_CLASSES[loadClass];
  if (!cls) throw new Error(`Unknown NEMA load class: ${loadClass}`);
  if (!Number.isFinite(actualLoad) || actualLoad <= 0) {
    throw new Error('actualLoad must be a positive finite number');
  }

  // Deflection-governed span per NEMA VE 1 (L/100 limit)
  const maxSpan = cls.ratedSpan * Math.cbrt(cls.ratedLoad / actualLoad);
  const utilizationRatio = actualLoad / cls.ratedLoad;
  const status = utilizationRatio > 1 ? 'OVERLOADED' : 'OK';

  let recommendation;
  if (status === 'OK') {
    recommendation =
      `Maximum span is ${maxSpan.toFixed(2)} ft. ` +
      `Support spacing must not exceed this value. ` +
      `Load utilization is ${(utilizationRatio * 100).toFixed(1)}% of the ${loadClass} rating.`;
  } else {
    // Suggest the next adequate load class
    const adequate = Object.entries(NEMA_LOAD_CLASSES)
      .filter(([, c]) => c.ratedLoad >= actualLoad)
      .sort(([, a], [, b]) => a.ratedLoad - b.ratedLoad)[0];
    const suggestion = adequate
      ? ` Consider upgrading to Class ${adequate[0]} (rated ${adequate[1].ratedLoad} lbs/ft).`
      : ' No standard NEMA load class covers this load — use a custom heavy-duty tray.';
    recommendation =
      `Load exceeds Class ${loadClass} rating (${cls.ratedLoad} lbs/ft).${suggestion}`;
  }

  return {
    maxSpan:          Math.round(maxSpan * 100) / 100,
    ratedSpan:        cls.ratedSpan,
    ratedLoad:        cls.ratedLoad,
    utilizationRatio: Math.round(utilizationRatio * 10000) / 10000,
    status,
    recommendation,
  };
}

/**
 * Sum cable weight contributions for a set of cables in a tray.
 *
 * @param {Array<{conductors?: number|string, size?: string, quantity?: number, weight_lb_ft?: number}>} cables
 * @returns {number} total lbs per linear foot of tray
 */
export function sumCableWeights(cables) {
  return cables.reduce((total, cable) => {
    const qty = Number(cable.quantity) || 1;

    // If the caller provided an explicit weight, use it directly
    if (cable.weight_lb_ft != null) {
      return total + qty * Number(cable.weight_lb_ft);
    }

    // Otherwise look up in the built-in table
    const conductors = cable.conductors != null ? String(cable.conductors) : null;
    const size = cable.size != null ? String(cable.size) : null;
    const key = conductors && size ? `${conductors}C-${size}` : null;
    const unitWeight = (key && CABLE_WEIGHT_LB_FT[key]) || 0;
    return total + qty * unitWeight;
  }, 0);
}

/**
 * Evaluate every tray in a schedule against a NEMA load class.
 *
 * @param {Array<{tray_id: string, inside_width: number, cables?: Array}>} trays
 * @param {string} loadClass
 * @returns {Array<{ tray_id: string, loadPerFt: number, result: ReturnType<calcMaxSpan> }>}
 */
export function evaluateTrays(trays, loadClass) {
  return trays.map(tray => {
    const cables = Array.isArray(tray.cables) ? tray.cables : [];
    const loadPerFt = sumCableWeights(cables);
    let result;
    if (loadPerFt > 0) {
      result = calcMaxSpan(loadPerFt, loadClass);
    } else {
      // No cables yet — return rated span at zero utilization
      const cls = NEMA_LOAD_CLASSES[loadClass];
      result = {
        maxSpan: cls ? cls.ratedSpan : 0,
        ratedSpan: cls ? cls.ratedSpan : 0,
        ratedLoad: cls ? cls.ratedLoad : 0,
        utilizationRatio: 0,
        status: 'OK',
        recommendation: 'No cables assigned to this tray.',
      };
    }
    return { tray_id: tray.tray_id || tray.id || '?', loadPerFt, result };
  });
}

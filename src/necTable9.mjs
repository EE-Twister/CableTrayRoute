/**
 * NEC Chapter 9, Table 9 — Alternating-Current Resistance and Reactance for
 * 600-Volt Cables, 3-Phase, 60 Hz, 75 °C (167 °F), Three Single Conductors in
 * Conduit. Values in ohms per 1000 ft.
 *
 * Columns:
 *   xlNonMag — effective reactance XL for PVC and aluminum (nonmagnetic) conduit
 *   xlSteel  — effective reactance XL for steel (magnetic) conduit
 *   rCu      — AC resistance, uncoated copper, in PVC/aluminum conduit
 *   rCuSteel — AC resistance, uncoated copper, in steel conduit
 *   rAl      — AC resistance, aluminum, in PVC/aluminum conduit
 *   rAlSteel — AC resistance, aluminum, in steel conduit
 *
 * Reactance does not vary with conductor material; resistance does, and is
 * slightly higher in magnetic (steel) conduit. These are the standard values
 * used for AC voltage-drop calculations when the load power factor is known.
 */

// Keyed by canonical size token (AWG number, "n/0", or kcmil number).
const TABLE_9 = {
  '14':   { xlNonMag: 0.058, xlSteel: 0.073, rCu: 3.1,   rCuSteel: 3.1,   rAl: null,  rAlSteel: null },
  '12':   { xlNonMag: 0.054, xlSteel: 0.068, rCu: 2.0,   rCuSteel: 2.0,   rAl: 3.2,   rAlSteel: 3.2 },
  '10':   { xlNonMag: 0.050, xlSteel: 0.063, rCu: 1.2,   rCuSteel: 1.2,   rAl: 2.0,   rAlSteel: 2.0 },
  '8':    { xlNonMag: 0.052, xlSteel: 0.065, rCu: 0.78,  rCuSteel: 0.78,  rAl: 1.3,   rAlSteel: 1.3 },
  '6':    { xlNonMag: 0.051, xlSteel: 0.064, rCu: 0.49,  rCuSteel: 0.49,  rAl: 0.81,  rAlSteel: 0.81 },
  '4':    { xlNonMag: 0.048, xlSteel: 0.060, rCu: 0.31,  rCuSteel: 0.31,  rAl: 0.51,  rAlSteel: 0.51 },
  '3':    { xlNonMag: 0.047, xlSteel: 0.059, rCu: 0.25,  rCuSteel: 0.25,  rAl: 0.40,  rAlSteel: 0.40 },
  '2':    { xlNonMag: 0.045, xlSteel: 0.057, rCu: 0.19,  rCuSteel: 0.20,  rAl: 0.32,  rAlSteel: 0.32 },
  '1':    { xlNonMag: 0.046, xlSteel: 0.057, rCu: 0.15,  rCuSteel: 0.16,  rAl: 0.25,  rAlSteel: 0.25 },
  '1/0':  { xlNonMag: 0.044, xlSteel: 0.055, rCu: 0.12,  rCuSteel: 0.13,  rAl: 0.20,  rAlSteel: 0.20 },
  '2/0':  { xlNonMag: 0.043, xlSteel: 0.054, rCu: 0.10,  rCuSteel: 0.102, rAl: 0.16,  rAlSteel: 0.16 },
  '3/0':  { xlNonMag: 0.042, xlSteel: 0.052, rCu: 0.077, rCuSteel: 0.082, rAl: 0.13,  rAlSteel: 0.13 },
  '4/0':  { xlNonMag: 0.041, xlSteel: 0.051, rCu: 0.062, rCuSteel: 0.067, rAl: 0.10,  rAlSteel: 0.10 },
  '250':  { xlNonMag: 0.041, xlSteel: 0.052, rCu: 0.052, rCuSteel: 0.057, rAl: 0.085, rAlSteel: 0.086 },
  '300':  { xlNonMag: 0.041, xlSteel: 0.051, rCu: 0.044, rCuSteel: 0.049, rAl: 0.071, rAlSteel: 0.073 },
  '350':  { xlNonMag: 0.040, xlSteel: 0.050, rCu: 0.038, rCuSteel: 0.043, rAl: 0.061, rAlSteel: 0.062 },
  '400':  { xlNonMag: 0.040, xlSteel: 0.049, rCu: 0.033, rCuSteel: 0.038, rAl: 0.054, rAlSteel: 0.055 },
  '500':  { xlNonMag: 0.039, xlSteel: 0.048, rCu: 0.027, rCuSteel: 0.032, rAl: 0.043, rAlSteel: 0.045 },
  '600':  { xlNonMag: 0.039, xlSteel: 0.048, rCu: 0.023, rCuSteel: 0.028, rAl: 0.036, rAlSteel: 0.039 },
  '700':  { xlNonMag: 0.0385, xlSteel: 0.0475, rCu: 0.021, rCuSteel: 0.024, rAl: 0.031, rAlSteel: 0.034 },
  '750':  { xlNonMag: 0.038, xlSteel: 0.047, rCu: 0.019, rCuSteel: 0.024, rAl: 0.029, rAlSteel: 0.032 },
  '800':  { xlNonMag: 0.038, xlSteel: 0.046, rCu: 0.018, rCuSteel: 0.022, rAl: 0.028, rAlSteel: 0.030 },
  '900':  { xlNonMag: 0.037, xlSteel: 0.046, rCu: 0.016, rCuSteel: 0.021, rAl: 0.025, rAlSteel: 0.027 },
  '1000': { xlNonMag: 0.037, xlSteel: 0.046, rCu: 0.015, rCuSteel: 0.019, rAl: 0.023, rAlSteel: 0.025 },
  '1250': { xlNonMag: 0.036, xlSteel: 0.045, rCu: 0.013, rCuSteel: 0.017, rAl: 0.019, rAlSteel: 0.022 },
  '1500': { xlNonMag: 0.035, xlSteel: 0.043, rCu: 0.011, rCuSteel: 0.015, rAl: 0.016, rAlSteel: 0.019 },
  '1750': { xlNonMag: 0.034, xlSteel: 0.043, rCu: 0.0098, rCuSteel: 0.014, rAl: 0.014, rAlSteel: 0.017 },
  '2000': { xlNonMag: 0.034, xlSteel: 0.042, rCu: 0.0090, rCuSteel: 0.013, rAl: 0.013, rAlSteel: 0.016 },
};

const OHMS_PER_1000FT_TO_PER_M = 1 / 304.8; // 1000 ft = 304.8 m

/** Reduce a size string ("#4/0 AWG", "250 kcmil", "12") to a canonical token. */
export function normalizeSizeToken(size) {
  if (!size) return '';
  let s = size.toString().trim().replace(/^#/, '');
  const m = s.match(/(\d+\/0|\d+)/); // matches "4/0", "250", "12"
  return m ? m[1] : '';
}

function isAluminum(material) {
  return /al/i.test(material || '');
}

function isMagneticConduit(conduit) {
  // Steel / iron / rigid metal / IMC / EMT are magnetic; PVC / aluminum / fiberglass are not.
  return /steel|iron|rigid|rmc|imc|emt|grc|magnetic/i.test(conduit || '');
}

/**
 * NEC Table 9 AC resistance and reactance for a conductor, in ohms PER METER.
 *
 * @param {string} size      Conductor size (AWG / kcmil)
 * @param {string} material  'CU'/'copper' or 'AL'/'aluminum'
 * @param {string} conduit   Conduit/raceway material (steel ⇒ magnetic)
 * @returns {{ R:number, X:number }|null} ohms per meter, or null if size unknown
 */
export function table9Impedance(size, material, conduit) {
  const row = TABLE_9[normalizeSizeToken(size)];
  if (!row) return null;
  const magnetic = isMagneticConduit(conduit);
  const X1000 = magnetic ? row.xlSteel : row.xlNonMag;
  let R1000;
  if (isAluminum(material)) {
    R1000 = magnetic ? row.rAlSteel : row.rAl;
  } else {
    R1000 = magnetic ? row.rCuSteel : row.rCu;
  }
  if (R1000 == null) return null; // e.g. aluminum not listed for 14 AWG
  return { R: R1000 * OHMS_PER_1000FT_TO_PER_M, X: X1000 * OHMS_PER_1000FT_TO_PER_M };
}

export default { table9Impedance, normalizeSizeToken };

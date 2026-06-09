/**
 * IEEE 1584-2018 — Guide for Performing Arc-Flash Hazard Calculations.
 *
 * A faithful implementation of the 2018 edition model: the empirically-derived
 * coefficient tables (Tables 1–7), the intermediate average arcing current,
 * the arcing-current variation correction factor, the enclosure-size
 * correction factor, the incident-energy and arc-flash-boundary equations, and
 * the voltage interpolation between the 600 V / 2700 V / 14 300 V models.
 *
 * Validated against the worked examples in Annex D.1 (medium voltage) and
 * Annex D.2 (low voltage) of the standard — see tests/ieee1584.test.mjs.
 *
 * The coefficient tables were transcribed from IEEE 1584-2018 and cross-checked
 * against the open-source, spreadsheet-validated `arcflash` library by
 * Li-aung Yip (MIT licensed, https://github.com/LiaungYip/arcflash), which
 * verifies to within 0.1 % of the official IEEE calculator over 144,000 cases.
 *
 * Units: voltage kV, current kA, distance/gap mm, time seconds, energy cal/cm²
 * (also reported in J/cm²), boundary mm.
 *
 * Model validity range (IEEE 1584-2018 §4.2): 0.208–15 kV; LV (≤0.6 kV) bolted
 * fault 0.5–106 kA and gap 6.35–76.2 mm; HV (>0.6 kV) bolted fault 0.2–65 kA and
 * gap 19.05–254 mm; working distance ≥ 305 mm. Outside this range the model is
 * not valid; callers should surface a warning.
 */

const ELECTRODE_CONFIGS = ['VCB', 'VCBB', 'HCB', 'VOA', 'HOA'];

// Table 1 — intermediate average arcing current coefficients, keyed [EC][Voc(kV)].
const TABLE_1 = {
  VCB: {
    0.6:  { k1: -0.04287, k2: 1.035, k3: -0.083, k4: 0, k5: 0, k6: -4.783e-9, k7: 1.962e-6, k8: -0.000229, k9: 0.003141, k10: 1.092 },
    2.7:  { k1: 0.0065, k2: 1.001, k3: -0.024, k4: -1.557e-12, k5: 4.556e-10, k6: -4.186e-8, k7: 8.346e-7, k8: 5.482e-5, k9: -0.003191, k10: 0.9729 },
    14.3: { k1: 0.005795, k2: 1.015, k3: -0.011, k4: -1.557e-12, k5: 4.556e-10, k6: -4.186e-8, k7: 8.346e-7, k8: 5.482e-5, k9: -0.003191, k10: 0.9729 },
  },
  VCBB: {
    0.6:  { k1: -0.017432, k2: 0.98, k3: -0.05, k4: 0, k5: 0, k6: -5.767e-9, k7: 2.524e-6, k8: -0.00034, k9: 0.01187, k10: 1.013 },
    2.7:  { k1: 0.002823, k2: 0.995, k3: -0.0125, k4: 0, k5: -9.204e-11, k6: 2.901e-8, k7: -3.262e-6, k8: 0.0001569, k9: -0.004003, k10: 0.9825 },
    14.3: { k1: 0.014827, k2: 1.01, k3: -0.01, k4: 0, k5: -9.204e-11, k6: 2.901e-8, k7: -3.262e-6, k8: 0.0001569, k9: -0.004003, k10: 0.9825 },
  },
  HCB: {
    0.6:  { k1: 0.054922, k2: 0.988, k3: -0.11, k4: 0, k5: 0, k6: -5.382e-9, k7: 2.316e-6, k8: -0.000302, k9: 0.0091, k10: 0.9725 },
    2.7:  { k1: 0.001011, k2: 1.003, k3: -0.0249, k4: 0, k5: 0, k6: 4.859e-10, k7: -1.814e-7, k8: -9.128e-6, k9: -0.0007, k10: 0.9881 },
    14.3: { k1: 0.008693, k2: 0.999, k3: -0.02, k4: 0, k5: -5.043e-11, k6: 2.233e-8, k7: -3.046e-6, k8: 0.000116, k9: -0.001145, k10: 0.9839 },
  },
  VOA: {
    0.6:  { k1: 0.043785, k2: 1.04, k3: -0.18, k4: 0, k5: 0, k6: -4.783e-9, k7: 1.962e-6, k8: -0.000229, k9: 0.003141, k10: 1.092 },
    2.7:  { k1: -0.02395, k2: 1.006, k3: -0.0188, k4: -1.557e-12, k5: 4.556e-10, k6: -4.186e-8, k7: 8.346e-7, k8: 5.482e-5, k9: -0.003191, k10: 0.9729 },
    14.3: { k1: 0.005371, k2: 1.0102, k3: -0.029, k4: -1.557e-12, k5: 4.556e-10, k6: -4.186e-8, k7: 8.346e-7, k8: 5.482e-5, k9: -0.003191, k10: 0.9729 },
  },
  HOA: {
    0.6:  { k1: 0.111147, k2: 1.008, k3: -0.24, k4: 0, k5: 0, k6: -3.895e-9, k7: 1.641e-6, k8: -0.000197, k9: 0.002615, k10: 1.1 },
    2.7:  { k1: 0.000435, k2: 1.006, k3: -0.038, k4: 0, k5: 0, k6: 7.859e-10, k7: -1.914e-7, k8: -9.128e-6, k9: -0.0007, k10: 0.9981 },
    14.3: { k1: 0.000904, k2: 0.999, k3: -0.02, k4: 0, k5: 0, k6: 7.859e-10, k7: -1.914e-7, k8: -9.128e-6, k9: -0.0007, k10: 0.9981 },
  },
};

// Table 2 — arcing-current variation correction factor coefficients (polynomial in Voc).
const TABLE_2 = {
  VCB:  { k1: 0, k2: -0.0000014269, k3: 0.000083137, k4: -0.0019382, k5: 0.022366, k6: -0.12645, k7: 0.30226 },
  VCBB: { k1: 1.138e-6, k2: -6.0287e-5, k3: 0.0012758, k4: -0.013778, k5: 0.080217, k6: -0.24066, k7: 0.33524 },
  HCB:  { k1: 0, k2: -3.097e-6, k3: 0.00016405, k4: -0.0033609, k5: 0.033308, k6: -0.16182, k7: 0.34627 },
  VOA:  { k1: 9.5606e-7, k2: -5.1543e-5, k3: 0.0011161, k4: -0.01242, k5: 0.075125, k6: -0.23584, k7: 0.33696 },
  HOA:  { k1: 0, k2: -3.1555e-6, k3: 0.0001682, k4: -0.0034607, k5: 0.034124, k6: -0.1599, k7: 0.34629 },
};

// Tables 3/4/5 — incident energy coefficients at 600 V / 2700 V / 14 300 V.
const TABLE_3 = { // 600 V
  VCB:  { k1: 0.753364, k2: 0.566, k3: 1.752636, k4: 0, k5: 0, k6: -4.783e-9, k7: 0.000001962, k8: -0.000229, k9: 0.003141, k10: 1.092, k11: 0, k12: -1.598, k13: 0.957 },
  VCBB: { k1: 3.068459, k2: 0.26, k3: -0.098107, k4: 0, k5: 0, k6: -5.767e-9, k7: 0.000002524, k8: -0.00034, k9: 0.01187, k10: 1.013, k11: -0.06, k12: -1.809, k13: 1.19 },
  HCB:  { k1: 4.073745, k2: 0.344, k3: -0.370259, k4: 0, k5: 0, k6: -5.382e-9, k7: 0.000002316, k8: -0.000302, k9: 0.0091, k10: 0.9725, k11: 0, k12: -2.03, k13: 1.036 },
  VOA:  { k1: 0.679294, k2: 0.746, k3: 1.222636, k4: 0, k5: 0, k6: -4.783e-9, k7: 0.000001962, k8: -0.000229, k9: 0.003141, k10: 1.092, k11: 0, k12: -1.598, k13: 0.997 },
  HOA:  { k1: 3.470417, k2: 0.465, k3: -0.261863, k4: 0, k5: 0, k6: -3.895e-9, k7: 0.000001641, k8: -0.000197, k9: 0.002615, k10: 1.1, k11: 0, k12: -1.99, k13: 1.04 },
};
const TABLE_4 = { // 2700 V
  VCB:  { k1: 2.40021, k2: 0.165, k3: 0.354202, k4: -1.557e-12, k5: 4.556e-10, k6: -4.186e-8, k7: 8.346e-7, k8: 5.482e-5, k9: -0.003191, k10: 0.9729, k11: 0, k12: -1.569, k13: 0.9778 },
  VCBB: { k1: 3.870592, k2: 0.185, k3: -0.736618, k4: 0, k5: -9.204e-11, k6: 2.901e-8, k7: -3.262e-6, k8: 0.0001569, k9: -0.004003, k10: 0.9825, k11: 0, k12: -1.742, k13: 1.09 },
  HCB:  { k1: 3.486391, k2: 0.177, k3: -0.193101, k4: 0, k5: 0, k6: 4.859e-10, k7: -1.814e-7, k8: -9.128e-6, k9: -0.0007, k10: 0.9881, k11: 0.027, k12: -1.723, k13: 1.055 },
  VOA:  { k1: 3.880724, k2: 0.105, k3: -1.906033, k4: -1.557e-12, k5: 4.556e-10, k6: -4.186e-8, k7: 8.346e-7, k8: 5.482e-5, k9: -0.003191, k10: 0.9729, k11: 0, k12: -1.515, k13: 1.115 },
  HOA:  { k1: 3.616266, k2: 0.149, k3: -0.761561, k4: 0, k5: 0, k6: 7.859e-10, k7: -1.914e-7, k8: -9.128e-6, k9: -0.0007, k10: 0.9981, k11: 0, k12: -1.639, k13: 1.078 },
};
const TABLE_5 = { // 14 300 V
  VCB:  { k1: 3.825917, k2: 0.11, k3: -0.999749, k4: -1.557e-12, k5: 4.556e-10, k6: -4.186e-8, k7: 8.346e-7, k8: 5.482e-5, k9: -0.003191, k10: 0.9729, k11: 0, k12: -1.568, k13: 0.99 },
  VCBB: { k1: 3.644309, k2: 0.215, k3: -0.585522, k4: 0, k5: -9.204e-11, k6: 2.901e-8, k7: -3.262e-6, k8: 0.0001569, k9: -0.004003, k10: 0.9825, k11: 0, k12: -1.677, k13: 1.06 },
  HCB:  { k1: 3.044516, k2: 0.125, k3: 0.245106, k4: 0, k5: -5.043e-11, k6: 2.233e-8, k7: -3.046e-6, k8: 0.000116, k9: -0.001145, k10: 0.9839, k11: 0, k12: -1.655, k13: 1.084 },
  VOA:  { k1: 3.405454, k2: 0.12, k3: -0.93245, k4: -1.557e-12, k5: 4.556e-10, k6: -4.186e-8, k7: 8.346e-7, k8: 5.482e-5, k9: -0.003191, k10: 0.9729, k11: 0, k12: -1.534, k13: 0.979 },
  HOA:  { k1: 2.04049, k2: 0.177, k3: 1.005092, k4: 0, k5: 0, k6: 7.859e-10, k7: -1.914e-7, k8: -9.128e-6, k9: -0.0007, k10: 0.9981, k11: -0.05, k12: -1.633, k13: 1.151 },
};

// Table 7 — enclosure-size correction polynomial coefficients, keyed [type][EC].
const TABLE_7 = {
  Typical: {
    VCB:  { b1: -0.000302, b2: 0.03441, b3: 0.4325 },
    VCBB: { b1: -0.0002976, b2: 0.032, b3: 0.479 },
    HCB:  { b1: -0.0001923, b2: 0.01935, b3: 0.6899 },
  },
  Shallow: {
    VCB:  { b1: 0.002222, b2: -0.02556, b3: 0.6222 },
    VCBB: { b1: -0.002778, b2: 0.1194, b3: -0.2778 },
    HCB:  { b1: -0.0005556, b2: 0.03722, b3: 0.4778 },
  },
};

// mm→inch conversion factor printed in the text of IEEE 1584-2018 (Tables 6/11/12
// were derived with this rounded value; use it for exact agreement).
const MM_TO_IN = 0.03937;
const CAL_PER_J = 1 / 4.184; // J/cm² → cal/cm²

const log10 = x => Math.log10(x);

/** Arcing-current variation correction factor VarCF (Eq. 2 sub-equation, Table 2). */
export function arcingCurrentVariation(EC, Voc_kV) {
  const k = TABLE_2[EC];
  const v = Voc_kV;
  return k.k1 * v ** 6 + k.k2 * v ** 5 + k.k3 * v ** 4 + k.k4 * v ** 3 + k.k5 * v ** 2 + k.k6 * v + k.k7;
}

/**
 * Enclosure size correction factor CF and equivalent enclosure size EES
 * (IEEE 1584-2018 Eq. 11–15, Tables 6 & 7). Open-air configs return CF = 1.
 */
export function enclosureCorrection({ EC, Voc_kV, height_mm, width_mm, depth_mm }) {
  if (EC === 'HOA' || EC === 'VOA') {
    return { CF: 1.0, EES: null, enclosureType: 'open', height1_in: null, width1_in: null };
  }

  const enclosureType = (Voc_kV < 0.6 && height_mm < 508 && width_mm < 508 && depth_mm <= 203.2)
    ? 'Shallow'
    : 'Typical';

  // Eq. 11/12 — adjusted dimension for boxes between 660.4 mm and 1244.6 mm.
  const constants = { VCB: [4, 20], VCBB: [10, 24], HCB: [10, 22] };
  const [A, B] = constants[EC];
  const eq1112 = dim_mm => {
    const y1 = dim_mm - 660.4;
    const y2 = (Voc_kV + A) / B;
    return (660.4 + y1 * y2) / 25.4; // inches
  };

  // Table 6 — width_1 (inches)
  let width1_in;
  const w = width_mm;
  if (w < 508) width1_in = enclosureType === 'Typical' ? 20 : MM_TO_IN * w;
  else if (w <= 660.4) width1_in = MM_TO_IN * w;
  else if (w <= 1244.6) width1_in = eq1112(w);
  else width1_in = eq1112(1244.6);

  // Table 6 — height_1 (inches)
  let height1_in;
  const h = height_mm;
  if (h < 508) height1_in = enclosureType === 'Typical' ? 20 : MM_TO_IN * h;
  else if (h <= 660.4) height1_in = MM_TO_IN * h;
  else if (h <= 1244.6) height1_in = EC === 'VCB' ? MM_TO_IN * h : eq1112(h);
  else height1_in = EC === 'VCB' ? 49 : eq1112(1244.6);

  // Eq. 13 — equivalent enclosure size (inches)
  const EES = (height1_in + width1_in) / 2;

  // Eq. 14/15 — correction factor from Table 7 polynomial
  const b = TABLE_7[enclosureType][EC];
  const poly = b.b1 * EES ** 2 + b.b2 * EES + b.b3;
  const CF = enclosureType === 'Typical' ? poly : 1 / poly;

  return { CF, EES, enclosureType, height1_in, width1_in };
}

/** Intermediate average arcing current Iarc at one model voltage (Eq. 1, Table 1). kA. */
export function arcingCurrentIntermediate(EC, Voc_kV, Ibf_kA, G_mm) {
  const k = TABLE_1[EC][Voc_kV];
  const x1 = k.k1 + k.k2 * log10(Ibf_kA) + k.k3 * log10(G_mm);
  const x2 = k.k4 * Ibf_kA ** 6 + k.k5 * Ibf_kA ** 5 + k.k6 * Ibf_kA ** 4
    + k.k7 * Ibf_kA ** 3 + k.k8 * Ibf_kA ** 2 + k.k9 * Ibf_kA + k.k10;
  return 10 ** x1 * x2;
}

/** Reduced (minimum) arcing current using VarCF (Eq. 2). kA. */
export function arcingCurrentMin(Iarc_kA, VarCF) {
  return Iarc_kA * (1 - 0.5 * VarCF);
}

/** Final LV (≤600 V) arcing current from the 600 V intermediate value (Eq. 25). kA. */
export function arcingCurrentFinalLV(Voc_kV, Iarc600_kA, Ibf_kA) {
  const x1 = (0.6 / Voc_kV) ** 2;
  const x2 = 1 / Iarc600_kA ** 2;
  const x3 = (0.6 ** 2 - Voc_kV ** 2) / (0.6 ** 2 * Ibf_kA ** 2);
  return 1 / Math.sqrt(x1 * (x2 - x3));
}

/**
 * Intermediate incident energy at one model voltage (Eq. 3–6). Returns J/cm².
 * For HV pass iArc600_kA = null; for LV pass the 600 V (full) intermediate current.
 */
function intermediateEnergyJ({ EC, vocLevel, Iarc_kA, Ibf_kA, T_s, G_mm, CF, D_mm, iArc600_kA }) {
  const k = vocLevel === 0.6 ? TABLE_3[EC] : vocLevel === 2.7 ? TABLE_4[EC] : TABLE_5[EC];
  const T_ms = T_s * 1000;
  const x1 = (12.552 / 50) * T_ms;
  const x2 = k.k1 + k.k2 * log10(G_mm);
  const x3num = iArc600_kA == null ? k.k3 * Iarc_kA : k.k3 * iArc600_kA;
  const x3den = k.k4 * Ibf_kA ** 7 + k.k5 * Ibf_kA ** 6 + k.k6 * Ibf_kA ** 5
    + k.k7 * Ibf_kA ** 4 + k.k8 * Ibf_kA ** 3 + k.k9 * Ibf_kA ** 2 + k.k10 * Ibf_kA;
  const x3 = x3num / x3den;
  const x4 = k.k11 * log10(Ibf_kA) + k.k13 * log10(Iarc_kA) + log10(1 / CF);
  const x5 = k.k12 * log10(D_mm);
  return x1 * 10 ** (x2 + x3 + x4 + x5);
}

/** Arc-flash boundary (Eq. 7–10) from an intermediate energy and its distance exponent. mm. */
function intermediateAFB({ EC, vocLevel, E_J, D_mm }) {
  const k = vocLevel === 0.6 ? TABLE_3[EC] : vocLevel === 2.7 ? TABLE_4[EC] : TABLE_5[EC];
  const F = E_J / D_mm ** k.k12;
  return (5.0208 / F) ** (1 / k.k12); // 1.2 cal/cm² = 5.0208 J/cm²
}

/** Voltage interpolation between the 600/2700/14300 V models (Eq. 16–24). */
function interpolate(Voc_kV, x600, x2700, x14300) {
  const x1 = ((x2700 - x600) / 2.1) * (Voc_kV - 2.7) + x2700;
  const x2 = ((x14300 - x2700) / 11.6) * (Voc_kV - 14.3) + x14300;
  const x3 = (x1 * (2.7 - Voc_kV)) / 2.1 + (x2 * (Voc_kV - 0.6)) / 2.1;
  if (Voc_kV > 0.6 && Voc_kV <= 2.7) return x3;
  return x2; // Voc_kV > 2.7
}

/** Whether inputs fall inside the IEEE 1584-2018 model validity range (§4.2). */
export function withinModelRange({ Voc_kV, Ibf_kA, G_mm, D_mm }) {
  const reasons = [];
  if (!(Voc_kV >= 0.208 && Voc_kV <= 15)) reasons.push(`voltage ${Voc_kV} kV outside 0.208–15 kV`);
  if (Voc_kV <= 0.6) {
    if (!(Ibf_kA >= 0.5 && Ibf_kA <= 106)) reasons.push(`bolted fault ${Ibf_kA} kA outside LV range 0.5–106 kA`);
    if (!(G_mm >= 6.35 && G_mm <= 76.2)) reasons.push(`gap ${G_mm} mm outside LV range 6.35–76.2 mm`);
  } else {
    if (!(Ibf_kA >= 0.2 && Ibf_kA <= 65)) reasons.push(`bolted fault ${Ibf_kA} kA outside HV range 0.2–65 kA`);
    if (!(G_mm >= 19.05 && G_mm <= 254)) reasons.push(`gap ${G_mm} mm outside HV range 19.05–254 mm`);
  }
  if (!(D_mm >= 305)) reasons.push(`working distance ${D_mm} mm below 305 mm minimum`);
  return { ok: reasons.length === 0, reasons };
}

/**
 * Compute the full and reduced arcing currents for a cubicle (IEEE 1584-2018
 * Step 1/2/8/9/10). Returns per-model-voltage values (HV) and the interpolated
 * final currents, plus CF/EES/VarCF.
 */
export function arcingCurrents({ EC, Voc_kV, Ibf_kA, G_mm, height_mm, width_mm, depth_mm }) {
  const vlevel = Voc_kV <= 0.6 ? 'LV' : 'HV';
  const VarCF = arcingCurrentVariation(EC, Voc_kV);
  const enc = enclosureCorrection({ EC, Voc_kV, height_mm, width_mm, depth_mm });

  if (vlevel === 'HV') {
    const full600 = arcingCurrentIntermediate(EC, 0.6, Ibf_kA, G_mm);
    const full2700 = arcingCurrentIntermediate(EC, 2.7, Ibf_kA, G_mm);
    const full14300 = arcingCurrentIntermediate(EC, 14.3, Ibf_kA, G_mm);
    const min600 = arcingCurrentMin(full600, VarCF);
    const min2700 = arcingCurrentMin(full2700, VarCF);
    const min14300 = arcingCurrentMin(full14300, VarCF);
    return {
      vlevel, VarCF, ...enc,
      iArc600Full: full600,
      full: { iArc: interpolate(Voc_kV, full600, full2700, full14300), perV: { 0.6: full600, 2.7: full2700, 14.3: full14300 } },
      reduced: { iArc: interpolate(Voc_kV, min600, min2700, min14300), perV: { 0.6: min600, 2.7: min2700, 14.3: min14300 } },
    };
  }

  // LV
  const iArc600 = arcingCurrentIntermediate(EC, 0.6, Ibf_kA, G_mm);
  const iArcFull = arcingCurrentFinalLV(Voc_kV, iArc600, Ibf_kA);
  const iArcReduced = arcingCurrentMin(iArcFull, VarCF);
  return {
    vlevel, VarCF, ...enc,
    iArc600Full: iArc600,
    full: { iArc: iArcFull },
    reduced: { iArc: iArcReduced },
  };
}

/**
 * Incident energy and arc-flash boundary for one case ('full' or 'reduced'),
 * given the arcing currents and the clearing time for that case.
 *
 * @returns {{ E_cal:number, E_J:number, AFB_mm:number, iArc_kA:number }}
 */
export function incidentEnergy(params, ac, which, T_s) {
  const { EC, Voc_kV, Ibf_kA, G_mm, D_mm } = params;
  const caseData = ac[which];
  const CF = ac.CF;

  if (ac.vlevel === 'HV') {
    const levels = [0.6, 2.7, 14.3];
    const E = {};
    const AFB = {};
    for (const lv of levels) {
      E[lv] = intermediateEnergyJ({ EC, vocLevel: lv, Iarc_kA: caseData.perV[lv], Ibf_kA, T_s, G_mm, CF, D_mm, iArc600_kA: null });
      AFB[lv] = intermediateAFB({ EC, vocLevel: lv, E_J: E[lv], D_mm });
    }
    const E_J = interpolate(Voc_kV, E[0.6], E[2.7], E[14.3]);
    const AFB_mm = interpolate(Voc_kV, AFB[0.6], AFB[2.7], AFB[14.3]);
    return { E_cal: E_J * CAL_PER_J, E_J, AFB_mm, iArc_kA: caseData.iArc };
  }

  // LV: energy model uses the FULL 600 V intermediate current for the x3 term,
  // and the case's final arcing current for the x4 term (per IEEE 1584-2018).
  const E_J = intermediateEnergyJ({
    EC, vocLevel: Voc_kV <= 0.6 ? 0.6 : 0.6, Iarc_kA: caseData.iArc, Ibf_kA, T_s, G_mm, CF, D_mm, iArc600_kA: ac.iArc600Full,
  });
  const AFB_mm = intermediateAFB({ EC, vocLevel: 0.6, E_J, D_mm });
  return { E_cal: E_J * CAL_PER_J, E_J, AFB_mm, iArc_kA: caseData.iArc };
}

export { ELECTRODE_CONFIGS };

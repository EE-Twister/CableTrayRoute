/**
 * Unified Cable Thermal Environment (Gap #75)
 *
 * Orchestrator that normalises one set of cable + environment + load-profile
 * inputs and dispatches to the existing thermal engines so an engineer can
 * compare ampacity across four installation methods (tray, conduit, duct bank,
 * direct burial) side-by-side with a derating waterfall identifying the
 * limiting factor.
 *
 * No new thermal physics — all computation is delegated to:
 *   - analysis/iec60287.mjs       — IEC 60287-1-1 ampacity engine
 *   - analysis/autoSize.mjs       — NEC 310 derating factors
 *
 * Pure module — no DOM, no storage access.
 */

import {
  calcAmpacity,
  thermalResistances,
  groupDerating,
  defaultInsulThickMm,
  MAX_TEMP_C,
} from './iec60287.mjs';
import {
  ambientTempFactor,
  bundlingFactor,
  trayFillFactor,
} from './autoSize.mjs';

export const INSTALLATION_KEYS = ['tray', 'conduit', 'duct-bank', 'direct-burial'];

const INSTALLATION_LABELS = {
  tray:             'Cable tray (in air)',
  conduit:          'Conduit (buried)',
  'duct-bank':      'Duct bank (multi-circuit)',
  'direct-burial':  'Direct burial',
};

const STEP_LABELS = {
  base:        'Base table ampacity',
  ambient:     'Ambient temperature correction',
  grouping:    'Grouping / mutual heating',
  installation:'Installation-specific',
};

// ---------------------------------------------------------------------------
// AWG ↔ mm² mapping (NEC sizes commonly entered alongside IEC mm² inputs)
// Cross-section areas per NEC Chapter 9 Table 8 (rounded).
// ---------------------------------------------------------------------------
const AWG_TO_MM2 = {
  '14':   2.08,  '12':  3.31,  '10':  5.26,  '8':   8.37,
  '6':   13.30,  '4':  21.20,  '3':  26.70,  '2':  33.60,
  '1':   42.40,
  '1/0': 53.50,  '2/0': 67.40, '3/0': 85.00, '4/0': 107.00,
  '250': 127.00, '300': 152.00, '350': 177.00, '400': 203.00,
  '500': 253.00, '600': 304.00, '750': 380.00, '1000': 507.00,
};

const MATERIAL_ALIASES = {
  cu: 'Cu', copper: 'Cu', CU: 'Cu', Cu: 'Cu',
  al: 'Al', aluminum: 'Al', aluminium: 'Al', AL: 'Al', Al: 'Al',
};

const INSULATION_ALIASES = {
  xlpe: 'XLPE', XLPE: 'XLPE',
  epr:  'EPR',  EPR:  'EPR',
  pvc:  'PVC',  PVC:  'PVC',
  lszh: 'LSZH', LSZH: 'LSZH',
  'xlpe-ht': 'XLPE-HT', 'XLPE-HT': 'XLPE-HT',
};

// ---------------------------------------------------------------------------
// normalizeEnvironment
// ---------------------------------------------------------------------------

/**
 * Normalise raw inputs into the canonical schema used internally.
 *
 * Accepts AWG sizes (string) or mm² (number); °F or °C ambient; copper/cu/Cu
 * aliases; defaults soil resistivity (1.0 K·m/W), burial depth (800 mm),
 * insulation thickness via defaultInsulThickMm() when omitted.
 *
 * @param {object} raw
 * @returns {NormalizedInputs}
 */
export function normalizeEnvironment(raw = {}) {
  const cableRaw = raw.cable || {};
  const ambientRaw = raw.ambient || {};
  const groupingRaw = raw.grouping || {};
  const instRaw = raw.installations || {};
  const profileRaw = raw.loadProfile || null;

  // --- Cable size: accept AWG string or mm² number ---
  let sizeMm2 = cableRaw.sizeMm2;
  if (sizeMm2 == null && cableRaw.sizeAwg != null) {
    const key = String(cableRaw.sizeAwg).replace(/[#\s]/g, '').toUpperCase();
    const awgKey = key.replace('AWG', '').replace('KCMIL', '').trim();
    sizeMm2 = AWG_TO_MM2[awgKey];
    if (sizeMm2 == null) {
      throw new Error(`Unknown AWG/kcmil size: ${cableRaw.sizeAwg}`);
    }
  }
  if (!sizeMm2 || sizeMm2 <= 0) {
    throw new Error('cable.sizeMm2 (or cable.sizeAwg) is required');
  }

  // --- Material ---
  const materialKey = String(cableRaw.material ?? 'Cu');
  const material = MATERIAL_ALIASES[materialKey] || MATERIAL_ALIASES[materialKey.toLowerCase()];
  if (!material) {
    throw new Error(`Unknown conductor material: ${cableRaw.material}`);
  }

  // --- Insulation ---
  const insulKey = String(cableRaw.insulation ?? 'XLPE');
  const insulation = INSULATION_ALIASES[insulKey] || INSULATION_ALIASES[insulKey.toLowerCase()];
  if (!insulation) {
    throw new Error(`Unknown insulation type: ${cableRaw.insulation}`);
  }

  // --- Voltage class & insulation thickness ---
  const voltageClass = cableRaw.voltageClass || '0.6/1kV';
  const insulThickMm = cableRaw.insulThickMm ?? defaultInsulThickMm(sizeMm2, voltageClass);

  const nCores = cableRaw.nCores ?? 3;
  const armoured = !!cableRaw.armoured;
  const U0_kV = cableRaw.U0_kV ?? 0;

  // --- Ambient (°F → °C conversion when units flagged) ---
  let tempC = ambientRaw.tempC;
  if (tempC == null && ambientRaw.tempF != null) {
    tempC = (Number(ambientRaw.tempF) - 32) * 5 / 9;
  }
  if (tempC == null) tempC = 30; // NEC reference ambient

  let soilTempC = ambientRaw.soilTempC;
  if (soilTempC == null && ambientRaw.soilTempF != null) {
    soilTempC = (Number(ambientRaw.soilTempF) - 32) * 5 / 9;
  }
  if (soilTempC == null) soilTempC = 20; // IEC 60287 reference soil temperature

  const frequencyHz = ambientRaw.frequencyHz ?? 60;

  // Reject ambient ≥ θ_max for the selected insulation
  const thetaMax = MAX_TEMP_C[insulation];
  if (tempC >= thetaMax) {
    throw new Error(
      `Ambient temperature ${tempC} °C is ≥ maximum conductor temperature ${thetaMax} °C for ${insulation}`,
    );
  }

  // --- Grouping ---
  const nCables = groupingRaw.nCables ?? 1;
  const arrangement = groupingRaw.arrangement ?? 'flat';

  // --- Installations: default all four included ---
  const installations = {
    tray:            normalizeInstallation('tray',           instRaw.tray),
    conduit:         normalizeInstallation('conduit',        instRaw.conduit),
    'duct-bank':     normalizeInstallation('duct-bank',      instRaw['duct-bank']),
    'direct-burial': normalizeInstallation('direct-burial',  instRaw['direct-burial']),
  };

  // --- Load profile ---
  let loadProfile = null;
  if (profileRaw && Array.isArray(profileRaw.hourly) && profileRaw.hourly.length > 0) {
    loadProfile = {
      hourly: profileRaw.hourly.map(v => Number(v)),
      basis: profileRaw.basis === 'per-unit' ? 'per-unit' : 'absolute-A',
      peakAmps: profileRaw.peakAmps != null ? Number(profileRaw.peakAmps) : null,
    };
  }

  return {
    cable: {
      sizeMm2: Number(sizeMm2),
      material,
      insulation,
      voltageClass,
      insulThickMm: Number(insulThickMm),
      nCores: Number(nCores),
      armoured,
      U0_kV: Number(U0_kV),
    },
    ambient: {
      tempC: Number(tempC),
      soilTempC: Number(soilTempC),
      frequencyHz: Number(frequencyHz),
    },
    grouping: {
      nCables: Number(nCables),
      arrangement,
    },
    installations,
    loadProfile,
    designCurrentA: raw.designCurrentA != null ? Number(raw.designCurrentA) : null,
  };
}

function normalizeInstallation(key, raw = {}) {
  const r = raw || {};
  const included = r.included !== false; // default true unless explicitly disabled
  switch (key) {
    case 'tray':
      return {
        included,
        fillType: r.fillType === 'solid' ? 'solid' : 'ladder',
        layers: r.layers ?? 1,
        bundleCount: r.bundleCount ?? null,
        racewayFillPct: r.racewayFillPct ?? null,
      };
    case 'conduit':
      return {
        included,
        conduitOD_mm: r.conduitOD_mm ?? 100,
        conduitMaterial: r.conduitMaterial === 'steel' ? 'steel' : 'PVC',
        burialDepthMm: r.burialDepthMm ?? 800,
      };
    case 'duct-bank':
      return {
        included,
        ductCount: r.ductCount ?? 6,
        rows: r.rows ?? 2,
        cols: r.cols ?? 3,
        spacingMm: r.spacingMm ?? 200,
        burialDepthMm: r.burialDepthMm ?? 900,
        conduitOD_mm: r.conduitOD_mm ?? 100,
      };
    case 'direct-burial':
      return {
        included,
        burialDepthMm: r.burialDepthMm ?? 800,
        soilResistivity: r.soilResistivity ?? 1.0,
        thermalBackfillRho: r.thermalBackfillRho ?? null,
      };
    default:
      return { included };
  }
}

// ---------------------------------------------------------------------------
// computeInstallationCases
// ---------------------------------------------------------------------------

/**
 * Run each enabled installation through calcAmpacity() and return the raw
 * IEC 60287 result plus a derating waterfall.
 *
 * @param {NormalizedInputs} norm
 * @returns {{ cases: ResultCase[] }}
 */
export function computeInstallationCases(norm) {
  const cases = [];

  for (const key of INSTALLATION_KEYS) {
    const inst = norm.installations[key];
    if (!inst || !inst.included) continue;

    const params = buildAmpacityParams(norm, key);
    let iecResult;
    try {
      iecResult = calcAmpacity(params);
    } catch (err) {
      cases.push({
        installation: key,
        label: INSTALLATION_LABELS[key],
        error: err.message,
        baseAmpacity_A: null,
        deratedAmpacity_A: null,
        waterfall: { steps: [], limitingFactor: null },
        maxConductorTempC: null,
        warnings: [err.message],
      });
      continue;
    }

    const waterfall = buildDeratingWaterfall({ key, norm, iecResult });
    cases.push({
      installation: key,
      label: INSTALLATION_LABELS[key],
      baseAmpacity_A: round1(iecResult.I_base),
      deratedAmpacity_A: round1(iecResult.I_rated),
      waterfall,
      maxConductorTempC: iecResult.thetaConductorActual,
      iec60287Raw: iecResult,
      warnings: iecResult.warnings || [],
    });
  }

  return { cases };
}

function buildAmpacityParams(norm, key) {
  const { cable, ambient, grouping, installations } = norm;
  const inst = installations[key];

  // IEC 60287 install methods supported: direct-burial | conduit | tray | air
  // Duct bank is modelled as 'conduit' with N parallel circuits passed via nCables.
  const installMethod = key === 'duct-bank' ? 'conduit' : key;

  // For tray/air, use ambient air temperature; for buried, use soil temperature.
  const useSoilTemp = key === 'direct-burial' || key === 'conduit' || key === 'duct-bank';
  const ambientTempC = useSoilTemp ? ambient.soilTempC : ambient.tempC;

  // For duct bank, fold N circuits into the grouping count.
  const nCables = key === 'duct-bank'
    ? Math.max(grouping.nCables, inst.ductCount)
    : grouping.nCables;

  return {
    sizeMm2: cable.sizeMm2,
    material: cable.material,
    insulation: cable.insulation,
    insulThickMm: cable.insulThickMm,
    nCores: cable.nCores,
    armoured: cable.armoured,
    installMethod,
    burialDepthMm: inst.burialDepthMm ?? 800,
    soilResistivity: inst.soilResistivity ?? 1.0,
    conduitOD_mm: inst.conduitOD_mm ?? 0,
    ambientTempC,
    frequencyHz: ambient.frequencyHz,
    U0_kV: cable.U0_kV,
    nCables,
    groupArrangement: grouping.arrangement,
  };
}

// ---------------------------------------------------------------------------
// buildDeratingWaterfall
// ---------------------------------------------------------------------------

/**
 * Build an ordered derating waterfall for a single installation case.
 *
 * Step order is fixed and verified by tests:
 *   1. Base table ampacity (factor = 1.0)
 *   2. Ambient temperature correction
 *   3. Grouping / mutual heating
 *   4. Installation-specific (tray fill / conduit / soil ρ)
 *
 * The product of all step factors equals deratedAmpacity_A / baseAmpacity_A.
 *
 * @param {object} ctx { key, norm, iecResult }
 * @returns {{ steps: WaterfallStep[], limitingFactor: string }}
 */
export function buildDeratingWaterfall({ key, norm, iecResult }) {
  const steps = [];
  const I_base = iecResult.I_base;
  const I_rated = iecResult.I_rated;

  // Step 1 — base table ampacity (the calcAmpacity I_base at this ambient + install method)
  steps.push({
    label: STEP_LABELS.base,
    factor: 1.0,
    value: round1(I_base),
    delta: 0,
    source: 'IEC 60287-1-1 §3.1.1',
  });

  // Step 2 — Ambient temperature correction (NEC 310.15(B)(1)(a) factor)
  // Use the NEC factor as the user-visible derating step. The actual physics
  // is already embedded in I_base via Δθ; this presentation step explains the
  // contribution at NEC reference 30 °C ambient.
  const tempRating = MAX_TEMP_C[norm.cable.insulation];
  const useSoilTemp = key === 'direct-burial' || key === 'conduit' || key === 'duct-bank';
  const ambientUsed = useSoilTemp ? norm.ambient.soilTempC : norm.ambient.tempC;
  const necTempRating = tempRating >= 90 ? 90 : tempRating >= 75 ? 75 : 60;
  const fAmbient = ambientTempFactor(ambientUsed, necTempRating);
  // Anchor the cumulative waterfall on I_rated so the product matches exactly.
  // The presentational factor is the NEC table value; the cumulative running
  // value continues to track the IEC physics.
  const runningAfterAmbient = round1(I_base * fAmbient);
  steps.push({
    label: STEP_LABELS.ambient,
    factor: round4(fAmbient),
    value: runningAfterAmbient,
    delta: round1(runningAfterAmbient - I_base),
    source: `NEC 310.15(B)(1)(a) @ ${round1(ambientUsed)} °C, ${necTempRating} °C rating`,
  });

  // Step 3 — Grouping / mutual heating (use IEC factor from calcAmpacity result)
  const fGroup = iecResult.f_group ?? groupDerating(norm.grouping.nCables, norm.grouping.arrangement);
  const runningAfterGroup = round1(runningAfterAmbient * fGroup);
  steps.push({
    label: STEP_LABELS.grouping,
    factor: round4(fGroup),
    value: runningAfterGroup,
    delta: round1(runningAfterGroup - runningAfterAmbient),
    source: `IEC 60287-2-1 grouping (n=${iecResult.nCables}, ${iecResult.groupArrangement})`,
  });

  // Step 4 — Installation-specific factor (closes the gap to I_rated)
  // The IEC physics already accounts for installation method and grouping in
  // I_rated; this final step represents what's left after the previous two
  // presentational factors and is labelled by the installation key.
  let installSource;
  let installFactor;
  if (key === 'tray') {
    const fTray = trayFillFactor(norm.installations.tray.fillType === 'solid' ? 'tray_touching' : 'tray_spaced');
    installFactor = round4(I_rated / Math.max(runningAfterGroup, 1e-6));
    installSource = `NEC 392.80(A) tray fill (${norm.installations.tray.fillType} = ${fTray})`;
  } else if (key === 'conduit') {
    installFactor = round4(I_rated / Math.max(runningAfterGroup, 1e-6));
    installSource = `IEC 60287-2-1 conduit T4 (OD ${norm.installations.conduit.conduitOD_mm} mm, depth ${norm.installations.conduit.burialDepthMm} mm)`;
  } else if (key === 'duct-bank') {
    installFactor = round4(I_rated / Math.max(runningAfterGroup, 1e-6));
    installSource = `Duct bank ${norm.installations['duct-bank'].rows}×${norm.installations['duct-bank'].cols} @ ${norm.installations['duct-bank'].spacingMm} mm`;
  } else {
    installFactor = round4(I_rated / Math.max(runningAfterGroup, 1e-6));
    installSource = `IEC 60287-2-1 direct burial (ρ_soil ${norm.installations['direct-burial'].soilResistivity} K·m/W)`;
  }
  steps.push({
    label: `${STEP_LABELS.installation} (${INSTALLATION_LABELS[key]})`,
    factor: installFactor,
    value: round1(I_rated),
    delta: round1(I_rated - runningAfterGroup),
    source: installSource,
  });

  // Limiting factor = step with the smallest factor < 1.0
  // (excluding the base step which is by definition 1.0)
  let limitingFactor = null;
  let minFactor = 1.0;
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].factor < minFactor) {
      minFactor = steps[i].factor;
      limitingFactor = steps[i].label;
    }
  }

  return { steps, limitingFactor };
}

// ---------------------------------------------------------------------------
// simulateLoadProfile
// ---------------------------------------------------------------------------

/**
 * First-order RC thermal model: given a 24-hour current profile, integrate
 * conductor temperature using τ derived from Σ Rth · Cth.
 *
 * This is a SIMPLIFIED screening approximation. Full IEC 60853-1/-2 cyclic
 * rating is out of scope.
 *
 * @param {ResultCase} caseResult
 * @param {LoadProfile} profile
 * @returns {{ timeline: TimelinePoint[], maxTempC: number, hottestHour: number }}
 */
export function simulateLoadProfile(caseResult, profile) {
  if (!profile || !Array.isArray(profile.hourly) || profile.hourly.length === 0) {
    return null;
  }
  const iec = caseResult.iec60287Raw;
  if (!iec) return null;

  const { T1, T2, T3, T4 } = iec.thermalResistances;
  const nCores = iec.iec60287Raw?.nCores ?? 3;
  const R_ac = iec.R_ac;
  const ambientC = iec.ambientTempC;
  const thetaMax = iec.thetaMax;

  // Lumped Cth ≈ nCores × sizeMm2 × specific heat per metre.
  // Specific heat of copper: ~385 J/(kg·K); density: 8960 kg/m³
  // For 1 m of cable with cross-section A (mm² → m²): C = ρ · V · cp
  const sizeM2 = iec.sizeMm2 * 1e-6;
  const cv_per_metre = (iec.material === 'Al' ? 2400 : 3450) * sizeM2 * nCores; // J/(K·m), approx
  const Rth_total = T1 + nCores * (T2 + T3 + T4);
  const tau_s = Math.max(60, Rth_total * cv_per_metre); // floor of 1 minute

  // Convert hourly samples to absolute amps
  const peak = profile.peakAmps ?? caseResult.deratedAmpacity_A ?? 1;
  const ampsArray = profile.hourly.map(v =>
    profile.basis === 'per-unit' ? Number(v) * peak : Number(v),
  );

  // Per-hour steady-state theta then exponential approach with τ
  // theta_t(t) = theta_{t-1} + (theta_ss - theta_{t-1}) * (1 - exp(-Δt/τ))
  const dt_s = 3600;
  const alpha = 1 - Math.exp(-dt_s / tau_s);

  let theta = ambientC;
  const timeline = [];
  let maxTempC = -Infinity;
  let hottestHour = 0;

  for (let i = 0; i < ampsArray.length; i++) {
    const I = ampsArray[i];
    const rise = (I ** 2) * R_ac * Rth_total;
    const thetaSs = ambientC + rise;
    theta = theta + (thetaSs - theta) * alpha;
    timeline.push({ hour: i, currentA: round1(I), tempC: round1(theta) });
    if (theta > maxTempC) {
      maxTempC = theta;
      hottestHour = i;
    }
  }

  return {
    timeline,
    maxTempC: round1(maxTempC),
    hottestHour,
    thetaMax,
    tau_s: Math.round(tau_s),
    headroomC: round1(thetaMax - maxTempC),
  };
}

// ---------------------------------------------------------------------------
// runThermalEnvironment — top-level composer
// ---------------------------------------------------------------------------

/**
 * Top-level entry: normalise inputs, run all included installations, build
 * comparison summary, optionally simulate the load profile. Returns the full
 * Study payload suitable for setStudies('cableThermalEnvironment', ...).
 */
export function runThermalEnvironment(rawInputs = {}) {
  const norm = normalizeEnvironment(rawInputs);
  const { cases } = computeInstallationCases(norm);

  // Comparison summary
  const valid = cases.filter(c => Number.isFinite(c.deratedAmpacity_A));
  let bestCase = null;
  let worstCase = null;
  let spreadPct = 0;
  if (valid.length > 0) {
    const sorted = [...valid].sort((a, b) => b.deratedAmpacity_A - a.deratedAmpacity_A);
    bestCase = sorted[0].installation;
    worstCase = sorted[sorted.length - 1].installation;
    const hi = sorted[0].deratedAmpacity_A;
    const lo = sorted[sorted.length - 1].deratedAmpacity_A;
    spreadPct = hi > 0 ? round1(((hi - lo) / hi) * 100) : 0;
  }

  // Load profile (run against best case as the reference installation)
  let loadProfile = null;
  if (norm.loadProfile && valid.length > 0) {
    const refCase = valid.find(c => c.installation === bestCase) || valid[0];
    loadProfile = simulateLoadProfile(refCase, norm.loadProfile);
  }

  return {
    inputs: norm,
    cases,
    comparison: { bestCase, worstCase, spreadPct },
    loadProfile,
    metadata: {
      standard: 'IEC 60287-1-1:2023 + NEC 310 (composite)',
      timestamp: new Date().toISOString(),
      version: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// extractThermalEnvRecs — designCoach.mjs integration
// ---------------------------------------------------------------------------

/**
 * Convert a saved Cable Thermal Environment study into Design Coach
 * recommendations. Same shape as extractEquipmentEvalRecs() in
 * analysis/designCoach.mjs.
 */
export function extractThermalEnvRecs(study) {
  const recs = [];
  if (!study || !Array.isArray(study.cases)) return recs;

  const thetaMax = MAX_TEMP_C[study.inputs?.cable?.insulation] ?? 90;

  for (const c of study.cases) {
    if (c.error) continue;

    // 1. Conductor temperature within 5% of θ_max
    if (c.maxConductorTempC != null && c.maxConductorTempC / thetaMax > 0.95) {
      recs.push({
        id: `thermal-env-${c.installation}-hot`,
        sourceStudy: 'cableThermalEnvironment',
        severity: 'compliance',
        title: `${c.label}: conductor temperature near θ_max`,
        detail: `θ_conductor ${c.maxConductorTempC} °C exceeds 95% of θ_max ${thetaMax} °C. Consider larger conductor or improved installation.`,
        studyPage: 'cablethermalenv.html',
        location: c.installation,
        safe_to_apply: false,
      });
    }

    // 2. Severe grouping derating (< 0.6)
    const groupStep = (c.waterfall?.steps || []).find(s => /grouping/i.test(s.label));
    if (groupStep && groupStep.factor < 0.6) {
      recs.push({
        id: `thermal-env-${c.installation}-grouping`,
        sourceStudy: 'cableThermalEnvironment',
        severity: 'efficiency',
        title: `${c.label}: severe grouping derating`,
        detail: `Grouping factor ${groupStep.factor} reduces ampacity ${Math.round((1 - groupStep.factor) * 100)}%. Increase spacing or split into multiple raceways.`,
        studyPage: 'cablethermalenv.html',
        location: c.installation,
        safe_to_apply: false,
      });
    }
  }

  // 3. High direct-burial soil resistivity
  const burial = study.inputs?.installations?.['direct-burial'];
  if (burial?.included && burial.soilResistivity > 2.5) {
    recs.push({
      id: 'thermal-env-soil-rho',
      sourceStudy: 'cableThermalEnvironment',
      severity: 'safety',
      title: 'High direct-burial soil thermal resistivity',
      detail: `Soil ρ = ${burial.soilResistivity} K·m/W is high; consider thermal backfill or duct bank with controlled backfill.`,
      studyPage: 'cablethermalenv.html',
      location: 'direct-burial',
      safe_to_apply: false,
    });
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round1(v) { return Math.round(v * 10) / 10; }
function round4(v) { return Math.round(v * 10000) / 10000; }

export { INSTALLATION_LABELS, STEP_LABELS };

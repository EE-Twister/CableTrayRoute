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
import { mutualHeatingT4 } from './buriedCableThermal.mjs';

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
export const AWG_TO_MM2 = {
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
    case 'duct-bank': {
      const ductCount = Math.max(1, Math.round(Number(r.ductCount ?? 6)));
      // With no explicit layout, pack the ducts into a compact grid (6 -> 2 x 3).
      const cols = Math.max(1, Math.round(Number(r.cols ?? Math.ceil(Math.sqrt(ductCount * 1.5)))));
      const rows = Math.max(1, Math.round(Number(r.rows ?? Math.ceil(ductCount / cols))));
      return {
        included,
        ductCount,
        rows,
        cols,
        spacingMm: r.spacingMm ?? 200,
        burialDepthMm: r.burialDepthMm ?? 900,
        conduitOD_mm: r.conduitOD_mm ?? 100,
      };
    }
    case 'direct-burial':
      return {
        included,
        burialDepthMm: r.burialDepthMm ?? 800,
        soilResistivity: r.soilResistivity ?? 1.0,
        spacingMm: r.spacingMm ?? null,
      };
    default:
      return { included };
  }
}

// ---------------------------------------------------------------------------
// computeInstallationCases
// ---------------------------------------------------------------------------

/** Reference ambient temperatures (°C) at which "base table ampacity" is quoted. */
const REFERENCE_AMBIENT_C = { air: 30, soil: 20 };

/**
 * Run each enabled installation through calcAmpacity() and return the raw
 * IEC 60287 result plus a derating waterfall.
 *
 * "Base" is the single-cable rating in that installation at the reference
 * ambient (30 °C air, 20 °C soil). Ambient and grouping then follow as real,
 * computed factors, so the waterfall multiplies exactly to the derated rating.
 * Grouping in tray or a single conduit uses the IEC group table; buried
 * cases (direct burial, duct bank) use the geometric image method so cable
 * spacing, rows and columns affect the result.
 *
 * @param {NormalizedInputs} norm
 * @returns {{ cases: ResultCase[] }}
 */
export function computeInstallationCases(norm) {
  const cases = [];

  for (const key of INSTALLATION_KEYS) {
    const inst = norm.installations[key];
    if (!inst || !inst.included) continue;

    let rated;
    try {
      rated = rateInstallation(norm, key);
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

    const waterfall = buildDeratingWaterfall({ key, norm, iecResult: rated.raw, refBaseA: rated.refA });
    cases.push({
      installation: key,
      label: INSTALLATION_LABELS[key],
      nCores: norm.cable.nCores,
      baseAmpacity_A: round1(rated.refA),
      deratedAmpacity_A: round1(rated.raw.I_rated),
      waterfall,
      maxConductorTempC: rated.raw.thetaConductorActual,
      iec60287Raw: rated.raw,
      warnings: rated.raw.warnings || [],
    });
  }

  return { cases };
}

function rateInstallation(norm, key) {
  const { grouping, ambient } = norm;
  const buried = key !== 'tray';
  const refAmbient = buried ? REFERENCE_AMBIENT_C.soil : REFERENCE_AMBIENT_C.air;
  const actualAmbient = buried ? ambient.soilTempC : ambient.tempC;
  const single = buildAmpacityParams(norm, key);
  const rate = (overrides = {}) => calcAmpacity({ ...single, ...overrides });

  // Reference conditions may sit at or above the insulation limit for low-temperature
  // ratings (e.g. 70 °C PVC at a 30 °C reference is fine; guard anyway).
  const refA = rate({ ambientTempC: Math.min(refAmbient, MAX_TEMP_C[norm.cable.insulation] - 1) }).I_base;
  const singleActual = rate();

  if (key === 'tray' || key === 'conduit') {
    const grouped = rate({ nCables: grouping.nCables, groupArrangement: grouping.arrangement });
    return { refA, raw: { ...grouped, groupingMethod: 'table' } };
  }

  const sources = buriedSources(norm, key, singleActual.D_e_mm);
  const rho = norm.installations['direct-burial'].soilResistivity;
  let hottest = null;
  let hottestExtra = 0;
  sources.forEach((source, index) => {
    const extra = sources.length > 1 ? mutualHeatingT4(sources, index, rho) : 0;
    const result = rate({ burialDepthMm: source.y, externalT4Extra: extra, nCables: 1 });
    if (!hottest || result.I_base < hottest.I_base) {
      hottest = result;
      hottestExtra = extra;
    }
  });

  const grouped = hottest.I_base;
  return {
    refA,
    raw: {
      ...hottest,
      I_base: singleActual.I_base,
      I_rated: grouped,
      nCables: sources.length,
      groupArrangement: key === 'duct-bank' ? 'duct-bank' : grouping.arrangement,
      f_group: Math.round((grouped / singleActual.I_base) * 10000) / 10000,
      groupingMethod: 'image-method',
      thermalResistances: { ...hottest.thermalResistances, T4: hottest.thermalResistances.T4 + hottestExtra },
    },
  };
}

/**
 * Cable centres (mm, y = depth) for the buried cases. Heat sources are the
 * cables themselves; in a duct bank each conduit carries one loaded cable
 * at its centre.
 */
function buriedSources(norm, key, cableOdMm) {
  const { grouping } = norm;
  if (key === 'duct-bank') {
    const inst = norm.installations['duct-bank'];
    const loaded = Math.min(200, Math.max(grouping.nCables, inst.ductCount));
    const cols = inst.cols;
    const pitch = inst.conduitOD_mm + inst.spacingMm;
    const sources = [];
    for (let i = 0; i < loaded; i += 1) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      sources.push({ x: (col - (cols - 1) / 2) * pitch, y: inst.burialDepthMm + row * pitch });
    }
    return sources;
  }

  const inst = norm.installations['direct-burial'];
  const n = Math.max(1, grouping.nCables);
  const depth = inst.burialDepthMm;
  if (n === 1) return [{ x: 0, y: depth }];
  if (grouping.arrangement === 'trefoil' && n <= 3) {
    const offsets = n === 2
      ? [{ x: -cableOdMm / 2, y: 0 }, { x: cableOdMm / 2, y: 0 }]
      : [{ x: 0, y: 0 }, { x: -cableOdMm / 2, y: cableOdMm * Math.sqrt(3) / 2 }, { x: cableOdMm / 2, y: cableOdMm * Math.sqrt(3) / 2 }];
    return offsets.map(o => ({ x: o.x, y: depth + o.y }));
  }
  const touching = grouping.arrangement === 'trefoil' || grouping.arrangement === 'flat-touching';
  const clearance = inst.spacingMm ?? (touching ? 0 : cableOdMm);
  const pitch = cableOdMm + clearance;
  return Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * pitch, y: depth }));
}

function buildAmpacityParams(norm, key) {
  const { cable, ambient, installations } = norm;
  const inst = installations[key];

  // IEC 60287 install methods supported: direct-burial | conduit | tray | air
  // Duct bank conduits are rated as 'conduit'; their mutual heating is applied
  // through externalT4Extra by the caller.
  const installMethod = key === 'duct-bank' ? 'conduit' : key;

  // For tray/air, use ambient air temperature; for buried, use soil temperature.
  const useSoilTemp = key !== 'tray';
  const ambientTempC = useSoilTemp ? ambient.soilTempC : ambient.tempC;

  return {
    sizeMm2: cable.sizeMm2,
    material: cable.material,
    insulation: cable.insulation,
    insulThickMm: cable.insulThickMm,
    nCores: cable.nCores,
    armoured: cable.armoured,
    installMethod,
    burialDepthMm: inst.burialDepthMm ?? 800,
    // Soil resistivity is a site property: every buried installation sees the same soil.
    soilResistivity: installations['direct-burial'].soilResistivity ?? 1.0,
    conduitOD_mm: inst.conduitOD_mm ?? 0,
    ambientTempC,
    frequencyHz: ambient.frequencyHz,
    U0_kV: cable.U0_kV,
    nCables: 1,
    groupArrangement: norm.grouping.arrangement,
    // Sizes between IEC preferred cross-sections (AWG/kcmil) interpolate R20.
    interpolateResistance: true,
  };
}

// ---------------------------------------------------------------------------
// buildDeratingWaterfall
// ---------------------------------------------------------------------------

/**
 * Build an ordered derating waterfall for a single installation case.
 *
 * Step order is fixed and verified by tests:
 *   1. Base table ampacity — single cable in this installation at the
 *      reference ambient (30 °C air, 20 °C soil)
 *   2. Ambient temperature correction — actual vs reference ambient, from the
 *      IEC 60287 rating formula (not a look-up table)
 *   3. Grouping / mutual heating — computed effect of neighbouring cables
 *   4. Installation-specific — any further derating; none is modelled because
 *      conduit, tray and burial effects are already inside the base rating
 *
 * Every factor is computed, so the product of all step factors equals
 * deratedAmpacity_A / baseAmpacity_A exactly and the limiting factor is the
 * smallest factor below 1.0.
 *
 * @param {object} ctx { key, norm, iecResult, refBaseA }
 * @returns {{ steps: WaterfallStep[], limitingFactor: string|null }}
 */
export function buildDeratingWaterfall({ key, norm, iecResult, refBaseA }) {
  const steps = [];
  const buried = key !== 'tray';
  const refAmbient = buried ? REFERENCE_AMBIENT_C.soil : REFERENCE_AMBIENT_C.air;
  const ambientUsed = buried ? norm.ambient.soilTempC : norm.ambient.tempC;
  const thetaMax = MAX_TEMP_C[norm.cable.insulation];

  const refA = refBaseA ?? iecResult.I_base;
  const singleActualA = iecResult.I_base;
  const ratedA = iecResult.I_rated;

  steps.push({
    label: STEP_LABELS.base,
    factor: 1.0,
    value: round1(refA),
    delta: 0,
    source: `Single cable, ${INSTALLATION_LABELS[key]}, ${refAmbient} °C reference ambient (IEC 60287-1-1 §3.1.1)`,
  });

  const fAmbient = singleActualA / Math.max(refA, 1e-9);
  const afterAmbient = refA * fAmbient;
  steps.push({
    label: STEP_LABELS.ambient,
    factor: round4(fAmbient),
    value: round1(afterAmbient),
    delta: round1(afterAmbient - refA),
    source: `${round1(ambientUsed)} °C ambient vs ${refAmbient} °C reference; θ_max ${thetaMax} °C (IEC 60287-1-1 Δθ)`,
  });

  const fGroup = ratedA / Math.max(singleActualA, 1e-9);
  const afterGroup = afterAmbient * fGroup;
  const groupSource = iecResult.groupingMethod === 'image-method'
    ? (key === 'duct-bank'
      ? `Mutual heating of ${iecResult.nCables} ducts, ${norm.installations['duct-bank'].rows}×${norm.installations['duct-bank'].cols} grid @ ${norm.installations['duct-bank'].spacingMm} mm (IEC 60287-2-1 image method)`
      : `Mutual heating of ${iecResult.nCables} buried cables (IEC 60287-2-1 image method)`)
    : `IEC group table, n=${iecResult.nCables}, ${iecResult.groupArrangement}`;
  steps.push({
    label: STEP_LABELS.grouping,
    factor: round4(fGroup),
    value: round1(afterGroup),
    delta: round1(afterGroup - afterAmbient),
    source: groupSource,
  });

  steps.push({
    label: `${STEP_LABELS.installation} (${INSTALLATION_LABELS[key]})`,
    factor: 1.0,
    value: round1(ratedA),
    delta: round1(ratedA - afterGroup),
    source: 'No further derating modelled; installation effects are included in the base rating',
  });

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
  const nCores = iec.nCores ?? caseResult.nCores ?? 3;
  const R_ac = iec.R_ac;
  const ambientC = iec.ambientTempC;
  const thetaMax = iec.thetaMax;

  // Lumped conductor heat capacity per metre: volumetric heat capacity x area x
  // number of conductors. Copper ≈ 3.45 MJ/(m³·K), aluminium ≈ 2.43 MJ/(m³·K).
  // Insulation and soil capacitance are ignored, which makes the time constant
  // shorter (and the cyclic result more conservative) than a full IEC 60853 model.
  const sizeM2 = iec.sizeMm2 * 1e-6;
  const cv_per_metre = (iec.material === 'Al' ? 2.43e6 : 3.45e6) * sizeM2 * nCores; // J/(K·m)
  const Rth_total = T1 + nCores * (T2 + T3 + T4);
  const tau_s = Math.max(60, Rth_total * cv_per_metre); // floor of 1 minute

  // Convert hourly samples to absolute amps
  const peak = profile.peakAmps ?? caseResult.deratedAmpacity_A ?? 1;
  const ampsArray = profile.hourly.map(v =>
    profile.basis === 'per-unit' ? Number(v) * peak : Number(v),
  );

  // Exponential approach to the steady-state temperature of each hour. The
  // daily profile repeats, so cycle it until the conductor temperature settles
  // (starting from ambient would understate the second day onward).
  const dt_s = 3600;
  const alpha = 1 - Math.exp(-dt_s / tau_s);

  let theta = ambientC;
  let timeline = [];
  let maxTempC = -Infinity;
  let hottestHour = 0;

  for (let day = 0; day < 20; day++) {
    const startTheta = theta;
    timeline = [];
    maxTempC = -Infinity;
    hottestHour = 0;
    for (let i = 0; i < ampsArray.length; i++) {
      const I = ampsArray[i];
      const thetaSs = ambientC + (I ** 2) * R_ac * Rth_total;
      theta = theta + (thetaSs - theta) * alpha;
      timeline.push({ hour: i, currentA: round1(I), tempC: round1(theta) });
      if (theta > maxTempC) {
        maxTempC = theta;
        hottestHour = i;
      }
    }
    if (Math.abs(theta - startTheta) < 0.01) break;
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
  // Soil resistivity is a site property shared by every buried case.
  const burial = study.inputs?.installations?.['direct-burial'];
  const anyBuried = ['direct-burial', 'conduit', 'duct-bank']
    .some(k => study.inputs?.installations?.[k]?.included);
  if (burial && anyBuried && burial.soilResistivity > 2.5) {
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

/**
 * Direct-Burial Parallel Circuit Sizing
 *
 * Answers "how many circuits of a given current can be direct buried side by
 * side at a given cover, and what is the cheapest conductor size / spacing to
 * do it?"
 *
 * Thermal model (delegated to analysis/iec60287.mjs):
 *   - Each cable is a line heat source at its own depth. Its self external
 *     resistance T4 is Kennelly's formula (already in calcAmpacity).
 *   - Mutual heating from every other cable in the trench (its own circuit
 *     and neighbouring circuits) is added with the IEC 60287-2-1 image method:
 *         ΔT4_p = (ρ / 2π) · Σ_{k≠p} ln(d'_pk / d_pk)
 *     where d is the distance to cable k and d' the distance to k's image
 *     above the soil surface. It is passed to calcAmpacity as externalT4Extra.
 *   - Circuit ampacity is the lowest cable rating in the hottest circuit
 *     (a centre circuit of the row) assuming every circuit is equally loaded.
 *
 * Costs use the conceptual allowances in analysis/costEstimate.mjs plus a
 * user-editable trench excavation/backfill allowance. They are screening
 * numbers for ranking options, not quotations.
 *
 * Pure module — no DOM, no storage access.
 */

import { calcAmpacity, thermalResistances, defaultInsulThickMm, MAX_TEMP_C } from './iec60287.mjs';
import { AWG_TO_MM2 } from './cableThermalEnvironment.mjs';
import { DEFAULT_PRICES } from './costEstimate.mjs';

export const ARRANGEMENTS = ['trefoil', 'flat', 'three-core'];

/** Candidate conductor sizes that have a price allowance in costEstimate.mjs. */
export const CONDUCTOR_SIZES = [
  { label: '6 AWG', awg: '6', priceKey: '6 AWG' },
  { label: '4 AWG', awg: '4', priceKey: '4 AWG' },
  { label: '2 AWG', awg: '2', priceKey: '2 AWG' },
  { label: '1 AWG', awg: '1', priceKey: '1 AWG' },
  { label: '1/0 AWG', awg: '1/0', priceKey: '1/0' },
  { label: '2/0 AWG', awg: '2/0', priceKey: '2/0' },
  { label: '3/0 AWG', awg: '3/0', priceKey: '3/0' },
  { label: '4/0 AWG', awg: '4/0', priceKey: '4/0' },
  { label: '250 kcmil', awg: '250', priceKey: '250 kcmil' },
  { label: '350 kcmil', awg: '350', priceKey: '350 kcmil' },
  { label: '500 kcmil', awg: '500', priceKey: '500 kcmil' },
  { label: '750 kcmil', awg: '750', priceKey: '750 kcmil' },
  { label: '1000 kcmil', awg: '1000', priceKey: '1000 kcmil' },
].map(size => ({ ...size, sizeMm2: AWG_TO_MM2[size.awg] }));

export const DEFAULT_SPACINGS_MM = [0, 100, 200, 300, 450, 600, 900];

const MM_PER_IN = 25.4;
const MM_PER_FT = 304.8;
const SQRT3_2 = Math.sqrt(3) / 2;

const DEFAULTS = Object.freeze({
  requiredCurrentA: 102,
  continuousFactor: 1,
  designMarginPct: 10,
  requiredCircuits: null,
  maxCircuits: 20,
  cable: {
    material: 'Cu',
    insulation: 'XLPE',
    arrangement: 'trefoil',
    voltageClass: '0.6/1kV',
    jacketMm: 1.5,
    conductorsPerCircuit: 3,
  },
  soil: { resistivityKmW: 1.0, tempC: 20 },
  cover: { coverMm: 24 * MM_PER_IN },
  frequencyHz: 60,
  spacingsMm: DEFAULT_SPACINGS_MM,
  sizes: CONDUCTOR_SIZES.map(s => s.label),
  costs: {
    aluminumPriceFactor: 0.5,
    trenchCostPerCubicYard: 75,
    trenchSideClearanceMm: 150,
    trenchBeddingBelowMm: 100,
  },
});

function positiveNumber(value, fallback, label) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} must be a positive number`);
  return n;
}

function nonNegativeNumber(value, fallback, label) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be zero or greater`);
  return n;
}

/**
 * Validate raw form/API inputs and apply defaults.
 * @param {object} raw
 * @returns {object} normalised inputs
 */
export function normalizeDirectBurialInputs(raw = {}) {
  const cableRaw = raw.cable || {};
  const soilRaw = raw.soil || {};
  const costRaw = raw.costs || {};

  const material = String(cableRaw.material ?? DEFAULTS.cable.material).toLowerCase().startsWith('al') ? 'Al' : 'Cu';
  const insulation = cableRaw.insulation ?? DEFAULTS.cable.insulation;
  if (!MAX_TEMP_C[insulation]) throw new Error(`Unknown insulation type: ${insulation}`);
  const arrangement = cableRaw.arrangement ?? DEFAULTS.cable.arrangement;
  if (!ARRANGEMENTS.includes(arrangement)) throw new Error(`Unknown circuit arrangement: ${arrangement}`);

  const soilTempC = soilRaw.tempC == null || soilRaw.tempC === '' ? DEFAULTS.soil.tempC : Number(soilRaw.tempC);
  if (!Number.isFinite(soilTempC) || soilTempC >= MAX_TEMP_C[insulation]) {
    throw new Error(`Soil temperature must be below the ${MAX_TEMP_C[insulation]} °C conductor limit`);
  }

  const spacingsIn = Array.isArray(raw.spacingsMm) && raw.spacingsMm.length ? raw.spacingsMm : DEFAULTS.spacingsMm;
  const spacingsMm = [...new Set(spacingsIn.map(Number))].filter(v => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (!spacingsMm.length) throw new Error('At least one circuit spacing is required');

  const sizeLabels = Array.isArray(raw.sizes) && raw.sizes.length ? raw.sizes : DEFAULTS.sizes;
  const sizes = CONDUCTOR_SIZES.filter(s => sizeLabels.includes(s.label));
  if (!sizes.length) throw new Error('Select at least one conductor size');

  const requiredCircuits = raw.requiredCircuits == null || raw.requiredCircuits === ''
    ? null
    : Math.max(1, Math.round(Number(raw.requiredCircuits)));
  if (requiredCircuits != null && !Number.isFinite(requiredCircuits)) {
    throw new Error('Required circuits must be a whole number');
  }
  const maxCircuits = Math.min(60, Math.max(requiredCircuits || 1, Math.round(positiveNumber(raw.maxCircuits, DEFAULTS.maxCircuits, 'Max circuits to evaluate'))));

  return {
    requiredCurrentA: positiveNumber(raw.requiredCurrentA, DEFAULTS.requiredCurrentA, 'Required current'),
    continuousFactor: positiveNumber(raw.continuousFactor, DEFAULTS.continuousFactor, 'Continuous-load factor'),
    designMarginPct: nonNegativeNumber(raw.designMarginPct, DEFAULTS.designMarginPct, 'Model margin'),
    requiredCircuits,
    maxCircuits,
    cable: {
      material,
      insulation,
      arrangement,
      voltageClass: cableRaw.voltageClass ?? DEFAULTS.cable.voltageClass,
      jacketMm: nonNegativeNumber(cableRaw.jacketMm, DEFAULTS.cable.jacketMm, 'Jacket thickness'),
      conductorsPerCircuit: Math.round(positiveNumber(cableRaw.conductorsPerCircuit, DEFAULTS.cable.conductorsPerCircuit, 'Conductors per circuit')),
    },
    soil: {
      resistivityKmW: positiveNumber(soilRaw.resistivityKmW, DEFAULTS.soil.resistivityKmW, 'Soil thermal resistivity'),
      tempC: soilTempC,
    },
    cover: { coverMm: positiveNumber(raw.cover?.coverMm, DEFAULTS.cover.coverMm, 'Cover depth') },
    frequencyHz: positiveNumber(raw.frequencyHz, DEFAULTS.frequencyHz, 'Frequency'),
    spacingsMm,
    sizes,
    costs: {
      aluminumPriceFactor: positiveNumber(costRaw.aluminumPriceFactor, DEFAULTS.costs.aluminumPriceFactor, 'Aluminium price factor'),
      trenchCostPerCubicYard: nonNegativeNumber(costRaw.trenchCostPerCubicYard, DEFAULTS.costs.trenchCostPerCubicYard, 'Trench cost'),
      trenchSideClearanceMm: nonNegativeNumber(costRaw.trenchSideClearanceMm, DEFAULTS.costs.trenchSideClearanceMm, 'Trench side clearance'),
      trenchBeddingBelowMm: nonNegativeNumber(costRaw.trenchBeddingBelowMm, DEFAULTS.costs.trenchBeddingBelowMm, 'Bedding below cable'),
    },
  };
}

function cableBuild(size, inputs) {
  const { cable } = inputs;
  const nCores = cable.arrangement === 'three-core' ? 3 : 1;
  const insulThickMm = defaultInsulThickMm(size.sizeMm2, cable.voltageClass);
  const base = {
    sizeMm2: size.sizeMm2,
    material: cable.material,
    insulation: cable.insulation,
    insulThickMm,
    outerSheathMm: cable.jacketMm,
    nCores,
    armoured: false,
    installMethod: 'direct-burial',
    soilResistivity: inputs.soil.resistivityKmW,
    ambientTempC: inputs.soil.tempC,
    frequencyHz: inputs.frequencyHz,
    interpolateResistance: true,
  };
  const { D_e_mm } = thermalResistances({ ...base, burialDepthMm: inputs.cover.coverMm });
  return { base, odMm: D_e_mm, nCores };
}

/**
 * Cable centre offsets (mm) within one circuit, relative to the circuit's
 * horizontal centre and its topmost cable centre. y grows downward.
 */
function circuitLayout(arrangement, odMm) {
  if (arrangement === 'trefoil') {
    return {
      offsets: [
        { x: 0, y: 0 },
        { x: -odMm / 2, y: odMm * SQRT3_2 },
        { x: odMm / 2, y: odMm * SQRT3_2 },
      ],
      widthMm: 2 * odMm,
      heightMm: odMm * (1 + SQRT3_2),
    };
  }
  if (arrangement === 'flat') {
    return {
      offsets: [{ x: -odMm, y: 0 }, { x: 0, y: 0 }, { x: odMm, y: 0 }],
      widthMm: 3 * odMm,
      heightMm: odMm,
    };
  }
  return { offsets: [{ x: 0, y: 0 }], widthMm: odMm, heightMm: odMm };
}

/**
 * Rating of one circuit position in a row of `nCircuits` identical circuits.
 *
 * @param {object} build       result of cableBuild()
 * @param {object} inputs      normalised inputs
 * @param {number} nCircuits   circuits in the row
 * @param {number} clearanceMm edge-to-edge clearance between adjacent circuits
 * @returns {{ ampacityA: number, geometry: object }}
 */
export function rowAmpacity(build, inputs, nCircuits, clearanceMm) {
  const layout = circuitLayout(inputs.cable.arrangement, build.odMm);
  const pitch = layout.widthMm + clearanceMm;
  const topDepth = inputs.cover.coverMm + build.odMm / 2;

  const sources = [];
  for (let c = 0; c < nCircuits; c += 1) {
    layout.offsets.forEach((o, idx) => {
      sources.push({ circuit: c, idx, x: c * pitch + o.x, y: topDepth + o.y });
    });
  }

  // Symmetry: the hottest circuit is one of the two middle circuits.
  const mid = [Math.floor((nCircuits - 1) / 2), Math.ceil((nCircuits - 1) / 2)];
  const rho = inputs.soil.resistivityKmW;
  let ampacityA = Infinity;

  for (const p of sources.filter(s => mid.includes(s.circuit))) {
    let sumLn = 0;
    for (const k of sources) {
      if (k === p) continue;
      const dx = p.x - k.x;
      const d = Math.hypot(dx, p.y - k.y);
      const dImage = Math.hypot(dx, p.y + k.y);
      sumLn += Math.log(dImage / d);
    }
    const { I_base } = calcAmpacity({
      ...build.base,
      burialDepthMm: p.y,
      externalT4Extra: (rho / (2 * Math.PI)) * sumLn,
      nCables: 1,
    });
    ampacityA = Math.min(ampacityA, I_base);
  }

  return {
    ampacityA,
    geometry: {
      circuitWidthMm: layout.widthMm,
      circuitHeightMm: layout.heightMm,
      pitchMm: pitch,
    },
  };
}

function cablePricePerFt(size, inputs) {
  const cuPrice = DEFAULT_PRICES.cable[size.priceKey] ?? DEFAULT_PRICES.cable.default;
  return inputs.cable.material === 'Al' ? cuPrice * inputs.costs.aluminumPriceFactor : cuPrice;
}

/**
 * Screening installed cost per foot of route for an N-circuit row.
 */
export function rowCostPerFt(size, inputs, nCircuits, geometry, clearanceMm) {
  const { costs, cover } = inputs;
  const trenchWidthMm = nCircuits * geometry.circuitWidthMm
    + (nCircuits - 1) * clearanceMm
    + 2 * costs.trenchSideClearanceMm;
  const trenchDepthMm = cover.coverMm + geometry.circuitHeightMm + costs.trenchBeddingBelowMm;
  const cubicYardsPerFt = ((trenchWidthMm / MM_PER_FT) * (trenchDepthMm / MM_PER_FT)) / 27;
  const cableCost = nCircuits * inputs.cable.conductorsPerCircuit * cablePricePerFt(size, inputs);
  const trenchCost = cubicYardsPerFt * costs.trenchCostPerCubicYard;
  return {
    cableCostPerFt: round2(cableCost),
    trenchCostPerFt: round2(trenchCost),
    totalCostPerFt: round2(cableCost + trenchCost),
    costPerCircuitFt: round2((cableCost + trenchCost) / nCircuits),
    trenchWidthIn: round1(trenchWidthMm / MM_PER_IN),
    trenchDepthIn: round1(trenchDepthMm / MM_PER_IN),
  };
}

function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }

/**
 * Run the full size × spacing sweep.
 *
 * @param {object} raw raw inputs (see normalizeDirectBurialInputs)
 * @returns {{
 *   inputs: object,
 *   targetAmpacityA: number,
 *   rows: object[],
 *   best: object|null,
 *   notes: string[],
 * }}
 */
export function runDirectBurial(raw = {}) {
  const inputs = normalizeDirectBurialInputs(raw);
  // Spot checks show the IEC 60287 engine reading above published tabulated
  // ratings, so the target carries an explicit, user-visible margin.
  const targetAmpacityA = inputs.requiredCurrentA * inputs.continuousFactor * (1 + inputs.designMarginPct / 100);
  const rows = [];

  for (const size of inputs.sizes) {
    const build = cableBuild(size, inputs);
    for (const clearanceMm of inputs.spacingsMm) {
      const ampacityByCircuits = [];
      let maxCircuits = 0;
      let geometry = null;
      for (let n = 1; n <= inputs.maxCircuits; n += 1) {
        const r = rowAmpacity(build, inputs, n, clearanceMm);
        geometry = r.geometry;
        ampacityByCircuits.push(round1(r.ampacityA));
        if (r.ampacityA >= targetAmpacityA) maxCircuits = n;
        else break;
      }
      const evalCircuits = inputs.requiredCircuits ?? maxCircuits;
      const feasible = maxCircuits >= 1 && evalCircuits >= 1
        && (inputs.requiredCircuits == null || maxCircuits >= inputs.requiredCircuits);
      const cost = feasible ? rowCostPerFt(size, inputs, evalCircuits, geometry, clearanceMm) : null;
      rows.push({
        size: size.label,
        sizeMm2: size.sizeMm2,
        cableOdMm: round1(build.odMm),
        clearanceMm,
        singleCircuitAmpacityA: ampacityByCircuits[0],
        ampacityByCircuits,
        maxCircuits,
        evaluatedCircuits: feasible ? evalCircuits : null,
        feasible,
        ampacityAtEvaluatedA: feasible ? ampacityByCircuits[evalCircuits - 1] : null,
        cost,
      });
    }
  }

  const feasibleRows = rows.filter(r => r.feasible && r.cost);
  const rankKey = inputs.requiredCircuits == null ? 'costPerCircuitFt' : 'totalCostPerFt';
  const best = feasibleRows.length
    ? [...feasibleRows].sort((a, b) => a.cost[rankKey] - b.cost[rankKey]
      || a.cost.trenchWidthIn - b.cost.trenchWidthIn)[0]
    : null;

  return { inputs, targetAmpacityA: round1(targetAmpacityA), rows, best, notes: buildNotes(inputs, rows, best) };
}

function buildNotes(inputs, rows, best) {
  const notes = [];
  if (!best) {
    notes.push(inputs.requiredCircuits != null
      ? `No size/spacing combination carries ${inputs.requiredCurrentA} A on ${inputs.requiredCircuits} circuits. Try larger conductors, wider spacing, a lower soil thermal resistivity (thermal backfill), or splitting the circuits across trenches.`
      : `No size carries ${inputs.requiredCurrentA} A even on a single circuit at this cover. Add larger conductor sizes or reduce soil thermal resistivity.`);
  }
  if (inputs.soil.resistivityKmW > 1.5) {
    notes.push(`Soil thermal resistivity ${inputs.soil.resistivityKmW} K·m/W is high; a measured value or engineered thermal backfill often improves the result substantially.`);
  }
  if (inputs.cover.coverMm < 24 * MM_PER_IN - 1) {
    notes.push('Cover is less than 24 in; confirm minimum cover for the voltage and location under NEC 300.5.');
  }
  if (inputs.designMarginPct < 10) {
    notes.push(`Model margin is ${inputs.designMarginPct}%. In spot checks the underlying IEC 60287 engine read roughly 5-15% above published tabulated ratings, so a margin of 10% or more is recommended.`);
  }
  notes.push('Screening result: IEC 60287 steady state at 100% load factor, uniform soil, no soil dry-out. Verify against NEC 310.14 / Annex B or a full Neher-McGrath study before issuing for construction.');
  return notes;
}

/**
 * Detailed, thermal-only cable rating model.
 *
 * This module deliberately accepts measured or manufacturer-supplied cable
 * losses and dimensions.  It is independent of the legacy screening model in
 * iec60287.mjs and does not recalculate electrical loss factors.
 */

const TWO_PI = 2 * Math.PI;
const EPS = 1e-9;

const LIMITS = Object.freeze([
  'Steady-state balanced current with identical cables.',
  'Supplied AC resistance, sheath-loss factor, and dielectric loss are valid at the stated temperature and frequency.',
  'Homogeneous soil and uniform burial depth are assumed.',
  'Metallic sheath is thermally neglected between the final insulation layer and jacket.',
  'Touching-trefoil and spaced formations use separate approximations; arbitrary formations, crossings, drying, and cyclic ratings are out of scope.',
]);

export function normalizeCableThermalInputs({ cable, installation } = {}) {
  if (!cable || typeof cable !== 'object') throw new Error('cable is required.');
  if (!installation || typeof installation !== 'object') throw new Error('installation is required.');

  const c = {
    id: cable.id ?? null,
    name: cable.name ?? null,
    sizeMm2: positive(cable.sizeMm2, 'cable.sizeMm2'),
    material: String(cable.material ?? ''),
    maxTempC: finite(cable.maxTempC, 'cable.maxTempC'),
    acResistanceOhmPerKm: positive(cable.acResistanceOhmPerKm, 'cable.acResistanceOhmPerKm'),
    acResistanceTempC: finite(cable.acResistanceTempC, 'cable.acResistanceTempC'),
    acResistanceFrequencyHz: positive(cable.acResistanceFrequencyHz, 'cable.acResistanceFrequencyHz'),
    dielectricLossWPerM: nonNegative(cable.dielectricLossWPerM, 'cable.dielectricLossWPerM'),
    lambdaSheath: nonNegative(cable.lambdaSheath, 'cable.lambdaSheath'),
    outerDiameterMm: positive(cable.outerDiameterMm, 'cable.outerDiameterMm'),
    insulationLayers: normalizeLayers(cable.insulationLayers),
    jacketInnerDiameterMm: positive(cable.jacketInnerDiameterMm, 'cable.jacketInnerDiameterMm'),
    jacketResistivityKmPerW: positive(cable.jacketResistivityKmPerW, 'cable.jacketResistivityKmPerW'),
    metallicSheath: cable.metallicSheath === true,
    source: cable.source ?? null,
    metadata: cable.metadata ?? null,
    assumptions: Array.isArray(cable.assumptions) ? [...cable.assumptions] : [],
    modelLimits: Array.isArray(cable.modelLimits) ? [...cable.modelLimits] : [],
  };
  if (!['Cu', 'Al'].includes(c.material)) throw new Error('cable.material must be Cu or Al.');
  if (c.maxTempC <= c.acResistanceTempC - EPS || Math.abs(c.acResistanceTempC - c.maxTempC) > EPS) {
    throw new Error('cable.acResistanceTempC must equal cable.maxTempC; supplied losses must be at maximum conductor temperature.');
  }
  if (c.insulationLayers[c.insulationLayers.length - 1].outerDiameterMm > c.jacketInnerDiameterMm + EPS) {
    throw new Error('cable.jacketInnerDiameterMm must enclose the final insulation layer.');
  }
  const conductorEquivalentDiameterMm = 2 * Math.sqrt(c.sizeMm2 / Math.PI);
  if (conductorEquivalentDiameterMm > c.insulationLayers[0].innerDiameterMm * 1.01) {
    throw new Error('cable.sizeMm2 does not fit inside the first insulation-layer diameter.');
  }
  if (c.jacketInnerDiameterMm >= c.outerDiameterMm - EPS) {
    throw new Error('cable.outerDiameterMm must exceed jacketInnerDiameterMm.');
  }

  const formation = installation.formation;
  if (!['isolated', 'flat-spaced', 'trefoil-spaced', 'trefoil-touching'].includes(formation)) {
    throw new Error('installation.formation is required and must be isolated, flat-spaced, trefoil-spaced, or trefoil-touching.');
  }
  const i = {
    formation,
    burialDepthMm: positive(installation.burialDepthMm, 'installation.burialDepthMm'),
    spacingMm: installation.spacingMm == null ? null : positive(installation.spacingMm, 'installation.spacingMm'),
    soilResistivityKmPerW: positive(installation.soilResistivityKmPerW, 'installation.soilResistivityKmPerW'),
    ambientTempC: finite(installation.ambientTempC, 'installation.ambientTempC'),
    frequencyHz: positive(installation.frequencyHz, 'installation.frequencyHz'),
  };
  if (c.maxTempC <= -273.15 || i.ambientTempC <= -273.15) throw new Error('Temperature inputs must be above absolute zero.');
  if (i.ambientTempC >= c.maxTempC) throw new Error('installation.ambientTempC must be below cable.maxTempC.');
  if (Math.abs(c.acResistanceFrequencyHz - i.frequencyHz) > EPS) {
    throw new Error('cable.acResistanceFrequencyHz must equal installation.frequencyHz; supplied losses cannot be re-scaled.');
  }
  if (!['isolated', 'trefoil-touching'].includes(formation) && i.spacingMm == null) throw new Error(`installation.spacingMm is required for ${formation}.`);
  if (formation === 'trefoil-touching' && i.spacingMm != null && Math.abs(i.spacingMm - c.outerDiameterMm) > EPS) {
    throw new Error('trefoil-touching spacingMm, when supplied, must equal cable.outerDiameterMm.');
  }
  const finalLayerOuter = c.insulationLayers[c.insulationLayers.length - 1].outerDiameterMm;
  if (c.jacketInnerDiameterMm > finalLayerOuter + EPS && !c.metallicSheath) {
    throw new Error('cable.metallicSheath must be true when a radial gap exists before the jacket.');
  }
  if (formation === 'trefoil-touching' && !c.metallicSheath) throw new Error('trefoil-touching requires cable.metallicSheath=true.');
  if (formation === 'trefoil-touching' && 2 * (i.burialDepthMm / 1000) / (c.outerDiameterMm / 1000) < 4) {
    throw new Error('trefoil-touching requires u = 2L/D ≥ 4.');
  }
  if (formation === 'trefoil-spaced' && i.burialDepthMm - i.spacingMm / Math.sqrt(3) <= c.outerDiameterMm / 2) {
    throw new Error('trefoil-spaced top cable must remain below the soil surface with adequate cover.');
  }
  return { cable: c, installation: i };
}

function normalizeLayers(layers) {
  if (!Array.isArray(layers) || layers.length === 0) throw new Error('cable.insulationLayers must contain at least one layer.');
  let previousOuter = null;
  return layers.map((layer, index) => {
    if (!layer || typeof layer !== 'object') throw new Error(`cable.insulationLayers[${index}] must be an object.`);
    const normalized = {
      name: String(layer.name ?? `layer-${index + 1}`),
      innerDiameterMm: positive(layer.innerDiameterMm, `cable.insulationLayers[${index}].innerDiameterMm`),
      outerDiameterMm: positive(layer.outerDiameterMm, `cable.insulationLayers[${index}].outerDiameterMm`),
      resistivityKmPerW: positive(layer.resistivityKmPerW, `cable.insulationLayers[${index}].resistivityKmPerW`),
    };
    if (normalized.outerDiameterMm <= normalized.innerDiameterMm + EPS) throw new Error(`cable.insulationLayers[${index}] outer diameter must exceed inner diameter.`);
    if (previousOuter != null && Math.abs(normalized.innerDiameterMm - previousOuter) > EPS) {
      throw new Error(`cable.insulationLayers[${index}] is not contiguous with the preceding layer.`);
    }
    previousOuter = normalized.outerDiameterMm;
    return normalized;
  });
}

export function calculateCableThermalRating(inputs) {
  const { cable, installation } = normalizeCableThermalInputs(inputs);
  const D = cable.outerDiameterMm / 1000;
  const L = installation.burialDepthMm / 1000;
  const rho = installation.soilResistivityKmPerW;
  const T1 = cable.insulationLayers.reduce((sum, layer) => sum + (layer.resistivityKmPerW / TWO_PI) * Math.log(layer.outerDiameterMm / layer.innerDiameterMm), 0);
  const T3 = (cable.jacketResistivityKmPerW / TWO_PI) * Math.log(cable.outerDiameterMm / cable.jacketInnerDiameterMm);
  const T4Matrix = buildT4Matrix(cable, installation, D, L, rho);
  const T4EffectiveByCable = installation.formation === 'trefoil-touching'
    ? Array(3).fill(T4Matrix[0][0])
    : T4Matrix.map(row => row.reduce((sum, value) => sum + value, 0));
  const T3effective = installation.formation === 'trefoil-touching' ? 1.6 * T3 : T3;
  const T4effective = Math.max(...T4EffectiveByCable);
  const Wd = cable.dielectricLossWPerM;
  const Rac = cable.acResistanceOhmPerKm / 1000;
  const numerator = cable.maxTempC - installation.ambientTempC - Wd * (T1 / 2 + T3effective + T4effective);
  const denominator = Rac * (T1 + (1 + cable.lambdaSheath) * (T3effective + T4effective));
  if (!(numerator > 0)) throw new Error('Dielectric losses exceed the available conductor temperature budget.');
  if (!(denominator > 0) || !Number.isFinite(denominator)) throw new Error('Thermal denominator is non-positive or non-finite.');
  const ampacityA = Math.sqrt(numerator / denominator);
  const conductorLossWPerM = ampacityA ** 2 * Rac;
  const sheathLossWPerM = cable.lambdaSheath * conductorLossWPerM;
  const totalLossWPerM = conductorLossWPerM + sheathLossWPerM + Wd;
  const phaseTemperatures = T4EffectiveByCable.map((t4, index) => ({
    index,
    conductorTempC: installation.ambientTempC + (conductorLossWPerM + Wd / 2) * T1 + totalLossWPerM * (T3effective + t4),
    sheathTempC: installation.ambientTempC + totalLossWPerM * (T3effective + t4),
    surfaceTempC: installation.ambientTempC + totalLossWPerM * t4,
    conductorLossWPerM,
    sheathLossWPerM,
    dielectricLossWPerM: Wd,
    totalLossWPerM,
    T4_KmPerW: t4,
    positionMm: phasePositions(installation.formation, installation.spacingMm, installation.burialDepthMm, D * 1000)[index] ?? null,
  }));
  const limitingPhase = phaseTemperatures.reduce((a, b) => a.conductorTempC >= b.conductorTempC ? a : b);
  const valuesToCheck = [ampacityA, T1, T3, T3effective, T4effective, numerator, denominator, Rac, conductorLossWPerM, sheathLossWPerM, totalLossWPerM, ...T4Matrix.flat(), ...T4EffectiveByCable, ...phaseTemperatures.flatMap(p => [p.conductorTempC, p.sheathTempC, p.surfaceTempC])];
  if (!valuesToCheck.every(Number.isFinite) || !(ampacityA > 0)) throw new Error('Detailed cable thermal calculation overflowed or produced a non-finite result.');
  return {
    ampacityA,
    normalizedInputs: { cable, installation },
    losses: { acResistanceOhmPerM: Rac, conductorLossWPerM, sheathLossWPerM, dielectricLossWPerM: Wd, totalLossWPerM, lambdaSheath: cable.lambdaSheath },
    thermalResistances: { T1_KmPerW: T1, T3_KmPerW: T3, T3effective_KmPerW: T3effective, T4Matrix_KmPerW: T4Matrix, T4EffectiveByCable_KmPerW: T4EffectiveByCable },
    temperatures: { ambientC: installation.ambientTempC, soilC: installation.ambientTempC, sheathC: limitingPhase.sheathTempC, surfaceC: limitingPhase.surfaceTempC, conductorCByPhase: phaseTemperatures.map(p => p.conductorTempC), sheathCByPhase: phaseTemperatures.map(p => p.sheathTempC), surfaceCByPhase: phaseTemperatures.map(p => p.surfaceTempC), limitingPhase: limitingPhase.index },
    phasePositionsMm: phasePositions(installation.formation, installation.spacingMm, installation.burialDepthMm, D * 1000),
    phaseTemperatures,
    limitingPhase: limitingPhase.index,
    assumptions: [...LIMITS, ...cable.assumptions],
    modelLimits: [...LIMITS, ...cable.modelLimits],
    provenance: { source: cable.source, metadata: cable.metadata },
    readiness: 'screening-only',
    validity: { evaluated: true, status: 'screening-only', limitations: [...LIMITS] },
  };
}

function buildT4Matrix(cable, installation, D, L, rho) {
  const { formation, spacingMm } = installation;
  if (formation === 'isolated') {
    if (!(2 * L / D > 1)) throw new Error('Isolated burial geometry requires 2L/D > 1.');
    return [[rho / TWO_PI * acosh(2 * L / D)]];
  }
  if (formation === 'trefoil-touching') return [[3 * rho / TWO_PI * (Math.log(4 * L / D) - 0.63)]];
  const positions = phasePositions(formation, spacingMm, L * 1000, D * 1000).map(([x, depth]) => [x / 1000, depth / 1000]);
  if (!(spacingMm > 1.05 * D * 1000)) throw new Error('Spaced formation requires centre spacing greater than 1.05 cable diameters.');
  if (!(2 * L / D > 1)) throw new Error('Burial depth is too small for cable diameter.');
  return positions.map(([x, depth], i) => positions.map(([xj, depthj], j) => {
    if (i === j) return rho / TWO_PI * acosh(2 * depth / D);
    const real = Math.hypot(x - xj, depth - depthj);
    const image = Math.hypot(x - xj, depth + depthj);
    return rho / TWO_PI * Math.log(image / real);
  }));
}

function phasePositions(formation, spacingMm, depthMm, diameterMm) {
  if (formation === 'isolated') return [[0, depthMm]];
  if (formation === 'flat-spaced') return [[-spacingMm, depthMm], [0, depthMm], [spacingMm, depthMm]];
  if (formation === 'trefoil-spaced') {
    const s = spacingMm;
    return [[0, depthMm - s / Math.sqrt(3)], [-s / 2, depthMm + s / (2 * Math.sqrt(3))], [s / 2, depthMm + s / (2 * Math.sqrt(3))]];
  }
  if (formation === 'trefoil-touching') {
    const s = diameterMm;
    return [[0, depthMm - s / Math.sqrt(3)], [-s / 2, depthMm + s / (2 * Math.sqrt(3))], [s / 2, depthMm + s / (2 * Math.sqrt(3))]];
  }
  return [];
}

function finite(value, name) { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be finite.`); return value; }
function positive(value, name) { const n = finite(value, name); if (!(n > 0)) throw new Error(`${name} must be positive.`); return n; }
function nonNegative(value, name) { const n = finite(value, name); if (n < 0) throw new Error(`${name} must be non-negative.`); return n; }
function acosh(value) { if (value < 1) throw new Error('acosh argument must be at least 1.'); return Math.acosh(value); }

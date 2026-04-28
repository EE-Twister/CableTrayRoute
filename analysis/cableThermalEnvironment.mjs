import { calcAmpacity, defaultInsulThickMm, MAX_TEMP_C } from './iec60287.mjs';

export const CABLE_THERMAL_ENVIRONMENT_VERSION = 'cable-thermal-environment-v1';

const IEC_SIZES_MM2 = [16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630, 800, 1000];
const AWG_TO_MM2 = {
  '14': 2.08, '12': 3.31, '10': 5.26, '8': 8.37, '6': 13.3, '4': 21.2, '3': 26.7, '2': 33.6, '1': 42.4,
  '1/0': 53.5, '2/0': 67.4, '3/0': 85.0, '4/0': 107.2,
  '250': 127, '300': 152, '350': 177, '400': 203, '500': 253, '600': 304, '750': 380, '1000': 507,
};

const EXPOSURE_MODES = new Set(['standard', 'surface', 'riser', 'tunnel', 'channel']);
const SHEATH_BONDING_MODES = new Set(['screeningDefault', 'singlePoint', 'bothEndsBonded', 'crossBonded']);
const CYCLIC_RATING_MODES = new Set(['screeningDefault', 'iec60853Screening', 'emergencyProfile']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value, fallback = null) {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finiteOrThrow(value, fallback, label) {
  const n = finiteNumber(value, fallback);
  if (!Number.isFinite(n)) throw new Error(`Invalid thermal input for ${label}.`);
  return n;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nearestIecSize(mm2) {
  if (!Number.isFinite(mm2) || mm2 <= 0) return null;
  return IEC_SIZES_MM2.reduce((best, size) => Math.abs(size - mm2) < Math.abs(best - mm2) ? size : best, IEC_SIZES_MM2[0]);
}

function parseSizeMm2(row = {}) {
  const direct = finiteNumber(row.sizeMm2 ?? row.conductorSizeMm2 ?? row.conductor_size_mm2 ?? row.size_mm2);
  if (direct) return { sizeMm2: nearestIecSize(direct), source: `${direct} mm2` };
  const raw = String(row.conductor_size || row.size || row.conductorSize || '').trim();
  if (!raw) return { sizeMm2: null, source: '' };
  const mm = raw.match(/(\d+(?:\.\d+)?)\s*(?:mm2|mm²|sq\s*mm)/i);
  if (mm) {
    const value = finiteNumber(mm[1]);
    return { sizeMm2: nearestIecSize(value), source: raw };
  }
  const normalized = raw.replace(/^#/, '').replace(/\s*awg/i, '').replace(/\s*kcmil/i, '').trim().toUpperCase();
  const approx = AWG_TO_MM2[normalized];
  return approx ? { sizeMm2: nearestIecSize(approx), source: raw } : { sizeMm2: null, source: raw };
}

function normalizeMaterial(value = '') {
  return String(value || '').toLowerCase().includes('al') ? 'Al' : 'Cu';
}

function normalizeInsulation(value = '') {
  const raw = String(value || '').toUpperCase();
  if (raw.includes('EPR')) return 'EPR';
  if (raw.includes('PVC')) return 'PVC';
  if (raw.includes('LSZH')) return 'LSZH';
  if (raw.includes('105')) return 'XLPE-HT';
  if (raw.includes('PAPER')) return 'Paper-MV';
  return 'XLPE';
}

function voltageClass(row = {}) {
  const raw = String(row.voltageClass || row.voltage_rating || row.voltage || '').toLowerCase();
  if (/35|34\.5|30/.test(raw)) return '18/30kV';
  if (/15|13\.8|12\.47/.test(raw)) return '8.7/15kV';
  if (/10|6/.test(raw)) return '6/10kV';
  return '0.6/1kV';
}

function u0FromVoltage(row = {}) {
  const raw = finiteNumber(row.voltageKv ?? row.voltage_kv);
  if (raw) return round(raw / Math.sqrt(3), 3);
  const text = String(row.voltage_rating || row.voltage || '');
  const match = text.match(/(\d+(?:\.\d+)?)/);
  const value = match ? finiteNumber(match[1]) : null;
  if (!value) return 0;
  const kv = value > 100 ? value / 1000 : value;
  return round(kv / Math.sqrt(3), 3);
}

function normalizeMethod(value = 'tray') {
  const method = String(value || '').trim().toLowerCase();
  if (['direct-burial', 'directBurial', 'buried', 'direct burial'].includes(method)) return 'direct-burial';
  if (['ductbank', 'duct-bank', 'duct bank'].includes(method)) return 'ductbank';
  if (['conduit', 'duct'].includes(method)) return 'conduit';
  if (['air', 'free-air', 'free air'].includes(method)) return 'air';
  return 'tray';
}

function methodForIec(method) {
  return method === 'ductbank' ? 'conduit' : method;
}

function defaultEnvironment() {
  return {
    installationMethods: ['tray', 'conduit', 'direct-burial', 'ductbank', 'air'],
    ambientTempC: 30,
    earthTempC: 20,
    soilResistivity: 1.2,
    burialDepthMm: 800,
    conduitOD_mm: 80,
    nCables: 1,
    groupArrangement: 'flat',
    frequencyHz: 60,
    outerSheathMm: 3,
    nCores: 3,
    armoured: false,
  };
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'on', 'enabled'].includes(normalized)) return true;
    if (['false', 'no', 'n', '0', 'off', 'disabled'].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeExposureMode(value = 'standard') {
  const mode = String(value || 'standard').trim();
  return EXPOSURE_MODES.has(mode) ? mode : 'standard';
}

function normalizeSheathMode(value = 'screeningDefault') {
  const mode = String(value || 'screeningDefault').trim();
  return SHEATH_BONDING_MODES.has(mode) ? mode : 'screeningDefault';
}

function normalizeCyclicMode(value = 'screeningDefault') {
  const mode = String(value || 'screeningDefault').trim();
  return CYCLIC_RATING_MODES.has(mode) ? mode : 'screeningDefault';
}

export function buildThermalBackfillZones(rows = []) {
  return asArray(rows).map((row, index) => {
    const source = asObject(row);
    const thicknessMm = finiteOrThrow(source.thicknessMm ?? source.thickness_mm ?? source.thickness, 300, `backfill zone ${index + 1} thickness`);
    const thermalResistivity = finiteOrThrow(source.thermalResistivity ?? source.rho ?? source.soilResistivity, 1.2, `backfill zone ${index + 1} resistivity`);
    if (thicknessMm <= 0) throw new Error(`Invalid backfill zone ${index + 1}: thickness must be positive.`);
    if (thermalResistivity <= 0) throw new Error(`Invalid backfill zone ${index + 1}: thermal resistivity must be positive.`);
    return {
      id: String(source.id || `backfill-${index + 1}`),
      name: String(source.name || source.label || `Backfill ${index + 1}`),
      thicknessMm: round(thicknessMm, 1),
      thermalResistivity: round(thermalResistivity, 3),
      moisture: String(source.moisture || source.moistureCondition || ''),
      notes: String(source.notes || ''),
    };
  });
}

export function buildAdjacentThermalInfluenceRows(rows = []) {
  return asArray(rows).map((row, index) => {
    const source = asObject(row);
    const distanceMm = finiteOrThrow(source.distanceMm ?? source.distance_mm ?? source.distance, 300, `adjacent influence ${index + 1} distance`);
    const heatWm = finiteNumber(source.heatWm ?? source.heat_w_m ?? source.heatPerMeterW ?? source.heat, null);
    const loadCurrentA = finiteNumber(source.loadCurrentA ?? source.currentA ?? source.loadAmps, null);
    if (distanceMm <= 0) throw new Error(`Invalid adjacent influence ${index + 1}: distance must be positive.`);
    if (heatWm !== null && heatWm < 0) throw new Error(`Invalid adjacent influence ${index + 1}: heat must be non-negative.`);
    if (loadCurrentA !== null && loadCurrentA < 0) throw new Error(`Invalid adjacent influence ${index + 1}: current must be non-negative.`);
    return {
      id: String(source.id || `adjacent-${index + 1}`),
      label: String(source.label || source.name || `Adjacent ${index + 1}`),
      type: String(source.type || source.sourceType || 'heatSource'),
      distanceMm: round(distanceMm, 1),
      heatWm: round(heatWm ?? (loadCurrentA ? loadCurrentA * 0.2 : 0), 2),
      loadCurrentA: loadCurrentA === null ? null : round(loadCurrentA, 1),
      notes: String(source.notes || ''),
    };
  });
}

function normalizeOverloadProfile(rows = []) {
  return asArray(rows).map((row, index) => {
    const source = asObject(row);
    const hour = finiteNumber(source.hour ?? source.startHour ?? index, index);
    const durationHours = finiteNumber(source.durationHours ?? source.durationHr ?? source.duration, 1);
    const loadPct = finiteNumber(source.loadPct ?? source.loadPercent ?? source.percent, 100);
    if (durationHours <= 0) throw new Error(`Invalid emergency overload profile row ${index + 1}: duration must be positive.`);
    if (loadPct < 0) throw new Error(`Invalid emergency overload profile row ${index + 1}: load percent must be non-negative.`);
    return {
      hour: round(hour, 2),
      durationHours: round(durationHours, 2),
      loadPct: round(loadPct, 1),
      notes: String(source.notes || ''),
    };
  });
}

export function normalizeAdvancedThermalInputs(input = {}) {
  const source = asObject(input.advancedInputs || input);
  const solar = asObject(source.solar || {});
  const dryOut = asObject(source.dryOut || {});
  const exposureMode = normalizeExposureMode(source.exposureMode || input.exposureMode);
  const sheathBondingLossMode = normalizeSheathMode(source.sheathBondingLossMode || input.sheathBondingLossMode);
  const cyclicRatingMode = normalizeCyclicMode(source.cyclicRatingMode || input.cyclicRatingMode);
  const solarRadiationWm2 = finiteNumber(solar.solarRadiationWm2 ?? source.solarRadiationWm2 ?? input.solarRadiationWm2, 0);
  const windSpeedMs = finiteNumber(solar.windSpeedMs ?? source.windSpeedMs ?? input.windSpeedMs, 0);
  const solarEnabled = parseBoolean(solar.enabled ?? source.solarEnabled ?? input.solarEnabled, solarRadiationWm2 > 0);
  const drySoilResistivity = finiteNumber(dryOut.drySoilResistivity ?? source.drySoilResistivity ?? input.drySoilResistivity, null);
  const moistSoilResistivity = finiteNumber(dryOut.moistSoilResistivity ?? source.moistSoilResistivity ?? input.moistSoilResistivity, null);
  const criticalDryOutTempC = finiteNumber(dryOut.criticalTempC ?? source.criticalDryOutTempC ?? input.criticalDryOutTempC, null);
  return {
    enabled: parseBoolean(source.enabled ?? input.advancedInputsEnabled, Boolean(solarEnabled
      || drySoilResistivity
      || moistSoilResistivity
      || criticalDryOutTempC
      || asArray(source.backfillZones || input.backfillZones).length
      || asArray(source.adjacentInfluences || input.adjacentInfluences).length)),
    solar: {
      enabled: solarEnabled,
      solarRadiationWm2: Math.max(0, round(solarRadiationWm2, 1)),
      absorptivity: Math.min(1, Math.max(0, finiteNumber(solar.absorptivity ?? source.absorptivity ?? input.absorptivity, 0.7))),
      windSpeedMs: Math.max(0, round(windSpeedMs, 2)),
    },
    exposureMode,
    dryOut: {
      enabled: parseBoolean(dryOut.enabled ?? source.dryOutEnabled ?? input.dryOutEnabled, Boolean(drySoilResistivity || moistSoilResistivity || criticalDryOutTempC)),
      drySoilResistivity: drySoilResistivity === null ? null : Math.max(0.1, round(drySoilResistivity, 3)),
      moistSoilResistivity: moistSoilResistivity === null ? null : Math.max(0.1, round(moistSoilResistivity, 3)),
      criticalTempC: criticalDryOutTempC === null ? null : round(criticalDryOutTempC, 1),
    },
    backfillZones: buildThermalBackfillZones(source.backfillZones || input.backfillZones || []),
    adjacentInfluences: buildAdjacentThermalInfluenceRows(source.adjacentInfluences || input.adjacentInfluences || []),
    emergencyOverloadProfile: normalizeOverloadProfile(source.emergencyOverloadProfile || input.emergencyOverloadProfile || []),
    sheathBondingLossMode,
    cyclicRatingMode,
    notes: String(source.notes || input.advancedNotes || ''),
  };
}

export function normalizeCableThermalEnvironment(context = {}) {
  const env = { ...defaultEnvironment(), ...(context.environment || {}), ...context };
  const cables = asArray(context.cables || context.rows || context.manualCables).map((row, index) => {
    const parsedSize = parseSizeMm2(row);
    const insulation = normalizeInsulation(row.insulation || row.insulation_type || row.insulationType);
    const material = normalizeMaterial(row.material || row.conductor_material || row.conductorMaterial);
    const designCurrentA = finiteNumber(row.designCurrentA ?? row.loadAmps ?? row.currentA ?? row.ampacity ?? row.est_load ?? row.fla);
    const missingFields = [];
    if (!parsedSize.sizeMm2) missingFields.push('conductor_size');
    if (!Number.isFinite(designCurrentA)) missingFields.push('designCurrentA');
    const insulThickMm = finiteNumber(row.insulThickMm ?? row.insulationThicknessMm ?? row.insulation_thickness_mm)
      || (parsedSize.sizeMm2 ? defaultInsulThickMm(parsedSize.sizeMm2, voltageClass(row)) : null);
    return {
      id: row.id || row.tag || row.cable_id || `thermal-cable-${index + 1}`,
      cableTag: row.tag || row.id || row.cable_id || row.name || `Cable ${index + 1}`,
      source: row,
      sizeMm2: parsedSize.sizeMm2,
      sizeSource: parsedSize.source,
      material,
      insulation,
      insulThickMm,
      outerSheathMm: finiteNumber(row.outerSheathMm, env.outerSheathMm),
      nCores: finiteNumber(row.nCores ?? row.conductors, env.nCores),
      armoured: Boolean(row.armoured ?? env.armoured),
      U0_kV: u0FromVoltage(row),
      designCurrentA,
      missingFields,
      warnings: parsedSize.source && parsedSize.sizeMm2 && !/\bmm/i.test(parsedSize.source)
        ? [`Mapped ${parsedSize.source} to nearest IEC size ${parsedSize.sizeMm2} mm2 for screening.`]
        : [],
    };
  });

  const methods = asArray(env.installationMethods || env.methods || env.installationMethod)
    .map(normalizeMethod)
    .filter(Boolean);

  return {
    version: CABLE_THERMAL_ENVIRONMENT_VERSION,
    cables,
    environment: {
      installationMethods: methods.length ? [...new Set(methods)] : ['tray'],
      ambientTempC: finiteNumber(env.ambientTempC, 30),
      earthTempC: finiteNumber(env.earthTempC, 20),
      soilResistivity: finiteNumber(env.soilResistivity, 1.2),
      burialDepthMm: finiteNumber(env.burialDepthMm, 800),
      conduitOD_mm: finiteNumber(env.conduitOD_mm, 80),
      nCables: Math.max(1, Math.round(finiteNumber(env.nCables, 1))),
      groupArrangement: env.groupArrangement || 'flat',
      frequencyHz: finiteNumber(env.frequencyHz, 60),
      loadProfile: asArray(env.loadProfile || context.loadProfile),
    },
    warnings: [],
  };
}

export function buildThermalInstallationAlternatives(context = {}) {
  const normalized = context.cables && context.environment ? context : normalizeCableThermalEnvironment(context);
  return normalized.environment.installationMethods.map(method => ({
    method,
    iecMethod: methodForIec(method),
    ambientTempC: method === 'direct-burial' || method === 'ductbank' || method === 'conduit'
      ? normalized.environment.earthTempC
      : normalized.environment.ambientTempC,
    soilResistivity: normalized.environment.soilResistivity,
    burialDepthMm: normalized.environment.burialDepthMm,
    conduitOD_mm: normalized.environment.conduitOD_mm,
    nCables: normalized.environment.nCables,
    groupArrangement: normalized.environment.groupArrangement,
    frequencyHz: normalized.environment.frequencyHz,
  }));
}

function statusFor(loadPct, tempC, limitC, missingFields = []) {
  if (missingFields.length) return 'missingData';
  if (!Number.isFinite(loadPct) || !Number.isFinite(tempC)) return 'missingData';
  if (loadPct > 100 || tempC > limitC) return 'fail';
  if (loadPct >= 90 || tempC >= limitC - 5) return 'warn';
  return 'pass';
}

function limitingFactorFrom(result, alternative, loadPct, warnings = []) {
  if (loadPct > 100) return 'load current';
  if (alternative.soilResistivity > 2.5) return 'soil thermal resistivity';
  if ((result.f_group || 1) < 0.8) return 'grouping';
  if (alternative.ambientTempC > (result.thetaMax || 90) - 20) return 'ambient temperature';
  if (alternative.burialDepthMm > 1200) return 'burial depth';
  if (warnings.length) return 'input verification';
  return 'thermal margin';
}

function recommendationFor(status, limitingFactor) {
  if (status === 'missingData') return 'Complete cable size and design-current inputs before using the thermal screening result.';
  if (status === 'fail') return `Reduce load, upsize cable, improve installation, or address limiting factor: ${limitingFactor}.`;
  if (status === 'warn') return `Add thermal margin or verify ${limitingFactor} before release.`;
  return 'Thermal screening is within current limits; retain assumptions with the report package.';
}

function statusForAdjusted(row) {
  return statusFor(
    finiteNumber(row.loadPct),
    finiteNumber(row.estimatedConductorTempC),
    finiteNumber(row.temperatureLimitC, 90),
    []
  );
}

function updateRecommendation(row) {
  return {
    ...row,
    recommendation: recommendationFor(row.status, row.limitingFactor),
  };
}

function addModifierWaterfall(row, label, beforeA, afterA, note) {
  return {
    factor: label,
    beforeA: round(beforeA, 1),
    afterA: round(afterA, 1),
    deltaA: round(afterA - beforeA, 1),
    note,
  };
}

export function applyAdvancedThermalModifiers(evaluation = {}, advancedInputs = {}) {
  if (!advancedInputs?.enabled || evaluation.status === 'missingData') return {
    ...evaluation,
    advancedWarnings: [],
  };
  let row = {
    ...evaluation,
    warnings: [...asArray(evaluation.warnings)],
    waterfall: [...asArray(evaluation.waterfall)],
    advancedWarnings: [],
  };
  let allowable = finiteNumber(row.allowableAmpacityA, null);
  let temp = finiteNumber(row.estimatedConductorTempC, null);
  const designCurrent = finiteNumber(row.designCurrentA, null);
  const underground = ['direct-burial', 'ductbank', 'conduit'].includes(row.installationMethod);
  if (!Number.isFinite(allowable) || !Number.isFinite(temp) || !Number.isFinite(designCurrent)) return row;

  if (advancedInputs.solar?.enabled && ['tray', 'air'].includes(row.installationMethod)) {
    const before = allowable;
    const solarHeat = advancedInputs.solar.solarRadiationWm2 * advancedInputs.solar.absorptivity;
    const windRelief = Math.min(0.08, advancedInputs.solar.windSpeedMs * 0.01);
    const derate = Math.max(0.78, 1 - Math.min(0.18, solarHeat / 7000) + windRelief);
    allowable *= derate;
    temp += Math.max(0, solarHeat / 90 - advancedInputs.solar.windSpeedMs * 0.7);
    row.advancedWarnings.push(`Solar exposure screening applied (${advancedInputs.solar.solarRadiationWm2} W/m2, absorptivity ${advancedInputs.solar.absorptivity}).`);
    row.waterfall.push(addModifierWaterfall(row, 'Solar and wind exposure', before, allowable, 'Solar heating derates exposed tray/free-air screening ampacity; wind provides limited relief.'));
  }

  if (advancedInputs.exposureMode && advancedInputs.exposureMode !== 'standard') {
    const before = allowable;
    const factors = {
      surface: { derate: 0.96, temp: 2 },
      riser: { derate: 0.94, temp: 4 },
      tunnel: { derate: 0.9, temp: 6 },
      channel: { derate: 0.92, temp: 5 },
    };
    const modifier = factors[advancedInputs.exposureMode] || factors.surface;
    allowable *= modifier.derate;
    temp += modifier.temp;
    row.advancedWarnings.push(`Exposure mode ${advancedInputs.exposureMode} is applied as a screening modifier.`);
    row.waterfall.push(addModifierWaterfall(row, 'Exposure mode', before, allowable, `${advancedInputs.exposureMode} air/riser/channel behavior is screening-only.`));
  }

  if (advancedInputs.dryOut?.enabled && underground) {
    const dry = advancedInputs.dryOut.drySoilResistivity || row.ampacityBasis?.thermalResistances?.soilResistivity || null;
    const moist = advancedInputs.dryOut.moistSoilResistivity || 1.2;
    const critical = advancedInputs.dryOut.criticalTempC;
    const dryOutActive = critical === null || temp >= critical;
    if (dry && moist && dry > moist && dryOutActive) {
      const before = allowable;
      const ratio = Math.min(3, Math.max(1, dry / moist));
      const derate = Math.max(0.7, 1 / Math.sqrt(ratio));
      allowable *= derate;
      temp += (ratio - 1) * 6;
      row.advancedWarnings.push(`Soil dry-out risk: dry/moist resistivity ratio ${round(ratio, 2)} applied.`);
      row.waterfall.push(addModifierWaterfall(row, 'Soil dry-out', before, allowable, 'Dry soil thermal resistivity is applied when screening temperature reaches dry-out criteria.'));
    }
  }

  if (advancedInputs.backfillZones?.length && underground) {
    const weighted = advancedInputs.backfillZones.reduce((acc, zone) => {
      acc.sum += zone.thermalResistivity * zone.thicknessMm;
      acc.thickness += zone.thicknessMm;
      return acc;
    }, { sum: 0, thickness: 0 });
    const averageRho = weighted.thickness ? weighted.sum / weighted.thickness : 1.2;
    if (averageRho > 1.2) {
      const before = allowable;
      const derate = Math.max(0.78, 1 - Math.min(0.18, (averageRho - 1.2) * 0.08));
      allowable *= derate;
      temp += (averageRho - 1.2) * 2;
      row.advancedWarnings.push(`Backfill zones average ${round(averageRho, 2)} K m/W for screening.`);
      row.waterfall.push(addModifierWaterfall(row, 'Backfill zones', before, allowable, 'Multiple backfill zones are reduced to a weighted screening equivalent.'));
    }
  }

  if (advancedInputs.adjacentInfluences?.length) {
    const totalInfluence = advancedInputs.adjacentInfluences.reduce((sum, item) => sum + (item.heatWm || 0) / Math.max(1, item.distanceMm / 100), 0);
    if (totalInfluence > 0) {
      const before = allowable;
      const derate = Math.max(0.78, 1 - Math.min(0.2, totalInfluence / 1200));
      allowable *= derate;
      temp += Math.min(15, totalInfluence / 30);
      row.advancedWarnings.push(`Adjacent thermal influence applied from ${advancedInputs.adjacentInfluences.length} source(s).`);
      row.waterfall.push(addModifierWaterfall(row, 'Adjacent heat sources', before, allowable, 'Neighboring circuits/heat sources are applied as deterministic screening influence.'));
    }
  }

  if (advancedInputs.sheathBondingLossMode && advancedInputs.sheathBondingLossMode !== 'screeningDefault') {
    const before = allowable;
    const factor = advancedInputs.sheathBondingLossMode === 'bothEndsBonded' ? 0.94
      : advancedInputs.sheathBondingLossMode === 'crossBonded' ? 0.98
        : 1;
    allowable *= factor;
    temp += factor < 1 ? 2 : 0;
    row.advancedWarnings.push(`Sheath/bonding loss mode ${advancedInputs.sheathBondingLossMode} is recorded as a screening modifier.`);
    row.waterfall.push(addModifierWaterfall(row, 'Sheath/bonding loss', before, allowable, 'Bonding loss mode affects screening ampacity only.'));
  }

  row.allowableAmpacityA = round(allowable, 1);
  row.loadPct = round(designCurrent / Math.max(allowable, 1) * 100, 1);
  row.estimatedConductorTempC = round(temp, 1);
  row.status = statusForAdjusted(row);
  row.limitingFactor = row.advancedWarnings.length ? 'advanced thermal environment' : row.limitingFactor;
  row.warnings = [...row.warnings, ...row.advancedWarnings];
  return updateRecommendation(row);
}

function evaluateOneCable(cable, alternative, context = {}) {
  if (cable.missingFields.length) {
    const status = 'missingData';
    return {
      cableTag: cable.cableTag,
      installationMethod: alternative.method,
      designCurrentA: round(cable.designCurrentA, 1),
      allowableAmpacityA: null,
      loadPct: null,
      estimatedConductorTempC: null,
      temperatureLimitC: MAX_TEMP_C[cable.insulation] || 90,
      status,
      limitingFactor: 'missing data',
      waterfall: [],
      warnings: [`Missing ${cable.missingFields.join(', ')}.`],
      recommendation: recommendationFor(status, 'missing data'),
    };
  }

  try {
    const result = calcAmpacity({
      sizeMm2: cable.sizeMm2,
      material: cable.material,
      insulation: cable.insulation,
      insulThickMm: cable.insulThickMm,
      outerSheathMm: cable.outerSheathMm,
      nCores: cable.nCores,
      armoured: cable.armoured,
      installMethod: alternative.iecMethod,
      burialDepthMm: alternative.burialDepthMm,
      soilResistivity: alternative.soilResistivity,
      conduitOD_mm: alternative.conduitOD_mm,
      ambientTempC: alternative.ambientTempC,
      frequencyHz: alternative.frequencyHz,
      U0_kV: cable.U0_kV,
      nCables: alternative.nCables,
      groupArrangement: alternative.groupArrangement,
    });
    const finiteOverride = context.ductbankFiniteResults?.[cable.cableTag] || context.ductbankFiniteResults?.[cable.id];
    const allowable = alternative.method === 'ductbank' && Number.isFinite(finiteNumber(finiteOverride))
      ? finiteNumber(finiteOverride)
      : result.I_rated;
    const loadPct = cable.designCurrentA / allowable * 100;
    const tempC = alternative.ambientTempC + ((MAX_TEMP_C[cable.insulation] - alternative.ambientTempC) * Math.pow(cable.designCurrentA / Math.max(allowable, 1), 2));
    const warnings = [...cable.warnings, ...asArray(result.warnings)];
    if (alternative.method === 'ductbank' && !finiteOverride) warnings.push('Duct-bank result uses IEC conduit screening because no saved finite thermal solution was available.');
    const status = statusFor(loadPct, tempC, result.thetaMax, []);
    const limitingFactor = limitingFactorFrom(result, alternative, loadPct, warnings);
    const evaluation = {
      cableTag: cable.cableTag,
      installationMethod: alternative.method,
      designCurrentA: round(cable.designCurrentA, 1),
      allowableAmpacityA: round(allowable, 1),
      loadPct: round(loadPct, 1),
      estimatedConductorTempC: round(tempC, 1),
      temperatureLimitC: result.thetaMax,
      status,
      limitingFactor,
      waterfall: [],
      warnings,
      recommendation: recommendationFor(status, limitingFactor),
      ampacityBasis: {
        baseAmpacityA: result.I_base,
        groupDerating: result.f_group,
        thermalResistances: result.thermalResistances,
        mappedSizeMm2: cable.sizeMm2,
        sizeSource: cable.sizeSource,
      },
    };
    const baseEvaluation = { ...evaluation, waterfall: buildDeratingWaterfall(evaluation) };
    return applyAdvancedThermalModifiers(baseEvaluation, context.advancedInputs);
  } catch (err) {
    const status = 'missingData';
    return {
      cableTag: cable.cableTag,
      installationMethod: alternative.method,
      designCurrentA: round(cable.designCurrentA, 1),
      allowableAmpacityA: null,
      loadPct: null,
      estimatedConductorTempC: null,
      temperatureLimitC: MAX_TEMP_C[cable.insulation] || 90,
      status,
      limitingFactor: 'calculation input',
      waterfall: [],
      warnings: [err.message || 'Thermal calculation failed.'],
      recommendation: recommendationFor(status, 'calculation input'),
    };
  }
}

export function evaluateCableThermalEnvironment(context = {}, options = {}) {
  const normalized = normalizeCableThermalEnvironment(context);
  const advancedInputs = normalizeAdvancedThermalInputs(context);
  const alternatives = buildThermalInstallationAlternatives(normalized);
  return normalized.cables.flatMap(cable => alternatives.map(alternative => evaluateOneCable(cable, alternative, {
    ductbankFiniteResults: context.ductbankFiniteResults || context.finiteAmpacity || {},
    advancedInputs,
    options,
  })));
}

export function buildDeratingWaterfall(evaluation = {}) {
  const basis = evaluation.ampacityBasis || {};
  const base = finiteNumber(basis.baseAmpacityA);
  const rated = finiteNumber(evaluation.allowableAmpacityA);
  const rows = [];
  if (base && rated) rows.push({
    factor: 'Grouping and installation',
    beforeA: round(base, 1),
    afterA: round(rated, 1),
    deltaA: round(rated - base, 1),
    note: `Group factor ${basis.groupDerating ?? 'n/a'}; installation ${evaluation.installationMethod}.`,
  });
  if (Number.isFinite(evaluation.designCurrentA) && rated) rows.push({
    factor: 'Design current loading',
    beforeA: round(rated, 1),
    afterA: round(evaluation.designCurrentA, 1),
    deltaA: round(evaluation.designCurrentA - rated, 1),
    note: `${evaluation.loadPct ?? 'n/a'}% of allowable ampacity.`,
  });
  if (Number.isFinite(evaluation.estimatedConductorTempC)) rows.push({
    factor: 'Conductor temperature',
    beforeA: round(evaluation.temperatureLimitC, 1),
    afterA: round(evaluation.estimatedConductorTempC, 1),
    deltaA: round(evaluation.estimatedConductorTempC - evaluation.temperatureLimitC, 1),
    note: `${evaluation.limitingFactor || 'thermal'} governs screening margin.`,
  });
  return rows;
}

export function buildCableTemperatureTimeline(evaluation = {}, loadProfile = []) {
  const profile = asArray(loadProfile).length ? asArray(loadProfile) : [
    { hour: 0, loadPct: 70 },
    { hour: 6, loadPct: 85 },
    { hour: 12, loadPct: 100 },
    { hour: 18, loadPct: 90 },
    { hour: 24, loadPct: 70 },
  ];
  const ambient = Number.isFinite(evaluation.estimatedConductorTempC) && Number.isFinite(evaluation.loadPct) && evaluation.loadPct > 0
    ? evaluation.estimatedConductorTempC - ((evaluation.temperatureLimitC - 20) * Math.pow(evaluation.loadPct / 100, 2))
    : 20;
  return profile.map((point, index) => {
    const loadPct = finiteNumber(point.loadPct ?? point.loadPercent ?? point.loadFactorPct, 100);
    const temp = ambient + ((evaluation.temperatureLimitC - ambient) * Math.pow(loadPct / 100, 2));
    return {
      hour: round(finiteNumber(point.hour, index), 2),
      loadPct: round(loadPct, 1),
      estimatedConductorTempC: round(temp, 1),
      status: temp > evaluation.temperatureLimitC ? 'fail' : temp >= evaluation.temperatureLimitC - 5 ? 'warn' : 'pass',
    };
  });
}

export function buildEmergencyThermalProfile(evaluation = {}, overloadProfile = []) {
  const profile = normalizeOverloadProfile(overloadProfile);
  const rows = profile.length ? profile : [
    { hour: 0, durationHours: 1, loadPct: 100, notes: 'Normal load' },
    { hour: 1, durationHours: 2, loadPct: 110, notes: 'Emergency screening load' },
    { hour: 3, durationHours: 1, loadPct: 90, notes: 'Recovery' },
  ];
  return rows.map((point, index) => {
    const baseLoadPct = finiteNumber(evaluation.loadPct, 0);
    const loadPct = baseLoadPct * point.loadPct / 100;
    const ambient = finiteNumber(evaluation.estimatedConductorTempC, 20) - ((finiteNumber(evaluation.temperatureLimitC, 90) - 20) * Math.pow(Math.max(baseLoadPct, 1) / 100, 2));
    const temp = ambient + ((finiteNumber(evaluation.temperatureLimitC, 90) - ambient) * Math.pow(loadPct / 100, 2));
    return {
      hour: point.hour,
      durationHours: point.durationHours,
      loadPct: round(loadPct, 1),
      overloadPct: point.loadPct,
      estimatedConductorTempC: round(temp, 1),
      status: temp > evaluation.temperatureLimitC ? 'fail' : temp >= evaluation.temperatureLimitC - 5 ? 'warn' : 'pass',
      notes: point.notes || `Emergency profile row ${index + 1}`,
    };
  });
}

export function summarizeCableThermalEnvironment(evaluations = []) {
  const rows = asArray(evaluations);
  return {
    total: rows.length,
    pass: rows.filter(row => row.status === 'pass').length,
    warn: rows.filter(row => row.status === 'warn').length,
    fail: rows.filter(row => row.status === 'fail').length,
    missingData: rows.filter(row => row.status === 'missingData').length,
    worstLoadPct: round(Math.max(0, ...rows.map(row => finiteNumber(row.loadPct, 0))), 1),
    maxEstimatedTempC: round(Math.max(0, ...rows.map(row => finiteNumber(row.estimatedConductorTempC, 0))), 1),
  };
}

export function buildCableThermalEnvironmentPackage(context = {}) {
  const normalized = normalizeCableThermalEnvironment(context);
  const advancedInputs = normalizeAdvancedThermalInputs(context);
  const evaluations = evaluateCableThermalEnvironment(context);
  const loadProfile = normalized.environment.loadProfile;
  const timeline = evaluations
    .filter(row => row.status !== 'missingData')
    .slice(0, 12)
    .map(row => ({
      cableTag: row.cableTag,
      installationMethod: row.installationMethod,
      points: buildCableTemperatureTimeline(row, loadProfile),
    }));
  const emergencyProfiles = advancedInputs.emergencyOverloadProfile.length
    ? evaluations
      .filter(row => row.status !== 'missingData')
      .slice(0, 12)
      .map(row => ({
        cableTag: row.cableTag,
        installationMethod: row.installationMethod,
        points: buildEmergencyThermalProfile(row, advancedInputs.emergencyOverloadProfile),
      }))
    : [];
  const cyclicRatingRows = evaluations
    .filter(row => row.status !== 'missingData')
    .map(row => {
      const emergencyPoints = emergencyProfiles.find(profile => profile.cableTag === row.cableTag && profile.installationMethod === row.installationMethod)?.points || [];
      const status = emergencyPoints.some(point => point.status === 'fail') ? 'fail'
        : emergencyPoints.some(point => point.status === 'warn') ? 'warn'
          : row.status;
      return {
        cableTag: row.cableTag,
        installationMethod: row.installationMethod,
        cyclicRatingMode: advancedInputs.cyclicRatingMode,
        emergencyPointCount: emergencyPoints.length,
        maxEmergencyTempC: round(Math.max(0, ...emergencyPoints.map(point => finiteNumber(point.estimatedConductorTempC, 0))), 1),
        status,
        recommendation: status === 'fail'
          ? 'Emergency/cyclic profile exceeds the screening temperature limit; reduce emergency load or increase cable capacity.'
          : status === 'warn'
            ? 'Emergency/cyclic profile is close to the thermal limit; verify with project-specific transient rating calculation.'
            : 'Emergency/cyclic screening profile is within the deterministic v1 limit basis.',
      };
    });
  const summary = summarizeCableThermalEnvironment(evaluations);
  const advancedWarnings = [
    ...new Set(evaluations.flatMap(row => asArray(row.advancedWarnings))),
    ...(emergencyProfiles.some(profile => profile.points.some(point => point.status === 'fail'))
      ? ['Emergency overload profile exceeds the screening conductor temperature limit.']
      : []),
    ...(advancedInputs.enabled
      ? ['Advanced thermal inputs are deterministic screening modifiers and are not a finite-element CYMCAP/Cableizer model.']
      : []),
  ];
  const warnings = [
    ...new Set(evaluations.flatMap(row => asArray(row.warnings))),
    ...advancedWarnings,
    ...(summary.fail > 0 ? ['One or more cable thermal environment rows exceed screening limits.'] : []),
    ...(summary.missingData > 0 ? ['One or more cable rows are missing required thermal inputs.'] : []),
  ];
  return {
    version: CABLE_THERMAL_ENVIRONMENT_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName: context.projectName || 'Untitled Project',
    summary,
    environment: normalized.environment,
    advancedInputs,
    backfillZones: advancedInputs.backfillZones,
    adjacentInfluences: advancedInputs.adjacentInfluences,
    evaluations,
    timeline,
    emergencyProfiles,
    cyclicRatingRows,
    advancedWarnings,
    warnings,
    assumptions: [
      'Cable thermal environment results are deterministic screening outputs using IEC 60287-style ampacity calculations.',
      'Duct-bank rows use saved finite thermal results when provided; otherwise they use an IEC conduit screening equivalent.',
      'Final cable ampacity and installation approvals require engineer review and project-specific standard/manufacturer verification.',
    ],
  };
}

export function buildAdvancedCableThermalPackage(context = {}) {
  return buildCableThermalEnvironmentPackage(context);
}

export function renderCableThermalEnvironmentHTML(pkg = {}) {
  const rows = asArray(pkg.evaluations);
  const summary = pkg.summary || {};
  const advancedWarnings = asArray(pkg.advancedWarnings);
  const emergencyRows = asArray(pkg.emergencyProfiles).flatMap(profile => asArray(profile.points).map(point => ({
    cableTag: profile.cableTag,
    installationMethod: profile.installationMethod,
    ...point,
  })));
  return `<section class="report-section" id="rpt-cable-thermal-environment">
  <h2>Cable Thermal Environment</h2>
  <p class="report-note">Screening-grade comparison of cable installation environments; not a CYMCAP/Cableizer finite-element model.</p>
  <dl class="report-dl">
    <dt>Total Rows</dt><dd>${escapeHtml(summary.total || 0)}</dd>
    <dt>Pass</dt><dd>${escapeHtml(summary.pass || 0)}</dd>
    <dt>Warnings</dt><dd>${escapeHtml(summary.warn || 0)}</dd>
    <dt>Failures</dt><dd>${escapeHtml(summary.fail || 0)}</dd>
    <dt>Missing Data</dt><dd>${escapeHtml(summary.missingData || 0)}</dd>
    <dt>Advanced Warnings</dt><dd>${escapeHtml(advancedWarnings.length)}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Cable</th><th>Method</th><th>Load A</th><th>Allowable A</th><th>Load %</th><th>Temp C</th><th>Status</th><th>Limiting Factor</th><th>Recommendation</th></tr></thead>
      <tbody>${rows.length ? rows.map(row => `<tr>
        <td>${escapeHtml(row.cableTag)}</td>
        <td>${escapeHtml(row.installationMethod)}</td>
        <td>${escapeHtml(row.designCurrentA ?? '—')}</td>
        <td>${escapeHtml(row.allowableAmpacityA ?? '—')}</td>
        <td>${escapeHtml(row.loadPct ?? '—')}</td>
        <td>${escapeHtml(row.estimatedConductorTempC ?? '—')}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.limitingFactor)}</td>
        <td>${escapeHtml(row.recommendation)}</td>
      </tr>`).join('') : '<tr><td colspan="9">No cable thermal environment rows available.</td></tr>'}</tbody>
    </table>
  </div>
  ${advancedWarnings.length ? `<h3>Advanced Thermal Warnings</h3>
  <ul>${advancedWarnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
  ${emergencyRows.length ? `<h3>Emergency / Cyclic Profile</h3>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Cable</th><th>Method</th><th>Hour</th><th>Duration</th><th>Load %</th><th>Temp C</th><th>Status</th><th>Notes</th></tr></thead>
      <tbody>${emergencyRows.map(row => `<tr>
        <td>${escapeHtml(row.cableTag)}</td>
        <td>${escapeHtml(row.installationMethod)}</td>
        <td>${escapeHtml(row.hour)}</td>
        <td>${escapeHtml(row.durationHours)}</td>
        <td>${escapeHtml(row.loadPct)}</td>
        <td>${escapeHtml(row.estimatedConductorTempC)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.notes)}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>` : ''}
</section>`;
}

import { evaluateInterferenceAssessment } from '../src/studies/cp/interferenceAssessment.js';

export const CATHODIC_PROTECTION_NETWORK_VERSION = 'cp-network-v1';

const CRITERIA_BASES = new Set(['naceSp0169', 'iso15589', 'project']);
const REPORT_PRESETS = new Set(['summary', 'criteria', 'fullStudy']);
const SEASONAL_CASES = new Set(['nominal', 'dry', 'wet', 'winter', 'custom']);
const STRUCTURE_TYPES = new Set(['pipe', 'tank', 'casing', 'grounding', 'custom']);
const ANODE_TYPES = new Set(['galvanic', 'impressedCurrent', 'deepWell', 'distributed', 'custom']);
const RECTIFIER_TYPES = new Set(['manual', 'autoPotential', 'currentControlled', 'solar', 'custom']);
const BOND_TYPES = new Set(['solidBond', 'resistorBond', 'diodeBond', 'isolationJoint', 'drainageBond', 'custom']);
const INTERFERENCE_TYPES = new Set(['foreignStructure', 'dcTraction', 'hvacInduction', 'strayCurrent', 'telluric', 'custom']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value, fallback = '') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback, label) {
  const number = finite(value, fallback);
  if (number == null || number <= 0) throw new Error(`${label} must be greater than zero`);
  return number;
}

function nonNegative(value, fallback, label) {
  const number = finite(value, fallback);
  if (number == null || number < 0) throw new Error(`${label} must be zero or greater`);
  return number;
}

function enumValue(value, allowed, fallback, label) {
  const normalized = text(value, fallback);
  if (!allowed.has(normalized)) throw new Error(`${label} must be one of: ${[...allowed].join(', ')}`);
  return normalized;
}

function round(value, places = 3) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function statusFromMargin(margin, warnAt = 0.1) {
  if (margin == null || !Number.isFinite(margin)) return 'missingData';
  if (margin < 0) return 'fail';
  if (margin <= warnAt) return 'warn';
  return 'pass';
}

function seasonalMultiplier(caseName, custom = null) {
  if (caseName === 'dry') return 1.25;
  if (caseName === 'wet') return 0.9;
  if (caseName === 'winter') return 1.1;
  if (caseName === 'custom') return positive(custom ?? 1, 1, 'Custom seasonal multiplier');
  return 1;
}

function criteriaFor(caseData = {}) {
  const instantOffTargetMv = finite(caseData.instantOffTargetMv, -850);
  const polarizationShiftTargetMv = finite(caseData.polarizationShiftTargetMv, 100);
  return { instantOffTargetMv, polarizationShiftTargetMv };
}

export function normalizeCpNetworkCase(input = {}) {
  const raw = asObject(input);
  const criteriaBasis = enumValue(raw.criteriaBasis, CRITERIA_BASES, 'naceSp0169', 'Criteria basis');
  const seasonalCase = enumValue(raw.seasonalCase, SEASONAL_CASES, 'nominal', 'Seasonal soil case');
  const reportPreset = enumValue(raw.reportPreset, REPORT_PRESETS, 'summary', 'Report preset');
  return {
    id: text(raw.id, 'cp-network-case-1'),
    name: text(raw.name ?? raw.caseName, 'Cathodic Protection Network Model'),
    criteriaBasis,
    seasonalCase,
    seasonalSoilMultiplier: seasonalMultiplier(seasonalCase, raw.seasonalSoilMultiplier),
    profileStationSpacingM: positive(raw.profileStationSpacingM ?? raw.stationSpacingM ?? 50, 50, 'Profile station spacing'),
    instantOffTargetMv: finite(raw.instantOffTargetMv, -850),
    polarizationShiftTargetMv: positive(raw.polarizationShiftTargetMv ?? 100, 100, 'Polarization shift target'),
    maxRectifierLoadingPct: positive(raw.maxRectifierLoadingPct ?? 90, 90, 'Maximum rectifier loading'),
    reportPreset,
    notes: text(raw.notes),
  };
}

export function normalizeCpStructureRows(rows = [], options = {}) {
  const caseData = normalizeCpNetworkCase(options.networkCase || options);
  const sourceRows = asArray(rows);
  return sourceRows.map((row, index) => {
    const raw = asObject(row);
    const missingFields = [];
    const surfaceAreaM2 = finite(raw.surfaceAreaM2 ?? raw.areaM2, null);
    const currentDensityMaM2 = finite(raw.currentDensityMaM2 ?? raw.designCurrentDensityMaM2, null);
    if (surfaceAreaM2 == null) missingFields.push('surfaceAreaM2');
    if (currentDensityMaM2 == null) missingFields.push('currentDensityMaM2');
    if (surfaceAreaM2 != null && surfaceAreaM2 <= 0) throw new Error(`Structure row ${index + 1} surfaceAreaM2 must be greater than zero`);
    if (currentDensityMaM2 != null && currentDensityMaM2 < 0) throw new Error(`Structure row ${index + 1} currentDensityMaM2 must be zero or greater`);
    const coatingBreakdownFactor = finite(raw.coatingBreakdownFactor ?? raw.coatingFactor, 0.2);
    if (coatingBreakdownFactor <= 0 || coatingBreakdownFactor > 1) throw new Error(`Structure row ${index + 1} coatingBreakdownFactor must be between 0 and 1`);
    const requiredCurrentA = surfaceAreaM2 != null && currentDensityMaM2 != null
      ? surfaceAreaM2 * coatingBreakdownFactor * (currentDensityMaM2 / 1000) * caseData.seasonalSoilMultiplier
      : null;
    const lengthM = positive(raw.lengthM ?? raw.stationLengthM ?? 100, 100, `Structure row ${index + 1} length`);
    return {
      id: text(raw.id, `cp-structure-${index + 1}`),
      tag: text(raw.tag ?? raw.structureTag ?? raw.label, `Structure ${index + 1}`),
      structureType: enumValue(raw.structureType ?? raw.assetType, STRUCTURE_TYPES, 'pipe', `Structure row ${index + 1} type`),
      zone: text(raw.zone ?? raw.area, 'Zone 1'),
      stationStartM: nonNegative(raw.stationStartM ?? 0, 0, `Structure row ${index + 1} station start`),
      lengthM,
      surfaceAreaM2: round(surfaceAreaM2),
      coatingBreakdownFactor: round(coatingBreakdownFactor, 4),
      currentDensityMaM2: round(currentDensityMaM2),
      requiredCurrentA: round(requiredCurrentA, 4),
      soilResistivityOhmM: positive(raw.soilResistivityOhmM ?? raw.soilResistivity ?? 100, 100, `Structure row ${index + 1} soil resistivity`),
      testStationRef: text(raw.testStationRef ?? raw.measurementRef),
      notes: text(raw.notes),
      missingFields,
      status: missingFields.length ? 'missingData' : 'ready',
    };
  });
}

export function normalizeCpAnodeRows(rows = [], options = {}) {
  normalizeCpNetworkCase(options.networkCase || options);
  return asArray(rows).map((row, index) => {
    const raw = asObject(row);
    const ratedOutputA = finite(raw.ratedOutputA ?? raw.outputA, null);
    if (ratedOutputA == null) throw new Error(`Anode row ${index + 1} ratedOutputA is required`);
    if (ratedOutputA < 0) throw new Error(`Anode row ${index + 1} ratedOutputA must be zero or greater`);
    return {
      id: text(raw.id, `cp-anode-${index + 1}`),
      tag: text(raw.tag ?? raw.anodeTag ?? raw.label, `Anode ${index + 1}`),
      anodeType: enumValue(raw.anodeType ?? raw.type, ANODE_TYPES, 'galvanic', `Anode row ${index + 1} type`),
      zone: text(raw.zone ?? raw.area, 'Zone 1'),
      stationM: nonNegative(raw.stationM ?? raw.locationM ?? 0, 0, `Anode row ${index + 1} station`),
      ratedOutputA: round(ratedOutputA, 4),
      maxOutputA: round(nonNegative(raw.maxOutputA ?? ratedOutputA, ratedOutputA, `Anode row ${index + 1} max output`), 4),
      bedResistanceOhm: round(positive(raw.bedResistanceOhm ?? raw.resistanceOhm ?? 1, 1, `Anode row ${index + 1} bed resistance`), 4),
      enabled: raw.enabled !== false,
      notes: text(raw.notes),
    };
  });
}

export function normalizeCpRectifierRows(rows = [], options = {}) {
  normalizeCpNetworkCase(options.networkCase || options);
  return asArray(rows).map((row, index) => {
    const raw = asObject(row);
    const voltageRatingV = finite(raw.voltageRatingV ?? raw.vdc, null);
    const currentRatingA = finite(raw.currentRatingA ?? raw.adc, null);
    if (voltageRatingV != null && voltageRatingV <= 0) throw new Error(`Rectifier row ${index + 1} voltage rating must be greater than zero`);
    if (currentRatingA != null && currentRatingA <= 0) throw new Error(`Rectifier row ${index + 1} current rating must be greater than zero`);
    return {
      id: text(raw.id, `cp-rectifier-${index + 1}`),
      tag: text(raw.tag ?? raw.rectifierTag ?? raw.label, `Rectifier ${index + 1}`),
      rectifierType: enumValue(raw.rectifierType ?? raw.type, RECTIFIER_TYPES, 'manual', `Rectifier row ${index + 1} type`),
      zone: text(raw.zone ?? raw.area, 'Zone 1'),
      voltageRatingV: round(voltageRatingV),
      currentRatingA: round(currentRatingA, 4),
      operatingVoltageV: round(nonNegative(raw.operatingVoltageV ?? 0, 0, `Rectifier row ${index + 1} operating voltage`), 4),
      operatingCurrentA: round(nonNegative(raw.operatingCurrentA ?? 0, 0, `Rectifier row ${index + 1} operating current`), 4),
      enabled: raw.enabled !== false,
      notes: text(raw.notes),
      missingFields: [
        ...(voltageRatingV == null ? ['voltageRatingV'] : []),
        ...(currentRatingA == null ? ['currentRatingA'] : []),
      ],
    };
  });
}

export function normalizeCpBondRows(rows = [], options = {}) {
  normalizeCpNetworkCase(options.networkCase || options);
  return asArray(rows).map((row, index) => {
    const raw = asObject(row);
    const bondType = enumValue(raw.bondType ?? raw.type, BOND_TYPES, 'resistorBond', `Bond row ${index + 1} type`);
    const resistanceOhm = finite(raw.resistanceOhm, bondType === 'isolationJoint' ? null : 1);
    if (resistanceOhm != null && resistanceOhm < 0) throw new Error(`Bond row ${index + 1} resistanceOhm must be zero or greater`);
    return {
      id: text(raw.id, `cp-bond-${index + 1}`),
      tag: text(raw.tag ?? raw.label, `Bond ${index + 1}`),
      bondType,
      fromStructureId: text(raw.fromStructureId ?? raw.fromId),
      toStructureId: text(raw.toStructureId ?? raw.toId),
      zone: text(raw.zone ?? raw.area, 'Zone 1'),
      resistanceOhm: round(resistanceOhm, 4),
      designCurrentA: round(nonNegative(raw.designCurrentA ?? 0, 0, `Bond row ${index + 1} design current`), 4),
      status: raw.status || (bondType === 'isolationJoint' ? 'review' : 'ready'),
      notes: text(raw.notes),
      missingFields: !raw.fromStructureId && !raw.fromId ? ['fromStructureId'] : [],
    };
  });
}

export function normalizeCpInterferenceSourceRows(rows = [], options = {}) {
  normalizeCpNetworkCase(options.networkCase || options);
  return asArray(rows).map((row, index) => {
    const raw = asObject(row);
    const riskLevel = text(raw.riskLevel, 'medium');
    const sourceType = enumValue(raw.sourceType ?? raw.type, INTERFERENCE_TYPES, 'foreignStructure', `Interference row ${index + 1} type`);
    return {
      id: text(raw.id, `cp-interference-${index + 1}`),
      label: text(raw.label ?? raw.tag ?? raw.name, `Interference Source ${index + 1}`),
      sourceType,
      zone: text(raw.zone ?? raw.area, 'Zone 1'),
      couplingDistanceM: round(nonNegative(raw.couplingDistanceM ?? raw.distanceM ?? 0, 0, `Interference row ${index + 1} coupling distance`), 3),
      strayCurrentA: round(nonNegative(raw.strayCurrentA ?? raw.estimatedCurrentA ?? 0, 0, `Interference row ${index + 1} stray current`), 4),
      riskLevel,
      mitigationStatus: text(raw.mitigationStatus ?? raw.status, 'unresolved'),
      notes: text(raw.notes ?? raw.description),
    };
  });
}

export function normalizeCpPolarizationRows(rows = [], options = {}) {
  const caseData = normalizeCpNetworkCase(options.networkCase || options);
  return asArray(rows).map((row, index) => {
    const raw = asObject(row);
    const nativePotentialMv = finite(raw.nativePotentialMv, null);
    const instantOffMv = finite(raw.instantOffMv ?? raw.instantOffPotentialMv, null);
    const depolarizedMv = finite(raw.depolarizedMv ?? raw.finalOffMv, null);
    const polarizationShiftMv = finite(raw.polarizationShiftMv, nativePotentialMv != null && depolarizedMv != null ? Math.abs(depolarizedMv - nativePotentialMv) : null);
    return {
      id: text(raw.id, `cp-polarization-${index + 1}`),
      structureId: text(raw.structureId ?? raw.targetId),
      testStationRef: text(raw.testStationRef ?? raw.stationRef, `TS-${index + 1}`),
      stationM: nonNegative(raw.stationM ?? 0, 0, `Polarization row ${index + 1} station`),
      nativePotentialMv: round(nativePotentialMv),
      instantOffMv: round(instantOffMv),
      depolarizedMv: round(depolarizedMv),
      polarizationShiftMv: round(polarizationShiftMv),
      measurementDate: text(raw.measurementDate),
      source: text(raw.source ?? raw.measuredBy),
      notes: text(raw.notes),
      missingFields: [
        ...(instantOffMv == null ? ['instantOffMv'] : []),
        ...(polarizationShiftMv == null ? ['polarizationShiftMv'] : []),
      ],
      status: instantOffMv == null || polarizationShiftMv == null ? 'missingData' : 'pending',
      criteria: criteriaFor(caseData),
    };
  });
}

function buildLegacyContext(legacy = {}) {
  if (!legacy || typeof legacy !== 'object') return {};
  return {
    structureRows: [{
      id: 'legacy-cp-structure',
      tag: legacy.assetType || 'Legacy CP structure',
      structureType: legacy.assetType === 'tank' ? 'tank' : 'pipe',
      surfaceAreaM2: legacy.surfaceAreaM2 || 100,
      coatingBreakdownFactor: legacy.coatingBreakdownFactor || 0.2,
      currentDensityMaM2: legacy.designCurrentDensityMaM2 || 10,
      soilResistivityOhmM: legacy.soilResistivityOhmM || 100,
      lengthM: legacy.pipeLengthM || 100,
    }],
    anodeRows: [{
      id: 'legacy-cp-anode',
      tag: 'Legacy anode allowance',
      anodeType: legacy.anodeTypeSystem === 'iccp' ? 'impressedCurrent' : 'galvanic',
      ratedOutputA: legacy.requiredCurrentA || 0.1,
      zone: 'Zone 1',
    }],
    rectifierRows: legacy.anodeTypeSystem === 'iccp' ? [{
      id: 'legacy-cp-rectifier',
      tag: 'Legacy rectifier allowance',
      currentRatingA: Math.max(legacy.requiredCurrentA || 0.1, 0.1) * 1.25,
      voltageRatingV: 24,
      operatingCurrentA: legacy.requiredCurrentA || 0.1,
      operatingVoltageV: 12,
    }] : [],
    polarizationRows: legacy.measuredInstantOffPotentialMv ? [{
      structureId: 'legacy-cp-structure',
      testStationRef: 'Legacy instant-off',
      instantOffMv: legacy.measuredInstantOffPotentialMv,
      polarizationShiftMv: legacy.measuredPolarizationShiftMv || null,
    }] : [],
  };
}

export function evaluateCpNetworkModel(context = {}, options = {}) {
  const networkCase = normalizeCpNetworkCase(context.networkCase || context.case || options.networkCase || {});
  const legacyContext = context.legacySizing || context.cathodicProtection || context.legacyResult
    ? buildLegacyContext(context.legacySizing || context.cathodicProtection || context.legacyResult)
    : {};
  const structureRows = normalizeCpStructureRows(context.structureRows || context.structures || legacyContext.structureRows || [], { networkCase });
  const anodeRows = normalizeCpAnodeRows(context.anodeRows || context.anodes || legacyContext.anodeRows || [], { networkCase });
  const rectifierRows = normalizeCpRectifierRows(context.rectifierRows || context.rectifiers || legacyContext.rectifierRows || [], { networkCase });
  const bondRows = normalizeCpBondRows(context.bondRows || context.bonds || [], { networkCase });
  const interferenceRows = normalizeCpInterferenceSourceRows(context.interferenceRows || context.interferenceSources || [], { networkCase });
  const polarizationRows = normalizeCpPolarizationRows(context.polarizationRows || context.measurementRows || legacyContext.polarizationRows || [], { networkCase });
  const warningRows = [];

  if (!structureRows.length) warningRows.push({ code: 'missing-structures', severity: 'missingData', message: 'No CP structure rows are defined.', recommendation: 'Add structure rows with surface area, coating, zone, and current density.' });
  if (!anodeRows.length && !rectifierRows.length) warningRows.push({ code: 'missing-anode-sources', severity: 'missingData', message: 'No anode or rectifier source rows are defined.', recommendation: 'Add galvanic/impressed-current anode and rectifier source rows.' });
  if (!polarizationRows.length) warningRows.push({ code: 'missing-polarization-data', severity: 'missingData', message: 'No polarization or instant-off measurement rows are defined.', recommendation: 'Add test-station measurements or mark the package as design-only screening.' });

  const demandByZone = new Map();
  structureRows.forEach(row => {
    if (row.status === 'missingData') {
      warningRows.push({
        code: 'missing-structure-data',
        severity: 'missingData',
        sourceId: row.id,
        sourceTag: row.tag,
        message: `${row.tag} is missing ${row.missingFields.join(', ')}.`,
        recommendation: 'Complete structure current-demand inputs before release.',
      });
    }
    demandByZone.set(row.zone, (demandByZone.get(row.zone) || 0) + (row.requiredCurrentA || 0));
  });

  const sourceByZone = new Map();
  anodeRows.filter(row => row.enabled).forEach(row => {
    sourceByZone.set(row.zone, (sourceByZone.get(row.zone) || 0) + (row.ratedOutputA || 0));
  });
  rectifierRows.filter(row => row.enabled).forEach(row => {
    const capacity = row.currentRatingA ?? row.operatingCurrentA ?? 0;
    sourceByZone.set(row.zone, (sourceByZone.get(row.zone) || 0) + capacity);
    if (row.missingFields.length) {
      warningRows.push({
        code: 'missing-rectifier-data',
        severity: 'missingData',
        sourceId: row.id,
        sourceTag: row.tag,
        message: `${row.tag} is missing ${row.missingFields.join(', ')}.`,
        recommendation: 'Complete rectifier voltage and current ratings.',
      });
    }
  });

  const criteriaRows = structureRows.map(row => {
    const demandA = row.requiredCurrentA || 0;
    const availableA = sourceByZone.get(row.zone) || 0;
    const allocatedCurrentA = demandByZone.get(row.zone) > 0 ? availableA * demandA / demandByZone.get(row.zone) : 0;
    const marginA = allocatedCurrentA - demandA;
    const marginPct = demandA > 0 ? marginA / demandA * 100 : null;
    const status = row.status === 'missingData' ? 'missingData' : statusFromMargin(marginPct, 15);
    if (status === 'fail' || status === 'warn' || status === 'missingData') {
      warningRows.push({
        code: status === 'fail' ? 'under-protected-zone' : status === 'warn' ? 'low-cp-current-margin' : 'missing-current-demand',
        severity: status,
        sourceId: row.id,
        sourceTag: row.tag,
        message: `${row.tag} has ${round(marginPct, 1) ?? 'n/a'}% current margin in ${row.zone}.`,
        recommendation: 'Review anode output, rectifier capacity, coating demand, and zone effectiveness.',
      });
    }
    return {
      id: `criteria-${row.id}`,
      structureId: row.id,
      structureTag: row.tag,
      zone: row.zone,
      checkType: 'currentAllocation',
      requiredCurrentA: round(demandA, 4),
      allocatedCurrentA: round(allocatedCurrentA, 4),
      marginA: round(marginA, 4),
      marginPct: round(marginPct, 2),
      status,
      recommendation: status === 'pass' ? 'Current allocation meets screening demand.' : 'Increase source output, reduce coating demand, or split the zone.',
    };
  });

  rectifierRows.forEach(row => {
    const loadingPct = row.currentRatingA ? (row.operatingCurrentA / row.currentRatingA) * 100 : null;
    const status = row.missingFields.length ? 'missingData' : loadingPct > networkCase.maxRectifierLoadingPct ? 'warn' : 'pass';
    if (status !== 'pass') {
      warningRows.push({
        code: status === 'missingData' ? 'missing-rectifier-rating' : 'rectifier-high-loading',
        severity: status,
        sourceId: row.id,
        sourceTag: row.tag,
        message: `${row.tag} loading is ${round(loadingPct, 1) ?? 'n/a'}%.`,
        recommendation: 'Confirm rectifier rating, tap setting, and reserve margin.',
      });
    }
    criteriaRows.push({
      id: `criteria-${row.id}`,
      rectifierId: row.id,
      structureTag: row.tag,
      zone: row.zone,
      checkType: 'rectifierCapacity',
      requiredCurrentA: row.operatingCurrentA,
      allocatedCurrentA: row.currentRatingA,
      marginPct: round(row.currentRatingA ? 100 - loadingPct : null, 2),
      status,
      recommendation: status === 'pass' ? 'Rectifier loading is within screening limit.' : 'Review rectifier capacity or reduce output loading.',
    });
  });

  const criteria = criteriaFor(networkCase);
  const evaluatedPolarizationRows = polarizationRows.map(row => {
    const instantStatus = row.instantOffMv == null ? 'missingData' : row.instantOffMv <= criteria.instantOffTargetMv ? 'pass' : row.instantOffMv <= criteria.instantOffTargetMv + 50 ? 'warn' : 'fail';
    const shiftStatus = row.polarizationShiftMv == null ? 'missingData' : row.polarizationShiftMv >= criteria.polarizationShiftTargetMv ? 'pass' : row.polarizationShiftMv >= criteria.polarizationShiftTargetMv * 0.8 ? 'warn' : 'fail';
    const status = [instantStatus, shiftStatus].includes('fail') ? 'fail' : [instantStatus, shiftStatus].includes('warn') ? 'warn' : [instantStatus, shiftStatus].includes('missingData') ? 'missingData' : 'pass';
    if (status !== 'pass') {
      warningRows.push({
        code: status === 'missingData' ? 'missing-polarization-data' : 'polarization-criteria-review',
        severity: status,
        sourceId: row.id,
        sourceTag: row.testStationRef,
        message: `${row.testStationRef} polarization status is ${status}.`,
        recommendation: 'Review instant-off potential, polarization shift, and measurement correction basis.',
      });
    }
    return {
      ...row,
      instantOffTargetMv: criteria.instantOffTargetMv,
      polarizationShiftTargetMv: criteria.polarizationShiftTargetMv,
      instantOffStatus: instantStatus,
      polarizationShiftStatus: shiftStatus,
      status,
      recommendation: status === 'pass' ? 'Polarization screening criteria are met.' : 'Complete or review CP measurement evidence.',
    };
  });

  const evaluatedBondRows = bondRows.map(row => {
    const status = row.missingFields.length ? 'missingData' : row.status === 'review' ? 'warn' : 'pass';
    if (status !== 'pass') {
      warningRows.push({
        code: row.bondType === 'isolationJoint' ? 'isolation-review' : 'bond-data-review',
        severity: status,
        sourceId: row.id,
        sourceTag: row.tag,
        message: `${row.tag} requires bond/isolation review.`,
        recommendation: 'Verify bond resistance, isolation intent, and drainage current assumptions.',
      });
    }
    return { ...row, status };
  });

  const evaluatedInterferenceRows = interferenceRows.map(row => {
    const status = row.riskLevel === 'high' && row.mitigationStatus !== 'resolved'
      ? 'fail'
      : row.riskLevel === 'high' || row.mitigationStatus === 'unresolved'
        ? 'warn'
        : 'pass';
    if (status !== 'pass') {
      warningRows.push({
        code: 'interference-review',
        severity: status,
        sourceId: row.id,
        sourceTag: row.label,
        message: `${row.label} interference risk is ${row.riskLevel} and mitigation is ${row.mitigationStatus}.`,
        recommendation: 'Coordinate mitigation, bonding, drainage, or field verification for interference source.',
      });
    }
    return { ...row, status };
  });

  const aggregateInterference = evaluateInterferenceAssessment({
    nearbyForeignStructures: evaluatedInterferenceRows.some(row => row.sourceType === 'foreignStructure') ? 'multiple' : 'none',
    dcTractionSystem: evaluatedInterferenceRows.some(row => row.sourceType === 'dcTraction') ? 'nearby' : 'none',
    knownInterferenceSources: evaluatedInterferenceRows.some(row => row.status === 'fail') ? 'confirmed' : evaluatedInterferenceRows.length ? 'possible' : 'none',
    mitigationProfile: evaluatedInterferenceRows.some(row => row.riskLevel === 'high') ? 'critical' : 'baseline',
    mitigationActions: evaluatedInterferenceRows.filter(row => row.mitigationStatus === 'resolved').map(row => 'baseline survey'),
  });

  const evaluation = {
    networkCase,
    structureRows,
    anodeRows,
    rectifierRows,
    bondRows: evaluatedBondRows,
    interferenceRows: evaluatedInterferenceRows,
    aggregateInterference,
    polarizationRows: evaluatedPolarizationRows,
    criteriaRows,
    warningRows,
  };
  const potentialProfileRows = buildCpPotentialProfileRows(evaluation, { stationSpacingM: networkCase.profileStationSpacingM });
  potentialProfileRows.filter(row => row.status !== 'pass').slice(0, 20).forEach(row => {
    warningRows.push({
      code: 'potential-profile-review',
      severity: row.status,
      sourceId: row.structureId,
      sourceTag: row.structureTag,
      message: `${row.structureTag} station ${row.stationM} m potential is ${row.estimatedInstantOffMv} mV.`,
      recommendation: 'Review zone current allocation, soil case, and test-station validation.',
    });
  });

  const allStatusRows = [...criteriaRows, ...evaluatedPolarizationRows, ...evaluatedBondRows, ...evaluatedInterferenceRows, ...potentialProfileRows];
  const summary = allStatusRows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {
    structureCount: structureRows.length,
    anodeCount: anodeRows.length,
    rectifierCount: rectifierRows.length,
    bondCount: evaluatedBondRows.length,
    interferenceCount: evaluatedInterferenceRows.length,
    polarizationCount: evaluatedPolarizationRows.length,
    profilePointCount: potentialProfileRows.length,
    totalDemandA: round(structureRows.reduce((sum, row) => sum + (row.requiredCurrentA || 0), 0), 4),
    totalSourceA: round([...sourceByZone.values()].reduce((sum, value) => sum + value, 0), 4),
    warningCount: warningRows.length,
    interferenceRiskLevel: aggregateInterference.riskLevel,
  });
  summary.pass ||= 0;
  summary.warn ||= 0;
  summary.fail ||= 0;
  summary.missingData ||= 0;

  return {
    ...evaluation,
    potentialProfileRows,
    summary,
    assumptions: [
      'Cathodic-protection network results are deterministic screening calculations using row-level current demand and source allocation.',
      'Potential profiles are estimated from current allocation and criteria basis; they are not finite-element corrosion modeling.',
      'Final CP acceptance requires project-specific field testing, reference electrode corrections, and qualified corrosion engineering review.',
    ],
  };
}

export function buildCpPotentialProfileRows(evaluation = {}, options = {}) {
  const networkCase = normalizeCpNetworkCase(evaluation.networkCase || {});
  const spacingM = positive(options.stationSpacingM ?? networkCase.profileStationSpacingM, networkCase.profileStationSpacingM, 'Potential profile station spacing');
  const criteriaByStructure = new Map(asArray(evaluation.criteriaRows)
    .filter(row => row.checkType === 'currentAllocation')
    .map(row => [row.structureId, row]));
  const target = criteriaFor(networkCase).instantOffTargetMv;
  return asArray(evaluation.structureRows).flatMap(structure => {
    const points = Math.max(1, Math.floor(structure.lengthM / spacingM) + 1);
    const allocation = criteriaByStructure.get(structure.id);
    const ratio = allocation?.requiredCurrentA > 0 ? allocation.allocatedCurrentA / allocation.requiredCurrentA : null;
    return Array.from({ length: points }, (_, index) => {
      const stationM = structure.stationStartM + Math.min(structure.lengthM, index * spacingM);
      const edgePenalty = points <= 2 ? 0 : (index === 0 || index === points - 1 ? 35 : 0);
      const estimatedInstantOffMv = ratio == null
        ? null
        : round(-650 - Math.min(330, ratio * 250) + edgePenalty - (networkCase.seasonalSoilMultiplier - 1) * 80, 1);
      const marginMv = estimatedInstantOffMv == null ? null : target - estimatedInstantOffMv;
      const status = estimatedInstantOffMv == null ? 'missingData' : estimatedInstantOffMv <= target ? 'pass' : estimatedInstantOffMv <= target + 50 ? 'warn' : 'fail';
      return {
        id: `profile-${structure.id}-${index + 1}`,
        structureId: structure.id,
        structureTag: structure.tag,
        zone: structure.zone,
        stationM: round(stationM, 2),
        estimatedInstantOffMv,
        targetInstantOffMv: target,
        marginMv: round(marginMv, 1),
        status,
        recommendation: status === 'pass' ? 'Estimated potential meets screening criterion.' : 'Review anode spacing, current allocation, and field measurement plan.',
      };
    });
  });
}

export function buildCathodicProtectionNetworkPackage(context = {}) {
  const evaluation = evaluateCpNetworkModel(context);
  return {
    version: CATHODIC_PROTECTION_NETWORK_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName: text(context.projectName, 'Untitled Project'),
    ...evaluation,
  };
}

export function renderCathodicProtectionNetworkHTML(pkg = {}) {
  const summary = asObject(pkg.summary);
  const rowClass = status => status === 'fail' ? 'result-fail' : (status === 'warn' || status === 'missingData' ? 'result-warn' : 'result-ok');
  const tableRows = (rows, cells) => asArray(rows).map(row => `<tr class="${rowClass(row.status || row.severity)}">${cells(row)}</tr>`).join('');
  return `
<section class="report-section" id="rpt-cp-network">
  <h2>Cathodic Protection Network and Interference Model</h2>
  <p class="meta">${escapeHtml(pkg.projectName || 'Untitled Project')} - ${escapeHtml(pkg.networkCase?.name || 'CP Network Model')}</p>
  <p>${escapeHtml(summary.structureCount || 0)} structure(s), ${escapeHtml(summary.anodeCount || 0)} anode row(s), ${escapeHtml(summary.rectifierCount || 0)} rectifier row(s), total demand ${escapeHtml(summary.totalDemandA ?? 'n/a')} A, total source ${escapeHtml(summary.totalSourceA ?? 'n/a')} A.</p>
  <table>
    <thead><tr><th>Structure</th><th>Zone</th><th>Required A</th><th>Allocated A</th><th>Margin</th><th>Status</th><th>Recommendation</th></tr></thead>
    <tbody>${tableRows(pkg.criteriaRows, row => `
      <td>${escapeHtml(row.structureTag || row.rectifierId || row.id)}</td>
      <td>${escapeHtml(row.zone)}</td>
      <td>${escapeHtml(row.requiredCurrentA ?? '')}</td>
      <td>${escapeHtml(row.allocatedCurrentA ?? '')}</td>
      <td>${escapeHtml(row.marginPct ?? '')}%</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(row.recommendation)}</td>`) || '<tr><td colspan="7">No criteria rows.</td></tr>'}</tbody>
  </table>
  <h3>Polarization and Instant-Off Evidence</h3>
  <table>
    <thead><tr><th>Test Station</th><th>Instant-Off mV</th><th>Shift mV</th><th>Status</th><th>Source</th><th>Recommendation</th></tr></thead>
    <tbody>${tableRows(pkg.polarizationRows, row => `
      <td>${escapeHtml(row.testStationRef)}</td>
      <td>${escapeHtml(row.instantOffMv ?? 'n/a')}</td>
      <td>${escapeHtml(row.polarizationShiftMv ?? 'n/a')}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(row.source)}</td>
      <td>${escapeHtml(row.recommendation)}</td>`) || '<tr><td colspan="6">No polarization rows.</td></tr>'}</tbody>
  </table>
  <h3>Interference and Bonds</h3>
  <table>
    <thead><tr><th>Source</th><th>Type</th><th>Zone</th><th>Risk</th><th>Status</th><th>Notes</th></tr></thead>
    <tbody>${tableRows(pkg.interferenceRows, row => `
      <td>${escapeHtml(row.label)}</td>
      <td>${escapeHtml(row.sourceType)}</td>
      <td>${escapeHtml(row.zone)}</td>
      <td>${escapeHtml(row.riskLevel)}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(row.notes)}</td>`) || '<tr><td colspan="6">No interference rows.</td></tr>'}</tbody>
  </table>
  ${asArray(pkg.warningRows).length ? `<h3>Warnings</h3>
  <table>
    <thead><tr><th>Code</th><th>Source</th><th>Severity</th><th>Message</th><th>Recommendation</th></tr></thead>
    <tbody>${asArray(pkg.warningRows).map(row => `<tr class="${rowClass(row.severity)}">
      <td>${escapeHtml(row.code)}</td>
      <td>${escapeHtml(row.sourceTag || row.sourceId || '')}</td>
      <td>${escapeHtml(row.severity)}</td>
      <td>${escapeHtml(row.message)}</td>
      <td>${escapeHtml(row.recommendation)}</td>
    </tr>`).join('')}</tbody>
  </table>` : ''}
  <h3>Assumptions</h3>
  <ul>${asArray(pkg.assumptions).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
</section>`;
}

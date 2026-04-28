export const HARMONIC_STUDY_CASE_VERSION = 'harmonic-study-case-v1';

const SOURCE_TYPES = new Set(['vfd', 'ups', 'rectifier', 'ibr', 'arcFurnace', 'generic']);
const COMPLIANCE_BASES = new Set(['IEEE519-2022', 'IEEE519-2014', 'projectBasis']);
const REPORT_PRESETS = new Set(['summary', 'compliance', 'fullStudy']);
const SEQUENCE_OPTIONS = new Set(['screening', 'blocked', 'passed', 'review']);
const FILTER_TYPES = new Set(['passiveDetuned', 'passiveTuned', 'activeFilter', 'reactor', 'capacitorBank', 'reviewOnly']);

const DEFAULT_STUDY_CASE = {
  pccBus: '',
  pccTag: '',
  utilityScMva: null,
  utilityXrRatio: 10,
  nominalVoltageKv: 0.48,
  ieee519VoltageClass: 'lowVoltage',
  maximumDemandCurrentA: null,
  demandCurrentBasis: '',
  complianceBasis: 'IEEE519-2022',
  selectedComplianceBasis: 'IEEE519-2022',
  transformerPhaseShift: '',
  zeroSequenceTreatment: 'screening',
  triplenTreatment: 'screening',
  reportPreset: 'summary',
  reviewNotes: '',
};

const DEFAULT_SPECTRA = {
  vfd: { 5: 35, 7: 25, 11: 9, 13: 7 },
  ups: { 5: 28, 7: 18, 11: 8, 13: 5 },
  rectifier: { 5: 32, 7: 22, 11: 9, 13: 6 },
  ibr: { 2: 3, 3: 3, 5: 8, 7: 6, 11: 3 },
  arcFurnace: { 2: 12, 3: 9, 4: 7, 5: 8, 7: 5 },
  generic: { 5: 20, 7: 14, 11: 6, 13: 4 },
};

const CHARACTERISTIC_ORDERS = {
  vfd: [5, 7, 11, 13],
  ups: [5, 7, 11, 13],
  rectifier: [5, 7, 11, 13],
  ibr: [2, 3, 5, 7, 11],
  arcFurnace: [2, 3, 4, 5, 7],
  generic: [5, 7],
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parseNumber(value, fallback = null) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return fallback;
}

function parseBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'on'].includes(normalized)) return true;
    if (['false', 'no', 'n', '0', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function round(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function esc(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slug(value = '') {
  return String(value || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function normalizeChoice(value, allowed, fallback, label) {
  const raw = String(value || fallback).trim();
  if (!allowed.has(raw)) throw new Error(`Unsupported harmonic ${label}: ${raw}`);
  return raw;
}

function voltageClassForKv(kv) {
  if (kv <= 1) return 'lowVoltage';
  if (kv < 69) return 'below69kV';
  if (kv <= 161) return '69to161kV';
  return 'above161kV';
}

function voltageThdLimitPct(voltageClass) {
  if (voltageClass === 'lowVoltage') return 8;
  if (voltageClass === 'below69kV') return 5;
  if (voltageClass === '69to161kV') return 2.5;
  return 1.5;
}

function individualVoltageLimitPct(voltageClass) {
  if (voltageClass === 'lowVoltage') return 5;
  if (voltageClass === 'below69kV') return 3;
  if (voltageClass === '69to161kV') return 1.5;
  return 1;
}

function currentTddLimitPct(iscIlRatio, voltageClass) {
  if (!Number.isFinite(iscIlRatio) || iscIlRatio <= 0) return null;
  let limit = 5;
  if (iscIlRatio >= 1000) limit = 20;
  else if (iscIlRatio >= 100) limit = 15;
  else if (iscIlRatio >= 50) limit = 12;
  else if (iscIlRatio >= 20) limit = 8;
  if (voltageClass === '69to161kV') return Math.min(limit, 5);
  if (voltageClass === 'above161kV') return Math.min(limit, 2.5);
  return limit;
}

export function parseHarmonicSpectrum(spec) {
  const map = {};
  if (!spec) return map;
  if (Array.isArray(spec)) {
    spec.forEach((value, index) => {
      const number = parseNumber(value);
      const order = index + 1;
      if (Number.isFinite(number) && number > 0 && order > 1) map[order] = number;
    });
    return map;
  }
  if (typeof spec === 'object') {
    Object.entries(spec).forEach(([key, value]) => {
      const order = parseNumber(key);
      const number = parseNumber(value);
      if (Number.isFinite(order) && order > 1 && Number.isFinite(number) && number >= 0) map[order] = number;
    });
    return map;
  }
  const text = String(spec || '').trim();
  if (!text) return map;
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return parseHarmonicSpectrum(JSON.parse(text));
    } catch {
      return map;
    }
  }
  text.split(/[,\s;]+/).forEach(token => {
    if (!token) return;
    const [rawOrder, rawValue] = token.split(':');
    const order = parseNumber(rawOrder);
    const value = parseNumber(rawValue ?? rawOrder);
    if (Number.isFinite(order) && order > 1 && Number.isFinite(value) && value >= 0) map[order] = value;
  });
  return map;
}

function spectrumText(spectrum = {}) {
  return Object.entries(spectrum)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([order, pct]) => `${order}:${round(pct, 2)}`)
    .join(', ');
}

function normalizeOrderList(value, fallback = []) {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(/[,\s;]+/);
  return [...new Set(source
    .map(row => parseNumber(row))
    .filter(row => Number.isFinite(row) && row > 1)
    .map(row => round(row, 3)))]
    .sort((a, b) => a - b)
    .length ? [...new Set(source
      .map(row => parseNumber(row))
      .filter(row => Number.isFinite(row) && row > 1)
      .map(row => round(row, 3)))].sort((a, b) => a - b) : fallback;
}

export function normalizeHarmonicStudyCase(input = {}) {
  const raw = asObject(input);
  const nominalVoltageKv = parseNumber(raw.nominalVoltageKv ?? raw.voltageKv ?? raw.kv, DEFAULT_STUDY_CASE.nominalVoltageKv);
  if (!Number.isFinite(nominalVoltageKv) || nominalVoltageKv <= 0) {
    throw new Error('Harmonic nominal voltage must be greater than zero.');
  }
  const utilityScMva = parseNumber(raw.utilityScMva ?? raw.scMva);
  if (utilityScMva != null && (!Number.isFinite(utilityScMva) || utilityScMva <= 0)) {
    throw new Error('Harmonic utility short-circuit MVA must be greater than zero when provided.');
  }
  const maximumDemandCurrentA = parseNumber(raw.maximumDemandCurrentA ?? raw.demandCurrentA);
  if (maximumDemandCurrentA != null && (!Number.isFinite(maximumDemandCurrentA) || maximumDemandCurrentA <= 0)) {
    throw new Error('Harmonic maximum demand current must be greater than zero when provided.');
  }
  const utilityXrRatio = parseNumber(raw.utilityXrRatio ?? raw.xrRatio, DEFAULT_STUDY_CASE.utilityXrRatio);
  if (!Number.isFinite(utilityXrRatio) || utilityXrRatio <= 0) {
    throw new Error('Harmonic utility X/R ratio must be greater than zero.');
  }
  const selectedComplianceBasis = normalizeChoice(
    raw.selectedComplianceBasis || raw.complianceBasis,
    COMPLIANCE_BASES,
    DEFAULT_STUDY_CASE.complianceBasis,
    'compliance basis'
  );
  const voltageClass = String(raw.ieee519VoltageClass || raw.voltageClass || voltageClassForKv(nominalVoltageKv)).trim();
  return {
    pccBus: String(raw.pccBus || raw.pccBusId || '').trim(),
    pccTag: String(raw.pccTag || raw.pccLabel || raw.pccBus || '').trim(),
    utilityScMva,
    utilityXrRatio,
    nominalVoltageKv,
    ieee519VoltageClass: voltageClass,
    maximumDemandCurrentA,
    demandCurrentBasis: String(raw.demandCurrentBasis || '').trim(),
    complianceBasis: selectedComplianceBasis,
    selectedComplianceBasis,
    transformerPhaseShift: String(raw.transformerPhaseShift || '').trim(),
    zeroSequenceTreatment: normalizeChoice(raw.zeroSequenceTreatment, SEQUENCE_OPTIONS, DEFAULT_STUDY_CASE.zeroSequenceTreatment, 'zero-sequence treatment'),
    triplenTreatment: normalizeChoice(raw.triplenTreatment, SEQUENCE_OPTIONS, DEFAULT_STUDY_CASE.triplenTreatment, 'triplen treatment'),
    reportPreset: normalizeChoice(raw.reportPreset, REPORT_PRESETS, DEFAULT_STUDY_CASE.reportPreset, 'report preset'),
    reviewNotes: String(raw.reviewNotes || raw.notes || '').trim(),
  };
}

export function normalizeHarmonicSourceRows(rows = [], options = {}) {
  const defaultsFromOneLine = buildSourceRowsFromOneLine(options.oneLine || {});
  const inputRows = asArray(rows).length ? asArray(rows) : defaultsFromOneLine;
  return inputRows.map((row, index) => {
    const raw = asObject(row);
    const sourceType = String(raw.sourceType || raw.type || 'generic').trim();
    if (!SOURCE_TYPES.has(sourceType)) throw new Error(`Unsupported harmonic source type: ${sourceType}`);
    const spectrum = parseHarmonicSpectrum(raw.spectrum ?? raw.spectrumText ?? raw.harmonics);
    const finalSpectrum = Object.keys(spectrum).length ? spectrum : { ...DEFAULT_SPECTRA[sourceType] };
    const characteristicOrders = normalizeOrderList(raw.characteristicOrders, CHARACTERISTIC_ORDERS[sourceType]);
    const nonCharacteristicOrders = normalizeOrderList(raw.nonCharacteristicOrders, []);
    const fundamentalCurrentA = parseNumber(raw.fundamentalCurrentA ?? raw.currentA ?? raw.loadCurrentA);
    const kva = parseNumber(raw.kva ?? raw.kVA);
    const kw = parseNumber(raw.kw ?? raw.kW);
    const missingFields = [];
    const defaultedFields = [];
    if (!raw.spectrum && !raw.spectrumText && !raw.harmonics) defaultedFields.push('spectrum');
    if (!Number.isFinite(fundamentalCurrentA) && !Number.isFinite(kva) && !Number.isFinite(kw)) missingFields.push('currentOrPowerBasis');
    const interharmonic = parseBool(raw.interharmonic ?? raw.hasInterharmonics, false);
    if (interharmonic) defaultedFields.push('interharmonicReview');
    const status = raw.status || (missingFields.length ? 'missingData' : (interharmonic || nonCharacteristicOrders.length ? 'review' : 'ready'));
    return {
      id: String(raw.id || raw.sourceId || raw.componentId || `harmonic-source-${index + 1}`).trim(),
      sourceType,
      busId: String(raw.busId || raw.bus || raw.pccBus || '').trim(),
      componentId: String(raw.componentId || raw.ref || raw.id || '').trim(),
      tag: String(raw.tag || raw.name || raw.label || raw.componentId || `Source ${index + 1}`).trim(),
      kw: Number.isFinite(kw) ? kw : null,
      kva: Number.isFinite(kva) ? kva : null,
      fundamentalCurrentA: Number.isFinite(fundamentalCurrentA) ? fundamentalCurrentA : null,
      spectrum: finalSpectrum,
      spectrumText: spectrumText(finalSpectrum),
      characteristicOrders,
      nonCharacteristicOrders,
      interharmonic,
      phaseData: asObject(raw.phaseData),
      status,
      missingFields,
      defaultedFields,
      warnings: [
        ...missingFields.map(field => ({ severity: 'warning', code: 'missingSourceInput', message: `${field} is required for IEEE 519 TDD screening.` })),
        ...(interharmonic ? [{ severity: 'warning', code: 'interharmonicReview', message: `${raw.tag || raw.componentId || `Source ${index + 1}`} has interharmonic content flagged for review.` }] : []),
        ...(nonCharacteristicOrders.length ? [{ severity: 'warning', code: 'nonCharacteristicReview', message: `${raw.tag || raw.componentId || `Source ${index + 1}`} has non-characteristic harmonic orders requiring engineering review.` }] : []),
      ],
    };
  });
}

function flattenOneLine(oneLine = {}) {
  const sheets = asArray(oneLine.sheets);
  if (sheets.length) return sheets.flatMap(sheet => asArray(sheet.components));
  return asArray(oneLine.components || oneLine);
}

function buildSourceRowsFromOneLine(oneLine = {}) {
  return flattenOneLine(oneLine)
    .filter(component => component?.harmonicSource)
    .map(component => ({
      id: component.id,
      componentId: component.id,
      tag: component.tag || component.label || component.name || component.id,
      sourceType: component.harmonicSourceType || component.sourceType || 'generic',
      busId: component.bus || component.busId || '',
      kw: component.load?.kw || component.load?.P || component.kw || null,
      kva: component.kva || component.kVA || null,
      fundamentalCurrentA: component.currentA || null,
      spectrum: component.harmonics,
    }));
}

function resultForSource(source = {}, harmonicResults = {}) {
  const results = asObject(harmonicResults?.results || harmonicResults);
  return results[source.componentId] || results[source.id] || results[source.tag] || {};
}

function spectrumRmsPct(spectrum = {}) {
  const sumSq = Object.values(spectrum).reduce((sum, pct) => sum + (Number(pct) || 0) ** 2, 0);
  return Math.sqrt(sumSq);
}

function maxIndividualPct(spectrum = {}) {
  return Math.max(0, ...Object.values(spectrum).map(value => Number(value) || 0));
}

function sourceCurrentA(source = {}, studyCase = {}) {
  if (Number.isFinite(source.fundamentalCurrentA)) return source.fundamentalCurrentA;
  const kva = Number(source.kva);
  if (Number.isFinite(kva) && kva > 0 && studyCase.nominalVoltageKv > 0) {
    return round((kva * 1000) / (Math.sqrt(3) * studyCase.nominalVoltageKv * 1000), 3);
  }
  const kw = Number(source.kw);
  if (Number.isFinite(kw) && kw > 0 && studyCase.nominalVoltageKv > 0) {
    return round((kw * 1000) / (Math.sqrt(3) * studyCase.nominalVoltageKv * 1000 * 0.9), 3);
  }
  return null;
}

function availableShortCircuitCurrentA(studyCase = {}) {
  if (!Number.isFinite(studyCase.utilityScMva) || !Number.isFinite(studyCase.nominalVoltageKv) || studyCase.nominalVoltageKv <= 0) return null;
  return round((studyCase.utilityScMva * 1000000) / (Math.sqrt(3) * studyCase.nominalVoltageKv * 1000), 3);
}

function classifyCompliance(actual, limit) {
  if (!Number.isFinite(actual) || !Number.isFinite(limit)) return 'missingData';
  if (actual > limit) return 'fail';
  if (actual >= limit * 0.9) return 'warn';
  return 'pass';
}

function complianceRecommendation(status, checkType) {
  if (status === 'pass') return 'Keep harmonic study case with report assumptions for utility/PCC review.';
  if (status === 'warn') return 'Review source spectrum and filter alternatives before adding new nonlinear loads or capacitors.';
  if (status === 'missingData') return 'Add PCC demand-current basis, utility short-circuit envelope, and source spectrum data before compliance release.';
  if (checkType === 'TDD') return 'Reduce injected harmonic current, add active/passive filtering, or verify higher Isc/IL basis with the utility.';
  return 'Review voltage distortion at the PCC and evaluate detuned filtering or source mitigation.';
}

export function buildIeee519ComplianceRows({ studyCase, sourceRows, harmonicResults } = {}) {
  const normalizedCase = normalizeHarmonicStudyCase(studyCase || {});
  const sources = normalizeHarmonicSourceRows(sourceRows || []);
  const voltageClass = normalizedCase.ieee519VoltageClass || voltageClassForKv(normalizedCase.nominalVoltageKv);
  const vLimit = voltageThdLimitPct(voltageClass);
  const individualLimit = individualVoltageLimitPct(voltageClass);
  const iscA = availableShortCircuitCurrentA(normalizedCase);
  const demandA = normalizedCase.maximumDemandCurrentA;
  const iscIlRatio = Number.isFinite(iscA) && Number.isFinite(demandA) ? iscA / demandA : null;
  const tddLimit = currentTddLimitPct(iscIlRatio, voltageClass);
  const rows = [];
  sources.forEach(source => {
    const result = resultForSource(source, harmonicResults);
    const sourceCurrent = sourceCurrentA(source, normalizedCase);
    const ithd = parseNumber(result.ithd, spectrumRmsPct(source.spectrum));
    const vthd = parseNumber(result.vthd, null);
    const estimatedVthd = Number.isFinite(vthd)
      ? vthd
      : Number.isFinite(sourceCurrent) && Number.isFinite(iscA) && iscA > 0
        ? round((sourceCurrent / iscA) * ithd * 100, 3)
        : null;
    const individualVoltage = Number.isFinite(estimatedVthd) && ithd > 0
      ? round(estimatedVthd * (maxIndividualPct(source.spectrum) / ithd), 3)
      : null;
    const tdd = Number.isFinite(ithd) && Number.isFinite(sourceCurrent) && Number.isFinite(demandA) && demandA > 0
      ? round(ithd * (sourceCurrent / demandA), 3)
      : null;
    [
      { checkType: 'VTHD', actualValue: estimatedVthd, limitValue: vLimit, basis: 'IEEE 519 PCC voltage THD' },
      { checkType: 'Individual Voltage', actualValue: individualVoltage, limitValue: individualLimit, basis: 'IEEE 519 individual voltage distortion' },
      { checkType: 'TDD', actualValue: tdd, limitValue: tddLimit, basis: 'IEEE 519 total demand distortion' },
    ].forEach(check => {
      const missingFields = [];
      if (check.checkType === 'TDD' && !Number.isFinite(demandA)) missingFields.push('maximumDemandCurrentA');
      if (!Number.isFinite(iscA)) missingFields.push('utilityScMva');
      if (!Number.isFinite(sourceCurrent)) missingFields.push('sourceCurrentA');
      const status = missingFields.length ? 'missingData' : classifyCompliance(check.actualValue, check.limitValue);
      rows.push({
        id: `${slug(source.id)}-${slug(check.checkType)}`,
        sourceId: source.id,
        sourceTag: source.tag,
        busId: source.busId || normalizedCase.pccBus,
        pccTag: normalizedCase.pccTag || normalizedCase.pccBus,
        checkType: check.checkType,
        basis: check.basis,
        actualValue: Number.isFinite(check.actualValue) ? round(check.actualValue, 3) : null,
        limitValue: Number.isFinite(check.limitValue) ? round(check.limitValue, 3) : null,
        margin: Number.isFinite(check.actualValue) && Number.isFinite(check.limitValue) ? round(check.limitValue - check.actualValue, 3) : null,
        status,
        iscIlRatio: Number.isFinite(iscIlRatio) ? round(iscIlRatio, 2) : null,
        demandCurrentA: Number.isFinite(demandA) ? demandA : null,
        sourceCurrentA: Number.isFinite(sourceCurrent) ? sourceCurrent : null,
        missingFields,
        recommendation: complianceRecommendation(status, check.checkType),
      });
    });
  });
  if (!sources.length) {
    rows.push({
      id: 'no-harmonic-sources',
      sourceId: '',
      sourceTag: 'No harmonic source rows',
      busId: normalizedCase.pccBus,
      pccTag: normalizedCase.pccTag,
      checkType: 'Study Basis',
      basis: 'Source inventory',
      actualValue: null,
      limitValue: null,
      margin: null,
      status: 'missingData',
      iscIlRatio: Number.isFinite(iscIlRatio) ? round(iscIlRatio, 2) : null,
      demandCurrentA: Number.isFinite(demandA) ? demandA : null,
      sourceCurrentA: null,
      missingFields: ['sourceRows'],
      recommendation: 'Add VFD, UPS, rectifier, IBR, arc-furnace, or generic harmonic source rows before issuing IEEE 519 screening results.',
    });
  }
  return rows;
}

function normalizeFrequencyScan(input = {}) {
  const raw = asObject(input);
  return {
    resonances: asArray(raw.resonances),
    warnings: asArray(raw.warnings),
    inputs: raw.inputs || raw,
  };
}

function normalizeCapacitorContext(input = {}) {
  const raw = asObject(input);
  const dutyCase = raw.dutyCase || {};
  const baseResult = raw.baseResult || raw.result || raw;
  return {
    summary: raw.summary || {},
    result: baseResult,
    warnings: [...asArray(raw.warnings), ...asArray(raw.warningRows).map(row => row.message || row)],
    detuning: raw.detuning || raw.detuningRecommendation || raw.result?.detuning || baseResult.detuning || {
      needed: dutyCase.topology && dutyCase.topology !== 'plain',
      detuningPct: dutyCase.reactorPercent || null,
      tunedToOrder: dutyCase.tunedOrder || null,
      rationale: dutyCase.topology ? `Capacitor bank duty package uses ${dutyCase.topology} topology.` : '',
    },
  };
}

function nearInjectedHarmonic(resonance = {}, sourceRows = []) {
  const h = parseNumber(resonance.h ?? resonance.hOrder ?? resonance.order);
  if (!Number.isFinite(h)) return null;
  const injected = new Set(sourceRows.flatMap(source => [
    ...Object.keys(source.spectrum || {}).map(Number),
    ...asArray(source.characteristicOrders),
    ...asArray(source.nonCharacteristicOrders),
  ]).filter(order => Number.isFinite(order)));
  let nearest = null;
  let distance = Infinity;
  injected.forEach(order => {
    const d = Math.abs(order - h);
    if (d < distance) {
      distance = d;
      nearest = order;
    }
  });
  return nearest == null ? null : { nearest, distance: round(distance, 3) };
}

function normalizeFilterAlternative(row = {}, index = 0, context = {}) {
  const raw = asObject(row);
  const filterType = String(raw.filterType || raw.type || 'reviewOnly').trim();
  if (!FILTER_TYPES.has(filterType)) throw new Error(`Unsupported harmonic filter type: ${filterType}`);
  const kvar = parseNumber(raw.kvar);
  const tuningOrder = parseNumber(raw.tuningOrder ?? raw.tuneOrder);
  const reactorPercent = parseNumber(raw.reactorPercent ?? raw.reactorPct);
  const reduction = parseNumber(raw.expectedThdReductionPct ?? raw.expectedTddReductionPct, filterType === 'activeFilter' ? 50 : 30);
  const resonanceRisk = raw.frequencyScanResonanceRisk || context.resonanceRisk || 'review';
  const status = raw.status || (resonanceRisk === 'danger' ? 'review' : 'candidate');
  return {
    id: String(raw.id || `harmonic-filter-${index + 1}`).trim(),
    name: String(raw.name || raw.label || `${filterType} ${index + 1}`).trim(),
    filterType,
    kvar: Number.isFinite(kvar) ? kvar : null,
    tuningOrder: Number.isFinite(tuningOrder) ? tuningOrder : null,
    reactorPercent: Number.isFinite(reactorPercent) ? reactorPercent : null,
    targetHarmonics: normalizeOrderList(raw.targetHarmonics, context.targetHarmonics || []),
    expectedThdReductionPct: Number.isFinite(reduction) ? round(reduction, 2) : null,
    frequencyScanResonanceRisk: resonanceRisk,
    capacitorDutyNotes: String(raw.capacitorDutyNotes || context.capacitorDutyNotes || '').trim(),
    status,
    recommendation: String(raw.recommendation || context.recommendation || 'Review filter candidate against frequency scan, capacitor duty, and manufacturer application limits.').trim(),
  };
}

export function buildHarmonicFilterAlternatives({ studyCase, sourceRows, frequencyScan, capacitorBank, filterAlternatives } = {}) {
  normalizeHarmonicStudyCase(studyCase || {});
  const sources = normalizeHarmonicSourceRows(sourceRows || []);
  const scan = normalizeFrequencyScan(frequencyScan);
  const cap = normalizeCapacitorContext(capacitorBank);
  const provided = asArray(filterAlternatives);
  if (provided.length) return provided.map((row, index) => normalizeFilterAlternative(row, index));
  const targetHarmonics = [...new Set(sources.flatMap(source => [
    ...asArray(source.characteristicOrders),
    ...Object.keys(source.spectrum || {}).map(Number),
  ]).filter(order => Number.isFinite(order) && order > 1))].sort((a, b) => a - b).slice(0, 8);
  const risky = asArray(scan.resonances)
    .map(resonance => ({ resonance, injected: nearInjectedHarmonic(resonance, sources) }))
    .filter(row => row.injected && row.injected.distance <= 0.5);
  const risk = risky.some(row => /danger|high/i.test(row.resonance.risk || '')) ? 'danger' : risky.length ? 'caution' : 'low';
  const capacitorDutyNotes = [
    ...asArray(cap.warnings).map(warning => warning.message || warning),
    cap.detuning?.rationale,
    cap.result?.detuning?.rationale,
  ].filter(Boolean).join(' ');
  const rows = [];
  if (risk !== 'low' || targetHarmonics.includes(5) || capacitorDutyNotes) {
    rows.push(normalizeFilterAlternative({
      filterType: 'passiveDetuned',
      name: 'Detuned passive filter / reactor review',
      reactorPercent: cap.detuning?.detuningPct || cap.result?.detuning?.detuningPct || 5.67,
      tuningOrder: cap.detuning?.tunedToOrder || cap.result?.detuning?.tunedToOrder || 4.3,
      targetHarmonics: targetHarmonics.filter(order => order <= 13),
      expectedThdReductionPct: 35,
      frequencyScanResonanceRisk: risk,
      capacitorDutyNotes,
      status: risk === 'danger' ? 'recommended' : 'review',
      recommendation: risk === 'danger'
        ? 'Prioritize detuned passive filtering or reactor changes before energizing capacitor banks near injected harmonics.'
        : 'Review detuned passive filtering when capacitors and nonlinear loads share the PCC.',
    }, rows.length));
  }
  if (sources.some(source => source.interharmonic || asArray(source.nonCharacteristicOrders).length)) {
    rows.push(normalizeFilterAlternative({
      filterType: 'activeFilter',
      name: 'Active filter for non-characteristic/interharmonic content',
      targetHarmonics,
      expectedThdReductionPct: 50,
      frequencyScanResonanceRisk: risk,
      status: 'review',
      recommendation: 'Review active filtering for non-characteristic, interharmonic, or variable harmonic spectra.',
    }, rows.length));
  }
  return rows;
}

function runSourceDistortion(source = {}, studyCase = {}) {
  const sourceCurrent = sourceCurrentA(source, studyCase);
  const iscA = availableShortCircuitCurrentA(studyCase);
  const ithd = round(spectrumRmsPct(source.spectrum), 3);
  const vthd = Number.isFinite(sourceCurrent) && Number.isFinite(iscA) && iscA > 0
    ? round((sourceCurrent / iscA) * ithd * 100, 3)
    : null;
  return {
    ithd,
    vthd,
    limit: voltageThdLimitPct(studyCase.ieee519VoltageClass),
    warning: Number.isFinite(vthd) ? vthd > voltageThdLimitPct(studyCase.ieee519VoltageClass) : false,
    sourceCurrentA: sourceCurrent,
  };
}

export function runHarmonicStudyCase({ oneLine, studyCase, sourceRows, filterAlternatives, frequencyScan, capacitorBank } = {}) {
  const normalizedCase = normalizeHarmonicStudyCase(studyCase || {});
  const sources = normalizeHarmonicSourceRows(sourceRows, { oneLine });
  const results = {};
  sources.forEach(source => {
    results[source.id] = runSourceDistortion(source, normalizedCase);
  });
  const complianceRows = buildIeee519ComplianceRows({
    studyCase: normalizedCase,
    sourceRows: sources,
    harmonicResults: results,
  });
  const filters = buildHarmonicFilterAlternatives({
    studyCase: normalizedCase,
    sourceRows: sources,
    frequencyScan,
    capacitorBank,
    filterAlternatives,
  });
  return {
    studyCase: normalizedCase,
    sourceRows: sources,
    results,
    complianceRows,
    filterAlternatives: filters,
    warnings: buildWarnings(normalizedCase, sources, complianceRows, filters),
    assumptions: buildAssumptions(normalizedCase),
  };
}

function buildWarnings(studyCase = {}, sourceRows = [], complianceRows = [], filterAlternatives = []) {
  const warnings = [];
  if (!studyCase.pccBus && !studyCase.pccTag) warnings.push({ severity: 'warning', code: 'missingPcc', message: 'PCC bus/tag is not defined.' });
  if (!Number.isFinite(studyCase.maximumDemandCurrentA)) warnings.push({ severity: 'warning', code: 'missingDemandCurrent', message: 'IEEE 519 demand-current basis is missing.' });
  if (!Number.isFinite(studyCase.utilityScMva)) warnings.push({ severity: 'warning', code: 'missingUtilityEnvelope', message: 'Utility short-circuit MVA envelope is missing.' });
  sourceRows.forEach(source => {
    source.warnings.forEach(warning => warnings.push({ ...warning, sourceId: source.id, sourceTag: source.tag }));
  });
  complianceRows
    .filter(row => row.status === 'fail' || row.status === 'missingData')
    .forEach(row => warnings.push({
      severity: row.status === 'fail' ? 'error' : 'warning',
      code: row.status === 'fail' ? 'ieee519ComplianceFailure' : 'ieee519MissingData',
      sourceId: row.sourceId,
      sourceTag: row.sourceTag,
      message: `${row.sourceTag} ${row.checkType} status is ${row.status}.`,
    }));
  filterAlternatives
    .filter(row => row.frequencyScanResonanceRisk === 'danger' || row.status === 'review' || row.status === 'recommended')
    .forEach(row => warnings.push({
      severity: row.frequencyScanResonanceRisk === 'danger' ? 'error' : 'warning',
      code: 'filterReview',
      sourceId: row.id,
      message: `${row.name} requires harmonic filter/resonance review.`,
    }));
  return warnings;
}

function buildAssumptions(studyCase = {}) {
  return [
    'Harmonic study case is deterministic local power-quality screening, not a full multi-bus harmonic load-flow solver.',
    `Compliance basis is ${studyCase.selectedComplianceBasis || studyCase.complianceBasis}; final PCC compliance requires project-specific utility or measured data.`,
    'Frequency-scan and capacitor-duty context are advisory inputs and should be verified against manufacturer filter/capacitor application limits.',
    'Transformer phase-shift, zero-sequence, triplen, interharmonic, and non-characteristic harmonic treatment are screening metadata in v1.',
  ];
}

function summarizePackage(sourceRows = [], complianceRows = [], filterAlternatives = [], warnings = []) {
  const counts = { pass: 0, warn: 0, fail: 0, missingData: 0 };
  complianceRows.forEach(row => {
    if (row.status === 'pass') counts.pass += 1;
    else if (row.status === 'warn') counts.warn += 1;
    else if (row.status === 'fail') counts.fail += 1;
    else if (row.status === 'missingData') counts.missingData += 1;
  });
  const worstVthdPct = Math.max(0, ...complianceRows.filter(row => row.checkType === 'VTHD').map(row => Number(row.actualValue) || 0));
  const worstTddPct = Math.max(0, ...complianceRows.filter(row => row.checkType === 'TDD').map(row => Number(row.actualValue) || 0));
  return {
    sourceCount: sourceRows.length,
    complianceRowCount: complianceRows.length,
    filterAlternativeCount: filterAlternatives.length,
    pass: counts.pass,
    warn: counts.warn,
    fail: counts.fail,
    missingData: counts.missingData,
    worstVthdPct: round(worstVthdPct, 3),
    worstTddPct: round(worstTddPct, 3),
    warningCount: warnings.length,
    status: counts.fail ? 'fail' : counts.warn ? 'warn' : counts.missingData ? 'missingData' : 'pass',
  };
}

export function buildHarmonicStudyPackage(context = {}) {
  const raw = asObject(context);
  const packaged = raw.harmonicStudyCase || raw.harmonics || raw.package || raw;
  if (packaged.version === HARMONIC_STUDY_CASE_VERSION && packaged.studyCase) {
    const studyCase = normalizeHarmonicStudyCase(packaged.studyCase);
    const sourceRows = normalizeHarmonicSourceRows(packaged.sourceRows || []);
    const complianceRows = asArray(packaged.complianceRows).length
      ? asArray(packaged.complianceRows)
      : buildIeee519ComplianceRows({ studyCase, sourceRows, harmonicResults: packaged.results || packaged.harmonicResults });
    const filterAlternatives = buildHarmonicFilterAlternatives({
      studyCase,
      sourceRows,
      frequencyScan: packaged.frequencyScan,
      capacitorBank: packaged.capacitorDutyContext || packaged.capacitorBank,
      filterAlternatives: packaged.filterAlternatives,
    });
    const warnings = asArray(packaged.warnings).length ? asArray(packaged.warnings) : buildWarnings(studyCase, sourceRows, complianceRows, filterAlternatives);
    return {
      ...packaged,
      version: HARMONIC_STUDY_CASE_VERSION,
      studyCase,
      sourceRows,
      complianceRows,
      filterAlternatives,
      warnings,
      assumptions: asArray(packaged.assumptions).length ? packaged.assumptions : buildAssumptions(studyCase),
      summary: summarizePackage(sourceRows, complianceRows, filterAlternatives, warnings),
    };
  }
  const studyCase = normalizeHarmonicStudyCase(raw.studyCase || packaged.studyCase || {});
  const sourceRows = normalizeHarmonicSourceRows(raw.sourceRows || packaged.sourceRows || [], { oneLine: raw.oneLine });
  const harmonicResults = raw.results || raw.harmonicResults || raw.harmonics || packaged.results || packaged;
  const complianceRows = buildIeee519ComplianceRows({ studyCase, sourceRows, harmonicResults });
  const filterAlternatives = buildHarmonicFilterAlternatives({
    studyCase,
    sourceRows,
    frequencyScan: raw.frequencyScan || packaged.frequencyScan,
    capacitorBank: raw.capacitorDutyContext || raw.capacitorBank || packaged.capacitorDutyContext,
    filterAlternatives: raw.filterAlternatives || packaged.filterAlternatives,
  });
  const warnings = buildWarnings(studyCase, sourceRows, complianceRows, filterAlternatives);
  return {
    version: HARMONIC_STUDY_CASE_VERSION,
    generatedAt: raw.generatedAt || new Date().toISOString(),
    projectName: raw.projectName || packaged.projectName || 'Untitled Project',
    studyCase,
    sourceRows,
    results: harmonicResults,
    complianceRows,
    filterAlternatives,
    frequencyScan: raw.frequencyScan || packaged.frequencyScan || null,
    capacitorDutyContext: raw.capacitorDutyContext || raw.capacitorBank || packaged.capacitorDutyContext || null,
    warnings,
    assumptions: buildAssumptions(studyCase),
    summary: summarizePackage(sourceRows, complianceRows, filterAlternatives, warnings),
  };
}

function statusClass(status = '') {
  if (status === 'pass' || status === 'ready' || status === 'candidate') return 'badge-ok';
  if (status === 'fail' || status === 'error') return 'badge-error';
  if (status === 'missingData' || status === 'warn' || status === 'review' || status === 'recommended') return 'badge-warn';
  return 'badge-info';
}

export function renderHarmonicStudyHTML(pkg = {}) {
  const packageData = buildHarmonicStudyPackage(pkg);
  const rows = asArray(packageData.complianceRows);
  const filters = asArray(packageData.filterAlternatives);
  return `<section class="report-section" id="rpt-harmonic-study">
  <h2>Harmonic Study Basis</h2>
  <p class="report-note">Auditable harmonic source, PCC, IEEE 519, frequency-scan, and filter screening package. Final utility/PCC compliance requires project-specific measured or utility-provided data.</p>
  <dl class="report-dl">
    <dt>PCC</dt><dd>${esc(packageData.studyCase.pccTag || packageData.studyCase.pccBus || 'Not defined')}</dd>
    <dt>Voltage</dt><dd>${esc(packageData.studyCase.nominalVoltageKv)} kV</dd>
    <dt>Utility SC</dt><dd>${esc(packageData.studyCase.utilityScMva ?? 'Missing')} MVA</dd>
    <dt>Demand Current</dt><dd>${esc(packageData.studyCase.maximumDemandCurrentA ?? 'Missing')} A</dd>
    <dt>Compliance Basis</dt><dd>${esc(packageData.studyCase.selectedComplianceBasis || packageData.studyCase.complianceBasis)}</dd>
    <dt>Status</dt><dd><span class="badge ${statusClass(packageData.summary.status)}">${esc(packageData.summary.status)}</span></dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Source</th><th>Check</th><th>Actual</th><th>Limit</th><th>Margin</th><th>Status</th><th>Recommendation</th></tr></thead>
      <tbody>${rows.length ? rows.map(row => `<tr>
        <td>${esc(row.sourceTag)}</td>
        <td>${esc(row.checkType)}</td>
        <td>${esc(row.actualValue ?? 'Missing')}</td>
        <td>${esc(row.limitValue ?? 'Missing')}</td>
        <td>${esc(row.margin ?? 'Missing')}</td>
        <td><span class="badge ${statusClass(row.status)}">${esc(row.status)}</span></td>
        <td>${esc(row.recommendation)}</td>
      </tr>`).join('') : '<tr><td colspan="7">No harmonic compliance rows.</td></tr>'}</tbody>
    </table>
  </div>
  <h3>Filter Alternatives</h3>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Name</th><th>Type</th><th>Targets</th><th>Reduction</th><th>Resonance Risk</th><th>Status</th><th>Recommendation</th></tr></thead>
      <tbody>${filters.length ? filters.map(row => `<tr>
        <td>${esc(row.name)}</td>
        <td>${esc(row.filterType)}</td>
        <td>${esc(asArray(row.targetHarmonics).join(', '))}</td>
        <td>${esc(row.expectedThdReductionPct ?? '')}%</td>
        <td>${esc(row.frequencyScanResonanceRisk)}</td>
        <td><span class="badge ${statusClass(row.status)}">${esc(row.status)}</span></td>
        <td>${esc(row.recommendation)}</td>
      </tr>`).join('') : '<tr><td colspan="7">No filter alternatives generated.</td></tr>'}</tbody>
    </table>
  </div>
  ${packageData.warnings.length ? `<p class="report-note">${esc(packageData.warnings.length)} harmonic warning(s): ${esc(packageData.warnings.map(w => w.message || w).slice(0, 4).join(' | '))}</p>` : ''}
</section>`;
}

export const EQUIPMENT_EVALUATION_VERSION = 'equipment-evaluation-v1';

const RATING_FIELDS = [
  'catalogNumber',
  'standard',
  'interruptRatingKa',
  'withstandRatingKa',
  'withstandCycles',
  'sccrKa',
  'busBracingKa',
  'shortTimeRatingKa',
  'enclosure',
  'temperatureRatingC',
  'protectiveDeviceId',
  'oneLineRef',
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function esc(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return null;
}

function key(value = '') {
  return String(value || '').trim().toLowerCase();
}

function equipmentKey(row = {}, index = 0) {
  return String(row.oneLineRef || row.id || row.tag || row.ref || row.label || row.name || `equipment-${index + 1}`);
}

function displayTag(row = {}, index = 0) {
  return String(row.tag || row.id || row.ref || row.label || row.name || `Equipment ${index + 1}`);
}

function flattenOneLine(oneLine = {}) {
  return asArray(oneLine.sheets).flatMap((sheet, sheetIndex) => {
    return asArray(sheet.components).map((component, componentIndex) => ({
      ...component,
      sheetName: sheet.name || `Sheet ${sheetIndex + 1}`,
      _fallbackKey: `sheet-${sheetIndex + 1}-component-${componentIndex + 1}`,
    }));
  });
}

function addMapValue(map, value, row) {
  const normalized = key(value);
  if (normalized && !map.has(normalized)) map.set(normalized, row);
}

function buildComponentMap(components = []) {
  const map = new Map();
  components.forEach(component => {
    addMapValue(map, component.id, component);
    addMapValue(map, component.ref, component);
    addMapValue(map, component.tag, component);
    addMapValue(map, component.label, component);
    addMapValue(map, component.name, component);
  });
  return map;
}

function findComponent(row, componentMap) {
  const candidates = [row.oneLineRef, row.id, row.tag, row.ref, row.label, row.name];
  for (const candidate of candidates) {
    const match = componentMap.get(key(candidate));
    if (match) return match;
  }
  return null;
}

function flattenShortCircuitResults(results = {}) {
  const source = asObject(results.shortCircuit || results.shortCircuitResults || results);
  const rows = [];
  if (Array.isArray(source.dutyRows)) rows.push(...source.dutyRows);
  if (Array.isArray(source.rows)) rows.push(...source.rows);
  if (Array.isArray(source.buses)) rows.push(...source.buses);
  if (Array.isArray(source.results)) rows.push(...source.results);
  if (source.results && typeof source.results === 'object' && !Array.isArray(source.results)) {
    Object.entries(source.results).forEach(([id, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      rows.push({ id, ...value });
    });
  }
  if (Array.isArray(source.caseResults)) {
    source.caseResults.forEach(caseRow => {
      Object.entries(asObject(caseRow.results)).forEach(([id, value]) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return;
        rows.push({ id, voltageCase: caseRow.voltageCase, ...value });
      });
    });
  }
  Object.entries(source).forEach(([id, value]) => {
    if (['studyCase', 'summary', 'caseResults', 'warnings', 'assumptions', 'results', 'dutyRows'].includes(id)) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    rows.push({ id, ...value });
  });
  return rows;
}

function faultCurrentKa(row = {}) {
  return parseNumber(
    row.dutyValueKA
    ?? row.dutyValueKa
    ?? row.threePhaseKA
    ?? row.threePhaseKa
    ?? row.threePhaseFaultKa
    ?? row.availableFaultCurrentKa
    ?? row.availableFaultCurrentKA
    ?? row.faultCurrentKa
    ?? row.faultKA
    ?? row.ikssKa
    ?? row.ikssKA
    ?? row.summary?.availableFaultCurrentKa
    ?? row.summary?.threePhaseKA
  );
}

function buildFaultMap(studyResults = {}) {
  const rows = flattenShortCircuitResults(studyResults.shortCircuit || studyResults.iec60909 || {});
  const map = new Map();
  rows.forEach(row => {
    const value = faultCurrentKa(row);
    if (!Number.isFinite(value)) return;
    [row.id, row.bus, row.busId, row.componentId, row.equipmentTag, row.busTag, row.tag, row.name, row.label].forEach(candidate => {
      const normalized = key(candidate);
      if (normalized && !map.has(normalized)) map.set(normalized, { ...row, availableFaultKa: value });
    });
  });
  return map;
}

function findFault(row, component, faultMap) {
  const candidates = [
    row.oneLineRef,
    row.id,
    row.tag,
    row.ref,
    row.label,
    row.name,
    component?.id,
    component?.ref,
    component?.tag,
    component?.label,
    component?.name,
  ];
  for (const candidate of candidates) {
    const match = faultMap.get(key(candidate));
    if (match) return match;
  }
  return null;
}

function protectiveDeviceMap(protectiveDevices = []) {
  return new Map(asArray(protectiveDevices).map(device => [device.id, device]));
}

function statusForComparison(required, rated, warnMarginPct) {
  if (!Number.isFinite(required)) return 'missingData';
  if (!Number.isFinite(rated)) return 'missingData';
  const margin = rated - required;
  if (margin < 0) return 'fail';
  const marginPct = required > 0 ? (margin / required) * 100 : 100;
  return marginPct < warnMarginPct ? 'warn' : 'pass';
}

function makeEvaluation({
  equipment,
  component,
  ratingType,
  requiredValue,
  ratedValue,
  status,
  source,
  recommendation,
  missingFields = [],
}) {
  const margin = Number.isFinite(requiredValue) && Number.isFinite(ratedValue)
    ? Number((ratedValue - requiredValue).toFixed(3))
    : null;
  return {
    equipmentKey: equipment.key,
    equipmentTag: equipment.tag,
    category: equipment.category,
    oneLineRef: equipment.oneLineRef,
    oneLineComponentId: component?.id || '',
    ratingType,
    requiredValue: Number.isFinite(requiredValue) ? Number(requiredValue.toFixed(3)) : null,
    ratedValue: Number.isFinite(ratedValue) ? Number(ratedValue.toFixed(3)) : null,
    margin,
    status,
    source,
    recommendation,
    missingFields,
  };
}

function evaluateRating(equipment, component, fault, field, ratingType, source, warnMarginPct) {
  const requiredValue = fault?.availableFaultKa ?? null;
  const ratedValue = equipment.ratings[field];
  const missingFields = [];
  if (!Number.isFinite(requiredValue)) missingFields.push('shortCircuit');
  if (!Number.isFinite(ratedValue)) missingFields.push(field);
  const status = statusForComparison(requiredValue, ratedValue, warnMarginPct);
  const recommendation = status === 'pass'
    ? `${ratingType} rating is above the available fault duty.`
    : status === 'warn'
      ? `${ratingType} margin is low; verify equipment duty and selected rating before issue.`
      : status === 'fail'
        ? `${ratingType} rating is below available fault duty; replace equipment or reduce fault duty.`
        : `Add ${field} and saved short-circuit results to complete ${ratingType} evaluation.`;
  return makeEvaluation({
    equipment,
    component,
    ratingType,
    requiredValue,
    ratedValue,
    status,
    source,
    recommendation,
    missingFields,
  });
}

function arcFlashContext(studyResults = {}, equipment, component) {
  const arc = studyResults.arcFlash;
  if (!arc) return null;
  const resultMap = arc.results && typeof arc.results === 'object' && !Array.isArray(arc.results)
    ? arc.results
    : arc;
  const comparisonRows = asArray(arc.scenarioComparison).filter(row => row.scenarioId === 'baseline' || !row.scenarioId);
  const rows = [
    ...asArray(arc.rows),
    ...asArray(arc.results),
    ...comparisonRows,
    ...Object.entries(asObject(resultMap)).filter(([, value]) => value && typeof value === 'object').map(([id, value]) => ({ id, ...value })),
  ];
  const ids = [equipment.oneLineRef, equipment.id, equipment.tag, equipment.ref, component?.id, component?.label].map(key);
  const match = rows.find(row => ids.some(id => id && [row.id, row.bus, row.componentId, row.equipmentId, row.equipmentTag, row.tag, row.label].map(key).includes(id)));
  return match || (arc.summary ? { summary: arc.summary } : null);
}

function tccContext(studyResults = {}, equipment, component) {
  const tcc = studyResults.tcc || studyResults.tccSettings;
  if (!tcc) return null;
  const deviceId = equipment.protectiveDeviceId || component?.tccId;
  return deviceId ? { deviceId, source: 'tcc' } : { source: 'tcc' };
}

function cableDutyContext(studyResults = {}, cables = [], equipment) {
  const cableDuty = studyResults.cableFaultBracing || studyResults.cableShortCircuit || studyResults.iec60287;
  if (!cableDuty) return null;
  const tag = key(equipment.tag);
  const linked = asArray(cables).filter(cable => key(cable.from) === tag || key(cable.to) === tag || key(cable.source) === tag || key(cable.destination) === tag);
  return { source: 'cableDuty', linkedCableCount: linked.length };
}

export function normalizeEquipmentRatingRow(row = {}, index = 0) {
  const normalized = {
    ...row,
    id: String(row.id || '').trim(),
    tag: displayTag(row, index),
    ref: String(row.ref || '').trim(),
    description: String(row.description || '').trim(),
    voltage: String(row.voltage || '').trim(),
    category: String(row.category || '').trim() || 'Equipment',
    subCategory: String(row.subCategory || '').trim(),
    manufacturer: String(row.manufacturer || '').trim(),
    model: String(row.model || '').trim(),
    catalogNumber: String(row.catalogNumber || '').trim(),
    standard: String(row.standard || '').trim(),
    enclosure: String(row.enclosure || '').trim(),
    protectiveDeviceId: String(row.protectiveDeviceId || row.tccId || '').trim(),
    oneLineRef: String(row.oneLineRef || row.ref || row.id || row.tag || '').trim(),
    key: equipmentKey(row, index),
  };
  RATING_FIELDS.forEach(field => {
    if (!(field in normalized)) normalized[field] = '';
  });
  normalized.ratings = {
    interruptRatingKa: parseNumber(row.interruptRatingKa ?? row.interruptRating ?? row.aicKa ?? row.aic),
    withstandRatingKa: parseNumber(row.withstandRatingKa ?? row.withstandKa),
    withstandCycles: parseNumber(row.withstandCycles),
    sccrKa: parseNumber(row.sccrKa ?? row.sccr),
    busBracingKa: parseNumber(row.busBracingKa ?? row.busKa),
    shortTimeRatingKa: parseNumber(row.shortTimeRatingKa ?? row.shortTimeKa),
    temperatureRatingC: parseNumber(row.temperatureRatingC),
  };
  return normalized;
}

export function buildEquipmentEvaluationInventory({
  equipment = [],
  oneLine = {},
  protectiveDevices = [],
  studyResults = {},
  cables = [],
} = {}) {
  const components = flattenOneLine(oneLine);
  const componentMap = buildComponentMap(components);
  const faultMap = buildFaultMap(studyResults);
  const deviceMap = protectiveDeviceMap(protectiveDevices);
  const rows = asArray(equipment).map((row, index) => {
    const normalized = normalizeEquipmentRatingRow(row, index);
    const component = findComponent(normalized, componentMap);
    const fault = findFault(normalized, component, faultMap);
    const protectiveDevice = deviceMap.get(normalized.protectiveDeviceId || component?.tccId || '') || null;
    return {
      equipment: normalized,
      component,
      fault,
      protectiveDevice,
      arcFlash: arcFlashContext(studyResults, normalized, component),
      tcc: tccContext(studyResults, normalized, component),
      cableDuty: cableDutyContext(studyResults, cables, normalized),
    };
  });
  return {
    version: EQUIPMENT_EVALUATION_VERSION,
    rows,
    sourceStatus: {
      shortCircuit: faultMap.size > 0 ? 'available' : 'missing',
      arcFlash: studyResults.arcFlash ? 'available' : 'missing',
      tcc: studyResults.tcc || studyResults.tccSettings ? 'available' : 'missing',
      cableDuty: studyResults.cableFaultBracing || studyResults.cableShortCircuit || studyResults.iec60287 ? 'available' : 'missing',
    },
  };
}

export function evaluateEquipmentDuty(inventory = {}, options = {}) {
  const warnMarginPct = Number.isFinite(options.warnMarginPct) ? options.warnMarginPct : 10;
  return asArray(inventory.rows).flatMap(item => {
    const { equipment, component, fault, protectiveDevice } = item;
    const evaluations = [
      evaluateRating(equipment, component, fault, 'interruptRatingKa', 'Interrupting Rating', 'shortCircuit', warnMarginPct),
      evaluateRating(equipment, component, fault, 'sccrKa', 'SCCR', 'shortCircuit', warnMarginPct),
      evaluateRating(equipment, component, fault, 'busBracingKa', 'Bus Bracing', 'shortCircuit', warnMarginPct),
      evaluateRating(equipment, component, fault, 'withstandRatingKa', 'Withstand Rating', 'shortCircuit', warnMarginPct),
    ];
    const shortTime = evaluateRating(equipment, component, fault, 'shortTimeRatingKa', 'Short-Time Rating', 'shortCircuit', warnMarginPct);
    if (Number.isFinite(equipment.ratings.shortTimeRatingKa) || !Number.isFinite(fault?.availableFaultKa)) evaluations.push(shortTime);

    if (!item.arcFlash) {
      evaluations.push(makeEvaluation({
        equipment,
        component,
        ratingType: 'Arc Flash Context',
        requiredValue: null,
        ratedValue: null,
        status: 'missingData',
        source: 'arcFlash',
        recommendation: 'Run or save arc-flash results to include incident-energy context for this equipment.',
        missingFields: ['arcFlash'],
      }));
    }
    if (!item.tcc && !protectiveDevice) {
      evaluations.push(makeEvaluation({
        equipment,
        component,
        ratingType: 'Protection / TCC Context',
        requiredValue: null,
        ratedValue: null,
        status: 'missingData',
        source: 'tcc',
        recommendation: 'Assign a protective device or save TCC settings to evaluate protection context.',
        missingFields: ['protectiveDeviceId', 'tcc'],
      }));
    }
    if (!item.cableDuty) {
      evaluations.push(makeEvaluation({
        equipment,
        component,
        ratingType: 'Cable Duty Context',
        requiredValue: null,
        ratedValue: null,
        status: 'missingData',
        source: 'cableDuty',
        recommendation: 'Run cable fault bracing, cable short-circuit, or thermal duty studies when cable withstand is required.',
        missingFields: ['cableDuty'],
      }));
    }
    if (protectiveDevice && Number.isFinite(protectiveDevice.interruptRating)) {
      const requiredValue = fault?.availableFaultKa ?? null;
      const ratedValue = protectiveDevice.interruptRating;
      evaluations.push(makeEvaluation({
        equipment,
        component,
        ratingType: 'Selected Protective Device AIC',
        requiredValue,
        ratedValue,
        status: statusForComparison(requiredValue, ratedValue, warnMarginPct),
        source: 'protectiveDevices',
        recommendation: Number.isFinite(requiredValue)
          ? 'Verify selected protective device interrupting rating against available fault current.'
          : 'Save short-circuit results to evaluate selected protective device interrupting rating.',
        missingFields: Number.isFinite(requiredValue) ? [] : ['shortCircuit'],
      }));
    }
    return evaluations;
  });
}

export function summarizeEquipmentEvaluation(evaluations = []) {
  const rows = asArray(evaluations);
  const byStatus = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const equipmentTags = new Set(rows.map(row => row.equipmentTag).filter(Boolean));
  return {
    equipmentCount: equipmentTags.size,
    rowCount: rows.length,
    pass: byStatus.pass || 0,
    warn: byStatus.warn || 0,
    fail: byStatus.fail || 0,
    missingData: byStatus.missingData || 0,
    byStatus,
    ready: (byStatus.fail || 0) === 0 && (byStatus.missingData || 0) === 0,
  };
}

export function buildEquipmentEvaluationPackage(context = {}) {
  const inventory = buildEquipmentEvaluationInventory(context);
  const rows = evaluateEquipmentDuty(inventory, context.options || {});
  return {
    version: EQUIPMENT_EVALUATION_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    summary: summarizeEquipmentEvaluation(rows),
    sourceStatus: inventory.sourceStatus,
    rows,
    warnings: [
      'Equipment evaluation is a deterministic screening deliverable and requires final engineering and manufacturer verification.',
      ...Object.entries(inventory.sourceStatus)
        .filter(([, status]) => status === 'missing')
        .map(([source]) => `${source} results are missing; related equipment evaluation rows are marked missingData.`),
    ],
    assumptions: [
      'Available short-circuit current is compared directly to kA equipment ratings where both are available.',
      'Protective-device and cable-duty context is included only from saved local project data.',
      'Missing ratings are not inferred from manufacturer, model, or catalog text.',
    ],
  };
}

export function renderEquipmentEvaluationHTML(pkg = {}) {
  const rows = asArray(pkg.rows);
  return `<section class="report-section" id="rpt-equipment-evaluation">
  <h2>Equipment Evaluation</h2>
  <p class="report-note">Screening equipment-duty inventory. Final ratings and manufacturer selections require engineering verification.</p>
  <dl class="report-dl">
    <dt>Equipment</dt><dd>${esc(pkg.summary?.equipmentCount || 0)}</dd>
    <dt>Pass</dt><dd>${esc(pkg.summary?.pass || 0)}</dd>
    <dt>Warnings</dt><dd>${esc(pkg.summary?.warn || 0)}</dd>
    <dt>Failures</dt><dd>${esc(pkg.summary?.fail || 0)}</dd>
    <dt>Missing Data</dt><dd>${esc(pkg.summary?.missingData || 0)}</dd>
  </dl>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Equipment</th><th>Category</th><th>Rating</th><th>Required</th><th>Rated</th><th>Margin</th><th>Status</th><th>Source</th><th>Recommendation</th></tr></thead>
    <tbody>${rows.length ? rows.map(row => `<tr>
      <td>${esc(row.equipmentTag)}</td>
      <td>${esc(row.category)}</td>
      <td>${esc(row.ratingType)}</td>
      <td>${esc(row.requiredValue ?? '')}</td>
      <td>${esc(row.ratedValue ?? '')}</td>
      <td>${esc(row.margin ?? '')}</td>
      <td>${esc(row.status)}</td>
      <td>${esc(row.source)}</td>
      <td>${esc(row.recommendation)}</td>
    </tr>`).join('') : '<tr><td colspan="9">No equipment evaluation rows.</td></tr>'}</tbody>
  </table>
  </div>
</section>`;
}

import { runArcFlash } from './arcFlash.mjs';

export const ARC_FLASH_STUDY_CASE_VERSION = 'arc-flash-study-case-v1';

const ELECTRODE_CONFIGS = new Set(['VCB', 'VCBB', 'HCB', 'VOA', 'HOA']);
const ENCLOSURE_TYPES = new Set(['box', 'open']);
const REPORT_PRESETS = new Set(['summary', 'labels', 'mitigation', 'fullStudy']);

const DEFAULT_STUDY_CASE = {
  standard: 'IEEE 1584-2018',
  reportPreset: 'summary',
  includeDcArcFlashNote: false,
  includeHighVoltageNote: false,
  labelTemplate: 'nfpa70e',
  notes: '',
};

const DEFAULT_MITIGATION_SCENARIOS = [
  {
    id: 'baseline',
    name: 'Baseline',
    enabled: true,
    type: 'baseline',
    clearingTimeMultiplier: 1,
    faultCurrentMultiplier: 1,
    notes: 'Existing device settings and equipment data.',
  },
  {
    id: 'maintenance-mode',
    name: 'Maintenance Mode',
    enabled: false,
    type: 'maintenanceMode',
    clearingTimeMultiplier: 0.5,
    faultCurrentMultiplier: 1,
    notes: 'Planning scenario using explicit clearing-time reduction.',
  },
  {
    id: 'zsi',
    name: 'Zone Selective Interlocking',
    enabled: false,
    type: 'zsi',
    clearingTimeMultiplier: 0.7,
    faultCurrentMultiplier: 1,
    notes: 'Planning scenario using explicit clearing-time reduction.',
  },
  {
    id: 'current-limiting',
    name: 'Current-Limiting Device',
    enabled: false,
    type: 'currentLimiting',
    clearingTimeMultiplier: 1,
    faultCurrentMultiplier: 0.7,
    notes: 'Planning scenario using explicit arcing-current reduction.',
  },
  {
    id: 'arc-flash-sensing',
    name: 'Arc-Flash Sensing',
    enabled: false,
    type: 'arcFlashSensing',
    clearingTimeMultiplier: 0.25,
    faultCurrentMultiplier: 1,
    notes: 'Planning scenario using explicit clearing-time reduction.',
  },
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return null;
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

function toVolts(value) {
  const num = parseNumber(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 1) return num * 1000;
  if (num > 1000) return num;
  if (num > 10) return num;
  return num * 1000;
}

function readComponentValue(component = {}, key) {
  if (Object.prototype.hasOwnProperty.call(component, key)) return component[key];
  if (component.props && Object.prototype.hasOwnProperty.call(component.props, key)) return component.props[key];
  if (component.parameters && Object.prototype.hasOwnProperty.call(component.parameters, key)) return component.parameters[key];
  return undefined;
}

function flattenOneLine(oneLine = {}) {
  const sheets = asArray(oneLine.sheets);
  if (sheets.length) {
    return sheets.flatMap((sheet, sheetIndex) => asArray(sheet.components).map(component => ({
      ...component,
      sheetName: sheet.name || `Sheet ${sheetIndex + 1}`,
    })));
  }
  return asArray(oneLine.components);
}

function normalizeElectrode(value) {
  const raw = String(value || 'VCB').trim().toUpperCase();
  return ELECTRODE_CONFIGS.has(raw) ? raw : 'VCB';
}

function normalizeEnclosure(value) {
  const raw = String(value || 'box').trim().toLowerCase();
  return ENCLOSURE_TYPES.has(raw) ? raw : 'box';
}

function finiteOrDefault(value, fallback) {
  const num = parseNumber(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function sourceFor(component = {}, field, keys = []) {
  return keys.some(key => readComponentValue(component, key) !== undefined) ? 'oneLine' : 'default';
}

function componentTag(component = {}) {
  return component.tag || component.ref || component.label || component.name || component.id || '';
}

export function normalizeArcFlashEquipmentRow(row = {}) {
  const input = asObject(row);
  const component = asObject(input.component);
  const equipmentId = String(input.equipmentId || input.id || component.id || '').trim();
  const tag = String(input.equipmentTag || input.tag || componentTag(component) || equipmentId || 'Equipment').trim();
  const nominalVoltageSource = input.nominalVoltageV ?? input.nominalVoltage ?? readComponentValue(component, 'voltage') ?? readComponentValue(component, 'volts') ?? readComponentValue(component, 'kV') ?? readComponentValue(component, 'baseKV');
  const convertedVoltage = toVolts(nominalVoltageSource);
  const nominalVoltage = Number.isFinite(convertedVoltage) && convertedVoltage > 0 ? convertedVoltage : 480;
  const gap = finiteOrDefault(input.gapMM ?? input.gap ?? readComponentValue(component, 'gap'), 25);
  const workingDistance = finiteOrDefault(input.workingDistanceMM ?? input.working_distance ?? readComponentValue(component, 'working_distance'), 455);
  const height = finiteOrDefault(input.enclosureHeightMM ?? readComponentValue(component, 'enclosure_height') ?? readComponentValue(component, 'box_height'), 508);
  const width = finiteOrDefault(input.enclosureWidthMM ?? readComponentValue(component, 'enclosure_width') ?? readComponentValue(component, 'box_width'), 508);
  const depth = finiteOrDefault(input.enclosureDepthMM ?? readComponentValue(component, 'enclosure_depth') ?? readComponentValue(component, 'box_depth'), 508);
  const clearing = parseNumber(input.clearingTimeOverrideS ?? input.clearing_time);
  const defaultedFields = [];
  const missingFields = [];
  const addDefaulted = (field, explicit) => {
    if (!explicit && !defaultedFields.includes(field)) defaultedFields.push(field);
  };
  const voltageExplicit = input.nominalVoltageV !== undefined || input.nominalVoltage !== undefined || ['voltage', 'volts', 'kV', 'baseKV'].some(key => readComponentValue(component, key) !== undefined);
  addDefaulted('nominalVoltageV', voltageExplicit);
  addDefaulted('gapMM', input.gapMM !== undefined || input.gap !== undefined || readComponentValue(component, 'gap') !== undefined);
  addDefaulted('workingDistanceMM', input.workingDistanceMM !== undefined || input.working_distance !== undefined || readComponentValue(component, 'working_distance') !== undefined);
  addDefaulted('enclosureDimensionsMM', input.enclosureHeightMM !== undefined || readComponentValue(component, 'enclosure_height') !== undefined);
  if (!equipmentId) missingFields.push('equipmentId');
  return {
    id: equipmentId || slug(tag),
    equipmentId: equipmentId || slug(tag),
    equipmentTag: tag,
    include: input.include !== false && input.included !== false,
    equipmentType: String(input.equipmentType || readComponentValue(component, 'equipment_type') || component.subtype || component.type || 'equipment'),
    electrodeConfiguration: normalizeElectrode(input.electrodeConfiguration || input.electrode_config || readComponentValue(component, 'electrode_config')),
    enclosureType: normalizeEnclosure(input.enclosureType || input.enclosure || readComponentValue(component, 'enclosure')),
    enclosureHeightMM: height,
    enclosureWidthMM: width,
    enclosureDepthMM: depth,
    gapMM: gap,
    workingDistanceMM: workingDistance,
    upstreamDeviceBasis: String(input.upstreamDeviceBasis || input.upstreamDevice || readComponentValue(component, 'tccId') || ''),
    clearingTimeOverrideS: Number.isFinite(clearing) && clearing > 0 ? clearing : '',
    nominalVoltageV: nominalVoltage,
    notes: String(input.notes || '').trim(),
    defaultedFields,
    missingFields,
    source: input.source || sourceFor(component, 'equipment', ['gap', 'working_distance', 'enclosure_height', 'electrode_config']),
  };
}

export function normalizeArcFlashStudyCase(input = {}) {
  const raw = asObject(input);
  const preset = String(raw.reportPreset || DEFAULT_STUDY_CASE.reportPreset).trim();
  return {
    standard: raw.standard || DEFAULT_STUDY_CASE.standard,
    reportPreset: REPORT_PRESETS.has(preset) ? preset : DEFAULT_STUDY_CASE.reportPreset,
    includeDcArcFlashNote: Boolean(raw.includeDcArcFlashNote),
    includeHighVoltageNote: Boolean(raw.includeHighVoltageNote),
    labelTemplate: raw.labelTemplate || DEFAULT_STUDY_CASE.labelTemplate,
    notes: String(raw.notes || '').trim(),
  };
}

export function buildArcFlashEquipmentRows({ oneLine = {}, existingRows = [] } = {}) {
  const components = flattenOneLine(oneLine).filter(component => component && component.type !== 'annotation' && component.type !== 'dimension');
  const existing = new Map(asArray(existingRows).map(row => [String(row.equipmentId || row.id || '').toLowerCase(), row]));
  return components.map(component => normalizeArcFlashEquipmentRow({
    ...asObject(existing.get(String(component.id || '').toLowerCase())),
    component,
    equipmentId: component.id,
    equipmentTag: componentTag(component),
  }));
}

function normalizeMitigationScenario(row = {}, index = 0) {
  const input = asObject(row);
  const base = DEFAULT_MITIGATION_SCENARIOS.find(item => item.id === input.id) || {};
  const clearingTime = parseNumber(input.clearingTimeSeconds);
  const clearingMultiplier = parseNumber(input.clearingTimeMultiplier ?? base.clearingTimeMultiplier);
  const currentMultiplier = parseNumber(input.faultCurrentMultiplier ?? base.faultCurrentMultiplier);
  return {
    id: slug(input.id || base.id || `scenario-${index + 1}`),
    name: String(input.name || base.name || `Scenario ${index + 1}`),
    enabled: input.enabled !== false,
    type: input.type || base.type || 'custom',
    clearingTimeSeconds: Number.isFinite(clearingTime) && clearingTime > 0 ? clearingTime : '',
    clearingTimeMultiplier: Number.isFinite(clearingMultiplier) && clearingMultiplier > 0 ? clearingMultiplier : 1,
    faultCurrentMultiplier: Number.isFinite(currentMultiplier) && currentMultiplier > 0 ? currentMultiplier : 1,
    notes: String(input.notes || base.notes || '').trim(),
  };
}

function normalizeMitigationScenarios(rows = []) {
  const source = asArray(rows).length ? rows : DEFAULT_MITIGATION_SCENARIOS;
  const normalized = source.map(normalizeMitigationScenario);
  return normalized.some(row => row.id === 'baseline')
    ? normalized
    : [normalizeMitigationScenario(DEFAULT_MITIGATION_SCENARIOS[0]), ...normalized];
}

function buildPatchedOneLine(oneLine = {}, equipmentRows = []) {
  const rowMap = new Map(asArray(equipmentRows).map(row => [String(row.equipmentId || row.id || '').toLowerCase(), row]));
  const cloned = deepClone(oneLine || { activeSheet: 0, sheets: [] });
  const sheets = asArray(cloned.sheets);
  sheets.forEach(sheet => {
    sheet.components = asArray(sheet.components)
      .filter(component => {
        const row = rowMap.get(String(component.id || '').toLowerCase());
        return !row || row.include !== false;
      })
      .map(component => {
        const row = rowMap.get(String(component.id || '').toLowerCase());
        if (!row) return component;
        return {
          ...component,
          tag: row.equipmentTag || component.tag,
          equipment_type: row.equipmentType,
          electrode_config: row.electrodeConfiguration,
          enclosure: row.enclosureType,
          enclosure_height: row.enclosureHeightMM,
          enclosure_width: row.enclosureWidthMM,
          enclosure_depth: row.enclosureDepthMM,
          gap: row.gapMM,
          working_distance: row.workingDistanceMM,
          clearing_time: row.clearingTimeOverrideS || component.clearing_time,
          voltage: row.nominalVoltageV,
          volts: row.nominalVoltageV,
          kV: Number(row.nominalVoltageV) / 1000,
          tccId: row.upstreamDeviceBasis || component.tccId,
        };
      });
  });
  return cloned;
}

function ppeCategory(energy) {
  if (!Number.isFinite(energy)) return 0;
  if (energy > 40) return 5;
  if (energy > 25) return 4;
  if (energy > 8) return 3;
  if (energy > 4) return 2;
  if (energy > 1.2) return 1;
  return 0;
}

function applyScenarioResult(base = {}, scenario = {}) {
  const baseClearing = Number(base.clearingTime);
  const explicitClearing = parseNumber(scenario.clearingTimeSeconds);
  const clearingRatio = Number.isFinite(explicitClearing) && explicitClearing > 0 && Number.isFinite(baseClearing) && baseClearing > 0
    ? explicitClearing / baseClearing
    : scenario.clearingTimeMultiplier;
  const currentRatio = scenario.faultCurrentMultiplier || 1;
  const energyRatio = Math.max(0, clearingRatio) * Math.pow(Math.max(0, currentRatio), 1.2);
  const incidentEnergy = Number(((base.incidentEnergy || 0) * energyRatio).toFixed(2));
  const boundary = Number(((base.boundary || 0) * Math.sqrt(energyRatio || 0)).toFixed(1));
  const arcing = Number(((base.calculationInputs?.arcingCurrentKA || 0) * currentRatio).toFixed(2));
  const bolted = Number(((base.calculationInputs?.boltedFaultCurrentKA || 0) * currentRatio).toFixed(2));
  const clearingTime = Number((Number.isFinite(explicitClearing) && explicitClearing > 0 ? explicitClearing : (baseClearing || 0) * clearingRatio).toFixed(3));
  return {
    ...base,
    incidentEnergy,
    boundary,
    ppeCategory: ppeCategory(incidentEnergy),
    clearingTime,
    calculationInputs: {
      ...base.calculationInputs,
      boltedFaultCurrentKA: bolted,
      arcingCurrentKA: arcing,
      clearingTimeSeconds: clearingTime,
      mitigationScenario: scenario.name,
    },
  };
}

function buildScenarioComparison(results = {}, scenarios = []) {
  const baseline = results.baseline || {};
  return asArray(scenarios).flatMap(scenario => {
    const scenarioResults = results[scenario.id] || {};
    return Object.entries(scenarioResults).map(([equipmentId, result]) => {
      const base = baseline[equipmentId] || {};
      const deltaEnergy = Number(((result.incidentEnergy || 0) - (base.incidentEnergy || 0)).toFixed(2));
      const deltaBoundary = Number(((result.boundary || 0) - (base.boundary || 0)).toFixed(1));
      const labelReady = result.incidentEnergy > 0 && result.workingDistance > 0 && result.upstreamDevice && !(result.requiredInputs || []).length;
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        equipmentId,
        equipmentTag: result.equipmentTag || equipmentId,
        incidentEnergy: result.incidentEnergy,
        baselineIncidentEnergy: base.incidentEnergy ?? null,
        deltaIncidentEnergy: deltaEnergy,
        ppeCategory: result.ppeCategory,
        baselinePpeCategory: base.ppeCategory ?? null,
        boundary: result.boundary,
        deltaBoundary,
        clearingTime: result.clearingTime,
        labelReady,
        status: result.incidentEnergy > 40 ? 'danger' : result.incidentEnergy > 8 ? 'review' : labelReady ? 'ready' : 'missingData',
        recommendation: result.incidentEnergy > 40
          ? 'Incident energy exceeds 40 cal/cm2; verify inputs and evaluate mitigation.'
          : labelReady
            ? 'Ready for label/package review.'
            : 'Complete missing/defaulted arc-flash equipment data before issuing labels.',
      };
    });
  });
}

export async function runArcFlashStudyCase({ oneLine = {}, studyCase = {}, equipmentRows = [], mitigationScenarios = [] } = {}) {
  const normalizedStudyCase = normalizeArcFlashStudyCase(studyCase);
  const rows = asArray(equipmentRows).length
    ? equipmentRows.map(normalizeArcFlashEquipmentRow)
    : buildArcFlashEquipmentRows({ oneLine });
  const scenarios = normalizeMitigationScenarios(mitigationScenarios).filter(row => row.enabled);
  const patchedOneLine = buildPatchedOneLine(oneLine, rows);
  const baseline = await runArcFlash({ oneLine: patchedOneLine });
  const results = { baseline };
  scenarios.forEach(scenario => {
    if (scenario.id === 'baseline') {
      results.baseline = baseline;
      return;
    }
    results[scenario.id] = Object.fromEntries(Object.entries(baseline).map(([id, result]) => [id, applyScenarioResult(result, scenario)]));
  });
  return {
    studyCase: normalizedStudyCase,
    equipmentRows: rows,
    mitigationScenarios: scenarios,
    results: baseline,
    scenarioResults: results,
    scenarioComparison: buildScenarioComparison(results, scenarios),
  };
}

function summarizePackage(equipmentRows = [], comparison = []) {
  const baselineRows = comparison.filter(row => row.scenarioId === 'baseline');
  return {
    equipmentCount: equipmentRows.length,
    includedEquipmentCount: equipmentRows.filter(row => row.include !== false).length,
    defaultedInputCount: equipmentRows.reduce((sum, row) => sum + asArray(row.defaultedFields).length, 0),
    missingInputCount: equipmentRows.reduce((sum, row) => sum + asArray(row.missingFields).length, 0),
    highEnergyCount: baselineRows.filter(row => row.incidentEnergy > 8).length,
    dangerCount: baselineRows.filter(row => row.incidentEnergy > 40).length,
    labelReadyCount: baselineRows.filter(row => row.labelReady).length,
    scenarioCount: new Set(comparison.map(row => row.scenarioId)).size,
  };
}

export function buildArcFlashStudyPackage({
  projectName = '',
  studyCase = {},
  equipmentRows = [],
  mitigationScenarios = [],
  results = {},
  scenarioResults = null,
  scenarioComparison = [],
  generatedAt = '',
} = {}) {
  const normalizedStudyCase = normalizeArcFlashStudyCase(studyCase);
  const rows = asArray(equipmentRows).map(normalizeArcFlashEquipmentRow);
  const scenarios = normalizeMitigationScenarios(mitigationScenarios);
  const comparison = asArray(scenarioComparison).length
    ? scenarioComparison
    : buildScenarioComparison(scenarioResults || { baseline: results }, scenarios.filter(row => row.enabled));
  const warnings = [];
  if (rows.some(row => asArray(row.defaultedFields).length)) warnings.push({ severity: 'warning', message: 'One or more arc-flash equipment rows use defaulted equipment data.' });
  if (comparison.some(row => row.incidentEnergy > 40)) warnings.push({ severity: 'warning', message: 'One or more baseline arc-flash rows exceed 40 cal/cm2.' });
  if (normalizedStudyCase.includeDcArcFlashNote) warnings.push({ severity: 'info', message: 'DC arc flash remains outside this AC IEEE 1584 workflow; run a DC arc-flash study separately.' });
  if (normalizedStudyCase.includeHighVoltageNote) warnings.push({ severity: 'info', message: 'High-voltage arc-flash methods are flagged for review and not newly modeled in v1.' });
  return {
    version: ARC_FLASH_STUDY_CASE_VERSION,
    generatedAt: generatedAt || new Date().toISOString(),
    projectName: projectName || 'Untitled Project',
    studyCase: normalizedStudyCase,
    equipmentRows: rows,
    mitigationScenarios: scenarios,
    results,
    scenarioResults: scenarioResults || { baseline: results },
    scenarioComparison: comparison,
    summary: summarizePackage(rows, comparison),
    warnings,
    assumptions: [
      'Arc-flash results use the existing CableTrayRoute IEEE 1584-style AC calculation engine.',
      'Mitigation scenarios apply explicit clearing-time and current multipliers for planning comparison only.',
      'Final labels, PPE decisions, and protection changes require engineering review and field verification.',
    ],
  };
}

export function renderArcFlashStudyHTML(pkg = {}) {
  const rows = asArray(pkg.scenarioComparison);
  return `<section class="report-section" id="rpt-arc-flash-study">
  <h2>Arc Flash Study Basis</h2>
  <p class="report-note">Equipment data, defaulted inputs, label readiness, and deterministic mitigation comparisons for AC IEEE 1584 screening.</p>
  <dl class="report-dl">
    <dt>Equipment Rows</dt><dd>${esc(pkg.summary?.equipmentCount || 0)}</dd>
    <dt>Defaulted Inputs</dt><dd>${esc(pkg.summary?.defaultedInputCount || 0)}</dd>
    <dt>High Energy Rows</dt><dd>${esc(pkg.summary?.highEnergyCount || 0)}</dd>
    <dt>Danger Rows</dt><dd>${esc(pkg.summary?.dangerCount || 0)}</dd>
    <dt>Scenarios</dt><dd>${esc(pkg.summary?.scenarioCount || 0)}</dd>
  </dl>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Scenario</th><th>Equipment</th><th>Incident Energy</th><th>Delta</th><th>PPE</th><th>Boundary</th><th>Clearing Time</th><th>Label Ready</th><th>Status</th><th>Recommendation</th></tr></thead>
    <tbody>${rows.length ? rows.map(row => `<tr>
      <td>${esc(row.scenarioName)}</td>
      <td>${esc(row.equipmentTag)}</td>
      <td>${esc(row.incidentEnergy)}</td>
      <td>${esc(row.deltaIncidentEnergy)}</td>
      <td>${esc(row.ppeCategory)}</td>
      <td>${esc(row.boundary)}</td>
      <td>${esc(row.clearingTime)}</td>
      <td>${esc(row.labelReady ? 'yes' : 'no')}</td>
      <td>${esc(row.status)}</td>
      <td>${esc(row.recommendation)}</td>
    </tr>`).join('') : '<tr><td colspan="10">No arc-flash scenario rows.</td></tr>'}</tbody>
  </table>
  </div>
</section>`;
}

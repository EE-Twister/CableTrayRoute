import { runShortCircuit } from './shortCircuit.mjs';

export const SHORT_CIRCUIT_STUDY_CASE_VERSION = 'short-circuit-study-case-v1';

const METHOD_VALUES = new Set(['ANSI', 'IEC', 'Auto']);
const FAULT_TYPES = new Set(['threePhase', 'lineToGround', 'lineToLine', 'doubleLineGround']);
const DUTY_BASIS_VALUES = new Set(['momentary', 'interrupting', 'thirtyCycle', 'relay', 'equipmentEvaluation']);
const VOLTAGE_CASE_VALUES = new Set(['nominal', 'minimum', 'maximum', 'sensitivity']);
const DUTY_SIDE_VALUES = new Set(['loadSide', 'lineSide']);
const REPORT_PRESETS = new Set(['summary', 'equipmentDuty', 'fullStudy']);

const DEFAULT_STUDY_CASE = {
  method: 'Auto',
  faultTypes: ['threePhase', 'lineToGround', 'lineToLine', 'doubleLineGround'],
  dutyBasis: 'equipmentEvaluation',
  voltageCase: 'nominal',
  voltageSensitivityPct: 5,
  scope: {
    area: '',
    zone: '',
    minKv: '',
    maxKv: '',
    includeText: '',
    excludeText: '',
  },
  equipmentDutySide: 'loadSide',
  includeDcShortCircuit: false,
  reportPreset: 'summary',
};

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

function normalizeToken(value = '') {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeMethod(value) {
  const raw = String(value || DEFAULT_STUDY_CASE.method).trim();
  const canonical = raw.toLowerCase() === 'auto'
    ? 'Auto'
    : raw.toUpperCase();
  if (!METHOD_VALUES.has(canonical)) throw new Error(`Unsupported short-circuit method: ${raw}`);
  return canonical;
}

function normalizeChoice(value, allowed, fallback, label) {
  const raw = String(value || fallback).trim();
  if (!allowed.has(raw)) throw new Error(`Unsupported short-circuit ${label}: ${raw}`);
  return raw;
}

function normalizeFaultTypes(value) {
  const rows = asArray(value).length ? asArray(value) : DEFAULT_STUDY_CASE.faultTypes;
  const result = [...new Set(rows.map(row => String(row || '').trim()).filter(Boolean))];
  if (!result.length) throw new Error('At least one short-circuit fault type is required.');
  result.forEach(row => {
    if (!FAULT_TYPES.has(row)) throw new Error(`Unsupported short-circuit fault type: ${row}`);
  });
  return result;
}

function normalizeScope(scope = {}) {
  const raw = asObject(scope);
  const minKv = parseNumber(raw.minKv);
  const maxKv = parseNumber(raw.maxKv);
  return {
    area: String(raw.area || '').trim(),
    zone: String(raw.zone || '').trim(),
    minKv: Number.isFinite(minKv) ? minKv : '',
    maxKv: Number.isFinite(maxKv) ? maxKv : '',
    includeText: String(raw.includeText || '').trim(),
    excludeText: String(raw.excludeText || '').trim(),
  };
}

export function normalizeShortCircuitStudyCase(caseInput = {}) {
  const input = asObject(caseInput);
  const voltageSensitivityPct = parseNumber(input.voltageSensitivityPct);
  return {
    method: normalizeMethod(input.method),
    faultTypes: normalizeFaultTypes(input.faultTypes),
    dutyBasis: normalizeChoice(input.dutyBasis, DUTY_BASIS_VALUES, DEFAULT_STUDY_CASE.dutyBasis, 'duty basis'),
    voltageCase: normalizeChoice(input.voltageCase, VOLTAGE_CASE_VALUES, DEFAULT_STUDY_CASE.voltageCase, 'voltage case'),
    voltageSensitivityPct: Number.isFinite(voltageSensitivityPct) && voltageSensitivityPct >= 0
      ? voltageSensitivityPct
      : DEFAULT_STUDY_CASE.voltageSensitivityPct,
    scope: normalizeScope(input.scope),
    equipmentDutySide: normalizeChoice(input.equipmentDutySide, DUTY_SIDE_VALUES, DEFAULT_STUDY_CASE.equipmentDutySide, 'equipment duty side'),
    includeDcShortCircuit: Boolean(input.includeDcShortCircuit),
    reportPreset: normalizeChoice(input.reportPreset, REPORT_PRESETS, DEFAULT_STUDY_CASE.reportPreset, 'report preset'),
    notes: String(input.notes || '').trim(),
  };
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

function componentValue(component = {}, key) {
  if (component && Object.prototype.hasOwnProperty.call(component, key)) return component[key];
  if (component.props && typeof component.props === 'object' && Object.prototype.hasOwnProperty.call(component.props, key)) return component.props[key];
  if (component.parameters && typeof component.parameters === 'object' && Object.prototype.hasOwnProperty.call(component.parameters, key)) return component.parameters[key];
  return undefined;
}

function componentSearchText(component = {}) {
  return [
    component.id,
    component.tag,
    component.name,
    component.label,
    component.ref,
    component.type,
    component.subtype,
    component.sheetName,
    componentValue(component, 'area'),
    componentValue(component, 'zone'),
  ].map(value => String(value || '')).join(' ').toLowerCase();
}

function resultVoltageKv(row = {}, component = {}) {
  const resultKv = parseNumber(row.prefaultKV);
  if (Number.isFinite(resultKv)) return resultKv;
  const direct = parseNumber(component.kV ?? component.baseKV ?? component.rated_kv ?? component.voltage ?? component.volts);
  if (!Number.isFinite(direct)) return null;
  return direct > 100 ? direct / 1000 : direct;
}

function matchesScope(id, row = {}, component = {}, studyCase = DEFAULT_STUDY_CASE) {
  const scope = studyCase.scope || {};
  const area = normalizeToken(componentValue(component, 'area'));
  const zone = normalizeToken(componentValue(component, 'zone'));
  if (scope.area && area !== normalizeToken(scope.area)) return false;
  if (scope.zone && zone !== normalizeToken(scope.zone)) return false;
  const kv = resultVoltageKv(row, component);
  if (Number.isFinite(scope.minKv) && Number.isFinite(kv) && kv < scope.minKv) return false;
  if (Number.isFinite(scope.maxKv) && Number.isFinite(kv) && kv > scope.maxKv) return false;
  const text = `${id || ''} ${componentSearchText(component)}`;
  if (scope.includeText && !text.includes(normalizeToken(scope.includeText))) return false;
  if (scope.excludeText && text.includes(normalizeToken(scope.excludeText))) return false;
  return true;
}

function voltageCaseFactors(studyCase) {
  const pct = Math.max(0, Number(studyCase.voltageSensitivityPct) || 0) / 100;
  if (studyCase.voltageCase === 'minimum') return [{ voltageCase: 'minimum', factor: 1 - pct }];
  if (studyCase.voltageCase === 'maximum') return [{ voltageCase: 'maximum', factor: 1 + pct }];
  if (studyCase.voltageCase === 'sensitivity') {
    return [
      { voltageCase: 'minimum', factor: 1 - pct },
      { voltageCase: 'nominal', factor: 1 },
      { voltageCase: 'maximum', factor: 1 + pct },
    ];
  }
  return [{ voltageCase: 'nominal', factor: 1 }];
}

function scaleNumericFaultFields(row = {}, factor = 1) {
  const result = { ...row };
  [
    'threePhaseKA',
    'lineToGroundKA',
    'lineToLineKA',
    'doubleLineGroundKA',
    'asymKA',
    'ip',
    'Ib',
    'Ith',
  ].forEach(key => {
    const value = parseNumber(result[key]);
    if (Number.isFinite(value)) result[key] = Number((value * factor).toFixed(3));
  });
  const prefault = parseNumber(result.prefaultKV);
  if (Number.isFinite(prefault)) result.prefaultKV = Number((prefault * factor).toFixed(3));
  return result;
}

function filterResults(results = {}, components = [], studyCase = DEFAULT_STUDY_CASE) {
  const componentMap = new Map(components.map(component => [String(component.id || ''), component]));
  const filtered = {};
  Object.entries(asObject(results)).forEach(([id, row]) => {
    const component = componentMap.get(id) || {};
    if (matchesScope(id, row, component, studyCase)) filtered[id] = row;
  });
  return filtered;
}

function runEngine(components, studyCase) {
  const method = studyCase.method === 'Auto' ? undefined : studyCase.method;
  return runShortCircuit(components, method ? { method } : {});
}

export function runShortCircuitStudyCase({ oneLine = {}, studyCase = {} } = {}) {
  const normalized = normalizeShortCircuitStudyCase(studyCase);
  const components = flattenOneLine(oneLine).filter(component => component && component.type !== 'annotation' && component.type !== 'dimension');
  const nominalResults = runEngine(deepClone(components), normalized);
  const scopedNominal = filterResults(nominalResults, components, normalized);
  const caseResults = voltageCaseFactors(normalized).map(({ voltageCase, factor }) => ({
    voltageCase,
    factor,
    results: Object.fromEntries(Object.entries(scopedNominal).map(([id, row]) => [id, scaleNumericFaultFields(row, factor)])),
  }));
  return {
    studyCase: normalized,
    results: caseResults.find(row => row.voltageCase === 'nominal')?.results || caseResults[0]?.results || {},
    caseResults,
  };
}

function selectedFaultValue(row = {}, faultType) {
  if (faultType === 'threePhase') return parseNumber(row.threePhaseKA);
  if (faultType === 'lineToGround') return parseNumber(row.lineToGroundKA);
  if (faultType === 'lineToLine') return parseNumber(row.lineToLineKA);
  if (faultType === 'doubleLineGround') return parseNumber(row.doubleLineGroundKA);
  return null;
}

function maxSelectedFault(row = {}, studyCase = DEFAULT_STUDY_CASE) {
  const values = asArray(studyCase.faultTypes)
    .map(type => selectedFaultValue(row, type))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function dutyValue(row = {}, studyCase = DEFAULT_STUDY_CASE) {
  if (studyCase.dutyBasis === 'momentary') return parseNumber(row.asymKA ?? row.ip ?? row.threePhaseKA);
  if (studyCase.dutyBasis === 'interrupting') return parseNumber(row.Ib ?? row.threePhaseKA);
  if (studyCase.dutyBasis === 'thirtyCycle') return parseNumber(row.Ith ?? row.threePhaseKA);
  if (studyCase.dutyBasis === 'relay') return parseNumber(row.lineToGroundKA ?? row.threePhaseKA);
  return parseNumber(row.threePhaseKA ?? maxSelectedFault(row, studyCase));
}

export function buildShortCircuitDutyRows(results = {}, studyCaseInput = {}) {
  const studyCase = normalizeShortCircuitStudyCase(studyCaseInput);
  const caseResults = Array.isArray(results.caseResults)
    ? results.caseResults
    : [{ voltageCase: 'nominal', factor: 1, results: results.results || results }];
  return caseResults.flatMap(caseRow => Object.entries(asObject(caseRow.results)).map(([id, row]) => {
    const duty = dutyValue(row, studyCase);
    const warnings = [
      ...asArray(row.warnings),
      ...(studyCase.equipmentDutySide === 'lineSide' ? ['Line-side equipment duty is recorded as a planning flag only in v1.'] : []),
    ];
    return {
      busId: id,
      busTag: row.tag || row.label || id,
      method: row.method || studyCase.method,
      voltageCase: caseRow.voltageCase || 'nominal',
      prefaultKV: parseNumber(row.prefaultKV),
      threePhaseKA: parseNumber(row.threePhaseKA),
      lineToGroundKA: parseNumber(row.lineToGroundKA),
      lineToLineKA: parseNumber(row.lineToLineKA),
      doubleLineGroundKA: parseNumber(row.doubleLineGroundKA),
      momentaryKA: parseNumber(row.asymKA ?? row.ip),
      interruptingKA: parseNumber(row.Ib ?? row.threePhaseKA),
      thirtyCycleKA: parseNumber(row.Ith ?? row.threePhaseKA),
      relayKA: parseNumber(row.lineToGroundKA ?? row.threePhaseKA),
      dutyBasis: studyCase.dutyBasis,
      dutyValueKA: Number.isFinite(duty) ? Number(duty.toFixed(3)) : null,
      equipmentDutySide: studyCase.equipmentDutySide,
      selectedFaultTypes: [...studyCase.faultTypes],
      warnings,
      status: Number.isFinite(duty) ? (warnings.length ? 'review' : 'ready') : 'missingData',
    };
  }));
}

function summarizeDutyRows(rows = []) {
  return rows.reduce((summary, row) => {
    summary.total += 1;
    summary[row.status] = (summary[row.status] || 0) + 1;
    if (Number.isFinite(row.dutyValueKA)) summary.maxDutyKA = Math.max(summary.maxDutyKA || 0, row.dutyValueKA);
    return summary;
  }, { total: 0, ready: 0, review: 0, missingData: 0, maxDutyKA: 0 });
}

export function buildShortCircuitStudyPackage({ projectName = '', oneLine = {}, studyCase = {}, results = null, generatedAt = '' } = {}) {
  const run = results
    ? (results.caseResults
      ? results
      : {
        studyCase,
        results: results.results || results,
        caseResults: [{ voltageCase: 'nominal', factor: 1, results: results.results || results }],
      })
    : runShortCircuitStudyCase({ oneLine, studyCase });
  const normalized = normalizeShortCircuitStudyCase(run.studyCase || studyCase);
  const dutyRows = buildShortCircuitDutyRows(run, normalized);
  const warnings = [];
  if (!dutyRows.length) warnings.push({ severity: 'warning', message: 'No buses matched the selected short-circuit study scope.' });
  if (normalized.includeDcShortCircuit) {
    warnings.push({ severity: 'info', message: 'DC short-circuit inclusion is a report flag only; run the DC Short Circuit page separately for DC systems.' });
  }
  if (normalized.voltageCase === 'sensitivity') {
    warnings.push({ severity: 'info', message: `Voltage sensitivity uses +/- ${normalized.voltageSensitivityPct}% screening cases derived from the nominal AC short-circuit result.` });
  }
  return {
    version: SHORT_CIRCUIT_STUDY_CASE_VERSION,
    generatedAt: generatedAt || new Date().toISOString(),
    projectName: projectName || 'Untitled Project',
    studyCase: normalized,
    summary: summarizeDutyRows(dutyRows),
    results: run.results || {},
    caseResults: run.caseResults || [],
    dutyRows,
    warnings,
    assumptions: [
      'Short-circuit study case is a deterministic local screening deliverable based on the existing CableTrayRoute AC short-circuit engine.',
      'Line-side/load-side equipment duty is recorded for review; v1 does not automatically mutate topology for alternate equipment terminals.',
      'Final equipment acceptance, protective-device duty, and utility fault-current basis require engineer/manufacturer verification.',
    ],
  };
}

export function renderShortCircuitStudyHTML(pkg = {}) {
  const rows = asArray(pkg.dutyRows);
  const c = pkg.studyCase || {};
  return `<section class="report-section" id="rpt-short-circuit-study">
  <h2>Short-Circuit Study Basis</h2>
  <p class="report-note">Auditable study-case basis for AC short-circuit screening. DC short-circuit results remain separate.</p>
  <dl class="report-dl">
    <dt>Method</dt><dd>${esc(c.method || '')}</dd>
    <dt>Duty Basis</dt><dd>${esc(c.dutyBasis || '')}</dd>
    <dt>Voltage Case</dt><dd>${esc(c.voltageCase || '')}</dd>
    <dt>Equipment Duty Side</dt><dd>${esc(c.equipmentDutySide || '')}</dd>
    <dt>Fault Types</dt><dd>${esc(asArray(c.faultTypes).join(', '))}</dd>
    <dt>Rows</dt><dd>${esc(pkg.summary?.total || rows.length)}</dd>
  </dl>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Bus</th><th>Method</th><th>Voltage Case</th><th>Prefault kV</th><th>3P kA</th><th>LG kA</th><th>LL kA</th><th>DLG kA</th><th>Duty Basis</th><th>Duty kA</th><th>Status</th><th>Warnings</th></tr></thead>
    <tbody>${rows.length ? rows.map(row => `<tr>
      <td>${esc(row.busTag || row.busId)}</td>
      <td>${esc(row.method)}</td>
      <td>${esc(row.voltageCase)}</td>
      <td>${esc(row.prefaultKV ?? '')}</td>
      <td>${esc(row.threePhaseKA ?? '')}</td>
      <td>${esc(row.lineToGroundKA ?? '')}</td>
      <td>${esc(row.lineToLineKA ?? '')}</td>
      <td>${esc(row.doubleLineGroundKA ?? '')}</td>
      <td>${esc(row.dutyBasis)}</td>
      <td>${esc(row.dutyValueKA ?? '')}</td>
      <td>${esc(row.status)}</td>
      <td>${esc(asArray(row.warnings).join(' | ') || 'None')}</td>
    </tr>`).join('') : '<tr><td colspan="12">No short-circuit duty rows.</td></tr>'}</tbody>
  </table>
  </div>
  ${asArray(pkg.warnings).length ? `<div class="report-alert report-alert--warning"><strong>Warnings:</strong><ul>${asArray(pkg.warnings).map(w => `<li>${esc(w.message || w)}</li>`).join('')}</ul></div>` : ''}
</section>`;
}

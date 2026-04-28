/**
 * Voltage Drop Compliance Study
 *
 * Iterates all cables in a project, calculates voltage drop percent for each,
 * classifies as feeder or branch circuit, and checks NEC 215.2 / 210.19 limits:
 *   - Feeder circuits:       ≤ 3 % recommended
 *   - Branch circuits:       ≤ 3 % recommended (≤ 5 % total feeder + branch)
 *
 * References:
 *   NEC 2023 Art. 210.19(A)(1) Informational Note — 3 % branch circuit limit
 *   NEC 2023 Art. 215.2(A)(3)  Informational Note — 3 % feeder limit, 5 % combined
 *   IEC 60364-5-52:2009 — Installation methods and voltage drop
 */

import { calculateVoltageDrop } from '../src/voltageDrop.js';

export const VOLTAGE_DROP_STUDY_VERSION = 'voltage-drop-study-v1';

/** NEC recommended voltage-drop limits (%) */
export const NEC_LIMITS = {
  feeder: 3,
  branch: 3,
  combined: 5,
};

const OPERATING_CASES = new Set(['normal', 'emergency', 'start']);
const REPORT_PRESETS = new Set(['summary', 'criteria', 'fullStudy']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeText(value = '') {
  return String(value ?? '').trim();
}

function toNumber(value, fallback = null) {
  if (value === '' || value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function warning(code, message, severity = 'warning', source = {}) {
  return { code, message, severity, source };
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validatePct(value, fallback, label, max = 100) {
  const parsed = toNumber(value, fallback);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) throw new Error(`${label} must be between 0 and ${max}`);
  return parsed;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = toNumber(value, null);
    if (parsed != null) return parsed;
  }
  return null;
}

function cableTag(cable = {}) {
  return normalizeText(cable.cable_tag || cable.tag || cable.id || cable.ref || '');
}

function buildCableForCase(cable = {}, operatingCase = {}) {
  const pf = operatingCase.loadPowerFactor || firstNumber(cable.powerFactor, cable.pf) || 0.9;
  const voltageBase = firstNumber(cable.operating_voltage, cable.cable_rating, cable.voltage, operatingCase.nominalVoltageV) || 0;
  const sourceMultiplier = (operatingCase.sourceVoltagePct || 100) / 100;
  const tapMultiplier = 1 + ((operatingCase.transformerTapPct || 0) / 100);
  const operatingVoltage = voltageBase * sourceMultiplier * tapMultiplier;
  const baseCurrent = firstNumber(cable.est_load, cable.current, cable.loadAmps, cable.designCurrentA) || 0;
  const adjustedCurrent = pf > 0 ? baseCurrent * (0.9 / pf) : baseCurrent;
  return {
    ...cable,
    est_load: adjustedCurrent,
    current: adjustedCurrent,
    operating_voltage: operatingVoltage,
    cable_rating: operatingVoltage || voltageBase,
    conductor_material: operatingCase.conductorMaterialBasis || cable.conductor_material || cable.material || 'CU',
    insulation_rating: operatingCase.conductorTemperatureC || cable.insulation_rating || cable.temperatureRatingC || 75,
  };
}

export function normalizeVoltageDropCriteria(input = {}) {
  const source = asObject(input);
  const reportPreset = normalizeText(source.reportPreset || 'fullStudy');
  if (!REPORT_PRESETS.has(reportPreset)) throw new Error(`Invalid voltage-drop reportPreset: ${source.reportPreset}`);
  return {
    feederLimitPct: validatePct(source.feederLimitPct ?? source.feederLimit, NEC_LIMITS.feeder, 'feederLimitPct', 25),
    branchLimitPct: validatePct(source.branchLimitPct ?? source.branchLimit, NEC_LIMITS.branch, 'branchLimitPct', 25),
    totalLimitPct: validatePct(source.totalLimitPct ?? source.combinedLimitPct, NEC_LIMITS.combined, 'totalLimitPct', 25),
    normalLimitPct: validatePct(source.normalLimitPct, NEC_LIMITS.branch, 'normalLimitPct', 25),
    emergencyLimitPct: validatePct(source.emergencyLimitPct, 5, 'emergencyLimitPct', 50),
    startingLimitPct: validatePct(source.startingLimitPct, 10, 'startingLimitPct', 80),
    warningMarginPct: validatePct(source.warningMarginPct, 80, 'warningMarginPct', 100),
    reportPreset,
    notes: normalizeText(source.notes || ''),
  };
}

export function normalizeVoltageDropOperatingCase(input = {}) {
  const source = asObject(input);
  const caseType = normalizeText(source.caseType || source.type || 'normal');
  if (!OPERATING_CASES.has(caseType)) throw new Error(`Invalid voltage-drop caseType: ${source.caseType || source.type}`);
  const sourceVoltagePct = validatePct(source.sourceVoltagePct, 100, 'sourceVoltagePct', 130);
  const transformerTapPct = toNumber(source.transformerTapPct, 0);
  if (!Number.isFinite(transformerTapPct) || transformerTapPct < -20 || transformerTapPct > 20) throw new Error('transformerTapPct must be between -20 and 20');
  const loadPowerFactor = toNumber(source.loadPowerFactor ?? source.pf, 0.9);
  if (!Number.isFinite(loadPowerFactor) || loadPowerFactor <= 0 || loadPowerFactor > 1) throw new Error('loadPowerFactor must be between 0 and 1');
  const conductorTemperatureC = toNumber(source.conductorTemperatureC, 75);
  if (!Number.isFinite(conductorTemperatureC) || conductorTemperatureC < 0 || conductorTemperatureC > 250) throw new Error('conductorTemperatureC must be between 0 and 250');
  const motorMinimumStartingVoltagePu = toNumber(source.motorMinimumStartingVoltagePu, 0.8);
  if (!Number.isFinite(motorMinimumStartingVoltagePu) || motorMinimumStartingVoltagePu <= 0 || motorMinimumStartingVoltagePu > 1.2) throw new Error('motorMinimumStartingVoltagePu must be between 0 and 1.2');
  return {
    caseType,
    sourceVoltagePct,
    transformerTapPct,
    loadPowerFactor,
    conductorTemperatureC,
    conductorMaterialBasis: normalizeText(source.conductorMaterialBasis || ''),
    segmentChainBasisNote: normalizeText(source.segmentChainBasisNote || ''),
    motorMinimumStartingVoltagePu,
    nominalVoltageV: toNumber(source.nominalVoltageV, null),
    notes: normalizeText(source.notes || ''),
  };
}

/**
 * Determine whether a cable is a feeder or branch circuit.
 * Uses `cable.circuit_type` when available; falls back to heuristics on
 * `cable.service_type`, `cable.cable_type`, and description keywords.
 *
 * @param {Object} cable
 * @returns {'feeder'|'branch'}
 */
export function classifyCircuit(cable) {
  const ct = (cable.circuit_type || cable.service_type || '').toLowerCase();
  if (ct.includes('feeder') || ct.includes('main') || ct.includes('distribution')) {
    return 'feeder';
  }
  const cType = (cable.cable_type || cable.type || '').toLowerCase();
  if (cType.includes('feeder') || cType.includes('main') || cType.includes('distribution')) {
    return 'feeder';
  }
  return 'branch';
}

/**
 * Evaluate a single cable and return its voltage drop result.
 *
 * @param {Object} cable  - Cable schedule row
 * @param {number} [lengthFt] - Override length in feet (falls back to cable.length)
 * @returns {{
 *   tag: string,
 *   from: string,
 *   to: string,
 *   conductorSize: string,
 *   material: string,
 *   lengthFt: number,
 *   currentA: number,
 *   voltageV: number,
 *   dropPct: number,
 *   circuitType: 'feeder'|'branch',
 *   limit: number,
 *   status: 'pass'|'warn'|'fail'
 * }}
 */
export function evaluateCable(cable, lengthFt) {
  const len = parseFloat(lengthFt ?? cable.length ?? cable.route_length ?? 0) || 0;
  const phase = parseInt(cable.phases ?? cable.num_phases ?? 3, 10) || 3;
  const dropPct = calculateVoltageDrop(cable, len, phase);
  const circuitType = classifyCircuit(cable);
  const limit = NEC_LIMITS[circuitType];

  let status;
  if (!dropPct || !len) {
    status = 'pass'; // no data — assume compliant
  } else if (dropPct > limit) {
    status = 'fail';
  } else if (dropPct > limit * 0.8) {
    status = 'warn'; // within 80–100 % of limit
  } else {
    status = 'pass';
  }

  return {
    tag: cable.cable_tag || cable.tag || cable.id || '',
    from: cable.from_location || cable.origin || '',
    to: cable.to_location || cable.destination || '',
    conductorSize: cable.conductor_size || '',
    material: cable.conductor_material || 'CU',
    lengthFt: len,
    currentA: parseFloat(cable.est_load || cable.current || 0) || 0,
    voltageV: parseFloat(cable.operating_voltage || cable.cable_rating || 0) || 0,
    dropPct: Number.isFinite(dropPct) ? dropPct : 0,
    circuitType,
    limit,
    status,
  };
}

/**
 * Run a full voltage drop study for an array of cable schedule rows.
 *
 * @param {Object[]} cables
 * @returns {{
 *   results: Array,
 *   summary: {
 *     total: number,
 *     pass: number,
 *     warn: number,
 *     fail: number,
 *     maxDropPct: number,
 *     avgDropPct: number
 *   }
 * }}
 */
export function runVoltageDropStudy(cables = []) {
  const results = cables.map(c => evaluateCable(c));

  const withData = results.filter(r => r.lengthFt > 0 && r.currentA > 0);
  const maxDropPct = withData.length
    ? Math.max(...withData.map(r => r.dropPct))
    : 0;
  const avgDropPct = withData.length
    ? withData.reduce((s, r) => s + r.dropPct, 0) / withData.length
    : 0;

  const summary = {
    total: results.length,
    pass: results.filter(r => r.status === 'pass').length,
    warn: results.filter(r => r.status === 'warn').length,
    fail: results.filter(r => r.status === 'fail').length,
    maxDropPct,
    avgDropPct,
  };

  return { results, summary };
}

function buildMotorStartLookup(motorStart = {}) {
  const lookup = new Map();
  asArray(motorStart.worstCaseRows).forEach(row => {
    [row.cableTag, row.motorTag, row.motorId, row.busId].map(normalizeText).filter(Boolean).forEach(key => lookup.set(key, row));
  });
  return lookup;
}

export function buildVoltageDropStudyRows({ cables = [], criteria = {}, operatingCase = {}, motorStart = null } = {}) {
  const normalizedCriteria = normalizeVoltageDropCriteria(criteria);
  const normalizedCase = normalizeVoltageDropOperatingCase(operatingCase);
  const motorLookup = buildMotorStartLookup(motorStart || {});
  return asArray(cables).map((cable, index) => {
    const tag = cableTag(cable) || `Cable ${index + 1}`;
    const caseCable = buildCableForCase(cable, normalizedCase);
    const base = evaluateCable(caseCable);
    const circuitLimit = base.circuitType === 'feeder' ? normalizedCriteria.feederLimitPct : normalizedCriteria.branchLimitPct;
    const caseLimit = normalizedCase.caseType === 'emergency'
      ? normalizedCriteria.emergencyLimitPct
      : normalizedCase.caseType === 'start'
        ? normalizedCriteria.startingLimitPct
        : Math.min(circuitLimit, normalizedCriteria.normalLimitPct);
    const totalChainDropPct = firstNumber(cable.totalChainDropPct, cable.sourceToLoadDropPct, null);
    const effectiveDropPct = totalChainDropPct != null ? Math.max(base.dropPct, totalChainDropPct) : base.dropPct;
    const missingFields = [];
    if (!base.lengthFt) missingFields.push('lengthFt');
    if (!base.currentA) missingFields.push('currentA');
    if (!base.voltageV) missingFields.push('voltageV');
    if (!base.conductorSize) missingFields.push('conductorSize');
    const motorRow = motorLookup.get(tag)
      || motorLookup.get(normalizeText(cable.to_location || cable.destination || cable.to || ''))
      || motorLookup.get(normalizeText(cable.from_location || cable.source || cable.from || ''))
      || motorLookup.get(normalizeText(cable.id || cable.cable_id || ''));
    const startVoltagePu = normalizedCase.caseType === 'start'
      ? (motorRow?.minVoltagePu != null ? Number(motorRow.minVoltagePu) : (base.voltageV ? (base.voltageV * (1 - base.dropPct / 100)) / base.voltageV : 0))
      : null;
    const startVoltageMarginPu = startVoltagePu == null ? null : round(startVoltagePu - normalizedCase.motorMinimumStartingVoltagePu, 4);
    let status = 'pass';
    let reason = 'Voltage drop is within the configured criterion.';
    if (missingFields.length) {
      status = 'missingData';
      reason = `Missing voltage-drop input data: ${missingFields.join(', ')}.`;
    } else if (normalizedCase.caseType === 'start' && startVoltageMarginPu != null && startVoltageMarginPu < 0) {
      status = 'fail';
      reason = 'Starting voltage is below the configured motor minimum.';
    } else if (effectiveDropPct > caseLimit || (totalChainDropPct != null && totalChainDropPct > normalizedCriteria.totalLimitPct)) {
      status = 'fail';
      reason = totalChainDropPct != null && totalChainDropPct > normalizedCriteria.totalLimitPct
        ? 'Total source-to-load voltage drop exceeds the configured total criterion.'
        : `${normalizedCase.caseType} voltage drop exceeds the configured criterion.`;
    } else if (effectiveDropPct >= caseLimit * (normalizedCriteria.warningMarginPct / 100)) {
      status = 'warn';
      reason = 'Voltage drop is near the configured warning margin.';
    }
    return {
      id: normalizeText(cable.id || cable.ref || tag || `cable-${index + 1}`),
      tag,
      from: normalizeText(cable.from_location || cable.origin || cable.from || ''),
      to: normalizeText(cable.to_location || cable.destination || cable.to || ''),
      circuitType: base.circuitType,
      caseType: normalizedCase.caseType,
      lengthFt: base.lengthFt,
      currentA: round(base.currentA, 3),
      voltageV: round(base.voltageV, 3),
      loadPowerFactor: normalizedCase.loadPowerFactor,
      conductorSize: base.conductorSize,
      material: base.material,
      conductorTemperatureC: normalizedCase.conductorTemperatureC,
      dropPct: round(base.dropPct, 4),
      applicableLimitPct: caseLimit,
      totalChainDropPct: totalChainDropPct == null ? null : round(totalChainDropPct, 4),
      totalLimitPct: normalizedCriteria.totalLimitPct,
      startVoltagePu,
      startVoltageMarginPu,
      status,
      reason,
      missingFields,
      recommendation: status === 'pass'
        ? 'Voltage-drop result is within the configured screening criterion.'
        : status === 'missingData'
          ? 'Complete cable length, current, voltage, and conductor data before release.'
          : 'Review conductor size, route length, source voltage/tap, load PF, or upstream segment chain.',
    };
  });
}

export function evaluateVoltageDropCriteria(rows = [], criteria = {}) {
  const normalizedCriteria = normalizeVoltageDropCriteria(criteria);
  return asArray(rows).map(row => {
    const limit = row.caseType === 'emergency'
      ? normalizedCriteria.emergencyLimitPct
      : row.caseType === 'start'
        ? normalizedCriteria.startingLimitPct
        : row.circuitType === 'feeder' ? normalizedCriteria.feederLimitPct : normalizedCriteria.branchLimitPct;
    if (row.status === 'missingData') return { ...row, applicableLimitPct: limit };
    const totalFail = row.totalChainDropPct != null && row.totalChainDropPct > normalizedCriteria.totalLimitPct;
    const fail = row.dropPct > limit || totalFail || (row.caseType === 'start' && row.startVoltageMarginPu != null && row.startVoltageMarginPu < 0);
    const warn = !fail && row.dropPct >= limit * (normalizedCriteria.warningMarginPct / 100);
    const startFail = row.caseType === 'start' && row.startVoltageMarginPu != null && row.startVoltageMarginPu < 0;
    return {
      ...row,
      applicableLimitPct: limit,
      status: fail ? 'fail' : warn ? 'warn' : 'pass',
      reason: fail
        ? startFail ? 'Starting voltage is below the configured motor minimum.'
          : totalFail ? 'Total source-to-load voltage drop exceeds the configured total criterion.' : 'Voltage-drop criterion is exceeded.'
        : warn ? 'Voltage drop is near the configured warning margin.' : 'Voltage-drop criterion is satisfied.',
    };
  });
}

export function buildVoltageDropStudyPackage(context = {}) {
  const criteria = normalizeVoltageDropCriteria(context.criteria || {});
  const operatingCase = normalizeVoltageDropOperatingCase(context.operatingCase || {});
  const rows = evaluateVoltageDropCriteria(buildVoltageDropStudyRows({
    cables: context.cables || [],
    criteria,
    operatingCase,
    motorStart: context.motorStart || context.studyResults?.motorStart || null,
  }), criteria);
  const segmentRows = rows
    .filter(row => row.totalChainDropPct != null || operatingCase.segmentChainBasisNote)
    .map(row => ({
      cableId: row.id,
      cableTag: row.tag,
      from: row.from,
      to: row.to,
      circuitType: row.circuitType,
      cableDropPct: row.dropPct,
      totalChainDropPct: row.totalChainDropPct,
      totalLimitPct: criteria.totalLimitPct,
      basisNote: operatingCase.segmentChainBasisNote,
      status: row.totalChainDropPct != null && row.totalChainDropPct > criteria.totalLimitPct ? 'fail' : 'review',
    }));
  const warningRows = [];
  rows.forEach(row => {
    if (row.status === 'missingData') {
      warningRows.push(warning('missingVoltageDropInputs', `${row.tag} is missing ${row.missingFields.join(', ')}.`, 'warning', { cableId: row.id, tag: row.tag }));
    }
    if (row.status === 'fail') {
      warningRows.push(warning('voltageDropCriteriaFailure', `${row.tag} fails ${row.caseType} voltage-drop criteria: ${row.reason}`, 'error', { cableId: row.id, tag: row.tag }));
    }
  });
  if (!operatingCase.segmentChainBasisNote) {
    warningRows.push(warning('missingSegmentChainBasis', 'Segment-chain basis note is blank; total source-to-load traceability may be incomplete.', 'warning'));
  }
  const alternativeRows = rows
    .filter(row => row.status === 'fail' || row.status === 'warn')
    .map(row => ({
      cableId: row.id,
      cableTag: row.tag,
      currentConductor: `${row.conductorSize} ${row.material}`.trim(),
      currentDropPct: row.dropPct,
      requiredLimitPct: row.applicableLimitPct,
      status: row.status,
      reason: row.reason,
      recommendation: 'Evaluate larger conductor, shorter route, source/tap adjustment, or downstream distribution point.',
    }));
  const withData = rows.filter(row => row.status !== 'missingData');
  const summary = {
    total: rows.length,
    pass: rows.filter(row => row.status === 'pass').length,
    warn: rows.filter(row => row.status === 'warn').length,
    fail: rows.filter(row => row.status === 'fail').length,
    missingData: rows.filter(row => row.status === 'missingData').length,
    maxDropPct: rows.length ? round(Math.max(...rows.map(row => row.dropPct || 0)), 4) : 0,
    avgDropPct: withData.length ? round(withData.reduce((sum, row) => sum + (row.dropPct || 0), 0) / withData.length, 4) : 0,
    segmentCount: segmentRows.length,
    alternativeCount: alternativeRows.length,
    warningCount: warningRows.length,
    status: rows.some(row => row.status === 'fail') ? 'fail' : rows.some(row => row.status === 'warn' || row.status === 'missingData') ? 'review' : 'pass',
    caseType: operatingCase.caseType,
  };
  return {
    version: VOLTAGE_DROP_STUDY_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName: context.projectName || 'Untitled Project',
    criteria,
    operatingCase,
    rows,
    segmentRows,
    alternativeRows,
    warningRows,
    assumptions: [
      'Voltage-drop study-case results are deterministic screening output using local cable schedule data.',
      'Normal, emergency, and starting criteria are user-selected engineering criteria and do not replace project-specific code review.',
      'Source voltage and transformer tap assumptions are applied as operating-case modifiers, not as a coupled load-flow solve.',
      'Motor-start minimum-voltage checks consume saved motor-start context when available; otherwise explicit operating-case inputs govern.',
    ],
    summary,
  };
}

function renderRows(rows = [], columns = []) {
  if (!rows.length) return `<tr><td colspan="${columns.length}">No rows.</td></tr>`;
  return rows.map(row => `<tr>${columns.map(column => `<td>${escapeHtml(column.render ? column.render(row) : row[column.key])}</td>`).join('')}</tr>`).join('');
}

export function renderVoltageDropStudyHTML(pkg = {}) {
  const rowColumns = [
    { key: 'tag' },
    { key: 'from' },
    { key: 'to' },
    { key: 'caseType' },
    { key: 'circuitType' },
    { key: 'dropPct' },
    { key: 'applicableLimitPct' },
    { key: 'totalChainDropPct' },
    { key: 'status' },
    { key: 'reason' },
  ];
  const warningColumns = [
    { key: 'severity' },
    { key: 'code' },
    { key: 'message' },
  ];
  return `<section class="report-section" id="rpt-voltage-drop-study">
  <h2>Voltage Drop Study Basis</h2>
  <p class="report-note">Local deterministic voltage-drop criteria package. Final cable sizing and operating-case acceptance require engineering review.</p>
  <dl class="report-dl">
    <dt>Project</dt><dd>${escapeHtml(pkg.projectName || 'Untitled Project')}</dd>
    <dt>Case</dt><dd>${escapeHtml(pkg.operatingCase?.caseType || 'normal')}</dd>
    <dt>Feeder / Branch Limits</dt><dd>${escapeHtml(pkg.criteria?.feederLimitPct || 0)}% / ${escapeHtml(pkg.criteria?.branchLimitPct || 0)}%</dd>
    <dt>Total Limit</dt><dd>${escapeHtml(pkg.criteria?.totalLimitPct || 0)}%</dd>
    <dt>Status</dt><dd>${escapeHtml(pkg.summary?.status || 'review')}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr>${rowColumns.map(column => `<th>${escapeHtml(column.key)}</th>`).join('')}</tr></thead>
      <tbody>${renderRows(asArray(pkg.rows), rowColumns)}</tbody>
    </table>
  </div>
  <h3>Warnings</h3>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr>${warningColumns.map(column => `<th>${escapeHtml(column.key)}</th>`).join('')}</tr></thead>
      <tbody>${renderRows(asArray(pkg.warningRows), warningColumns)}</tbody>
    </table>
  </div>
</section>`;
}

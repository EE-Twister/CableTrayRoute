import { buildLoadFlowModel } from './loadFlowModel.js';
import { runLoadFlow } from './loadFlow.js';

export const LOAD_FLOW_STUDY_CASE_VERSION = 'load-flow-study-case-v1';

const MODES = new Set(['balanced', 'perPhase']);
const LOAD_MODELS = new Set(['constantPQ', 'constantCurrent', 'constantImpedance', 'mixedZIP']);
const REPORT_PRESETS = new Set(['summary', 'voltageProfile', 'fullStudy']);
const PHASES = ['A', 'B', 'C'];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
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

function round(value, digits = 4) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const factor = 10 ** digits;
  return Math.round(num * factor) / factor;
}

function phaseList(value) {
  if (Array.isArray(value)) {
    const list = value.map(item => String(item).trim().toUpperCase()).filter(item => PHASES.includes(item));
    return list.length ? [...new Set(list)] : [...PHASES];
  }
  if (typeof value === 'string') {
    const list = value.split(/[,\s/]+/).map(item => item.trim().toUpperCase()).filter(item => PHASES.includes(item));
    return list.length ? [...new Set(list)] : [...PHASES];
  }
  return [...PHASES];
}

function extractPhasePQ(record = {}, phase) {
  const obj = asObject(record);
  const nested = obj[phase] || obj[phase.toLowerCase?.()] || obj.phases?.[phase] || obj.phases?.[phase.toLowerCase?.()];
  const source = nested && typeof nested === 'object' ? nested : obj;
  return {
    kw: parseNumber(source.kw ?? source.kW ?? source.P ?? source.p, 0),
    kvar: parseNumber(source.kvar ?? source.kVAr ?? source.Q ?? source.q, 0),
    pf: parseNumber(source.pf ?? source.powerFactor ?? source.power_factor, ''),
  };
}

function displayTag(row = {}) {
  return row.label || row.name || row.ref || row.tag || row.id || '';
}

function busType(value, fallback = 'PQ') {
  const raw = String(value || fallback).trim();
  if (raw.toLowerCase() === 'slack') return 'slack';
  if (raw.toUpperCase() === 'PV') return 'PV';
  return 'PQ';
}

function statusForVoltage(vm, limits = {}) {
  if (!Number.isFinite(vm)) return 'missingData';
  const min = limits.minPu;
  const max = limits.maxPu;
  const margin = limits.warningMarginPu;
  if (vm < min || vm > max) return 'fail';
  if (vm < min + margin || vm > max - margin) return 'warn';
  return 'pass';
}

export function normalizeLoadFlowStudyCase(input = {}) {
  const raw = asObject(input);
  const mode = String(raw.mode || (raw.balanced === false ? 'perPhase' : 'balanced')).trim();
  if (!MODES.has(mode)) throw new Error(`Unsupported load-flow mode: ${mode}`);
  const loadModel = String(raw.loadModel || 'constantPQ').trim();
  if (!LOAD_MODELS.has(loadModel)) throw new Error(`Unsupported load model: ${loadModel}`);
  const reportPreset = String(raw.reportPreset || 'summary').trim();
  if (!REPORT_PRESETS.has(reportPreset)) throw new Error(`Unsupported load-flow report preset: ${reportPreset}`);
  const voltageLimits = asObject(raw.voltageLimits);
  const minPu = parseNumber(voltageLimits.minPu ?? raw.minVoltagePu, 0.95);
  const maxPu = parseNumber(voltageLimits.maxPu ?? raw.maxVoltagePu, 1.05);
  const warningMarginPu = parseNumber(voltageLimits.warningMarginPu ?? raw.warningMarginPu, 0.02);
  const openPhase = asObject(raw.openPhase);
  const includeControls = asObject(raw.includeControls);
  return {
    baseMVA: Math.max(0.001, parseNumber(raw.baseMVA, 100)),
    mode,
    balanced: mode === 'balanced',
    loadModel,
    voltageLimits: {
      minPu,
      maxPu,
      warningMarginPu: Math.max(0, warningMarginPu),
    },
    openPhase: {
      enabled: parseBool(openPhase.enabled ?? raw.openPhaseEnabled, false),
      phases: phaseList(openPhase.phases ?? raw.openPhasePhases),
    },
    includeControls: {
      transformerTaps: parseBool(includeControls.transformerTaps, true),
      regulators: parseBool(includeControls.regulators, true),
      capacitorSteps: parseBool(includeControls.capacitorSteps, true),
      ibrVoltVar: parseBool(includeControls.ibrVoltVar, true),
    },
    reportPreset,
    notes: String(raw.notes || '').trim(),
  };
}

function normalizeBusRow(row = {}, sourceBus = {}) {
  const input = asObject(row);
  const bus = asObject(sourceBus);
  const id = String(input.id || input.elementId || input.busId || bus.id || '').trim();
  const load = asObject(input.load ?? bus.load);
  const generation = asObject(input.generation ?? bus.generation);
  const defaultedFields = [];
  const missingFields = [];
  const phases = phaseList(input.phases || bus.phases);
  const perPhase = {};
  PHASES.forEach(phase => {
    const explicitPhase = input.perPhase?.[phase] || input.perPhase?.[phase.toLowerCase?.()] || null;
    const loadPQ = explicitPhase
      ? { kw: parseNumber(explicitPhase.loadKw, 0), kvar: parseNumber(explicitPhase.loadKvar, 0), pf: parseNumber(explicitPhase.pf, '') }
      : extractPhasePQ(input.phases ? input : load, phase);
    const genPQ = explicitPhase
      ? { kw: parseNumber(explicitPhase.generationKw, 0), kvar: parseNumber(explicitPhase.generationKvar, 0), pf: '' }
      : extractPhasePQ(input.generationPhases || generation, phase);
    const totalLoadKw = parseNumber(load.kw ?? load.kW, null);
    const totalLoadKvar = parseNumber(load.kvar ?? load.kVAr, null);
    const totalGenKw = parseNumber(generation.kw ?? generation.kW, null);
    const totalGenKvar = parseNumber(generation.kvar ?? generation.kVAr, null);
    perPhase[phase] = {
      loadKw: Number.isFinite(loadPQ.kw) && loadPQ.kw !== 0 ? loadPQ.kw : Number.isFinite(totalLoadKw) ? totalLoadKw / 3 : 0,
      loadKvar: Number.isFinite(loadPQ.kvar) && loadPQ.kvar !== 0 ? loadPQ.kvar : Number.isFinite(totalLoadKvar) ? totalLoadKvar / 3 : 0,
      generationKw: Number.isFinite(genPQ.kw) && genPQ.kw !== 0 ? genPQ.kw : Number.isFinite(totalGenKw) ? totalGenKw / 3 : 0,
      generationKvar: Number.isFinite(genPQ.kvar) && genPQ.kvar !== 0 ? genPQ.kvar : Number.isFinite(totalGenKvar) ? totalGenKvar / 3 : 0,
      pf: loadPQ.pf || '',
    };
  });
  if (!id) missingFields.push('busId');
  if (!input.phases && !bus.phases) defaultedFields.push('phases');
  if (!input.busType && !bus.busType && !bus.type) defaultedFields.push('busType');
  return {
    id: id || slug(displayTag(input) || displayTag(bus)),
    rowType: 'bus',
    elementId: id || slug(displayTag(input) || displayTag(bus)),
    elementTag: String(input.elementTag || input.tag || displayTag(bus) || id || 'Bus'),
    enabled: input.enabled !== false,
    busType: busType(input.busType || input.type || bus.busType || bus.type, 'PQ'),
    phases,
    baseKV: parseNumber(input.baseKV ?? bus.baseKV, 0.48),
    voltageSetpointPu: parseNumber(input.voltageSetpointPu ?? input.Vm ?? bus.Vm, ''),
    transformerConnection: String(input.transformerConnection || ''),
    tapRatio: parseNumber(input.tapRatio, ''),
    capacitorKvar: parseNumber(input.capacitorKvar, 0),
    regulatorMode: String(input.regulatorMode || 'fixed'),
    controlMode: String(input.controlMode || 'none'),
    loadModel: String(input.loadModel || ''),
    perPhase,
    notes: String(input.notes || '').trim(),
    defaultedFields,
    missingFields,
  };
}

function normalizeBranchRow(row = {}, branch = {}) {
  const input = asObject(row);
  const source = asObject(branch);
  const id = String(input.id || input.elementId || source.id || source.componentId || '').trim();
  const defaultedFields = [];
  if (!input.phases && !source.phases) defaultedFields.push('phases');
  return {
    id: id || slug(`${source.from || 'from'}-${source.to || 'to'}`),
    rowType: 'branch',
    elementId: id || slug(`${source.from || 'from'}-${source.to || 'to'}`),
    elementTag: String(input.elementTag || input.tag || source.label || source.name || source.ref || id || 'Branch'),
    enabled: input.enabled !== false,
    fromBus: input.fromBus || source.from || '',
    toBus: input.toBus || source.to || '',
    phases: phaseList(input.phases || source.phases),
    tapRatio: parseNumber(input.tapRatio ?? source.tap?.ratio ?? source.tap, ''),
    controlMode: String(input.controlMode || (source.tap ? 'tap' : 'none')),
    notes: String(input.notes || '').trim(),
    defaultedFields,
    missingFields: id ? [] : ['branchId'],
  };
}

export function buildLoadFlowStudyRows({ oneLine = {}, existingRows = [] } = {}) {
  const model = buildLoadFlowModel(oneLine);
  const existing = new Map(asArray(existingRows).map(row => [String(row.elementId || row.id || '').toLowerCase(), row]));
  const busRows = asArray(model.buses).map(bus => normalizeBusRow({
    ...asObject(existing.get(String(bus.id || '').toLowerCase())),
  }, bus));
  const branchRows = asArray(model.branches).map(branch => normalizeBranchRow({
    ...asObject(existing.get(String(branch.id || '').toLowerCase())),
  }, branch));
  return [...busRows, ...branchRows];
}

function rowLoad(row, studyCase) {
  if (studyCase.mode === 'perPhase') {
    return Object.fromEntries(PHASES.map(phase => [phase, {
      kw: parseNumber(row.perPhase?.[phase]?.loadKw, 0),
      kvar: parseNumber(row.perPhase?.[phase]?.loadKvar, 0),
    }]));
  }
  return {
    kw: PHASES.reduce((sum, phase) => sum + parseNumber(row.perPhase?.[phase]?.loadKw, 0), 0),
    kvar: PHASES.reduce((sum, phase) => sum + parseNumber(row.perPhase?.[phase]?.loadKvar, 0), 0),
  };
}

function rowGeneration(row, studyCase) {
  const capacitorKvar = parseNumber(row.capacitorKvar, 0);
  if (studyCase.mode === 'perPhase') {
    return Object.fromEntries(PHASES.map(phase => [phase, {
      kw: parseNumber(row.perPhase?.[phase]?.generationKw, 0),
      kvar: parseNumber(row.perPhase?.[phase]?.generationKvar, 0) + capacitorKvar / 3,
    }]));
  }
  return {
    kw: PHASES.reduce((sum, phase) => sum + parseNumber(row.perPhase?.[phase]?.generationKw, 0), 0),
    kvar: PHASES.reduce((sum, phase) => sum + parseNumber(row.perPhase?.[phase]?.generationKvar, 0), 0) + capacitorKvar,
  };
}

export function applyLoadFlowStudyCaseToModel(model = {}, studyCaseInput = {}, rows = []) {
  const studyCase = normalizeLoadFlowStudyCase(studyCaseInput);
  const patched = deepClone(model || { buses: [], branches: [] });
  patched.buses = asArray(patched.buses);
  patched.branches = asArray(patched.branches);
  const normalizedRows = asArray(rows).map(row => row.rowType === 'branch' ? normalizeBranchRow(row) : normalizeBusRow(row));
  const busRows = new Map(normalizedRows.filter(row => row.rowType === 'bus').map(row => [String(row.elementId || row.id).toLowerCase(), row]));
  const branchRows = new Map(normalizedRows.filter(row => row.rowType === 'branch').map(row => [String(row.elementId || row.id).toLowerCase(), row]));
  const warnings = [];
  const controlRows = [];
  patched.buses.forEach((bus, index) => {
    const row = busRows.get(String(bus.id || '').toLowerCase());
    if (!row || row.enabled === false) return;
    bus.busType = row.busType || bus.busType || (index === 0 ? 'slack' : 'PQ');
    bus.type = bus.busType;
    bus.baseKV = row.baseKV || bus.baseKV;
    if (Number.isFinite(row.voltageSetpointPu) && row.voltageSetpointPu > 0) {
      bus.Vm = row.voltageSetpointPu;
      controlRows.push({ elementId: row.elementId, elementTag: row.elementTag, controlType: 'voltageSetpoint', value: row.voltageSetpointPu, status: 'applied' });
    }
    bus.load = rowLoad(row, studyCase);
    bus.generation = rowGeneration(row, studyCase);
    if (row.capacitorKvar) {
      controlRows.push({ elementId: row.elementId, elementTag: row.elementTag, controlType: 'capacitorStep', value: row.capacitorKvar, status: studyCase.includeControls.capacitorSteps ? 'applied' : 'disabled' });
      if (!studyCase.includeControls.capacitorSteps) {
        bus.generation = studyCase.mode === 'perPhase'
          ? Object.fromEntries(PHASES.map(phase => [phase, { ...bus.generation[phase], kvar: parseNumber(bus.generation[phase]?.kvar, 0) - row.capacitorKvar / 3 }]))
          : { ...bus.generation, kvar: parseNumber(bus.generation?.kvar, 0) - row.capacitorKvar };
      }
    }
  });
  patched.branches.forEach(branch => {
    const row = branchRows.get(String(branch.id || branch.componentId || '').toLowerCase());
    if (!row || row.enabled === false) return;
    branch.phases = row.phases;
    if (Number.isFinite(row.tapRatio) && row.tapRatio > 0 && studyCase.includeControls.transformerTaps) {
      branch.tap = typeof branch.tap === 'object' && branch.tap ? { ...branch.tap, ratio: row.tapRatio } : { ratio: row.tapRatio };
      controlRows.push({ elementId: row.elementId, elementTag: row.elementTag, controlType: 'tapRatio', value: row.tapRatio, status: 'applied' });
    }
    patched.buses.forEach(bus => {
      asArray(bus.connections).forEach(conn => {
        if ((conn.componentId || conn.id) !== (branch.id || branch.componentId)) return;
        conn.phases = branch.phases;
        if (branch.tap) conn.tap = deepClone(branch.tap);
      });
    });
  });
  if (studyCase.openPhase.enabled) {
    const openSet = new Set(studyCase.openPhase.phases);
    patched.branches.forEach(branch => {
      const existing = phaseList(branch.phases);
      branch.phases = existing.filter(phase => !openSet.has(phase));
    });
    patched.buses.forEach(bus => {
      asArray(bus.connections).forEach(conn => {
        const existing = phaseList(conn.phases);
        conn.phases = existing.filter(phase => !openSet.has(phase));
      });
    });
    warnings.push({ severity: 'warning', code: 'open-phase-screening', message: `Open-phase screening removes ${Array.from(openSet).join('/')} phase paths before solving.` });
  }
  if (studyCase.loadModel !== 'constantPQ') {
    warnings.push({ severity: 'info', code: 'load-model-screening', message: `${studyCase.loadModel} is recorded as study basis; v1 solves using equivalent constant-PQ values.` });
  }
  return { model: patched, rows: normalizedRows, controlRows, warnings };
}

function buildPhaseRows(results = {}, studyCase = {}) {
  const rows = asArray(results.buses).map(bus => {
    const phase = bus.phase || (studyCase.mode === 'balanced' ? 'balanced' : '');
    const status = statusForVoltage(bus.Vm, studyCase.voltageLimits);
    return {
      busId: bus.id,
      busTag: bus.displayLabel || bus.label || bus.name || bus.id,
      phase,
      busType: bus.type,
      Vm: round(bus.Vm, 5),
      Va: round(bus.Va, 3),
      baseKV: round(bus.baseKV, 5),
      voltageKV: round(bus.voltageKV, 5),
      voltageV: round(bus.voltageV, 2),
      loadKw: round(bus.Pd, 3),
      loadKvar: round(bus.Qd, 3),
      generationKw: round(bus.Pg, 3),
      generationKvar: round(bus.Qg, 3),
      status,
    };
  });
  return rows;
}

function buildVoltageViolationRows(phaseRows = [], studyCase = {}) {
  return asArray(phaseRows)
    .filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData')
    .map(row => ({
      busId: row.busId,
      busTag: row.busTag,
      phase: row.phase,
      Vm: row.Vm,
      minPu: studyCase.voltageLimits.minPu,
      maxPu: studyCase.voltageLimits.maxPu,
      marginToMinPu: Number.isFinite(row.Vm) ? round(row.Vm - studyCase.voltageLimits.minPu, 5) : null,
      marginToMaxPu: Number.isFinite(row.Vm) ? round(studyCase.voltageLimits.maxPu - row.Vm, 5) : null,
      status: row.status,
      recommendation: row.status === 'fail'
        ? 'Review source setpoint, tap controls, reactive support, loading, or open-phase assumptions.'
        : 'Voltage is within limits but near the configured alarm band.',
    }));
}

function buildUnbalanceRows(phaseRows = []) {
  const byBus = new Map();
  asArray(phaseRows).forEach(row => {
    if (!PHASES.includes(row.phase)) return;
    if (!byBus.has(row.busId)) byBus.set(row.busId, []);
    byBus.get(row.busId).push(row);
  });
  return Array.from(byBus.entries()).map(([busId, rows]) => {
    const values = rows.map(row => row.Vm).filter(Number.isFinite);
    const avg = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const maxDeviation = Number.isFinite(avg) && avg > 0 ? Math.max(...values.map(value => Math.abs(value - avg))) : null;
    const voltageUnbalancePct = Number.isFinite(maxDeviation) ? round((maxDeviation / avg) * 100, 3) : null;
    const status = !Number.isFinite(voltageUnbalancePct)
      ? 'missingData'
      : voltageUnbalancePct > 3
        ? 'fail'
        : voltageUnbalancePct > 2
          ? 'warn'
          : 'pass';
    return {
      busId,
      busTag: rows[0]?.busTag || busId,
      phasesPresent: rows.map(row => row.phase).join('/'),
      averageVm: round(avg, 5),
      voltageUnbalancePct,
      status,
      recommendation: status === 'pass'
        ? 'Voltage unbalance is within screening thresholds.'
        : 'Review per-phase loads, open-phase assumptions, transformer connections, and regulator settings.',
    };
  });
}

function summarizePackage(results = {}, phaseRows = [], violationRows = [], unbalanceRows = [], equipmentRows = [], controlRows = []) {
  return {
    converged: results.converged !== false,
    busCount: new Set(asArray(phaseRows).map(row => row.busId)).size,
    phaseRowCount: phaseRows.length,
    branchFlowCount: asArray(results.lines).length,
    voltageViolationCount: violationRows.filter(row => row.status === 'fail').length,
    voltageWarningCount: violationRows.filter(row => row.status === 'warn').length,
    unbalanceFailCount: unbalanceRows.filter(row => row.status === 'fail').length,
    unbalanceWarnCount: unbalanceRows.filter(row => row.status === 'warn').length,
    controlActionCount: controlRows.length,
    defaultedInputCount: equipmentRows.reduce((sum, row) => sum + asArray(row.defaultedFields).length, 0),
    missingInputCount: equipmentRows.reduce((sum, row) => sum + asArray(row.missingFields).length, 0),
    totalLoadKW: results.summary?.totalLoadKW ?? null,
    totalLossKW: results.summary?.totalLossKW ?? results.losses?.P ?? null,
  };
}

export function runLoadFlowStudyCase({ oneLine = {}, studyCase = {}, rows = [] } = {}) {
  const normalizedStudyCase = normalizeLoadFlowStudyCase(studyCase);
  const sourceRows = asArray(rows).length ? rows : buildLoadFlowStudyRows({ oneLine });
  const baseModel = buildLoadFlowModel(oneLine);
  const applied = applyLoadFlowStudyCaseToModel(baseModel, normalizedStudyCase, sourceRows);
  const results = runLoadFlow(applied.model, {
    baseMVA: normalizedStudyCase.baseMVA,
    balanced: normalizedStudyCase.mode === 'balanced',
    maxIterations: 30,
  });
  return {
    studyCase: normalizedStudyCase,
    equipmentRows: applied.rows,
    results,
    controlRows: applied.controlRows,
    warnings: applied.warnings,
  };
}

export function buildLoadFlowStudyPackage({
  projectName = '',
  studyCase = {},
  rows = [],
  equipmentRows = [],
  results = {},
  controlRows = [],
  warnings = [],
  generatedAt = '',
} = {}) {
  const normalizedStudyCase = normalizeLoadFlowStudyCase(studyCase);
  const normalizedRows = asArray(equipmentRows).length
    ? asArray(equipmentRows).map(row => row.rowType === 'branch' ? normalizeBranchRow(row) : normalizeBusRow(row))
    : asArray(rows).map(row => row.rowType === 'branch' ? normalizeBranchRow(row) : normalizeBusRow(row));
  const phaseRows = buildPhaseRows(results, normalizedStudyCase);
  const voltageViolationRows = buildVoltageViolationRows(phaseRows, normalizedStudyCase);
  const unbalanceRows = normalizedStudyCase.mode === 'perPhase' ? buildUnbalanceRows(phaseRows) : [];
  const packageWarnings = [
    ...asArray(warnings),
    ...asArray(results.warnings).map(message => ({ severity: 'warning', code: 'load-flow-warning', message })),
  ];
  if (results.converged === false) {
    packageWarnings.push({ severity: 'error', code: 'not-converged', message: 'Load-flow study case did not converge.' });
  }
  if (normalizedStudyCase.openPhase.enabled) {
    packageWarnings.push({ severity: 'warning', code: 'open-phase-enabled', message: 'Open-phase screening is enabled; review results as contingency output.' });
  }
  const summary = summarizePackage(results, phaseRows, voltageViolationRows, unbalanceRows, normalizedRows, controlRows);
  return {
    version: LOAD_FLOW_STUDY_CASE_VERSION,
    generatedAt: generatedAt || new Date().toISOString(),
    projectName: projectName || 'Untitled Project',
    studyCase: normalizedStudyCase,
    equipmentRows: normalizedRows,
    results,
    phaseRows,
    controlRows: asArray(controlRows),
    voltageViolationRows,
    unbalanceRows,
    warnings: packageWarnings,
    assumptions: [
      'Load-flow study cases reuse the existing CableTrayRoute Newton-Raphson load-flow engine.',
      'Per-phase mode is deterministic screening using separate phase solves, not a full phase-coupled neutral/sequence model.',
      'Control rows are applied as explicit pre-run modifiers and do not automatically optimize settings.',
    ],
    summary,
  };
}

export function renderLoadFlowStudyHTML(pkg = {}) {
  const phaseRows = asArray(pkg.phaseRows);
  const violations = asArray(pkg.voltageViolationRows);
  const unbalance = asArray(pkg.unbalanceRows);
  return `<section class="report-section" id="rpt-load-flow-study">
  <h2>Load Flow Study Basis</h2>
  <p class="report-note">Auditable load-flow case with phase/load/control assumptions and voltage/unbalance screening output.</p>
  <dl class="report-dl">
    <dt>Mode</dt><dd>${esc(pkg.studyCase?.mode || 'balanced')}</dd>
    <dt>Converged</dt><dd>${esc(pkg.summary?.converged ? 'yes' : 'no')}</dd>
    <dt>Voltage Violations</dt><dd>${esc(pkg.summary?.voltageViolationCount || 0)}</dd>
    <dt>Voltage Warnings</dt><dd>${esc(pkg.summary?.voltageWarningCount || 0)}</dd>
    <dt>Unbalance Issues</dt><dd>${esc((pkg.summary?.unbalanceFailCount || 0) + (pkg.summary?.unbalanceWarnCount || 0))}</dd>
  </dl>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Bus</th><th>Phase</th><th>Vm</th><th>Angle</th><th>Voltage kV</th><th>Load kW</th><th>Generation kW</th><th>Status</th></tr></thead>
    <tbody>${phaseRows.length ? phaseRows.map(row => `<tr>
      <td>${esc(row.busTag || row.busId)}</td>
      <td>${esc(row.phase)}</td>
      <td>${esc(row.Vm)}</td>
      <td>${esc(row.Va)}</td>
      <td>${esc(row.voltageKV)}</td>
      <td>${esc(row.loadKw)}</td>
      <td>${esc(row.generationKw)}</td>
      <td>${esc(row.status)}</td>
    </tr>`).join('') : '<tr><td colspan="8">No load-flow rows.</td></tr>'}</tbody>
  </table>
  </div>
  ${violations.length ? `<h3>Voltage Exceptions</h3><ul>${violations.map(row => `<li>${esc(row.busTag)} ${esc(row.phase)}: ${esc(row.Vm)} pu (${esc(row.status)})</li>`).join('')}</ul>` : ''}
  ${unbalance.length ? `<h3>Unbalance</h3><ul>${unbalance.map(row => `<li>${esc(row.busTag)}: ${esc(row.voltageUnbalancePct)}% (${esc(row.status)})</li>`).join('')}</ul>` : ''}
</section>`;
}

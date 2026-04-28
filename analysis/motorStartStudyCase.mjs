export const MOTOR_START_STUDY_CASE_VERSION = 'motor-start-study-case-v1';

const SOURCE_BASIS = new Set(['oneLine', 'default', 'manual', 'savedLoadFlow']);
const SOURCE_CONDITIONS = new Set(['utility', 'generator', 'weakGrid', 'emergency']);
const REPORT_PRESETS = new Set(['summary', 'sequence', 'fullStudy']);
const STARTER_TYPES = new Set(['dol', 'vfd', 'soft_starter', 'wye_delta', 'autotransformer']);
const EVENT_ACTIONS = new Set(['start', 'stop', 'loadStep', 'starterTransition']);

const SOURCE_IMPEDANCE_OHM = {
  utility: 0.025,
  generator: 0.075,
  weakGrid: 0.12,
  emergency: 0.09,
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parseNumber(value, fallback = 0) {
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

function round(value, digits = 3) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const factor = 10 ** digits;
  return Math.round(num * factor) / factor;
}

function normalizeStarterType(value = 'dol') {
  const type = String(value || 'dol').trim().toLowerCase().replace(/[-\s]/g, '_');
  if (!STARTER_TYPES.has(type)) throw new Error(`Unsupported motor starter type: ${type}`);
  return type;
}

function normalizeEventAction(value = 'start') {
  const action = String(value || 'start').trim();
  if (!EVENT_ACTIONS.has(action)) throw new Error(`Unsupported motor-start event action: ${action}`);
  return action;
}

function parseCurve(value, fallback) {
  const source = value || fallback;
  const points = [];
  if (Array.isArray(source)) {
    source.forEach(point => {
      if (Array.isArray(point)) points.push({ speedPct: parseNumber(point[0], 0), torquePct: parseNumber(point[1], 0) });
      else if (typeof point === 'object') points.push({ speedPct: parseNumber(point.speedPct ?? point.speed, 0), torquePct: parseNumber(point.torquePct ?? point.torque, 0) });
      else if (typeof point === 'string') {
        const [speed, torque] = point.split(':');
        points.push({ speedPct: parseNumber(speed, 0), torquePct: parseNumber(torque, 0) });
      }
    });
  } else {
    String(source || '').split(/[,\s]+/).forEach(token => {
      if (!token) return;
      const [speed, torque] = token.split(':');
      points.push({ speedPct: parseNumber(speed, 0), torquePct: parseNumber(torque, 0) });
    });
  }
  const normalized = points
    .filter(point => Number.isFinite(point.speedPct) && Number.isFinite(point.torquePct))
    .map(point => ({
      speedPct: Math.max(0, Math.min(100, point.speedPct)),
      torquePct: Math.max(0, point.torquePct),
    }))
    .sort((a, b) => a.speedPct - b.speedPct);
  return normalized.length ? normalized : parseCurve(fallback, '');
}

function curveToString(points = []) {
  return asArray(points).map(point => `${round(point.speedPct, 1)}:${round(point.torquePct, 1)}`).join(' ');
}

function interpolateCurve(points = [], speedPct = 0) {
  const curve = asArray(points);
  if (!curve.length) return 0;
  const speed = Math.max(0, Math.min(100, speedPct));
  let lower = curve[0];
  let upper = curve[curve.length - 1];
  for (let i = 0; i < curve.length - 1; i += 1) {
    if (speed >= curve[i].speedPct && speed <= curve[i + 1].speedPct) {
      lower = curve[i];
      upper = curve[i + 1];
      break;
    }
  }
  const span = upper.speedPct - lower.speedPct || 1;
  const ratio = (speed - lower.speedPct) / span;
  return lower.torquePct + (upper.torquePct - lower.torquePct) * ratio;
}

function componentTag(component = {}) {
  return component.tag || component.label || component.name || component.ref || component.id || '';
}

function isMotorComponent(component = {}) {
  const type = String(component.type || '').toLowerCase();
  const subtype = String(component.subtype || '').toLowerCase();
  return type === 'motor'
    || type === 'motor_load'
    || subtype === 'motor'
    || subtype === 'motor_load'
    || component.motor === true;
}

function oneLineComponents(oneLine = {}) {
  const sheets = asArray(oneLine.sheets);
  if (sheets.length) return sheets.flatMap(sheet => asArray(sheet.components));
  return asArray(oneLine.components || oneLine);
}

function sourceImpedance(studyCase = {}) {
  if (studyCase.sourceBasis === 'manual') {
    return Math.max(0, parseNumber(studyCase.manualSourceImpedanceOhm, SOURCE_IMPEDANCE_OHM[studyCase.sourceCondition]));
  }
  return SOURCE_IMPEDANCE_OHM[studyCase.sourceCondition] || SOURCE_IMPEDANCE_OHM.utility;
}

function fullLoadCurrent(row = {}) {
  if (row.flaA > 0) return row.flaA;
  return (row.hp * 746) / (Math.sqrt(3) * row.voltageV * row.powerFactor * row.efficiency || 1);
}

function starterCurrent(row = {}, elapsedSec = 0, event = {}) {
  const starterType = normalizeStarterType(event.starterOverride || row.starterType);
  const ifl = fullLoadCurrent(row);
  const ilr = ifl * row.lockedRotorMultiplier;
  if (starterType === 'vfd') return ifl * row.currentLimitPu;
  if (starterType === 'soft_starter') {
    const ramp = Math.max(0.1, row.rampTimeSec);
    const rampFrac = Math.min(Math.max(elapsedSec, 0) / ramp, 1);
    const voltagePu = row.initialVoltagePu + (1 - row.initialVoltagePu) * rampFrac;
    return ilr * voltagePu * voltagePu;
  }
  if (starterType === 'wye_delta') return elapsedSec < row.wyeDeltaTransitionSec ? ilr / 3 : ilr;
  if (starterType === 'autotransformer') return ilr * row.autotransformerTap * row.autotransformerTap;
  return ilr;
}

function estimateAccelerationTime(row = {}, studyCase = {}) {
  if (row.starterType === 'vfd') return Math.max(row.rampTimeSec, 1);
  const inertiaFactor = Math.max(0.25, row.inertiaLbFt2 / 10);
  const torqueMargin = estimateTorqueMargin(row, 1);
  const torqueFactor = torqueMargin <= 0 ? 4 : Math.min(3, Math.max(0.5, 100 / torqueMargin));
  const starterFactor = row.starterType === 'soft_starter' ? 1.25
    : row.starterType === 'wye_delta' ? 1.1
      : row.starterType === 'autotransformer' ? 1.15
        : 1;
  return Math.min(studyCase.simulationDurationSec, Math.max(0.5, round(inertiaFactor * torqueFactor * starterFactor, 2)));
}

function estimateTorqueMargin(row = {}, voltagePu = 1, loadStepPct = 100) {
  const speedPct = 80;
  const motorTorque = interpolateCurve(row.motorTorqueCurvePoints, speedPct) * voltagePu * voltagePu;
  const loadTorque = interpolateCurve(row.loadTorqueCurvePoints, speedPct) * (loadStepPct / 100);
  return round(motorTorque - loadTorque, 2);
}

export function normalizeMotorStartStudyCase(input = {}) {
  const raw = asObject(input);
  const sourceBasis = String(raw.sourceBasis || 'oneLine').trim();
  if (!SOURCE_BASIS.has(sourceBasis)) throw new Error(`Unsupported motor-start source basis: ${sourceBasis}`);
  const sourceCondition = String(raw.sourceCondition || 'utility').trim();
  if (!SOURCE_CONDITIONS.has(sourceCondition)) throw new Error(`Unsupported motor-start source condition: ${sourceCondition}`);
  const reportPreset = String(raw.reportPreset || 'summary').trim();
  if (!REPORT_PRESETS.has(reportPreset)) throw new Error(`Unsupported motor-start report preset: ${reportPreset}`);
  const voltageLimits = asObject(raw.voltageLimits);
  const includeControls = asObject(raw.includeControls);
  const timeStepSec = Math.max(0.02, parseNumber(raw.timeStepSec, 0.25));
  const simulationDurationSec = Math.max(timeStepSec, parseNumber(raw.simulationDurationSec, 30));
  return {
    sourceBasis,
    sourceCondition,
    manualSourceImpedanceOhm: round(parseNumber(raw.manualSourceImpedanceOhm, SOURCE_IMPEDANCE_OHM[sourceCondition]), 5),
    voltageLimits: {
      startMinPu: parseNumber(voltageLimits.startMinPu ?? raw.startMinVoltagePu, 0.8),
      runMinPu: parseNumber(voltageLimits.runMinPu ?? raw.runMinVoltagePu, 0.95),
      warningMarginPu: Math.max(0, parseNumber(voltageLimits.warningMarginPu ?? raw.warningMarginPu, 0.03)),
    },
    maxAccelerationSec: Math.max(0.1, parseNumber(raw.maxAccelerationSec, 20)),
    simulationDurationSec,
    timeStepSec,
    includeControls: {
      capacitors: parseBool(includeControls.capacitors ?? raw.includeCapacitors, false),
      generatorAvr: parseBool(includeControls.generatorAvr ?? raw.includeGeneratorAvr, true),
      transformerTaps: parseBool(includeControls.transformerTaps ?? raw.includeTransformerTaps, false),
      regulators: parseBool(includeControls.regulators ?? raw.includeRegulators, false),
    },
    reportPreset,
    notes: String(raw.notes || '').trim(),
  };
}

export function normalizeMotorStartMotorRow(row = {}) {
  const input = asObject(row);
  const props = asObject(input.props);
  const id = String(input.id || input.elementId || input.motorId || props.id || '').trim();
  const hpRaw = parseNumber(input.hp ?? input.rating ?? props.hp ?? props.rating, 0);
  const kw = parseNumber(input.kw ?? input.kW ?? props.kw ?? props.kW, hpRaw ? hpRaw * 0.746 : 0);
  const hp = hpRaw || (kw ? kw / 0.746 : 0);
  const defaultedFields = [];
  const missingFields = [];
  const voltageV = parseNumber(input.voltageV ?? input.voltage ?? input.volts ?? props.voltage ?? props.volts, 480);
  if (!input.voltageV && !input.voltage && !input.volts && !props.voltage && !props.volts) defaultedFields.push('voltageV');
  if (!hp) missingFields.push('hp');
  const starterType = normalizeStarterType(input.starterType || input.starter_type || props.starterType || props.starter_type || 'dol');
  const loadTorqueCurvePoints = parseCurve(input.loadTorqueCurvePoints || input.loadTorqueCurve || input.load_torque_curve || props.loadTorqueCurve || props.load_torque_curve, '0:10 50:60 100:100');
  const motorTorqueCurvePoints = parseCurve(input.motorTorqueCurvePoints || input.motorTorqueCurve || props.motorTorqueCurve, '0:180 50:160 80:130 100:100');
  const normalized = {
    id: id || slug(componentTag(input) || 'motor'),
    elementId: id || slug(componentTag(input) || 'motor'),
    tag: String(input.tag || input.elementTag || componentTag(input) || id || 'Motor'),
    busId: String(input.busId || input.bus || props.busId || props.bus || input.connectedBus || '').trim(),
    enabled: input.enabled !== false,
    hp: round(hp, 3),
    kw: round(kw, 3),
    voltageV,
    flaA: parseNumber(input.flaA ?? input.fla ?? props.flaA ?? props.fla, 0),
    lockedRotorMultiplier: Math.max(0.1, parseNumber(input.lockedRotorMultiplier ?? input.inrushMultiple ?? input.lr_current_pu ?? props.inrushMultiple ?? props.lr_current_pu, 6)),
    powerFactor: Math.min(1, Math.max(0.01, parseNumber(input.powerFactor ?? input.pf ?? props.powerFactor ?? props.pf, 0.9))),
    efficiency: Math.min(1, Math.max(0.01, parseNumber(input.efficiency ?? input.eff ?? props.efficiency ?? props.eff, 0.9))),
    inertiaLbFt2: Math.max(0.01, parseNumber(input.inertiaLbFt2 ?? input.inertia ?? props.inertia, 10)),
    speedRpm: Math.max(1, parseNumber(input.speedRpm ?? input.speed ?? props.speed, 1800)),
    starterType,
    currentLimitPu: Math.max(0.1, parseNumber(input.currentLimitPu ?? input.vfdCurrentLimitPu ?? input.vfd_current_limit_pu ?? props.vfd_current_limit_pu, 1.1)),
    rampTimeSec: Math.max(0.1, parseNumber(input.rampTimeSec ?? input.ramp_time_s ?? props.ramp_time_s, 10)),
    initialVoltagePu: Math.min(1, Math.max(0.05, parseNumber(input.initialVoltagePu ?? input.initial_voltage_pu ?? props.initial_voltage_pu, 0.3))),
    autotransformerTap: Math.min(1, Math.max(0.05, parseNumber(input.autotransformerTap ?? input.autotransformer_tap ?? props.autotransformer_tap, 0.65))),
    wyeDeltaTransitionSec: Math.max(0, parseNumber(input.wyeDeltaTransitionSec ?? input.wye_delta_switch_time_s ?? props.wye_delta_switch_time_s, 5)),
    loadStepPct: Math.max(0, parseNumber(input.loadStepPct ?? props.loadStepPct, 100)),
    loadTorqueCurve: curveToString(loadTorqueCurvePoints),
    motorTorqueCurve: curveToString(motorTorqueCurvePoints),
    loadTorqueCurvePoints,
    motorTorqueCurvePoints,
    notes: String(input.notes || props.notes || '').trim(),
    defaultedFields,
    missingFields,
  };
  if (!normalized.flaA && normalized.hp) normalized.flaA = round(fullLoadCurrent(normalized), 3);
  if (!normalized.busId) defaultedFields.push('busId');
  return normalized;
}

export function buildMotorStartEquipmentRows({ oneLine = {}, existingRows = [] } = {}) {
  const existing = new Map(asArray(existingRows).map(row => [String(row.elementId || row.id || '').toLowerCase(), row]));
  const components = oneLineComponents(oneLine).filter(isMotorComponent);
  return components.map(component => {
    const existingRow = existing.get(String(component.id || '').toLowerCase()) || {};
    return normalizeMotorStartMotorRow({
      ...component,
      ...existingRow,
      props: { ...asObject(component.props), ...asObject(existingRow.props) },
    });
  });
}

function normalizeSequenceEvent(event = {}, index = 0) {
  const raw = asObject(event);
  const motorId = String(raw.motorId || raw.elementId || raw.id || '').trim();
  return {
    id: String(raw.id || `evt-${index + 1}`).trim(),
    order: parseNumber(raw.order, index + 1),
    timeSec: Math.max(0, parseNumber(raw.timeSec ?? raw.time, index * 5)),
    action: normalizeEventAction(raw.action || 'start'),
    motorId,
    starterOverride: raw.starterOverride ? normalizeStarterType(raw.starterOverride) : '',
    loadStepPct: Math.max(0, parseNumber(raw.loadStepPct, 100)),
    sourceConditionOverride: raw.sourceConditionOverride && SOURCE_CONDITIONS.has(String(raw.sourceConditionOverride))
      ? String(raw.sourceConditionOverride)
      : '',
    compensationState: {
      capacitors: parseBool(raw.compensationState?.capacitors ?? raw.capacitors, false),
    },
    notes: String(raw.notes || '').trim(),
  };
}

export function buildMotorStartSequenceEvents(rows = [], options = {}) {
  const explicit = asArray(options.sequenceEvents || options.events);
  if (explicit.length) return explicit.map(normalizeSequenceEvent).sort((a, b) => a.timeSec - b.timeSec || a.order - b.order);
  const spacingSec = Math.max(0, parseNumber(options.spacingSec, 5));
  return asArray(rows)
    .filter(row => row && row.enabled !== false)
    .map((row, index) => normalizeSequenceEvent({
      id: `start-${row.id || index + 1}`,
      order: index + 1,
      timeSec: index * spacingSec,
      action: 'start',
      motorId: row.id || row.elementId,
      loadStepPct: row.loadStepPct || 100,
    }, index));
}

function controlMultiplier(studyCase = {}, event = {}) {
  let multiplier = 1;
  if (studyCase.includeControls.capacitors || event.compensationState?.capacitors) multiplier *= 0.92;
  if (studyCase.includeControls.generatorAvr && studyCase.sourceCondition !== 'utility') multiplier *= 0.95;
  return multiplier;
}

function summarizeMotorStart({ motorRows = [], sequenceEvents = [], timeSeriesRows = [], worstCaseRows = [], warnings = [] } = {}) {
  const minVoltagePu = timeSeriesRows.length ? Math.min(...timeSeriesRows.map(row => row.voltagePu)) : 1;
  const failCount = worstCaseRows.filter(row => row.status === 'fail' || row.status === 'stalled').length;
  const warnCount = worstCaseRows.filter(row => row.status === 'warn').length;
  return {
    motorCount: asArray(motorRows).filter(row => row.enabled !== false).length,
    eventCount: asArray(sequenceEvents).length,
    timeSeriesCount: asArray(timeSeriesRows).length,
    worstCaseCount: asArray(worstCaseRows).length,
    minVoltagePu: round(minVoltagePu, 4),
    maxVoltageSagPct: round((1 - minVoltagePu) * 100, 2),
    failCount,
    warnCount,
    missingInputCount: asArray(motorRows).reduce((sum, row) => sum + asArray(row.missingFields).length, 0),
    defaultedInputCount: asArray(motorRows).reduce((sum, row) => sum + asArray(row.defaultedFields).length, 0),
    warningCount: asArray(warnings).length,
  };
}

export function runMotorStartStudyCase({ oneLine = {}, studyCase = {}, motorRows = [], sequenceEvents = [] } = {}) {
  const normalizedStudyCase = normalizeMotorStartStudyCase(studyCase);
  const rows = asArray(motorRows).length
    ? asArray(motorRows).map(normalizeMotorStartMotorRow)
    : buildMotorStartEquipmentRows({ oneLine });
  const events = buildMotorStartSequenceEvents(rows, { sequenceEvents });
  const rowMap = new Map(rows.map(row => [row.id, row]));
  const warnings = [];
  if (!rows.length) warnings.push({ severity: 'warning', code: 'no-motors', message: 'No motor rows are available for the motor-start study case.' });
  if (normalizedStudyCase.includeControls.transformerTaps || normalizedStudyCase.includeControls.regulators) {
    warnings.push({ severity: 'info', code: 'unsupported-controls', message: 'Transformer taps and regulator behavior are recorded as screening assumptions; v1 does not perform dynamic controller simulation.' });
  }
  if (normalizedStudyCase.sourceBasis === 'manual' && normalizedStudyCase.manualSourceImpedanceOhm <= 0) {
    warnings.push({ severity: 'warning', code: 'missing-source-impedance', message: 'Manual source basis selected without a positive source impedance.' });
  }

  const activeStarts = new Map();
  const loadSteps = new Map(rows.map(row => [row.id, row.loadStepPct || 100]));
  const timeSeriesRows = [];
  const duration = normalizedStudyCase.simulationDurationSec;
  const dt = normalizedStudyCase.timeStepSec;
  const sortedEvents = [...events].sort((a, b) => a.timeSec - b.timeSec || a.order - b.order);
  for (let time = 0; time <= duration + 1e-9; time += dt) {
    sortedEvents
      .filter(event => Math.abs(event.timeSec - time) < dt / 2 || (event.timeSec > time - dt && event.timeSec <= time))
      .forEach(event => {
        if (event.action === 'start' || event.action === 'starterTransition') activeStarts.set(event.motorId, { ...event, startedAt: event.timeSec });
        if (event.action === 'stop') activeStarts.delete(event.motorId);
        if (event.action === 'loadStep') loadSteps.set(event.motorId, event.loadStepPct);
      });
    let totalCurrentA = 0;
    let weightedVoltage = 0;
    let activeCount = 0;
    let minSpeedPct = 100;
    const activeMotorIds = [];
    activeStarts.forEach((event, motorId) => {
      const row = rowMap.get(motorId);
      if (!row || row.enabled === false) return;
      const accelTime = estimateAccelerationTime(row, normalizedStudyCase);
      const elapsed = Math.max(0, time - event.startedAt);
      if (elapsed > accelTime) return;
      const progress = Math.min(1, elapsed / Math.max(accelTime, dt));
      const slipFactor = Math.max(0.15, 1 - progress);
      const currentA = starterCurrent(row, elapsed, event) * slipFactor;
      totalCurrentA += currentA;
      weightedVoltage += row.voltageV * currentA;
      minSpeedPct = Math.min(minSpeedPct, progress * 100);
      activeCount += 1;
      activeMotorIds.push(row.id);
    });
    const nominalVoltage = totalCurrentA > 0 ? weightedVoltage / totalCurrentA : (rows[0]?.voltageV || 480);
    const sourceZ = sourceImpedance(normalizedStudyCase);
    const eventAtTime = sortedEvents.find(event => Math.abs(event.timeSec - time) < dt / 2) || {};
    const sagPct = nominalVoltage ? (totalCurrentA * sourceZ / nominalVoltage) * 100 * controlMultiplier(normalizedStudyCase, eventAtTime) : 0;
    const voltagePu = Math.max(0, 1 - sagPct / 100);
    timeSeriesRows.push({
      timeSec: round(time, 3),
      activeMotorIds,
      activeMotorCount: activeCount,
      totalStartingCurrentA: round(totalCurrentA, 2),
      totalStartingCurrentKA: round(totalCurrentA / 1000, 4),
      voltagePu: round(voltagePu, 4),
      voltageSagPct: round(Math.max(0, sagPct), 2),
      minSpeedPct: activeCount ? round(minSpeedPct, 2) : 100,
      sourceCondition: normalizedStudyCase.sourceCondition,
      status: voltagePu < normalizedStudyCase.voltageLimits.startMinPu ? 'fail'
        : voltagePu < normalizedStudyCase.voltageLimits.startMinPu + normalizedStudyCase.voltageLimits.warningMarginPu ? 'warn'
          : 'pass',
    });
  }

  const worstCaseRows = rows
    .filter(row => row.enabled !== false)
    .map(row => {
      const starts = events.filter(event => event.motorId === row.id && (event.action === 'start' || event.action === 'starterTransition'));
      const firstStart = starts[0] || { timeSec: 0, starterOverride: '' };
      const accelTime = estimateAccelerationTime(row, normalizedStudyCase);
      const series = timeSeriesRows.filter(point => point.activeMotorIds.includes(row.id));
      const minVoltagePu = series.length ? Math.min(...series.map(point => point.voltagePu)) : 1;
      const maxCurrentA = series.length ? Math.max(...series.map(point => point.totalStartingCurrentA)) : 0;
      const torqueMarginPct = estimateTorqueMargin(row, minVoltagePu, loadSteps.get(row.id) || row.loadStepPct || 100);
      const status = !row.hp || asArray(row.missingFields).length ? 'missingData'
        : torqueMarginPct <= 0 ? 'stalled'
          : minVoltagePu < normalizedStudyCase.voltageLimits.startMinPu || accelTime > normalizedStudyCase.maxAccelerationSec ? 'fail'
            : minVoltagePu < normalizedStudyCase.voltageLimits.startMinPu + normalizedStudyCase.voltageLimits.warningMarginPu ? 'warn'
              : 'pass';
      return {
        motorId: row.id,
        motorTag: row.tag,
        busId: row.busId,
        starterType: firstStart.starterOverride || row.starterType,
        startTimeSec: firstStart.timeSec,
        inrushKA: round((fullLoadCurrent(row) * row.lockedRotorMultiplier) / 1000, 4),
        maxStartingCurrentKA: round(starterCurrent(row, 0, firstStart) / 1000, 4),
        minVoltagePu: round(minVoltagePu, 4),
        voltageSagPct: round((1 - minVoltagePu) * 100, 2),
        accelTimeSec: round(accelTime, 2),
        torqueMarginPct,
        status,
        recommendation: status === 'pass' ? 'Motor-start screening passes the configured voltage and acceleration limits.'
          : status === 'warn' ? 'Review source impedance, start sequencing, or reduced-voltage starter settings.'
            : status === 'missingData' ? 'Complete missing motor horsepower, voltage, starter, and source data before release.'
              : status === 'stalled' ? 'Review motor torque, load torque, inertia, and starter settings; screening indicates insufficient acceleration margin.'
                : 'Reduce simultaneous starting impact, add source support, adjust starter controls, or stagger the start sequence.',
      };
    });

  if (worstCaseRows.some(row => row.status === 'fail')) warnings.push({ severity: 'warning', code: 'voltage-dip', message: 'One or more motor starts exceed the configured voltage-dip or acceleration limits.' });
  if (worstCaseRows.some(row => row.status === 'stalled')) warnings.push({ severity: 'warning', code: 'stalled-motor', message: 'One or more motor rows are stalled or have insufficient torque margin in the screening model.' });
  if (rows.some(row => asArray(row.missingFields).length)) warnings.push({ severity: 'warning', code: 'missing-motor-data', message: 'One or more motor rows are missing required motor data.' });

  return {
    studyCase: normalizedStudyCase,
    motorRows: rows,
    sequenceEvents: events,
    timeSeriesRows,
    worstCaseRows,
    warnings,
    summary: summarizeMotorStart({ motorRows: rows, sequenceEvents: events, timeSeriesRows, worstCaseRows, warnings }),
  };
}

function legacyWorstCaseRows(results = {}) {
  return Object.entries(asObject(results))
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([id, row]) => ({
      motorId: id,
      motorTag: id,
      busId: '',
      starterType: row.starterType || '',
      startTimeSec: 0,
      inrushKA: parseNumber(row.inrushKA, 0),
      maxStartingCurrentKA: parseNumber(row.inrushKA, 0),
      minVoltagePu: round(1 - parseNumber(row.voltageSagPct, 0) / 100, 4),
      voltageSagPct: parseNumber(row.voltageSagPct, 0),
      accelTimeSec: parseNumber(row.accelTime, 0),
      torqueMarginPct: 0,
      status: parseNumber(row.voltageSagPct, 0) > 20 ? 'warn' : 'pass',
      recommendation: 'Legacy motor-start result map; rerun with the Motor Start Study Case panel for auditable assumptions.',
    }));
}

export function buildMotorStartStudyPackage({
  projectName = '',
  studyCase = {},
  motorRows = [],
  sequenceEvents = [],
  results = {},
  generatedAt = '',
} = {}) {
  const resultObject = asObject(results);
  const hasPackagedRows = asArray(resultObject.timeSeriesRows).length || asArray(resultObject.worstCaseRows).length;
  const normalizedStudyCase = normalizeMotorStartStudyCase(resultObject.studyCase || studyCase);
  const rows = asArray(resultObject.motorRows).length
    ? asArray(resultObject.motorRows).map(normalizeMotorStartMotorRow)
    : asArray(motorRows).map(normalizeMotorStartMotorRow);
  const events = asArray(resultObject.sequenceEvents).length
    ? resultObject.sequenceEvents.map(normalizeSequenceEvent)
    : buildMotorStartSequenceEvents(rows, { sequenceEvents });
  const timeSeriesRows = hasPackagedRows ? asArray(resultObject.timeSeriesRows) : [];
  const worstCaseRows = hasPackagedRows ? asArray(resultObject.worstCaseRows) : legacyWorstCaseRows(resultObject);
  const warnings = [
    ...asArray(resultObject.warnings),
    ...(!hasPackagedRows && Object.keys(resultObject).length ? [{ severity: 'warning', code: 'legacy-results', message: 'Legacy motor-start results do not include study-case inputs or time-series rows.' }] : []),
  ];
  return {
    version: MOTOR_START_STUDY_CASE_VERSION,
    generatedAt: generatedAt || resultObject.generatedAt || new Date().toISOString(),
    projectName: projectName || resultObject.projectName || 'Untitled Project',
    studyCase: normalizedStudyCase,
    motorRows: rows,
    sequenceEvents: events,
    results: resultObject.results || resultObject,
    timeSeriesRows,
    worstCaseRows,
    warnings,
    assumptions: [
      'Motor-start results are deterministic local screening calculations based on simplified Thevenin voltage-dip and acceleration approximations.',
      'Sequence events aggregate starting current by timestep; v1 does not perform full electromagnetic transient or phase-coupled dynamic simulation.',
      'Transformer taps, regulators, generator AVR, and capacitor states are recorded as screening assumptions and require engineering verification.',
    ],
    summary: summarizeMotorStart({ motorRows: rows, sequenceEvents: events, timeSeriesRows, worstCaseRows, warnings }),
  };
}

export function renderMotorStartStudyHTML(pkg = {}) {
  const worstRows = asArray(pkg.worstCaseRows);
  const eventRows = asArray(pkg.sequenceEvents);
  return `<section class="report-section" id="rpt-motor-start-study">
  <h2>Motor Start Study Basis</h2>
  <p class="report-note">Sequence-of-events motor-start screening with visible source, starter, torque, and acceleration assumptions.</p>
  <dl class="report-dl">
    <dt>Motors</dt><dd>${esc(pkg.summary?.motorCount || 0)}</dd>
    <dt>Sequence Events</dt><dd>${esc(pkg.summary?.eventCount || 0)}</dd>
    <dt>Minimum Voltage</dt><dd>${esc(pkg.summary?.minVoltagePu || 1)} pu</dd>
    <dt>Max Sag</dt><dd>${esc(pkg.summary?.maxVoltageSagPct || 0)}%</dd>
    <dt>Warnings</dt><dd>${esc(pkg.summary?.warningCount || 0)}</dd>
  </dl>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Motor</th><th>Bus</th><th>Starter</th><th>Start Time</th><th>Inrush kA</th><th>Max Current kA</th><th>Min Voltage</th><th>Sag %</th><th>Accel Time</th><th>Torque Margin</th><th>Status</th><th>Recommendation</th></tr></thead>
    <tbody>${worstRows.length ? worstRows.map(row => `<tr>
      <td>${esc(row.motorTag || row.motorId)}</td>
      <td>${esc(row.busId)}</td>
      <td>${esc(row.starterType)}</td>
      <td>${esc(row.startTimeSec)}</td>
      <td>${esc(row.inrushKA)}</td>
      <td>${esc(row.maxStartingCurrentKA)}</td>
      <td>${esc(row.minVoltagePu)}</td>
      <td>${esc(row.voltageSagPct)}</td>
      <td>${esc(row.accelTimeSec)}</td>
      <td>${esc(row.torqueMarginPct)}</td>
      <td>${esc(row.status)}</td>
      <td>${esc(row.recommendation)}</td>
    </tr>`).join('') : '<tr><td colspan="12">No motor-start worst-case rows.</td></tr>'}</tbody>
  </table>
  </div>
  <h3>Sequence Events</h3>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Time</th><th>Action</th><th>Motor</th><th>Starter Override</th><th>Load Step</th><th>Notes</th></tr></thead>
    <tbody>${eventRows.length ? eventRows.map(row => `<tr>
      <td>${esc(row.timeSec)}</td>
      <td>${esc(row.action)}</td>
      <td>${esc(row.motorId)}</td>
      <td>${esc(row.starterOverride)}</td>
      <td>${esc(row.loadStepPct)}</td>
      <td>${esc(row.notes)}</td>
    </tr>`).join('') : '<tr><td colspan="6">No sequence events.</td></tr>'}</tbody>
  </table>
  </div>
</section>`;
}

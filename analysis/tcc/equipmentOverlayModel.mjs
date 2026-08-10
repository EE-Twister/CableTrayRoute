import conductorProperties from '../../conductorPropertiesData.mjs';

const CMIL_TO_MM2 = 0.000506707478;
const DEFAULT_INRUSH_MULTIPLE = 12;
export const DEFAULT_INRUSH_DURATION = 0.1;
const CABLE_TIME_POINTS = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
const TRANSFORMER_DAMAGE_TEMPLATE = [
  { multiple: 1.5, time: 600 },
  { multiple: 2, time: 300 },
  { multiple: 4, time: 30 },
  { multiple: 6, time: 10 },
  { multiple: 12, time: 2 },
  { multiple: 25, time: 0.5 },
  { multiple: 40, time: 0.1 }
];
const MOTOR_START_PRETIME_RATIO = 0.2;
const MOTOR_START_POSTTIME_RATIO = 1.1;
const MOTOR_START_MIN_PRETIME = 0.01;
const K_CONSTANTS = {
  copper: { 60: 103, 75: 118, 90: 143 },
  aluminum: { 60: 75, 75: 87, 90: 99 }
};

export function componentLabel(comp) {
  if (!comp) return 'Component';
  const label = getComponentValue(comp, 'label');
  const name = getComponentValue(comp, 'name');
  const subtype = getComponentValue(comp, 'subtype');
  const type = getComponentValue(comp, 'type');
  return label || name || subtype || type || comp.id || 'Component';
}

export function getComponentVendor(comp) {
  if (!comp) return '';
  const keys = ['manufacturer', 'vendor', 'maker', 'brand'];
  for (const key of keys) {
    const value = getComponentValue(comp, key);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return '';
}

export function mergeOverrides(base, extra) {
  const a = base && typeof base === 'object' ? base : {};
  const b = extra && typeof extra === 'object' ? extra : {};
  return { ...a, ...b };
}

export function parsePhases(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim().toUpperCase()).filter(Boolean);
  if (typeof value === 'number') {
    if (value === 3) return ['A', 'B', 'C'];
    if (value === 2) return ['A', 'B'];
    if (value === 1) return ['A'];
    return [];
  }
  if (typeof value === 'string') {
    if (/^\d+$/.test(value.trim())) return parsePhases(parseInt(value, 10));
    return value.split(/[\s,]+/).map(v => v.trim().toUpperCase()).filter(Boolean);
  }
  return [];
}

export function inferVoltage(comp) {
  const keys = ['voltage', 'volts', 'volts_secondary', 'volts_lv', 'volts_primary', 'volts_hv', 'prefault_voltage', 'baseKV', 'kV'];
  for (const key of keys) {
    const raw = getComponentValue(comp, key);
    // kV-keyed fields are scaled only when the value does not already carry a
    // unit suffix, avoiding a second 1000x conversion for values like 13.8 kV.
    const volts = parseVoltageFieldValue(raw, key);
    if (!Number.isFinite(volts) || volts <= 0) continue;
    return volts;
  }
  return null;
}

export function parseVoltageFieldValue(raw, key = '') {
  const num = parseNumeric(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  const rawText = typeof raw === 'string' ? raw : '';
  if (String(key).toLowerCase().includes('kv') && !/\b(kv|v)\b/i.test(rawText)) {
    return num * 1000;
  }
  return num;
}

function getComponentSearchText(comp, keys) {
  return keys
    .map(key => getComponentValue(comp, key))
    .filter(value => value !== undefined && value !== null && value !== '')
    .map(value => String(value))
    .join('\n');
}

export function getTransformerVoltageCandidates(transformer) {
  const values = [];
  const explicitKeys = [
    'volts_hv',
    'volts_lv',
    'volts_tv',
    'volts_primary',
    'volts_secondary',
    'primary_voltage',
    'secondary_voltage',
    'voltage',
    'volts',
    'baseKV',
    'kV'
  ];
  explicitKeys.forEach(key => {
    const raw = getComponentValue(transformer, key);
    const volts = parseVoltageFieldValue(raw, key);
    if (Number.isFinite(volts) && volts > 0) values.push(volts);
  });
  const text = getComponentSearchText(transformer, ['label', 'name', 'description']);
  [...text.matchAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(kv|v)\b/gi)].forEach(match => {
    const numeric = Number(String(match[1]).replace(/,/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    const unit = String(match[2]).toLowerCase();
    values.push(unit === 'kv' ? numeric * 1000 : numeric);
  });
  return [...new Set(values.map(value => Math.round(value * 1000) / 1000))]
    .filter(value => Number.isFinite(value) && value > 0);
}

export function extractTransformerLabelRatings(transformer) {
  const text = getComponentSearchText(transformer, ['label', 'name', 'description']);
  const kvaMatch = text.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(mva|kva)\b/i);
  const kva = kvaMatch
    ? Number(String(kvaMatch[1]).replace(/,/g, '')) * (kvaMatch[2].toLowerCase() === 'mva' ? 1000 : 1)
    : null;
  const voltages = getTransformerVoltageCandidates(transformer);
  return { kva, voltages };
}

export function computeTransformerInrush(transformer, referenceVoltage, refPhases = 3) {
  const operating = resolveTransformerOperatingPoint(transformer, referenceVoltage, refPhases);
  if (!operating) return null;
  const multiple = resolveInrushMultipleInfo(transformer);
  const duration = resolveInrushDurationInfo(transformer);
  return {
    current: operating.fla * multiple.value,
    duration: duration.value,
    multiple: multiple.value,
    multipleEstimated: multiple.estimated,
    durationEstimated: duration.estimated,
    fla: operating.fla,
    operating
  };
}

function resolveInrushMultipleInfo(comp) {
  const keys = ['inrush_multiple', 'inrushMultiple', 'inrush_multiplier', 'xfmr_inrush_multiple', 'xfmrInrushMultiple'];
  for (const key of keys) {
    const val = parseNumeric(getComponentValue(comp, key));
    if (Number.isFinite(val) && val > 0) return { value: val, estimated: false, sourceKey: key };
  }
  return { value: DEFAULT_INRUSH_MULTIPLE, estimated: true, sourceKey: '' };
}

function resolveInrushDurationInfo(comp) {
  const keys = ['inrush_duration', 'inrushDuration', 'xfmr_inrush_duration'];
  for (const key of keys) {
    const val = parseNumeric(getComponentValue(comp, key));
    if (Number.isFinite(val) && val > 0) return { value: val, estimated: false, sourceKey: key };
  }
  return { value: DEFAULT_INRUSH_DURATION, estimated: true, sourceKey: '' };
}

function isConductorSegmentComponent(comp) {
  const type = String(comp?.type || '').toLowerCase();
  const subtype = String(comp?.subtype || '').toLowerCase();
  return type === 'cable' || type === 'busway' || subtype === 'cable' || subtype === 'busway';
}

export function resolveCableInfo(source, target, conn) {
  if (isConductorSegmentComponent(source)) {
    if (source.cable) return source.cable;
    if (source.props && source.props.cable) return source.props.cable;
    if (source.props && typeof source.props === 'object') return source.props;
  }
  if (isConductorSegmentComponent(target)) {
    if (target.cable) return target.cable;
    if (target.props && target.props.cable) return target.props.cable;
    if (target.props && typeof target.props === 'object') return target.props;
  }
  if (conn?.cable) return conn.cable;
  return null;
}

export function normalizeConductorSize(size) {
  if (!size) return null;
  let normalized = String(size).trim().toUpperCase();
  if (!normalized) return null;
  normalized = normalized.replace(/MCM$/, 'KCMIL');
  if (/^#?\d+\s*AWG$/.test(normalized)) {
    normalized = normalized.startsWith('#') ? normalized : `#${normalized.replace(/\s*AWG$/, '')} AWG`;
  } else if (/^\d+\s*KCMIL$/.test(normalized)) {
    normalized = normalized.replace(/\s*KCMIL$/, ' kcmil');
  } else if (/^\d+\/0$/.test(normalized)) {
    normalized = `${normalized} AWG`;
  } else if (/^#\d+$/.test(normalized)) {
    normalized = `${normalized} AWG`;
  } else if (/^\d+$/.test(normalized)) {
    const num = Number(normalized);
    normalized = num >= 250 ? `${num} kcmil` : `#${normalized} AWG`;
  }
  return normalized;
}

function areaFromSize(size) {
  const normalized = normalizeConductorSize(size);
  if (!normalized) return null;
  const data = conductorProperties[normalized];
  if (data?.area_cm) return data.area_cm;
  return null;
}

export function parseConductorsDescriptor(descriptor) {
  if (!descriptor) return { count: null, size: null };
  const text = String(descriptor).trim();
  const match = text.match(/^(\d+)\s*[Xx\-]\s*(.+)$/);
  if (match) {
    return { count: Number(match[1]), size: match[2].trim() };
  }
  return { count: null, size: null };
}

function getKConstant(material, insulation) {
  const mat = String(material || '').toLowerCase();
  const table = mat.startsWith('al') ? K_CONSTANTS.aluminum : K_CONSTANTS.copper;
  const rating = insulation >= 90 ? 90 : insulation >= 75 ? 75 : 60;
  return table[rating];
}

export function buildCableCurve(cable, phases = 3) {
  const descriptor = parseConductorsDescriptor(cable.conductors);
  const size = cable.conductor_size || cable.conductorSize || cable.size_awg_kcmil || cable.conductor_size_awg_kcmil || descriptor.size || cable.size || cable.awg;
  const baseArea = areaFromSize(size);
  if (!baseArea) return null;
  const parallel = Number(cable.parallel_count || cable.parallel_sets || cable.parallelSets || cable.parallels || cable.parallel) || 1;
  const perPhase = Number(cable.conductors_per_phase || cable.conductorsPerPhase) || null;
  const phaseCount = phases || 3;
  const inferredPerPhase = perPhase || (descriptor.count ? Math.max(1, Math.round(descriptor.count / phaseCount)) : 1);
  const effectiveArea = baseArea * inferredPerPhase * parallel;
  const material = cable.conductor_material || cable.conductorMaterial || cable.material || 'copper';
  const insulation = Number(cable.insulation_rating || cable.temperature_rating || cable.temp_rating_c || cable.insulation_temp_c || 90);
  const k = getKConstant(material, insulation);
  if (!k) return null;
  const areaMm2 = effectiveArea * CMIL_TO_MM2;
  const curve = CABLE_TIME_POINTS.map(time => ({
    time,
    current: (k * areaMm2) / Math.sqrt(time)
  })).filter(point => Number.isFinite(point.current) && point.current > 0);
  return {
    curve,
    ampacity: Number(cable.ampacity || cable.calc_ampacity || cable.thermal_rating_ampacity || cable.rating || '') || null,
    materialEstimated: !(cable.conductor_material || cable.conductorMaterial || cable.material),
    insulationEstimated: !(cable.insulation_rating || cable.temperature_rating || cable.temp_rating_c || cable.insulation_temp_c),
    conductorsPerPhase: inferredPerPhase,
    parallel
  };
}

export function buildTransformerDamageCurve(transformer, referenceVoltage, refPhases = 3) {
  const operating = resolveTransformerOperatingPoint(transformer, referenceVoltage, refPhases);
  if (!operating) return null;
  const points = TRANSFORMER_DAMAGE_TEMPLATE.map(({ multiple, time }) => ({
    time,
    current: operating.fla * multiple
  })).filter(point => Number.isFinite(point.current) && point.current > 0 && Number.isFinite(point.time) && point.time > 0);
  if (!points.length) return null;
  return {
    curve: points.sort((a, b) => a.time - b.time),
    fla: operating.fla,
    operating
  };
}

export function resolveTransformerOperatingPoint(transformer, referenceVoltage, refPhases = 3) {
  const sides = [];
  const sideDefs = [
    { kvaKey: 'kva_hv', voltsKey: 'volts_hv', label: 'HV' },
    { kvaKey: 'kva_lv', voltsKey: 'volts_lv', label: 'LV' },
    { kvaKey: 'kva_tv', voltsKey: 'volts_tv', label: 'Tertiary' },
    { kvaKey: 'kva_primary', voltsKey: 'volts_primary', label: 'Primary' },
    { kvaKey: 'kva_secondary', voltsKey: 'volts_secondary', label: 'Secondary' }
  ];
  sideDefs.forEach(({ kvaKey, voltsKey, label }) => {
    const kva = getNumericValue(transformer, kvaKey);
    const volts = parseVoltageFieldValue(getComponentValue(transformer, voltsKey), voltsKey);
    if (!Number.isFinite(kva) || !Number.isFinite(volts)) return;
    sides.push({ kva, volts, label, source: 'Project data' });
  });
  if (!sides.length) {
    const labelRatings = extractTransformerLabelRatings(transformer);
    if (Number.isFinite(labelRatings.kva) && labelRatings.kva > 0 && labelRatings.voltages.length) {
      const sortedVoltages = [...labelRatings.voltages].sort((a, b) => b - a);
      sortedVoltages.forEach((volts, index) => {
        const label = index === 0
          ? 'HV'
          : index === sortedVoltages.length - 1
            ? 'LV'
            : `Winding ${index + 1}`;
        sides.push({ kva: labelRatings.kva, volts, label, source: 'Component label' });
      });
    }
  }
  if (!sides.length) {
    const kva = getNumericValue(transformer, ['kva', 'kva_base']);
    let volts = parseVoltageFieldValue(getComponentValue(transformer, 'volts_secondary'), 'volts_secondary')
      ?? parseVoltageFieldValue(getComponentValue(transformer, 'volts_primary'), 'volts_primary')
      ?? parseVoltageFieldValue(getComponentValue(transformer, 'voltage'), 'voltage')
      ?? parseVoltageFieldValue(getComponentValue(transformer, 'volts'), 'volts');
    if (!Number.isFinite(volts)) {
      volts = parseVoltageFieldValue(getComponentValue(transformer, 'baseKV'), 'baseKV')
        ?? parseVoltageFieldValue(getComponentValue(transformer, 'kV'), 'kV');
    }
    if (Number.isFinite(kva) && Number.isFinite(volts)) {
      sides.push({ kva, volts, label: 'Secondary', source: 'Project data' });
    }
  }
  if (!sides.length) {
    const mva = getNumericValue(transformer, 'mva');
    const volts = parseVoltageFieldValue(getComponentValue(transformer, 'volts_secondary'), 'volts_secondary')
      ?? parseVoltageFieldValue(getComponentValue(transformer, 'volts_primary'), 'volts_primary')
      ?? parseVoltageFieldValue(getComponentValue(transformer, 'voltage'), 'voltage')
      ?? parseVoltageFieldValue(getComponentValue(transformer, 'volts'), 'volts');
    if (Number.isFinite(mva) && Number.isFinite(volts)) {
      sides.push({ kva: mva * 1000, volts, label: 'Secondary', source: 'Project data' });
    }
  }
  if (!sides.length) return null;
  let selected = sides[0];
  if (Number.isFinite(referenceVoltage)) {
    let best = { diff: Math.abs(selected.volts - referenceVoltage), side: selected };
    sides.slice(1).forEach(side => {
      const diff = Math.abs(side.volts - referenceVoltage);
      if (diff < best.diff) best = { diff, side };
    });
    selected = best.side;
  }
  const phases = parsePhases(getComponentValue(transformer, 'phases')).length || refPhases || 3;
  const kva = Number(selected.kva);
  const volts = Number(selected.volts);
  if (!Number.isFinite(kva) || !Number.isFinite(volts) || kva <= 0 || volts <= 0) return null;
  const apparent = kva * 1000;
  const fla = phases === 1 ? apparent / volts : apparent / (Math.sqrt(3) * volts);
  if (!Number.isFinite(fla) || fla <= 0) return null;
  return { fla, volts, phases, side: selected.label, source: selected.source || 'Project data' };
}

export function collectMotorOperatingData(
  motor,
  referenceVoltage,
  refPhases = 3,
  { allowPartial = false } = {}
) {
  if (!motor) return null;
  const phases = parsePhases(getComponentValue(motor, 'phases')).length || refPhases || 3;
  const voltage = (() => {
    const val = getNumericValue(motor, ['voltage', 'volts', 'rated_voltage', 'line_voltage']);
    if (Number.isFinite(val) && val > 0) return val;
    if (Number.isFinite(referenceVoltage)) return referenceVoltage;
    const inferred = inferVoltage(motor);
    return Number.isFinite(inferred) ? inferred : null;
  })();

  let fla = getNumericValue(motor, ['fla', 'full_load_amps', 'full_load_current', 'full_load_amp', 'rated_current', 'running_current', 'amps']);
  if (!Number.isFinite(fla) || fla <= 0) {
    const hp = getNumericValue(motor, ['hp', 'horsepower']);
    const kw = getNumericValue(motor, ['kw', 'power_kw', 'load_kw', 'output_kw']);
    let pf = getNumericValue(motor, ['pf', 'power_factor']);
    if (!Number.isFinite(pf) || pf <= 0) pf = 0.85;
    let eff = getNumericValue(motor, ['efficiency', 'eff']);
    if (Number.isFinite(eff)) {
      if (eff > 1.2) eff /= 100;
    } else {
      eff = 0.9;
    }
    if (eff <= 0) eff = 0.9;
    if (Number.isFinite(hp) && hp > 0) {
      const watts = hp * 746;
      const denom = (phases === 1 ? voltage : Math.sqrt(3) * voltage) * pf * eff;
      if (denom > 0) fla = watts / denom;
    } else if (Number.isFinite(kw) && kw > 0) {
      const watts = (kw * 1000) / eff;
      const denom = (phases === 1 ? voltage : Math.sqrt(3) * voltage) * pf;
      if (denom > 0) fla = watts / denom;
    }
  }

  let lockedRotor = getNumericValue(motor, ['locked_rotor_current', 'lockedRotorCurrent', 'locked_rotor_amps', 'lockedRotorAmps', 'lr_current_amps', 'lra']);
  if (!Number.isFinite(lockedRotor) || lockedRotor <= 0) {
    let ratio = getNumericValue(motor, ['lr_current_pu', 'locked_rotor_multiple', 'lockedRotorMultiple', 'locked_rotor_pu', 'locked_rotor_ratio']);
    if (!Number.isFinite(ratio) || ratio <= 0) ratio = 6;
    lockedRotor = Number.isFinite(fla) && fla > 0 ? fla * ratio : null;
  }

  const startTime = getNumericValue(motor, [
    'starting_time_s',
    'starting_time',
    'start_time_s',
    'start_time',
    'starting_seconds',
    'start_seconds',
    'accel_time',
    'acceleration_time',
    'starting_duration',
    'start_duration',
    'start_time_sec'
  ]);

  const data = { phases, voltage, fla, lockedRotor, startTime };
  if (allowPartial) return data;
  if (!Number.isFinite(voltage) || voltage <= 0) return null;
  if (!Number.isFinite(fla) || fla <= 0) return null;
  if (!Number.isFinite(lockedRotor) || lockedRotor <= 0) return null;
  return data;
}

export function resolveMotorStartingMetrics(motor, referenceVoltage, refPhases = 3, baseData) {
  const base = baseData || collectMotorOperatingData(motor, referenceVoltage, refPhases);
  if (!base) return null;
  const { fla, lockedRotor, startTime } = base;
  if (!Number.isFinite(fla) || fla <= 0) return null;
  if (!Number.isFinite(lockedRotor) || lockedRotor <= 0) return null;
  if (!Number.isFinite(startTime) || startTime <= 0) return null;
  const curve = buildMotorStartingCurve({ fla, lockedRotor, startTime });
  if (!curve.length) return null;
  return { fla, lockedRotor, startTime, curve };
}

function normalizeServiceFactor(value) {
  let serviceFactor = Number(value);
  if (!Number.isFinite(serviceFactor) || serviceFactor <= 0) return 1.15;
  if (serviceFactor > 5) serviceFactor /= 100;
  if (serviceFactor < 1) serviceFactor = 1;
  return serviceFactor;
}

export function resolveMotorThermalLimit(
  motor,
  referenceVoltage,
  refPhases = 3,
  baseData,
  startMetrics
) {
  const base = baseData || collectMotorOperatingData(motor, referenceVoltage, refPhases);
  if (!base) return null;
  const { fla, lockedRotor } = base;
  if (!Number.isFinite(fla) || fla <= 0) return null;
  if (!Number.isFinite(lockedRotor) || lockedRotor <= 0) return null;
  const stallTimeCandidates = [
    getNumericValue(motor, [
      'stall_time',
      'stall_time_s',
      'locked_rotor_time',
      'max_start_time',
      'max_stall_time',
      'maximum_stall_time',
      'max_allowable_stall_time',
      'maximum_allowable_stall_time',
      'allowable_stall_time',
      'maxAllowableStallTime',
      'maximumAllowableStallTime',
      'allowableStallTime',
      'maxStallTime',
      'stallTimeMax',
      'thermal_limit_time',
      'thermal_limit_duration'
    ]),
    startMetrics?.startTime,
    base.startTime
  ];
  const stallTime = stallTimeCandidates.find(value => Number.isFinite(value) && value > 0) || null;
  if (!Number.isFinite(stallTime) || stallTime <= 0) return null;
  const serviceFactor = normalizeServiceFactor(getNumericValue(motor, ['service_factor', 'sf', 'serviceFactor']));
  const continuousCurrent = Math.max(fla * serviceFactor, fla * 1.05);
  if (!Number.isFinite(continuousCurrent) || continuousCurrent <= 0) return null;
  const thermalConstant = lockedRotor * lockedRotor * stallTime;
  if (!Number.isFinite(thermalConstant) || thermalConstant <= 0) return null;
  let longTime = thermalConstant / (continuousCurrent * continuousCurrent);
  if (!Number.isFinite(longTime) || longTime <= stallTime) {
    longTime = stallTime * 3;
  }
  longTime = Math.max(longTime, stallTime * 1.2);
  longTime = Math.min(longTime, 900);
  const timeCandidates = [stallTime, stallTime * 1.5, stallTime * 2.5, longTime];
  const tailTime = Math.min(longTime * 3, 1800);
  if (Number.isFinite(tailTime) && tailTime > longTime * 1.1) {
    timeCandidates.push(tailTime);
  }
  const points = [...new Set(timeCandidates
    .filter(time => Number.isFinite(time) && time > 0)
    .map(time => Number(time)))]
    .sort((a, b) => a - b)
    .map(time => {
      const current = Math.max(Math.sqrt(thermalConstant / time), continuousCurrent);
      return { time, current };
    })
    .filter(point => Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.current) && point.current > 0);
  if (!points.length) return null;
  const last = points[points.length - 1];
  if (last) last.current = continuousCurrent;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].current > points[i - 1].current) {
      points[i].current = points[i - 1].current;
    }
  }
  return {
    curve: points,
    fla,
    lockedRotor,
    serviceFactor,
    stallTime,
    continuousCurrent
  };
}

export function buildMotorStartingCurve({ fla, lockedRotor, startTime }) {
  const start = Math.max(startTime, 0.01);
  const pre = Math.max(MOTOR_START_MIN_PRETIME, Math.min(start * MOTOR_START_PRETIME_RATIO, start * 0.9));
  const dropStart = Math.max(start * 1.001, start + 0.001);
  const settle = Math.max(dropStart * MOTOR_START_POSTTIME_RATIO, dropStart + 0.01);
  const points = [
    { time: pre, current: lockedRotor },
    { time: start, current: lockedRotor },
    { time: dropStart, current: fla },
    { time: settle, current: fla }
  ];
  return points.filter(point => Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.current) && point.current > 0)
    .sort((a, b) => a.time - b.time);
}

export function getComponentValue(comp, key) {
  if (!comp) return undefined;
  if (Object.prototype.hasOwnProperty.call(comp, key)) {
    const value = comp[key];
    if (value !== undefined && value !== null) return value;
  }
  if (comp.props && typeof comp.props === 'object' && Object.prototype.hasOwnProperty.call(comp.props, key)) {
    const value = comp.props[key];
    if (value !== undefined && value !== null) return value;
  }
  if (Object.prototype.hasOwnProperty.call(comp, key)) return comp[key];
  if (comp.props && typeof comp.props === 'object' && Object.prototype.hasOwnProperty.call(comp.props, key)) return comp.props[key];
  return undefined;
}

export function parseNumeric(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/,/g, '');
  const direct = Number(normalized);
  if (Number.isFinite(direct)) return direct;
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)(?:\s*([a-zA-Z]+))?$/);
  if (!match) return null;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return null;
  const suffix = (match[2] || '').toLowerCase();
  if (!suffix) return numeric;
  if (suffix === 'kv') return numeric * 1000;
  if (suffix === 'v') return numeric;
  return numeric;
}

export function getNumericValue(comp, keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const raw = getComponentValue(comp, key);
    const num = parseNumeric(raw);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

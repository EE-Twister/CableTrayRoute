export function getNestedValue(source, segments = []) {
  let current = source;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

export function resolveComponentAttribute(component, key, { studyAttributeResolvers = {} } = {}) {
  if (!component || !key) return undefined;
  if (!key.includes('.')) {
    const directValue = component[key];
    if (directValue !== undefined) return directValue;
    return component.props && typeof component.props === 'object' ? component.props[key] : undefined;
  }

  const segments = key.split('.');
  const resolver = studyAttributeResolvers[segments[0]];
  if (resolver) {
    const resolvedStudy = resolver(component);
    if (resolvedStudy && typeof resolvedStudy === 'object') {
      const studyValue = getNestedValue(resolvedStudy, segments.slice(1));
      if (studyValue !== undefined) return studyValue;
    }
  }
  const directValue = getNestedValue(component, segments);
  if (directValue !== undefined) return directValue;
  return component.props && typeof component.props === 'object'
    ? getNestedValue(component.props, segments)
    : undefined;
}

export function coalesceComponentAttribute(component, keys = [], options = {}) {
  for (const key of keys) {
    const value = resolveComponentAttribute(component, key, options);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

export function formatEngineeringNumber(value, maxDigits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? '').trim();
  if (Math.abs(number) >= 100) return number.toFixed(number % 1 === 0 ? 0 : 1);
  if (Math.abs(number) >= 10) return number.toFixed(number % 1 === 0 ? 0 : 2).replace(/\.?0+$/, '');
  return number.toPrecision(maxDigits).replace(/\.?0+$/, '');
}

export function formatEngineeringVoltage(value, sourceKey = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? '').trim();
  const key = String(sourceKey || '').toLowerCase();
  if (key.includes('kv') || key === 'basekv' || (number > 0 && number <= 35 && !Number.isInteger(number))) {
    return `${formatEngineeringNumber(number)} kV`;
  }
  if (Math.abs(number) >= 1000) return `${formatEngineeringNumber(number / 1000)} kV`;
  return `${formatEngineeringNumber(number)} V`;
}

export function formatEngineeringValueWithUnit(value, unit, precision = 3) {
  if (value === undefined || value === null || value === '') return '';
  return `${formatEngineeringNumber(value, precision)} ${unit}`.trim();
}

export function getEngineeringLabelLines(component, {
  studyAttributeResolvers = {},
  getCategory = () => '',
  isBusComponent = () => false,
  isProtectionComponent = () => false,
  maxLines = 4
} = {}) {
  if (!component) return [];
  const type = String(component.type || '').toLowerCase();
  const subtype = String(component.subtype || '').toLowerCase();
  const category = getCategory(component);
  const resolve = keys => coalesceComponentAttribute(component, keys, { studyAttributeResolvers });
  const lines = [];
  const seen = new Set();
  const add = text => {
    const normalized = String(text || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    lines.push(normalized);
  };

  const voltageKeys = ['voltage', 'volts', 'rated_voltage_kv', 'rated_kv', 'baseKV', 'kV'];
  for (const key of voltageKeys) {
    const value = resolve([key]);
    if (value !== undefined && value !== null && value !== '') {
      add(formatEngineeringVoltage(value, key));
      break;
    }
  }
  if (isBusComponent(component)) {
    add(formatEngineeringValueWithUnit(resolve(['bus_rating_a', 'rating_a', 'max_continuous_current_a']), 'A'));
    const voltageMagnitude = resolve(['Vm', 'voltage_mag']);
    const voltageAngle = resolve(['Va', 'phase_angle']);
    if (voltageMagnitude !== undefined || voltageAngle !== undefined) {
      const magnitudeText = voltageMagnitude !== undefined ? `${formatEngineeringNumber(voltageMagnitude, 4)} pu` : '';
      const angleText = voltageAngle !== undefined ? `${formatEngineeringNumber(voltageAngle)} deg` : '';
      add([magnitudeText, angleText].filter(Boolean).join(' / '));
    }
  } else if (type === 'transformer') {
    add(formatEngineeringValueWithUnit(resolve(['kva', 'rated_kva', 'kva_hv', 'mva']), 'kVA'));
    add(formatEngineeringValueWithUnit(resolve(['percent_z', 'impedance_z_percent', 'z_hv_lv_percent']), '%Z'));
    const tap = resolve(['tap_percent', 'tap', 'tap_position']);
    if (tap !== undefined) add(`Tap ${formatEngineeringNumber(tap)}${String(tap).includes('%') ? '' : '%'}`);
  } else if (type === 'utility_source') {
    add(formatEngineeringValueWithUnit(resolve(['thevenin_mva', 'short_circuit_capacity']), 'MVA'));
    add(formatEngineeringValueWithUnit(resolve(['xr_ratio']), 'X/R'));
  } else if (type === 'generator') {
    add(formatEngineeringValueWithUnit(resolve(['kw', 'rated_kw', 'max_kw']), 'kW'));
    add(formatEngineeringValueWithUnit(resolve(['kva', 'rated_kva']), 'kVA'));
  } else if (type === 'motor' || subtype.includes('motor')) {
    add(formatEngineeringValueWithUnit(resolve(['hp', 'rated_hp']), 'HP'));
    add(formatEngineeringValueWithUnit(resolve(['kw', 'load.kw']), 'kW'));
  } else if (type === 'static_load') {
    add(formatEngineeringValueWithUnit(resolve(['kw', 'load.kw', 'watts']), 'kW'));
    add(formatEngineeringValueWithUnit(resolve(['kvar', 'load.kvar']), 'kVAR'));
  } else if (type === 'shunt_capacitor_bank' || type === 'reactor') {
    add(formatEngineeringValueWithUnit(resolve(['rated_kvar', 'kvar', 'shunt.kvar', 'kvar_absorb']), 'kVAR'));
  } else if (type === 'ups') {
    add(formatEngineeringValueWithUnit(resolve(['rated_kva', 'kva']), 'kVA'));
    add(formatEngineeringValueWithUnit(resolve(['battery_runtime_min', 'runtime_min']), 'min'));
  } else if (category === 'equipment' || ['panel', 'switchboard', 'switchgear', 'mcc'].includes(type)) {
    add(formatEngineeringValueWithUnit(resolve(['bus_rating_a', 'rating_a']), 'A'));
    add(formatEngineeringValueWithUnit(resolve(['interrupting_ka', 'main_interrupting_ka', 'withstand_1s_ka']), 'kA'));
  } else if (isProtectionComponent(component)) {
    add(formatEngineeringValueWithUnit(resolve(['rating_a', 'frame_a', 'pickup_amps']), 'A'));
    add(formatEngineeringValueWithUnit(resolve(['interrupt_rating_ka', 'interrupting_rating_ka', 'short_circuit_rating_ka']), 'kA'));
  }
  add(formatEngineeringValueWithUnit(resolve(['shortCircuit.threePhaseKA']), 'kA fault'));
  return lines.slice(0, maxLines);
}

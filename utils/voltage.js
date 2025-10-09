export function normalizeVoltageToVolts(raw) {
  const visited = new Set();
  function coerce(value, unitHint = '') {
    if (value === null || value === undefined) return null;
    if (visited.has(value)) return null;
    if (typeof value === 'object' && typeof value.value === 'number') {
      return coerce(value.value, unitHint);
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      visited.add(value);
      const keys = [
        'voltage',
        'volts',
        'kv',
        'kV',
        'baseKV',
        'nominalVoltage',
        'nominal_voltage',
        'prefault_voltage',
        'value'
      ];
      for (const key of keys) {
        if (value[key] === undefined) continue;
        const resolved = coerce(value[key], unitHint || key);
        if (resolved !== null) {
          visited.delete(value);
          return resolved;
        }
      }
      visited.delete(value);
      return null;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const match = trimmed.match(/-?\d+(?:\.\d+)?/);
      if (!match) return null;
      const num = Number(match[0]);
      if (!Number.isFinite(num)) return null;
      const unitSection = trimmed.slice(match.index + match[0].length).toLowerCase();
      const hint = unitHint ? String(unitHint).toLowerCase() : '';
      return convertNumber(num, unitSection || hint || trimmed.toLowerCase());
    }
    if (typeof value === 'number') {
      return convertNumber(value, String(unitHint || ''));
    }
    return null;
  }

  function convertNumber(num, hint = '') {
    if (!Number.isFinite(num)) return null;
    const abs = Math.abs(num);
    const h = hint.toLowerCase();
    if (h.includes('kv')) return num * 1000;
    if (h.includes('mv')) return num * 1e6;
    if (h.includes('volt') || h.endsWith('v')) return num;
    if (abs === 0) return 0;
    if (abs < 1) return num * 1000;
    if (abs >= 100) return num;
    if (abs >= 69) return num * 1000;
    if (abs >= 35) {
      if (!Number.isInteger(num)) return num * 1000;
      if (abs >= 60) return num;
      return num;
    }
    if (abs >= 1) {
      if (!Number.isInteger(num)) return num * 1000;
      if (abs >= 30) return num;
      if (abs >= 15) return num;
      return num;
    }
    return num;
  }

  return coerce(raw);
}

export function toBaseKV(raw) {
  const volts = normalizeVoltageToVolts(raw);
  if (volts === null) return null;
  return volts / 1000;
}

export function voltagesRoughlyEqual(a, b, toleranceVolts = 1) {
  const va = normalizeVoltageToVolts(a);
  const vb = normalizeVoltageToVolts(b);
  if (va === null || vb === null) return null;
  return Math.abs(va - vb) <= toleranceVolts;
}

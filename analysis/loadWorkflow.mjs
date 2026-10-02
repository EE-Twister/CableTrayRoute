export const requiredLoadFields = ['source', 'kw', 'voltage', 'powerFactor', 'phases'];

function hasValue(value) {
  if (Array.isArray(value)) return value.some(hasValue);
  if (value && typeof value === 'object') return Object.keys(value).some(key => hasValue(value[key]));
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function identityValue(row) {
  for (const key of ['ref', 'id', 'tag', 'description']) {
    const value = normalize(row?.[key]);
    if (value) return value;
  }
  return '';
}

function mergeRow(existing = {}, incoming = {}) {
  const merged = { ...existing };
  Object.entries(incoming || {}).forEach(([key, value]) => {
    if (!hasValue(value)) return;
    merged[key] = value;
  });
  return merged;
}

function rowChanged(existing = {}, incoming = {}) {
  return Object.entries(incoming || {}).some(([key, value]) => {
    if (!hasValue(value)) return false;
    return String(existing?.[key] ?? '') !== String(value);
  });
}

export function isMeaningfulLoad(row) {
  if (!row || typeof row !== 'object') return false;
  return Object.entries(row).some(([key, value]) => {
    if (key.startsWith('_')) return false;
    return hasValue(value);
  });
}

export function missingLoadFields(load = {}) {
  return {
    source: !hasValue(load.source),
    kw: !hasValue(load.kw),
    voltage: !hasValue(load.voltage),
    powerFactor: !hasValue(load.powerFactor),
    phases: !hasValue(load.phases)
  };
}

/**
 * Flag values that are present but cannot be right. A power factor typed as 85
 * (percent) or a voltage of 0 passes a presence check yet silently corrupts kVA,
 * current and every study that reads the load.
 */
export function invalidLoadFields(load = {}) {
  const number = value => (hasValue(value) ? Number(String(value).trim()) : NaN);
  const kw = number(load.kw);
  const voltage = number(load.voltage);
  const powerFactor = number(load.powerFactor);
  const phases = number(load.phases);
  return {
    kw: hasValue(load.kw) && !(Number.isFinite(kw) && kw >= 0),
    voltage: hasValue(load.voltage) && !(Number.isFinite(voltage) && voltage > 0),
    powerFactor: hasValue(load.powerFactor) && !(Number.isFinite(powerFactor) && powerFactor > 0 && powerFactor <= 1),
    phases: hasValue(load.phases) && !(phases === 1 || phases === 3),
  };
}

export function summarizeLoadValidation(loads = []) {
  const meaningful = Array.isArray(loads) ? loads.filter(isMeaningfulLoad) : [];
  const summary = {
    total: meaningful.length,
    complete: 0,
    incomplete: 0,
    missingSource: 0,
    missingKw: 0,
    missingVoltage: 0,
    missingPowerFactor: 0,
    missingPhases: 0,
    invalidKw: 0,
    invalidVoltage: 0,
    invalidPowerFactor: 0,
    invalidPhases: 0
  };
  meaningful.forEach(load => {
    const missing = missingLoadFields(load);
    if (missing.source) summary.missingSource += 1;
    if (missing.kw) summary.missingKw += 1;
    if (missing.voltage) summary.missingVoltage += 1;
    if (missing.powerFactor) summary.missingPowerFactor += 1;
    if (missing.phases) summary.missingPhases += 1;
    const invalid = invalidLoadFields(load);
    if (invalid.kw) summary.invalidKw += 1;
    if (invalid.voltage) summary.invalidVoltage += 1;
    if (invalid.powerFactor) summary.invalidPowerFactor += 1;
    if (invalid.phases) summary.invalidPhases += 1;
    if (Object.values(missing).some(Boolean) || Object.values(invalid).some(Boolean)) summary.incomplete += 1;
    else summary.complete += 1;
  });
  return summary;
}

export function getEquipmentSourceOptions(equipment = []) {
  const values = new Set();
  (Array.isArray(equipment) ? equipment : []).forEach(row => {
    ['tag', 'ref', 'id'].forEach(key => {
      const value = String(row?.[key] || '').trim();
      if (value) values.add(value);
    });
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function previewLoadImport(currentRows = [], incomingRows = []) {
  const current = Array.isArray(currentRows) ? currentRows.filter(isMeaningfulLoad) : [];
  const incoming = Array.isArray(incomingRows) ? incomingRows.filter(isMeaningfulLoad) : [];
  const index = new Map();
  current.forEach(row => {
    const id = identityValue(row);
    if (id) index.set(id, row);
  });

  let mergeCreates = 0;
  let mergeUpdates = 0;
  let mergeUnchanged = 0;
  incoming.forEach(row => {
    const id = identityValue(row);
    const existing = id ? index.get(id) : null;
    if (!existing) {
      mergeCreates += 1;
    } else if (rowChanged(existing, row)) {
      mergeUpdates += 1;
    } else {
      mergeUnchanged += 1;
    }
  });

  return {
    current: current.length,
    incoming: incoming.length,
    replaceCount: incoming.length,
    mergeCreates,
    mergeUpdates,
    mergeUnchanged
  };
}

export function mergeLoadRows(currentRows = [], incomingRows = []) {
  const result = (Array.isArray(currentRows) ? currentRows : []).map(row => ({ ...row }));
  const index = new Map();
  result.forEach((row, idx) => {
    const id = identityValue(row);
    if (id) index.set(id, idx);
  });

  (Array.isArray(incomingRows) ? incomingRows : []).filter(isMeaningfulLoad).forEach(row => {
    const id = identityValue(row);
    const matchIndex = id ? index.get(id) : undefined;
    if (matchIndex === undefined) {
      result.push({ ...row });
      if (id) index.set(id, result.length - 1);
      return;
    }
    result[matchIndex] = mergeRow(result[matchIndex], row);
  });
  return result;
}

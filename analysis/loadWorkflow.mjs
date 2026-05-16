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
    missingPhases: 0
  };
  meaningful.forEach(load => {
    const missing = missingLoadFields(load);
    if (missing.source) summary.missingSource += 1;
    if (missing.kw) summary.missingKw += 1;
    if (missing.voltage) summary.missingVoltage += 1;
    if (missing.powerFactor) summary.missingPowerFactor += 1;
    if (missing.phases) summary.missingPhases += 1;
    if (Object.values(missing).some(Boolean)) summary.incomplete += 1;
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

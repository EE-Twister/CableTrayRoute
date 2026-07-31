const FIELD_DEFINITIONS = {
  label: { label: 'Label', kind: 'text' },
  tag: { label: 'Tag', kind: 'text' },
  voltageKv: { label: 'Rated voltage (kV)', kind: 'number' },
  currentA: { label: 'Rated current (A)', kind: 'number' },
  layer: { label: 'Layer', kind: 'text' },
  locked: { label: 'Position locked', kind: 'boolean' },
};

const CSV_FIELD_HEADERS = {
  label: ['label'],
  tag: ['tag'],
  voltageKv: ['ratedvoltagekv', 'voltagekv'],
  currentA: ['ratedcurrenta', 'currenta'],
  layer: ['layer'],
  locked: ['positionlocked', 'locked'],
};

export const DATA_MANAGER_FIELDS = Object.freeze(FIELD_DEFINITIONS);

function text(value) {
  return String(value ?? '').trim();
}

function positiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizedHeader(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function componentVoltage(component = {}) {
  const candidates = [
    component.rated_voltage_kv,
    component.props?.rated_voltage_kv,
    component.kV,
    component.baseKV,
    component.props?.baseKV,
  ];
  for (const value of candidates) {
    const numeric = positiveNumber(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function componentCurrent(component = {}) {
  const candidates = [
    component.rated_current_a,
    component.props?.rated_current_a,
    component.rated_current,
    component.props?.rated_current,
    component.props?.bus_rating_a,
  ];
  for (const value of candidates) {
    const numeric = positiveNumber(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function componentSheets(oneLine = {}) {
  if (Array.isArray(oneLine)) return oneLine;
  return Array.isArray(oneLine?.sheets) ? oneLine.sheets : [];
}

export function listOneLineDataRows(oneLine = {}) {
  return componentSheets(oneLine).flatMap((sheet, sheetIndex) => (
    (Array.isArray(sheet?.components) ? sheet.components : []).map((component, componentIndex) => ({
      componentId: text(component?.id) || `sheet-${sheetIndex + 1}-component-${componentIndex + 1}`,
      sheetId: text(sheet?.id) || `sheet-${sheetIndex + 1}`,
      sheet: text(sheet?.name || sheet?.title) || `Sheet ${sheetIndex + 1}`,
      label: text(component?.label || component?.name),
      tag: text(component?.tag || component?.ref),
      type: text(component?.type) || 'component',
      subtype: text(component?.subtype),
      voltageKv: componentVoltage(component),
      currentA: componentCurrent(component),
      layer: text(component?.layer),
      locked: component?.locked === true,
    }))
  ));
}

export function filterOneLineDataRows(rows = [], filters = {}) {
  const query = text(filters.query).toLowerCase();
  const sheet = text(filters.sheet);
  const type = text(filters.type);
  return (Array.isArray(rows) ? rows : []).filter(row => {
    if (sheet && row.sheetId !== sheet) return false;
    if (type && row.type !== type) return false;
    if (!query) return true;
    return [row.componentId, row.sheet, row.label, row.tag, row.type, row.subtype, row.layer]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
}

function assignField(component, field, rawValue) {
  const definition = FIELD_DEFINITIONS[field];
  if (!definition) return { component, changed: false };
  const next = { ...component };
  const props = { ...(component?.props || {}) };
  const value = definition.kind === 'boolean' ? rawValue === true || rawValue === 'true' : rawValue;

  if (field === 'label' || field === 'tag') {
    const normalized = text(value);
    if (text(component?.[field]) === normalized) return { component, changed: false };
    next[field] = normalized;
  } else if (field === 'layer') {
    const normalized = text(value);
    if (text(component?.layer) === normalized) return { component, changed: false };
    if (normalized) next.layer = normalized;
    else delete next.layer;
  } else if (field === 'locked') {
    if (component?.locked === value) return { component, changed: false };
    if (value) next.locked = true;
    else delete next.locked;
  } else {
    const numeric = positiveNumber(value);
    if (numeric === null) return { component, changed: false };
    const key = field === 'voltageKv' ? 'rated_voltage_kv' : 'rated_current_a';
    const current = field === 'voltageKv' ? componentVoltage(component) : componentCurrent(component);
    if (current === numeric) return { component, changed: false };
    props[key] = numeric;
    next.props = props;
  }
  return { component: next, changed: true };
}

/**
 * Apply one controlled field change to one or more one-line component IDs.
 * Returns a cloned model so callers can persist it through the project store.
 */
export function applyOneLineDataEdit(oneLine = {}, componentIds = [], field, value) {
  const selected = new Set((Array.isArray(componentIds) ? componentIds : []).map(text).filter(Boolean));
  if (!selected.size || !FIELD_DEFINITIONS[field]) return { oneLine, changed: 0 };
  let changed = 0;
  const sheets = componentSheets(oneLine).map(sheet => ({
    ...sheet,
    components: (Array.isArray(sheet?.components) ? sheet.components : []).map(component => {
      if (!selected.has(text(component?.id))) return component;
      const result = assignField(component, field, value);
      if (result.changed) changed += 1;
      return result.component;
    }),
  }));
  if (!changed) return { oneLine, changed: 0 };
  return {
    oneLine: Array.isArray(oneLine)
      ? sheets
      : { ...oneLine, sheets },
    changed,
  };
}

/** Parse a UTF-8 CSV with RFC-4180-style quoted fields into header-keyed rows. */
export function parseOneLineDataCsv(source = '') {
  const cells = [];
  const rows = [];
  let cell = '';
  let quoted = false;
  const input = String(source ?? '').replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      cells.push(cell);
      if (cells.some(value => text(value))) rows.push(cells.splice(0));
      else cells.length = 0;
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  if (cells.some(value => text(value))) rows.push(cells);
  if (!rows.length) return [];
  const headers = rows.shift().map(header => text(header));
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function csvValue(row, aliases) {
  const entries = Object.entries(row || {});
  for (const alias of aliases) {
    const match = entries.find(([header]) => normalizedHeader(header) === alias);
    if (match) return { present: true, value: match[1] };
  }
  return { present: false, value: '' };
}

function importValue(field, rawValue) {
  if (field === 'locked') {
    const normalized = text(rawValue).toLowerCase();
    if (['true', 'yes', 'locked', '1'].includes(normalized)) return { valid: true, value: true };
    if (['false', 'no', 'unlocked', '0'].includes(normalized)) return { valid: true, value: false };
    return { valid: false, reason: 'Position Locked must be Yes/No, True/False, Locked/Unlocked, or 1/0.' };
  }
  if (field === 'voltageKv' || field === 'currentA') {
    const value = positiveNumber(rawValue);
    return value === null
      ? { valid: false, reason: `${FIELD_DEFINITIONS[field].label} must be greater than zero.` }
      : { valid: true, value };
  }
  return { valid: true, value: text(rawValue) };
}

/**
 * Plan, but do not apply, controlled One-Line data updates from parsed CSV rows.
 * Component ID is required; only the controlled exported fields are considered.
 */
export function planOneLineDataImport(oneLine = {}, csvRows = []) {
  const existing = new Map(listOneLineDataRows(oneLine).map(row => [row.componentId, row]));
  const seen = new Set();
  const updates = [];
  const warnings = [];
  let matchedRows = 0;
  let unmatchedRows = 0;
  for (const [index, csvRow] of (Array.isArray(csvRows) ? csvRows : []).entries()) {
    const idValue = csvValue(csvRow, ['componentid', 'id']);
    const componentId = text(idValue.value);
    const rowNumber = index + 2;
    if (!idValue.present || !componentId) {
      warnings.push({ row: rowNumber, message: 'Component ID is required.' });
      continue;
    }
    if (seen.has(componentId)) {
      warnings.push({ row: rowNumber, message: `Duplicate Component ID "${componentId}" was skipped; the first row is used.` });
      continue;
    }
    seen.add(componentId);
    const current = existing.get(componentId);
    if (!current) {
      unmatchedRows += 1;
      warnings.push({ row: rowNumber, message: `Component ID "${componentId}" was not found in the current One-Line.` });
      continue;
    }
    matchedRows += 1;
    Object.entries(CSV_FIELD_HEADERS).forEach(([field, aliases]) => {
      const candidate = csvValue(csvRow, aliases);
      if (!candidate.present) return;
      const parsed = importValue(field, candidate.value);
      if (!parsed.valid) {
        warnings.push({ row: rowNumber, message: `${componentId}: ${parsed.reason}` });
        return;
      }
      if (current[field] === parsed.value) return;
      updates.push({
        componentId,
        field,
        value: parsed.value,
        before: current[field],
        after: parsed.value,
      });
    });
  }
  return { updates, warnings, matchedRows, unmatchedRows, totalRows: Array.isArray(csvRows) ? csvRows.length : 0 };
}

/** Apply a previously reviewed import plan as one cloned One-Line model mutation. */
export function applyOneLineDataImport(oneLine = {}, updates = []) {
  let next = oneLine;
  let changed = 0;
  for (const update of Array.isArray(updates) ? updates : []) {
    const result = applyOneLineDataEdit(next, [update.componentId], update.field, update.value);
    next = result.oneLine;
    changed += result.changed;
  }
  return { oneLine: next, changed };
}

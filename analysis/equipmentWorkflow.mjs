const EQUIPMENT_FIELDS = [
  'id',
  'ref',
  'tag',
  'description',
  'voltage',
  'category',
  'subCategory',
  'arrangement',
  'width',
  'depth',
  'height',
  'baseElevation',
  'lineup',
  'manufacturer',
  'model',
  'phases',
  'notes',
  'x',
  'y',
  'z'
];

export const starterEquipment = [
  {
    tag: 'SWBD-101',
    description: '480 V main switchboard',
    voltage: '480/277',
    category: 'Distribution',
    subCategory: 'Switchboard',
    arrangement: 'Electrical Room A',
    lineup: 'SWBD-101',
    manufacturer: 'Square D',
    model: 'Power-Style QED',
    phases: '3',
    notes: 'Main service equipment'
  },
  {
    tag: 'MCC-101',
    description: 'Process motor control center',
    voltage: '480',
    category: 'Distribution',
    subCategory: 'MCC',
    arrangement: 'Process Area',
    lineup: 'MCC-101',
    manufacturer: 'Allen-Bradley',
    model: 'CENTERLINE 2100',
    phases: '3',
    notes: 'Feeds pump and fan loads'
  },
  {
    tag: 'XFMR-101',
    description: '480-208/120 V dry-type transformer',
    voltage: '480/208',
    category: 'Transformer',
    subCategory: 'Dry Type',
    arrangement: 'Electrical Room A',
    lineup: 'XFMR-101',
    manufacturer: 'Eaton',
    model: 'V48M28T75EE',
    phases: '3',
    notes: 'Feeds lighting panel LP-101'
  },
  {
    tag: 'LP-101',
    description: '208/120 V lighting and receptacle panel',
    voltage: '208/120',
    category: 'Panel',
    subCategory: 'Lighting Panel',
    arrangement: 'Electrical Room A',
    lineup: 'LP-101',
    manufacturer: 'Square D',
    model: 'NF',
    phases: '3',
    notes: 'Branch panel for building loads'
  },
  {
    tag: 'PMP-101',
    description: 'Cooling water pump package',
    voltage: '480',
    category: 'Mechanical Load',
    subCategory: 'Pump',
    arrangement: 'Process Area',
    lineup: 'Process Pumps',
    manufacturer: 'Goulds',
    model: '3196',
    phases: '3',
    notes: 'Driven by 25 hp motor'
  }
];

const FIELD_ALIASES = {
  id: ['equipmentid', 'equipment id', 'id', 'record id'],
  ref: ['ref', 'reference', 'record ref'],
  tag: ['tag', 'equipment tag', 'equipment_tag', 'name'],
  description: ['description', 'desc', 'equipment description'],
  voltage: ['voltage', 'voltage (v)', 'volts', 'rated voltage', 'voltage rating'],
  category: ['category', 'type', 'equipment type'],
  subCategory: ['sub-category', 'subcategory', 'sub category', 'equipment subtype'],
  arrangement: ['arrangement', 'equipment arrangement', 'layout', 'area', 'location'],
  width: ['width', 'width (ft)'],
  depth: ['depth', 'depth (ft)'],
  height: ['height', 'height (ft)'],
  baseElevation: ['base elev.', 'base elevation', 'base elev. (ft)', 'base elevation (ft)'],
  lineup: ['lineup', 'line up', 'switchgear lineup'],
  manufacturer: ['manufacturer', 'mfr', 'vendor'],
  model: ['model', 'catalog', 'catalog number'],
  phases: ['phases', 'phase', 'phase count'],
  notes: ['notes', 'remarks', 'comments'],
  x: ['x', 'x coordinate'],
  y: ['y', 'y coordinate'],
  z: ['z', 'z coordinate']
};

function hasValue(value) {
  if (Array.isArray(value)) return value.some(hasValue);
  if (value && typeof value === 'object') return Object.keys(value).some(key => hasValue(value[key]));
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function canonicalHeader(header) {
  return normalize(header).replace(/\s+/g, ' ');
}

function identityValue(row) {
  for (const key of ['ref', 'id', 'tag']) {
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

export function isMeaningfulEquipment(row) {
  if (!row || typeof row !== 'object') return false;
  return Object.entries(row).some(([key, value]) => {
    if (key === 'typical_id' || key.startsWith('_')) return false;
    return hasValue(value);
  });
}

export function summarizeEquipment(rows = []) {
  const meaningful = Array.isArray(rows) ? rows.filter(isMeaningfulEquipment) : [];
  const tags = new Map();
  meaningful.forEach(row => {
    const tag = normalize(row.tag);
    if (!tag) return;
    tags.set(tag, (tags.get(tag) || 0) + 1);
  });
  const duplicateTags = meaningful.filter(row => {
    const tag = normalize(row.tag);
    return tag && (tags.get(tag) || 0) > 1;
  }).length;
  const arrangements = new Set();
  const categories = new Set();
  meaningful.forEach(row => {
    if (hasValue(row.arrangement)) arrangements.add(String(row.arrangement).trim());
    if (hasValue(row.category)) categories.add(String(row.category).trim());
  });
  return {
    total: meaningful.length,
    missingTags: meaningful.filter(row => !hasValue(row.tag)).length,
    duplicateTags,
    missingVoltage: meaningful.filter(row => !hasValue(row.voltage)).length,
    missingManufacturer: meaningful.filter(row => !hasValue(row.manufacturer)).length,
    assignedArrangements: arrangements.size,
    categories: categories.size
  };
}

export function validateEquipmentRows(rows = []) {
  const meaningful = Array.isArray(rows) ? rows.filter(isMeaningfulEquipment) : [];
  const tagCounts = new Map();
  meaningful.forEach(row => {
    const tag = normalize(row.tag);
    if (!tag) return;
    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  });

  const issues = [];
  meaningful.forEach((row, index) => {
    const tag = normalize(row.tag);
    if (!tag) {
      issues.push({ index, field: 'tag', code: 'missing-tag', message: 'Equipment tag is required.' });
    } else if ((tagCounts.get(tag) || 0) > 1) {
      issues.push({ index, field: 'tag', code: 'duplicate-tag', message: 'Equipment tag must be unique.' });
    }
    const voltage = String(row.voltage || '').trim();
    const voltageValid = !voltage || /^\d+(?:\.\d+)?(?:\s*[kKmM]?[vV])?(?:\s*\/\s*\d+(?:\.\d+)?(?:\s*[kKmM]?[vV])?)?$/.test(voltage);
    if (!voltage) {
      issues.push({ index, field: 'voltage', code: 'missing-voltage', message: 'Voltage is required for workflow readiness.' });
    } else if (!voltageValid) {
      issues.push({ index, field: 'voltage', code: 'invalid-voltage', message: 'Use a voltage format like 480, 13.8kV, or 480/277.' });
    }
    if (!hasValue(row.manufacturer)) {
      issues.push({ index, field: 'manufacturer', code: 'missing-manufacturer', message: 'Manufacturer is recommended for procurement/export.' });
    }
  });
  return issues;
}

export function inferEquipmentMapping(headers = []) {
  const mapping = {};
  headers.forEach(header => {
    const normalized = canonicalHeader(header);
    const match = EQUIPMENT_FIELDS.find(field => (FIELD_ALIASES[field] || []).includes(normalized));
    if (match) mapping[header] = match;
  });
  return mapping;
}

export function mapRowsToEquipment(rows = [], headers = [], mapping = inferEquipmentMapping(headers)) {
  return rows.map(row => {
    const equipment = {};
    headers.forEach((header, index) => {
      const field = mapping[header];
      if (!field) return;
      const value = Array.isArray(row) ? row[index] : row[header];
      equipment[field] = value === undefined || value === null ? '' : String(value).trim();
    });
    return equipment;
  }).filter(isMeaningfulEquipment);
}

export function previewEquipmentImport(currentRows = [], incomingRows = []) {
  const current = Array.isArray(currentRows) ? currentRows.filter(isMeaningfulEquipment) : [];
  const incoming = Array.isArray(incomingRows) ? incomingRows.filter(isMeaningfulEquipment) : [];
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

export function mergeEquipmentRows(currentRows = [], incomingRows = []) {
  const result = (Array.isArray(currentRows) ? currentRows : []).map(row => ({ ...row }));
  const index = new Map();
  result.forEach((row, idx) => {
    const id = identityValue(row);
    if (id) index.set(id, idx);
  });

  (Array.isArray(incomingRows) ? incomingRows : []).filter(isMeaningfulEquipment).forEach(row => {
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

export function applyBulkEquipmentUpdate(rows = [], indexes = [], field, value) {
  const selected = new Set(indexes);
  return rows.map((row, index) => selected.has(index) ? { ...row, [field]: value } : { ...row });
}

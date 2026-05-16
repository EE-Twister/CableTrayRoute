/**
 * Shared conduit fill screening helpers.
 *
 * Values mirror the conduit internal area table used by the Conduit Fill page.
 * The DRC uses these helpers as a selected NEC Chapter 9 Table 1 / Annex C
 * screening aid; final raceway fill still depends on the exact wiring method,
 * conductor/cable construction, nipples, and AHJ basis.
 */

export const CONDUIT_INTERNAL_AREA_IN2 = Object.freeze({
  EMT: { '1/2': 0.304, '3/4': 0.533, '1': 0.864, '1-1/4': 1.496, '1-1/2': 2.036, '2': 3.356, '2-1/2': 5.858, '3': 8.846, '3-1/2': 11.545, '4': 14.753 },
  ENT: { '1/2': 0.285, '3/4': 0.508, '1': 0.832, '1-1/4': 1.453, '1-1/2': 1.986, '2': 3.291 },
  FMC: { '3/8': 0.116, '1/2': 0.317, '3/4': 0.533, '1': 0.817, '1-1/4': 1.277, '1-1/2': 1.858, '2': 3.269, '2-1/2': 4.909, '3': 7.069, '3-1/2': 9.621, '4': 12.566 },
  IMC: { '1/2': 0.342, '3/4': 0.586, '1': 0.959, '1-1/4': 1.647, '1-1/2': 2.225, '2': 3.63, '2-1/2': 5.135, '3': 7.922, '3-1/2': 10.584, '4': 13.631 },
  'LFNC-A': { '3/8': 0.192, '1/2': 0.312, '3/4': 0.535, '1': 0.854, '1-1/4': 1.502, '1-1/2': 2.018, '2': 3.343 },
  'LFNC-B': { '3/8': 0.192, '1/2': 0.314, '3/4': 0.541, '1': 0.873, '1-1/4': 1.528, '1-1/2': 1.981, '2': 3.246 },
  LFMC: { '3/8': 0.192, '1/2': 0.314, '3/4': 0.541, '1': 0.873, '1-1/4': 1.277, '1-1/2': 1.858, '2': 3.269, '2-1/2': 4.881, '3': 7.475, '3-1/2': 9.731, '4': 12.692 },
  RMC: { '1/2': 0.314, '3/4': 0.549, '1': 0.887, '1-1/4': 1.526, '1-1/2': 2.071, '2': 3.408, '2-1/2': 4.866, '3': 7.499, '3-1/2': 10.01, '4': 12.882, '5': 20.212, '6': 29.158 },
  'PVC Sch 80': { '1/2': 0.217, '3/4': 0.409, '1': 0.688, '1-1/4': 1.237, '1-1/2': 1.711, '2': 2.874, '2-1/2': 4.119, '3': 6.442, '3-1/2': 8.688, '4': 11.258, '5': 17.855, '6': 25.598 },
  'PVC Sch 40': { '1/2': 0.285, '3/4': 0.508, '1': 0.832, '1-1/4': 1.453, '1-1/2': 1.986, '2': 3.291, '2-1/2': 4.695, '3': 7.268, '3-1/2': 9.737, '4': 12.554, '5': 19.761, '6': 28.567 },
  'PVC Type A': { '1/2': 0.385, '3/4': 0.65, '1': 1.084, '1-1/4': 1.767, '1-1/2': 2.324, '2': 3.647, '2-1/2': 5.453, '3': 8.194, '3-1/2': 10.694, '4': 13.723 },
  'PVC Type EB': { '2': 3.874, '3': 8.709, '3-1/2': 11.365, '4': 14.448, '5': 22.195, '6': 31.53 },
});

const CONDUIT_TYPE_ALIASES = new Map([
  ['emt', 'EMT'],
  ['electrical metallic tubing', 'EMT'],
  ['ent', 'ENT'],
  ['electrical nonmetallic tubing', 'ENT'],
  ['fmc', 'FMC'],
  ['flexible metal conduit', 'FMC'],
  ['flexible metallic conduit', 'FMC'],
  ['imc', 'IMC'],
  ['intermediate metal conduit', 'IMC'],
  ['lfnc-a', 'LFNC-A'],
  ['lfnca', 'LFNC-A'],
  ['liquidtight flexible nonmetallic conduit a', 'LFNC-A'],
  ['lfnc-b', 'LFNC-B'],
  ['lfncb', 'LFNC-B'],
  ['liquidtight flexible nonmetallic conduit b', 'LFNC-B'],
  ['lfmc', 'LFMC'],
  ['liquidtight flexible metal conduit', 'LFMC'],
  ['liquidtight flexible metallic conduit', 'LFMC'],
  ['rmc', 'RMC'],
  ['rigid metal conduit', 'RMC'],
  ['rigid metallic conduit', 'RMC'],
  ['rigid conduit', 'RMC'],
  ['pvc', 'PVC Sch 40'],
  ['pvc sch 40', 'PVC Sch 40'],
  ['pvc schedule 40', 'PVC Sch 40'],
  ['pvc sch40', 'PVC Sch 40'],
  ['pvc40', 'PVC Sch 40'],
  ['pvc sch 80', 'PVC Sch 80'],
  ['pvc schedule 80', 'PVC Sch 80'],
  ['pvc sch80', 'PVC Sch 80'],
  ['pvc80', 'PVC Sch 80'],
  ['pvc type a', 'PVC Type A'],
  ['pvc type eb', 'PVC Type EB'],
]);

const CONDUIT_ID_FIELDS = [
  'conduit_id',
  'conduitId',
  'raceway_id',
  'racewayId',
  'tray_id',
  'trayId',
  'id',
  'tag',
  'name',
];

const CONDUIT_TYPE_FIELDS = [
  'conduit_type',
  'conduitType',
  'raceway_type',
  'racewayType',
  'type',
  'material',
];

const CONDUIT_SIZE_FIELDS = [
  'trade_size',
  'tradeSize',
  'conduit_size',
  'conduitSize',
  'size',
  'nominal_size',
  'nominalSize',
];

const CABLE_AREA_FIELDS = [
  'cable_area',
  'cableArea',
  'area',
  'area_in2',
  'areaIn2',
  'conduit_area',
  'conduitArea',
];

const CABLE_OD_FIELDS = [
  'cable_od',
  'cableOD',
  'outside_diameter',
  'outsideDiameter',
  'diameter',
  'od',
  'OD',
];

const CABLE_RACEWAY_FIELDS = [
  'raceway_ids',
  'racewayIds',
  'raceway_id',
  'racewayId',
  'raceway',
  'tray_id',
  'trayId',
  'allowed_raceways',
  'allowedRaceways',
];

export function parsePositiveNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const direct = Number.parseFloat(text);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function firstText(record, fields) {
  for (const field of fields) {
    const value = record?.[field];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

export function recordId(record, fields = CONDUIT_ID_FIELDS) {
  return firstText(record, fields);
}

function numericTradeSize(value) {
  const text = String(value ?? '').trim().replace(/["']/g, '').replace(/\s+in(?:ch(?:es)?)?\.?$/i, '');
  if (!text) return null;
  const mixed = text.match(/^(\d+)[-\s]+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number.parseFloat(mixed[1]);
    const numerator = Number.parseFloat(mixed[2]);
    const denominator = Number.parseFloat(mixed[3]);
    return denominator > 0 ? whole + (numerator / denominator) : null;
  }
  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const numerator = Number.parseFloat(fraction[1]);
    const denominator = Number.parseFloat(fraction[2]);
    return denominator > 0 ? numerator / denominator : null;
  }
  const direct = Number.parseFloat(text);
  return Number.isFinite(direct) && direct > 0 ? direct : null;
}

export function normalizeConduitType(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (Object.prototype.hasOwnProperty.call(CONDUIT_INTERNAL_AREA_IN2, text)) return text;
  const key = text
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return CONDUIT_TYPE_ALIASES.get(key) ?? '';
}

function conduitTypeFromRecord(conduit) {
  for (const field of CONDUIT_TYPE_FIELDS) {
    const normalized = normalizeConduitType(conduit?.[field]);
    if (normalized) return normalized;
  }
  return '';
}

export function normalizeTradeSize(value, conduitType = '') {
  const text = String(value ?? '')
    .trim()
    .replace(/["']/g, '')
    .replace(/\s+in(?:ch(?:es)?)?\.?$/i, '');
  if (!text) return '';
  const table = CONDUIT_INTERNAL_AREA_IN2[normalizeConduitType(conduitType)] ?? null;
  if (table && Object.prototype.hasOwnProperty.call(table, text)) return text;

  const numeric = numericTradeSize(text);
  if (numeric == null) return text;
  const allSizes = table ? Object.keys(table) : [...new Set(Object.values(CONDUIT_INTERNAL_AREA_IN2).flatMap(sizes => Object.keys(sizes)))];
  const match = allSizes.find(size => {
    const sizeNumber = numericTradeSize(size);
    return sizeNumber != null && Math.abs(sizeNumber - numeric) < 0.001;
  });
  return match ?? text;
}

export function conduitInternalArea(type, tradeSize) {
  const normalizedType = normalizeConduitType(type);
  if (!normalizedType) return null;
  const normalizedSize = normalizeTradeSize(tradeSize, normalizedType);
  return CONDUIT_INTERNAL_AREA_IN2[normalizedType]?.[normalizedSize] ?? null;
}

export function conduitFillLimit(cableCount) {
  if (cableCount <= 0) return null;
  if (cableCount === 1) return 0.53;
  if (cableCount === 2) return 0.31;
  return 0.40;
}

export function cableAreaIn2(cable) {
  for (const field of CABLE_AREA_FIELDS) {
    const area = parsePositiveNumber(cable?.[field]);
    if (area) return area;
  }
  for (const field of CABLE_OD_FIELDS) {
    const diameter = parsePositiveNumber(cable?.[field]);
    if (diameter) return Math.PI * (diameter / 2) ** 2;
  }
  return null;
}

export function physicalCableCount(cable) {
  return Math.max(
    1,
    Math.trunc(
      parsePositiveNumber(cable?.parallel_count)
        ?? parsePositiveNumber(cable?.parallelCount)
        ?? parsePositiveNumber(cable?.quantity)
        ?? parsePositiveNumber(cable?.qty)
        ?? 1
    )
  );
}

function normalizeAssignmentToken(token) {
  return String(token ?? '').trim().replace(/^["']|["']$/g, '');
}

export function extractRacewayIds(cable) {
  const ids = [];
  for (const field of CABLE_RACEWAY_FIELDS) {
    const raw = cable?.[field];
    if (raw == null || raw === '') continue;
    if (Array.isArray(raw)) {
      raw.map(normalizeAssignmentToken).filter(Boolean).forEach(id => ids.push(id));
      continue;
    }
    if (typeof raw === 'object') {
      Object.values(raw).map(normalizeAssignmentToken).filter(Boolean).forEach(id => ids.push(id));
      continue;
    }
    const text = String(raw).trim();
    if (!text) continue;
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          parsed.map(normalizeAssignmentToken).filter(Boolean).forEach(id => ids.push(id));
          continue;
        }
      } catch {
        // Fall through to delimiter parsing.
      }
    }
    text
      .split(/[,;|>\n]+/)
      .map(normalizeAssignmentToken)
      .filter(Boolean)
      .forEach(id => ids.push(id));
  }
  return [...new Set(ids)];
}

function normalizeCableReference(cable) {
  return firstText(cable, ['name', 'tag', 'cable_id', 'cableId', 'id']);
}

function mapFromExplicitAssignments(conduits, cables, rawMap) {
  const cableByKey = new Map();
  for (const cable of cables) {
    const keys = [
      cable.name,
      cable.tag,
      cable.cable_id,
      cable.cableId,
      cable.id,
    ].map(normalizeAssignmentToken).filter(Boolean);
    keys.forEach(key => cableByKey.set(key, cable));
  }

  const assignments = rawMap instanceof Map
    ? rawMap
    : new Map(Object.entries(rawMap ?? {}));
  const result = new Map(conduits.map(conduit => [recordId(conduit), []]).filter(([id]) => id));

  for (const [conduitId, assigned] of assignments) {
    const id = normalizeAssignmentToken(conduitId);
    if (!id) continue;
    const assignedList = Array.isArray(assigned) ? assigned : [assigned];
    const resolved = assignedList
      .map(item => typeof item === 'object' ? item : cableByKey.get(normalizeAssignmentToken(item)))
      .filter(Boolean);
    result.set(id, [...(result.get(id) ?? []), ...resolved]);
  }
  return result;
}

export function buildConduitCableMap(conduits = [], cables = [], rawMap = null) {
  if (rawMap && (rawMap instanceof Map || Object.keys(rawMap).length > 0)) {
    return mapFromExplicitAssignments(conduits, cables, rawMap);
  }

  const conduitIds = new Set(conduits.map(conduit => recordId(conduit)).filter(Boolean));
  const result = new Map([...conduitIds].map(id => [id, []]));

  for (const cable of cables) {
    for (const racewayId of extractRacewayIds(cable)) {
      if (!conduitIds.has(racewayId)) continue;
      result.get(racewayId).push(cable);
    }
  }
  return result;
}

export function evaluateConduitFill(conduit, cables = []) {
  const conduitId = recordId(conduit);
  const conduitType = conduitTypeFromRecord(conduit);
  const tradeSize = normalizeTradeSize(firstText(conduit, CONDUIT_SIZE_FIELDS), conduitType);
  const internalAreaIn2 = conduitInternalArea(conduitType, tradeSize);
  const assignedCables = cables.filter(Boolean);
  const missingAreaCables = [];
  let cableAreaTotalIn2 = 0;
  let count = 0;

  for (const cable of assignedCables) {
    const area = cableAreaIn2(cable);
    const multiplier = physicalCableCount(cable);
    count += multiplier;
    if (!area) {
      missingAreaCables.push(normalizeCableReference(cable) || '(unnamed cable)');
      continue;
    }
    cableAreaTotalIn2 += area * multiplier;
  }

  const limit = conduitFillLimit(count);
  const fillPercent = internalAreaIn2 ? (cableAreaTotalIn2 / internalAreaIn2) * 100 : null;

  return {
    conduitId,
    conduitType,
    tradeSize,
    internalAreaIn2,
    cableAreaTotalIn2,
    cableCount: count,
    fillLimit: limit,
    fillPercent,
    assignedCableNames: assignedCables.map(cable => normalizeCableReference(cable)).filter(Boolean),
    missingAreaCables,
  };
}

function text(value) {
  return String(value ?? '').trim();
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ductbankId(ductbank = {}) {
  return text(ductbank.ductbank_id || ductbank.id || ductbank.tag);
}

function conduitId(conduit = {}) {
  return text(conduit.conduit_id || conduit.id || conduit.tag);
}

function normalizeConduitType(value) {
  const normalized = text(value).toLowerCase().replace(/[-_]+/g, ' ');
  if (normalized.includes('pvc') && normalized.includes('40')) return 'PVC Sch 40';
  if (normalized.includes('rmc') || normalized.includes('rigid') || normalized.includes('steel')) return 'RMC';
  if (normalized.includes('emt')) return 'EMT';
  return text(value) || 'PVC Sch 40';
}

function normalizeTradeSize(value) {
  return text(value).replace(/[\"\u2033]/g, '').trim();
}

function normalizeMaterial(value) {
  const normalized = text(value).toLowerCase();
  if (normalized === 'al' || normalized.includes('aluminum') || normalized.includes('aluminium')) return 'Aluminum';
  return 'Copper';
}

function cableAssignments(cable = {}) {
  const values = [cable.conduit_id, cable.conduit, cable.ductbank_id, cable.raceway_id, cable.route_preference];
  if (Array.isArray(cable.raceway_ids)) values.push(...cable.raceway_ids);
  else if (cable.raceway_ids) values.push(...text(cable.raceway_ids).split(','));
  return values.map(text).filter(Boolean);
}

function normalizeConduit(conduit = {}, index = 0) {
  const column = Math.max(1, finite(conduit.column, (index % 4) + 1));
  const row = Math.max(1, finite(conduit.row, Math.floor(index / 4) + 1));
  return {
    conduit_id: conduitId(conduit),
    conduit_type: normalizeConduitType(conduit.conduit_type || conduit.type || conduit.material),
    trade_size: normalizeTradeSize(conduit.trade_size || conduit.size),
    x: finite(conduit.x ?? conduit.offset_x, (column - 1) * 8),
    y: finite(conduit.y ?? conduit.offset_y, (row - 1) * 8),
    spare: conduit.spare === true,
  };
}

function normalizeCable(cable = {}, assignedConduitId = '') {
  return {
    tag: text(cable.tag || cable.name || cable.id),
    cable_type: text(cable.cable_type || cable.type) || 'Power',
    diameter: finite(cable.diameter ?? cable.cable_od ?? cable.OD ?? cable.od),
    conductors: Math.max(1, finite(cable.conductors ?? cable.count ?? cable.conductors_count, 3)),
    conductor_size: text(cable.conductor_size || cable.size),
    insulation_thickness: finite(cable.insulation_thickness),
    weight: finite(cable.weight),
    est_load: finite(cable.est_load ?? cable.load_current ?? cable.current ?? cable.amps),
    conduit_id: assignedConduitId,
    conductor_material: normalizeMaterial(cable.conductor_material || cable.material),
    insulation_type: text(cable.insulation_type || cable.insulation) || 'XLPE',
    insulation_rating: text(cable.insulation_rating || cable.temperature_rating) || '90',
    voltage_rating: text(cable.voltage_rating || cable.cable_rating || cable.rating),
    shielding_jacket: text(cable.shielding_jacket || cable.shielding),
  };
}

export function parseDuctbankRouteData(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function buildProjectDuctbankRoute({ ductbanks = [], conduits = [], cables = [] } = {}) {
  const ductbank = Array.isArray(ductbanks) ? ductbanks.find(Boolean) : null;
  if (!ductbank) return null;

  const id = ductbankId(ductbank);
  const nestedConduits = Array.isArray(ductbank.conduits) ? ductbank.conduits : [];
  let routeConduits = nestedConduits;
  if (!routeConduits.length && Array.isArray(conduits)) {
    routeConduits = conduits.filter(conduit => text(conduit.ductbank_id || conduit.parent_id) === id);
    if (!routeConduits.length && ductbanks.length === 1) routeConduits = conduits;
  }
  const normalizedConduits = routeConduits.map(normalizeConduit).filter(conduit => conduit.conduit_id);
  const conduitIds = new Set(normalizedConduits.map(conduit => conduit.conduit_id));
  const availableConduits = normalizedConduits.filter(conduit => !conduit.spare);

  const matchingCables = (Array.isArray(cables) ? cables : []).filter(cable => {
    const assignments = cableAssignments(cable);
    return assignments.includes(id) || assignments.some(assignment => conduitIds.has(assignment));
  });
  const normalizedCables = matchingCables.map((cable, index) => {
    const explicitConduit = cableAssignments(cable).find(assignment => conduitIds.has(assignment));
    const fallbackConduit = availableConduits[index % Math.max(availableConduits.length, 1)]?.conduit_id || '';
    return normalizeCable(cable, explicitConduit || fallbackConduit);
  });

  return {
    ductbank,
    cables: normalizedCables,
    conduits: normalizedConduits,
    conduitId: '',
  };
}

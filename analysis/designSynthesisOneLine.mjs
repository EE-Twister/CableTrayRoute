import { sourcedCableImpedance as catalogImpedance } from './designSynthesisCableCatalog.mjs';

/**
 * Build the canonical One-Line envelope for a design-synthesis proposal.
 * Physical coordinates remain in `physical` metadata; diagram layout uses a
 * deterministic two-dimensional grid so plant coordinates do not overlap the
 * electrical drawing.
 */
function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function projectCable(cable, cableId) {
  const fields = ['id', 'tag', 'from', 'to', 'from_id', 'to_id', 'from_tag', 'to_tag', 'conductor_size', 'conductorSize', 'ampacityA', 'currentA', 'current', 'voltage', 'phases', 'powerFactor', 'voltageDropPct', 'voltage_drop_pct', 'length', 'lengthFt', 'length_ft', 'r_ohm_per_kft', 'x_ohm_per_kft', 'impedance', 'impedanceBasis', 'cableConstructionSource', 'cableStockId', 'cableCatalogFingerprint', 'designCurrentA', 'designAmpacityA', 'motor', 'sizing_warning', 'racewayId', 'tray_id', 'routePreference'];
  const projected = {};
  for (const field of fields) if (cable?.[field] !== undefined) projected[field] = clone(cable[field]);
  if (cable?.branchProtectionMethod === 'inverse-time-breaker') {
    for (const field of ['protectiveDevice', 'protectiveDeviceCandidates', 'protectiveRequirement', 'branchProtectionMethod', 'branchCircuitBreakerAmpacityFloorA', 'sizingStatus', 'sizingBasis']) {
      if (cable[field] !== undefined) projected[field] = clone(cable[field]);
    }
  }
  projected.id = projected.id || cableId;
  projected.tag = projected.tag || cableId;
  projected.conductor_size = projected.conductor_size || projected.conductorSize;
  projected.conductorSize = projected.conductorSize || projected.conductor_size;
  if (projected.r_ohm_per_kft === undefined || projected.x_ohm_per_kft === undefined) {
    const catalog = catalogImpedance(projected.conductor_size, projected.lengthFt ?? projected.length_ft ?? projected.length);
    if (catalog) {
      projected.r_ohm_per_kft = catalog.r_ohm_per_kft;
      projected.x_ohm_per_kft = catalog.x_ohm_per_kft;
      projected.impedanceBasis = catalog.source;
    }
  }
  return projected;
}

function component({ id, type, tag, physical, scheduleLinks, index, total }) {
  const links = { ...(scheduleLinks || {}), ref: scheduleLinks?.ref || id, label: scheduleLinks?.label || tag };
  const sourceBasis = type === 'utility_source' ? {
    sourceId: physical?.id || id,
    sourceTag: physical?.tag || tag || id,
    voltage: physical?.voltage,
    phases: physical?.phases,
    frequencyHz: physical?.frequencyHz,
    capacityKva: physical?.capacityKva,
    availableFaultCurrentKA: physical?.availableFaultCurrentKA,
  } : {};
  return {
    id: String(id),
    type,
    tag: tag || String(id),
    label: tag || String(id),
    ref: String(id),
    x: 120 + ((index % 6) * 180),
    y: 100 + (Math.floor(index / 6) * 130),
    voltage: physical?.voltage,
    phases: physical?.phases,
    kw: physical?.kw,
    currentA: physical?.currentA || physical?.current,
    powerFactor: physical?.powerFactor,
    physical: physical ? clone(physical) : undefined,
    equipmentRef: links.equipmentRef,
    loadRef: links.loadRef,
    panelRef: links.panelRef,
    scheduleLinks: links,
    ...sourceBasis,
    busType: type === 'utility_source' ? 'slack' : (type === 'panel' || type === 'load' || type === 'bus' ? 'PQ' : undefined),
    load: type === 'load' && physical?.kw !== undefined ? { kw: physical.kw, kvar: physical.kvar ?? (physical.powerFactor > 0 && physical.powerFactor < 1 ? physical.kw * Math.tan(Math.acos(physical.powerFactor)) : 0) } : undefined,
    connections: [],
    meta: { source: 'design-synthesis', layoutIndex: index, layoutCount: total },
  };
}

/**
 * @param {{supply?: object, panels?: object[], loads?: object[], cables?: object[], transformers?: object[], terminalBuses?: object[]}} input
 * @returns {{activeSheet: number, sheets: object[]}}
 */
export function buildDesignSynthesisOneLine({ supply = {}, panels = [], loads = [], cables = [], transformers = [], terminalBuses = [] } = {}) {
  const records = [];
  const sourceId = String(supply.id || 'SOURCE');
  const sourceTag = String(supply.tag || sourceId || 'SOURCE');
  records.push(component({ id: sourceId, type: 'utility_source', tag: sourceTag, physical: supply, scheduleLinks: { supply: sourceId, equipment: sourceTag, equipmentRef: sourceId, ref: sourceId }, index: 0, total: panels.length + loads.length + 1 }));
  panels.forEach((panel, index) => { const id = panel.id || panel.tag; records.push(component({ id, type: 'panel', tag: panel.tag || id, physical: panel, scheduleLinks: { panel: panel.tag || id, panelRef: id, ref: id }, index: index + 1, total: panels.length + loads.length + 1 })); });
  terminalBuses.forEach((bus, index) => { const id = bus.id; records.push(component({ id, type: 'bus', tag: bus.tag || id, physical: { ...bus, baseKV: Number(bus.voltage) / 1000 }, scheduleLinks: { equipment: bus.tag || id, equipmentRef: id, ref: id }, index: panels.length + index + 1, total: panels.length + loads.length + terminalBuses.length + transformers.length + 1 })); });
  transformers.forEach((transformer, index) => {
    const id = transformer.id;
    const row = component({ id, type: 'transformer', tag: transformer.tag || id, physical: transformer, scheduleLinks: { equipment: transformer.tag || id, equipmentRef: id, ref: id }, index: panels.length + terminalBuses.length + index + 1, total: panels.length + loads.length + terminalBuses.length + transformers.length + 1 });
    row.subtype = 'two_winding';
    row.volts_primary = transformer.primaryVoltageVac;
    row.volts_secondary = transformer.secondaryVoltageVac;
    row.kva = transformer.ratedKVA;
    row.percent_z = transformer.seriesModel?.zPercent;
    row.xr_ratio = transformer.seriesModel?.xr;
    row.coreLossKw = transformer.coreLossKw;
    row.primary_connection = transformer.primaryConnection;
    row.secondary_connection = transformer.secondaryConnection;
    row.phaseShiftModel = 'magnitude-only-zero-angle-assumption';
    row.connections = [{ target: transformer.primaryBusId, sourcePort: 0 }, { target: transformer.secondaryBusId, sourcePort: 1 }];
    records.push(row);
  });
  loads.forEach((load, index) => { const id = load.id || load.tag; records.push(component({ id, type: 'load', tag: load.tag || id, physical: load, scheduleLinks: { equipment: load.tag || id, equipmentRef: id, load: load.tag || id, loadRef: id, panel: load.panelRef || load.panelId, ref: id }, index: panels.length + terminalBuses.length + transformers.length + index + 1, total: panels.length + loads.length + terminalBuses.length + transformers.length + 1 })); });
  const byId = new Map(records.map(record => [record.id, record]));
  const connections = [];
  for (const cable of cables) {
    const from = String(cable.from || cable.from_id || cable.from_tag || '');
    const to = String(cable.to || cable.to_id || cable.to_tag || cable.loadId || '');
    const source = byId.get(from) || records.find(record => record.tag === from);
    const target = byId.get(to) || records.find(record => record.tag === to);
    if (!source || !target) continue;
    const cableId = String(cable.id || `${source.id}->${target.id}`);
    const cableRecord = projectCable(cable, cableId);
    const connection = { id: cableId, target: target.id, sourcePort: 0, targetPort: 0, cable: cableRecord, ampacityA: cableRecord.ampacityA, rating: cableRecord.ampacityA, cableRef: cableId, cableId, scheduleLinks: { cable: cableRecord.tag, cableRef: cableId, ref: cableId } };
    source.connections.push(connection);
    connections.push({ ...connection, from: source.id, to: target.id });
  }
  return { activeSheet: 0, sheets: [{ id: 'design-synthesis', name: 'Design Synthesis', components: records, connections }] };
}

export default { buildDesignSynthesisOneLine };

import componentLibrary from '../componentLibrary.json' with { type: 'json' };
import { normalizeVoltageToVolts, toBaseKV } from '../utils/voltage.js';

const DEFAULT_COMPONENT_DEFINITIONS = [
  { type: 'bus', subtype: 'Bus' }
];

function compKey(type, subtype) {
  return subtype ? `${type}_${subtype}` : type;
}

function buildComponentTypeMap() {
  const map = new Map();
  const register = definition => {
    if (!definition || typeof definition !== 'object') return;
    const subtype = typeof definition.subtype === 'string' ? definition.subtype.trim() : '';
    if (!subtype) return;
    const baseType = (typeof definition.type === 'string' && definition.type.trim())
      || (typeof definition.category === 'string' && definition.category.trim())
      || subtype;
    const key = compKey(baseType, subtype);
    map.set(key, baseType);
    map.set(subtype, baseType);
    map.set(baseType, baseType);
  };

  const libraryDefs = Array.isArray(componentLibrary?.components)
    ? componentLibrary.components
    : [];
  libraryDefs.forEach(register);
  DEFAULT_COMPONENT_DEFINITIONS.forEach(register);
  return map;
}

const componentTypeBySubtype = buildComponentTypeMap();

function normalizePortIndex(port) {
  const idx = Number(port);
  return Number.isFinite(idx) ? idx : null;
}

function getTransformerPortRole(comp, portIndex) {
  if (!comp || (comp.type !== 'transformer' && !String(comp.subtype || '').includes('transformer'))) {
    return null;
  }
  const idx = normalizePortIndex(portIndex);
  if (idx === null) return null;
  if (comp.subtype === 'three_winding') {
    if (idx === 0) return 'primary';
    if (idx === 1) return 'secondary';
    if (idx === 2) return 'tertiary';
  }
  if (idx === 0) return 'primary';
  if (idx === 1) return 'secondary';
  if (idx === 2) return 'tertiary';
  return null;
}

function getTransformerConnectionSetting(comp, role) {
  if (!comp || !role) return null;
  const key = `${role}_connection`;
  const value = comp[key] ?? comp.props?.[key];
  return typeof value === 'string' ? value : null;
}

function toNumber(value, scale = 1) {
  const num = Number(value);
  return Number.isFinite(num) ? num * scale : 0;
}

function addPQ(target, addition) {
  if (!addition) return target;
  const out = target && typeof target === 'object' ? { ...target } : {};
  if (addition.kw !== undefined) out.kw = toNumber(out.kw) + addition.kw;
  if (addition.kvar !== undefined) out.kvar = toNumber(out.kvar) + addition.kvar;
  return out;
}

function extractPQ(source) {
  if (source === null || source === undefined) return null;
  if (typeof source === 'number') {
    const kw = toNumber(source);
    return kw ? { kw, kvar: 0 } : null;
  }
  if (Array.isArray(source)) {
    return source.reduce((acc, item) => addPQ(acc, extractPQ(item)), null);
  }
  if (typeof source !== 'object') return null;
  let kw = toNumber(source.kw ?? source.kW ?? source.P ?? source.p);
  let kvar = toNumber(source.kvar ?? source.kVAr ?? source.Q ?? source.q);
  if (!kw && !kvar) {
    let nested = null;
    Object.keys(source).forEach(key => {
      const child = source[key];
      if (!child || typeof child !== 'object') return;
      const pq = extractPQ(child);
      if (pq) nested = addPQ(nested, pq);
    });
    if (nested) return nested;
  }
  if (!kw && !kvar) return null;
  return { kw, kvar };
}

function isLoadDevice(comp) {
  const type = String(comp?.type || '').toLowerCase();
  const subtype = String(comp?.subtype || '').toLowerCase();
  return type.includes('load') || subtype.includes('load');
}

function isGeneratorDevice(comp) {
  const type = String(comp?.type || '').toLowerCase();
  const subtype = String(comp?.subtype || '').toLowerCase();
  return type.includes('generator') || subtype.includes('generator') || type.includes('source');
}

function extractLoadPQ(comp) {
  const sources = [comp?.load, comp?.props?.load, comp?.parameters?.load];
  let total = null;
  sources.forEach(src => {
    const pq = extractPQ(src);
    if (pq) total = addPQ(total, pq);
  });
  if (!total && isLoadDevice(comp)) {
    let kw = 0;
    let kvar = 0;
    kw += toNumber(comp?.kw ?? comp?.kW);
    kw += toNumber(comp?.watts, 0.001);
    kw += toNumber(comp?.hp, 0.746);
    kvar += toNumber(comp?.kvar ?? comp?.kVAr);
    if (kw || kvar) total = addPQ(total, { kw, kvar });
  }
  return total;
}

function extractGenerationPQ(comp) {
  const sources = [comp?.generation, comp?.props?.generation, comp?.parameters?.generation];
  let total = null;
  sources.forEach(src => {
    const pq = extractPQ(src);
    if (pq) total = addPQ(total, pq);
  });
  if (!total && isGeneratorDevice(comp)) {
    let kw = toNumber(comp?.kw ?? comp?.kW ?? comp?.power_kw ?? comp?.output_kw);
    let kvar = toNumber(comp?.kvar ?? comp?.kVAr ?? comp?.reactive_kw);
    if (!kw) {
      const kva = toNumber(comp?.kva ?? comp?.kVA) + toNumber(comp?.mva ?? comp?.MVA, 1000);
      const pf = Number(comp?.pf ?? comp?.power_factor ?? comp?.powerFactor);
      if (kva && Number.isFinite(pf) && pf !== 0) {
        kw = kva * pf;
        if (!kvar) {
          const kvarMag = Math.sqrt(Math.max(0, kva * kva - kw * kw));
          kvar = kvarMag;
        }
      }
    }
    if (kw || kvar) total = addPQ(total, { kw, kvar });
  }
  return total;
}

function findDirectBusId(comp, busMap) {
  const connections = Array.isArray(comp?.connections) ? comp.connections : [];
  for (const conn of connections) {
    const target = typeof conn === 'string' ? conn : conn?.target;
    if (target && busMap.has(target)) return target;
  }
  return null;
}

function findNearestBusId(comp, busMap, adjacency) {
  if (!comp || !comp.id) return null;
  const direct = findDirectBusId(comp, busMap);
  if (direct) return direct;
  if (!adjacency) return null;
  const visited = new Set([comp.id]);
  const queue = [{ id: comp.id, depth: 0 }];
  const maxDepth = 3;
  while (queue.length) {
    const { id, depth } = queue.shift();
    if (depth >= maxDepth) continue;
    const neighbors = adjacency.get(id);
    if (!neighbors) continue;
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      if (busMap.has(neighbor)) return neighbor;
      visited.add(neighbor);
      queue.push({ id: neighbor, depth: depth + 1 });
    }
  }
  return null;
}

export function isBusComponent(comp) {
  if (!comp) return false;
  if (comp.type === 'bus' || comp.subtype === 'Bus') return true;
  const subtype = typeof comp.subtype === 'string' ? comp.subtype : '';
  const type = typeof comp.type === 'string' ? comp.type : '';
  const metaType = componentTypeBySubtype.get(subtype)
    || componentTypeBySubtype.get(compKey(type, subtype))
    || componentTypeBySubtype.get(type);
  return metaType === 'bus';
}

const BRANCH_KEYWORDS = [
  'cable',
  'feeder',
  'conductor',
  'transformer',
  'breaker',
  'switch',
  'recloser',
  'disconnect',
  'busway',
  'link',
  'line',
  'sectionalizer',
  'tie',
  'reactor',
  'capacitor',
  'impedance'
];

function isBranchDevice(comp) {
  if (!comp || typeof comp !== 'object') return false;
  if (isBusComponent(comp)) return false;
  const type = String(comp.type || '').toLowerCase();
  const subtype = String(comp.subtype || '').toLowerCase();
  if (type.includes('load') || subtype.includes('load')) return false;
  if (BRANCH_KEYWORDS.some(keyword => type.includes(keyword) || subtype.includes(keyword))) {
    return true;
  }
  if (comp.cable || comp.impedance || comp.seriesImpedance) return true;
  if (Array.isArray(comp.connections) && comp.connections.length > 1) {
    return true;
  }
  return false;
}

export function cloneData(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map(cloneData);
  }
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(key => {
      const val = value[key];
      if (val !== undefined) out[key] = cloneData(val);
    });
    return out;
  }
  return value;
}

function extractImpedance(comp) {
  const candidates = [
    comp?.impedance,
    comp?.seriesImpedance,
    comp?.cable?.impedance,
    comp?.cable,
    comp?.props?.impedance,
    comp?.parameters?.impedance
  ];
  for (const cand of candidates) {
    if (cand && typeof cand === 'object') return cand;
  }
  if (typeof comp?.r === 'number' || typeof comp?.x === 'number') {
    return { r: comp.r || 0, x: comp.x || 0 };
  }
  return { r: 0, x: 0 };
}

function normalizeSheets(sheets = []) {
  if (!Array.isArray(sheets)) {
    return { components: [], connections: [] };
  }
  if (Array.isArray(sheets[0]?.components)) {
    const components = [];
    const connections = [];
    sheets.forEach(sheet => {
      if (Array.isArray(sheet?.components)) components.push(...sheet.components);
      if (Array.isArray(sheet?.connections)) connections.push(...sheet.connections);
    });
    return { components, connections };
  }
  return { components: sheets, connections: [] };
}

function cloneBusComponent(comp) {
  const clone = { ...comp };
  clone.connections = Array.isArray(comp.connections)
    ? comp.connections.map(conn => ({ ...conn }))
    : [];
  const base = resolveBusBaseKV(comp);
  if (Number.isFinite(base) && base > 0) {
    clone.baseKV = base;
  } else if (!Number.isFinite(clone.baseKV) || clone.baseKV <= 0) {
    clone.baseKV = 0.48;
  }
  return clone;
}

function resolveBusBaseKV(comp) {
  if (!comp || typeof comp !== 'object') return null;
  const direct = [
    comp.baseKV,
    comp.kV,
    comp.kv,
    comp.nominalVoltage,
    comp.nominal_voltage,
    comp.prefault_voltage,
    comp.voltage,
    comp.volts,
    comp.props?.baseKV,
    comp.props?.voltage,
    comp.parameters?.baseKV,
    comp.parameters?.voltage
  ];
  for (const candidate of direct) {
    const base = toBaseKV(candidate);
    if (Number.isFinite(base) && base > 0) return base;
  }
  const volts = normalizeVoltageToVolts(comp?.props?.operating_voltage ?? comp?.cable?.operating_voltage);
  if (Number.isFinite(volts) && volts > 0) return volts / 1000;
  return null;
}

function registerConnection(map, from, to) {
  if (!from || !to) return;
  if (!map.has(from)) map.set(from, new Set());
  map.get(from).add(to);
}

export function buildLoadFlowModel(oneLine = {}) {
  const { sheets } = oneLine;
  const { components, connections } = normalizeSheets(sheets);
  const adjacency = new Map();

  components.forEach(comp => {
    const connList = Array.isArray(comp?.connections) ? comp.connections : [];
    connList.forEach(conn => {
      const target = typeof conn === 'string' ? conn : conn?.target;
      if (!target) return;
      registerConnection(adjacency, comp.id, target);
      registerConnection(adjacency, target, comp.id);
    });
  });
  connections.forEach(link => {
    if (!link) return;
    registerConnection(adjacency, link.from, link.to);
    registerConnection(adjacency, link.to, link.from);
  });

  let buses = components.filter(isBusComponent).map(cloneBusComponent);
  if (buses.length === 0) {
    buses = components.map(cloneBusComponent);
  }
  const busMap = new Map(buses.map(b => [b.id, b]));

  components.forEach(comp => {
    if (!comp || isBusComponent(comp) || typeof comp.busType === 'string' && comp.busType) return;
    const busId = findDirectBusId(comp, busMap) || findNearestBusId(comp, busMap, adjacency);
    if (!busId) return;
    const bus = busMap.get(busId);
    if (!bus) return;
    const load = extractLoadPQ(comp);
    if (load) bus.load = addPQ(bus.load, load);
    const gen = extractGenerationPQ(comp);
    if (gen) bus.generation = addPQ(bus.generation, gen);
  });

  const branches = [];
  components.forEach(comp => {
    if (!isBranchDevice(comp)) return;
    const busTargets = [];
    const connList = Array.isArray(comp.connections) ? comp.connections : [];
    connList.forEach(conn => {
      const target = typeof conn === 'string' ? conn : conn?.target;
      if (target && busMap.has(target) && !busTargets.includes(target)) {
        busTargets.push(target);
      }
    });
    if (busTargets.length < 2) {
      const neighborSet = adjacency.get(comp.id);
      if (neighborSet) {
        neighborSet.forEach(n => {
          if (busMap.has(n) && !busTargets.includes(n)) {
            busTargets.push(n);
          }
        });
      }
    }
    if (busTargets.length < 2) return;
    const [fromId, ...otherTargets] = busTargets;
    otherTargets.forEach(toId => {
      if (!busMap.has(fromId) || !busMap.has(toId)) return;
      const impedance = cloneData(extractImpedance(comp));
      const tap = cloneData(comp.tap);
      const shunt = cloneData(comp.shunt);
      const rating = comp.rating ?? comp.ampacity ?? comp.currentRating;
      const phases = comp.phases ? cloneData(comp.phases) : undefined;
      const componentName = typeof comp.name === 'string' ? comp.name : undefined;
      const componentLabel = typeof comp.label === 'string' ? comp.label : undefined;
      const componentRef = typeof comp.ref === 'string' ? comp.ref : undefined;
      const branch = {
        id: comp.id,
        type: comp.type,
        subtype: comp.subtype,
        from: fromId,
        to: toId,
        impedance,
        tap,
        shunt,
        rating,
        phases,
        name: componentName,
        label: componentLabel,
        ref: componentRef
      };
      branches.push(branch);
      const fromBus = busMap.get(fromId);
      if (fromBus) {
        if (!Array.isArray(fromBus.connections)) fromBus.connections = [];
        const exists = fromBus.connections.some(conn => conn.target === toId && (conn.componentId || conn.id) === comp.id);
        if (!exists) {
          const connectionEntry = connList.find(item => {
            if (!item) return false;
            const targetId = typeof item === 'string' ? item : item?.target;
            return targetId === toId;
          });
          const portIndex = normalizePortIndex(
            connectionEntry && typeof connectionEntry === 'object'
              ? connectionEntry.sourcePort
              : undefined
          );
          const connectionSide = getTransformerPortRole(comp, portIndex);
          const connectionConfig = connectionSide ? getTransformerConnectionSetting(comp, connectionSide) : null;
          const busConn = {
            target: toId,
            impedance: cloneData(branch.impedance),
            tap: branch.tap ? cloneData(branch.tap) : undefined,
            shunt: branch.shunt ? cloneData(branch.shunt) : undefined,
            rating: branch.rating,
            phases,
            componentId: comp.id,
            componentType: comp.type,
            componentSubtype: comp.subtype,
            componentName,
            componentLabel,
            componentRef,
            componentPort: portIndex,
            connectionSide,
            connectionConfig
          };
          fromBus.connections.push(busConn);
        }
      }
    });
  });

  return { buses, branches };
}

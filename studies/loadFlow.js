import componentLibrary from '../componentLibrary.json' with { type: 'json' };
import { runLoadFlow } from '../analysis/loadFlow.js';
import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';
import { downloadPDF } from '../reports/reporting.mjs';

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

function isBusComponent(comp) {
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

function cloneData(value) {
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
  return clone;
}

function registerConnection(map, from, to) {
  if (!from || !to) return;
  if (!map.has(from)) map.set(from, new Set());
  map.get(from).add(to);
}

/**
 * Run a Newton–Raphson power flow using network data from dataStore.
 * Results are stored in the global studies object and a PDF report is generated.
 * @param {{baseMVA?:number, balanced?:boolean}} opts
 * @returns {Object}
 */
export function buildModel() {
  const { sheets } = getOneLine();
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
        phases
      };
      branches.push(branch);
      const fromBus = busMap.get(fromId);
      if (fromBus) {
        if (!Array.isArray(fromBus.connections)) fromBus.connections = [];
        const exists = fromBus.connections.some(conn => conn.target === toId && (conn.componentId || conn.id) === comp.id);
        if (!exists) {
          const conn = {
            target: toId,
            impedance: cloneData(branch.impedance),
            tap: branch.tap ? cloneData(branch.tap) : undefined,
            shunt: branch.shunt ? cloneData(branch.shunt) : undefined,
            rating: branch.rating,
            phases,
            componentId: comp.id
          };
          fromBus.connections.push(conn);
        }
      }
    });
  });

  return { buses, branches };
}

export function runLoadFlowStudy(opts = {}) {
  const model = buildModel();
  const res = runLoadFlow(model, opts);
  const studies = getStudies();
  studies.loadFlow = res;
  setStudies(studies);
  const headers = ['bus', 'Vm', 'Va'];
  const rows = res.buses.map(b => ({
    bus: b.id,
    Vm: Number(b.Vm.toFixed(4)),
    Va: Number(b.Va.toFixed(2))
  }));
  if (rows.length) {
    downloadPDF('Load Flow Report', headers, rows, 'loadflow.pdf');
  }
  return res;
}

// Browser hook: wire up form submission
if (typeof document !== 'undefined') {
  const form = document.getElementById('loadflow-form');
  const out = document.getElementById('loadflow-output');
  if (form && out) {
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const baseMVA = Number(form.baseMVA.value) || 100;
      const balanced = form.balanced.checked;
      const res = runLoadFlowStudy({ baseMVA, balanced });
      out.textContent = JSON.stringify(res, null, 2);
    });
  }
}

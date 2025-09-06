/**
 * Simple parser for Revit/IFC exports that extracts tray and conduit
 * geometry. The goal is not to support the full schemas but to pull out
 * basic start/end coordinates used by the app. The function accepts
 * either a JSON object/string or raw IFC STEP text.
 *
 * Returned geometry objects use the field names already consumed by the
 * data store (start_x, start_y, ...).
 *
 * @param {string|object} input - IFC STEP text or Revit JSON.
 * @returns {{trays:Array, conduits:Array}}
 */
function parseRevit(input) {
  if (typeof input === "string") {
    // Try JSON first – many exporters can emit JSON directly.
    try {
      const obj = JSON.parse(input);
      return parseRevitJSON(obj);
    } catch {
      // Treat as IFC STEP text
      return parseIFC(input);
    }
  }
  // Already an object – assume JSON structure
  return parseRevitJSON(input);
}

/**
 * Parse a Revit style JSON export. The exporter format is not
 * standardized so we try a few common field names.
 * @param {any} obj
 */
function parseRevitJSON(obj) {
  if (!obj || typeof obj !== "object") return { trays: [], conduits: [] };
  const trays = [];
  const conduits = [];

  const traySrc =
    obj.trays || obj.Trays || obj.cableTrays || obj.CableTrays || [];
  for (const t of traySrc) {
    trays.push(normalizeTray(t));
  }

  const conduitSrc =
    obj.conduits ||
    obj.Conduits ||
    obj.cableConduits ||
    obj.ConduitSegments ||
    [];
  for (const c of conduitSrc) {
    conduits.push(normalizeConduit(c));
  }

  return { trays, conduits };
}

function num(val) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeTray(t = {}) {
  return {
    id: t.id || t.tag || t.tray_id || t.TrayID || t.name || t.Tag || "",
    start_x: num(t.start_x ?? t.sx ?? t.x1 ?? t.StartX ?? t.start?.x),
    start_y: num(t.start_y ?? t.sy ?? t.y1 ?? t.StartY ?? t.start?.y),
    start_z: num(t.start_z ?? t.sz ?? t.z1 ?? t.StartZ ?? t.start?.z),
    end_x: num(t.end_x ?? t.ex ?? t.x2 ?? t.EndX ?? t.end?.x),
    end_y: num(t.end_y ?? t.ey ?? t.y2 ?? t.EndY ?? t.end?.y),
    end_z: num(t.end_z ?? t.ez ?? t.z2 ?? t.EndZ ?? t.end?.z),
    width: num(t.width ?? t.w ?? t.Width ?? t.size_x),
    height: num(t.height ?? t.h ?? t.Height ?? t.size_y),
  };
}

function normalizeConduit(c = {}) {
  return {
    conduit_id: c.conduit_id || c.id || c.tag || c.ConduitID || "",
    type: c.type || c.conduit_type || c.Type || "",
    trade_size: c.trade_size || c.tradeSize || c.size || c.TradeSize || "",
    start_x: num(c.start_x ?? c.sx ?? c.x1 ?? c.start?.x),
    start_y: num(c.start_y ?? c.sy ?? c.y1 ?? c.start?.y),
    start_z: num(c.start_z ?? c.sz ?? c.z1 ?? c.start?.z),
    end_x: num(c.end_x ?? c.ex ?? c.x2 ?? c.end?.x),
    end_y: num(c.end_y ?? c.ey ?? c.y2 ?? c.end?.y),
    end_z: num(c.end_z ?? c.ez ?? c.z2 ?? c.end?.z),
    capacity: num(c.capacity ?? c.fill),
  };
}

/**
 * Extremely small IFC STEP parser. It looks for entities that contain an
 * `IFCPOLYLINE` with two points – the start and end of a segment. If the
 * entity name includes `CABLECARRIER` it is treated as a tray; otherwise
 * it is treated as a conduit segment.
 *
 * This is a best‑effort helper and is not meant to cover the entire IFC
 * specification, but it is sufficient for small test files and demos.
 *
 * @param {string} text
 */
function parseIFC(text) {
  const trays = [];
  const conduits = [];
  const segRegex =
    /#\d+=IFC([^;]*?)SEGMENT[^;]*?IFCPOLYLINE\(\(([^)]+)\),\(([^)]+)\)\)/gi;
  let match;
  let i = 0;
  while ((match = segRegex.exec(text))) {
    const kind = match[1] || "";
    const start = match[2].split(",").map((v) => parseFloat(v));
    const end = match[3].split(",").map((v) => parseFloat(v));
    const seg = {
      id: `SEG-${i++}`,
      start_x: start[0],
      start_y: start[1],
      start_z: start[2],
      end_x: end[0],
      end_y: end[1],
      end_z: end[2],
    };
    if (/CABLECARRIER/i.test(kind)) trays.push(seg);
    else conduits.push(seg);
  }
  return { trays, conduits };
}

/**
 * Centralized data store wrapper around localStorage with typed getters and setters
 * for core schedule data. Emits simple change events.
 */


const KEYS = {
  // Preferred property names
  trays: 'traySchedule',
  cables: 'cableSchedule',
  ductbanks: 'ductbankSchedule',
  conduits: 'conduitSchedule',
  panels: 'panelSchedule',
  loads: 'loadList',
  equipment: 'equipment',
  oneLine: 'oneLineDiagram',
  // Legacy aliases for backward compatibility
  traySchedule: 'traySchedule',
  cableSchedule: 'cableSchedule',
  ductbankSchedule: 'ductbankSchedule',
  conduitSchedule: 'conduitSchedule',
  panelSchedule: 'panelSchedule',
  loadList: 'loadList',
  equipmentList: 'equipment',
  oneLineDiagram: 'oneLineDiagram'
};

const EXTRA_KEYS = {
  equipmentColumns: 'equipmentColumns',
  collapsedGroups: 'collapsedGroups'
};

const STORAGE_KEYS = { ...KEYS, ...EXTRA_KEYS };

const listeners = {};

function emit(event, detail) {
  (listeners[event] || []).forEach(fn => {
    try { fn(detail); } catch (e) { console.error(e); }
  });
}

/**
 * Subscribe to change events.
 * @param {string} event
 * @param {(data:any)=>void} handler
 */
function on(event, handler) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(handler);
}

/**
 * Remove an event listener.
 * @param {string} event
 * @param {(data:any)=>void} handler
 */
function off(event, handler) {
  const arr = listeners[event];
  if (!arr) return;
  const idx = arr.indexOf(handler);
  if (idx >= 0) arr.splice(idx, 1);
}

function read(key, fallback) {
  try {
    const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
    emit(key, value);
  } catch (e) {
    console.error('Failed to store', key, e);
  }
}

/**
 * @returns {Tray[]}
 */
const getTrays = () => read(KEYS.trays, []);
/**
 * @param {Tray[]} trays
 */
const setTrays = trays => write(KEYS.trays, trays);

/**
 * @returns {Cable[]}
 */
const getCables = () => read(KEYS.cables, []);
/**
 * @param {Cable[]} cables
 */
const setCables = cables => write(KEYS.cables, cables);

/**
 * @returns {Ductbank[]}
 */
const getDuctbanks = () => read(KEYS.ductbanks, []);
/**
 * @param {Ductbank[]} banks
 */
const setDuctbanks = banks => write(KEYS.ductbanks, banks);

/**
 * @returns {Conduit[]}
 */
const getConduits = () => read(KEYS.conduits, []);
/**
 * @param {Conduit[]} conduits
 */
const setConduits = conduits => write(KEYS.conduits, conduits);

/**
 * @returns {GenericRecord[]}
 */
const getPanels = () => read(KEYS.panels, []);
/**
 * @param {GenericRecord[]} panels
 */
const setPanels = panels => write(KEYS.panels, panels);

/**
 * @returns {GenericRecord[]}
 */
const getEquipment = () => read(KEYS.equipment, []);
/**
 * @param {GenericRecord[]} equipment
 */
function ensureEquipmentFields(eq) {
  return {
    id: '',
    description: '',
    voltage: '',
    category: '',
    subCategory: '',
    x: '',
    y: '',
    z: '',
    manufacturer: '',
    model: '',
    phases: '',
    notes: '',
    ...eq
  };
}

const setEquipment = list => write(KEYS.equipment, list.map(ensureEquipmentFields));

const addEquipment = item => {
  const list = getEquipment();
  list.push(ensureEquipmentFields(item));
  setEquipment(list);
};

const updateEquipment = (index, item) => {
  const list = getEquipment();
  if (index >= 0 && index < list.length) {
    list[index] = ensureEquipmentFields({ ...list[index], ...item });
    setEquipment(list);
  }
};

const removeEquipment = index => {
  const list = getEquipment();
  if (index >= 0 && index < list.length) {
    list.splice(index, 1);
    setEquipment(list);
  }
};

/**
 * @typedef {Object} OneLineComponent
 * @property {string} id Unique identifier
 * @property {string} type Component type (equipment, panel, load)
 * @property {number} x X coordinate
 * @property {number} y Y coordinate
 * @property {string} [label] Display label
 * @property {string} [ref] Linked schedule id
 * @property {{target:string, cable?:Cable}[]} [connections] Connections to other components with optional cable spec
 */

/**
 * @typedef {Object} OneLineSheet
 * @property {string} name
 * @property {OneLineComponent[]} components
 */

/**
 * Retrieve saved one-line sheets. Supports legacy single-sheet format.
 * @returns {OneLineSheet[]}
 */
const getOneLine = () => {
  const data = read(KEYS.oneLine, []);
  if (Array.isArray(data)) {
    // legacy array of components
    return [{ name: 'Sheet 1', components: data }];
  }
  if (data && Array.isArray(data.sheets)) return data.sheets;
  return [];
};
/**
 * Persist one-line sheets
 * @param {OneLineSheet[]} sheets
 */
const setOneLine = sheets => write(KEYS.oneLine, { sheets });

/**
 * @returns {GenericRecord[]}
 */
const getLoads = () => {
  const raw = read(KEYS.loads, []);
  const loads = raw.map(ensureLoadFields);
  if (raw.some(l => l && typeof l === 'object' && !('source' in l))) {
    write(KEYS.loads, loads);
  }
  return loads;
};
/**
 * @param {GenericRecord[]} loads
 */
function ensureLoadFields(load) {
  const l = { ...load };
  if ('power' in l && !('kw' in l)) {
    l.kw = l.power;
    delete l.power;
  }
  return {
    source: '',
    tag: '',
    description: '',
    quantity: '',
    voltage: '',
    loadType: '',
    duty: '',
    kw: '',
    powerFactor: '',
    loadFactor: '',
    efficiency: '',
    demandFactor: '',
    phases: '',
    circuit: '',
    manufacturer: '',
    model: '',
    notes: '',
    ...l
  };
}

function isEmptyLoad(load) {
  const l = ensureLoadFields(load);
  return Object.values(l).every(v => v === '');
}

const setLoads = loads => {
  const list = (loads.length ? loads : [{}]).map(ensureLoadFields);
  write(KEYS.loads, list);
};

const addLoad = load => {
  const loads = getLoads();
  const normalized = ensureLoadFields(load);
  if (loads.length === 1 && isEmptyLoad(loads[0]) && !isEmptyLoad(normalized)) {
    loads[0] = normalized;
  } else {
    loads.push(normalized);
  }
  setLoads(loads);
};

const insertLoad = (index, load) => {
  const loads = getLoads();
  const normalized = ensureLoadFields(load);
  const idx = Math.max(0, Math.min(index, loads.length));
  loads.splice(idx, 0, normalized);
  setLoads(loads);
};

const updateLoad = (index, load) => {
  const loads = getLoads();
  if (index >= 0 && index < loads.length) {
    loads[index] = ensureLoadFields({ ...loads[index], ...load });
    setLoads(loads);
  }
};

const deleteLoad = index => {
  const loads = getLoads();
  if (index >= 0 && index < loads.length) {
    loads.splice(index, 1);
    setLoads(loads);
  }
};

// Backward compatibility
const removeLoad = deleteLoad;

// generic access for other values so pages never touch localStorage directly
const getItem = (key, fallback = null) => read(key, fallback);
const setItem = (key, value) => write(key, value);
const removeItem = key => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    emit(key, null);
  } catch (e) {
    console.error('Failed to remove', key, e);
  }
};


const keys = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      return Object.keys(localStorage);
    }
  } catch {}
  return [];
};

// Simple schema validator replacing Ajv. Checks for required fields,
// disallows extras, and verifies basic types.
function validateProjectSchema(obj) {
  const required = ['ductbanks', 'conduits', 'trays', 'cables', 'panels', 'equipment', 'loads', 'settings'];
  const optional = ['oneLine'];
  const missing = [];
  const extra = [];

  if (!obj || typeof obj !== 'object') {
    missing.push(...required);
    return { valid: false, missing, extra };
  }

  for (const key of required) {
    if (!(key in obj)) missing.push(key);
  }
  for (const key of Object.keys(obj)) {
    if (!required.includes(key) && !optional.includes(key)) extra.push(key);
  }

  const typesValid = Array.isArray(obj.ductbanks) &&
    Array.isArray(obj.conduits) &&
    Array.isArray(obj.trays) &&
    Array.isArray(obj.cables) &&
    Array.isArray(obj.panels) &&
    Array.isArray(obj.equipment) &&
    Array.isArray(obj.loads) &&
    obj.settings && typeof obj.settings === 'object' && !Array.isArray(obj.settings) &&
    (obj.oneLine === undefined || Array.isArray(obj.oneLine));

  const valid = missing.length === 0 && extra.length === 0 && typesValid;
  return { valid, missing, extra };
}

/**
 * Export current project data.
 */
function exportProject() {
  const project = {
    ductbanks: getDuctbanks(),
    conduits: getConduits(),
    trays: getTrays(),
    cables: getCables(),
    panels: getPanels(),
    equipment: getEquipment(),
    loads: getLoads(),
    oneLine: getOneLine(),
    settings: {}
  };
  const reserved = new Set([...Object.values(KEYS), 'CTR_PROJECT_V1']);
  for (const key of keys()) {
    if (!reserved.has(key)) {
      project.settings[key] = getItem(key);
    }
  }
  return project;
}

/**
 * Import tray and conduit geometry from a CAD export file (Revit JSON or IFC).
 * Updates the current data store schedules.
 *
 * @param {File|string} file Input file or raw text
 * @returns {Promise<{trays:any[], conduits:any[]}>}
 */
async function importFromCad(file) {
  let text;
  if (typeof file === 'string') {
    text = file;
  } else if (file && typeof file.text === 'function') {
    text = await file.text();
  } else {
    throw new Error('Unsupported CAD file');
  }

  const { trays = [], conduits = [] } = parseRevit(text);
  if (Array.isArray(trays) && trays.length) setTrays(trays);
  if (Array.isArray(conduits) && conduits.length) setConduits(conduits);
  return { trays, conduits };
}

/**
 * Export tray and conduit geometry to a CAD-friendly format. Currently
 * only JSON is supported. When executed in a browser environment the
 * file is automatically downloaded.
 *
 * @param {string} [fileType='json']
 * @returns {string} serialized content
 */
function exportToCad(fileType = 'json') {
  const data = { trays: getTrays(), conduits: getConduits() };
  let mime = 'application/json';
  let ext = 'json';
  let content = JSON.stringify(data, null, 2);

  if (fileType === 'csv') {
    const trayHeader = 'id,start_x,start_y,start_z,end_x,end_y,end_z,width,height';
    const trayRows = data.trays.map(t => [t.id, t.start_x, t.start_y, t.start_z, t.end_x, t.end_y, t.end_z, t.width, t.height].join(','));
    const conduitHeader = 'conduit_id,type,trade_size,start_x,start_y,start_z,end_x,end_y,end_z,capacity';
    const conduitRows = data.conduits.map(c => [c.conduit_id, c.type, c.trade_size, c.start_x, c.start_y, c.start_z, c.end_x, c.end_y, c.end_z, c.capacity].join(','));
    content = `# trays\n${[trayHeader, ...trayRows].join('\n')}\n# conduits\n${[conduitHeader, ...conduitRows].join('\n')}`;
    mime = 'text/csv';
    ext = 'csv';
  }

  if (typeof document !== 'undefined') {
    try {
      const blob = new Blob([content], { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `raceways.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error('Failed to export CAD data', e);
    }
  }
  return content;
}

/**
 * Import project data with schema validation.
 * @param {any} obj
 * @returns {boolean} success
 */
function importProject(obj) {
  let data = obj;
  const { valid, missing, extra } = validateProjectSchema(data);
  if (!valid) {
    const parts = [];
    if (missing.length) parts.push(`Missing fields: ${missing.join(', ')}`);
    if (extra.length) parts.push(`Extra fields: ${extra.join(', ')}`);
    const msg = parts.join('\n') || 'Invalid project data.';
    const proceed = (typeof window !== 'undefined' && typeof window.confirm === 'function')
      ? window.confirm(`${msg}\nRepair & continue?`)
      : false;
    if (!proceed) return false;
    data = {
      ductbanks: Array.isArray(obj.ductbanks) ? obj.ductbanks : [],
      conduits: Array.isArray(obj.conduits) ? obj.conduits : [],
      trays: Array.isArray(obj.trays) ? obj.trays : [],
      cables: Array.isArray(obj.cables) ? obj.cables : [],
      panels: Array.isArray(obj.panels) ? obj.panels : [],
      equipment: Array.isArray(obj.equipment) ? obj.equipment : [],
      loads: Array.isArray(obj.loads) ? obj.loads : [],
      oneLine: Array.isArray(obj.oneLine) ? obj.oneLine : [],
      settings: (obj.settings && typeof obj.settings === 'object') ? obj.settings : {}
    };
  }

  setDuctbanks(data.ductbanks);
  setConduits(data.conduits);
  setTrays(data.trays);
  setCables(data.cables);
  setPanels(Array.isArray(data.panels) ? data.panels : []);
  setEquipment(Array.isArray(data.equipment) ? data.equipment : []);
  setLoads(Array.isArray(data.loads) ? data.loads : []);
  setOneLine(Array.isArray(data.oneLine) ? data.oneLine : Array.isArray(data.oneLine?.sheets) ? data.oneLine.sheets : []);

  const reserved = new Set([...Object.values(KEYS), 'CTR_PROJECT_V1']);
  for (const key of keys()) {
    if (!reserved.has(key) && !(data.settings && key in data.settings)) {
      removeItem(key);
    }
  }
  if (data.settings) {
    for (const [k, v] of Object.entries(data.settings)) {
      setItem(k, v);
    }
  }
  return true;
}

// expose on window for non-module scripts
if (typeof window !== 'undefined') {
  window.dataStore = {
    STORAGE_KEYS,
    getTrays,
    setTrays,
    getCables,
    setCables,
    getDuctbanks,
    setDuctbanks,
    getConduits,
    setConduits,
    getPanels,
    setPanels,
    getEquipment,
    setEquipment,
    addEquipment,
    updateEquipment,
    removeEquipment,
    getLoads,
    setLoads,
    addLoad,
    insertLoad,
    updateLoad,
    removeLoad,
    getOneLine,
    setOneLine,
    getItem,
    setItem,
    removeItem,
    on,
    off,
    keys,
    exportProject,
    importProject,
    importFromCad,
    exportToCad
  };
}

class ContextMenu {
  constructor(items = []) {
    this.items = items;
    this.menu = document.createElement('ul');
    this.menu.className = 'context-menu';
    Object.assign(this.menu.style, {
      position: 'absolute',
      display: 'none',
      listStyle: 'none',
      margin: '0',
      padding: '4px 0',
      background: '#fff',
      border: '1px solid #ccc',
      zIndex: 1000,
      color: '#000'
    });
    document.body.appendChild(this.menu);
    document.addEventListener('click', () => this.hide());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.hide(); });
  }

  setItems(items) {
    this.items = items;
    this.menu.innerHTML = '';
    items.forEach(({ label, action }) => {
      const li = document.createElement('li');
      li.textContent = label;
      Object.assign(li.style, {
        padding: '4px 12px',
        cursor: 'pointer',
        background: '#fff',
        color: '#000'
      });
      li.tabIndex = 0;
      li.addEventListener('click', () => {
        const target = this.target;
        this.hide();
        action(target);
      });
      li.addEventListener('mouseenter', () => {
        li.style.background = '#eee';
        li.style.color = '#000';
      });
      li.addEventListener('mouseleave', () => {
        li.style.background = '#fff';
        li.style.color = '#000';
      });
      this.menu.appendChild(li);
    });
  }

  show(x, y, target) {
    this.target = target;
    this.menu.style.left = `${x}px`;
    this.menu.style.top = `${y}px`;
    this.menu.style.display = 'block';
  }

  hide() {
    this.menu.style.display = 'none';
    this.target = null;
  }
}

function calculateDerived(load) {
  const qty = parseFloat(load.quantity) || 1;
  const voltage = parseFloat(load.voltage);
  const kw = parseFloat(load.kw);
  const pf = parseFloat(load.powerFactor);
  const lf = parseFloat(load.loadFactor);
  const eff = parseFloat(load.efficiency);
  const df = parseFloat(load.demandFactor);
  const phases = parseInt(load.phases, 10);
  const totalKw = isNaN(kw) ? 0 : kw * qty;
  const lfKw = isNaN(lf) ? totalKw : totalKw * (lf / 100);
  const effKw = isNaN(eff) || eff === 0 ? lfKw : lfKw / (eff / 100);
  const kVA = pf ? effKw / pf : effKw;
  const phaseFactor = phases === 1 ? 1 : Math.sqrt(3);
  const current = voltage ? (kVA * 1000) / (phaseFactor * voltage) : 0;
  const demandKW = effKw * (isNaN(df) ? 1 : df / 100);
  const demandKVA = pf ? demandKW / pf : demandKW;
  return { kva: kVA, current, demandKw: demandKW, demandKva: demandKVA };
}

function aggregateLoadsBySource(loads) {
  return loads.reduce((acc, load) => {
    const src = load.source || '';
    const { kva, demandKw, demandKva } = calculateDerived(load);
    const kW = parseFloat(load.kw) || 0;
    if (!acc[src]) acc[src] = { kW: 0, kVA: 0, demandKW: 0, demandKVA: 0 };
    acc[src].kW += kW;
    acc[src].kVA += parseFloat(load.kva) || kva;
    acc[src].demandKW += parseFloat(load.demandKw) || demandKw;
    acc[src].demandKVA += parseFloat(load.demandKva) || demandKva;
    return acc;
  }, {});
}

// Inline load list editor
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initSettings();
    initDarkMode();
    initCompactMode();
    initNavToggle();

    const table = document.getElementById('load-table');
    const tbody = table.querySelector('tbody');
    const tfoot = table.querySelector('tfoot');
    const deleteBtn = document.getElementById('delete-selected-btn');
    const selectAll = document.getElementById('select-all');
    const summaryDiv = document.getElementById('source-summary');
    let clipboard = null;
    let rendering = false;
    const rowClass = tbody.dataset.rowClass || 'load-row';
    const blankLoad = {
      source: '',
      tag: '',
      description: '',
      manufacturer: '',
      model: '',
      quantity: '',
      voltage: '',
      loadType: '',
      duty: '',
      kw: '',
      powerFactor: '',
      loadFactor: '',
      efficiency: '',
      demandFactor: '',
      phases: '',
      circuit: '',
      notes: ''
    };

    // --- helpers ------------------------------------------------------------
    function format(num) {
      const n = Number(num);
      return Number.isFinite(n) && n !== 0 ? n.toFixed(2) : '';
    }
  function gatherRow(tr) {
    return {
      source: tr.querySelector('input[name="source"]').value.trim(),
      tag: tr.querySelector('input[name="tag"]').value.trim(),
      description: tr.querySelector('input[name="description"]').value.trim(),
      manufacturer: tr.querySelector('input[name="manufacturer"]').value.trim(),
      model: tr.querySelector('input[name="model"]').value.trim(),
      quantity: tr.querySelector('input[name="quantity"]').value.trim(),
      voltage: tr.querySelector('input[name="voltage"]').value.trim(),
      loadType: tr.querySelector('input[name="loadType"]').value.trim(),
      duty: tr.querySelector('select[name="duty"]').value.trim(),
      kw: tr.querySelector('input[name="kw"]').value.trim(),
      powerFactor: tr.querySelector('input[name="powerFactor"]').value.trim(),
      loadFactor: tr.querySelector('input[name="loadFactor"]').value.trim(),
      efficiency: tr.querySelector('input[name="efficiency"]').value.trim(),
      demandFactor: tr.querySelector('input[name="demandFactor"]').value.trim(),
      phases: tr.querySelector('input[name="phases"]').value.trim(),
      circuit: tr.querySelector('input[name="circuit"]').value.trim(),
      notes: tr.querySelector('textarea[name="notes"]').value.trim()
    };
  }

  function saveRow(tr) {
    const idx = Number(tr.dataset.index);
    const load = gatherRow(tr);
    const computed = calculateDerived(load);
    Object.assign(load, computed);
    updateLoad(idx, load);
    tr.querySelector('.kva').textContent = format(computed.kva);
    tr.querySelector('.current').textContent = format(computed.current);
    tr.querySelector('.demand-kva').textContent = format(computed.demandKva);
    tr.querySelector('.demand-kw').textContent = format(computed.demandKw);
    updateFooter();
    updateSummary();
  }

  function insertLoad$1(index, load) {
    insertLoad(index, load);
    render();
    const row = tbody.querySelector(`tr[data-index="${index}"]`);
    if (row) {
      const inp = row.querySelector('input[name="description"]');
      inp && inp.focus();
    }
  }

  function handleNav(e, td) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      let allSelected = true;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        const start = e.target.selectionStart ?? 0;
        const end = e.target.selectionEnd ?? 0;
        const len = (e.target.value || '').length;
        allSelected = start === 0 && end === len;
      }
      if (allSelected) {
        e.preventDefault();
        const sib = e.key === 'ArrowLeft' ? td.previousElementSibling : td.nextElementSibling;
        if (sib) {
          const next = sib.querySelector('input,select,textarea');
          if (next) {
            next.focus();
            if (typeof next.select === 'function') next.select();
          }
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const col = td.cellIndex;
      const nextRow = td.parentElement.nextElementSibling;
      if (nextRow && nextRow.cells[col]) {
        const next = nextRow.cells[col].querySelector('input,select,textarea');
        if (next) {
          next.focus();
          if (typeof next.select === 'function') next.select();
        }
      }
    }
  }

  function createRow(load, idx) {
    const tr = document.createElement('tr');
    tr.dataset.index = idx;
    tr.classList.add(rowClass);
    tr.innerHTML = `
      <td><input type="checkbox" class="row-select" aria-label="Select row"></td>
      <td><input name="source" type="text" value="${load.source || ''}"></td>
      <td><input name="tag" type="text" value="${load.tag || ''}"></td>
      <td><input name="description" type="text" value="${load.description || ''}"></td>
      <td><input name="manufacturer" type="text" value="${load.manufacturer || ''}"></td>
      <td><input name="model" type="text" value="${load.model || ''}"></td>
      <td><input name="quantity" type="number" step="any" value="${load.quantity || ''}"></td>
      <td><input name="voltage" type="number" step="any" value="${load.voltage || ''}"></td>
      <td><input name="loadType" type="text" value="${load.loadType || ''}"></td>
      <td><select name="duty">
        <option value=""></option>
        <option value="Continuous"${load.duty === 'Continuous' ? ' selected' : ''}>Continuous</option>
        <option value="Intermittent"${load.duty === 'Intermittent' ? ' selected' : ''}>Intermittent</option>
        <option value="Stand-by"${load.duty === 'Stand-by' ? ' selected' : ''}>Stand-by</option>
      </select></td>
      <td><input name="kw" type="number" step="any" value="${load.kw || ''}"></td>
      <td><input name="powerFactor" type="number" step="any" value="${load.powerFactor || ''}"></td>
      <td><input name="loadFactor" type="number" step="any" value="${load.loadFactor || ''}"></td>
      <td><input name="efficiency" type="number" step="any" value="${load.efficiency || ''}"></td>
      <td><input name="demandFactor" type="number" step="any" value="${load.demandFactor || ''}"></td>
      <td><input name="phases" type="text" value="${load.phases || ''}"></td>
      <td><input name="circuit" type="text" value="${load.circuit || ''}"></td>
      <td><textarea name="notes">${load.notes || ''}</textarea></td>
      <td class="kva">${format(load.kva)}</td>
      <td class="current">${format(load.current)}</td>
      <td class="demand-kva">${format(load.demandKva)}</td>
      <td class="demand-kw">${format(load.demandKw)}</td>`;

    Array.from(tr.querySelectorAll('input[type="text"],input[type="number"],select,textarea')).forEach(input => {
      const td = input.parentElement;
      input.addEventListener('blur', () => saveRow(tr));
      if (input.tagName === 'SELECT') {
        input.addEventListener('change', () => saveRow(tr));
      }
      input.addEventListener('keydown', e => handleNav(e, td));
    });

    const chk = tr.querySelector('.row-select');
    chk.addEventListener('change', () => {
      if (!chk.checked) selectAll.checked = false;
    });

    return tr;
  }

  const menu = new ContextMenu();
  menu.setItems([
    { label: 'Insert Row Above', action: tr => { if (!tr) return; insertLoad$1(Number(tr.dataset.index), blankLoad); } },
    { label: 'Insert Row Below', action: tr => { if (!tr) return; insertLoad$1(Number(tr.dataset.index) + 1, blankLoad); } },
    { label: 'Copy Row', action: tr => { if (!tr) return; clipboard = JSON.parse(JSON.stringify(gatherRow(tr))); } },
    { label: 'Paste Row', action: tr => {
        if (!tr) return;
        if (!clipboard) return;
        const load = JSON.parse(JSON.stringify(clipboard));
        const idx = Number(tr.dataset.index);
        const loads = getLoads();
        if (idx >= loads.length - 1) {
          addLoad(load);
        } else {
          insertLoad(idx + 1, load);
        }
        render();
      }
    },
    { label: 'Delete Row', action: tr => { if (!tr) return; deleteLoad(Number(tr.dataset.index)); render(); } }
  ]);

  table.addEventListener('contextmenu', e => {
    const row = e.target.closest(`.${rowClass}`);
    if (row) {
      e.preventDefault();
      menu.show(e.pageX, e.pageY, row);
    } else if (e.target.closest('#load-table')) {
      e.preventDefault();
    }
  });

  document.addEventListener('keydown', e => {
    const tag = document.activeElement.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return; // allow normal copy/paste
    const row = document.activeElement.closest(`.${rowClass}`);
    if (!row) return;
    if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      clipboard = JSON.parse(JSON.stringify(gatherRow(row)));
      e.preventDefault();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
      if (!clipboard) return;
      const load = JSON.parse(JSON.stringify(clipboard));
      const idx = Number(row.dataset.index);
      const loads = getLoads();
      if (idx >= loads.length - 1) {
        addLoad(load);
      } else {
        insertLoad(idx + 1, load);
      }
      render();
      e.preventDefault();
    }
  });

  function updateFooter(loads = getLoads()) {
    if (!tfoot) return;
    const totals = loads.reduce((acc, l) => {
      acc.kW += parseFloat(l.kw) || 0;
      acc.kVA += parseFloat(l.kva) || 0;
      acc.demandKVA += parseFloat(l.demandKva) || 0;
      acc.demandKW += parseFloat(l.demandKw) || 0;
      return acc;
    }, { kW: 0, kVA: 0, demandKVA: 0, demandKW: 0 });
    tfoot.innerHTML = `<tr>
      <td colspan="10">Totals</td>
      <td>${totals.kW.toFixed(2)}</td>
      <td colspan="7"></td>
      <td>${totals.kVA.toFixed(2)}</td>
      <td></td>
      <td>${totals.demandKVA.toFixed(2)}</td>
      <td>${totals.demandKW.toFixed(2)}</td>
    </tr>`;
  }

  function updateSummary(loads = getLoads()) {
    if (!summaryDiv) return;
    const grouped = aggregateLoadsBySource(loads);
    const entries = Object.entries(grouped);
    if (!entries.length) {
      summaryDiv.innerHTML = '';
      return;
    }
    let html = '<table><thead><tr><th>Source</th><th>kW</th><th>kVA</th><th>Demand kW</th><th>Demand kVA</th></tr></thead><tbody>';
    for (const [src, totals] of entries) {
      html += `<tr><td>${src}</td><td>${totals.kW.toFixed(2)}</td><td>${totals.kVA.toFixed(2)}</td><td>${totals.demandKW.toFixed(2)}</td><td>${totals.demandKVA.toFixed(2)}</td></tr>`;
    }
    html += '</tbody></table>';
    summaryDiv.innerHTML = html;
  }

  function render() {
    if (rendering) return;
    rendering = true;
    try {
      tbody.innerHTML = '';
      let loads = getLoads();
      if (!loads.length) {
        // Ensure at least one editable row renders even with no stored data
        loads = [{}];
      } else {
        // Recalculate derived fields for display without rewriting storage
        loads = loads.map(l => ({ ...l, ...calculateDerived(l) }));
      }
      loads.forEach((load, idx) => tbody.appendChild(createRow(load, idx)));
      selectAll.checked = false;
      updateFooter(loads);
      updateSummary(loads);
    } finally {
      rendering = false;
    }
  }

  // Re-render when load data changes without causing recursive updates
  on('loadList', render);

  function loadsToCSV(loads, delimiter = ',') {
    const header = [
      'source',
      'tag',
      'description',
      'manufacturer',
      'model',
      'quantity',
      'voltage',
      'loadType',
      'duty',
      'kw',
      'powerFactor',
      'loadFactor',
      'efficiency',
      'demandFactor',
      'phases',
      'circuit',
      'notes',
      'panelId',
      'breaker',
      'kva',
      'current',
      'demandKva',
      'demandKw'
    ].join(delimiter);
    const lines = loads.map(l => {
      const base = { source: '', manufacturer: '', model: '', notes: '', panelId: '', breaker: '', duty: '', ...l };
      const full = { ...base, ...calculateDerived(base) };
      const vals = [
        full.source,
        full.tag,
        full.description,
        full.manufacturer,
        full.model,
        full.quantity,
        full.voltage,
        full.loadType,
        full.duty,
        full.kw,
        full.powerFactor,
        full.loadFactor,
        full.efficiency,
        full.demandFactor,
        full.phases,
        full.circuit,
        full.notes,
        full.panelId,
        full.breaker,
        full.kva,
        full.current,
        full.demandKva,
        full.demandKw
      ].map(v => {
        v = String(v ?? '').replace(/"/g, '""');
        return v.includes(delimiter) ? `"${v}"` : v;
      });
      return vals.join(delimiter);
    });
    return [header, ...lines].join('\n');
  }

  function csvToLoads(text, delimiter = ',') {
    const lines = text.trim().split(/\r?\n/);
    if (!lines.length) return [];
    const first = lines[0].toLowerCase();
    if (first.includes('description') && (first.includes('kw') || first.includes('power'))) lines.shift();
    return lines.map(line => {
      const cols = line
        .split(delimiter)
        .map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
      let load;
      if (cols.length === 13 || cols.length === 14 || cols.length === 16 || cols.length === 17) {
        let source = '';
        let tag, description, manufacturer = '', model = '', quantity, voltage, loadType, duty, kw, powerFactor, loadFactor, efficiency, demandFactor, phases, circuit, notes = '';
        if (cols.length === 13) {
          [tag, description, quantity, voltage, loadType, duty, kw, powerFactor, loadFactor, efficiency, demandFactor, phases, circuit] = cols;
        } else if (cols.length === 14) {
          [source, tag, description, quantity, voltage, loadType, duty, kw, powerFactor, loadFactor, efficiency, demandFactor, phases, circuit] = cols;
        } else if (cols.length === 16) {
          [tag, description, manufacturer, model, quantity, voltage, loadType, duty, kw, powerFactor, loadFactor, efficiency, demandFactor, phases, circuit, notes] = cols;
        } else {
          [source, tag, description, manufacturer, model, quantity, voltage, loadType, duty, kw, powerFactor, loadFactor, efficiency, demandFactor, phases, circuit, notes] = cols;
        }
        const nums = [quantity, voltage, kw, powerFactor, loadFactor, efficiency, demandFactor];
        if (nums.some(n => n && isNaN(Number(n)))) throw new Error('Invalid CSV data');
        load = {
          source,
          tag,
          description,
          manufacturer,
          model,
          quantity,
          voltage,
          loadType,
          duty,
          kw,
          powerFactor,
          loadFactor,
          efficiency,
          demandFactor,
          phases,
          circuit,
          notes,
          panelId: '',
          breaker: ''
        };
      } else if (cols.length === 19 || cols.length === 20 || cols.length === 22 || cols.length === 23) {
        let source = '';
        let tag, description, manufacturer = '', model = '', quantity, voltage, loadType, duty, kw, powerFactor, loadFactor, efficiency, demandFactor, phases, circuit, notes = '', panelId, breaker, kva, current, demandKva, demandKw;
        if (cols.length === 19) {
          [
            tag,
            description,
            quantity,
            voltage,
            loadType,
            duty,
            kw,
            powerFactor,
            loadFactor,
            efficiency,
            demandFactor,
            phases,
            circuit,
            panelId,
            breaker,
            kva,
            current,
            demandKva,
            demandKw
          ] = cols;
        } else if (cols.length === 20) {
          [
            source,
            tag,
            description,
            quantity,
            voltage,
            loadType,
            duty,
            kw,
            powerFactor,
            loadFactor,
            efficiency,
            demandFactor,
            phases,
            circuit,
            panelId,
            breaker,
            kva,
            current,
            demandKva,
            demandKw
          ] = cols;
        } else if (cols.length === 22) {
          [
            tag,
            description,
            manufacturer,
            model,
            quantity,
            voltage,
            loadType,
            duty,
            kw,
            powerFactor,
            loadFactor,
            efficiency,
            demandFactor,
            phases,
            circuit,
            notes,
            panelId,
            breaker,
            kva,
            current,
            demandKva,
            demandKw
          ] = cols;
        } else {
          [
            source,
            tag,
            description,
            manufacturer,
            model,
            quantity,
            voltage,
            loadType,
            duty,
            kw,
            powerFactor,
            loadFactor,
            efficiency,
            demandFactor,
            phases,
            circuit,
            notes,
            panelId,
            breaker,
            kva,
            current,
            demandKva,
            demandKw
          ] = cols;
        }
        const nums = [quantity, voltage, kw, powerFactor, loadFactor, efficiency, demandFactor, kva, current, demandKva, demandKw];
        if (nums.some(n => n && isNaN(Number(n)))) throw new Error('Invalid CSV data');
        load = {
          source,
          tag,
          description,
          manufacturer,
          model,
          quantity,
          voltage,
          loadType,
          duty,
          kw,
          powerFactor,
          loadFactor,
          efficiency,
          demandFactor,
          phases,
          circuit,
          notes,
          panelId,
          breaker,
          kva,
          current,
          demandKva,
          demandKw
        };
      } else {
        throw new Error('Invalid CSV format');
      }
      const computed = calculateDerived(load);
      return { panelId: '', breaker: '', ...load, ...computed };
    });
  }

  // --- events -------------------------------------------------------------
  deleteBtn.addEventListener('click', () => {
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => r.querySelector('.row-select').checked);
    if (!rows.length) return;
    if (!confirm('Delete selected loads?')) return;
    const indices = rows.map(r => Number(r.dataset.index));
    const loads = getLoads().filter((_, idx) => !indices.includes(idx));
    setLoads(loads);
    render();
  });

  selectAll.addEventListener('change', e => {
    const checked = e.target.checked;
    tbody.querySelectorAll('.row-select').forEach(cb => { cb.checked = checked; });
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const data = getLoads().map(l => {
      const base = { panelId: '', breaker: '', duty: '', manufacturer: '', model: '', notes: '', ...l };
      return { ...base, ...calculateDerived(base) };
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'loads.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('export-csv-btn').addEventListener('click', () => {
    const csv = loadsToCSV(getLoads());
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'loads.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('copy-btn').addEventListener('click', () => {
    const tsv = loadsToCSV(getLoads(), '\t');
    navigator.clipboard.writeText(tsv).catch(() => {
      alert('Copy failed');
    });
  });

  const importInput = document.getElementById('import-input');
  document.getElementById('import-btn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then(text => {
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          const loads = data.map(l => {
          const base = {
            source: '',
            tag: '',
            description: '',
            manufacturer: '',
            model: '',
            quantity: '',
            voltage: '',
            loadType: '',
            duty: '',
            kw: '',
            powerFactor: '',
            loadFactor: '',
            efficiency: '',
            demandFactor: '',
            phases: '',
            circuit: '',
            notes: '',
            panelId: '',
            breaker: '',
            ...l
          };
            if ('power' in base && !('kw' in base)) {
              base.kw = base.power;
              delete base.power;
            }
            return { ...base, ...calculateDerived(base) };
          });
          setLoads(loads);
          render();
        } else {
          alert('Invalid load data');
        }
      } catch {
        alert('Invalid load data');
      }
    });
    e.target.value = '';
  });

  const importCsvInput = document.getElementById('import-csv-input');
  document.getElementById('import-csv-btn').addEventListener('click', () => importCsvInput.click());
  importCsvInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then(text => {
      try {
        const loads = csvToLoads(text);
        setLoads(loads);
        render();
      } catch {
        alert('Invalid CSV load data');
      }
    });
    e.target.value = '';
  });

  // Initial render for an empty table; rows populate on 'loadList' events
  render();
  });
}

export { aggregateLoadsBySource, calculateDerived };

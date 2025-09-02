/**
 * Centralized data store wrapper around localStorage with typed getters and setters
 * for core schedule data. Emits simple change events.
 */

// Removed Ajv dependency to avoid bundling issues in the browser.
// Implement a lightweight manual validator instead.

/**
 * @typedef {{[key:string]:any}} GenericRecord
 * @typedef {GenericRecord} Tray
 * @typedef {GenericRecord} Cable
 * @typedef {GenericRecord} Ductbank
 * @typedef {GenericRecord} Conduit
 */

import { parseRevit } from './src/importers/revit.js';

const KEYS = {
  // Preferred property names
  trays: 'traySchedule',
  cables: 'cableSchedule',
  ductbanks: 'ductbankSchedule',
  conduits: 'conduitSchedule',
  panels: 'panelSchedule',
  loads: 'loadList',
  equipment: 'equipment',
  // Legacy aliases for backward compatibility
  traySchedule: 'traySchedule',
  cableSchedule: 'cableSchedule',
  ductbankSchedule: 'ductbankSchedule',
  conduitSchedule: 'conduitSchedule',
  panelSchedule: 'panelSchedule',
  loadList: 'loadList',
  equipmentList: 'equipment'
};

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
export function on(event, handler) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(handler);
}

/**
 * Remove an event listener.
 * @param {string} event
 * @param {(data:any)=>void} handler
 */
export function off(event, handler) {
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
export const getTrays = () => read(KEYS.trays, []);
/**
 * @param {Tray[]} trays
 */
export const setTrays = trays => write(KEYS.trays, trays);

/**
 * @returns {Cable[]}
 */
export const getCables = () => read(KEYS.cables, []);
/**
 * @param {Cable[]} cables
 */
export const setCables = cables => write(KEYS.cables, cables);

/**
 * @returns {Ductbank[]}
 */
export const getDuctbanks = () => read(KEYS.ductbanks, []);
/**
 * @param {Ductbank[]} banks
 */
export const setDuctbanks = banks => write(KEYS.ductbanks, banks);

/**
 * @returns {Conduit[]}
 */
export const getConduits = () => read(KEYS.conduits, []);
/**
 * @param {Conduit[]} conduits
 */
export const setConduits = conduits => write(KEYS.conduits, conduits);

/**
 * @returns {GenericRecord[]}
 */
export const getPanels = () => read(KEYS.panels, []);
/**
 * @param {GenericRecord[]} panels
 */
export const setPanels = panels => write(KEYS.panels, panels);

/**
 * @returns {GenericRecord[]}
 */
export const getEquipment = () => read(KEYS.equipment, []);
/**
 * @param {GenericRecord[]} equipment
 */
function ensureEquipmentFields(eq) {
  return {
    id: '',
    description: '',
    voltage: '',
    ...eq
  };
}

export const setEquipment = list => write(KEYS.equipment, list.map(ensureEquipmentFields));

export const addEquipment = item => {
  const list = getEquipment();
  list.push(ensureEquipmentFields(item));
  setEquipment(list);
};

export const updateEquipment = (index, item) => {
  const list = getEquipment();
  if (index >= 0 && index < list.length) {
    list[index] = ensureEquipmentFields({ ...list[index], ...item });
    setEquipment(list);
  }
};

export const removeEquipment = index => {
  const list = getEquipment();
  if (index >= 0 && index < list.length) {
    list.splice(index, 1);
    setEquipment(list);
  }
};

/**
 * @returns {GenericRecord[]}
 */
export const getLoads = () => {
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
    ...l
  };
}

function isEmptyLoad(load) {
  const l = ensureLoadFields(load);
  return Object.values(l).every(v => v === '');
}

export const setLoads = loads => {
  const list = (loads.length ? loads : [{}]).map(ensureLoadFields);
  write(KEYS.loads, list);
};

export const addLoad = load => {
  const loads = getLoads();
  const normalized = ensureLoadFields(load);
  if (loads.length === 1 && isEmptyLoad(loads[0]) && !isEmptyLoad(normalized)) {
    loads[0] = normalized;
  } else {
    loads.push(normalized);
  }
  setLoads(loads);
};

export const insertLoad = (index, load) => {
  const loads = getLoads();
  const normalized = ensureLoadFields(load);
  const idx = Math.max(0, Math.min(index, loads.length));
  loads.splice(idx, 0, normalized);
  setLoads(loads);
};

export const updateLoad = (index, load) => {
  const loads = getLoads();
  if (index >= 0 && index < loads.length) {
    loads[index] = ensureLoadFields({ ...loads[index], ...load });
    setLoads(loads);
  }
};

export const removeLoad = index => {
  const loads = getLoads();
  if (index >= 0 && index < loads.length) {
    loads.splice(index, 1);
    setLoads(loads);
  }
};

// generic access for other values so pages never touch localStorage directly
export const getItem = (key, fallback = null) => read(key, fallback);
export const setItem = (key, value) => write(key, value);
export const removeItem = key => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    emit(key, null);
  } catch (e) {
    console.error('Failed to remove', key, e);
  }
};

export { KEYS as STORAGE_KEYS };

export const keys = () => {
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
    if (!required.includes(key)) extra.push(key);
  }

  const typesValid = Array.isArray(obj.ductbanks) &&
    Array.isArray(obj.conduits) &&
    Array.isArray(obj.trays) &&
    Array.isArray(obj.cables) &&
    Array.isArray(obj.panels) &&
    Array.isArray(obj.equipment) &&
    Array.isArray(obj.loads) &&
    obj.settings && typeof obj.settings === 'object' && !Array.isArray(obj.settings);

  const valid = missing.length === 0 && extra.length === 0 && typesValid;
  return { valid, missing, extra };
}

/**
 * Export current project data.
 */
export function exportProject() {
  const project = {
    ductbanks: getDuctbanks(),
    conduits: getConduits(),
    trays: getTrays(),
    cables: getCables(),
    panels: getPanels(),
    equipment: getEquipment(),
    loads: getLoads(),
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
export async function importFromCad(file) {
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
export function exportToCad(fileType = 'json') {
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
export function importProject(obj) {
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
    STORAGE_KEYS: KEYS,
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

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

const KEYS = {
  // Preferred property names
  trays: 'traySchedule',
  cables: 'cableSchedule',
  ductbanks: 'ductbankSchedule',
  conduits: 'conduitSchedule',
  panels: 'panelSchedule',
  // Legacy aliases for backward compatibility
  traySchedule: 'traySchedule',
  cableSchedule: 'cableSchedule',
  ductbankSchedule: 'ductbankSchedule',
  conduitSchedule: 'conduitSchedule',
  panelSchedule: 'panelSchedule'
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
  const required = ['ductbanks', 'conduits', 'trays', 'cables', 'panels', 'settings'];
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
      settings: (obj.settings && typeof obj.settings === 'object') ? obj.settings : {}
    };
  }

  setDuctbanks(data.ductbanks);
  setConduits(data.conduits);
  setTrays(data.trays);
  setCables(data.cables);
  setPanels(Array.isArray(data.panels) ? data.panels : []);

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
    getItem,
    setItem,
    removeItem,
    on,
    off,
    keys,
    exportProject,
    importProject
  };
}

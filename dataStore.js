/**
 * Centralized data store wrapper around localStorage with typed getters and setters
 * for core schedule data. Emits simple change events.
 */

/**
 * @typedef {{[key:string]:any}} GenericRecord
 * @typedef {GenericRecord} Tray
 * @typedef {GenericRecord} Cable
 * @typedef {GenericRecord} Ductbank
 * @typedef {GenericRecord} Conduit
 */

const KEYS = {
  trays: 'traySchedule',
  cables: 'cableSchedule',
  ductbanks: 'ductbankSchedule',
  conduits: 'conduitSchedule'
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
    getItem,
    setItem,
    removeItem,
    on,
    off,
    keys
  };
}

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

// Revit parser is an ES module and exports the `parseRevit` helper
// directly. Import it with a named import so it works consistently in
// both the browser and Node test environments.
import { parseRevit } from './src/importers/revit.mjs';
import {
  getScenarioListState,
  setScenarioListState,
  registerScenario,
  getCurrentScenarioNameState,
  setCurrentScenarioNameState,
  readScenarioValue,
  writeScenarioValue,
  removeScenarioValue,
  listScenarioKeysState,
  cloneScenarioStorage,
  writeSavedProject,
  readSavedProject,
  wasSavedProjectMigrated
} from './projectStorage.js';

registerScenario(getCurrentScenarioNameState());

export function listScenarios() {
  return [...getScenarioListState()];
}

export function getCurrentScenario() {
  return getCurrentScenarioNameState();
}

export function switchScenario(name) {
  if (!name) return;
  registerScenario(name);
  setCurrentScenarioNameState(name);
  emit('scenario', getCurrentScenarioNameState());
}

export function cloneScenario(newName, from = getCurrentScenarioNameState()) {
  if (!newName) return;
  cloneScenarioStorage(from, newName);
  registerScenario(newName);
}

export function compareStudies(a, b) {
  const first = read(KEYS.studies, {}, a);
  const second = read(KEYS.studies, {}, b);
  return { [a]: first, [b]: second };
}

const KEYS = {
  // Preferred property names
  trays: 'traySchedule',
  cables: 'cableSchedule',
  cableTypicals: 'cableTypicals',
  ductbanks: 'ductbankSchedule',
  conduits: 'conduitSchedule',
  panels: 'panelSchedule',
  loads: 'loadList',
  equipment: 'equipment',
  oneLine: 'oneLineDiagram',
  studies: 'studyResults',
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
  collapsedGroups: 'collapsedGroups',
  cableSchedulePreset: 'cableSchedulePreset',
  cableTemplates: 'cableTemplates'
};

export const STORAGE_KEYS = { ...KEYS, ...EXTRA_KEYS };

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

// Propagate localStorage changes across browser tabs/windows. When one page
// updates a schedule (e.g. cables from the One-Line view), other open pages
// need to receive the same event so their UIs stay in sync. The `storage`
// event only fires in other tabs, so we translate the changed key back into
// our internal event name and emit it.
const crossWindowKeys = new Set([
  ...Object.values(KEYS),
  ...Object.values(EXTRA_KEYS)
]);

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', e => {
    if (!e.key) return;
    const [scenario, key] = e.key.split(':');
    if (!key || scenario !== getCurrentScenarioNameState()) return;
    if (!crossWindowKeys.has(key)) return;
    try {
      const val = e.newValue ? JSON.parse(e.newValue) : undefined;
      emit(key, val);
    } catch {}
  });
}

function read(key, fallback, scenario = getCurrentScenarioNameState()) {
  return readScenarioValue(key, fallback, scenario);
}

function write(key, value, scenario = getCurrentScenarioNameState()) {
  try {
    writeScenarioValue(key, value, scenario);
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

export const getCableTypicals = () => read(KEYS.cableTypicals, []);
export const setCableTypicals = typicals => write(KEYS.cableTypicals, typicals);

export const getCableTemplates = () => read(EXTRA_KEYS.cableTemplates, []);
export const setCableTemplates = templates => write(EXTRA_KEYS.cableTemplates, templates);

/**
 * Append a cable record to the existing cable schedule.
 * @param {Cable} cable
 */
export const addCable = cable => {
  const list = getCables();
  list.push(cable);
  setCables(list);
};

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
 * Append a raceway record. If the object contains `tray_id` it is stored
 * with trays; otherwise it is assumed to be a conduit.
 * @param {Tray|Conduit} raceway
 */
export const addRaceway = raceway => {
  if (!raceway) return;
  if (raceway.tray_id) {
    const trays = getTrays();
    trays.push(raceway);
    setTrays(trays);
  } else {
    const conduits = getConduits();
    conduits.push(raceway);
    setConduits(conduits);
  }
};

/**
 * @returns {GenericRecord[]}
 */
export const getPanels = () => read(KEYS.panels, []);
/**
 * @param {GenericRecord} panel
 */
function ensurePanelFields(panel) {
  return {
    id: '',
    description: '',
    ref: '',
    voltage: '',
    manufacturer: '',
    model: '',
    phases: '',
    notes: '',
    mainRating: '',
    circuitCount: 42,
    ...panel
  };
}
/**
 * @param {GenericRecord[]} panels
 */
export const setPanels = panels => write(KEYS.panels, panels.map(ensurePanelFields));

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
    ref: '',
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
export const getOneLine = (scenario = getCurrentScenarioNameState()) => {
  const data = read(KEYS.oneLine, {}, scenario);
  if (Array.isArray(data)) {
    // legacy array of components
    return { activeSheet: 0, sheets: [{ name: 'Sheet 1', components: data, connections: [] }] };
  }
  if (data && Array.isArray(data.sheets)) {
    return {
      activeSheet: data.activeSheet || 0,
      sheets: data.sheets.map(s => ({
        name: s.name,
        components: Array.isArray(s.components) ? s.components : [],
        connections: Array.isArray(s.connections) ? s.connections : []
      }))
    };
  }
  return { activeSheet: 0, sheets: [] };
};
/**
 * Persist one-line sheets
 * @param {OneLineSheet[]} sheets
 */
const REVISION_KEY = 'oneLineRevisions';
const MAX_REVISION_COUNT = 6;
const MAX_REVISION_BYTES = 512 * 1024;

function pruneRevisions(revisions) {
  if (!Array.isArray(revisions)) return [];
  if (revisions.length > MAX_REVISION_COUNT) {
    revisions.splice(0, revisions.length - MAX_REVISION_COUNT);
  }
  if (MAX_REVISION_BYTES > 0) {
    let serialized = JSON.stringify(revisions);
    if (serialized.length > MAX_REVISION_BYTES) {
      while (revisions.length > 1 && serialized.length > MAX_REVISION_BYTES) {
        revisions.shift();
        serialized = JSON.stringify(revisions);
      }
      if (serialized.length > MAX_REVISION_BYTES) {
        revisions.length = 0;
      }
    }
  }
  return revisions;
}

export const getRevisions = (scenario = getCurrentScenarioNameState()) => read(REVISION_KEY, [], scenario);

function addRevision(sheets, scenario = getCurrentScenarioNameState()) {
  const revs = getRevisions(scenario);
  revs.push({ time: Date.now(), sheets: JSON.parse(JSON.stringify(sheets)) });
  pruneRevisions(revs);
  write(REVISION_KEY, revs, scenario);
}

export const restoreRevision = (index, scenario = getCurrentScenarioNameState()) => {
  const revs = getRevisions(scenario);
  const rev = revs[index];
  if (rev) {
    write(KEYS.oneLine, { activeSheet: 0, sheets: rev.sheets }, scenario);
  }
  return rev ? rev.sheets : null;
};

export const setOneLine = (data, scenario = getCurrentScenarioNameState()) => {
  const prev = getOneLine(scenario);
  if (Array.isArray(prev.sheets) && prev.sheets.length) addRevision(prev.sheets, scenario);
  const payload = {
    activeSheet: data.activeSheet || 0,
    sheets: Array.isArray(data.sheets) ? data.sheets : []
  };
  write(KEYS.oneLine, payload, scenario);
};

/**
 * Retrieve persisted study results.
 * @returns {Object}
 */
export const getStudies = () => read(KEYS.studies, {});
/**
 * Store study results.
 * @param {Object} results
 */
export const setStudies = results => write(KEYS.studies, results);

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
    id: '',
    ref: '',
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

export const deleteLoad = index => {
  const loads = getLoads();
  if (index >= 0 && index < loads.length) {
    loads.splice(index, 1);
    setLoads(loads);
  }
};

// Backward compatibility
export const removeLoad = deleteLoad;

// generic access for other values so pages never touch localStorage directly
export const getItem = (key, fallback = null, scenario) => read(key, fallback, scenario);
export const setItem = (key, value, scenario) => write(key, value, scenario);
export const removeItem = (key, scenario = getCurrentScenarioNameState()) => {
  try {
    removeScenarioValue(key, scenario);
    emit(key, null);
  } catch (e) {
    console.error('Failed to remove', key, e);
  }
};


export const keys = (scenario = getCurrentScenarioNameState()) => {
  try {
    return listScenarioKeysState(scenario);
  } catch {
    return [];
  }
};

export function saveProject(projectId, scenario = getCurrentScenarioNameState()) {
  if (!projectId) return;
  try {
    const payload = {
      equipment: getEquipment(),
      panels: getPanels(),
      loads: getLoads(),
      cables: getCables(),
      cableTypicals: getCableTypicals(),
      cableTemplates: getCableTemplates(),
      raceways: {
        trays: getTrays(),
        conduits: getConduits(),
        ductbanks: getDuctbanks()
      },
      oneLine: getOneLine(scenario)
    };
    writeSavedProject(projectId, payload);
  } catch (e) {
    console.error('Failed to save project', e);
  }
}

export function loadProject(projectId, scenario = getCurrentScenarioNameState()) {
  if (!projectId) return false;
  try {
    const rawPayload = readSavedProject(projectId);
    if (!rawPayload) return false;
    const payload = rawPayload || {};
    const migrated = wasSavedProjectMigrated(projectId);
    const equipment = payload.equipment;
    const panels = payload.panels;
    const loads = payload.loads;
    const cables = payload.cables;
    const cableTypicals = payload.cableTypicals;
    const cableTemplates = payload.cableTemplates;
    const raceways = payload.raceways || {};
    const oneLine = payload.oneLine || {};
    if (Array.isArray(equipment)) setEquipment(equipment); else setEquipment([]);
    if (Array.isArray(panels)) setPanels(panels); else setPanels([]);
    if (Array.isArray(loads)) setLoads(loads);
    if (Array.isArray(cables)) setCables(cables); else setCables([]);
    if (Array.isArray(cableTypicals)) setCableTypicals(cableTypicals); else setCableTypicals([]);
    if (Array.isArray(cableTemplates)) setCableTemplates(cableTemplates); else setCableTemplates([]);
    setTrays(Array.isArray(raceways.trays) ? raceways.trays : []);
    setConduits(Array.isArray(raceways.conduits) ? raceways.conduits : []);
    setDuctbanks(Array.isArray(raceways.ductbanks) ? raceways.ductbanks : []);
    if (Array.isArray(oneLine)) {
      setOneLine({ activeSheet: 0, sheets: oneLine }, scenario);
    } else {
      setOneLine(oneLine || { activeSheet: 0, sheets: [] }, scenario);
    }
    if (migrated) saveProject(projectId, scenario);
    return true;
  } catch (e) {
    console.error('Failed to load project', e);
    return false;
  }
}

// Simple schema validator replacing Ajv. Checks for required fields,
// disallows extras, and verifies basic types.
function validateProjectSchema(obj) {
  const required = ['ductbanks', 'conduits', 'trays', 'cables', 'cableTypicals', 'panels', 'equipment', 'loads', 'settings'];
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
    Array.isArray(obj.cableTypicals) &&
    Array.isArray(obj.panels) &&
    Array.isArray(obj.equipment) &&
    Array.isArray(obj.loads) &&
    obj.settings && typeof obj.settings === 'object' && !Array.isArray(obj.settings) &&
    (obj.oneLine === undefined || Array.isArray(obj.oneLine) || Array.isArray(obj.oneLine?.sheets));

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
    cableTypicals: getCableTypicals(),
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
  const meta = { version: 1, scenario: getCurrentScenarioNameState(), scenarios: listScenarios() };
  return { meta, ...project };
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
  const { meta, ...rest } = obj || {};
  if (meta && Array.isArray(meta.scenarios)) {
    setScenarioListState(meta.scenarios);
  }
  if (meta && meta.scenario) switchScenario(meta.scenario);
  let data = rest;
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
      cableTypicals: Array.isArray(obj.cableTypicals) ? obj.cableTypicals : [],
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
  setCableTypicals(Array.isArray(data.cableTypicals) ? data.cableTypicals : []);
  setPanels(Array.isArray(data.panels) ? data.panels : []);
  setEquipment(Array.isArray(data.equipment) ? data.equipment : []);
  setLoads(Array.isArray(data.loads) ? data.loads : []);
  if (Array.isArray(data.oneLine)) {
    setOneLine({ activeSheet: 0, sheets: data.oneLine });
  } else if (data.oneLine && Array.isArray(data.oneLine.sheets)) {
    setOneLine({ activeSheet: data.oneLine.activeSheet || 0, sheets: data.oneLine.sheets });
  } else {
    setOneLine({ activeSheet: 0, sheets: [] });
  }

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
    getCableTypicals,
    setCableTypicals,
    addCable,
    getDuctbanks,
    setDuctbanks,
    getConduits,
    setConduits,
    addRaceway,
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
    getRevisions,
    restoreRevision,
    getStudies,
    setStudies,
    getItem,
    setItem,
    removeItem,
    listScenarios,
    getCurrentScenario,
    switchScenario,
    cloneScenario,
    compareStudies,
    on,
    off,
    keys,
    exportProject,
    importProject,
    saveProject,
    loadProject,
    importFromCad,
    exportToCad
  };
}

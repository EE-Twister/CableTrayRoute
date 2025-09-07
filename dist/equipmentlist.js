(function () {
  'use strict';

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


  // scenario management keys
  const SCENARIOS_KEY = 'ctr_scenarios_v1';
  const CURRENT_SCENARIO_KEY = 'ctr_current_scenario_v1';

  function readGlobal(key, fallback) {
    try {
      const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(key) : null;
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeGlobal(key, value) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch {}
  }

  let currentScenario = readGlobal(CURRENT_SCENARIO_KEY, 'base');
  let scenarioList = readGlobal(SCENARIOS_KEY, ['base']);
  if (!scenarioList.includes(currentScenario)) scenarioList.push(currentScenario);
  writeGlobal(SCENARIOS_KEY, scenarioList);
  writeGlobal(CURRENT_SCENARIO_KEY, currentScenario);

  function scenarioKey(key, scenario = currentScenario) {
    return `${scenario}:${key}`;
  }

  function listScenarios() {
    return [...scenarioList];
  }

  function getCurrentScenario() {
    return currentScenario;
  }

  function switchScenario(name) {
    if (!scenarioList.includes(name)) scenarioList.push(name);
    currentScenario = name;
    writeGlobal(CURRENT_SCENARIO_KEY, currentScenario);
    writeGlobal(SCENARIOS_KEY, scenarioList);
    emit('scenario', name);
  }

  function cloneScenario(newName, from = currentScenario) {
    const prefixFrom = `${from}:`;
    const prefixTo = `${newName}:`;
    const allKeys = Object.keys(localStorage || {});
    for (const key of allKeys) {
      if (key.startsWith(prefixFrom)) {
        const value = localStorage.getItem(key);
        const dest = prefixTo + key.slice(prefixFrom.length);
        localStorage.setItem(dest, value);
      }
    }
    if (!scenarioList.includes(newName)) scenarioList.push(newName);
    writeGlobal(SCENARIOS_KEY, scenarioList);
  }

  function compareStudies(a, b) {
    const first = read(KEYS.studies, {}, a);
    const second = read(KEYS.studies, {}, b);
    return { [a]: first, [b]: second };
  }

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

  function read(key, fallback, scenario = currentScenario) {
    try {
      const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(scenarioKey(key, scenario)) : null;
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value, scenario = currentScenario) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(scenarioKey(key, scenario), JSON.stringify(value));
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
   * Append a cable record to the existing cable schedule.
   * @param {Cable} cable
   */
  const addCable = cable => {
    const list = getCables();
    list.push(cable);
    setCables(list);
  };

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
   * Append a raceway record. If the object contains `tray_id` it is stored
   * with trays; otherwise it is assumed to be a conduit.
   * @param {Tray|Conduit} raceway
   */
  const addRaceway = raceway => {
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
  const getPanels = () => read(KEYS.panels, []);
  /**
   * @param {GenericRecord} panel
   */
  function ensurePanelFields(panel) {
    return {
      id: '',
      description: '',
      ref: '',
      voltage: '',
      mainRating: '',
      circuitCount: 42,
      ...panel
    };
  }
  /**
   * @param {GenericRecord[]} panels
   */
  const setPanels = panels => write(KEYS.panels, panels.map(ensurePanelFields));

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
  const getOneLine = (scenario = currentScenario) => {
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

  const getRevisions = (scenario = currentScenario) => read(REVISION_KEY, [], scenario);

  function addRevision(sheets, scenario = currentScenario) {
    const revs = getRevisions(scenario);
    revs.push({ time: Date.now(), sheets: JSON.parse(JSON.stringify(sheets)) });
    write(REVISION_KEY, revs, scenario);
  }

  const restoreRevision = (index, scenario = currentScenario) => {
    const revs = getRevisions(scenario);
    const rev = revs[index];
    if (rev) {
      write(KEYS.oneLine, { activeSheet: 0, sheets: rev.sheets }, scenario);
    }
    return rev ? rev.sheets : null;
  };

  const setOneLine = (data, scenario = currentScenario) => {
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
  const getStudies = () => read(KEYS.studies, {});
  /**
   * Store study results.
   * @param {Object} results
   */
  const setStudies = results => write(KEYS.studies, results);

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
  const getItem = (key, fallback = null, scenario) => read(key, fallback, scenario);
  const setItem = (key, value, scenario) => write(key, value, scenario);
  const removeItem = (key, scenario = currentScenario) => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(scenarioKey(key, scenario));
      }
      emit(key, null);
    } catch (e) {
      console.error('Failed to remove', key, e);
    }
  };


  const keys = (scenario = currentScenario) => {
    try {
      if (typeof localStorage !== 'undefined') {
        const prefix = `${scenario}:`;
        return Object.keys(localStorage).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length));
      }
    } catch {}
    return [];
  };

  function saveProject(projectId, scenario = currentScenario) {
    if (!projectId || typeof localStorage === 'undefined') return;
    try {
      const prefix = `${projectId}:`;
      const payload = {
        equipment: getEquipment(),
        panels: getPanels(),
        loads: getLoads(),
        cables: getCables(),
        raceways: {
          trays: getTrays(),
          conduits: getConduits(),
          ductbanks: getDuctbanks()
        },
        oneLine: getOneLine(scenario)
      };
      for (const [key, value] of Object.entries(payload)) {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      }
    } catch (e) {
      console.error('Failed to save project', e);
    }
  }

  function loadProject(projectId, scenario = currentScenario) {
    if (!projectId || typeof localStorage === 'undefined') return;
    try {
      const prefix = `${projectId}:`;
      const readKey = k => {
        const raw = localStorage.getItem(prefix + k);
        try { return raw ? JSON.parse(raw) : null; } catch { return null; }
      };
      const equipment = readKey('equipment');
      const panels = readKey('panels');
      const loads = readKey('loads');
      const cables = readKey('cables');
      const raceways = readKey('raceways') || {};
      const oneLine = readKey('oneLine') || {};
      if (Array.isArray(equipment)) setEquipment(equipment); else setEquipment([]);
      if (Array.isArray(panels)) setPanels(panels); else setPanels([]);
      if (Array.isArray(loads)) setLoads(loads);
      if (Array.isArray(cables)) setCables(cables); else setCables([]);
      setTrays(Array.isArray(raceways.trays) ? raceways.trays : []);
      setConduits(Array.isArray(raceways.conduits) ? raceways.conduits : []);
      setDuctbanks(Array.isArray(raceways.ductbanks) ? raceways.ductbanks : []);
      if (Array.isArray(oneLine)) {
        setOneLine({ activeSheet: 0, sheets: oneLine }, scenario);
      } else {
        setOneLine(oneLine || { activeSheet: 0, sheets: [] }, scenario);
      }
    } catch (e) {
      console.error('Failed to load project', e);
    }
  }

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
      (obj.oneLine === undefined || Array.isArray(obj.oneLine) || Array.isArray(obj.oneLine?.sheets));

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
    const meta = { version: 1, scenario: currentScenario, scenarios: listScenarios() };
    return { meta, ...project };
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
    const { meta, ...rest } = obj || {};
    if (meta && Array.isArray(meta.scenarios)) {
      scenarioList = meta.scenarios;
      writeGlobal(SCENARIOS_KEY, scenarioList);
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

  class TableManager {
    constructor(opts) {
      this.table = document.getElementById(opts.tableId);
      this.thead = this.table.createTHead();
      this.tbody = this.table.tBodies[0] || this.table.createTBody();
      this.columnsKey = opts.columnsKey || null;
      this.columns = opts.columns || [];
      if (this.columnsKey) {
        try {
          const savedCols = getItem(this.columnsKey, null);
          if (Array.isArray(savedCols) && savedCols.length) {
            this.columns = savedCols;
          } else {
            setItem(this.columnsKey, this.columns);
          }
        } catch(e) {}
      }
      this.storageKey = opts.storageKey || opts.tableId;
      this.onChange = opts.onChange || null;
      this.onSave = opts.onSave || null;
      this.onView = opts.onView || null;
      this.rowCountEl = opts.rowCountId ? document.getElementById(opts.rowCountId) : null;
      this.selectable = opts.selectable || false;
      this.colOffset = this.selectable ? 1 : 0;
      this.enableContextMenu = opts.enableContextMenu || false;
      this.handleHeaderDragStart = this.handleHeaderDragStart.bind(this);
      this.handleHeaderDragOver = this.handleHeaderDragOver.bind(this);
      this.handleHeaderDrop = this.handleHeaderDrop.bind(this);
      this.buildHeader();
      this.initButtons(opts);
      this.load();
      if (this.enableContextMenu) this.initContextMenu();
      this.hiddenGroups = new Set();
      this.loadGroupState();
      this.updateRowCount();
    }

    initButtons(opts){
      if (opts.addRowBtnId) document.getElementById(opts.addRowBtnId).addEventListener('click', () => { this.addRow(); if (this.onChange) this.onChange(); });
      if (opts.saveBtnId) document.getElementById(opts.saveBtnId).addEventListener('click', () => { this.save(); if (this.onSave) this.onSave(); });
      if (opts.loadBtnId) document.getElementById(opts.loadBtnId).addEventListener('click', () => { this.tbody.innerHTML=''; this.load(); if (this.onSave) this.onSave(); });
      if (opts.clearFiltersBtnId) document.getElementById(opts.clearFiltersBtnId).addEventListener('click', () => this.clearFilters());
      if (opts.exportBtnId) document.getElementById(opts.exportBtnId).addEventListener('click', () => { this.exportXlsx(); if (this.onSave) this.onSave(); });
      if (opts.importBtnId && opts.importInputId){
        document.getElementById(opts.importBtnId).addEventListener('click', () => document.getElementById(opts.importInputId).click());
        document.getElementById(opts.importInputId).addEventListener('change', e => { this.importXlsx(e.target.files[0]); e.target.value=''; if (this.onChange) this.onChange(); });
      }
      if (opts.deleteAllBtnId) document.getElementById(opts.deleteAllBtnId).addEventListener('click', () => { this.deleteAll(); if (this.onChange) this.onChange(); });
      if (opts.deleteSelectedBtnId) document.getElementById(opts.deleteSelectedBtnId).addEventListener('click', () => { this.deleteSelected(); if (this.onChange) this.onChange(); });
    }

    buildHeader() {
      this.thead.innerHTML='';
      const hasGroups = this.columns.some(c=>c.group);
      let groupRow;
      if (hasGroups) {
        groupRow = this.thead.insertRow();
        if (this.selectable) {
          groupRow.appendChild(document.createElement('th'));
        }
        this.groupRow = groupRow;
      }
      const headerRow = this.thead.insertRow();
      this.headerRow = headerRow;
      this.filters = Array(this.columns.length).fill('');
      this.filterButtons = [];
      this.globalFilter = '';
      this.globalFilterCols = [];
      this.groupCols = {};
      this.groupThs = {};
      this.groupToggles = {};
      this.groupFirstIndex = {};
      this.groupLastIndex = {};
      this.groupOrder = [];
      const offset = this.colOffset;

      if (this.selectable) {
        const selTh = document.createElement('th');
        const selAll = document.createElement('input');
        selAll.type = 'checkbox';
        selAll.id = `${this.table.id}-select-all`;
        selAll.className = 'select-all';
        selAll.setAttribute('aria-label','Select all rows');
        selAll.addEventListener('change', () => {
          this.tbody.querySelectorAll('.row-select').forEach(cb => { cb.checked = selAll.checked; });
        });
        selTh.appendChild(selAll);
        headerRow.appendChild(selTh);
        this.selectAll = selAll;
      }
      
      if (hasGroups){
        const groups = [];
        let current = null;
        let colIndex = 0;
        this.columns.forEach(col => {
          if (col.group){
            if (!current || current.name !== col.group){
              current = {name:col.group, span:1};
              groups.push(current);
              if (!this.groupCols[col.group]){
                this.groupCols[col.group] = [];
                this.groupFirstIndex[col.group] = colIndex;
                this.groupOrder.push(col.group);
              }
            } else {
              current.span++;
            }
            this.groupCols[col.group].push(colIndex);
            this.groupLastIndex[col.group] = colIndex;
          } else {
            groups.push({name:'', span:1});
            current = null;
          }
          colIndex++;
        });
        groups.forEach(g => {
          const th = document.createElement('th');
          th.colSpan = g.span;
          th.classList.add('group-header');
          if (g.name){
            const label = document.createElement('span');
            label.textContent = g.name;
            th.appendChild(label);
            const toggle = document.createElement('button');
            toggle.className = 'group-toggle';
            toggle.textContent = '-';
            toggle.setAttribute('aria-label','Toggle group');
            toggle.addEventListener('click', e => { e.stopPropagation(); this.toggleGroup(g.name); });
            th.appendChild(toggle);
            this.groupThs[g.name] = th;
            this.groupToggles[g.name] = toggle;
            if (this.groupOrder.indexOf(g.name) > 0) th.classList.add('category-separator');
            th.classList.add('category-separator-right');
          }
          groupRow.appendChild(th);
        });
      }

      this.columns.forEach((col,idx) => {
        const th = document.createElement('th');
        th.style.position = 'relative';
        th.draggable = true;
        th.dataset.index = idx;
        const labelSpan=document.createElement('span');
        labelSpan.textContent=col.label;
        th.appendChild(labelSpan);
        const btn=document.createElement('button');
        btn.className='filter-btn';
        btn.innerHTML='\u25BC';
        btn.setAttribute('aria-label','Filter column');
        btn.addEventListener('click',e=>{e.stopPropagation();this.showFilterPopup(btn,idx);});
        th.appendChild(btn);
        const resizer=document.createElement('span');
        resizer.className='col-resizer';
        th.appendChild(resizer);
        let startX,startWidth;
        const onMove=e=>{
          const newWidth=Math.max(30,startWidth+e.pageX-startX);
          th.style.width=newWidth+'px';
          Array.from(this.tbody.rows).forEach(r=>{if(r.cells[idx+offset]) r.cells[idx+offset].style.width=newWidth+'px';});
        };
        resizer.addEventListener('mousedown',e=>{
          startX=e.pageX;startWidth=th.offsetWidth;
          document.addEventListener('mousemove',onMove);
          document.addEventListener('mouseup',()=>{
            document.removeEventListener('mousemove',onMove);
          },{once:true});
        });
        if (col.group && idx === this.groupFirstIndex[col.group] && this.groupOrder.indexOf(col.group) > 0) {
          th.classList.add('category-separator');
        }
        if (col.group && idx === this.groupLastIndex[col.group]) {
          th.classList.add('category-separator-right');
        }
        headerRow.appendChild(th);
        this.filterButtons.push(btn);
      });

      if (hasGroups){
        const blank = document.createElement('th');
        blank.rowSpan = 1;
        blank.style.position='relative';
        groupRow.appendChild(blank);
        this.groupBlankTh = blank;
      }
      const actTh = document.createElement('th');
      actTh.textContent = 'Actions';
      actTh.style.position='relative';
      const res=document.createElement('span');
      res.className='col-resizer';
      actTh.appendChild(res);
      let startX,startWidth;
      const move=e=>{
        const newWidth=Math.max(30,startWidth+e.pageX-startX);
        actTh.style.width=newWidth+'px';
        const idx = this.columns.length + offset;
        Array.from(this.tbody.rows).forEach(r=>{if(r.cells[idx]) r.cells[idx].style.width=newWidth+'px';});
        if(this.groupBlankTh) this.groupBlankTh.style.width=newWidth+'px';
      };
      res.addEventListener('mousedown',e=>{startX=e.pageX;startWidth=actTh.offsetWidth;document.addEventListener('mousemove',move);document.addEventListener('mouseup',()=>{document.removeEventListener('mousemove',move);},{once:true});});
      headerRow.appendChild(actTh);
      headerRow.addEventListener('dragstart', this.handleHeaderDragStart);
      headerRow.addEventListener('dragover', this.handleHeaderDragOver);
      headerRow.addEventListener('drop', this.handleHeaderDrop);
      this.syncGroupBlankWidth();
    }

    setGroupVisibility(name, hide) {
      const offset = this.colOffset;
      const indices = this.groupCols[name] || [];
      indices.forEach(i => {
        if (this.headerRow && this.headerRow.cells[i + offset]) this.headerRow.cells[i + offset].classList.toggle('group-hidden', hide);
        Array.from(this.tbody.rows).forEach(row => {
          if (row.cells[i + offset]) row.cells[i + offset].classList.toggle('group-hidden', hide);
        });
      });
      if (this.groupThs[name]) {
        this.groupThs[name].classList.toggle('group-collapsed', hide);
        this.groupThs[name].colSpan = hide ? 1 : indices.length;
      }
      if (this.groupToggles[name]) this.groupToggles[name].textContent = hide ? '+' : '-';
      if (hide) this.hiddenGroups.add(name); else this.hiddenGroups.delete(name);
      this.syncGroupBlankWidth();
    }

    toggleGroup(name) {
      const hide = !this.hiddenGroups.has(name);
      this.setGroupVisibility(name, hide);
      this.saveGroupState();
    }

    saveGroupState() {
      let all = {};
      try { all = getItem(STORAGE_KEYS.collapsedGroups, {}); } catch(e) {}
      all[this.storageKey] = Array.from(this.hiddenGroups);
      try { setItem(STORAGE_KEYS.collapsedGroups, all); } catch(e) {}
    }

    loadGroupState() {
      let all = {};
      try { all = getItem(STORAGE_KEYS.collapsedGroups, {}); } catch(e) {}
      const hidden = all[this.storageKey] || [];
      hidden.forEach(g => this.setGroupVisibility(g, true));
    }

    syncGroupBlankWidth(){
      const idx = this.columns.length + this.colOffset;
      if(this.groupBlankTh && this.headerRow && this.headerRow.cells[idx]){
        const w=this.headerRow.cells[idx].offsetWidth;
        this.groupBlankTh.style.width=w+'px';
      }
    }

    updateRowCount() {
      if (this.rowCountEl) {
        this.rowCountEl.textContent = `Rows: ${this.tbody.querySelectorAll('tr').length}`;
      }
    }

    persistColumns() {
      if (this.columnsKey) {
        try { setItem(this.columnsKey, this.columns); } catch(e) {}
      }
    }

    handleHeaderDragStart(e) {
      const th = e.target.closest('th');
      if (!th || th.dataset.index === undefined) return;
      e.dataTransfer.setData('text/plain', th.dataset.index);
    }

    handleHeaderDragOver(e) {
      if (e.target.closest('th')) e.preventDefault();
    }

    handleHeaderDrop(e) {
      const th = e.target.closest('th');
      if (!th || th.dataset.index === undefined) return;
      e.preventDefault();
      const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const to = parseInt(th.dataset.index, 10);
      if (isNaN(from) || isNaN(to) || from === to) return;
      const col = this.columns.splice(from, 1)[0];
      this.columns.splice(to, 0, col);
      this.persistColumns();
      const data = this.getData();
      this.buildHeader();
      this.tbody.innerHTML = '';
      data.forEach(row => this.addRow(row));
      this.save();
    }

    addColumn(col) {
      const data = this.getData();
      this.columns.push(col);
      this.persistColumns();
      this.buildHeader();
      this.tbody.innerHTML = '';
      data.forEach(row => this.addRow(row));
      this.save();
      this.updateRowCount();
      if (this.onChange) this.onChange();
    }

    removeColumn(key) {
      const idx = this.columns.findIndex(c => c.key === key);
      if (idx === -1) return;
      const data = this.getData();
      data.forEach(r => { delete r[key]; });
      this.columns.splice(idx, 1);
      this.persistColumns();
      this.buildHeader();
      this.tbody.innerHTML = '';
      data.forEach(row => this.addRow(row));
      this.save();
      this.updateRowCount();
      if (this.onChange) this.onChange();
    }

    showFilterPopup(btn, index){
      document.querySelectorAll('.filter-popup').forEach(p=>p.remove());
      const popup=document.createElement('div');
      popup.className='filter-popup';
      const col=this.columns[index];
      const offset=this.colOffset;
      let control;
      if(col.filter==='dropdown'){
        control=document.createElement('select');
        const allOpt=document.createElement('option');
        allOpt.value='';
        allOpt.textContent='All';
        control.appendChild(allOpt);
        const values=[...new Set(Array.from(this.tbody.rows).map(r=>{
          const cell=r.cells[index+offset];
          return cell?cell.firstChild.value:'';
        }).filter(v=>v))].sort();
        values.forEach(v=>{
          const opt=document.createElement('option');
          opt.value=v;
          opt.textContent=v;
          control.appendChild(opt);
        });
        control.value=this.filters[index];
      }else {
        control=document.createElement('input');
        control.type='text';
        control.value=this.filters[index];
      }
      popup.appendChild(control);
      let debounceTimer;
      const applyFilter=()=>{
        this.filters[index]=control.value.trim();
        if(this.filters[index]) btn.classList.add('filtered'); else btn.classList.remove('filtered');
        this.applyFilters();
      };
      if(col.filter==='dropdown'){
        control.addEventListener('change',applyFilter);
      }else {
        control.addEventListener('input',()=>{
          clearTimeout(debounceTimer);
          debounceTimer=setTimeout(applyFilter,300);
        });
      }
      const apply=document.createElement('button');
      apply.textContent='Apply';
      apply.setAttribute('aria-label','Apply filter');
      apply.addEventListener('click',()=>{
        clearTimeout(debounceTimer);
        applyFilter();
        popup.remove();
      });
      popup.appendChild(apply);
      const clear=document.createElement('button');
      clear.textContent='Clear';
      clear.setAttribute('aria-label','Clear filter');
      clear.addEventListener('click',()=>{
        control.value='';
        this.filters[index]='';
        btn.classList.remove('filtered');
        this.applyFilters();
        popup.remove();
      });
      popup.appendChild(clear);
      const rect=btn.getBoundingClientRect();
      popup.style.top=(rect.bottom+window.scrollY)+'px';
      popup.style.left=(rect.left+window.scrollX)+'px';
      document.body.appendChild(popup);
      const close=e=>{if(!popup.contains(e.target)){popup.remove();document.removeEventListener('click',close);}};
      setTimeout(()=>document.addEventListener('click',close),0);
    }

    showRacewayModal(selectEl, originBtn){
      const modal=document.createElement('div');
      modal.className='modal';
      modal.setAttribute('role','dialog');
      modal.setAttribute('aria-modal','true');
      modal.setAttribute('aria-hidden','false');
      const content=document.createElement('div');
      content.className='modal-content';
      modal.appendChild(content);

      const dual=document.createElement('div');
      dual.className='dual-listbox';
      content.appendChild(dual);

      const buildSection=title=>{
        const wrap=document.createElement('div');
        wrap.className='list-container';
        const hdr=document.createElement('h3');
        hdr.textContent=title;
        wrap.appendChild(hdr);
        const search=document.createElement('input');
        search.type='text';
        search.placeholder='Search';
        wrap.appendChild(search);
        const list=document.createElement('select');
        list.multiple=true;
        list.setAttribute('role','listbox');
        list.setAttribute('aria-multiselectable','true');
        wrap.appendChild(list);
        return {wrap,search,list};
      };

      const avail=buildSection('Available Raceways');
      const chosen=buildSection('Selected Raceways');

      const opts=Array.from(selectEl.options).map(o=>({value:o.value,text:o.text,selected:o.selected}));
      opts.forEach(o=>{
        const opt=document.createElement('option');
        opt.value=o.value;opt.textContent=o.text;
        (o.selected?chosen.list:avail.list).appendChild(opt);
      });

      dual.appendChild(avail.wrap);

      const btnCol=document.createElement('div');
      btnCol.className='button-column';
      const mkBtn=(txt,label)=>{
        const b=document.createElement('button');
        b.type='button';
        b.textContent=txt;
        if(label) b.setAttribute('aria-label',label);
        b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();b.click();}});
        return b;
      };
      const allR=mkBtn('>>','Move all to selected');
      const someR=mkBtn('>','Move selected to selected');
      const someL=mkBtn('<','Move selected to available');
      const allL=mkBtn('<<','Move all to available');
      [allR,someR,someL,allL].forEach(b=>btnCol.appendChild(b));
      dual.appendChild(btnCol);
      dual.appendChild(chosen.wrap);

      const moveSelected=(from,to)=>{Array.from(from.selectedOptions).forEach(o=>to.appendChild(o));};
      const moveAll=(from,to)=>{Array.from(from.options).forEach(o=>to.appendChild(o));};
      allR.addEventListener('click',()=>moveAll(avail.list,chosen.list));
      someR.addEventListener('click',()=>moveSelected(avail.list,chosen.list));
      someL.addEventListener('click',()=>moveSelected(chosen.list,avail.list));
      allL.addEventListener('click',()=>moveAll(chosen.list,avail.list));

      const filter=(list,term)=>{
        const t=term.toLowerCase();
        Array.from(list.options).forEach(o=>o.style.display=o.text.toLowerCase().includes(t)?'':'none');
      };
      avail.search.addEventListener('input',()=>filter(avail.list,avail.search.value));
      chosen.search.addEventListener('input',()=>filter(chosen.list,chosen.search.value));

      const actions=document.createElement('div');
      actions.style.marginTop='1rem';
      actions.style.textAlign='right';
      const saveBtn=document.createElement('button');
      saveBtn.type='button';
      saveBtn.textContent='Save';
      saveBtn.setAttribute('aria-label','Save selection');
      const cancelBtn=document.createElement('button');
      cancelBtn.type='button';
      cancelBtn.textContent='Cancel';
      cancelBtn.setAttribute('aria-label','Cancel selection');
      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);
      content.appendChild(actions);

      const close=()=>{
        modal.remove();
        document.removeEventListener('keydown',handleKey);
        if(originBtn) originBtn.focus();
      };
      cancelBtn.addEventListener('click',close);
      modal.addEventListener('click',e=>{if(e.target===modal)close();});

      saveBtn.addEventListener('click',()=>{
        const values=Array.from(chosen.list.options).map(o=>o.value);
        Array.from(selectEl.options).forEach(o=>o.selected=values.includes(o.value));
        selectEl.dispatchEvent(new Event('change',{bubbles:true}));
        close();
      });

      const handleKey=e=>{if(e.key==='Escape'){e.preventDefault();close();}else trapFocus(e,content);};
      document.addEventListener('keydown',handleKey);

      document.body.appendChild(modal);
      modal.style.display='flex';
      avail.search.focus();
    }

    addRow(data = {}) {
      const tr = this.tbody.insertRow();
      if (data.ref !== undefined) tr.dataset.ref = data.ref;
      if (data.id !== undefined) tr.dataset.id = data.id;
      if (this.selectable) {
        const selTd = tr.insertCell();
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.className = 'row-select';
        chk.addEventListener('change', () => {
          if (!chk.checked && this.selectAll) this.selectAll.checked = false;
        });
        selTd.appendChild(chk);
      }
      this.columns.forEach((col, idx) => {
        const td = tr.insertCell();
        if (col.group && idx === this.groupFirstIndex[col.group] && this.groupOrder.indexOf(col.group) > 0) {
          td.classList.add('category-separator');
        }
        if (col.group && idx === this.groupLastIndex[col.group]) {
          td.classList.add('category-separator-right');
        }
        let el;
        if (col.type === 'select') {
          const opts = typeof col.options === 'function' ? col.options(tr, data) : (col.options || []);
          if (col.multiple) {
            el = document.createElement('select');
            el.multiple = true;
            if (col.size) el.size = col.size;
            opts.forEach(opt => {
              const o = document.createElement('option');
              o.value = opt;
              o.textContent = opt;
              el.appendChild(o);
            });
            el.style.display = 'none';
            el.getSelectedValues = () => Array.from(el.selectedOptions).map(o => o.value);
            el.setSelectedValues = vals => {
              Array.from(el.options).forEach(o => { o.selected = (vals || []).includes(o.value); });
            };
          } else {
            el = document.createElement('select');
            opts.forEach(opt => {
              const o = document.createElement('option');
              o.value = opt;
              o.textContent = opt;
              el.appendChild(o);
            });
          }
        } else {
          el = document.createElement('input');
          el.type = col.type || 'text';
          if (el.type === 'number') {
            el.step = col.step || 'any';
          }
          if (col.maxlength) el.maxLength = col.maxlength;
          if (col.className) el.className = col.className;
          if (col.datalist) {
            const listId = `${col.key}-datalist`;
            el.setAttribute('list', listId);
            let dl = document.getElementById(listId);
            if (!dl) {
              dl = document.createElement('datalist');
              dl.id = listId;
              document.body.appendChild(dl);
            }
            const opts = typeof col.datalist === 'function' ? col.datalist(tr, data) : col.datalist;
            dl.innerHTML = '';
            (opts || []).forEach(opt => {
              const o = document.createElement('option');
              o.value = opt;
              dl.appendChild(o);
            });
          }
        }
        el.name = col.key;
        const val = data[col.key] !== undefined ? data[col.key] : col.default;
        if (val !== undefined) {
          if (col.multiple) {
            const vals = Array.isArray(val) ? val : [val];
            if (el.setSelectedValues) {
              el.setSelectedValues(vals);
            } else if (el.options) {
              Array.from(el.options).forEach(o => { o.selected = vals.includes(o.value); });
            }
          } else {
            el.value = val;
          }
        } else if (el.tagName === 'SELECT' && el.options.length && !col.multiple) {
          el.value = el.options[0].value;
        }
        if (this.headerRow && this.headerRow.cells[idx + this.colOffset] && this.headerRow.cells[idx + this.colOffset].style.width) {
          td.style.width = this.headerRow.cells[idx + this.colOffset].style.width;
        }
        td.appendChild(el);
        let summaryEl, updateSummary;
        if (col.multiple) {
          summaryEl = document.createElement('button');
          summaryEl.type = 'button';
          summaryEl.className = 'raceway-summary';
          summaryEl.setAttribute('aria-label','View selected raceways');
          summaryEl.addEventListener('click', e => {
            e.stopPropagation();
            this.showRacewayModal(el, summaryEl);
          });
          summaryEl.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              this.showRacewayModal(el, summaryEl);
            }
          });
          td.addEventListener('click', () => {
            this.showRacewayModal(el, summaryEl);
          });
          td.appendChild(summaryEl);
          updateSummary = () => {
            const vals = el.getSelectedValues ? el.getSelectedValues() : [];
            if (vals.length) {
              summaryEl.textContent = vals.join(', ');
              summaryEl.classList.remove('placeholder');
            } else {
              summaryEl.textContent = 'Select Raceways';
              summaryEl.classList.add('placeholder');
            }
          };
          el.addEventListener('change', () => {
            updateSummary();
            if (this.onChange) this.onChange();
          });
          updateSummary();
        } else {
          el.addEventListener('input', () => { if (this.onChange) this.onChange(); });
        }
        el.addEventListener('focus',()=>{el.dataset.prevValue=el.value;});
        el.addEventListener('keydown', e => {
          const cellIdx = idx + this.colOffset;
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
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            let targetRow = tr;
            const dir = e.key === 'ArrowUp' ? 'previousElementSibling' : 'nextElementSibling';
            do{targetRow = targetRow[dir];}while(targetRow && targetRow.style.display==='none');
            if(targetRow && targetRow.cells[cellIdx]){
              const next = targetRow.cells[cellIdx].querySelector('input,select,textarea');
              if(next){next.focus(); if(typeof next.select==='function') next.select();}
            }
          } else if (e.key === 'Enter') {
            e.preventDefault();
            let nextRow = tr.nextElementSibling;
            if (!nextRow) {
              nextRow = this.addRow();
              if (this.onChange) this.onChange();
            }
            if (nextRow && nextRow.cells[cellIdx]) {
              const next = nextRow.cells[cellIdx].querySelector('input,select,textarea');
              if (next) {
                next.focus();
                if (typeof next.select === 'function') next.select();
              }
            }
          } else if (e.key === 'Escape') {
            e.preventDefault();
            if(el.dataset.prevValue!==undefined){
              el.value = el.dataset.prevValue;
              if (this.onChange) this.onChange();
            }
          }
        });
        if (col.onChange) el.addEventListener('change', () => { col.onChange(el, tr); });
        if (col.validate) {
          const rules = Array.isArray(col.validate) ? col.validate : [col.validate];
          el.addEventListener(col.multiple ? 'change' : 'input', () => applyValidation(el, rules));
          applyValidation(el, rules);
        }
      });
      const actTd = tr.insertCell();
      const actIdx = this.columns.length + this.colOffset;
      if (this.headerRow && this.headerRow.cells[actIdx] && this.headerRow.cells[actIdx].style.width) {
        actTd.style.width = this.headerRow.cells[actIdx].style.width;
      }
      if(this.onView){
        const viewBtn=document.createElement('button');
        viewBtn.textContent='👁';
        viewBtn.className='viewBtn';
        viewBtn.title='View row';
        viewBtn.setAttribute('aria-label','View row');
        viewBtn.addEventListener('click',()=>{
          const row={};
          this.columns.forEach((col,i)=>{
            const el=tr.cells[i + this.colOffset].firstChild;
            if(!el) return;
            if(col.multiple){
              if(typeof el.getSelectedValues==='function') row[col.key]=el.getSelectedValues();
              else row[col.key]=Array.from(el.selectedOptions||[]).map(o=>o.value);
            }else {
              row[col.key]=el.value;
            }
          });
          this.onView(row,tr);
        });
        actTd.appendChild(viewBtn);
      }
      const addBtn=document.createElement('button');
      addBtn.textContent='+';
      addBtn.className='insertBelowBtn';
      addBtn.title='Add row';
      addBtn.setAttribute('aria-label','Add row');
      addBtn.addEventListener('click',()=>{const newRow=this.addRow();if(newRow) this.tbody.insertBefore(newRow,tr.nextSibling);if(this.onChange) this.onChange();});
      actTd.appendChild(addBtn);

      const dupBtn = document.createElement('button');
      dupBtn.textContent = '\u29C9';
      dupBtn.className='duplicateBtn';
      dupBtn.title='Duplicate row';
      dupBtn.setAttribute('aria-label','Duplicate row');
      dupBtn.addEventListener('click', () => {
        const row = {};
        this.columns.forEach((col,i) => {
          const el = tr.cells[i + this.colOffset].firstChild;
          if (!el) return;
          if (col.multiple) {
            if (typeof el.getSelectedValues === 'function') {
              row[col.key] = el.getSelectedValues();
            } else {
              row[col.key] = Array.from(el.selectedOptions || []).map(o=>o.value);
            }
          } else {
            row[col.key] = el.value;
          }
        });
        const newRow = this.addRow(row);
        if (newRow) this.tbody.insertBefore(newRow, tr.nextSibling);
        if (this.onChange) this.onChange();
      });
      actTd.appendChild(dupBtn);

      const delBtn = document.createElement('button');
      delBtn.textContent = '\u2716';
      delBtn.className='removeBtn';
      delBtn.title='Delete row';
      delBtn.setAttribute('aria-label','Delete row');
      delBtn.addEventListener('click', () => { tr.remove(); this.save(); this.updateRowCount(); if (this.onChange) this.onChange(); });
      actTd.appendChild(delBtn);

      Object.keys(this.groupCols || {}).forEach(g => {
        if (this.hiddenGroups && this.hiddenGroups.has(g)) {
          (this.groupCols[g] || []).forEach(i => {
            if (tr.cells[i + this.colOffset]) tr.cells[i + this.colOffset].classList.add('group-hidden');
          });
        }
      });
      this.updateRowCount();
      return tr;
    }

    getRowData(tr) {
      const row = {};
      const offset = this.colOffset;
      this.columns.forEach((col,i) => {
        const el = tr.cells[i + offset] ? tr.cells[i + offset].firstChild : null;
        if (!el) return;
        if (col.multiple) {
          if (typeof el.getSelectedValues === 'function') {
            row[col.key] = el.getSelectedValues();
          } else {
            row[col.key] = Array.from(el.selectedOptions || []).map(o=>o.value);
          }
        } else {
          row[col.key] = el.value;
        }
      });
      return row;
    }

    getData() {
      const rows = [];
      const offset = this.colOffset;
      Array.from(this.tbody.rows).forEach(tr => {
        const row = {};
        this.columns.forEach((col,i) => {
          const el = tr.cells[i + offset].firstChild;
          if (el) {
            const val = el.value;
            if (col.multiple) {
              if (typeof el.getSelectedValues === 'function') {
                row[col.key] = el.getSelectedValues();
              } else {
                row[col.key] = Array.from(el.selectedOptions || []).map(o => o.value);
              }
            } else if (col.type === 'number') {
              const num = parseFloat(val);
              if (val === '') {
                row[col.key] = '';
              } else {
                row[col.key] = isNaN(num) ? null : num;
              }
            } else {
              row[col.key] = val;
            }
          } else {
            row[col.key] = '';
          }
        });
        rows.push(row);
        if (tr.dataset.ref !== undefined) row.ref = tr.dataset.ref;
        if (tr.dataset.id !== undefined && row.id === undefined) row.id = tr.dataset.id;
      });
      return rows;
    }

    save() {
      this.validateAll();
      try {
        setItem(this.storageKey, this.getData());
      } catch(e) { console.error('save failed', e); }
    }

    load() {
      let data = [];
      try { data = getItem(this.storageKey, []); } catch(e) {}
      data.forEach(row => this.addRow(row));
      this.updateRowCount();
    }

    clearFilters() {
      this.filters=this.filters.map(()=> '');
      this.filterButtons.forEach(btn=>btn.classList.remove('filtered'));
      this.applyFilters();
    }

    applyFilters() {
      const offset = this.colOffset;
      Array.from(this.tbody.rows).forEach(row => {
        let visible = true;
        this.filters.forEach((val,i) => {
          const v = val.toLowerCase();
          if (v && !String(row.cells[i + offset].firstChild.value).toLowerCase().includes(v)) visible = false;
        });
        if (visible && this.globalFilter) {
          const term = this.globalFilter.toLowerCase();
          const cols = this.globalFilterCols.length ? this.globalFilterCols : this.columns.map(c=>c.key);
          const match = cols.some(key => {
            const idx = this.columns.findIndex(c=>c.key === key);
            if (idx === -1) return false;
            const cell = row.cells[idx + offset];
            if (!cell) return false;
            return String(cell.firstChild.value || '').toLowerCase().includes(term);
          });
          if (!match) visible = false;
        }
        row.style.display = visible ? '' : 'none';
      });
    }

    deleteAll() {
      this.tbody.innerHTML='';
      if (this.selectAll) this.selectAll.checked = false;
      this.save();
      this.updateRowCount();
      if (this.onChange) this.onChange();
    }

    deleteSelected() {
      Array.from(this.tbody.querySelectorAll('.row-select:checked')).forEach(cb => cb.closest('tr').remove());
      if (this.selectAll) this.selectAll.checked = false;
      this.save();
      this.updateRowCount();
    }

    initContextMenu() {
      const menu = new ContextMenu();
      let clipboard = null;
      menu.setItems([
        { label: 'Insert Row Above', action: tr => { if (!tr) return; const newRow = this.addRow(); this.tbody.insertBefore(newRow, tr); if (this.onChange) this.onChange(); } },
        { label: 'Insert Row Below', action: tr => { if (!tr) return; const newRow = this.addRow(); this.tbody.insertBefore(newRow, tr.nextSibling); if (this.onChange) this.onChange(); } },
        { label: 'Copy Row', action: tr => { if (!tr) return; clipboard = this.getRowData(tr); } },
        { label: 'Paste Row', action: tr => { if (!tr || !clipboard) return; const newRow = this.addRow(clipboard); this.tbody.insertBefore(newRow, tr.nextSibling); if (this.onChange) this.onChange(); } },
        { label: 'Delete Row', action: tr => { if (!tr) return; tr.remove(); this.save(); this.updateRowCount(); if (this.onChange) this.onChange(); } }
      ]);

      this.table.addEventListener('contextmenu', e => {
        const row = e.target.closest('tbody tr');
        if (row) {
          e.preventDefault();
          menu.show(e.pageX, e.pageY, row);
        } else if (e.target.closest(`#${this.table.id}`)) {
          e.preventDefault();
        }
      });

      document.addEventListener('keydown', e => {
        const tag = document.activeElement.tagName;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
        const row = document.activeElement.closest(`#${this.table.id} tbody tr`);
        if (!row) return;
        if (e.ctrlKey && e.key.toLowerCase() === 'c') {
          clipboard = this.getRowData(row);
          e.preventDefault();
        } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
          if (!clipboard) return;
          const newRow = this.addRow(clipboard);
          this.tbody.insertBefore(newRow, row.nextSibling);
          if (this.onChange) this.onChange();
          e.preventDefault();
        }
      });
    }

    exportXlsx() {
      const data = [this.columns.map(c=>c.label)];
      this.getData().forEach(row => {
        data.push(this.columns.map(c => row[c.key] || ''));
      });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, `${this.storageKey}.xlsx`);
    }

    importXlsx(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        const wb = XLSX.read(e.target.result, {type:'binary'});
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, {defval:''});
        this.tbody.innerHTML='';
        json.forEach(obj => {
          const row = {};
          this.columns.forEach(col => row[col.key] = obj[col.label] || '');
          this.addRow(row);
        });
        this.applyFilters();
        this.save();
        if (this.onChange) this.onChange();
      };
      reader.readAsBinaryString(file);
    }

    validateAll() {
      let valid = true;
      const offset = this.colOffset;
      Array.from(this.tbody.rows).forEach(row => {
        this.columns.forEach((col,i) => {
          const el = row.cells[i + offset].firstChild;
          if (col.validate && !applyValidation(el, Array.isArray(col.validate) ? col.validate : [col.validate])) valid = false;
        });
      });
      return valid;
    }
  }

  function saveToStorage(key, data){
    try { setItem(key, data); } catch(e){}
  }
  function loadFromStorage(key){
    try { return getItem(key, []); } catch(e){ return []; }
  }

  function createTable(opts){ return new TableManager(opts); }

  function applyValidation(el, rules = []) {
    const value = (el.value || '').trim();
    let error = '';
    rules.forEach(rule => {
      if (error) return;
      if (typeof rule === 'function') {
        const msg = rule(value);
        if (msg) error = msg;
      } else if (rule === 'required') {
        if (!value) error = 'Required';
      } else if (rule === 'numeric') {
        if (value === '' || isNaN(Number(value))) error = 'Must be numeric';
      }
    });
    const existing = el.nextElementSibling;
    if (error) {
      el.classList.add('input-error');
      let msg = existing && existing.classList && existing.classList.contains('error-message') ? existing : null;
      if (!msg) {
        msg = document.createElement('span');
        msg.className = 'error-message';
        el.insertAdjacentElement('afterend', msg);
      }
      msg.textContent = error;
      return false;
    } else {
      el.classList.remove('input-error');
      if (existing && existing.classList && existing.classList.contains('error-message')) existing.remove();
      return true;
    }
  }

  window.TableUtils = { createTable, saveToStorage, loadFromStorage, applyValidation, STORAGE_KEYS };

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      const projectId = window.currentProjectId || 'default';
      loadProject(projectId);
      initSettings();
      initDarkMode();
      initCompactMode();
      initNavToggle();

      const columns = [
        { key: 'id', label: 'ID', type: 'text' },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'voltage', label: 'Voltage (V)', type: 'text' },
        { key: 'category', label: 'Category', type: 'text' },
        { key: 'subCategory', label: 'Sub-Category', type: 'text' },
        { key: 'manufacturer', label: 'Manufacturer', type: 'text', className: 'manufacturer-input', filter: 'dropdown' },
        { key: 'model', label: 'Model', type: 'text', className: 'model-input' },
        { key: 'phases', label: 'Phases', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'text' },
        { key: 'x', label: 'X', type: 'number', step: 'any', maxlength: 15, validate: 'numeric' },
        { key: 'y', label: 'Y', type: 'number', step: 'any', maxlength: 15, validate: 'numeric' },
        { key: 'z', label: 'Z', type: 'number', step: 'any', maxlength: 15, validate: 'numeric' }
      ];

      let table;
      table = TableUtils.createTable({
        tableId: 'equipment-table',
        storageKey: TableUtils.STORAGE_KEYS.equipment,
        columnsKey: TableUtils.STORAGE_KEYS.equipmentColumns,
        addRowBtnId: 'add-row-btn',
        deleteSelectedBtnId: 'delete-selected-btn',
        exportBtnId: 'export-xlsx-btn',
        importInputId: 'import-xlsx-input',
        importBtnId: 'import-xlsx-btn',
        selectable: true,
        enableContextMenu: true,
        columns,
        onChange: () => {
          table.save();
          const fn = window.opener?.updateComponent || window.updateComponent;
          if (fn) {
            table.getData().forEach(row => {
              const id = row.ref || row.id;
              if (id) fn(id, row);
            });
          }
          saveProject(projectId);
        }
      });

      const searchInput = document.getElementById('equipment-search');
      if (searchInput) {
        table.globalFilterCols = ['id', 'description', 'manufacturer'];
        searchInput.addEventListener('input', e => {
          table.globalFilter = e.target.value;
          table.applyFilters();
        });
      }

      function generateId(existing, base) {
        let id = base || 'item';
        let i = 1;
        while (existing.includes(id)) {
          id = `${base || 'item'}_${i++}`;
        }
        return id;
      }

      table.tbody.addEventListener('click', e => {
        const btn = e.target;
        const tr = btn.closest('tr');
        if (!tr) return;
        if (btn.classList.contains('duplicateBtn')) {
          e.stopImmediatePropagation();
          const data = table.getData();
          const idx = Array.from(table.tbody.rows).indexOf(tr);
          const clone = { ...data[idx] };
          const ids = data.map(r => r.id).filter(Boolean);
          clone.id = generateId(ids, clone.id);
          data.splice(idx + 1, 0, clone);
          table.setData(data);
          table.save();
          if (table.onChange) table.onChange();
        } else if (btn.classList.contains('removeBtn')) {
          e.stopImmediatePropagation();
          const data = table.getData();
          const idx = Array.from(table.tbody.rows).indexOf(tr);
          data.splice(idx, 1);
          table.setData(data);
          table.save();
          if (table.onChange) table.onChange();
        }
      });

      const addColBtn = document.getElementById('add-column-btn');
      const modal = document.getElementById('add-column-modal');
      const keyInput = document.getElementById('new-col-key');
      const labelInput = document.getElementById('new-col-label');
      const typeInput = document.getElementById('new-col-type');
      const confirmBtn = document.getElementById('confirm-add-column');

      addColBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
        keyInput.value = '';
        labelInput.value = '';
        typeInput.value = 'text';
        keyInput.focus();
      });

      confirmBtn.addEventListener('click', () => {
        const key = keyInput.value.trim();
        const label = labelInput.value.trim();
        const type = typeInput.value;
        if (!key || !label) return;
        table.addColumn({ key, label, type });
        modal.style.display = 'none';
      });

      modal.addEventListener('click', e => {
        if (e.target === modal) modal.style.display = 'none';
      });

      const fieldMap = {
        'EquipmentID': 'id',
        'ID': 'id',
        'Description': 'description',
        'Voltage': 'voltage',
        'Category': 'category',
        'Sub-Category': 'subCategory',
        'Manufacturer': 'manufacturer',
        'Model': 'model',
        'Phases': 'phases',
        'Notes': 'notes',
        'X': 'x',
        'Y': 'y',
        'Z': 'z'
      };

      const csvBtn = document.getElementById('import-csv-btn');
      const csvInput = document.getElementById('import-csv-input');
      if (csvBtn && csvInput) {
        csvBtn.addEventListener('click', () => csvInput.click());
        csvInput.addEventListener('change', e => {
          importCsv(e.target.files[0]);
          e.target.value = '';
        });
      }

      const xmlBtn = document.getElementById('import-xml-btn');
      const xmlInput = document.getElementById('import-xml-input');
      if (xmlBtn && xmlInput) {
        xmlBtn.addEventListener('click', () => xmlInput.click());
        xmlInput.addEventListener('change', e => {
          importXml(e.target.files[0]);
          e.target.value = '';
        });
      }

      function mapExternal(obj = {}) {
        const row = {};
        Object.keys(fieldMap).forEach(key => {
          const internal = fieldMap[key];
          row[internal] = obj[key] || obj[key.toLowerCase()] || '';
        });
        return row;
      }

      function importCsv(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
          const text = e.target.result;
          const lines = text.split(/\r?\n/).filter(l => l.trim());
          if (!lines.length) return;
          const headers = lines.shift().split(',').map(h => h.trim());
          const rows = lines.map(line => {
            const cells = line.split(',');
            const obj = {};
            headers.forEach((h, i) => obj[h] = cells[i] ? cells[i].trim() : '');
            return obj;
          });
          table.tbody.innerHTML = '';
          rows.forEach(r => table.addRow(mapExternal(r)));
          table.applyFilters();
          table.save();
          if (table.onChange) table.onChange();
        };
        reader.readAsText(file);
      }

      function importXml(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
          const text = e.target.result;
          const doc = new DOMParser().parseFromString(text, 'application/xml');
          const items = Array.from(doc.getElementsByTagName('equipment'))
            .concat(Array.from(doc.getElementsByTagName('item')));
          table.tbody.innerHTML = '';
          items.forEach(el => {
            const obj = {};
            Object.keys(fieldMap).forEach(key => {
              const n = el.getElementsByTagName(key)[0];
              if (n) obj[key] = n.textContent;
            });
            table.addRow(mapExternal(obj));
          });
          table.applyFilters();
          table.save();
          if (table.onChange) table.onChange();
        };
        reader.readAsText(file);
      }
    });
  }

})();

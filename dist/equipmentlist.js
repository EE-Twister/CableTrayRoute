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
  function exportProject() {
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

  window.addEventListener('DOMContentLoaded', () => {
    const cards = document.querySelectorAll('.workflow-grid .workflow-card');
    cards.forEach(card => {
      const key = card.dataset.storageKey;
      const statusEl = card.querySelector('.status');
      if (!statusEl) return;

      let complete = false;
      if (key === 'racewaySchedule') {
        // Raceway data is spread across multiple storage keys; mark complete
        // when any of the related tables has saved data.
        complete = getDuctbanks().length > 0 || getTrays().length > 0 || getConduits().length > 0;
      } else if (key === 'optimalRoute') {
        // Optimal routing relies on both cable and tray schedules.
        complete = getCables().length > 0 && getTrays().length > 0;
      } else if (key) {
        complete = !!getItem(key);
      }

      if (complete) {
        card.classList.add('complete');
        statusEl.textContent = '✓';
        statusEl.setAttribute('aria-label', 'Completed');
      } else {
        statusEl.textContent = 'Incomplete';
      }
    });
  });

  (function(global){
    const FT_TO_M = 0.3048;
    const IN_TO_MM = 25.4;
    let cached = 'imperial';

    function getUnitSystem(){
      if (global.getProject) {
        try { return global.getProject().settings?.units || 'imperial'; }
        catch { return 'imperial'; }
      }
      return cached;
    }

    function setUnitSystem(sys){
      const val = sys === 'metric' ? 'metric' : 'imperial';
      if (global.getProject && global.setProject){
        try {
          const proj = global.getProject();
          proj.settings = proj.settings || {};
          proj.settings.units = val;
          global.setProject(proj);
        } catch {}
      }
      cached = val;
    }

    function distanceToDisplay(ft){
      return getUnitSystem()==='imperial'?ft:ft*FT_TO_M;
    }
    function distanceFromInput(val){
      return getUnitSystem()==='imperial'?val:val/FT_TO_M;
    }
    function conduitToDisplay(inches){
      return getUnitSystem()==='imperial'?inches:inches*IN_TO_MM;
    }
    function conduitFromInput(val){
      return getUnitSystem()==='imperial'?val:val/IN_TO_MM;
    }
    function distanceLabel(){
      return getUnitSystem()==='imperial'?"ft":"m";
    }
    function conduitLabel(){
      return getUnitSystem()==='imperial'?"in":"mm";
    }
    function formatDistance(ft,prec=2){
      return `${distanceToDisplay(ft).toFixed(prec)} ${distanceLabel()}`;
    }
    function formatConduitSize(inches,prec=2){
      return `${conduitToDisplay(inches).toFixed(prec)} ${conduitLabel()}`;
    }

    const api={
      getUnitSystem,
      setUnitSystem,
      distanceToDisplay,
      distanceFromInput,
      conduitToDisplay,
      conduitFromInput,
      distanceLabel,
      conduitLabel,
      formatDistance,
      formatConduitSize
    };
    if(typeof module!=="undefined"&&module.exports){ module.exports=api; }
    global.units=api;
  })(typeof globalThis!=='undefined'?globalThis:window);

  // fast-json-patch is loaded dynamically so the bundle does not expect a
  // build-time dependency. This avoids "index_mjs is not defined" errors in
  // the minified output when the raceway schedule loads sample data.
  let applyPatch, compare;
  async function loadJsonPatch() {
    const mod = await import('https://cdn.jsdelivr.net/npm/fast-json-patch@3.1.0/index.mjs');
    ({ applyPatch, compare } = mod);
  }
  const FOCUSABLE="a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])";
  const PROJECT_KEY='CTR_PROJECT_V1';
  const CHECKPOINT_KEY='CTR_CHECKPOINT';
  const MAX_CHECKPOINT_SIZE=2*1024*1024; // ~2MB

  function defaultProject(){
    return {name:'',ductbanks:[],conduits:[],trays:[],cables:[],settings:{session:{},collapsedGroups:{},units:'imperial'}};
  }

  function migrateProject(old={}){
    const settings = old.settings || {
      session: old.session || old.ctrSession || {},
      collapsedGroups: old.collapsedGroups || {}
    };
    if(!settings.units) settings.units='imperial';
    return {
      name: old.name || '',
      ductbanks: old.ductbanks || old.ductbankSchedule || [],
      conduits: old.conduits || old.conduitSchedule || [],
      trays: old.trays || old.traySchedule || [],
      cables: old.cables || old.cableSchedule || [],
      settings
    };
  }

  function initProjectStorage(){
    if(typeof localStorage==='undefined')return;
    const realGet=localStorage.getItem.bind(localStorage);
    const realSet=localStorage.setItem.bind(localStorage);
    const realRemove=localStorage.removeItem.bind(localStorage);
    globalThis._ctrRealSetItem=realSet;

    const undoStack=[];
    const redoStack=[];

    function pushUndo(oldProj,newProj){
      const patch=compare(newProj,oldProj);
      if(patch.length){
        undoStack.push(patch);
        redoStack.length=0;
      }
    }

    let project;
    try{ project=JSON.parse(realGet(PROJECT_KEY)); }catch{ project=null; }
    if(!project||typeof project!=='object'){
      const old={
        cables: JSON.parse(realGet('cableSchedule')||'[]'),
        trays: JSON.parse(realGet('traySchedule')||'[]'),
        conduits: JSON.parse(realGet('conduitSchedule')||'[]'),
        ductbanks: JSON.parse(realGet('ductbankSchedule')||'[]'),
        settings:{
          session: JSON.parse(realGet('ctrSession')||'{}'),
          collapsedGroups: JSON.parse(realGet('collapsedGroups')||'{}'),
          conduitFillData: JSON.parse(realGet('conduitFillData')||'null'),
          trayFillData: JSON.parse(realGet('trayFillData')||'null'),
          ductbankSession: JSON.parse(realGet('ductbankSession')||'{}')
        }
      };
      project=migrateProject(old);
      try{realSet(PROJECT_KEY,JSON.stringify(project));}
      catch(e){console.warn('project save failed',e);}
    }

    function save(){
      try{realSet(PROJECT_KEY,JSON.stringify(project));}
      catch(e){console.warn('project save failed',e);}
      globalThis.updateProjectDisplay?.();
    }

    function setItem(key,value){
      const oldProject=JSON.parse(JSON.stringify(project));
      if(key===PROJECT_KEY){
        try{realSet(key,value);}catch(e){console.warn('project save failed',e);}
        return;
      }
      switch(key){
        case 'cableSchedule': project.cables=JSON.parse(value); break;
        case 'traySchedule': project.trays=JSON.parse(value); break;
        case 'conduitSchedule': project.conduits=JSON.parse(value); break;
        case 'ductbankSchedule': project.ductbanks=JSON.parse(value); break;
        case 'collapsedGroups': project.settings.collapsedGroups=JSON.parse(value); break;
        case 'ctrSession': project.settings.session=JSON.parse(value); break;
        default:
          if(!project.settings) project.settings={};
          try{ project.settings[key]=JSON.parse(value); }
          catch{ project.settings[key]=value; }
      }
      pushUndo(oldProject,project);
      save();
    }

    function getItem(key){
      if(key===PROJECT_KEY) return realGet(key);
      switch(key){
        case 'cableSchedule': return JSON.stringify(project.cables||[]);
        case 'traySchedule': return JSON.stringify(project.trays||[]);
        case 'conduitSchedule': return JSON.stringify(project.conduits||[]);
        case 'ductbankSchedule': return JSON.stringify(project.ductbanks||[]);
        case 'collapsedGroups': return JSON.stringify(project.settings?.collapsedGroups||{});
        case 'ctrSession': return JSON.stringify(project.settings?.session||{});
        default:
          return project.settings&&key in project.settings ? JSON.stringify(project.settings[key]) : null;
      }
    }

    function removeItem(key){
      const oldProject=JSON.parse(JSON.stringify(project));
      if(key===PROJECT_KEY){ realRemove(key); return; }
      switch(key){
        case 'cableSchedule': project.cables=[]; break;
        case 'traySchedule': project.trays=[]; break;
        case 'conduitSchedule': project.conduits=[]; break;
        case 'ductbankSchedule': project.ductbanks=[]; break;
        case 'collapsedGroups': delete project.settings.collapsedGroups; break;
        case 'ctrSession': delete project.settings.session; break;
        default:
          if(project.settings) delete project.settings[key];
      }
      pushUndo(oldProject,project);
      save();
    }

    localStorage.getItem=getItem;
    localStorage.setItem=setItem;
    localStorage.removeItem=removeItem;

    globalThis.getProject=()=>JSON.parse(JSON.stringify(project));
    globalThis.setProject=p=>{
      const oldProject=JSON.parse(JSON.stringify(project));
      project=migrateProject(p);
      pushUndo(oldProject,project);
      save();
    };

    globalThis.undoProject=()=>{
      if(!undoStack.length) return;
      const patch=undoStack.pop();
      const current=JSON.parse(JSON.stringify(project));
      const result=applyPatch(current,patch,true).newDocument;
      redoStack.push(compare(result,project));
      project=result;
      save();
    };

    globalThis.redoProject=()=>{
      if(!redoStack.length) return;
      const patch=redoStack.pop();
      const current=JSON.parse(JSON.stringify(project));
      const result=applyPatch(current,patch,true).newDocument;
      undoStack.push(compare(result,project));
      project=result;
      save();
    };

    globalThis.addEventListener('beforeunload',()=>{undoStack.length=0;redoStack.length=0;});
  }

  globalThis.migrateProject=migrateProject;
  loadJsonPatch().then(initProjectStorage).catch(e=>console.error('fast-json-patch load failed',e));

  function canonicalize(obj){
    if(Array.isArray(obj)) return obj.map(canonicalize);
    if(obj&&typeof obj==='object'){
      const out={};
      Object.keys(obj).sort().forEach(k=>{out[k]=canonicalize(obj[k]);});
      return out;
    }
    return obj;
  }

  function canonicalJSONString(obj){
    return JSON.stringify(canonicalize(obj));
  }

  async function sha256Hex(str){
    const buf=new TextEncoder().encode(str);
    const subtle=crypto.subtle||crypto.webcrypto?.subtle;
    const hash=await subtle.digest('SHA-256',buf);
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function bytesToBase64(bytes){
    let binary='';
    for(const b of bytes) binary+=String.fromCharCode(b);
    return btoa(binary);
  }

  function base64ToBytes(b64){
    const bin=atob(b64);
    const arr=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    return arr;
  }

  async function compressString(str){
    try{
      const cs=new CompressionStream('gzip');
      const writer=cs.writable.getWriter();
      await writer.write(new TextEncoder().encode(str));
      await writer.close();
      const buffer=await new Response(cs.readable).arrayBuffer();
      return new Uint8Array(buffer);
    }catch{
      return new TextEncoder().encode(str);
    }
  }

  async function decompressBytes(bytes){
    try{
      const ds=new DecompressionStream('gzip');
      const writer=ds.writable.getWriter();
      await writer.write(bytes);
      await writer.close();
      const buffer=await new Response(ds.readable).arrayBuffer();
      return new TextDecoder().decode(buffer);
    }catch{
      return new TextDecoder().decode(bytes);
    }
  }

  async function encodeProjectForUrl(project){
    const json=canonicalJSONString(project);
    const bytes=await compressString(json);
    return encodeURIComponent(bytesToBase64(bytes));
  }

  async function decodeProjectFromUrl(encoded){
    const bytes=base64ToBytes(decodeURIComponent(encoded));
    const json=await decompressBytes(bytes);
    return JSON.parse(json);
  }

  async function saveCheckpoint(){
    try{
      const proj=getProject();
      const json=canonicalJSONString(proj);
      const bytes=await compressString(json);
      if(bytes.length>MAX_CHECKPOINT_SIZE){
        alert('Checkpoint exceeds 2MB limit');
        return;
      }
      globalThis._ctrRealSetItem?.(CHECKPOINT_KEY,bytesToBase64(bytes));
    }catch(e){
      console.error('Checkpoint save failed',e);
    }
  }

  async function updateProjectDisplay(){
    if(typeof getProject!=='function') return;
    const proj=getProject();
    const name=proj.name||'Untitled';
    try{
      const hash=await sha256Hex(canonicalJSONString(proj));
      let span=document.getElementById('project-display');
      if(!span){
        const nav=document.querySelector('.top-nav .nav-links');
        const settingsBtn=document.getElementById('settings-btn');
        if(nav){
          span=document.createElement('span');
          span.id='project-display';
          span.style.marginLeft='auto';
          span.style.marginRight='1rem';
          nav.insertBefore(span,settingsBtn);
          if(settingsBtn) settingsBtn.style.marginLeft='0';
        }
      }
      if(span) span.textContent=`Project: ${name} (hash: ${hash.slice(0,8)})`;
    }catch(e){console.error('hash failed',e);}
  }
  globalThis.updateProjectDisplay=updateProjectDisplay;

  async function copyShareLink(){
    try{
      const proj=getProject?getProject():defaultProject();
      const canonical=canonicalJSONString(proj);
      const encoded=await encodeProjectForUrl(proj);
      const url=`${location.origin}${location.pathname}#project=${encoded}`;
      if(url.length<2000){
        await navigator.clipboard.writeText(url);
        alert('Share link copied to clipboard');
      }else {
        const blob=new Blob([canonical],{type:'application/json'});
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download='project.ctr.json';
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),0);
        alert('Project too large for link; downloaded instead');
      }
    }catch(e){console.error('share link failed',e);}
  }

  async function loadProjectFromHash(){
    if(location.hash.startsWith('#project=')){
      try{
        const data=location.hash.slice(9);
        const proj=await decodeProjectFromUrl(data);
        if(globalThis.setProject) globalThis.setProject(proj);
        location.hash='';
        location.reload();
      }catch(e){console.error('load share failed',e);}
    }
  }

  function trapFocus$1(e,container){
    if(e.key!=='Tab')return;
    const focusables=container.querySelectorAll(FOCUSABLE);
    if(!focusables.length)return;
    const first=focusables[0];
    const last=focusables[focusables.length-1];
    if(e.shiftKey&&document.activeElement===first){
      e.preventDefault();
      last.focus();
    }else if(!e.shiftKey&&document.activeElement===last){
      e.preventDefault();
      first.focus();
    }
  }

  function loadScript(url){
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=url;
      s.onload=()=>resolve();
      s.onerror=reject;
      document.head.appendChild(s);
    });
  }

  async function generateTechnicalReport(format='pdf'){
    const getLabel=id=>document.querySelector(`label[for="${id}"]`)?.textContent.trim()||id;
    const inputs=[...document.querySelectorAll('input, select, textarea')]
      .map(el=>`${getLabel(el.id||el.name||'')}: ${el.value}`);
    const outputEl=document.getElementById('results')||document.getElementById('output');
    const outputs=outputEl?outputEl.innerText.trim():'';
    const refs=[...document.querySelectorAll('.method-panel a')].map(a=>a.href);

    if(format==='pdf'){
      if(!window.jspdf){
        await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
      }
      const { jsPDF } = window.jspdf;
      const doc=new jsPDF();
      let y=10;
      doc.text('Technical Report',10,y); y+=10;
      doc.text('Inputs:',10,y); y+=10;
      inputs.forEach(line=>{doc.text(line,10,y); y+=10; if(y>280){doc.addPage(); y=10;}});
      if(outputs){doc.addPage(); y=10; doc.text('Outputs:',10,y); y+=10; doc.text(outputs,10,y);}
      if(refs.length){doc.addPage(); y=10; doc.text('References:',10,y); y+=10; refs.forEach(r=>{doc.text(r,10,y); y+=10; if(y>280){doc.addPage(); y=10;}});}
      doc.save('technical_report.pdf');
    }else {
      if(!window.docx){
        await loadScript('https://cdn.jsdelivr.net/npm/docx@8.4.0/build/index.min.js');
      }
      const { Document, Packer, Paragraph } = window.docx;
      const paragraphs=[new Paragraph('Technical Report'),new Paragraph('Inputs:')];
      inputs.forEach(line=>paragraphs.push(new Paragraph(line)));
      if(outputs){paragraphs.push(new Paragraph('Outputs:')); paragraphs.push(new Paragraph(outputs));}
      if(refs.length){paragraphs.push(new Paragraph('References:')); refs.forEach(r=>paragraphs.push(new Paragraph(r)));}
      const doc=new Document({sections:[{properties:{},children:paragraphs}]});
      const blob=await Packer.toBlob(doc);
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download='technical_report.docx';
      a.click();
    }
  }

  function initSettings$1(){
    const settingsBtn=document.getElementById('settings-btn');
    const settingsMenu=document.getElementById('settings-menu');
    if(settingsBtn&&settingsMenu){
      settingsMenu.setAttribute('role','dialog');
      settingsMenu.setAttribute('aria-modal','true');
      settingsMenu.setAttribute('aria-hidden','true');
      let open=false;

      const handleKey=e=>{
        if(e.key==='Escape')close();
        else trapFocus$1(e,settingsMenu);
      };

      const openMenu=()=>{
        open=true;
        settingsMenu.style.display='flex';
        settingsMenu.setAttribute('aria-hidden','false');
        settingsBtn.setAttribute('aria-expanded','true');
        document.addEventListener('keydown',handleKey);
        const focusables=settingsMenu.querySelectorAll(FOCUSABLE);
        if(focusables.length)focusables[0].focus();
      };

      const close=()=>{
        if(!open)return;
        open=false;
        settingsMenu.style.display='none';
        settingsMenu.setAttribute('aria-hidden','true');
        settingsBtn.setAttribute('aria-expanded','false');
        document.removeEventListener('keydown',handleKey);
        settingsBtn.focus();
      };

      settingsBtn.addEventListener('click',()=>{
        open?close():openMenu();
      });

      document.addEventListener('click',e=>{
        if(open&&!settingsMenu.contains(e.target)&&e.target!==settingsBtn){
          close();
        }
      });

      const nameLabel=document.createElement('label');
      nameLabel.textContent='Project Name';
      const nameInput=document.createElement('input');
      nameInput.type='text';
      nameInput.id='project-name-input';
      try{nameInput.value=getProject().name||'';}catch{}
      nameLabel.appendChild(nameInput);
      settingsMenu.insertBefore(nameLabel,settingsMenu.firstChild);
      nameInput.addEventListener('input',e=>{
        try{
          const proj=getProject();
          proj.name=e.target.value;
          setProject(proj);
          updateProjectDisplay();
        }catch{}
      });

      const exportBtn=document.getElementById('export-project-btn');
      const shareBtn=document.createElement('button');
      shareBtn.id='copy-share-link-btn';
      shareBtn.textContent='Copy Share Link';
      if(exportBtn) exportBtn.insertAdjacentElement('beforebegin',shareBtn);
      else settingsMenu.appendChild(shareBtn);
      shareBtn.addEventListener('click',copyShareLink);

      const selfCheckBtn=document.createElement('button');
      selfCheckBtn.id='run-self-check-btn';
      selfCheckBtn.textContent='Run Self-Check';
      settingsMenu.appendChild(selfCheckBtn);
      selfCheckBtn.addEventListener('click',()=>{ location.href='optimalRoute.html?selfcheck=1'; });

      const reportBtn=document.createElement('button');
      reportBtn.id='generate-report-btn';
      reportBtn.textContent='Generate Technical Report';
      settingsMenu.appendChild(reportBtn);
      reportBtn.addEventListener('click',async()=>{
        const useDocx=confirm('Generate DOCX? Cancel for PDF');
        await generateTechnicalReport(useDocx?'docx':'pdf');
      });
    }
    const unitSelect=document.getElementById('unit-select');
    if(unitSelect){
      try{ unitSelect.value=getProject().settings?.units||'imperial'; }catch{}
      unitSelect.addEventListener('change',e=>{
        try{
          const proj=getProject();
          proj.settings=proj.settings||{};
          proj.settings.units=e.target.value;
          setProject(proj);
        }catch{}
        applyUnitLabels();
      });
    }
    applyUnitLabels();
    updateProjectDisplay();
      window.addEventListener('storage',e=>{if(e.key===PROJECT_KEY) updateProjectDisplay();});
  }

  function initDarkMode$1(){
    const darkToggle=document.getElementById('dark-toggle');
    const session=JSON.parse(localStorage.getItem('ctrSession')||'{}');
    if(session.darkMode===undefined){
      const prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
      session.darkMode=prefersDark;
      localStorage.setItem('ctrSession',JSON.stringify(session));
    }
    document.body.classList.toggle('dark-mode',session.darkMode);
    if(darkToggle) darkToggle.checked=!!session.darkMode;
    if(darkToggle){
      darkToggle.addEventListener('change',()=>{
        document.body.classList.toggle('dark-mode',darkToggle.checked);
        session.darkMode=darkToggle.checked;
        localStorage.setItem('ctrSession',JSON.stringify(session));
        if(typeof window.saveSession==='function') window.saveSession();
        if(typeof window.saveDuctbankSession==='function') window.saveDuctbankSession();
      });
    }
    window.addEventListener('storage',e=>{
      if(e.key==='ctrSession'){
        try{
          const data=JSON.parse(e.newValue);
          document.body.classList.toggle('dark-mode',data&&data.darkMode);
          if(darkToggle) darkToggle.checked=!!(data&&data.darkMode);
        }catch{}
      }
    });
  }

  function initCompactMode$1(){
    const compactToggle=document.getElementById('compact-toggle');
    const session=JSON.parse(localStorage.getItem('ctrSession')||'{}');
    if(session.compactMode===undefined){
      session.compactMode=false;
      localStorage.setItem('ctrSession',JSON.stringify(session));
    }
    document.body.classList.toggle('compact-mode',session.compactMode);
    if(compactToggle) compactToggle.checked=!!session.compactMode;
    if(compactToggle){
      compactToggle.addEventListener('change',()=>{
        document.body.classList.toggle('compact-mode',compactToggle.checked);
        session.compactMode=compactToggle.checked;
        localStorage.setItem('ctrSession',JSON.stringify(session));
        if(typeof window.saveSession==='function') window.saveSession();
        if(typeof window.saveDuctbankSession==='function') window.saveDuctbankSession();
      });
    }
    window.addEventListener('storage',e=>{
      if(e.key==='ctrSession'){
        try{
          const data=JSON.parse(e.newValue);
          document.body.classList.toggle('compact-mode',data&&data.compactMode);
          if(compactToggle) compactToggle.checked=!!(data&&data.compactMode);
        }catch{}
      }
    });
  }

  function initHelpModal(btnId='help-btn',modalId='help-modal',closeId){
    const btn=document.getElementById(btnId);
    const modal=document.getElementById(modalId);
    const closeBtn=closeId?document.getElementById(closeId):(modal?modal.querySelector('.close-btn'):null);
    if(btn&&modal&&closeBtn){
      modal.setAttribute('role','dialog');
      modal.setAttribute('aria-modal','true');
      modal.setAttribute('aria-hidden','true');
      const content=modal.querySelector('.modal-content');
      const defaults=Array.from(content.children);
      let iframe=null;

      const handleKey=e=>{
        if(e.key==='Escape')close();
        else trapFocus$1(e,modal);
      };

      const open=()=>{
        modal.style.display='flex';
        modal.setAttribute('aria-hidden','false');
        btn.setAttribute('aria-expanded','true');
        document.addEventListener('keydown',handleKey);
        const focusables=modal.querySelectorAll(FOCUSABLE);
        if(focusables.length)focusables[0].focus();
      };
      const close=()=>{
        modal.style.display='none';
        modal.setAttribute('aria-hidden','true');
        btn.setAttribute('aria-expanded','false');
        document.removeEventListener('keydown',handleKey);
        btn.focus();
        if(iframe){iframe.style.display='none';iframe.src='';}
        defaults.forEach(el=>{if(el!==closeBtn)el.style.display='';});
      };
      globalThis.showHelpDoc=url=>{
        if(!iframe){
          iframe=document.createElement('iframe');
          iframe.id='help-iframe';
          iframe.style.width='100%';
          iframe.style.height='80vh';
          content.appendChild(iframe);
        }
        defaults.forEach(el=>{if(el!==closeBtn)el.style.display='none';});
        iframe.style.display='block';
        iframe.src=url;
        open();
      };
      btn.addEventListener('click',open);
      closeBtn.addEventListener('click',close);
      modal.addEventListener('click',e=>{if(e.target===modal)close();});
    }
  }

  function initNavToggle$1(){
    const toggle=document.querySelector('.nav-toggle');
    if(!toggle) return;
    const target=document.getElementById(toggle.getAttribute('aria-controls'));
    if(!target) return;

    function closeMenu(){
      toggle.setAttribute('aria-expanded','false');
      target.classList.remove('open');
    }

    toggle.addEventListener('click',()=>{
      const expanded=toggle.getAttribute('aria-expanded')==='true';
      toggle.setAttribute('aria-expanded',String(!expanded));
      target.classList.toggle('open',!expanded);
    });

    document.addEventListener('keydown',e=>{
      if(e.key==='Escape') closeMenu();
    });
  }

    function checkPrereqs(prereqs=[]){
      // Previously this function displayed a banner when required data was missing.
      // The banner has been removed to declutter the interface, so this function now
      // intentionally performs no UI actions even if data is absent.
    }

  function initTableNav(){
    document.addEventListener('keydown',e=>{
      if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;
      const target=e.target;
      if(!['INPUT','SELECT','TEXTAREA'].includes(target.tagName))return;
      const cell=target.closest('td');
      if(!cell||!cell.closest('table'))return;
      const row=cell.parentElement;
      const idx=cell.cellIndex;
      const targetRow=e.key==='ArrowUp'?row.previousElementSibling:row.nextElementSibling;
      if(!targetRow)return;
      const targetCell=targetRow.cells[idx];
      if(!targetCell)return;
      const focusable=targetCell.querySelector('input, select, textarea');
      if(!focusable)return;
      e.preventDefault();
      focusable.focus();
      if(typeof focusable.select==='function') focusable.select();
    });
  }

  const CTR_CONDUITS = 'CTR_CONDUITS';

  function persistConduits(data){
    try{
      localStorage.setItem(CTR_CONDUITS,JSON.stringify(data));
      const condKey=globalThis.TableUtils?.STORAGE_KEYS?.conduitSchedule||'conduitSchedule';
      localStorage.setItem(condKey,JSON.stringify(data.conduits||[]));
    }catch(e){console.error('Failed to persist conduits',e);}
  }

  function loadConduits(){
    try{
      const raw=localStorage.getItem(CTR_CONDUITS);
      if(raw){
        const parsed=JSON.parse(raw);
        return {ductbanks:parsed.ductbanks||[],conduits:parsed.conduits||[]};
      }
    }catch(e){}
    const dbKey=globalThis.TableUtils?.STORAGE_KEYS?.ductbankSchedule||'ductbankSchedule';
    const condKey=globalThis.TableUtils?.STORAGE_KEYS?.conduitSchedule||'conduitSchedule';
    let ductbanks=[];let conduits=[];
    try{ductbanks=JSON.parse(localStorage.getItem(dbKey)||'[]');}catch(e){}
    try{conduits=JSON.parse(localStorage.getItem(condKey)||'[]');}catch(e){}
    const flattened=[];
    ductbanks=ductbanks.map(db=>{
      (db.conduits||[]).forEach(c=>{
        flattened.push({
          ductbankTag:db.tag,
          conduit_id:c.conduit_id,
          tray_id:`${db.tag}-${c.conduit_id}`,
          type:c.type,
          trade_size:c.trade_size,
          start_x:c.start_x,start_y:c.start_y,start_z:c.start_z,
          end_x:c.end_x,end_y:c.end_y,end_z:c.end_z,
          allowed_cable_group:c.allowed_cable_group
        });
      });
      const {conduits:_,...rest}=db;
      return rest;
    });
    return {ductbanks,conduits:[...flattened,...conduits]};
  }

   globalThis.document?.addEventListener('DOMContentLoaded',initTableNav);

  function initProjectIO(){
    loadProjectFromHash();
    const exportBtn=document.getElementById('export-project-btn');
    if(exportBtn){
      const checkpointBtn=document.createElement('button');
      checkpointBtn.id='save-checkpoint-btn';
      checkpointBtn.textContent='Save Checkpoint';
      exportBtn.insertAdjacentElement('afterend',checkpointBtn);
      checkpointBtn.addEventListener('click',saveCheckpoint);
    }
    const importBtn=document.getElementById('import-project-btn');
    const fileInput=document.getElementById('import-project-input');
    if(exportBtn){
      exportBtn.addEventListener('click',()=>{
        try{
          const data=exportProject();
          const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
          const a=document.createElement('a');
          a.href=URL.createObjectURL(blob);
          a.download='project.ctr.json';
          a.click();
          setTimeout(()=>URL.revokeObjectURL(a.href),0);
        }catch(e){console.error('Export failed',e);}
      });
    }
    if(importBtn&&fileInput){
      importBtn.addEventListener('click',()=>fileInput.click());
      fileInput.addEventListener('change',e=>{
        const file=e.target.files[0];
        if(!file)return;
        const reader=new FileReader();
        reader.onload=ev=>{
          try{
            const obj=JSON.parse(ev.target.result);
            if(importProject(obj)) location.reload();
          }catch(err){console.error('Import failed',err);}
        };
        reader.readAsText(file);
        fileInput.value='';
      });
    }
  }

  globalThis.addEventListener?.('DOMContentLoaded',initProjectIO);

  function applyUnitLabels(){
    const sys=globalThis.units?.getUnitSystem()?globalThis.units.getUnitSystem():'imperial';
    const d=sys==='imperial'?'ft':'m';
    const c=sys==='imperial'?'in':'mm';
    document.querySelectorAll('[data-unit="distance"]').forEach(el=>el.textContent=d);
    document.querySelectorAll('[data-unit="conduit"]').forEach(el=>el.textContent=c);
  }

  function showSelfCheckModal(data){
    const modal=document.createElement('div');
    modal.className='modal';
    modal.id='self-check-modal';
    const content=document.createElement('div');
    content.className='modal-content';
    const close=document.createElement('button');
    close.className='close-btn';
    close.textContent='\u00D7';
    close.addEventListener('click',()=>modal.remove());
    const title=document.createElement('h2');
    title.textContent=data.pass?'Self-Check PASSED':'Self-Check FAILED';
    const pre=document.createElement('pre');
    const json=JSON.stringify(data,null,2);
    pre.textContent=json;
    const actions=document.createElement('div');
    actions.className='modal-actions';
    const copyBtn=document.createElement('button');
    copyBtn.textContent='Copy Diagnostics';
    copyBtn.addEventListener('click',()=>navigator.clipboard.writeText(json));
    actions.appendChild(copyBtn);
    content.appendChild(close);
    content.appendChild(title);
    content.appendChild(pre);
    content.appendChild(actions);
    modal.appendChild(content);
    document.body.appendChild(modal);
    modal.style.display='flex';
  }

  globalThis.initSettings=initSettings$1;
  globalThis.initDarkMode=initDarkMode$1;
  globalThis.initCompactMode=initCompactMode$1;
  globalThis.initHelpModal=initHelpModal;
  globalThis.initNavToggle=initNavToggle$1;
  globalThis.checkPrereqs=checkPrereqs;
  globalThis.persistConduits=persistConduits;
  globalThis.loadConduits=loadConduits;
  globalThis.applyUnitLabels=applyUnitLabels;
  globalThis.showSelfCheckModal=showSelfCheckModal;

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
      const inp=document.createElement('input');
      inp.type='text';
      inp.value=this.filters[index];
      popup.appendChild(inp);
      let debounceTimer;
      const applyFilter=()=>{
        this.filters[index]=inp.value.trim();
        if(this.filters[index]) btn.classList.add('filtered'); else btn.classList.remove('filtered');
        this.applyFilters();
      };
      inp.addEventListener('input',()=>{
        clearTimeout(debounceTimer);
        debounceTimer=setTimeout(applyFilter,300);
      });
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
        inp.value='';
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
          if(el.type==='number') el.step = col.step || '1';
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
        { key: 'x', label: 'X', type: 'number' },
        { key: 'y', label: 'Y', type: 'number' },
        { key: 'z', label: 'Z', type: 'number' }
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
        onChange: () => table.save()
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
    });
  }

})();

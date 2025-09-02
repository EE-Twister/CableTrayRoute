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
    // Legacy aliases for backward compatibility
    traySchedule: 'traySchedule',
    cableSchedule: 'cableSchedule',
    ductbankSchedule: 'ductbankSchedule',
    conduitSchedule: 'conduitSchedule',
    panelSchedule: 'panelSchedule',
    loadList: 'loadList'
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
      kw: '',
      powerFactor: '',
      demandFactor: '',
      phases: '',
      circuit: '',
      ...l
    };
  }

  const setLoads = loads => write(KEYS.loads, loads.map(ensureLoadFields));

  const addLoad = load => {
    const loads = getLoads();
    loads.push(ensureLoadFields(load));
    setLoads(loads);
  };

  const updateLoad = (index, load) => {
    const loads = getLoads();
    if (index >= 0 && index < loads.length) {
      loads[index] = ensureLoadFields({ ...loads[index], ...load });
      setLoads(loads);
    }
  };

  const removeLoad = index => {
    const loads = getLoads();
    if (index >= 0 && index < loads.length) {
      loads.splice(index, 1);
      setLoads(loads);
    }
  };

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
    const required = ['ductbanks', 'conduits', 'trays', 'cables', 'panels', 'loads', 'settings'];
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
        loads: Array.isArray(obj.loads) ? obj.loads : [],
        settings: (obj.settings && typeof obj.settings === 'object') ? obj.settings : {}
      };
    }

    setDuctbanks(data.ductbanks);
    setConduits(data.conduits);
    setTrays(data.trays);
    setCables(data.cables);
    setPanels(Array.isArray(data.panels) ? data.panels : []);
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
      getLoads,
      setLoads,
      addLoad,
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

  function trapFocus(e,container){
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
        else trapFocus(e,settingsMenu);
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
        else trapFocus(e,modal);
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

  function calculateDerived(load) {
    const qty = parseFloat(load.quantity) || 1;
    const voltage = parseFloat(load.voltage);
    const kw = parseFloat(load.kw);
    const pf = parseFloat(load.powerFactor);
    const df = parseFloat(load.demandFactor);
    const phases = parseInt(load.phases, 10);
    const totalKw = isNaN(kw) ? 0 : kw * qty;
    const kVA = pf ? totalKw / pf : totalKw;
    const phaseFactor = phases === 1 ? 1 : Math.sqrt(3);
    const current = voltage ? (kVA * 1000) / (phaseFactor * voltage) : 0;
    const demandKW = totalKw * (isNaN(df) ? 1 : df / 100);
    const demandKVA = pf ? demandKW / pf : demandKW;
    return { kva: kVA, current, demandKw: demandKW, demandKva: demandKVA };
  }

  // Inline load list editor
  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      initSettings();
      initDarkMode();
      initCompactMode();
      initNavToggle();

      const tbody = document.querySelector('#load-table tbody');
      const tfoot = document.querySelector('#load-table tfoot');
      const addBtn = document.getElementById('add-row-btn');
      const deleteBtn = document.getElementById('delete-selected-btn');
      const selectAll = document.getElementById('select-all');

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
        quantity: tr.querySelector('input[name="quantity"]').value.trim(),
        voltage: tr.querySelector('input[name="voltage"]').value.trim(),
        loadType: tr.querySelector('input[name="loadType"]').value.trim(),
        kw: tr.querySelector('input[name="kw"]').value.trim(),
        powerFactor: tr.querySelector('input[name="powerFactor"]').value.trim(),
        demandFactor: tr.querySelector('input[name="demandFactor"]').value.trim(),
        phases: tr.querySelector('input[name="phases"]').value.trim(),
        circuit: tr.querySelector('input[name="circuit"]').value.trim()
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
      tr.innerHTML = `
      <td><input type="checkbox" class="row-select" aria-label="Select row"></td>
      <td><input name="source" type="text" value="${load.source || ''}"></td>
      <td><input name="tag" type="text" value="${load.tag || ''}"></td>
      <td><input name="description" type="text" value="${load.description || ''}"></td>
      <td><input name="quantity" type="number" step="any" value="${load.quantity || ''}"></td>
      <td><input name="voltage" type="number" step="any" value="${load.voltage || ''}"></td>
      <td><input name="loadType" type="text" value="${load.loadType || ''}"></td>
      <td><input name="kw" type="number" step="any" value="${load.kw || ''}"></td>
      <td><input name="powerFactor" type="number" step="any" value="${load.powerFactor || ''}"></td>
      <td><input name="demandFactor" type="number" step="any" value="${load.demandFactor || ''}"></td>
      <td><input name="phases" type="text" value="${load.phases || ''}"></td>
      <td><input name="circuit" type="text" value="${load.circuit || ''}"></td>
      <td class="kva">${format(load.kva)}</td>
      <td class="current">${format(load.current)}</td>
      <td class="demand-kva">${format(load.demandKva)}</td>
      <td class="demand-kw">${format(load.demandKw)}</td>`;

      Array.from(tr.querySelectorAll('input[type="text"],input[type="number"]')).forEach(input => {
        const td = input.parentElement;
        input.addEventListener('blur', () => saveRow(tr));
        input.addEventListener('keydown', e => handleNav(e, td));
      });

      const chk = tr.querySelector('.row-select');
      chk.addEventListener('change', () => {
        if (!chk.checked) selectAll.checked = false;
      });

      return tr;
    }

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
      <td colspan="7">Totals</td>
      <td>${totals.kW.toFixed(2)}</td>
      <td colspan="4"></td>
      <td>${totals.kVA.toFixed(2)}</td>
      <td></td>
      <td>${totals.demandKVA.toFixed(2)}</td>
      <td>${totals.demandKW.toFixed(2)}</td>
    </tr>`;
    }

    function render() {
      tbody.innerHTML = '';
      const loads = getLoads().map(l => ({ ...l, ...calculateDerived(l) }));
      setLoads(loads);
      loads.forEach((load, idx) => tbody.appendChild(createRow(load, idx)));
      selectAll.checked = false;
      updateFooter(loads);
    }

    function loadsToCSV(loads, delimiter = ',') {
      const header = [
        'source',
        'tag',
        'description',
        'quantity',
        'voltage',
        'loadType',
        'kw',
        'powerFactor',
        'demandFactor',
        'phases',
        'circuit',
        'panelId',
        'breaker',
        'kva',
        'current',
        'demandKva',
        'demandKw'
      ].join(delimiter);
      const lines = loads.map(l => {
        const base = { source: '', panelId: '', breaker: '', ...l };
        const full = { ...base, ...calculateDerived(base) };
        const vals = [
          full.source,
          full.tag,
          full.description,
          full.quantity,
          full.voltage,
          full.loadType,
          full.kw,
          full.powerFactor,
          full.demandFactor,
          full.phases,
          full.circuit,
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
        if (cols.length === 10 || cols.length === 11) {
          let source = '';
          let tag, description, quantity, voltage, loadType, kw, powerFactor, demandFactor, phases, circuit;
          if (cols.length === 10) {
            [tag, description, quantity, voltage, loadType, kw, powerFactor, demandFactor, phases, circuit] = cols;
          } else {
            [source, tag, description, quantity, voltage, loadType, kw, powerFactor, demandFactor, phases, circuit] = cols;
          }
          const nums = [quantity, voltage, kw, powerFactor, demandFactor];
          if (nums.some(n => n && isNaN(Number(n)))) throw new Error('Invalid CSV data');
          load = {
            source,
            tag,
            description,
            quantity,
            voltage,
            loadType,
            kw,
            powerFactor,
            demandFactor,
            phases,
            circuit,
            panelId: '',
            breaker: ''
          };
        } else if (cols.length === 16 || cols.length === 17) {
          let source = '';
          let tag, description, quantity, voltage, loadType, kw, powerFactor, demandFactor, phases, circuit, panelId, breaker, kva, current, demandKva, demandKw;
          if (cols.length === 16) {
            [
              tag,
              description,
              quantity,
              voltage,
              loadType,
              kw,
              powerFactor,
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
          } else {
            [
              source,
              tag,
              description,
              quantity,
              voltage,
              loadType,
              kw,
              powerFactor,
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
          }
          const nums = [quantity, voltage, kw, powerFactor, demandFactor, kva, current, demandKva, demandKw];
          if (nums.some(n => n && isNaN(Number(n)))) throw new Error('Invalid CSV data');
          load = {
            source,
            tag,
            description,
            quantity,
            voltage,
            loadType,
            kw,
            powerFactor,
            demandFactor,
            phases,
            circuit,
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
    addBtn.addEventListener('click', () => {
      addLoad({
        source: '',
        tag: '',
        description: '',
        quantity: '',
        voltage: '',
        loadType: '',
        kw: '',
        powerFactor: '',
        demandFactor: '',
        phases: '',
        circuit: ''
      });
      render();
      const last = tbody.lastElementChild;
      if (last) {
        const inp = last.querySelector('input[name="description"]');
        inp && inp.focus();
      }
    });

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

    document.getElementById('search').addEventListener('input', e => {
      const term = e.target.value.toLowerCase();
      Array.from(tbody.rows).forEach(row => {
        const match = Array.from(row.querySelectorAll('input[type="text"],input[type="number"]'))
          .some(inp => inp.value.toLowerCase().includes(term));
        row.style.display = match ? '' : 'none';
      });
    });

    document.getElementById('export-btn').addEventListener('click', () => {
      const data = getLoads().map(l => {
        const base = { panelId: '', breaker: '', ...l };
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
              quantity: '',
              voltage: '',
              loadType: '',
              kw: '',
              powerFactor: '',
              demandFactor: '',
              phases: '',
              circuit: '',
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

    render();
    });
  }

})();

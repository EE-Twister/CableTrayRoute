import {
  READINESS_VOCABULARY,
  getContractReadinessCopy
} from "./workflowStatus.js";
import { fetchDataFile } from "./fetchUtils.mjs";
import "../site.js";
import "../tableUtils.mjs";
import "../ductbankTable.js";
import "../e2e-helpers.js";
import { emitAsync } from "../utils/safeEvents.mjs";
import * as dataStore from "../dataStore.mjs";
import { openModal, showAlertModal } from "./components/modal.js";
import { start as startTour } from "../tour.js";
import {
  applyRecordImport,
  previewRecordImport,
  summarizeRacewayWorkflow
} from "../analysis/scheduleWorkflow.mjs";

const RACEWAY_TOUR_STEPS = [
  { selector: '#add-tray-btn',          message: 'Add a Cable Tray — enter width, depth, start/end 3D coordinates, and tray type (ladder, solid bottom, wire mesh).' },
  { selector: '#trayTable',             message: 'Each row defines one tray segment. The X1/Y1/Z1 → X2/Y2/Z2 coordinates place it in 3D space for the routing engine.' },
  { selector: '#add-conduit-btn',       message: 'Add conduits here. Conduits follow the same coordinate scheme as trays and participate in the same Dijkstra routing.' },
  { selector: '#raceway-load-samples',  message: 'Load sample raceway data to see a complete tray network with coordinates already filled in.' },
  { selector: '#export-revit-btn',      message: 'Export tray and conduit data as Revit-compatible JSON for round-trip BIM workflows.' }
];
import { downloadRevitExport } from "../exporters/revit.mjs";
import {
  normalizeDuctbankRow,
  normalizeConduitRow,
  normalizeTrayRow,
  sampleDuctbanks,
  sampleTrays,
  sampleConduits
} from "../racewaySampleData.mjs";

const RACEWAY_READINESS_COPY = getContractReadinessCopy('racewayschedule.html');

// ---- Inline E2E helpers (no external import) ----
const E2E = new URLSearchParams(location.search).has('e2e');
const DUCTBANK_ROW_SELECTOR = '#ductbankTable > tbody > tr:not(.conduit-container)';

function e2eOpenDetailsAndControls() {
  const E2E = new URLSearchParams(location.search).has('e2e');
  if (!E2E) return;
  // open <details> to reveal nested buttons
  document.querySelectorAll('details').forEach(d => {
    if(!d.classList.contains('toolbar-menu')) d.open = true;
  });
  // unhide common containers that gate buttons in E2E
  ['#settings-panel', '#controls', '#toolbar', '#sidebar'].forEach(sel => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.classList?.remove('hidden','is-hidden','invisible');
    el.removeAttribute?.('hidden');
    Object.assign(el.style, { display:'block', visibility:'visible', pointerEvents:'auto', opacity:'1' });
  });
  // make import button available for tests
  const importBtn = document.getElementById('import-project-btn');
  if (importBtn) { importBtn.disabled = false; importBtn.style.display = 'inline-block'; importBtn.style.pointerEvents = 'auto'; }
}

function ensureReadyBeacon(attrName, id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;z-index:2147483647;';
    document.body.appendChild(el);
  }
  el.setAttribute(attrName, '1');
}

function setReadyWhen(selector, attrName, id, timeoutMs = 25000) {
  const start = performance.now();
  const poll = () => {
    const el = document.querySelector(selector);
    const visible = !!el && !!(el.offsetParent || el.getClientRects().length);
    if (visible) return ensureReadyBeacon(attrName, id);
    if (performance.now() - start > timeoutMs) return;
    setTimeout(poll, 50);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', poll, { once: true });
  } else {
    poll();
  }
}


function createDirtyTracker(win = (typeof window !== 'undefined' ? window : undefined)) {
  if (!win) throw new Error('Window object required');
  let dirty = false;
  const message = 'Project is auto-saved; you can safely leave.';

  const shouldPrompt = () => dirty && !Boolean(win.autoSaveEnabled);
  const handler = e => {
    if (!shouldPrompt()) return;
    e.preventDefault();
    e.returnValue = message;
  };
  const update = () => {
    if (dirty) {
      win.addEventListener('beforeunload', handler);
    } else {
      win.removeEventListener('beforeunload', handler);
    }
  };

  return {
    markDirty() { dirty = true; update(); },
    markClean() { dirty = false; update(); },
    isDirty() { return dirty; }
  };
}


function suppressResumeIfE2E() {
  if (!E2E) return;
  // Never clear browser project storage from URL-controlled flags.
  // Do NOT auto-click resume buttons. Let tests click #resume-no-btn.
}

// Show resume modal in E2E so tests can click the No button
function forceShowResumeIfE2E() {
  const E2E = new URLSearchParams(location.search).has('e2e');
  if (!E2E) return;
  const modal = document.getElementById('resume-modal');
  const noBtn = document.getElementById('resume-no-btn');
  if (modal) {
    modal.removeAttribute('hidden');
    modal.classList.remove('hidden', 'is-hidden', 'invisible');
    modal.style.display = 'block';
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
  }
  if (noBtn) {
    noBtn.style.display = 'inline-block';
    noBtn.disabled = false;
  }
}

window.E2E = E2E;

function emitSticky(name, flagKey) {
  if (!window.__e2eFlags) window.__e2eFlags = {};
  window.__e2eFlags[flagKey] = true;
  emitAsync(name);
  if (E2E) {
    let n = 0;
    const id = setInterval(() => {
      emitAsync(name);
      if (++n >= 20) clearInterval(id);
    }, 50);
    setTimeout(() => clearInterval(id), 1500);
  }
}

function whenPresent(selector, cb, timeoutMs = 5000) {
  const start = performance.now();
  const poll = () => {
    if (document.querySelector(selector)) return cb();
    if (performance.now() - start > timeoutMs) return;
    setTimeout(poll, 50);
  };
  poll();
}

let _renderingRaceway = false;
let _wiredRacewayHandlers = false;

function clearRacewayTables() {
  ['#ductbankTable tbody', '#trayTable tbody', '#conduitTable tbody'].forEach(sel => {
    const tb = document.querySelector(sel);
    if (tb) tb.innerHTML = '';
  });
}

function wireRacewayHandlersOnce() {
  if (_wiredRacewayHandlers) return;
  _wiredRacewayHandlers = true;
  // move existing handler wiring here and ensure not duplicated
}
suppressResumeIfE2E();
document.addEventListener('DOMContentLoaded', forceShowResumeIfE2E);

checkPrereqs([{key:'cableSchedule',page:'cableschedule.html',label:'Cable Schedule'}]);

// Expose conduit specifications globally so other modules bundled into
// this file can access them after Rollup wraps everything in an IIFE. If
// the object isn't assigned to the global scope, modules like
// `ductbankTable.js` will throw a ReferenceError when they look up
// `CONDUIT_SPECS` during initialization.
const CONDUIT_SPECS = globalThis.CONDUIT_SPECS = {"EMT":{"1/2":0.304,"3/4":0.533,"1":0.864,"1-1/4":1.496,"1-1/2":2.036,"2":3.356,"2-1/2":5.858,"3":8.846,"3-1/2":11.545,"4":14.753},"ENT":{"1/2":0.285,"3/4":0.508,"1":0.832,"1-1/4":1.453,"1-1/2":1.986,"2":3.291},"FMC":{"3/8":0.116,"1/2":0.317,"3/4":0.533,"1":0.817,"1-1/4":1.277,"1-1/2":1.858,"2":3.269,"2-1/2":4.909,"3":7.069,"3-1/2":9.621,"4":12.566},"IMC":{"1/2":0.342,"3/4":0.586,"1":0.959,"1-1/4":1.647,"1-1/2":2.225,"2":3.63,"2-1/2":5.135,"3":7.922,"3-1/2":10.584,"4":13.631},"LFNC-A":{"3/8":0.192,"1/2":0.312,"3/4":0.535,"1":0.854,"1-1/4":1.502,"1-1/2":2.018,"2":3.343},"LFNC-B":{"3/8":0.192,"1/2":0.314,"3/4":0.541,"1":0.873,"1-1/4":1.528,"1-1/2":1.981,"2":3.246},"LFMC":{"3/8":0.192,"1/2":0.314,"3/4":0.541,"1":0.873,"1-1/4":1.277,"1-1/2":1.858,"2":3.269,"2-1/2":4.881,"3":7.475,"3-1/2":9.731,"4":12.692},"RMC":{"1/2":0.314,"3/4":0.549,"1":0.887,"1-1/4":1.526,"1-1/2":2.071,"2":3.408,"2-1/2":4.866,"3":7.499,"3-1/2":10.01,"4":12.882,"5":20.212,"6":29.158},"PVC Sch 80":{"1/2":0.217,"3/4":0.409,"1":0.688,"1-1/4":1.237,"1-1/2":1.711,"2":2.874,"2-1/2":4.119,"3":6.442,"3-1/2":8.688,"4":11.258,"5":17.855,"6":25.598},"PVC Sch 40":{"1/2":0.285,"3/4":0.508,"1":0.832,"1-1/4":1.453,"1-1/2":1.986,"2":3.291,"2-1/2":4.695,"3":7.268,"3-1/2":9.737,"4":12.554,"5":19.761,"6":28.567},"PVC Type A":{"1/2":0.385,"3/4":0.65,"1":1.084,"1-1/4":1.767,"1-1/2":2.324,"2":3.647,"2-1/2":5.453,"3":8.194,"3-1/2":10.694,"4":13.723},"PVC Type EB":{"2":3.874,"3":8.709,"3-1/2":11.365,"4":14.448,"5":22.195,"6":31.53}};

function parseSize(sz){
  if(sz.includes('-')){const[w,f]=sz.split('-');const[n,d]=f.split('/');return parseFloat(w)+parseFloat(n)/parseFloat(d);}
  if(sz.includes('/')){const[n,d]=sz.split('/');return parseFloat(n)/parseFloat(d);}
  return parseFloat(sz);
}

const CONDUIT_TYPES=Object.keys(CONDUIT_SPECS);
function tradeSizeOptions(type){
  return Object.keys(CONDUIT_SPECS[type]||{}).sort((a,b)=>parseSize(a)-parseSize(b));
}
const ALL_TRADE_SIZE_OPTIONS=Array.from(new Set(CONDUIT_TYPES.flatMap(type=>tradeSizeOptions(type)))).sort((a,b)=>parseSize(a)-parseSize(b));

const TRAY_WIDTH_OPTIONS=['2','3','4','6','8','9','12','16','18','20','24','30','36'];
const TRAY_DEPTH_OPTIONS=['2','3','4','5','6','7','8','9','10','11','12'];
const TRAY_TYPE_OPTIONS=['Ladder (50 % fill)','Solid Bottom (40 % fill)'];
const TRAY_COVER_OPTIONS=['No Cover','Ventilated Cover','Solid Cover'];
const TRAY_MATERIAL_OPTIONS=['Steel','Aluminum','Stainless Steel','Fiberglass'];
const CONDUIT_MATERIAL_OPTIONS=['Steel','Aluminum','PVC','Stainless Steel','Fiberglass'];
const RACEWAY_VIEW_PRESET_KEY = dataStore.STORAGE_KEYS.racewayScheduleViewPreset || 'racewayScheduleViewPreset';
const RACEWAY_VIEW_PRESETS = {
  basic: {
    ductbanks: ['toggle','tag','from','to','concrete_encasement'],
    trays: ['tray_id','inside_width','tray_depth','tray_type','cover_condition','material','allowed_cable_group'],
    conduits: ['conduit_id','type','material','trade_size','allowed_cable_group']
  },
  geometry: {
    ductbanks: ['toggle','tag','from','to','start_x','start_y','start_z','end_x','end_y','end_z'],
    trays: ['tray_id','start_x','start_y','start_z','end_x','end_y','end_z'],
    conduits: ['conduit_id','type','trade_size','start_x','start_y','start_z','end_x','end_y','end_z']
  },
  fill: {
    ductbanks: ['toggle','tag','concrete_encasement'],
    trays: ['tray_id','inside_width','tray_depth','tray_type','cover_condition','num_slots','slot_groups','allowed_cable_group'],
    conduits: ['conduit_id','type','trade_size','capacity','allowed_cable_group']
  },
  bim: {
    ductbanks: ['toggle','tag','from','to','concrete_encasement','start_x','start_y','start_z','end_x','end_y','end_z'],
    trays: ['tray_id','start_x','start_y','start_z','end_x','end_y','end_z','inside_width','tray_depth','tray_type','cover_condition','material'],
    conduits: ['conduit_id','type','material','trade_size','start_x','start_y','start_z','end_x','end_y','end_z']
  },
  full: null
};
const DUCTBANK_COLUMN_KEYS = ['toggle','tag','from','to','concrete_encasement','start_x','start_y','start_z','end_x','end_y','end_z'];
const ROW_ACTION_ICONS = {
  viewBtn: 'icons/toolbar/grid.svg',
  insertBelowBtn: 'icons/toolbar/add-arrangement.svg',
  duplicateBtn: 'icons/toolbar/copy.svg',
  removeBtn: 'icons/toolbar/trash.svg'
};
const TRAY_ACTION_LABELS = {
  viewBtn: 'Open tray fill',
  insertBelowBtn: 'Insert tray row below',
  duplicateBtn: 'Duplicate tray row',
  removeBtn: 'Delete tray row'
};
const CONDUIT_ACTION_LABELS = {
  viewBtn: 'Open conduit fill',
  insertBelowBtn: 'Insert conduit row below',
  duplicateBtn: 'Duplicate conduit row',
  removeBtn: 'Delete conduit row'
};

let racewayTablesRef = null;
let activeRacewayFilter = 'all';
let activeRacewayViewPreset = 'basic';
let updateRacewayExperience = () => {};

const normalize=s=>(s||'').trim().toUpperCase();

function parseNumber(value){
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasCompleteGeometry(row){
  return ['start_x','start_y','start_z','end_x','end_y','end_z'].every(key => parseNumber(row?.[key]) !== null);
}

function segmentLength(row){
  if(!hasCompleteGeometry(row)) return null;
  const sx=parseNumber(row.start_x), sy=parseNumber(row.start_y), sz=parseNumber(row.start_z);
  const ex=parseNumber(row.end_x), ey=parseNumber(row.end_y), ez=parseNumber(row.end_z);
  return Math.hypot(ex-sx, ey-sy, ez-sz);
}

function isZeroLength(row){
  const length = segmentLength(row);
  return length !== null && length === 0;
}

function normalizeConduitForDuctbank(row, ductbankTag, ductbank = {}){
  const normalized = normalizeConduitRow(row || {});
  return {
    ...normalized,
    ductbankTag: normalized.ductbankTag || ductbankTag || '',
    start_x: normalized.start_x ?? ductbank.start_x ?? '',
    start_y: normalized.start_y ?? ductbank.start_y ?? '',
    start_z: normalized.start_z ?? ductbank.start_z ?? '',
    end_x: normalized.end_x ?? ductbank.end_x ?? '',
    end_y: normalized.end_y ?? ductbank.end_y ?? '',
    end_z: normalized.end_z ?? ductbank.end_z ?? ''
  };
}

function normalizeRacewaySampleSets({ ductbanks = [], trays = [], conduits = [] } = {}){
  const dbRows = (ductbanks || []).map(row => {
    const db = normalizeDuctbankRow(row);
    db.conduits = Array.isArray(row?.conduits)
      ? row.conduits.map(c => normalizeConduitForDuctbank(c, db.tag, db))
      : [];
    db.expanded = row?.expanded ?? false;
    return db;
  });
  const trayRows = (trays || []).map(normalizeTrayRow);
  const standaloneConduits = [];
  const allConduits = [];
  const dbByTag = new Map(dbRows.map(db => [normalize(db.tag), db]));

  (conduits || []).map(normalizeConduitRow).forEach(conduit => {
    const tag = normalize(conduit.ductbankTag || conduit.ductbank_tag || conduit.ductbank);
    const targetDb = tag ? dbByTag.get(tag) : null;
    if (targetDb) {
      const embedded = normalizeConduitForDuctbank(conduit, targetDb.tag, targetDb);
      targetDb.conduits = targetDb.conduits || [];
      const exists = targetDb.conduits.some(existing => normalize(existing.conduit_id) === normalize(embedded.conduit_id));
      if(!exists) targetDb.conduits.push(embedded);
      if(!allConduits.some(existing => normalize(existing.conduit_id) === normalize(embedded.conduit_id))) allConduits.push(embedded);
    } else {
      standaloneConduits.push(conduit);
      if(!allConduits.some(existing => normalize(existing.conduit_id) === normalize(conduit.conduit_id))) allConduits.push(conduit);
    }
  });

  dbRows.forEach(db => {
    (db.conduits || []).forEach(conduit => {
      if (!allConduits.some(existing => normalize(existing.conduit_id) === normalize(conduit.conduit_id))) allConduits.push(conduit);
    });
  });

  return { ductbanks: dbRows, trays: trayRows, standaloneConduits, allConduits };
}

function ensureDuctbankRows(){
  const tbody=document.querySelector('#ductbankTable tbody');
  if(!tbody) return;
  // Move any rows directly under the table into the tbody and tag them
  document.querySelectorAll('#ductbankTable > tr').forEach(tr=>{
    tr.classList.add('ductbank-row');
    tbody.appendChild(tr);
  });
  Array.from(tbody.children).forEach(tr=>{
    if(tr.tagName !== 'TR') return;
    tr.classList.toggle('ductbank-row', !tr.classList.contains('conduit-container'));
  });
  Array.from(tbody.children)
    .filter(tr=>tr.classList.contains('conduit-container'))
    .forEach(tr=>tr.querySelectorAll('tr.ductbank-row').forEach(row=>row.classList.remove('ductbank-row')));
}

function getDuctbankRows(){
  return Array.from(document.querySelectorAll(DUCTBANK_ROW_SELECTOR));
}

async function renderRacewaySamples({ ductbanks = [], trays = [], conduits = [] }) {
  if (_renderingRaceway) return;
  _renderingRaceway = true;
  try {
    const normalized = normalizeRacewaySampleSets({ ductbanks, trays, conduits });
    try {
      dataStore.setDuctbanks(normalized.ductbanks);
      dataStore.setTrays(normalized.trays);
      dataStore.setConduits(normalized.allConduits);
    } catch(e) {
      console.error('Failed to store raceway sample data', e);
    }
    if (racewayTablesRef?.ductbanks?.setData) {
      await racewayTablesRef.ductbanks.setData(normalized.ductbanks);
    } else if (typeof window.loadDuctbanks === 'function') {
      window.loadDuctbanks();
    }
    if (racewayTablesRef?.trays?.setData) racewayTablesRef.trays.setData(normalized.trays);
    if (racewayTablesRef?.conduits?.setData) racewayTablesRef.conduits.setData(normalized.standaloneConduits);
    ensureDuctbankRows();
    updateRacewayExperience();
    const rendered = getDuctbankRows().length;
    console.assert(rendered === normalized.ductbanks.length,
      `Assertion failed: Ductbank table rendered ${rendered} rows for ${normalized.ductbanks.length} samples`);
    wireRacewayHandlersOnce();
    emitSticky('samples-loaded', 'samplesLoaded');
  } finally {
    _renderingRaceway = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  async function ensureTableUtils() {
    if (!globalThis.TableUtils) await import('../tableUtils.mjs');
  }
  await ensureTableUtils();
  const tableLoadState = { ductbanks: false, trays: false, conduits: false };
  const resetTableLoadState = () => {
    tableLoadState.ductbanks = false;
    tableLoadState.trays = false;
    tableLoadState.conduits = false;
  };
  const checkSamplesLoaded = () => {
    if (tableLoadState.ductbanks && tableLoadState.trays && tableLoadState.conduits) {
      requestAnimationFrame(() => requestAnimationFrame(() => emitSticky('samples-loaded', 'samplesLoaded')));
    }
  };
  resetTableLoadState();
  const projectId = window.currentProjectId;
  dataStore.loadProject(projectId);
  const save = () => dataStore.saveProject(projectId);
  [dataStore.STORAGE_KEYS.ductbanks, dataStore.STORAGE_KEYS.trays, dataStore.STORAGE_KEYS.conduits].forEach(k => dataStore.on(k, save));
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn','help-modal','close-help-btn');
  initHelpModal('ductbank-help-btn','ductbank-help-modal');
  initHelpModal('tray-help-btn','tray-help-modal');
  initHelpModal('conduit-help-btn','conduit-help-modal');
  initNavToggle();

  const selectBtn=document.getElementById('select-raceway-btn') || document.createElement('button');
  if(!selectBtn.id) {
    selectBtn.id='select-raceway-btn';
    selectBtn.textContent='Select Raceway';
    document.getElementById('raceway-more-actions')?.appendChild(selectBtn);
  }
  const racewaySelect=document.createElement('select');
  racewaySelect.multiple=true;
  racewaySelect.style.display='none';
  document.body.appendChild(racewaySelect);

  function loadRacewayOptions(){
    const ids=new Set();
    try{ dataStore.getTrays().forEach(t=>{ if(t.tray_id) ids.add(t.tray_id); }); }catch(e){ console.warn('loadRacewayOptions: failed to read trays', e); }
    try{ dataStore.getConduits().forEach(c=>{ const id=c.tray_id||c.conduit_id; if(id) ids.add(id); }); }catch(e){ console.warn('loadRacewayOptions: failed to read conduits', e); }
    racewaySelect.innerHTML='';
    Array.from(ids).forEach(id=>{const o=document.createElement('option');o.value=id;o.textContent=id;racewaySelect.appendChild(o);});
  }

  selectBtn.addEventListener('click',()=>{
    loadRacewayOptions();
    TableUtils.showRacewayModal(racewaySelect,selectBtn);
  });
  const tables={};
  function assertTablesReady(){
    for(const [name,t] of Object.entries(tables)){
      if(!t || typeof t.setData !== 'function'){
        console.error(`Table '${name}' not initialized`);
        showAlertModal('Initialization Error', 'Raceway tables not initialized. See console.');
        return false;
      }
    }
    return true;
  }
  function cablesForRaceway(id){
    try{
      const arr=dataStore.getCables();
      if(!arr) return [];
      return arr
        .filter(c=>{
          let ids=c.raceway_ids;
          if(typeof ids==='string') ids=ids.split(',').map(s=>s.trim()).filter(Boolean);
          return Array.isArray(ids)&&ids.includes(id);
        })
        .map(c=>{
          const rawOd=c.cable_od??c.OD??c.od??c.diameter;
          const od=parseFloat(rawOd);
          const val=Number.isFinite(od)?od:undefined;
          return {
            ...c,
            cable_od:c.cable_od??val,
            OD:c.OD??val,
            od:c.od??val,
            diameter:c.diameter??val,
            rating:c.rating??c.cable_rating,
            voltage:c.voltage??c.operating_voltage,
            circuitGroup:c.circuitGroup??c.circuit_group,
            zone:c.zone??c.cable_zone
          };
        });
    }catch(e){
      // Non-critical: returns [] as a safe fallback so the UI can still render
      console.warn('Failed to load cables for',id,e);return[];
    }
  }
  const dirty = createDirtyTracker();
  const markSaved = () => dirty.markClean();
  const markUnsaved = () => dirty.markDirty();
  const TABLE_AUTOSAVE_DELAY_MS = 150;
  let tableAutosaveTimer = null;

  function canAutosaveTable(table) {
    if (!table?.tbody || !Array.isArray(table.columns)) return false;
    const requiredCellCount = table.columns.length + (table.colOffset || 0);
    return Array.from(table.tbody.rows).every(row => row.cells.length >= requiredCellCount);
  }

  function flushRacewayTableAutosave() {
    if (tableAutosaveTimer) {
      clearTimeout(tableAutosaveTimer);
      tableAutosaveTimer = null;
    }
    try {
      if (canAutosaveTable(tables.trays)) {
        tables.trays.save();
      }
      if (canAutosaveTable(tables.conduits)) {
        tables.conduits.save();
        persistAllConduits();
      }
      markSaved();
    } catch (e) {
      console.error('Failed to auto-save raceway table data', e);
    }
  }

  function scheduleRacewayTableAutosave() {
    if (tableAutosaveTimer) clearTimeout(tableAutosaveTimer);
    tableAutosaveTimer = setTimeout(flushRacewayTableAutosave, TABLE_AUTOSAVE_DELAY_MS);
  }

  let importInProgress = false;
  let importType = null;
  const handleChange = () => {
    markUnsaved();
    scheduleRacewayTableAutosave();
    updateRacewayExperience();
    if (importInProgress) {
      importInProgress = false;
      if (importType === 'trays') emitSticky('imports-ready-trays', 'importsReadyTrays');
      if (importType === 'cables') emitSticky('imports-ready-cables', 'importsReadyCables');
      importType = null;
      emitAsync('imports-ready');
    }
  };

  window.addEventListener('pagehide', flushRacewayTableAutosave);
  window.addEventListener('beforeunload', flushRacewayTableAutosave);

  ['import-tray-xlsx-input','import-conduit-xlsx-input'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      importInProgress = true;
      importType = id === 'import-tray-xlsx-input' ? 'trays' : 'cables';
    });
  });

  const importCadInput = document.getElementById('import-cad-input');
  if (importCadInput) {
    importCadInput.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (file) {
        await dataStore.importFromCad(file);
        emitAsync('imports-ready');
      }
      e.target.value='';
    });
  }

  if(typeof initDuctbankTable==='function'){
    initDuctbankTable();
    const dbTable=document.getElementById('ductbankTable');
    if(dbTable){
      dbTable.addEventListener('input',markUnsaved);
      dbTable.addEventListener('click',e=>{if(e.target.tagName==='BUTTON'&&(['Add Conduit','Delete'].includes(e.target.textContent))) markUnsaved();});
    }
    ['add-ductbank-btn','delete-ductbank-btn'].forEach(id=>{const el=document.getElementById(id);if(el) el.addEventListener('click',markUnsaved);});
    const importDb=document.getElementById('import-ductbank-xlsx-input');
    if(importDb) importDb.addEventListener('change',markUnsaved);
    ['save-ductbank-btn','load-ductbank-btn','export-ductbank-xlsx-btn'].forEach(id=>{const el=document.getElementById(id);if(el) el.addEventListener('click',markSaved);});
    tables.ductbanks={
      async setData(rows){
        try{dataStore.setDuctbanks(rows);}catch(e){console.error('Failed to set ductbank data',e);}
        // Ensure ductbank table is initialized before loading
        if(!document.querySelector('#ductbankTable tbody')){
          window.initDuctbankTable?.();
        }
        if(typeof window.loadDuctbanks==='function') window.loadDuctbanks();
        ensureDuctbankRows();
        const rendered=getDuctbankRows().length;
        console.assert(rendered===rows.length && rendered>0,
          `Ductbank table rendered ${rendered} rows for ${rows.length} samples`);
        tableLoadState.ductbanks = true;
        checkSamplesLoaded();
      },
      getData(){try{return window.getDuctbanks?window.getDuctbanks():[];}catch{return[];}},
      getDataCount(){return this.getData().length;}
    };
  }

  const trayColumns=[
    {key:'tray_id',label:'Tray ID',type:'text',validate:['required']},
    {key:'start_x',label:'Start X',type:'number',validate:['required','numeric']},
    {key:'start_y',label:'Start Y',type:'number',validate:['required','numeric']},
    {key:'start_z',label:'Start Z',type:'number',validate:['required','numeric']},
    {key:'end_x',label:'End X',type:'number',validate:['required','numeric']},
    {key:'end_y',label:'End Y',type:'number',validate:['required','numeric']},
    {key:'end_z',label:'End Z',type:'number',validate:['required','numeric']},
    {key:'inside_width',label:'Inside Width (in)',type:'select',options:TRAY_WIDTH_OPTIONS,default:TRAY_WIDTH_OPTIONS[0],validate:['required']},
    {key:'tray_depth',label:'Tray Depth (in)',type:'select',options:TRAY_DEPTH_OPTIONS,default:TRAY_DEPTH_OPTIONS[0],validate:['required']},
    {key:'tray_type',label:'Tray Type',type:'select',options:TRAY_TYPE_OPTIONS,default:TRAY_TYPE_OPTIONS[0],validate:['required']},
    {key:'cover_condition',label:'Cover',type:'select',options:TRAY_COVER_OPTIONS,default:TRAY_COVER_OPTIONS[0],tooltip:'Cover condition used by wind load calculations. Solid covers are treated as flat-plate wind surfaces.'},
    {key:'material',label:'Material',type:'select',options:TRAY_MATERIAL_OPTIONS,default:TRAY_MATERIAL_OPTIONS[0],tooltip:'Raceway material used by procurement, BIM export, and tray hardware BOM outputs.'},
    {key:'num_slots',label:'Slots',type:'number',tooltip:'Number of longitudinal compartments (divider strips). Fill capacity is divided equally among slots. Default: 1 (single undivided tray).'},
    {key:'slot_groups',label:'Slot Groups (JSON)',type:'text',tooltip:'Optional JSON mapping slot index (0-based) to cable group name. Example: {"0":"power","1":"instrument"}. Leave blank for an undivided tray.'},
    {key:'allowed_cable_group',label:'Allowed Group',type:'text'}
  ];
  const trayTable=TableUtils.createTable({
    tableId:'trayTable',
    storageKey:TableUtils.STORAGE_KEYS.trays,
    addRowBtnId:null,
    saveBtnId:'save-tray-btn',
    loadBtnId:'load-tray-btn',
    clearFiltersBtnId:'clear-tray-filters-btn',
    exportBtnId:'export-tray-xlsx-btn',
    importInputId:'import-tray-xlsx-input',
    importBtnId:'import-tray-xlsx-btn',
    deleteAllBtnId:'delete-tray-btn',
    columns:trayColumns,
    showActionColumn:false,
    enableContextMenu:true,
    contextMenuViewLabel:'Open Tray Fill',
    actionButtonIcons:ROW_ACTION_ICONS,
    actionButtonLabels:TRAY_ACTION_LABELS,
    onChange:handleChange,
    onSave:markSaved,
    rowCountId:'tray-row-count',
    onView:(row)=>{
      try{
        trayTable.save();
        const tray={tray_id:row.tray_id,width:parseFloat(row.inside_width),height:parseFloat(row.tray_depth),tray_type:row.tray_type||'',cover_condition:row.cover_condition||'',material:row.material||'',allowed_cable_group:row.allowed_cable_group,num_slots:Math.max(1,parseInt(row.num_slots)||1),slot_groups:row.slot_groups||null};
        const cables=cablesForRaceway(row.tray_id);
        dataStore.setItem('trayFillData',{tray,cables});
      }catch(e){console.error('Failed to store tray fill data',e);}
      window.location.href='cabletrayfill.html';
    }
  });
  trayTable.setData=function(rows){
    this.tbody.innerHTML='';
    (rows||[]).forEach(r=>this.addRow(r));
    this.updateRowCount?.();
    this.applyFilters?.();
    tableLoadState.trays = true;
    checkSamplesLoaded();
  };
  trayTable.getDataCount=function(){return this.getData().length;};
  tables.trays=trayTable;

  function downloadTrayTemplate(){
    if(typeof XLSX === 'undefined' || !XLSX?.utils?.aoa_to_sheet || !XLSX?.writeFile){
      showAlertModal('Template Export Unavailable', 'Spreadsheet template generation needs XLSX runtime. Use the visible tray table headers as the import guide for now.');
      return;
    }
    const headers = trayColumns.map(column => column.key);
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Trays');
    XLSX.writeFile(workbook, 'tray-schedule-template.xlsx');
  }

  document.getElementById('download-trays-template-btn')?.addEventListener('click', downloadTrayTemplate);

  const conduitColumns=[
    {key:'conduit_id',label:'Conduit ID',type:'text',validate:['required']},
    {key:'type',label:'Type',type:'select',options:CONDUIT_TYPES,default:CONDUIT_TYPES[0],validate:['required'],onChange:(el,tr)=>{const sizeSel=tr.querySelector('select[name="trade_size"]');if(sizeSel){const opts=tradeSizeOptions(el.value);sizeSel.innerHTML='';opts.forEach(sz=>{const o=document.createElement('option');o.value=sz;o.textContent=sz;sizeSel.appendChild(o);});}}},
    {key:'material',label:'Material',type:'select',options:CONDUIT_MATERIAL_OPTIONS,default:CONDUIT_MATERIAL_OPTIONS[0],tooltip:'Raceway material used by procurement and BIM export outputs.'},
    {key:'trade_size',label:'Trade Size',type:'select',options:(tr)=>tradeSizeOptions(tr.querySelector('select[name="type"]').value),validate:['required']},
    {key:'start_x',label:'Start X',type:'number',validate:['required','numeric']},
    {key:'start_y',label:'Start Y',type:'number',validate:['required','numeric']},
    {key:'start_z',label:'Start Z',type:'number',validate:['required','numeric']},
    {key:'end_x',label:'End X',type:'number',validate:['required','numeric']},
    {key:'end_y',label:'End Y',type:'number',validate:['required','numeric']},
    {key:'end_z',label:'End Z',type:'number',validate:['required','numeric']},
    {key:'capacity',label:'Capacity',type:'number',validate:['numeric']},
    {key:'allowed_cable_group',label:'Allowed Group',type:'text'}
  ];
  const conduitTable=TableUtils.createTable({
    tableId:'conduitTable',
    storageKey:TableUtils.STORAGE_KEYS.conduits,
    addRowBtnId:null,
    saveBtnId:'save-conduit-btn',
    loadBtnId:'load-conduit-btn',
    clearFiltersBtnId:'clear-conduit-filters-btn',
    exportBtnId:'export-conduit-xlsx-btn',
    importInputId:'import-conduit-xlsx-input',
    importBtnId:'import-conduit-xlsx-btn',
    deleteAllBtnId:'delete-conduit-btn',
    columns:conduitColumns,
    showActionColumn:false,
    enableContextMenu:true,
    contextMenuViewLabel:'Open Conduit Fill',
    actionButtonIcons:ROW_ACTION_ICONS,
    actionButtonLabels:CONDUIT_ACTION_LABELS,
    onChange:handleChange,
    onSave:()=>{markSaved();persistAllConduits();},
    rowCountId:'conduit-row-count',
    onView:(row)=>{
      try{
        const cables=cablesForRaceway(row.conduit_id);
        dataStore.setItem('conduitFillData',{type:row.type,material:row.material||'',tradeSize:row.trade_size,cables});
      }catch(e){console.error('Failed to store conduit fill data',e);}
      window.location.href='conduitfill.html';
    }
  });
  conduitTable.setData=function(rows){
    this.tbody.innerHTML='';
    (rows||[]).forEach(r=>this.addRow(r));
    this.updateRowCount?.();
    this.applyFilters?.();
    tableLoadState.conduits = true;
    checkSamplesLoaded();
  };
  conduitTable.getDataCount=function(){return this.getData().length;};
  tables.conduits=conduitTable;
  racewayTablesRef = tables;
  wireRacewayImportPreview(trayTable, trayColumns, {
    label: 'Tray Schedule',
    identityFields: ['tray_id', 'trayId', 'id', 'tag', 'ref'],
    aliases: {
      trayid: 'tray_id',
      id: 'tray_id',
      width: 'inside_width',
      insidewidth: 'inside_width',
      depth: 'tray_depth',
      traydepth: 'tray_depth',
      type: 'tray_type',
      traytype: 'tray_type',
      cover: 'cover_condition',
      material: 'material'
    }
  });
  wireRacewayImportPreview(conduitTable, conduitColumns, {
    label: 'Conduit Schedule',
    identityFields: ['conduit_id', 'conduitId', 'tray_id', 'trayId', 'id', 'tag', 'ref'],
    aliases: {
      conduitid: 'conduit_id',
      id: 'conduit_id',
      conduittype: 'type',
      type: 'type',
      tradesize: 'trade_size',
      size: 'trade_size',
      material: 'material'
    }
  });
  function reconcileConduitOwnershipOnLoad(){
    const ductbanks = tables.ductbanks?.getData?.() || [];
    if(!ductbanks.length) return;
    const byTag = new Map(ductbanks.map(db => [normalize(db.tag), db]));
    const standalone = [];
    let moved = false;
    conduitTable.getData().forEach(conduit => {
      const target = byTag.get(normalize(conduit.ductbankTag || conduit.ductbank_tag));
      if(target){
        target.conduits = target.conduits || [];
        if(!target.conduits.some(existing => normalize(existing.conduit_id) === normalize(conduit.conduit_id))){
          target.conduits.push({ ...conduit, ductbankTag: target.tag });
          moved = true;
        }
      }else{
        standalone.push(conduit);
      }
    });
    if(!moved) return;
    dataStore.setDuctbanks(ductbanks);
    tables.ductbanks.setData?.(ductbanks);
    conduitTable.setData(standalone);
    const embedded = ductbanks.flatMap(db => db.conduits || []);
    dataStore.setConduits([...embedded, ...standalone]);
  }
  reconcileConduitOwnershipOnLoad();

  if(typeof window.saveDuctbanks==='function'){
    const origSave=window.saveDuctbanks;
    window.saveDuctbanks=()=>{origSave();persistAllConduits();};
  }

  function showToast(msg,type='success'){
    const t=document.getElementById('toast');
    if(!t)return; t.textContent=msg;
    t.className='toast '+(type==='error'?'toast-error':'toast-success');
    requestAnimationFrame(()=>t.classList.add('show'));
    setTimeout(()=>t.classList.remove('show'),4000);
  }

  async function onRacewayLoadSamples(){
    if(!assertTablesReady()) return;
    console.time('raceway:loadSamples');
    try{
      resetTableLoadState();
      let ductbanks=[],trays=[],conduits=[];
      const sampleData=await fetchDataFile('examples/sampleRaceways.json', null);
      if(sampleData){
        ({ductbanks=[],trays=[],conduits=[]}=sampleData);
      }else{
        ductbanks=sampleDuctbanks;
        trays=sampleTrays;
        conduits=sampleConduits;
      }
      const normalized = normalizeRacewaySampleSets({ ductbanks, trays, conduits });
      await renderRacewaySamples({ ductbanks, trays, conduits });
      markSaved();
      showToast(`Loaded samples: ${normalized.ductbanks.length} ductbanks, ${normalized.allConduits.length} conduits, ${normalized.trays.length} trays.`, 'success');
    }catch(err){
      console.error(err);
      showToast('Sample load failed – see console.','error');
    }finally{
      console.timeEnd('raceway:loadSamples');
    }
  }

  function serializeDuctbankSchedule(){
    const nested=getDuctbanks();
    const ductbanks=nested.map(({conduits,...db})=>db);
    const conduits=[];
    nested.forEach(db=>{
      (db.conduits||[]).forEach(c=>{
        c.ductbankTag=db.tag;
        conduits.push({
          ductbankTag:db.tag,
          conduit_id:c.conduit_id,
          tray_id:`${db.tag}-${c.conduit_id}`,
          type:c.type,
          material:c.material,
          trade_size:c.trade_size,
          start_x:c.start_x,
          start_y:c.start_y,
          start_z:c.start_z,
          end_x:c.end_x,
          end_y:c.end_y,
          end_z:c.end_z,
          allowed_cable_group:c.allowed_cable_group
        });
      });
    });
    return {ductbanks,conduits};
  }

  function persistAllConduits(){
    const {ductbanks,conduits:dbConduits}=serializeDuctbankSchedule();
    const standalone=conduitTable.getData();
    const all=[...dbConduits,...standalone];
    persistConduits({ductbanks,conduits:all});
    try{dataStore.setConduits(all);}catch(e){console.error('Failed to store conduits',e);}
  }

  function getRacewaySchedule(){
    saveDuctbanks();
    trayTable.save();
    conduitTable.save();
    const {ductbanks,conduits:dbConduits}=serializeDuctbankSchedule();
    const conduits=[...dbConduits,...conduitTable.getData()];
    return {ductbanks,trays:trayTable.getData(),conduits};
  }
  window.getRacewaySchedule=getRacewaySchedule;
  persistAllConduits();

  function normalizeImportHeader(header) {
    return String(header || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function buildRacewayImportLookup(columns, aliases = {}) {
    const lookup = new Map();
    columns.forEach(col => {
      lookup.set(normalizeImportHeader(col.key), col.key);
      lookup.set(normalizeImportHeader(col.label), col.key);
    });
    Object.entries(aliases).forEach(([header, key]) => lookup.set(normalizeImportHeader(header), key));
    return lookup;
  }

  function readRacewayImportRows(file) {
    if (!file) return Promise.resolve([]);
    if (typeof XLSX === 'undefined' || !XLSX?.read || !XLSX?.utils?.sheet_to_json) {
      showAlertModal('Import Error', 'Excel import is not available in this environment.');
      return Promise.resolve([]);
    }
    return file.arrayBuffer()
      .then(buffer => {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames && workbook.SheetNames[0];
        if (!sheetName) return [];
        return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: true });
      })
      .catch(error => {
        console.error('Failed to read raceway import file', error);
        showAlertModal('Import Error', 'Unable to read the selected Excel file.');
        return [];
      });
  }

  function wireRacewayImportPreview(table, columns, options = {}) {
    const label = options.label || 'Raceway Schedule';
    const lookup = buildRacewayImportLookup(columns, options.aliases || {});
    const resolveHeaderKey = header => lookup.get(normalizeImportHeader(header)) || '';
    const parseValue = value => (typeof value === 'string' ? value.trim() : value ?? '');
    table.importXlsx = async file => {
      const rows = await readRacewayImportRows(file);
      if (!rows.length) {
        showAlertModal('Import Error', `No ${label.toLowerCase()} rows were found in the selected file.`);
        return;
      }
      const headers = Object.keys(rows[0] || {});
      const mappingSelects = new Map();
      let modeSelect = null;
      let previewPanel = null;
      const resolveMappings = () => Array.from(mappingSelects.entries())
        .map(([header, select]) => [header, select.value])
        .filter(([, key]) => key);
      const buildRows = mappings => rows.map(source => {
        const next = {};
        mappings.forEach(([header, key]) => {
          next[key] = parseValue(source[header]);
        });
        return next;
      }).filter(row => Object.values(row).some(value => String(value ?? '').trim() !== ''));
      const refreshPreview = () => {
        if (!previewPanel) return;
        const mappings = resolveMappings();
        if (!mappings.length) {
          previewPanel.textContent = 'Map at least one column to preview the import.';
          return;
        }
        const importedRows = buildRows(mappings);
        const mode = modeSelect?.value || 'merge';
        const preview = previewRecordImport(table.getData(), importedRows, {
          mode,
          identityFields: options.identityFields || ['id', 'tag', 'ref']
        });
        previewPanel.innerHTML = `
          <p><strong>Preview:</strong> ${preview.creates} create, ${preview.updates} update, ${preview.conflicts} conflict, ${preview.unchanged} unchanged.</p>
          <p>${preview.preserved} existing rows preserved${preview.removed ? `, ${preview.removed} removed by replace mode` : ''}. Conflicts preserve existing non-empty raceway values.</p>
        `;
      };

      openModal({
        title: `Map ${label} Import`,
        description: 'Match spreadsheet columns to schedule fields, then review the merge impact before applying.',
        primaryText: 'Apply Import',
        secondaryText: 'Cancel',
        variant: 'wide',
        render(body) {
          const wrapper = document.createElement('div');
          wrapper.className = 'import-mapping-grid';
          headers.forEach(header => {
            const row = document.createElement('div');
            row.className = 'import-mapping-row';
            const fieldLabel = document.createElement('span');
            fieldLabel.textContent = header;
            const select = document.createElement('select');
            const skip = document.createElement('option');
            skip.value = '';
            skip.textContent = 'Do not import';
            select.appendChild(skip);
            columns.forEach(col => {
              const option = document.createElement('option');
              option.value = col.key;
              option.textContent = col.label;
              select.appendChild(option);
            });
            select.value = resolveHeaderKey(header);
            select.addEventListener('change', refreshPreview);
            mappingSelects.set(header, select);
            row.append(fieldLabel, select);
            wrapper.appendChild(row);
          });
          const modeLabel = document.createElement('label');
          modeLabel.className = 'modal-form-field';
          modeLabel.textContent = 'Import Mode';
          modeSelect = document.createElement('select');
          [
            ['merge', 'Merge with existing rows (recommended)'],
            ['append', 'Append as new rows'],
            ['replace', 'Replace current schedule']
          ].forEach(([value, text]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text;
            modeSelect.appendChild(option);
          });
          modeSelect.addEventListener('change', refreshPreview);
          modeLabel.appendChild(modeSelect);
          previewPanel = document.createElement('div');
          previewPanel.className = 'import-preview-list';
          body.append(wrapper, modeLabel, previewPanel);
          refreshPreview();
          return wrapper.querySelector('select');
        },
        onSubmit: () => {
          const mappings = resolveMappings();
          if (!mappings.length) {
            showAlertModal('Import Mapping Required', 'Map at least one spreadsheet column before importing.');
            return false;
          }
          const importedRows = buildRows(mappings);
          if (!importedRows.length) {
            showAlertModal('Import Error', `No usable ${label.toLowerCase()} data was found after mapping.`);
            return false;
          }
          const mode = modeSelect?.value || 'merge';
          const nextRows = applyRecordImport(table.getData(), importedRows, {
            mode,
            identityFields: options.identityFields || ['id', 'tag', 'ref']
          });
          table.setData(nextRows);
          table.save();
          handleChange();
          updateRacewayExperience();
          showToast(`${label}: applied ${importedRows.length} imported row${importedRows.length === 1 ? '' : 's'} using ${mode} mode.`, 'success');
          return true;
        }
      });
    };
  }

  function getRacewaySnapshot(){
    const ductbanks = tables.ductbanks?.getData?.() || [];
    const trays = trayTable.getData();
    const standaloneConduits = conduitTable.getData();
    const embeddedConduits = ductbanks.flatMap((db, ductbankIndex) => (db.conduits || []).map((c, conduitIndex) => ({
      ...c,
      ductbankTag: c.ductbankTag || db.tag,
      __ductbankIndex: ductbankIndex,
      __conduitIndex: conduitIndex
    })));
    const conduits = [...embeddedConduits, ...standaloneConduits];
    return { ductbanks, trays, standaloneConduits, embeddedConduits, conduits };
  }

  function duplicateSet(values){
    const counts = new Map();
    values.map(value => String(value || '').trim()).filter(Boolean).forEach(value => {
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([value]) => value));
  }

  function getAssignedRacewayIds(){
    const ids = new Set();
    try {
      dataStore.getCables().forEach(cable => {
        const raw = cable.raceway_ids ?? cable.racewayIds ?? cable.raceway_id ?? cable.raceway ?? cable.tray_id ?? '';
        const list = Array.isArray(raw) ? raw : String(raw).split(',');
        list.map(value => String(value || '').trim()).filter(Boolean).forEach(id => ids.add(id));
      });
    } catch(e) {
      console.warn('Failed to read cable raceway assignments', e);
    }
    return ids;
  }

  function collectRacewayIssues(){
    const snapshot = getRacewaySnapshot();
    const issues = [];
    const duplicateDuctbanks = duplicateSet(snapshot.ductbanks.map(db => db.tag));
    const duplicateTrays = duplicateSet(snapshot.trays.map(tray => tray.tray_id));
    const duplicateConduits = duplicateSet(snapshot.conduits.map(conduit => conduit.conduit_id));

    snapshot.ductbanks.forEach((db, row) => {
      if(!String(db.tag || '').trim()) issues.push({message:'Ductbank is missing a tag',table:'ductbank',row,col:'tag',code:'missing'});
      if(duplicateDuctbanks.has(String(db.tag || '').trim())) issues.push({message:`Duplicate ductbank tag "${db.tag}"`,table:'ductbank',row,col:'tag',code:'duplicate'});
      if(!hasCompleteGeometry(db)) issues.push({message:`Ductbank ${db.tag || row + 1} is missing geometry`,table:'ductbank',row,col:'start_x',code:'missing'});
      if(isZeroLength(db)) issues.push({message:`Ductbank ${db.tag || row + 1} has zero length`,table:'ductbank',row,col:'end_x',code:'geometry'});
    });

    snapshot.trays.forEach((tray, row) => {
      if(!String(tray.tray_id || '').trim()) issues.push({message:'Tray is missing an ID',table:'tray',row,col:'tray_id',code:'missing'});
      if(duplicateTrays.has(String(tray.tray_id || '').trim())) issues.push({message:`Duplicate tray ID "${tray.tray_id}"`,table:'tray',row,col:'tray_id',code:'duplicate'});
      if(!hasCompleteGeometry(tray)) issues.push({message:`Tray ${tray.tray_id || row + 1} is missing geometry`,table:'tray',row,col:'start_x',code:'missing'});
      if(isZeroLength(tray)) issues.push({message:`Tray ${tray.tray_id || row + 1} has zero length`,table:'tray',row,col:'end_x',code:'geometry'});
      if(parseNumber(tray.inside_width) === null || parseNumber(tray.inside_width) <= 0) issues.push({message:`Tray ${tray.tray_id || row + 1} needs a positive inside width`,table:'tray',row,col:'inside_width',code:'missing'});
      if(parseNumber(tray.tray_depth) === null || parseNumber(tray.tray_depth) <= 0) issues.push({message:`Tray ${tray.tray_id || row + 1} needs a positive depth`,table:'tray',row,col:'tray_depth',code:'missing'});
      if(String(tray.slot_groups || '').trim()){
        try { JSON.parse(tray.slot_groups); } catch {
          issues.push({message:`Tray ${tray.tray_id || row + 1} has invalid slot group JSON`,table:'tray',row,col:'slot_groups',code:'format'});
        }
      }
    });

    snapshot.conduits.forEach((conduit, index) => {
      const row = snapshot.standaloneConduits.indexOf(conduit);
      const isStandalone = row >= 0;
      const targetRow = isStandalone ? row : conduit.__ductbankIndex ?? index;
      const targetTable = isStandalone ? 'conduit' : 'ductbank';
      if(!String(conduit.conduit_id || '').trim()) issues.push({message:'Conduit is missing an ID',table:targetTable,row:targetRow,col:'conduit_id',code:'missing'});
      if(duplicateConduits.has(String(conduit.conduit_id || '').trim())) issues.push({message:`Duplicate conduit ID "${conduit.conduit_id}"`,table:targetTable,row:targetRow,col:'conduit_id',code:'duplicate'});
      if(!hasCompleteGeometry(conduit)) issues.push({message:`Conduit ${conduit.conduit_id || index + 1} is missing geometry`,table:targetTable,row:targetRow,col:'start_x',code:'missing'});
      if(isZeroLength(conduit)) issues.push({message:`Conduit ${conduit.conduit_id || index + 1} has zero length`,table:targetTable,row:targetRow,col:'end_x',code:'geometry'});
      if(!CONDUIT_SPECS[conduit.type] || !CONDUIT_SPECS[conduit.type][conduit.trade_size]) {
        issues.push({message:`Conduit ${conduit.conduit_id || index + 1} has illegal size`,table:targetTable,row:targetRow,col:'trade_size',code:'format'});
      }
    });

    return issues;
  }

  function setText(id, value){
    const el = document.getElementById(id);
    if(el) el.textContent = value;
  }

  function updateRacewaySummary(){
    const snapshot = getRacewaySnapshot();
    const issues = collectRacewayIssues();
    const assignedIds = getAssignedRacewayIds();
    const workflowSummary = summarizeRacewayWorkflow({
      ductbanks: snapshot.ductbanks,
      trays: snapshot.trays,
      conduits: snapshot.conduits,
      assignedIds
    });
    setText('raceway-total-count', String(workflowSummary.total));
    setText('raceway-ductbank-count', String(workflowSummary.ductbanks));
    setText('raceway-tray-count', String(workflowSummary.trays));
    setText('raceway-conduit-count', `${workflowSummary.conduits}`);
    setText('raceway-issue-count', String(issues.length));
    setText('raceway-assigned-count', String(workflowSummary.assignedRaceways));
    setText('raceway-missing-id-count', String(workflowSummary.missingIds));
    setText('raceway-missing-geometry-count', String(workflowSummary.missingGeometry));
    setText('raceway-unused-count', String(workflowSummary.unusedRaceways));
    const summary = document.getElementById('raceway-validation-summary');
    if(summary){
      summary.className = issues.length ? 'load-validation-summary is-warning' : 'load-validation-summary is-success';
      summary.textContent = issues.length
        ? `${issues.length} schedule issue${issues.length === 1 ? '' : 's'} need review before routing or BIM export.`
        : 'Raceway schedules are ready for routing and export.';
    }
    updateRacewayNextAction({ ...workflowSummary, issues: issues.length, assignedCableRefs: assignedIds.size });
    return { snapshot, issues, assignedIds, workflowSummary };
  }

  function updateRacewayNextAction(summary){
    const host = document.getElementById('raceway-next-action');
    if(!host) return;
    let title = `${READINESS_VOCABULARY.downstreamHandoff}: Continue to fill and routing checks`;
    let detail = `${READINESS_VOCABULARY.ready}: ${RACEWAY_READINESS_COPY?.readyWhen || 'At least one tray, conduit, or ductbank record exists.'} Raceway records have IDs, geometry, and dimensions for downstream routing tools.`;
    let primaryHref = 'cabletrayfill.html';
    let primaryText = 'Open Tray Fill';
    let secondaryHref = 'cableschedule.html';
    let secondaryText = 'Review Cable Assignments';

    if(summary.total === 0){
      title = `${READINESS_VOCABULARY.missingInputs}: Add raceway records`;
      detail = RACEWAY_READINESS_COPY?.blockers?.[0] || 'Create trays, conduits, or ductbanks so schedule-ready cables have routing destinations.';
      primaryHref = '#ductbank-section';
      primaryText = 'Start Raceway Schedule';
      secondaryHref = 'cableschedule.html';
      secondaryText = 'Open Cable Schedule';
    }else if(summary.missingIds > 0 || summary.duplicateIds > 0){
      title = `${READINESS_VOCABULARY.missingInputs}: Resolve raceway ID issues`;
      detail = `${summary.missingIds} raceway${summary.missingIds === 1 ? '' : 's'} are missing IDs and ${summary.duplicateIds} duplicate ID row${summary.duplicateIds === 1 ? '' : 's'} need review.`;
      primaryHref = '#raceway-summary-panel';
      primaryText = 'Review IDs';
    }else if(summary.missingGeometry > 0){
      title = `${READINESS_VOCABULARY.missingInputs}: Complete raceway geometry`;
      detail = `${summary.missingGeometry} raceway${summary.missingGeometry === 1 ? '' : 's'} need start/end coordinates before routing and BIM export.`;
      primaryHref = '#raceway-summary-panel';
      primaryText = 'Review Geometry';
    }else if(summary.missingDimensions > 0){
      title = `${READINESS_VOCABULARY.missingInputs}: Complete fill dimensions`;
      detail = `${summary.missingDimensions} raceway${summary.missingDimensions === 1 ? '' : 's'} need tray dimensions or conduit type and trade size.`;
      primaryHref = '#raceway-summary-panel';
      primaryText = 'Review Dimensions';
    }else if(summary.assignedRaceways === 0 && summary.assignedCableRefs > 0){
      title = `${READINESS_VOCABULARY.downstreamHandoff}: Connect cable assignments to raceway IDs`;
      detail = 'Cable assignments exist, but none match the current raceway IDs.';
      primaryHref = 'cableschedule.html';
      primaryText = 'Fix Cable Assignments';
    }else if(summary.assignedRaceways === 0){
      title = `${READINESS_VOCABULARY.downstreamHandoff}: Assign cables to raceways`;
      detail = 'Raceways are defined. Assign schedule-ready cables before running fill and route checks.';
      primaryHref = 'cableschedule.html';
      primaryText = 'Open Cable Schedule';
    }else{
      detail = `${READINESS_VOCABULARY.ready}: ${summary.assignedRaceways} raceway${summary.assignedRaceways === 1 ? '' : 's'} are assigned to cables. Continue into fill or routing checks.`;
    }

    host.innerHTML = `
      <div>
        <strong>${title}</strong>
        <p>${detail}</p>
      </div>
      <span>
        <a class="btn secondary-btn" href="${secondaryHref}">${secondaryText}</a>
        <a class="btn primary-btn" href="${primaryHref}">${primaryText}</a>
      </span>
    `;
  }

  function rowHasIssue(issues, table, row, codes = null){
    return issues.some(issue => issue.table === table && issue.row === row && (!codes || codes.includes(issue.code)));
  }

  function racewayIdFor(type, row){
    if(type === 'ductbank') return row.tag || '';
    if(type === 'tray') return row.tray_id || '';
    return row.conduit_id || row.tray_id || '';
  }

  function matchesRacewayFilter(type, row, index, context){
    if(activeRacewayFilter === 'all') return true;
    const id = String(racewayIdFor(type, row) || '').trim();
    if(activeRacewayFilter === 'missing') return !hasCompleteGeometry(row) || rowHasIssue(context.issues, type, index, ['missing','geometry','format']);
    if(activeRacewayFilter === 'duplicates') return rowHasIssue(context.issues, type, index, ['duplicate']);
    if(activeRacewayFilter === 'unused') return id ? !context.assignedIds.has(id) : false;
    if(activeRacewayFilter === 'assigned') return id ? context.assignedIds.has(id) : false;
    if(activeRacewayFilter === 'ductbank') return type === 'ductbank' && (row.conduits || []).length > 0;
    if(activeRacewayFilter === 'standalone') return type === 'conduit';
    return true;
  }

  function applyDuctbankQuickFilter(context){
    const rows = getDuctbankRows();
    rows.forEach((row, index) => {
      const db = context.snapshot.ductbanks[index] || {};
      const visible = matchesRacewayFilter('ductbank', db, index, context);
      row.style.display = visible ? '' : 'none';
      const conduitRow = row.nextElementSibling;
      if(conduitRow?.classList?.contains('conduit-container')) {
        conduitRow.style.display = visible && db.expanded ? '' : 'none';
      }
    });
  }

  function applyManagedTableQuickFilter(table, type, context){
    if(!table?.customFilters) return;
    if(activeRacewayFilter === 'all'){
      table.customFilters.delete('racewayQuick');
    }else{
      table.customFilters.set('racewayQuick', row => {
        const data = table.getRowData(row);
        const index = Array.from(table.tbody.rows).indexOf(row);
        return matchesRacewayFilter(type, data, index, context);
      });
    }
    table.applyFilters();
  }

  function applyRacewayQuickFilter(){
    const context = updateRacewaySummary();
    applyDuctbankQuickFilter(context);
    applyManagedTableQuickFilter(trayTable, 'tray', context);
    applyManagedTableQuickFilter(conduitTable, 'conduit', context);
    document.querySelectorAll('[data-raceway-filter]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.racewayFilter === activeRacewayFilter);
    });
  }

  function setManagedTableColumnVisibility(table, visibleKeys){
    if(!table?.headerRow) return;
    const showAll = !visibleKeys;
    table.columns.forEach((col, index) => {
      const visible = showAll || visibleKeys.includes(col.key);
      const cellIndex = index + table.colOffset;
      table.headerRow.cells[cellIndex]?.classList.toggle('raceway-column-hidden', !visible);
      Array.from(table.tbody.rows).forEach(row => {
        row.cells[cellIndex]?.classList.toggle('raceway-column-hidden', !visible);
      });
    });
    table.queueStickyColumnUpdate?.();
  }

  function setDuctbankColumnVisibility(visibleKeys){
    const showAll = !visibleKeys;
    const table = document.getElementById('ductbankTable');
    if(!table) return;
    const rows = [
      ...Array.from(table.tHead?.rows || []),
      ...getDuctbankRows()
    ];
    rows.forEach(row => {
      DUCTBANK_COLUMN_KEYS.forEach((key, index) => {
        row.cells[index]?.classList.toggle('raceway-column-hidden', !(showAll || visibleKeys.includes(key)));
      });
    });
  }

  function applyRacewayViewPreset(presetName, { persist = true } = {}){
    activeRacewayViewPreset = RACEWAY_VIEW_PRESETS[presetName] !== undefined ? presetName : 'basic';
    const preset = RACEWAY_VIEW_PRESETS[activeRacewayViewPreset];
    setDuctbankColumnVisibility(preset?.ductbanks || null);
    setManagedTableColumnVisibility(trayTable, preset?.trays || null);
    setManagedTableColumnVisibility(conduitTable, preset?.conduits || null);
    document.querySelectorAll('[data-raceway-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.racewayView === activeRacewayViewPreset);
    });
    if(persist) dataStore.setItem(RACEWAY_VIEW_PRESET_KEY, activeRacewayViewPreset);
  }

  function decorateRacewayActionButtons(){
    document.querySelectorAll('#ductbankTable .viewBtn, #ductbankTable .insertBelowBtn, #ductbankTable .duplicateBtn, #ductbankTable .removeBtn, #trayTable .viewBtn, #trayTable .insertBelowBtn, #trayTable .duplicateBtn, #trayTable .removeBtn, #conduitTable .viewBtn, #conduitTable .insertBelowBtn, #conduitTable .duplicateBtn, #conduitTable .removeBtn').forEach(btn => {
      if(btn.dataset.iconified === 'true') return;
      const iconClass = Array.from(btn.classList).find(cls => ROW_ACTION_ICONS[cls]);
      const icon = ROW_ACTION_ICONS[iconClass];
      if(!icon) return;
      const label = btn.getAttribute('aria-label') || btn.title || btn.textContent.trim();
      btn.classList.add('row-icon-btn');
      btn.title = label;
      btn.setAttribute('aria-label', label);
      btn.innerHTML = `<img src="${icon}" alt="" aria-hidden="true" class="control-icon" loading="lazy" decoding="async">`;
      btn.dataset.iconified = 'true';
    });
  }

  updateRacewayExperience = () => {
    if(!racewayTablesRef) return;
    updateRacewaySummary();
    applyRacewayQuickFilter();
    applyRacewayViewPreset(activeRacewayViewPreset, { persist: false });
    decorateRacewayActionButtons();
  };

  function optionValue(option){
    return typeof option === 'object' && option !== null ? option.value : option;
  }

  function optionLabel(option){
    return typeof option === 'object' && option !== null ? option.label : option;
  }

  function modalField({ label, name, type = 'text', value = '', options = null, min = null, step = null }){
    const wrap = document.createElement('label');
    wrap.className = 'modal-form-field';
    const span = document.createElement('span');
    span.textContent = label;
    wrap.appendChild(span);
    const field = options ? document.createElement('select') : document.createElement('input');
    field.name = name;
    if(!options) field.type = type;
    if(min !== null) field.min = String(min);
    if(step !== null) field.step = String(step);
    if(options){
      options.forEach(option => {
        const opt = document.createElement('option');
        opt.value = optionValue(option);
        opt.textContent = optionLabel(option);
        field.appendChild(opt);
      });
    }
    field.value = value ?? '';
    wrap.appendChild(field);
    return wrap;
  }

  function getFormData(form){
    return Object.fromEntries(new FormData(form).entries());
  }

  function renderEntryForm(body, fields){
    const form = document.createElement('form');
    form.className = 'raceway-entry-form load-entry-grid';
    fields.forEach(field => form.appendChild(modalField(field)));
    body.appendChild(form);
    return form;
  }

  function lastRowData(table){
    const rows = table?.getData?.() || [];
    return rows[rows.length - 1] || {};
  }

  const BATCH_SCOPE_OPTIONS = [
    {value:'visible',label:'Visible rows'},
    {value:'all',label:'All rows'}
  ];
  const GEOMETRY_BATCH_FIELDS = [
    {key:'start_x',label:'Start X',type:'number',step:'any'},
    {key:'start_y',label:'Start Y',type:'number',step:'any'},
    {key:'start_z',label:'Start Z',type:'number',step:'any'},
    {key:'end_x',label:'End X',type:'number',step:'any'},
    {key:'end_y',label:'End Y',type:'number',step:'any'},
    {key:'end_z',label:'End Z',type:'number',step:'any'}
  ];
  const DUCTBANK_BATCH_FIELDS = [
    {key:'from',label:'From'},
    {key:'to',label:'To'},
    {key:'concrete_encasement',label:'Concrete Encasement',options:['No','Yes'],value:'No'},
    ...GEOMETRY_BATCH_FIELDS
  ];
  const DUCTBANK_CONDUIT_BATCH_FIELDS = [
    {key:'type',label:'Type',options:CONDUIT_TYPES,value:'PVC Sch 40'},
    {key:'material',label:'Material',options:CONDUIT_MATERIAL_OPTIONS,value:'PVC'},
    {key:'trade_size',label:'Trade Size',options:ALL_TRADE_SIZE_OPTIONS,value:'4'},
    {key:'allowed_cable_group',label:'Allowed Group'},
    ...GEOMETRY_BATCH_FIELDS
  ];
  const TRAY_BATCH_FIELDS = [
    {key:'inside_width',label:'Inside Width (in)',options:TRAY_WIDTH_OPTIONS,value:'24'},
    {key:'tray_depth',label:'Tray Depth (in)',options:TRAY_DEPTH_OPTIONS,value:'4'},
    {key:'tray_type',label:'Tray Type',options:TRAY_TYPE_OPTIONS,value:TRAY_TYPE_OPTIONS[0]},
    {key:'cover_condition',label:'Cover',options:TRAY_COVER_OPTIONS,value:TRAY_COVER_OPTIONS[0]},
    {key:'material',label:'Material',options:TRAY_MATERIAL_OPTIONS,value:TRAY_MATERIAL_OPTIONS[0]},
    {key:'num_slots',label:'Slots',type:'number',min:1,step:1,value:'1'},
    {key:'slot_groups',label:'Slot Groups (JSON)'},
    {key:'allowed_cable_group',label:'Allowed Group'},
    ...GEOMETRY_BATCH_FIELDS
  ];
  const CONDUIT_BATCH_FIELDS = [
    {key:'type',label:'Type',options:CONDUIT_TYPES,value:'EMT'},
    {key:'material',label:'Material',options:CONDUIT_MATERIAL_OPTIONS,value:CONDUIT_MATERIAL_OPTIONS[0]},
    {key:'trade_size',label:'Trade Size',options:ALL_TRADE_SIZE_OPTIONS,value:'1'},
    {key:'capacity',label:'Capacity',type:'number',step:'any'},
    {key:'allowed_cable_group',label:'Allowed Group'},
    ...GEOMETRY_BATCH_FIELDS
  ];

  function rowIsVisible(row){
    return row && row.style.display !== 'none';
  }

  function createBatchValueField(field){
    const hasOptions = Array.isArray(field.options) && field.options.length;
    const defaultValue = field.value !== undefined
      ? field.value
      : (hasOptions ? optionValue(field.options[0]) : '');
    return modalField({
      label:'Value',
      name:'batch_value',
      type:field.type || 'text',
      value:defaultValue,
      options:hasOptions ? field.options : null,
      min:field.min ?? null,
      step:field.step ?? null
    });
  }

  function selectedBatchTarget(config, form){
    if(!config.targets) return config;
    const key = form.elements.batch_target?.value || config.targets[0]?.value;
    return config.targets.find(target => target.value === key) || config.targets[0];
  }

  function batchFieldsForForm(config, form){
    return selectedBatchTarget(config, form)?.fields || config.fields || [];
  }

  function selectedBatchField(config, form){
    const fields = batchFieldsForForm(config, form);
    const key = form.elements.batch_field?.value || fields[0]?.key;
    return fields.find(field => field.key === key) || fields[0] || null;
  }

  function applyManagedTableBatchEdit(table, fieldKey, value, scope = 'visible'){
    if(!table?.tbody || !Array.isArray(table.columns)) return {count:0,skipped:0};
    const colIndex = table.columns.findIndex(col => col.key === fieldKey);
    if(colIndex < 0) return {count:0,skipped:0};
    const column = table.columns[colIndex] || {};
    const rows = Array.from(table.tbody.rows).filter(row => scope === 'all' || rowIsVisible(row));
    let count = 0;
    let skipped = 0;
    rows.forEach(row => {
      const cell = row.cells[colIndex + (table.colOffset || 0)];
      const control = cell?.querySelector('input,select,textarea');
      if(!control){skipped+=1;return;}
      if(control.tagName === 'SELECT' && !Array.from(control.options).some(option => option.value === value)){
        skipped+=1;
        return;
      }
      if(column.type === 'number' && value !== '' && Number.isNaN(Number(value))){
        skipped+=1;
        return;
      }
      control.value = value;
      control.dispatchEvent(new Event('input',{bubbles:true}));
      control.dispatchEvent(new Event('change',{bubbles:true}));
      count+=1;
    });
    if(count){
      table.save?.();
      table.updateRowCount?.();
      table.applyFilters?.();
      table.onChange?.();
    }
    return {count,skipped};
  }

  function batchEditConfig(kind){
    const configs = {
      ductbank: {
        title:'Batch Edit Ductbank Schedule',
        label:'Ductbank schedule',
        description:'Apply one field value to the visible ductbank rows, all ductbank rows, or the nested conduit rows.',
        targets:[
          {value:'ductbanks',label:'Ductbank rows',rowLabel:'ductbank rows',fields:DUCTBANK_BATCH_FIELDS},
          {value:'ductbankConduits',label:'Nested conduits',rowLabel:'nested conduits',fields:DUCTBANK_CONDUIT_BATCH_FIELDS}
        ],
        apply({target,field,value,scope}){
          if(typeof window.applyDuctbankBatchEdit !== 'function') return {count:0,skipped:0};
          return window.applyDuctbankBatchEdit({target,field:field.key,value,scope});
        }
      },
      tray: {
        title:'Batch Edit Tray Schedule',
        label:'Tray schedule',
        description:'Apply one field value to the visible tray rows or every tray row.',
        fields:TRAY_BATCH_FIELDS,
        rowLabel:'tray rows',
        apply({field,value,scope}){
          return applyManagedTableBatchEdit(trayTable, field.key, value, scope);
        }
      },
      conduit: {
        title:'Batch Edit Standalone Conduits',
        label:'Standalone conduit schedule',
        description:'Apply one field value to the visible standalone conduit rows or every standalone conduit row.',
        fields:CONDUIT_BATCH_FIELDS,
        rowLabel:'standalone conduit rows',
        apply({field,value,scope}){
          return applyManagedTableBatchEdit(conduitTable, field.key, value, scope);
        }
      }
    };
    return configs[kind] || null;
  }

  function setBatchStatus(form, message){
    const status = form.querySelector('.batch-edit-status');
    if(status) status.textContent = message;
  }

  function announceBatchEdit(config, result, field, scope, target){
    const summary = document.getElementById('raceway-validation-summary');
    if(!summary) return;
    const rowLabel = target?.rowLabel || config.rowLabel || 'rows';
    const scopeLabel = scope === 'all' ? 'all rows' : 'visible rows';
    const skippedText = result.skipped ? ` ${result.skipped} skipped because the value is not valid for that row.` : '';
    summary.className = 'load-validation-summary is-success';
    summary.textContent = `${config.label}: updated ${result.count} ${rowLabel} for ${field.label} across ${scopeLabel}.${skippedText}`;
  }

  function openBatchEditModal(kind){
    const config = batchEditConfig(kind);
    if(!config) return;
    document.querySelectorAll('.raceway-section-card details.toolbar-menu-danger').forEach(menu => {
      menu.removeAttribute('open');
    });
    openModal({
      title: config.title,
      description: config.description,
      primaryText: 'Apply Batch Edit',
      defaultWidth: 'medium',
      render(body, controller){
        const form = document.createElement('form');
        form.className = 'raceway-entry-form load-entry-grid';
        if(config.targets){
          form.appendChild(modalField({
            label:'Table Area',
            name:'batch_target',
            options:config.targets.map(target => ({value:target.value,label:target.label})),
            value:config.targets[0]?.value || ''
          }));
        }
        const fieldWrap = modalField({label:'Field',name:'batch_field',options:[]});
        const fieldSelect = fieldWrap.querySelector('select');
        const valueHost = document.createElement('div');
        const scopeWrap = modalField({label:'Apply To',name:'batch_scope',options:BATCH_SCOPE_OPTIONS,value:'visible'});
        const status = document.createElement('p');
        status.className = 'form-helper-text batch-edit-status';
        status.setAttribute('aria-live','polite');

        function refreshValue(){
          valueHost.innerHTML = '';
          const field = selectedBatchField(config, form);
          if(field) valueHost.appendChild(createBatchValueField(field));
        }

        function refreshFields(){
          const fields = batchFieldsForForm(config, form);
          fieldSelect.innerHTML = '';
          fields.forEach(field => {
            const opt = document.createElement('option');
            opt.value = field.key;
            opt.textContent = field.label;
            fieldSelect.appendChild(opt);
          });
          refreshValue();
        }

        form.append(fieldWrap, valueHost, scopeWrap, status);
        body.appendChild(form);
        form.elements.batch_target?.addEventListener('change', refreshFields);
        fieldSelect.addEventListener('change', refreshValue);
        refreshFields();
        controller.registerForm(form);
        return fieldSelect;
      },
      onSubmit(controller){
        const form = controller.body.querySelector('.raceway-entry-form');
        const field = selectedBatchField(config, form);
        const target = selectedBatchTarget(config, form);
        const value = form.elements.batch_value?.value ?? '';
        const scope = form.elements.batch_scope?.value || 'visible';
        if(!field){
          setBatchStatus(form, 'Choose a field before applying the batch edit.');
          return false;
        }
        const result = config.apply({target:target?.value,field,value,scope}) || {count:0,skipped:0};
        if(!result.count){
          const scopeText = scope === 'all' ? 'rows' : 'visible rows';
          const skippedText = result.skipped ? ` ${result.skipped} rows could not use that value.` : '';
          setBatchStatus(form, `No ${scopeText} were updated.${skippedText}`);
          return false;
        }
        persistAllConduits();
        markUnsaved();
        updateRacewayExperience();
        announceBatchEdit(config, result, field, scope, target);
        return true;
      }
    });
  }

  function openDuctbankEntryModal(){
    const last = (tables.ductbanks?.getData?.() || []).slice(-1)[0] || {};
    openModal({
      title: 'Add Ductbank',
      description: 'Create the ductbank run and optionally seed conduits inside it.',
      primaryText: 'Add Ductbank',
      defaultWidth: 'wide',
      render(body, controller){
        const form = renderEntryForm(body, [
          {label:'Tag',name:'tag',value:''},
          {label:'From',name:'from',value:last.to || ''},
          {label:'To',name:'to',value:''},
          {label:'Concrete Encasement',name:'concrete_encasement',options:['No','Yes'],value:'No'},
          {label:'Start X',name:'start_x',type:'number',value:last.end_x ?? '',step:'any'},
          {label:'Start Y',name:'start_y',type:'number',value:last.end_y ?? '',step:'any'},
          {label:'Start Z',name:'start_z',type:'number',value:last.end_z ?? '',step:'any'},
          {label:'End X',name:'end_x',type:'number',value:'',step:'any'},
          {label:'End Y',name:'end_y',type:'number',value:'',step:'any'},
          {label:'End Z',name:'end_z',type:'number',value:'',step:'any'},
          {label:'Conduit Count',name:'conduit_count',type:'number',value:'0',min:0,step:1},
          {label:'Conduit Type',name:'conduit_type',options:CONDUIT_TYPES,value:'PVC Sch 40'},
          {label:'Conduit Material',name:'conduit_material',options:CONDUIT_MATERIAL_OPTIONS,value:'PVC'},
          {label:'Trade Size',name:'trade_size',options:tradeSizeOptions('PVC Sch 40'),value:'4'},
          {label:'Allowed Group',name:'allowed_cable_group',value:''}
        ]);
        const typeSel = form.elements.conduit_type;
        const materialSel = form.elements.conduit_material;
        const sizeSel = form.elements.trade_size;
        typeSel.addEventListener('change', () => {
          const sizes = tradeSizeOptions(typeSel.value);
          sizeSel.innerHTML = '';
          sizes.forEach(size => {
            const opt = document.createElement('option');
            opt.value = size;
            opt.textContent = size;
            sizeSel.appendChild(opt);
          });
          if(materialSel && (materialSel.value === 'Steel' || materialSel.value === 'PVC')){
            materialSel.value = /PVC|ENT|LFNC/i.test(typeSel.value) ? 'PVC' : 'Steel';
          }
        });
        controller.registerForm(form);
        return form.elements.tag;
      },
      onSubmit(controller){
        const form = controller.body.querySelector('.raceway-entry-form');
        const values = getFormData(form);
        const tag = String(values.tag || '').trim();
        if(!tag){
          showAlertModal('Ductbank Tag Required', 'Enter a ductbank tag before adding the row.');
          return false;
        }
        const count = Math.max(0, Math.min(99, Number.parseInt(values.conduit_count, 10) || 0));
        const conduits = Array.from({length: count}, (_, index) => ({
          conduit_id: `${tag}-C${index + 1}`,
          type: values.conduit_type,
          material: values.conduit_material,
          trade_size: values.trade_size,
          allowed_cable_group: values.allowed_cable_group || '',
          ductbankTag: tag,
          start_x: values.start_x,
          start_y: values.start_y,
          start_z: values.start_z,
          end_x: values.end_x,
          end_y: values.end_y,
          end_z: values.end_z
        }));
        window.addDuctbankRow?.({
          tag,
          from: values.from,
          to: values.to,
          concrete_encasement: values.concrete_encasement === 'Yes',
          start_x: values.start_x,
          start_y: values.start_y,
          start_z: values.start_z,
          end_x: values.end_x,
          end_y: values.end_y,
          end_z: values.end_z,
          conduits,
          expanded: count > 0
        });
        persistAllConduits();
        markUnsaved();
        updateRacewayExperience();
        return true;
      }
    });
  }

  function openTrayEntryModal(){
    const last = lastRowData(trayTable);
    openModal({
      title: 'Add Tray',
      description: 'Enter the core tray definition. Coordinates can be chained from the previous tray.',
      primaryText: 'Add Tray',
      defaultWidth: 'wide',
      render(body, controller){
        const form = renderEntryForm(body, [
          {label:'Tray ID',name:'tray_id',value:''},
          {label:'Start X',name:'start_x',type:'number',value:last.end_x ?? '',step:'any'},
          {label:'Start Y',name:'start_y',type:'number',value:last.end_y ?? '',step:'any'},
          {label:'Start Z',name:'start_z',type:'number',value:last.end_z ?? '',step:'any'},
          {label:'End X',name:'end_x',type:'number',value:'',step:'any'},
          {label:'End Y',name:'end_y',type:'number',value:'',step:'any'},
          {label:'End Z',name:'end_z',type:'number',value:'',step:'any'},
          {label:'Inside Width (in)',name:'inside_width',options:TRAY_WIDTH_OPTIONS,value:'24'},
          {label:'Tray Depth (in)',name:'tray_depth',options:TRAY_DEPTH_OPTIONS,value:'4'},
          {label:'Tray Type',name:'tray_type',options:TRAY_TYPE_OPTIONS,value:TRAY_TYPE_OPTIONS[0]},
          {label:'Cover',name:'cover_condition',options:TRAY_COVER_OPTIONS,value:last.cover_condition || TRAY_COVER_OPTIONS[0]},
          {label:'Material',name:'material',options:TRAY_MATERIAL_OPTIONS,value:last.material || TRAY_MATERIAL_OPTIONS[0]},
          {label:'Slots',name:'num_slots',type:'number',value:'1',min:1,step:1},
          {label:'Allowed Group',name:'allowed_cable_group',value:''}
        ]);
        controller.registerForm(form);
        return form.elements.tray_id;
      },
      onSubmit(controller){
        const values = getFormData(controller.body.querySelector('.raceway-entry-form'));
        if(!String(values.tray_id || '').trim()){
          showAlertModal('Tray ID Required', 'Enter a tray ID before adding the row.');
          return false;
        }
        trayTable.addRow(values);
        trayTable.save();
        markUnsaved();
        updateRacewayExperience();
        return true;
      }
    });
  }

  function openConduitEntryModal(){
    const last = lastRowData(conduitTable);
    openModal({
      title: 'Add Standalone Conduit',
      description: 'Use this for conduits outside a ductbank. Ductbank conduits are added from a ductbank row.',
      primaryText: 'Add Conduit',
      defaultWidth: 'wide',
      render(body, controller){
        const initialType = last.type || 'EMT';
        const form = renderEntryForm(body, [
          {label:'Conduit ID',name:'conduit_id',value:''},
          {label:'Type',name:'type',options:CONDUIT_TYPES,value:initialType},
          {label:'Material',name:'material',options:CONDUIT_MATERIAL_OPTIONS,value:last.material || CONDUIT_MATERIAL_OPTIONS[0]},
          {label:'Trade Size',name:'trade_size',options:tradeSizeOptions(initialType),value:last.trade_size || tradeSizeOptions(initialType)[0]},
          {label:'Start X',name:'start_x',type:'number',value:last.end_x ?? '',step:'any'},
          {label:'Start Y',name:'start_y',type:'number',value:last.end_y ?? '',step:'any'},
          {label:'Start Z',name:'start_z',type:'number',value:last.end_z ?? '',step:'any'},
          {label:'End X',name:'end_x',type:'number',value:'',step:'any'},
          {label:'End Y',name:'end_y',type:'number',value:'',step:'any'},
          {label:'End Z',name:'end_z',type:'number',value:'',step:'any'},
          {label:'Capacity',name:'capacity',type:'number',value:'',step:'any'},
          {label:'Allowed Group',name:'allowed_cable_group',value:''}
        ]);
        const typeSel = form.elements.type;
        const materialSel = form.elements.material;
        const sizeSel = form.elements.trade_size;
        typeSel.addEventListener('change', () => {
          const sizes = tradeSizeOptions(typeSel.value);
          sizeSel.innerHTML = '';
          sizes.forEach(size => {
            const opt = document.createElement('option');
            opt.value = size;
            opt.textContent = size;
            sizeSel.appendChild(opt);
          });
          if(materialSel && (materialSel.value === 'Steel' || materialSel.value === 'PVC')){
            materialSel.value = /PVC|ENT|LFNC/i.test(typeSel.value) ? 'PVC' : 'Steel';
          }
        });
        controller.registerForm(form);
        return form.elements.conduit_id;
      },
      onSubmit(controller){
        const values = getFormData(controller.body.querySelector('.raceway-entry-form'));
        if(!String(values.conduit_id || '').trim()){
          showAlertModal('Conduit ID Required', 'Enter a conduit ID before adding the row.');
          return false;
        }
        conduitTable.addRow(values);
        conduitTable.save();
        persistAllConduits();
        markUnsaved();
        updateRacewayExperience();
        return true;
      }
    });
  }

  document.getElementById('add-ductbank-btn')?.addEventListener('click', openDuctbankEntryModal);
  document.getElementById('add-tray-btn')?.addEventListener('click', openTrayEntryModal);
  document.getElementById('add-conduit-btn')?.addEventListener('click', openConduitEntryModal);
  document.getElementById('batch-ductbank-btn')?.addEventListener('click', event => {
    event.currentTarget.closest('details')?.removeAttribute('open');
    openBatchEditModal('ductbank');
  });
  document.getElementById('batch-tray-btn')?.addEventListener('click', event => {
    event.currentTarget.closest('details')?.removeAttribute('open');
    openBatchEditModal('tray');
  });
  document.getElementById('batch-conduit-btn')?.addEventListener('click', event => {
    event.currentTarget.closest('details')?.removeAttribute('open');
    openBatchEditModal('conduit');
  });
  document.querySelectorAll('[data-raceway-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      applyRacewayViewPreset(btn.dataset.racewayView);
      btn.closest('details')?.removeAttribute('open');
    });
  });
  document.querySelectorAll('[data-raceway-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeRacewayFilter = btn.dataset.racewayFilter || 'all';
      applyRacewayQuickFilter();
    });
  });
  document.getElementById('import-cad-btn')?.addEventListener('click', () => document.getElementById('import-cad-input')?.click());
  document.getElementById('export-cad-btn')?.addEventListener('click', () => dataStore.exportToCad('json'));
  ['load-ductbank-btn','delete-ductbank-btn','load-tray-btn','delete-tray-btn','load-conduit-btn','delete-conduit-btn','clear-ductbank-filters-btn','clear-tray-filters-btn','clear-conduit-filters-btn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => requestAnimationFrame(updateRacewayExperience));
  });
  document.addEventListener('imports-ready', () => requestAnimationFrame(updateRacewayExperience));
  try {
    activeRacewayViewPreset = dataStore.getItem(RACEWAY_VIEW_PRESET_KEY, 'basic') || 'basic';
  } catch {
    activeRacewayViewPreset = 'basic';
  }
  requestAnimationFrame(updateRacewayExperience);
  const loadSamplesBtn=document.getElementById('raceway-load-samples');
  console.assert(loadSamplesBtn,'#raceway-load-samples button missing');
  loadSamplesBtn?.addEventListener('click', () => {
    onRacewayLoadSamples();
    whenPresent(DUCTBANK_ROW_SELECTOR, () => emitSticky('samples-loaded','samplesLoaded'));
  });

  function attachConduitsToDuctbanks(rows){
    const banks=(typeof window.getDuctbanks==='function'?window.getDuctbanks():[]);
    const tags=new Set(banks.map(db=>normalize(db.tag)));
    const map={};
    rows.forEach(r=>{
      const tag=normalize(r.ductbankTag||r.ductbank_tag);
      if(tags.has(tag)){(map[tag] ||= []).push(r);r._unmapped=false;}
      else{r._unmapped=true;}
    });
    globalThis.conduitsByDb=map;
    return map;
  }

  function parseCsv(txt){
    const lines=txt.trim().split(/\r?\n/);
    const headers=lines.shift().split(',').map(h=>h.trim());
    return lines.filter(Boolean).map(line=>{
      const cols=line.split(',');
      const obj={};
      headers.forEach((h,i)=>obj[h]=(cols[i]||'').trim());
      return obj;
    });
  }

  async function parseConduitFile(file){
    const name=file.name.toLowerCase();
    if(name.endsWith('.csv')) return parseCsv(await file.text());
    const data=new Uint8Array(await file.arrayBuffer());
    const wb=XLSX.read(data,{type:'array'});
    const sheet=wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
  }

  function showConduitsWizard(){
    const overlay=document.createElement('div');
    overlay.id='conduits-wizard';
    overlay.style.position='fixed';
    overlay.style.top=0;overlay.style.left=0;overlay.style.right=0;overlay.style.bottom=0;
    overlay.style.background='rgba(0,0,0,0.5)';
    overlay.style.display='flex';
    overlay.style.alignItems='center';
    overlay.style.justifyContent='center';
    overlay.style.zIndex='1000';
    overlay.innerHTML=`<div style="background:#fff;padding:20px;max-width:400px;width:90%;">
        <h3>Add/Import Conduits</h3>
        <input type="file" id="wizard-conduit-file" accept=".csv,.xlsx">
        <div style="margin-top:8px;">
          <button id="wizard-load-sample">Load Sample</button>
          <button id="wizard-close">Close</button>
        </div>
        <table id="wizard-conduit-table" style="margin-top:10px;width:100%;border-collapse:collapse;">
          <thead><tr><th>Ductbank Tag</th><th>Conduit ID</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>`;
    const close=()=>overlay.remove();
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    document.body.appendChild(overlay);
    overlay.querySelector('#wizard-close').addEventListener('click',close);
    const processRows=rows=>{
      attachConduitsToDuctbanks(rows);
      persistConduits({ductbanks: typeof window.getDuctbanks==='function'?window.getDuctbanks():[], conduits: rows});
      const tbody=overlay.querySelector('#wizard-conduit-table tbody');
      tbody.innerHTML='';
      rows.forEach(r=>{
        const tr=document.createElement('tr');
        if(r._unmapped) tr.classList.add('missing-tag-row');
        const td1=document.createElement('td');td1.textContent=r.ductbankTag||'';
        const td2=document.createElement('td');td2.textContent=r.conduit_id||'';
        tr.appendChild(td1);tr.appendChild(td2);
        tbody.appendChild(tr);
      });
    };
    overlay.querySelector('#wizard-conduit-file').addEventListener('change',async e=>{
      const f=e.target.files[0];if(f){const rows=await parseConduitFile(f);processRows(rows);} });
    overlay.querySelector('#wizard-load-sample').addEventListener('click',async()=>{
      try{
        const res=await fetch('examples/ductbank_schedule_conduits.csv');
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        const txt=await res.text();
        processRows(parseCsv(txt));
      }catch(err){
        console.warn('Failed to load sample conduits CSV',err);
      }
    });
  }

  const params=new URLSearchParams(window.location.search);
  if(params.get('expandAll')==='true'){
    getDuctbankRows().forEach(row=>{
      const btn = row.cells[0]?.querySelector('button');
      if(btn?.textContent==='\u25B6') btn.click();
    });
  }
  if(params.get('focus')==='ductbanks'){
    const tbl=document.getElementById('ductbankTable');
    if(tbl) tbl.scrollIntoView({behavior:'smooth',block:'start'});
  }
  if(params.get('showConduitsWizard')==='true') showConduitsWizard();

  // Validation button and lint panel
  const validateBtn=document.getElementById('validate-raceway-btn');
  const lintPanel=document.getElementById('lint-panel');
  const lintList=document.getElementById('lint-list');
  const lintCloseBtn=document.getElementById('lint-close-btn');

  function focusIssue(issue){
    if(!issue) return;
    let row, el;
    if(issue.table==='tray'){
      row=document.querySelector(`#trayTable tbody tr:nth-child(${issue.row+1})`);
      el=row?row.querySelector(`[name="${issue.col}"]`):null;
    }else if(issue.table==='conduit'){
      row=document.querySelector(`#conduitTable tbody tr:nth-child(${issue.row+1})`);
      el=row?row.querySelector(`[name="${issue.col}"]`):null;
    }else if(issue.table==='ductbank'){
      const rows=getDuctbankRows();
      row=rows[issue.row];
      el=row?row.cells[1].querySelector('input'):null;
    }
    if(el){
      el.focus();
      if(typeof el.scrollIntoView==='function') el.scrollIntoView({behavior:'smooth',block:'center'});
    }
  }

  function lintRaceways(){
    return collectRacewayIssues();
  }

  const exportRevitBtn = document.getElementById('export-revit-btn');
  if (exportRevitBtn) {
    exportRevitBtn.addEventListener('click', () => {
      const trays = dataStore.getTrays();
      const conduits = dataStore.getConduits();
      const cables = dataStore.getCables();
      const projectName = 'CableTrayRoute Export';
      downloadRevitExport({ trays, conduits, cables, projectName });
    });
  }

  if(validateBtn){
    validateBtn.addEventListener('click',()=>{
      const issues=lintRaceways();
      lintList.innerHTML='';
      if(issues.length===0){
        const li=document.createElement('li');
        li.textContent='No issues found';
        lintList.appendChild(li);
      }else{
        issues.forEach(issue=>{
          const li=document.createElement('li');
          li.textContent=issue.message;
          li.addEventListener('click',()=>focusIssue(issue));
          lintList.appendChild(li);
        });
      }
      lintPanel.classList.remove('hidden');
      updateRacewayExperience();
    });
  }

  if(lintCloseBtn){
    lintCloseBtn.addEventListener('click',()=>{
      lintPanel.classList.add('hidden');
    });
  }

  requestAnimationFrame(() => {
    const trayRows = document.querySelectorAll('#trayTable tbody tr');
    const conduitRows = document.querySelectorAll('#conduitTable tbody tr');
    const dbRows = document.querySelectorAll('#ductbankTable tbody tr');
    if (dbRows.length || trayRows.length || conduitRows.length) {
      ensureDuctbankRows();
      emitSticky('samples-loaded','samplesLoaded');
      document.body.dataset.racewayReady = '1';
    }
  });
  e2eOpenDetailsAndControls();
  setReadyWhen('#raceway-load-samples', 'data-raceway-ready', 'raceway-ready-beacon');

  // Reload all three tables whenever a remote collaborator's patch is applied
  document.addEventListener('ctr:remote-applied', async () => {
    await renderRacewaySamples({
      ductbanks: dataStore.getDuctbanks ? dataStore.getDuctbanks() : [],
      trays:     dataStore.getTrays    ? dataStore.getTrays()     : [],
      conduits:  dataStore.getConduits ? dataStore.getConduits()  : [],
    });
  });

  // --- Tour ---
  const tourBtn = document.getElementById('tour-btn');
  if (tourBtn) {
    tourBtn.addEventListener('click', () => startTour(RACEWAY_TOUR_STEPS, 'racewaySchedule'));
  }
});


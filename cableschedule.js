// ---- Inline E2E helpers (no external import) ----
const E2E = new URLSearchParams(location.search).has('e2e');

function markReady(flagName) {
  try {
    document.documentElement.setAttribute(flagName, '1');
    // also expose to window for debugging
    window[flagName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true;
  } catch {}
}

function suppressResumeIfE2E() {
  if (!E2E) return;
  // Do NOT clear storage by default; only when ?e2e_reset=1 is present.
  const qs = new URLSearchParams(location.search);
  const shouldClear = qs.has('e2e_reset');
  if (shouldClear) {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
  }
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

import * as dataStore from './dataStore.mjs';
import { sizeConductor } from './sizing.js';
import ampacity from './ampacity.mjs?v=2';
const { sizeToArea } = ampacity;

// Initialize Cable Schedule page logic
// This file mirrors the inline script previously embedded in
// cableschedule.html.  It now lives in its own module so that the Rollup
// build (src/cableschedule.js -> dist/cableschedule.js) actually includes the
// behaviour needed to populate the schedule table.

window.addEventListener('DOMContentLoaded', () => {
  forceShowResumeIfE2E();
  const projectId = window.currentProjectId || 'default';
  dataStore.loadProject(projectId);
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn','help-modal','close-help-btn');
  initNavToggle();

  // Track whether the current data has been saved.  This ties into the
  // undo/redo history managed in site.js – the project hash is updated only
  // when dataStore.setCables is invoked on save.
  let saved = true;
  const markSaved = () => { saved = true; };
  const markUnsaved = () => { saved = false; };
  window.addEventListener('beforeunload', e => {
    if (!saved) { e.preventDefault(); e.returnValue = ''; }
  });

  const INSULATION_TEMP_LIMIT = {
    THHN:90,XLPE:90,PVC:75,XHHW:90,'XHHW-2':90,'THWN-2':90,THW:75,THWN:75,TW:60,UF:60
  };
  const conductorSizes = ['#22 AWG','#20 AWG','#18 AWG','#16 AWG','#14 AWG','#12 AWG','#10 AWG','#8 AWG','#6 AWG','#4 AWG','#2 AWG','#1 AWG','1/0 AWG','2/0 AWG','3/0 AWG','4/0 AWG','250 kcmil','350 kcmil','500 kcmil','750 kcmil','1000 kcmil'];
  const cableTypes = ['Power','Control','Signal'];
  const conductorMaterials = ['Copper','Aluminum'];
  const insulationRatings = ['60','75','90'];
  const shieldingOptions = ['', 'Lead', 'Copper Tape'];
  const installMethods = ['Conduit','Tray','Direct Buried'];

  function getRacewayOptions(){
    const ids = new Set();
    try{ dataStore.getTrays().forEach(t=>{ if(t.tray_id) ids.add(t.tray_id); }); }catch(e){}
    try{ dataStore.getConduits().forEach(c=>{
      const id=c.tray_id||(c.ductbank_id&&c.conduit_id?`${c.ductbank_id}-${c.conduit_id}`:c.conduit_id);
      if(id) ids.add(id);
    }); }catch(e){}
    try{ dataStore.getDuctbanks().forEach(db=>{
      const dbId=db.ductbank_id||db.id||db.tag;
      (db.conduits||[]).forEach(c=>{
        const id=c.tray_id||(dbId&&c.conduit_id?`${dbId}-${c.conduit_id}`:c.conduit_id);
        if(id) ids.add(id);
      });
    }); }catch(e){}
    return Array.from(ids);
  }

  function getPanelOptions(){
    const ids=new Set();
    try{ dataStore.getPanels().forEach(p=>{ if(p.panel_id) ids.add(p.panel_id); }); }catch(e){}
    return Array.from(ids);
  }

  function getEquipmentOptions(){
    const ids=new Set();
    try{ dataStore.getEquipment().forEach(eq=>{ if(eq.id) ids.add(eq.id); }); }catch(e){}
    return Array.from(ids);
  }

  const columns=[
    {key:'tag',label:'Tag',type:'text',group:'Identification',tooltip:'Unique identifier for the cable'},
    {key:'service_description',label:'Service Description',type:'text',group:'Identification',tooltip:"Description of the cable's purpose"},
    {key:'from_tag',label:'From Tag',type:'text',datalist:()=>getEquipmentOptions(),group:'Routing / Termination',tooltip:'Starting equipment or location tag'},
    {key:'to_tag',label:'To Tag',type:'text',datalist:()=>getEquipmentOptions(),group:'Routing / Termination',tooltip:'Ending equipment or location tag'},
    {key:'start_x',label:'Start X',type:'number',group:'Routing / Termination',tooltip:'X-coordinate of cable start'},
    {key:'start_y',label:'Start Y',type:'number',group:'Routing / Termination',tooltip:'Y-coordinate of cable start'},
    {key:'start_z',label:'Start Z',type:'number',group:'Routing / Termination',tooltip:'Z-coordinate of cable start'},
    {key:'end_x',label:'End X',type:'number',group:'Routing / Termination',tooltip:'X-coordinate of cable end'},
    {key:'end_y',label:'End Y',type:'number',group:'Routing / Termination',tooltip:'Y-coordinate of cable end'},
    {key:'end_z',label:'End Z',type:'number',group:'Routing / Termination',tooltip:'Z-coordinate of cable end'},
    {key:'zone',label:'Cable Zone',type:'number',group:'Routing / Termination',tooltip:'Routing zone or area number'},
    {key:'raceway_ids',label:'Raceway(s)',type:'select',multiple:true,size:5,options:()=>getRacewayOptions(),group:'Routing / Termination',tooltip:'Select raceway IDs from Raceway Schedule'},
    {key:'manual_path',label:'Manual Path',type:'text',datalist:()=>getRacewayOptions(),group:'Routing / Termination',tooltip:'Tray IDs separated by > to override route'},
    {key:'panel_id',label:'Panel ID',type:'text',datalist:()=>getPanelOptions(),group:'Routing / Termination',tooltip:'Panel identifier from Panel Schedule'},
    {key:'circuit_number',label:'Circuit #',type:'number',group:'Routing / Termination',tooltip:'Circuit number from Panel Schedule'},
    {key:'circuit_group',label:'Circuit Group',type:'number',group:'Routing / Termination',tooltip:'Circuit grouping number'},
    {key:'allowed_cable_group',label:'Allowed Group',type:'text',group:'Routing / Termination',tooltip:'Permitted cable grouping identifier'},
    {key:'cable_type',label:'Cable Type',type:'select',options:cableTypes,group:'Cable Construction & Specs',tooltip:'Category such as Power, Control, or Signal'},
    {key:'conductors',label:'Conductors',type:'number',group:'Cable Construction & Specs',tooltip:'Number of conductors within the cable'},
    {key:'conductor_size',label:'Conductor Size',type:'select',options:conductorSizes,group:'Cable Construction & Specs',tooltip:'Size of each conductor'},
    {key:'conductor_material',label:'Conductor Material',type:'select',options:conductorMaterials,group:'Cable Construction & Specs',tooltip:'Material of the conductors'},
    {key:'ambient_temp',label:'Ambient Temp (°C)',type:'number',group:'Cable Construction & Specs',tooltip:'Ambient temperature for sizing'},
    {key:'install_method',label:'Install Method',type:'select',options:installMethods,group:'Cable Construction & Specs',tooltip:'Installation method'},
    {key:'insulation_type',label:'Insulation Type',type:'select',options:Object.keys(INSULATION_TEMP_LIMIT),group:'Cable Construction & Specs',tooltip:'Insulation material type'},
    {key:'insulation_rating',label:'Insul Rating (°C)',type:'select',options:insulationRatings,group:'Cable Construction & Specs',tooltip:'Maximum temperature rating of insulation'},
    {key:'insulation_thickness',label:'Insul Thick (in)',type:'number',group:'Cable Construction & Specs',tooltip:'Insulation thickness in inches'},
    {key:'cable_od',label:'Cable O.D. (in)',type:'number',group:'Cable Construction & Specs',tooltip:'Outside diameter of the cable in inches'},
    {key:'shielding_jacket',label:'Shielding/Jacket',type:'select',options:shieldingOptions,group:'Cable Construction & Specs',tooltip:'Shielding or outer jacket type'},
    {key:'cable_rating',label:'Cable Rating (V)',type:'number',group:'Electrical Characteristics',tooltip:'Maximum voltage rating'},
    {key:'operating_voltage',label:'Operating Voltage (V)',type:'number',group:'Electrical Characteristics',tooltip:'Nominal operating voltage'},
    {key:'est_load',label:'Est Load (A)',type:'number',group:'Electrical Characteristics',tooltip:'Estimated operating current'},
    {key:'duty_cycle',label:'Duty Cycle (%)',type:'number',group:'Electrical Characteristics',tooltip:'Duty cycle percentage'},
    {key:'length',label:'Length (ft)',type:'number',group:'Electrical Characteristics',tooltip:'Length of cable run'},
    {key:'calc_ampacity',label:'Calc Ampacity (A)',type:'number',group:'Electrical Characteristics',tooltip:'Ampacity after code factors'},
    {key:'code_reference',label:'Code Ref',type:'text',group:'Electrical Characteristics',tooltip:'Code table used'},
    {key:'voltage_drop_pct',label:'Estimated Voltage Drop (%)',type:'number',group:'Electrical Characteristics',tooltip:'Estimated voltage drop percent'},
    {key:'sizing_warning',label:'Sizing Warning',type:'text',group:'Electrical Characteristics',tooltip:'Non-compliance details'},
    {key:'notes',label:'Notes',type:'text',group:'Notes',tooltip:'Additional comments or notes'}
  ];

  columns.forEach(col => {
    if (col.type === 'number') {
      col.step = 'any';
      col.maxlength = 15;
      col.validate = col.validate || 'numeric';
    }
  });

  // Retrieve existing cables from project storage.
  let tableData = dataStore.getCables();
  const vdLimitIn = document.getElementById('vd-limit');

  function applySizingHighlight(){
    const limit = parseFloat(vdLimitIn.value);
    Array.from(table.tbody.querySelectorAll('tr')).forEach(tr => {
      const sizeSel = tr.querySelector('[name="conductor_size"]');
      const matSel = tr.querySelector('[name="conductor_material"]');
      const insSel = tr.querySelector('[name="insulation_rating"]');
      const loadIn = tr.querySelector('[name="est_load"]');
      const voltIn = tr.querySelector('[name="operating_voltage"]');
      const lenIn = tr.querySelector('[name="length"]');
      const condIn = tr.querySelector('[name="conductors"]');
      const ambIn = tr.querySelector('[name="ambient_temp"]');
      const ampIn = tr.querySelector('[name="calc_ampacity"]');
      const vdIn = tr.querySelector('[name="voltage_drop_pct"]');
      const warnIn = tr.querySelector('[name="sizing_warning"]');
      const codeRefIn = tr.querySelector('[name="code_reference"]');
      if (!sizeSel || !loadIn) return;
      const load = {
        current: parseFloat(loadIn.value) || 0,
        voltage: parseFloat(voltIn?.value) || 0,
        phases: 3,
        conductors: parseInt(condIn?.value) || 1
      };
      const params = {
        material: matSel?.value || 'cu',
        insulation_rating: parseFloat(insSel?.value) || 90,
        length: parseFloat(lenIn?.value) || 0,
        conductors: parseInt(condIn?.value) || 1,
        ambient: parseFloat(ambIn?.value) || 30,
        maxVoltageDrop: limit
      };
      const res = sizeConductor(load, params);
      if (ampIn) ampIn.value = res.ampacity ? res.ampacity.toFixed(2) : '';
      if (vdIn) {
        vdIn.value = res.voltageDrop ? res.voltageDrop.toFixed(2) : '';
        if (!isNaN(limit) && res.voltageDrop > limit) {
          vdIn.classList.add('voltage-exceed');
        } else {
          vdIn.classList.remove('voltage-exceed');
        }
      }
      if (codeRefIn) codeRefIn.value = res.codeRef || '';
      const sizeViolation = res.violation || (res.size && sizeSel.value && sizeToArea(sizeSel.value) < sizeToArea(res.size));
      if (warnIn) warnIn.value = sizeViolation ? (res.violation || `Requires ${res.size}`) : '';
      sizeSel.classList.toggle('sizing-violation', !!sizeViolation);
    });
  }

  function validateRow(tr){
    const tagIn = tr.querySelector('[name="tag"]');
    const sizeIn = tr.querySelector('[name="conductor_size"]');
    const lengthIn = tr.querySelector('[name="length"]');
    const racewaySel = tr.querySelector('[name="raceway_ids"]');
    let valid = true;
    const getRacewayVals = el => {
      if (!el) return [];
      if (typeof el.getSelectedValues === 'function') return el.getSelectedValues();
      return Array.from(el.selectedOptions || []).map(o => o.value).filter(v => v);
    };
    const checks = [
      [tagIn, tagIn && tagIn.value.trim() !== ''],
      [sizeIn, sizeIn && sizeIn.value.trim() !== ''],
      [lengthIn, lengthIn && lengthIn.value.trim() !== '' && !isNaN(lengthIn.value)],
      [racewaySel, getRacewayVals(racewaySel).length > 0]
    ];
    checks.forEach(([el, ok]) => {
      if (!el) return;
      el.classList.toggle('missing-value', !ok);
      if (!ok) valid = false;
    });
    tr.classList.toggle('missing-row', !valid);
    return valid;
  }

  function validateAllRows(){
    let allValid = true;
    Array.from(table.tbody.querySelectorAll('tr')).forEach(tr => {
      if(!validateRow(tr)) allValid = false;
    });
    return allValid;
  }

  const table = TableUtils.createTable({
    tableId:'cableScheduleTable',
    storageKey:TableUtils.STORAGE_KEYS.cableSchedule,
    addRowBtnId:'add-row-btn',
    saveBtnId:'save-schedule-btn',
    loadBtnId:'load-schedule-btn',
    clearFiltersBtnId:'clear-filters-btn',
    exportBtnId:'export-xlsx-btn',
    importInputId:'import-xlsx-input',
    importBtnId:'import-xlsx-btn',
    deleteAllBtnId:'delete-all-btn',
    columns,
    onChange:() => { markUnsaved(); applySizingHighlight(); validateAllRows(); },
    onSave:() => {
      markSaved();
      tableData = table.getData();
      dataStore.setCables(tableData); // persist only when user saves
      dataStore.saveProject(projectId);
    }
  });

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
      const ids = data.map(r => r.tag).filter(Boolean);
      clone.tag = generateId(ids, clone.tag);
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

  // Provide a setData method similar to Tabulator for convenience.
  table.setData = function(rows){
    this.tbody.innerHTML='';
    (rows||[]).forEach(r=>this.addRow(r));
    this.updateRowCount?.();
    this.applyFilters?.();
  };

  // Ensure the table is populated with any existing data on load.
  table.setData(tableData);
  applySizingHighlight();
  validateAllRows();
  vdLimitIn.addEventListener('input', applySizingHighlight);

  document.getElementById('load-sample-cables-btn').addEventListener('click', async () => {
    try {
      const res = await fetch('examples/sampleCables.json');
      const sampleCables = await res.json();
      table.setData(sampleCables); // immediately display the sample rows
      tableData = sampleCables;
      table.save();
      validateAllRows();
      markSaved();
    } catch (e) {
      console.error('Failed to load sample cables', e);
    }
  });

  const origExport = table.exportXlsx.bind(table);
  table.exportXlsx = function(){
    if(!validateAllRows()){
      alert('Please complete required fields before exporting.');
      return;
    }
    origExport();
  };

  function getCableSchedule(){
    table.save();
    return table.getData();
  }
  window.getCableSchedule = getCableSchedule;
});

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

import './site.js';
import * as dataStore from './dataStore.mjs';
import { sizeConductor } from './sizing.js';
import ampacity from './ampacity.mjs';
import { createTable, STORAGE_KEYS } from './tableUtils.mjs';
const { sizeToArea } = ampacity;

suppressResumeIfE2E();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', forceShowResumeIfE2E, { once: true });
} else {
  forceShowResumeIfE2E();
}

// Initialize Cable Schedule page logic
// This file mirrors the inline script previously embedded in
// cableschedule.html.  It now lives in its own module so that the Rollup
// build (src/cableschedule.js -> dist/cableschedule.js) actually includes the
// behaviour needed to populate the schedule table.

async function initCableSchedule() {
  console.log('Cable Schedule DOMContentLoaded event fired');
  const projectId = window.currentProjectId || 'default';
  dataStore.loadProject(projectId);
  console.log('Loaded project', projectId);
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn','help-modal','close-help-btn');
  initNavToggle();

  // Track whether the current data has been saved.  This ties into the
  // undo/redo history managed in site.js – the project hash is updated only
  // when dataStore.setCables is invoked on save.
  let saved = true;
  let suppressCablesUpdate = false;
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
    const toLabel=value=>{
      if(value===null||value===undefined) return '';
      try{return String(value).trim();}catch{return '';}
    };
    const names=new Set();
    try{
      dataStore.getEquipment().forEach(eq=>{
        const friendly=toLabel(eq?.ref)||toLabel(eq?.description)||toLabel(eq?.id);
        if(friendly) names.add(friendly);
      });
    }catch(e){}
    return Array.from(names);
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
    {key:'load_flow_current',label:'Load Flow Current (A)',type:'text',group:'Electrical Characteristics',tooltip:'Current captured from the latest load flow study'},
    {key:'duty_cycle',label:'Duty Cycle (%)',type:'number',group:'Electrical Characteristics',tooltip:'Duty cycle percentage'},
    {key:'length',label:'Length (ft)',type:'number',group:'Electrical Characteristics',tooltip:'Length of cable run'},
    {key:'calc_ampacity',label:'Calc Ampacity (A)',type:'number',group:'Electrical Characteristics',tooltip:'Ampacity after code factors'},
    {key:'code_reference',label:'Code Ref',type:'text',group:'Electrical Characteristics',tooltip:'Code table used'},
    {key:'voltage_drop_pct',label:'Estimated Voltage Drop (%)',type:'number',group:'Electrical Characteristics',tooltip:'Estimated voltage drop percent'},
    {key:'sizing_warning',label:'Sizing Warning',type:'text',group:'Electrical Characteristics',tooltip:'Non-compliance details'},
    {key:'notes',label:'Notes',type:'text',group:'Notes',tooltip:'Additional comments or notes'}
  ];

  const groupNames = Array.from(new Set(columns.map(col => col.group || 'General')));
  const PRESETS = {
    full: { label: 'Full Detail', groups: groupNames },
    routing: { label: 'Routing Focus', groups: ['Identification', 'Routing / Termination', 'Notes'] },
    electrical: { label: 'Electrical Focus', groups: ['Identification', 'Electrical Characteristics', 'Notes'] },
    construction: { label: 'Construction Specs', groups: ['Identification', 'Cable Construction & Specs', 'Notes'] }
  };
  const DEFAULT_PRESET = 'full';

  columns.forEach(col => {
    if (col.type === 'number') {
      col.step = 'any';
      col.maxlength = 15;
      col.validate = col.validate || 'numeric';
    }
  });

  const editorModal = document.getElementById('cable-editor-modal');
  const editorForm = editorModal ? editorModal.querySelector('#cable-editor-form') : null;
  const editorBody = editorModal ? editorModal.querySelector('#cable-editor-body') : null;
  const editorCancelBtn = editorModal ? editorModal.querySelector('#cable-editor-cancel') : null;
  const editorCloseBtn = editorModal ? editorModal.querySelector('#close-cable-editor-btn') : null;
  const editorTitle = editorModal ? editorModal.querySelector('#cable-editor-title') : null;
  const defaultEditorTitle = editorTitle ? editorTitle.textContent : '';
  let editorFieldMap = new Map();
  let activeRow = null;
  let activeTable = null;
  let activeRowData = null;
  let editorTypicalControls = null;
  let editorTypicalSelect = null;
  let editorSaveTypicalBtn = null;
  let batchTypicalSelect = null;
  let applyTypicalBtn = null;
  let typicalFilterSelect = null;
  let tableInstance = null;

  const cloneTemplates = templates => (Array.isArray(templates) ? templates.map(t => JSON.parse(JSON.stringify(t))) : []);
  const generateTemplateId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const rand = Math.random().toString(36).slice(2, 10);
    const stamp = Date.now().toString(36);
    return `tpl-${stamp}-${rand}`;
  };
  const ensureTemplateIds = templates => {
    const copies = cloneTemplates(templates);
    let changed = false;
    copies.forEach(tpl => {
      if (!tpl.template_id) {
        tpl.template_id = generateTemplateId();
        changed = true;
      }
    });
    return { templates: copies, changed };
  };
  const sanitizeTemplate = template => {
    const copy = JSON.parse(JSON.stringify(template || {}));
    delete copy.label;
    delete copy.typical_id;
    return copy;
  };
  const getTemplateDisplayName = (template, idx) => (template?.label || template?.tag || `Typical ${idx + 1}`);
  const mergeTemplateValues = (templateValues, existingValues = {}, options = {}) => {
    const preserveKeys = new Set(options.preserveKeys || []);
    const skipUndefined = options.skipUndefined !== undefined ? options.skipUndefined : true;
    const overwriteExisting = options.overwriteExisting || false;
    const merged = { ...existingValues };
    Object.entries(templateValues || {}).forEach(([key, value]) => {
      if (key === 'label' || key === 'template_id') return;
      if (preserveKeys.has(key)) return;
      if ((value === undefined || value === null) && skipUndefined) return;
      if (!overwriteExisting) {
        const existing = merged[key];
        const isArrayEmpty = Array.isArray(existing) && existing.length === 0;
        const isStringEmpty = typeof existing === 'string' && existing.trim() === '';
        const hasExisting = !(existing === undefined || existing === null || isArrayEmpty || isStringEmpty);
        if (hasExisting) return;
      }
      merged[key] = Array.isArray(value) ? value.map(v => (v != null ? `${v}` : v)) : value;
    });
    return merged;
  };
  const { templates: initialTemplates, changed: initialTemplateChange } = ensureTemplateIds(dataStore.getCableTemplates());
  if (initialTemplateChange) {
    dataStore.setCableTemplates(initialTemplates);
  }
  let cachedCableTemplates = initialTemplates;

  function collectRowTypicalIds() {
    const ids = new Set();
    if (!tableInstance || !tableInstance.tbody) return ids;
    Array.from(tableInstance.tbody.rows).forEach(tr => {
      const id = tr?.dataset?.typicalId || '';
      if (id) ids.add(id);
    });
    return ids;
  }

  function updateBatchActionState() {
    if (!applyTypicalBtn) return;
    const hasTemplate = batchTypicalSelect && batchTypicalSelect.value;
    const selectedCount = tableInstance && typeof tableInstance.getSelectedRows === 'function'
      ? tableInstance.getSelectedRows().length
      : 0;
    applyTypicalBtn.disabled = !(hasTemplate && selectedCount > 0);
  }

  function updateBatchTypicalControls() {
    if (!batchTypicalSelect && !typicalFilterSelect) return;
    const labelEntries = [];
    cachedCableTemplates.forEach((tpl, idx) => {
      if (!tpl || !tpl.template_id) return;
      labelEntries.push([tpl.template_id, getTemplateDisplayName(tpl, idx)]);
    });

    if (batchTypicalSelect) {
      const previousValue = batchTypicalSelect.value;
      batchTypicalSelect.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = cachedCableTemplates.length ? 'Select a typical…' : 'No typicals available';
      batchTypicalSelect.appendChild(placeholder);
      labelEntries.forEach(([id, label]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = label;
        batchTypicalSelect.appendChild(option);
      });
      batchTypicalSelect.disabled = !cachedCableTemplates.length;
      if (labelEntries.some(([id]) => id === previousValue)) {
        batchTypicalSelect.value = previousValue;
      } else {
        batchTypicalSelect.value = '';
      }
    }

    if (typicalFilterSelect) {
      const previousFilter = typicalFilterSelect.value;
      typicalFilterSelect.innerHTML = '';
      const allOption = document.createElement('option');
      allOption.value = '';
      allOption.textContent = 'All Typicals';
      typicalFilterSelect.appendChild(allOption);
      const noneOption = document.createElement('option');
      noneOption.value = '__none__';
      noneOption.textContent = 'No Typical';
      typicalFilterSelect.appendChild(noneOption);

      const labelsForFilter = new Map(labelEntries);
      collectRowTypicalIds().forEach(id => {
        if (!labelsForFilter.has(id)) {
          const suffix = id.slice(-6) || id;
          labelsForFilter.set(id, `Deleted Typical (${suffix})`);
        }
      });
      Array.from(labelsForFilter.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .forEach(([id, label]) => {
          const option = document.createElement('option');
          option.value = id;
          option.textContent = label;
          typicalFilterSelect.appendChild(option);
        });

      if (previousFilter && Array.from(typicalFilterSelect.options).some(opt => opt.value === previousFilter)) {
        typicalFilterSelect.value = previousFilter;
      } else {
        typicalFilterSelect.value = '';
      }
    }

    applyTypicalFilter();
    updateBatchActionState();
  }

  function applyTypicalFilter() {
    if (!tableInstance || !typicalFilterSelect || typeof tableInstance.setCustomFilter !== 'function') return;
    const value = typicalFilterSelect.value;
    if (!value) {
      tableInstance.setCustomFilter('typical', null);
    } else if (value === '__none__') {
      tableInstance.setCustomFilter('typical', tr => {
        const id = (tr?.dataset?.typicalId || '').trim();
        return id === '';
      });
    } else {
      tableInstance.setCustomFilter('typical', tr => (tr?.dataset?.typicalId || '') === value);
    }
    updateBatchActionState();
  }

  const buildGroupMap = () => {
    const order = [];
    const grouped = new Map();
    columns.forEach(col => {
      const groupName = col.group || 'General';
      if (!grouped.has(groupName)) {
        grouped.set(groupName, []);
        order.push(groupName);
      }
      grouped.get(groupName).push(col);
    });
    return { order, grouped };
  };

  const ensureDatalist = (col, tr, rowData, hostModal = editorModal) => {
    if (!hostModal || !col.datalist) return null;
    const prefix = hostModal === editorModal ? 'cable-editor' : (hostModal.id || 'modal');
    const listId = `${prefix}-${col.key}-list`;
    let list = hostModal.querySelector(`#${listId}`);
    if (!list) {
      list = document.createElement('datalist');
      list.id = listId;
      hostModal.appendChild(list);
    }
    const items = typeof col.datalist === 'function' ? col.datalist(tr, rowData) : col.datalist;
    list.innerHTML = '';
    (items || []).forEach(opt => {
      const option = document.createElement('option');
      option.value = opt;
      list.appendChild(option);
    });
    return listId;
  };

  const createEditorField = (col, tr, options = {}) => {
    const rowData = options.rowData || activeRowData || {};
    let field;
    if (col.type === 'select') {
      const opts = typeof col.options === 'function' ? col.options(tr, rowData) : (col.options || []);
      field = document.createElement('select');
      if (col.multiple) {
        field.multiple = true;
        if (col.size) field.size = col.size;
        field.classList.add('modal-select');
      }
      opts.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        field.appendChild(option);
      });
    } else {
      field = document.createElement('input');
      field.type = col.type || 'text';
      if (field.type === 'number') {
        field.step = col.step || 'any';
      }
      if (col.maxlength) field.maxLength = col.maxlength;
      if (col.className) field.className = col.className;
      const listId = ensureDatalist(col, tr, rowData, options.modal || editorModal);
      if (listId) field.setAttribute('list', listId);
    }
    field.name = col.key;
    const val = rowData[col.key] !== undefined ? rowData[col.key] : col.default;
    if (col.multiple) {
      const values = Array.isArray(val) ? val : (val ? [val] : []);
      const opts = Array.from(field.options || []);
      if (typeof field.setSelectedValues === 'function') {
        field.setSelectedValues(values);
      } else if (field.multiple) {
        opts.forEach(option => { option.selected = values.includes(option.value); });
      }
    } else if (val !== undefined && val !== null) {
      field.value = val;
    }
    if (field.tagName === 'SELECT' && !col.multiple && field.options.length && (val === undefined || val === null)) {
      field.value = field.options[0].value;
    }
    return field;
  };

  const getEditorFieldValues = () => {
    const values = {};
    editorFieldMap.forEach((field, key) => {
      if (field.multiple) {
        values[key] = Array.from(field.selectedOptions || []).map(opt => opt.value).filter(v => v !== '');
      } else {
        values[key] = field.value;
      }
    });
    return values;
  };

  const setEditorFieldValues = (values, options = {}) => {
    const skipUndefined = options.skipUndefined || false;
    editorFieldMap.forEach((field, key) => {
      if (!field) return;
      if (!(key in values) && skipUndefined) return;
      const value = values[key];
      if (field.multiple) {
        const vals = Array.isArray(value) ? value : (value ? [value] : []);
        Array.from(field.options || []).forEach(option => {
          option.selected = vals.includes(option.value);
        });
      } else if (value !== undefined && value !== null) {
        field.value = value;
      } else if (!skipUndefined) {
        field.value = '';
      }
    });
  };

  const applyValuesToActiveRow = (values, options = {}) => {
    if (!activeRow || !activeTable) return;
    const skipUndefined = options.skipUndefined || false;
    const offset = activeTable.colOffset || 0;
    activeTable.columns.forEach((col, idx) => {
      if (!(col.key in values) && skipUndefined) return;
      const rawValue = values[col.key];
      const cell = activeRow.cells[idx + offset];
      if (!cell) return;
      const el = cell.firstChild;
      if (!el) return;
      if (col.multiple) {
        if (!(col.key in values)) return;
        const vals = Array.isArray(rawValue) ? rawValue : (rawValue ? [rawValue] : []);
        if (typeof el.setSelectedValues === 'function') {
          el.setSelectedValues(vals);
        } else if (el.options) {
          Array.from(el.options).forEach(opt => {
            opt.selected = vals.includes(opt.value);
          });
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const value = rawValue ?? '';
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    if ('typical_id' in values && activeRow) {
      activeRow.dataset.typicalId = values.typical_id || '';
    }
    activeRowData = { ...(activeRowData || {}), ...values };
    if (typeof activeTable.onChange === 'function') {
      activeTable.onChange();
    }
  };

  const closeEditor = () => {
    if (!editorModal) return;
    editorModal.style.display = 'none';
    editorModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', handleEditorKeydown);
    editorFieldMap = new Map();
    activeRow = null;
    activeTable = null;
    activeRowData = null;
    if (editorTitle) editorTitle.textContent = defaultEditorTitle;
  };

  const handleEditorKeydown = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeEditor();
    }
  };

  const ensureEditorTypicalControls = () => {
    if (!editorForm || editorTypicalControls) return;
    editorTypicalControls = document.createElement('div');
    editorTypicalControls.className = 'modal-toolbar typical-controls';
    const typicalLabel = document.createElement('label');
    typicalLabel.setAttribute('for', 'cable-editor-typical-select');
    typicalLabel.textContent = 'Use Typical';
    editorTypicalSelect = document.createElement('select');
    editorTypicalSelect.id = 'cable-editor-typical-select';
    editorTypicalSelect.className = 'modal-select';
    editorTypicalSelect.addEventListener('change', () => {
      const idx = Number(editorTypicalSelect.value);
      if (Number.isNaN(idx)) return;
      const rawTemplate = cachedCableTemplates[idx];
      const template = sanitizeTemplate(rawTemplate);
      if (!template) {
        editorTypicalSelect.value = '';
        return;
      }
      const currentValues = getEditorFieldValues();
      const merged = mergeTemplateValues(template, currentValues, { preserveKeys: ['tag'] });
      const templateId = rawTemplate?.template_id || '';
      delete merged.template_id;
      merged.typical_id = templateId;
      setEditorFieldValues(merged, { skipUndefined: false });
      applyValuesToActiveRow(merged, { skipUndefined: false });
      editorTypicalSelect.value = '';
    });
    editorSaveTypicalBtn = document.createElement('button');
    editorSaveTypicalBtn.type = 'button';
    editorSaveTypicalBtn.id = 'cable-editor-save-typical';
    editorSaveTypicalBtn.className = 'btn';
    editorSaveTypicalBtn.textContent = 'Save as Typical';
    editorSaveTypicalBtn.addEventListener('click', () => {
      if (!activeTable) return;
      const values = getEditorFieldValues();
      const suggestion = values.tag || values.service_description || values.label || 'Cable Typical';
      const labelInput = window.prompt ? window.prompt('Label for this cable typical', suggestion) : suggestion;
      if (labelInput === null) return;
      const label = (labelInput || suggestion || '').trim();
      if (!label) return;
      const template = { ...values, label };
      delete template.typical_id;
      if (!template.template_id) template.template_id = generateTemplateId();
      const updated = cloneTemplates(cachedCableTemplates);
      updated.push(template);
      dataStore.setCableTemplates(updated);
      if (editorTypicalSelect) editorTypicalSelect.value = '';
    });
    editorTypicalControls.appendChild(typicalLabel);
    editorTypicalControls.appendChild(editorTypicalSelect);
    editorTypicalControls.appendChild(editorSaveTypicalBtn);
    const insertTarget = editorTitle || editorForm.firstChild;
    if (insertTarget && insertTarget.parentNode) {
      insertTarget.parentNode.insertBefore(editorTypicalControls, insertTarget.nextSibling);
    } else if (editorForm.firstChild) {
      editorForm.insertBefore(editorTypicalControls, editorForm.firstChild.nextSibling);
    } else {
      editorForm.appendChild(editorTypicalControls);
    }
  };

  const updateEditorTypicalControls = () => {
    if (!editorTypicalSelect) return;
    const previous = editorTypicalSelect.value;
    editorTypicalSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = cachedCableTemplates.length ? 'Select a typical…' : 'No typicals available';
    editorTypicalSelect.appendChild(placeholder);
    cachedCableTemplates.forEach((tpl, idx) => {
      const option = document.createElement('option');
      option.value = String(idx);
      option.textContent = getTemplateDisplayName(tpl, idx);
      editorTypicalSelect.appendChild(option);
    });
    editorTypicalSelect.disabled = !cachedCableTemplates.length;
    if (!editorTypicalSelect.disabled && Array.from(editorTypicalSelect.options).some(opt => opt.value === previous)) {
      editorTypicalSelect.value = previous;
    } else {
      editorTypicalSelect.value = '';
    }
  };

  dataStore.on(dataStore.STORAGE_KEYS.cableTemplates, templates => {
    const { templates: normalized, changed } = ensureTemplateIds(templates);
    cachedCableTemplates = normalized;
    updateEditorTypicalControls();
    updateBatchTypicalControls();
    if (changed) dataStore.setCableTemplates(normalized);
  });

  const openEditor = (rowData, tr, tableInstance) => {
    if (!editorModal || !editorForm || !editorBody) return;
    activeRow = tr;
    activeTable = tableInstance;
    activeRowData = rowData || {};
    editorFieldMap = new Map();
    editorBody.innerHTML = '';
    const { order, grouped } = buildGroupMap();
    ensureEditorTypicalControls();
    updateEditorTypicalControls();
    if (editorTypicalSelect) editorTypicalSelect.value = '';
    order.forEach(groupName => {
      const section = document.createElement('fieldset');
      section.className = 'modal-section';
      const legendText = groupName || '';
      if (legendText) {
        const legend = document.createElement('legend');
        legend.textContent = legendText;
        section.appendChild(legend);
      }
      const fieldsWrapper = document.createElement('div');
      fieldsWrapper.className = 'modal-body';
      (grouped.get(groupName) || []).forEach(col => {
        const fieldId = `cable-editor-${col.key}`;
        const fieldContainer = document.createElement('div');
        fieldContainer.className = 'modal-form-field';
        const label = document.createElement('label');
        label.setAttribute('for', fieldId);
        label.textContent = col.label;
        if (col.tooltip) label.title = col.tooltip;
        const field = createEditorField(col, tr);
        field.id = fieldId;
        fieldContainer.appendChild(label);
        fieldContainer.appendChild(field);
        editorFieldMap.set(col.key, field);
        fieldsWrapper.appendChild(fieldContainer);
      });
      section.appendChild(fieldsWrapper);
      editorBody.appendChild(section);
    });
    if (editorTitle) {
      const tag = activeRowData?.tag;
      editorTitle.textContent = tag ? `Cable Details – ${tag}` : (defaultEditorTitle || 'Cable Details');
    }
    editorModal.style.display = 'flex';
    editorModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    document.addEventListener('keydown', handleEditorKeydown);
    const focusTarget = editorBody.querySelector('input, select, textarea');
    if (focusTarget) focusTarget.focus();
  };

  if (editorCancelBtn) editorCancelBtn.addEventListener('click', closeEditor);
  if (editorCloseBtn) editorCloseBtn.addEventListener('click', closeEditor);
  if (editorModal) {
    editorModal.addEventListener('click', e => {
      if (e.target === editorModal) closeEditor();
    });
  }

  if (editorForm) {
    editorForm.addEventListener('submit', e => {
      e.preventDefault();
      if (!activeRow || !activeTable) {
        closeEditor();
        return;
      }
      const updatedValues = getEditorFieldValues();
      const offset = activeTable.colOffset || 0;
      activeTable.columns.forEach((col, idx) => {
        const value = updatedValues[col.key];
        const cell = activeRow.cells[idx + offset];
        if (!cell) return;
        const el = cell.firstChild;
        if (!el) return;
        if (col.multiple) {
          const values = Array.isArray(value) ? value : (value ? [value] : []);
          if (typeof el.setSelectedValues === 'function') {
            el.setSelectedValues(values);
          } else if (el.options) {
            Array.from(el.options).forEach(opt => {
              opt.selected = values.includes(opt.value);
            });
          }
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          el.value = value ?? '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      if (typeof activeTable.onChange === 'function') {
        activeTable.onChange();
      }
      closeEditor();
    });
  }

  class CableLibraryController {
    constructor({ columns: modalColumns, buildGroupMap: buildGroups, createField }) {
      this.columns = modalColumns;
      this.buildGroupMap = buildGroups;
      this.createField = createField;
      this.modal = document.getElementById('cable-library-modal');
      this.button = document.getElementById('cable-library-btn');
      this.closeBtn = this.modal ? this.modal.querySelector('#close-cable-library-btn') : null;
      this.addBtn = this.modal ? this.modal.querySelector('#cable-library-add-btn') : null;
      this.listView = this.modal ? this.modal.querySelector('#cable-library-list-view') : null;
      this.list = this.modal ? this.modal.querySelector('#cable-library-list') : null;
      this.emptyState = this.modal ? this.modal.querySelector('#cable-library-empty') : null;
      this.form = this.modal ? this.modal.querySelector('#cable-library-form') : null;
      this.formTitle = this.form ? this.form.querySelector('#cable-library-form-title') : null;
      this.formFields = this.modal ? this.modal.querySelector('#cable-library-form-fields') : null;
      this.labelInput = this.modal ? this.modal.querySelector('#cable-library-label') : null;
      this.cancelBtn = this.modal ? this.modal.querySelector('#cable-library-cancel-btn') : null;
      this.saveBtn = this.modal ? this.modal.querySelector('#cable-library-save-btn') : null;
      this.content = this.modal ? this.modal.querySelector('.modal-content') : null;
      this.templates = [];
      this.fieldMap = new Map();
      this.mode = 'list';
      this.editIndex = -1;
      this.onApply = null;
      this.previouslyFocused = null;
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleListClick = this.handleListClick.bind(this);
      this.init();
    }

    init() {
      if (!this.modal || !this.button || !this.listView || !this.form) return;
      this.form.hidden = true;
      this.listView.hidden = false;
      this.button.setAttribute('aria-expanded', 'false');
      this.button.addEventListener('click', () => this.open());
      if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());
      if (this.addBtn) this.addBtn.addEventListener('click', () => this.startAdd());
      if (this.cancelBtn) this.cancelBtn.addEventListener('click', () => this.showList());
      if (this.form) {
        this.form.addEventListener('submit', e => {
          e.preventDefault();
          this.saveTemplate();
        });
      }
      if (this.list) this.list.addEventListener('click', this.handleListClick);
      this.modal.addEventListener('click', e => {
        if (e.target === this.modal) this.close();
      });
      dataStore.on(dataStore.STORAGE_KEYS.cableTemplates, templates => {
        this.syncTemplates(templates);
      });
      this.syncTemplates(dataStore.getCableTemplates());
    }

    setApplyHandler(fn) {
      this.onApply = typeof fn === 'function' ? fn : null;
    }

    syncTemplates(templates) {
      const { templates: normalized, changed } = ensureTemplateIds(templates);
      this.templates = normalized;
      if (changed) dataStore.setCableTemplates(normalized);
      this.renderList();
    }

    open() {
      if (!this.modal) return;
      this.syncTemplates(dataStore.getCableTemplates());
      this.showList();
      this.modal.style.display = 'flex';
      this.modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      this.button.setAttribute('aria-expanded', 'true');
      this.previouslyFocused = document.activeElement;
      document.addEventListener('keydown', this.handleKeydown);
      const focusTarget = this.addBtn || this.modal.querySelector('button, input, select, textarea');
      if (focusTarget) focusTarget.focus();
    }

    close() {
      if (!this.modal) return;
      this.modal.style.display = 'none';
      this.modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      this.button.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', this.handleKeydown);
      const target = this.previouslyFocused && document.contains(this.previouslyFocused) ? this.previouslyFocused : this.button;
      if (target && typeof target.focus === 'function') target.focus();
    }

    handleKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        return;
      }
      const trap = typeof window.trapFocus === 'function' ? window.trapFocus : (typeof trapFocus === 'function' ? trapFocus : null);
      if (!trap) return;
      trap(e, this.form && !this.form.hidden ? this.form : (this.content || this.modal));
    }

    handleListClick(e) {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const idx = Number(btn.getAttribute('data-index'));
      if (Number.isNaN(idx)) return;
      const action = btn.getAttribute('data-action');
      if (action === 'edit') {
        this.startEdit(idx);
      } else if (action === 'delete') {
        this.deleteTemplate(idx);
      } else if (action === 'apply') {
        this.applyTemplate(idx);
      }
    }

    renderList() {
      if (!this.list) return;
      this.list.innerHTML = '';
      if (!this.templates.length) {
        if (this.emptyState) this.emptyState.hidden = false;
        this.list.setAttribute('aria-hidden', 'true');
        return;
      }
      this.list.removeAttribute('aria-hidden');
      if (this.emptyState) this.emptyState.hidden = true;
      this.templates.forEach((tpl, idx) => {
        const li = document.createElement('li');
        li.className = 'library-item';
        li.setAttribute('role', 'listitem');
        const info = document.createElement('div');
        info.className = 'library-item-info';
        const name = document.createElement('span');
        name.className = 'library-item-name';
        name.textContent = tpl.label || tpl.tag || `Cable ${idx + 1}`;
        info.appendChild(name);
        const detail = document.createElement('span');
        detail.className = 'library-item-detail';
        const from = tpl.from_tag ? `From ${tpl.from_tag}` : '';
        const to = tpl.to_tag ? `to ${tpl.to_tag}` : '';
        detail.textContent = [from, to].filter(Boolean).join(' ');
        if (detail.textContent) info.appendChild(detail);
        li.appendChild(info);
        const actions = document.createElement('div');
        actions.className = 'library-item-actions';
        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'btn';
        applyBtn.textContent = 'Add to Schedule';
        applyBtn.setAttribute('data-action', 'apply');
        applyBtn.setAttribute('data-index', idx);
        applyBtn.setAttribute('aria-label', `Add ${name.textContent} to schedule`);
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn';
        editBtn.textContent = 'Edit';
        editBtn.setAttribute('data-action', 'edit');
        editBtn.setAttribute('data-index', idx);
        editBtn.setAttribute('aria-label', `Edit ${name.textContent}`);
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.setAttribute('data-action', 'delete');
        deleteBtn.setAttribute('data-index', idx);
        deleteBtn.setAttribute('aria-label', `Delete ${name.textContent}`);
        actions.appendChild(applyBtn);
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        li.appendChild(actions);
        this.list.appendChild(li);
      });
    }

    showList() {
      this.mode = 'list';
      this.editIndex = -1;
      this.fieldMap = new Map();
      if (this.form) {
        this.form.hidden = true;
        this.form.classList.add('hidden');
        this.form.setAttribute('aria-hidden', 'true');
      }
      if (this.listView) {
        this.listView.hidden = false;
        this.listView.classList.remove('hidden');
        this.listView.removeAttribute('aria-hidden');
      }
      if (this.labelInput) this.labelInput.value = '';
      if (this.addBtn && this.modal.getAttribute('aria-hidden') === 'false') this.addBtn.focus();
    }

    startAdd() {
      this.mode = 'add';
      this.editIndex = -1;
      this.openForm({});
    }

    startEdit(index) {
      const template = this.templates[index];
      if (!template) return;
      this.mode = 'edit';
      this.editIndex = index;
      this.openForm(template);
    }

    openForm(template) {
      if (!this.form || !this.formFields) return;
      if (this.formTitle) {
        const label = template.label || template.tag || '';
        this.formTitle.textContent = this.mode === 'edit' && label ? `Edit Cable Typical – ${label}` : (this.mode === 'edit' ? 'Edit Cable Typical' : 'Add Cable Typical');
      }
      if (this.labelInput) {
        this.labelInput.value = template.label || '';
      }
      this.formFields.innerHTML = '';
      this.fieldMap = new Map();
      const { order, grouped } = this.buildGroupMap();
      order.forEach(groupName => {
        const section = document.createElement('fieldset');
        section.className = 'modal-section';
        if (groupName) {
          const legend = document.createElement('legend');
          legend.textContent = groupName;
          section.appendChild(legend);
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'modal-body';
        (grouped.get(groupName) || []).forEach(col => {
          const fieldContainer = document.createElement('div');
          fieldContainer.className = 'modal-form-field';
          const label = document.createElement('label');
          const fieldId = `cable-library-${col.key}`;
          label.setAttribute('for', fieldId);
          label.textContent = col.label;
          if (col.tooltip) label.title = col.tooltip;
          const field = this.createField(col, { rowData: template, modal: this.modal });
          field.id = fieldId;
          fieldContainer.appendChild(label);
          fieldContainer.appendChild(field);
          this.fieldMap.set(col.key, field);
          wrapper.appendChild(fieldContainer);
        });
        section.appendChild(wrapper);
        this.formFields.appendChild(section);
      });
      this.listView.hidden = true;
      this.listView.classList.add('hidden');
      this.listView.setAttribute('aria-hidden', 'true');
      this.form.hidden = false;
      this.form.classList.remove('hidden');
      this.form.setAttribute('aria-hidden', 'false');
      const focusTarget = this.labelInput || this.form.querySelector('input, select, textarea, button');
      if (focusTarget) focusTarget.focus();
    }

    gatherValues() {
      const output = {};
      this.fieldMap.forEach((field, key) => {
        if (field.multiple) {
          output[key] = Array.from(field.selectedOptions || []).map(opt => opt.value).filter(v => v !== '');
        } else {
          output[key] = field.value;
        }
      });
      const label = this.labelInput ? this.labelInput.value.trim() : '';
      if (label) output.label = label;
      return output;
    }

    saveTemplate() {
      const values = this.gatherValues();
      const next = { ...values };
      delete next.typical_id;
      if (this.mode === 'edit' && this.editIndex >= 0) {
        const existingId = this.templates[this.editIndex]?.template_id;
        next.template_id = existingId || next.template_id || generateTemplateId();
        this.templates[this.editIndex] = next;
      } else {
        next.template_id = next.template_id || generateTemplateId();
        this.templates.push(next);
      }
      dataStore.setCableTemplates(this.templates);
      this.showList();
      this.renderList();
    }

    deleteTemplate(index) {
      if (index < 0 || index >= this.templates.length) return;
      const template = this.templates[index];
      const label = template?.label || template?.tag || `Cable ${index + 1}`;
      const confirmed = window.confirm ? window.confirm(`Delete "${label}" from the cable library?`) : true;
      if (!confirmed) return;
      this.templates.splice(index, 1);
      dataStore.setCableTemplates(this.templates);
      this.renderList();
    }

    applyTemplate(index) {
      if (!this.onApply) return;
      const template = this.templates[index];
      if (!template) return;
      const copy = JSON.parse(JSON.stringify(template));
      delete copy.label;
      delete copy.typical_id;
      this.onApply(copy);
    }
  }

  const libraryController = new CableLibraryController({
    columns,
    buildGroupMap,
    createField: (col, options) => createEditorField(col, null, options)
  });

  const ensureTemplateName = (template, idx) => getTemplateDisplayName(template, idx);

  const chooseTemplateForNewRow = () => {
    if (!cachedCableTemplates.length) {
      return Promise.resolve(undefined);
    }
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal typical-picker-modal';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Add Cable from Typical');
      const content = document.createElement('div');
      content.className = 'modal-content';
      const header = document.createElement('div');
      header.className = 'modal-header';
      const title = document.createElement('h2');
      title.textContent = 'Add Cable';
      header.appendChild(title);
      const description = document.createElement('p');
      description.textContent = 'Select a typical to prefill the new cable or start from a blank row.';
      const select = document.createElement('select');
      select.className = 'modal-select';
      select.id = 'add-cable-typical-select';
      const blankOption = document.createElement('option');
      blankOption.value = '';
      blankOption.textContent = 'Start with blank cable';
      select.appendChild(blankOption);
      cachedCableTemplates.forEach((tpl, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = ensureTemplateName(tpl, idx);
        select.appendChild(opt);
      });
      const footer = document.createElement('div');
      footer.className = 'modal-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn';
      cancelBtn.textContent = 'Cancel';
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn primary-btn';
      addBtn.textContent = 'Add Cable';
      footer.appendChild(cancelBtn);
      footer.appendChild(addBtn);
      const body = document.createElement('div');
      body.className = 'modal-body';
      body.appendChild(description);
      body.appendChild(select);
      content.appendChild(header);
      content.appendChild(body);
      content.appendChild(footer);
      overlay.appendChild(content);
      document.body.appendChild(overlay);
      document.body.classList.add('modal-open');
      let resolved = false;
      const cleanup = result => {
        if (resolved) return;
        resolved = true;
        document.body.classList.remove('modal-open');
        document.removeEventListener('keydown', handleKey);
        overlay.remove();
        resolve(result);
      };
      const handleKey = e => {
        const trap = typeof window.trapFocus === 'function' ? window.trapFocus : (typeof trapFocus === 'function' ? trapFocus : null);
        if (trap) trap(e, content);
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup(null);
        } else if (e.key === 'Enter' && document.activeElement === select) {
          e.preventDefault();
          addBtn.click();
        }
      };
      document.addEventListener('keydown', handleKey);
      overlay.addEventListener('click', e => {
        if (e.target === overlay) cleanup(null);
      });
      cancelBtn.addEventListener('click', () => cleanup(null));
      addBtn.addEventListener('click', () => {
        const value = select.value;
        if (!value) {
          cleanup(undefined);
          return;
        }
        const idx = Number(value);
        if (Number.isNaN(idx)) {
          cleanup(undefined);
          return;
        }
        const sourceTemplate = cachedCableTemplates[idx];
        if (!sourceTemplate) {
          cleanup(undefined);
          return;
        }
        const template = sanitizeTemplate(sourceTemplate);
        template.template_id = sourceTemplate.template_id;
        cleanup(template || undefined);
      });
      setTimeout(() => {
        select.focus();
      }, 0);
    });
  };

  // Retrieve existing cables from project storage.
  let tableData = dataStore.getCables();
  console.log('Initial cable data from store:', tableData);
  const DEFAULT_VD_LIMIT = 3;
  const getVoltageDropLimit = () => DEFAULT_VD_LIMIT;

  function applySizingHighlight(){
    const limit = getVoltageDropLimit();
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
        if (Number.isFinite(limit) && res.voltageDrop > limit) {
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

  const table = createTable({
    tableId:'cableScheduleTable',
    storageKey:STORAGE_KEYS.cableSchedule,
    addRowBtnId:'add-row-btn',
    saveBtnId:'save-schedule-btn',
    loadBtnId:'load-schedule-btn',
    clearFiltersBtnId:'clear-filters-btn',
    exportBtnId:'export-xlsx-btn',
    importInputId:'import-xlsx-input',
    importBtnId:'import-xlsx-btn',
    deleteAllBtnId:'delete-all-btn',
    selectable:true,
    columns,
    onView:(row,tr)=>openEditor(row,tr,table),
    onChange:() => {
      console.log('Table changed');
      const data = table.getData();
      suppressCablesUpdate = true;
      dataStore.setCables(data); // auto-persist edits
      suppressCablesUpdate = false;
      tableData = data;
      markUnsaved();
      applySizingHighlight();
      validateAllRows();
      updateBatchTypicalControls();
    },
    onSave:() => {
      console.log('Save triggered');
      markSaved();
      tableData = table.getData();
      dataStore.setCables(tableData); // persist only when user saves
      dataStore.saveProject(projectId);
    }
  });
  console.log('Cable schedule table created', table);
  tableInstance = table;
  window.cableScheduleTable = table;

  const addRowFromTemplate = templateValues => {
    if (!tableInstance) return null;
    const templateId = templateValues?.template_id || templateValues?.typical_id || '';
    const templateCopy = sanitizeTemplate(templateValues || {});
    if (templateCopy.tag) {
      const ids = tableInstance.getData().map(r => r.tag).filter(Boolean);
      templateCopy.tag = generateId(ids, templateCopy.tag);
    }
    delete templateCopy.template_id;
    templateCopy.typical_id = templateId;
    const tr = tableInstance.addRow(templateCopy);
    if (typeof tableInstance.onChange === 'function') {
      tableInstance.onChange();
    }
    return tr;
  };

  const addRowBtn = document.getElementById('add-row-btn');
  if (addRowBtn) {
    addRowBtn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopImmediatePropagation();
      console.log('Button add-row-btn clicked');
      const template = await chooseTemplateForNewRow();
      if (template === null) return;
      if (template) {
        addRowFromTemplate(template);
      } else {
        table.addRow();
        if (typeof table.onChange === 'function') table.onChange();
      }
    }, { capture: true });
  }

  libraryController.setApplyHandler(template => {
    if (!tableInstance) return;
    addRowFromTemplate(template);
  });

  batchTypicalSelect = document.getElementById('batch-typical-select');
  applyTypicalBtn = document.getElementById('apply-typical-selected-btn');
  typicalFilterSelect = document.getElementById('typical-filter-select');

  if (batchTypicalSelect) {
    batchTypicalSelect.addEventListener('change', () => {
      updateBatchActionState();
    });
  }

  if (applyTypicalBtn) {
    applyTypicalBtn.addEventListener('click', () => {
      if (!tableInstance || !batchTypicalSelect) return;
      const templateId = batchTypicalSelect.value;
      if (!templateId) return;
      const template = cachedCableTemplates.find(tpl => tpl.template_id === templateId);
      if (!template) return;
      const rows = tableInstance.getSelectedRows();
      if (!rows.length) return;
      const templateValues = sanitizeTemplate(template);
      const templateAssociation = template.template_id || '';
      rows.forEach(tr => {
        const current = tableInstance.getRowData(tr);
        const merged = mergeTemplateValues(templateValues, current, { preserveKeys: ['tag'], overwriteExisting: true });
        merged.typical_id = templateAssociation;
        delete merged.template_id;
        tableInstance.applyValuesToRow(tr, merged, { skipUndefined: true });
      });
      tableInstance.applyFilters();
      updateBatchTypicalControls();
    });
  }

  if (typicalFilterSelect) {
    typicalFilterSelect.addEventListener('change', () => {
      applyTypicalFilter();
    });
  }

  if (table.tbody) {
    table.tbody.addEventListener('change', e => {
      if (e.target && e.target.classList && e.target.classList.contains('row-select')) {
        updateBatchActionState();
      }
    });
  }
  if (table.selectAll) {
    table.selectAll.addEventListener('change', () => {
      updateBatchActionState();
    });
  }

  const clearFiltersBtn = document.getElementById('clear-filters-btn');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      if (typicalFilterSelect) {
        typicalFilterSelect.value = '';
      }
      applyTypicalFilter();
    });
  }

  updateBatchTypicalControls();

  const presetSelect = document.getElementById('cable-preset-select');
  const presetStorageKey = dataStore.STORAGE_KEYS.cableSchedulePreset;
  const readStoredPreset = () => {
    let stored = DEFAULT_PRESET;
    try {
      stored = dataStore.getItem(presetStorageKey, DEFAULT_PRESET) || DEFAULT_PRESET;
    } catch (e) {
      console.error('Failed to load cable schedule preset', e);
    }
    return PRESETS[stored] ? stored : DEFAULT_PRESET;
  };
  const applyPreset = (name, persist = true) => {
    const presetName = PRESETS[name] ? name : DEFAULT_PRESET;
    const visibleGroups = new Set(PRESETS[presetName].groups);
    groupNames.forEach(groupName => {
      const hide = !visibleGroups.has(groupName);
      table.setGroupVisibility(groupName, hide);
    });
    if (persist) {
      try {
        dataStore.setItem(presetStorageKey, presetName);
      } catch (e) {
        console.error('Failed to store cable schedule preset', e);
      }
    }
    if (presetSelect && presetSelect.value !== presetName) {
      presetSelect.value = presetName;
    }
    if (typeof table.saveGroupState === 'function') {
      table.saveGroupState();
    }
  };
  if (presetSelect) {
    presetSelect.addEventListener('change', e => {
      applyPreset(e.target.value);
    });
  }
  const initialPreset = readStoredPreset();
  applyPreset(initialPreset, false);
  if (presetSelect) {
    presetSelect.value = initialPreset;
  }

  const debugButtons = [
    'add-row-btn',
    'save-schedule-btn',
    'load-schedule-btn',
    'clear-filters-btn',
    'export-xlsx-btn',
    'import-xlsx-btn',
    'delete-all-btn',
    'load-sample-cables-btn',
    'cable-library-btn'
  ];
  debugButtons.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => console.log(`Button ${id} clicked`));
    } else {
      console.warn(`Debug: Button with id '${id}' not found`);
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
    updateBatchTypicalControls();
  };

  // Ensure the table is populated with any existing data on load.
  table.setData(tableData);

  // If no saved data exists, display a single empty row so the table isn't blank
  if (!tableData || tableData.length === 0) {
    table.addRow();
  }

  applySizingHighlight();
  validateAllRows();

  // Update the table whenever cables are modified elsewhere (e.g. One-Line).
  dataStore.on(dataStore.STORAGE_KEYS.cables, cables => {
    console.log('dataStore cables updated', cables);
    if (suppressCablesUpdate) return;
    table.setData(cables || []);
    tableData = cables || [];
    applySizingHighlight();
    validateAllRows();
    markSaved();
  });

  document.getElementById('load-sample-cables-btn').addEventListener('click', async () => {
    console.log('load-sample-cables-btn clicked');
    try {
      const res = await fetch('./examples/sampleCables.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Sample cables request failed: ${res.status}`);
      const sampleCables = await res.json();
      let sampleTemplates = [];
      try {
        const tplRes = await fetch('./examples/sampleCableTemplates.json', { cache: 'no-store' });
        if (tplRes.ok) {
          sampleTemplates = await tplRes.json();
        } else {
          console.warn('Sample cable templates request failed', tplRes.status);
        }
      } catch (templateError) {
        console.warn('Failed to load sample cable templates', templateError);
      }
      table.setData(sampleCables); // immediately display the sample rows
      tableData = sampleCables;
      table.save();
      validateAllRows();
      markSaved();
      if (Array.isArray(sampleTemplates) && sampleTemplates.length) {
        const { templates: normalized } = ensureTemplateIds(sampleTemplates);
        dataStore.setCableTemplates(normalized);
      }
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
  window.dispatchEvent(new Event('cableschedule-ready'));
  window.__CableScheduleInitOK = true;
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initCableSchedule, { once: true });
} else {
  initCableSchedule();
}

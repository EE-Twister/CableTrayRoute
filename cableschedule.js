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
  // Never clear browser storage from URL parameters.
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
import { openModal, showAlertModal } from './src/components/modal.js';
import { start as startTour } from './tour.js';
import {
  applyCableImport,
  getCableEndpointOptions,
  previewCableImport,
  summarizeCableWorkflow
} from './analysis/scheduleWorkflow.mjs';
import { openOneLineProbe } from './src/crossProbe.js';
import {
  READINESS_VOCABULARY,
  getContractReadinessCopy
} from './src/workflowStatus.js';
const { sizeToArea } = ampacity;
const CABLE_READINESS_COPY = getContractReadinessCopy('cableschedule.html');

const CABLE_TOUR_STEPS = [
  { selector: '#add-row-btn',            message: 'Click "Add Cable" to create your first cable entry. Each cable needs a Tag, source/destination endpoints, conductor size, and voltage rating.' },
  { selector: '#cableScheduleTable',     message: 'Fill in the cable schedule. Every row is one cable. The "Route Preference" column lets you assign a cable to a specific tray or conduit ID.' },
  { selector: '#load-sample-cables-btn', message: 'New here? Click "Load Sample Data" to populate 3 example cables so you can explore the workflow right away.' },
  { selector: '#auto-route-all-btn',     message: 'Once cables and raceways are defined, use "Route All" to send every cable to the Optimal Route tool automatically.' },
  { selector: '#export-xlsx-btn',        message: 'Export to Excel at any time to share your cable schedule or back it up offline.' }
];

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
  const projectId = window.currentProjectId;
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
  let suppressCablesUpdate = false;
  const markSaved = () => { saved = true; };
  const markUnsaved = () => { saved = false; };
  window.addEventListener('beforeunload', e => {
    if (!saved) { e.preventDefault(); e.returnValue = ''; }
  });

  const INSULATION_TEMP_LIMIT = {
    THHN:90,XLPE:90,PVC:75,XHHW:90,'XHHW-2':90,'THWN-2':90,THW:75,THWN:75,TW:60,UF:60
  };
  const conductorSizes = ['#22 AWG','#20 AWG','#18 AWG','#16 AWG','#14 AWG','#12 AWG','#10 AWG','#8 AWG','#6 AWG','#4 AWG','#3 AWG','#2 AWG','#1 AWG','1/0 AWG','2/0 AWG','3/0 AWG','4/0 AWG','250 kcmil','300 kcmil','350 kcmil','400 kcmil','500 kcmil','600 kcmil','750 kcmil','1000 kcmil'];
  const cableTypes = ['Power','Control','Signal','Data','Fiber'];
  const conductorMaterials = ['Copper','Aluminum'];
  const insulationRatings = ['60','75','90'];
  const terminalTempRatings = ['','60','75','90'];
  const shieldingOptions = ['', 'Lead', 'Copper Tape'];
  const installMethods = ['Conduit','Tray','Direct Buried'];

  function getRacewayOptions(){
    const ids = new Set();
    try{ dataStore.getTrays().forEach(t=>{ if(t.tray_id) ids.add(t.tray_id); }); }catch(e){ console.warn('getRacewayOptions: failed to read trays', e); }
    try{ dataStore.getConduits().forEach(c=>{
      const id=c.tray_id||(c.ductbank_id&&c.conduit_id?`${c.ductbank_id}-${c.conduit_id}`:c.conduit_id);
      if(id) ids.add(id);
    }); }catch(e){ console.warn('getRacewayOptions: failed to read conduits', e); }
    try{ dataStore.getDuctbanks().forEach(db=>{
      const dbId=db.ductbank_id||db.id||db.tag;
      (db.conduits||[]).forEach(c=>{
        const id=c.tray_id||(dbId&&c.conduit_id?`${dbId}-${c.conduit_id}`:c.conduit_id);
        if(id) ids.add(id);
      });
    }); }catch(e){ console.warn('getRacewayOptions: failed to read ductbanks', e); }
    return Array.from(ids);
  }

  function getPanelOptions(){
    const ids=new Set();
    try{ dataStore.getPanels().forEach(p=>{ if(p.panel_id) ids.add(p.panel_id); }); }catch(e){ console.warn('getPanelOptions: failed to read panels', e); }
    return Array.from(ids);
  }

  function getEquipmentOptions(){
    let equipment = [];
    let loads = [];
    let panels = [];
    try{
      equipment = dataStore.getEquipment();
    }catch(e){ console.warn('getEquipmentOptions: failed to read equipment', e); }
    try{
      loads = dataStore.getLoads();
    }catch(e){ console.warn('getEquipmentOptions: failed to read loads', e); }
    try{
      panels = dataStore.getPanels();
    }catch(e){ console.warn('getEquipmentOptions: failed to read panels', e); }
    return getCableEndpointOptions({ equipment, loads, panels });
  }

  function attachControlModal(buttonId, containerId, options = {}) {
    const trigger = document.getElementById(buttonId);
    const container = document.getElementById(containerId);
    if (!trigger || !container) return;
    const modalTitle = options.title || trigger.textContent?.trim() || 'Settings';
    const modalDescription = options.description || '';
    const focusSelector = options.initialFocusSelector || 'select, button, input, textarea';
    trigger.addEventListener('click', () => {
      const parent = container.parentElement;
      if (!parent) return;
      const placeholder = document.createComment(`${containerId}-placeholder`);
      parent.insertBefore(placeholder, container);
      container.classList.remove('visually-hidden');
      container.removeAttribute('aria-hidden');
      trigger.setAttribute('aria-expanded', 'true');
      const resolveInitialFocus = () => {
        if (typeof options.getInitialFocus === 'function') {
          const custom = options.getInitialFocus(container);
          if (custom instanceof HTMLElement) return custom;
        }
        const auto = container.querySelector(focusSelector);
        return auto instanceof HTMLElement ? auto : null;
      };
      openModal({
        title: modalTitle,
        description: modalDescription,
        primaryText: options.primaryText || 'Close',
        secondaryText: null,
        closeLabel: options.closeLabel || `Close ${modalTitle}`,
        render(body) {
          body.appendChild(container);
          return resolveInitialFocus();
        },
        onSubmit: () => true
      }).finally(() => {
        container.setAttribute('aria-hidden', 'true');
        container.classList.add('visually-hidden');
        const targetParent = placeholder.parentNode || parent;
        targetParent.insertBefore(container, placeholder);
        placeholder.remove();
        trigger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function createOneLineIcon(){
    const img = document.createElement('img');
    img.src = 'icons/oneline.svg';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.className = 'control-icon';
    img.loading = 'lazy';
    img.decoding = 'async';
    return img;
  }

  function decorateCableCrossProbeActions(activeTable){
    if (!activeTable?.tbody) return;
    Array.from(activeTable.tbody.rows).forEach(row => {
      const actionCell = row.querySelector('.row-action-group') || row.querySelector('.sticky-action-col');
      if (!actionCell || actionCell.querySelector('.cross-probe-link')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cross-probe-link cross-probe-link--icon';
      button.title = 'Show cable on the one-line';
      button.setAttribute('aria-label', 'Show cable on the one-line');
      button.appendChild(createOneLineIcon());
      button.addEventListener('click', e => {
        e.stopPropagation();
        openOneLineProbe(activeTable.getRowData(row), { probeType: 'cable' });
      });
      actionCell.prepend(button);
    });
  }

  const columns=[
    {key:'tag',label:'Tag',type:'text',group:'Identification',tooltip:'Unique identifier for the cable',sticky:'left',placeholder:'CBL-001'},
    {key:'service_description',label:'Service Description',type:'text',group:'Identification',tooltip:"Description of the cable's purpose"},
    {key:'from_tag',label:'From Tag',type:'text',datalist:()=>getEquipmentOptions(),group:'Terminations',tooltip:'Starting equipment or location tag',sticky:'left'},
    {key:'to_tag',label:'To Tag',type:'text',datalist:()=>getEquipmentOptions(),group:'Terminations',tooltip:'Ending equipment or location tag',sticky:'left'},
    {key:'raceway_ids',label:'Raceway(s)',type:'select',multiple:true,size:5,options:()=>getRacewayOptions(),group:'Terminations',tooltip:'Select raceway IDs from Raceway Schedule'},
    {key:'panel_id',label:'Panel ID',type:'text',datalist:()=>getPanelOptions(),group:'Terminations',tooltip:'Panel identifier from Panel Schedule'},
    {key:'circuit_number',label:'Circuit #',type:'number',group:'Terminations',tooltip:'Circuit number from Panel Schedule'},
    {key:'start_x',label:'Start X',type:'number',group:'Routing Details',tooltip:'X-coordinate of cable start'},
    {key:'start_y',label:'Start Y',type:'number',group:'Routing Details',tooltip:'Y-coordinate of cable start'},
    {key:'start_z',label:'Start Z',type:'number',group:'Routing Details',tooltip:'Z-coordinate of cable start'},
    {key:'end_x',label:'End X',type:'number',group:'Routing Details',tooltip:'X-coordinate of cable end'},
    {key:'end_y',label:'End Y',type:'number',group:'Routing Details',tooltip:'Y-coordinate of cable end'},
    {key:'end_z',label:'End Z',type:'number',group:'Routing Details',tooltip:'Z-coordinate of cable end'},
    {key:'zone',label:'Cable Zone',type:'number',group:'Routing Details',tooltip:'Routing zone or area number'},
    {key:'manual_path',label:'Manual Path',type:'text',datalist:()=>getRacewayOptions(),group:'Routing Details',tooltip:'Tray IDs separated by > to override route'},
    {key:'circuit_group',label:'Circuit Group',type:'number',group:'Routing Details',tooltip:'Circuit grouping number'},
    {key:'allowed_cable_group',label:'Allowed Group',type:'text',group:'Routing Details',tooltip:'Permitted cable grouping identifier'},
    {key:'manufacturer',label:'Manufacturer',type:'text',group:'Manufacturer Details',tooltip:'Manufacturer or vendor for this cable'},
    {key:'model',label:'Model #',type:'text',group:'Manufacturer Details',tooltip:'Manufacturer model number or catalog reference'},
    {key:'ambient_temp',label:'Ambient Temp (°C)',type:'number',group:'Manufacturer Details',tooltip:'Ambient temperature for sizing'},
    {key:'insulation_thickness',label:'Insul Thick (in)',type:'number',group:'Manufacturer Details',tooltip:'Insulation thickness in inches'},
    {key:'cable_od',label:'Cable O.D. (in)',type:'number',group:'Manufacturer Details',tooltip:'Outside diameter of the cable in inches'},
    {key:'shielding_jacket',label:'Shielding/Jacket',type:'select',options:shieldingOptions,group:'Manufacturer Details',tooltip:'Shielding or outer jacket type'},
    {key:'cable_rating',label:'Cable Rating (V)',type:'number',group:'Manufacturer Details',tooltip:'Maximum voltage rating'},
    {key:'cable_type',label:'Cable Type',type:'select',options:cableTypes,group:'Cable Construction',tooltip:'Category such as Power, Control, or Signal'},
    {key:'conductors',label:'Conductors',type:'number',group:'Cable Construction',tooltip:'Number of conductors within the cable'},
    {key:'conductor_size',label:'Conductor Size',type:'select',options:conductorSizes,group:'Cable Construction',tooltip:'Size of each conductor'},
    {key:'conductor_material',label:'Conductor Material',type:'select',options:conductorMaterials,group:'Cable Construction',tooltip:'Material of the conductors'},
    {key:'ground_size',label:'EGC Size',type:'select',options:conductorSizes,group:'Cable Construction',tooltip:'Equipment grounding conductor size used for NEC 250.122 screening'},
    {key:'ground_material',label:'EGC Material',type:'select',options:conductorMaterials,group:'Cable Construction',tooltip:'Equipment grounding conductor material. The DRC currently screens selected copper EGC sizes.'},
    {key:'install_method',label:'Install Method',type:'select',options:installMethods,group:'Cable Construction',tooltip:'Installation method'},
    {key:'insulation_type',label:'Insulation Type',type:'select',options:Object.keys(INSULATION_TEMP_LIMIT),group:'Cable Construction',tooltip:'Insulation material type'},
    {key:'insulation_rating',label:'Insul Rating (°C)',type:'select',options:insulationRatings,group:'Cable Construction',tooltip:'Maximum temperature rating of insulation'},
    {key:'parallel_count',label:'Parallel Runs',type:'number',group:'Cable Construction',min:1,step:1,tooltip:'Number of identical cables run in parallel for this circuit (e.g. 3 × 240 kcmil in parallel). Tray fill and ampacity are multiplied by this count.'},
    {key:'operating_voltage',label:'Operating Voltage (V)',type:'number',group:'Electrical Entry',tooltip:'Nominal operating voltage'},
    {key:'est_load',label:'Est Load (A)',type:'number',group:'Electrical Entry',tooltip:'Estimated operating current'},
    {key:'ocpd_rating',label:'OCPD Rating (A)',type:'number',group:'Electrical Entry',tooltip:'Overcurrent protective device rating used for NEC 240.4/250.122 screening'},
    {key:'terminal_temp_rating',label:'Terminal Temp (C)',type:'select',options:terminalTempRatings,group:'Electrical Entry',tooltip:'Equipment terminal temperature rating for NEC 110.14(C); blank lets DRC infer 60C through 100A and 75C above 100A'},
    {key:'duty_cycle',label:'Duty Cycle (%)',type:'number',group:'Electrical Entry',tooltip:'Duty cycle percentage'},
    {key:'length',label:'Length (ft)',type:'number',group:'Electrical Entry',tooltip:'Length of cable run'},
    {key:'load_flow_current',label:'Load Flow Current (A)',type:'text',group:'Calculations',tooltip:'Current captured from the latest load flow study'},
    {key:'calc_ampacity',label:'Calc Ampacity (A)',type:'number',group:'Calculations',tooltip:'Ampacity after code factors'},
    {key:'impedance',label:'Impedance (Ω)',type:'number',group:'Calculations',tooltip:'Circuit impedance used for voltage drop checks'},
    {key:'code_reference',label:'Code Ref',type:'text',group:'Calculations',tooltip:'Code table used'},
    {key:'voltage_drop_pct',label:'Estimated Voltage Drop (%)',type:'number',group:'Calculations',tooltip:'Estimated voltage drop percent'},
    {key:'sizing_warning',label:'Sizing Warning',type:'text',group:'Calculations',tooltip:'Non-compliance details'},
    {key:'notes',label:'Notes',type:'text',group:'Notes',tooltip:'Additional comments or notes'},
    {key:'engineer_note',label:'Engineer Note',type:'text',group:'Notes',tooltip:'Engineering annotation, design decision rationale, or field observation'},
    {key:'review_status',label:'Review Status',type:'select',options:['','pending','approved','flagged'],group:'Notes',tooltip:'Engineer review/approval status for this cable record'},
    {key:'last_modified',label:'Last Modified',type:'text',group:'Notes',tooltip:'Local timestamp for the most recent row edit',readOnly:true}
  ];

  const TYPICAL_EXCLUDED_GROUPS = new Set(['Identification', 'Terminations', 'Routing Details']);
  const ADDITIONAL_TEMPLATE_FIELD_EXCLUSIONS = [
    'install_method',
    'operating_voltage',
    'est_load',
    'terminal_temp_rating',
    'load_flow_current',
    'ambient_temp',
    'duty_cycle',
    'length',
    'calc_ampacity',
    'voltage_drop_pct',
    'sizing_warning',
    'review_status',
    'last_modified'
  ];
  const TYPICAL_EXCLUDED_KEYS = new Set(
    columns
      .filter(col => TYPICAL_EXCLUDED_GROUPS.has(col.group))
      .map(col => col.key)
  );
  ADDITIONAL_TEMPLATE_FIELD_EXCLUSIONS.forEach(key => TYPICAL_EXCLUDED_KEYS.add(key));

  const libraryColumns = columns.filter(
    col => !TYPICAL_EXCLUDED_GROUPS.has(col.group) && !TYPICAL_EXCLUDED_KEYS.has(col.key)
  );

  const buildTemplateHeaderConfig = cols => {
    const seen = new Set();
    const config = [];
    const add = (key, header) => {
      if (!header) return;
      let candidate = header;
      while (seen.has(candidate)) {
        candidate = `${header} (${key})`;
      }
      seen.add(candidate);
      config.push({ key, header: candidate });
    };
    add('label', 'Typical Name');
    add('template_id', 'Template ID');
    cols.forEach(col => add(col.key, col.label || col.key));
    return config;
  };

  const buildTemplateHeaderLookup = config => {
    const lookup = new Map();
    config.forEach(({ key, header }) => {
      const normalizedHeader = typeof header === 'string' ? header.trim().toLowerCase() : '';
      const normalizedKey = typeof key === 'string' ? key.trim().toLowerCase() : '';
      if (normalizedHeader && !lookup.has(normalizedHeader)) lookup.set(normalizedHeader, key);
      if (normalizedKey && !lookup.has(normalizedKey)) lookup.set(normalizedKey, key);
    });
    return lookup;
  };

  const templateHeaderConfig = buildTemplateHeaderConfig(libraryColumns);
  const templateHeaderLookup = buildTemplateHeaderLookup(templateHeaderConfig);

  const groupNames = Array.from(new Set(columns.map(col => col.group || 'General')));
  const BASIC_ENTRY_KEYS = new Set([
    'tag',
    'service_description',
    'from_tag',
    'to_tag',
    'raceway_ids',
    'panel_id',
    'circuit_number',
    'cable_type',
    'conductors',
    'conductor_size',
    'conductor_material',
    'ground_size',
    'ground_material',
    'install_method',
    'insulation_type',
    'insulation_rating',
    'parallel_count',
    'operating_voltage',
    'est_load',
    'ocpd_rating',
    'terminal_temp_rating',
    'length',
    'notes'
  ]);
  const PRESETS = {
    entry: { label: 'Basic Entry', groups: ['Identification', 'Terminations', 'Cable Construction', 'Electrical Entry', 'Notes'] },
    full: { label: 'Full Detail', groups: groupNames },
    routing: { label: 'Routing Focus', groups: ['Identification', 'Terminations', 'Routing Details', 'Notes'] },
    electrical: { label: 'Electrical Focus', groups: ['Identification', 'Cable Construction', 'Electrical Entry', 'Calculations', 'Notes'] },
    construction: { label: 'Construction Specs', groups: ['Identification', 'Cable Construction', 'Manufacturer Details', 'Notes'] }
  };
  const DEFAULT_PRESET = 'entry';
  const FIELD_HELP_TEXT = {
    tag: 'Use the project cable numbering standard. Auto tag settings can prefill this value.',
    raceway_ids: 'Required before routing. Options come from the Raceway Schedule.',
    conductor_size: 'Required for tray fill, ampacity, and voltage drop calculations.',
    ground_size: 'Used with OCPD Rating by Design Rule Checker for selected NEC 250.122 EGC screening.',
    ocpd_rating: 'Used with EGC Size and Conductor Size by Design Rule Checker for selected NEC 240.4 and 250.122 screening.',
    terminal_temp_rating: 'Optional NEC 110.14(C) termination rating. Leave blank to infer 60C through 100A equipment and 75C above 100A.',
    length: 'Required for voltage drop and route quantity checks.',
    operating_voltage: 'Used with load current for electrical sizing and review reports.',
    est_load: 'Estimated operating current for sizing checks.',
    start_x: 'Used only when routing from explicit start coordinates.',
    end_x: 'Used only when routing to explicit end coordinates.'
  };
  const STARTER_CABLE_TYPES = [
    {
      label: '600V Power',
      cable_type: 'Power',
      conductors: 3,
      conductor_size: '#12 AWG',
      conductor_material: 'Copper',
      ground_size: '#12 AWG',
      ground_material: 'Copper',
      install_method: 'Tray',
      insulation_type: 'THHN',
      insulation_rating: '90',
      terminal_temp_rating: '60',
      ocpd_rating: 20,
      cable_rating: 600,
      shielding_jacket: ''
    },
    {
      label: 'Control Cable',
      cable_type: 'Control',
      conductors: 7,
      conductor_size: '#14 AWG',
      conductor_material: 'Copper',
      install_method: 'Tray',
      insulation_type: 'PVC',
      insulation_rating: '75',
      cable_rating: 600,
      shielding_jacket: ''
    },
    {
      label: 'Instrument Pair',
      cable_type: 'Signal',
      conductors: 2,
      conductor_size: '#18 AWG',
      conductor_material: 'Copper',
      install_method: 'Tray',
      insulation_type: 'XLPE',
      insulation_rating: '90',
      cable_rating: 300,
      shielding_jacket: 'Copper Tape'
    },
    {
      label: 'Ethernet',
      cable_type: 'Data',
      conductors: 8,
      conductor_size: '#24 AWG',
      conductor_material: 'Copper',
      install_method: 'Tray',
      insulation_type: 'PVC',
      insulation_rating: '60',
      cable_rating: 300,
      shielding_jacket: ''
    },
    {
      label: 'Fiber',
      cable_type: 'Fiber',
      conductors: 12,
      conductor_size: '#22 AWG',
      conductor_material: 'Copper',
      install_method: 'Tray',
      insulation_type: 'PVC',
      insulation_rating: '60',
      cable_rating: 300,
      shielding_jacket: ''
    }
  ];

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
  const editorSaveBtn = editorModal ? editorModal.querySelector('#cable-editor-save') : null;
  const editorTitle = editorModal ? editorModal.querySelector('#cable-editor-title') : null;
  const defaultEditorTitle = editorTitle ? editorTitle.textContent : '';
  let editorFieldMap = new Map();
  let activeRow = null;
  let activeTable = null;
  let activeRowData = null;
  let activeEditorMode = 'edit';
  let activeEditorColumnFilter = null;
  let editorTypicalControls = null;
  let editorTypicalSelect = null;
  let editorSaveTypicalBtn = null;
  let batchTypicalSelect = null;
  let applyTypicalBtn = null;
  let typicalFilterSelect = null;
  let applyBatchEditBtn = null;
  let batchEditCheckboxes = [];
  let tableInstance = null;
  const modalValidationRules = [
    { key: 'length', message: 'Length must be a positive number.' },
    { key: 'calc_ampacity', message: 'Ampacity must be a positive number.' }
  ];
  const modalValidationState = { invalidFields: new Set() };

  const updateEditorSaveState = () => {
    if (!editorSaveBtn) return;
    editorSaveBtn.disabled = modalValidationState.invalidFields.size > 0;
  };

  const resetModalValidationState = () => {
    modalValidationState.invalidFields.clear();
    updateEditorSaveState();
  };

  const ensureFieldErrorElement = (field, key, message) => {
    if (!field) return null;
    const container = field.closest('.modal-form-field') || field.parentElement;
    if (!container) return null;
    let errorEl = container.querySelector(`.modal-error[data-error-for="${key}"]`);
    if (!errorEl) {
      errorEl = document.createElement('p');
      errorEl.className = 'modal-error';
      errorEl.dataset.errorFor = key;
      container.appendChild(errorEl);
    }
    errorEl.textContent = message;
    errorEl.hidden = true;
    return errorEl;
  };

  const setFieldValidity = (key, field, isValid, errorEl, message) => {
    if (!field || !errorEl) return;
    if (message) {
      errorEl.textContent = message;
    }
    if (isValid) {
      errorEl.hidden = true;
      field.classList.remove('input-error');
      field.removeAttribute('aria-invalid');
      modalValidationState.invalidFields.delete(key);
    } else {
      errorEl.hidden = false;
      field.classList.add('input-error');
      field.setAttribute('aria-invalid', 'true');
      modalValidationState.invalidFields.add(key);
    }
    updateEditorSaveState();
  };

  const attachCableModalValidation = () => {
    modalValidationRules.forEach(rule => {
      const field = editorFieldMap.get(rule.key);
      if (!field) return;
      field.setAttribute('inputmode', 'decimal');
      field.setAttribute('min', '0');
      const errorEl = ensureFieldErrorElement(field, rule.key, rule.message);
      if (!errorEl) return;
      const validate = () => {
        const raw = typeof field.value === 'string' ? field.value.trim() : '';
        const num = Number(raw);
        const isValid = raw === '' ? true : (!Number.isNaN(num) && num > 0);
        setFieldValidity(rule.key, field, isValid, errorEl, rule.message);
      };
      field.addEventListener('input', validate);
      validate();
    });
  };

  const calculateVoltageDrop = (length, current, impedance, operatingVoltage) => {
    const len = Number(length);
    const cur = Number(current);
    const imp = Number(impedance);
    const voltage = Number(operatingVoltage);
    if (!Number.isFinite(len) || !Number.isFinite(cur) || !Number.isFinite(imp) || !Number.isFinite(voltage)) return null;
    if (len <= 0 || cur <= 0 || imp <= 0 || voltage <= 0) return null;
    const dropVolts = len * cur * imp;
    return (dropVolts / voltage) * 100;
  };
  window.calculateVoltageDrop = calculateVoltageDrop;

  const attachVoltageDropAutomation = () => {
    const lengthField = editorFieldMap.get('length');
    const currentField = editorFieldMap.get('est_load');
    const impedanceField = editorFieldMap.get('impedance');
    const operatingVoltageField = editorFieldMap.get('operating_voltage');
    const voltageField = editorFieldMap.get('voltage_drop_pct');
    if (!lengthField || !currentField || !impedanceField || !operatingVoltageField || !voltageField) return;
    voltageField.readOnly = true;
    voltageField.setAttribute('aria-readonly', 'true');
    voltageField.tabIndex = -1;
    const updateVoltageDropField = () => {
      const result = calculateVoltageDrop(lengthField.value, currentField.value, impedanceField.value, operatingVoltageField.value);
      if (result === null) {
        voltageField.value = '';
      } else {
        voltageField.value = result.toFixed(2);
      }
      if (activeRowData) {
        activeRowData.voltage_drop_pct = voltageField.value;
      }
    };
    [lengthField, currentField, impedanceField, operatingVoltageField].forEach(field => {
      field.addEventListener('input', updateVoltageDropField);
      field.addEventListener('change', updateVoltageDropField);
    });
    updateVoltageDropField();
  };

  const setupEditorFieldEnhancements = () => {
    resetModalValidationState();
    attachCableModalValidation();
    attachVoltageDropAutomation();
  };

  const cloneTemplates = templates => (Array.isArray(templates) ? templates.map(t => JSON.parse(JSON.stringify(t))) : []);
  const sanitizeTemplateFieldValue = value => {
    if (value == null) return '';
    if (Array.isArray(value)) {
      return value.map(item => (item == null ? '' : `${item}`)).join(', ');
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return value;
  };
  const filterTemplateFields = (input = {}, options = {}) => {
    const { keepLabel = true, keepTypicalId = false } = options;
    const copy = { ...input };
    Object.keys(copy).forEach(key => {
      if (TYPICAL_EXCLUDED_KEYS.has(key)) {
        delete copy[key];
      }
    });
    if (!keepLabel && Object.prototype.hasOwnProperty.call(copy, 'label')) {
      delete copy.label;
    }
    if (!keepTypicalId && Object.prototype.hasOwnProperty.call(copy, 'typical_id')) {
      delete copy.typical_id;
    }
    Object.keys(copy).forEach(key => {
      copy[key] = sanitizeTemplateFieldValue(copy[key]);
    });
    return copy;
  };
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
    copies.forEach((tpl, idx) => {
      const sanitized = filterTemplateFields(tpl);
      const tplKeys = Object.keys(tpl || {});
      const sanitizedKeys = Object.keys(sanitized || {});
      if (tplKeys.length !== sanitizedKeys.length || sanitizedKeys.some(key => sanitized[key] !== tpl[key])) {
        changed = true;
      }
      if (!sanitized.template_id) {
        sanitized.template_id = generateTemplateId();
        changed = true;
      }
      copies[idx] = sanitized;
    });
    return { templates: copies, changed };
  };
  const sanitizeTemplate = template => filterTemplateFields(template, { keepLabel: false, keepTypicalId: false });
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

  const DEFAULT_TAG_SETTINGS = {
    enabled: true,
    prefix: 'CBL-',
    nextNumber: 1,
    padding: 3
  };

  const normalizeTagSettings = input => {
    const source = input && typeof input === 'object' ? input : {};
    const nextNumber = Math.max(1, parseInt(source.nextNumber, 10) || DEFAULT_TAG_SETTINGS.nextNumber);
    const padding = Math.min(8, Math.max(1, parseInt(source.padding, 10) || DEFAULT_TAG_SETTINGS.padding));
    return {
      enabled: source.enabled !== false,
      prefix: typeof source.prefix === 'string' ? source.prefix : DEFAULT_TAG_SETTINGS.prefix,
      nextNumber,
      padding
    };
  };

  let tagSettings = normalizeTagSettings(
    typeof dataStore.getCableTagSettings === 'function'
      ? dataStore.getCableTagSettings()
      : dataStore.getItem(dataStore.STORAGE_KEYS.cableTagSettings, DEFAULT_TAG_SETTINGS)
  );

  const saveTagSettings = nextSettings => {
    tagSettings = normalizeTagSettings(nextSettings);
    if (typeof dataStore.setCableTagSettings === 'function') {
      dataStore.setCableTagSettings(tagSettings);
    } else {
      dataStore.setItem(dataStore.STORAGE_KEYS.cableTagSettings, tagSettings);
    }
    updateTagSettingsControls();
  };

  const formatCableTag = (settings = tagSettings, number = settings.nextNumber) => {
    const safeNumber = Math.max(1, parseInt(number, 10) || 1);
    return `${settings.prefix || ''}${String(safeNumber).padStart(settings.padding || 1, '0')}`;
  };

  const parseGeneratedTagNumber = tag => {
    const text = `${tag || ''}`.trim();
    const prefix = tagSettings.prefix || '';
    if (!text.startsWith(prefix)) return null;
    const suffix = text.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) return null;
    return parseInt(suffix, 10);
  };

  const getExistingCableTagSet = () => {
    const tags = new Set();
    const rows = tableInstance && typeof tableInstance.getData === 'function' ? tableInstance.getData() : [];
    rows.forEach(row => {
      const value = `${row?.tag || ''}`.trim().toLowerCase();
      if (value) tags.add(value);
    });
    return tags;
  };

  const generateTagSequence = count => {
    if (!tagSettings.enabled) return { tags: Array(count).fill(''), nextNumber: tagSettings.nextNumber };
    const used = getExistingCableTagSet();
    const tags = [];
    let nextNumber = tagSettings.nextNumber;
    while (tags.length < count) {
      const tag = formatCableTag(tagSettings, nextNumber);
      nextNumber += 1;
      if (used.has(tag.toLowerCase())) continue;
      used.add(tag.toLowerCase());
      tags.push(tag);
    }
    return { tags, nextNumber };
  };

  const generateNextCableTag = () => {
    const { tags } = generateTagSequence(1);
    return tags[0] || '';
  };

  const advanceTagSettingsPastTags = tags => {
    if (!tagSettings.enabled || !Array.isArray(tags)) return;
    let max = tagSettings.nextNumber - 1;
    tags.forEach(tag => {
      const number = parseGeneratedTagNumber(tag);
      if (Number.isFinite(number)) max = Math.max(max, number);
    });
    if (max >= tagSettings.nextNumber) {
      saveTagSettings({ ...tagSettings, nextNumber: max + 1 });
    }
  };

  const CHANGE_LOG_LIMIT = 50;
  const readCableChangeLog = () => {
    const raw = typeof dataStore.getCableChangeLog === 'function'
      ? dataStore.getCableChangeLog()
      : dataStore.getItem(dataStore.STORAGE_KEYS.cableChangeLog, []);
    return Array.isArray(raw) ? raw : [];
  };
  const writeCableChangeLog = entries => {
    const normalized = Array.isArray(entries) ? entries.slice(0, CHANGE_LOG_LIMIT) : [];
    if (typeof dataStore.setCableChangeLog === 'function') {
      dataStore.setCableChangeLog(normalized);
    } else {
      dataStore.setItem(dataStore.STORAGE_KEYS.cableChangeLog, normalized);
    }
  };
  const formatDateTime = value => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };
  const recordCableChange = (action, detail = '') => {
    const entry = {
      at: new Date().toISOString(),
      action,
      detail
    };
    writeCableChangeLog([entry, ...readCableChangeLog()]);
    updateReadinessPanel();
  };

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
    const selectedCount = tableInstance && typeof tableInstance.getSelectedRows === 'function'
      ? tableInstance.getSelectedRows().length
      : 0;
    if (applyTypicalBtn) {
      const hasTemplate = batchTypicalSelect && batchTypicalSelect.value;
      applyTypicalBtn.disabled = !(hasTemplate && selectedCount > 0);
    }
    if (applyBatchEditBtn) {
      const hasCheckedField = batchEditCheckboxes.some(input => input && input.checked);
      applyBatchEditBtn.disabled = !(selectedCount > 0 && hasCheckedField);
    }
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

  const initTableSearch = () => {
    const searchInput = document.getElementById('table-search');
    if (!searchInput || !tableInstance || typeof tableInstance.setCustomFilter !== 'function') return;
    const getRowMatchesTerm = (tr, term) => {
      if (!tr || !tableInstance || !Array.isArray(tableInstance.columns)) return false;
      const offset = typeof tableInstance.colOffset === 'number' ? tableInstance.colOffset : 0;
      return tableInstance.columns.some((col, idx) => {
        const cell = tr.cells[idx + offset];
        if (!cell) return false;
        const field = cell.firstElementChild || cell.firstChild;
        if (field && typeof field.value === 'string') {
          const value = field.value.toLowerCase();
          if (value.includes(term)) return true;
          if (col.multiple && field.selectedOptions) {
            return Array.from(field.selectedOptions).some(option => option.value.toLowerCase().includes(term));
          }
          return false;
        }
        const cellText = (cell.textContent || '').toLowerCase();
        return cellText.includes(term);
      });
    };

    const applySearch = () => {
      const term = searchInput.value.trim().toLowerCase();
      if (!term) {
        tableInstance.setCustomFilter('table-search', null);
        return;
      }
      tableInstance.setCustomFilter('table-search', tr => getRowMatchesTerm(tr, term));
    };
    searchInput.addEventListener('input', applySearch);
    applySearch();
  };

  const buildGroupMapForColumns = cols => {
    const order = [];
    const grouped = new Map();
    cols.forEach(col => {
      const groupName = col.group || 'General';
      if (!grouped.has(groupName)) {
        grouped.set(groupName, []);
        order.push(groupName);
      }
      grouped.get(groupName).push(col);
    });
    return { order, grouped };
  };
  const buildGroupMap = () => buildGroupMapForColumns(columns);
  const buildLibraryGroupMap = () => buildGroupMapForColumns(libraryColumns);

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
      values.filter(v => v !== undefined && v !== null && v !== '').forEach(v => {
        const value = `${v}`;
        if (!Array.from(field.options || []).some(option => option.value === value)) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          field.appendChild(option);
        }
      });
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
    if (col.readOnly && 'readOnly' in field) {
      field.readOnly = true;
      field.setAttribute('aria-readonly', 'true');
      field.tabIndex = -1;
    }
    if (col.placeholder && 'placeholder' in field) {
      field.placeholder = col.placeholder;
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
        vals.filter(v => v !== undefined && v !== null && v !== '').forEach(v => {
          const normalizedValue = `${v}`;
          if (!Array.from(field.options || []).some(option => option.value === normalizedValue)) {
            const option = document.createElement('option');
            option.value = normalizedValue;
            option.textContent = normalizedValue;
            field.appendChild(option);
          }
        });
        Array.from(field.options || []).forEach(option => {
          option.selected = vals.map(v => `${v}`).includes(option.value);
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
    activeEditorMode = 'edit';
    activeEditorColumnFilter = null;
    if (editorTitle) editorTitle.textContent = defaultEditorTitle;
    resetModalValidationState();
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
      if (activeRow) {
        applyValuesToActiveRow(merged, { skipUndefined: false });
      } else {
        activeRowData = { ...(activeRowData || {}), ...merged };
      }
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
      const sanitizedValues = filterTemplateFields(values);
      const template = { ...sanitizedValues, label };
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

  const openEditor = (rowData, tr, tableInstance, options = {}) => {
    if (!editorModal || !editorForm || !editorBody) return;
    activeRow = tr || null;
    activeTable = tableInstance;
    activeRowData = rowData || {};
    activeEditorMode = options.mode || 'edit';
    activeEditorColumnFilter = options.columnKeys instanceof Set ? options.columnKeys : null;
    editorFieldMap = new Map();
    editorBody.innerHTML = '';
    const editorColumns = activeEditorColumnFilter
      ? columns.filter(col => activeEditorColumnFilter.has(col.key))
      : columns;
    const { order, grouped } = buildGroupMapForColumns(editorColumns);
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
      fieldsWrapper.className = 'modal-field-grid';
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
        if (FIELD_HELP_TEXT[col.key]) {
          const helper = document.createElement('p');
          helper.className = 'modal-helper-text';
          helper.id = `${fieldId}-helper`;
          helper.textContent = FIELD_HELP_TEXT[col.key];
          field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), helper.id].filter(Boolean).join(' '));
          fieldContainer.appendChild(helper);
        }
        editorFieldMap.set(col.key, field);
        fieldsWrapper.appendChild(fieldContainer);
      });
      section.appendChild(fieldsWrapper);
      editorBody.appendChild(section);
    });
    setupEditorFieldEnhancements();
    if (editorTitle) {
      const tag = activeRowData?.tag;
      editorTitle.textContent = activeEditorMode === 'new'
        ? 'Add Cable'
        : (tag ? `Cable Details - ${tag}` : (defaultEditorTitle || 'Cable Details'));
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
      const updatedValues = getEditorFieldValues();
      if (activeEditorMode === 'new') {
        if (!activeTable) {
          closeEditor();
          return;
        }
        if (activeRowData?.typical_id) updatedValues.typical_id = activeRowData.typical_id;
        updatedValues.last_modified = new Date().toISOString();
        const tr = activeTable.addRow(updatedValues);
        if (tr && updatedValues.typical_id) tr.dataset.typicalId = updatedValues.typical_id;
        advanceTagSettingsPastTags([updatedValues.tag]);
        if (typeof activeTable.onChange === 'function') {
          activeTable.onChange();
        }
        recordCableChange('Added cable', updatedValues.tag || 'New cable');
        closeEditor();
        return;
      }
      if (!activeRow || !activeTable) {
        closeEditor();
        return;
      }
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
      if (activeRow) recordCableChange('Updated cable', updatedValues.tag || activeRowData?.tag || 'Cable row');
      closeEditor();
    });
  }

  class CableLibraryController {
    constructor({
      columns: modalColumns,
      buildGroupMap: buildGroups,
      createField,
      headerConfig = templateHeaderConfig,
      headerLookup = templateHeaderLookup
    }) {
      this.columns = modalColumns;
      this.buildGroupMap = buildGroups;
      this.createField = createField;
      this.headerConfig = Array.isArray(headerConfig) && headerConfig.length ? headerConfig : templateHeaderConfig;
      this.headerLookup = headerLookup instanceof Map && headerLookup.size ? headerLookup : templateHeaderLookup;
      this.modal = document.getElementById('cable-library-modal');
      this.button = document.getElementById('cable-library-btn');
      this.closeBtn = this.modal ? this.modal.querySelector('#close-cable-library-btn') : null;
      this.addBtn = this.modal ? this.modal.querySelector('#cable-library-add-btn') : null;
      this.starterBtn = this.modal ? this.modal.querySelector('#cable-library-starter-btn') : null;
      this.exportBtn = this.modal ? this.modal.querySelector('#cable-library-export-btn') : null;
      this.importBtn = this.modal ? this.modal.querySelector('#cable-library-import-btn') : null;
      this.importInput = this.modal ? this.modal.querySelector('#cable-library-import-input') : null;
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
      if (this.starterBtn) this.starterBtn.addEventListener('click', () => this.loadStarterTemplates());
      if (this.exportBtn) this.exportBtn.addEventListener('click', () => this.exportTemplates());
      if (this.importBtn && this.importInput) {
        this.importBtn.addEventListener('click', () => {
          this.importInput.click();
        });
        this.importInput.addEventListener('change', () => {
          this.importFromFiles(this.importInput.files);
        });
      }
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

    loadStarterTemplates() {
      const existingLabels = new Set(
        (this.templates || [])
          .map(tpl => (tpl?.label || '').trim().toLowerCase())
          .filter(Boolean)
      );
      const additions = STARTER_CABLE_TYPES
        .filter(tpl => !existingLabels.has((tpl.label || '').trim().toLowerCase()))
        .map(tpl => ({ ...filterTemplateFields(tpl, { keepLabel: true }), template_id: generateTemplateId() }));
      if (!additions.length) {
        showAlertModal('Starter Types Loaded', 'The starter cable types are already in the library.');
        return;
      }
      const merged = [...(this.templates || []), ...additions];
      const { templates: normalized } = ensureTemplateIds(merged);
      dataStore.setCableTemplates(normalized);
      this.showList();
      this.renderList();
      showAlertModal('Starter Types Loaded', `${additions.length} starter cable type${additions.length === 1 ? '' : 's'} added to the library.`);
    }

    exportTemplates() {
      if (!this.templates || this.templates.length === 0) {
        showAlertModal('Notice', 'No cable typicals to export yet.');
        return;
      }
      const templatesForExport = this.templates.map(tpl =>
        filterTemplateFields(tpl, { keepLabel: true, keepTypicalId: true })
      );
      if (typeof XLSX !== 'undefined' && XLSX && typeof XLSX.utils?.aoa_to_sheet === 'function') {
        try {
          const headerConfig = this.headerConfig;
          const headerRow = headerConfig.map(cfg => cfg.header);
          const rows = templatesForExport.map(tpl =>
            headerConfig.map(({ key }) => {
              if (key === 'label') return sanitizeTemplateFieldValue(tpl.label);
              if (key === 'template_id') return sanitizeTemplateFieldValue(tpl.template_id);
              return sanitizeTemplateFieldValue(tpl[key]);
            })
          );
          const sheetData = [headerRow, ...rows];
          const sheet = XLSX.utils.aoa_to_sheet(sheetData);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, sheet, 'Cable Typicals');
          const stamp = new Date().toISOString().split('T')[0];
          XLSX.writeFile(workbook, `cable-typicals-${stamp}.xlsx`);
          return;
        } catch (err) {
          console.error('Failed to export cable typicals to Excel', err);
          showAlertModal('Export Error', 'Unable to export cable typicals to Excel.');
          return;
        }
      }
      const payload = {
        version: 1,
        generatedAt: new Date().toISOString(),
        templates: templatesForExport
      };
      let blob;
      try {
        blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      } catch (err) {
        console.error('Failed to create cable typical export blob', err);
        showAlertModal('Export Error', 'Unable to export cable typicals.');
        return;
      }
      if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        console.error('Export is not supported: missing URL.createObjectURL');
        showAlertModal('Export Error', 'Export is not supported in this environment.');
        return;
      }
      if (typeof document === 'undefined' || !document.body) {
        console.error('Export is not supported: missing document body');
        showAlertModal('Export Error', 'Export is not supported in this environment.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `cable-typicals-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 0);
    }

    async importFromFiles(fileList) {
      const resetInput = () => {
        if (this.importInput) {
          this.importInput.value = '';
        }
      };
      try {
        if (!fileList || fileList.length === 0) {
          resetInput();
          return;
        }
        const file = fileList[0];
        if (!file) {
          resetInput();
          return;
        }
        const name = (file.name || '').toLowerCase();
        const type = (file.type || '').toLowerCase();
        const isExcel = name.endsWith('.xlsx') || type.includes('spreadsheet');
        let candidates;
        if (isExcel) {
          if (typeof XLSX === 'undefined' || !XLSX || typeof XLSX.read !== 'function' || !XLSX.utils || typeof XLSX.utils.sheet_to_json !== 'function') {
            console.error('Excel import requested but XLSX library is unavailable');
            showAlertModal('Import Error', 'Excel import is not supported in this environment.');
            resetInput();
            return;
          }
          let workbook;
          try {
            const buffer = await file.arrayBuffer();
            workbook = XLSX.read(buffer, { type: 'array' });
          } catch (err) {
            console.error('Failed to read cable typical Excel file', err);
            showAlertModal('Import Error', 'Unable to import cable typicals. The Excel file could not be read.');
            resetInput();
            return;
          }
          const sheetName = workbook.SheetNames && workbook.SheetNames[0];
          if (!sheetName) {
            showAlertModal('Import Error', 'No sheets were found in the selected file.');
            resetInput();
            return;
          }
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
          if (!Array.isArray(rows) || rows.length === 0) {
            showAlertModal('Import Error', 'No cable typicals found in the selected file.');
            resetInput();
            return;
          }
          candidates = rows
            .map(row => this.normalizeExcelRow(row))
            .filter(Boolean);
        } else {
          const text = await file.text();
          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch (err) {
            console.error('Failed to parse cable typical import', err);
            showAlertModal('Import Error', 'Unable to import cable typicals. The file is not valid JSON.');
            resetInput();
            return;
          }
          candidates = Array.isArray(parsed)
            ? parsed
            : (parsed && Array.isArray(parsed.templates) ? parsed.templates : []);
        }
        if (!candidates.length) {
          showAlertModal('Import Error', 'No cable typicals found in the selected file.');
          resetInput();
          return;
        }
        const existingIds = new Set(
          (this.templates || [])
            .map(tpl => tpl && tpl.template_id)
            .filter(Boolean)
        );
        const imported = candidates
          .map(tpl => filterTemplateFields(tpl, { keepLabel: true, keepTypicalId: true }))
          .map(tpl => {
            const copy = { ...tpl };
            copy.template_id = copy.template_id || generateTemplateId();
            while (existingIds.has(copy.template_id)) {
              copy.template_id = generateTemplateId();
            }
            existingIds.add(copy.template_id);
            return copy;
          })
          .filter(tpl => Object.keys(tpl).length > 0);
        if (!imported.length) {
          showAlertModal('Import Error', 'No valid cable typicals found in the selected file.');
          resetInput();
          return;
        }
        const merged = [...(this.templates || []), ...imported];
        const { templates: normalized } = ensureTemplateIds(merged);
        dataStore.setCableTemplates(normalized);
        this.showList();
      } catch (err) {
        console.error('Unexpected error importing cable typicals', err);
        showAlertModal('Import Error', 'Unable to import cable typicals.');
      } finally {
        resetInput();
      }
    }

    normalizeExcelRow(row) {
      if (!row || typeof row !== 'object') return null;
      const normalized = {};
      Object.entries(row).forEach(([header, rawValue]) => {
        if (rawValue === undefined || rawValue === null) return;
        const key = this.resolveHeaderKey(header);
        if (!key) return;
        let value = rawValue;
        if (typeof value === 'string') {
          value = value.trim();
          if (value === '') return;
        }
        if (key === 'label') {
          normalized.label = value;
        } else if (key === 'template_id') {
          normalized.template_id = value;
        } else {
          normalized[key] = value;
        }
      });
      const sanitized = filterTemplateFields(normalized, { keepLabel: true, keepTypicalId: true });
      return Object.keys(sanitized).length ? sanitized : null;
    }

    resolveHeaderKey(header) {
      if (!header) return null;
      const normalizedHeader = String(header).trim().toLowerCase();
      if (!normalizedHeader) return null;
      return this.headerLookup.get(normalizedHeader) || null;
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
      const templateForFields = filterTemplateFields(template, { keepLabel: true });
      if (this.formTitle) {
        const label = templateForFields.label || templateForFields.tag || '';
        this.formTitle.textContent = this.mode === 'edit' && label ? `Edit Cable Typical – ${label}` : (this.mode === 'edit' ? 'Edit Cable Typical' : 'Add Cable Typical');
      }
      if (this.labelInput) {
        this.labelInput.value = templateForFields.label || '';
        this.labelInput.removeAttribute('aria-invalid');
      }
      this.formFields.innerHTML = '';
      this.fieldMap = new Map();
      const { order, grouped } = this.buildGroupMap();
      order.forEach(groupName => {
        const fields = grouped.get(groupName) || [];
        if (!fields.length) return;
        const section = document.createElement('fieldset');
        section.className = 'modal-section';
        if (groupName) {
          const legend = document.createElement('legend');
          legend.textContent = groupName;
          section.appendChild(legend);
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'cable-library-grid';
        fields.forEach(col => {
          const fieldContainer = document.createElement('div');
          fieldContainer.className = 'modal-form-field';
          const label = document.createElement('label');
          const fieldId = `cable-library-${col.key}`;
          label.setAttribute('for', fieldId);
          label.textContent = col.label;
          if (col.tooltip) label.title = col.tooltip;
          const field = this.createField(col, { rowData: templateForFields, modal: this.modal });
          field.id = fieldId;
          fieldContainer.appendChild(label);
          fieldContainer.appendChild(field);
          if (FIELD_HELP_TEXT[col.key]) {
            const helper = document.createElement('p');
            helper.className = 'modal-helper-text';
            helper.id = `${fieldId}-helper`;
            helper.textContent = FIELD_HELP_TEXT[col.key];
            field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), helper.id].filter(Boolean).join(' '));
            fieldContainer.appendChild(helper);
          }
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
      const label = this.labelInput ? this.labelInput.value.trim() : '';
      if (!label) {
        if (this.labelInput) {
          this.labelInput.setAttribute('aria-invalid', 'true');
          this.labelInput.focus();
          if (typeof this.labelInput.setCustomValidity === 'function') {
            this.labelInput.setCustomValidity('Enter a unique name for this cable typical.');
            if (typeof this.labelInput.reportValidity === 'function') {
              this.labelInput.reportValidity();
            } else {
              showAlertModal('Validation Error', 'Enter a unique name for this cable typical.');
            }
            this.labelInput.setCustomValidity('');
          } else {
            showAlertModal('Validation Error', 'Enter a unique name for this cable typical.');
          }
        }
        return;
      }
      if (this.labelInput) {
        this.labelInput.removeAttribute('aria-invalid');
      }
      const sanitized = filterTemplateFields(values, { keepLabel: true });
      const next = { ...sanitized };
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
      const sanitized = filterTemplateFields(template, { keepLabel: false, keepTypicalId: false });
      this.onApply(sanitized);
    }
  }

  const libraryController = new CableLibraryController({
    columns: libraryColumns,
    buildGroupMap: buildLibraryGroupMap,
    createField: (col, options) => createEditorField(col, null, options),
    headerConfig: templateHeaderConfig,
    headerLookup: templateHeaderLookup
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
      const rawVoltage = parseFloat(voltIn?.value);
      const rawConductors = parseInt(condIn?.value);
      const rawAmbient = parseFloat(ambIn?.value);
      const rawInsulation = parseFloat(insSel?.value);
      const load = {
        current: Math.max(0, parseFloat(loadIn.value) || 0),
        voltage: (Number.isFinite(rawVoltage) && rawVoltage > 0) ? rawVoltage : 0,
        phases: 3,
        conductors: (Number.isFinite(rawConductors) && rawConductors >= 1) ? rawConductors : 1
      };
      const params = {
        material: matSel?.value || 'cu',
        insulation_rating: (Number.isFinite(rawInsulation) && rawInsulation > 0) ? rawInsulation : 90,
        length: Math.max(0, parseFloat(lenIn?.value) || 0),
        conductors: (Number.isFinite(rawConductors) && rawConductors >= 1) ? rawConductors : 1,
        ambient: (Number.isFinite(rawAmbient) && rawAmbient > -273) ? rawAmbient : 30,
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

  function applyReviewStatusHighlight(){
    Array.from(table.tbody.querySelectorAll('tr')).forEach(tr => {
      const sel = tr.querySelector('[name="review_status"]');
      const cell = sel && sel.closest('td');
      if (!cell) return;
      cell.classList.remove('review-status-pending', 'review-status-approved', 'review-status-flagged');
      if (sel.value) cell.classList.add(`review-status-${sel.value}`);
    });
  }

  const REQUIRED_FIELD_KEYS = new Set(['tag', 'from_tag', 'to_tag', 'conductor_size', 'length']);
  const ROUTING_FIELD_KEYS = new Set(['raceway_ids']);
  const touchedRequiredFields = new WeakSet();
  const validationSummary = document.getElementById('cable-validation-summary');
  let validationActive = false;

  function getRacewayValues(el){
    if (!el) return [];
    if (typeof el.getSelectedValues === 'function') return el.getSelectedValues();
    return Array.from(el.selectedOptions || []).map(o => o.value).filter(v => v);
  }

  function isRequiredFieldValid(key, el){
    if (!el) return true;
    if (key === 'raceway_ids') return getRacewayValues(el).length > 0;
    const value = `${el.value ?? ''}`.trim();
    if (key === 'length') return value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
    return value !== '';
  }

  function isRequiredValueValid(key, row = {}){
    if (key === 'raceway_ids') {
      const value = row.raceway_ids;
      if (Array.isArray(value)) return value.filter(Boolean).length > 0;
      return `${value || ''}`.trim() !== '';
    }
    const value = `${row[key] ?? ''}`.trim();
    if (key === 'length') return value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
    return value !== '';
  }

  function getReadinessSummary(data = []){
    const counts = {
      ...summarizeCableWorkflow(data),
      latestEdit: ''
    };
    data.forEach(row => {
      const modified = row?.last_modified ? new Date(row.last_modified) : null;
      if (modified && !Number.isNaN(modified.getTime())) {
        const current = counts.latestEdit ? new Date(counts.latestEdit) : null;
        if (!current || modified > current) counts.latestEdit = modified.toISOString();
      }
    });
    return counts;
  }

  function updateReadinessPanel(dataRows = null){
    const panel = document.getElementById('routing-readiness-panel');
    if (!panel) return;
    const data = Array.isArray(dataRows)
      ? dataRows
      : (tableInstance && typeof tableInstance.getData === 'function' ? tableInstance.getData() : []);
    const summary = getReadinessSummary(data);
    const setMetric = (name, value) => {
      const el = panel.querySelector(`[data-metric="${name}"]`);
      if (el) el.textContent = `${value}`;
    };
    setMetric('total', summary.total);
    setMetric('ready', summary.scheduleReady);
    setMetric('routing-ready', summary.routingReady);
    setMetric('missing-raceway', summary.missingRaceway);
    setMetric('missing-from-to', summary.missingFromTo);
    setMetric('missing-size', summary.missingSize);
    setMetric('duplicates', summary.duplicateTags);
    const latestLog = readCableChangeLog()[0];
    const lastEdit = summary.latestEdit || latestLog?.at || '';
    setMetric('last-edit', lastEdit ? formatDateTime(lastEdit) : 'No edits yet');
    panel.classList.toggle('is-ready', summary.total > 0 && summary.routingReady === summary.total && summary.duplicateTags === 0);
    panel.classList.toggle('has-warnings', summary.missingSchedule > 0 || summary.missingRaceway > 0 || summary.duplicateTags > 0);
    updateCableNextAction(summary);
  }

  function updateCableNextAction(summary){
    const host = document.getElementById('cable-workflow-next-action');
    if (!host) return;
    let title = 'Continue to Raceway Schedule';
    let detail = 'Cable schedule rows are ready for raceway coordination and fill checks.';
    let primaryHref = 'racewayschedule.html';
    let primaryText = 'Open Raceway Schedule';
    let secondaryHref = 'workflowdashboard.html';
    let secondaryText = 'View Dashboard';

    if (summary.total === 0) {
      title = `${READINESS_VOCABULARY.missingInputs}: Add cable schedule rows`;
      detail = CABLE_READINESS_COPY?.blockers?.[0] || 'Create cables manually, import a schedule, or reconcile from the one-line before routing.';
      primaryHref = '#cableScheduleTable';
      primaryText = 'Start Cable Schedule';
      secondaryHref = 'oneline.html';
      secondaryText = 'Open One-Line';
    } else if (summary.missingSchedule > 0 || summary.duplicateTags > 0) {
      title = `${READINESS_VOCABULARY.missingInputs}: Finish schedule-ready cable fields`;
      detail = summary.missingSchedule > 0
        ? `${summary.missingSchedule} cable${summary.missingSchedule === 1 ? '' : 's'} need tag, From/To, conductor size, or length before routing.`
        : `${summary.duplicateTags} cable tag row${summary.duplicateTags === 1 ? '' : 's'} are duplicated and need review before routing.`;
      primaryHref = '#cableScheduleTable';
      primaryText = 'Review Cable Rows';
    } else if (summary.missingRaceway > 0) {
      title = `${READINESS_VOCABULARY.downstreamHandoff}: Assign raceways for routing`;
      detail = `${summary.missingRaceway} schedule-ready cable${summary.missingRaceway === 1 ? '' : 's'} still need raceway assignments.`;
      primaryHref = 'racewayschedule.html';
      primaryText = 'Open Raceway Schedule';
      secondaryHref = '#open-batch-edit-btn';
      secondaryText = 'Batch Assign';
    } else {
      title = `${READINESS_VOCABULARY.downstreamHandoff}: Continue to Raceway Schedule`;
      detail = `${READINESS_VOCABULARY.ready}: ${CABLE_READINESS_COPY?.readyWhen || 'Every workflow cable row has tag, from/to, conductor size, and length.'} ${summary.routingReady} cable${summary.routingReady === 1 ? '' : 's'} are routing-ready.`;
      primaryHref = 'cabletrayfill.html';
      primaryText = 'Run Fill Check';
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

  function updateValidationSummary(totalRows, invalidRows, showAll){
    if (!validationSummary) return;
    validationSummary.classList.remove('is-warning', 'is-success');
    if (!totalRows) {
      validationSummary.textContent = 'No cables yet. Add Cable to start.';
      return;
    }
    if (!showAll) {
      validationSummary.textContent = '';
      return;
    }
    if (invalidRows) {
      validationSummary.textContent = `${invalidRows} cable${invalidRows === 1 ? '' : 's'} need required fields before saving or exporting.`;
      validationSummary.classList.add('is-warning');
    } else {
      validationSummary.textContent = 'Required fields are complete.';
      validationSummary.classList.add('is-success');
    }
  }

  function validateRow(tr, options = {}){
    const showAll = options.showAll === true;
    let valid = true;
    REQUIRED_FIELD_KEYS.forEach(key => {
      const el = tr.querySelector(`[name="${key}"]`);
      if (!el) return;
      const ok = isRequiredFieldValid(key, el);
      const shouldShow = showAll || touchedRequiredFields.has(el);
      el.classList.toggle('missing-value', !ok && shouldShow);
      const cell = el.closest('td');
      if (cell) cell.classList.toggle('missing-value-cell', !ok && shouldShow);
      if (!ok) valid = false;
    });
    tr.classList.toggle('missing-row', !valid && showAll);
    return valid;
  }

  function highlightDuplicateTags(rows){
    const activeTable = tableInstance || table;
    if (!activeTable || !activeTable.tbody) return;
    const list = Array.isArray(rows) ? rows : Array.from(activeTable.tbody.querySelectorAll('tr'));
    const counts = new Map();
    list.forEach(tr => {
      const input = tr.querySelector('[name="tag"]');
      if (!input) return;
      const normalized = (input.value || '').trim().toLowerCase();
      if (!normalized) return;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    });
    list.forEach(tr => {
      const input = tr.querySelector('[name="tag"]');
      if (!input) return;
      const normalized = (input.value || '').trim().toLowerCase();
      const isDuplicate = normalized && counts.get(normalized) > 1;
      input.classList.toggle('duplicate-tag-input', !!isDuplicate);
      const cell = input.closest('td');
      if (cell) cell.classList.toggle('duplicate-tag-cell', !!isDuplicate);
    });
  }

  function validateAllRows(options = {}){
    const showAll = options.showAll ?? validationActive;
    const rows = Array.from(table.tbody.querySelectorAll('tr'));
    let allValid = true;
    let invalidRows = 0;
    rows.forEach(tr => {
      if(!validateRow(tr, { showAll })) {
        allValid = false;
        invalidRows += 1;
      }
    });
    highlightDuplicateTags(rows);
    updateValidationSummary(rows.length, invalidRows, showAll);
    updateReadinessPanel(rows.map(tr => {
      const activeTable = tableInstance || table;
      return activeTable && typeof activeTable.getRowData === 'function' ? activeTable.getRowData(tr) : {};
    }));
    return allValid;
  }

  function stampRowLastModified(tr, at = new Date().toISOString()){
    if (!tr) return at;
    const field = tr.querySelector('[name="last_modified"]');
    if (field) field.value = at;
    tr.dataset.lastModified = at;
    return at;
  }

  function stampRowsLastModified(rows, at = new Date().toISOString()){
    (rows || []).forEach(tr => stampRowLastModified(tr, at));
    return at;
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
    enableContextMenu:true,
    showActionColumn:true,
    columns,
    onView:(row,tr)=>openEditor(row,tr,table),
    onDuplicateRowData: row => {
      const clone = { ...row };
      const ids = table.getData().map(r => r.tag).filter(Boolean);
      clone.tag = generateId(ids, clone.tag);
      clone.last_modified = new Date().toISOString();
      return clone;
    },
    onChange:() => {
      const before = tableData ? [...tableData] : [];
      markUnsaved();
      applySizingHighlight();
      applyReviewStatusHighlight();
      validateAllRows();
      updateBatchTypicalControls();

      const data = table.getData();
      suppressCablesUpdate = true;
      dataStore.setCables(data); // auto-persist edits after recalculating derived fields
      suppressCablesUpdate = false;
      tableData = data;

      // Register undo/redo entry (skip during undo/redo restoration)
      if (!window.__isUndoRedoOp && window.__undoManager) {
        const after = [...data];
        window.__undoManager.push(
          () => {
            window.__isUndoRedoOp = true;
            table.setData(before);
            suppressCablesUpdate = true;
            dataStore.setCables(before);
            suppressCablesUpdate = false;
            tableData = [...before];
            markUnsaved();
            applySizingHighlight();
            applyReviewStatusHighlight();
            validateAllRows();
            updateBatchTypicalControls();
            window.__isUndoRedoOp = false;
          },
          () => {
            window.__isUndoRedoOp = true;
            table.setData(after);
            suppressCablesUpdate = true;
            dataStore.setCables(after);
            suppressCablesUpdate = false;
            tableData = [...after];
            markUnsaved();
            applySizingHighlight();
            applyReviewStatusHighlight();
            validateAllRows();
            updateBatchTypicalControls();
            window.__isUndoRedoOp = false;
          },
          'Edit cable schedule'
        );
      }
    },
    onSave:() => {
      validationActive = true;
      if (!validateAllRows({ showAll: true })) {
        showAlertModal('Schedule Fields Missing', 'Complete Tag, From Tag, To Tag, Conductor Size, and Length before saving. Raceway assignments can be completed later for routing-ready status.');
        markUnsaved();
        return;
      }
      markSaved();
      tableData = table.getData();
      dataStore.setCables(tableData); // persist only when user saves
      dataStore.saveProject(projectId);
      recordCableChange('Saved schedule', `${tableData.length} cable${tableData.length === 1 ? '' : 's'} saved`);
    }
  });
  tableInstance = table;
  decorateCableCrossProbeActions(table);
  window.cableScheduleTable = table;
  initTableSearch();
  validateAllRows();

  const pendingEditedTags = new Set();
  let editLogTimer = null;
  const queueEditLog = tr => {
    const tag = tr?.querySelector('[name="tag"]')?.value?.trim();
    if (tag) pendingEditedTags.add(tag);
    if (editLogTimer) window.clearTimeout(editLogTimer);
    editLogTimer = window.setTimeout(() => {
      if (!pendingEditedTags.size) return;
      const tags = Array.from(pendingEditedTags).slice(0, 3);
      const extra = pendingEditedTags.size > tags.length ? ` and ${pendingEditedTags.size - tags.length} more` : '';
      pendingEditedTags.clear();
      recordCableChange('Edited cable data', `${tags.join(', ')}${extra}`);
    }, 900);
  };

  if (table.tbody) {
    const stampUserEdit = e => {
      const target = e.target;
      if (!target || !target.name || target.name === 'last_modified') return;
      if (target.classList && target.classList.contains('row-select')) return;
      const row = target.closest('tr');
      if (!row) return;
      stampRowLastModified(row);
      queueEditLog(row);
    };
    table.tbody.addEventListener('input', stampUserEdit, true);
    table.tbody.addEventListener('change', stampUserEdit, true);
  }

  if (typeof MutationObserver !== 'undefined' && table?.tbody) {
    const observer = new MutationObserver(() => {
      validateAllRows();
      decorateCableCrossProbeActions(table);
    });
    observer.observe(table.tbody, { childList: true });
  }

  const markRequiredFieldTouched = target => {
    if (!target || !REQUIRED_FIELD_KEYS.has(target.name)) return;
    touchedRequiredFields.add(target);
    const row = target.closest('tr');
    if (row) validateRow(row, { showAll: validationActive });
    validateAllRows({ showAll: validationActive });
  };

  if (table.tbody) {
    table.tbody.addEventListener('focusout', e => markRequiredFieldTouched(e.target));
    table.tbody.addEventListener('change', e => markRequiredFieldTouched(e.target));
  }

  const saveScheduleBtn = document.getElementById('save-schedule-btn');
  if (saveScheduleBtn) {
    saveScheduleBtn.addEventListener('click', e => {
      validationActive = true;
      if (!validateAllRows({ showAll: true })) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showAlertModal('Required Fields Missing', 'Complete Tag, Conductor Size, Length, and Raceway(s) before saving.');
      }
    }, { capture: true });
  }

  const deleteAllBtn = document.getElementById('delete-all-btn');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', () => {
      const count = table.getData().length;
      if (count) recordCableChange('Deleted all cables', `${count} cable${count === 1 ? '' : 's'} removed`);
    }, { capture: true });
  }

  const openNewCableEditor = templateValues => {
    if (!tableInstance) return;
    const templateId = templateValues?.template_id || templateValues?.typical_id || '';
    const initialValues = sanitizeTemplate(templateValues || {});
    if (initialValues.tag) {
      const ids = tableInstance.getData().map(r => r.tag).filter(Boolean);
      initialValues.tag = generateId(ids, initialValues.tag);
    } else {
      initialValues.tag = generateNextCableTag();
    }
    delete initialValues.template_id;
    if (templateId) initialValues.typical_id = templateId;
    openEditor(initialValues, null, tableInstance, { mode: 'new', columnKeys: BASIC_ENTRY_KEYS });
  };

  const addRowBtn = document.getElementById('add-row-btn');
  if (addRowBtn) {
    addRowBtn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const template = await chooseTemplateForNewRow();
      if (template === null) return;
      openNewCableEditor(template || {});
    }, { capture: true });
  }

  const quickAddBtn = document.getElementById('quick-add-cables-btn');
  const createQuickAddSelect = (values, options = {}) => {
    const select = document.createElement('select');
    if (options.multiple) {
      select.multiple = true;
      select.size = options.size || 4;
    } else {
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = options.blankLabel || '';
      select.appendChild(blank);
    }
    (values || []).forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    return select;
  };

  function openQuickAddDialog() {
    const initialCount = 5;
    const generated = generateTagSequence(initialCount).tags;
    let bodyTable = null;
    const addQuickRow = (values = {}) => {
      if (!bodyTable) return null;
      const tr = bodyTable.insertRow();
      const makeCell = control => {
        const td = tr.insertCell();
        td.appendChild(control);
        return control;
      };
      const tagInput = makeCell(document.createElement('input'));
      tagInput.type = 'text';
      tagInput.name = 'tag';
      tagInput.value = values.tag || '';
      tagInput.placeholder = 'CBL-001';
      tr.dataset.initialTag = tagInput.value;

      const fromInput = makeCell(document.createElement('input'));
      fromInput.type = 'text';
      fromInput.name = 'from_tag';
      fromInput.setAttribute('list', 'batch-equipment-list');
      fromInput.value = values.from_tag || '';

      const toInput = makeCell(document.createElement('input'));
      toInput.type = 'text';
      toInput.name = 'to_tag';
      toInput.setAttribute('list', 'batch-equipment-list');
      toInput.value = values.to_tag || '';

      const typeSelect = makeCell(createQuickAddSelect(cableTypes, { blankLabel: 'Type' }));
      typeSelect.name = 'cable_type';
      typeSelect.value = values.cable_type || '';

      const sizeSelect = makeCell(createQuickAddSelect(conductorSizes, { blankLabel: 'Size' }));
      sizeSelect.name = 'conductor_size';
      sizeSelect.value = values.conductor_size || '';

      const lengthInput = makeCell(document.createElement('input'));
      lengthInput.type = 'number';
      lengthInput.step = 'any';
      lengthInput.min = '0';
      lengthInput.name = 'length';
      lengthInput.value = values.length || '';

      const racewaySelect = makeCell(createQuickAddSelect(getRacewayOptions(), { multiple: true, size: 4 }));
      racewaySelect.name = 'raceway_ids';
      const raceways = Array.isArray(values.raceway_ids) ? values.raceway_ids : [];
      Array.from(racewaySelect.options).forEach(option => {
        option.selected = raceways.includes(option.value);
      });
      return tr;
    };

    const getQuickRows = () => Array.from(bodyTable?.rows || []);
    const fillGeneratedTags = () => {
      const rows = getQuickRows();
      const sequence = generateTagSequence(rows.length).tags;
      rows.forEach((tr, idx) => {
        const input = tr.querySelector('[name="tag"]');
        if (!input) return;
        input.value = sequence[idx] || '';
        tr.dataset.initialTag = input.value;
      });
    };
    const readQuickRow = tr => {
      const row = {
        tag: tr.querySelector('[name="tag"]')?.value?.trim() || '',
        from_tag: tr.querySelector('[name="from_tag"]')?.value?.trim() || '',
        to_tag: tr.querySelector('[name="to_tag"]')?.value?.trim() || '',
        cable_type: tr.querySelector('[name="cable_type"]')?.value || '',
        conductor_size: tr.querySelector('[name="conductor_size"]')?.value || '',
        length: tr.querySelector('[name="length"]')?.value || '',
        raceway_ids: Array.from(tr.querySelector('[name="raceway_ids"]')?.selectedOptions || []).map(opt => opt.value)
      };
      const changedTagOnly = row.tag && row.tag !== (tr.dataset.initialTag || '');
      const hasProjectData = row.from_tag || row.to_tag || row.cable_type || row.conductor_size || row.length || row.raceway_ids.length;
      return (changedTagOnly || hasProjectData) ? row : null;
    };

    openModal({
      title: 'Quick Add Multiple Cables',
      description: 'Enter the core schedule fields for several cables at once.',
      primaryText: 'Add Cables',
      secondaryText: 'Cancel',
      variant: 'wide',
      render(body) {
        const toolbar = document.createElement('div');
        toolbar.className = 'quick-add-toolbar';
        const addLineBtn = document.createElement('button');
        addLineBtn.type = 'button';
        addLineBtn.className = 'btn';
        addLineBtn.textContent = 'Add Line';
        const generateBtn = document.createElement('button');
        generateBtn.type = 'button';
        generateBtn.className = 'btn';
        generateBtn.textContent = 'Generate Tags';
        toolbar.append(addLineBtn, generateBtn);

        const wrapper = document.createElement('div');
        wrapper.className = 'quick-add-table-wrap';
        const tableEl = document.createElement('table');
        tableEl.className = 'quick-add-table';
        const thead = tableEl.createTHead();
        const header = thead.insertRow();
        ['Tag', 'From', 'To', 'Cable Type', 'Conductor Size', 'Length', 'Raceway(s)'].forEach(label => {
          const th = document.createElement('th');
          th.textContent = label;
          header.appendChild(th);
        });
        bodyTable = tableEl.createTBody();
        generated.forEach(tag => addQuickRow({ tag }));
        wrapper.appendChild(tableEl);
        body.append(toolbar, wrapper);
        addLineBtn.addEventListener('click', () => addQuickRow({}));
        generateBtn.addEventListener('click', fillGeneratedTags);
        return bodyTable.querySelector('input, select');
      },
      onSubmit: () => {
        if (!tableInstance) return true;
        const rows = getQuickRows().map(readQuickRow).filter(Boolean);
        if (!rows.length) {
          showAlertModal('No Cable Rows', 'Enter at least one cable row before adding.');
          return false;
        }
        const now = new Date().toISOString();
        rows.forEach(row => {
          if (!row.tag) row.tag = generateNextCableTag();
          row.last_modified = now;
          tableInstance.addRow(row);
        });
        advanceTagSettingsPastTags(rows.map(row => row.tag));
        if (typeof tableInstance.onChange === 'function') tableInstance.onChange();
        recordCableChange('Quick added cables', `${rows.length} cable${rows.length === 1 ? '' : 's'} added`);
        return true;
      }
    });
  }
  if (quickAddBtn) quickAddBtn.addEventListener('click', openQuickAddDialog);

  libraryController.setApplyHandler(template => {
    openNewCableEditor(template);
  });

  const tagAutoEnabled = document.getElementById('tag-auto-enabled');
  const tagPrefixInput = document.getElementById('tag-prefix-input');
  const tagNextInput = document.getElementById('tag-next-input');
  const tagPaddingInput = document.getElementById('tag-padding-input');
  const tagPreview = document.getElementById('tag-settings-preview');
  const saveTagSettingsBtn = document.getElementById('save-tag-settings-btn');

  function updateTagSettingsControls() {
    if (tagAutoEnabled) tagAutoEnabled.checked = tagSettings.enabled;
    if (tagPrefixInput) tagPrefixInput.value = tagSettings.prefix;
    if (tagNextInput) tagNextInput.value = String(tagSettings.nextNumber);
    if (tagPaddingInput) tagPaddingInput.value = String(tagSettings.padding);
    if (tagPreview) {
      tagPreview.textContent = tagSettings.enabled
        ? `Next generated tag: ${formatCableTag(tagSettings)}`
        : 'Automatic tag generation is off.';
    }
  }

  const readTagSettingsControls = () => normalizeTagSettings({
    enabled: tagAutoEnabled ? tagAutoEnabled.checked : tagSettings.enabled,
    prefix: tagPrefixInput ? tagPrefixInput.value : tagSettings.prefix,
    nextNumber: tagNextInput ? tagNextInput.value : tagSettings.nextNumber,
    padding: tagPaddingInput ? tagPaddingInput.value : tagSettings.padding
  });

  const tagSettingsTrigger = document.getElementById('open-tag-settings-btn');
  if (tagSettingsTrigger) {
    tagSettingsTrigger.addEventListener('click', updateTagSettingsControls, { capture: true });
  }
  [tagAutoEnabled, tagPrefixInput, tagNextInput, tagPaddingInput].forEach(el => {
    if (!el) return;
    el.addEventListener('input', () => {
      const next = readTagSettingsControls();
      if (tagPreview) {
        tagPreview.textContent = next.enabled
          ? `Next generated tag: ${formatCableTag(next)}`
          : 'Automatic tag generation is off.';
      }
    });
    el.addEventListener('change', () => {
      const next = readTagSettingsControls();
      if (tagPreview) {
        tagPreview.textContent = next.enabled
          ? `Next generated tag: ${formatCableTag(next)}`
          : 'Automatic tag generation is off.';
      }
    });
  });
  if (saveTagSettingsBtn) {
    saveTagSettingsBtn.addEventListener('click', () => {
      saveTagSettings(readTagSettingsControls());
      recordCableChange('Updated tag settings', formatCableTag(tagSettings));
    });
  }
  attachControlModal('open-tag-settings-btn', 'tag-settings-controls', {
    title: 'Cable Tag Settings',
    description: 'Define the automatic numbering pattern used by Add Cable and Quick Add.',
    initialFocusSelector: 'input, select',
    closeLabel: 'Close tag settings dialog'
  });
  updateTagSettingsControls();

  batchTypicalSelect = document.getElementById('batch-typical-select');
  applyTypicalBtn = document.getElementById('apply-typical-selected-btn');
  typicalFilterSelect = document.getElementById('typical-filter-select');
  attachControlModal('open-typical-filter-btn', 'typical-filter-controls', {
    title: 'Filter by Typical',
    description: 'Display only cables that match the selected typical.',
    closeLabel: 'Close typical filter dialog'
  });
  attachControlModal('open-apply-typical-btn', 'apply-typical-controls', {
    title: 'Apply Cable Typical',
    description: 'Select a typical and apply it to the currently selected rows.',
    initialFocusSelector: 'select',
    closeLabel: 'Close apply typical dialog'
  });

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
        merged.last_modified = new Date().toISOString();
        delete merged.template_id;
        tableInstance.applyValuesToRow(tr, merged, { skipUndefined: true });
      });
      tableInstance.applyFilters();
      updateBatchTypicalControls();
      recordCableChange('Applied typical', `${rows.length} selected cable${rows.length === 1 ? '' : 's'}`);
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

  const batchRacewayInput = document.getElementById('batch-raceway-input');
  const batchCableTypeInput = document.getElementById('batch-cable-type-input');
  const batchVoltageInput = document.getElementById('batch-voltage-input');
  const batchFromInput = document.getElementById('batch-from-input');
  const batchToInput = document.getElementById('batch-to-input');
  const batchEquipmentList = document.getElementById('batch-equipment-list');
  applyBatchEditBtn = document.getElementById('apply-batch-edit-btn');
  batchEditCheckboxes = [
    document.getElementById('batch-set-raceway'),
    document.getElementById('batch-set-cable-type'),
    document.getElementById('batch-set-voltage'),
    document.getElementById('batch-set-from'),
    document.getElementById('batch-set-to')
  ].filter(Boolean);

  const setSelectOptions = (select, values, options = {}) => {
    if (!select) return;
    const { blankLabel = null } = options;
    const previous = Array.from(select.selectedOptions || []).map(opt => opt.value);
    select.innerHTML = '';
    if (blankLabel !== null) {
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = blankLabel;
      select.appendChild(blank);
    }
    (values || []).forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    Array.from(select.options).forEach(option => {
      option.selected = previous.includes(option.value);
    });
  };

  function populateBatchEditControls() {
    setSelectOptions(batchRacewayInput, getRacewayOptions());
    setSelectOptions(batchCableTypeInput, cableTypes, { blankLabel: 'Select cable type' });
    if (batchEquipmentList) {
      batchEquipmentList.innerHTML = '';
      getEquipmentOptions().forEach(item => {
        const option = document.createElement('option');
        option.value = item;
        batchEquipmentList.appendChild(option);
      });
    }
    updateBatchActionState();
  }

  const batchEditTrigger = document.getElementById('open-batch-edit-btn');
  if (batchEditTrigger) {
    batchEditTrigger.addEventListener('click', populateBatchEditControls, { capture: true });
  }
  attachControlModal('open-batch-edit-btn', 'batch-edit-controls', {
    title: 'Batch Edit Cables',
    description: 'Select rows in the schedule, choose the fields to update, then apply common values.',
    initialFocusSelector: 'input, select, button',
    closeLabel: 'Close batch edit dialog'
  });
  batchEditCheckboxes.forEach(input => {
    input.addEventListener('change', updateBatchActionState);
  });
  if (applyBatchEditBtn) {
    applyBatchEditBtn.addEventListener('click', () => {
      if (!tableInstance || typeof tableInstance.getSelectedRows !== 'function') return;
      const rows = tableInstance.getSelectedRows();
      if (!rows.length) return;
      const values = {};
      if (document.getElementById('batch-set-raceway')?.checked) {
        values.raceway_ids = Array.from(batchRacewayInput?.selectedOptions || []).map(opt => opt.value).filter(Boolean);
      }
      if (document.getElementById('batch-set-cable-type')?.checked) {
        values.cable_type = batchCableTypeInput ? batchCableTypeInput.value : '';
      }
      if (document.getElementById('batch-set-voltage')?.checked) {
        values.operating_voltage = batchVoltageInput ? batchVoltageInput.value : '';
      }
      if (document.getElementById('batch-set-from')?.checked) {
        values.from_tag = batchFromInput ? batchFromInput.value : '';
      }
      if (document.getElementById('batch-set-to')?.checked) {
        values.to_tag = batchToInput ? batchToInput.value : '';
      }
      values.last_modified = new Date().toISOString();
      rows.forEach(tr => {
        tableInstance.applyValuesToRow(tr, values, { skipUndefined: true });
      });
      tableInstance.applyFilters();
      updateBatchActionState();
      recordCableChange('Batch edited cables', `${rows.length} selected cable${rows.length === 1 ? '' : 's'}`);
    });
  }

  updateBatchTypicalControls();

  const presetSelect = document.getElementById('cable-preset-select');
  attachControlModal('open-view-preset-btn', 'cable-preset-controls', {
    title: 'Select View Preset',
    description: 'Choose which column groups are visible in the cable schedule.',
    closeLabel: 'Close view preset dialog'
  });
  const presetStorageKey = dataStore.STORAGE_KEYS.cableSchedulePreset;
  const readStoredPreset = () => {
    let stored = DEFAULT_PRESET;
    try {
      stored = dataStore.getItem(presetStorageKey, DEFAULT_PRESET) || DEFAULT_PRESET;
    } catch (e) {
      // Non-critical: localStorage preference unavailable; falling back to default preset
      console.warn('Failed to load cable schedule preset', e);
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
        // Non-critical: localStorage write failed; preset selection won't persist across sessions
        console.warn('Failed to store cable schedule preset', e);
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

  function generateId(existing, base) {
    let id = base || 'item';
    let i = 1;
    while (existing.includes(id)) {
      id = `${base || 'item'}_${i++}`;
    }
    return id;
  }

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

  applySizingHighlight();
  applyReviewStatusHighlight();
  validateAllRows();

  // Update the table whenever cables are modified elsewhere (e.g. One-Line).
  dataStore.on(dataStore.STORAGE_KEYS.cables, cables => {
    if (suppressCablesUpdate) return;
    table.setData(cables || []);
    tableData = cables || [];
    applySizingHighlight();
    applyReviewStatusHighlight();
    validateAllRows();
    markSaved();
  });

  document.getElementById('load-sample-cables-btn').addEventListener('click', async () => {
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
      recordCableChange('Loaded sample data', `${sampleCables.length} sample cable${sampleCables.length === 1 ? '' : 's'} loaded`);
      if (Array.isArray(sampleTemplates) && sampleTemplates.length) {
        const { templates: normalized } = ensureTemplateIds(sampleTemplates);
        dataStore.setCableTemplates(normalized);
      }
    } catch (e) {
      console.error('Failed to load sample cables', e);
    }
  });

  const normalizeImportHeader = header => String(header || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const importAliasMap = new Map([
    ['cabletag', 'tag'],
    ['cableid', 'tag'],
    ['cable', 'tag'],
    ['from', 'from_tag'],
    ['source', 'from_tag'],
    ['to', 'to_tag'],
    ['destination', 'to_tag'],
    ['tray', 'raceway_ids'],
    ['trayid', 'raceway_ids'],
    ['raceway', 'raceway_ids'],
    ['raceways', 'raceway_ids'],
    ['route', 'raceway_ids'],
    ['size', 'conductor_size'],
    ['conductorsize', 'conductor_size'],
    ['runlength', 'length'],
    ['lengthft', 'length'],
    ['voltage', 'operating_voltage'],
    ['type', 'cable_type'],
    ['cabletype', 'cable_type']
  ]);
  const importHeaderLookup = new Map();
  columns.forEach(col => {
    importHeaderLookup.set(normalizeImportHeader(col.key), col.key);
    importHeaderLookup.set(normalizeImportHeader(col.label), col.key);
  });
  importAliasMap.forEach((value, key) => importHeaderLookup.set(key, value));
  const resolveImportHeaderKey = header => importHeaderLookup.get(normalizeImportHeader(header)) || '';
  const parseImportValue = (key, value) => {
    if (value === undefined || value === null) return '';
    if (key === 'raceway_ids') {
      if (Array.isArray(value)) return value.map(v => `${v}`.trim()).filter(Boolean);
      return `${value}`.split(/[,;|>]+/).map(part => part.trim()).filter(Boolean);
    }
    return typeof value === 'string' ? value.trim() : value;
  };
  table.importXlsx = async function(file) {
    if (!file) return;
    if (typeof XLSX === 'undefined' || !XLSX?.read || !XLSX?.utils?.sheet_to_json) {
      showAlertModal('Import Error', 'Excel import is not available in this environment.');
      return;
    }
    let rows = [];
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames && workbook.SheetNames[0];
      if (!sheetName) {
        showAlertModal('Import Error', 'No sheets were found in the selected file.');
        return;
      }
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: true });
    } catch (err) {
      console.error('Failed to read cable import file', err);
      showAlertModal('Import Error', 'Unable to read the selected Excel file.');
      return;
    }
    if (!rows.length) {
      showAlertModal('Import Error', 'No cable rows were found in the selected file.');
      return;
    }
    const headers = Object.keys(rows[0] || {});
    const mappingSelects = new Map();
    let modeSelect = null;
    let previewPanel = null;
    const resolveMappings = () => Array.from(mappingSelects.entries())
      .map(([header, select]) => [header, select.value])
      .filter(([, key]) => key);
    const buildImportedRows = mappings => rows.map(source => {
      const row = {};
      mappings.forEach(([header, key]) => {
        row[key] = parseImportValue(key, source[header]);
      });
      row.last_modified = new Date().toISOString();
      return row;
    }).filter(row => Object.entries(row).some(([key, value]) => {
      if (key === 'last_modified') return false;
      return Array.isArray(value) ? value.length > 0 : `${value ?? ''}`.trim() !== '';
    }));
    const refreshImportPreview = () => {
      if (!previewPanel) return;
      const mappings = resolveMappings();
      if (!mappings.length) {
        previewPanel.textContent = 'Map at least one column to preview the import.';
        return;
      }
      const importedRows = buildImportedRows(mappings);
      const mode = modeSelect?.value || 'merge';
      const preview = previewCableImport(table.getData(), importedRows, { mode });
      previewPanel.innerHTML = `
        <p><strong>Preview:</strong> ${preview.creates} create, ${preview.updates} update, ${preview.conflicts} conflict, ${preview.unchanged} unchanged.</p>
        <p>${preview.preserved} existing rows preserved${preview.removed ? `, ${preview.removed} removed by replace mode` : ''}. Conflicts preserve existing non-empty schedule values unless you edit them after import.</p>
      `;
    };
    openModal({
      title: 'Map Cable Import',
      description: 'Match each spreadsheet column to a Cable Schedule field before importing.',
      primaryText: 'Import Rows',
      secondaryText: 'Cancel',
      variant: 'wide',
      render(body) {
        const wrapper = document.createElement('div');
        wrapper.className = 'import-mapping-grid';
        headers.forEach(header => {
          const row = document.createElement('div');
          row.className = 'import-mapping-row';
          const label = document.createElement('span');
          label.textContent = header;
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
          select.value = resolveImportHeaderKey(header);
          select.addEventListener('change', refreshImportPreview);
          mappingSelects.set(header, select);
          row.append(label, select);
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
        ].forEach(([value, label]) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = label;
          modeSelect.appendChild(option);
        });
        modeSelect.addEventListener('change', refreshImportPreview);
        modeLabel.appendChild(modeSelect);
        previewPanel = document.createElement('div');
        previewPanel.className = 'import-preview-list';
        body.append(wrapper, modeLabel, previewPanel);
        refreshImportPreview();
        return wrapper.querySelector('select');
      },
      onSubmit: () => {
        const mappings = resolveMappings();
        if (!mappings.length) {
          showAlertModal('Import Mapping Required', 'Map at least one spreadsheet column before importing.');
          return false;
        }
        const importedRows = buildImportedRows(mappings);
        if (!importedRows.length) {
          showAlertModal('Import Error', 'No usable cable data was found after mapping.');
          return false;
        }
        const mode = modeSelect?.value || 'merge';
        const nextRows = applyCableImport(table.getData(), importedRows, { mode });
        table.setData(nextRows);
        advanceTagSettingsPastTags(importedRows.map(row => row.tag));
        if (typeof table.onChange === 'function') table.onChange();
        recordCableChange('Imported cables', `${importedRows.length} cable${importedRows.length === 1 ? '' : 's'} imported from Excel using ${mode} mode`);
        return true;
      }
    });
  };

  const REPORT_MODE_LABELS = {
    visible: 'Visible Columns',
    full: 'Full Schedule',
    'routing-ready': 'Routing-Ready',
    'missing-data': 'Missing Data'
  };
  const reportModeSelect = document.getElementById('cable-report-mode');
  const reportSummary = document.getElementById('cable-report-summary');
  const reportExportBtn = document.getElementById('report-export-btn');
  const reportPrintBtn = document.getElementById('report-print-btn');
  const getReportMode = () => reportModeSelect?.value || 'visible';
  const getDuplicateTagLookup = data => {
    const counts = new Map();
    data.forEach(row => {
      const key = `${row?.tag || ''}`.trim().toLowerCase();
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  };
  const rowHasMissingData = (row, duplicateLookup = null) => {
    const missingRequired = Array.from(REQUIRED_FIELD_KEYS).some(key => !isRequiredValueValid(key, row));
    const missingRouting = Array.from(ROUTING_FIELD_KEYS).some(key => !isRequiredValueValid(key, row));
    const tag = `${row?.tag || ''}`.trim().toLowerCase();
    const duplicate = tag && duplicateLookup && duplicateLookup.get(tag) > 1;
    return missingRequired || missingRouting || duplicate;
  };
  const getReportColumns = mode => {
    if (mode !== 'visible') return columns;
    const offset = table.colOffset || 0;
    return columns.filter((col, idx) => {
      const headerCell = table.headerRow?.cells[idx + offset];
      return !headerCell || !headerCell.classList.contains('group-hidden');
    });
  };
  const getReportRows = mode => {
    const data = table.getData();
    const duplicateLookup = getDuplicateTagLookup(data);
    if (mode === 'routing-ready') {
      return data.filter(row => Array.from(REQUIRED_FIELD_KEYS).every(key => isRequiredValueValid(key, row))
        && Array.from(ROUTING_FIELD_KEYS).every(key => isRequiredValueValid(key, row)));
    }
    if (mode === 'missing-data') {
      return data.filter(row => rowHasMissingData(row, duplicateLookup));
    }
    return data;
  };
  const formatReportValue = value => {
    if (Array.isArray(value)) return value.join(', ');
    return value == null ? '' : value;
  };
  const exportCableReport = mode => {
    if (typeof XLSX === 'undefined' || !XLSX?.utils) {
      showAlertModal('Export Error', 'Excel export is not available in this environment.');
      return;
    }
    const reportMode = REPORT_MODE_LABELS[mode] ? mode : 'visible';
    const reportColumns = getReportColumns(reportMode);
    const reportRows = getReportRows(reportMode);
    const sheetData = [
      reportColumns.map(col => col.label),
      ...reportRows.map(row => reportColumns.map(col => formatReportValue(row[col.key])))
    ];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(workbook, sheet, REPORT_MODE_LABELS[reportMode].slice(0, 31));
    const stamp = new Date().toISOString().split('T')[0];
    const suffix = reportMode.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    XLSX.writeFile(workbook, `cable-schedule-${suffix}-${stamp}.xlsx`);
  };
  const renderCablePrintReport = mode => {
    const host = document.getElementById('cable-print-report');
    if (!host) return;
    const reportMode = REPORT_MODE_LABELS[mode] ? mode : 'visible';
    const reportColumns = getReportColumns(reportMode);
    const reportRows = getReportRows(reportMode);
    host.innerHTML = '';
    host.removeAttribute('aria-hidden');
    const meta = document.createElement('div');
    meta.className = 'print-report-meta';
    const title = document.createElement('strong');
    title.textContent = `Cable Schedule - ${REPORT_MODE_LABELS[reportMode]}`;
    const generated = document.createElement('span');
    generated.textContent = `Generated ${formatDateTime(new Date())}`;
    meta.append(title, generated);
    const tableEl = document.createElement('table');
    tableEl.className = 'cable-print-table';
    const thead = tableEl.createTHead();
    const header = thead.insertRow();
    reportColumns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.label;
      header.appendChild(th);
    });
    const tbody = tableEl.createTBody();
    reportRows.forEach(row => {
      const tr = tbody.insertRow();
      reportColumns.forEach(col => {
        const td = tr.insertCell();
        td.textContent = formatReportValue(row[col.key]);
      });
    });
    if (!reportRows.length) {
      const tr = tbody.insertRow();
      const td = tr.insertCell();
      td.colSpan = Math.max(1, reportColumns.length);
      td.textContent = 'No cable rows match this report.';
    }
    host.append(meta, tableEl);
  };
  const printCableReport = mode => {
    renderCablePrintReport(mode);
    window.print();
  };
  const updateReportSummary = () => {
    if (!reportSummary) return;
    const mode = getReportMode();
    const rowCount = getReportRows(mode).length;
    const columnCount = getReportColumns(mode).length;
    reportSummary.textContent = `${rowCount} row${rowCount === 1 ? '' : 's'} and ${columnCount} column${columnCount === 1 ? '' : 's'} will be included.`;
  };
  const reportTrigger = document.getElementById('open-report-options-btn');
  if (reportTrigger) reportTrigger.addEventListener('click', updateReportSummary, { capture: true });
  attachControlModal('open-report-options-btn', 'cable-report-controls', {
    title: 'Cable Report Options',
    description: 'Choose which rows and columns to export or print.',
    initialFocusSelector: 'select, button',
    closeLabel: 'Close report options dialog'
  });
  if (reportModeSelect) reportModeSelect.addEventListener('change', updateReportSummary);
  if (reportExportBtn) reportExportBtn.addEventListener('click', () => table.exportXlsx());
  if (reportPrintBtn) reportPrintBtn.addEventListener('click', () => printCableReport(getReportMode()));
  const printScheduleBtn = document.getElementById('print-schedule-btn');
  if (printScheduleBtn) printScheduleBtn.addEventListener('click', () => printCableReport(getReportMode()));
  updateReportSummary();

  const changeLogBtn = document.getElementById('open-change-log-btn');
  if (changeLogBtn) {
    changeLogBtn.addEventListener('click', () => {
      const entries = readCableChangeLog();
      openModal({
        title: 'Cable Change Log',
        description: entries.length ? 'Recent local Cable Schedule changes.' : 'No Cable Schedule changes have been recorded yet.',
        primaryText: 'Close',
        secondaryText: null,
        render(body) {
          if (!entries.length) return null;
          const list = document.createElement('ol');
          list.className = 'change-log-list';
          entries.slice(0, 20).forEach(entry => {
            const item = document.createElement('li');
            const action = document.createElement('strong');
            action.textContent = entry.action || 'Change';
            const meta = document.createElement('span');
            meta.textContent = `${formatDateTime(entry.at)}${entry.detail ? ` - ${entry.detail}` : ''}`;
            item.append(action, meta);
            list.appendChild(item);
          });
          body.appendChild(list);
          return list.querySelector('li');
        }
      });
    });
  }

  table.exportXlsx = function(){
    validationActive = true;
    const mode = getReportMode();
    if(mode !== 'missing-data' && !validateAllRows({ showAll: true })){
      showAlertModal('Required Fields Missing', 'Complete Tag, Conductor Size, Length, and Raceway(s) before exporting.');
      return;
    }
    exportCableReport(mode);
  };

  function getCableSchedule(){
    table.save();
    return table.getData();
  }
  window.getCableSchedule = getCableSchedule;

  // "Route All Cables" — count cables with coordinates and navigate to optimalRoute
  const autoRouteAllBtn = document.getElementById('auto-route-all-btn');
  if (autoRouteAllBtn) {
    autoRouteAllBtn.addEventListener('click', () => {
      const cables = getCableSchedule();
      const routable = cables.filter(c => {
        const hasStart = (parseFloat(c.start_x) || parseFloat(c.start_y) || parseFloat(c.start_z));
        const hasEnd   = (parseFloat(c.end_x)   || parseFloat(c.end_y)   || parseFloat(c.end_z));
        return hasStart && hasEnd;
      });
      const unroutable = cables.length - routable.length;

      if (cables.length === 0) {
        showAlertModal('No Cables', 'Add cables to the schedule before routing.');
        return;
      }

      const body = `${routable.length} cable${routable.length !== 1 ? 's' : ''} with ` +
        `start and end coordinates will be routed automatically.` +
        (unroutable > 0
          ? ` ${unroutable} cable${unroutable !== 1 ? 's' : ''} without coordinates will be skipped.`
          : '') +
        '\n\nOpen the Optimal Route tool and start routing?';

      openModal({
        title: 'Route All Cables',
        description: body,
        primaryText: 'Open Optimal Route →',
        secondaryText: 'Cancel',
        onPrimary: () => {
          window.location.href = 'optimalRoute.html?autoRoute=1';
        },
      });
    });
  }

  // --- Tour ---
  const tourBtn = document.getElementById('tour-btn');
  if (tourBtn) {
    tourBtn.addEventListener('click', () => startTour(CABLE_TOUR_STEPS, 'cableSchedule'));
  }

  window.dispatchEvent(new Event('cableschedule-ready'));
  window.__CableScheduleInitOK = true;
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initCableSchedule, { once: true });
} else {
  initCableSchedule();
}

// Reload the schedule whenever a remote collaborator's patch is applied
document.addEventListener('ctr:remote-applied', () => { initCableSchedule(); });

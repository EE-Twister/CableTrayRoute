// ---- Inline E2E helpers (no external import) ----
const E2E = new URLSearchParams(location.search).has('e2e');

function e2eOpenDetails() {
  if (!new URLSearchParams(location.search).has('e2e')) return;
  document.querySelectorAll('details').forEach(d => { d.open = true; });
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

import { getOneLine, setOneLine, setEquipment, setPanels, setLoads, getCables, setCables, addRaceway, getItem, setItem, getStudies, setStudies, on, getCurrentScenario, switchScenario, STORAGE_KEYS, loadProject, saveProject } from './dataStore.mjs';
import { runLoadFlow } from './analysis/loadFlow.js';
import { runShortCircuit } from './analysis/shortCircuit.mjs';
import { runArcFlash } from './analysis/arcFlash.mjs';
import { runHarmonics } from './analysis/harmonics.js';
import { runMotorStart } from './analysis/motorStart.js';
import { runReliability } from './analysis/reliability.js';
import { generateArcFlashReport } from './reports/arcFlashReport.mjs';
import { exportAllReports } from './reports/exportAll.mjs';
import { sizeConductor } from './sizing.js';
import { runValidation } from './validation/rules.js';
import { exportPDF } from './exporters/pdf.js';
import { exportDXF, exportDWG } from './exporters/dxf.js';
import { openModal } from './src/components/modal.js';
import './site.js';

let componentMeta = {};

function ensurePropModal() {
  let modal = document.getElementById('prop-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'prop-modal';
    modal.className = 'prop-modal';
    const host = document.querySelector('.oneline-editor') || document.body;
    host.appendChild(modal);
  }
  return modal;
}

const baseHref = document.querySelector('base')?.href || new URL('.', window.location.href).href;
const asset = path => new URL(path, baseHref).href;

let projectId = 'default';
if (typeof window !== 'undefined') {
  if (typeof location !== 'undefined') {
    const hash = location.hash;
    if (hash && hash.startsWith('#') && !hash.startsWith('#project=')) {
      try {
        const decoded = decodeURIComponent(hash.slice(1)).trim();
        if (decoded) projectId = decoded;
      } catch {}
    } else if (window.currentProjectId && window.currentProjectId.trim()) {
      projectId = window.currentProjectId;
    }
  } else if (window.currentProjectId && window.currentProjectId.trim()) {
    projectId = window.currentProjectId;
  }
  window.currentProjectId = projectId || 'default';
}
if (projectId) {
  loadProject(projectId);
  [STORAGE_KEYS.oneLine, STORAGE_KEYS.equipment, STORAGE_KEYS.panels, STORAGE_KEYS.loads, STORAGE_KEYS.cables, STORAGE_KEYS.trays, STORAGE_KEYS.conduits, STORAGE_KEYS.ductbanks].forEach(k => {
    on(k, () => {
      const targetId = (typeof window !== 'undefined' && window.currentProjectId) ? window.currentProjectId : projectId;
      if (targetId) saveProject(targetId);
    });
  });
}

const typeIcons = {
  panel: asset('icons/equipment.svg'),
  equipment: asset('icons/equipment.svg'),
  load: asset('icons/load.svg'),
  bus: asset('icons/Bus.svg'),
  cable: asset('icons/oneline.svg'),
  sources: asset('icons/sources.svg'),
  links: asset('icons/links.svg'),
  annotations: asset('icons/annotation.svg')
};

const placeholderIcon = asset('icons/placeholder.svg');

function hasImpedance(holder) {
  return !!(holder && holder.impedance && typeof holder.impedance === 'object');
}

function hasImpedanceValues(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(obj, 'r') || Object.prototype.hasOwnProperty.call(obj, 'x');
}

function getImpedancePart(holder, key) {
  if (!holder || !holder.impedance || typeof holder.impedance !== 'object') return '';
  const val = holder.impedance[key];
  return val === undefined || val === null ? '' : val;
}

function setImpedancePart(holder, key, value, { keepEmpty = false } = {}) {
  if (!holder || typeof holder !== 'object') return;
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '' || raw === null || raw === undefined) {
    if (holder.impedance && typeof holder.impedance === 'object') {
      delete holder.impedance[key];
      if (!keepEmpty && !hasImpedanceValues(holder.impedance)) {
        delete holder.impedance;
      }
    }
    return;
  }
  const num = typeof raw === 'number' ? raw : Number.parseFloat(raw);
  if (!Number.isFinite(num)) {
    if (holder.impedance && typeof holder.impedance === 'object') {
      delete holder.impedance[key];
      if (!keepEmpty && !hasImpedanceValues(holder.impedance)) {
        delete holder.impedance;
      }
    }
    return;
  }
  if (!holder.impedance || typeof holder.impedance !== 'object') holder.impedance = {};
  holder.impedance[key] = num;
}

function normalizeCategoryValue(value) {
  switch (value) {
    case 'bus':
    case 'equipment':
    case 'protection':
    case 'load':
    case 'sources':
    case 'links':
    case 'annotations':
    case 'cable':
      return value;
    default:
      return value ? categoryForType(value) : '';
  }
}

function clampPaletteWidth(value, fallback = defaultPaletteWidth) {
  if (value === null || value === undefined || value === '') {
    return clampPaletteWidth(fallback, defaultPaletteWidth);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return clampPaletteWidth(fallback, defaultPaletteWidth);
  }
  if (numeric < minPaletteWidth) return minPaletteWidth;
  if (numeric > maxPaletteWidth) return maxPaletteWidth;
  return numeric;
}

const compWidth = 80;
const compHeight = 40;
const attributeLineHeight = 12;
const viewAttributeStorageKey = 'diagramViewAttributes';
const defaultPaletteWidth = 250;
const minPaletteWidth = 100;
const maxPaletteWidth = 600;
const paletteWidthStorageKey = 'onelinePaletteWidth';
const customComponentStorageKey = 'customComponents';
const customComponentScenarioKey = '__ctr_custom_components__';
const customComponentPrefillStorageKey = 'ctrCustomComponentPrefill';
const paletteContextMenu = document.getElementById('palette-context-menu');

let paletteContextTarget = null;

const attributeDisplayOverrides = {
  rating: { label: 'Rating', unit: '' },
  rating_a: { label: 'Rating', unit: 'A' },
  interrupt_rating_ka: { label: 'Interrupt Rating', unit: 'kA' },
  frame_a: { label: 'Frame', unit: 'A' },
  ref: { label: 'Node Tag', unit: '' },
  voltage: { label: 'Voltage', unit: 'V' },
  volts: { label: 'Voltage', unit: 'V' },
  volts_primary: { label: 'Primary Voltage', unit: 'V' },
  volts_secondary: { label: 'Secondary Voltage', unit: 'V' },
  volts_hv: { label: 'HV Voltage', unit: 'V' },
  volts_lv: { label: 'LV Voltage', unit: 'V' },
  volts_tv: { label: 'Tertiary Voltage', unit: 'V' },
  kva: { label: 'kVA', unit: '' },
  kva_hv: { label: 'HV kVA', unit: '' },
  kva_lv: { label: 'LV kVA', unit: '' },
  kva_tv: { label: 'TV kVA', unit: '' },
  percent_z: { label: 'Impedance', unit: '%' },
  z_hv_lv_percent: { label: 'Z HV-LV', unit: '%' },
  z_hv_tv_percent: { label: 'Z HV-TV', unit: '%' },
  z_lv_tv_percent: { label: 'Z LV-TV', unit: '%' },
  thevenin_mva: { label: 'Thevenin MVA', unit: 'MVA' },
  xr_ratio: { label: 'X/R Ratio', unit: '' },
  hp: { label: 'Horsepower', unit: 'HP' },
  pf: { label: 'Power Factor', unit: '' },
  service_factor: { label: 'Service Factor', unit: '' },
  efficiency: { label: 'Efficiency', unit: '%' },
  lr_current_pu: { label: 'Locked Rotor Current (p.u.)', unit: '' },
  starting: { label: 'Starting', unit: '' },
  vfd: { label: 'VFD', unit: '' },
  length_m: { label: 'Length', unit: 'm' },
  length_ft: { label: 'Length', unit: 'ft' },
  length: { label: 'Length', unit: '' },
  voltage_class: { label: 'Voltage Class', unit: '' },
  thermal_rating: { label: 'Thermal Rating', unit: '' },
  manufacturer: { label: 'Manufacturer', unit: '' },
  model: { label: 'Model', unit: '' },
  enclosure: { label: 'Enclosure', unit: '' },
  gap: { label: 'Gap', unit: 'mm' },
  working_distance: { label: 'Working Distance', unit: 'mm' },
  clearing_time: { label: 'Clearing Time', unit: 's' },
  tccId: { label: 'TCC Device', unit: '' },
  voltage_mag: { label: 'Voltage (p.u.)', unit: '' },
  voltage_mag_a: { label: 'Voltage A (p.u.)', unit: '' },
  voltage_mag_b: { label: 'Voltage B (p.u.)', unit: '' },
  voltage_mag_c: { label: 'Voltage C (p.u.)', unit: '' },
  'arcFlash.incidentEnergy': { label: 'Arc Flash Incident Energy', unit: 'cal/cm²' },
  'arcFlash.boundary': { label: 'Arc Flash Boundary', unit: 'mm' },
  'arcFlash.ppeCategory': { label: 'Arc Flash PPE Category', unit: '' },
  'arcFlash.clearingTime': { label: 'Arc Flash Clearing Time', unit: 's' },
  'shortCircuit.method': { label: 'Short-Circuit Method', unit: '' },
  'shortCircuit.prefaultKV': { label: 'Prefault Voltage', unit: 'kV' },
  'shortCircuit.threePhaseKA': { label: 'Three-Phase Fault', unit: 'kA' },
  'shortCircuit.asymKA': { label: 'Asymmetrical Fault', unit: 'kA' },
  'shortCircuit.lineToGroundKA': { label: 'Line-to-Ground Fault', unit: 'kA' },
  'shortCircuit.lineToLineKA': { label: 'Line-to-Line Fault', unit: 'kA' },
  'shortCircuit.doubleLineGroundKA': { label: 'Double-Line-Ground Fault', unit: 'kA' },
  'reliability.availability': { label: 'Reliability Availability', unit: '' },
  'reliability.downtime': { label: 'Reliability Downtime', unit: 'h/year' }
};

const attributeIgnoreKeys = new Set([
  'id',
  'type',
  'subtype',
  'x',
  'y',
  'rotation',
  'flipped',
  'connections',
  'label',
  'labelOffset',
  'width',
  'height',
  'ports',
  'impedance',
  'props',
  'arcFlash',
  'shortCircuit',
  'reliability'
]);

let cachedStudyResults = getStudies();

const studyAttributeResolvers = {
  arcFlash: comp => {
    if (!comp) return null;
    if (comp.arcFlash && typeof comp.arcFlash === 'object') return comp.arcFlash;
    return cachedStudyResults?.arcFlash?.[comp.id] || null;
  },
  shortCircuit: comp => {
    if (!comp) return null;
    if (comp.shortCircuit && typeof comp.shortCircuit === 'object') return comp.shortCircuit;
    return cachedStudyResults?.shortCircuit?.[comp.id] || null;
  },
  reliability: comp => {
    if (!comp) return null;
    return cachedStudyResults?.reliability?.componentStats?.[comp.id] || null;
  }
};

const storedViewAttributes = getItem(viewAttributeStorageKey, []);
const initialViewAttributes = Array.isArray(storedViewAttributes)
  ? storedViewAttributes.filter(key => typeof key === 'string' && key.trim())
  : [];
let viewAttributes = new Set(initialViewAttributes);
let attributeOptions = [];
const attributeOptionsMap = new Map();
let componentAttributeOptions = new Map();
let componentAttributeList = [];
let componentAttributeLabelMap = new Map();
const viewComponentStorageKey = 'diagramViewComponentSelection';
let selectedViewComponent = getItem(viewComponentStorageKey, null);

function compKey(type, subtype) {
  return subtype ? `${type}_${subtype}` : type;
}

function normalizeRotation(angle) {
  if (!Number.isFinite(angle)) return 0;
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function defaultRotationForType(type, category) {
  const resolved = type || category;
  if (resolved === 'bus' || resolved === 'annotation') return 0;
  if (
    category === 'load' ||
    resolved === 'load' ||
    (typeof resolved === 'string' && resolved.endsWith('_load'))
  ) {
    return 270;
  }
  return 90;
}

function categoryForType(t) {
  switch (t) {
    case 'bus':
      return 'bus';
    case 'motor_load':
    case 'static_load':
      return 'load';
    case 'cable':
      return 'cable';
    case 'breaker':
    case 'fuse':
    case 'recloser':
    case 'relay':
    case 'contactor':
    case 'switch':
      return 'protection';
    case 'utility_source':
    case 'generator':
    case 'pv_inverter':
      return 'sources';
    case 'sheet_link':
      return 'links';
    case 'annotation':
      return 'annotations';
    case 'panel':
    case 'mcc':
      return 'equipment';
    default:
      return 'equipment';
  }
}

function inferSchemaFromProps(props) {
  const schema = [];
  Object.entries(props || {}).forEach(([k, v]) => {
    if (v && typeof v === 'object') return; // skip nested objects for now
    schema.push({
      name: k,
      label: k.replace(/_/g, ' '),
      type: typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'checkbox' : 'text',
      default: v
    });
  });
  return schema;
}

function isBusComponent(c) {
  return componentMeta[c.subtype]?.type === 'bus' || c.type === 'bus' || c.subtype === 'Bus';
}

function defaultPorts(type, subtype) {
  if (type === 'transformer' && subtype === 'three_winding') {
    return [
      { x: 0, y: 20 },
      { x: 80, y: 10 },
      { x: 80, y: 30 }
    ];
  }
  return [
    { x: 0, y: 20 },
    { x: 80, y: 20 }
  ];
}

function coerceNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizePortsForCategory(category, ports, type, subtype) {
  const base = Array.isArray(ports) && ports.length ? ports : defaultPorts(type, subtype);
  if (category === 'load') {
    const defaultX = compWidth;
    const defaultY = compHeight / 2;
    if (!base.length) {
      return [{ x: defaultX, y: defaultY }];
    }
    if (base.length === 1) {
      return [{
        x: coerceNumber(base[0]?.x, defaultX),
        y: coerceNumber(base[0]?.y, defaultY)
      }];
    }
    return base.map(port => ({
      x: coerceNumber(port?.x, defaultX),
      y: coerceNumber(port?.y, defaultY)
    }));
  }
  return base.map(port => ({
    x: coerceNumber(port?.x, compWidth / 2),
    y: coerceNumber(port?.y, compHeight / 2)
  }));
}

const builtinComponents = [
  {
    subtype: 'Bus',
    label: 'Bus',
    icon: typeIcons.bus || placeholderIcon,
    category: 'bus',
    type: 'bus',
    ports: [
      { x: 0, y: 20 },
      { x: 80, y: 20 }
    ]
  },
  {
    subtype: 'Panel',
    label: 'Panel',
    icon: typeIcons.panel || placeholderIcon,
    category: 'equipment',
    type: 'panel',
    ports: [
      { x: 0, y: 20 },
      { x: 80, y: 20 }
    ]
  },
  {
    subtype: 'Equipment',
    label: 'Equipment',
    icon: typeIcons.equipment || placeholderIcon,
    category: 'equipment',
    type: 'equipment',
    ports: [
      { x: 0, y: 20 },
      { x: 80, y: 20 }
    ]
  },
  {
    subtype: 'motor_load',
    label: 'Motor Load',
    icon: asset('icons/components/Motor.svg'),
    category: 'load',
    type: 'motor_load',
    defaultRotation: 0,
    ports: [
      { x: 40, y: 0 }
    ],
    props: {
      hp: 150,
      volts: 480,
      pf: 0.88,
      service_factor: 1.15,
      efficiency: 95,
      lr_current_pu: 6.0,
      starting: 'DOL',
      vfd: false,
      load: {
        kw: 117.789,
        kvar: 63.576
      }
    }
  },
  {
    subtype: 'static_load',
    label: 'Non-Motor Load',
    icon: asset('icons/components/Load.svg'),
    category: 'load',
    type: 'static_load',
    defaultRotation: 0,
    ports: [
      { x: 40, y: 0 }
    ],
    props: {
      watts: 300000,
      volts: 480,
      load: {
        kw: 300.0,
        kvar: 0
      }
    }
  },
  {
    subtype: 'Cable',
    label: 'Cable',
    icon: typeIcons.cable || placeholderIcon,
    category: 'cable',
    type: 'cable',
    ports: [
      { x: 0, y: 20 },
      { x: 80, y: 20 }
    ],
    props: {
      cable: {
        tag: '',
        cable_type: '',
        conductors: '',
        phases: '',
        conductor_size: '',
        conductor_material: '',
        insulation_type: '',
        ambient_temp: '',
        install_method: '',
        color: '#000000',
        length: '',
        manual_length: false
      }
    }
  }
];

let propSchemas = {};
let subtypeCategory = {};
let componentTypes = {};
let manufacturerDefaults = {};
let protectiveDevices = [];

let paletteWidth = clampPaletteWidth(getItem(paletteWidthStorageKey, defaultPaletteWidth));
let resizingPalette = false;

const voltageClasses = ['480 V', '5000 V', '15000 V', '25000 V'];
const thermalRatings = ['75C', '90C', '105C'];
const manufacturerModels = {
  ABB: ['MNS', 'SafeGear'],
  Siemens: ['SB1', 'S6'],
  GE: ['EntelliGuard', 'Spectra'],
  Schneider: ['QED-2', 'Blokset'],
  Caterpillar: ['XQ125', 'C175'],
  Cummins: ['C900', 'QSK60'],
  Generac: ['G2000', 'Industrial']
};


function loadStoredCustomComponents() {
  const stored = getItem(customComponentStorageKey, [], customComponentScenarioKey);
  if (!Array.isArray(stored)) return [];
  return stored
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      ...item,
      source: item.source || 'custom',
      defaultRotation: normalizeRotation(item?.defaultRotation ?? 0)
    }));
}

function resolveIconSource(iconPath, fallbackSymbol) {
  if (typeof iconPath === 'string' && iconPath.trim()) {
    const trimmed = iconPath.trim();
    if (trimmed.startsWith('data:') || /^https?:/i.test(trimmed)) {
      return trimmed;
    }
    return asset(trimmed);
  }
  if (fallbackSymbol) {
    return asset(`icons/components/${fallbackSymbol}.svg`);
  }
  return placeholderIcon;
}


// === REPLACE THE ENTIRE FUNCTION ===
async function loadComponentLibrary() {
  componentMeta = {};
  propSchemas = {};
  subtypeCategory = {};
  componentTypes = {};

  const registerDefinition = (definition, { allowOverride = true } = {}) => {
    if (!definition || typeof definition !== 'object') return;
    const subtype = (definition.subtype || '').trim();
    if (!subtype) return;
    const baseType = (definition.type || definition.category || subtype).trim();
    const key = compKey(baseType, subtype);
    if (!allowOverride && componentMeta[key]) return;
    if (componentMeta[key]) {
      const prevCat = subtypeCategory[key];
      if (prevCat && componentTypes[prevCat]) {
        componentTypes[prevCat] = componentTypes[prevCat].filter(entry => entry !== key);
      }
    }
    const resolvedType = definition.type || baseType;
    const category = definition.category || categoryForType(resolvedType);
    const icon = resolveIconSource(definition.icon, definition.symbol);
    const ports = normalizePortsForCategory(category, definition.ports, resolvedType, subtype);
    const defaultRotation = normalizeRotation(
      definition.defaultRotation ?? defaultRotationForType(resolvedType, category)
    );
    const rawSource = typeof definition.source === 'string' ? definition.source.trim() : '';
    const derivedSource = rawSource || (definition.isCustom ? 'custom' : '');
    const isCustom = derivedSource.toLowerCase() === 'custom';
    const rawProps = definition.props || {};
    const props = {};
    Object.entries(rawProps).forEach(([propKey, propValue]) => {
      if (propKey === 'kv' || propKey.startsWith('kv_') || propKey.endsWith('_kv')) {
        const newKey = propKey
          .replace(/^kv_/, 'volts_')
          .replace(/_kv$/, '_volts')
          .replace('kv', 'volts');
        props[newKey] = typeof propValue === 'number' ? propValue * 1000 : propValue;
      } else {
        props[propKey] = typeof propValue === 'object' && propValue !== null
          ? JSON.parse(JSON.stringify(propValue))
          : propValue;
      }
    });
    const meta = {
      icon,
      label: definition.label || key,
      category,
      ports,
      type: resolvedType,
      subtype,
      props,
      defaultRotation,
      source: derivedSource || null,
      isCustom
    };
    const widthVal = Number(definition.width);
    const heightVal = Number(definition.height);
    if (Number.isFinite(widthVal)) meta.width = widthVal;
    if (Number.isFinite(heightVal)) meta.height = heightVal;
    componentMeta[key] = meta;
    subtypeCategory[key] = category;
    if (!componentTypes[category]) componentTypes[category] = [];
    if (!componentTypes[category].includes(key)) componentTypes[category].push(key);
    propSchemas[key] = inferSchemaFromProps(props);
  };

  try {
    const res = await fetch(asset('componentLibrary.json'));
    const data = await res.json();
    const comps = Array.isArray(data.components) ? data.components : [];
    comps.forEach(c => registerDefinition(c));
  } catch (e) {
    console.error('Component library load failed', e);
  }

  const customDefinitions = loadStoredCustomComponents();
  customDefinitions.forEach(def => registerDefinition(def));

  builtinComponents.forEach(def => registerDefinition(def, { allowOverride: false }));

  buildPalette();
  refreshAttributeOptions();
}
// === END REPLACEMENT ===

function isValidComponent(c) {
  return c && typeof c === 'object' && Array.isArray(c.ports) && c.category;
}

async function loadManufacturerLibrary() {
  try {
    const res = await fetch(asset('manufacturerLibrary.json'));
    manufacturerDefaults = await res.json();
  } catch (err) {
    console.error('Failed to load manufacturer defaults', err);
    manufacturerDefaults = {};
  }
  const stored = getItem('manufacturerDefaults', {});
  manufacturerDefaults = { ...manufacturerDefaults, ...stored };
}

async function loadProtectiveDevices() {
  try {
    const res = await fetch(asset('data/protectiveDevices.json'));
    protectiveDevices = await res.json();
  } catch (err) {
    console.error('Failed to load protective devices', err);
    protectiveDevices = [];
  }
}

function rebuildComponentMaps() {
  subtypeCategory = {};
  componentTypes = {};
  Object.entries(componentMeta).forEach(([sub, meta]) => {
    subtypeCategory[sub] = meta.category;
    if (!componentTypes[meta.category]) componentTypes[meta.category] = [];
    componentTypes[meta.category].push(sub);
  });
}

function applyDefaults(comp) {
  const defs = manufacturerDefaults[comp.subtype];
  if (!defs) return;
  Object.entries(defs).forEach(([k, v]) => {
    if (comp[k] === undefined || comp[k] === '') {
      comp[k] = v;
    }
  });
}

function inferPortCountsForMeta(ports = [], width = compWidth, height = compHeight) {
  const counts = { top: 0, right: 0, bottom: 0, left: 0 };
  const w = Number.isFinite(width) ? width : compWidth;
  const h = Number.isFinite(height) ? height : compHeight;
  const epsilon = 0.5;
  ports.forEach(port => {
    if (!port || typeof port.x !== 'number' || typeof port.y !== 'number') return;
    if (Math.abs(port.y) <= epsilon) counts.top += 1;
    else if (Math.abs(port.x - w) <= epsilon) counts.right += 1;
    else if (Math.abs(port.y - h) <= epsilon) counts.bottom += 1;
    else if (Math.abs(port.x) <= epsilon) counts.left += 1;
  });
  return counts;
}

function createComponentPrefill(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const ports = Array.isArray(meta.ports)
    ? meta.ports
        .filter(port => port && typeof port === 'object')
        .map(port => ({
          x: Number.isFinite(Number(port.x)) ? Number(port.x) : 0,
          y: Number.isFinite(Number(port.y)) ? Number(port.y) : 0
        }))
    : [];
  const baseProps = meta.props && typeof meta.props === 'object' ? meta.props : {};
  const props = {};
  const properties = [];
  Object.entries(baseProps).forEach(([name, value]) => {
    if (value !== null && typeof value === 'object') return;
    props[name] = value;
    properties.push({
      name,
      type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'checkbox' : 'text',
      value
    });
  });
  const widthVal = Number(meta.width);
  const heightVal = Number(meta.height);
  const defaultRotation = Number(meta.defaultRotation);
  return {
    label: meta.label || meta.subtype || '',
    subtype: meta.subtype || '',
    type: meta.type || meta.category || '',
    category: meta.category || meta.type || 'equipment',
    width: Number.isFinite(widthVal) ? widthVal : undefined,
    height: Number.isFinite(heightVal) ? heightVal : undefined,
    ports,
    portCounts: inferPortCountsForMeta(ports, widthVal, heightVal),
    props,
    properties,
    icon: meta.icon || null,
    defaultRotation: Number.isFinite(defaultRotation) ? defaultRotation : undefined
  };
}

function navigateToCustomComponentEditor(meta) {
  if (!meta) return;
  const url = new URL('./custom-components.html', window.location.href);
  if (meta.isCustom && meta.subtype) {
    url.searchParams.set('edit', meta.subtype);
    window.location.href = url.toString();
    return;
  }
  const prefill = createComponentPrefill(meta);
  if (!prefill) {
    window.location.href = url.toString();
    return;
  }
  try {
    sessionStorage.setItem(customComponentPrefillStorageKey, JSON.stringify(prefill));
  } catch (err) {
    console.error('Failed to store component prefill', err);
  }
  url.searchParams.set('prefill', '1');
  window.location.href = url.toString();
}

function buildPalette() {
  closePaletteContextMenu();
  const palette = document.getElementById('component-buttons');
  const btnTemplate = document.getElementById('palette-button-template');
  const sectionContainers = {
    sources: document.getElementById('sources-buttons'),
    equipment: document.getElementById('equipment-buttons'),
    protection: document.getElementById('protection-buttons'),
    load: document.getElementById('load-buttons'),
    bus: document.getElementById('bus-buttons'),
    cable: document.getElementById('cable-buttons'),
    links: document.getElementById('links-buttons'),
    annotations: document.getElementById('annotations-buttons')
  };
  Object.values(sectionContainers).forEach(c => {
    if (c) c.innerHTML = '';
  });
  Object.entries(sectionContainers).forEach(([cat, container]) => {
    const summary = container?.parentElement?.querySelector('summary');
    if (!summary) return;
    const details = summary.closest('details');
    if (details) details.dataset.category = cat;
    Array.from(summary.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        summary.removeChild(node);
      }
    });
    let label = summary.querySelector('.summary-label');
    if (!label) {
      label = document.createElement('span');
      label.className = 'summary-label';
      summary.appendChild(label);
    }
    label.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
  });
  Object.entries(componentTypes).forEach(([cat, subs]) => {
    const container = sectionContainers[cat] || palette;
    subs.forEach(subKey => {
      const meta = componentMeta[subKey];
      const btn = btnTemplate ? btnTemplate.content.firstElementChild.cloneNode(true) : document.createElement('button');
      btn.draggable = true;
      btn.setAttribute('draggable', 'true');
      btn.dataset.type = meta.type;
      if (meta.subtype) {
        btn.dataset.subtype = meta.subtype;
        btn.setAttribute('data-subtype', meta.subtype);
      } else {
        btn.dataset.subtype = '';
        btn.setAttribute('data-subtype', '');
      }
      btn.setAttribute('data-testid', 'palette-button');
      btn.dataset.label = meta.label;
      btn.title = `${meta.label} - Drag to canvas or click to add`;
      btn.setAttribute('aria-label', meta.label || meta.subtype || meta.type || subKey);
      const rotation = normalizeRotation(meta?.defaultRotation ?? defaultRotationForType(meta?.type, meta?.category));
      const iconWrapper = document.createElement('span');
      iconWrapper.className = 'palette-icon';
      iconWrapper.dataset.rotation = String(rotation);
      const iconImg = document.createElement('img');
      iconImg.src = meta.icon;
      iconImg.alt = '';
      iconImg.setAttribute('aria-hidden', 'true');
      iconWrapper.appendChild(iconImg);
      btn.innerHTML = '';
      btn.appendChild(iconWrapper);
      const labelSpan = document.createElement('span');
      labelSpan.className = 'palette-label';
      labelSpan.textContent = meta.label || meta.subtype || meta.type || subKey;
      btn.appendChild(labelSpan);
      btn.addEventListener('click', () => {
        addComponent({ type: meta.type, subtype: subKey });
        render();
        save();
      });
      btn.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: meta.type, subtype: subKey }));
        setDragPreview(e, meta, rotation);
      });
      btn.dataset.custom = meta.isCustom ? '1' : '0';
      btn.addEventListener('contextmenu', e => {
        e.preventDefault();
        openPaletteContextMenu(meta, btn, e.clientX, e.clientY);
      });
      btn.addEventListener('keydown', e => {
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          const rect = btn.getBoundingClientRect();
          openPaletteContextMenu(
            meta,
            btn,
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          );
        }
      });
      container.appendChild(btn);
    });
  });
  document.querySelectorAll('#component-buttons details').forEach(det => {
    const key = `palette-${det.id}-open`;
    const container = det.querySelector('.section-buttons');
    const hasButtons = container && container.children.length > 0;
    if (!hasButtons && container) {
      const placeholder = document.createElement('div');
      placeholder.className = 'no-components';
      placeholder.textContent = 'No components available';
      container.appendChild(placeholder);
    }
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      det.open = stored === 'true';
    } else if (!hasButtons) {
      det.open = true;
    }
    det.addEventListener('toggle', () => {
      localStorage.setItem(key, det.open);
    });
  });
  const paletteSearch = document.getElementById('palette-search');
  if (paletteSearch) {
    paletteSearch.addEventListener('input', () => {
      const term = paletteSearch.value.trim().toLowerCase();
      palette.querySelectorAll('button').forEach(btn => {
        const sub = (btn.dataset.subtype || '').toLowerCase();
        const label = (btn.dataset.label || componentMeta[btn.dataset.subtype]?.label || '').toLowerCase();
        btn.style.display = !term || sub.includes(term) || label.includes(term) ? '' : 'none';
      });
    });
    paletteSearch.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        paletteSearch.value = '';
        paletteSearch.dispatchEvent(new Event('input'));
      }
    });
  }
}

function closePaletteContextMenu() {
  if (!paletteContextMenu) return;
  paletteContextMenu.style.display = 'none';
  paletteContextTarget = null;
}

function openPaletteContextMenu(meta, triggerEl, clientX, clientY) {
  if (!paletteContextMenu || !meta) return;
  closePaletteContextMenu();
  paletteContextTarget = { meta, trigger: triggerEl };
  paletteContextMenu.style.display = 'block';
  paletteContextMenu.style.left = '0px';
  paletteContextMenu.style.top = '0px';
  const rect = paletteContextMenu.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.width;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rect.height;
  const left = Math.min(Math.max(0, clientX), viewportWidth - rect.width);
  const top = Math.min(Math.max(0, clientY), viewportHeight - rect.height);
  paletteContextMenu.style.left = `${Math.round(left)}px`;
  paletteContextMenu.style.top = `${Math.round(top)}px`;
}

function setDragPreview(e, meta, rotation) {
  if (!e?.dataTransfer || !meta?.icon) return;
  try {
    const preview = document.createElement('div');
    preview.className = 'drag-preview';
    preview.dataset.rotation = String(rotation);
    const baseWidth = compWidth;
    const baseHeight = compHeight;
    const normalized = normalizeRotation(rotation);
    const width = normalized === 90 || normalized === 270 ? baseHeight : baseWidth;
    const height = normalized === 90 || normalized === 270 ? baseWidth : baseHeight;
    preview.style.width = `${width}px`;
    preview.style.height = `${height}px`;
    const img = document.createElement('img');
    img.src = meta.icon;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.draggable = false;
    preview.appendChild(img);
    document.body.appendChild(preview);
    const rect = preview.getBoundingClientRect();
    const offsetX = rect.width / 2;
    const offsetY = rect.height / 2;
    e.dataTransfer.setDragImage(preview, offsetX, offsetY);
    requestAnimationFrame(() => {
      preview.remove();
    });
  } catch (err) {
    // ignore drag preview failures
  }
}

const svgNS = 'http://www.w3.org/2000/svg';
let sheets = [];
let activeSheet = 0;
let components = [];
let connections = [];
let selection = [];
let selected = null;
let dragOffset = null;
let dragging = false;
let draggingConnection = null;
let draggingLabel = null;
let clipboard = [];
let contextTarget = null;
let connectMode = false;
let connectSource = null;
let tempConnection = null;
let hoverPort = null;
let selectedConnection = null;
let diagramScale = getItem('diagramScale', { unitPerPx: 1, unit: 'in' });
const DEFAULT_DIAGRAM_ZOOM = 1;
const MIN_DIAGRAM_ZOOM = 0.25;
const MAX_DIAGRAM_ZOOM = 4;
const DEFAULT_VIEWPORT_WIDTH = 1600;
const DEFAULT_VIEWPORT_HEIGHT = 900;
const VIEWPORT_PADDING = 200;
const STUDY_SETTINGS_KEY = 'studySettings';
const defaultStudySettings = {
  loadFlow: { baseMVA: 100, balanced: true },
  shortCircuit: { method: 'IEC' }
};
let diagramViewport = {
  minX: 0,
  minY: 0,
  width: DEFAULT_VIEWPORT_WIDTH,
  height: DEFAULT_VIEWPORT_HEIGHT
};
let diagramZoom = clampZoom(getItem('diagramZoom', DEFAULT_DIAGRAM_ZOOM));
let resizingBus = null;
let resizingAnnotation = null;
let marquee = null;

function normalizeStudySettings(raw = {}) {
  const lf = raw && typeof raw === 'object' ? raw.loadFlow || {} : {};
  const sc = raw && typeof raw === 'object' ? raw.shortCircuit || {} : {};
  const base = Number(lf.baseMVA);
  return {
    loadFlow: {
      baseMVA: Number.isFinite(base) && base > 0 ? base : defaultStudySettings.loadFlow.baseMVA,
      balanced: lf.balanced !== false
    },
    shortCircuit: {
      method: typeof sc.method === 'string' && sc.method.trim().toUpperCase() === 'ANSI' ? 'ANSI' : 'IEC'
    }
  };
}

let studySettings = normalizeStudySettings(getItem(STUDY_SETTINGS_KEY, defaultStudySettings));
let marqueeSelectionMade = false;
let legendDrag = null;
let legendUserMoved = false;
let gridSize = Number(getItem('gridSize', 20));
let gridEnabled = getItem('gridEnabled', true);
let snapIndicatorTimeout = null;
let history = [];
let historyIndex = -1;
let validationIssues = [];
const marqueeThreshold = 4;
let templates = [];
const DIAGRAM_VERSION = 2;
let cursorPos = { x: 20, y: 20 };
let showOverlays = true;
let syncing = false;
let lintPanel = null;
let lintList = null;
let clickSelectTimer = null;
const SINGLE_CLICK_DELAY_MS = 175;
const DOUBLE_CLICK_THRESHOLD_MS = 400;
const DRAG_MOVE_THRESHOLD = 3;
let lastComponentClick = { id: null, time: 0 };
let lastPointerUp = { id: null, time: 0 };
let findHighlightId = null;
let findHighlightTimer = null;
let pointerDownComponentId = null;
let middlePanState = null;

// Re-run validation whenever diagram or study results change
on('oneLineDiagram', validateDiagram);
on('studyResults', validateDiagram);
on('studyResults', () => {
  cachedStudyResults = getStudies();
  refreshAttributeOptions();
  render();
});
on(STUDY_SETTINGS_KEY, value => {
  studySettings = normalizeStudySettings(value || defaultStudySettings);
  applyStudySettingsToForm();
});

// Studies panel setup
const studiesPanel = document.getElementById('studies-panel');
const studiesToggle = document.getElementById('studies-panel-btn');
const studiesCloseBtn = document.getElementById('studies-close-btn');
const runLFBtn = document.getElementById('run-loadflow-btn');
const runSCBtn = document.getElementById('run-shortcircuit-btn');
const runAFBtn = document.getElementById('run-arcflash-btn');
const runHBtn = document.getElementById('run-harmonics-btn');
const runMSBtn = document.getElementById('run-motorstart-btn');
const runRelBtn = document.getElementById('run-reliability-btn');
const studyResultsEl = document.getElementById('study-results');
const loadFlowResultsEl = document.getElementById('loadflow-results');
const overlayToggle = document.getElementById('toggle-overlays');
const studySettingsBtn = document.getElementById('study-settings-btn');
const studySettingsForm = document.getElementById('study-settings-menu');
const studyLoadFlowBase = document.getElementById('study-loadflow-basemva');
const studyLoadFlowBalanced = document.getElementById('study-loadflow-balanced');
const studyShortCircuitMethod = document.getElementById('study-shortcircuit-method');

function persistStudySettings() {
  setItem(STUDY_SETTINGS_KEY, studySettings);
}

function applyStudySettingsToForm() {
  if (studyLoadFlowBase) studyLoadFlowBase.value = String(studySettings.loadFlow.baseMVA);
  if (studyLoadFlowBalanced) studyLoadFlowBalanced.checked = !!studySettings.loadFlow.balanced;
  if (studyShortCircuitMethod) studyShortCircuitMethod.value = studySettings.shortCircuit.method;
}

if (overlayToggle) {
  showOverlays = overlayToggle.checked;
  overlayToggle.addEventListener('change', () => {
    showOverlays = overlayToggle.checked;
    render();
  });
}

applyStudySettingsToForm();

if (studySettingsBtn && studySettingsForm) {
  studySettingsBtn.addEventListener('click', () => {
    const isHidden = studySettingsForm.classList.toggle('hidden');
    studySettingsBtn.setAttribute('aria-expanded', String(!isHidden));
    studySettingsForm.setAttribute('aria-hidden', String(isHidden));
    if (!isHidden) applyStudySettingsToForm();
  });
}
if (studySettingsForm) {
  studySettingsForm.addEventListener('submit', e => e.preventDefault());
  if (!studySettingsForm.hasAttribute('aria-hidden')) {
    studySettingsForm.setAttribute('aria-hidden', 'true');
  }
}
if (studyLoadFlowBase) {
  studyLoadFlowBase.addEventListener('change', () => {
    const value = Number(studyLoadFlowBase.value);
    const normalized = Number.isFinite(value) && value > 0 ? value : defaultStudySettings.loadFlow.baseMVA;
    studySettings.loadFlow.baseMVA = normalized;
    studyLoadFlowBase.value = String(normalized);
    persistStudySettings();
  });
}
if (studyLoadFlowBalanced) {
  studyLoadFlowBalanced.addEventListener('change', () => {
    studySettings.loadFlow.balanced = studyLoadFlowBalanced.checked;
    persistStudySettings();
  });
}
if (studyShortCircuitMethod) {
  studyShortCircuitMethod.addEventListener('change', () => {
    const method = (studyShortCircuitMethod.value || '').toUpperCase() === 'ANSI' ? 'ANSI' : 'IEC';
    studySettings.shortCircuit.method = method;
    studyShortCircuitMethod.value = method;
    persistStudySettings();
  });
}

function renderStudyResults() {
  if (!studyResultsEl) return;
  const res = getStudies();
  studyResultsEl.textContent = Object.keys(res).length ? JSON.stringify(res, null, 2) : 'No results';
}

function highlightSPF(ids = []) {
  const svg = document.getElementById('diagram');
  if (!svg) return;
  svg.querySelectorAll('g.component').forEach(g => g.classList.remove('reliability-spf'));
  ids.forEach(id => {
    const g = svg.querySelector(`g.component[data-id="${id}"]`);
    if (g) g.classList.add('reliability-spf');
  });
}

function cancelPendingClickSelection() {
  if (clickSelectTimer) {
    clearTimeout(clickSelectTimer);
    clickSelectTimer = null;
  }
}

function getScrollableContainer(element) {
  let current = element;
  while (current && current !== document.body && current !== document.documentElement) {
    try {
      const style = window.getComputedStyle(current);
      const overflowX = style.overflowX || '';
      const overflowY = style.overflowY || '';
      const canScrollX = /auto|scroll|overlay/i.test(overflowX) && current.scrollWidth > current.clientWidth;
      const canScrollY = /auto|scroll|overlay/i.test(overflowY) && current.scrollHeight > current.clientHeight;
      if (canScrollX || canScrollY) return current;
    } catch {
      // ignore computed style failures
    }
    current = current.parentElement;
  }
  return document.scrollingElement || document.documentElement || document.body;
}

function startMiddlePan(e, container) {
  if (!container) return;
  const scrollHost = getScrollableContainer(container);
  middlePanState = {
    container: scrollHost,
    host: container,
    startX: e.clientX,
    startY: e.clientY,
    scrollLeft: scrollHost ? scrollHost.scrollLeft : 0,
    scrollTop: scrollHost ? scrollHost.scrollTop : 0
  };
  container.classList.add('panning');
}

function updateMiddlePan(e) {
  if (!middlePanState) return;
  const { container, startX, startY, scrollLeft, scrollTop } = middlePanState;
  if (!container) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  container.scrollLeft = scrollLeft - dx;
  container.scrollTop = scrollTop - dy;
}

function stopMiddlePan() {
  if (!middlePanState) return;
  if (middlePanState.host && middlePanState.host.classList) {
    middlePanState.host.classList.remove('panning');
  }
  middlePanState = null;
}

function clampZoom(value, fallback = DEFAULT_DIAGRAM_ZOOM) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    const safe = Number(fallback);
    if (Number.isFinite(safe)) {
      return Math.min(MAX_DIAGRAM_ZOOM, Math.max(MIN_DIAGRAM_ZOOM, safe));
    }
    return DEFAULT_DIAGRAM_ZOOM;
  }
  return Math.min(MAX_DIAGRAM_ZOOM, Math.max(MIN_DIAGRAM_ZOOM, num));
}

function getViewportCenter(previousZoom = diagramZoom) {
  const svg = document.getElementById('diagram');
  const editor = svg?.parentElement;
  if (!svg || !(editor instanceof HTMLElement)) return null;
  const zoom = previousZoom || diagramZoom || DEFAULT_DIAGRAM_ZOOM;
  return {
    x: diagramViewport.minX + (editor.scrollLeft + editor.clientWidth / 2) / zoom,
    y: diagramViewport.minY + (editor.scrollTop + editor.clientHeight / 2) / zoom
  };
}

function applyDiagramZoom({ adjustScroll = false, previousZoom, focusPoint } = {}) {
  const svg = document.getElementById('diagram');
  if (!svg) return;
  const zoom = diagramZoom || DEFAULT_DIAGRAM_ZOOM;
  const { minX, minY, width, height } = diagramViewport;
  if (width && height) {
    svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
    svg.style.width = `${width * zoom}px`;
    svg.style.height = `${height * zoom}px`;
  }
  const gridBg = document.getElementById('grid-bg');
  if (gridBg) {
    gridBg.setAttribute('x', String(minX));
    gridBg.setAttribute('y', String(minY));
    gridBg.setAttribute('width', String(width));
    gridBg.setAttribute('height', String(height));
  }
  if (!adjustScroll) return;
  const editor = svg.parentElement;
  if (!(editor instanceof HTMLElement)) return;
  const prevZoom = previousZoom || zoom;
  const focus = focusPoint || getViewportCenter(prevZoom);
  if (!focus) return;
  const nextLeft = (focus.x - minX) * zoom - editor.clientWidth / 2;
  const nextTop = (focus.y - minY) * zoom - editor.clientHeight / 2;
  editor.scrollLeft = Math.max(0, nextLeft);
  editor.scrollTop = Math.max(0, nextTop);
}

function updateDiagramViewport(bounds) {
  if (!bounds || !Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY) ||
      !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.maxY)) {
    diagramViewport = {
      minX: 0,
      minY: 0,
      width: DEFAULT_VIEWPORT_WIDTH,
      height: DEFAULT_VIEWPORT_HEIGHT
    };
    return;
  }
  const minX = Math.min(0, Math.floor(bounds.minX - VIEWPORT_PADDING));
  const minY = Math.min(0, Math.floor(bounds.minY - VIEWPORT_PADDING));
  const maxX = Math.max(bounds.maxX + VIEWPORT_PADDING, minX + DEFAULT_VIEWPORT_WIDTH);
  const maxY = Math.max(bounds.maxY + VIEWPORT_PADDING, minY + DEFAULT_VIEWPORT_HEIGHT);
  const width = Math.max(DEFAULT_VIEWPORT_WIDTH, Math.ceil(maxX - minX));
  const height = Math.max(DEFAULT_VIEWPORT_HEIGHT, Math.ceil(maxY - minY));
  diagramViewport = { minX, minY, width, height };
}

function updateZoomDisplay() {
  const display = document.getElementById('zoom-display');
  if (!display) return;
  const percent = Math.round((diagramZoom || DEFAULT_DIAGRAM_ZOOM) * 100);
  display.textContent = `${percent}%`;
}

function setDiagramZoom(nextZoom, { focusPoint } = {}) {
  const prev = diagramZoom || DEFAULT_DIAGRAM_ZOOM;
  const clamped = clampZoom(nextZoom, prev);
  if (clamped === diagramZoom) return;
  diagramZoom = clamped;
  setItem('diagramZoom', Number(diagramZoom.toFixed(2)));
  applyDiagramZoom({ adjustScroll: true, previousZoom: prev, focusPoint });
  updateZoomDisplay();
}

function adjustZoom(factor, opts = {}) {
  if (!Number.isFinite(factor) || factor === 0) return;
  setDiagramZoom((diagramZoom || DEFAULT_DIAGRAM_ZOOM) * factor, opts);
}

function toDiagramCoords(e) {
  const svg = document.getElementById('diagram');
  if (!svg) return { x: 0, y: 0 };
  const rect = svg.getBoundingClientRect();
  const zoom = diagramZoom || DEFAULT_DIAGRAM_ZOOM;
  const x = (e.clientX - rect.left) / zoom + diagramViewport.minX;
  const y = (e.clientY - rect.top) / zoom + diagramViewport.minY;
  return { x, y };
}

function normalizeSearchValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

function componentSearchValues(comp) {
  const values = new Set();
  if (!comp || typeof comp !== 'object') return values;
  const add = val => {
    const normalized = normalizeSearchValue(val);
    if (normalized) values.add(normalized);
  };
  add(comp.label);
  add(comp.ref);
  add(comp.name);
  add(comp.id);
  add(comp.tag);
  if (comp.cable && typeof comp.cable === 'object') add(comp.cable.tag);
  if (Array.isArray(comp.tags)) comp.tags.forEach(add);
  if (comp.props && typeof comp.props === 'object') {
    ['tag', 'label', 'name', 'id'].forEach(key => add(comp.props[key]));
  }
  return values;
}

function findComponentByTag(query) {
  const target = normalizeSearchValue(query);
  if (!target) return null;
  let exact = null;
  let partial = null;
  components.forEach(comp => {
    if (!comp || partial && exact) return;
    const values = componentSearchValues(comp);
    if (values.has(target)) {
      if (!exact) exact = comp;
      return;
    }
    if (!partial) {
      const hasPartial = Array.from(values).some(val => val.includes(target));
      if (hasPartial) partial = comp;
    }
  });
  return exact || partial;
}

function highlightFoundComponent(componentId) {
  if (!componentId) return;
  findHighlightId = componentId;
  if (findHighlightTimer) {
    clearTimeout(findHighlightTimer);
    findHighlightTimer = null;
  }
  render();
  findHighlightTimer = window.setTimeout(() => {
    findHighlightId = null;
    findHighlightTimer = null;
    render();
  }, 3000);
}

function focusComponentElement(comp) {
  if (!comp) return;
  const svg = document.getElementById('diagram');
  if (!svg) return;
  const target = svg.querySelector(`g.component[data-id="${comp.id}"]`);
  if (!target || typeof target.scrollIntoView !== 'function') return;
  try {
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  } catch {
    target.scrollIntoView();
  }
}

if (studiesToggle) {
  studiesToggle.addEventListener('click', () => {
    studiesPanel.classList.toggle('hidden');
    renderStudyResults();
  });
}
if (studiesCloseBtn) studiesCloseBtn.addEventListener('click', () => studiesPanel.classList.add('hidden'));
if (runLFBtn) runLFBtn.addEventListener('click', () => {
  const res = runLoadFlow({
    baseMVA: studySettings.loadFlow.baseMVA,
    balanced: studySettings.loadFlow.balanced
  });
  const { sheets } = getOneLine();
  const diagram = sheets.flatMap(s => s.components);
  diagram.forEach(comp => {
    (comp.connections || []).forEach(conn => {
      delete conn.loading_kW;
      delete conn.loading_amps;
    });
  });
  const buses = res.buses || res;
  buses.forEach(r => {
    const comp = diagram.find(c => c.id === r.id);
    if (!comp) return;
    if (r.phase) {
      if (typeof comp.voltage_mag !== 'object') comp.voltage_mag = {};
      if (typeof comp.voltage_angle !== 'object') comp.voltage_angle = {};
      comp.voltage_mag[r.phase] = Number(r.Vm.toFixed(4));
      comp.voltage_angle[r.phase] = Number(r.Va.toFixed(4));
    } else {
      comp.voltage_mag = Number(r.Vm.toFixed(4));
      comp.voltage_angle = Number(r.Va.toFixed(4));
    }
  });
  // store line loading results on connections
  (res.lines || []).forEach(l => {
    const src = diagram.find(c => c.id === l.from);
    const conn = src?.connections?.find(c => c.target === l.to);
    if (!conn) return;
    const ampsRaw = typeof l.amps === 'number'
      ? l.amps
      : typeof l.currentKA === 'number'
        ? l.currentKA * 1000
        : null;
    const formatKw = value => Number(value.toFixed(2));
    const formatAmp = value => Number(value.toFixed(1));
    if (l.phase) {
      if (typeof conn.loading_kW !== 'object') conn.loading_kW = {};
      conn.loading_kW[l.phase] = formatKw(l.P);
      if (ampsRaw !== null) {
        if (typeof conn.loading_amps !== 'object') conn.loading_amps = {};
        conn.loading_amps[l.phase] = formatAmp(ampsRaw);
      }
    } else {
      conn.loading_kW = formatKw(l.P);
      if (ampsRaw !== null) {
        conn.loading_amps = formatAmp(ampsRaw);
      }
    }
  });
  setOneLine({ activeSheet, sheets });
  const studies = getStudies();
  studies.loadFlow = res;
  setStudies(studies);
  syncSchedules(false);
  renderStudyResults();
  renderLoadFlowResults(res);
  render();
});

function renderLoadFlowResults(res) {
  if (!loadFlowResultsEl) return;
  const buses = res.buses || res;
  let html = '<h3>Bus Voltages</h3><table><tr><th>Bus</th><th>Phase</th><th>Vm</th><th>Va</th></tr>';
  buses.forEach(b => {
    html += `<tr><td>${b.id}</td><td>${b.phase || ''}</td><td>${b.Vm.toFixed(4)}</td><td>${b.Va.toFixed(2)}</td></tr>`;
  });
  html += '</table>';
  if (res.lines) {
    html += '<h3>Line Flows (kW/kvar)</h3><table><tr><th>From</th><th>To</th><th>Phase</th><th>P</th><th>Q</th><th>I (A)</th></tr>';
    res.lines.forEach(l => {
      const amps = typeof l.amps === 'number'
        ? l.amps
        : typeof l.currentKA === 'number'
          ? l.currentKA * 1000
          : null;
      const ampsText = amps !== null ? amps.toFixed(1) : '';
      html += `<tr><td>${l.from}</td><td>${l.to}</td><td>${l.phase || ''}</td><td>${l.P.toFixed(2)}</td><td>${l.Q.toFixed(2)}</td><td>${ampsText}</td></tr>`;
    });
    html += '</table>';
    if (res.losses) {
      if (res.losses.P !== undefined) {
        html += `<p>Total Losses: ${res.losses.P.toFixed(2)} kW / ${res.losses.Q.toFixed(2)} kvar</p>`;
      } else {
        const entries = Object.entries(res.losses).map(([ph, v]) => `${ph}: ${v.P.toFixed(2)} kW / ${v.Q.toFixed(2)} kvar`).join(', ');
        html += `<p>Total Losses: ${entries}</p>`;
      }
    }
  }
  loadFlowResultsEl.innerHTML = html;
}
if (runSCBtn) runSCBtn.addEventListener('click', () => {
  const res = runShortCircuit({ method: studySettings.shortCircuit.method });
  const { sheets } = getOneLine();
  const diagram = sheets.flatMap(s => s.components);
  diagram.forEach(c => {
    c.shortCircuit = res[c.id];
    (c.connections || []).forEach(conn => {
      conn.faultKA = res[conn.target]?.threePhaseKA;
    });
  });
  setOneLine({ activeSheet, sheets });
  const studies = getStudies();
  studies.shortCircuit = res;
  setStudies(studies);
  renderStudyResults();
  render();
});
if (runAFBtn) runAFBtn.addEventListener('click', async () => {
  const shortCircuitOpts = { method: studySettings.shortCircuit.method };
  const sc = runShortCircuit(shortCircuitOpts);
  const af = await runArcFlash({ shortCircuit: { ...shortCircuitOpts } });
  const { sheets } = getOneLine();
  const diagram = sheets.flatMap(s => s.components);
  diagram.forEach(c => {
    c.shortCircuit = sc[c.id];
    c.arcFlash = af[c.id];
    (c.connections || []).forEach(conn => {
      conn.faultKA = sc[conn.target]?.threePhaseKA;
    });
  });
  setOneLine({ activeSheet, sheets });
  const studies = getStudies();
  studies.shortCircuit = sc;
  studies.arcFlash = af;
  setStudies(studies);
  generateArcFlashReport(af);
  renderStudyResults();
  render();
});
if (runHBtn) runHBtn.addEventListener('click', () => {
  const res = runHarmonics();
  const studies = getStudies();
  studies.harmonics = res;
  setStudies(studies);
  renderStudyResults();
  window.open('harmonics.html', '_blank');
});
if (runMSBtn) runMSBtn.addEventListener('click', () => {
  const res = runMotorStart();
  const studies = getStudies();
  studies.motorStart = res;
  setStudies(studies);
  renderStudyResults();
  window.open('motorStart.html', '_blank');
});
if (runRelBtn) runRelBtn.addEventListener('click', () => {
  const { sheets } = getOneLine();
  const diagram = sheets.flatMap(s => s.components);
  const res = runReliability(diagram);
  const studies = getStudies();
  studies.reliability = res;
  setStudies(studies);
  highlightSPF(res.n1Failures);
  renderStudyResults();
});

// Guided tour steps
const tourSteps = [
  { element: '#component-buttons', text: 'Add components from the palette.' },
  { element: '#connect-btn', text: 'Connect components using this button then selecting two components.' },
  { element: '#diagram', text: 'Select a component to edit its properties.' },
  { element: '#export-btn', text: 'Use Export to download your diagram.' }
];
let tourIndex = 0;
let tourOverlay = null;
let tourModal = null;
let tourResizeHandler = null;
let tourKeyHandler = null;

function positionTourModal(target) {
  if (!tourModal) return;
  if (target) {
    const rect = target.getBoundingClientRect();
    const modalWidth = tourModal.offsetWidth;
    const modalHeight = tourModal.offsetHeight;
    let top = rect.bottom + 12;
    if (top + modalHeight > window.innerHeight - 16) {
      top = Math.max(16, rect.top - modalHeight - 12);
    }
    const maxLeft = Math.max(16, window.innerWidth - modalWidth - 16);
    const left = Math.min(Math.max(16, rect.left), maxLeft);
    tourModal.style.top = `${top}px`;
    tourModal.style.left = `${left}px`;
    tourModal.style.transform = 'none';
    tourModal.classList.add('anchored');
  } else {
    tourModal.style.top = '50%';
    tourModal.style.left = '50%';
    tourModal.style.transform = 'translate(-50%, -50%)';
    tourModal.classList.remove('anchored');
  }
}

function showTourStep() {
  if (!tourModal) return;
  const step = tourSteps[tourIndex];
  const textEl = tourModal.querySelector('#tour-text');
  if (textEl) textEl.textContent = step.text;
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  const target = step.element ? document.querySelector(step.element) : null;
  if (target) target.classList.add('tour-highlight');
  const next = tourModal.querySelector('#tour-next');
  if (next) next.textContent = tourIndex === tourSteps.length - 1 ? 'Finish' : 'Next';
  positionTourModal(target);
}

function endTour() {
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  if (tourResizeHandler) {
    window.removeEventListener('resize', tourResizeHandler);
    tourResizeHandler = null;
  }
  if (tourKeyHandler) {
    document.removeEventListener('keydown', tourKeyHandler, true);
    tourKeyHandler = null;
  }
  tourOverlay?.remove();
  tourModal?.remove();
  tourOverlay = null;
  tourModal = null;
}

function startTour() {
  tourIndex = 0;
  tourOverlay = document.createElement('div');
  tourOverlay.className = 'tour-overlay';
  tourModal = document.createElement('div');
  tourModal.className = 'tour-modal';
  tourModal.setAttribute('tabindex', '-1');
  tourModal.innerHTML = `
    <div class="tour-content">
      <p id="tour-text"></p>
      <div class="tour-actions">
        <button type="button" id="tour-skip">Skip</button>
        <button type="button" id="tour-next">Next</button>
      </div>
    </div>`;
  document.body.appendChild(tourOverlay);
  document.body.appendChild(tourModal);
  const advance = () => {
    tourIndex++;
    if (tourIndex >= tourSteps.length) {
      endTour();
    } else {
      showTourStep();
    }
  };
  tourModal.querySelector('#tour-next').addEventListener('click', advance);
  tourModal.querySelector('#tour-skip').addEventListener('click', () => endTour());
  tourOverlay.addEventListener('click', advance);
  tourKeyHandler = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      endTour();
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (!tourModal) return;
      if (tourModal.contains(document.activeElement)) {
        e.preventDefault();
        advance();
      }
    }
  };
  document.addEventListener('keydown', tourKeyHandler, true);
  tourResizeHandler = () => showTourStep();
  window.addEventListener('resize', tourResizeHandler);
  showTourStep();
  try {
    tourModal.focus();
  } catch {}
}

// Prefix settings and counters for component labels
let labelPrefixes = getItem('labelPrefixes', {});
let labelCounters = getItem('labelCounters', {});

function getPrefix(subtype) {
  return labelPrefixes[subtype] || (subtype.slice(0, 3).toUpperCase() + '-');
}

function nextLabel(subtype) {
  const count = (labelCounters[subtype] || 0) + 1;
  labelCounters[subtype] = count;
  setItem('labelCounters', labelCounters);
  return getPrefix(subtype) + count;
}

function applyNextLabel(comp) {
  if (!comp || !comp.subtype) return;
  comp.label = nextLabel(comp.subtype);
}

function editPrefixes() {
  const subtypeSet = new Set([...Object.keys(componentMeta), ...Object.keys(labelPrefixes)]);
  const subtypes = [...subtypeSet].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  if (!subtypes.length) {
    showToast('No component prefixes available to edit');
    return;
  }

  let modal = document.getElementById('prefix-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'prefix-modal';
    modal.className = 'prop-modal';
    document.body.appendChild(modal);
  }
  if (modal._outsideHandler) modal.removeEventListener('click', modal._outsideHandler);
  if (modal._keyHandler) document.removeEventListener('keydown', modal._keyHandler);
  modal.innerHTML = '';

  const form = document.createElement('form');
  form.id = 'prefix-form';

  const closeModal = () => {
    modal.classList.remove('show');
    modal.removeEventListener('click', outsideHandler);
    document.removeEventListener('keydown', keyHandler);
    delete modal._outsideHandler;
    delete modal._keyHandler;
  };

  const outsideHandler = e => { if (e.target === modal) closeModal(); };
  const keyHandler = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  };

  function renderCategoryButtons() {
    categoryListEl.innerHTML = '';
    categoryButtonMap.clear();
    categoryOrder.forEach(categoryKey => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'prop-category-option';
      button.textContent = getCategoryLabel(categoryKey);
      button.dataset.category = categoryKey;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (activeCategory === categoryKey) return;
        activeCategory = categoryKey;
        const nextDevice = categoryEntries.get(activeCategory)?.[0] || null;
        renderDeviceButtons();
        updateCategoryStates();
        if (nextDevice) {
          setActiveComponent(nextDevice);
        } else {
          selected = null;
          selection = [];
          selectedConnection = null;
          renderPropertiesFor(null);
          updateButtonStates();
        }
      });
      categoryButtonMap.set(categoryKey, button);
      categoryListEl.appendChild(button);
    });
  }

  function renderDeviceButtons() {
    componentListEl.innerHTML = '';
    buttonMap.clear();
    const devices = categoryEntries.get(activeCategory) || [];
    const headingLabel = activeCategory ? `Device Tags – ${getCategoryLabel(activeCategory)}` : 'Device Tags';
    componentHeading.textContent = headingLabel;
    devices.forEach(device => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'prop-component-option';
      button.dataset.componentId = device.id;
      button.textContent = getComponentListLabel(device);
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => setActiveComponent(device));
      button.addEventListener('keydown', event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        const list = categoryEntries.get(activeCategory) || [];
        const currentIndex = list.findIndex(item => item.id === device.id);
        if (currentIndex === -1) return;
        const offset = event.key === 'ArrowUp' ? -1 : 1;
        let nextIndex = currentIndex + offset;
        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= list.length) nextIndex = list.length - 1;
        const nextDevice = list[nextIndex];
        if (!nextDevice) return;
        setActiveComponent(nextDevice);
        const nextButton = buttonMap.get(nextDevice.id);
        nextButton?.focus();
      });
      buttonMap.set(device.id, button);
      componentListEl.appendChild(button);
    });
  }

  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('h3');
  title.textContent = 'Label Prefixes';
  header.appendChild(title);
  form.appendChild(header);

  const helpText = document.createElement('p');
  helpText.textContent = 'Update the prefix used for auto-generated labels by subtype.';
  form.appendChild(helpText);

  const table = document.createElement('table');
  table.className = 'prefix-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const subtypeHeader = document.createElement('th');
  subtypeHeader.scope = 'col';
  subtypeHeader.textContent = 'Subtype';
  headRow.appendChild(subtypeHeader);
  const prefixHeader = document.createElement('th');
  prefixHeader.scope = 'col';
  prefixHeader.textContent = 'Prefix';
  headRow.appendChild(prefixHeader);
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  subtypes.forEach(sub => {
    const row = document.createElement('tr');
    const labelCell = document.createElement('th');
    labelCell.scope = 'row';
    labelCell.textContent = sub;
    row.appendChild(labelCell);
    const inputCell = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = labelPrefixes[sub] ?? getPrefix(sub);
    input.dataset.subtype = sub;
    input.setAttribute('aria-label', `Label prefix for ${sub}`);
    inputCell.appendChild(input);
    row.appendChild(inputCell);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  form.appendChild(table);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn secondary-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => closeModal());
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn primary-btn';
  saveBtn.textContent = 'Save';
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  form.addEventListener('submit', e => {
    e.preventDefault();
    const updated = {};
    form.querySelectorAll('input[data-subtype]').forEach(input => {
      const subtype = input.dataset.subtype;
      if (!subtype) return;
      const value = input.value;
      if (value !== null && value !== undefined && value !== '') {
        updated[subtype] = value;
      }
    });
    labelPrefixes = updated;
    setItem('labelPrefixes', labelPrefixes);
    closeModal();
  });

  modal.appendChild(form);
  modal.classList.add('show');
  modal._outsideHandler = outsideHandler;
  modal._keyHandler = keyHandler;
  modal.addEventListener('click', outsideHandler);
  document.addEventListener('keydown', keyHandler);
  const firstInput = form.querySelector('input');
  if (firstInput) firstInput.focus();
}

function editManufacturerDefaults() {
  const modal = document.getElementById('defaults-modal');
  modal.innerHTML = '';
  const form = document.createElement('form');

  const subtypeLabel = document.createElement('label');
  subtypeLabel.textContent = 'Subtype ';
  const subtypeSelect = document.createElement('select');
  Object.keys(componentMeta).forEach(sub => {
    const opt = document.createElement('option');
    opt.value = sub;
    opt.textContent = sub;
    subtypeSelect.appendChild(opt);
  });
  subtypeLabel.appendChild(subtypeSelect);
  form.appendChild(subtypeLabel);

  const fields = ['manufacturer', 'model', 'voltage', 'ratings'];
  const inputs = {};
  fields.forEach(f => {
    const lbl = document.createElement('label');
    lbl.textContent = f.charAt(0).toUpperCase() + f.slice(1) + ' ';
    const input = document.createElement('input');
    input.type = f === 'voltage' ? 'number' : 'text';
    lbl.appendChild(input);
    form.appendChild(lbl);
    inputs[f] = input;
  });

  function loadValues() {
    const defs = manufacturerDefaults[subtypeSelect.value] || {};
    fields.forEach(f => {
      inputs[f].value = defs[f] || '';
    });
  }
  subtypeSelect.addEventListener('change', loadValues);
  loadValues();

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.textContent = 'Save';
  form.appendChild(saveBtn);
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => modal.classList.remove('show'));
  form.appendChild(cancelBtn);

  form.addEventListener('submit', e => {
    e.preventDefault();
    const sub = subtypeSelect.value;
    manufacturerDefaults[sub] = {};
    fields.forEach(f => {
      manufacturerDefaults[sub][f] = inputs[f].value;
    });
    setItem('manufacturerDefaults', manufacturerDefaults);
    modal.classList.remove('show');
    showToast('Defaults updated');
  });

  modal.appendChild(form);
  return modal;
}

// --- Tooltip module ---
const tooltip = document.createElement('div');
tooltip.id = 'component-tooltip';
tooltip.style.display = 'none';
document.body.appendChild(tooltip);

function positionTooltip(e) {
  tooltip.style.left = e.pageX + 10 + 'px';
  tooltip.style.top = e.pageY + 10 + 'px';
}

function showTooltip(e) {
  const text = e.currentTarget.dataset.tooltip;
  if (!text) return;
  tooltip.textContent = text;
  positionTooltip(e);
  tooltip.style.display = 'block';
}

function moveTooltip(e) {
  if (tooltip.style.display === 'block') positionTooltip(e);
}

function hideTooltip() {
  tooltip.style.display = 'none';
}

function pushHistory() {
  history = history.slice(0, historyIndex + 1);
  history.push(JSON.parse(JSON.stringify(components)));
  historyIndex = history.length - 1;
}

function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    components = JSON.parse(JSON.stringify(history[historyIndex]));
    selected = null;
    selection = [];
    selectedConnection = null;
    render();
    save();
  }
}

function redo() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    components = JSON.parse(JSON.stringify(history[historyIndex]));
    selected = null;
    selection = [];
    selectedConnection = null;
    render();
    save();
  }
}

function loadTemplates() {
  try {
    templates = JSON.parse(localStorage.getItem('onelineTemplates')) || [];
  } catch {
    templates = [];
  }
}

function saveTemplates() {
  localStorage.setItem('onelineTemplates', JSON.stringify(templates));
}

function renderTemplates() {
  const container = document.getElementById('template-buttons');
  if (!container) return;
  container.innerHTML = '';
  if (!templates.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'no-components';
    placeholder.textContent = 'No components available';
    container.appendChild(placeholder);
    return;
  }
  templates.forEach(t => {
    const btn = document.createElement('button');
    btn.textContent = t.name;
    btn.dataset.subtype = t.component.subtype;
    btn.dataset.label = t.name;
    btn.addEventListener('click', () => addTemplateComponent(t.component));
    container.appendChild(btn);
  });
}

function addTemplateComponent(data) {
  const id = 'n' + Date.now();
  let x = cursorPos.x;
  let y = cursorPos.y;
  if (gridEnabled) {
    const snappedX = Math.round(x / gridSize) * gridSize;
    const snappedY = Math.round(y / gridSize) * gridSize;
    x = snappedX;
    y = snappedY;
  }
  components.push({
    id,
    ...JSON.parse(JSON.stringify(data)),
    x,
    y,
    connections: []
  });
  pushHistory();
  render();
  save();
  if (gridEnabled) flashSnapIndicator(x, y);
}

function exportTemplates() {
  const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'onelineTemplates.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  showToast('Templates exported');
}

async function importTemplates(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      templates = templates.concat(data);
      saveTemplates();
      renderTemplates();
      showToast('Templates imported');
    }
  } catch (err) {
    console.error('Failed to import templates', err);
  }
  e.target.value = '';
}

function setupLibraryTools() {
  const reloadBtn = document.getElementById('reload-library-btn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', async () => {
      await loadComponentLibrary();
      showToast('Component library reloaded');
    });
  }
}

const cableColors = {
  Power: '#f00',
  Control: '#00f',
  Signal: '#0a0'
};

function getCableForConnection(source, target, conn) {
  if (source?.type === 'cable') return source.cable || null;
  if (target?.type === 'cable') return target.cable || null;
  return conn?.cable || null;
}

function parseCablePhases(cable) {
  if (!cable) return [];
  if (Array.isArray(cable.phases)) return cable.phases.map(p => String(p).trim().toUpperCase()).filter(Boolean);
  if (typeof cable.phases === 'number') {
    if (cable.phases === 3) return ['A', 'B', 'C'];
    if (cable.phases === 2) return ['A', 'B'];
    if (cable.phases === 1) return ['A'];
    return [];
  }
  if (typeof cable.phases === 'string') {
    return cable.phases
      .split(/[\s,]+/)
      .map(p => p.trim().toUpperCase())
      .filter(Boolean);
  }
  return [];
}

// Phase sequence colors used for connection rendering
const phaseColors = {
  A: '#f00',
  B: '#00f',
  C: '#0a0',
  AB: '#800080',
  BC: '#008080',
  AC: '#ffa500',
  ABC: '#555'
};

// Voltage range configuration used for coloring components and connections
const voltageColors = [
  { max: 600, color: '#4caf50', label: '\u2264600V' },
  { max: 5000, color: '#ff9800', label: '600V-5000V' },
  { max: Infinity, color: '#f44336', label: '>5000V' }
];

function getVoltageRange(voltage) {
  const v = parseFloat(voltage);
  if (isNaN(v)) return null;
  return voltageColors.find(r => v <= r.max) || null;
}

function updateLegend(ranges) {
  const legend = document.getElementById('voltage-legend');
  if (!legend) return;
  legend.innerHTML = '';
  voltageColors.forEach(r => {
    if (ranges.has(r)) {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'legend-color';
      swatch.style.background = r.color;
      item.appendChild(swatch);
      const lbl = document.createElement('span');
      lbl.textContent = r.label;
      item.appendChild(lbl);
      legend.appendChild(item);
    }
  });
  if (showOverlays) {
    const items = [
      { color: '#4caf50', label: 'Voltage \u2264 5% dev' },
      { color: '#ffeb3b', label: '5-10% dev' },
      { color: '#f44336', label: '>10% dev' }
    ];
    items.forEach(i => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'legend-color';
      swatch.style.background = i.color;
      item.appendChild(swatch);
      const lbl = document.createElement('span');
      lbl.textContent = i.label;
      item.appendChild(lbl);
      legend.appendChild(item);
    });
  }
  legend.style.display = ranges.size || showOverlays ? 'block' : 'none';
  if (!legendUserMoved && legend.style.display === 'block') {
    const host = legend.offsetParent instanceof HTMLElement ? legend.offsetParent : legend.parentElement;
    const parentWidth = host instanceof HTMLElement ? host.clientWidth : (legend.parentElement?.clientWidth || window.innerWidth);
    const parentHeight = host instanceof HTMLElement ? host.clientHeight : (legend.parentElement?.clientHeight || window.innerHeight);
    const legendWidth = legend.offsetWidth || 0;
    const legendHeight = legend.offsetHeight || 0;
    const maxLeft = parentWidth - legendWidth;
    const preferredLeft = maxLeft - 10;
    const clampedLeft = Math.max(0, preferredLeft >= 0 ? preferredLeft : maxLeft >= 0 ? maxLeft : 0);
    const clampedTop = Math.max(0, Math.min(10, parentHeight - legendHeight));
    legend.style.left = `${clampedLeft}px`;
    legend.style.top = `${clampedTop}px`;
  }
}

function resolveComponentCategory(comp) {
  if (!comp) return '';
  const meta = componentMeta[comp.subtype];
  const metaCategory = normalizeCategoryValue(meta?.category);
  if (metaCategory) return metaCategory;
  if (meta?.type) {
    const typeCategory = categoryForType(meta.type);
    if (typeCategory) return typeCategory;
  }
  const storedCategory = normalizeCategoryValue(subtypeCategory[comp.subtype]);
  if (storedCategory) return storedCategory;
  const compCategory = normalizeCategoryValue(comp.category);
  if (compCategory) return compCategory;
  if (comp.type) return categoryForType(comp.type);
  return '';
}

function defaultLabelAnchor(comp) {
  const category = resolveComponentCategory(comp);
  const bounds = componentBounds(comp);
  if (category === 'load') {
    return {
      x: (bounds.left + bounds.right) / 2,
      y: bounds.bottom + 15
    };
  }
  return {
    x: bounds.right + 15,
    y: (bounds.top + bounds.bottom) / 2
  };
}

function getLabelPosition(comp) {
  const offset = comp.labelOffset || { x: 0, y: 0 };
  const base = defaultLabelAnchor(comp);
  return {
    x: base.x + (Number(offset.x) || 0),
    y: base.y + (Number(offset.y) || 0)
  };
}

function getLabelAlignment(comp) {
  return resolveComponentCategory(comp) === 'load' ? 'middle' : 'start';
}

function attachLabelInteractions(el, comp) {
  if (!el) return;
  el.addEventListener('mousedown', e => {
    e.stopPropagation();
    selected = comp;
    selection = [comp];
    selectedConnection = null;
    const pos = getLabelPosition(comp);
    const coords = toDiagramCoords(e);
    draggingLabel = {
      component: comp,
      dx: coords.x - pos.x,
      dy: coords.y - pos.y,
      moved: false
    };
  });
  el.addEventListener('click', e => {
    e.stopPropagation();
    if (!selection.includes(comp)) {
      selection = [comp];
      selected = comp;
      selectedConnection = null;
      render();
    }
  });
  el.addEventListener('dblclick', e => {
    e.stopPropagation();
    cancelPendingClickSelection();
    selectComponent(comp);
  });
}

function formatAttributeLabel(key) {
  if (!key) return '';
  return key
    .replace(/\./g, '_')
    .split('_')
    .filter(Boolean)
    .map(part => {
      const normalized = part.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
      if (normalized.length <= 3 && normalized === normalized.toUpperCase()) return normalized;
      if (normalized.length <= 3) return normalized.toUpperCase();
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatOverlayMetric(value, unit, decimals = 2) {
  if (value === null || value === undefined) return '';
  const formatNumber = val => {
    const num = Number(val);
    if (!Number.isFinite(num)) return null;
    return num.toFixed(decimals);
  };
  if (typeof value === 'object') {
    const parts = Object.entries(value)
      .map(([key, val]) => {
        const formatted = formatNumber(val);
        if (formatted === null) return null;
        return `${key}:${formatted}`;
      })
      .filter(Boolean);
    if (!parts.length) return '';
    return `${parts.join(', ')} ${unit}`;
  }
  const formatted = formatNumber(value);
  return formatted === null ? '' : `${formatted} ${unit}`;
}

function inferAttributeUnit(key) {
  const lower = key.toLowerCase();
  if (lower.includes('voltage') || lower.endsWith('volts')) return 'V';
  if (lower.endsWith('_ka')) return 'kA';
  if (lower.endsWith('_kv')) return 'kV';
  if (lower.endsWith('_kw') || lower.endsWith('kw')) return 'kW';
  if (lower.endsWith('kva') || lower.endsWith('_kva')) return 'kVA';
  if (lower.endsWith('_a') || lower.endsWith('amps') || lower.endsWith('current_a')) return 'A';
  if (lower.includes('percent') || lower.endsWith('_pct') || lower.includes('impedance') || lower.endsWith('%')) return '%';
  if (lower.includes('efficiency')) return '%';
  if (lower.endsWith('_hz') || lower.endsWith('hz')) return 'Hz';
  if (lower.endsWith('_ft')) return 'ft';
  if (lower.endsWith('_m')) return 'm';
  return '';
}

function getAttributeOption(key) {
  if (!key) return null;
  if (attributeOptionsMap.has(key)) return attributeOptionsMap.get(key);
  const override = attributeDisplayOverrides[key];
  const label = override?.label || formatAttributeLabel(key);
  const unit = override && Object.prototype.hasOwnProperty.call(override, 'unit')
    ? override.unit
    : inferAttributeUnit(key);
  const option = { key, label, unit };
  attributeOptionsMap.set(key, option);
  return option;
}

function formatAttributeValue(key, value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const abs = Math.abs(value);
    const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    let formatted = value.toFixed(decimals);
    if (decimals > 0) formatted = formatted.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
    return formatted;
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function getNestedValue(source, segments = []) {
  let current = source;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

function resolveComponentAttribute(comp, key) {
  if (!comp || !key) return undefined;
  if (!key.includes('.')) {
    let value = comp[key];
    if (value === undefined && comp.props && typeof comp.props === 'object') {
      value = comp.props[key];
    }
    return value;
  }
  const segments = key.split('.');
  let value = getNestedValue(comp, segments);
  if (value !== undefined) return value;
  if (comp.props && typeof comp.props === 'object') {
    value = getNestedValue(comp.props, segments);
    if (value !== undefined) return value;
  }
  const resolver = studyAttributeResolvers[segments[0]];
  if (resolver) {
    const base = resolver(comp);
    if (base && typeof base === 'object') {
      value = getNestedValue(base, segments.slice(1));
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

function getComponentAttributeLines(comp) {
  if (!viewAttributes.size) return [];
  const keys = Array.from(viewAttributes);
  keys.sort((a, b) => {
    const optA = getAttributeOption(a);
    const optB = getAttributeOption(b);
    return (optA?.label || a).localeCompare(optB?.label || b);
  });
  const lines = [];
  keys.forEach(key => {
    const option = getAttributeOption(key);
    if (!option) return;
    const value = resolveComponentAttribute(comp, option.key);
    const formatted = formatAttributeValue(option.key, value);
    if (formatted === null) return;
    const unit = option.unit || '';
    const valueText = unit ? `${formatted} ${unit}`.trim() : formatted;
    const labelText = option.label || formatAttributeLabel(option.key);
    lines.push(`${labelText}: ${valueText}`.trim());
  });
  return lines;
}

function getComponentDisplayLabel(key) {
  if (!key) return 'Component';
  if (key === '__other__') return 'Other Attributes';
  if (componentAttributeLabelMap.has(key)) return componentAttributeLabelMap.get(key);
  const meta = componentMeta[key];
  if (meta?.label) return meta.label;
  if (meta?.subtype) return formatAttributeLabel(meta.subtype);
  if (typeof key === 'string') {
    const parts = key.split('_');
    if (parts.length > 1) {
      return formatAttributeLabel(parts.slice(1).join('_'));
    }
    return formatAttributeLabel(key);
  }
  return 'Component';
}

function openViewModal() {
  const btn = document.getElementById('view-menu-btn');
  if (btn) btn.setAttribute('aria-expanded', 'true');
  const hasComponents = componentAttributeList.length > 0;
  const closePromise = openModal({
    title: 'Component Views',
    primaryText: 'Done',
    secondaryText: null,
    closeOnBackdrop: true,
    variant: 'wide',
    render(body, controller) {
      body.classList.add('view-modal-body');
      if (!hasComponents) {
        const empty = document.createElement('p');
        empty.className = 'view-modal-empty';
        empty.textContent = 'No attributes are available to display.';
        controller.setPrimaryDisabled(true);
        body.appendChild(empty);
        return empty;
      }

      const layout = document.createElement('div');
      layout.className = 'view-modal-layout';

      const componentColumn = document.createElement('div');
      componentColumn.className = 'view-modal-column view-modal-components';
      const componentHeading = document.createElement('h3');
      componentHeading.className = 'view-modal-heading';
      componentHeading.textContent = 'Components';
      const componentListEl = document.createElement('div');
      componentListEl.className = 'view-component-list';
      componentColumn.append(componentHeading, componentListEl);

      const propertyColumn = document.createElement('div');
      propertyColumn.className = 'view-modal-column view-modal-properties';
      const propertyHeading = document.createElement('h3');
      propertyHeading.className = 'view-modal-heading';
      const propertyList = document.createElement('div');
      propertyList.className = 'view-property-list';
      propertyColumn.append(propertyHeading, propertyList);

      layout.append(componentColumn, propertyColumn);
      body.appendChild(layout);

      const buttonMap = new Map();
      let activeKey = selectedViewComponent;
      if (!activeKey || !componentAttributeOptions.has(activeKey)) {
        activeKey = componentAttributeList[0]?.key || null;
      }
      if (activeKey !== selectedViewComponent) {
        selectedViewComponent = activeKey;
        if (selectedViewComponent) setItem(viewComponentStorageKey, selectedViewComponent);
      }

      function updateButtonStates() {
        buttonMap.forEach((button, key) => {
          const selected = key === activeKey;
          const options = componentAttributeOptions.get(key) || [];
          const hasSelection = options.some(opt => viewAttributes.has(opt.key));
          button.classList.toggle('is-active', selected);
           button.classList.toggle('has-selection', hasSelection);
          button.setAttribute('aria-pressed', String(selected));
          button.tabIndex = selected ? 0 : -1;
          const indicator = button.querySelector('.view-component-indicator');
          if (indicator) indicator.hidden = !hasSelection;
        });
      }

      function toggleAttribute(option, checked) {
        if (!option) return;
        if (checked) {
          viewAttributes.add(option.key);
        } else {
          viewAttributes.delete(option.key);
        }
        const persisted = Array.from(viewAttributes);
        persisted.sort();
        setItem(viewAttributeStorageKey, persisted);
        updateViewButtonLabel();
        render();
        updateButtonStates();
      }

      function renderProperties() {
        propertyList.innerHTML = '';
        if (!activeKey || !componentAttributeOptions.has(activeKey)) {
          propertyHeading.textContent = 'Properties';
          const empty = document.createElement('p');
          empty.className = 'view-modal-empty';
          empty.textContent = 'Select a component to see its properties.';
          propertyList.appendChild(empty);
          return;
        }
        const options = componentAttributeOptions.get(activeKey) || [];
        const componentLabel = getComponentDisplayLabel(activeKey);
        propertyHeading.textContent = `${componentLabel} Properties`;
        if (!options.length) {
          const empty = document.createElement('p');
          empty.className = 'view-modal-empty';
          empty.textContent = 'No properties available for this component.';
          propertyList.appendChild(empty);
          return;
        }
        options.forEach(opt => {
          const label = document.createElement('label');
          label.className = 'view-property-option';
          label.dataset.key = opt.key;
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = viewAttributes.has(opt.key);
          input.addEventListener('change', () => {
            label.classList.toggle('is-selected', input.checked);
            toggleAttribute(opt, input.checked);
          });
          const text = document.createElement('span');
          text.className = 'view-property-label';
          text.textContent = opt.unit ? `${opt.label} (${opt.unit})` : opt.label;
          label.classList.toggle('is-selected', input.checked);
          label.append(input, text);
          propertyList.appendChild(label);
        });
      }

      function setActiveComponent(key) {
        if (!key || !componentAttributeOptions.has(key)) return;
        activeKey = key;
        selectedViewComponent = key;
        setItem(viewComponentStorageKey, key);
        updateButtonStates();
        renderProperties();
      }

      componentAttributeList.forEach(entry => {
        if (!componentAttributeOptions.has(entry.key)) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'view-component-option';
        button.dataset.key = entry.key;
        button.setAttribute('aria-pressed', 'false');

        const labelText = entry.label || getComponentDisplayLabel(entry.key);
        const labelSpan = document.createElement('span');
        labelSpan.className = 'view-component-label';
        labelSpan.textContent = labelText;

        const indicator = document.createElement('span');
        indicator.className = 'view-component-indicator';
        indicator.textContent = 'Filtered';
        indicator.hidden = true;

        button.append(labelSpan, indicator);
        button.addEventListener('click', () => setActiveComponent(entry.key));
        button.addEventListener('keydown', event => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          const currentIndex = componentAttributeList.findIndex(item => item.key === activeKey);
          if (currentIndex === -1) return;
          const offset = event.key === 'ArrowUp' ? -1 : 1;
          let nextIndex = currentIndex + offset;
          if (nextIndex < 0) nextIndex = 0;
          if (nextIndex >= componentAttributeList.length) nextIndex = componentAttributeList.length - 1;
          const nextKey = componentAttributeList[nextIndex]?.key;
          if (!nextKey) return;
          setActiveComponent(nextKey);
          const nextButton = buttonMap.get(nextKey);
          nextButton?.focus();
        });
        buttonMap.set(entry.key, button);
        componentListEl.appendChild(button);
      });

      updateButtonStates();
      renderProperties();

      const initialButton = buttonMap.get(activeKey);
      if (initialButton) {
        controller.setInitialFocus(initialButton);
      }

      return initialButton;
    }
  });
  if (closePromise && typeof closePromise.finally === 'function') {
    closePromise.finally(() => {
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  } else if (btn) {
    btn.setAttribute('aria-expanded', 'false');
  }
}

function updateViewButtonLabel() {
  const btn = document.getElementById('view-menu-btn');
  if (!btn) return;
  const count = viewAttributes.size;
  btn.textContent = count ? `Views (${count})` : 'Views';
  const hasOptions = attributeOptions.length > 0 && componentAttributeList.length > 0;
  btn.disabled = !hasOptions;
  if (!hasOptions) {
    btn.title = 'No component properties are available to view';
  } else {
    btn.title = 'Select component properties to display';
  }
}

function refreshAttributeOptions() {
  cachedStudyResults = getStudies();
  const optionMap = new Map();
  const componentOptionMap = new Map();
  const componentLabelMap = new Map();
  const componentById = new Map();

  const registerOption = key => {
    if (!key) return null;
    if (attributeIgnoreKeys.has(key)) return null;
    const normalized = String(key);
    if (optionMap.has(normalized)) return optionMap.get(normalized);
    const override = attributeDisplayOverrides[normalized];
    const label = override?.label || formatAttributeLabel(normalized);
    const unit = override && Object.prototype.hasOwnProperty.call(override, 'unit')
      ? override.unit
      : inferAttributeUnit(normalized);
    const option = { key: normalized, label, unit };
    optionMap.set(normalized, option);
    return option;
  };

  const registerComponentLabel = (compKey, fallbackLabel) => {
    if (!compKey) return;
    if (componentLabelMap.has(compKey)) return;
    const meta = componentMeta[compKey];
    if (meta?.label) {
      componentLabelMap.set(compKey, meta.label);
      return;
    }
    if (typeof fallbackLabel === 'string' && fallbackLabel.trim()) {
      componentLabelMap.set(compKey, fallbackLabel.trim());
      return;
    }
    if (meta?.subtype) {
      componentLabelMap.set(compKey, formatAttributeLabel(meta.subtype));
      return;
    }
    if (typeof compKey === 'string') {
      const parts = compKey.split('_');
      const formatted = formatAttributeLabel(parts.length > 1 ? parts.slice(1).join('_') : compKey);
      componentLabelMap.set(compKey, formatted);
      return;
    }
    componentLabelMap.set(compKey, 'Component');
  };

  const addComponentKey = (compKey, key) => {
    if (!compKey) return;
    const option = registerOption(key);
    if (!option) return;
    if (!componentOptionMap.has(compKey)) {
      componentOptionMap.set(compKey, new Map());
    }
    componentOptionMap.get(compKey).set(option.key, option);
  };

  Object.entries(componentMeta).forEach(([compKey, meta]) => {
    registerComponentLabel(compKey, meta?.label);
    Object.entries(meta.props || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === 'object') return;
      addComponentKey(compKey, key);
    });
  });

  const allSheets = Array.isArray(sheets) ? sheets : [];
  allSheets.forEach(sheet => {
    (sheet.components || []).forEach(comp => {
      if (!comp) return;
      const compKey = comp.subtype || comp.type;
      if (!compKey) return;
      if (comp.id) componentById.set(comp.id, comp);
      const fallbackLabel = componentMeta[compKey]?.label || comp.type || comp.label;
      registerComponentLabel(compKey, fallbackLabel);
      Object.entries(comp).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (typeof value === 'object') return;
        addComponentKey(compKey, key);
      });
      if (comp.props && typeof comp.props === 'object') {
        Object.entries(comp.props).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          if (typeof value === 'object') return;
          addComponentKey(compKey, key);
        });
      }
    });
  });

  const registerStudyAttributes = (namespace, data) => {
    if (!data || typeof data !== 'object') return;
    Object.entries(data).forEach(([id, record]) => {
      const comp = componentById.get(id);
      if (!comp) return;
      const compKey = comp.subtype || comp.type;
      if (!compKey) return;
      if (!record || typeof record !== 'object') return;
      Object.entries(record).forEach(([prop, value]) => {
        if (value === undefined || value === null) return;
        if (typeof value === 'object') return;
        const combinedKey = `${namespace}.${prop}`;
        const option = registerOption(combinedKey);
        if (!option) return;
        addComponentKey(compKey, option.key);
      });
    });
  };

  registerStudyAttributes('arcFlash', cachedStudyResults?.arcFlash);
  registerStudyAttributes('shortCircuit', cachedStudyResults?.shortCircuit);
  const reliabilityStats = cachedStudyResults?.reliability?.componentStats;
  if (reliabilityStats && typeof reliabilityStats === 'object') {
    const mapped = {};
    Object.entries(reliabilityStats).forEach(([id, stats]) => {
      if (!stats || typeof stats !== 'object') return;
      mapped[id] = {
        availability: stats.availability,
        downtime: stats.downtime
      };
    });
    registerStudyAttributes('reliability', mapped);
  }

  viewAttributes.forEach(key => registerOption(key));

  attributeOptions = Array.from(optionMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  attributeOptionsMap.clear();
  attributeOptions.forEach(opt => attributeOptionsMap.set(opt.key, opt));

  componentAttributeOptions = new Map();
  componentAttributeList = [];
  componentAttributeLabelMap = new Map();

  componentOptionMap.forEach((options, compKey) => {
    const list = Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
    componentAttributeOptions.set(compKey, list);
    const label = componentLabelMap.get(compKey) || getComponentDisplayLabel(compKey);
    componentAttributeLabelMap.set(compKey, label);
    componentAttributeList.push({ key: compKey, label });
  });

  const orphanKeys = new Set(viewAttributes);
  componentAttributeOptions.forEach(options => {
    options.forEach(opt => orphanKeys.delete(opt.key));
  });
  if (orphanKeys.size) {
    const orphanOptions = Array.from(orphanKeys)
      .map(key => attributeOptionsMap.get(key))
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label));
    if (orphanOptions.length) {
      const orphanLabel = 'Other Attributes';
      componentAttributeOptions.set('__other__', orphanOptions);
      componentAttributeLabelMap.set('__other__', orphanLabel);
      componentAttributeList.push({ key: '__other__', label: orphanLabel });
    }
  }

  componentAttributeList.sort((a, b) => {
    if (a.key === '__other__') return 1;
    if (b.key === '__other__') return -1;
    return a.label.localeCompare(b.label);
  });

  if (selectedViewComponent && !componentAttributeOptions.has(selectedViewComponent)) {
    selectedViewComponent = componentAttributeList[0]?.key || null;
    if (selectedViewComponent) {
      setItem(viewComponentStorageKey, selectedViewComponent);
    }
  }

  updateViewButtonLabel();
}

function portPosition(c, portIndex) {
  const meta = componentMeta[c.subtype] || {};
  const w = c.width || compWidth;
  const h = c.height || compHeight;
  const ports = c.ports || meta.ports;
  const port = ports?.[portIndex];
  if (!port) {
    return { x: c.x + w / 2, y: c.y + h / 2 };
  }
  let { x, y } = port;
  if (c.flipped) x = w - x;
  let px = c.x + x;
  let py = c.y + y;
  const angle = (c.rotation || 0) * Math.PI / 180;
  if (angle) {
    const cx = c.x + w / 2;
    const cy = c.y + h / 2;
    const dx = px - cx;
    const dy = py - cy;
    px = cx + dx * Math.cos(angle) - dy * Math.sin(angle);
    py = cy + dx * Math.sin(angle) + dy * Math.cos(angle);
  }
  return { x: px, y: py };
}

function portDirection(c, portIndex) {
  const pos = portPosition(c, portIndex);
  if (!pos) return null;
  const w = c.width || compWidth;
  const h = c.height || compHeight;
  const cx = c.x + w / 2;
  const cy = c.y + h / 2;
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx < 0 ? 'left' : 'right';
  }
  return dy < 0 ? 'top' : 'bottom';
}

function normalizePortIndex(port) {
  const idx = Number(port);
  return Number.isFinite(idx) ? idx : 0;
}

function portInUse(component, portIndex, skipConn = null) {
  const idx = normalizePortIndex(portIndex);
  if ((component.connections || []).some(conn => conn !== skipConn && normalizePortIndex(conn.sourcePort) === idx)) {
    return true;
  }
  return components.some(comp => (comp.connections || []).some(conn => {
    if (conn === skipConn) return false;
    return conn.target === component.id && normalizePortIndex(conn.targetPort) === idx;
  }));
}

const transformerVoltageKeyMap = {
  two_winding: ['volts_primary', 'volts_secondary'],
  auto_transformer: ['volts_primary', 'volts_secondary'],
  grounding_transformer: ['volts_primary', 'volts_secondary'],
  three_winding: ['volts_hv', 'volts_lv', 'volts_tv']
};

function parseVoltageNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const str = String(value);
  const match = str.replace(/[,\s]+/g, ' ').match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  if (!match) return null;
  const num = Number.parseFloat(match[0]);
  return Number.isFinite(num) ? num : null;
}

function resolveTransformerVoltageValue(transformer, portIndex) {
  if (!transformer) return null;
  const metaProps = componentMeta[transformer.subtype]?.props || {};
  const subtypeKeys = transformerVoltageKeyMap[transformer.subtype] || [];
  const fallbacks = portIndex === 0
    ? ['volts_primary', 'voltage_primary', 'primary_voltage', 'volts_hv', 'voltage']
    : portIndex === 1
      ? ['volts_secondary', 'voltage_secondary', 'secondary_voltage', 'volts_lv', 'voltage']
      : ['volts_tv', 'volts_tertiary', 'tertiary_voltage', 'volts_lv', 'voltage'];
  const keys = [subtypeKeys[portIndex], ...fallbacks];
  const seen = new Set();
  for (const key of keys) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const value = transformer[key] ?? transformer.props?.[key] ?? metaProps[key];
    const num = parseVoltageNumber(value);
    if (num !== null) return num;
  }
  return null;
}

function formatVoltageString(num) {
  if (!Number.isFinite(num)) return null;
  const rounded = Number(num.toFixed(4));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function assignInheritedVoltage(target, voltageValue, connection = null) {
  if (!target) return false;
  const num = parseVoltageNumber(voltageValue);
  if (num === null) return false;
  const formatted = formatVoltageString(num);
  if (!formatted) return false;
  const current = target.voltage ?? '';
  const changed = String(current) !== formatted;
  target.voltage = formatted;
  if (connection) connection.voltage = formatted;
  return changed;
}

function propagateTransformerVoltages(comps) {
  if (!Array.isArray(comps) || !comps.length) return;
  const byId = new Map();
  comps.forEach(comp => { if (comp?.id) byId.set(comp.id, comp); });
  const inbound = new Map();
  comps.forEach(comp => {
    (comp.connections || []).forEach(conn => {
      if (!byId.has(conn.target)) return;
      if (!inbound.has(conn.target)) inbound.set(conn.target, []);
      inbound.get(conn.target).push({ from: comp, connection: conn });
    });
  });

  comps.forEach(transformer => {
    if (!transformer || transformer.type !== 'transformer') return;
    const ports = transformer.ports || componentMeta[transformer.subtype]?.ports || [];
    const portCount = ports.length || 2;
    const secondaryPorts = [];
    for (let idx = 0; idx < portCount; idx += 1) {
      if (idx === 0 && portCount > 1) continue;
      secondaryPorts.push(idx);
    }
    secondaryPorts.forEach(portIdx => {
      const voltageValue = resolveTransformerVoltageValue(transformer, portIdx);
      if (voltageValue === null) return;
      const queue = [];
      const visited = new Set([transformer.id]);
      (transformer.connections || []).forEach(conn => {
        if (normalizePortIndex(conn.sourcePort) !== portIdx) return;
        const target = byId.get(conn.target);
        if (!target || target.type === 'transformer') return;
        queue.push({ component: target, connection: conn });
      });
      (inbound.get(transformer.id) || []).forEach(entry => {
        if (normalizePortIndex(entry.connection?.targetPort) !== portIdx) return;
        const sourceComp = entry.from;
        if (!sourceComp || sourceComp.type === 'transformer') return;
        queue.push({ component: sourceComp, connection: entry.connection });
      });
      while (queue.length) {
        const { component: current, connection } = queue.shift();
        if (!current || visited.has(current.id)) continue;
        visited.add(current.id);
        assignInheritedVoltage(current, voltageValue, connection);
        (current.connections || []).forEach(conn => {
          const neighbor = byId.get(conn.target);
          if (!neighbor || neighbor.type === 'transformer' || visited.has(neighbor.id)) return;
          queue.push({ component: neighbor, connection: conn });
        });
        (inbound.get(current.id) || []).forEach(entry => {
          const neighbor = entry.from;
          if (!neighbor || neighbor.type === 'transformer' || visited.has(neighbor.id)) return;
          queue.push({ component: neighbor, connection: entry.connection });
        });
      }
    });
  });
}

function applyTransformerVoltages(scope = sheets) {
  if (!scope) return;
  if (Array.isArray(scope) && scope.length && Array.isArray(scope[0]?.components)) {
    scope.forEach(sheet => propagateTransformerVoltages(sheet.components || []));
  } else if (Array.isArray(scope)) {
    propagateTransformerVoltages(scope);
  } else if (scope?.components) {
    propagateTransformerVoltages(scope.components);
  }
}

function captureBusAnchors(bus) {
  const anchors = [];
  (bus.connections || []).forEach(conn => {
    const index = normalizePortIndex(conn.sourcePort);
    anchors.push({ type: 'source', conn, point: portPosition(bus, index) });
  });
  components.forEach(comp => {
    (comp.connections || []).forEach(conn => {
      if (conn.target !== bus.id) return;
      const index = normalizePortIndex(conn.targetPort);
      anchors.push({ type: 'target', conn, point: portPosition(bus, index) });
    });
  });
  return anchors;
}

function reassignBusAnchors(bus, anchors = []) {
  if (!anchors.length) return;
  const ports = bus.ports || [];
  if (!ports.length) return;
  const worldPorts = ports.map((_, idx) => ({ idx, point: portPosition(bus, idx) }));
  anchors.forEach(anchor => {
    let best = null;
    let bestDist = Infinity;
    worldPorts.forEach(port => {
      const dx = port.point.x - anchor.point.x;
      const dy = port.point.y - anchor.point.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = port;
      }
    });
    if (!best) return;
    if (anchor.type === 'source') {
      if (normalizePortIndex(anchor.conn.sourcePort) !== best.idx) {
        anchor.conn.sourcePort = best.idx;
        delete anchor.conn.mid;
        delete anchor.conn.dir;
      }
    } else if (anchor.type === 'target') {
      if (normalizePortIndex(anchor.conn.targetPort) !== best.idx) {
        anchor.conn.targetPort = best.idx;
        delete anchor.conn.mid;
        delete anchor.conn.dir;
      }
    }
  });
}

function nearestPorts(src, tgt) {
  const srcPorts = src.ports || componentMeta[src.subtype]?.ports || [{ x: (src.width || compWidth) / 2, y: (src.height || compHeight) / 2 }];
  const tgtPorts = tgt.ports || componentMeta[tgt.subtype]?.ports || [{ x: (tgt.width || compWidth) / 2, y: (tgt.height || compHeight) / 2 }];
  let min = Infinity;
  let best = [0, 0];
  srcPorts.forEach((_, i) => {
    tgtPorts.forEach((_, j) => {
      const sp = portPosition(src, i);
      const tp = portPosition(tgt, j);
      const dx = sp.x - tp.x;
      const dy = sp.y - tp.y;
      const d = dx * dx + dy * dy;
      if (d < min) {
        min = d;
        best = [i, j];
      }
    });
  });
  return best;
}

function nearestPortToPoint(x, y, exclude) {
  let min = Infinity;
  let best = null;
  components.forEach(c => {
    if (exclude && c === exclude.component) return;
    const ports = c.ports || componentMeta[c.subtype]?.ports || [];
    ports.forEach((p, idx) => {
      const pos = portPosition(c, idx);
      const dx = pos.x - x;
      const dy = pos.y - y;
      const d = Math.hypot(dx, dy);
      if (d < min) {
        min = d;
        best = { component: c, port: idx, pos };
      }
    });
  });
  return best;
}

function componentsAreLinked(a, b) {
  if (!a || !b) return false;
  const forward = Array.isArray(a.connections) && a.connections.some(conn => conn?.target === b.id);
  if (forward) return true;
  return Array.isArray(b.connections) && b.connections.some(conn => conn?.target === a.id);
}

function hasForwardConnection(from, to) {
  if (!from || !to) return false;
  return Array.isArray(from.connections) && from.connections.some(conn => conn?.target === to.id);
}

function findSharedBusBetween(a, b) {
  if (!a || !b) return null;
  return components.find(comp => {
    if (!isBusComponent(comp) || comp === a || comp === b) return false;
    const linkedToA = componentsAreLinked(comp, a);
    const linkedToB = componentsAreLinked(comp, b);
    return linkedToA && linkedToB;
  }) || null;
}

function isImpedanceDevice(comp) {
  if (!comp) return false;
  if (isBusComponent(comp)) return false;
  const category = resolveComponentCategory(comp);
  if (!category || category === 'annotations' || category === 'links' || category === 'cable') return false;
  return hasImpedance(comp);
}

function getDefaultBusSubtype() {
  const entry = Object.keys(componentMeta).find(key => componentMeta[key]?.type === 'bus');
  return entry || 'Bus';
}

function nearestPortIndexForPoint(comp, point) {
  if (!comp) return 0;
  const meta = componentMeta[comp.subtype] || {};
  const ports = comp.ports || meta.ports || [];
  if (!ports.length) return 0;
  const target = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
  let bestIdx = 0;
  let bestScore = Infinity;
  ports.forEach((_, idx) => {
    const pos = portPosition(comp, idx);
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    const baseDist = Math.hypot(pos.x - (target ? target.x : pos.x), pos.y - (target ? target.y : pos.y));
    const occupied = portInUse(comp, idx);
    const score = occupied ? baseDist + 1000 : baseDist;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });
  return bestIdx;
}

function ensureConnection(fromComp, toComp, fromPort, toPort) {
  if (!fromComp || !toComp) return false;
  fromComp.connections = fromComp.connections || [];
  const fromIdx = normalizePortIndex(fromPort);
  const toIdx = normalizePortIndex(toPort);
  const sharedBus = findSharedBusBetween(fromComp, toComp);
  if (sharedBus) {
    let changed = false;
    const startPos = portPosition(fromComp, fromIdx);
    const endPos = portPosition(toComp, toIdx);
    if (!hasForwardConnection(fromComp, sharedBus)) {
      const busPort = nearestPortIndexForPoint(sharedBus, startPos);
      changed = ensureConnection(fromComp, sharedBus, fromIdx, busPort) || changed;
    }
    if (!hasForwardConnection(sharedBus, toComp)) {
      const busPort = nearestPortIndexForPoint(sharedBus, endPos);
      changed = ensureConnection(sharedBus, toComp, busPort, toIdx) || changed;
    }
    return changed;
  }
  const linkedBus = components.find(comp => {
    if (!isBusComponent(comp) || comp === fromComp || comp === toComp) return false;
    return componentsAreLinked(comp, fromComp) || componentsAreLinked(comp, toComp);
  });
  if (linkedBus) {
    let changed = false;
    const startPos = portPosition(fromComp, fromIdx);
    const endPos = portPosition(toComp, toIdx);
    if (!hasForwardConnection(fromComp, linkedBus)) {
      const busPort = nearestPortIndexForPoint(linkedBus, startPos);
      changed = ensureConnection(fromComp, linkedBus, fromIdx, busPort) || changed;
    }
    if (!hasForwardConnection(linkedBus, toComp)) {
      const busPort = nearestPortIndexForPoint(linkedBus, endPos);
      changed = ensureConnection(linkedBus, toComp, busPort, toIdx) || changed;
    }
    if (changed) return true;
  }
  if (isImpedanceDevice(fromComp) && isImpedanceDevice(toComp) && !componentsAreLinked(fromComp, toComp)) {
    const startPos = portPosition(fromComp, fromIdx);
    const endPos = portPosition(toComp, toIdx);
    const busKey = getDefaultBusSubtype();
    const busMeta = componentMeta[busKey] || {};
    const defaultWidth = Number.isFinite(busMeta.width) ? busMeta.width : 200;
    const defaultHeight = Number.isFinite(busMeta.height) ? busMeta.height : 20;
    let busX = ((startPos?.x ?? 0) + (endPos?.x ?? 0)) / 2 - defaultWidth / 2;
    let busY = ((startPos?.y ?? 0) + (endPos?.y ?? 0)) / 2 - defaultHeight / 2;
    if (gridEnabled) {
      busX = Math.round(busX / gridSize) * gridSize;
      busY = Math.round(busY / gridSize) * gridSize;
    }
    const bus = addComponent({ subtype: busKey, type: 'bus', x: busX, y: busY, skipHistory: true });
    if (!bus) return false;
    bus.x = busX;
    bus.y = busY;
    const busFromPort = nearestPortIndexForPoint(bus, startPos);
    const busToPort = nearestPortIndexForPoint(bus, endPos);
    const createdA = ensureConnection(fromComp, bus, fromIdx, busFromPort);
    const createdB = ensureConnection(bus, toComp, busToPort, toIdx);
    return createdA || createdB;
  }
  const existingConn = fromComp.connections.find(conn => conn.target === toComp.id) || null;
  if (existingConn && normalizePortIndex(existingConn.sourcePort) === fromIdx && normalizePortIndex(existingConn.targetPort) === toIdx) {
    return false;
  }
  if (portInUse(fromComp, fromIdx, existingConn)) return false;
  if (portInUse(toComp, toIdx, existingConn)) return false;
  if (existingConn) {
    existingConn.sourcePort = fromIdx;
    existingConn.targetPort = toIdx;
    delete existingConn.mid;
    delete existingConn.dir;
    return true;
  }
  const newConn = {
    target: toComp.id,
    sourcePort: fromIdx,
    targetPort: toIdx,
    cable: null,
    phases: [],
    conductors: 0,
    impedance: { r: 0, x: 0 },
    rating: null
  };
  fromComp.connections.push(newConn);
  try {
    const fromTag = fromComp.ref || fromComp.id;
    const toTag = toComp.ref || toComp.id;
    addRaceway({ conduit_id: `${fromTag}-${toTag}`, from_tag: fromTag, to_tag: toTag });
  } catch (err) {
    console.error('Failed to record connection', err);
  }
  return true;
}

function autoAttachComponent(comp, exclude = new Set()) {
  if (!comp) return false;
  const meta = componentMeta[comp.subtype] || {};
  const ports = comp.ports || meta.ports;
  if (!ports || !ports.length) return false;
  let best = null;
  components.forEach(other => {
    if (other === comp || exclude.has(other)) return;
    const otherMeta = componentMeta[other.subtype] || {};
    const otherPorts = other.ports || otherMeta.ports;
    if (!otherPorts || !otherPorts.length) return;
    ports.forEach((_, portIdx) => {
      const compPos = portPosition(comp, portIdx);
      otherPorts.forEach((__, otherIdx) => {
        const otherPos = portPosition(other, otherIdx);
        const dist = Math.hypot(otherPos.x - compPos.x, otherPos.y - compPos.y);
        if (!best || dist < best.distance) {
          best = {
            distance: dist,
            portIdx,
            other,
            otherIdx,
            compPos,
            otherPos
          };
        }
      });
    });
  });
  if (!best) return false;
  const threshold = Math.max(12, gridSize / 2);
  if (best.distance > threshold) return false;
  const updatedCompPos = portPosition(comp, best.portIdx);
  const dx = best.otherPos.x - updatedCompPos.x;
  const dy = best.otherPos.y - updatedCompPos.y;
  let changed = false;
  if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
    comp.x = Number((comp.x + dx).toFixed(2));
    comp.y = Number((comp.y + dy).toFixed(2));
    changed = true;
  }
  const connected = ensureConnection(comp, best.other, best.portIdx, best.otherIdx);
  return changed || connected;
}

function findSourceComponent(targetId, comps = components) {
  return comps.find(c => (c.connections || []).some(conn => conn.target === targetId)) || null;
}

function normalizeComponent(c) {
  const nc = {
    ...c,
    rotation: c.rotation ?? c.rot ?? 0,
    flipped: c.flipped || false,
    connections: (c.connections || []).map(conn =>
      typeof conn === 'string' ? { target: conn } : conn
    )
  };
  if (typeof nc.labelOffset !== 'object' || nc.labelOffset === null) {
    nc.labelOffset = { x: 0, y: 0 };
  } else {
    nc.labelOffset = {
      x: Number(nc.labelOffset.x) || 0,
      y: Number(nc.labelOffset.y) || 0
    };
  }
  if (nc.type === 'annotation') {
    nc.width = Number(nc.width) || compWidth;
    nc.height = Number(nc.height) || compHeight;
  }
  if (resolveComponentCategory(nc) === 'load') {
    const basePorts = componentMeta[nc.subtype]?.ports?.length
      ? componentMeta[nc.subtype].ports
      : nc.ports;
    nc.ports = normalizePortsForCategory('load', basePorts, nc.type, nc.subtype).map(port => ({
      x: coerceNumber(port?.x, compWidth),
      y: coerceNumber(port?.y, compHeight / 2)
    }));
  }
  applyDefaults(nc);
  return nc;
}

function componentBounds(comp) {
  const w = comp.width || compWidth;
  const h = comp.height || compHeight;
  const angle = (comp.rotation || 0) * Math.PI / 180;
  if (!angle) {
    return {
      left: comp.x,
      top: comp.y,
      right: comp.x + w,
      bottom: comp.y + h
    };
  }
  const cx = comp.x + w / 2;
  const cy = comp.y + h / 2;
  const rotatePoint = (px, py) => {
    const dx = px - cx;
    const dy = py - cy;
    return {
      x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: cy + dx * Math.sin(angle) + dy * Math.cos(angle)
    };
  };
  const points = [
    rotatePoint(comp.x, comp.y),
    rotatePoint(comp.x + w, comp.y),
    rotatePoint(comp.x, comp.y + h),
    rotatePoint(comp.x + w, comp.y + h)
  ];
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys)
  };
}

function finalizeMarqueeSelection() {
  if (!marquee || !marquee.active) return false;
  const dx = Math.abs(marquee.x2 - marquee.x1);
  const dy = Math.abs(marquee.y2 - marquee.y1);
  const area = marquee;
  marquee = null;
  if (dx < marqueeThreshold && dy < marqueeThreshold) {
    return false;
  }
  const left = Math.min(area.x1, area.x2);
  const right = Math.max(area.x1, area.x2);
  const top = Math.min(area.y1, area.y2);
  const bottom = Math.max(area.y1, area.y2);
  const strict = area.x2 >= area.x1;
  const picked = components.filter(c => {
    if (c.type === 'dimension') return false;
    const bounds = componentBounds(c);
    if (strict) {
      return bounds.left >= left && bounds.right <= right && bounds.top >= top && bounds.bottom <= bottom;
    }
    return !(bounds.right < left || bounds.left > right || bounds.bottom < top || bounds.top > bottom);
  });
  selection = picked;
  selected = picked[0] || null;
  selectedConnection = null;
  return true;
}

function render() {
  applyTransformerVoltages();
  const svg = document.getElementById('diagram');
  svg.querySelectorAll('g.component, .connection, .conn-label, .port, .bus-handle, .annotation-handle, .issue-badge, .component-label, .component-attribute, .selection-marquee').forEach(el => el.remove());
  const usedVoltageRanges = new Set();
  const boundsState = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const includePoint = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    boundsState.minX = Math.min(boundsState.minX, x);
    boundsState.minY = Math.min(boundsState.minY, y);
    boundsState.maxX = Math.max(boundsState.maxX, x);
    boundsState.maxY = Math.max(boundsState.maxY, y);
  };
  const includeComponentBounds = comp => {
    if (!comp) return;
    const bounds = componentBounds(comp);
    includePoint(bounds.left, bounds.top);
    includePoint(bounds.right, bounds.bottom);
  };
  let lengthsChanged = false;
  if (gridEnabled) {
    components.forEach(c => {
      c.x = Math.round(c.x / gridSize) * gridSize;
      c.y = Math.round(c.y / gridSize) * gridSize;
    });
  }

  function routeConnection(src, tgt, conn) {
    const start = portPosition(src, conn?.sourcePort);
    const end = portPosition(tgt, conn?.targetPort);
    const sDir = portDirection(src, conn?.sourcePort);
    const tDir = portDirection(tgt, conn?.targetPort);
    let path;
    if (conn && conn.dir) {
      const mid = conn.mid ?? (conn.dir === 'h' ? (start.x + end.x) / 2 : (start.y + end.y) / 2);
      if (conn.dir === 'h') {
        path = [start, { x: mid, y: start.y }, { x: mid, y: end.y }, end];
      } else {
        path = [start, { x: start.x, y: mid }, { x: end.x, y: mid }, end];
      }
      conn.mid = mid;
    }

    function horizontalFirst() {
      let midX = (start.x + end.x) / 2;
      let adjusted = true;
      while (adjusted) {
        adjusted = false;
        components.forEach(comp => {
          if (comp === src || comp === tgt) return;
          const rect = { x: comp.x, y: comp.y, w: comp.width || compWidth, h: comp.height || compHeight };
          if (
            rect.x <= midX && midX <= rect.x + rect.w &&
            Math.min(start.y, end.y) <= rect.y + rect.h &&
            Math.max(start.y, end.y) >= rect.y
          ) {
            midX = midX < rect.x + rect.w / 2 ? rect.x - 10 : rect.x + rect.w + 10;
            adjusted = true;
          }
          if (
            start.y >= rect.y && start.y <= rect.y + rect.h &&
            Math.min(start.x, midX) <= rect.x + rect.w &&
            Math.max(start.x, midX) >= rect.x
          ) {
            midX = midX < rect.x ? rect.x - 10 : rect.x + rect.w + 10;
            adjusted = true;
          }
          if (
            end.y >= rect.y && end.y <= rect.y + rect.h &&
            Math.min(end.x, midX) <= rect.x + rect.w &&
            Math.max(end.x, midX) >= rect.x
          ) {
            midX = midX < rect.x ? rect.x - 10 : rect.x + rect.w + 10;
            adjusted = true;
          }
        });
      }
      return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
    }

    function verticalFirst() {
      let midY = (start.y + end.y) / 2;
      let adjusted = true;
      while (adjusted) {
        adjusted = false;
        components.forEach(comp => {
          if (comp === src || comp === tgt) return;
          const rect = { x: comp.x, y: comp.y, w: comp.width || compWidth, h: comp.height || compHeight };
          if (
            rect.y <= midY && midY <= rect.y + rect.h &&
            Math.min(start.x, end.x) <= rect.x + rect.w &&
            Math.max(start.x, end.x) >= rect.x
          ) {
            midY = midY < rect.y + rect.h / 2 ? rect.y - 10 : rect.y + rect.h + 10;
            adjusted = true;
          }
          if (
            start.x >= rect.x && start.x <= rect.x + rect.w &&
            Math.min(start.y, midY) <= rect.y + rect.h &&
            Math.max(start.y, midY) >= rect.y
          ) {
            midY = midY < rect.y ? rect.y - 10 : rect.y + rect.h + 10;
            adjusted = true;
          }
          if (
            end.x >= rect.x && end.x <= rect.x + rect.w &&
            Math.min(end.y, midY) <= rect.y + rect.h &&
            Math.max(end.y, midY) >= rect.y
          ) {
            midY = midY < rect.y ? rect.y - 10 : rect.y + rect.h + 10;
            adjusted = true;
          }
        });
      }
      return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
    }

    function intersects(path) {
      for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i + 1];
        const horizontal = p1.y === p2.y;
        const x1 = Math.min(p1.x, p2.x);
        const x2 = Math.max(p1.x, p2.x);
        const y1 = Math.min(p1.y, p2.y);
        const y2 = Math.max(p1.y, p2.y);
        for (const comp of components) {
          if (comp === src || comp === tgt) continue;
          const rect = { x: comp.x, y: comp.y, w: comp.width || compWidth, h: comp.height || compHeight };
          if (horizontal) {
            if (
              p1.y >= rect.y && p1.y <= rect.y + rect.h &&
              x2 >= rect.x && x1 <= rect.x + rect.w
            ) return true;
          } else {
            if (
              p1.x >= rect.x && p1.x <= rect.x + rect.w &&
              y2 >= rect.y && y1 <= rect.y + rect.h
            ) return true;
          }
        }
      }
      return false;
    }

    if (!path) {
      const h = horizontalFirst();
      const v = verticalFirst();
      // Prefer horizontal routing only when targeting left/right ports so
      // that connections into top/bottom ports end with a vertical segment.
      const preferH = tDir === 'left' || tDir === 'right';
      if (preferH) {
        if (!intersects(h)) path = h;
        else if (!intersects(v)) path = v;
        else path = h.length <= v.length ? h : v;
      } else {
        if (!intersects(v)) path = v;
        else if (!intersects(h)) path = h;
        else path = h.length <= v.length ? h : v;
      }
      if (conn) {
        conn.dir = path === h ? 'h' : 'v';
        conn.mid = conn.dir === 'h' ? path[1].x : path[1].y;
      }
    }
    const pen = path[path.length - 2];
    if (tDir === 'top' || tDir === 'bottom') {
      if (pen.x !== end.x) path.splice(path.length - 1, 0, { x: end.x, y: pen.y });
    } else if (tDir === 'left' || tDir === 'right') {
      if (pen.y !== end.y) path.splice(path.length - 1, 0, { x: pen.x, y: end.y });
    }
    const approx = (a, b) => Math.abs(a - b) < 0.01;
    const samePoint = (a, b) => approx(a.x, b.x) && approx(a.y, b.y);
    const offsetPoint = (pt, dir) => {
      const len = 18;
      if (dir === 'left') return { x: pt.x - len, y: pt.y };
      if (dir === 'right') return { x: pt.x + len, y: pt.y };
      if (dir === 'top') return { x: pt.x, y: pt.y - len };
      if (dir === 'bottom') return { x: pt.x, y: pt.y + len };
      return pt;
    };
    if (src.type === 'cable' && sDir && path.length > 1) {
      const stub = offsetPoint(path[0], sDir);
      if (!samePoint(path[0], stub) && (!path[1] || !samePoint(path[1], stub))) {
        path.splice(1, 0, stub);
      }
    }
    if (tgt.type === 'cable' && tDir && path.length > 1) {
      const stub = offsetPoint(path[path.length - 1], tDir);
      const insertAt = path.length - 1;
      if (!samePoint(path[insertAt], stub) && (!path[insertAt - 1] || !samePoint(path[insertAt - 1], stub))) {
        path.splice(insertAt, 0, stub);
      }
    }
    return path;
  }

  function midpoint(points) {
    if (!Array.isArray(points) || points.length === 0) {
      return { x: 0, y: 0 };
    }
    const segs = [];
    let len = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const l = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (!Number.isFinite(l) || l <= 0) continue;
      segs.push({ p1, p2, l });
      len += l;
    }
    if (!segs.length) {
      return points[0] || { x: 0, y: 0 };
    }
    let half = len / 2;
    for (const s of segs) {
      if (half <= s.l) {
        const ratio = half / s.l;
        return {
          x: s.p1.x + (s.p2.x - s.p1.x) * ratio,
          y: s.p1.y + (s.p2.y - s.p1.y) * ratio
        };
      }
      half -= s.l;
    }
    const last = segs[segs.length - 1];
    return last ? last.p2 : points[0];
  }

  // dimension tool removed

  // draw connections
  components.forEach(c => {
    (c.connections || []).forEach((conn, idx) => {
      const target = components.find(t => t.id === conn.target);
      if (!target) return;
      const pts = routeConnection(c, target, conn);
      pts.forEach(pt => includePoint(pt.x, pt.y));
      const lenPx = pts.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
      if (Math.abs((conn.length || 0) - lenPx) > 0.5) lengthsChanged = true;
      conn.length = lenPx;
      const poly = document.createElementNS(svgNS, 'polyline');
      poly.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
      const cableInfo = getCableForConnection(c, target, conn);
      const vRange = getVoltageRange(conn.voltage || cableInfo?.voltage || c.voltage || target.voltage);
      if (vRange) usedVoltageRanges.add(vRange);
      const rawPhases = conn.phases && conn.phases.length
        ? (Array.isArray(conn.phases) ? conn.phases : parseCablePhases({ phases: conn.phases }))
        : parseCablePhases(cableInfo);
      const phaseKey = rawPhases.join('');
      const phaseColor = phaseColors[phaseKey];
      const stroke = phaseColor || vRange?.color || cableColors[cableInfo?.cable_type] || cableInfo?.color || '#000';
      poly.setAttribute('stroke', stroke);
      poly.setAttribute('fill', 'none');
      poly.setAttribute('marker-start', 'url(#connection-x)');
      poly.setAttribute('marker-end', 'url(#connection-x)');
      poly.setAttribute('stroke-width', '2');
      poly.style.pointerEvents = 'stroke';
      poly.style.cursor = 'move';
      poly.classList.add('connection');
      poly.dataset.comp = c.id;
      poly.dataset.index = idx;
      const vdLimit = parseFloat(target.maxVoltageDrop) || 3;
      if (cableInfo?.sizing_warning) poly.classList.add('sizing-violation');
      if (parseFloat(cableInfo?.voltage_drop_pct) > vdLimit) poly.classList.add('voltage-exceed');
      poly.addEventListener('click', e => {
        e.stopPropagation();
        selected = null;
        selection = [];
        selectedConnection = { component: c, index: idx };
      });
      poly.addEventListener('dblclick', async e => {
        e.stopPropagation();
        cancelPendingClickSelection();
        const cableComp = c.type === 'cable' ? c : target.type === 'cable' ? target : null;
        if (cableComp) {
          await editCableComponent(cableComp);
        }
      });
      poly.addEventListener('mousedown', e => {
        e.stopPropagation();
        const coords = toDiagramCoords(e);
        draggingConnection = {
          component: c,
          index: idx,
          start: { x: coords.x, y: coords.y },
          mid: conn.mid ?? (conn.dir === 'h' ? pts[1].x : pts[1].y)
        };
      });
      svg.appendChild(poly);

      const label = document.createElementNS(svgNS, 'text');
      const mid = midpoint(pts);
      label.setAttribute('x', mid.x);
      label.setAttribute('y', mid.y);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('fill', stroke);
      let lblText = cableInfo?.tag || cableInfo?.cable_type || '';
      if (showOverlays) {
        const overlays = [];
        if (conn.faultKA != null) {
          const faultText = formatOverlayMetric(conn.faultKA, 'kA', 2);
          if (faultText) overlays.push(faultText);
        } else {
          const loadKw = formatOverlayMetric(conn.loading_kW, 'kW', 2);
          if (loadKw) overlays.push(loadKw);
          const loadAmps = formatOverlayMetric(conn.loading_amps, 'A', 1);
          if (loadAmps) overlays.push(loadAmps);
        }
        if (overlays.length) {
          lblText += ` ${overlays.join(' / ')}`;
        }
      }
      label.textContent = lblText;
      label.classList.add('conn-label');
      if (cableInfo?.sizing_warning) label.classList.add('sizing-violation');
      if (parseFloat(cableInfo?.voltage_drop_pct) > vdLimit) label.classList.add('voltage-exceed');
      label.style.pointerEvents = 'auto';
      label.style.cursor = 'pointer';
      label.addEventListener('click', e => {
        e.stopPropagation();
        selected = null;
        selection = [];
        selectedConnection = { component: c, index: idx };
      });
      label.addEventListener('dblclick', async e => {
        e.stopPropagation();
        cancelPendingClickSelection();
        const cableComp = c.type === 'cable' ? c : target.type === 'cable' ? target : null;
        if (cableComp) {
          await editCableComponent(cableComp);
        }
      });
      svg.appendChild(label);
    });
  });

  // draw nodes
  components.filter(c => c.type !== 'dimension').forEach(c => {
    includeComponentBounds(c);
    const g = document.createElementNS(svgNS, 'g');
    g.dataset.id = c.id;
    g.classList.add('component');
    g.setAttribute('pointer-events', 'bounding-box');
    g.addEventListener('dblclick', e => {
      e.stopPropagation();
      cancelPendingClickSelection();
      selectComponent(c);
    });
    const tooltipParts = [];
    if (c.label) tooltipParts.push(`Label: ${c.label}`);
    if (c.voltage) tooltipParts.push(`Voltage: ${c.voltage}`);
    if (c.rating) tooltipParts.push(`Rating: ${c.rating}`);
    if (tooltipParts.length) g.setAttribute('data-tooltip', tooltipParts.join('\n'));
    g.addEventListener('mouseenter', showTooltip);
    g.addEventListener('mousemove', moveTooltip);
    g.addEventListener('mouseleave', hideTooltip);
    const w = c.width || compWidth;
    const h = c.height || compHeight;
    if (findHighlightId === c.id) {
      const highlight = document.createElementNS(svgNS, 'rect');
      highlight.setAttribute('x', c.x - 6);
      highlight.setAttribute('y', c.y - 6);
      highlight.setAttribute('width', w + 12);
      highlight.setAttribute('height', h + 12);
      highlight.setAttribute('class', 'find-highlight');
      g.appendChild(highlight);
    }
    const cx = c.x + w / 2;
    const cy = c.y + h / 2;
    if (showOverlays && c.voltage_mag !== undefined) {
      const mags = typeof c.voltage_mag === 'object' ? Object.values(c.voltage_mag) : [c.voltage_mag];
      const dev = Math.max(...mags.map(v => Math.abs(v - 1) * 100));
      let color = '#4caf50';
      if (dev > 10) color = '#f44336';
      else if (dev > 5) color = '#ffeb3b';
      const overlay = document.createElementNS(svgNS, 'rect');
      overlay.setAttribute('x', c.x);
      overlay.setAttribute('y', c.y);
      overlay.setAttribute('width', w);
      overlay.setAttribute('height', h);
      overlay.setAttribute('fill', color);
      overlay.setAttribute('opacity', 0.3);
      g.appendChild(overlay);
    }
    if (showOverlays && (c.voltage_mag !== undefined || c.shortCircuit?.threePhaseKA !== undefined)) {
      const txt = document.createElementNS(svgNS, 'text');
      txt.setAttribute('x', cx);
      txt.setAttribute('y', cy - (h / 2) - 4);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('class', 'overlay-label');
      const parts = [];
      if (c.voltage_mag !== undefined) {
        if (typeof c.voltage_mag === 'object') {
          parts.push(Object.entries(c.voltage_mag)
            .map(([ph, v]) => `${ph}:${Number(v).toFixed(3)} pu`)
            .join(' '));
        } else {
          parts.push(`${Number(c.voltage_mag).toFixed(3)} pu`);
        }
      }
      if (c.shortCircuit?.threePhaseKA !== undefined) {
        parts.push(`${Number(c.shortCircuit.threePhaseKA).toFixed(2)} kA`);
      }
      txt.textContent = parts.join(' / ');
      g.appendChild(txt);
    }
    const transforms = [];
    if (c.flipped) transforms.push(`translate(${cx}, ${cy}) scale(-1,1) translate(${-cx}, ${-cy})`);
    if (c.rotation) transforms.push(`rotate(${c.rotation}, ${cx}, ${cy})`);
    if (transforms.length) g.setAttribute('transform', transforms.join(' '));
    const vRange = (!showOverlays || c.voltage_mag === undefined) ? getVoltageRange(c.voltage) : null;
    if (vRange) {
      usedVoltageRanges.add(vRange);
      const bg = document.createElementNS(svgNS, 'rect');
      bg.setAttribute('x', c.x);
      bg.setAttribute('y', c.y);
      bg.setAttribute('width', w);
      bg.setAttribute('height', h);
      bg.setAttribute('fill', vRange.color);
      bg.setAttribute('opacity', 0.3);
      g.appendChild(bg);
    }
    const meta = componentMeta[c.subtype] || {};
    if (c.type === 'annotation') {
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', c.x);
      rect.setAttribute('y', c.y);
      rect.setAttribute('width', w);
      rect.setAttribute('height', h);
      rect.setAttribute('fill', '#fff');
      rect.setAttribute('stroke', '#333');
      g.appendChild(rect);
      const txt = document.createElementNS(svgNS, 'text');
      txt.setAttribute('x', c.x + w / 2);
      txt.setAttribute('y', c.y + h / 2 + 5);
      txt.setAttribute('text-anchor', 'middle');
      txt.textContent = c.text || c.label || '';
      txt.addEventListener('dblclick', e => {
        e.stopPropagation();
        cancelPendingClickSelection();
        selectComponent(c);
      });
      g.appendChild(txt);
    } else {
      if (c.type === 'cable') {
        const wLocal = c.width || compWidth;
        const hLocal = c.height || compHeight;
        const centerLocal = { x: wLocal / 2, y: hLocal / 2 };
        const ports = c.ports || meta.ports || [];
        ports.forEach(port => {
          if (!port) return;
          let px = port.x;
          let py = port.y;
          if (c.flipped) px = wLocal - px;
          const dx = centerLocal.x - px;
          const dy = centerLocal.y - py;
          const dist = Math.hypot(dx, dy);
          if (!dist) return;
          const leadLength = Math.min(20, dist - 2);
          if (leadLength <= 0) return;
          const innerX = px + (dx * (leadLength / dist));
          const innerY = py + (dy * (leadLength / dist));
          const lead = document.createElementNS(svgNS, 'line');
          lead.setAttribute('x1', c.x + px);
          lead.setAttribute('y1', c.y + py);
          lead.setAttribute('x2', c.x + innerX);
          lead.setAttribute('y2', c.y + innerY);
          lead.classList.add('cable-lead');
          g.appendChild(lead);
        });
      }
      const iconHref = meta.icon || placeholderIcon;
      const img = document.createElementNS(svgNS, 'image');
      img.setAttribute('x', c.x);
      img.setAttribute('y', c.y);
      img.setAttribute('width', w);
      img.setAttribute('height', h);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', iconHref);
      if (isBusComponent(c)) img.setAttribute('preserveAspectRatio', 'none');
      if (iconHref !== placeholderIcon) {
        img.addEventListener('error', () => {
          console.warn(`Missing icon for subtype ${c.subtype}`);
          img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', placeholderIcon);
        }, { once: true });
      }
      img.addEventListener('dblclick', e => {
        e.stopPropagation();
        cancelPendingClickSelection();
        selectComponent(c);
      });
      g.appendChild(img);
      if (c.subtype === 'motor_load') {
        const letter = document.createElementNS(svgNS, 'text');
        letter.setAttribute('x', cx);
        letter.setAttribute('y', cy + 4);
        letter.setAttribute('text-anchor', 'middle');
        letter.setAttribute('dominant-baseline', 'middle');
        letter.textContent = 'M';
        if (c.rotation) {
          letter.setAttribute('transform', `rotate(${-c.rotation}, ${cx}, ${cy})`);
        }
        g.appendChild(letter);
      }
    }
    if (selection.includes(c)) {
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', c.x - 2);
      rect.setAttribute('y', c.y - 2);
      rect.setAttribute('width', w + 4);
      rect.setAttribute('height', h + 4);
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', '#00f');
      rect.setAttribute('stroke-dasharray', '4 2');
      rect.style.pointerEvents = 'none';
      g.appendChild(rect);
    }
    svg.appendChild(g);
    if (c.type === 'annotation' && selection.includes(c)) {
      const handle = document.createElementNS(svgNS, 'rect');
      handle.setAttribute('x', c.x + w - 5);
      handle.setAttribute('y', c.y + h - 5);
      handle.setAttribute('width', 10);
      handle.setAttribute('height', 10);
      handle.setAttribute('fill', '#fff');
      handle.setAttribute('stroke', '#00f');
      handle.setAttribute('stroke-width', '1');
      handle.classList.add('annotation-handle');
      handle.dataset.id = c.id;
      svg.appendChild(handle);
    }
    if (c.type !== 'annotation') {
      const labelPos = getLabelPosition(c);
      const labelEl = document.createElementNS(svgNS, 'text');
      labelEl.classList.add('component-label');
      labelEl.dataset.id = c.id;
      labelEl.setAttribute('x', labelPos.x);
      labelEl.setAttribute('y', labelPos.y);
      labelEl.setAttribute('text-anchor', getLabelAlignment(c));
      labelEl.textContent = c.label || meta.label || c.subtype || c.type;
      attachLabelInteractions(labelEl, c);
      svg.appendChild(labelEl);
      const attrLines = getComponentAttributeLines(c);
      if (attrLines.length) {
        attrLines.forEach((line, idx) => {
          const attrEl = document.createElementNS(svgNS, 'text');
          attrEl.classList.add('component-attribute');
          attrEl.dataset.id = c.id;
          attrEl.setAttribute('x', labelPos.x);
          attrEl.setAttribute('y', labelPos.y + attributeLineHeight * (idx + 1));
          attrEl.setAttribute('text-anchor', getLabelAlignment(c));
          attrEl.textContent = line;
          attachLabelInteractions(attrEl, c);
          svg.appendChild(attrEl);
        });
      }
    }
    if (isBusComponent(c) && selection.includes(c)) {
      const handleRight = document.createElementNS(svgNS, 'rect');
      handleRight.setAttribute('x', c.x + c.width - 5);
      handleRight.setAttribute('y', c.y + (c.height / 2) - 5);
      handleRight.setAttribute('width', 10);
      handleRight.setAttribute('height', 10);
      handleRight.classList.add('bus-handle');
      handleRight.dataset.id = c.id;
      handleRight.dataset.side = 'right';
      svg.appendChild(handleRight);
      const handleLeft = document.createElementNS(svgNS, 'rect');
      handleLeft.setAttribute('x', c.x - 5);
      handleLeft.setAttribute('y', c.y + (c.height / 2) - 5);
      handleLeft.setAttribute('width', 10);
      handleLeft.setAttribute('height', 10);
      handleLeft.classList.add('bus-handle');
      handleLeft.dataset.id = c.id;
      handleLeft.dataset.side = 'left';
      svg.appendChild(handleLeft);
    }
      if (connectMode) {
        (c.ports || meta.ports || []).forEach((p, idx) => {
          const pos = portPosition(c, idx);
          const circ = document.createElementNS(svgNS, 'circle');
          circ.setAttribute('cx', pos.x);
          circ.setAttribute('cy', pos.y);
          circ.setAttribute('r', 3);
          circ.classList.add('port');
          circ.dataset.id = c.id;
          circ.dataset.port = idx;
          svg.appendChild(circ);
        });
      }
  });

  if (marquee && marquee.active) {
    const rect = document.createElementNS(svgNS, 'rect');
    const x = Math.min(marquee.x1, marquee.x2);
    const y = Math.min(marquee.y1, marquee.y2);
    const width = Math.abs(marquee.x2 - marquee.x1);
    const height = Math.abs(marquee.y2 - marquee.y1);
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    rect.setAttribute('fill', marquee.x2 < marquee.x1 ? 'rgba(76, 175, 80, 0.15)' : 'rgba(33, 150, 243, 0.15)');
    rect.setAttribute('stroke', marquee.x2 < marquee.x1 ? '#4caf50' : '#2196f3');
    rect.setAttribute('stroke-width', '1');
    if (marquee.x2 < marquee.x1) rect.setAttribute('stroke-dasharray', '6 4');
    rect.classList.add('selection-marquee');
    rect.style.pointerEvents = 'none';
    svg.appendChild(rect);
  }

  updateDiagramViewport(boundsState);
  applyDiagramZoom();
  updateLegend(usedVoltageRanges);
  if (lengthsChanged && !syncing) {
    syncing = true;
    syncSchedules(false);
    syncing = false;
    render();
  }
}

export function toggleGrid() {
  const toggle = document.getElementById('grid-toggle');
  gridEnabled = toggle?.checked;
  setItem('gridEnabled', gridEnabled);
  document.getElementById('grid-bg').style.display = gridEnabled ? 'block' : 'none';
  render();
}

function flashSnapIndicator(x, y) {
  const svg = document.getElementById('diagram');
  let indicator = document.getElementById('snap-indicator');
  if (!indicator) {
    indicator = document.createElementNS(svgNS, 'circle');
    indicator.id = 'snap-indicator';
    svg.appendChild(indicator);
  }
  indicator.setAttribute('r', Math.max(2, gridSize / 4));
  indicator.setAttribute('cx', x);
  indicator.setAttribute('cy', y);
  indicator.style.opacity = '1';
  clearTimeout(snapIndicatorTimeout);
  snapIndicatorTimeout = setTimeout(() => {
    indicator.style.opacity = '0';
  }, 200);
}

function renderSheetTabs() {
  const tabs = document.getElementById('sheet-tabs');
  if (!tabs) return;
  tabs.innerHTML = '';
  sheets.forEach((s, i) => {
    const tab = document.createElement('button');
    tab.textContent = s.name || `Sheet ${i + 1}`;
    tab.className = 'sheet-tab' + (i === activeSheet ? ' active' : '');
    tab.addEventListener('click', () => loadSheet(i));
    tabs.appendChild(tab);
  });
}

function loadSheet(idx) {
  if (idx < 0 || idx >= sheets.length) return;
  save(false);
  activeSheet = idx;
  components = sheets[activeSheet].components;
  connections = sheets[activeSheet].connections;
  history = [JSON.parse(JSON.stringify(components))];
  historyIndex = 0;
  selection = [];
  selected = null;
  selectedConnection = null;
  refreshAttributeOptions();
  renderSheetTabs();
  render();
  setOneLine({ activeSheet, sheets });
}

function addSheet(name) {
  const sheetName = name || prompt('Sheet name', `Sheet ${sheets.length + 1}`);
  if (!sheetName) return;
  sheets.push({ name: sheetName, components: [], connections: [] });
  loadSheet(sheets.length - 1);
  save();
}

function renameSheet(id, newName) {
  const idx = id ?? activeSheet;
  if (idx < 0 || idx >= sheets.length) return;
  const sheetName = newName || prompt('Sheet name', sheets[idx].name);
  if (!sheetName) return;
  sheets[idx].name = sheetName;
  renderSheetTabs();
  save();
}

function deleteSheet(id) {
  if (sheets.length <= 1) return;
  const idx = id ?? activeSheet;
  if (idx < 0 || idx >= sheets.length) return;
  if (!confirm('Delete current sheet?')) return;
  sheets.splice(idx, 1);
  activeSheet = Math.max(0, idx - 1);
  components = sheets[activeSheet].components;
  connections = sheets[activeSheet].connections;
  refreshAttributeOptions();
  renderSheetTabs();
  render();
  save();
}

function save(notify = true) {
  const buildConnections = comps =>
    comps.flatMap(c =>
      (c.connections || []).map(conn => ({
        ...conn,
        from: c.id,
        to: conn.target
      }))
    );
  const sheetData = sheets.map((s, i) => {
    const comps = (i === activeSheet ? components : s.components).map(c => ({
      ...c,
      rotation: c.rotation || 0,
      flipped: !!c.flipped
    }));
    return {
      name: s.name,
      components: comps,
      connections: buildConnections(comps)
    };
  });
  sheets = sheetData;
  if (sheets.length) {
    const clampedIndex = Math.min(Math.max(activeSheet, 0), sheets.length - 1);
    activeSheet = clampedIndex;
    components = sheets[clampedIndex].components;
    connections = sheets[clampedIndex].connections;
  } else {
    activeSheet = 0;
    components = [];
    connections = [];
  }
  setOneLine({ activeSheet, sheets: sheetData });
  setItem('diagramScale', diagramScale);
  const issues = validateDiagram();
  if (issues.length === 0) {
    syncSchedules(notify);
  } else if (notify) {
    showToast('Fix validation issues before syncing schedules');
  }
}

function updateBusPorts(bus) {
  const spacing = 20;
  const ports = [];
  for (let px = 0; px <= bus.width; px += spacing) {
    ports.push({ x: px, y: 0 });
    ports.push({ x: px, y: bus.height });
  }
  bus.ports = ports;
}

function addComponent(cfg) {
  let subtype, type, x = 20, y = 20;
  let skipHistory = false;
  if (typeof cfg === 'string') {
    subtype = cfg;
    type = componentMeta[subtype]?.category;
  } else if (cfg && typeof cfg === 'object') {
    subtype = cfg.subtype;
    type = cfg.type || componentMeta[cfg.subtype]?.type || componentMeta[cfg.subtype]?.category;
    if (cfg.x !== undefined) x = cfg.x;
    if (cfg.y !== undefined) y = cfg.y;
    skipHistory = !!cfg.skipHistory;
  } else {
    return;
  }
  const meta = componentMeta[subtype];
  if (!meta) return;
  if (gridEnabled) {
    x = Math.round(x / gridSize) * gridSize;
    y = Math.round(y / gridSize) * gridSize;
  }
  const resolvedType = type || meta.type || meta.category;
  const defaultRotation = normalizeRotation(meta.defaultRotation ?? defaultRotationForType(resolvedType, meta.category));
  const comp = {
    id: 'n' + Date.now(),
    type: resolvedType,
    subtype,
    x,
    y,
    label: nextLabel(subtype),
    ref: '',
    labelOffset: { x: 0, y: 0 },
    rotation: defaultRotation,
    flipped: false,
    impedance: { r: 0, x: 0 },
    rating: null,
    connections: [],
    props: JSON.parse(JSON.stringify(meta.props || {}))
  };
  if (Number.isFinite(meta.width)) comp.width = meta.width;
  if (Number.isFinite(meta.height)) comp.height = meta.height;
  if (defaultRotation) {
    const bounds = componentBounds(comp);
    const dx = bounds.left - x;
    const dy = bounds.top - y;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      comp.x -= dx;
      comp.y -= dy;
    }
  }
  Object.entries(meta.props || {}).forEach(([k, v]) => {
    comp[k] = typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
  });
  if (meta.type === 'bus') {
    comp.width = Number.isFinite(meta.width) ? meta.width : 200;
    comp.height = Number.isFinite(meta.height) ? meta.height : 20;
    updateBusPorts(comp);
  } else if (comp.type === 'annotation') {
    comp.width = comp.width || 120;
    comp.height = comp.height || 60;
  }
  applyDefaults(comp);
  components.push(comp);
  if (!skipHistory) pushHistory();
  if (gridEnabled) flashSnapIndicator(x, y);
  return comp;
}

function buildVirtualNodeEntries(allComponents, sheetConnections) {
  const compById = new Map();
  allComponents.forEach(comp => {
    if (!comp || !comp.id) return;
    if (!compById.has(comp.id)) compById.set(comp.id, comp);
  });
  const nodeMap = new Map();
  const ensureNode = id => {
    if (!id || compById.has(id)) return null;
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        id,
        label: id,
        type: 'nodes',
        category: 'nodes',
        isVirtualNode: true,
        inbound: [],
        outbound: []
      });
    }
    return nodeMap.get(id);
  };

  allComponents.forEach(source => {
    if (!source) return;
    const list = Array.isArray(source.connections) ? source.connections : [];
    list.forEach(conn => {
      if (!conn || !conn.target) return;
      const node = ensureNode(conn.target);
      if (!node) return;
      node.inbound.push({
        sourceId: source.id || conn.source || '',
        sourceComponent: source,
        connection: conn
      });
    });
  });

  const sheetList = Array.isArray(sheetConnections) ? sheetConnections : [];
  sheetList.forEach(conn => {
    if (!conn) return;
    const fromId = conn.from;
    const toId = conn.to;
    if (fromId && !compById.has(fromId)) {
      const node = ensureNode(fromId);
      if (node) {
        node.outbound.push({
          targetId: toId || '',
          targetComponent: toId ? compById.get(toId) || null : null,
          connection: conn
        });
      }
    }
    if (toId && !compById.has(toId)) {
      const node = ensureNode(toId);
      if (node) {
        node.inbound.push({
          sourceId: fromId || '',
          sourceComponent: fromId ? compById.get(fromId) || null : null,
          connection: conn
        });
      }
    }
  });

  return Array.from(nodeMap.values());
}

function alignSelection(direction) {
  if (selection.length < 2) return;
  if (direction === 'left') {
    const minX = Math.min(...selection.map(c => c.x));
    selection.forEach(c => { c.x = minX; });
  } else if (direction === 'right') {
    const maxX = Math.max(...selection.map(c => c.x + (c.width || compWidth)));
    selection.forEach(c => { c.x = maxX - (c.width || compWidth); });
  } else if (direction === 'top') {
    const minY = Math.min(...selection.map(c => c.y));
    selection.forEach(c => { c.y = minY; });
  } else if (direction === 'bottom') {
    const maxY = Math.max(...selection.map(c => c.y + (c.height || compHeight)));
    selection.forEach(c => { c.y = maxY - (c.height || compHeight); });
  }
  pushHistory();
  render();
  save();
}

function distributeSelection(axis) {
  if (selection.length < 3) return;
  const sorted = [...selection].sort(axis === 'h' ? (a, b) => a.x - b.x : (a, b) => a.y - b.y);
  if (axis === 'h') {
    const min = sorted[0].x;
    const max = sorted[sorted.length - 1].x;
    const step = (max - min) / (sorted.length - 1);
    sorted.forEach((c, i) => { c.x = min + step * i; });
  } else {
    const min = sorted[0].y;
    const max = sorted[sorted.length - 1].y;
    const step = (max - min) / (sorted.length - 1);
    sorted.forEach((c, i) => { c.y = min + step * i; });
  }
  pushHistory();
  render();
  save();
}

function selectComponent(compOrId) {
  if (compOrId && typeof compOrId === 'object' && compOrId.type === 'cable') {
    openCableProperties(compOrId);
    return;
  }

  const nodeComponents = buildVirtualNodeEntries(components, connections);
  const baseComponents = components.filter(c => c.type !== 'cable');
  const deviceComponents = [...baseComponents, ...nodeComponents];
  if (!deviceComponents.length) return;

  const findDeviceById = id => deviceComponents.find(item => item.id === id) || null;
  let activeComponent = null;
  if (typeof compOrId === 'string' && compOrId) {
    activeComponent = findDeviceById(compOrId);
    if (!activeComponent) {
      const comp = components.find(c => c.id === compOrId);
      if (comp && comp.type === 'cable') {
        openCableProperties(comp);
        return;
      }
    }
  } else if (compOrId && typeof compOrId === 'object') {
    if (compOrId.isVirtualNode) {
      activeComponent = findDeviceById(compOrId.id);
    } else if (compOrId.type !== 'cable') {
      activeComponent = compOrId;
    }
  }
  if (!activeComponent) activeComponent = deviceComponents[0];

  if (activeComponent?.isVirtualNode) {
    selected = null;
    selection = [];
  } else {
    selected = activeComponent;
    selection = [activeComponent];
  }
  selectedConnection = null;

  const sortedComponents = [...deviceComponents].sort((a, b) =>
    getComponentListLabel(a).localeCompare(getComponentListLabel(b), undefined, { sensitivity: 'base' })
  );

  const categoryEntries = new Map();
  sortedComponents.forEach(device => {
    const category = getCategory(device) || 'equipment';
    if (!categoryEntries.has(category)) categoryEntries.set(category, []);
    categoryEntries.get(category).push(device);
  });
  const categoryOrder = Array.from(categoryEntries.keys()).sort((a, b) =>
    formatAttributeLabel(String(a)).localeCompare(formatAttributeLabel(String(b)), undefined, { sensitivity: 'base' })
  );
  let activeCategory = null;
  if (activeComponent) {
    const componentCategory = getCategory(activeComponent) || null;
    if (componentCategory && categoryEntries.has(componentCategory)) activeCategory = componentCategory;
  }
  if (!activeCategory) activeCategory = categoryOrder[0] || null;
  if (activeCategory && (!activeComponent || !categoryEntries.get(activeCategory).some(item => item.id === activeComponent.id))) {
    const fallbackDevice = categoryEntries.get(activeCategory)?.[0] || null;
    if (fallbackDevice) {
      activeComponent = fallbackDevice;
    }
  }
  if (activeComponent?.isVirtualNode) {
    selected = null;
    selection = [];
  } else {
    selected = activeComponent;
    selection = [activeComponent];
  }
  selectedConnection = null;

  const modal = ensurePropModal();
  if (modal._outsideHandler) modal.removeEventListener('click', modal._outsideHandler);
  if (modal._keyHandler) document.removeEventListener('keydown', modal._keyHandler);
  modal.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'prop-modal-panel';
  modal.appendChild(panel);

  const layout = document.createElement('div');
  layout.className = 'prop-modal-layout';
  panel.appendChild(layout);

  const componentColumn = document.createElement('div');
  componentColumn.className = 'prop-modal-column prop-modal-components';
  const categoryHeading = document.createElement('h3');
  categoryHeading.className = 'prop-modal-heading';
  categoryHeading.textContent = 'Categories';
  const categoryListEl = document.createElement('div');
  categoryListEl.className = 'prop-category-list';
  const componentHeading = document.createElement('h3');
  componentHeading.className = 'prop-modal-heading';
  componentHeading.textContent = 'Device Tags';
  const componentListEl = document.createElement('div');
  componentListEl.className = 'prop-component-list';
  componentColumn.append(categoryHeading, categoryListEl, componentHeading, componentListEl);
  layout.appendChild(componentColumn);

  const propertyColumn = document.createElement('div');
  propertyColumn.className = 'prop-modal-column prop-modal-properties';
  const propertyHeading = document.createElement('h3');
  propertyHeading.className = 'prop-modal-heading';
  propertyColumn.appendChild(propertyHeading);
  const propertyContainer = document.createElement('div');
  propertyContainer.className = 'prop-property-container';
  propertyColumn.appendChild(propertyContainer);
  layout.appendChild(propertyColumn);

  const categoryButtonMap = new Map();
  const buttonMap = new Map();
  let activeId = activeComponent?.id || null;

  function renderCategoryButtons() {
    categoryListEl.innerHTML = '';
    categoryButtonMap.clear();
    categoryOrder.forEach(categoryKey => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'prop-category-option';
      button.textContent = getCategoryLabel(categoryKey);
      button.dataset.category = categoryKey;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (activeCategory === categoryKey) return;
        activeCategory = categoryKey;
        const nextDevice = categoryEntries.get(activeCategory)?.[0] || null;
        renderDeviceButtons();
        updateCategoryStates();
        if (nextDevice) {
          setActiveComponent(nextDevice);
        } else {
          selected = null;
          selection = [];
          selectedConnection = null;
          renderPropertiesFor(null);
          updateButtonStates();
        }
      });
      categoryButtonMap.set(categoryKey, button);
      categoryListEl.appendChild(button);
    });
  }

  function getComponentListLabel(comp) {
    if (!comp) return 'Device';
    const tag = typeof comp.label === 'string' ? comp.label.trim() : '';
    if (tag) return tag;
    if (comp.subtype) return comp.subtype;
    if (comp.type) return comp.type;
    return comp.id || 'Device';
  }

  function getCategoryLabel(key) {
    if (!key) return 'Other';
    return formatAttributeLabel(String(key));
  }

  function renderDeviceButtons() {
    componentListEl.innerHTML = '';
    buttonMap.clear();
    const devices = activeCategory ? categoryEntries.get(activeCategory) || [] : [];
    const headingLabel = activeCategory ? `Device Tags – ${getCategoryLabel(activeCategory)}` : 'Device Tags';
    componentHeading.textContent = headingLabel;
    devices.forEach(device => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'prop-component-option';
      button.dataset.componentId = device.id;
      button.textContent = getComponentListLabel(device);
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (activeId === device.id) return;
        activeComponent = device;
        activeId = device.id;
        if (device?.isVirtualNode) {
          selected = null;
          selection = [];
        } else {
          selected = device;
          selection = [device];
        }
        selectedConnection = null;
        updateButtonStates();
        renderPropertiesFor(device);
      });
      buttonMap.set(device.id, button);
      componentListEl.appendChild(button);
    });
    if (!devices.length) {
      const empty = document.createElement('p');
      empty.className = 'prop-component-empty view-modal-empty';
      empty.textContent = 'No devices in this category.';
      componentListEl.appendChild(empty);
    }
  }

  function updateButtonStates() {
    buttonMap.forEach((button, id) => {
      const selectedState = id === activeId;
      button.classList.toggle('is-active', selectedState);
      button.setAttribute('aria-pressed', String(selectedState));
      button.tabIndex = selectedState ? 0 : -1;
    });
  }

  function updateCategoryStates() {
    categoryButtonMap.forEach((button, key) => {
      const selectedState = key === activeCategory;
      button.classList.toggle('is-active', selectedState);
      button.setAttribute('aria-pressed', String(selectedState));
      button.tabIndex = selectedState ? 0 : -1;
    });
  }

  function closeModal() {
    modal.classList.remove('show');
    modal.removeEventListener('click', outsideHandler);
    document.removeEventListener('keydown', keyHandler);
    delete modal._outsideHandler;
    delete modal._keyHandler;
    selected = null;
    selection = [];
    selectedConnection = null;
  }

  const outsideHandler = e => { if (e.target === modal) closeModal(); };
  const keyHandler = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  };

  function renderPropertiesFor(targetComp) {
    propertyContainer.innerHTML = '';
    if (!targetComp) {
      propertyHeading.textContent = 'Properties';
      const empty = document.createElement('p');
      empty.className = 'prop-property-empty view-modal-empty';
      empty.textContent = 'Select a device to view its properties.';
      propertyContainer.appendChild(empty);
      return;
    }

    if (targetComp.isVirtualNode) {
      renderNodeProperties(targetComp);
      return;
    }

    propertyHeading.textContent = `${getComponentListLabel(targetComp)} Properties`;

    let rawSchema = propSchemas[targetComp.subtype] || [];
    if (!rawSchema.length) {
      const metaProps = componentMeta[targetComp.subtype]?.props || {};
      rawSchema = inferSchemaFromProps({ ...metaProps, ...(targetComp.props || {}) });
    }

    const labelOverrides = {
      hp: 'Horsepower',
      pf: 'Power Factor',
      service_factor: 'Service Factor',
      inrushMultiple: 'Inrush Multiple (× FLA)',
      thevenin_r: 'Thevenin R (Ω)',
      thevenin_x: 'Thevenin X (Ω)',
      inertia: 'Inertia (kg·m²)',
      load_torque_curve: 'Load Torque Curve (speed%:torque%)'
    };

    let schema = rawSchema
      .map(f => {
        if (f.name === 'voltage_class') {
          return { ...f, type: 'select', options: voltageClasses };
        }
        if (f.name === 'thermal_rating') {
          return { ...f, type: 'select', options: thermalRatings };
        }
        if (f.name === 'manufacturer') {
          return { ...f, type: 'select', options: Object.keys(manufacturerModels) };
        }
        if (f.name === 'model') {
          const manu = targetComp.manufacturer || Object.keys(manufacturerModels)[0];
          return { ...f, type: 'select', options: manufacturerModels[manu] || [] };
        }
        if (targetComp.subtype === 'motor_load' && f.name === 'load_torque_curve') {
          return {
            ...f,
            type: 'textarea',
            rows: 3,
            placeholder: '0:0 50:40 100:100',
            help: 'Enter speed%:torque% pairs separated by spaces or commas.'
          };
        }
        return f;
      })
      .map(f => ({ ...f, label: labelOverrides[f.name] || f.label }));

    if (targetComp.subtype === 'motor_load') {
      schema = schema.filter(
        f => !['conductor_type', 'cable_assembly', 'breaker_frame', 'conductor_assembly', 'gap'].includes(f.name)
      );
    }

    let baseFields = [
      { name: 'label', label: 'Label', type: 'text' },
      { name: 'ref', label: 'Ref ID', type: 'text' },
      { name: 'enclosure', label: 'Enclosure', type: 'select', options: ['NEMA 1', 'NEMA 3R', 'NEMA 4', 'NEMA 4X'] },
      { name: 'gap', label: 'Gap (mm)', type: 'number' },
      { name: 'working_distance', label: 'Working Distance (mm)', type: 'number' },
      { name: 'clearing_time', label: 'Clearing Time (s)', type: 'number' }
    ];

    if (targetComp.subtype === 'motor_load') {
      baseFields = baseFields.filter(
        f => !['gap', 'conductor_type', 'cable_assembly', 'breaker_frame', 'conductor_assembly'].includes(f.name)
      );
    }

    if (hasImpedance(targetComp)) {
      baseFields = baseFields.concat([
        {
          name: 'impedance_r',
          label: 'Impedance R (Ω)',
          type: 'number',
          getValue: comp => getImpedancePart(comp, 'r'),
          setValue: (comp, value) => setImpedancePart(comp, 'r', value, { keepEmpty: true })
        },
        {
          name: 'impedance_x',
          label: 'Impedance X (Ω)',
          type: 'number',
          getValue: comp => getImpedancePart(comp, 'x'),
          setValue: (comp, value) => setImpedancePart(comp, 'x', value, { keepEmpty: true })
        }
      ]);
    }

    let manufacturerInput = null;
    let modelInput = null;

    const form = document.createElement('form');
    form.id = 'prop-form';
    form.className = 'prop-detail-form';

    const buildField = (f, container) => {
      const lbl = document.createElement('label');
      lbl.textContent = f.label + ' ';
      let input;
      const defVal = manufacturerDefaults[targetComp.subtype]?.[f.name] || '';
      let curVal;
      if (typeof f.getValue === 'function') curVal = f.getValue(targetComp);
      else if (targetComp[f.name] !== undefined && targetComp[f.name] !== '') curVal = targetComp[f.name];
      else curVal = defVal;
      if (f.type === 'select') {
        input = document.createElement('select');
        (f.options || []).forEach(opt => {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          if (curVal == opt) o.selected = true;
          input.appendChild(o);
        });
      } else if (f.type === 'textarea') {
        input = document.createElement('textarea');
        input.value = curVal ?? '';
        if (f.rows) input.rows = f.rows;
        input.spellcheck = false;
      } else if (f.type === 'checkbox') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!curVal;
      } else {
        input = document.createElement('input');
        input.type = f.type || 'text';
        if (f.type === 'number') input.step = 'any';
        input.value = curVal ?? '';
      }
      input.name = f.name;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.name === 'manufacturer') manufacturerInput = input;
      if (f.name === 'model') modelInput = input;
      lbl.appendChild(input);
      if (f.help) {
        lbl.appendChild(document.createElement('br'));
        const help = document.createElement('small');
        help.className = 'prop-field-help';
        help.textContent = f.help;
        lbl.appendChild(help);
      }
      container.appendChild(lbl);
    };

    const applyFieldFromForm = (target, field, formData) => {
      if (field.type === 'checkbox') {
        const checked = formData.get(field.name) === 'on';
        if (typeof field.setValue === 'function') field.setValue(target, checked);
        else target[field.name] = checked;
        return;
      }
      const raw = formData.get(field.name);
      const value = raw === null ? '' : raw;
      if (typeof field.setValue === 'function') field.setValue(target, value);
      else if (field.type === 'number') target[field.name] = value ? parseFloat(value) : '';
      else target[field.name] = value || '';
    };

    let fields = [...baseFields, ...schema];
    if (targetComp.subtype === 'motor_load') {
      fields = fields.filter(
        f => !['conductor_type', 'cable_assembly', 'breaker_frame', 'conductor_assembly'].includes(f.name)
      );
    }

    const manufacturerFields = [];
    const noteFields = [];
    const electricalFields = [];
    const motorStartFields = [];
    const motorStartFieldNames = ['inrushMultiple', 'thevenin_r', 'thevenin_x', 'inertia', 'load_torque_curve'];
    fields.forEach(f => {
      if (targetComp.subtype === 'motor_load' && motorStartFieldNames.includes(f.name)) {
        motorStartFields.push(f);
      } else if (['manufacturer', 'model'].includes(f.name)) manufacturerFields.push(f);
      else if (['notes', 'failure_modes'].includes(f.name)) noteFields.push(f);
      else electricalFields.push(f);
    });

    const addFieldset = (legendText, fieldArr) => {
      if (!fieldArr.length) return;
      const fs = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = legendText;
      fs.appendChild(legend);
      fieldArr.forEach(f => buildField(f, fs));
      form.appendChild(fs);
    };

    addFieldset('Manufacturer', manufacturerFields);
    addFieldset('Electrical', electricalFields);
    addFieldset('Motor Start', motorStartFields);
    addFieldset('Notes', noteFields);

    if (manufacturerInput && modelInput) {
      const updateModels = () => {
        const models = manufacturerModels[manufacturerInput.value] || [];
        modelInput.innerHTML = '';
        models.forEach(m => {
          const o = document.createElement('option');
          o.value = m;
          o.textContent = m;
          if (targetComp.model === m) o.selected = true;
          modelInput.appendChild(o);
        });
      };
      manufacturerInput.addEventListener('change', updateModels);
      if (!manufacturerInput.value) manufacturerInput.value = Object.keys(manufacturerModels)[0];
      updateModels();
    }

    const tccLbl = document.createElement('label');
    tccLbl.textContent = 'TCC Device ';
    const tccInput = document.createElement('select');
    tccInput.name = 'tccId';
    const optEmpty = document.createElement('option');
    optEmpty.value = '';
    optEmpty.textContent = '--Select Device--';
    tccInput.appendChild(optEmpty);
    protectiveDevices.forEach(dev => {
      const opt = document.createElement('option');
      opt.value = dev.id;
      opt.textContent = dev.name;
      if (targetComp.tccId === dev.id) opt.selected = true;
      tccInput.appendChild(opt);
    });
    tccLbl.appendChild(tccInput);
    form.appendChild(tccLbl);

    const tccBtn = document.createElement('button');
    tccBtn.type = 'button';
    tccBtn.textContent = 'Edit TCC';
    tccBtn.classList.add('btn');
    tccBtn.addEventListener('click', () => {
      const dev = tccInput.value ? `&device=${encodeURIComponent(tccInput.value)}` : '';
      window.open(`tcc.html?component=${encodeURIComponent(targetComp.id)}${dev}`, '_blank');
    });
    form.appendChild(tccBtn);

    if ((targetComp.connections || []).length) {
      const header = document.createElement('h3');
      header.textContent = 'Connections';
      form.appendChild(header);
      const list = document.createElement('ul');
      (targetComp.connections || []).forEach((conn, idx) => {
        const li = document.createElement('li');
        const target = components.find(t => t.id === conn.target);
        const span = document.createElement('span');
        const cableInfo = getCableForConnection(targetComp, target, conn);
        const cableLabel = cableInfo?.tag || cableInfo?.cable_type;
        span.textContent = `to ${target?.label || target?.subtype || conn.target}${cableLabel ? ` (${cableLabel})` : ''}`;
        li.appendChild(span);
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = 'Edit';
        edit.classList.add('btn');
        edit.addEventListener('click', async e => {
          e.stopPropagation();
          const cableComp = targetComp.type === 'cable' ? targetComp : target?.type === 'cable' ? target : null;
          if (cableComp) {
            await editCableComponent(cableComp);
            renderPropertiesFor(targetComp);
          } else {
            showToast('No cable component on this connection');
          }
        });
        li.appendChild(edit);
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = 'Delete';
        del.classList.add('btn');
        del.addEventListener('click', e => {
          e.stopPropagation();
          targetComp.connections.splice(idx, 1);
          pushHistory();
          render();
          save();
          renderPropertiesFor(targetComp);
        });
        li.appendChild(del);
        li.addEventListener('click', () => {
          selectedConnection = { component: targetComp, index: idx };
        });
        list.appendChild(li);
      });
      form.appendChild(list);
    }

    const actions = document.createElement('div');
    actions.className = 'prop-form-actions';

    const applyBtn = document.createElement('button');
    applyBtn.type = 'submit';
    applyBtn.textContent = 'Apply';
    applyBtn.classList.add('btn');
    actions.appendChild(applyBtn);

    const templateBtn = document.createElement('button');
    templateBtn.type = 'button';
    templateBtn.textContent = 'Save as Template';
    templateBtn.classList.add('btn');
    templateBtn.addEventListener('click', () => {
      const name = prompt('Template name', targetComp.label || targetComp.subtype);
      if (!name) return;
      const fd = new FormData(form);
      const data = {
        subtype: targetComp.subtype,
        type: getCategory(targetComp),
        rotation: targetComp.rotation || 0,
        flipped: !!targetComp.flipped
      };
      fields.forEach(f => {
        applyFieldFromForm(data, f, fd);
      });
      data.tccId = fd.get('tccId') || '';
      templates.push({ name, component: data });
      saveTemplates();
      renderTemplates();
      showToast('Template saved');
    });
    actions.appendChild(templateBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.classList.add('btn');
    cancelBtn.addEventListener('click', closeModal);
    actions.appendChild(cancelBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete Component';
    deleteBtn.classList.add('btn');
    deleteBtn.addEventListener('click', () => {
      components = components.filter(c => c !== targetComp);
      components.forEach(c => {
        c.connections = (c.connections || []).filter(conn => conn.target !== targetComp.id);
      });
      closeModal();
      pushHistory();
      render();
      save();
    });
    actions.appendChild(deleteBtn);

    form.appendChild(actions);

    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      fields.forEach(f => {
        applyFieldFromForm(targetComp, f, fd);
      });
      targetComp.tccId = fd.get('tccId') || '';
      pushHistory();
      render();
      save();
      syncSchedules();
      closeModal();
    });

    propertyContainer.appendChild(form);
    propertyContainer.scrollTop = 0;

    function renderNodeProperties(node) {
      const displayName = node.label || node.id || 'Node';
      propertyHeading.textContent = `${displayName} Node`;
      const inboundCount = Array.isArray(node.inbound) ? node.inbound.length : 0;
      const outboundCount = Array.isArray(node.outbound) ? node.outbound.length : 0;
      const summary = document.createElement('p');
      summary.className = 'prop-node-summary';
      const formatCount = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
      summary.textContent = `This node has ${formatCount(inboundCount, 'inbound connection')} and ${formatCount(outboundCount, 'outbound connection')}.`;
      propertyContainer.appendChild(summary);

      const formatEndpoint = (component, fallback) => {
        if (component) return getComponentListLabel(component);
        if (fallback) return fallback;
        return 'Unknown';
      };

      const describeCable = conn => {
        if (!conn) return '';
        if (conn.cable && conn.cable.tag) return ` (${conn.cable.tag})`;
        if (conn.cable?.cable_type) return ` (${conn.cable.cable_type})`;
        if (conn.cable_tag) return ` (${conn.cable_tag})`;
        if (conn.cable_type) return ` (${conn.cable_type})`;
        return '';
      };

      const addConnectionList = (title, entries, direction) => {
        const header = document.createElement('h4');
        header.textContent = title;
        propertyContainer.appendChild(header);
        if (!entries.length) {
          const empty = document.createElement('p');
          empty.className = 'view-modal-empty prop-node-empty';
          empty.textContent = direction === 'inbound'
            ? 'No inbound connections.'
            : 'No outbound connections.';
          propertyContainer.appendChild(empty);
          return;
        }
        const list = document.createElement('ul');
        list.className = 'prop-node-connection-list';
        entries.forEach(entry => {
          const li = document.createElement('li');
          const text = document.createElement('span');
          if (direction === 'inbound') {
            const sourceLabel = formatEndpoint(entry.sourceComponent, entry.sourceId);
            text.textContent = `From ${sourceLabel}${describeCable(entry.connection)}`;
          } else {
            const targetLabel = formatEndpoint(entry.targetComponent, entry.targetId);
            text.textContent = `To ${targetLabel}${describeCable(entry.connection)}`;
          }
          li.appendChild(text);
          const related = direction === 'inbound' ? entry.sourceComponent : entry.targetComponent;
          if (related) {
            const viewBtn = document.createElement('button');
            viewBtn.type = 'button';
            viewBtn.textContent = 'View';
            viewBtn.classList.add('btn');
            viewBtn.addEventListener('click', e => {
              e.stopPropagation();
              setActiveComponent(related);
            });
            li.appendChild(viewBtn);
          }
          list.appendChild(li);
        });
        propertyContainer.appendChild(list);
      };

      addConnectionList('Inbound Connections', Array.isArray(node.inbound) ? node.inbound : [], 'inbound');
      addConnectionList('Outbound Connections', Array.isArray(node.outbound) ? node.outbound : [], 'outbound');

      const actions = document.createElement('div');
      actions.className = 'prop-form-actions';
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Delete Node';
      deleteBtn.classList.add('btn');
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        const nodeId = node.id;
        if (!nodeId) return;
        let updated = false;
        components.forEach(comp => {
          if (!Array.isArray(comp.connections)) return;
          const filtered = comp.connections.filter(conn => conn && conn.target !== nodeId);
          if (filtered.length !== comp.connections.length) {
            comp.connections = filtered;
            updated = true;
          }
        });
        const sheet = sheets[activeSheet];
        if (sheet && Array.isArray(sheet.connections)) {
          const filtered = sheet.connections.filter(conn => conn && conn.from !== nodeId && conn.to !== nodeId);
          if (filtered.length !== sheet.connections.length) {
            sheet.connections.splice(0, sheet.connections.length, ...filtered);
            connections = sheet.connections;
            updated = true;
          }
        }
        if (updated) {
          pushHistory();
          render();
          save();
          showToast('Node deleted');
          closeModal();
          selectComponent();
        } else {
          showToast('No connections referenced this node');
        }
      });
      actions.appendChild(deleteBtn);
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = 'Close';
      closeBtn.classList.add('btn');
      closeBtn.addEventListener('click', () => {
        closeModal();
      });
      actions.appendChild(closeBtn);
      propertyContainer.appendChild(actions);
      propertyContainer.scrollTop = 0;
    }
  }

  function setActiveComponent(target) {
    if (!target) return;
    const targetCategory = getCategory(target) || activeCategory;
    if (targetCategory && targetCategory !== activeCategory) {
      activeCategory = targetCategory;
      renderDeviceButtons();
      updateCategoryStates();
    } else if (!buttonMap.has(target.id)) {
      renderDeviceButtons();
    }
    activeComponent = target;
    activeId = target.id;
    if (target?.isVirtualNode) {
      selected = null;
      selection = [];
    } else {
      selected = target;
      selection = [target];
    }
    selectedConnection = null;
    updateButtonStates();
    renderPropertiesFor(target);
  }

  renderCategoryButtons();
  renderDeviceButtons();
  updateCategoryStates();
  updateButtonStates();
  renderPropertiesFor(activeComponent);

  const initialButton = buttonMap.get(activeId);
  if (initialButton) initialButton.focus();

  modal.classList.add('show');
  modal.addEventListener('click', outsideHandler);
  document.addEventListener('keydown', keyHandler);
  modal._outsideHandler = outsideHandler;
  modal._keyHandler = keyHandler;
}

async function chooseCable(source, target, existingConn = null) {
  const templateData = [];
  try {
    const res = await fetch('cableTemplates.json');
    const arr = await res.json();
    arr.forEach(t => templateData.push(t));
  } catch (e) {}

  const existingTemplates = [];
  const seen = new Set();
  getCables().forEach(c => {
    if (!seen.has(c.tag)) {
      const template = { ...c };
      if (hasImpedance(c)) template.impedance = { ...c.impedance };
      existingTemplates.push(template);
      seen.add(c.tag);
    }
  });
  components.forEach(c => {
    if (c.type === 'cable' && c.cable && !seen.has(c.cable.tag)) {
      const template = {
        ...c.cable,
        phases: Array.isArray(c.cable.phases) ? c.cable.phases.join(',') : c.cable.phases,
        conductors: c.cable.conductors
      };
      if (hasImpedance(c.cable)) template.impedance = { ...c.cable.impedance };
      existingTemplates.push(template);
      if (c.cable.tag) seen.add(c.cable.tag);
    }
    (c.connections || []).forEach(conn => {
      if (conn.cable && !seen.has(conn.cable.tag)) {
        const template = {
          ...conn.cable,
          phases: (conn.phases || []).join(','),
          conductors: conn.conductors || conn.cable?.conductors
        };
        if (hasImpedance(conn.cable)) template.impedance = { ...conn.cable.impedance };
        existingTemplates.push(template);
        seen.add(conn.cable.tag);
      }
    });
  });

  return new Promise(resolve => {
    const modal = document.getElementById('cable-modal');
    modal.innerHTML = '';
    const form = document.createElement('form');

    const tplLabel = document.createElement('label');
    tplLabel.textContent = 'Template ';
    const tplSelect = document.createElement('select');
    const optTpl = document.createElement('option');
    optTpl.value = '';
    optTpl.textContent = '--Template--';
    tplSelect.appendChild(optTpl);
    templateData.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = t.name;
      tplSelect.appendChild(opt);
    });
    tplLabel.appendChild(tplSelect);
    form.appendChild(tplLabel);

    const selLabel = document.createElement('label');
    selLabel.textContent = 'Existing ';
    const select = document.createElement('select');
    const optNew = document.createElement('option');
    optNew.value = '';
    optNew.textContent = '--New Cable--';
    select.appendChild(optNew);
    existingTemplates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.tag;
      opt.textContent = t.tag;
      select.appendChild(opt);
    });
    selLabel.appendChild(select);
    form.appendChild(selLabel);

    const tagLabel = document.createElement('label');
    tagLabel.textContent = 'Tag ';
    const tagInput = document.createElement('input');
    tagInput.name = 'tag';
    tagLabel.appendChild(tagInput);
    form.appendChild(tagLabel);

    const typeLabel = document.createElement('label');
    typeLabel.textContent = 'Type ';
    const typeInput = document.createElement('input');
    typeInput.name = 'cable_type';
    typeLabel.appendChild(typeInput);
    form.appendChild(typeLabel);

    const conductorsLabel = document.createElement('label');
    conductorsLabel.textContent = 'Conductors ';
    const conductorsInput = document.createElement('input');
    conductorsInput.type = 'number';
    conductorsInput.name = 'conductors';
    conductorsLabel.appendChild(conductorsInput);
    form.appendChild(conductorsLabel);

    const phasesLabel = document.createElement('label');
    phasesLabel.textContent = 'Phases ';
    const phasesInput = document.createElement('input');
    phasesInput.name = 'phases';
    phasesInput.placeholder = 'A,B,C';
    phasesLabel.appendChild(phasesInput);
    form.appendChild(phasesLabel);

    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'Conductor Size ';
    const sizeInput = document.createElement('input');
    sizeInput.name = 'conductor_size';
    sizeLabel.appendChild(sizeInput);
    form.appendChild(sizeLabel);

    const materialLabel = document.createElement('label');
    materialLabel.textContent = 'Conductor Material ';
    const materialInput = document.createElement('input');
    materialInput.name = 'conductor_material';
    materialLabel.appendChild(materialInput);
    form.appendChild(materialLabel);

    const insulationLabel = document.createElement('label');
    insulationLabel.textContent = 'Insulation Type ';
    const insulationInput = document.createElement('input');
    insulationInput.name = 'insulation_type';
    insulationLabel.appendChild(insulationInput);
    form.appendChild(insulationLabel);

    const ambientLabel = document.createElement('label');
    ambientLabel.textContent = 'Ambient Temp (°C) ';
    const ambientInput = document.createElement('input');
    ambientInput.type = 'number';
    ambientInput.name = 'ambient_temp';
    ambientLabel.appendChild(ambientInput);
    form.appendChild(ambientLabel);

    const installLabel = document.createElement('label');
    installLabel.textContent = 'Install Method ';
    const installInput = document.createElement('input');
    installInput.name = 'install_method';
    installLabel.appendChild(installInput);
    form.appendChild(installLabel);

    const lengthLabel = document.createElement('label');
    lengthLabel.textContent = 'Length (ft) ';
    const lengthInput = document.createElement('input');
    lengthInput.type = 'number';
    lengthInput.name = 'length';
    lengthLabel.appendChild(lengthInput);
    form.appendChild(lengthLabel);

    const impedanceRLabel = document.createElement('label');
    impedanceRLabel.textContent = 'Impedance R (Ω) ';
    const impedanceRInput = document.createElement('input');
    impedanceRInput.type = 'number';
    impedanceRInput.step = 'any';
    impedanceRInput.name = 'impedance_r';
    impedanceRLabel.appendChild(impedanceRInput);
    form.appendChild(impedanceRLabel);

    const impedanceXLabel = document.createElement('label');
    impedanceXLabel.textContent = 'Impedance X (Ω) ';
    const impedanceXInput = document.createElement('input');
    impedanceXInput.type = 'number';
    impedanceXInput.step = 'any';
    impedanceXInput.name = 'impedance_x';
    impedanceXLabel.appendChild(impedanceXInput);
    form.appendChild(impedanceXLabel);

    const existingImpedance = existingConn?.cable?.impedance || existingConn?.impedance;
    if (existingImpedance && typeof existingImpedance === 'object') {
      impedanceRInput.value = existingImpedance.r ?? existingImpedance.R ?? '';
      impedanceXInput.value = existingImpedance.x ?? existingImpedance.X ?? '';
    }

    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color ';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.name = 'color';
    colorLabel.appendChild(colorInput);
    form.appendChild(colorLabel);

    const sizeBtn = document.createElement('button');
    sizeBtn.type = 'button';
    sizeBtn.textContent = 'Size Conductor';
    sizeBtn.addEventListener('click', () => {
      const load = {
        current: parseFloat(target?.current) || 0,
        voltage: parseFloat(target?.voltage) || parseFloat(source?.voltage) || 0,
        phases: parseInt(target?.phases || source?.phases || 3, 10)
      };
      const params = {
        length: parseFloat(lengthInput.value) || 0,
        material: materialInput.value || 'cu',
        insulation_rating: parseFloat(target?.insulation_rating) || 90,
        ambient: parseFloat(ambientInput.value) || parseFloat(source?.ambient) || 30,
        maxVoltageDrop: parseFloat(target?.maxVoltageDrop) || 3,
        conductors: parseInt(conductorsInput.value) || 1,
        code: target?.code || 'NEC'
      };
      const res = sizeConductor(load, params);
      if (res.size) {
        sizeInput.value = res.size;
        sizeInput.dataset.calcAmpacity = res.ampacity.toFixed(2);
        sizeInput.dataset.voltageDrop = res.voltageDrop.toFixed(2);
        sizeInput.dataset.sizingWarning = '';
        sizeInput.dataset.codeRef = res.codeRef;
        sizeInput.dataset.sizingReport = JSON.stringify(res.report || {});
        sizeInput.classList.remove('sizing-violation');
        alert(`Sized to ${res.size}`);
      } else {
        sizeInput.dataset.calcAmpacity = '';
        sizeInput.dataset.voltageDrop = '';
        sizeInput.dataset.sizingWarning = res.violation;
        sizeInput.dataset.codeRef = res.codeRef || '';
        sizeInput.dataset.sizingReport = JSON.stringify(res.report || {});
        sizeInput.classList.add('sizing-violation');
        alert(res.violation);
      }
    });
    form.appendChild(sizeBtn);

    tplSelect.addEventListener('change', () => {
      const t = templateData.find(tp => tp.name === tplSelect.value);
      if (t) {
        sizeInput.value = t.conductor_size || '';
        materialInput.value = t.conductor_material || '';
        insulationInput.value = t.insulation_type || '';
        ambientInput.value = t.ambient_temp || '';
        installInput.value = t.install_method || '';
        impedanceRInput.value = getImpedancePart(t, 'r') || '';
        impedanceXInput.value = getImpedancePart(t, 'x') || '';
      }
    });

    select.addEventListener('change', () => {
      const c = existingTemplates.find(t => t.tag === select.value);
      if (c) {
        tagInput.value = c.tag || '';
        typeInput.value = c.cable_type || '';
        conductorsInput.value = c.conductors || '';
        phasesInput.value = c.phases || '';
        sizeInput.value = c.conductor_size || '';
        materialInput.value = c.conductor_material || '';
        insulationInput.value = c.insulation_type || '';
        lengthInput.value = c.length || '';
        colorInput.value = c.color || '#000000';
        ambientInput.value = c.ambient_temp || '';
        installInput.value = c.install_method || '';
        impedanceRInput.value = getImpedancePart(c, 'r') || '';
        impedanceXInput.value = getImpedancePart(c, 'x') || '';
      } else {
        tagInput.value = '';
        typeInput.value = '';
        conductorsInput.value = '';
        phasesInput.value = '';
        sizeInput.value = '';
        materialInput.value = '';
        insulationInput.value = '';
        lengthInput.value = '';
        colorInput.value = '#000000';
        ambientInput.value = '';
        installInput.value = '';
        impedanceRInput.value = '';
        impedanceXInput.value = '';
        sizeInput.dataset.calcAmpacity = '';
        sizeInput.dataset.voltageDrop = '';
        sizeInput.dataset.sizingWarning = '';
        sizeInput.dataset.codeRef = '';
        sizeInput.dataset.sizingReport = '';
        sizeInput.classList.remove('sizing-violation');
      }
    });

    if (existingConn) {
      const existing = existingConn.cable || existingConn;
      tagInput.value = existing.tag || '';
      typeInput.value = existing.cable_type || '';
      conductorsInput.value = existingConn.conductors || existing.conductors || '';
      phasesInput.value = Array.isArray(existingConn.phases)
        ? existingConn.phases.join(',')
        : existing.phases || '';
      sizeInput.value = existing.conductor_size || '';
      materialInput.value = existing.conductor_material || '';
      insulationInput.value = existing.insulation_type || '';
      const autoLen = (existingConn.length || 0) * (diagramScale.unitPerPx || 1);
      if (existing.length) {
        lengthInput.value = existing.length;
      } else if (autoLen) {
        lengthInput.value = autoLen.toFixed(2);
      }
      colorInput.value = existing.color || '#000000';
      ambientInput.value = existing.ambient_temp || '';
      installInput.value = existing.install_method || '';
      sizeInput.dataset.calcAmpacity = existing.calc_ampacity || '';
      sizeInput.dataset.voltageDrop = existing.voltage_drop_pct || existing.voltage_drop || '';
      sizeInput.dataset.sizingWarning = existing.sizing_warning || '';
      sizeInput.dataset.codeRef = existing.code_reference || '';
      sizeInput.dataset.sizingReport = existing.sizing_report || '';
      if (existing.sizing_warning) sizeInput.classList.add('sizing-violation');
      impedanceRInput.value = getImpedancePart(existing, 'r') || '';
      impedanceXInput.value = getImpedancePart(existing, 'x') || '';
      if (existingTemplates.some(t => t.tag === existing.tag)) {
        select.value = existing.tag;
      }
    } else {
      colorInput.value = '#000000';
      impedanceRInput.value = '';
      impedanceXInput.value = '';
    }

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.textContent = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      modal.classList.remove('show');
      resolve(null);
    });
    form.appendChild(saveBtn);
    form.appendChild(cancelBtn);

    form.addEventListener('submit', e => {
      e.preventDefault();
      const phases = phasesInput.value
        .split(',')
        .map(p => p.trim().toUpperCase())
        .filter(Boolean);
      const conductors = conductorsInput.value;
      const manualLen = lengthInput.value.trim() !== '';
      const cable = {
        tag: tagInput.value,
        cable_type: typeInput.value,
        conductors,
        conductor_size: sizeInput.value,
        conductor_material: materialInput.value,
        insulation_type: insulationInput.value,
        ambient_temp: ambientInput.value,
        install_method: installInput.value,
        color: colorInput.value,
        phases: phases.length,
        calc_ampacity: sizeInput.dataset.calcAmpacity || '',
        voltage_drop_pct: sizeInput.dataset.voltageDrop || '',
        sizing_warning: sizeInput.dataset.sizingWarning || '',
        code_reference: sizeInput.dataset.codeRef || '',
        sizing_report: sizeInput.dataset.sizingReport || ''
      };
      setImpedancePart(cable, 'r', impedanceRInput.value, { keepEmpty: false });
      setImpedancePart(cable, 'x', impedanceXInput.value, { keepEmpty: false });
      if (manualLen) {
        cable.length = lengthInput.value;
        cable.manual_length = true;
      }
      modal.classList.remove('show');
      const resolvedCable = { ...cable, from_tag: source?.ref || source?.id || '', to_tag: target?.ref || target?.id || '' };
      if (hasImpedance(cable)) resolvedCable.impedance = { ...cable.impedance };
      resolve({
        cable: resolvedCable,
        phases,
        conductors,
        impedance: hasImpedance(cable) ? { ...cable.impedance } : undefined
      });
    });

    modal.appendChild(form);
    modal.classList.add('show');
  });
}

async function editCableComponent(comp) {
  if (!comp) return;
  if (!comp.cable || typeof comp.cable !== 'object') comp.cable = {};
  const outbound = (comp.connections || []).find(conn => conn.target);
  const target = outbound ? components.find(t => t.id === outbound.target) || {} : {};
  const workingConn = outbound || {
    target: target.id || '',
    cable: comp.cable,
    phases: Array.isArray(comp.cable?.phases) ? comp.cable.phases : parseCablePhases(comp.cable),
    conductors: comp.cable?.conductors || comp.cable?.conductors_count || ''
  };
  const hadOutboundCable = outbound ? Object.prototype.hasOwnProperty.call(outbound, 'cable') : false;
  const originalCable = outbound ? outbound.cable : undefined;
  if (outbound) outbound.cable = comp.cable;
  let res = null;
  try {
    res = await chooseCable(comp, target, workingConn);
  } finally {
    if (!res && outbound) {
      if (hadOutboundCable) outbound.cable = originalCable;
      else delete outbound.cable;
    }
  }
  if (!res) return;
  const updatedCable = { ...res.cable };
  if (hasImpedance(res.cable)) updatedCable.impedance = { ...res.cable.impedance };
  comp.cable = updatedCable;
  if (outbound) {
    outbound.cable = { ...updatedCable };
    if (hasImpedance(updatedCable)) outbound.cable.impedance = { ...updatedCable.impedance };
    outbound.phases = res.phases;
    outbound.conductors = res.conductors;
    if (res.impedance && typeof res.impedance === 'object') {
      outbound.impedance = { ...res.impedance };
    } else if (hasImpedance(updatedCable)) {
      outbound.impedance = { ...updatedCable.impedance };
    } else {
      delete outbound.impedance;
    }
  }
  pushHistory();
  render();
  save();
  syncSchedules();
}

function openCableProperties(comp) {
  if (!comp) return;
  selected = comp;
  selection = [comp];
  selectedConnection = null;
  const modal = ensurePropModal();
  if (modal._outsideHandler) modal.removeEventListener('click', modal._outsideHandler);
  if (modal._keyHandler) document.removeEventListener('keydown', modal._keyHandler);
  modal.innerHTML = '';
  const form = document.createElement('form');
  form.id = 'cable-prop-form';

  const outsideHandler = e => { if (e.target === modal) closeModal(); };
  const keyHandler = e => { if (e.key === 'Escape') { e.preventDefault(); closeModal(); } };

  function closeModal() {
    modal.classList.remove('show');
    selected = null;
    selection = [];
    selectedConnection = null;
    modal.removeEventListener('click', outsideHandler);
    document.removeEventListener('keydown', keyHandler);
    delete modal._outsideHandler;
    delete modal._keyHandler;
  }

  const labelLabel = document.createElement('label');
  labelLabel.textContent = 'Label ';
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.value = comp.label || '';
  labelLabel.appendChild(labelInput);
  form.appendChild(labelLabel);

  const refLabel = document.createElement('label');
  refLabel.textContent = 'Ref ID ';
  const refInput = document.createElement('input');
  refInput.type = 'text';
  refInput.value = comp.ref || '';
  refLabel.appendChild(refInput);
  form.appendChild(refLabel);

  const cableInfo = document.createElement('div');
  cableInfo.classList.add('cable-info');
  const cable = comp.cable || {};
  cableInfo.innerHTML = `
    <p><strong>Tag:</strong> ${cable.tag || ''}</p>
    <p><strong>Type:</strong> ${cable.cable_type || ''}</p>
    <p><strong>Conductors:</strong> ${cable.conductors || ''}</p>
    <p><strong>Phases:</strong> ${Array.isArray(cable.phases) ? cable.phases.join(',') : cable.phases || ''}</p>
    <p><strong>Length:</strong> ${cable.length || ''}</p>
    <p><strong>Impedance R (Ω):</strong> ${getImpedancePart(cable, 'r') || ''}</p>
    <p><strong>Impedance X (Ω):</strong> ${getImpedancePart(cable, 'x') || ''}</p>
  `;
  form.appendChild(cableInfo);

  const impedanceRLabel = document.createElement('label');
  impedanceRLabel.textContent = 'Impedance R (Ω) ';
  const impedanceRInput = document.createElement('input');
  impedanceRInput.type = 'number';
  impedanceRInput.step = 'any';
  impedanceRInput.value = getImpedancePart(cable, 'r') || '';
  impedanceRLabel.appendChild(impedanceRInput);
  form.appendChild(impedanceRLabel);

  const impedanceXLabel = document.createElement('label');
  impedanceXLabel.textContent = 'Impedance X (Ω) ';
  const impedanceXInput = document.createElement('input');
  impedanceXInput.type = 'number';
  impedanceXInput.step = 'any';
  impedanceXInput.value = getImpedancePart(cable, 'x') || '';
  impedanceXLabel.appendChild(impedanceXInput);
  form.appendChild(impedanceXLabel);

  const editCableBtn = document.createElement('button');
  editCableBtn.type = 'button';
  editCableBtn.textContent = 'Edit Cable Details';
  editCableBtn.classList.add('btn');
  editCableBtn.addEventListener('click', async e => {
    e.preventDefault();
    await editCableComponent(comp);
    openCableProperties(comp);
  });
  form.appendChild(editCableBtn);

  const applyBtn = document.createElement('button');
  applyBtn.type = 'submit';
  applyBtn.textContent = 'Apply';
  applyBtn.classList.add('btn');
  form.appendChild(applyBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.classList.add('btn');
  cancelBtn.addEventListener('click', closeModal);
  form.appendChild(cancelBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Delete Cable Component';
  deleteBtn.classList.add('btn');
  deleteBtn.addEventListener('click', () => {
    components = components.filter(c => c !== comp);
    components.forEach(c => {
      c.connections = (c.connections || []).filter(conn => conn.target !== comp.id);
    });
    closeModal();
    pushHistory();
    render();
    save();
  });
  form.appendChild(deleteBtn);

  form.addEventListener('submit', e => {
    e.preventDefault();
    comp.label = labelInput.value || '';
    comp.ref = refInput.value || '';
    if (!comp.cable || typeof comp.cable !== 'object') comp.cable = {};
    setImpedancePart(comp.cable, 'r', impedanceRInput.value, { keepEmpty: false });
    setImpedancePart(comp.cable, 'x', impedanceXInput.value, { keepEmpty: false });
    pushHistory();
    render();
    save();
    syncSchedules();
    closeModal();
  });

  modal.appendChild(form);
  modal.classList.add('show');
  modal._outsideHandler = outsideHandler;
  modal._keyHandler = keyHandler;
  modal.addEventListener('click', outsideHandler);
  document.addEventListener('keydown', keyHandler);
}

async function init() {
  lintPanel = document.getElementById('lint-panel');
  lintList = document.getElementById('lint-list');
  const lintCloseBtn = document.getElementById('lint-close-btn');
  if (lintCloseBtn) lintCloseBtn.addEventListener('click', () => lintPanel.classList.add('hidden'));

  let svg = document.getElementById('diagram');
  if (!svg) {
    svg = document.querySelector('svg');
    if (svg) svg.id = 'diagram';
  }
  if (svg) {
    svg.addEventListener('dragover', e => e.preventDefault());
    svg.addEventListener('drop', e => {
      e.preventDefault();
      const dataText = e.dataTransfer.getData('text/plain');
      if (!dataText) return;
      let info;
      try {
        info = JSON.parse(dataText);
      } catch {
        showToast('Cannot drop component');
        return;
      }
      const coords = toDiagramCoords(e);
      const { left, top } = svg.getBoundingClientRect();
      const fallbackX = e.clientX - left;
      const fallbackY = e.clientY - top;
      const x = Number.isFinite(coords?.x) ? coords.x : fallbackX;
      const y = Number.isFinite(coords?.y) ? coords.y : fallbackY;
      const comp = addComponent({ type: info.type, subtype: info.subtype, x, y, skipHistory: true });
      autoAttachComponent(comp);
      pushHistory();
      render();
      save();
      const elem = svg.querySelector(`g.component[data-id="${comp.id}"]`);
      if (elem) {
        elem.classList.add('flash');
        setTimeout(() => elem.classList.remove('flash'), 500);
      }
    });
  }

  const { sheets: storedSheets, activeSheet: storedActive = 0 } = getOneLine();
  sheets = storedSheets.map((s, i) => ({
    name: s.name || `Sheet ${i + 1}`,
    components: (s.components || []).map(normalizeComponent),
    connections: Array.isArray(s.connections) ? s.connections : []
  }));
  if (!sheets.length) sheets = [{ name: 'Sheet 1', components: [], connections: [] }];

  sheets.forEach(s => {
    s.components.forEach(c => {
      if (c.type === 'dimension') return;
      if (!componentMeta[c.subtype]) {
        const icon = typeIcons[c.type] || asset('icons/equipment.svg');
        const category = categoryForType(c.type);
        componentMeta[c.subtype] = {
          icon,
          label: c.subtype,
          category,
          type: c.type,
          ports: normalizePortsForCategory(category, c.ports, c.type, c.subtype)
        };
      }
      if (!propSchemas[c.subtype]) {
        const skip = new Set(['id', 'type', 'subtype', 'x', 'y', 'rotation', 'flipped', 'connections', 'label', 'ref', 'props']);
        const raw = {};
        Object.entries(c).forEach(([k, v]) => {
          if (skip.has(k)) return;
          if (v && typeof v === 'object') return;
          raw[k] = v;
        });
        propSchemas[c.subtype] = inferSchemaFromProps(raw);
      }
    });
  });
  rebuildComponentMaps();
  Object.keys(componentMeta).forEach(sub => {
    if (!propSchemas[sub]) propSchemas[sub] = inferSchemaFromProps(componentMeta[sub].props || {});
  });
  sheets.forEach(s => {
    s.components.forEach(c => {
      (c.connections || []).forEach(conn => {
        const target = s.components.find(t => t.id === conn.target);
        if (target && (conn.sourcePort === undefined || conn.targetPort === undefined)) {
          const [sp, tp] = nearestPorts(c, target);
          conn.sourcePort = sp;
          conn.targetPort = tp;
        }
      });
    });
  });

  // initialize counters from existing labels
  labelCounters = getItem('labelCounters', labelCounters);
  sheets.forEach(s => {
    s.components.forEach(c => {
      const m = (c.label || '').match(/(\d+)$/);
      if (m) {
        const num = Number(m[1]);
        if (!labelCounters[c.subtype] || labelCounters[c.subtype] < num) {
          labelCounters[c.subtype] = num;
        }
      }
    });
  });
  setItem('labelCounters', labelCounters);

  activeSheet = Math.min(storedActive, sheets.length - 1);
  components = sheets[activeSheet].components;
  connections = sheets[activeSheet].connections;
  history = [JSON.parse(JSON.stringify(components))];
  historyIndex = 0;
  refreshAttributeOptions();
  renderSheetTabs();
  render();
  const initIssues = validateDiagram();
  if (!initIssues.length) syncSchedules(false);

  const prefixBtn = document.getElementById('prefix-settings-btn');
  if (prefixBtn) prefixBtn.addEventListener('click', editPrefixes);

  const defaultsBtn = document.getElementById('update-defaults-btn');
  if (defaultsBtn) defaultsBtn.addEventListener('click', editManufacturerDefaults);

  const exportReportsBtn = document.getElementById('export-reports-btn');
  if (exportReportsBtn) exportReportsBtn.addEventListener('click', () => exportAllReports());

  buildPalette();
  loadTemplates();
  renderTemplates();
  setupLibraryTools();
  const customComponentStorageSuffix = `:${customComponentStorageKey}`;
  window.addEventListener('storage', e => {
    if (!e.key) return;
    if (e.key === customComponentStorageKey || e.key.endsWith(customComponentStorageSuffix)) {
      loadComponentLibrary()
        .then(() => render())
        .catch(err => console.error('Custom component reload failed', err));
    }
  });
  const connectBtn = document.getElementById('connect-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      connectMode = !connectMode;
      connectSource = null;
      connectBtn.classList.toggle('active', connectMode);
      render();
    });
  }
  // dimension tool removed
  document.getElementById('undo-btn').addEventListener('click', undo);
  document.getElementById('redo-btn').addEventListener('click', redo);
  document.getElementById('align-left-btn').addEventListener('click', () => alignSelection('left'));
  document.getElementById('align-right-btn').addEventListener('click', () => alignSelection('right'));
  document.getElementById('align-top-btn').addEventListener('click', () => alignSelection('top'));
  document.getElementById('align-bottom-btn').addEventListener('click', () => alignSelection('bottom'));
  document.getElementById('distribute-h-btn').addEventListener('click', () => distributeSelection('h'));
  document.getElementById('distribute-v-btn').addEventListener('click', () => distributeSelection('v'));
  const exportBtn = document.getElementById('export-btn');
  const exportMenu = document.getElementById('export-menu');
  if (exportBtn && exportMenu) {
    exportBtn.addEventListener('click', () => {
      const expanded = exportBtn.getAttribute('aria-expanded') === 'true';
      exportBtn.setAttribute('aria-expanded', String(!expanded));
      exportMenu.classList.toggle('show');
    });
    exportMenu.addEventListener('click', e => {
      const format = e.target?.dataset?.format;
      if (!format) return;
      exportMenu.classList.remove('show');
      exportBtn.setAttribute('aria-expanded', 'false');
      if (format === 'pdf') {
        exportPDF({
          svgEl: document.getElementById('diagram'),
          sheets,
          loadSheet,
          serializeDiagram,
          activeSheet
        });
      } else if (format === 'dxf') {
        exportDXF(sheets[activeSheet]?.components || []);
      } else if (format === 'dwg') {
        exportDWG(sheets[activeSheet]?.components || []);
      }
    });
  }
  const viewMenuBtn = document.getElementById('view-menu-btn');
  if (viewMenuBtn) {
    viewMenuBtn.setAttribute('aria-expanded', 'false');
    viewMenuBtn.addEventListener('click', event => {
      event.preventDefault();
      if (viewMenuBtn.disabled) return;
      openViewModal();
    });
    updateViewButtonLabel();
  }
  const importBtn = document.getElementById('import-btn');
  if (importBtn) importBtn.addEventListener('click', () => document.getElementById('import-input').click());
  const importInput = document.getElementById('import-input');
  if (importInput) importInput.addEventListener('change', handleImport);
  const diagramExportBtn = document.getElementById('diagram-export-btn');
  if (diagramExportBtn) diagramExportBtn.addEventListener('click', exportDiagram);
  const diagramImportBtn = document.getElementById('diagram-import-btn');
  if (diagramImportBtn) diagramImportBtn.addEventListener('click', () => document.getElementById('diagram-import-input').click());
  const diagramImportInput = document.getElementById('diagram-import-input');
  if (diagramImportInput) diagramImportInput.addEventListener('change', handleImport);
  const shareBtn = document.getElementById('diagram-share-btn');
  if (shareBtn) shareBtn.addEventListener('click', shareDiagram);
  const sampleBtn = document.getElementById('sample-diagram-btn');
  if (sampleBtn) sampleBtn.addEventListener('click', loadSampleDiagram);
  const onelineExportBtn = document.getElementById('export-oneline-data-btn');
  if (onelineExportBtn) onelineExportBtn.addEventListener('click', exportOneLineDiagnostics);
  document.getElementById('add-sheet-btn').addEventListener('click', () => addSheet());
  document.getElementById('rename-sheet-btn').addEventListener('click', () => renameSheet());
  document.getElementById('delete-sheet-btn').addEventListener('click', () => deleteSheet());
  document.getElementById('validate-btn').addEventListener('click', validateDiagram);

  updateZoomDisplay();
  applyDiagramZoom();
  window.addEventListener('resize', () => applyDiagramZoom());
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  const zoomResetBtn = document.getElementById('zoom-reset-btn');
  zoomInBtn?.addEventListener('click', () => {
    const focus = getViewportCenter();
    adjustZoom(1.2, focus ? { focusPoint: focus } : {});
  });
  zoomOutBtn?.addEventListener('click', () => {
    const focus = getViewportCenter();
    adjustZoom(1 / 1.2, focus ? { focusPoint: focus } : {});
  });
  zoomResetBtn?.addEventListener('click', () => {
    const focus = getViewportCenter();
    setDiagramZoom(DEFAULT_DIAGRAM_ZOOM, focus ? { focusPoint: focus } : {});
  });

  const gridToggle = document.getElementById('grid-toggle');
  const gridSizeInput = document.getElementById('grid-size');
  const gridPattern = document.getElementById('grid');
  const gridPath = gridPattern.querySelector('path');
  if (gridToggle) gridToggle.checked = gridEnabled;
  if (gridSizeInput) gridSizeInput.value = gridSize;
  gridPattern.setAttribute('width', gridSize);
  gridPattern.setAttribute('height', gridSize);
  gridPath.setAttribute('d', `M${gridSize} 0 L0 0 0 ${gridSize}`);
  document.getElementById('grid-bg').style.display = gridEnabled ? 'block' : 'none';
  gridToggle?.addEventListener('change', toggleGrid);
  gridSizeInput?.addEventListener('change', e => {
    gridSize = Number(e.target.value) || 20;
    gridPattern.setAttribute('width', gridSize);
    gridPattern.setAttribute('height', gridSize);
    gridPath.setAttribute('d', `M${gridSize} 0 L0 0 0 ${gridSize}`);
    setItem('gridSize', gridSize);
    render();
  });

  const findForm = document.getElementById('find-device-form');
  const findInput = document.getElementById('find-device-input');
  if (findForm && findInput) {
    findForm.addEventListener('submit', e => {
      e.preventDefault();
      const query = findInput.value.trim();
      if (!query) {
        showToast('Enter a device tag to find');
        findInput.focus();
        return;
      }
      const match = findComponentByTag(query);
      if (!match) {
        showToast(`No device found matching "${query}"`);
        return;
      }
      selection = [match];
      selected = match;
      selectedConnection = null;
      highlightFoundComponent(match.id);
      focusComponentElement(match);
      showToast(`Selected ${match.label || match.subtype || match.id}`);
    });
  }

  const workspaceEl = document.querySelector('.workspace');
  const splitter = document.querySelector('.splitter');
  const paletteToggle = document.getElementById('palette-toggle');

  if (workspaceEl) {
    workspaceEl.style.setProperty('--palette-width', `${paletteWidth}px`);
  }
  if (splitter) {
    splitter.style.left = `${paletteWidth}px`;
  }

  splitter?.addEventListener('mousedown', e => {
    resizingPalette = true;
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!resizingPalette || !workspaceEl) return;
    const rect = workspaceEl.getBoundingClientRect();
    const nextWidth = clampPaletteWidth(e.clientX - rect.left, paletteWidth);
    if (nextWidth === paletteWidth) return;
    paletteWidth = nextWidth;
    workspaceEl.style.setProperty('--palette-width', `${paletteWidth}px`);
    workspaceEl.style.gridTemplateColumns = `${paletteWidth}px 1fr`;
    if (splitter) splitter.style.left = `${paletteWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    const wasResizingPalette = resizingPalette;
    resizingPalette = false;
    if (wasResizingPalette) {
      if (workspaceEl) {
        workspaceEl.style.setProperty('--palette-width', `${paletteWidth}px`);
      }
      setItem(paletteWidthStorageKey, Math.round(paletteWidth));
    }
    let needsRender = false;
    let needsSave = false;
    if (draggingLabel) {
      const moved = draggingLabel.moved;
      draggingLabel = null;
      if (moved) {
        pushHistory();
        needsRender = true;
        needsSave = true;
      }
    }
    if (resizingAnnotation) {
      const data = resizingAnnotation;
      resizingAnnotation = null;
      const comp = data.comp;
      if (comp) {
        const widthChanged = Math.abs((comp.width || 0) - data.startWidth) > 0.01;
        const heightChanged = Math.abs((comp.height || 0) - data.startHeight) > 0.01;
        if (widthChanged || heightChanged) {
          pushHistory();
          needsSave = true;
        }
        needsRender = true;
      }
    }
    if (marquee && marquee.active) {
      const changed = finalizeMarqueeSelection();
      marqueeSelectionMade = changed;
      needsRender = true;
    }
    if (needsRender) {
      render();
    }
    if (needsSave) {
      save();
    }
  });

  paletteToggle?.addEventListener('click', () => {
    if (!workspaceEl) return;
    const show = !workspaceEl.classList.contains('show-palette');
    workspaceEl.classList.toggle('show-palette', show);
    paletteToggle.setAttribute('aria-expanded', show);
    if (show) {
      workspaceEl.style.setProperty('--palette-width', `${paletteWidth}px`);
      workspaceEl.style.gridTemplateColumns = `${paletteWidth}px 1fr`;
      if (splitter) splitter.style.left = `${paletteWidth}px`;
    } else {
      workspaceEl.style.gridTemplateColumns = '1fr';
    }
  });

  const editorEl = document.querySelector('.oneline-editor');
  const legendEl = document.getElementById('voltage-legend');
  if (editorEl) {
    editorEl.addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const focus = toDiagramCoords(e);
      e.preventDefault();
      adjustZoom(factor, { focusPoint: focus });
    }, { passive: false });
  }
  legendEl?.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    legendDrag = {
      dx: e.offsetX,
      dy: e.offsetY,
      startX: e.clientX,
      startY: e.clientY,
      moved: false
    };
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!middlePanState) return;
    updateMiddlePan(e);
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!legendDrag || !legendEl || !editorEl) return;
    const rect = editorEl.getBoundingClientRect();
    const parent = legendEl.offsetParent instanceof HTMLElement ? legendEl.offsetParent : editorEl;
    const boundsWidth = parent instanceof HTMLElement ? parent.clientWidth : rect.width;
    const boundsHeight = parent instanceof HTMLElement ? parent.clientHeight : rect.height;
    const rawLeft = e.clientX - rect.left - legendDrag.dx;
    const rawTop = e.clientY - rect.top - legendDrag.dy;
    const clampedLeft = Math.max(0, Math.min(boundsWidth - legendEl.offsetWidth, rawLeft));
    const clampedTop = Math.max(0, Math.min(boundsHeight - legendEl.offsetHeight, rawTop));
    legendEl.style.left = `${clampedLeft}px`;
    legendEl.style.top = `${clampedTop}px`;
    if (!legendDrag.moved) {
      const deltaX = Math.abs(e.clientX - legendDrag.startX);
      const deltaY = Math.abs(e.clientY - legendDrag.startY);
      if (deltaX > 2 || deltaY > 2) legendDrag.moved = true;
    }
  });
  document.addEventListener('mouseup', () => {
    if (legendDrag?.moved) legendUserMoved = true;
    legendDrag = null;
    stopMiddlePan();
  });

  // Reuse the diagram element fetched earlier in this function.
  // Avoid redeclaring the `svg` constant to prevent "Identifier has already been declared" errors.
  const menu = document.getElementById('context-menu');
    svg.addEventListener('mousedown', e => {
      cancelPendingClickSelection();
      marqueeSelectionMade = false;
      pointerDownComponentId = null;
      if (e.button === 1) {
        if (editorEl) {
          e.preventDefault();
          startMiddlePan(e, editorEl);
        }
        return;
      }
      const coords = toDiagramCoords(e);
      const pointerX = coords.x;
      const pointerY = coords.y;
      if (connectMode && e.target.classList.contains('port')) {
        const comp = components.find(c => c.id === e.target.dataset.id);
        const port = Number(e.target.dataset.port);
        if (comp) {
          pointerDownComponentId = comp.id;
          connectSource = { component: comp, port };
          const start = portPosition(comp, port);
          tempConnection = document.createElementNS(svgNS, 'line');
          tempConnection.setAttribute('x1', start.x);
          tempConnection.setAttribute('y1', start.y);
          tempConnection.setAttribute('x2', start.x);
          tempConnection.setAttribute('y2', start.y);
          tempConnection.classList.add('connection');
          tempConnection.classList.add('temp');
          svg.appendChild(tempConnection);
        }
        return;
      }
      if (e.target.classList.contains('annotation-handle')) {
        const comp = components.find(c => c.id === e.target.dataset.id);
        if (comp) {
          pointerDownComponentId = comp.id;
          resizingAnnotation = {
            comp,
            startX: pointerX,
            startY: pointerY,
            startWidth: comp.width || compWidth,
            startHeight: comp.height || compHeight,
            changed: false
          };
        }
        return;
      }
      if (e.target.classList.contains('bus-handle')) {
        const comp = components.find(c => c.id === e.target.dataset.id);
        if (comp) {
          pointerDownComponentId = comp.id;
          resizingBus = {
            comp,
            startX: pointerX,
            startWidth: comp.width,
            startCompX: comp.x,
            side: e.target.dataset.side || 'right',
            anchors: captureBusAnchors(comp)
          };
        }
        return;
      }
      const g = e.target.closest('.component');
      if (!g) {
        dragOffset = null;
        marquee = {
          active: true,
          x1: pointerX,
          y1: pointerY,
          x2: pointerX,
          y2: pointerY
        };
        return;
      }
      pointerDownComponentId = g.dataset.id || null;
      const comp = components.find(c => c.id === g.dataset.id);
      if (!comp) return;
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        if (selection.includes(comp)) {
          selection = selection.filter(c => c !== comp);
        } else {
          selection.push(comp);
        }
      } else if (!selection.includes(comp)) {
        selection = [comp];
      }
      selected = comp;
      dragOffset = selection.map(c => ({
        comp: c,
        dx: pointerX - c.x,
        dy: pointerY - c.y,
        startX: c.x,
        startY: c.y
      }));
      dragging = false;
      render();
    });
    svg.addEventListener('mousemove', e => {
      if (middlePanState) return;
      if (draggingLabel) return;
      const coords = toDiagramCoords(e);
      const pointerX = coords.x;
      const pointerY = coords.y;
      cursorPos = { x: pointerX, y: pointerY };
      if (resizingAnnotation) {
        const data = resizingAnnotation;
        const comp = data.comp;
        if (comp) {
          let newW = Math.max(40, data.startWidth + (pointerX - data.startX));
          let newH = Math.max(20, data.startHeight + (pointerY - data.startY));
          if (gridEnabled) {
            newW = Math.max(40, Math.round(newW / gridSize) * gridSize);
            newH = Math.max(20, Math.round(newH / gridSize) * gridSize);
          }
          if (comp.width !== newW || comp.height !== newH) {
            comp.width = newW;
            comp.height = newH;
            data.changed = true;
            render();
          }
        }
        return;
      }
      if (marquee && marquee.active) {
        marquee.x2 = pointerX;
        marquee.y2 = pointerY;
        render();
        return;
      }
      if (draggingConnection) {
        const { component, index, start, mid } = draggingConnection;
        const conn = component.connections[index];
        if (conn) {
          if (conn.dir === 'h') {
            conn.mid = mid + (pointerX - start.x);
          } else {
            conn.mid = mid + (pointerY - start.y);
          }
          render();
        }
        return;
      }
      if (resizingBus) {
        let delta = pointerX - resizingBus.startX;
        if (resizingBus.side === 'right') {
          let newW = Math.max(40, resizingBus.startWidth + delta);
          if (gridEnabled) newW = Math.round(newW / gridSize) * gridSize;
          resizingBus.comp.width = newW;
        } else {
          let newW = Math.max(40, resizingBus.startWidth - delta);
          let newX = resizingBus.startCompX + delta;
          if (gridEnabled) {
            newW = Math.round(newW / gridSize) * gridSize;
            newX = Math.round(newX / gridSize) * gridSize;
          }
          if (newW === 40 && delta > resizingBus.startWidth - 40) {
            newX = resizingBus.startCompX + (resizingBus.startWidth - 40);
          }
          resizingBus.comp.width = newW;
          resizingBus.comp.x = newX;
        }
        updateBusPorts(resizingBus.comp);
        reassignBusAnchors(resizingBus.comp, resizingBus.anchors);
        render();
        return;
      }
      if (connectSource && tempConnection) {
        const nearest = nearestPortToPoint(pointerX, pointerY, connectSource);
        let end = { x: pointerX, y: pointerY };
        hoverPort = null;
        if (nearest) {
          hoverPort = { component: nearest.component, port: nearest.port };
          end = nearest.pos;
        }
        tempConnection.setAttribute('x2', end.x);
        tempConnection.setAttribute('y2', end.y);
      }
    });
  svg.addEventListener('mousemove', e => {
    if (middlePanState) return;
    const coords = toDiagramCoords(e);
    const pointerX = coords.x;
    const pointerY = coords.y;
    if (draggingLabel) {
      let x = pointerX - draggingLabel.dx;
      let y = pointerY - draggingLabel.dy;
      if (gridEnabled) {
        x = Math.round(x / gridSize) * gridSize;
        y = Math.round(y / gridSize) * gridSize;
      }
      const comp = draggingLabel.component;
      const base = defaultLabelAnchor(comp);
      const newOffset = {
        x: Number((x - base.x).toFixed(2)),
        y: Number((y - base.y).toFixed(2))
      };
      const current = comp.labelOffset || { x: 0, y: 0 };
      if (newOffset.x !== current.x || newOffset.y !== current.y) {
        comp.labelOffset = newOffset;
        draggingLabel.moved = true;
        render();
      }
      return;
    }
    if (resizingAnnotation) return;
    if (marquee && marquee.active) return;
    if (resizingBus || draggingConnection) return;
    if (!dragOffset || !dragOffset.length) return;
    let snapPos = null;
    let moved = false;
    dragOffset.forEach(off => {
      const rawX = pointerX - off.dx;
      const rawY = pointerY - off.dy;
      let x = rawX;
      let y = rawY;
      if (gridEnabled) {
        const snappedX = Math.round(x / gridSize) * gridSize;
        const snappedY = Math.round(y / gridSize) * gridSize;
        if (snappedX !== x || snappedY !== y) {
          snapPos = { x: snappedX, y: snappedY };
        }
        x = snappedX;
        y = snappedY;
      }
      const deltaX = Math.abs(rawX - off.startX);
      const deltaY = Math.abs(rawY - off.startY);
      const shouldMove = dragging || deltaX >= DRAG_MOVE_THRESHOLD || deltaY >= DRAG_MOVE_THRESHOLD;
      if (!shouldMove) return;
      if (!dragging) dragging = true;
      if (off.comp.x !== x || off.comp.y !== y) {
        off.comp.x = x;
        off.comp.y = y;
        moved = true;
      }
    });
    if (moved) {
      render();
      if (snapPos) flashSnapIndicator(snapPos.x, snapPos.y);
    }
  });
    svg.addEventListener('mouseup', async e => {
      if (e.button === 1 && middlePanState) {
        stopMiddlePan();
        pointerDownComponentId = null;
        lastPointerUp = { id: null, time: 0 };
        return;
      }
      if (draggingLabel) {
        const moved = draggingLabel.moved;
        draggingLabel = null;
        if (moved) {
          pushHistory();
          render();
          save();
        }
        lastPointerUp = { id: null, time: 0 };
        return;
      }
      if (resizingAnnotation) {
        lastPointerUp = { id: null, time: 0 };
        return;
      }
      if (resizingBus) {
        resizingBus = null;
        pushHistory();
        render();
        save();
        lastPointerUp = { id: null, time: 0 };
        return;
      }
      if (draggingConnection) {
        draggingConnection = null;
        pushHistory();
        render();
        save();
        lastPointerUp = { id: null, time: 0 };
        return;
      }
      if (marquee && marquee.active) {
        const changed = finalizeMarqueeSelection();
        marqueeSelectionMade = changed;
        render();
        lastPointerUp = { id: null, time: 0 };
        return;
      }
      if (connectSource && tempConnection) {
        tempConnection.remove();
        tempConnection = null;
        if (hoverPort && hoverPort.component !== connectSource.component) {
          const fromComp = connectSource.component;
          const toComp = hoverPort.component;
          const fromPort = connectSource.port;
          const toPort = hoverPort.port;
          const created = ensureConnection(fromComp, toComp, fromPort, toPort);
          if (created) {
            pushHistory();
            render();
            save();
          }
        }
        connectSource = null;
        hoverPort = null;
        connectMode = false;
        connectBtn?.classList.remove('active');
        render();
        lastPointerUp = { id: null, time: 0 };
        return;
      }
      let movedDuringDrag = false;
      if (dragOffset && dragOffset.length) {
        if (dragging) {
          const moved = dragOffset.map(off => off.comp);
          const exclude = new Set(moved);
          moved.forEach(comp => {
            autoAttachComponent(comp, exclude);
          });
          pushHistory();
          render();
          save();
          movedDuringDrag = true;
        }
        dragOffset = null;
        dragging = false;
      } else {
        dragOffset = null;
      }
      if (movedDuringDrag) {
        lastPointerUp = { id: null, time: 0 };
        return;
      }
      if (e.button !== 0) {
        lastPointerUp = { id: null, time: 0 };
        return;
      }
      const targetComponent = e.target instanceof Element ? e.target.closest('.component') : null;
      const compId = targetComponent?.dataset.id || pointerDownComponentId || null;
      if (!compId) {
        lastPointerUp = { id: null, time: 0 };
        return;
      }
      const now = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
      if (lastPointerUp.id === compId && (now - lastPointerUp.time) <= DOUBLE_CLICK_THRESHOLD_MS) {
        lastPointerUp = { id: null, time: 0 };
        const comp = components.find(c => c.id === compId);
        if (comp) {
          cancelPendingClickSelection();
          lastComponentClick = { id: null, time: 0 };
          selectComponent(comp);
        }
        return;
      }
      lastPointerUp = { id: compId, time: now };
    });
  svg.addEventListener('click', e => {
    if (marqueeSelectionMade) {
      marqueeSelectionMade = false;
      pointerDownComponentId = null;
      return;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      cancelPendingClickSelection();
      lastComponentClick = { id: null, time: 0 };
      pointerDownComponentId = null;
      return;
    }
    const compEl = e.target.closest('.component');
    let compId = compEl?.dataset.id || pointerDownComponentId || null;
    const clickedOutside = !compId;
    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
    cancelPendingClickSelection();
    pointerDownComponentId = null;
    if (compId && lastComponentClick.id === compId && (now - lastComponentClick.time) <= DOUBLE_CLICK_THRESHOLD_MS) {
      lastComponentClick = { id: null, time: 0 };
      const comp = components.find(c => c.id === compId);
      if (comp) {
        selectComponent(comp);
      }
      return;
    }
    lastComponentClick = { id: compId, time: now };
    if (e.detail > 1) return;
    clickSelectTimer = window.setTimeout(() => {
      clickSelectTimer = null;
      if (clickedOutside) {
        selection = [];
        selected = null;
        selectedConnection = null;
        render();
        return;
      }
      const comp = components.find(c => c.id === compId);
      if (!comp) return;
      selection = [comp];
      selected = comp;
      selectedConnection = null;
      render();
    }, SINGLE_CLICK_DELAY_MS);
  });

  svg.addEventListener('dblclick', e => {
    const targetComponent = e.target instanceof Element ? e.target.closest('g.component') : null;
    const compId = targetComponent?.dataset.id || pointerDownComponentId || null;
    pointerDownComponentId = null;
    if (!compId) return;
    const comp = components.find(c => c.id === compId);
    if (!comp) return;
    e.stopPropagation();
    cancelPendingClickSelection();
    lastComponentClick = { id: null, time: 0 };
    selectComponent(comp);
  });

  svg.addEventListener('contextmenu', e => {
    e.preventDefault();
    closePaletteContextMenu();
    const connEl = e.target.closest('.connection');
    if (connEl) {
      const comp = components.find(c => c.id === connEl.dataset.comp);
      contextTarget = { component: comp, index: parseInt(connEl.dataset.index, 10), connection: true };
    } else {
      const g = e.target.closest('.component');
      contextTarget = g ? components.find(c => c.id === g.dataset.id) : null;
    }
    const compItems = menu.querySelectorAll('[data-context="component"]');
    const connItems = menu.querySelectorAll('[data-context="connection"]');
    const canvasItems = menu.querySelectorAll('[data-context="canvas"]');
    compItems.forEach(li => li.style.display = contextTarget && !contextTarget.connection ? 'block' : 'none');
    connItems.forEach(li => li.style.display = contextTarget && contextTarget.connection ? 'block' : 'none');
    canvasItems.forEach(li => li.style.display = contextTarget ? 'none' : 'block');
    const rect = editorEl?.getBoundingClientRect();
    if (rect) {
      menu.style.left = `${e.clientX - rect.left}px`;
      menu.style.top = `${e.clientY - rect.top}px`;
    } else {
      menu.style.left = `${e.pageX}px`;
      menu.style.top = `${e.pageY}px`;
    }
    menu.style.display = 'block';
  });

  menu.addEventListener('click', async e => {
    const action = e.target.dataset.action;
    if (!action) return;
    e.stopPropagation();
    if (contextTarget && contextTarget.connection) {
      const { component, index } = contextTarget;
      const conn = component.connections[index];
      if (action === 'edit') {
        const target = components.find(t => t.id === conn.target);
        const cableComp = component.type === 'cable' ? component : target?.type === 'cable' ? target : null;
        if (cableComp) {
          await editCableComponent(cableComp);
        } else {
          showToast('No cable component on this connection');
        }
      } else if (action === 'delete') {
        component.connections.splice(index, 1);
        selectedConnection = null;
        pushHistory();
        render();
        save();
      }
      menu.style.display = 'none';
      return;
    }
    if (action === 'edit' && contextTarget) {
      selectComponent(contextTarget.id);
    } else if (action === 'rename' && contextTarget) {
      const current = contextTarget.label || '';
      const next = prompt('Component label', current);
      if (next !== null) {
        const trimmed = next.trim();
        if (!trimmed) {
          showToast('Label cannot be empty');
        } else if (trimmed !== current) {
          contextTarget.label = trimmed;
          pushHistory();
          render();
          save();
        }
      }
    } else if (action === 'delete' && contextTarget) {
      components = components.filter(c => c !== contextTarget);
      components.forEach(c => {
        c.connections = (c.connections || []).filter(conn => conn.target !== contextTarget.id);
      });
      selection = [];
      selected = null;
      selectedConnection = null;
      pushHistory();
      render();
      save();
      const modal = ensurePropModal();
      if (modal) modal.classList.remove('show');
    } else if (action === 'duplicate' && contextTarget) {
      const copy = {
        ...JSON.parse(JSON.stringify(contextTarget)),
        id: 'n' + Date.now(),
        x: contextTarget.x + gridSize,
        y: contextTarget.y + gridSize,
        connections: []
      };
      applyNextLabel(copy);
      components.push(copy);
      selection = [copy];
      selected = copy;
      pushHistory();
      render();
      save();
    } else if (action === 'rotate' && contextTarget) {
      contextTarget.rotation = ((contextTarget.rotation || 0) + 90) % 360;
      pushHistory();
      render();
      save();
    } else if (action === 'paste') {
      if (clipboard.length) {
        const base = Date.now();
        const idMap = {};
        const newComps = clipboard.map((c, idx) => {
          const newId = 'n' + (base + idx);
          idMap[c.id] = newId;
          const clone = {
            ...JSON.parse(JSON.stringify(c)),
            id: newId,
            x: c.x + gridSize,
            y: c.y + gridSize,
            connections: (c.connections || []).map(conn => ({ ...conn }))
          };
          applyNextLabel(clone);
          return clone;
        });
        newComps.forEach(c => {
          c.connections = (c.connections || [])
            .filter(conn => idMap[conn.target])
            .map(conn => ({ ...conn, target: idMap[conn.target] }));
        });
        components.push(...newComps);
        selection = newComps;
        selected = newComps[0] || null;
        pushHistory();
        render();
        save();
      }
    }
    menu.style.display = 'none';
  });

  document.addEventListener('click', e => {
    if (!menu.contains(e.target)) {
      menu.style.display = 'none';
    }
    if (paletteContextMenu && paletteContextMenu.style.display === 'block' && !paletteContextMenu.contains(e.target)) {
      closePaletteContextMenu();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      menu.style.display = 'none';
      closePaletteContextMenu();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Delete') return;
    const target = e.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))) {
      return;
    }
    if (selectedConnection) {
      const { component, index } = selectedConnection;
      component.connections.splice(index, 1);
      selectedConnection = null;
      pushHistory();
      render();
      save();
      if (selected) selectComponent(selected);
      return;
    }
    if (selection.length) {
      const ids = new Set(selection.map(c => c.id));
      components = components.filter(c => !ids.has(c.id));
      components.forEach(c => {
        c.connections = (c.connections || []).filter(conn => !ids.has(conn.target));
      });
      selection = [];
      selected = null;
      selectedConnection = null;
      pushHistory();
      render();
      save();
      const modal = ensurePropModal();
      if (modal) modal.classList.remove('show');
    }
  });

  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    const target = e.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))) {
      return;
    }
    const key = e.key.toLowerCase();
    if (mod && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    } else if (mod && key === 'c') {
      e.preventDefault();
      clipboard = selection.map(c => JSON.parse(JSON.stringify(c)));
    } else if (mod && key === 'v') {
      e.preventDefault();
      if (clipboard.length) {
        const base = Date.now();
        const idMap = {};
        const newComps = clipboard.map((c, idx) => {
          const newId = 'n' + (base + idx);
          idMap[c.id] = newId;
          const clone = {
            ...JSON.parse(JSON.stringify(c)),
            id: newId,
            x: c.x + gridSize,
            y: c.y + gridSize,
            connections: (c.connections || []).map(conn => ({ ...conn }))
          };
          applyNextLabel(clone);
          return clone;
        });
        newComps.forEach(c => {
          c.connections = (c.connections || [])
            .filter(conn => idMap[conn.target])
            .map(conn => ({ ...conn, target: idMap[conn.target] }));
        });
        components.push(...newComps);
        selection = newComps;
        selected = newComps[0] || null;
        pushHistory();
        render();
        save();
      }
    } else if (!mod && key === 'r') {
      e.preventDefault();
      const targets = selection.length ? selection : selected ? [selected] : [];
      if (targets.length) {
        if (e.shiftKey) {
          targets.forEach(c => { c.flipped = !c.flipped; });
        } else {
          targets.forEach(c => { c.rotation = ((c.rotation || 0) + 90) % 360; });
        }
        pushHistory();
        render();
        save();
      }
    }
  });

  if (paletteContextMenu) {
    paletteContextMenu.addEventListener('click', e => {
      const item = e.target.closest('li[data-action]');
      if (!item) return;
      e.preventDefault();
      e.stopPropagation();
      if (item.dataset.action === 'edit' && paletteContextTarget?.meta) {
        navigateToCustomComponentEditor(paletteContextTarget.meta);
      }
      closePaletteContextMenu();
    });
    paletteContextMenu.addEventListener('contextmenu', e => {
      e.preventDefault();
    });
  }
  window.addEventListener('resize', closePaletteContextMenu);
  document.addEventListener('scroll', closePaletteContextMenu, true);

  const tourBtn = document.getElementById('tour-btn');
  if (tourBtn) tourBtn.addEventListener('click', () => {
    startTour();
    localStorage.setItem('onelineTourDone', 'true');
  });
  if (!localStorage.getItem('onelineTourDone')) {
    startTour();
    localStorage.setItem('onelineTourDone', 'true');
  }

  const params = new URLSearchParams(window.location.search);
  const focus = params.get('component');
  if (focus) {
    const comp = components.find(c => c.id === focus);
    if (comp) selectComponent(comp);
  }

  initSettings();
  initDarkMode();
  initCompactMode();
  initNavToggle();
}

function getCategory(c) {
  return c.type || subtypeCategory[c.subtype];
}

function buildCableSpecFromComponent(comp, allComps) {
  if (!comp || comp.type !== 'cable') return null;
  const cable = comp.cable || {};
  const upstream = findSourceComponent(comp.id, allComps);
  const outbound = (comp.connections || []).find(conn => conn.target);
  const target = outbound ? allComps.find(c => c.id === outbound.target) : null;
  const spec = { ...cable };
  if (hasImpedance(cable)) spec.impedance = { ...cable.impedance };
  if (!spec.tag) spec.tag = comp.label || comp.id;
  spec.from_tag = upstream?.ref || upstream?.id || '';
  spec.to_tag = target?.ref || outbound?.target || '';
  const phases = outbound?.phases && outbound.phases.length
    ? (Array.isArray(outbound.phases) ? outbound.phases : parseCablePhases({ phases: outbound.phases }))
    : parseCablePhases(cable);
  spec.phases = phases.join(',') || cable.phases || '';
  spec.conductors = outbound?.conductors || cable.conductors || '';
  const unitPerPx = diagramScale.unitPerPx || 1;
  const autoLen = (outbound?.length || 0) * unitPerPx;
  let finalLen = autoLen;
  if (cable.manual_length) {
    const manual = parseFloat(cable.length);
    if (!Number.isNaN(manual)) finalLen = manual;
  }
  if (finalLen) {
    spec.length = finalLen.toFixed(2);
  }
  if (cable.manual_length) spec.manual_length = true;
  const load = {
    current: parseFloat(target?.current) || 0,
    voltage: parseFloat(target?.voltage) || parseFloat(upstream?.voltage) || 0,
    phases: phases.length || parseInt(target?.phases || upstream?.phases || 3, 10)
  };
  const params = {
    length: finalLen,
    material: spec.conductor_material || 'cu',
    insulation_rating: parseFloat(target?.insulation_rating) || 90,
    ambient: parseFloat(spec.ambient_temp) || parseFloat(upstream?.ambient) || 30,
    conductors: parseInt(spec.conductors) || 1,
    maxVoltageDrop: parseFloat(target?.maxVoltageDrop) || 3,
    code: target?.code || 'NEC'
  };
  const result = sizeConductor(load, params);
  spec.calc_ampacity = result.ampacity ? result.ampacity.toFixed(2) : spec.calc_ampacity || '';
  spec.voltage_drop_pct = result.voltageDrop ? result.voltageDrop.toFixed(2) : spec.voltage_drop_pct || '';
  spec.sizing_warning = result.violation || spec.sizing_warning || '';
  spec.code_reference = result.codeRef || spec.code_reference || '';
  spec.sizing_report = JSON.stringify(result.report || {});
  comp.cable = {
    ...comp.cable,
    calc_ampacity: spec.calc_ampacity,
    voltage_drop_pct: spec.voltage_drop_pct,
    sizing_warning: spec.sizing_warning,
    code_reference: spec.code_reference,
    sizing_report: spec.sizing_report,
    length: spec.length,
    manual_length: spec.manual_length
  };
  return spec;
}

function showToast(msg, linkText, linkHref) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  if (linkText && linkHref) {
    const a = document.createElement('a');
    a.href = linkHref;
    a.textContent = linkText;
    a.target = '_blank';
    t.append(' ', a);
  }
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function validateDiagram() {
  validationIssues = [];
  const svg = document.getElementById('diagram');
  if (!svg) return validationIssues;
  // reset any previous markers
  svg.querySelectorAll('g.component').forEach(g => {
    g.classList.remove('invalid');
    g.querySelectorAll('.issue-badge').forEach(b => b.remove());
    const comp = components.find(c => c.id === g.dataset.id);
    if (!comp) return;
    const tip = [];
    if (comp.label) tip.push(`Label: ${comp.label}`);
    if (comp.voltage) tip.push(`Voltage: ${comp.voltage}`);
    if (comp.rating) tip.push(`Rating: ${comp.rating}`);
    g.setAttribute('data-tooltip', tip.join('\n'));
  });

  const idMap = new Map();
  const inbound = new Map();
  components.forEach(c => {
    if (c.type === 'dimension') return;
    idMap.set(c.id, (idMap.get(c.id) || 0) + 1);
    inbound.set(c.id, 0);
  });

  function phaseSet(val) {
    if (Array.isArray(val)) return val.map(p => String(p).toUpperCase());
    if (typeof val === 'number') {
      if (val === 3) return ['A', 'B', 'C'];
      if (val === 2) return ['A', 'B'];
      if (val === 1) return ['A'];
      return [];
    }
    if (typeof val === 'string') {
      if (/^\d+$/.test(val.trim())) return phaseSet(parseInt(val, 10));
      return val
        .split(/[\s,]+/)
        .map(p => p.trim().toUpperCase())
        .filter(Boolean);
    }
    return [];
  }

  components.forEach(c => {
    if (c.type === 'dimension') return;
    (c.connections || []).forEach(conn => {
      inbound.set(conn.target, (inbound.get(conn.target) || 0) + 1);
      const target = components.find(t => t.id === conn.target);
      if (target && c.voltage && target.voltage && c.voltage !== target.voltage) {
        validationIssues.push({
          component: c.id,
          message: `Voltage mismatch with ${target.label || target.subtype || target.id}`
        });
        validationIssues.push({
          component: target.id,
          message: `Voltage mismatch with ${c.label || c.subtype || c.id}`
        });
      }
      if (target) {
        const srcPh = phaseSet(c.phases);
        const tgtPh = phaseSet(target.phases);
        const connPh = conn.phases ? phaseSet(conn.phases) : null;
        if (connPh && connPh.length) {
          if (srcPh.length && !connPh.every(p => srcPh.includes(p))) {
            validationIssues.push({
              component: c.id,
              message: `Phase mismatch with ${target.label || target.subtype || target.id}`
            });
          }
          if (tgtPh.length && !connPh.every(p => tgtPh.includes(p))) {
            validationIssues.push({
              component: target.id,
              message: `Phase mismatch with ${c.label || c.subtype || c.id}`
            });
          }
        } else if (srcPh.length && tgtPh.length && !tgtPh.every(p => srcPh.includes(p))) {
          validationIssues.push({
            component: c.id,
            message: `Phase mismatch with ${target.label || target.subtype || target.id}`
          });
          validationIssues.push({
            component: target.id,
            message: `Phase mismatch with ${c.label || c.subtype || c.id}`
          });
        }
      }
    });
  });

  components.forEach(c => {
    if (c.type === 'dimension' || c.type === 'annotation') return;
    if ((c.connections || []).length + (inbound.get(c.id) || 0) === 0) {
      validationIssues.push({ component: c.id, message: 'Unconnected component' });
    }
  });

  components.forEach(c => {
    if (c.type === 'dimension') return;
    (c.connections || []).forEach(conn => {
      const target = components.find(t => t.id === conn.target);
      const cableInfo = getCableForConnection(c, target, conn);
      if (cableInfo && cableInfo.sizing_warning) {
        validationIssues.push({ component: c.id, message: cableInfo.sizing_warning });
      }
    });
  });

  idMap.forEach((count, id) => {
    if (count > 1) {
      components.filter(c => c.id === id).forEach(c => {
        validationIssues.push({ component: c.id, message: `Duplicate ID "${id}"` });
      });
    }
  });

  // Run additional validation rules
  validationIssues.push(...runValidation(components, getStudies()));

  const byComp = {};
  validationIssues.forEach(issue => {
    if (!byComp[issue.component]) byComp[issue.component] = [];
    byComp[issue.component].push(issue.message);
  });

  Object.entries(byComp).forEach(([id, msgs]) => {
    const g = svg.querySelector(`g.component[data-id="${id}"]`);
    if (!g) return;
    g.classList.add('invalid');
    const existing = g.getAttribute('data-tooltip');
    const tip = existing ? existing + '\n' + msgs.join('\n') : msgs.join('\n');
    g.setAttribute('data-tooltip', tip);
    const badge = document.createElementNS(svgNS, 'g');
    badge.setAttribute('class', 'issue-badge');
    const comp = components.find(c => c.id === id) || {};
    const w = comp.width || compWidth;
    const x0 = comp.x || 0;
    const y0 = comp.y || 0;
    const circ = document.createElementNS(svgNS, 'circle');
    circ.setAttribute('cx', x0 + w - 8);
    circ.setAttribute('cy', y0 + 8);
    circ.setAttribute('r', 8);
    circ.setAttribute('fill', '#c00');
    const txt = document.createElementNS(svgNS, 'text');
    txt.setAttribute('x', x0 + w - 8);
    txt.setAttribute('y', y0 + 11);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('font-size', '12');
    txt.setAttribute('fill', '#fff');
    txt.textContent = '!';
    badge.appendChild(circ);
    badge.appendChild(txt);
    g.appendChild(badge);
  });

  lintList.innerHTML = '';
  if (validationIssues.length) {
    validationIssues.forEach(issue => {
      const li = document.createElement('li');
      li.textContent = issue.message;
      li.addEventListener('click', () => focusComponent(issue.component));
      lintList.appendChild(li);
    });
    lintPanel.classList.remove('hidden');
  } else {
    lintPanel.classList.add('hidden');
  }

  showToast(validationIssues.length ? `Validation found ${validationIssues.length} issue${validationIssues.length === 1 ? '' : 's'}` : 'Diagram valid');
  return validationIssues;
}

function focusComponent(id) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  selection = [comp];
  selected = comp;
  selectedConnection = null;
  render();
  const svg = document.getElementById('diagram');
  const g = svg.querySelector(`g.component[data-id="${id}"]`);
  if (g && g.scrollIntoView) g.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
}

function updateComponent(id, fields = {}) {
  const comp = components.find(c => c.id === id || c.ref === id);
  if (!comp) return;
  const mapping = { description: 'label', id: 'ref', subCategory: 'subtype' };
  Object.entries(fields).forEach(([k, v]) => {
    if (k === 'ref') return;
    const prop = mapping[k] || k;
    if (prop === 'id') return;
    comp[prop] = v;
  });
  render();
  save(false);
}

function syncSchedules(notify = true) {
  const all = sheets.flatMap(s => s.components);
  const findPanelId = id => {
    const visited = new Set();
    let currentId = id;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const upstream = all.find(item => (item.connections || []).some(conn => conn.target === currentId));
      if (!upstream) return null;
      if (getCategory(upstream) === 'panel') return upstream.ref || upstream.id;
      currentId = upstream.id;
    }
    return null;
  };
  const mapFields = c => {
    const src = all.find(s => (s.connections || []).some(conn => conn.target === c.id));
    const conn = src ? (src.connections || []).find(cc => cc.target === c.id) : null;
    const inboundCable = src && src.type === 'cable'
      ? src
      : all.find(item => item.type === 'cable' && (item.connections || []).some(cc => cc.target === c.id));
    const cableInfo = inboundCable?.cable || null;
    const connPhases = conn?.phases
      ? conn.phases.join(',')
      : cableInfo
      ? (Array.isArray(cableInfo.phases) ? cableInfo.phases.join(',') : cableInfo.phases || '')
      : c.phases ?? '';
    const connConductors = conn?.conductors || cableInfo?.conductors || conn?.cable?.conductors || '';
    const fields = {
      id: c.ref || c.id,
      ref: c.id,
      description: c.label,
      voltage: c.voltage ?? '',
      manufacturer: c.manufacturer ?? '',
      model: c.model ?? '',
      voltage_class: c.voltage_class ?? '',
      enclosure: c.enclosure ?? '',
      thermal_rating: c.thermal_rating ?? '',
      phases: connPhases,
      conductors: connConductors,
      notes: c.notes ?? '',
      rating: c.rating ?? '',
      impedance_r: c.impedance?.r ?? '',
      impedance_x: c.impedance?.x ?? '',
      voltage_mag: typeof c.voltage_mag === 'number' ? c.voltage_mag : '',
      voltage_angle: typeof c.voltage_angle === 'number' ? c.voltage_angle : '',
      voltage_mag_a: c.voltage_mag?.A ?? c.voltage_mag?.a ?? '',
      voltage_mag_b: c.voltage_mag?.B ?? c.voltage_mag?.b ?? '',
      voltage_mag_c: c.voltage_mag?.C ?? c.voltage_mag?.c ?? '',
      voltage_angle_a: c.voltage_angle?.A ?? c.voltage_angle?.a ?? '',
      voltage_angle_b: c.voltage_angle?.B ?? c.voltage_angle?.b ?? '',
      voltage_angle_c: c.voltage_angle?.C ?? c.voltage_angle?.c ?? '',
      category: getCategory(c),
      subCategory: c.subtype ?? '',
      x: c.x ?? '',
      y: c.y ?? '',
      z: c.z ?? ''
    };
    (propSchemas[c.subtype] || []).forEach(f => {
      fields[f.name] = c[f.name] ?? f.default ?? fields[f.name] ?? '';
    });
    return fields;
  };
  const equipment = all
    .filter(c => getCategory(c) === 'equipment')
    .map(mapFields);
  const panels = all
    .filter(c => getCategory(c) === 'panel')
    .map(mapFields);
  const loads = all
    .filter(c => getCategory(c) === 'load')
    .map(c => {
      const fields = mapFields(c);
      const panelId = findPanelId(c.id);
      if (panelId) fields.panelId = panelId;
      return fields;
    });
  const buses = all
    .filter(c => isBusComponent(c))
    .map(mapFields);
  setEquipment([...equipment, ...buses]);
  setPanels([...panels, ...buses]);
  setLoads(loads);
  const cableSpecs = [];
  const seenTags = new Set();
  all
    .filter(c => c.type === 'cable')
    .forEach(cableComp => {
      const spec = buildCableSpecFromComponent(cableComp, all);
      if (!spec) return;
      if (spec.tag) seenTags.add(spec.tag);
      cableSpecs.push(spec);
    });
  all.forEach(c => {
    (c.connections || []).forEach(conn => {
      if (!conn.cable) return;
      if (conn.cable.tag && seenTags.has(conn.cable.tag)) return;
      const target = all.find(t => t.id === conn.target);
      const spec = {
        ...conn.cable,
        phases: conn.phases ? conn.phases.join(',') : conn.cable.phases,
        conductors: conn.conductors || conn.cable.conductors,
        from_tag: c.ref || c.id,
        to_tag: target?.ref || conn.target
      };
      const impedanceSource = conn.impedance || conn.cable?.impedance;
      if (impedanceSource && typeof impedanceSource === 'object') {
        spec.impedance = { ...impedanceSource };
      }
      cableSpecs.push(spec);
    });
  });
  setCables(cableSpecs);
  if (notify) showToast('Schedules synced');
}

function serializeState() {
  save(false);
  function extractSchedules(comps) {
    const mapFields = c => {
      const src = comps.find(s => (s.connections || []).some(conn => conn.target === c.id));
      const conn = src ? (src.connections || []).find(cc => cc.target === c.id) : null;
      const inboundCable = src && src.type === 'cable'
        ? src
        : comps.find(item => item.type === 'cable' && (item.connections || []).some(cc => cc.target === c.id));
      const cableInfo = inboundCable?.cable || null;
      const connPhases = conn?.phases
        ? conn.phases.join(',')
        : cableInfo
        ? (Array.isArray(cableInfo.phases) ? cableInfo.phases.join(',') : cableInfo.phases || '')
        : c.phases ?? '';
      const connConductors = conn?.conductors || cableInfo?.conductors || conn?.cable?.conductors || '';
      const fields = {
        id: c.ref || c.id,
        ref: c.id,
        description: c.label,
        manufacturer: c.manufacturer ?? '',
        model: c.model ?? '',
        phases: connPhases,
        conductors: connConductors,
        notes: c.notes ?? '',
        voltage: c.voltage ?? '',
        voltage_mag: typeof c.voltage_mag === 'number' ? c.voltage_mag : '',
        voltage_angle: typeof c.voltage_angle === 'number' ? c.voltage_angle : '',
        voltage_mag_a: c.voltage_mag?.A ?? c.voltage_mag?.a ?? '',
        voltage_mag_b: c.voltage_mag?.B ?? c.voltage_mag?.b ?? '',
        voltage_mag_c: c.voltage_mag?.C ?? c.voltage_mag?.c ?? '',
        voltage_angle_a: c.voltage_angle?.A ?? c.voltage_angle?.a ?? '',
        voltage_angle_b: c.voltage_angle?.B ?? c.voltage_angle?.b ?? '',
        voltage_angle_c: c.voltage_angle?.C ?? c.voltage_angle?.c ?? '',
        category: getCategory(c),
        subCategory: c.subtype ?? '',
        x: c.x ?? '',
        y: c.y ?? '',
        z: c.z ?? ''
      };
      (propSchemas[c.subtype] || []).forEach(f => {
        fields[f.name] = c[f.name] ?? fields[f.name] ?? '';
      });
      return fields;
    };
    const equipment = comps
      .filter(c => getCategory(c) === 'equipment')
      .map(mapFields);
    const panels = comps
      .filter(c => getCategory(c) === 'panel')
      .map(mapFields);
    const loads = comps
      .filter(c => getCategory(c) === 'load')
      .map(mapFields);
    const buses = comps
      .filter(c => isBusComponent(c))
      .map(mapFields);
    const cables = [];
    const seenTags = new Set();
    comps
      .filter(c => c.type === 'cable')
      .forEach(cableComp => {
        const spec = buildCableSpecFromComponent(cableComp, comps);
        if (!spec) return;
        if (spec.tag) seenTags.add(spec.tag);
        cables.push(spec);
      });
    comps.forEach(c => {
      (c.connections || []).forEach(conn => {
        if (!conn.cable) return;
        if (conn.cable.tag && seenTags.has(conn.cable.tag)) return;
        const target = comps.find(t => t.id === conn.target);
        const spec = {
          ...conn.cable,
          phases: conn.phases ? conn.phases.join(',') : conn.cable.phases,
          conductors: conn.conductors || conn.cable.conductors,
          from_tag: c.ref || c.id,
          to_tag: target?.ref || conn.target
        };
        const impedanceSource = conn.impedance || conn.cable?.impedance;
        if (impedanceSource && typeof impedanceSource === 'object') {
          spec.impedance = { ...impedanceSource };
        }
        cables.push(spec);
      });
    });
    return { equipment: [...equipment, ...buses], panels: [...panels, ...buses], loads, cables };
  }
  return {
    meta: { scenario: getCurrentScenario() },
    version: DIAGRAM_VERSION,
    templates: templates.map(t => ({ ...t })),
    scale: diagramScale,
    sheets: sheets.map(s => {
      const comps = s.components.map(c => ({
        ...c,
        rotation: c.rotation || 0,
        flipped: !!c.flipped
      }));
      return { name: s.name, components: comps, schedules: extractSchedules(comps) };
    })
  };
}

function exportDiagram() {
  const data = {
    sheets: sheets.map(s => ({
      name: s.name,
      components: s.components.map(c => ({ ...c })),
      connections: (s.connections || []).map(conn => ({ ...conn }))
    }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'oneline.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function sanitizeForExport(value, seen = new WeakSet()) {
  if (value === undefined) return undefined;
  const type = typeof value;
  if (type === 'bigint') {
    const num = Number(value);
    return Number.isSafeInteger(num) ? num : value.toString();
  }
  if (type === 'number') {
    if (Number.isFinite(value)) return value;
    if (Number.isNaN(value)) return 'NaN';
    return value > 0 ? 'Infinity' : '-Infinity';
  }
  if (type === 'boolean' || type === 'string') return value;
  if (type === 'function') return undefined;
  if (value === null) return null;
  if (type !== 'object') return value;
  if (typeof window !== 'undefined' && (value === window || value === window.document)) return undefined;
  if (value && typeof value.nodeType === 'number' && typeof value.nodeName === 'string') return undefined;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Set) return Array.from(value, item => sanitizeForExport(item, seen));
  if (value instanceof Map) {
    const out = {};
    value.forEach((v, k) => {
      const sanitized = sanitizeForExport(v, seen);
      if (sanitized !== undefined) out[String(k)] = sanitized;
    });
    return out;
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value));
  }
  if (Array.isArray(value)) return value.map(item => sanitizeForExport(item, seen));
  const plain = {};
  Object.keys(value).forEach(key => {
    const sanitized = sanitizeForExport(value[key], seen);
    if (sanitized !== undefined) plain[key] = sanitized;
  });
  return plain;
}

function exportOneLineDiagnostics() {
  try {
    const scenario = getCurrentScenario() || 'default';
    const safeScenario = scenario.replace(/[^a-z0-9-_]+/gi, '_') || 'default';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const payload = {
      exportedAt: new Date().toISOString(),
      scenario,
      oneLine: getOneLine(),
      studies: getStudies()
    };
    const sanitized = sanitizeForExport(payload);
    const blob = new Blob([JSON.stringify(sanitized, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `oneline-diagnostics-${safeScenario}-${timestamp}.json`;
    const parent = document.body || document.documentElement;
    if (parent) parent.appendChild(a);
    a.click();
    if (a.parentNode) a.parentNode.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast('One-line diagnostics exported');
  } catch (err) {
    console.error('Failed to export one-line diagnostics', err);
    showToast('Failed to export one-line diagnostics');
  }
}

async function shareDiagram() {
  const tokenPrompt = [
    'Enter a GitHub personal access token with the "gist" scope.',
    'Create one at https://github.com/settings/tokens (classic).',
    'The token is stored locally and used only to publish the shared diagram as a Gist.'
  ].join('\n\n');
  const token = prompt(tokenPrompt, getItem('gistToken', ''));
  if (!token) return;
  setItem('gistToken', token);
  const body = {
    public: true,
    files: {
      'oneline.json': {
        content: JSON.stringify(serializeState(), null, 2)
      }
    }
  };
  try {
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `token ${token}`
      },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      const data = await res.json();
      await navigator.clipboard.writeText(data.html_url);
      showToast('Share link copied to clipboard');
    } else {
      showToast('Failed to share diagram');
    }
  } catch (err) {
    console.error('Share failed', err);
    showToast('Share failed');
  }
}

function serializeDiagram() {
  const svg = document.getElementById('diagram');
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svg);
  if (!source.match(/^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/)) {
    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return source;
}


function migrateDiagram(data) {
  if (Array.isArray(data)) {
    data = { version: 0, templates: [], sheets: [{ name: 'Sheet 1', components: data }] };
  }
  const version = data.version || 0;
  let migrated = data;
  if (version < 1) {
    migrated = {
      version: 1,
      templates: data.templates || [],
      sheets: data.sheets || []
    };
  }
  if (version < 2) {
    migrated.scale = data.scale || { unitPerPx: 1, unit: 'in' };
  }
  migrated.version = DIAGRAM_VERSION;
  return migrated;
}

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await importDiagram(data);
  } catch (err) {
    console.error('Failed to import diagram', err);
  }
  e.target.value = '';
}

async function importDiagram(data) {
  if (data.meta && data.meta.scenario) {
    switchScenario(data.meta.scenario);
  }
  data = migrateDiagram(data);
  diagramScale = data.scale || { unitPerPx: 1, unit: 'in' };
  setItem('diagramScale', diagramScale);
  templates = data.templates || [];
  saveTemplates();
  renderTemplates();
  sheets = (data.sheets || []).map((s, i) => ({
    name: s.name || `Sheet ${i + 1}`,
    components: (s.components || []).map(normalizeComponent),
    connections: Array.isArray(s.connections) ? s.connections : []
  }));
  if (sheets.length) {
    loadSheet(0);
    renderSheetTabs();
    save();
  }
}

async function loadSampleDiagram() {
  try {
    const res = await fetch(asset('examples/sample_oneline.json'));
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    await importDiagram(data);
  } catch (err) {
    console.error('Failed to load sample diagram', err);
    showToast('Failed to load sample diagram');
  }
}

if (typeof window !== 'undefined') {
  window.updateComponent = updateComponent;
  window.loadComponentLibrary = loadComponentLibrary;
  window.loadManufacturerLibrary = loadManufacturerLibrary;
}

async function __oneline_init() {
  suppressResumeIfE2E();

  buildPalette();

  // Load libraries
  try { await loadComponentLibrary(); } catch (e) { console.error('loadComponentLibrary failed:', e); }
  try { await loadManufacturerLibrary(); } catch (e) { console.error('loadManufacturerLibrary failed:', e); }
  try { await loadProtectiveDevices(); } catch (e) { console.error('loadProtectiveDevices failed:', e); }

  await init();

  document.body.dataset.onelineReady = '1';

  e2eOpenDetails();
  setReadyWhen('[data-testid="palette-button"]', 'data-oneline-ready', 'oneline-ready-beacon');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', __oneline_init, { once: true });
} else {
  __oneline_init();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', forceShowResumeIfE2E, { once: true });
} else {
  forceShowResumeIfE2E();
}

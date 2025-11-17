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
import { renderLoadFlowResultsHtml } from './analysis/loadFlowResultsRenderer.js';
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
import { normalizeVoltageToVolts, toBaseKV } from './utils/voltage.js';
import { calculateTransformerImpedance } from './utils/transformerImpedance.js';
import { computeImpedanceFromPerKm } from './utils/cableImpedance.js';
import {
  resolveTransformerKva,
  resolveTransformerPercentZ,
  resolveTransformerXrRatio,
  deriveTransformerBaseKV,
  computeTransformerBaseKV,
  syncTransformerDefaults
} from './utils/transformerProperties.js';
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

const physicalFieldNameSet = new Set([
  'enclosure',
  'enclosure_type',
  'enclosure_rating',
  'electrode_config',
  'electrode_configuration',
  'gap',
  'air_gap',
  'arc_gap',
  'working_distance',
  'clearance',
  'physical_spacing'
]);

const physicalFieldKeywordList = [
  'electrode',
  'enclosure',
  'working distance',
  'working_distance',
  'gap',
  'clearance',
  'spacing',
  'cabinet',
  'housing'
];

const impedanceFieldNameSet = new Set([
  'impedance_r',
  'impedance_x',
  'cable_impedance_r',
  'cable_impedance_x'
]);

function isPhysicalPropertyField(field) {
  if (!field || typeof field !== 'object') return false;
  const rawName = typeof field.name === 'string' ? field.name.toLowerCase() : '';
  const rawLabel = typeof field.label === 'string' ? field.label.toLowerCase() : '';
  if (rawName && physicalFieldNameSet.has(rawName)) return true;
  return physicalFieldKeywordList.some(keyword => {
    const key = keyword.toLowerCase();
    return (rawName && rawName.includes(key)) || (rawLabel && rawLabel.includes(key));
  });
}

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

const minStudiesWidth = 280;
const maxStudiesWidth = 900;
const defaultStudiesWidth = (() => {
  if (typeof window === 'undefined') return 420;
  const approx = Math.round(window.innerWidth * 0.28);
  if (!Number.isFinite(approx)) return 420;
  if (approx < minStudiesWidth) return minStudiesWidth;
  if (approx > maxStudiesWidth) return maxStudiesWidth;
  return approx;
})();

function clampStudiesWidth(value, fallback = defaultStudiesWidth) {
  if (value === null || value === undefined || value === '') {
    return clampStudiesWidth(fallback, defaultStudiesWidth);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return clampStudiesWidth(fallback, defaultStudiesWidth);
  }
  if (numeric < minStudiesWidth) return minStudiesWidth;
  if (numeric > maxStudiesWidth) return maxStudiesWidth;
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
const studiesWidthStorageKey = 'onelineStudiesWidth';
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
  source_voltage_base: { label: 'Source Voltage', unit: 'kV' },
  short_circuit_capacity: { label: 'Short Circuit Capacity', unit: 'MVA' },
  source_impedance: { label: 'Source Impedance (R + jX)', unit: '' },
  sequence_impedances: { label: 'Sequence Impedances (Z1,Z2,Z0)', unit: '' },
  frequency_hz: { label: 'Frequency', unit: 'Hz' },
  grounding: { label: 'Grounding Type', unit: '' },
  voltage_regulation_percent: { label: 'Voltage Regulation', unit: '%' },
  phase_angle: { label: 'Phase Angle', unit: '°' },
  max_mw_delivery: { label: 'Max MW Delivery', unit: 'MW' },
  losses_r_percent: { label: 'Losses (R%)', unit: '%' },
  stability_response: { label: 'Stability Response', unit: '' },
  transformer_impedance: { label: 'Transformer Impedance', unit: '' },
  operating_mode: { label: 'Operating Mode', unit: '' },
  short_circuit_duration_cycles: { label: 'Short Circuit Duration', unit: 'cycles' },
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
let componentAttributeDisplayOverrides = new Map();
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

function isProtectionComponent(comp) {
  if (!comp || typeof comp !== 'object') return false;
  const subtypeMeta = componentMeta[comp.subtype];
  if (subtypeMeta?.category === 'protection') return true;
  if (subtypeMeta?.type && categoryForType(subtypeMeta.type) === 'protection') return true;
  if (comp.category === 'protection') return true;
  if (categoryForType(comp.type) === 'protection') return true;
  return false;
}

function readNestedValue(holder, path = []) {
  if (!holder || typeof holder !== 'object') return undefined;
  let current = holder;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) return undefined;
    current = current[key];
  }
  return current;
}

function writeNestedValue(holder, path = [], value) {
  if (!holder || typeof holder !== 'object' || !path.length) return;
  let current = holder;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (!current[key] || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}

function getNestedComponentValue(comp, path = []) {
  const direct = readNestedValue(comp, path);
  if (direct !== undefined) return direct;
  if (comp && comp.props && typeof comp.props === 'object') {
    return readNestedValue(comp.props, path);
  }
  return undefined;
}

function setNestedComponentValue(comp, path = [], rawValue, type) {
  if (!comp || !path.length) return;
  let finalValue;
  if (type === 'checkbox') {
    finalValue = !!rawValue;
  } else if (type === 'number') {
    if (rawValue === '' || rawValue === null || rawValue === undefined) {
      finalValue = '';
    } else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      finalValue = rawValue;
    } else {
      const parsed = parseFloat(rawValue);
      finalValue = Number.isFinite(parsed) ? parsed : '';
    }
  } else {
    finalValue = rawValue ?? '';
  }
  writeNestedValue(comp, path, finalValue);
  if (comp.props && typeof comp.props === 'object') {
    writeNestedValue(comp.props, path, finalValue);
  }
}

function inferSchemaFromProps(props, path = []) {
  const schema = [];
  Object.entries(props || {}).forEach(([key, value]) => {
    const currentPath = [...path, key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      schema.push(...inferSchemaFromProps(value, currentPath));
      return;
    }
    const fieldName = currentPath.join('_');
    const labelParts = currentPath.map(part => part.replace(/_/g, ' '));
    const type = typeof value === 'number'
      ? 'number'
      : typeof value === 'boolean'
        ? 'checkbox'
        : 'text';
    const field = {
      name: fieldName,
      label: labelParts.join(' '),
      type,
      default: value
    };
    if (path.length) {
      field.getValue = comp => getNestedComponentValue(comp, currentPath);
      field.setValue = (comp, raw) => setNestedComponentValue(comp, currentPath, raw, type);
    }
    schema.push(field);
  });
  return schema;
}

function isBusComponent(c) {
  return componentMeta[c.subtype]?.type === 'bus' || c.type === 'bus' || c.subtype === 'Bus';
}

function isSourceComponent(comp) {
  if (!comp || comp.type === 'transformer') return false;
  const category = resolveComponentCategory(comp);
  if (category === 'sources') return true;
  const type = (comp.type || '').toLowerCase();
  return type === 'utility_source' || type === 'generator' || type === 'pv_inverter';
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

const defaultBusProps = {
  volts: 13800,
  thevenin_mva: 500,
  xr_ratio: 10,
  grounding: 'solid',
  baseKV: 13.8,
  kV: 13.8,
  Vm: 1.0,
  Va: 0,
  prefault_voltage: 13.8,
  load: {
    kw: 0,
    kvar: 0
  },
  generation: {
    kw: 0,
    kvar: 0
  },
  enclosure: 'box',
  gap: 102,
  working_distance: 914,
  electrode_config: 'VCB'
};

const defaultShapeProps = {
  shapeType: 'rectangle',
  strokeColor: '#333333',
  fillColor: '#ffffff',
  fillOpacity: 1,
  strokeWidth: 2,
  strokeStyle: 'solid',
  cornerRadius: 12
};

const shapePropKeys = [
  'shapeType',
  'strokeColor',
  'fillColor',
  'fillOpacity',
  'strokeWidth',
  'strokeStyle',
  'cornerRadius'
];

const shapeDashPatterns = {
  solid: '',
  dashed: '8 4',
  dotted: '2 2'
};

function ensureShapeDefaults(comp) {
  if (!comp || comp.subtype !== 'annotation_custom_shape') return;
  if (!comp.props || typeof comp.props !== 'object') comp.props = {};
  const meta = componentMeta[comp.subtype] || {};
  const defaults = { ...defaultShapeProps, ...(meta.props || {}) };
  shapePropKeys.forEach(key => {
    const current = comp[key];
    if (
      current === undefined ||
      current === null ||
      (typeof current === 'string' && current.trim() === '')
    ) {
      const fallback = defaults[key];
      if (fallback !== undefined) comp[key] = fallback;
    }
  });
  comp.shapeType = (comp.shapeType || defaults.shapeType || 'rectangle').toLowerCase();
  if (comp.shapeType === 'rounded_rectangle') comp.shapeType = 'rounded';
  if (!['rectangle', 'rounded', 'circle'].includes(comp.shapeType)) comp.shapeType = 'rectangle';
  comp.strokeStyle = (comp.strokeStyle || defaults.strokeStyle || 'solid').toLowerCase();
  if (!['solid', 'dashed', 'dotted'].includes(comp.strokeStyle)) comp.strokeStyle = 'solid';
  let strokeWidth = Number(comp.strokeWidth);
  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) {
    strokeWidth = Number(defaults.strokeWidth) || 1;
  }
  comp.strokeWidth = strokeWidth;
  let radius = Number(comp.cornerRadius);
  if (!Number.isFinite(radius) || radius < 0) {
    radius = Number(defaults.cornerRadius) || 0;
  }
  const metaWidth = Number(meta.width);
  const metaHeight = Number(meta.height);
  let width = Number(comp.width);
  let height = Number(comp.height);
  if (!Number.isFinite(width) || width <= 0) width = Number.isFinite(metaWidth) ? metaWidth : 160;
  if (!Number.isFinite(height) || height <= 0) height = Number.isFinite(metaHeight) ? metaHeight : 100;
  if (comp.shapeType === 'circle') {
    const diameter = Number.isFinite(width) ? width : height;
    comp.width = Number.isFinite(diameter) && diameter > 0 ? diameter : (Number.isFinite(metaWidth) ? metaWidth : 160);
    comp.height = comp.width;
  } else {
    comp.width = width;
    comp.height = height;
  }
  const maxCorner = Math.min(comp.width, comp.height) / 2;
  if (Number.isFinite(maxCorner) && maxCorner >= 0) {
    comp.cornerRadius = Math.min(radius, maxCorner);
  } else {
    comp.cornerRadius = radius;
  }
  const strokeColor = typeof comp.strokeColor === 'string' ? comp.strokeColor.trim() : '';
  comp.strokeColor = strokeColor || defaults.strokeColor || '#333333';
  const fillColor = typeof comp.fillColor === 'string' ? comp.fillColor.trim() : '';
  comp.fillColor = fillColor || defaults.fillColor || '#ffffff';
  let fillOpacity = Number(comp.fillOpacity);
  if (!Number.isFinite(fillOpacity)) {
    const defaultOpacity = Number(defaults.fillOpacity);
    fillOpacity = Number.isFinite(defaultOpacity) ? defaultOpacity : 1;
  }
  fillOpacity = Math.max(0, Math.min(1, fillOpacity));
  comp.fillOpacity = fillOpacity;
  shapePropKeys.forEach(key => {
    comp.props[key] = comp[key];
  });
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
    ],
    props: { ...defaultBusProps }
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
      kva: 300,
      pf: 1,
      volts: 480,
      baseKV: 0.48,
      kV: 0.48,
      voltage: 480,
      prefault_voltage: 0.48,
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
        operating_temp: '',
        install_method: '',
        thermal_rating_ampacity: '',
        shield_armor: '',
        resistance_per_km: '',
        reactance_per_km: '',
        zero_sequence_impedance: '',
        mutual_coupling: '',
        impedance_per_length: '',
        capacitance_per_km: '',
        short_circuit_rating: '',
        grouping_factor: '',
        resistance_temp_correction_coeff: '',
        core_configuration: '',
        ground_return_path_resistance: '',
        color: '#000000',
        length: '',
        manual_length: false
      }
    }
  },
  {
    subtype: 'custom_shape',
    label: 'Shape',
    icon: typeIcons.annotations || placeholderIcon,
    category: 'annotations',
    type: 'annotation',
    width: 160,
    height: 100,
    props: { ...defaultShapeProps },
    hidden: true
  }
];

const cablePropertyMetadata = {
  cable_rating: {
    label: 'Cable Rating (V)',
    type: 'number',
    help: 'Maximum operating voltage. Used for duty and validation checks.'
  },
  conductor_size: {
    label: 'Conductor Size (AWG or mm²)',
    help: 'Determines resistance and ampacity. Base electrical characteristic.'
  },
  conductor_material: {
    label: 'Conductor Material (Cu/Al)',
    help: 'Affects resistance and derating. Impacts loss and weight.'
  },
  resistance_per_km: {
    label: 'Resistance (Ω/km)',
    type: 'number',
    help: 'Used in voltage drop and loss calculations. Derived or vendor data.'
  },
  reactance_per_km: {
    label: 'Reactance (Ω/km)',
    type: 'number',
    help: 'Used in power flow and fault calculations. Important for impedance matching.'
  },
  zero_sequence_impedance: {
    label: 'Zero Sequence Impedance',
    help: 'Ground fault studies. Required for unbalanced analysis.'
  },
  mutual_coupling: {
    label: 'Mutual Coupling',
    help: 'Modeling magnetic coupling between circuits. Important for parallel runs.'
  },
  length: {
    label: 'Length',
    type: 'number',
    help: 'Scales impedance and drop. Must be accurate for realistic models.'
  },
  operating_temp: {
    label: 'Operating Temperature (°C)',
    type: 'number',
    help: 'Used for resistance correction. Impacts ampacity.'
  },
  ambient_temp: {
    label: 'Ambient Temperature (°C)',
    type: 'number',
    help: 'Used for derating. Impacts heat dissipation.'
  },
  thermal_rating_ampacity: {
    label: 'Thermal Rating/Ampacity (A)',
    type: 'number',
    help: 'Defines max current capacity. Used in protection sizing.'
  },
  shield_armor: {
    label: 'Shield/Armor Data',
    help: 'Defines ground path and shielding. Used for EMI and fault analysis.'
  },
  impedance_per_length: {
    label: 'Impedance per Length',
    help: 'Z = R + jX. Defines voltage drop and fault contribution.'
  },
  capacitance_per_km: {
    label: 'Capacitance (µF/km)',
    type: 'number',
    help: 'Used for reactive compensation. Relevant for long lines.'
  },
  insulation_type: {
    label: 'Insulation Type',
    help: 'Determines max voltage and dielectric loss. Used for derating.'
  },
  install_method: {
    label: 'Installation Type (in conduit, tray, buried)',
    help: 'Determines derating factors. Used for thermal calculations.'
  },
  short_circuit_rating: {
    label: 'Short Circuit Rating (kA)',
    type: 'number',
    help: 'Fault withstand capability. Compare against max fault.'
  },
  grouping_factor: {
    label: 'Grouping Factor',
    type: 'number',
    help: 'Used for ampacity derating. Multiple cables reduce rating.'
  },
  resistance_temp_correction_coeff: {
    label: 'Resistance Temp Correction Coeff',
    type: 'number',
    help: 'Adjust R vs temperature. Used in IEC modeling.'
  },
  core_configuration: {
    label: 'Core Configuration (1C,3C)',
    help: 'Determines magnetic coupling. Impacts reactance.'
  },
  ground_return_path_resistance: {
    label: 'Ground Return Path Resistance',
    type: 'number',
    help: 'Used for unbalanced faults. Important for system grounding.'
  },
  impedance_r: {
    label: 'Impedance R (Ω)',
    type: 'number',
    help: 'Positive-sequence resistance. Impacts voltage drop and fault currents.'
  },
  impedance_x: {
    label: 'Impedance X (Ω)',
    type: 'number',
    help: 'Positive-sequence reactance. Impacts voltage drop and fault currents.'
  }
};

let propSchemas = {};
let subtypeCategory = {};
let componentTypes = {};
let manufacturerDefaults = {};
let protectiveDevices = [];

let paletteWidth = clampPaletteWidth(getItem(paletteWidthStorageKey, defaultPaletteWidth));
const storedStudiesWidth = getItem(studiesWidthStorageKey, null);
let studiesWidth = defaultStudiesWidth;
let hasStoredStudiesWidth = false;
if (storedStudiesWidth !== null && storedStudiesWidth !== undefined && storedStudiesWidth !== '') {
  studiesWidth = clampStudiesWidth(storedStudiesWidth, defaultStudiesWidth);
  hasStoredStudiesWidth = true;
}
let resizingPalette = false;
let resizingStudiesPanel = false;
let studiesResizeStartX = 0;
let studiesResizeStartWidth = studiesWidth;

const voltageClasses = ['480 V', '5000 V', '15000 V', '25000 V'];
const thermalRatings = ['75C', '90C', '105C'];
const transformerConnectionOptions = [
  'Delta',
  'Wye (Grounded)',
  'Wye (Ungrounded)',
  'Zig-Zag',
  'Open Delta',
  'Open Wye'
];
const manufacturerModels = {
  ABB: ['MNS', 'SafeGear'],
  Siemens: ['SB1', 'S6'],
  GE: ['EntelliGuard', 'Spectra'],
  Schneider: ['QED-2', 'Blokset'],
  Caterpillar: ['XQ125', 'C175'],
  Cummins: ['C900', 'QSK60'],
  Generac: ['G2000', 'Industrial']
};

function createCapacitorField(name, label, type, help) {
  return {
    name,
    label,
    type,
    help,
    getValue: comp => {
      if (!comp) return '';
      if (comp.props && Object.prototype.hasOwnProperty.call(comp.props, name)) {
        return comp.props[name];
      }
      return comp[name] ?? '';
    },
    setValue: (comp, raw) => {
      if (!comp) return;
      let value;
      if (type === 'number') {
        if (raw === '' || raw === null || raw === undefined) {
          value = '';
        } else if (typeof raw === 'number' && Number.isFinite(raw)) {
          value = raw;
        } else {
          const parsed = parseFloat(raw);
          value = Number.isFinite(parsed) ? parsed : '';
        }
      } else {
        value = raw ?? '';
      }
      if (!comp.props || typeof comp.props !== 'object') {
        comp.props = { ...(comp.props || {}) };
      }
      comp.props[name] = value;
      comp[name] = value;
    }
  };
}

const capacitorBankPropertyFields = [
  createCapacitorField('rated_voltage_kv', 'Rated Voltage (kV)', 'number',
    'Defines operating voltage. Used in power factor correction.'),
  createCapacitorField('reactive_power_kvar', 'Reactive Power (kVAR)', 'number',
    'Defines compensation capacity. Used in VAR support.'),
  createCapacitorField('connection_type', 'Connection Type (Y or Δ)', 'text',
    'Defines grounding scheme. Used in circuit calc.'),
  createCapacitorField('steps', 'Steps (#)', 'number',
    'Defines switching granularity. Used for control logic.'),
  createCapacitorField('losses', 'Losses (W or %)', 'text',
    'Defines dielectric loss. Used for heat calc.'),
  createCapacitorField('discharge_resistor_mohm', 'Discharge Resistor (MΩ)', 'number',
    'Defines safety discharge. Used in transient modeling.'),
  createCapacitorField('harmonic_impedance', 'Harmonic Impedance', 'text',
    'Defines frequency response. Used in harmonic study.'),
  createCapacitorField('control_mode', 'Control Mode (manual/auto)', 'text',
    'Defines operation behavior. Used in network control.')
];


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


function ensureCapacitorBankPropertyMetadata() {
  const targets = new Set(['CapacitorBank', 'shunt_capacitor_bank']);
  const ensureMetaDefaults = meta => {
    if (!meta || typeof meta !== 'object') return;
    if (!meta.props || typeof meta.props !== 'object') {
      meta.props = { ...(meta.props || {}) };
    }
    capacitorBankPropertyFields.forEach(field => {
      if (!Object.prototype.hasOwnProperty.call(meta.props, field.name)) {
        meta.props[field.name] = '';
      }
    });
  };
  Object.entries(componentMeta).forEach(([key, meta]) => {
    if (!meta || typeof meta !== 'object') return;
    const subtype = (meta.subtype || '').trim();
    const type = (meta.type || '').trim();
    const category = (meta.category || '').trim();
    if (subtype === 'CapacitorBank' || subtype === 'shunt_capacitor_bank') {
      targets.add(subtype);
      targets.add(key);
      if (type) targets.add(compKey(type, subtype));
      if (category) targets.add(compKey(category, subtype));
      ensureMetaDefaults(meta);
    }
    if (type === 'shunt_capacitor_bank') {
      targets.add(type);
      if (subtype) targets.add(compKey(type, subtype));
      targets.add(key);
      ensureMetaDefaults(meta);
    }
  });
  ['equipment', 'load', 'shunt_capacitor_bank'].forEach(type => {
    targets.add(compKey(type, 'CapacitorBank'));
  });
  targets.forEach(key => {
    if (!key) return;
    const existing = Array.isArray(propSchemas[key]) ? [...propSchemas[key]] : [];
    const nameMap = new Map(existing.map(field => [field.name, field]));
    capacitorBankPropertyFields.forEach(field => {
      const targetField = nameMap.get(field.name);
      if (targetField) {
        targetField.label = field.label;
        targetField.type = field.type;
        targetField.help = field.help;
        if (!targetField.getValue) targetField.getValue = field.getValue;
        if (!targetField.setValue) targetField.setValue = field.setValue;
      } else {
        const nextField = { ...field };
        existing.push(nextField);
        nameMap.set(field.name, nextField);
      }
    });
    propSchemas[key] = existing;
  });
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
    if (definition.hidden) meta.hidden = true;
    const widthVal = Number(definition.width);
    const heightVal = Number(definition.height);
    if (Number.isFinite(widthVal)) meta.width = widthVal;
    if (Number.isFinite(heightVal)) meta.height = heightVal;
    componentMeta[key] = meta;
    subtypeCategory[key] = category;
    if (!componentTypes[category]) componentTypes[category] = [];
    if (!componentTypes[category].includes(key)) componentTypes[category].push(key);
    const schema = inferSchemaFromProps(props);
    propSchemas[key] = schema;
    if (!propSchemas[subtype] || allowOverride) {
      propSchemas[subtype] = schema.map(field => ({ ...field }));
    }
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

  ensureCapacitorBankPropertyMetadata();

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
      if (!meta || meta.hidden) return;
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
        addComponent({ type: meta.type, subtype: subKey, placeAtViewportCenter: true });
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
let dragConnections = null;
let draggingLabel = null;
let clipboard = [];
let propertyClipboard = null;

const PROPERTY_CLIPBOARD_EXCLUDE_KEYS = new Set([
  'id',
  'label',
  'name',
  'tag',
  'ref',
  'x',
  'y',
  'z',
  'connections',
  'ports',
  'portCounts',
  'icon',
  'width',
  'height',
  'rotation',
  'flipped',
  'labelOffset',
  'category',
  'type',
  'subtype',
  'defaultRotation',
  'isVirtualNode',
  'templateId',
  'isTemplate',
  'diagramId',
  'diagramSheet',
  'diagram',
  'diagramScale',
  'diagramViewport',
  'diagramZoom',
  'diagramOffset',
  'locked',
  'componentVersion'
]);

const PROPERTY_CLIPBOARD_UNIQUE_KEYS = new Set(['id', 'label', 'name', 'tag', 'ref']);

function isDomNode(value) {
  if (!value || typeof value !== 'object') return false;
  if (typeof Element !== 'undefined' && value instanceof Element) return true;
  if (typeof Node !== 'undefined' && value instanceof Node) return true;
  return false;
}

function clonePropertyClipboardValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => clonePropertyClipboardValue(item));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (isDomNode(value)) return undefined;
  const result = {};
  Object.keys(value).forEach(key => {
    if (PROPERTY_CLIPBOARD_UNIQUE_KEYS.has(key)) return;
    const cloned = clonePropertyClipboardValue(value[key]);
    if (cloned !== undefined) {
      result[key] = cloned;
    }
  });
  return result;
}

function buildPropertyClipboardData(comp) {
  if (!comp || typeof comp !== 'object') return {};
  const data = {};
  Object.keys(comp).forEach(key => {
    if (PROPERTY_CLIPBOARD_EXCLUDE_KEYS.has(key)) return;
    const value = comp[key];
    if (typeof value === 'function') return;
    if (value === undefined) return;
    if (isDomNode(value)) return;
    const cloned = clonePropertyClipboardValue(value);
    if (cloned !== undefined) {
      data[key] = cloned;
    }
  });
  return data;
}

function createPropertyClipboardFromComponent(comp) {
  if (!comp || comp.isVirtualNode) return null;
  const data = buildPropertyClipboardData(comp);
  if (!Object.keys(data).length) return null;
  return {
    subtype: comp.subtype || '',
    type: comp.type || '',
    data
  };
}

function canPastePropertyClipboard(clipboardData, target) {
  if (!clipboardData || !clipboardData.data) return false;
  if (!target || target.isVirtualNode) return false;
  const sourceKey = clipboardData.subtype || clipboardData.type || '';
  const targetKey = target.subtype || target.type || '';
  if (!sourceKey || !targetKey) return true;
  return sourceKey === targetKey;
}

function deepEqualValues(a, b) {
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualValues(a[i], b[i])) return false;
    }
    return true;
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqualValues(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

function applyPropertyClipboardToComponent(target, clipboardData) {
  if (!target || !clipboardData || !clipboardData.data) return false;
  const data = clipboardData.data;
  let changed = false;
  Object.keys(target).forEach(key => {
    if (PROPERTY_CLIPBOARD_EXCLUDE_KEYS.has(key)) return;
    if (Object.prototype.hasOwnProperty.call(data, key)) return;
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      delete target[key];
      changed = true;
    }
  });
  Object.entries(data).forEach(([key, value]) => {
    const cloned = clonePropertyClipboardValue(value);
    if (cloned === undefined && value !== undefined) return;
    if (!deepEqualValues(target[key], cloned)) {
      target[key] = cloned;
      changed = true;
    }
  });
  return changed;
}
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
const DEFAULT_VIEWPORT_WIDTH = 960;
const DEFAULT_VIEWPORT_HEIGHT = 540;
const STATIC_VIEWPORT_SCALE = 4;
const STATIC_VIEWPORT_BOUNDS = {
  minX: -DEFAULT_VIEWPORT_WIDTH * STATIC_VIEWPORT_SCALE / 2,
  minY: -DEFAULT_VIEWPORT_HEIGHT * STATIC_VIEWPORT_SCALE / 2,
  width: DEFAULT_VIEWPORT_WIDTH * STATIC_VIEWPORT_SCALE,
  height: DEFAULT_VIEWPORT_HEIGHT * STATIC_VIEWPORT_SCALE
};
const MAX_ROUTE_ADJUST_STEPS = 250;
const STUDY_SETTINGS_KEY = 'studySettings';
const defaultStudySettings = {
  loadFlow: { baseMVA: 100, balanced: true, maxIterations: 20 },
  shortCircuit: { method: 'IEC' }
};
let diagramViewport = { ...STATIC_VIEWPORT_BOUNDS };
let diagramZoom = clampZoom(getItem('diagramZoom', DEFAULT_DIAGRAM_ZOOM));
let resizingBus = null;
let resizingAnnotation = null;
let marquee = null;

function normalizeStudySettings(raw = {}) {
  const lf = raw && typeof raw === 'object' ? raw.loadFlow || {} : {};
  const sc = raw && typeof raw === 'object' ? raw.shortCircuit || {} : {};
  const base = Number(lf.baseMVA);
  const iter = Number(lf.maxIterations);
  return {
    loadFlow: {
      baseMVA: Number.isFinite(base) && base > 0 ? base : defaultStudySettings.loadFlow.baseMVA,
      balanced: lf.balanced !== false,
      maxIterations: Number.isFinite(iter) && iter > 0
        ? Math.min(Math.floor(iter), 999)
        : defaultStudySettings.loadFlow.maxIterations
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
let cursorPosValid = false;
let needsInitialViewportCenter = true;
let pendingInitialCenter = null;
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
const studiesResizeHandle = document.getElementById('studies-resize-handle');
if (studiesPanel && hasStoredStudiesWidth) {
  studiesPanel.style.setProperty('--studies-width', `${studiesWidth}px`);
}
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
const studyResultsCopyBtn = document.getElementById('study-results-copy-btn');
const studyLoadFlowBase = document.getElementById('study-loadflow-basemva');
const studyLoadFlowIterations = document.getElementById('study-loadflow-iterations');
const studyLoadFlowBalanced = document.getElementById('study-loadflow-balanced');
const studyShortCircuitMethod = document.getElementById('study-shortcircuit-method');

function persistStudySettings() {
  setItem(STUDY_SETTINGS_KEY, studySettings);
}

function applyStudySettingsToForm() {
  if (studyLoadFlowBase) studyLoadFlowBase.value = String(studySettings.loadFlow.baseMVA);
  if (studyLoadFlowIterations) studyLoadFlowIterations.value = String(studySettings.loadFlow.maxIterations);
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
if (studyResultsCopyBtn) {
  studyResultsCopyBtn.addEventListener('click', () => {
    copyStudyResultsToClipboard();
  });
  updateStudyResultsCopyState();
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
if (studyLoadFlowIterations) {
  studyLoadFlowIterations.addEventListener('change', () => {
    const value = Number(studyLoadFlowIterations.value);
    const normalized = Number.isFinite(value) && value > 0
      ? Math.min(Math.floor(value), 999)
      : defaultStudySettings.loadFlow.maxIterations;
    studySettings.loadFlow.maxIterations = normalized;
    studyLoadFlowIterations.value = String(normalized);
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

function hasRenderedStudyResults() {
  if (!studyResultsEl) return false;
  const text = (studyResultsEl.textContent || '').trim();
  if (!text || text === 'No results') return false;
  return true;
}

function hasRenderedLoadFlowResults() {
  if (!loadFlowResultsEl) return false;
  const text = (loadFlowResultsEl.innerText || loadFlowResultsEl.textContent || '').trim();
  return text.length > 0;
}

function updateStudyResultsCopyState() {
  if (!studyResultsCopyBtn) return;
  const hasCopyable = hasRenderedStudyResults() || hasRenderedLoadFlowResults();
  studyResultsCopyBtn.disabled = !hasCopyable;
}

function renderStudyResults() {
  if (!studyResultsEl) return;
  const res = getStudies();
  studyResultsEl.textContent = Object.keys(res).length ? JSON.stringify(res, null, 2) : 'No results';
  updateStudyResultsCopyState();
}

function gatherStudyResultsText() {
  const sections = [];
  if (hasRenderedStudyResults()) {
    const jsonText = (studyResultsEl.textContent || '').trim();
    if (jsonText) sections.push(jsonText);
  }
  if (hasRenderedLoadFlowResults()) {
    const loadFlowText = (loadFlowResultsEl.innerText || loadFlowResultsEl.textContent || '').trim();
    if (loadFlowText) sections.push(loadFlowText);
  }
  return sections.join('\n\n').trim();
}

async function copyStudyResultsToClipboard() {
  const payload = gatherStudyResultsText();
  if (!payload) {
    showToast('No study results to copy');
    return;
  }
  let copied = false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(payload);
      copied = true;
    } catch (err) {
      console.error('Clipboard write failed', err);
    }
  }
  if (!copied) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = payload;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      copied = document.execCommand('copy');
      textarea.remove();
    } catch (err) {
      console.error('Fallback copy failed', err);
      copied = false;
    }
  }
  showToast(copied ? 'Study results copied to clipboard' : 'Unable to copy study results');
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

function isScrollableElement(element) {
  if (!(element instanceof HTMLElement)) return false;
  try {
    const style = window.getComputedStyle(element);
    const overflowX = style.overflowX || '';
    const overflowY = style.overflowY || '';
    const canScrollX = /auto|scroll|overlay/i.test(overflowX) && element.scrollWidth > element.clientWidth;
    const canScrollY = /auto|scroll|overlay/i.test(overflowY) && element.scrollHeight > element.clientHeight;
    return canScrollX || canScrollY;
  } catch {
    return false;
  }
}

function getScrollableContainer(element) {
  let current = element;
  while (current && current !== document.body && current !== document.documentElement) {
    if (isScrollableElement(current)) return current;
    current = current.parentElement;
  }
  return document.scrollingElement || document.documentElement || document.body;
}

function findScrollableAncestorWithin(element, boundary) {
  const root = boundary instanceof Element ? boundary : null;
  let current = element instanceof Element ? element : null;
  while (current) {
    if (root && !root.contains(current)) break;
    if (isScrollableElement(current)) return current;
    if (current === root) break;
    current = current.parentElement;
  }
  if (root && isScrollableElement(root)) return root;
  return null;
}

function attachLocalWheelScroll(container) {
  if (!(container instanceof HTMLElement)) return;
  container.addEventListener('wheel', event => {
    if (event.ctrlKey) return;
    const target = event.target instanceof Element ? event.target : container;
    const scrollHost = findScrollableAncestorWithin(target, container);
    if (!(scrollHost instanceof HTMLElement)) return;
    let consumed = false;
    if (event.deltaY !== 0 && scrollHost.scrollHeight > scrollHost.clientHeight) {
      const prevTop = scrollHost.scrollTop;
      scrollHost.scrollTop += event.deltaY;
      if (scrollHost.scrollTop !== prevTop) consumed = true;
    }
    if (event.deltaX !== 0 && scrollHost.scrollWidth > scrollHost.clientWidth) {
      const prevLeft = scrollHost.scrollLeft;
      scrollHost.scrollLeft += event.deltaX;
      if (scrollHost.scrollLeft !== prevLeft) consumed = true;
    }
    if (!consumed) return;
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
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
  const editor = svg.parentElement;
  if (needsInitialViewportCenter && editor instanceof HTMLElement) {
    const initialFocus = pendingInitialCenter || getStaticViewportCenter();
    const nextLeft = (initialFocus.x - minX) * zoom - editor.clientWidth / 2;
    const nextTop = (initialFocus.y - minY) * zoom - editor.clientHeight / 2;
    editor.scrollLeft = Math.max(0, nextLeft);
    editor.scrollTop = Math.max(0, nextTop);
    needsInitialViewportCenter = false;
    pendingInitialCenter = null;
  }
  if (!adjustScroll) return;
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
  if (needsInitialViewportCenter) {
    if (bounds && Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY) &&
        Number.isFinite(bounds.maxX) && Number.isFinite(bounds.maxY)) {
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      if (Number.isFinite(centerX) && Number.isFinite(centerY)) {
        pendingInitialCenter = { x: centerX, y: centerY };
      }
    }
    if (!pendingInitialCenter) {
      pendingInitialCenter = getStaticViewportCenter();
    }
  }
  diagramViewport = { ...STATIC_VIEWPORT_BOUNDS };
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

function panDiagram(direction, container) {
  if (!(container instanceof HTMLElement)) return;
  const scrollHost = getScrollableContainer(container) || container;
  if (!(scrollHost instanceof HTMLElement)) return;
  const stepX = Math.max(80, Math.round(scrollHost.clientWidth * 0.3));
  const stepY = Math.max(80, Math.round(scrollHost.clientHeight * 0.3));
  if (direction === 'left') {
    scrollHost.scrollLeft -= stepX;
  } else if (direction === 'right') {
    scrollHost.scrollLeft += stepX;
  } else if (direction === 'up') {
    scrollHost.scrollTop -= stepY;
  } else if (direction === 'down') {
    scrollHost.scrollTop += stepY;
  } else {
    return;
  }
  needsInitialViewportCenter = false;
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
if (studiesResizeHandle && studiesPanel) {
  studiesResizeHandle.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    resizingStudiesPanel = true;
    studiesPanel.classList.add('is-resizing');
    studiesResizeStartX = e.clientX;
    const rect = studiesPanel.getBoundingClientRect();
    studiesResizeStartWidth = rect.width;
    studiesWidth = clampStudiesWidth(rect.width, defaultStudiesWidth);
    studiesPanel.style.setProperty('--studies-width', `${studiesWidth}px`);
    hasStoredStudiesWidth = true;
    e.preventDefault();
  });
}
if (runLFBtn) runLFBtn.addEventListener('click', () => {
  const res = runLoadFlow({
    baseMVA: studySettings.loadFlow.baseMVA,
    balanced: studySettings.loadFlow.balanced,
    maxIterations: studySettings.loadFlow.maxIterations
  });
  const { sheets } = getOneLine();
  const diagram = sheets.flatMap(s => s.components);
  diagram.forEach(comp => {
    (comp.connections || []).forEach(conn => {
      delete conn.loading_kW;
      delete conn.loading_amps;
      delete conn.voltage_drop_pct;
      delete conn.voltage_from_kv;
      delete conn.voltage_to_kv;
      delete conn.voltage_from_v;
      delete conn.voltage_to_v;
    });
  });
  const buses = Array.isArray(res?.buses)
    ? res.buses
    : Array.isArray(res)
      ? res
      : [];
  buses.forEach(r => {
    const comp = diagram.find(c => c.id === r.id);
    if (!comp) return;
    if (!Number.isFinite(r.Vm)) return;
    const kv = Number.isFinite(r.voltageKV)
      ? r.voltageKV
      : Number.isFinite(r.baseKV)
        ? r.baseKV * r.Vm
        : null;
    if (r.phase) {
      if (typeof comp.voltage_mag !== 'object') comp.voltage_mag = {};
      if (typeof comp.voltage_angle !== 'object') comp.voltage_angle = {};
      comp.voltage_mag[r.phase] = Number(r.Vm.toFixed(4));
      comp.voltage_angle[r.phase] = Number(r.Va.toFixed(4));
    } else {
      comp.voltage_mag = Number(r.Vm.toFixed(4));
      comp.voltage_angle = Number(r.Va.toFixed(4));
    }
    if (kv !== null && Number.isFinite(kv)) {
      const kvRounded = Number(kv.toFixed(4));
      const voltsRounded = Number((kv * 1000).toFixed(1));
      comp.voltage_kv = kvRounded;
      comp.voltage_v = voltsRounded;
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
    const formatPct = value => Number(value.toFixed(2));
    const formatKV = value => Number(value.toFixed(3));
    const formatVolts = value => Number(value.toFixed(1));
    if (l.phase) {
      if (typeof conn.loading_kW !== 'object') conn.loading_kW = {};
      conn.loading_kW[l.phase] = formatKw(l.P);
      if (ampsRaw !== null) {
        if (typeof conn.loading_amps !== 'object') conn.loading_amps = {};
        conn.loading_amps[l.phase] = formatAmp(ampsRaw);
      }
      if (typeof l.dropPct === 'number') {
        if (typeof conn.voltage_drop_pct !== 'object') conn.voltage_drop_pct = {};
        conn.voltage_drop_pct[l.phase] = formatPct(l.dropPct);
      }
    } else {
      conn.loading_kW = formatKw(l.P);
      if (ampsRaw !== null) {
        conn.loading_amps = formatAmp(ampsRaw);
      }
      if (typeof l.dropPct === 'number') {
        conn.voltage_drop_pct = formatPct(l.dropPct);
      }
    }
    if (typeof l.fromKV === 'number') conn.voltage_from_kv = formatKV(l.fromKV);
    if (typeof l.toKV === 'number') conn.voltage_to_kv = formatKV(l.toKV);
    if (typeof l.fromKV === 'number') conn.voltage_from_v = formatVolts(l.fromKV * 1000);
    if (typeof l.toKV === 'number') conn.voltage_to_v = formatVolts(l.toKV * 1000);
  });
  updateCableOperatingVoltages(diagram);
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
  loadFlowResultsEl.innerHTML = renderLoadFlowResultsHtml(res);
  updateStudyResultsCopyState();
}

export { renderLoadFlowResults };
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
  const insertionPoint = getDefaultInsertionPoint();
  let x = insertionPoint.x;
  let y = insertionPoint.y;
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

function formatOptionSourceLabel(source) {
  if (!source) return '';
  if (source.startsWith('study:')) {
    const label = formatAttributeLabel(source.slice(6));
    return label ? `${label} Study` : 'Study';
  }
  if (source === 'component') return 'Component';
  if (source === 'componentProps') return 'Component Settings';
  if (source === 'template') return 'Template Defaults';
  return formatAttributeLabel(source);
}

function deriveOptionContextLabel(optionKey, baseLabel) {
  if (!optionKey) return '';
  if (optionKey.includes('.')) {
    const [namespace, ...rest] = optionKey.split('.');
    const nsLabel = formatAttributeLabel(namespace);
    const propLabel = rest.length ? formatAttributeLabel(rest.join('.')) : '';
    if (propLabel && propLabel !== baseLabel) return `${nsLabel ? `${nsLabel}: ` : ''}${propLabel}`.trim();
    return nsLabel && nsLabel !== baseLabel ? nsLabel : '';
  }
  const parts = optionKey.split('_');
  if (parts.length > 1) {
    const tail = formatAttributeLabel(parts.slice(-1)[0]);
    if (tail && tail !== baseLabel) return tail;
  }
  const formatted = formatAttributeLabel(optionKey);
  return formatted !== baseLabel ? formatted : '';
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
  if (lower.endsWith('kva') || lower.endsWith('_kva')) return 'kVA';
  if (lower.endsWith('_ka') || lower.includes('ka')) return 'kA';
  if (lower.endsWith('_kv') || lower.includes('kv')) return 'kV';
  if (lower.includes('voltage') || lower.endsWith('volts') || lower.endsWith('_v')) return 'V';
  if (lower.endsWith('_kw') || lower.endsWith('kw')) return 'kW';
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
    const compKey = comp?.subtype || comp?.type;
    const displayMap = compKey ? componentAttributeDisplayOverrides.get(compKey) : null;
    const displayLabel = displayMap?.get(option.key) || option.displayLabel || option.label;
    const value = resolveComponentAttribute(comp, option.key);
    const formatted = formatAttributeValue(option.key, value);
    if (formatted === null) return;
    const unit = option.unit || '';
    const valueText = unit ? `${formatted} ${unit}`.trim() : formatted;
    const baseLabel = displayLabel || option.label || formatAttributeLabel(option.key);
    const labelText = baseLabel || formatAttributeLabel(option.key);
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
          const baseLabel = opt.displayLabel || opt.label;
          text.textContent = opt.unit ? `${baseLabel} (${opt.unit})` : baseLabel;
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

function openShapeModal() {
  const meta = componentMeta['annotation_custom_shape'] || {};
  const defaults = {
    width: Number.isFinite(Number(meta.width)) ? Number(meta.width) : 160,
    height: Number.isFinite(Number(meta.height)) ? Number(meta.height) : 100,
    ...defaultShapeProps,
    ...(meta.props || {})
  };
  let form;
  let shapeSelect;
  let widthInput;
  let heightInput;
  let strokeStyleSelect;
  let strokeWidthInput;
  let strokeColorInput;
  let fillColorInput;
  let fillOpacityInput;
  let cornerRadiusInput;

  const createLabeledField = (labelText, input, helpText) => {
    const label = document.createElement('label');
    label.className = 'shape-field';
    const span = document.createElement('span');
    span.className = 'shape-field-label';
    span.textContent = labelText;
    label.appendChild(span);
    label.appendChild(input);
    if (helpText) {
      const help = document.createElement('span');
      help.className = 'shape-field-help';
      help.textContent = helpText;
      label.appendChild(help);
    }
    return label;
  };

  openModal({
    title: 'Add Shape',
    primaryText: 'Add Shape',
    secondaryText: 'Cancel',
    closeOnBackdrop: true,
    render(body, controller) {
      form = document.createElement('form');
      form.className = 'shape-modal-form';
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'shape-modal-fieldset';
      const legend = document.createElement('legend');
      legend.textContent = 'Shape settings';
      fieldset.appendChild(legend);

      shapeSelect = document.createElement('select');
      shapeSelect.name = 'shapeType';
      [
        { value: 'rectangle', label: 'Rectangle' },
        { value: 'rounded', label: 'Rounded Rectangle' },
        { value: 'circle', label: 'Circle' }
      ].forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if ((defaults.shapeType || 'rectangle').toLowerCase() === opt.value) option.selected = true;
        shapeSelect.appendChild(option);
      });

      widthInput = document.createElement('input');
      widthInput.type = 'number';
      widthInput.name = 'width';
      widthInput.min = '1';
      widthInput.step = '1';
      widthInput.value = Number(defaults.width) || 160;

      heightInput = document.createElement('input');
      heightInput.type = 'number';
      heightInput.name = 'height';
      heightInput.min = '1';
      heightInput.step = '1';
      heightInput.value = Number(defaults.height) || 100;

      strokeStyleSelect = document.createElement('select');
      strokeStyleSelect.name = 'strokeStyle';
      [
        { value: 'solid', label: 'Solid' },
        { value: 'dashed', label: 'Dashed' },
        { value: 'dotted', label: 'Dotted' }
      ].forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if ((defaults.strokeStyle || 'solid').toLowerCase() === opt.value) option.selected = true;
        strokeStyleSelect.appendChild(option);
      });

      strokeWidthInput = document.createElement('input');
      strokeWidthInput.type = 'number';
      strokeWidthInput.name = 'strokeWidth';
      strokeWidthInput.min = '0.1';
      strokeWidthInput.step = '0.5';
      strokeWidthInput.value = Number(defaults.strokeWidth) || 2;

      strokeColorInput = document.createElement('input');
      strokeColorInput.type = 'color';
      strokeColorInput.name = 'strokeColor';
      strokeColorInput.value = defaults.strokeColor || '#333333';

      fillColorInput = document.createElement('input');
      fillColorInput.type = 'color';
      fillColorInput.name = 'fillColor';
      fillColorInput.value = defaults.fillColor && defaults.fillColor !== 'none'
        ? defaults.fillColor
        : '#ffffff';

      fillOpacityInput = document.createElement('input');
      fillOpacityInput.type = 'number';
      fillOpacityInput.name = 'fillOpacity';
      fillOpacityInput.min = '0';
      fillOpacityInput.max = '1';
      fillOpacityInput.step = '0.05';
      const defaultOpacity = Number(defaults.fillOpacity);
      fillOpacityInput.value = Number.isFinite(defaultOpacity) ? defaultOpacity : 1;

      cornerRadiusInput = document.createElement('input');
      cornerRadiusInput.type = 'number';
      cornerRadiusInput.name = 'cornerRadius';
      cornerRadiusInput.min = '0';
      cornerRadiusInput.step = '1';
      cornerRadiusInput.value = Number(defaults.cornerRadius) || 12;

      fieldset.appendChild(createLabeledField('Shape Type', shapeSelect));
      fieldset.appendChild(createLabeledField('Width (px)', widthInput, 'For circles width is the diameter.'));
      fieldset.appendChild(createLabeledField('Height (px)', heightInput, 'Circles keep height equal to width.'));
      fieldset.appendChild(createLabeledField('Line Style', strokeStyleSelect));
      fieldset.appendChild(createLabeledField('Line Weight', strokeWidthInput));
      fieldset.appendChild(createLabeledField('Line Color', strokeColorInput));
      fieldset.appendChild(createLabeledField('Fill Color', fillColorInput));
      fieldset.appendChild(createLabeledField('Fill Opacity', fillOpacityInput, '0 is transparent, 1 is opaque.'));
      fieldset.appendChild(createLabeledField('Corner Radius', cornerRadiusInput, 'Applies to rounded rectangles.'));

      form.appendChild(fieldset);
      controller.registerForm(form);
      controller.setInitialFocus(shapeSelect);
      body.appendChild(form);

      const syncControlState = () => {
        const shape = shapeSelect.value;
        const isCircle = shape === 'circle';
        heightInput.disabled = isCircle;
        if (isCircle) {
          heightInput.value = widthInput.value;
        }
        cornerRadiusInput.disabled = shape !== 'rounded';
      };

      shapeSelect.addEventListener('change', () => {
        syncControlState();
      });
      widthInput.addEventListener('input', () => {
        if (shapeSelect.value === 'circle') {
          heightInput.value = widthInput.value;
        }
      });
      syncControlState();

      return shapeSelect;
    },
    onSubmit() {
      if (!form) return false;
      const data = new FormData(form);
      const shapeType = String(data.get('shapeType') || defaults.shapeType || 'rectangle').toLowerCase();
      let width = Number.parseFloat(data.get('width'));
      let height = Number.parseFloat(data.get('height'));
      let strokeWidth = Number.parseFloat(data.get('strokeWidth'));
      const strokeStyle = String(data.get('strokeStyle') || defaults.strokeStyle || 'solid').toLowerCase();
      const strokeColor = data.get('strokeColor') || defaults.strokeColor || '#333333';
      const fillColor = data.get('fillColor') || defaults.fillColor || '#ffffff';
      let fillOpacity = Number.parseFloat(data.get('fillOpacity'));
      let cornerRadius = Number.parseFloat(data.get('cornerRadius'));

      if (!Number.isFinite(width) || width <= 0) width = Number(defaults.width) || 160;
      if (!Number.isFinite(height) || height <= 0) height = Number(defaults.height) || 100;
      if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) strokeWidth = Number(defaults.strokeWidth) || 1;
      if (!Number.isFinite(fillOpacity)) {
        const fallback = Number(defaults.fillOpacity);
        fillOpacity = Number.isFinite(fallback) ? fallback : 1;
      }
      fillOpacity = Math.max(0, Math.min(1, fillOpacity));
      if (!Number.isFinite(cornerRadius) || cornerRadius < 0) cornerRadius = Number(defaults.cornerRadius) || 0;
      if (shapeType === 'circle') {
        height = width;
      }

      const comp = addComponent({
        type: 'annotation',
        subtype: 'annotation_custom_shape',
        skipHistory: true,
        placeAtViewportCenter: true
      });
      if (!comp) return false;

      comp.width = width;
      comp.height = height;
      comp.shapeType = shapeType;
      comp.strokeStyle = strokeStyle;
      comp.strokeWidth = strokeWidth;
      comp.strokeColor = typeof strokeColor === 'string' ? strokeColor : defaults.strokeColor;
      comp.fillColor = typeof fillColor === 'string' ? fillColor : defaults.fillColor;
      comp.fillOpacity = fillOpacity;
      comp.cornerRadius = cornerRadius;
      ensureShapeDefaults(comp);

      pushHistory();
      render();
      save();
      selectComponent(comp);
      return true;
    }
  });
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
  const componentOptionSourceMap = new Map();
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

  const addComponentKey = (compKey, key, sourceHint = null) => {
    if (!compKey) return;
    const option = registerOption(key);
    if (!option) return;
    if (!componentOptionMap.has(compKey)) {
      componentOptionMap.set(compKey, new Map());
    }
    componentOptionMap.get(compKey).set(option.key, option);
    if (!componentOptionSourceMap.has(compKey)) {
      componentOptionSourceMap.set(compKey, new Map());
    }
    const sourceMap = componentOptionSourceMap.get(compKey);
    if (!sourceMap.has(option.key)) {
      sourceMap.set(option.key, new Set());
    }
    if (sourceHint) {
      sourceMap.get(option.key).add(sourceHint);
    }
  };

  Object.entries(componentMeta).forEach(([compKey, meta]) => {
    registerComponentLabel(compKey, meta?.label);
    Object.entries(meta.props || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === 'object') return;
      addComponentKey(compKey, key, 'template');
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
        addComponentKey(compKey, key, 'component');
      });
      if (comp.props && typeof comp.props === 'object') {
        Object.entries(comp.props).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          if (typeof value === 'object') return;
          addComponentKey(compKey, key, 'componentProps');
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
        addComponentKey(compKey, option.key, `study:${namespace}`);
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
  componentAttributeDisplayOverrides = new Map();

  componentOptionMap.forEach((options, compKey) => {
    const clones = Array.from(options.values()).map(opt => ({ ...opt }));
    const sourceMap = componentOptionSourceMap.get(compKey) || new Map();
    const grouped = new Map();
    const displayMap = new Map();

    clones.forEach(opt => {
      const keyId = `${opt.label}__${opt.unit || ''}`;
      if (!grouped.has(keyId)) grouped.set(keyId, []);
      grouped.get(keyId).push(opt);
    });

    grouped.forEach(list => {
      if (list.length === 1) {
        const [single] = list;
        single.displayLabel = single.label;
        displayMap.set(single.key, single.displayLabel);
        return;
      }
      list.forEach(opt => {
        const sourceSet = sourceMap.get(opt.key);
        const sources = sourceSet ? Array.from(sourceSet) : [];
        const contextParts = sources.map(formatOptionSourceLabel).filter(Boolean);
        if (!contextParts.length) {
          const derived = deriveOptionContextLabel(opt.key, opt.label);
          if (derived) contextParts.push(derived);
        }
        const context = contextParts.join(' • ');
        opt.displayLabel = context ? `${opt.label} – ${context}` : opt.label;
        displayMap.set(opt.key, opt.displayLabel);
      });
    });

    clones.forEach(opt => {
      if (!displayMap.has(opt.key)) {
        opt.displayLabel = opt.label;
        displayMap.set(opt.key, opt.displayLabel);
      }
    });

    clones.sort((a, b) => {
      const labelA = a.displayLabel || a.label;
      const labelB = b.displayLabel || b.label;
      return labelA.localeCompare(labelB);
    });

    componentAttributeOptions.set(compKey, clones);
    const label = componentLabelMap.get(compKey) || getComponentDisplayLabel(compKey);
    componentAttributeLabelMap.set(compKey, label);
    componentAttributeList.push({ key: compKey, label });
    componentAttributeDisplayOverrides.set(compKey, displayMap);
  });

  const orphanKeys = new Set(viewAttributes);
  componentAttributeOptions.forEach(options => {
    options.forEach(opt => orphanKeys.delete(opt.key));
  });
  if (orphanKeys.size) {
    const orphanOptions = Array.from(orphanKeys)
      .map(key => attributeOptionsMap.get(key))
      .filter(Boolean)
      .map(opt => ({ ...opt, displayLabel: opt.label }))
      .sort((a, b) => (a.displayLabel || a.label).localeCompare(b.displayLabel || b.label));
    if (orphanOptions.length) {
      const orphanLabel = 'Other Attributes';
      componentAttributeOptions.set('__other__', orphanOptions);
      componentAttributeLabelMap.set('__other__', orphanLabel);
      componentAttributeList.push({ key: '__other__', label: orphanLabel });
      componentAttributeDisplayOverrides.set('__other__', new Map(orphanOptions.map(opt => [opt.key, opt.displayLabel || opt.label])));
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

function getTransformerConnectionSetting(transformer, role) {
  if (!transformer || !role) return null;
  const key = `${role}_connection`;
  const direct = transformer[key];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (transformer.props && typeof transformer.props[key] === 'string') {
    const value = transformer.props[key].trim();
    if (value) return value;
  }
  const metaProps = componentMeta[transformer.subtype]?.props || {};
  const metaValue = metaProps[key];
  if (typeof metaValue === 'string' && metaValue.trim()) return metaValue.trim();
  return null;
}

function getTransformerPortRole(transformer, portIndex) {
  if (!transformer || transformer.type !== 'transformer') return null;
  const idx = Number(portIndex);
  if (!Number.isFinite(idx)) return null;
  if (transformer.subtype === 'three_winding') {
    if (idx === 0) return 'primary';
    if (idx === 1) return 'secondary';
    if (idx === 2) return 'tertiary';
  }
  if (idx === 0) return 'primary';
  if (idx === 1) return 'secondary';
  if (idx === 2) return 'tertiary';
  return null;
}

function buildTransformerPortLabel(transformer, portIndex) {
  const role = getTransformerPortRole(transformer, portIndex);
  if (!role) return null;
  let roleLabel;
  switch (role) {
    case 'primary':
      roleLabel = 'Primary';
      break;
    case 'secondary':
      roleLabel = 'Secondary';
      break;
    case 'tertiary':
      roleLabel = 'Tertiary';
      break;
    default:
      roleLabel = role;
      break;
  }
  const config = getTransformerConnectionSetting(transformer, role);
  return config ? `${roleLabel} (${config})` : roleLabel;
}

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

function formatVoltage(volts) {
  if (!Number.isFinite(volts)) return '';
  const abs = Math.abs(volts);
  if (abs >= 1000) {
    const kv = Number((volts / 1000).toFixed(3));
    return `${kv} kV`;
  }
  const value = Number(volts.toFixed(1));
  return `${value} V`;
}

function resolveNominalVoltage(component) {
  if (!component || typeof component !== 'object') return null;
  const resolved = resolveComponentVoltageVolts(component, { includeOperatingVoltage: false });
  if (Number.isFinite(resolved) && resolved > 0) return resolved;
  return null;
}

function resolveVoltageMagnitude(component) {
  if (!component || typeof component !== 'object') return null;
  const raw = component.voltage_mag;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    const values = Object.values(raw)
      .map(val => Number(val))
      .filter(val => Number.isFinite(val) && val > 0);
    if (values.length) {
      const total = values.reduce((sum, val) => sum + val, 0);
      return total / values.length;
    }
  }
  return null;
}

function computeComponentOperatingVoltage(component) {
  if (!component) return null;
  const nominal = resolveNominalVoltage(component);
  if (nominal === null) return null;
  const magnitude = resolveVoltageMagnitude(component);
  if (magnitude !== null) {
    return nominal * magnitude;
  }
  return nominal;
}

function formatOperatingVoltage(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isFinite(num)) return Number(num.toFixed(2));
  return value;
}

let pendingImplicitHistoryUpdate = false;
let implicitHistoryUpdateScheduled = false;

function scheduleImplicitHistoryUpdate() {
  if (implicitHistoryUpdateScheduled) {
    pendingImplicitHistoryUpdate = true;
    return;
  }
  if (historyIndex < 0 || historyIndex >= history.length) return;
  pendingImplicitHistoryUpdate = true;
  implicitHistoryUpdateScheduled = true;
  Promise.resolve().then(() => {
    implicitHistoryUpdateScheduled = false;
    if (!pendingImplicitHistoryUpdate) return;
    pendingImplicitHistoryUpdate = false;
    if (historyIndex < 0 || historyIndex >= history.length) return;
    history[historyIndex] = JSON.parse(JSON.stringify(components));
  });
}

function assignInheritedVoltage(target, voltageValue, connection = null) {
  if (!target) return false;
  const num = parseVoltageNumber(voltageValue);
  if (num === null) return false;
  const formatted = formatVoltageString(num);
  if (!formatted) return false;
  const current = target.voltage ?? '';
  const changed = String(current) !== formatted;
  const connectionChanged = connection ? String(connection.voltage ?? '') !== formatted : false;
  if (!target.props || typeof target.props !== 'object') target.props = {};
  target.voltage = formatted;
  target.props.voltage = formatted;
  target.props.volts = formatted;
  if (connection) {
    if (!connection.props || typeof connection.props !== 'object') connection.props = {};
    connection.voltage = formatted;
    connection.props.voltage = formatted;
    connection.props.volts = formatted;
  }
  if (changed || connectionChanged) scheduleImplicitHistoryUpdate();
  return changed || connectionChanged;
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

function gatherNeighborEntries(component, byId, inbound) {
  const neighbors = [];
  if (!component || !byId) return neighbors;
  (component.connections || []).forEach(conn => {
    if (!conn || !byId.has(conn.target)) return;
    neighbors.push({ component: byId.get(conn.target), connection: conn });
  });
  const inboundEntries = component?.id ? inbound.get(component.id) : null;
  (inboundEntries || []).forEach(entry => {
    if (!entry || !entry.from) return;
    neighbors.push({ component: entry.from, connection: entry.connection });
  });
  return neighbors;
}

function propagateSourceVoltagesToBuses(comps) {
  if (!Array.isArray(comps) || !comps.length) return;
  const byId = new Map();
  comps.forEach(comp => { if (comp?.id) byId.set(comp.id, comp); });
  if (!byId.size) return;

  const inbound = new Map();
  comps.forEach(comp => {
    (comp?.connections || []).forEach(conn => {
      if (!conn || !conn.target || !byId.has(conn.target)) return;
      if (!inbound.has(conn.target)) inbound.set(conn.target, []);
      inbound.get(conn.target).push({ from: comp, connection: conn });
    });
  });

  comps.forEach(source => {
    if (!isSourceComponent(source)) return;
    let voltageValue = computeComponentOperatingVoltage(source);
    if (!Number.isFinite(voltageValue)) voltageValue = resolveNominalVoltage(source);
    if (!Number.isFinite(voltageValue)) voltageValue = parseVoltageNumber(source?.voltage);
    if (!Number.isFinite(voltageValue)) voltageValue = parseVoltageNumber(source?.props?.voltage || source?.props?.volts);
    if (!Number.isFinite(voltageValue)) return;

    const visited = new Set([source.id]);
    const queue = gatherNeighborEntries(source, byId, inbound);
    while (queue.length) {
      const { component: neighbor, connection } = queue.shift();
      if (!neighbor || visited.has(neighbor.id)) continue;
      visited.add(neighbor.id);
      if (neighbor.type === 'transformer') continue;
      if (isSourceComponent(neighbor)) continue;
      if (isBusComponent(neighbor)) {
        assignInheritedVoltage(neighbor, voltageValue, connection);
      }
      gatherNeighborEntries(neighbor, byId, inbound).forEach(entry => {
        if (!entry.component || visited.has(entry.component.id)) return;
        queue.push(entry);
      });
    }
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
  if (!category || category === 'annotations' || category === 'links') return false;
  if (category === 'cable') {
    return hasImpedance(comp) || hasImpedanceValues(comp?.cable) || hasImpedanceValues(comp?.seriesImpedance);
  }
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

function inferComponentPortBaseKV(comp, portIndex, role = 'source') {
  if (!comp) return null;
  const idx = normalizePortIndex(portIndex);
  let volts = null;
  if (comp.type === 'transformer' && Number.isFinite(idx)) {
    const portVoltage = resolveTransformerVoltageValue(comp, idx);
    const normalized = normalizeVoltageToVolts(portVoltage);
    if (Number.isFinite(normalized) && normalized > 0) {
      volts = normalized;
    }
  }
  if (volts === null) {
    const mockConnection = role === 'target'
      ? { targetPort: idx }
      : { sourcePort: idx };
    const resolved = resolveConnectionVoltageVolts(comp, mockConnection, role);
    if (Number.isFinite(resolved) && resolved > 0) {
      volts = resolved;
    }
  }
  if (volts === null) {
    const componentVoltage = resolveComponentVoltageVolts(comp);
    if (Number.isFinite(componentVoltage) && componentVoltage > 0) {
      volts = componentVoltage;
    }
  }
  if (volts === null) {
    const base = toBaseKV(comp?.baseKV ?? comp?.kV ?? comp?.kv ?? comp?.prefault_voltage);
    return Number.isFinite(base) && base > 0 ? base : null;
  }
  const baseKV = toBaseKV(volts);
  return Number.isFinite(baseKV) && baseKV > 0 ? baseKV : null;
}

function inferBusBaseKV(fromComp, fromPort, toComp, toPort) {
  const candidates = [];
  const fromBase = inferComponentPortBaseKV(fromComp, fromPort, 'source');
  if (Number.isFinite(fromBase) && fromBase > 0) candidates.push(fromBase);
  const toBase = inferComponentPortBaseKV(toComp, toPort, 'target');
  if (Number.isFinite(toBase) && toBase > 0) candidates.push(toBase);
  if (!candidates.length) return null;
  return candidates.find(kv => kv >= 0.001) ?? candidates[0];
}

function applyBusBaseKV(bus, baseKV) {
  if (!bus || !Number.isFinite(baseKV) || baseKV <= 0) return;
  const kv = Number(baseKV.toFixed(6));
  const volts = Number((kv * 1000).toFixed(3));
  bus.baseKV = kv;
  bus.kV = kv;
  bus.kv = kv;
  bus.prefault_voltage = kv;
  bus.voltage = kv;
  bus.volts = volts;
  if (!bus.props || typeof bus.props !== 'object') bus.props = {};
  bus.props.baseKV = kv;
  bus.props.kV = kv;
  bus.props.volts = volts;
  bus.props.prefault_voltage = kv;
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
  if (linkedBus && (isBusComponent(fromComp) || isBusComponent(toComp))) {
    const busComp = isBusComponent(fromComp) ? fromComp : toComp;
    const otherComp = busComp === fromComp ? toComp : fromComp;
    const linkedToBus = componentsAreLinked(linkedBus, busComp);
    const linkedToOther = componentsAreLinked(linkedBus, otherComp);
    if (linkedToBus && linkedToOther) {
      // Only reroute through an intermediate bus when it already links both components.
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
    const inferredKV = inferBusBaseKV(fromComp, fromIdx, toComp, toIdx);
    if (Number.isFinite(inferredKV) && inferredKV > 0) {
      applyBusBaseKV(bus, inferredKV);
    }
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

function updateCableOperatingVoltages(comps = components) {
  if (!Array.isArray(comps)) return;
  const byId = new Map();
  comps.forEach(comp => {
    if (comp && comp.id) byId.set(comp.id, comp);
  });
  comps.forEach(comp => {
    if (!comp || comp.type !== 'cable') return;
    if (!comp.cable || typeof comp.cable !== 'object') comp.cable = {};
    const upstream = findSourceComponent(comp.id, comps);
    const outbound = (comp.connections || []).find(conn => conn && conn.target);
    const downstream = outbound ? byId.get(outbound.target) || null : null;
    const candidates = [
      computeComponentOperatingVoltage(comp),
      computeComponentOperatingVoltage(upstream),
      computeComponentOperatingVoltage(downstream)
    ].filter(value => value !== null);
    if (!candidates.length) return;
    const resolved = Number(candidates[0]);
    if (!Number.isFinite(resolved)) return;
    const rounded = Number(resolved.toFixed(2));
    comp.cable.operating_voltage = rounded;
    if (outbound) {
      if (!outbound.cable || typeof outbound.cable !== 'object') outbound.cable = {};
      outbound.cable.operating_voltage = rounded;
    }
  });
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
    const meta = componentMeta[nc.subtype] || {};
    const fallbackWidth = Number.isFinite(Number(meta.width)) ? Number(meta.width) : compWidth;
    const fallbackHeight = Number.isFinite(Number(meta.height)) ? Number(meta.height) : compHeight;
    nc.width = Number(nc.width) || fallbackWidth;
    nc.height = Number(nc.height) || fallbackHeight;
    ensureShapeDefaults(nc);
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

function computeDragConnections(selectedComponents) {
  if (!Array.isArray(selectedComponents) || !selectedComponents.length) {
    return [];
  }
  const incomingMap = new Map();
  components.forEach(source => {
    (source.connections || []).forEach(conn => {
      if (!incomingMap.has(conn.target)) incomingMap.set(conn.target, []);
      incomingMap.get(conn.target).push({ source, conn });
    });
  });
  const seen = new Set();
  const records = [];
  const addRecord = (sourceComp, conn) => {
    if (!conn || seen.has(conn)) return;
    if (conn.dir !== 'h' && conn.dir !== 'v') return;
    const targetComp = components.find(c => c.id === conn.target);
    if (!targetComp) return;
    const startPos = portPosition(sourceComp, conn.sourcePort);
    const endPos = portPosition(targetComp, conn.targetPort);
    if (!startPos || !endPos) return;
    const baseMid = Number.isFinite(conn.mid)
      ? conn.mid
      : conn.dir === 'h'
        ? (startPos.x + endPos.x) / 2
        : (startPos.y + endPos.y) / 2;
    const baseAvg = conn.dir === 'h'
      ? (startPos.x + endPos.x) / 2
      : (startPos.y + endPos.y) / 2;
    const offset = Number.isFinite(baseMid) && Number.isFinite(baseAvg)
      ? baseMid - baseAvg
      : 0;
    seen.add(conn);
    records.push({
      conn,
      dir: conn.dir,
      source: sourceComp,
      target: targetComp,
      offset
    });
  };
  selectedComponents.forEach(comp => {
    (comp.connections || []).forEach(conn => addRecord(comp, conn));
    (incomingMap.get(comp.id) || []).forEach(entry => addRecord(entry.source, entry.conn));
  });
  return records;
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
  propagateSourceVoltagesToBuses(components);
  const svg = document.getElementById('diagram');
  svg.querySelectorAll('g.component, .connection, .conn-label, .port, .bus-handle, .annotation-handle, .issue-badge, .component-label, .component-attribute, .selection-marquee, .transformer-port-label').forEach(el => el.remove());
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
      const initialMid = (start.x + end.x) / 2;
      let midX = initialMid;
      for (let attempts = 0; attempts < MAX_ROUTE_ADJUST_STEPS; attempts++) {
        let moved = false;
        components.forEach(comp => {
          if (comp === src || comp === tgt) return;
          const rect = { x: comp.x, y: comp.y, w: comp.width || compWidth, h: comp.height || compHeight };
          if (
            rect.x <= midX && midX <= rect.x + rect.w &&
            Math.min(start.y, end.y) <= rect.y + rect.h &&
            Math.max(start.y, end.y) >= rect.y
          ) {
            midX = midX < rect.x + rect.w / 2 ? rect.x - 10 : rect.x + rect.w + 10;
            moved = true;
          }
          if (
            start.y >= rect.y && start.y <= rect.y + rect.h &&
            Math.min(start.x, midX) <= rect.x + rect.w &&
            Math.max(start.x, midX) >= rect.x
          ) {
            midX = midX < rect.x ? rect.x - 10 : rect.x + rect.w + 10;
            moved = true;
          }
          if (
            end.y >= rect.y && end.y <= rect.y + rect.h &&
            Math.min(end.x, midX) <= rect.x + rect.w &&
            Math.max(end.x, midX) >= rect.x
          ) {
            midX = midX < rect.x ? rect.x - 10 : rect.x + rect.w + 10;
            moved = true;
          }
        });
        if (moved === false) break;
      }
      if (Number.isFinite(midX) === false) midX = initialMid;
      if (diagramViewport && Number.isFinite(diagramViewport.minX) && Number.isFinite(diagramViewport.width)) {
        const min = diagramViewport.minX;
        const max = diagramViewport.minX + diagramViewport.width;
        midX = Math.min(Math.max(midX, min), max);
      }
      return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
    }

    function verticalFirst() {
      const initialMid = (start.y + end.y) / 2;
      let midY = initialMid;
      for (let attempts = 0; attempts < MAX_ROUTE_ADJUST_STEPS; attempts++) {
        let moved = false;
        components.forEach(comp => {
          if (comp === src || comp === tgt) return;
          const rect = { x: comp.x, y: comp.y, w: comp.width || compWidth, h: comp.height || compHeight };
          if (
            rect.y <= midY && midY <= rect.y + rect.h &&
            Math.min(start.x, end.x) <= rect.x + rect.w &&
            Math.max(start.x, end.x) >= rect.x
          ) {
            midY = midY < rect.y + rect.h / 2 ? rect.y - 10 : rect.y + rect.h + 10;
            moved = true;
          }
          if (
            start.x >= rect.x && start.x <= rect.x + rect.w &&
            Math.min(start.y, midY) <= rect.y + rect.h &&
            Math.max(start.y, midY) >= rect.y
          ) {
            midY = midY < rect.y ? rect.y - 10 : rect.y + rect.h + 10;
            moved = true;
          }
          if (
            end.x >= rect.x && end.x <= rect.x + rect.w &&
            Math.min(end.y, midY) <= rect.y + rect.h &&
            Math.max(end.y, midY) >= rect.y
          ) {
            midY = midY < rect.y ? rect.y - 10 : rect.y + rect.h + 10;
            moved = true;
          }
        });
        if (moved === false) break;
      }
      if (Number.isFinite(midY) === false) midY = initialMid;
      if (diagramViewport && Number.isFinite(diagramViewport.minY) && Number.isFinite(diagramViewport.height)) {
        const min = diagramViewport.minY;
        const max = diagramViewport.minY + diagramViewport.height;
        midY = Math.min(Math.max(midY, min), max);
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
      if (c.subtype === 'motor_load' || c.subtype === 'static_load') {
        const rotation = normalizeRotation(Number(c.rotation) || 0);
        const desired = 90;
        const offset = desired - rotation;
        if (offset % 360 !== 0) {
          bg.setAttribute('transform', `rotate(${offset}, ${cx}, ${cy})`);
        }
      }
      g.appendChild(bg);
    }
    const meta = componentMeta[c.subtype] || {};
    if (c.type === 'annotation') {
      if (c.subtype === 'annotation_text_box') {
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
        if (c.subtype === 'annotation_custom_shape') ensureShapeDefaults(c);
        const shapeType = (c.shapeType || 'rectangle').toLowerCase();
        const strokeStyle = (c.strokeStyle || 'solid').toLowerCase();
        const strokeColor = c.strokeColor || '#333';
        const fillColor = c.fillColor && c.fillColor !== 'none' && c.fillColor !== 'transparent'
          ? c.fillColor
          : 'none';
        const fillOpacity = Number.isFinite(Number(c.fillOpacity))
          ? Math.max(0, Math.min(1, Number(c.fillOpacity)))
          : 1;
        const strokeWidth = Number(c.strokeWidth) || 1;
        const dash = shapeDashPatterns[strokeStyle] || '';
        let shape;
        if (shapeType === 'circle') {
          const ellipse = document.createElementNS(svgNS, 'ellipse');
          ellipse.setAttribute('cx', c.x + w / 2);
          ellipse.setAttribute('cy', c.y + h / 2);
          ellipse.setAttribute('rx', w / 2);
          ellipse.setAttribute('ry', h / 2);
          shape = ellipse;
        } else {
          const rect = document.createElementNS(svgNS, 'rect');
          rect.setAttribute('x', c.x);
          rect.setAttribute('y', c.y);
          rect.setAttribute('width', w);
          rect.setAttribute('height', h);
          if (shapeType === 'rounded' && Number.isFinite(Number(c.cornerRadius))) {
            const radius = Math.max(0, Math.min(Number(c.cornerRadius), Math.min(w, h) / 2));
            rect.setAttribute('rx', radius);
            rect.setAttribute('ry', radius);
          }
          shape = rect;
        }
        shape.setAttribute('fill', fillColor);
        shape.setAttribute('fill-opacity', fillColor === 'none' ? 0 : fillOpacity);
        shape.setAttribute('stroke', strokeColor);
        shape.setAttribute('stroke-width', strokeWidth);
        if (dash) shape.setAttribute('stroke-dasharray', dash);
        if (strokeStyle === 'dotted') {
          shape.setAttribute('stroke-linecap', 'round');
        }
        g.appendChild(shape);
      }
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
      if (c.type === 'transformer') {
        const ports = c.ports || componentMeta[c.subtype]?.ports || [];
        ports.forEach((_, portIdx) => {
          const labelText = buildTransformerPortLabel(c, portIdx);
          if (!labelText) return;
          const pos = portPosition(c, portIdx);
          if (!pos) return;
          const dir = portDirection(c, portIdx) || 'top';
          let x = pos.x;
          let y = pos.y;
          let anchor = 'middle';
          let baseline = 'middle';
          if (dir === 'left') {
            x -= 6;
            anchor = 'end';
          } else if (dir === 'right') {
            x += 6;
            anchor = 'start';
          } else if (dir === 'bottom') {
            y += 10;
            baseline = 'hanging';
          } else {
            y -= 6;
            baseline = 'baseline';
          }
          const textEl = document.createElementNS(svgNS, 'text');
          textEl.classList.add('transformer-port-label');
          textEl.dataset.componentId = c.id;
          textEl.setAttribute('x', x);
          textEl.setAttribute('y', y);
          textEl.setAttribute('text-anchor', anchor);
          textEl.setAttribute('dominant-baseline', baseline);
          textEl.textContent = labelText;
          svg.appendChild(textEl);
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
  needsInitialViewportCenter = true;
  pendingInitialCenter = null;
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

function getStaticViewportCenter() {
  return {
    x: STATIC_VIEWPORT_BOUNDS.minX + STATIC_VIEWPORT_BOUNDS.width / 2,
    y: STATIC_VIEWPORT_BOUNDS.minY + STATIC_VIEWPORT_BOUNDS.height / 2
  };
}

function getDefaultInsertionPoint() {
  if (cursorPosValid && Number.isFinite(cursorPos.x) && Number.isFinite(cursorPos.y)) {
    return { x: cursorPos.x, y: cursorPos.y };
  }
  const center = getViewportCenter();
  if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) {
    return center;
  }
  return getStaticViewportCenter();
}

function addComponent(cfg) {
  let subtype;
  let type;
  let explicitX;
  let explicitY;
  let skipHistory = false;
  let placeAtCenter = false;
  if (typeof cfg === 'string') {
    subtype = cfg;
    type = componentMeta[subtype]?.category;
  } else if (cfg && typeof cfg === 'object') {
    subtype = cfg.subtype;
    type = cfg.type || componentMeta[cfg.subtype]?.type || componentMeta[cfg.subtype]?.category;
    if (cfg.x !== undefined) explicitX = cfg.x;
    if (cfg.y !== undefined) explicitY = cfg.y;
    skipHistory = !!cfg.skipHistory;
    placeAtCenter = cfg.placeAtViewportCenter === true;
  } else {
    return;
  }
  const insertionPoint = placeAtCenter ? (getViewportCenter() || getStaticViewportCenter()) : getDefaultInsertionPoint();
  let x = explicitX !== undefined ? explicitX : insertionPoint.x;
  let y = explicitY !== undefined ? explicitY : insertionPoint.y;
  if (Number.isFinite(x) === false || Number.isFinite(y) === false) {
    const fallback = getStaticViewportCenter();
    if (Number.isFinite(x) === false) x = fallback.x;
    if (Number.isFinite(y) === false) y = fallback.y;
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
  ensureShapeDefaults(comp);
  if (comp.type === 'transformer') {
    syncTransformerDefaults(comp, { forceBase: true });
  }
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
  const nodeComponents = buildVirtualNodeEntries(components, connections);
  const baseComponents = [...components];
  const deviceComponents = [...baseComponents, ...nodeComponents];
  if (!deviceComponents.length) return;

  const findDeviceById = id => deviceComponents.find(item => item.id === id) || null;
  let activeComponent = null;
  if (typeof compOrId === 'string' && compOrId) {
    activeComponent = findDeviceById(compOrId);
  } else if (compOrId && typeof compOrId === 'object') {
    if (compOrId.isVirtualNode) {
      activeComponent = findDeviceById(compOrId.id);
    } else {
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
  const applyPendingChanges = () => {
    if (typeof modal._applyChanges === 'function') {
      modal._applyChanges();
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
          applyPendingChanges();
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
        applyPendingChanges();
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

  function closeModal(opts) {
    let shouldApply = false;
    if (opts && typeof opts === 'object' && Object.prototype.hasOwnProperty.call(opts, 'applyChanges')) {
      shouldApply = !!opts.applyChanges;
    }
    if (shouldApply && typeof modal._applyChanges === 'function') {
      modal._applyChanges();
    }
    modal.classList.remove('show');
    modal.removeEventListener('click', outsideHandler);
    if (modal._pointerDownHandler) {
      modal.removeEventListener('pointerdown', modal._pointerDownHandler);
    }
    document.removeEventListener('keydown', keyHandler);
    delete modal._outsideHandler;
    delete modal._keyHandler;
    delete modal._applyChanges;
    delete modal._pointerDownHandler;
    delete modal._pointerDownOnOverlay;
    selected = null;
    selection = [];
    selectedConnection = null;
  }

  const outsideHandler = e => {
    if (e.target === modal && modal._pointerDownOnOverlay) {
      closeModal({ applyChanges: true });
    }
    modal._pointerDownOnOverlay = false;
  };
  const keyHandler = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  };
  const pointerDownHandler = e => {
    modal._pointerDownOnOverlay = e.target === modal;
  };

  function renderPropertiesFor(targetComp) {
    propertyContainer.innerHTML = '';
    modal._applyChanges = null;
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

    if (targetComp.type === 'cable' && (!targetComp.cable || typeof targetComp.cable !== 'object')) {
      targetComp.cable = {};
    }

    propertyHeading.textContent = `${getComponentListLabel(targetComp)} Properties`;

    const isMotorComponent = targetComp.subtype === 'motor_load';
    const isStaticLoadComponent = targetComp.subtype === 'static_load';
    const isTransformerComponent = targetComp.type === 'transformer';
    const isSourceCategoryComponent = isSourceComponent(targetComp);
    const motorInputMap = new Map();
    const staticInputMap = isStaticLoadComponent ? new Map() : null;
    const transformerInputMap = isTransformerComponent ? new Map() : null;
    const transformerCustomBadges = isTransformerComponent ? new Map() : null;
    const sourceInputMap = isSourceCategoryComponent ? new Map() : null;
    const sourceCustomBadges = isSourceCategoryComponent ? new Map() : null;
    const motorCalculatedFields = new Set([
      'load_kw',
      'load_kvar',
      'impedance_r',
      'impedance_x',
      'thevenin_r',
      'thevenin_x'
    ]);
    const staticCalculatedFields = isStaticLoadComponent
      ? new Set(['load_kw', 'load_kvar', 'baseKV', 'kV', 'kv', 'prefault_voltage'])
      : null;
    const staticManualFields = isStaticLoadComponent
      ? new Set(['watts', 'kva', 'pf', 'power_factor', 'volts', 'voltage'])
      : null;
    const transformerCalculatedFields = new Set(['impedance_r', 'impedance_x']);
    const transformerAutoFieldNames = new Set(['baseKV', 'kV', 'kv', 'prefault_voltage']);
    const sourceCalculatedFields = new Set(['thevenin_mva']);
    const sourceAutoFieldNames = new Set(['baseKV', 'kV', 'kv', 'prefault_voltage']);

    const parseNumericValue = raw => {
      if (raw === null || raw === undefined) return null;
      if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
      const text = String(raw).trim();
      if (!text) return null;
      const match = text.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
      if (!match) return null;
      const num = Number.parseFloat(match[0]);
      return Number.isFinite(num) ? num : null;
    };

    const readComponentValue = name => {
      if (!name) return null;
      if (targetComp && Object.prototype.hasOwnProperty.call(targetComp, name)) {
        const direct = targetComp[name];
        if (direct !== undefined && direct !== null && direct !== '') return direct;
      }
      if (targetComp?.props && Object.prototype.hasOwnProperty.call(targetComp.props, name)) {
        const propVal = targetComp.props[name];
        if (propVal !== undefined && propVal !== null && propVal !== '') return propVal;
      }
      return null;
    };

    const formatNumber = (val, decimals = 3) => {
      if (!Number.isFinite(val)) return '';
      const factor = 10 ** decimals;
      const rounded = Math.round(val * factor) / factor;
      let text = rounded.toFixed(decimals);
      text = text.replace(/\.0+$/, '');
      text = text.replace(/(\.[0-9]*[1-9])0+$/, '$1');
      return text;
    };

    let rawSchema = propSchemas[targetComp.subtype] || [];
    if (!rawSchema.length) {
      const metaProps = componentMeta[targetComp.subtype]?.props || {};
      rawSchema = inferSchemaFromProps({ ...metaProps, ...(targetComp.props || {}) });
    }

    const motorHorsepowerIndicators = new Set(['hp', 'horsepower', 'rating']);
    const rawSchemaFieldNames = new Set(
      rawSchema
        .map(field => field && field.name)
        .filter(name => typeof name === 'string' && name)
    );
    const hasMotorHorsepowerIndicator = [...motorHorsepowerIndicators].some(name =>
      rawSchemaFieldNames.has(name)
    );
    const shouldApplyMotorDerivations =
      isMotorComponent
      || hasMotorHorsepowerIndicator;

    const generalLabelOverrides = {
      hp: 'Horsepower',
      pf: 'Power Factor',
      service_factor: 'Service Factor',
      inrushMultiple: 'Inrush Multiple (× FLA)',
      thevenin_r: 'Thevenin R (Ω)',
      thevenin_x: 'Thevenin X (Ω)',
      inertia: 'Inertia (kg·m²)',
      load_torque_curve: 'Load Torque Curve (speed%:torque%)',
      primary_connection: 'Primary Connection',
      secondary_connection: 'Secondary Connection',
      tertiary_connection: 'Tertiary Connection',
      source_voltage_base: {
        label: 'Source Voltage (kV)',
        help: 'Defines system base voltage. Reference point of system.'
      },
      short_circuit_capacity: {
        label: 'Short Circuit Capacity (MVA or kA)',
        help: 'Defines source strength. Used for fault calc.'
      },
      source_impedance: {
        label: 'Source Impedance (R + jX)',
        help: 'Sets Thevenin equivalent. Core short circuit input.',
        placeholder: '0.01 + j0.08'
      },
      sequence_impedances: {
        label: 'Sequence Impedances (Z1,Z2,Z0)',
        help: 'For asymmetrical faults. Required for detailed calc.',
        placeholder: 'Z1=, Z2=, Z0='
      },
      frequency_hz: {
        label: 'Frequency (Hz)',
        help: 'System operating frequency. Usually 50 or 60 Hz.'
      },
      grounding: {
        label: 'Grounding Type (solid, resistive)',
        help: 'Defines earth fault characteristics. Important for grounding model.'
      },
      voltage_regulation_percent: {
        label: 'Voltage Regulation (%)',
        help: 'Defines source voltage control range. Used for load flow.'
      },
      phase_angle: {
        label: 'Phase Angle',
        help: 'Reference for system phase. Used for synchronization.'
      },
      max_mw_delivery: {
        label: 'Max MW Delivery',
        help: 'For power flow limit modeling. Defines source constraint.'
      },
      losses_r_percent: {
        label: 'Losses (R%)',
        help: 'For performance modeling. Used for efficiency calc.'
      },
      stability_response: {
        label: 'Stability Response',
        help: 'Used in dynamic studies. Defines voltage recovery.'
      },
      transformer_impedance: {
        label: 'Transformer Impedance (if substation integrated)',
        help: 'Defines interface strength. For network modeling.'
      },
      operating_mode: {
        label: 'Operating Mode (infinite bus, finite grid)',
        help: 'Determines model behavior. Impacts fault current.'
      },
      short_circuit_duration_cycles: {
        label: 'Short Circuit Duration (cycles)',
        help: 'For thermal withstand calc. Time-dependent modeling.'
      }
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
        if (
          targetComp.type === 'transformer'
          && ['primary_connection', 'secondary_connection', 'tertiary_connection'].includes(f.name)
        ) {
          return { ...f, type: 'select', options: transformerConnectionOptions };
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
      });

    schema = schema.map(f => {
      const next = { ...f };
      if (next.name.startsWith('cable_')) {
        const key = next.name.replace(/^cable_/, '');
        const meta = cablePropertyMetadata[key];
        if (meta) {
          if (meta.label) next.label = meta.label;
          if (meta.type) next.type = meta.type;
          if (meta.help) next.help = meta.help;
        }
      } else if (generalLabelOverrides[next.name]) {
        const override = generalLabelOverrides[next.name];
        if (typeof override === 'string') {
          next.label = override;
        } else if (override && typeof override === 'object') {
          if (override.label) next.label = override.label;
          if (override.type) next.type = override.type;
          if (override.options) next.options = override.options;
          if (override.placeholder) next.placeholder = override.placeholder;
          if (override.help) next.help = override.help;
        }
      }
      return next;
    });

    if (targetComp.type === 'cable') {
      schema = schema.filter(f => !['cable_cable_rating', 'cable_impedance_r', 'cable_impedance_x'].includes(f.name));
    }

    if (targetComp.subtype === 'motor_load') {
      schema = schema.filter(
        f => !['conductor_type', 'cable_assembly', 'breaker_frame', 'conductor_assembly', 'gap'].includes(f.name)
      );
    }

    let baseFields;
    if (targetComp.type === 'cable') {
      baseFields = [
        { name: 'label', label: 'Label', type: 'text' },
        { name: 'ref', label: 'Ref ID', type: 'text' },
        {
          name: 'cable_rating',
          label: 'Cable Rating (V)',
          type: 'number',
          getValue: comp => comp.cable?.cable_rating ?? '',
          setValue: (comp, rawValue) => {
            if (!comp.cable || typeof comp.cable !== 'object') comp.cable = {};
            const trimmed = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
            if (trimmed === '' || trimmed === null || trimmed === undefined) {
              delete comp.cable.cable_rating;
              return;
            }
            const num = Number(trimmed);
            comp.cable.cable_rating = Number.isFinite(num) ? num : trimmed;
          }
        },
        {
          name: 'cable_impedance_r',
          label: 'Impedance R (Ω)',
          type: 'number',
          getValue: comp => getImpedancePart(comp.cable, 'r'),
          setValue: (comp, value) => {
            if (!comp.cable || typeof comp.cable !== 'object') comp.cable = {};
            setImpedancePart(comp.cable, 'r', value, { keepEmpty: false });
          }
        },
        {
          name: 'cable_impedance_x',
          label: 'Impedance X (Ω)',
          type: 'number',
          getValue: comp => getImpedancePart(comp.cable, 'x'),
          setValue: (comp, value) => {
            if (!comp.cable || typeof comp.cable !== 'object') comp.cable = {};
            setImpedancePart(comp.cable, 'x', value, { keepEmpty: false });
          }
        }
      ];
    } else if (targetComp.type === 'annotation') {
      const isShapeAnnotation = targetComp.subtype === 'annotation_custom_shape';
      baseFields = [
        { name: 'label', label: 'Label', type: 'text' },
        {
          name: 'width',
          label: 'Width (px)',
          type: 'number',
          help: isShapeAnnotation ? 'For circles width controls the diameter.' : undefined
        },
        {
          name: 'height',
          label: 'Height (px)',
          type: 'number',
          help: isShapeAnnotation ? 'Circles keep height equal to width.' : undefined
        }
      ];
      if (isShapeAnnotation) {
        baseFields.push(
          {
            name: 'shapeType',
            label: 'Shape Type',
            type: 'select',
            options: [
              { value: 'rectangle', label: 'Rectangle' },
              { value: 'rounded', label: 'Rounded Rectangle' },
              { value: 'circle', label: 'Circle' }
            ]
          },
          {
            name: 'strokeStyle',
            label: 'Line Style',
            type: 'select',
            options: [
              { value: 'solid', label: 'Solid' },
              { value: 'dashed', label: 'Dashed' },
              { value: 'dotted', label: 'Dotted' }
            ]
          },
          {
            name: 'strokeWidth',
            label: 'Line Weight',
            type: 'number'
          },
          {
            name: 'strokeColor',
            label: 'Line Color',
            type: 'color'
          },
          {
            name: 'fillColor',
            label: 'Fill Color',
            type: 'color',
            getValue: comp => {
              const raw = comp.fillColor || comp.props?.fillColor || defaultShapeProps.fillColor;
              return raw && raw !== 'none' ? raw : defaultShapeProps.fillColor;
            }
          },
          {
            name: 'fillOpacity',
            label: 'Fill Opacity',
            type: 'number',
            help: '0 = transparent, 1 = opaque.',
            min: 0,
            max: 1,
            step: 0.05,
            getValue: comp => {
              const value = comp.fillOpacity ?? comp.props?.fillOpacity ?? defaultShapeProps.fillOpacity;
              const numeric = Number(value);
              if (Number.isFinite(numeric)) return numeric;
              const fallback = Number(defaultShapeProps.fillOpacity);
              return Number.isFinite(fallback) ? fallback : 1;
            }
          },
          {
            name: 'cornerRadius',
            label: 'Corner Radius',
            type: 'number',
            help: 'Applied to rounded rectangles.'
          }
        );
      }
    } else {
      baseFields = [
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
    }

    let manufacturerInput = null;
    let modelInput = null;
    let tccInput = null;

    const form = document.createElement('form');
    form.id = 'prop-form';
    form.className = 'prop-detail-form';
    let hasApplied = false;

    const buildField = (f, container) => {
      const lbl = document.createElement('label');
      const labelHeader = document.createElement('span');
      labelHeader.className = 'prop-field-label';
      labelHeader.textContent = f.label;
      let input;
      const defVal = manufacturerDefaults[targetComp.subtype]?.[f.name] || '';
      let curVal;
      if (typeof f.getValue === 'function') {
        curVal = f.getValue(targetComp);
      } else if (targetComp[f.name] !== undefined && targetComp[f.name] !== '') {
        curVal = targetComp[f.name];
      } else if (
        targetComp.props
        && typeof targetComp.props === 'object'
        && Object.prototype.hasOwnProperty.call(targetComp.props, f.name)
        && targetComp.props[f.name] !== ''
      ) {
        curVal = targetComp.props[f.name];
      } else {
        curVal = defVal;
      }
      if (f.type === 'select') {
        input = document.createElement('select');
        (f.options || []).forEach(opt => {
          const optionValue = typeof opt === 'object' ? opt.value ?? opt.label ?? '' : opt;
          const optionLabel = typeof opt === 'object' ? opt.label ?? opt.value ?? '' : opt;
          const o = document.createElement('option');
          o.value = optionValue;
          o.textContent = optionLabel;
          if ((curVal ?? '') == optionValue) o.selected = true;
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
        if (f.type === 'number') {
          input.step = f.step !== undefined ? String(f.step) : 'any';
          if (f.min !== undefined) input.min = String(f.min);
          if (f.max !== undefined) input.max = String(f.max);
        }
        input.value = curVal ?? '';
      }
      input.name = f.name;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.name === 'manufacturer') manufacturerInput = input;
      if (f.name === 'model') modelInput = input;
      if (f.name === 'tccId') tccInput = input;
      if (shouldApplyMotorDerivations) {
        motorInputMap.set(f.name, input);
      }
      if (isStaticLoadComponent && staticInputMap) {
        staticInputMap.set(f.name, input);
      }
      if (isTransformerComponent && transformerInputMap) {
        transformerInputMap.set(f.name, input);
      }
      if (isSourceCategoryComponent && sourceInputMap) {
        sourceInputMap.set(f.name, input);
      }
      const isMotorCalculatedField = shouldApplyMotorDerivations && motorCalculatedFields.has(f.name);
      const isStaticCalculatedField = isStaticLoadComponent && staticCalculatedFields?.has(f.name);
      const isTransformerCalculatedField = isTransformerComponent && transformerCalculatedFields.has(f.name);
      const isSourceCalculatedField = isSourceCategoryComponent && sourceCalculatedFields.has(f.name);
      const isStaticManualField = isStaticLoadComponent && staticManualFields?.has(f.name);
      if (isStaticManualField) {
        const badge = document.createElement('span');
        badge.className = 'prop-field-badge prop-field-badge-manual';
        badge.textContent = 'Input';
        labelHeader.appendChild(badge);
      }
      if (isMotorCalculatedField || isStaticCalculatedField || isTransformerCalculatedField || isSourceCalculatedField) {
        lbl.classList.add('prop-field-calculated');
        input.classList.add('prop-input-calculated');
        input.readOnly = true;
        input.setAttribute('aria-readonly', 'true');
        const badge = document.createElement('span');
        badge.className = 'prop-field-badge prop-field-badge-calculated';
        badge.textContent = 'Calculated';
        labelHeader.appendChild(badge);
      }
      if (isTransformerComponent && transformerAutoFieldNames.has(f.name) && transformerCustomBadges) {
        const customBadge = document.createElement('span');
        customBadge.className = 'prop-field-badge prop-field-badge-custom';
        customBadge.textContent = 'Custom';
        customBadge.hidden = true;
        labelHeader.appendChild(customBadge);
        transformerCustomBadges.set(f.name, { badge: customBadge, input });
      }
      if (isSourceCategoryComponent && sourceAutoFieldNames.has(f.name) && sourceCustomBadges) {
        const customBadge = document.createElement('span');
        customBadge.className = 'prop-field-badge prop-field-badge-custom';
        customBadge.textContent = 'Custom';
        customBadge.hidden = true;
        labelHeader.appendChild(customBadge);
        sourceCustomBadges.set(f.name, { badge: customBadge, input });
      }
      if (f.help) {
        const helpBtn = document.createElement('button');
        helpBtn.type = 'button';
        helpBtn.className = 'prop-help-btn';
        helpBtn.title = f.help;
        helpBtn.setAttribute('aria-label', f.help);
        helpBtn.textContent = '?';
        labelHeader.appendChild(helpBtn);
      }
      lbl.appendChild(labelHeader);
      lbl.appendChild(input);
      container.appendChild(lbl);
    };

    const applyFieldFromForm = (target, field, formData) => {
      const hasPropKey = !!(
        target
        && target.props
        && typeof target.props === 'object'
        && Object.prototype.hasOwnProperty.call(target.props, field.name)
      );
      if (field.type === 'checkbox') {
        const checked = formData.get(field.name) === 'on';
        if (typeof field.setValue === 'function') field.setValue(target, checked);
        else target[field.name] = checked;
        if (hasPropKey) target.props[field.name] = checked;
        return;
      }
      const raw = formData.get(field.name);
      const value = raw === null ? '' : raw;
      if (typeof field.setValue === 'function') {
        field.setValue(target, value);
        if (hasPropKey) {
          target.props[field.name] = field.type === 'number' && value ? parseFloat(value) : value || '';
        }
        return;
      }
      if (field.type === 'number') {
        const numVal = value ? parseFloat(value) : '';
        target[field.name] = numVal;
        if (hasPropKey) target.props[field.name] = numVal;
      } else {
        const textVal = value || '';
        target[field.name] = textVal;
        if (hasPropKey) target.props[field.name] = textVal;
      }
    };

    let fields = [...baseFields, ...schema];
    const seenFieldNames = new Set();
    fields = fields.filter(field => {
      if (!field || !field.name) return true;
      if (seenFieldNames.has(field.name)) return false;
      seenFieldNames.add(field.name);
      return true;
    });
    if (targetComp.subtype === 'motor_load') {
      fields = fields.filter(
        f => !['conductor_type', 'cable_assembly', 'breaker_frame', 'conductor_assembly'].includes(f.name)
      );
    }

    const shouldShowTccField = targetComp.type !== 'cable' && isProtectionComponent(targetComp);

    if (shouldShowTccField) {
      const tccOptions = [
        { value: '', label: '--Select Device--' },
        ...protectiveDevices.map(dev => ({ value: dev.id, label: dev.name }))
      ];
      fields.push({
        name: 'tccId',
        label: 'TCC Device',
        type: 'select',
        options: tccOptions,
        getValue: comp => comp.tccId || '',
        setValue: (comp, value) => {
          comp.tccId = value || '';
        }
      });
    }

    const hasTccField = fields.some(f => f.name === 'tccId');

    const applyChanges = () => {
      if (hasApplied) return;
      hasApplied = true;
      const fd = new FormData(form);
      fields.forEach(f => {
        applyFieldFromForm(targetComp, f, fd);
      });
      ensureShapeDefaults(targetComp);
      if (hasTccField) {
        targetComp.tccId = fd.get('tccId') || '';
      }
      pushHistory();
      render();
      save();
      syncSchedules();
    };
    modal._applyChanges = applyChanges;

    const baseFieldNames = new Set(baseFields.map(f => f.name));
    const manufacturerFields = [];
    const noteFields = [];
    const electricalFields = [];
    const motorStartFields = [];
    const physicalFields = [];
    const generalFields = [];
    const motorStartFieldNames = ['inrushMultiple', 'thevenin_r', 'thevenin_x', 'inertia', 'load_torque_curve'];
    fields.forEach(f => {
      if (targetComp.subtype === 'motor_load' && motorStartFieldNames.includes(f.name)) {
        motorStartFields.push(f);
      } else if (impedanceFieldNameSet.has(f.name)) {
        electricalFields.push(f);
      } else if (isPhysicalPropertyField(f)) {
        physicalFields.push(f);
      } else if (['manufacturer', 'model'].includes(f.name)) manufacturerFields.push(f);
      else if (['notes', 'failure_modes'].includes(f.name)) noteFields.push(f);
      else if (baseFieldNames.has(f.name) || f.name === 'tccId') generalFields.push(f);
      else electricalFields.push(f);
    });

    const moveMotorCalculatedToEnd = fieldArr => {
      if (!shouldApplyMotorDerivations || !Array.isArray(fieldArr) || !fieldArr.length) return fieldArr;
      const nonCalculated = [];
      const calculated = [];
      fieldArr.forEach(field => {
        if (motorCalculatedFields.has(field.name)) calculated.push(field);
        else nonCalculated.push(field);
      });
      fieldArr.length = 0;
      fieldArr.push(...nonCalculated, ...calculated);
      return fieldArr;
    };

    [generalFields, electricalFields, physicalFields, motorStartFields].forEach(moveMotorCalculatedToEnd);

    const createFieldset = (legendText, fieldArr) => {
      const fs = document.createElement('fieldset');
      if (legendText) {
        const legend = document.createElement('legend');
        legend.textContent = legendText;
        fs.appendChild(legend);
      }
      fieldArr.forEach(field => buildField(field, fs));
      return fs;
    };

    const tabList = document.createElement('div');
    tabList.className = 'prop-tabs';
    tabList.setAttribute('role', 'tablist');
    form.appendChild(tabList);

    const tabPanels = document.createElement('div');
    tabPanels.className = 'prop-tab-panels';
    form.appendChild(tabPanels);

    const tabs = [];
    const tabMap = new Map();

    const activateTab = id => {
      tabs.forEach(tab => {
        const isSelected = tab.id === id;
        tab.button.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        tab.button.tabIndex = isSelected ? 0 : -1;
        tab.panel.hidden = !isSelected;
      });
    };

    const focusTabAt = index => {
      if (!tabs.length) return;
      const normalized = ((index % tabs.length) + tabs.length) % tabs.length;
      const tab = tabs[normalized];
      activateTab(tab.id);
      tab.button.focus();
    };

    const createTabSection = (id, label, legendText, fieldArr, options = {}) => {
      const hasFields = Array.isArray(fieldArr) && fieldArr.length > 0;
      if (!options.force && !hasFields) return null;
      const tabButton = document.createElement('button');
      tabButton.type = 'button';
      tabButton.className = 'prop-tab';
      tabButton.id = `prop-tab-${id}`;
      tabButton.textContent = label;
      tabButton.setAttribute('role', 'tab');
      tabButton.setAttribute('aria-selected', 'false');
      tabButton.setAttribute('aria-controls', `prop-tab-panel-${id}`);
      tabButton.tabIndex = -1;
      tabList.appendChild(tabButton);

      const panel = document.createElement('div');
      panel.className = 'prop-tab-panel';
      panel.id = `prop-tab-panel-${id}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabButton.id);
      panel.hidden = true;
      if (hasFields) panel.appendChild(createFieldset(legendText, fieldArr));
      tabPanels.appendChild(panel);

      const tabRecord = { id, button: tabButton, panel };
      tabs.push(tabRecord);
      tabMap.set(id, tabRecord);

      tabButton.addEventListener('click', () => {
        activateTab(id);
      });
      tabButton.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          focusTabAt(tabs.findIndex(t => t.id === id) + 1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          focusTabAt(tabs.findIndex(t => t.id === id) - 1);
        }
      });

      return tabRecord;
    };

    createTabSection('general', 'General', 'General', generalFields);
    createTabSection('electrical', 'Electrical', 'Electrical', electricalFields);
    createTabSection('physical', 'Physical', 'Physical', physicalFields);
    createTabSection('motor', 'Motor Start', 'Motor Start', motorStartFields);
    createTabSection('manufacturer', 'Manufacturer', 'Manufacturer', manufacturerFields);
    createTabSection('notes', 'Notes', 'Notes', noteFields);

    if (shouldApplyMotorDerivations) {
      const driverFieldNames = [
        'hp',
        'horsepower',
        'rating',
        'pf',
        'power_factor',
        'efficiency',
        'eff',
        'voltage',
        'volts',
        'volts_primary',
        'volts_secondary',
        'baseKV',
        'kV',
        'kv',
        'phases',
        'phase_count',
        'phaseCount',
        'inrushMultiple',
        'lr_current_pu',
        'locked_rotor_multiple',
        'lockedRotorMultiple'
      ];

      const parseNumericValue = raw => {
        if (raw === null || raw === undefined) return null;
        if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
        const text = String(raw).trim();
        if (!text) return null;
        const num = Number.parseFloat(text);
        return Number.isFinite(num) ? num : null;
      };

      const parsePercentValue = raw => {
        const num = parseNumericValue(raw);
        if (num === null) return null;
        let ratio = num;
        if (Math.abs(ratio) > 1.5) ratio /= 100;
        if (!Number.isFinite(ratio) || ratio <= 0) return null;
        return ratio;
      };

      const readComponentValue = name => {
        if (targetComp && Object.prototype.hasOwnProperty.call(targetComp, name)) {
          const direct = targetComp[name];
          if (direct !== undefined && direct !== null && direct !== '') return direct;
        }
        if (targetComp?.props && Object.prototype.hasOwnProperty.call(targetComp.props, name)) {
          const propVal = targetComp.props[name];
          if (propVal !== undefined && propVal !== null && propVal !== '') return propVal;
        }
        return null;
      };

      const getNumeric = (names, { percent = false } = {}) => {
        for (const name of names) {
          const input = motorInputMap.get(name);
          if (!input) continue;
          const value = percent ? parsePercentValue(input.value) : parseNumericValue(input.value);
          if (value !== null) return value;
        }
        for (const name of names) {
          const fromComp = readComponentValue(name);
          if (fromComp === null) continue;
          const value = percent ? parsePercentValue(fromComp) : parseNumericValue(fromComp);
          if (value !== null) return value;
        }
        return null;
      };

      const clamp = (val, min, max) => {
        if (!Number.isFinite(val)) return val;
        if (val < min) return min;
        if (val > max) return max;
        return val;
      };

      const updateMotorDerivedFields = () => {
        const hpVal = getNumeric(['hp', 'horsepower', 'rating']);
        let effVal = getNumeric(['efficiency', 'eff'], { percent: true });
        let pfVal = getNumeric(['pf', 'power_factor'], { percent: true });
        let voltageVal = getNumeric(['voltage', 'volts', 'volts_primary', 'volts_secondary']);
        if (voltageVal === null) {
          const baseKv = getNumeric(['baseKV', 'kV', 'kv']);
          if (Number.isFinite(baseKv) && baseKv > 0) voltageVal = baseKv * 1000;
        }
        let phasesVal = getNumeric(['phases', 'phase_count', 'phaseCount']);
        const multipleVal = getNumeric([
          'inrushMultiple',
          'lr_current_pu',
          'locked_rotor_multiple',
          'lockedRotorMultiple'
        ]);

        const loadKwInput = motorInputMap.get('load_kw');
        const loadKvarInput = motorInputMap.get('load_kvar');
        const impRInput = motorInputMap.get('impedance_r');
        const impXInput = motorInputMap.get('impedance_x');
        const thRInput = motorInputMap.get('thevenin_r');
        const thXInput = motorInputMap.get('thevenin_x');

        effVal = effVal !== null ? clamp(effVal, 0.01, 0.9999) : null;
        pfVal = pfVal !== null ? clamp(pfVal, 0.01, 0.9999) : null;
        phasesVal = Number.isFinite(phasesVal) && phasesVal > 0 ? phasesVal : 3;

        let inputKw = null;
        if (Number.isFinite(hpVal) && hpVal > 0 && Number.isFinite(effVal) && effVal > 0) {
          const outputKw = hpVal * 0.746;
          inputKw = outputKw / effVal;
          if (loadKwInput) loadKwInput.value = formatNumber(inputKw, 3);
        }

        if (Number.isFinite(inputKw) && pfVal !== null && loadKvarInput) {
          const kva = inputKw / pfVal;
          const kvar = Math.sqrt(Math.max(kva * kva - inputKw * inputKw, 0));
          loadKvarInput.value = formatNumber(kvar, 3);
        }

        const voltageValid = Number.isFinite(voltageVal) && voltageVal > 0 ? voltageVal : null;
        let lineCurrent = null;
        if (Number.isFinite(inputKw) && pfVal !== null && voltageValid !== null) {
          const isSinglePhase = phasesVal <= 1.5;
          const denom = isSinglePhase ? voltageValid * pfVal : Math.sqrt(3) * voltageValid * pfVal;
          if (denom > 0) {
            lineCurrent = (inputKw * 1000) / denom;
          }
          if (lineCurrent && lineCurrent > 0 && impRInput && impXInput) {
            const phaseVoltage = isSinglePhase ? voltageValid : voltageValid / Math.sqrt(3);
            const impedanceMag = phaseVoltage / lineCurrent;
            if (Number.isFinite(impedanceMag) && impedanceMag > 0) {
              const sinPhi = Math.sqrt(Math.max(1 - pfVal * pfVal, 0));
              const resistance = impedanceMag * pfVal;
              const reactance = impedanceMag * sinPhi;
              impRInput.value = formatNumber(resistance, 4);
              impXInput.value = formatNumber(reactance, 4);
            }
          }
        }

        const supplyPf = 0.25;
        const sagTarget = 0.3;
        if (lineCurrent && lineCurrent > 0 && voltageValid !== null && (thRInput || thXInput)) {
          const inrushMultiple = Number.isFinite(multipleVal) && multipleVal > 0 ? multipleVal : 6;
          const lockedRotorCurrent = lineCurrent * inrushMultiple;
          if (lockedRotorCurrent > 0) {
            const isSinglePhase = phasesVal <= 1.5;
            const phaseVoltage = isSinglePhase ? voltageValid : voltageValid / Math.sqrt(3);
            const theveninMag = (sagTarget * phaseVoltage) / lockedRotorCurrent;
            if (Number.isFinite(theveninMag) && theveninMag > 0) {
              const pfClamp = clamp(supplyPf, 0.01, 0.9999);
              const sinSupply = Math.sqrt(Math.max(1 - pfClamp * pfClamp, 0));
              if (thRInput) thRInput.value = formatNumber(theveninMag * pfClamp, 4);
              if (thXInput) thXInput.value = formatNumber(theveninMag * sinSupply, 4);
            }
          }
        }
      };

      const attachUpdate = input => {
        if (!input) return;
        input.addEventListener('input', updateMotorDerivedFields);
        input.addEventListener('change', updateMotorDerivedFields);
      };

      driverFieldNames.forEach(name => {
        const input = motorInputMap.get(name);
        if (input) attachUpdate(input);
      });

      updateMotorDerivedFields();
    }

    if (isStaticLoadComponent && staticInputMap) {
      const pfFieldNames = ['pf', 'power_factor'];
      const wattsFieldNames = ['watts'];
      const kvaFieldNames = ['kva'];
      const voltageFieldNames = ['volts', 'voltage'];
      const baseFieldNames = ['baseKV', 'kV', 'kv', 'prefault_voltage'];

      const parsePfValue = raw => {
        const numeric = parseNumericValue(raw);
        if (numeric === null) return null;
        let pf = numeric;
        if (Math.abs(pf) > 1.5) pf /= 100;
        if (!Number.isFinite(pf) || pf === 0) return null;
        const sign = pf >= 0 ? 1 : -1;
        pf = Math.abs(pf);
        if (pf < 0.01) pf = 0.01;
        if (pf > 1) pf = 1;
        return sign * pf;
      };

      const getInputValue = (names, parser) => {
        for (const name of names) {
          const input = staticInputMap.get(name);
          if (!input) continue;
          const parsed = parser(input.value);
          if (parsed !== null) return parsed;
        }
        return null;
      };

      const updateStaticPowerFields = (source, { commitFormatting = false, allowFallback = false } = {}) => {
        const wattsInput = staticInputMap.get('watts');
        const kvaInput = staticInputMap.get('kva');
        const loadKwInput = staticInputMap.get('load_kw');
        const loadKvarInput = staticInputMap.get('load_kvar');
        const pfInput = staticInputMap.get('pf') || staticInputMap.get('power_factor');

        const setFieldValue = (input, value, decimals, { skip = false, preserveOnInvalid = false } = {}) => {
          if (!input || skip) return;
          if (Number.isFinite(value)) {
            input.value = formatNumber(value, decimals);
          } else if (!preserveOnInvalid || commitFormatting) {
            input.value = '';
          }
        };

        let pfVal = getInputValue(pfFieldNames, parsePfValue);
        if (pfVal === null && allowFallback) {
          for (const name of pfFieldNames) {
            const fallback = parsePfValue(readComponentValue(name));
            if (fallback !== null) {
              pfVal = fallback;
              break;
            }
          }
        }

        let wattsVal = getInputValue(wattsFieldNames, parseNumericValue);
        if (wattsVal === null && allowFallback) {
          const fallbackWatts = parseNumericValue(readComponentValue('watts'));
          if (fallbackWatts !== null) {
            wattsVal = fallbackWatts;
          } else {
            const loadKwFallback = parseNumericValue(getNestedComponentValue(targetComp, ['load', 'kw']));
            if (loadKwFallback !== null) wattsVal = loadKwFallback * 1000;
          }
        }

        let kvaVal = getInputValue(kvaFieldNames, parseNumericValue);
        if (kvaVal === null && allowFallback) {
          const fallbackKva = parseNumericValue(readComponentValue('kva'));
          if (fallbackKva !== null) kvaVal = fallbackKva;
        }

        const pfMagnitude = Number.isFinite(pfVal) ? Math.min(Math.max(Math.abs(pfVal), 0.01), 1) : null;
        const kvarSign = Number.isFinite(pfVal) && pfVal < 0 ? -1 : 1;

        let kwVal = Number.isFinite(wattsVal) ? wattsVal / 1000 : null;
        if (!Number.isFinite(kwVal) && Number.isFinite(kvaVal) && pfMagnitude !== null) {
          kwVal = kvaVal * pfMagnitude;
        }

        if (!Number.isFinite(kvaVal) && Number.isFinite(kwVal) && pfMagnitude !== null && pfMagnitude > 0) {
          kvaVal = kwVal / pfMagnitude;
        }

        if (!Number.isFinite(wattsVal) && Number.isFinite(kwVal)) {
          wattsVal = kwVal * 1000;
        }

        let kvarVal = null;
        if (Number.isFinite(kvaVal) && Number.isFinite(kwVal)) {
          const diff = Math.max(kvaVal * kvaVal - kwVal * kwVal, 0);
          kvarVal = Math.sqrt(diff) * (Number.isFinite(pfVal) ? kvarSign : 1);
        }

        const existingKvarVal = allowFallback
          ? parseNumericValue(getNestedComponentValue(targetComp, ['load', 'kvar']))
          : null;

        const skipManual = !commitFormatting;

        setFieldValue(wattsInput, wattsVal, 3, {
          skip: source === 'watts' && skipManual,
          preserveOnInvalid: true
        });
        setFieldValue(kvaInput, kvaVal, 3, {
          skip: source === 'kva' && skipManual,
          preserveOnInvalid: true
        });

        if (pfInput) {
          const pfNames = pfFieldNames.filter(name => staticInputMap.has(name));
          const pfSkip = pfNames.includes(source) && skipManual;
          if (Number.isFinite(pfVal)) {
            if (!pfSkip) pfInput.value = formatNumber(pfVal, 3);
          } else if (!pfSkip && commitFormatting) {
            pfInput.value = '';
          }
        }

        if (loadKwInput) {
          if (Number.isFinite(kwVal)) loadKwInput.value = formatNumber(kwVal, 3);
          else loadKwInput.value = '';
        }
        if (loadKvarInput) {
          if (Number.isFinite(kvarVal)) loadKvarInput.value = formatNumber(kvarVal, 3);
          else if (Number.isFinite(existingKvarVal)) loadKvarInput.value = formatNumber(existingKvarVal, 3);
          else loadKvarInput.value = '';
        }
      };

      const parseVoltageValue = raw => {
        const normalized = normalizeVoltageToVolts(raw);
        if (!Number.isFinite(normalized) || normalized <= 0) return null;
        return normalized;
      };

      const updateStaticVoltageFields = (source, { commitFormatting = false, allowFallback = false } = {}) => {
        const voltsInput = staticInputMap.get('volts');
        const voltageInput = staticInputMap.get('voltage');
        const baseInputs = baseFieldNames
          .map(name => ({ name, input: staticInputMap.get(name) }))
          .filter(entry => entry.input);

        const getVoltageFromInput = input => {
          if (!input) return null;
          return parseVoltageValue(input.value);
        };

        let voltsVal = null;
        if (source === 'volts') voltsVal = getVoltageFromInput(voltsInput);
        if (voltsVal === null && source === 'voltage') voltsVal = getVoltageFromInput(voltageInput);
        if (voltsVal === null) {
          voltsVal = getVoltageFromInput(voltsInput) ?? getVoltageFromInput(voltageInput);
        }
        if (voltsVal === null) {
          for (const entry of baseInputs) {
            const parsed = parseVoltageValue(entry.input.value);
            if (parsed !== null) {
              voltsVal = parsed;
              break;
            }
          }
        }
        if (voltsVal === null && allowFallback) {
          const fallbackSources = [...voltageFieldNames, ...baseFieldNames];
          for (const name of fallbackSources) {
            const parsed = parseVoltageValue(readComponentValue(name));
            if (parsed !== null) {
              voltsVal = parsed;
              break;
            }
          }
          if (voltsVal === null) {
            const nested = parseVoltageValue(getNestedComponentValue(targetComp, ['voltage']));
            if (nested !== null) voltsVal = nested;
          }
        }

        const kvVal = Number.isFinite(voltsVal) ? voltsVal / 1000 : null;

        const skipManual = !commitFormatting;

        if (voltsInput) {
          const skip = source === 'volts' && skipManual;
          if (Number.isFinite(voltsVal)) {
            if (!skip) voltsInput.value = formatNumber(voltsVal, 3);
          } else if (!skip && commitFormatting) {
            voltsInput.value = '';
          }
        }

        if (voltageInput) {
          const skip = source === 'voltage' && skipManual;
          if (Number.isFinite(voltsVal)) {
            if (!skip) voltageInput.value = formatNumber(voltsVal, 3);
          } else if (!skip && commitFormatting) {
            voltageInput.value = '';
          }
        }

        baseInputs.forEach(({ input }) => {
          if (!input) return;
          if (Number.isFinite(kvVal)) {
            input.value = formatNumber(kvVal, 6);
          } else if (commitFormatting || !input.value) {
            input.value = '';
          }
        });
      };

      const attachPowerListener = name => {
        const input = staticInputMap.get(name);
        if (!input) return;
        input.addEventListener('input', () => updateStaticPowerFields(name, { allowFallback: false }));
        input.addEventListener('change', () => updateStaticPowerFields(name, { commitFormatting: true, allowFallback: false }));
      };

      const attachVoltageListener = name => {
        const input = staticInputMap.get(name);
        if (!input) return;
        input.addEventListener('input', () => updateStaticVoltageFields(name, { allowFallback: false }));
        input.addEventListener('change', () => updateStaticVoltageFields(name, { commitFormatting: true, allowFallback: false }));
      };

      [...wattsFieldNames, ...kvaFieldNames, ...pfFieldNames].forEach(attachPowerListener);
      voltageFieldNames.forEach(attachVoltageListener);

      updateStaticPowerFields(null, { commitFormatting: true, allowFallback: true });
      updateStaticVoltageFields(null, { commitFormatting: true, allowFallback: true });
    }

    if (isSourceCategoryComponent && sourceInputMap) {
      const baseFieldNames = ['baseKV', 'kV', 'kv', 'prefault_voltage'];

      const setCustomIndicator = (name, active) => {
        if (!sourceCustomBadges) return;
        const entry = sourceCustomBadges.get(name);
        if (!entry) return;
        const { badge, input } = entry;
        if (badge) badge.hidden = !active;
        if (input) {
          if (active) input.classList.add('prop-input-custom');
          else input.classList.remove('prop-input-custom');
        }
      };

      const parseKvValue = raw => {
        if (raw === null || raw === undefined) return null;
        const directKv = toBaseKV(raw);
        if (Number.isFinite(directKv) && directKv > 0.2) return directKv;
        const numeric = parseNumericValue(raw);
        if (!Number.isFinite(numeric) || numeric <= 0) return null;
        if (numeric > 1000) return numeric / 1000;
        return numeric;
      };

      const getKvFromInputs = names => {
        for (const name of names) {
          const input = sourceInputMap.get(name);
          if (!input) continue;
          const kv = parseKvValue(input.value);
          if (kv !== null) return kv;
        }
        return null;
      };

      const getKvFromComponent = names => {
        for (const name of names) {
          const kv = parseKvValue(readComponentValue(name));
          if (kv !== null) return kv;
        }
        return null;
      };

      const getKvFromOverrideInputs = names => {
        for (const name of names) {
          const entry = sourceCustomBadges?.get(name);
          const input = entry?.input ?? sourceInputMap.get(name);
          if (!input) continue;
          if (input.dataset.userOverride !== '1') continue;
          const kv = parseKvValue(input.value);
          if (kv !== null) return kv;
        }
        return null;
      };

      const resolveAutoBaseKV = ({ includeOverrides = false } = {}) => {
        if (includeOverrides) {
          const fromOverrides = getKvFromOverrideInputs(baseFieldNames);
          if (Number.isFinite(fromOverrides) && fromOverrides > 0) return fromOverrides;
        }
        const driverInputs = [
          'source_voltage_base',
          'voltage',
          'volts',
          'voltage_primary',
          'voltage_secondary',
          'nominalVoltage',
          'nominal_voltage'
        ];
        const fromInputs = getKvFromInputs(driverInputs);
        if (Number.isFinite(fromInputs) && fromInputs > 0) return fromInputs;
        const fromComponentDrivers = getKvFromComponent(driverInputs);
        if (Number.isFinite(fromComponentDrivers) && fromComponentDrivers > 0) return fromComponentDrivers;
        if (includeOverrides) {
          const fromBaseInputs = getKvFromInputs(baseFieldNames);
          if (Number.isFinite(fromBaseInputs) && fromBaseInputs > 0) return fromBaseInputs;
        }
        const fromBase = getKvFromComponent(baseFieldNames);
        if (Number.isFinite(fromBase) && fromBase > 0) return fromBase;
        return null;
      };

      const parseShortCircuitCapacity = raw => {
        if (raw === null || raw === undefined) return null;
        if (typeof raw === 'number') {
          return Number.isFinite(raw) && raw > 0 ? { value: raw, unit: 'mva' } : null;
        }
        const text = String(raw).trim();
        if (!text) return null;
        const match = text.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
        if (!match) return null;
        const numeric = Number.parseFloat(match[0].replace(/,/g, ''));
        if (!Number.isFinite(numeric) || numeric <= 0) return null;
        const lowered = text.toLowerCase();
        if (lowered.includes('ka')) return { value: numeric, unit: 'ka' };
        if (lowered.includes('mva')) return { value: numeric, unit: 'mva' };
        return { value: numeric, unit: 'mva' };
      };

      const getShortCircuitCapacity = () => {
        const input = sourceInputMap.get('short_circuit_capacity');
        const fromInput = parseShortCircuitCapacity(input?.value ?? null);
        if (fromInput) return fromInput;
        return parseShortCircuitCapacity(readComponentValue('short_circuit_capacity'));
      };

      const updateSourceBaseFields = () => {
        const autoKv = resolveAutoBaseKV();
        const tolerance = 1e-6;
        baseFieldNames.forEach(name => {
          const entry = sourceCustomBadges?.get(name);
          const input = entry?.input ?? sourceInputMap.get(name);
          if (!input) return;
          if (!Number.isFinite(autoKv) || autoKv <= 0) {
            delete input.dataset.autoValue;
            if (!input.value.trim()) delete input.dataset.userOverride;
            const active = input.dataset.userOverride === '1';
            setCustomIndicator(name, active);
            return;
          }
          const formatted = formatNumber(autoKv, 6);
          input.dataset.autoValue = formatted;
          const currentVal = parseNumericValue(input.value);
          const hasValue = typeof input.value === 'string' && input.value.trim() !== '';
          let isOverride = input.dataset.userOverride === '1';
          if (!hasValue) {
            isOverride = false;
          } else if (Number.isFinite(currentVal) && Math.abs(currentVal - autoKv) <= tolerance) {
            isOverride = false;
          } else if (!isOverride) {
            isOverride = true;
          }
          if (!isOverride) {
            input.value = formatted;
            delete input.dataset.userOverride;
          } else {
            input.dataset.userOverride = '1';
          }
          setCustomIndicator(name, isOverride);
        });
      };

      const updateSourceDerivedFields = () => {
        const theveninInput = sourceInputMap.get('thevenin_mva');
        if (!theveninInput) return;
        let theveninMva = null;
        const sc = getShortCircuitCapacity();
        if (sc) {
          if (sc.unit === 'ka') {
            const baseKv = resolveAutoBaseKV({ includeOverrides: true });
            if (Number.isFinite(baseKv) && baseKv > 0) {
              theveninMva = Math.sqrt(3) * baseKv * sc.value;
            }
          } else {
            theveninMva = sc.value;
          }
        }
        if (theveninMva === null) {
          const existing = parseNumericValue(readComponentValue('thevenin_mva'));
          if (Number.isFinite(existing)) theveninMva = existing;
          else {
            const fallback = parseNumericValue(readComponentValue('mva'));
            if (Number.isFinite(fallback)) theveninMva = fallback;
          }
        }
        theveninInput.value = Number.isFinite(theveninMva) ? formatNumber(theveninMva, 6) : '';
      };

      const attachBaseDriverListener = name => {
        const input = sourceInputMap.get(name);
        if (!input) return;
        const handler = () => {
          updateSourceBaseFields();
          updateSourceDerivedFields();
        };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
      };

      ['source_voltage_base', 'voltage', 'volts', 'voltage_primary', 'voltage_secondary', 'nominalVoltage', 'nominal_voltage'].forEach(
        attachBaseDriverListener
      );

      const attachDerivedListener = name => {
        const input = sourceInputMap.get(name);
        if (!input) return;
        const handler = () => {
          updateSourceDerivedFields();
        };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
      };

      ['short_circuit_capacity'].forEach(attachDerivedListener);

      baseFieldNames.forEach(name => {
        const entry = sourceCustomBadges?.get(name);
        const input = entry?.input ?? sourceInputMap.get(name);
        if (!input) return;
        input.addEventListener('input', () => {
          if (!input.value.trim()) {
            delete input.dataset.userOverride;
            setCustomIndicator(name, false);
            updateSourceBaseFields();
            updateSourceDerivedFields();
            return;
          }
          input.dataset.userOverride = '1';
          setCustomIndicator(name, true);
          updateSourceDerivedFields();
        });
        input.addEventListener('change', () => {
          if (!input.value.trim()) {
            delete input.dataset.userOverride;
            setCustomIndicator(name, false);
            updateSourceBaseFields();
            updateSourceDerivedFields();
            return;
          }
          const autoVal = parseNumericValue(input.dataset.autoValue);
          const currentVal = parseNumericValue(input.value);
          if (Number.isFinite(autoVal) && Number.isFinite(currentVal) && Math.abs(currentVal - autoVal) <= 1e-6) {
            delete input.dataset.userOverride;
            setCustomIndicator(name, false);
            updateSourceBaseFields();
          } else {
            input.dataset.userOverride = '1';
            setCustomIndicator(name, true);
          }
          updateSourceDerivedFields();
        });
      });

      updateSourceBaseFields();
      updateSourceDerivedFields();
    }

    if (isTransformerComponent && transformerInputMap) {
      const impedanceDriverFields = [
        'kva',
        'kva_lv',
        'kva_secondary',
        'kva_primary',
        'kva_hv',
        'kva_tv',
        'kva_tertiary',
        'percent_z',
        'z_percent',
        'percent_primary',
        'percent_secondary',
        'percent_tertiary',
        'z_hv_lv_percent',
        'z_hv_tv_percent',
        'z_lv_tv_percent',
        'xr_ratio',
        'xr'
      ];
      const voltageFieldPriority = [
        'volts_secondary',
        'volts_lv',
        'volts_tv',
        'volts_tertiary',
        'volts_primary',
        'volts_hv',
        'voltage_secondary',
        'voltage_primary',
        'voltage'
      ];
      const baseFieldNames = ['baseKV', 'kV', 'kv', 'prefault_voltage'];

      const setCustomIndicator = (name, active) => {
        if (!transformerCustomBadges) return;
        const entry = transformerCustomBadges.get(name);
        if (!entry) return;
        const { badge, input } = entry;
        if (active) {
          badge.hidden = false;
          input.classList.add('prop-input-custom');
        } else {
          badge.hidden = true;
          input.classList.remove('prop-input-custom');
        }
      };

      const parseVoltageToKV = raw => {
        const volts = normalizeVoltageToVolts(raw);
        if (!Number.isFinite(volts) || volts <= 0) return null;
        return volts / 1000;
      };

      const getNumericFromInputs = (names, { voltage = false } = {}) => {
        for (const name of names) {
          const input = transformerInputMap.get(name);
          if (!input) continue;
          const raw = input.value;
          const value = voltage ? parseVoltageToKV(raw) : parseNumericValue(raw);
          if (value !== null) return value;
        }
        return null;
      };

      const resolveAutoBaseKV = () => {
        const fromInputs = getNumericFromInputs(voltageFieldPriority, { voltage: true });
        if (Number.isFinite(fromInputs) && fromInputs > 0) return fromInputs;
        const derived = deriveTransformerBaseKV(targetComp);
        if (Number.isFinite(derived) && derived > 0) return derived;
        const fallback = computeTransformerBaseKV(targetComp);
        if (Number.isFinite(fallback) && fallback > 0) return fallback;
        return null;
      };

      const updateTransformerDerivedFields = () => {
        const kvaVal = getNumericFromInputs(impedanceDriverFields) ?? resolveTransformerKva(targetComp);
        const percentVal = getNumericFromInputs([
          'percent_z',
          'z_percent',
          'percent_primary',
          'percent_secondary',
          'percent_tertiary',
          'z_hv_lv_percent',
          'z_hv_tv_percent',
          'z_lv_tv_percent'
        ]) ?? resolveTransformerPercentZ(targetComp);
        let baseKv = getNumericFromInputs(voltageFieldPriority, { voltage: true });
        if (baseKv === null) {
          const fromBaseInputs = getNumericFromInputs(baseFieldNames);
          if (Number.isFinite(fromBaseInputs) && fromBaseInputs > 0) baseKv = fromBaseInputs;
        }
        if (baseKv === null) baseKv = computeTransformerBaseKV(targetComp);
        const xrVal = getNumericFromInputs(['xr_ratio', 'xr']) ?? resolveTransformerXrRatio(targetComp);
        const impRInput = transformerInputMap.get('impedance_r');
        const impXInput = transformerInputMap.get('impedance_x');
        if (
          Number.isFinite(kvaVal)
          && Number.isFinite(percentVal)
          && Number.isFinite(baseKv)
          && kvaVal !== 0
          && percentVal !== 0
          && baseKv !== 0
        ) {
          const impedance = calculateTransformerImpedance({ kva: kvaVal, percentZ: percentVal, voltageKV: baseKv, xrRatio: xrVal });
          if (impedance && Number.isFinite(impedance.r) && Number.isFinite(impedance.x)) {
            if (impRInput) impRInput.value = formatNumber(impedance.r, 6);
            if (impXInput) impXInput.value = formatNumber(impedance.x, 6);
            return;
          }
        }
        if (impRInput) impRInput.value = '';
        if (impXInput) impXInput.value = '';
      };

      const updateTransformerBaseFields = () => {
        const autoKv = resolveAutoBaseKV();
        const tolerance = 1e-6;
        baseFieldNames.forEach(name => {
          const input = transformerInputMap.get(name);
          if (!input) return;
          if (!Number.isFinite(autoKv) || autoKv <= 0) {
            delete input.dataset.autoValue;
            const isCustom = input.dataset.userOverride === '1';
            setCustomIndicator(name, isCustom);
            return;
          }
          const formatted = formatNumber(autoKv, 6);
          input.dataset.autoValue = formatted;
          const currentVal = parseNumericValue(input.value);
          const hasValue = typeof input.value === 'string' && input.value.trim() !== '';
          let isOverride = input.dataset.userOverride === '1';
          if (!hasValue) {
            isOverride = false;
          } else if (Number.isFinite(currentVal) && Math.abs(currentVal - autoKv) <= tolerance) {
            isOverride = false;
          } else if (!isOverride) {
            isOverride = true;
          }
          if (!isOverride) {
            input.value = formatted;
            delete input.dataset.userOverride;
          } else {
            input.dataset.userOverride = '1';
          }
          setCustomIndicator(name, isOverride);
        });
      };

      const attachDerivedListener = name => {
        const input = transformerInputMap.get(name);
        if (!input) return;
        const handler = () => {
          updateTransformerDerivedFields();
          if (voltageFieldPriority.includes(name)) updateTransformerBaseFields();
        };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
      };

      impedanceDriverFields.concat(voltageFieldPriority).forEach(attachDerivedListener);

      baseFieldNames.forEach(name => {
        const input = transformerInputMap.get(name);
        if (!input) return;
        input.addEventListener('input', () => {
          if (!input.value.trim()) {
            delete input.dataset.userOverride;
            setCustomIndicator(name, false);
            updateTransformerBaseFields();
            updateTransformerDerivedFields();
            return;
          }
          input.dataset.userOverride = '1';
          setCustomIndicator(name, true);
          updateTransformerDerivedFields();
        });
        input.addEventListener('change', () => {
          if (!input.value.trim()) {
            delete input.dataset.userOverride;
            setCustomIndicator(name, false);
            updateTransformerBaseFields();
            updateTransformerDerivedFields();
            return;
          }
          const autoVal = parseNumericValue(input.dataset.autoValue);
          const currentVal = parseNumericValue(input.value);
          if (Number.isFinite(autoVal) && Number.isFinite(currentVal) && Math.abs(currentVal - autoVal) <= 1e-6) {
            delete input.dataset.userOverride;
            setCustomIndicator(name, false);
            updateTransformerBaseFields();
          } else {
            input.dataset.userOverride = '1';
            setCustomIndicator(name, true);
          }
          updateTransformerDerivedFields();
        });
      });

      updateTransformerDerivedFields();
      updateTransformerBaseFields();
    }

    const getTabPanel = id => tabMap.get(id)?.panel || tabs[0]?.panel || null;

    const connectionCount = Array.isArray(targetComp.connections) ? targetComp.connections.length : 0;
    if (connectionCount > 0) {
      const connectionsTab = createTabSection('connections', 'Connections', null, [], { force: true });
      if (connectionsTab) {
        const header = document.createElement('h3');
        header.textContent = 'Connections';
        connectionsTab.panel.appendChild(header);
        const list = document.createElement('ul');
        list.className = 'prop-connection-list';
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
        connectionsTab.panel.appendChild(list);
      }
    }

    if (tabs.length) {
      activateTab(tabs[0].id);
    } else {
      tabList.remove();
      tabPanels.remove();
    }

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

    if (tccInput) {
      const generalPanel = getTabPanel('general');
      if (generalPanel) {
        const tccActions = document.createElement('div');
        tccActions.className = 'prop-tab-actions';
        const tccBtn = document.createElement('button');
        tccBtn.type = 'button';
        tccBtn.textContent = 'Edit TCC';
        tccBtn.classList.add('btn');
        tccBtn.addEventListener('click', () => {
          const dev = tccInput.value ? `&device=${encodeURIComponent(tccInput.value)}` : '';
          window.open(`tcc.html?component=${encodeURIComponent(targetComp.id)}${dev}`, '_blank');
        });
        tccActions.appendChild(tccBtn);
        generalPanel.appendChild(tccActions);
      }
    }

    if (targetComp.type === 'cable') {
      const generalPanel = getTabPanel('general');
      if (generalPanel) {
        const cable = targetComp.cable || {};
        const cableInfo = document.createElement('div');
        cableInfo.className = 'cable-info';
        cableInfo.innerHTML = `
          <p><strong>Tag:</strong> ${cable.tag || ''}</p>
          <p><strong>Type:</strong> ${cable.cable_type || ''}</p>
          <p><strong>Cable Rating (V):</strong> ${cable.cable_rating ?? ''}</p>
          <p><strong>Operating Voltage (V):</strong> ${formatOperatingVoltage(cable.operating_voltage) || ''}</p>
          <p><strong>Conductors:</strong> ${cable.conductors || ''}</p>
          <p><strong>Phases:</strong> ${Array.isArray(cable.phases) ? cable.phases.join(',') : cable.phases || ''}</p>
          <p><strong>Conductor Size (AWG or mm²):</strong> ${cable.conductor_size || ''}</p>
          <p><strong>Conductor Material (Cu/Al):</strong> ${cable.conductor_material || ''}</p>
          <p><strong>Resistance (Ω/km):</strong> ${cable.resistance_per_km ?? ''}</p>
          <p><strong>Reactance (Ω/km):</strong> ${cable.reactance_per_km ?? ''}</p>
          <p><strong>Zero Sequence Impedance:</strong> ${cable.zero_sequence_impedance || ''}</p>
          <p><strong>Mutual Coupling:</strong> ${cable.mutual_coupling || ''}</p>
          <p><strong>Length:</strong> ${cable.length ?? ''}</p>
          <p><strong>Operating Temperature (°C):</strong> ${cable.operating_temp ?? ''}</p>
          <p><strong>Ambient Temperature (°C):</strong> ${cable.ambient_temp ?? ''}</p>
          <p><strong>Thermal Rating/Ampacity (A):</strong> ${cable.thermal_rating_ampacity ?? ''}</p>
          <p><strong>Shield/Armor Data:</strong> ${cable.shield_armor || ''}</p>
          <p><strong>Impedance per Length:</strong> ${cable.impedance_per_length || ''}</p>
          <p><strong>Capacitance (µF/km):</strong> ${cable.capacitance_per_km ?? ''}</p>
          <p><strong>Insulation Type:</strong> ${cable.insulation_type || ''}</p>
          <p><strong>Installation Type (in conduit, tray, buried):</strong> ${cable.install_method || ''}</p>
          <p><strong>Short Circuit Rating (kA):</strong> ${cable.short_circuit_rating ?? ''}</p>
          <p><strong>Grouping Factor:</strong> ${cable.grouping_factor ?? ''}</p>
          <p><strong>Resistance Temp Correction Coeff:</strong> ${cable.resistance_temp_correction_coeff ?? ''}</p>
          <p><strong>Core Configuration (1C,3C):</strong> ${cable.core_configuration || ''}</p>
          <p><strong>Ground Return Path Resistance:</strong> ${cable.ground_return_path_resistance ?? ''}</p>
          <p><strong>Impedance R (Ω):</strong> ${getImpedancePart(cable, 'r') || ''}</p>
          <p><strong>Impedance X (Ω):</strong> ${getImpedancePart(cable, 'x') || ''}</p>
        `;
        generalPanel.appendChild(cableInfo);

        const cableActions = document.createElement('div');
        cableActions.className = 'prop-tab-actions';
        const editCableBtn = document.createElement('button');
        editCableBtn.type = 'button';
        editCableBtn.textContent = 'Edit Cable Details';
        editCableBtn.classList.add('btn');
        editCableBtn.addEventListener('click', async () => {
          await editCableComponent(targetComp);
          renderPropertiesFor(targetComp);
        });
        cableActions.appendChild(editCableBtn);
        generalPanel.appendChild(cableActions);
      }
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
      if (hasTccField) {
        data.tccId = fd.get('tccId') || '';
      }
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
      applyChanges();
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
    applyPendingChanges();
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
  modal.addEventListener('pointerdown', pointerDownHandler);
  modal._pointerDownHandler = pointerDownHandler;
  modal._pointerDownOnOverlay = false;
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

    const applyCableMeta = (label, key, fallback) => {
      const meta = cablePropertyMetadata[key];
      const text = meta?.label || fallback || key;
      label.textContent = `${text} `;
      if (meta?.help) label.title = meta.help;
      return meta || {};
    };

    const parseNumericValue = input => {
      if (!input) return '';
      const raw = typeof input.value === 'string' ? input.value.trim() : '';
      if (!raw) return '';
      const num = Number(raw);
      return Number.isFinite(num) ? num : raw;
    };

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

    const ratingLabel = document.createElement('label');
    ratingLabel.textContent = 'Cable Rating (V) ';
    const ratingInput = document.createElement('input');
    ratingInput.type = 'number';
    ratingInput.name = 'cable_rating';
    ratingInput.min = '0';
    ratingInput.step = 'any';
    ratingLabel.appendChild(ratingInput);
    form.appendChild(ratingLabel);

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
    applyCableMeta(sizeLabel, 'conductor_size', 'Conductor Size');
    const sizeInput = document.createElement('input');
    sizeInput.name = 'conductor_size';
    sizeLabel.appendChild(sizeInput);
    form.appendChild(sizeLabel);

    const materialLabel = document.createElement('label');
    applyCableMeta(materialLabel, 'conductor_material', 'Conductor Material');
    const materialInput = document.createElement('input');
    materialInput.name = 'conductor_material';
    materialLabel.appendChild(materialInput);
    form.appendChild(materialLabel);

    const resistancePerKmLabel = document.createElement('label');
    applyCableMeta(resistancePerKmLabel, 'resistance_per_km', 'Resistance (Ω/km)');
    const resistancePerKmInput = document.createElement('input');
    resistancePerKmInput.type = 'number';
    resistancePerKmInput.step = 'any';
    resistancePerKmInput.name = 'resistance_per_km';
    resistancePerKmLabel.appendChild(resistancePerKmInput);
    form.appendChild(resistancePerKmLabel);

    const reactancePerKmLabel = document.createElement('label');
    applyCableMeta(reactancePerKmLabel, 'reactance_per_km', 'Reactance (Ω/km)');
    const reactancePerKmInput = document.createElement('input');
    reactancePerKmInput.type = 'number';
    reactancePerKmInput.step = 'any';
    reactancePerKmInput.name = 'reactance_per_km';
    reactancePerKmLabel.appendChild(reactancePerKmInput);
    form.appendChild(reactancePerKmLabel);

    const zeroSeqLabel = document.createElement('label');
    applyCableMeta(zeroSeqLabel, 'zero_sequence_impedance', 'Zero Sequence Impedance');
    const zeroSequenceInput = document.createElement('input');
    zeroSequenceInput.name = 'zero_sequence_impedance';
    zeroSeqLabel.appendChild(zeroSequenceInput);
    form.appendChild(zeroSeqLabel);

    const mutualCouplingLabel = document.createElement('label');
    applyCableMeta(mutualCouplingLabel, 'mutual_coupling', 'Mutual Coupling');
    const mutualCouplingInput = document.createElement('input');
    mutualCouplingInput.name = 'mutual_coupling';
    mutualCouplingLabel.appendChild(mutualCouplingInput);
    form.appendChild(mutualCouplingLabel);

    const lengthLabel = document.createElement('label');
    applyCableMeta(lengthLabel, 'length', 'Length');
    const lengthInput = document.createElement('input');
    lengthInput.type = 'number';
    lengthInput.step = 'any';
    lengthInput.name = 'length';
    lengthLabel.appendChild(lengthInput);
    form.appendChild(lengthLabel);

    const operatingTempLabel = document.createElement('label');
    applyCableMeta(operatingTempLabel, 'operating_temp', 'Operating Temperature (°C)');
    const operatingTempInput = document.createElement('input');
    operatingTempInput.type = 'number';
    operatingTempInput.step = 'any';
    operatingTempInput.name = 'operating_temp';
    operatingTempLabel.appendChild(operatingTempInput);
    form.appendChild(operatingTempLabel);

    const ambientLabel = document.createElement('label');
    applyCableMeta(ambientLabel, 'ambient_temp', 'Ambient Temperature (°C)');
    const ambientInput = document.createElement('input');
    ambientInput.type = 'number';
    ambientInput.step = 'any';
    ambientInput.name = 'ambient_temp';
    ambientLabel.appendChild(ambientInput);
    form.appendChild(ambientLabel);

    const thermalRatingLabel = document.createElement('label');
    applyCableMeta(thermalRatingLabel, 'thermal_rating_ampacity', 'Thermal Rating/Ampacity (A)');
    const thermalRatingInput = document.createElement('input');
    thermalRatingInput.type = 'number';
    thermalRatingInput.step = 'any';
    thermalRatingInput.name = 'thermal_rating_ampacity';
    thermalRatingLabel.appendChild(thermalRatingInput);
    form.appendChild(thermalRatingLabel);

    const shieldArmorLabel = document.createElement('label');
    applyCableMeta(shieldArmorLabel, 'shield_armor', 'Shield/Armor Data');
    const shieldArmorInput = document.createElement('input');
    shieldArmorInput.name = 'shield_armor';
    shieldArmorLabel.appendChild(shieldArmorInput);
    form.appendChild(shieldArmorLabel);

    const impedancePerLengthLabel = document.createElement('label');
    applyCableMeta(impedancePerLengthLabel, 'impedance_per_length', 'Impedance per Length');
    const impedancePerLengthInput = document.createElement('input');
    impedancePerLengthInput.name = 'impedance_per_length';
    impedancePerLengthLabel.appendChild(impedancePerLengthInput);
    form.appendChild(impedancePerLengthLabel);

    const capacitanceLabel = document.createElement('label');
    applyCableMeta(capacitanceLabel, 'capacitance_per_km', 'Capacitance (µF/km)');
    const capacitanceInput = document.createElement('input');
    capacitanceInput.type = 'number';
    capacitanceInput.step = 'any';
    capacitanceInput.name = 'capacitance_per_km';
    capacitanceLabel.appendChild(capacitanceInput);
    form.appendChild(capacitanceLabel);

    const insulationLabel = document.createElement('label');
    applyCableMeta(insulationLabel, 'insulation_type', 'Insulation Type');
    const insulationInput = document.createElement('input');
    insulationInput.name = 'insulation_type';
    insulationLabel.appendChild(insulationInput);
    form.appendChild(insulationLabel);

    const installLabel = document.createElement('label');
    applyCableMeta(installLabel, 'install_method', 'Installation Type');
    const installInput = document.createElement('input');
    installInput.name = 'install_method';
    installLabel.appendChild(installInput);
    form.appendChild(installLabel);

    const shortCircuitLabel = document.createElement('label');
    applyCableMeta(shortCircuitLabel, 'short_circuit_rating', 'Short Circuit Rating (kA)');
    const shortCircuitInput = document.createElement('input');
    shortCircuitInput.type = 'number';
    shortCircuitInput.step = 'any';
    shortCircuitInput.name = 'short_circuit_rating';
    shortCircuitLabel.appendChild(shortCircuitInput);
    form.appendChild(shortCircuitLabel);

    const groupingLabel = document.createElement('label');
    applyCableMeta(groupingLabel, 'grouping_factor', 'Grouping Factor');
    const groupingInput = document.createElement('input');
    groupingInput.type = 'number';
    groupingInput.step = 'any';
    groupingInput.name = 'grouping_factor';
    groupingLabel.appendChild(groupingInput);
    form.appendChild(groupingLabel);

    const resistanceCoeffLabel = document.createElement('label');
    applyCableMeta(resistanceCoeffLabel, 'resistance_temp_correction_coeff', 'Resistance Temp Correction Coeff');
    const resistanceCoeffInput = document.createElement('input');
    resistanceCoeffInput.type = 'number';
    resistanceCoeffInput.step = 'any';
    resistanceCoeffInput.name = 'resistance_temp_correction_coeff';
    resistanceCoeffLabel.appendChild(resistanceCoeffInput);
    form.appendChild(resistanceCoeffLabel);

    const coreConfigLabel = document.createElement('label');
    applyCableMeta(coreConfigLabel, 'core_configuration', 'Core Configuration (1C,3C)');
    const coreConfigurationInput = document.createElement('input');
    coreConfigurationInput.name = 'core_configuration';
    coreConfigLabel.appendChild(coreConfigurationInput);
    form.appendChild(coreConfigLabel);

    const groundReturnLabel = document.createElement('label');
    applyCableMeta(groundReturnLabel, 'ground_return_path_resistance', 'Ground Return Path Resistance');
    const groundReturnInput = document.createElement('input');
    groundReturnInput.type = 'number';
    groundReturnInput.step = 'any';
    groundReturnInput.name = 'ground_return_path_resistance';
    groundReturnLabel.appendChild(groundReturnInput);
    form.appendChild(groundReturnLabel);

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
        resistancePerKmInput.value = t.resistance_per_km ?? '';
        reactancePerKmInput.value = t.reactance_per_km ?? '';
        zeroSequenceInput.value = t.zero_sequence_impedance || '';
        mutualCouplingInput.value = t.mutual_coupling || '';
        lengthInput.value = t.length ?? '';
        operatingTempInput.value = t.operating_temp ?? '';
        thermalRatingInput.value = t.thermal_rating_ampacity ?? '';
        shieldArmorInput.value = t.shield_armor || '';
        impedancePerLengthInput.value = t.impedance_per_length || '';
        capacitanceInput.value = t.capacitance_per_km ?? '';
        insulationInput.value = t.insulation_type || '';
        ambientInput.value = t.ambient_temp || '';
        installInput.value = t.install_method || '';
        shortCircuitInput.value = t.short_circuit_rating ?? '';
        groupingInput.value = t.grouping_factor ?? '';
        resistanceCoeffInput.value = t.resistance_temp_correction_coeff ?? '';
        coreConfigurationInput.value = t.core_configuration || '';
        groundReturnInput.value = t.ground_return_path_resistance ?? '';
        ratingInput.value = t.cable_rating || '';
        impedanceRInput.value = getImpedancePart(t, 'r') || '';
        impedanceXInput.value = getImpedancePart(t, 'x') || '';
      } else {
        resistancePerKmInput.value = '';
        reactancePerKmInput.value = '';
        zeroSequenceInput.value = '';
        mutualCouplingInput.value = '';
        operatingTempInput.value = '';
        thermalRatingInput.value = '';
        shieldArmorInput.value = '';
        impedancePerLengthInput.value = '';
        capacitanceInput.value = '';
        shortCircuitInput.value = '';
        groupingInput.value = '';
        resistanceCoeffInput.value = '';
        coreConfigurationInput.value = '';
        groundReturnInput.value = '';
      }
    });

    select.addEventListener('change', () => {
      const c = existingTemplates.find(t => t.tag === select.value);
      if (c) {
        tagInput.value = c.tag || '';
        typeInput.value = c.cable_type || '';
        ratingInput.value = c.cable_rating || '';
        conductorsInput.value = c.conductors || '';
        phasesInput.value = c.phases || '';
        sizeInput.value = c.conductor_size || '';
        materialInput.value = c.conductor_material || '';
        resistancePerKmInput.value = c.resistance_per_km ?? '';
        reactancePerKmInput.value = c.reactance_per_km ?? '';
        zeroSequenceInput.value = c.zero_sequence_impedance || '';
        mutualCouplingInput.value = c.mutual_coupling || '';
        insulationInput.value = c.insulation_type || '';
        lengthInput.value = c.length ?? '';
        operatingTempInput.value = c.operating_temp ?? '';
        colorInput.value = c.color || '#000000';
        ambientInput.value = c.ambient_temp || '';
        installInput.value = c.install_method || '';
        thermalRatingInput.value = c.thermal_rating_ampacity ?? '';
        shieldArmorInput.value = c.shield_armor || '';
        impedancePerLengthInput.value = c.impedance_per_length || '';
        capacitanceInput.value = c.capacitance_per_km ?? '';
        shortCircuitInput.value = c.short_circuit_rating ?? '';
        groupingInput.value = c.grouping_factor ?? '';
        resistanceCoeffInput.value = c.resistance_temp_correction_coeff ?? '';
        coreConfigurationInput.value = c.core_configuration || '';
        groundReturnInput.value = c.ground_return_path_resistance ?? '';
        impedanceRInput.value = getImpedancePart(c, 'r') || '';
        impedanceXInput.value = getImpedancePart(c, 'x') || '';
      } else {
        tagInput.value = '';
        typeInput.value = '';
        ratingInput.value = '';
        conductorsInput.value = '';
        phasesInput.value = '';
        sizeInput.value = '';
        materialInput.value = '';
        insulationInput.value = '';
        resistancePerKmInput.value = '';
        reactancePerKmInput.value = '';
        zeroSequenceInput.value = '';
        mutualCouplingInput.value = '';
        lengthInput.value = '';
        operatingTempInput.value = '';
        colorInput.value = '#000000';
        ambientInput.value = '';
        installInput.value = '';
        thermalRatingInput.value = '';
        shieldArmorInput.value = '';
        impedancePerLengthInput.value = '';
        capacitanceInput.value = '';
        shortCircuitInput.value = '';
        groupingInput.value = '';
        resistanceCoeffInput.value = '';
        coreConfigurationInput.value = '';
        groundReturnInput.value = '';
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
      ratingInput.value = existing.cable_rating || '';
      conductorsInput.value = existingConn.conductors || existing.conductors || '';
      phasesInput.value = Array.isArray(existingConn.phases)
        ? existingConn.phases.join(',')
        : existing.phases || '';
      sizeInput.value = existing.conductor_size || '';
      materialInput.value = existing.conductor_material || '';
      resistancePerKmInput.value = existing.resistance_per_km ?? '';
      reactancePerKmInput.value = existing.reactance_per_km ?? '';
      zeroSequenceInput.value = existing.zero_sequence_impedance || '';
      mutualCouplingInput.value = existing.mutual_coupling || '';
      insulationInput.value = existing.insulation_type || '';
      const autoLen = (existingConn.length || 0) * (diagramScale.unitPerPx || 1);
      if (existing.length) {
        lengthInput.value = existing.length;
      } else if (autoLen) {
        lengthInput.value = autoLen.toFixed(2);
      }
      operatingTempInput.value = existing.operating_temp ?? '';
      colorInput.value = existing.color || '#000000';
      ambientInput.value = existing.ambient_temp || '';
      installInput.value = existing.install_method || '';
      thermalRatingInput.value = existing.thermal_rating_ampacity ?? '';
      shieldArmorInput.value = existing.shield_armor || '';
      impedancePerLengthInput.value = existing.impedance_per_length || '';
      capacitanceInput.value = existing.capacitance_per_km ?? '';
      shortCircuitInput.value = existing.short_circuit_rating ?? '';
      groupingInput.value = existing.grouping_factor ?? '';
      resistanceCoeffInput.value = existing.resistance_temp_correction_coeff ?? '';
      coreConfigurationInput.value = existing.core_configuration || '';
      groundReturnInput.value = existing.ground_return_path_resistance ?? '';
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
        cable_rating: (() => {
          const raw = ratingInput.value != null ? ratingInput.value.trim() : '';
          if (!raw) return '';
          const num = Number(raw);
          return Number.isFinite(num) ? num : raw;
        })(),
        conductors,
        conductor_size: sizeInput.value,
        conductor_material: materialInput.value,
        resistance_per_km: parseNumericValue(resistancePerKmInput),
        reactance_per_km: parseNumericValue(reactancePerKmInput),
        zero_sequence_impedance: zeroSequenceInput.value,
        mutual_coupling: mutualCouplingInput.value,
        insulation_type: insulationInput.value,
        operating_temp: parseNumericValue(operatingTempInput),
        ambient_temp: parseNumericValue(ambientInput),
        install_method: installInput.value,
        thermal_rating_ampacity: parseNumericValue(thermalRatingInput),
        shield_armor: shieldArmorInput.value,
        impedance_per_length: impedancePerLengthInput.value,
        capacitance_per_km: parseNumericValue(capacitanceInput),
        short_circuit_rating: parseNumericValue(shortCircuitInput),
        grouping_factor: parseNumericValue(groupingInput),
        resistance_temp_correction_coeff: parseNumericValue(resistanceCoeffInput),
        core_configuration: coreConfigurationInput.value,
        ground_return_path_resistance: parseNumericValue(groundReturnInput),
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
      const manualImpedanceProvided =
        (typeof impedanceRInput.value === 'string' && impedanceRInput.value.trim() !== '') ||
        (typeof impedanceXInput.value === 'string' && impedanceXInput.value.trim() !== '');
      if (existingConn?.cable?.operating_voltage !== undefined) {
        cable.operating_voltage = existingConn.cable.operating_voltage;
      }
      let resolvedLength = null;
      if (manualLen) {
        const manualValue = parseNumericValue(lengthInput);
        cable.length = manualValue;
        cable.manual_length = true;
        if (typeof manualValue === 'number' && Number.isFinite(manualValue) && manualValue > 0) {
          resolvedLength = manualValue;
        }
      } else {
        const connLength = Number(existingConn?.length);
        const unitPerPx = Number(diagramScale?.unitPerPx);
        if (Number.isFinite(connLength) && connLength > 0) {
          const scaleFactor = Number.isFinite(unitPerPx) && unitPerPx > 0 ? unitPerPx : 1;
          resolvedLength = connLength * scaleFactor;
        }
      }
      if (!manualImpedanceProvided && !hasImpedance(cable) && resolvedLength !== null) {
        const derivedImpedance = computeImpedanceFromPerKm({
          resistancePerKm: cable.resistance_per_km,
          reactancePerKm: cable.reactance_per_km,
          length: resolvedLength,
          unit: diagramScale?.unit
        });
        if (derivedImpedance) {
          cable.impedance = derivedImpedance;
        }
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
  const addShapeBtn = document.getElementById('add-shape-btn');
  if (addShapeBtn) {
    addShapeBtn.addEventListener('click', () => {
      openShapeModal();
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

  const panUpBtn = document.getElementById('pan-up-btn');
  const panDownBtn = document.getElementById('pan-down-btn');
  const panLeftBtn = document.getElementById('pan-left-btn');
  const panRightBtn = document.getElementById('pan-right-btn');
  const bindPan = (btn, direction) => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!canvasScroll) return;
      panDiagram(direction, canvasScroll);
    });
  };
  bindPan(panUpBtn, 'up');
  bindPan(panDownBtn, 'down');
  bindPan(panLeftBtn, 'left');
  bindPan(panRightBtn, 'right');

  document.addEventListener('keydown', e => {
    if (!canvasScroll) return;
    if (e.defaultPrevented) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target) {
      const tag = target.tagName;
      if (target.isContentEditable) return;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (tag === 'BUTTON' || tag === 'A' || tag === 'OPTION') return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      panDiagram('up', canvasScroll);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      panDiagram('down', canvasScroll);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      panDiagram('left', canvasScroll);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      panDiagram('right', canvasScroll);
    }
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
    let handled = false;
    if (resizingPalette && workspaceEl) {
      const rect = workspaceEl.getBoundingClientRect();
      const nextWidth = clampPaletteWidth(e.clientX - rect.left, paletteWidth);
      if (nextWidth !== paletteWidth) {
        paletteWidth = nextWidth;
        workspaceEl.style.setProperty('--palette-width', `${paletteWidth}px`);
        workspaceEl.style.gridTemplateColumns = `${paletteWidth}px 1fr`;
        if (splitter) splitter.style.left = `${paletteWidth}px`;
      }
      handled = true;
    }
    if (resizingStudiesPanel && studiesPanel) {
      const delta = studiesResizeStartX - e.clientX;
      const nextWidth = clampStudiesWidth(studiesResizeStartWidth + delta, studiesWidth);
      if (nextWidth !== studiesWidth) {
        studiesWidth = nextWidth;
        studiesPanel.style.setProperty('--studies-width', `${studiesWidth}px`);
      }
      handled = true;
    }
    if (handled) {
      e.preventDefault();
    }
  });

  document.addEventListener('mouseup', () => {
    const wasResizingPalette = resizingPalette;
    const wasResizingStudies = resizingStudiesPanel;
    resizingPalette = false;
    resizingStudiesPanel = false;
    if (wasResizingPalette) {
      if (workspaceEl) {
        workspaceEl.style.setProperty('--palette-width', `${paletteWidth}px`);
      }
      setItem(paletteWidthStorageKey, Math.round(paletteWidth));
    }
    if (wasResizingStudies && studiesPanel) {
      studiesPanel.classList.remove('is-resizing');
      studiesPanel.style.setProperty('--studies-width', `${studiesWidth}px`);
      if (Number.isFinite(studiesWidth)) {
        setItem(studiesWidthStorageKey, Math.round(studiesWidth));
      }
    } else if (studiesPanel) {
      studiesPanel.classList.remove('is-resizing');
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
  const canvasScroll = document.querySelector('.oneline-canvas-scroll') || editorEl;
  const paletteRoot = document.getElementById('palette');
  const paletteScroll = paletteRoot?.querySelector('.palette-scroll');
  if (paletteScroll instanceof HTMLElement) {
    attachLocalWheelScroll(paletteScroll);
  } else {
    attachLocalWheelScroll(paletteRoot);
  }
  attachLocalWheelScroll(canvasScroll);
  const legendEl = document.getElementById('voltage-legend');
  if (canvasScroll) {
    canvasScroll.addEventListener('wheel', e => {
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
    if (!legendDrag || !legendEl || !canvasScroll) return;
    const rect = canvasScroll.getBoundingClientRect();
    const parent = legendEl.offsetParent instanceof HTMLElement ? legendEl.offsetParent : canvasScroll;
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
        if (canvasScroll) {
          e.preventDefault();
          startMiddlePan(e, canvasScroll);
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
      dragConnections = computeDragConnections(selection);
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
      cursorPosValid = Number.isFinite(pointerX) && Number.isFinite(pointerY);
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
      if (dragConnections && dragConnections.length) {
        dragConnections.forEach(entry => {
          const { conn, dir, source, target, offset } = entry;
          if (!conn || (dir !== 'h' && dir !== 'v')) return;
          const startPos = portPosition(source, conn.sourcePort);
          const endPos = target ? portPosition(target, conn.targetPort) : null;
          if (!startPos || !endPos) return;
          const base = dir === 'h'
            ? (startPos.x + endPos.x) / 2
            : (startPos.y + endPos.y) / 2;
          const nextMid = Number.isFinite(base)
            ? base + (Number.isFinite(offset) ? offset : 0)
            : base;
          if (Number.isFinite(nextMid)) {
            conn.mid = Number(nextMid.toFixed(2));
          }
        });
      }
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
        dragConnections = null;
        dragging = false;
      } else {
        dragOffset = null;
        dragConnections = null;
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
    const isComponentContext = !!(contextTarget && !contextTarget.connection);
    compItems.forEach(li => li.style.display = isComponentContext ? 'block' : 'none');
    connItems.forEach(li => li.style.display = contextTarget && contextTarget.connection ? 'block' : 'none');
    canvasItems.forEach(li => li.style.display = contextTarget ? 'none' : 'block');
    const copyPropsItem = menu.querySelector('[data-action="copy-properties"]');
    if (copyPropsItem) copyPropsItem.style.display = isComponentContext ? 'block' : 'none';
    const pastePropsItem = menu.querySelector('[data-action="paste-properties"]');
    if (pastePropsItem) {
      const canPaste = isComponentContext && canPastePropertyClipboard(propertyClipboard, contextTarget);
      pastePropsItem.style.display = canPaste ? 'block' : 'none';
    }
    const rect = canvasScroll?.getBoundingClientRect();
    if (rect) {
      const scrollLeft = canvasScroll?.scrollLeft ?? 0;
      const scrollTop = canvasScroll?.scrollTop ?? 0;
      const left = e.clientX - rect.left + scrollLeft;
      const top = e.clientY - rect.top + scrollTop;
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    } else {
      menu.style.left = `${e.pageX}px`;
      menu.style.top = `${e.pageY}px`;
    }
    menu.style.display = 'block';
  });

  const getContextTargets = target => {
    if (!target) return [];
    if (selection.length && selection.includes(target)) {
      return selection.slice();
    }
    return [target];
  };

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
      const targets = getContextTargets(contextTarget);
      if (!targets.length) return;
      const current = contextTarget.label || '';
      const next = prompt('Component label', current);
      if (next !== null) {
        const trimmed = next.trim();
        if (!trimmed) {
          showToast('Label cannot be empty');
        } else {
          let changed = false;
          targets.forEach(comp => {
            if ((comp.label || '') !== trimmed) {
              comp.label = trimmed;
              changed = true;
            }
          });
          if (changed) {
            pushHistory();
            render();
            save();
          }
        }
      }
    } else if (action === 'copy-properties' && contextTarget && !contextTarget.connection) {
      const clipboardData = createPropertyClipboardFromComponent(contextTarget);
      if (clipboardData) {
        propertyClipboard = clipboardData;
        showToast('Properties copied');
      } else {
        propertyClipboard = null;
        showToast('No properties available to copy');
      }
    } else if (action === 'paste-properties' && contextTarget && !contextTarget.connection) {
      const targets = getContextTargets(contextTarget).filter(comp => comp && !comp.isVirtualNode);
      if (!propertyClipboard || !propertyClipboard.data) {
        showToast('Copy properties from a device first');
      } else if (!targets.length) {
        showToast('Select a device to paste properties');
      } else if (targets.some(target => !canPastePropertyClipboard(propertyClipboard, target))) {
        showToast('Properties can only be pasted to devices of the same type');
      } else {
        let changed = false;
        targets.forEach(target => {
          if (applyPropertyClipboardToComponent(target, propertyClipboard)) changed = true;
        });
        if (changed) {
          pushHistory();
          render();
          save();
          syncSchedules();
          showToast('Properties pasted');
        } else {
          showToast('Properties already match');
        }
      }
    } else if (action === 'disconnect' && contextTarget) {
      const targets = getContextTargets(contextTarget);
      if (!targets.length) return;
      const targetIds = new Set(targets.map(t => t.id));
      let changed = false;
      targets.forEach(comp => {
        if (Array.isArray(comp.connections) && comp.connections.length) {
          comp.connections = [];
          changed = true;
        }
      });
      components.forEach(comp => {
        if (!Array.isArray(comp.connections) || !comp.connections.length) return;
        const filtered = comp.connections.filter(conn => !targetIds.has(conn.target));
        if (filtered.length !== comp.connections.length) {
          comp.connections = filtered;
          changed = true;
          if (selectedConnection && selectedConnection.component === comp) {
            selectedConnection = null;
          }
        }
      });
      if (selectedConnection && targetIds.has(selectedConnection.component?.id)) {
        selectedConnection = null;
      }
      if (changed) {
        pushHistory();
        render();
        save();
      }
    } else if (action === 'delete' && contextTarget) {
      const targets = getContextTargets(contextTarget);
      if (!targets.length) return;
      const ids = new Set(targets.map(c => c.id));
      components = components.filter(c => !ids.has(c.id));
      components.forEach(c => {
        c.connections = (c.connections || []).filter(conn => !ids.has(conn.target));
      });
      selection = selection.filter(c => !ids.has(c.id));
      selected = selection[0] || null;
      selectedConnection = null;
      pushHistory();
      render();
      save();
      const modal = ensurePropModal();
      if (modal) modal.classList.remove('show');
    } else if (action === 'duplicate' && contextTarget) {
      const targets = getContextTargets(contextTarget);
      if (!targets.length) return;
      const base = Date.now();
      const idMap = {};
      const newComps = targets.map((comp, idx) => {
        const clone = {
          ...JSON.parse(JSON.stringify(comp)),
          id: 'n' + (base + idx),
          x: comp.x + gridSize,
          y: comp.y + gridSize,
          connections: (comp.connections || []).map(conn => ({ ...conn }))
        };
        idMap[comp.id] = clone.id;
        applyNextLabel(clone);
        return clone;
      });
      newComps.forEach(clone => {
        clone.connections = (clone.connections || [])
          .filter(conn => idMap[conn.target])
          .map(conn => ({ ...conn, target: idMap[conn.target] }));
      });
      components.push(...newComps);
      selection = newComps;
      selected = newComps[0] || null;
      selectedConnection = null;
      pushHistory();
      render();
      save();
    } else if (action === 'rotate' && contextTarget) {
      const targets = getContextTargets(contextTarget);
      if (!targets.length) return;
      targets.forEach(comp => {
        comp.rotation = ((comp.rotation || 0) + 90) % 360;
      });
      selectedConnection = null;
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
  svg.addEventListener('mouseenter', e => {
    const coords = toDiagramCoords(e);
    const pointerX = coords.x;
    const pointerY = coords.y;
    if (Number.isFinite(pointerX) && Number.isFinite(pointerY)) {
      cursorPos = { x: pointerX, y: pointerY };
      cursorPosValid = true;
    }
  });
  svg.addEventListener('mouseleave', () => {
    cursorPosValid = false;
  });
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
  const shouldOpenComponentModal = params.has('componentModal');
  if (focus) {
    const comp = components.find(c => c.id === focus);
    if (comp) {
      selectComponent(comp);
    } else if (shouldOpenComponentModal) {
      selectComponent();
    }
  } else if (shouldOpenComponentModal) {
    selectComponent();
  }

  initSettings();
  initDarkMode();
  initCompactMode();
  initNavToggle();
}

function getCategory(c) {
  return c.type || subtypeCategory[c.subtype];
}

function formatLoadFlowCurrentValue(value) {
  if (value === null || value === undefined) return '';
  const normalize = val => {
    const num = Number(val);
    if (!Number.isFinite(num)) return null;
    return num.toFixed(1);
  };
  if (typeof value === 'object') {
    const entries = Array.isArray(value)
      ? value.map((val, idx) => [idx, val])
      : Object.entries(value);
    const parts = entries
      .map(([phase, val]) => {
        const formatted = normalize(val);
        if (formatted === null) return null;
        const label = String(phase).trim();
        return { phase: label, formatted };
      })
      .filter(Boolean)
      .sort((a, b) => a.phase.localeCompare(b.phase, undefined, { sensitivity: 'base', numeric: true }))
      .map(entry => `${entry.phase}:${entry.formatted}`);
    return parts.join(', ');
  }
  const formatted = normalize(value);
  return formatted === null ? '' : formatted;
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
  spec.load_flow_current = formatLoadFlowCurrentValue(outbound?.loading_amps);
  comp.cable = {
    ...comp.cable,
    calc_ampacity: spec.calc_ampacity,
    voltage_drop_pct: spec.voltage_drop_pct,
    sizing_warning: spec.sizing_warning,
    code_reference: spec.code_reference,
    sizing_report: spec.sizing_report,
    length: spec.length,
    manual_length: spec.manual_length,
    load_flow_current: spec.load_flow_current
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

function resolveComponentVoltageVolts(comp, options = {}) {
  if (!comp || typeof comp !== 'object') return null;
  const { includeOperatingVoltage = true } = options;
  const containers = [];
  if (comp.props && typeof comp.props === 'object') containers.push(comp.props);
  if (comp.parameters && typeof comp.parameters === 'object') containers.push(comp.parameters);
  if (comp.cable && typeof comp.cable === 'object') containers.push(comp.cable);
  containers.push(comp);
  const primaryKeys = [
    'rated_voltage',
    'rated_volts',
    'voltage_rating',
    'voltage',
    'volts',
    'voltage_v',
    'voltage_kv'
  ];
  const directKeys = includeOperatingVoltage ? [...primaryKeys, 'operating_voltage'] : primaryKeys;
  for (const container of containers) {
    if (!container || typeof container !== 'object') continue;
    for (const key of directKeys) {
      if (!(key in container)) continue;
      const resolved = normalizeVoltageToVolts(container[key]);
      if (resolved !== null && Number.isFinite(resolved) && resolved > 0) {
        return resolved;
      }
    }
  }
  const baseKeys = ['baseKV', 'kV', 'kv', 'nominalVoltage', 'nominal_voltage', 'prefault_voltage'];
  for (const container of containers) {
    if (!container || typeof container !== 'object') continue;
    for (const key of baseKeys) {
      if (!(key in container)) continue;
      const base = toBaseKV(container[key]);
      if (Number.isFinite(base) && base > 0) {
        return base * 1000;
      }
    }
  }
  return null;
}

function resolveConnectionVoltageVolts(component, connection, role) {
  if (!component) return null;
  if (component.type === 'transformer' && connection) {
    const portIndex = role === 'target'
      ? normalizePortIndex(connection?.targetPort)
      : normalizePortIndex(connection?.sourcePort);
    if (Number.isFinite(portIndex)) {
      const portVoltage = resolveTransformerVoltageValue(component, portIndex);
      const normalized = normalizeVoltageToVolts(portVoltage);
      if (normalized !== null && Number.isFinite(normalized) && normalized > 0) {
        return normalized;
      }
    }
  }
  return resolveComponentVoltageVolts(component);
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
    const tooltipVoltage = resolveComponentVoltageVolts(comp);
    if (Number.isFinite(tooltipVoltage) && tooltipVoltage > 0) {
      tip.push(`Voltage: ${formatVoltage(tooltipVoltage)}`);
    } else if (comp.voltage) {
      tip.push(`Voltage: ${comp.voltage}`);
    }
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
      if (target) {
        const srcVolt = resolveConnectionVoltageVolts(c, conn, 'source');
        const tgtVolt = resolveConnectionVoltageVolts(target, conn, 'target');
        if (srcVolt !== null && tgtVolt !== null) {
          const diff = Math.abs(srcVolt - tgtVolt);
          const tolerance = Math.max(1, Math.min(srcVolt, tgtVolt) * 0.005);
          if (diff > tolerance) {
            const srcLabel = formatVoltage(srcVolt);
            const tgtLabel = formatVoltage(tgtVolt);
            validationIssues.push({
              component: c.id,
              message: `Voltage mismatch with ${target.label || target.subtype || target.id} (${srcLabel} vs ${tgtLabel})`
            });
            validationIssues.push({
              component: target.id,
              message: `Voltage mismatch with ${c.label || c.subtype || c.id} (${tgtLabel} vs ${srcLabel})`
            });
          }
        }
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
      const value = typeof f.getValue === 'function'
        ? f.getValue(c)
        : c[f.name];
      fields[f.name] = value ?? f.default ?? fields[f.name] ?? '';
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
      spec.load_flow_current = formatLoadFlowCurrentValue(conn.loading_amps);
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
        const value = typeof f.getValue === 'function'
          ? f.getValue(c)
          : c[f.name];
        fields[f.name] = value ?? fields[f.name] ?? '';
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
        spec.load_flow_current = formatLoadFlowCurrentValue(conn.loading_amps);
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

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import {
  getItem,
  setItem,
  getOneLine,
  setOneLine,
  getStudies,
  setStudies,
  on,
  STORAGE_KEYS
} from '../dataStore.mjs';
import { runShortCircuit } from './shortCircuit.mjs';
import { scaleCurve, checkDuty, sanitizeCurve } from './tccUtils.js';
import { openModal } from '../src/components/modal.js';
import conductorProperties from '../conductorPropertiesData.mjs';
import componentLibrary from '../componentLibrary.json' with { type: 'json' };

const PROTECTIVE_TYPES = new Set(['breaker', 'fuse', 'relay', 'recloser', 'contactor', 'switch']);
const MOTOR_TYPES = new Set(['motor_load', 'motor', 'motor_starter', 'motor_controller']);
const CMIL_TO_MM2 = 0.000506707478; // 1 circular mil in mm^2
const DEFAULT_INRUSH_MULTIPLE = 12;
const DEFAULT_INRUSH_DURATION = 0.1;
const CABLE_TIME_POINTS = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
const TRANSFORMER_DAMAGE_TEMPLATE = [
  { multiple: 1.5, time: 600 },
  { multiple: 2, time: 300 },
  { multiple: 4, time: 30 },
  { multiple: 6, time: 10 },
  { multiple: 12, time: 2 },
  { multiple: 25, time: 0.5 },
  { multiple: 40, time: 0.1 }
];
const MOTOR_START_PRETIME_RATIO = 0.2;
const MOTOR_START_POSTTIME_RATIO = 1.1;
const MOTOR_START_MIN_PRETIME = 0.01;
const MOTOR_START_PLOT_FLOOR = 0.01;
const MOTOR_START_PLOT_CEILING = 10000;
const K_CONSTANTS = {
  copper: { 60: 103, 75: 118, 90: 143 },
  aluminum: { 60: 75, 75: 87, 90: 99 }
};
const CUSTOM_CURVE_VENDOR_FALLBACK = 'Custom Curves';
const CUSTOM_CURVE_CATEGORY = 'custom curve';
const CUSTOM_CURVE_DEFAULT_AXES = { currentMin: 10, currentMax: 10000, timeMin: 0.01, timeMax: 100 };
const CUSTOM_CURVE_DEFAULT_BOUNDS = { left: 0, right: 0, top: 0, bottom: 0 };

const baseHref = document.querySelector('base')?.href || new URL('.', window.location.href).href;
const asset = path => {
  if (!path) return null;
  try {
    return new URL(path, baseHref).href;
  } catch {
    return null;
  }
};

const placeholderIcon = asset('icons/placeholder.svg');

function compKey(type, subtype) {
  const normalizedType = typeof type === 'string' ? type.trim() : '';
  const normalizedSubtype = typeof subtype === 'string' ? subtype.trim() : '';
  if (normalizedSubtype && normalizedType) return `${normalizedType}_${normalizedSubtype}`;
  return normalizedSubtype || normalizedType;
}

function resolveIconSource(iconPath, fallbackSymbol) {
  if (typeof iconPath === 'string' && iconPath.trim()) {
    const trimmed = iconPath.trim();
    if (trimmed.startsWith('data:') || /^https?:/i.test(trimmed)) {
      return trimmed;
    }
    return asset(trimmed) || placeholderIcon;
  }
  if (fallbackSymbol) {
    return asset(`icons/components/${fallbackSymbol}.svg`) || placeholderIcon;
  }
  return placeholderIcon;
}

const PREVIEW_SHAPE_DASH_PATTERNS = {
  solid: '',
  dashed: '8 4',
  dotted: '2 2'
};

const clampValue = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

function normalizeAnnotationPreview(comp) {
  if (!comp || comp.type !== 'annotation') return null;
  const subtype = typeof comp.subtype === 'string' ? comp.subtype.trim() : '';
  const rawProps = comp.props && typeof comp.props === 'object' ? comp.props : {};
  const pick = key => {
    const direct = comp[key];
    if (direct !== undefined && direct !== null && direct !== '') return direct;
    return rawProps[key];
  };
  const shapeTypeRaw = pick('shapeType');
  const strokeStyleRaw = pick('strokeStyle');
  const cornerRadiusRaw = pick('cornerRadius');
  const strokeWidthRaw = pick('strokeWidth');
  const fillOpacityRaw = pick('fillOpacity');
  let shapeType = typeof shapeTypeRaw === 'string' ? shapeTypeRaw.trim().toLowerCase() : '';
  if (shapeType === 'rounded_rectangle') shapeType = 'rounded';
  if (!['rectangle', 'rounded', 'circle'].includes(shapeType)) shapeType = 'rectangle';
  let strokeStyle = typeof strokeStyleRaw === 'string' ? strokeStyleRaw.trim().toLowerCase() : 'solid';
  if (!['solid', 'dashed', 'dotted'].includes(strokeStyle)) strokeStyle = 'solid';
  let cornerRadius = Number(cornerRadiusRaw);
  if (!Number.isFinite(cornerRadius) || cornerRadius < 0) cornerRadius = 12;
  let strokeWidth = Number(strokeWidthRaw);
  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) strokeWidth = 2;
  let fillOpacity = Number(fillOpacityRaw);
  if (!Number.isFinite(fillOpacity)) fillOpacity = 1;
  fillOpacity = Math.max(0, Math.min(1, fillOpacity));
  const strokeColor = typeof pick('strokeColor') === 'string' && pick('strokeColor').trim()
    ? pick('strokeColor').trim()
    : '#333333';
  const fillColor = typeof pick('fillColor') === 'string' && pick('fillColor').trim()
    ? pick('fillColor').trim()
    : '#ffffff';
  const text = typeof pick('text') === 'string' ? pick('text') : (typeof comp.text === 'string' ? comp.text : '');
  return {
    subtype,
    shapeType,
    strokeStyle,
    strokeColor,
    fillColor,
    fillOpacity,
    strokeWidth,
    cornerRadius,
    text
  };
}

function buildComponentPreviewDefinitionMap() {
  const map = new Map();
  const register = (definition, { allowOverride = true } = {}) => {
    if (!definition || typeof definition !== 'object') return;
    const rawSubtype = typeof definition.subtype === 'string' ? definition.subtype.trim() : '';
    const rawType = typeof definition.type === 'string' ? definition.type.trim() : '';
    const rawCategory = typeof definition.category === 'string' ? definition.category.trim() : '';
    const resolvedType = rawType || rawCategory || rawSubtype;
    if (!rawSubtype && !resolvedType) return;
    const meta = {
      icon: resolveIconSource(definition.icon, definition.symbol),
      width: Number.isFinite(Number(definition.width)) ? Number(definition.width) : null,
      height: Number.isFinite(Number(definition.height)) ? Number(definition.height) : null,
      type: resolvedType,
      subtype: rawSubtype,
      category: rawCategory,
      defaultRotation: Number.isFinite(Number(definition.defaultRotation))
        ? Number(definition.defaultRotation)
        : null
    };
    const keys = new Set();
    if (resolvedType && rawSubtype) keys.add(compKey(resolvedType, rawSubtype));
    if (rawSubtype) keys.add(rawSubtype);
    if (resolvedType) keys.add(resolvedType);
    if (rawCategory) keys.add(rawCategory);
    keys.forEach(key => {
      if (!key) return;
      if (!map.has(key) || allowOverride) {
        map.set(key, meta);
      }
    });
  };

  const definitions = Array.isArray(componentLibrary?.components) ? componentLibrary.components : [];
  definitions.forEach(def => register(def));

  const fallbackDefinitions = [
    {
      type: 'bus',
      subtype: 'Bus',
      icon: 'icons/components/Bus.svg',
      width: 200,
      height: 20,
      category: 'bus'
    },
    {
      type: 'equipment',
      subtype: 'Equipment',
      icon: 'icons/components/Equipment.svg',
      width: 120,
      height: 60,
      category: 'equipment'
    },
    {
      type: 'motor_load',
      subtype: 'motor_load',
      icon: 'icons/components/Motor.svg',
      width: 100,
      height: 100,
      category: 'load'
    },
    {
      type: 'static_load',
      subtype: 'static_load',
      icon: 'icons/components/Load.svg',
      width: 100,
      height: 100,
      category: 'load'
    },
    {
      type: 'transformer',
      subtype: 'two_winding',
      icon: 'icons/components/Transformer.svg',
      width: 140,
      height: 90,
      category: 'equipment'
    }
  ];

  fallbackDefinitions.forEach(def => register(def, { allowOverride: false }));

  return map;
}

const componentPreviewDefinitionMap = buildComponentPreviewDefinitionMap();

function getPreviewDefinition(comp) {
  if (!comp) return null;
  const type = typeof comp.type === 'string' ? comp.type.trim() : '';
  const subtype = typeof comp.subtype === 'string' ? comp.subtype.trim() : '';
  const category = typeof comp.category === 'string' ? comp.category.trim() : '';
  const keys = [
    compKey(type || category || subtype, subtype),
    subtype,
    type,
    category
  ];
  for (const key of keys) {
    if (!key) continue;
    const meta = componentPreviewDefinitionMap.get(key);
    if (meta) return meta;
  }
  return null;
}

let pdfJsLibPromise = null;

function ensurePdfJs() {
  if (pdfJsLibPromise) return pdfJsLibPromise;
  pdfJsLibPromise = import('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.7.107/build/pdf.min.mjs')
    .then(module => {
      if (module?.GlobalWorkerOptions) {
        module.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.7.107/build/pdf.worker.min.js';
      }
      return module;
    })
    .catch(err => {
      pdfJsLibPromise = null;
      throw err;
    });
  return pdfJsLibPromise;
}

const deviceSelect = document.getElementById('device-select');
const deviceModalBtn = document.getElementById('device-modal-btn');
const selectedSummary = document.getElementById('selected-device-summary');
const settingsDiv = document.getElementById('device-settings');
const plotBtn = document.getElementById('plot-btn');
const customCurveBtn = document.getElementById('custom-curve-btn');
const linkBtn = document.getElementById('link-btn');
const openBtn = document.getElementById('open-btn');
const componentModalBtn = document.getElementById('component-modal-btn');
const violationDiv = document.getElementById('violation');
const printPlotBtn = document.getElementById('print-plot-btn');
const annotationBtn = document.getElementById('add-annotation-btn');
const viewMenuBtn = document.getElementById('tcc-view-menu-btn');
const chart = d3.select('#tcc-chart');
const onelinePreviewSvgEl = document.getElementById('oneline-preview');
const onelinePreviewSvg = onelinePreviewSvgEl ? d3.select(onelinePreviewSvgEl) : null;
const onelinePreviewContainer = document.querySelector('.tcc-oneline-preview');
const onelinePreviewEmpty = document.getElementById('oneline-preview-empty');
const onelinePreviewNote = document.getElementById('oneline-preview-note');
const contextMenu = createContextMenu();
const viewCalloutOffsets = new Map();

let onelinePreviewTransform = null;
const previewPositionOverrides = new Map();

let updatingActiveComponentFromSelect = false;


const TCC_VIEW_OPTIONS = [
  { id: 'none', label: 'No Additional View', field: null, description: 'Hide device settings in the legend.' },
  { id: 'pickup', label: 'Pickup', field: 'pickup', unit: 'A', shortLabel: 'Pickup', description: 'Display the long-time pickup current.' },
  { id: 'time', label: 'Delay', field: 'time', unit: 's', shortLabel: 'Delay', description: 'Display the long-time delay setting.' },
  { id: 'shortTimePickup', label: 'Short-Time Pickup', field: 'shortTimePickup', unit: 'A', shortLabel: 'ST Pickup', description: 'Display the short-time pickup current.' },
  { id: 'shortTimeDelay', label: 'Short-Time Delay', field: 'shortTimeDelay', unit: 's', shortLabel: 'ST Delay', description: 'Display the short-time delay setting.' },
  { id: 'instantaneousPickup', label: 'Instantaneous Pickup (INST)', field: 'instantaneousPickup', unit: 'A', shortLabel: 'INST', description: 'Display the instantaneous pickup current.' },
  { id: 'instantaneousDelay', label: 'Instantaneous Delay', field: 'instantaneousDelay', unit: 's', shortLabel: 'INST Delay', description: 'Display the instantaneous delay setting.' },
  { id: 'instantaneousMax', label: 'Instantaneous Max', field: 'instantaneousMax', unit: 'A', shortLabel: 'INST Max', description: 'Display the instantaneous ceiling current.' },
  { id: 'curveProfile', label: 'Curve Profile', field: 'curveProfileLabel', shortLabel: 'Curve', description: 'Display the selected curve profile.' }
];

const viewOptionMap = new Map(TCC_VIEW_OPTIONS.map(option => [option.id, option]));

const CUSTOM_CURVE_SETTING_OPTIONS = TCC_VIEW_OPTIONS
  .filter(option => option.field)
  .map(option => ({
    field: option.field,
    label: option.label,
    unit: option.unit || '',
    numeric: !!option.unit
  }));

const CUSTOM_CURVE_SETTING_CONFIG = new Map(
  CUSTOM_CURVE_SETTING_OPTIONS.map(option => [option.field, option])
);

function normalizeViewOption(id) {
  if (typeof id !== 'string') return 'none';
  const trimmed = id.trim();
  return viewOptionMap.has(trimmed) ? trimmed : 'none';
}

function normalizeViewOptionList(input) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];
  const seen = new Set();
  const normalized = [];
  list.forEach(value => {
    const normalizedValue = normalizeViewOption(value);
    if (normalizedValue === 'none') return;
    if (seen.has(normalizedValue)) return;
    seen.add(normalizedValue);
    normalized.push(normalizedValue);
  });
  return normalized;
}

function getActiveViewConfigs() {
  return activeViewOptions
    .map(id => viewOptionMap.get(id))
    .filter(option => option && option.field);
}

function formatViewValue(option, value) {
  if (!option) return null;
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    const formatted = formatSettingValue(value);
    if (!formatted && formatted !== '0') return null;
    return option.unit ? `${formatted} ${option.unit}`.trim() : formatted;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return option.unit ? `${trimmed} ${option.unit}`.trim() : trimmed;
  }
  return null;
}

function formatViewSummaries(entry) {
  if (!entry || !entry.scaled || !entry.scaled.settings) return [];
  return getActiveViewConfigs()
    .map(option => {
      const raw = entry.scaled.settings[option.field];
      const formatted = formatViewValue(option, raw);
      if (!formatted) return null;
      const prefix = option.shortLabel || option.label;
      return `${prefix}: ${formatted}`;
    })
    .filter(Boolean);
}

function summarizeActiveViewLabels() {
  const configs = getActiveViewConfigs();
  if (!configs.length) return null;
  if (configs.length === 1) {
    return configs[0].shortLabel || configs[0].label;
  }
  const labels = configs.map(option => option.shortLabel || option.label);
  if (labels.length <= 2) {
    return labels.join(', ');
  }
  return `${labels[0]}, ${labels[1]}, +${labels.length - 2}`;
}

function estimateLegendItemMetrics(label, viewSummaries) {
  const baseLabel = typeof label === 'string' && label.trim() ? label.trim() : 'Device';
  const summaries = Array.isArray(viewSummaries) ? viewSummaries : [];
  const textWidth = Math.ceil(baseLabel.length * 7);
  const iconWidth = 24; // icon plus spacing before text
  const badgeWidths = summaries.map(summary => {
    const trimmed = summary ? String(summary) : '';
    const estimatedText = Math.ceil(trimmed.length * 6.5);
    return Math.max(32, estimatedText + 16);
  });
  const badgeSpacing = badgeWidths.length > 1 ? (badgeWidths.length - 1) * 8 : 0;
  const badgesWidth = badgeWidths.reduce((sum, value) => sum + value, 0) + badgeSpacing;
  const width = iconWidth + textWidth + (badgeWidths.length ? 8 + badgesWidth : 0);
  const height = 20 + (badgeWidths.length ? 26 : 0);
  return { width, height };
}

function computeLegendLayout(entries, availableWidth) {
  const layouts = [];
  if (!Array.isArray(entries) || !entries.length) {
    return { layouts, height: 0 };
  }
  const safeWidth = Number.isFinite(availableWidth) && availableWidth > 0 ? availableWidth : 400;
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  const columnSpacing = 16;
  const rowSpacing = 12;

  entries.forEach(entry => {
    const baseLabel = entry.selection?.name || entry.name || entry.selection?.baseDevice?.name || '';
    const legendLabel = baseLabel || entry.name || entry.selection?.baseDevice?.name || 'Device';
    const viewSummaries = formatViewSummaries(entry);
    const metrics = estimateLegendItemMetrics(legendLabel, viewSummaries);
    if (cursorX > 0 && cursorX + metrics.width > safeWidth) {
      cursorX = 0;
      cursorY += rowHeight + rowSpacing;
      rowHeight = 0;
    }
    layouts.push({ entry, x: cursorX, y: cursorY, width: metrics.width, height: metrics.height, legendLabel, viewSummaries });
    cursorX += metrics.width + columnSpacing;
    rowHeight = Math.max(rowHeight, metrics.height);
  });

  const totalHeight = layouts.length ? cursorY + rowHeight : 0;
  return { layouts, height: totalHeight };
}

function updateViewButtonLabel() {
  if (!viewMenuBtn) return;
  const summary = summarizeActiveViewLabels();
  if (!summary) {
    viewMenuBtn.textContent = 'Views';
    viewMenuBtn.title = 'Select device characteristics to display on the chart';
  } else {
    viewMenuBtn.textContent = `Views (${summary})`;
    viewMenuBtn.title = `Showing ${summary}`;
  }
  viewMenuBtn.disabled = false;
}

function setActiveViewOptions(optionIds, { persist = true } = {}) {
  const normalized = normalizeViewOptionList(optionIds);
  const changed = normalized.length !== activeViewOptions.length
    || normalized.some((value, index) => value !== activeViewOptions[index]);
  activeViewOptions = normalized;
  if (changed) updateViewButtonLabel();
  if (persist) {
    saved.viewOptions = [...activeViewOptions];
    setItem('tccSettings', saved);
  }
}

const params = new URLSearchParams(window.location.search);
const compId = params.get('component');
const deviceParam = params.get('device');
const annotationBtnDefaultLabel = annotationBtn ? annotationBtn.textContent : 'Add Annotation';
const ANNOTATION_ACTIVE_LABEL = 'Click chart to place annotation';
const DEFAULT_PRINT_HEADER = 'Time-Current Curves';
const DEFAULT_PRINT_FOOTER = 'Generated by CableTrayRoute';
const ANNOTATION_DRAG_STATE = Symbol('tccAnnotationDragState');

let libraryDevices = [];
let deviceEntries = [];
let deviceMap = new Map();
let deviceGroups = [];
let componentRecords = [];
let componentLookup = new Map();
let neighborMap = new Map();
let connectionIndex = new Map();
let componentDeviceMap = new Map();
let pendingPlotRefresh = null;
let activeComponentId = compId || null;
let annotationMode = false;
let annotations = [];
let annotationContext = null;

function getActiveComponentId() {
  if (!activeComponentId) return null;
  if (!componentLookup.has(activeComponentId)) return null;
  return activeComponentId;
}

function updateComponentContextUI() {
  const hasContext = Boolean(
    activeComponentId
    && (componentLookup.size === 0 || componentLookup.has(activeComponentId))
  );
  if (openBtn) {
    openBtn.style.display = hasContext ? 'inline-block' : 'none';
  }
}

if (compId) {
  linkBtn.style.display = 'inline-block';
}
updateComponentContextUI();

const MAX_NEIGHBOR_DEPTH = 4;

const OVERLAY_GROUP_LABELS = {
  inrush: 'Transformer Inrush',
  transformerDamage: 'Transformer Damage',
  cable: 'Cable Damage',
  motorStart: 'Motor Starting',
  motorThermal: 'Motor Thermal Limit'
};
const SYSTEM_OVERLAY_GROUP = 'System Curves';
const COMPONENT_FALLBACK_GROUP = 'One-Line Devices';
const LIBRARY_FALLBACK_GROUP = 'Library Devices';
const OTHER_MANUFACTURER_GROUP = 'Other Manufacturers';
const OVERLAY_GROUP_SET = new Set([...Object.values(OVERLAY_GROUP_LABELS), SYSTEM_OVERLAY_GROUP]);

const TYPE_LABEL_OVERRIDES = {
  'lv breaker': 'LV Breaker',
  'mv breaker': 'MV Breaker',
  'hv breaker': 'HV Breaker',
  'custom curve': 'Custom Curves',
  ats: 'ATS',
  ups: 'UPS'
};

const TYPE_PRIORITY = new Map([
  ['lv breaker', -6],
  ['mv breaker', -5],
  ['breaker', -4],
  ['fuse', -3],
  ['relay', -2],
  ['recloser', -1],
  ['custom curve', -0.5],
  ['contactor', 0],
  ['switch', 1],
  ['transformer', 2],
  ['motor', 3],
  ['cable', 4],
  ['system', 5],
  ['other', 6]
]);

function loadSavedSettings() {
  const stored = getItem('tccSettings') || {};
  if (!Array.isArray(stored.devices)) stored.devices = [];
  if (!stored.settings || typeof stored.settings !== 'object') stored.settings = {};
  if (!stored.componentOverrides || typeof stored.componentOverrides !== 'object') stored.componentOverrides = {};
  if (!stored.overlaySelections || typeof stored.overlaySelections !== 'object') stored.overlaySelections = {};
  if (!Array.isArray(stored.annotations)) stored.annotations = [];
  if (typeof stored.printHeader !== 'string') stored.printHeader = '';
  if (typeof stored.printFooter !== 'string') stored.printFooter = '';
  if (!Array.isArray(stored.viewOptions)) {
    if (Array.isArray(stored.viewOption)) {
      stored.viewOptions = normalizeViewOptionList(stored.viewOption);
    } else if (typeof stored.viewOption === 'string') {
      stored.viewOptions = normalizeViewOptionList(stored.viewOption);
    } else {
      stored.viewOptions = [];
    }
  } else {
    stored.viewOptions = normalizeViewOptionList(stored.viewOptions);
  }
  delete stored.viewOption;
  if (typeof stored.printIncludePreview !== 'boolean') stored.printIncludePreview = false;
  if (!Array.isArray(stored.customCurves)) stored.customCurves = [];
  stored.customCurves = stored.customCurves.map(sanitizeCustomCurve).filter(Boolean);
  if (!Number.isFinite(stored.customCurveCounter)) {
    stored.customCurveCounter = stored.customCurves.reduce((max, curve) => {
      const seq = Number(curve.sequence);
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
  }
  if (!stored.previewLayouts || typeof stored.previewLayouts !== 'object') {
    stored.previewLayouts = {};
  } else {
    Object.keys(stored.previewLayouts).forEach(key => {
      const layout = stored.previewLayouts[key];
      if (!layout || typeof layout !== 'object') {
        delete stored.previewLayouts[key];
        return;
      }
      const cleaned = {};
      Object.keys(layout).forEach(componentId => {
        const point = layout[componentId];
        const x = Number(point?.x);
        const y = Number(point?.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          cleaned[componentId] = { x, y };
        }
      });
      stored.previewLayouts[key] = cleaned;
    });
  }
  let maxSequence = Number.isFinite(stored.customCurveCounter) ? stored.customCurveCounter : 0;
  stored.customCurves.forEach(curve => {
    if (!Number.isFinite(curve.sequence)) {
      maxSequence += 1;
      curve.sequence = maxSequence;
    } else {
      maxSequence = Math.max(maxSequence, curve.sequence);
    }
  });
  stored.customCurveCounter = maxSequence;
  return stored;
}

function createContextMenu() {
  const menu = document.createElement('ul');
  menu.id = 'tcc-context-menu';
  menu.className = 'context-menu';
  menu.tabIndex = -1;
  document.body.appendChild(menu);
  let visible = false;

  const hide = () => {
    if (!visible) return;
    visible = false;
    menu.style.display = 'none';
    menu.style.visibility = '';
    menu.innerHTML = '';
  };

  const show = (event, items) => {
    if (!items || !items.length) {
      hide();
      return;
    }
    event.preventDefault();
    hide();
    menu.innerHTML = '';
    items.forEach(item => {
      if (!item || typeof item.label !== 'string') return;
      const li = document.createElement('li');
      li.textContent = item.label;
      if (item.disabled) {
        li.classList.add('is-disabled');
      } else if (typeof item.onSelect === 'function') {
        li.addEventListener('click', () => {
          hide();
          item.onSelect();
        }, { once: true });
      }
      menu.appendChild(li);
    });
    if (!menu.childElementCount) {
      hide();
      return;
    }
    menu.style.display = 'block';
    menu.style.visibility = 'hidden';
    menu.style.left = '0px';
    menu.style.top = '0px';
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const rect = menu.getBoundingClientRect();
    const left = Math.min(event.clientX, viewportWidth - rect.width - 4);
    const top = Math.min(event.clientY, viewportHeight - rect.height - 4);
    menu.style.left = `${Math.max(0, left)}px`;
    menu.style.top = `${Math.max(0, top)}px`;
    menu.style.visibility = 'visible';
    visible = true;
    setTimeout(() => {
      try {
        menu.focus({ preventScroll: true });
      } catch (err) {
        // Ignore focus errors in browsers that disallow focusing lists
      }
    }, 0);
  };

  const handleOutside = event => {
    if (!visible) return;
    if (menu.contains(event.target)) return;
    hide();
  };

  document.addEventListener('click', handleOutside);
  document.addEventListener('contextmenu', handleOutside);
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      hide();
    }
  });

  return { show, hide, element: menu };
}

function createCustomCurveId(counter = null) {
  if (Number.isFinite(counter) && counter >= 0) {
    return `custom-curve-${counter}`;
  }
  return `custom-curve-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function sanitizeAxisSpec(raw = {}) {
  if (!raw || typeof raw !== 'object') return {};
  const axis = {};
  const currentMin = Number(raw.currentMin ?? raw.minCurrent ?? raw.xMin ?? raw.minCurrentAmp);
  const currentMax = Number(raw.currentMax ?? raw.maxCurrent ?? raw.xMax ?? raw.maxCurrentAmp);
  const timeMin = Number(raw.timeMin ?? raw.minTime ?? raw.yMin ?? raw.minTimeSec);
  const timeMax = Number(raw.timeMax ?? raw.maxTime ?? raw.yMax ?? raw.maxTimeSec);
  if (Number.isFinite(currentMin) && currentMin > 0) axis.currentMin = currentMin;
  if (Number.isFinite(currentMax) && currentMax > 0) axis.currentMax = currentMax;
  if (Number.isFinite(timeMin) && timeMin > 0) axis.timeMin = timeMin;
  if (Number.isFinite(timeMax) && timeMax > 0) axis.timeMax = timeMax;
  if (axis.currentMin !== undefined && axis.currentMax !== undefined && axis.currentMax <= axis.currentMin) {
    const swap = axis.currentMin;
    axis.currentMin = Math.min(axis.currentMin, axis.currentMax / 1.5 || axis.currentMin);
    axis.currentMax = Math.max(swap, axis.currentMax);
  }
  if (axis.timeMin !== undefined && axis.timeMax !== undefined && axis.timeMax <= axis.timeMin) {
    const swap = axis.timeMin;
    axis.timeMin = Math.min(axis.timeMin, axis.timeMax / 1.5 || axis.timeMin);
    axis.timeMax = Math.max(swap, axis.timeMax);
  }
  return axis;
}

function sanitizeBoundsSpec(raw = {}) {
  if (!raw || typeof raw !== 'object') return {};
  const bounds = {};
  const left = Number(raw.left ?? raw.leftOffset ?? raw.xPadding ?? raw.paddingLeft);
  const right = Number(raw.right ?? raw.rightOffset ?? raw.paddingRight);
  const top = Number(raw.top ?? raw.topOffset ?? raw.paddingTop);
  const bottom = Number(raw.bottom ?? raw.bottomOffset ?? raw.paddingBottom);
  if (Number.isFinite(left) && left >= 0) bounds.left = left;
  if (Number.isFinite(right) && right >= 0) bounds.right = right;
  if (Number.isFinite(top) && top >= 0) bounds.top = top;
  if (Number.isFinite(bottom) && bottom >= 0) bounds.bottom = bottom;
  return bounds;
}

function sanitizeToleranceSpec(raw = {}) {
  if (!raw || typeof raw !== 'object') return undefined;
  const lower = Number(raw.timeLower ?? raw.lower ?? raw.timeLowerBound);
  const upper = Number(raw.timeUpper ?? raw.upper ?? raw.timeUpperBound);
  const tolerance = {};
  if (Number.isFinite(lower) && lower > 0) tolerance.timeLower = lower;
  if (Number.isFinite(upper) && upper > 0) tolerance.timeUpper = upper;
  return Object.keys(tolerance).length ? tolerance : undefined;
}

function sanitizeCustomCurveSettings(raw = {}) {
  if (!raw || typeof raw !== 'object') return {};
  const sanitized = {};
  Object.entries(raw).forEach(([field, value]) => {
    if (!CUSTOM_CURVE_SETTING_CONFIG.has(field)) return;
    const config = CUSTOM_CURVE_SETTING_CONFIG.get(field);
    if (config.numeric) {
      const numberValue = Number(value);
      if (Number.isFinite(numberValue) && numberValue >= 0) {
        sanitized[field] = numberValue;
      }
    } else if (value !== undefined && value !== null) {
      const strValue = String(value).trim();
      if (strValue) {
        sanitized[field] = strValue;
      }
    }
  });
  return sanitized;
}

const CUSTOM_CURVE_ALLOWED_ROLES = new Set(['melting', 'clearing', 'symmetrical_rms_peak']);

function normalizeCustomCurveRole(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return CUSTOM_CURVE_ALLOWED_ROLES.has(trimmed) ? trimmed : null;
}

function sanitizeCustomCurveProfiles(rawProfiles = []) {
  if (!Array.isArray(rawProfiles)) return [];
  const seenIds = new Set();
  let counter = 0;
  const ensureName = (name, index) => {
    if (typeof name === 'string' && name.trim()) return name.trim();
    return `Curve ${index + 1}`;
  };
  const syncCounter = id => {
    const match = /([0-9]+)$/.exec(id);
    if (match) {
      counter = Math.max(counter, Number(match[1]));
    }
  };
  const reserveId = candidate => {
    let base = '';
    if (typeof candidate === 'string' && candidate.trim()) {
      base = candidate.trim();
    } else if (Number.isFinite(candidate)) {
      base = `curve-${Math.abs(Math.trunc(candidate))}`;
    }
    if (!base) {
      counter += 1;
      base = `curve-${counter}`;
    }
    let id = base;
    syncCounter(id);
    while (seenIds.has(id)) {
      counter += 1;
      id = `${base}-${counter}`;
    }
    seenIds.add(id);
    syncCounter(id);
    return id;
  };
  return rawProfiles
    .map((profile, index) => {
      if (!profile || typeof profile !== 'object') return null;
      const id = reserveId(profile.id ?? profile.key ?? profile.name ?? profile.label ?? '');
      const name = ensureName(profile.name ?? profile.label, index);
      const pointsSource = Array.isArray(profile.curve)
        ? profile.curve
        : Array.isArray(profile.points)
          ? profile.points
          : [];
      const curve = sanitizeCurve(pointsSource);
      if (!curve.length) return null;
      const settings = sanitizeCustomCurveSettings(profile.settings ?? {});
      const tolerance = sanitizeToleranceSpec(profile.tolerance ?? {});
      const role = normalizeCustomCurveRole(profile.role ?? profile.kind);
      return {
        id,
        name,
        curve,
        settings,
        tolerance,
        role: role || undefined
      };
    })
    .filter(Boolean);
}

function sanitizeCustomCurve(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const curvePoints = Array.isArray(raw.curve)
    ? raw.curve
    : Array.isArray(raw.points)
      ? raw.points
      : [];
  let sanitizedPoints = sanitizeCurve(curvePoints);
  const profileSource = Array.isArray(raw.curveProfiles)
    ? raw.curveProfiles
    : Array.isArray(raw.curves)
      ? raw.curves
      : [];
  let curveProfiles = sanitizeCustomCurveProfiles(profileSource);
  if (!curveProfiles.length && sanitizedPoints.length) {
    curveProfiles = [
      {
        id: 'curve-1',
        name: 'Curve 1',
        curve: sanitizedPoints.map(point => ({ ...point })),
        settings: {}
      }
    ];
  }
  if (!sanitizedPoints.length && curveProfiles.length) {
    sanitizedPoints = curveProfiles[0].curve.map(point => ({ ...point }));
  }
  if (!sanitizedPoints.length) return null;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Custom Curve';
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : createCustomCurveId();
  const manufacturer = typeof raw.manufacturer === 'string' && raw.manufacturer.trim()
    ? raw.manufacturer.trim()
    : (typeof raw.vendor === 'string' && raw.vendor.trim() ? raw.vendor.trim() : '');
  const deviceType = typeof raw.deviceType === 'string' && raw.deviceType.trim()
    ? raw.deviceType.trim()
    : CUSTOM_CURVE_CATEGORY;
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const sequenceSource = raw.sequence ?? raw.order ?? raw.index ?? raw.position;
  const sequence = Number(sequenceSource);
  const tolerance = sanitizeToleranceSpec(raw.tolerance);
  const axes = sanitizeAxisSpec(raw.axes ?? raw.axis ?? {});
  const bounds = sanitizeBoundsSpec(raw.bounds ?? raw.padding ?? {});
  const settings = sanitizeCustomCurveSettings(raw.settings ?? raw.adjustableSettings ?? raw.deviceSettings ?? {});
  return {
    id,
    name,
    manufacturer,
    deviceType,
    description,
    curve: sanitizedPoints,
    curveProfiles,
    axes,
    bounds,
    settings,
    sequence: Number.isFinite(sequence) ? sequence : null,
    tolerance
  };
}

function sortCustomCurveList(list = []) {
  if (!Array.isArray(list)) return [];
  return list
    .slice()
    .sort((a, b) => {
      const seqA = Number(a?.sequence) || 0;
      const seqB = Number(b?.sequence) || 0;
      if (seqA !== seqB) return seqA - seqB;
      const nameA = typeof a?.name === 'string' ? a.name : '';
      const nameB = typeof b?.name === 'string' ? b.name : '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
}

function normalizeCustomCurveSequences(list = []) {
  if (!Array.isArray(list)) return [];
  let seq = 0;
  return sortCustomCurveList(list).map(curve => ({
    ...curve,
    sequence: ++seq
  }));
}

let saved = loadSavedSettings();

let activeViewOptions = normalizeViewOptionList(saved.viewOptions);
saved.viewOptions = [...activeViewOptions];
saved.customCurves = normalizeCustomCurveSequences(saved.customCurves);
saved.customCurveCounter = saved.customCurves.reduce((max, curve) => {
  const seq = Number(curve.sequence);
  return Number.isFinite(seq) ? Math.max(max, seq) : max;
}, Number.isFinite(saved.customCurveCounter) ? saved.customCurveCounter : 0);

annotations = (saved.annotations || []).map(sanitizeAnnotation).filter(Boolean);
saved.annotations = annotations.map(exportAnnotation);

setPlotAvailability(false);

updateViewButtonLabel();

init();

const MIN_PICKUP = 0.01;
const MAX_PICKUP = 1e6;
const MIN_DELAY = 0.001;
const MAX_DELAY = 1e5;

function selectedDeviceIds() {
  return [...deviceSelect.selectedOptions].map(o => o.value);
}

function applySelectionSet(selection, { persist = false } = {}) {
  const chosen = Array.isArray(selection) ? selection : [...selection];
  const selectedSet = new Set(chosen);
  [...deviceSelect.options].forEach(opt => {
    opt.selected = selectedSet.has(opt.value);
  });
  renderSelectedSummary();
  renderSettings();
  if (persist) {
    persistSettings();
  }
}

function renderSelectedSummary() {
  if (!selectedSummary) return;
  selectedSummary.innerHTML = '';
  const ids = selectedDeviceIds();
  if (deviceModalBtn) {
    deviceModalBtn.textContent = ids.length ? `Choose Devices (${ids.length})` : 'Choose Devices';
  }
  if (!ids.length) {
    const empty = document.createElement('p');
    empty.className = 'selected-device-empty';
    empty.textContent = 'No devices selected.';
    selectedSummary.appendChild(empty);
    return;
  }
  const list = document.createElement('div');
  list.className = 'selected-device-list';
  ids.forEach(uid => {
    const entry = deviceMap.get(uid);
    const chip = document.createElement('span');
    chip.className = 'selected-device-chip';
    chip.textContent = entry ? entry.name : uid;
    list.appendChild(chip);
  });
  selectedSummary.appendChild(list);
}

function formatSettingLabel(field = '') {
  const known = {
    pickup: 'Pickup',
    time: 'Delay',
    delay: 'Delay',
    instantaneous: 'Instantaneous Pickup',
    instantaneousDelay: 'Instantaneous Delay',
    instantaneousMax: 'Instantaneous Max',
    instantaneousPickup: 'Instantaneous Pickup',
    curveProfile: 'Curve Profile',
    longTimePickup: 'Long Time Pickup',
    longTimeDelay: 'Long Time Delay',
    shortTimePickup: 'Short Time Pickup',
    shortTimeDelay: 'Short Time Delay',
    ampRating: 'Amp Rating',
    speed: 'Speed'
  };
  if (known[field]) return known[field];
  return String(field)
    .replace(/[_\s]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b([a-z])/g, (_, char) => char.toUpperCase())
    .trim();
}

function formatSettingValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const num = Number(trimmed);
    if (!Number.isNaN(num)) return formatSettingValue(num);
    return trimmed;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const num = value;
  if (Math.abs(num) >= 1000 || Number.isInteger(num)) return String(num);
  if (Math.abs(num) >= 100) return num.toFixed(1);
  if (Math.abs(num) >= 10) return num.toFixed(2);
  return num.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createAnnotationId() {
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeAnnotation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const current = Number(raw.current);
  const time = Number(raw.time);
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!Number.isFinite(current) || current <= 0) return null;
  if (!Number.isFinite(time) || time <= 0) return null;
  if (!text) return null;
  const annotation = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createAnnotationId(),
    current,
    time,
    text
  };
  if (Number.isFinite(raw.offsetX)) annotation.offsetX = Number(raw.offsetX);
  if (Number.isFinite(raw.offsetY)) annotation.offsetY = Number(raw.offsetY);
  return annotation;
}

function exportAnnotation(annotation) {
  const base = {
    id: annotation.id,
    current: annotation.current,
    time: annotation.time,
    text: annotation.text
  };
  if (Number.isFinite(annotation.offsetX)) base.offsetX = annotation.offsetX;
  if (Number.isFinite(annotation.offsetY)) base.offsetY = annotation.offsetY;
  return base;
}

function persistAnnotations({ skipSetItem = false } = {}) {
  saved.annotations = annotations.map(exportAnnotation);
  if (!skipSetItem) {
    saved.viewOptions = [...activeViewOptions];
    setItem('tccSettings', saved);
  }
}

function setPlotAvailability(available) {
  if (printPlotBtn) {
    printPlotBtn.disabled = !available;
  }
  if (annotationBtn) {
    annotationBtn.disabled = !available;
    if (!available) {
      disableAnnotationMode();
    }
  }
}

function enableAnnotationMode() {
  if (!annotationBtn || annotationBtn.disabled) return;
  if (!annotationContext) return;
  annotationMode = true;
  annotationBtn.textContent = ANNOTATION_ACTIVE_LABEL;
  annotationBtn.setAttribute('aria-pressed', 'true');
  chart.classed('annotation-mode', true);
}

function disableAnnotationMode() {
  annotationMode = false;
  if (annotationBtn) {
    annotationBtn.textContent = annotationBtnDefaultLabel;
    annotationBtn.setAttribute('aria-pressed', 'false');
  }
  chart.classed('annotation-mode', false);
}

function editAnnotation(datum) {
  if (!datum) return;
  const updated = window.prompt('Edit annotation text (leave blank to remove):', datum.text);
  if (updated === null) return;
  const trimmed = updated.trim();
  if (!trimmed) {
    deleteAnnotation(datum.id);
    return;
  }
  datum.text = trimmed;
  persistAnnotations();
  renderAnnotations();
}

function deleteAnnotation(annotationId) {
  if (!annotationId) return;
  const initialLength = annotations.length;
  annotations = annotations.filter(item => item.id !== annotationId);
  if (annotations.length !== initialLength) {
    persistAnnotations();
    renderAnnotations();
  }
}

function buildAnnotationContextItems(datum) {
  if (!datum) return [];
  return [
    {
      label: 'Edit Annotation',
      onSelect: () => editAnnotation(datum)
    },
    {
      label: 'Delete Annotation',
      onSelect: () => deleteAnnotation(datum.id)
    }
  ];
}

function focusDeviceSettings(uid) {
  if (!settingsDiv || !uid) return;
  const selectorValue = String(uid).replace(/"/g, '\\"');
  const target = settingsDiv.querySelector(`.device-settings[data-uid="${selectorValue}"]`);
  if (!target) return;
  target.classList.add('device-settings-highlight');
  const removeHighlight = () => target.classList.remove('device-settings-highlight');
  setTimeout(removeHighlight, 1800);
  const previousTabIndex = target.getAttribute('tabindex');
  target.setAttribute('tabindex', '-1');
  try {
    target.focus({ preventScroll: true });
  } catch (err) {
    // Ignore focus errors
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    if (previousTabIndex !== null) {
      target.setAttribute('tabindex', previousTabIndex);
    } else {
      target.removeAttribute('tabindex');
    }
  }, 200);
}

function removeDeviceFromSelection(uid) {
  if (!uid) return;
  const current = selectedDeviceIds();
  if (!current.includes(uid)) return;
  const updated = current.filter(id => id !== uid);
  applySelectionSet(updated, { persist: true });
  if (updated.length) {
    plot();
  } else {
    chart.selectAll('*').remove();
    violationDiv.textContent = '';
    setPlotAvailability(false);
  }
}

function buildCurveContextItems(entry) {
  if (!entry || !entry.selection) return [];
  const selection = entry.selection;
  const items = [];
  if (selection.uid && settingsDiv) {
    items.push({
      label: 'Focus Device Settings',
      onSelect: () => focusDeviceSettings(selection.uid)
    });
  }
  if (selection.kind === 'component' && selection.componentId) {
    items.push({
      label: 'Set as Active Component',
      onSelect: () => setActiveComponent(selection.componentId, { preserveSelection: true })
    });
    items.push({
      label: 'Open in One-Line',
      onSelect: () => {
        window.open(`oneline.html?component=${encodeURIComponent(selection.componentId)}`, '_blank');
      }
    });
  } else if (selection.kind === 'library') {
    const targetId = getActiveComponentId() || activeComponentId || compId;
    items.push({
      label: 'Assign to Active Component',
      disabled: !targetId,
      onSelect: () => linkComponent(selection)
    });
    if (selection.isCustom && selection.customCurveId) {
      items.push({
        label: 'Edit Custom Curve',
        onSelect: () => openCustomCurveBuilder(selection.customCurveId)
      });
      items.push({
        label: 'Delete Custom Curve',
        onSelect: () => confirmCustomCurveRemoval(selection)
      });
    }
  }
  if (selection.uid) {
    items.push({
      label: 'Remove from Plot',
      onSelect: () => removeDeviceFromSelection(selection.uid)
    });
  }
  return items;
}

function showCurveContextMenu(event, entry) {
  contextMenu.show(event, buildCurveContextItems(entry));
}

function defaultAnnotationOffsets(xPos, yPos, width, height) {
  const horizontal = xPos > width * 0.7 ? -60 : 60;
  const vertical = yPos < height * 0.3 ? 40 : -40;
  return { offsetX: horizontal, offsetY: vertical };
}

function ensureAnnotationOffsets(datum, anchorX, anchorY, width, height) {
  if (!Number.isFinite(datum.offsetX) || !Number.isFinite(datum.offsetY)) {
    const defaults = defaultAnnotationOffsets(anchorX, anchorY, width, height);
    datum.offsetX = defaults.offsetX;
    datum.offsetY = defaults.offsetY;
  }
  return { offsetX: datum.offsetX, offsetY: datum.offsetY };
}

function positionAnnotation(group, datum) {
  if (!annotationContext) return;
  const { x, y, width, height } = annotationContext;
  const anchorX = x(datum.current);
  const anchorY = y(datum.time);
  if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) {
    group.attr('display', 'none');
    return;
  }
  group.attr('display', null);
  const offsets = ensureAnnotationOffsets(datum, anchorX, anchorY, width, height);
  const labelX = anchorX + offsets.offsetX;
  const labelY = anchorY + offsets.offsetY;
  group.select('line.annotation-connector')
    .attr('x1', anchorX)
    .attr('y1', anchorY)
    .attr('x2', labelX)
    .attr('y2', labelY)
    .attr('stroke', '#444')
    .attr('stroke-width', 1.5);
  group.select('circle.annotation-anchor')
    .attr('cx', anchorX)
    .attr('cy', anchorY)
    .attr('r', 4)
    .attr('fill', '#fff')
    .attr('stroke', '#444')
    .attr('stroke-width', 1.5);
  const label = group.select('g.annotation-label')
    .attr('transform', `translate(${labelX},${labelY})`);
  const text = label.select('text.annotation-text')
    .text(datum.text)
    .attr('fill', '#111')
    .attr('font-size', 12);
  const textNode = text.node();
  if (textNode) {
    const bbox = textNode.getBBox();
    const paddingX = 6;
    const paddingY = 4;
    label.select('rect.annotation-label-bg')
      .attr('x', bbox.x - paddingX)
      .attr('y', bbox.y - paddingY)
      .attr('width', bbox.width + paddingX * 2)
      .attr('height', bbox.height + paddingY * 2)
      .attr('fill', '#fff')
      .attr('stroke', '#444')
      .attr('stroke-width', 1);
  }
}

function annotationDragFilter(event) {
  if (annotationMode) return false;
  const src = event?.sourceEvent || event;
  if (src && typeof src.button === 'number' && src.button !== 0) {
    return false;
  }
  return true;
}

function handleAnnotationDragStart(event, datum) {
  if (!annotationContext || !annotationContext.g) return;
  const { x, y, width, height, g } = annotationContext;
  const anchorX = x(datum.current);
  const anchorY = y(datum.time);
  if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) return;
  const pointerEvent = event && event.sourceEvent ? event.sourceEvent : event;
  const pointer = d3.pointer(pointerEvent, g.node());
  const offsets = ensureAnnotationOffsets(datum, anchorX, anchorY, width, height);
  datum[ANNOTATION_DRAG_STATE] = {
    mode: 'label',
    startPointerX: pointer[0],
    startPointerY: pointer[1],
    baseOffsetX: offsets.offsetX,
    baseOffsetY: offsets.offsetY
  };
  if (event.sourceEvent) {
    if (typeof event.sourceEvent.stopPropagation === 'function') {
      event.sourceEvent.stopPropagation();
    }
    if (typeof event.sourceEvent.preventDefault === 'function') {
      event.sourceEvent.preventDefault();
    }
  }
}

function handleAnnotationDrag(event, datum) {
  if (!annotationContext || !annotationContext.g) return;
  const state = datum[ANNOTATION_DRAG_STATE];
  if (!state || state.mode !== 'label') return;
  const pointerEvent = event && event.sourceEvent ? event.sourceEvent : event;
  const pointer = d3.pointer(pointerEvent, annotationContext.g.node());
  const dx = pointer[0] - state.startPointerX;
  const dy = pointer[1] - state.startPointerY;
  datum.offsetX = state.baseOffsetX + dx;
  datum.offsetY = state.baseOffsetY + dy;
  const group = d3.select(this.parentNode);
  if (group.empty()) return;
  positionAnnotation(group, datum);
}

function handleAnnotationDragEnd(event, datum) {
  const state = datum[ANNOTATION_DRAG_STATE];
  if (!state || state.mode !== 'label') return;
  delete datum[ANNOTATION_DRAG_STATE];
  persistAnnotations();
  renderAnnotations();
}

const annotationDragBehavior = d3.drag()
  .filter(annotationDragFilter)
  .on('start', handleAnnotationDragStart)
  .on('drag', handleAnnotationDrag)
  .on('end', handleAnnotationDragEnd);

function clampToDomain(value, domain) {
  if (!Number.isFinite(value)) return value;
  if (!Array.isArray(domain) || domain.length < 2) return value;
  const [a, b] = domain;
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function handleAnnotationAnchorDragStart(event, datum) {
  if (!annotationContext || !annotationContext.g) return;
  datum[ANNOTATION_DRAG_STATE] = { mode: 'anchor' };
  if (event.sourceEvent) {
    if (typeof event.sourceEvent.stopPropagation === 'function') {
      event.sourceEvent.stopPropagation();
    }
    if (typeof event.sourceEvent.preventDefault === 'function') {
      event.sourceEvent.preventDefault();
    }
  }
}

function handleAnnotationAnchorDrag(event, datum) {
  if (!annotationContext || !annotationContext.g) return;
  const state = datum[ANNOTATION_DRAG_STATE];
  if (!state || state.mode !== 'anchor') return;
  const { g, x, y, width, height } = annotationContext;
  const pointerEvent = event && event.sourceEvent ? event.sourceEvent : event;
  const pointer = d3.pointer(pointerEvent, g.node());
  if (!pointer) return;
  let [mx, my] = pointer;
  mx = Math.max(0, Math.min(width, mx));
  my = Math.max(0, Math.min(height, my));
  const current = clampToDomain(x.invert(mx), x.domain());
  const time = clampToDomain(y.invert(my), y.domain());
  if (!Number.isFinite(current) || !Number.isFinite(time) || current <= 0 || time <= 0) {
    return;
  }
  datum.current = current;
  datum.time = time;
  const group = d3.select(this.parentNode);
  if (!group.empty()) {
    positionAnnotation(group, datum);
  }
}

function handleAnnotationAnchorDragEnd(event, datum) {
  const state = datum[ANNOTATION_DRAG_STATE];
  if (!state || state.mode !== 'anchor') return;
  delete datum[ANNOTATION_DRAG_STATE];
  persistAnnotations();
  renderAnnotations();
}

const annotationAnchorDragBehavior = d3.drag()
  .filter(annotationDragFilter)
  .on('start', handleAnnotationAnchorDragStart)
  .on('drag', handleAnnotationAnchorDrag)
  .on('end', handleAnnotationAnchorDragEnd);

function renderAnnotations() {
  if (!annotationContext || !annotationContext.layer) return;
  const { layer, x, y, width, height } = annotationContext;
  const selection = layer.selectAll('g.annotation').data(annotations, d => d.id);
  selection.exit().remove();
  const entered = selection.enter().append('g').attr('class', 'annotation');
  entered.append('line').attr('class', 'annotation-connector');
  entered.append('circle').attr('class', 'annotation-anchor').attr('r', 4);
  const labelGroup = entered.append('g').attr('class', 'annotation-label');
  labelGroup.append('rect').attr('class', 'annotation-label-bg').attr('rx', 4).attr('ry', 4);
  labelGroup.append('text')
    .attr('class', 'annotation-text')
    .attr('x', 0)
    .attr('y', 0)
    .attr('dominant-baseline', 'hanging');
  const merged = entered.merge(selection);
  merged.style('cursor', 'pointer');
  merged.select('g.annotation-label')
    .style('cursor', 'move')
    .call(annotationDragBehavior);
  merged.select('circle.annotation-anchor')
    .style('cursor', 'move')
    .call(annotationAnchorDragBehavior);
  merged.select('line.annotation-connector')
    .style('cursor', 'move')
    .call(annotationAnchorDragBehavior);
  merged.on('dblclick', (event, datum) => {
    event.stopPropagation();
    event.preventDefault();
    editAnnotation(datum);
  });
  merged.on('contextmenu', (event, datum) => {
    event.preventDefault();
    event.stopPropagation();
    contextMenu.show(event, buildAnnotationContextItems(datum));
  });
  merged.each(function renderAnnotation(datum) {
    const group = d3.select(this);
    positionAnnotation(group, datum);
  });
}

function handleAnnotationPlacement(event) {
  if (!annotationMode || !annotationContext) return;
  event.preventDefault();
  event.stopPropagation();
  const { g, x, y, width, height } = annotationContext;
  const pointer = d3.pointer(event, g.node());
  if (!pointer) {
    disableAnnotationMode();
    return;
  }
  const [mx, my] = pointer;
  if (mx < 0 || mx > width || my < 0 || my > height) {
    disableAnnotationMode();
    return;
  }
  const current = x.invert(mx);
  const time = y.invert(my);
  if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(time) || time <= 0) {
    disableAnnotationMode();
    return;
  }
  const response = window.prompt('Enter annotation text:', '');
  if (response === null) {
    disableAnnotationMode();
    return;
  }
  const trimmed = response.trim();
  if (!trimmed) {
    disableAnnotationMode();
    return;
  }
  const offsets = defaultAnnotationOffsets(mx, my, width, height);
  const annotation = {
    id: createAnnotationId(),
    current,
    time,
    text: trimmed,
    offsetX: offsets.offsetX,
    offsetY: offsets.offsetY
  };
  annotations = [...annotations, annotation];
  persistAnnotations();
  renderAnnotations();
  disableAnnotationMode();
}

function buildPrintMarkup(svgMarkup, headerText, footerText, { previewMarkup = '' } = {}) {
  const header = headerText || 'Time-Current Curves';
  const footer = footerText || `Generated ${new Date().toLocaleString()}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Time-Current Curve Plot</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 24px; color: #111; }
    .print-header { text-align: center; font-size: 1.5rem; font-weight: 600; margin-bottom: 16px; }
    .print-chart { display: flex; justify-content: center; align-items: center; margin: 16px 0; }
    .print-chart svg { max-width: 100%; height: auto; }
    .print-preview { margin-top: 24px; }
    .print-preview h2 { font-size: 1.1rem; margin: 0 0 12px; text-align: left; }
    .print-preview-graphic { display: flex; justify-content: center; align-items: center; padding: 12px; border: 1px solid #ccc; border-radius: 8px; background: #f8f9fb; }
    .print-preview-graphic svg { max-width: 100%; height: auto; }
    .print-preview-empty { margin: 0; font-size: 0.95rem; color: #555; text-align: center; }
    .print-footer { text-align: center; font-size: 0.85rem; color: #555; margin-top: 24px; }
    @page { size: landscape; margin: 15mm; }
  </style>
</head>
<body>
  <div class="print-header">${escapeHtml(header)}</div>
  <div class="print-chart">${svgMarkup}</div>
  ${previewMarkup ? `<div class="print-preview"><h2>One-Line Preview</h2><div class="print-preview-graphic">${previewMarkup}</div></div>` : ''}
  <div class="print-footer">${escapeHtml(footer)}</div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
        window.addEventListener('afterprint', () => window.close());
      }, 50);
    });
  </script>
</body>
</html>`;
}

async function handlePrintPlot() {
  if (!printPlotBtn || printPlotBtn.disabled) return;
  if (!chart || !chart.node()) return;

  const initialHeader = typeof saved.printHeader === 'string' ? saved.printHeader : '';
  const initialFooter = typeof saved.printFooter === 'string' ? saved.printFooter : '';
  const initialIncludePreview = saved.printIncludePreview === true;
  let headerInputEl = null;
  let footerInputEl = null;
  let includePreviewEl = null;

  const modalResult = await openModal({
    title: 'Print Plot',
    description: 'Enter header and footer text for the printout and choose whether to include the one-line preview.',
    primaryText: 'Print',
    secondaryText: 'Cancel',
    closeOnBackdrop: true,
    render(container, controller) {
      const doc = container.ownerDocument || document;
      const form = doc.createElement('form');
      form.className = 'print-settings-form';
      form.noValidate = true;

      const headerLabel = doc.createElement('label');
      headerLabel.className = 'print-settings-field';
      headerLabel.append('Header');
      headerInputEl = doc.createElement('input');
      headerInputEl.type = 'text';
      headerInputEl.id = 'tcc-print-header-input';
      headerInputEl.placeholder = DEFAULT_PRINT_HEADER;
      headerInputEl.value = initialHeader;
      headerLabel.appendChild(headerInputEl);

      const footerLabel = doc.createElement('label');
      footerLabel.className = 'print-settings-field';
      footerLabel.append('Footer');
      footerInputEl = doc.createElement('input');
      footerInputEl.type = 'text';
      footerInputEl.id = 'tcc-print-footer-input';
      footerInputEl.placeholder = DEFAULT_PRINT_FOOTER;
      footerInputEl.value = initialFooter;
      footerLabel.appendChild(footerInputEl);

      const previewToggle = doc.createElement('label');
      previewToggle.className = 'print-settings-toggle';
      includePreviewEl = doc.createElement('input');
      includePreviewEl.type = 'checkbox';
      includePreviewEl.checked = initialIncludePreview;
      previewToggle.append(includePreviewEl, ' Include one-line preview');

      form.append(headerLabel, footerLabel, previewToggle);
      container.appendChild(form);
      if (controller && typeof controller.registerForm === 'function') {
        controller.registerForm(form);
      }
      if (controller && typeof controller.setInitialFocus === 'function') {
        controller.setInitialFocus(headerInputEl);
      }
      return headerInputEl;
    },
    onSubmit() {
      if (!headerInputEl || !footerInputEl || !includePreviewEl) {
        return false;
      }
      const headerValue = headerInputEl.value.trim();
      const footerValue = footerInputEl.value.trim();
      const includePreview = includePreviewEl.checked;
      saved.printHeader = headerValue;
      saved.printFooter = footerValue;
      saved.printIncludePreview = includePreview;
      saved.viewOptions = [...activeViewOptions];
      setItem('tccSettings', saved);
      return { header: headerValue, footer: footerValue, includePreview };
    }
  });

  if (!modalResult) return;

  const svgNode = chart.node().cloneNode(true);
  if (!svgNode) return;
  if (!svgNode.getAttribute('xmlns')) {
    svgNode.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  const serializer = new XMLSerializer();
  const markup = serializer.serializeToString(svgNode);
  const headerText = typeof modalResult.header === 'string' ? modalResult.header : '';
  const footerText = typeof modalResult.footer === 'string' ? modalResult.footer : '';
  let previewMarkup = '';
  if (modalResult.includePreview) {
    if (onelinePreviewSvgEl && !onelinePreviewSvgEl.classList.contains('hidden')) {
      const previewNode = onelinePreviewSvgEl.cloneNode(true);
      previewNode.classList.remove('hidden');
      previewNode.removeAttribute('id');
      if (!previewNode.getAttribute('xmlns')) {
        previewNode.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }
      previewMarkup = serializer.serializeToString(previewNode);
    } else {
      previewMarkup = '<p class="print-preview-empty">No one-line preview available for the current selection.</p>';
    }
  }
  const html = buildPrintMarkup(markup, headerText, footerText, { previewMarkup });
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function formatOptionLabel(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return formatSettingValue(value);
  const str = String(value).trim();
  if (!str) return '';
  return str
    .replace(/[_\s-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b([a-z])/g, (_, char) => char.toUpperCase());
}

function formatDetailValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value
      .map(item => formatDetailValue(item))
      .filter(str => str)
      .join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'number') {
    return formatSettingValue(value);
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

function normalizeSettingOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map(option => {
    if (option && typeof option === 'object' && !Array.isArray(option)) {
      const value = option.value;
      return {
        value,
        valueStr: String(value ?? ''),
        label: option.label ?? formatOptionLabel(value)
      };
    }
    return {
      value: option,
      valueStr: String(option ?? ''),
      label: formatOptionLabel(option)
    };
  });
}

function getSettingOptions(device, field) {
  if (!device || !device.settingOptions) return [];
  const raw = device.settingOptions[field];
  if (!Array.isArray(raw)) return [];
  return normalizeSettingOptions(raw);
}

function describeSettingRange(device, field) {
  const options = getSettingOptions(device, field);
  if (!options.length) return '';
  const numericOptions = options
    .map(opt => {
      const num = Number(opt.value);
      return Number.isFinite(num) ? num : null;
    })
    .filter(num => num !== null);
  if (numericOptions.length === options.length && numericOptions.length) {
    const min = Math.min(...numericOptions);
    const max = Math.max(...numericOptions);
    if (Math.abs(min - max) < 1e-9) {
      return formatSettingValue(min);
    }
    return `${formatSettingValue(min)} – ${formatSettingValue(max)}`;
  }
  return options
    .map(opt => opt.label)
    .filter(label => label && label.trim())
    .join(', ');
}

function snapSettingValue(device, field, value) {
  if (value === undefined || value === null) return value;
  const options = getSettingOptions(device, field);
  if (!options.length) return value;
  const numericOptions = options
    .map(opt => {
      const num = Number(opt.value);
      return Number.isFinite(num) ? { ...opt, numeric: num } : null;
    })
    .filter(Boolean);
  const parsedValue = Number(value);
  if (numericOptions.length === options.length && Number.isFinite(parsedValue)) {
    let best = numericOptions[0];
    let bestDiff = Math.abs(parsedValue - best.numeric);
    numericOptions.slice(1).forEach(opt => {
      const diff = Math.abs(parsedValue - opt.numeric);
      if (diff < bestDiff) {
        best = opt;
        bestDiff = diff;
      }
    });
    if (typeof best.value === 'number') return best.value;
    const asNumber = Number(best.value);
    return Number.isFinite(asNumber) ? asNumber : best.value;
  }
  const strValue = String(value);
  const match = options.find(opt => opt.valueStr === strValue || valuesEqual(opt.value, value));
  if (match) return match.value;
  return options[0].value;
}

function snapOverridesToOptions(device, overrides = {}) {
  if (!device) return { ...overrides };
  const result = {};
  Object.entries(overrides).forEach(([field, val]) => {
    if (val === undefined || val === null) return;
    const snapped = snapSettingValue(device, field, val);
    if (snapped !== undefined && snapped !== null) {
      result[field] = snapped;
    }
  });
  return result;
}

function resolveSettingType(defaultValue, options) {
  if (Array.isArray(options)) {
    const hasNonNumericOption = options.some(option => {
      const value = option && typeof option === 'object' && !Array.isArray(option)
        ? option.value
        : option;
      if (value === null || value === undefined) return false;
      if (typeof value === 'number') return false;
      const asNumber = Number(value);
      return Number.isNaN(asNumber);
    });
    if (hasNonNumericOption) return 'string';
  }
  if (defaultValue !== null && defaultValue !== undefined) {
    if (typeof defaultValue === 'string') {
      const asNumber = Number(defaultValue);
      if (Number.isNaN(asNumber)) return 'string';
    } else if (typeof defaultValue !== 'number') {
      return 'string';
    }
  }
  return 'number';
}

function valuesEqual(a, b) {
  if (a === b) return true;
  const numA = Number(a);
  const numB = Number(b);
  if (Number.isFinite(numA) && Number.isFinite(numB)) {
    return Math.abs(numA - numB) < 1e-9;
  }
  return String(a) === String(b);
}

function readOverrideFromInput(input) {
  const field = input.dataset.field;
  if (!field) return null;
  const raw = input.value;
  const defaultRaw = input.dataset.defaultValue ?? '';
  const valueType = input.dataset.valueType || (input.tagName === 'SELECT' ? 'string' : 'number');
  if (valueType === 'number') {
    if (raw === '') return null;
    const num = Number(raw);
    if (!Number.isFinite(num)) return null;
    if (defaultRaw !== '') {
      const defaultNum = Number(defaultRaw);
      if (Number.isFinite(defaultNum) && Math.abs(num - defaultNum) < 1e-9) {
        return null;
      }
    }
    return { field, value: num };
  }
  if (valueType === 'string') {
    if (!raw) return null;
    if (raw === defaultRaw) return null;
    return { field, value: raw };
  }
  return null;
}

function collectOverridesFromDiv(div) {
  const overrides = {};
  div.querySelectorAll('[data-field]').forEach(input => {
    const result = readOverrideFromInput(input);
    if (result) overrides[result.field] = result.value;
  });
  return overrides;
}

function updateEntryOverrideFromControl(entry, control) {
  if (!entry || !control || !control.dataset) return;
  const field = control.dataset.field;
  if (!field) return;
  const result = readOverrideFromInput(control);
  const overrides = { ...(entry.overrideSource || {}) };
  if (result && result.value !== undefined && result.value !== null) {
    overrides[result.field] = result.value;
  } else {
    delete overrides[field];
  }
  entry.overrideSource = overrides;
}

function refreshCatalog({
  preserveSelection = false,
  includeComponentContext = !preserveSelection,
  includeDeviceParam = !preserveSelection
} = {}) {
  const previousSelection = preserveSelection ? new Set(selectedDeviceIds()) : new Set();
  buildComponentData();
  rebuildCatalog();
  const available = new Set(deviceEntries.map(entry => entry.uid));
  const defaults = new Set((saved.devices || []).filter(id => available.has(id)));
  const contextId = getActiveComponentId();
  if (preserveSelection) {
    previousSelection.forEach(id => {
      if (available.has(id)) defaults.add(id);
    });
  }
  if (includeComponentContext && contextId) {
    const compEntry = componentDeviceMap.get(contextId);
    if (compEntry) defaults.add(compEntry.uid);
    collectNeighborDeviceDefaults(contextId).forEach(id => {
      if (available.has(id)) defaults.add(id);
    });
  }
  if (includeDeviceParam && deviceParam) {
    const libraryEntry = deviceEntries.find(
      entry => entry.kind === 'library' && entry.baseDeviceId === deviceParam
    );
    if (libraryEntry) defaults.add(libraryEntry.uid);
  }
  deviceEntries
    .filter(entry => entry.autoSelect)
    .forEach(entry => defaults.add(entry.uid));
  if (!defaults.size && deviceEntries.length) {
    const first = deviceEntries.find(entry => entry.kind === 'component')
      || deviceEntries.find(entry => entry.kind === 'library');
    if (first) defaults.add(first.uid);
  }
  const selection = [...defaults].filter(id => available.has(id));
  applySelectionSet(selection);
  saved.devices = selection;
  persistAnnotations({ skipSetItem: true });
  saved.viewOptions = [...activeViewOptions];
  setItem('tccSettings', saved);
  return selection;
}

function setActiveComponent(componentId, { preserveSelection = false } = {}) {
  const normalized = componentId && componentLookup.has(componentId)
    ? componentId
    : null;
  activeComponentId = normalized;
  updateComponentContextUI();
  renderOneLinePreview(normalized);
  if (!preserveSelection) {
    saved.devices = [];
  }
  const selection = refreshCatalog({
    preserveSelection,
    includeComponentContext: true,
    includeDeviceParam: true
  });
  renderSettings();
  if (deviceSelect && deviceSelect.selectedOptions.length && selection.length) {
    plot();
  }
  return selection;
}

function updateShortCircuitStudy() {
  const sc = runShortCircuit();
  const studies = getStudies();
  studies.shortCircuit = sc;
  setStudies(studies);
  return sc;
}

async function init() {
  try {
    const list = await fetch('data/protectiveDevices.json').then(r => r.json());
    libraryDevices = Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('Failed to load device data', e);
    libraryDevices = [];
  }

  const initialSelection = refreshCatalog({ includeComponentContext: true, includeDeviceParam: true });

  renderOneLinePreview(getActiveComponentId());

  updateShortCircuitStudy();

  if (getActiveComponentId() && deviceSelect && deviceSelect.selectedOptions.length && initialSelection.length) {
    plot();
  }

  on(STORAGE_KEYS.oneLine, () => {
    const selection = refreshCatalog({ preserveSelection: true });
    updateShortCircuitStudy();
    renderOneLinePreview(getActiveComponentId());
    if (getActiveComponentId() && deviceSelect && deviceSelect.selectedOptions.length && selection.length) {
      plot();
    }
  });

  on('scenario', () => {
    saved = loadSavedSettings();
    activeViewOptions = normalizeViewOptionList(saved.viewOptions);
    saved.viewOptions = [...activeViewOptions];
    annotations = (saved.annotations || []).map(sanitizeAnnotation).filter(Boolean);
    saved.annotations = annotations.map(exportAnnotation);
    renderAnnotations();
    updateViewButtonLabel();
    const selection = refreshCatalog({ includeComponentContext: true, includeDeviceParam: true });
    updateShortCircuitStudy();
    renderOneLinePreview(getActiveComponentId());
    if (getActiveComponentId() && deviceSelect && deviceSelect.selectedOptions.length && selection.length) {
      plot();
    }
  });
}

function selectDefaults(ids) {
  const valid = [...ids].filter(id => deviceMap.has(id));
  applySelectionSet(valid);
  saved.devices = valid;
  persistAnnotations({ skipSetItem: true });
  saved.viewOptions = [...activeViewOptions];
  setItem('tccSettings', saved);
}

function buildComponentData() {
  const { sheets } = getOneLine();
  const records = [];
  const lookup = new Map();
  const neighbors = new Map();
  const connections = new Map();
  (sheets || []).forEach((sheet, idx) => {
    const sheetName = sheet?.name || `Sheet ${idx + 1}`;
    (sheet?.components || []).forEach(comp => {
      records.push({ component: comp, sheetName, sheetIndex: idx, sheet });
      lookup.set(comp.id, { component: comp, sheetName, sheetIndex: idx, sheet });
      neighbors.set(comp.id, new Set());
      connections.set(comp.id, []);
    });
    (sheet?.connections || []).forEach(conn => {
      if (!conn) return;
      const from = conn.from ?? conn.source ?? conn.a ?? conn.start ?? null;
      const to = conn.to ?? conn.target ?? conn.b ?? conn.end ?? null;
      if (!from || !to) return;
      if (!lookup.has(from) || !lookup.has(to)) return;
      neighbors.get(from)?.add(to);
      neighbors.get(to)?.add(from);
      const sourceRecord = lookup.get(from);
      const targetRecord = lookup.get(to);
      if (!sourceRecord || !targetRecord) return;
      connections.get(from)?.push({ conn, source: sourceRecord.component, target: targetRecord.component });
      connections.get(to)?.push({ conn, source: targetRecord.component, target: sourceRecord.component });
    });
  });
  records.forEach(({ component }) => {
    (component.connections || []).forEach(conn => {
      if (!lookup.has(conn.target)) return;
      neighbors.get(component.id)?.add(conn.target);
      neighbors.get(conn.target)?.add(component.id);
      const targetRecord = lookup.get(conn.target);
      if (!targetRecord) return;
      connections.get(component.id)?.push({ conn, source: component, target: targetRecord.component });
      connections.get(conn.target)?.push({ conn, source: targetRecord.component, target: component });
    });
  });
  componentRecords = records;
  componentLookup = lookup;
  neighborMap = neighbors;
  connectionIndex = connections;
  if (activeComponentId && !componentLookup.has(activeComponentId)) {
    activeComponentId = null;
    updateComponentContextUI();
  }
  renderOneLinePreview(getActiveComponentId());
}

function rebuildCatalog() {
  deviceEntries = [];
  deviceMap = new Map();
  deviceGroups = [];

  const componentEntries = buildComponentEntries();
  const customEntries = buildCustomCurveEntries();
  const libraryEntries = buildLibraryEntries();
  const fuseEntries = libraryEntries.filter(entry => (entry.baseDevice?.type || entry.deviceType) === 'fuse');
  const otherLibraryEntries = libraryEntries.filter(entry => (entry.baseDevice?.type || entry.deviceType) !== 'fuse');
  const overlayEntries = buildOverlayEntries();

  if (componentEntries.length) {
    deviceGroups.push({ id: 'oneline', label: 'One-Line Devices', items: componentEntries });
  }
  if (customEntries.length) {
    deviceGroups.push({ id: 'customCurves', label: 'Custom Curves', items: customEntries });
  }
  if (otherLibraryEntries.length) {
    deviceGroups.push({ id: 'library', label: 'Library Devices', items: otherLibraryEntries });
  }
  if (fuseEntries.length) {
    deviceGroups.push({ id: 'fuses', label: 'Fuse Library', items: fuseEntries });
  }
  if (overlayEntries.length) {
    deviceGroups.push({ id: 'overlays', label: 'Connected Elements', items: overlayEntries });
  }

  deviceEntries = deviceGroups.flatMap(group => group.items);
  componentDeviceMap = new Map();
  deviceEntries.forEach(entry => {
    deviceMap.set(entry.uid, entry);
    if (entry.kind === 'component' && entry.componentId) {
      componentDeviceMap.set(entry.componentId, entry);
    }
  });

  renderDeviceList();
}

function deviceHasCurveData(device) {
  if (!device || typeof device !== 'object') return false;
  const curve = device.curve;
  if (Array.isArray(curve) && curve.some(point => point && (point.current !== undefined || point.time !== undefined))) {
    return curve.length > 0;
  }
  const profiles = device.curveProfiles;
  if (Array.isArray(profiles)) {
    return profiles.some(profile => Array.isArray(profile?.curve) && profile.curve.length);
  }
  if (profiles && typeof profiles === 'object') {
    return Object.values(profiles).some(profile => Array.isArray(profile?.curve) && profile.curve.length);
  }
  return false;
}

function describeComponentPlotAvailability(component, baseDevice) {
  if (!component) {
    return 'This component could not be found in the one-line diagram.';
  }
  const typeKey = component.type || component.subtype || baseDevice?.type || '';
  const normalizedType = typeof component.type === 'string' ? component.type.toLowerCase() : '';
  const normalizedSubtype = typeof component.subtype === 'string' ? component.subtype.toLowerCase() : '';
  const normalizedBase = typeof baseDevice?.type === 'string' ? baseDevice.type.toLowerCase() : '';
  const isMotor = MOTOR_TYPES.has(normalizedType)
    || MOTOR_TYPES.has(normalizedSubtype)
    || MOTOR_TYPES.has(normalizedBase);
  if (isMotor) {
    const refPhases = parsePhases(component.phases).length || 3;
    const refVoltage = inferVoltage(component);
    const partial = collectMotorOperatingData(component, refVoltage, refPhases, { allowPartial: true });
    if (!partial || !Number.isFinite(partial.voltage) || partial.voltage <= 0) {
      return 'Provide the motor rated voltage before plotting this component.';
    }
    if (!Number.isFinite(partial.fla) || partial.fla <= 0) {
      return 'Provide the motor full-load amps, horsepower, or kW before plotting this component.';
    }
    if (!Number.isFinite(partial.lockedRotor) || partial.lockedRotor <= 0) {
      return 'Provide the motor locked-rotor current or multiple before plotting this component.';
    }
    const base = collectMotorOperatingData(component, refVoltage, refPhases);
    if (!base) {
      return 'Motor data is incomplete; verify the full-load and locked-rotor values before plotting.';
    }
    const startMetrics = resolveMotorStartingMetrics(component, refVoltage, refPhases, base);
    const thermalMetrics = resolveMotorThermalLimit(component, refVoltage, refPhases, base, startMetrics);
    if (!startMetrics && !thermalMetrics) {
      return 'Provide the motor starting or stall time before plotting this component.';
    }
    return null;
  }
  const basePhases = parsePhases(component.phases);
  const isCable = normalizedType.includes('cable')
    || normalizedSubtype.includes('cable')
    || normalizedBase.includes('cable');
  if (isCable) {
    const phaseCount = basePhases.length || 3;
    const attemptCurve = (descriptor, phases = basePhases) => {
      if (!descriptor) return null;
      const count = (Array.isArray(phases) && phases.length) ? phases.length : phaseCount;
      return buildCableCurve(descriptor, count);
    };
    let curve = attemptCurve(component.cable || component.props?.cable || component);
    if (!curve) {
      const contexts = connectionIndex.get(component.id) || [];
      for (const { conn, source, target } of contexts) {
        const descriptor = resolveCableInfo(source, target, conn);
        if (!descriptor) continue;
        const phases = parsePhases(
          conn?.phases || descriptor.phases || (target?.phases ?? source?.phases)
        );
        curve = attemptCurve(descriptor, phases);
        if (curve) break;
      }
    }
    if (!curve) {
      return 'Provide the cable conductor size, material, and insulation rating before plotting this component.';
    }
    return null;
  }
  const isProtective = PROTECTIVE_TYPES.has(normalizedType)
    || PROTECTIVE_TYPES.has(normalizedSubtype)
    || PROTECTIVE_TYPES.has(normalizedBase);
  const isTransformer = normalizedType.includes('transformer')
    || normalizedSubtype.includes('transformer')
    || normalizedBase.includes('transformer');
  if (isTransformer) {
    const refPhases = basePhases.length || 3;
    const refVoltage = inferVoltage(component);
    const damage = buildTransformerDamageCurve(component, refVoltage, refPhases);
    const inrush = computeTransformerInrush(component, refVoltage, refPhases);
    if (!damage && !inrush) {
      return 'Provide transformer kVA and voltage data to calculate damage and inrush before plotting this component.';
    }
    if (!damage) {
      return 'Provide transformer kVA and voltage ratings to plot the damage curve before plotting this component.';
    }
    if (!inrush) {
      return 'Provide transformer inrush multiple or duration before plotting this component.';
    }
    return null;
  }
  if (!isProtective) {
    const label = formatOptionLabel(typeKey || 'Device');
    return `${label} components do not provide a protective TCC curve.`;
  }
  if (!component.tccId) {
    return 'Assign a TCC device before plotting this component.';
  }
  if (!baseDevice) {
    return `The assigned TCC device (${component.tccId}) is not available in the library.`;
  }
  if (!deviceHasCurveData(baseDevice)) {
    return 'The assigned TCC device does not include curve data to plot.';
  }
  return null;
}

function buildComponentEntries() {
  const entries = [];
  componentRecords.forEach(({ component, sheetName }) => {
    if (!PROTECTIVE_TYPES.has(component.type) || !component.tccId) return;
    const base = libraryDevices.find(dev => dev.id === component.tccId);
    if (!base) return;
    const overrides = snapOverridesToOptions(
      base,
      mergeOverrides(component.tccOverrides, saved.componentOverrides?.[component.id])
    );
    const vendor = getComponentVendor(component);
    const entry = {
      uid: `component:${component.id}`,
      kind: 'component',
      name: `${component.label || component.name || base.name || component.type}${sheetName ? ` (${sheetName})` : ''}`,
      baseDeviceId: base.id,
      baseDevice: base,
      deviceCategory: component.type || base.type || '',
      deviceType: component.subtype || component.type || base.type || '',
      componentId: component.id,
      component,
      sheetName,
      overrideSource: overrides,
      componentVendor: vendor
    };
    entries.push(entry);
  });
  return entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function buildComponentDisplayEntries() {
  const existing = new Map();
  deviceEntries
    .filter(entry => entry.kind === 'component' && entry.componentId)
    .forEach(entry => existing.set(entry.componentId, entry));

  const entries = [...existing.values()];

  componentRecords.forEach(({ component, sheetName }) => {
    if (!component || existing.has(component.id)) return;
    const base = component.tccId ? libraryDevices.find(dev => dev.id === component.tccId) : null;
    const mergedOverrides = mergeOverrides(component.tccOverrides, saved.componentOverrides?.[component.id]);
    const overrides = base ? snapOverridesToOptions(base, mergedOverrides) : { ...mergedOverrides };
    const vendor = getComponentVendor(component);
    const plotDisabledReason = describeComponentPlotAvailability(component, base);
    const entry = {
      uid: `component:${component.id}`,
      kind: 'component',
      name: `${componentLabel(component)}${sheetName ? ` (${sheetName})` : ''}`,
      baseDeviceId: base?.id || component.tccId || '',
      baseDevice: base || null,
      deviceCategory: component.type || base?.type || '',
      deviceType: component.subtype || component.type || base?.type || '',
      componentId: component.id,
      component,
      sheetName,
      overrideSource: overrides,
      componentVendor: vendor,
      missingBase: !base,
      plotDisabledReason
    };
    entries.push(entry);
  });

  return entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function buildCustomCurveEntries() {
  if (!Array.isArray(saved.customCurves) || !saved.customCurves.length) return [];
  const ordered = sortCustomCurveList(saved.customCurves);
  return ordered.map(curve => {
    const vendor = curve.manufacturer || CUSTOM_CURVE_VENDOR_FALLBACK;
    const baseId = `custom:${curve.id}`;
    const profiles = Array.isArray(curve.curveProfiles)
      ? curve.curveProfiles.filter(profile => Array.isArray(profile?.curve) && profile.curve.length)
      : [];
    const baseCurve = Array.isArray(curve.curve) && curve.curve.length
      ? curve.curve
      : profiles.length
        ? profiles[0].curve || []
        : [];
    const baseDevice = {
      id: baseId,
      name: curve.name,
      type: curve.deviceType || CUSTOM_CURVE_CATEGORY,
      curve: baseCurve,
      curveProfiles: profiles.length ? profiles : undefined,
      settings: { ...(curve.settings || {}) },
      vendor,
      manufacturer: vendor,
      tolerance: curve.tolerance
    };
    return {
      uid: baseId,
      kind: 'library',
      name: curve.name,
      baseDeviceId: baseId,
      baseDevice,
      deviceType: curve.deviceType || CUSTOM_CURVE_CATEGORY,
      deviceCategory: curve.deviceType || CUSTOM_CURVE_CATEGORY,
      overrideSource: { ...(curve.settings || {}) },
      isCustom: true,
      customCurveId: curve.id,
      customCurve: curve,
      description: curve.description || '',
      metadata: {
        axes: curve.axes || {},
        bounds: curve.bounds || {}
      }
    };
  });
}

function buildLibraryEntries() {
  return libraryDevices
    .filter(dev => PROTECTIVE_TYPES.has(dev.type))
    .map(dev => ({
      uid: dev.id,
      kind: 'library',
      name: dev.type ? `${formatOptionLabel(dev.type)} – ${dev.name || dev.id}` : dev.name || dev.id,
      baseDeviceId: dev.id,
      baseDevice: dev,
      deviceType: dev.type || '',
      deviceCategory: dev.type || '',
      overrideSource: snapOverridesToOptions(dev, saved.settings?.[dev.id] || {})
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function buildOverlayEntries() {
  const contextId = getActiveComponentId();
  if (!contextId || !componentLookup.has(contextId)) return [];
  const overlays = [];
  overlays.push(...buildTransformerInrushEntries(contextId));
  overlays.push(...buildTransformerDamageEntries(contextId));
  overlays.push(...buildCableEntries(contextId));
  overlays.push(...buildMotorOverlayEntries(contextId));
  return overlays;
}

function getCustomCurveById(curveId) {
  if (!curveId || !Array.isArray(saved.customCurves)) return null;
  return saved.customCurves.find(curve => curve.id === curveId) || null;
}

function persistCustomCurveState({ refresh = true } = {}) {
  saved.customCurves = normalizeCustomCurveSequences(saved.customCurves);
  saved.customCurveCounter = saved.customCurves.reduce((max, curve) => {
    const seq = Number(curve.sequence);
    return Number.isFinite(seq) ? Math.max(max, seq) : max;
  }, saved.customCurveCounter || 0);
  saved.viewOptions = [...activeViewOptions];
  setItem('tccSettings', saved);
  if (refresh) {
    refreshCatalog({ preserveSelection: true, includeComponentContext: true });
  }
}

function saveCustomCurve(curve, { select = false } = {}) {
  if (!curve) return null;
  curve.settings = sanitizeCustomCurveSettings(curve.settings || {});
  const normalizedCurve = sanitizeCurve(curve.curve || []);
  const normalizedProfiles = sanitizeCustomCurveProfiles(curve.curveProfiles || []);
  const resolvedCurve = normalizedCurve.length
    ? normalizedCurve
    : normalizedProfiles.length
      ? normalizedProfiles[0].curve.map(point => ({ ...point }))
      : [];
  if (!resolvedCurve.length) return null;
  const clonePoints = points => (Array.isArray(points)
    ? points.map(point => ({ current: point.current, time: point.time }))
    : []);
      const cloneProfiles = profiles => (Array.isArray(profiles)
        ? profiles.map(profile => {
            const cloned = {
              id: profile.id,
              name: profile.name,
              curve: clonePoints(profile.curve),
              settings: { ...(profile.settings || {}) }
            };
            if (profile.tolerance !== undefined) {
              cloned.tolerance = profile.tolerance && typeof profile.tolerance === 'object'
                ? { ...profile.tolerance }
                : profile.tolerance;
            }
            if (profile.role !== undefined) {
              const normalizedRole = normalizeCustomCurveRole(profile.role);
              if (normalizedRole) {
                cloned.role = normalizedRole;
              }
            }
            return cloned;
          })
        : []);
  curve.curve = clonePoints(resolvedCurve);
  curve.curveProfiles = cloneProfiles(normalizedProfiles);
  let existing = curve.id ? getCustomCurveById(curve.id) : null;
  if (!existing) {
    const nextSequence = (saved.customCurveCounter || saved.customCurves.length || 0) + 1;
    curve.id = curve.id || createCustomCurveId(nextSequence);
    curve.sequence = Number.isFinite(curve.sequence) ? curve.sequence : nextSequence;
    saved.customCurveCounter = Math.max(saved.customCurveCounter || 0, curve.sequence);
    const storedCurve = {
      ...curve,
      curve: clonePoints(curve.curve),
      curveProfiles: cloneProfiles(curve.curveProfiles),
      axes: { ...(curve.axes || {}) },
      bounds: { ...(curve.bounds || {}) },
      settings: { ...(curve.settings || {}) }
    };
    saved.customCurves.push(storedCurve);
    curve = storedCurve;
  } else {
    existing.name = curve.name;
    existing.manufacturer = curve.manufacturer;
    existing.deviceType = curve.deviceType;
    existing.description = curve.description;
    existing.curve = clonePoints(curve.curve);
    existing.curveProfiles = cloneProfiles(curve.curveProfiles);
    existing.axes = { ...(curve.axes || {}) };
    existing.bounds = { ...(curve.bounds || {}) };
    existing.settings = { ...(curve.settings || {}) };
    existing.tolerance = curve.tolerance;
    if (Number.isFinite(curve.sequence)) {
      existing.sequence = curve.sequence;
    }
    curve = existing;
  }
  persistCustomCurveState({ refresh: true });
  if (select && curve.id) {
    const uid = `custom:${curve.id}`;
    const updated = new Set(selectedDeviceIds());
    updated.add(uid);
    applySelectionSet([...updated], { persist: true });
  }
  return curve;
}

function removeCustomCurve(curveId) {
  if (!curveId || !Array.isArray(saved.customCurves)) return false;
  const index = saved.customCurves.findIndex(curve => curve.id === curveId);
  if (index === -1) return false;
  saved.customCurves.splice(index, 1);
  persistCustomCurveState({ refresh: true });
  const uid = `custom:${curveId}`;
  if (selectedDeviceIds().includes(uid)) {
    removeDeviceFromSelection(uid);
  }
  return true;
}

async function confirmCustomCurveRemoval(entry) {
  const curveId = entry?.customCurveId;
  if (!curveId) return;
  const curve = getCustomCurveById(curveId);
  if (!curve) return;
  const response = await openModal({
    title: 'Remove Custom Curve',
    primaryText: 'Delete',
    secondaryText: 'Cancel',
    message: `Are you sure you want to delete "${curve.name}"? This action cannot be undone.`,
    variant: 'danger',
    onSubmit: () => true
  });
  if (response) {
    removeCustomCurve(curveId);
  }
}

function collectNeighborDeviceDefaults(targetId, depthLimit = MAX_NEIGHBOR_DEPTH) {
  const defaults = new Set();
  if (!targetId || !neighborMap.has(targetId)) return defaults;
  const visited = new Set([targetId]);
  const queue = [{ id: targetId, depth: 0 }];
  while (queue.length) {
    const { id, depth } = queue.shift();
    const neighbors = neighborMap.get(id);
    if (!neighbors || !neighbors.size) continue;
    neighbors.forEach(neighborId => {
      if (visited.has(neighborId)) return;
      visited.add(neighborId);
      const entry = componentDeviceMap.get(neighborId);
      if (entry) defaults.add(entry.uid);
      if (depth + 1 < depthLimit) {
        queue.push({ id: neighborId, depth: depth + 1 });
      }
    });
  }
  return defaults;
}

function buildTransformerInrushEntries(targetId) {
  const overlays = [];
  const reference = componentLookup.get(targetId)?.component;
  if (!reference) return overlays;
  const refVoltage = inferVoltage(reference);
  const refPhases = parsePhases(reference.phases).length || 3;
  const transformers = new Map();
  if (reference.type === 'transformer') {
    transformers.set(reference.id, reference);
  }
  (neighborMap.get(targetId) || new Set()).forEach(id => {
    const neighbor = componentLookup.get(id)?.component;
    if (!neighbor || neighbor.type !== 'transformer') return;
    if (!transformers.has(neighbor.id)) transformers.set(neighbor.id, neighbor);
  });
  transformers.forEach(transformer => {
    const inrush = computeTransformerInrush(transformer, refVoltage, refPhases);
    if (!inrush) return;
    overlays.push({
      uid: `inrush:${transformer.id}:${targetId}`,
      kind: 'inrush',
      name: `${componentLabel(transformer)} Inrush`,
      deviceCategory: 'transformer',
      deviceType: 'transformer inrush',
      current: inrush.current,
      duration: inrush.duration,
      sourceId: transformer.id,
      sourceLabel: componentLabel(transformer),
      autoSelect: true
    });
  });
  return overlays.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function buildTransformerDamageEntries(targetId) {
  const overlays = [];
  const reference = componentLookup.get(targetId)?.component;
  if (!reference) return overlays;
  const refVoltage = inferVoltage(reference);
  const refPhases = parsePhases(reference.phases).length || 3;
  const transformers = new Map();
  if (reference.type === 'transformer') {
    transformers.set(reference.id, reference);
  }
  (neighborMap.get(targetId) || new Set()).forEach(id => {
    const neighbor = componentLookup.get(id)?.component;
    if (!neighbor || neighbor.type !== 'transformer') return;
    if (!transformers.has(neighbor.id)) transformers.set(neighbor.id, neighbor);
  });
  transformers.forEach(transformer => {
    const damage = buildTransformerDamageCurve(transformer, refVoltage, refPhases);
    if (!damage) return;
    overlays.push({
      uid: `transformer-damage:${transformer.id}:${targetId}`,
      kind: 'transformerDamage',
      name: `${componentLabel(transformer)} Damage`,
      deviceCategory: 'transformer',
      deviceType: 'transformer damage',
      curve: damage.curve,
      fla: damage.fla,
      sourceLabel: componentLabel(transformer),
      autoSelect: true
    });
  });
  return overlays.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function buildCableEntries(targetId) {
  const overlays = [];
  const seen = new Set();
  componentRecords.forEach(({ component }) => {
    (component.connections || []).forEach(conn => {
      if (component.id !== targetId && conn.target !== targetId) return;
      const source = component.id === targetId ? component : componentLookup.get(conn.target)?.component;
      const other = component.id === targetId ? componentLookup.get(conn.target)?.component : component;
      const cableInfo = resolveCableInfo(component, other, conn);
      if (!cableInfo) return;
      const tag = cableInfo.tag || `edge:${[component.id, conn.target].sort().join('~')}`;
      if (seen.has(tag)) return;
      const phases = parsePhases(conn.phases || cableInfo.phases || (other?.phases ?? source?.phases));
      const curve = buildCableCurve(cableInfo, phases.length || 3);
      if (!curve) return;
      seen.add(tag);
      overlays.push({
        uid: `cable:${tag}`,
        kind: 'cable',
        name: `${cableInfo.tag || 'Cable'} Damage${other ? ` (${componentLabel(source)} → ${componentLabel(other)})` : ''}`,
        deviceCategory: 'cable',
        deviceType: 'cable damage',
        curve: curve.curve,
        ampacity: curve.ampacity,
        sourceLabel: componentLabel(source),
        targetLabel: other ? componentLabel(other) : '',
        autoSelect: true
      });
    });
  });
  return overlays.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function buildMotorOverlayEntries(targetId) {
  const overlays = [];
  const reference = componentLookup.get(targetId)?.component;
  if (!reference) return overlays;
  const refVoltage = inferVoltage(reference);
  const refPhases = parsePhases(reference.phases).length || 3;
  const seen = new Set();

  const addMotor = motor => {
    if (!motor || !MOTOR_TYPES.has(motor.type)) return;
    if (seen.has(motor.id)) return;
    const base = collectMotorOperatingData(motor, refVoltage, refPhases);
    if (!base) return;
    const startMetrics = resolveMotorStartingMetrics(motor, refVoltage, refPhases, base);
    const thermalMetrics = resolveMotorThermalLimit(motor, refVoltage, refPhases, base, startMetrics);
    if (!startMetrics && !thermalMetrics) return;
    seen.add(motor.id);
    if (startMetrics) {
      overlays.push({
        uid: `motor-start:${motor.id}:${targetId}`,
        kind: 'motorStart',
        name: `${componentLabel(motor)} Motor Starting`,
        deviceCategory: 'motor',
        deviceType: 'motor starting',
        curve: startMetrics.curve,
        fla: startMetrics.fla,
        lockedRotor: startMetrics.lockedRotor,
        startTime: startMetrics.startTime,
        sourceLabel: componentLabel(motor),
        autoSelect: true
      });
    }
    if (thermalMetrics) {
      overlays.push({
        uid: `motor-thermal:${motor.id}:${targetId}`,
        kind: 'motorThermal',
        name: `${componentLabel(motor)} Motor Thermal Limit`,
        deviceCategory: 'motor',
        deviceType: 'motor thermal limit',
        curve: thermalMetrics.curve,
        fla: thermalMetrics.fla,
        lockedRotor: thermalMetrics.lockedRotor,
        serviceFactor: thermalMetrics.serviceFactor,
        stallTime: thermalMetrics.stallTime,
        continuousCurrent: thermalMetrics.continuousCurrent,
        sourceLabel: componentLabel(motor),
        autoSelect: true
      });
    }
  };

  addMotor(reference);
  (neighborMap.get(targetId) || new Set()).forEach(id => {
    const neighbor = componentLookup.get(id)?.component;
    addMotor(neighbor);
  });

  return overlays.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function renderDeviceList() {
  if (!deviceSelect) return;
  deviceSelect.innerHTML = '';
  deviceGroups.forEach(group => {
    if (!group.items.length) return;
    group.items.forEach(item => {
      const opt = new Option(item.name, item.uid);
      opt.dataset.kind = item.kind;
      deviceSelect.add(opt);
    });
  });
}

if (deviceModalBtn) {
  deviceModalBtn.addEventListener('click', () => {
    openDeviceSelectionModal();
  });
}

if (viewMenuBtn) {
  viewMenuBtn.addEventListener('click', () => {
    openViewOptionModal();
  });
}

function manufacturerPriority(name) {
  if (name === COMPONENT_FALLBACK_GROUP) return -2;
  if (name === LIBRARY_FALLBACK_GROUP) return -1;
  if (name === OTHER_MANUFACTURER_GROUP) return 2;
  if (OVERLAY_GROUP_SET.has(name)) return 5;
  return 0;
}

function getManufacturerLabel(entry) {
  if (!entry) return OTHER_MANUFACTURER_GROUP;
  if (entry.kind === 'library' || entry.kind === 'component') {
    const base = entry.baseDevice || {};
    const vendor = (base.vendor || base.manufacturer || '').trim();
    if (vendor) return vendor;
    if (entry.kind === 'component') {
      const componentVendor = (entry.componentVendor || getComponentVendor(entry.component)).trim();
      if (componentVendor) return componentVendor;
      return COMPONENT_FALLBACK_GROUP;
    }
    return LIBRARY_FALLBACK_GROUP;
  }
  return OVERLAY_GROUP_LABELS[entry.kind] || SYSTEM_OVERLAY_GROUP;
}

function normalizeTypeKey(value) {
  if (value === null || value === undefined) return 'other';
  const str = String(value).trim();
  if (!str) return 'other';
  return str.toLowerCase().replace(/[_\s-]+/g, ' ');
}

function resolveTypeLabel(rawValue) {
  const normalized = normalizeTypeKey(rawValue);
  if (TYPE_LABEL_OVERRIDES[normalized]) {
    return TYPE_LABEL_OVERRIDES[normalized];
  }
  if (!rawValue || !String(rawValue).trim()) {
    return 'Other Devices';
  }
  return formatOptionLabel(rawValue);
}

function resolveTypePriority(rawValue) {
  const normalized = normalizeTypeKey(rawValue);
  if (TYPE_PRIORITY.has(normalized)) {
    return TYPE_PRIORITY.get(normalized);
  }
  if (normalized.includes('breaker')) return -3;
  if (normalized.includes('relay')) return -2;
  if (normalized.includes('transformer')) return 2;
  if (normalized.includes('motor')) return 3;
  if (normalized.includes('cable')) return 4;
  return TYPE_PRIORITY.get('other');
}

function getTypeInfo(entry) {
  if (!entry) {
    return { id: 'other', label: 'Other Devices', priority: TYPE_PRIORITY.get('other') };
  }
  const base = entry.baseDevice || {};
  const category = entry.deviceCategory || base.type || entry.deviceType || entry.kind || 'other';
  const normalized = normalizeTypeKey(category);
  return {
    id: normalized,
    label: resolveTypeLabel(category),
    priority: resolveTypePriority(category)
  };
}

function buildTypeGroups(entries = deviceEntries) {
  const groups = new Map();
  entries.forEach(entry => {
    const typeInfo = getTypeInfo(entry);
    if (!groups.has(typeInfo.id)) {
      groups.set(typeInfo.id, {
        id: typeInfo.id,
        label: typeInfo.label,
        priority: typeInfo.priority,
        manufacturers: new Map(),
        total: 0
      });
    }
    const group = groups.get(typeInfo.id);
    const manufacturerName = getManufacturerLabel(entry);
    if (!group.manufacturers.has(manufacturerName)) {
      group.manufacturers.set(manufacturerName, {
        name: manufacturerName,
        entries: [],
        priority: manufacturerPriority(manufacturerName)
      });
    }
    group.manufacturers.get(manufacturerName).entries.push(entry);
    group.total += 1;
  });

  return [...groups.values()]
    .map(group => ({
      ...group,
      manufacturers: [...group.manufacturers.values()]
        .map(manufacturer => ({
          ...manufacturer,
          entries: manufacturer.entries
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        }))
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        })
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
}

function describeEntryAttributes(entry) {
  if (!entry) return [];
  if (entry.kind === 'library' || entry.kind === 'component') {
    const base = entry.baseDevice || {};
    const baseRows = Object.keys(base.settings || {}).map(field => ({
      label: formatSettingLabel(field),
      value: formatSettingValue(base.settings?.[field]),
      range: describeSettingRange(base, field)
    }));
    if (entry.isCustom) {
      const profileCount = Array.isArray(entry.customCurve?.curveProfiles)
        ? entry.customCurve.curveProfiles.length
        : 0;
      const pointCount = Array.isArray(entry.customCurve?.curve)
        ? entry.customCurve.curve.length
        : 0;
      let pointSummary = pointCount ? `${pointCount} point${pointCount === 1 ? '' : 's'}` : '';
      if (profileCount > 1) {
        pointSummary = pointSummary
          ? `${pointSummary} (primary of ${profileCount} curves)`
          : `Primary of ${profileCount} curves`;
      }
      baseRows.unshift({
        label: 'Data Points',
        value: pointSummary,
        range: ''
      });
      if (profileCount > 1) {
        baseRows.unshift({
          label: 'Curve Profiles',
          value: `${profileCount} curves`,
          range: ''
        });
      }
      const manufacturer = entry.baseDevice?.vendor || entry.baseDevice?.manufacturer || CUSTOM_CURVE_VENDOR_FALLBACK;
      baseRows.unshift({ label: 'Manufacturer', value: manufacturer, range: '' });
    }
    if (entry.kind === 'component') {
      const used = new Set(baseRows.map(row => row.label.toLowerCase()));
      const componentRows = describeComponentDetailRows(entry, used);
      baseRows.push(...componentRows);
    }
    return baseRows;
  }
  if (entry.kind === 'inrush') {
    return [
      { label: 'Inrush Current', value: entry.current !== undefined ? `${formatSettingValue(entry.current)} A` : '', range: '' },
      { label: 'Duration', value: entry.duration !== undefined ? `${formatSettingValue(entry.duration)} s` : '', range: '' }
    ];
  }
  if (entry.kind === 'transformerDamage') {
    return [
      { label: 'Full-Load Amps', value: entry.fla !== undefined ? `${formatSettingValue(entry.fla)} A` : '', range: '' },
      { label: 'Data Points', value: Array.isArray(entry.curve) ? `${entry.curve.length} points` : '', range: '' }
    ];
  }
  if (entry.kind === 'cable') {
    return [
      { label: 'Ampacity', value: entry.ampacity !== undefined ? `${formatSettingValue(entry.ampacity)} A` : '', range: '' },
      { label: 'Data Points', value: Array.isArray(entry.curve) ? `${entry.curve.length} points` : '', range: '' }
    ];
  }
  if (entry.kind === 'motorStart') {
    return [
      { label: 'Full-Load Amps', value: entry.fla !== undefined ? `${formatSettingValue(entry.fla)} A` : '', range: '' },
      { label: 'Locked Rotor', value: entry.lockedRotor !== undefined ? `${formatSettingValue(entry.lockedRotor)} A` : '', range: '' },
      { label: 'Start Time', value: entry.startTime !== undefined ? `${formatSettingValue(entry.startTime)} s` : '', range: '' }
    ];
  }
  if (entry.kind === 'motorThermal') {
    return [
      { label: 'Full-Load Amps', value: entry.fla !== undefined ? `${formatSettingValue(entry.fla)} A` : '', range: '' },
      { label: 'Locked Rotor', value: entry.lockedRotor !== undefined ? `${formatSettingValue(entry.lockedRotor)} A` : '', range: '' },
      { label: 'Stall Time', value: entry.stallTime !== undefined ? `${formatSettingValue(entry.stallTime)} s` : '', range: '' },
      { label: 'Service Factor', value: entry.serviceFactor !== undefined ? formatSettingValue(entry.serviceFactor) : '', range: '' },
      { label: 'Continuous Current', value: entry.continuousCurrent !== undefined ? `${formatSettingValue(entry.continuousCurrent)} A` : '', range: '' },
      { label: 'Data Points', value: Array.isArray(entry.curve) ? `${entry.curve.length} points` : '', range: '' }
    ];
  }
  return [];
}

const COMPONENT_DETAIL_FIELDS = [
  { label: 'Manufacturer', keys: ['manufacturer', 'vendor'] },
  { label: 'Model', keys: ['model', 'catalog_number', 'catalogNumber'] },
  {
    label: 'Amp Rating',
    keys: ['amp_rating', 'ampRating', 'ampacity', 'rating'],
    format: value => {
      const num = parseNumeric(value);
      if (Number.isFinite(num)) return `${formatSettingValue(num)} A`;
      const str = formatDetailValue(value);
      return str ? `${str} A` : '';
    }
  },
  {
    label: 'Frame Size',
    keys: ['frame', 'frame_size', 'breaker_frame', 'breakerFrame']
  },
  {
    label: 'Sensor Rating',
    keys: ['sensor_rating', 'sensorRating'],
    format: value => {
      const num = parseNumeric(value);
      if (Number.isFinite(num)) return `${formatSettingValue(num)} A`;
      const str = formatDetailValue(value);
      return str ? `${str} A` : '';
    }
  },
  { label: 'Trip Unit', keys: ['trip_unit', 'tripUnit'] },
  {
    label: 'Interrupt Rating',
    keys: ['interrupt_rating', 'interruptRating', 'ic_rating', 'icRating', 'short_circuit_rating', 'shortCircuitRating'],
    format: value => {
      const num = parseNumeric(value);
      if (Number.isFinite(num)) return `${formatSettingValue(num)} kA`;
      const str = formatDetailValue(value);
      return str ? `${str}` : '';
    }
  },
  {
    label: 'Full-Load Amps',
    keys: ['full_load_amps', 'fullLoadAmps', 'fla'],
    format: value => {
      const num = parseNumeric(value);
      if (Number.isFinite(num)) return `${formatSettingValue(num)} A`;
      const str = formatDetailValue(value);
      return str ? `${str} A` : '';
    }
  },
  {
    label: 'Voltage',
    keys: ['voltage', 'volts', 'kv', 'kV', 'prefault_voltage', 'baseKV'],
    format: value => {
      const num = parseNumeric(value);
      if (Number.isFinite(num)) {
        return `${formatSettingValue(num)} V`;
      }
      const str = formatDetailValue(value);
      if (!str) return '';
      if (/\bkv\b/i.test(str)) return str;
      return `${str} V`;
    }
  },
  {
    label: 'Phases',
    keys: ['phases'],
    format: value => {
      const phases = parsePhases(value);
      if (phases.length) return phases.join(', ');
      return formatDetailValue(value);
    }
  }
];

const COMPONENT_SKIP_KEYS = new Set([
  'id',
  'name',
  'label',
  'type',
  'subtype',
  'connections',
  'tccid',
  'tcc_id',
  'tccoverrides',
  'props',
  'x',
  'y',
  'cx',
  'cy',
  'fx',
  'fy',
  'px',
  'py',
  'width',
  'height',
  'rotation',
  'angle',
  'sheet',
  'sheetname',
  'componentid',
  'component_id',
  'notes',
  'description',
  'manufacturer',
  'vendor',
  'maker',
  'brand',
  'model',
  'amp_rating',
  'amprating',
  'ampacity',
  'rating',
  'frame',
  'frame_size',
  'breaker_frame',
  'framesize',
  'sensor_rating',
  'sensorrating',
  'trip_unit',
  'tripunit',
  'interrupt_rating',
  'interruptrating',
  'ic_rating',
  'icrating',
  'short_circuit_rating',
  'shortcircuitrating',
  'full_load_amps',
  'fullloadamps',
  'fla',
  'voltage',
  'volts',
  'kv',
  'prefault_voltage',
  'basekv',
  'phases'
]);

function describeComponentDetailRows(entry, usedLabels = new Set()) {
  const component = entry?.component;
  if (!component) return [];
  const rows = [];
  const used = usedLabels instanceof Set ? usedLabels : new Set();
  const normalizedSkip = new Set([...COMPONENT_SKIP_KEYS]);
  const maxRows = 20;

  const cableSources = [];
  if (component && typeof component === 'object') cableSources.push(component);
  if (component.cable && typeof component.cable === 'object') cableSources.push(component.cable);
  if (component.props && typeof component.props === 'object' && typeof component.props.cable === 'object') {
    cableSources.push(component.props.cable);
  }

  const pickValue = (keys, { sources = cableSources } = {}) => {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      for (const key of list) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          const value = source[key];
          if (value !== undefined && value !== null && value !== '') return value;
        }
        if (source.props && typeof source.props === 'object' && Object.prototype.hasOwnProperty.call(source.props, key)) {
          const value = source.props[key];
          if (value !== undefined && value !== null && value !== '') return value;
        }
      }
    }
    return null;
  };

  const pushRow = (label, value) => {
    const formatted = typeof value === 'string' ? value : formatDetailValue(value);
    if (!formatted) return;
    const key = label.toLowerCase();
    if (used.has(key)) return;
    rows.push({ label, value: formatted, range: '' });
    used.add(key);
  };

  const addField = ({ label, keys, format }) => {
    if (rows.length >= maxRows) return;
    for (const key of keys) {
      const raw = getComponentValue(component, key);
      if (raw === undefined || raw === null || raw === '') continue;
      let value;
      if (typeof format === 'function') {
        value = format(raw, { key, component });
      } else {
        value = formatDetailValue(raw);
      }
      if (!value) continue;
      pushRow(label, value);
      keys.forEach(k => normalizedSkip.add(String(k).toLowerCase()));
      return;
    }
  };

  COMPONENT_DETAIL_FIELDS.forEach(addField);

  const componentType = String(component.type || component.subtype || '').toLowerCase();
  if (componentType.includes('cable')) {
    const sizeValue = pickValue(['conductor_size', 'conductorSize', 'size', 'awg']);
    const conductorsDescriptor = pickValue(['conductors']);
    const materialValue = pickValue(['conductor_material', 'material']);
    const insulationRaw = pickValue(['insulation_rating', 'temperature_rating', 'insulation']);

    const resolvedSize = (() => {
      if (sizeValue) return formatDetailValue(sizeValue);
      if (conductorsDescriptor) {
        const parsed = parseConductorsDescriptor(conductorsDescriptor);
        if (parsed?.size) return formatDetailValue(parsed.size);
      }
      return '';
    })();

    if (resolvedSize) {
      pushRow('Conductor Size', resolvedSize);
      ['conductor_size', 'conductorsize', 'size', 'awg', 'conductors'].forEach(key => normalizedSkip.add(key));
    }
    if (materialValue) {
      pushRow('Conductor Material', formatOptionLabel(materialValue));
      ['conductor_material', 'conductormaterial', 'material'].forEach(key => normalizedSkip.add(key));
    }
    if (insulationRaw !== null && insulationRaw !== undefined && insulationRaw !== '') {
      const numeric = parseNumeric(insulationRaw);
      const formatted = Number.isFinite(numeric) && numeric > 0
        ? `${formatSettingValue(numeric)} °C`
        : formatDetailValue(insulationRaw);
      pushRow('Insulation Rating', formatted);
      ['insulation_rating', 'insulationrating', 'temperature_rating', 'temperaturerating', 'insulation']
        .forEach(key => normalizedSkip.add(key));
    }
  }

  const appendSimpleProps = source => {
    if (!source || typeof source !== 'object') return;
    Object.entries(source).forEach(([key, raw]) => {
      if (rows.length >= maxRows) return;
      if (raw === undefined || raw === null || raw === '') return;
      const normalizedKey = String(key).toLowerCase();
      if (normalizedSkip.has(normalizedKey)) return;
      if (typeof raw === 'object' && !Array.isArray(raw)) return;
      const value = formatDetailValue(raw);
      if (!value) return;
      pushRow(formatSettingLabel(key), value);
      normalizedSkip.add(normalizedKey);
    });
  };

  appendSimpleProps(component);
  if (component.props && typeof component.props === 'object') {
    appendSimpleProps(component.props);
  }

  return rows;
}

function renderDeviceDetails(entry, container, doc) {
  if (!container) return;
  const docRef = doc || container.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!docRef) return;
  container.innerHTML = '';
  if (!entry) {
    const empty = docRef.createElement('p');
    empty.className = 'device-detail-empty';
    empty.textContent = 'Select a device to view its properties.';
    container.appendChild(empty);
    return;
  }
  const title = docRef.createElement('h3');
  title.className = 'device-detail-title';
  title.textContent = entry.name;
  container.appendChild(title);

  const meta = docRef.createElement('dl');
  meta.className = 'device-detail-meta';
  const appendMeta = (term, value) => {
    if (!value) return;
    const dt = docRef.createElement('dt');
    dt.textContent = term;
    const dd = docRef.createElement('dd');
    dd.textContent = value;
    meta.append(dt, dd);
  };

  appendMeta('Manufacturer', getManufacturerLabel(entry));
  if (entry.kind === 'library') {
    appendMeta('Source', 'Library Device');
  } else if (entry.kind === 'component') {
    appendMeta('Source', 'One-Line Device');
    if (entry.sheetName) appendMeta('Sheet', entry.sheetName);
    if (entry.componentId) appendMeta('Component ID', entry.componentId);
    const assigned = entry.baseDevice?.name || entry.baseDeviceId || entry.component?.tccId;
    appendMeta('Assigned TCC Device', assigned || 'Not Assigned');
    appendMeta('Plot Status', entry.plotDisabledReason ? 'Unavailable' : 'Ready to Plot');
  } else {
    appendMeta('Source', 'System Curve');
  }

  const base = entry.baseDevice || {};
  const typeLabel = entry.deviceType || base.type;
  if (typeLabel) appendMeta('Type', formatOptionLabel(typeLabel));
  if (base.interruptRating !== undefined) {
    appendMeta('Interrupt Rating', `${formatSettingValue(base.interruptRating)} kA`);
  }
  if (entry.kind === 'inrush' || entry.kind === 'transformerDamage' || entry.kind === 'motorStart' || entry.kind === 'motorThermal') {
    appendMeta('Component', entry.sourceLabel || entry.sourceId || 'Associated Component');
  } else if (entry.kind === 'cable') {
    appendMeta('From', entry.sourceLabel || 'Source');
    appendMeta('To', entry.targetLabel || 'Destination');
  }
  if (entry.autoSelect) {
    appendMeta('Auto Selection', 'Added automatically when analyzing the linked component.');
  }

  if (meta.childElementCount) {
    container.appendChild(meta);
  }

  if (entry.kind === 'component' && entry.plotDisabledReason) {
    const warning = docRef.createElement('p');
    warning.className = 'device-detail-warning';
    warning.textContent = entry.plotDisabledReason;
    container.appendChild(warning);
  }

  const properties = describeEntryAttributes(entry);
  if (properties.length) {
    const table = docRef.createElement('table');
    table.className = 'device-property-table';
    const thead = docRef.createElement('thead');
    const headerRow = docRef.createElement('tr');
    ['Property', 'Default', 'Range / Options'].forEach(text => {
      const th = docRef.createElement('th');
      th.scope = 'col';
      th.textContent = text;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = docRef.createElement('tbody');
    properties.forEach(prop => {
      const row = docRef.createElement('tr');
      const nameCell = docRef.createElement('th');
      nameCell.scope = 'row';
      nameCell.textContent = prop.label;
      row.appendChild(nameCell);
      const valueCell = docRef.createElement('td');
      valueCell.textContent = prop.value || '—';
      row.appendChild(valueCell);
      const rangeCell = docRef.createElement('td');
      rangeCell.textContent = prop.range || '—';
      row.appendChild(rangeCell);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  } else {
    const emptyProps = docRef.createElement('p');
    emptyProps.className = 'device-detail-empty';
    emptyProps.textContent = 'No adjustable properties available.';
    container.appendChild(emptyProps);
  }

  if (entry.kind === 'library' || entry.kind === 'component') {
    const base = entry.baseDevice || {};
    const settingKeys = Object.keys(base.settings || {});
    if (settingKeys.length) {
      const settingsWrapper = docRef.createElement('div');
      settingsWrapper.className = 'device-detail-settings';
      const heading = docRef.createElement('h4');
      heading.textContent = 'Adjust Settings';
      settingsWrapper.appendChild(heading);
      settingKeys.forEach(field => {
        const label = docRef.createElement('div');
        label.className = 'device-setting-control';
        const title = docRef.createElement('span');
        title.textContent = formatSettingLabel(field);
        label.appendChild(title);
        const options = Array.isArray(base.settingOptions?.[field]) ? base.settingOptions[field] : null;
        const normalizedOptions = normalizeSettingOptions(options);
        const defaultValue = base.settings?.[field];
        const overrideValue = entry.overrideSource?.[field];
        if (normalizedOptions.length) {
          const select = docRef.createElement('select');
          select.dataset.field = field;
          select.dataset.valueType = resolveSettingType(defaultValue, options);
          select.dataset.defaultValue = defaultValue !== undefined && defaultValue !== null ? String(defaultValue) : '';
          normalizedOptions.forEach(opt => {
            const optEl = docRef.createElement('option');
            optEl.value = opt.valueStr;
            optEl.textContent = opt.label;
            select.appendChild(optEl);
          });
          const activeValue = overrideValue !== undefined ? overrideValue : defaultValue;
          const snapped = snapSettingValue(base, field, activeValue);
          const match = normalizedOptions.find(opt => valuesEqual(opt.value, snapped) || opt.valueStr === String(snapped ?? ''));
          if (match) {
            select.value = match.valueStr;
          }
          select.addEventListener('change', () => {
            updateEntryOverrideFromControl(entry, select);
          });
          label.appendChild(select);
        } else {
          const valueType = resolveSettingType(defaultValue, options);
          const input = docRef.createElement('input');
          input.type = valueType === 'string' ? 'text' : 'number';
          input.dataset.field = field;
          input.dataset.valueType = valueType;
          input.dataset.defaultValue = defaultValue !== undefined && defaultValue !== null ? String(defaultValue) : '';
          const sanitizedOverride = snapSettingValue(base, field, overrideValue);
          if (sanitizedOverride !== undefined && sanitizedOverride !== null && sanitizedOverride !== '') {
            input.value = valueType === 'string'
              ? String(sanitizedOverride)
              : formatSettingValue(Number(sanitizedOverride));
          }
          if (defaultValue !== undefined && defaultValue !== null) {
            input.placeholder = valueType === 'string'
              ? String(defaultValue)
              : formatSettingValue(Number(defaultValue));
          }
          input.addEventListener('change', () => {
            updateEntryOverrideFromControl(entry, input);
          });
          label.appendChild(input);
        }
        settingsWrapper.appendChild(label);
      });
      container.appendChild(settingsWrapper);
    }
  }
}

async function openDeviceSelectionModal() {
  const typeGroups = buildTypeGroups();
  if (!typeGroups.length) {
    await openModal({
      title: 'Select Devices',
      primaryText: 'Close',
      secondaryText: null,
      onSubmit: () => true,
      render(container) {
        const doc = container.ownerDocument;
        const message = doc.createElement('p');
        message.className = 'device-detail-empty';
        message.textContent = 'No protective devices are available for selection.';
        container.appendChild(message);
        return message;
      }
    });
    return;
  }

  const initialSelection = new Set(selectedDeviceIds());
  const selectionSet = new Set(initialSelection);

  const overrideSnapshots = new Map();
  deviceEntries
    .filter(entry => entry && (entry.kind === 'library' || entry.kind === 'component'))
    .forEach(entry => {
      overrideSnapshots.set(entry.uid, { ...(entry.overrideSource || {}) });
    });

  const findSelectedContext = () => {
    for (const group of typeGroups) {
      for (const manufacturer of group.manufacturers) {
        const entry = manufacturer.entries.find(item => selectionSet.has(item.uid));
        if (entry) {
          return { group, manufacturer, entry };
        }
      }
    }
    return null;
  };

  const selectedContext = findSelectedContext();
  let activeTypeId = selectedContext?.group?.id || typeGroups[0]?.id || null;
  let activeManufacturer = selectedContext?.manufacturer?.name
    || (typeGroups.find(group => group.id === activeTypeId)?.manufacturers[0]?.name)
    || null;
  let activeEntry = selectedContext?.entry
    || (typeGroups.find(group => group.id === activeTypeId)?.manufacturers.find(m => m.name === activeManufacturer)?.entries[0])
    || null;

  const getActiveTypeGroup = () => typeGroups.find(group => group.id === activeTypeId) || typeGroups[0] || null;

  let typeContainer;
  let manufacturerContainer;
  let modelContainer;
  let detailContainer;
  const modelElements = new Map();
  const firstButtonRef = { current: null };

  const docRef = { current: null };

  function updateActiveEntry(entry) {
    activeEntry = entry;
    modelElements.forEach(({ item }, uid) => {
      item.classList.toggle('active', !!entry && uid === entry.uid);
    });
    renderDeviceDetails(entry, detailContainer, docRef.current);
  }

  function renderDeviceTypes() {
    if (!typeContainer || !docRef.current) return;
    typeContainer.innerHTML = '';
    firstButtonRef.current = firstButtonRef.current && docRef.current.contains(firstButtonRef.current)
      ? firstButtonRef.current
      : null;
    typeGroups.forEach(group => {
      const button = docRef.current.createElement('button');
      button.type = 'button';
      button.className = 'device-type-btn';
      if (group.id === activeTypeId) button.classList.add('active');
      button.textContent = `${group.label} (${group.total})`;
      button.addEventListener('click', () => {
        activeTypeId = group.id;
        const selectedInGroup = group.manufacturers
          .map(manufacturer => ({ manufacturer, entry: manufacturer.entries.find(item => selectionSet.has(item.uid)) }))
          .find(result => result && result.entry);
        const fallbackManufacturer = group.manufacturers[0]?.name || null;
        activeManufacturer = selectedInGroup?.manufacturer?.name || fallbackManufacturer;
        activeEntry = selectedInGroup?.entry
          || (group.manufacturers.find(manufacturer => manufacturer.name === activeManufacturer)?.entries[0] || null);
        renderDeviceTypes();
        renderManufacturers();
        renderModels();
        updateActiveEntry(activeEntry);
      });
      if (!firstButtonRef.current) firstButtonRef.current = button;
      typeContainer.appendChild(button);
    });
  }

  function renderManufacturers() {
    if (!manufacturerContainer || !docRef.current) return;
    manufacturerContainer.innerHTML = '';
    const group = getActiveTypeGroup();
    if (!group || !group.manufacturers.length) {
      const empty = docRef.current.createElement('p');
      empty.className = 'device-detail-empty';
      empty.textContent = 'No manufacturers available for this device type.';
      manufacturerContainer.appendChild(empty);
      return;
    }
    if (!group.manufacturers.some(manufacturer => manufacturer.name === activeManufacturer)) {
      activeManufacturer = group.manufacturers[0].name;
    }
    group.manufacturers.forEach(manufacturer => {
      const button = docRef.current.createElement('button');
      button.type = 'button';
      button.className = 'device-manufacturer-btn';
      if (manufacturer.name === activeManufacturer) button.classList.add('active');
      button.textContent = `${manufacturer.name} (${manufacturer.entries.length})`;
      button.addEventListener('click', () => {
        activeManufacturer = manufacturer.name;
        const selectedInGroup = manufacturer.entries.find(entry => selectionSet.has(entry.uid));
        activeEntry = selectedInGroup || manufacturer.entries[0] || null;
        renderManufacturers();
        renderModels();
        updateActiveEntry(activeEntry);
      });
      if (!firstButtonRef.current) firstButtonRef.current = button;
      manufacturerContainer.appendChild(button);
    });
  }

  function renderModels() {
    if (!modelContainer || !docRef.current) return;
    modelElements.clear();
    modelContainer.innerHTML = '';
    const group = getActiveTypeGroup();
    if (!group) {
      const empty = docRef.current.createElement('p');
      empty.className = 'device-detail-empty';
      empty.textContent = 'No devices available for this type.';
      modelContainer.appendChild(empty);
      updateActiveEntry(null);
      return;
    }
    const manufacturer = group.manufacturers.find(m => m.name === activeManufacturer)
      || group.manufacturers[0];
    if (!manufacturer || !manufacturer.entries.length) {
      const empty = docRef.current.createElement('p');
      empty.className = 'device-detail-empty';
      empty.textContent = 'No models available for this manufacturer.';
      modelContainer.appendChild(empty);
      updateActiveEntry(null);
      return;
    }
    if (!manufacturer.entries.some(entry => entry.uid === (activeEntry && activeEntry.uid))) {
      activeEntry = manufacturer.entries.find(entry => selectionSet.has(entry.uid)) || manufacturer.entries[0] || null;
    }
    manufacturer.entries.forEach((entry, index) => {
      const item = docRef.current.createElement('div');
      item.className = 'device-model-item';
      if (activeEntry && activeEntry.uid === entry.uid) {
        item.classList.add('active');
      }
      const checkbox = docRef.current.createElement('input');
      checkbox.type = 'checkbox';
      const safeId = `device-model-${index}-${entry.uid.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      checkbox.id = safeId;
      checkbox.checked = selectionSet.has(entry.uid);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectionSet.add(entry.uid);
        } else {
          selectionSet.delete(entry.uid);
        }
        applySelectionSet(selectionSet);
      });
      checkbox.addEventListener('focus', () => updateActiveEntry(entry));
      item.appendChild(checkbox);

      const label = docRef.current.createElement('label');
      label.className = 'device-model-label';
      label.setAttribute('for', safeId);
      label.textContent = entry.name;
      label.addEventListener('click', () => updateActiveEntry(entry));
      label.addEventListener('focus', () => updateActiveEntry(entry));
      label.addEventListener('mouseenter', () => updateActiveEntry(entry));
      item.appendChild(label);

      const badge = docRef.current.createElement('span');
      badge.className = 'device-model-badge';
      if (entry.kind === 'component') {
        badge.textContent = 'One-Line';
      } else if (entry.kind === 'library') {
        badge.textContent = 'Library';
      } else {
        badge.textContent = 'Curve';
      }
      item.appendChild(badge);

      modelContainer.appendChild(item);
      modelElements.set(entry.uid, { item, checkbox });
    });
  }

  await openModal({
    title: 'Select Devices',
    description: 'Choose protective devices to include on the TCC chart.',
    primaryText: 'Done',
    secondaryText: 'Cancel',
    resizable: true,
    defaultWidth: 960,
    closeOnBackdrop: false,
    onSubmit() {
      applySelectionSet(selectionSet, { persist: true });
      requestPlotRefresh();
      return true;
    },
    onCancel() {
      overrideSnapshots.forEach((overrides, uid) => {
        const entry = deviceMap.get(uid);
        if (entry && (entry.kind === 'library' || entry.kind === 'component')) {
          entry.overrideSource = { ...overrides };
        }
      });
      applySelectionSet(initialSelection, { persist: true });
      requestPlotRefresh();
    },
    render(container, controls) {
      const doc = container.ownerDocument;
      docRef.current = doc;
      container.classList.add('device-selection-modal');
      const layout = doc.createElement('div');
      layout.className = 'device-selection-layout';

      const leftPane = doc.createElement('div');
      leftPane.className = 'device-selection-left';

      const typesHeading = doc.createElement('h3');
      typesHeading.className = 'device-selection-subtitle';
      typesHeading.textContent = 'Device Types';
      leftPane.appendChild(typesHeading);

      typeContainer = doc.createElement('div');
      typeContainer.className = 'device-type-list';
      leftPane.appendChild(typeContainer);

      const manufacturersHeading = doc.createElement('h3');
      manufacturersHeading.className = 'device-selection-subtitle';
      manufacturersHeading.textContent = 'Manufacturers';
      leftPane.appendChild(manufacturersHeading);

      manufacturerContainer = doc.createElement('div');
      manufacturerContainer.className = 'device-manufacturer-list';
      leftPane.appendChild(manufacturerContainer);

      const modelsHeading = doc.createElement('h3');
      modelsHeading.className = 'device-selection-subtitle';
      modelsHeading.textContent = 'Devices';
      leftPane.appendChild(modelsHeading);

      modelContainer = doc.createElement('div');
      modelContainer.className = 'device-model-list';
      leftPane.appendChild(modelContainer);

      detailContainer = doc.createElement('div');
      detailContainer.className = 'device-selection-details';

      layout.append(leftPane, detailContainer);
      container.appendChild(layout);

      renderDeviceTypes();
      renderManufacturers();
      renderModels();
      updateActiveEntry(activeEntry);

      const initialFocus = firstButtonRef.current || leftPane;
      if (initialFocus && controls && typeof controls.setInitialFocus === 'function') {
        controls.setInitialFocus(initialFocus);
      }
      return initialFocus;
    }
  });
}

async function openViewOptionModal() {
  if (!viewMenuBtn) return;
  viewMenuBtn.setAttribute('aria-expanded', 'true');
  const initial = [...activeViewOptions];
  const pending = new Set(initial);

  await openModal({
    title: 'Device Views',
    description: 'Choose which device characteristics to display alongside the plotted curves.',
    primaryText: 'Apply',
    secondaryText: 'Cancel',
    closeOnBackdrop: true,
    onSubmit() {
      setActiveViewOptions([...pending]);
      if (deviceSelect && deviceSelect.selectedOptions.length) {
        requestPlotRefresh();
      }
      viewMenuBtn.setAttribute('aria-expanded', 'false');
      return true;
    },
    onCancel() {
      setActiveViewOptions(initial, { persist: false });
      updateViewButtonLabel();
      viewMenuBtn.setAttribute('aria-expanded', 'false');
    },
    onClose() {
      viewMenuBtn.setAttribute('aria-expanded', 'false');
    },
    render(container, controls) {
      const doc = container.ownerDocument;
      container.classList.add('tcc-view-modal');
      const list = doc.createElement('ul');
      list.className = 'tcc-view-option-list';

      const clearItem = doc.createElement('li');
      clearItem.className = 'tcc-view-option-reset';
      const clearButton = doc.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'tcc-view-option-clear';
      clearButton.textContent = 'Clear all selections';
      clearButton.addEventListener('click', () => {
        pending.clear();
        list.querySelectorAll('input[type="checkbox"]').forEach(input => {
          input.checked = false;
        });
      });
      clearItem.appendChild(clearButton);
      list.appendChild(clearItem);

      TCC_VIEW_OPTIONS
        .filter(option => option.id !== 'none')
        .forEach(option => {
          const item = doc.createElement('li');
          const label = doc.createElement('label');
          label.className = 'tcc-view-option';
          const checkbox = doc.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.name = 'tcc-view-option';
          checkbox.value = option.id;
          checkbox.checked = pending.has(option.id);
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
              pending.add(option.id);
            } else {
              pending.delete(option.id);
            }
          });
          const textWrap = doc.createElement('div');
          const title = doc.createElement('span');
          title.className = 'tcc-view-option-label';
          title.textContent = option.label;
          textWrap.appendChild(title);
          if (option.description) {
            const desc = doc.createElement('span');
            desc.className = 'tcc-view-option-description';
            desc.textContent = option.description;
            textWrap.appendChild(desc);
          }
          label.append(checkbox, textWrap);
          item.appendChild(label);
          list.appendChild(item);
        });
      container.appendChild(list);
      const focusTarget = list.querySelector('input:checked') || list.querySelector('input');
      if (focusTarget && controls && typeof controls.setInitialFocus === 'function') {
        controls.setInitialFocus(focusTarget);
      }
      return focusTarget || list;
    }
  });
}

deviceSelect.addEventListener('change', () => {
  renderSelectedSummary();
  renderSettings();
  persistSettings();
  if (!updatingActiveComponentFromSelect) {
    const selectedEntries = selectedDeviceIds()
      .map(id => deviceMap.get(id))
      .filter(entry => entry && entry.kind === 'component' && entry.componentId);
    const firstComponent = selectedEntries[0] || null;
    if (firstComponent && getActiveComponentId() !== firstComponent.componentId) {
      updatingActiveComponentFromSelect = true;
      setActiveComponent(firstComponent.componentId, { preserveSelection: true });
      updatingActiveComponentFromSelect = false;
    }
  }
});
if (customCurveBtn) {
  customCurveBtn.addEventListener('click', () => {
    openCustomCurveBuilder();
  });
}
plotBtn.addEventListener('click', applyPlotAndPersistence);
if (printPlotBtn) {
  printPlotBtn.addEventListener('click', handlePrintPlot);
}
if (annotationBtn) {
  annotationBtn.setAttribute('aria-pressed', 'false');
  annotationBtn.addEventListener('click', () => {
    if (annotationBtn.disabled) return;
    if (annotationMode) {
      disableAnnotationMode();
    } else {
      enableAnnotationMode();
    }
  });
}
chart.on('click.annotation', handleAnnotationPlacement);
chart.on('contextmenu.hideMenu', () => {
  contextMenu.hide();
});
if (settingsDiv) {
  const handleSettingMutation = event => {
    const target = event.target;
    if (!target) return;
    const fieldSource = target.dataset?.field
      ? target
      : (typeof target.closest === 'function' ? target.closest('[data-field]') : null);
    if (!fieldSource || !fieldSource.dataset?.field) return;
    requestPlotRefresh();
  };
  settingsDiv.addEventListener('input', handleSettingMutation);
  settingsDiv.addEventListener('change', handleSettingMutation);
}
linkBtn.addEventListener('click', linkComponent);
openBtn.addEventListener('click', () => {
  const targetId = getActiveComponentId() || activeComponentId || compId;
  if (targetId) {
    window.open(`oneline.html?component=${encodeURIComponent(targetId)}`, '_blank');
  }
});

function applyPlotAndPersistence() {
  plot();
  persistSettings();
}

function requestPlotRefresh() {
  if (typeof requestAnimationFrame !== 'function') {
    applyPlotAndPersistence();
    return;
  }
  if (pendingPlotRefresh !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(pendingPlotRefresh);
  }
  pendingPlotRefresh = requestAnimationFrame(() => {
    pendingPlotRefresh = null;
    applyPlotAndPersistence();
  });
}

if (componentModalBtn) {
  componentModalBtn.addEventListener('click', () => {
    openComponentBrowserModal();
  });
}

async function openComponentBrowserModal() {
  if (componentModalBtn) {
    componentModalBtn.setAttribute('aria-expanded', 'true');
  }

  // Ensure we rebuild the catalog so one-line changes made since the last
  // refresh are represented when the modal opens. This keeps the component
  // list in sync with the latest diagram data instead of relying on the
  // previously cached entries.
  refreshCatalog({ preserveSelection: true });

  const componentEntries = buildComponentDisplayEntries();
  if (!componentEntries.length) {
    await openModal({
      title: 'One-Line Components',
      primaryText: 'Close',
      secondaryText: null,
      onSubmit: () => true,
      onCancel: () => {
        if (componentModalBtn) componentModalBtn.setAttribute('aria-expanded', 'false');
      },
      render(container) {
        const doc = container.ownerDocument;
        const message = doc.createElement('p');
        message.className = 'device-detail-empty';
        message.textContent = 'No one-line components are available to display.';
        container.appendChild(message);
        return message;
      }
    });
    if (componentModalBtn) {
      componentModalBtn.setAttribute('aria-expanded', 'false');
    }
    return;
  }

  const componentEntryMap = new Map(componentEntries.map(entry => [entry.componentId, entry]));
  const typeGroups = buildTypeGroups(componentEntries);
  const currentContextId = getActiveComponentId() || activeComponentId || compId;
  const initialEntry = (currentContextId && componentEntryMap.get(currentContextId)) || componentEntries[0] || null;
  const initialSelection = new Set(selectedDeviceIds());
  const selectionSet = new Set(initialSelection);
  const sanitizeSelectionSet = () => {
    componentEntries.forEach(entry => {
      if (
        entry.kind === 'component'
        && entry.plotDisabledReason
        && selectionSet.has(entry.uid)
      ) {
        selectionSet.delete(entry.uid);
      }
    });
  };
  let activeEntry = initialEntry;
  let activeTypeId = initialEntry ? getTypeInfo(initialEntry).id : typeGroups[0]?.id || null;
  let activeManufacturer = initialEntry ? getManufacturerLabel(initialEntry) : null;

  const getGroupById = id => typeGroups.find(group => group.id === id) || null;
  const ensureManufacturerForGroup = group => {
    if (!group || !group.manufacturers.length) return null;
    if (activeManufacturer && group.manufacturers.some(m => m.name === activeManufacturer)) {
      return group.manufacturers.find(m => m.name === activeManufacturer) || group.manufacturers[0];
    }
    activeManufacturer = group.manufacturers[0].name;
    return group.manufacturers[0];
  };

  const initialGroup = getGroupById(activeTypeId);
  const initialManufacturer = ensureManufacturerForGroup(initialGroup);
  if (!activeEntry || !initialManufacturer?.entries.some(entry => entry.uid === activeEntry.uid)) {
    activeEntry = initialManufacturer?.entries[0] || null;
  }

  const modelElements = new Map();
  const docRef = { current: null };
  const controllerRef = { current: null };
  let typeContainer;
  let manufacturerContainer;
  let modelContainer;
  let detailContainer;
  let modelsHeading;
  const firstButtonRef = { current: null };

  const updateModelSelectionIndicators = () => {
    modelElements.forEach(({ item, checkbox, entry: itemEntry }) => {
      const selected = selectionSet.has(itemEntry.uid);
      if (item) {
        item.classList.toggle('is-selected', selected);
      }
      if (checkbox) {
        checkbox.checked = selected;
      }
    });
  };

  const setEntrySelection = (entry, selected) => {
    if (!entry || !entry.uid) return;
    if (entry.plotDisabledReason) return;
    if (selected) {
      selectionSet.add(entry.uid);
    } else {
      selectionSet.delete(entry.uid);
    }
    updateModelSelectionIndicators();
    if (activeEntry && entry.uid === activeEntry.uid) {
      updateActiveEntry(entry);
    }
  };

  const getSelectedComponentEntries = () => [...selectionSet]
    .map(id => deviceMap.get(id))
    .filter(entry => (
      entry
      && entry.kind === 'component'
      && entry.componentId
      && !entry.plotDisabledReason
    ));

  const applySelection = (activeComponentOverride = null) => {
    const componentSelectionsBefore = getSelectedComponentEntries();
    const activeEntrySelected = activeEntry && selectionSet.has(activeEntry.uid);
    if (activeComponentOverride) {
      const overrideEntry = componentEntryMap.get(activeComponentOverride);
      if (overrideEntry && !overrideEntry.plotDisabledReason) {
        selectionSet.add(overrideEntry.uid);
      }
    } else if (
      activeEntry
      && activeEntry.kind === 'component'
      && activeEntry.componentId
      && !activeEntry.plotDisabledReason
      && !activeEntrySelected
      && componentSelectionsBefore.length === 0
    ) {
      selectionSet.add(activeEntry.uid);
    }
    sanitizeSelectionSet();
    const selectedIds = Array.from(selectionSet);
    const orderMap = new Map([...deviceSelect.options].map((option, index) => [option.value, index]));
    selectedIds.sort((a, b) => {
      const orderA = orderMap.has(a) ? orderMap.get(a) : Number.MAX_SAFE_INTEGER;
      const orderB = orderMap.has(b) ? orderMap.get(b) : Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
    const selectedComponents = getSelectedComponentEntries();
    const preferredComponentId = activeComponentOverride
      || (activeEntrySelected
        && activeEntry.kind === 'component'
        && activeEntry.componentId
        && !activeEntry.plotDisabledReason
        ? activeEntry.componentId
        : null)
      || selectedComponents[0]?.componentId
      || null;
    if (preferredComponentId) {
      setActiveComponent(preferredComponentId, { preserveSelection: true });
    }
    applySelectionSet(selectedIds, { persist: true });
    plot();
    return { appliedSelection: selectedIds, activeComponentId: preferredComponentId };
  };

  function updateActiveEntry(entry) {
    activeEntry = entry || null;
    modelElements.forEach(({ item, entry: itemEntry }, uid) => {
      const isActive = !!entry && uid === entry.uid;
      if (item) {
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-pressed', String(isActive));
        item.tabIndex = isActive ? 0 : -1;
        if (itemEntry?.plotDisabledReason) {
          item.classList.add('device-model-unavailable');
          item.title = itemEntry.plotDisabledReason;
        } else {
          item.classList.remove('device-model-unavailable');
          item.removeAttribute('title');
        }
      }
    });
    renderDeviceDetails(entry, detailContainer, docRef.current);
    if (controllerRef.current && typeof controllerRef.current.setPrimaryDisabled === 'function') {
      controllerRef.current.setPrimaryDisabled(false);
    }
    if (entry && entry.kind === 'component' && detailContainer && docRef.current) {
      const actions = docRef.current.createElement('div');
      actions.className = 'device-detail-actions';
      const toggleBtn = docRef.current.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'btn primary-btn';
      const selected = selectionSet.has(entry.uid);
      toggleBtn.textContent = selected ? 'Remove from Plot' : 'Add to Plot';
      toggleBtn.disabled = !!entry.plotDisabledReason;
      toggleBtn.addEventListener('click', () => {
        if (entry.plotDisabledReason) return;
        const nextSelected = !selectionSet.has(entry.uid);
        setEntrySelection(entry, nextSelected);
      });
      actions.appendChild(toggleBtn);
      const openLink = docRef.current.createElement('a');
      openLink.className = 'btn secondary-btn';
      openLink.href = `oneline.html?component=${encodeURIComponent(entry.componentId)}`;
      openLink.target = '_blank';
      openLink.rel = 'noopener';
      openLink.textContent = 'Open in One-Line';
      actions.appendChild(openLink);
      detailContainer.appendChild(actions);
    }
    updateModelSelectionIndicators();
  }

  function getActiveTypeGroup() {
    return getGroupById(activeTypeId) || typeGroups[0] || null;
  }

  function renderDeviceTypes() {
    if (!typeContainer || !docRef.current) return;
    typeContainer.innerHTML = '';
    const doc = docRef.current;
    typeGroups.forEach(group => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'device-type-btn';
      if (group.id === activeTypeId) button.classList.add('active');
      button.textContent = `${group.label} (${group.total})`;
      button.addEventListener('click', () => {
        if (activeTypeId === group.id) return;
        activeTypeId = group.id;
        const manufacturer = ensureManufacturerForGroup(group);
        const selectedInGroup = manufacturer?.entries.find(item => selectionSet.has(item.uid)) || null;
        activeEntry = selectedInGroup || manufacturer?.entries[0] || null;
        renderDeviceTypes();
        renderManufacturers();
        renderModels();
        updateActiveEntry(activeEntry);
      });
      if (!firstButtonRef.current) firstButtonRef.current = button;
      typeContainer.appendChild(button);
    });
  }

  function renderManufacturers() {
    if (!manufacturerContainer || !docRef.current) return;
    manufacturerContainer.innerHTML = '';
    const doc = docRef.current;
    const group = getActiveTypeGroup();
    if (!group || !group.manufacturers.length) {
      const empty = doc.createElement('p');
      empty.className = 'device-detail-empty';
      empty.textContent = 'No manufacturers available for this device type.';
      manufacturerContainer.appendChild(empty);
      return;
    }
    if (!group.manufacturers.some(manufacturer => manufacturer.name === activeManufacturer)) {
      activeManufacturer = group.manufacturers[0].name;
    }
    group.manufacturers.forEach(manufacturer => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'device-manufacturer-btn';
      if (manufacturer.name === activeManufacturer) button.classList.add('active');
      button.textContent = `${manufacturer.name} (${manufacturer.entries.length})`;
      button.addEventListener('click', () => {
        if (activeManufacturer === manufacturer.name) return;
        activeManufacturer = manufacturer.name;
        const selectedInManufacturer = manufacturer.entries.find(entry => selectionSet.has(entry.uid));
        activeEntry = selectedInManufacturer || manufacturer.entries[0] || null;
        renderManufacturers();
        renderModels();
        updateActiveEntry(activeEntry);
      });
      if (!firstButtonRef.current) firstButtonRef.current = button;
      manufacturerContainer.appendChild(button);
    });
  }

  function renderModels() {
    if (!modelContainer || !docRef.current) return;
    modelContainer.innerHTML = '';
    modelElements.clear();
    const doc = docRef.current;
    const group = getActiveTypeGroup();
    const manufacturer = group?.manufacturers.find(m => m.name === activeManufacturer) || null;
    if (!manufacturer || !manufacturer.entries.length) {
      modelsHeading.textContent = activeManufacturer
        ? `One-Line Devices – ${activeManufacturer}`
        : 'One-Line Devices';
      const empty = doc.createElement('p');
      empty.className = 'device-detail-empty';
      empty.textContent = 'No components available for this manufacturer.';
      modelContainer.appendChild(empty);
      return;
    }
    modelsHeading.textContent = `One-Line Devices – ${manufacturer.name}`;
    manufacturer.entries.forEach((entry, index) => {
      const item = doc.createElement('div');
      item.className = 'device-model-item';
      item.dataset.uid = entry.uid;
      item.setAttribute('role', 'button');
      const checkbox = doc.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'device-model-checkbox';
      const safeId = `component-model-${index}-${entry.uid.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      checkbox.id = safeId;
      checkbox.checked = selectionSet.has(entry.uid);
      if (entry.plotDisabledReason) {
        item.classList.add('device-model-unavailable');
        item.title = entry.plotDisabledReason;
        checkbox.disabled = true;
      }
      checkbox.addEventListener('click', event => {
        event.stopPropagation();
      });
      checkbox.addEventListener('change', event => {
        event.stopPropagation();
        setEntrySelection(entry, checkbox.checked);
      });

      const label = doc.createElement('label');
      label.className = 'device-model-label';
      label.setAttribute('for', safeId);
      label.textContent = entry.name;
      label.addEventListener('mouseenter', () => updateActiveEntry(entry));
      label.addEventListener('focus', () => updateActiveEntry(entry));

      const badge = doc.createElement('span');
      badge.className = 'device-model-badge';
      badge.textContent = 'One-Line';

      const isActive = !!activeEntry && entry.uid === activeEntry.uid;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-pressed', String(isActive));
      item.tabIndex = isActive ? 0 : -1;
      item.addEventListener('click', () => {
        if (activeEntry && activeEntry.uid === entry.uid) return;
        updateActiveEntry(entry);
      });
      item.addEventListener('focus', () => {
        if (activeEntry && activeEntry.uid === entry.uid) return;
        updateActiveEntry(entry);
      });
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          updateActiveEntry(entry);
        }
      });
      item.addEventListener('dblclick', event => {
        event.preventDefault();
        if (entry.plotDisabledReason) return;
        setEntrySelection(entry, true);
        const payload = applySelection(entry.componentId);
        if (controllerRef.current && typeof controllerRef.current.close === 'function') {
          controllerRef.current.close(payload);
        }
      });

      item.append(checkbox, label, badge);
      if (!firstButtonRef.current) firstButtonRef.current = item;
      modelElements.set(entry.uid, { item, entry, checkbox });
      modelContainer.appendChild(item);
    });
    updateModelSelectionIndicators();
  }

  const modalPromise = openModal({
    title: 'One-Line Components',
    primaryText: 'Apply Selection',
    secondaryText: 'Close',
    onSubmit: () => applySelection(),
    onCancel: () => {
      if (componentModalBtn) componentModalBtn.setAttribute('aria-expanded', 'false');
    },
    render(container, controller) {
      const doc = container.ownerDocument;
      docRef.current = doc;
      controllerRef.current = controller;
      if (controller && typeof controller.setPrimaryDisabled === 'function') {
        controller.setPrimaryDisabled(false);
      }
      container.classList.add('device-selection-modal');

      const layout = doc.createElement('div');
      layout.className = 'device-selection-layout';

      const leftPane = doc.createElement('div');
      leftPane.className = 'device-selection-left';

      const typesHeading = doc.createElement('h3');
      typesHeading.className = 'device-selection-subtitle';
      typesHeading.textContent = 'Device Types';
      typeContainer = doc.createElement('div');
      typeContainer.className = 'device-type-list';

      const manufacturersHeading = doc.createElement('h3');
      manufacturersHeading.className = 'device-selection-subtitle';
      manufacturersHeading.textContent = 'Manufacturers';
      manufacturerContainer = doc.createElement('div');
      manufacturerContainer.className = 'device-manufacturer-list';

      modelsHeading = doc.createElement('h3');
      modelsHeading.className = 'device-selection-subtitle';
      modelsHeading.textContent = 'One-Line Devices';
      modelContainer = doc.createElement('div');
      modelContainer.className = 'device-model-list';

      leftPane.append(typesHeading, typeContainer, manufacturersHeading, manufacturerContainer, modelsHeading, modelContainer);

      detailContainer = doc.createElement('div');
      detailContainer.className = 'device-selection-details';

      layout.append(leftPane, detailContainer);
      container.appendChild(layout);

      firstButtonRef.current = null;
      renderDeviceTypes();
      renderManufacturers();
      renderModels();
      updateActiveEntry(activeEntry);

      return firstButtonRef.current || container.querySelector('button') || container;
    }
  });

  try {
    await modalPromise;
  } finally {
    controllerRef.current = null;
    if (componentModalBtn) componentModalBtn.setAttribute('aria-expanded', 'false');
  }
}

async function openCustomCurveBuilder(curveId = null) {
  const isEditing = !!curveId;
  const existing = isEditing ? getCustomCurveById(curveId) : null;
  const axes = { ...CUSTOM_CURVE_DEFAULT_AXES, ...(existing?.axes || {}) };
  const bounds = { ...CUSTOM_CURVE_DEFAULT_BOUNDS, ...(existing?.bounds || {}) };
  let workingPoints = [];
  let referenceImage = null;
  let referenceObjectUrl = null;
  let pendingPdfUrl = null;
  let lastCapturedPoint = null;

  const doc = document;
  const axisInputs = {};
  const boundInputs = {};
  const axisKeys = ['currentMin', 'currentMax', 'timeMin', 'timeMax'];
  const boundKeys = ['left', 'right', 'top', 'bottom'];

  let canvas = null;
  let ctx = null;
  let canvasContainer = null;
  let canvasScrollEl = null;
  let tableBody = null;
  let statusEl = null;
  let readoutEl = null;
  let cursorReadoutEl = null;
  let hoverTooltipEl = null;
  let manualCurrentInput = null;
  let manualTimeInput = null;
  let pointCountEl = null;

  let customSettings = { ...sanitizeCustomCurveSettings(existing?.settings || existing?.baseDevice?.settings || {}) };
  let lastPointer = null;

  let showAxisOverlay = true;
  let showReferenceImage = true;
  let referenceToggleInput = null;
  let axisOverlayInput = null;

  let axisTitleXEl = null;
  let axisTitleYEl = null;
  let axisTickContainerX = null;
  let axisTickContainerY = null;

  const ZOOM_DEFAULT = 1;
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 4;
  const ZOOM_STEP = 0.1;
  let zoomLevel = ZOOM_DEFAULT;
  let zoomSliderEl = null;
  let zoomValueEl = null;

  let nameInputEl = null;
  let manufacturerInputEl = null;
  let deviceTypeInputEl = null;
  let descriptionInputEl = null;

  const clonePoints = points => (Array.isArray(points)
    ? points.map(point => ({ current: point.current, time: point.time }))
    : []);

  const usedVariantIds = new Set();
  let curveVariants = [];
  let activeVariantId = null;
  let variantSelectEl = null;
  let variantNameInputEl = null;
  let removeVariantBtn = null;
  let variantRoleSelectEl = null;
  let variantCounter = 0;

  const VARIANT_ROLE_OPTIONS = [
    { value: 'standard', label: 'General curve' },
    { value: 'melting', label: 'Melting (minimum melt)' },
    { value: 'clearing', label: 'Clearing (total clearing)' },
    { value: 'symmetrical_rms_peak', label: 'Peak let-through (symmetrical RMS)' }
  ];

  const normalizeVariantRole = value => {
    if (typeof value !== 'string') return 'standard';
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'melting' || trimmed === 'clearing' || trimmed === 'symmetrical_rms_peak') {
      return trimmed;
    }
    return 'standard';
  };

  const defaultVariantName = (index, role = 'standard') => {
    if (role === 'melting') return 'Melting curve';
    if (role === 'clearing') return 'Clearing curve';
    if (role === 'symmetrical_rms_peak') return 'Peak let-through curve';
    return `Curve ${index + 1}`;
  };

  const syncVariantCounter = id => {
    if (typeof id !== 'string') return;
    const match = /([0-9]+)$/.exec(id);
    if (match) {
      variantCounter = Math.max(variantCounter, Number(match[1]));
    }
  };

  const reserveVariantId = candidate => {
    let base = '';
    if (typeof candidate === 'string' && candidate.trim()) {
      base = candidate.trim();
    } else if (Number.isFinite(candidate)) {
      base = `curve-${Math.abs(Math.trunc(candidate))}`;
    }
    if (!base) {
      variantCounter += 1;
      base = `curve-${variantCounter}`;
    }
    let id = base;
    syncVariantCounter(id);
    while (usedVariantIds.has(id)) {
      variantCounter += 1;
      id = `${base}-${variantCounter}`;
    }
    usedVariantIds.add(id);
    syncVariantCounter(id);
    return id;
  };

  const getVariantDisplayName = (variant, index) => {
    if (!variant) return defaultVariantName(index);
    const trimmed = typeof variant.name === 'string' ? variant.name.trim() : '';
    const role = normalizeVariantRole(variant.role);
    return trimmed || defaultVariantName(index, role);
  };

  const getActiveVariant = () => curveVariants.find(variant => variant.id === activeVariantId) || null;

  const updatePointCountLabel = () => {
    if (!pointCountEl) return;
    const variant = getActiveVariant();
    const index = variant ? curveVariants.findIndex(item => item.id === variant.id) : -1;
    const displayName = variant ? getVariantDisplayName(variant, index === -1 ? 0 : index) : '';
    const baseCount = `${workingPoints.length} point${workingPoints.length === 1 ? '' : 's'}`;
    pointCountEl.textContent = displayName ? `${baseCount} – ${displayName}` : baseCount;
  };

  const commitActiveVariant = () => {
    const variant = getActiveVariant();
    if (!variant) return;
    variant.points = clonePoints(workingPoints);
    variant.lastCaptured = lastCapturedPoint ? { ...lastCapturedPoint } : null;
  };

  const initializeVariants = () => {
    const profileSource = Array.isArray(existing?.curveProfiles) ? existing.curveProfiles : [];
    profileSource.forEach(profile => {
      const rawPoints = Array.isArray(profile?.curve)
        ? profile.curve
        : Array.isArray(profile?.points)
          ? profile.points
          : [];
      const points = sanitizeCurve(rawPoints);
      if (!points.length) return;
      const id = reserveVariantId(profile.id ?? profile.key ?? profile.name ?? profile.label ?? '');
      const nameSource = profile.name ?? profile.label;
      const role = normalizeVariantRole(profile?.role ?? profile?.kind);
      const name = typeof nameSource === 'string' && nameSource.trim()
        ? nameSource.trim()
        : defaultVariantName(curveVariants.length, role);
      curveVariants.push({
        id,
        name,
        role,
        points: clonePoints(points),
        lastCaptured: points.length ? { ...points[points.length - 1] } : null
      });
    });
    if (!curveVariants.length) {
      const fallbackPoints = sanitizeCurve(existing?.curve || []);
      const id = reserveVariantId(existing?.curveProfiles?.[0]?.id ?? '');
      const fallbackRole = normalizeVariantRole(profileSource[0]?.role ?? profileSource[0]?.kind);
      const fallbackName = profileSource.length
        && typeof profileSource[0]?.name === 'string'
        && profileSource[0].name.trim()
          ? profileSource[0].name.trim()
          : defaultVariantName(0, fallbackRole);
      curveVariants.push({
        id,
        name: fallbackName,
        role: fallbackRole,
        points: clonePoints(fallbackPoints),
        lastCaptured: fallbackPoints.length ? { ...fallbackPoints[fallbackPoints.length - 1] } : null
      });
    }
    if (!curveVariants.length) {
      const id = reserveVariantId('');
      curveVariants.push({
        id,
        name: defaultVariantName(0),
        role: 'standard',
        points: [],
        lastCaptured: null
      });
    }
    activeVariantId = curveVariants[0].id;
    workingPoints = clonePoints(curveVariants[0].points);
    lastCapturedPoint = curveVariants[0].lastCaptured
      ? { ...curveVariants[0].lastCaptured }
      : (workingPoints.length ? { ...workingPoints[workingPoints.length - 1] } : null);
  };

  const updateVariantControls = () => {
    if (variantSelectEl) {
      variantSelectEl.innerHTML = '';
      curveVariants.forEach((variant, index) => {
        const option = doc.createElement('option');
        option.value = variant.id;
        option.textContent = getVariantDisplayName(variant, index);
        variantSelectEl.appendChild(option);
      });
      if (activeVariantId && curveVariants.some(variant => variant.id === activeVariantId)) {
        variantSelectEl.value = activeVariantId;
      }
    }
    if (variantNameInputEl) {
      const variant = getActiveVariant();
      variantNameInputEl.value = variant?.name || '';
    }
    if (variantRoleSelectEl) {
      const variant = getActiveVariant();
      variantRoleSelectEl.value = normalizeVariantRole(variant?.role);
    }
    if (removeVariantBtn) {
      removeVariantBtn.disabled = curveVariants.length <= 1;
    }
    updatePointCountLabel();
  };

  const setActiveVariant = variantId => {
    if (!variantId || variantId === activeVariantId) return;
    commitActiveVariant();
    activeVariantId = variantId;
    const variant = getActiveVariant();
    workingPoints = clonePoints(variant ? variant.points : []);
    lastCapturedPoint = variant?.lastCaptured
      ? { ...variant.lastCaptured }
      : (workingPoints.length ? { ...workingPoints[workingPoints.length - 1] } : null);
    refreshPointTable();
    updateVariantControls();
  };

  initializeVariants();

  const formatCustomCurveValue = value => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    return num.toFixed(3);
  };

  const updateStatus = (message, type = 'info') => {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.dataset.variant = type;
  };

  const updateReadout = point => {
    if (!readoutEl) return;
    if (!point) {
      readoutEl.textContent = 'Click within the plot area to capture a point.';
      return;
    }
    readoutEl.textContent = `Last point: ${formatCustomCurveValue(point.current)} A @ ${formatCustomCurveValue(point.time)} s`;
  };

  const CURSOR_DEFAULT_TEXT = 'Cursor: Hover over the plot to see amperage and time.';
  const CURSOR_AXIS_PROMPT = 'Cursor: Enter valid axis bounds to enable readout.';

  const formatZoomValue = value => `${Math.round(value * 100)}%`;

  const applyZoom = () => {
    if (!canvas) return;
    const width = canvas.width || 720;
    const height = canvas.height || 480;
    canvas.style.width = `${Math.round(width * zoomLevel)}px`;
    canvas.style.height = `${Math.round(height * zoomLevel)}px`;
  };

  const updateZoomDisplay = () => {
    if (zoomSliderEl) zoomSliderEl.value = String(Math.round(zoomLevel * 100));
    if (zoomValueEl) zoomValueEl.textContent = formatZoomValue(zoomLevel);
  };

  const updateHoverTooltip = pointer => {
    if (!hoverTooltipEl || !canvasContainer) return;
    if (!pointer) {
      hoverTooltipEl.classList.remove('is-visible');
      return;
    }
    const metrics = computePlotMetrics();
    if (!metrics.axisValid) {
      hoverTooltipEl.classList.remove('is-visible');
      return;
    }
    const dataPoint = pixelToData(pointer.canvasX, pointer.canvasY, metrics);
    if (!dataPoint) {
      hoverTooltipEl.classList.remove('is-visible');
      return;
    }
    const containerRect = canvasContainer.getBoundingClientRect();
    if (!containerRect.width || !containerRect.height) {
      hoverTooltipEl.classList.remove('is-visible');
      return;
    }
    const currentText = `${formatCustomCurveValue(dataPoint.current)} A`;
    const timeText = `${formatCustomCurveValue(dataPoint.time)} s`;
    hoverTooltipEl.innerHTML = `<span>${currentText}</span><span>${timeText}</span>`;
    const margin = 16;
    const containerWidth = canvasContainer.offsetWidth || containerRect.width;
    const containerHeight = canvasContainer.offsetHeight || containerRect.height;
    let left = pointer.clientX - containerRect.left + margin;
    let top = pointer.clientY - containerRect.top + margin;
    const tooltipWidth = hoverTooltipEl.offsetWidth || 0;
    const tooltipHeight = hoverTooltipEl.offsetHeight || 0;
    if (left + tooltipWidth > containerWidth - margin) {
      left = Math.max(margin, pointer.clientX - containerRect.left - margin - tooltipWidth);
    }
    if (top + tooltipHeight > containerHeight - margin) {
      top = Math.max(margin, pointer.clientY - containerRect.top - margin - tooltipHeight);
    }
    hoverTooltipEl.style.left = `${left}px`;
    hoverTooltipEl.style.top = `${top}px`;
    hoverTooltipEl.classList.add('is-visible');
  };

  const setZoomLevel = value => {
    const next = clamp(value, ZOOM_MIN, ZOOM_MAX);
    if (Math.abs(next - zoomLevel) < 0.0001) return;
    zoomLevel = next;
    applyZoom();
    if (lastPointer) {
      const pointer = getPointerFromClient(lastPointer.clientX, lastPointer.clientY);
      lastPointer = pointer;
    }
    updateZoomDisplay();
    refreshCanvas();
    if (lastPointer) updateHoverTooltip(lastPointer);
    else updateHoverTooltip(null);
  };

  const adjustZoom = delta => {
    setZoomLevel(zoomLevel + delta);
  };

  const handleZoomWheel = event => {
    if (!event || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    const delta = Number(event.deltaY) || 0;
    if (!delta) return;
    const direction = delta > 0 ? -1 : 1;
    adjustZoom(direction * ZOOM_STEP);
  };

  const updateCursorReadout = pointer => {
    if (!cursorReadoutEl) return;
    if (!pointer) {
      cursorReadoutEl.textContent = CURSOR_DEFAULT_TEXT;
      updateHoverTooltip(null);
      return;
    }
    const metrics = computePlotMetrics();
    if (!metrics.axisValid) {
      cursorReadoutEl.textContent = CURSOR_AXIS_PROMPT;
      updateHoverTooltip(null);
      return;
    }
    const dataPoint = pixelToData(pointer.canvasX, pointer.canvasY, metrics);
    if (!dataPoint) {
      cursorReadoutEl.textContent = CURSOR_AXIS_PROMPT;
      updateHoverTooltip(null);
      return;
    }
    cursorReadoutEl.textContent = `Cursor: ${formatCustomCurveValue(dataPoint.current)} A @ ${formatCustomCurveValue(dataPoint.time)} s`;
    updateHoverTooltip(pointer);
  };

  const clamp = (value, min, max) => {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), max);
  };

  const getSettingOption = field => CUSTOM_CURVE_SETTING_CONFIG.get(field) || null;

  const updateSettingValue = (field, value) => {
    const option = getSettingOption(field);
    if (!option) return;
    if (option.numeric) {
      const numberValue = Number(value);
      if (Number.isFinite(numberValue) && numberValue >= 0) {
        customSettings[field] = numberValue;
      } else {
        delete customSettings[field];
      }
    } else if (value !== undefined && value !== null) {
      const strValue = String(value).trim();
      if (strValue) {
        customSettings[field] = strValue;
      } else {
        delete customSettings[field];
      }
    } else {
      delete customSettings[field];
    }
  };

  const bindSettingInput = (field, input) => {
    if (!input) return;
    const option = getSettingOption(field);
    if (!option) return;
    const existingValue = customSettings[field];
    if (existingValue !== undefined && existingValue !== null) {
      input.value = option.numeric
        ? formatSettingValue(Number(existingValue))
        : String(existingValue);
    }
    const handler = () => {
      updateSettingValue(field, option.numeric ? Number(input.value) : input.value);
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  };

  const getPointerFromClient = (clientX, clientY) => {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    if (offsetX < 0 || offsetY < 0 || offsetX > rect.width || offsetY > rect.height) return null;
    const scaleX = canvas.width / rect.width || 1;
    const scaleY = canvas.height / rect.height || 1;
    return {
      canvasX: offsetX * scaleX,
      canvasY: offsetY * scaleY,
      clientX,
      clientY
    };
  };

  const updateReferenceToggleState = () => {
    if (!referenceToggleInput) return;
    referenceToggleInput.disabled = !referenceImage;
    if (!referenceImage) {
      referenceToggleInput.checked = false;
    } else {
      referenceToggleInput.checked = showReferenceImage;
    }
  };

  const generateLogGrid = (min, max) => {
    if (!(Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > min)) {
      return { major: [], minor: [] };
    }
    const major = [];
    const minor = [];
    const minExp = Math.floor(Math.log10(min));
    const maxExp = Math.ceil(Math.log10(max));
    for (let exp = minExp; exp <= maxExp; exp++) {
      for (let digit = 1; digit < 10; digit += 1) {
        const value = digit * 10 ** exp;
        if (value < min || value > max) continue;
        if (digit === 1) major.push(value);
        else minor.push(value);
      }
    }
    const uniqueMajor = Array.from(new Set(major)).sort((a, b) => a - b);
    const uniqueMinor = Array.from(new Set(minor)).sort((a, b) => a - b);
    return { major: uniqueMajor, minor: uniqueMinor };
  };

  const drawAxisOverlay = metrics => {
    if (!ctx || !metrics?.axisValid) {
      return { verticalMajor: [], horizontalMajor: [] };
    }
    const axis = metrics.axisValues;
    const vertical = generateLogGrid(axis.currentMin, axis.currentMax);
    const horizontal = generateLogGrid(axis.timeMin, axis.timeMax);
    const isDarkMode = document.body?.classList?.contains('dark-mode');
    const minorStroke = isDarkMode ? 'rgba(96, 165, 250, 0.25)' : 'rgba(30, 64, 175, 0.25)';
    const majorStroke = isDarkMode ? 'rgba(96, 165, 250, 0.6)' : 'rgba(30, 64, 175, 0.55)';
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = minorStroke;
    const drawVerticalLine = value => {
      const top = dataToPixel({ current: value, time: axis.timeMin }, metrics);
      const bottom = dataToPixel({ current: value, time: axis.timeMax }, metrics);
      if (!top || !bottom) return;
      ctx.beginPath();
      ctx.moveTo(top.x, metrics.plotTop);
      ctx.lineTo(top.x, metrics.plotTop + metrics.plotHeight);
      ctx.stroke();
    };
    const drawHorizontalLine = value => {
      const left = dataToPixel({ current: axis.currentMin, time: value }, metrics);
      const right = dataToPixel({ current: axis.currentMax, time: value }, metrics);
      if (!left || !right) return;
      ctx.beginPath();
      ctx.moveTo(metrics.plotLeft, left.y);
      ctx.lineTo(metrics.plotLeft + metrics.plotWidth, left.y);
      ctx.stroke();
    };
    vertical.minor.forEach(drawVerticalLine);
    horizontal.minor.forEach(drawHorizontalLine);
    ctx.setLineDash([]);
    ctx.strokeStyle = majorStroke;
    ctx.lineWidth = 1.5;
    vertical.major.forEach(drawVerticalLine);
    horizontal.major.forEach(drawHorizontalLine);
    ctx.restore();
    return { verticalMajor: vertical.major, horizontalMajor: horizontal.major };
  };

  const clearAxisTickLabels = () => {
    if (axisTickContainerX) axisTickContainerX.innerHTML = '';
    if (axisTickContainerY) axisTickContainerY.innerHTML = '';
  };

  const updateAxisTickLabels = (metrics, verticalTicks = [], horizontalTicks = []) => {
    if (!axisTickContainerX || !axisTickContainerY || !canvasContainer || !canvasScrollEl || !canvas) {
      return;
    }
    const shouldShow = showAxisOverlay && metrics?.axisValid;
    axisTickContainerX.style.display = shouldShow ? 'block' : 'none';
    axisTickContainerY.style.display = shouldShow ? 'block' : 'none';
    clearAxisTickLabels();
    if (!shouldShow) {
      return;
    }
    const docRef = axisTickContainerX.ownerDocument || document;
    const containerRect = canvasContainer.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const scrollLeft = canvasScrollEl.scrollLeft || 0;
    const scrollTop = canvasScrollEl.scrollTop || 0;
    const offsetLeft = canvasRect.left - containerRect.left + scrollLeft;
    const offsetTop = canvasRect.top - containerRect.top + scrollTop;
    const intrinsicWidth = canvas.width || canvasRect.width || 1;
    const intrinsicHeight = canvas.height || canvasRect.height || 1;
    const scaleX = canvasRect.width ? canvasRect.width / intrinsicWidth : 1;
    const scaleY = canvasRect.height ? canvasRect.height / intrinsicHeight : 1;
    const axis = metrics.axisValues;
    const labelYOffset = 18;
    const labelXOffset = 18;
    verticalTicks.forEach(value => {
      const point = dataToPixel({ current: value, time: axis.timeMin }, metrics);
      if (!point) return;
      const label = docRef.createElement('div');
      label.className = 'custom-curve-axis-tick custom-curve-axis-tick-x';
      label.textContent = formatSettingValue(value);
      const displayX = offsetLeft + point.x * scaleX;
      const displayY = offsetTop + (metrics.plotTop + metrics.plotHeight) * scaleY + labelYOffset;
      label.style.left = `${displayX}px`;
      label.style.top = `${displayY}px`;
      axisTickContainerX.appendChild(label);
    });
    horizontalTicks.forEach(value => {
      const point = dataToPixel({ current: axis.currentMin, time: value }, metrics);
      if (!point) return;
      const label = docRef.createElement('div');
      label.className = 'custom-curve-axis-tick custom-curve-axis-tick-y';
      label.textContent = formatSettingValue(value);
      const displayLeft = offsetLeft + metrics.plotLeft * scaleX - labelXOffset;
      const displayTop = offsetTop + point.y * scaleY;
      label.style.left = `${displayLeft}px`;
      label.style.top = `${displayTop}px`;
      axisTickContainerY.appendChild(label);
    });
  };

  const getAxisValues = () => {
    const values = { ...CUSTOM_CURVE_DEFAULT_AXES, ...axes };
    let valid = true;
    axisKeys.forEach(key => {
      const input = axisInputs[key];
      if (!input) return;
      const parsed = Number(input.value);
      if (Number.isFinite(parsed) && parsed > 0) {
        values[key] = parsed;
      } else {
        valid = false;
      }
    });
    if (!(values.currentMin > 0 && values.currentMax > values.currentMin)) valid = false;
    if (!(values.timeMin > 0 && values.timeMax > values.timeMin)) valid = false;
    if (valid) {
      axes.currentMin = values.currentMin;
      axes.currentMax = values.currentMax;
      axes.timeMin = values.timeMin;
      axes.timeMax = values.timeMax;
    }
    return { values, valid };
  };

  const getBoundValues = () => {
    const values = { ...CUSTOM_CURVE_DEFAULT_BOUNDS, ...bounds };
    boundKeys.forEach(key => {
      const input = boundInputs[key];
      if (!input) return;
      const parsed = Number(input.value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        values[key] = parsed;
      }
    });
    bounds.left = values.left;
    bounds.right = values.right;
    bounds.top = values.top;
    bounds.bottom = values.bottom;
    return values;
  };

  const computePlotMetrics = () => {
    if (!canvas) {
      return {
        axisValues: axes,
        axisValid: true,
        bounds,
        width: 0,
        height: 0,
        plotLeft: 0,
        plotTop: 0,
        plotWidth: 0,
        plotHeight: 0
      };
    }
    const axisResult = getAxisValues();
    const boundValues = getBoundValues();
    const width = canvas.width || 720;
    const height = canvas.height || 480;
    const left = clamp(boundValues.left, 0, width - 40);
    const right = clamp(boundValues.right, 0, width - left - 20);
    const top = clamp(boundValues.top, 0, height - 40);
    const bottom = clamp(boundValues.bottom, 0, height - top - 20);
    const plotWidth = Math.max(width - left - right, 40);
    const plotHeight = Math.max(height - top - bottom, 40);
    return {
      axisValues: axisResult.values,
      axisValid: axisResult.valid,
      bounds: { left, right, top, bottom },
      width,
      height,
      plotLeft: left,
      plotTop: top,
      plotWidth,
      plotHeight
    };
  };

  const dataToPixel = (point, metrics) => {
    if (!metrics || !metrics.axisValid) return null;
    const axis = metrics.axisValues || {};
    const currentMin = Number(axis.currentMin);
    const currentMax = Number(axis.currentMax);
    const timeMin = Number(axis.timeMin);
    const timeMax = Number(axis.timeMax);
    if (!(currentMin > 0 && currentMax > currentMin && timeMin > 0 && timeMax > timeMin)) {
      return null;
    }
    const current = Number(point.current);
    const time = Number(point.time);
    if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(time) || time <= 0) return null;
    const currentRange = Math.log(currentMax / currentMin);
    const timeRange = Math.log(timeMin / timeMax);
    if (!Number.isFinite(currentRange) || currentRange <= 0) return null;
    if (!Number.isFinite(timeRange) || timeRange >= 0) return null;
    const normalizedX = clamp(Math.log(current / currentMin) / currentRange, 0, 1);
    const normalizedY = clamp(Math.log(time / timeMax) / timeRange, 0, 1);
    const x = metrics.plotLeft + normalizedX * metrics.plotWidth;
    const y = metrics.plotTop + normalizedY * metrics.plotHeight;
    return { x, y };
  };

  const pixelToData = (x, y, metrics) => {
    if (!metrics || !metrics.axisValid) return null;
    const axis = metrics.axisValues || {};
    const currentMin = Number(axis.currentMin);
    const currentMax = Number(axis.currentMax);
    const timeMin = Number(axis.timeMin);
    const timeMax = Number(axis.timeMax);
    if (!(currentMin > 0 && currentMax > currentMin && timeMin > 0 && timeMax > timeMin)) {
      return null;
    }
    const currentRange = Math.log(currentMax / currentMin);
    const timeRange = Math.log(timeMin / timeMax);
    if (!Number.isFinite(currentRange) || currentRange <= 0) return null;
    if (!Number.isFinite(timeRange) || timeRange >= 0) return null;
    const normalizedX = clamp((x - metrics.plotLeft) / metrics.plotWidth, 0, 1);
    const normalizedY = clamp((y - metrics.plotTop) / metrics.plotHeight, 0, 1);
    const current = currentMin * Math.exp(currentRange * normalizedX);
    const time = timeMax * Math.exp(timeRange * normalizedY);
    return { current, time };
  };

  const configureCanvasSize = image => {
    if (!canvas) return;
    if (image && image.width && image.height) {
      const maxWidth = 960;
      const maxHeight = 640;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const width = Math.max(480, Math.round(image.width * scale));
      const height = Math.max(360, Math.round(image.height * scale));
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    } else {
      canvas.width = 720;
      canvas.height = 480;
      canvas.style.width = '720px';
      canvas.style.height = '480px';
    }
    applyZoom();
  };

  const refreshCanvas = () => {
    if (!canvas || !ctx) return;
    const metrics = computePlotMetrics();
    const { width, height, plotLeft, plotTop, plotWidth, plotHeight } = metrics;
    const isDarkMode = document.body?.classList?.contains('dark-mode');
    const canvasBackground = isDarkMode ? '#0f172a' : '#f8fafc';
    const plotBackground = isDarkMode ? '#1e293b' : '#f1f5f9';
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = canvasBackground;
    ctx.fillRect(0, 0, width, height);
    if (referenceImage && showReferenceImage) {
      ctx.drawImage(referenceImage, 0, 0, width, height);
    } else {
      ctx.fillStyle = plotBackground;
      ctx.fillRect(plotLeft, plotTop, plotWidth, plotHeight);
    }
    ctx.save();
    ctx.fillStyle = canvasBackground;
    ctx.fillRect(0, 0, width, plotTop);
    ctx.fillRect(0, plotTop + plotHeight, width, Math.max(0, height - (plotTop + plotHeight)));
    ctx.fillRect(0, plotTop, plotLeft, plotHeight);
    ctx.fillRect(plotLeft + plotWidth, plotTop, Math.max(0, width - (plotLeft + plotWidth)), plotHeight);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(plotLeft, plotTop, plotWidth, plotHeight);
    ctx.restore();
    const overlayTicks = showAxisOverlay && metrics.axisValid
      ? drawAxisOverlay(metrics)
      : { verticalMajor: [], horizontalMajor: [] };
    updateAxisTickLabels(metrics, overlayTicks.verticalMajor, overlayTicks.horizontalMajor);
    if (axisTitleXEl && axisTitleYEl && canvasContainer && canvasScrollEl) {
      const shouldShow = showAxisOverlay && metrics.axisValid;
      axisTitleXEl.style.display = shouldShow ? 'block' : 'none';
      axisTitleYEl.style.display = shouldShow ? 'block' : 'none';
      if (shouldShow) {
        const containerRect = canvasContainer.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const scrollLeft = canvasScrollEl.scrollLeft || 0;
        const scrollTop = canvasScrollEl.scrollTop || 0;
        const offsetLeft = canvasRect.left - containerRect.left + scrollLeft;
        const offsetTop = canvasRect.top - containerRect.top + scrollTop;
        const canvasWidth = canvasRect.width || canvas.width || 0;
        const canvasHeight = canvasRect.height || canvas.height || 0;
        const axisTitleXLeft = offsetLeft + canvasWidth / 2;
        const baseAxisTitleXTop = offsetTop + canvasHeight + 24;
        const maxAxisTitleXTop = canvasScrollEl.scrollHeight + 48;
        axisTitleXEl.style.left = `${axisTitleXLeft}px`;
        axisTitleXEl.style.top = `${Math.min(baseAxisTitleXTop, maxAxisTitleXTop)}px`;
        axisTitleXEl.style.transform = 'translate(-50%, 0)';
        const desiredYLeft = offsetLeft - 32;
        const axisYWidth = axisTitleYEl.offsetWidth || 0;
        const minYLeft = axisYWidth ? axisYWidth / 2 : 32;
        let resolvedLeft = Math.max(minYLeft, desiredYLeft);
        let transform = 'translate(-100%, -50%) rotate(-90deg)';
        if (resolvedLeft === minYLeft) {
          transform = 'translate(-50%, -50%) rotate(-90deg)';
        }
        axisTitleYEl.style.left = `${resolvedLeft}px`;
        axisTitleYEl.style.top = `${offsetTop + canvasHeight / 2}px`;
        axisTitleYEl.style.transform = transform;
      }
    }
    if (metrics.axisValid) {
      if (workingPoints.length >= 2) {
        ctx.save();
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        let started = false;
        workingPoints.forEach(point => {
          const pixel = dataToPixel(point, metrics);
          if (!pixel) return;
          if (!started) {
            ctx.beginPath();
            ctx.moveTo(pixel.x, pixel.y);
            started = true;
          } else {
            ctx.lineTo(pixel.x, pixel.y);
          }
        });
        if (started) ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.fillStyle = '#1d4ed8';
      workingPoints.forEach(point => {
        const pixel = dataToPixel(point, metrics);
        if (!pixel) return;
        ctx.beginPath();
        ctx.arc(pixel.x, pixel.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
    if (lastCapturedPoint) {
      const highlight = dataToPixel(lastCapturedPoint, metrics);
      if (highlight) {
        ctx.save();
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(highlight.x, highlight.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    if (lastPointer) {
      updateCursorReadout(lastPointer);
    } else {
      updateCursorReadout(null);
    }
  };

  const refreshPointTable = ({ highlight } = {}) => {
    if (!tableBody) return lastCapturedPoint;
    workingPoints = sanitizeCurve(workingPoints);
    tableBody.innerHTML = '';
    if (!workingPoints.length) {
      const row = doc.createElement('tr');
      const cell = doc.createElement('td');
      cell.colSpan = 3;
      cell.className = 'custom-curve-table-empty';
      cell.textContent = 'No curve points defined. Capture points or add them manually to continue.';
      row.appendChild(cell);
      tableBody.appendChild(row);
      lastCapturedPoint = null;
      commitActiveVariant();
      updatePointCountLabel();
      refreshCanvas();
      updateReadout(null);
      return lastCapturedPoint;
    }
    workingPoints.forEach((point, index) => {
      const row = doc.createElement('tr');
      row.dataset.index = String(index);

      const currentCell = doc.createElement('td');
      const currentInput = doc.createElement('input');
      currentInput.type = 'number';
      currentInput.min = '0';
      currentInput.step = '0.001';
      currentInput.value = formatCustomCurveValue(point.current);
      currentInput.addEventListener('input', () => {
        workingPoints[index].current = Number(currentInput.value);
      });
      currentInput.addEventListener('change', () => {
        const nextCurrent = Number(currentInput.value);
        workingPoints[index].current = nextCurrent;
        refreshPointTable({ highlight: { current: nextCurrent, time: workingPoints[index].time } });
      });
      currentCell.appendChild(currentInput);

      const timeCell = doc.createElement('td');
      const timeInput = doc.createElement('input');
      timeInput.type = 'number';
      timeInput.min = '0';
      timeInput.step = '0.001';
      timeInput.value = formatCustomCurveValue(point.time);
      timeInput.addEventListener('input', () => {
        workingPoints[index].time = Number(timeInput.value);
      });
      timeInput.addEventListener('change', () => {
        const nextTime = Number(timeInput.value);
        workingPoints[index].time = nextTime;
        refreshPointTable({ highlight: { current: workingPoints[index].current, time: nextTime } });
      });
      timeCell.appendChild(timeInput);

      const actionCell = doc.createElement('td');
      const removeBtn = doc.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'custom-curve-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        workingPoints.splice(index, 1);
        refreshPointTable();
      });
      actionCell.appendChild(removeBtn);

      row.append(currentCell, timeCell, actionCell);
      tableBody.appendChild(row);
    });

    const approxEqual = (a, b) => {
      const diff = Math.abs(a - b);
      const scale = Math.max(1, Math.abs(a), Math.abs(b));
      return diff <= 1e-6 * scale;
    };
    const resolveHighlight = target => {
      if (!target) return null;
      const current = Number(target.current);
      const time = Number(target.time);
      if (!Number.isFinite(current) || !Number.isFinite(time)) return null;
      return workingPoints.find(point => approxEqual(point.current, current) && approxEqual(point.time, time)) || null;
    };
    const matched = resolveHighlight(highlight) || resolveHighlight(lastCapturedPoint);
    if (matched) {
      lastCapturedPoint = { ...matched };
    } else if (workingPoints.length) {
      const fallback = workingPoints[workingPoints.length - 1];
      lastCapturedPoint = { ...fallback };
    } else {
      lastCapturedPoint = null;
    }

    commitActiveVariant();
    updatePointCountLabel();
    refreshCanvas();
    updateReadout(lastCapturedPoint);
    return lastCapturedPoint;
  };

  const addPoint = (current, time, { announce = true } = {}) => {
    if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(time) || time <= 0) {
      return null;
    }
    workingPoints.push({ current, time });
    const captured = refreshPointTable({ highlight: { current, time } });
    if (announce) {
      updateStatus(`Added point ${formatCustomCurveValue(current)} A @ ${formatCustomCurveValue(time)} s.`, 'info');
    }
    return captured;
  };

  const handleManualAdd = () => {
    const current = Number(manualCurrentInput.value);
    const time = Number(manualTimeInput.value);
    if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(time) || time <= 0) {
      updateStatus('Provide positive values for current and time before adding the point.', 'error');
      return;
    }
    addPoint(current, time);
    manualCurrentInput.value = '';
    manualTimeInput.value = '';
    manualCurrentInput.focus();
  };

  const handleCanvasClick = event => {
    if (!canvas) return;
    const pointer = getPointerFromClient(event.clientX, event.clientY);
    if (!pointer) return;
    lastPointer = pointer;
    const metrics = computePlotMetrics();
    const point = pixelToData(pointer.canvasX, pointer.canvasY, metrics);
    if (!point) {
      updateStatus('Provide valid axis bounds before digitizing points.', 'error');
      return;
    }
    const captured = addPoint(point.current, point.time, { announce: true });
    if (captured) {
      lastCapturedPoint = captured;
    }
    updateCursorReadout(pointer);
  };

  const handleCanvasHover = event => {
    const pointer = getPointerFromClient(event.clientX, event.clientY);
    if (!pointer) {
      lastPointer = null;
      updateCursorReadout(null);
      return;
    }
    lastPointer = pointer;
    updateCursorReadout(pointer);
  };

  const handleCanvasLeave = () => {
    lastPointer = null;
    updateCursorReadout(null);
    if (hoverTooltipEl) hoverTooltipEl.classList.remove('is-visible');
  };

  const resetReference = () => {
    referenceImage = null;
    lastCapturedPoint = null;
    showReferenceImage = true;
    if (referenceObjectUrl) {
      URL.revokeObjectURL(referenceObjectUrl);
      referenceObjectUrl = null;
    }
    if (pendingPdfUrl) {
      URL.revokeObjectURL(pendingPdfUrl);
      pendingPdfUrl = null;
    }
    configureCanvasSize(null);
    refreshCanvas();
    updateReadout(null);
    updateReferenceToggleState();
  };

  const loadImageFromSource = src => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load reference image.'));
    image.src = src;
  });

  const handleReferenceFile = async file => {
    if (!file) return;
    updateStatus('Loading reference file…', 'info');
    try {
      resetReference();
      const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
      if (isPdf) {
        const pdfModule = await ensurePdfJs();
        pendingPdfUrl = URL.createObjectURL(file);
        const pdf = await pdfModule.getDocument({ url: pendingPdfUrl }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.6 });
        const tempCanvas = doc.createElement('canvas');
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        const tempCtx = tempCanvas.getContext('2d');
        await page.render({ canvasContext: tempCtx, viewport }).promise;
        const dataUrl = tempCanvas.toDataURL('image/png');
        referenceImage = await loadImageFromSource(dataUrl);
      } else {
        referenceObjectUrl = URL.createObjectURL(file);
        referenceImage = await loadImageFromSource(referenceObjectUrl);
      }
      configureCanvasSize(referenceImage);
      showReferenceImage = true;
      updateReferenceToggleState();
      refreshCanvas();
      updateStatus('Reference loaded. Click within the plot area to capture points.', 'info');
    } catch (err) {
      console.error('Failed to load reference', err);
      updateStatus('Unable to load the reference file. Try converting the PDF to an image if the issue persists.', 'error');
      resetReference();
    } finally {
      if (pendingPdfUrl) {
        URL.revokeObjectURL(pendingPdfUrl);
        pendingPdfUrl = null;
      }
      if (referenceObjectUrl) {
        URL.revokeObjectURL(referenceObjectUrl);
        referenceObjectUrl = null;
      }
    }
    updateReferenceToggleState();
  };

  const clearPoints = () => {
    workingPoints = [];
    refreshPointTable();
    updateStatus('Removed all curve points.', 'info');
  };

  const setAxisInputValues = () => {
    axisKeys.forEach(key => {
      if (axisInputs[key]) {
        axisInputs[key].value = axes[key];
      }
    });
  };

  const setBoundInputValues = () => {
    boundKeys.forEach(key => {
      if (boundInputs[key]) {
        boundInputs[key].value = bounds[key];
      }
    });
  };

  const result = await openModal({
    title: isEditing ? 'Edit Custom Curve' : 'Create Custom Curve',
    primaryText: isEditing ? 'Save Curve' : 'Add Curve',
    secondaryText: 'Cancel',
    resizable: true,
    defaultWidth: 920,
    render(body, controls) {
      const form = doc.createElement('form');
      form.className = 'custom-curve-form';
      controls.registerForm(form);

      const detailsSection = doc.createElement('section');
      detailsSection.className = 'custom-curve-section';
      const detailsHeading = doc.createElement('h3');
      detailsHeading.textContent = 'Curve Details';
      const detailsGrid = doc.createElement('div');
      detailsGrid.className = 'custom-curve-grid';

      const nameLabel = doc.createElement('label');
      nameLabel.textContent = 'Curve name';
      nameInputEl = doc.createElement('input');
      nameInputEl.type = 'text';
      nameInputEl.required = true;
      nameInputEl.value = existing?.name || '';
      nameLabel.appendChild(nameInputEl);

      const manufacturerLabel = doc.createElement('label');
      manufacturerLabel.textContent = 'Manufacturer (optional)';
      manufacturerInputEl = doc.createElement('input');
      manufacturerInputEl.type = 'text';
      manufacturerInputEl.value = existing?.manufacturer || '';
      manufacturerLabel.appendChild(manufacturerInputEl);

      const deviceTypeLabel = doc.createElement('label');
      deviceTypeLabel.textContent = 'Device type';
      deviceTypeInputEl = doc.createElement('select');
      const typeOptions = [CUSTOM_CURVE_CATEGORY, ...Array.from(PROTECTIVE_TYPES).sort()];
      typeOptions.forEach(typeValue => {
        const option = doc.createElement('option');
        option.value = typeValue;
        option.textContent = typeValue
          .split(/[_\s]+/)
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
        deviceTypeInputEl.appendChild(option);
      });
      if (existing?.deviceType && !typeOptions.includes(existing.deviceType)) {
        const customOption = doc.createElement('option');
        customOption.value = existing.deviceType;
        customOption.textContent = existing.deviceType
          .split(/[_\s]+/)
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
        deviceTypeInputEl.appendChild(customOption);
      }
      deviceTypeInputEl.value = existing?.deviceType && deviceTypeInputEl.querySelector(`option[value="${existing.deviceType}"]`)
        ? existing.deviceType
        : CUSTOM_CURVE_CATEGORY;
      deviceTypeLabel.appendChild(deviceTypeInputEl);

      detailsGrid.append(nameLabel, manufacturerLabel, deviceTypeLabel);

      const descriptionLabel = doc.createElement('label');
      descriptionLabel.textContent = 'Description (optional)';
      descriptionInputEl = doc.createElement('textarea');
      descriptionInputEl.rows = 3;
      descriptionInputEl.value = existing?.description || '';
      descriptionLabel.appendChild(descriptionInputEl);

      const settingsFieldset = doc.createElement('fieldset');
      settingsFieldset.className = 'custom-curve-fieldset';
      const settingsLegend = doc.createElement('legend');
      settingsLegend.textContent = 'Adjustable settings (optional)';
      const settingsHint = doc.createElement('p');
      settingsHint.className = 'custom-curve-settings-hint';
      settingsHint.textContent = 'Provide breaker pickup, delay, and instantaneous values when applicable. Leave fields blank to omit them.';
      const settingsGrid = doc.createElement('div');
      settingsGrid.className = 'custom-curve-settings-grid';
      CUSTOM_CURVE_SETTING_OPTIONS.forEach(option => {
        const label = doc.createElement('label');
        label.className = 'custom-curve-setting';
        const title = doc.createElement('span');
        title.className = 'custom-curve-setting-title';
        title.textContent = option.label;
        const input = doc.createElement('input');
        input.type = option.numeric ? 'number' : 'text';
        if (option.numeric) {
          input.min = '0';
          input.step = 'any';
        }
        input.placeholder = option.unit ? option.unit : 'Value';
        label.appendChild(title);
        if (option.unit) {
          const unitEl = doc.createElement('span');
          unitEl.className = 'custom-curve-setting-unit';
          unitEl.textContent = option.unit;
          label.appendChild(unitEl);
        }
        label.appendChild(input);
        bindSettingInput(option.field, input);
        settingsGrid.appendChild(label);
      });
      settingsFieldset.append(settingsLegend, settingsHint, settingsGrid);

      detailsSection.append(detailsHeading, detailsGrid, descriptionLabel, settingsFieldset);

      const referenceSection = doc.createElement('section');
      referenceSection.className = 'custom-curve-section';
      const referenceHeading = doc.createElement('h3');
      referenceHeading.textContent = 'Reference Mapping';
      const referenceGrid = doc.createElement('div');
      referenceGrid.className = 'custom-curve-reference';

      const referenceControls = doc.createElement('div');
      referenceControls.className = 'custom-curve-reference-controls';

      const uploadButton = doc.createElement('button');
      uploadButton.type = 'button';
      uploadButton.textContent = 'Upload PDF or image';
      const uploadInput = doc.createElement('input');
      uploadInput.type = 'file';
      uploadInput.accept = '.pdf,.png,.jpg,.jpeg,.gif,.webp';
      uploadInput.className = 'visually-hidden';
      uploadButton.addEventListener('click', () => uploadInput.click());
      uploadInput.addEventListener('change', () => {
        const [file] = uploadInput.files || [];
        handleReferenceFile(file);
        uploadInput.value = '';
      });

      const clearRefButton = doc.createElement('button');
      clearRefButton.type = 'button';
      clearRefButton.textContent = 'Clear reference';
      clearRefButton.addEventListener('click', () => {
        resetReference();
        updateStatus('Reference cleared.', 'info');
      });

      const fileControls = doc.createElement('div');
      fileControls.className = 'custom-curve-file-controls';
      fileControls.append(uploadButton, clearRefButton);

      const referenceToggleLabel = doc.createElement('label');
      referenceToggleLabel.className = 'custom-curve-toggle';
      referenceToggleInput = doc.createElement('input');
      referenceToggleInput.type = 'checkbox';
      referenceToggleInput.checked = showReferenceImage;
      referenceToggleInput.disabled = !referenceImage;
      referenceToggleInput.addEventListener('change', () => {
        showReferenceImage = referenceToggleInput.checked;
        refreshCanvas();
      });
      referenceToggleLabel.append(referenceToggleInput, doc.createTextNode('Show uploaded reference'));

      const axisFieldset = doc.createElement('fieldset');
      axisFieldset.className = 'custom-curve-fieldset';
      const axisLegend = doc.createElement('legend');
      axisLegend.textContent = 'Axis bounds';
      axisFieldset.appendChild(axisLegend);
      axisKeys.forEach(key => {
        const label = doc.createElement('label');
        label.textContent = key;
        const input = doc.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = 'any';
        axisInputs[key] = input;
        label.appendChild(input);
        input.addEventListener('input', () => refreshCanvas());
        input.addEventListener('change', () => {
          getAxisValues();
          refreshCanvas();
        });
        axisFieldset.appendChild(label);
      });

      const boundsFieldset = doc.createElement('fieldset');
      boundsFieldset.className = 'custom-curve-fieldset';
      const boundsLegend = doc.createElement('legend');
      boundsLegend.textContent = 'Plot padding (px)';
      boundsFieldset.appendChild(boundsLegend);
      boundKeys.forEach(key => {
        const label = doc.createElement('label');
        label.textContent = key;
        const input = doc.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = '1';
        boundInputs[key] = input;
        label.appendChild(input);
        input.addEventListener('input', () => refreshCanvas());
        input.addEventListener('change', () => {
          getBoundValues();
          refreshCanvas();
        });
        boundsFieldset.appendChild(label);
      });

      const axisOverlayLabel = doc.createElement('label');
      axisOverlayLabel.className = 'custom-curve-toggle';
      axisOverlayInput = doc.createElement('input');
      axisOverlayInput.type = 'checkbox';
      axisOverlayInput.checked = showAxisOverlay;
      axisOverlayInput.addEventListener('change', () => {
        showAxisOverlay = axisOverlayInput.checked;
        refreshCanvas();
      });
      axisOverlayLabel.append(axisOverlayInput, doc.createTextNode('Show generated axes overlay'));

      const zoomControls = doc.createElement('div');
      zoomControls.className = 'custom-curve-zoom-controls';

      const zoomHeader = doc.createElement('div');
      zoomHeader.className = 'custom-curve-zoom-header';
      const zoomLabel = doc.createElement('span');
      zoomLabel.className = 'custom-curve-zoom-label';
      zoomLabel.textContent = 'Zoom';
      zoomValueEl = doc.createElement('span');
      zoomValueEl.className = 'custom-curve-zoom-display';
      zoomHeader.append(zoomLabel, zoomValueEl);

      const zoomRow = doc.createElement('div');
      zoomRow.className = 'custom-curve-zoom-row';
      const zoomOutBtn = doc.createElement('button');
      zoomOutBtn.type = 'button';
      zoomOutBtn.className = 'custom-curve-zoom-button';
      zoomOutBtn.textContent = '−';
      zoomOutBtn.setAttribute('aria-label', 'Zoom out');
      zoomOutBtn.addEventListener('click', () => adjustZoom(-ZOOM_STEP));

      zoomSliderEl = doc.createElement('input');
      zoomSliderEl.type = 'range';
      zoomSliderEl.className = 'custom-curve-zoom-slider';
      zoomSliderEl.min = String(Math.round(ZOOM_MIN * 100));
      zoomSliderEl.max = String(Math.round(ZOOM_MAX * 100));
      zoomSliderEl.step = String(Math.round(ZOOM_STEP * 100));
      zoomSliderEl.value = String(Math.round(zoomLevel * 100));
      zoomSliderEl.setAttribute('aria-label', 'Zoom level');
      const syncZoom = () => {
        const parsed = Number(zoomSliderEl.value);
        if (Number.isFinite(parsed)) setZoomLevel(parsed / 100);
      };
      zoomSliderEl.addEventListener('input', syncZoom);
      zoomSliderEl.addEventListener('change', syncZoom);

      const zoomInBtn = doc.createElement('button');
      zoomInBtn.type = 'button';
      zoomInBtn.className = 'custom-curve-zoom-button';
      zoomInBtn.textContent = '+';
      zoomInBtn.setAttribute('aria-label', 'Zoom in');
      zoomInBtn.addEventListener('click', () => adjustZoom(ZOOM_STEP));

      zoomRow.append(zoomOutBtn, zoomSliderEl, zoomInBtn);

      const zoomResetBtn = doc.createElement('button');
      zoomResetBtn.type = 'button';
      zoomResetBtn.className = 'custom-curve-zoom-reset';
      zoomResetBtn.textContent = 'Reset';
      zoomResetBtn.addEventListener('click', () => setZoomLevel(ZOOM_DEFAULT));

      zoomControls.append(zoomHeader, zoomRow, zoomResetBtn);

      const displayToggleGroup = doc.createElement('div');
      displayToggleGroup.className = 'custom-curve-display-toggles';
      displayToggleGroup.append(referenceToggleLabel, axisOverlayLabel);

      const displayControls = doc.createElement('div');
      displayControls.className = 'custom-curve-display-controls';
      displayControls.append(displayToggleGroup, zoomControls);

      statusEl = doc.createElement('p');
      statusEl.className = 'custom-curve-status';
      cursorReadoutEl = doc.createElement('p');
      cursorReadoutEl.className = 'custom-curve-readout custom-curve-cursor';
      cursorReadoutEl.textContent = CURSOR_DEFAULT_TEXT;
      readoutEl = doc.createElement('p');
      readoutEl.className = 'custom-curve-readout';

      referenceControls.append(
        fileControls,
        uploadInput,
        axisFieldset,
        boundsFieldset,
        statusEl,
        cursorReadoutEl,
        readoutEl
      );

      canvasContainer = doc.createElement('div');
      canvasContainer.className = 'custom-curve-canvas-container';
      canvasScrollEl = doc.createElement('div');
      canvasScrollEl.className = 'custom-curve-canvas-scroll';
      canvas = doc.createElement('canvas');
      canvas.className = 'custom-curve-canvas';
      ctx = canvas.getContext('2d');
      canvas.addEventListener('click', handleCanvasClick);
      canvas.addEventListener('mousemove', handleCanvasHover);
      canvas.addEventListener('mouseleave', handleCanvasLeave);
      canvasScrollEl.addEventListener('wheel', handleZoomWheel, { passive: false });
      canvasScrollEl.appendChild(canvas);
      canvasContainer.appendChild(canvasScrollEl);

      axisTitleXEl = doc.createElement('div');
      axisTitleXEl.className = 'custom-curve-axis-title custom-curve-axis-title-x';
      axisTitleXEl.textContent = 'Current (A)';
      axisTitleXEl.style.display = 'none';
      canvasContainer.appendChild(axisTitleXEl);
      axisTitleYEl = doc.createElement('div');
      axisTitleYEl.className = 'custom-curve-axis-title custom-curve-axis-title-y';
      axisTitleYEl.textContent = 'Time (s)';
      axisTitleYEl.style.transformOrigin = 'left center';
      axisTitleYEl.style.display = 'none';
      canvasContainer.appendChild(axisTitleYEl);
      axisTickContainerX = doc.createElement('div');
      axisTickContainerX.className = 'custom-curve-axis-ticks custom-curve-axis-ticks-x';
      axisTickContainerX.style.display = 'none';
      canvasContainer.appendChild(axisTickContainerX);
      axisTickContainerY = doc.createElement('div');
      axisTickContainerY.className = 'custom-curve-axis-ticks custom-curve-axis-ticks-y';
      axisTickContainerY.style.display = 'none';
      canvasContainer.appendChild(axisTickContainerY);
      hoverTooltipEl = doc.createElement('div');
      hoverTooltipEl.className = 'custom-curve-hover-tooltip';
      hoverTooltipEl.setAttribute('aria-hidden', 'true');
      canvasContainer.appendChild(hoverTooltipEl);
      const canvasColumn = doc.createElement('div');
      canvasColumn.className = 'custom-curve-canvas-column';
      canvasColumn.append(displayControls, canvasContainer);

      referenceGrid.append(referenceControls, canvasColumn);
      referenceSection.append(referenceHeading, referenceGrid);

      const pointsSection = doc.createElement('section');
      pointsSection.className = 'custom-curve-section';
      const pointsHeading = doc.createElement('h3');
      pointsHeading.textContent = 'Curve Points';
      const variantControls = doc.createElement('div');
      variantControls.className = 'custom-curve-variant-controls';

      const variantSelectLabel = doc.createElement('label');
      variantSelectLabel.textContent = 'Curve';
      variantSelectEl = doc.createElement('select');
      variantSelectEl.className = 'custom-curve-variant-select';
      variantSelectLabel.appendChild(variantSelectEl);

      variantNameInputEl = doc.createElement('input');
      variantNameInputEl.type = 'text';
      variantNameInputEl.className = 'custom-curve-variant-name';
      variantNameInputEl.placeholder = 'Label (e.g., Melting)';

      const variantRoleLabel = doc.createElement('label');
      variantRoleLabel.textContent = 'Curve type';
      variantRoleSelectEl = doc.createElement('select');
      variantRoleSelectEl.className = 'custom-curve-variant-role';
      VARIANT_ROLE_OPTIONS.forEach(option => {
        const opt = doc.createElement('option');
        opt.value = option.value;
        opt.textContent = option.label;
        variantRoleSelectEl.appendChild(opt);
      });
      variantRoleLabel.appendChild(variantRoleSelectEl);

      const variantActions = doc.createElement('div');
      variantActions.className = 'custom-curve-variant-actions';
      const addVariantBtn = doc.createElement('button');
      addVariantBtn.type = 'button';
      addVariantBtn.textContent = 'Add curve';
      const removeVariantBtnEl = doc.createElement('button');
      removeVariantBtnEl.type = 'button';
      removeVariantBtnEl.textContent = 'Remove curve';
      variantActions.append(addVariantBtn, removeVariantBtnEl);

      variantControls.append(variantSelectLabel, variantNameInputEl, variantRoleLabel, variantActions);

      variantSelectEl.addEventListener('change', () => {
        const nextId = variantSelectEl.value;
        if (nextId) setActiveVariant(nextId);
      });

      variantNameInputEl.addEventListener('input', () => {
        const variant = getActiveVariant();
        if (!variant) return;
        variant.name = variantNameInputEl.value;
        updateVariantControls();
      });

      variantRoleSelectEl.addEventListener('change', () => {
        const variant = getActiveVariant();
        if (!variant) return;
        const nextRole = normalizeVariantRole(variantRoleSelectEl.value);
        variant.role = nextRole;
        if ((!variant.name || !variant.name.trim()) && nextRole !== 'standard') {
          const match = VARIANT_ROLE_OPTIONS.find(option => option.value === nextRole);
          if (match) {
            const suggested = match.label.split(' (')[0];
            variant.name = suggested;
            if (variantNameInputEl) {
              variantNameInputEl.value = variant.name;
            }
          }
        }
        updateVariantControls();
      });

      addVariantBtn.addEventListener('click', () => {
        commitActiveVariant();
        const newId = reserveVariantId('');
        const defaultName = defaultVariantName(curveVariants.length);
        const newVariant = { id: newId, name: defaultName, role: 'standard', points: [], lastCaptured: null };
        curveVariants.push(newVariant);
        activeVariantId = newId;
        workingPoints = [];
        lastCapturedPoint = null;
        updateVariantControls();
        refreshPointTable();
        updateStatus('New curve added. Capture or enter points for this rating.', 'info');
        if (variantNameInputEl) {
          variantNameInputEl.focus();
          variantNameInputEl.select();
        }
      });

      removeVariantBtn = removeVariantBtnEl;
      removeVariantBtn.addEventListener('click', () => {
        if (curveVariants.length <= 1) {
          updateStatus('At least one curve is required.', 'error');
          return;
        }
        const removedIndex = curveVariants.findIndex(variant => variant.id === activeVariantId);
        const removed = removedIndex !== -1 ? curveVariants[removedIndex] : null;
        curveVariants = curveVariants.filter(variant => variant.id !== activeVariantId);
        activeVariantId = curveVariants[0]?.id || null;
        const activeVariant = getActiveVariant();
        workingPoints = activeVariant ? clonePoints(activeVariant.points) : [];
        lastCapturedPoint = activeVariant
          ? (activeVariant.lastCaptured
            ? { ...activeVariant.lastCaptured }
            : (workingPoints.length ? { ...workingPoints[workingPoints.length - 1] } : null))
          : null;
        updateVariantControls();
        refreshPointTable();
        if (removed) {
          const label = getVariantDisplayName(removed, removedIndex === -1 ? 0 : removedIndex);
          updateStatus(`Removed curve ${label}.`, 'info');
        } else {
          updateStatus('Curve removed.', 'info');
        }
      });

      const toolbar = doc.createElement('div');
      toolbar.className = 'custom-curve-toolbar';
      manualCurrentInput = doc.createElement('input');
      manualCurrentInput.type = 'number';
      manualCurrentInput.min = '0';
      manualCurrentInput.step = '0.001';
      manualCurrentInput.placeholder = 'Current (A)';
      manualTimeInput = doc.createElement('input');
      manualTimeInput.type = 'number';
      manualTimeInput.min = '0';
      manualTimeInput.step = '0.001';
      manualTimeInput.placeholder = 'Time (s)';
      const addManualBtn = doc.createElement('button');
      addManualBtn.type = 'button';
      addManualBtn.textContent = 'Add point';
      addManualBtn.addEventListener('click', handleManualAdd);
      const handleManualKey = event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          handleManualAdd();
        }
      };
      manualCurrentInput.addEventListener('keydown', handleManualKey);
      manualTimeInput.addEventListener('keydown', handleManualKey);
      toolbar.append(manualCurrentInput, manualTimeInput, addManualBtn);

      const clearBtn = doc.createElement('button');
      clearBtn.type = 'button';
      clearBtn.textContent = 'Clear points';
      clearBtn.addEventListener('click', clearPoints);
      toolbar.appendChild(clearBtn);

      const table = doc.createElement('table');
      table.className = 'custom-curve-table';
      const thead = doc.createElement('thead');
      const headerRow = doc.createElement('tr');
      ['Current (A)', 'Time (s)', ''].forEach(label => {
        const th = doc.createElement('th');
        th.textContent = label;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      tableBody = doc.createElement('tbody');
      table.append(thead, tableBody);

      pointCountEl = doc.createElement('p');
      pointCountEl.className = 'custom-curve-count';

      pointsSection.append(pointsHeading, variantControls, toolbar, pointCountEl, table);

      form.append(detailsSection, referenceSection, pointsSection);
      body.appendChild(form);

      setAxisInputValues();
      setBoundInputValues();
      configureCanvasSize(referenceImage);
      updateReferenceToggleState();
      updateZoomDisplay();
      lastPointer = null;
      updateCursorReadout(null);
      updateVariantControls();
      refreshPointTable();
      updateStatus('Use the reference or manual inputs to define the curve.', 'info');

      if (controls && typeof controls.setInitialFocus === 'function') {
        controls.setInitialFocus(nameInputEl);
      }
      return { initialFocus: nameInputEl };
    },
    onSubmit() {
      const name = nameInputEl?.value.trim();
      if (!name) {
        updateStatus('Enter a curve name before saving.', 'error');
        if (nameInputEl) nameInputEl.focus();
        return false;
      }
      const axisResult = getAxisValues();
      if (!axisResult.valid) {
        updateStatus('Axis bounds must be positive values with the maximum greater than the minimum.', 'error');
        return false;
      }
      commitActiveVariant();
      const invalidVariant = curveVariants.find((variant, index) => {
        const points = sanitizeCurve(variant.points);
        if (points.length >= 2) return false;
        const label = getVariantDisplayName(variant, index);
        updateStatus(`Add at least two curve points for ${label}.`, 'error');
        return true;
      });
      if (invalidVariant) {
        return false;
      }
      const profilesPayload = curveVariants.map((variant, index) => {
        const role = normalizeVariantRole(variant.role);
        const payload = {
          id: variant.id,
          name: getVariantDisplayName(variant, index),
          curve: clonePoints(variant.points)
        };
        if (role !== 'standard') {
          payload.role = role;
        }
        return payload;
      });
      const sanitizedProfiles = sanitizeCustomCurveProfiles(profilesPayload);
      if (!sanitizedProfiles.length) {
        updateStatus('Add at least two curve points before saving.', 'error');
        return false;
      }
      const primaryCurve = sanitizedProfiles[0].curve.map(point => ({ current: point.current, time: point.time }));
      const sanitizedSettings = sanitizeCustomCurveSettings(customSettings);
      const payload = {
        id: existing?.id || null,
        name,
        manufacturer: manufacturerInputEl?.value.trim() || '',
        deviceType: deviceTypeInputEl?.value.trim() || CUSTOM_CURVE_CATEGORY,
        description: descriptionInputEl?.value.trim() || '',
        curve: primaryCurve,
        curveProfiles: sanitizedProfiles,
        axes: axisResult.values,
        bounds: getBoundValues(),
        settings: sanitizedSettings,
        tolerance: existing?.tolerance
      };
      saveCustomCurve(payload, { select: !isEditing });
      updateStatus(isEditing ? 'Custom curve updated.' : 'Custom curve created.', 'info');
      return payload;
    }
  });

  if (referenceObjectUrl) {
    URL.revokeObjectURL(referenceObjectUrl);
  }
  if (pendingPdfUrl) {
    URL.revokeObjectURL(pendingPdfUrl);
  }
  return result;
}

function renderSettings() {
  if (!settingsDiv) return;
  settingsDiv.innerHTML = '';
  selectedDeviceIds().forEach(uid => {
    const entry = deviceMap.get(uid);
    if (!entry) return;
    if (entry.kind !== 'library' && entry.kind !== 'component') return;
    const base = entry.baseDevice || {};
    const overrides = entry.overrideSource || {};
    const div = document.createElement('div');
    div.className = 'device-settings';
    div.dataset.uid = uid;
    div.dataset.kind = entry.kind;
    div.dataset.baseId = entry.baseDeviceId;
    if (entry.kind === 'component') div.dataset.componentId = entry.componentId;
    const heading = document.createElement('h3');
    heading.textContent = entry.name;
    div.appendChild(heading);
    Object.keys(base.settings || {}).forEach(field => {
      const defaultValue = base.settings?.[field];
      const overrideValue = overrides[field];
      const label = document.createElement('label');
      label.textContent = `${formatSettingLabel(field)} `;
      const options = Array.isArray(base.settingOptions?.[field]) ? base.settingOptions[field] : null;
      const normalizedOptions = normalizeSettingOptions(options);
      if (normalizedOptions.length) {
        const select = document.createElement('select');
        select.dataset.field = field;
        const valueType = resolveSettingType(defaultValue, options);
        select.dataset.valueType = valueType;
        select.dataset.defaultValue = defaultValue !== undefined && defaultValue !== null
          ? String(defaultValue)
          : '';
        normalizedOptions.forEach(opt => {
          const optEl = document.createElement('option');
          optEl.value = opt.valueStr;
          optEl.textContent = opt.label;
          select.appendChild(optEl);
        });
        const activeValue = overrideValue !== undefined ? overrideValue : defaultValue;
        if (activeValue !== undefined && activeValue !== null) {
          const snapped = snapSettingValue(base, field, activeValue);
          const match = normalizedOptions.find(opt => valuesEqual(opt.value, snapped));
          if (match) {
            select.value = match.valueStr;
          } else if (normalizedOptions[0]) {
            select.value = normalizedOptions[0].valueStr;
          }
        } else if (normalizedOptions[0]) {
          select.value = normalizedOptions[0].valueStr;
        }
        label.appendChild(select);
      } else {
        const input = document.createElement('input');
        input.type = 'number';
        input.dataset.field = field;
        input.dataset.valueType = 'number';
        input.dataset.defaultValue = defaultValue !== undefined && defaultValue !== null
          ? String(defaultValue)
          : '';
        if (overrideValue !== undefined && overrideValue !== null && overrideValue !== '') {
          const numeric = Number(overrideValue);
          if (Number.isFinite(numeric)) {
            input.value = formatSettingValue(numeric);
          }
        }
        if (defaultValue !== undefined && defaultValue !== null) {
          input.placeholder = formatSettingValue(defaultValue);
        }
        label.appendChild(input);
      }
      div.appendChild(label);
    });
    settingsDiv.appendChild(div);
  });
}

function persistSettings() {
  const selected = selectedDeviceIds();
  const deviceSettings = {};
  const componentSettings = {};
  if (settingsDiv) {
    settingsDiv.querySelectorAll('.device-settings').forEach(div => {
      const uid = div.dataset.uid;
      const entry = deviceMap.get(uid);
      if (!entry) return;
      const overrides = snapOverridesToOptions(entry.baseDevice, collectOverridesFromDiv(div));
      if (entry.kind === 'component') {
        if (Object.keys(overrides).length) {
          componentSettings[entry.componentId] = overrides;
        }
        entry.overrideSource = overrides;
      } else if (entry.kind === 'library') {
        if (Object.keys(overrides).length) {
          deviceSettings[entry.baseDeviceId] = overrides;
        }
        entry.overrideSource = overrides;
      }
    });
  } else {
    selected.forEach(uid => {
      const entry = deviceMap.get(uid);
      if (!entry) return;
      if (entry.kind !== 'component' && entry.kind !== 'library') return;
      const overrides = snapOverridesToOptions(entry.baseDevice, entry.overrideSource || {});
      if (entry.kind === 'component') {
        if (Object.keys(overrides).length) {
          componentSettings[entry.componentId] = overrides;
        }
        entry.overrideSource = overrides;
      } else if (entry.kind === 'library') {
        if (Object.keys(overrides).length) {
          deviceSettings[entry.baseDeviceId] = overrides;
        }
        entry.overrideSource = overrides;
      }
    });
  }
  saved.devices = selected;
  saved.settings = deviceSettings;
  saved.componentOverrides = componentSettings;
  saved.viewOptions = [...activeViewOptions];
  persistAnnotations({ skipSetItem: true });
  setItem('tccSettings', saved);
  syncComponentOverrides(componentSettings);
}

function syncComponentOverrides(componentSettings) {
  const data = getOneLine();
  let changed = false;
  (data.sheets || []).forEach(sheet => {
    (sheet.components || []).forEach(comp => {
      if (!PROTECTIVE_TYPES.has(comp.type)) return;
      const baseDevice = libraryDevices.find(dev => dev.id === comp.tccId);
      const rawOverrides = componentSettings[comp.id];
      const overrides = snapOverridesToOptions(baseDevice, rawOverrides || {});
      if (rawOverrides && Object.keys(overrides).length) {
        if (!deepEqual(comp.tccOverrides, overrides)) {
          comp.tccOverrides = overrides;
          changed = true;
        }
      } else if (comp.tccOverrides) {
        delete comp.tccOverrides;
        changed = true;
      }
    });
  });
  if (changed) {
    setOneLine(data);
    buildComponentData();
    rebuildCatalog();
    const defaults = new Set(saved.devices || []);
    deviceEntries
      .filter(entry => entry.autoSelect)
      .forEach(entry => defaults.add(entry.uid));
    selectDefaults(defaults);
    renderSettings();
    plot();
  }
}

function deepEqual(a, b) {
  const objA = a && typeof a === 'object' ? a : {};
  const objB = b && typeof b === 'object' ? b : {};
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(key => Object.is(objA[key], objB[key]));
}

function linkComponent(entryOverride = null) {
  const targetComponentId = getActiveComponentId() || compId;
  if (!targetComponentId) return;
  let entry = entryOverride;
  if (entry && entry.uid && deviceMap.has(entry.uid)) {
    entry = deviceMap.get(entry.uid);
  }
  if (!entry) {
    const first = selectedDeviceIds().find(id => {
      const candidate = deviceMap.get(id);
      return candidate && (candidate.kind === 'library' || candidate.kind === 'component');
    });
    if (!first) return;
    entry = deviceMap.get(first);
  }
  if (!entry || (entry.kind !== 'library' && entry.kind !== 'component')) return;
  const deviceId = entry.baseDeviceId;
  const overrides = snapOverridesToOptions(entry.baseDevice, entry.overrideSource || {});
  const data = getOneLine();
  let updated = false;
  (data.sheets || []).forEach(sheet => {
    (sheet.components || []).forEach(comp => {
      if (comp.id !== targetComponentId) return;
      comp.tccId = deviceId;
      if (overrides && Object.keys(overrides).length) {
        comp.tccOverrides = overrides;
      } else {
        delete comp.tccOverrides;
      }
      updated = true;
    });
  });
  if (updated) {
    setOneLine(data);
    buildComponentData();
    rebuildCatalog();
    selectDefaults(new Set([`component:${targetComponentId}`]));
    renderSettings();
    plot();
    renderOneLinePreview(targetComponentId);
  }
}

function gatherOverridesFromInputs(uid) {
  const entry = deviceMap.get(uid);
  if (!entry) return {};
  if (!settingsDiv) {
    return snapOverridesToOptions(entry.baseDevice, entry.overrideSource || {});
  }
  const selectorValue = String(uid).replace(/"/g, '\\"');
  const div = settingsDiv.querySelector(`.device-settings[data-uid="${selectorValue}"]`);
  if (!div) {
    return snapOverridesToOptions(entry.baseDevice, entry.overrideSource || {});
  }
  return snapOverridesToOptions(entry.baseDevice, collectOverridesFromDiv(div));
}

function plot() {
  contextMenu.hide();
  chart.selectAll('*').remove();
  violationDiv.textContent = '';
  annotationContext = null;
  setPlotAvailability(false);
  chart.classed('annotation-mode', false);
  let selectionIds = selectedDeviceIds();
  let selections = selectionIds.map(id => deviceMap.get(id)).filter(Boolean);
  const contextComponentId = getActiveComponentId();
  if (contextComponentId) {
    const ensureSelectionIds = () => {
      const set = new Set(selectionIds);
      let changed = false;
      const addUid = uid => {
        if (!uid || set.has(uid)) return;
        if (!deviceMap.has(uid)) return;
        set.add(uid);
        selectionIds.push(uid);
        changed = true;
      };
      const contextEntry = componentDeviceMap.get(contextComponentId);
      if (contextEntry) {
        addUid(contextEntry.uid);
      }
      collectNeighborDeviceDefaults(contextComponentId, 1).forEach(addUid);
      if (!changed) return false;
      applySelectionSet(selectionIds);
      saved.devices = [...selectionIds];
      saved.viewOptions = [...activeViewOptions];
      setItem('tccSettings', saved);
      return true;
    };
    if (ensureSelectionIds()) {
      selections = selectionIds.map(id => deviceMap.get(id)).filter(Boolean);
    }
  }
  if (!selections.length) return;

  const devicePlots = [];
  const overlays = [];

  selections.forEach(selection => {
    if (selection.kind === 'library' || selection.kind === 'component') {
      const overrides = snapOverridesToOptions(
        selection.baseDevice,
        {
          ...selection.overrideSource,
          ...gatherOverridesFromInputs(selection.uid)
        }
      );
      const scaled = scaleCurve(selection.baseDevice, overrides);
      devicePlots.push({ selection, overrides, scaled });
    } else if (selection.kind === 'cable' || selection.kind === 'inrush' || selection.kind === 'transformerDamage' || selection.kind === 'motorStart' || selection.kind === 'motorThermal') {
      overlays.push({ ...selection });
    }
  });

  if (!devicePlots.length && !overlays.length) return;

  let allCurrents = [];
  let allTimes = [];
  devicePlots.forEach(plotEntry => {
    const scaled = plotEntry.scaled;
    allCurrents = allCurrents.concat(scaled.curve.map(p => p.current).filter(v => v > 0));
    const band = scaled.envelope?.flatMap(p => [p.minTime, p.maxTime]) || [];
    const times = scaled.curve.map(p => p.time);
    allTimes = allTimes.concat(times.filter(v => v > 0), band.filter(v => v > 0));
  });
  overlays.forEach(entry => {
    if (entry.kind === 'cable') {
      entry.curve.forEach(point => {
        if (point.current > 0) allCurrents.push(point.current);
        if (point.time > 0) allTimes.push(point.time);
      });
    } else if (entry.kind === 'inrush') {
      if (entry.current > 0) allCurrents.push(entry.current);
      const normalizedDuration = Number.isFinite(entry.duration) && entry.duration > 0
        ? entry.duration
        : DEFAULT_INRUSH_DURATION;
      entry.normalizedDuration = normalizedDuration;
      allTimes.push(normalizedDuration);
    } else if (entry.kind === 'transformerDamage' || entry.kind === 'motorStart' || entry.kind === 'motorThermal') {
      entry.curve.forEach(point => {
        if (point.current > 0) allCurrents.push(point.current);
        if (point.time > 0) allTimes.push(point.time);
      });
    }
  });

  if (overlays.some(entry => entry.kind === 'motorStart')) {
    allTimes.push(MOTOR_START_PLOT_FLOOR, MOTOR_START_PLOT_CEILING);
  }

  const studies = getStudies();
  const contextId = getActiveComponentId();
  const fault = contextId ? studies.shortCircuit?.[contextId]?.threePhaseKA : null;
  if (fault) {
    allCurrents.push(fault * 1000);
  }

  const BASE_MARGIN = { top: 24, right: 90, bottom: 70, left: 70 };
  const baseWidth = +chart.attr('width') - BASE_MARGIN.left - BASE_MARGIN.right;
  const color = d3.scaleOrdinal(d3.schemeCategory10);
  const plottables = [...devicePlots, ...overlays];
  plottables.forEach((entry, index) => {
    entry.color = color(index);
  });

  const { layouts: legendLayouts, height: legendHeight } = computeLegendLayout(plottables, baseWidth);
  const legendSpacing = legendHeight ? 12 : 0;
  const margin = {
    top: BASE_MARGIN.top + legendHeight + legendSpacing,
    right: BASE_MARGIN.right,
    bottom: BASE_MARGIN.bottom,
    left: BASE_MARGIN.left
  };
  const width = baseWidth;
  const height = +chart.attr('height') - margin.top - margin.bottom;
  const g = chart.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const minCurrent = d3.min(allCurrents) || 1;
  const maxCurrent = d3.max(allCurrents) || minCurrent * 10;
  const minTime = d3.min(allTimes) || 0.01;
  const maxTime = d3.max(allTimes) || minTime * 10;
  const x = d3.scaleLog()
    .domain([Math.max(minCurrent / 1.5, 0.01), Math.max(maxCurrent * 1.5, minCurrent * 1.2)])
    .range([0, width]);
  const y = d3.scaleLog()
    .domain([Math.max(minTime / 1.5, 0.001), Math.max(maxTime * 1.3, minTime * 2)])
    .range([height, 0]);
  const xAxis = d3.axisBottom(x).ticks(10, '~g');
  const yAxis = d3.axisLeft(y).ticks(10, '~g');

  g.append('g').attr('transform', `translate(0,${height})`).call(xAxis);
  g.append('g').call(yAxis);

  g.append('g')
    .attr('class', 'grid grid-x')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis.tickSize(-height).tickFormat(''))
    .call(axis => axis.select('.domain').remove())
    .call(axis => axis.selectAll('line').attr('stroke', '#999').attr('stroke-opacity', 0.2));
  g.append('g')
    .attr('class', 'grid grid-y')
    .call(yAxis.tickSize(-width).tickFormat(''))
    .call(axis => axis.select('.domain').remove())
    .call(axis => axis.selectAll('line').attr('stroke', '#999').attr('stroke-opacity', 0.2));

  g.append('text')
    .attr('x', width / 2)
    .attr('y', height + margin.bottom - 5)
    .attr('text-anchor', 'middle')
    .attr('fill', '#333')
    .text('Current (A)');

  g.append('text')
    .attr('x', width / 2)
    .attr('y', -margin.top + 20)
    .attr('text-anchor', 'middle')
    .attr('fill', '#333')
    .text('Current (A)');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', -margin.left + 15)
    .attr('text-anchor', 'middle')
    .attr('fill', '#333')
    .text('Time (s)');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', width + margin.right - 20)
    .attr('text-anchor', 'middle')
    .attr('fill', '#333')
    .text('Time (s)');

  const clipIdBase = chart.attr('id') || 'tcc-chart';
  const clipId = `${clipIdBase}-plot-clip`;
  const defs = chart.append('defs');
  defs.append('clipPath')
    .attr('id', clipId)
    .attr('clipPathUnits', 'userSpaceOnUse')
    .append('rect')
    .attr('width', width)
    .attr('height', height);

  const plotLayer = g.append('g')
    .attr('class', 'tcc-plot-layer')
    .attr('clip-path', `url(#${clipId})`);
  const overlayLayer = plotLayer.append('g').attr('class', 'tcc-overlay-layer');
  const deviceLayer = plotLayer.append('g').attr('class', 'tcc-device-layer');
  const indicatorLayer = plotLayer.append('g').attr('class', 'tcc-indicator-layer');

  const legend = chart.append('g')
    .attr('class', 'tcc-legend')
    .attr('transform', `translate(${margin.left},${BASE_MARGIN.top})`);

  legendLayouts.forEach(layout => {
    const { entry, viewSummaries, legendLabel, x: itemX, y: itemY } = layout;
    const legendItem = legend.append('g').attr('transform', `translate(${itemX},${itemY})`);
    if (entry.kind === 'cable') {
      legendItem.append('line')
        .attr('x1', 0)
        .attr('x2', 16)
        .attr('y1', 8)
        .attr('y2', 8)
        .attr('stroke', entry.color)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6,3');
    } else if (entry.kind === 'inrush') {
      legendItem.append('line')
        .attr('x1', 2)
        .attr('x2', 14)
        .attr('y1', 2)
        .attr('y2', 14)
        .attr('stroke', entry.color)
        .attr('stroke-width', 2);
      legendItem.append('line')
        .attr('x1', 2)
        .attr('x2', 14)
        .attr('y1', 14)
        .attr('y2', 2)
        .attr('stroke', entry.color)
        .attr('stroke-width', 2);
    } else if (entry.kind === 'transformerDamage') {
      legendItem.append('line')
        .attr('x1', 0)
        .attr('x2', 16)
        .attr('y1', 8)
        .attr('y2', 8)
        .attr('stroke', entry.color)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '8,4');
    } else if (entry.kind === 'motorStart') {
      legendItem.append('line')
        .attr('x1', 0)
        .attr('x2', 16)
        .attr('y1', 8)
        .attr('y2', 8)
        .attr('stroke', entry.color)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '2,2');
    } else if (entry.kind === 'motorThermal') {
      legendItem.append('line')
        .attr('x1', 0)
        .attr('x2', 16)
        .attr('y1', 8)
        .attr('y2', 8)
        .attr('stroke', entry.color)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,1,1,1');
    } else {
      legendItem.append('rect')
        .attr('width', 16)
        .attr('height', 16)
        .attr('fill', entry.color)
        .attr('opacity', 0.6);
    }
    legendItem.append('text')
      .attr('x', 20)
      .attr('y', 12)
      .attr('fill', '#333')
      .attr('font-size', 12)
      .text(legendLabel);

    if (viewSummaries.length) {
      const badgesGroup = legendItem.append('g')
        .attr('class', 'tcc-view-badges')
        .attr('transform', `translate(20, ${12 + 14})`);
      let offsetX = 0;
      viewSummaries.forEach(summary => {
        const badge = badgesGroup.append('g')
          .attr('class', 'tcc-view-badge')
          .attr('transform', `translate(${offsetX},0)`);
        const text = badge.append('text')
          .attr('class', 'tcc-view-badge-text')
          .attr('x', 0)
          .attr('y', 10)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .text(summary);
        const textNode = text.node();
        const textWidth = Math.ceil(textNode ? textNode.getComputedTextLength() : summary.length * 7);
        const badgeWidth = Math.max(32, textWidth + 16);
        badge.insert('rect', 'text')
          .attr('class', 'tcc-view-badge-bg')
          .attr('x', 0)
          .attr('y', -2)
          .attr('rx', 6)
          .attr('ry', 6)
          .attr('width', badgeWidth)
          .attr('height', 20);
        text.attr('x', badgeWidth / 2);
        offsetX += badgeWidth + 8;
      });
    }
  });

  const viewSummaryLabel = summarizeActiveViewLabels();
  if (viewSummaryLabel) {
    chart.append('text')
      .attr('class', 'tcc-view-label')
      .attr('x', margin.left + width)
      .attr('y', Math.max(16, margin.top - 24))
      .attr('text-anchor', 'end')
      .text(`Views: ${viewSummaryLabel}`);
  }

  if (fault) {
    indicatorLayer.append('line')
      .attr('x1', x(fault * 1000))
      .attr('x2', x(fault * 1000))
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#000')
      .attr('stroke-dasharray', '4,2');
  }

  const line = d3.line().x(p => x(p.current)).y(p => y(p.time)).curve(d3.curveLinear);
  const bandArea = d3.area()
    .x(p => x(p.current))
    .y0(p => y(p.maxTime))
    .y1(p => y(p.minTime))
    .curve(d3.curveLinear);
  const [xMin, xMax] = x.range();
  const [yMin, yMax] = y.range();
  const [domainMinTime, domainMaxTime] = y.domain();
  const motorStartCurves = new Map();

  const addOrReplacePoint = (list, time, current) => {
    if (!Number.isFinite(time) || time <= 0) return;
    if (!Number.isFinite(current) || current <= 0) return;
    const existing = list.find(point => Math.abs(point.time - time) <= Math.max(time, point.time) * 1e-9);
    if (existing) {
      existing.time = time;
      existing.current = current;
    } else {
      list.push({ time, current });
    }
  };

  overlays.filter(entry => entry.kind === 'motorStart').forEach(entry => {
    const basePoints = Array.isArray(entry.curve)
      ? entry.curve.map(point => ({ time: point.time, current: point.current }))
      : [];
    const sanitized = basePoints.filter(point => (
      Number.isFinite(point.time)
      && point.time > 0
      && Number.isFinite(point.current)
      && point.current > 0
    ));
    addOrReplacePoint(sanitized, domainMinTime, entry.lockedRotor);
    addOrReplacePoint(sanitized, domainMaxTime, entry.fla);
    sanitized.sort((a, b) => a.time - b.time);
    motorStartCurves.set(entry, sanitized);
  });

  overlays.filter(entry => entry.kind === 'cable').forEach(entry => {
    overlayLayer.append('path')
      .datum(entry.curve)
      .attr('fill', 'none')
      .attr('stroke', entry.color)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '6,3')
      .attr('d', entry.curve.length ? line(entry.curve) : null);
  });

  overlays.filter(entry => entry.kind === 'transformerDamage').forEach(entry => {
    overlayLayer.append('path')
      .datum(entry.curve)
      .attr('fill', 'none')
      .attr('stroke', entry.color)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '8,4')
      .attr('d', entry.curve.length ? line(entry.curve) : null);
  });

  overlays.filter(entry => entry.kind === 'motorThermal').forEach(entry => {
    overlayLayer.append('path')
      .datum(entry.curve)
      .attr('fill', 'none')
      .attr('stroke', entry.color)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,1,1,1')
      .attr('d', entry.curve.length ? line(entry.curve) : null);
  });

  overlays.filter(entry => entry.kind === 'inrush').forEach(entry => {
    if (!(entry.current > 0)) return;
    const duration = entry.normalizedDuration ?? DEFAULT_INRUSH_DURATION;
    const xPos = x(entry.current);
    const yPos = y(duration);
    const size = 6;
    overlayLayer.append('line')
      .attr('x1', xPos - size)
      .attr('x2', xPos + size)
      .attr('y1', yPos - size)
      .attr('y2', yPos + size)
      .attr('stroke', entry.color)
      .attr('stroke-width', 2);
    overlayLayer.append('line')
      .attr('x1', xPos - size)
      .attr('x2', xPos + size)
      .attr('y1', yPos + size)
      .attr('y2', yPos - size)
      .attr('stroke', entry.color)
      .attr('stroke-width', 2);
    overlayLayer.append('text')
      .attr('x', xPos + size + 4)
      .attr('y', Math.max(12, yPos - size - 2))
      .attr('fill', entry.color)
      .attr('font-size', 12)
      .text(`Inrush – ${formatSettingValue(entry.current)} A @ ${formatSettingValue(duration)} s`);
  });

  overlays.filter(entry => entry.kind === 'motorStart').forEach(entry => {
    const curve = motorStartCurves.get(entry) || entry.curve;
    overlayLayer.append('path')
      .datum(curve)
      .attr('fill', 'none')
      .attr('stroke', entry.color)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '2,2')
      .attr('d', curve.length ? line(curve) : null);
  });

  const plotted = devicePlots.map(plotEntry => {
    const selection = plotEntry.selection;
    const scaled = plotEntry.scaled;
    const entry = { ...plotEntry, selection, scaled };
    entry.bandPath = deviceLayer.append('path')
      .datum(scaled.envelope || [])
      .attr('fill', entry.color)
      .attr('opacity', 0.15)
      .attr('stroke', 'none');
    entry.minPath = deviceLayer.append('path')
      .datum(scaled.minCurve || [])
      .attr('fill', 'none')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', '4,4');
    entry.maxPath = deviceLayer.append('path')
      .datum(scaled.maxCurve || [])
      .attr('fill', 'none')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', '4,4');
    entry.peakPath = deviceLayer.append('path')
      .datum(scaled.peakCurve || [])
      .attr('fill', 'none')
      .attr('stroke-width', 1.5)
      .attr('stroke-linecap', 'round')
      .attr('stroke-dasharray', '6,4')
      .attr('stroke', entry.color)
      .attr('opacity', 0.85)
      .attr('d', (Array.isArray(scaled.peakCurve) && scaled.peakCurve.length) ? line(scaled.peakCurve) : null)
      .style('display', Array.isArray(scaled.peakCurve) && scaled.peakCurve.length ? null : 'none');
    entry.path = deviceLayer.append('path')
      .datum(scaled.curve)
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('stroke', entry.color)
      .style('cursor', 'move')
      .on('contextmenu', event => {
        event.preventDefault();
        event.stopPropagation();
        showCurveContextMenu(event, entry);
    });
    return entry;
  });

  const viewCalloutLayer = g.append('g').attr('class', 'view-callout-layer');

  const buildViewCalloutData = () => {
    const configs = getActiveViewConfigs();
    if (!configs.length) return [];
    return plotted
      .map(entry => {
        if (!entry || !entry.selection) return null;
        if (entry.selection.kind !== 'library' && entry.selection.kind !== 'component') return null;
        const summaries = formatViewSummaries(entry);
        if (!summaries.length) return null;
        const deviceLabel = entry.selection?.name
          || entry.name
          || entry.selection?.baseDevice?.name
          || entry.selection?.component?.label
          || entry.selection?.component?.name
          || 'Device';
        const curve = Array.isArray(entry.scaled?.curve) ? entry.scaled.curve : [];
        if (!curve.length) return null;
        const anchor = curve[Math.floor(curve.length / 2)] || curve[curve.length - 1] || curve[0];
        if (!anchor || !(anchor.current > 0) || !(anchor.time > 0)) return null;
        const anchorX = x(anchor.current);
        const anchorY = y(anchor.time);
        if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) return null;
        return {
          id: entry.selection.uid || entry.selection.baseDeviceId || deviceLabel,
          entry,
          anchor,
          anchorX,
          anchorY,
          lines: [deviceLabel, ...summaries]
        };
      })
      .filter(Boolean);
  };

  const updateViewCallouts = () => {
    const data = buildViewCalloutData();
    if (!data.length) {
      viewCalloutLayer.selectAll('*').remove();
      viewCalloutOffsets.clear();
      return;
    }
    const activeIds = new Set(data.map(datum => datum.id));
    viewCalloutOffsets.forEach((_, key) => {
      if (!activeIds.has(key)) viewCalloutOffsets.delete(key);
    });
    const callouts = viewCalloutLayer.selectAll('g.view-callout').data(data, datum => datum.id);
    callouts.exit().each(datum => {
      viewCalloutOffsets.delete(datum.id);
    }).remove();
    const entered = callouts.enter().append('g').attr('class', 'view-callout');
    entered.append('line').attr('class', 'view-callout-connector');
    entered.append('circle').attr('class', 'view-callout-anchor').attr('r', 4);
    const labelGroup = entered.append('g').attr('class', 'view-callout-label');
    labelGroup.append('rect').attr('class', 'view-callout-bg').attr('rx', 6).attr('ry', 6);
    labelGroup.append('text').attr('class', 'view-callout-text');

    const merged = entered.merge(callouts);
    merged.each(function renderViewCallout(datum, index) {
      const group = d3.select(this);
      const entry = datum.entry;
      const curve = Array.isArray(entry.scaled?.curve) ? entry.scaled.curve : [];
      const anchor = curve[Math.floor(curve.length / 2)] || curve[curve.length - 1] || curve[0] || datum.anchor;
      if (!anchor || !(anchor.current > 0) || !(anchor.time > 0)) {
        group.attr('display', 'none');
        return;
      }
      const anchorX = x(anchor.current);
      const anchorY = y(anchor.time);
      if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) {
        group.attr('display', 'none');
        return;
      }
      group.attr('display', null);
      datum.anchorX = anchorX;
      datum.anchorY = anchorY;
      const baseOffsets = defaultAnnotationOffsets(anchorX, anchorY, width, height);
      const horizontal = baseOffsets.offsetX >= 0 ? 1 : -1;
      const vertical = baseOffsets.offsetY >= 0 ? 1 : -1;
      const storedOffset = viewCalloutOffsets.get(datum.id);
      let offsetX;
      let offsetY;
      if (storedOffset && Number.isFinite(storedOffset.dx) && Number.isFinite(storedOffset.dy)) {
        offsetX = storedOffset.dx;
        offsetY = storedOffset.dy;
      } else {
        const magnitudeX = Math.max(60, Math.abs(baseOffsets.offsetX)) + (index % 3) * 18;
        const magnitudeY = Math.max(40, Math.abs(baseOffsets.offsetY)) + ((index + 1) % 3) * 14;
        offsetX = horizontal * magnitudeX;
        offsetY = vertical * magnitudeY;
      }
      let labelX = clampValue(anchorX + offsetX, 24, width - 24);
      let labelY = clampValue(anchorY + offsetY, 24, height - 24);
      const appliedOffset = {
        dx: labelX - anchorX,
        dy: labelY - anchorY
      };
      viewCalloutOffsets.set(datum.id, appliedOffset);
      datum.labelX = labelX;
      datum.labelY = labelY;
      group.select('line.view-callout-connector')
        .attr('x1', anchorX)
        .attr('y1', anchorY)
        .attr('x2', labelX)
        .attr('y2', labelY)
        .attr('stroke', entry.color)
        .attr('stroke-width', 1.4);
      group.select('circle.view-callout-anchor')
        .attr('cx', anchorX)
        .attr('cy', anchorY)
        .attr('stroke', entry.color)
        .attr('stroke-width', 1.4);
      const label = group.select('g.view-callout-label')
        .attr('transform', `translate(${labelX},${labelY})`)
        .style('touch-action', 'none')
        .call(d3.drag()
          .subject(() => ({ x: datum.labelX, y: datum.labelY }))
          .on('start', event => {
            if (event.sourceEvent) event.sourceEvent.stopPropagation();
          })
          .on('drag', function handleCalloutDrag(event) {
            const newX = clampValue(event.x, 24, width - 24);
            const newY = clampValue(event.y, 24, height - 24);
            datum.labelX = newX;
            datum.labelY = newY;
            const offset = {
              dx: newX - datum.anchorX,
              dy: newY - datum.anchorY
            };
            viewCalloutOffsets.set(datum.id, offset);
            d3.select(this).attr('transform', `translate(${newX},${newY})`);
            group.select('line.view-callout-connector')
              .attr('x2', newX)
              .attr('y2', newY);
          })
          .on('end', function handleCalloutDragEnd() {
            const stored = viewCalloutOffsets.get(datum.id);
            if (!stored) return;
            const finalX = clampValue(datum.anchorX + stored.dx, 24, width - 24);
            const finalY = clampValue(datum.anchorY + stored.dy, 24, height - 24);
            datum.labelX = finalX;
            datum.labelY = finalY;
            viewCalloutOffsets.set(datum.id, {
              dx: finalX - datum.anchorX,
              dy: finalY - datum.anchorY
            });
            d3.select(this).attr('transform', `translate(${finalX},${finalY})`);
            group.select('line.view-callout-connector')
              .attr('x2', finalX)
              .attr('y2', finalY);
          }));
      const text = label.select('text.view-callout-text')
        .attr('text-anchor', 'start');
      const tspans = text.selectAll('tspan').data(datum.lines, (line, lineIndex) => `${datum.id}:${lineIndex}`);
      tspans.exit().remove();
      const tspansEnter = tspans.enter().append('tspan');
      tspansEnter.merge(tspans)
        .attr('x', 0)
        .attr('dy', (_, lineIndex) => (lineIndex === 0 ? '0' : '1.2em'))
        .attr('class', (_, lineIndex) => (lineIndex === 0 ? 'view-callout-title' : null))
        .text(line => line);
      const textNode = text.node();
      if (textNode) {
        const bbox = textNode.getBBox();
        const paddingX = 8;
        const paddingY = 6;
        label.select('rect.view-callout-bg')
          .attr('x', bbox.x - paddingX)
          .attr('y', bbox.y - paddingY)
          .attr('width', bbox.width + paddingX * 2)
          .attr('height', bbox.height + paddingY * 2)
          .attr('stroke', entry.color)
          .attr('stroke-width', 1.2);
      }
    });
  };

  const updateDutyResults = violations => {
    if (violations.length) {
      violationDiv.innerHTML = violations.map(v => `<p>${v}</p>`).join('');
    } else {
      violationDiv.textContent = '';
    }
    const contextIdForDuty = getActiveComponentId();
    if (!contextIdForDuty) return;
    const res = getStudies();
    res.duty = res.duty || {};
    res.duty[contextIdForDuty] = violations;
    setStudies(res);
  };

  const updateCurves = () => {
    const contextIdForFault = getActiveComponentId();
    const faultKA = contextIdForFault ? getStudies().shortCircuit?.[contextIdForFault]?.threePhaseKA : null;
    const violations = [];
    plotted.forEach(entry => {
      entry.scaled = scaleCurve(entry.selection.baseDevice, entry.overrides);
      const envelope = entry.scaled.envelope || [];
      const minCurve = entry.scaled.minCurve || [];
      const maxCurve = entry.scaled.maxCurve || [];
      const mainCurve = entry.scaled.curve || [];
      entry.bandPath
        .datum(envelope)
        .attr('d', envelope.length ? bandArea(envelope) : null)
        .attr('fill', entry.color);
      entry.minPath
        .datum(minCurve)
        .attr('d', minCurve.length ? line(minCurve) : null)
        .attr('stroke', entry.color);
      entry.maxPath
        .datum(maxCurve)
        .attr('d', maxCurve.length ? line(maxCurve) : null)
        .attr('stroke', entry.color);
      const peakCurve = Array.isArray(entry.scaled?.peakCurve) ? entry.scaled.peakCurve : [];
      if (entry.peakPath) {
        entry.peakPath
          .datum(peakCurve)
          .attr('d', peakCurve.length ? line(peakCurve) : null)
          .attr('stroke', entry.color)
          .style('display', peakCurve.length ? null : 'none');
      } else if (peakCurve.length) {
        entry.peakPath = deviceLayer.append('path')
          .datum(peakCurve)
          .attr('fill', 'none')
          .attr('stroke-width', 1.5)
          .attr('stroke-linecap', 'round')
          .attr('stroke-dasharray', '6,4')
          .attr('stroke', entry.color)
          .attr('opacity', 0.85)
          .attr('d', line(peakCurve));
      }
      entry.path
        .datum(mainCurve)
        .attr('d', mainCurve.length ? line(mainCurve) : null)
        .attr('stroke', () => {
          const violation = checkDuty(entry.scaled, faultKA);
          if (violation) {
            violations.push(violation);
            return 'red';
          }
          return entry.color;
        });
    });
    updateDutyResults(violations);
    updateViewCallouts();
  };

  const crosshairGroup = g.append('g')
    .attr('class', 'tcc-crosshair')
    .attr('pointer-events', 'none')
    .style('display', 'none');
  const crosshairVertical = crosshairGroup.append('line').attr('class', 'tcc-crosshair-line');
  const crosshairHorizontal = crosshairGroup.append('line').attr('class', 'tcc-crosshair-line');
  const crosshairPoint = crosshairGroup.append('circle')
    .attr('class', 'tcc-crosshair-point')
    .attr('r', 4);

  const readoutGroup = g.append('g')
    .attr('class', 'tcc-crosshair-readout')
    .attr('pointer-events', 'none')
    .style('display', 'none');
  const readoutBackground = readoutGroup.append('rect')
    .attr('class', 'tcc-crosshair-bg')
    .attr('rx', 6)
    .attr('ry', 6);
  const readoutText = readoutGroup.append('text')
    .attr('class', 'tcc-crosshair-text')
    .attr('x', 8)
    .attr('y', 6)
    .attr('dominant-baseline', 'hanging');

  const crosshairFormat = d3.format('.3~g');

  const hideCrosshair = () => {
    crosshairGroup.style('display', 'none');
    readoutGroup.style('display', 'none');
  };

  const updateCrosshair = event => {
    if (chart.classed('annotation-mode')) {
      hideCrosshair();
      return;
    }
    const [svgX, svgY] = d3.pointer(event, chart.node());
    const localX = svgX - margin.left;
    const localY = svgY - margin.top;
    if (localX < 0 || localX > width || localY < 0 || localY > height) {
      hideCrosshair();
      return;
    }
    const currentValue = x.invert(localX);
    const timeValue = y.invert(localY);
    if (!Number.isFinite(currentValue) || !Number.isFinite(timeValue)) {
      hideCrosshair();
      return;
    }

    crosshairGroup.style('display', null);
    readoutGroup.style('display', null);

    crosshairVertical
      .attr('x1', localX)
      .attr('x2', localX)
      .attr('y1', 0)
      .attr('y2', height);
    crosshairHorizontal
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', localY)
      .attr('y2', localY);
    crosshairPoint
      .attr('cx', localX)
      .attr('cy', localY);

    const formattedCurrent = crosshairFormat(currentValue);
    const formattedTime = crosshairFormat(timeValue);
    readoutText.text(`I: ${formattedCurrent} A • t: ${formattedTime} s`);
    const textNode = readoutText.node();
    const bbox = textNode ? textNode.getBBox() : { width: 0, height: 0 };
    const paddingX = 8;
    const paddingY = 6;
    const boxWidth = Math.max(48, bbox.width + paddingX * 2);
    const boxHeight = Math.max(24, bbox.height + paddingY * 2);
    const targetX = Math.min(Math.max(localX + 12, 0), width - boxWidth);
    const targetY = Math.min(Math.max(localY - boxHeight - 12, 0), height - boxHeight);
    readoutGroup.attr('transform', `translate(${targetX},${targetY})`);
    readoutBackground
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', boxWidth)
      .attr('height', boxHeight);
  };

  chart
    .on('pointermove.crosshair', updateCrosshair)
    .on('pointerenter.crosshair', updateCrosshair)
    .on('pointerleave.crosshair', hideCrosshair);

  hideCrosshair();

  const updateDeviceInputs = entry => {
    if (!settingsDiv) return;
    const div = settingsDiv.querySelector(`.device-settings[data-uid="${entry.selection.uid}"]`);
    if (!div) return;
    Object.entries(entry.overrides).forEach(([field, value]) => {
      const input = div.querySelector(`[data-field="${field}"]`);
      if (!input) return;
      const sanitized = snapSettingValue(entry.selection.baseDevice, field, value);
      entry.overrides[field] = sanitized;
      const formatted = formatSettingValue(sanitized);
      if (input.tagName === 'SELECT') {
        const valueStr = String(sanitized ?? '');
        const option = [...input.options].find(o => o.value === valueStr);
        if (option) {
          input.value = valueStr;
        }
      } else if (formatted !== '') {
        input.value = formatted;
      }
    });
  };

  const createDragBehavior = entry => d3.drag()
    .on('start', event => {
      event.sourceEvent?.stopPropagation?.();
      const curve = entry.scaled.curve || [];
      const reference = curve[Math.floor(curve.length / 2)] || curve[0];
      if (!reference) return;
      entry.dragState = {
        reference,
        offsetX: event.x - x(reference.current),
        offsetY: event.y - y(reference.time),
        startPickup: entry.overrides.pickup ?? entry.scaled.settings?.pickup ?? entry.selection.baseDevice.settings?.pickup ?? 1,
        startDelay: entry.overrides.time ?? entry.scaled.settings?.time ?? entry.selection.baseDevice.settings?.time ?? entry.selection.baseDevice.settings?.delay ?? 0.1
      };
      entry.path.attr('stroke-width', 3);
    })
    .on('drag', event => {
      const state = entry.dragState;
      if (!state) return;
      const targetX = clampValue(event.x - state.offsetX, xMin + 1, xMax - 1);
      const targetY = clampValue(event.y - state.offsetY, Math.min(yMin, yMax) + 1, Math.max(yMin, yMax) - 1);
      const newCurrent = clampValue(x.invert(targetX), MIN_PICKUP, MAX_PICKUP * 10);
      const newTime = clampValue(y.invert(targetY), MIN_DELAY, MAX_DELAY);
      const ratioI = newCurrent / Math.max(state.reference.current, MIN_PICKUP);
      const ratioT = newTime / Math.max(state.reference.time, MIN_DELAY);
      entry.overrides.pickup = clampValue(state.startPickup * ratioI, MIN_PICKUP, MAX_PICKUP);
      entry.overrides.time = clampValue(state.startDelay * ratioT, MIN_DELAY, MAX_DELAY);
      updateDeviceInputs(entry);
      updateCurves();
    })
    .on('end', () => {
      entry.path.attr('stroke-width', 2);
      entry.dragState = null;
      persistSettings();
      plot();
    });

  plotted.forEach(entry => {
    entry.path.call(createDragBehavior(entry));
  });

  const annotationLayer = g.append('g').attr('class', 'annotation-layer');
  annotationContext = { g, x, y, width, height, layer: annotationLayer };
  setPlotAvailability(true);
  renderAnnotations();

  updateCurves();
}

function wrapPreviewLabel(text) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) return [''];
  const maxLength = 18;
  const words = value.split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach(word => {
    const tentative = current ? `${current} ${word}` : word;
    if (tentative.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = tentative;
    }
  });
  if (current) lines.push(current);
  return lines.slice(0, 3).map(line => (line.length > maxLength ? `${line.slice(0, maxLength - 1)}…` : line));
}

function describeConnectionLabel(conn) {
  if (!conn || typeof conn !== 'object') return '';
  const keys = ['label', 'name', 'id', 'type', 'circuit'];
  for (const key of keys) {
    const value = conn[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return '';
}

function resolveComponentId(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (value && typeof value === 'object') {
    const keys = ['id', 'component', 'target', 'to', 'from', 'a', 'b'];
    for (const key of keys) {
      const candidate = value[key];
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed) return trimmed;
      }
    }
  }
  return null;
}

function buildPreviewAdjacency(componentMap, sheet) {
  const adjacency = new Map();
  const ensureEntry = id => {
    if (!adjacency.has(id)) adjacency.set(id, new Set());
    return adjacency.get(id);
  };
  const addConnection = (source, target) => {
    const sourceId = resolveComponentId(source);
    const targetId = resolveComponentId(target);
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (!componentMap.has(sourceId) || !componentMap.has(targetId)) return;
    ensureEntry(sourceId).add(targetId);
    ensureEntry(targetId).add(sourceId);
  };

  (sheet?.connections || []).forEach(conn => {
    if (!conn) return;
    const from = conn.from ?? conn.source ?? conn.a ?? conn.start ?? null;
    const to = conn.to ?? conn.target ?? conn.b ?? conn.end ?? null;
    addConnection(from, to);
  });

  componentMap.forEach((comp, id) => {
    if (!comp) return;
    const list = Array.isArray(comp.connections) ? comp.connections : [];
    list.forEach(conn => {
      if (!conn) return;
      const candidates = [
        conn.target,
        conn.to,
        conn.source,
        conn.from,
        conn.a,
        conn.b,
        conn.end,
        conn.start,
        conn.component
      ];
      let targetId = null;
      for (const candidate of candidates) {
        const resolved = resolveComponentId(candidate);
        if (resolved && resolved !== id) {
          targetId = resolved;
          break;
        }
      }
      if (!targetId && typeof conn.id === 'string' && conn.id !== id) {
        targetId = conn.id;
      }
      if (targetId) {
        addConnection(id, targetId);
      }
    });
  });

  return adjacency;
}

function renderOneLinePreview(componentId) {
  if (!onelinePreviewSvgEl || !onelinePreviewSvg) return;
  if (!componentId || !componentLookup.has(componentId)) {
    onelinePreviewTransform = null;
    onelinePreviewSvg.selectAll('*').remove();
    if (onelinePreviewSvgEl) onelinePreviewSvgEl.classList.add('hidden');
    if (onelinePreviewContainer) onelinePreviewContainer.classList.add('empty');
    if (onelinePreviewEmpty) {
      onelinePreviewEmpty.textContent = 'Select a one-line component to see its connections.';
      onelinePreviewEmpty.classList.remove('hidden');
    }
    if (onelinePreviewNote) onelinePreviewNote.classList.add('hidden');
    return;
  }

  const record = componentLookup.get(componentId);
  if (!record) {
    renderOneLinePreview(null);
    return;
  }

  const sheet = record.sheet;
  const sheetComponents = Array.isArray(sheet?.components) ? sheet.components : [];
  const componentMap = new Map(sheetComponents.map(comp => [comp.id, comp]));

  const selectedEntries = selectedDeviceIds()
    .map(uid => deviceMap.get(uid))
    .filter(entry => entry && entry.kind === 'component');
  const selectedIds = new Set(selectedEntries.map(entry => entry.componentId));
  const sameSheetSelections = [...selectedIds].filter(id => {
    const info = componentLookup.get(id);
    return info && info.sheetIndex === record.sheetIndex;
  });
  const offSheetCount = Math.max(0, selectedEntries.length - sameSheetSelections.length);
  const adjacency = buildPreviewAdjacency(componentMap, sheet);
  const neighborSet = componentId && adjacency.has(componentId)
    ? adjacency.get(componentId)
    : new Set();
  const neighborCount = neighborSet.size + 1; // include the active component itself
  const MAX_COMPONENTS = Math.max(20, neighborCount);
  const addUnique = (list, id) => {
    if (!id) return;
    if (!componentMap.has(id)) return;
    if (list.includes(id)) return;
    list.push(id);
  };

  const orderedTargets = [];
  addUnique(orderedTargets, componentId);
  neighborSet.forEach(id => addUnique(orderedTargets, id));

  const prioritizedTargets = [];
  addUnique(prioritizedTargets, componentId);
  neighborSet.forEach(id => addUnique(prioritizedTargets, id));
  sameSheetSelections.forEach(id => addUnique(prioritizedTargets, id));

  const availableTargets = prioritizedTargets.length ? prioritizedTargets : orderedTargets;
  if (!availableTargets.length) {
    onelinePreviewTransform = null;
    onelinePreviewSvg.selectAll('*').remove();
    onelinePreviewSvgEl.classList.add('hidden');
    if (onelinePreviewContainer) onelinePreviewContainer.classList.add('empty');
    if (onelinePreviewEmpty) {
      onelinePreviewEmpty.textContent = 'No one-line preview available for the current selection.';
      onelinePreviewEmpty.classList.remove('hidden');
    }
    if (onelinePreviewNote) {
      if (offSheetCount > 0) {
        onelinePreviewNote.textContent = `${offSheetCount} selected ${offSheetCount === 1 ? 'device is' : 'devices are'} on other sheets and are not shown.`;
        onelinePreviewNote.classList.remove('hidden');
      } else {
        onelinePreviewNote.classList.add('hidden');
      }
    }
    return;
  }

  const width = Number(onelinePreviewSvgEl.getAttribute('width')) || 320;
  const height = Number(onelinePreviewSvgEl.getAttribute('height')) || 280;
  onelinePreviewSvg.attr('viewBox', `0 0 ${width} ${height}`);
  onelinePreviewSvg.selectAll('*').remove();
  const gridPatternId = 'oneline-preview-grid-pattern';
  const gridSize = 24;
  const defs = onelinePreviewSvg.append('defs');
  defs.append('pattern')
    .attr('id', gridPatternId)
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', gridSize)
    .attr('height', gridSize)
    .append('path')
    .attr('class', 'oneline-preview-grid-line')
    .attr('d', `M ${gridSize} 0 L 0 0 0 ${gridSize}`);

  onelinePreviewSvg.append('rect')
    .attr('class', 'oneline-preview-grid')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', `url(#${gridPatternId})`);
  onelinePreviewSvgEl.classList.remove('hidden');
  if (onelinePreviewContainer) onelinePreviewContainer.classList.remove('empty');
  if (onelinePreviewEmpty) onelinePreviewEmpty.classList.add('hidden');

  const displayedTargets = availableTargets.slice(0, MAX_COMPONENTS);
  const truncatedCount = availableTargets.length - displayedTargets.length;
  const displayedSet = new Set(displayedTargets);
  const hiddenSelectionCount = sameSheetSelections.filter(id => !displayedSet.has(id)).length;

  const DEFAULT_WIDTH = 120;
  const DEFAULT_HEIGHT = 60;
  const MIN_NODE_WIDTH = 48;
  const MIN_NODE_HEIGHT = 32;

  const normalizeRotation = value => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const normalized = numeric % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  };

  const computeBounds = (x, y, width, height, rotation) => {
    if (!rotation) {
      return {
        left: x,
        top: y,
        right: x + width,
        bottom: y + height
      };
    }
    const angle = rotation * Math.PI / 180;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rotatePoint = (px, py) => {
      const dx = px - cx;
      const dy = py - cy;
      return {
        x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: cy + dx * Math.sin(angle) + dy * Math.cos(angle)
      };
    };
    const points = [
      rotatePoint(x, y),
      rotatePoint(x + width, y),
      rotatePoint(x, y + height),
      rotatePoint(x + width, y + height)
    ];
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys)
    };
  };

  const componentPreviewMeta = new Map();

  displayedTargets.forEach(id => {
    const comp = componentMap.get(id);
    if (!comp) return;
    const compWidth = Number.isFinite(comp.width) ? Number(comp.width) : DEFAULT_WIDTH;
    const compHeight = Number.isFinite(comp.height) ? Number(comp.height) : DEFAULT_HEIGHT;
    const compX = Number.isFinite(comp.x) ? Number(comp.x) : 0;
    const compY = Number.isFinite(comp.y) ? Number(comp.y) : 0;
    const rotation = normalizeRotation(comp.rotation ?? comp.rot ?? 0);
    const baseBounds = computeBounds(compX, compY, compWidth, compHeight, rotation);
    const spanWidth = baseBounds.right - baseBounds.left;
    const spanHeight = baseBounds.bottom - baseBounds.top;
    const centerX = (baseBounds.left + baseBounds.right) / 2;
    const centerY = (baseBounds.top + baseBounds.bottom) / 2;
    const adjustedBounds = {
      left: centerX - spanWidth / 2,
      right: centerX + spanWidth / 2,
      top: centerY - spanHeight / 2,
      bottom: centerY + spanHeight / 2
    };
    const definition = getPreviewDefinition(comp);
    const icon = definition?.icon || resolveIconSource(comp.icon, comp.symbol);
    const category = definition?.category || definition?.type || comp.type || '';
    const previewType = definition?.type || comp.type || '';
    const annotation = normalizeAnnotationPreview(comp);
    componentPreviewMeta.set(id, {
      bounds: adjustedBounds,
      width: compWidth,
      height: compHeight,
      originalWidth: compWidth,
      originalHeight: compHeight,
      rotation,
      center: { x: centerX, y: centerY },
      spanWidth,
      spanHeight,
      icon: icon || placeholderIcon,
      category,
      type: previewType,
      flipped: !!comp.flipped,
      annotation,
      definition
    });
  });

  const computeMetaExtents = () => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    componentPreviewMeta.forEach(meta => {
      if (!meta || !meta.bounds) return;
      minX = Math.min(minX, meta.bounds.left);
      minY = Math.min(minY, meta.bounds.top);
      maxX = Math.max(maxX, meta.bounds.right);
      maxY = Math.max(maxY, meta.bounds.bottom);
    });
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return null;
    }
    return { minX, minY, maxX, maxY };
  };

  let extents = computeMetaExtents();
  if (!extents) {
    extents = { minX: 0, minY: 0, maxX: width, maxY: height };
  }

  const expandExtents = (current, minSpan) => {
    const { minX, maxX, minY, maxY } = current;
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const desiredX = Math.max(spanX, minSpan.width);
    const desiredY = Math.max(spanY, minSpan.height);
    let nextMinX = minX;
    let nextMaxX = maxX;
    let nextMinY = minY;
    let nextMaxY = maxY;
    if (spanX < desiredX) {
      const centerX = (minX + maxX) / 2 || 0;
      nextMinX = centerX - desiredX / 2;
      nextMaxX = centerX + desiredX / 2;
    }
    if (spanY < desiredY) {
      const centerY = (minY + maxY) / 2 || 0;
      nextMinY = centerY - desiredY / 2;
      nextMaxY = centerY + desiredY / 2;
    }
    return { minX: nextMinX, maxX: nextMaxX, minY: nextMinY, maxY: nextMaxY };
  };

  extents = expandExtents(extents, { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });

  const boundsWidth = Math.max(1, extents.maxX - extents.minX);
  const boundsHeight = Math.max(1, extents.maxY - extents.minY);
  const padding = Math.min(width, height) < 320 ? 24 : 36;
  const scaleX = (width - padding * 2) / boundsWidth;
  const scaleY = (height - padding * 2) / boundsHeight;
  const rawScale = Math.min(scaleX, scaleY);
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? Math.min(rawScale, 2.5) : 1;
  const offsetX = padding - extents.minX * scale;
  const offsetY = padding - extents.minY * scale;

  onelinePreviewTransform = {
    scale,
    offsetX,
    offsetY,
    width,
    height
  };

  const overrideKeyForComponent = compId => {
    const sheetKey = sheet?.id || sheet?.key || sheet?.name || record.sheetIndex || 'sheet';
    return `${sheetKey}:${compId}`;
  };

  const nodes = displayedTargets.map(id => {
    const comp = componentMap.get(id);
    const meta = componentPreviewMeta.get(id);
    if (!comp || !meta) return null;
    const { bounds, width: compWidth, height: compHeight, rotation, center, spanWidth, spanHeight } = meta;
    const baseCenterX = center ? center.x * scale + offsetX : ((bounds.left + bounds.right) / 2) * scale + offsetX;
    const baseCenterY = center ? center.y * scale + offsetY : ((bounds.top + bounds.bottom) / 2) * scale + offsetY;
    const scaledWidth = Math.max(0, (bounds.right - bounds.left) * scale);
    const scaledHeight = Math.max(0, (bounds.bottom - bounds.top) * scale);
    const fallbackWidth = Number.isFinite(compWidth) ? compWidth * scale : 0;
    const fallbackHeight = Number.isFinite(compHeight) ? compHeight * scale : 0;
    const visualWidth = Math.max(
      MIN_NODE_WIDTH,
      scaledWidth || (Number.isFinite(spanWidth) ? spanWidth * scale : 0) || fallbackWidth || MIN_NODE_WIDTH
    );
    const visualHeight = Math.max(
      MIN_NODE_HEIGHT,
      scaledHeight || (Number.isFinite(spanHeight) ? spanHeight * scale : 0) || fallbackHeight || MIN_NODE_HEIGHT
    );
    const overrideKey = overrideKeyForComponent(comp.id);
    const storedOverride = previewPositionOverrides.get(overrideKey);
    const overrideDx = Number.isFinite(storedOverride?.dx) ? storedOverride.dx : 0;
    const overrideDy = Number.isFinite(storedOverride?.dy) ? storedOverride.dy : 0;
    const centerX = baseCenterX + overrideDx;
    const centerY = baseCenterY + overrideDy;
    const originalWidth = Number.isFinite(meta.originalWidth) ? meta.originalWidth : compWidth;
    const originalHeight = Number.isFinite(meta.originalHeight) ? meta.originalHeight : compHeight;
    const widthScale = Number.isFinite(originalWidth) && originalWidth > 0 ? visualWidth / originalWidth : 1;
    const heightScale = Number.isFinite(originalHeight) && originalHeight > 0 ? visualHeight / originalHeight : 1;
    return {
      id: comp.id,
      label: componentLabel(comp),
      sheet: record.sheetName,
      x: centerX,
      y: centerY,
      baseX: baseCenterX,
      baseY: baseCenterY,
      overrideKey,
      overrideDx,
      overrideDy,
      active: comp.id === componentId,
      component: comp,
      selected: selectedIds.has(comp.id),
      width: visualWidth,
      height: visualHeight,
      rotation,
      icon: meta.icon || placeholderIcon,
      category: meta.category || '',
      type: meta.type || '',
      flipped: !!meta.flipped,
      annotation: meta.annotation,
      definition: meta.definition || null,
      originalWidth,
      originalHeight,
      widthScale,
      heightScale
    };
  }).filter(Boolean);

  const displayedIdSet = new Set(nodes.map(node => node.id));
  const edgesMap = new Map();

  const addEdge = (source, target, labelText) => {
    if (!source || !target || source === target) return;
    if (!displayedIdSet.has(source) || !displayedIdSet.has(target)) return;
    const key = source < target ? `${source}--${target}` : `${target}--${source}`;
    let entry = edgesMap.get(key);
    if (!entry) {
      entry = { source, target, labels: [] };
      edgesMap.set(key, entry);
    }
    if (labelText) entry.labels.push(labelText);
  };

  (sheet?.connections || []).forEach(conn => {
    if (!conn) return;
    const from = conn.from ?? conn.source ?? conn.a ?? conn.start ?? null;
    const to = conn.to ?? conn.target ?? conn.b ?? conn.end ?? null;
    if (!from || !to) return;
    addEdge(from, to, describeConnectionLabel(conn));
  });

  displayedTargets.forEach(id => {
    const comp = componentMap.get(id);
    if (!comp) return;
    (comp.connections || []).forEach(conn => {
      if (!conn) return;
      const targetId = typeof conn.target === 'string' ? conn.target : conn.target?.id;
      if (!targetId) return;
      addEdge(comp.id, targetId, describeConnectionLabel(conn));
    });
  });

  const edges = [...edgesMap.values()].map(edge => ({
    source: edge.source,
    target: edge.target,
    label: edge.labels.filter(Boolean).join(', ')
  }));

  const nodeById = new Map(nodes.map(node => [node.id, node]));

  const linkGroup = onelinePreviewSvg.append('g').attr('class', 'preview-links');
  const edgeKey = edge => (edge.source < edge.target ? `${edge.source}--${edge.target}` : `${edge.target}--${edge.source}`);
  const linkLines = linkGroup.selectAll('line')
    .data(edges, edgeKey)
    .join('line')
    .attr('class', 'preview-link');

  const linkLabelSelection = linkGroup.selectAll('text')
    .data(edges.filter(edge => edge.label), edgeKey)
    .join('text')
    .attr('class', 'preview-link-label')
    .text(d => d.label);

  const updateLinks = () => {
    linkLines
      .attr('x1', d => nodeById.get(d.source)?.x ?? 0)
      .attr('y1', d => nodeById.get(d.source)?.y ?? 0)
      .attr('x2', d => nodeById.get(d.target)?.x ?? 0)
      .attr('y2', d => nodeById.get(d.target)?.y ?? 0);
    linkLabelSelection
      .attr('x', d => {
        const source = nodeById.get(d.source);
        const target = nodeById.get(d.target);
        return source && target ? (source.x + target.x) / 2 : width / 2;
      })
      .attr('y', d => {
        const source = nodeById.get(d.source);
        const target = nodeById.get(d.target);
        return source && target ? (source.y + target.y) / 2 : height / 2;
      });
  };

  updateLinks();

  const nodeGroup = onelinePreviewSvg.append('g').attr('class', 'preview-nodes');
  const node = nodeGroup.selectAll('g')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', d => {
      const classes = ['preview-node'];
      if (d.active) classes.push('is-active');
      else if (d.selected) classes.push('is-selected');
      return classes.join(' ');
    })
    .attr('transform', d => `translate(${d.x},${d.y})`)
    .attr('pointer-events', 'bounding-box')
    .style('pointer-events', 'bounding-box');

  const computeOutlineRadius = datum => {
    if (datum.annotation) {
      if (datum.annotation.shapeType === 'circle') {
        return Math.min(datum.width, datum.height) / 2;
      }
      if (datum.annotation.shapeType === 'rounded') {
        const baseRadius = Number(datum.annotation.cornerRadius) || 0;
        const scaleFactor = Math.min(datum.widthScale || 1, datum.heightScale || 1);
        const scaledRadius = Math.max(0, baseRadius * scaleFactor);
        return Math.min(Math.min(datum.width, datum.height) / 2, scaledRadius);
      }
      return 0;
    }
    return Math.min(18, Math.max(6, datum.height / 4));
  };

  const shapeGroup = node.append('g')
    .attr('class', 'preview-node-shape')
    .attr('transform', d => {
      const transforms = [];
      if (d.flipped) transforms.push('scale(-1,1)');
      if (d.rotation) transforms.push(`rotate(${d.rotation})`);
      return transforms.length ? transforms.join(' ') : null;
    });

  shapeGroup.append('rect')
    .attr('class', 'preview-node-outline')
    .attr('x', d => -(d.width / 2))
    .attr('y', d => -(d.height / 2))
    .attr('width', d => d.width)
    .attr('height', d => d.height)
    .attr('rx', d => computeOutlineRadius(d))
    .attr('ry', d => computeOutlineRadius(d))
    .attr('fill', 'transparent');

  const standardShapeGroup = shapeGroup.filter(d => !d.annotation);

  standardShapeGroup.append('image')
    .attr('class', 'preview-node-icon')
    .attr('href', d => d.icon || placeholderIcon)
    .attr('x', d => -(d.width / 2))
    .attr('y', d => -(d.height / 2))
    .attr('width', d => d.width)
    .attr('height', d => d.height)
    .attr('preserveAspectRatio', d => (d.category === 'bus' ? 'none' : 'xMidYMid meet'));

  standardShapeGroup.filter(d => d.component?.subtype === 'motor_load')
    .append('text')
    .attr('class', 'preview-node-icon-letter')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('y', 4)
    .attr('transform', d => (d.rotation ? `rotate(${-d.rotation})` : null))
    .text('M');

  const annotationShapeGroup = shapeGroup.filter(d => d.annotation);

  annotationShapeGroup.each(function renderAnnotationShape(datum) {
    const group = d3.select(this);
    const config = datum.annotation;
    if (!config) return;
    if (config.subtype === 'annotation_text_box') {
      group.append('rect')
        .attr('class', 'preview-annotation-box')
        .attr('x', -(datum.width / 2))
        .attr('y', -(datum.height / 2))
        .attr('width', datum.width)
        .attr('height', datum.height)
        .attr('rx', 8)
        .attr('ry', 8);
      const content = (config.text && config.text.trim()) || datum.label || '';
      const lines = content
        ? content.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
        : [];
      if (lines.length) {
        const textEl = group.append('text')
          .attr('class', 'preview-annotation-text')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle');
        const lineHeight = 14;
        const offset = ((lines.length - 1) * lineHeight) / 2;
        lines.forEach((line, index) => {
          textEl.append('tspan')
            .attr('x', 0)
            .attr('y', index === 0 ? -offset : undefined)
            .attr('dy', index === 0 ? 0 : lineHeight)
            .text(line);
        });
      }
      return;
    }

    const dash = PREVIEW_SHAPE_DASH_PATTERNS[config.strokeStyle] || '';
    const strokeColor = config.strokeColor || '#333333';
    const strokeWidth = Number.isFinite(config.strokeWidth) ? config.strokeWidth : 2;
    const fillColor = config.fillColor && config.fillColor !== 'none' && config.fillColor !== 'transparent'
      ? config.fillColor
      : 'none';
    const fillOpacity = fillColor === 'none' ? 0 : config.fillOpacity;
    if (config.shapeType === 'circle') {
      group.append('ellipse')
        .attr('class', 'preview-annotation-shape')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('rx', datum.width / 2)
        .attr('ry', datum.height / 2)
        .attr('fill', fillColor)
        .attr('fill-opacity', fillOpacity)
        .attr('stroke', strokeColor)
        .attr('stroke-width', strokeWidth)
        .attr('stroke-dasharray', dash || null)
        .attr('stroke-linecap', config.strokeStyle === 'dotted' ? 'round' : null);
    } else {
      const radius = config.shapeType === 'rounded'
        ? Math.min(
          Math.min(datum.width, datum.height) / 2,
          Math.max(0, (config.cornerRadius || 0) * Math.min(datum.widthScale || 1, datum.heightScale || 1))
        )
        : 0;
      group.append('rect')
        .attr('class', 'preview-annotation-shape')
        .attr('x', -(datum.width / 2))
        .attr('y', -(datum.height / 2))
        .attr('width', datum.width)
        .attr('height', datum.height)
        .attr('rx', radius)
        .attr('ry', radius)
        .attr('fill', fillColor)
        .attr('fill-opacity', fillOpacity)
        .attr('stroke', strokeColor)
        .attr('stroke-width', strokeWidth)
        .attr('stroke-dasharray', dash || null)
        .attr('stroke-linecap', config.strokeStyle === 'dotted' ? 'round' : null);
    }
  });

  const labelOffset = datum => {
    const baseGap = datum.active ? 32 : datum.selected ? 28 : 24;
    return Math.round(datum.height / 2 + baseGap);
  };

  const labelLinesFor = datum => {
    if (datum.annotation && datum.annotation.subtype === 'annotation_text_box') return [];
    return wrapPreviewLabel(datum.label);
  };

  node.append('text')
    .attr('class', 'preview-node-label')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'hanging')
    .attr('y', d => labelOffset(d))
    .each(function renderLabel(datum) {
      const lines = labelLinesFor(datum);
      if (!lines.length) {
        d3.select(this).attr('display', 'none');
        return;
      }
      const label = d3.select(this);
      label.selectAll('tspan')
        .data(lines)
        .enter()
        .append('tspan')
        .attr('x', 0)
        .attr('dy', (line, index) => (index === 0 ? 0 : 16))
        .text(line => line);
    });

  node.append('title')
    .text(d => (d.sheet ? `${d.label} (${d.sheet})` : d.label));

  const dragBehavior = d3.drag()
    .on('start', function handlePreviewDragStart(event, datum) {
      event.sourceEvent?.stopPropagation?.();
      const target = onelinePreviewSvg?.node?.();
      if (target) {
        const pointerEvent = event?.sourceEvent || event;
        const [pointerX, pointerY] = d3.pointer(pointerEvent, target);
        datum.__dragOffsetX = datum.x - pointerX;
        datum.__dragOffsetY = datum.y - pointerY;
      }
      d3.select(this).classed('is-dragging', true);
      if (this.parentNode) {
        this.parentNode.appendChild(this);
      }
    })
    .on('drag', function handlePreviewDrag(event, datum) {
      const target = onelinePreviewSvg?.node?.();
      if (!target) return;
      const pointerEvent = event?.sourceEvent || event;
      const [pointerX, pointerY] = d3.pointer(pointerEvent, target);
      const offsetX = Number.isFinite(datum.__dragOffsetX) ? datum.__dragOffsetX : 0;
      const offsetY = Number.isFinite(datum.__dragOffsetY) ? datum.__dragOffsetY : 0;
      const newX = clampValue(pointerX + offsetX, 32, width - 32);
      const newY = clampValue(pointerY + offsetY, 32, height - 32);
      datum.x = newX;
      datum.y = newY;
      d3.select(this).attr('transform', `translate(${datum.x},${datum.y})`);
      const dx = datum.x - datum.baseX;
      const dy = datum.y - datum.baseY;
      previewPositionOverrides.set(datum.overrideKey, { dx, dy });
      updateLinks();
    })
    .on('end', function handlePreviewDragEnd(event, datum) {
      d3.select(this).classed('is-dragging', false);
      const dx = datum.x - datum.baseX;
      const dy = datum.y - datum.baseY;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        previewPositionOverrides.delete(datum.overrideKey);
      }
      delete datum.__dragOffsetX;
      delete datum.__dragOffsetY;
    });

  node.call(dragBehavior);

  node.filter(d => !d.active)
    .on('click', (event, datum) => {
      event.preventDefault();
      setActiveComponent(datum.id, { preserveSelection: true });
    });

  if (onelinePreviewNote) {
    const noteMessages = [];
    if (offSheetCount > 0) {
      noteMessages.push(`${offSheetCount} selected ${offSheetCount === 1 ? 'device is' : 'devices are'} on other sheets and are not shown.`);
    }
    if (hiddenSelectionCount > 0) {
      noteMessages.push(`${hiddenSelectionCount} selected ${hiddenSelectionCount === 1 ? 'device is' : 'devices are'} hidden due to preview limits.`);
    }
    if (truncatedCount > 0) {
      const contextLabel = prioritizedTargets.length ? 'selected devices' : 'devices';
      noteMessages.push(`Showing ${displayedTargets.length} of ${availableTargets.length} ${contextLabel}.`);
    }
    if (!noteMessages.length && selectedEntries.length && !displayedTargets.length) {
      noteMessages.push('No one-line preview available for the current selection.');
    }
    if (displayedTargets.length) {
      noteMessages.push('Drag devices within the preview to adjust their layout.');
    }
    if (noteMessages.length) {
      onelinePreviewNote.textContent = noteMessages.join(' ');
      onelinePreviewNote.classList.remove('hidden');
    } else {
      onelinePreviewNote.classList.add('hidden');
    }
  }
}

function componentLabel(comp) {
  if (!comp) return 'Component';
  const label = getComponentValue(comp, 'label');
  const name = getComponentValue(comp, 'name');
  const subtype = getComponentValue(comp, 'subtype');
  const type = getComponentValue(comp, 'type');
  return label || name || subtype || type || comp.id || 'Component';
}

function getComponentVendor(comp) {
  if (!comp) return '';
  const keys = ['manufacturer', 'vendor', 'maker', 'brand'];
  for (const key of keys) {
    const value = getComponentValue(comp, key);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return '';
}

function mergeOverrides(base, extra) {
  const a = base && typeof base === 'object' ? base : {};
  const b = extra && typeof extra === 'object' ? extra : {};
  return { ...a, ...b };
}

function parsePhases(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim().toUpperCase()).filter(Boolean);
  if (typeof value === 'number') {
    if (value === 3) return ['A', 'B', 'C'];
    if (value === 2) return ['A', 'B'];
    if (value === 1) return ['A'];
    return [];
  }
  if (typeof value === 'string') {
    if (/^\d+$/.test(value.trim())) return parsePhases(parseInt(value, 10));
    return value.split(/[\s,]+/).map(v => v.trim().toUpperCase()).filter(Boolean);
  }
  return [];
}

function inferVoltage(comp) {
  const keys = ['voltage', 'volts', 'volts_secondary', 'volts_lv', 'volts_primary', 'volts_hv', 'prefault_voltage', 'baseKV', 'kV'];
  for (const key of keys) {
    const raw = getComponentValue(comp, key);
    const num = parseNumeric(raw);
    if (!Number.isFinite(num) || num <= 0) continue;
    if (key.toLowerCase().includes('kv')) return num * 1000;
    return num;
  }
  return null;
}

function computeTransformerInrush(transformer, referenceVoltage, refPhases = 3) {
  const operating = resolveTransformerOperatingPoint(transformer, referenceVoltage, refPhases);
  if (!operating) return null;
  const multiple = resolveInrushMultiple(transformer);
  const duration = resolveInrushDuration(transformer);
  return { current: operating.fla * multiple, duration };
}

function resolveInrushMultiple(comp) {
  const keys = ['inrush_multiple', 'inrushMultiple', 'inrush_multiplier', 'xfmr_inrush_multiple', 'xfmrInrushMultiple'];
  for (const key of keys) {
    const val = parseNumeric(getComponentValue(comp, key));
    if (Number.isFinite(val) && val > 0) return val;
  }
  return DEFAULT_INRUSH_MULTIPLE;
}

function resolveInrushDuration(comp) {
  const keys = ['inrush_duration', 'inrushDuration', 'xfmr_inrush_duration'];
  for (const key of keys) {
    const val = parseNumeric(getComponentValue(comp, key));
    if (Number.isFinite(val) && val > 0) return val;
  }
  return DEFAULT_INRUSH_DURATION;
}

function resolveCableInfo(source, target, conn) {
  if (source?.type === 'cable') {
    if (source.cable) return source.cable;
    if (source.props && source.props.cable) return source.props.cable;
  }
  if (target?.type === 'cable') {
    if (target.cable) return target.cable;
    if (target.props && target.props.cable) return target.props.cable;
  }
  if (conn?.cable) return conn.cable;
  return null;
}

function normalizeConductorSize(size) {
  if (!size) return null;
  let s = String(size).trim().toUpperCase();
  if (!s) return null;
  s = s.replace(/MCM$/, 'KCMIL');
  if (/^#?\d+\s*AWG$/.test(s)) {
    s = s.startsWith('#') ? s : `#${s.replace(/\s*AWG$/, '')} AWG`;
  } else if (/^\d+\s*KCMIL$/.test(s)) {
    s = s.replace(/\s*KCMIL$/, ' kcmil');
  } else if (/^\d+\/0$/.test(s)) {
    s = `${s} AWG`;
  } else if (/^#\d+$/.test(s)) {
    s = `${s} AWG`;
  } else if (/^\d+$/.test(s)) {
    // treat bare number as kcmil above 4/0
    const num = Number(s);
    if (num >= 250) {
      s = `${num} kcmil`;
    } else {
      s = `#${s} AWG`;
    }
  }
  return s;
}

function areaFromSize(size) {
  const normalized = normalizeConductorSize(size);
  if (!normalized) return null;
  const data = conductorProperties[normalized];
  if (data?.area_cm) return data.area_cm;
  return null;
}

function parseConductorsDescriptor(descriptor) {
  if (!descriptor) return { count: null, size: null };
  const text = String(descriptor).trim();
  const match = text.match(/^(\d+)\s*[Xx\-]\s*(.+)$/);
  if (match) {
    return { count: Number(match[1]), size: match[2].trim() };
  }
  return { count: null, size: null };
}

function getKConstant(material, insulation) {
  const mat = String(material || '').toLowerCase();
  const table = mat.startsWith('al') ? K_CONSTANTS.aluminum : K_CONSTANTS.copper;
  const rating = insulation >= 90 ? 90 : insulation >= 75 ? 75 : 60;
  return table[rating];
}

function buildCableCurve(cable, phases = 3) {
  const descriptor = parseConductorsDescriptor(cable.conductors);
  const size = cable.conductor_size || descriptor.size || cable.size || cable.awg;
  const baseArea = areaFromSize(size);
  if (!baseArea) return null;
  const parallel = Number(cable.parallel_count || cable.parallels || cable.parallel) || 1;
  const perPhase = Number(cable.conductors_per_phase || cable.conductorsPerPhase) || null;
  const phaseCount = phases || 3;
  const inferredPerPhase = perPhase || (descriptor.count ? Math.max(1, Math.round(descriptor.count / phaseCount)) : 1);
  const effectiveArea = baseArea * inferredPerPhase * parallel;
  const material = cable.conductor_material || cable.material || 'copper';
  const insulation = Number(cable.insulation_rating || cable.temperature_rating || 90);
  const k = getKConstant(material, insulation);
  if (!k) return null;
  const areaMm2 = effectiveArea * CMIL_TO_MM2;
  const curve = CABLE_TIME_POINTS.map(time => ({
    time,
    current: (k * areaMm2) / Math.sqrt(time)
  })).filter(p => Number.isFinite(p.current) && p.current > 0);
  return {
    curve,
    ampacity: Number(cable.ampacity || cable.calc_ampacity || cable.rating || '') || null
  };
}

function buildTransformerDamageCurve(transformer, referenceVoltage, refPhases = 3) {
  const operating = resolveTransformerOperatingPoint(transformer, referenceVoltage, refPhases);
  if (!operating) return null;
  const points = TRANSFORMER_DAMAGE_TEMPLATE.map(({ multiple, time }) => ({
    time,
    current: operating.fla * multiple
  })).filter(point => Number.isFinite(point.current) && point.current > 0 && Number.isFinite(point.time) && point.time > 0);
  if (!points.length) return null;
  return {
    curve: points.sort((a, b) => a.time - b.time),
    fla: operating.fla
  };
}

function resolveTransformerOperatingPoint(transformer, referenceVoltage, refPhases = 3) {
  const sides = [];
  const sideDefs = [
    { kvaKey: 'kva_hv', voltsKey: 'volts_hv', label: 'HV' },
    { kvaKey: 'kva_lv', voltsKey: 'volts_lv', label: 'LV' },
    { kvaKey: 'kva_tv', voltsKey: 'volts_tv', label: 'Tertiary' },
    { kvaKey: 'kva_primary', voltsKey: 'volts_primary', label: 'Primary' },
    { kvaKey: 'kva_secondary', voltsKey: 'volts_secondary', label: 'Secondary' }
  ];
  sideDefs.forEach(({ kvaKey, voltsKey, label }) => {
    const kva = getNumericValue(transformer, kvaKey);
    const volts = getNumericValue(transformer, voltsKey);
    if (!Number.isFinite(kva) || !Number.isFinite(volts)) return;
    sides.push({ kva, volts, label });
  });
  if (!sides.length) {
    const kva = getNumericValue(transformer, ['kva', 'kva_base']);
    let volts = getNumericValue(transformer, ['volts_secondary', 'volts_primary', 'voltage', 'volts']);
    if (!Number.isFinite(volts)) {
      const baseKv = getNumericValue(transformer, ['baseKV', 'kV']);
      if (Number.isFinite(baseKv)) volts = baseKv * 1000;
    }
    if (Number.isFinite(kva) && Number.isFinite(volts)) {
      sides.push({ kva, volts, label: 'Secondary' });
    }
  }
  if (!sides.length) {
    const mva = getNumericValue(transformer, 'mva');
    const volts = getNumericValue(transformer, ['volts_secondary', 'volts_primary', 'voltage', 'volts']);
    if (Number.isFinite(mva) && Number.isFinite(volts)) {
      sides.push({ kva: mva * 1000, volts, label: 'Secondary' });
    }
  }
  if (!sides.length) return null;
  let selected = sides[0];
  if (Number.isFinite(referenceVoltage)) {
    let best = { diff: Math.abs(selected.volts - referenceVoltage), side: selected };
    sides.slice(1).forEach(side => {
      const diff = Math.abs(side.volts - referenceVoltage);
      if (diff < best.diff) best = { diff, side };
    });
    selected = best.side;
  }
  const phases = parsePhases(getComponentValue(transformer, 'phases')).length || refPhases || 3;
  const kva = Number(selected.kva);
  const volts = Number(selected.volts);
  if (!Number.isFinite(kva) || !Number.isFinite(volts) || kva <= 0 || volts <= 0) return null;
  const apparent = kva * 1000;
  const fla = phases === 1 ? apparent / volts : apparent / (Math.sqrt(3) * volts);
  if (!Number.isFinite(fla) || fla <= 0) return null;
  return { fla, volts, phases, side: selected.label };
}

function collectMotorOperatingData(
  motor,
  referenceVoltage,
  refPhases = 3,
  { allowPartial = false } = {}
) {
  if (!motor) return null;
  const phases = parsePhases(getComponentValue(motor, 'phases')).length || refPhases || 3;
  const voltage = (() => {
    const val = getNumericValue(motor, ['voltage', 'volts', 'rated_voltage', 'line_voltage']);
    if (Number.isFinite(val) && val > 0) return val;
    if (Number.isFinite(referenceVoltage)) return referenceVoltage;
    const inferred = inferVoltage(motor);
    return Number.isFinite(inferred) ? inferred : null;
  })();

  let fla = getNumericValue(motor, ['fla', 'full_load_amps', 'full_load_current', 'full_load_amp', 'rated_current', 'running_current', 'amps']);
  if (!Number.isFinite(fla) || fla <= 0) {
    const hp = getNumericValue(motor, ['hp', 'horsepower']);
    const kw = getNumericValue(motor, ['kw', 'power_kw', 'load_kw', 'output_kw']);
    let pf = getNumericValue(motor, ['pf', 'power_factor']);
    if (!Number.isFinite(pf) || pf <= 0) pf = 0.85;
    let eff = getNumericValue(motor, ['efficiency', 'eff']);
    if (Number.isFinite(eff)) {
      if (eff > 1.2) eff /= 100;
    } else {
      eff = 0.9;
    }
    if (eff <= 0) eff = 0.9;
    if (Number.isFinite(hp) && hp > 0) {
      const watts = hp * 746;
      const denom = (phases === 1 ? voltage : Math.sqrt(3) * voltage) * pf * eff;
      if (denom > 0) fla = watts / denom;
    } else if (Number.isFinite(kw) && kw > 0) {
      const watts = (kw * 1000) / eff;
      const denom = (phases === 1 ? voltage : Math.sqrt(3) * voltage) * pf;
      if (denom > 0) fla = watts / denom;
    }
  }

  let lockedRotor = getNumericValue(motor, ['locked_rotor_current', 'lockedRotorCurrent', 'locked_rotor_amps', 'lockedRotorAmps', 'lr_current_amps', 'lra']);
  if (!Number.isFinite(lockedRotor) || lockedRotor <= 0) {
    let ratio = getNumericValue(motor, ['lr_current_pu', 'locked_rotor_multiple', 'lockedRotorMultiple', 'locked_rotor_pu', 'locked_rotor_ratio']);
    if (!Number.isFinite(ratio) || ratio <= 0) ratio = 6;
    lockedRotor = Number.isFinite(fla) && fla > 0 ? fla * ratio : null;
  }

  const startTime = getNumericValue(motor, [
    'starting_time_s',
    'starting_time',
    'start_time_s',
    'start_time',
    'starting_seconds',
    'start_seconds',
    'accel_time',
    'acceleration_time',
    'starting_duration',
    'start_duration',
    'start_time_sec'
  ]);

  const data = { phases, voltage, fla, lockedRotor, startTime };
  if (allowPartial) return data;
  if (!Number.isFinite(voltage) || voltage <= 0) return null;
  if (!Number.isFinite(fla) || fla <= 0) return null;
  if (!Number.isFinite(lockedRotor) || lockedRotor <= 0) return null;
  return data;
}

function resolveMotorStartingMetrics(motor, referenceVoltage, refPhases = 3, baseData) {
  const base = baseData || collectMotorOperatingData(motor, referenceVoltage, refPhases);
  if (!base) return null;
  const { fla, lockedRotor, startTime } = base;
  if (!Number.isFinite(fla) || fla <= 0) return null;
  if (!Number.isFinite(lockedRotor) || lockedRotor <= 0) return null;
  if (!Number.isFinite(startTime) || startTime <= 0) return null;
  const curve = buildMotorStartingCurve({ fla, lockedRotor, startTime });
  if (!curve.length) return null;
  return { fla, lockedRotor, startTime, curve };
}

function normalizeServiceFactor(value) {
  let sf = Number(value);
  if (!Number.isFinite(sf) || sf <= 0) return 1.15;
  if (sf > 5) sf /= 100;
  if (sf < 1) sf = 1;
  return sf;
}

function resolveMotorThermalLimit(
  motor,
  referenceVoltage,
  refPhases = 3,
  baseData,
  startMetrics
) {
  const base = baseData || collectMotorOperatingData(motor, referenceVoltage, refPhases);
  if (!base) return null;
  const { fla, lockedRotor } = base;
  if (!Number.isFinite(fla) || fla <= 0) return null;
  if (!Number.isFinite(lockedRotor) || lockedRotor <= 0) return null;
  const stallTimeCandidates = [
    getNumericValue(motor, [
      'stall_time',
      'stall_time_s',
      'locked_rotor_time',
      'max_start_time',
      'max_stall_time',
      'maximum_stall_time',
      'max_allowable_stall_time',
      'maximum_allowable_stall_time',
      'allowable_stall_time',
      'maxAllowableStallTime',
      'maximumAllowableStallTime',
      'allowableStallTime',
      'maxStallTime',
      'stallTimeMax',
      'thermal_limit_time',
      'thermal_limit_duration'
    ]),
    startMetrics?.startTime,
    base.startTime
  ];
  let stallTime = stallTimeCandidates.find(val => Number.isFinite(val) && val > 0) || null;
  if (!Number.isFinite(stallTime) || stallTime <= 0) return null;
  const serviceFactor = normalizeServiceFactor(getNumericValue(motor, ['service_factor', 'sf', 'serviceFactor']));
  const continuousCurrent = Math.max(fla * serviceFactor, fla * 1.05);
  const thermalConstant = lockedRotor * lockedRotor * stallTime;
  let longTime = thermalConstant / (continuousCurrent * continuousCurrent);
  if (!Number.isFinite(longTime) || longTime <= stallTime) {
    longTime = stallTime * 3;
  }
  longTime = Math.max(longTime, stallTime * 1.2);
  longTime = Math.min(longTime, 900);
  const timeCandidates = [
    stallTime,
    stallTime * 1.5,
    stallTime * 2.5,
    longTime
  ];
  const tailTime = Math.min(longTime * 3, 1800);
  if (Number.isFinite(tailTime) && tailTime > longTime * 1.1) {
    timeCandidates.push(tailTime);
  }
  const points = [...new Set(timeCandidates
    .filter(time => Number.isFinite(time) && time > 0)
    .map(time => Number(time)))]
    .sort((a, b) => a - b)
    .map(time => {
      const current = Math.max(Math.sqrt(thermalConstant / time), continuousCurrent);
      return { time, current };
    });
  if (!points.length) return null;
  const last = points[points.length - 1];
  if (last) last.current = continuousCurrent;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].current > points[i - 1].current) {
      points[i].current = points[i - 1].current;
    }
  }
  return {
    curve: points,
    fla,
    lockedRotor,
    serviceFactor,
    stallTime,
    continuousCurrent
  };
}

function buildMotorStartingCurve({ fla, lockedRotor, startTime }) {
  const start = Math.max(startTime, 0.01);
  const pre = Math.max(MOTOR_START_MIN_PRETIME, Math.min(start * MOTOR_START_PRETIME_RATIO, start * 0.9));
  const dropStart = Math.max(start * 1.001, start + 0.001);
  const settle = Math.max(dropStart * MOTOR_START_POSTTIME_RATIO, dropStart + 0.01);
  const points = [
    { time: pre, current: lockedRotor },
    { time: start, current: lockedRotor },
    { time: dropStart, current: fla },
    { time: settle, current: fla }
  ];
  return points.filter(point => Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.current) && point.current > 0)
    .sort((a, b) => a.time - b.time);
}

function getComponentValue(comp, key) {
  if (!comp) return undefined;
  if (Object.prototype.hasOwnProperty.call(comp, key)) {
    const value = comp[key];
    if (value !== undefined && value !== null) return value;
  }
  if (comp.props && typeof comp.props === 'object' && Object.prototype.hasOwnProperty.call(comp.props, key)) {
    const value = comp.props[key];
    if (value !== undefined && value !== null) return value;
  }
  if (Object.prototype.hasOwnProperty.call(comp, key)) return comp[key];
  if (comp.props && typeof comp.props === 'object' && Object.prototype.hasOwnProperty.call(comp.props, key)) return comp.props[key];
  return undefined;
}

function parseNumeric(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/,/g, '');
  const direct = Number(normalized);
  if (Number.isFinite(direct)) return direct;
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)(?:\s*([kKmM])(?:[a-zA-Z]*)?)?$/);
  if (!match) return null;
  let num = Number(match[1]);
  const prefix = match[2];
  if (prefix) {
    if (prefix === 'k' || prefix === 'K') num *= 1000;
    else if (prefix === 'M') num *= 1e6;
    else if (prefix === 'm') num *= 0.001;
  }
  return num;
}

function getNumericValue(comp, keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const raw = getComponentValue(comp, key);
    const num = parseNumeric(raw);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

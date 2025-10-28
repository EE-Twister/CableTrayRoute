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
const CUSTOM_CURVE_DEFAULT_BOUNDS = { left: 40, right: 20, top: 20, bottom: 40 };

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

let updatingActiveComponentFromSelect = false;

const baseHref = document.querySelector('base')?.href || new URL('.', window.location.href).href;
const asset = path => new URL(path, baseHref).href;
const placeholderIcon = asset('icons/placeholder.svg');
const componentIconMap = new Map();
let componentIconLoadPromise = null;
let componentIconsReady = false;

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

function normalizeComponentKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function ensureComponentIcons() {
  if (componentIconsReady) return componentIconLoadPromise || Promise.resolve(componentIconMap);
  if (!componentIconLoadPromise) {
    componentIconLoadPromise = (async () => {
      try {
        const response = await fetch(asset('componentLibrary.json'));
        if (response && response.ok) {
          const data = await response.json();
          const components = Array.isArray(data?.components) ? data.components : [];
          components.forEach(def => {
            if (!def || typeof def !== 'object') return;
            const iconHref = resolveIconSource(def.icon, def.symbol);
            if (!iconHref) return;
            const subtypeKey = normalizeComponentKey(def.subtype);
            if (subtypeKey && !componentIconMap.has(subtypeKey)) {
              componentIconMap.set(subtypeKey, iconHref);
            }
            const typeKey = normalizeComponentKey(def.type);
            if (typeKey) {
              const mapKey = `type:${typeKey}`;
              if (!componentIconMap.has(mapKey)) componentIconMap.set(mapKey, iconHref);
            }
          });
        }
      } catch (err) {
        console.error('Failed to load component icons', err);
      } finally {
        componentIconsReady = true;
      }
      return componentIconMap;
    })();
    componentIconLoadPromise.then(() => {
      renderOneLinePreview(getActiveComponentId());
    });
  }
  return componentIconLoadPromise;
}

function getComponentIcon(component) {
  if (!component) return placeholderIcon;
  const subtypeKey = normalizeComponentKey(component.subtype);
  if (subtypeKey && componentIconMap.has(subtypeKey)) {
    return componentIconMap.get(subtypeKey);
  }
  const typeKey = normalizeComponentKey(component.type);
  if (typeKey) {
    const byType = componentIconMap.get(`type:${typeKey}`) || componentIconMap.get(typeKey);
    if (byType) return byType;
  }
  return placeholderIcon;
}

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

function sanitizeCustomCurve(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const curvePoints = Array.isArray(raw.curve)
    ? raw.curve
    : Array.isArray(raw.points)
      ? raw.points
      : [];
  const sanitizedPoints = sanitizeCurve(curvePoints);
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
  return {
    id,
    name,
    manufacturer,
    deviceType,
    description,
    curve: sanitizedPoints,
    axes,
    bounds,
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

ensureComponentIcons();

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
  const isCable = normalizedType.includes('cable')
    || normalizedSubtype.includes('cable')
    || normalizedBase.includes('cable');
  if (isCable) {
    const basePhases = parsePhases(component.phases);
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
    const baseDevice = {
      id: baseId,
      name: curve.name,
      type: curve.deviceType || CUSTOM_CURVE_CATEGORY,
      curve: curve.curve || [],
      settings: {},
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
      overrideSource: {},
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
  if (!curve || !Array.isArray(curve.curve) || !curve.curve.length) return null;
  let existing = curve.id ? getCustomCurveById(curve.id) : null;
  if (!existing) {
    const nextSequence = (saved.customCurveCounter || saved.customCurves.length || 0) + 1;
    curve.id = curve.id || createCustomCurveId(nextSequence);
    curve.sequence = Number.isFinite(curve.sequence) ? curve.sequence : nextSequence;
    saved.customCurveCounter = Math.max(saved.customCurveCounter || 0, curve.sequence);
    saved.customCurves.push(curve);
  } else {
    existing.name = curve.name;
    existing.manufacturer = curve.manufacturer;
    existing.deviceType = curve.deviceType;
    existing.description = curve.description;
    existing.curve = curve.curve;
    existing.axes = curve.axes || {};
    existing.bounds = curve.bounds || {};
    existing.tolerance = curve.tolerance;
    if (Number.isFinite(curve.sequence)) {
      existing.sequence = curve.sequence;
    }
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
      baseRows.unshift({
        label: 'Data Points',
        value: Array.isArray(entry.customCurve?.curve) ? `${entry.customCurve.curve.length} points` : '',
        range: ''
      });
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

  const commitSelection = entry => {
    if (!entry || entry.kind !== 'component' || !entry.componentId) {
      return false;
    }
    if (entry.plotDisabledReason) {
      return false;
    }
    setActiveComponent(entry.componentId, { preserveSelection: true });
    return true;
  };

  function updateActiveEntry(entry) {
    activeEntry = entry || null;
    modelElements.forEach(({ item, entry: itemEntry }, uid) => {
      const isActive = !!entry && uid === entry.uid;
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
    });
    renderDeviceDetails(entry, detailContainer, docRef.current);
    if (controllerRef.current && typeof controllerRef.current.setPrimaryDisabled === 'function') {
      const disable = !(entry && entry.kind === 'component' && entry.componentId && !entry.plotDisabledReason);
      controllerRef.current.setPrimaryDisabled(disable);
    }
    if (entry && entry.kind === 'component' && detailContainer && docRef.current) {
      const actions = docRef.current.createElement('div');
      actions.className = 'device-detail-actions';
      const openLink = docRef.current.createElement('a');
      openLink.className = 'btn secondary-btn';
      openLink.href = `oneline.html?component=${encodeURIComponent(entry.componentId)}`;
      openLink.target = '_blank';
      openLink.rel = 'noopener';
      openLink.textContent = 'Open in One-Line';
      actions.appendChild(openLink);
      detailContainer.appendChild(actions);
    }
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
        activeEntry = manufacturer?.entries[0] || null;
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
        activeEntry = manufacturer.entries[0] || null;
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
    manufacturer.entries.forEach(entry => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'device-model-btn';
      button.dataset.uid = entry.uid;
      button.textContent = entry.name;
      if (entry.plotDisabledReason) {
        button.classList.add('device-model-unavailable');
        button.title = entry.plotDisabledReason;
      }
      const isActive = !!activeEntry && entry.uid === activeEntry.uid;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
      button.tabIndex = isActive ? 0 : -1;
      button.addEventListener('click', () => {
        if (activeEntry && activeEntry.uid === entry.uid) return;
        activeEntry = entry;
        updateActiveEntry(entry);
      });
      button.addEventListener('dblclick', () => {
        if (commitSelection(entry) && controllerRef.current && typeof controllerRef.current.close === 'function') {
          controllerRef.current.close(entry.componentId);
        }
      });
      if (!firstButtonRef.current) firstButtonRef.current = button;
      modelElements.set(entry.uid, { item: button, entry });
      modelContainer.appendChild(button);
    });
  }

  const modalPromise = openModal({
    title: 'One-Line Components',
    primaryText: 'Plot Component',
    secondaryText: 'Close',
    onSubmit: controller => {
      if (
        !activeEntry
        || activeEntry.kind !== 'component'
        || !activeEntry.componentId
        || activeEntry.plotDisabledReason
      ) {
        if (controller && typeof controller.setPrimaryDisabled === 'function') {
          controller.setPrimaryDisabled(true);
        }
        return false;
      }
      const committed = commitSelection(activeEntry);
      if (!committed) {
        if (controller && typeof controller.setPrimaryDisabled === 'function') {
          controller.setPrimaryDisabled(true);
        }
        return false;
      }
      return activeEntry.componentId;
    },
    onCancel: () => {
      if (componentModalBtn) componentModalBtn.setAttribute('aria-expanded', 'false');
    },
    render(container, controller) {
      const doc = container.ownerDocument;
      docRef.current = doc;
      controllerRef.current = controller;
      if (controller && typeof controller.setPrimaryDisabled === 'function') {
        const disable = !(
          activeEntry
          && activeEntry.kind === 'component'
          && activeEntry.componentId
          && !activeEntry.plotDisabledReason
        );
        controller.setPrimaryDisabled(disable);
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

  let resolvedComponentId = null;
  try {
    resolvedComponentId = await modalPromise;
  } finally {
    controllerRef.current = null;
    if (componentModalBtn) componentModalBtn.setAttribute('aria-expanded', 'false');
  }

  if (resolvedComponentId) {
    if (getActiveComponentId() !== resolvedComponentId) {
      setActiveComponent(resolvedComponentId, { preserveSelection: true });
    } else {
      renderOneLinePreview(resolvedComponentId);
      if (selectedDeviceIds().length) {
        plot();
      }
    }
  }
}

async function openCustomCurveBuilder(curveId = null) {
  const isEditing = !!curveId;
  const existing = isEditing ? getCustomCurveById(curveId) : null;
  const axes = { ...CUSTOM_CURVE_DEFAULT_AXES, ...(existing?.axes || {}) };
  const bounds = { ...CUSTOM_CURVE_DEFAULT_BOUNDS, ...(existing?.bounds || {}) };
  let workingPoints = sanitizeCurve(existing?.curve || []);
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
  let tableBody = null;
  let statusEl = null;
  let readoutEl = null;
  let manualCurrentInput = null;
  let manualTimeInput = null;
  let pointCountEl = null;

  let nameInputEl = null;
  let manufacturerInputEl = null;
  let deviceTypeInputEl = null;
  let descriptionInputEl = null;

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
    readoutEl.textContent = `Last point: ${formatSettingValue(point.current)} A @ ${formatSettingValue(point.time)} s`;
  };

  const clamp = (value, min, max) => {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), max);
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
  };

  const refreshCanvas = () => {
    if (!canvas || !ctx) return;
    const metrics = computePlotMetrics();
    const { width, height, plotLeft, plotTop, plotWidth, plotHeight } = metrics;
    ctx.clearRect(0, 0, width, height);
    if (referenceImage) {
      ctx.drawImage(referenceImage, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#f9fafb';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(plotLeft, plotTop, plotWidth, plotHeight);
    ctx.restore();
    if (metrics.axisValid) {
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
  };

  const refreshPointTable = () => {
    if (!tableBody) return;
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
    } else {
      workingPoints.forEach((point, index) => {
        const row = doc.createElement('tr');
        row.dataset.index = String(index);

        const currentCell = doc.createElement('td');
        const currentInput = doc.createElement('input');
        currentInput.type = 'number';
        currentInput.min = '0';
        currentInput.step = 'any';
        currentInput.value = formatSettingValue(point.current);
        currentInput.addEventListener('input', () => {
          workingPoints[index].current = Number(currentInput.value);
        });
        currentInput.addEventListener('change', () => {
          workingPoints[index].current = Number(currentInput.value);
          refreshPointTable();
        });
        currentCell.appendChild(currentInput);

        const timeCell = doc.createElement('td');
        const timeInput = doc.createElement('input');
        timeInput.type = 'number';
        timeInput.min = '0';
        timeInput.step = 'any';
        timeInput.value = formatSettingValue(point.time);
        timeInput.addEventListener('input', () => {
          workingPoints[index].time = Number(timeInput.value);
        });
        timeInput.addEventListener('change', () => {
          workingPoints[index].time = Number(timeInput.value);
          refreshPointTable();
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
    }
    if (pointCountEl) {
      pointCountEl.textContent = `${workingPoints.length} point${workingPoints.length === 1 ? '' : 's'}`;
    }
    refreshCanvas();
  };

  const addPoint = (current, time, { announce = true } = {}) => {
    if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(time) || time <= 0) {
      return;
    }
    workingPoints.push({ current, time });
    refreshPointTable();
    if (announce) {
      updateStatus(`Added point ${formatSettingValue(current)} A @ ${formatSettingValue(time)} s.`, 'info');
    }
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
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const metrics = computePlotMetrics();
    const point = pixelToData(x, y, metrics);
    if (!point) {
      updateStatus('Provide valid axis bounds before digitizing points.', 'error');
      return;
    }
    lastCapturedPoint = point;
    updateReadout(point);
    addPoint(point.current, point.time, { announce: true });
  };

  const resetReference = () => {
    referenceImage = null;
    lastCapturedPoint = null;
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
      deviceTypeLabel.textContent = 'Device type (optional)';
      deviceTypeInputEl = doc.createElement('input');
      deviceTypeInputEl.type = 'text';
      deviceTypeInputEl.value = existing?.deviceType || '';
      deviceTypeLabel.appendChild(deviceTypeInputEl);

      detailsGrid.append(nameLabel, manufacturerLabel, deviceTypeLabel);

      const descriptionLabel = doc.createElement('label');
      descriptionLabel.textContent = 'Description (optional)';
      descriptionInputEl = doc.createElement('textarea');
      descriptionInputEl.rows = 3;
      descriptionInputEl.value = existing?.description || '';
      descriptionLabel.appendChild(descriptionInputEl);

      detailsSection.append(detailsHeading, detailsGrid, descriptionLabel);

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

      statusEl = doc.createElement('p');
      statusEl.className = 'custom-curve-status';
      readoutEl = doc.createElement('p');
      readoutEl.className = 'custom-curve-readout';

      referenceControls.append(uploadButton, uploadInput, clearRefButton, axisFieldset, boundsFieldset, statusEl, readoutEl);

      const canvasContainer = doc.createElement('div');
      canvasContainer.className = 'custom-curve-canvas-container';
      canvas = doc.createElement('canvas');
      canvas.className = 'custom-curve-canvas';
      ctx = canvas.getContext('2d');
      canvas.addEventListener('click', handleCanvasClick);
      canvasContainer.appendChild(canvas);

      referenceGrid.append(referenceControls, canvasContainer);
      referenceSection.append(referenceHeading, referenceGrid);

      const pointsSection = doc.createElement('section');
      pointsSection.className = 'custom-curve-section';
      const pointsHeading = doc.createElement('h3');
      pointsHeading.textContent = 'Curve Points';
      const toolbar = doc.createElement('div');
      toolbar.className = 'custom-curve-toolbar';
      manualCurrentInput = doc.createElement('input');
      manualCurrentInput.type = 'number';
      manualCurrentInput.min = '0';
      manualCurrentInput.step = 'any';
      manualCurrentInput.placeholder = 'Current (A)';
      manualTimeInput = doc.createElement('input');
      manualTimeInput.type = 'number';
      manualTimeInput.min = '0';
      manualTimeInput.step = 'any';
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

      pointsSection.append(pointsHeading, toolbar, pointCountEl, table);

      form.append(detailsSection, referenceSection, pointsSection);
      body.appendChild(form);

      setAxisInputValues();
      setBoundInputValues();
      configureCanvasSize(referenceImage);
      refreshPointTable();
      updateReadout(lastCapturedPoint);
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
      if (workingPoints.length < 2) {
        updateStatus('Add at least two curve points before saving.', 'error');
        return false;
      }
      const sanitizedPoints = sanitizeCurve(workingPoints);
      if (sanitizedPoints.length < 2) {
        updateStatus('Add at least two curve points before saving.', 'error');
        return false;
      }
      const payload = {
        id: existing?.id || null,
        name,
        manufacturer: manufacturerInputEl?.value.trim() || '',
        deviceType: deviceTypeInputEl?.value.trim() || CUSTOM_CURVE_CATEGORY,
        description: descriptionInputEl?.value.trim() || '',
        curve: sanitizedPoints.map(point => ({ current: point.current, time: point.time })),
        axes: axisResult.values,
        bounds: getBoundValues(),
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
    g.append('line')
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
    g.append('path')
      .datum(entry.curve)
      .attr('fill', 'none')
      .attr('stroke', entry.color)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '6,3')
      .attr('d', entry.curve.length ? line(entry.curve) : null);
  });

  overlays.filter(entry => entry.kind === 'transformerDamage').forEach(entry => {
    g.append('path')
      .datum(entry.curve)
      .attr('fill', 'none')
      .attr('stroke', entry.color)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '8,4')
      .attr('d', entry.curve.length ? line(entry.curve) : null);
  });

  overlays.filter(entry => entry.kind === 'motorThermal').forEach(entry => {
    g.append('path')
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
    g.append('line')
      .attr('x1', xPos - size)
      .attr('x2', xPos + size)
      .attr('y1', yPos - size)
      .attr('y2', yPos + size)
      .attr('stroke', entry.color)
      .attr('stroke-width', 2);
    g.append('line')
      .attr('x1', xPos - size)
      .attr('x2', xPos + size)
      .attr('y1', yPos + size)
      .attr('y2', yPos - size)
      .attr('stroke', entry.color)
      .attr('stroke-width', 2);
    g.append('text')
      .attr('x', xPos + size + 4)
      .attr('y', Math.max(12, yPos - size - 2))
      .attr('fill', entry.color)
      .attr('font-size', 12)
      .text(`Inrush – ${formatSettingValue(entry.current)} A @ ${formatSettingValue(duration)} s`);
  });

  overlays.filter(entry => entry.kind === 'motorStart').forEach(entry => {
    const curve = motorStartCurves.get(entry) || entry.curve;
    g.append('path')
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
    entry.bandPath = g.append('path')
      .datum(scaled.envelope || [])
      .attr('fill', entry.color)
      .attr('opacity', 0.15)
      .attr('stroke', 'none');
    entry.minPath = g.append('path')
      .datum(scaled.minCurve || [])
      .attr('fill', 'none')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', '4,4');
    entry.maxPath = g.append('path')
      .datum(scaled.maxCurve || [])
      .attr('fill', 'none')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', '4,4');
    entry.path = g.append('path')
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

  const clampValue = (value, min, max) => {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
  };

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
  ensureComponentIcons();
  if (!componentId || !componentLookup.has(componentId)) {
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
  const MAX_COMPONENTS = 20;
  const adjacency = buildPreviewAdjacency(componentMap, sheet);
  const neighborSet = componentId && adjacency.has(componentId)
    ? adjacency.get(componentId)
    : new Set();
  const orderedTargets = [];
  if (componentId && componentMap.has(componentId)) {
    orderedTargets.push(componentId);
  }
  neighborSet.forEach(id => {
    if (!componentMap.has(id)) return;
    if (orderedTargets.includes(id)) return;
    orderedTargets.push(id);
  });
  const availableTargets = orderedTargets;
  if (!availableTargets.length) {
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
  onelinePreviewSvgEl.classList.remove('hidden');
  if (onelinePreviewContainer) onelinePreviewContainer.classList.remove('empty');
  if (onelinePreviewEmpty) onelinePreviewEmpty.classList.add('hidden');

  const displayedTargets = availableTargets.slice(0, MAX_COMPONENTS);
  const truncatedCount = availableTargets.length - displayedTargets.length;
  const hiddenSelectionCount = sameSheetSelections.filter(id => {
    if (id === componentId) return false;
    return !neighborSet.has(id);
  }).length;

  const DEFAULT_WIDTH = 120;
  const DEFAULT_HEIGHT = 60;

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

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  displayedTargets.forEach(id => {
    const comp = componentMap.get(id);
    if (!comp) return;
    const compWidth = Number.isFinite(comp.width) ? Number(comp.width) : DEFAULT_WIDTH;
    const compHeight = Number.isFinite(comp.height) ? Number(comp.height) : DEFAULT_HEIGHT;
    const compX = Number.isFinite(comp.x) ? Number(comp.x) : 0;
    const compY = Number.isFinite(comp.y) ? Number(comp.y) : 0;
    const rotation = normalizeRotation(comp.rotation ?? comp.rot ?? 0);
    const bounds = computeBounds(compX, compY, compWidth, compHeight, rotation);
    minX = Math.min(minX, bounds.left);
    minY = Math.min(minY, bounds.top);
    maxX = Math.max(maxX, bounds.right);
    maxY = Math.max(maxY, bounds.bottom);
    componentPreviewMeta.set(id, {
      bounds,
      width: compWidth,
      height: compHeight,
      rotation
    });
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    minX = 0;
    minY = 0;
    maxX = width;
    maxY = height;
  }

  const boundsWidth = Math.max(1, maxX - minX);
  const boundsHeight = Math.max(1, maxY - minY);
  const padding = Math.min(width, height) < 320 ? 24 : 36;
  const scaleX = (width - padding * 2) / boundsWidth;
  const scaleY = (height - padding * 2) / boundsHeight;
  const rawScale = Math.min(scaleX, scaleY);
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? Math.min(rawScale, 2.5) : 1;
  const offsetX = padding - minX * scale;
  const offsetY = padding - minY * scale;

  const nodes = displayedTargets.map(id => {
    const comp = componentMap.get(id);
    const meta = componentPreviewMeta.get(id);
    if (!comp || !meta) return null;
    const { bounds, width: compWidth, height: compHeight, rotation } = meta;
    const centerX = ((bounds.left + bounds.right) / 2) * scale + offsetX;
    const centerY = ((bounds.top + bounds.bottom) / 2) * scale + offsetY;
    const scaledWidth = Math.max(0, (bounds.right - bounds.left) * scale);
    const scaledHeight = Math.max(0, (bounds.bottom - bounds.top) * scale);
    return {
      id: comp.id,
      label: componentLabel(comp),
      sheet: record.sheetName,
      x: centerX,
      y: centerY,
      active: comp.id === componentId,
      component: comp,
      selected: selectedIds.has(comp.id),
      width: scaledWidth,
      height: scaledHeight,
      rotation
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
  linkGroup.selectAll('line')
    .data(edges)
    .enter()
    .append('line')
    .attr('class', 'preview-link')
    .attr('x1', d => nodeById.get(d.source)?.x ?? 0)
    .attr('y1', d => nodeById.get(d.source)?.y ?? 0)
    .attr('x2', d => nodeById.get(d.target)?.x ?? 0)
    .attr('y2', d => nodeById.get(d.target)?.y ?? 0);

  linkGroup.selectAll('text')
    .data(edges.filter(edge => edge.label))
    .enter()
    .append('text')
    .attr('class', 'preview-link-label')
    .attr('x', d => {
      const source = nodeById.get(d.source);
      const target = nodeById.get(d.target);
      return source && target ? (source.x + target.x) / 2 : width / 2;
    })
    .attr('y', d => {
      const source = nodeById.get(d.source);
      const target = nodeById.get(d.target);
      return source && target ? (source.y + target.y) / 2 : height / 2;
    })
    .text(d => d.label);

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
    .attr('transform', d => `translate(${d.x},${d.y})`);

  const clamp = (value, min, max) => {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
  };

  const iconSize = datum => {
    const baseSpan = Math.max(datum.width || 0, datum.height || 0);
    const emphasis = datum.active ? 1.15 : datum.selected ? 1.05 : 1;
    if (!Number.isFinite(baseSpan) || baseSpan <= 0) {
      return Math.round((datum.active ? 56 : datum.selected ? 50 : 44) * emphasis);
    }
    const scaled = clamp(baseSpan, 32, 96);
    return Math.round(clamp(scaled * emphasis, 32, 108));
  };

  const iconGroup = node.append('g')
    .attr('class', 'preview-node-icon-group')
    .attr('transform', d => (d.rotation ? `rotate(${d.rotation})` : null));

  iconGroup.append('image')
    .attr('class', 'preview-node-icon')
    .attr('x', d => -(iconSize(d) / 2))
    .attr('y', d => -(iconSize(d) / 2))
    .attr('width', d => iconSize(d))
    .attr('height', d => iconSize(d))
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('href', d => getComponentIcon(d.component))
    .attr('xlink:href', d => getComponentIcon(d.component));

  const labelOffset = datum => {
    const iconRadius = iconSize(datum) / 2;
    const componentRadius = Math.max(datum.width || 0, datum.height || 0) / 2;
    const emphasis = datum.active ? 22 : 18;
    return Math.round(Math.max(iconRadius, componentRadius) + emphasis);
  };

  const labels = node.append('text')
    .attr('class', 'preview-node-label')
    .attr('text-anchor', 'middle')
    .attr('y', d => labelOffset(d));

  labels.selectAll('tspan')
    .data(d => wrapPreviewLabel(d.label))
    .enter()
    .append('tspan')
    .attr('x', 0)
    .attr('dy', (line, index) => (index === 0 ? 0 : 12))
    .text(line => line);

  node.append('title')
    .text(d => (d.sheet ? `${d.label} (${d.sheet})` : d.label));

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
      noteMessages.push(`${hiddenSelectionCount} selected ${hiddenSelectionCount === 1 ? 'device is' : 'devices are'} not directly connected to the active component and are hidden.`);
    }
    if (truncatedCount > 0) {
      noteMessages.push(`Showing ${displayedTargets.length} of ${availableTargets.length} selected devices.`);
    }
    if (noteMessages.length) {
      noteMessages.push('Only devices directly connected to the selected component are displayed.');
    }
    if (!noteMessages.length && selectedEntries.length && !displayedTargets.length) {
      noteMessages.push('No one-line preview available for the current selection.');
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

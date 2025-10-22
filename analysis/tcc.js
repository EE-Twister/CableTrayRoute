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
import { scaleCurve, checkDuty } from './tccUtils.js';
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
const K_CONSTANTS = {
  copper: { 60: 103, 75: 118, 90: 143 },
  aluminum: { 60: 75, 75: 87, 90: 99 }
};

const deviceSelect = document.getElementById('device-select');
const deviceModalBtn = document.getElementById('device-modal-btn');
const selectedSummary = document.getElementById('selected-device-summary');
const settingsDiv = document.getElementById('device-settings');
const plotBtn = document.getElementById('plot-btn');
const linkBtn = document.getElementById('link-btn');
const openBtn = document.getElementById('open-btn');
const componentModalBtn = document.getElementById('component-modal-btn');
const violationDiv = document.getElementById('violation');
const chart = d3.select('#tcc-chart');

const params = new URLSearchParams(window.location.search);
const compId = params.get('component');
const deviceParam = params.get('device');

let libraryDevices = [];
let deviceEntries = [];
let deviceMap = new Map();
let deviceGroups = [];
let componentRecords = [];
let componentLookup = new Map();
let neighborMap = new Map();
let componentDeviceMap = new Map();
let pendingPlotRefresh = null;
let activeComponentId = compId || null;

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
  return stored;
}

let saved = loadSavedSettings();

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
  setItem('tccSettings', saved);
  return selection;
}

function setActiveComponent(componentId, { preserveSelection = false } = {}) {
  const normalized = componentId && componentLookup.has(componentId)
    ? componentId
    : null;
  activeComponentId = normalized;
  updateComponentContextUI();
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

  updateShortCircuitStudy();

  if (getActiveComponentId() && deviceSelect && deviceSelect.selectedOptions.length && initialSelection.length) {
    plot();
  }

  on(STORAGE_KEYS.oneLine, () => {
    const selection = refreshCatalog({ preserveSelection: true });
    updateShortCircuitStudy();
    if (getActiveComponentId() && deviceSelect && deviceSelect.selectedOptions.length && selection.length) {
      plot();
    }
  });

  on('scenario', () => {
    saved = loadSavedSettings();
    const selection = refreshCatalog({ includeComponentContext: true, includeDeviceParam: true });
    updateShortCircuitStudy();
    if (getActiveComponentId() && deviceSelect && deviceSelect.selectedOptions.length && selection.length) {
      plot();
    }
  });
}

function selectDefaults(ids) {
  const valid = [...ids].filter(id => deviceMap.has(id));
  applySelectionSet(valid);
  saved.devices = valid;
  setItem('tccSettings', saved);
}

function buildComponentData() {
  const { sheets } = getOneLine();
  const records = [];
  const lookup = new Map();
  const neighbors = new Map();
  (sheets || []).forEach((sheet, idx) => {
    const sheetName = sheet?.name || `Sheet ${idx + 1}`;
    (sheet?.components || []).forEach(comp => {
      records.push({ component: comp, sheetName });
      lookup.set(comp.id, { component: comp, sheetName });
      neighbors.set(comp.id, new Set());
    });
    (sheet?.connections || []).forEach(conn => {
      if (!conn) return;
      const from = conn.from ?? conn.source ?? conn.a ?? conn.start ?? null;
      const to = conn.to ?? conn.target ?? conn.b ?? conn.end ?? null;
      if (!from || !to) return;
      if (!lookup.has(from) || !lookup.has(to)) return;
      neighbors.get(from)?.add(to);
      neighbors.get(to)?.add(from);
    });
  });
  records.forEach(({ component }) => {
    (component.connections || []).forEach(conn => {
      if (!lookup.has(conn.target)) return;
      neighbors.get(component.id)?.add(conn.target);
      neighbors.get(conn.target)?.add(component.id);
    });
  });
  componentRecords = records;
  componentLookup = lookup;
  neighborMap = neighbors;
  if (activeComponentId && !componentLookup.has(activeComponentId)) {
    activeComponentId = null;
    updateComponentContextUI();
  }
}

function rebuildCatalog() {
  deviceEntries = [];
  deviceMap = new Map();
  deviceGroups = [];

  const componentEntries = buildComponentEntries();
  const libraryEntries = buildLibraryEntries();
  const fuseEntries = libraryEntries.filter(entry => (entry.baseDevice?.type || entry.deviceType) === 'fuse');
  const otherLibraryEntries = libraryEntries.filter(entry => (entry.baseDevice?.type || entry.deviceType) !== 'fuse');
  const overlayEntries = buildOverlayEntries();

  if (componentEntries.length) {
    deviceGroups.push({ id: 'oneline', label: 'One-Line Devices', items: componentEntries });
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
      return true;
    },
    onCancel() {
      applySelectionSet(initialSelection, { persist: true });
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

deviceSelect.addEventListener('change', () => {
  renderSelectedSummary();
  renderSettings();
  persistSettings();
});
plotBtn.addEventListener('click', applyPlotAndPersistence);
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
    setActiveComponent(entry.componentId);
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
      commitSelection(activeEntry);
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

  modalPromise.finally(() => {
    controllerRef.current = null;
    if (componentModalBtn) componentModalBtn.setAttribute('aria-expanded', 'false');
  });

  await modalPromise;
}

function renderSettings() {
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
  saved.devices = selected;
  saved.settings = deviceSettings;
  saved.componentOverrides = componentSettings;
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

function linkComponent() {
  const targetComponentId = getActiveComponentId() || compId;
  if (!targetComponentId) return;
  const first = selectedDeviceIds().find(id => {
    const entry = deviceMap.get(id);
    return entry && (entry.kind === 'library' || entry.kind === 'component');
  });
  if (!first) return;
  const entry = deviceMap.get(first);
  if (!entry) return;
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
  }
}

function gatherOverridesFromInputs(uid) {
  const div = settingsDiv.querySelector(`.device-settings[data-uid="${uid}"]`);
  if (!div) return {};
  const entry = deviceMap.get(uid);
  if (!entry) return {};
  return snapOverridesToOptions(entry.baseDevice, collectOverridesFromDiv(div));
}

function plot() {
  chart.selectAll('*').remove();
  violationDiv.textContent = '';
  const selections = selectedDeviceIds().map(id => deviceMap.get(id)).filter(Boolean);
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

  const studies = getStudies();
  const contextId = getActiveComponentId();
  const fault = contextId ? studies.shortCircuit?.[contextId]?.threePhaseKA : null;
  if (fault) {
    allCurrents.push(fault * 1000);
  }

  const margin = { top: 20, right: 30, bottom: 70, left: 70 };
  const width = +chart.attr('width') - margin.left - margin.right;
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
    .call(axis => axis.select('.domain').remove());
  g.append('g')
    .attr('class', 'grid grid-y')
    .call(yAxis.tickSize(-width).tickFormat(''))
    .call(axis => axis.select('.domain').remove());

  g.append('text')
    .attr('x', width / 2)
    .attr('y', height + margin.bottom - 5)
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

  const color = d3.scaleOrdinal(d3.schemeCategory10);
  const legend = chart.append('g')
    .attr('class', 'tcc-legend')
    .attr('transform', `translate(${margin.left},${margin.top - 12})`);

  const plottables = [...devicePlots, ...overlays];
  plottables.forEach((entry, index) => {
    entry.color = color(index);
    const legendItem = legend.append('g').attr('transform', `translate(${index * 180},0)`);
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
      .text(entry.selection?.name || entry.name || entry.selection?.baseDevice?.name || '');
  });

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
    g.append('path')
      .datum(entry.curve)
      .attr('fill', 'none')
      .attr('stroke', entry.color)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '2,2')
      .attr('d', entry.curve.length ? line(entry.curve) : null);
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
      .style('cursor', 'move');
    return entry;
  });

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
  };

  const clampValue = (value, min, max) => {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
  };

  const updateDeviceInputs = entry => {
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

  updateCurves();
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

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getItem, setItem, getOneLine, setOneLine, getStudies, setStudies } from '../dataStore.mjs';
import { runShortCircuit } from './shortCircuit.mjs';
import { scaleCurve, checkDuty } from './tccUtils.js';
import conductorProperties from '../conductorPropertiesData.mjs';

const PROTECTIVE_TYPES = new Set(['breaker', 'fuse', 'relay', 'recloser', 'contactor', 'switch']);
const CMIL_TO_MM2 = 0.000506707478; // 1 circular mil in mm^2
const DEFAULT_INRUSH_MULTIPLE = 12;
const DEFAULT_INRUSH_DURATION = 0.1;
const CABLE_TIME_POINTS = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
const K_CONSTANTS = {
  copper: { 60: 103, 75: 118, 90: 143 },
  aluminum: { 60: 75, 75: 87, 90: 99 }
};

const deviceSelect = document.getElementById('device-select');
const deviceList = document.getElementById('device-multi-list');
const settingsDiv = document.getElementById('device-settings');
const plotBtn = document.getElementById('plot-btn');
const linkBtn = document.getElementById('link-btn');
const openBtn = document.getElementById('open-btn');
const violationDiv = document.getElementById('violation');
const chart = d3.select('#tcc-chart');

const params = new URLSearchParams(window.location.search);
const compId = params.get('component');
const deviceParam = params.get('device');
if (compId) {
  linkBtn.style.display = 'inline-block';
  openBtn.style.display = 'inline-block';
}

let libraryDevices = [];
let deviceEntries = [];
let deviceMap = new Map();
let deviceGroups = [];
let componentRecords = [];
let componentLookup = new Map();
let neighborMap = new Map();

let saved = getItem('tccSettings') || {};
if (!Array.isArray(saved.devices)) saved.devices = [];
if (!saved.settings || typeof saved.settings !== 'object') saved.settings = {};
if (!saved.componentOverrides || typeof saved.componentOverrides !== 'object') saved.componentOverrides = {};
if (!saved.overlaySelections || typeof saved.overlaySelections !== 'object') saved.overlaySelections = {};

init();

const MIN_PICKUP = 0.01;
const MAX_PICKUP = 1e6;
const MIN_DELAY = 0.001;
const MAX_DELAY = 1e5;

function selectedDeviceIds() {
  return [...deviceSelect.selectedOptions].map(o => o.value);
}

function syncCheckboxesFromSelect() {
  if (!deviceList) return;
  const selected = new Set(selectedDeviceIds());
  deviceList.querySelectorAll('input[type="checkbox"]').forEach(box => {
    box.checked = selected.has(box.value);
  });
}

function syncSelectFromCheckboxes({ persist = false } = {}) {
  if (!deviceList) return;
  const checked = new Set(
    [...deviceList.querySelectorAll('input[type="checkbox"]:checked')].map(box => box.value)
  );
  [...deviceSelect.options].forEach(opt => {
    opt.selected = checked.has(opt.value);
  });
  renderSettings();
  if (persist) persistSettings();
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
    shortTimeDelay: 'Short Time Delay'
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

async function init() {
  try {
    const list = await fetch('data/protectiveDevices.json').then(r => r.json());
    libraryDevices = Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('Failed to load device data', e);
    libraryDevices = [];
  }

  buildComponentData();
  rebuildCatalog();

  const sc = runShortCircuit();
  const studies = getStudies();
  studies.shortCircuit = sc;
  setStudies(studies);

  const available = new Set(deviceEntries.map(entry => entry.uid));
  const defaults = new Set((saved.devices || []).filter(id => available.has(id)));
  if (compId) {
    const compEntry = deviceEntries.find(entry => entry.kind === 'component' && entry.componentId === compId);
    if (compEntry) defaults.add(compEntry.uid);
  }
  if (deviceParam) {
    const libraryEntry = deviceEntries.find(entry => entry.kind === 'library' && entry.baseDeviceId === deviceParam);
    if (libraryEntry) defaults.add(libraryEntry.uid);
  }
  if (!defaults.size && deviceEntries.length) {
    const first = deviceEntries.find(entry => entry.kind === 'component')
      || deviceEntries.find(entry => entry.kind === 'library');
    if (first) defaults.add(first.uid);
  }
  deviceEntries
    .filter(entry => entry.autoSelect)
    .forEach(entry => defaults.add(entry.uid));
  if (defaults.size) {
    selectDefaults(defaults);
  }

  syncCheckboxesFromSelect();
  renderSettings();
  if (compId && deviceSelect && deviceSelect.selectedOptions.length) {
    plot();
  }
}

function selectDefaults(ids) {
  const valid = [...ids].filter(id => deviceMap.has(id));
  [...deviceSelect.options].forEach(opt => {
    opt.selected = valid.includes(opt.value);
  });
  if (deviceList) {
    deviceList.querySelectorAll('input[type="checkbox"]').forEach(box => {
      box.checked = valid.includes(box.value);
    });
  }
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
}

function rebuildCatalog() {
  deviceEntries = [];
  deviceMap = new Map();
  deviceGroups = [];

  const componentEntries = buildComponentEntries();
  const libraryEntries = buildLibraryEntries();
  const overlayEntries = buildOverlayEntries();

  if (componentEntries.length) {
    deviceGroups.push({ id: 'oneline', label: 'One-Line Devices', items: componentEntries });
  }
  if (libraryEntries.length) {
    deviceGroups.push({ id: 'library', label: 'Library Devices', items: libraryEntries });
  }
  if (overlayEntries.length) {
    deviceGroups.push({ id: 'overlays', label: 'Connected Elements', items: overlayEntries });
  }

  deviceEntries = deviceGroups.flatMap(group => group.items);
  deviceEntries.forEach(entry => deviceMap.set(entry.uid, entry));

  renderDeviceList();
}

function buildComponentEntries() {
  const entries = [];
  componentRecords.forEach(({ component, sheetName }) => {
    if (!PROTECTIVE_TYPES.has(component.type) || !component.tccId) return;
    const base = libraryDevices.find(dev => dev.id === component.tccId);
    if (!base) return;
    const overrides = mergeOverrides(component.tccOverrides, saved.componentOverrides?.[component.id]);
    const entry = {
      uid: `component:${component.id}`,
      kind: 'component',
      name: `${component.label || component.name || base.name || component.type}${sheetName ? ` (${sheetName})` : ''}`,
      baseDeviceId: base.id,
      baseDevice: base,
      componentId: component.id,
      sheetName,
      overrideSource: overrides
    };
    entries.push(entry);
  });
  return entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function buildLibraryEntries() {
  return libraryDevices.map(dev => ({
    uid: dev.id,
    kind: 'library',
    name: dev.name || dev.id,
    baseDeviceId: dev.id,
    baseDevice: dev,
    overrideSource: saved.settings?.[dev.id] || {}
  })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function buildOverlayEntries() {
  if (!compId || !componentLookup.has(compId)) return [];
  const overlays = [];
  overlays.push(...buildTransformerInrushEntries(compId));
  overlays.push(...buildCableEntries(compId));
  return overlays;
}

function buildTransformerInrushEntries(targetId) {
  const overlays = [];
  const reference = componentLookup.get(targetId)?.component;
  if (!reference) return overlays;
  const refVoltage = inferVoltage(reference);
  const refPhases = parsePhases(reference.phases).length || 3;
  (neighborMap.get(targetId) || new Set()).forEach(id => {
    const neighbor = componentLookup.get(id)?.component;
    if (!neighbor || neighbor.type !== 'transformer') return;
    const inrush = computeTransformerInrush(neighbor, refVoltage, refPhases);
    if (!inrush) return;
    overlays.push({
      uid: `inrush:${neighbor.id}:${targetId}`,
      kind: 'inrush',
      name: `${componentLabel(neighbor)} Inrush`,
      current: inrush.current,
      duration: inrush.duration,
      sourceId: neighbor.id,
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
        curve: curve.curve,
        ampacity: curve.ampacity,
        autoSelect: true
      });
    });
  });
  return overlays.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function renderDeviceList() {
  if (!deviceSelect) return;
  deviceSelect.innerHTML = '';
  if (deviceList) deviceList.innerHTML = '';

  let addedComponentGroup = false;
  deviceGroups.forEach(group => {
    if (!group.items.length) return;
    if (deviceList) {
      const heading = document.createElement('h4');
      heading.className = 'device-multi-heading';
      heading.textContent = group.label;
      deviceList.appendChild(heading);
      if (group.id === 'oneline') addedComponentGroup = true;
    }
    group.items.forEach(item => {
      const opt = new Option(item.name, item.uid);
      opt.dataset.kind = item.kind;
      deviceSelect.add(opt);
      if (deviceList) {
        const label = document.createElement('label');
        label.className = 'device-multi-item';
        label.dataset.uid = item.uid;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = item.uid;
        checkbox.addEventListener('change', () => syncSelectFromCheckboxes({ persist: true }));
        label.appendChild(checkbox);
        const name = document.createElement('span');
        name.textContent = item.name;
        label.appendChild(name);
        deviceList.appendChild(label);
      }
    });
  });

  if (!addedComponentGroup && deviceList) {
    const info = document.createElement('p');
    info.className = 'device-multi-empty';
    info.textContent = 'Link protective devices on the One-Line to view them here.';
    deviceList.appendChild(info);
  }
}

deviceSelect.addEventListener('change', () => {
  renderSettings();
  syncCheckboxesFromSelect();
  persistSettings();
});
plotBtn.addEventListener('click', () => {
  plot();
  persistSettings();
});
linkBtn.addEventListener('click', linkComponent);
openBtn.addEventListener('click', () => {
  if (compId) window.open(`oneline.html?component=${encodeURIComponent(compId)}`, '_blank');
});

function renderSettings() {
  syncCheckboxesFromSelect();
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
          const activeStr = String(activeValue);
          const hasValue = normalizedOptions.some(opt => valuesEqual(opt.value, activeValue));
          if (!hasValue) {
            const customOpt = document.createElement('option');
            customOpt.value = activeStr;
            customOpt.textContent = `${formatSettingValue(activeValue)} (custom)`;
            customOpt.dataset.custom = 'true';
            select.appendChild(customOpt);
          }
          select.value = activeStr;
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
    const overrides = collectOverridesFromDiv(div);
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
      const overrides = componentSettings[comp.id];
      if (overrides && Object.keys(overrides).length) {
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
  if (!compId) return;
  const first = selectedDeviceIds().find(id => {
    const entry = deviceMap.get(id);
    return entry && (entry.kind === 'library' || entry.kind === 'component');
  });
  if (!first) return;
  const entry = deviceMap.get(first);
  if (!entry) return;
  const deviceId = entry.baseDeviceId;
  const overrides = entry.overrideSource || {};
  const data = getOneLine();
  let updated = false;
  (data.sheets || []).forEach(sheet => {
    (sheet.components || []).forEach(comp => {
      if (comp.id !== compId) return;
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
    selectDefaults(new Set([`component:${compId}`]));
    renderSettings();
    plot();
  }
}

function gatherOverridesFromInputs(uid) {
  const div = settingsDiv.querySelector(`.device-settings[data-uid="${uid}"]`);
  if (!div) return {};
  return collectOverridesFromDiv(div);
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
      const overrides = {
        ...selection.overrideSource,
        ...gatherOverridesFromInputs(selection.uid)
      };
      const scaled = scaleCurve(selection.baseDevice, overrides);
      devicePlots.push({ selection, overrides, scaled });
    } else if (selection.kind === 'cable') {
      overlays.push({ ...selection });
    } else if (selection.kind === 'inrush') {
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
      if (entry.duration) allTimes.push(entry.duration);
    }
  });

  const studies = getStudies();
  const fault = compId ? studies.shortCircuit?.[compId]?.threePhaseKA : null;
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
        .attr('x1', 8)
        .attr('x2', 8)
        .attr('y1', 0)
        .attr('y2', 16)
        .attr('stroke', entry.color)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,2');
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

  overlays.filter(entry => entry.kind === 'inrush').forEach(entry => {
    const xPos = x(entry.current);
    g.append('line')
      .attr('x1', xPos)
      .attr('x2', xPos)
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', entry.color)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,2');
    g.append('text')
      .attr('x', xPos + 6)
      .attr('y', 12)
      .attr('fill', entry.color)
      .attr('font-size', 12)
      .text(`${formatSettingValue(entry.current)} A Inrush`);
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
    if (!compId) return;
    const res = getStudies();
    res.duty = res.duty || {};
    res.duty[compId] = violations;
    setStudies(res);
  };

  const updateCurves = () => {
    const faultKA = compId ? getStudies().shortCircuit?.[compId]?.threePhaseKA : null;
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
      const formatted = formatSettingValue(value);
      if (input.tagName === 'SELECT') {
        const valueStr = String(value ?? '');
        let option = [...input.options].find(o => o.value === valueStr);
        if (!option) {
          option = document.createElement('option');
          option.value = valueStr;
          option.textContent = formatted ? `${formatted} (custom)` : 'Custom';
          option.dataset.custom = 'true';
          input.appendChild(option);
        }
        input.value = valueStr;
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
  return comp?.label || comp?.name || comp?.subtype || comp?.type || comp?.id || 'Component';
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
    if (comp[key] === undefined || comp[key] === null || comp[key] === '') continue;
    const num = Number(comp[key]);
    if (!Number.isFinite(num)) continue;
    if (key.toLowerCase().includes('kv')) return num * 1000;
    return num;
  }
  return null;
}

function computeTransformerInrush(transformer, referenceVoltage, refPhases = 3) {
  const sides = [];
  const sideDefs = [
    { kvaKey: 'kva_hv', voltsKey: 'volts_hv', label: 'HV' },
    { kvaKey: 'kva_lv', voltsKey: 'volts_lv', label: 'LV' },
    { kvaKey: 'kva_tv', voltsKey: 'volts_tv', label: 'Tertiary' },
    { kvaKey: 'kva_primary', voltsKey: 'volts_primary', label: 'Primary' },
    { kvaKey: 'kva_secondary', voltsKey: 'volts_secondary', label: 'Secondary' }
  ];
  sideDefs.forEach(({ kvaKey, voltsKey, label }) => {
    const kva = Number(transformer[kvaKey]);
    const volts = Number(transformer[voltsKey]);
    if (!Number.isFinite(kva) || !Number.isFinite(volts)) return;
    sides.push({ kva, volts, label });
  });
  if (!sides.length) {
    const kva = Number(transformer.kva || (transformer.mva ? transformer.mva * 1000 : NaN));
    const volts = Number(transformer.volts_secondary || transformer.volts_primary || transformer.voltage);
    if (Number.isFinite(kva) && Number.isFinite(volts)) {
      sides.push({ kva, volts, label: 'Secondary' });
    }
  }
  if (!sides.length) return null;
  let selected = sides[0];
  if (referenceVoltage) {
    let best = { diff: Infinity, side: sides[0] };
    sides.forEach(side => {
      const diff = Math.abs(side.volts - referenceVoltage);
      if (diff < best.diff) best = { diff, side };
    });
    selected = best.side;
  }
  const phases = parsePhases(transformer.phases).length || refPhases || 3;
  const kva = Number(selected.kva);
  const volts = Number(selected.volts);
  if (!kva || !volts) return null;
  const apparent = kva * 1000;
  const fla = phases === 1 ? apparent / volts : apparent / (Math.sqrt(3) * volts);
  if (!Number.isFinite(fla) || fla <= 0) return null;
  const multiple = resolveInrushMultiple(transformer);
  const duration = resolveInrushDuration(transformer);
  return { current: fla * multiple, duration };
}

function resolveInrushMultiple(comp) {
  const keys = ['inrush_multiple', 'inrushMultiple', 'inrush_multiplier', 'xfmr_inrush_multiple', 'xfmrInrushMultiple'];
  for (const key of keys) {
    const val = Number(comp[key]);
    if (Number.isFinite(val) && val > 0) return val;
  }
  return DEFAULT_INRUSH_MULTIPLE;
}

function resolveInrushDuration(comp) {
  const keys = ['inrush_duration', 'inrushDuration', 'xfmr_inrush_duration'];
  for (const key of keys) {
    const val = Number(comp[key]);
    if (Number.isFinite(val) && val > 0) return val;
  }
  return DEFAULT_INRUSH_DURATION;
}

function resolveCableInfo(source, target, conn) {
  if (source?.type === 'cable' && source.cable) return source.cable;
  if (target?.type === 'cable' && target.cable) return target.cable;
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

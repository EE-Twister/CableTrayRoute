import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getItem, setItem, getOneLine, setOneLine, getStudies, setStudies } from '../dataStore.mjs';
import { runShortCircuit } from './shortCircuit.mjs';
import { scaleCurve, checkDuty } from './tccUtils.js';

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

let devices = [];
let saved = getItem('tccSettings') || { devices: [], settings: {} };

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

function capitalize(word = '') {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function formatSettingValue(value) {
  if (!Number.isFinite(Number(value))) return '';
  const num = Number(value);
  if (Math.abs(num) >= 1000 || Number.isInteger(num)) return String(num);
  if (Math.abs(num) >= 100) return num.toFixed(1);
  if (Math.abs(num) >= 10) return num.toFixed(2);
  return num.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

async function init() {
  try {
    devices = await fetch('data/protectiveDevices.json').then(r => r.json());
  } catch (e) {
    console.error('Failed to load device data', e);
    devices = [];
  }
  if (deviceList) deviceList.innerHTML = '';
  devices.forEach(d => {
    const opt = new Option(d.name, d.id);
    deviceSelect.add(opt);
    if (deviceList) {
      const label = document.createElement('label');
      label.className = 'device-multi-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = d.id;
      if (saved.devices?.includes?.(d.id)) {
        checkbox.checked = true;
      }
      checkbox.addEventListener('change', () => {
        syncSelectFromCheckboxes({ persist: true });
      });
      const name = document.createElement('span');
      name.textContent = d.name;
      label.appendChild(checkbox);
      label.appendChild(name);
      deviceList.appendChild(label);
    }
  });
  const sc = runShortCircuit();
  const studies = getStudies();
  studies.shortCircuit = sc;
  setStudies(studies);
  let linked = null;
  if (compId) {
    const { sheets } = getOneLine();
    for (const sheet of sheets) {
      const comp = (sheet.components || []).find(c => c.id === compId);
      if (comp) { linked = comp; break; }
    }
  }
  if (deviceParam) {
    const opt = [...deviceSelect.options].find(o => o.value === deviceParam);
    if (opt) opt.selected = true;
  } else if (linked?.tccId) {
    const opt = [...deviceSelect.options].find(o => o.value === linked.tccId);
    if (opt) opt.selected = true;
  } else {
    saved.devices.forEach(id => {
      const opt = [...deviceSelect.options].find(o => o.value === id);
      if (opt) opt.selected = true;
    });
  }
  syncCheckboxesFromSelect();
  renderSettings();
  if (compId && ([...deviceSelect.selectedOptions].length)) {
    plot();
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
  [...deviceSelect.selectedOptions].forEach(opt => {
    const dev = devices.find(d => d.id === opt.value);
    if (!dev) return;
    const set = saved.settings[dev.id] || dev.settings || {};
    const div = document.createElement('div');
    div.className = 'device-settings';
    div.dataset.id = dev.id;
    const heading = document.createElement('h3');
    heading.textContent = dev.name;
    div.appendChild(heading);
    Object.keys(dev.settings || {}).forEach(field => {
      const label = document.createElement('label');
      label.textContent = `${capitalize(field)} `;
      const options = Array.isArray(dev.settingOptions?.[field]) ? dev.settingOptions[field] : null;
      const savedValue = set[field];
      if (options && options.length) {
        const select = document.createElement('select');
        select.dataset.field = field;
        const normalized = Number(savedValue);
        const existingValues = options.map(Number);
        options.forEach(val => {
          const optEl = document.createElement('option');
          optEl.value = String(val);
          optEl.textContent = formatSettingValue(val);
          select.appendChild(optEl);
        });
        if (Number.isFinite(normalized) && !existingValues.includes(normalized)) {
          const customOpt = document.createElement('option');
          customOpt.value = String(normalized);
          customOpt.textContent = `${formatSettingValue(normalized)} (custom)`;
          customOpt.dataset.custom = 'true';
          select.appendChild(customOpt);
        }
        if (Number.isFinite(normalized)) {
          select.value = String(normalized);
        }
        label.appendChild(select);
      } else {
        const input = document.createElement('input');
        input.type = 'number';
        input.dataset.field = field;
        if (Number.isFinite(Number(savedValue))) {
          input.value = formatSettingValue(savedValue);
        }
        label.appendChild(input);
      }
      div.appendChild(label);
    });
    settingsDiv.appendChild(div);
  });
}



function persistSettings() {
  const sel = [...deviceSelect.selectedOptions].map(o => o.value);
  const sets = {};
  settingsDiv.querySelectorAll('.device-settings').forEach(div => {
    const id = div.dataset.id;
    const obj = {};
    div.querySelectorAll('[data-field]').forEach(inp => {
      const raw = inp.value;
      const val = raw === '' ? NaN : Number(raw);
      if (!Number.isNaN(val)) obj[inp.dataset.field] = val;
    });
    sets[id] = obj;
  });
  saved = { devices: sel, settings: sets };
  setItem('tccSettings', saved);
}

function linkComponent() {
  if (!compId) return;
  const sel = [...deviceSelect.selectedOptions].map(o => o.value);
  const first = sel[0];
  if (!first) return;
  const data = getOneLine();
  for (const sheet of data.sheets) {
    const comp = (sheet.components || []).find(c => c.id === compId);
    if (comp) {
      comp.tccId = first;
      setOneLine(data);
      break;
    }
  }
}

function plot() {
  chart.selectAll('*').remove();
  violationDiv.textContent = '';
  const sel = [...deviceSelect.selectedOptions].map(o => o.value);
  const entries = sel.map(id => {
    const base = devices.find(d => d.id === id);
    if (!base) return null;
    const div = settingsDiv.querySelector(`.device-settings[data-id="${id}"]`);
    const overrides = {};
    div?.querySelectorAll('[data-field]').forEach(inp => {
      const v = Number(inp.value);
      if (!Number.isNaN(v)) overrides[inp.dataset.field] = v;
    });
    const scaled = scaleCurve(base, overrides);
    return { id, base, overrides, scaled };
  }).filter(Boolean);
  if (!entries.length) return;
  let allCurrents = entries.flatMap(s => s.scaled.curve.map(p => p.current)).filter(v => v > 0);
  const allTimes = entries.flatMap(s => {
    const base = s.scaled.curve.map(p => p.time);
    const band = s.scaled.envelope?.flatMap(p => [p.minTime, p.maxTime]) || [];
    return [...base, ...band];
  }).filter(v => v > 0);
  const studies = getStudies();
  const fault = studies.shortCircuit?.[compId]?.threePhaseKA;
  if (fault) {
    allCurrents = [...allCurrents, fault * 1000];
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

  const plotted = entries.map((entry, index) => {
    entry.color = color(index);
    const legendItem = legend.append('g').attr('transform', `translate(${index * 160},0)`);
    legendItem.append('rect')
      .attr('width', 16)
      .attr('height', 16)
      .attr('fill', entry.color)
      .attr('opacity', 0.6);
    legendItem.append('text')
      .attr('x', 20)
      .attr('y', 12)
      .attr('fill', '#333')
      .attr('font-size', 12)
      .text(entry.base.name || entry.base.id);
    entry.bandPath = g.append('path')
      .datum(entry.scaled.envelope || [])
      .attr('fill', entry.color)
      .attr('opacity', 0.15)
      .attr('stroke', 'none');
    entry.minPath = g.append('path')
      .datum(entry.scaled.minCurve || [])
      .attr('fill', 'none')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', '4,4');
    entry.maxPath = g.append('path')
      .datum(entry.scaled.maxCurve || [])
      .attr('fill', 'none')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', '4,4');
    entry.path = g.append('path')
      .datum(entry.scaled.curve)
      .attr('fill', 'none')
      .attr('stroke-width', 2)
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
    const faultKA = getStudies().shortCircuit?.[compId]?.threePhaseKA;
    const violations = [];
    plotted.forEach(entry => {
      entry.scaled = scaleCurve(entry.base, entry.overrides);
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
    const div = settingsDiv.querySelector(`.device-settings[data-id="${entry.base.id}"]`);
    if (!div) return;
    Object.entries(entry.overrides).forEach(([field, value]) => {
      const input = div.querySelector(`[data-field="${field}"]`);
      if (!input || !Number.isFinite(value)) return;
      if (input.tagName === 'SELECT') {
        const valueStr = String(value);
        let option = [...input.options].find(o => o.value === valueStr);
        if (!option) {
          option = document.createElement('option');
          option.value = valueStr;
          option.textContent = `${formatSettingValue(value)} (custom)`;
          option.dataset.custom = 'true';
          input.appendChild(option);
        }
        input.value = valueStr;
      } else {
        input.value = formatSettingValue(value);
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
        startPickup: entry.overrides.pickup ?? entry.scaled.settings?.pickup ?? entry.base.settings?.pickup ?? 1,
        startDelay: entry.overrides.time ?? entry.scaled.settings?.time ?? entry.base.settings?.time ?? entry.base.settings?.delay ?? 0.1
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

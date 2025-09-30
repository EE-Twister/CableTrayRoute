import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getItem, setItem, getOneLine, setOneLine, getStudies, setStudies } from '../dataStore.mjs';
import { runShortCircuit } from './shortCircuit.mjs';
import { scaleCurve, checkDuty } from './tccUtils.js';

const deviceSelect = document.getElementById('device-select');
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

async function init() {
  try {
    devices = await fetch('data/protectiveDevices.json').then(r => r.json());
  } catch (e) {
    console.error('Failed to load device data', e);
    devices = [];
  }
  devices.forEach(d => {
    const opt = new Option(d.name, d.id);
    deviceSelect.add(opt);
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
  renderSettings();
  if (compId && ([...deviceSelect.selectedOptions].length)) {
    plot();
  }
}

deviceSelect.addEventListener('change', renderSettings);
plotBtn.addEventListener('click', () => {
  plot();
  persistSettings();
});
linkBtn.addEventListener('click', linkComponent);
openBtn.addEventListener('click', () => {
  if (compId) window.open(`oneline.html?component=${encodeURIComponent(compId)}`, '_blank');
});

function renderSettings() {
  settingsDiv.innerHTML = '';
  [...deviceSelect.selectedOptions].forEach(opt => {
    const dev = devices.find(d => d.id === opt.value);
    if (!dev) return;
    const set = saved.settings[dev.id] || dev.settings || {};
    const div = document.createElement('div');
    div.className = 'device-settings';
    div.dataset.id = dev.id;
    let html = `\n      <h3>${dev.name}</h3>`;
    Object.keys(dev.settings || {}).forEach(k => {
      const val = set[k] ?? '';
      html += `\n      <label>${k.charAt(0).toUpperCase() + k.slice(1)} <input type="number" data-field="${k}" value="${val}"></label>`;
    });
    div.innerHTML = html;
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
      const val = Number(inp.value);
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
  const allCurrents = entries.flatMap(s => s.scaled.curve.map(p => p.current));
  const allTimes = entries.flatMap(s => {
    const base = s.scaled.curve.map(p => p.time);
    const band = s.scaled.envelope?.flatMap(p => [p.minTime, p.maxTime]) || [];
    return [...base, ...band];
  });
  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const width = +chart.attr('width') - margin.left - margin.right;
  const height = +chart.attr('height') - margin.top - margin.bottom;
  const g = chart.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const x = d3.scaleLog().domain([d3.min(allCurrents), d3.max(allCurrents)]).range([0, width]);
  const y = d3.scaleLog().domain([d3.min(allTimes), d3.max(allTimes)]).range([height, 0]);
  g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x));
  g.append('g').call(d3.axisLeft(y));
  const color = d3.scaleOrdinal(d3.schemeCategory10);
  const studies = getStudies();
  const fault = studies.shortCircuit?.[compId]?.threePhaseKA;
  if (fault) {
    g.append('line')
      .attr('x1', x(fault * 1000))
      .attr('x2', x(fault * 1000))
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#000')
      .attr('stroke-dasharray', '4,2');
  }
  const line = d3.line().x(p => x(p.current)).y(p => y(p.time)).curve(d3.curveMonotoneX);
  const bandArea = d3.area()
    .x(p => x(p.current))
    .y0(p => y(p.maxTime))
    .y1(p => y(p.minTime))
    .curve(d3.curveMonotoneX);
  const [xMin, xMax] = x.range();
  const [yMin, yMax] = y.range();

  const plotted = entries.map((entry, index) => {
    entry.color = color(index);
    entry.bandPath = g.append('path')
      .datum(entry.scaled.envelope)
      .attr('fill', entry.color)
      .attr('opacity', 0.15)
      .attr('stroke', 'none');
    entry.minPath = g.append('path')
      .datum(entry.scaled.minCurve)
      .attr('fill', 'none')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', '4,4');
    entry.maxPath = g.append('path')
      .datum(entry.scaled.maxCurve)
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
      entry.bandPath
        .datum(entry.scaled.envelope)
        .attr('d', bandArea(entry.scaled.envelope))
        .attr('fill', entry.color);
      entry.minPath
        .datum(entry.scaled.minCurve)
        .attr('d', line(entry.scaled.minCurve))
        .attr('stroke', entry.color);
      entry.maxPath
        .datum(entry.scaled.maxCurve)
        .attr('d', line(entry.scaled.maxCurve))
        .attr('stroke', entry.color);
      entry.path
        .datum(entry.scaled.curve)
        .attr('d', line(entry.scaled.curve))
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
      const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
      input.value = Number(value.toFixed(decimals));
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

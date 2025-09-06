import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getItem, setItem, getOneLine, setOneLine, getStudies, setStudies } from '../dataStore.mjs';
import { runShortCircuit } from './shortCircuit.js';
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
    const sheets = getOneLine();
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
  const sheets = getOneLine();
  for (const sheet of sheets) {
    const comp = (sheet.components || []).find(c => c.id === compId);
    if (comp) {
      comp.tccId = first;
      setOneLine(sheets);
      break;
    }
  }
}

function plot() {
  chart.selectAll('*').remove();
  violationDiv.textContent = '';
  const sel = [...deviceSelect.selectedOptions].map(o => o.value);
  const selected = sel.map(id => {
    const base = devices.find(d => d.id === id);
    if (!base) return null;
    const div = settingsDiv.querySelector(`.device-settings[data-id="${id}"]`);
    const overrides = {};
    div?.querySelectorAll('[data-field]').forEach(inp => {
      const v = Number(inp.value);
      if (!Number.isNaN(v)) overrides[inp.dataset.field] = v;
    });
    return scaleCurve(base, overrides);
  }).filter(Boolean);
  if (!selected.length) return;
  const allCurrents = selected.flatMap(s => s.curve.map(p => p.current));
  const allTimes = selected.flatMap(s => s.curve.map(p => p.time));
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
  const violations = [];
  selected.forEach((s, i) => {
    const violation = checkDuty(s, fault);
    const line = d3.line().x(p => x(p.current)).y(p => y(p.time)).curve(d3.curveMonotoneX);
    g.append('path')
      .datum(s.curve)
      .attr('fill', 'none')
      .attr('stroke', violation ? 'red' : color(i))
      .attr('stroke-width', 2)
      .attr('d', line);
    if (violation) violations.push(violation);
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
  if (violations.length) {
    violationDiv.innerHTML = violations.map(v => `<p>${v}</p>`).join('');
  }
  const res = getStudies();
  res.duty = res.duty || {};
  if (compId) res.duty[compId] = violations;
  setStudies(res);
}

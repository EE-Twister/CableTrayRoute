import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getItem, setItem, getOneLine, setOneLine, getStudies, setStudies } from '../dataStore.mjs';

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
const saved = getItem('tccSettings') || { devices: [], settings: {} };

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
  if (deviceParam) {
    const opt = [...deviceSelect.options].find(o => o.value === deviceParam);
    if (opt) opt.selected = true;
  } else {
    saved.devices.forEach(id => {
      const opt = [...deviceSelect.options].find(o => o.value === id);
      if (opt) opt.selected = true;
    });
  }
  renderSettings();
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
    div.innerHTML = `\n      <h3>${dev.name}</h3>\n      <label>Pickup <input type="number" data-field="pickup" value="${set.pickup ?? ''}"></label>\n      <label>Delay <input type="number" step="0.01" data-field="delay" value="${set.delay ?? ''}"></label>\n      <label>Inst <input type="number" data-field="instantaneous" value="${set.instantaneous ?? ''}"></label>\n    `;
    settingsDiv.appendChild(div);
  });
}

function persistSettings() {
  const sel = [...deviceSelect.selectedOptions].map(o => o.value);
  const sets = {};
  settingsDiv.querySelectorAll('.device-settings').forEach(div => {
    const id = div.dataset.id;
    sets[id] = {
      pickup: Number(div.querySelector('[data-field="pickup"]').value) || undefined,
      delay: Number(div.querySelector('[data-field="delay"]').value) || undefined,
      instantaneous: Number(div.querySelector('[data-field="instantaneous"]').value) || undefined
    };
  });
  setItem('tccSettings', { devices: sel, settings: sets });
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
    const pickup = Number(div?.querySelector('[data-field="pickup"]').value) || base.settings.pickup || 1;
    const delay = Number(div?.querySelector('[data-field="delay"]').value) || base.settings.delay || 1;
    const inst = Number(div?.querySelector('[data-field="instantaneous"]').value) || base.settings.instantaneous || 0;
    const scaleI = pickup / (base.settings.pickup || 1);
    const scaleT = delay / (base.settings.delay || 1);
    const curve = (base.curve || []).map(p => ({
      current: p.current * scaleI,
      time: p.time * scaleT
    }));
    if (inst) curve.push({ current: inst, time: 0.01 });
    return { ...base, curve, settings: { pickup, delay, instantaneous: inst } };
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
  selected.forEach((s, i) => {
    const line = d3.line().x(p => x(p.current)).y(p => y(p.time)).curve(d3.curveMonotoneX);
    g.append('path').datum(s.curve).attr('fill', 'none').attr('stroke', color(i)).attr('stroke-width', 2).attr('d', line);
  });
  const studies = getStudies();
  const fault = studies.shortCircuit?.[compId]?.threePhaseKA;
  const violations = [];
  if (fault) {
    selected.forEach(s => {
      if (s.interruptRating && s.interruptRating < fault) {
        violations.push(`${s.name} interrupt rating ${s.interruptRating}kA < fault ${fault}kA`);
      }
    });
    if (violations.length) {
      violationDiv.innerHTML = violations.map(v => `<p>${v}</p>`).join('');
    }
  }
  const res = getStudies();
  res.duty = res.duty || {};
  if (compId) res.duty[compId] = violations;
  setStudies(res);
}

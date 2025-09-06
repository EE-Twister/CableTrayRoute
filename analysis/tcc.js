import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getItem, setItem, getOneLine, setOneLine } from '../dataStore.mjs';

const dsSelect = document.getElementById('downstream-select');
const usSelect = document.getElementById('upstream-select');
const plotBtn = document.getElementById('plot-btn');
const linkBtn = document.getElementById('link-btn');
const violationDiv = document.getElementById('violation');
const chart = d3.select('#tcc-chart');

const params = new URLSearchParams(window.location.search);
const compId = params.get('component');
const deviceParam = params.get('device');
if (compId) linkBtn.style.display = 'inline-block';

let devices = [];
const saved = getItem('tccSettings') || {};

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
    dsSelect.add(opt.cloneNode(true));
    usSelect.add(opt);
  });
  if (deviceParam) dsSelect.value = deviceParam;
  else if (saved.downstream) dsSelect.value = saved.downstream;
  if (saved.upstream) usSelect.value = saved.upstream;
}

plotBtn.addEventListener('click', () => {
  plot();
  setItem('tccSettings', { downstream: dsSelect.value, upstream: usSelect.value });
});

linkBtn.addEventListener('click', () => {
  if (!compId) return;
  const sheets = getOneLine();
  for (const sheet of sheets) {
    const comp = (sheet.components || []).find(c => c.id === compId);
    if (comp) {
      comp.tccId = dsSelect.value;
      setOneLine(sheets);
      break;
    }
  }
});

function plot() {
  chart.selectAll('*').remove();
  violationDiv.textContent = '';
  const ds = devices.find(d => d.id === dsSelect.value);
  const us = devices.find(d => d.id === usSelect.value);
  const sets = [ds, us].filter(Boolean);
  if (!sets.length) return;
  const allCurrents = sets.flatMap(s => s.curve.map(p => p.current));
  const allTimes = sets.flatMap(s => s.curve.map(p => p.time));
  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const width = +chart.attr('width') - margin.left - margin.right;
  const height = +chart.attr('height') - margin.top - margin.bottom;
  const g = chart.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const x = d3.scaleLog().domain([d3.min(allCurrents), d3.max(allCurrents)]).range([0, width]);
  const y = d3.scaleLog().domain([d3.min(allTimes), d3.max(allTimes)]).range([height, 0]);
  const line = d3.line().x(p => x(p.current)).y(p => y(p.time)).curve(d3.curveMonotoneX);
  g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x));
  g.append('g').call(d3.axisLeft(y));
  if (ds) g.append('path').datum(ds.curve).attr('fill', 'none').attr('stroke', 'steelblue').attr('stroke-width', 2).attr('d', line);
  if (us) g.append('path').datum(us.curve).attr('fill', 'none').attr('stroke', 'orange').attr('stroke-width', 2).attr('d', line);
  if (ds && us) {
    const v = findViolation(ds.curve, us.curve);
    if (v) {
      g.append('circle').attr('cx', x(v.current)).attr('cy', y(v.time)).attr('r', 5).attr('fill', 'red');
      violationDiv.textContent = `Coordination violation at ${v.current} A`;
    }
  }
}

function interpolate(curve, current) {
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    if (current >= a.current && current <= b.current) {
      const t = (current - a.current) / (b.current - a.current);
      return a.time + t * (b.time - a.time);
    }
  }
  return null;
}

function findViolation(dsCurve, usCurve) {
  for (const pt of dsCurve) {
    const tu = interpolate(usCurve, pt.current);
    if (tu !== null && tu < pt.time) {
      return { current: pt.current, time: tu };
    }
  }
  return null;
}

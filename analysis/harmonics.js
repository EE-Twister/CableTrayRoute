import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';

// Convert spectrum description to a map of harmonic order to percent
function parseSpectrum(spec) {
  const map = {};
  if (!spec) return map;
  if (Array.isArray(spec)) {
    spec.forEach((v, i) => {
      const val = Number(v);
      if (!isNaN(val) && val) map[i + 1] = val;
    });
    return map;
  }
  if (typeof spec === 'string') {
    spec.split(/[\,\s]+/).forEach(p => {
      if (!p) return;
      const parts = p.split(':');
      const order = Number(parts[0]);
      const val = Number(parts[1] || parts[0]);
      if (!isNaN(order) && !isNaN(val) && order > 1) map[order] = val;
    });
  }
  return map;
}

function limitForVoltage(kv) {
  if (kv < 69) return 5;
  if (kv < 161) return 8;
  return 12;
}

/**
 * Frequency‑domain harmonic study. For each component flagged as a harmonic
 * source, a rudimentary admittance aggregation is performed to estimate bus
 * voltage distortion per IEEE 519. Capacitor banks and tuned filters may be
 * provided as shunt admittances.
 *
 * @returns {Object<string,{ithd:number,vthd:number,limit:number,warning:boolean}>}
 */
export function runHarmonics() {
  const { sheets } = getOneLine();
  const comps = (Array.isArray(sheets[0]?.components)
    ? sheets.flatMap(s => s.components)
    : sheets).filter(c => c && c.type !== 'annotation' && c.type !== 'dimension');
  const results = {};

  comps.forEach(c => {
    if (!c.harmonicSource) return;
    const spectrum = parseSpectrum(c.harmonics);
    const V = Number(c.voltage) || (Number(c.baseKV) || 0) * 1000;
    const P = Number(c.load?.kw || c.load?.P || c.kw || 0);
    const I1 = V ? P * 1000 / (Math.sqrt(3) * V) : 0;

    // Base short‑circuit admittance if provided (scMVA) else assume 1 pu
    const scMVA = Number(c.scMVA) || 0;
    const yBase = V ? (scMVA ? scMVA / ((V / 1000) ** 2) : 1) : 1;

    // Shunt capacitor banks
    const capB = (c.capacitors || []).reduce((sum, cap) => {
      const kvar = Number(cap.kvar) || 0;
      const kv = Number(cap.kv) || (V / 1000) || 1;
      return sum + (kvar / (kv * kv));
    }, 0);

    // Tuned filters provide large admittance at a specific harmonic order
    const filterMap = {};
    (c.filters || []).forEach(f => {
      const ord = Number(f.order);
      if (!ord) return;
      const kvar = Number(f.kvar) || 0;
      const kv = Number(f.kv) || (V / 1000) || 1;
      const q = Number(f.q) || 1; // quality factor approximation
      const adm = (kvar / (kv * kv)) * q;
      filterMap[ord] = (filterMap[ord] || 0) + adm;
    });

    let i2 = 0;
    let v2 = 0;
    Object.entries(spectrum).forEach(([ordStr, pct]) => {
      const h = Number(ordStr);
      if (h <= 1) return;
      const Ih = I1 * (pct / 100);
      i2 += Ih * Ih;
      const y = yBase + capB * h + (filterMap[h] || 0);
      const Vh = y ? Ih / y : 0;
      v2 += (Vh / V) * (Vh / V);
    });

    const ithd = I1 ? Math.sqrt(i2) / I1 * 100 : 0;
    const vthd = Math.sqrt(v2) * 100;
    const limit = limitForVoltage(V / 1000);
    results[c.id] = {
      ithd: Number(ithd.toFixed(2)),
      vthd: Number(vthd.toFixed(2)),
      limit,
      warning: vthd > limit
    };
  });

  return results;
}

function ensureHarmonicResults() {
  const studies = getStudies();
  if (studies?.harmonics && Object.keys(studies.harmonics).length) {
    return studies.harmonics;
  }
  const res = runHarmonics();
  studies.harmonics = res;
  setStudies(studies);
  return res;
}

function renderChart(svgEl, data) {
  const width = Number(svgEl.getAttribute('width')) || 800;
  const height = Number(svgEl.getAttribute('height')) || 400;
  const margin = { top: 20, right: 20, bottom: 60, left: 70 };
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  if (!data.length) {
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#666')
      .text('No harmonic sources found in the active project.');
    return;
  }

  const ids = data.map(d => d.id);
  const x = d3.scaleBand().domain(ids).range([margin.left, width - margin.right]).padding(0.15);
  const yMax = d3.max(data, d => Math.max(d.thd, d.limit)) || 1;
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([height - margin.bottom, margin.top]);

  svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('transform', 'rotate(-35)')
    .style('text-anchor', 'end');

  svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickFormat(d => `${d}%`));

  svg.append('text')
    .attr('x', margin.left + (width - margin.left - margin.right) / 2)
    .attr('y', height - 10)
    .attr('text-anchor', 'middle')
    .attr('fill', '#333')
    .text('Component ID');

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(margin.top + (height - margin.top - margin.bottom) / 2))
    .attr('y', 20)
    .attr('text-anchor', 'middle')
    .attr('fill', '#333')
    .text('Voltage THD (%)');

  const groups = svg.append('g');
  groups.selectAll('rect').data(data).enter().append('rect')
    .attr('x', d => x(d.id))
    .attr('y', d => y(d.thd))
    .attr('width', x.bandwidth())
    .attr('height', d => y(0) - y(d.thd))
    .attr('fill', d => d.thd > d.limit ? 'crimson' : 'steelblue');

  groups.selectAll('line').data(data).enter().append('line')
    .attr('x1', d => x(d.id))
    .attr('x2', d => x(d.id) + x.bandwidth())
    .attr('y1', d => y(d.limit))
    .attr('y2', d => y(d.limit))
    .attr('stroke', 'orange')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '4,2');
}

if (typeof document !== 'undefined') {
  const chartEl = document.getElementById('harmonics-chart');
  if (chartEl) {
    const results = ensureHarmonicResults();
    const data = Object.entries(results).map(([id, r]) => ({ id, thd: r.vthd, limit: r.limit }));
    renderChart(chartEl, data);
  }
}

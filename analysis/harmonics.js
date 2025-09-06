import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';

function parseSpectrum(spec) {
  if (!spec) return [];
  if (Array.isArray(spec)) return spec.map(n => Number(n));
  if (typeof spec === 'string') {
    return spec.split(/[,\s]+/).map(p => {
      const parts = p.split(':');
      const val = Number(parts[1] || parts[0]);
      return isNaN(val) ? 0 : val;
    }).filter(n => n);
  }
  return [];
}

function limitForVoltage(kv) {
  if (kv < 69) return 5;
  if (kv < 161) return 8;
  return 12;
}

/**
 * Run a simple harmonic study on the one-line diagram.
 * Loads flagged as harmonic sources may provide a harmonic spectrum as
 * comma separated order:percent pairs (e.g. "5:10,7:7"). Percentages are
 * of the fundamental current. THD is computed as sqrt(sum(p^2)).
 * @returns {Object<string,{thd:number,limit:number,warning:boolean}>}
 */
export function runHarmonics() {
  const sheets = getOneLine();
  const comps = Array.isArray(sheets[0]?.components)
    ? sheets.flatMap(s => s.components)
    : sheets;
  const results = {};
  comps.forEach(c => {
    if (!c.harmonicSource) return;
    const spectrum = parseSpectrum(c.harmonics);
    const thd = Math.sqrt(spectrum.reduce((sum, p) => sum + p * p, 0));
    const kv = Number(c.voltage) || 0;
    const limit = limitForVoltage(kv);
    results[c.id] = {
      thd: Number(thd.toFixed(2)),
      limit,
      warning: thd > limit
    };
  });
  return results;
}

if (typeof document !== 'undefined') {
  const chartEl = document.getElementById('harmonics-chart');
  if (chartEl) {
    const res = runHarmonics();
    const studies = getStudies();
    studies.harmonics = res;
    setStudies(studies);
    const data = Object.entries(res).map(([id, r]) => ({ id, thd: r.thd, limit: r.limit }));
    const width = Number(chartEl.getAttribute('width')) || 800;
    const height = Number(chartEl.getAttribute('height')) || 400;
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const svg = d3.select(chartEl);
    const x = d3.scaleBand().domain(data.map(d => d.id)).range([margin.left, width - margin.right]).padding(0.1);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => Math.max(d.thd, d.limit)) || 1]).nice().range([height - margin.bottom, margin.top]);
    svg.append('g').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x));
    svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y));
    svg.selectAll('.bar').data(data).enter().append('rect')
      .attr('x', d => x(d.id))
      .attr('y', d => y(d.thd))
      .attr('width', x.bandwidth())
      .attr('height', d => y(0) - y(d.thd))
      .attr('fill', d => d.thd > d.limit ? 'crimson' : 'steelblue');
    svg.selectAll('.limit').data(data).enter().append('line')
      .attr('x1', d => x(d.id))
      .attr('x2', d => x(d.id) + x.bandwidth())
      .attr('y1', d => y(d.limit))
      .attr('y2', d => y(d.limit))
      .attr('stroke', 'orange')
      .attr('stroke-dasharray', '4,2');
  }
}

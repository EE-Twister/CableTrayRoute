import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';

function parseNum(val) {
  if (typeof val === 'number') return val;
  const m = String(val || '').match(/([0-9.]+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * Estimate voltage sag during motor starting using a simple Thevenin model.
 * Motors may define inrushMultiple, thevenin_r, thevenin_x, inertia and load_torque.
 * @returns {Object<string,{inrushKA:number,voltageSagPct:number,accelTime:number}>}
 */
export function runMotorStart() {
  const sheets = getOneLine();
  const comps = Array.isArray(sheets[0]?.components)
    ? sheets.flatMap(s => s.components)
    : sheets;
  const results = {};
  comps.forEach(c => {
    if (!(c.subtype === 'Motor' || c.motor)) return;
    const hp = parseNum(c.rating || c.hp);
    const V = Number(c.voltage) || 480;
    const pf = Number(c.pf) || 0.9;
    const eff = Number(c.efficiency) || 0.9;
    const multiple = Number(c.inrushMultiple) || 6;
    const Ifl = hp * 746 / (Math.sqrt(3) * V * pf * eff || 1);
    const Ilr = Ifl * multiple;
    const Zth = Math.hypot(Number(c.thevenin_r) || 0, Number(c.thevenin_x) || 0);
    const drop = Ilr * Zth;
    const sagPct = (drop / V) * 100;
    const inertia = Number(c.inertia) || 0;
    const loadT = Number(c.load_torque) || 0;
    const speed = Number(c.speed) || 1800;
    const torque = hp ? (hp * 746) / (2 * Math.PI * speed / 60) : 0;
    const accelT = Math.max(torque - loadT, 1);
    const wSync = 2 * Math.PI * speed / 60;
    const t = inertia ? (inertia * wSync) / accelT : 0;
    results[c.id] = {
      inrushKA: Number((Ilr / 1000).toFixed(2)),
      voltageSagPct: Number(sagPct.toFixed(2)),
      accelTime: Number(t.toFixed(2))
    };
  });
  return results;
}

if (typeof document !== 'undefined') {
  const chartEl = document.getElementById('motorstart-chart');
  if (chartEl) {
    const res = runMotorStart();
    const studies = getStudies();
    studies.motorStart = res;
    setStudies(studies);
    const data = Object.entries(res).map(([id, r]) => ({ id, sag: r.voltageSagPct }));
    const width = Number(chartEl.getAttribute('width')) || 800;
    const height = Number(chartEl.getAttribute('height')) || 400;
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const svg = d3.select(chartEl);
    const x = d3.scaleBand().domain(data.map(d => d.id)).range([margin.left, width - margin.right]).padding(0.1);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.sag) || 1]).nice().range([height - margin.bottom, margin.top]);
    svg.append('g').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x));
    svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y));
    svg.selectAll('.bar').data(data).enter().append('rect')
      .attr('x', d => x(d.id))
      .attr('y', d => y(d.sag))
      .attr('width', x.bandwidth())
      .attr('height', d => y(0) - y(d.sag))
      .attr('fill', 'steelblue');
  }
}

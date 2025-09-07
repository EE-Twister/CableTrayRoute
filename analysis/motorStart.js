import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';

function parseNum(val) {
  if (typeof val === 'number') return val;
  const m = String(val || '').match(/([0-9.]+)/);
  return m ? Number(m[1]) : 0;
}

// Parse load torque curve formatted as "speedPct:torquePct" pairs
function parseTorqueCurve(spec) {
  if (!spec) return () => 0;
  const pts = [];
  if (Array.isArray(spec)) {
    spec.forEach(p => {
      const [s, t] = p.split(':');
      pts.push({ s: Number(s), t: Number(t) });
    });
  } else if (typeof spec === 'string') {
    spec.split(/[\,\s]+/).forEach(p => {
      if (!p) return;
      const [s, t] = p.split(':');
      pts.push({ s: Number(s), t: Number(t) });
    });
  }
  pts.sort((a, b) => a.s - b.s);
  return (speedFrac) => {
    const sp = speedFrac * 100;
    let p1 = pts[0] || { s: 0, t: 0 };
    let p2 = pts[pts.length - 1] || { s: 100, t: 100 };
    for (let i = 0; i < pts.length - 1; i++) {
      if (sp >= pts[i].s && sp <= pts[i + 1].s) {
        p1 = pts[i];
        p2 = pts[i + 1];
        break;
      }
    }
    const ratio = (sp - p1.s) / ((p2.s - p1.s) || 1);
    const torquePct = p1.t + (p2.t - p1.t) * ratio;
    return torquePct / 100;
  };
}

/**
 * Estimate voltage sag during motor starting using a simple Thevenin model.
 * Motors may define inrushMultiple, thevenin_r, thevenin_x, inertia and load_torque.
 * @returns {Object<string,{inrushKA:number,voltageSagPct:number,accelTime:number}>}
 */
export function runMotorStart() {
  const { sheets } = getOneLine();
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
    const inertia = Number(c.inertia) || 0;
    const speed = Number(c.speed) || 1800;
    const baseTorque = hp ? (hp * 746) / (2 * Math.PI * speed / 60) : 0;
    const loadCurve = parseTorqueCurve(c.load_torque_curve || c.load_torque);

    let w = 0; // mechanical speed rad/s
    const wSync = 2 * Math.PI * speed / 60;
    const dt = 0.01;
    let time = 0;
    let maxDrop = 0;
    while (w < wSync && time < 60) {
      const slip = Math.max(1 - w / wSync, 0.001);
      let I = Ilr * slip;
      let Vdrop = I * Zth;
      let Vterm = V - Vdrop;
      I = Ilr * slip * (Vterm / V);
      Vdrop = I * Zth;
      Vterm = V - Vdrop;
      const Tm = baseTorque * (Vterm / V) * (Vterm / V) * slip;
      const Tl = baseTorque * loadCurve(w / wSync);
      const accel = inertia ? (Tm - Tl) / inertia : 0;
      w += accel * dt;
      time += dt;
      if (Vdrop > maxDrop) maxDrop = Vdrop;
      if (slip < 0.01) break;
    }
    const sagPct = (maxDrop / V) * 100;
    results[c.id] = {
      inrushKA: Number((Ilr / 1000).toFixed(2)),
      voltageSagPct: Number(sagPct.toFixed(2)),
      accelTime: Number(time.toFixed(2))
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

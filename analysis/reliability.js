import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';
let d3;
if (typeof document !== 'undefined') {
  d3 = await import('https://cdn.jsdelivr.net/npm/d3@7/+esm');
}

const VISUAL_TYPES = new Set(['dimension', 'annotation']);

function isVisualComponent(comp) {
  return comp ? VISUAL_TYPES.has(comp.type) : false;
}

function isConnectorComponent(comp) {
  if (!comp) return false;
  const type = (comp.type || '').toLowerCase();
  if (!type) return false;
  if (type.includes('link')) return true;
  if (type.includes('cable')) return true;
  if (type.includes('feeder')) return true;
  if (type.includes('conductor')) return true;
  if (type.includes('tap')) return true;
  if (type.includes('splice')) return true;
  return false;
}

export function runReliability(components = []) {
  // Filter out non-operational components like dimensions or annotations
  const ops = components.filter(c => !isVisualComponent(c));
  const eligible = ops.filter(c => !isConnectorComponent(c));
  // Compute component availability and expected downtime per year
  const componentStats = {};
  const availMap = {};
  eligible.forEach(c => {
    const mtbf = Number(c.mtbf);
    const mttr = Number(c.mttr);
    if (mtbf > 0 && mttr >= 0) {
      const availability = mtbf / (mtbf + mttr);
      // expected downtime hours per year
      const downtime = (8760 / mtbf) * mttr;
      componentStats[c.id] = { availability, downtime };
      availMap[c.id] = { p: availability, q: 1 - availability };
    }
  });

  const expectedOutage = Object.values(componentStats).reduce((sum, s) => sum + s.downtime, 0);

  // Minimal cut set probabilities up to N-2
  const baseProd = Object.values(availMap).reduce((p, v) => p * v.p, 1) || 1;
  const n1Failures = [];
  const n2Failures = [];
  const n1Impacts = [];
  const n2Impacts = [];
  const n1FailureDetails = {};
  const unavailability = n1Impacts.reduce((s, i) => s + i.probability, 0)
    + n2Impacts.reduce((s, i) => s + i.probability, 0);
  const systemAvailability = 1 - unavailability;

  return {
    systemAvailability,
    expectedOutage,
    componentStats,
    n1Failures,
    n2Failures,
    n1Impacts,
    n2Impacts,
    n1FailureDetails
  };
}

if (typeof document !== 'undefined') {
  const chartEl = document.getElementById('reliability-chart');
  if (chartEl) {
    const { sheets } = getOneLine();
    const comps = Array.isArray(sheets[0]?.components)
      ? sheets.flatMap(s => s.components)
      : sheets;
    const res = runReliability(comps);
    const studies = getStudies();
    studies.reliability = res;
    setStudies(studies);
    const data = Object.entries(res.componentStats).map(([id, s]) => ({ id, avail: s.availability }));
    const width = Number(chartEl.getAttribute('width')) || 800;
    const height = Number(chartEl.getAttribute('height')) || 400;
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const svg = d3.select(chartEl);
    const x = d3.scaleBand().domain(data.map(d => d.id)).range([margin.left, width - margin.right]).padding(0.1);
    const y = d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);
    svg.append('g').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x));
    svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y));
    svg.selectAll('.bar').data(data).enter().append('rect')
      .attr('x', d => x(d.id))
      .attr('y', d => y(d.avail))
      .attr('width', x.bandwidth())
      .attr('height', d => y(0) - y(d.avail))
      .attr('fill', 'steelblue');
  }
}

import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';
import { resolveComponentLabel } from '../utils/componentLabels.js';
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
  const connectorIds = new Set(ops.filter(isConnectorComponent).map(c => c.id));
  const compMap = new Map(ops.map(c => [c.id, c]));
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

  // Build undirected adjacency map
  const adj = new Map();
  ops.forEach(c => adj.set(c.id, new Set()));
  ops.forEach(c => {
    (c.connections || []).forEach(conn => {
      if (compMap.has(conn.target)) {
        adj.get(c.id).add(conn.target);
        adj.get(conn.target).add(c.id);
      }
    });
  });

  function computeIslands(exclude = []) {
    const excludeSet = new Set(exclude);
    const nodes = ops.map(c => c.id).filter(id => !excludeSet.has(id));
    const visited = new Set();
    const islands = [];
    nodes.forEach(start => {
      if (visited.has(start)) return;
      const stack = [start];
      const group = [];
      while (stack.length) {
        const node = stack.pop();
        if (visited.has(node) || excludeSet.has(node)) continue;
        visited.add(node);
        group.push(node);
        adj.get(node)?.forEach(next => {
          if (!visited.has(next) && !excludeSet.has(next)) stack.push(next);
        });
      }
      if (group.length) islands.push(group);
    });
    return islands;
  }

  function isConnected(exclude = []) {
    return computeIslands(exclude).length <= 1;
  }

  const labelFor = id => {
    const comp = compMap.get(id);
    return resolveComponentLabel(comp, id);
  };

  const n1Failures = [];
  const n1FailureDetails = {};
  eligible.forEach(c => {
    const islands = computeIslands([c.id]);
    if (islands.length <= 1) return;
    n1Failures.push(c.id);
    const sorted = islands.slice().sort((a, b) => b.length - a.length);
    const impactedIslands = sorted.slice(1);
    const impactedIds = impactedIslands.flat().filter(id => !connectorIds.has(id));
    n1FailureDetails[c.id] = {
      islands,
      impactedIds,
      impactedLabels: impactedIds.map(labelFor),
      impactedCount: impactedIds.length
    };
  });

  const n2Failures = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      if (!isConnected([eligible[i].id, eligible[j].id])) {
        n2Failures.push([eligible[i].id, eligible[j].id]);
      }
    }
  }

  // Minimal cut set probabilities up to N-2
  const baseProd = Object.values(availMap).reduce((p, v) => p * v.p, 1) || 1;
  const n1Impacts = n1Failures.map(id => ({
    components: [id],
    probability: availMap[id] ? availMap[id].q * (baseProd / availMap[id].p) : 0
  }));
  const n2Impacts = n2Failures.map(([a, b]) => ({
    components: [a, b],
    probability: (availMap[a] && availMap[b])
      ? availMap[a].q * availMap[b].q * (baseProd / (availMap[a].p * availMap[b].p))
      : 0
  }));
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

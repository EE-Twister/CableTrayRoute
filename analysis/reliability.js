const VISUAL_TYPES = new Set(['dimension', 'annotation']);

function isVisualComponent(comp) {
  return comp ? VISUAL_TYPES.has(comp.type) : false;
}

function pickValue(comp, key) {
  if (!comp || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(comp, key)) {
    return comp[key];
  }
  if (comp.props && typeof comp.props === 'object' && Object.prototype.hasOwnProperty.call(comp.props, key)) {
    return comp.props[key];
  }
  return undefined;
}

function buildAdjacency(components = [], skipIds = new Set()) {
  const adj = new Map();
  components.forEach(c => {
    if (!c?.id || skipIds.has(c.id)) return;
    adj.set(c.id, new Set());
  });
  components.forEach(c => {
    if (!c?.id || skipIds.has(c.id)) return;
    (c.connections || []).forEach(conn => {
      const target = conn?.target;
      if (!target || skipIds.has(target) || !adj.has(target)) return;
      adj.get(c.id).add(target);
      adj.get(target).add(c.id);
    });
  });
  return adj;
}

function findConnected(startIds = [], adj = new Map()) {
  const visited = new Set();
  const queue = [...startIds.filter(id => adj.has(id))];
  queue.forEach(id => visited.add(id));
  while (queue.length) {
    const id = queue.shift();
    (adj.get(id) || []).forEach(next => {
      if (visited.has(next)) return;
      visited.add(next);
      queue.push(next);
    });
  }
  return visited;
}

export function runReliability(components = []) {
  // Filter out non-operational components like dimensions or annotations
  const ops = components.filter(c => !isVisualComponent(c));
  const eligible = ops;
  // Compute component availability and expected downtime per year
  const componentStats = {};
  const availMap = {};
  eligible.forEach(c => {
    const mtbf = Number(pickValue(c, 'mtbf'));
    const mttr = Number(pickValue(c, 'mttr'));
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

  const diagram = ops.filter(c => c && c.id);
  const busIds = diagram.filter(c => c.type === 'bus').map(c => c.id);
  const sourceIds = diagram
    .filter(c => ['source', 'utility', 'generator', 'swing'].includes(`${c.type || ''}`.toLowerCase()))
    .map(c => c.id);
  const baselineAdj = buildAdjacency(diagram);
  const baselineInbound = new Map(busIds.map(id => [id, 0]));
  diagram.forEach(c => (c.connections || []).forEach(conn => {
    if (baselineInbound.has(conn?.target)) baselineInbound.set(conn.target, (baselineInbound.get(conn.target) || 0) + 1);
  }));
  const implicitSources = busIds.filter(id => (baselineInbound.get(id) || 0) === 0 && (baselineAdj.get(id)?.size || 0) > 0);
  const fallbackSources = busIds.length ? [busIds[0]] : [];
  const startIds = [...new Set([...(sourceIds.length ? sourceIds : (implicitSources.length ? implicitSources : fallbackSources))])];

  if (startIds.length) {
    eligible.forEach(component => {
      const failedId = component.id;
      if (startIds.includes(failedId)) return;
      const connected = findConnected(startIds.filter(id => id !== failedId), buildAdjacency(diagram, new Set([failedId])));
      const impactedLoads = diagram
        .filter(c => c.type === 'bus' && c.id !== failedId && !connected.has(c.id) && (baselineAdj.get(c.id)?.size || 0) > 0)
        .map(c => c.id);
      if (!impactedLoads.length) return;
      n1Failures.push(failedId);
      const pEntry = availMap[failedId];
      const probability = pEntry
        ? (pEntry.q / Math.max(pEntry.p, 1e-12)) * baseProd
        : 0;
      n1Impacts.push({ failed: [failedId], impacted: impactedLoads, probability });
      n1FailureDetails[failedId] = { isolatedLoads: impactedLoads };
    });
  }

  const unavailability = n1Impacts.reduce((s, i) => s + i.probability, 0)
    + n2Impacts.reduce((s, i) => s + i.probability, 0);
  const systemAvailability = Math.max(0, 1 - unavailability);

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

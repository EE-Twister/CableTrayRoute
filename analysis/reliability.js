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

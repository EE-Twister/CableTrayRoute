export function runReliability(components = []) {
  // Filter out non-operational components like dimensions
  const ops = components.filter(c => c.type !== 'dimension');
  const compMap = new Map(ops.map(c => [c.id, c]));
  // Compute component availability and expected downtime per year
  const componentStats = {};
  ops.forEach(c => {
    const mtbf = Number(c.mtbf);
    const mttr = Number(c.mttr);
    if (mtbf > 0 && mttr >= 0) {
      const availability = mtbf / (mtbf + mttr);
      // expected downtime hours per year
      const downtime = (8760 / mtbf) * mttr;
      componentStats[c.id] = { availability, downtime };
    }
  });

  // System availability is product of component availabilities
  let systemAvailability = 1;
  Object.values(componentStats).forEach(s => {
    systemAvailability *= s.availability;
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

  function isConnected(exclude = []) {
    const excludeSet = new Set(exclude);
    const nodes = ops.map(c => c.id).filter(id => !excludeSet.has(id));
    if (!nodes.length) return true;
    const visited = new Set();
    const stack = [nodes[0]];
    while (stack.length) {
      const n = stack.pop();
      if (visited.has(n) || excludeSet.has(n)) continue;
      visited.add(n);
      adj.get(n)?.forEach(m => {
        if (!visited.has(m) && !excludeSet.has(m)) stack.push(m);
      });
    }
    return visited.size === nodes.length;
  }

  const n1Failures = [];
  ops.forEach(c => {
    if (!isConnected([c.id])) n1Failures.push(c.id);
  });

  const n2Failures = [];
  for (let i = 0; i < ops.length; i++) {
    for (let j = i + 1; j < ops.length; j++) {
      if (!isConnected([ops[i].id, ops[j].id])) {
        n2Failures.push([ops[i].id, ops[j].id]);
      }
    }
  }

  return { systemAvailability, expectedOutage, componentStats, n1Failures, n2Failures };
}

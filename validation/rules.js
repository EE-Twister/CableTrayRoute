import { resolveComponentLabel } from '../utils/componentLabels.js';

export function runValidation(components = [], studies = {}) {
  const issues = [];
  const componentLookup = new Map(components.map(c => [c.id, c]));
  const describe = id => {
    const comp = componentLookup.get(id);
    return resolveComponentLabel(comp, id);
  };

  // Map inbound connections for bus connectivity check
  const inbound = new Map();
  components.forEach(c => {
    if (c.type === 'bus') inbound.set(c.id, 0);
  });
  components.forEach(c => {
    (c.connections || []).forEach(conn => {
      if (inbound.has(conn.target)) {
        inbound.set(conn.target, (inbound.get(conn.target) || 0) + 1);
      }
    });
  });
  inbound.forEach((cnt, id) => {
    const comp = componentLookup.get(id);
    const outbound = Array.isArray(comp?.connections)
      ? comp.connections.filter(conn => conn && conn.target).length
      : 0;
    if (cnt === 0 && outbound === 0) {
      issues.push({ component: id, message: 'Unconnected bus' });
    }
  });

  // Transformer loading check
  components.forEach(c => {
    if (c.type !== 'transformer') return;
    const load = Number(c.load_kva || c.load || 0);
    const rating = Number(c.kva || c.rating || 0);
    if (rating && load > rating) {
      issues.push({ component: c.id, message: `Transformer overloaded (${load}kVA > ${rating}kVA)` });
    }
  });

  // Breaker interrupting rating check
  components.forEach(c => {
    if (c.type !== 'breaker') return;
    const interrupt = Number(c.interrupt_rating || 0);
    const fault = Number(c.fault_current || 0);
    if (interrupt && fault > interrupt) {
      issues.push({ component: c.id, message: `Breaker interrupt rating exceeded (${fault}A > ${interrupt}A)` });
    }
  });

  // TCC duty/coordination violations from studies
  Object.entries(studies.duty || {}).forEach(([id, msgs = []]) => {
    msgs.forEach(msg => issues.push({ component: id, message: msg }));
  });

  return issues;
}

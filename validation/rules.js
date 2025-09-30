export function runValidation(components = [], studies = {}) {
  const issues = [];
  const componentLookup = new Map(components.map(c => [c.id, c]));
  const describe = id => {
    const comp = componentLookup.get(id);
    return comp?.label || comp?.name || comp?.id || id;
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
    if (cnt === 0) {
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

  // Single point of failure warnings from reliability study
  if (Array.isArray(studies.reliability?.n1Failures)) {
    const detailMap = studies.reliability.n1FailureDetails || {};
    studies.reliability.n1Failures.forEach(id => {
      const detail = detailMap[id];
      if (detail?.impactedIds?.length) {
        const count = detail.impactedIds.length;
        const sample = detail.impactedLabels?.length
          ? detail.impactedLabels.slice(0, 3)
          : detail.impactedIds.slice(0, 3).map(describe);
        const remainder = count - sample.length;
        const list = sample.join(', ');
        const suffix = remainder > 0 ? ', …' : '';
        issues.push({
          component: id,
          message: `Single point of failure: isolates ${count} component${count === 1 ? '' : 's'} (${list}${suffix})`
        });
      } else {
        issues.push({ component: id, message: 'Single point of failure' });
      }
    });
  }

  return issues;
}

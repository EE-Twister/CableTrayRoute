function text(value) {
  return String(value ?? '').trim();
}

function conduitId(conduit = {}) {
  return text(conduit.conduit_id || conduit.id || conduit.tag);
}

function ductbankId(ductbank = {}) {
  return text(ductbank.ductbank_id || ductbank.id || ductbank.tag);
}

function normalizeConduitType(conduit = {}) {
  const value = text(conduit.conduit_type || conduit.type || conduit.material);
  const normalized = value.toLowerCase().replace(/[-_]+/g, ' ');
  if (normalized.includes('pvc') && normalized.includes('80')) return 'PVC Sch 80';
  if (normalized.includes('pvc')) return 'PVC Sch 40';
  if (normalized.includes('rmc') || normalized.includes('rigid') || normalized.includes('steel')) return 'RMC';
  if (normalized.includes('emt')) return 'EMT';
  return value;
}

function cableAssignments(cable = {}) {
  const values = [cable.conduit_id, cable.conduit, cable.raceway_id, cable.route_preference];
  if (Array.isArray(cable.raceway_ids)) values.push(...cable.raceway_ids);
  else if (cable.raceway_ids) values.push(...text(cable.raceway_ids).split(','));
  return values.map(text).filter(Boolean);
}

export function listProjectConduits({ conduits = [], ductbanks = [] } = {}) {
  const byId = new Map();
  (Array.isArray(conduits) ? conduits : []).forEach(conduit => {
    const id = conduitId(conduit);
    if (id) byId.set(id, { ...conduit, conduit_id: id, ductbank_id: text(conduit.ductbank_id || conduit.parent_id) });
  });
  (Array.isArray(ductbanks) ? ductbanks : []).forEach(ductbank => {
    const parentId = ductbankId(ductbank);
    (Array.isArray(ductbank.conduits) ? ductbank.conduits : []).forEach(conduit => {
      const id = conduitId(conduit);
      if (!id) return;
      byId.set(id, {
        ...(byId.get(id) || {}),
        ...conduit,
        conduit_id: id,
        ductbank_id: parentId,
      });
    });
  });
  return Array.from(byId.values());
}

export function buildProjectConduitFillContext({ conduits = [], ductbanks = [], cables = [], selectedConduitId = '' } = {}) {
  const availableConduits = listProjectConduits({ conduits, ductbanks });
  const cablesByConduit = new Map();
  (Array.isArray(cables) ? cables : []).forEach(cable => {
    cableAssignments(cable).forEach(assignment => {
      if (!cablesByConduit.has(assignment)) cablesByConduit.set(assignment, []);
      cablesByConduit.get(assignment).push(cable);
    });
  });
  const requested = text(selectedConduitId);
  const selected = availableConduits.find(conduit => conduitId(conduit) === requested)
    || availableConduits.find(conduit => (cablesByConduit.get(conduitId(conduit)) || []).length)
    || availableConduits[0]
    || null;
  if (!selected) return null;
  const id = conduitId(selected);
  return {
    conduitId: id,
    ductbankId: text(selected.ductbank_id),
    type: normalizeConduitType(selected),
    tradeSize: text(selected.trade_size || selected.size),
    cables: cablesByConduit.get(id) || [],
    availableConduits: availableConduits.map(conduit => ({
      id: conduitId(conduit),
      ductbankId: text(conduit.ductbank_id),
      type: normalizeConduitType(conduit),
      tradeSize: text(conduit.trade_size || conduit.size),
      cableCount: (cablesByConduit.get(conduitId(conduit)) || []).length,
    })),
  };
}

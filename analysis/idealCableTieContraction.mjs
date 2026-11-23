const magnitudeSquared = value => value.re * value.re + value.im * value.im;
const add = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const subtract = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const multiply = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const scale = (a, value) => ({ re: a.re * value, im: a.im * value });
const conjugate = value => ({ re: value.re, im: -value.im });
const divide = (a, b) => {
  const denominator = magnitudeSquared(b);
  return denominator > 0 ? { re: (a.re * b.re + a.im * b.im) / denominator, im: (a.im * b.re - a.re * b.im) / denominator } : { re: 0, im: 0 };
};
const explicitFinite = value => value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '') && Number.isFinite(Number(value));
const exactZero = impedance => explicitFinite(impedance?.r) && explicitFinite(impedance?.x) && Number(impedance.r) === 0 && Number(impedance.x) === 0;
const isCable = connection => String(connection?.componentType || '').toLowerCase() === 'cable' || String(connection?.componentSubtype || '').toLowerCase().includes('cable');
const id = value => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const tieConnectionKey = (from, to, componentId) => `${String(from)}\u0000${String(to)}\u0000${String(componentId || '')}`;

function controlKind(bus) {
  const type = String(bus?.type || '').toLowerCase();
  if (type === 'pv' || bus?.ibrProfile || bus?.voltVarEnabled || bus?.volt_var_enabled || type.includes('ibr')) return 'controlled';
  if (type === 'slack') return 'slack';
  if (type === 'pq') return 'pq';
  return 'unsupported';
}

function clone(bus) {
  return typeof structuredClone === 'function' ? structuredClone(bus) : JSON.parse(JSON.stringify(bus));
}

/**
 * Contract supported exact zero-ohm cable ties before Newton iteration.
 * Ties must form forests on a common voltage base and may not merge PV/IBR
 * controls or multiple slack buses. Unsupported tie topologies are returned as
 * diagnostics so callers cannot silently treat a large admittance as exact.
 */
export function contractIdealCableTies(buses = []) {
  if (!Array.isArray(buses)) return { status: 'unsupported', reason: 'Bus collection is not an array.' };
  const byId = new Map();
  for (const bus of buses) {
    const key = id(bus?.id);
    if (!key || byId.has(key)) return { status: 'unsupported', reason: 'Bus identities must be unique to contract ideal cable ties.' };
    byId.set(key, bus);
  }
  const ties = [];
  const seenComponent = new Map();
  for (const bus of buses) {
    for (const connection of bus.connections || []) {
      if (!isCable(connection)) continue;
      const impedance = connection?.impedance || connection?.cable || {};
      const zero = explicitFinite(impedance.r) && explicitFinite(impedance.x) && Number(impedance.r) === 0 && Number(impedance.x) === 0;
      if (!zero) continue;
      if (!exactZero(impedance)) return { status: 'unsupported', reason: `Cable tie ${connection.componentId || connection.id || '(unidentified)'} lacks an explicit finite zero-ohm impedance.` };
      const from = String(bus.id);
      const to = String(connection.target || '');
      if (!byId.has(to) || to === from) return { status: 'unsupported', reason: `Cable tie ${connection.componentId || connection.id || '(unidentified)'} has a missing or self-referenced endpoint.` };
      const tap = connection.tap;
      const tapRatio = Number(tap?.ratio ?? tap ?? 1);
      const tapAngle = Number(tap?.angle ?? 0);
      const shunt = connection.shunt;
      const shuntValues = ['from', 'to'].flatMap(side => ['g', 'b'].map(field => shunt?.[side]?.[field]))
        .filter(value => value !== undefined);
      const shuntInvalid = shuntValues.some(value => value === null || !Number.isFinite(Number(value)) || Number(value) !== 0);
      if (!Number.isFinite(tapRatio) || !Number.isFinite(tapAngle) || shuntInvalid
        || Math.abs(tapRatio - 1) > 1e-12 || Math.abs(tapAngle) > 1e-12) {
        return { status: 'unsupported', reason: `Cable tie ${connection.componentId || connection.id || '(unidentified)'} has a tap or shunt and cannot be contracted as an ideal wire.` };
      }
      const componentId = id(connection.componentId || connection.id) || `${from}->${to}`;
      const prior = seenComponent.get(componentId);
      if (prior) {
        if (!((prior.from === from && prior.to === to) || (prior.from === to && prior.to === from))) return { status: 'unsupported', reason: `Cable identity ${componentId} is attached to inconsistent tie endpoints.` };
        continue;
      }
      seenComponent.set(componentId, { from, to });
      const edge = { id: componentId, componentId, from, to, connection };
      ties.push(edge);
    }
  }
  if (!ties.length) return { status: 'none', buses };

  const parent = new Map([...byId.keys()].map(key => [key, key]));
  const find = key => {
    const current = parent.get(key);
    if (current === key) return key;
    const root = find(current);
    parent.set(key, root);
    return root;
  };
  for (const edge of ties) {
    const fromRoot = find(edge.from);
    const toRoot = find(edge.to);
    if (fromRoot === toRoot) return { status: 'unsupported', reason: `Exact zero-ohm cable ties contain a cycle at ${edge.componentId}; current division is indeterminate.` };
    parent.set(toRoot, fromRoot);
  }
  const groups = new Map();
  for (const bus of buses) {
    const root = find(String(bus.id));
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(bus);
  }
  const representativeById = new Map();
  const contractedBuses = [];
  for (const members of groups.values()) {
    if (members.length > 1) {
      const bases = members.map(bus => Number(bus.baseKV));
      if (bases.some(base => !Number.isFinite(base) || base <= 0 || Math.abs(base - bases[0]) > Math.max(1e-12, Math.abs(bases[0]) * 1e-12))) {
        return { status: 'unsupported', reason: `Exact zero-ohm cable tie group ${members.map(bus => bus.id).join(', ')} spans conflicting voltage bases.` };
      }
      const kinds = members.map(controlKind);
      if (kinds.some(kind => kind === 'controlled' || kind === 'unsupported') || kinds.filter(kind => kind === 'slack').length > 1) {
        return { status: 'unsupported', reason: `Exact zero-ohm cable tie group ${members.map(bus => bus.id).join(', ')} merges unsupported voltage controls.` };
      }
    }
    const representative = members.find(bus => controlKind(bus) === 'slack') || members[0];
    const contracted = clone(representative);
    contracted.connections = [];
    contracted.Pd = members.reduce((sum, bus) => sum + (Number(bus.Pd) || 0), 0);
    contracted.Qd = members.reduce((sum, bus) => sum + (Number(bus.Qd) || 0), 0);
    contracted.Pg = members.reduce((sum, bus) => sum + (Number(bus.Pg) || 0), 0);
    contracted.Qg = members.reduce((sum, bus) => sum + (Number(bus.Qg) || 0), 0);
    const shuntMembers = members.map(bus => bus.shunt).filter(Boolean);
    if (shuntMembers.length) contracted.shunt = shuntMembers.reduce((sum, shunt) => ({ g: sum.g + (Number(shunt.g) || 0), b: sum.b + (Number(shunt.b) || 0) }), { g: 0, b: 0 });
    for (const bus of members) representativeById.set(String(bus.id), String(representative.id));
    contractedBuses.push(contracted);
  }
  const tieIds = new Set(ties.map(edge => edge.componentId));
  for (const bus of buses) {
    const from = representativeById.get(String(bus.id));
    const targetBus = contractedBuses.find(candidate => String(candidate.id) === from);
    for (const connection of bus.connections || []) {
      const to = representativeById.get(String(connection.target || ''));
      const componentId = id(connection.componentId || connection.id) || `${bus.id}->${connection.target}`;
      if (tieIds.has(componentId)) continue;
      if (to === from) return { status: 'unsupported', reason: `Contracting exact cable ties would collapse non-ideal branch ${componentId} into a self-loop.` };
      targetBus.connections.push({ ...connection, target: to });
    }
  }
  return { status: 'contracted', buses: contractedBuses, ties, representativeById };
}

function complexVoltage(vm, va) { return { re: vm * Math.cos(va), im: vm * Math.sin(va) }; }
function perUnitAdmittance(admittance, baseKV, baseMVA) {
  const scaleBy = (baseKV * baseKV) / baseMVA;
  return { re: (Number(admittance?.g) || 0) * scaleBy, im: (Number(admittance?.b) || 0) * scaleBy };
}
function terminalCurrents(fromVoltage, toVoltage, connection, fromBaseKV, toBaseKV, baseMVA) {
  const impedance = connection.impedance || connection.cable || {};
  const baseZ = fromBaseKV * fromBaseKV / baseMVA;
  const z = { re: (Number(impedance.r) || 0) / baseZ, im: (Number(impedance.x) || 0) / baseZ };
  const denominator = magnitudeSquared(z);
  if (!(denominator > 0)) return null;
  const y = { re: z.re / denominator, im: -z.im / denominator };
  const tapRatio = Number(connection.tap?.ratio ?? connection.tap ?? 1) || 1;
  const tapAngle = (Number(connection.tap?.angle) || 0) * Math.PI / 180;
  const tap = { re: tapRatio * Math.cos(tapAngle), im: tapRatio * Math.sin(tapAngle) };
  const viPrime = divide(fromVoltage, tap);
  const series = multiply(subtract(viPrime, toVoltage), y);
  const yFrom = connection.shunt?.from ? perUnitAdmittance(connection.shunt.from, fromBaseKV, baseMVA) : { re: 0, im: 0 };
  const yTo = connection.shunt?.to ? perUnitAdmittance(connection.shunt.to, toBaseKV, baseMVA) : { re: 0, im: 0 };
  const currentFrom = divide(add(series, multiply(viPrime, yFrom)), conjugate(tap));
  const currentTo = subtract(multiply(add(y, yTo), toVoltage), multiply(y, viPrime));
  return { currentFrom, currentTo };
}

/** Recover exact ideal-tie currents by KCL over each unique cable-tree cut. */
export function recoverIdealCableTieCurrents(plan, buses, vm, va, specifiedP, specifiedQ, baseMVA) {
  if (plan?.status !== 'contracted') return { currents: new Map(), issues: [] };
  const indexById = new Map(buses.map((bus, index) => [String(bus.id), index]));
  const residuals = new Map(buses.map(bus => [String(bus.id), { re: 0, im: 0 }]));
  for (let index = 0; index < buses.length; index += 1) {
    const bus = buses[index];
    const voltage = complexVoltage(vm[index], va[index]);
    const injection = conjugate({ re: specifiedP[index], im: specifiedQ[index] });
    const netInjectionCurrent = divide(injection, conjugate(voltage));
    let residual = scale(netInjectionCurrent, -1);
    if (bus.shunt) residual = add(residual, multiply(perUnitAdmittance(bus.shunt, bus.baseKV, baseMVA), voltage));
    for (const connection of bus.connections || []) {
      const componentId = id(connection.componentId || connection.id) || `${bus.id}->${connection.target}`;
      if (plan.ties.some(edge => edge.componentId === componentId)) continue;
      const targetIndex = indexById.get(String(connection.target));
      if (targetIndex === undefined) continue;
      const terminals = terminalCurrents(voltage, complexVoltage(vm[targetIndex], va[targetIndex]), connection, bus.baseKV, buses[targetIndex].baseKV, baseMVA);
      if (!terminals) continue;
      residual = add(residual, terminals.currentFrom);
      residuals.set(String(connection.target), add(residuals.get(String(connection.target)), terminals.currentTo));
    }
    residuals.set(String(bus.id), add(residuals.get(String(bus.id)), residual));
  }
  const adjacency = new Map(buses.map(bus => [String(bus.id), []]));
  for (const edge of plan.ties) {
    adjacency.get(edge.from)?.push({ id: edge.to, edge });
    adjacency.get(edge.to)?.push({ id: edge.from, edge });
  }
  const currents = new Map();
  const visited = new Set();
  for (const candidate of adjacency.keys()) {
    if (visited.has(candidate)) continue;
    const component = [];
    const componentStack = [candidate];
    const componentSeen = new Set([candidate]);
    while (componentStack.length) {
      const current = componentStack.pop();
      component.push(current);
      for (const next of adjacency.get(current) || []) if (!componentSeen.has(next.id)) { componentSeen.add(next.id); componentStack.push(next.id); }
    }
    const root = component.find(busId => String(buses[indexById.get(busId)]?.type || '').toLowerCase() === 'slack') || candidate;
    const parent = new Map([[root, null]]);
    const parentEdge = new Map();
    const order = [root];
    visited.add(root);
    for (let cursor = 0; cursor < order.length; cursor += 1) {
      const busId = order[cursor];
      for (const next of adjacency.get(busId) || []) {
        if (visited.has(next.id)) continue;
        visited.add(next.id);
        parent.set(next.id, busId);
        parentEdge.set(next.id, next.edge);
        order.push(next.id);
      }
    }
    const subtree = new Map(order.map(busId => [busId, residuals.get(busId) || { re: 0, im: 0 }]));
    for (let cursor = order.length - 1; cursor > 0; cursor -= 1) {
      const child = order[cursor];
      const parentId = parent.get(child);
      const edge = parentEdge.get(child);
      const currentParentToChild = subtree.get(child);
      const edgeId = edge.componentId;
      const forward = edge.from === parentId && edge.to === child;
      currents.set(tieConnectionKey(edge.from, edge.to, edgeId), forward ? currentParentToChild : scale(currentParentToChild, -1));
      currents.set(tieConnectionKey(edge.to, edge.from, edgeId), forward ? scale(currentParentToChild, -1) : currentParentToChild);
      subtree.set(parentId, add(subtree.get(parentId), currentParentToChild));
    }
  }
  for (const [key, value] of currents) if (![value.re, value.im].every(Number.isFinite)) return { currents: new Map(), issues: [{ code: 'ideal_tie_current_nonfinite', message: `Recovered ideal tie current is nonfinite for ${key}.` }] };
  return { currents, issues: [] };
}

export function getIdealCableTieCurrent(currents, from, to, componentId) {
  return currents?.get(tieConnectionKey(from, to, componentId)) || null;
}

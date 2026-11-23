import { runLoadFlow } from './loadFlow.js';

/** Eliminate exact, same-voltage ideal cable ties before Newton iteration.
 * Restore their individual bus voltages and currents by complex-power balance.
 * No physical impedance or convergence tolerance is changed.
 */
export function runMotorStartingNetwork(model, options) {
  const buses = new Map(model.buses.map(bus => [bus.id, bus]));
  const parent = new Map([...buses.keys()].map(id => [id, id]));
  function representative(id) {
    if (parent.get(id) !== id) parent.set(id, representative(parent.get(id)));
    return parent.get(id);
  }
  const ties = new Set();
  for (const branch of model.branches) {
    const ratio = branch.tap?.ratio ?? branch.tap ?? 1;
    if (branch.impedance?.r !== 0 || branch.impedance?.x !== 0) continue;
    if (buses.get(branch.from).baseKV !== buses.get(branch.to).baseKV || ratio !== 1 || (branch.tap?.angle || 0) !== 0 || branch.shunt) throw new Error('Zero-impedance non-cable transformations are not supported by the motor screen.');
    ties.add(branch.id);
    parent.set(representative(branch.to), representative(branch.from));
  }
  if (!ties.size) return runLoadFlow(model, options);
  const grouped = new Map();
  for (const bus of model.buses) {
    const id = representative(bus.id);
    if (!grouped.has(id)) grouped.set(id, { ...bus, id, load: { kw: 0, kvar: 0 }, shunt: { g: 0, b: 0 }, connections: [] });
    const group = grouped.get(id);
    group.load.kw += bus.load?.kw || 0;
    group.load.kvar += bus.load?.kvar || 0;
    group.shunt.g += bus.shunt?.g || 0;
    group.shunt.b += bus.shunt?.b || 0;
    if (bus.busType === 'slack') group.busType = 'slack';
  }
  const reduced = { buses: [...grouped.values()], branches: model.branches.filter(branch => !ties.has(branch.id)).map(branch => ({ ...branch, from: representative(branch.from), to: representative(branch.to) })) };
  const result = runLoadFlow(reduced, options);
  const solved = new Map(result.buses.map(bus => [bus.id, bus]));
  const expandedBuses = model.buses.map(bus => ({ ...solved.get(representative(bus.id)), id: bus.id, baseKV: bus.baseKV }));
  const byId = new Map(expandedBuses.map(bus => [bus.id, bus]));
  const flows = new Map(result.lines.map(line => [line.id, line]));
  const adjacency = new Map([...buses.keys()].map(id => [id, []]));
  for (const branch of model.branches) {
    adjacency.get(branch.from).push({ branch, next: branch.to });
    adjacency.get(branch.to).push({ branch, next: branch.from });
  }
  const root = model.buses.find(bus => bus.busType === 'slack').id;
  const order = [root], upstream = new Map(), visited = new Set(order);
  for (let index = 0; index < order.length; index += 1) for (const edge of adjacency.get(order[index])) {
    if (visited.has(edge.next)) continue;
    visited.add(edge.next); order.push(edge.next); upstream.set(edge.next, { branch: edge.branch, parent: order[index] });
  }
  const demand = new Map(model.buses.map(bus => {
    const voltageSquared = (byId.get(bus.id).Vm * bus.baseKV * 1000) ** 2;
    return [bus.id, { p: (bus.load?.kw || 0) + voltageSquared * (bus.shunt?.g || 0) / 1000,
      q: (bus.load?.kvar || 0) - voltageSquared * (bus.shunt?.b || 0) / 1000 }];
  }));
  for (const id of [...order].reverse()) {
    if (!upstream.has(id)) continue;
    const { branch, parent: upstreamId } = upstream.get(id);
    const forward = branch.from === upstreamId;
    let p, q;
    if (ties.has(branch.id)) {
      ({ p, q } = demand.get(id));
      const voltage = byId.get(id).Vm * buses.get(id).baseKV * 1000;
      const amps = Math.hypot(p, q) * 1000 / (Math.sqrt(3) * voltage);
      flows.set(branch.id, { id: branch.id, from: branch.from, to: branch.to,
        fromCurrentA: amps, toCurrentA: amps, amps,
        fromPowerKW: forward ? p : -p, fromPowerKvar: forward ? q : -q,
        toPowerKW: forward ? -p : p, toPowerKvar: forward ? -q : q,
        idealTie: true });
    } else {
      const flow = flows.get(branch.id);
      p = forward ? flow.fromPowerKW : flow.toPowerKW;
      q = forward ? flow.fromPowerKvar : flow.toPowerKvar;
    }
    demand.get(upstreamId).p += p;
    demand.get(upstreamId).q += q;
  }
  return { ...result, buses: expandedBuses, lines: model.branches.map(branch => ({ ...flows.get(branch.id), from: branch.from, to: branch.to })), idealTieReduction: { removedBusCount: model.buses.length - reduced.buses.length, circuitIds: [...ties] } };
}

import assert from 'node:assert/strict';

// Separate backward-current/forward-voltage network solution, physical V/A.
// Published cable values are transcribed independently of runtime helpers from
// archived Southwire SPEC45301 rev1.000.008 PDF (SHA-256
// d01fb6ec8ab42ea8b6144ea982ccf23ee662190c818621ea9d1d16f7735d3341).
const rx = {
  '#8 AWG': [0.810, 0.052], '#6 AWG': [0.510, 0.051], '#4 AWG': [0.320, 0.048],
  '#3 AWG': [0.254, 0.047], '#2 AWG': [0.201, 0.045], '#1 AWG': [0.159, 0.046],
  '1/0 AWG': [0.127, 0.044], '2/0 AWG': [0.102, 0.043], '3/0 AWG': [0.079, 0.042],
  '4/0 AWG': [0.063, 0.041], '250 kcmil': [0.053, 0.041], '350 kcmil': [0.039, 0.040],
  '500 kcmil': [0.027, 0.039], '600 kcmil': [0.024, 0.039], '750 kcmil': [0.019, 0.038],
};
const txData = { EXN30T3HCU: [30, 0.0408, 0.65, 68], EXN75T3HCU: [75, 0.0556, 1.76, 142], EXN150T3HCU: [150, 0.0379, 1.70, 235] };
const plus = (a, b) => [a[0] + b[0], a[1] + b[1]];
const times = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const scale = (a, value) => a.map(part => part * value);
const conjugate = a => [a[0], -a[1]];
export const magnitude = a => Math.hypot(...a);
const quotient = (a, b) => scale(times(a, conjugate(b)), 1 / magnitude(b) ** 2);

export function physicalStart(input, design, startingId) {
  const source = input.supply;
  const nodes = new Map(design.equipment.filter(row => row.type !== 'transformer').map(row => [row.id, row]));
  const edges = design.cables.map(cable => ({ id: cable.id, from: cable.from, to: cable.to, ratio: 1, g: 0,
    z: scale(rx[cable.conductor_size], cable.lengthFt / 1000) }));
  if (design.transformer) {
    const tx = design.transformer;
    const [kva, z, xr, coreW] = txData[tx.catalogNumber];
    const r = z * 208 ** 2 / (kva * 1000) / Math.hypot(1, xr);
    edges.push({ id: tx.id, from: tx.primaryBusId, to: tx.secondaryBusId, ratio: 208 / 480, z: [r, r * xr], g: coreW / 480 ** 2 });
  }
  const children = new Map([...nodes.keys()].map(id => [id, edges.filter(edge => edge.from === id)]));
  const parent = new Map(edges.map(edge => [edge.to, edge]));
  const order = [source.id];
  for (let i = 0; i < order.length; i += 1) for (const edge of children.get(order[i]) || []) order.push(edge.to);
  assert.equal(new Set(order).size, nodes.size);
  const loadById = new Map(input.equipment.map(load => [load.id, load]));
  const volts = new Map([...nodes].map(([id, node]) => [id, [node.voltage / Math.sqrt(3), 0]]));
  const currents = new Map();
  const sourceZ = [source.motorStartingImpedance.rOhm, source.motorStartingImpedance.xOhm];
  let solved = false;
  for (let iteration = 0; iteration < 500; iteration += 1) {
    let rootCurrent;
    for (const id of [...order].reverse()) {
      const load = loadById.get(id);
      let amps = [0, 0];
      if (load?.id === startingId) {
        const m = load.motor;
        amps = times(volts.get(id), scale([m.lockedRotorPowerFactor, -Math.sqrt(1 - m.lockedRotorPowerFactor ** 2)], Math.sqrt(3) * m.lockedRotorCurrentA / m.ratedVoltageV));
      } else if (load) {
        const watts = load.kw * 1000 / 3;
        amps = conjugate(quotient([watts, watts * Math.tan(Math.acos(load.powerFactor))], volts.get(id)));
      }
      for (const edge of children.get(id) || []) amps = plus(amps, plus(scale(currents.get(edge.id), edge.ratio), scale(volts.get(id), edge.g)));
      if (parent.has(id)) currents.set(parent.get(id).id, amps); else rootCurrent = amps;
    }
    const next = new Map([[source.id, plus([source.voltage / Math.sqrt(3), 0], scale(times(sourceZ, rootCurrent), -1))]]);
    for (const id of order) for (const edge of children.get(id) || []) next.set(edge.to, plus(scale(next.get(id), edge.ratio), scale(times(edge.z, currents.get(edge.id)), -1)));
    let delta = 0;
    for (const [id, voltage] of next) {
      delta = Math.max(delta, magnitude(plus(voltage, scale(volts.get(id), -1))));
      volts.set(id, scale(plus(voltage, volts.get(id)), 0.5));
    }
    if (delta < 1e-9) { solved = true; break; }
  }
  assert.ok(solved, 'Independent physical start-network oracle must converge');
  return { volts, nodes, currents };
}

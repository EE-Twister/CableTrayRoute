import { getOneLine } from '../dataStore.mjs';
import { buildLoadFlowModel, cloneData, isBusComponent } from './loadFlowModel.js';

const IGNORED_TYPES = new Set(['annotation', 'dimension']);

function toNumber(value, scale = 1) {
  const num = Number(value);
  return Number.isFinite(num) ? num * scale : 0;
}

function isUsableComponent(comp) {
  return comp && !IGNORED_TYPES.has(comp.type);
}

/** Basic complex number helpers used by the load-flow solver */
function toComplex(re = 0, im = 0) {
  return { re, im };
}
function add(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
function sub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }
function mul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function div(a, b) {
  const den = b.re * b.re + b.im * b.im || 1e-12;
  return { re: (a.re * b.re + a.im * b.im) / den, im: (a.im * b.re - a.re * b.im) / den };
}
function inv(a) { return div({ re: 1, im: 0 }, a); }
function conj(a) { return { re: a.re, im: -a.im }; }

/** Convert an impedance in ohms to per‑unit based on bus base kV and system MVA. */
function toPerUnitZ(z, baseKV, baseMVA) {
  const baseZ = (baseKV * baseKV) / baseMVA;
  return { re: (z.r || 0) / baseZ, im: (z.x || 0) / baseZ };
}

/** Convert an admittance in siemens to per‑unit */
function toPerUnitY(y, baseKV, baseMVA) {
  const baseY = baseMVA / (baseKV * baseKV);
  return { re: (y.g || 0) / baseY, im: (y.b || 0) / baseY };
}

/** Build the bus admittance matrix with taps and shunts. */
function buildYBus(buses, baseMVA) {
  const n = buses.length;
  const Y = Array.from({ length: n }, () => Array.from({ length: n }, () => toComplex(0, 0)));
  buses.forEach((bus, i) => {
    (bus.connections || []).forEach(conn => {
      const j = buses.findIndex(b => b.id === conn.target);
      if (j < 0) return;
      const Z = toPerUnitZ(conn.impedance || { r: 0, x: 0 }, bus.baseKV || 1, baseMVA);
      const y = inv(toComplex(Z.re, Z.im));
      const tapMag = conn.tap?.ratio || conn.tap || 1;
      const tapAng = (conn.tap?.angle || 0) * Math.PI / 180;
      const t = toComplex(tapMag * Math.cos(tapAng), tapMag * Math.sin(tapAng));
      const tconj = conj(t);
      const tmag2 = t.re * t.re + t.im * t.im || 1e-12;
      const yFromSh = conn.shunt?.from ? toPerUnitY(conn.shunt.from, bus.baseKV || 1, baseMVA) : toComplex(0, 0);
      const yToSh = conn.shunt?.to ? toPerUnitY(conn.shunt.to, buses[j].baseKV || 1, baseMVA) : toComplex(0, 0);
      Y[i][i] = add(Y[i][i], add(div(y, toComplex(tmag2, 0)), yFromSh));
      Y[j][j] = add(Y[j][j], add(y, yToSh));
      Y[i][j] = sub(Y[i][j], div(y, tconj));
      Y[j][i] = sub(Y[j][i], div(y, t));
    });
    if (bus.shunt) {
      Y[i][i] = add(Y[i][i], toPerUnitY(bus.shunt, bus.baseKV || 1, baseMVA));
    }
  });
  return Y;
}

/**
 * Compute real and reactive power injections at each bus given voltages
 */
function calcPQ(buses, Y, Vm, Va) {
  const n = buses.length;
  const P = new Array(n).fill(0);
  const Q = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const G = Y[i][j].re;
      const B = Y[i][j].im;
      const theta = Va[i] - Va[j];
      P[i] += Vm[i] * Vm[j] * (G * Math.cos(theta) + B * Math.sin(theta));
      Q[i] += Vm[i] * Vm[j] * (G * Math.sin(theta) - B * Math.cos(theta));
    }
  }
  return { P, Q };
}

/**
 * Solve a balanced or single-phase power flow using Newton–Raphson.
 * @param {Object[]} buses array of bus objects with type (slack|PV|PQ), load and generation
 * @param {number} baseKV
 * @param {number} baseMVA
 * @returns {Array<{id:string, Vm:number, Va:number}>}
 */
function solvePhase(buses, baseMVA) {
  const n = buses.length;
  const Vm = buses.map(b => b.Vm ?? 1);
  const Va = buses.map(b => (b.Va ?? 0) * Math.PI / 180);
  const Pspec = buses.map(b => ((b.Pg || 0) - (b.Pd || 0)) / baseMVA);
  const Qspec = buses.map(b => ((b.Qg || 0) - (b.Qd || 0)) / baseMVA);
  const PV = buses.map((b, i) => b.type === 'PV' ? i : -1).filter(i => i >= 0);
  const PQ = buses.map((b, i) => b.type === 'PQ' ? i : -1).filter(i => i >= 0);
  const nonSlack = buses.map((b, i) => b.type !== 'slack' ? i : -1).filter(i => i >= 0);
  const Y = buildYBus(buses, baseMVA);
  const maxIter = 20;
  const tol = 1e-6;

  for (let iter = 0; iter < maxIter; iter++) {
    const { P: Pcalc, Q: Qcalc } = calcPQ(buses, Y, Vm, Va);
    const dP = nonSlack.map(i => Pspec[i] - Pcalc[i]);
    const dQ = PQ.map(i => Qspec[i] - Qcalc[i]);
    const mismatch = [...dP, ...dQ];
    const maxMis = Math.max(...mismatch.map(v => Math.abs(v)));
    if (maxMis < tol) break;

    const m = nonSlack.length;
    const k = PQ.length;
    const J = Array.from({ length: m + k }, () => Array(m + k).fill(0));

    // Build Jacobian
    for (let a = 0; a < nonSlack.length; a++) {
      const i = nonSlack[a];
      for (let bIdx = 0; bIdx < nonSlack.length; bIdx++) {
        const j = nonSlack[bIdx];
        if (i === j) {
          J[a][bIdx] = -Qcalc[i] - Y[i][i].im * Vm[i] * Vm[i];
        } else {
          const G = Y[i][j].re;
          const B = Y[i][j].im;
          const theta = Va[i] - Va[j];
          J[a][bIdx] = Vm[i] * Vm[j] * (-G * Math.sin(theta) + B * Math.cos(theta));
        }
      }
      for (let bIdx = 0; bIdx < PQ.length; bIdx++) {
        const j = PQ[bIdx];
        if (i === j) {
          J[a][m + bIdx] = Pcalc[i] / Vm[i] + Y[i][i].re * Vm[i];
        } else {
          const G = Y[i][j].re;
          const B = Y[i][j].im;
          const theta = Va[i] - Va[j];
          J[a][m + bIdx] = Vm[i] * (G * Math.cos(theta) + B * Math.sin(theta));
        }
      }
    }

    for (let a = 0; a < PQ.length; a++) {
      const i = PQ[a];
      for (let bIdx = 0; bIdx < nonSlack.length; bIdx++) {
        const j = nonSlack[bIdx];
        if (i === j) {
          J[m + a][bIdx] = Pcalc[i] - Y[i][i].re * Vm[i] * Vm[i];
        } else {
          const G = Y[i][j].re;
          const B = Y[i][j].im;
          const theta = Va[i] - Va[j];
          J[m + a][bIdx] = -Vm[i] * Vm[j] * (G * Math.cos(theta) + B * Math.sin(theta));
        }
      }
      for (let bIdx = 0; bIdx < PQ.length; bIdx++) {
        const j = PQ[bIdx];
        if (i === j) {
          J[m + a][m + bIdx] = Qcalc[i] / Vm[i] - Y[i][i].im * Vm[i];
        } else {
          const G = Y[i][j].re;
          const B = Y[i][j].im;
          const theta = Va[i] - Va[j];
          J[m + a][m + bIdx] = Vm[i] * (G * Math.sin(theta) - B * Math.cos(theta));
        }
      }
    }

    // Solve linear system J * dx = mismatch
    const dx = solveLinear(J, mismatch);
    for (let idx = 0; idx < nonSlack.length; idx++) {
      Va[nonSlack[idx]] += dx[idx];
    }
    for (let idx = 0; idx < PQ.length; idx++) {
      Vm[PQ[idx]] += dx[nonSlack.length + idx];
    }
  }

  const busRes = buses.map((b, i) => ({ id: b.id, Vm: Vm[i], Va: Va[i] * 180 / Math.PI }));

  // line flows and losses
  const flows = [];
  const lossMap = {};
  buses.forEach((bus, i) => {
    const Vi = toComplex(Vm[i] * Math.cos(Va[i]), Vm[i] * Math.sin(Va[i]));
    (bus.connections || []).forEach(conn => {
      const j = buses.findIndex(b => b.id === conn.target);
      if (j < 0) return;
      const Vj = toComplex(Vm[j] * Math.cos(Va[j]), Vm[j] * Math.sin(Va[j]));
      const Z = toPerUnitZ(conn.impedance || { r: 0, x: 0 }, bus.baseKV || 1, baseMVA);
      const y = inv(toComplex(Z.re, Z.im));
      const tapMag = conn.tap?.ratio || conn.tap || 1;
      const tapAng = (conn.tap?.angle || 0) * Math.PI / 180;
      const t = toComplex(tapMag * Math.cos(tapAng), tapMag * Math.sin(tapAng));
      const ViPrime = div(Vi, t);
      const ySh = conn.shunt?.from ? toPerUnitY(conn.shunt.from, bus.baseKV || 1, baseMVA) : toComplex(0, 0);
      const Iij = add(mul(sub(ViPrime, Vj), y), mul(ViPrime, ySh));
      const Sij = mul(Vi, conj(Iij));
      const scale = baseMVA * 1000; // convert per-unit results to kW/kvar
      const P = Sij.re * scale;
      const Q = Sij.im * scale;
      const Ipu = Math.hypot(Iij.re, Iij.im);
      const baseKV = bus.baseKV || buses[j].baseKV || 1;
      const baseCurrentKA = baseKV ? baseMVA / (Math.sqrt(3) * baseKV) : 0;
      const currentKA = Ipu * baseCurrentKA;
      const currentA = currentKA * 1000;
      flows.push({ from: bus.id, to: buses[j].id, P, Q, Ipu, currentKA, amps: currentA });
      const key = [bus.id, buses[j].id].sort().join('-');
      lossMap[key] = lossMap[key] || { P: 0, Q: 0 };
      lossMap[key].P += P;
      lossMap[key].Q += Q;
    });
  });
  const losses = Object.values(lossMap).reduce((acc, v) => ({ P: acc.P + v.P, Q: acc.Q + v.Q }), { P: 0, Q: 0 });

  return { buses: busRes, lines: flows, losses };
}

/**
 * Solve a linear system using Gaussian elimination.
 */
function solveLinear(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    // pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }
    [M[i], M[maxRow]] = [M[maxRow], M[i]];
    const div = M[i][i] || 1e-12;
    for (let j = i; j <= n; j++) M[i][j] /= div;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = M[k][i];
      for (let j = i; j <= n; j++) {
        M[k][j] -= factor * M[i][j];
      }
    }
  }
  return M.map(row => row[n]);
}

function sumPQ(value) {
  if (value === null || value === undefined) {
    return { kw: 0, kvar: 0 };
  }
  if (typeof value === 'number') {
    return { kw: toNumber(value), kvar: 0 };
  }
  if (Array.isArray(value)) {
    return value.reduce((acc, item) => {
      const { kw, kvar } = sumPQ(item);
      return { kw: acc.kw + kw, kvar: acc.kvar + kvar };
    }, { kw: 0, kvar: 0 });
  }
  if (typeof value !== 'object') {
    return { kw: 0, kvar: 0 };
  }
  let kw = 0;
  let kvar = 0;
  let hasDirect = false;
  const directKw = value.kw ?? value.kW ?? value.P ?? value.p;
  const directKvar = value.kvar ?? value.kVAr ?? value.Q ?? value.q;
  if (directKw !== undefined) {
    kw += toNumber(directKw);
    hasDirect = true;
  }
  if (directKvar !== undefined) {
    kvar += toNumber(directKvar);
    hasDirect = true;
  }
  if (value.watts !== undefined) {
    kw += toNumber(value.watts, 0.001);
    hasDirect = true;
  }
  if (value.hp !== undefined) {
    kw += toNumber(value.hp, 0.746);
    hasDirect = true;
  }
  if (!hasDirect) {
    Object.keys(value).forEach(key => {
      const child = value[key];
      if (!child || typeof child !== 'object') return;
      const { kw: childKw, kvar: childKvar } = sumPQ(child);
      kw += childKw;
      kvar += childKvar;
    });
  }
  return { kw, kvar };
}

function resolvePhaseRecord(record, phase) {
  if (!record || typeof record !== 'object') return null;
  const variants = [phase, phase?.toLowerCase?.(), phase?.toUpperCase?.()];
  for (const key of variants) {
    if (!key) continue;
    if (record[key] !== undefined) return record[key];
  }
  if (record.phases) {
    const nested = resolvePhaseRecord(record.phases, phase);
    if (nested) return nested;
  }
  return null;
}

function extractPhasePQ(record, phase, balanced) {
  if (!record) return { kw: 0, kvar: 0 };
  if (balanced) return sumPQ(record);
  const phaseRecord = resolvePhaseRecord(record, phase);
  if (phaseRecord) return sumPQ(phaseRecord);
  return sumPQ(record);
}

/**
 * Public API: run load flow on a model. When `model` is omitted the
 * current one-line diagram from dataStore is converted automatically.
 * Options may specify baseKV/baseMVA and whether the system is balanced.
 */
export function runLoadFlow(modelOrOpts = {}, maybeOpts = {}) {
  let model, opts;
  if (Array.isArray(modelOrOpts) || modelOrOpts?.buses) {
    model = modelOrOpts.buses ? modelOrOpts : { buses: modelOrOpts };
    opts = maybeOpts || {};
  } else {
    opts = modelOrOpts || {};
    model = null;
  }
  if (!model) {
    model = buildLoadFlowModel(getOneLine());
  }
  const { baseMVA = 100, balanced = true } = opts;
  let busComps;
  if (model && model.buses) {
    const usable = model.buses.filter(isUsableComponent);
    let selected = usable.filter(isBusComponent);
    if (selected.length === 0) selected = usable;
    const busMap = new Map();
    busComps = selected.map(bus => {
      const clone = { ...bus };
      clone.connections = Array.isArray(bus.connections)
        ? bus.connections.map(conn => ({ ...conn }))
        : [];
      busMap.set(clone.id, clone);
      return clone;
    });
    if (Array.isArray(model.branches)) {
      model.branches.forEach(branch => {
        if (!branch) return;
        const fromBus = busMap.get(branch.from);
        if (!fromBus) return;
        if (!Array.isArray(fromBus.connections)) fromBus.connections = [];
        const componentId = branch.id || branch.componentId;
        const already = fromBus.connections.some(conn => conn.target === branch.to && (conn.componentId || conn.id) === componentId);
        if (already) return;
        fromBus.connections.push({
          target: branch.to,
          impedance: cloneData(branch.impedance || branch.cable || {}),
          tap: cloneData(branch.tap),
          shunt: cloneData(branch.shunt),
          rating: branch.rating,
          phases: cloneData(branch.phases),
          componentId
        });
      });
    }
  } else if (Array.isArray(model)) {
    const usable = model.filter(isUsableComponent);
    busComps = usable.filter(isBusComponent);
    if (busComps.length === 0) busComps = usable;
  }
  const busIds = busComps.map(b => b.id);
  const phases = balanced ? ['balanced'] : ['A', 'B', 'C'];
  const phaseResults = {};
  phases.forEach(phase => {
    const buses = busComps.map((c, idx) => {
      const loadPQ = extractPhasePQ(c.load, phase, balanced);
      const genPQ = extractPhasePQ(c.generation, phase, balanced);
      const shunt = balanced ? c.shunt : resolvePhaseRecord(c.shunt, phase);
      return {
        id: c.id,
        type: c.busType || (idx === 0 ? 'slack' : 'PQ'),
        Vm: c.Vm,
        Va: c.Va,
        baseKV: c.baseKV || 1,
        Pd: loadPQ.kw,
        Qd: loadPQ.kvar,
        Pg: genPQ.kw,
        Qg: genPQ.kvar,
        shunt,
        connections: (c.connections || []).filter(conn => {
          if (!busIds.includes(conn.target)) return false;
          if (balanced) return true;
          return !conn.phases || conn.phases.includes(phase);
        }).map(conn => ({
          target: conn.target,
          impedance: conn.impedance || conn.cable || {},
          tap: conn.tap,
          shunt: conn.shunt
        }))
      };
    });
    phaseResults[phase] = solvePhase(buses, baseMVA);
  });

  if (balanced) return phaseResults['balanced'];
  const buses = [];
  const lines = [];
  const losses = {};
  Object.entries(phaseResults).forEach(([ph, res]) => {
    res.buses.forEach(b => buses.push({ ...b, phase: ph }));
    res.lines.forEach(l => lines.push({ ...l, phase: ph }));
    losses[ph] = res.losses;
  });
  return { buses, lines, losses };
}


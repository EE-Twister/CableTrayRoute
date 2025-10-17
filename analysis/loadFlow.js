import { getOneLine } from '../dataStore.mjs';
import { buildLoadFlowModel, cloneData, isBusComponent } from './loadFlowModel.js';

const IGNORED_TYPES = new Set(['annotation', 'dimension']);
const MIN_COMPLEX_MAG = 1e-12;
const LARGE_ADMITTANCE = 1e9;

function normalizePortIndex(port) {
  const idx = Number(port);
  return Number.isFinite(idx) ? idx : null;
}

function resolveTransformerConnectionSide(subtype, portIndex) {
  if (!subtype || !String(subtype).includes('transformer')) return null;
  const idx = normalizePortIndex(portIndex);
  if (idx === null) return null;
  if (subtype === 'three_winding') {
    if (idx === 0) return 'primary';
    if (idx === 1) return 'secondary';
    if (idx === 2) return 'tertiary';
  }
  if (idx === 0) return 'primary';
  if (idx === 1) return 'secondary';
  if (idx === 2) return 'tertiary';
  return null;
}

function formatConnectionSideLabel(side) {
  if (!side) return '';
  switch (side) {
    case 'primary':
      return 'Primary';
    case 'secondary':
      return 'Secondary';
    case 'tertiary':
      return 'Tertiary';
    default:
      return side.charAt(0).toUpperCase() + side.slice(1);
  }
}

function toNumber(value, scale = 1) {
  const num = Number(value);
  return Number.isFinite(num) ? num * scale : 0;
}

function isUsableComponent(comp) {
  return comp && !IGNORED_TYPES.has(comp.type);
}

function normalizeIdentifier(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function describeComponentMetadata(meta = {}) {
  const label = normalizeIdentifier(meta.componentLabel);
  if (label) return label;
  const name = normalizeIdentifier(meta.componentName);
  if (name) return name;
  const ref = normalizeIdentifier(meta.componentRef);
  if (ref) return ref;
  const id = normalizeIdentifier(meta.componentId);
  if (id) return `ID ${id}`;
  const subtype = normalizeIdentifier(meta.componentSubtype);
  const type = normalizeIdentifier(meta.componentType);
  if (subtype && type) return `${subtype} ${type}`;
  if (subtype) return subtype;
  if (type) return type;
  return null;
}

/** Basic complex number helpers used by the load-flow solver */
function toComplex(re = 0, im = 0) {
  return { re, im };
}
function add(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
function sub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }
function mul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function div(a, b) {
  const den = b.re * b.re + b.im * b.im || MIN_COMPLEX_MAG;
  return { re: (a.re * b.re + a.im * b.im) / den, im: (a.im * b.re - a.re * b.im) / den };
}
function inv(a) {
  const mag2 = a.re * a.re + a.im * a.im;
  if (mag2 < MIN_COMPLEX_MAG) {
    return toComplex(LARGE_ADMITTANCE, 0);
  }
  return { re: a.re / mag2, im: -a.im / mag2 };
}
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
  const warnings = [];
  buses.forEach((bus, i) => {
    (bus.connections || []).forEach(conn => {
      const j = buses.findIndex(b => b.id === conn.target);
      if (j < 0) return;
      const Z = toPerUnitZ(conn.impedance || { r: 0, x: 0 }, bus.baseKV || 1, baseMVA);
      const mag2 = Z.re * Z.re + Z.im * Z.im;
      let treatAsIdealTie = conn.idealTie === true;
      if (mag2 < MIN_COMPLEX_MAG) {
        warnings.push({
          type: 'zero_impedance_branch',
          fromBus: bus.id,
          toBus: buses[j].id,
          componentId: conn.componentId || conn.id || null,
          componentName: conn.componentName,
          componentLabel: conn.componentLabel,
          componentRef: conn.componentRef,
          componentType: conn.componentType,
          componentSubtype: conn.componentSubtype,
          rating: conn.rating,
          componentPort: conn.componentPort,
          connectionSide: conn.connectionSide,
          connectionConfig: conn.connectionConfig
        });
        treatAsIdealTie = true;
      }
      if (treatAsIdealTie) {
        conn.idealTie = true;
      }
      const y = treatAsIdealTie ? toComplex(LARGE_ADMITTANCE, 0) : inv(toComplex(Z.re, Z.im));
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
  return { matrix: Y, warnings };
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
function toMW(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num / 1000 : 0;
}

function solvePhase(buses, baseMVA, options = {}) {
  const requestedIter = Number.isFinite(options.maxIterations)
    ? Math.floor(options.maxIterations)
    : null;
  const warnings = [];
  const working = buses.map(b => {
    const clone = {
      ...b,
      connections: Array.isArray(b.connections) ? b.connections.map(conn => ({ ...conn })) : []
    };
    const baseKV = Number(b.baseKV);
    if (!Number.isFinite(baseKV) || baseKV <= 0) {
      clone.baseKV = 0.48;
      warnings.push(`Bus ${b.id} is missing a base voltage; assuming 0.48 kV.`);
    } else {
      clone.baseKV = baseKV;
    }
    clone.Pd = Number(b.Pd) || 0;
    clone.Qd = Number(b.Qd) || 0;
    clone.Pg = Number(b.Pg) || 0;
    clone.Qg = Number(b.Qg) || 0;
    return clone;
  });
  if (!working.some(b => (b.type || '').toLowerCase() === 'slack')) {
    warnings.push('No slack/source bus detected. Select a source or set a bus type to "slack".');
  }
  const n = working.length;
  const Vm = working.map(b => Number.isFinite(b.Vm) && b.Vm > 0 ? b.Vm : 1);
  const Va = working.map(b => (Number.isFinite(b.Va) ? b.Va : 0) * Math.PI / 180);
  const Pspec = working.map(b => (toMW(b.Pg) - toMW(b.Pd)) / baseMVA);
  const Qspec = working.map(b => (toMW(b.Qg) - toMW(b.Qd)) / baseMVA);
  const PV = working.map((b, i) => b.type === 'PV' ? i : -1).filter(i => i >= 0);
  const PQ = working.map((b, i) => b.type === 'PQ' ? i : -1).filter(i => i >= 0);
  const nonSlack = working.map((b, i) => b.type !== 'slack' ? i : -1).filter(i => i >= 0);
  const { matrix: Y, warnings: branchWarnings = [] } = buildYBus(working, baseMVA);
  const maxIter = Math.max(1, requestedIter && requestedIter > 0 ? requestedIter : 20);
  const tol = 1e-6;
  let iterations = 0;
  let maxMis = 0;
  let converged = false;

  for (let iter = 0; iter < maxIter; iter++) {
    const { P: Pcalc, Q: Qcalc } = calcPQ(working, Y, Vm, Va);
    const dP = nonSlack.map(i => Pspec[i] - Pcalc[i]);
    const dQ = PQ.map(i => Qspec[i] - Qcalc[i]);
    const mismatch = [...dP, ...dQ];
    const mismatchVals = mismatch.map(v => Math.abs(v));
    maxMis = mismatchVals.length ? Math.max(...mismatchVals) : 0;
    if (maxMis < tol) {
      converged = true;
      iterations = iter + 1;
      break;
    }

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
    iterations = iter + 1;
  }

  if (!converged) {
    const mismatchKW = maxMis * baseMVA * 1000;
    warnings.push(`Solution did not converge after ${maxIter} iterations. Last mismatch ${maxMis.toFixed(4)} pu (${mismatchKW.toFixed(1)} kW).`);
  }

  const { P: PcalcFinal, Q: QcalcFinal } = calcPQ(working, Y, Vm, Va);
  const baseKW = baseMVA * 1000;
  const actualGeneration = working.map((bus, i) => {
    const netP = Number.isFinite(PcalcFinal[i]) ? PcalcFinal[i] * baseKW : 0;
    const netQ = Number.isFinite(QcalcFinal[i]) ? QcalcFinal[i] * baseKW : 0;
    const Pg = netP + (bus.Pd || 0);
    const Qg = netQ + (bus.Qd || 0);
    return { Pg, Qg };
  });

  const busRes = working.map((b, i) => {
    const angleDeg = Va[i] * 180 / Math.PI;
    const voltageKV = b.baseKV * Vm[i];
    const voltageV = voltageKV * 1000;
    const name = normalizeIdentifier(b.name);
    const label = normalizeIdentifier(b.label);
    const ref = normalizeIdentifier(b.ref);
    const displayLabel = label || name || ref || b.id;
    return {
      id: b.id,
      name,
      label,
      ref,
      displayLabel,
      Vm: Vm[i],
      Va: angleDeg,
      baseKV: b.baseKV,
      voltageKV,
      voltageV,
      type: b.type,
      Pd: b.Pd,
      Qd: b.Qd,
      Pg: actualGeneration[i].Pg,
      Qg: actualGeneration[i].Qg
    };
  });

  const busMetaById = new Map(busRes.map(bus => [bus.id, bus]));
  const getBusDisplayLabel = id => {
    if (!id) return '';
    const meta = busMetaById.get(id);
    if (!meta) return id;
    const label = normalizeIdentifier(meta.displayLabel)
      || normalizeIdentifier(meta.label)
      || normalizeIdentifier(meta.name)
      || normalizeIdentifier(meta.ref);
    return label || meta.id || id;
  };

  if (Array.isArray(branchWarnings) && branchWarnings.length) {
    branchWarnings.forEach(payload => {
      const fromLabel = getBusDisplayLabel(payload.fromBus);
      const toLabel = getBusDisplayLabel(payload.toBus);
      const descriptor = describeComponentMetadata(payload);
      const componentText = descriptor ? descriptor : 'connection';
      warnings.push(`Ignored zero-impedance data for ${componentText} between ${fromLabel} and ${toLabel}; treating it as an ideal tie.`);
    });
  }

  // line flows and losses
  const flows = [];
  const branchLossMap = new Map();
  working.forEach((bus, i) => {
    const Vi = toComplex(Vm[i] * Math.cos(Va[i]), Vm[i] * Math.sin(Va[i]));
    (bus.connections || []).forEach(conn => {
      const j = working.findIndex(b => b.id === conn.target);
      if (j < 0) return;
      const Vj = toComplex(Vm[j] * Math.cos(Va[j]), Vm[j] * Math.sin(Va[j]));
      const Z = toPerUnitZ(conn.impedance || { r: 0, x: 0 }, bus.baseKV || 1, baseMVA);
      const mag2 = Z.re * Z.re + Z.im * Z.im;
      let treatAsIdealTie = conn.idealTie === true;
      if (mag2 < MIN_COMPLEX_MAG) {
        treatAsIdealTie = true;
      }
      if (treatAsIdealTie) {
        conn.idealTie = true;
      }
      const y = treatAsIdealTie ? toComplex(LARGE_ADMITTANCE, 0) : inv(toComplex(Z.re, Z.im));
      const tapMag = conn.tap?.ratio || conn.tap || 1;
      const tapAng = (conn.tap?.angle || 0) * Math.PI / 180;
      const t = toComplex(tapMag * Math.cos(tapAng), tapMag * Math.sin(tapAng));
      const ViPrime = div(Vi, t);
      const yShFrom = conn.shunt?.from ? toPerUnitY(conn.shunt.from, bus.baseKV || 1, baseMVA) : toComplex(0, 0);
      const yShTo = conn.shunt?.to ? toPerUnitY(conn.shunt.to, working[j].baseKV || 1, baseMVA) : toComplex(0, 0);
      const Iij = add(mul(sub(ViPrime, Vj), y), mul(ViPrime, yShFrom));
      const Sij = mul(Vi, conj(Iij));
      const scale = baseMVA * 1000; // convert per-unit results to kW/kvar
      const P = Sij.re * scale;
      const Q = Sij.im * scale;
      const Ipu = Math.hypot(Iij.re, Iij.im);
      const Ipu2 = Ipu * Ipu;
      const baseKV = bus.baseKV || working[j].baseKV || 1;
      const baseCurrentKA = baseKV ? baseMVA / (Math.sqrt(3) * baseKV) : 0;
      const currentKA = Ipu * baseCurrentKA;
      const currentA = currentKA * 1000;
      const fromKV = Vm[i] * (bus.baseKV || 0);
      const toKV = Vm[j] * (working[j].baseKV || 0);
      const dropKV = fromKV - toKV;
      const dropPct = fromKV ? (dropKV / fromKV) * 100 : 0;
      const lossKW = Ipu2 * (Z.re || 0) * scale;
      const lossKVAR = Ipu2 * (Z.im || 0) * scale;
      const ViPrimeMag2 = ViPrime.re * ViPrime.re + ViPrime.im * ViPrime.im;
      const VjMag2 = Vj.re * Vj.re + Vj.im * Vj.im;
      const shuntFromLossKW = ViPrimeMag2 * (yShFrom.re || 0) * scale;
      const shuntToLossKW = VjMag2 * (yShTo.re || 0) * scale;
      flows.push({
        from: bus.id,
        fromLabel: getBusDisplayLabel(bus.id),
        to: working[j].id,
        toLabel: getBusDisplayLabel(working[j].id),
        P,
        Q,
        Ipu,
        currentKA,
        amps: currentA,
        fromKV,
        toKV,
        dropKV,
        dropPct,
        componentId: conn.componentId || conn.id
      });
      const branchKeyParts = [];
      if (conn.componentId || conn.id) branchKeyParts.push(conn.componentId || conn.id);
      branchKeyParts.push([bus.id, working[j].id].sort().join('->'));
      const branchKey = branchKeyParts.join('|');
      if (!branchLossMap.has(branchKey)) {
        branchLossMap.set(branchKey, {
          componentId: conn.componentId || conn.id || null,
          componentName: conn.componentName,
          componentLabel: conn.componentLabel,
          componentRef: conn.componentRef,
          from: bus.id,
          to: working[j].id,
          P: 0,
          Q: 0,
          _directions: new Set(),
          _shuntSides: new Set()
        });
      }
      const branchLoss = branchLossMap.get(branchKey);
      const directionKey = `${bus.id}->${working[j].id}`;
      if (!branchLoss._directions.has(directionKey)) {
        if (Number.isFinite(lossKW)) branchLoss.P += lossKW;
        if (Number.isFinite(lossKVAR)) branchLoss.Q += lossKVAR;
        branchLoss._directions.add(directionKey);
      }
      const shuntFromKey = `from:${bus.id}`;
      if (!branchLoss._shuntSides.has(shuntFromKey) && Number.isFinite(shuntFromLossKW) && shuntFromLossKW !== 0) {
        branchLoss.P += shuntFromLossKW;
        branchLoss._shuntSides.add(shuntFromKey);
      }
      const shuntToKey = `to:${working[j].id}`;
      if (!branchLoss._shuntSides.has(shuntToKey) && Number.isFinite(shuntToLossKW) && shuntToLossKW !== 0) {
        branchLoss.P += shuntToLossKW;
        branchLoss._shuntSides.add(shuntToKey);
      }
    });
  });
  const branchLosses = Array.from(branchLossMap.values()).map(entry => {
    const { _directions, _shuntSides, ...rest } = entry;
    return {
      ...rest,
      P: Number.isFinite(rest.P) ? rest.P : 0,
      Q: Number.isFinite(rest.Q) ? rest.Q : 0
    };
  });
  const losses = branchLosses.reduce((acc, loss) => ({
    P: acc.P + (Number.isFinite(loss.P) ? loss.P : 0),
    Q: acc.Q + (Number.isFinite(loss.Q) ? loss.Q : 0)
  }), { P: 0, Q: 0 });
  losses.branches = branchLosses;

  const sources = working.map((bus, i) => {
    const meta = busMetaById.get(bus.id);
    const name = normalizeIdentifier(meta?.name ?? bus.name);
    const label = normalizeIdentifier(meta?.label ?? bus.label);
    const ref = normalizeIdentifier(meta?.ref ?? bus.ref);
    const displayLabel = normalizeIdentifier(meta?.displayLabel) || label || name || ref || bus.id;
    return {
      id: bus.id,
      name,
      label,
      ref,
      displayLabel,
      type: bus.type,
      Pg: actualGeneration[i].Pg,
      Qg: actualGeneration[i].Qg,
      baseKV: bus.baseKV,
      Vm: Vm[i],
      Va: Va[i] * 180 / Math.PI,
      voltageKV: bus.baseKV * Vm[i],
      voltageV: bus.baseKV * Vm[i] * 1000
    };
  }).filter(src => Math.abs(src.Pg) > 1e-6 || Math.abs(src.Qg) > 1e-6 || (src.type || '').toLowerCase() === 'slack');

  const summary = {
    totalLoadKW: working.reduce((sum, bus) => sum + (bus.Pd || 0), 0),
    totalLoadKVAR: working.reduce((sum, bus) => sum + (bus.Qd || 0), 0),
    totalGenKW: actualGeneration.reduce((sum, gen) => sum + gen.Pg, 0),
    totalGenKVAR: actualGeneration.reduce((sum, gen) => sum + gen.Qg, 0),
    totalLossKW: Number.isFinite(losses.P) ? losses.P : 0,
    totalLossKVAR: Number.isFinite(losses.Q) ? losses.Q : 0
  };

  const branchConnections = [];
  const seenConnections = new Set();
  working.forEach(bus => {
    (bus.connections || []).forEach(conn => {
      if (!conn || !conn.target) return;
      const componentId = conn.componentId || conn.id || null;
      const key = componentId ? componentId : `${bus.id}->${conn.target}`;
      if (seenConnections.has(key)) return;
      seenConnections.add(key);
      const phases = Array.isArray(conn.phases) ? [...conn.phases] : conn.phases;
      const componentPort = normalizePortIndex(conn.componentPort ?? conn.sourcePort);
      const connectionSide = conn.connectionSide
        || resolveTransformerConnectionSide(conn.componentSubtype, componentPort);
      const connectionSideLabel = formatConnectionSideLabel(connectionSide);
      const connectionConfig = typeof conn.connectionConfig === 'string'
        ? conn.connectionConfig
        : null;
      branchConnections.push({
        componentId,
        componentName: conn.componentName,
        componentLabel: conn.componentLabel,
        componentRef: conn.componentRef,
        componentType: conn.componentType,
        componentSubtype: conn.componentSubtype,
        rating: conn.rating,
        phases,
        fromBus: bus.id,
        toBus: conn.target,
        componentPort,
        connectionSide,
        connectionSideLabel,
        connectionConfig
      });
    });
  });
  summary.branchConnections = branchConnections;

  const mismatchPu = Number.isFinite(maxMis) ? maxMis : 0;

  return {
    converged,
    iterations,
    maxMismatch: mismatchPu,
    maxMismatchKW: mismatchPu * baseMVA * 1000,
    warnings,
    buses: busRes,
    lines: flows,
    losses,
    sources,
    summary
  };
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

function parseBooleanFlag(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (['true', 't', 'yes', 'y', '1', 'on'].includes(normalized)) return true;
    if (['false', 'f', 'no', 'n', '0', 'off'].includes(normalized)) return false;
  }
  return null;
}

function parsePowerFactorValue(raw) {
  if (raw === null || raw === undefined) return null;
  let value = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.endsWith('%')) {
      value = trimmed.slice(0, -1);
    } else {
      value = trimmed;
    }
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return null;
  let normalized = numeric;
  if (Math.abs(normalized) > 1) normalized /= 100;
  if (!Number.isFinite(normalized) || normalized === 0) return null;
  const magnitude = Math.abs(normalized);
  if (magnitude <= 0 || magnitude > 1) return null;
  const sign = normalized < 0 ? -1 : 1;
  return { magnitude, sign };
}

function extractPowerFactor(record) {
  if (!record || typeof record !== 'object') return null;
  const fields = [record.pf, record.power_factor, record.powerFactor];
  for (const raw of fields) {
    const parsed = parsePowerFactorValue(raw);
    if (parsed) return parsed;
  }
  return null;
}

function resolveReactiveSign(record, pfSign = 1) {
  let sign = pfSign < 0 ? -1 : 1;
  if (!record || typeof record !== 'object') return sign;
  const leadLagCandidates = [
    record.pf_lead_lag,
    record.pfLeadLag,
    record.power_factor_lead_lag,
    record.powerFactorLeadLag,
    record.leadLag,
    record.lead_lag,
    record.powerFactorMode,
    record.power_factor_mode,
    record.pf_mode,
    record.pfMode
  ];
  for (const candidate of leadLagCandidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim().toLowerCase();
    if (!normalized) continue;
    if (normalized.includes('lead')) {
      sign = -1;
    } else if (normalized.includes('lag')) {
      sign = 1;
    }
  }
  const leadingFlags = [
    record.leading,
    record.isLeading,
    record.pf_leading,
    record.pfLeading,
    record.power_factor_leading,
    record.powerFactorLeading
  ];
  for (const flag of leadingFlags) {
    const parsed = parseBooleanFlag(flag);
    if (parsed === true) {
      sign = -1;
    }
  }
  const laggingFlags = [
    record.lagging,
    record.isLagging,
    record.pf_lagging,
    record.pfLagging,
    record.power_factor_lagging,
    record.powerFactorLagging
  ];
  for (const flag of laggingFlags) {
    const parsed = parseBooleanFlag(flag);
    if (parsed === true) {
      sign = 1;
    }
  }
  const signFields = [
    record.kvar_sign,
    record.kvarSign,
    record.q_sign,
    record.qSign,
    record.reactive_sign,
    record.reactiveSign
  ];
  for (const raw of signFields) {
    if (raw === null || raw === undefined) continue;
    if (typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase();
      if (!normalized) continue;
      if (normalized === 'lead' || normalized === 'leading' || normalized === 'capacitive') {
        sign = -1;
        break;
      }
      if (normalized === 'lag' || normalized === 'lagging' || normalized === 'inductive') {
        sign = 1;
        break;
      }
    }
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric !== 0) {
      sign = numeric > 0 ? 1 : -1;
      break;
    }
  }
  return sign;
}

function isReactiveAuthoritative(record, directProvided) {
  if (!record || typeof record !== 'object') return directProvided;
  const authoritativeFlags = [
    record.kvar_authoritative,
    record.kvarAuthoritative,
    record.reactive_authoritative,
    record.reactiveAuthoritative,
    record.q_authoritative,
    record.qAuthoritative,
    record.kvar_locked,
    record.kvarLocked,
    record.reactive_locked,
    record.reactiveLocked,
    record.kvar_manual,
    record.kvarManual,
    record.q_manual,
    record.qManual
  ];
  for (const flag of authoritativeFlags) {
    const parsed = parseBooleanFlag(flag);
    if (parsed === true) return true;
    if (parsed === false) return false;
  }
  return directProvided;
}

function deriveReactiveFromPF(kw, record) {
  const pf = extractPowerFactor(record);
  if (!pf) return 0;
  const kwAbs = Math.abs(Number(kw) || 0);
  if (!kwAbs) return 0;
  const kva = kwAbs / pf.magnitude;
  const kvarMag = Math.sqrt(Math.max(0, kva * kva - kwAbs * kwAbs));
  if (!kvarMag) return 0;
  const sign = resolveReactiveSign(record, pf.sign);
  return kvarMag * sign;
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
    const added = toNumber(directKw);
    if (added) hasDirect = true;
    kw += added;
  }
  const kvarProvided = directKvar !== undefined;
  const kvarAuthoritative = isReactiveAuthoritative(value, kvarProvided);
  if (kvarProvided && kvarAuthoritative) {
    const added = toNumber(directKvar);
    if (added) hasDirect = true;
    kvar += added;
  }
  if (value.watts !== undefined) {
    const added = toNumber(value.watts, 0.001);
    if (added) hasDirect = true;
    kw += added;
  }
  if (value.hp !== undefined) {
    const added = toNumber(value.hp, 0.746);
    if (added) hasDirect = true;
    kw += added;
  }
  if ((!kvarAuthoritative || !kvarProvided) && kw) {
    const derived = deriveReactiveFromPF(kw, value);
    if (derived) {
      kvar += derived;
      hasDirect = true;
    }
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
  const { baseMVA = 100, balanced = true, maxIterations = 20 } = opts;
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
          componentId,
          componentType: branch.type,
          componentSubtype: branch.subtype,
          componentName: branch.name,
          componentLabel: branch.label,
          componentRef: branch.ref,
          idealTie: branch.idealTie === true
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
      const name = normalizeIdentifier(c.name);
      const label = normalizeIdentifier(c.label);
      const ref = normalizeIdentifier(c.ref);
      return {
        id: c.id,
        name,
        label,
        ref,
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
          shunt: conn.shunt,
          componentId: conn.componentId || conn.id,
          componentName: conn.componentName,
          componentLabel: conn.componentLabel,
          componentRef: conn.componentRef,
          componentType: conn.componentType,
          componentSubtype: conn.componentSubtype,
          rating: conn.rating,
          phases: conn.phases,
          componentPort: conn.componentPort,
          connectionSide: conn.connectionSide,
          connectionConfig: conn.connectionConfig,
          idealTie: conn.idealTie === true
        }))
      };
    });
    phaseResults[phase] = solvePhase(buses, baseMVA, { maxIterations });
  });

  if (balanced) return phaseResults['balanced'];
  const combined = {
    buses: [],
    lines: [],
    losses: {},
    sources: [],
    warnings: [],
    converged: true,
    iterations: 0,
    maxMismatch: 0,
    maxMismatchKW: 0,
    summary: {}
  };
  Object.entries(phaseResults).forEach(([ph, res]) => {
    (res.buses || []).forEach(b => combined.buses.push({ ...b, phase: ph }));
    (res.lines || []).forEach(l => combined.lines.push({ ...l, phase: ph }));
    combined.losses[ph] = res.losses;
    (res.sources || []).forEach(src => combined.sources.push({ ...src, phase: ph }));
    if (Array.isArray(res.warnings)) {
      res.warnings.forEach(w => combined.warnings.push(`${ph}: ${w}`));
    }
    if (!res.converged) combined.converged = false;
    if (res.iterations) combined.iterations = Math.max(combined.iterations, res.iterations);
    if (Number.isFinite(res.maxMismatch)) {
      combined.maxMismatch = Math.max(combined.maxMismatch, res.maxMismatch);
    }
    if (Number.isFinite(res.maxMismatchKW)) {
      combined.maxMismatchKW = Math.max(combined.maxMismatchKW, res.maxMismatchKW);
    }
    combined.summary[ph] = res.summary;
  });
  return combined;
}


import { getOneLine } from '../dataStore.mjs';

/** Basic complex number helpers used by the load-flow solver */
function toComplex(re = 0, im = 0) {
  return { re, im };
}
function add(a, b) {
  return { re: a.re + b.re, im: a.im + b.im };
}
function sub(a, b) {
  return { re: a.re - b.re, im: a.im - b.im };
}
function mul(a, b) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function inv(a) {
  const den = a.re * a.re + a.im * a.im || 1e-12;
  return { re: a.re / den, im: -a.im / den };
}

/**
 * Convert an impedance in ohms to per-unit based on baseKV/baseMVA
 */
function toPerUnitZ(z, baseKV, baseMVA) {
  const baseZ = (baseKV * baseKV) / baseMVA;
  return { re: z.r / baseZ, im: z.x / baseZ };
}

/**
 * Build the bus admittance matrix for the given network description.
 */
function buildYBus(buses, baseKV, baseMVA) {
  const n = buses.length;
  const Y = Array.from({ length: n }, () => Array.from({ length: n }, () => toComplex(0, 0)));
  buses.forEach((bus, i) => {
    (bus.connections || []).forEach(conn => {
      const j = buses.findIndex(b => b.id === conn.target);
      if (j < 0) return;
      const Z = toPerUnitZ(conn.impedance || { r: 0, x: 0 }, baseKV, baseMVA);
      const y = inv(toComplex(Z.re, Z.im));
      Y[i][i] = add(Y[i][i], y);
      Y[j][j] = add(Y[j][j], y);
      const off = toComplex(-y.re, -y.im);
      Y[i][j] = add(Y[i][j], off);
      Y[j][i] = add(Y[j][i], off);
    });
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
function solvePhase(buses, baseKV, baseMVA) {
  const n = buses.length;
  const Vm = buses.map(b => b.Vm ?? 1);
  const Va = buses.map(b => (b.Va ?? 0) * Math.PI / 180);
  const Pspec = buses.map(b => ((b.Pg || 0) - (b.Pd || 0)) / baseMVA);
  const Qspec = buses.map(b => ((b.Qg || 0) - (b.Qd || 0)) / baseMVA);
  const PV = buses.map((b, i) => b.type === 'PV' ? i : -1).filter(i => i >= 0);
  const PQ = buses.map((b, i) => b.type === 'PQ' ? i : -1).filter(i => i >= 0);
  const nonSlack = buses.map((b, i) => b.type !== 'slack' ? i : -1).filter(i => i >= 0);
  const Y = buildYBus(buses, baseKV, baseMVA);
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

  return buses.map((b, i) => ({ id: b.id, Vm: Vm[i], Va: Va[i] * 180 / Math.PI }));
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

/**
 * Public API: run load flow on the one-line model.
 * Options may specify baseKV/baseMVA and whether the system is balanced.
 */
export function runLoadFlow(opts = {}) {
  const { baseKV = 1, baseMVA = 1, balanced = true } = opts;
  const diagram = getOneLine();
  const comps = diagram.filter(c => c && c.id);
  const phases = balanced ? ['balanced'] : ['A', 'B', 'C'];
  const phaseResults = {};
  phases.forEach(phase => {
    const buses = comps.map((c, idx) => {
      const load = c.load || {};
      const phaseLoad = balanced ? load : load[phase.toLowerCase()] || {};
      return {
        id: c.id,
        type: c.busType || (idx === 0 ? 'slack' : 'PQ'),
        Vm: c.Vm,
        Va: c.Va,
        Pd: phaseLoad.kw || phaseLoad.P || 0,
        Qd: phaseLoad.kvar || phaseLoad.Q || 0,
        Pg: c.generation?.kw || 0,
        Qg: c.generation?.kvar || 0,
        connections: (c.connections || []).filter(conn => {
          if (balanced) return true;
          return !conn.phases || conn.phases.includes(phase);
        }).map(conn => ({ target: conn.target, impedance: conn.impedance || conn.cable || {} }))
      };
    });
    phaseResults[phase] = solvePhase(buses, baseKV, baseMVA);
  });

  // Flatten results for consumers
  if (balanced) return phaseResults['balanced'];
  const flat = [];
  Object.entries(phaseResults).forEach(([ph, arr]) => {
    arr.forEach(r => flat.push({ id: r.id, phase: ph, Vm: r.Vm, Va: r.Va }));
  });
  return flat;
}


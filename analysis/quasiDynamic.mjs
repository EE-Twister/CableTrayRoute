/**
 * Quasi-Dynamic / Time-Series Load Flow (Gap #88)
 *
 * Runs the existing Newton-Raphson load-flow solver across a sequence of
 * time steps, each defined by a load-scale and generation-scale multiplier.
 * Useful for 8760-hour annual energy studies, daily demand profiles, and
 * DER hosting-capacity sweeps.
 *
 * Method:
 *   For each timestep t:
 *     1. Scale all bus Pd/Qd by loadScale[t], all Pg/Qg by genScale[t]
 *     2. Run single-snapshot AC load flow (Newton-Raphson, balanced or 3-phase)
 *     3. Record bus voltages, branch flows, and system losses
 *   Post-process: compute voltage envelopes, peak/valley snapshots, energy loss.
 *
 * Voltage limits (ANSI C84.1 Range A):
 *   Upper: 1.05 pu
 *   Lower: 0.95 pu
 *
 * References:
 *   IEEE Std 399-1997 — Brown Book: Recommended Practice for Industrial
 *     and Commercial Power Systems Analysis §14 (Load Flow)
 *   IEC 61968-13:2008 — CIM for distribution networks (profile representation)
 */

import { runLoadFlow } from './loadFlow.js';
import { buildLoadFlowModel } from './loadFlowModel.js';
import { getOneLine } from '../dataStore.mjs';

/** ANSI C84.1 Range A upper voltage limit (pu). */
export const VOLTAGE_HIGH_PU = 1.05;

/** ANSI C84.1 Range A lower voltage limit (pu). */
export const VOLTAGE_LOW_PU = 0.95;

/** Marginal upper band start (pu) — warn before hitting hard limit. */
export const VOLTAGE_WARN_HIGH_PU = 1.03;

/** Marginal lower band end (pu) — warn before hitting hard limit. */
export const VOLTAGE_WARN_LOW_PU = 0.97;

// ---------------------------------------------------------------------------
// Profile parsing
// ---------------------------------------------------------------------------

/**
 * Parse a CSV/text profile into an array of time-step descriptor objects.
 *
 * Accepted column layouts (header row optional, # lines are comments):
 *   1-column:  loadScale
 *   2-column:  hour, loadScale
 *   3-column:  hour, loadScale, genScale
 *
 * @param {string} csvText
 * @returns {Array<{hour:number, loadScale:number, genScale:number}>}
 */
export function parseProfileCsv(csvText) {
  if (typeof csvText !== 'string') throw new TypeError('csvText must be a string');
  const lines = csvText.split(/\r?\n/);
  const steps = [];
  let autoHour = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cols = line.split(/[,\t]+/).map(s => s.trim());
    if (/^hour/i.test(cols[0])) continue; // header row
    const nums = cols.map(Number);
    if (nums.some(n => !Number.isFinite(n))) continue;
    let hour, loadScale, genScale;
    if (nums.length === 1) {
      hour = autoHour++;
      loadScale = nums[0];
      genScale = 1.0;
    } else if (nums.length === 2) {
      [hour, loadScale] = nums;
      genScale = 1.0;
    } else {
      [hour, loadScale, genScale] = nums;
    }
    if (!Number.isFinite(loadScale) || loadScale < 0) continue;
    steps.push({
      hour: Math.round(Math.max(0, hour)),
      loadScale: Math.max(0, loadScale),
      genScale: Number.isFinite(genScale) ? Math.max(0, genScale) : 1.0,
    });
  }
  return steps;
}

/**
 * Generate a built-in representative 24-hour weekday profile.
 * Loads follow a typical commercial building demand curve.
 * Generation is flat at 1.0 (no time-varying dispatch).
 *
 * @returns {Array<{hour:number, loadScale:number, genScale:number}>}
 */
export function builtinDailyProfile() {
  // Typical commercial weekday load factors (per-unit of peak)
  const factors = [
    0.55, 0.50, 0.48, 0.46, 0.47, 0.52,  // 00–05
    0.60, 0.72, 0.85, 0.93, 0.97, 0.99,  // 06–11
    1.00, 0.98, 0.97, 0.96, 0.95, 0.92,  // 12–17
    0.85, 0.78, 0.74, 0.70, 0.65, 0.59,  // 18–23
  ];
  return factors.map((f, h) => ({ hour: h, loadScale: f, genScale: 1.0 }));
}

/**
 * Generate a built-in representative 8760-hour annual profile by tiling
 * the 24-hour weekday curve across 365 days with weekend attenuation.
 *
 * @returns {Array<{hour:number, loadScale:number, genScale:number}>}
 */
export function builtinAnnualProfile() {
  const daily = builtinDailyProfile().map(s => s.loadScale);
  const steps = [];
  for (let day = 0; day < 365; day++) {
    const isWeekend = day % 7 >= 5;
    const weekendFactor = isWeekend ? 0.75 : 1.0;
    for (let h = 0; h < 24; h++) {
      steps.push({
        hour: day * 24 + h,
        loadScale: daily[h] * weekendFactor,
        genScale: 1.0,
      });
    }
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Model scaling helpers
// ---------------------------------------------------------------------------

function scaledLoad(load, s) {
  if (!load || typeof load !== 'object') return load;
  const out = { ...load };
  if (Number.isFinite(out.kw))   out.kw   *= s;
  if (Number.isFinite(out.kvar)) out.kvar *= s;
  if (out.A) out.A = { ...out.A, kw: (out.A.kw ?? 0) * s, kvar: (out.A.kvar ?? 0) * s };
  if (out.B) out.B = { ...out.B, kw: (out.B.kw ?? 0) * s, kvar: (out.B.kvar ?? 0) * s };
  if (out.C) out.C = { ...out.C, kw: (out.C.kw ?? 0) * s, kvar: (out.C.kvar ?? 0) * s };
  return out;
}

function scaledGen(gen, s) {
  if (!gen || typeof gen !== 'object') return gen;
  const out = { ...gen };
  if (Number.isFinite(out.kw))   out.kw   *= s;
  if (Number.isFinite(out.kvar)) out.kvar *= s;
  return out;
}

function applyScaling(baseModel, loadScale, genScale) {
  const buses = baseModel.buses.map(bus => ({
    ...bus,
    load:       scaledLoad(bus.load, loadScale),
    generation: scaledGen(bus.generation, genScale),
  }));
  return { buses, branches: baseModel.branches };
}

// ---------------------------------------------------------------------------
// Voltage classification
// ---------------------------------------------------------------------------

/**
 * Classify a bus voltage magnitude as 'pass', 'warn', or 'fail'.
 * @param {number} vm - Voltage magnitude in per-unit
 * @param {'high'|'low'} side - Which limit to check
 * @returns {'pass'|'warn'|'fail'}
 */
export function classifyVoltage(vm, side) {
  if (!Number.isFinite(vm)) return 'warn';
  if (side === 'high') {
    if (vm > VOLTAGE_HIGH_PU)      return 'fail';
    if (vm > VOLTAGE_WARN_HIGH_PU) return 'warn';
    return 'pass';
  }
  // low
  if (vm < VOLTAGE_LOW_PU)      return 'fail';
  if (vm < VOLTAGE_WARN_LOW_PU) return 'warn';
  return 'pass';
}

// ---------------------------------------------------------------------------
// Main quasi-dynamic solver
// ---------------------------------------------------------------------------

/**
 * Run quasi-dynamic (time-series) load flow over a profile array.
 *
 * @param {Object|null} baseModel
 *   Pre-built {buses, branches} model. Pass null to derive from the current
 *   one-line diagram in dataStore.
 * @param {Array<{hour:number, loadScale:number, genScale:number}>} profiles
 *   Time step descriptors. Each step is solved independently.
 * @param {Object} [opts]
 *   Options forwarded to runLoadFlow: baseMVA, balanced, maxIterations.
 * @returns {QuasiDynamicResult}
 */
export function runQuasiDynamic(baseModel, profiles, opts = {}) {
  if (!Array.isArray(profiles) || profiles.length === 0) {
    throw new Error('profiles must be a non-empty array of {hour, loadScale, genScale} objects');
  }

  const model = baseModel || buildLoadFlowModel(getOneLine());
  if (!model || !Array.isArray(model.buses) || model.buses.length === 0) {
    throw new Error(
      'No load flow model available. Open a project with a one-line diagram first, ' +
      'or provide a baseModel directly.'
    );
  }

  const timeSeries = [];
  const busVoltageMax = {};
  const busVoltageMin = {};
  const busNames = {};
  let peakStep = null;
  let valleyStep = null;
  let totalEnergyLossKwh = 0;
  let convergedCount = 0;

  for (const step of profiles) {
    const { hour, loadScale = 1.0, genScale = 1.0 } = step;
    const m = applyScaling(model, loadScale, genScale);

    let lfResult;
    let converged = false;
    try {
      lfResult = runLoadFlow(m, opts);
      converged = lfResult.converged !== false;
    } catch (_) {
      lfResult = { buses: [], summary: {}, converged: false };
    }

    if (converged) convergedCount++;

    const lfBuses = Array.isArray(lfResult.buses) ? lfResult.buses : [];
    const totalLoadKw   = lfResult.summary?.totalLoadKW  ?? lfBuses.reduce((s, b) => s + (b.Pd ?? 0), 0);
    const totalGenKw    = lfResult.summary?.totalGenKW   ?? 0;
    const totalLossKw   = lfResult.summary?.totalLossKW  ?? 0;

    totalEnergyLossKwh += totalLossKw; // each step assumed = 1 hour

    const busSummary = lfBuses.map(b => ({
      id:    b.id,
      label: b.label || b.name || b.ref || b.id,
      Vm:    Number.isFinite(b.Vm) ? b.Vm : 1.0,
      Pd:    b.Pd ?? 0,
      Pg:    b.Pg ?? 0,
    }));

    const tsEntry = {
      hour,
      loadScale,
      genScale,
      converged,
      buses: busSummary,
      totalLoadKw,
      totalGenKw,
      totalLossKw,
    };
    timeSeries.push(tsEntry);

    // Track per-bus voltage envelope (only from converged steps)
    if (converged) {
      for (const b of busSummary) {
        const { id, label, Vm } = b;
        busNames[id] = label;
        if (busVoltageMax[id] === undefined || Vm > busVoltageMax[id]) busVoltageMax[id] = Vm;
        if (busVoltageMin[id] === undefined || Vm < busVoltageMin[id]) busVoltageMin[id] = Vm;
      }
    }

    if (!peakStep   || totalLoadKw > peakStep.totalLoadKw)   peakStep   = tsEntry;
    if (!valleyStep || totalLoadKw < valleyStep.totalLoadKw) valleyStep = tsEntry;
  }

  // Build bus voltage envelope table
  const busEnvelope = Object.keys(busVoltageMax).map(id => {
    const maxVm = busVoltageMax[id];
    const minVm = busVoltageMin[id];
    return {
      id,
      label:   busNames[id] || id,
      maxVm,
      minVm,
      maxRisk: classifyVoltage(maxVm, 'high'),
      minRisk: classifyVoltage(minVm, 'low'),
    };
  });

  const overVoltageCount  = busEnvelope.filter(b => b.maxRisk === 'fail').length;
  const underVoltageCount = busEnvelope.filter(b => b.minRisk === 'fail').length;

  const warnings = [];
  const divergedCount = timeSeries.length - convergedCount;
  if (divergedCount > 0) {
    warnings.push(`${divergedCount} of ${timeSeries.length} timesteps did not converge — results for those steps are excluded from the voltage envelope.`);
  }
  if (overVoltageCount > 0) {
    warnings.push(`${overVoltageCount} bus(es) exceeded ${VOLTAGE_HIGH_PU} pu — consider reactive compensation or tap adjustment.`);
  }
  if (underVoltageCount > 0) {
    warnings.push(`${underVoltageCount} bus(es) fell below ${VOLTAGE_LOW_PU} pu — consider voltage regulation or conductor upsizing.`);
  }

  // Load-weighted average voltage (across converged steps, slack-bus Vm ≈ 1.0 excluded)
  const convergedSteps = timeSeries.filter(t => t.converged);
  const avgLoadKw = convergedSteps.length > 0
    ? convergedSteps.reduce((s, t) => s + t.totalLoadKw, 0) / convergedSteps.length
    : 0;
  const loadFactor = (peakStep && peakStep.totalLoadKw > 0)
    ? avgLoadKw / peakStep.totalLoadKw
    : null;

  return {
    inputs: { profiles, opts },
    timeSeries,
    busEnvelope,
    peakStep,
    valleyStep,
    totalEnergyLossKwh,
    convergedCount,
    timestepCount: timeSeries.length,
    overVoltageCount,
    underVoltageCount,
    avgLoadKw,
    loadFactor,
    warnings,
  };
}

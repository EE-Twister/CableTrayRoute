/**
 * N-1 Contingency Analysis
 *
 * For each branch (line/cable/transformer) in the one-line model, this module
 * removes that element and re-runs load flow to detect:
 *   - Loss of convergence (island or severe voltage collapse)
 *   - Bus voltage violations (< 0.95 pu or > 1.05 pu by default)
 *   - Branch overloads (loading > 100% of rating)
 *
 * Usage:
 *   import { runContingency } from './contingency.mjs';
 *   const results = runContingency();          // uses live one-line data
 *   const results = runContingency(model);     // explicit load-flow model
 */

import { getOneLine } from '../dataStore.mjs';
import { buildLoadFlowModel, cloneData } from './loadFlowModel.js';
import { runLoadFlow } from './loadFlow.js';

const DEFAULT_OPTS = {
  voltageMinPu: 0.95,
  voltageMaxPu: 1.05,
  overloadThresholdPct: 100,
  baseMVA: 100,
};

/**
 * Collect all branches from the load-flow model.
 * @param {object} model - load-flow model with .branches array
 * @returns {Array<{id:string, name:string, type:string}>}
 */
function collectBranches(model) {
  const branches = [];
  if (Array.isArray(model.branches)) {
    for (const b of model.branches) {
      if (!b || !b.id) continue;
      branches.push({ id: b.id, name: b.name || b.label || b.id, type: b.type || 'branch' });
    }
  }
  // Also gather branches from bus connections (for models without explicit branch list)
  if (branches.length === 0 && Array.isArray(model.buses)) {
    const seen = new Set();
    for (const bus of model.buses) {
      for (const conn of (bus.connections || [])) {
        const connId = conn.componentId || conn.id;
        if (!connId || seen.has(connId)) continue;
        seen.add(connId);
        branches.push({ id: connId, name: conn.componentName || conn.componentLabel || connId, type: conn.componentType || 'branch' });
      }
    }
  }
  return branches;
}

/**
 * Build a contingency model by removing a single branch from the base model.
 * @param {object} baseModel
 * @param {string} removedBranchId
 * @returns {object} modified model (deep copy with branch removed)
 */
function buildContingencyModel(baseModel, removedBranchId) {
  const model = {
    buses: (baseModel.buses || []).map(bus => ({
      ...bus,
      connections: (bus.connections || []).filter(
        conn => (conn.componentId || conn.id) !== removedBranchId
      ),
    })),
    branches: (baseModel.branches || []).filter(b => b.id !== removedBranchId),
  };
  return model;
}

/**
 * Classify voltage level from per-unit voltage magnitude.
 * @param {number} vm - per unit voltage
 * @param {number} min
 * @param {number} max
 * @returns {'normal'|'low'|'high'}
 */
function voltageStatus(vm, min, max) {
  if (!Number.isFinite(vm)) return 'unknown';
  if (vm < min) return 'low';
  if (vm > max) return 'high';
  return 'normal';
}

/**
 * Extract violations from a single load-flow result.
 * @param {object} result - runLoadFlow return value
 * @param {object} opts
 * @returns {Array<{type:string, element:string, value:string}>}
 */
function extractViolations(result, opts) {
  const violations = [];
  if (!result) return violations;

  if (!result.converged) {
    violations.push({ type: 'convergence', element: 'system', value: 'did not converge' });
  }

  for (const bus of (result.buses || [])) {
    const vm = bus.Vm ?? bus.vm ?? bus.voltage;
    const status = voltageStatus(vm, opts.voltageMinPu, opts.voltageMaxPu);
    if (status !== 'normal' && status !== 'unknown') {
      const label = bus.label || bus.name || bus.id || 'unknown bus';
      violations.push({
        type: 'voltage',
        element: label,
        value: `${Number.isFinite(vm) ? vm.toFixed(4) : '?'} pu (${status})`,
      });
    }
  }

  for (const line of (result.lines || [])) {
    const pct = line.loadingPct ?? line.loading_pct;
    if (Number.isFinite(pct) && pct > opts.overloadThresholdPct) {
      const label = line.label || line.name || line.id || 'unknown branch';
      violations.push({
        type: 'overload',
        element: label,
        value: `${pct.toFixed(1)}%`,
      });
    }
  }

  return violations;
}

/**
 * Run N-1 contingency analysis.
 *
 * @param {object|null} [inputModel] - pre-built load-flow model, or null to use live data
 * @param {object} [userOpts]
 * @param {number} [userOpts.voltageMinPu=0.95]
 * @param {number} [userOpts.voltageMaxPu=1.05]
 * @param {number} [userOpts.overloadThresholdPct=100]
 * @param {number} [userOpts.baseMVA=100]
 * @returns {{
 *   baseCase: object,
 *   contingencies: Array<{
 *     branchId: string,
 *     branchName: string,
 *     branchType: string,
 *     converged: boolean,
 *     violations: Array,
 *     critical: boolean
 *   }>,
 *   summary: {
 *     totalBranches: number,
 *     criticalContingencies: number,
 *     totalViolations: number
 *   }
 * }}
 */
export function runContingency(inputModel = null, userOpts = {}) {
  const opts = { ...DEFAULT_OPTS, ...userOpts };

  // Build base model
  const oneLine = getOneLine();
  const baseModel = inputModel || buildLoadFlowModel(oneLine);

  // Run base-case load flow
  const baseResult = runLoadFlow(cloneData(baseModel), { baseMVA: opts.baseMVA });

  // Enumerate all removable branches
  const branches = collectBranches(baseModel);

  const contingencies = [];
  for (const branch of branches) {
    const contingencyModel = buildContingencyModel(baseModel, branch.id);
    let result;
    try {
      result = runLoadFlow(contingencyModel, { baseMVA: opts.baseMVA });
    } catch {
      result = { converged: false, buses: [], lines: [] };
    }

    const violations = extractViolations(result, opts);
    contingencies.push({
      branchId: branch.id,
      branchName: branch.name,
      branchType: branch.type,
      converged: result.converged ?? false,
      violations,
      critical: violations.length > 0,
    });
  }

  const criticalCount = contingencies.filter(c => c.critical).length;
  const totalViolations = contingencies.reduce((sum, c) => sum + c.violations.length, 0);

  return {
    baseCase: baseResult,
    contingencies,
    summary: {
      totalBranches: branches.length,
      criticalContingencies: criticalCount,
      totalViolations,
    },
  };
}

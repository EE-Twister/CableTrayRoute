import { buildLoadFlowModel } from './loadFlowModel.js';
import { runLoadFlow } from './loadFlow.js';

export const OPTIMAL_POWER_FLOW_VERSION = 'optimal-power-flow-v1';

const DEFAULT_CONSTRAINTS = {
  voltageMinPu: 0.95,
  voltageMaxPu: 1.05,
  branchLoadingMaxPct: 100,
  reserveMarginPct: 0,
  objectiveMode: 'cost',
  weights: {
    cost: 1,
    losses: 0.25,
    voltageDeviation: 100,
  },
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function numberValue(value, fallback = 0) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNumber(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function textValue(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function round(value, digits = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generatorKey(row, index) {
  return textValue(row.id || row.generatorId || row.tag || row.name || row.busId || `GEN-${index + 1}`);
}

function generatorTag(row, id) {
  return textValue(row.tag || row.label || row.name || id);
}

function busGenerationKw(bus = {}) {
  return numberValue(bus.generation?.kw ?? bus.generation?.kW ?? bus.Pg ?? bus.kw ?? bus.kW, 0);
}

function busGenerationKvar(bus = {}) {
  return numberValue(bus.generation?.kvar ?? bus.generation?.kVAr ?? bus.Qg ?? bus.kvar ?? bus.kVAr, 0);
}

function busLoadKw(bus = {}) {
  return numberValue(bus.load?.kw ?? bus.load?.kW ?? bus.Pd ?? bus.kwLoad ?? bus.loadKw, 0);
}

function normalizeGenerator(row = {}, index = 0, warnings = []) {
  const id = generatorKey(row, index);
  const busId = textValue(row.busId || row.bus || row.busRef || row.oneLineRef || row.id || id);
  const pExisting = numberValue(row.pMaxKw ?? row.maxKw ?? row.generation?.kw ?? row.kw ?? row.kW ?? row.Pg, 0);
  const pMaxKw = Math.max(0, numberValue(row.pMaxKw ?? row.maxKw ?? row.maximumKw ?? pExisting, pExisting));
  const pMinKw = Math.max(0, Math.min(pMaxKw, numberValue(row.pMinKw ?? row.minKw ?? row.minimumKw, 0)));
  const qMaxKvar = numberValue(row.qMaxKvar ?? row.maxKvar ?? row.generation?.kvar ?? row.kvar ?? row.kVAr, 0);
  const qMinKvar = numberValue(row.qMinKvar ?? row.minKvar, qMaxKvar ? -Math.abs(qMaxKvar) : 0);
  const costNoLoad = numberValue(row.costNoLoad ?? row.noLoadCost, 0);
  const costPerKwhRaw = row.costPerKwh ?? row.costPerKw ?? row.variableCost ?? row.cost;
  const costPerKwh = numberValue(costPerKwhRaw, 0);
  const costQuadratic = Math.max(0, numberValue(row.costQuadratic ?? row.quadraticCost, 0));
  const hasCost = costPerKwhRaw !== undefined || row.costQuadratic !== undefined || row.quadraticCost !== undefined || row.costNoLoad !== undefined;
  if (!hasCost && pMaxKw > 0) {
    warnings.push({
      severity: 'warning',
      code: 'missing-generator-cost',
      message: `Generator ${id} is missing cost data; dispatch cost uses zero values until costs are entered.`,
      generatorId: id,
    });
  }
  if (pMaxKw <= 0) {
    warnings.push({
      severity: 'warning',
      code: 'missing-generator-limit',
      message: `Generator ${id} has no positive pMaxKw limit and cannot support dispatch.`,
      generatorId: id,
    });
  }
  return {
    id,
    tag: generatorTag(row, id),
    busId,
    enabled: row.enabled !== false && row.status !== 'disabled',
    pMinKw,
    pMaxKw,
    qMinKvar,
    qMaxKvar,
    costNoLoad,
    costPerKwh,
    costQuadratic,
    rampLimitKw: nullableNumber(row.rampLimitKw ?? row.rampKw),
    emissionsRate: nullableNumber(row.emissionsRate ?? row.emissionsRateLbPerMwh),
    priority: numberValue(row.priority, index + 1),
    source: row.source || 'user',
    metadata: asObject(row.metadata),
  };
}

function generatorsFromModel(model = {}) {
  return asArray(model.buses)
    .filter(bus => busGenerationKw(bus) > 0 || busGenerationKvar(bus) !== 0 || bus.type === 'slack')
    .map((bus, index) => {
      const existingKw = busGenerationKw(bus);
      const pMaxKw = existingKw > 0 ? existingKw : Math.max(busLoadKw(bus), 0);
      return {
        id: bus.id || `bus-${index + 1}`,
        tag: bus.displayLabel || bus.name || bus.label || bus.id || `Bus ${index + 1}`,
        busId: bus.id,
        pMinKw: 0,
        pMaxKw,
        qMinKvar: -Math.abs(busGenerationKvar(bus)),
        qMaxKvar: Math.abs(busGenerationKvar(bus)),
        source: 'loadFlowModel',
      };
    })
    .filter(row => row.busId);
}

function mergeConstraints(input = {}) {
  const raw = asObject(input);
  const weights = { ...DEFAULT_CONSTRAINTS.weights, ...asObject(raw.weights) };
  return {
    voltageMinPu: numberValue(raw.voltageMinPu ?? raw.minVoltagePu, DEFAULT_CONSTRAINTS.voltageMinPu),
    voltageMaxPu: numberValue(raw.voltageMaxPu ?? raw.maxVoltagePu, DEFAULT_CONSTRAINTS.voltageMaxPu),
    branchLoadingMaxPct: numberValue(raw.branchLoadingMaxPct ?? raw.branchMaxPct, DEFAULT_CONSTRAINTS.branchLoadingMaxPct),
    reserveMarginPct: Math.max(0, numberValue(raw.reserveMarginPct ?? raw.reservePct, DEFAULT_CONSTRAINTS.reserveMarginPct)),
    objectiveMode: textValue(raw.objectiveMode || raw.objective || DEFAULT_CONSTRAINTS.objectiveMode),
    weights,
  };
}

function totalLoadKw(model = {}) {
  return asArray(model.buses).reduce((sum, bus) => sum + busLoadKw(bus), 0);
}

export function normalizeOptimalPowerFlowCase(context = {}) {
  const warnings = [];
  const oneLine = context.oneLine || context.oneLineDiagram || null;
  let model = context.model || context.loadFlowModel || null;
  if (!model && oneLine) {
    model = buildLoadFlowModel(oneLine);
  }
  model = model ? cloneJson(model) : { buses: [], branches: [] };
  if (!asArray(model.buses).length) {
    warnings.push({
      severity: 'warning',
      code: 'missing-network',
      message: 'No one-line/load-flow buses are available for OPF screening.',
    });
  }
  const explicitGenerators = asArray(context.generators);
  const generatorRows = [
    ...(explicitGenerators.length ? [] : generatorsFromModel(model)),
    ...explicitGenerators,
    ...asArray(context.generatorOverrides),
  ];
  const seen = new Map();
  generatorRows.forEach((row, index) => {
    const normalized = normalizeGenerator(row, index, warnings);
    const key = normalized.id || normalized.busId || `GEN-${index + 1}`;
    seen.set(key, { ...(seen.get(key) || {}), ...normalized });
  });
  const generators = [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (!generators.length) {
    warnings.push({
      severity: 'warning',
      code: 'missing-generators',
      message: 'No dispatchable generator rows were found. Add one-line generator data or manual OPF generator rows.',
    });
  }
  const constraints = mergeConstraints({
    ...asObject(context.constraints),
    objectiveMode: context.objectiveMode ?? context.objective ?? context.constraints?.objectiveMode,
    reserveMarginPct: context.reserveMarginPct ?? context.constraints?.reserveMarginPct,
  });
  const loadKw = Math.max(0, numberValue(context.totalDemandKw ?? context.loadKw ?? totalLoadKw(model), totalLoadKw(model)));
  return {
    version: OPTIMAL_POWER_FLOW_VERSION,
    projectName: textValue(context.projectName, 'Untitled Project'),
    generatedAt: context.generatedAt || new Date().toISOString(),
    model,
    generators,
    totalDemandKw: loadKw,
    constraints,
    objective: {
      mode: constraints.objectiveMode,
      weights: constraints.weights,
    },
    warnings,
    assumptions: [
      'OPF screening uses deterministic economic dispatch with AC load-flow feasibility checks.',
      'This is a planning-grade local optimizer, not a full nonlinear AC OPF interior-point engine.',
      'Transformer tap, capacitor, generator voltage, and reactive dispatch changes are advisory in V1.',
      'Missing generator costs or limits are reported instead of guessed.',
    ],
  };
}

function generatorCost(gen, pKw) {
  if (!gen.enabled || pKw <= 0) return 0;
  return gen.costNoLoad + gen.costPerKwh * pKw + gen.costQuadratic * pKw * pKw;
}

function marginalCost(gen, pKw) {
  return gen.costPerKwh + 2 * gen.costQuadratic * pKw;
}

function dispatchWithLambda(generators, demandKw, lambda) {
  return generators.map(gen => {
    if (!gen.enabled || gen.pMaxKw <= 0) return 0;
    if (gen.costQuadratic > 0) {
      const raw = (lambda - gen.costPerKwh) / (2 * gen.costQuadratic);
      return Math.max(gen.pMinKw, Math.min(gen.pMaxKw, raw));
    }
    return gen.pMinKw;
  });
}

function total(values) {
  return values.reduce((sum, value) => sum + value, 0);
}

export function solveEconomicDispatch(caseData, options = {}) {
  const data = caseData?.generators ? caseData : normalizeOptimalPowerFlowCase(caseData || {});
  const reserveMarginPct = numberValue(options.reserveMarginPct ?? data.constraints?.reserveMarginPct, 0);
  const demandKw = Math.max(0, numberValue(options.demandKw ?? data.totalDemandKw, 0) * (1 + reserveMarginPct / 100));
  const warnings = [...asArray(data.warnings)];
  const enabled = asArray(data.generators).filter(gen => gen.enabled && gen.pMaxKw > 0);
  const minCapacity = total(enabled.map(gen => gen.pMinKw));
  const maxCapacity = total(enabled.map(gen => gen.pMaxKw));
  if (!enabled.length) {
    warnings.push({
      severity: 'error',
      code: 'no-enabled-generators',
      message: 'No enabled generator with positive pMaxKw is available for economic dispatch.',
    });
  }
  if (maxCapacity + 1e-9 < demandKw) {
    warnings.push({
      severity: 'error',
      code: 'insufficient-generation-capacity',
      message: `Enabled generation capacity ${round(maxCapacity)} kW is below required demand plus reserve ${round(demandKw)} kW.`,
    });
  }
  let dispatchById = new Map();
  if (enabled.length && maxCapacity + 1e-9 >= demandKw) {
    const quadratic = enabled.filter(gen => gen.costQuadratic > 0);
    const linear = enabled.filter(gen => gen.costQuadratic <= 0).sort((a, b) => (
      a.costPerKwh - b.costPerKwh
      || a.priority - b.priority
      || a.id.localeCompare(b.id)
    ));
    if (quadratic.length === enabled.length) {
      let low = Math.min(...enabled.map(gen => marginalCost(gen, gen.pMinKw))) - 1000;
      let high = Math.max(...enabled.map(gen => marginalCost(gen, gen.pMaxKw))) + 1000;
      for (let i = 0; i < 90; i += 1) {
        const mid = (low + high) / 2;
        const dispatched = dispatchWithLambda(enabled, demandKw, mid);
        if (total(dispatched) < demandKw) low = mid; else high = mid;
      }
      const dispatched = dispatchWithLambda(enabled, demandKw, (low + high) / 2);
      enabled.forEach((gen, index) => dispatchById.set(gen.id, dispatched[index]));
    } else {
      let remaining = Math.max(0, demandKw - minCapacity);
      enabled.forEach(gen => dispatchById.set(gen.id, gen.pMinKw));
      linear.forEach(gen => {
        const headroom = Math.max(0, gen.pMaxKw - (dispatchById.get(gen.id) || 0));
        const add = Math.min(headroom, remaining);
        dispatchById.set(gen.id, (dispatchById.get(gen.id) || 0) + add);
        remaining -= add;
      });
      quadratic
        .sort((a, b) => marginalCost(a, a.pMinKw) - marginalCost(b, b.pMinKw) || a.id.localeCompare(b.id))
        .forEach(gen => {
          const headroom = Math.max(0, gen.pMaxKw - (dispatchById.get(gen.id) || 0));
          const add = Math.min(headroom, remaining);
          dispatchById.set(gen.id, (dispatchById.get(gen.id) || 0) + add);
          remaining -= add;
        });
    }
  } else {
    enabled.forEach(gen => dispatchById.set(gen.id, gen.pMaxKw));
  }
  const dispatchRows = asArray(data.generators).map(gen => {
    const pKw = round(dispatchById.get(gen.id) || 0, 6) || 0;
    const qRange = Math.max(0, gen.qMaxKvar - gen.qMinKvar);
    const qKvar = qRange > 0 && gen.pMaxKw > 0 ? round(gen.qMinKvar + qRange * (pKw / gen.pMaxKw), 3) : 0;
    const binding = [];
    if (!gen.enabled || gen.pMaxKw <= 0) binding.push('offline');
    if (pKw <= gen.pMinKw + 1e-6 && gen.enabled) binding.push('pMin');
    if (pKw >= gen.pMaxKw - 1e-6 && gen.enabled) binding.push('pMax');
    return {
      generatorId: gen.id,
      generatorTag: gen.tag,
      busId: gen.busId,
      enabled: gen.enabled,
      pMinKw: gen.pMinKw,
      pMaxKw: gen.pMaxKw,
      qMinKvar: gen.qMinKvar,
      qMaxKvar: gen.qMaxKvar,
      dispatchedKw: pKw,
      dispatchedKvar: qKvar,
      marginalCost: round(marginalCost(gen, pKw), 5),
      totalCost: round(generatorCost(gen, pKw), 5),
      status: !gen.enabled || gen.pMaxKw <= 0 ? 'offline' : binding.includes('pMax') ? 'max' : binding.includes('pMin') ? 'min' : 'dispatched',
      bindingConstraints: binding,
      source: gen.source,
    };
  });
  const totalDispatchedKw = round(total(dispatchRows.map(row => row.dispatchedKw)), 6) || 0;
  const runningRows = dispatchRows.filter(row => row.dispatchedKw > 1e-6);
  return {
    feasible: enabled.length > 0 && maxCapacity + 1e-9 >= demandKw && totalDispatchedKw + 1e-6 >= Math.min(demandKw, maxCapacity),
    demandKw: round(demandKw, 6),
    totalDispatchedKw,
    minCapacityKw: round(minCapacity, 6),
    maxCapacityKw: round(maxCapacity, 6),
    marginalCost: round(Math.max(0, ...runningRows.map(row => row.marginalCost || 0)), 5),
    dispatchRows,
    objective: {
      generationCost: round(total(dispatchRows.map(row => row.totalCost || 0)), 5),
    },
    warnings,
  };
}

function branchRatingFor(line, model = {}) {
  const branchId = line.componentId || line.id || line.branchId;
  const branch = asArray(model.branches).find(row => row.id === branchId || row.componentId === branchId || (row.from === line.from && row.to === line.to));
  return nullableNumber(line.rating ?? branch?.rating ?? branch?.ampacity ?? branch?.thermalRatingKw);
}

function branchLoadingPct(line, rating) {
  if (!rating || rating <= 0) return null;
  const apparent = Math.sqrt(numberValue(line.P, 0) ** 2 + numberValue(line.Q, 0) ** 2);
  return apparent / rating * 100;
}

function statusFromMargin(margin, warnBand = 5) {
  if (margin === null || margin === undefined || !Number.isFinite(Number(margin))) return 'missingData';
  if (margin < 0) return 'fail';
  if (margin <= warnBand) return 'warn';
  return 'pass';
}

function applyDispatchToModel(model = {}, dispatchRows = []) {
  const next = cloneJson(model);
  const byBus = new Map();
  asArray(dispatchRows).forEach(row => {
    if (!row.busId) return;
    const existing = byBus.get(row.busId) || { kw: 0, kvar: 0 };
    existing.kw += numberValue(row.dispatchedKw, 0);
    existing.kvar += numberValue(row.dispatchedKvar, 0);
    byBus.set(row.busId, existing);
  });
  next.buses = asArray(next.buses).map(bus => {
    if (!byBus.has(bus.id)) return bus;
    return { ...bus, generation: byBus.get(bus.id) };
  });
  return next;
}

function buildConstraintRows(caseData, loadFlowResult = {}) {
  const constraints = caseData.constraints || DEFAULT_CONSTRAINTS;
  const rows = [];
  asArray(loadFlowResult.buses).forEach(bus => {
    const vm = numberValue(bus.Vm, null);
    if (!Number.isFinite(vm)) return;
    const lowMargin = vm - constraints.voltageMinPu;
    const highMargin = constraints.voltageMaxPu - vm;
    const margin = Math.min(lowMargin, highMargin);
    rows.push({
      id: `voltage:${bus.id}`,
      targetType: 'bus',
      targetId: bus.id,
      metric: 'voltagePu',
      limit: `${constraints.voltageMinPu}-${constraints.voltageMaxPu} pu`,
      actualValue: round(vm, 5),
      margin: round(margin, 5),
      status: statusFromMargin(margin, 0.01),
      recommendation: margin < 0
        ? 'Review dispatch, voltage support, transformer taps, or load-flow model assumptions.'
        : margin <= 0.01
          ? 'Voltage is close to the screening limit; review before release.'
          : 'Voltage is within screening limits.',
    });
  });
  asArray(loadFlowResult.lines).forEach(line => {
    const rating = branchRatingFor(line, caseData.model);
    const loading = branchLoadingPct(line, rating);
    if (loading === null) {
      rows.push({
        id: `branch:${line.componentId || `${line.from}-${line.to}`}`,
        targetType: 'branch',
        targetId: line.componentId || `${line.from}-${line.to}`,
        metric: 'branchLoadingPct',
        limit: `${constraints.branchLoadingMaxPct}%`,
        actualValue: null,
        margin: null,
        status: 'missingData',
        recommendation: 'Add a branch rating to evaluate OPF branch loading.',
      });
      return;
    }
    const margin = constraints.branchLoadingMaxPct - loading;
    rows.push({
      id: `branch:${line.componentId || `${line.from}-${line.to}`}`,
      targetType: 'branch',
      targetId: line.componentId || `${line.from}-${line.to}`,
      metric: 'branchLoadingPct',
      limit: `${constraints.branchLoadingMaxPct}%`,
      actualValue: round(loading, 3),
      margin: round(margin, 3),
      status: statusFromMargin(margin, 5),
      recommendation: margin < 0
        ? 'Reduce dispatch through the overloaded branch, revise routing/topology, or increase branch rating.'
        : margin <= 5
          ? 'Branch loading is close to the OPF screening limit.'
          : 'Branch loading is within screening limits.',
    });
  });
  return rows;
}

function objectiveScore(caseData, dispatch, loadFlowResult, constraintRows) {
  const constraints = caseData.constraints || DEFAULT_CONSTRAINTS;
  const mode = constraints.objectiveMode || 'cost';
  const cost = numberValue(dispatch.objective?.generationCost, 0);
  const lossKw = numberValue(loadFlowResult.losses?.P ?? loadFlowResult.summary?.totalLossKW, 0);
  const voltageDeviation = asArray(loadFlowResult.buses).reduce((sum, bus) => sum + Math.abs(numberValue(bus.Vm, 1) - 1), 0);
  const failPenalty = constraintRows.filter(row => row.status === 'fail').length * 1_000_000;
  const weights = constraints.weights || DEFAULT_CONSTRAINTS.weights;
  const weighted = cost * numberValue(weights.cost, 1)
    + lossKw * numberValue(weights.losses, 0.25)
    + voltageDeviation * numberValue(weights.voltageDeviation, 100)
    + failPenalty;
  const scores = {
    cost: cost + failPenalty,
    losses: lossKw + failPenalty,
    voltageDeviation: voltageDeviation + failPenalty,
    weighted,
  };
  return {
    mode,
    generationCost: round(cost, 5),
    lossKw: round(lossKw, 6),
    voltageDeviation: round(voltageDeviation, 6),
    score: round(scores[mode] ?? weighted, 6),
    weightedScore: round(weighted, 6),
  };
}

export function evaluateOptimalPowerFlowCandidate(caseData, dispatch, options = {}) {
  const data = caseData?.generators ? caseData : normalizeOptimalPowerFlowCase(caseData || {});
  const candidateDispatch = dispatch?.dispatchRows ? dispatch : solveEconomicDispatch(data, options);
  const candidateModel = applyDispatchToModel(data.model, candidateDispatch.dispatchRows);
  const loadFlowResult = runLoadFlow(candidateModel, {
    baseMVA: numberValue(options.baseMVA, numberValue(data.baseMVA, 100)),
    balanced: options.balanced !== false,
    maxIterations: numberValue(options.maxIterations, 30),
  });
  const constraintRows = buildConstraintRows(data, loadFlowResult);
  const violations = constraintRows.filter(row => row.status === 'fail' || row.status === 'warn' || row.status === 'missingData');
  const warnings = [
    ...asArray(candidateDispatch.warnings),
    ...asArray(loadFlowResult.warnings).map(message => ({
      severity: 'warning',
      code: 'load-flow-warning',
      message,
    })),
  ];
  if (!loadFlowResult.converged) {
    warnings.push({
      severity: 'error',
      code: 'load-flow-not-converged',
      message: 'Load-flow feasibility check did not converge for the OPF dispatch candidate.',
    });
  }
  const objective = objectiveScore(data, candidateDispatch, loadFlowResult, constraintRows);
  const failCount = constraintRows.filter(row => row.status === 'fail').length;
  return {
    feasible: Boolean(candidateDispatch.feasible && loadFlowResult.converged && failCount === 0),
    dispatchRows: candidateDispatch.dispatchRows,
    constraintRows,
    loadFlowResult,
    violations,
    warnings,
    objective,
  };
}

export function runOptimalPowerFlow(context = {}, options = {}) {
  const caseData = normalizeOptimalPowerFlowCase(context);
  const dispatch = solveEconomicDispatch(caseData, options);
  const evaluation = evaluateOptimalPowerFlowCandidate(caseData, dispatch, options);
  const warnings = [...asArray(caseData.warnings), ...asArray(dispatch.warnings), ...asArray(evaluation.warnings)];
  const uniqueWarnings = [];
  const seenWarnings = new Set();
  warnings.forEach(warning => {
    const key = `${warning.code || ''}:${warning.message || warning}`;
    if (seenWarnings.has(key)) return;
    seenWarnings.add(key);
    uniqueWarnings.push(warning);
  });
  const result = {
    version: OPTIMAL_POWER_FLOW_VERSION,
    generatedAt: caseData.generatedAt,
    projectName: caseData.projectName,
    objective: evaluation.objective,
    summary: null,
    dispatchRows: evaluation.dispatchRows,
    constraintRows: evaluation.constraintRows,
    loadFlowResult: evaluation.loadFlowResult,
    violations: evaluation.violations,
    warnings: uniqueWarnings,
    assumptions: caseData.assumptions,
    recommendations: [],
  };
  result.summary = summarizeOptimalPowerFlow(result);
  result.recommendations = buildRecommendations(result);
  return result;
}

function buildRecommendations(result = {}) {
  const recommendations = [];
  if (result.summary?.feasible === false) {
    recommendations.push('Resolve OPF infeasibility before using dispatch values for planning reports.');
  }
  if ((result.summary?.insufficientCapacity || 0) > 0) {
    recommendations.push('Add enabled generation capacity, reduce load, or revise reserve margin assumptions.');
  }
  if ((result.summary?.voltageViolations || 0) > 0) {
    recommendations.push('Review voltage support, tap settings, generator voltage targets, and load-flow inputs.');
  }
  if ((result.summary?.branchViolations || 0) > 0) {
    recommendations.push('Review branch ratings, topology, or dispatch limits for overloaded paths.');
  }
  if ((result.summary?.missingData || 0) > 0) {
    recommendations.push('Complete missing generator cost/limit and branch rating data before release.');
  }
  if (!recommendations.length) {
    recommendations.push('Dispatch candidate passes V1 screening constraints; retain manufacturer and engineering verification notes in issued reports.');
  }
  return recommendations;
}

export function summarizeOptimalPowerFlow(result = {}) {
  const dispatchRows = asArray(result.dispatchRows);
  const constraints = asArray(result.constraintRows);
  const warnings = asArray(result.warnings);
  const fail = constraints.filter(row => row.status === 'fail').length;
  const warn = constraints.filter(row => row.status === 'warn').length;
  const missingData = constraints.filter(row => row.status === 'missingData').length
    + warnings.filter(warning => /missing/i.test(warning.code || warning.message || '')).length;
  const voltageViolations = constraints.filter(row => row.metric === 'voltagePu' && row.status === 'fail').length;
  const branchViolations = constraints.filter(row => row.metric === 'branchLoadingPct' && row.status === 'fail').length;
  const insufficientCapacity = warnings.filter(warning => warning.code === 'insufficient-generation-capacity' || warning.code === 'no-enabled-generators').length;
  const generationCost = numberValue(result.objective?.generationCost, 0);
  const lossKw = numberValue(result.objective?.lossKw, numberValue(result.loadFlowResult?.summary?.totalLossKW, 0));
  return {
    feasible: fail === 0 && insufficientCapacity === 0 && result.loadFlowResult?.converged !== false,
    generatorCount: dispatchRows.length,
    dispatchedCount: dispatchRows.filter(row => row.dispatchedKw > 0).length,
    totalDispatchedKw: round(total(dispatchRows.map(row => row.dispatchedKw)), 3),
    generationCost: round(generationCost, 5),
    lossKw: round(lossKw, 6),
    fail,
    warn,
    missingData,
    voltageViolations,
    branchViolations,
    insufficientCapacity,
    objectiveMode: result.objective?.mode || 'cost',
    objectiveScore: result.objective?.score ?? null,
  };
}

export function buildOptimalPowerFlowPackage(context = {}) {
  if (context?.dispatchRows && context?.constraintRows && context?.summary) {
    return {
      version: context.version || OPTIMAL_POWER_FLOW_VERSION,
      generatedAt: context.generatedAt || new Date().toISOString(),
      projectName: context.projectName || 'Untitled Project',
      ...context,
      summary: context.summary || summarizeOptimalPowerFlow(context),
      assumptions: asArray(context.assumptions).length ? context.assumptions : normalizeOptimalPowerFlowCase(context).assumptions,
    };
  }
  return runOptimalPowerFlow(context, context.options || {});
}

export function renderOptimalPowerFlowHTML(pkg = {}) {
  const summary = pkg.summary || summarizeOptimalPowerFlow(pkg);
  const status = summary.feasible ? 'pass' : 'fail';
  return `<section class="report-section" id="rpt-optimal-power-flow">
  <h2>Optimal Power Flow</h2>
  <p class="report-note">Planning-grade deterministic economic dispatch with AC load-flow feasibility screening. This is not a commercial nonlinear AC OPF engine or formal dispatch instruction.</p>
  <dl class="report-dl">
    <dt>Status</dt><dd>${escapeHtml(status)}</dd>
    <dt>Objective</dt><dd>${escapeHtml(summary.objectiveMode)}</dd>
    <dt>Dispatched Generation</dt><dd>${escapeHtml(summary.totalDispatchedKw)} kW</dd>
    <dt>Generation Cost</dt><dd>${escapeHtml(summary.generationCost)}</dd>
    <dt>Losses</dt><dd>${escapeHtml(summary.lossKw)} kW</dd>
    <dt>Violations</dt><dd>${escapeHtml(summary.fail)} fail, ${escapeHtml(summary.warn)} warn, ${escapeHtml(summary.missingData)} missing data</dd>
  </dl>
  <h3>Dispatch Rows</h3>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Generator</th><th>Bus</th><th>Min kW</th><th>Max kW</th><th>Dispatch kW</th><th>Dispatch kVAR</th><th>Marginal Cost</th><th>Status</th><th>Binding</th></tr></thead>
      <tbody>${asArray(pkg.dispatchRows).length ? asArray(pkg.dispatchRows).map(row => `<tr>
        <td>${escapeHtml(row.generatorTag || row.generatorId)}</td>
        <td>${escapeHtml(row.busId)}</td>
        <td>${escapeHtml(row.pMinKw)}</td>
        <td>${escapeHtml(row.pMaxKw)}</td>
        <td>${escapeHtml(row.dispatchedKw)}</td>
        <td>${escapeHtml(row.dispatchedKvar)}</td>
        <td>${escapeHtml(row.marginalCost)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(asArray(row.bindingConstraints).join(', '))}</td>
      </tr>`).join('') : '<tr><td colspan="9">No dispatch rows available.</td></tr>'}</tbody>
    </table>
  </div>
  <h3>Constraints</h3>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Target</th><th>Metric</th><th>Limit</th><th>Actual</th><th>Margin</th><th>Status</th><th>Recommendation</th></tr></thead>
      <tbody>${asArray(pkg.constraintRows).length ? asArray(pkg.constraintRows).map(row => `<tr>
        <td>${escapeHtml(row.targetId)}</td>
        <td>${escapeHtml(row.metric)}</td>
        <td>${escapeHtml(row.limit)}</td>
        <td>${escapeHtml(row.actualValue ?? '')}</td>
        <td>${escapeHtml(row.margin ?? '')}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.recommendation)}</td>
      </tr>`).join('') : '<tr><td colspan="7">No constraints evaluated.</td></tr>'}</tbody>
    </table>
  </div>
  ${asArray(pkg.warnings).length ? `<h3>Warnings</h3><ul>${asArray(pkg.warnings).map(warning => `<li>${escapeHtml(warning.message || warning)}</li>`).join('')}</ul>` : ''}
  ${asArray(pkg.assumptions).length ? `<h3>Assumptions</h3><ul>${asArray(pkg.assumptions).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
</section>`;
}

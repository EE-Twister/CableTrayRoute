/**
 * Project-integrated voltage-drop recommendation study.
 *
 * Cable Schedule values take precedence. Missing operating current and voltage
 * can be resolved from a converged Load Flow result or the Load List. Results
 * include individual-circuit and feeder-plus-branch path recommendations.
 */

import { NEC_AMPACITY_TABLE } from './autoSize.mjs';
import { calculateVoltageDrop, describeVoltageDropBasis } from '../src/voltageDrop.js';
import { normalizeCablePhases } from '../utils/cablePhases.js';

export const NEC_LIMITS = {
  feeder: 3,
  branch: 3,
  combined: 5,
};

function finiteNumber(...values) {
  for (const value of values) {
    if (value === '' || value == null) continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function normalizedIdentifier(value) {
  return String(value ?? '').trim().toLowerCase();
}

function aliases(record, keys) {
  return keys
    .map(key => normalizedIdentifier(record?.[key]))
    .filter(Boolean);
}

function buildAliasMap(records, keys) {
  const map = new Map();
  (Array.isArray(records) ? records : []).forEach(record => {
    aliases(record, keys).forEach(alias => {
      if (!map.has(alias)) map.set(alias, record);
    });
  });
  return map;
}

function powerFactorFromPQ(kw, kvar, fallback = 0.9) {
  const p = Math.abs(Number(kw) || 0);
  const q = Math.abs(Number(kvar) || 0);
  const kva = Math.hypot(p, q);
  return kva > 0 ? Math.min(1, Math.max(0.01, p / kva)) : fallback;
}

export function currentFromLoad(load = {}, voltageOverride = 0, phaseOverride = 0) {
  const direct = finiteNumber(
    load.current,
    load.amps,
    load.currentA,
    load.load_current,
    load.est_load,
  );
  if (direct > 0) return direct;
  const kw = finiteNumber(load.kw, load.kW, load.power_kw, load.power);
  const voltage = finiteNumber(voltageOverride, load.voltage, load.voltageV, load.nominal_voltage);
  const phases = finiteNumber(phaseOverride, load.phases, load.num_phases, 3);
  const pf = finiteNumber(load.powerFactor, load.power_factor, load.pf, 0.9);
  if (!(kw > 0 && voltage > 0 && pf > 0)) return 0;
  return phases === 1
    ? (kw * 1000) / (voltage * pf)
    : (kw * 1000) / (Math.sqrt(3) * voltage * pf);
}

export function resolveCableStudyInputs(cables = [], loads = [], loadFlowResult = null) {
  const loadMap = buildAliasMap(loads, [
    'id', 'tag', 'ref', 'load_tag', 'equipment_tag', 'name', 'description',
  ]);
  const flowMap = buildAliasMap(loadFlowResult?.buses, [
    'id', 'name', 'label', 'ref', 'displayLabel',
  ]);

  return (Array.isArray(cables) ? cables : []).map(cable => {
    const destinationAliases = aliases(cable, [
      'to_location', 'destination', 'to_tag', 'to', 'load_id', 'load_tag',
    ]);
    const flowBus = destinationAliases.map(alias => flowMap.get(alias)).find(Boolean);
    const load = destinationAliases.map(alias => loadMap.get(alias)).find(Boolean);
    const explicitCurrent = finiteNumber(
      cable.est_load,
      cable.current,
      cable.load_current,
      cable.amps,
    );
    // cable_rating is the insulation class (600 V, 5 kV, ...), not the operating voltage:
    // a 600 V cable on a 480 V system would understate the % drop by 20%. It is used only
    // when no operating voltage, load-flow bus or load-list voltage is available.
    const explicitVoltage = finiteNumber(
      cable.operating_voltage,
      cable.voltage,
      cable.voltageV,
    );
    const ratingVoltage = finiteNumber(cable.cable_rating);
    const phaseLabels = normalizeCablePhases(cable?.phases ?? cable?.num_phases);
    const phases = phaseLabels.length || finiteNumber(load?.phases, 3);
    const flowVoltage = finiteNumber(flowBus?.voltageV, Number(flowBus?.baseKV) * 1000);
    const loadVoltage = finiteNumber(load?.voltage, load?.voltageV, load?.nominal_voltage);
    const voltage = explicitVoltage || flowVoltage || loadVoltage || ratingVoltage;
    const flowPf = powerFactorFromPQ(flowBus?.Pd, flowBus?.Qd, 0.9);
    const flowCurrent = flowBus
      ? currentFromLoad({
          kw: flowBus.Pd,
          voltage,
          phases,
          powerFactor: flowPf,
        }, voltage, phases)
      : 0;
    const loadCurrent = load ? currentFromLoad(load, voltage, phases) : 0;
    const current = explicitCurrent || flowCurrent || loadCurrent;

    let currentSource = 'missing';
    if (explicitCurrent > 0) currentSource = 'Cable Schedule';
    else if (flowCurrent > 0) currentSource = 'Load Flow';
    else if (loadCurrent > 0) currentSource = 'Load List';

    let voltageSource = 'missing';
    if (explicitVoltage > 0) voltageSource = 'Cable Schedule';
    else if (flowVoltage > 0) voltageSource = 'Load Flow';
    else if (loadVoltage > 0) voltageSource = 'Load List';
    else if (ratingVoltage > 0) voltageSource = 'Cable insulation rating (assumed)';

    return {
      ...cable,
      est_load: current || cable.est_load,
      operating_voltage: voltage || cable.operating_voltage,
      phases,
      _voltageDropInputSource: {
        current: currentSource,
        voltage: voltageSource,
        loadId: load?.id || load?.tag || null,
        loadFlowBusId: flowBus?.id || null,
      },
    };
  });
}

export function classifyCircuit(cable) {
  const classification = `${cable?.circuit_type || cable?.service_type || ''}`.toLowerCase();
  if (classification.includes('feeder') || classification.includes('main') || classification.includes('distribution')) {
    return 'feeder';
  }
  const cableType = `${cable?.cable_type || cable?.type || ''}`.toLowerCase();
  if (cableType.includes('feeder') || cableType.includes('main') || cableType.includes('distribution')) {
    return 'feeder';
  }
  return 'branch';
}

function statusForDrop(dropPct, limit, evaluated) {
  if (!evaluated) return 'not-evaluated';
  if (dropPct > limit) return 'fail';
  if (dropPct > limit * 0.8) return 'warn';
  return 'pass';
}

export function evaluateCable(cable, lengthFt) {
  const len = finiteNumber(lengthFt ?? cable?.length ?? cable?.route_length);
  const phaseLabels = normalizeCablePhases(cable?.phases ?? cable?.num_phases ?? cable);
  const phase = phaseLabels.length || 3;
  const currentA = finiteNumber(cable?.est_load, cable?.current, cable?.load_current);
  const voltageV = finiteNumber(cable?.operating_voltage, cable?.voltage, cable?.cable_rating);
  const conductorSize = cable?.conductor_size || '';
  const normalizedCable = {
    ...cable,
    est_load: currentA,
    operating_voltage: voltageV,
    parallel_count: cable?.parallel_count ?? cable?.parallel_runs ?? cable?.parallel ?? 1,
  };
  const calculated = calculateVoltageDrop(normalizedCable, len, phase);
  const dropPct = Number.isFinite(calculated) ? calculated : 0;
  const circuitType = classifyCircuit(cable);
  const limit = NEC_LIMITS[circuitType];
  const evaluated = len > 0 && currentA > 0 && voltageV > 0 && Boolean(conductorSize)
    && Number.isFinite(calculated) && calculated >= 0;
  const tag = cable?.cable_tag || cable?.tag || cable?.id || '';
  const from = cable?.from_location || cable?.origin || cable?.from_tag || cable?.from || '';
  const to = cable?.to_location || cable?.destination || cable?.to_tag || cable?.to || '';

  return {
    id: cable?.id || tag,
    tag,
    from,
    to,
    fromKey: normalizedIdentifier(from),
    toKey: normalizedIdentifier(to),
    conductorSize,
    material: cable?.conductor_material || 'CU',
    phases: phase,
    phaseLabels,
    parallelCount: normalizedCable.parallel_count,
    lengthFt: len,
    currentA,
    voltageV,
    dropPct,
    dropV: voltageV > 0 ? voltageV * dropPct / 100 : 0,
    circuitType,
    limit,
    limitPct: limit,
    status: statusForDrop(dropPct, limit, evaluated),
    evaluated,
    inputSource: cable?._voltageDropInputSource || {
      current: currentA > 0 ? 'Cable Schedule' : 'missing',
      voltage: voltageV > 0 ? 'Cable Schedule' : 'missing',
    },
    basis: `NEC 2023 voltage-drop informational-note recommendation; ${describeVoltageDropBasis(normalizedCable)}`,
  };
}

function buildPathForResult(result, resultByDestination) {
  const reversed = [result];
  const visited = new Set([result.tag || result.id]);
  let cursor = result;
  for (let depth = 0; depth < 100; depth += 1) {
    const upstreamCandidates = resultByDestination.get(cursor.fromKey) || [];
    const upstream = upstreamCandidates.find(candidate => !visited.has(candidate.tag || candidate.id));
    if (!upstream) break;
    reversed.push(upstream);
    visited.add(upstream.tag || upstream.id);
    cursor = upstream;
  }
  return reversed.reverse();
}

export function addCombinedPathResults(results = []) {
  const resultByDestination = new Map();
  results.forEach(result => {
    if (!result.toKey) return;
    if (!resultByDestination.has(result.toKey)) resultByDestination.set(result.toKey, []);
    resultByDestination.get(result.toKey).push(result);
  });

  return results.map(result => {
    const path = buildPathForResult(result, resultByDestination);
    const pathEvaluated = path.every(item => item.evaluated);
    const combinedDropPct = pathEvaluated
      ? path.reduce((sum, item) => sum + item.dropPct, 0)
      : 0;
    const types = new Set(path.map(item => item.circuitType));
    const combinedLimitPct = types.has('feeder') && types.has('branch')
      ? NEC_LIMITS.combined
      : result.limit;
    const upstreamDropPct = Math.max(0, combinedDropPct - result.dropPct);
    return {
      ...result,
      pathTags: path.map(item => item.tag || item.id),
      pathEvaluated,
      upstreamDropPct,
      combinedDropPct,
      combinedLimitPct,
      combinedStatus: statusForDrop(combinedDropPct, combinedLimitPct, pathEvaluated),
    };
  });
}

function normalizedSize(value) {
  return String(value ?? '')
    .trim()
    .replace(/^#/, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function recommendConductorForDrop(cable, targetDropPct) {
  if (!(Number(targetDropPct) > 0)) return null;
  const currentSize = normalizedSize(cable?.conductor_size);
  const currentIndex = NEC_AMPACITY_TABLE.findIndex(row => normalizedSize(row.size) === currentSize);
  const firstIndex = currentIndex >= 0 ? currentIndex : 0;
  for (let index = firstIndex; index < NEC_AMPACITY_TABLE.length; index += 1) {
    const candidate = NEC_AMPACITY_TABLE[index].size;
    const evaluated = evaluateCable({ ...cable, conductor_size: candidate });
    if (evaluated.evaluated && evaluated.dropPct <= targetDropPct) {
      if (normalizedSize(candidate) === currentSize) return null;
      return {
        conductorSize: candidate,
        expectedDropPct: evaluated.dropPct,
        targetDropPct,
      };
    }
  }
  return null;
}

export function runVoltageDropStudy(cables = [], options = {}) {
  const resolvedCables = resolveCableStudyInputs(cables, options.loads, options.loadFlow);
  let results = addCombinedPathResults(resolvedCables.map(cable => evaluateCable(cable)));
  results = results.map((result, index) => {
    if (!result.evaluated || (result.status !== 'fail' && result.combinedStatus !== 'fail')) {
      return { ...result, recommendation: null };
    }
    const remainingPathAllowance = Math.max(0.1, result.combinedLimitPct - result.upstreamDropPct);
    const targetDropPct = Math.min(result.limit, remainingPathAllowance);
    return {
      ...result,
      recommendation: recommendConductorForDrop(resolvedCables[index], targetDropPct),
    };
  });

  const withData = results.filter(result => result.evaluated);
  const maxDropPct = withData.length ? Math.max(...withData.map(result => result.dropPct)) : 0;
  const avgDropPct = withData.length
    ? withData.reduce((sum, result) => sum + result.dropPct, 0) / withData.length
    : 0;
  const combinedWithData = results.filter(result => result.pathEvaluated);
  const maxCombinedDropPct = combinedWithData.length
    ? Math.max(...combinedWithData.map(result => result.combinedDropPct))
    : 0;

  const summary = {
    total: results.length,
    evaluated: withData.length,
    coveragePct: results.length ? (withData.length / results.length) * 100 : 0,
    pass: results.filter(result => result.evaluated && result.status === 'pass').length,
    warn: results.filter(result => result.status === 'warn').length,
    fail: results.filter(result => result.status === 'fail').length,
    combinedFail: results.filter(result => result.combinedStatus === 'fail').length,
    notEvaluated: results.filter(result => !result.evaluated).length,
    recommendations: results.filter(result => result.recommendation).length,
    maxDropPct,
    maxCombinedDropPct,
    avgDropPct,
  };
  const sourceCounts = results.reduce((counts, result) => {
    const source = result.inputSource?.current || 'missing';
    counts[source] = (counts[source] || 0) + 1;
    return counts;
  }, {});
  const warnings = [];
  const ratingAssumed = results.filter(result => result.inputSource?.voltage === 'Cable insulation rating (assumed)').length;
  if (ratingAssumed) warnings.push(`${ratingAssumed} cable(s) use the insulation rating as the operating voltage because no operating, load-flow or load-list voltage was found; enter the operating voltage for an accurate percent drop.`);
  if (summary.notEvaluated) warnings.push(`${summary.notEvaluated} cable(s) could not be evaluated.`);
  if (summary.combinedFail) warnings.push(`${summary.combinedFail} feeder-plus-branch path(s) exceed the combined recommendation.`);

  return {
    results,
    summary,
    sourceCounts,
    warnings,
  };
}

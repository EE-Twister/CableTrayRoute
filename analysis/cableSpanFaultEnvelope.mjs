import { preparePositiveSequenceNetworkLinearResponse, solvePositiveSequenceBoltedFault } from './faultNetwork.mjs';
import { evaluateRationalPhasorEnvelope } from './rationalPolynomialEnvelope.mjs';
import { fingerprintStudyValue } from './studyLifecycle.mjs';

const METHOD = 'positive-sequence-all-cable-span-exposure-v1';
const MAX_TOTAL_BISECTIONS = 500000;
const c = (re = 0, im = 0) => ({ re, im });
const add = (a, b) => c(a.re + b.re, a.im + b.im);
const sub = (a, b) => c(a.re - b.re, a.im - b.im);
const mul = (a, b) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const scale = (a, k) => c(a.re * k, a.im * k);
function div(a, b) {
  const k = Math.max(Math.abs(b.re), Math.abs(b.im));
  const r = b.re / k, i = b.im / k, denominator = r * r + i * i;
  return c((a.re / k * r + a.im / k * i) / denominator, (a.im / k * r - a.re / k * i) / denominator);
}
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const idList = value => Array.isArray(value) && value.length > 0 && value.every(id => typeof id === 'string' && !!id.trim()) && new Set(value).size === value.length;
const fail = (code, details = {}) => { throw Object.assign(new Error(code), details); };
const limitation = 'Continuous extrema describe the supplied rounded positive-sequence network and piecewise-linear RMS source model. Exact polynomial root isolation does not enclose network forward error or physical input uncertainty.';

function profileTimes(profiles, sources, clearingTimeS) {
  if (!Array.isArray(profiles) || profiles.length !== sources.length || !finite(clearingTimeS) || clearingTimeS <= 0 || clearingTimeS > 5) fail('SPAN_PROFILE_INPUT');
  const byId = new Map(), times = new Set([0]);
  let horizon;
  for (const profile of profiles) {
    const points = profile?.points;
    if (!sources.some(source => source.id === profile?.equipmentId) || byId.has(profile?.equipmentId)
      || !Array.isArray(points) || points.length < 2 || points.length > 64 || points[0]?.timeS !== 0 || points[0]?.emfMultiplier !== 1
      || points.some((point, i) => !finite(point?.timeS) || point.timeS < 0 || !finite(point?.emfMultiplier) || point.emfMultiplier < 0 || (i && point.timeS <= points[i - 1].timeS))) fail('SPAN_PROFILE_INPUT');
    if (horizon !== undefined && horizon !== points.at(-1).timeS) fail('SPAN_PROFILE_HORIZON');
    horizon = points.at(-1).timeS;
    points.forEach(point => times.add(point.timeS));
    byId.set(profile.equipmentId, profile);
  }
  if (byId.size !== sources.length || times.size > 64 || !(horizon >= clearingTimeS)) fail('SPAN_PROFILE_COVERAGE');
  return { byId, times: [...new Set([...times].filter(time => time < clearingTimeS).concat(clearingTimeS))].sort((a, b) => a - b) };
}
function multiplier(profile, time) {
  const exact = profile.points.find(point => point.timeS === time);
  if (exact) return exact.emfMultiplier;
  const right = profile.points.findIndex(point => point.timeS > time);
  if (right <= 0) fail('SPAN_PROFILE_INTERPOLATION');
  const a = profile.points[right - 1], b = profile.points[right];
  const value = a.emfMultiplier + (time - a.timeS) / (b.timeS - a.timeS) * (b.emfMultiplier - a.emfMultiplier);
  if (!finite(value) || value < 0) fail('SPAN_PROFILE_INTERPOLATION');
  return value;
}
function validCableBranch(branch, bases) {
  return branch && branch.tapPu.re === 1 && branch.tapPu.im === 0
    && bases[branch.fromBusId]?.voltageLLV === bases[branch.toBusId]?.voltageLLV;
}
function candidate(envelope, faultSpanId, terminal) {
  return { faultSpanId, terminal, ...envelope.maximum,
    positionDomain: envelope.maximumIdentity === 'constant-over-full-interval' ? [0, 1] : envelope.maximum.positionInterval,
    maximumIdentity: envelope.maximumIdentity,
    possiblePositions: envelope.possibleMaxima.map(row => ({ position: row.position, positionInterval: row.positionInterval, positionIntervalDyadic: row.positionIntervalDyadic, exposureLower: row.exposureLower, exposureUpper: row.exposureUpper })) };
}
function accumulate(state, envelope, faultSpanId, terminal) {
  if (envelope.status !== 'evaluated') fail('SPAN_EXTREMUM_UNRESOLVED', { faultSpanId, targetBranchId: state.branchId, terminal, causeIssues: envelope.issues });
  const row = candidate(envelope, faultSpanId, terminal);
  const target = state[terminal];
  const bestLower = Math.max(target.bestLower, row.exposureLower);
  target.candidates.push(row);
  target.candidates = target.candidates.filter(item => item.exposureUpper >= bestLower);
  target.bestLower = bestLower;
  target.worst = target.candidates.reduce((a, b) => !a || b.exposureUpper > a.exposureUpper ? b : a, null);
  state.comparison = state.comparison === 'fail' || envelope.comparison === 'fail' ? 'fail' : 'pass';
  return { roots: envelope.stationaryRootCount, bisections: envelope.bisections };
}
function terminalSummary(state) {
  return state.worst.exposureUpper === 0
    ? { ...state.worst, maximumIdentity: 'zero-for-all-fault-spans', faultSpanIdentity: 'all-requested-spans-tied-at-zero', possibleFaultSpanIds: state.candidates.map(row => row.faultSpanId), positionDomain: [0, 1] }
    : { ...state.worst, faultSpanIdentity: state.candidates.length === 1 ? 'single-enclosed-span' : 'overlapping-span-enclosures', possibleFaultSpans: state.candidates };
}
function uniqueId(preferred, taken) {
  let id = preferred;
  for (let suffix = 1; taken.has(id); suffix += 1) id = `${preferred}-${suffix}`;
  taken.add(id);
  return id;
}
function singleSourceTree(network) {
  const active = network.sources.filter(source => source.inService);
  if (active.length !== 1 || network.branches.length !== network.buses.length - 1) return null;
  const adjacency = new Map(network.buses.map(bus => [bus.id, []]));
  for (const branch of network.branches) {
    adjacency.get(branch.fromBusId).push({ busId: branch.toBusId, branchId: branch.id });
    adjacency.get(branch.toBusId).push({ busId: branch.fromBusId, branchId: branch.id });
  }
  const parent = new Map([[active[0].busId, null]]), parentBranch = new Map(), queue = [active[0].busId];
  for (const id of queue) for (const edge of adjacency.get(id)) {
    if (parent.has(edge.busId)) continue;
    parent.set(edge.busId, id); parentBranch.set(edge.busId, edge.branchId); queue.push(edge.busId);
  }
  return parent.size === network.buses.length ? { parent, parentBranch } : null;
}
function radialSpanPath(tree, span) {
  const fromIsNear = tree.parent.get(span.toBusId) === span.fromBusId;
  const nearBusId = fromIsNear ? span.fromBusId : span.toBusId;
  const upstreamBranchIds = new Set();
  let id = nearBusId;
  while (tree.parent.get(id) !== null) { upstreamBranchIds.add(tree.parentBranch.get(id)); id = tree.parent.get(id); }
  return { fromIsNear, nearBusId, upstreamBranchIds };
}
function idealHistories(network, faultSpan, times, profiles) {
  const busIds = new Set(network.buses.map(bus => bus.id)), branchIds = new Set(network.branches.map(branch => branch.id));
  const virtualId = uniqueId('__CTR_SPAN_FAULT__', busIds);
  const fromId = uniqueId('__CTR_SPAN_FROM__', branchIds), toId = uniqueId('__CTR_SPAN_TO__', branchIds);
  const half = (id, fromBusId, toBusId) => ({ id, fromBusId, toBusId, impedance: { rOhm: 0, xOhm: 0, referenceBusId: fromBusId }, tapPu: c(1) });
  const split = { ...network,
    buses: [...network.buses, { id: virtualId, voltageLLV: network.buses.find(bus => bus.id === faultSpan.fromBusId).voltageLLV }],
    branches: [...network.branches.filter(branch => branch.id !== faultSpan.id), half(fromId, faultSpan.fromBusId, virtualId), half(toId, virtualId, faultSpan.toBusId)],
    fault: { busId: virtualId, type: 'three-phase-bolted' }, includeSourceFaultContributions: false };
  const rows = times.map(timeS => {
    const sources = network.sources.map(source => ({ ...source, emfPhaseV: scale(source.emfPhaseV, multiplier(profiles.get(source.id), timeS)) }));
    const solved = solvePositiveSequenceBoltedFault({ ...split, sources });
    if (solved.status !== 'evaluated') fail('SPAN_IDEAL_SPLIT_BLOCKED', { faultSpanId: faultSpan.id, causeIssues: solved.issues });
    return new Map([...solved.branchTerminalCurrents, ...solved.zeroImpedanceTieCurrents].map(row => [row.branchId, row]));
  });
  return { rows, fromId, toId };
}
function finiteDenominator(span, response, ports, radial = null) {
  const f = span.fromBusId, t = span.toBusId;
  const hff = ports.get(f).voltagePuByBusId[f], hft = ports.get(t).voltagePuByBusId[f];
  const htf = ports.get(f).voltagePuByBusId[t], htt = ports.get(t).voltagePuByBusId[t];
  const z = scale(c(span.impedance.rOhm, span.impedance.xOhm), 1 / response.busBasesById[span.impedance.referenceBusId].zBaseOhm);
  if (radial) {
    const near = ports.get(radial.nearBusId).voltagePuByBusId[radial.nearBusId];
    return { z, radial, denominator: radial.fromIsNear ? [near, z] : [add(near, z), scale(z, -1)] };
  }
  const denominator = [hff, add(z, sub(add(hft, htf), scale(hff, 2))), sub(sub(add(hff, htt), add(hft, htf)), z)];
  return { hff, hft, htf, htt, z, denominator };
}
function ownNumerator(terminal, vf, vt, h) {
  const { hff, hft, htf, htt, z } = h;
  return terminal === 'from'
    ? [sub(mul(add(z, htf), vf), mul(hff, vt)), sub(mul(sub(sub(htt, htf), z), vf), mul(sub(hft, hff), vt))].map(value => div(value, z))
    : [sub(mul(hff, vt), mul(htf, vf)), sub(mul(add(z, sub(hft, hff)), vt), mul(sub(htt, htf), vf))].map(value => div(value, z));
}
function otherNumerator(initial, transfer0, transfer1, vf, vt, denominator) {
  const v1 = sub(vt, vf);
  return [sub(mul(initial, denominator[0]), mul(transfer0, vf)),
    sub(mul(initial, denominator[1]), add(mul(transfer0, v1), mul(transfer1, vf))),
    sub(mul(initial, denominator[2]), mul(transfer1, v1))];
}

/** All fault spans A × all requested target conductors B over the closed continuum. */
export function evaluateCableSpanFaultEnvelope({ network, faultSpanBranchIds, targetBranchIds, profiles, clearingTimeS, allowancesByBranchId } = {}) {
  const coverage = { status: 'incomplete', faultSpanCount: 0, targetBranchCount: 0, expectedPairCount: 0, evaluatedPairCount: 0, evaluatedTerminalCount: 0,
    stationaryRootCount: 0, rootBisections: 0, maximumRootBisections: MAX_TOTAL_BISECTIONS, positionDomain: [0, 1], positionMethod: 'complete-stationary-root-isolation-and-closed-endpoints' };
  try {
    if (!record(network) || !idList(faultSpanBranchIds) || !idList(targetBranchIds) || !record(allowancesByBranchId)) fail('SPAN_INPUT');
    coverage.faultSpanCount = faultSpanBranchIds.length;
    coverage.targetBranchCount = targetBranchIds.length;
    coverage.expectedPairCount = faultSpanBranchIds.length * targetBranchIds.length;
    const timeInput = profileTimes(profiles, network.sources || [], clearingTimeS);
    if (coverage.expectedPairCount > 12000 || coverage.expectedPairCount * timeInput.times.length > 150000) fail('SPAN_WORK_LIMIT');
    const response = preparePositiveSequenceNetworkLinearResponse({ ...network, responseBusIds: network.buses.map(bus => bus.id), targetBranchIds });
    if (response.status !== 'evaluated') fail('SPAN_NETWORK_BLOCKED', { causeIssues: response.issues });
    const branchById = new Map(network.branches.map(branch => [branch.id, branch]));
    const allRequested = [...faultSpanBranchIds, ...targetBranchIds];
    if (allRequested.some(id => !validCableBranch(branchById.get(id), response.busBasesById))
      || targetBranchIds.some(id => !finite(allowancesByBranchId[id]) || allowancesByBranchId[id] <= 0)) fail('SPAN_CABLE_IDENTITY');
    const states = new Map(targetBranchIds.map(branchId => [branchId, { branchId, comparison: 'pass', from: { bestLower: 0, worst: null, candidates: [] }, to: { bestLower: 0, worst: null, candidates: [] } }]));
    const ports = new Map(response.unitCurrentInjectionResponses.map(row => [row.injectionBusId, row]));
    const transfer = new Map(response.unitCurrentInjectionResponses.map(row => [row.injectionBusId, new Map(row.targetBranchCurrentsPu.map(item => [item.branchId, item]))]));
    const sourceRows = response.sourceResponses.map(row => ({ ...row, currentById: new Map(row.targetBranchCurrentsPu.map(item => [item.branchId, item])) }));
    const radialTree = singleSourceTree(network);
    coverage.structuralReduction = radialTree ? 'single-in-service-source-unloaded-tree-kcl' : 'general-network-port-response';
    const preFault = timeInput.times.map(timeS => {
      const voltages = new Map(network.buses.map(bus => [bus.id, c()]));
      const currents = new Map(targetBranchIds.map(id => [id, { from: c(), to: c() }]));
      for (const source of sourceRows) {
        const m = multiplier(timeInput.byId.get(source.sourceId), timeS);
        for (const bus of network.buses) voltages.set(bus.id, add(voltages.get(bus.id), scale(source.voltagePuByBusId[bus.id], m)));
        for (const id of targetBranchIds) for (const terminal of ['from', 'to']) currents.get(id)[terminal] = add(currents.get(id)[terminal], scale(source.currentById.get(id)[`${terminal}CurrentIntoBranchPu`], m));
      }
      return { timeS, voltages, currents };
    });
    for (const faultSpanId of faultSpanBranchIds) {
      const span = branchById.get(faultSpanId);
      const ideal = span.impedance.rOhm === 0 && span.impedance.xOhm === 0;
      const idealRows = ideal ? idealHistories(network, span, timeInput.times, timeInput.byId) : null;
      const radial = !ideal && radialTree ? radialSpanPath(radialTree, span) : null;
      const h = ideal ? null : finiteDenominator(span, response, ports, radial);
      // This also certifies that no denominator zero is hidden by an exactly
      // unloaded off-path conductor. It is shared across all such target pairs.
      const zeroEnvelope = radial ? evaluateRationalPhasorEnvelope({ denominator: h.denominator,
        knots: [{ timeS: 0, coefficients: [c()] }, { timeS: clearingTimeS, coefficients: [c()] }], currentBaseA: 1, maximumExposureA2S: 1 }) : null;
      if (zeroEnvelope?.status === 'blocked') fail('SPAN_RADIAL_DENOMINATOR', { faultSpanId, causeIssues: zeroEnvelope.issues });
      for (const targetBranchId of targetBranchIds) {
        const state = states.get(targetBranchId), target = branchById.get(targetBranchId);
        for (const terminal of ['from', 'to']) {
          const field = `${terminal}CurrentIntoBranchPu`;
          const busId = terminal === 'from' ? target.fromBusId : target.toBusId;
          let knots;
          const radialOwnZero = radial && targetBranchId === faultSpanId && (terminal === 'from') !== radial.fromIsNear;
          const radialOffPath = radial && targetBranchId !== faultSpanId && !radial.upstreamBranchIds.has(targetBranchId);
          if (radialOwnZero || radialOffPath) {
            accumulate(state, zeroEnvelope, faultSpanId, terminal);
            coverage.evaluatedTerminalCount += 1;
            continue;
          }
          if (ideal) {
            knots = timeInput.times.map((timeS, i) => {
              const id = targetBranchId === faultSpanId ? (terminal === 'from' ? idealRows.fromId : idealRows.toId) : targetBranchId;
              const row = idealRows.rows[i].get(id);
              if (!row) fail('SPAN_IDEAL_TARGET_CURRENT', { faultSpanId, targetBranchId, terminal });
              return { timeS, coefficients: [row[`${terminal}CurrentIntoBranchKA`]] };
            });
          } else if (radial) {
            const coefficient = targetBranchId === faultSpanId ? c(1)
              : scale(transfer.get(radial.nearBusId).get(targetBranchId)[field], -1);
            knots = preFault.map(row => ({ timeS: row.timeS, coefficients: [mul(coefficient, row.voltages.get(radial.nearBusId))] }));
          } else {
            const tf = transfer.get(span.fromBusId).get(targetBranchId)[field];
            const delta = sub(transfer.get(span.toBusId).get(targetBranchId)[field], tf);
            knots = preFault.map(row => ({ timeS: row.timeS,
              coefficients: targetBranchId === faultSpanId
                ? ownNumerator(terminal, row.voltages.get(span.fromBusId), row.voltages.get(span.toBusId), h)
                : otherNumerator(row.currents.get(targetBranchId)[terminal], tf, delta, row.voltages.get(span.fromBusId), row.voltages.get(span.toBusId), h.denominator) }));
          }
          const envelope = evaluateRationalPhasorEnvelope({ denominator: ideal ? [c(1)] : h.denominator, knots,
            currentBaseA: ideal ? 1000 : response.busBasesById[busId].currentBaseA, maximumExposureA2S: allowancesByBranchId[targetBranchId] });
          const counts = accumulate(state, envelope, faultSpanId, terminal);
          coverage.stationaryRootCount += counts.roots;
          coverage.rootBisections += counts.bisections;
          if (coverage.rootBisections > MAX_TOTAL_BISECTIONS) fail('SPAN_AGGREGATE_ROOT_WORK_LIMIT', { faultSpanId, targetBranchId, terminal });
          coverage.evaluatedTerminalCount += 1;
        }
        coverage.evaluatedPairCount += 1;
      }
    }
    const targetResults = [...states.values()].map(state => ({ branchId: state.branchId, comparison: state.comparison,
      allowableCurrentSquaredExposureA2S: allowancesByBranchId[state.branchId],
      from: terminalSummary(state.from), to: terminalSummary(state.to) }));
    coverage.status = 'complete-for-all-requested-span-target-pairs';
    return { status: 'evaluated', method: METHOD, networkFingerprint: response.networkFingerprint,
      modelInputFingerprint: fingerprintStudyValue({ method: METHOD, network, faultSpanBranchIds, targetBranchIds, profiles, clearingTimeS, allowancesByBranchId }),
      coverage, targetResults, comparison: targetResults.every(row => row.comparison === 'pass') ? 'pass' : 'fail', issues: [], limitations: [limitation] };
  } catch (error) {
    return { status: 'blocked', method: METHOD, comparison: 'not-evaluated', coverage, targetResults: [],
      issues: [{ code: error.message || 'SPAN_INVALID', faultSpanId: error.faultSpanId || null, targetBranchId: error.targetBranchId || null, terminal: error.terminal || null, causeIssues: error.causeIssues || [] }], limitations: [limitation] };
  }
}

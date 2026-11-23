import { buildDesignSynthesisFaultNetwork, evaluateDesignSynthesisFaultStudy } from './designSynthesisFaultStudy.mjs';
import { evaluateDesignSynthesisDeviceFaultScreen } from './designSynthesisDeviceFaultScreen.mjs';
import { solvePositiveSequenceBoltedFault } from './faultNetwork.mjs';
import { fingerprintStudyValue } from './studyLifecycle.mjs';

const METHOD = 'design-synthesis-motor-fault-evolution-v1';
const SCOPE = 'supplied-source-quasi-steady-rms-phasor-history';
const LIMITATIONS = Object.freeze([
  'This is a quasi-steady positive-sequence RMS network evaluated at supplied source-EMF history knots; histories are caller-supplied and are not inferred motor decrement curves or guaranteed physical bounds.',
  'Piecewise-linear source EMF interpolation and exact phasor A²s integration do not model DC offset, peak/asymmetrical duty, switching transients, current limiting, frequency transients, relay/device state evolution, protective clearing, or actual clearing time.',
  'Current-squared exposure is mathematical history evidence only; it is not conductor damage, thermal withstand, motor protection, or a clearing-time qualification.',
  'Proposed placements are design locations, not installed equipment; source and condition references are supplied metadata and are not independently verified.',
  'Protection adequacy, coordination, assembly SCCR, and motor-containing Apply remain unevaluated or blocked.',
]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const text = value => typeof value === 'string' && value.trim().length > 0;
const complex = value => object(value) && finite(value.re) && finite(value.im) ? { re: value.re, im: value.im } : null;
const magnitude = value => Math.hypot(value.re, value.im);
const add = (left, right) => ({ re: left.re + right.re, im: left.im + right.im });
const scale = (value, factor) => ({ re: value.re * factor, im: value.im * factor });
const issue = (code, path, message) => ({ code, path, message, severity: 'blocking' });
const same = (left, right) => fingerprintStudyValue(left) === fingerprintStudyValue(right);

function rejectUnknown(value, allowed, path, issues) {
  if (!object(value)) { issues.push(issue('FAULT_EVOLUTION_OBJECT_REQUIRED', path, 'A structured object is required.')); return; }
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.push(issue('FAULT_EVOLUTION_UNKNOWN_FIELD', `${path}.${key}`, 'Field is not part of the explicit fault-evolution contract.'));
}

function validateProfileInput(faultEvolution, network, proposal, issues) {
  rejectUnknown(faultEvolution, ['schemaVersion', 'horizonS', 'reference', 'profiles'], 'faultEvolution', issues);
  if (faultEvolution?.schemaVersion !== '1.0.0') issues.push(issue('FAULT_EVOLUTION_SCHEMA_VERSION', 'faultEvolution.schemaVersion', 'schemaVersion must be 1.0.0.'));
  if (!positive(faultEvolution?.horizonS) || !text(faultEvolution?.reference)) issues.push(issue('FAULT_EVOLUTION_HORIZON_OR_REFERENCE', 'faultEvolution', 'A finite positive horizonS and nonblank study reference are required.'));
  if (!Array.isArray(faultEvolution?.profiles) || faultEvolution.profiles.length !== network.sources.length) {
    issues.push(issue('FAULT_EVOLUTION_PROFILE_COVERAGE', 'faultEvolution.profiles', 'Exactly one source history is required for every explicit faultStudy source.'));
    return [];
  }
  const sourceById = new Map(network.sources.map(source => [source.id, source]));
  const loads = Array.isArray(proposal?.loads) ? proposal.loads : [];
  const supply = proposal?.inputs?.original?.supply || {};
  const criteria = proposal?.inputs?.original?.criteria || proposal?.inputs?.criteria || {};
  const profileById = new Map();
  const union = new Set([0, faultEvolution.horizonS]);
  faultEvolution.profiles.forEach((profile, index) => {
    const path = `faultEvolution.profiles[${index}]`;
    rejectUnknown(profile, ['equipmentId', 'source', 'conditions', 'points'], path, issues);
    const id = text(profile?.equipmentId) ? profile.equipmentId : '';
    if (!sourceById.has(id)) issues.push(issue('FAULT_EVOLUTION_SOURCE_UNKNOWN', `${path}.equipmentId`, 'Each history must identify an exact source in faultStudy.sources.'));
    if (profileById.has(id)) issues.push(issue('FAULT_EVOLUTION_SOURCE_DUPLICATE', `${path}.equipmentId`, 'A source may have exactly one history.'));
    profileById.set(id, profile);
    rejectUnknown(profile?.source, ['reference', 'evidenceClass'], `${path}.source`, issues);
    if (!text(profile?.source?.reference) || !['synthetic', 'manufacturer', 'external-study'].includes(profile?.source?.evidenceClass)) issues.push(issue('FAULT_EVOLUTION_SOURCE_EVIDENCE', `${path}.source`, 'Source history evidence requires a reference and evidenceClass synthetic, manufacturer, or external-study.'));
    rejectUnknown(profile?.conditions, ['ambientTemperatureC', 'frequencyHz', 'phases', 'voltageRangeV', 'reference'], `${path}.conditions`, issues);
    const conditions = profile?.conditions;
    if (!finite(conditions?.ambientTemperatureC) || conditions.ambientTemperatureC <= -273.15 || conditions.frequencyHz !== 60 || conditions.phases !== 3 || !text(conditions.reference)) {
      issues.push(issue('FAULT_EVOLUTION_CONDITIONS', `${path}.conditions`, 'Conditions require ambientTemperatureC above absolute zero, frequencyHz 60, phases 3, and a nonblank reference.'));
    }
    const range = conditions?.voltageRangeV;
    if (!Array.isArray(range) || range.length !== 2 || !positive(range[0]) || !positive(range[1]) || range[1] < range[0]) issues.push(issue('FAULT_EVOLUTION_VOLTAGE_RANGE', `${path}.conditions.voltageRangeV`, 'voltageRangeV must be an ordered pair of finite positive volts.'));
    const source = sourceById.get(id);
    const sourceEquipment = (proposal?.equipment || []).find(row => String(row?.id) === id);
    const sourceLoad = loads.find(row => String(row?.id) === id);
    const sourceRatedVoltage = id === String(supply?.id || 'SOURCE') ? Number(supply?.voltage) : Number(sourceLoad?.motor?.ratedVoltageV);
    const busVoltage = id === String(supply?.id || 'SOURCE') ? Number(supply?.voltage) : Number(sourceEquipment?.voltage ?? sourceLoad?.voltage);
    if (!source || !positive(sourceRatedVoltage) || !positive(busVoltage) || !Array.isArray(range) || range.length !== 2 || !range.every(positive) || sourceRatedVoltage < range[0] || sourceRatedVoltage > range[1] || busVoltage < range[0] || busVoltage > range[1]) {
      issues.push(issue('FAULT_EVOLUTION_VOLTAGE_APPLICABILITY', `${path}.conditions.voltageRangeV`, 'Each source history condition must cover both canonical source rated voltage and its generated bus nominal voltage.'));
    }
    const canonicalFrequency = sourceLoad
      ? Number(sourceLoad.motor?.nameplateFrequencyHz ?? sourceLoad.frequencyHz ?? sourceLoad.frequency ?? supply.frequencyHz ?? supply.frequency ?? criteria.frequencyHz ?? criteria.frequency ?? 60)
      : Number(supply.frequencyHz ?? supply.frequency ?? criteria.frequencyHz ?? criteria.frequency ?? 60);
    if (conditions?.frequencyHz !== canonicalFrequency) issues.push(issue('FAULT_EVOLUTION_FREQUENCY_MISMATCH', `${path}.conditions.frequencyHz`, 'History frequency must match the canonical source or motor frequency.'));
    if (!Array.isArray(profile?.points) || profile.points.length < 2 || profile.points.length > 64) {
      issues.push(issue('FAULT_EVOLUTION_POINT_COUNT', `${path}.points`, 'Each source history requires between two and 64 ordered points.'));
      return;
    }
    let previousTime = -Infinity;
    profile.points.forEach((point, pointIndex) => {
      const pointPath = `${path}.points[${pointIndex}]`;
      rejectUnknown(point, ['timeS', 'emfMultiplier'], pointPath, issues);
      if (!finite(point?.timeS) || point.timeS < 0 || !finite(point?.emfMultiplier) || point.emfMultiplier < 0 || point.timeS <= previousTime) {
        issues.push(issue('FAULT_EVOLUTION_POINT_INVALID', pointPath, 'Points require strictly increasing nonnegative timeS and finite nonnegative emfMultiplier.'));
      } else union.add(point.timeS);
      previousTime = point?.timeS;
    });
    if (profile.points[0]?.timeS !== 0 || profile.points[0]?.emfMultiplier !== 1 || profile.points.at(-1)?.timeS !== faultEvolution.horizonS) {
      issues.push(issue('FAULT_EVOLUTION_ENDPOINTS', `${path}.points`, 'Every source history must begin exactly at time 0 with multiplier 1 and end exactly at the common horizonS.'));
    }
  });
  for (const source of network.sources) if (!profileById.has(source.id)) issues.push(issue('FAULT_EVOLUTION_SOURCE_MISSING', 'faultEvolution.profiles', `A source history is missing for ${source.id}.`));
  if (union.size > 64) issues.push(issue('FAULT_EVOLUTION_UNION_KNOT_LIMIT', 'faultEvolution.profiles', 'The union of source history knots may contain at most 64 times.'));
  return [...union].sort((left, right) => left - right);
}

function multiplierAt(profile, timeS) {
  const points = profile.points;
  const exact = points.find(point => point.timeS === timeS);
  if (exact) return exact.emfMultiplier;
  const rightIndex = points.findIndex(point => point.timeS > timeS);
  if (rightIndex <= 0) return null;
  const left = points[rightIndex - 1]; const right = points[rightIndex];
  const ratio = (timeS - left.timeS) / (right.timeS - left.timeS);
  const value = left.emfMultiplier + ratio * (right.emfMultiplier - left.emfMultiplier);
  return finite(value) && value >= 0 ? value : null;
}

function selectReferenceCurrent(reference, solution) {
  const aggregate = reference?.aggregateSourceReference;
  const sourceReference = aggregate || reference?.branchCurrentReference;
  if (!object(sourceReference) || !Array.isArray(sourceReference.branchIds) && !text(sourceReference.branchId)) return null;
  const branchIds = Array.isArray(sourceReference.branchIds) ? sourceReference.branchIds : [sourceReference.branchId];
  let current = { re: 0, im: 0 };
  for (const branchId of branchIds) {
    const terminal = [...(solution.branchTerminalCurrents || []), ...(solution.zeroImpedanceTieCurrents || [])].find(item => item.branchId === branchId);
    const terminalCurrent = terminal && complex(terminal[`${sourceReference.terminal}CurrentIntoBranchKA`]);
    if (!terminalCurrent) return null;
    current = add(current, scale(terminalCurrent, sourceReference.signMultiplier));
  }
  return current;
}

function deriveThroughCurrent(placement, reference, solution, immediate) {
  if (immediate && reference?.aggregateSourceReference) return selectReferenceCurrent(reference, solution);
  const branchCurrent = selectReferenceCurrent(reference, solution);
  if (!branchCurrent) return null;
  return immediate ? add(complex(solution.fault.totalFaultCurrentKA), branchCurrent) : branchCurrent;
}

function integrateExposure(timeRows) {
  let total = 0;
  const intervals = [];
  let minimumRmsKA = Infinity; let minimumTimeS = null;
  let maximumRmsKA = -Infinity; let maximumTimeS = null;
  const consider = (current, timeS) => {
    const rms = magnitude(current);
    if (!finite(rms)) return false;
    if (rms < minimumRmsKA) { minimumRmsKA = rms; minimumTimeS = timeS; }
    if (rms > maximumRmsKA) { maximumRmsKA = rms; maximumTimeS = timeS; }
    return true;
  };
  if (timeRows.length && (!consider(timeRows[0].currentKA, timeRows[0].timeS))) return null;
  for (let index = 1; index < timeRows.length; index += 1) {
    const left = timeRows[index - 1]; const right = timeRows[index];
    const dt = right.timeS - left.timeS;
    const a = left.currentKA; const b = right.currentKA;
    const magnitudeScale = Math.max(Math.abs(a.re), Math.abs(a.im), Math.abs(b.re), Math.abs(b.im));
    const an = magnitudeScale ? { re: a.re / magnitudeScale, im: a.im / magnitudeScale } : { re: 0, im: 0 };
    const bn = magnitudeScale ? { re: b.re / magnitudeScale, im: b.im / magnitudeScale } : { re: 0, im: 0 };
    const squaredA = an.re * an.re + an.im * an.im;
    const dot = an.re * bn.re + an.im * bn.im;
    const squaredB = bn.re * bn.re + bn.im * bn.im;
    const exposureA2S = dt * magnitudeScale * magnitudeScale * (squaredA + dot + squaredB) / 3 * 1e6;
    if (!positive(dt) || !finite(exposureA2S) || exposureA2S < 0 || (exposureA2S === 0 && (squaredA !== 0 || squaredB !== 0 || dot !== 0))) return null;
    total += exposureA2S;
    if (!finite(total)) return null;
    intervals.push({ startTimeS: left.timeS, endTimeS: right.timeS, startCurrentRmsA: left.currentRmsA, endCurrentRmsA: right.currentRmsA, exposureA2S });
    if (!consider(b, right.timeS)) return null;
    const delta = { re: bn.re - an.re, im: bn.im - an.im };
    const deltaSquared = delta.re * delta.re + delta.im * delta.im;
    if (deltaSquared > 0) {
      const projected = an.re * delta.re + an.im * delta.im;
      const u = Math.max(0, Math.min(1, -projected / deltaSquared));
      const interior = { re: an.re + u * delta.re, im: an.im + u * delta.im };
      const interiorKA = { re: interior.re * magnitudeScale, im: interior.im * magnitudeScale };
      if (!consider(interiorKA, left.timeS + u * dt)) return null;
    }
  }
  return { currentSquaredExposureA2S: total, exposureIntervals: intervals,
    currentExtrema: timeRows.length ? { minimumRmsKA, minimumTimeS, maximumRmsKA, maximumTimeS } : null };
}

function blockedResult(faultEvolution, issues, extra = {}) {
  return { status: 'blocked', method: METHOD, scope: SCOPE, modelInputFingerprint: null, timeKnotsS: [], coverage: { status: 'incomplete', faultBusIds: [], placementIds: [] },
    faultCases: [], deviceHistories: [], issues, evidenceStatus: 'supplied-unverified', protectionAdequacy: 'unevaluated', limitations: LIMITATIONS,
    inputReference: object(faultEvolution) && text(faultEvolution.reference) ? faultEvolution.reference : null, ...extra };
}

/** Evaluate caller-supplied source EMF histories over the finalized proposal's exact fault network and proposed device cuts. */
export function evaluateDesignSynthesisFaultEvolution(options = {}) {
  if (!object(options)) return blockedResult(null, [issue('FAULT_EVOLUTION_OPTIONS_INVALID', 'options', 'Evaluation options must be a structured object.')]);
  const { proposal, faultStudy = proposal?.faultStudy, faultEvolution = proposal?.faultEvolution,
    faultStudyValidation = proposal?.faultStudyValidation, deviceFaultValidation = proposal?.deviceFaultValidation } = options;
  const issues = [];
  if (!object(faultEvolution)) return blockedResult(faultEvolution, [issue('FAULT_EVOLUTION_REQUIRED', 'faultEvolution', 'An explicit faultEvolution history object is required.')]);
  const built = buildDesignSynthesisFaultNetwork({ proposal, faultStudy });
  if (built.status !== 'ready') return blockedResult(faultEvolution, [...(built.issues || [])], { networkIssues: built.issues || [] });
  const network = built.network;
  const timeKnotsS = validateProfileInput(faultEvolution, network, proposal, issues);
  if (faultEvolution?.horizonS && timeKnotsS.length && timeKnotsS.some(time => time > faultEvolution.horizonS)) issues.push(issue('FAULT_EVOLUTION_TIME_OUTSIDE_HORIZON', 'faultEvolution.profiles', 'No history knot may exceed horizonS.'));
  if (issues.length) return blockedResult(faultEvolution, issues);

  const freshStudy = evaluateDesignSynthesisFaultStudy({ proposal, faultStudy });
  if (freshStudy.status !== 'evaluated' || faultStudyValidation?.status !== 'evaluated' || freshStudy.modelInputFingerprint !== faultStudyValidation.modelInputFingerprint || !same(freshStudy.cases, faultStudyValidation.cases)) {
    issues.push(issue('FAULT_EVOLUTION_STALE_FAULT_STUDY', 'faultStudyValidation', 'A freshly recomputed, complete initial fault study matching the supplied evaluated cases is required.'));
  }
  const freshDevices = evaluateDesignSynthesisDeviceFaultScreen({ proposal, faultStudyValidation: freshStudy });
  if (freshDevices.status !== 'evaluated' || deviceFaultValidation?.status !== 'evaluated' || freshDevices.modelInputFingerprint !== deviceFaultValidation.modelInputFingerprint || !same(freshDevices.placements, deviceFaultValidation.placements)) {
    issues.push(issue('FAULT_EVOLUTION_STALE_DEVICE_SCREEN', 'deviceFaultValidation', 'A freshly recomputed complete device screen matching final proposed placements and signed current evidence is required.'));
  }
  const expectedFaultBusIds = network.faultBusIds;
  if (freshStudy.cases.length !== expectedFaultBusIds.length || freshStudy.cases.some((row, index) => row.status !== 'evaluated' || String(row.fault?.busId || row.busId) !== expectedFaultBusIds[index])) {
    issues.push(issue('FAULT_EVOLUTION_FAULT_COVERAGE', 'faultStudyValidation.cases', 'Every generated bus fault must be present, evaluated, and in canonical order.'));
  }
  const placements = freshDevices.placements || [];
  if (!placements.length || placements.some(item => !Array.isArray(item.cases) || item.status === 'blocked')) issues.push(issue('FAULT_EVOLUTION_PLACEMENT_COVERAGE', 'deviceFaultValidation.placements', 'Every final proposed device placement requires complete signed through-device evidence.'));
  if ((expectedFaultBusIds.length + 1) * placements.length * timeKnotsS.length > 150000 || expectedFaultBusIds.length * timeKnotsS.length > 12000) {
    issues.push(issue('FAULT_EVOLUTION_OUTPUT_LIMIT', 'faultEvolution', 'Requested history exceeds the bounded calculation/output budget; reduce knot count or proposal size.'));
  }
  if (issues.length) return blockedResult(faultEvolution, issues);

  const profileById = new Map(faultEvolution.profiles.map(profile => [profile.equipmentId, profile]));
  const faultCases = [];
  const solutionByKnotAndBus = new Map();
  const sourceMultiplierRows = [];
  for (const timeS of timeKnotsS) {
    const sourceMultipliers = network.sources.map(source => ({ equipmentId: source.id, multiplier: multiplierAt(profileById.get(source.id), timeS) }));
    if (sourceMultipliers.some(row => !finite(row.multiplier) || row.multiplier < 0)) {
      issues.push(issue('FAULT_EVOLUTION_INTERPOLATION_INVALID', `faultEvolution.profiles`, `A source multiplier could not be interpolated at ${timeS} s without extrapolation.`));
      break;
    }
    sourceMultiplierRows.push({ timeS, sourceMultipliers });
    const scaledSources = network.sources.map(source => {
      const multiplier = sourceMultipliers.find(row => row.equipmentId === source.id).multiplier;
      return { ...source, emfPhaseV: { re: source.emfPhaseV.re * multiplier, im: source.emfPhaseV.im * multiplier } };
    });
    for (const faultBusId of expectedFaultBusIds) {
      const solution = solvePositiveSequenceBoltedFault({ networkBaseMVA: network.networkBaseMVA, buses: network.buses, branches: network.branches, sources: scaledSources,
        fault: { busId: faultBusId, type: 'three-phase-bolted' }, sourceInventory: network.sourceInventory, includeSourceFaultContributions: false });
      if (solution.status !== 'evaluated') {
        issues.push(...(solution.issues || []).map(item => issue('FAULT_EVOLUTION_SOLVER_BLOCKED', `faultEvolution.${faultBusId}.${timeS}.${item.path}`, item.message)));
        continue;
      }
      if (timeS === 0) {
        const initial = freshStudy.cases.find(item => String(item.fault?.busId || item.busId) === faultBusId);
        if (!same(solution.fault, initial.fault) || !same(solution.branchTerminalCurrents, initial.branchTerminalCurrents) || !same(solution.zeroImpedanceTieCurrents, initial.zeroImpedanceTieCurrents)) {
          issues.push(issue('FAULT_EVOLUTION_INITIAL_MISMATCH', `faultEvolution.${faultBusId}.0`, 'Multiplier 1 at t=0 must reproduce the exact finalized initial RMS fault, branch, and ideal-tie current evidence.'));
          continue;
        }
      }
      solutionByKnotAndBus.set(`${timeS}|${faultBusId}`, solution);
    }
  }
  if (issues.length) return blockedResult(faultEvolution, issues);

  const caseRowsById = new Map();
  const deviceHistoriesById = new Map();
  const sourceRowsByTime = new Map(sourceMultiplierRows.map(row => [row.timeS, row.sourceMultipliers]));
  for (const faultBusId of expectedFaultBusIds) {
    const caseId = `bus-fault:${faultBusId}`;
    const caseRows = [];
    const historyRows = new Map(placements.map(placement => [placement.id, []]));
    for (const timeS of timeKnotsS) {
      const solution = solutionByKnotAndBus.get(`${timeS}|${faultBusId}`);
      const deviceCurrents = [];
      for (const placement of placements) {
        const evidence = placement.cases.find(row => row.id === `bus-fault:${faultBusId}`);
        const currentKA = evidence && deriveThroughCurrent(placement, evidence, solution, false);
        if (!currentKA || ![currentKA.re, currentKA.im, magnitude(currentKA)].every(finite)) {
          issues.push(issue('FAULT_EVOLUTION_DEVICE_CURRENT_UNAVAILABLE', `faultEvolution.${placement.id}.${caseId}.${timeS}`, 'Signed branch-terminal/KCL current for this final device and fault case is missing or non-finite.'));
          continue;
        }
      const currentRmsKA = magnitude(currentKA);
      const currentRmsA = currentRmsKA * 1000;
      if (!finite(currentRmsA) || !finite(currentKA.re * 1000) || !finite(currentKA.im * 1000)) {
        issues.push(issue('FAULT_EVOLUTION_CURRENT_RANGE', `faultEvolution.${placement.id}.${caseId}.${timeS}`, 'Current conversion from kA to A exceeded the finite numeric range.'));
        continue;
      }
        deviceCurrents.push({ placementId: placement.id, throughDeviceCurrentKA: currentKA, throughDeviceCurrentRmsKA: currentRmsKA });
      historyRows.get(placement.id).push({ timeS, currentKA, currentRmsA });
      }
      caseRows.push({ timeS, sourceMultipliers: sourceRowsByTime.get(timeS), faultCurrentKA: solution.fault.totalFaultCurrentKA,
        faultCurrentRmsKA: solution.fault.faultCurrentRmsKA,
        branchCurrents: [...solution.branchTerminalCurrents, ...solution.zeroImpedanceTieCurrents].map(row => ({ branchId: row.branchId, fromBusId: row.fromBusId, toBusId: row.toBusId,
          fromCurrentIntoBranchKA: row.fromCurrentIntoBranchKA, toCurrentIntoBranchKA: row.toCurrentIntoBranchKA })),
        deviceCurrents });
    }
    caseRowsById.set(caseId, { caseId, caseKind: 'generated-bus-fault', faultBusId, timeRows: caseRows });
    for (const placement of placements) deviceHistoriesById.set(`${placement.id}|${caseId}`, { placement, caseId, caseKind: 'generated-bus-fault', faultBusId, rows: historyRows.get(placement.id) });
  }
  for (const placement of placements) {
    const locationBusId = placement.proposedLocation?.fromBusId;
    const caseId = `immediate-load-side-fault:${placement.id}`;
    const caseRows = [];
    const historyRows = [];
    for (const timeS of timeKnotsS) {
      const solution = solutionByKnotAndBus.get(`${timeS}|${locationBusId}`);
      const evidence = placement.cases.find(row => row.id === `immediate-load-side-fault:${locationBusId}`);
      const currentKA = evidence && solution && deriveThroughCurrent(placement, evidence, solution, true);
      if (!currentKA || ![currentKA.re, currentKA.im, magnitude(currentKA)].every(finite)) {
        issues.push(issue('FAULT_EVOLUTION_DEVICE_CURRENT_UNAVAILABLE', `faultEvolution.${placement.id}.${caseId}.${timeS}`, 'Immediate load-side KCL current for this final device is missing or non-finite.'));
        continue;
      }
      const currentRmsKA = magnitude(currentKA);
      const currentRmsA = currentRmsKA * 1000;
      if (!finite(currentRmsA) || !finite(currentKA.re * 1000) || !finite(currentKA.im * 1000)) {
        issues.push(issue('FAULT_EVOLUTION_CURRENT_RANGE', `faultEvolution.${placement.id}.${caseId}.${timeS}`, 'Current conversion from kA to A exceeded the finite numeric range.'));
        continue;
      }
      const deviceCurrent = { placementId: placement.id, throughDeviceCurrentKA: currentKA, throughDeviceCurrentRmsKA: currentRmsKA };
      caseRows.push({ timeS, sourceMultipliers: sourceRowsByTime.get(timeS), faultCurrentKA: solution.fault.totalFaultCurrentKA, faultCurrentRmsKA: solution.fault.faultCurrentRmsKA,
        branchCurrents: [...solution.branchTerminalCurrents, ...solution.zeroImpedanceTieCurrents].map(row => ({ branchId: row.branchId, fromBusId: row.fromBusId, toBusId: row.toBusId,
          fromCurrentIntoBranchKA: row.fromCurrentIntoBranchKA, toCurrentIntoBranchKA: row.toCurrentIntoBranchKA })),
        deviceCurrents: [deviceCurrent] });
      historyRows.push({ timeS, currentKA, currentRmsA });
    }
    caseRowsById.set(caseId, { caseId, caseKind: 'immediate-load-side-zero-impedance-fault', faultBusId: locationBusId, placementId: placement.id, timeRows: caseRows });
    deviceHistoriesById.set(`${placement.id}|${caseId}`, { placement, caseId, caseKind: 'immediate-load-side-zero-impedance-fault', faultBusId: locationBusId, rows: historyRows });
  }
  if (issues.length) return blockedResult(faultEvolution, issues);

  const deviceHistories = [...deviceHistoriesById.values()].map(({ placement, caseId, caseKind, faultBusId, rows }) => {
    const exposure = integrateExposure(rows);
    if (!exposure) {
      issues.push(issue('FAULT_EVOLUTION_EXPOSURE_RANGE', `faultEvolution.${placement.id}.${caseId}`, 'Current-squared exposure overflowed, underflowed, or left its finite nonnegative range.'));
      return null;
    }
    return { placementId: placement.id, caseId, caseKind, faultBusId,
      deviceIdentity: { id: placement.device?.id || null, catalogNumber: placement.device?.catalogNumber || null, manufacturer: placement.device?.manufacturer || null, type: placement.device?.type || null },
      timeRows: rows.map(row => ({ timeS: row.timeS, currentKA: row.currentKA, currentRmsKA: row.currentRmsA / 1000,
        currentA: { re: row.currentKA.re * 1000, im: row.currentKA.im * 1000 }, currentRmsA: row.currentRmsA })),
      currentExtrema: exposure.currentExtrema,
      currentSquaredExposureA2S: exposure.currentSquaredExposureA2S, exposureIntervals: exposure.exposureIntervals,
      coverageStatus: rows.length === timeKnotsS.length ? 'complete' : 'incomplete',
    };
  }).filter(Boolean);
  if (issues.length) return blockedResult(faultEvolution, issues);
  const placementsFingerprint = freshDevices.placements.map(placement => ({ id: placement.id, kind: placement.kind, proposedLocation: placement.proposedLocation, device: placement.device, cases: placement.cases }));
  const modelInputFingerprint = fingerprintStudyValue({ method: METHOD, proposal: { equipment: proposal?.equipment, loads: proposal?.loads, cables: proposal?.cables, transformer: proposal?.transformer, oneLine: proposal?.oneLine }, faultStudy, faultEvolution, networkFingerprint: built.modelInputFingerprint,
    faultStudyValidation: { modelInputFingerprint: freshStudy.modelInputFingerprint, cases: freshStudy.cases }, devicePlacements: placementsFingerprint });
  return { status: 'evaluated', method: METHOD, scope: SCOPE, modelInputFingerprint, inputReference: faultEvolution.reference,
    sourceHistories: structuredClone(faultEvolution.profiles),
    timeKnotsS, coverage: { status: 'complete', faultBusIds: expectedFaultBusIds, placementIds: placements.map(item => item.id), historyCaseCount: caseRowsById.size },
    faultCases: [...caseRowsById.values()], deviceHistories, issues: [], evidenceStatus: 'supplied-unverified', protectionAdequacy: 'unevaluated', limitations: LIMITATIONS };
}

export default { evaluateDesignSynthesisFaultEvolution };

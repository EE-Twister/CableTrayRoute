import { evaluateDesignSynthesisFaultStudy } from './designSynthesisFaultStudy.mjs';
import { fingerprintStudyValue } from './studyLifecycle.mjs';
import { evaluateEatonConstantCurrentPlot, getEatonCurveResearchFingerprint } from './designSynthesisEatonCurveResearch.mjs';
import { motorCombinationBinding, compareMotorCombinationInitialRms } from './designSynthesisMotorCombinationFault.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const magnitude = value => Math.hypot(value.re, value.im);
const add = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const zero = () => ({ re: 0, im: 0 });
const negate = value => ({ re: -value.re, im: -value.im });
const sameNumber = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= Math.max(1e-9, Math.max(Math.abs(a), Math.abs(b)) * 1e-9);

function issue(code, path, message) {
  return { code, path, message, severity: 'blocking' };
}

function complex(value) {
  return record(value) && finite(value.re) && finite(value.im) ? { re: value.re, im: value.im } : null;
}

function caseFaultCurrent(row) {
  return complex(row?.fault?.totalFaultCurrentKA);
}

function branchCurrentIndex(row) {
  const terminals = [
    ...(Array.isArray(row?.branchTerminalCurrents) ? row.branchTerminalCurrents : []),
    ...(Array.isArray(row?.zeroImpedanceTieCurrents) ? row.zeroImpedanceTieCurrents : []),
  ];
  return new Map(terminals
    .filter(item => text(item?.branchId))
    .map(item => [item.branchId, item]));
}

function busVoltageMap(proposal) {
  const supply = proposal?.inputs?.original?.supply;
  const result = new Map();
  for (const item of proposal?.equipment || []) {
    if (!['source', 'panel', 'load', 'bus'].includes(item?.type)) continue;
    const voltage = item.type === 'source' ? supply?.voltage : item.voltage;
    if (text(item.id) && finite(voltage) && voltage > 0) result.set(item.id, voltage);
  }
  return result;
}

function faultBusIds(proposal) {
  return (proposal?.equipment || []).filter(item => ['source', 'panel', 'load', 'bus'].includes(item?.type)).map(item => String(item.id));
}

function makeSourceEndPlacement({ cable, device, aliasIds, busVoltages, equipmentById, issues }) {
  const path = `cables.${cable.id}.protectiveDevice`;
  const busId = String(cable.from || '');
  const voltageVac = busVoltages.get(busId);
  const deviceIdentity = String(device?.id || device?.catalogNumber || 'missing-device');
  const isBreaker = String(device?.type || device?.deviceType || '').toLowerCase().includes('breaker');
  const ratingKA = device?.interruptingRatingKA;
  const ratingVoltageVac = device?.interruptingRatingVoltageVac;
  const ratedSourceDocuments = Array.isArray(device?.sourceDocuments) ? device.sourceDocuments : [];
  const sourceIds = Array.isArray(device?.sourceIds) ? device.sourceIds : [];
  const fieldSources = device?.fieldSources ?? null;
  const ratingFieldSources = Array.isArray(fieldSources)
    ? fieldSources.filter(item => ['/candidate/branchCircuitBreaker/interruptingRatingKA', '/candidate/branchCircuitBreaker/ratedVoltageV'].includes(item?.pointer))
    : (Array.isArray(fieldSources?.['/interruptingRatings']) ? fieldSources['/interruptingRatings'] : []);
  const knownSourceIds = new Set([
    ...ratedSourceDocuments.map(item => typeof item === 'string' ? item : item?.id).filter(text),
    ...sourceIds.filter(text),
  ]);
  const fieldSourceIds = item => Array.isArray(item) ? item.filter(text) : (text(item) ? [item] : []);
  const fieldSourceIsResolved = item => {
    const ids = Array.isArray(fieldSources) ? fieldSourceIds(item?.sourceId || item?.sourceIds) : fieldSourceIds(item);
    return ids.some(id => knownSourceIds.has(id));
  };
  const hasGenericRatingProvenance = !Array.isArray(fieldSources) && ratingFieldSources.length > 0;
  const genericRatingProvenanceResolved = hasGenericRatingProvenance && ratingFieldSources.some(fieldSourceIsResolved);
  const motorCurrentProvenance = ratingFieldSources.some(item => item.pointer === '/candidate/branchCircuitBreaker/interruptingRatingKA' && fieldSourceIsResolved(item));
  const motorVoltageProvenance = ratingFieldSources.some(item => item.pointer === '/candidate/branchCircuitBreaker/ratedVoltageV' && fieldSourceIsResolved(item));
  const ratingFieldsProvenanceComplete = genericRatingProvenanceResolved || (motorCurrentProvenance && motorVoltageProvenance);
  const provenanceComplete = (ratedSourceDocuments.length > 0 || sourceIds.length > 0) && ratingFieldsProvenanceComplete;
  const exactVoltageRating = finite(voltageVac) && finite(ratingVoltageVac) && sameNumber(ratingVoltageVac, voltageVac);
  const documentedStraightRating = finite(voltageVac) && finite(ratingVoltageVac) && ratingVoltageVac > voltageVac &&
    String(device?.voltageApplicability || '') === 'manufacturer-documented-straight-voltage-rating-used-at-lower-system-voltage' &&
    Array.isArray(device?.voltageApplicabilitySourceDocuments) && device.voltageApplicabilitySourceDocuments.length > 0 &&
    device.voltageApplicabilitySourceDocuments.some(item => knownSourceIds.has(typeof item === 'string' ? item : item?.id)) &&
    text(device?.voltageApplicabilityBasis);
  const voltageApplicable = (exactVoltageRating || documentedStraightRating) && sameNumber(device?.evaluatedVoltageVac ?? voltageVac, voltageVac);
  const ratingComparable = isBreaker && finite(ratingKA) && ratingKA > 0 && voltageApplicable && provenanceComplete;
  if (!device) issues.push(issue('DEVICE_FAULT_SCREEN_DEVICE_MISSING', path, 'No proposed source-end protective device is present for this generated cable.'));
  else if (!isBreaker) issues.push(issue('DEVICE_FAULT_SCREEN_NOT_BREAKER', path, 'Only a documented standalone breaker interrupting rating is compared in this initial-RMS screen.'));
  else if (!ratingComparable) issues.push(issue('DEVICE_FAULT_SCREEN_RATING_NOT_COMPARABLE', path, 'Standalone interrupting rating, voltage applicability, and source provenance must all be explicit and applicable at the proposed location voltage.'));

  const aliases = (aliasIds || []).filter(Boolean);
  const deviceRecord = device ? {
    id: deviceIdentity,
    catalogNumber: device.catalogNumber || null,
    manufacturer: device.manufacturer || null,
    type: device.type || device.deviceType || null,
    libraryStatus: device.libraryStatus || null,
    researchStatus: device.researchStatus || null,
    selectedForApply: device.selectedForApply ?? null,
    standaloneInterruptingRating: {
      currentKA: finite(ratingKA) ? ratingKA : null,
      voltageVac: finite(ratingVoltageVac) ? ratingVoltageVac : null,
      applicableAtLocationVoltage: voltageApplicable,
      voltageApplicability: device?.voltageApplicability || (exactVoltageRating ? 'exact-voltage-rating' : null),
      voltageApplicabilitySourceDocuments: device?.voltageApplicabilitySourceDocuments || [],
      voltageApplicabilityBasis: device?.voltageApplicabilityBasis || null,
      provenanceStatus: provenanceComplete ? 'referenced' : 'missing',
      sourceDocuments: ratedSourceDocuments,
      sourceIds,
      fieldSources,
      ratingFieldSources,
    },
    conditionalCombinationRating: device.conditionalCombination ? {
      status: 'unevaluated',
      metadata: device.conditionalCombination,
    } : null,
  } : null;

  return {
    id: `cable:${cable.id}`,
    kind: 'cable-source-end',
    status: device && ratingComparable ? 'pending' : 'blocked',
    aliases,
    proposedLocation: {
      description: 'Proposed source-end device on the generated cable; not an installed fact.',
      branchId: String(cable.id),
      fromBusId: busId,
      protectedSideBusId: String(cable.to || ''),
      terminal: 'from',
      physicalFromBus: (() => {
        const row = equipmentById.get(busId) || {};
        return { id: busId, tag: row.tag || busId, routeNodeId: row.routeNodeId || null, x: row.x ?? null, y: row.y ?? null, z: row.z ?? null };
      })(),
      nominalVoltageLLV: voltageVac ?? null,
      currentReference: 'Signed complex terminal-current orientation follows the network solver’s from-to branch convention.',
    },
    device: deviceRecord,
    ratingComparable,
    _ratingKA: ratingComparable ? ratingKA : null,
    _branchIds: [String(cable.id)],
    _busId: busId,
    _path: path,
    _transformerBranchId: null,
    _researchDevice: device,
    cases: [],
    comparisons: {
      lineTerminalAvailableInitialRms: { status: 'not-compared', valueKA: null, caseBusId: busId },
      maximumThroughDeviceInitialRms: { status: 'not-compared', valueKA: null, faultBusId: null, caseKind: null },
      protectionAdequacy: 'unevaluated',
    },
  };
}

function isCableConnection(connection) {
  return text(connection?.cable?.id || connection?.cableId || connection?.id);
}

function canonicalOneLineChecks(proposal, issues) {
  const sheets = proposal?.oneLine?.sheets;
  if (!Array.isArray(sheets) || sheets.length !== 1 || !Array.isArray(sheets[0]?.connections)) {
    issues.push(issue('DEVICE_FAULT_SCREEN_ONELINE_MISSING', 'oneLine', 'A single finalized one-line sheet with canonical cable connections is required.'));
    return new Map();
  }
  const byId = new Map();
  for (const row of sheets[0].connections.filter(isCableConnection)) {
    const cableId = String(row?.cable?.id || row?.cableId || row?.id || '');
    if (byId.has(cableId)) issues.push(issue('DEVICE_FAULT_SCREEN_ONELINE_DUPLICATE', `oneLine.${cableId}`, 'One-line cable identity is duplicated.'));
    byId.set(cableId, row);
  }
  for (const cable of proposal?.cables || []) {
    const link = byId.get(String(cable?.id || ''));
    if (!link || String(link.from || link.source || '') !== String(cable.from || '') || String(link.to || link.target || '') !== String(cable.to || '')) {
      issues.push(issue('DEVICE_FAULT_SCREEN_ONELINE_ENDPOINT_MISMATCH', `cables.${cable?.id}`, 'Cable endpoints must match the canonical one-line connection.'));
    }
  }
  if (byId.size !== (proposal?.cables || []).length) issues.push(issue('DEVICE_FAULT_SCREEN_ONELINE_COVERAGE', 'oneLine.sheets[0].connections', 'One-line cable coverage must match generated cables exactly.'));
  return byId;
}

function currentForBranch(index, branchId) {
  return complex(index.get(branchId)?.fromCurrentIntoBranchKA);
}

function currentFromTransformerSecondary(index, branchId) {
  const value = complex(index.get(branchId)?.toCurrentIntoBranchKA);
  return value ? negate(value) : null;
}

function currentsAgree(left, right) {
  const residual = magnitude({ re: left.re - right.re, im: left.im - right.im });
  const scale = Math.max(magnitude(left), magnitude(right));
  return { residualKA: residual, scaleKA: scale, withinTolerance: residual <= Math.max(1e-9, scale * 1e-8) };
}

function evaluatePlacementCases(placement, validation, proposal, expectedBuses, issues) {
  const rows = Array.isArray(validation?.cases) ? validation.cases : [];
  const byFaultBus = new Map(rows.map(row => [String(row?.fault?.busId || row?.busId || ''), row]));
  const requiredBranchIds = placement._branchIds;
  const sourceBusId = placement._busId;
  const expectedFault = byFaultBus.get(sourceBusId);
  if (!expectedFault || !caseFaultCurrent(expectedFault)) {
    issues.push(issue('DEVICE_FAULT_SCREEN_LINE_TERMINAL_CASE_MISSING', placement._path, 'The base fault case at the proposed source-end location is missing or malformed.'));
    return;
  }
  const lineTerminalCurrent = caseFaultCurrent(expectedFault);
  placement.comparisons.lineTerminalAvailableInitialRms = {
    status: placement.ratingComparable ? (magnitude(lineTerminalCurrent) > placement._ratingKA * (1 + 1e-9) ? 'exceeds-rating' : 'not-exceeded') : 'not-compared',
    valueKA: magnitude(lineTerminalCurrent),
    phasorKA: lineTerminalCurrent,
    caseBusId: sourceBusId,
    ratingKA: placement._ratingKA,
    ratingVoltageVac: placement.device?.standaloneInterruptingRating?.voltageVac ?? null,
  };

  let max = null;
  const caseEvidence = [];
  for (const faultBusId of expectedBuses) {
    const row = byFaultBus.get(faultBusId);
    if (!row || row.status !== 'evaluated') continue;
    const index = branchCurrentIndex(row);
    let through = zero();
    let complete = true;
    for (const branchId of requiredBranchIds) {
      const value = currentForBranch(index, branchId);
      if (!value) { complete = false; break; }
      through = add(through, value);
    }
    if (!complete) {
      issues.push(issue('DEVICE_FAULT_SCREEN_BRANCH_CURRENT_MISSING', placement._path, `Branch terminal current is missing for ${faultBusId}.`));
      continue;
    }
    let currentForCase = through;
    let aggregateKclCrosscheck = null;
    let aggregateSourceReference = null;
    if (placement._transformerBranchId && faultBusId !== sourceBusId) {
      const transformerEquivalent = currentFromTransformerSecondary(index, placement._transformerBranchId);
      if (!transformerEquivalent) {
        issues.push(issue('DEVICE_FAULT_SCREEN_TRANSFORMER_TERMINAL_CURRENT_MISSING', placement._path, `Transformer secondary terminal current is missing for ${faultBusId}.`));
        continue;
      }
      aggregateKclCrosscheck = currentsAgree(through, transformerEquivalent);
      if (!aggregateKclCrosscheck.withinTolerance) {
        issues.push(issue('DEVICE_FAULT_SCREEN_SECONDARY_KCL_MISMATCH', placement._path, `Secondary feeder-cut current and transformer secondary-terminal current differ by ${aggregateKclCrosscheck.residualKA} kA for ${faultBusId}.`));
        continue;
      }
      currentForCase = transformerEquivalent;
      aggregateSourceReference = { faultBusId, branchId: placement._transformerBranchId, terminal: 'to', signMultiplier: -1 };
    }
    const valueKA = magnitude(currentForCase);
    const rowEvidence = {
      id: `bus-fault:${faultBusId}`,
      kind: 'generated-bus-fault',
      faultBusId,
      faultCurrentKA: caseFaultCurrent(row),
      faultCurrentRmsKA: finite(row.fault?.faultCurrentRmsKA) ? row.fault.faultCurrentRmsKA : caseFaultCurrent(row) ? magnitude(caseFaultCurrent(row)) : null,
      throughDeviceCurrentKA: currentForCase,
      throughDeviceCurrentRmsKA: valueKA,
      throughDeviceStatus: placement.ratingComparable ? (valueKA > placement._ratingKA * (1 + 1e-9) ? 'exceeds-rating' : 'not-exceeded') : 'not-compared',
      branchCurrentReference: placement._transformerBranchId && faultBusId !== sourceBusId
        ? { faultBusId, branchIds: [placement._transformerBranchId], terminal: 'to', signMultiplier: -1 }
        : { faultBusId, branchIds: requiredBranchIds.slice(), terminal: 'from', signMultiplier: 1 },
      ...(aggregateSourceReference ? { aggregateSourceReference } : {}),
      ...(aggregateKclCrosscheck ? { aggregateKclCrosscheckKA: { feederCutCurrentKA: through, transformerTerminalEquivalentKA: currentForCase, residualKA: aggregateKclCrosscheck.residualKA } } : {}),
    };
    caseEvidence.push(rowEvidence);
    if (!max || valueKA > max.valueKA) max = { valueKA, faultBusId, caseKind: rowEvidence.kind, phasorKA: currentForCase };

    if (faultBusId === sourceBusId) {
      let virtualCurrent = add(caseFaultCurrent(row), through);
      let virtualAggregateKclCrosscheck = null;
      let virtualAggregateSourceReference = null;
      if (placement._transformerBranchId) {
        const transformerEquivalent = currentFromTransformerSecondary(index, placement._transformerBranchId);
        if (!transformerEquivalent) {
          issues.push(issue('DEVICE_FAULT_SCREEN_TRANSFORMER_TERMINAL_CURRENT_MISSING', placement._path, 'Transformer secondary terminal current is missing for the immediate load-side fault check.'));
          continue;
        }
        virtualAggregateKclCrosscheck = currentsAgree(virtualCurrent, transformerEquivalent);
        if (!virtualAggregateKclCrosscheck.withinTolerance) {
          issues.push(issue('DEVICE_FAULT_SCREEN_SECONDARY_KCL_MISMATCH', placement._path, `Immediate load-side secondary-main KCL differs from the transformer terminal current by ${virtualAggregateKclCrosscheck.residualKA} kA.`));
          continue;
        }
        virtualCurrent = transformerEquivalent;
        virtualAggregateSourceReference = { faultBusId, branchId: placement._transformerBranchId, terminal: 'to', signMultiplier: -1 };
      }
      const virtualValueKA = magnitude(virtualCurrent);
      const virtualEvidence = {
        id: `immediate-load-side-fault:${sourceBusId}`,
        kind: 'immediate-load-side-zero-impedance-fault',
        faultBusId: sourceBusId,
        faultCurrentKA: caseFaultCurrent(row),
        faultCurrentRmsKA: magnitude(caseFaultCurrent(row)),
        throughDeviceCurrentKA: virtualCurrent,
        throughDeviceCurrentRmsKA: virtualValueKA,
        throughDeviceStatus: placement.ratingComparable ? (virtualValueKA > placement._ratingKA * (1 + 1e-9) ? 'exceeds-rating' : 'not-exceeded') : 'not-compared',
        branchCurrentReference: { faultBusId, branchIds: requiredBranchIds.slice(), terminal: 'from', signMultiplier: 1 },
        ...(virtualAggregateSourceReference ? { aggregateSourceReference: virtualAggregateSourceReference } : {}),
        ...(virtualAggregateKclCrosscheck ? { aggregateKclCrosscheckKA: { feederAndFaultCurrentKA: add(caseFaultCurrent(row), through), transformerTerminalEquivalentKA: virtualCurrent, residualKA: virtualAggregateKclCrosscheck.residualKA } } : {}),
        ...(placement._transformerBranchId ? { aggregateSourceReference: { branchId: placement._transformerBranchId, terminal: 'to', signMultiplier: -1 } } : {}),
        voltageReference: { faultBusId, busId: sourceBusId },
        method: 'Closed zero-impedance KCL: base fault-current phasor plus signed from-terminal phasors of the placement cut branches.',
      };
      caseEvidence.push(virtualEvidence);
      if (!max || virtualValueKA > max.valueKA) max = { valueKA: virtualValueKA, faultBusId: sourceBusId, caseKind: virtualEvidence.kind, phasorKA: virtualCurrent };
    }
  }
  placement.cases = caseEvidence;
  if (!max) {
    issues.push(issue('DEVICE_FAULT_SCREEN_CASES_UNAVAILABLE', placement._path, 'No complete modeled fault cases are available for this placement.'));
    return;
  }
  const exceeds = placement.ratingComparable && max.valueKA > placement._ratingKA * (1 + 1e-9);
  placement.comparisons.maximumThroughDeviceInitialRms = {
    status: placement.ratingComparable ? (exceeds ? 'exceeds-rating' : 'not-exceeded') : 'not-compared',
    valueKA: max.valueKA,
    phasorKA: max.phasorKA,
    faultBusId: max.faultBusId,
    caseKind: max.caseKind,
    ratingKA: placement._ratingKA,
    ratingVoltageVac: placement.device?.standaloneInterruptingRating?.voltageVac ?? null,
  };
  placement.status = placement.ratingComparable ? (exceeds ? 'exceeds-rating' : 'evaluated') : 'blocked';
}

function cleanup(placement) {
  const { _ratingKA, _branchIds, _busId, _path, _transformerBranchId, _researchDevice, ...publicRow } = placement;
  return publicRow;
}

/** Screen proposed source-end breaker locations against explicit initial-RMS fault cases. */
export function evaluateDesignSynthesisDeviceFaultScreen({ proposal, faultStudyValidation = proposal?.faultStudyValidation } = {}) {
  const issues = [];
  const faultStudy = proposal?.faultStudy;
  const result = {
    status: 'blocked',
    method: 'design-synthesis-proposed-device-initial-rms-screen-v1',
    scope: 'initial-symmetrical-rms-only',
    modelInputFingerprint: null,
    networkModelInputFingerprint: faultStudyValidation?.modelInputFingerprint || null,
    curveResearchDatasetFingerprint: getEatonCurveResearchFingerprint(),
    sourceInventory: faultStudyValidation?.sourceInventory ? structuredClone(faultStudyValidation.sourceInventory) : null,
    coverage: { status: 'incomplete', expectedFaultBusIds: [], modeledFaultBusIds: [], missingFaultBusIds: [] },
    placements: [],
    issues,
    limitations: [
      'Placements are proposed source-end screening locations and do not represent installed equipment.',
      'Standalone ratings and selected cited motor-combination certificate values are distinct comparisons; the applicable combination rating and assembly SCCR remain unevaluated.',
      'Initial symmetrical RMS comparisons do not establish maximum or minimum duty, peak or asymmetrical duty, thermal withstand, protective clearing, coordination, reverse-feed qualification, or code compliance.',
      'A not-exceeded initial-RMS comparison does not establish protection adequacy; protectionAdequacy remains unevaluated.',
    ],
  };
  if (proposal?.faultStudy === undefined) return result;

  const cables = Array.isArray(proposal?.cables) ? proposal.cables : [];
  const equipment = Array.isArray(proposal?.equipment) ? proposal.equipment : [];
  const equipmentById = new Map(equipment.map(item => [String(item?.id || ''), item]));
  const busVoltages = busVoltageMap(proposal);
  const expectedBuses = faultBusIds(proposal);
  result.coverage.expectedFaultBusIds = expectedBuses;

  canonicalOneLineChecks(proposal, issues);
  if (!record(faultStudyValidation) || faultStudyValidation.status !== 'evaluated' || faultStudyValidation.scope !== 'initial-symmetrical-rms-only' || !text(faultStudyValidation.modelInputFingerprint)) {
    issues.push(issue('DEVICE_FAULT_SCREEN_NETWORK_NOT_EVALUATED', 'faultStudyValidation', 'A successfully evaluated explicit initial-RMS fault network is required.'));
  } else {
    const fresh = evaluateDesignSynthesisFaultStudy({ proposal, faultStudy });
    const casesMatch = fresh.status === 'evaluated' && fingerprintStudyValue(fresh.cases) === fingerprintStudyValue(faultStudyValidation.cases);
    if (fresh.status !== 'evaluated' || fresh.modelInputFingerprint !== faultStudyValidation.modelInputFingerprint || !casesMatch) {
      issues.push(issue('DEVICE_FAULT_SCREEN_STALE_NETWORK', 'faultStudyValidation.modelInputFingerprint', 'Fault cases must match the finalized proposal and explicit source inputs.'));
    }
  }

  const rows = Array.isArray(faultStudyValidation?.cases) ? faultStudyValidation.cases : [];
  const caseIds = rows.map(row => String(row?.fault?.busId || row?.busId || '')).filter(Boolean);
  const caseSet = new Set(caseIds);
  const missingFaultBusIds = expectedBuses.filter(id => !caseSet.has(id));
  result.coverage.modeledFaultBusIds = caseIds;
  result.coverage.missingFaultBusIds = missingFaultBusIds;
  result.coverage.status = missingFaultBusIds.length === 0 && caseIds.length === expectedBuses.length && caseSet.size === caseIds.length ? 'complete' : 'incomplete';
  if (result.coverage.status !== 'complete') issues.push(issue('DEVICE_FAULT_SCREEN_FAULT_COVERAGE_INCOMPLETE', 'faultStudyValidation.cases', 'A non-exceeded screen requires one evaluated fault case for every generated bus; partial faultBusIds are insufficient.'));

  const connectionMap = canonicalOneLineChecks(proposal, []);
  const cableRows = new Map(cables.map(item => [String(item?.id || ''), item]));
  const transformer = equipment.filter(item => item?.type === 'transformer');
  const primaryCableByTransformer = new Map();
  for (const tx of transformer) {
    const primaryCable = cables.find(item => String(item.id) === `F-${tx.id}-PRI`);
    if (tx.primaryProtectionLocation !== 'source-end-of-transformer-primary-feeder' || !primaryCable) {
      issues.push(issue('DEVICE_FAULT_SCREEN_PRIMARY_LOCATION_INVALID', `transformer.${tx.id}.primaryProtectionLocation`, 'Transformer primary protective-device location must resolve to its generated primary feeder source end.'));
    }
    primaryCableByTransformer.set(String(tx.id), primaryCable || null);
    if (!primaryCable || !tx.primaryProtectiveDevice || JSON.stringify(tx.primaryProtectiveDevice) !== JSON.stringify(primaryCable.protectiveDevice)) {
      issues.push(issue('DEVICE_FAULT_SCREEN_PRIMARY_ALIAS_MISMATCH', `transformer.${tx.id}.primaryProtectiveDevice`, 'Transformer primary protection alias and final primary-feeder device record must match exactly.'));
    }
    if (proposal.transformer && (String(proposal.transformer.id) !== String(tx.id) || JSON.stringify(proposal.transformer.primaryProtectiveDevice) !== JSON.stringify(tx.primaryProtectiveDevice) || JSON.stringify(proposal.transformer.secondaryMainDevice) !== JSON.stringify(tx.secondaryMainDevice))) {
      issues.push(issue('DEVICE_FAULT_SCREEN_TRANSFORMER_ALIAS_MISMATCH', 'transformer', 'Proposal transformer and finalized equipment transformer protection records must match.'));
    }
  }

  for (const cable of cables) {
    const id = String(cable?.id || '');
    const connection = connectionMap.get(id);
    if (!connection || String(connection.from || connection.source || '') !== String(cable.from || '') || String(connection.to || connection.target || '') !== String(cable.to || '')) {
      issues.push(issue('DEVICE_FAULT_SCREEN_CABLE_ENDPOINT_MISMATCH', `cables.${id}`, 'Placement endpoints must match the finalized one-line cable.'));
    }
    const owner = transformer.find(tx => primaryCableByTransformer.get(String(tx.id)) === cable);
    const aliases = owner ? [`transformer.${owner.id}.primaryProtectiveDevice`] : [];
    result.placements.push(makeSourceEndPlacement({ cable, device: cable.protectiveDevice || null, aliasIds: aliases, busVoltages, equipmentById, issues }));
  }

  for (const tx of transformer) {
    if ((faultStudy?.sources || []).some(source => String(source?.equipmentId || '') === String(tx.secondaryBusId || ''))) {
      issues.push(issue('DEVICE_FAULT_SCREEN_SOURCE_AT_SECONDARY_BUS', `faultStudy.sources.${tx.secondaryBusId}`, 'Aggregate secondary-main screen does not support a source connected directly at the transformer secondary bus.'));
    }
    const outgoing = cables.filter(cable => String(cable.from || '') === String(tx.secondaryBusId || ''));
    const incoming = cables.filter(cable => String(cable.to || '') === String(tx.secondaryBusId || ''));
    const panelFeeders = outgoing.filter(cable => equipmentById.get(String(cable.to || ''))?.type === 'panel');
    const locationValid = tx.secondaryMainLocation === 'transformer-secondary-terminals';
    if (!locationValid || !panelFeeders.length || panelFeeders.length !== outgoing.length || incoming.length > 0) {
      issues.push(issue('DEVICE_FAULT_SCREEN_SECONDARY_CUT_AMBIGUOUS', `transformer.${tx.id}.secondaryMainLocation`, 'Secondary main requires an explicit transformer-secondary-terminal location and an unambiguous complete set of outgoing panel feeders.'));
    }
    if (proposal.transformer && JSON.stringify(proposal.transformer.secondaryMainDevice) !== JSON.stringify(tx.secondaryMainDevice)) {
      issues.push(issue('DEVICE_FAULT_SCREEN_SECONDARY_ALIAS_MISMATCH', `transformer.${tx.id}.secondaryMainDevice`, 'Proposal and finalized transformer secondary-main device records must match.'));
    }
    const device = tx.secondaryMainDevice || null;
    const fakeCable = { id: `M-${tx.id}-SEC`, from: tx.secondaryBusId, to: tx.secondaryBusId };
    const placement = makeSourceEndPlacement({ cable: fakeCable, device, aliasIds: [], busVoltages, equipmentById, issues });
    placement.id = `secondary-main:${tx.id}`;
    placement.kind = 'aggregate-secondary-main';
    placement._branchIds = panelFeeders.map(item => String(item.id));
    placement._path = `transformer.${tx.id}.secondaryProtectiveDevice`;
    placement._transformerBranchId = String(tx.id);
    placement.proposedLocation = {
      description: 'Proposed aggregate secondary main at transformer secondary terminals; not an installed fact.',
      branchIds: placement._branchIds.slice(),
      fromBusId: String(tx.secondaryBusId || ''),
      protectedSide: 'all outgoing secondary panel feeders',
      terminal: 'secondary-main-cut',
      physicalFromBus: (() => {
        const row = equipmentById.get(String(tx.secondaryBusId || '')) || {};
        return { id: String(tx.secondaryBusId || ''), tag: row.tag || String(tx.secondaryBusId || ''), routeNodeId: row.routeNodeId || null, x: row.x ?? null, y: row.y ?? null, z: row.z ?? null };
      })(),
      nominalVoltageLLV: busVoltages.get(String(tx.secondaryBusId || '')) ?? null,
      currentReference: 'Complex from-terminal currents are summed for all secondary panel feeder branches at the same nominal voltage; magnitudes are not added.',
    };
    result.placements.push(placement);
  }

  const fullCoverage = result.coverage.status === 'complete' && rows.every(row => row.status === 'evaluated');
  if (!fullCoverage) issues.push(issue('DEVICE_FAULT_SCREEN_CASES_NOT_EVALUATED', 'faultStudyValidation.cases', 'All generated bus fault cases must be evaluated before device current comparisons are complete.'));
  const blockingEvidenceCodes = new Set([
    'DEVICE_FAULT_SCREEN_NETWORK_NOT_EVALUATED', 'DEVICE_FAULT_SCREEN_STALE_NETWORK',
    'DEVICE_FAULT_SCREEN_ONELINE_MISSING', 'DEVICE_FAULT_SCREEN_ONELINE_DUPLICATE',
    'DEVICE_FAULT_SCREEN_ONELINE_ENDPOINT_MISMATCH', 'DEVICE_FAULT_SCREEN_ONELINE_COVERAGE',
    'DEVICE_FAULT_SCREEN_CABLE_ENDPOINT_MISMATCH', 'DEVICE_FAULT_SCREEN_FAULT_COVERAGE_INCOMPLETE',
    'DEVICE_FAULT_SCREEN_CASES_NOT_EVALUATED', 'DEVICE_FAULT_SCREEN_PRIMARY_LOCATION_INVALID',
    'DEVICE_FAULT_SCREEN_PRIMARY_ALIAS_MISMATCH', 'DEVICE_FAULT_SCREEN_TRANSFORMER_ALIAS_MISMATCH',
    'DEVICE_FAULT_SCREEN_SECONDARY_ALIAS_MISMATCH', 'DEVICE_FAULT_SCREEN_SECONDARY_CUT_AMBIGUOUS',
    'DEVICE_FAULT_SCREEN_SOURCE_AT_SECONDARY_BUS',
  ]);
  const evidenceFresh = !issues.some(item => blockingEvidenceCodes.has(item.code));
  if (fullCoverage && evidenceFresh) {
    for (const placement of result.placements) evaluatePlacementCases(placement, faultStudyValidation, proposal, expectedBuses, issues);
  }

  const exceedances = result.placements.flatMap(placement => {
    const checks = [placement.comparisons.lineTerminalAvailableInitialRms, placement.comparisons.maximumThroughDeviceInitialRms];
    return checks.filter(item => item.status === 'exceeds-rating').map(item => ({ placementId: placement.id, comparison: item === placement.comparisons.lineTerminalAvailableInitialRms ? 'line-terminal-available' : 'through-device-current', valueKA: item.valueKA, ratingKA: item.ratingKA, faultBusId: item.faultBusId || item.caseBusId }));
  });
  for (const item of exceedances) issues.push(issue('DEVICE_FAULT_SCREEN_RATING_EXCEEDED', `deviceFaultValidation.${item.placementId}`, `${item.comparison} initial symmetrical RMS current ${item.valueKA} kA exceeds standalone breaker rating ${item.ratingKA} kA.`));
  const caseIntegrityFailure = issues.some(item => [
    'DEVICE_FAULT_SCREEN_LINE_TERMINAL_CASE_MISSING',
    'DEVICE_FAULT_SCREEN_BRANCH_CURRENT_MISSING',
    'DEVICE_FAULT_SCREEN_CASES_UNAVAILABLE',
    'DEVICE_FAULT_SCREEN_TRANSFORMER_TERMINAL_CURRENT_MISSING',
    'DEVICE_FAULT_SCREEN_SECONDARY_KCL_MISMATCH',
  ].includes(item.code));
  if (caseIntegrityFailure) {
    for (const placement of result.placements) {
      placement.comparisons.lineTerminalAvailableInitialRms.status = 'not-compared';
      placement.comparisons.lineTerminalAvailableInitialRms.valueKA = null;
      placement.comparisons.lineTerminalAvailableInitialRms.phasorKA = null;
      placement.comparisons.maximumThroughDeviceInitialRms = { status: 'not-compared', valueKA: null, faultBusId: null, caseKind: null };
      placement.status = 'blocked';
    }
  }
  const motorBindings = [];
  for (const placement of result.placements) {
    const binding = motorCombinationBinding(proposal, placement);
    if (!binding) continue;
    motorBindings.push(binding);
    const comparison = compareMotorCombinationInitialRms(binding, placement, fullCoverage && evidenceFresh && !caseIntegrityFailure);
    placement.comparisons.citedMotorCombinationInitialRms = comparison;
    if (comparison.status === 'above-cited-value') {
      placement.status = 'blocked';
      issues.push(issue('DEVICE_FAULT_SCREEN_CITED_COMBINATION_VALUE_EXCEEDED', `deviceFaultValidation.${placement.id}`, `Modeled line-terminal initial RMS current ${comparison.valueKA} kA exceeds the ${comparison.ratingKA} kA value in the cited motor-combination certificate row; investigate applicable combination evidence. This does not determine assembly SCCR.`));
    }
  }
  if (fullCoverage && evidenceFresh && !caseIntegrityFailure) {
    for (const placement of result.placements) {
      const current = placement.comparisons.maximumThroughDeviceInitialRms;
      if (placement.ratingComparable && current?.status === 'not-exceeded' && finite(current.valueKA)) {
        placement.comparisons.constantCurrentCurveResearch = evaluateEatonConstantCurrentPlot({
          device: placement._researchDevice, voltageVac: placement.proposedLocation.nominalVoltageLLV,
          currentA: current.valueKA * 1000,
        });
      }
    }
  }
  result.deviceInputFingerprint = fingerprintStudyValue({
    cables: cables.map(item => ({ id: item.id, from: item.from, to: item.to, protectiveDevice: item.protectiveDevice || null })),
    transformers: transformer.map(item => ({ id: item.id, primaryProtectionLocation: item.primaryProtectionLocation, primaryProtectiveDevice: item.primaryProtectiveDevice || null, secondaryMainLocation: item.secondaryMainLocation, secondaryMainDevice: item.secondaryMainDevice || null })),
    placements: result.placements.map(item => ({ id: item.id, proposedLocation: item.proposedLocation, device: item.device, ratingComparable: item.ratingComparable })),
    ...(motorBindings.length ? { motorBindings } : {}),
  });
  result.modelInputFingerprint = fingerprintStudyValue({
    networkModelInputFingerprint: result.networkModelInputFingerprint,
    deviceInputFingerprint: result.deviceInputFingerprint,
  });
  result.status = issues.length === 0 ? 'evaluated' : 'blocked';
  result.placements = result.placements.map(cleanup);
  return result;
}

export default { evaluateDesignSynthesisDeviceFaultScreen };

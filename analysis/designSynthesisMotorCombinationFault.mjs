// This comparison is tied to the specific certificate rows already cited by
// the motor research candidates. It is not an assembly SCCR determination.
const certificates = {
  '3RU2136-4DB0': { contactor: '3RT2036-1NB30', breaker: 35, maximum: 35, rating: 25, revision: '2023-03-20', source: 'siemens-ul-3ru2136-2023', combination: '3RT203. + 3RU2136-4D + 3VA51' },
  '3RU2136-4EB0': { contactor: '3RT2036-1NB30', breaker: 50, maximum: 50, rating: 25, revision: '2023-03-20', source: 'siemens-ul-3ru2136-2023', combination: '3RT203. + 3RU2136-4E + 3VA51' },
  '3RU2136-4FB0': { contactor: '3RT2036-1NB30', breaker: 60, maximum: 60, rating: 25, revision: '2023-03-20', source: 'siemens-ul-3ru2136-2023', combination: '3RT203. + 3RU2136-4F + 3VA51' },
  '3RU2136-4GB0': { contactor: '3RT2036-1NB30', breaker: 60, maximum: 60, rating: 25, revision: '2023-03-20', source: 'siemens-ul-3ru2136-2023', combination: '3RT203. + 3RU2136-4G + 3VA51' },
  '3RU2136-4HB0': { contactor: '3RT2036-1NB30', breaker: 70, maximum: 70, rating: 25, revision: '2023-03-20', source: 'siemens-ul-3ru2136-2023', combination: '3RT203. + 3RU2136-4H + 3VA51' },
};
const certificateUrl = 'https://cache.industry.siemens.com/dl/files/763/103200763/att_1148449/v1/3RU2136_CoC_202307191454405318.pdf?download=true';
const smallCertificateUrl = 'https://cache.industry.siemens.com/dl/files/299/40223299/att_1326996/v1/3RU2126_CoC_202505131337157102.pdf';
const smallRows = {
  '3RU2126-4AB0': { family: '3RU2126-4A', minimum: 11, maximumSetting: 16, maximum: 30 },
  '3RU2126-4BB0': { family: '3RU2126-4B', minimum: 14, maximumSetting: 20, maximum: 40 },
};

function certificateFor(candidate) {
  if (candidate?.overloadRelay?.catalogNumber === '3RU2146-4JB0') return {
    contactor: '3RT2046-1NB30', breaker: 90, breakerCatalog: '3VA5290-6EC31-0AA0', maximum: 200, rating: 65, relayMinimum: 45, relayMaximum: 63,
    certificate: 'E31519', revision: '2025-10-28', source: 'siemens-ul-e31519-2025',
    url: 'https://cache.industry.siemens.com/dl/files/233/109742233/att_1348606/v1/UL_CoC_3RT2_4-2025_202511121349065039.pdf',
    combination: '3RT204 + 3RU2146-4J + 3VA52 HFAS', pointers: ['/candidate/conditionalCombination'],
  };
  const s2 = certificates[candidate?.overloadRelay?.catalogNumber];
  if (s2) return { ...s2, url: certificateUrl, pointers: ['/candidate/conditionalCombination'] };
  const small = smallRows[candidate?.overloadRelay?.catalogNumber];
  const breaker = candidate?.branchCircuitBreaker;
  if (!small || ![25, 30].includes(breaker?.continuousCurrentA) || breaker.interruptingClass !== 'H / HEAS') return null;
  return {
    ...small, contactor: '3RT2027-1BB40', breaker: breaker.continuousCurrentA, rating: 65,
    revision: '2025-03-17', source: 'siemens-ul-e44653-2025-03-17', url: smallCertificateUrl,
    combination: `3RT2027 / 3RT2028 + ${small.family} + 3VA51 HEAS BCPD`,
    pointers: ['/candidate/conditionalCombination/combination', '/candidate/conditionalCombination/maximumBreakerCurrentA', '/candidate/conditionalCombination/shortCircuitCurrentKA'],
    sha256: 'c55126215a47084e9d40a8f0e11589a083285798a294c2ff32ce1ef00e55d45d',
  };
}

export function motorCombinationBinding(proposal, placement) {
  const device = placement._researchDevice;
  const ref = device?.assemblyEvidenceRef;
  if (ref?.section !== 'motorStarterCandidates') return null;
  const cases = Array.isArray(proposal.motorStarterCandidates?.cases) ? proposal.motorStarterCandidates.cases : [];
  const matches = cases.filter(row => row && String(row.motorId) === String(ref.motorId) && row.candidate?.id === ref.candidateId);
  const candidate = matches.length === 1 ? matches[0].candidate : null;
  return { ref, candidate, protectedSideBusId: placement.proposedLocation.protectedSideBusId };
}

export function compareMotorCombinationInitialRms(binding, placement, evidenceComplete) {
  const result = { status: 'not-compared', valueKA: null, ratingKA: null, caseBusId: placement._busId, reason: 'A complete fresh fault model and matching cited motor combination are required.', protectionAdequacy: 'unevaluated' };
  const candidate = binding?.candidate;
  const device = placement._researchDevice;
  const metadata = candidate?.conditionalCombination;
  const row = certificateFor(candidate);
  const source = Array.isArray(candidate?.sources) ? candidate.sources.find(item => item?.id === row?.source) : null;
  const fields = device?.fieldSources || [];
  const candidateFields = candidate?.fieldSources || [];
  const sourced = list => Array.isArray(list) && row?.pointers.every(pointer => list.some(item => item.pointer === pointer && item.sourceId === row.source));
  const exact = row && typeof binding.ref.motorId === 'string' && binding.ref.motorId.length > 0 && typeof binding.ref.candidateId === 'string' && binding.ref.candidateId.length > 0 && candidate?.manufacturer === 'Siemens' && candidate.contactor?.catalogNumber === row.contactor &&
    candidate.branchCircuitBreaker?.catalogNumber === (row.breakerCatalog || `3VA51${row.breaker}-6EC31-0AA0`) &&
    candidate.branchCircuitBreaker?.continuousCurrentA === row.breaker && candidate.branchCircuitBreaker.fixedOverloadPickupA === row.breaker &&
    candidate.branchCircuitBreaker.poles === 3 && candidate.branchCircuitBreaker.ratedVoltageV === 480 && candidate.branchCircuitBreaker.interruptingRatingKA === 65 &&
    device?.catalogNumber === candidate.branchCircuitBreaker.catalogNumber && device.continuousCurrentA === row.breaker && device.tripRatingA === row.breaker &&
    device.poles === 3 && device.ratedVoltageVac === 480 && device.evaluatedVoltageVac === 480 && device.interruptingRatingVoltageVac === 480 && device.interruptingRatingKA === 65 &&
    String(binding.ref.motorId) === String(binding.protectedSideBusId) &&
    metadata?.certificate === (row.certificate || 'E44653') && metadata.certificateRevision === row.revision && metadata.combination === row.combination &&
    metadata.circuitVoltageV === 480 && metadata.maximumBreakerCurrentA === row.maximum && metadata.shortCircuitCurrentKA === row.rating &&
    (!row.breakerCatalog || (candidate.branchCircuitBreaker.interruptingClass === 'H / HFAS' && candidate.overloadRelay.currentSettingMinA === row.relayMinimum && candidate.overloadRelay.currentSettingMaxA === row.relayMaximum && metadata.coordinationType === 'not established')) &&
    (!row.family || (metadata.coordinationType === 'Type 1' && metadata.overloadRelayRangeMinA === row.minimum && metadata.overloadRelayRangeMaxA === row.maximumSetting && candidate.overloadRelay.currentSettingMinA === row.minimum && candidate.overloadRelay.currentSettingMaxA === row.maximumSetting && row.breaker <= row.maximum)) &&
    JSON.stringify(device.conditionalCombination) === JSON.stringify(metadata) &&
    placement.proposedLocation.nominalVoltageLLV === 480 && source?.revision === row.revision && source.url === row.url && (!row.sha256 || source.sha256 === row.sha256) &&
    Array.isArray(device.sourceIds) && device.sourceIds.includes(row.source) && sourced(fields) && sourced(candidateFields);
  const line = placement.comparisons.lineTerminalAvailableInitialRms;
  if (!evidenceComplete || !exact || !Number.isFinite(line?.valueKA) || line.valueKA < 0) return result;
  return {
    status: line.valueKA > row.rating * (1 + 1e-9) ? 'above-cited-value' : 'not-above-cited-value-unqualified',
    valueKA: line.valueKA, ratingKA: row.rating, ratingVoltageV: 480, caseBusId: placement._busId,
    sourceId: row.source, certificate: metadata.certificate, certificateRevision: row.revision,
    reason: 'Comparison with this cited certificate row only; other published combinations may exist. It does not establish assembly SCCR or protection adequacy.',
    protectionAdequacy: 'unevaluated',
  };
}

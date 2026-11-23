const SQRT3 = Math.sqrt(3);

export const TRANSFORMER_PROFILE_REVISION = 'schneider-exn-copper-2020-r2';

const catalogSource = {
  title: 'Square D EXN Low Voltage Distribution Transformers Catalog 7400CT1901',
  publisher: 'Schneider Electric',
  edition: '03/2020',
  url: 'https://iportal2.schneider-electric.com/Contents/docs/SQUARE%20D%20EXN%20LOW%20VOLTAGE%20DISTRIBUTION%20TRANSFORMERS%207400CT1901%20CATALOG.PDF',
  productInfoUrl: 'https://productinfo.se.com/7400ct1901exnlowvoltdisttrnsf/',
  note: 'Catalog values are preserved as published; 2020 copper 30, 75 and 150 kVA profiles only. Do not merge later Digest Plus data.'
};

const profileRows = [
  {
    profileId: 'schneider-exn30t3hcu-2020', catalogNumber: 'EXN30T3HCU', ratedKVA: 30, page: 7,
    coreLossW: 68, coilLossW: 1049, zPercent: 4.08, ixPercent: 2.24, xr: 0.65,
    productSheet: 'https://iportal2.schneider-electric.com/Contents/docs/SQD-EXN30T3HCU_DATASHEET.PDF'
  },
  {
    profileId: 'schneider-exn75t3hcu-2020', catalogNumber: 'EXN75T3HCU', ratedKVA: 75, page: 13,
    coreLossW: 142, coilLossW: 2169, zPercent: 5.56, ixPercent: 4.84, xr: 1.76,
    productSheet: 'https://iportal2.schneider-electric.com/Contents/docs/SQD-EXN75T3HCU_DATASHEET.PDF'
  },
  {
    profileId: 'schneider-exn150t3hcu-2020', catalogNumber: 'EXN150T3HCU', ratedKVA: 150, page: 20,
    coreLossW: 235, coilLossW: 3045, zPercent: 3.79, ixPercent: 3.26, xr: 1.70
  }
];

function finite(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string' || value.trim() === '') return false;
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) && Number.isFinite(Number(value));
}
function issue(code, message, path = 'criteria.transformer') { return { code, message, path, severity: 'blocking' }; }

function makeProfile(row) {
  const z = row.zPercent;
  const xr = row.xr;
  const r = z / Math.sqrt(1 + xr ** 2);
  const x = r * xr;
  const primaryRatedCurrentA = row.ratedKVA * 1000 / (SQRT3 * 480);
  const secondaryRatedCurrentA = row.ratedKVA * 1000 / (SQRT3 * 208);
  const derivedRatedI2RLossW = row.ratedKVA * 1000 * (r / 100);
  return {
    id: row.profileId,
    profileId: row.profileId,
    profileRevision: TRANSFORMER_PROFILE_REVISION,
    catalogNumber: row.catalogNumber,
    manufacturer: 'Schneider Electric / Square D',
    windingMaterial: 'copper',
    temperatureRiseC: 150,
    ratedKVA: row.ratedKVA,
    primaryVoltageVac: 480,
    primaryConnection: 'delta',
    secondaryVoltageVac: 208,
    secondaryConnection: 'wye-grounded; 208Y/120 V catalog designation',
    secondaryLineToNeutralVoltageVac: 120,
    phases: 3,
    frequencyHz: 60,
    primaryRatedCurrentA,
    secondaryRatedCurrentA,
    primaryMaxOcpA: primaryRatedCurrentA * 2.5,
    secondaryMaxOcpA: secondaryRatedCurrentA * 1.25,
    losses: { coreW: row.coreLossW, catalogCoilLossW: row.coilLossW, catalogCorePlusCoilLossW: row.coreLossW + row.coilLossW },
    rawPublished: {
      coreLossW: row.coreLossW,
      coilLossW: row.coilLossW,
      impedancePercent: row.zPercent,
      reactancePercent: row.ixPercent,
      xOverR: row.xr,
      fieldSource: { ...catalogSource, pages: [row.page] }
    },
    sourceDocuments: [{ ...catalogSource, pages: [row.page] }, ...(row.productSheet ? [{ title: `${row.catalogNumber} manufacturer-issued product data sheet`, url: row.productSheet }] : [])],
    seriesModel: {
      modelType: 'balanced-positive-sequence-series-impedance-magnitude',
      zPercent: z,
      xr,
      rPercent: r,
      xPercent: x,
      sourceBasisKVA: row.ratedKVA,
      derivedRatedI2RLossW,
      derivation: 'R%=Z%/sqrt(1+(X/R)^2); X%=R%*(X/R), using the published rounded %IZ and X/R. Published %IX is retained separately as a cross-check.',
      publishedIxCheck: { publishedXPercent: row.ixPercent, derivedXPercent: x, deltaPercentagePoints: x - row.ixPercent, status: 'rounded-publication-values-consistent-within-interval-analysis' },
      limitation: 'Nameplate/catalog screening profile, not unit test impedance or guaranteed minimum/maximum. Phase displacement and magnetizing current are not supplied; magnitude-only studies must scope their exclusion/assumptions.'
    },
    phaseModelAssumption: {
      model: 'balanced-radial-positive-sequence-magnitude-only',
      transformerPhaseDisplacement: 'ignored by explicit magnitude-only assumption; not asserted to be zero',
      phaseAnglesReported: false,
      phaseSensitiveUsePermitted: false
    },
    protectionBasis: {
      primaryMaxOcpA: primaryRatedCurrentA * 2.5,
      secondaryMaxOcpA: secondaryRatedCurrentA * 1.25,
      source: { title: 'How to select the proper Overcurrent Circuit Protection for a Transformer?', publisher: 'Schneider Electric', url: 'https://www.se.com/us/en/faqs/FA97084/', published: '2002-06-20', modified: '2025-12-15' },
      conditionalBasis: 'Schneider FAQ describes primary protection up to 250% where secondary current is at least 9 A and secondary protection is limited to 125%; both rated currents here exceed 9 A. Secondary feeder protection is assumed at transformer terminals. These values are maximum limits for screening, not selected standard device sizes or a complete NEC determination.'
    },
    faultModel: {
      method: 'ideal-ratio-transfer screening upper-bound assumption',
      limitation: 'Transfers only the stated upstream three-phase primary source-fault magnitude by nominal voltage ratio. Assumes passive positive-sequence source behavior without capacitive cancellation. Excludes transformer impedance credit because manufacturer tolerance/minimum-impedance basis and source X/R are unavailable, and excludes downstream motor/generator contributions. Not a study-ready short-circuit result or coordination basis.'
    }
  };
}

const profiles = profileRows.map(makeProfile);

export function listTransformerProfiles() {
  return profiles.map(profile => structuredClone(profile));
}

export function selectTransformer({ requiredKVA, requiredPowerFactor = 1, minimumRatedKVA, primaryVoltageVac = 480, secondaryVoltageVac = 208, phases = 3, frequencyHz = 60, maxLoadingPercent = 100, allowedProfileIds, windingMaterial = 'copper' } = {}) {
  const issues = [];
  const input = { requiredKVA, requiredPowerFactor, ...(minimumRatedKVA === undefined ? {} : { minimumRatedKVA }), primaryVoltageVac, secondaryVoltageVac, phases, frequencyHz, maxLoadingPercent, windingMaterial };
  if (!finite(requiredKVA) || Number(requiredKVA) <= 0) issues.push(issue('INVALID_TRANSFORMER_REQUIRED_KVA', 'A positive requiredKVA is required.', 'requiredKVA'));
  if (!finite(primaryVoltageVac) || !finite(secondaryVoltageVac) || !finite(phases) || !finite(frequencyHz) || Number(primaryVoltageVac) !== 480 || Number(secondaryVoltageVac) !== 208 || Number(phases) !== 3 || Number(frequencyHz) !== 60) issues.push(issue('UNSUPPORTED_TRANSFORMER_CONFIGURATION', 'Only the sourced 480 V delta to 208Y/120 V, three-phase, 60 Hz profiles are supported.', 'transformerCriteria'));
  if (!finite(maxLoadingPercent) || Number(maxLoadingPercent) <= 0 || Number(maxLoadingPercent) > 100) issues.push(issue('INVALID_TRANSFORMER_LOADING_LIMIT', 'maxLoadingPercent must be greater than 0 and no more than 100.', 'maxLoadingPercent'));
  if (!finite(requiredPowerFactor) || Number(requiredPowerFactor) <= 0 || Number(requiredPowerFactor) > 1) issues.push(issue('INVALID_TRANSFORMER_POWER_FACTOR', 'requiredPowerFactor must be greater than 0 and no more than 1.', 'requiredPowerFactor'));
  if (minimumRatedKVA !== undefined && (!finite(minimumRatedKVA) || Number(minimumRatedKVA) <= 0)) issues.push(issue('INVALID_TRANSFORMER_MINIMUM_RATING', 'minimumRatedKVA must be a positive finite value.', 'minimumRatedKVA'));
  if (String(windingMaterial).toLowerCase() !== 'copper') issues.push(issue('UNSUPPORTED_TRANSFORMER_WINDING', 'Only the separately sourced 2020 copper winding profiles are supported.', 'windingMaterial'));
  if (issues.length) return { selected: null, candidates: [], issues, status: 'blocked', profileRevision: TRANSFORMER_PROFILE_REVISION };

  if (allowedProfileIds !== undefined && (!Array.isArray(allowedProfileIds) || allowedProfileIds.some(id => typeof id !== 'string' || id.trim() === ''))) issues.push(issue('INVALID_TRANSFORMER_PROFILE_POLICY', 'allowedProfileIds must be an array of non-empty profile ID strings.', 'allowedProfileIds'));
  if (Array.isArray(allowedProfileIds) && new Set(allowedProfileIds).size !== allowedProfileIds.length) issues.push(issue('DUPLICATE_TRANSFORMER_PROFILE_POLICY', 'allowedProfileIds must not contain duplicate IDs.', 'allowedProfileIds'));
  if (Array.isArray(allowedProfileIds)) {
    const known = new Set(profiles.map(profile => profile.profileId));
    for (const id of allowedProfileIds) if (!known.has(id)) issues.push(issue('UNKNOWN_TRANSFORMER_PROFILE', `Unknown transformer profile ${id}.`, 'allowedProfileIds'));
  }
  if (issues.length) return { selected: null, candidates: [], issues, status: 'blocked', profileRevision: TRANSFORMER_PROFILE_REVISION };
  const allowed = Array.isArray(allowedProfileIds) ? new Set(allowedProfileIds) : null;
  const candidates = profiles.map(profile => {
    const loadingPercent = Number(requiredKVA) / profile.ratedKVA * 100;
    const currentPu = loadingPercent / 100;
    const pf = Number(requiredPowerFactor);
    const qf = Math.sqrt(Math.max(0, 1 - pf ** 2));
    const approximateDropPu = currentPu * ((profile.seriesModel.rPercent * pf + profile.seriesModel.xPercent * qf) / 100);
    const approximateTransformerDropPct = 100 * approximateDropPu;
    const reasons = [];
    if (minimumRatedKVA !== undefined && profile.ratedKVA < Number(minimumRatedKVA)) reasons.push(`Profile rating ${profile.ratedKVA} kVA is below the bounded revision floor ${Number(minimumRatedKVA)} kVA.`);
    if (allowed && !allowed.has(profile.profileId)) reasons.push('Profile excluded by allowedProfileIds.');
    if (loadingPercent > Number(maxLoadingPercent)) reasons.push(`Loading ${loadingPercent.toFixed(2)}% exceeds the ${Number(maxLoadingPercent)}% criterion.`);
    return { profileId: profile.profileId, catalogNumber: profile.catalogNumber, ratedKVA: profile.ratedKVA, requiredKVA: Number(requiredKVA), loadingPercent, requiredPowerFactor: pf, approximateTransformerOnlyDropPu: approximateDropPu, approximateTransformerOnlyDropPct: approximateTransformerDropPct, eligible: reasons.length === 0, reasons };
  });
  const selectedCandidate = candidates.filter(item => item.eligible).sort((a, b) => a.ratedKVA - b.ratedKVA || a.profileId.localeCompare(b.profileId))[0];
  if (!selectedCandidate) {
    issues.push(issue('NO_ELIGIBLE_TRANSFORMER', 'No sourced transformer profile meets the requested rating, loading criterion, and profile policy.', 'criteria.transformer'));
    return { selected: null, candidates, issues, status: 'blocked', profileRevision: TRANSFORMER_PROFILE_REVISION };
  }
  const selected = structuredClone(profiles.find(profile => profile.profileId === selectedCandidate.profileId));
  selected.requiredKVA = Number(requiredKVA);
  selected.loadingPercent = selectedCandidate.loadingPercent;
  selected.maximumLoadingPercent = Number(maxLoadingPercent);
  selected.approximateTransformerOnlyDropPu = selectedCandidate.approximateTransformerOnlyDropPu;
  selected.approximateTransformerOnlyDropPct = selectedCandidate.approximateTransformerOnlyDropPct;
  selected.selectionStatus = 'screening-candidate';
  selected.selectionReason = `Smallest eligible sourced profile is ${selected.ratedKVA} kVA at ${selected.loadingPercent.toFixed(2)}% loading.`;
  selected.selectionInput = input;
  return { selected, candidates, issues, status: 'screening', profileRevision: TRANSFORMER_PROFILE_REVISION };
}

export function estimateTransformerSecondaryFault({ transformer, primaryAvailableFaultCurrentKA } = {}) {
  if (!transformer || !profiles.some(profile => profile.profileId === transformer.profileId) || !finite(transformer.phases) || Number(transformer.phases) !== 3 || !finite(primaryAvailableFaultCurrentKA) || Number(primaryAvailableFaultCurrentKA) <= 0 || !finite(transformer.primaryVoltageVac) || !finite(transformer.secondaryVoltageVac) || Number(transformer.primaryVoltageVac) !== 480 || Number(transformer.secondaryVoltageVac) !== 208) {
    return { availableFaultCurrentKA: null, status: 'blocked', issue: issue('MISSING_PRIMARY_FAULT_BASIS', 'A positive primary available fault current and selected transformer profile are required.', 'supply.availableFaultCurrentKA') };
  }
  const ratio = Number(transformer.primaryVoltageVac) / Number(transformer.secondaryVoltageVac);
  return {
    availableFaultCurrentKA: Number(primaryAvailableFaultCurrentKA) * ratio,
    status: 'screening-assumption',
    method: 'primary three-phase symmetrical current × primary-to-secondary nominal voltage ratio',
    faultTypes: ['three-phase symmetrical'],
    groundFaultStatus: 'not-evaluated',
    asymmetricalDutyStatus: 'not-evaluated',
    primaryAvailableFaultCurrentKA: Number(primaryAvailableFaultCurrentKA),
    voltageRatio: ratio,
    transformerProfileId: transformer.profileId,
    provenance: { ...transformer.faultModel, primaryFaultBasis: 'Three-phase primary bus available fault current supplied as an input.' }
  };
}

export default { listTransformerProfiles, selectTransformer, estimateTransformerSecondaryFault, TRANSFORMER_PROFILE_REVISION };

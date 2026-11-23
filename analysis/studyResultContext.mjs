/**
 * Normalize saved-study lifecycle metadata for report, scenario, and export
 * consumers.  Study calculators keep their raw result shapes; consumers use
 * this adapter to distinguish calculation validity from source freshness.
 */

import {
  assessStudyResult as assessLifecycleStudyResult,
  getStudyDependencies,
} from './studyLifecycle.mjs';

const VALIDITIES = new Set(['evaluated', 'unevaluated']);
const FRESHNESS = new Set(['current', 'stale', 'unknown']);

function text(value) {
  return value == null ? '' : String(value).trim();
}

function savedFingerprint(value) {
  const fingerprint = text(value);
  if (!fingerprint) return '';
  const separator = fingerprint.indexOf('|iec60909:');
  return separator >= 0 ? fingerprint.slice(0, separator) : fingerprint;
}

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '') ?? null;
}

function mergeMetadataValue(assessmentValue, rowValue, empty = {}) {
  if (rowValue == null || rowValue === ''
      || (Array.isArray(rowValue) && rowValue.length === 0)
      || (rowValue && typeof rowValue === 'object' && !Array.isArray(rowValue) && Object.keys(rowValue).length === 0)) {
    return assessmentValue ?? empty;
  }
  if (Array.isArray(assessmentValue) && Array.isArray(rowValue)) {
    return [...new Set([...assessmentValue, ...rowValue])];
  }
  if (assessmentValue && typeof assessmentValue === 'object'
      && !Array.isArray(assessmentValue) && rowValue && typeof rowValue === 'object'
      && !Array.isArray(rowValue)) {
    return { ...assessmentValue, ...rowValue };
  }
  return rowValue;
}

function mergeMetadataValues(values, empty = {}) {
  const present = values.filter(value => value !== undefined && value !== null && value !== ''
    && !(Array.isArray(value) && value.length === 0)
    && !(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0));
  if (!present.length) return empty;
  if (present.every(Array.isArray)) return [...new Set(present.flat().map(value => JSON.stringify(value)))].map(value => {
    try { return JSON.parse(value); } catch (_) { return value; }
  });
  if (present.every(value => value && typeof value === 'object' && !Array.isArray(value))) {
    return present.reduce((merged, value) => ({ ...merged, ...value }), {});
  }
  if (present.some(Array.isArray)) return present.flatMap(value => Array.isArray(value) ? value : [value]);
  return present.at(-1);
}

function resultContract(result = {}) {
  return result?.resultContract && typeof result.resultContract === 'object'
    ? result.resultContract
    : (result?.contract && typeof result.contract === 'object' ? result.contract : {});
}

function warningsFor(result = {}, provenance = {}) {
  const contract = resultContract(result);
  const values = [
    result?.warnings,
    contract.warnings,
    provenance?.warningsSnapshot,
    provenance?.warnings,
  ].filter(value => value !== undefined && value !== null && value !== '');
  return mergeMetadataValues(values, []);
}

function sourceFingerprintFor(result = {}, provenance = {}) {
  return firstValue(
    provenance?.sourceFingerprint,
    provenance?.inputFingerprint,
    provenance?.inputHash,
    result?.runMetadata?.sourceFingerprint,
    result?.sourceFingerprint,
    result?.inputFingerprint,
    resultContract(result).inputFingerprint,
  );
}

function calculationVersionFor(result = {}, provenance = {}) {
  return firstValue(
    provenance?.calculationVersion,
    provenance?.modelVersion,
    result?.calculationVersion,
    result?.modelVersion,
    result?.runMetadata?.calculationVersion,
    result?.runMetadata?.modelVersion,
    resultContract(result).calculationVersion,
    resultContract(result).modelVersion,
  );
}

function assumptionsFor(result = {}, provenance = {}) {
  return mergeMetadataValues([
    provenance?.assumptions,
    provenance?.assumptionsSnapshot,
    result?.assumptions,
    resultContract(result).assumptions,
  ], {});
}

function inputSourcesFor(result = {}, provenance = {}) {
  return firstValue(
    provenance?.inputSourcesSnapshot,
    provenance?.inputSources,
    result?.inputSources,
    resultContract(result).inputSources,
  ) || {};
}

function limitationsFor(result = {}, provenance = {}) {
  return firstValue(
    provenance?.limitationsSnapshot,
    provenance?.limitations,
    result?.limitations,
    resultContract(result).limitations,
  ) || [];
}

function unitsFor(result = {}, provenance = {}) {
  return firstValue(
    provenance?.unitsSnapshot,
    provenance?.units,
    result?.units,
    resultContract(result).units,
  ) || {};
}

function sourceFor(result = {}, provenance = {}) {
  return firstValue(
    provenance?.source,
    provenance?.sourceRecord,
    result?.source,
    result?.sourceRecord,
    resultContract(result).source,
  ) || null;
}

function evidenceClassFor(result = {}, provenance = {}) {
  return firstValue(
    provenance?.evidenceClass,
    result?.evidenceClass,
    resultContract(result).evidenceClass,
  ) || null;
}

function independentDerivationFor(result = {}, provenance = {}) {
  return firstValue(
    provenance?.independentDerivation,
    result?.independentDerivation,
    resultContract(result).independentDerivation,
  ) || null;
}

function studyOptionsFor(result = {}, provenance = {}) {
  return firstValue(
    provenance?.optionsSnapshot,
    provenance?.studyOptions,
    provenance?.options,
    result?.studyOptions,
    result?.options,
  ) || {};
}

function validityFor(result = {}, provenance = {}) {
  const contract = resultContract(result);
  const explicit = firstValue(
    provenance?.validity,
    result?.validity,
    contract.validity,
  );
  if (VALIDITIES.has(text(explicit))) return text(explicit);
  if (result?.runMetadata?.valid === true || provenance?.valid === true) return 'evaluated';
  return 'unevaluated';
}

function freshnessFor(result, provenance, options) {
  const explicit = text(firstValue(provenance?.freshness, result?.freshness));
  if (FRESHNESS.has(explicit)) return explicit;

  const saved = savedFingerprint(sourceFingerprintFor(result, provenance));
  const current = savedFingerprint(firstValue(
    options?.currentInputFingerprint,
    options?.currentSourceFingerprint,
    options?.currentFingerprint,
  ));
  if (!saved || !current) return 'unknown';
  return saved === current ? 'current' : 'stale';
}

function versionStatusFor(result, provenance, options) {
  const saved = text(calculationVersionFor(result, provenance));
  const current = text(firstValue(options?.calculationVersion, options?.currentCalculationVersion));
  if (!saved || !current) return 'unknown';
  return saved === current ? 'current' : 'stale';
}

function sourceStatusLabel(freshness, versionStatus, validity) {
  if (validity === 'partial') return 'Partially evaluated result';
  if (validity !== 'evaluated') return 'Unevaluated result';
  if (freshness === 'stale' || versionStatus === 'stale') return 'Stale saved result';
  if (freshness === 'unknown' || versionStatus === 'unknown') return 'Freshness unknown';
  return 'Current saved result';
}

/**
 * Assess a single stored study without changing its raw shape.
 *
 * `eligible` is intentionally separate from calculation outcome.  An
 * evaluated result may still be a failing engineering check; it is eligible
 * for reporting when its source and calculation version are current.
 */
function legacyAssessStudyResult(studyKey, result, provenance = {}, options = {}) {
  const present = result != null && !(Array.isArray(result) && result.length === 0);
  if (!present) {
    return {
      studyKey,
      present: false,
      validity: 'unevaluated',
      freshness: 'unknown',
      calculationVersionStatus: 'unknown',
      status: 'missing',
      label: 'No saved result',
      eligible: false,
      sourceFingerprint: null,
      calculationVersion: null,
      runAt: null,
      assumptions: assumptionsFor(result, provenance),
      warnings: warningsFor(result, provenance),
      modelLimits: firstValue(provenance?.modelLimits, provenance?.modelLimitsSnapshot) || {},
      inputSources: inputSourcesFor(result, provenance),
      source: sourceFor(result, provenance),
      inputSource: firstValue(provenance?.inputSource, result?.inputSource) || null,
      limitations: limitationsFor(result, provenance),
      units: unitsFor(result, provenance),
      evidenceClass: evidenceClassFor(result, provenance),
      independentDerivation: independentDerivationFor(result, provenance),
      studyOptions: studyOptionsFor(result, provenance),
      provenance: provenance || {},
    };
  }

  const contract = resultContract(result);
  const validity = validityFor(result, provenance);
  const freshness = freshnessFor(result, provenance, options);
  const calculationVersionStatus = versionStatusFor(result, provenance, options);
  const versionRequired = options.requireCalculationVersion === true;
  const eligible = validity === 'evaluated'
    && freshness === 'current'
    && (!versionRequired || calculationVersionStatus === 'current');
  const sourceFingerprint = sourceFingerprintFor(result, provenance);
  const calculationVersion = calculationVersionFor(result, provenance);

  return {
    studyKey,
    present: true,
    validity,
    freshness,
    calculationVersionStatus,
    status: eligible ? 'current' : (validity === 'evaluated' ? freshness : 'unevaluated'),
    label: sourceStatusLabel(freshness, calculationVersionStatus, validity),
    eligible,
    sourceFingerprint: sourceFingerprint || null,
    currentInputFingerprint: firstValue(options.currentInputFingerprint, options.currentSourceFingerprint) || null,
    calculationVersion: calculationVersion || null,
    currentCalculationVersion: firstValue(options.calculationVersion, options.currentCalculationVersion) || null,
    runAt: firstValue(
      provenance?.runAt,
      provenance?.capturedAt,
      result?.runMetadata?.runAt,
      result?.calculatedAt,
      result?.generatedAt,
      result?.updatedAt,
    ),
    assumptions: assumptionsFor(result, provenance),
    warnings: warningsFor(result, provenance),
    modelLimits: firstValue(result?.modelLimits, contract.modelLimits, provenance?.modelLimits) || {},
    inputSources: inputSourcesFor(result, provenance),
    source: sourceFor(result, provenance),
    inputSource: firstValue(provenance?.inputSource, result?.inputSource) || null,
    limitations: limitationsFor(result, provenance),
    units: unitsFor(result, provenance),
    evidenceClass: evidenceClassFor(result, provenance),
    independentDerivation: independentDerivationFor(result, provenance),
    studyOptions: studyOptionsFor(result, provenance),
    provenance: provenance || {},
    calculationStatus: firstValue(result?.calculationStatus, result?.status) || null,
    resultContract: contract,
  };
}

/**
 * Adapt the lifecycle API to report consumers.  The current context is
 * supplied explicitly by the caller; legacy fingerprint fields remain useful
 * for older records but cannot promote a v1 result to current status.
 */
export function assessStudyResult(studyKey, result, provenance = {}, options = {}) {
  const precomputed = options.precomputedAssessments?.[studyKey];
  const suppliedCurrentContext = options.currentStudyContexts?.[studyKey]
    || options.currentStudyContext
    || options.currentContext
    || null;
  if (precomputed && typeof precomputed === 'object') {
    const fallback = legacyAssessStudyResult(studyKey, result, provenance, options);
    const validity = precomputed.validity?.state || precomputed.validity || fallback.validity;
    const freshness = precomputed.freshness || fallback.freshness;
    const calculationVersionStatus = precomputed.calculationVersionStatus
      || (precomputed.eligible === true && freshness === 'current' ? 'current' : fallback.calculationVersionStatus);
    return {
      ...fallback,
      ...precomputed,
      studyKey,
      present: precomputed.present !== false,
      validity,
      freshness,
      eligible: precomputed.eligible === true,
      calculationVersionStatus,
      label: sourceStatusLabel(freshness, calculationVersionStatus, validity),
      currentInputFingerprint: options.currentInputFingerprint || precomputed.currentInputFingerprint || null,
      calculationVersion: precomputed.calculationVersion || provenance?.calculationRevision || provenance?.modelRevision || null,
      currentCalculationVersion: suppliedCurrentContext?.calculationRevision || suppliedCurrentContext?.modelRevision || null,
      assumptions: assumptionsFor(result, provenance),
      warnings: warningsFor(result, provenance),
      modelLimits: firstValue(result?.modelLimits, resultContract(result).modelLimits, provenance?.modelLimits) || {},
      inputSources: inputSourcesFor(result, provenance),
      source: sourceFor(result, provenance),
      inputSource: firstValue(provenance?.inputSource, result?.inputSource) || null,
      limitations: limitationsFor(result, provenance),
      units: unitsFor(result, provenance),
      evidenceClass: evidenceClassFor(result, provenance),
      independentDerivation: independentDerivationFor(result, provenance),
      studyOptions: studyOptionsFor(result, provenance),
    };
  }
  const currentContext = suppliedCurrentContext;
  const dependencyAssessments = Object.fromEntries(Object.entries(options.dependencyAssessments || {}).map(([key, assessment]) => [
    key,
    assessment?.validity && typeof assessment.validity === 'string'
      ? { ...assessment, validity: { state: assessment.validity } }
      : assessment,
  ]));
  const lifecycle = assessLifecycleStudyResult(
    studyKey,
    result,
    provenance && Object.keys(provenance).length ? provenance : null,
    currentContext,
    dependencyAssessments,
  );
  const fallback = legacyAssessStudyResult(studyKey, result, provenance, options);
  const validity = lifecycle.validity?.state || fallback.validity;
  const freshness = lifecycle.freshness || fallback.freshness;
  const versionStatus = provenance?.calculationRevision && currentContext?.calculationRevision
    ? (provenance.calculationRevision === currentContext.calculationRevision ? 'current' : 'stale')
    : (provenance?.modelRevision && currentContext?.modelRevision
      ? (provenance.modelRevision === currentContext.modelRevision ? 'current' : 'stale')
      : 'unknown');
  const eligible = lifecycle.present && lifecycle.eligible === true;
  return {
    ...fallback,
    ...lifecycle,
    validity,
    freshness,
    calculationVersionStatus: versionStatus,
    eligible,
    status: eligible ? 'current' : (validity === 'evaluated' ? freshness : 'unevaluated'),
    label: sourceStatusLabel(freshness, versionStatus, validity),
    currentInputFingerprint: options.currentInputFingerprint || currentContext?.inputFingerprint || null,
    currentCalculationVersion: currentContext?.calculationRevision || currentContext?.modelRevision || null,
    calculationVersion: provenance?.calculationRevision || provenance?.modelRevision || null,
    assumptions: assumptionsFor(result, provenance),
    warnings: warningsFor(result, provenance),
    modelLimits: firstValue(result?.modelLimits, resultContract(result).modelLimits, provenance?.modelLimits) || {},
    inputSources: inputSourcesFor(result, provenance),
    source: sourceFor(result, provenance),
    inputSource: firstValue(provenance?.inputSource, result?.inputSource) || null,
    limitations: limitationsFor(result, provenance),
    units: unitsFor(result, provenance),
    evidenceClass: evidenceClassFor(result, provenance),
    independentDerivation: independentDerivationFor(result, provenance),
    studyOptions: studyOptionsFor(result, provenance),
  };
}

/** Build an index for every stored study key, including unmapped sections. */
export function buildStudyContextIndex(studies = {}, studyProvenance = {}, options = {}) {
  const keys = [...new Set([
    ...Object.keys(studies || {}),
    ...Object.keys(studyProvenance || {}),
  ])].sort();
  const index = {};
  const assessments = {};
  const visiting = new Set();
  const visit = key => {
    if (assessments[key] || visiting.has(key)) return assessments[key] || null;
    visiting.add(key);
    const recorded = studyProvenance?.[key]?.dependencies;
    const recordedKeys = Array.isArray(recorded)
      ? recorded.map(entry => entry?.studyKey).filter(Boolean)
      : Object.keys(recorded || {});
    [...new Set([...getStudyDependencies(key), ...recordedKeys])].forEach(dependency => visit(dependency));
    index[key] = assessStudyResult(
      key,
      studies?.[key],
      studyProvenance?.[key] || {},
      { ...options, dependencyAssessments: assessments },
    );
    assessments[key] = index[key];
    visiting.delete(key);
    return index[key];
  };
  keys.forEach(visit);
  return Object.fromEntries(keys.map(key => [key, index[key]]));
}

/** Add lifecycle metadata to a report/export row while retaining raw fields. */
export function decorateStudyRow(row = {}, assessment = {}) {
  const assessmentValidity = assessment.validity?.state || assessment.validity || 'unevaluated';
  const rowValidityValue = row.resultValidity || row.validity || assessmentValidity;
  const rowValidity = rowValidityValue && typeof rowValidityValue === 'object'
    ? rowValidityValue.state || 'unevaluated'
    : rowValidityValue;
  const rowFreshness = (row.freshness && (row.inputFingerprint || row.currentInputFingerprint))
    ? row.freshness
    : (assessment.freshness || 'unknown');
  const rowEligible = rowValidity === 'evaluated'
    && rowFreshness === 'current'
    && assessment.eligible === true;
  const rowWarnings = Array.isArray(row.warnings) ? row.warnings : [];
  const assessmentWarnings = Array.isArray(assessment.warnings) ? assessment.warnings : [];
  const warnings = [...new Set([...assessmentWarnings, ...rowWarnings])];
  return {
    ...row,
    studyKey: assessment.studyKey || null,
    resultValidity: rowValidity,
    freshness: rowFreshness,
    resultEligibility: rowEligible ? 'eligible' : 'withheld',
    resultStatus: assessment.label || 'Freshness unknown',
    calculationVersion: assessment.calculationVersion,
    calculationVersionStatus: assessment.calculationVersionStatus || 'unknown',
    sourceFingerprint: assessment.sourceFingerprint,
    currentInputFingerprint: assessment.currentInputFingerprint,
    currentCalculationVersion: assessment.currentCalculationVersion,
    calculatedAt: assessment.runAt,
    inputSources: mergeMetadataValue(assessment.inputSources, row.inputSources || row.resultInputSources),
    source: mergeMetadataValue(assessment.source, row.source),
    inputSource: firstValue(row.inputSource, assessment.inputSource),
    assumptions: mergeMetadataValue(assessment.assumptions, row.assumptions || row.resultAssumptions),
    modelLimits: mergeMetadataValue(assessment.modelLimits, row.modelLimits || row.resultModelLimits),
    limitations: mergeMetadataValue(assessment.limitations, row.limitations),
    units: mergeMetadataValue(assessment.units, row.units || row.resultUnits),
    evidenceClass: firstValue(row.evidenceClass, assessment.evidenceClass),
    independentDerivation: mergeMetadataValue(assessment.independentDerivation, row.independentDerivation),
    warnings,
    studyOptions: mergeMetadataValue(assessment.studyOptions, row.studyOptions),
    provenance: mergeMetadataValue(assessment.provenance, row.provenance),
  };
}

export function decorateStudyRows(rows = [], assessment = {}, options = {}) {
  const preserve = new Set([
    'id', 'label', 'bus', 'branch', 'targetBus', 'unit', 'studyKey', 'method', 'studySource',
    'inputSource', 'path', 'from', 'to', 'resultUnits', 'resultInputSources',
    'validity', 'calculationStatus', 'status', 'resultValidity', 'freshness', 'resultEligibility', 'resultStatus',
    'calculationVersion', 'calculationVersionStatus', 'sourceFingerprint',
    'currentInputFingerprint', 'currentCalculationVersion', 'calculatedAt',
    'inputSources', 'source', 'inputSource', 'assumptions', 'modelLimits', 'limitations', 'units',
    'evidenceClass', 'independentDerivation', 'warnings', 'studyOptions', 'provenance',
    'inputFingerprint',
    'historicalValues', 'historicalValuesLabel',
    ...(Array.isArray(options.preserve) ? options.preserve : []),
  ]);
  const shouldWithhold = options.withholdIneligible !== false
    && assessment.present
    && !assessment.eligible;
  return (Array.isArray(rows) ? rows : []).map(row => {
    const decorated = decorateStudyRow(row, assessment);
    if (!shouldWithhold && decorated.resultEligibility === 'eligible') return decorated;
    if (!assessment.present && decorated.resultEligibility !== 'withheld') return decorated;
    const historicalValues = row.historicalValues && typeof row.historicalValues === 'object'
      ? { ...row.historicalValues }
      : {};
    Object.entries(row || {}).forEach(([key, value]) => {
      if (!preserve.has(key) && historicalValues[key] === undefined) historicalValues[key] = value;
    });
    const withheld = Object.fromEntries(Object.keys(historicalValues).map(key => [key, '—']));
    return {
      ...decorated,
      ...withheld,
      historicalValues,
      historicalValuesLabel: 'Withheld saved values (result is not current/evaluated)',
    };
  });
}

export function studyMetadataColumns() {
  return [
    'studyKey', 'resultValidity', 'freshness', 'resultEligibility', 'resultStatus',
    'calculationVersion', 'calculationVersionStatus', 'sourceFingerprint',
    'currentInputFingerprint', 'currentCalculationVersion', 'calculatedAt',
    'inputSources', 'source', 'inputSource', 'assumptions', 'modelLimits', 'limitations', 'units',
    'evidenceClass', 'independentDerivation', 'warnings', 'studyOptions', 'provenance',
    'historicalValues', 'historicalValuesLabel',
  ];
}

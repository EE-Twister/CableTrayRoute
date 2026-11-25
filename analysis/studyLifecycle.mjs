// @ts-check
/**
 * Study result lifecycle metadata.
 *
 * Study payloads are intentionally kept separate from this module's metadata.
 * A result can therefore retain its established map or array shape while the
 * store records when, from which inputs, and with which model it was produced.
 */

export const STUDY_LIFECYCLE_SCHEMA_VERSION = 2;
export const STUDY_LIFECYCLE_MODEL_REVISION = 'study-model-v1';

const DERIVED_ONE_LINE_KEYS = new Set([
  'voltage_mag',
  'voltage_angle',
  'voltage_v',
  'loading_percent',
  'loading_kw',
  'loading_kW',
  'loading_amps',
  'loading_A',
  'shortCircuit',
  'arcFlash',
]);

const STUDY_KEYS = [
  'loadFlow', 'shortCircuit', 'reliability', 'arcFlash', 'contingency',
  'harmonics', 'harmonicNetwork', 'motorStart', 'transformerTapOptimization',
  'batterySizing', 'bessHazard', 'busDuctSizing', 'capacitorBank',
  'cathodicProtection', 'conduitBendSchedule', 'cyberCompliance',
  'dcShortCircuit', 'derInterconnect', 'differentialProtection',
  'dissimilarMetals', 'frequencyScan', 'generatorSizing',
  'hazAreaClassification', 'heatTraceSizing', 'heatTraceSizingCircuits',
  'ibr', 'iec60287', 'iec60909', 'insulationCoordination', 'lighting',
  'lightningProtection', 'optimalPowerFlow', 'probabilisticLoadFlow',
  'quasiDynamic', 'sagTension', 'substationLayout', 'sustainabilityFootprint',
  'tcc', 'transientStability', 'voltageDropStudy', 'voltageFlicker',
  'cableThermalDetailed',
  'voltageStability', 'groundGrid', 'cableThermalEnvironment', 'duty',
  'demandSchedule', 'windLoad',
];

const DEPENDENCIES = {
  voltageDropStudy: ['loadFlow'],
  motorStart: ['loadFlow'],
  generatorSizing: ['motorStart'],
  batterySizing: ['motorStart'],
  bessHazard: ['batterySizing'],
  busDuctSizing: ['shortCircuit'],
  frequencyScan: ['shortCircuit'],
  voltageFlicker: ['shortCircuit'],
  transientStability: ['shortCircuit'],
  arcFlash: ['shortCircuit'],
  contingency: ['loadFlow'],
  reliability: ['loadFlow'],
  duty: ['shortCircuit'],
};

const STUDY_SETTINGS = {
  loadFlow: ['studySettings'],
  shortCircuit: ['studySettings', 'tccSettings', 'trayHardwareCatalogCustomProducts'],
  arcFlash: ['studySettings', 'tccSettings', 'trayHardwareCatalogCustomProducts'],
  reliability: ['studySettings'],
  harmonics: ['studySettings'],
  harmonicNetwork: ['studySettings'],
  motorStart: ['studySettings'],
  transformerTapOptimization: ['studySettings'],
  tcc: ['tccSettings', 'trayHardwareCatalogCustomProducts'],
  duty: ['tccSettings', 'trayHardwareCatalogCustomProducts'],
  iec60909: ['trayHardwareCatalogCustomProducts'],
};

/**
 * Data-only registry. Producers can add a more specific calculation revision
 * when a solver changes; absent metadata remains unknown for legacy results.
 */
export const STUDY_LIFECYCLE_REGISTRY = Object.freeze(Object.fromEntries(
  STUDY_KEYS.map(studyKey => [studyKey, Object.freeze({
    studyKey,
    dependencies: Object.freeze([...(DEPENDENCIES[studyKey] || [])]),
    calculationRevision: studyKey === 'loadFlow' ? 'load-flow-calculation-v4' : studyKey === 'transformerTapOptimization' ? 'transformer-tap-calculation-v3' : ['contingency', 'probabilisticLoadFlow', 'quasiDynamic'].includes(studyKey) ? `${studyKey}-calculation-v4` : studyKey === 'iec60287' ? 'iec60287-calculation-v2' : studyKey === 'cableThermalEnvironment' ? 'cable-thermal-environment-calculation-v2' : studyKey === 'cableThermalDetailed' ? 'cable-thermal-detailed-calculation-v1' : 'calculation-v1',
    modelRevision: studyKey === 'iec60287' ? 'iec60287-model-v2' : studyKey === 'cableThermalEnvironment' ? 'cable-thermal-environment-model-v2' : studyKey === 'cableThermalDetailed' ? 'cable-thermal-detailed-model-v1' : STUDY_LIFECYCLE_MODEL_REVISION,
    settings: Object.freeze([...(STUDY_SETTINGS[studyKey] || [])]),
  })])
));

const isObject = value => value !== null && typeof value === 'object';

function stableValue(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { __number: 'NaN' };
    if (value === Infinity) return { __number: 'Infinity' };
    if (value === -Infinity) return { __number: '-Infinity' };
    return value;
  }
  if (typeof value === 'bigint') return { __bigint: String(value) };
  if (typeof value === 'undefined') return { __undefined: true };
  if (typeof value === 'function' || typeof value === 'symbol') return { __type: typeof value };
  if (seen.has(value)) return { __circular: true };
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map(entry => stableValue(entry, seen));
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key], seen);
      return result;
    }, {});
  } finally {
    seen.delete(value);
  }
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function fingerprintStudyValue(value) {
  return fnv1a(JSON.stringify(stableValue(value)));
}

export function normalizeStudySourceSnapshot(value) {
  if (Array.isArray(value)) return value.map(normalizeStudySourceSnapshot);
  if (!isObject(value)) return value;
  return Object.keys(value).reduce((result, key) => {
    if (key === 'oneLine' && isObject(value[key])) {
      result[key] = normalizeOneLineSnapshot(value[key]);
    } else {
      result[key] = normalizeStudySourceSnapshot(value[key]);
    }
    return result;
  }, {});
}

function normalizeOneLineSnapshot(value) {
  if (!isObject(value)) return value;
  const copy = normalizeStudySourceSnapshot(value);
  stripDerivedOneLineFields(copy);
  return copy;
}

function stripDerivedOneLineFields(value) {
  if (Array.isArray(value)) {
    value.forEach(stripDerivedOneLineFields);
    return;
  }
  if (!isObject(value)) return;
  DERIVED_ONE_LINE_KEYS.forEach(key => delete value[key]);
  Object.values(value).forEach(stripDerivedOneLineFields);
}

export function getStudyDefinition(studyKey) {
  return STUDY_LIFECYCLE_REGISTRY[studyKey] || {
    studyKey,
    dependencies: [],
    calculationRevision: null,
    modelRevision: null,
    settings: [],
  };
}

function normalizeDependencies(dependencies = {}) {
  if (Array.isArray(dependencies)) {
    return dependencies.map(entry => ({
      studyKey: entry?.studyKey,
      resultHash: entry?.resultHash || null,
      provenanceHash: entry?.provenanceHash || null,
      status: entry?.status || null,
    })).filter(entry => entry.studyKey);
  }
  return Object.keys(dependencies || {}).sort().map(studyKey => ({
    studyKey,
    resultHash: dependencies[studyKey]?.resultHash || null,
    provenanceHash: dependencies[studyKey]?.provenanceHash || null,
    status: dependencies[studyKey]?.status || null,
  }));
}

export function captureStudyRunContext(studyKey, options = {}) {
  const definition = getStudyDefinition(studyKey);
  const projectSnapshot = options.projectSnapshot === undefined
    ? null
    : normalizeStudySourceSnapshot(options.projectSnapshot);
  const inputs = options.inputs === undefined ? null : options.inputs;
  const studyOptions = options.options === undefined ? null : options.options;
  const dependencies = normalizeDependencies(options.dependencies);
  const projectIdentity = options.projectIdentity || null;
  const scenario = options.scenario || null;
  const modelRevision = options.modelRevision === undefined
    ? definition.modelRevision
    : options.modelRevision;
  const calculationRevision = options.calculationRevision === undefined
    ? definition.calculationRevision
    : options.calculationRevision;
  return deepFreeze({
    schemaVersion: STUDY_LIFECYCLE_SCHEMA_VERSION,
    studyKey,
    capturedAt: options.capturedAt || new Date().toISOString(),
    scenario,
    projectIdentity,
    projectSnapshotHash: projectSnapshot === null ? null : fingerprintStudyValue(projectSnapshot),
    inputFingerprint: inputs === null ? null : fingerprintStudyValue(inputs),
    optionsFingerprint: studyOptions === null ? null : fingerprintStudyValue(studyOptions),
    manualInputFingerprint: inputs === null && studyOptions === null
      ? null
      : fingerprintStudyValue({ inputs, options: studyOptions }),
    inputsSnapshot: inputs === null ? null : cloneJsonValue(inputs),
    optionsSnapshot: studyOptions === null ? null : cloneJsonValue(studyOptions),
    inputSourcesSnapshot: options.inputSources === undefined ? null : cloneJsonValue(options.inputSources),
    settingsSnapshot: options.settings === undefined ? null : cloneJsonValue(options.settings),
    settingsFingerprint: options.settings === undefined ? null : fingerprintStudyValue(options.settings),
    dependencyFingerprint: fingerprintStudyValue(dependencies),
    dependencies,
    calculationRevision,
    modelRevision,
    assumptions: cloneJsonValue(options.assumptions === undefined ? [] : options.assumptions),
    warnings: cloneJsonValue(options.warnings === undefined ? [] : options.warnings),
    limitations: cloneJsonValue(options.limitations === undefined ? [] : options.limitations),
    units: cloneJsonValue(options.units === undefined ? {} : options.units),
  });
}

function unwrapStudyResult(result) {
  if (isObject(result) && Object.prototype.hasOwnProperty.call(result, '_result')) return result._result;
  return result;
}

function hasResultEvidence(result) {
  result = unwrapStudyResult(result);
  if (result === null || result === undefined || result === '') return false;
  if (typeof result === 'number') return Number.isFinite(result);
  if (typeof result === 'boolean') return true;
  if (Array.isArray(result)) return result.length > 0;
  if (!isObject(result)) return false;
  return Object.keys(result).some(key => !key.startsWith('_'));
}

function cloneJsonValue(value) {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value, (_key, child) => (
    typeof child === 'number' && !Number.isFinite(child) ? { __number: String(child) } : child
  )));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!isObject(value) || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach(child => deepFreeze(child, seen));
  return Object.freeze(value);
}

function resultSignals(result) {
  result = unwrapStudyResult(result);
  const signals = [];
  let nestedUnevaluated = 0;
  let nestedPartial = 0;
  let evaluatedNodes = 0;
  const visit = (value, root = false) => {
    if (Array.isArray(value)) {
      value.forEach(child => visit(child));
      return;
    }
    if (!isObject(value)) return;
    const calculationStatus = typeof value.calculationStatus === 'string'
      ? value.calculationStatus.toLowerCase()
      : '';
    const validity = typeof value.validity === 'string' ? value.validity.toLowerCase() : '';
    if (root && value.valid === false && (Array.isArray(value.errors) ? value.errors.length > 0 : true)) {
      signals.push('unevaluated');
    }
    if (['unsupported', 'unevaluated', 'invalid', 'missing-inputs'].includes(calculationStatus) || validity === 'unevaluated') {
      if (root) signals.push('unevaluated');
      else nestedUnevaluated += 1;
    } else if (calculationStatus === 'incomplete' || validity === 'partial') {
      if (root) signals.push('partial');
      else nestedPartial += 1;
    }
    if (value.converged === false) {
      if (root) signals.push('unevaluated');
      else nestedUnevaluated += 1;
    }
    // A completed screening or manufacturer calculation may retain a
    // requiredInputs list for final design follow-up.  That list is not an
    // invalidity signal when the result explicitly reports a completed
    // calculation status; only an absent/unevaluated/invalid status with
    // required inputs means that this node did not produce a usable result.
    if (Array.isArray(value.requiredInputs) && value.requiredInputs.length
        && (!calculationStatus || ['unsupported', 'incomplete', 'unevaluated', 'invalid', 'missing-inputs'].includes(calculationStatus))) {
      if (root) signals.push('unevaluated');
      else nestedUnevaluated += 1;
    }
    const directEvidenceKeys = new Set([
      'status', 'validity', 'calculationStatus', 'stepSafe', 'touchSafe', 'fit',
      'converged', 'value', 'currentKA', 'gridResistanceOhm', 'Vm', 'voltage', 'valid',
    ]);
    if (!calculationStatus && !validity
        && [...directEvidenceKeys].some(key => Object.prototype.hasOwnProperty.call(value, key))) {
      evaluatedNodes += 1;
    } else if (calculationStatus === 'complete' || calculationStatus === 'evaluated') {
      evaluatedNodes += 1;
    }
    Object.values(value).forEach(child => {
      if (isObject(child) || Array.isArray(child)) visit(child);
    });
  };
  visit(result, true);
  if (!signals.includes('unevaluated') && nestedUnevaluated && (evaluatedNodes || nestedPartial)) signals.push('partial');
  else if (!signals.includes('unevaluated') && nestedUnevaluated) signals.push('unevaluated');
  if (nestedPartial && !signals.includes('unevaluated')) {
    signals.push(evaluatedNodes ? 'partial' : 'unevaluated');
  }
  return signals;
}

function collectEvaluation(result) {
  result = unwrapStudyResult(result);
  const states = [];
  const visit = value => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isObject(value)) return;
    const status = typeof value.status === 'string' ? value.status.toLowerCase() : '';
    const calculationStatus = typeof value.calculationStatus === 'string'
      ? value.calculationStatus.toLowerCase()
      : '';
    if (['unsupported', 'incomplete', 'unevaluated', 'invalid', 'missing-inputs'].includes(calculationStatus)) {
      states.push('unknown');
    }
    if (['pass', 'passed', 'ok', 'compliant', 'fit', 'safe', 'applied'].includes(status)) states.push('pass');
    if (['fail', 'failed', 'non-compliant', 'unsafe', 'not-fit', 'screening-alert'].includes(status)) states.push('fail');
    ['stepSafe', 'touchSafe', 'fit'].forEach(key => {
      if (typeof value[key] === 'boolean') states.push(value[key] ? 'pass' : 'fail');
    });
    Object.values(value).forEach(child => {
      if (isObject(child) || Array.isArray(child)) visit(child);
    });
  };
  visit(result);
  const distinct = [...new Set(states)];
  if (distinct.includes('unknown') && distinct.some(state => state === 'pass' || state === 'fail')) return 'mixed';
  if (distinct.includes('pass') && distinct.includes('fail')) return 'mixed';
  if (distinct.includes('fail')) return 'fail';
  if (distinct.includes('pass')) return 'pass';
  return 'unknown';
}

export function assessStudyValidity(result, provenance = null) {
  result = unwrapStudyResult(result);
  if (!hasResultEvidence(result)) return 'unevaluated';
  const signals = resultSignals(result);
  if (signals.includes('unevaluated')) return 'unevaluated';
  if (signals.includes('partial')) return 'partial';
  if (Array.isArray(result) && result.length > 1) {
    const rowEvidence = result.map(hasResultEvidence);
    if (rowEvidence.some(Boolean) && rowEvidence.some(value => !value)) return 'partial';
  }
  return provenance?.validity?.state === 'unknown' ? 'unknown' : 'evaluated';
}

function mergeMetadata(contextValue, resultValue) {
  if (contextValue === undefined || contextValue === null
      || (Array.isArray(contextValue) && contextValue.length === 0)
      || (isObject(contextValue) && !Array.isArray(contextValue) && Object.keys(contextValue).length === 0)) {
    return resultValue === undefined ? [] : resultValue;
  }
  if (Array.isArray(contextValue) && Array.isArray(resultValue)) return [...resultValue, ...contextValue];
  if (isObject(contextValue) && isObject(resultValue) && !Array.isArray(contextValue) && !Array.isArray(resultValue)) {
    return { ...resultValue, ...contextValue };
  }
  return contextValue;
}

export function buildStudyProvenance(studyKey, result, context, options = {}) {
  const runContext = context || captureStudyRunContext(studyKey);
  const detectedValidity = assessStudyValidity(result);
  const validity = detectedValidity === 'evaluated' && options.validity
    ? options.validity
    : detectedValidity;
  return {
    schemaVersion: STUDY_LIFECYCLE_SCHEMA_VERSION,
    studyKey,
    capturedAt: runContext.capturedAt,
    scenario: runContext.scenario || null,
    projectIdentity: runContext.projectIdentity || null,
    resultHash: fingerprintStudyValue(result),
    projectSnapshotHash: runContext.projectSnapshotHash || null,
    inputFingerprint: runContext.inputFingerprint || null,
    optionsFingerprint: runContext.optionsFingerprint || null,
    manualInputFingerprint: runContext.manualInputFingerprint || null,
    settingsFingerprint: runContext.settingsFingerprint || null,
    dependencyFingerprint: runContext.dependencyFingerprint || null,
    dependencies: runContext.dependencies || [],
    calculationRevision: runContext.calculationRevision || null,
    modelRevision: runContext.modelRevision || null,
    inputsSnapshot: runContext.inputsSnapshot || null,
    optionsSnapshot: runContext.optionsSnapshot || null,
    inputSourcesSnapshot: runContext.inputSourcesSnapshot || null,
    settingsSnapshot: runContext.settingsSnapshot || null,
    assumptions: cloneJsonValue(mergeMetadata(runContext.assumptions, result?.assumptions)),
    warnings: cloneJsonValue(mergeMetadata(runContext.warnings, result?.warnings)),
    limitations: cloneJsonValue(mergeMetadata(runContext.limitations, result?.modelLimits || result?.limitations)),
    modelLimits: cloneJsonValue(result?.modelLimits || null),
    units: cloneJsonValue(runContext.units && Object.keys(runContext.units).length ? runContext.units : result?.units || {}),
    validity: { state: validity },
    evaluation: { state: collectEvaluation(result) },
  };
}

function unknownReason(provenance) {
  if (!provenance) return 'missing_provenance';
  if (provenance.schemaVersion !== STUDY_LIFECYCLE_SCHEMA_VERSION) return 'legacy_provenance';
  if (!provenance.resultHash || !provenance.projectSnapshotHash
      || !provenance.calculationRevision || !provenance.modelRevision
      || !provenance.capturedAt || !provenance.dependencyFingerprint
      || !provenance.scenario || !provenance.projectIdentity) return 'incomplete_provenance';
  return null;
}

export function assessStudyResult(studyKey, result, provenance = null, currentContext = null, dependencyAssessments = {}) {
  const validity = assessStudyValidity(result, provenance);
  const evaluation = provenance?.evaluation?.state || collectEvaluation(result);
  let freshness = 'unknown';
  const reasons = [];
  let dependenciesEvaluated = true;
  const reason = unknownReason(provenance);
  if (reason) {
    reasons.push(reason);
  } else if (provenance.studyKey !== studyKey) {
    reasons.push('study_key_mismatch');
  } else if (!currentContext?.projectSnapshotHash || !currentContext.modelRevision) {
    reasons.push('current_context_unavailable');
  } else {
    const fields = [
      ['projectSnapshotHash', 'project_inputs_changed'],
      ['inputFingerprint', 'manual_inputs_changed'],
      ['optionsFingerprint', 'study_options_changed'],
      ['manualInputFingerprint', 'manual_inputs_changed'],
      ['settingsFingerprint', 'study_settings_changed'],
      ['dependencyFingerprint', 'dependencies_changed'],
      ['calculationRevision', 'calculation_revision_changed'],
      ['modelRevision', 'model_revision_changed'],
    ];
    const missingCurrent = fields.filter(([field]) => provenance[field] && !currentContext[field]);
    const mismatches = fields.filter(([field]) => provenance[field] && currentContext[field] && provenance[field] !== currentContext[field]);
    const savedIdentity = provenance.projectIdentity;
    const currentIdentity = currentContext.projectIdentity;
    const identityMissing = !currentIdentity
      || (savedIdentity.projectId && !currentIdentity.projectId)
      || (!savedIdentity.projectId && savedIdentity.projectName && !currentIdentity.projectName);
    const identityMismatch = currentIdentity && (
      (savedIdentity.projectId && currentIdentity.projectId && savedIdentity.projectId !== currentIdentity.projectId)
      || (!savedIdentity.projectId && !currentIdentity.projectId
        && savedIdentity.projectName !== currentIdentity.projectName)
    );
    if (identityMissing) {
      reasons.push('current_project_identity_unavailable');
    } else if (provenance.scenario !== currentContext.scenario) {
      freshness = 'stale';
      reasons.push('scenario_changed');
    } else if (identityMismatch) {
      freshness = 'stale';
      reasons.push('project_changed');
    } else if (missingCurrent.length) {
      missingCurrent.forEach(([field]) => reasons.push(`current_${field}_unavailable`));
    } else if (provenance.resultHash && provenance.resultHash !== fingerprintStudyValue(result)) {
      freshness = 'stale';
      reasons.push('result_changed');
    } else if (mismatches.length) {
      freshness = 'stale';
      mismatches.forEach(([, message]) => reasons.push(message));
    } else {
      const dependencies = provenance.dependencies || [];
      const dependencyStates = dependencies.map(entry => dependencyAssessments[entry.studyKey]?.freshness || 'unknown');
      if (dependencyStates.includes('stale')) {
        freshness = 'stale';
        reasons.push('dependency_stale');
      } else if (dependencyStates.includes('unknown')) {
        reasons.push('dependency_freshness_unknown');
      } else {
        freshness = 'current';
        if (dependencies.some(entry => dependencyAssessments[entry.studyKey]?.validity?.state !== 'evaluated')) {
          dependenciesEvaluated = false;
          reasons.push('dependency_unevaluated');
        }
        if (dependencies.some(entry => dependencyAssessments[entry.studyKey]?.eligible === false)) {
          dependenciesEvaluated = false;
          reasons.push('dependency_ineligible');
        }
      }
    }
  }
  const eligible = freshness === 'current' && validity === 'evaluated' && dependenciesEvaluated;
  return {
    studyKey,
    present: hasResultEvidence(result),
    validity: { state: validity },
    freshness,
    evaluation: { state: evaluation },
    eligible,
    reasons: [...new Set(reasons)],
    provenance,
  };
}

export function getStudyDependencies(studyKey) {
  return [...getStudyDefinition(studyKey).dependencies];
}

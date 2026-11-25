// @ts-check
/**
 * Common lifecycle fields for standalone study exports.  Exporters keep the
 * calculator's native result rows, while these fields make validity, source,
 * options, and the calculation run auditable after the file leaves the app.
 */
function jsonText(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch (_) { return String(value); }
}

function hasValue(value) {
  if (value == null || value === '') return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function firstValue(...values) {
  return values.find((value) => hasValue(value)) ?? '';
}

function mergeMetadata(...values) {
  const present = values.filter(hasValue);
  if (!present.length) return '';
  if (present.every(Array.isArray)) return [...new Set(present.flat().map(value => jsonText(value)))].map(value => {
    try { return JSON.parse(value); } catch (_) { return value; }
  });
  if (present.every(value => value && typeof value === 'object' && !Array.isArray(value))) {
    return present.reduce((merged, value) => ({ ...merged, ...value }), {});
  }
  return present.at(-1);
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function studyExportMetadata(result = {}, options = {}) {
  const assessment = options.assessment || {};
  const provenance = assessment.provenance || {};
  const validity = firstValue(assessment.validity?.state, assessment.validity,
    result.validity?.state, result.validity,
    result.runMetadata?.valid === true ? 'evaluated' : 'unevaluated');
  const savedFingerprint = firstValue(assessment.sourceFingerprint, result.inputFingerprint, result.runMetadata?.sourceFingerprint,
    provenance.inputFingerprint, provenance.projectSnapshotHash);
  const currentFingerprint = firstValue(options.currentInputFingerprint, assessment.currentInputFingerprint, result.currentInputFingerprint);
  const freshness = firstValue(assessment.freshness, result.freshness, (savedFingerprint && currentFingerprint
    ? (savedFingerprint === currentFingerprint ? 'current' : 'stale')
    : 'unknown'));
  const fallbackEligibility = validity === 'evaluated' && freshness === 'current' ? 'eligible' : 'withheld';
  const resultEligibility = typeof assessment.eligible === 'boolean'
    ? (assessment.eligible ? 'eligible' : 'withheld')
    : firstValue(result.resultEligibility, fallbackEligibility);
  const resultStatus = typeof assessment.eligible === 'boolean' && !assessment.eligible
    ? firstValue(assessment.label, 'Saved result withheld')
    : firstValue(result.resultStatus, assessment.label,
      validity === 'evaluated' && freshness === 'current' ? 'Current saved result' : 'Saved result withheld');
  return {
    resultValidity: validity,
    freshness,
    resultEligibility,
    resultStatus,
    sourceFingerprint: savedFingerprint,
    currentInputFingerprint: currentFingerprint,
    calculationVersion: firstValue(assessment.calculationVersion, result.calculationVersion, result.modelVersion,
      result.runMetadata?.calculationVersion, result.runMetadata?.modelVersion,
      provenance.calculationRevision, provenance.modelRevision),
    calculatedAt: firstValue(assessment.runAt, result.calculatedAt, result.generatedAt, result.updatedAt,
      result.runMetadata?.runAt, provenance.capturedAt),
    inputSources: jsonText(firstValue(assessment.inputSources, result.inputSources, result.resultInputSources,
      provenance.inputSources, provenance.inputSourcesSnapshot)),
    assumptions: jsonText(mergeMetadata(provenance.assumptions, provenance.assumptionsSnapshot,
      assessment.assumptions, result.assumptions, result.resultAssumptions)),
    modelLimits: jsonText(firstValue(assessment.modelLimits, result.modelLimits, result.resultModelLimits,
      provenance.modelLimits, provenance.modelLimitsSnapshot)),
    limitations: jsonText(firstValue(assessment.limitations, result.limitations, provenance.limitations,
      provenance.limitationsSnapshot)),
    units: jsonText(firstValue(assessment.units, result.units, result.resultUnits,
      provenance.units, provenance.unitsSnapshot)),
    warnings: jsonText(mergeMetadata(provenance.warnings, provenance.warningsSnapshot,
      assessment.warnings, result.warnings, result.resultWarnings)),
    studyOptions: jsonText(firstValue(assessment.studyOptions, result.studyOptions, result.options,
      provenance.optionsSnapshot)),
    provenance: jsonText(assessment.provenance || result.provenance),
  };
}

export function studyLifecycleMetadataLines(result = {}, options = {}) {
  const metadata = studyExportMetadata(result, options);
  return Object.entries(metadata).map(([key, value]) => `# ${key},${csvCell(value)}`);
}

export function studyLifecycleMetadataRows(result = {}, options = {}) {
  return Object.entries(studyExportMetadata(result, options)).map(([key, value]) => [key, value]);
}

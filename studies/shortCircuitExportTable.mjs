// Pure table builder for the Short Circuit PDF export. Each bus keeps its own
// validity, calculation status, required inputs, and warnings; study-level
// lifecycle metadata goes in separately named columns so it never overwrites
// a bus result (an incomplete bus must not print as evaluated, and an
// evaluated bus must not inherit the study's "unevaluated" state).

const KA_FIELDS = new Set([
  'threePhaseKA', 'lineToGroundKA', 'lineToLineKA', 'doubleLineGroundKA', 'ip', 'Ib', 'Ith',
]);

function finiteNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function listText(value) {
  if (Array.isArray(value)) return value.filter(item => item !== null && item !== undefined && item !== '').join('; ');
  return value === null || value === undefined ? '' : String(value);
}

export function shortCircuitInputQuality(result = {}) {
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const required = Array.isArray(result.requiredInputs) ? result.requiredInputs : [];
  return required.length ? `${required.length} required input(s)` : warnings.length ? `${warnings.length} assumption(s)` : 'Complete';
}

/**
 * @param {Array<[string, object]>} entries bus id -> result pairs
 * @param {object} lifecycle studyExportMetadata() output for the saved study
 * @returns {{ title: string, headers: string[], rows: object[] }}
 */
export function buildShortCircuitExportTable(entries = [], lifecycle = {}) {
  const isIEC = entries.some(([, result]) => result?.method === 'IEC');
  const resultHeaders = isIEC
    ? ['bus', 'prefaultKV', 'threePhaseKA', 'lineToGroundKA', 'lineToLineKA', 'ip', 'Ib', 'Ith', 'kappa']
    : ['bus', 'threePhaseKA', 'lineToGroundKA', 'lineToLineKA', 'doubleLineGroundKA'];
  const headers = [
    ...resultHeaders,
    'inputQuality', 'validity', 'calculationStatus', 'requiredInputs', 'warnings',
    'studyValidity', 'freshness', 'eligibility', 'calculationVersion', 'calculatedAt', 'assumptions', 'studyWarnings', 'provenance',
  ];
  const rows = entries.map(([bus, result = {}]) => {
    const row = { bus: result.equipmentTag || bus };
    resultHeaders.slice(1).forEach(field => {
      const value = result[field];
      // The page shows an unevaluated current as "Unevaluated", not a blank cell.
      row[field] = KA_FIELDS.has(field)
        ? (finiteNullableNumber(value) ?? 'Unevaluated')
        : (value ?? '');
    });
    return {
      ...row,
      inputQuality: shortCircuitInputQuality(result),
      validity: result.validity ?? '',
      calculationStatus: result.calculationStatus ?? '',
      requiredInputs: listText(result.requiredInputs),
      warnings: listText(result.warnings),
      studyValidity: lifecycle.resultValidity ?? '',
      freshness: lifecycle.freshness ?? '',
      eligibility: lifecycle.resultEligibility ?? '',
      calculationVersion: lifecycle.calculationVersion ?? '',
      calculatedAt: lifecycle.calculatedAt ?? '',
      assumptions: lifecycle.assumptions ?? '',
      studyWarnings: listText(lifecycle.warnings),
      provenance: lifecycle.provenance ?? '',
    };
  });
  return {
    title: isIEC ? 'IEC 60909 Short-Circuit Report' : 'Short Circuit Report',
    headers,
    rows,
  };
}

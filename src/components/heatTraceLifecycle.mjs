import {
  assessStudyResult,
  buildStudyProvenance,
} from '../../analysis/studyLifecycle.mjs';

export function buildHeatTraceCaseProvenance(caseItem, context) {
  return buildStudyProvenance('heatTraceSizing', caseItem?.result || null, context);
}

export function assessHeatTraceCase(caseItem, currentContext) {
  const provenance = caseItem?._provenance;
  if (!provenance) {
    return {
      studyKey: 'heatTraceSizing',
      present: Boolean(caseItem?.result),
      validity: { state: 'unknown' },
      freshness: 'unknown',
      eligible: false,
      reasons: ['missing_case_provenance'],
      provenance: null,
    };
  }
  return assessStudyResult(
    'heatTraceSizing',
    caseItem?.result || null,
    provenance,
    currentContext,
  );
}

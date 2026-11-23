import { fingerprintStudyValue, getStudyDefinition } from '../../analysis/studyLifecycle.mjs';

export function isCurrentTransformerTapReview(review, assessment, currentOneLineRevision) {
  return Boolean(review && assessment?.eligible === true
    && assessment.provenance?.calculationRevision === getStudyDefinition('transformerTapOptimization').calculationRevision
    && assessment.provenance?.resultHash
    && assessment.provenance.resultHash === fingerprintStudyValue(review)
    && review.sourceOneLineRevision === currentOneLineRevision);
}

export function createTransformerTapReviewStaleNotice(document) {
  const notice = document.createElement('p');
  notice.className = 'tap-review-warning';
  notice.textContent = 'This review is missing current calculation evidence or uses a previous solver version. Rerun Transformer Tap Review before applying a recommendation.';
  return notice;
}

export function formatTapReviewNumber(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function formatTapReviewPu(value) {
  return Number.isFinite(Number(value)) ? `${formatTapReviewNumber(value, 4)} pu` : '—';
}

export function formatTapReviewPercent(value) {
  return Number.isFinite(Number(value)) ? `${formatTapReviewNumber(value, 3)}%` : '—';
}

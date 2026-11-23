import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentTransformerTapReview } from '../src/one-line/transformerTapReviewGuard.mjs';
import { assessStudyResult, buildStudyProvenance, captureStudyRunContext } from '../analysis/studyLifecycle.mjs';

const studyKey = 'transformerTapOptimization';
const review = { sourceOneLineRevision: 'drawing-7', status: 'review', transformers: [{ transformerId: 'T', recommendedTapRatio: 1.025 }] };
const options = { projectSnapshot: { oneLine: { sheets: [] } }, projectIdentity: { projectId: 'P' }, scenario: 'base', inputs: {}, options: {} };

function assessmentFor(result, calculationRevision) {
  const captured = captureStudyRunContext(studyKey, { ...options, ...(calculationRevision ? { calculationRevision } : {}) });
  return assessStudyResult(studyKey, result, buildStudyProvenance(studyKey, result, captured), captureStudyRunContext(studyKey, options));
}

test('only the exact current tap recommendation can be applied', () => {
  const assessment = assessmentFor(review);
  assert.equal(assessment.eligible, true);
  assert.equal(isCurrentTransformerTapReview(structuredClone(review), assessment, 'drawing-7'), true);
  assert.equal(isCurrentTransformerTapReview(review, null, 'drawing-7'), false);
  assert.equal(isCurrentTransformerTapReview(review, { eligible: true }, 'drawing-7'), false);
  assert.equal(isCurrentTransformerTapReview(review, assessment, 'drawing-8'), false);
  assert.equal(isCurrentTransformerTapReview(null, assessment, 'drawing-7'), false);
  const changed = structuredClone(review);
  changed.transformers[0].recommendedTapRatio = 0.975;
  assert.equal(isCurrentTransformerTapReview(changed, assessment, 'drawing-7'), false);
  // A fresh assessment for a different stored review cannot authorize the
  // recommendation still displayed in an earlier confirmation dialog.
  assert.equal(isCurrentTransformerTapReview(review, assessmentFor(changed), 'drawing-7'), false);
});

test('a previous calculation cannot authorize a tap even when the drawing is unchanged', () => {
  const oldAssessment = assessmentFor(review, 'calculation-v1');
  assert.equal(oldAssessment.freshness, 'stale');
  assert.equal(isCurrentTransformerTapReview(review, oldAssessment, 'drawing-7'), false);
});

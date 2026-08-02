import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRouteExplanationPoints,
  buildRouteIssueAdvice,
  getRejectedReasonCounts,
  isRoutedResult,
  summarizeRouteReview
} from '../src/routing/routeReviewModel.mjs';

describe('route review model', () => {
  it('summarizes routed results and utilization overloads', () => {
    const results = [
      { status: 'routed', total_length: 120, field_length: 20 },
      { status: 'not routed', total_length: 'N/A' }
    ];
    const summary = summarizeRouteReview(results, [{ utilization: 110 }, { utilization: 80 }], row => row.utilization > 100);
    assert.deepEqual(summary, {
      routedCount: 1,
      failedCount: 1,
      primaryLength: 120,
      primaryContainedPercent: 83.33333333333334,
      containedLength: 100,
      overloadCount: 1
    });
    assert.equal(isRoutedResult(results[0]), true);
    assert.equal(isRoutedResult(results[1]), false);
  });

  it('groups rejected and mismatched raceway reasons', () => {
    assert.deepEqual(getRejectedReasonCounts([{
      exclusions: [{ reason: 'capacity' }, { reason: 'capacity' }],
      mismatched_records: [{ reason: 'group mismatch' }, {}]
    }]), {
      capacity: 2,
      'group mismatch': 1,
      'mismatched raceway': 1
    });
  });

  it('builds actionable failure advice from cable readiness and screening reasons', () => {
    const result = {
      cable: 'C-1',
      status: 'failed',
      total_length: 'N/A',
      exclusions: [{ reason: 'capacity exceeded' }],
      mismatched_records: [{ reason: 'group mismatch' }]
    };
    const advice = buildRouteIssueAdvice(result, {
      cables: [{ name: 'C-1', racewayIds: ['TR-404'] }],
      readiness: { diagnostics: { invalidAssignedRefs: [{ cable: 'C-1', raceway: 'TR-404' }] } }
    });
    assert.ok(advice.some(item => item.includes('XYZ coordinates')));
    assert.ok(advice.some(item => item.includes('TR-404')));
    assert.ok(advice.some(item => item.includes('tray fill')));
    assert.ok(advice.some(item => item.includes('cable group')));
  });

  it('builds plain-text explanation points for safe rendering', () => {
    const points = buildRouteExplanationPoints({
      status: 'routed',
      mode: '<Automatic>',
      tray_segments_count: 2,
      field_length: 10,
      exclusions: []
    }, { formatDistance: value => `${value} ft` });
    assert.equal(points[0], '<Automatic> route selected using 2 tray/conduit segments.');
    assert.equal(points[1], '10 ft of field routing was used for endpoint jumps or network gaps.');
  });
});

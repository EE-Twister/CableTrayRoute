import assert from 'node:assert/strict';
import {
  routeScreeningCandidates,
  summarizeRouteScreening
} from '../analysis/routeScreeningSummary.mjs';

{
  const result = {
    exclusions: [
      { tray_id: 'T-01', reason: 'over_capacity', message: 'Rejected T-01: 46% fill > Max 40%' },
      { tray_id: 'T-02', reason: 'group_mismatch' },
      { tray_id: 'T-03', reason: 'start_beyond_proximity' }
    ],
    mismatched_records: [
      { tray_id: 'T-01', reason: 'over_capacity' },
      { tray_id: 'T-02', reason: 'group_mismatch' }
    ]
  };
  const candidates = routeScreeningCandidates(result);
  assert.equal(candidates.length, 3, 'duplicate mismatch records should not inflate the count');
  assert.deepEqual(candidates.map(item => item.id), ['T-01', 'T-02', 'T-03']);

  const summary = summarizeRouteScreening(result);
  assert.equal(summary.total, 3);
  assert.equal(summary.groups.length, 3);
  assert.equal(summary.groups.find(group => group.code === 'over_capacity').label, 'Capacity limit');
  assert.match(
    summary.groups.find(group => group.code === 'group_mismatch').description,
    /voltage or circuit class/i
  );
}

{
  const summary = summarizeRouteScreening({
    exclusions: [
      { id: 'UNKNOWN-1', reason: 'not_found' },
      { tray_id: 'T-04', reason: 'custom_rule' }
    ]
  });
  assert.equal(summary.total, 2);
  assert.equal(summary.groups.find(group => group.code === 'not_found').label, 'Raceway not found');
  assert.equal(summary.groups.find(group => group.code === 'custom_rule').label, 'Custom Rule');
}

console.log('route screening summary verified');

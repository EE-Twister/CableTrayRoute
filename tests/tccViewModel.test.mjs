import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeLegendLayout,
  formatViewValue,
  getActiveViewConfigs,
  normalizeCalloutScope,
  normalizeRangePreset,
  normalizeViewOptionList,
  summarizeActiveViewLabels
} from '../analysis/tcc/viewModel.mjs';

describe('TCC view model', () => {
  it('normalizes view, range, and callout selections', () => {
    assert.deepEqual(normalizeViewOptionList(['pickup', 'pickup', 'bad', 'callouts']), ['pickup', 'callouts']);
    assert.equal(normalizeRangePreset('motorStart'), 'motorStart');
    assert.equal(normalizeRangePreset('bad'), 'full');
    assert.equal(normalizeCalloutScope('selected'), 'selected');
    assert.equal(normalizeCalloutScope('bad'), 'context');
  });

  it('formats configured values and active-view summaries', () => {
    const [pickup] = getActiveViewConfigs(['pickup']);
    assert.equal(formatViewValue(pickup, 125.25, value => value.toFixed(1)), '125.3 A');
    assert.equal(formatViewValue(pickup, null), null);
    assert.equal(summarizeActiveViewLabels(['callouts', 'pickup', 'time']), 'Callouts, Pickup, +1');
  });

  it('wraps legend entries without losing their summary data', () => {
    const entries = [
      { name: 'Main Breaker', relationship: { role: 'selected', label: 'Selected' } },
      { name: 'Feeder Breaker', relationship: { role: 'downstream', label: 'Downstream' } }
    ];
    const result = computeLegendLayout(entries, 150, entry => [`Pickup: ${entry.name.length} A`]);
    assert.equal(result.layouts.length, 2);
    assert.equal(result.layouts[0].x, 0);
    assert.ok(result.layouts[1].y > result.layouts[0].y);
    assert.deepEqual(result.layouts[1].viewSummaries, ['Pickup: 14 A']);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRouteDetailMarkup } from '../src/routing/routeDetailView.mjs';

describe('route detail view', () => {
  it('builds segment controls lazily and escapes imported values', () => {
    const html = buildRouteDetailMarkup({
      breakdown: [{ segment: 1, type: 'tray', tray_id: '<TR-1>', from: 'A', to: 'B', length: '10', raceway: '' }],
      mismatched_records: [],
    }, { total: 0 }, {
      explanation: () => '<p>Explanation</p>',
      screening: () => '<p>Screening</p>',
    });
    assert.match(html, /Explanation/);
    assert.match(html, /tray-fill-btn/);
    assert.match(html, /&lt;TR-1&gt;/);
    assert.doesNotMatch(html, /<TR-1>/);
  });
});

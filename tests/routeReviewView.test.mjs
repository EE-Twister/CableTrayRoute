import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { escapeHtml, isSafeUrl } from '../src/htmlSafety.mjs';
import {
  buildRouteExplanationMarkup,
  buildRouteScreeningReviewMarkup,
  renderRouteSummaryPanel
} from '../src/routing/routeReviewView.mjs';

describe('route review view', () => {
  it('accepts only relative and HTTP(S) links', () => {
    assert.equal(isSafeUrl('#raceway'), true);
    assert.equal(isSafeUrl('https://example.com/review'), true);
    assert.equal(isSafeUrl('javascript:alert(1)'), false);
    assert.equal(isSafeUrl('data:text/html,bad'), false);
  });

  it('escapes explanation text before producing markup', () => {
    const markup = buildRouteExplanationMarkup(['<script>alert(1)</script>'], escapeHtml);
    assert.ok(markup.includes('&lt;script&gt;'));
    assert.ok(!markup.includes('<script>'));
  });

  it('renders screening groups and blocks unsafe links', () => {
    const markup = buildRouteScreeningReviewMarkup({
      total: 1,
      groups: [{ code: 'capacity', count: 1, label: 'Capacity', description: 'Too full' }],
      candidates: [{ id: 'TR-1', reason: 'capacity', filter: 'javascript:alert(1)' }]
    }, {
      escapeHtml,
      escapeAttr: escapeHtml,
      isSafeUrl: url => url.startsWith('#')
    });
    assert.ok(markup.includes('Why 1 candidate was not used'));
    assert.ok(markup.includes('TR-1'));
    assert.ok(!markup.includes('javascript:'));
  });

  it('renders route KPIs and binds the overload interaction', () => {
    let clickHandler = null;
    const button = { addEventListener: (_event, handler) => { clickHandler = handler; } };
    const panel = {
      innerHTML: '',
      querySelector: selector => selector === '#route-overload-kpi' ? button : null
    };
    let opened = false;
    renderRouteSummaryPanel(panel, {
      routedCount: 2,
      failedCount: 1,
      primaryLength: 125,
      primaryContainedPercent: 80,
      containedLength: 200,
      overloadCount: 1
    }, {
      formatDistance: value => `${value} ft`,
      onOverload: () => { opened = true; }
    });

    assert.ok(panel.innerHTML.includes('2 routed · 1 need review'));
    assert.ok(panel.innerHTML.includes('80% contained'));
    assert.equal(typeof clickHandler, 'function');
    clickHandler();
    assert.equal(opened, true);
  });
});

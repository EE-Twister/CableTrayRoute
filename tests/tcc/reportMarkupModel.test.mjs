import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildPrintMarkup,
  buildReviewExportMarkup,
  escapeHtml
} from '../../analysis/tcc/reportMarkupModel.mjs';

console.log('TCC report markup model');

{
  assert.equal(escapeHtml(`<tag a="1">'&`), '&lt;tag a=&quot;1&quot;&gt;&#39;&amp;');
  assert.equal(escapeHtml(null), '');
  console.log('  ✓ preserves HTML escaping for report-supplied text');
}

{
  const html = buildPrintMarkup('<svg id="chart"></svg>', '<TCC>', 'Footer & review', {
    previewMarkup: '<svg id="preview"></svg>'
  });
  assert.match(html, /^<!DOCTYPE html>/);
  assert.ok(html.includes('&lt;TCC&gt;'));
  assert.ok(html.includes('Footer &amp; review'));
  assert.ok(html.includes('<svg id="chart"></svg>'));
  assert.ok(html.includes('<svg id="preview"></svg>'));
  assert.ok(html.includes('window.print()'));
  console.log('  ✓ preserves printable chart, preview, escaped headings, and print lifecycle');
}

{
  const html = buildReviewExportMarkup({
    chartMarkup: '<svg>chart</svg>',
    previewMarkup: '<svg>preview</svg>',
    metricsMarkup: '<article>metrics</article>',
    coordinationMarkup: '<p>coordination</p>',
    statusText: '<Review required>',
    rangeLabel: 'Motor & Start'
  });
  assert.match(html, /^<!DOCTYPE html>/);
  assert.ok(html.includes('<svg>chart</svg>'));
  assert.ok(html.includes('<svg>preview</svg>'));
  assert.ok(html.includes('<article>metrics</article>'));
  assert.ok(html.includes('<p>coordination</p>'));
  assert.ok(html.includes('&lt;Review required&gt;'));
  assert.ok(html.includes('Motor &amp; Start'));
  console.log('  ✓ preserves review-package sections while escaping status and range metadata');
}

{
  const source = await readFile(new URL('../../analysis/tcc/reportMarkupModel.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:document|HTMLElement|HTMLCanvasElement|d3)\b/);
  console.log('  ✓ remains independent of DOM and chart APIs');
}

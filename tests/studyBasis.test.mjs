/**
 * Unit tests for src/components/studyBasis.js
 * Uses a minimal DOM stub so we can run in Node without a browser.
 */
import assert from 'assert';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err.message || err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Minimal DOM stub
// ---------------------------------------------------------------------------

function makeContainer(id) {
  let innerHTML = '';
  const el = {
    id,
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = v; },
  };
  return el;
}

// Patch document.getElementById for the test
const containers = {};
global.document = {
  getElementById(id) { return containers[id] ?? null; },
};

// ---------------------------------------------------------------------------
// Dynamic import of the module under test
// ---------------------------------------------------------------------------

const { initStudyBasisPanel } = await import(
  `file://${path.resolve(__dirname, '../src/components/studyBasis.js')}`
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('initStudyBasisPanel — basic rendering', () => {
  it('does nothing when container does not exist', () => {
    // Should not throw when container is absent
    initStudyBasisPanel('missing', { standard: 'IEEE 1584' });
    // No assertion needed — passing means no exception thrown
  });

  it('renders a details element in the container', () => {
    containers['study-basis-panel'] = makeContainer('study-basis-panel');
    initStudyBasisPanel('arcFlash', { standard: 'IEEE 1584-2018' });
    assert.ok(
      containers['study-basis-panel'].innerHTML.includes('<details'),
      'Expected <details> element in rendered HTML'
    );
  });

  it('renders the standard name in the summary', () => {
    containers['study-basis-panel'] = makeContainer('study-basis-panel');
    initStudyBasisPanel('arcFlash', { standard: 'IEC 60909-0:2016' });
    assert.ok(
      containers['study-basis-panel'].innerHTML.includes('IEC 60909-0:2016'),
      'Standard name should appear in rendered HTML'
    );
  });

  it('renders the clause when provided', () => {
    containers['study-basis-panel'] = makeContainer('study-basis-panel');
    initStudyBasisPanel('test', { standard: 'IEEE 80-2013', clause: '§16 — Mesh voltage' });
    const html = containers['study-basis-panel'].innerHTML;
    assert.ok(html.includes('§16'), 'Clause should appear in rendered HTML');
    assert.ok(html.includes('Mesh voltage'), 'Clause text should appear in rendered HTML');
  });

  it('renders formulas list when provided', () => {
    containers['study-basis-panel'] = makeContainer('study-basis-panel');
    initStudyBasisPanel('test', {
      standard: 'IEEE 80',
      formulas: ['Em = ρ If Km / Lm', 'Rg ≈ ρ/Lt'],
    });
    const html = containers['study-basis-panel'].innerHTML;
    assert.ok(html.includes('Em = ρ If Km / Lm'), 'First formula should appear');
    assert.ok(html.includes('Rg'), 'Second formula should appear');
    assert.ok(html.includes('<code>'), 'Formulas should be wrapped in <code>');
  });

  it('renders assumptions list when provided', () => {
    containers['study-basis-panel'] = makeContainer('study-basis-panel');
    initStudyBasisPanel('test', {
      standard: 'IEC 60287',
      assumptions: ['100% load factor', 'Uniform soil resistivity'],
    });
    const html = containers['study-basis-panel'].innerHTML;
    assert.ok(html.includes('100% load factor'), 'First assumption should appear');
    assert.ok(html.includes('Uniform soil resistivity'), 'Second assumption should appear');
  });

  it('renders limitations list when provided', () => {
    containers['study-basis-panel'] = makeContainer('study-basis-panel');
    initStudyBasisPanel('test', {
      standard: 'IEEE 1584',
      limitations: ['AC systems only', '208 V – 15 kV range'],
    });
    const html = containers['study-basis-panel'].innerHTML;
    assert.ok(html.includes('AC systems only'), 'First limitation should appear');
    assert.ok(html.includes('study-basis__list--warn'), 'Limitations should use warn class');
  });

  it('renders benchmark link when benchmarkId provided', () => {
    containers['study-basis-panel'] = makeContainer('study-basis-panel');
    initStudyBasisPanel('test', {
      standard: 'IEC 60287',
      benchmarkId: 'iec60287-cable-rating',
    });
    const html = containers['study-basis-panel'].innerHTML;
    assert.ok(
      html.includes('validation.html#iec60287-cable-rating'),
      'Benchmark link should point to validation.html with anchor'
    );
  });

  it('omits benchmark link when benchmarkId not provided', () => {
    containers['study-basis-panel'] = makeContainer('study-basis-panel');
    initStudyBasisPanel('test', { standard: 'IEEE 80' });
    const html = containers['study-basis-panel'].innerHTML;
    assert.ok(!html.includes('validation.html#'), 'No benchmark link when benchmarkId omitted');
  });

  it('does not render formulas/assumptions/limitations sections when arrays empty', () => {
    containers['study-basis-panel'] = makeContainer('study-basis-panel');
    initStudyBasisPanel('test', {
      standard: 'IEEE X',
      formulas: [],
      assumptions: [],
      limitations: [],
    });
    const html = containers['study-basis-panel'].innerHTML;
    assert.ok(!html.includes('Key Formulas'), 'No formulas section when array empty');
    assert.ok(!html.includes('Assumptions'), 'No assumptions section when array empty');
    assert.ok(!html.includes('Known Limitations'), 'No limitations section when array empty');
  });

  it('uses custom containerId when provided', () => {
    containers['custom-basis-container'] = makeContainer('custom-basis-container');
    initStudyBasisPanel('test', { standard: 'IEC X' }, 'custom-basis-container');
    assert.ok(
      containers['custom-basis-container'].innerHTML.includes('<details'),
      'Renders into custom container'
    );
    // Default container should be untouched if it existed
  });

  it('escapes HTML special characters in standard and clause', () => {
    containers['study-basis-panel'] = makeContainer('study-basis-panel');
    initStudyBasisPanel('test', {
      standard: '<script>alert(1)</script>',
      clause: '"dangerous"',
    });
    const html = containers['study-basis-panel'].innerHTML;
    assert.ok(!html.includes('<script>'), 'XSS in standard must be escaped');
    assert.ok(html.includes('&lt;script&gt;'), 'Standard must be HTML-escaped');
    assert.ok(!html.includes('"dangerous"'), 'Unescaped quote should not appear');
  });

  it('escapes HTML special characters in formulas', () => {
    containers['study-basis-panel'] = makeContainer('study-basis-panel');
    initStudyBasisPanel('test', {
      standard: 'IEEE X',
      formulas: ['E < Elimit && V > 0'],
    });
    const html = containers['study-basis-panel'].innerHTML;
    assert.ok(!html.includes(' < ') || html.includes('&lt;'), 'Formula < should be escaped');
  });
});

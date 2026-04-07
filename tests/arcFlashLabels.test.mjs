/**
 * Unit tests for arc flash label generation (Gap #49).
 *
 * Tests cover:
 *   - buildArcFlashLabelData  (reports/arcFlashReport.mjs)
 *   - buildLabelSheetHtml     (reports/arcFlashReport.mjs)
 *   - generateArcFlashLabel   (reports/labels.mjs)
 *
 * Run with: node tests/arcFlashLabels.test.mjs
 */

import assert from 'assert';
import { buildArcFlashLabelData, buildLabelSheetHtml } from '../reports/arcFlashReport.mjs';
import { generateArcFlashLabel } from '../reports/labels.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.log('  \u2717', name); console.error(err); process.exitCode = 1; }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const warningInfo = {
  incidentEnergy: 8.5,
  ppeCategory: 2,
  boundary: 1524,
  workingDistance: 455,
  nominalVoltage: 480,
  limitedApproach: 1200,
  restrictedApproach: 300,
  upstreamDevice: 'CB-1A',
  equipmentTag: 'MCC-1',
  studyDate: '2026-04-07'
};

const dangerInfo = {
  incidentEnergy: 52.3,
  ppeCategory: 4,
  boundary: 4500,
  workingDistance: 610,
  nominalVoltage: 13800,
  limitedApproach: 3000,
  restrictedApproach: 600,
  upstreamDevice: 'GEN-BRKR',
  equipmentTag: 'SWGR-HV',
  studyDate: '2026-04-07'
};

// ── buildArcFlashLabelData ────────────────────────────────────────────────────

describe('buildArcFlashLabelData', () => {
  it('signal word is WARNING when incidentEnergy < 40 cal/cm²', () => {
    const data = buildArcFlashLabelData('bus1', warningInfo);
    assert.strictEqual(data.signalWord, 'WARNING');
  });

  it('signal word is DANGER when incidentEnergy >= 40 cal/cm²', () => {
    const data = buildArcFlashLabelData('bus2', dangerInfo);
    assert.strictEqual(data.signalWord, 'DANGER');
  });

  it('signal color is orange (#f57c00) for WARNING', () => {
    const data = buildArcFlashLabelData('bus1', warningInfo);
    assert.strictEqual(data.signalColor, '#f57c00');
  });

  it('signal color is red (#d32f2f) for DANGER', () => {
    const data = buildArcFlashLabelData('bus2', dangerInfo);
    assert.strictEqual(data.signalColor, '#d32f2f');
  });

  it('formats voltage in V for <1000 V systems', () => {
    const data = buildArcFlashLabelData('bus1', warningInfo);
    assert.ok(data.voltage.includes('480'), `Expected "480" in "${data.voltage}"`);
    assert.ok(data.voltage.includes('V'), `Expected "V" unit in "${data.voltage}"`);
  });

  it('formats voltage in kV for >=1000 V systems', () => {
    const data = buildArcFlashLabelData('bus2', dangerInfo);
    assert.ok(data.voltage.includes('kV'), `Expected "kV" in "${data.voltage}"`);
  });

  it('equipment tag falls back to component id when not provided', () => {
    const data = buildArcFlashLabelData('BUS-99', {});
    assert.strictEqual(data.equipmentTag, 'BUS-99');
  });

  it('upstream device falls back to "Not Specified" when absent', () => {
    const data = buildArcFlashLabelData('bus1', { incidentEnergy: 5 });
    assert.strictEqual(data.upstreamDevice, 'Not Specified');
  });

  it('ppeCategory is formatted as a string number', () => {
    const data = buildArcFlashLabelData('bus1', warningInfo);
    assert.strictEqual(data.ppeCategory, '2');
  });
});

// ── buildLabelSheetHtml ───────────────────────────────────────────────────────

describe('buildLabelSheetHtml', () => {
  it('returns an HTML document string', () => {
    const html = buildLabelSheetHtml({ bus1: warningInfo, bus2: dangerInfo });
    assert.ok(typeof html === 'string');
    assert.ok(html.includes('<html') || html.includes('<!DOCTYPE html'));
  });

  it('contains a label cell for each result entry', () => {
    const html = buildLabelSheetHtml({ bus1: warningInfo, bus2: dangerInfo });
    const cellCount = (html.match(/<div class="label-cell">/g) || []).length;
    assert.strictEqual(cellCount, 2, `Expected 2 label cells, got ${cellCount}`);
  });

  it('includes window.print() for the print button', () => {
    const html = buildLabelSheetHtml({ bus1: warningInfo });
    assert.ok(html.includes('window.print()'), 'Expected window.print() in HTML');
  });

  it('empty results produces zero label cells', () => {
    const html = buildLabelSheetHtml({});
    const cellCount = (html.match(/<div class="label-cell">/g) || []).length;
    assert.strictEqual(cellCount, 0, 'Expected no label cells for empty results');
  });

  it('includes the project name in the heading when provided', () => {
    const html = buildLabelSheetHtml({ bus1: warningInfo }, 'Test Plant');
    assert.ok(html.includes('Test Plant'), 'Expected project name in HTML heading');
  });

  it('includes print CSS with @media print rule', () => {
    const html = buildLabelSheetHtml({ bus1: warningInfo });
    assert.ok(html.includes('@media print'), 'Expected @media print in style');
  });
});

// ── generateArcFlashLabel ─────────────────────────────────────────────────────

describe('generateArcFlashLabel', () => {
  it('substitutes all {{key}} placeholders', () => {
    const data = buildArcFlashLabelData('bus1', warningInfo);
    const svg = generateArcFlashLabel(data);
    assert.ok(typeof svg === 'string');
    assert.ok(svg.includes(data.equipmentTag), 'Expected equipment tag in SVG');
    assert.ok(svg.includes(data.signalWord), 'Expected signal word in SVG');
  });

  it('leaves no unreplaced {{...}} template tokens', () => {
    const data = buildArcFlashLabelData('bus1', warningInfo);
    const svg = generateArcFlashLabel(data);
    const unresolved = svg.match(/\{\{[^}]+\}\}/g);
    assert.ok(!unresolved, `Unresolved tokens found: ${JSON.stringify(unresolved)}`);
  });
});

console.log('\nDone.');

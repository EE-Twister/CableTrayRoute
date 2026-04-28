import assert from 'node:assert/strict';
import {
  buildGroundingFieldFidelityPackage,
  buildSeasonalSoilScenarios,
  evaluateFallOfPotentialTests,
  evaluateSoilMeasurementCoverage,
  normalizeFallOfPotentialRows,
  normalizeGroundingFidelityControls,
  normalizeGroundingFieldData,
  renderGroundingFieldFidelityHTML,
} from '../analysis/groundingFieldFidelity.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

const geometry = {
  bounds: { width: 40, height: 20 },
  areaM2: 800,
};

const riskPoints = [
  { id: 'touch-1', label: 'Touch <point>', check: 'touch', ratio: 0.7, status: 'pass' },
  { id: 'step-1', label: 'Step point', check: 'step', ratio: 0.92, status: 'warn' },
];

describe('grounding field fidelity helpers', () => {
  it('normalizes field data and rejects invalid numeric rows', () => {
    const data = normalizeGroundingFieldData({
      soilMeasurements: [{ spacingM: 1, apparentResistivityOhmM: 100 }],
      fallOfPotentialRows: [{ testId: 'FOP-1', probeSpacingM: 60, measuredResistanceOhm: 0.42, curveDeviationPct: 3 }],
      personnelProtection: { gloveClass: 'Class <0>', en50522Review: true },
    });
    assert.equal(data.soilMeasurements.length, 1);
    assert.equal(data.fallOfPotentialRows.length, 1);
    assert.equal(data.personnelProtection.bodyWeightKg, 70);
    assert.throws(() => normalizeGroundingFieldData({ soilMeasurements: [{ spacingM: 0, apparentResistivityOhmM: 100 }] }), /invalid spacing/);
    assert.equal(normalizeFallOfPotentialRows([{ probeSpacingM: -1, measuredResistanceOhm: 0.4, curveDeviationPct: 2 }])[0].valid, false);
  });

  it('checks soil measurement spacing coverage against grounding geometry', () => {
    const coverage = evaluateSoilMeasurementCoverage({
      geometry,
      measurements: [
        { spacingM: 1, apparentResistivityOhmM: 85 },
        { spacingM: 4, apparentResistivityOhmM: 110 },
        { spacingM: 12, apparentResistivityOhmM: 150 },
        { spacingM: 24, apparentResistivityOhmM: 190 },
      ],
    });
    assert.equal(coverage.status, 'pass');
    assert(coverage.spacingCoveragePct >= 100);
    const sparse = evaluateSoilMeasurementCoverage({ geometry, measurements: [{ spacingM: 2, apparentResistivityOhmM: 100 }] });
    assert.equal(sparse.status, 'warn');
  });

  it('classifies fall-of-potential curve stability deterministically', () => {
    const rows = evaluateFallOfPotentialTests([
      { testId: 'Stable <test>', probeSpacingM: 80, measuredResistanceOhm: 0.4, curveDeviationPct: 3 },
      { testId: 'Review', probeSpacingM: 80, measuredResistanceOhm: 0.41, curveDeviationPct: 7 },
      { testId: 'Invalid', probeSpacingM: 80, measuredResistanceOhm: 0.44, curveDeviationPct: 16 },
    ]);
    assert.equal(rows[0].status, 'pass');
    assert.equal(rows[1].status, 'warn');
    assert.equal(rows[2].status, 'fail');
  });

  it('builds seasonal scenarios that adjust risk point status', () => {
    const scenarios = buildSeasonalSoilScenarios({
      soilModel: { rho1: 100 },
      seasonalInputs: { enabled: true, dryMultiplier: 1.5, wetMultiplier: 0.7 },
      riskPoints,
    });
    assert.equal(scenarios.length, 3);
    assert(scenarios.some(row => row.id === 'dry' && (row.status === 'fail' || row.status === 'warn')));
    assert.equal(riskPoints[0].status, 'pass');
  });

  it('normalizes personnel/fidelity controls as JSON-safe screening metadata', () => {
    const controls = normalizeGroundingFidelityControls({
      boundaryExtensionM: 25,
      contourDensity: 40,
      inspectionPointSpacingM: 2,
      meshResolutionLabel: 'Fine <screening>',
      transferredPotentialPaths: [{ label: 'Fence <bond>', distanceM: 50, notes: 'Review <isolation>' }],
    });
    assert.equal(controls.finiteElementModeled, false);
    assert.equal(controls.transferredPotentialPaths.length, 1);
    assert.doesNotThrow(() => JSON.stringify(controls));
  });

  it('builds package output and escapes rendered HTML', () => {
    const pkg = buildGroundingFieldFidelityPackage({
      generatedAt: '2026-04-27T12:00:00.000Z',
      geometry,
      soilModel: { rho1: 100 },
      riskPoints,
      fieldData: {
        soilMeasurements: [
          { spacingM: 1, apparentResistivityOhmM: 85 },
          { spacingM: 4, apparentResistivityOhmM: 110 },
          { spacingM: 12, apparentResistivityOhmM: 150 },
          { spacingM: 24, apparentResistivityOhmM: 190 },
        ],
        fallOfPotentialRows: [{ testId: 'FOP <A>', probeSpacingM: 80, measuredResistanceOhm: 0.4, curveDeviationPct: 3 }],
        seasonalInputs: { enabled: true, dryMultiplier: 1.5 },
        fidelityControls: { transferredPotentialPaths: [{ label: 'Pipe <rack>', distanceM: 60 }] },
      },
    });
    assert.equal(pkg.version, 'grounding-field-fidelity-v1');
    assert.equal(pkg.summary.measurementCount, 4);
    assert.equal(pkg.summary.fallOfPotentialCount, 1);
    assert(pkg.warningRows.some(row => row.category === 'transferredPotential'));
    const html = renderGroundingFieldFidelityHTML(pkg);
    assert(html.includes('FOP &lt;A&gt;'));
    assert(!html.includes('FOP <A>'));
    assert(!html.includes('Pipe <rack>'));
  });
});

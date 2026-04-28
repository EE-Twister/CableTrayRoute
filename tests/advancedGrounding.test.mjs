import assert from 'node:assert/strict';
import {
  buildAdvancedGroundingPackage,
  buildGroundingHazardMap,
  buildGroundingRiskPoints,
  fitTwoLayerSoilModel,
  normalizeGroundingGeometry,
  normalizeSoilResistivityMeasurements,
  renderAdvancedGroundingHTML,
} from '../analysis/advancedGrounding.mjs';

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

const result = {
  Rg: 0.42,
  GPR: 2100,
  Em: 640,
  Es: 520,
  Etouch: 800,
  Estep: 700,
};

describe('advanced grounding helpers', () => {
  it('normalizes soil measurements and rejects invalid rows', () => {
    const rows = normalizeSoilResistivityMeasurements([
      { spacing: 10, rho: 180, source: 'F-1' },
      { spacingM: 2.5, apparentResistivityOhmM: 95, method: 'Schlumberger' },
    ]);
    assert.equal(rows[0].spacingM, 2.5);
    assert.equal(rows[0].method, 'schlumberger');
    assert.equal(rows[1].apparentResistivityOhmM, 180);
    assert.throws(() => normalizeSoilResistivityMeasurements([{ spacing: 0, rho: 100 }]), /invalid spacing/);
    assert.throws(() => normalizeSoilResistivityMeasurements([{ spacing: 5, rho: -1 }]), /invalid apparent resistivity/);
  });

  it('fits a deterministic two-layer soil screening model', () => {
    const fitA = fitTwoLayerSoilModel([
      { spacingM: 1, apparentResistivityOhmM: 85 },
      { spacingM: 3, apparentResistivityOhmM: 105 },
      { spacingM: 8, apparentResistivityOhmM: 165 },
      { spacingM: 16, apparentResistivityOhmM: 230 },
    ]);
    const fitB = fitTwoLayerSoilModel([...fitA.measurements].reverse());
    assert.equal(fitA.rho1, fitB.rho1);
    assert.equal(fitA.rho2, fitB.rho2);
    assert.equal(fitA.h, fitB.h);
    assert(Number.isFinite(fitA.fitErrorPct));
    assert(['fit', 'review', 'poorFit'].includes(fitA.status));
  });

  it('normalizes polygon geometry and rejects invalid shapes', () => {
    const geometry = normalizeGroundingGeometry({
      polygon: [
        { x: 0, y: 0, label: 'A' },
        { x: 20, y: 0, label: 'B' },
        { x: 20, y: 10, label: 'C' },
        { x: 0, y: 10, label: 'D' },
      ],
      rods: [{ x: 0, y: 0, lengthM: 3 }],
    });
    assert.equal(geometry.mode, 'polygon');
    assert.equal(geometry.areaM2, 200);
    assert.equal(geometry.perimeterM, 60);
    assert.equal(geometry.bounds.width, 20);
    assert.equal(geometry.rods.length, 1);
    assert.throws(() => normalizeGroundingGeometry({
      polygon: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }],
    }), /self-intersect/);
  });

  it('classifies generated and user risk points from touch, step, and GPR ratios', () => {
    const geometry = normalizeGroundingGeometry({ rectangle: { lengthM: 30, widthM: 20 } });
    const riskPoints = buildGroundingRiskPoints({
      geometry,
      result,
      soilModel: { status: 'fit' },
      userPoints: [{ label: 'Fence <gate>', x: 32, y: 10, kind: 'gpr', notes: 'public side' }],
    });
    assert.equal(riskPoints.length, 5);
    assert(riskPoints.some(point => point.label === 'Fence <gate>' && point.source === 'user'));
    assert(riskPoints.some(point => point.check === 'gpr' && point.status === 'fail'));
    assert(riskPoints.some(point => point.check === 'step' && ['pass', 'warn', 'fail'].includes(point.status)));
  });

  it('builds a JSON-safe hazard map with legend, point rows, and bounds', () => {
    const geometry = normalizeGroundingGeometry({ rectangle: { lengthM: 30, widthM: 20 } });
    const riskPoints = buildGroundingRiskPoints({ geometry, result });
    const map = buildGroundingHazardMap({ geometry, riskPoints, result });
    assert.equal(map.type, 'grounding-hazard-map');
    assert.equal(map.legend.length, 4);
    assert.equal(map.geometry.bounds.width, 30);
    assert.equal(map.points.length, riskPoints.length);
    assert.doesNotThrow(() => JSON.stringify(map));
  });

  it('builds a full package and escapes user labels in rendered HTML', () => {
    const pkg = buildAdvancedGroundingPackage({
      projectName: 'Grounding <Demo>',
      result,
      rectangle: { lengthM: 30, widthM: 20 },
      soilMeasurements: [
        { spacingM: 1, apparentResistivityOhmM: 90 },
        { spacingM: 4, apparentResistivityOhmM: 130 },
      ],
      userPoints: [{ label: 'Fence <gate>', x: 32, y: 10, kind: 'gpr' }],
      remoteElectrodes: [{ label: 'Telco <bond>', distanceM: 80 }],
      fieldData: {
        soilMeasurements: [
          { spacingM: 1, apparentResistivityOhmM: 90 },
          { spacingM: 4, apparentResistivityOhmM: 130 },
        ],
        fallOfPotentialRows: [{ testId: 'FOP <A>', probeSpacingM: 70, measuredResistanceOhm: 0.42, curveDeviationPct: 4 }],
        seasonalInputs: { enabled: true, dryMultiplier: 1.5 },
      },
    });
    const html = renderAdvancedGroundingHTML(pkg);
    assert.equal(pkg.version, 'advanced-grounding-v1');
    assert(pkg.summary.riskPointCount >= 5);
    assert.equal(pkg.fieldFidelity.summary.fallOfPotentialCount, 1);
    assert(pkg.warnings.some(warning => warning.includes('Remote electrodes')));
    assert(html.includes('Fence &lt;gate&gt;'));
    assert(html.includes('FOP &lt;A&gt;'));
    assert(!html.includes('Fence <gate>'));
    assert(!html.includes('FOP <A>'));
  });
});

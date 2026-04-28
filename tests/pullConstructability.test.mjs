import assert from 'node:assert/strict';
import {
  buildPullConstructabilityPackage,
  buildPullSectionsFromPullCard,
  comparePullDirections,
  evaluatePullDirection,
  normalizePullBendRows,
  normalizePullConstructabilityInputs,
  renderPullConstructabilityHTML,
} from '../analysis/pullConstructability.mjs';

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

const pullCard = {
  pull_number: 1,
  cable_type: 'Power',
  cable_count: 2,
  cable_tags: ['C-101', 'C-102'],
  cables: [
    { tag: 'C-101', diameter: 1, weight: 2 },
    { tag: 'C-102', diameter: 1, weight: 2 },
  ],
  total_weight_lb_ft: 4,
  max_diameter_in: 1,
  total_cross_section_area_sqin: 1.5708,
  route_steps: [
    { step: 1, type: 'Conduit', id: 'CND-1', length: 40, start: [0, 0, 0], end: [40, 0, 8] },
    { step: 2, type: 'Conduit', id: 'CND-2', length: 120, start: [40, 0, 8], end: [40, 120, 8] },
  ],
  route_segments: [
    { type: 'straight', length: 40 },
    { type: 'bend', angle: Math.PI / 2, radius: 3, length: 4.7 },
    { type: 'straight', length: 120 },
  ],
};

describe('pull constructability inputs', () => {
  it('normalizes defaults and missing-data warnings', () => {
    const inputs = normalizePullConstructabilityInputs({});
    assert.equal(inputs.frictionCoefficient, 0.35);
    assert.equal(inputs.lubricantFactor, 1);
    assert.equal(inputs.feedDirection, 'forward');
    assert(inputs.warnings.some(message => message.includes('allowable tension')));
  });

  it('normalizes section and bend rows with invalid numeric warnings', () => {
    const sections = buildPullSectionsFromPullCard(pullCard, {
      sectionOverrides: {
        'pull-1-section-1': { lengthFt: -10 },
      },
    });
    assert.equal(sections[0].lengthFt, 0);
    assert.equal(sections[0].valid, false);
    const bends = normalizePullBendRows([{ angleDeg: -90, radiusFt: -1, label: 'Bad <bend>' }]);
    assert.equal(bends[0].angleDeg, 0);
    assert.equal(bends[0].valid, false);
    assert(bends[0].warnings.some(message => message.includes('radius')));
  });
});

describe('pull direction evaluation', () => {
  it('evaluates tension, sidewall pressure, conduit fill, and vertical lift', () => {
    const result = evaluatePullDirection({
      pullCard,
      options: {
        pullingEquipmentLimitLbs: 1000,
        allowableSidewallPressureLbsPerFt: 500,
        conduitInsideDiameterIn: 2,
      },
      direction: 'forward',
    });
    assert(result.maxTensionLbs > 0);
    assert(result.maxSidewallPressureLbsPerFt > 0);
    assert(result.verticalLiftLbs > 0);
    assert(result.fillRows.some(row => row.fillPct > 0));
  });

  it('compares forward and reverse pulls deterministically', () => {
    const comparison = comparePullDirections({
      pullCard,
      options: {
        pullingEquipmentLimitLbs: 1000,
        allowableSidewallPressureLbsPerFt: 500,
        conduitInsideDiameterIn: 2,
      },
    });
    assert.equal(comparison.pullNumber, 1);
    assert(['forward', 'reverse'].includes(comparison.recommendedDirection));
    assert.notEqual(comparison.forward.maxTensionLbs, comparison.reverse.maxTensionLbs);
  });

  it('flags over-limit tension, sidewall, and jam-ratio warning rows', () => {
    const result = evaluatePullDirection({
      pullCard,
      options: {
        pullingEquipmentLimitLbs: 100,
        allowableSidewallPressureLbsPerFt: 10,
        conduitInsideDiameterIn: 3,
      },
      direction: 'forward',
    });
    assert.equal(result.status, 'fail');
    assert(result.fillRows.some(row => row.status === 'warn'));
    assert(result.bendRows.some(row => row.status === 'fail'));
  });
});

describe('pull constructability package', () => {
  it('builds JSON-safe package rows and warning summary', () => {
    const pkg = buildPullConstructabilityPackage({
      pullTable: { pulls: [pullCard] },
      routeResults: [{ cable: 'C-101' }],
      cableList: pullCard.cables,
      options: {
        generatedAt: '2026-04-27T12:00:00.000Z',
        pullingEquipmentLimitLbs: 1000,
        allowableSidewallPressureLbsPerFt: 500,
        conduitInsideDiameterIn: 2,
      },
    });
    assert.equal(pkg.version, 'pull-constructability-v1');
    assert.equal(pkg.summary.pullCount, 1);
    assert.equal(pkg.pullRows.length, 1);
    assert(pkg.sectionRows.length >= 2);
    assert(pkg.directionComparisons[0].forward.sectionRows.length >= 2);
  });

  it('escapes user-entered labels and notes in rendered HTML', () => {
    const pkg = buildPullConstructabilityPackage({
      pullTable: {
        pulls: [{
          ...pullCard,
          cable_tags: ['C-<bad>'],
          route_steps: [{ ...pullCard.route_steps[0], id: 'CND-<bad>' }],
        }],
      },
      options: {
        pullingEquipmentLimitLbs: 1000,
        allowableSidewallPressureLbsPerFt: 500,
        conduitInsideDiameterIn: 2,
      },
    });
    const html = renderPullConstructabilityHTML(pkg);
    assert(html.includes('C-&lt;bad&gt;'));
    assert(!html.includes('C-<bad>'));
  });
});

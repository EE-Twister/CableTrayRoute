import assert from 'node:assert/strict';
import {
  buildFeederSizingAlternatives,
  buildSizingLoadBasis,
  buildTransformerFeederSizingPackage,
  buildTransformerSizingAlternatives,
  normalizeTransformerFeederSizingCase,
  renderTransformerFeederSizingHTML,
} from '../analysis/transformerFeederSizingCase.mjs';

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

describe('transformer and feeder sizing case', () => {
  it('normalizes minimal manual cases with defaults', () => {
    const row = normalizeTransformerFeederSizingCase({ loadKva: 75 });
    assert.equal(row.loadSource, 'manual');
    assert.equal(row.phase, '3ph');
    assert.equal(row.material, 'copper');
    assert.equal(row.futureGrowthPct, 0);
    assert.equal(row.emergencyOverloadEnabled, false);
  });

  it('rejects invalid enum and power-factor values', () => {
    assert.throws(() => normalizeTransformerFeederSizingCase({ loadSource: 'utilityBill' }), /Invalid loadSource/);
    assert.throws(() => normalizeTransformerFeederSizingCase({ phase: '2ph' }), /Invalid phase/);
    assert.throws(() => normalizeTransformerFeederSizingCase({ powerFactor: 1.2 }), /Power factor/);
  });

  it('imports governed demand and applies future growth', () => {
    const basis = buildSizingLoadBasis({
      loadDemandGovernance: {
        summary: {
          governedDemandKw: 90,
          governedDemandKva: 100,
        },
      },
      caseData: {
        loadSource: 'loadDemandGovernance',
        futureGrowthPct: 10,
      },
    });
    assert.equal(basis.baseKw, 90);
    assert.equal(basis.baseKva, 100);
    assert.equal(basis.designKva, 110);
    assert.equal(basis.sourceStatus, 'governed');
  });

  it('builds transformer alternatives with selected and rejected reasons', () => {
    const result = buildTransformerSizingAlternatives({
      loadKva: 80,
      primaryVoltage: 480,
      secondaryVoltage: 208,
      phase: '3ph',
      impedancePct: 5.75,
      bilKv: 10,
      temperatureRiseC: 150,
    });
    assert.equal(result.transformerRows[0].selectedKva, 112.5);
    assert(result.alternativeRows.some(row => row.status === 'selected' && row.kva === 112.5));
    assert(result.alternativeRows.some(row => row.status === 'rejected' && row.reason.includes('Below design kVA')));
  });

  it('builds feeder alternatives using the existing NEC/cost engine', () => {
    const result = buildFeederSizingAlternatives({
      loadKva: 100,
      powerFactor: 0.9,
      secondaryVoltage: 480,
      voltage: 480,
      phase: '3ph',
      material: 'copper',
      tempRating: 75,
      feederBasisNote: 'NEC basis',
    });
    assert.equal(result.feederRows.length, 1);
    assert.equal(result.feederRows[0].status, 'pass');
    assert(result.feederRows[0].conductorSize);
    assert(result.alternativeRows.length > 0);
    assert(result.alternativeRows[0].costPerFtPerPhase !== undefined);
  });

  it('reports missing transformer/protection basis as review data, not hard failure', () => {
    const pkg = buildTransformerFeederSizingPackage({
      projectName: 'Unit A',
      studyCase: {
        loadKva: 75,
        primaryVoltage: 480,
        secondaryVoltage: 208,
        emergencyOverloadEnabled: true,
        emergencyOverloadPct: 15,
      },
    });
    assert.equal(pkg.version, 'transformer-feeder-sizing-v1');
    assert.equal(pkg.summary.status, 'review');
    assert(pkg.warningRows.some(row => row.code === 'missingTransformerImpedance'));
    assert(pkg.warningRows.some(row => row.code === 'emergencyOverloadReview'));
    assert.notEqual(pkg.transformerRows[0].status, 'fail');
  });

  it('builds package JSON and escapes rendered HTML', () => {
    const pkg = buildTransformerFeederSizingPackage({
      projectName: 'Project <A>',
      studyCase: {
        caseName: 'Case <1>',
        loadKva: 75,
        primaryVoltage: 480,
        secondaryVoltage: 208,
        protectionBasisNote: 'Basis <note>',
      },
    });
    const html = renderTransformerFeederSizingHTML(pkg);
    assert.equal(pkg.summary.transformerCount, 1);
    assert(pkg.assumptions.length > 0);
    assert(html.includes('Project &lt;A&gt;'));
    assert(html.includes('Case &lt;1&gt;'));
    assert(!html.includes('Project <A>'));
    assert(!html.includes('Case <1>'));
  });
});

import assert from 'assert';
import { estimateDissimilarMetalsRisk } from '../dissimilarmetals.js';

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

describe('estimateDissimilarMetalsRisk', () => {
  it('identifies aluminum as anodic against passive 304 stainless', () => {
    const result = estimateDissimilarMetalsRisk({
      primaryMetal: 'aluminum',
      secondaryMetal: 'stainless304Passive',
      environment: 'industrialOutdoor',
      isolationQuality: 'basic',
      anodeArea: 120,
      cathodeArea: 300,
      corrosionAllowanceMm: 1.5,
      temperatureC: 30
    });

    assert.strictEqual(result.anodicMetal, 'Aluminum alloy');
    assert.strictEqual(result.cathodicMetal, 'Stainless steel 304 (passive)');
    assert.ok(result.corrosionRateMmYear > 0);
    assert.ok(['Moderate', 'High', 'Severe'].includes(result.severity));
  });

  it('returns lower corrosion rate with engineered isolation than no isolation', () => {
    const common = {
      primaryMetal: 'aluminum',
      secondaryMetal: 'stainless316Passive',
      environment: 'coastalAtmosphere',
      anodeArea: 140,
      cathodeArea: 280,
      corrosionAllowanceMm: 1.5,
      temperatureC: 35
    };

    const none = estimateDissimilarMetalsRisk({ ...common, isolationQuality: 'none' });
    const engineered = estimateDissimilarMetalsRisk({ ...common, isolationQuality: 'engineered' });
    assert.ok(engineered.corrosionRateMmYear < none.corrosionRateMmYear);
  });

  it('throws on unsupported metal key', () => {
    assert.throws(() => estimateDissimilarMetalsRisk({
      primaryMetal: 'unknown',
      secondaryMetal: 'stainless304Passive',
      environment: 'industrialOutdoor',
      isolationQuality: 'basic',
      anodeArea: 120,
      cathodeArea: 300,
      corrosionAllowanceMm: 1.5,
      temperatureC: 30
    }), /primaryMetal must be selected/);
  });
});

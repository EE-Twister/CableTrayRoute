import assert from 'assert';
import {
  buildAssumptionRows,
  buildCompatibilityWarning,
  buildCorrosionTimelineState,
  buildInspectionMilestones,
  buildMitigationComparisonRows,
  buildResultExportPayload,
  buildResultSummary,
  estimateDissimilarMetalsRisk,
  getAssemblyPreset
} from '../dissimilarmetals.js';

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

    assert.strictEqual(result.modelVersion, 2);
    assert.strictEqual(result.anodicMetal, 'Aluminum alloy');
    assert.strictEqual(result.cathodicMetal, 'Stainless steel 304 (passive)');
    assert.strictEqual(result.drivingPotentialV, 0.55);
    assert.strictEqual(result.potentialCompatibility.exceedsLimit, true);
    assert.strictEqual(result.corrosionRateMmYear, 0.301);
    assert.ok(Math.abs(result.corrosionRateMmYearExact - 0.3009939702076045) < 1e-12);
    assert.ok(result.corrosionRateMmYear > 0);
    assert.ok(['Moderate', 'High', 'Severe'].includes(result.severity));
    assert.strictEqual(result.input.exposureDuty, 'intermittentlyWet');
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

  it('adjusts corrosion rate by electrolyte exposure duty cycle', () => {
    const common = {
      primaryMetal: 'aluminum',
      secondaryMetal: 'stainless304Passive',
      environment: 'industrialOutdoor',
      isolationQuality: 'basic',
      anodeArea: 120,
      cathodeArea: 300,
      corrosionAllowanceMm: 1.5,
      temperatureC: 30
    };

    const dry = estimateDissimilarMetalsRisk({ ...common, exposureDuty: 'normallyDry' });
    const immersed = estimateDissimilarMetalsRisk({ ...common, exposureDuty: 'continuouslyWet' });
    assert.ok(immersed.corrosionRateMmYear > dry.corrosionRateMmYear);
    assert.strictEqual(immersed.exposureDutyFactor, 1.65);
  });

  it('retains raw precision for life when the displayed rate rounds below 0.001 mm/year', () => {
    const result = estimateDissimilarMetalsRisk({
      primaryMetal: 'lead',
      secondaryMetal: 'stainless410Active',
      environment: 'indoorDry',
      exposureDuty: 'normallyDry',
      isolationQuality: 'engineered',
      anodeArea: 100,
      cathodeArea: 100,
      corrosionAllowanceMm: 1.5,
      temperatureC: 20
    });

    assert.ok(result.corrosionRateMmYearExact > 0);
    assert.strictEqual(result.corrosionRateMmYear, 0);
    assert.strictEqual(result.estimatedLifeYears, 4216.6);
    const halfLife = buildCorrosionTimelineState(result, result.estimatedLifeYears / 2);
    assert.strictEqual(halfLife.allowanceConsumedPct, 50);
  });

  it('does not assign anodic and cathodic roles within the same representative potential group', () => {
    const result = estimateDissimilarMetalsRisk({
      primaryMetal: 'copper',
      secondaryMetal: 'stainless304Passive',
      environment: 'indoorHumid',
      exposureDuty: 'intermittentlyWet',
      isolationQuality: 'none',
      anodeArea: 100,
      cathodeArea: 100,
      corrosionAllowanceMm: 1.5,
      temperatureC: 20
    });

    assert.strictEqual(result.samePotentialGroup, true);
    assert.strictEqual(result.primaryRole, 'Same potential group');
    assert.strictEqual(result.secondaryRole, 'Same potential group');
    assert.strictEqual(result.anodicMetal, 'No distinct anodic member');
    assert.ok(!result.compatibilityWarning.drivers.some(driver => driver.includes('area ratio')));
    assert.ok(!result.recommendation.some(item => item.includes('Reduce cathode-to-anode area ratio')));
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

  it('tracks corrosion allowance consumed over time', () => {
    const state = buildCorrosionTimelineState({
      corrosionRateMmYear: 0.25,
      input: { corrosionAllowanceMm: 1 }
    }, 2);

    assert.strictEqual(state.materialLossMm, 0.5);
    assert.strictEqual(state.remainingAllowanceMm, 0.5);
    assert.strictEqual(state.allowanceConsumedPct, 50);
    assert.strictEqual(state.statusKey, 'monitor');
  });

  it('marks timeline state exceeded after available allowance is consumed', () => {
    const state = buildCorrosionTimelineState({
      corrosionRateMmYear: 0.25,
      input: { corrosionAllowanceMm: 1 }
    }, 5);

    assert.strictEqual(state.remainingAllowanceMm, 0);
    assert.strictEqual(state.overAllowanceMm, 0.25);
    assert.strictEqual(state.statusKey, 'exceeded');
  });

  it('projects optional component thickness over time', () => {
    const state = buildCorrosionTimelineState({
      corrosionRateMmYear: 0.2,
      input: {
        corrosionAllowanceMm: 1,
        initialThicknessMm: 3,
        minimumThicknessMm: 2.4
      }
    }, 2);

    assert.strictEqual(state.hasThicknessProjection, true);
    assert.strictEqual(state.materialLossMm, 0.4);
    assert.strictEqual(state.remainingThicknessMm, 2.6);
    assert.strictEqual(state.thicknessMarginMm, 0.2);
    assert.strictEqual(state.thicknessStatusKey, 'within');
  });

  it('rejects minimum thickness values greater than or equal to initial thickness', () => {
    assert.throws(() => estimateDissimilarMetalsRisk({
      primaryMetal: 'aluminum',
      secondaryMetal: 'stainless304Passive',
      environment: 'industrialOutdoor',
      isolationQuality: 'basic',
      anodeArea: 120,
      cathodeArea: 300,
      corrosionAllowanceMm: 1.5,
      initialThicknessMm: 2,
      minimumThicknessMm: 2,
      temperatureC: 30
    }), /minimumThicknessMm must be less/);
  });

  it('loads common assembly presets with complete input values', () => {
    const preset = getAssemblyPreset('aluminum-tray-stainless-hardware');
    assert.ok(preset);
    assert.strictEqual(preset.values.primaryMetal, 'aluminum');
    assert.strictEqual(preset.values.secondaryMetal, 'stainless304Passive');
    assert.strictEqual(preset.values.exposureDuty, 'intermittentlyWet');
    assert.ok(preset.values.anodeArea > 0);
    assert.ok(preset.values.cathodeArea > 0);
  });

  it('builds a plain-language compatibility warning with key drivers', () => {
    const result = estimateDissimilarMetalsRisk({
      primaryMetal: 'aluminum',
      secondaryMetal: 'stainless316Passive',
      environment: 'coastalAtmosphere',
      exposureDuty: 'continuouslyWet',
      isolationQuality: 'none',
      anodeArea: 100,
      cathodeArea: 500,
      corrosionAllowanceMm: 1.5,
      temperatureC: 35
    });
    const warning = buildCompatibilityWarning(result);

    assert.strictEqual(warning.level, 'high');
    assert.ok(warning.message.includes('Aluminum alloy is anodic'));
    assert.ok(warning.drivers.some(driver => driver.includes('cathode-to-anode')));
    assert.ok(warning.drivers.some(driver => driver.includes('continuously wet')));
  });

  it('builds a concise result summary for copying into project records', () => {
    const result = estimateDissimilarMetalsRisk({
      primaryMetal: 'aluminum',
      secondaryMetal: 'stainless304Passive',
      environment: 'industrialOutdoor',
      exposureDuty: 'frequentlyWet',
      isolationQuality: 'basic',
      anodeArea: 120,
      cathodeArea: 300,
      corrosionAllowanceMm: 1.5,
      initialThicknessMm: 3.2,
      minimumThicknessMm: 2.4,
      temperatureC: 30
    });
    const summary = buildResultSummary(result);

    assert.ok(summary.includes('Dissimilar Metals Corrosion Reference'));
    assert.ok(summary.includes('Anodic member: Aluminum alloy'));
    assert.ok(summary.includes('Heuristic screening rate:'));
    assert.ok(summary.includes('Potential compatibility:'));
    assert.ok(summary.includes('Model assumptions:'));
    assert.ok(summary.includes('Thickness projection'));
  });

  it('builds assumption rows and JSON export payload for result handoff', () => {
    const result = estimateDissimilarMetalsRisk({
      primaryMetal: 'zinc',
      secondaryMetal: 'copper',
      environment: 'industrialOutdoor',
      isolationQuality: 'basic',
      anodeArea: 250,
      cathodeArea: 25,
      corrosionAllowanceMm: 0.1,
      temperatureC: 30
    });
    const rows = buildAssumptionRows(result);
    const payload = buildResultExportPayload(result);

    assert.ok(rows.some(row => row.label === 'Environment model'));
    assert.ok(rows.some(row => row.label === 'Electrolyte duty'));
    assert.strictEqual(payload.exportType, 'dissimilar-metals-corrosion-study');
    assert.strictEqual(payload.exportVersion, 2);
    assert.strictEqual(payload.result, result);
    assert.ok(payload.summaryText.includes('Recommended mitigations'));
  });

  it('builds mitigation comparison rows with engineered isolation improving life', () => {
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
    const rows = buildMitigationComparisonRows(result);
    const none = rows.find(row => row.key === 'none');
    const basic = rows.find(row => row.key === 'basic');
    const engineered = rows.find(row => row.key === 'engineered');

    assert.strictEqual(rows.length, 3);
    assert.ok(basic.isCurrent);
    assert.ok(engineered.corrosionRateMmYear < none.corrosionRateMmYear);
    assert.ok(engineered.estimatedLifeYears > basic.estimatedLifeYears);
    assert.ok(engineered.rateReductionPct > basic.rateReductionPct);
  });

  it('builds inspection milestones at 50, 85, and 100 percent of allowance life', () => {
    const milestones = buildInspectionMilestones({ estimatedLifeYears: 10 });
    assert.deepStrictEqual(milestones.map(milestone => milestone.percent), [50, 85, 100]);
    assert.deepStrictEqual(milestones.map(milestone => milestone.years), [5, 8.5, 10]);
  });
});

import assert from 'assert';
import { runHeatTraceSizingAnalysis } from '../analysis/heatTraceSizing.mjs';
import {
  buildHeatTraceAdvancedPackage,
  buildHeatTraceControlRows,
  buildHeatTraceStartupProfile,
  evaluateHeatTraceAssetCase,
  normalizeHeatTraceAssetCase,
  normalizeHeatTraceSegmentRows,
  renderHeatTraceAdvancedHTML,
} from '../analysis/heatTraceAdvancedAssets.mjs';

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

const baseInputs = {
  pipeNps: '2',
  insulationThicknessIn: 1,
  insulationType: 'mineralWool',
  lineLengthFt: 120,
  maintainTempC: 60,
  ambientTempC: -10,
  windSpeedMph: 5,
  safetyMarginPct: 10,
  maxCircuitLengthFt: 300,
  pipeMaterial: 'carbonSteel',
  environment: 'outdoor-sheltered',
  voltageV: 240,
  heatTraceCableType: 'selfRegulating',
  traceRunCount: 1,
};

function makeCase(overrides = {}) {
  const inputs = { ...baseInputs, ...(overrides.inputs || {}) };
  const result = runHeatTraceSizingAnalysis(inputs);
  return {
    id: 'HT-ADV',
    name: 'HT-ADV',
    pipeTag: 'P-101',
    sourcePanel: 'HTP-1',
    controllerTag: 'HTC-1',
    circuitNumber: '1',
    inputs,
    result,
    ...overrides,
  };
}

describe('heat trace advanced asset helpers', () => {
  it('normalizes legacy branch cases without advanced metadata', () => {
    const row = normalizeHeatTraceAssetCase(makeCase());
    assert.strictEqual(row.assetType, 'pipe');
    assert.strictEqual(row.assetTag, 'P-101');
    assert.strictEqual(row.advancedSegments.length, 1);
    assert.strictEqual(row.controlMetadata.sensorCount, 0);
  });

  it('supports pipe, tank, vessel, skid, and custom asset cases deterministically', () => {
    ['pipe', 'tank', 'vessel', 'skid', 'custom'].forEach(assetType => {
      const normalized = normalizeHeatTraceAssetCase(makeCase({
        assetType,
        assetTag: `${assetType}-1`,
        advancedSegments: [{
          label: `${assetType} seg`,
          assetType,
          lengthFt: 50,
          areaSqFt: assetType === 'pipe' ? 0 : 120,
          insulationType: 'mineralWool',
          insulationThicknessIn: 1.5,
          ambientTempC: -20,
          maintainTempC: 40,
          cableType: 'selfRegulating',
          wattDensityWPerFt: 10,
          runCount: 1,
        }],
      }));
      const evaluation = evaluateHeatTraceAssetCase(normalized);
      assert.strictEqual(evaluation.assetRow.assetType, assetType);
      assert.strictEqual(evaluation.segmentRows.length, 1);
      assert.ok(evaluation.assetRow.installedWatts > 0);
      if (assetType !== 'pipe') {
        assert.ok(evaluation.warnings.some(warning => warning.message.includes('screening-only')));
      }
    });
  });

  it('rolls up multi-segment heat loss, connected load, and warnings', () => {
    const normalized = normalizeHeatTraceAssetCase(makeCase({
      assetType: 'tank',
      assetTag: 'TK-1',
      advancedSegments: [
        { label: 'Shell <north>', assetType: 'tank', areaSqFt: 200, insulationType: 'mineralWool', insulationThicknessIn: 2, ambientTempC: -20, maintainTempC: 35, wattDensityWPerSqFt: 8, cableType: 'constantWattage' },
        { label: 'No insulation data', assetType: 'tank', areaSqFt: 50, ambientTempC: -20, maintainTempC: 35, wattDensityWPerSqFt: 6, cableType: 'constantWattage' },
      ],
    }));
    const evaluation = evaluateHeatTraceAssetCase(normalized);
    assert.strictEqual(evaluation.segmentRows.length, 2);
    assert.ok(evaluation.assetRow.installedWatts > 0);
    assert.ok(evaluation.warnings.some(warning => warning.message.includes('Missing insulation')));
  });

  it('startup profiles respond to cable type, cold ambient, run count, and diversity', () => {
    const base = normalizeHeatTraceAssetCase(makeCase({
      startupBasis: { minimumAmbientC: -35, diversityFactor: 0.8 },
      advancedSegments: [
        { label: 'Self regulating', lengthFt: 100, insulationType: 'mineralWool', insulationThicknessIn: 1, ambientTempC: -35, maintainTempC: 40, cableType: 'selfRegulating', wattDensityWPerFt: 10, runCount: 1 },
        { label: 'MI', lengthFt: 100, insulationType: 'mineralWool', insulationThicknessIn: 1, ambientTempC: -35, maintainTempC: 40, cableType: 'mineralInsulated', wattDensityWPerFt: 10, runCount: 2 },
      ],
    }));
    const profile = buildHeatTraceStartupProfile(base);
    assert.strictEqual(profile.length, 2);
    assert.ok(profile[0].coldStartMultiplier > profile[1].coldStartMultiplier);
    assert.ok(profile[1].runningAmps > profile[0].runningAmps);
    assert.strictEqual(profile[0].diversityFactor, 0.8);
  });

  it('control rows flag missing sensors, high-limit gaps, hazardous T-rating review, and phase gaps', () => {
    const normalized = normalizeHeatTraceAssetCase(makeCase({
      assetType: 'vessel',
      hazardousArea: { enabled: true, classification: 'Class I Div 2' },
      panelPhase: '',
      controlMetadata: { controllerType: 'electronic', controlMode: 'lineSensing', sensorCount: 0 },
      advancedSegments: [{
        label: 'Vessel shell',
        assetType: 'vessel',
        areaSqFt: 100,
        insulationType: 'mineralWool',
        insulationThicknessIn: 1,
        ambientTempC: -10,
        maintainTempC: 40,
        cableType: 'constantWattage',
        wattDensityWPerSqFt: 7,
      }],
    }));
    const [control] = buildHeatTraceControlRows(normalized);
    assert.strictEqual(control.status, 'missingData');
    assert.ok(control.missingFields.includes('sensorLocation'));
    assert.ok(control.warnings.some(warning => warning.includes('Constant-wattage')));
    assert.ok(control.warnings.some(warning => warning.includes('T-rating')));
  });

  it('package JSON includes rows, warnings, assumptions, and escaped HTML', () => {
    const pkg = buildHeatTraceAdvancedPackage({
      projectName: '<b>Demo</b>',
      circuitCases: [makeCase({
        assetType: 'tank',
        assetTag: '<script>TK</script>',
        controlMetadata: { controllerType: 'electronic', controlMode: 'ambient', sensorCount: 1, sensorLocation: '<sensor>' },
        advancedSegments: [{ label: '<shell>', assetType: 'tank', areaSqFt: 100, insulationType: 'mineralWool', insulationThicknessIn: 1, ambientTempC: -15, maintainTempC: 35, cableType: 'selfRegulating', wattDensityWPerSqFt: 6 }],
      })],
      approval: { status: 'approved' },
    });
    assert.strictEqual(pkg.version, 'heat-trace-advanced-assets-v1');
    assert.strictEqual(pkg.assetRows.length, 1);
    assert.strictEqual(pkg.segmentRows.length, 1);
    assert.strictEqual(pkg.startupProfileRows.length, 1);
    assert.strictEqual(pkg.controlRows.length, 1);
    assert.ok(pkg.assumptions.some(item => item.includes('screening')));
    assert.strictEqual(pkg.approval.status, 'approved');
    const html = renderHeatTraceAdvancedHTML(pkg);
    assert.ok(!html.includes('<script>TK</script>'));
    assert.ok(!html.includes('<b>Demo</b>'));
    assert.ok(!html.includes('<sensor>'));
    assert.ok(html.includes('&lt;script&gt;TK&lt;/script&gt;'));
    assert.ok(html.includes('&lt;b&gt;Demo&lt;/b&gt;'));
    assert.ok(html.includes('&lt;sensor&gt;'));
  });

  it('rejects unsupported asset types and invalid segment arrays', () => {
    assert.throws(() => normalizeHeatTraceAssetCase(makeCase({ assetType: 'steam' })), /Unsupported/);
    assert.throws(() => normalizeHeatTraceSegmentRows([{ assetType: 'unknown' }]), /Unsupported/);
  });
});

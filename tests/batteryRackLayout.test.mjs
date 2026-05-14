import assert from 'assert';
import { runBatterySizingAnalysis } from '../analysis/batterySizing.mjs';
import {
  buildBatteryRackLayoutModel,
  normalizeBatteryRackLayoutInputs,
} from '../analysis/batteryRackLayout.mjs';

function describe(name, fn) {
  console.log(`\n  ${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log(`    OK ${name}`);
  } catch (err) {
    console.error(`    FAIL ${name}`);
    console.error(`      ${err.message}`);
    process.exitCode = 1;
  }
}

function baseSizingResult() {
  return runBatterySizingAnalysis({
    systemLabel: 'Main UPS Bus',
    averageLoadKw: 50,
    peakLoadKw: 60,
    runtimeHours: 2,
    chemistry: 'lead-acid-agm',
    ambientTempC: 25,
    designMarginPct: 10,
    upsPowerFactor: 0.9,
  });
}

describe('normalizeBatteryRackLayoutInputs()', () => {
  it('uses stable defaults for a legacy sizing result with no layout inputs', () => {
    const inputs = normalizeBatteryRackLayoutInputs(baseSizingResult());
    assert.strictEqual(inputs.dcBusVoltageV, 480);
    assert.strictEqual(inputs.nominalCellVoltageV, 2);
    assert.strictEqual(inputs.cellCapacityAh, 200);
    assert.strictEqual(inputs.cellsPerModule, 12);
    assert.strictEqual(inputs.modulesPerRack, 40);
    assert.strictEqual(inputs.terminalSide, 'front-left');
    assert.strictEqual(inputs.includeStringProtection, true);
    assert.deepStrictEqual(inputs.inputWarnings, []);
  });

  it('normalizes invalid physical inputs with warnings', () => {
    const inputs = normalizeBatteryRackLayoutInputs(baseSizingResult(), {
      dcBusVoltageV: -1,
      rackWidthFt: 0,
      modulesPerRack: 'bad',
      terminalSide: 'ceiling',
    });
    assert.strictEqual(inputs.dcBusVoltageV, 480);
    assert.strictEqual(inputs.rackWidthFt, 2.5);
    assert.strictEqual(inputs.modulesPerRack, 40);
    assert.strictEqual(inputs.terminalSide, 'front-left');
    assert.ok(inputs.inputWarnings.length >= 4, 'expected warnings for invalid overrides');
  });
});

describe('buildBatteryRackLayoutModel()', () => {
  it('builds the default 480 V lead-acid rack layout', () => {
    const model = buildBatteryRackLayoutModel(baseSizingResult());
    assert.strictEqual(model.summary.targetBankKwh, 250);
    assert.strictEqual(model.summary.cellsPerString, 240);
    assert.strictEqual(model.summary.modulesPerString, 20);
    assert.strictEqual(model.summary.stringKwh, 96);
    assert.strictEqual(model.summary.requiredParallelStrings, 3);
    assert.strictEqual(model.summary.totalModules, 60);
    assert.strictEqual(model.summary.rackCount, 2);
    assert.strictEqual(model.summary.unusedRackSlots, 20);
    assert.strictEqual(model.racks.length, 2);
    assert.strictEqual(model.strings.length, 3);
    assert.strictEqual(model.connections.length, 9);
    assert.ok(model.connections.some(row => row.type === 'Positive home run'));
  });

  it('allows overrides to change string count, rack count, and row layout', () => {
    const model = buildBatteryRackLayoutModel(baseSizingResult(), {
      cellCapacityAh: 500,
      modulesPerRack: 20,
      racksPerRow: 1,
    });
    assert.strictEqual(model.summary.stringKwh, 240);
    assert.strictEqual(model.summary.requiredParallelStrings, 2);
    assert.strictEqual(model.summary.totalModules, 40);
    assert.strictEqual(model.summary.rackCount, 2);
    assert.strictEqual(model.summary.rows, 2);
    assert.strictEqual(model.racks[1].row, 2);
  });

  it('warns when string voltage does not closely match the DC bus', () => {
    const model = buildBatteryRackLayoutModel(baseSizingResult(), {
      dcBusVoltageV: 500,
      nominalCellVoltageV: 48,
    });
    assert.ok(model.summary.voltageMismatchPct > 2);
    assert.ok(model.warnings.some(w => w.includes('Computed string voltage')));
  });

  it('throws when no valid sizing capacity is available', () => {
    assert.throws(
      () => buildBatteryRackLayoutModel({ chemistry: 'lead-acid-agm' }),
      /selectedBankKwh or kwhFinal/
    );
  });
});

console.log('\n  batteryRackLayout tests complete.\n');

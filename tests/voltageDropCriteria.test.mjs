import assert from 'node:assert/strict';
import {
  buildVoltageDropStudyPackage,
  buildVoltageDropStudyRows,
  normalizeVoltageDropCriteria,
  normalizeVoltageDropOperatingCase,
  renderVoltageDropStudyHTML,
  runVoltageDropStudy,
} from '../analysis/voltageDropStudy.mjs';

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

const cable = {
  id: 'C-1',
  cable_tag: 'C-1 <main>',
  from_location: 'SWBD',
  to_location: 'MCC',
  circuit_type: 'feeder',
  length: 250,
  est_load: 120,
  operating_voltage: 480,
  conductor_size: '4/0',
  conductor_material: 'CU',
  insulation_rating: 75,
};

describe('voltage drop criteria package', () => {
  it('preserves legacy runVoltageDropStudy behavior', () => {
    const legacy = runVoltageDropStudy([cable]);
    assert.equal(legacy.summary.total, 1);
    assert('dropPct' in legacy.results[0]);
  });

  it('normalizes criteria and operating-case defaults', () => {
    const criteria = normalizeVoltageDropCriteria({});
    const op = normalizeVoltageDropOperatingCase({});
    assert.equal(criteria.feederLimitPct, 3);
    assert.equal(criteria.totalLimitPct, 5);
    assert.equal(op.caseType, 'normal');
    assert.equal(op.sourceVoltagePct, 100);
    assert.equal(op.loadPowerFactor, 0.9);
  });

  it('rejects invalid criteria and operating cases', () => {
    assert.throws(() => normalizeVoltageDropCriteria({ feederLimitPct: -1 }), /feederLimitPct/);
    assert.throws(() => normalizeVoltageDropCriteria({ reportPreset: 'giant' }), /reportPreset/);
    assert.throws(() => normalizeVoltageDropOperatingCase({ caseType: 'fault' }), /caseType/);
    assert.throws(() => normalizeVoltageDropOperatingCase({ loadPowerFactor: 1.5 }), /loadPowerFactor/);
  });

  it('classifies normal, emergency, and start rows against selected criteria', () => {
    const normal = buildVoltageDropStudyPackage({
      cables: [cable],
      criteria: { feederLimitPct: 3, warningMarginPct: 50 },
      operatingCase: { caseType: 'normal' },
    });
    const emergency = buildVoltageDropStudyPackage({
      cables: [{ ...cable, totalChainDropPct: 7 }],
      criteria: { emergencyLimitPct: 6, totalLimitPct: 5 },
      operatingCase: { caseType: 'emergency', segmentChainBasisNote: 'Source to MCC' },
    });
    const start = buildVoltageDropStudyPackage({
      cables: [cable],
      criteria: { startingLimitPct: 25 },
      operatingCase: { caseType: 'start', motorMinimumStartingVoltagePu: 0.9 },
      motorStart: { worstCaseRows: [{ motorTag: 'MCC', minVoltagePu: 0.82 }] },
    });
    assert(['pass', 'warn', 'fail', 'review'].includes(normal.summary.status));
    assert.equal(emergency.rows[0].status, 'fail');
    assert.equal(start.rows[0].status, 'fail');
    assert(start.rows[0].reason.includes('Starting voltage'));
  });

  it('source voltage, transformer tap, PF, and temperature affect rows deterministically', () => {
    const base = buildVoltageDropStudyRows({ cables: [cable], operatingCase: { caseType: 'normal' } })[0];
    const adjusted = buildVoltageDropStudyRows({
      cables: [cable],
      operatingCase: {
        caseType: 'normal',
        sourceVoltagePct: 95,
        transformerTapPct: -2.5,
        loadPowerFactor: 0.8,
        conductorTemperatureC: 90,
      },
    })[0];
    assert.notEqual(adjusted.voltageV, base.voltageV);
    assert.notEqual(adjusted.currentA, base.currentA);
    assert.equal(adjusted.conductorTemperatureC, 90);
  });

  it('flags missing cable inputs and total-chain failures', () => {
    const pkg = buildVoltageDropStudyPackage({
      cables: [
        { id: 'bad', cable_tag: 'Bad <Cable>' },
        { ...cable, id: 'chain', cable_tag: 'Chain', totalChainDropPct: 6 },
      ],
      criteria: { totalLimitPct: 5 },
      operatingCase: { caseType: 'normal' },
    });
    assert(pkg.warningRows.some(row => row.code === 'missingVoltageDropInputs'));
    assert(pkg.warningRows.some(row => row.code === 'voltageDropCriteriaFailure'));
    assert.equal(pkg.rows.find(row => row.id === 'bad').status, 'missingData');
    assert.equal(pkg.rows.find(row => row.id === 'chain').status, 'fail');
  });

  it('builds package JSON and escapes rendered HTML', () => {
    const pkg = buildVoltageDropStudyPackage({
      projectName: 'Project <VD>',
      cables: [cable],
      operatingCase: { caseType: 'normal', segmentChainBasisNote: 'Route <basis>' },
    });
    const html = renderVoltageDropStudyHTML(pkg);
    assert.equal(pkg.version, 'voltage-drop-study-v1');
    assert.equal(pkg.summary.total, 1);
    assert(pkg.assumptions.length > 0);
    assert(html.includes('Project &lt;VD&gt;'));
    assert(html.includes('C-1 &lt;main&gt;'));
    assert(!html.includes('Project <VD>'));
    assert(!html.includes('C-1 <main>'));
  });
});

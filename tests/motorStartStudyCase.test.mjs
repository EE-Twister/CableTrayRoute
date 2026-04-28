import assert from 'assert';
import {
  MOTOR_START_STUDY_CASE_VERSION,
  normalizeMotorStartStudyCase,
  normalizeMotorStartMotorRow,
  buildMotorStartEquipmentRows,
  buildMotorStartSequenceEvents,
  runMotorStartStudyCase,
  buildMotorStartStudyPackage,
  renderMotorStartStudyHTML,
} from '../analysis/motorStartStudyCase.mjs';

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

function approx(a, b, tol = 1e-6) {
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);
}

const oneLine = {
  sheets: [
    {
      components: [
        {
          id: 'MTR-1',
          type: 'motor',
          tag: 'Pump <A>',
          hp: 250,
          voltage: 480,
          props: {
            starter_type: 'dol',
            inertia: 8,
          },
        },
        {
          id: 'MTR-2',
          subtype: 'motor_load',
          label: 'Fan B',
          hp: 150,
          voltage: 480,
          props: {
            starter_type: 'vfd',
            vfd_current_limit_pu: 1.2,
            ramp_time_s: 12,
          },
        },
      ],
    },
  ],
};

describe('motor-start study case normalization', () => {
  it('fills deterministic study-case defaults', () => {
    const studyCase = normalizeMotorStartStudyCase({});
    assert.strictEqual(studyCase.sourceBasis, 'oneLine');
    assert.strictEqual(studyCase.sourceCondition, 'utility');
    assert.strictEqual(studyCase.voltageLimits.startMinPu, 0.8);
    assert.strictEqual(studyCase.reportPreset, 'summary');
  });

  it('rejects invalid source, starter, event, and report values', () => {
    assert.throws(() => normalizeMotorStartStudyCase({ sourceBasis: 'cloud' }), /Unsupported/);
    assert.throws(() => normalizeMotorStartStudyCase({ reportPreset: 'animated' }), /Unsupported/);
    assert.throws(() => normalizeMotorStartMotorRow({ id: 'M1', starterType: 'liquid' }), /Unsupported/);
    assert.throws(() => buildMotorStartSequenceEvents([], { sequenceEvents: [{ action: 'teleport' }] }), /Unsupported/);
  });

  it('builds editable motor rows from one-line motors', () => {
    const rows = buildMotorStartEquipmentRows({ oneLine });
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].tag, 'Pump <A>');
    assert.strictEqual(rows[1].starterType, 'vfd');
    assert.ok(rows[0].flaA > 0);
  });
});

describe('motor-start sequence calculations', () => {
  it('creates deterministic default staggered sequence events', () => {
    const rows = buildMotorStartEquipmentRows({ oneLine });
    const events = buildMotorStartSequenceEvents(rows, { spacingSec: 3 });
    assert.deepStrictEqual(events.map(event => event.timeSec), [0, 3]);
    assert.deepStrictEqual(events.map(event => event.action), ['start', 'start']);
  });

  it('simultaneous starts produce deeper voltage dip than staggered starts', () => {
    const rows = buildMotorStartEquipmentRows({ oneLine });
    const baseCase = { sourceBasis: 'manual', manualSourceImpedanceOhm: 0.04, simulationDurationSec: 15, timeStepSec: 0.5 };
    const simultaneous = runMotorStartStudyCase({
      oneLine,
      studyCase: baseCase,
      motorRows: rows,
      sequenceEvents: rows.map((row, index) => ({ id: `e${index}`, timeSec: 0, motorId: row.id, action: 'start' })),
    });
    const staggered = runMotorStartStudyCase({
      oneLine,
      studyCase: baseCase,
      motorRows: rows,
      sequenceEvents: rows.map((row, index) => ({ id: `e${index}`, timeSec: index * 8, motorId: row.id, action: 'start' })),
    });
    assert.ok(simultaneous.summary.maxVoltageSagPct > staggered.summary.maxVoltageSagPct);
  });

  it('starter types produce distinct stable current behavior', () => {
    const base = { id: 'M1', hp: 100, voltageV: 480, inertiaLbFt2: 6 };
    const rows = ['dol', 'vfd', 'soft_starter', 'wye_delta', 'autotransformer']
      .map(type => normalizeMotorStartMotorRow({ ...base, id: `M-${type}`, starterType: type }));
    const result = runMotorStartStudyCase({
      studyCase: { sourceBasis: 'manual', manualSourceImpedanceOhm: 0.05, simulationDurationSec: 8, timeStepSec: 0.5 },
      motorRows: rows,
      sequenceEvents: rows.map(row => ({ timeSec: 0, motorId: row.id, action: 'start' })),
    });
    const currents = Object.fromEntries(result.worstCaseRows.map(row => [row.starterType, row.maxStartingCurrentKA]));
    assert.ok(currents.dol > currents.vfd);
    assert.ok(currents.dol > currents.autotransformer);
    assert.ok(currents.dol > currents.wye_delta);
  });

  it('torque/load curve and inertia can flag stalled or failing starts', () => {
    const result = runMotorStartStudyCase({
      studyCase: { sourceBasis: 'manual', manualSourceImpedanceOhm: 0.03, maxAccelerationSec: 1, simulationDurationSec: 10, timeStepSec: 0.5 },
      motorRows: [{
        id: 'M-stall',
        tag: 'Crusher',
        hp: 200,
        voltageV: 480,
        inertiaLbFt2: 50,
        starterType: 'soft_starter',
        loadTorqueCurve: '0:200 50:200 100:200',
        motorTorqueCurve: '0:80 50:80 100:80',
      }],
      sequenceEvents: [{ timeSec: 0, motorId: 'M-stall', action: 'start' }],
    });
    assert.ok(['stalled', 'fail'].includes(result.worstCaseRows[0].status));
    assert.ok(result.warnings.some(warning => /stalled|voltage/i.test(warning.message)));
  });
});

describe('motor-start packaging and rendering', () => {
  it('keeps legacy motor-start maps reportable', () => {
    const pkg = buildMotorStartStudyPackage({
      projectName: 'Legacy',
      results: {
        M1: { inrushKA: 1.2, voltageSagPct: 12, accelTime: 4, starterType: 'dol' },
      },
    });
    assert.strictEqual(pkg.version, MOTOR_START_STUDY_CASE_VERSION);
    assert.strictEqual(pkg.worstCaseRows.length, 1);
    assert.ok(pkg.warnings.some(warning => warning.code === 'legacy-results'));
  });

  it('package JSON includes study case, sequence, time series, warnings, assumptions, and summary', () => {
    const result = runMotorStartStudyCase({
      oneLine,
      studyCase: { sourceBasis: 'manual', manualSourceImpedanceOhm: 0.04, simulationDurationSec: 5, timeStepSec: 0.5 },
    });
    const pkg = buildMotorStartStudyPackage({ projectName: 'Plant', results: result });
    assert.strictEqual(pkg.projectName, 'Plant');
    assert.ok(pkg.studyCase);
    assert.ok(pkg.sequenceEvents.length);
    assert.ok(pkg.timeSeriesRows.length);
    assert.ok(pkg.worstCaseRows.length);
    assert.ok(pkg.summary.motorCount >= 2);
    assert.ok(pkg.assumptions.length);
  });

  it('rendered HTML escapes user-entered motor tags, notes, and recommendations', () => {
    const pkg = buildMotorStartStudyPackage({
      projectName: '<Plant>',
      motorRows: [normalizeMotorStartMotorRow({ id: 'M1', tag: '<script>alert(1)</script>', hp: 10, notes: '<bad>' })],
      sequenceEvents: [{ timeSec: 0, motorId: 'M1', action: 'start', notes: '<note>' }],
      results: {
        timeSeriesRows: [{ timeSec: 0, activeMotorIds: ['M1'], voltagePu: 0.99, voltageSagPct: 1 }],
        worstCaseRows: [{ motorId: 'M1', motorTag: '<script>alert(1)</script>', recommendation: '<fix>', status: 'pass' }],
      },
    });
    const html = renderMotorStartStudyHTML(pkg);
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('&lt;fix&gt;'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
  });

  it('manual source impedance is preserved exactly enough for repeatable tests', () => {
    const studyCase = normalizeMotorStartStudyCase({ sourceBasis: 'manual', manualSourceImpedanceOhm: 0.123456 });
    approx(studyCase.manualSourceImpedanceOhm, 0.12346, 0.000001);
  });
});

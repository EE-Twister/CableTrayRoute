import assert from 'node:assert/strict';
import {
  buildCriticalClearingSweep,
  buildTransientStabilityPackage,
  initialRotorAngle,
  normalizeTransientDisturbanceEvents,
  normalizeTransientDynamicModelRows,
  normalizeTransientStabilityStudyCase,
  renderTransientStabilityHTML,
  runTransientStabilityStudyCase,
  simulateSwingEquation,
} from '../analysis/transientStability.mjs';

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

const studyCase = {
  caseName: 'Generator <Trip> Case',
  frequencyHz: 60,
  clearingTimeSec: 0.08,
  simulationDurationSec: 0.6,
  timeStepSec: 0.002,
  channelIntervalSec: 0.05,
  cctMarginWarnSec: 0.03,
  rotorAngleWarnDeg: 130,
  reportPreset: 'dynamicStudy',
};

const dynamicModels = [
  {
    id: 'gen-1',
    tag: 'Main <Generator>',
    modelType: 'synchronousGenerator',
    H: 5,
    frequencyHz: 60,
    Pm: 1,
    Pmax_pre: 2.1,
    Pmax_fault: 0.6,
    Pmax_post: 1.75,
    exciterModel: 'AVR <placeholder>',
  },
  {
    id: 'motor-1',
    tag: 'Motor <A>',
    modelType: 'inductionMotor',
    busId: 'mcc-1',
  },
];

const disturbanceEvents = [
  { id: 'clear-1', eventType: 'clearFault', timeSec: 0.08, targetId: 'gen-1', notes: 'Breaker <clears>' },
  { id: 'fault-1', eventType: 'fault', timeSec: 0, targetId: 'gen-1', faultType: 'threePhase' },
  { id: 'load-1', eventType: 'loadStep', timeSec: 0.2, targetId: 'gen-1', loadStepPct: 0 },
];

describe('transient stability study case package', () => {
  it('preserves legacy swing-equation helper behavior', () => {
    const delta0 = initialRotorAngle(1, 2.1);
    const result = simulateSwingEquation({
      H: 5,
      f: 60,
      Pm: 1,
      Pmax_pre: 2.1,
      Pmax_fault: 0.6,
      Pmax_post: 1.75,
      delta0,
      t_clear: 0.08,
      t_end: 0.6,
      dt: 0.002,
    });
    assert.equal(result.stable, true);
    assert(result.deltaMax_deg < 180);
  });

  it('normalizes study-case defaults and rejects invalid presets', () => {
    const normalized = normalizeTransientStabilityStudyCase({});
    assert.equal(normalized.frequencyHz, 60);
    assert.equal(normalized.reportPreset, 'dynamicStudy');
    assert.throws(() => normalizeTransientStabilityStudyCase({ reportPreset: 'bad' }), /report preset/);
    assert.throws(() => normalizeTransientStabilityStudyCase({ clearingTimeSec: 2, simulationDurationSec: 1 }), /clearingTimeSec/);
  });

  it('normalizes dynamic model rows and flags metadata-only rows', () => {
    const rows = normalizeTransientDynamicModelRows(dynamicModels, { studyCase });
    assert.equal(rows[0].modelType, 'synchronousGenerator');
    assert.equal(rows[0].tag, 'Main <Generator>');
    assert.equal(rows[1].modelType, 'inductionMotor');
    assert(rows[1].missingFields.includes('H'));
    assert.throws(() => normalizeTransientDynamicModelRows([{ modelType: 'badModel' }]), /dynamic model type/);
  });

  it('normalizes disturbance events in deterministic time order and rejects invalid events', () => {
    const rows = normalizeTransientDisturbanceEvents(disturbanceEvents);
    assert.deepEqual(rows.map(row => row.id), ['fault-1', 'clear-1', 'load-1']);
    assert.throws(() => normalizeTransientDisturbanceEvents([{ eventType: 'badEvent' }]), /disturbance event type/);
    assert.throws(() => normalizeTransientDisturbanceEvents([{ eventType: 'fault', timeSec: -1 }]), /timeSec/);
  });

  it('runs study cases into stable and unstable scenario rows', () => {
    const stable = runTransientStabilityStudyCase({ studyCase, dynamicModels, disturbanceEvents });
    const stableScenario = stable.scenarioRows.find(row => row.modelId === 'gen-1');
    assert.equal(stableScenario.stable, true);
    assert.equal(stableScenario.status, 'pass');
    assert(stable.channelRows.length > 3);
    assert(stable.warningRows.some(row => row.code === 'unsupportedDynamicModel'));
    assert(stable.warningRows.some(row => row.code === 'unsupportedControlModel'));

    const unstable = runTransientStabilityStudyCase({
      studyCase: { ...studyCase, clearingTimeSec: 1, simulationDurationSec: 2 },
      dynamicModels,
      disturbanceEvents: [
        { id: 'fault-1', eventType: 'fault', timeSec: 0, targetId: 'gen-1' },
        { id: 'clear-1', eventType: 'clearFault', timeSec: 1, targetId: 'gen-1' },
      ],
    });
    assert.equal(unstable.scenarioRows[0].status, 'fail');
  });

  it('builds deterministic CCT sweep rows and classifies low margin', () => {
    const sweep = buildCriticalClearingSweep({ studyCase, dynamicModels, disturbanceEvents });
    assert.equal(sweep.length, 1);
    assert(sweep[0].cctSec > sweep[0].clearingTimeSec);
    assert(['pass', 'warn', 'fail'].includes(sweep[0].status));

    const failSweep = buildCriticalClearingSweep({
      studyCase: { ...studyCase, clearingTimeSec: 1, simulationDurationSec: 2 },
      dynamicModels,
      disturbanceEvents: [
        { id: 'fault-1', eventType: 'fault', timeSec: 0, targetId: 'gen-1' },
        { id: 'clear-1', eventType: 'clearFault', timeSec: 1, targetId: 'gen-1' },
      ],
    });
    assert.equal(failSweep[0].status, 'fail');
  });

  it('builds package JSON with summaries, channel rows, warnings, and escaped HTML', () => {
    const pkg = buildTransientStabilityPackage({
      projectName: 'North <Unit>',
      studyCase,
      dynamicModels,
      disturbanceEvents,
      generatedAt: '2026-04-27T12:00:00.000Z',
    });
    assert.equal(pkg.version, 'transient-stability-study-case-v1');
    assert.equal(pkg.summary.modelCount, 2);
    assert.equal(pkg.summary.eventCount, 3);
    assert(pkg.channelRows.every(row => Number.isFinite(row.timeSec)));
    assert(pkg.warningRows.length > 0);

    const html = renderTransientStabilityHTML(pkg);
    assert(html.includes('Transient Stability Study Basis'));
    assert(html.includes('Main &lt;Generator&gt;'));
    assert(!html.includes('Main <Generator>'));
    assert(!html.includes('Breaker <clears>'));
  });
});

import assert from 'node:assert/strict';
import {
  buildCapacitorBankDutyPackage,
  buildCapacitorControllerRows,
  buildCapacitorProtectionRows,
  evaluateCapacitorDuty,
  normalizeCapacitorBankDutyCase,
  normalizeCapacitorStageRows,
  renderCapacitorBankDutyHTML,
  runCapacitorBankAnalysis,
} from '../analysis/capacitorBank.mjs';

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
  busLabel: 'Main <LV>',
  pKw: 1000,
  pfExisting: 0.8,
  pfTarget: 0.95,
  voltageKv: 0.48,
  kvaScMva: 10,
  dominantHarmonics: [5, 7],
};

describe('capacitor bank duty package', () => {
  it('keeps legacy capacitor-bank results readable', () => {
    const legacy = runCapacitorBankAnalysis(baseInputs);
    const pkg = buildCapacitorBankDutyPackage({ capacitorBank: legacy, dutyCase: { topology: 'detuned', reactorPercent: 5.67 } });
    assert.equal(pkg.version, 'capacitor-bank-duty-v1');
    assert.equal(pkg.baseResult.kvarRequired, legacy.kvarRequired);
    assert(pkg.stageRows.length > 0);
  });

  it('normalizes duty cases and rejects invalid numeric values', () => {
    const duty = normalizeCapacitorBankDutyCase({
      busLabel: 'CAP <A>',
      voltageKv: 0.48,
      topology: 'detuned',
      reactorPercent: 5.67,
      controlMode: 'manual',
      targetHarmonics: [5, '7'],
    });
    assert.equal(duty.topology, 'detuned');
    assert.equal(duty.controlMode, 'manual');
    assert.deepEqual(duty.targetHarmonics, [5, 7]);
    assert.throws(() => normalizeCapacitorBankDutyCase({ voltageKv: -1 }), /voltageKv/);
    assert.throws(() => normalizeCapacitorBankDutyCase({ targetPowerFactor: 1.2 }), /targetPowerFactor/);
  });

  it('normalizes stage rows and rolls up controller totals deterministically', () => {
    const stages = normalizeCapacitorStageRows([
      { id: 's2', label: 'Stage <2>', kvar: 200, voltageRatingKv: 0.6, switchingDevice: 'vacuum contactor', stepOrder: 2, enabled: true, dischargeTimeSec: 45 },
      { id: 's1', label: 'Stage 1', kvar: 100, voltageRatingKv: 0.6, switchingDevice: 'contactor', stepOrder: 1, enabled: true, dischargeTimeSec: 60 },
    ], { dutyCase: { voltageKv: 0.48 } });
    assert.equal(stages[0].id, 's1');
    const controller = buildCapacitorControllerRows({ voltageKv: 0.48, minimumStepKvar: 50 }, { stageRows: stages })[0];
    assert.equal(controller.totalEnabledKvar, 300);
    assert.equal(controller.status, 'pass');
  });

  it('classifies plain resonance danger and detuned review rows', () => {
    const baseResult = runCapacitorBankAnalysis({ ...baseInputs, kvaScMva: 15 });
    const stages = normalizeCapacitorStageRows([{ id: 's1', kvar: 600, voltageRatingKv: 0.6, switchingDevice: 'contactor', stepOrder: 1, dischargeTimeSec: 60 }], { dutyCase: { voltageKv: 0.48 } });
    const plain = evaluateCapacitorDuty({ baseResult, dutyCase: { voltageKv: 0.48, topology: 'plain' }, stageRows: stages });
    const detuned = evaluateCapacitorDuty({ baseResult, dutyCase: { voltageKv: 0.48, topology: 'detuned', reactorPercent: 5.67 }, stageRows: stages });
    assert.equal(plain.dutyRows.find(row => row.checkType === 'resonanceDetuning').status, 'fail');
    assert.equal(detuned.dutyRows.find(row => row.checkType === 'resonanceDetuning').status, 'warn');
  });

  it('checks RMS current, voltage rating, switching, and discharge limits', () => {
    const baseResult = runCapacitorBankAnalysis(baseInputs);
    const pkg = buildCapacitorBankDutyPackage({
      baseResult,
      dutyCase: { voltageKv: 0.69, topology: 'plain', inrushLimitA: 100, dischargeLimitSec: 30 },
      stageRows: [{ id: 's1', label: 'Stage 1', kvar: 600, voltageRatingKv: 0.6, switchingDevice: 'contactor', stepOrder: 1, dischargeTimeSec: 90 }],
    });
    assert(pkg.dutyRows.some(row => row.checkType === 'voltageRating' && row.status === 'fail'));
    assert(pkg.dutyRows.some(row => row.checkType === 'dischargeTime' && row.status === 'fail'));
    assert(pkg.switchingRows.some(row => row.status === 'fail'));
  });

  it('builds protection rows and missing-data warnings', () => {
    const rows = buildCapacitorProtectionRows({
      dutyCase: { voltageKv: 0.48 },
      stageRows: [{ enabled: true }],
      dutyRows: [{ status: 'pass' }],
    });
    assert(rows.some(row => row.status === 'missingData'));
    assert(rows.some(row => row.protectionType === 'unbalanceProtection' && row.status === 'warn'));
  });

  it('links frequency-scan and harmonic context into the package', () => {
    const pkg = buildCapacitorBankDutyPackage({
      inputs: baseInputs,
      frequencyScan: { resonances: [{ h: 4.8, type: 'parallel', risk: 'danger' }] },
      harmonicStudy: { filterAlternatives: [{ id: 'f1', name: 'Filter <A>', targetHarmonics: [5], frequencyScanResonanceRisk: 'danger', status: 'recommended' }] },
    });
    assert(pkg.frequencyScanLinks.some(row => row.source === 'frequencyScan' && row.status === 'fail'));
    assert(pkg.frequencyScanLinks.some(row => row.source === 'harmonicStudy'));
  });

  it('renders escaped HTML for labels and recommendations', () => {
    const pkg = buildCapacitorBankDutyPackage({
      inputs: baseInputs,
      stageRows: [{ id: 's1', label: 'Stage <A>', kvar: 600, voltageRatingKv: 0.6, switchingDevice: 'contactor <x>', notes: 'Note <bad>' }],
    });
    const html = renderCapacitorBankDutyHTML(pkg);
    assert(html.includes('Main &lt;LV&gt;'));
    assert(html.includes('Stage &lt;A&gt;'));
    assert(!html.includes('Stage <A>'));
  });
});

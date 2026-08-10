import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyLoadFlowResultsToDiagram,
  applyShortCircuitResultsToDiagram,
  createStudyExecutionController
} from '../src/one-line/studyExecutionController.mjs';

describe('One-Line study execution controller', () => {
  it('applies bus voltage and line loading results to canonical diagram records', () => {
    const oneLine = {
      sheets: [{ components: [{ id: 'bus', connections: [{ target: 'load', loading_kW: 1 }] }, { id: 'load' }] }]
    };
    applyLoadFlowResultsToDiagram(oneLine, {
      buses: [{ id: 'bus', Vm: 0.99, Va: -1, baseKV: 0.48 }],
      lines: [{ from: 'bus', to: 'load', P: 25.123, amps: 31.26, dropPct: 1.234, fromKV: 0.48, toKV: 0.474 }]
    });
    const bus = oneLine.sheets[0].components[0];
    assert.equal(bus.voltage_mag, 0.99);
    assert.equal(bus.voltage_v, 475.2);
    assert.equal(bus.connections[0].loading_kW, 25.12);
    assert.equal(bus.connections[0].loading_amps, 31.3);
    assert.equal(bus.connections[0].voltage_drop_pct, 1.23);
  });

  it('runs short circuit through revision guards and persists study provenance', async () => {
    const oneLine = { activeSheet: 0, sheets: [{ components: [{ id: 'source', connections: [{ target: 'load' }] }, { id: 'load' }] }] };
    const studies = {};
    const calls = [];
    const controller = createStudyExecutionController({
      buttons: {},
      getOneLine: () => oneLine,
      setOneLine: value => calls.push(['oneLine', value]),
      getStudies: () => studies,
      setStudies: value => calls.push(['studies', value]),
      getStudySettings: () => ({ loadFlow: {}, shortCircuit: { method: 'IEC' } }),
      getActiveSheet: () => 0,
      getProtectiveDeviceCatalog: () => ({}),
      loadReferencedProtectiveDevices: async () => ({}),
      runLoadFlow: async () => ({}),
      runShortCircuitOffMain: async () => ({ source: { threePhaseKA: 10 }, load: { threePhaseKA: 5 } }),
      runShortCircuit: () => ({}),
      runArcFlash: async () => ({}),
      runHarmonics: () => ({}),
      runNetworkHarmonics: () => ({}),
      runMotorStart: () => ({}),
      runReliability: async () => ({}),
      assertSheetsUnchanged: () => oneLine,
      getSheetsRevision: () => 'revision',
      recordProvenance: (value, key) => { value.meta = key; },
      updateCableOperatingVoltages: () => {},
      markScheduleReconcilePending: () => {},
      renderStudyResults: () => calls.push(['renderResults']),
      renderLoadFlowResults: () => {},
      render: () => calls.push(['render']),
      generateArcFlashReport: () => {},
      openLabelPrintWindow: () => {},
      highlightSPF: () => {},
      showAlertModal: () => {},
      windowRef: { open() {} }
    });
    await controller.runShortCircuitStudy();
    assert.equal(oneLine.sheets[0].components[0].shortCircuit.threePhaseKA, 10);
    assert.equal(oneLine.sheets[0].components[0].connections[0].faultKA, 5);
    assert.equal(studies.meta, 'shortCircuit');
    assert.deepEqual(calls.map(call => call[0]), ['oneLine', 'studies', 'renderResults', 'render']);
    assert.deepEqual(applyShortCircuitResultsToDiagram({ sheets: [] }, {}), { diagram: [], sheets: [] });
  });
});

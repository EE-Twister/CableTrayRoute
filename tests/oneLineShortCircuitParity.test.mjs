/**
 * The One-Line "Short Circuit" button runs in a worker (no storage) while
 * "Arc Flash" computes its short-circuit basis on the main thread. Both must
 * see the same Cable Schedule and produce identical fault currents.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const store = {};
globalThis.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; },
  key: index => Object.keys(store)[index] ?? null,
  get length() { return Object.keys(store).length; },
};

const dataStore = await import('../dataStore.mjs');
const { runShortCircuit } = await import('../analysis/shortCircuit.mjs');
const { createStudyExecutionController } = await import('../src/one-line/studyExecutionController.mjs');

// Mirror of the onelineWorker.js handler: components are extracted from the
// shipped one-line and the solver never touches storage.
function workerRunShortCircuit(oneLineData, opts) {
  const comps = oneLineData.sheets.flatMap(sheet => sheet.components)
    .filter(c => c && c.type !== 'annotation' && c.type !== 'dimension');
  const trap = () => { throw new Error('worker touched storage'); };
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem: trap, setItem: trap, removeItem: trap, key: trap, length: 0 };
  try {
    return structuredClone(runShortCircuit(structuredClone(comps), structuredClone(opts)));
  } finally {
    globalThis.localStorage = saved;
  }
}

describe('One-Line short-circuit parity', () => {
  it('standalone and arc-flash short-circuit runs include the Cable Schedule identically', async () => {
    dataStore.setCables([{
      tag: 'CBL-SWBD-MCC', from: 'SWBD-1', to: 'MCC-1', conductor_size: '#4 AWG',
      conductor_material: 'Copper', raceway_material: 'PVC', length_ft: 100,
    }]);
    dataStore.setOneLine({
      activeSheet: 0,
      sheets: [{
        name: 'S1',
        components: [
          { id: 'source', type: 'source', subtype: 'utility_source', label: 'SWBD-1', equipmentRef: 'SWBD-1',
            voltage: 480, thevenin_mva: 20, xr_ratio: 10, connections: [{ target: 'load_bus' }] },
          { id: 'load_bus', type: 'equipment', label: 'MCC-1', equipmentRef: 'MCC-1', voltage: 480 },
        ],
      }],
    });

    const noop = () => {};
    const controller = createStudyExecutionController({
      buttons: {},
      getOneLine: dataStore.getOneLine,
      setOneLine: dataStore.setOneLine,
      getStudies: dataStore.getStudies,
      setStudies: dataStore.setStudies,
      getStudySettings: () => ({ loadFlow: {}, shortCircuit: { method: 'ANSI' } }),
      getActiveSheet: () => 0,
      getProtectiveDeviceCatalog: () => [],
      loadReferencedProtectiveDevices: async () => [],
      getCables: dataStore.getCables,
      getTccSettings: () => dataStore.getItem('tccSettings', null),
      runLoadFlow: async () => ({}),
      runShortCircuitOffMain: async (oneLine, opts) => workerRunShortCircuit(oneLine, opts),
      runShortCircuit,
      runArcFlash: async () => ({}),
      runHarmonics: () => ({}),
      runNetworkHarmonics: () => ({}),
      runMotorStart: () => ({}),
      runReliability: async () => ({}),
      assertSheetsUnchanged: () => dataStore.getOneLine(),
      getSheetsRevision: () => 'revision',
      recordProvenance: noop,
      updateCableOperatingVoltages: noop,
      markScheduleReconcilePending: noop,
      renderStudyResults: noop,
      renderLoadFlowResults: noop,
      render: noop,
      generateArcFlashReport: noop,
      openLabelPrintWindow: noop,
      highlightSPF: noop,
      showAlertModal: noop,
      windowRef: { open: noop },
    });

    const standalone = await controller.runShortCircuitStudy();
    const { shortCircuit: arcFlashBasis } = await controller.runArcFlashStudy();
    assert.deepEqual(standalone, arcFlashBasis);
    assert.equal(standalone.load_bus.impedanceProvenance.segments.at(-1).source, 'Cable Schedule');
    assert.ok(standalone.load_bus.threePhaseKA < standalone.source.threePhaseKA);
  });
});

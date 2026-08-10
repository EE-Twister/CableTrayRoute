import assert from 'node:assert/strict';
import { resolveComponentAttribute } from '../src/one-line/componentAttributes.mjs';
import { createStudyExecutionController } from '../src/one-line/studyExecutionController.mjs';

const studyAttributeResolvers = {
  arcFlash: comp => comp.studyResults?.arcFlash?.[comp.id] || null,
  shortCircuit: comp => comp.studyResults?.shortCircuit?.[comp.id] || null,
  reliability: comp => comp.studyResults?.reliability?.componentStats?.[comp.id] || null,
};

const importedComponent = {
  id: 'PANEL-1',
  reliability: { availability: 0.001, downtime: 8760 },
  shortCircuit: { threePhaseKA: 0.02 },
  arcFlash: { incidentEnergy: 0.03 },
  props: {
    reliability: { availability: 0.002 },
    shortCircuit: { threePhaseKA: 0.04 },
    arcFlash: { incidentEnergy: 0.05 },
  },
  studyResults: {
    reliability: { componentStats: { 'PANEL-1': { availability: 0.990099, downtime: 87.6 } } },
    shortCircuit: { 'PANEL-1': { threePhaseKA: 42.5 } },
    arcFlash: { 'PANEL-1': { incidentEnergy: 18.7 } },
  },
};

assert.equal(
  resolveComponentAttribute(importedComponent, 'reliability.availability', { studyAttributeResolvers }),
  0.990099,
  'calculated reliability results should take precedence over imported component reliability fields',
);
assert.equal(
  resolveComponentAttribute(importedComponent, 'shortCircuit.threePhaseKA', { studyAttributeResolvers }),
  42.5,
  'calculated short-circuit results should take precedence over imported component shortCircuit fields',
);
assert.equal(
  resolveComponentAttribute(importedComponent, 'arcFlash.incidentEnergy', { studyAttributeResolvers }),
  18.7,
  'calculated arc-flash results should take precedence over imported component arcFlash fields',
);
assert.equal(
  resolveComponentAttribute({ custom: { value: 12 } }, 'custom.value'),
  12,
  'non-study dotted component fields should still resolve from the component object',
);

function createGuardHarness() {
  const calls = [];
  const oneLine = {
    activeSheet: 0,
    sheets: [{ components: [{ id: 'source', connections: [{ target: 'load' }] }, { id: 'load' }] }]
  };
  const studies = {};
  const controller = createStudyExecutionController({
    buttons: {},
    getOneLine: () => oneLine,
    setOneLine: () => calls.push('write-one-line'),
    getStudies: () => studies,
    setStudies: () => calls.push('write-studies'),
    getStudySettings: () => ({ loadFlow: {}, shortCircuit: { method: 'IEC' } }),
    getActiveSheet: () => 0,
    getProtectiveDeviceCatalog: () => ({}),
    loadReferencedProtectiveDevices: async () => ({}),
    runLoadFlow: async () => {
      calls.push('run-load-flow');
      return { buses: [], lines: [] };
    },
    runShortCircuitOffMain: async () => {
      calls.push('run-short-circuit');
      return {};
    },
    runShortCircuit: () => ({}),
    runArcFlash: async () => ({}),
    runHarmonics: () => ({}),
    runNetworkHarmonics: () => ({}),
    runMotorStart: () => ({}),
    runReliability: async () => {
      calls.push('run-reliability');
      return { n1Failures: [] };
    },
    assertSheetsUnchanged: () => {
      calls.push('guard');
      return oneLine;
    },
    getSheetsRevision: () => {
      calls.push('revision');
      return 'revision';
    },
    recordProvenance: () => {},
    updateCableOperatingVoltages: () => {},
    markScheduleReconcilePending: () => {},
    renderStudyResults: () => {},
    renderLoadFlowResults: () => {},
    render: () => {},
    generateArcFlashReport: () => {},
    openLabelPrintWindow: () => {},
    highlightSPF: () => {},
    showAlertModal: () => {},
    windowRef: { open() {} }
  });
  return { calls, controller };
}

for (const [method, runCall, writeCall] of [
  ['runLoadFlowStudy', 'run-load-flow', 'write-one-line'],
  ['runShortCircuitStudy', 'run-short-circuit', 'write-one-line'],
  ['runReliabilityStudy', 'run-reliability', 'write-studies']
]) {
  const { calls, controller } = createGuardHarness();
  await controller[method]();
  const revisionIndex = calls.indexOf('revision');
  const runIndex = calls.indexOf(runCall);
  const guardIndex = calls.indexOf('guard');
  const writeIndex = calls.indexOf(writeCall);
  assert.ok(revisionIndex !== -1 && revisionIndex < runIndex, `${method} should capture the one-line revision before awaiting results`);
  assert.ok(guardIndex !== -1 && runIndex < guardIndex, `${method} should validate the one-line revision after results resolve`);
  assert.ok(writeIndex !== -1 && guardIndex < writeIndex, `${method} should validate the one-line revision before writing results`);
}

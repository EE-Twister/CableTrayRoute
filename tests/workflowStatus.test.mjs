import assert from 'node:assert/strict';

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};
global.window = { addEventListener() {} };

const {
  READINESS_VOCABULARY,
  workflowOrder,
  getStepStatus,
  getCableReadiness,
  getWorkflowStepForPage,
  getWorkflowPageModeContext,
  getContractReadinessCopy
} = await import('../src/workflowStatus.js?cache=' + Date.now());

const emptyOverrides = {
  equipment: [],
  loads: [{}],
  oneLine: { activeSheet: 0, sheets: [] },
  cables: [],
  trays: [],
  conduits: [],
  ductbanks: [],
  studies: {},
  lifecyclePackages: [],
  reportSnapshots: {}
};

assert.deepStrictEqual(
  workflowOrder.map(step => step.key),
  ['equipmentList', 'loadList', 'oneLineDiagram', 'cableSchedule', 'racewaySchedule', 'fillRouting', 'studies', 'deliverables']
);

assert.equal(getStepStatus('equipmentList', emptyOverrides).complete, false);
assert.equal(getStepStatus('loadList', emptyOverrides).complete, false);
assert.equal(getStepStatus('oneLineDiagram', emptyOverrides).complete, false);
assert.equal(getStepStatus('cableSchedule', emptyOverrides).complete, false);

const partialCable = {
  tag: 'C-101',
  from: 'MCC-1',
  to: 'P-1',
  conductor_size: '2/0 AWG',
  length: 125
};
assert.deepStrictEqual(getCableReadiness([partialCable]), {
  total: 1,
  scheduleReady: 1,
  routingReady: 0,
  missingSchedule: 0,
  missingRaceway: 1
});
assert.equal(getStepStatus('cableSchedule', { ...emptyOverrides, cables: [partialCable] }).complete, true);
assert.equal(getStepStatus('fillRouting', { ...emptyOverrides, cables: [partialCable], trays: [{ tray_id: 'TR-1' }] }).complete, false);

const completeOverrides = {
  equipment: [{ id: 'MCC-1' }],
  loads: [{ id: 'MTR-1', kw: 25 }],
  oneLine: { activeSheet: 0, sheets: [{ name: 'S1', components: [{ id: 'mcc-1' }] }] },
  cables: [{ ...partialCable, raceway_id: 'TR-1' }],
  trays: [{ tray_id: 'TR-1' }],
  conduits: [],
  ductbanks: [],
  studies: { loadFlow: { buses: [] } },
  lifecyclePackages: [{ id: 'pkg-1' }],
  reportSnapshots: {}
};

workflowOrder.forEach(step => {
  assert.equal(getStepStatus(step.key, completeOverrides).complete, true, `${step.key} should be complete`);
});
assert.equal(getWorkflowStepForPage('optimalRoute.html').key, 'fillRouting');
assert.equal(getWorkflowStepForPage('projectreport.html').key, 'deliverables');

const cableMode = getWorkflowPageModeContext('cableschedule.html', { ...emptyOverrides, cables: [partialCable] });
assert.equal(cableMode.standalone.available, true);
assert.equal(cableMode.standalone.label, 'Standalone');
assert.equal(cableMode.project.step.key, 'cableSchedule');
assert.equal(cableMode.project.tone, 'ready');
assert.equal(cableMode.project.nextStep.key, 'racewaySchedule');
assert.equal(cableMode.project.readiness.terms, READINESS_VOCABULARY);
assert.equal(cableMode.project.readiness.readyWhen, 'Every workflow cable row has tag, from/to, conductor size, and length.');
assert.equal(cableMode.project.readiness.downstreamText.includes('Raceway Schedule'), true);
assert.equal(cableMode.project.detail.startsWith(`${READINESS_VOCABULARY.ready}: `), true);

const routeMode = getWorkflowPageModeContext('optimalRoute.html', { ...emptyOverrides, cables: [partialCable], trays: [{ tray_id: 'TR-1' }] });
assert.equal(routeMode.project.step.key, 'fillRouting');
assert.equal(routeMode.project.tone, 'attention');
assert.equal(routeMode.project.primaryHref, 'cabletrayfill.html');
assert.equal(routeMode.project.status, READINESS_VOCABULARY.missingInputs);
assert.equal(routeMode.project.detail.startsWith(`${READINESS_VOCABULARY.missingInputs}: `), true);

const dashboardMode = getWorkflowPageModeContext('workflowdashboard.html', completeOverrides);
assert.equal(dashboardMode.isDashboard, true);
assert.equal(dashboardMode.project.status, '8 of 8 ready');
assert.equal(dashboardMode.project.tone, 'ready');
assert.equal(dashboardMode.project.detail, `${READINESS_VOCABULARY.ready}: All workflow steps are complete.`);

assert.equal(getWorkflowPageModeContext('help.html'), null);

const reportCopy = getContractReadinessCopy('projectreport.html');
assert.equal(reportCopy.messages.ready.startsWith(`${READINESS_VOCABULARY.ready}: `), true);
assert.equal(reportCopy.messages.missingInputs.startsWith(`${READINESS_VOCABULARY.missingInputs}: `), true);
assert.equal(reportCopy.messages.downstreamHandoff.startsWith(`${READINESS_VOCABULARY.downstreamHandoff}: `), true);
assert.equal(reportCopy.downstreamText, 'Submittal Package');

console.log('✓ workflow status');

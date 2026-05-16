import assert from 'node:assert/strict';

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};
global.window = { addEventListener() {} };

const {
  workflowOrder,
  getStepStatus,
  getCableReadiness,
  getWorkflowStepForPage
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

console.log('✓ workflow status');

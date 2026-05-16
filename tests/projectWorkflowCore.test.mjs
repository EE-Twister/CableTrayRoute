import assert from 'node:assert/strict';

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

const { buildWorkflowCoreDiagnostics } = await import('../analysis/projectWorkflowCore.mjs?cache=' + Date.now());

const empty = buildWorkflowCoreDiagnostics({
  equipment: [],
  loads: [],
  oneLine: { activeSheet: 0, sheets: [] },
  cables: [],
  trays: [],
  conduits: [],
  ductbanks: [],
  studies: {},
  reportSnapshots: {},
  deliverables: []
});

assert.equal(empty.nextAction.href, 'equipmentlist.html');
assert(empty.blockers.some(item => item.step === 'Equipment List' && item.severity === 'critical'));
assert(empty.blockers.some(item => item.step === 'Load List' && item.severity === 'critical'));

const partial = buildWorkflowCoreDiagnostics({
  equipment: [{ tag: 'SWBD-101', voltage: '480', manufacturer: 'Square D' }],
  loads: [{ source: 'SWBD-101', tag: 'PMP-101', kw: '18.6', voltage: '480', powerFactor: '0.85', phases: '3' }],
  oneLine: { activeSheet: 0, sheets: [{ components: [{ id: 'swbd' }] }] },
  cables: [{ tag: 'CBL-1', from: 'SWBD-101', to: 'PMP-101', conductor_size: '3-#4 CU', length: 80 }],
  trays: [],
  conduits: [],
  ductbanks: [],
  studies: {},
  reportSnapshots: {},
  deliverables: [],
  reconcilePending: true
});

assert.equal(partial.health.reconcilePending, true);
assert(partial.blockers.some(item => item.label === 'Reconcile one-line schedule changes'));
assert(partial.blockers.some(item => item.step === 'Raceway Schedule'));
assert.equal(partial.health.scheduleReady, 1);
assert.equal(partial.health.routingReady, 0);

const complete = buildWorkflowCoreDiagnostics({
  equipment: [{ tag: 'SWBD-101', voltage: '480', manufacturer: 'Square D' }],
  loads: [{ source: 'SWBD-101', tag: 'PMP-101', kw: '18.6', voltage: '480', powerFactor: '0.85', phases: '3' }],
  oneLine: { activeSheet: 0, sheets: [{ components: [{ id: 'swbd' }] }] },
  cables: [{ tag: 'CBL-1', from: 'SWBD-101', to: 'PMP-101', conductor_size: '3-#4 CU', length: 80, raceway_id: 'TR-1' }],
  trays: [{ tray_id: 'TR-1' }],
  conduits: [],
  ductbanks: [],
  studies: { demandSchedule: { status: 'Run' } },
  reportSnapshots: { report: { id: 'report' } },
  deliverables: [{ id: 'pkg' }]
});

assert.equal(complete.nextAction.href, 'projectreport.html');
assert.equal(complete.blockers.filter(item => item.severity === 'critical').length, 0);
assert.equal(complete.health.routingReady, 1);

console.log('✓ project workflow core');

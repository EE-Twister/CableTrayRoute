import assert from 'node:assert/strict';

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

const {
  buildComplianceMatrix,
  buildGuidedWorkflowRunner,
  buildMissingInformationPrompts,
  buildWorkflowCoreDiagnostics
} = await import('../analysis/projectWorkflowCore.mjs?cache=' + Date.now());
const { buildMinimalDesignAutomation } = await import('../analysis/workflowAutomation.mjs?cache=' + Date.now());
const { buildDesignBasisReview, normalizeDesignBasis, summarizeDesignBasis } = await import('../analysis/designBasis.mjs?cache=' + Date.now());

const savedDesignBasis = normalizeDesignBasis({
  codeBasis: {
    primaryCode: 'NEC',
    edition: '2023',
    jurisdiction: 'Texas',
    ahj: 'Owner Electrical Authority',
    unitSystem: 'imperial'
  },
  studyPrerequisites: {
    requireUtilityFault: false,
    requireProtectiveDeviceSettings: false,
    requireEquipmentCoordinates: false,
    requireArcFlashInputs: false
  },
  approvalRules: {
    generatedRecordsRequireReview: false,
    routeResultsRequireReview: false,
    studiesRequireReview: false,
    releaseRequiresReviewer: true,
    reviewer: 'Electrical Lead'
  },
  updatedAt: '2026-05-20T00:00:00.000Z'
});

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
assert(empty.blockers.some(item => item.step === 'Design Basis' && item.severity === 'warning'));

const emptyGuided = buildGuidedWorkflowRunner({
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

assert.equal(emptyGuided.currentStep.id, 'designBasis');
assert.equal(emptyGuided.readyForAutoBuild, false);
assert(emptyGuided.prompts.some(item => item.label.includes('Design Basis')));
assert(emptyGuided.compliance.summary.fail > 0);

const emptyPrompts = buildMissingInformationPrompts({
  equipment: [],
  loads: [],
  oneLine: { activeSheet: 0, sheets: [] },
  cables: [],
  trays: [],
  conduits: [],
  ductbanks: [],
  studies: {}
});
assert(emptyPrompts.some(item => item.href === 'equipmentlist.html'));
assert(emptyPrompts.some(item => item.href === 'loadlist.html'));

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

const autoBuildGuided = buildGuidedWorkflowRunner({
  equipment: [{ tag: 'SWBD-101', voltage: '480', manufacturer: 'Square D' }],
  loads: [{ source: 'SWBD-101', tag: 'PMP-101', kw: '18.6', voltage: '480', powerFactor: '0.85', phases: '3' }],
  oneLine: { activeSheet: 0, sheets: [] },
  cables: [],
  trays: [],
  conduits: [],
  ductbanks: [],
  studies: {},
  reportSnapshots: {},
  deliverables: [],
  designBasis: savedDesignBasis
});
assert.equal(autoBuildGuided.readyForAutoBuild, true);
assert.equal(autoBuildGuided.autoBuildRecommended, true);
assert.equal(autoBuildGuided.currentStep.id, 'autoBuild');

const autoBuildMatrix = buildComplianceMatrix({
  equipment: [{ tag: 'SWBD-101', voltage: '480', manufacturer: 'Square D' }],
  loads: [{ source: 'SWBD-101', tag: 'PMP-101', kw: '18.6', voltage: '480', powerFactor: '0.85', phases: '3' }],
  oneLine: { activeSheet: 0, sheets: [] },
  cables: [],
  trays: [],
  conduits: [],
  ductbanks: [],
  studies: {},
  reportSnapshots: {},
  deliverables: [],
  designBasis: savedDesignBasis
});
assert(autoBuildMatrix.groups.some(group => group.id === 'model' && group.status === 'warn'));

const complete = buildWorkflowCoreDiagnostics({
  equipment: [{ tag: 'SWBD-101', voltage: '480', manufacturer: 'Square D' }],
  loads: [{ source: 'SWBD-101', tag: 'PMP-101', kw: '18.6', voltage: '480', powerFactor: '0.85', phases: '3' }],
  oneLine: { activeSheet: 0, sheets: [{ components: [{ id: 'swbd' }] }] },
  cables: [{ tag: 'CBL-1', from: 'SWBD-101', to: 'PMP-101', conductor_size: '3-#4 CU', length: 80, raceway_id: 'TR-1' }],
  trays: [{ tray_id: 'TR-1', start_x: 0, start_y: 0, start_z: 10, end_x: 80, end_y: 0, end_z: 10, inside_width: 12, tray_depth: 4 }],
  conduits: [],
  ductbanks: [],
  routeResults: [{
    cable: 'CBL-1',
    status: 'Routed',
    total_length: 80,
    breakdown: [{ tray_id: 'TR-1', length: 80, start: [0, 0, 10], end: [80, 0, 10] }],
    route_segments: [{ type: 'straight', tray_id: 'TR-1', length: 80, start: [0, 0, 10], end: [80, 0, 10] }]
  }],
  studies: { demandSchedule: { status: 'Run' } },
  reportSnapshots: { report: { id: 'report' } },
  deliverables: [{ id: 'pkg' }],
  designBasis: savedDesignBasis
});

assert.equal(complete.nextAction.href, 'projectreport.html');
assert.equal(complete.blockers.filter(item => item.severity === 'critical').length, 0);
assert.equal(complete.health.routingReady, 1);
assert.equal(complete.health.designBasis, 'Configured');

const automated = buildMinimalDesignAutomation({
  equipment: [
    { tag: 'SWBD-101', voltage: '480', category: 'Distribution', subCategory: 'Switchboard', x: 0, y: 0, z: 0 },
    { tag: 'PMP-101', voltage: '480', category: 'Mechanical Load', subCategory: 'Pump', x: 80, y: 0, z: 0 }
  ],
  loads: [
    { source: 'SWBD-101', tag: 'PMP-101', kw: '18.6', voltage: '480', powerFactor: '0.85', phases: '3', duty: 'Continuous' }
  ],
  oneLine: { activeSheet: 0, sheets: [] },
  cables: [],
  trays: [],
  conduits: [],
  ductbanks: []
});

assert.equal(automated.changed, true);
assert.equal(automated.summary.createdOneLineComponents, 2);
assert.equal(automated.summary.createdOneLineConnections, 1);
assert.equal(automated.next.oneLine.sheets[0].connections.length, 1);
assert.equal(automated.next.oneLine.sheets[0].components[0].connections.length, 1);
assert.equal(automated.summary.createdCables, 1);
assert.equal(automated.summary.createdRaceways, 1);
assert.equal(automated.summary.assignedCablesToRaceway, 1);
assert.equal(automated.summary.createdRouteResults, 1);
assert.equal(automated.next.cables[0].from_tag, 'SWBD-101');
assert.equal(automated.next.cables[0].to_tag, 'PMP-101');
assert.ok(automated.next.cables[0].conductor_size);
assert.equal(automated.next.cables[0].raceway_id, 'TR-AUTO-001');
assert.equal(automated.next.trays[0].tray_id, 'TR-AUTO-001');
assert.equal(automated.next.routeResults.batchResults.length, 1);
assert.equal(automated.next.routeResults.batchResults[0].cable, automated.next.cables[0].tag);
assert.equal(automated.next.routeResults.batchResults[0].status, 'Routed');
assert.ok(automated.summary.assumptions.some(text => text.includes('NEC 210.20')));

const autoDiagnostics = buildWorkflowCoreDiagnostics({
  equipment: [
    { tag: 'SWBD-101', voltage: '480', category: 'Distribution', subCategory: 'Switchboard', x: 0, y: 0, z: 0 },
    { tag: 'PMP-101', voltage: '480', category: 'Mechanical Load', subCategory: 'Pump', x: 80, y: 0, z: 0 }
  ],
  loads: [
    { source: 'SWBD-101', tag: 'PMP-101', kw: '18.6', voltage: '480', powerFactor: '0.85', phases: '3', duty: 'Continuous' }
  ],
  oneLine: automated.next.oneLine,
  cables: automated.next.cables,
  trays: automated.next.trays,
  conduits: automated.next.conduits,
  ductbanks: automated.next.ductbanks,
  latestRouteResults: automated.next.routeResults
});

assert.equal(autoDiagnostics.health.routeResults, 1);
assert.equal(autoDiagnostics.blockers.some(item => item.label === 'Run routing for deliverables'), false);

const customDesignBasis = normalizeDesignBasis({
  codeBasis: {
    primaryCode: 'NEC',
    edition: '2023',
    jurisdiction: 'Texas',
    ahj: 'Owner Electrical Authority'
  },
  sizingDefaults: {
    conductorMaterial: 'aluminum',
    insulationType: 'XHHW-2',
    temperatureRatingC: 90,
    defaultPowerFactor: 0.82,
    voltageDropLimitPct: 5,
    continuousLoadPolicy: 'require-duty-field'
  },
  routingDefaults: {
    defaultLengthFt: 140,
    defaultTrayId: 'TR-BASIS-100',
    defaultTrayWidthIn: 18,
    defaultTrayDepthIn: 6,
    defaultTrayElevationFt: 14,
    fillLimitPct: 35,
    fieldRoutePolicy: 'require-raceway-only'
  },
  approvalRules: {
    generatedRecordsRequireReview: true,
    routeResultsRequireReview: true,
    studiesRequireReview: true,
    releaseRequiresReviewer: true,
    reviewer: 'Electrical Lead'
  },
  updatedAt: '2026-05-20T00:00:00.000Z'
});
const customBasisSummary = summarizeDesignBasis(customDesignBasis);
assert.equal(customBasisSummary.complete, true);
assert(customBasisSummary.reviewGates.length > 0);

const customAutomated = buildMinimalDesignAutomation({
  equipment: [
    { tag: 'SWBD-201', voltage: '480', category: 'Distribution', subCategory: 'Switchboard' },
    { tag: 'FAN-201', voltage: '480', category: 'Mechanical Load', subCategory: 'Fan' }
  ],
  loads: [
    { source: 'SWBD-201', tag: 'FAN-201', kw: '7.5', voltage: '480', phases: '3' }
  ],
  oneLine: { activeSheet: 0, sheets: [] },
  cables: [],
  trays: [],
  conduits: [],
  ductbanks: [],
  designBasis: customDesignBasis
});

assert.equal(customAutomated.next.cables[0].conductor_material, 'aluminum');
assert.equal(customAutomated.next.cables[0].insulation_type, 'XHHW-2');
assert.equal(customAutomated.next.cables[0].powerFactor, 0.82);
assert.equal(customAutomated.next.cables[0].voltage_drop_limit_pct, 5);
assert.equal(customAutomated.next.cables[0]._designBasis.codeBasis, 'NEC 2023');
assert.equal(customAutomated.next.cables[0]._designBasis.insulationType, 'XHHW-2');
assert.equal(customAutomated.next.trays[0].tray_id, 'TR-BASIS-100');
assert.equal(customAutomated.next.trays[0].inside_width, 18);
assert.equal(customAutomated.next.trays[0].tray_depth, 6);
assert.equal(customAutomated.next.trays[0].fill_limit_pct, 35);
assert.equal(customAutomated.next.trays[0]._designBasis.fillLimitPct, 35);
assert.equal(customAutomated.next.routeResults.batchResults[0]._designBasis.fieldRoutePolicy, 'require-raceway-only');
assert(customAutomated.summary.assumptions.some(text => text.includes('NEC 2023 design basis')));
assert(customAutomated.summary.warnings.some(text => text.includes('duty classification')));
assert(customAutomated.summary.reviewGates.length > 0);

const customReview = buildDesignBasisReview({
  designBasis: customDesignBasis,
  equipment: [
    { tag: 'SWBD-201', voltage: '480', x: 0, y: 0 },
    { tag: 'FAN-201', voltage: '480', x: 140, y: 0 }
  ],
  oneLine: customAutomated.next.oneLine,
  cables: customAutomated.next.cables,
  trays: customAutomated.next.trays,
  conduits: customAutomated.next.conduits,
  ductbanks: customAutomated.next.ductbanks,
  studies: { shortCircuit: { status: 'Run' } },
  routeResults: customAutomated.next.routeResults
});

assert(customReview.openGateCount > 0);
assert(customReview.gates.some(gate => gate.id === 'protective-device-settings'));
assert(customReview.gates.some(gate => gate.id === 'generated-record-review'));
assert(customReview.deliverableBlockers.length > 0);

const reviewedCustomReview = buildDesignBasisReview({
  designBasis: customDesignBasis,
  designGateApprovals: {
    'protective-device-settings': { status: 'reviewed', reviewedBy: 'Electrical Lead', approvedAt: '2026-05-20T00:00:00.000Z' }
  },
  equipment: [
    { tag: 'SWBD-201', voltage: '480', x: 0, y: 0 },
    { tag: 'FAN-201', voltage: '480', x: 140, y: 0 }
  ],
  oneLine: customAutomated.next.oneLine,
  cables: customAutomated.next.cables,
  trays: customAutomated.next.trays,
  conduits: customAutomated.next.conduits,
  ductbanks: customAutomated.next.ductbanks,
  studies: { shortCircuit: { status: 'Run' }, arcFlash: { status: 'Run' } },
  routeResults: customAutomated.next.routeResults,
  tccSettings: { devices: ['sample-device'], settings: {} }
});

assert.equal(reviewedCustomReview.deliverableBlockers.length, 0);
assert(reviewedCustomReview.openGateCount > 0);

const flaggedCustomReview = buildDesignBasisReview({
  designBasis: customDesignBasis,
  designGateApprovals: {
    'protective-device-settings': { status: 'flagged', reviewedBy: 'Electrical Lead', approvedAt: '2026-05-20T00:00:00.000Z' }
  },
  equipment: [
    { tag: 'SWBD-201', voltage: '480', x: 0, y: 0 },
    { tag: 'FAN-201', voltage: '480', x: 140, y: 0 }
  ],
  oneLine: customAutomated.next.oneLine,
  cables: customAutomated.next.cables,
  trays: customAutomated.next.trays,
  conduits: customAutomated.next.conduits,
  ductbanks: customAutomated.next.ductbanks,
  studies: { shortCircuit: { status: 'Run' }, arcFlash: { status: 'Run' } },
  routeResults: customAutomated.next.routeResults,
  tccSettings: { devices: [], settings: {} }
});

assert(flaggedCustomReview.gates.some(gate => gate.id === 'protective-device-settings' && gate.status === 'open'));
assert(flaggedCustomReview.deliverableBlockers.length > 0);

const repeated = buildMinimalDesignAutomation({
  equipment: [
    { tag: 'SWBD-101', voltage: '480', category: 'Distribution', subCategory: 'Switchboard', x: 0, y: 0, z: 0 },
    { tag: 'PMP-101', voltage: '480', category: 'Mechanical Load', subCategory: 'Pump', x: 80, y: 0, z: 0 }
  ],
  loads: [
    { source: 'SWBD-101', tag: 'PMP-101', kw: '18.6', voltage: '480', powerFactor: '0.85', phases: '3', duty: 'Continuous' }
  ],
  oneLine: automated.next.oneLine,
  cables: automated.next.cables,
  trays: automated.next.trays,
  conduits: automated.next.conduits,
  ductbanks: automated.next.ductbanks,
  routeResults: automated.next.routeResults
});

assert.equal(repeated.changed, false);

console.log('✓ project workflow core');

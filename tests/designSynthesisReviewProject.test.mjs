import assert from 'node:assert/strict';
import test from 'node:test';
import { distributionPartitionFixture } from './helpers/distributionPartitionFixture.mjs';

const values = new Map();
let rejectNamed = false;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    if (rejectNamed && key === 'CTR_SAVED_PROJECTS_V1') throw Object.assign(new Error('Intentional save rejection'), { name: 'QuotaExceededError' });
    const next = new Map(values); next.set(String(key), String(value));
    const bytes = [...next].reduce((sum, [k, v]) => sum + 2 * (k.length + v.length), 0);
    if (bytes > 5 * 1024 * 1024) throw Object.assign(new Error(`Quota exceeded: ${bytes}`), { name: 'QuotaExceededError' });
    values.set(String(key), String(value));
  },
  removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
const project = await import('../projectStorage.js');
await project.initializeProjectStorage();
const store = await import('../dataStore.mjs');
const { generateDesignProposal } = await import('../analysis/designSynthesis.mjs');
const { currentContext } = await import('../src/design-synthesis/applyProposal.mjs');
const { createReviewProject, buildReviewProject } = await import('../src/design-synthesis/reviewProject.mjs');
const { buildDesignBasisReview } = await import('../analysis/designBasis.mjs');
const { buildWorkflowCoreDiagnostics } = await import('../analysis/projectWorkflowCore.mjs');
const { buildDeliverableReadinessDiagnostics } = await import('../analysis/deliverableWorkflow.mjs');
const { buildDesignSynthesisProjectEquipmentAdoption, bindDesignSynthesisProjectEquipmentProposal } = await import('../analysis/designSynthesisProjectEquipment.mjs');
const { resolveConnectionProtection } = await import('../src/one-line/connectionProtection.mjs');
const { countGeneratedMotorProjections } = await import('../analysis/designSynthesisMotorReadiness.mjs');
const { buildDiagramExportData, migrateOneLineDiagram } = await import('../src/one-line/diagramFileController.mjs');

function sourceState() { return structuredClone(store.exportProject()); }
function assertDraftBlocked(draft) {
  const approvals = { 'design-synthesis-preliminary-review-project': { status: 'approved' } };
  for (const review of [
    buildDesignBasisReview({ designSynthesisReviewDraft: draft, designGateApprovals: approvals }),
    buildWorkflowCoreDiagnostics({ designSynthesisReviewDraft: draft, designGateApprovals: approvals }).designReview,
    buildDeliverableReadinessDiagnostics({ designSynthesisReviewDraft: draft, designGateApprovals: approvals }).designReview,
  ]) {
    const gate = review.deliverableBlockers.find(item => item.id === 'design-synthesis-preliminary-review-project');
    assert.ok(gate);
    assert.equal(gate.reviewable, false);
  }
}

for (const count of [25, 50]) test(`${count} motors can be saved as a separate durable review project`, () => {
  store.setProjectMeta({ id: `Source-${count}`, name: `Source-${count}` });
  globalThis.window = { currentProjectId: `Source-${count}`, dispatchEvent() {} };
  const proposal = generateDesignProposal(distributionPartitionFixture(count));
  const before = sourceState();
  const result = createReviewProject(proposal, { expectedContext: currentContext() });
  assert.equal(result.ok, true, result.message);
  assert.match(result.name, /^PRELIMINARY REVIEW - /);
  assert.deepEqual(sourceState(), before, 'Creating a separate project does not mutate the source project');
  assert.equal(globalThis.window.currentProjectId, `Source-${count}`);
  assert.ok(project.listSavedProjects().includes(result.name));
  const snapshot = project.readSavedProject(result.name);
  assert.equal(snapshot.loads.length, count);
  assert.equal(snapshot.cables.length, proposal.cables.length);
  assert.equal(snapshot.oneLine.sheets[0].connections.length, proposal.oneLine.sheets[0].connections.length);
  assert.equal(snapshot.settings.latestRouteResults.batchResults.length, proposal.routeResults.batchResults.length);
  assert.equal(snapshot.settings.designSynthesisReviewDraft.status, 'preliminary-review-only');
  assert.ok(snapshot.settings.designSynthesisReviewDraft.limitations.some(item => item.includes('not copied')));
  assert.ok(snapshot.cables.filter(cable => cable.motor).every(cable => cable.motor.starterCandidateSummary?.selectedForApply === false));
  assertDraftBlocked(snapshot.settings.designSynthesisReviewDraft);
  assert.equal(store.loadProject(result.name), true);
  assert.equal(store.getLoads().length, count);
  assert.equal(store.getItem('designSynthesisReviewDraft', null).inputSignature, proposal.inputSignature);
  const motorCable = store.getCables().find(cable => cable.motor);
  const sheet = store.getOneLine().sheets[0];
  const exportedDiagram = buildDiagramExportData([sheet], 'PRELIMINARY');
  assert.ok(countGeneratedMotorProjections({ oneLine: migrateOneLineDiagram(exportedDiagram, 4) }) >= count);
  const connection = sheet.connections.find(item => item.cableId === motorCable.id || item.cable?.id === motorCable.id);
  const source = sheet.components.find(item => item.id === connection.from || item.id === connection.source);
  const target = sheet.components.find(item => item.id === connection.to || item.id === connection.target);
  const protection = resolveConnectionProtection({ source, target, connection, cables: store.getCables(), evidence: store.getItem('designSynthesisDeviceEvidence', {}) });
  assert.equal(protection?.status, 'candidate');
  assert.ok(protection.device.catalogNumber);
  assert.equal(protection.motorCandidate.selectedForApply, false);
  assert.ok(protection.motorCandidate.contactor);
  assert.ok(protection.motorCandidate.overloadRelay);
  assert.ok(protection.motorCandidate.shortCircuitDevice);
  const alteredCables = structuredClone(store.getCables());
  alteredCables.find(cable => cable.id === motorCable.id).motor.starterCandidateSummary.contactor = 'CHANGED';
  const alteredProtection = resolveConnectionProtection({ source, target, connection, cables: alteredCables, evidence: store.getItem('designSynthesisDeviceEvidence', {}) });
  assert.equal(alteredProtection.status, 'candidate');
  assert.equal(alteredProtection.motorCandidate, null);
  assert.equal(alteredProtection.motorCandidateUnavailable, true);
  const missingEvidence = structuredClone(store.getItem('designSynthesisDeviceEvidence', {}));
  delete missingEvidence[motorCable.motor.starterCandidateEvidenceRef];
  const missingProtection = resolveConnectionProtection({ source, target, connection, cables: store.getCables(), evidence: missingEvidence });
  assert.equal(missingProtection.motorCandidate, null);
  assert.equal(missingProtection.motorCandidateUnavailable, true);
  assertDraftBlocked(store.getItem('designSynthesisReviewDraft', null));
  assert.equal(store.importProject(before), true);
  project.removeSavedProject(result.name);
  delete globalThis.window;
});

for (const count of [25, 50]) test(`${count} reviewed owner equipment and load records retain their identities and metadata`, () => {
  const input = distributionPartitionFixture(count);
  const original = sourceState();
  const ownerName = `Owner-${count}`;
  store.setProjectMeta({ id: ownerName, name: ownerName });
  globalThis.window = { currentProjectId: ownerName, dispatchEvent() {} };
  store.setEquipment(input.equipment.map(row => ({ id: row.id, tag: row.tag, voltage: row.voltage, phases: row.phases, x: row.x, y: row.y, z: row.z, manufacturer: 'Owner supplied', custom: { purchaseReference: `PO-${row.id}` } })));
  const sourceEquipment = store.getEquipment();
  store.setLoads(input.equipment.map((row, index) => ({ ...row, id: `owner-load-${index}`, equipmentId: sourceEquipment.find(item => item.tag === row.tag).id, tag: `LOAD-${row.id}`, custom: { process: `Process-${index}` } })));
  assert.equal(store.saveProject(ownerName), true);
  const savedOwner = project.readSavedProject(ownerName);
  const source = sourceState();
  const context = currentContext();
  const reviewed = buildDesignSynthesisProjectEquipmentAdoption({ ...context, equipment: store.getEquipment(), loads: store.getLoads(), selectedEquipmentIds: store.getEquipment().map(row => row.id), acknowledgements: { electricalInputKW: true, voltageLineToLine: true, coordinatesFeet: true } });
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed.issues));
  const normalizedIds = new Map(input.equipment.map(row => [row.id, sourceEquipment.find(item => item.tag === row.tag).id]));
  for (const source of input.faultStudy.sources) source.equipmentId = normalizedIds.get(source.equipmentId) || source.equipmentId;
  for (const profile of input.faultEvolution.profiles) profile.equipmentId = normalizedIds.get(profile.equipmentId) || profile.equipmentId;
  input.equipment = reviewed.selectedRows;
  input.projectEquipmentAdoption = reviewed.adoption;
  const proposal = bindDesignSynthesisProjectEquipmentProposal(generateDesignProposal(input), reviewed.adoption);
  assert.deepEqual(proposal.issues.filter(issue => issue.severity === 'blocking').map(issue => issue.code), ['MOTOR_PROTECTION_UNRESOLVED'], JSON.stringify(proposal.issues));
  const result = createReviewProject(proposal, { expectedContext: context });
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(sourceState(), source);
  assert.deepEqual(project.readSavedProject(ownerName), savedOwner);
  const snapshot = project.readSavedProject(result.name);
  assert.equal(snapshot.loads.length, count);
  for (const [index, row] of input.equipment.entries()) {
    const equipment = snapshot.equipment.find(item => item.id === row.id);
    const load = snapshot.loads.find(item => item.id === `owner-load-${index}`);
    assert.ok(equipment.custom.purchaseReference.toLowerCase().endsWith(row.id.toLowerCase()));
    assert.equal(load.custom.process, `Process-${index}`);
    assert.equal(load.equipmentId, row.id);
  }
  assert.equal(store.loadProject(result.name), true);
  assert.equal(store.getLoads().length, count);
  const motorCable = store.getCables().find(cable => cable.motor);
  const sheet = store.getOneLine().sheets[0];
  const connection = sheet.connections.find(item => String(item.cableId).toLowerCase() === motorCable.id.toLowerCase());
  const sourceNode = sheet.components.find(item => String(item.id).toLowerCase() === String(connection.from).toLowerCase());
  const target = sheet.components.find(item => String(item.id).toLowerCase() === String(connection.to).toLowerCase());
  const protection = resolveConnectionProtection({ source: sourceNode, target, connection, cables: store.getCables(), evidence: store.getItem('designSynthesisDeviceEvidence', {}) });
  assert.equal(protection?.status, 'candidate');
  assert.ok(protection.motorCandidate?.contactor);
  assert.equal(store.importProject(original), true);
  project.removeSavedProject(result.name);
  project.removeSavedProject(ownerName);
  delete globalThis.window;
});

test('stale context, modified proposal, and other blockers cannot be staged', () => {
  const proposal = generateDesignProposal(distributionPartitionFixture(25));
  const context = currentContext();
  assert.equal(buildReviewProject(proposal, { expectedContext: { ...context, projectFingerprint: 'stale' } }).ok, false);
  const altered = structuredClone(proposal);
  altered.cables[0].conductor_size = '750 kcmil';
  assert.match(buildReviewProject(altered, { expectedContext: context }).message, /changed/);
  const blocked = structuredClone(proposal);
  blocked.issues.push({ code: 'ANOTHER_BLOCKER', severity: 'blocking' });
  assert.match(buildReviewProject(blocked, { expectedContext: context }).message, /other blocking/);
  const existing = structuredClone(proposal);
  existing.inputs.original.corridors.edges[0].existingTray = {};
  assert.match(buildReviewProject(existing, { expectedContext: context }).message, /existing-tray/);
});

test('the project-level gate cannot be approved away, even after motor projections are removed', () => {
  assertDraftBlocked({ status: 'preliminary-review-only' });
  assertDraftBlocked(false);
});

test('a rejected durable write leaves the source and saved projects unchanged', () => {
  const proposal = generateDesignProposal(distributionPartitionFixture(25));
  const beforeProject = sourceState();
  const beforeSaved = project.listSavedProjects();
  rejectNamed = true;
  const result = createReviewProject(proposal, { expectedContext: currentContext() });
  rejectNamed = false;
  assert.equal(result.ok, false);
  assert.deepEqual(sourceState(), beforeProject);
  assert.deepEqual(project.listSavedProjects(), beforeSaved);
});

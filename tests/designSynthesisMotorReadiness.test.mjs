import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDesignBasisReview, normalizeDesignBasis } from '../analysis/designBasis.mjs';
import { buildWorkflowCoreDiagnostics } from '../analysis/projectWorkflowCore.mjs';
import { buildDeliverableReadinessDiagnostics } from '../analysis/deliverableWorkflow.mjs';

const gateId = 'design-synthesis-motor-protection-unresolved';
const generatedMotor = () => ({ id: 'MOTOR-CABLE', tag: 'MOTOR-CABLE', _designSynthesis: { source: 'design-synthesis', identity: 'MOTOR-CABLE' }, motor: { overloadProtectionStatus: 'unresolved', shortCircuitAndGroundFaultCoordinationStatus: 'unresolved' } });
const approval = { status: 'reviewed', reviewedBy: 'Example', approvedAt: '2026-01-01' };

test('saved review decisions cannot clear non-reviewable missing-input gates', () => {
  const review = buildDesignBasisReview({ designGateApprovals: { 'design-basis-missing': approval } });
  const missing = review.gates.find(gate => gate.id === 'design-basis-missing');
  assert.equal(missing.reviewable, false);
  assert.equal(missing.status, 'open');
  assert.equal(missing.approval, null);
  assert.ok(review.deliverableBlockers.includes(missing));
});

test('generated motor candidates keep a non-reviewable deliverable gate in each readiness path', () => {
  const project = { designBasis: normalizeDesignBasis({}), cables: [generatedMotor()], designGateApprovals: { [gateId]: approval } };
  const reviews = [
    buildDesignBasisReview(project),
    buildWorkflowCoreDiagnostics(project).designReview,
    buildDeliverableReadinessDiagnostics({ ...project, enforceDesignBasis: true }).designReview,
  ];
  for (const review of reviews) {
    const gate = review.gates.find(item => item.id === gateId);
    assert.equal(gate.status, 'open');
    assert.equal(gate.reviewable, false);
    assert.equal(gate.blocking, true);
    assert.equal(gate.enforceOnDeliverables, true);
    assert.equal(gate.approval, null);
    assert.ok(review.deliverableBlockers.includes(gate));
    assert.equal(review.readyForDeliverables, false);
  }
  assert.equal(buildWorkflowCoreDiagnostics(project).readyForDeliverables, false);
});

test('gate is scoped to generated motor circuits and persists if their candidate status is edited', () => {
  const motor = generatedMotor();
  delete motor.motor.overloadProtectionStatus;
  delete motor.motor.shortCircuitAndGroundFaultCoordinationStatus;
  assert.ok(buildDesignBasisReview({ cables: [motor] }).gates.some(gate => gate.id === gateId));
  assert.ok(!buildDesignBasisReview({ cables: [{ id: 'C1', motor: {} }, { id: 'C2', _designSynthesis: {}, motor: null }, { id: 'C3', _designSynthesis: {}, motor: [] }] }).gates.some(gate => gate.id === gateId));
});

test('gate remains open for equipment, load, or one-line motor projections if a cable is removed', () => {
  const generated = { _designSynthesis: { source: 'design-synthesis' } };
  const projections = [
    { equipment: [{ ...generated, id: 'M', motor: {} }] },
    { loads: [{ ...generated, id: 'M', motor: {} }] },
    { oneLine: { sheets: [{ components: [{ ...generated, physical: { motor: {} } }] }] } },
    { oneLine: { sheets: [{ connections: [{ ...generated, cable: { motor: {} } }] }] } },
    { oneLine: { sheets: [{ components: [{ connections: [{ ...generated, cable: { motor: {} } }] }] }] } },
  ];
  for (const projection of projections) {
    const withBasis = { designBasis: normalizeDesignBasis({}), ...projection };
    assert.ok(buildDesignBasisReview(withBasis).deliverableBlockers.some(gate => gate.id === gateId));
    assert.ok(buildWorkflowCoreDiagnostics(withBasis).designReview.deliverableBlockers.some(gate => gate.id === gateId));
    assert.ok(buildDeliverableReadinessDiagnostics({ ...withBasis, enforceDesignBasis: true }).designReview.deliverableBlockers.some(gate => gate.id === gateId));
  }
});

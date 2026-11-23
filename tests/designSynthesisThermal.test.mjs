import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDesignSynthesisRouteThermal, validateDesignSynthesisThermalInput } from '../analysis/designSynthesisThermal.mjs';

const route = { status: 'routed', edgeIds: ['cool', 'hot'], sourceAttachmentFt: 0, destinationAttachmentFt: 0 };

test('evaluates each corridor edge as a paired ambient and bundle condition', () => {
  const assessment = evaluateDesignSynthesisRouteThermal({
    route,
    edges: [
      { id: 'cool', thermal: { ambientTempC: 30, bundledConductors: 6 } },
      { id: 'hot', thermal: { ambientTempC: 40, bundledConductors: 3 } },
    ],
    criteria: { ambientTempC: 30, bundledConductors: 3 },
  });
  assert.equal(assessment.status, 'evaluated');
  assert.equal(assessment.limitingSegmentId, 'cool');
  assert.equal(assessment.adjustmentFactor, 0.8);
  assert.equal(assessment.segments[1].adjustmentFactor, 0.88);
});

test('field legs and point routes inherit global criteria', () => {
  const assessment = evaluateDesignSynthesisRouteThermal({ route: { status: 'routed', edgeIds: [], sourceAttachmentFt: 0, destinationAttachmentFt: 0 }, criteria: { ambientTempC: 35, bundledConductors: 6 } });
  assert.equal(assessment.limitingSegmentId, 'field-point');
  assert.equal(assessment.segments[0].source, 'global-criteria-default');
  assert.equal(assessment.adjustmentFactor, 0.752);
});

test('unsupported methods, fields, and impossible thermal bounds are blocking', () => {
  const validation = validateDesignSynthesisThermalInput({ criteria: { thermal: { method: 'iec-60287' } }, corridors: { edges: [{ thermal: { unknown: 1 } }] } });
  assert.ok(validation.issues.some(issue => issue.code === 'UNSUPPORTED_THERMAL_METHOD'));
  assert.ok(validation.issues.some(issue => issue.code === 'UNKNOWN_THERMAL_FIELD'));
  const blocked = evaluateDesignSynthesisRouteThermal({ route: { status: 'routed', edgeIds: ['edge'] }, edges: [{ id: 'edge', thermal: { ambientTempC: 75, bundledConductors: 3 } }], criteria: {} });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.adjustmentFactor, 0);
});

test('solid cover factor applies only above the six foot threshold', () => {
  const six = evaluateDesignSynthesisRouteThermal({ route, edges: [{ id: 'cool' }, { id: 'hot' }], criteria: { thermal: { solidCoverContinuousLengthFt: 6 } } });
  const seven = evaluateDesignSynthesisRouteThermal({ route, edges: [{ id: 'cool' }, { id: 'hot' }], criteria: { thermal: { solidCoverContinuousLengthFt: 7 } } });
  assert.equal(six.segments[0].solidCoverFactor, 1);
  assert.equal(seven.segments[0].solidCoverFactor, 0.95);
});

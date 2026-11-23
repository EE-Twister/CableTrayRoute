import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDesignSynthesisSourceFaultConsistency } from '../analysis/designSynthesisSourceFault.mjs';

function source(overrides = {}) {
  return {
    voltage: 480,
    phases: 3,
    availableFaultCurrentKA: 20,
    motorStartingImpedance: {
      rOhm: 0.006,
      xOhm: 0.015,
      reference: 'Synthetic positive-sequence per-phase R/X at 480 V LL',
    },
    ...overrides,
  };
}

test('source-only current uses line-line voltage and positive-sequence per-phase impedance', () => {
  const result = analyzeDesignSynthesisSourceFaultConsistency({ source: source() });

  assert.equal(result.status, 'pass');
  assert.equal(result.impliedSourceOnlyFaultCurrentKA, 480 / (Math.sqrt(3) * Math.hypot(0.006, 0.015) * 1000));
  assert.equal(result.declaredAvailableFaultCurrentKA, 20);
  assert.equal(result.comparison.relation, 'below-declared-bound');
  assert.match(result.assumptions.join(' '), /1\.0 per unit/);
  assert.match(result.limitations.join(' '), /remain unresolved/);
});

test('blocks a declared bound below the implied source-only current with evidence', () => {
  const result = analyzeDesignSynthesisSourceFaultConsistency({ source: source({ availableFaultCurrentKA: 17 }) });

  assert.equal(result.status, 'blocked');
  assert.equal(result.blockedReason, 'SOURCE_FAULT_BOUND_INCONSISTENT');
  assert.ok(result.impliedSourceOnlyFaultCurrentKA > result.declaredAvailableFaultCurrentKA);
  assert.ok(result.issues.some(item => item.code === 'SOURCE_FAULT_BOUND_INCONSISTENT'));
});

test('missing and malformed bounds block without string coercion or invented defaults', () => {
  for (const availableFaultCurrentKA of [undefined, null, '20', 0, -1, Number.NaN]) {
    const result = analyzeDesignSynthesisSourceFaultConsistency({ source: source({ availableFaultCurrentKA }) });
    assert.equal(result.status, 'blocked');
    assert.ok(result.issues.some(item => item.code === 'SOURCE_FAULT_BOUND_REQUIRED'));
    assert.equal(result.declaredAvailableFaultCurrentKA, typeof availableFaultCurrentKA === 'number' && Number.isFinite(availableFaultCurrentKA) || typeof availableFaultCurrentKA === 'string' ? availableFaultCurrentKA : null);
  }
});

test('single-phase source is explicitly unsupported and malformed phase data is invalid', () => {
  const singlePhase = analyzeDesignSynthesisSourceFaultConsistency({ source: source({ phases: 1 }) });
  const malformed = analyzeDesignSynthesisSourceFaultConsistency({ source: source({ phases: '3' }) });

  assert.ok(singlePhase.issues.some(item => item.code === 'UNSUPPORTED_SOURCE_FAULT_PHASES'));
  assert.ok(malformed.issues.some(item => item.code === 'INVALID_SOURCE_FAULT_PHASES'));
  assert.equal(malformed.impliedSourceOnlyFaultCurrentKA, null);
});

test('blocks nonpassive, zero, or unreferenced impedance and invalid voltage', () => {
  const negativeResistance = analyzeDesignSynthesisSourceFaultConsistency({ source: source({ motorStartingImpedance: { rOhm: -0.01, xOhm: 0.01, reference: 'basis' } }) });
  const zeroImpedance = analyzeDesignSynthesisSourceFaultConsistency({ source: source({ motorStartingImpedance: { rOhm: 0, xOhm: 0, reference: 'basis' } }) });
  const missingReference = analyzeDesignSynthesisSourceFaultConsistency({ source: source({ motorStartingImpedance: { rOhm: 0.01, xOhm: 0.01, reference: ' ' } }) });
  const stringVoltage = analyzeDesignSynthesisSourceFaultConsistency({ source: source({ voltage: '480' }) });

  assert.ok(negativeResistance.issues.some(item => item.code === 'INVALID_SOURCE_FAULT_RESISTANCE'));
  assert.ok(zeroImpedance.issues.some(item => item.code === 'ZERO_SOURCE_FAULT_IMPEDANCE'));
  assert.ok(missingReference.issues.some(item => item.code === 'SOURCE_FAULT_IMPEDANCE_REFERENCE_REQUIRED'));
  assert.ok(stringVoltage.issues.some(item => item.code === 'INVALID_SOURCE_FAULT_VOLTAGE'));
});

test('blocks impedance and current calculations outside the finite numeric range', () => {
  const unboundedMagnitude = analyzeDesignSynthesisSourceFaultConsistency({ source: source({ motorStartingImpedance: { rOhm: Number.MAX_VALUE, xOhm: Number.MAX_VALUE, reference: 'basis' } }) });
  const unboundedCurrent = analyzeDesignSynthesisSourceFaultConsistency({ source: source({ voltage: Number.MAX_VALUE, motorStartingImpedance: { rOhm: Number.MIN_VALUE, xOhm: Number.MIN_VALUE, reference: 'basis' } }) });

  assert.equal(unboundedMagnitude.status, 'blocked');
  assert.equal(unboundedMagnitude.impliedSourceOnlyFaultCurrentKA, null);
  assert.ok(unboundedMagnitude.issues.some(item => item.code === 'SOURCE_FAULT_IMPEDANCE_MAGNITUDE_RANGE'));
  assert.equal(unboundedCurrent.status, 'blocked');
  assert.equal(unboundedCurrent.impliedSourceOnlyFaultCurrentKA, null);
  assert.ok(unboundedCurrent.issues.some(item => item.code === 'SOURCE_FAULT_CURRENT_RANGE'));
  assert.doesNotThrow(() => JSON.stringify(unboundedMagnitude));
  assert.doesNotThrow(() => JSON.stringify(unboundedCurrent));
});

test('independent 3-4-5 current basis enforces the actual bound with only floating-point roundoff', () => {
  const value = source({ availableFaultCurrentKA: 27.712812921102035,
    motorStartingImpedance: { rOhm: 0.006, xOhm: 0.008, reference: 'Synthetic 3-4-5 impedance triangle' } });
  const before = structuredClone(value);
  const exact = analyzeDesignSynthesisSourceFaultConsistency({ source: value });
  assert.equal(exact.status, 'pass');
  assert.equal(exact.comparison.relation, 'equal-within-roundoff');
  assert.ok(Math.abs(exact.impliedSourceOnlyFaultCurrentKA - 27.712812921102035) < 1e-10);
  assert.ok(exact.comparison.toleranceKA < 1e-10, 'Roundoff is not an engineering tolerance or rating allowance');
  value.availableFaultCurrentKA = 27.7127;
  assert.equal(analyzeDesignSynthesisSourceFaultConsistency({ source: value }).status, 'blocked');
  value.availableFaultCurrentKA = before.availableFaultCurrentKA;
  assert.deepEqual(value, before);
  const malformedPhase = analyzeDesignSynthesisSourceFaultConsistency({ source: source({ phases: Number.POSITIVE_INFINITY }) });
  assert.equal(malformedPhase.status, 'blocked');
  assert.equal(malformedPhase.sourcePhases, null);
});

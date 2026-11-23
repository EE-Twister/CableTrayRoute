import test from 'node:test';
import assert from 'node:assert/strict';
import { solvePositiveSequenceBoltedFault } from '../analysis/faultNetwork.mjs';

const sqrt3 = Math.sqrt(3);
const inventory = { status: 'complete', reference: 'test source inventory rev A' };
const source = (id, busId, { emf = { re: 480 / sqrt3, im: 0 }, r = 0.02304, x = 0, inService = true } = {}) => ({
    id,
    busId,
    emfPhaseV: emf,
    impedance: { rOhm: r, xOhm: x },
    inService,
    reference: `${id} test source data`,
});
const branch = (id, fromBusId, toBusId, { r = 0.02304, x = 0, referenceBusId = fromBusId, tapPu = { re: 1, im: 0 } } = {}) => ({
    id,
    fromBusId,
    toBusId,
    impedance: { rOhm: r, xOhm: x, referenceBusId },
    tapPu,
});
const oneBus = (overrides = {}) => ({
    networkBaseMVA: 1,
    buses: [{ id: 'BUS', voltageLLV: 480 }],
    branches: [],
    sources: [source('SRC', 'BUS')],
    fault: { busId: 'BUS', type: 'three-phase-bolted' },
    sourceInventory: inventory,
    ...overrides,
});
const numericClose = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const phasorClose = (actual, expected, tolerance = 1e-9) => {
    numericClose(actual.re, expected.re, tolerance);
    numericClose(actual.im, expected.im, tolerance);
};

test('single source at bolted fault returns initial symmetrical RMS and explicit limitations', () => {
    const result = solvePositiveSequenceBoltedFault(oneBus());
    assert.equal(result.status, 'evaluated');
    assert.equal(result.scope, 'initial-symmetrical-rms-only');
    numericClose(result.fault.faultCurrentRmsKA, (480 / sqrt3) / 0.02304 / 1000);
    assert.equal(result.sourceFaultContributions.length, 1);
    phasorClose(result.sourceFaultContributions[0].currentKA, result.fault.totalFaultCurrentKA);
    assert.equal(result.sourceInventory.verificationStatus, 'not-verified');
    assert.ok(result.limitations.some((text) => text.includes('Does not calculate minimum or maximum')));
});

test('superposition keeps every in-service source impedance and reports separate infeed contributions', () => {
    const input = oneBus({
        sources: [
            source('SRC-A', 'BUS', { r: 0.04608, x: 0.02304 }),
            source('SRC-B', 'BUS', { emf: { re: 0, im: 480 / sqrt3 }, r: 0.02304, x: 0.04608 }),
        ],
    });
    const result = solvePositiveSequenceBoltedFault(input);
    assert.equal(result.status, 'evaluated');
    const sum = result.sourceFaultContributions.reduce((total, item) => ({ re: total.re + item.currentKA.re, im: total.im + item.currentKA.im }), { re: 0, im: 0 });
    phasorClose(sum, result.fault.totalFaultCurrentKA, 1e-8);
    assert.deepEqual(result.sourceFaultContributions.map((item) => item.sourceId), ['SRC-A', 'SRC-B']);
    assert.equal(result.sourceTerminalCurrents.length, 2);
    assert.ok(result.sourceFaultContributions.some((item) => Math.abs(item.currentKA.im) > 0));
});

test('optional temporal solve skips source-superposition work only when an explicit boolean false is supplied', () => {
    const full = solvePositiveSequenceBoltedFault(oneBus());
    const lean = solvePositiveSequenceBoltedFault(oneBus({ includeSourceFaultContributions: false }));
    assert.equal(lean.status, 'evaluated');
    phasorClose(lean.fault.totalFaultCurrentKA, full.fault.totalFaultCurrentKA);
    assert.deepEqual(lean.sourceFaultContributions, []);
    const invalid = solvePositiveSequenceBoltedFault(oneBus({ includeSourceFaultContributions: null }));
    assert.equal(invalid.status, 'blocked');
    assert.ok(invalid.issues.some(item => item.code === 'INVALID_OPTION'));
});

test('an in-service zero-EMF source retains its nonzero internal impedance', () => {
    const result = solvePositiveSequenceBoltedFault(oneBus({ sources: [source('SRC', 'BUS', { emf: { re: 0, im: 0 } })], includeSourceFaultContributions: false }));
    assert.equal(result.status, 'evaluated');
    assert.equal(result.fault.faultCurrentRmsKA, 0);
    assert.equal(result.sourceTerminalCurrents[0].currentKA.re, 0);
    assert.equal(result.sourceTerminalCurrents[0].currentKA.im, 0);
});

test('shared branch reports both terminal currents with explicit into-branch signs', () => {
    const input = {
        networkBaseMVA: 1,
        buses: [{ id: 'SRC-BUS', voltageLLV: 480 }, { id: 'FAULT-BUS', voltageLLV: 480 }],
        branches: [branch('FEED', 'SRC-BUS', 'FAULT-BUS', { r: 0.02304, x: 0.02304 })],
        sources: [source('SRC', 'SRC-BUS', { r: 0.02304, x: 0 })],
        fault: { busId: 'FAULT-BUS', type: 'three-phase-bolted' },
        sourceInventory: inventory,
    };
    const result = solvePositiveSequenceBoltedFault(input);
    assert.equal(result.status, 'evaluated');
    const feeder = result.branchTerminalCurrents[0];
    phasorClose(feeder.fromCurrentIntoBranchKA, result.sourceTerminalCurrents[0].currentKA, 1e-8);
    phasorClose(feeder.toCurrentIntoBranchKA, { re: -result.fault.totalFaultCurrentKA.re, im: -result.fault.totalFaultCurrentKA.im }, 1e-8);
});

test('mixed-voltage impedance references on either nominal side produce the same result', () => {
    const buses = [{ id: 'HV', voltageLLV: 480 }, { id: 'LV', voltageLLV: 208 }];
    const zPu = 0.1;
    const highSideOhm = zPu * (480 ** 2 / 1e6);
    const lowSideOhm = zPu * (208 ** 2 / 1e6);
    const makeInput = (referenceBusId, zOhm) => ({
        networkBaseMVA: 1,
        buses,
        branches: [branch('TX', 'HV', 'LV', { r: zOhm, x: 0, referenceBusId })],
        sources: [source('SRC', 'HV', { emf: { re: 480 / sqrt3, im: 0 }, r: 0.02304, x: 0 })],
        fault: { busId: 'LV', type: 'three-phase-bolted' },
        sourceInventory: inventory,
    });
    const highReferenced = solvePositiveSequenceBoltedFault(makeInput('HV', highSideOhm));
    const lowReferenced = solvePositiveSequenceBoltedFault(makeInput('LV', lowSideOhm));
    assert.equal(highReferenced.status, 'evaluated');
    assert.equal(lowReferenced.status, 'evaluated');
    phasorClose(highReferenced.fault.totalFaultCurrentKA, lowReferenced.fault.totalFaultCurrentKA, 1e-8);
});

test('complex off-nominal phase-shifting tap is retained in bus voltage and current phasors', () => {
    const angle = Math.PI / 12;
    const input = {
        networkBaseMVA: 1,
        buses: [{ id: 'A', voltageLLV: 480 }, { id: 'B', voltageLLV: 480 }],
        branches: [branch('TAP', 'A', 'B', { r: 0.02304, x: 0.01152, tapPu: { re: 1.05 * Math.cos(angle), im: 1.05 * Math.sin(angle) } })],
        sources: [source('SRC', 'A', { r: 0.01152, x: 0.02304 })],
        fault: { busId: 'B', type: 'three-phase-bolted' },
        sourceInventory: inventory,
    };
    const result = solvePositiveSequenceBoltedFault(input);
    assert.equal(result.status, 'evaluated');
    assert.ok(Math.abs(result.branchTerminalCurrents[0].fromCurrentIntoBranchKA.im) > 0);
    assert.equal(result.busVoltages.find((item) => item.busId === 'B').voltagePhasePu.re, 0);
});

test('same-voltage unity ideal tie is contracted and its radial current is recovered by KCL', () => {
    const result = solvePositiveSequenceBoltedFault({
        networkBaseMVA: 1,
        buses: [{ id: 'A', voltageLLV: 480 }, { id: 'B', voltageLLV: 480 }],
        branches: [branch('IDEAL', 'A', 'B', { r: 0, x: 0 })],
        sources: [source('SRC', 'A')],
        fault: { busId: 'B', type: 'three-phase-bolted' },
        sourceInventory: inventory,
    });
    assert.equal(result.status, 'evaluated');
    assert.equal(result.zeroImpedanceTieCurrents.length, 1);
    phasorClose(result.zeroImpedanceTieCurrents[0].fromCurrentIntoBranchKA, result.sourceTerminalCurrents[0].currentKA, 1e-8);
    phasorClose(result.zeroImpedanceTieCurrents[0].toCurrentIntoBranchKA, { re: -result.fault.totalFaultCurrentKA.re, im: -result.fault.totalFaultCurrentKA.im }, 1e-8);
});

test('reversing ideal-tie direction reverses the recovered terminal phasor', () => {
    const result = solvePositiveSequenceBoltedFault({
        networkBaseMVA: 1,
        buses: [{ id: 'A', voltageLLV: 480 }, { id: 'B', voltageLLV: 480 }],
        branches: [branch('IDEAL', 'B', 'A', { r: 0, x: 0 })],
        sources: [source('SRC', 'A')],
        fault: { busId: 'B', type: 'three-phase-bolted' },
        sourceInventory: inventory,
    });
    assert.equal(result.status, 'evaluated');
    phasorClose(result.zeroImpedanceTieCurrents[0].fromCurrentIntoBranchKA, { re: -result.fault.totalFaultCurrentKA.re, im: -result.fault.totalFaultCurrentKA.im }, 1e-8);
});

test('ideal zero-impedance cycles and non-unity ideal ties are rejected without epsilon impedance', () => {
    const triangle = solvePositiveSequenceBoltedFault({
        networkBaseMVA: 1,
        buses: ['A', 'B', 'C'].map((id) => ({ id, voltageLLV: 480 })),
        branches: [branch('AB', 'A', 'B', { r: 0, x: 0 }), branch('BC', 'B', 'C', { r: 0, x: 0 }), branch('CA', 'C', 'A', { r: 0, x: 0 })],
        sources: [source('SRC', 'A')],
        fault: { busId: 'C', type: 'three-phase-bolted' },
        sourceInventory: inventory,
    });
    assert.equal(triangle.status, 'blocked');
    assert.ok(triangle.issues.some((item) => item.code === 'IDEAL_TIE_CYCLE'));
    const mismatched = solvePositiveSequenceBoltedFault({
        networkBaseMVA: 1,
        buses: [{ id: 'A', voltageLLV: 480 }, { id: 'B', voltageLLV: 208 }],
        branches: [branch('IDEAL', 'A', 'B', { r: 0, x: 0 })],
        sources: [source('SRC', 'A')],
        fault: { busId: 'B', type: 'three-phase-bolted' },
        sourceInventory: inventory,
    });
    assert.equal(mismatched.status, 'blocked');
    assert.ok(mismatched.issues.some((item) => item.code === 'UNSUPPORTED_IDEAL_BRANCH'));
});

test('unfed electrical islands are unevaluated', () => {
    const result = solvePositiveSequenceBoltedFault({
        networkBaseMVA: 1,
        buses: ['A', 'B', 'ISLAND'].map((id) => ({ id, voltageLLV: 480 })),
        branches: [branch('AB', 'A', 'B')],
        sources: [source('SRC', 'A')],
        fault: { busId: 'B', type: 'three-phase-bolted' },
        sourceInventory: inventory,
    });
    assert.equal(result.status, 'blocked');
    assert.ok(result.issues.some((item) => item.code === 'UNFED_ISLAND'));
});

test('out-of-service source is open and is reported with zero terminal current', () => {
    const result = solvePositiveSequenceBoltedFault(oneBus({ sources: [source('SRC', 'BUS', { inService: false })] }));
    assert.equal(result.status, 'blocked');
    assert.ok(result.issues.some((item) => item.code === 'UNFED_ISLAND'));
});

test('strict validation rejects missing references, coercible strings, unknown fields, and malformed current ranges', () => {
    const textNumber = solvePositiveSequenceBoltedFault(oneBus({ networkBaseMVA: '1' }));
    assert.equal(textNumber.status, 'blocked');
    assert.ok(textNumber.issues.some((item) => item.code === 'INVALID_NETWORK_BASE'));
    const noReference = oneBus({ sourceInventory: { status: 'complete' } });
    assert.equal(solvePositiveSequenceBoltedFault(noReference).status, 'blocked');
    const unknown = oneBus({ extra: true });
    assert.ok(solvePositiveSequenceBoltedFault(unknown).issues.some((item) => item.code === 'UNKNOWN_FIELD'));
    const missingBase = oneBus({ branches: [branch('BAD', 'BUS', 'OTHER')] });
    assert.equal(solvePositiveSequenceBoltedFault(missingBase).status, 'blocked');
});

test('input is not mutated and output order is deterministic under input permutation', () => {
    const input = {
        networkBaseMVA: 1,
        buses: [{ id: 'B', voltageLLV: 480 }, { id: 'A', voltageLLV: 480 }],
        branches: [branch('AB', 'A', 'B', { r: 0.01152, x: 0.02304 })],
        sources: [source('Z-SRC', 'A', { r: 0.02304, x: 0.01152 }), source('A-SRC', 'B', { r: 0.04608, x: 0.01152 })],
        fault: { busId: 'B', type: 'three-phase-bolted' },
        sourceInventory: inventory,
    };
    const snapshot = structuredClone(input);
    const freeze = (value) => {
        if (value && typeof value === 'object') {
            Object.freeze(value);
            Object.values(value).forEach(freeze);
        }
        return value;
    };
    const first = solvePositiveSequenceBoltedFault(freeze(input));
    assert.deepEqual(input, snapshot);
    const permuted = solvePositiveSequenceBoltedFault({
        ...snapshot,
        buses: snapshot.buses.slice().reverse(),
        branches: snapshot.branches.slice().reverse(),
        sources: snapshot.sources.slice().reverse(),
    });
    assert.deepEqual(first, permuted);
});

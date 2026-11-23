import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDesignSynthesisInput } from '../analysis/designSynthesisInput.mjs';

const base = {
  supply: { id: 'SWGR', voltage: 480, phases: 3, capacityKva: 100, x: 0, y: 0, z: 0 },
  equipment: [{ id: 'M-1', tag: 'M-1', kw: 10, voltage: 480, phases: 3, powerFactor: .9, duty: 'continuous', x: 10, y: 0, z: 0 }],
  corridors: { nodes: [{ id: 'N-0', x: 0, y: 0, z: 0 }, { id: 'N-1', x: 10, y: 0, z: 0 }], edges: [{ id: 'E-1', from: 'N-0', to: 'N-1', widthIn: 12, depthIn: 6 }] },
  criteria: { maxPanelLoadKva: 50, maxLoadsPerPanel: 10, voltageDropLimitPct: 3, temperatureRatingC: 75, coordinateUnit: 'ft' },
};
function codes(overrides) { return new Set(validateDesignSynthesisInput({ ...base, ...overrides }).issues.map(item => item.code)); }

test('validates a complete input and returns a sanitized copy', () => { const result = validateDesignSynthesisInput(base); assert.equal(result.ok, true); assert.notEqual(result.sanitized, base); });
test('reports invalid top-level and missing criteria shapes', () => { assert.ok(validateDesignSynthesisInput(null).issues.some(item => item.code === 'INVALID_INPUT')); assert.ok(codes({ ...base, criteria: null }).has('MISSING_CRITERIA')); });
test('reports duplicate source/load identities and tags', () => { const equipment = [{ ...base.equipment[0], id: 'SWGR', tag: 'M-1' }, { ...base.equipment[0], id: 'M-2', tag: 'M-1' }]; const found = codes({ equipment }); assert.ok(found.has('DUPLICATE_ID')); assert.ok(found.has('DUPLICATE_TAG')); });
test('reports corridor endpoint, duplicate node, zero edge, and dimensions', () => { const corridors = { nodes: [{ id: 'N-0', x: 0, y: 0, z: 0 }, { id: 'N-0', x: 0, y: 0, z: 0 }], edges: [{ id: 'E-1', from: 'N-0', to: 'N-0', widthIn: 0, depthIn: -1 }] }; const found = codes({ corridors }); assert.ok(found.has('DUPLICATE_ID')); assert.ok(found.has('ZERO_LENGTH_CORRIDOR')); assert.ok(found.has('INVALID_CORRIDOR_DIMENSIONS')); });
test('reports unsupported phase, frequency, temperature, pf, duty, and units', () => { const item = { ...base.equipment[0], phases: 4, powerFactor: 0, duty: 'unknown' }; const found = codes({ equipment: [item], supply: { ...base.supply, frequency: 400 }, criteria: { ...base.criteria, frequency: 400, temperatureRatingC: 0, coordinateUnit: 'yards' } }); assert.ok(found.has('INVALID_LOAD_PHASES')); assert.ok(found.has('UNSUPPORTED_FREQUENCY')); assert.ok(found.has('INVALID_TEMPERATURE_RATING')); assert.ok(found.has('INVALID_POWER_FACTOR')); assert.ok(found.has('UNSUPPORTED_DUTY')); assert.ok(found.has('UNSUPPORTED_UNIT')); });
test('reports load above panel capacity and reserved generated ids', () => { const found = codes({ equipment: [{ ...base.equipment[0], id: 'DP-01', kw: 100 }] }); assert.ok(found.has('LOAD_EXCEEDS_PANEL_LIMIT')); assert.ok(found.has('RESERVED_GENERATED_ID')); });

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatEngineeringNumber,
  formatEngineeringVoltage,
  getEngineeringLabelLines,
  resolveComponentAttribute
} from '../src/one-line/componentAttributes.mjs';

const studyAttributeResolvers = {
  arcFlash: component => component.studyResults?.arcFlash?.[component.id] || null,
  shortCircuit: component => component.studyResults?.shortCircuit?.[component.id] || null,
  reliability: component => component.studyResults?.reliability?.componentStats?.[component.id] || null
};

describe('One-Line component attributes', () => {
  it('gives calculated study results precedence over imported attributes', () => {
    const component = {
      id: 'PANEL-1',
      shortCircuit: { threePhaseKA: 0.02 },
      props: { shortCircuit: { threePhaseKA: 0.04 } },
      studyResults: { shortCircuit: { 'PANEL-1': { threePhaseKA: 42.5 } } }
    };
    assert.equal(resolveComponentAttribute(component, 'shortCircuit.threePhaseKA', { studyAttributeResolvers }), 42.5);
    assert.equal(resolveComponentAttribute({ props: { custom: 12 } }, 'custom'), 12);
  });

  it('formats engineering values consistently across data blocks', () => {
    assert.equal(formatEngineeringNumber(12.5), '12.5');
    assert.equal(formatEngineeringVoltage(480), '480 V');
    assert.equal(formatEngineeringVoltage(13.8, 'rated_voltage_kv'), '13.8 kV');
    assert.equal(formatEngineeringVoltage(4160), '4.16 kV');
  });

  it('builds transformer labels from canonical or aliased properties', () => {
    const lines = getEngineeringLabelLines({
      type: 'transformer',
      rated_voltage_kv: 13.8,
      props: { rated_kva: 1500, impedance_z_percent: 5.75, tap_position: 2.5 }
    });
    assert.deepEqual(lines, ['13.8 kV', '1500 kVA', '5.75 %Z', 'Tap 2.5%']);
  });

  it('includes current study fault duty ahead of imported values', () => {
    const component = {
      id: 'BUS-1',
      type: 'bus',
      voltage: 480,
      bus_rating_a: 1200,
      shortCircuit: { threePhaseKA: 9 },
      studyResults: { shortCircuit: { 'BUS-1': { threePhaseKA: 31.2 } } }
    };
    const lines = getEngineeringLabelLines(component, {
      studyAttributeResolvers,
      isBusComponent: candidate => candidate.type === 'bus',
      maxLines: 6
    });
    assert.deepEqual(lines, ['480 V', '1200 A', '31.2 kA fault']);
  });
});

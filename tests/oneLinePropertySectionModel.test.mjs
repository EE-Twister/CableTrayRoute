import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyPropertyTarget, partitionPropertyFields } from '../src/one-line/propertySectionModel.mjs';

describe('One-Line property section model', () => {
  it('classifies motor derivations from component type or horsepower schema', () => {
    assert.equal(classifyPropertyTarget({ type: 'motor_load' }, [], () => false).shouldApplyMotorDerivations, true);
    assert.equal(classifyPropertyTarget({ type: 'equipment' }, [{ name: 'hp' }], () => false).shouldApplyMotorDerivations, true);
    assert.equal(classifyPropertyTarget({ type: 'transformer' }, [], () => false).isTransformerComponent, true);
  });

  it('partitions fields and keeps calculated motor values at the end', () => {
    const fields = [{ name: 'load_kw' }, { name: 'rating_a' }, { name: 'notes' }, { name: 'manufacturer' }];
    const sections = partitionPropertyFields({
      fields,
      baseFields: [{ name: 'rating_a' }],
      scheduleLinkFieldNames: new Set(),
      isMotorStudyComponent: true,
      impedanceFieldNameSet: new Set(),
      studyInputFieldNameSet: new Set(),
      isPhysicalPropertyField: () => false,
      shouldApplyMotorDerivations: true,
      motorCalculatedFields: new Set(['load_kw'])
    });
    assert.deepEqual(sections.generalFields.map(field => field.name), ['rating_a']);
    assert.deepEqual(sections.electricalFields.map(field => field.name), ['load_kw']);
    assert.deepEqual(sections.noteFields.map(field => field.name), ['notes']);
    assert.deepEqual(sections.manufacturerFields.map(field => field.name), ['manufacturer']);
  });
});

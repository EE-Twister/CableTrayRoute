import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPropertyFieldFromForm,
  formatPropertyFieldLabel,
  formatPropertyNumber,
  normalizePropertySchema,
  parsePropertyNumber,
  readPropertyValue
} from '../src/one-line/propertyEditorModel.mjs';

describe('One-Line property editor model', () => {
  it('parses engineering values and formats stable editable numbers', () => {
    assert.equal(parsePropertyNumber('12.47 kV'), 12.47);
    assert.equal(parsePropertyNumber('-1.2e-3 Ω'), -0.0012);
    assert.equal(parsePropertyNumber('not specified'), null);
    assert.equal(formatPropertyNumber(12.47001, 3), '12.47');
    assert.equal(formatPropertyNumber(Number.NaN), '');
  });

  it('reads authoritative component values before their props mirror', () => {
    const component = { voltage: 480, props: { voltage: 208, rating_a: 100 } };
    assert.equal(readPropertyValue(component, 'voltage'), 480);
    assert.equal(readPropertyValue(component, 'rating_a'), 100);
    assert.equal(readPropertyValue(component, 'missing'), null);
  });

  it('formats field labels with electrical acronyms and engineering units', () => {
    assert.equal(formatPropertyFieldLabel('', 'short circuit kva'), 'Short Circuit kVA');
    assert.equal(formatPropertyFieldLabel('', 'runtime min'), 'Runtime (min)');
    assert.equal(formatPropertyFieldLabel('', 'dc v'), 'DC Voltage');
  });

  it('applies typed form values while preserving reserved identity fields and props mirrors', () => {
    const component = { id: 'device-1', props: { rating_a: 50, enabled: false } };
    const values = new Map([['id', 'replacement'], ['rating_a', '125'], ['enabled', 'on']]);
    applyPropertyFieldFromForm(component, { name: 'id', type: 'text' }, values);
    applyPropertyFieldFromForm(component, { name: 'rating_a', type: 'number' }, values);
    applyPropertyFieldFromForm(component, { name: 'enabled', type: 'checkbox' }, values);
    assert.equal(component.id, 'device-1');
    assert.equal(component.rating_a, 125);
    assert.equal(component.props.rating_a, 125);
    assert.equal(component.enabled, true);
    assert.equal(component.props.enabled, true);
  });

  it('normalizes component schema through injected catalog choices', () => {
    const schema = normalizePropertySchema({
      rawSchema: [
        { name: 'manufacturer', type: 'text' },
        { name: 'model', type: 'text' },
        { name: 'primary_connection', type: 'text' },
        { name: 'load_torque_curve', type: 'text' },
        { name: 'cable_length', type: 'number' },
        { name: 'conductor_type', type: 'text' },
        { name: 'harmonicProfileId', type: 'text' }
      ],
      targetComponent: { type: 'transformer', manufacturer: 'Acme' },
      isMotorStudyComponent: true,
      isConductorSegment: false,
      voltageClasses: ['600V'],
      thermalRatings: ['75C'],
      manufacturerOptions: ['Acme'],
      getManufacturerModels: manufacturer => [`${manufacturer}-1`],
      transformerConnectionOptions: ['Delta', 'Wye'],
      cablePropertyMetadata: { length: { label: 'Cable Length', help: 'Route length.' } },
      getHarmonicProfileOptions: () => ['IEEE Typical']
    });

    assert.equal(schema.find(field => field.name === 'manufacturer').type, 'select');
    assert.deepEqual(schema.find(field => field.name === 'model').options, ['Acme-1']);
    assert.deepEqual(schema.find(field => field.name === 'primary_connection').options, ['Delta', 'Wye']);
    assert.equal(schema.find(field => field.name === 'load_torque_curve').type, 'textarea');
    assert.equal(schema.find(field => field.name === 'cable_length').label, 'Cable Length');
    assert.equal(schema.some(field => field.name === 'conductor_type'), false);
    assert.deepEqual(schema.find(field => field.name === 'harmonicProfileId').options(), ['IEEE Typical']);
  });
});

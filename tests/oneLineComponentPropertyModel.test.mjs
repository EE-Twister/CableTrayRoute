import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getNestedComponentValue,
  inferSchemaFromProps,
  readNestedValue,
  setNestedComponentValue,
  writeNestedValue
} from '../src/one-line/componentPropertyModel.mjs';

describe('One-Line component property model', () => {
  it('reads direct values before mirrored props values', () => {
    const component = { load: { kw: 100 }, props: { load: { kw: 90, kvar: 20 } } };
    assert.equal(getNestedComponentValue(component, ['load', 'kw']), 100);
    assert.equal(getNestedComponentValue(component, ['load', 'kvar']), 20);
  });

  it('writes normalized values to the component and props mirror', () => {
    const component = { props: {} };
    setNestedComponentValue(component, ['load', 'kw'], '125.5', 'number');
    setNestedComponentValue(component, ['enabled'], 1, 'checkbox');
    assert.equal(component.load.kw, 125.5);
    assert.equal(component.props.load.kw, 125.5);
    assert.equal(component.enabled, true);
    assert.equal(component.props.enabled, true);
  });

  it('rejects prototype-polluting nested paths', () => {
    const target = {};
    writeNestedValue(target, ['__proto__', 'polluted'], true);
    assert.equal({}.polluted, undefined);
    assert.equal(readNestedValue(target, ['constructor', 'prototype']), undefined);
  });

  it('infers nested property fields while excluding component identity fields', () => {
    const schema = inferSchemaFromProps({
      id: 'ignored',
      enabled: true,
      load: { kw: 50, notes: 'basis' }
    });
    assert.deepEqual(schema.map(field => [field.name, field.type]), [
      ['enabled', 'checkbox'],
      ['load_kw', 'number'],
      ['load_notes', 'text']
    ]);
    const component = { props: { load: { kw: 50 } } };
    schema.find(field => field.name === 'load_kw').setValue(component, '75');
    assert.equal(schema.find(field => field.name === 'load_kw').getValue(component), 75);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CABLE_PROPERTY_METADATA, createBuiltInComponents } from '../src/one-line/builtInComponentCatalog.mjs';

const components = createBuiltInComponents({
  asset: path => `/assets/${path}`,
  typeIcons: { bus: 'bus.svg', equipment: 'equipment.svg', cable: 'cable.svg', annotations: 'annotation.svg' },
  placeholderIcon: 'placeholder.svg',
  symbolAssetVersion: 'test',
  defaultBusProps: { volts: 13800 },
  defaultShapeProps: { shapeType: 'rectangle' }
});

describe('One-Line built-in component catalog', () => {
  it('provides unique built-in subtypes with isolated nested defaults', () => {
    assert.equal(new Set(components.map(component => component.subtype)).size, components.length);
    const bus = components.find(component => component.subtype === 'Bus');
    assert.equal(bus.props.volts, 13800);
    bus.props.volts = 480;
    const rebuilt = createBuiltInComponents({
      asset: path => path, typeIcons: {}, placeholderIcon: '', symbolAssetVersion: 'test',
      defaultBusProps: { volts: 13800 }, defaultShapeProps: {}
    });
    assert.equal(rebuilt.find(component => component.subtype === 'Bus').props.volts, 13800);
  });

  it('retains engineering metadata for canonical cable inputs', () => {
    assert.equal(CABLE_PROPERTY_METADATA.resistance_per_km.type, 'number');
    assert.match(CABLE_PROPERTY_METADATA.zero_sequence_impedance.help, /Ground fault/);
    assert.equal(CABLE_PROPERTY_METADATA.impedance_x.label, 'Impedance X (Ω)');
  });
});

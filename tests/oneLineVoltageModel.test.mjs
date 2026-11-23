import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTransformerPortLabel,
  computeComponentOperatingVoltage,
  formatOperatingVoltage,
  formatVoltage,
  formatVoltageString,
  getFiniteVoltageMagnitudes,
  getTransformerConnectionSetting,
  getTransformerPortRole,
  getVoltageMagnitudeEntries,
  parseVoltageNumber,
  resolveComponentVoltageVolts,
  resolveNominalVoltage,
  resolveTransformerVoltageValue,
  resolveVoltageMagnitude,
  sanitizeOverlayStudyFields,
  transformerVoltageKeyMap
} from '../src/one-line/voltageModel.mjs';

const componentMeta = {
  two_winding: { props: { primary_connection: 'Delta', secondary_connection: 'Wye-Grounded', volts_primary: 13800, volts_secondary: 480 } },
  three_winding: { props: { volts_hv: '69000', volts_lv: '13800', volts_tv: '4160' } }
};

describe('One-Line voltage model: transformers', () => {
  it('maps transformer ports to winding roles', () => {
    const xfmr = { type: 'transformer', subtype: 'two_winding' };
    assert.equal(getTransformerPortRole(xfmr, 0), 'primary');
    assert.equal(getTransformerPortRole(xfmr, '1'), 'secondary');
    assert.equal(getTransformerPortRole({ type: 'transformer', subtype: 'three_winding' }, 2), 'tertiary');
    assert.equal(getTransformerPortRole(xfmr, 3), null);
    assert.equal(getTransformerPortRole({ type: 'bus' }, 0), null);
  });

  it('labels ports with the winding connection, preferring component values over library defaults', () => {
    const xfmr = { type: 'transformer', subtype: 'two_winding' };
    assert.equal(buildTransformerPortLabel(xfmr, 0, componentMeta), 'Primary (Delta)');
    assert.equal(buildTransformerPortLabel({ ...xfmr, secondary_connection: ' Wye ' }, 1, componentMeta), 'Secondary (Wye)');
    assert.equal(buildTransformerPortLabel({ ...xfmr, props: { primary_connection: 'Zigzag' } }, 0, componentMeta), 'Primary (Zigzag)');
    assert.equal(buildTransformerPortLabel(xfmr, 0), 'Primary', 'no library defaults supplied');
    assert.equal(getTransformerConnectionSetting(xfmr, null, componentMeta), null);
  });

  it('resolves winding voltages from the component, its props, then library defaults', () => {
    assert.deepEqual(transformerVoltageKeyMap.three_winding, ['volts_hv', 'volts_lv', 'volts_tv']);
    const xfmr = { type: 'transformer', subtype: 'two_winding', volts_primary: '12470' };
    assert.equal(resolveTransformerVoltageValue(xfmr, 0, componentMeta), '12470');
    assert.equal(resolveTransformerVoltageValue(xfmr, 1, componentMeta), 480);
    const threeWinding = { type: 'transformer', subtype: 'three_winding' };
    assert.equal(resolveTransformerVoltageValue(threeWinding, 0, componentMeta), '69000');
    assert.equal(resolveTransformerVoltageValue(threeWinding, 2, componentMeta), '4160');
    const blankTertiary = { ...threeWinding, props: { volts_tv: '' } };
    assert.equal(resolveTransformerVoltageValue(blankTertiary, 2, componentMeta), '13800', 'blank winding falls back to the next key');
    assert.equal(resolveTransformerVoltageValue({ subtype: 'unknown' }, 0, componentMeta), null);
    assert.equal(resolveTransformerVoltageValue(null, 0, componentMeta), null);
  });
});

describe('One-Line voltage model: nominal and operating voltage', () => {
  it('resolves nominal voltage in volts from direct, nested and base-kV fields', () => {
    assert.equal(resolveComponentVoltageVolts({ voltage: '480' }), 480);
    assert.equal(resolveComponentVoltageVolts({ voltage: '4.16 kV' }), 4160);
    assert.equal(resolveComponentVoltageVolts({ props: { baseKV: 13.8 } }), 13800);
    assert.equal(resolveComponentVoltageVolts({ operating_voltage: 470, baseKV: 0.48 }), 470);
    assert.equal(resolveComponentVoltageVolts({ operating_voltage: 470, baseKV: 0.48 }, { includeOperatingVoltage: false }), 480);
    assert.equal(resolveComponentVoltageVolts({}), null);
    assert.equal(resolveNominalVoltage({ operating_voltage: 470 }), null);
  });

  it('scales nominal voltage by the per-unit study magnitude', () => {
    assert.equal(resolveVoltageMagnitude({ voltage_mag: { a: 0.98, b: 1, c: 1.02 } }), 1);
    assert.equal(computeComponentOperatingVoltage({ voltage: 480, voltage_mag: 0.95 }), 456);
    assert.equal(computeComponentOperatingVoltage({ voltage: 480 }), 480);
    assert.equal(computeComponentOperatingVoltage({}), null);
  });

  it('filters non-finite study magnitudes and strips empty overlays', () => {
    assert.deepEqual(getFiniteVoltageMagnitudes({ a: 1.01, b: 'x', c: '0.99' }), [1.01, 0.99]);
    assert.deepEqual(getFiniteVoltageMagnitudes(NaN), []);
    assert.deepEqual(getVoltageMagnitudeEntries({ a: '1.0', b: null, c: 'bad' }), [['a', 1], ['b', 0]]);
    const stale = { voltage_mag: { a: 'bad' } };
    assert.equal(sanitizeOverlayStudyFields(stale), stale);
    assert.equal('voltage_mag' in stale, false);
    const fresh = { voltage_mag: 1.02 };
    sanitizeOverlayStudyFields(fresh);
    assert.equal(fresh.voltage_mag, 1.02);
  });
});

describe('One-Line voltage model: formatting', () => {
  it('formats voltages for labels and property fields', () => {
    assert.equal(formatVoltage(13800), '13.8 kV');
    assert.equal(formatVoltage(480.04), '480 V');
    assert.equal(formatVoltage(NaN), '');
    assert.equal(formatVoltageString(480.00001), '480');
    assert.equal(formatVoltageString(Infinity), null);
    assert.equal(formatOperatingVoltage(1.23456), 1.23);
    assert.equal(formatOperatingVoltage('abc'), 'abc');
    assert.equal(formatOperatingVoltage(''), '');
  });

  it('parses the first number out of free-form voltage text', () => {
    assert.equal(parseVoltageNumber(' 4.16kV'), 4.16);
    assert.equal(parseVoltageNumber(480), 480);
    assert.equal(parseVoltageNumber('n/a'), null);
    assert.equal(parseVoltageNumber(Infinity), null);
    assert.equal(parseVoltageNumber(undefined), null);
  });
});

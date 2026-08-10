import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describeSettingRange,
  formatCoordinationCurrent,
  formatCoordinationSeconds,
  formatDetailValue,
  formatOptionLabel,
  formatSettingLabel,
  formatSettingValue,
  getSettingOptions,
  resolveSettingType,
  snapOverridesToOptions,
  snapSettingValue,
  valuesEqual
} from '../../analysis/tcc/settingModel.mjs';

console.log('TCC setting model');

{
  assert.equal(formatSettingLabel('shortTimePickup'), 'Short Time Pickup');
  assert.equal(formatSettingLabel('custom_field'), 'Custom Field');
  assert.equal(formatSettingValue(1000), '1000');
  assert.equal(formatSettingValue(125.25), '125.3');
  assert.equal(formatSettingValue(12.345), '12.35');
  assert.equal(formatSettingValue(1.2345), '1.234');
  assert.equal(formatSettingValue(' 2.500 '), '2.5');
  assert.equal(formatCoordinationCurrent(1234.5), '1,235');
  assert.equal(formatCoordinationSeconds(12.345), '12.35');
  assert.equal(formatOptionLabel('longTimePickup'), 'Long Time Pickup');
  console.log('  ✓ preserves setting, current, time, and option formatting');
}

{
  const device = {
    settingOptions: {
      pickup: [100, 200, 400],
      curveFamily: [
        { value: 'NI', label: 'Normal Inverse' },
        { value: 'VI', label: 'Very Inverse' }
      ]
    }
  };
  assert.deepEqual(getSettingOptions(device, 'pickup'), [
    { value: 100, valueStr: '100', label: '100' },
    { value: 200, valueStr: '200', label: '200' },
    { value: 400, valueStr: '400', label: '400' }
  ]);
  assert.equal(describeSettingRange(device, 'pickup'), '100 – 400');
  assert.equal(describeSettingRange(device, 'curveFamily'), 'Normal Inverse, Very Inverse');
  assert.equal(snapSettingValue(device, 'pickup', 260), 200);
  assert.equal(snapSettingValue(device, 'curveFamily', 'VI'), 'VI');
  assert.equal(snapSettingValue(device, 'curveFamily', 'unknown'), 'NI');
  assert.deepEqual(snapOverridesToOptions(device, {
    pickup: 390,
    curveFamily: 'VI',
    ignored: null
  }), { pickup: 400, curveFamily: 'VI' });
  console.log('  ✓ preserves option normalization, range summaries, and snapping');
}

{
  assert.equal(resolveSettingType(100, [50, 100]), 'number');
  assert.equal(resolveSettingType('100', ['50', '100']), 'number');
  assert.equal(resolveSettingType('NI', ['NI', 'VI']), 'string');
  assert.equal(valuesEqual(1, '1.0'), true);
  assert.equal(valuesEqual('NI', 'VI'), false);
  assert.equal(formatDetailValue([true, 2.5, ' NI ']), 'Yes, 2.5, NI');
  const recursive = [];
  recursive.push(recursive);
  assert.equal(formatDetailValue(recursive), '[…]');
  console.log('  ✓ preserves value typing, equality, and bounded detail formatting');
}

{
  const source = await readFile(new URL('../../analysis/tcc/settingModel.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:document|window|HTMLElement|HTMLInputElement|d3)\b/);
  console.log('  ✓ remains independent of browser and chart APIs');
}

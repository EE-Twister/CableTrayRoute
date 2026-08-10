import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildTypeGroups,
  describeEntryAttributes,
  getManufacturerLabel
} from '../../analysis/tcc/catalogPresentationModel.mjs';

console.log('TCC catalog presentation model');

{
  assert.equal(getManufacturerLabel({ kind: 'library', baseDevice: { vendor: 'ABB' } }), 'ABB');
  assert.equal(getManufacturerLabel({ kind: 'library', baseDevice: {} }), 'Library Devices');
  assert.equal(getManufacturerLabel({ kind: 'component', baseDevice: {}, component: { manufacturer: 'GE' } }), 'GE');
  assert.equal(getManufacturerLabel({ kind: 'component', baseDevice: {}, component: {} }), 'One-Line Devices');
  assert.equal(getManufacturerLabel({ kind: 'motorStart' }), 'Motor Starting');
  console.log('  ✓ preserves manufacturer and system-overlay grouping labels');
}

{
  const groups = buildTypeGroups([
    { uid: 'fuse-b', name: 'Fuse B', kind: 'library', baseDevice: { type: 'fuse', vendor: 'B Vendor' } },
    { uid: 'breaker-z', name: 'Breaker Z', kind: 'library', baseDevice: { type: 'lv_breaker', vendor: 'Z Vendor' } },
    { uid: 'breaker-a', name: 'Breaker A', kind: 'library', baseDevice: { type: 'lv_breaker', vendor: 'A Vendor' } },
    { uid: 'motor', name: 'Motor Start', kind: 'motorStart', deviceCategory: 'motor' }
  ]);
  assert.deepEqual(groups.map(group => group.label), ['LV Breaker', 'Fuse', 'Motor']);
  assert.equal(groups[0].total, 2);
  assert.deepEqual(groups[0].manufacturers.map(group => group.name), ['A Vendor', 'Z Vendor']);
  assert.deepEqual(buildTypeGroups([]), []);
  console.log('  ✓ preserves type priority and deterministic manufacturer/name ordering');
}

{
  const componentRows = describeEntryAttributes({
    kind: 'component',
    baseDevice: {
      settings: { pickup: 100 },
      settingOptions: { pickup: [50, 100, 200] }
    },
    component: { manufacturer: 'Example', amp_rating: 100 }
  });
  assert.deepEqual(componentRows[0], { label: 'Pickup (A)', value: '100', range: '50 – 200' });
  assert.ok(componentRows.some(row => row.label === 'Manufacturer' && row.value === 'Example'));

  assert.deepEqual(describeEntryAttributes({
    kind: 'inrush', current: 1200, duration: 0.1
  }), [
    { label: 'Inrush Current', value: '1200 A', range: '' },
    { label: 'Duration', value: '0.1 s', range: '' }
  ]);
  assert.deepEqual(describeEntryAttributes(null), []);
  console.log('  ✓ preserves settings, component, and overlay attribute rows');
}

{
  const source = await readFile(new URL('../../analysis/tcc/catalogPresentationModel.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:document|window|HTMLElement|HTMLCanvasElement|d3)\b/);
  console.log('  ✓ remains independent of browser and chart APIs');
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describeComponentDetailRows } from '../../analysis/tcc/componentDetailModel.mjs';

console.log('TCC component detail model');

{
  const rows = describeComponentDetailRows({
    component: {
      type: 'breaker',
      manufacturer: 'Example',
      model: 'CB-100',
      amp_rating: 100,
      interrupt_rating: 35,
      voltage: 480,
      phases: 'A B C',
      props: { installation: 'Indoor' }
    }
  });
  assert.deepEqual(rows.slice(0, 7), [
    { label: 'Manufacturer', value: 'Example', range: '' },
    { label: 'Model', value: 'CB-100', range: '' },
    { label: 'Amp Rating', value: '100 A', range: '' },
    { label: 'Interrupt Rating', value: '35 kA', range: '' },
    { label: 'Voltage', value: '480 V', range: '' },
    { label: 'Phases', value: 'A, B, C', range: '' },
    { label: 'Installation', value: 'Indoor', range: '' }
  ]);
  console.log('  ✓ formats prioritized protective-device fields and simple properties');
}

{
  const rows = describeComponentDetailRows({
    component: {
      type: 'cable',
      props: {
        cable: {
          conductors: '3 x #2 AWG',
          conductor_material: 'copper',
          insulation_rating: 90
        }
      }
    }
  });
  assert.ok(rows.some(row => row.label === 'Conductor Size' && row.value === '#2 AWG'));
  assert.ok(rows.some(row => row.label === 'Conductor Material' && row.value === 'Copper'));
  assert.ok(rows.some(row => row.label === 'Insulation Rating' && row.value === '90 °C'));
  console.log('  ✓ derives cable size, material, and insulation detail from nested project data');
}

{
  const usedLabels = new Set(['manufacturer']);
  const rows = describeComponentDetailRows({
    component: { manufacturer: 'Hidden', model: 'Visible' }
  }, usedLabels);
  assert.equal(rows.some(row => row.label === 'Manufacturer'), false);
  assert.equal(rows.some(row => row.label === 'Model'), true);
  assert.deepEqual(describeComponentDetailRows(null), []);
  console.log('  ✓ avoids duplicate labels and withholds missing component details');
}

{
  const source = await readFile(new URL('../../analysis/tcc/componentDetailModel.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:document|window|HTMLElement|HTMLCanvasElement|d3)\b/);
  console.log('  ✓ remains independent of browser and chart APIs');
}

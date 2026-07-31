import assert from 'assert';
import {
  applyOneLineDataEdit,
  applyOneLineDataImport,
  filterOneLineDataRows,
  listOneLineDataRows,
  parseOneLineDataCsv,
  planOneLineDataImport,
} from '../analysis/oneLineDataManager.mjs';

const model = {
  activeSheet: 0,
  sheets: [{
    id: 'main',
    name: 'Main Service',
    components: [{
      id: 'BUS-1',
      label: 'Main Bus',
      tag: 'MSB',
      type: 'bus',
      layer: 'Power',
      props: { rated_voltage_kv: 0.48, bus_rating_a: 2000 },
    }, {
      id: 'CB-1',
      label: 'Main Breaker',
      type: 'breaker',
      locked: true,
      props: { rated_voltage_kv: 0.48, rated_current_a: 1600 },
    }],
  }, {
    id: 'emergency',
    name: 'Emergency',
    components: [{ id: 'GEN-1', label: 'Generator', type: 'generator', baseKV: 4.16 }],
  }],
};

{
  const rows = listOneLineDataRows(model);
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(rows[0], {
    componentId: 'BUS-1',
    sheetId: 'main',
    sheet: 'Main Service',
    label: 'Main Bus',
    tag: 'MSB',
    type: 'bus',
    subtype: '',
    voltageKv: 0.48,
    currentA: 2000,
    layer: 'Power',
    locked: false,
  });
  assert.strictEqual(rows[2].voltageKv, 4.16);
}

{
  const rows = listOneLineDataRows(model);
  assert.deepStrictEqual(
    filterOneLineDataRows(rows, { sheet: 'main', type: 'bus', query: 'msb' }).map(row => row.componentId),
    ['BUS-1'],
  );
  assert.deepStrictEqual(
    filterOneLineDataRows(rows, { query: 'emergency' }).map(row => row.componentId),
    ['GEN-1'],
  );
}

{
  const result = applyOneLineDataEdit(model, ['BUS-1', 'CB-1'], 'voltageKv', 0.6);
  assert.strictEqual(result.changed, 2);
  assert.strictEqual(result.oneLine.sheets[0].components[0].props.rated_voltage_kv, 0.6);
  assert.strictEqual(result.oneLine.sheets[0].components[1].props.rated_voltage_kv, 0.6);
  assert.strictEqual(model.sheets[0].components[0].props.rated_voltage_kv, 0.48, 'source model remains immutable');
}

{
  const result = applyOneLineDataEdit(model, ['GEN-1'], 'layer', 'Emergency power');
  assert.strictEqual(result.changed, 1);
  assert.strictEqual(result.oneLine.sheets[1].components[0].layer, 'Emergency power');
  const unlock = applyOneLineDataEdit(model, ['CB-1'], 'locked', false);
  assert.strictEqual(unlock.changed, 1);
  assert.ok(!('locked' in unlock.oneLine.sheets[0].components[1]));
}

{
  assert.strictEqual(applyOneLineDataEdit(model, ['CB-1'], 'currentA', 0).changed, 0);
  assert.strictEqual(applyOneLineDataEdit(model, [], 'label', 'No change').changed, 0);
}

{
  const rows = parseOneLineDataCsv('Component ID,Label,Rated Voltage (kV),Position Locked\r\nCB-1,"Service, Main",0.6,No\r\nBUS-1,Main Bus,0.6,Yes\r\n');
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].Label, 'Service, Main');
  const plan = planOneLineDataImport(model, rows);
  assert.strictEqual(plan.matchedRows, 2);
  assert.strictEqual(plan.unmatchedRows, 0);
  assert.strictEqual(plan.updates.length, 5);
  const applied = applyOneLineDataImport(model, plan.updates);
  assert.strictEqual(applied.changed, 5);
  const updatedComponents = new Map(applied.oneLine.sheets[0].components.map(component => [component.id, component]));
  assert.strictEqual(updatedComponents.get('CB-1').label, 'Service, Main');
  assert.strictEqual(updatedComponents.get('BUS-1').props.rated_voltage_kv, 0.6);
  assert.strictEqual(updatedComponents.get('BUS-1').locked, true);
}

{
  const plan = planOneLineDataImport(model, parseOneLineDataCsv('Component ID,Rated Current (A),Position Locked\nCB-1,not-a-number,maybe\nMISSING-1,600,Yes\nCB-1,1000,No\n'));
  assert.strictEqual(plan.updates.length, 0);
  assert.strictEqual(plan.unmatchedRows, 1);
  assert.strictEqual(plan.warnings.length, 4);
}

console.log('one-line data manager tests passed');

/**
 * buildProjectAnalysisModel builds study inputs from a saved project snapshot
 * without storage. Server study endpoints depend on it producing exactly what
 * the browser's store-backed getters produce for the same project.
 */
import assert from 'node:assert';

function describe(name, fn) {
  console.log(name);
  return fn();
}

async function it(name, fn) {
  try {
    await fn();
    console.log('  ✓', name);
  } catch (err) {
    console.log('  ✗', name);
    console.error(err);
    process.exitCode = 1;
  }
}

const store = {};
const memoryStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(key => delete store[key]); },
  key: index => Object.keys(store)[index] ?? null,
  get length() { return Object.keys(store).length; },
};
globalThis.localStorage = memoryStorage;

const dataStore = await import('../dataStore.mjs');
const { runShortCircuit } = await import('../analysis/shortCircuit.mjs');
const { runMotorStart } = await import('../analysis/motorStartCalc.mjs');

const equipment = [
  { id: 'SWBD-1', description: 'Main switchboard', voltage: '480' },
  { id: 'MCC-1', description: 'Motor control center', voltage: '480' },
];
const cables = [{
  tag: 'CBL-SWBD-MCC',
  from: 'SWBD-1',
  to: 'MCC-1',
  conductor_size: '#4 AWG',
  conductor_material: 'Copper',
  raceway_material: 'PVC',
  length_ft: 100,
}];
const oneLine = {
  activeSheet: 0,
  sheets: [{
    name: 'S1',
    components: [
      { id: 'source', type: 'source', subtype: 'utility_source', label: 'SWBD-1', equipmentRef: 'SWBD-1',
        voltage: 480, thevenin_mva: 20, xr_ratio: 10, connections: [{ target: 'load_bus' }] },
      { id: 'load_bus', type: 'equipment', label: 'MCC-1', equipmentRef: 'MCC-1', voltage: 480 },
      { id: 'm1', type: 'motor_load', subtype: 'motor_load', hp: 100, voltage: 480 },
    ],
  }],
};

await describe('buildProjectAnalysisModel', async () => {
  dataStore.setEquipment(equipment);
  dataStore.setCables(cables);
  dataStore.setOneLine(oneLine);
  const snapshot = JSON.parse(JSON.stringify(dataStore.exportProject()));

  await it('matches the store-backed one-line view and cable schedule', () => {
    const model = dataStore.buildProjectAnalysisModel(snapshot);
    assert.deepStrictEqual(model.oneLine, dataStore.getOneLine());
    assert.deepStrictEqual(model.cables, dataStore.getCables());
    assert.strictEqual(model.tccSettings, null);
  });

  await it('produces the same short-circuit and motor-start results as the browser path', () => {
    const model = dataStore.buildProjectAnalysisModel(snapshot);
    const buses = model.oneLine.sheets.flatMap(sheet => sheet.components);
    const fromSnapshot = runShortCircuit({ buses, cables: model.cables }, { tccSettings: model.tccSettings });
    const fromStore = runShortCircuit();
    assert.deepStrictEqual(fromSnapshot, fromStore);
    assert.strictEqual(fromSnapshot.load_bus.impedanceProvenance.segments[1].source, 'Cable Schedule');
    assert.deepStrictEqual(runMotorStart(model.oneLine), runMotorStart());
  });

  await it('never reads or writes storage', () => {
    const trap = () => { throw new Error('storage accessed'); };
    globalThis.localStorage = { getItem: trap, setItem: trap, removeItem: trap, clear: trap, key: trap, length: 0 };
    try {
      const model = dataStore.buildProjectAnalysisModel(snapshot);
      assert.strictEqual(model.oneLine.sheets[0].components.length, 3);
      assert.strictEqual(model.cables.length, 1);
    } finally {
      globalThis.localStorage = memoryStorage;
    }
  });

  await it('accepts legacy component arrays, cableSchedule, and top-level tccSettings', () => {
    const tccSettings = { devices: [], settings: {}, componentOverrides: {} };
    const model = dataStore.buildProjectAnalysisModel({
      oneLineData: oneLine.sheets[0].components,
      cableSchedule: cables,
      tccSettings,
    });
    assert.strictEqual(model.oneLine.sheets.length, 1);
    assert.strictEqual(model.oneLine.sheets[0].components.length, 3);
    assert.strictEqual(model.cables[0].tag, 'CBL-SWBD-MCC');
    assert.deepStrictEqual(model.tccSettings, tccSettings);
  });

  await it('returns an empty model for missing or malformed input', () => {
    for (const input of [undefined, null, {}, { oneLine: 'bad', cables: 'bad' }]) {
      const model = dataStore.buildProjectAnalysisModel(input);
      assert.deepStrictEqual(model.oneLine, { activeSheet: 0, sheets: [] });
      assert.deepStrictEqual(model.cables, []);
    }
  });
});

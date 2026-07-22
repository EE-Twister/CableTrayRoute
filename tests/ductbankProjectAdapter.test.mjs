import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildDuctbankRouteHandoff, buildProjectDuctbankRoute, parseDuctbankRouteData } from '../src/ductbankProjectAdapter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 'ductbank-network.json'), 'utf8'));

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  OK', name); }
  catch (error) { console.error('  FAIL', name, error.message || error); process.exitCode = 1; }
}

describe('ductbank project adapter', () => {
  it('builds a populated route view from the shared Underground Ductbank project', () => {
    const route = buildProjectDuctbankRoute({
      ductbanks: sample.raceways.ductbanks,
      conduits: sample.raceways.conduits,
      cables: sample.cables,
    });

    assert.equal(route.ductbank.ductbank_id, 'DUCTBANK-DB-01');
    assert.equal(route.conduits.length, 4);
    assert.deepEqual(route.cables.map(cable => cable.tag), ['UG-CBL-001', 'UG-CBL-002']);
    assert.deepEqual(route.cables.map(cable => cable.conduit_id), ['DB01-COND-1', 'DB01-COND-2']);
    assert.ok(route.cables.every(cable => cable.est_load > 0));
    assert.ok(route.conduits.every(conduit => conduit.conduit_type === 'PVC Sch 40'));
  });

  it('accepts both current object handoffs and legacy JSON handoffs', () => {
    const handoff = { ductbank: { tag: 'DB-01' }, cables: [] };
    assert.deepEqual(parseDuctbankRouteData(handoff), handoff);
    assert.deepEqual(parseDuctbankRouteData(JSON.stringify(handoff)), handoff);
    assert.equal(parseDuctbankRouteData('{invalid'), null);
  });

  it('selects a requested ductbank and its assigned circuit', () => {
    const route = buildProjectDuctbankRoute({
      ductbanks: sample.raceways.ductbanks,
      conduits: sample.raceways.conduits,
      cables: sample.cables,
      selectedDuctbankId: 'DUCTBANK-DB-02',
    });

    assert.equal(route.ductbank.ductbank_id, 'DUCTBANK-DB-02');
    assert.deepEqual(route.cables.map(cable => cable.tag), ['UG-CBL-003']);
    assert.deepEqual(route.cables.map(cable => cable.conduit_id), ['DB02-COND-1']);
    assert.equal(route.conduits.length, 2);
  });

  it('keeps every conduit cable while preserving the selected conduit as focus metadata', () => {
    const ductbank = {
      ductbank_id: 'DB-HV-01',
      conduits: [
        { conduit_id: 'HV-C01', conduit_type: 'PVC Sch 40', trade_size: '4', row: 1, column: 1 },
        { conduit_id: 'HV-C04', conduit_type: 'PVC Sch 40', trade_size: '4', row: 1, column: 2 },
      ],
    };
    const cableCatalog = [
      { name: 'HV-001', diameter: 1.1, conductor_size: '500 kcmil' },
      { name: 'HV-002', diameter: 1.2, conductor_size: '500 kcmil' },
      { name: 'HV-003', diameter: 1.0, conductor_size: '350 kcmil' },
    ];
    const route = buildDuctbankRouteHandoff({
      ductbank,
      cableCatalog,
      selectedConduitId: 'HV-C04',
      trayCableMap: {
        'DB-HV-01-HV-C01': [cableCatalog[0], cableCatalog[1]],
        'DB-HV-01 - HV-C04': [{ name: 'HV-003' }],
      },
    });

    assert.equal(route.conduitId, 'HV-C04');
    assert.equal(route.conduits.length, 2);
    assert.deepEqual(route.cables.map(cable => cable.tag), ['HV-001', 'HV-002', 'HV-003']);
    assert.deepEqual(route.cables.map(cable => cable.conduit_id), ['HV-C01', 'HV-C01', 'HV-C04']);
  });
});

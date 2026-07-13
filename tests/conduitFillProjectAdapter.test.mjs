import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildProjectConduitFillContext, listProjectConduits } from '../src/conduitFillProjectAdapter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 'ductbank-network.json'), 'utf8'));

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  OK', name); }
  catch (error) { console.error('  FAIL', name, error.message || error); process.exitCode = 1; }
}

describe('conduit fill project adapter', () => {
  it('deduplicates flattened and nested project conduits', () => {
    const nested = sample.raceways.ductbanks.flatMap(ductbank => ductbank.conduits);
    const conduits = listProjectConduits({ conduits: nested, ductbanks: sample.raceways.ductbanks });
    assert.equal(conduits.length, 6);
  });

  it('opens a requested conduit with its assigned cable', () => {
    const context = buildProjectConduitFillContext({
      conduits: sample.raceways.conduits,
      ductbanks: sample.raceways.ductbanks,
      cables: sample.cables,
      selectedConduitId: 'DB01-COND-1',
    });
    assert.equal(context.conduitId, 'DB01-COND-1');
    assert.equal(context.ductbankId, 'DUCTBANK-DB-01');
    assert.equal(context.type, 'PVC Sch 40');
    assert.equal(context.tradeSize, '5');
    assert.deepEqual(context.cables.map(cable => cable.tag), ['UG-CBL-001']);
    assert.equal(context.availableConduits.length, 6);
  });
});

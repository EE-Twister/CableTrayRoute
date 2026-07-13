import assert from 'assert';
import { repairMojibake, repairMojibakeDeep } from '../src/textEncoding.js';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  OK', name); }
  catch (err) { console.error('  FAIL', name, err.message || err); process.exitCode = 1; }
}

describe('text encoding repair', () => {
  it('repairs common UTF-8 mojibake in sample descriptions', () => {
    assert.equal(repairMojibake('Substation â€” SW-1 15 kV'), 'Substation — SW-1 15 kV');
    assert.equal(repairMojibake('Pad T2 â†’ MDP'), 'Pad T2 → MDP');
  });

  it('repairs nested project records without mutating the source', () => {
    const source = {
      equipment: [{ description: 'Pad T2 â€” 15 kV/480 V' }],
      settings: { label: 'Step 1 Â· Equipment' }
    };
    const repaired = repairMojibakeDeep(source);
    assert.equal(repaired.equipment[0].description, 'Pad T2 — 15 kV/480 V');
    assert.equal(repaired.settings.label, 'Step 1 · Equipment');
    assert.notStrictEqual(repaired, source);
    assert.equal(source.equipment[0].description, 'Pad T2 â€” 15 kV/480 V');
  });
});

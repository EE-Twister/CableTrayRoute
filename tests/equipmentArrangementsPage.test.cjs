const assert = require('assert');
const fs = require('fs');
const path = require('path');

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

const root = path.resolve(__dirname, '..');

describe('equipment arrangements page', () => {
  const html = fs.readFileSync(path.join(root, 'equipmentarrangements.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'equipmentarrangements.js'), 'utf8');

  it('includes canvas wall drawing toggle button', () => {
    assert.ok(html.includes('id="draw-wall-mode"'), 'equipmentarrangements.html missing draw wall mode button');
  });

  it('includes interior wall orientation and type dropdowns', () => {
    assert.ok(html.includes('id="interior-orientation"'), 'equipmentarrangements.html missing interior orientation select');
    assert.ok(html.includes('id="interior-type"'), 'equipmentarrangements.html missing interior wall type select');
  });

  it('includes equipment voltage selector and zoom controls', () => {
    assert.ok(html.includes('id="equipment-voltage"'), 'equipmentarrangements.html missing equipment voltage select');
    assert.ok(html.includes('id="zoom-in"'), 'equipmentarrangements.html missing zoom-in button');
    assert.ok(html.includes('id="zoom-out"'), 'equipmentarrangements.html missing zoom-out button');
  });

  it('defines the expected wall type options', () => {
    ['Concrete', 'CMU', 'Gypsum', 'Fire Rated', 'Removable Panel'].forEach(type => {
      assert.ok(js.includes(`'${type}'`), `equipmentarrangements.js missing wall type: ${type}`);
    });
  });

  it('populates both exterior and interior wall type selects', () => {
    assert.ok(
      js.includes("['wall-north', 'wall-south', 'wall-east', 'wall-west', 'interior-type']"),
      'equipmentarrangements.js missing wall type select population call'
    );
  });

  it('defines and populates voltage options', () => {
    ['120V', '208V', '480V', '600V', '4.16kV', '13.8kV', '15kV'].forEach(voltage => {
      assert.ok(js.includes(`'${voltage}'`), `equipmentarrangements.js missing voltage option: ${voltage}`);
    });
    assert.ok(
      js.includes("populateSelect('equipment-voltage', VOLTAGE_OPTIONS)"),
      'equipmentarrangements.js missing voltage select population call'
    );
  });

  it('wires zoom in and zoom out handlers', () => {
    assert.ok(js.includes("document.getElementById('zoom-in').addEventListener('click'"), 'equipmentarrangements.js missing zoom-in handler');
    assert.ok(js.includes("document.getElementById('zoom-out').addEventListener('click'"), 'equipmentarrangements.js missing zoom-out handler');
    assert.ok(js.includes('state.scale = clamp(state.scale + 2, 8, 45);'), 'equipmentarrangements.js missing zoom-in scale update');
    assert.ok(js.includes('state.scale = clamp(state.scale - 2, 8, 45);'), 'equipmentarrangements.js missing zoom-out scale update');
  });
});

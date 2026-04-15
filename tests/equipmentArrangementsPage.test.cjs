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
});

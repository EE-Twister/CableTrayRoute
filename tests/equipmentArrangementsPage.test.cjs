const assert = require('assert');
const fs = require('fs');
const path = require('path');

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err.message || err);
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

  it('defines the expected wall type options including Metal', () => {
    ['Concrete', 'CMU', 'Gypsum', 'Metal', 'Fire Rated', 'Removable Panel'].forEach(type => {
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

  it('supports multi-select via selectedIds Set', () => {
    assert.ok(js.includes('selectedIds: new Set()'), 'equipmentarrangements.js missing selectedIds Set in state');
    assert.ok(js.includes('event.shiftKey'), 'equipmentarrangements.js missing shift-key multi-select logic');
    assert.ok(js.includes('state.selectedIds.add('), 'equipmentarrangements.js missing selectedIds.add');
    assert.ok(js.includes('state.selectedIds.has('), 'equipmentarrangements.js missing selectedIds.has');
  });

  it('includes relative alignment options for multi-select', () => {
    assert.ok(js.includes('Align Top Edges'), 'equipmentarrangements.js missing Align Top Edges');
    assert.ok(js.includes('Align Bottom Edges'), 'equipmentarrangements.js missing Align Bottom Edges');
    assert.ok(js.includes('Align Left Edges'), 'equipmentarrangements.js missing Align Left Edges');
    assert.ok(js.includes('Align Right Edges'), 'equipmentarrangements.js missing Align Right Edges');
  });

  it('scales text labels with zoom level', () => {
    assert.ok(js.includes('labelFontSize'), 'equipmentarrangements.js missing labelFontSize function');
    assert.ok(js.includes('element.style.fontSize'), 'equipmentarrangements.js missing dynamic font-size assignment');
  });

  it('includes undo history mechanism', () => {
    assert.ok(js.includes('history: []'), 'equipmentarrangements.js missing history array in state');
    assert.ok(js.includes('function pushHistory'), 'equipmentarrangements.js missing pushHistory function');
    assert.ok(js.includes('function undoLastAction'), 'equipmentarrangements.js missing undoLastAction function');
    assert.ok(html.includes('id="undo-action"'), 'equipmentarrangements.html missing undo button');
    assert.ok(js.includes("event.key === 'z'"), 'equipmentarrangements.js missing Ctrl+Z keyboard handler');
  });

  it('includes doorway support', () => {
    assert.ok(js.includes('doorways: []'), 'equipmentarrangements.js missing doorways array in state');
    assert.ok(js.includes('function addDoorway'), 'equipmentarrangements.js missing addDoorway function');
    assert.ok(js.includes('function renderDoorways'), 'equipmentarrangements.js missing renderDoorways function');
    assert.ok(html.includes('id="add-doorway"'), 'equipmentarrangements.html missing Add Doorway button');
    assert.ok(html.includes('id="doorway-wall"'), 'equipmentarrangements.html missing doorway wall select');
    assert.ok(html.includes('id="doorway-egress"'), 'equipmentarrangements.html missing doorway egress checkbox');
  });

  it('uses NEC Condition 2 clearance for Metal walls', () => {
    assert.ok(js.includes("function isConductive"), 'equipmentarrangements.js missing isConductive helper');
    assert.ok(js.includes("wallType === 'Metal'"), 'equipmentarrangements.js missing Metal wall conductivity check');
  });
});

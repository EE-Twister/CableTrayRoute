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
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const distJs = fs.readFileSync(path.join(root, 'dist', 'equipmentarrangements.js'), 'utf8');

  it('includes canvas wall drawing toggle button', () => {
    assert.ok(html.includes('id="draw-wall-mode"'), 'equipmentarrangements.html missing draw wall mode button');
  });

  it('includes interior wall orientation and type dropdowns', () => {
    assert.ok(html.includes('id="interior-orientation"'), 'equipmentarrangements.html missing interior orientation select');
    assert.ok(html.includes('id="interior-type"'), 'equipmentarrangements.html missing interior wall type select');
  });

  it('includes equipment voltage selector and zoom controls', () => {
    assert.ok(html.includes('id="equipment-voltage"'), 'equipmentarrangements.html missing equipment voltage select');
    assert.ok(html.includes('id="equipment-height"'), 'equipmentarrangements.html missing equipment height input');
    assert.ok(html.includes('id="equipment-base-elevation"'), 'equipmentarrangements.html missing equipment base elevation input');
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
    assert.ok(html.includes('id="doorway-swing"'), 'equipmentarrangements.html missing doorway swing selector');
    assert.ok(html.includes('id="doorway-egress"'), 'equipmentarrangements.html missing doorway egress checkbox');
    assert.ok(js.includes("document.getElementById('doorway-swing')"), 'equipmentarrangements.js missing doorway swing input');
    assert.ok(js.includes('function canvasPaddingPx'), 'equipmentarrangements.js missing outward swing canvas padding');
    assert.ok(js.includes("door.swing === 'out'"), 'equipmentarrangements.js missing outward swing rendering branch');
  });

  it('ships doorway support in the loaded browser bundle', () => {
    [
      'doorways',
      'doorway-swing',
      'doorway-egress',
      'add-doorway',
      'canvasPadding',
      'isEgress',
      'out'
    ].forEach(fragment => {
      assert.ok(distJs.includes(fragment), `dist/equipmentarrangements.js missing doorway runtime token ${fragment}`);
    });
  });

  it('supports multiple named equipment arrangements', () => {
    assert.ok(html.includes('id="arrangement-select"'), 'equipmentarrangements.html missing arrangement selector');
    assert.ok(html.includes('id="prev-arrangement"'), 'equipmentarrangements.html missing previous arrangement control');
    assert.ok(html.includes('id="next-arrangement"'), 'equipmentarrangements.html missing next arrangement control');
    assert.ok(html.includes('id="add-arrangement"'), 'equipmentarrangements.html missing add arrangement control');
    assert.ok(html.includes('id="duplicate-arrangement"'), 'equipmentarrangements.html missing duplicate arrangement control');
    assert.ok(html.includes('id="delete-arrangement"'), 'equipmentarrangements.html missing delete arrangement control');
    assert.ok(js.includes("const ARRANGEMENTS_KEY = 'equipmentArrangements'"), 'equipmentarrangements.js missing arrangements storage key');
    assert.ok(js.includes('function switchArrangement'), 'equipmentarrangements.js missing switchArrangement function');
    assert.ok(js.includes('function cycleArrangement'), 'equipmentarrangements.js missing cycleArrangement function');
    assert.ok(js.includes('function duplicateArrangement'), 'equipmentarrangements.js missing duplicateArrangement function');
    assert.ok(js.includes('dataStore.setItem(ARRANGEMENTS_KEY'), 'equipmentarrangements.js missing arrangement persistence');
  });

  it('ships multiple arrangement support in the loaded browser bundle', () => {
    [
      'equipmentArrangements',
      'activeArrangementId',
      'arrangements',
      'arrangement-select',
      'next-arrangement',
      'duplicate-arrangement',
      'delete-arrangement',
      'listAssignment'
    ].forEach(fragment => {
      assert.ok(distJs.includes(fragment), `dist/equipmentarrangements.js missing arrangement runtime token ${fragment}`);
    });
  });

  it('includes automatic equipment layout support', () => {
    assert.ok(html.includes('id="auto-layout-equipment"'), 'equipmentarrangements.html missing auto-layout button');
    assert.ok(html.includes('id="build-arrangements-from-list"'), 'equipmentarrangements.html missing build-from-list button');
    assert.ok(html.includes('id="auto-layout-status"'), 'equipmentarrangements.html missing auto-layout status');
    assert.ok(js.includes('function autoLayoutEquipment'), 'equipmentarrangements.js missing autoLayoutEquipment function');
    assert.ok(js.includes('function findAutoLayoutPosition'), 'equipmentarrangements.js missing auto-layout placement search');
    assert.ok(js.includes('function autoLayoutCandidateConflicts'), 'equipmentarrangements.js missing auto-layout conflict checks');
    assert.ok(js.includes('function buildArrangementsFromEquipmentList'), 'equipmentarrangements.js missing build-from-list function');
    assert.ok(js.includes('function assignedEquipmentGroups'), 'equipmentarrangements.js missing equipment assignment grouping');
    assert.ok(js.includes('function equipmentAssignedToActiveArrangement'), 'equipmentarrangements.js missing active arrangement assignment filter');
    assert.ok(js.includes("source: arrangement.source || 'manual'"), 'equipmentarrangements.js should persist arrangement source');
    assert.ok(js.includes('listAssignment: arrangement.listAssignment ||'), 'equipmentarrangements.js should persist list assignment');
    assert.ok(
      js.includes("document.getElementById('auto-layout-equipment').addEventListener('click', autoLayoutEquipment)"),
      'equipmentarrangements.js missing auto-layout click handler'
    );
    assert.ok(
      js.includes("document.getElementById('build-arrangements-from-list').addEventListener('click', buildArrangementsFromEquipmentList)"),
      'equipmentarrangements.js missing build-from-list click handler'
    );
  });

  it('includes lineup, dimension, saved view, and sheet export tools', () => {
    [
      'id="show-dimensions"',
      'id="snap-selected"',
      'id="align-selected-west"',
      'id="align-selected-south"',
      'id="equal-space-selected"',
      'id="lineup-name"',
      'id="assign-lineup"',
      'id="select-lineup"',
      'id="space-lineup"',
      'id="saved-view-select"',
      'id="save-view"',
      'id="apply-view"',
      'id="delete-view"',
      'id="export-layout-report"',
      'id="clearance-detail-list"'
    ].forEach(fragment => {
      assert.ok(html.includes(fragment), `equipmentarrangements.html missing ${fragment}`);
    });
    [
      'function renderLineups',
      'function renderDimensions',
      'function compactToolbarControls',
      'function assignSelectedLineup',
      'function equalSpaceSelected',
      'function saveNamedView',
      'function applyNamedView',
      'function exportLayoutReportSvg',
      'function renderClearanceDetails',
      'violationDetails: new Map()',
      'savedViews: cloneSavedViews'
    ].forEach(fragment => {
      assert.ok(js.includes(fragment), `equipmentarrangements.js missing ${fragment}`);
    });
    [
      'icons/toolbar/add-arrangement.svg',
      'icons/toolbar/auto-layout.svg',
      'icons/toolbar/snap.svg',
      'icons/toolbar/delete-selected.svg',
      'icons/toolbar/delete-view.svg',
      'icons/toolbar/download.svg',
      'icons/toolbar/distribute-v.svg'
    ].forEach(fragment => {
      assert.ok(js.includes(fragment), `equipmentarrangements.js missing unique icon ${fragment}`);
      assert.ok(fs.existsSync(path.join(root, fragment)), `missing toolbar icon file ${fragment}`);
    });
    assert.ok(css.includes('.equipment-lineup-outline'), 'style.css missing lineup outline styling');
    assert.ok(css.includes('.equipment-dimension-line'), 'style.css missing dimension styling');
    assert.ok(css.includes('.equipment-icon-btn'), 'style.css missing compact icon button styling');
    assert.ok(css.includes('align-items:center; justify-content:center'), 'style.css should center toolbar icons');
    assert.ok(css.includes('data-tooltip'), 'style.css missing toolbar tooltip styling');
    assert.ok(css.includes('.equipment-clearance-details'), 'style.css missing clearance detail styling');
  });

  it('ships lineup, dimension, saved view, and sheet export tools in the loaded browser bundle', () => {
    [
      'lineup-name',
      'assign-lineup',
      'select-lineup',
      'space-lineup',
      'show-dimensions',
      'saved-view-select',
      'save-view',
      'apply-view',
      'delete-view',
      'export-layout-report',
      'clearance-detail-list',
      'violationDetails',
      'savedViews'
    ].forEach(fragment => {
      assert.ok(distJs.includes(fragment), `dist/equipmentarrangements.js missing ${fragment}`);
    });
    [
      'icons/toolbar/auto-layout.svg',
      'icons/toolbar/snap.svg',
      'icons/toolbar/delete-selected.svg',
      'icons/toolbar/download.svg',
      'icons/toolbar/distribute-v.svg'
    ].forEach(fragment => {
      assert.ok(distJs.includes(fragment), `dist/equipmentarrangements.js missing unique icon ${fragment}`);
    });
  });

  it('ships automatic equipment layout support in the loaded browser bundle', () => {
    [
      'auto-layout-equipment',
      'build-arrangements-from-list',
      'best available placement',
      'equipment-list',
      'manual',
      'source',
      'listAssignment'
    ].forEach(fragment => {
      assert.ok(distJs.includes(fragment), `dist/equipmentarrangements.js missing auto-layout runtime token ${fragment}`);
    });
  });

  it('includes wall elevation view support', () => {
    assert.ok(html.includes('id="elevation-wall"'), 'equipmentarrangements.html missing elevation wall selector');
    assert.ok(html.includes('<option value="selected">Selected Equipment</option>'), 'equipmentarrangements.html missing selected equipment elevation option');
    assert.ok(html.includes('id="download-elevation-svg"'), 'equipmentarrangements.html missing elevation SVG download button');
    assert.ok(html.includes('id="equipment-elevation-canvas"'), 'equipmentarrangements.html missing elevation canvas');
    assert.ok(js.includes('const DEFAULT_EQUIPMENT_HEIGHT = 7'), 'equipmentarrangements.js missing default elevation height');
    assert.ok(js.includes('function renderElevation'), 'equipmentarrangements.js missing elevation renderer');
    assert.ok(js.includes('function renderElevationEquipment'), 'equipmentarrangements.js missing elevation equipment projection');
    assert.ok(js.includes('function equipmentElevationWall'), 'equipmentarrangements.js missing physical wall placement helper');
    assert.ok(js.includes('function syncElevationWallToSelectedEquipment'), 'equipmentarrangements.js missing elevation follow-selected helper');
    assert.ok(js.includes('ELEVATION_WALL_TOLERANCE_FT'), 'equipmentarrangements.js missing wall placement tolerance');
    assert.ok(js.includes('equipmentForElevationWall(wall)'), 'equipmentarrangements.js should filter elevations by physical wall placement');
    assert.ok(js.includes('function selectedElevationProfile'), 'equipmentarrangements.js missing selected equipment elevation profile');
    assert.ok(js.includes('function renderSelectedElevationEquipment'), 'equipmentarrangements.js missing selected equipment elevation projection');
    assert.ok(js.includes("wall === 'selected'"), 'equipmentarrangements.js missing selected equipment elevation mode');
    assert.ok(js.includes('function downloadElevationSvg'), 'equipmentarrangements.js missing elevation download');
    assert.ok(js.includes("document.getElementById('elevation-wall').addEventListener('change', renderElevation)"), 'equipmentarrangements.js missing elevation wall change handler');
    assert.ok(css.includes('#equipment-elevation-canvas'), 'style.css missing elevation canvas styling');
    assert.ok(css.includes('.equipment-elevation-block'), 'style.css missing elevation equipment styling');
  });

  it('ships wall elevation view support in the loaded browser bundle', () => {
    [
      'equipment-elevation-canvas',
      'elevation-wall',
      'download-elevation-svg',
      'equipment-height',
      'equipment-base-elevation',
      'baseElevation',
      'selected',
      'height'
    ].forEach(fragment => {
      assert.ok(distJs.includes(fragment), `dist/equipmentarrangements.js missing elevation runtime token ${fragment}`);
    });
  });

  it('uses NEC Condition 2 clearance for Metal walls', () => {
    assert.ok(js.includes("function isConductive"), 'equipmentarrangements.js missing isConductive helper');
    assert.ok(js.includes("wallType === 'Metal'"), 'equipmentarrangements.js missing Metal wall conductivity check');
  });

  it('keeps the drawing canvas on a light drafting surface', () => {
    assert.ok(
      css.includes('--equipment-canvas-bg:#eef4fb'),
      'style.css missing dedicated equipment canvas background token'
    );
    assert.ok(
      css.includes('background:var(--equipment-canvas-bg,#eef4fb)'),
      'equipment canvas background should not inherit the global secondary color'
    );
    assert.ok(
      css.includes('.equipment-room-fill,.equipment-room-outer'),
      'equipment room fill should cover the emitted SVG room rectangle class'
    );
    assert.ok(
      css.includes('.equipment-doorway-panel') && css.includes('#0ea36e'),
      'doorway strokes should be visibly styled on the canvas'
    );
  });
});

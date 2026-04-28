import assert from 'node:assert/strict';
import {
  buildRacewayAccessoryTakeoff,
  buildRacewayConstructionPackage,
  buildRacewaySectionExtraction,
  normalizeRacewayConstructionDetail,
  normalizeRacewayDetailRows,
  renderRacewayConstructionHTML,
} from '../analysis/racewayConstructionDetailing.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

describe('raceway construction detailing helpers', () => {
  it('normalizes legacy rows with blank construction metadata', () => {
    const row = normalizeRacewayConstructionDetail({
      tray_id: 'TR-1',
      start_x: 0,
      start_y: 0,
      start_z: 0,
      end_x: 24,
      end_y: 0,
      end_z: 0,
      inside_width: 24,
      tray_depth: 4,
      tray_type: 'Ladder',
    }, { racewayType: 'tray' });
    assert.equal(row.racewayId, 'TR-1');
    assert.equal(row.racewayType, 'tray');
    assert.equal(row.supportType, '');
    assert.equal(row.constructionStatus, 'notStarted');
    assert.equal(row.lengthFt, 24);
    assert(row.warnings.some(message => message.includes('support type')));
  });

  it('builds deterministic support, divider, label, and manual accessory takeoff rows', () => {
    const rows = normalizeRacewayDetailRows({
      trays: [{
        tray_id: 'TR-2',
        start_x: 0,
        start_y: 0,
        start_z: 0,
        end_x: 30,
        end_y: 0,
        end_z: 0,
        inside_width: 18,
        tray_depth: 4,
        num_slots: 2,
        supportFamily: 'Unistrut',
        supportType: 'trapeze',
        supportSpacingFt: 10,
        labelId: 'LBL-TR-2',
        drawingRef: 'E-201',
        sectionRef: 'SEC-A',
        constructionStatus: 'released',
        accessoryKits: '[{"name":"Cover kit","quantity":3,"unit":"ea"},{"name":"Hanger kit","quantity":4}]',
      }],
    });
    const takeoff = buildRacewayAccessoryTakeoff(rows);
    assert(takeoff.some(row => row.category === 'Support' && row.quantity === 4));
    assert(takeoff.some(row => row.category === 'Divider'));
    assert(takeoff.some(row => row.category === 'Label'));
    assert(takeoff.some(row => row.item === 'Cover kit' && row.quantity === 3));
    assert(takeoff.some(row => row.item === 'Hanger kit' && row.quantity === 4));
  });

  it('flags divider lane mismatch and invalid accessory JSON', () => {
    const pkg = buildRacewayConstructionPackage({
      trays: [{
        tray_id: 'TR-3',
        start_x: 0,
        start_y: 0,
        end_x: 10,
        end_y: 0,
        inside_width: 12,
        tray_depth: 4,
        num_slots: 1,
        dividerLane: '3',
        accessoryKits: '{bad json}',
      }],
    });
    assert(pkg.warningRows.some(row => row.code === 'dividerLaneMismatch'));
    assert(pkg.warningRows.some(row => row.code === 'invalidAccessoryKits'));
    assert.equal(pkg.summary.fail, 1);
  });

  it('extracts section rows with geometry, refs, labels, and field links', () => {
    const row = normalizeRacewayConstructionDetail({
      conduit_id: 'C-101',
      type: 'RMC',
      trade_size: '3',
      start_x: 1,
      start_y: 2,
      start_z: 3,
      end_x: 4,
      end_y: 6,
      end_z: 3,
      supportType: 'strut',
      supportSpacingFt: 8,
      labelId: 'LBL-C-101',
      drawingRef: 'E-310',
      detailRef: 'D-4',
      sectionRef: 'SEC-C',
      constructionStatus: 'installed',
      constructionNotes: 'Route past <rack>',
    }, { racewayType: 'conduit' });
    const sections = buildRacewaySectionExtraction([row]);
    assert.equal(sections[0].racewayId, 'C-101');
    assert.equal(sections[0].sectionRef, 'SEC-C');
    assert.equal(sections[0].start.x, 1);
    assert(sections[0].fieldViewHref.includes('conduit=C-101'));
  });

  it('builds package summary and escapes rendered HTML', () => {
    const pkg = buildRacewayConstructionPackage({
      projectName: 'Unit <A>',
      trays: [{
        tray_id: 'TR-<4>',
        start_x: 0,
        start_y: 0,
        end_x: 12,
        end_y: 0,
        inside_width: 12,
        tray_depth: 4,
        supportFamily: 'Strut <A>',
        supportType: 'trapeze',
        supportSpacingFt: 6,
        labelId: 'LBL <4>',
        drawingRef: 'E <400>',
        sectionRef: 'SEC <4>',
        constructionStatus: 'released',
        accessoryKits: '[{"name":"Cover <kit>","quantity":1}]',
        constructionNotes: 'Install near <beam>',
      }],
      conduits: [],
      ductbanks: [],
    });
    assert.equal(pkg.version, 'raceway-construction-detailing-v1');
    assert.equal(pkg.summary.detailCount, 1);
    assert.equal(pkg.summary.takeoffRowCount > 0, true);
    const html = renderRacewayConstructionHTML(pkg);
    assert(html.includes('TR-&lt;4&gt;'));
    assert(html.includes('Cover &lt;kit&gt;'));
    assert(!html.includes('TR-<4>'));
  });
});

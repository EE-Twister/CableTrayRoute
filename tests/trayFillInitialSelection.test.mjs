/**
 * Cable Tray Fill opens on a project tray instead of a blank 12 in tray
 * (application review U5), without overriding a stored handoff, an explicit
 * ?tray= request, or the "New blank tray" choice.
 */
import assert from 'node:assert/strict';
import {
  BLANK_TRAY_PARAM,
  findTrayById,
  selectInitialTray,
  trayIdentity,
} from '../src/tray-fill/initialTraySelection.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (error) { console.error('  ✗', name, error.message || error); process.exitCode = 1; }
}

const TRAYS = [
  { tray_id: 'TR-EMPTY', inside_width: 12, tray_depth: 4 },
  { tray_id: 'TR-PWR-101', inside_width: 24, tray_depth: 4 },
  { tray_id: 'TR-CTL-201', inside_width: 18, tray_depth: 6 },
];
const ASSIGNED = { 'TR-PWR-101': [{ tag: 'CBL-1' }], 'TR-CTL-201': [{ tag: 'CBL-2' }] };
const cablesForTray = trayId => ASSIGNED[trayId] || [];

describe('trayIdentity / findTrayById', () => {
  it('reads tray_id, tag, or id', () => {
    assert.equal(trayIdentity({ tray_id: ' TR-1 ' }), 'TR-1');
    assert.equal(trayIdentity({ tag: 'TR-2' }), 'TR-2');
    assert.equal(trayIdentity({ id: 'TR-3' }), 'TR-3');
    assert.equal(trayIdentity(null), '');
  });

  it('matches ids case-insensitively and ignores blanks', () => {
    assert.equal(findTrayById(TRAYS, 'tr-pwr-101')?.tray_id, 'TR-PWR-101');
    assert.equal(findTrayById(TRAYS, ''), null);
    assert.equal(findTrayById(null, 'TR-PWR-101'), null);
  });
});

describe('selectInitialTray', () => {
  it('opens the first project tray that carries cables', () => {
    const result = selectInitialTray({ search: '', trays: TRAYS, cablesForTray });
    assert.equal(result.source, 'first');
    assert.equal(result.tray.tray_id, 'TR-PWR-101');
  });

  it('falls back to the first project tray when no tray carries cables', () => {
    const result = selectInitialTray({ search: '?e2e=1', trays: TRAYS, cablesForTray: () => [] });
    assert.equal(result.source, 'first');
    assert.equal(result.tray.tray_id, 'TR-EMPTY');
  });

  it('opens the tray named in ?tray=, even when it has no cables', () => {
    const result = selectInitialTray({ search: '?tray=TR-EMPTY', trays: TRAYS, cablesForTray });
    assert.equal(result.source, 'url');
    assert.equal(result.tray.tray_id, 'TR-EMPTY');
  });

  it('reports a ?tray= id that is not in the project instead of showing another tray', () => {
    const result = selectInitialTray({ search: '?tray=TR-GONE', trays: TRAYS, cablesForTray });
    assert.deepEqual(result, { source: 'missing', requestedTrayId: 'TR-GONE' });
  });

  it('keeps a stored handoff ahead of ?tray= and the first tray', () => {
    const stored = { tray: { tray_id: 'TR-CTL-201', width: 18, height: 6 }, cables: [{ tag: 'CBL-2' }] };
    const result = selectInitialTray({ stored, search: '?tray=TR-PWR-101', trays: TRAYS, cablesForTray });
    assert.equal(result.source, 'handoff');
    assert.equal(result.context, stored);
  });

  it('ignores a stored value without a tray', () => {
    const result = selectInitialTray({ stored: { cables: [] }, search: '?tray=TR-CTL-201', trays: TRAYS, cablesForTray });
    assert.equal(result.source, 'url');
    assert.equal(result.tray.tray_id, 'TR-CTL-201');
  });

  it('honours the New blank tray choice', () => {
    const result = selectInitialTray({ search: `?${BLANK_TRAY_PARAM}=1`, trays: TRAYS, cablesForTray });
    assert.deepEqual(result, { source: 'blank' });
  });

  it('stays on the blank tray when the project has no trays', () => {
    assert.deepEqual(selectInitialTray({ search: '', trays: [], cablesForTray }), { source: 'blank' });
    assert.deepEqual(selectInitialTray({ trays: [{ width: 12 }] }), { source: 'blank' });
  });
});

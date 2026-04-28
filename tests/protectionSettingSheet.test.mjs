import assert from 'node:assert/strict';
import {
  buildProtectionSettingPackage,
  buildProtectionSettingRows,
  buildProtectionTestRows,
  normalizeProtectionSettingSheet,
  renderProtectionSettingSheetHTML,
  validateProtectionSettingSheet,
} from '../analysis/protectionSettingSheet.mjs';

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

const protectiveDevices = [
  {
    id: 'relay-a',
    type: 'relay',
    vendor: 'RelayCo',
    name: 'RelayCo 751',
    settings: {
      pickup: 600,
      time: 0.4,
      instantaneous: 4800,
      instantaneousDelay: 0.03,
    },
    curve: [
      { current: 600, time: 20 },
      { current: 1200, time: 4 },
      { current: 6000, time: 0.05 },
    ],
    tolerance: { timeLower: 0.8, timeUpper: 1.2 },
  },
  {
    id: 'relay-gfp',
    type: 'relay',
    vendor: 'RelayCo',
    name: 'RelayCo Ground',
    groundFault: true,
    settings: {
      pickup: 400,
      time: 0.5,
      groundPickup: 80,
      groundDelay: 0.2,
    },
    curve: [
      { current: 80, time: 10 },
      { current: 160, time: 2 },
      { current: 800, time: 0.1 },
    ],
  },
];

const oneLine = {
  sheets: [{
    name: 'Main',
    components: [
      {
        id: 'br-1',
        type: 'relay',
        label: 'Relay <Main>',
        tccId: 'relay-a',
        tccOverrides: { pickup: 500, time: 0.3 },
        props: {
          ctRatio: '600:5',
          ptRatio: '480:120',
          settingRevision: 'R1',
          reviewer: 'P. Engineer',
          activeGroup: 'Normal',
          connectedBus: 'SWBD-1',
        },
      },
      {
        id: 'gfp-1',
        type: 'relay',
        label: 'Ground Relay',
        tccId: 'relay-gfp',
        props: { ctRatio: '200:5' },
      },
    ],
  }],
};

describe('protection setting sheet helpers', () => {
  it('normalizes legacy empty packages without requiring setting-sheet data', () => {
    const pkg = normalizeProtectionSettingSheet({});
    assert.equal(pkg.version, 'protection-setting-sheet-v1');
    assert.equal(pkg.deviceRows.length, 0);
    assert.equal(pkg.summary.deviceCount, 0);
  });

  it('builds device and function rows from linked one-line protective components', () => {
    const rows = buildProtectionSettingRows({ oneLine, protectiveDevices, tccSettings: {} });
    assert.equal(rows.deviceRows.length, 2);
    assert(rows.deviceRows.some(row => row.deviceTag === 'Relay <Main>' && row.catalogDeviceId === 'relay-a'));
    const phase51 = rows.functionRows.find(row => row.componentId === 'br-1' && row.functionCode === '51');
    const phase50 = rows.functionRows.find(row => row.componentId === 'br-1' && row.functionCode === '50');
    assert.equal(phase51.pickupA, 500);
    assert.equal(phase51.secondaryPickupA, 4.1667);
    assert.equal(phase50.instantaneousPickupA, 4800);
    assert(rows.functionRows.some(row => row.componentId === 'gfp-1' && row.functionCode === '51G'));
  });

  it('validates missing catalog and CT/PT governance fields deterministically', () => {
    const validation = validateProtectionSettingSheet({ deviceTag: 'Relay X', revision: 'R0' }, null);
    assert.equal(validation.status, 'missingData');
    assert(validation.warnings.some(warning => warning.includes('catalog')));
    assert(validation.warnings.some(warning => warning.includes('CT ratio')));
  });

  it('builds secondary-injection test rows from scaled TCC curves and tolerance bands', () => {
    const rows = buildProtectionSettingRows({ oneLine, protectiveDevices });
    const testRows = buildProtectionTestRows(rows, { protectiveDevices });
    const main51 = testRows.find(row => row.componentId === 'br-1' && row.functionCode === '51');
    assert(main51);
    assert.equal(main51.testCurrentPrimaryA, 1000);
    assert.equal(main51.secondaryInjectionA, 8.3333);
    assert(Number.isFinite(main51.expectedTripSec));
    assert(main51.toleranceMinSec < main51.expectedTripSec);
    assert(main51.toleranceMaxSec > main51.expectedTripSec);
    assert.equal(main51.status, 'pass');
  });

  it('builds package JSON and escapes rendered HTML', () => {
    const pkg = buildProtectionSettingPackage({
      projectName: 'Protection <Demo>',
      oneLine,
      protectiveDevices,
      coordinationState: { maxFaultA: 42000, margin: 0.3, result: { allCoordinated: true, results: [{ id: 'br-1' }] } },
      generatedAt: '2026-04-27T12:00:00.000Z',
    });
    assert.equal(pkg.version, 'protection-setting-sheet-v1');
    assert.equal(pkg.summary.deviceCount, 2);
    assert.equal(pkg.summary.coordinationLinked, true);
    assert(pkg.functionRows.some(row => row.functionCode === '50'));
    assert(pkg.testRows.length >= 2);
    const html = renderProtectionSettingSheetHTML(pkg);
    assert(html.includes('Relay &lt;Main&gt;'));
    assert(!html.includes('Relay <Main>'));
    assert.doesNotThrow(() => JSON.stringify(pkg));
  });
});

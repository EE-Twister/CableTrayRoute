/**
 * Every short-circuit entry point must include feeder impedance from the
 * Cable Schedule. The One-Line "Short Circuit" button runs in a Web Worker
 * that has no storage, so its inputs must be shipped with the request; the
 * "Arc Flash" basis and the IEC 60909 page run on the main thread.
 *
 * Fixture: a 20 MVA, X/R 10 utility source at 480 V feeding MCC-1 through
 * 100 ft of #4 AWG copper in PVC. With the One-Line default IEC method the
 * MCC sees 8.46 kA with the cable and 26.46 kA if the cable is dropped.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

async function openToolbarMenu(page, name) {
  await page.waitForTimeout(200);
  await page.locator('summary.command-menu-trigger', { hasText: new RegExp(`^${name}`) }).first().click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('scCableParitySeeded') === 'true') return;
    localStorage.clear();
    sessionStorage.setItem('scCableParitySeeded', 'true');
    localStorage.setItem('onelineTourDone', 'true');
    localStorage.setItem('base:cableSchedule', JSON.stringify([{
      tag: 'CBL-SWBD-MCC', from: 'SWBD-1', to: 'MCC-1', conductor_size: '#4 AWG',
      conductor_material: 'Copper', raceway_material: 'PVC', length_ft: 100
    }]));
    localStorage.setItem('base:oneLineDiagram', JSON.stringify({
      activeSheet: 0,
      sheets: [{
        name: 'Cable parity fixture',
        components: [
          { id: 'source', type: 'source', subtype: 'utility_source', label: 'SWBD-1', equipmentRef: 'SWBD-1',
            x: 80, y: 80, voltage: 480, thevenin_mva: 20, xr_ratio: 10, connections: [{ target: 'load_bus' }] },
          { id: 'load_bus', type: 'equipment', label: 'MCC-1', equipmentRef: 'MCC-1', x: 80, y: 240, voltage: 480 }
        ],
        connections: []
      }]
    }));
  });
});

test('One-Line Short Circuit (worker) and Arc Flash basis include Cable Schedule impedance', async ({ page }) => {
  await page.goto(pageUrl('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  await openToolbarMenu(page, 'Review');
  await page.locator('#studies-panel-btn').click();

  await page.locator('#run-shortcircuit-btn').click();
  await page.waitForFunction(() => window.dataStore.getStudies().shortCircuit?.load_bus);
  const standalone = await page.evaluate(() => window.dataStore.getStudies().shortCircuit);
  expect(standalone.load_bus.method).toBe('IEC');
  expect(standalone.load_bus.threePhaseKA).toBeCloseTo(8.46, 2);
  expect(standalone.load_bus.impedanceProvenance.segments.map(segment => segment.source)).toContain('Cable Schedule');

  await page.evaluate(() => {
    const studies = window.dataStore.getStudies();
    delete studies.shortCircuit;
    window.dataStore.setStudies(studies);
  });
  await page.locator('#run-arcflash-btn').click();
  await page.waitForFunction(() => window.dataStore.getStudies().shortCircuit?.load_bus);
  const arcFlashBasis = await page.evaluate(() => window.dataStore.getStudies().shortCircuit);
  expect(arcFlashBasis.load_bus.threePhaseKA).toBe(standalone.load_bus.threePhaseKA);
});

test('IEC 60909 page includes Cable Schedule impedance', async ({ page }) => {
  await page.goto(pageUrl('iec60909.html?e2e=1'));
  await page.locator('#run-btn').click();
  await page.waitForFunction(() => window.dataStore?.getStudies?.().iec60909?.load_bus
    || JSON.parse(localStorage.getItem('base:studyResults') || '{}').iec60909?.load_bus);
  const result = await page.evaluate(() => (window.dataStore?.getStudies?.()
    || JSON.parse(localStorage.getItem('base:studyResults') || '{}')).iec60909);
  expect(result.load_bus.impedanceProvenance.segments.map(segment => segment.source)).toContain('Cable Schedule');
  expect(result.load_bus.threePhaseKA).toBeLessThan(result.source.threePhaseKA);
});

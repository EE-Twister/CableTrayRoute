import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = (file: string) => 'file://' + path.join(root, file);

test('raceway samples roundtrip and route', async ({ page }) => {
  const racewayPath = path.join(root, 'examples', 'sampleRaceways.json');
  const racewayJson = fs.readFileSync(racewayPath, 'utf-8');
  const cablePath = path.join(root, 'examples', 'sampleCables.json');
  const cableJson = fs.readFileSync(cablePath, 'utf-8');
  await page.addInitScript(({ racewayJson, cableJson }) => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: undefined
    });
    const originalFetch = window.fetch;
    window.fetch = (input, init) => {
      if (typeof input === 'string') {
        if (input.endsWith('examples/sampleRaceways.json')) {
          return Promise.resolve(new Response(racewayJson, { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        if (input.endsWith('examples/sampleCables.json')) {
          return Promise.resolve(new Response(cableJson, { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
      }
      return originalFetch(input, init);
    };
  }, { racewayJson, cableJson });
  await page.goto(pageUrl('cableschedule.html?e2e=1'));
  await page.click('#load-sample-cables-btn');
  await page.waitForSelector('#cableScheduleTable tbody tr', { state: 'attached' });
  await expect.poll(() => page.evaluate(() => window.dataStore?.getCables?.().length || 0)).toBeGreaterThan(0);

  await page.goto(pageUrl('racewayschedule.html?e2e=1'));
  await page.waitForSelector('[data-raceway-ready="1"]');
  await page.waitForSelector('#raceway-load-samples');
  await page.click('#raceway-load-samples');
  await page.evaluate(
    () => new Promise(r => document.addEventListener('samples-loaded', r, { once: true })),
  );
  await page.waitForSelector('#ductbankTable > tbody > tr:not(.conduit-container)', { state: 'attached' });
  await page.waitForSelector('#trayTable tbody tr', { state: 'attached' });
  await page.waitForSelector('#conduitTable tbody tr', { state: 'attached' });
  const dbCount = await page.locator('#ductbankTable > tbody > tr:not(.conduit-container)').count();
  const trayCount = await page.locator('#trayTable tbody tr').count();
  const conduitCount = await page.locator('#conduitTable tbody tr').count();
  expect(dbCount).toBeGreaterThan(0);
  expect(trayCount).toBeGreaterThan(0);
  expect(conduitCount).toBeGreaterThan(0);

  await page.click('#settings-btn');
  const dl = page.waitForEvent('download');
  await page.click('#export-project-btn');
  const download = await dl;
  const filePath = await download.path();
  const projectData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  await page.evaluate(() => {
    document.querySelector('#delete-ductbank-btn')?.click();
    document.querySelector('#delete-tray-btn')?.click();
    document.querySelector('#delete-conduit-btn')?.click();
  });

  await page.evaluate(async project => {
    const dataStore = await import('./dataStore.mjs');
    dataStore.importProject(project);
    document.querySelector('#load-ductbank-btn')?.click();
    document.querySelector('#load-tray-btn')?.click();
    document.querySelector('#load-conduit-btn')?.click();
  }, projectData);
  await page.waitForSelector('#ductbankTable > tbody > tr:not(.conduit-container)', { state: 'attached' });
  await page.waitForSelector('#trayTable tbody tr', { state: 'attached' });
  await page.waitForSelector('#conduitTable tbody tr', { state: 'attached' });

  expect(await page.locator('#ductbankTable > tbody > tr:not(.conduit-container)').count()).toBe(dbCount);
  expect(await page.locator('#trayTable tbody tr').count()).toBe(trayCount);
  expect(await page.locator('#conduitTable tbody tr').count()).toBeGreaterThanOrEqual(conduitCount);

  await page.goto(pageUrl('optimalRoute.html?e2e=1'));
  await page.evaluate(() => document.getElementById('tour-overlay')?.remove());
  await page.evaluate(async project => {
    const dataStore = await import('./dataStore.mjs');
    dataStore.importProject(project);
  }, projectData);
  await page.click('#import-schedules-btn');
  await expect(page.locator('#cable-list-container tbody tr')).not.toHaveCount(0);
  await page.click('#calculate-route-btn');
  await expect(page.locator('#ductbank-no-conduits-warning')).toBeHidden();
  await expect(page.locator('#results-section')).toBeVisible();
});

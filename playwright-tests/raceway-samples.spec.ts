import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
const root = path.join(__dirname, '..');
const pageUrl = (file: string) => 'file://' + path.join(root, file);

test('raceway samples roundtrip and route', async ({ page }) => {
  const racewayPath = path.join(root, 'examples', 'sampleRaceways.json');
  const racewayJson = fs.readFileSync(racewayPath, 'utf-8');
  const cablePath = path.join(root, 'examples', 'sampleCables.json');
  const cableJson = fs.readFileSync(cablePath, 'utf-8');
  await page.addInitScript(({ racewayJson, cableJson }) => {
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
  await page.goto(pageUrl('cableschedule.html'));
  await page.click('#load-sample-cables-btn');

  await page.goto(pageUrl('racewayschedule.html'));
  await page.click('#raceway-load-samples');
  await page.waitForSelector('#ductbankTable tbody tr.ductbank-row');
  await page.waitForSelector('#trayTable tbody tr');
  await page.waitForSelector('#conduitTable tbody tr');
  const dbCount = await page.locator('#ductbankTable tbody tr.ductbank-row').count();
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

  await page.click('#delete-ductbank-btn');
  await page.click('#delete-tray-btn');
  await page.click('#delete-conduit-btn');

  await page.click('#settings-btn');
  await page.click('#import-project-btn');
  await page.setInputFiles('#import-project-input', filePath);

  await expect(page.locator('#ductbankTable tbody tr.ductbank-row')).toHaveCount(dbCount);
  await expect(page.locator('#trayTable tbody tr')).toHaveCount(trayCount);
  await expect(page.locator('#conduitTable tbody tr')).toHaveCount(conduitCount);

  await page.goto(pageUrl('optimalRoute.html'));
  await page.click('#resume-no-btn');
  await page.click('#settings-btn');
  await page.click('#import-project-btn');
  await page.setInputFiles('#import-project-input', filePath);
  await page.click('#calculate-route-btn');
  await expect(page.locator('#ductbank-no-conduits-warning')).toBeHidden();
  await expect(page.locator('#results-section')).toBeVisible();
});

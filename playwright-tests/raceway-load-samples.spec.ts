import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = (file: string) => 'file://' + path.join(root, file);

test('raceway load samples populates all tables', async ({ page }) => {
  const samplePath = path.join(root, 'examples', 'sampleRaceways.json');
  const sampleJson = fs.readFileSync(samplePath, 'utf-8');
  await page.addInitScript((sample) => {
    const originalFetch = window.fetch;
    window.fetch = (input, init) => {
      if (typeof input === 'string' && input.endsWith('examples/sampleRaceways.json')) {
        return Promise.resolve(new Response(sample, { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return originalFetch(input, init);
    };
  }, sampleJson);
  await page.goto(pageUrl('racewayschedule.html?e2e=1'));
  await expect(page.locator('#tour-overlay')).toHaveCount(0);
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
  await expect(page.locator('#ductbankTable > tbody > tr:not(.conduit-container) > td')).not.toHaveCount(0);
  await expect(page.locator('#trayTable tbody tr td')).not.toHaveCount(0);
  await expect(page.locator('#conduitTable tbody tr td')).not.toHaveCount(0);
  await expect(page.locator('#raceway-total-count')).toHaveText(/\d+/);
  await expect(page.locator('#raceway-validation-summary')).toContainText(/Raceway schedules are ready|schedule issue/);
  const viewMenu = page.locator('details.toolbar-menu').filter({ has: page.locator('[data-raceway-view="geometry"]') });
  await viewMenu.locator('summary').click();
  await viewMenu.locator('[data-raceway-view="geometry"]').click();
  await expect(page.locator('#trayTable th').filter({ hasText: 'Start X' })).toBeVisible();
});

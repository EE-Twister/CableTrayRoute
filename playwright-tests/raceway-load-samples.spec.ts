import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
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
  await page.waitForSelector('[data-raceway-ready="1"]');
  await page.waitForSelector('#raceway-load-samples');
  await page.click('#raceway-load-samples');
  await page.evaluate(
    () => new Promise(r => document.addEventListener('samples-loaded', r, { once: true })),
  );
  await page.waitForSelector('#ductbankTable tbody tr.ductbank-row', { state: 'attached' });
  await page.waitForSelector('#trayTable tbody tr', { state: 'attached' });
  await page.waitForSelector('#conduitTable tbody tr', { state: 'attached' });
  const dbCount = await page.locator('#ductbankTable tbody tr.ductbank-row').count();
  const trayCount = await page.locator('#trayTable tbody tr').count();
  const conduitCount = await page.locator('#conduitTable tbody tr').count();
  expect(dbCount).toBeGreaterThan(0);
  expect(trayCount).toBeGreaterThan(0);
  expect(conduitCount).toBeGreaterThan(0);
});

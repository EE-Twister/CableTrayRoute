import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
const root = path.join(__dirname, '..');
const pageUrl = (file: string) => 'file://' + path.join(root, file);

test('raceway load samples populates all tables', async ({ page }) => {
  const samplePath = path.join(root, 'examples', 'sampleRaceways.json');
  const sampleJson = fs.readFileSync(samplePath, 'utf-8');
  await page.route('**/examples/sampleRaceways.json', route => {
    route.fulfill({ body: sampleJson, contentType: 'application/json' });
  });
  await page.goto(pageUrl('racewayschedule.html'));
  await page.click('#raceway-load-samples');
  await page.waitForSelector('#ductbank-table tbody tr.ductbank-row');
  await page.waitForSelector('#tray-table tbody tr');
  await page.waitForSelector('#conduit-table tbody tr');
  const dbCount = await page.locator('#ductbank-table tbody tr.ductbank-row').count();
  const trayCount = await page.locator('#tray-table tbody tr').count();
  const conduitCount = await page.locator('#conduit-table tbody tr').count();
  expect(dbCount).toBeGreaterThan(0);
  expect(trayCount).toBeGreaterThan(0);
  expect(conduitCount).toBeGreaterThan(0);
});

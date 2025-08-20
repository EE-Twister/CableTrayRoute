import { test, expect } from '@playwright/test';
import path from 'path';
const root = path.join(__dirname, '..');
const pageUrl = (file: string) => 'file://' + path.join(root, file);

test('raceway load samples populates all tables', async ({ page }) => {
  await page.goto(pageUrl('racewayschedule.html'));
  await page.click('#raceway-load-samples');
  const dbCount = await page.locator('#ductbank-table tbody tr.ductbank-row').count();
  const trayCount = await page.locator('#tray-table tbody tr').count();
  const conduitCount = await page.locator('#conduit-table tbody tr').count();
  expect(dbCount).toBeGreaterThan(0);
  expect(trayCount).toBeGreaterThan(0);
  expect(conduitCount).toBeGreaterThan(0);
});

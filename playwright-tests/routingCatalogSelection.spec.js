import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

test('Raceway Schedule assigns an approved compatible tray product to a routed segment', async ({ page }) => {
  await page.goto(pageUrl('racewayschedule.html?e2e=1&e2e_reset=1'));
  await page.waitForSelector('#trayTable');
  await page.evaluate(() => {
    window.projectStorage.writeScenarioValue('trayHardwareCatalogCustomProducts', [{
      id: 'ACME-TRAY-24-4', manufacturer: 'Acme Power', catalogNumber: 'TR-24-4',
      category: 'tray', subcategory: 'straight', description: '24 in × 4 in approved tray',
      unit: 'EA', width_in: 24, depth_in: 4, material: 'steel', approved: true,
      evidenceStatus: 'source_verified', approval: { status: 'approved', authority: 'Project EE' },
      source: 'Approved manufacturer list', lastVerified: '2026-07-31',
      datasheetUrl: 'https://example.test/acme-tray-24-4.pdf'
    }]);
  });

  await page.goto(pageUrl('racewayschedule.html?e2e=1'));
  await page.waitForSelector('#add-tray-btn');
  await page.click('#add-tray-btn');
  const dialog = page.getByRole('dialog', { name: 'Add Tray' });
  await dialog.locator('[name="tray_id"]').fill('TR-CATALOG-1');
  await dialog.locator('[name="start_x"]').fill('0');
  await dialog.locator('[name="start_y"]').fill('0');
  await dialog.locator('[name="start_z"]').fill('0');
  await dialog.locator('[name="end_x"]').fill('24');
  await dialog.locator('[name="end_y"]').fill('0');
  await dialog.locator('[name="end_z"]').fill('0');
  await dialog.getByRole('combobox', { name: 'Inside Width (in)' }).selectOption('24');
  await dialog.getByRole('combobox', { name: 'Tray Depth (in)' }).selectOption('4');
  await dialog.getByRole('button', { name: 'Add Tray', exact: true }).click();

  const catalogField = page.getByRole('combobox', { name: 'Approved Catalog Product, row 1' });
  await expect(catalogField).toBeVisible();
  await catalogField.fill('Acme Power TR-24-4 — 24 in × 4 in');
  await catalogField.press('Tab');
  await expect.poll(() => page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('base:traySchedule') || '[]');
    return rows.find(row => row.tray_id === 'TR-CATALOG-1')?.catalog_number || '';
  })).toBe('TR-24-4');
  const stored = await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('base:traySchedule') || '[]');
    return rows.find(row => row.tray_id === 'TR-CATALOG-1');
  });
  expect(stored.manufacturer).toBe('Acme Power');
  expect(stored.approved_part).toBe('true');
});

import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

async function openToolbarMenu(page, label) {
  const menu = page.locator('details.toolbar-menu').filter({ has: page.locator(`summary:has-text("${label}")`) });
  if (!(await menu.evaluate(el => el.open))) {
    await menu.locator('summary').click();
  }
}

test.describe('loadlist experience', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('loadlist.html?e2e=1&e2e_reset=1'));
    await expect(page.locator('#load-table')).toBeVisible();
    await expect(page.locator('#add-row-btn')).toBeVisible();
  });

  test('starter loads populate summary cards and source cards', async ({ page }) => {
    await page.click('#load-sample-loads-btn');
    await expect(page.locator('#load-table tbody tr')).toHaveCount(5);
    await expect(page.locator('[data-load-metric="total"]')).toHaveText('5');
    await expect(page.locator('[data-load-metric="connectedKw"]')).not.toHaveText('0.00');
    await expect(page.locator('#source-summary .source-summary-card')).toHaveCount(3);
  });

  test('add load modal creates a demand-ready row', async ({ page }) => {
    await page.click('#add-row-btn');
    const dialog = page.getByRole('dialog', { name: 'Add Load' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Description').fill('Booster pump');
    await dialog.getByLabel('Tag / ID').fill('MTR-200');
    await dialog.getByLabel('Source / Panel').fill('MCC-2');
    await dialog.getByLabel('Load Type').selectOption('Motor');
    await dialog.getByLabel('kW').fill('10');
    await dialog.getByLabel('Power Factor').fill('0.88');
    await dialog.getByRole('button', { name: 'Add Load' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#load-table tbody tr')).toHaveCount(1);
    await expect(page.locator('#load-table tbody tr:first-child input[name="description"]')).toHaveValue('Booster pump');
    await expect(page.locator('#load-validation-summary')).toContainText('All loads have');
  });

  test('view presets and batch edit update selected loads', async ({ page }) => {
    await page.click('#load-sample-loads-btn');
    await openToolbarMenu(page, 'View');
    await page.getByRole('button', { name: 'Procurement' }).click();
    await expect(page.locator('th[data-column="manufacturer"]')).toBeVisible();
    await expect(page.locator('th[data-column="kw"]')).toBeHidden();

    await page.locator('#load-table tbody tr .row-select').nth(0).check();
    await page.locator('#load-table tbody tr .row-select').nth(1).check();
    await page.click('#open-load-batch-btn');
    const dialog = page.getByRole('dialog', { name: 'Batch Edit Loads' });
    await dialog.locator('[data-batch-toggle="source"]').check();
    await dialog.locator('[data-batch-field="source"]').fill('SWBD-BATCH');
    await dialog.getByRole('button', { name: 'Apply Changes' }).click();

    await expect(dialog).toHaveCount(0);
    await openToolbarMenu(page, 'View');
    await page.getByRole('button', { name: 'Basic Entry' }).click();
    await expect(page.locator('#load-table tbody tr').nth(0).locator('input[name="source"]')).toHaveValue('SWBD-BATCH');
    await expect(page.locator('#load-table tbody tr').nth(1).locator('input[name="source"]')).toHaveValue('SWBD-BATCH');
  });

  test('CSV import mapping accepts non-native headers', async ({ page }) => {
    const csvPath = path.join(os.tmpdir(), `loadlist-import-${Date.now()}.csv`);
    fs.writeFileSync(csvPath, [
      'Panel,Equipment Tag,Load Name,Power,Volts,PF,Phase',
      'PNL-1,LD-1,Imported exhaust fan,7.5,480,0.86,3'
    ].join('\n'));

    await openToolbarMenu(page, 'Import / Export');
    const chooserPromise = page.waitForEvent('filechooser');
    await page.click('#import-csv-btn');
    const chooser = await chooserPromise;
    await chooser.setFiles(csvPath);

    const dialog = page.getByRole('dialog', { name: 'Map Load Import' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Import Loads' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#load-table tbody tr')).toHaveCount(1);
    await expect(page.locator('#load-table tbody tr:first-child input[name="description"]')).toHaveValue('Imported exhaust fan');
    await expect(page.locator('#load-table tbody tr:first-child input[name="kw"]')).toHaveValue('7.5');
  });
});

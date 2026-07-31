import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = file => 'file://' + path.join(__dirname, '..', file);

test('One-Line Data Manager filters, edits, batch-updates, persists, and exports component data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('base:oneLineDiagram', JSON.stringify({
      activeSheet: 0,
      sheets: [{
        id: 'main',
        name: 'Main',
        components: [{
          id: 'CB-1',
          label: 'Main Breaker',
          tag: 'CB-MAIN',
          type: 'breaker',
          props: { rated_voltage_kv: 0.48, rated_current_a: 1600 },
        }, {
          id: 'BUS-1',
          label: 'Main Bus',
          type: 'bus',
          props: { rated_voltage_kv: 0.48, bus_rating_a: 2000 },
        }],
      }],
    }));
  });

  await page.goto(pageUrl('datamanager.html'));
  await expect(page.getByRole('heading', { name: 'One-Line Data Manager' })).toBeVisible();
  await expect(page.locator('#dm-table-body tr')).toHaveCount(2);

  const breakerRow = page.locator('tr[data-component-id="CB-1"]');
  await breakerRow.locator('input[data-dm-field="label"]').fill('Service Main Breaker');
  await breakerRow.locator('input[data-dm-field="label"]').press('Tab');
  await expect(page.locator('#dm-status')).toContainText('Updated CB-1');
  const renamed = await page.evaluate(() => JSON.parse(localStorage.getItem('base:oneLineDiagram')).sheets[0].components[0]);
  expect(renamed.label).toBe('Service Main Breaker');

  await page.locator('input[data-dm-select="CB-1"]').check();
  await page.locator('input[data-dm-select="BUS-1"]').check();
  await page.locator('#dm-batch-field').selectOption('currentA');
  await page.locator('#dm-batch-value').fill('1800');
  await page.getByRole('button', { name: 'Apply to Selected' }).click();
  await expect(page.locator('#dm-status')).toContainText('Updated 2 selected components');
  const updated = await page.evaluate(() => JSON.parse(localStorage.getItem('base:oneLineDiagram')).sheets[0].components);
  expect(updated.map(component => component.props.rated_current_a)).toEqual([1800, 1800]);
  const revisions = await page.evaluate(() => JSON.parse(localStorage.getItem('base:oneLineRevisions') || '[]'));
  expect(revisions.length).toBeGreaterThan(0);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Displayed CSV' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('one-line-data-manager.csv');

  const workbookDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Displayed XLSX' }).click();
  expect((await workbookDownload).suggestedFilename()).toBe('one-line-data-manager.xlsx');

  await page.locator('#dm-import-input').setInputFiles({
    name: 'one-line-updates.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Component ID,Label,Rated Voltage (kV),Position Locked\nCB-1,"Service, Main",0.6,Yes\nBUS-1,Main Bus,0.6,No\n'),
  });
  await expect(page.getByRole('heading', { name: 'Spreadsheet Update Review' })).toBeVisible();
  await expect(page.locator('#dm-import-summary')).toContainText('2 matched');
  await expect(page.locator('#dm-import-changes')).toContainText('Service, Main');
  await page.getByRole('button', { name: 'Apply Reviewed Spreadsheet Updates' }).click();
  await expect(page.locator('#dm-status')).toContainText('Applied 4 reviewed spreadsheet updates');
  const importedStored = await page.evaluate(() => JSON.parse(localStorage.getItem('base:oneLineDiagram')).sheets[0].components);
  const components = Object.fromEntries(importedStored.map(component => [component.id, component]));
  expect(components['CB-1'].label).toBe('Service, Main');
  expect(components['CB-1'].props.rated_voltage_kv).toBe(0.6);
  expect(components['CB-1'].locked).toBe(true);
  expect(components['BUS-1'].props.rated_voltage_kv).toBe(0.6);
  expect(components['BUS-1'].locked).toBeUndefined();

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { 'Component ID': 'CB-1', Tag: 'CB-XLSX', 'Rated Current (A)': 1900 },
  ]), 'One-Line Data');
  const workbookBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  await page.locator('#dm-import-input').setInputFiles({
    name: 'one-line-updates.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: workbookBuffer,
  });
  await expect(page.locator('#dm-import-summary')).toContainText('XLSX (One-Line Data)');
  await expect(page.locator('#dm-import-changes')).toContainText('CB-XLSX');
  await page.getByRole('button', { name: 'Apply Reviewed Spreadsheet Updates' }).click();
  const xlsxImported = await page.evaluate(() => JSON.parse(localStorage.getItem('base:oneLineDiagram')).sheets[0].components[0]);
  expect(xlsxImported.tag).toBe('CB-XLSX');
  expect(xlsxImported.props.rated_current_a).toBe(1900);
});

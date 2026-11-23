/**
 * E2E tests for data import/export round-trips.
 * Covers: tray CSV export, cable CSV export, raceway schedule XLSX export.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'node:fs/promises';
import XLSX from 'xlsx';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

async function openToolbarMenu(page, label) {
  const menu = page.locator('details.toolbar-menu').filter({ has: page.locator(`summary:has-text("${label}")`) });
  if (!(await menu.evaluate(el => el.open))) {
    await menu.locator('summary').click();
  }
}

// ---------------------------------------------------------------------------
// Cable schedule export
// ---------------------------------------------------------------------------
test.describe('Cable Schedule export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('cableschedule.html?e2e=1&e2e_reset=1'));
    await page.waitForFunction('window.__CableScheduleInitOK === true');
  });

  test('loads sample cables and exports an XLSX workbook', async ({ page }) => {
    await page.click('#load-sample-cables-btn');
    await page.waitForFunction(() => {
      return document.querySelectorAll('#cableScheduleTable tbody tr').length > 0;
    }, { timeout: 5000 });

    await openToolbarMenu(page, 'Import / Export');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-xlsx-btn');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/cable/i);
    const workbook = XLSX.read(await fs.readFile(await download.path()), { type: 'buffer' });
    expect(workbook.SheetNames.length).toBeGreaterThan(0);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const tags = rows.map(row => row.Tag || row.tag);
    expect(tags).toEqual(expect.arrayContaining(['CBL-001', 'CBL-002', 'CBL-003']));
  });

  test('imports a cable workbook through the file chooser', async ({ page }) => {
    await openToolbarMenu(page, 'Import / Export');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#import-xlsx-btn');
    const chooser = await fileChooserPromise;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
      tag: 'C-IMPORT-1',
      from_tag: 'SWGR-1',
      to_tag: 'MCC-1',
      cable_type: 'Power',
      conductors: 3,
      conductor_size: '#10 AWG',
    }]), 'Cables');
    await chooser.setFiles({
      name: 'cable-import.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }),
    });
    const mappingDialog = page.getByRole('dialog', { name: 'Map Cable Import' });
    await expect(mappingDialog).toBeVisible();
    await mappingDialog.getByRole('button', { name: 'Import Rows' }).click();
    await expect(page.locator('#cableScheduleTable tbody tr input[name="tag"], #cableScheduleTable tbody tr input[data-key="tag"], #cableScheduleTable tbody tr input.cable-tag-input').first()).toHaveValue('C-IMPORT-1');
  });
});

// ---------------------------------------------------------------------------
// Optimal Route — tray CSV export/import
// ---------------------------------------------------------------------------
test.describe('Optimal Route tray CSV export', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto(pageUrl('optimalRoute.html?e2e=1&e2e_reset=1'));
    await page.locator('#optimal-ready-beacon[data-optimal-ready="1"]').waitFor();
  });

  test('loads sample trays and exports CSV', async ({ page }) => {
    await page.click('#load-sample-trays-btn');
    await page.waitForFunction(() => {
      return document.querySelectorAll('#trayTable tbody tr').length > 0;
    }, { timeout: 5000 });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-trays-btn');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
    expect(await fs.readFile(await download.path(), 'utf8')).toContain('tray_id');
  });

  test('imports trays through the file chooser', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#import-trays-btn');
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
      name: 'trays.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([
        'tray_id,start_x,start_y,start_z,end_x,end_y,end_z,inside_width,tray_depth\n',
        'TR-IMPORT-1,0,0,0,100,0,0,12,4\n',
      ].join('')),
    });
    await expect(page.locator('#trayTable tbody tr')).toHaveCount(1);
    await expect(page.locator('#manual-tray-table-container #trayTable tbody tr .tray-id-input').first()).toHaveValue('TR-IMPORT-1');
  });

  test('cable export triggers download', async ({ page }) => {
    await page.click('#load-sample-cables-btn');
    await page.locator('#cable-list-container tbody tr').first().waitFor();

    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-cables-btn');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
    expect(await fs.readFile(await download.path(), 'utf8')).toContain('tag');
  });
});

// ---------------------------------------------------------------------------
// Raceway schedule export
// ---------------------------------------------------------------------------
test.describe('Raceway Schedule export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('racewayschedule.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Raceway');
  });

  test('download template button is available', async ({ page }) => {
    const btn = page.locator('#download-trays-template-btn');
    await btn.evaluate(el => { const menu = el.closest('details'); if (menu) menu.open = true; });
    await expect(btn).toBeVisible();
  });
});

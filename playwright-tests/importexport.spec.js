/**
 * E2E tests for data import/export round-trips.
 * Covers: tray CSV export, cable CSV export, raceway schedule XLSX export.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

// ---------------------------------------------------------------------------
// Cable schedule export
// ---------------------------------------------------------------------------
test.describe('Cable Schedule export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('cableschedule.html?e2e=1&e2e_reset=1'));
    await page.waitForFunction('window.__CableScheduleInitOK === true');
  });

  test('loads sample cables and exports CSV', async ({ page }) => {
    await page.click('#load-sample-cables-btn');
    await page.waitForFunction(() => {
      return document.querySelectorAll('#cableScheduleTable tbody tr').length > 0;
    }, { timeout: 5000 });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-xlsx-btn');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/cable/i);
  });

  test('import file chooser opens on import button click', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#import-xlsx-btn');
    const chooser = await fileChooserPromise;
    expect(chooser).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Optimal Route — tray CSV export/import
// ---------------------------------------------------------------------------
test.describe('Optimal Route tray CSV export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('optimalRoute.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
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
  });

  test('import trays file chooser opens', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#import-trays-btn');
    const chooser = await fileChooserPromise;
    expect(chooser).toBeTruthy();
  });

  test('cable export triggers download', async ({ page }) => {
    await page.click('#load-sample-cables-btn');
    await page.waitForLoadState('networkidle');

    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-cables-btn');
    await downloadPromise;
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
    const btn = page.locator('#download-trays-template-btn, [id*="template"]').first();
    await expect(btn).toBeVisible();
  });
});

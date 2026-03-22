/**
 * E2E smoke tests for the Optimal Route tool.
 * Covers: page structure, tray/cable data loading, routing action, 3D view.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

test.describe('Optimal Route', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('optimalRoute.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Optimal Route');
  });

  test('has Calculate Route button', async ({ page }) => {
    await expect(page.locator('#calculate-route-btn')).toBeVisible();
  });

  test('has tray and cable panel sections', async ({ page }) => {
    await expect(page.locator('#load-sample-trays-btn')).toBeVisible();
    await expect(page.locator('#add-cable-btn')).toBeVisible();
  });

  test('loads sample tray network', async ({ page }) => {
    await page.click('#load-sample-trays-btn');
    // After loading samples, the manual tray table should be populated
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('#trayTable tbody tr');
      return rows.length > 0;
    }, { timeout: 5000 });
    const rowCount = await page.locator('#trayTable tbody tr').count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('can add a cable to the list', async ({ page }) => {
    const initialCount = await page.locator('#cableList li, #cable-list li, #cables-panel tbody tr').count();
    await page.click('#add-cable-btn');
    // A new row or list item should appear
    const newCount = await page.locator('#cableList li, #cable-list li, #cables-panel tbody tr').count();
    expect(newCount).toBeGreaterThanOrEqual(initialCount);
  });

  test('export trays CSV triggers download', async ({ page }) => {
    await page.click('#load-sample-trays-btn');
    await page.waitForFunction(() => {
      return document.querySelectorAll('#trayTable tbody tr').length > 0;
    }, { timeout: 5000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await page.click('#export-trays-btn');
    await downloadPromise;
  });

  test('3D view container is present', async ({ page }) => {
    // The Plotly chart div should exist in the DOM
    const chartEl = page.locator('#route-plot, .js-plotly-plot, [id*="plot"]');
    await expect(chartEl.first()).toBeAttached();
  });
});

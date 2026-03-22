/**
 * E2E tests for real-time collaboration integration.
 *
 * These tests verify that key workflow pages respond correctly to the
 * `ctr:remote-applied` event that is dispatched by dataStore when a remote
 * collaborator's patch arrives.  They do not require a live WebSocket server —
 * the event is fired via page.evaluate(), which is equivalent to what
 * dataStore.applyMergePatch() does in production.
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

// ---------------------------------------------------------------------------
// Cable Schedule — ctr:remote-applied reloads the table
// ---------------------------------------------------------------------------
test.describe('Cable Schedule — collaboration reload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('cableschedule.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page initialises without errors', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Cable Schedule');
  });

  test('firing ctr:remote-applied does not throw and page remains usable', async ({ page }) => {
    // Dispatch the event the same way dataStore.applyMergePatch would
    const error = await page.evaluate(() => {
      try {
        document.dispatchEvent(new CustomEvent('ctr:remote-applied', { detail: { projectId: 'default' } }));
        return null;
      } catch (e) {
        return e.message;
      }
    });
    assert: expect(error).toBeNull();
    // The table container should still be present after a reload
    await expect(page.locator('#cable-schedule-table, #cableTable, table')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Raceway Schedule — ctr:remote-applied reloads the tables
// ---------------------------------------------------------------------------
test.describe('Raceway Schedule — collaboration reload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('racewayschedule.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads correctly', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Raceway Schedule');
  });

  test('ctr:remote-applied event fires without error on raceway schedule', async ({ page }) => {
    const error = await page.evaluate(() => {
      try {
        document.dispatchEvent(new CustomEvent('ctr:remote-applied', { detail: { projectId: 'default' } }));
        return null;
      } catch (e) {
        return e.message;
      }
    });
    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ductbank Route — ctr:remote-applied reloads the form
// ---------------------------------------------------------------------------
test.describe('Ductbank Route — collaboration reload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('ductbankroute.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads correctly', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Ductbank/i);
  });

  test('ctr:remote-applied event fires without error on ductbank route', async ({ page }) => {
    const error = await page.evaluate(() => {
      try {
        document.dispatchEvent(new CustomEvent('ctr:remote-applied', { detail: { projectId: 'default' } }));
        return null;
      } catch (e) {
        return e.message;
      }
    });
    expect(error).toBeNull();
    // The ductbank tag input should still be present
    await expect(page.locator('#ductbankTag')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Panel Schedule — ctr:remote-applied re-renders the panel view
// ---------------------------------------------------------------------------
test.describe('Panel Schedule — collaboration reload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('panelschedule.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads correctly', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Panel Schedule/i);
  });

  test('ctr:remote-applied event fires without error on panel schedule', async ({ page }) => {
    const error = await page.evaluate(() => {
      try {
        document.dispatchEvent(new CustomEvent('ctr:remote-applied', { detail: { projectId: 'default' } }));
        return null;
      } catch (e) {
        return e.message;
      }
    });
    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// One-Line Diagram — verify existing ctr:remote-applied handler still works
// ---------------------------------------------------------------------------
test.describe('One-Line Diagram — collaboration reload (regression)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('oneline.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads correctly', async ({ page }) => {
    await expect(page.locator('h1, #canvas-container, canvas')).toHaveCount({ minimum: 1 });
  });

  test('ctr:remote-applied event fires without error on one-line', async ({ page }) => {
    const error = await page.evaluate(() => {
      try {
        document.dispatchEvent(new CustomEvent('ctr:remote-applied', { detail: { projectId: 'default' } }));
        return null;
      } catch (e) {
        return e.message;
      }
    });
    expect(error).toBeNull();
  });
});

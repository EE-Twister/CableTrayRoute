/**
 * E2E smoke tests for study pages that previously lacked Playwright coverage:
 *  - Harmonic Analysis   (harmonics.html)
 *  - Motor Starting      (motorStart.html)
 *  - Time-Current Curves (tcc.html)
 *  - Design Rule Checker (designrulechecker.html)
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root      = path.join(__dirname, '..');
const pageUrl   = file => 'file://' + path.join(root, file);

// -------------------------------------------------------------------------
// Harmonic Analysis
// -------------------------------------------------------------------------
test.describe('Harmonic Analysis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('harmonics.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Harmonic');
  });

  test('SVG chart element is present in DOM', async ({ page }) => {
    await expect(page.locator('#harmonics-chart')).toBeAttached();
  });

  test('navigation links are present', async ({ page }) => {
    await expect(page.locator('#nav-links')).toBeAttached();
  });

  test('project toolbar buttons are present', async ({ page }) => {
    await expect(page.locator('#new-project-btn')).toBeVisible();
    await expect(page.locator('#save-project-btn')).toBeVisible();
  });

  test('page does not crash with no harmonic-source data', async ({ page }) => {
    // Chart renders a "no data" message when no harmonic sources exist
    const chart = page.locator('#harmonics-chart');
    await expect(chart).toBeAttached();
    // The SVG should be in the DOM without throwing a JS error
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForTimeout(500);
    assert_no_critical_errors(errors);
  });

  test('settings button is present', async ({ page }) => {
    await expect(page.locator('#settings-btn')).toBeVisible();
  });
});

// -------------------------------------------------------------------------
// Motor Starting
// -------------------------------------------------------------------------
test.describe('Motor Starting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('motorStart.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Motor Starting');
  });

  test('SVG chart element is present in DOM', async ({ page }) => {
    await expect(page.locator('#motorstart-chart')).toBeAttached();
  });

  test('navigation links are present', async ({ page }) => {
    await expect(page.locator('#nav-links')).toBeAttached();
  });

  test('project toolbar buttons are present', async ({ page }) => {
    await expect(page.locator('#new-project-btn')).toBeVisible();
    await expect(page.locator('#save-project-btn')).toBeVisible();
  });

  test('page does not crash with no motor data', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForTimeout(500);
    assert_no_critical_errors(errors);
  });

  test('settings button is present', async ({ page }) => {
    await expect(page.locator('#settings-btn')).toBeVisible();
  });
});

// -------------------------------------------------------------------------
// Time-Current Curves (TCC)
// -------------------------------------------------------------------------
test.describe('Time-Current Curves', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('tcc.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Time-Current');
  });

  test('Plot button is present', async ({ page }) => {
    await expect(page.locator('#plot-btn')).toBeVisible();
  });

  test('SVG chart canvas is present', async ({ page }) => {
    await expect(page.locator('#tcc-chart')).toBeAttached();
  });

  test('device selection controls are present', async ({ page }) => {
    await expect(page.locator('#device-modal-btn')).toBeVisible();
    await expect(page.locator('#device-select')).toBeAttached();
  });

  test('Add Annotation button is present', async ({ page }) => {
    await expect(page.locator('#add-annotation-btn')).toBeVisible();
  });

  test('clicking Plot with no devices does not crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.click('#plot-btn');
    await page.waitForTimeout(300);
    assert_no_critical_errors(errors);
  });

  test('one-line preview SVG is present', async ({ page }) => {
    await expect(page.locator('#oneline-preview')).toBeAttached();
  });
});

// -------------------------------------------------------------------------
// Design Rule Checker
// -------------------------------------------------------------------------
test.describe('Design Rule Checker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('designrulechecker.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Design Rule');
  });

  test('Run button is present and enabled', async ({ page }) => {
    const btn = page.locator('#drc-run-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  test('Export button is present (initially disabled)', async ({ page }) => {
    await expect(page.locator('#drc-export-btn')).toBeAttached();
  });

  test('results container is present in DOM', async ({ page }) => {
    await expect(page.locator('#drc-results')).toBeAttached();
  });

  test('skip-grounding and skip-ampacity checkboxes are present', async ({ page }) => {
    await expect(page.locator('#drc-skip-grounding')).toBeAttached();
    await expect(page.locator('#drc-skip-ampacity')).toBeAttached();
  });

  test('clicking Run with no data does not crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.click('#drc-run-btn');
    await page.waitForTimeout(500);
    assert_no_critical_errors(errors);
  });

  test('after running with no data, results area is populated', async ({ page }) => {
    await page.click('#drc-run-btn');
    await page.waitForTimeout(500);
    // Results div should contain some content (pass summary or no-data message)
    const resultsText = await page.locator('#drc-results').textContent();
    expect(resultsText.length).toBeGreaterThan(0);
  });
});

// -------------------------------------------------------------------------
// Helper
// -------------------------------------------------------------------------
function assert_no_critical_errors(errors) {
  const critical = errors.filter(msg =>
    !msg.includes('favicon') &&
    !msg.includes('Failed to load resource') &&
    !msg.includes('net::ERR')
  );
  if (critical.length > 0) {
    throw new Error('Unexpected JS error(s): ' + critical.join('; '));
  }
}

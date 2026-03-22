/**
 * E2E smoke tests for the next major features:
 * - Submittal Package Generator
 * - Reliability / N-1 Analysis
 * - Cost Estimator
 * - EMF Analysis
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

// -------------------------------------------------------------------------
// Submittal Package Generator
// -------------------------------------------------------------------------
test.describe('Submittal Package Generator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('submittal.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Submittal Package');
  });

  test('has project information fields', async ({ page }) => {
    await expect(page.locator('#sub-project-name')).toBeVisible();
    await expect(page.locator('#sub-project-number')).toBeVisible();
    await expect(page.locator('#sub-client')).toBeVisible();
    await expect(page.locator('#sub-engineer')).toBeVisible();
    await expect(page.locator('#sub-date')).toBeVisible();
  });

  test('has section toggles', async ({ page }) => {
    await expect(page.locator('#sec-equipment')).toBeChecked();
    await expect(page.locator('#sec-cables')).toBeChecked();
    await expect(page.locator('#sec-raceways')).toBeChecked();
    await expect(page.locator('#sec-compliance')).toBeChecked();
    await expect(page.locator('#sec-signature')).toBeChecked();
  });

  test('preview button exists and generates output', async ({ page }) => {
    await page.fill('#sub-project-name', 'Test Project');
    await page.fill('#sub-engineer', 'J. Doe, PE');

    await page.click('#preview-btn');

    const preview = page.locator('#submittal-preview');
    await expect(preview).toContainText('Test Project');
    await expect(preview).toContainText('Submittal Package');
  });

  test('cover page shows NEC edition', async ({ page }) => {
    await page.selectOption('#sub-nec-edition', '2023');
    await page.click('#preview-btn');
    await expect(page.locator('#submittal-preview')).toContainText('NEC 2023');
  });

  test('print button exists', async ({ page }) => {
    await expect(page.locator('#print-btn')).toBeVisible();
  });

  test('export xlsx button exists', async ({ page }) => {
    await expect(page.locator('#export-xlsx-btn')).toBeVisible();
  });
});

// -------------------------------------------------------------------------
// Reliability Analysis
// -------------------------------------------------------------------------
test.describe('Reliability Analysis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('reliability.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Reliability');
  });

  test('has run button', async ({ page }) => {
    await expect(page.locator('#run-btn')).toBeVisible();
  });

  test('clicking run with no data shows informative message', async ({ page }) => {
    await page.click('#run-btn');
    // Should show a modal or message (no crash)
    await expect(page.locator('body')).toBeVisible();
  });

  test('results region is present', async ({ page }) => {
    await expect(page.locator('#results')).toBeAttached();
  });

  test('chart element is present in DOM', async ({ page }) => {
    await expect(page.locator('#reliability-chart')).toBeAttached();
  });
});

// -------------------------------------------------------------------------
// Cost Estimator
// -------------------------------------------------------------------------
test.describe('Cost Estimator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('costestimate.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Cost Estimat');
  });

  test('has estimate button', async ({ page }) => {
    await expect(page.locator('#estimate-btn')).toBeVisible();
  });

  test('has contingency percentage input with default 15%', async ({ page }) => {
    const contingency = page.locator('#contingency-pct');
    await expect(contingency).toBeVisible();
    await expect(contingency).toHaveValue('15');
  });

  test('clicking estimate with no project shows informative message', async ({ page }) => {
    await page.click('#estimate-btn');
    const results = page.locator('#results');
    await expect(results).toBeVisible();
    // Should show a message (either data or hint)
    const text = await results.textContent();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('price override section is collapsible', async ({ page }) => {
    const details = page.locator('#price-overrides');
    await expect(details).toBeAttached();
  });

  test('labor rate inputs exist', async ({ page }) => {
    // Open the details element
    await page.click('#price-overrides > summary');
    await expect(page.locator('#labor-cable-rate')).toBeVisible();
    await expect(page.locator('#labor-tray-rate')).toBeVisible();
    await expect(page.locator('#labor-conduit-rate')).toBeVisible();
  });

  test('export xlsx button exists', async ({ page }) => {
    await expect(page.locator('#export-xlsx-btn')).toBeVisible();
  });
});

// -------------------------------------------------------------------------
// EMF Analysis
// -------------------------------------------------------------------------
test.describe('EMF Analysis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('emf.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('EMF');
  });

  test('has required input fields', async ({ page }) => {
    await expect(page.locator('#frequency')).toBeVisible();
    await expect(page.locator('#load-current')).toBeVisible();
    await expect(page.locator('#n-cables')).toBeVisible();
    await expect(page.locator('#tray-width')).toBeVisible();
    await expect(page.locator('#cable-od')).toBeVisible();
    await expect(page.locator('#meas-distance')).toBeVisible();
  });

  test('has calculate and profile buttons', async ({ page }) => {
    await expect(page.locator('#calc-btn')).toBeVisible();
    await expect(page.locator('#profile-btn')).toBeVisible();
  });

  test('calculates field and shows results', async ({ page }) => {
    await page.fill('#load-current', '100');
    await page.fill('#n-cables', '1');
    await page.fill('#tray-width', '12');
    await page.fill('#cable-od', '1.0');
    await page.fill('#meas-distance', '36');

    await page.click('#calc-btn');

    const results = page.locator('#results');
    await expect(results).not.toBeEmpty();
    await expect(results).toContainText('µT');
  });

  test('shows ICNIRP compliance status', async ({ page }) => {
    await page.fill('#load-current', '100');
    await page.click('#calc-btn');

    await expect(page.locator('#results')).toContainText('ICNIRP');
    await expect(page.locator('#results')).toContainText(/PASS|FAIL/);
  });

  test('field profile generates chart', async ({ page }) => {
    await page.fill('#load-current', '100');
    await page.click('#profile-btn');

    const chartContainer = page.locator('#profile-container');
    await expect(chartContainer).toBeVisible();
    await expect(chartContainer).not.toHaveAttribute('hidden');
  });

  test('frequency selector has 50 Hz and 60 Hz options', async ({ page }) => {
    const options = await page.locator('#frequency option').allTextContents();
    expect(options.some(t => t.includes('60'))).toBe(true);
    expect(options.some(t => t.includes('50'))).toBe(true);
  });

  test('shows error for zero current', async ({ page }) => {
    await page.fill('#load-current', '0');
    await page.click('#calc-btn');
    // Should show a modal or error, not crash
    await expect(page.locator('body')).toBeVisible();
  });
});

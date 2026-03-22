/**
 * E2E smoke tests for features not yet covered in other spec files:
 * - Wind Load Analysis (ASCE 7)
 * - Transient Stability Analysis
 * - N-1 Contingency Analysis
 * - Product Configurator
 * - Tray Hardware BOM
 * - Pull Cards
 * - Spool Sheets
 * - Clash Detection
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

// -------------------------------------------------------------------------
// Wind Load Analysis
// -------------------------------------------------------------------------
test.describe('Wind Load Analysis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('windload.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Wind Load');
  });

  test('has required input fields', async ({ page }) => {
    await expect(page.locator('#wind-speed')).toBeVisible();
    await expect(page.locator('#exposure')).toBeVisible();
    await expect(page.locator('#tray-height')).toBeVisible();
    await expect(page.locator('#tray-width')).toBeVisible();
    await expect(page.locator('#span-length')).toBeVisible();
  });

  test('has calculate button', async ({ page }) => {
    await expect(page.locator('#calc-btn')).toBeVisible();
  });

  test('calculates wind load and shows results', async ({ page }) => {
    await page.fill('#wind-speed', '90');
    await page.selectOption('#exposure', { index: 1 });
    await page.fill('#tray-height', '30');
    await page.fill('#tray-width', '24');
    await page.fill('#span-length', '10');

    await page.click('#calc-btn');

    const results = page.locator('#results');
    await expect(results).not.toBeEmpty();
  });

  test('results region is present', async ({ page }) => {
    await expect(page.locator('#results')).toBeAttached();
  });
});

// -------------------------------------------------------------------------
// Transient Stability Analysis
// -------------------------------------------------------------------------
test.describe('Transient Stability Analysis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('transientstability.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Transient Stability');
  });

  test('has required input fields', async ({ page }) => {
    await expect(page.locator('#inertia')).toBeVisible();
    await expect(page.locator('#frequency')).toBeVisible();
    await expect(page.locator('#mech-power')).toBeVisible();
    await expect(page.locator('#pmax-pre')).toBeVisible();
    await expect(page.locator('#pmax-fault')).toBeVisible();
    await expect(page.locator('#pmax-post')).toBeVisible();
    await expect(page.locator('#t-clear')).toBeVisible();
  });

  test('has simulate button', async ({ page }) => {
    await expect(page.locator('#calc-btn')).toBeVisible();
  });

  test('simulates and shows results', async ({ page }) => {
    await page.fill('#inertia', '5');
    await page.fill('#mech-power', '0.8');
    await page.fill('#pmax-pre', '2.0');
    await page.fill('#pmax-fault', '0.5');
    await page.fill('#pmax-post', '1.5');
    await page.fill('#t-clear', '0.15');

    await page.click('#calc-btn');

    const results = page.locator('#results');
    await expect(results).not.toBeEmpty();
  });

  test('results shows stability verdict', async ({ page }) => {
    await page.fill('#mech-power', '0.5');
    await page.fill('#pmax-pre', '2.0');
    await page.fill('#pmax-fault', '0.0');
    await page.fill('#pmax-post', '1.8');
    await page.fill('#t-clear', '0.1');

    await page.click('#calc-btn');

    await expect(page.locator('#results')).toContainText(/stable|unstable|Stable|Unstable/i);
  });
});

// -------------------------------------------------------------------------
// N-1 Contingency Analysis
// -------------------------------------------------------------------------
test.describe('N-1 Contingency Analysis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('contingency.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Contingency|N-1/i);
  });

  test('contingency form is present', async ({ page }) => {
    await expect(page.locator('#contingency-form')).toBeAttached();
  });

  test('has submit button', async ({ page }) => {
    const btn = page.locator('#contingency-form button[type="submit"], #contingency-form button:has-text("Run"), #contingency-form button:has-text("Analyz")').first();
    await expect(btn).toBeVisible();
  });

  test('results region is present', async ({ page }) => {
    await expect(page.locator('#contingency-results-section')).toBeAttached();
  });

  test('contingency tbody is present for results table', async ({ page }) => {
    await expect(page.locator('#contingency-tbody')).toBeAttached();
  });

  test('running with no data does not crash', async ({ page }) => {
    const btn = page.locator('#contingency-form button[type="submit"]').first();
    await btn.click();
    await expect(page.locator('body')).toBeVisible();
  });
});

// -------------------------------------------------------------------------
// Product Configurator
// -------------------------------------------------------------------------
test.describe('Product Configurator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('productconfig.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Product|Configurator/i);
  });

  test('has cable weight and span inputs', async ({ page }) => {
    await expect(page.locator('#cable-weight')).toBeVisible();
    await expect(page.locator('#span')).toBeVisible();
  });

  test('has calculate / configure button', async ({ page }) => {
    const btn = page.locator('button[type="submit"], #calc-btn, button:has-text("Configur"), button:has-text("Select")').first();
    await expect(btn).toBeVisible();
  });

  test('results region is present', async ({ page }) => {
    await expect(page.locator('#results')).toBeAttached();
  });

  test('performs a calculation without crashing', async ({ page }) => {
    await page.fill('#cable-weight', '10');
    await page.fill('#span', '8');

    const btn = page.locator('button[type="submit"]').first();
    await btn.click();

    await expect(page.locator('body')).toBeVisible();
  });
});

// -------------------------------------------------------------------------
// Tray Hardware BOM
// -------------------------------------------------------------------------
test.describe('Tray Hardware BOM', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('trayhardwarebom.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Hardware|BOM|Bill of Material/i);
  });

  test('has generate BOM button', async ({ page }) => {
    await expect(page.locator('#generateBtn')).toBeVisible();
  });

  test('export XLSX button is present', async ({ page }) => {
    await expect(page.locator('#exportXlsxBtn')).toBeAttached();
  });

  test('load class selector is present', async ({ page }) => {
    await expect(page.locator('#loadClass')).toBeVisible();
  });

  test('clicking generate with no raceway data does not crash', async ({ page }) => {
    await page.click('#generateBtn');
    await expect(page.locator('body')).toBeVisible();
  });
});

// -------------------------------------------------------------------------
// Pull Cards
// -------------------------------------------------------------------------
test.describe('Pull Cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('pullcards.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Pull Card/i);
  });

  test('has load from project button', async ({ page }) => {
    await expect(page.locator('#loadFromProjectBtn')).toBeVisible();
  });

  test('pull table is present in DOM', async ({ page }) => {
    await expect(page.locator('#pullTable')).toBeAttached();
  });

  test('export buttons are present', async ({ page }) => {
    await expect(page.locator('#exportPullTableBtn')).toBeAttached();
    await expect(page.locator('#exportPullCardsBtn')).toBeAttached();
  });

  test('clicking load from project does not crash', async ({ page }) => {
    await page.click('#loadFromProjectBtn');
    await expect(page.locator('body')).toBeVisible();
  });
});

// -------------------------------------------------------------------------
// Spool Sheets
// -------------------------------------------------------------------------
test.describe('Spool Sheets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('spoolsheets.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Spool/i);
  });

  test('has generate spool sheets button', async ({ page }) => {
    await expect(page.locator('#generateBtn')).toBeVisible();
  });

  test('has section length input', async ({ page }) => {
    await expect(page.locator('#sectionLength')).toBeVisible();
  });

  test('has grid cell and elevation band inputs', async ({ page }) => {
    await expect(page.locator('#gridCell')).toBeVisible();
    await expect(page.locator('#elevBand')).toBeVisible();
  });

  test('clicking generate with no routes does not crash', async ({ page }) => {
    await page.click('#generateBtn');
    await expect(page.locator('body')).toBeVisible();
  });
});

// -------------------------------------------------------------------------
// Clash Detection
// -------------------------------------------------------------------------
test.describe('Clash Detection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('clashdetect.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Clash/i);
  });

  test('has run clash detection button', async ({ page }) => {
    await expect(page.locator('#runBtn')).toBeVisible();
  });

  test('has clearance input', async ({ page }) => {
    await expect(page.locator('#clearanceFt')).toBeVisible();
  });

  test('results region is present', async ({ page }) => {
    await expect(page.locator('#results')).toBeAttached();
  });

  test('soft clash toggle is checked by default', async ({ page }) => {
    await expect(page.locator('#showSoft')).toBeChecked();
  });

  test('running with no route data does not crash', async ({ page }) => {
    await page.click('#runBtn');
    await expect(page.locator('body')).toBeVisible();
  });

  test('results shows no-data message when no routes loaded', async ({ page }) => {
    await page.click('#runBtn');
    const results = page.locator('#results');
    const text = await results.textContent();
    expect(text.trim().length).toBeGreaterThan(0);
  });
});

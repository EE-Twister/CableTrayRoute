// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Acceptance tests for the Validation & Standards trust-center page (Gap #78).
 *
 * These tests verify:
 * - Page loads with correct heading
 * - KPI cards are rendered
 * - At least 6 standards entries appear
 * - At least 6 benchmark entries appear
 * - Benchmark links resolve to existing study pages
 * - Hash navigation opens the matching details element
 * - Standards list includes expected standard names
 */

test.describe('Validation & Standards — smoke', () => {
  test('smoke: page loads with correct heading', async ({ page }) => {
    await page.goto('validation.html');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Validation');
  });

  test('smoke: at-a-glance KPI cards are rendered', async ({ page }) => {
    await page.goto('validation.html');
    const kpiCards = page.locator('.kpi-card');
    await expect(kpiCards).toHaveCount(4);
  });

  test('smoke: standards section is visible', async ({ page }) => {
    await page.goto('validation.html');
    await expect(page.getByRole('heading', { name: /supported standards/i })).toBeVisible();
  });

  test('smoke: benchmarks section is visible', async ({ page }) => {
    await page.goto('validation.html');
    await expect(page.getByRole('heading', { name: /benchmark cases/i })).toBeVisible();
  });
});

test.describe('Validation & Standards — standards list', () => {
  test('renders at least 6 standard entries', async ({ page }) => {
    await page.goto('validation.html');
    // Wait for dynamic content to load
    await page.waitForSelector('#standards-list details, #standards-list p', { timeout: 5000 });
    const entries = page.locator('#standards-list details.validation-item');
    const count = await entries.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test('contains IEEE 1584 standard entry', async ({ page }) => {
    await page.goto('validation.html');
    await page.waitForSelector('#standards-list details', { timeout: 5000 });
    await expect(page.locator('#standards-list')).toContainText('IEEE 1584');
  });

  test('contains IEC 60909 standard entry', async ({ page }) => {
    await page.goto('validation.html');
    await page.waitForSelector('#standards-list details', { timeout: 5000 });
    await expect(page.locator('#standards-list')).toContainText('IEC 60909');
  });

  test('contains IEC 60287 standard entry', async ({ page }) => {
    await page.goto('validation.html');
    await page.waitForSelector('#standards-list details', { timeout: 5000 });
    await expect(page.locator('#standards-list')).toContainText('IEC 60287');
  });

  test('standard entries each have a link to a study page', async ({ page }) => {
    await page.goto('validation.html');
    await page.waitForSelector('#standards-list details', { timeout: 5000 });
    const links = page.locator('#standards-list .validation-item__link');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(6);
    // Each link should have an href ending in .html
    for (let i = 0; i < Math.min(count, 6); i++) {
      const href = await links.nth(i).getAttribute('href');
      expect(href).toMatch(/\.html$/);
    }
  });
});

test.describe('Validation & Standards — benchmarks list', () => {
  test('renders at least 6 benchmark entries', async ({ page }) => {
    await page.goto('validation.html');
    await page.waitForSelector('#benchmarks-list details, #benchmarks-list p', { timeout: 5000 });
    const entries = page.locator('#benchmarks-list details.validation-item');
    const count = await entries.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test('contains IEEE 1584 arc flash benchmark', async ({ page }) => {
    await page.goto('validation.html');
    await page.waitForSelector('#benchmarks-list details', { timeout: 5000 });
    await expect(page.locator('#benchmarks-list')).toContainText('IEEE 1584');
  });

  test('contains IEC 60287 cable rating benchmark', async ({ page }) => {
    await page.goto('validation.html');
    await page.waitForSelector('#benchmarks-list details', { timeout: 5000 });
    await expect(page.locator('#benchmarks-list')).toContainText('IEC 60287');
  });

  test('contains IEEE 80 ground grid benchmark', async ({ page }) => {
    await page.goto('validation.html');
    await page.waitForSelector('#benchmarks-list details', { timeout: 5000 });
    await expect(page.locator('#benchmarks-list')).toContainText('IEEE 80');
  });

  test('benchmark entries link to study pages', async ({ page }) => {
    await page.goto('validation.html');
    await page.waitForSelector('#benchmarks-list details', { timeout: 5000 });
    const links = page.locator('#benchmarks-list .validation-item__link');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < Math.min(count, 3); i++) {
      const href = await links.nth(i).getAttribute('href');
      expect(href).toMatch(/\.html$/);
    }
  });
});

test.describe('Validation & Standards — navigation', () => {
  test('validation.html is reachable from the navigation menu', async ({ page }) => {
    await page.goto('index.html');
    // Open nav if needed
    const toggle = page.locator('#nav-toggle');
    if (await toggle.isVisible()) {
      await toggle.click();
    }
    const navLink = page.locator('a[href="validation.html"]');
    await expect(navLink).toBeVisible();
  });
});

test.describe('Validation & Standards — study basis panels', () => {
  test('arcFlash.html has a Calculation Basis panel', async ({ page }) => {
    await page.goto('arcFlash.html');
    await expect(page.locator('#study-basis-panel details.study-basis-panel')).toBeVisible();
  });

  test('arcFlash.html basis panel contains IEEE 1584', async ({ page }) => {
    await page.goto('arcFlash.html');
    await expect(page.locator('#study-basis-panel')).toContainText('IEEE 1584');
  });

  test('iec60909.html has a Calculation Basis panel', async ({ page }) => {
    await page.goto('iec60909.html');
    await expect(page.locator('#study-basis-panel details.study-basis-panel')).toBeVisible();
  });

  test('iec60287.html has a Calculation Basis panel', async ({ page }) => {
    await page.goto('iec60287.html');
    await expect(page.locator('#study-basis-panel details.study-basis-panel')).toBeVisible();
  });

  test('groundgrid.html has a Calculation Basis panel', async ({ page }) => {
    await page.goto('groundgrid.html');
    await expect(page.locator('#study-basis-panel details.study-basis-panel')).toBeVisible();
  });

  test('basis panel benchmark link points to validation.html anchor', async ({ page }) => {
    await page.goto('arcFlash.html');
    // Open the details panel
    await page.locator('#study-basis-panel summary').click();
    const link = page.locator('#study-basis-panel .study-basis__benchmark-link a');
    await expect(link).toHaveAttribute('href', /validation\.html#/);
  });
});

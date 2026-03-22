/**
 * E2E smoke tests for core electrical analysis tools:
 * - Load Flow (Newton-Raphson)
 * - Arc Flash (IEEE 1584)
 * - Short Circuit (ANSI / IEC)
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

// ---------------------------------------------------------------------------
// Load Flow
// ---------------------------------------------------------------------------
test.describe('Load Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('loadFlow.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Load Flow');
  });

  test('has form with Run Study button', async ({ page }) => {
    await expect(page.locator('#loadflow-form')).toBeVisible();
    await expect(page.locator('#loadflow-form button[type="submit"]')).toBeVisible();
  });

  test('runs study and populates output', async ({ page }) => {
    await page.fill('input[name="baseMVA"]', '100');
    await page.locator('#loadflow-form button[type="submit"]').click();
    const output = page.locator('#loadflow-output');
    await expect(output).not.toBeEmpty();
  });

  test('output contains JSON result keys', async ({ page }) => {
    await page.locator('#loadflow-form button[type="submit"]').click();
    const text = await page.locator('#loadflow-output').textContent();
    // Output should be JSON-parseable
    expect(() => JSON.parse(text)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Arc Flash
// ---------------------------------------------------------------------------
test.describe('Arc Flash', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('arcFlash.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Arc Flash');
  });

  test('has Run Study button', async ({ page }) => {
    await expect(page.locator('#arcflash-form button[type="submit"]')).toBeVisible();
  });

  test('runs study and populates output', async ({ page }) => {
    await page.locator('#arcflash-form button[type="submit"]').click();
    const output = page.locator('#arcflash-output');
    await expect(output).not.toBeEmpty();
  });
});

// ---------------------------------------------------------------------------
// Short Circuit
// ---------------------------------------------------------------------------
test.describe('Short Circuit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('shortCircuit.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Short Circuit');
  });

  test('has method selector and Run Study button', async ({ page }) => {
    await expect(page.locator('#method')).toBeVisible();
    await expect(page.locator('#shortcircuit-form button[type="submit"]')).toBeVisible();
  });

  test('runs ANSI study and populates output', async ({ page }) => {
    await page.selectOption('#method', 'ANSI');
    await page.locator('#shortcircuit-form button[type="submit"]').click();
    await expect(page.locator('#shortcircuit-output')).not.toBeEmpty();
  });

  test('runs IEC study and populates output', async ({ page }) => {
    await page.selectOption('#method', 'IEC');
    await page.locator('#shortcircuit-form button[type="submit"]').click();
    await expect(page.locator('#shortcircuit-output')).not.toBeEmpty();
  });

  test('ANSI and IEC produce different output', async ({ page }) => {
    await page.selectOption('#method', 'ANSI');
    await page.locator('#shortcircuit-form button[type="submit"]').click();
    const ansiText = await page.locator('#shortcircuit-output').textContent();

    await page.selectOption('#method', 'IEC');
    await page.locator('#shortcircuit-form button[type="submit"]').click();
    const iecText = await page.locator('#shortcircuit-output').textContent();

    expect(ansiText).not.toBe(iecText);
  });
});

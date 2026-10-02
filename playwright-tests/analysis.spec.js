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
const startupScriptsByPage = new WeakMap();

// ---------------------------------------------------------------------------
// Load Flow
// ---------------------------------------------------------------------------
test.describe('Load Flow', () => {
  test.beforeEach(async ({ page }) => {
    const startupScripts = [];
    startupScriptsByPage.set(page, startupScripts);
    page.on('request', request => {
      if (request.resourceType() === 'script') startupScripts.push(new URL(request.url()).pathname);
    });
    await page.goto(pageUrl('loadFlow.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page, browserName }) => {
    await expect(page.locator('h1')).toContainText('Load Flow');
    // Firefox does not report file:// subresource requests, so the script list is only observable in Chromium.
    if (browserName === 'chromium') {
      const startupScripts = startupScriptsByPage.get(page) || [];
      expect(startupScripts).toHaveLength(1);
      expect(startupScripts.some(pathname => /\/dist\/loadFlow(?:\.[0-9a-f]{8,})?\.js$/.test(pathname))).toBe(true);
      expect(startupScripts.some(pathname => pathname.endsWith('/dataStore.mjs'))).toBe(false);
      expect(startupScripts.some(pathname => pathname.endsWith('/studies/loadFlow.js'))).toBe(false);
    }
  });

  test('has form with Run Study button', async ({ page }) => {
    await expect(page.locator('#loadflow-form')).toBeVisible();
    await expect(page.locator('#loadflow-form button[type="submit"]')).toBeVisible();
  });

  test('explains balanced and A/B/C phase study modes', async ({ page }) => {
    const balanced = page.locator('input[name="balanced"]');
    await expect(balanced).toBeChecked();
    await expect(page.locator('#loadflow-form')).toContainText('Balanced three-phase');
    await expect(page.locator('#loadflow-form')).toContainText('Phase Assignment');
  });

  test('runs study and populates output', async ({ page }) => {
    await page.fill('input[name="baseMVA"]', '100');
    await page.locator('#loadflow-form button[type="submit"]').click();
    const output = page.locator('#loadflow-output');
    await expect(output).not.toBeEmpty();
  });

  test('renders a readable study state', async ({ page }) => {
    await page.locator('#loadflow-form button[type="submit"]').click();
    const text = await page.locator('#loadflow-output').textContent();
    expect(text).toMatch(/Study not run|Load Flow Results/i);
  });
});

// ---------------------------------------------------------------------------
// Arc Flash
// ---------------------------------------------------------------------------
test.describe('Arc Flash', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const oneLine = {
        activeSheet: 0,
        sheets: [{
          name: 'Arc Flash Fixture',
          components: [{
            id: 'CB-1',
            label: 'CB-1',
            type: 'breaker',
            subtype: 'Breaker',
            kV: 0.48,
            clearing_time: 0.1,
            enclosure: 'box',
            gap: 32,
            working_distance: 455,
            electrode_config: 'VCB',
            enclosure_height: 508,
            enclosure_width: 508,
            enclosure_depth: 508,
            z1: { r: 0.012, x: 0.045 },
            z2: { r: 0.012, x: 0.045 },
            z0: { r: 0.03, x: 0.09 },
            sources: [{
              z1: { r: 0, x: 0.02 },
              z2: { r: 0, x: 0.02 },
              z0: { r: 0, x: 0.02 },
            }],
          }],
        }],
      };
      localStorage.setItem('base:oneLineDiagram', JSON.stringify(oneLine));
    });
    await page.goto(pageUrl('arcFlash.html?e2e=1'));
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
    await expect(page.locator('#arcflash-readiness')).toHaveAttribute('data-status', /ready|review/);
    await expect(page.locator('#arcflash-results-table')).toBeVisible();
    await expect(page.locator('#arcflash-results-table')).toContainText('Clearing time basis');
    await expect(page.locator('#arcflash-export-btn')).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Short Circuit
// ---------------------------------------------------------------------------
test.describe('Short Circuit', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const oneLine = {
        activeSheet: 0,
        sheets: [
          {
            name: 'Short Circuit Fixture',
            components: [
              {
                id: 'BUS-1',
                label: 'BUS-1',
                type: 'bus',
                subtype: 'Bus',
                prefault_voltage: 0.48,
                z1: { r: 0.012, x: 0.045 },
                z2: { r: 0.012, x: 0.045 },
                z0: { r: 0.03, x: 0.09 },
                xr_ratio: 3
              }
            ]
          }
        ]
      };

      localStorage.setItem('base:oneLineDiagram', JSON.stringify(oneLine));
    });
    await page.goto(pageUrl('shortCircuit.html?e2e=1'));
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

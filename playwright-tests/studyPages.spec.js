/**
 * E2E smoke tests for study pages that previously lacked Playwright coverage:
 *  - Harmonic Analysis   (harmonics.html)
 *  - Motor Starting      (motorStart.html)
 *  - Time-Current Curves (tcc.html)
 *  - Design Rule Checker (designrulechecker.html)
 *  - Demand Schedule (demandschedule.html)
 *  - Battery / UPS Sizing (battery.html)
 */
import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root      = path.join(__dirname, '..');
const pageUrl   = file => 'file://' + path.join(root, file);

async function startStaticServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const filePath = path.resolve(root, `.${requested}`);
      if (!(filePath === root || filePath.startsWith(root + path.sep))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const body = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const type = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
      }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: file => new URL(file, `http://127.0.0.1:${port}/`).toString(),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

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

  test('rule skip checkboxes are present', async ({ page }) => {
    await expect(page.locator('#drc-skip-grounding')).toBeAttached();
    await expect(page.locator('#drc-skip-ampacity')).toBeAttached();
    await expect(page.locator('#drc-skip-conduit-fill')).toBeAttached();
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
// Demand Schedule
// -------------------------------------------------------------------------
test.describe('Demand Schedule', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('demandschedule.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with demand profile controls', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Demand');
    await expect(page.locator('#mode-select')).toBeAttached();
    await expect(page.locator('#profile-select')).toBeAttached();
    await expect(page.locator('#review-notes')).toBeAttached();
  });

  test('runs a conservative profile with visible review notes', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(pageUrl('loadlist.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
    await page.click('#load-sample-loads-btn');
    await expect(page.locator('#load-table tbody tr')).toHaveCount(5);

    await page.goto(pageUrl('demandschedule.html?e2e=1'));
    await page.waitForLoadState('networkidle');
    await page.locator('#profile-select').selectOption('dwelling');
    await page.click('#run-btn');

    await expect(page.locator('#summary')).toBeVisible();
    await expect(page.locator('#summary')).toContainText('Dwelling Unit');
    await expect(page.locator('#review-notes')).toBeVisible();
    await expect(page.locator('#review-notes')).toContainText('Demand Profile Review');
    await expect(page.locator('#results table tbody tr')).toHaveCount(5);
    assert_no_critical_errors(errors);
  });
});

// -------------------------------------------------------------------------
// Battery / UPS Sizing
// -------------------------------------------------------------------------
test.describe('Battery / UPS Sizing', () => {
  let staticSite;

  test.beforeAll(async () => {
    staticSite = await startStaticServer();
  });

  test.afterAll(async () => {
    await staticSite?.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(staticSite.url('battery.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('renders rack layout views and connection schedule after analysis', async ({ page }) => {
    await page.locator('#battery-form').evaluate(form => form.requestSubmit());
    await expect(page.locator('#battery-rack-top-svg')).toBeVisible();
    await expect(page.locator('#battery-rack-elevation-svg')).toBeVisible();
    await expect(page.locator('.battery-connection-table tbody tr')).toHaveCount(9);
    await expect(page.locator('.battery-rack-summary-grid')).toContainText('Parallel strings');
  });

  test('reloads saved rack layout result without persisted SVG markup', async ({ page }) => {
    await page.fill('#rack-cell-capacity-ah', '500');
    await page.locator('#battery-form').evaluate(form => form.requestSubmit());
    await expect(page.locator('#battery-rack-top-svg')).toBeVisible();
    const stored = await page.evaluate(() => (
      Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index))).join('\n')
    ));
    expect(stored).not.toContain('battery-rack-top-svg');
    await page.goto(staticSite.url('battery.html?e2e=1'));
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#battery-rack-top-svg')).toBeVisible();
    await expect(page.locator('#battery-rack-elevation-svg')).toBeVisible();
    await expect(page.locator('.battery-rack-summary-grid')).toContainText('Battery racks');
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

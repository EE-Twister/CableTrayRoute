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
const startupScriptsByPage = new WeakMap();

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
  let staticSite;

  test.beforeAll(async () => {
    staticSite = await startStaticServer();
  });

  test.afterAll(async () => {
    await staticSite?.close();
  });

  test.beforeEach(async ({ page }) => {
    const startupScripts = [];
    startupScriptsByPage.set(page, startupScripts);
    page.on('request', request => {
      if (request.resourceType() === 'script') startupScripts.push(new URL(request.url()).pathname);
    });
    await page.goto(staticSite.url('harmonics.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Harmonic');
    const startupScripts = startupScriptsByPage.get(page) || [];
    expect(startupScripts).toHaveLength(3);
    expect(startupScripts.some(pathname => pathname.endsWith('/dist/vendor/d3.min.js'))).toBe(true);
    expect(startupScripts.some(pathname => /\/dist\/harmonics(?:\.[0-9a-f]{8,})?\.js$/.test(pathname))).toBe(true);
    expect(startupScripts.some(pathname => pathname.endsWith('/dist/harmonicNetwork.lazy.js'))).toBe(true);
    expect(startupScripts.some(pathname => pathname.endsWith('/dataStore.mjs'))).toBe(false);
    expect(startupScripts.some(pathname => pathname.endsWith('/analysis/harmonics.js'))).toBe(false);
  });

  test('SVG chart element is present in DOM', async ({ page }) => {
    await expect(page.locator('#harmonics-chart')).toBeAttached();
  });

  test('navigation links are present', async ({ page }) => {
    await expect(page.locator('#nav-links')).toBeAttached();
  });

  test('project toolbar buttons are present', async ({ page }) => {
    await expect(page.locator('#new-project-btn')).toBeAttached();
    await expect(page.locator('#save-project-btn')).toBeAttached();
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

  test('frequency scan persists the canonical report handoff', async ({ page }) => {
    await page.getByRole('button', { name: 'Run Frequency Scan' }).click();
    await expect(page.getByRole('table', { name: 'Frequency scan resonance results' })).toBeVisible();
    const studies = await page.evaluate(async () => {
      const harmonics = await import('./dist/harmonics.js');
      return harmonics.getStudies();
    });
    expect(studies.frequencyScan?.results?.sweep?.length).toBeGreaterThan(0);
    expect(studies.freqScan).toBeUndefined();
  });
});

// -------------------------------------------------------------------------
// Motor Starting
// -------------------------------------------------------------------------
test.describe('Motor Starting', () => {
  let staticSite;

  test.beforeAll(async () => {
    staticSite = await startStaticServer();
  });

  test.afterAll(async () => {
    await staticSite?.close();
  });

  test.beforeEach(async ({ page }) => {
    const startupScripts = [];
    startupScriptsByPage.set(page, startupScripts);
    page.on('request', request => {
      if (request.resourceType() === 'script') startupScripts.push(new URL(request.url()).pathname);
    });
    await page.goto(staticSite.url('motorStart.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Motor Starting');
    const startupScripts = startupScriptsByPage.get(page) || [];
    expect(startupScripts).toHaveLength(2);
    expect(startupScripts.some(pathname => pathname.endsWith('/dist/vendor/d3.min.js'))).toBe(true);
    expect(startupScripts.some(pathname => /\/dist\/motorStart(?:\.[0-9a-f]{8,})?\.js$/.test(pathname))).toBe(true);
    expect(startupScripts.some(pathname => pathname.endsWith('/dataStore.mjs'))).toBe(false);
    expect(startupScripts.some(pathname => pathname.endsWith('/analysis/motorStart.js'))).toBe(false);
  });

  test('SVG chart element is present in DOM', async ({ page }) => {
    await expect(page.locator('#motorstart-chart')).toBeAttached();
  });

  test('navigation links are present', async ({ page }) => {
    await expect(page.locator('#nav-links')).toBeAttached();
  });

  test('project toolbar buttons are present', async ({ page }) => {
    await expect(page.locator('#new-project-btn')).toBeAttached();
    await expect(page.locator('#save-project-btn')).toBeAttached();
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
const tccRequests = new WeakMap();
test.describe('Time-Current Curves', () => {
  let staticSite;

  test.beforeAll(async () => {
    staticSite = await startStaticServer();
  });

  test.afterAll(async () => {
    await staticSite?.close();
  });

  test.beforeEach(async ({ page }) => {
    const requests = [];
    tccRequests.set(page, requests);
    page.on('request', request => requests.push(request.url()));
    await page.goto(staticSite.url('tcc.html?e2e=1&e2e_reset=1'));
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

  test('catalog startup loads metadata and hydrates a curve shard only when plotting', async ({ page }) => {
    const startupResources = tccRequests.get(page) || [];
    expect(startupResources.some(name => name.endsWith('/data/protectiveDeviceIndex.json'))).toBe(true);
    expect(startupResources.some(name => name.endsWith('/data/protectiveDevices.json'))).toBe(false);
    expect(startupResources.some(name => name.includes('/data/protectiveDeviceCatalog/'))).toBe(false);

    await page.click('#plot-btn');
    await expect.poll(async () => (
      (tccRequests.get(page) || []).some(name => name.includes('/data/protectiveDeviceCatalog/'))
    )).toBe(true);
    await expect(page.locator('.tcc-device-layer path[tabindex="0"]')).toHaveCount(1);
    expect((tccRequests.get(page) || []).some(name => name.endsWith('/data/protectiveDevices.json'))).toBe(false);
  });

  test('library evidence status is visible in the device picker', async ({ page }) => {
    await page.click('#device-modal-btn');
    await expect(page.locator('.device-library-readiness')).toContainText('0 calculation-ready');
    await expect(page.locator('.device-model-badge').first()).toContainText('Screening');
    await expect(page.locator('.device-detail-meta')).toContainText('Library Status');
    await page.getByRole('button', { name: /^Fuse \(\d+\)$/ }).click();
    await page.getByRole('button', { name: /^S&C Electric Company \(\d+\)$/ }).click();
    await expect(page.locator('.device-model-badge')).toHaveCount(3);
    await expect(page.locator('.device-model-badge').first()).toContainText('Review');
    await expect(page.locator('.device-detail-meta')).toContainText('Source verified — peer review pending');
    await expect(page.locator('.device-detail-meta')).toContainText('612100');
    const sourceVerifiedFilter = page.getByRole('button', { name: 'Source Verified (3)' });
    await expect(sourceVerifiedFilter).toBeEnabled();
    await sourceVerifiedFilter.click();
    await expect(page.locator('.device-model-label')).toHaveCount(3);
    await expect(page.locator('.device-model-label', { hasText: '65E Standard Speed' })).toBeVisible();
    await expect(page.locator('.device-model-badge').first()).toContainText('Review');
  });

  test('custom curve builder captures promotion evidence', async ({ page }) => {
    const toolsMenu = page.locator('details.tcc-action-menu').filter({ has: page.locator('#custom-curve-btn') });
    await toolsMenu.locator('summary').click();
    await page.click('#custom-curve-btn');
    await expect(page.getByText('Source Evidence and Review')).toBeVisible();
    await expect(page.getByLabel('Exact catalog / trip-unit identifier')).toBeVisible();
    await expect(page.getByLabel('Source document')).toBeVisible();
    await expect(page.getByLabel('Promote as calculation-ready after independent source review')).toBeVisible();
  });

  test('reviewed custom curve is promoted only with complete evidence', async ({ page }) => {
    const toolsMenu = page.locator('details.tcc-action-menu').filter({ has: page.locator('#custom-curve-btn') });
    await toolsMenu.locator('summary').click();
    await page.click('#custom-curve-btn');
    await page.getByLabel('Curve name').fill('Reviewed test breaker');
    await page.getByLabel('Device type').selectOption('breaker');
    await page.getByLabel('Exact catalog / trip-unit identifier').fill('TEST-100-3P');
    await page.getByLabel('Source document').fill('Manufacturer TCC TEST-1');
    await page.getByLabel('Revision or date').fill('Rev 1');
    await page.getByLabel('Curve number or page').fill('C-1');
    await page.getByLabel('Extraction method').fill('manufacturer spreadsheet');
    await page.getByLabel('Reviewer').fill('Test reviewer');
    await page.getByLabel('Voltage (VAC)').fill('480');
    await page.getByLabel('Interrupting rating (kA)').fill('35');
    await page.getByPlaceholder('Current (A)').fill('100');
    await page.getByPlaceholder('Time (s)').fill('10');
    await page.getByRole('button', { name: 'Add point', exact: true }).click();
    await page.getByPlaceholder('Current (A)').fill('1000');
    await page.getByPlaceholder('Time (s)').fill('0.1');
    await page.getByRole('button', { name: 'Add point', exact: true }).click();
    await page.getByLabel('Promote as calculation-ready after independent source review').check();
    await page.getByRole('button', { name: 'Add Curve', exact: true }).click();
    await expect(page.locator('#selected-device-summary').getByText('Reviewed test breaker')).toBeVisible();
    await page.click('#device-modal-btn');
    await page.locator('.device-filter-btn', { hasText: 'Custom Curves (1)' }).click();
    await expect(page.locator('.device-model-badge')).toContainText('Ready');
    await expect(page.locator('.device-detail-meta')).toContainText('Calculation-ready');
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

  test('sizes a documented manufacturer duty cycle without curve extrapolation', async ({ page }) => {
    await page.selectOption('#sizing-method', 'manufacturer-duty-cycle');
    await expect(page.locator('#manufacturer-duty-cycle-inputs')).toBeVisible();
    await page.fill('#duty-cycle-periods', '60,100\n60,20');
    await page.fill('#manufacturer-discharge-table', '10,300\n60,100\n120,50');
    await page.fill('#discharge-table-source', 'Example manufacturer manual, Rev A, Table 4');
    await page.fill('#end-voltage-v-per-cell', '1.75');
    await page.fill('#temperature-capacity-factor', '0.8');
    await page.fill('#end-of-life-capacity-pct', '80');
    await page.fill('#design-margin-pct', '10');
    await page.fill('#rack-dc-bus-voltage-v', '125');
    await page.fill('#rack-cell-capacity-ah', '100');
    await page.locator('#battery-form').evaluate(form => form.requestSubmit());

    await expect(page.getByRole('heading', { name: 'Manufacturer-Data Duty-Cycle Results' })).toBeVisible();
    await expect(page.locator('.result-row').filter({ hasText: 'Minimum corrected capacity' })).toContainText('206.3 Ah');
    await expect(page.locator('.result-row').filter({ hasText: 'Required parallel strings' })).toContainText('3');
    await expect(page.getByText('Example manufacturer manual, Rev A, Table 4')).toBeVisible();
    await expect(page.getByRole('note')).toContainText('does not certify IEEE compliance');
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

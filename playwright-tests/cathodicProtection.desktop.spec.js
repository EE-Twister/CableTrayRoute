import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
let server;
let baseUrl;

async function startStaticServer() {
  const instance = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const filePath = path.resolve(root, `.${requestedPath}`);
      if (!(filePath === root || filePath.startsWith(`${root}${path.sep}`))) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }
      const body = await fs.readFile(filePath);
      const extension = path.extname(filePath).toLowerCase();
      const contentType = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png'
      }[extension] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
  return instance;
}

async function openCathodicProtectionPage(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(message.text());
    }
  });
  page.on('requestfailed', (request) => {
    if (request.url().startsWith('https://fonts.googleapis.com/')) {
      return;
    }
    const failure = request.failure()?.errorText || 'request failed';
    errors.push(`${failure}: ${request.url()}`);
  });
  await page.goto(`${baseUrl}/cathodicprotection.html?e2e=1&e2e_reset=1`);
  await expect(page.locator('#cp-form')).toBeVisible();
  await expect(page.locator('#calculation-basis-content .cp-basis-card')).toHaveCount(6);
  return errors;
}

test.beforeAll(async () => {
  server = await startStaticServer();
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test.describe('Cathodic protection desktop buildout', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('passes a WCAG 2.1 AA desktop scan before and after results render', async ({ page }) => {
    const errors = await openCathodicProtectionPage(page);
    const initialScan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .exclude('[data-noaxe]')
      .analyze();
    expect(initialScan.violations).toEqual([]);

    await page.locator('#cp-form button[type="submit"]').click();
    await expect(page.locator('#cp-result-kpis')).toBeVisible();
    const resultScan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .exclude('[data-noaxe]')
      .analyze();
    expect(resultScan.violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('keeps the dark form readable, constrains the CTA, and opens a readable design canvas', async ({ page }) => {
    const errors = await openCathodicProtectionPage(page);

    await page.locator('#settings-btn').click();
    await page.selectOption('#theme-select', 'dark');
    await expect(page.locator('body')).toHaveClass(/dark-mode/);

    const formPresentation = await page.evaluate(() => {
      const parseRgb = (value) => {
        const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [0, 0, 0];
        return channels.map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.03928
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
      };
      const luminance = (value) => {
        const [red, green, blue] = parseRgb(value);
        return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
      };
      const contrast = (foreground, background) => {
        const lighter = Math.max(luminance(foreground), luminance(background));
        const darker = Math.min(luminance(foreground), luminance(background));
        return (lighter + 0.05) / (darker + 0.05);
      };
      const section = document.querySelector('.cp-form-section');
      const label = section.querySelector('label');
      const button = document.querySelector('.cp-form-submit .primary-btn');
      const sectionStyle = getComputedStyle(section);
      const labelStyle = getComputedStyle(label);
      return {
        contrast: contrast(labelStyle.color, sectionStyle.backgroundColor),
        buttonWidth: button.getBoundingClientRect().width,
        sectionBackground: sectionStyle.backgroundColor,
        labelColor: labelStyle.color
      };
    });

    expect(formPresentation.contrast).toBeGreaterThanOrEqual(4.5);
    expect(formPresentation.buttonWidth).toBeGreaterThanOrEqual(200);
    expect(formPresentation.buttonWidth).toBeLessThanOrEqual(420);

    await page.locator('.cp-supporting-workspace').evaluate((details) => {
      details.open = true;
    });
    await page.locator('#cp-layout-canvas-panel details').evaluate((details) => {
      details.open = true;
    });

    await expect(page.locator('#cp-layout-zoom-status')).toContainText('Readable route window');
    await expect(page.locator('#cp-layout-canvas svg')).toBeVisible();
    await expect(page.locator('#cp-layout-canvas [data-segment-index]')).toHaveCount(12);
    const canvasScale = await page.locator('#cp-layout-canvas svg > g').getAttribute('transform');
    const scaleMatch = canvasScale?.match(/scale\(([\d.]+)\)/);
    expect(Number(scaleMatch?.[1] || 0)).toBeGreaterThan(1);
    await expect(page.locator('#cp-element-properties-content')).toContainText('4 segments');
    await page.locator('#cp-layout-canvas .cp-layout-structure-line').nth(2).click({ force: true });
    await expect(page.locator('#cp-element-properties-content')).toContainText('Structure segment 3');

    await page.locator('[aria-labelledby="calculation-basis-heading"] > details').evaluate((details) => {
      details.open = true;
    });
    await expect(page.locator('.cp-basis-card code')).toHaveCount(5);
    await expect(page.locator('.cp-basis-outputs span').first()).toBeVisible();
    await expect(page.locator('.method-panel')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('persists a comparison baseline and records input-to-outcome design history', async ({ page }) => {
    const errors = await openCathodicProtectionPage(page);
    const calculateButton = page.locator('#cp-form button[type="submit"]');

    await calculateButton.click();
    await expect(page.locator('#cp-result-kpis .cp-result-kpi')).toHaveCount(3);
    const baselineCurrent = await page.locator('.cp-result-kpi').first().locator('strong').textContent();

    await page.getByRole('button', { name: 'Save current as baseline' }).click();
    await expect(page.locator('#cp-compare-panel')).toBeVisible();

    await page.fill('#coating-breakdown', '0.50');
    await page.locator('#interference-geometry').evaluate((field) => {
      field.closest('details').open = true;
    });
    await page.selectOption('#interference-geometry', 'parallel');
    await page.selectOption('#interference-source-type', 'dc-traction');
    await page.fill('#foreign-structure-separation', '2');
    await page.fill('#parallel-exposure-length', '4000');
    await page.fill('#measured-potential-gradient', '6');
    await page.selectOption('#bonding-strategy', 'controlled-drainage');
    await page.fill('#design-change-note', 'Raised coating contingency and resolved the shared-corridor drainage concept.');
    await calculateButton.click();

    await expect.poll(async () => page.locator('.cp-result-kpi').first().locator('strong').textContent()).not.toBe(baselineCurrent);
    await expect(page.locator('#design-change-note')).toHaveValue('');
    await expect(page.locator('.cp-interference-result .result-badge')).toContainText('HIGH');
    await expect(page.locator('.cp-interference-summary')).toContainText('Potential gradient');
    await expect(page.getByRole('button', { name: 'Compare configurations' })).toBeVisible();
    await page.getByRole('button', { name: 'Compare configurations' }).click();
    await expect(page.locator('#cp-compare-panel')).toBeVisible();
    await expect(page.locator('.cp-delta-card').first().locator('p')).not.toHaveText(/^0(?:\.0+)? A$/);

    await page.locator('.cp-supporting-workspace').evaluate((details) => {
      details.open = true;
    });
    await page.locator('[aria-labelledby="cp-decision-timeline-heading"] > details').evaluate((details) => {
      details.open = true;
    });
    await expect(page.locator('.cp-timeline-step')).toHaveCount(5);
    await expect(page.locator('.cp-timeline-active-detail')).toHaveCount(1);
    await expect(page.locator('.cp-design-history__entry')).toHaveCount(2);
    await expect(page.locator('.cp-design-history')).toContainText('Raised coating contingency');
    await expect(page.locator('.cp-design-history')).toContainText('Required current');
    expect(errors).toEqual([]);
  });

  test('keeps unit changes calculation-safe and guides users through concise validation', async ({ page }) => {
    const errors = await openCathodicProtectionPage(page);
    const calculateButton = page.locator('#cp-form button[type="submit"]');

    const hiddenRows = page.locator([
      '#manual-density-row',
      '#pipe-od-row',
      '#pipe-length-row',
      '#calculated-surface-area-row',
      '[data-coating-curve-row]',
      '#coating-segment-row'
    ].join(', '));
    await expect(hiddenRows).toHaveCount(8);
    for (let index = 0; index < await hiddenRows.count(); index += 1) {
      await expect(hiddenRows.nth(index)).toBeHidden();
    }

    await expect(page.locator('#cp-form .cp-required-marker')).toHaveCount(0);
    await expect(page.locator('#criteria-evidence-enabled')).not.toBeChecked();
    await expect(page.locator('#cp-criteria-evidence-fields')).toHaveAttribute('disabled', '');

    await calculateButton.click();
    await expect(page.locator('#cp-result-kpis .cp-result-kpi > strong')).toHaveCount(3);
    const imperialKpis = await page.locator('#cp-result-kpis .cp-result-kpi > strong').allTextContents();
    await expect(page.locator('#cp-result-kpis .cp-result-kpi').nth(1).locator('strong')).toContainText('lb');
    await expect(page.locator('#cp-criteria-results')).toContainText('Not evaluated');
    await expect(page.locator('.cp-interference-result')).toContainText('Active risk drivers: none');
    await expect(page.getByText('Show complete factor breakdown')).toBeVisible();
    await expect(page.locator('#cp-sensitivity-results')).not.toHaveAttribute('open', '');
    await expect(page.locator('#cp-profile-results')).not.toHaveAttribute('open', '');

    await page.getByRole('button', { name: 'Enter field evidence' }).click();
    await expect(page.locator('#criteria-evidence-enabled')).toBeChecked();
    await expect(page.locator('#cp-criteria-evidence-fields')).not.toHaveAttribute('disabled', '');
    await calculateButton.click();
    await expect(page.locator('#measured-off-potential')).toBeFocused();
    await expect(page.locator('#measured-off-potential')).toHaveAttribute('aria-invalid', 'true');
    await page.fill('#measured-off-potential', '-900');
    await page.fill('#simulated-polarization-shift', '120');
    await page.fill('#test-point-count', '10');
    await page.fill('#test-point-pass-count', '10');
    await calculateButton.click();
    await expect(page.locator('#cp-criteria-results .result-badge')).toContainText('Pass');
    await expect(page.locator('#cp-criteria-results tbody tr')).toHaveCount(3);

    await page.locator('#settings-btn').click();
    await expect(page.locator('#unit-select')).toBeVisible();
    await page.selectOption('#unit-select', 'metric');
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-menu')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('label[for="surface-area"] .unit-label-ft')).toBeHidden();
    await expect(page.locator('label[for="surface-area"] .unit-label-m')).toBeVisible();
    await expect.poll(async () => Number(await page.locator('#surface-area').inputValue())).toBeCloseTo(46.45152, 5);
    await expect.poll(async () => Number(await page.locator('#pipe-od').inputValue())).toBeCloseTo(304.8, 5);
    await expect.poll(async () => Number(await page.locator('#anode-spacing').inputValue())).toBeCloseTo(30.48, 5);
    await expect.poll(async () => Number(await page.locator('#installed-mass').inputValue())).toBeCloseTo(226.796185, 5);

    await calculateButton.click();
    await expect(page.locator('#cp-result-kpis .cp-result-kpi').first().locator('strong')).toHaveText(imperialKpis[0]);
    await expect(page.locator('#cp-result-kpis .cp-result-kpi').nth(1).locator('strong')).toContainText('kg');
    await expect(page.locator('#cp-result-kpis .cp-result-kpi').nth(2).locator('strong')).toHaveText(imperialKpis[2]);

    await page.locator('#settings-btn').click();
    await expect(page.locator('#unit-select')).toBeVisible();
    await page.selectOption('#unit-select', 'imperial');
    await page.keyboard.press('Escape');
    await expect.poll(async () => Number(await page.locator('#surface-area').inputValue())).toBeCloseTo(500, 4);
    await expect.poll(async () => Number(await page.locator('#anode-spacing').inputValue())).toBeCloseTo(100, 4);
    await expect.poll(async () => Number(await page.locator('#installed-mass').inputValue())).toBeCloseTo(500, 4);

    await page.fill('#soil-ph', '15');
    await calculateButton.click();
    await expect(page.locator('#cp-errors')).toBeVisible();
    await expect(page.locator('#soil-ph')).toBeFocused();
    await expect(page.locator('#soil-ph')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#soil-ph')).toHaveAttribute('aria-describedby', /cp-errors/);

    await page.fill('#soil-ph', '7');
    await expect(page.locator('#soil-ph')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#cp-errors')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('keeps result provenance visible, restores drafts, and prevents duplicate calculation history', async ({ page }) => {
    const errors = await openCathodicProtectionPage(page);
    const calculateButton = page.locator('#cp-form button[type="submit"]');

    await calculateButton.evaluate((button) => {
      button.click();
      button.click();
    });
    await expect(page.locator('#cp-result-kpis .cp-result-kpi')).toHaveCount(3);
    await expect(page.locator('.cp-modeled-coverage .result-badge')).toContainText(/Review required|Within modeled thresholds/);
    await expect(page.locator('.cp-design-history__entry')).toHaveCount(1);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download report data (JSON)' }).click();
    const reportDownload = await downloadPromise;
    expect(reportDownload.suggestedFilename()).toMatch(/^cathodic-protection-report-data-\d{4}-\d{2}-\d{2}\.json$/);

    await page.fill('#coating-breakdown', '0.42');
    await expect(page.locator('#cp-stale-results-alert')).toBeVisible();
    await expect(calculateButton).toHaveText('Recalculate Updated Inputs');

    await page.locator('.cp-results-nav a[href="#cp-sensitivity-results"]').click();
    await expect(page.locator('#cp-sensitivity-results')).toHaveAttribute('open', '');
    await expect(page.locator('#cp-sensitivity-results > summary')).toBeFocused();

    await page.getByRole('button', { name: 'Revert to last calculated inputs' }).click();
    await expect(page.locator('#cp-stale-results-alert')).toBeHidden();
    await expect(page.locator('#coating-breakdown')).toHaveValue('0.20');

    await page.fill('#coating-breakdown', '0.37');
    await expect(page.locator('#cp-stale-results-alert')).toBeVisible();
    await page.waitForTimeout(350);
    await page.goto(`${baseUrl}/cathodicprotection.html?e2e=1`);
    await expect(page.locator('#cp-form')).toBeVisible();
    await expect(page.locator('#coating-breakdown')).toHaveValue('0.37');
    await expect(page.locator('#cp-stale-results-alert')).toBeVisible();

    await expect(page.locator('.cp-standards-warning')).toContainText('Standards editions are not configured');
    expect(errors).toEqual([]);
  });

  test('switches to an ICCP source workflow and reveals only relevant interference fields', async ({ page }) => {
    const errors = await openCathodicProtectionPage(page);
    const calculateButton = page.locator('#cp-form button[type="submit"]');

    await page.selectOption('#anode-system-type', 'iccp');
    await expect(page.locator('.cp-system-dependent--galvanic').first()).toBeHidden();
    await expect(page.locator('.cp-system-dependent--iccp').first()).toBeVisible();
    await expect(page.locator('#number-of-anodes-label')).toHaveText('Number of groundbed elements');
    await expect(page.locator('#anode-spacing-label')).toHaveText('Groundbed element spacing');
    await expect(page.locator('#anode-distance-label')).toHaveText('Groundbed distance to structure');
    await expect(page.locator('#anode-depth-label')).toHaveText('Groundbed element burial depth');
    await calculateButton.click();
    await expect(page.locator('#cp-result-kpis')).toContainText('Required rectifier output');
    await expect(page.locator('#cp-result-kpis')).toContainText('Rectifier capacity headroom');
    await expect(page.locator('#cp-result-kpis')).not.toContainText('Minimum anode mass');

    await page.locator('#interference-geometry').evaluate((field) => {
      field.closest('details').open = true;
    });
    await expect(page.locator('#foreign-structure-separation-row')).toBeHidden();
    await expect(page.locator('#parallel-exposure-length-row')).toBeHidden();
    await page.selectOption('#interference-geometry', 'crossing');
    await expect(page.locator('#foreign-structure-separation-row')).toBeVisible();
    await expect(page.locator('#crossing-angle-row')).toBeVisible();
    await expect(page.locator('#parallel-exposure-length-row')).toBeHidden();
    await page.selectOption('#interference-geometry', 'parallel');
    await expect(page.locator('#parallel-exposure-length-row')).toBeVisible();
    await expect(page.locator('#crossing-angle-row')).toBeHidden();

    await page.locator('#cp-profile-results').evaluate((details) => {
      details.open = true;
    });
    await expect(page.locator('.cp-profile-swatch')).toHaveCount(3);
    await expect(page.locator('.cp-threshold-label')).toHaveCount(3);
    await expect(page.locator('.cp-profile-data')).toHaveCount(3);
    const initialProfileRows = await page.locator('.cp-profile-data').first().locator('tbody tr').count();
    expect(initialProfileRows).toBeGreaterThan(0);
    expect(initialProfileRows % 3).toBe(0);
    await page.locator('[data-profile-toggle="conservative"]').uncheck();
    await page.locator('.cp-profile-data').first().evaluate((details) => {
      details.open = true;
    });
    await expect(page.locator('.cp-profile-data').first().locator('tbody tr')).toHaveCount((initialProfileRows / 3) * 2);
    await expect(page.locator('.cp-profile-data').first()).not.toContainText('conservative');
    expect(errors).toEqual([]);
  });
});

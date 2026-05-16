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
import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

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

async function dismissOnboarding(page) {
  const modal = page.locator('.component-modal').first();
  if (await modal.count()) {
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden({ timeout: 3000 });
  }
  await page.locator('#toast').evaluateAll(nodes => nodes.forEach(node => node.remove()));
}

async function dismissResume(page) {
  const noBtn = page.locator('#resume-no-btn');
  if (await noBtn.count() && await noBtn.isVisible()) {
    await noBtn.click();
  }
}

async function resetStaticStorage(page, staticSite) {
  await page.goto(staticSite.url('index.html?e2e_storage_clear=1'));
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

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
    await expect(page.locator('#tray-construction')).toBeVisible();
    await expect(page.locator('#cover-condition')).toBeVisible();
    await expect(page.locator('#force-coefficient-override')).toBeVisible();
    await expect(page.locator('#projected-area-factor')).toBeVisible();
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
  let staticSite;

  test.beforeAll(async () => {
    staticSite = await startStaticServer();
  });

  test.afterAll(async () => {
    await staticSite.close();
  });

  test.beforeEach(async ({ page }) => {
    await resetStaticStorage(page, staticSite);
    await page.goto(staticSite.url('pullcards.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
    await dismissOnboarding(page);
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

  test('renders selected-pull isometric route and updates row selection', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('base:cableSchedule', JSON.stringify([
        { name: 'PC-1', cable_type: 'Power', diameter: 0.75, weight: 0.5 },
        { name: 'PC-2', cable_type: 'Control', diameter: 0.45, weight: 0.2 }
      ]));
      sessionStorage.setItem('base:routeCache', JSON.stringify({
        batchResults: [
          {
            cable: 'PC-1',
            status: 'Routed',
            total_length: 30,
            breakdown: [
              { tray_id: 'T1', length: 15, start: [0, 0, 0], end: [15, 0, 0] },
              { tray_id: 'T2', length: 15, start: [15, 0, 0], end: [30, 5, 0] }
            ],
            route_segments: [{ type: 'straight', length: 15 }, { type: 'straight', length: 15 }]
          },
          {
            cable: 'PC-2',
            status: 'Routed',
            total_length: 18,
            breakdown: [
              { tray_id: 'T3', length: 18, start: [0, 12, 0], end: [18, 12, 4] }
            ],
            route_segments: [{ type: 'straight', length: 18 }]
          }
        ]
      }));
    });
    await page.goto(staticSite.url('pullcards.html?e2e=1'));
    await page.waitForLoadState('networkidle');
    await dismissOnboarding(page);
    await page.click('#loadFromProjectBtn');
    await expect(page.locator('#pullVisualSection')).toBeVisible();
    await expect(page.locator('#pull-iso-canvas svg')).toBeVisible();
    await expect(page.locator('#pull-iso-status')).toContainText('Exact coordinates');

    await page.locator('#pullTable tbody tr[data-pull="2"]').click();
    await expect(page.locator('#pull-iso-summary')).toContainText('Pull #2');
    await expect(page.locator('#pullTable tbody tr[data-pull="2"]')).toHaveClass(/pull-table-selected/);
  });

  test('shows coordinate-missing visual state for legacy route data', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('base:cableSchedule', JSON.stringify([
        { name: 'LEGACY-1', cable_type: 'Power', diameter: 0.75, weight: 0.5 }
      ]));
      sessionStorage.setItem('base:routeCache', JSON.stringify({
        batchResults: [{
          cable: 'LEGACY-1',
          status: 'Routed',
          total_length: 20,
          breakdown: [{ tray_id: 'T1', length: 20 }],
          route_segments: [{ type: 'straight', length: 20 }]
        }]
      }));
    });
    await page.goto(staticSite.url('pullcards.html?e2e=1'));
    await page.waitForLoadState('networkidle');
    await dismissOnboarding(page);
    await page.click('#loadFromProjectBtn');
    await expect(page.locator('#pullVisualSection')).toBeVisible();
    await expect(page.locator('#pull-iso-status')).toContainText('Coordinate data missing');
    await expect(page.locator('#pull-iso-canvas')).toContainText('Coordinate data missing');
  });
});

// -------------------------------------------------------------------------
// Conduit Bend Schedule
// -------------------------------------------------------------------------
test.describe('Conduit Bend Schedule 3D layout', () => {
  let staticSite;

  test.beforeAll(async () => {
    staticSite = await startStaticServer();
  });

  test.afterAll(async () => {
    await staticSite.close();
  });

  test.beforeEach(async ({ page }) => {
    await resetStaticStorage(page, staticSite);
    await page.goto(staticSite.url('conduitbend.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
    await dismissOnboarding(page);
  });

  test('renders the 3D layout after calculate and highlights selected bends', async ({ page }) => {
    await page.click('#run-btn');
    await expect(page.locator('#conduit-iso-canvas svg')).toBeVisible();
    await expect(page.locator('#conduit-iso-summary')).toContainText('run');

    await page.locator('#runs-container .dynamic-row').first().click();
    await expect(page.locator('#runs-container .dynamic-row').first()).toHaveClass(/iso-linked-selected/);
    await expect(page.locator('#conduit-iso-canvas .iso-marker.is-selected')).toBeVisible();

    await page.locator('#pullbox-container .dynamic-card').first().click();
    await expect(page.locator('#pullbox-container .dynamic-card').first()).toHaveClass(/iso-linked-selected/);
  });

  test('keeps the 3D layout usable on mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 820 });
    await page.click('#run-btn');
    await expect(page.locator('#conduit-iso-canvas svg')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
});

// -------------------------------------------------------------------------
// Spool Sheets
// -------------------------------------------------------------------------
test.describe('Spool Sheets', () => {
  let staticSite;

  test.beforeAll(async () => {
    staticSite = await startStaticServer();
  });

  test.afterAll(async () => {
    await staticSite.close();
  });

  test.beforeEach(async ({ page }) => {
    await resetStaticStorage(page, staticSite);
    await page.goto(staticSite.url('spoolsheets.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
    await dismissOnboarding(page);
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
    await expect(page.locator('#splicePlatePairsPerJoint')).toBeVisible();
    await expect(page.locator('#clampKitsPerSupport')).toBeVisible();
  });

  test('clicking generate with no routes does not crash', async ({ page }) => {
    await page.click('#generateBtn');
    await expect(page.locator('body')).toBeVisible();
  });

  test('renders live spool visual, inspector, and generated summary for project data', async ({ page }) => {
    await page.evaluate(() => {
      const trays = [
        { tray_id: 'TRAY-A', start_x: 0, start_y: 0, start_z: 12, end_x: 24, end_y: 0, end_z: 12, inside_width: 24 },
        { tray_id: 'TRAY-B', start_x: 4, start_y: 6, start_z: 12, end_x: 28, end_y: 6, end_z: 12, inside_width: 24 },
        { tray_id: 'TRAY-C', start_x: 0, start_y: 18, start_z: 18, end_x: 18, end_y: 18, end_z: 18, inside_width: 12 },
      ];
      const cables = [
        { cable_tag: 'CBL-1', from: 'MCC-1', to: 'P-101', length_ft: 38, route_preference: 'TRAY-A' },
      ];
      localStorage.setItem('CTR_PROJECT_V1', JSON.stringify({ name: 'Spool E2E', trays, cables, settings: { units: 'imperial', theme: 'system' } }));
      localStorage.setItem('base:traySchedule', JSON.stringify(trays));
      localStorage.setItem('base:cableSchedule', JSON.stringify(cables));
    });
    await page.goto(staticSite.url('spoolsheets.html?e2e=1'));
    await page.waitForLoadState('networkidle');
    await dismissOnboarding(page);

    await expect(page.locator('#spoolVisualCanvas svg')).toBeVisible();
    await expect(page.locator('#spoolPreviewStatus')).toContainText('Exact coordinates');
    await expect(page.locator('#spoolInspector')).toContainText('SP-001');
    await expect(page.locator('#spoolInspector')).toContainText('Hardware Takeoff');
    await expect(page.locator('#spoolFabricationPackage')).toContainText('Shop Package');
    await expect(page.locator('#spoolBandSummary')).toContainText('Plan Grid Cells');
    await expect(page.locator('#spoolConstraintSummary')).toContainText('shipping');

    await expect(page.locator('#spoolZoomLevel')).toHaveText('100%');
    await expect(page.locator('#spoolRotationLevel')).toHaveText('0 deg');
    await expect(page.locator('#exportSvgBtn')).toBeEnabled();
    const [svgDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#exportSvgBtn'),
    ]);
    expect(svgDownload.suggestedFilename()).toMatch(/^spool-visual-sp-\d{3}-\d{4}-\d{2}-\d{2}\.svg$/);
    const svgPath = await svgDownload.path();
    expect(svgPath).toBeTruthy();
    const svgBytes = await fs.readFile(svgPath, 'utf8');
    expect(svgBytes).toContain('<svg');
    const [pngDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#exportPngBtn'),
    ]);
    expect(pngDownload.suggestedFilename()).toMatch(/^spool-visual-sp-\d{3}-\d{4}-\d{2}-\d{2}\.png$/);
    const pngPath = await pngDownload.path();
    expect(pngPath).toBeTruthy();
    const pngBytes = await fs.readFile(pngPath);
    expect(pngBytes.subarray(0, 4).toString('hex')).toBe('89504e47');

    await page.click('#spoolZoomInBtn');
    await expect(page.locator('#spoolZoomLevel')).toHaveText('118%');
    await expect.poll(() => page.locator('#spoolVisualCanvas svg').evaluate(svg => svg.style.transform))
      .toContain('matrix(1.18');
    await page.click('#spoolRotateRightBtn');
    await expect(page.locator('#spoolRotationLevel')).toHaveText('90 deg');
    await expect.poll(() => page.locator('#spoolVisualCanvas svg').evaluate(svg => svg.style.transform))
      .toContain('matrix(0, 1.18, -1.18, 0');
    await page.click('#spoolFitViewBtn');
    await expect(page.locator('#spoolZoomLevel')).toHaveText('100%');
    await expect(page.locator('#spoolRotationLevel')).toHaveText('0 deg');
    await page.click('#spoolViewFrontBtn');
    await expect(page.locator('#spoolRotationLevel')).toHaveText('90 deg');
    await page.click('#spoolViewRightBtn');
    await expect(page.locator('#spoolRotationLevel')).toHaveText('-90 deg');
    await page.click('#spoolViewSelectedBtn');
    await expect(page.locator('#spoolIsolateBtn')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#spoolViewHomeBtn');
    await expect(page.locator('#spoolRotationLevel')).toHaveText('0 deg');
    await expect(page.locator('#spoolIsolateBtn')).toHaveAttribute('aria-pressed', 'false');
    await page.click('#spoolOrbitBtn');
    await expect(page.locator('#spoolOrbitBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#spoolVisualCanvas')).toHaveClass(/is-orbit-tool/);
    const transformBeforeOrbit = await page.locator('#spoolVisualCanvas svg').evaluate(svg => svg.style.transform);
    const orbitBox = await page.locator('#spoolVisualCanvas').boundingBox();
    expect(orbitBox).toBeTruthy();
    const orbitStartX = orbitBox.x + orbitBox.width / 2 + 120;
    const orbitStartY = orbitBox.y + orbitBox.height / 2;
    const orbitEndX = orbitBox.x + orbitBox.width / 2;
    const orbitEndY = orbitBox.y + orbitBox.height / 2 + 120;
    const canvas = page.locator('#spoolVisualCanvas');
    await canvas.dispatchEvent('pointerdown', {
      pointerId: 17,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: orbitStartX,
      clientY: orbitStartY,
    });
    await canvas.dispatchEvent('pointermove', {
      pointerId: 17,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: orbitEndX,
      clientY: orbitEndY,
    });
    await canvas.dispatchEvent('pointerup', {
      pointerId: 17,
      pointerType: 'mouse',
      button: 0,
      buttons: 0,
      clientX: orbitEndX,
      clientY: orbitEndY,
    });
    await expect.poll(() => page.locator('#spoolVisualCanvas svg').evaluate(svg => svg.style.transform))
      .not.toBe(transformBeforeOrbit);
    await expect(page.locator('#spoolRotationLevel')).not.toHaveText('0 deg');
    await page.click('#spoolOrbitBtn');
    await expect(page.locator('#spoolOrbitBtn')).toHaveAttribute('aria-pressed', 'false');
    await page.click('#spoolFitViewBtn');
    await expect(page.locator('#spoolRotationLevel')).toHaveText('0 deg');
    await page.click('#spoolIsolateBtn');
    await expect(page.locator('#spoolIsolateBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#spoolVisualCanvas')).toHaveClass(/is-isolating/);
    const transformBeforePan = await page.locator('#spoolVisualCanvas svg').evaluate(svg => svg.style.transform);
    await page.locator('#spoolVisualCanvas').focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.locator('#spoolVisualCanvas svg').evaluate(svg => svg.style.transform))
      .not.toBe(transformBeforePan);

    await page.fill('#gridCell', '10');
    await expect(page.locator('#gridCellValue')).toHaveText('10 ft');
    await page.fill('#clampKitsPerSupport', '3');
    await expect(page.locator('#clampKitsPerSupportValue')).toHaveText('3');
    await expect(page.locator('#spoolImpact')).toContainText('Clamp kits');
    await expect(page.locator('#spoolKpis')).toContainText('Spools');

    await page.click('#generateBtn');
    await expect(page.locator('.spool-summary-table')).toBeVisible();
    await expect(page.locator('[data-spool-row="SP-001"]')).toBeVisible();
    await expect(page.locator('#results')).toContainText('Splice Plate Pairs');

    await page.locator('[data-spool-row="SP-001"]').click();
    await expect(page.locator('[data-spool-row="SP-001"]')).toHaveClass(/is-selected/);
    await expect(page.locator('#spoolInspector')).toContainText('TRAY');
  });

  test('exports generated spool sheets as a real XLSX file', async ({ page }) => {
    await page.evaluate(() => {
      const trays = [
        { tray_id: 'XLSX-TRAY-A', start_x: 0, start_y: 0, start_z: 10, end_x: 24, end_y: 0, end_z: 10, inside_width: 24 },
        { tray_id: 'XLSX-TRAY-B', start_x: 0, start_y: 12, start_z: 12, end_x: 24, end_y: 12, end_z: 12, inside_width: 18 },
      ];
      const cables = [
        { cable_tag: 'XLSX-CBL-1', from: 'SWGR-1', to: 'MTR-1', length_ft: 44, route_preference: 'XLSX-TRAY-A' },
      ];
      localStorage.setItem('CTR_PROJECT_V1', JSON.stringify({ name: 'Spool Export E2E', trays, cables, settings: { units: 'imperial', theme: 'system' } }));
      localStorage.setItem('base:traySchedule', JSON.stringify(trays));
      localStorage.setItem('base:cableSchedule', JSON.stringify(cables));
    });
    await page.goto(staticSite.url('spoolsheets.html?e2e=1'));
    await page.waitForLoadState('networkidle');
    await dismissOnboarding(page);

    await page.click('#generateBtn');
    await expect(page.locator('#exportXlsxBtn')).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#exportXlsxBtn'),
    ]);
    const suggestedFilename = download.suggestedFilename();
    expect(suggestedFilename).toMatch(/^spool-sheets-\d{4}-\d{2}-\d{2}\.xlsx$/);

    const exportPath = await download.path();
    expect(exportPath).toBeTruthy();
    const bytes = await fs.readFile(exportPath);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
  });

  test('uses Raceway Schedule tray edits without requiring manual Save', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('tour_done_racewaySchedule', '1');
    });
    await page.goto(staticSite.url('racewayschedule.html?e2e=1'));
    await page.waitForLoadState('networkidle');
    await dismissResume(page);
    await dismissOnboarding(page);

    await page.click('#add-tray-btn');
    const row = page.locator('#trayTable tbody tr').last();
    await row.locator('[name="tray_id"]').fill('AUTO-SP-1');
    await row.locator('[name="start_x"]').fill('0');
    await row.locator('[name="start_y"]').fill('0');
    await row.locator('[name="start_z"]').fill('8');
    await row.locator('[name="end_x"]').fill('24');
    await row.locator('[name="end_y"]').fill('0');
    await row.locator('[name="end_z"]').fill('8');
    await row.locator('[name="inside_width"]').selectOption('12');
    await row.locator('[name="tray_depth"]').selectOption('4');

    await expect.poll(() => page.evaluate(() => {
      const rows = JSON.parse(localStorage.getItem('base:traySchedule') || '[]');
      return rows.some(row => row.tray_id === 'AUTO-SP-1');
    })).toBe(true);

    await page.goto(staticSite.url('spoolsheets.html?e2e=1'));
    await page.waitForLoadState('networkidle');
    await dismissOnboarding(page);

    await expect(page.locator('#spoolPreviewStatus')).toContainText('Exact coordinates for 1 tray segments');
    await expect(page.locator('#spoolVisualCanvas svg')).toBeVisible();
    await expect(page.locator('#spoolInspector')).toContainText('AUTO-SP-1');
  });

  test('keeps live spool preview usable on mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 820 });
    await page.evaluate(() => {
      const trays = [
        { tray_id: 'M-TRAY-1', start_x: 0, start_y: 0, start_z: 10, end_x: 20, end_y: 0, end_z: 10, inside_width: 12 },
      ];
      localStorage.setItem('CTR_PROJECT_V1', JSON.stringify({ name: 'Spool Mobile E2E', trays, cables: [], settings: { units: 'imperial', theme: 'system' } }));
      localStorage.setItem('base:traySchedule', JSON.stringify(trays));
      localStorage.setItem('base:cableSchedule', '[]');
    });
    await page.goto(staticSite.url('spoolsheets.html?e2e=1'));
    await page.waitForLoadState('networkidle');
    await dismissOnboarding(page);

    await expect(page.locator('#spoolVisualCanvas svg')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
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

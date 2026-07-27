/**
 * E2E coverage for the manufacturer catalog browser on the Tray Hardware BOM
 * page: governed evidence display, project-row add/edit/remove, filters, and
 * catalog export.
 *
 * The browser fetches `data/manufacturer_catalog.json`, so these tests run
 * against a static HTTP server rather than `file://`.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

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

const PROJECT_ROW = {
  id: 'PRJ-TRAY-18',
  manufacturer: 'Project Vendor',
  catalogNumber: 'PV-18-4',
  description: 'Project approved 18 in tray',
  material: 'aluminum',
  width_in: '18',
  depth_in: '4',
  list_price_usd: '210.50',
  approvalAuthority: 'Project EE',
  source: 'Approved list rev C',
  lastVerified: '2026-07-01',
  datasheetUrl: 'https://example.com/pv-18-4.pdf',
  standards: 'NEMA VE 1; UL classified',
  bimFamilyName: 'Cable Tray - Ventilated',
  epdSource: 'Vendor EPD 2026',
  epdValidUntil: '2028-01-01',
  co2eKgPerUnit: '5.5',
};

async function fillCatalogForm(page, values) {
  for (const [name, value] of Object.entries(values)) {
    await page.fill(`.catalog-add-form [name="${name}"]`, String(value));
  }
}

async function addProjectRow(page, overrides = {}) {
  const values = { ...PROJECT_ROW, ...overrides };
  await fillCatalogForm(page, values);
  await page.check('.catalog-add-form [name="approved"]');
  await page.selectOption('.catalog-add-form [name="category"]', 'tray');
  await page.click('.catalog-add-submit');
  return values;
}

function rowFor(page, partNumber) {
  return page.locator(`.catalog-table tbody tr[data-product-id="${partNumber}"]`);
}

test.describe('Manufacturer catalog browser', () => {
  let staticSite;

  test.beforeAll(async () => {
    staticSite = await startStaticServer();
  });

  test.afterAll(async () => {
    await staticSite.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto(staticSite.url('trayhardwarebom.html?e2e=1&e2e_reset=1'));
    await expect(page.locator('.catalog-table tbody tr').first()).toBeVisible();
  });

  test('renders seed catalog rows with governance evidence', async ({ page }) => {
    const rows = page.locator('.catalog-table tbody tr');
    expect(await rows.count()).toBeGreaterThanOrEqual(20);

    await expect(page.locator('.catalog-quality-counts')).toContainText('0 approved');
    await expect(rows.first()).toContainText('unreviewed');
    await expect(page.locator('.catalog-quality-gaps')).toContainText('Top evidence gaps');

    const firstRow = rows.first();
    await expect(firstRow).toHaveAttribute('data-catalog-origin', 'base');
    await expect(firstRow.locator('.catalog-confidence')).toBeVisible();
  });

  test('base catalog rows are read-only', async ({ page }) => {
    const firstRow = page.locator('.catalog-table tbody tr').first();
    await expect(firstRow.locator('.catalog-row-edit')).toHaveCount(0);
    await expect(firstRow.locator('.catalog-row-remove')).toHaveCount(0);
  });

  test('adds a fully governed project row at complete confidence', async ({ page }) => {
    await addProjectRow(page);

    await expect(page.locator('.catalog-add-status')).toContainText('Added PRJ-TRAY-18');
    const row = rowFor(page, 'PRJ-TRAY-18');
    await expect(row).toHaveAttribute('data-catalog-origin', 'project');
    await expect(row.locator('.catalog-confidence')).toHaveText('Complete 100%');
    await expect(row).toContainText('$210.50');
  });

  test('rejects a duplicate manufacturer/catalog identity', async ({ page }) => {
    await addProjectRow(page);
    const before = await page.locator('.catalog-table tbody tr').count();

    await addProjectRow(page, { id: 'PRJ-TRAY-18-COPY', description: 'Duplicate identity attempt' });

    await expect(page.locator('.catalog-add-status')).toContainText('already exists');
    expect(await page.locator('.catalog-table tbody tr').count()).toBe(before);
  });

  test('edits a project row in place', async ({ page }) => {
    await addProjectRow(page);
    const before = await page.locator('.catalog-table tbody tr').count();

    await rowFor(page, 'PRJ-TRAY-18').locator('.catalog-row-edit').click();
    await expect(page.locator('.catalog-add-submit')).toHaveText('Save Changes');
    await expect(page.locator('.catalog-add-form [name="epdSource"]')).toHaveValue('Vendor EPD 2026');

    await page.fill('.catalog-add-form [name="description"]', 'Project approved 18 in tray (rev D)');
    await page.fill('.catalog-add-form [name="list_price_usd"]', '225');
    await page.click('.catalog-add-submit');

    await expect(page.locator('.catalog-add-status')).toContainText('Updated PRJ-TRAY-18');
    expect(await page.locator('.catalog-table tbody tr').count()).toBe(before);
    const row = rowFor(page, 'PRJ-TRAY-18');
    await expect(row).toContainText('rev D');
    await expect(row).toContainText('$225.00');
    await expect(page.locator('.catalog-add-submit')).toHaveText('Add Item');
  });

  test('removes a project row only after a confirming click', async ({ page }) => {
    await addProjectRow(page);
    const before = await page.locator('.catalog-table tbody tr').count();

    const removeBtn = rowFor(page, 'PRJ-TRAY-18').locator('.catalog-row-remove');
    await removeBtn.click();
    await expect(removeBtn).toHaveText('Confirm remove');
    expect(await page.locator('.catalog-table tbody tr').count()).toBe(before);

    await removeBtn.click();
    await expect(page.locator('.catalog-add-status')).toContainText('Removed PRJ-TRAY-18');
    await expect(rowFor(page, 'PRJ-TRAY-18')).toHaveCount(0);
  });

  test('filters by origin and catalog confidence', async ({ page }) => {
    await addProjectRow(page);

    await page.selectOption('[data-catalog-filter="origin"]', 'project');
    await expect(page.locator('.catalog-table tbody tr')).toHaveCount(1);
    await expect(rowFor(page, 'PRJ-TRAY-18')).toBeVisible();

    await page.selectOption('[data-catalog-filter="origin"]', '');
    await page.selectOption('[data-catalog-filter="confidence"]', 'complete');
    await expect(page.locator('.catalog-table tbody tr')).toHaveCount(1);

    await page.selectOption('[data-catalog-filter="confidence"]', 'incomplete');
    await expect(page.locator('.catalog-empty')).toBeVisible();
  });

  test('exports the current view as CSV using the import template columns', async ({ page }) => {
    await addProjectRow(page);
    await page.selectOption('[data-catalog-filter="origin"]', 'project');
    await expect(page.locator('.catalog-table tbody tr')).toHaveCount(1);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('.catalog-export-csv'),
    ]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8');

    const [header, firstDataRow] = csv.split('\r\n');
    expect(header).toContain('Part Number');
    expect(header).toContain('Last Verified');
    expect(header).toContain('Datasheet URL');
    expect(firstDataRow).toContain('PRJ-TRAY-18');
    expect(firstDataRow).toContain('Approved list rev C');
    await expect(page.locator('.catalog-import-status')).toContainText('Exported 1 row(s) to CSV');
  });
});

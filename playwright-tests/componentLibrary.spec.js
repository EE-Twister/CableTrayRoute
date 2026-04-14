import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = `file://${path.join(root, 'library.html')}`;

function withAuth(page) {
  return page.addInitScript(() => {
    localStorage.setItem('authToken', 'test-token');
    localStorage.setItem('authCsrfToken', 'test-csrf');
    localStorage.setItem('authExpiresAt', String(Date.now() + 60_000));
    localStorage.setItem('authUser', JSON.stringify({ username: 'playwright' }));
  });
}

test.describe('Component Library structured workflows', () => {
  test('structured edit/save/load cloud roundtrip', async ({ page }) => {
    await withAuth(page);

    const serverState = {
      version: 'v1',
      data: {
        categories: ['equipment'],
        components: [
          { subtype: 'MCC', label: 'Motor Control Center', category: 'equipment', icon: 'icons/components/MCC.svg', ports: 2, schema: {} },
        ],
        icons: { 'icons/components/MCC.svg': 'icons/components/MCC.svg' },
      },
    };

    await page.route('**/api/v1/library', async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(serverState) });
        return;
      }
      if (request.method() === 'PUT') {
        const body = JSON.parse(request.postData() || '{}');
        serverState.data = body.data;
        serverState.version = `v${Number(serverState.version.slice(1)) + 1}`;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, version: serverState.version, unchanged: false }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto(pageUrl);
    await expect(page.locator('[data-kind="component-label"]').first()).toHaveValue('Motor Control Center');

    await page.click('#add-component-row');
    const row = page.locator('#components-grid-body tr').last();
    await row.locator('[data-kind="component-subtype"]').fill('UPS');
    await row.locator('[data-kind="component-label"]').fill('Backup UPS');
    await row.locator('[data-kind="component-category"]').fill('equipment');
    await row.locator('[data-kind="component-icon"]').fill('icons/components/UPS.svg');
    await row.locator('[data-kind="component-ports"]').fill('2');
    await row.locator('[data-kind="component-schema"]').fill('{"kva":{"label":"kVA","type":"number"}}');

    await page.click('#cloud-save-btn');
    await expect(page.getByText('Saved to Cloud')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    await row.locator('[data-kind="component-label"]').fill('Temporary value');
    await page.click('#cloud-load-btn');
    await expect(page.getByText('Loaded from Cloud')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    await expect(row.locator('[data-kind="component-label"]')).toHaveValue('Backup UPS');
  });

  test('import handling validates supported/unsupported workbook formats', async ({ page }) => {
    await page.goto(pageUrl);

    const csvPayload = [
      'subtype,label,category,icon,ports,schema',
      'GEN,Generator,equipment,icons/components/Generator.svg,2,"{""kw"":{""label"":""kW"",""type"":""number""}}"',
    ].join('\n');

    await page.setInputFiles('#library-upload', {
      name: 'library.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvPayload),
    });

    await expect(page.locator('[data-kind="component-subtype"]').last()).toHaveValue('GEN');

    await page.setInputFiles('#library-upload', {
      name: 'bad.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('not-a-real-workbook'),
    });

    await expect(page.getByText('Invalid File')).toBeVisible();
  });

  test('stale baseVersion conflict path supports merge resolution', async ({ page }) => {
    await withAuth(page);

    const initialCloud = {
      version: 'v1',
      data: {
        categories: ['equipment'],
        components: [
          { subtype: 'MCC', label: 'Cloud MCC', category: 'equipment', icon: 'icons/components/MCC.svg', ports: 2, schema: {} },
        ],
        icons: { 'icons/components/MCC.svg': 'icons/components/MCC.svg' },
      },
    };
    const latestCloud = {
      version: 'v2',
      data: {
        categories: ['equipment'],
        components: [
          { subtype: 'MCC', label: 'Cloud MCC', category: 'equipment', icon: 'icons/components/MCC.svg', ports: 2, schema: {} },
          { subtype: 'GEN', label: 'Cloud Generator', category: 'equipment', icon: 'icons/components/Generator.svg', ports: 2, schema: {} },
        ],
        icons: {
          'icons/components/MCC.svg': 'icons/components/MCC.svg',
          'icons/components/Generator.svg': 'icons/components/Generator.svg',
        },
      },
    };

    let getCount = 0;
    let mergedPayload;
    await page.route('**/api/v1/library', async (route, request) => {
      if (request.method() === 'GET') {
        getCount += 1;
        const body = getCount === 1 ? initialCloud : latestCloud;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        return;
      }
      if (request.method() === 'PUT') {
        const payload = JSON.parse(request.postData() || '{}');
        if (payload.baseVersion === 'v1') {
          await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ currentVersion: 'v2' }) });
          return;
        }
        mergedPayload = payload.data;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, version: 'v3' }) });
        return;
      }
      await route.fallback();
    });

    await page.goto(pageUrl);

    await page.click('#add-component-row');
    const localRow = page.locator('#components-grid-body tr').last();
    await localRow.locator('[data-kind="component-subtype"]').fill('UPS');
    await localRow.locator('[data-kind="component-label"]').fill('Local UPS');
    await localRow.locator('[data-kind="component-category"]').fill('equipment');
    await localRow.locator('[data-kind="component-icon"]').fill('icons/components/UPS.svg');
    await localRow.locator('[data-kind="component-ports"]').fill('2');

    await page.click('#cloud-save-btn');
    await expect(page.getByText('Cloud Version Conflict')).toBeVisible();
    await page.getByRole('button', { name: 'Merge non-conflicting changes' }).click();
    await expect(page.getByText('Saved to Cloud')).toBeVisible();

    expect(mergedPayload.components.some((entry) => entry.subtype === 'UPS')).toBeTruthy();
    expect(mergedPayload.components.some((entry) => entry.subtype === 'GEN')).toBeTruthy();
  });
});

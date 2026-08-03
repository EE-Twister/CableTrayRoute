import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = `file://${path.join(root, 'library.html')}`;

const validMccProps = {
  tag: 'MCC-1',
  description: 'Main motor control center',
  manufacturer: 'Generic',
  model: 'MCC-200',
  main_device_type: 'Main breaker',
  form_type: 'Form 3',
  rated_voltage_kv: 0.48,
  bus_rating_a: 800,
  sccr_ka: 42,
  bucket_count: 6,
  spare_bucket_count: 1,
};

function withAuth(page) {
  return page.addInitScript(() => {
    localStorage.setItem('authToken', 'test-token');
    localStorage.setItem('authCsrfToken', 'test-csrf');
    localStorage.setItem('authExpiresAt', String(Date.now() + 60_000));
    localStorage.setItem('authUser', JSON.stringify({ username: 'playwright' }));
  });
}

async function installLibraryApiMock(page, { initialState, latestState = null, conflictBaseVersion = null }) {
  await page.addInitScript(({ initialState, latestState, conflictBaseVersion }) => {
    const clone = value => JSON.parse(JSON.stringify(value));
    const api = {
      state: clone(initialState),
      latest: latestState ? clone(latestState) : null,
      getCount: 0,
      mergedPayload: null,
    };
    window.__libraryApiMock = api;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (String(url).endsWith('/api/v1/library')) {
        const method = String(init?.method || 'GET').toUpperCase();
        if (method === 'GET') {
          api.getCount += 1;
          const body = api.latest && api.getCount > 1 ? api.latest : api.state;
          return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'PUT') {
          const payload = JSON.parse(init?.body || '{}');
          if (conflictBaseVersion && payload.baseVersion === conflictBaseVersion) {
            return new Response(JSON.stringify({ currentVersion: api.latest?.version || 'v2' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
          }
          api.mergedPayload = payload.data;
          const currentVersion = String(api.state.version || 'v1');
          const nextVersionNumber = Number(currentVersion.replace(/^v/, '')) + 1 || 2;
          api.state = { version: `v${nextVersionNumber}`, data: payload.data };
          api.latest = null;
          return new Response(JSON.stringify({ ok: true, version: api.state.version, unchanged: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }
      return originalFetch(input, init);
    };
  }, { initialState, latestState, conflictBaseVersion });
}

test.describe('Component Library structured workflows', () => {
  test('shows governed protective-device inventory with readiness filters', async ({ page }) => {
    const startupScripts = [];
    page.on('request', request => {
      if (request.resourceType() === 'script') startupScripts.push(new URL(request.url()).pathname);
    });
    await page.goto(pageUrl);

    expect(startupScripts).toHaveLength(2);
    expect(startupScripts.some(pathname => pathname.endsWith('/dist/vendor/xlsx.full.min.js'))).toBe(true);
    expect(startupScripts.some(pathname => /\/dist\/library(?:\.[0-9a-f]{8,})?\.js$/.test(pathname))).toBe(true);
    expect(startupScripts.some(pathname => pathname.includes('/src/components/navigation.js'))).toBe(false);
    expect(startupScripts.some(pathname => pathname.endsWith('/dataStore.mjs'))).toBe(false);

    await expect(page.locator('#protective-library-summary')).toContainText('5218 bundled devices');
    await expect(page.locator('#protective-library-summary')).toContainText('Showing the first 200 of 5218 matches');
    await expect(page.locator('#protective-library-body tr')).toHaveCount(200);

    await page.locator('#protective-library-status-filter').selectOption('source_verified');
    await expect(page.locator('#protective-library-body tr').first()).toBeVisible();
    await expect(page.locator('.protective-library-status').first()).toContainText('Source verified');
    await page.locator('#protective-library-search').fill('612065');
    await expect(page.locator('#protective-library-body tr')).toHaveCount(1);
    await expect(page.locator('#protective-library-body')).toContainText('S&C SMU-20 65E Standard Speed');
    await expect(page.locator('#protective-library-body')).toContainText('612065');
    await expect(page.locator('.protective-library-status')).toContainText('Source verified');

    await page.locator('#protective-library-search').fill('not-a-device');
    await expect(page.locator('#protective-library-body tr')).toHaveCount(0);
    await expect(page.locator('#protective-library-empty')).toBeVisible();
  });

  test('structured edit/save/load cloud roundtrip', async ({ page }) => {
    await withAuth(page);

    const serverState = {
      version: 'v1',
      data: {
        categories: ['equipment'],
        components: [
          { subtype: 'MCC', label: 'Motor Control Center', category: 'equipment', icon: 'icons/components/MCC.svg', ports: 2, schema: {}, props: validMccProps },
        ],
        icons: { 'icons/components/MCC.svg': 'icons/components/MCC.svg' },
      },
    };

    await installLibraryApiMock(page, { initialState: serverState });

    await page.goto(pageUrl);
    await expect(page.locator('#sync-badge')).toContainText('Synced');
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
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await row.locator('[data-kind="component-label"]').fill('Temporary value');
    await page.click('#cloud-load-btn');
    await expect(page.getByText('Loaded from Cloud')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await expect(row.locator('[data-kind="component-label"]')).toHaveValue('Backup UPS');
  });

  test('import handling validates supported/unsupported workbook formats', async ({ page }) => {
    await page.goto(pageUrl);
    await expect.poll(() => page.evaluate(() => typeof window.XLSX)).toBe('object');

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

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { subtype: 'UPS', label: 'Backup UPS', category: 'equipment', icon: 'icons/components/UPS.svg', ports: 2, schema: '{"kva":{"label":"kVA","type":"number"}}' },
    ]), 'Components');
    await page.setInputFiles('#library-upload', {
      name: 'library.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    });
    await expect(page.locator('[data-kind="component-subtype"]').last()).toHaveValue('UPS');

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
          { subtype: 'MCC', label: 'Cloud MCC', category: 'equipment', icon: 'icons/components/MCC.svg', ports: 2, schema: {}, props: validMccProps },
        ],
        icons: { 'icons/components/MCC.svg': 'icons/components/MCC.svg' },
      },
    };
    const latestCloud = {
      version: 'v2',
      data: {
        categories: ['equipment'],
        components: [
          { subtype: 'MCC', label: 'Cloud MCC', category: 'equipment', icon: 'icons/components/MCC.svg', ports: 2, schema: {}, props: validMccProps },
          { subtype: 'GEN', label: 'Cloud Generator', category: 'equipment', icon: 'icons/components/Generator.svg', ports: 2, schema: {} },
        ],
        icons: {
          'icons/components/MCC.svg': 'icons/components/MCC.svg',
          'icons/components/Generator.svg': 'icons/components/Generator.svg',
        },
      },
    };

    await installLibraryApiMock(page, { initialState: initialCloud, latestState: latestCloud, conflictBaseVersion: 'v1' });

    await page.goto(pageUrl);
    await expect(page.locator('#sync-badge')).toContainText('Synced');

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

    const mergedPayload = await page.evaluate(() => window.__libraryApiMock?.mergedPayload || null);
    expect(mergedPayload.components.some((entry) => entry.subtype === 'UPS')).toBeTruthy();
    expect(mergedPayload.components.some((entry) => entry.subtype === 'GEN')).toBeTruthy();
  });

  test('admin publishes and reloads an approved team library release', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('authCsrfToken', 'team-test-csrf');
      localStorage.setItem('authExpiresAt', String(Date.now() + 60_000));
      localStorage.setItem('authUser', 'library-admin');
      localStorage.setItem('ctr-user-role', 'admin');
      const originalFetch = window.fetch.bind(window);
      window.__teamLibraryApiMock = { release: null, publications: [] };
      window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input?.url || '';
        if (String(url).endsWith('/api/v1/team-library')) {
          const method = String(init?.method || 'GET').toUpperCase();
          if (method === 'GET') {
            if (!window.__teamLibraryApiMock.release) {
              return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
            }
            return new Response(JSON.stringify(window.__teamLibraryApiMock.release), { status: 200 });
          }
          if (method === 'PUT') {
            const request = JSON.parse(init?.body || '{}');
            const release = {
              version: '1712345678901-a1b2c3d4',
              data: request.data,
              publishedAt: '2026-07-31T18:30:00.000Z',
              publishedBy: 'library-admin',
              releaseNotes: request.releaseNotes,
              unchanged: false,
            };
            window.__teamLibraryApiMock.release = release;
            window.__teamLibraryApiMock.publications.push(request);
            return new Response(JSON.stringify(release), { status: 200 });
          }
        }
        return originalFetch(input, init);
      };
    });

    await page.goto(pageUrl);
    await expect(page.getByRole('button', { name: 'Publish Team Release' })).toBeVisible();
    await page.getByRole('button', { name: 'Publish Team Release' }).click();
    await page.locator('#team-release-notes').fill('Approved standard symbols');
    await page.getByRole('button', { name: 'Publish Release' }).click();
    await expect(page.getByText('Team Release Published')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    const publication = await page.evaluate(() => window.__teamLibraryApiMock.publications[0]);
    expect(publication.releaseNotes).toBe('Approved standard symbols');
    expect(publication.data).toHaveProperty('components');

    await page.getByRole('button', { name: 'Load Team Library' }).click();
    await expect(page.getByText('Team Library Loaded')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('#team-library-status')).toContainText('Loaded team release 1712345678901-a1b2c3d4');
  });
});

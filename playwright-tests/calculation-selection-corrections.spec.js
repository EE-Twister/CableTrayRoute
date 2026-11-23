import { test, expect } from '@playwright/test';
import fsp from 'fs/promises';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function startStaticServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, 'http://127.0.0.1');
      const requested = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
      const filePath = path.resolve(root, `.${requested}`);
      if (!filePath.startsWith(root + path.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const body = await fsp.readFile(filePath);
      const contentType = path.extname(filePath).toLowerCase() === '.html'
        ? 'text/html; charset=utf-8'
        : path.extname(filePath).toLowerCase() === '.css'
        ? 'text/css; charset=utf-8'
        : 'text/javascript; charset=utf-8';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: file => `http://127.0.0.1:${port}/${file}`,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

async function seedNamedProject(page, server, studies = {}) {
  await page.goto(server.url('index.html?e2e=1'), { waitUntil: 'domcontentloaded' });
  await page.evaluate(initialStudies => {
    localStorage.clear();
    localStorage.setItem('ctr_current_scenario_v1', 'base');
    localStorage.setItem('ctr_scenarios_v1', JSON.stringify(['base']));
    localStorage.setItem('CTR_PROJECT_V1', JSON.stringify({
      name: 'Calculation Corrections E2E',
      settings: { units: 'imperial', theme: 'system' },
      equipment: [], loads: [], cables: [], trays: [], conduits: [], ductbanks: [],
    }));
    localStorage.setItem('base:projectMeta', JSON.stringify({ name: 'Calculation Corrections E2E' }));
    localStorage.setItem('base:studyResults', JSON.stringify(initialStudies));
  }, studies);
}

async function gotoSeeded(page, server, file, studies = {}) {
  await seedNamedProject(page, server, studies);
  await page.goto(server.url(`${file}?e2e=1`), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
}

async function readStoredStudy(page, key) {
  return page.evaluate(studyKey => JSON.parse(localStorage.getItem('base:studyResults') || '{}')[studyKey], key);
}

test.describe('calculation selection and validation corrections', () => {
  let server;

  test.beforeAll(async () => {
    server = await startStaticServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test('IEC 60287 invalid thermal geometry preserves the previous valid result', async ({ page }) => {
    test.setTimeout(60000);
    try {
      await gotoSeeded(page, server, 'iec60287.html');
      await page.locator('#iec60287-form').waitFor();
      await page.locator('#iec60287-form button[type="submit"]').click();
      await expect(page.locator('#results')).toContainText('IEC 60287 Ampacity Results');
      const validText = await page.locator('#results').innerText();

      await page.locator('#burial-depth-mm').fill('1');
      await page.locator('#iec60287-form button[type="submit"]').click();
      await expect(page.locator('.component-modal[role="dialog"]')).toContainText(/burial depth|geometry/i);
      await expect(page.locator('#results')).toHaveText(validText);
      const closeModal = page.locator('.component-modal[role="dialog"]').getByRole('button', { name: 'Close', exact: true });
      await closeModal.click();
      await expect(page.locator('.component-modal[role="dialog"]')).toBeHidden();

      for (const invalidDepth of ['', '0']) {
        await page.locator('#burial-depth-mm').fill(invalidDepth);
        await page.locator('#iec60287-form button[type="submit"]').click();
        await expect(page.locator('.component-modal[role="dialog"]')).toContainText(/burial depth|positive/i);
        await expect(page.locator('#results')).toHaveText(validText);
        await page.locator('.component-modal[role="dialog"]').getByRole('button', { name: 'Close', exact: true }).click();
        await expect(page.locator('.component-modal[role="dialog"]')).toBeHidden();
      }
    } finally { /* shared server closes in afterAll */ }
  });

  test('capacitor overflow stays unavailable after save and legacy capped-result reload', async ({ page }) => {
    await gotoSeeded(page, server, 'capacitorbank.html');
    await page.locator('#p-kw').fill('10000');
    await page.locator('#pf-existing').fill('0.70');
    await page.locator('#pf-target').fill('0.95');
    await page.locator('#cap-bank-form button[type="submit"]').click();
    await expect(page.locator('#results')).toContainText('No adequate standard bank available');
    await expect(page.locator('#results')).toContainText('Unavailable');
    const stored = await readStoredStudy(page, 'capacitorBank');
    expect(stored.bankSize).toBeNull();

    await page.evaluate(() => {
      const studies = JSON.parse(localStorage.getItem('base:studyResults') || '{}');
      studies.capacitorBank = {
        ...studies.capacitorBank,
        bankSize: 2400,
        stageKvar: 1200,
        achievedPf: 0.88,
        bankSelection: undefined,
        resonance: { harmonicOrder: 5, riskLevel: 'danger' },
      };
      localStorage.setItem('base:studyResults', JSON.stringify(studies));
    });
    await page.reload();
    await expect(page.locator('#results')).toContainText('No adequate standard bank available');
    await expect(page.locator('#results')).toContainText('Unavailable');
    await expect(page.locator('#results')).not.toContainText('h =');
  });

  test('battery UPS overflow is explicit in saved energy and manufacturer-style results', async ({ page }) => {
    await gotoSeeded(page, server, 'battery.html');
    await page.locator('#avg-load-kw').fill('500');
    await page.locator('#peak-load-kw').fill('900.01');
    await page.locator('#battery-form button[type="submit"]').click();
    await expect(page.locator('#results')).toContainText('Unavailable (catalog max 1000 kVA)');
    await expect(page.locator('.drc-findings').filter({ hasText: /no adequate catalog selection/i })).toHaveCount(1);
    const stored = await readStoredStudy(page, 'batterySizing');
    expect(stored.standardKva).toBeNull();
    expect(stored.upsAdequate).toBe(false);

    await page.evaluate(() => {
      const studies = JSON.parse(localStorage.getItem('base:studyResults') || '{}');
      studies.batterySizing = { ...studies.batterySizing, standardKva: 1000, upsAdequate: undefined, upsExceedsCatalog: undefined };
      localStorage.setItem('base:studyResults', JSON.stringify(studies));
    });
    await page.reload();
    await expect(page.locator('#results')).toContainText('Unavailable (catalog max 1000 kVA)');
    await expect(page.locator('#results')).toContainText(/no adequate catalog selection/i);
  });

  test('battery restores nondefault manual options and remains current after reload', async ({ page }) => {
    await gotoSeeded(page, server, 'battery.html');
    await page.locator('#chemistry').selectOption('lithium-ion');
    await page.locator('#runtime-hours').fill('6');
    await page.locator('#design-margin-pct').fill('17');
    await page.locator('#battery-form button[type="submit"]').click();
    await expect(page.locator('#results')).toContainText('Preliminary Battery / UPS Screening Results');
    await expect(page.locator('.study-global-freshness')).toHaveAttribute('data-study-lifecycle-state', 'current');

    await page.reload();
    await expect(page.locator('#chemistry')).toHaveValue('lithium-ion');
    await expect(page.locator('#runtime-hours')).toHaveValue('6');
    await expect(page.locator('#design-margin-pct')).toHaveValue('17');
    await expect(page.locator('.study-global-freshness')).toHaveAttribute('data-study-lifecycle-state', 'current');
  });

  test('battery edit, identical rerun, reopen, and project export retain lifecycle metadata', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
    });
    await gotoSeeded(page, server, 'battery.html');
    await page.locator('#chemistry').selectOption('lithium-ion');
    await page.locator('#runtime-hours').fill('6');
    await page.locator('#design-margin-pct').fill('17');
    await page.locator('#battery-form button[type="submit"]').click();
    await expect(page.locator('.study-global-freshness')).toHaveAttribute('data-study-lifecycle-state', 'current');

    await page.locator('#runtime-hours').fill('6.5');
    await expect(page.locator('.study-global-freshness')).toHaveAttribute('data-study-lifecycle-state', 'stale');
    await page.locator('#runtime-hours').fill('6');
    await page.locator('#battery-form button[type="submit"]').click();
    await expect(page.locator('.study-global-freshness')).toHaveAttribute('data-study-lifecycle-state', 'current');

    const provenance = await page.evaluate(() => JSON.parse(localStorage.getItem('base:studyProvenance') || '{}'));
    expect(provenance.batterySizing.inputsSnapshot.runtimeHours).toBe(6);
    expect(provenance.batterySizing.capturedAt).toBeTruthy();

    await page.locator('#settings-btn').click();
    await expect(page.locator('#export-project-btn')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-project-btn').click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(exported.settings.studyProvenance.batterySizing.inputsSnapshot.runtimeHours).toBe(6);

    await page.reload();
    await expect(page.locator('#chemistry')).toHaveValue('lithium-ion');
    await expect(page.locator('#runtime-hours')).toHaveValue('6');
    await expect(page.locator('#design-margin-pct')).toHaveValue('17');
    await expect(page.locator('.study-global-freshness')).toHaveAttribute('data-study-lifecycle-state', 'current');
  });

  test('IBR rerunning one tab qualifies it and withholds a changed sibling', async ({ page }) => {
    await gotoSeeded(page, server, 'ibr.html');
    await page.locator('#pv-run-btn').click();
    await expect(page.locator('#pv-results')).toBeVisible();
    await page.locator('#pv-irradiance').fill('900');
    await page.locator('.tab-btn[data-tab="bess"]').click();
    await page.locator('#bess-run-btn').click();
    await expect(page.locator('#bess-results')).toBeVisible();
    await expect(page.locator('#pv-result-cards')).toContainText('Not evaluated');
    await expect(page.locator('#export-csv-btn')).toBeDisabled();
  });

  test('busway overflow shows inadequate status, exports it, and reclassifies legacy reload', async ({ page }) => {
    await gotoSeeded(page, server, 'busdust.html');
    await page.locator('#current-a').fill('6000');
    await page.locator('#calculate-btn').click();
    await expect(page.locator('#results')).toContainText('No adequate catalog rating');
    await expect(page.locator('#warnings-panel')).toContainText(/no adequate standard busway/i);
    const stored = await readStoredStudy(page, 'busDuctSizing');
    expect(stored.selectedBusway.adequate).toBe(false);
    expect(stored.selectedBusway.adequacyStatus).toBe('catalog-exceeded');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-btn').click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8');
    expect(csv).toContain('Selection adequacy');
    expect(csv).toContain('catalog-exceeded');
    expect(csv).toContain('FAIL');

    await page.evaluate(() => {
      const studies = JSON.parse(localStorage.getItem('base:studyResults') || '{}');
      studies.busDuctSizing.selectedBusway.adequate = true;
      studies.busDuctSizing.selectedBusway.adequacyStatus = 'adequate';
      studies.busDuctSizing.selectedBusway.catalogAdequate = true;
      studies.busDuctSizing.selectedBusway.deratingAdequate = true;
      localStorage.setItem('base:studyResults', JSON.stringify(studies));
    });
    await page.reload();
    await expect(page.locator('#results')).toContainText('No adequate catalog rating');
  });
});

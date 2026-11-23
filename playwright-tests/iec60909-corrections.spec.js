import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

test.use({ serviceWorkers: 'block' });

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted && c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (quoted && c === '"') quoted = false;
    else if (!quoted && c === '"') quoted = true;
    else if (!quoted && c === ',') { row.push(cell); cell = ''; }
    else if (!quoted && c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

async function readDownloadBytes(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function readPdfText(bytes) {
  const document = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return pages.join('\n');
}
let server;
let base;
let dataDir;

test.beforeAll(async () => {
  await fs.mkdir(path.join(process.cwd(), 'output', 'calculation-corrections-2026-09-17'), { recursive: true });
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-iec60909-'));
  const app = await createApp({ dataDir, staticRoot: process.cwd(), enforceHttps: false, rateLimit: { windowMs: 60_000, max: 500 } });
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (dataDir) await fs.rm(dataDir, { recursive: true, force: true }); });

test('IEC 60909 exposes physical 2LG values, provenance, escaped CSV, and stale metadata', async ({ page }) => {
  await page.goto(`${base}/iec60909.html?e2e=1#iec-correction-project`);
  await page.waitForFunction(() => Boolean(window.dataStore));
  await page.evaluate(() => {
    window.dataStore.setOneLine({ activeSheet: 0, sheets: [{ id: 'S', name: 'Main', components: [{ id: 'BUS', subtype: 'Bus', kV: 11, z1: { r: 0.02, x: 0.2 }, z2: { r: 0.05, x: 0.1 }, z0: { r: 0.1, x: 0.3 } }] }] });
  });
  await page.locator('[name="cMode"]').selectOption('max');
  await page.locator('#run-btn').click();
  await expect(page.locator('#results-tbody')).toContainText('evaluated');
  await expect(page.locator('.study-global-freshness')).toHaveCount(1);
  await page.locator('[name="freqHz"]').selectOption('60');
  await expect(page.locator('#study-meta')).toContainText('STALE INPUTS');
  await page.locator('[name="freqHz"]').selectOption('50');
  await page.locator('[name="faultDurationS"]').fill('2');
  await page.locator('#run-btn').click();
  await expect(page.locator('#study-meta')).toContainText('fresh');
  await page.reload();
  await page.waitForFunction(() => Boolean(window.dataStore));
  await expect(page.locator('[name="faultDurationS"]')).toHaveValue('2');
  await expect(page.locator('#results-tbody')).toContainText('evaluated');
  await page.evaluate(() => window.dataStore.setOneLine({ activeSheet: 0, sheets: [{ id: 'S', name: 'Main', components: [{ id: 'BUS', subtype: 'Bus', kV: 11 }] }] }));
  await expect(page.locator('#study-meta')).toContainText('STALE INPUTS');
  const csvDownloadPromise = page.waitForEvent('download');
  await page.locator('#download-csv-btn').click();
  const csvDownload = await csvDownloadPromise;
  const csvBytes = await readDownloadBytes(csvDownload);
  const text = csvBytes.toString('utf8');
  await fs.writeFile(path.join(process.cwd(), 'output', 'calculation-corrections-2026-09-17', 'iec60909-results.csv'), csvBytes);
  expect(text).toContain('doubleLineGroundPhaseBKA_kA');
  expect(text).toContain('doubleLineGroundEarthKA_kA');
  expect(text).toContain('39.88');
  expect(text).toContain('19.54');
  expect(text).toContain('inputFingerprint');
  expect(text).toContain('studyOptions');
  expect(text).toContain('provenance');
  const csvRows = parseCsv(text);
  const columns = csvRows[0];
  const row = csvRows[1];
  const value = name => row[columns.indexOf(name)];
  expect(columns).toContain('modelLimits');
  expect(value('validity')).toBe('evaluated');
  expect(value('freshness')).toBe('stale');
  expect(JSON.parse(value('studyOptions')).cMode).toBe('max');
  expect(JSON.parse(value('provenance')).standard).toBe('IEC 60909-0:2016');
  expect(value('inputFingerprint')).toBeTruthy();
  expect(value('currentInputFingerprint')).toBeTruthy();

  const pdfDownloadPromise = page.waitForEvent('download');
  await page.locator('#download-pdf-btn').click();
  const pdfBytes = await readDownloadBytes(await pdfDownloadPromise);
  await fs.writeFile(path.join(process.cwd(), 'output', 'calculation-corrections-2026-09-17', 'iec60909-results.pdf'), pdfBytes);
  const pdfText = await readPdfText(pdfBytes);
  expect(pdfText).toContain('IEC 60909-0:2016 Short-Circuit Report');
  expect(pdfText).toContain('Input provenance');
  expect(pdfText).toContain('Study options');
  expect(pdfText).toContain('Freshness: stale');
  await page.screenshot({ path: path.join(process.cwd(), 'output', 'calculation-corrections-2026-09-17', 'iec60909-results.png'), fullPage: true });
});

test('IEC 60909 missing impedance is explicitly incomplete', async ({ page }) => {
  await page.goto(`${base}/iec60909.html?e2e=1#iec-missing-project`);
  await page.waitForFunction(() => Boolean(window.dataStore));
  await page.evaluate(() => window.dataStore.setOneLine({ activeSheet: 0, sheets: [{ id: 'S', components: [{ id: 'MISSING', subtype: 'Bus', kV: 11 }] }] }));
  await page.locator('#run-btn').click();
  await expect(page.locator('#results-tbody')).toContainText('unevaluated');
  await expect(page.locator('#results-tbody')).toContainText('impedance');
  await expect(page.locator('#results-tbody')).not.toContainText('undefined');
  const csvDownloadPromise = page.waitForEvent('download');
  await page.locator('#download-csv-btn').click();
  const csvBytes = await readDownloadBytes(await csvDownloadPromise);
  const csvRows = parseCsv(csvBytes.toString('utf8'));
  const columns = csvRows[0];
  const row = csvRows[1];
  const value = name => row[columns.indexOf(name)];
  expect(value('threePhaseKA_kA')).toBe('');
  expect(value('doubleLineGroundPhaseBKA_kA')).toBe('');
  expect(value('doubleLineGroundEarthKA_kA')).toBe('');
  expect(value('mu')).toBe('');
  expect(value('validity')).toBe('unevaluated');
  expect(JSON.parse(value('studyOptions')).cMode).toBe('max');
  expect(JSON.parse(value('provenance')).standard).toBe('IEC 60909-0:2016');
  expect(value('freshness')).toBe('fresh');
  await page.evaluate(() => {
    const studies = window.dataStore.getStudies();
    studies.iec60909 = { LEGACY: { threePhaseKA: 1, validity: 'evaluated' } };
    window.dataStore.setStudies(studies);
  });
  await page.reload();
  await expect(page.locator('#results-tbody')).toContainText('unknown');
  await expect(page.locator('.study-global-freshness')).toHaveCount(1);
  await expect(page.locator('.study-global-freshness')).toHaveAttribute('data-study-lifecycle-state', 'incomplete');
  await expect(page.locator('.study-global-freshness')).toContainText('incomplete');
});

test('IEC 60909 restores saved row options, excludes metadata from exports, and preserves saved data on invalid options', async ({ page }) => {
  await page.goto(`${base}/iec60909.html?e2e=1#iec-saved-result`);
  await page.waitForFunction(() => Boolean(window.dataStore));
  await page.evaluate(() => {
    window.dataStore.setOneLine({
      activeSheet: 0,
      sheets: [{ id: 'S', name: 'Main', components: [{
        id: 'BUS-SAVED', subtype: 'Bus', kV: 11,
        z1: { r: 0.02, x: 0.2 }, z2: { r: 0.05, x: 0.1 }, z0: { r: 0.1, x: 0.3 },
      }] }],
    });
    window.dataStore.setStudies({
      iec60909: {
        'BUS-SAVED': {
          prefaultKV: 11, cFactor: 1.1, kappa: 1.8,
          threePhaseKA: 34.12, lineToGroundKA: 19.01, lineToLineKA: 29.55,
          doubleLineGroundKA: 31.22, doubleLineGroundPhaseBKA: 17.08,
          doubleLineGroundPhaseCKA: 17.08, doubleLineGroundEarthKA: 14.14,
          ip: 86.92, mu: 0.98, Ib: 33.01, Ith: 34.8,
          validity: 'evaluated', calculationStatus: 'screening-only', requiredInputs: [], warnings: [],
          provenance: { standard: 'IEC 60909-0:2016', source: 'saved-test' },
          modelLimits: { marker: 'model-limits-kept' },
          studyOptions: { method: 'IEC', cMode: 'min', lvTolerancePct: 6, faultDurationS: 0.5, freqHz: 50, minTimeDelayS: 0.05 },
          inputFingerprint: 'saved-fingerprint', calculatedAt: '2026-09-17T00:00:00.000Z',
        },
        metadata: { marker: 'UNEXPECTED-METADATA', owner: 'should-not-export' },
        _internal: { marker: 'UNEXPECTED-INTERNAL' },
      },
    });
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.dataStore));
  await expect(page.locator('[name="cMode"]')).toHaveValue('min');
  await expect(page.locator('[name="faultDurationS"]')).toHaveValue('0.5');
  await expect(page.locator('#results-tbody')).toContainText('BUS-SAVED');
  await expect(page.locator('#results-tbody')).not.toContainText('UNEXPECTED-METADATA');
  await expect(page.locator('#results-tbody')).not.toContainText('UNEXPECTED-INTERNAL');

  const csvDownloadPromise = page.waitForEvent('download');
  await page.locator('#download-csv-btn').click();
  const csvBytes = await readDownloadBytes(await csvDownloadPromise);
  const csvText = csvBytes.toString('utf8');
  expect(csvText).not.toContain('UNEXPECTED-METADATA');
  expect(csvText).not.toContain('UNEXPECTED-INTERNAL');
  const csvRows = parseCsv(csvText);
  const columns = csvRows[0];
  const row = csvRows[1];
  const value = name => row[columns.indexOf(name)];
  expect(value('freshness')).toBe('stale');
  expect(JSON.parse(value('studyOptions')).cMode).toBe('min');

  const pdfDownloadPromise = page.waitForEvent('download');
  await page.locator('#download-pdf-btn').click();
  const pdfBytes = await readDownloadBytes(await pdfDownloadPromise);
  const pdfText = await readPdfText(pdfBytes);
  expect(pdfText).toContain('BUS-SAVED');
  expect(pdfText).not.toContain('UNEXPECTED-METADATA');
  expect(pdfText).not.toContain('UNEXPECTED-INTERNAL');
  expect(pdfText).toContain('Freshness: stale');

  const savedBeforeInvalid = await page.evaluate(() => JSON.stringify(window.dataStore.getStudies().iec60909));
  for (const invalidDuration of ['0', '']) {
    await page.locator('[name="faultDurationS"]').fill(invalidDuration);
    await page.locator('#run-btn').click();
    await expect(page.locator('#study-meta')).toContainText(/calculation failed|positive/i);
    const savedAfterInvalid = await page.evaluate(() => JSON.stringify(window.dataStore.getStudies().iec60909));
    expect(savedAfterInvalid).toBe(savedBeforeInvalid);
  }
});

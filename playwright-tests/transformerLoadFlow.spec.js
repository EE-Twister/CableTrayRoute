import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { startStaticServer } from './staticServer.helper.js';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function transformerOneLine(overrides = {}) {
  return { activeSheet: 0, sheets: [{ name: '480 to 208 transformer', components: [
    { id: 'HV', type: 'bus', busType: 'slack', baseKV: 0.48, Vm: 1, Va: 0 },
    { id: 'LV', type: 'bus', busType: 'PQ', baseKV: 0.208, Vm: 1, Va: 0, load: { kw: 30, kvar: 0 } },
    { id: 'TX', type: 'transformer', subtype: 'two_winding', volts_primary: 480, volts_secondary: 208, kva: 75, percent_z: 5, xr_ratio: 10, ...overrides,
      connections: [{ target: 'HV', sourcePort: 0 }, { target: 'LV', sourcePort: 1 }] },
  ] }] };
}

test.describe('Transformer load-flow presentation', () => {
  let staticSite;
  test.beforeAll(async () => { staticSite = await startStaticServer(root); });
  test.afterAll(async () => { await staticSite?.close(); });

  test('shows side currents and preserves transformer drop meaning through PDF export', async ({ page }, testInfo) => {
    await page.goto(staticSite.url('loadFlow.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
    await page.evaluate(oneLine => { window.dataStore.setProjectMeta({ id: 'transformer-browser-fixture', name: 'Transformer browser fixture' }); window.dataStore.setOneLine(oneLine); }, transformerOneLine());
    await page.goto(staticSite.url('loadFlow.html?e2e=1'));
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="baseMVA"]', '1');
    await page.locator('#loadflow-form button[type="submit"]').click();
    const output = page.locator('#loadflow-output');
    await expect(output).toContainText(/From 36\.[0-9] \/ To 83\.[0-9]/);
    await expect(output).toContainText(/rated-voltage terminal bases/);
    await page.screenshot({ path: testInfo.outputPath('transformer-results.png'), fullPage: true });
    await expect(page.locator('#export-loadflow-btn')).toBeEnabled();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-loadflow-btn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('loadflow.pdf');
    const pdfStream = await download.createReadStream();
    const pdfChunks = [];
    for await (const chunk of pdfStream) pdfChunks.push(chunk);
    const pdfBytes = Buffer.concat(pdfChunks);
    const pdfArtifactPath = testInfo.outputPath('loadflow.pdf');
    await fs.mkdir(path.dirname(pdfArtifactPath), { recursive: true });
    await fs.writeFile(pdfArtifactPath, pdfBytes);
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
    let pdfText = '';
    for (let index = 1; index <= pdf.numPages; index += 1) pdfText += (await (await pdf.getPage(index)).getTextContent()).items.map(item => item.str).join(' ');
    const normalizedPdfText = pdfText.replace(/\s+/g, ' ').trim();
    expect(normalizedPdfText).toContain('From 36.2 A / To 83.5 A');
    expect(normalizedPdfText).toContain('Voltage drop 0.22% (0.5 V); rated-voltage terminal bases');
    await pdf.destroy();
  });

  test('malformed transformer loss input shows an error and disables stale export', async ({ page }) => {
    await page.goto(staticSite.url('loadFlow.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
    await page.evaluate(oneLine => { window.dataStore.setProjectMeta({ id: 'transformer-browser-fixture', name: 'Transformer browser fixture' }); window.dataStore.setOneLine(oneLine); }, transformerOneLine());
    await page.goto(staticSite.url('loadFlow.html?e2e=1'));
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="baseMVA"]', '1');
    await page.locator('#loadflow-form button[type="submit"]').click();
    await expect(page.locator('#export-loadflow-btn')).toBeEnabled();
    await page.evaluate(oneLine => { oneLine.sheets[0].components.find(item => item.id === 'TX').coreLossKw = 'not-a-number'; window.dataStore.setOneLine(oneLine); }, transformerOneLine());
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#loadflow-readiness')).toContainText('coreLossKw');
    await expect(page.locator('#export-loadflow-btn')).toBeDisabled();
    await page.locator('#loadflow-form button[type="submit"]').click();
    await expect(page.locator('#loadflow-output')).toContainText('Study not run');
    await expect(page.locator('#export-loadflow-btn')).toBeDisabled();
  });
});

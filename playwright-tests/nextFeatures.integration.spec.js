import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  navigateForE2E,
  applyCostEstimatorFixture,
  COST_ESTIMATOR_FIXTURES,
  COST_ESTIMATOR_CANONICAL_FIXTURE,
  EMF_CANONICAL_FIXTURE,
  setupCEPage,
  setupEMFPage,
  fillCEInputs,
  fillEMFInputs,
  runCEEstimate,
  runCEXlsxExport,
  runEMFCalculate,
  runEMFProfile,
  getResultText,
  getCostEstimateContingencyAmount,
  getCostEstimateGrandTotal,
  getEmfRmsMicroTesla,
} from './nextFeatures.helpers.js';

async function assertExportDownload(download, expectedName) {
  const downloadName = download.suggestedFilename();
  expect(downloadName).toBe(expectedName);
  expect(downloadName.toLowerCase().endsWith('.xlsx')).toBeTruthy();

  const tempPath = path.join(os.tmpdir(), `playwright-${Date.now()}-${downloadName}`);
  await download.saveAs(tempPath);
  const stats = await fs.stat(tempPath);
  expect(stats.size).toBeGreaterThan(0);
}

test.describe('next features integration: cost estimator scenarios and exports', () => {
  test('acceptance CE-02: empty or invalid fixture returns deterministic guidance', async ({ page }) => {
    await setupCEPage(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Project Cost Estimator' })).toBeVisible();

    await applyCostEstimatorFixture(page, COST_ESTIMATOR_FIXTURES.emptyInvalidInputScenario);
    await fillCEInputs(page, {
      contingencyPct: COST_ESTIMATOR_FIXTURES.emptyInvalidInputScenario.contingencyPct,
      laborCableRate: COST_ESTIMATOR_FIXTURES.emptyInvalidInputScenario.laborCableRate,
      laborTrayRate: COST_ESTIMATOR_FIXTURES.emptyInvalidInputScenario.laborTrayRate,
      laborConduitRate: COST_ESTIMATOR_FIXTURES.emptyInvalidInputScenario.laborConduitRate,
    });

    await runCEEstimate(page);

    const resultsText = await getResultText(page, '#results');
    expect(resultsText).toContain('No project data found');
  });

  test('acceptance CE-03: xlsx export is blocked until a scenario is generated', async ({ page }) => {
    await setupCEPage(page);

    await page.getByRole('button', { name: 'Export XLSX' }).click();

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toContain('No Data');
  });

  test('acceptance CE-04: baseline fixture renders deterministic summary totals', async ({ page }) => {
    await setupCEPage(page, COST_ESTIMATOR_FIXTURES.baselineProject);
    await fillCEInputs(page, {
      contingencyPct: String(COST_ESTIMATOR_CANONICAL_FIXTURE.expected.contingencyPct),
    });

    await runCEEstimate(page);

    const results = page.locator('#results');
    await expect(results.locator('h2')).toHaveText('Cost Summary');
    await expect(results.locator('table[aria-label="Cost summary by category"]')).toBeVisible();
    await expect(results.locator('table[aria-label="Cost summary by category"] tbody tr')).toHaveCount(3);
    await expect(results).toContainText('Cable');
    await expect(results).toContainText('Tray');
    await expect(results).toContainText('Conduit');
    await expect(results).toContainText(`Contingency (${COST_ESTIMATOR_CANONICAL_FIXTURE.expected.contingencyPct}%)`);
    await expect(results).toContainText('Grand Total (incl. contingency)');
    await expect(results.locator('summary')).toContainText('Line Item Detail (4 items)');
    await expect(results.locator('table[aria-label="Line item cost detail"] tbody tr')).toHaveCount(4);

    await expect(results).toContainText(`$${COST_ESTIMATOR_CANONICAL_FIXTURE.expected.cableSubtotal.toLocaleString()}`);
    await expect(results).toContainText(`$${COST_ESTIMATOR_CANONICAL_FIXTURE.expected.traySubtotal.toLocaleString()}`);
    await expect(results).toContainText(`$${COST_ESTIMATOR_CANONICAL_FIXTURE.expected.conduitSubtotal.toLocaleString()}`);
    await expect(results).toContainText(`$${COST_ESTIMATOR_CANONICAL_FIXTURE.expected.subtotal.toLocaleString()}`);
    await expect(results).toContainText(`$${COST_ESTIMATOR_CANONICAL_FIXTURE.expected.contingencyAmountRounded.toLocaleString()}`);
    await expect(results).toContainText(`$${COST_ESTIMATOR_CANONICAL_FIXTURE.expected.totalRounded.toLocaleString()}`);
  });

  test('acceptance CE-05: cost estimator xlsx export downloads expected file', async ({ page }) => {
    await setupCEPage(page, COST_ESTIMATOR_FIXTURES.baselineProject);
    await fillCEInputs(page, { contingencyPct: '10' });
    await runCEEstimate(page);

    const download = await runCEXlsxExport(page);

    await assertExportDownload(download, 'cost_estimate.xlsx');
  });

  test('acceptance CE-06: changing contingency and labor inputs predictably increases totals', async ({ page }) => {
    await setupCEPage(page, COST_ESTIMATOR_FIXTURES.baselineProject);

    await fillCEInputs(page, { contingencyPct: '10' });
    await runCEEstimate(page);
    const baseGrandTotal = await getCostEstimateGrandTotal(page);
    const baseContingencyAmount = await getCostEstimateContingencyAmount(page);

    await fillCEInputs(page, { contingencyPct: COST_ESTIMATOR_FIXTURES.highContingency.contingencyPct });
    await runCEEstimate(page);
    const highContingencyGrandTotal = await getCostEstimateGrandTotal(page);
    const highContingencyAmount = await getCostEstimateContingencyAmount(page);

    await fillCEInputs(page, {
      contingencyPct: COST_ESTIMATOR_FIXTURES.highContingency.contingencyPct,
      laborCableRate: COST_ESTIMATOR_FIXTURES.laborOverrideScenario.laborCableRate,
      laborTrayRate: COST_ESTIMATOR_FIXTURES.laborOverrideScenario.laborTrayRate,
      laborConduitRate: COST_ESTIMATOR_FIXTURES.laborOverrideScenario.laborConduitRate,
    });
    await runCEEstimate(page);
    const laborOverrideGrandTotal = await getCostEstimateGrandTotal(page);

    expect(baseGrandTotal).not.toBeNull();
    expect(baseContingencyAmount).not.toBeNull();
    expect(highContingencyGrandTotal).not.toBeNull();
    expect(highContingencyAmount).not.toBeNull();
    expect(laborOverrideGrandTotal).not.toBeNull();

    expect(highContingencyAmount).toBeGreaterThan(baseContingencyAmount);
    expect(highContingencyGrandTotal).toBeGreaterThan(baseGrandTotal);
    expect(laborOverrideGrandTotal).toBeGreaterThan(highContingencyGrandTotal);
  });

  test('integration: submittal preview scenario renders expected structured output', async ({ page }) => {
    await navigateForE2E(page, 'submittal.html');

    await page.fill('#sub-project-name', 'Integration Test Project');
    await page.fill('#sub-project-number', 'ITP-0426');
    await page.fill('#sub-engineer', 'A. Engineer, PE');
    await page.selectOption('#sub-nec-edition', '2023');
    await page.click('#preview-btn');

    const previewText = await getResultText(page, '#submittal-preview');
    expect(previewText).toContain('Integration Test Project');
    expect(previewText).toContain('ITP-0426');
    expect(previewText).toContain('NEC 2023');
  });

  test('integration: submittal xlsx export downloads expected file', async ({ page }) => {
    await navigateForE2E(page, 'submittal.html');

    await page.fill('#sub-project-name', 'Integration Test Project');
    await page.fill('#sub-project-number', 'ITP-0426');
    await page.fill('#sub-revision', '3');

    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-xlsx-btn');
    const download = await downloadPromise;

    await assertExportDownload(download, 'submittal_ITP-0426_Rev3.xlsx');
  });
});

test.describe('next features integration: emf deterministic outputs', () => {
  test('acceptance EMF-02: emf calculation returns deterministic numeric output', async ({ page }) => {
    await setupEMFPage(page);
    await fillEMFInputs(page, EMF_CANONICAL_FIXTURE.defaultGeometry);
    await runEMFCalculate(page);

    await expect(page.locator('tr:has(th:has-text("Frequency")) td')).toHaveText(
      `${EMF_CANONICAL_FIXTURE.defaultGeometry.frequency} Hz`,
    );

    const rmsCell = page.locator('tr:has(th:has-text("RMS Flux Density")) td strong');
    await expect(rmsCell).toHaveText(/^\d+\.\d{3}\sµT$/);
    const rms = await getEmfRmsMicroTesla(page);
    expect(rms).not.toBeNull();
    expect(Math.abs(rms - EMF_CANONICAL_FIXTURE.expected.normalBrmsMicroTesla)).toBeLessThanOrEqual(
      EMF_CANONICAL_FIXTURE.tolerances.brmsLowCurrentAbs,
    );

    const peakText = await page.locator('tr:has(th:has-text("Peak Flux Density")) td strong').innerText();
    expect(peakText).toMatch(/^\d+\.\d{3}\sµT$/);
    const peak = Number.parseFloat(peakText.replace(' µT', ''));
    expect(Math.abs(peak - EMF_CANONICAL_FIXTURE.expected.normalBpeakMicroTesla)).toBeLessThanOrEqual(
      EMF_CANONICAL_FIXTURE.tolerances.bpeakLowCurrentAbs,
    );

    const resultText = await getResultText(page, '#results');
    expect(resultText).toContain('ICNIRP 2010 Compliance');
    await expect(page.locator('#results .status-badge', { hasText: 'PASS' })).toHaveCount(2);
  });

  test('acceptance EMF-03: ICNIRP compliance shows PASS and FAIL outcomes for supported scenarios', async ({ page }) => {
    await setupEMFPage(page);

    await fillEMFInputs(page, { ...EMF_CANONICAL_FIXTURE.defaultGeometry });
    await runEMFCalculate(page);
    await expect(page.locator('#results .status-badge', { hasText: 'PASS' })).toHaveCount(2);
    await expect(page.locator('#results .status-badge', { hasText: 'FAIL' })).toHaveCount(0);

    await fillEMFInputs(page, {
      ...EMF_CANONICAL_FIXTURE.defaultGeometry,
      loadCurrent: EMF_CANONICAL_FIXTURE.boundaryCurrents.overGeneralPublicBoundary,
    });
    await runEMFCalculate(page);
    await expect(page.locator('#results .status-badge', { hasText: 'PASS' })).toHaveCount(1);
    await expect(page.locator('#results .status-badge', { hasText: 'FAIL' })).toHaveCount(1);

    await fillEMFInputs(page, {
      ...EMF_CANONICAL_FIXTURE.defaultGeometry,
      loadCurrent: EMF_CANONICAL_FIXTURE.boundaryCurrents.nearOccupationalBoundary,
    });
    await runEMFCalculate(page);
    await expect(page.locator('#results .status-badge', { hasText: 'FAIL' })).toHaveCount(2);
  });

  test('acceptance EMF-04: boundary and input errors use deterministic messaging and defaults', async ({ page }) => {
    await setupEMFPage(page);

    await fillEMFInputs(page, { loadCurrent: '0' });
    await runEMFCalculate(page);
    const inputErrorDialog = page.getByRole('dialog');
    await expect(inputErrorDialog).toContainText('Input Error');
    await expect(inputErrorDialog).toContainText('Load current must be greater than zero.');
    await inputErrorDialog.getByRole('button', { name: 'Close' }).click();

    await fillEMFInputs(page, { loadCurrent: '' });
    await runEMFCalculate(page);
    const missingValueDialog = page.getByRole('dialog');
    await expect(missingValueDialog).toContainText('Load current must be greater than zero.');
    await missingValueDialog.getByRole('button', { name: 'Close' }).click();

    await fillEMFInputs(page, {
      loadCurrent: '150',
      nCables: '-3',
      measDistance: '',
    });
    await runEMFCalculate(page);
    await expect(page.locator('#results .method-note')).toContainText('Configuration: 1 × 3-phase cable set(s)');
    await expect(page.locator('tr:has(th:has-text("Measurement Distance (from tray edge)")) td')).toContainText('36.0 in');
  });

  test('acceptance EMF-05: profile scenario renders deterministic container visibility and chart points', async ({ page }) => {
    await setupEMFPage(page);
    await fillEMFInputs(page);

    const chartContainer = page.locator('#profile-container');
    await expect(chartContainer).toBeHidden();
    await expect(chartContainer).toHaveAttribute('hidden', '');

    await runEMFProfile(page);

    await expect(chartContainer).toBeVisible();
    await expect(chartContainer).not.toHaveAttribute('hidden');
    await expect(chartContainer.locator('h2')).toHaveText('Field Profile vs. Distance from Tray Edge');
    await expect(page.locator('#emf-chart')).toBeVisible();

    const points = await page.locator('#emf-chart polyline').getAttribute('points');
    expect(points).toBeTruthy();
    expect(points.trim().split(/\s+/).length).toBe(121);
  });
});

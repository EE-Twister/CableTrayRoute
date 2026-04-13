import { test, expect } from '@playwright/test';
import {
  navigateForE2E,
  fillCostEstimatorForm,
  fillEmfForm,
  getResultText,
  getEmfRmsMicroTesla,
} from './nextFeatures.helpers.js';

test.describe('next features integration: cost estimator scenarios and exports', () => {
  test('integration: cost estimator scenario with empty project shows deterministic guidance', async ({ page }) => {
    await navigateForE2E(page, 'costestimate.html');
    await fillCostEstimatorForm(page, { contingencyPct: '12' });

    await page.click('#estimate-btn');

    const resultsText = await getResultText(page, '#results');
    expect(resultsText).toContain('No project data found');
  });

  test('integration: cost estimator xlsx export is blocked until a scenario is generated', async ({ page }) => {
    await navigateForE2E(page, 'costestimate.html');

    await page.click('#export-xlsx-btn');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toContain('No Data');
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
});

test.describe('next features integration: emf deterministic outputs', () => {
  test('integration: emf calculation returns deterministic numeric output and compliance table', async ({ page }) => {
    await navigateForE2E(page, 'emf.html');
    await fillEmfForm(page, {
      frequency: '60',
      loadCurrent: '150',
      nCables: '1',
      trayWidth: '12',
      cableOd: '1.0',
      measDistance: '36',
    });

    await page.click('#calc-btn');

    const rms = await getEmfRmsMicroTesla(page);
    expect(rms).not.toBeNull();
    expect(rms).toBeGreaterThan(0);
    expect(rms).toBeLessThan(5000);

    const resultText = await getResultText(page, '#results');
    expect(resultText).toContain('ICNIRP 2010 Compliance');
    expect(resultText).toMatch(/PASS|FAIL/);
  });

  test('integration: emf profile scenario shows chart and stable chart container state', async ({ page }) => {
    await navigateForE2E(page, 'emf.html');
    await fillEmfForm(page);

    await page.click('#profile-btn');

    const chartContainer = page.locator('#profile-container');
    await expect(chartContainer).toBeVisible();
    await expect(chartContainer).not.toHaveAttribute('hidden');

    const points = await page.locator('#emf-chart polyline').getAttribute('points');
    expect(points).toBeTruthy();
    expect(points.split(' ').length).toBeGreaterThan(100);
  });
});

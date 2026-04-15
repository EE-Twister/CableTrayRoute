import { test, expect } from '@playwright/test';
import {
  navigateForE2E,
  setupCEPage,
  setupEMFPage,
  assertCESmokeControls,
  assertEMFSmokeControls,
  runCEEstimate,
} from './nextFeatures.helpers.js';

test.describe('next features smoke: page boot and controls', () => {
  test('smoke: submittal package page loads and core controls are visible', async ({ page }) => {
    await navigateForE2E(page, 'submittal.html');
    await expect(page.locator('h1')).toContainText('Submittal Package');
    await expect(page.locator('#preview-btn')).toBeVisible();
    await expect(page.locator('#print-btn')).toBeVisible();
    await expect(page.locator('#export-xlsx-btn')).toBeVisible();
  });

  test('smoke: reliability page loads and run does not crash', async ({ page }) => {
    await navigateForE2E(page, 'reliability.html');
    await expect(page.locator('h1')).toContainText('Reliability');
    await expect(page.locator('#run-btn')).toBeVisible();
    await page.click('#run-btn');
    await expect(page.locator('body')).toBeVisible();
  });

  test('smoke CE-01: cost estimator page loads and estimate flow does not crash', async ({ page }) => {
    await setupCEPage(page);
    await assertCESmokeControls(page);
    await runCEEstimate(page);
    await expect(page.locator('#results')).toBeVisible();
  });

  test('smoke EMF-01: emf page loads and calculate/profile controls are available', async ({ page }) => {
    await setupEMFPage(page);
    await assertEMFSmokeControls(page);
  });

  test('smoke: project report page loads and generate does not crash', async ({ page }) => {
    await navigateForE2E(page, 'projectreport.html');
    await expect(page.locator('h1')).toContainText('Project Report');
    await expect(page.locator('#generate-btn')).toBeVisible();
    await page.click('#generate-btn');
    await expect(page.locator('body')).toBeVisible();
  });

  test('smoke: voltage drop page loads and run/export controls are present', async ({ page }) => {
    await navigateForE2E(page, 'voltagedropstudy.html');
    await expect(page.locator('h1')).toContainText('Voltage Drop');
    await expect(page.locator('#run-btn')).toBeVisible();
    await expect(page.locator('#export-btn')).toBeVisible();
    await expect(page.locator('#export-btn')).toBeDisabled();
  });
});

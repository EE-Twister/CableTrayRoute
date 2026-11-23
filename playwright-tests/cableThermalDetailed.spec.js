import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { startStaticServer } from './staticServer.helper.js';
import Papa from 'papaparse';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test.describe('Detailed cable thermal screen', () => {
  let site;
  test.beforeAll(async () => { site = await startStaticServer(root); });
  test.afterAll(async () => { await site?.close(); });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('base:projectMeta')) {
        localStorage.setItem('ctr_current_scenario_v1', 'base');
        localStorage.setItem('ctr_scenarios_v1', JSON.stringify(['base']));
        localStorage.setItem('CTR_PROJECT_V1', JSON.stringify({ name: 'Cable Thermal Detailed E2E' }));
        localStorage.setItem('base:projectMeta', JSON.stringify({ name: 'Cable Thermal Detailed E2E' }));
      }
    });
    await page.goto(site.url('iec60287.html?e2e=1&e2e_reset=1'));
    await page.waitForLoadState('networkidle');
    await page.locator('#cable-thermal-detailed-form').waitFor();
  });

  test('published both-end and single-point profiles calculate with source evidence', async ({ page }, testInfo) => {
    const profile = page.locator('#thermal-profile');
    await expect(profile).toContainText('both-end bonding');
    await expect(page.locator('#thermal-profile-source a')).toHaveAttribute('href', /https:\/\/www\.cableizer\.com\//);
    await page.getByRole('button', { name: 'Run thermal screen' }).click();
    await expect(page.locator('#thermal-results')).toContainText('Limiting current: 821.77');
    await expect(page.locator('#thermal-results')).toContainText('Published reference comparison: 821.78');
    await page.locator('#cable-thermal-detailed').screenshot({ path: testInfo.outputPath('cable-thermal-reference.png') });
    await profile.selectOption('tb880-case0-single-point');
    await page.getByRole('button', { name: 'Run thermal screen' }).click();
    await expect(page.locator('#thermal-results')).toContainText('Limiting current: 886.17');
    await expect(page.locator('#thermal-results')).toContainText('Published reference comparison: 886.18');
    await expect(page.locator('#thermal-results')).toContainText('single-point');
  });

  test('formation or spacing edits mark the saved result stale until rerun', async ({ page }) => {
    await page.getByRole('button', { name: 'Run thermal screen' }).click();
    await expect(page.locator('#thermal-results')).toBeVisible();
    await page.locator('[name="formation"]').selectOption('flat-spaced');
    await page.locator('[name="spacingMm"]').fill('120');
    await expect(page.locator('#thermal-results')).toContainText('stale');
    await expect(page.locator('#thermal-export-csv-btn')).toBeDisabled();
    await page.getByRole('button', { name: 'Run thermal screen' }).click();
    await expect(page.locator('#thermal-results')).toBeVisible();
    await expect(page.locator('#thermal-export-csv-btn')).toBeEnabled();
  });

  test('isolated and trefoil-spaced formations run, and customized inputs restore', async ({ page }) => {
    await page.locator('#thermal-profile').selectOption('tb880-case0-single-point');
    await page.locator('[name="formation"]').selectOption('isolated');
    await page.getByRole('button', { name: 'Run thermal screen' }).click();
    await expect(page.locator('#thermal-results')).toContainText('Limiting current');
    await page.locator('[name="formation"]').selectOption('trefoil-spaced');
    await page.locator('[name="spacingMm"]').fill('110');
    await page.getByRole('button', { name: 'Run thermal screen' }).click();
    await page.reload();
    await page.locator('#cable-thermal-detailed-form').waitFor();
    await expect(page.locator('#thermal-profile')).toHaveValue('tb880-case0-single-point');
    await expect(page.locator('[name="formation"]')).toHaveValue('trefoil-spaced');
    await expect(page.locator('[name="spacingMm"]')).toHaveValue('110');
  });

  test('scenario change blocks export of the previous scenario result', async ({ page }) => {
    await page.getByRole('button', { name: 'Run thermal screen' }).click();
    await expect(page.locator('#thermal-export-csv-btn')).toBeEnabled();
    await page.evaluate(() => {
      window.dataStore.cloneScenario('thermal-alt', 'base');
      window.dataStore.switchScenario('thermal-alt');
    });
    await expect(page.locator('#thermal-export-csv-btn')).toBeDisabled();
    await expect(page.locator('#thermal-results')).toContainText('historical');
    await page.getByRole('button', { name: 'Run thermal screen' }).click();
    await expect(page.locator('#thermal-export-csv-btn')).toBeEnabled();
  });

  test('adding or removing a layer marks the result stale and blocks export', async ({ page }) => {
    await page.getByRole('button', { name: 'Run thermal screen' }).click();
    await expect(page.locator('#thermal-export-csv-btn')).toBeEnabled();
    await page.getByRole('button', { name: 'Add insulation layer' }).click();
    await expect(page.locator('#thermal-results')).toContainText('stale');
    await expect(page.locator('#thermal-export-csv-btn')).toBeDisabled();
    await page.getByRole('button', { name: /Remove layer 4/ }).click();
    await expect(page.locator('#thermal-export-csv-btn')).toBeDisabled();
  });

  test('legacy IEC reruns do not change detailed thermal freshness', async ({ page }) => {
    await page.getByRole('button', { name: 'Run thermal screen' }).click();
    await expect(page.locator('#thermal-export-csv-btn')).toBeEnabled();
    await page.locator('#iec60287-form button[type="submit"]').click();
    await expect(page.locator('#thermal-export-csv-btn')).toBeEnabled();
    await page.locator('[name="spacingMm"]').fill('110');
    await expect(page.locator('#thermal-export-csv-btn')).toBeDisabled();
    await page.locator('#iec60287-form button[type="submit"]').click();
    await expect(page.locator('#thermal-export-csv-btn')).toBeDisabled();
    await expect(page.locator('#thermal-results')).toContainText('stale');
  });

  test('invalid required input clears output and blocks export', async ({ page }) => {
    await page.getByRole('button', { name: 'Run thermal screen' }).click();
    await page.locator('[name="acResistanceOhmPerKm"]').fill('');
    await page.getByRole('button', { name: 'Run thermal screen' }).click();
    await expect(page.locator('#thermal-input-error')).toContainText('acResistanceOhmPerKm');
    await expect(page.locator('#thermal-results')).toBeHidden();
    await expect(page.locator('#thermal-export-csv-btn')).toBeDisabled();
  });

  test('named project result restores as historical stale and CSV carries provenance', async ({ page }) => {
    await page.getByRole('button', { name: 'Run thermal screen' }).click();
    await page.reload();
    await page.locator('#cable-thermal-detailed-form').waitFor();
    await expect(page.locator('#thermal-results')).toContainText('Historical result shown as stale');
    await expect(page.locator('#thermal-export-csv-btn')).toBeDisabled();

    await page.getByRole('button', { name: 'Run thermal screen' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const csv = await fs.readFile(await (await downloadPromise).path(), 'utf8');
    expect(csv).toContain('normalizedInputJson');
    expect(csv).toContain('sourceProfileId');
    expect(csv).toContain('CIGRE_TB_880_Case_0-1');
    expect(csv).toContain('temperaturesJson');
    expect(csv).toContain('thermalResistancesJson');
    expect(csv).toContain('isReferenceProfile');
    const parsed = Papa.parse(csv.trim(), { skipEmptyLines: true }).data;
    const rows = new Map(parsed.map(([key, value]) => [key, value]));
    expect(parsed.length).toBe(new Set(parsed.map(([key]) => key)).size);
    expect(rows.get('resultValidity')).toBe('evaluated');
    expect(rows.get('freshness')).toBe('current');
    expect(rows.get('calculationVersion')).toBe('cable-thermal-detailed-calculation-v1');
    expect(Number(rows.get('limitingCurrentA'))).toBeCloseTo(821.7741475316353, 8);
    const temperatures = JSON.parse(rows.get('temperaturesJson'));
    temperatures.conductorCByPhase.forEach(temperature => expect(temperature).toBeCloseTo(90, 5));
    expect(Number.isNaN(Date.parse(rows.get('calculatedAt')))).toBe(false);
    expect(rows.get('sourceFingerprint')).toBeTruthy();
    const provenance = JSON.parse(rows.get('provenance'));
    expect(provenance.scenario).toBeTruthy();
    expect(provenance.projectIdentity).toEqual(expect.any(Object));
  });
});

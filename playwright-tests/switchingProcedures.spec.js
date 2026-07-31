import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = file => 'file://' + path.join(__dirname, '..', file);

test('Switching Procedure Planner builds a checked read-only procedure from One-Line devices', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('base:oneLineDiagram', JSON.stringify({
      activeSheet: 0,
      sheets: [{ name: 'Service', components: [{ id: 'CB-1', label: 'Main Breaker', subtype: 'breaker' }] }]
    }));
  });
  await page.goto(pageUrl('switchingprocedures.html'));
  await expect(page.getByRole('heading', { name: 'Switching Procedure Planner' })).toBeVisible();
  await page.getByRole('button', { name: 'New Procedure' }).click();
  await page.locator('#procedure-title').fill('Isolate main feeder');
  await page.locator('#procedure-status').selectOption('reviewed');
  await page.locator('#procedure-reviewed-by').fill('Engineer A');
  await page.locator('#step-device').selectOption('CB-1');
  await expect(page.locator('#step-device')).toHaveValue('CB-1');
  await page.locator('#step-action').selectOption('open');
  await expect(page.locator('#step-device')).toHaveValue('CB-1');
  await page.getByRole('button', { name: 'Add Step' }).click();
  const firstStep = await page.evaluate(() => JSON.parse(localStorage.getItem('base:switchingProcedures') || '[]')[0]?.steps?.[0]);
  expect(firstStep.deviceId).toBe('CB-1');
  await page.locator('#step-type').selectOption('verify');
  await page.getByRole('button', { name: 'Add Step' }).click();
  await page.locator('#step-type').selectOption('ground');
  await page.getByRole('button', { name: 'Add Step' }).click();
  await expect(page.locator('#procedure-validation')).toContainText('Planning checks passed');
  await expect(page.locator('#procedure-steps-body tr')).toHaveCount(3);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('base:switchingProcedures') || '[]'));
  expect(stored[0].title).toBe('Isolate main feeder');
  expect(stored[0].steps[0].deviceId).toBe('CB-1');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('Isolate-main-feeder.csv');
});

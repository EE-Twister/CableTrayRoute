import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function pageUrl(file) {
  return 'file://' + path.join(root, file);
}

test('engineers can open the graphical protective-device curve review workspace', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('onelineTourDone', 'true');
  });
  await page.goto(pageUrl('tcc.html?e2e=1'));
  await expect(page.locator('#device-modal-btn')).toBeVisible();
  await page.locator('#device-modal-btn').click();
  await expect(page.locator('.device-filter-btn').filter({ hasText: 'Screening Only' })).toBeVisible();
  await page.locator('.device-filter-btn').filter({ hasText: 'Screening Only' }).click();
  await expect(page.locator('.device-model-label').first()).toBeVisible();
  await page.locator('.device-model-label').first().click({ force: true });
  await expect(page.getByRole('button', { name: 'Open Curve Review' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Curve Review' }).click();

  await expect(page.locator('.protective-review-shell')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Curve comparison' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Promotion gate' })).toBeVisible();
  await expect(page.getByText('No source points entered.')).toBeVisible();

  await page.getByRole('button', { name: 'Add source point' }).click();
  await page.getByRole('spinbutton', { name: 'Manufacturer source points current point 1' }).fill('100');
  await page.getByRole('spinbutton', { name: 'Manufacturer source points time point 1' }).fill('10');
  await expect(page.getByRole('spinbutton', { name: 'Manufacturer source points time point 1' })).toHaveValue('10');
  await page.locator('.protective-review-paste-input').fill('100,10\n1000,1\n10000,0.1');
  await page.getByRole('button', { name: 'Load pasted source points' }).click();
  await expect(page.getByText('3 of 3 spot checks')).toBeVisible();
  await page.getByRole('button', { name: 'Save Review' }).click();
  await expect(page.locator('.protective-review-shell')).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => Object.values(localStorage).some(value => String(value).includes('protectiveDeviceReviews')))).toBe(true);
});

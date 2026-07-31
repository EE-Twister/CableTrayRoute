import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = file => 'file://' + path.join(__dirname, '..', file);

test('Cyber Compliance saves a project-backed evidence assessment', async ({ page }) => {
  await page.goto(pageUrl('cybercompliance.html?e2e=1&e2e_reset=1'));
  await page.getByRole('button', { name: 'Add asset' }).click();
  const row = page.locator('#cyber-assets tbody tr');
  await row.locator('[data-key="id"]').fill('RTU-01');
  await row.locator('[data-key="cyberAssetClass"]').fill('RTU');
  await row.locator('[data-key="zone"]').fill('ESP-01');
  await row.locator('[data-key="firmwareVersion"]').fill('4.2.1');
  await row.locator('[data-key="protocols"]').fill('DNP3/TLS');
  await row.locator('[data-key="cipEvidence"]').fill('CIP inventory record');
  await row.locator('[data-key="remoteEnabled"]').check();
  await row.locator('[data-key="remoteMfa"]').check();
  await row.locator('[data-key="remoteLogging"]').check();
  await row.locator('[data-key="approvedPath"]').check();
  await row.locator('[data-key="passwordPolicy"]').check();
  await row.locator('[data-key="patchCurrent"]').check();
  await page.getByRole('button', { name: 'Run assessment' }).click();
  await expect(page.locator('#cyber-summary')).toContainText('1 assets reviewed');
  await expect(page.locator('#cyber-results')).toContainText('IEC 62443-3-3 SR 3');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('base:studyResults') || '{}'));
  expect(saved.cyberCompliance.summary.gap).toBe(0);
});

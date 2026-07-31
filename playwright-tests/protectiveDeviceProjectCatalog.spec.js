import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

test('TCC selects a calculation-ready device from the project manufacturer catalog', async ({ page }) => {
  await page.goto(pageUrl('tcc.html?e2e=1&e2e_reset=1'));
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    window.projectStorage.writeScenarioValue('trayHardwareCatalogCustomProducts', [{
      id: 'ACME-100', manufacturer: 'Acme Power', catalogNumber: 'ACME-100-3P',
      category: 'protective_device', subcategory: 'breaker', description: 'Acme 100 A 3-pole breaker',
      unit: 'EA', evidenceStatus: 'source_verified', source: 'Acme manufacturer curve sheet',
      lastVerified: '2026-07-31', datasheetUrl: 'https://example.test/acme-100.pdf',
      protective_device_type: 'breaker', protective_device_voltage_class: 'LV',
      protective_device_trip_unit_model: 'TX-100', protective_device_interrupting_ratings: '480:35;600:25',
      protective_device_curve: '100:100;500:1;1000:0.1', protective_device_pickup: 100,
      protective_device_time: 0.3, protective_device_instantaneous: 500,
      protective_device_curve_document: 'Acme TCC sheet', protective_device_curve_revision: 'Rev 3',
      protective_device_curve_id: 'Figure 7', protective_device_curve_extraction_method: 'manufacturer CSV',
      protective_device_curve_reviewer: 'Project EE', protective_device_library_status: 'calculation_ready'
    }]);
  });

  await page.goto(pageUrl('tcc.html?e2e=1'));
  await page.waitForLoadState('networkidle');
  await page.click('#device-modal-btn');
  await expect(page.locator('.device-library-readiness')).toContainText('1 calculation-ready');
  await page.getByRole('button', { name: /Acme Power/ }).click();
  await expect(page.locator('.device-model-label')).toContainText('Acme 100 A 3-pole breaker');
  await expect(page.locator('.device-model-badge')).toContainText('Ready');
});

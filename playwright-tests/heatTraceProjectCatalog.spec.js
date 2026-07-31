import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

test('heat-trace sizing includes a valid approved project catalog row', async ({ page }) => {
  await page.goto(pageUrl('heattracesizing.html'));
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('base:trayHardwareCatalogCustomProducts', JSON.stringify([{
      id: 'HT-PROJECT-5',
      manufacturer: 'Project Heat Cable',
      catalogNumber: 'PHC-5-240',
      category: 'heat_trace',
      description: 'Project-approved 5 W/ft heat trace cable',
      unit: 'FT',
      heat_trace_type: 'selfRegulating',
      heat_trace_voltages: '120;240',
      heat_trace_nominal_w_per_ft: 5,
      heat_trace_max_circuit_lengths: '120:300;240:500',
      heat_trace_max_exposure_temp_c: 65,
      heat_trace_startup_current_multiplier: 1.7,
      heat_trace_family: 'PHC',
      approved: true,
      approval: { status: 'approved', authority: 'Project EE' },
      source: 'Approved manufacturer list',
      lastVerified: '2026-07-31',
    }]));
  });

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('#heattrace-catalog-table')).toContainText('HT-PROJECT-5');
  await expect(page.locator('#heattrace-catalog-table')).toContainText('Project Heat Cable');
  await expect(page.locator('#heattrace-catalog-table')).toContainText('approved');
});

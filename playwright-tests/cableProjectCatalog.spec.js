import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

async function openToolbarMenu(page, label) {
  const menu = page.locator('details.toolbar-menu').filter({ has: page.locator(`summary:has-text("${label}")`) });
  if (!(await menu.evaluate(element => element.open))) await menu.locator('summary').click();
}

test('Cable Library loads a source-verified cable construction from the project catalog', async ({ page }) => {
  await page.goto(pageUrl('cableschedule.html?e2e=1&e2e_reset=1'));
  await page.waitForFunction('window.__CableScheduleInitOK === true');
  await page.evaluate(() => {
    window.projectStorage.writeScenarioValue('trayHardwareCatalogCustomProducts', [{
      id: 'CU-THHN-12', manufacturer: 'Southwire', catalogNumber: 'SPEC10000', category: 'cable',
      description: 'Copper 12 AWG THHN/THWN-2 building wire, 600 V', unit: 'FT',
      evidenceStatus: 'source_verified', source: 'Southwire manufacturer product page', lastVerified: '2026-07-31',
      datasheetUrl: 'https://www.southwire.com/wire-cable/building-wire/simpull-sup-sup-thhn-thwn-2-copper/p/SPEC10000',
      cable_type: 'Power', cable_conductors: 1, cable_conductor_size: '#12 AWG',
      cable_conductor_material: 'Copper', cable_insulation_type: 'THHN/THWN-2', cable_voltage_rating: 600,
    }]);
  });

  await openToolbarMenu(page, 'Templates');
  await page.locator('#cable-library-btn').click();
  await page.locator('#cable-library-project-catalog-btn').click();
  const notice = page.locator('.component-modal').filter({ has: page.getByRole('heading', { name: 'Project Catalog' }) });
  await expect(notice).toContainText('1 governed cable type added');
  await notice.getByRole('button', { name: 'Close', exact: true }).click();
  await page.selectOption('#cable-library-evidence-filter', 'source_verified');
  await expect(page.locator('#cable-library-list')).toContainText('Southwire SPEC10000 #12 AWG');
  await expect(page.locator('#cable-library-list')).toContainText('Source verified');
});

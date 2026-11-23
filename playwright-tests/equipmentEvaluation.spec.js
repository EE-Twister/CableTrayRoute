import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => `file://${path.join(root, file)}`;

test.describe('Equipment Evaluation lifecycle', () => {
  test('exports current lifecycle metadata and invalidates on one-line changes', async ({ page }) => {
    await page.goto(pageUrl('equipmentevaluation.html?e2e=1'));
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('base:oneLineDiagram', JSON.stringify({
        activeSheet: 0,
        sheets: [{
          components: [{
            id: 'breaker-1',
            type: 'breaker',
            props: { name: 'Main Breaker', interruptRatingKA: 65 },
          }],
        }],
      }));
    });
    await page.reload();

    await page.click('#equip-run-btn');
    await expect(page.locator('#equip-table')).toBeVisible();
    await expect(page.locator('#equip-export-csv-btn')).toBeEnabled();

    const downloadPromise = page.waitForEvent('download');
    await page.click('#equip-export-csv-btn');
    const download = await downloadPromise;
    const downloadPath = await download.path();
    const csv = await fs.readFile(downloadPath, 'utf8');
    expect(csv).toContain('"Lifecycle Field","Value"');
    expect(csv).toContain('"freshness","current"');
    expect(csv).toContain('"resultEligibility","eligible"');

    await page.evaluate(() => {
      const oneLine = window.dataStore.getOneLine();
      oneLine.sheets[0].components[0].props.interruptRatingKA = 50;
      window.dataStore.setOneLine(oneLine);
    });
    await expect(page.locator('#equip-table')).toBeHidden();
    await expect(page.locator('#equip-empty-msg')).toContainText('inputs changed');
    await expect(page.locator('#equip-export-csv-btn')).toBeDisabled();
  });
});

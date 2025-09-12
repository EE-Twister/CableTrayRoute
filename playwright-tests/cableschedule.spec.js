const { test, expect } = require('@playwright/test');
const path = require('path');
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

test.describe('cableschedule buttons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('cableschedule.html?e2e=1&e2e_reset=1'));
    await page.waitForFunction('window.__CableScheduleInitOK === true');
  });

  test('save and load schedule', async ({ page }) => {
    await page.click('#add-row-btn');
    const tagInput = page.locator('#cableScheduleTable tbody tr:first-child input[name="tag"]');
    await tagInput.fill('C1');
    await page.click('#save-schedule-btn');

    await page.goto(pageUrl('cableschedule.html?e2e=1'));
    await page.waitForFunction('window.__CableScheduleInitOK === true');
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(1);
    await expect(page.locator('#cableScheduleTable tbody tr:first-child input[name="tag"]')).toHaveValue('C1');

    await page.evaluate(() => { document.querySelector('#cableScheduleTable tbody').innerHTML = ''; });
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(0);

    await page.click('#load-schedule-btn');
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(1);
    await expect(page.locator('#cableScheduleTable tbody tr:first-child input[name="tag"]')).toHaveValue('C1');
  });

  test('export and import buttons trigger dialogs', async ({ page }) => {
    await page.click('#add-row-btn');
    await page.locator('#cableScheduleTable tbody tr:first-child input[name="tag"]').fill('C1');
    await page.selectOption('#cableScheduleTable tbody tr:first-child select[name="conductor_size"]', { label: '#14 AWG' });
    await page.locator('#cableScheduleTable tbody tr:first-child input[name="length"]').fill('10');
    await page.evaluate(() => {
      const sel = document.querySelector('#cableScheduleTable tbody tr:first-child select[name="raceway_ids"]');
      const opt = document.createElement('option');
      opt.value = 'R1';
      opt.textContent = 'R1';
      sel.appendChild(opt);
      opt.selected = true;
    });
    await page.click('#save-schedule-btn');

    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-xlsx-btn');
    await downloadPromise;

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#import-xlsx-btn');
    await fileChooserPromise;
  });

  test('delete all clears table', async ({ page }) => {
    await page.click('#add-row-btn');
    await page.locator('#cableScheduleTable tbody tr:first-child input[name="tag"]').fill('C1');
    await page.click('#save-schedule-btn');
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(1);

    await page.click('#delete-all-btn');
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(0);

    await page.goto(pageUrl('cableschedule.html?e2e=1'));
    await page.waitForFunction('window.__CableScheduleInitOK === true');
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(0);
  });

  test('load sample cables populates table', async ({ page }) => {
    const sample = [{ tag: 'S1' }, { tag: 'S2' }];
    await page.route('**/examples/sampleCables.json', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sample) })
    );

    await page.click('#load-sample-cables-btn');
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(sample.length);
    await expect(page.locator('#cableScheduleTable tbody input[name="tag"]').first()).toHaveValue('S1');
  });

  test('clear filters shows all rows', async ({ page }) => {
    await page.click('#add-row-btn');
    await page.locator('#cableScheduleTable tbody tr:first-child input[name="tag"]').fill('A1');
    await page.click('#add-row-btn');
    await page.locator('#cableScheduleTable tbody tr:nth-child(2) input[name="tag"]').fill('B2');
    await page.click('#save-schedule-btn');

    await page.evaluate(() => {
      const table = window.cableScheduleTable;
      table.filters[0] = 'A1';
      table.applyFilters();
    });

    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(2);
    await expect(page.locator('#cableScheduleTable tbody tr:visible')).toHaveCount(1);

    await page.click('#clear-filters-btn');
    await expect(page.locator('#cableScheduleTable tbody tr:visible')).toHaveCount(2);
  });
});


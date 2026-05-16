import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

async function seedRaceway(page, trayId = 'R1') {
  await page.evaluate(id => {
    window.projectStorage.writeScenarioValue('traySchedule', [{ tray_id: id }]);
  }, trayId);
}

async function addCable(page, {
  tag = 'C1',
  fromTag = 'MCC-1',
  toTag = 'LOAD-1',
  conductorSize = '#14 AWG',
  length = '10',
  raceway = 'R1'
} = {}) {
  await seedRaceway(page, raceway);
  await page.click('#add-row-btn');
  await expect(page.locator('#cable-editor-modal[aria-hidden="false"]')).toBeVisible();
  await page.fill('#cable-editor-tag', tag);
  await page.fill('#cable-editor-from_tag', fromTag);
  await page.fill('#cable-editor-to_tag', toTag);
  await page.selectOption('#cable-editor-conductor_size', { label: conductorSize });
  await page.fill('#cable-editor-length', length);
  await page.selectOption('#cable-editor-raceway_ids', raceway);
  await page.click('#cable-editor-save');
  await expect(page.locator('#cable-editor-modal[aria-hidden="false"]')).toHaveCount(0);
}

async function openToolbarMenu(page, label) {
  const menu = page.locator('details.toolbar-menu').filter({ has: page.locator(`summary:has-text("${label}")`) });
  if (!(await menu.evaluate(el => el.open))) {
    await menu.locator('summary').click();
  }
}

function writeCableImportFixture(filePath) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([
    {
      'Cable Tag': 'IMP-001',
      From: 'MCC-1',
      To: 'PMP-1',
      Tray: 'R1',
      Size: '#14 AWG',
      'Run Length': 25
    }
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Cables');
  XLSX.writeFile(workbook, filePath);
}

test.describe('cableschedule buttons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('cableschedule.html?e2e=1&e2e_reset=1'));
    await page.waitForFunction('window.__CableScheduleInitOK === true');
  });

  test('save and load schedule', async ({ page }) => {
    await addCable(page, { tag: 'C1' });
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
    await addCable(page, { tag: 'C1' });
    await page.click('#save-schedule-btn');

    await openToolbarMenu(page, 'Import / Export');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#export-xlsx-btn');
    await downloadPromise;

    await openToolbarMenu(page, 'Import / Export');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#import-xlsx-btn');
    await fileChooserPromise;
  });

  test('delete all clears table', async ({ page }) => {
    await addCable(page, { tag: 'C1' });
    await page.click('#save-schedule-btn');
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(1);

    await openToolbarMenu(page, 'More');
    await page.click('#delete-all-btn');
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.cableScheduleTable.getData().length)).toBe(0);
  });

  test('load sample cables populates table', async ({ page }) => {
    await page.click('#load-sample-cables-btn');
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(3);
    await expect(page.locator('#cableScheduleTable tbody input[name="tag"]').first()).toHaveValue('CBL-001');
  });

  test('clear filters shows all rows', async ({ page }) => {
    await addCable(page, { tag: 'A1' });
    await addCable(page, { tag: 'B2' });
    await page.click('#save-schedule-btn');

    await page.evaluate(() => {
      const table = window.cableScheduleTable;
      table.filters[0] = 'A1';
      table.applyFilters();
    });

    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(2);
    await expect(page.locator('#cableScheduleTable tbody tr:visible')).toHaveCount(1);

    await openToolbarMenu(page, 'View');
    await page.click('#clear-filters-btn');
    await expect(page.locator('#cableScheduleTable tbody tr:visible')).toHaveCount(2);
  });

  test('quick add creates multiple routing-ready cables with generated tags', async ({ page }) => {
    await seedRaceway(page, 'R1');
    await page.click('#quick-add-cables-btn');
    await expect(page.locator('.quick-add-table tbody tr')).toHaveCount(5);

    const first = page.locator('.quick-add-table tbody tr').nth(0);
    const second = page.locator('.quick-add-table tbody tr').nth(1);
    await first.locator('[name="from_tag"]').fill('MCC-1');
    await first.locator('[name="to_tag"]').fill('PMP-1');
    await first.locator('[name="cable_type"]').selectOption('Power');
    await first.locator('[name="conductor_size"]').selectOption({ label: '#14 AWG' });
    await first.locator('[name="length"]').fill('25');
    await first.locator('[name="raceway_ids"]').selectOption('R1');
    await second.locator('[name="from_tag"]').fill('MCC-1');
    await second.locator('[name="to_tag"]').fill('PMP-2');
    await second.locator('[name="cable_type"]').selectOption('Control');
    await second.locator('[name="conductor_size"]').selectOption({ label: '#14 AWG' });
    await second.locator('[name="length"]').fill('30');
    await second.locator('[name="raceway_ids"]').selectOption('R1');
    await page.getByRole('button', { name: 'Add Cables' }).click();

    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(2);
    await expect(page.locator('#cableScheduleTable tbody tr:first-child input[name="tag"]')).toHaveValue('CBL-001');
    await expect(page.locator('[data-metric="ready"]')).toHaveText('2');
  });

  test('tag settings control the next Add Cable tag', async ({ page }) => {
    await page.click('#open-tag-settings-btn');
    await page.fill('#tag-prefix-input', 'PX-');
    await page.fill('#tag-next-input', '7');
    await page.fill('#tag-padding-input', '2');
    await page.click('#save-tag-settings-btn');
    await page.locator('.component-modal').getByRole('button', { name: 'Close', exact: true }).click();

    await page.click('#add-row-btn');
    await expect(page.locator('#cable-editor-modal[aria-hidden="false"]')).toBeVisible();
    await expect(page.locator('#cable-editor-tag')).toHaveValue('PX-07');
    await page.click('#cable-editor-cancel');
  });

  test('batch edit applies common values to selected cables', async ({ page }) => {
    await addCable(page, { tag: 'B1', raceway: 'R1' });
    await addCable(page, { tag: 'B2', raceway: 'R2' });
    await page.check('#cableScheduleTable-select-all');

    await page.click('#open-batch-edit-btn');
    await page.check('#batch-set-cable-type');
    await page.selectOption('#batch-cable-type-input', 'Data');
    await page.click('#apply-batch-edit-btn');

    await expect(page.locator('#cableScheduleTable tbody tr select[name="cable_type"]').first()).toHaveValue('Data');
    await expect(page.locator('#cableScheduleTable tbody tr select[name="cable_type"]').nth(1)).toHaveValue('Data');
  });

  test('import mapping wizard imports non-matching spreadsheet headers', async ({ page }, testInfo) => {
    await seedRaceway(page, 'R1');
    const filePath = testInfo.outputPath('mapped-cables.xlsx');
    writeCableImportFixture(filePath);

    await page.setInputFiles('#import-xlsx-input', filePath);
    await expect(page.getByRole('heading', { name: 'Map Cable Import' })).toBeVisible();
    await page.getByRole('button', { name: 'Import Rows' }).click();

    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(1);
    await expect(page.locator('#cableScheduleTable tbody tr:first-child input[name="tag"]')).toHaveValue('IMP-001');
    await expect(page.locator('[data-metric="ready"]')).toHaveText('1');
  });

  test('report options expose professional export and print modes', async ({ page }) => {
    await addCable(page, { tag: 'RPT-1' });
    await openToolbarMenu(page, 'Import / Export');
    await page.click('#open-report-options-btn');

    await expect(page.getByRole('heading', { name: 'Cable Report Options' })).toBeVisible();
    await expect(page.locator('#cable-report-mode')).toBeVisible();
    await page.selectOption('#cable-report-mode', 'missing-data');
    await expect(page.locator('#cable-report-summary')).toContainText('0 rows');
  });
});


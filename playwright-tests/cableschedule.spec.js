import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { createApp } from '../server.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
let server;
let baseUrl;
let dataDir;

test.use({ serviceWorkers: 'block' });

test.beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-cableschedule-'));
  const app = await createApp({ dataDir, staticRoot: root, enforceHttps: false, rateLimit: { windowMs: 60_000, max: 500 } });
  server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (dataDir) await fs.rm(dataDir, { recursive: true, force: true });
});

const pageUrl = file => new URL(file, `${baseUrl}/`).toString();

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
  await page.selectOption('#cable-editor-cable_type', 'Control');
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

async function rowWithInputValue(page, name, value) {
  const rowId = await page.locator('#cableScheduleTable tbody tr').evaluateAll((rows, args) => {
    const row = rows.find(candidate => candidate.querySelector(`input[name="${args.name}"]`)?.value === args.value);
    return row?.dataset.rowId || null;
  }, { name, value });
  expect(rowId, `expected a row with ${name}=${value}`).toBeTruthy();
  return page.locator(`#cableScheduleTable tbody tr[data-row-id="${rowId}"]`);
}

async function readDownloadBuffer(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function writeCableImportFixture(filePath) {
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
  const data = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  await fs.writeFile(filePath, data);
}

test.describe('cableschedule buttons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('cableschedule.html?e2e=1&e2e_reset=1'));
    await page.waitForFunction(() => window.__CableScheduleInitOK === true);
  });

  test('save and load schedule', async ({ page }) => {
    await addCable(page, { tag: 'C1' });
    await page.click('#save-schedule-btn');

    await page.goto(pageUrl('cableschedule.html?e2e=1'));
    await page.waitForFunction(() => window.__CableScheduleInitOK === true);
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(1);
    await expect(page.locator('#cableScheduleTable tbody tr:first-child input[name="tag"]')).toHaveValue('C1');

    await page.evaluate(() => { document.querySelector('#cableScheduleTable tbody').innerHTML = ''; });
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(0);

    await openToolbarMenu(page, 'More');
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
    await readDownloadBuffer(await downloadPromise);

    await openToolbarMenu(page, 'Import / Export');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#import-xlsx-btn');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([]);
  });

  test('delete all clears table', async ({ page }) => {
    await addCable(page, { tag: 'C1' });
    await page.click('#save-schedule-btn');
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(1);

    await openToolbarMenu(page, 'More');
    await page.click('#delete-all-btn');
    await expect(page.getByRole('dialog', { name: 'Review Cable Deletion' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.cableScheduleTable.getData().length)).toBe(0);
  });

  test('load sample cables populates table', async ({ page }) => {
    await openToolbarMenu(page, 'More');
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
    // Quick Add is the secondary option of the split Add Cable button.
    await openToolbarMenu(page, 'Add options');
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
    await openToolbarMenu(page, 'More');
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

  test('guided core sample shows three editable cable rows in the initial desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(pageUrl('samplegallery.html?e2e=1&e2e_reset=1'));
    const sampleCard = page.locator('[data-sample-id="project-workflow-core"]');
    const freshCopy = sampleCard.getByRole('button', { name: /Create a fresh copy/i });
    if (await freshCopy.isVisible()) {
      await freshCopy.click();
    } else {
      await sampleCard.getByRole('button', { name: /Start guided Project Workflow Core/i }).click();
    }
    await expect(page.locator('#checklist-panel')).toContainText('Guided Workflow: Project Workflow Core');
    const cableHref = await page.locator('#checklist-steps .checklist-step__link[href*="cableschedule.html"]').first().getAttribute('href');
    await page.goto(new URL(cableHref, page.url()).toString());
    await expect(page.locator('#routing-readiness-panel [data-metric="total"]')).toHaveText('14');
    const rows = page.locator('#cableScheduleTable tbody tr');
    await expect(rows).toHaveCount(14);
    const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    const boxes = await rows.evaluateAll(elements => elements.map(row => {
      const box = row.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, editable: Boolean(row.querySelector('input, select')) };
    }));
    const firstRows = boxes.slice(0, 3);
    expect(firstRows).toHaveLength(3);
    expect(firstRows.every(row => row.editable && row.top >= 0 && row.bottom <= viewport.height)).toBe(true);
  });

  test('preserves imported cable classifications and hidden fields after an unrelated edit', async ({ page }) => {
    await page.evaluate(() => {
      const rows = [
        { id: 'stable-vfd', tag: 'VFD-102', from_tag: 'MCC-1', to_tag: 'PMP-1', cable_type: 'VFD Power', conductor_size: '#14 AWG', length: 20, vendor_detail: 'shielded VFD construction' },
        { id: 'stable-other', tag: 'OTHER-1', from_tag: 'MCC-1', to_tag: 'PMP-2', cable_type: 'Control', conductor_size: '#14 AWG', length: 20 }
      ];
      window.projectStorage.writeScenarioValue('cableSchedule', rows);
    });
    await page.reload();
    await page.waitForFunction(() => window.__CableScheduleInitOK === true);
    const vfd = await rowWithInputValue(page, 'tag', 'VFD-102');
    await expect(vfd.locator('select[name="cable_type"]')).toHaveValue('VFD Power');
    const other = await rowWithInputValue(page, 'tag', 'OTHER-1');
    await other.locator('input[name="tag"]').fill('OTHER-RENAMED');
    await other.locator('input[name="tag"]').press('Tab');
    await expect.poll(() => page.evaluate(() => window.projectStorage.readScenarioValue('cableSchedule'))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'stable-vfd', cable_type: 'VFD Power', vendor_detail: 'shielded VFD construction' }),
      expect.objectContaining({ id: 'stable-other', tag: 'OTHER-RENAMED' })
    ]));
  });

  test('retains VFD classifications and hidden fields through sort, modal edit, duplicate, save, and parsed XLSX export', async ({ page }) => {
    test.setTimeout(60000);
    await page.evaluate(() => {
      window.projectStorage.writeScenarioValue('cableSchedule', [
        { id: 'i8-vfd', tag: 'VFD-200', from_tag: 'MCC-1', to_tag: 'PMP-1', cable_type: 'VFD Power', conductor_size: '#2 AWG', conductor_material: 'Copper', insulation_type: 'VFD Cable XLPE', ground_size: '#8 AWG', ocpd_rating: 100, length: 52, raceway_ids: ['R1'], vendor_detail: 'shielded construction', imported_note: 'retain me', vfd_type: 'future-drive-enum' },
        { id: 'i8-control', tag: 'CTRL-100', from_tag: 'MCC-1', to_tag: 'PMP-2', cable_type: 'Control', conductor_size: '#14 AWG', length: 20, raceway_ids: ['R1'], vendor_detail: 'control construction', imported_note: 'also retain' }
      ]);
      window.projectStorage.writeScenarioValue('traySchedule', [{ tray_id: 'R1' }]);
    });
    await page.reload();
    await page.waitForFunction(() => window.__CableScheduleInitOK === true);

    const vfd = await rowWithInputValue(page, 'tag', 'VFD-200');
    await expect(vfd).toHaveAttribute('data-row-id', /.+/);
    await page.locator('#cableScheduleTable th[data-column-key="tag"] .header-sort').click();
    const sortedVfd = page.locator('#cableScheduleTable tbody tr[data-row-id="i8-vfd"]');
    await expect(sortedVfd.locator('select[name="cable_type"]')).toHaveValue('VFD Power');
    await expect(sortedVfd.locator('select[name="insulation_type"]')).toHaveValue('VFD Cable XLPE');

    await sortedVfd.locator('input[name="tag"]').fill('VFD-201');
    await sortedVfd.locator('input[name="tag"]').press('Tab');
    await sortedVfd.getByRole('button', { name: 'Edit row' }).click();
    await expect(page.locator('#cable-editor-modal[aria-hidden="false"]')).toBeVisible();
    await expect(page.locator('#cable-editor-cable_type')).toHaveValue('VFD Power');
    await expect(page.locator('#cable-editor-insulation_type')).toHaveValue('VFD Cable XLPE');
    await page.fill('#cable-editor-service_description', 'Updated VFD feeder');
    await page.click('#cable-editor-save');

    await page.locator('#cableScheduleTable tbody tr[data-row-id="i8-vfd"]')
      .getByRole('button', { name: 'Duplicate row' }).click();
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(3);
    await expect.poll(() => page.evaluate(() => window.projectStorage.readScenarioValue('cableSchedule'))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'i8-vfd', tag: 'VFD-201', cable_type: 'VFD Power', insulation_type: 'VFD Cable XLPE', service_description: 'Updated VFD feeder', vendor_detail: 'shielded construction', imported_note: 'retain me', vfd_type: 'future-drive-enum' })
    ]));

    await page.click('#save-schedule-btn');
    await openToolbarMenu(page, 'Import / Export');
    await page.click('#open-report-options-btn');
    await expect(page.getByRole('heading', { name: 'Cable Report Options' })).toBeVisible();
    await page.selectOption('#cable-report-mode', 'full');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#report-export-btn');
    const download = await downloadPromise;
    const workbook = XLSX.read(await readDownloadBuffer(download), { type: 'buffer', raw: true });
    expect(workbook.SheetNames).toContain('Full Schedule');
    const exportedRows = XLSX.utils.sheet_to_json(workbook.Sheets['Full Schedule'], { defval: '', raw: true });
    expect(exportedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        Tag: 'VFD-201',
        'Cable Type': 'VFD Power',
        'Insulation Type': 'VFD Cable XLPE',
        'Service Description': 'Updated VFD feeder',
        'Conductor Size': '#2 AWG'
      })
    ]));

    await page.reload();
    await page.waitForFunction(() => window.__CableScheduleInitOK === true);
    await expect(page.locator('#cableScheduleTable tbody tr[data-row-id="i8-vfd"] input[name="tag"]')).toHaveValue('VFD-201');
    await expect(page.locator('#cableScheduleTable tbody tr[data-row-id="i8-vfd"] select[name="cable_type"]')).toHaveValue('VFD Power');
    await expect(page.locator('#cableScheduleTable tbody tr[data-row-id="i8-vfd"] select[name="insulation_type"]')).toHaveValue('VFD Cable XLPE');
    await expect.poll(() => page.evaluate(() => window.projectStorage.readScenarioValue('cableSchedule'))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'i8-vfd', tag: 'VFD-201', cable_type: 'VFD Power', insulation_type: 'VFD Cable XLPE', service_description: 'Updated VFD feeder', vendor_detail: 'shielded construction', imported_note: 'retain me', vfd_type: 'future-drive-enum' })
    ]));
  });

  test('cable library separates source-verified constructions from screening typicals', async ({ page }) => {
    await openToolbarMenu(page, 'Templates');
    await page.click('#cable-library-btn');
    await expect(page.locator('#cable-library-modal[aria-hidden="false"]')).toBeVisible();
    await page.click('#cable-library-starter-btn');
    const notice = page.locator('.component-modal').filter({ has: page.getByRole('heading', { name: 'Starter Types Loaded' }) });
    await expect(notice).toBeVisible();
    await notice.getByRole('button', { name: 'Close', exact: true }).click();

    await expect(page.locator('#cable-library-description')).toContainText('1 source verified');
    await page.selectOption('#cable-library-evidence-filter', 'source_verified');
    await expect(page.locator('#cable-library-list li')).toHaveCount(1);
    await expect(page.locator('#cable-library-list')).toContainText('Southwire SIMpull THHN/THWN-2 Copper 12 AWG');
    await expect(page.locator('#cable-library-list')).toContainText('Source verified');
    await expect(page.locator('#cable-library-list')).toContainText('project approval pending');
  });

  test('batch edit applies common values to selected cables', async ({ page }) => {
    await addCable(page, { tag: 'B1', raceway: 'R1' });
    await addCable(page, { tag: 'B2', raceway: 'R2' });
    await page.check('#cableScheduleTable-select-all');

    await openToolbarMenu(page, 'More');
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
    await writeCableImportFixture(filePath);

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


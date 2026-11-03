/**
 * Fresh-browser acceptance journey on ordinary production URLs (no `?e2e`
 * flag, no test hooks for setup): create a project → add a cable through the
 * editor → reload → run the voltage-drop study → export the results and the
 * project file → import that file into a second fresh browser.
 *
 * Every step asserts data contents, not just headings or HTTP status.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';

test.use({ serviceWorkers: 'block' });

let server;
let base;
let dataDir;

test.beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-fresh-journey-'));
  const app = await createApp({
    dataDir,
    staticRoot: process.cwd(),
    enforceHttps: false,
    rateLimit: { windowMs: 60_000, max: 500 },
  });
  server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (dataDir && path.basename(dataDir).startsWith('ctr-fresh-journey-')) {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

// Chromium exposes the File System Access save picker on localhost, which a
// headless run cannot answer. Hide it so export takes the download path that
// Firefox and Safari users get; the application code is unchanged.
async function useDownloadExport(context) {
  await context.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });
}

async function openSettings(page) {
  const settings = page.locator('#settings-btn');
  if ((await settings.getAttribute('aria-expanded')) !== 'true') await settings.click();
}

async function waitForCableSchedule(page) {
  await page.waitForFunction(() => window.__CableScheduleInitOK === true);
}

const CABLE = {
  tag: 'JRNY-001',
  from_tag: 'MCC-1',
  to_tag: 'PUMP-1',
  cable_type: 'Power',
  conductor_size: '#10 AWG',
  ground_size: '#10 AWG',
  ocpd_rating: '20',
  operating_voltage: '480',
  est_load: '20',
  length: '100',
  power_factor: '1',
};

test('create, edit, reload, study, export, and re-import a project in fresh browsers', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
  await useDownloadExport(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  // 1. Create a project from the header, exactly as a new user would.
  await page.goto(`${base}/cableschedule.html`);
  await waitForCableSchedule(page);
  await openSettings(page);
  await page.locator('#new-project-btn').click();
  const nameDialog = page.getByRole('dialog', { name: 'Create New Project' });
  await expect(nameDialog).toBeVisible();
  await nameDialog.getByRole('textbox').fill('Journey Project');
  await nameDialog.getByRole('button', { name: 'Create' }).click();
  const templateDialog = page.getByRole('dialog', { name: 'Choose a Project Template' });
  await expect(templateDialog).toBeVisible();
  await templateDialog.getByText('Blank', { exact: true }).click();
  const reloaded = page.waitForEvent('load');
  await templateDialog.getByRole('button', { name: 'Use Template' }).click();
  await reloaded;
  await waitForCableSchedule(page);
  await expect.poll(() => page.evaluate(() => window.currentProjectId)).toBe('Journey Project');

  // 2. Add a cable through the editor.
  await page.locator('#add-row-btn').click();
  const editor = page.locator('#cable-editor-modal');
  await expect(editor).toHaveAttribute('aria-hidden', 'false');
  await page.locator('#cable-editor-tag').fill(CABLE.tag);
  await page.locator('#cable-editor-from_tag').fill(CABLE.from_tag);
  await page.locator('#cable-editor-to_tag').fill(CABLE.to_tag);
  await page.locator('#cable-editor-cable_type').selectOption({ label: CABLE.cable_type });
  await page.locator('#cable-editor-conductor_size').selectOption({ label: CABLE.conductor_size });
  await page.locator('#cable-editor-ground_size').selectOption({ label: CABLE.ground_size });
  await page.locator('#cable-editor-ocpd_rating').fill(CABLE.ocpd_rating);
  await page.locator('#cable-editor-operating_voltage').fill(CABLE.operating_voltage);
  await page.locator('#cable-editor-est_load').fill(CABLE.est_load);
  await page.locator('#cable-editor-length').fill(CABLE.length);
  await page.locator('#cable-editor-power_factor').fill(CABLE.power_factor);
  await page.locator('#cable-editor-save').click();
  await expect(page.locator('#cable-editor-modal[aria-hidden="false"]')).toHaveCount(0);
  // A fresh project holds exactly the one cable just entered.
  await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(1);
  const row = page.locator('#cableScheduleTable tbody tr').first();
  await expect(row.locator('[name="tag"]')).toHaveValue(CABLE.tag);
  // Independent check: three-phase, PF 1, NEC Table 9 #10 AWG copper
  // R = 1.2 ohm/1000 ft: sqrt(3) * 20 A * 1.2 * 0.1 kft / 480 V = 0.866 %.
  const expectedDropPct = Math.sqrt(3) * 20 * 1.2 * 0.1 / 480 * 100;
  const editorDrop = await row.locator('[name="voltage_drop_pct"]').inputValue();
  expect(editorDrop).toBe(expectedDropPct.toFixed(2));

  // 3. Save the schedule (it validates required fields first), then reload:
  //    the cable and its calculated drop persist.
  await page.locator('#save-schedule-btn').click();
  await expect(page.getByRole('dialog', { name: /Fields Missing/ })).toHaveCount(0);
  await page.reload();
  await waitForCableSchedule(page);
  await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(1);
  const persisted = page.locator('#cableScheduleTable tbody tr').first();
  await expect(persisted.locator('[name="tag"]')).toHaveValue(CABLE.tag);
  await expect(persisted.locator('[name="from_tag"]')).toHaveValue(CABLE.from_tag);
  await expect(persisted.locator('[name="length"]')).toHaveValue(CABLE.length);
  await expect(persisted.locator('[name="voltage_drop_pct"]')).toHaveValue(editorDrop);

  // 4. Run the voltage-drop study for the project.
  await page.goto(`${base}/voltagedropstudy.html#${encodeURIComponent('Journey Project')}`);
  await page.locator('#run-btn').click();
  const studyRow = page.locator('table tbody tr', { hasText: CABLE.tag });
  await expect(studyRow).toHaveCount(1);
  await expect(studyRow).toContainText(expectedDropPct.toFixed(2));

  // 5a. Export the study as CSV and check its contents.
  const csvDownload = page.waitForEvent('download');
  await page.locator('#export-btn').click();
  const csv = await fs.readFile(await (await csvDownload).path(), 'utf8');
  const csvLine = csv.split(/\r?\n/).find(line => line.includes(CABLE.tag));
  expect(csvLine, `CSV should include ${CABLE.tag}:\n${csv}`).toBeTruthy();
  const csvCells = csvLine.split(',');
  expect(csvCells.slice(0, 3)).toEqual([CABLE.tag, CABLE.from_tag, CABLE.to_tag]);
  expect(csvCells).toContain(expectedDropPct.toFixed(3));

  // 5b. Export the project file.
  await openSettings(page);
  const projectDownload = page.waitForEvent('download');
  await page.locator('#export-project-btn').click();
  const exported = JSON.parse(await fs.readFile(await (await projectDownload).path(), 'utf8'));
  expect(exported.cables.map(cable => cable.tag)).toEqual([CABLE.tag]);
  expect(exported.cables[0]).toMatchObject({ from_tag: CABLE.from_tag, to_tag: CABLE.to_tag, conductor_size: CABLE.conductor_size });
  expect(pageErrors).toEqual([]);
  const projectFile = path.join(dataDir, 'journey.ctr.json');
  await fs.writeFile(projectFile, JSON.stringify(exported));
  await context.close();

  // 6. Import into a second, completely fresh browser.
  const second = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const importer = await second.newPage();
    const importerErrors = [];
    importer.on('pageerror', error => importerErrors.push(error.message));
    await importer.goto(`${base}/cableschedule.html`);
    await waitForCableSchedule(importer);
    const importReload = importer.waitForEvent('load');
    await importer.locator('#import-project-input').setInputFiles(projectFile);
    await importReload;
    await waitForCableSchedule(importer);
    await expect(importer.locator('#cableScheduleTable tbody tr')).toHaveCount(1);
    const imported = importer.locator('#cableScheduleTable tbody tr').first();
    await expect(imported.locator('[name="tag"]')).toHaveValue(CABLE.tag);
    await expect(imported.locator('[name="to_tag"]')).toHaveValue(CABLE.to_tag);
    await expect(imported.locator('[name="voltage_drop_pct"]')).toHaveValue(editorDrop);
    // With no project open, the import names one after the file.
    await expect.poll(() => importer.evaluate(() => window.currentProjectId)).toBe('journey');
    await expect(importer.locator('#project-display')).toContainText('journey');
    expect(importerErrors).toEqual([]);
  } finally {
    await second.close();
  }
});

test('creating a project from a template loads the template schedules', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    await page.goto(`${base}/cableschedule.html`);
    await waitForCableSchedule(page);
    await openSettings(page);
    await page.locator('#new-project-btn').click();
    const nameDialog = page.getByRole('dialog', { name: 'Create New Project' });
    await nameDialog.getByRole('textbox').fill('Template Project');
    await nameDialog.getByRole('button', { name: 'Create' }).click();
    const templateDialog = page.getByRole('dialog', { name: 'Choose a Project Template' });
    await templateDialog.getByText('Oil & Gas', { exact: true }).click();
    const reloaded = page.waitForEvent('load');
    await templateDialog.getByRole('button', { name: 'Use Template' }).click();
    await reloaded;
    await waitForCableSchedule(page);
    await expect(page.getByRole('heading', { name: 'Project Error' })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.currentProjectId)).toBe('Template Project');
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(6);
  } finally {
    await context.close();
  }
});

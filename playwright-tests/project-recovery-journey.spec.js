import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { createApp } from '../server.mjs';

test.use({ serviceWorkers: 'block' });
let server;
let base;
let dataDir;

test.beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-project-journey-'));
  const app = await createApp({ dataDir, staticRoot: process.cwd(), enforceHttps: false, rateLimit: { windowMs: 60_000, max: 500 } });
  server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (dataDir) await fs.rm(dataDir, { recursive: true, force: true });
});

async function ready(page, file = 'equipmentlist.html') {
  await page.goto(`${base}/${file}`);
  await waitForDataStore(page);
}

async function waitForDataStore(page) {
  await page.waitForFunction(() => Boolean(
    window.dataStore
      && typeof window.dataStore.getCables === 'function'
      && typeof window.dataStore.exportProject === 'function'
      && window.projectManager
  ));
  // The module globals are installed before the URL project load completes.
  // Waiting for the canonical readiness signal avoids reading the blank
  // bootstrap state during a reload/import navigation.
  await page.waitForFunction(() => window.__ctrProjectReady === true);
}

async function authenticate(page, username) {
  const credentials = { username, password: 'JourneyPass123!' };
  await page.request.post(`${base}/signup`, { data: credentials });
  const response = await page.request.post(`${base}/login`, { data: credentials });
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  await page.evaluate(({ session, username }) => {
    window.projectStorage.setAuthContextState({ ...session, user: username, provider: 'server' });
  }, { session, username });
  await page.reload();
  await waitForDataStore(page);
}

async function createProject(page, name) {
  if (!(await page.getByRole('button', { name: 'New Project' }).isVisible().catch(() => false))) await page.locator('#settings-btn').click();
  await page.getByRole('button', { name: 'New Project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create New Project' });
  await dialog.getByRole('textbox', { name: 'Project name' }).fill(name);
  await dialog.getByRole('button', { name: 'Create' }).click();
  const template = page.getByRole('dialog', { name: 'Choose a Project Template' });
  await template.getByRole('button', { name: /Blank/ }).click();
  await Promise.all([
    page.waitForEvent('load'),
    template.getByRole('button', { name: 'Use Template' }).click(),
  ]);
  await waitForDataStore(page);
}

async function saveAndCloseDialog(page) {
  if (!(await page.locator('#save-project-btn').isVisible().catch(() => false))) await page.locator('#settings-btn').click();
  await page.locator('#save-project-btn').click();
  const dialog = page.getByRole('dialog', { name: 'Project Saved', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button').last().click();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

test('backend-unavailable browser recovery preserves two scenarios, unknown fields, study values, and report export', async ({ page, context, browser }) => {
  test.setTimeout(90_000);
  const reopened = await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }); });
  await ready(page);
  await authenticate(page, 'journey-user');
  await createProject(page, 'journey-project');

  const importFile = path.join(dataDir, 'journey.ctr.json');
  const cable = (tag, extra = {}) => ({ tag, cable_type: 'VFD Power', from_tag: 'SOURCE', to_tag: tag, conductor_size: '#10 AWG', conductor_material: 'CU', insulation_rating: 75, insulation_type: 'THWN-2', est_load: 20, operating_voltage: 120, length: 100, phases: ['A'], power_factor: 1, raceway_id: `TRAY-${tag}`, raceway_ids: [`TRAY-${tag}`], start_x: 0, start_y: 0, start_z: 0, end_x: 100, end_y: 0, end_z: 0, route_segments: [{ type: 'tray', tray_id: `TRAY-${tag}`, length: 100, start: [0, 0, 0], end: [100, 0, 0] }], vfd_type: 'future-drive-enum', ...extra });
  const section = (cables, tag, setting) => {
    const cableRows = Array.isArray(cables) ? cables : [];
    const firstCable = cableRows[0];
    const cableTag = firstCable?.tag || `CABLE-${tag}`;
    const trayId = `TRAY-${cableTag}`;
    return {
      cables: cableRows,
      loads: [{ id: `LOAD-${tag}`, tag: `LOAD-${tag}`, source: `EQ-${tag}`, kw: 1, voltage: 120, powerFactor: 1, phases: 1 }],
      trays: [{ id: trayId, tray_id: trayId, tag: trayId, width: 12, depth: 4, length: 100, start_x: 0, start_y: 0, start_z: 0, end_x: 100, end_y: 0, end_z: 0 }],
      conduits: [],
      ductbanks: [],
      equipment: [{ id: `EQ-${tag}`, tag: `EQ-${tag}`, voltage: 120, manufacturer: 'Journey Test', x: 0, y: 0 }],
      panels: [],
      mccLineups: [],
      cableTypicals: [],
      oneLine: [{
        id: `SHEET-${tag}`,
        name: tag,
        components: [
          { id: `BUS-${tag}`, type: 'bus', tag: `SOURCE-${tag}`, voltage: 120, connections: [{ target: `MOTOR-${tag}`, cable: { tag: cableTag } }] },
          { id: `MOTOR-${tag}`, type: 'load', tag: cableTag, voltage: 120 },
        ],
      }],
      settings: {
        scenarioMarker: setting,
        designBasis,
      },
    };
  };
  const designBasis = {
    schemaVersion: 1,
    codeBasis: { primaryCode: 'NEC', edition: '2023', jurisdiction: 'Journey Test', ahj: 'Journey AHJ', unitSystem: 'imperial' },
    studyPrerequisites: { requireUtilityFault: false, requireProtectiveDeviceSettings: false, requireEquipmentCoordinates: false, requireArcFlashInputs: false },
    approvalRules: { generatedRecordsRequireReview: false, routeResultsRequireReview: false, studiesRequireReview: false, releaseRequiresReviewer: false, reviewer: 'Journey Reviewer' },
  };
  const fixture = { meta: { version: 1, scenario: 'base', scenarios: ['base', 'future'] }, ...section([cable('BASE-ONLY')], 'BASE', 'base-setting'), scenarioData: { future: section([cable('FUTURE-ONLY', { to_tag: 'MOTOR-2' })], 'FUTURE', 'future-setting') } };
  await fs.writeFile(importFile, JSON.stringify(fixture));
  await page.setInputFiles('#import-project-input', importFile);
  const importDialog = page.getByRole('dialog', { name: 'Review project import' });
  await expect(importDialog).toBeVisible();
  await Promise.all([
    page.waitForEvent('load'),
    importDialog.getByRole('button', { name: /Import project/i }).click(),
  ]);
  await waitForDataStore(page);
  await expect.poll(() => page.evaluate(() => window.dataStore.getCables()[0]?.vfd_type)).toBe('future-drive-enum');
  await expect.poll(() => page.evaluate(() => window.dataStore.getEquipment()[0]?.tag)).toBe('EQ-BASE');
  await expect.poll(() => page.evaluate(() => window.dataStore.exportProject().oneLine?.sheets?.[0]?.name)).toBe('BASE');
  await expect.poll(() => page.evaluate(() => window.dataStore.exportProject().oneLine?.sheets?.[0]?.components?.find(component => component.type === 'bus')?.id)).toBe('BUS-BASE');
  await expect.poll(() => page.evaluate(() => window.dataStore.exportProject().settings?.scenarioMarker)).toBe('base-setting');

  await page.goto(`${base}/cableschedule.html#journey-project`);
  await page.waitForFunction(() => window.__CableScheduleInitOK === true);
  const row = page.locator('#cableScheduleTable tbody tr').first();
  await row.getByRole('button', { name: /Edit/ }).first().click();
  await page.locator('#cable-editor-length').fill('125');
  await page.locator('#cable-editor-save').click();
  await expect(row.locator('[name="length"]')).toHaveValue('125');
  await saveAndCloseDialog(page);

  const savedRecord = await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('CTR_SAVED_PROJECTS_V1') || '{}');
    return all['journey-project'];
  });
  expect(savedRecord?.__serverSync?.version).toEqual(expect.any(String));

  await page.close();
  await reopened.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }); });
  await reopened.goto(`${base}/equipmentlist.html#journey-project`);
  await waitForDataStore(reopened);
  let blockedProjectRequests = 0;
  await context.route('**/projects**', route => {
    blockedProjectRequests += 1;
    return route.abort();
  });
  if (!(await reopened.locator('#load-project-btn').isVisible().catch(() => false))) await reopened.locator('#settings-btn').click();
  await reopened.locator('#load-project-btn').click();
  const chooser = reopened.getByRole('dialog', { name: 'Load Project' });
  await expect(chooser).toBeVisible();
  await chooser.locator('select[name="projectName"]').selectOption('journey-project');
  await Promise.all([
    reopened.waitForEvent('load'),
    chooser.getByRole('button', { name: 'Load' }).click(),
  ]);
  await waitForDataStore(reopened);
  expect(blockedProjectRequests).toBeGreaterThan(0);
  await context.unroute('**/projects**');
  await expect.poll(() => reopened.evaluate(() => window.dataStore.getCables()[0]?.length)).toBe(125);
  page = reopened;

  if (!(await page.getByRole('button', { name: 'Export Project', exact: true }).isVisible().catch(() => false))) await page.locator('#settings-btn').click();
  const exportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Project', exact: true }).click();
  const download = await exportDownload;
  const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  expect(exported.cables).toEqual(expect.arrayContaining([expect.objectContaining({ tag: 'BASE-ONLY', vfd_type: 'future-drive-enum', length: 125 })]));
  expect(exported.scenarioData?.future?.cables).toEqual(expect.arrayContaining([expect.objectContaining({ tag: 'FUTURE-ONLY' })]));

  const cleanContext = await browser.newContext({ serviceWorkers: 'block' });
  const cleanPage = await cleanContext.newPage();
  try {
    await cleanPage.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }); });
    await cleanPage.goto(`${base}/equipmentlist.html#journey-project`);
    await waitForDataStore(cleanPage);
    await cleanPage.setInputFiles('#import-project-input', await download.path());
    const cleanImportDialog = cleanPage.getByRole('dialog', { name: 'Review project import' });
    await expect(cleanImportDialog).toBeVisible();
    await Promise.all([
      cleanPage.waitForEvent('load'),
      cleanImportDialog.getByRole('button', { name: /Import project/i }).click(),
    ]);
    await waitForDataStore(cleanPage);
    await expect.poll(() => cleanPage.evaluate(() => window.dataStore.getCables()[0]?.vfd_type)).toBe('future-drive-enum');
    await expect.poll(() => cleanPage.evaluate(() => window.dataStore.getEquipment()[0]?.tag)).toBe('EQ-BASE');
    await expect.poll(() => cleanPage.evaluate(() => window.dataStore.exportProject().oneLine?.sheets?.[0]?.name)).toBe('BASE');
    await expect.poll(() => cleanPage.evaluate(() => window.dataStore.exportProject().oneLine?.sheets?.[0]?.components?.find(component => component.type === 'bus')?.id)).toBe('BUS-BASE');
    await expect.poll(() => cleanPage.evaluate(() => window.dataStore.exportProject().settings?.scenarioMarker)).toBe('base-setting');
    await cleanPage.evaluate(() => window.dataStore.switchScenario('future'));
    await expect.poll(() => cleanPage.evaluate(() => window.dataStore.getCables()[0]?.tag)).toBe('FUTURE-ONLY');
    await expect.poll(() => cleanPage.evaluate(() => window.dataStore.getEquipment()[0]?.tag)).toBe('EQ-FUTURE');
    await expect.poll(() => cleanPage.evaluate(() => window.dataStore.exportProject().oneLine?.sheets?.[0]?.name)).toBe('FUTURE');
    await expect.poll(() => cleanPage.evaluate(() => window.dataStore.exportProject().oneLine?.sheets?.[0]?.components?.find(component => component.type === 'bus')?.id)).toBe('BUS-FUTURE');
    await expect.poll(() => cleanPage.evaluate(() => window.dataStore.exportProject().settings?.scenarioMarker)).toBe('future-setting');
    await cleanPage.goto(`${base}/voltagedropstudy.html#journey-project`);
    await waitForDataStore(cleanPage);
    await cleanPage.waitForFunction(() => Boolean(
      typeof window.runStudy === 'function' || document.querySelector('#run-btn')
    ));
    await cleanPage.evaluate(() => window.dataStore.switchScenario('future'));
    await expect.poll(() => cleanPage.evaluate(() => window.dataStore.getCurrentScenario())).toBe('future');
    await expect.poll(() => cleanPage.evaluate(() => window.dataStore.getCables()[0]?.tag)).toBe('FUTURE-ONLY');
    await cleanPage.locator('#run-btn').click();
    await expect(cleanPage.locator('#results')).toContainText('FUTURE-ONLY');
    await expect(cleanPage.locator('#results')).toContainText('4.00');
    const studyDownload = cleanPage.waitForEvent('download');
    await cleanPage.locator('#export-btn').click();
    const studyFile = await studyDownload;
    expect(await studyFile.suggestedFilename()).toMatch(/\.csv$/i);
    const studyCsv = await fs.readFile(await studyFile.path(), 'utf8');
    const studyCsvRows = parseCsv(studyCsv);
    expect(studyCsvRows).toHaveLength(2);
    const studyCsvRow = Object.fromEntries(studyCsvRows[0].map((header, index) => [header, studyCsvRows[1][index]]));
    expect(studyCsvRow).toEqual(expect.objectContaining({
      Cable: 'FUTURE-ONLY',
      From: 'SOURCE',
      To: 'MOTOR-2',
      Conductor: '#10 AWG CU',
      'Length (ft)': '100',
      'Current (A)': '20',
      'Current Source': 'Cable Schedule',
      'Voltage (V)': '120',
      'Individual Drop (%)': '4.000',
      'Individual Limit (%)': '3',
      'Individual Status': 'fail',
      'Connected Path': 'FUTURE-ONLY',
      'Combined Drop (%)': '4.000',
      'Combined Limit (%)': '3',
      'Combined Status': 'fail',
      'Recommended Conductor': '#8 AWG',
      'Recommended Drop (%)': '2.600',
      Validity: 'evaluated',
      Units: '%',
      'Input Sources': JSON.stringify({ current: 'Cable Schedule', voltage: 'Cable Schedule' }),
      Assumptions: JSON.stringify({ pathTags: ['FUTURE-ONLY'], upstreamDropPct: 0 }),
      'Model Limits': JSON.stringify({ model: 'screening voltage drop', circuitLimitPct: 3, topology: 'radial only', combinedLimitPct: 3 }),
      Warnings: '[]',
      'Input Fingerprint': expect.stringMatching(/^fnv1a-/),
    }));
    // Named project navigation reloads the last explicitly saved snapshot.
    // Save the active scenario and study before opening the report page.
    await saveAndCloseDialog(cleanPage);
    await cleanPage.goto(`${base}/projectreport.html#journey-project`);
    await waitForDataStore(cleanPage);
    await cleanPage.locator('#rpt-select-available-btn').click();
    await cleanPage.locator('#rpt-generate-btn').click();
    await expect(cleanPage.locator('#report-preview')).toContainText('FUTURE-ONLY');
    const reportDownload = cleanPage.waitForEvent('download');
    await cleanPage.locator('#rpt-json-btn').click();
    const reportFile = await reportDownload;
    const reportJson = JSON.parse(await fs.readFile(await reportFile.path(), 'utf8'));
    expect(reportJson).toEqual(expect.objectContaining({ config: expect.any(Object), sections: expect.any(Object) }));
    const reportVoltageRows = reportJson.sections.voltageDrop?.rows || [];
    const reportVoltageRow = reportVoltageRows.find(row => row.id === 'FUTURE-ONLY');
    expect(reportVoltageRow).toEqual(expect.objectContaining({
      id: 'FUTURE-ONLY',
      from: 'SOURCE',
      to: 'MOTOR-2',
      dropPct: 4,
      dropV: 4.8,
      limitPct: 3,
      status: 'fail',
      combinedDropPct: 4,
      combinedLimitPct: 3,
      combinedStatus: 'fail',
      resultValidity: 'evaluated',
      resultUnits: '%',
      resultInputSources: { current: 'Cable Schedule', voltage: 'Cable Schedule' },
      resultAssumptions: expect.objectContaining({ pathTags: ['FUTURE-ONLY'] }),
      resultModelLimits: expect.objectContaining({ circuitLimitPct: 3, combinedLimitPct: 3 }),
      resultWarnings: [],
      inputFingerprint: expect.stringMatching(/^fnv1a-/),
    }));

    await expect.poll(() => cleanPage.evaluate(() => typeof window.XLSX)).toBe('object');
    const xlsxDownload = cleanPage.waitForEvent('download');
    await cleanPage.locator('#rpt-xlsx-btn').click();
    const xlsxFile = await xlsxDownload;
    expect(await xlsxFile.suggestedFilename()).toMatch(/\.xlsx$/i);
    const workbook = XLSX.read(await fs.readFile(await xlsxFile.path()), { type: 'buffer', raw: true });
    expect(workbook.SheetNames).toContain('VoltageDrop');
    const xlsxRows = XLSX.utils.sheet_to_json(workbook.Sheets.VoltageDrop, { defval: '', raw: true });
    const xlsxVoltageRow = xlsxRows.find(row => row.id === 'FUTURE-ONLY');
    expect(xlsxVoltageRow).toEqual(expect.objectContaining({
      id: 'FUTURE-ONLY',
      from: 'SOURCE',
      to: 'MOTOR-2',
      dropPct: 4,
      limitPct: 3,
      status: 'fail',
      combinedDropPct: 4,
      combinedLimitPct: 3,
      combinedStatus: 'fail',
      resultValidity: 'evaluated',
      resultUnits: '%',
      resultInputSources: JSON.stringify({ current: 'Cable Schedule', voltage: 'Cable Schedule' }),
      resultAssumptions: expect.stringContaining('FUTURE-ONLY'),
      resultModelLimits: expect.stringContaining('combinedLimitPct'),
      resultWarnings: '[]',
    }));
  } finally {
    await cleanContext.close();
  }
});

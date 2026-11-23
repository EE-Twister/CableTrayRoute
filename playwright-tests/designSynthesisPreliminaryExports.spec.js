import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const notice = 'PRELIMINARY - MOTOR PROTECTION UNRESOLVED - NOT FOR ISSUE';
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });
async function openFileMenu(page) {
  const details = page.locator('details').filter({ has: page.locator('summary:text-is("File")') });
  if (!(await details.evaluate(element => element.open))) await details.locator('summary').click();
}

test('ordinary schedules and one-line exports retain the preliminary motor notice', async ({ page }) => {
  await page.goto(server.url('workflowdashboard.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(async () => {
    const store = await import('/dataStore.mjs');
    window.currentProjectId = 'Preliminary export test';
    store.setProjectMeta({ id: window.currentProjectId, name: window.currentProjectId });
    store.setPanels([{ id: 'P1', tag: 'P1', ref: 'P1', phases: 3, voltage: 480, circuitCount: 6 }]);
    store.setLoads([{ id: 'M1', tag: 'M1', panelId: 'P1', breaker: 1, breakerPoles: 3, kw: 9, voltage: 480, phases: 3 }]);
    store.setCables([{ id: 'C1', tag: 'C1', from_tag: 'P1', to_tag: 'M1', cable_type: 'Control', conductor_size: '#14 AWG', length: 20, raceway_ids: ['R1'], _designSynthesis: { identity: 'C1', source: 'design-synthesis' }, motor: { overloadProtectionStatus: 'unresolved' } }]);
    store.setTrays([{ id: 'R1', tray_id: 'R1' }]);
    store.setOneLine({ activeSheet: 0, sheets: [{ id: 'main', name: 'Main', components: [{ id: 'M1', type: 'load', tag: 'M1', x: 200, y: 100, physical: { motor: {} }, _designSynthesis: { identity: 'M1', source: 'design-synthesis' } }], connections: [] }] });
    if (!store.saveProject(window.currentProjectId)) throw new Error('Test project save failed');
  });

  await page.goto(server.url('cableschedule.html'));
  await page.waitForFunction('window.__CableScheduleInitOK === true');
  const menu = page.locator('details.toolbar-menu').filter({ has: page.locator('summary:has-text("Import / Export")') });
  if (!(await menu.evaluate(element => element.open))) await menu.locator('summary').click();
  await page.locator('#open-report-options-btn').click();
  await page.selectOption('#cable-report-mode', 'full');
  let pending = page.waitForEvent('download');
  await page.locator('#report-export-btn').click();
  let download = await pending;
  let workbook = XLSX.read(await fs.readFile(await download.path()), { type: 'buffer', raw: true });
  const cableRows = XLSX.utils.sheet_to_json(workbook.Sheets['Full Schedule'], { defval: '', raw: true });
  expect(cableRows.find(row => row.Tag === 'C1')['Review status']).toBe(notice);
  await page.evaluate(() => { window.print = () => { window.__testPrinted = true; }; });
  await page.locator('#report-print-btn').click();
  await expect(page.locator('#cable-print-report')).toContainText(notice);
  expect(await page.evaluate(() => window.__testPrinted)).toBe(true);

  await page.goto(server.url('panelschedule.html'));
  await expect(page.locator('#panel-select')).toHaveValue('p1');
  pending = page.waitForEvent('download');
  await page.locator('#export-panel-btn').click();
  download = await pending;
  workbook = XLSX.read(await fs.readFile(await download.path()), { type: 'buffer', raw: true });
  expect(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 })[0][0]).toBe(notice);

  await page.goto(server.url('oneline.html'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  await openFileMenu(page);
  await expect(page.locator('#diagram-export-btn')).toBeVisible();
  pending = page.waitForEvent('download');
  await page.locator('#diagram-export-btn').click();
  download = await pending;
  expect(JSON.parse(await fs.readFile(await download.path(), 'utf8')).reviewNotice).toBe(notice);
  await openFileMenu(page);
  await page.locator('#export-btn').click();
  pending = page.waitForEvent('download');
  await page.locator('#export-menu [data-format="dxf"]').click();
  download = await pending;
  expect(await fs.readFile(await download.path(), 'utf8')).toContain(notice);
  await openFileMenu(page);
  await page.locator('#export-btn').click();
  pending = page.waitForEvent('download');
  await page.locator('#export-menu [data-format="pdf"]').click();
  download = await pending;
  const pdf = await getDocument({ data: new Uint8Array(await fs.readFile(await download.path())), useSystemFonts: true }).promise;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const content = await (await pdf.getPage(pageNumber)).getTextContent();
    expect(content.items.map(item => item.str).join(' ')).toContain(notice);
  }
  await pdf.destroy();
});

test('ordinary one-line PDF export remains unmarked when no generated motor is present', async ({ page }) => {
  await page.goto(server.url('oneline.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('[data-oneline-ready="1"]');
  await openFileMenu(page);
  await page.locator('#export-btn').click();
  const pending = page.waitForEvent('download');
  await page.locator('#export-menu [data-format="pdf"]').click();
  const download = await pending;
  const pdf = await getDocument({ data: new Uint8Array(await fs.readFile(await download.path())), useSystemFonts: true }).promise;
  const content = await (await pdf.getPage(1)).getTextContent();
  expect(content.items.map(item => item.str).join(' ')).not.toContain(notice);
  await pdf.destroy();
});

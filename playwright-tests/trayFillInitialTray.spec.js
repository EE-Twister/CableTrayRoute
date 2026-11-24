/**
 * Cable Tray Fill opens on a project tray and draws its Article 392 result
 * instead of a blank 12 in tray (application review U5). An explicit ?tray=
 * request wins, and "New blank tray" keeps manual entry available.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';

test.use({ serviceWorkers: 'block' });

const PROJECT = 'Tray Fill Selection';
let server;
let base;
let dataDir;

test.beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-trayfill-'));
  const app = await createApp({ dataDir, staticRoot: process.cwd(), enforceHttps: false, rateLimit: { windowMs: 60_000, max: 500 } });
  server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (dataDir && path.basename(dataDir).startsWith('ctr-trayfill-')) await fs.rm(dataDir, { recursive: true, force: true });
});

async function seedProjectTrays(page) {
  await page.goto(`${base}/equipmentlist.html`);
  await page.waitForFunction(() => Boolean(window.projectManager && window.projectStorage && window.dataStore));
  await page.evaluate(name => {
    window.projectStorage.setProjectState({ ...window.projectStorage.getProjectState(), name });
    window.currentProjectId = name;
    const tray = (id, width, depth) => ({ tray_id: id, start_x: 0, start_y: 0, start_z: 10, end_x: 40, end_y: 0, end_z: 10, inside_width: width, tray_depth: depth, tray_type: 'Ladder' });
    window.dataStore.setTrays([tray('TR-EMPTY', 12, 4), tray('TR-PWR-1', 24, 4), tray('TR-CTL-1', 18, 6)]);
    window.dataStore.setCables([1, 2, 3].map(index => ({
      tag: `CBL-${index}`, from_tag: 'MCC-1', to_tag: `M-${index}`, cable_type: 'Power', conductors: 3,
      conductor_size: '#4 AWG', cable_od: 0.8, weight: 1.2, length: 40, raceway_ids: ['TR-PWR-1'],
    })));
  }, PROJECT);
}

async function openTrayFill(page, query = '') {
  await page.goto(`${base}/cabletrayfill.html${query}#${encodeURIComponent(PROJECT)}`);
  await expect(page.locator('#tray-fill-handoff')).not.toBeEmpty();
}

test('opens on the first project tray with cables and draws its Article 392 result', async ({ page }) => {
  await seedProjectTrays(page);
  await openTrayFill(page);
  await expect(page.locator('#tray-fill-project-selector')).toHaveValue('TR-PWR-1');
  await expect(page.locator('#tray-fill-handoff')).toContainText('Reviewing TR-PWR-1');
  await expect(page.locator('#tray-fill-handoff')).toContainText('Article 392 result is drawn below');
  await expect(page.locator('#trayName')).toHaveValue('TR-PWR-1');
  await expect(page.locator('#trayWidth')).toHaveValue('24');
  await expect(page.locator('#cableTable tbody tr')).toHaveCount(3);
  await expect(page.locator('#results')).toContainText('Selected NEC 2023 Article 392 Evaluation');
  await expect(page.locator('.component-modal')).toHaveCount(0);
});

test('?tray= selects that tray, and New blank tray returns to manual entry', async ({ page }) => {
  await seedProjectTrays(page);
  await openTrayFill(page, '?tray=TR-CTL-1');
  await expect(page.locator('#tray-fill-project-selector')).toHaveValue('TR-CTL-1');
  await expect(page.locator('#trayName')).toHaveValue('TR-CTL-1');
  await expect(page.locator('#tray-fill-handoff')).toContainText('No project cables are assigned to this tray yet.');

  await page.locator('#tray-fill-project-selector').selectOption('');
  await expect(page).toHaveURL(/[?&]blank=1/);
  await expect(page.locator('#tray-fill-project-selector')).toHaveValue('');
  await expect(page.locator('#tray-fill-handoff')).toContainText('Reviewing a blank tray');
  await expect(page.locator('#trayName')).toHaveValue('');
  await expect(page.locator('#trayWidth')).toHaveValue('12');
});

test('a missing ?tray= keeps the blank tray and says so', async ({ page }) => {
  await seedProjectTrays(page);
  await openTrayFill(page, '?tray=TR-GONE');
  await expect(page.locator('#tray-fill-handoff')).toContainText('Tray TR-GONE is not in the Raceway Schedule');
  await expect(page.locator('#tray-fill-project-selector')).toHaveValue('');
  await expect(page.locator('#trayName')).toHaveValue('');
});

test('switching trays asks before replacing unsaved manual entries', async ({ page }) => {
  await seedProjectTrays(page);
  await openTrayFill(page, '?blank=1');
  await page.locator('#trayName').fill('Manual run');
  await page.locator('#tray-fill-project-selector').selectOption('TR-PWR-1');
  const dialog = page.getByRole('dialog', { name: 'Replace tray inputs?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#tray-fill-project-selector')).toHaveValue('');
  await expect(page.locator('#trayName')).toHaveValue('Manual run');

  await page.locator('#tray-fill-project-selector').selectOption('TR-PWR-1');
  await page.getByRole('dialog', { name: 'Replace tray inputs?' }).getByRole('button', { name: 'Replace' }).click();
  await expect(page.locator('#trayName')).toHaveValue('TR-PWR-1');
  await expect(page).toHaveURL(/[?&]tray=TR-PWR-1/);
});

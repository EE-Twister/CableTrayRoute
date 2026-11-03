/**
 * The header save badge must tell the truth on ordinary production URLs:
 * "Saved" only when the working copy matches the project's saved version
 * (what reloading or a project link restores), "Unsaved changes" otherwise,
 * with server/cloud sync reported on a separate chip.
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
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-save-badge-'));
  const app = await createApp({ dataDir, staticRoot: process.cwd(), enforceHttps: false, rateLimit: { windowMs: 60_000, max: 500 } });
  server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (dataDir && path.basename(dataDir).startsWith('ctr-save-badge-')) await fs.rm(dataDir, { recursive: true, force: true });
});

const badge = page => page.locator('#project-sync-status');
const cloudChip = page => page.locator('#project-cloud-status');
const scheduleReady = page => page.waitForFunction(() => window.__CableScheduleInitOK === true);

async function createProject(page, name) {
  await page.goto(`${base}/cableschedule.html`);
  await scheduleReady(page);
  await page.locator('#settings-btn').click();
  await page.locator('#new-project-btn').click();
  const nameDialog = page.getByRole('dialog', { name: 'Create New Project' });
  await nameDialog.getByRole('textbox').fill(name);
  await nameDialog.getByRole('button', { name: 'Create' }).click();
  const templateDialog = page.getByRole('dialog', { name: 'Choose a Project Template' });
  await templateDialog.getByText('Blank', { exact: true }).click();
  const reloaded = page.waitForEvent('load');
  await templateDialog.getByRole('button', { name: 'Use Template' }).click();
  await reloaded;
  await scheduleReady(page);
}

async function addCable(page, tag) {
  await page.locator('#add-row-btn').click();
  for (const [key, value] of [['tag', tag], ['from_tag', 'MCC-1'], ['to_tag', 'P-1'], ['length', '100'], ['ocpd_rating', '20']]) {
    await page.locator(`#cable-editor-${key}`).fill(value);
  }
  await page.locator('#cable-editor-conductor_size').selectOption({ label: '#10 AWG' });
  await page.locator('#cable-editor-ground_size').selectOption({ label: '#10 AWG' });
  await page.locator('#cable-editor-save').click();
}

test('badge follows edits, saves, reloads, and project links', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.goto(`${base}/cableschedule.html`);
  await scheduleReady(page);
  await expect(badge(page)).toHaveText('No project');

  await createProject(page, 'Badge Project');
  await expect(badge(page)).toHaveText('Saved');
  await expect(cloudChip(page)).toBeHidden();

  await addCable(page, 'BDG-1');
  await expect(badge(page)).toHaveText('Unsaved changes');
  await expect(badge(page)).toHaveAttribute('title', /restores the last saved version/);
  await expect(page.locator('.project-actions-trigger')).toHaveAttribute('aria-label', /Badge Project\. Unsaved changes\./);

  await page.locator('#save-schedule-btn').click();
  await expect(badge(page)).toHaveText('Saved');

  await page.reload();
  await scheduleReady(page);
  await expect(badge(page)).toHaveText('Saved');
  await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(1);

  // Pages that write data when opened now keep it in the saved version, so
  // opening them does not leave the project unsaved.
  for (const file of ['equipmentarrangements.html', 'tcc.html']) {
    await page.goto(`${base}/${file}#Badge%20Project`);
    await page.waitForTimeout(1500);
    await expect(badge(page), file).toHaveText('Saved');
  }
});

test('server sync is reported on its own chip', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await createProject(page, 'synced-project');
  const credentials = { username: 'badge-user', password: 'BadgePass123!' };
  await page.request.post(`${base}/signup`, { data: credentials });
  const login = await page.request.post(`${base}/login`, { data: credentials });
  expect(login.ok()).toBeTruthy();
  const session = await login.json();
  await page.evaluate(({ session, username }) => {
    window.projectStorage.setAuthContextState({ ...session, user: username, provider: 'server' });
  }, { session, username: credentials.username });
  await page.reload();
  await scheduleReady(page);

  await addCable(page, 'SYNC-1');
  await expect(badge(page)).toHaveText('Unsaved changes');
  const saved = page.waitForResponse(response => response.request().method() === 'POST'
    && response.url() === `${base}/projects/synced-project`);
  await page.evaluate(() => { void window.projectManager.saveProject({ skipManual: true }); });
  expect((await saved).status()).toBe(200);
  await page.getByRole('dialog', { name: 'Project Saved', exact: true }).getByRole('button').last().click();
  await expect(badge(page)).toHaveText('Saved');
  await expect(cloudChip(page)).toBeVisible();
  await expect(cloudChip(page)).toHaveText('Synced');
  await expect(page.locator('.project-actions-trigger')).toHaveAttribute('aria-label', /Saved\..*Cloud: Synced\./);
});

test('importing a file into an open project keeps the import after the reload', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await createProject(page, 'Import Target');
  await addCable(page, 'OLD-1');
  await page.locator('#save-schedule-btn').click();
  await expect(badge(page)).toHaveText('Saved');

  const exported = await page.evaluate(() => window.dataStore.exportProject());
  exported.cables = [
    ...exported.cables,
    { tag: 'NEW-2', from_tag: 'MCC-1', to_tag: 'P-2', conductor_size: '#10 AWG', length: 50 },
  ];
  const file = path.join(dataDir, 'import-target.ctr.json');
  await fs.writeFile(file, JSON.stringify(exported));

  const reloaded = page.waitForEvent('load');
  await page.locator('#import-project-input').setInputFiles(file);
  await reloaded;
  await scheduleReady(page);
  await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(2);
  await expect(badge(page)).toHaveText('Saved');
});

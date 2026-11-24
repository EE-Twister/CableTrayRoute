/**
 * A workspace that holds records but has never been saved is offered Save
 * alone on the home page (application review, U4 follow-up). Create New and
 * the sample project would replace the unsaved records, and the section-level
 * Save button would duplicate the prompt's own.
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
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-homeunsaved-'));
  const app = await createApp({ dataDir, staticRoot: process.cwd(), enforceHttps: false, rateLimit: { windowMs: 60_000, max: 500 } });
  server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (dataDir && path.basename(dataDir).startsWith('ctr-homeunsaved-')) await fs.rm(dataDir, { recursive: true, force: true });
});

test('an empty workspace starts from Create / Open / Sample', async ({ page }) => {
  await page.goto(`${base}/index.html`);
  const panel = page.locator('#home-projects-panel');
  await expect(panel.getByRole('heading', { name: 'Create or open a project' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Create New Project' })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Try a Sample Project' })).toBeVisible();
  await expect(page.locator('#home-save-project-btn')).toBeHidden();
});

test('unsaved records are offered Save, not Create New, and Save is not duplicated', async ({ page }) => {
  await page.goto(`${base}/equipmentlist.html`);
  await page.waitForFunction(() => Boolean(window.dataStore && window.projectStorage));
  await page.evaluate(() => {
    window.projectStorage.setProjectState({ ...window.projectStorage.getProjectState(), name: 'Unsaved Draft' });
    window.currentProjectId = 'Unsaved Draft';
    window.dataStore.setEquipment([{ tag: 'EQ-1', description: 'Switchboard' }]);
    window.dataStore.setCables([{ tag: 'C-1', from_tag: 'EQ-1', to_tag: 'M-1', conductor_size: '#4 AWG', length: 80 }]);
  });
  await page.goto(`${base}/index.html#${encodeURIComponent('Unsaved Draft')}`);
  const panel = page.locator('#home-projects-panel');
  await expect(panel.getByRole('heading', { name: 'Save this workspace as a project' })).toBeVisible();
  await expect(panel).toContainText('2 unsaved records');
  await expect(panel.getByRole('button', { name: 'Save Project' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Open Existing Project' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Create New Project' })).toHaveCount(0);
  await expect(panel.getByRole('link', { name: 'Try a Sample Project' })).toHaveCount(0);
  await expect(page.locator('#home-save-project-btn')).toBeHidden();
});

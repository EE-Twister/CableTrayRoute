import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

test('load-list edits and one-line state survive the project manager save and cross-page reload', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(server.url('loadlist.html?e2e=1'));
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.waitForFunction(() => window.__ctrProjectReady === true && Boolean(window.dataStore && window.projectManager));
  await page.evaluate(() => {
    window.currentProjectId = 'Shared store handoff';
    window.dataStore.setProjectMeta({ id: 'Shared store handoff', name: 'Shared store handoff' });
  });
  await page.locator('#load-sample-loads-btn').click();
  await expect(page.locator('#load-table tbody tr')).toHaveCount(5);
  expect(await page.evaluate(() => window.dataStore.getLoads().length)).toBe(5);
  await page.evaluate(() => { window.projectManager.saveProject({ skipManual: true }); });
  const firstSave = page.getByRole('dialog', { name: 'Project Saved' });
  await expect(firstSave).toBeVisible();
  await firstSave.getByRole('button', { name: 'Close', exact: true }).click();

  await page.goto(server.url('oneline.html?e2e=1#Shared%20store%20handoff'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  await page.waitForFunction(() => window.__ctrProjectReady === true && Boolean(window.dataStore && window.projectManager));
  expect(await page.evaluate(() => window.dataStore.getLoads().length)).toBe(5);
  await page.evaluate(() => {
    window.dataStore.setItem('sharedStoreHandoffMarker', { reference: 'One-line project-state check' });
    window.projectManager.saveProject({ skipManual: true });
  });
  const secondSave = page.getByRole('dialog', { name: 'Project Saved' });
  await expect(secondSave).toBeVisible();
  await secondSave.getByRole('button', { name: 'Close', exact: true }).click();
  await page.goto(server.url('loadlist.html?e2e=1#Shared%20store%20handoff'));
  await page.waitForFunction(() => window.__ctrProjectReady === true && Boolean(window.dataStore));
  await expect.poll(() => page.evaluate(() => window.dataStore.getLoads().length)).toBe(5);
  expect(await page.evaluate(() => window.dataStore.getItem('sharedStoreHandoffMarker', null))).toEqual({ reference: 'One-line project-state check' });
});

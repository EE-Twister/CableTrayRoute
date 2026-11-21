/**
 * Opening a share link (?snapshotToken=...) must load the shared project,
 * tell the visitor what they can do, connect live collaboration through the
 * share-link ticket, and save back only through editable links.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { createApp } from '../server.mjs';
import { attachCollaborationServer } from '../src/collaborationServer.mjs';

test.use({ serviceWorkers: 'block' });

const PROJECT = 'shared-demo';

let server;
let base;
let dataDir;
let owner;

async function api(pathname, { method = 'GET', body, session = owner } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session) {
    headers.Authorization = `Bearer ${session.token}`;
    if (method !== 'GET') headers['X-CSRF-Token'] = session.csrfToken;
  }
  return fetch(`${base}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createLink(mode) {
  const res = await api(`/projects/${PROJECT}/snapshots`, { method: 'POST', body: { mode } });
  expect(res.status).toBe(201);
  return res.json();
}

test.beforeAll(async ({ browser }) => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-shared-link-'));
  const app = await createApp({ dataDir, staticRoot: process.cwd(), enforceHttps: false, rateLimit: { windowMs: 60_000, max: 500 } });
  server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  attachCollaborationServer(server, new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 }), {
    validateUpgrade: app.get('collabUpgradeValidator'),
  });
  base = `http://127.0.0.1:${server.address().port}`;

  const credentials = { username: 'linkowner', password: 'Sup3rSecret!' };
  const signup = await fetch(`${base}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  expect(signup.status).toBe(201);
  const login = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  owner = await login.json();

  // Let the app itself produce a valid, empty project export, then put one cable in it.
  const page = await browser.newPage();
  await page.goto(`${base}/cableschedule.html`);
  await page.waitForFunction(() => window.__CableScheduleInitOK === true);
  const data = await page.evaluate(() => window.dataStore.exportProject());
  await page.close();
  data.cables = [{ tag: 'SHARED-1', from_tag: 'MCC-1', to_tag: 'P-1', length: '100' }];
  const saved = await api(`/projects/${PROJECT}`, { method: 'POST', body: { data } });
  expect(saved.status).toBe(200);
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (dataDir && path.basename(dataDir).startsWith('ctr-shared-link-')) await fs.rm(dataDir, { recursive: true, force: true });
});

const openDialog = page => page.getByRole('dialog', { name: 'Open Shared Project' });
const banner = page => page.getByRole('region', { name: 'Shared project' });
const cableTags = page => page.evaluate(() => window.dataStore.getCables().map(cable => cable.tag));

test('an editable link opens the project, connects live, and saves back', async ({ page }) => {
  const link = await createLink('edit');
  await page.goto(`${base}/oneline.html?snapshotToken=${link.token}`);

  await expect(openDialog(page)).toBeVisible();
  await openDialog(page).getByRole('button', { name: 'Open shared project' }).click();

  await expect(banner(page)).toContainText(`Shared project "${PROJECT}"`);
  await expect(banner(page)).toContainText('editable');
  await expect.poll(() => cableTags(page)).toContain('SHARED-1');
  await expect(banner(page).getByRole('status')).toContainText('Live collaboration connected', { timeout: 15_000 });

  await page.evaluate(() => {
    const cables = window.dataStore.getCables();
    window.dataStore.setCables([...cables, { tag: 'VISITOR-1', from_tag: 'MCC-2', to_tag: 'P-2', length: '50' }]);
  });
  await banner(page).getByRole('button', { name: 'Save to shared project' }).click();
  await expect(banner(page).getByRole('status')).toContainText('Saved to the shared project');

  const stored = await (await api(`/projects/${PROJECT}`)).json();
  expect(JSON.stringify(stored.data)).toContain('VISITOR-1');
});

test('a read-only link shows read-only and offers no save', async ({ page }) => {
  const link = await createLink('read');
  await page.goto(`${base}/oneline.html?snapshotToken=${link.token}`);
  await openDialog(page).getByRole('button', { name: 'Open shared project' }).click();

  await expect(banner(page)).toContainText('read-only');
  await expect(banner(page).getByRole('button', { name: 'Save to shared project' })).toHaveCount(0);
  await expect.poll(() => cableTags(page)).toContain('SHARED-1');
});

test('cancelling leaves the visitor project alone and removes the token from the address bar', async ({ page }) => {
  const link = await createLink('edit');
  await page.goto(`${base}/oneline.html?snapshotToken=${link.token}`);
  await expect(openDialog(page)).toBeVisible();
  await openDialog(page).getByRole('button', { name: 'Cancel' }).click();

  await expect(openDialog(page)).toHaveCount(0);
  await expect(banner(page)).toHaveCount(0);
  expect(page.url()).not.toContain('snapshotToken');
  expect(await cableTags(page)).not.toContain('SHARED-1');
});

test('a revoked link explains itself and changes nothing', async ({ page }) => {
  const link = await createLink('edit');
  const revoked = await api(`/projects/${PROJECT}/snapshots/${link.id}`, { method: 'DELETE' });
  expect(revoked.status).toBe(204);

  await page.goto(`${base}/oneline.html?snapshotToken=${link.token}`);
  const dialog = page.getByRole('dialog', { name: 'Shared project unavailable' });
  await expect(dialog).toContainText('revoked');
  await dialog.getByRole('button').first().click();

  await expect(banner(page)).toHaveCount(0);
  expect(await cableTags(page)).not.toContain('SHARED-1');
});

test('the shared session follows the visitor to other pages until they leave', async ({ page }) => {
  const link = await createLink('edit');
  await page.goto(`${base}/oneline.html?snapshotToken=${link.token}`);
  await openDialog(page).getByRole('button', { name: 'Open shared project' }).click();
  await expect(banner(page)).toBeVisible();

  await page.goto(`${base}/cableschedule.html`);
  await expect(banner(page)).toContainText(`Shared project "${PROJECT}"`);
  await expect(openDialog(page)).toHaveCount(0);

  await banner(page).getByRole('button', { name: 'Leave shared project' }).click();
  await expect(banner(page)).toHaveCount(0);

  await page.reload();
  await expect(banner(page)).toHaveCount(0);
});

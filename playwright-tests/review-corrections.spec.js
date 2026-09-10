import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { SAMPLE_REGISTRY, migrateSampleProject, sampleProjectToImportPayload } from '../analysis/sampleGallery.mjs';

test.use({ serviceWorkers: 'block' });
let server;
let base;
let dataDir;

test.beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-browser-review-'));
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
  if (dataDir && path.dirname(dataDir) === os.tmpdir() && path.basename(dataDir).startsWith('ctr-browser-review-')) {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

async function ready(page, file = 'equipmentlist.html') {
  await page.goto(`${base}/${file}`);
  await page.waitForFunction(() => Boolean(window.projectManager && window.dataStore && window.projectStorage));
}

async function authenticate(page, username) {
  const credentials = { username, password: 'ReviewPass123!' };
  await page.request.post(`${base}/signup`, { data: credentials });
  const response = await page.request.post(`${base}/login`, { data: credentials });
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  await page.evaluate(({ session, username }) => {
    window.projectStorage.setAuthContextState({ ...session, user: username, provider: 'server' });
  }, { session, username });
  // The real login flow navigates after persisting the session.
  await page.reload();
  await page.waitForFunction(() => Boolean(window.projectManager && window.dataStore && window.projectStorage));
  return session;
}

async function loadServerProject(page, name) {
  // A project hash change precedes the reload; wait for the document load,
  // rather than treating the hash navigation as completion of the import.
  const navigation = page.waitForEvent('load', { timeout: 10_000 });
  await page.evaluate(name => { void window.projectManager.openProjectByName(name); }, name);
  try {
    await navigation;
  } catch {
    const diagnostic = await page.evaluate(() => ({
      importError: window.dataStore?.getLastProjectImportError(),
      user: window.projectStorage?.getAuthContextState()?.user,
      project: window.projectStorage?.getProjectState()?.name,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map(element => element.textContent),
    }));
    throw new Error(`Project load did not reload: ${JSON.stringify(diagnostic)}`);
  }
  await page.waitForFunction(() => Boolean(window.projectManager && window.dataStore));
  await expect.poll(() => page.evaluate(() => window.currentProjectId)).toBe(name);
  await expect(page.getByRole('dialog', { name: 'Create New Project' })).toHaveCount(0);
}

async function save(page, title) {
  await page.evaluate(() => { void window.projectManager.saveProject({ skipManual: true }); });
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  try {
    await expect(dialog).toBeVisible();
  } catch {
    const diagnostic = await page.evaluate(() => ({
      user: window.projectStorage?.getAuthContextState()?.user,
      project: window.currentProjectId,
      dialogs: [...document.querySelectorAll('[role="dialog"]')]
        .filter(element => element.getBoundingClientRect().height > 0)
        .map(element => element.textContent),
    }));
    throw new Error(`Missing ${title}: ${JSON.stringify(diagnostic)}`);
  }
  await dialog.getByRole('button').last().click();
}

for (const sharedStorage of [false, true]) {
test(`server revision survives reload and navigation; stale ${sharedStorage ? 'tab' : 'browser'} preserves local edits`, async ({ page, browser }) => {
  const secondContext = sharedStorage ? page.context() : await browser.newContext({ serviceWorkers: 'block' });
  let second;
  try {
    second = await secondContext.newPage();
    await ready(page);
    const username = sharedStorage ? 'tab-review' : 'browser-review';
    const session = await authenticate(page, username);
    const fixture = await page.evaluate(() => ({
      ...window.dataStore.exportProject(),
      equipment: [{ id: 'SEED', tag: 'SEED' }],
    }));
    const initial = await page.request.post(`${base}/projects/revision-review`, {
      headers: { 'X-CSRF-Token': session.csrfToken },
      data: { data: fixture },
    });
    expect(initial.ok()).toBeTruthy();
    const initialVersion = (await initial.json()).version;
    await loadServerProject(page, 'revision-review');
    await expect.poll(() => page.evaluate(() => window.dataStore.getEquipment().map(row => row.tag))).toEqual(['SEED']);
    await ready(second);
    if (!sharedStorage) {
      // The server intentionally revokes an earlier login when a user signs
      // in again. Reuse one session to isolate snapshot concurrency here.
      await secondContext.addCookies(await page.context().cookies(base));
      await second.evaluate(({ session, username }) => {
        window.projectStorage.setAuthContextState({ ...session, user: username, provider: 'server' });
      }, { session, username });
      await second.reload();
      await second.waitForFunction(() => Boolean(window.projectManager && window.dataStore));
    }
    await loadServerProject(second, 'revision-review');
    await page.reload();
    await page.waitForFunction(() => Boolean(window.projectManager && window.dataStore));
    await ready(page, 'loadlist.html#revision-review');
    await page.evaluate(() => window.dataStore.setEquipment([{ id: 'NEW', tag: 'NEW' }]));
    const outgoing = page.waitForRequest(request => request.method() === 'POST'
      && request.url() === `${base}/projects/revision-review`);
    const updatedResponse = page.waitForResponse(response => response.request().method() === 'POST'
      && response.url() === `${base}/projects/revision-review`);
    await save(page, 'Project Saved');
    expect((await outgoing).postDataJSON().data.equipment.map(row => row.tag)).toEqual(['NEW']);
    expect((await updatedResponse).status()).toBe(200);
    expect((await (await updatedResponse).json()).version).not.toBe(initialVersion);
    const updated = await (await page.request.get(`${base}/projects/revision-review`)).json();
    expect(updated.data.equipment.map(row => row.tag)).toEqual(['NEW']);
    await second.evaluate(() => window.dataStore.setEquipment([{ id: 'STALE', tag: 'STALE' }]));
    const staleResponse = second.waitForResponse(response => response.request().method() === 'POST'
      && response.url() === `${base}/projects/revision-review`);
    await second.evaluate(() => { void window.projectManager.saveProject({ skipManual: true }); });
    const response = await staleResponse;
    expect({ status: response.status(), baseVersion: response.request().postDataJSON().baseVersion })
      .toEqual({ status: 409, baseVersion: initialVersion });
    const conflict = second.getByRole('dialog', { name: 'Server Save Conflict', exact: true });
    await expect(conflict).toBeVisible();
    await conflict.getByRole('button').last().click();
    await expect.poll(() => second.evaluate(() => window.dataStore.getEquipment().map(row => row.tag))).toEqual(['STALE']);
    const saved = await (await page.request.get(`${base}/projects/revision-review`)).json();
    expect(saved.data.equipment.map(row => row.tag)).toEqual(['NEW']);
  } finally {
    if (sharedStorage) await second?.close();
    else await secondContext.close();
  }
});
}

test('selected cable voltage drop remains consistent in modal, table and reload', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    window.projectStorage.setProjectState({ ...window.projectStorage.getProjectState(), name: 'calculation-review' });
    window.currentProjectId = 'calculation-review';
    window.dataStore.setCables([{
      tag: 'VD-REVIEW', from_tag: 'SOURCE', to_tag: 'LOAD', cable_type: 'Control',
      conductor_size: '#10 AWG', conductor_material: 'CU', insulation_rating: 75,
      est_load: 20, operating_voltage: 120, length: 100, power_factor: 1,
      parallel_count: 1, phases: ['A'],
    }]);
  });
  await page.goto(`${base}/cableschedule.html#calculation-review`);
  await page.waitForFunction(() => window.__CableScheduleInitOK === true);
  const row = page.locator('#cableScheduleTable tbody tr').first();
  await expect(row.locator('[name="voltage_drop_pct"]')).toHaveValue('4.00');
  await row.getByRole('button', { name: /Edit/, exact: false }).first().click();
  await expect(page.locator('#cable-editor-voltage_drop_pct')).toHaveValue('4.00');
  await page.locator('#cable-editor-conductor_size').selectOption({ label: '#8 AWG' });
  // R = 0.78 ohm/1000 ft; 2 * 20 A * 0.1 kft * R / 120 V * 100 = 2.6%.
  await expect(page.locator('#cable-editor-voltage_drop_pct')).toHaveValue('2.60');
  await page.locator('#cable-editor-parallel_count').fill('2');
  await expect(page.locator('#cable-editor-voltage_drop_pct')).toHaveValue('1.30');
  await page.locator('#cable-editor-save').click();
  await expect(page.locator('#cable-editor-modal[aria-hidden="false"]')).toHaveCount(0);
  await expect(row.locator('[name="voltage_drop_pct"]')).toHaveValue('1.30');
  await page.reload();
  await page.waitForFunction(() => window.__CableScheduleInitOK === true);
  await expect(page.locator('#cableScheduleTable tbody tr').first().locator('[name="voltage_drop_pct"]')).toHaveValue('1.30');
});

test('canonical resistance override can be edited and cleared without reviving the old value', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    window.projectStorage.setProjectState({ ...window.projectStorage.getProjectState(), name: 'override-review' });
    window.currentProjectId = 'override-review';
    window.dataStore.setCables([{
      tag: 'OVERRIDE', from_tag: 'SOURCE', to_tag: 'LOAD', cable_type: 'Control',
      conductor_size: '#10 AWG', conductor_material: 'CU', insulation_rating: 75,
      est_load: 20, operating_voltage: 120, length: 100, power_factor: 1,
      parallel_count: 1, phases: ['A'], impedance_per_1000ft: 1.5,
    }]);
  });
  await page.goto(`${base}/cableschedule.html#override-review`);
  await page.waitForFunction(() => window.__CableScheduleInitOK === true);
  const row = page.locator('#cableScheduleTable tbody tr').first();
  await expect(row.locator('[name="voltage_drop_pct"]')).toHaveValue('5.00');
  for (const [override, expected] of [['0.6', '2.00'], ['', '4.00']]) {
    await row.getByRole('button', { name: /Edit/ }).first().click();
    await page.locator('#cable-editor-impedance').fill(override);
    await expect(page.locator('#cable-editor-voltage_drop_pct')).toHaveValue(expected);
    await page.locator('#cable-editor-save').click();
    await expect(row.locator('[name="voltage_drop_pct"]')).toHaveValue(expected);
    await page.reload();
    await page.waitForFunction(() => window.__CableScheduleInitOK === true);
    await expect(row.locator('[name="voltage_drop_pct"]')).toHaveValue(expected);
  }
});

for (const sample of SAMPLE_REGISTRY) {
  test(`ordinary guided sample retains all collections after reload: ${sample.id}`, async ({ page }) => {
    const fixture = JSON.parse(await fs.readFile(path.resolve(sample.projectFile), 'utf8'));
    const payload = sampleProjectToImportPayload(migrateSampleProject(fixture));
    const keys = ['cables', 'trays', 'conduits', 'ductbanks', 'equipment', 'loads', 'panels', 'mccLineups', 'cableTypicals'];
    const expected = Object.fromEntries(keys.map(key => [key, (payload[key] || []).length]));
    const sheets = Array.isArray(payload.oneLine) ? payload.oneLine : payload.oneLine?.sheets || [];
    expected.sheets = sheets.length;
    expected.components = sheets.reduce((count, sheet) => count + (sheet.components || []).length, 0);
    await ready(page, 'samplegallery.html');
    await page.locator(`[data-sample-id="${sample.id}"] .primary-btn`).click();
    await expect(page.locator('#checklist-panel')).toContainText(sample.title);
    await expect(page.getByRole('dialog', { name: 'Create New Project' })).toHaveCount(0);
    const counts = () => page.evaluate(() => {
      const data = window.dataStore;
      const collections = {
        cables: data.getCables(), trays: data.getTrays(), conduits: data.getConduits(),
        ductbanks: data.getDuctbanks(), equipment: data.getEquipment(), loads: data.getLoads(),
        panels: data.getPanels(), mccLineups: data.getMccLineups(), cableTypicals: data.getCableTypicals(),
      };
      const result = Object.fromEntries(Object.entries(collections).map(([key, records]) => [key, records.length]));
      const sheets = data.getOneLine().sheets;
      return { ...result, sheets: sheets.length, components: sheets.reduce((count, sheet) => count + (sheet.components || []).length, 0) };
    });
    await expect.poll(counts).toEqual(expected);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.dataStore));
    await expect.poll(counts).toEqual(expected);
  });
}

for (const reopen of [false, true]) {
test(`failed sample ${reopen ? 'reopen' : 'creation'} restores previous project, scenario, history and URL`, async ({ page }) => {
  await ready(page, 'samplegallery.html');
  if (reopen) {
    await page.locator('[data-sample-id="project-workflow-core"] .primary-btn').click();
    await expect(page.locator('#checklist-panel')).toBeVisible();
  }
  const before = await page.evaluate(() => {
    window.projectStorage.setProjectState({ ...window.projectStorage.getProjectState(), name: 'before-sample' });
    window.currentProjectId = 'before-sample';
    history.replaceState(null, '', '#before-sample');
    window.dataStore.switchScenario('future');
    window.dataStore.setCables([{ tag: 'KEEP', conductor_size: '#10 AWG', length: 100 }]);
    window.dataStore.saveProject('before-sample');
    const result = {
      project: window.projectStorage.getProjectState(),
      saved: window.projectStorage.listSavedProjects(),
      undo: window.projectStorage.getProjectStorageDiagnostics().undoEntries,
      redo: window.projectStorage.getProjectStorageDiagnostics().redoEntries,
    };
    // Inject failure after import and copy persistence, exercising the actual
    // sample catch/rollback path without changing the import implementation.
    window.updateProjectDisplay = async () => { throw new Error('Injected display failure'); };
    return result;
  });
  await page.locator('[data-sample-id="project-workflow-core"] .primary-btn').click();
  await expect(page.locator('#toast')).toContainText(/Could not (load|open|reopen)/);
  await expect(page).toHaveURL(/#before-sample$/);
  const after = await page.evaluate(() => ({
    project: window.projectStorage.getProjectState(),
    saved: window.projectStorage.listSavedProjects(),
    undo: window.projectStorage.getProjectStorageDiagnostics().undoEntries,
    redo: window.projectStorage.getProjectStorageDiagnostics().redoEntries,
    id: window.currentProjectId,
    scenario: window.dataStore.getCurrentScenario(),
    tags: window.dataStore.getCables().map(cable => cable.tag),
  }));
  expect(after).toEqual({ ...before, id: 'before-sample', scenario: 'future', tags: ['KEEP'] });
});
}

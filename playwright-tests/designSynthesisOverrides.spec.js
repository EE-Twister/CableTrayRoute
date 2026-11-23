import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

test('accepts a manual panel location, saves regenerated circuits, and removes the override', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  await page.locator('#synthesis-generate').click();
  await page.locator('#synthesis-apply').click();
  await expect(page.getByRole('heading', { name: 'Create New Project' })).toBeVisible();
  await page.locator('input[id^="project-name-"]').fill('Panel Override Acceptance');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.locator('[data-template-id="blank"]').click();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Use Template', exact: true }).click()]);
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated');
  await page.locator('#synthesis-apply').click();
  await expect(page).toHaveURL(/cableschedule\.html/);
  await page.waitForFunction(() => typeof window.dataStore?.getPanels === 'function');
  await page.evaluate(() => {
    const panels = window.dataStore.getPanels();
    if (!panels.some(row => row._designSynthesis?.identity === 'DP-01')) throw new Error('Missing generated panel');
    window.dataStore.setPanels(panels.map(row => row._designSynthesis?.identity === 'DP-01' ? { ...row, x: 120, y: 50, z: 0 } : row));
    if (!window.dataStore.saveProject(window.currentProjectId)) throw new Error('Manual location save failed');
  });
  const synthesisUrl = `${server.url('designsynthesis.html')}#Panel%20Override%20Acceptance`;
  await page.goto(synthesisUrl);
  await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  await page.locator('#synthesis-generate').click();
  await page.locator('#synthesis-apply').click();
  await expect(page.locator('#synthesis-status')).toContainText(/blocked/i);
  await page.locator('[data-panel-location-candidate="DP-01"]').click();
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  await expect(page.locator('#synthesis-download-json')).toBeDisabled();
  const row = page.locator('[data-panel-override-row="DP-01"]');
  await expect(row.locator('[data-panel-override-field="x"]')).toHaveValue('120');
  await expect(row.locator('[data-panel-override-field="y"]')).toHaveValue('50');
  await page.locator('#synthesis-generate').click();
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  const proposal = JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
  expect(proposal.status).toBe('proposal');
  expect(proposal.inputs.original.overrides.panelLocations['DP-01']).toMatchObject({ x: 120, y: 50, z: 0 });
  expect(proposal.cables.find(cable => cable.id === 'F-DP-01').length).toBe(170);
  await row.screenshot({ path: testInfo.outputPath('accepted-panel-location.png') });
  await page.locator('#synthesis-apply').click();
  await expect(page).toHaveURL(/cableschedule\.html/);
  await page.reload();
  await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(34);
  const saved = await page.evaluate(() => ({
    panel: window.dataStore.getPanels().find(row => row._designSynthesis?.identity === 'DP-01'),
    equipment: window.dataStore.getEquipment().find(row => row.tag === 'DP-01'),
    cable: window.dataStore.getCables().find(row => row.tag === 'F-DP-01'),
    sheets: window.dataStore.getOneLine().sheets,
  }));
  expect(saved.panel).toMatchObject({ x: 120, y: 50, z: 0 });
  expect(saved.equipment).toMatchObject({ x: 120, y: 50, z: 0 });
  expect(saved.cable.length).toBe(170);
  expect(saved.sheets).toHaveLength(1);
  expect(saved.sheets[0].components.find(row => row.id === 'DP-01').physical).toMatchObject({ x: 120, y: 50, z: 0 });
  await page.goto(synthesisUrl);
  await expect(row.locator('[data-panel-override-field="x"]')).toHaveValue('120');
  await row.locator('[data-panel-override-remove]').click();
  await page.locator('#synthesis-generate').click();
  await page.locator('#synthesis-apply').click();
  await expect(page).toHaveURL(/cableschedule\.html/);
  await page.waitForFunction(() => typeof window.dataStore?.getCables === 'function');
  expect(await page.evaluate(() => window.dataStore.getCables().find(row => row.tag === 'F-DP-01').length)).toBe(60);
});

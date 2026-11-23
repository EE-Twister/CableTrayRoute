import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;

test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

async function downloadText(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await pending;
  return fs.readFile(await download.path(), 'utf8');
}

async function downloadJson(page, selector) {
  return JSON.parse(await downloadText(page, selector));
}

test('capacity-aware routing moves later branches to an allowed bypass and reports the reason', async ({ page }, testInfo) => {
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Load tray congestion sample', exact: true }).click();
  await expect(page.locator('#synthesis-status')).toContainText('Synthetic shared-tray capacity sample loaded');
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated; Apply will create or open a named project and regenerate for 27 equipment item(s).');

  const proposal = await downloadJson(page, '#synthesis-download-json');
  expect(proposal.status).toBe('proposal');
  expect(proposal.cableCatalogSource.sha256).toBe('d01fb6ec8ab42ea8b6144ea982ccf23ee662190c818621ea9d1d16f7735d3341');
  expect(proposal.checks.find(item => item.id === 'racewayCapacity').status).toBe('pass');
  expect(proposal.checks.find(item => item.id === 'loadFlow').status).toBe('pass');
  const branches = proposal.routeResults.batchResults.filter(route => route.cable?.startsWith('C-'));
  expect(branches).toHaveLength(25);
  expect(branches.filter(route => route.route_segments.some(segment => segment.tray_id === 'SHORT'))).toHaveLength(12);
  expect(branches.filter(route => route.route_segments.some(segment => segment.tray_id === 'BYPASS-A'))).toHaveLength(13);
  const capacityChoice = proposal.cables.find(cable => cable.routingDecision?.shortestRejectedReason === 'shared-tray-capacity');
  expect(capacityChoice).toBeTruthy();
  expect(capacityChoice.routingDecision.capacityExcludedEdgeIds).toContain('SHORT');

  const visibleRouting = page.locator('.synthesis-routing-table tbody tr');
  await expect(visibleRouting.filter({ hasText: 'shared-tray-capacity' })).toHaveCount(13);
  await expect(page.locator('#synthesis-output')).toContainText('Southwire stock 606939');
  const report = (await downloadText(page, '#synthesis-download-report')).split('Complete JSON payload:')[0];
  expect(report).toContain('shared-tray-capacity');
  expect(report).toContain('BYPASS-A');
  const selectedCable = proposal.cables.find(cable => cable.cableStockId === '606939');
  expect(selectedCable).toBeTruthy();
  expect(report).toContain(`stock 606939 · Southwire SPEC45301 rev1.000.008 · ${selectedCable.cableCatalogFingerprint}`);
  expect(report).toContain('d01fb6ec8ab42ea8b6144ea982ccf23ee662190c818621ea9d1d16f7735d3341');
  expect(report).toContain('stable-order greedy tray reservations and no backtracking');
  await fs.writeFile(testInfo.outputPath('capacity-routing-report.txt'), report);
  const routingTable = page.locator('.synthesis-routing-table');
  await routingTable.scrollIntoViewIfNeeded();
  await routingTable.screenshot({ path: testInfo.outputPath('capacity-routing-table.png') });

  const projectName = 'Capacity Routing Acceptance';
  await page.locator('#synthesis-apply').click();
  await expect(page.getByRole('heading', { name: 'Create New Project' })).toBeVisible();
  await page.getByRole('dialog').locator('input[name="projectName"]').fill(projectName);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a Project Template' })).toBeVisible();
  await page.locator('[data-template-id="blank"]').click();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Use Template', exact: true }).click()]);
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated for 27 equipment item(s).');
  await page.locator('#synthesis-apply').click();
  await expect(page).toHaveURL(/cableschedule\.html/);
  await page.reload();
  await page.waitForFunction(() => window.__ctrProjectReady === true && Boolean(window.dataStore));
  const persisted = await page.evaluate(() => ({
    cables: window.dataStore.getCables(),
    oneLine: window.dataStore.getOneLine(),
    routes: window.dataStore.getItem('latestRouteResults', {}),
  }));
  const persistedBranches = persisted.cables.filter(cable => cable.loadId);
  expect(persistedBranches).toHaveLength(25);
  const persistedBypassIds = persistedBranches.filter(cable => cable.routingDecision?.selectedPath?.includes('BYPASS-A')).map(cable => cable.id);
  expect(persistedBypassIds).toHaveLength(13);
  expect(await page.evaluate(() => window.dataStore.getItem('designSynthesisCableCatalogSource', null)?.sha256)).toBe(proposal.cableCatalogSource.sha256);
  for (const id of persistedBypassIds) {
    const cable = persisted.cables.find(row => row.id === id);
    const original = proposal.cables.find(row => row.tag === cable.tag);
    const route = persisted.routes.batchResults.find(row => row.cable === cable.tag || row.cable === cable.id);
    const connection = persisted.oneLine.sheets.flatMap(sheet => sheet.connections).find(row => row.cableRef === cable.id || row.cableRef === cable.tag);
    expect(cable.conductor_size).toBe(original.conductor_size);
    expect(cable.routingDecision.capacityExcludedEdgeIds).toContain('SHORT');
    expect(cable.cableStockId).toBe(original.cableStockId);
    expect(cable.cableCatalogFingerprint).toBe(original.cableCatalogFingerprint);
    expect(route.routingDecision.capacityExcludedEdgeIds).toContain('SHORT');
    expect(route.route_segments.map(segment => segment.tray_id)).toEqual(['BYPASS-A', 'BYPASS-B']);
    expect(connection.cable.conductor_size).toBe(original.conductor_size);
    expect(connection.cable.lengthFt).toBe(original.lengthFt);
    expect(connection.cable.cableStockId).toBe(original.cableStockId);
    expect(connection.cable.cableCatalogFingerprint).toBe(original.cableCatalogFingerprint);
  }
});

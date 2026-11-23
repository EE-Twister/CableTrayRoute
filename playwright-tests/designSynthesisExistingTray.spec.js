import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

async function download(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  return fs.readFile(await (await pending).path(), 'utf8');
}

test('existing tray sample retains occupancy in routes, review, reports and reload while Apply is blocked', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(server.url('designsynthesis.html?e2e=1'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#synthesis-load-existing-tray-sample').click();
  await expect(page.locator('#synthesis-status')).toContainText('Synthetic existing-tray occupancy sample loaded');
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  await expect(page.locator('.synthesis-capacity-table')).toContainText('EXISTING-TRAY-01: 5 existing cable(s)');
  await expect(page.locator('#synthesis-output')).toContainText('Existing tray occupancy is screened');
  let proposal = JSON.parse(await download(page, '#synthesis-download-json'));
  expect(proposal.cables.filter(row => row.loadId && row.routingDecision.selectedPath.includes('SHORT'))).toHaveLength(7);
  expect(proposal.racewayEvaluations.find(row => row.racewayId === 'SHORT').cableCount).toBe(12);
  const report = await download(page, '#synthesis-download-report');
  expect(report).toContain('existing tray EXISTING-TRAY-01, 5 existing cable(s)');
  expect(report).toContain('reuse not approved');
  await page.reload();
  const graphEditor = page.locator('#synthesis-corridors');
  const graph = JSON.parse(await graphEditor.inputValue());
  expect(graph.edges[0].existingTray.cables[0].quantity).toBe(5);
  graph.edges[0].existingTray.cables[0].quantity = 6;
  await graphEditor.fill(JSON.stringify(graph));
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  proposal = JSON.parse(await download(page, '#synthesis-download-json'));
  expect(proposal.cables.filter(row => row.loadId && row.routingDecision.selectedPath.includes('SHORT'))).toHaveLength(6);
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
});

import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

async function sample(count, sameAnchors = false) {
  const input = JSON.parse(await fs.readFile(path.join(root, 'samples/design-synthesis-industrial.json'), 'utf8'));
  const base = input.equipment;
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...base[index % base.length], id: `L-${index}`, tag: `L-${index}`, kw: 25 / count, powerFactor: 0.9, voltage: 480, phases: 3, x: 100, y: 0, z: 0 }));
  Object.assign(input.supply, { id: 'S', x: 0, y: 0, z: 0 });
  Object.assign(input.criteria, { maxEndpointAttachmentFt: 2.1, allowAlternateEndpointAttachments: true, maxLoadsPerPanel: 50, maxPanelLoadKva: 500, voltageDropLimitPct: 3, endpointInstallation: { method: 'dedicated-emt', maximumTradeSize: '1-1/2' } });
  input.corridors = sameAnchors ? {
    nodes: [{ id: 'A', x: 1, y: 0, z: 0 }, { id: 'C', x: 50, y: 70, z: 0 }, { id: 'X', x: 100, y: 0, z: 0 }],
    edges: [{ id: 'HOT', from: 'A', to: 'X', widthIn: 24, depthIn: 6, permitted: true, thermal: { ambientTempC: 60 } }, { id: 'AC', from: 'A', to: 'C', widthIn: 24, depthIn: 6, permitted: true }, { id: 'CX', from: 'C', to: 'X', widthIn: 24, depthIn: 6, permitted: true }],
  } : {
    nodes: [{ id: 'N0', x: 0, y: 0, z: 0 }, { id: 'A', x: 1, y: 0, z: 0 }, { id: 'B', x: 0, y: 2, z: 0 }, { id: 'C', x: 1, y: 1000, z: 0 }, { id: 'X', x: 100, y: 0, z: 0 }],
    edges: [{ id: 'AC', from: 'A', to: 'C', widthIn: 24, depthIn: 6, permitted: true }, { id: 'CX', from: 'C', to: 'X', widthIn: 24, depthIn: 6, permitted: true }, { id: 'BX', from: 'B', to: 'X', widthIn: 24, depthIn: 6, permitted: true }],
  };
  return input;
}

async function importAndGenerate(page, input) {
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#synthesis-import').setInputFiles({ name: 'endpoint-route.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  await expect(page.locator('#synthesis-status')).toContainText('Imported endpoint-route.json');
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated');
}

for (const count of [25, 50]) test(`${count} loads reject an alternative that cannot fit its endpoint conduit`, async ({ page }) => {
  test.setTimeout(120000);
  await importAndGenerate(page, await sample(count));
  await expect(page.locator('#synthesis-output')).toContainText('1 pair(s) failed endpoint installation');
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  const proposal = JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
  const feeder = proposal.cables.find(row => !row.loadId);
  expect(feeder.conductor_size).toBe('#4 AWG');
  expect(feeder.routingDecision.alternateEndpointAttachments.sourceNode).toBe('B');
  expect(feeder.routingDecision.alternateEndpointAttachments.endpointRejectedPairs).toBe(1);
  expect(proposal.installationCoverage.find(row => row.cableId === feeder.id).segments.find(row => row.conduitId).tradeSize).toBe('1-1/2');
  await page.locator('#synthesis-apply').click();
  await expect(page.getByRole('heading', { name: 'Create New Project' })).toBeVisible();
  await page.getByRole('dialog').locator('input[name="projectName"]').fill(`Endpoint route ${count}`);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.locator('[data-template-id="blank"]').click();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Use Template', exact: true }).click()]);
  await expect(page.locator('#synthesis-apply')).toBeEnabled({ timeout: 60000 });
  await page.locator('#synthesis-apply').click();
  await page.waitForURL(/cableschedule\.html/);
  await page.waitForFunction(() => Boolean(window.dataStore));
  const getEvidence = () => page.evaluate(id => window.dataStore.getItem('latestRouteResults').batchResults.find(row => row.cable === id)?.routingDecision?.alternateEndpointAttachments, feeder.id);
  await expect.poll(async () => (await getEvidence())?.sourceNode).toBe('B');
  await page.reload();
  await page.waitForFunction(() => Boolean(window.dataStore));
  await expect.poll(async () => (await getEvidence())?.endpointRejectedPairs).toBe(1);
});

test('same-anchor conduit retry is visible in the report and cable CSV', async ({ page }) => {
  await importAndGenerate(page, await sample(25, true));
  await expect(page.locator('#synthesis-output')).toContainText('Endpoint conduit screening chose #4 AWG after rejecting 1/0 AWG');
  const reportPending = page.waitForEvent('download');
  await page.locator('#synthesis-download-report').click();
  expect(await fs.readFile(await (await reportPending).path(), 'utf8')).toContain('Endpoint conduit screening chose #4 AWG after rejecting 1/0 AWG');
  const csvPending = page.waitForEvent('download');
  await page.locator('#synthesis-download-cable-schedule').click();
  const parsed = Papa.parse(await fs.readFile(await (await csvPending).path(), 'utf8'), { header: true, skipEmptyLines: true });
  expect(parsed.errors).toEqual([]);
  expect(parsed.data.find(row => row['Cable ID'] === 'F-DP-01')['Endpoint conduit retry']).toContain('1/0 AWG to #4 AWG');
});

for (const count of [25, 50]) test(`${count} loads select the shorter feasible alternative and retain it after reload`, async ({ page }) => {
  test.setTimeout(120000);
  const input = await sample(count);
  input.criteria.endpointInstallation.maximumTradeSize = '2';
  await importAndGenerate(page, input);
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  const proposal = JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
  const feeder = proposal.cables.find(row => !row.loadId);
  expect(feeder.routingDecision.alternateEndpointAttachments.method).toBe('explicit-alternate-attachments-v2');
  expect(feeder.routingDecision.alternateEndpointAttachments.sourceNode).toBe('B');
  expect(feeder.routingDecision.selectedPath).toEqual(['BX']);
  expect(feeder.lengthFt).toBeCloseTo(2 + Math.hypot(100, 2), 8);
  await expect(page.locator('#synthesis-output')).toContainText('Alternative field connections: N0 → B (2 ft)');
  const reportPending = page.waitForEvent('download');
  await page.locator('#synthesis-download-report').click();
  expect(await fs.readFile(await (await reportPending).path(), 'utf8')).toContain('pair(s) skipped by route-length bound');
  await page.locator('#synthesis-apply').click();
  await expect(page.getByRole('heading', { name: 'Create New Project' })).toBeVisible();
  await page.getByRole('dialog').locator('input[name="projectName"]').fill(`Shortest endpoint ${count}`);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.locator('[data-template-id="blank"]').click();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Use Template', exact: true }).click()]);
  await expect(page.locator('#synthesis-apply')).toBeEnabled({ timeout: 60000 });
  await page.locator('#synthesis-apply').click();
  await page.waitForURL(/cableschedule\.html/);
  await page.waitForFunction(() => Boolean(window.dataStore));
  const read = () => page.evaluate(id => window.dataStore.getItem('latestRouteResults').batchResults.find(row => row.cable === id)?.routingDecision?.alternateEndpointAttachments, feeder.id);
  await expect.poll(async () => (await read())?.sourceNode).toBe('B');
  await page.reload();
  await page.waitForFunction(() => Boolean(window.dataStore));
  await expect.poll(async () => (await read())?.method).toBe('explicit-alternate-attachments-v2');
});

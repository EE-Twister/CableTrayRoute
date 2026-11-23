import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

for (const count of [25, 50]) test(`${count} loads retain recovered existing-tray screening routes while Apply stays blocked`, async ({ page }) => {
  const input = JSON.parse(await fs.readFile(path.join(root, 'samples/design-synthesis-tray-congestion.json'), 'utf8'));
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...input.equipment[0], id: `L-${String(index + 1).padStart(2, '0')}`, tag: `L-${String(index + 1).padStart(2, '0')}` }));
  input.equipment[count - 1].x = 10;
  input.corridors.nodes.push({ id: 'R', x: 10, y: 0, z: 0 });
  const tray = { trayId: 'EXISTING-01', construction: 'ladder', inventoryReference: 'Synthetic complete inventory', cables: [{ id: 'EXISTING-CABLE', use: 'power', conductorSize: '#8 AWG', conductorCount: 3, voltageRatingV: 600, outsideDiameterIn: 0.833, quantity: 5, reference: 'Synthetic cable dimensions' }] };
  input.corridors.edges = [{ id: 'SCARCE', from: 'N0', to: 'R', widthIn: 6, depthIn: 6, permitted: true, existingTray: tray }, { id: 'SHORT-END', from: 'R', to: 'N1', widthIn: 6, depthIn: 6, permitted: true, existingTray: { ...tray, trayId: 'EXISTING-02' } }, ...input.corridors.edges.filter(edge => edge.id.startsWith('BYPASS'))];
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#synthesis-import').setInputFiles({ name: 'existing-retry.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  await expect(page.locator('#synthesis-status')).toContainText('Imported existing-retry.json');
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  await expect(page.locator('#synthesis-output')).toContainText(`Capacity routing recovered after 1 trial(s); prioritized loads: L-${count}`);
  await expect(page.locator('#synthesis-output')).toContainText('Existing tray occupancy is screened, but project tray identity or referenced thermal and installation evidence is incomplete');
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  const proposal = JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
  expect(proposal.status).toBe('blocked');
  expect(proposal.cables.filter(cable => cable.loadId)).toHaveLength(count);
  expect(proposal.cables.find(cable => cable.loadId === `L-${count}`).routingDecision.selectedPath).toEqual(['SCARCE']);
  expect(proposal.checks.find(check => check.id === 'racewayCapacity').status).toBe('pass');
  expect(proposal.issues.some(issue => issue.code === 'EXISTING_TRAY_RECONCILIATION_UNRESOLVED')).toBe(true);
  await page.reload();
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-output')).toContainText(`Capacity routing recovered after 1 trial(s); prioritized loads: L-${count}`);
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
});

for (const mode of ['single-panel', 'cross-panel', 'feeder', 'transformer-primary']) test(`capacity retry recovers the constrained ${mode} route and explains the change in the report`, async ({ page }, testInfo) => {
  const input = JSON.parse(await fs.readFile(path.join(root, 'samples/design-synthesis-tray-congestion.json'), 'utf8'));
  input.equipment[24].x = 10;
  input.corridors.nodes.push({ id: 'R', x: 10, y: 0, z: 0 });
  input.corridors.edges = [{ id: 'SCARCE', from: 'N0', to: 'R', widthIn: 6, depthIn: 6, permitted: true }, { id: 'SHORT-END', from: 'R', to: 'N1', widthIn: 6, depthIn: 6, permitted: true }, ...input.corridors.edges.filter(edge => edge.id.startsWith('BYPASS'))];
  if (mode === 'cross-panel') {
    input.criteria.maxLoadsPerPanel = 12;
    input.overrides.panelLocations = Object.fromEntries(['DP-01', 'DP-02', 'DP-03'].map(id => [id, { x: 0, y: 0, z: 0 }]));
  }
  if (mode === 'feeder') {
    input.criteria.maxLoadsPerPanel = 24;
    input.overrides.panelLocations = { 'DP-01': { x: 0, y: 0, z: 0 }, 'DP-02': { x: 10, y: 0, z: 0 } };
  }
  if (mode === 'transformer-primary') {
    input.equipment = input.equipment.slice(0, 23);
    for (let index = 1; index <= 2; index += 1) input.equipment.push({ ...input.equipment[0], id: `T-${index}`, tag: `T-${index}`, voltage: 208, kw: 0.5, x: 10 });
    input.overrides.panelLocations = { 'DP-01': { x: 0, y: 0, z: 0 }, 'DP-02': { x: 10, y: 0, z: 0 } };
  }
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#synthesis-import').setInputFiles({ name: 'capacity-retry.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  await expect(page.locator('#synthesis-status')).toContainText('Imported capacity-retry.json');
  await page.locator('#synthesis-generate').click();
  const prioritizedLoads = ['feeder', 'transformer-primary'].includes(mode) ? 'none' : 'L-25';
  await expect(page.locator('#synthesis-output')).toContainText(`Capacity routing recovered after 1 trial(s); prioritized loads: ${prioritizedLoads}`);
  await expect(page.locator('#synthesis-output')).toContainText('no global optimization is claimed');
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-report').click();
  const report = await fs.readFile(await (await pending).path(), 'utf8');
  expect(report).toContain(`Capacity routing recovered after 1 bounded trial(s); prioritized loads: ${prioritizedLoads}`);
  expect(report).toContain(`${mode === 'transformer-primary' ? 'F-TX-S-480-208-3P-PRI' : mode === 'feeder' ? 'F-DP-02' : 'C-L-25'}: chosen path SCARCE`);
  if (mode === 'transformer-primary') {
    await expect(page.locator('#synthesis-output')).toContainText('Prioritized transformer primary: F-TX-S-480-208-3P-PRI');
    expect(report).toContain('Prioritized transformer primary: F-TX-S-480-208-3P-PRI');
    const jsonPending = page.waitForEvent('download');
    await page.locator('#synthesis-download-json').click();
    const proposal = JSON.parse(await fs.readFile(await (await jsonPending).path(), 'utf8'));
    expect(proposal.routingRetry.prioritizedTransformerPrimaryId).toBe('F-TX-S-480-208-3P-PRI');
    expect(proposal.cables.find(cable => cable.transformerSide === 'primary').routingDecision.selectedPath).toEqual(['SCARCE']);
    await page.reload();
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-output')).toContainText('Prioritized transformer primary: F-TX-S-480-208-3P-PRI');
  }
  if (mode === 'feeder') {
    await expect(page.locator('#synthesis-output')).toContainText('Prioritized panel feeders: DP-02');
    expect(report).toContain('Prioritized panel feeders: DP-02');
    const jsonPending = page.waitForEvent('download');
    await page.locator('#synthesis-download-json').click();
    const proposal = JSON.parse(await fs.readFile(await (await jsonPending).path(), 'utf8'));
    expect(proposal.routingRetry.prioritizedFeederPanelIds).toEqual(['DP-02']);
    expect(proposal.cables.find(cable => cable.id === 'F-DP-02').routingDecision.selectedPath).toEqual(['SCARCE']);
    await page.reload();
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-output')).toContainText('Prioritized panel feeders: DP-02');
  }
  if (mode === 'cross-panel') {
    await expect(page.locator('#synthesis-output')).toContainText('Panel reservation priority: DP-03');
    await page.getByText('Panel reservation priority: DP-03').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('cross-panel-routing-review.png') });
    expect(report).toContain('Panel reservation priority: DP-03');
    const jsonPending = page.waitForEvent('download');
    await page.locator('#synthesis-download-json').click();
    const proposal = JSON.parse(await fs.readFile(await (await jsonPending).path(), 'utf8'));
    expect(proposal.routingRetry.prioritizedPanelIds).toEqual(['DP-03']);
    expect(proposal.panels.map(panel => panel.id)).toEqual(['DP-01', 'DP-02', 'DP-03']);
    expect(proposal.cables.filter(cable => cable.loadId)).toHaveLength(25);
    expect(proposal.cables.find(cable => cable.loadId === 'L-25').from).toBe('DP-03');
    await page.reload();
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-output')).toContainText('Panel reservation priority: DP-03');
  }
});

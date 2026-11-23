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

async function drawingOverflow(drawing) {
  return drawing.evaluate(svg => {
    const cableErrors = [...svg.querySelectorAll('g[data-cable-id]')].flatMap(group => {
      const childX = Number(group.querySelector('path')?.getAttribute('d')?.match(/H\s+([\d.]+)$/)?.[1]);
      return [...group.querySelectorAll('text')].filter(text => {
        const box = text.getBBox();
        return !Number.isFinite(childX) || box.x + box.width > childX - 2 || box.y < 70;
      }).map(text => `${group.getAttribute('data-cable-id')}: ${text.textContent}`);
    });
    const nodeErrors = [...svg.querySelectorAll('g[data-node-id]')].flatMap(group => {
      const rectangle = group.querySelector('rect').getBBox();
      return [...group.querySelectorAll('text')].filter(text => {
        const box = text.getBBox();
        return box.x < rectangle.x || box.x + box.width > rectangle.x + rectangle.width || box.y < rectangle.y || box.y + box.height > rectangle.y + rectangle.height;
      }).map(text => `${group.getAttribute('data-node-id')}: ${text.textContent}`);
    });
    const labels = [...svg.querySelectorAll('g[data-cable-id] text')].map(text => ({ id: text.parentElement.getAttribute('data-cable-id'), text: text.textContent, box: text.getBBox() }));
    const collisions = [];
    for (let left = 0; left < labels.length; left++) for (let right = left + 1; right < labels.length; right++) {
      const a = labels[left]; const b = labels[right];
      if (a.id !== b.id && a.box.x < b.box.x + b.box.width && b.box.x < a.box.x + a.box.width && a.box.y < b.box.y + b.box.height && b.box.y < a.box.y + a.box.height) collisions.push(`${a.id} / ${b.id}: ${a.text} / ${b.text}`);
    }
    return [...cableErrors, ...nodeErrors, ...collisions];
  });
}

test('blocked motor proposal shows and exports its preliminary one-line, then invalidates it on edits', async ({ page }, testInfo) => {
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Load motor starter sample', exact: true }).click();
  await expect(page.locator('#synthesis-status')).toContainText('Synthetic 25-load motor starter sample loaded');
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  const drawing = page.locator('#synthesis-one-line-preview svg');
  await expect(drawing).toBeVisible();
  await expect(drawing).toContainText('PRELIMINARY ONE-LINE — BLOCKED');
  await expect(drawing).toContainText('Motor protection unresolved');
  expect(await drawing.locator('[data-node-id]').count()).toBeGreaterThanOrEqual(26);
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  const jsonPending = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  const proposal = JSON.parse(await fs.readFile(await (await jsonPending).path(), 'utf8'));
  const motorCable = proposal.cables.find(row => row.motor);
  const feeder = proposal.cables.find(row => !row.motor && row.protectiveDevice?.catalogNumber);
  const starter = proposal.motorStarterCandidates.cases.find(row => row.motorId === motorCable.loadId).candidate;
  const routeReview = page.locator('#synthesis-route-review');
  await routeReview.getByLabel('Inspect proposed circuit route').selectOption(motorCable.id);
  await expect(routeReview).toContainText(`Route ${motorCable.id}: routed`);
  expect(await routeReview.locator('[data-route-cable]').count()).toBeGreaterThan(0);
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  const schedulePending = page.waitForEvent('download');
  await page.locator('#synthesis-download-cable-schedule').click();
  const csv = await fs.readFile(await (await schedulePending).path(), 'utf8');
  const schedule = Papa.parse(csv, { header: true, skipEmptyLines: true });
  expect(schedule.errors).toEqual([]);
  expect(schedule.data).toHaveLength(proposal.cables.length);
  const motorRow = schedule.data.find(row => row['Cable ID'] === motorCable.id);
  expect(motorRow['Proposal status']).toBe('blocked');
  expect(motorRow['Review basis']).toBe('PRELIMINARY SCREENING - NOT APPROVED');
  expect(motorRow['Motor contactor candidate']).toBe(starter.contactor.catalogNumber);
  expect(motorRow['Motor overload candidate']).toBe(starter.overloadRelay.catalogNumber);
  expect(motorRow['Motor short-circuit device candidate']).toBe(starter.shortCircuitController.catalogNumber);
  expect(motorRow['Protection review status']).toContain('unresolved');
  const panelPending = page.waitForEvent('download');
  await page.locator('#synthesis-download-panel-schedule').click();
  const panelCsv = await fs.readFile(await (await panelPending).path(), 'utf8');
  const panelSchedule = Papa.parse(panelCsv, { header: true, skipEmptyLines: true });
  expect(panelSchedule.errors).toEqual([]);
  expect(panelSchedule.data).toHaveLength(proposal.panels.reduce((sum, panel) => sum + panel.circuitCount, 0));
  const motorLoad = proposal.loads.find(row => row.id === motorCable.loadId);
  const motorSlots = panelSchedule.data.filter(row => row['Load ID'] === motorLoad.id);
  expect(motorSlots).toHaveLength(motorLoad.breakerPoles);
  expect(motorSlots.every(row => row['Panel ID'] === motorLoad.panelRef && row['Cable ID'] === motorCable.id)).toBe(true);
  expect(motorSlots.every(row => row['Proposal status'] === 'blocked' && row['Protection review status'].includes('unresolved'))).toBe(true);
  await expect(page.locator('#synthesis-raceway-schedule-status')).toContainText('available for preliminary review');
  const racewayPending = page.waitForEvent('download');
  await page.locator('#synthesis-download-raceway-schedule').click();
  const racewayDownload = await racewayPending;
  expect(racewayDownload.suggestedFilename()).toBe('preliminary-raceway-schedule.csv');
  const racewaySchedule = Papa.parse(await fs.readFile(await racewayDownload.path(), 'utf8'), { header: true, skipEmptyLines: true });
  expect(racewaySchedule.errors).toEqual([]);
  expect(racewaySchedule.data).toHaveLength(proposal.trays.length + proposal.conduits.length);
  for (const route of proposal.routeResults.batchResults) for (const segment of route.route_segments) {
    const raceway = racewaySchedule.data.find(row => row['Raceway ID'] === segment.raceway_id);
    expect(JSON.parse(raceway['Assigned generated cable IDs'])).toContain(route.cable);
    expect(raceway['Proposal status']).toBe('blocked');
    expect(raceway['Review basis']).toBe('PRELIMINARY SCREENING - NOT APPROVED');
  }
  const textFor = async id => (await drawing.locator(`[data-cable-id="${id}"] text`).allTextContents()).join(' ');
  const motorText = await textFor(motorCable.id);
  const feederText = await textFor(feeder.id);
  expect(motorText).toContain(starter.contactor.catalogNumber);
  expect(motorText).toContain(starter.overloadRelay.catalogNumber);
  expect(motorText).toContain(starter.shortCircuitController.catalogNumber);
  expect(feederText).toContain(feeder.protectiveDevice.catalogNumber);
  expect(feederText).toContain(`${feeder.protectiveDevice.interruptingRatingKA} kA at ${feeder.protectiveDevice.interruptingRatingVoltageVac} V`);
  expect(motorText).not.toContain('…');
  expect(await drawingOverflow(drawing)).toEqual([]);
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-oneline').click();
  const download = await pending;
  const svg = await fs.readFile(await download.path(), 'utf8');
  expect(svg).toContain('PRELIMINARY ONE-LINE — BLOCKED');
  expect(svg).toContain('Motor protection unresolved');
  expect(svg).toContain(starter.contactor.catalogNumber);
  expect(svg).toContain(feeder.protectiveDevice.catalogNumber);
  await drawing.locator(`[data-cable-id="${motorCable.id}"] text`).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('one-line-detail.png') });
  await drawing.screenshot({ path: testInfo.outputPath('preliminary-one-line.png') });
  await page.getByRole('spinbutton', { name: 'Motor nameplate horsepower 1', exact: true }).fill('15');
  await page.getByRole('spinbutton', { name: 'Motor nameplate horsepower 1', exact: true }).press('Tab');
  await expect(page.locator('#synthesis-download-oneline')).toBeDisabled();
  await expect(page.locator('#synthesis-download-cable-schedule')).toBeDisabled();
  await expect(page.locator('#synthesis-download-panel-schedule')).toBeDisabled();
  await expect(page.locator('#synthesis-download-raceway-schedule')).toBeDisabled();
  await expect(drawing).toHaveCount(0);
});

test('50-load drawing keeps full cable and protective-device identities in its SVG export', async ({ page }) => {
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Load 30-load industrial sample', exact: true }).click();
  await page.getByText('Advanced equipment JSON / CSV-ready structure').click();
  const editor = page.locator('#synthesis-equipment');
  const original = JSON.parse(await editor.inputValue());
  const rows = Array.from({ length: 50 }, (_, index) => ({ ...structuredClone(original[index % original.length]), id: `LONG-EQUIPMENT-IDENTIFIER-${index}`, tag: `LONG-EQUIPMENT-IDENTIFIER-${index}`, kw: 1 }));
  await editor.fill(JSON.stringify(rows));
  await page.locator('#synthesis-generate').click();
  const drawing = page.locator('#synthesis-one-line-preview svg');
  await expect(drawing).toBeVisible();
  const jsonPending = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  const proposal = JSON.parse(await fs.readFile(await (await jsonPending).path(), 'utf8'));
  expect(proposal.loads).toHaveLength(50);
  const feeder = proposal.cables.find(row => row.protectiveDevice?.catalogNumber);
  const visible = (await drawing.locator(`[data-cable-id="${feeder.id}"] text`).allTextContents()).join(' ');
  expect(visible).toContain(feeder.protectiveDevice.catalogNumber);
  expect(visible).toContain('Cable length:');
  const node = drawing.locator('[data-node-id="LONG-EQUIPMENT-IDENTIFIER-0"]');
  const tag = (await node.locator('text').allTextContents()).join('');
  expect(tag).toContain('LONG-EQUIPMENT-IDENTIFIER-0');
  expect(await drawingOverflow(drawing)).toEqual([]);
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-oneline').click();
  const svg = await fs.readFile(await (await pending).path(), 'utf8');
  expect(svg).toContain(feeder.protectiveDevice.catalogNumber);
  expect(svg).toContain('data-node-id="LONG-EQUIPMENT-IDENTIFIER-0"');
});

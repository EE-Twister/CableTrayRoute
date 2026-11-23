import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './staticServer.helper.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

async function mixedInput(count = 25) {
  const input = JSON.parse(await fs.readFile(path.join(root, 'samples/design-synthesis-industrial.json'), 'utf8'));
  const original = input.equipment;
  input.equipment = Array.from({ length: count }, (_, index) => ({
    ...original[index % original.length], id: `MV-${index + 1}`, tag: `MV-${index + 1}`,
    voltage: index < count * 0.8 ? 208 : 480, kw: index < count * 0.8 ? 1 : 3,
    powerFactor: 0.9, phases: 3,
  }));
  return input;
}

async function downloadBytes(page, buttonId) {
  const pending = page.waitForEvent('download');
  await page.locator(buttonId).click();
  const download = await pending;
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function importGenerate(page, input) {
  await page.locator('#synthesis-import').setInputFiles({ name: 'mixed-voltage.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  await page.locator('#synthesis-generate').click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
});

test('mixed-voltage equipment generates, saves, studies and regenerates one connected named project', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const input = await mixedInput();
  // The independent Node oracle keeps the harder 1 kW case, which needs
  // electrical feasibility to choose 75 kVA. Here exercise a real 30→75
  // catalog change through the saved-project regeneration workflow.
  for (const load of input.equipment) if (load.voltage === 208) load.kw = 0.5;
  await importGenerate(page, input);
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated');
  const proposal = JSON.parse((await downloadBytes(page, '#synthesis-download-json')).toString());
  expect(proposal.loads).toHaveLength(25);
  expect(proposal.transformer.catalogNumber).toBe('EXN30T3HCU');
  expect(proposal.transformer.secondaryMainDevice).toBeTruthy();
  const report = (await downloadBytes(page, '#synthesis-download-report')).toString().split('Complete JSON payload:')[0];
  expect(report).toContain('EXN30T3HCU');
  expect(report).toMatch(/480/);
  expect(report).toMatch(/208/);
  expect(report).toMatch(/ground.fault.*(not|unevaluated)|not.*ground.fault/i);
  await fs.writeFile(testInfo.outputPath('mixed-voltage-report.txt'), report);
  await page.screenshot({ path: testInfo.outputPath('mixed-voltage-proposal.png'), fullPage: true });

  await page.locator('#synthesis-apply').click();
  await expect(page.getByRole('heading', { name: 'Create New Project' })).toBeVisible();
  await page.getByRole('dialog').locator('input[name="projectName"]').fill('Mixed Voltage Acceptance');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a Project Template' })).toBeVisible();
  await page.locator('[data-template-id="blank"]').click();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Use Template', exact: true }).click()]);
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated');
  await page.locator('#synthesis-apply').click();
  await expect(page).toHaveURL(/cableschedule\.html/);
  await page.reload();
  const persisted = await page.evaluate(() => ({ equipment: window.dataStore.getEquipment(), cables: window.dataStore.getCables(), oneLine: window.dataStore.getOneLine() }));
  expect(persisted.equipment.filter(row => row.type === 'transformer')).toHaveLength(1);
  expect(persisted.cables).toHaveLength(proposal.cables.length);
  expect(persisted.oneLine.sheets.flatMap(sheet => sheet.components).filter(row => row.type === 'transformer')).toHaveLength(1);

  await page.goto(`${server.url('loadFlow.html')}#Mixed%20Voltage%20Acceptance`);
  await page.locator('input[name="baseMVA"]').fill('1');
  await page.locator('#loadflow-form button[type="submit"]').click();
  await expect(page.locator('#loadflow-output')).toContainText('Bus Voltages');
  await expect(page.locator('#loadflow-output')).toContainText(/magnitude.only/i);
  const study = await page.evaluate(() => window.dataStore.getStudies().loadFlow);
  expect(study.converged).toBe(true);
  expect(study.lines).toHaveLength(proposal.cables.length + 1);
  expect(study.summary.totalLoadKW).toBeCloseTo(25, 6);
  expect(study.losses.P).toBeGreaterThan(0.068);
  const transformerLine = study.lines.find(row => row.id === proposal.transformer.id);
  expect(transformerLine.toCurrentA).toBeGreaterThan(transformerLine.fromCurrentA * 2);
  await page.locator('#loadflow-output').screenshot({ path: testInfo.outputPath('mixed-voltage-load-flow.png') });
  const pdfBytes = await downloadBytes(page, '#export-loadflow-btn');
  await fs.writeFile(testInfo.outputPath('mixed-voltage-load-flow.pdf'), pdfBytes);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
  let pdfText = '';
  for (let index = 1; index <= pdf.numPages; index += 1) {
    pdfText += (await (await pdf.getPage(index)).getTextContent()).items.map(item => item.str).join(' ');
  }
  const normalizedPdfText = pdfText.replace(/\s+/g, ' ');
  expect(normalizedPdfText).toContain(`From ${transformerLine.fromCurrentA.toFixed(1)} A / To ${transformerLine.toCurrentA.toFixed(1)} A`);
  expect(normalizedPdfText).toMatch(/magnitude.only/i);
  expect(normalizedPdfText).toMatch(/magnetizing/i);
  await pdf.destroy();

  await page.goto(`${server.url('designsynthesis.html')}#Mixed%20Voltage%20Acceptance`);
  for (const load of input.equipment) if (load.voltage === 208) load.kw = 2;
  await importGenerate(page, input);
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated');
  const revised = JSON.parse((await downloadBytes(page, '#synthesis-download-json')).toString());
  expect(revised.transformer.catalogNumber).toBe('EXN75T3HCU');
  expect(revised.loads.reduce((sum, load) => sum + load.kw, 0)).toBe(55);
  expect(revised.studyValidation.status).toBe('pass');
  expect(revised.studyValidation.final.minimumVoltagePu).toBeGreaterThanOrEqual(0.97);
  expect(revised.transformer.id).toBe(proposal.transformer.id);
  expect(revised.transformer.primaryBusId).toBe(proposal.transformer.primaryBusId);
  expect(revised.transformer.secondaryBusId).toBe(proposal.transformer.secondaryBusId);
  await page.locator('#synthesis-apply').click();
  await expect(page).toHaveURL(/cableschedule\.html/);
  await page.reload();
  const transformers = await page.evaluate(() => window.dataStore.getEquipment().filter(row => row.type === 'transformer'));
  expect(transformers).toHaveLength(1);
  expect(transformers[0].catalogNumber).toBe('EXN75T3HCU');
});

test('50 mixed loads remain accounted for and unsupported voltage cannot be silently omitted', async ({ page }) => {
  const input = await mixedInput(50);
  await importGenerate(page, input);
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated');
  const proposal = JSON.parse((await downloadBytes(page, '#synthesis-download-json')).toString());
  expect(proposal.loads).toHaveLength(50);
  expect(proposal.transformer.catalogNumber).toBe('EXN150T3HCU');
  expect(proposal.loadDispositions).toHaveLength(50);
  input.equipment[0].voltage = 120;
  await page.locator('#synthesis-import').setInputFiles({ name: 'unsupported-voltage.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  await importGenerate(page, input);
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  await expect(page.locator('#synthesis-load-dispositions tbody tr')).toHaveCount(50);
  await expect(page.locator('#synthesis-load-dispositions tbody tr').first()).not.toContainText('accepted');
});

import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { distributionPartitionFixture } from '../tests/helpers/distributionPartitionFixture.mjs';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

test('on-demand evidence follows regeneration and supports keyboard disclosure', async ({ page }) => {
  await page.goto(server.url('designsynthesis.html?e2e=1'));
  await expect(page.locator('#synthesis-generate')).toBeEnabled();
  const generateAndRead = async () => {
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-download-json')).toBeEnabled();
    const pending = page.waitForEvent('download');
    await page.locator('#synthesis-download-json').click();
    return JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
  };
  const evidence = () => page.locator('#synthesis-output details[data-proposal-evidence]').filter({ has: page.locator('summary', { hasText: 'One-line and route summary' }) });
  const check = async proposal => {
    const detail = evidence();
    await expect(detail.locator(':scope > pre')).toHaveText('');
    await detail.locator('summary').focus();
    await detail.locator('summary').press('Enter');
    await expect(detail).toHaveAttribute('open', '');
    await expect(detail.locator(':scope > pre')).not.toHaveText('');
    expect(JSON.parse(await detail.locator(':scope > pre').textContent())).toEqual({ oneLine: proposal.oneLine, routeResults: proposal.routeResults, decisions: proposal.decisions });
  };
  const first = await generateAndRead();
  await check(first);
  const capacity = page.locator('[data-synthesis-control="supply.capacityKva"]');
  await capacity.fill('1500');
  await capacity.press('Tab');
  await expect(page.locator('#synthesis-output')).toContainText('No current proposal');
  const second = await generateAndRead();
  expect(second.inputs.original.supply.capacityKva).toBe(1500);
  await check(second);
});

test('50-motor evidence opens on demand and stays complete in downloads', async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const input = distributionPartitionFixture(50);
  const marker = '<img src=x onerror=alert(1)> source';
  input.faultEvolution.profiles[0].source.reference = marker;
  await page.goto(server.url('designsynthesis.html?e2e=1'));
  await expect(page.locator('#synthesis-generate')).toBeEnabled();
  await page.locator('#synthesis-import').setInputFiles({ name: 'large-motor.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  await expect(page.locator('#synthesis-status')).toContainText('Imported large-motor.json');
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-distribution-partition-review')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  const details = page.locator('#synthesis-fault-evolution-review details[data-proposal-evidence]').filter({ has: page.locator('summary', { hasText: 'Complete fault-evolution input and validation JSON' }) });
  const pre = details.locator(':scope > pre');
  await expect(details).toHaveCount(1);
  await expect(pre).toHaveText('');
  const initialSize = await page.locator('#synthesis-output').evaluate(element => element.textContent.length);
  expect(initialSize).toBeLessThan(5000000);
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  const proposal = JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
  const histories = proposal.faultEvolutionValidation.deviceHistories;
  const historyReview = page.locator('#synthesis-fault-evolution-review');
  const pageSelect = historyReview.locator('[data-history-page-select]');
  const historyRows = historyReview.locator('[data-history-page-body] > tr');
  expect(histories.length).toBeGreaterThan(50);
  await expect(historyRows).toHaveCount(50);
  await expect(historyReview.locator('[data-history-page-status]')).toContainText(`of ${histories.length}`);
  const lastPage = Math.ceil(histories.length / 50) - 1;
  await pageSelect.selectOption(String(lastPage));
  await expect(historyRows).toHaveCount(histories.length - lastPage * 50);
  const last = historyRows.last();
  await last.locator('details > summary').first().click();
  const exact = last.locator('details[data-proposal-evidence]');
  await exact.locator('summary').click();
  await expect(exact.locator(':scope > pre')).not.toHaveText('');
  expect(JSON.parse(await exact.locator(':scope > pre').textContent())).toEqual(histories.at(-1));
  const seen = await pageSelect.evaluate(select => {
    const body = document.querySelector('[data-history-page-body]');
    const rows = [];
    for (const option of select.options) {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      rows.push(...Array.from(body.rows, row => [row.cells[0].textContent, row.cells[1].textContent]));
    }
    return rows;
  });
  expect(seen).toEqual(histories.map(history => [
    history.placementId || 'device',
    `${history.caseId || history.caseKind || 'fault case'} · ${history.caseKind || 'not returned'} · ${history.faultBusId || 'bus not returned'}`,
  ]));
  await pageSelect.selectOption('0');
  const first = historyRows.first();
  await first.locator('details > summary').first().click();
  const firstExact = first.locator('details[data-proposal-evidence]');
  await firstExact.locator('summary').click();
  await expect(firstExact.locator(':scope > pre')).not.toHaveText('');
  expect(JSON.parse(await firstExact.locator(':scope > pre').textContent())).toEqual(histories[0]);
  await details.locator('summary').click();
  await expect(pre).not.toHaveText('', { timeout: 30000 });
  const displayed = JSON.parse(await pre.textContent());
  expect(displayed).toEqual({ input: proposal.faultEvolution, validation: proposal.faultEvolutionValidation });
  expect(displayed.input.profiles[0].source.reference).toBe(marker);
  await expect(details.locator('img')).toHaveCount(0);
  await details.locator('summary').click();
  await expect(pre).toHaveText('');
  await details.locator('summary').click();
  await expect(pre).not.toHaveText('');
  expect(JSON.parse(await pre.textContent())).toEqual(displayed);
  await fs.writeFile(testInfo.outputPath('render-size.json'), JSON.stringify({ initialOutputTextCharacters: initialSize, openedEvidenceCharacters: (await pre.textContent()).length }));
  const capacity = page.locator('[data-synthesis-control="supply.capacityKva"]');
  await capacity.fill('1900');
  await capacity.press('Tab');
  await expect(page.locator('#synthesis-output')).toContainText('No current proposal');
  await expect(page.locator('#synthesis-download-json')).toBeDisabled();
});

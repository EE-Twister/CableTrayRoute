import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

async function downloadProposal(page) {
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  return JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
}

for (const count of [25, 50]) test(`${count} loads retain candidate-specific enclosure evidence and protection blockers`, async ({ page }) => {
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Load motor breaker research sample', exact: true }).click();
  await page.getByText('Advanced equipment JSON / CSV-ready structure').click();
  const editor = page.locator('#synthesis-equipment');
  const original = JSON.parse(await editor.inputValue());
  const rows = Array.from({ length: count }, (_, index) => {
    const row = { ...structuredClone(original[index % original.length]), id: `L-${index}`, tag: `L-${index}` };
    if (index !== 0) delete row.motor;
    return row;
  });
  Object.assign(rows[0], { kw: Math.sqrt(3) * 480 * 29.5 * 0.85 / 1000, powerFactor: 0.85 });
  Object.assign(rows[0].motor, { nameplateHorsepower: 25, nameplateCurrentA: 29.5, fullLoadCurrentA: 39.2, fullLoadCurrentBasis: { reference: 'Synthetic design current' }, lockedRotorCurrentA: 183, lockedRotorPowerFactor: 0.3, rotorType: 'squirrel-cage' });
  await editor.fill(JSON.stringify(rows));
  await page.getByRole('combobox', { name: 'Proposed TM230 instantaneous pickup (A)', exact: true }).selectOption('300');
  await page.getByRole('combobox', { name: '70 A breaker enclosure temperature (°C)', exact: true }).selectOption('65');
  await page.getByLabel('Breaker enclosure temperature reference', { exact: true }).fill('70 A only');
  await page.getByRole('combobox', { name: '35–60 A S2 breaker enclosure temperature (°C)', exact: true }).selectOption('50');
  await page.getByLabel('35–60 A S2 breaker enclosure temperature reference', { exact: true }).fill('Synthetic S2 enclosure study');
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  await expect(page.locator('#synthesis-motor-starter-review')).toContainText('3VA5160-6EC31-0AA0');
  await expect(page.locator('#synthesis-motor-starter-review')).toContainText('58 A at 50 °C');
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  let proposal = await downloadProposal(page);
  let candidate = proposal.motorStarterCandidates.cases.find(item => item.motorId === 'L-0').candidate;
  expect(candidate.branchCircuitBreaker.continuousCurrentA).toBe(60);
  expect(candidate.checks.find(item => item.id === 'breakerAmbientOperatingCurrent').evidence.basis).toBe('project-s2');
  expect(candidate.selectedForApply).toBe(false);
  const reportPending = page.waitForEvent('download');
  await page.locator('#synthesis-download-report').click();
  const report = await fs.readFile(await (await reportPending).path(), 'utf8');
  expect(report).toContain('58 A at 50 °C');
  expect(report).toContain('protection');
  await page.getByRole('combobox', { name: 'Motor breaker enclosure temperature 1' }).selectOption('40');
  await page.getByLabel('Motor breaker enclosure temperature reference 1').fill('Synthetic motor enclosure');
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-motor-starter-review')).toContainText('3VA5150-6EC31-0AA0');
  proposal = await downloadProposal(page);
  candidate = proposal.motorStarterCandidates.cases.find(item => item.motorId === 'L-0').candidate;
  expect(candidate.branchCircuitBreaker.continuousCurrentA).toBe(50);
  expect(candidate.checks.find(item => item.id === 'breakerAmbientOperatingCurrent').evidence.basis).toBe('motor');
  await page.reload();
  await expect(page.getByRole('combobox', { name: '35–60 A S2 breaker enclosure temperature (°C)', exact: true })).toHaveValue('50');
  await expect(page.getByRole('combobox', { name: 'Motor breaker enclosure temperature 1' })).toHaveValue('40');
  await expect(page.getByLabel('Motor breaker enclosure temperature reference 1')).toHaveValue('Synthetic motor enclosure');
});

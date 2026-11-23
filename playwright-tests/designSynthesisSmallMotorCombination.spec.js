import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

for (const count of [25, 50]) test(`${count} loads expose the cited small-motor combination comparisons`, async ({ page }) => {
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Load motor fault network sample', exact: true }).click();
  await page.getByText('Advanced equipment JSON / CSV-ready structure').click();
  await page.getByText('Advanced fault network JSON', { exact: true }).click();
  const editor = page.locator('#synthesis-equipment');
  const faultEditor = page.getByRole('textbox', { name: 'Fault network JSON', exact: true });
  const original = JSON.parse(await editor.inputValue());
  const loads = Array.from({ length: count }, (_, index) => {
    const row = { ...structuredClone(original[0]), id: `SM-${index}`, tag: `SM-${index}` };
    delete row.motor;
    return row;
  });
  const motors = [
    { nameplate: 12.8, flc: 14, relay: '3RU2126-4AB0', breaker: 25 },
    { nameplate: 15, flc: 21, relay: '3RU2126-4AB0', breaker: 30 },
    { nameplate: 17.5, flc: 14, relay: '3RU2126-4BB0', breaker: 25 },
    { nameplate: 17.5, flc: 21, relay: '3RU2126-4BB0', breaker: 30 },
  ];
  motors.forEach((motor, index) => Object.assign(loads[index], {
    kw: Math.sqrt(3) * 480 * motor.nameplate * 0.85 / 1000, powerFactor: 0.85, duty: 'continuous', ratingsBasis: 'electrical-input-kW',
    motor: { ratedVoltageV: 460, fullLoadCurrentA: motor.flc, fullLoadCurrentBasis: { reference: 'Synthetic design current' }, nameplateCurrentA: motor.nameplate, nameplateHorsepower: 10, nameplateFrequencyHz: 60, lockedRotorCurrentA: motor.nameplate * 6, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage', instantaneousPickupA: 150 },
  }));
  await editor.fill(JSON.stringify(loads));
  const study = JSON.parse(await faultEditor.inputValue());
  study.sources = [study.sources[0], ...motors.map((_, index) => ({ equipmentId: `SM-${index}`, emfPhaseV: { re: 460 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 1, xOhm: 3 }, inService: true, reference: 'Synthetic motor equivalent' }))];
  await faultEditor.fill(JSON.stringify(study));
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  const proposal = JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
  const review = page.locator('#synthesis-device-fault-review');
  for (const [index, motor] of motors.entries()) {
    const placement = proposal.deviceFaultValidation.placements.find(row => row.proposedLocation.protectedSideBusId === `SM-${index}`);
    const candidate = proposal.motorStarterCandidates.cases.find(row => row.motorId === `SM-${index}`).candidate;
    expect(candidate.overloadRelay.catalogNumber).toBe(motor.relay);
    expect(candidate.branchCircuitBreaker.catalogNumber).toBe(`3VA51${motor.breaker}-6EC31-0AA0`);
    expect(placement.comparisons.citedMotorCombinationInitialRms.status).toBe('not-above-cited-value-unqualified');
    expect(placement.comparisons.citedMotorCombinationInitialRms.ratingKA).toBe(65);
    expect(placement.comparisons.citedMotorCombinationInitialRms.sourceId).toBe('siemens-ul-e44653-2025-03-17');
    const card = review.locator('article.synthesis-device-fault-placement').filter({ has: page.getByRole('heading', { name: `${placement.id} · Siemens ${candidate.branchCircuitBreaker.catalogNumber}`, exact: true }) });
    await expect(card.getByRole('row', { name: /Cited motor combination initial-RMS comparison/ }).locator('td')).toContainText('65 kA cited value');
    await expect(card).toContainText('unevaluated');
  }
  const reportPending = page.waitForEvent('download');
  await page.locator('#synthesis-download-report').click();
  const report = await fs.readFile(await (await reportPending).path(), 'utf8');
  expect(report).toContain('Cited motor combination initial-RMS comparison: not-above-cited-value-unqualified');
  expect(report).toContain('65 kA at 480 V');
});

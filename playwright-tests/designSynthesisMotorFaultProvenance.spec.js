import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

for (const { count, strong } of [{ count: 25, strong: false }, { count: 50, strong: false }, { count: 25, strong: true }]) test(`${count} loads ${strong ? 'flag strong motor infeed' : 'report modeled faults'} for all four exact motor-breaker sizes`, async ({ page }) => {
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Load motor fault network sample', exact: true }).click();
  await page.getByText('Advanced equipment JSON / CSV-ready structure').click();
  await page.getByText('Advanced fault network JSON', { exact: true }).click();
  const equipmentEditor = page.locator('#synthesis-equipment');
  const faultEditor = page.getByRole('textbox', { name: 'Fault network JSON', exact: true });
  const original = JSON.parse(await equipmentEditor.inputValue());
  const rows = Array.from({ length: count }, (_, index) => {
    const row = { ...structuredClone(original[strong ? 0 : index % original.length]), id: `M-${index}`, tag: `M-${index}` };
    delete row.motor;
    return row;
  });
  const motors = [
    { hp: 15, nameplate: 22, flc: 21, pickup: 175, breaker: '3VA5135-6EC31-0AA0' },
    { hp: 25, nameplate: 29.5, flc: 34, pickup: 250, breaker: '3VA5150-6EC31-0AA0' },
    { hp: 30, nameplate: 38, flc: 40, pickup: 480, breaker: '3VA5160-6EC31-0AA0' },
    { hp: 40, nameplate: 48, flc: 52, pickup: 490, breaker: '3VA5170-6EC31-0AA0' }
  ];
  for (const [index, motor] of motors.entries()) Object.assign(rows[index], {
    kw: Math.sqrt(3) * 480 * motor.nameplate * 0.85 / 1000, powerFactor: 0.85, duty: 'continuous', ratingsBasis: 'electrical-input-kW',
    motor: { ratedVoltageV: 460, fullLoadCurrentA: motor.flc, fullLoadCurrentBasis: { reference: 'Synthetic design current' }, nameplateCurrentA: motor.nameplate, nameplateHorsepower: motor.hp, nameplateFrequencyHz: 60, lockedRotorCurrentA: motor.nameplate * 6, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage', instantaneousPickupA: motor.pickup }
  });
  await equipmentEditor.fill(JSON.stringify(rows));
  const study = JSON.parse(await faultEditor.inputValue());
  study.sources = [study.sources[0], ...motors.map((_, index) => ({ equipmentId: `M-${index}`, emfPhaseV: { re: 460 / Math.sqrt(3), im: 0 }, impedance: strong ? { rOhm: 0.001, xOhm: 0.001 } : { rOhm: 1, xOhm: 3 }, inService: true, reference: 'Synthetic motor equivalent; not manufacturer or field data' }))];
  await faultEditor.fill(JSON.stringify(study));
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  const review = page.locator('#synthesis-device-fault-review');
  await expect(review).toBeVisible();
  for (const motor of motors) {
    const card = review.locator('article.synthesis-device-fault-placement').filter({ hasText: motor.breaker });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('65 kA at 480 V');
    await expect(card).toContainText('provenance referenced');
    await expect(card).toContainText('not-exceeded');
    await expect(card.getByRole('row', { name: /Cited motor combination initial-RMS comparison/ }).locator('td')).toHaveText(new RegExp(`^${strong ? 'above-cited-value' : 'not-above-cited-value-unqualified'}`));
    await expect(card).toContainText('25 kA cited value');
    await expect(card).toContainText('unevaluated');
  }
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  const proposal = JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
  expect(proposal.faultStudyValidation.status).toBe('evaluated');
  for (const [index, motor] of motors.entries()) {
    const placement = proposal.deviceFaultValidation.placements.find(item => item.proposedLocation.protectedSideBusId === `M-${index}`);
    expect(placement.device.catalogNumber).toBe(motor.breaker);
    expect(placement.ratingComparable).toBe(true);
    expect(placement.device.standaloneInterruptingRating.provenanceStatus).toBe('referenced');
    expect(placement.device.conditionalCombinationRating.status).toBe('unevaluated');
    expect(placement.comparisons.citedMotorCombinationInitialRms.status).toBe(strong ? 'above-cited-value' : 'not-above-cited-value-unqualified');
    expect(placement.comparisons.protectionAdequacy).toBe('unevaluated');
  }
  const reportPending = page.waitForEvent('download');
  await page.locator('#synthesis-download-report').click();
  const report = await fs.readFile(await (await reportPending).path(), 'utf8');
  for (const motor of motors) expect(report).toContain(motor.breaker);
  expect(report).toContain('protection adequacy unevaluated');
  expect(report).toContain('Cited motor combination initial-RMS comparison');
  if (strong) expect(report).toContain('DEVICE_FAULT_SCREEN_CITED_COMBINATION_VALUE_EXCEEDED');
});

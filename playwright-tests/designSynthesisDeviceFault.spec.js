import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;

test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

async function downloadJson(page) {
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  const download = await pending;
  return JSON.parse(await fs.readFile(await download.path(), 'utf8'));
}

async function downloadReport(page) {
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-report').click();
  const download = await pending;
  return fs.readFile(await download.path(), 'utf8');
}

test('proposed device fault screen separates location, through-current, and conditional ratings', async ({ page }, testInfo) => {
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Load motor fault network sample', exact: true }).click();
  await expect(page.locator('#synthesis-status')).toContainText('Synthetic motor fault network sample loaded');
  await page.getByText('Advanced fault network JSON', { exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Fault network JSON', exact: true });
  const sampleInput = JSON.parse(await editor.inputValue());
  const motorId = sampleInput.sources.find(row => String(row.reference || '').includes('motor positive-sequence')).equipmentId;
  await page.locator('#synthesis-generate').click();

  const review = page.locator('#synthesis-device-fault-review');
  await expect(review).toBeVisible();
  await expect(review).toContainText('proposed source-end device position');
  await expect(review).toContainText('not an installed fact');
  await expect(review).toContainText('Line-terminal available initial RMS');
  await expect(review).toContainText('Maximum current through device');
  await expect(review).toContainText('Standalone interrupting rating');
  await expect(review).toContainText('Conditional combination rating / assembly SCCR');
  await expect(review).toContainText('Protection adequacy');
  await expect(review).toContainText('unevaluated');
  await expect(page.locator('#synthesis-apply')).toBeDisabled();

  const first = await downloadJson(page);
  const validation = first.deviceFaultValidation;
  expect(validation).toBeTruthy();
  expect(validation.scope).toBe('initial-symmetrical-rms-only');
  expect(validation.placements.length).toBeGreaterThan(0);
  expect(validation.placements.every(row => row.comparisons.protectionAdequacy === 'unevaluated')).toBe(true);
  const motorPlacement = validation.placements.find(row => row.proposedLocation.protectedSideBusId === motorId);
  expect(motorPlacement).toBeTruthy();
  expect(motorPlacement.device.standaloneInterruptingRating.currentKA).toBe(65);
  expect(motorPlacement.device.standaloneInterruptingRating.voltageVac).toBe(480);
  expect(motorPlacement.device.standaloneInterruptingRating.provenanceStatus).toBe('referenced');
  expect(motorPlacement.comparisons.maximumThroughDeviceInitialRms.status).not.toBe('not-compared');
  const comparable = validation.placements.find(row => Number.isFinite(row.comparisons.maximumThroughDeviceInitialRms.valueKA));
  expect(comparable).toBeTruthy();
  expect(comparable.comparisons.maximumThroughDeviceInitialRms.phasorKA).toEqual(expect.objectContaining({ re: expect.any(Number), im: expect.any(Number) }));
  expect(comparable.comparisons.maximumThroughDeviceInitialRms.faultBusId).toBeTruthy();
  expect(comparable.comparisons.maximumThroughDeviceInitialRms.caseKind).toBeTruthy();
  expect(Number.isFinite(comparable.comparisons.lineTerminalAvailableInitialRms.valueKA)).toBe(true);
  expect(comparable.comparisons.lineTerminalAvailableInitialRms.phasorKA).toEqual(expect.objectContaining({ re: expect.any(Number), im: expect.any(Number) }));
  expect(validation.deviceInputFingerprint).toBeTruthy();

  const report = (await downloadReport(page)).split('Complete JSON payload:')[0];
  expect(report).toContain('Proposed device locations and initial-RMS screen:');
  expect(report).toContain('Line-terminal available initial RMS');
  expect(report).toContain('Maximum actual current through device');
  expect(report).toContain('Standalone interrupting rating');
  expect(report).toContain('Conditional combination rating / assembly SCCR');
  expect(report).toContain('protection adequacy unevaluated');
  expect(report).toContain('Combined model (network + device) fingerprint');
  expect(report).toContain('Network-only input fingerprint');
  expect(report).toContain('Device input fingerprint');
  await fs.writeFile(testInfo.outputPath('device-fault-screen-report.txt'), report);
  await review.screenshot({ path: testInfo.outputPath('device-fault-screen.png'), fullPage: true });
  await review.locator('h3').screenshot({ path: testInfo.outputPath('device-fault-heading.png') });
  await review.locator('table').first().screenshot({ path: testInfo.outputPath('device-fault-summary.png') });
  await review.locator('article.synthesis-device-fault-placement').first().screenshot({ path: testInfo.outputPath('device-fault-first-placement.png') });

  const edited = JSON.parse(await editor.inputValue());
  const motorSource = edited.sources.find(row => String(row.reference || '').includes('motor positive-sequence'));
  expect(motorSource).toBeTruthy();
  motorSource.impedance.rOhm *= 2;
  await editor.fill(JSON.stringify(edited, null, 2));
  await expect(page.locator('#synthesis-download-json')).toBeDisabled();
  await page.locator('#synthesis-generate').click();
  const changed = await downloadJson(page);
  expect(changed.deviceFaultValidation.modelInputFingerprint).not.toBe(validation.modelInputFingerprint);
  expect(changed.deviceFaultValidation.networkModelInputFingerprint).not.toBe(validation.networkModelInputFingerprint);
  expect(changed.deviceFaultValidation.deviceInputFingerprint).toBe(validation.deviceInputFingerprint);
  expect(changed.deviceFaultValidation.status).toBeTruthy();
  await expect(page.locator('#synthesis-apply')).toBeDisabled();

  const partial = JSON.parse(await editor.inputValue());
  const sourceEquipment = changed.equipment.find(row => row.type === 'source');
  partial.faultBusIds = [sourceEquipment.id];
  await editor.fill(JSON.stringify(partial, null, 2));
  await page.locator('#synthesis-generate').click();
  const incomplete = await downloadJson(page);
  expect(incomplete.deviceFaultValidation.status).toBe('blocked');
  expect(incomplete.deviceFaultValidation.coverage.status).toBe('incomplete');
  expect(incomplete.deviceFaultValidation.issues.some(row => row.code === 'DEVICE_FAULT_SCREEN_FAULT_COVERAGE_INCOMPLETE')).toBe(true);
  expect(incomplete.deviceFaultValidation.placements.every(row => row.comparisons.maximumThroughDeviceInitialRms.status === 'not-compared')).toBe(true);
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
});

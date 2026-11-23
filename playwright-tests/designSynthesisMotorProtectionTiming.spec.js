import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

async function downloadText(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await pending;
  return fs.readFile(await download.path(), 'utf8');
}

async function loadExample(page) {
  await page.locator('#synthesis-load-motor-protection-timing-sample').click();
  await expect(page.locator('#synthesis-equipment')).toHaveValue(/Synthetic illustrative breaker time-current bounds/);
}

async function fillEquipment(page, value) {
  const details = page.locator('details:has(#synthesis-equipment)');
  if (!(await details.evaluate(element => element.open))) await details.locator('summary').click();
  await page.locator('#synthesis-equipment').fill(value);
}

async function generateTiming(page) {
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-motor-protection-timing-review')).toBeVisible({ timeout: 30000 });
}

async function readDraft(page) {
  return page.evaluate(() => window.dataStore.getItem('designSynthesisDraft'));
}

async function importDraft(page, draft, name) {
  await page.locator('#synthesis-import').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(draft)) });
  await expect(page.locator('#synthesis-status')).toContainText(`Imported ${name}`);
}

test.describe('Design synthesis motor protection timing screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(server.url('designsynthesis.html'));
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  });

  test('retains the synthetic reference-current evidence, reports and downloads it, and invalidates stale output', async ({ page }, testInfo) => {
    await loadExample(page);
    const originalEquipment = await page.locator('#synthesis-equipment').inputValue();
    await page.reload();
    await expect(page.locator('#synthesis-equipment')).toHaveValue(originalEquipment);
    await generateTiming(page);

    const proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    const validation = proposal.motorProtectionTimingValidation;
    expect(validation.completeProtectionStatus).toBe('blocked');
    expect(validation.status).toBe('pass');
    expect(validation.cases).toHaveLength(1);
    const result = validation.cases[0];
    expect(result.comparisons.startupRideThrough.status).toBe('pass');
    expect(result.comparisons.selectedStateSafeStall.status).toBe('pass');
    expect(result.devices).toHaveLength(2);
    expect(result.devices.map(item => item.catalogNumber)).toEqual(['3VA5125-6EC31-0AA0', '3RU2126-4AB0']);
    expect(result.devices[0].setting).toEqual({ fixedIrA: 25, instantaneousPickupA: 150 });
    expect(result.devices[1].setting).toEqual({ dialSettingA: 12.8 });
    expect(result.otherInitialState.status).toBe('not-evaluated');
    expect(result.evidenceStatus).toBe('supplied-unverified');
    expect(result.comparisons.selectedStateSafeStall.referenceCurrentOnly).toBe(true);
    expect(result.comparisons.selectedStateSafeStall.currentA).toBe(100);
    await expect(page.locator('#synthesis-motor-protection-timing-review')).toContainText('complete protection');
    await expect(page.locator('#synthesis-motor-protection-timing-review')).toContainText('not independently verified');
    await expect(page.locator('#synthesis-motor-protection-timing-review')).toContainText('does not establish actual motor stall protection at lower currents');
    await expect(page.locator('#synthesis-motor-protection-timing-review')).toContainText('clearing upper bound');
    await expect(page.locator('#synthesis-apply')).toBeDisabled();

    const report = await downloadText(page, '#synthesis-download-report');
    expect(report).toContain('Motor protection timing comparison');
    expect(report).toContain('complete protection: blocked');
    expect(report).toContain('3VA5125-6EC31-0AA0');
    expect(report).toContain('Reference-current clearing vs selected-state withstand');
    expect(report).toContain('earliest clearing upper bound');
    expect(report).toContain('does not bound longer clearing at lower stall/fault currents');
    expect(report).toContain('Complete JSON payload:');
    const reportPayload = JSON.parse(report.slice(report.indexOf('Complete JSON payload:') + 'Complete JSON payload:'.length).trim());
    expect(reportPayload.motorProtectionTimingValidation).toEqual(validation);
    await fs.writeFile(testInfo.outputPath('motor-protection-timing-proposal.json'), JSON.stringify(proposal, null, 2));
    await fs.writeFile(testInfo.outputPath('motor-protection-timing-report.txt'), report);
    await page.locator('#synthesis-motor-protection-timing-review').screenshot({ path: testInfo.outputPath('motor-protection-timing-positive.png'), style: '.top-nav { position: static !important; }' });

    const higherReference = JSON.parse(originalEquipment);
    higherReference[0].motor.protectionTiming.referenceStartCurrentA = 110;
    higherReference[0].motor.protectionTiming.motorWithstand.referenceCurrentA = 110;
    await fillEquipment(page, JSON.stringify(higherReference, null, 2));
    await generateTiming(page);
    const higherReferenceProposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(higherReferenceProposal.motorProtectionTimingValidation.status).toBe('pass');
    expect(higherReferenceProposal.motorProtectionTimingValidation.cases[0].referenceStartCurrentA).toBe(110);
    await expect(page.locator('#synthesis-motor-protection-timing-review')).toContainText('110 A reference; supplied current envelope 1–100 A');
    await fillEquipment(page, originalEquipment);
    await generateTiming(page);

    const adverse = JSON.parse(originalEquipment);
    adverse[0].motor.protectionTiming.devices.find(item => item.role === 'branch-breaker').minimumTrip[1].timeS = 0.01;
    adverse[0].motor.protectionTiming.devices.find(item => item.role === 'branch-breaker').minimumTrip[2].timeS = 0.005;
    await fillEquipment(page, JSON.stringify(adverse, null, 2));
    await expect(page.locator('#synthesis-download-json')).toBeDisabled();
    await expect(page.locator('#synthesis-download-report')).toBeDisabled();
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-motor-protection-timing-review')).toContainText('fail', { timeout: 30000 });
    const failed = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(failed.motorProtectionTimingValidation.status).toBe('fail');
    expect(failed.motorProtectionTimingValidation.cases[0].comparisons.startupRideThrough.status).toBe('fail');
    await fs.writeFile(testInfo.outputPath('motor-protection-timing-failed.json'), JSON.stringify(failed, null, 2));
    const failedReport = await downloadText(page, '#synthesis-download-report');
    const failedPayload = JSON.parse(failedReport.slice(failedReport.indexOf('Complete JSON payload:') + 'Complete JSON payload:'.length).trim());
    expect(failedPayload.motorProtectionTimingValidation).toEqual(failed.motorProtectionTimingValidation);
    await fs.writeFile(testInfo.outputPath('motor-protection-timing-failed-report.txt'), failedReport);
    await page.locator('#synthesis-motor-protection-timing-review').screenshot({ path: testInfo.outputPath('motor-protection-timing-failing.png'), style: '.top-nav { position: static !important; }' });
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
  });

  test('adverse minimum-trip and total-clearing edits produce numeric failure while retaining acceleration evidence', async ({ page }) => {
    await loadExample(page);
    const equipment = JSON.parse(await page.locator('#synthesis-equipment').inputValue());
    const timing = equipment[0].motor.protectionTiming;
    timing.devices.find(item => item.role === 'branch-breaker').minimumTrip = [
      { currentA: 10, timeS: 1000 }, { currentA: 100, timeS: 0.01 }, { currentA: 1000, timeS: 0.005 },
    ];
    timing.devices.find(item => item.role === 'branch-breaker').maximumTotalCircuitClearing = [
      { currentA: 10, timeS: 2000 }, { currentA: 100, timeS: 20 }, { currentA: 1000, timeS: 0.2 },
    ];
    timing.devices.find(item => item.role === 'overload-relay').maximumTotalCircuitClearing = [
      { currentA: 10, timeS: 1500 }, { currentA: 100, timeS: 20 }, { currentA: 1000, timeS: 0.2 },
    ];
    await fillEquipment(page, JSON.stringify(equipment, null, 2));
    await generateTiming(page);
    const result = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(result.motorAccelerationValidation.cases[0].status).toBe('evaluated');
    expect(result.motorProtectionTimingValidation.status).toBe('fail');
    expect(result.motorProtectionTimingValidation.cases[0].comparisons.startupRideThrough.status).toBe('fail');
    expect(result.motorProtectionTimingValidation.cases[0].comparisons.selectedStateSafeStall.status).toBe('fail');
    await expect(page.locator('#synthesis-motor-protection-timing-review')).toContainText('20 s');
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
  });

  test('blocks missing contactor clearing, mismatched candidate settings, and out-of-range source conditions', async ({ page }) => {
    await loadExample(page);
    const draft = await readDraft(page);
    const make = () => structuredClone(draft);

    const malformedDevices = make();
    malformedDevices.equipment[0].motor.protectionTiming.devices = {};
    await importDraft(page, malformedDevices, 'malformed-timing-devices.json');
    await generateTiming(page);
    let result = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(result.motorProtectionTimingValidation.status).toBe('blocked');
    expect(result.motorProtectionTimingValidation.cases[0].issues.some(item => item.code === 'MOTOR_PROTECTION_TIMING_DEVICE_ROLES')).toBe(true);
    await expect(page.locator('#synthesis-motor-protection-timing-review')).toContainText('No device timing rows returned');

    const unsafeSourceText = make();
    unsafeSourceText.equipment[0].motor.protectionTiming.motorWithstand.coldConditions.initialState = '<b data-timing-untrusted>unsafe</b>';
    await importDraft(page, unsafeSourceText, 'untrusted-timing-source-text.json');
    await generateTiming(page);
    result = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(result.motorProtectionTimingValidation.status).toBe('blocked');
    const review = page.locator('#synthesis-motor-protection-timing-review');
    await expect(review).toContainText('<b data-timing-untrusted>unsafe</b>');
    await expect(review.locator('[data-timing-untrusted]')).toHaveCount(0);

    const missingOpening = make();
    missingOpening.equipment[0].motor.protectionTiming.devices.find(item => item.role === 'overload-relay').includesContactorOpening = false;
    await importDraft(page, missingOpening, 'missing-contactor-opening.json');
    await generateTiming(page);
    result = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(result.motorProtectionTimingValidation.status).toBe('blocked');
    expect(result.motorProtectionTimingValidation.cases[0].issues.some(item => item.code === 'MOTOR_PROTECTION_TIMING_CONTACTOR_OPENING_REQUIRED')).toBe(true);

    const wrongSetting = make();
    wrongSetting.equipment[0].motor.protectionTiming.devices.find(item => item.role === 'branch-breaker').setting.instantaneousPickupA = 180;
    await importDraft(page, wrongSetting, 'mismatched-candidate-setting.json');
    await generateTiming(page);
    result = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(result.motorProtectionTimingValidation.status).toBe('blocked');
    expect(result.motorProtectionTimingValidation.cases[0].issues.some(item => item.code === 'MOTOR_PROTECTION_TIMING_CANDIDATE_MISMATCH')).toBe(true);

    const voltageRange = make();
    voltageRange.equipment[0].motor.protectionTiming.devices.find(item => item.role === 'overload-relay').conditions.voltageRangeV = [500, 600];
    await importDraft(page, voltageRange, 'out-of-range-source-condition.json');
    await generateTiming(page);
    result = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(result.motorProtectionTimingValidation.status).toBe('blocked');
    expect(result.motorProtectionTimingValidation.cases[0].issues.some(item => item.code === 'MOTOR_PROTECTION_TIMING_VOLTAGE_COVERAGE')).toBe(true);
    await expect(page.locator('#synthesis-motor-protection-timing-review')).toContainText('blocked');
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
  });
});

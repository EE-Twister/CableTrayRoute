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

async function openEquipmentEditor(page) {
  const details = page.locator('details:has(#synthesis-equipment)');
  if (!await details.evaluate(element => element.open)) await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
}

async function loadThermalSample(page) {
  await page.locator('#synthesis-load-motor-thermal-sample').click();
  await expect(page.locator('#synthesis-status')).toContainText('Synthetic motor thermal-setting sample loaded');
}

test.describe('Design synthesis REM610 thermal-setting screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(server.url('designsynthesis.html'));
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('reports a conditional REM610 start-up exposure without claiming protection', async ({ page }) => {
    test.setTimeout(60000);
    await loadThermalSample(page);
    await openEquipmentEditor(page);
    const editor = page.locator('#synthesis-equipment');
    const equipment = JSON.parse(await editor.inputValue());
    equipment[0].motor.rem610Thermal.startupSupervision = {
      reference: 'Synthetic start setting <b>not installed</b>', relayFlaPrimaryA: 20,
      relayFlaReference: 'Synthetic primary-equivalent FLA', pickupMultipleOfFla: 5, settingTimeS: 2,
      pickupMode: 'motor-start-condition', startConditionActiveEntireTrajectory: true, speedSwitchBlocking: false,
    };
    await editor.fill(JSON.stringify(equipment, null, 2));
    await page.locator('#synthesis-generate').click();
    const review = page.locator('#synthesis-motor-startup-supervision-review');
    await expect(review).toContainText('nominal-comparison-only');
    await expect(review).toContainText('not a trip prediction');
    await expect(review).toContainText('<b>not installed</b>');
    await expect(review.locator('b')).toHaveCount(0);
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
    const proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    const evidence = proposal.motorThermalValidation.cases[0].startupSupervision;
    expect(evidence.referenceExposureA2S).toBe(20000);
    expect(evidence.accelerationExposureA2S).toBe(proposal.motorAccelerationValidation.cases[0].electricalExposureA2S);
    expect(evidence.nominalExposurePercent).toBeCloseTo(evidence.accelerationExposureA2S / 20000 * 100, 10);
    const report = await downloadText(page, '#synthesis-download-report');
    expect(report).toContain('ABB REM610 start-up exposure comparison');
    expect(report).toContain('not a trip prediction');
    await page.reload();
    await openEquipmentEditor(page);
    const reloaded = JSON.parse(await editor.inputValue());
    expect(reloaded[0].motor.rem610Thermal.startupSupervision).toEqual(equipment[0].motor.rem610Thermal.startupSupervision);
    reloaded[0].motor.rem610Thermal.startupSupervision.speedSwitchBlocking = true;
    await editor.fill(JSON.stringify(reloaded));
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-motor-thermal-review')).toContainText('REM610_STARTUP_MODE_UNSUPPORTED');
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
  });

  test('screens the synthetic motor, retains edited inputs across reload, and blocks missing references', async ({ page }, testInfo) => {
    await loadThermalSample(page);
    await openEquipmentEditor(page);
    const equipmentEditor = page.locator('#synthesis-equipment');
    const originalText = await equipmentEditor.inputValue();
    const originalEquipment = JSON.parse(originalText);
    const motorId = String(originalEquipment[0].id);
    const thermalInput = originalEquipment[0].motor.rem610Thermal;
    expect(thermalInput.reference).toContain('Synthetic');
    expect(thermalInput.referenceStartCurrentA).toBe(100);
    expect(thermalInput.motorSafeStallTimeS).toBe(15);
    expect(thermalInput.currentScalingFactor).toBe(1);
    await page.reload();
    await openEquipmentEditor(page);
    await expect(equipmentEditor).toHaveValue(originalText);

    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-motor-thermal-review')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
    const initial = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    const initialValidation = initial.motorThermalValidation;
    expect(initialValidation.status).toBe('evaluated');
    expect(initialValidation.method).toBe('abb-rem610-ansi-e-c-2011-dol-start-setting-screen-v1');
    expect(initialValidation.cases).toHaveLength(1);
    expect(initialValidation.cases[0]).toMatchObject({ motorId, status: 'pass' });
    expect(initialValidation.cases[0].startupTimeS).toBeGreaterThan(0);
    expect(initialValidation.cases[0].recommendedT6xSettingS).toBeGreaterThanOrEqual(2);
    expect(initialValidation.cases[0].calculations.feasibleRange.toleranceAwareCandidatesS.length).toBeGreaterThan(0);
    await expect(page.locator('#synthesis-motor-thermal-review')).toContainText('not the acceleration current trajectory');
    await expect(page.locator('#synthesis-motor-thermal-review')).toContainText('not a Siemens 3RU replacement');
    await expect(page.locator('#synthesis-motor-thermal-review')).toContainText('not a guaranteed ABB tolerance');
    const thermalCaseText = await page.locator('#synthesis-motor-thermal-review article').first().innerText();
    expect(thermalCaseText).toContain(thermalInput.reference);
    expect(thermalCaseText).not.toContain(originalEquipment[0].motor.fullLoadCurrentBasis.reference);
    const initialReport = await downloadText(page, '#synthesis-download-report');
    expect(initialReport).toContain('ABB REM610 DOL thermal-setting alternative');
    expect(initialReport).toContain('constant setting-screen basis');
    await fs.writeFile(testInfo.outputPath('motor-thermal-review.txt'), initialReport);
    await fs.writeFile(testInfo.outputPath('motor-thermal-proposal.json'), JSON.stringify(initial, null, 2));
    await page.locator('#synthesis-motor-thermal-review').screenshot({ path: testInfo.outputPath('motor-thermal-review.png') });
    await page.locator('#synthesis-motor-thermal-review article').first().screenshot({ path: testInfo.outputPath('motor-thermal-review-case.png') });

    const editedEquipment = structuredClone(originalEquipment);
    editedEquipment[0].motor.rem610Thermal.priorLoadCurrentA = 15;
    editedEquipment[0].motor.rem610Thermal.startTimeMarginPct = 20;
    const editedText = JSON.stringify(editedEquipment, null, 2);
    await equipmentEditor.fill(editedText);
    await expect(page.locator('#synthesis-download-json')).toBeDisabled();
    await expect(page.locator('#synthesis-download-report')).toBeDisabled();
    await page.reload();
    await openEquipmentEditor(page);
    await expect(equipmentEditor).toHaveValue(editedText);
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-motor-thermal-review')).toBeVisible({ timeout: 30000 });
    const revised = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(revised.motorThermalValidation.modelInputFingerprint).not.toBe(initialValidation.modelInputFingerprint);
    expect(revised.motorThermalValidation.cases[0].calculations.normalized.priorLoadMultipleOfInternalFla)
      .not.toBe(initialValidation.cases[0].calculations.normalized.priorLoadMultipleOfInternalFla);
    expect(revised.motorThermalValidation.cases[0].calculations.requirements.marginFactor).toBe(1.2);
    await expect(page.locator('#synthesis-apply')).toBeDisabled();

    editedEquipment[0].motor.rem610Thermal.motorSafeStallReference = '';
    await equipmentEditor.fill(JSON.stringify(editedEquipment, null, 2));
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-motor-thermal-review')).toContainText('REM610_REFERENCE_REQUIRED', { timeout: 30000 });
    const blocked = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(blocked.motorThermalValidation.status).toBe('blocked');
    expect(blocked.motorThermalValidation.issues.some(item => item.code === 'REM610_REFERENCE_REQUIRED')).toBe(true);
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
  });

  test('retains nominal evidence but blocks recommendations for nonunit current scaling', async ({ page }) => {
    await loadThermalSample(page);
    await openEquipmentEditor(page);
    const editor = page.locator('#synthesis-equipment');
    const equipment = JSON.parse(await editor.inputValue());
    expect(equipment[0].motor.rem610Thermal.currentScalingFactor).toBe(1);
    equipment[0].motor.rem610Thermal.currentScalingFactor = 1.21;
    await editor.fill(JSON.stringify(equipment, null, 2));
    await expect(page.locator('#synthesis-download-json')).toBeDisabled();
    await expect(page.locator('#synthesis-download-report')).toBeDisabled();
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-motor-thermal-review')).toContainText('REM610_ACCURACY_SCALING_UNQUALIFIED', { timeout: 30000 });
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
    const result = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    const validation = result.motorThermalValidation;
    expect(validation.status).toBe('blocked');
    expect(validation.issues.some(item => item.code === 'REM610_ACCURACY_SCALING_UNQUALIFIED')).toBe(true);
    const thermalCase = validation.cases[0];
    expect(thermalCase.status).toBe('blocked');
    expect(thermalCase.candidateStatus).toBe('not-evaluated');
    expect(thermalCase.recommendedT6xSettingS).toBeNull();
    expect(thermalCase.currentScalingFactor).toBe(1.21);
    expect(thermalCase.calculations.coefficients).toBeTruthy();
    expect(thermalCase.calculations.timingBandBasis.status).toBe('unqualified-current-scaling');
    expect(thermalCase.calculations.feasibleRange.toleranceAwareCandidatesS).toEqual([]);
  });

  test('retains failing explicit and rejects off-grid t6x candidates with calculation evidence', async ({ page }, testInfo) => {
    await loadThermalSample(page);
    await openEquipmentEditor(page);
    const editor = page.locator('#synthesis-equipment');
    const equipment = JSON.parse(await editor.inputValue());
    equipment[0].motor.rem610Thermal.candidateT6xSettingS = 2.0;
    await editor.fill(JSON.stringify(equipment, null, 2));
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-motor-thermal-review')).toBeVisible({ timeout: 30000 });
    const failed = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(failed.motorThermalValidation.status).toBe('fail');
    const failedCase = failed.motorThermalValidation.cases[0];
    expect(failedCase.status).toBe('fail');
    expect(failedCase.candidateT6xSettingS).toBe(2);
    expect(failedCase.candidateStatus).toBe('fail');
    expect(failedCase.calculations.candidate).toMatchObject({ t6xSettingS: 2, nominalFeasible: false, toleranceAwareFeasible: false });
    expect(failedCase.calculations.candidate.hotAccuracyS).toBeGreaterThanOrEqual(1);
    const failedReport = await downloadText(page, '#synthesis-download-report');
    expect(failedReport).toContain('explicit candidate');
    expect(failedReport).toContain('REM610_NO_FEASIBLE_SETTING');
    await fs.writeFile(testInfo.outputPath('motor-thermal-failed-candidate.json'), JSON.stringify(failed, null, 2));
    await fs.writeFile(testInfo.outputPath('motor-thermal-failed-candidate.txt'), failedReport);
    await page.locator('#synthesis-motor-thermal-review article').first().screenshot({ path: testInfo.outputPath('motor-thermal-failed-candidate.png'), style: '.top-nav { position: static !important; }' });
    await expect(page.locator('#synthesis-apply')).toBeDisabled();

    equipment[0].motor.rem610Thermal.candidateT6xSettingS = 2.1;
    await editor.fill(JSON.stringify(equipment, null, 2));
    await expect(page.locator('#synthesis-download-json')).toBeDisabled();
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-motor-thermal-review')).toContainText('REM610_T6X_SETTING_INVALID', { timeout: 30000 });
    const blocked = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(blocked.motorThermalValidation.status).toBe('blocked');
    expect(blocked.motorThermalValidation.issues.some(item => item.code === 'REM610_T6X_SETTING_INVALID')).toBe(true);
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
  });
});

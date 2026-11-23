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
  return fs.readFile(await (await pending).path(), 'utf8');
}

async function openEquipmentEditor(page) {
  const details = page.locator('details:has(#synthesis-equipment)');
  if (!(await details.evaluate(element => element.open))) await details.locator('summary').click();
}

async function fillEquipment(page, equipment) {
  await openEquipmentEditor(page);
  await page.locator('#synthesis-equipment').fill(JSON.stringify(equipment, null, 2));
}

async function loadRangeExample(page) {
  await page.locator('#synthesis-load-motor-stall-range-sample').click();
  await expect(page.locator('#synthesis-equipment')).toHaveValue(/"schemaVersion": "2.0.0"/);
  await expect(page.locator('#synthesis-equipment')).toHaveValue(/"stallCurrentRangeA"/);
}

async function generate(page) {
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-motor-protection-timing-review')).toBeVisible({ timeout: 30000 });
}

function reportPayload(report) {
  const marker = 'Complete JSON payload:';
  return JSON.parse(report.slice(report.indexOf(marker) + marker.length).trim());
}

test.describe('Design synthesis motor stall-current range screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(server.url('designsynthesis.html'));
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('retains synthetic v2 bounds across save/reload and keeps JSON/TXT evidence aligned', async ({ page }, testInfo) => {
    await loadRangeExample(page);
    const savedInput = await page.locator('#synthesis-equipment').inputValue();
    await page.reload();
    await expect(page.locator('#synthesis-equipment')).toHaveValue(savedInput);
    await generate(page);

    const proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    const validation = proposal.motorProtectionTimingValidation;
    expect(validation.status).toBe('pass');
    expect(validation.completeProtectionStatus).toBe('blocked');
    const result = validation.cases[0];
    expect(result.schemaVersion).toBe('2.0.0');
    expect(result.stallCurrentRangeA).toMatchObject({ minimumA: 80, maximumA: 110 });
    expect(result.networkLockedRotorCurrentA.status).toBe('recomputed-and-matched-to-acceleration');
    expect(result.networkLockedRotorCurrentA.valueA).toBeGreaterThan(80);
    expect(result.networkLockedRotorCurrentA.valueA).toBeLessThan(110);
    expect(result.comparisons.selectedStateSafeStall.status).toBe('pass');
    expect(result.comparisons.selectedStateSafeStall.referenceCurrentOnly).toBe(false);
    expect(result.devices).toHaveLength(2);
    for (const device of result.devices) {
      expect(device.stallRangeComparison.status).toBe('pass');
      expect(device.stallRangeComparison.points.length).toBeGreaterThanOrEqual(2);
      expect(device.stallRangeComparison.points.every(point => Number.isFinite(point.marginS))).toBe(true);
    }
    await expect(page.locator('#synthesis-motor-protection-timing-review')).toContainText('Supplied stall-current range clearing vs selected-state withstand');
    await expect(page.locator('#synthesis-motor-protection-timing-review')).toContainText('not a motor current trajectory');
    await expect(page.locator('#synthesis-motor-protection-timing-review')).toContainText('motor Apply remains blocked');
    await expect(page.locator('#synthesis-apply')).toBeDisabled();

    const report = await downloadText(page, '#synthesis-download-report');
    expect(report).toContain('supplied stall-current range clearing vs selected-state withstand');
    expect(report).toContain('Complete JSON payload:');
    const payload = reportPayload(report);
    expect(payload).toEqual(proposal);
    await fs.writeFile(testInfo.outputPath('motor-stall-range-proposal.json'), JSON.stringify(proposal, null, 2));
    await fs.writeFile(testInfo.outputPath('motor-stall-range-report.txt'), report);
    await page.locator('#synthesis-motor-protection-timing-review').screenshot({ path: testInfo.outputPath('motor-stall-range-positive.png'), style: '.top-nav { position: static !important; }' });

    const edited = JSON.parse(savedInput);
    edited[0].motor.protectionTiming.stallCurrentRangeA.reference += ' edited';
    await fillEquipment(page, edited);
    await expect(page.locator('#synthesis-download-json')).toBeDisabled();
    await expect(page.locator('#synthesis-download-report')).toBeDisabled();
  });

  test('fails at lower declared current even when the reference-current scalar would pass', async ({ page }, testInfo) => {
    await loadRangeExample(page);
    const equipment = JSON.parse(await page.locator('#synthesis-equipment').inputValue());
    const timing = equipment[0].motor.protectionTiming;
    timing.motorWithstand.coldMinimumSafeStallCurve = [
      { currentA: 80, minimumSafeStallTimeS: 17 },
      { currentA: 125, minimumSafeStallTimeS: 17 },
    ];
    timing.motorWithstand.hotMinimumSafeStallCurve = [
      { currentA: 80, minimumSafeStallTimeS: 10 },
      { currentA: 125, minimumSafeStallTimeS: 10 },
    ];
    await fillEquipment(page, equipment);
    await generate(page);

    const proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    const validation = proposal.motorProtectionTimingValidation;
    expect(validation.status).toBe('fail');
    const result = validation.cases[0];
    const breaker = result.devices.find(device => device.role === 'branch-breaker');
    const lowerPoint = breaker.stallRangeComparison.points.find(point => point.currentA === 80);
    expect(lowerPoint).toBeTruthy();
    const referencePoint = breaker.stallRangeComparison.points.find(point => point.currentA === 100);
    expect(referencePoint.maximumTotalCircuitClearingS).toBeCloseTo(12, 8);
    expect(referencePoint.minimumSafeStallTimeS).toBeCloseTo(17, 8);
    expect(referencePoint.marginS).toBeCloseTo(5, 8);
    const expectedLowerClearing = 12 * Math.exp(Math.log(80 / 100) * (Math.log(12 / 2000) / Math.log(100 / 10)));
    expect(lowerPoint.maximumTotalCircuitClearingS).toBeCloseTo(expectedLowerClearing, 6);
    expect(lowerPoint.minimumSafeStallTimeS).toBeCloseTo(17, 8);
    expect(lowerPoint.marginS).toBeCloseTo(17 - expectedLowerClearing, 6);
    expect(lowerPoint.status).toBe('fail');
    const overload = result.devices.find(device => device.role === 'overload-relay');
    const overloadPoint = overload.stallRangeComparison.points.find(point => point.currentA === 80);
    const expectedOverloadClearing = 6 * Math.exp(Math.log(80 / 100) * (Math.log(6 / 1500) / Math.log(100 / 10)));
    expect(overloadPoint.maximumTotalCircuitClearingS).toBeCloseTo(expectedOverloadClearing, 6);
    expect(overloadPoint.minimumSafeStallTimeS).toBeCloseTo(17, 8);
    expect(overloadPoint.marginS).toBeCloseTo(17 - expectedOverloadClearing, 6);
    expect(overloadPoint.status).toBe('pass');
    expect(result.comparisons.selectedStateSafeStall.status).toBe('fail');
    expect(result.comparisons.selectedStateSafeStall.limitingCurrentA).toBe(80);
    expect(validation.completeProtectionStatus).toBe('blocked');
    await expect(page.locator('#synthesis-apply')).toBeDisabled();

    const report = await downloadText(page, '#synthesis-download-report');
    expect(report).toContain('80 A: minimum trip');
    expect(report).toContain(expectedLowerClearing.toFixed(5));
    expect(reportPayload(report)).toEqual(proposal);
    await fs.writeFile(testInfo.outputPath('motor-stall-range-failed-proposal.json'), JSON.stringify(proposal, null, 2));
    await fs.writeFile(testInfo.outputPath('motor-stall-range-failed-report.txt'), report);
    await page.locator('#synthesis-motor-protection-timing-review').screenshot({ path: testInfo.outputPath('motor-stall-range-failing.png'), style: '.top-nav { position: static !important; }' });
  });

  test('blocks an invalid range and renders untrusted range references as text', async ({ page }, testInfo) => {
    await loadRangeExample(page);
    const equipment = JSON.parse(await page.locator('#synthesis-equipment').inputValue());
    equipment[0].motor.protectionTiming.stallCurrentRangeA.minimumA = 120;
    await fillEquipment(page, equipment);
    await generate(page);
    let proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(proposal.motorProtectionTimingValidation.status).toBe('blocked');
    expect(proposal.motorProtectionTimingValidation.issues.some(issue => issue.code === 'MOTOR_PROTECTION_TIMING_STALL_CURRENT_RANGE')).toBe(true);
    expect(proposal.motorProtectionTimingValidation.cases.every(item => !item.devices)).toBe(true);
    const blockedReport = await downloadText(page, '#synthesis-download-report');
    expect(reportPayload(blockedReport)).toEqual(proposal);
    await fs.writeFile(testInfo.outputPath('motor-stall-range-blocked-proposal.json'), JSON.stringify(proposal, null, 2));
    await fs.writeFile(testInfo.outputPath('motor-stall-range-blocked-report.txt'), blockedReport);
    await page.locator('#synthesis-motor-protection-timing-review').screenshot({ path: testInfo.outputPath('motor-stall-range-blocked.png') });
    await expect(page.locator('#synthesis-apply')).toBeDisabled();

    equipment[0].motor.protectionTiming.stallCurrentRangeA.minimumA = 80;
    equipment[0].motor.protectionTiming.stallCurrentRangeA.reference = '<b data-stall-untrusted>unsafe</b>';
    await fillEquipment(page, equipment);
    await generate(page);
    proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(proposal.motorProtectionTimingValidation.status).toBe('pass');
    const review = page.locator('#synthesis-motor-protection-timing-review');
    await expect(review).toContainText('<b data-stall-untrusted>unsafe</b>');
    await expect(review.locator('[data-stall-untrusted]')).toHaveCount(0);
  });

  test('renders and reports mixed V1 and V2 motors with their own comparison scopes', async ({ page }, testInfo) => {
    await loadRangeExample(page);
    const equipment = JSON.parse(await page.locator('#synthesis-equipment').inputValue());
    const first = equipment[0];
    const second = equipment[1];
    second.kw = first.kw;
    second.voltage = first.voltage;
    second.phases = first.phases;
    second.powerFactor = first.powerFactor;
    second.duty = first.duty;
    second.ratingsBasis = first.ratingsBasis;
    const v1 = structuredClone(first.motor.protectionTiming);
    v1.schemaVersion = '1.0.0';
    delete v1.stallCurrentRangeA;
    v1.motorWithstand = {
      referenceCurrentA: 100,
      hotMinimumSafeStallTimeS: 10,
      coldMinimumSafeStallTimeS: 15,
      hotConditions: structuredClone(v1.motorWithstand.hotConditions),
      coldConditions: structuredClone(v1.motorWithstand.coldConditions),
      source: structuredClone(v1.motorWithstand.source),
    };
    second.motor = { ...structuredClone(first.motor), protectionTiming: v1 };
    await fillEquipment(page, equipment);

    const accelerationDetails = page.locator('details:has(#synthesis-motor-acceleration)');
    if (!(await accelerationDetails.evaluate(element => element.open))) await accelerationDetails.locator('summary').click();
    const acceleration = JSON.parse(await page.locator('#synthesis-motor-acceleration').inputValue());
    acceleration[second.id] = structuredClone(acceleration[first.id]);
    await page.locator('#synthesis-motor-acceleration').fill(JSON.stringify(acceleration, null, 2));
    await generate(page);

    const proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    const resultCases = proposal.motorProtectionTimingValidation.cases;
    expect(resultCases).toHaveLength(2);
    expect(resultCases.map(item => item.schemaVersion).sort()).toEqual(['1.0.0', '2.0.0']);
    expect(proposal.motorProtectionTimingValidation.completeProtectionStatus).toBe('blocked');
    const review = page.locator('#synthesis-motor-protection-timing-review');
    const caseArticles = review.locator(':scope > article');
    await expect(caseArticles).toHaveCount(2);
    await expect(review).toContainText('Bounded reference-current timing screen');
    await expect(review).toContainText('Supplied stall-current range clearing vs selected-state withstand');
    await expect(caseArticles.filter({ hasText: 'Bounded reference-current timing screen' })).toHaveCount(1);
    await expect(caseArticles.filter({ hasText: 'Supplied stall-current range clearing vs selected-state withstand' })).toHaveCount(1);
    const report = await downloadText(page, '#synthesis-download-report');
    expect(report).toContain('(V1 reference-current screen)');
    expect(report).toContain('stall-current range clearing vs selected-state withstand');
    expect(reportPayload(report)).toEqual(proposal);
    await fs.writeFile(testInfo.outputPath('motor-stall-range-mixed-proposal.json'), JSON.stringify(proposal, null, 2));
    await fs.writeFile(testInfo.outputPath('motor-stall-range-mixed-report.txt'), report);
    await review.screenshot({ path: testInfo.outputPath('motor-stall-range-mixed.png') });
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
  });
});

import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './staticServer.helper.js';
import { motorRevisionFixture } from '../tests/helpers/motorAccelerationRevisionFixture.mjs';

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

async function openAccelerationEditor(page) {
  await page.locator('details:has(#synthesis-motor-acceleration) summary').click();
}

async function importDraft(page, draft, name) {
  await page.locator('#synthesis-import').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(draft)) });
  await expect(page.locator('#synthesis-status')).toContainText(`Imported ${name}`);
}

test.describe('Design synthesis motor acceleration screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(server.url('designsynthesis.html'));
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  });

  test('evaluates the synthetic referenced curve, reports the timeline, and invalidates on inertia and criterion edits', async ({ page }, testInfo) => {
    await page.locator('#synthesis-load-motor-acceleration-sample').click();
    await expect(page.locator('#synthesis-motor-acceleration')).toHaveValue(/Synthetic 60 Hz squirrel-cage/);
    const originalText = await page.locator('#synthesis-motor-acceleration').inputValue();
    await page.reload();
    await openAccelerationEditor(page);
    await expect(page.locator('#synthesis-motor-acceleration')).toHaveValue(originalText);

    const draft = await page.evaluate(() => window.dataStore.getItem('designSynthesisDraft'));
    await page.locator('#synthesis-import').setInputFiles({ name: 'motor-acceleration-draft.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(draft)) });
    await expect(page.locator('#synthesis-status')).toContainText('Imported motor-acceleration-draft.json');
    await expect(page.locator('#synthesis-motor-acceleration')).toHaveValue(originalText);
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-motor-acceleration-review')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#synthesis-apply')).toBeDisabled();

    const proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    const result = proposal.motorAccelerationValidation;
    expect(result.status).toBe('evaluated');
    expect(result.method).toBe('balanced-dol-quasi-steady-acceleration-v1');
    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].status).toBe('evaluated');
    expect(result.cases[0].timeS).toBeGreaterThan(0);
    expect(result.cases[0].electricalExposureA2S).toBeGreaterThan(0);
    expect(result.cases[0].timeline.length).toBeGreaterThan(2);
    expect(result.cases[0].refinement.estimatedRelativeError).toBeLessThanOrEqual(1e-4);
    expect(result.cases[0].criterionStatus).toMatch(/^(pass|fail)$/);
    await expect(page.locator('#synthesis-motor-acceleration-review')).toContainText('exposure only, not thermal withstand');
    await expect(page.locator('#synthesis-motor-acceleration-review')).toContainText('Synthetic 60 Hz squirrel-cage speed/current/PF/torque curve');

    const report = await downloadText(page, '#synthesis-download-report');
    expect(report).toContain('Quasi-steady motor acceleration screen');
    expect(report).toContain('electrical I²t exposure');
    expect(report).toContain('Motor M-01');
    await fs.writeFile(testInfo.outputPath('motor-acceleration-review.txt'), report);
    await page.locator('#synthesis-motor-acceleration-review').screenshot({ path: testInfo.outputPath('motor-acceleration-review.png') });
    await page.locator('#synthesis-motor-acceleration-review article').first().screenshot({ path: testInfo.outputPath('motor-acceleration-review-case.png') });

    const edited = JSON.parse(originalText);
    edited[Object.keys(edited)[0]].motorInertiaKgM2 *= 2;
    await page.locator('#synthesis-motor-acceleration').fill(JSON.stringify(edited, null, 2));
    await page.locator('[data-motor-acceleration-criterion="maximumTimeS"]').fill('0.001');
    await page.locator('[data-motor-acceleration-criterion="maximumTimeS"]').press('Tab');
    await expect(page.locator('#synthesis-download-json')).toBeDisabled();
    await expect(page.locator('#synthesis-download-report')).toBeDisabled();
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-motor-acceleration-review')).toContainText('fail', { timeout: 30000 });
    const revised = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    await fs.writeFile(testInfo.outputPath('motor-acceleration-revised-proposal.json'), JSON.stringify(revised, null, 2));
    expect(revised.motorAccelerationValidation.modelInputFingerprint).not.toBe(result.modelInputFingerprint);
    expect(revised.motorAccelerationValidation.cases[0].timeS).toBeGreaterThan(result.cases[0].timeS);
    expect(revised.motorAccelerationValidation.cases[0].criterionStatus).toBe('fail');
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
  });

  test('retains malformed curve JSON across reload and blocks the stale proposal and downloads', async ({ page }) => {
    await page.locator('#synthesis-load-motor-acceleration-sample').click();
    await openAccelerationEditor(page);
    await page.locator('#synthesis-motor-acceleration').fill('{ invalid acceleration JSON');
    await expect(page.locator('#synthesis-status')).toContainText('invalid and retained');
    await expect(page.locator('#synthesis-download-json')).toBeDisabled();
    await expect(page.locator('#synthesis-download-report')).toBeDisabled();
    await page.reload();
    await openAccelerationEditor(page);
    await expect(page.locator('#synthesis-motor-acceleration')).toHaveValue('{ invalid acceleration JSON');
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-status')).toContainText('Motor acceleration JSON is invalid');
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
    await expect(page.locator('#synthesis-download-json')).toBeDisabled();
  });

  test('retains the shared revision budget and unchanged acceleration limit while revising only the failed motor path', async ({ page }, testInfo) => {
    const input = motorRevisionFixture(25);
    input.criteria.loadFlow.maxRevisions = 0;
    input.criteria.motorAcceleration.maximumTimeS = 2.03;
    await importDraft(page, input, 'motor-acceleration-revision-zero.json');
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-motor-acceleration-review')).toBeVisible({ timeout: 30000 });
    const initial = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    const initialValidation = initial.motorAccelerationValidation;
    const motorId = String(input.equipment[0].id);
    const initialCase = initialValidation.revision.history[0].accelerationCases.find(item => item.motorId === motorId);
    expect(initialValidation.criteria.maximumTimeS).toBe(2.03);
    expect(initial.inputs.criteria.loadFlow.maxRevisions).toBe(0);
    expect(initialValidation.revision.status).toBe('stopped');
    expect(initialCase.timeS).toBeCloseTo(2.05461, 4);
    expect(initialCase.criterionStatus).toBe('fail');
    expect(initialValidation.revision.history[0].startingStatus).toBe('pass');
    expect(initial.cables.find(item => item.id === 'C-LOAD-1').conductor_size).toBe('#8 AWG');

    input.criteria.loadFlow.maxRevisions = 1;
    await importDraft(page, input, 'motor-acceleration-revision-one.json');
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-motor-acceleration-review')).toContainText('Revision', { timeout: 30000 });
    await expect(page.locator('#synthesis-motor-acceleration-review')).toContainText('Shared-budget revision history');
    await expect(page.locator('#synthesis-motor-acceleration-review')).toContainText('2.03 s maximum');
    const revised = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    await fs.writeFile(testInfo.outputPath('motor-acceleration-revised-proposal.json'), JSON.stringify(revised, null, 2));
    const validation = revised.motorAccelerationValidation;
    expect(validation.revision.status).toBe('complete');
    expect(validation.revision.stopReason).toBeNull();
    expect(validation.criteria.maximumTimeS).toBe(2.03);
    expect(revised.inputs.criteria.motorAcceleration.maximumTimeS).toBe(2.03);
    expect(revised.inputs.criteria.loadFlow.maxRevisions).toBe(1);
    expect(validation.revision.history).toHaveLength(2);
    expect(validation.revision.history[0].accelerationCases.find(item => item.motorId === motorId).criterionStatus).toBe('fail');
    const finalRow = validation.revision.history[1];
    expect(finalRow.startingStatus).toBe('pass');
    expect(finalRow.accelerationCases.find(item => item.motorId === motorId).timeS).toBeCloseTo(2.0124, 4);
    expect(finalRow.accelerationCases.find(item => item.motorId === motorId).criterionStatus).toBe('pass');
    expect(finalRow.changedCircuits).toEqual(expect.arrayContaining([
      { id: 'F-DP-01', size: '#6 AWG' },
      { id: 'C-LOAD-1', size: '#6 AWG' },
    ]));
    expect(revised.cables.find(item => item.id === 'F-DP-01').conductor_size).toBe('#6 AWG');
    expect(revised.cables.find(item => item.id === 'C-LOAD-1').conductor_size).toBe('#6 AWG');
    await page.locator('#synthesis-motor-acceleration-review table').nth(1).screenshot({ path: testInfo.outputPath('motor-acceleration-revision-history.png') });
    const report = await downloadText(page, '#synthesis-download-report');
    await fs.writeFile(testInfo.outputPath('motor-acceleration-revised-report.txt'), report);
    expect(report).toContain('shared criteria.loadFlow.maxRevisions budget 1');
    expect(report).toContain('2.03 s');
    expect(report).toContain('Revision 1: pass');
    expect(report).toContain('F-DP-01=#6 AWG');
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
  });

  test('blocks a missing curve and reports a torque-limited stall without enabling motor Apply', async ({ page }) => {
    await page.locator('#synthesis-load-motor-acceleration-sample').click();
    await openAccelerationEditor(page);
    const textarea = page.locator('#synthesis-motor-acceleration');
    const curves = JSON.parse(await textarea.inputValue());
    const motorId = Object.keys(curves)[0];
    const full = structuredClone(curves);
    await textarea.fill(JSON.stringify({ [`${motorId}-TYPO`]: curves[motorId] }, null, 2));
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-status')).toContainText('does not match an equipment ID');
    await expect(textarea).toHaveValue(/M-01-TYPO/);
    await expect(page.locator('#synthesis-download-json')).toBeDisabled();
    await expect(page.locator('#synthesis-download-report')).toBeDisabled();
    await expect(page.locator('#synthesis-apply')).toBeDisabled();

    delete curves[motorId].performanceCurve;
    await textarea.fill(JSON.stringify(curves, null, 2));
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
    const blocked = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(blocked.motorAccelerationValidation.status).toBe('blocked');
    expect(blocked.motorAccelerationValidation.issues.some(item => item.code === 'ACCELERATION_OBJECT_REQUIRED')).toBe(true);
    await expect(page.locator('#synthesis-apply')).toBeDisabled();

    full[motorId].loadTorqueCurve.points = full[motorId].loadTorqueCurve.points.map(point => ({ ...point, torqueNm: 100 }));
    await textarea.fill(JSON.stringify(full, null, 2));
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-motor-acceleration-review')).toContainText('insufficient-positive-acceleration-torque', { timeout: 30000 });
    const stalled = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(stalled.motorAccelerationValidation.status).toBe('evaluated');
    expect(stalled.motorAccelerationValidation.cases[0]).toMatchObject({ status: 'fail', timeS: null, criterionStatus: 'not-evaluated', failure: 'insufficient-positive-acceleration-torque' });
    expect(stalled.motorAccelerationValidation.cases[0].failedAtSpeedRpm).toBeGreaterThanOrEqual(0);
    expect(stalled.checks.find(item => item.id === 'motorAcceleration').status).toBe('fail');
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
  });
});

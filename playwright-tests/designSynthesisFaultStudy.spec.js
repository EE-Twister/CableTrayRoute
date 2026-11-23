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

test('explicit motor equivalents appear as infeed contributions while full motor protection stays blocked', async ({ page }, testInfo) => {
  await page.goto(server.url('designsynthesis.html?e2e=fault-study'));
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Load motor fault network sample', exact: true }).click();
  await expect(page.locator('#synthesis-status')).toContainText('Synthetic motor fault network sample loaded');

  const faultDetails = page.locator('details:has(#synthesis-fault-study)');
  if (!await faultDetails.evaluate(element => element.open)) await faultDetails.locator('summary').click();
  await expect(faultDetails).toHaveAttribute('open', '');
  const editor = page.getByRole('textbox', { name: 'Fault network JSON', exact: true });
  const sampleInput = JSON.parse(await editor.inputValue());
  const motorId = sampleInput.sources.find(row => row.reference.includes('motor positive-sequence')).equipmentId;
  await page.locator('#synthesis-generate').click();

  const review = page.locator('#synthesis-fault-study-review');
  await expect(review).toContainText('Optional fault-network study');
  await expect(review).toContainText('Per-infeed fault-current contributions');
  await expect(review).toContainText('Actual source-terminal currents');
  await expect(review).toContainText('not independently verified');
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  const first = await downloadJson(page);
  expect(first.faultStudyValidation.status).toBe('evaluated');
  expect(first.faultStudyValidation.scope).toBe('initial-symmetrical-rms-only');
  expect(first.checks.find(row => row.id === 'motorProtection').status).toBe('fail');
  const motorCase = first.faultStudyValidation.cases.find(row => (row.busId || row.fault?.busId) === motorId);
  expect(motorCase).toBeTruthy();
  const motorResult = motorCase.result || motorCase;
  expect(motorResult.status).toBe('evaluated');
  expect(motorResult.fault.faultCurrentRmsKA).toBeGreaterThan(0);
  const motorContribution = motorResult.sourceFaultContributions.find(row => row.sourceId === motorId);
  expect(motorContribution.currentKA.magnitude).toBeGreaterThan(0);
  expect(motorResult.sourceTerminalCurrents.some(row => row.sourceId === motorId)).toBe(true);

  const report = (await downloadReport(page)).split('Complete JSON payload:')[0];
  expect(report).toContain('Optional fault network study:');
  expect(report).toContain(`Fault-current contribution from ${motorId}`);
  expect(report).toContain('not source-terminal current');
  expect(report).toContain('not independently verified');
  expect(report).toContain('do not establish minimum/maximum, peak/interrupting, thermal');
  await fs.writeFile(testInfo.outputPath('fault-study-motor-report.txt'), report);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await review.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -80));
  await review.screenshot({ path: testInfo.outputPath('fault-study-motor-review.png'), fullPage: true });
  await review.locator(':scope > table').screenshot({ path: testInfo.outputPath('fault-study-summary.png') });
  await review.locator('article').first().screenshot({ path: testInfo.outputPath('fault-study-first-bus.png') });

  const editedInput = JSON.parse(await editor.inputValue());
  const motorSource = editedInput.sources.find(row => row.equipmentId === motorId);
  motorSource.impedance.rOhm = 2;
  await editor.fill(JSON.stringify(editedInput, null, 2));
  await expect(page.locator('#synthesis-download-json')).toBeDisabled();
  await page.locator('#synthesis-generate').click();
  const changed = await downloadJson(page);
  expect(changed.faultStudyValidation.modelInputFingerprint).not.toBe(first.faultStudyValidation.modelInputFingerprint);
  const changedCase = changed.faultStudyValidation.cases.find(row => (row.busId || row.fault?.busId) === motorId);
  const changedResult = changedCase.result || changedCase;
  expect(changedResult.fault.faultCurrentRmsKA).not.toBe(motorResult.fault.faultCurrentRmsKA);
  expect(changedResult.sourceFaultContributions.find(row => row.sourceId === motorId).currentKA.magnitude)
    .not.toBe(motorContribution.currentKA.magnitude);
  await expect(page.locator('#synthesis-apply')).toBeDisabled();

  const incompleteInput = JSON.parse(await editor.inputValue());
  incompleteInput.sources = incompleteInput.sources.filter(row => row.equipmentId !== motorId);
  await editor.fill(JSON.stringify(incompleteInput, null, 2));
  await page.locator('#synthesis-generate').click();
  const incomplete = await downloadJson(page);
  expect(incomplete.faultStudyValidation.status).toBe('blocked');
  expect(incomplete.faultStudyValidation.issues.length).toBeGreaterThan(0);
  for (const item of incomplete.faultStudyValidation.cases || []) {
    const result = item.result || item;
    expect(result.fault?.faultCurrentRmsKA ?? result.fault?.totalFaultCurrentKA?.magnitude ?? null).toBeNull();
  }
  await expect(page.locator('#synthesis-apply')).toBeDisabled();

  const malformedShape = JSON.parse(await editor.inputValue());
  malformedShape.sources = { equipmentId: motorId };
  await editor.fill(JSON.stringify(malformedShape, null, 2));
  await page.locator('#synthesis-generate').click();
  const malformedShapeProposal = await downloadJson(page);
  expect(malformedShapeProposal.faultStudyValidation.status).toBe('blocked');
  expect(malformedShapeProposal.faultStudy.sources).toEqual({ equipmentId: motorId });
  await expect(review).toContainText('blocked');
  expect(await downloadReport(page)).toContain('Modeled source coverage');

  malformedShape.sources = [null];
  await editor.fill(JSON.stringify(malformedShape, null, 2));
  await page.locator('#synthesis-generate').click();
  const nullSourceProposal = await downloadJson(page);
  expect(nullSourceProposal.faultStudyValidation.status).toBe('blocked');
  expect(nullSourceProposal.faultStudy.sources).toEqual([null]);
  await expect(review).toContainText('reference missing');
  expect(await downloadReport(page)).toContain('Input source unknown');

  await editor.fill('{malformed fault input');
  await page.locator('#synthesis-generate').click();
  const malformed = await downloadJson(page);
  expect(malformed.faultStudy).toBe('{malformed fault input');
  expect(malformed.faultStudyValidation.status).toBe('blocked');
  await page.reload();
  await page.getByText('Advanced fault network JSON', { exact: true }).click();
  await expect(editor).toHaveValue('{malformed fault input');
  await expect(page.locator('#synthesis-download-json')).toBeDisabled();

  await editor.fill('');
  await page.locator('#synthesis-generate').click();
  const omitted = await downloadJson(page);
  expect(Object.hasOwn(omitted, 'faultStudy')).toBe(false);
  expect(Object.hasOwn(omitted, 'faultStudyValidation')).toBe(false);
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
});

test('evaluated nonmotor fault summary survives named-project Apply and reload', async ({ page }) => {
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  const supply = JSON.parse(await page.locator('#synthesis-supply').inputValue());
  const explicitStudy = {
    networkBaseMVA: 1,
    sourceInventory: { status: 'complete', reference: 'Synthetic utility-only source inventory for a nonmotor persistence demonstration.' },
    sources: [{
      equipmentId: supply.id,
      emfPhaseV: { re: supply.voltage / Math.sqrt(3), im: 0 },
      impedance: { rOhm: 0.006, xOhm: 0.015 },
      inService: true,
      reference: 'Synthetic utility positive-sequence equivalent; not field or manufacturer data.',
    }],
  };
  await page.getByText('Advanced fault network JSON', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Fault network JSON', exact: true }).fill(JSON.stringify(explicitStudy, null, 2));
  await page.locator('#synthesis-generate').click();
  const proposal = await downloadJson(page);
  expect(proposal.status).toBe('proposal');
  expect(proposal.faultStudyValidation.status).toBe('evaluated');
  expect(proposal.deviceFaultValidation.status).toBe('evaluated');
  await expect(page.locator('#synthesis-apply')).toBeEnabled();

  await page.locator('#synthesis-apply').click();
  await expect(page.getByRole('heading', { name: 'Create New Project' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('dialog', { name: 'Create New Project' }).locator('[name="projectName"]').fill('Fault Study Persistence Acceptance');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a Project Template' })).toBeVisible({ timeout: 10000 });
  await page.locator('[data-template-id="blank"]').click();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Use Template', exact: true }).click()]);
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated', { timeout: 20000 });
  await page.locator('#synthesis-apply').click();
  await page.waitForURL(/cableschedule\.html/, { timeout: 15000 });

  const readSavedFaultStudy = () => page.evaluate(() => window.dataStore.getItem('designSynthesisFaultStudyValidation', null, window.dataStore.getCurrentScenario()));
  await expect.poll(readSavedFaultStudy).toMatchObject({ status: 'evaluated', scope: 'initial-symmetrical-rms-only' });
  const saved = await readSavedFaultStudy();
  const readSavedDeviceStudy = () => page.evaluate(() => window.dataStore.getItem('designSynthesisDeviceFaultValidation', null, window.dataStore.getCurrentScenario()));
  const savedDevice = await readSavedDeviceStudy();
  expect(savedDevice).toMatchObject({ status: 'evaluated', encoding: 'device-fault-packed-reference-v1', networkModelInputFingerprint: saved.modelInputFingerprint });
  expect(savedDevice.placementCount).toBeGreaterThan(0);
  expect(savedDevice.placementEvidenceRefsBase64.length).toBeGreaterThan(0);
  expect(saved.input.sources[0].reference).toContain('Synthetic utility');
  expect(saved.cases.length).toBeGreaterThan(0);
  expect(saved.cases[0].totalFaultCurrentKA).toBeGreaterThan(0);
  await page.reload();
  await expect.poll(readSavedFaultStudy).toMatchObject({ status: 'evaluated', scope: 'initial-symmetrical-rms-only' });
  expect((await readSavedFaultStudy()).modelInputFingerprint).toBe(saved.modelInputFingerprint);
  expect(await readSavedDeviceStudy()).toEqual(savedDevice);
});

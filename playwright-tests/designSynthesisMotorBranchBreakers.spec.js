import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;

test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

async function downloadJson(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await pending;
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

async function downloadText(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await pending;
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

test('inverse-time breaker sample keeps an exact screening candidate visible and never enables Apply', async ({ page }, testInfo) => {
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Load motor breaker research sample', exact: true }).click();
  await expect(page.locator('#synthesis-status')).toContainText('Synthetic breaker research sample loaded');
  await expect(page.getByRole('combobox', { name: 'Motor branch protection method', exact: true })).toHaveValue('inverse-time-breaker');
  await expect(page.getByRole('combobox', { name: 'Proposed TM230 instantaneous pickup (A)', exact: true })).toHaveValue('150');
  await expect(page.getByRole('combobox', { name: 'Motor rotor type 1', exact: true })).toHaveValue('squirrel-cage');

  await page.locator('#synthesis-generate').click();
  const review = page.locator('#synthesis-motor-starter-review');
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  await expect(review).toContainText('3RT2027-1BB40 + 3RU2126-4AB0 + 3VA5125-6EC31-0AA0');
  await expect(review).toContainText('25 A');
  await expect(review).toContainText('proposed instantaneous setting 150 A (not verified installed)');
  await expect(review).toContainText('not an assembled-panel SCCR');
  await expect(review).toContainText('groundingAndCompleteFaultDuty — unevaluated');

  const proposal = await downloadJson(page, '#synthesis-download-json');
  const cable = proposal.cables.find(row => row.loadId === proposal.loads[0].id);
  const candidate = proposal.motorStarterCandidates.cases[0].candidate;
  expect(candidate.selectedForApply).toBe(false);
  expect(candidate.branchCircuitBreaker.catalogNumber).toBe('3VA5125-6EC31-0AA0');
  expect(cable.protectiveDevice.catalogNumber).toBe(candidate.branchCircuitBreaker.catalogNumber);
  expect(cable.protectiveDevice.libraryStatus).toBe('screening');
  expect(cable.ampacityA).toBeGreaterThanOrEqual(25);
  expect(cable.motor.designAmpacityA).toBe(17.5);
  expect(cable.motor.branchBreakerAmpacityFloorA).toBe(25);
  const connection = proposal.oneLine.sheets[0].connections.find(row => row.cableRef === cable.id);
  expect(connection.cable.protectiveDevice.catalogNumber).toBe(candidate.branchCircuitBreaker.catalogNumber);
  expect(connection.cable.motor.designAmpacityA).toBe(17.5);
  expect(proposal.checks.find(row => row.id === 'motorProtection').status).toBe('fail');
  expect(proposal.studyValidation.status).toBe('pass');
  const report = (await downloadText(page, '#synthesis-download-report')).split('Complete JSON payload:')[0];
  for (const text of ['3RT2027-1BB40', '3RU2126-4AB0', '3VA5125-6EC31-0AA0', 'not an assembled-panel SCCR', 'groundingAndCompleteFaultDuty [unevaluated]', 'research protection remains unresolved']) expect(report).toContain(text);
  expect(report).toContain('Conditional rating note: 65 kA at 480 V, Type 1');
  expect(report).not.toContain('3RV2021');
  expect(report).toContain('3VA5125-6EC31-0AA0');
  expect(report).not.toContain('3RV2021-4AA10');
  await fs.writeFile(testInfo.outputPath('motor-branch-breaker-review-report.txt'), report);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await review.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -80));
  await review.screenshot({ path: testInfo.outputPath('motor-branch-breaker-review.png') });

  const method = page.getByRole('combobox', { name: 'Motor branch protection method', exact: true });
  const pickup = page.getByRole('combobox', { name: 'Proposed TM230 instantaneous pickup (A)', exact: true });
  await method.selectOption('inverse-time-breaker');
  await pickup.selectOption('180');
  await expect(page.locator('#synthesis-download-json')).toBeDisabled();
  await page.locator('#synthesis-generate').click();
  const changed = await downloadJson(page, '#synthesis-download-json');
  expect(changed.inputSignature).not.toBe(proposal.inputSignature);
  expect(changed.motorStarterCandidates.cases[0].candidate.branchCircuitBreaker.instantaneousPickupA).toBe(180);
  await expect(page.locator('#synthesis-apply')).toBeDisabled();

  const rotor = page.getByRole('combobox', { name: 'Motor rotor type 1', exact: true });
  await rotor.selectOption('wound-rotor');
  await expect(page.locator('#synthesis-download-json')).toBeDisabled();
  await expect(page.locator('#synthesis-download-report')).toBeDisabled();
  await page.locator('#synthesis-generate').click();
  const rejected = await downloadJson(page, '#synthesis-download-json');
  expect(rejected.motorStarterCandidates.cases[0].candidate).toBeNull();
  expect(rejected.cables.find(row => row.loadId === cable.loadId).protectiveDevice).toBeNull();
  expect(rejected.studyValidation.status).toBe('pass');
  await expect(review).toContainText('rotorType — fail');
  const rejectedReport = (await downloadText(page, '#synthesis-download-report')).split('Complete JSON payload:')[0];
  expect(rejectedReport).toContain('rotorType [fail]');
  expect(rejectedReport).toContain('3RU2126_CoC_202505131337157102.pdf');
  expect(rejectedReport).not.toContain('undefined');
  await fs.writeFile(testInfo.outputPath('motor-branch-breaker-rejected-report.txt'), rejectedReport);
  await expect(page.locator('#synthesis-apply')).toBeDisabled();

  const invalidDraft = structuredClone(changed.inputs.original);
  invalidDraft.criteria.motorStarter.instantaneousPickupA = 151;
  await page.locator('#synthesis-import').setInputFiles({ name: 'unsupported-pickup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalidDraft)) });
  await expect(pickup).toHaveValue('151');
  await expect(pickup.locator('option:checked')).toContainText('Unsupported value');
  await page.locator('#synthesis-generate').click();
  const invalid = await downloadJson(page, '#synthesis-download-json');
  expect(invalid.issues.some(row => row.code === 'INVALID_MOTOR_STARTER_INSTANTANEOUS_PICKUP')).toBe(true);
  expect(invalid.inputs.original.criteria.motorStarter.instantaneousPickupA).toBe(151);
  await page.reload();
  await expect(pickup).toHaveValue('151');
  await expect(rotor).toHaveValue('squirrel-cage');
  await expect(method).toHaveValue('inverse-time-breaker');
  await expect(page.locator('#synthesis-download-json')).toBeDisabled();
  await pickup.selectOption('180');
  await method.selectOption('manual-controller');
  await page.locator('#synthesis-generate').click();
  const mismatched = await downloadJson(page, '#synthesis-download-json');
  expect(mismatched.issues.some(row => row.code === 'MISMATCHED_MOTOR_BRANCH_PICKUP_METHOD')).toBe(true);
  await method.selectOption('inverse-time-breaker');
  await page.locator('#synthesis-generate').click();
  const recovered = await downloadJson(page, '#synthesis-download-json');
  expect(recovered.motorStarterCandidates.cases[0].candidate.branchCircuitBreaker.instantaneousPickupA).toBe(180);
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
});

test('30 A breaker curve research stays exact-candidate-only and screening-only', async ({ page }, testInfo) => {
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Load motor breaker research sample', exact: true }).click();
  await page.locator('#synthesis-generate').click();
  const sampleProposal = await downloadJson(page, '#synthesis-download-json');

  const thirtyAmpDraft = structuredClone(sampleProposal.inputs.original);
  const motorLoad = thirtyAmpDraft.equipment.find(row => row.motor);
  motorLoad.motor.fullLoadCurrentA = 22;
  motorLoad.motor.fullLoadCurrentBasis = {
    reference: 'Synthetic design-FLC override for candidate selection only; not motor nameplate current.'
  };
  await page.locator('#synthesis-import').setInputFiles({
    name: 'motor-breaker-30a-research-draft.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(thirtyAmpDraft))
  });
  await page.locator('#synthesis-generate').click();

  const review = page.locator('#synthesis-motor-starter-review');
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  await expect(review).toContainText('3RT2027-1BB40 + 3RU2126-4AB0 + 3VA5130-6EC31-0AA0');
  await expect(review).toContainText('A matching Siemens graphic for the 30 A TM230 configuration is located');
  await expect(review).toContainText('40 C cold-start nominal thermal trace with illustrated tolerances, not guaranteed thermal clearing');
  await expect(review).toContainText('30 A graphic applies only to 3VA5130-6EC31-0AA0 and is not transferable');
  await expect(review).toContainText('not a guaranteed thermal-clearing envelope');
  await expect(review).toContainText('maximum clearing and minimum tripping only');
  await expect(page.locator('#synthesis-apply')).toBeDisabled();

  const proposal = await downloadJson(page, '#synthesis-download-json');
  const starterCase = proposal.motorStarterCandidates.cases.find(item => item.motorId === motorLoad.id);
  const candidate25 = starterCase.candidates.find(item => item.branchCircuitBreaker.catalogNumber === '3VA5125-6EC31-0AA0');
  const candidate30 = starterCase.candidates.find(item => item.branchCircuitBreaker.catalogNumber === '3VA5130-6EC31-0AA0');
  expect(starterCase.candidate.branchCircuitBreaker.catalogNumber).toBe('3VA5130-6EC31-0AA0');
  expect(starterCase.candidate.selectedForApply).toBe(false);
  expect(candidate25.curveResearch).toMatchObject({
    status: 'exact-source-missing',
    matchingManufacturerGraphicAvailable: false,
    exactCandidateCatalogNumber: '3VA5125-6EC31-0AA0',
    sourceId: null,
    sourceUrl: null
  });
  expect(candidate25.curveResearch.sourceAvailability).toContain('30 A graphic applies only to 3VA5130-6EC31-0AA0 and is not transferable');
  expect(candidate30.curveResearch).toMatchObject({
    status: 'matching-graphic-located-unqualified',
    matchingManufacturerGraphicAvailable: true,
    exactCandidateCatalogNumber: '3VA5130-6EC31-0AA0',
    sourceId: 'siemens-3va5130-30a-tcc-2018-02-01',
    sourceUrl: expect.stringContaining('SIE_TCC_3VA5130_30A_3P_LI_TM210-240.pdf')
  });
  expect(candidate30.curveResearch.settingsApplicability).toMatchObject({
    tripUnit: 'TM230 LI',
    fixedIrA: 30,
    selectedInstantaneousPickupA: 150
  });
  expect(candidate30.curveResearch.testConditions).toMatchObject({
    ambientC: 40,
    initialCondition: 'cold start',
    installation: 'open air',
    wireLength: '4 ft',
    conductorTemperatureRatingC: 75,
    conductorBasis: 'per terminal',
    poles: 'all main poles'
  });
  expect(candidate30.curveResearch.curveInterpretation.thermal).toContain('40 C cold-start nominal trace with illustrated tolerances; not a guaranteed thermal-clearing envelope');
  expect(candidate30.curveResearch.curveInterpretation.instantaneous).toContain('maximum clearing and solid minimum tripping only');
  expect(starterCase.candidate.checks.find(row => row.id === 'tccStartingAndCoordination')).toMatchObject({
    status: 'unevaluated',
    evidence: candidate30.curveResearch
  });
  expect(proposal.status).toBe('blocked');
  expect(proposal.checks.find(row => row.id === 'motorProtection').status).toBe('fail');
  expect(proposal.studyValidation.status).toBe('pass');
  const proposedMotor = proposal.loads.find(row => row.id === motorLoad.id).motor;
  expect(proposedMotor.fullLoadCurrentA).toBe(22);
  expect(proposedMotor.nameplateCurrentA).toBe(12.8);
  expect(proposedMotor.nameplateHorsepower).toBe(10);
  expect(starterCase.candidate.sizing.minimumBreakerPickupA).toBe(27.5);
  expect((proposal.cables.find(row => row.loadId === motorLoad.id)).motor.branchBreakerCandidate.catalogNumber).toBe('3VA5130-6EC31-0AA0');

  const report = (await downloadText(page, '#synthesis-download-report')).split('Complete JSON payload:')[0];
  for (const text of [
    '3VA5130-6EC31-0AA0',
    'A matching Siemens graphic for the 30 A TM230 configuration is located',
    'no 25 A 3VA5125 curve is supplied by this source',
    'not a guaranteed thermal-clearing envelope',
    'maximum clearing and minimum tripping only',
    'https://cache.industry.siemens.com/dl/files/743/109801743/att_1079474/v1/SIE_TCC_3VA5130_30A_3P_LI_TM210-240.pdf',
    'selectedForApply no'
  ]) expect(report).toContain(text);
  expect(report).not.toContain('3VA5130-6EC31-0AA0 curve applied to 3VA5125-6EC31-0AA0');
  await fs.writeFile(testInfo.outputPath('motor-branch-breaker-30a-review-report.txt'), report);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await review.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -80));
  await review.screenshot({ path: testInfo.outputPath('motor-branch-breaker-30a-review.png') });
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
});

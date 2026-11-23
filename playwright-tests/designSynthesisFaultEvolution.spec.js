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

async function fillJson(page, selector, value) {
  const details = page.locator(`details:has(${selector})`);
  if (!(await details.evaluate(element => element.open))) await details.locator('summary').click();
  await page.locator(selector).fill(value);
}

async function loadEvolutionExample(page) {
  await page.locator('#synthesis-load-motor-fault-evolution-sample').click();
  await expect(page.locator('#synthesis-fault-evolution')).toHaveValue(/Synthetic piecewise-linear source EMF multiplier histories/);
  await expect(page.locator('#synthesis-fault-study')).toHaveValue(/Synthetic utility-source positive-sequence equivalent/);
}

async function generate(page) {
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-fault-evolution-review')).toBeVisible({ timeout: 30000 });
}

async function importDraft(page, draft, filename) {
  await page.locator('#synthesis-import').setInputFiles({ name: filename, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(draft)) });
  await expect(page.locator('#synthesis-status')).toContainText(`Imported ${filename}`);
}

test.describe('Design synthesis supplied fault source-profile history', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(server.url('designsynthesis.html'));
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  });

  test('retains synthetic profiles across save/reload and exports numeric histories consistently', async ({ page }, testInfo) => {
    await loadEvolutionExample(page);
    const originalEvolution = await page.locator('#synthesis-fault-evolution').inputValue();
    const originalNetwork = await page.locator('#synthesis-fault-study').inputValue();
    await page.reload();
    await expect(page.locator('#synthesis-fault-evolution')).toHaveValue(originalEvolution);
    await expect(page.locator('#synthesis-fault-study')).toHaveValue(originalNetwork);
    await generate(page);

    const proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    const validation = proposal.faultEvolutionValidation;
    expect(validation.status).toBe('evaluated');
    expect(validation.method).toBe('design-synthesis-motor-fault-evolution-v1');
    expect(validation.scope).toBe('supplied-source-quasi-steady-rms-phasor-history');
    expect(validation.evidenceStatus).toBe('supplied-unverified');
    expect(validation.protectionAdequacy).toBe('unevaluated');
    expect(validation.faultCases.length).toBeGreaterThan(0);
    expect(validation.deviceHistories.length).toBeGreaterThan(0);
    expect(validation.deviceHistories.some(history => history.caseKind === 'immediate-load-side-zero-impedance-fault')).toBe(true);
    expect(validation.deviceHistories.every(history => Number.isFinite(history.currentExtrema.minimumRmsKA) && Number.isFinite(history.currentExtrema.minimumTimeS))).toBe(true);
    for (const history of validation.deviceHistories) {
      expect(history.timeRows.length).toBeGreaterThan(1);
      expect(Number.isFinite(history.currentSquaredExposureA2S)).toBe(true);
      expect(history.currentSquaredExposureA2S).toBeGreaterThanOrEqual(0);
      expect(history.timeRows.every(row => Number.isFinite(row.currentRmsKA) && row.currentRmsKA >= 0)).toBe(true);
      expect(history.timeRows.at(-1).timeS).toBe(5);
    }
    const energizedFeeder = validation.deviceHistories.find(history => history.caseKind === 'generated-bus-fault' && history.placementId.startsWith('cable:') && history.timeRows[0].currentRmsKA > 0);
    expect(energizedFeeder, 'at least one generated fault must drive a modeled feeder').toBeTruthy();
    expect(energizedFeeder.currentSquaredExposureA2S).toBeGreaterThan(0);
    const independentExposureA2S = energizedFeeder.timeRows.slice(1).reduce((sum, right, index) => {
      const left = energizedFeeder.timeRows[index];
      const leftSquared = left.currentA.re ** 2 + left.currentA.im ** 2;
      const rightSquared = right.currentA.re ** 2 + right.currentA.im ** 2;
      const endpointDot = left.currentA.re * right.currentA.re + left.currentA.im * right.currentA.im;
      return sum + (right.timeS - left.timeS) * (leftSquared + endpointDot + rightSquared) / 3;
    }, 0);
    expect(Math.abs(energizedFeeder.currentSquaredExposureA2S - independentExposureA2S)).toBeLessThanOrEqual(Math.max(1, independentExposureA2S) * 1e-9);
    const energizedFaultCase = validation.faultCases.find(faultCase => faultCase.caseId === energizedFeeder.caseId);
    const preservedCurrent = energizedFaultCase.timeRows[0].deviceCurrents.find(device => device.placementId === energizedFeeder.placementId);
    expect(energizedFeeder.timeRows[0].currentRmsKA).toBe(preservedCurrent.throughDeviceCurrentRmsKA);
    expect(proposal.faultStudy.sources).toHaveLength(2);
    expect(proposal.faultStudy.sources.every(source => source.inService === true && source.impedance.rOhm > 0 && source.impedance.xOhm > 0)).toBe(true);
    await expect(page.locator('#synthesis-fault-evolution-review')).toContainText('supplied-unverified');
    await expect(page.locator('#synthesis-fault-evolution-review')).toContainText('does not model a transient motor waveform');
    await expect(page.locator('#synthesis-fault-evolution-review')).toContainText('Current-squared exposure');
    await expect(page.locator('#synthesis-apply')).toBeDisabled();

    const report = await downloadText(page, '#synthesis-download-report');
    expect(report).toContain('Supplied fault source-profile history');
    expect(report).toContain('current-squared exposure');
    expect(report).toContain('protection-adequacy determination');
    expect(report).toContain('Routes:');
    expect(report).toContain('Routing decisions:');
    expect(report).toContain('Complete JSON payload:');
    const reportPayload = JSON.parse(report.slice(report.indexOf('Complete JSON payload:') + 'Complete JSON payload:'.length).trim());
    expect(reportPayload.faultEvolutionValidation).toEqual(validation);
    expect(reportPayload.faultEvolution.profiles).toEqual(proposal.faultEvolution.profiles);
    await fs.writeFile(testInfo.outputPath('fault-evolution-proposal.json'), JSON.stringify(proposal, null, 2));
    await fs.writeFile(testInfo.outputPath('fault-evolution-report.txt'), report);
    const review = page.locator('#synthesis-fault-evolution-review');
    await review.locator('table.synthesis-table').first().screenshot({ path: testInfo.outputPath('fault-evolution-positive-overview.png'), style: '.top-nav { position: static !important; }' });
    await review.locator('table.synthesis-table').nth(2).locator('tbody tr').first().screenshot({ path: testInfo.outputPath('fault-evolution-positive-first-history.png'), style: '.top-nav { position: static !important; }' });

    await fillJson(page, '#synthesis-fault-evolution', JSON.stringify({ ...proposal.faultEvolution, reference: 'Edited synthetic history invalidates previous result.' }, null, 2));
    await expect(page.locator('#synthesis-download-json')).toBeDisabled();
    await expect(page.locator('#synthesis-download-report')).toBeDisabled();
  });

  test('zero source EMF keeps passive source impedance and network in service', async ({ page }) => {
    await loadEvolutionExample(page);
    const evolution = JSON.parse(await page.locator('#synthesis-fault-evolution').inputValue());
    evolution.profiles[0].points.at(-1).emfMultiplier = 0;
    await fillJson(page, '#synthesis-fault-evolution', JSON.stringify(evolution, null, 2));
    await generate(page);
    const proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(proposal.faultEvolutionValidation.status).toBe('evaluated');
    expect(proposal.faultStudy.sources[0]).toMatchObject({ inService: true });
    expect(proposal.faultStudy.sources[0].impedance).toEqual({ rOhm: 0.006, xOhm: 0.015 });
    expect(proposal.faultEvolutionValidation.faultCases[0].timeRows.at(-1).sourceMultipliers).toContainEqual({ equipmentId: proposal.faultStudy.sources[0].equipmentId, multiplier: 0 });
    expect(proposal.faultEvolutionValidation.protectionAdequacy).toBe('unevaluated');
    await expect(page.locator('#synthesis-fault-evolution-review')).toContainText('retaining its passive impedance and in-service state');
  });

  test('blocks missing, malformed, and uncovered profile histories while keeping diagnostics visible', async ({ page }, testInfo) => {
    await loadEvolutionExample(page);
    const loaded = await page.evaluate(() => window.dataStore.getItem('designSynthesisDraft'));

    const missing = structuredClone(loaded);
    missing.faultEvolution.profiles = [];
    await importDraft(page, missing, 'missing-source-profile.json');
    await generate(page);
    let proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(proposal.faultEvolutionValidation.status).toBe('blocked');
    expect(proposal.faultEvolutionValidation.issues.length).toBeGreaterThan(0);
    await expect(page.locator('#synthesis-fault-evolution-review')).toContainText('blocked');

    const malformed = structuredClone(loaded);
    malformed.faultEvolution.profiles[0].points = {};
    await importDraft(page, malformed, 'malformed-source-profile.json');
    await generate(page);
    proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(proposal.faultEvolutionValidation.status).toBe('blocked');
    expect(proposal.faultEvolutionValidation.issues.length).toBeGreaterThan(0);
    await expect(page.locator('#synthesis-fault-evolution-review')).toContainText('No device fault-current histories were evaluated');

    const uncovered = structuredClone(loaded);
    uncovered.faultEvolution.profiles[0].conditions.voltageRangeV = [500, 600];
    await importDraft(page, uncovered, 'uncovered-source-condition.json');
    await generate(page);
    proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(proposal.faultEvolutionValidation.status).toBe('blocked');
    expect(proposal.faultEvolutionValidation.issues.length).toBeGreaterThan(0);
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
    await fs.writeFile(testInfo.outputPath('fault-evolution-blocked-proposal.json'), JSON.stringify(proposal, null, 2));
    const blockedReport = await downloadText(page, '#synthesis-download-report');
    expect(blockedReport).toContain('Supplied fault source-profile history');
    expect(blockedReport).toContain('Complete JSON payload:');
    const blockedPayload = JSON.parse(blockedReport.slice(blockedReport.indexOf('Complete JSON payload:') + 'Complete JSON payload:'.length).trim());
    expect(blockedPayload).toEqual(proposal);
    await fs.writeFile(testInfo.outputPath('fault-evolution-blocked-report.txt'), blockedReport);
    await page.locator('#synthesis-fault-evolution-review').locator('table.synthesis-table').first().screenshot({ path: testInfo.outputPath('fault-evolution-blocked-overview.png'), style: '.top-nav { position: static !important; }' });
  });
});

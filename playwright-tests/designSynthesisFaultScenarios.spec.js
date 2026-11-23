import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;

test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

test.describe('Design synthesis fault operating scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(server.url('designsynthesis.html?e2e=1'));
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  });

  test('shows observed scenario envelopes and exports reviewer artifacts', async ({ page }, testInfo) => {
    await page.locator('#synthesis-load-fault-scenarios-sample').click();
    await expect(page.locator('#synthesis-fault-scenarios')).toHaveValue(/strong-source/);
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-fault-scenario-review')).toContainText('supplied scenarios');
    await expect(page.locator('#synthesis-apply')).toBeEnabled();

    const jsonDownloadPromise = page.waitForEvent('download');
    await page.locator('#synthesis-download-json').click();
    const jsonDownload = await jsonDownloadPromise;
    const proposal = JSON.parse(await fs.readFile(await jsonDownload.path(), 'utf8'));
    expect(proposal.status).toBe('proposal');
    expect(proposal.faultScenarioValidation.coverage).toMatchObject({ scope: 'supplied-scenarios-only', verifiedAsExtrema: false, scenarioCount: 2 });
    expect(proposal.faultScenarioValidation.scenarios.map(item => item.id)).toEqual(['strong-source', 'weaker-source']);
    const sourceBus = proposal.faultScenarioValidation.busEnvelopes.find(item => item.busId === proposal.inputs.original.supply.id);
    expect(sourceBus.minimum.scenarioId).toBe('weaker-source');
    expect(sourceBus.minimum.valueKA).toBeCloseTo(8.5769, 3);
    expect(sourceBus.maximum.scenarioId).toBe('strong-source');
    expect(sourceBus.maximum.valueKA).toBeCloseTo(17.1538, 3);
    expect(proposal.faultScenarioValidation.deviceEnvelopes.length).toBeGreaterThan(0);
    expect(proposal.faultScenarioValidation.deviceEnvelopes[0].protectionStatus).toBe('not-evaluated');

    const reportDownloadPromise = page.waitForEvent('download');
    await page.locator('#synthesis-download-report').click();
    const reportDownload = await reportDownloadPromise;
    const report = await fs.readFile(await reportDownload.path(), 'utf8');
    expect(report).toContain('Explicit fault operating-scenario comparison');
    expect(report).toContain('verified true minima/maxima: no');
    expect(report).toContain('strong-source');
    await fs.writeFile(testInfo.outputPath('fault-scenarios-review.txt'), report);
    const review = page.locator('#synthesis-fault-scenario-review');
    for (const [locator, filename] of [
      [review.locator('h3'), 'fault-scenarios-heading.png'],
      [review.locator('p').first(), 'fault-scenarios-scope.png'],
      [review.locator('table').nth(2).locator('tbody tr').first(), 'fault-scenarios-first-bus-row.png'],
      [review.locator('table').nth(3).locator('tbody tr').first(), 'fault-scenarios-first-device-row.png'],
    ]) {
      await locator.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
      await locator.screenshot({ path: testInfo.outputPath(filename) });
    }
  });

  test('keeps invalid edits visible, invalidates results, and blocks conflicting inputs', async ({ page }, testInfo) => {
    await page.locator('#synthesis-load-fault-scenarios-sample').click();
    await expect(page.locator('#synthesis-status')).toContainText('fault-scenario sample loaded');
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-apply')).toBeEnabled();
    await page.getByText('Advanced fault scenarios JSON', { exact: true }).click();
    const editor = page.locator('#synthesis-fault-scenarios');
    const original = JSON.parse(await editor.inputValue());
    original[0].reference = 'Edited synthetic condition reference.';
    const editedText = JSON.stringify(original, null, 2);
    await editor.fill(editedText);
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
    await expect(page.locator('#synthesis-download-json')).toBeDisabled();
    await page.reload();
    await page.getByText('Advanced fault scenarios JSON', { exact: true }).click();
    await expect(editor).toHaveValue(editedText);

    const importedDraft = await page.evaluate(() => window.dataStore.getItem('designSynthesisDraft', null));
    const importPath = testInfo.outputPath('fault-scenarios-import.json');
    await fs.writeFile(importPath, JSON.stringify({ ...importedDraft, faultScenarios: original }));
    await page.locator('#synthesis-import').setInputFiles(importPath);
    await expect(editor).toHaveValue(editedText);

    await editor.fill('{ invalid scenario JSON');
    await expect(editor).toHaveValue('{ invalid scenario JSON');
    await expect(page.locator('#synthesis-status')).toContainText('invalid and retained');
    await page.locator('#synthesis-generate').click();
    const blockedDownloadPromise = page.waitForEvent('download');
    await page.locator('#synthesis-download-json').click();
    const blockedDownload = await blockedDownloadPromise;
    const blocked = JSON.parse(await fs.readFile(await blockedDownload.path(), 'utf8'));
    expect(blocked.faultScenarioValidation.status).toBe('blocked');
    expect(blocked.faultScenarioValidation.issues.length).toBeGreaterThan(0);

    await editor.fill(JSON.stringify(original, null, 2));
    const legacyStudyEditor = page.locator('#synthesis-fault-study');
    await page.getByText('Advanced fault network JSON', { exact: true }).click();
    await legacyStudyEditor.fill(JSON.stringify(original[0].study, null, 2));
    await page.locator('#synthesis-generate').click();
    const conflictDownloadPromise = page.waitForEvent('download');
    await page.locator('#synthesis-download-json').click();
    const conflictDownload = await conflictDownloadPromise;
    const conflict = JSON.parse(await fs.readFile(await conflictDownload.path(), 'utf8'));
    expect(conflict.status).toBe('blocked');
    expect(conflict.issues.some(item => /faultStudy|faultScenarios/i.test(item.path || ''))).toBeTruthy();
  });

  test('preserves the motor Apply gate', async ({ page }) => {
    await page.locator('#synthesis-load-motor-sample').click();
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
  });

  test('applies scenario evidence to a named project, reloads it, and verifies the session-history boundary', async ({ page }) => {
    await page.goto(server.url('designsynthesis.html'));
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
    await page.locator('#synthesis-load-fault-scenarios-sample').click();
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-apply')).toBeEnabled();
    await page.locator('#synthesis-apply').click();
    await expect(page.getByRole('heading', { name: 'Create New Project' })).toBeVisible({ timeout: 10000 });
    await page.locator('input[id^="project-name-"]').fill('Fault Scenario Persistence Acceptance');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Choose a Project Template' })).toBeVisible({ timeout: 10000 });
    await page.locator('[data-template-id="blank"]').click();
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Use Template', exact: true }).click()]);
    await expect(page.locator('#synthesis-status')).toContainText('Proposal generated', { timeout: 20000 });
    await page.locator('#synthesis-apply').click();
    await page.waitForURL(/cableschedule\.html/, { timeout: 15000 });

    const readStoredScenarioValidation = () => page.evaluate(() => window.dataStore.getItem('designSynthesisFaultScenarioValidation', null, window.dataStore.getCurrentScenario()));
    await expect.poll(readStoredScenarioValidation).toMatchObject({ status: 'evaluated', encoding: 'fault-scenarios-json-lz77-utf15-v1', scenarioCount: 2 });
    const saved = await readStoredScenarioValidation();
    const readExpandedScenarioValidation = () => page.evaluate(async () => {
      const { resolveDesignSynthesisFaultScenarioValidation } = await import('/src/design-synthesis/applyProposal.mjs');
      return resolveDesignSynthesisFaultScenarioValidation(window.dataStore.getItem('designSynthesisFaultScenarioValidation', null, window.dataStore.getCurrentScenario()));
    });
    const expanded = await readExpandedScenarioValidation();
    expect(expanded.status).toBe('evaluated');
    expect(expanded.scenarios.map(item => item.id)).toEqual(['strong-source', 'weaker-source']);
    expect(expanded.scenarios[0].study.sources[0].reference).toContain('Synthetic source scenarios');
    expect(expanded.busEnvelopes.length).toBeGreaterThan(0);
    await page.reload();
    expect(await readStoredScenarioValidation()).toEqual(saved);
    expect((await readExpandedScenarioValidation()).scenarios.map(item => item.id)).toEqual(['strong-source', 'weaker-source']);

    const undoResult = await page.evaluate(() => {
      const validationBefore = window.dataStore.getItem('designSynthesisFaultScenarioValidation', null, window.dataStore.getCurrentScenario());
      if (typeof window.projectStorage?.undoProjectChange !== 'function') throw new Error('Canonical projectStorage undo API is not available on window.');
      if (typeof window.projectStorage?.canUndo !== 'function') throw new Error('Canonical projectStorage canUndo API is not available on window.');
      const canUndoAfterReload = window.projectStorage.canUndo();
      const projectBeforeUndo = window.projectStorage.getProjectState();
      window.projectStorage.undoProjectChange();
      return {
        validationBefore,
        validationAfter: window.dataStore.getItem('designSynthesisFaultScenarioValidation', null, window.dataStore.getCurrentScenario()),
        canUndoAfterReload,
        projectBeforeUndo,
        projectAfter: window.projectStorage.getProjectState(),
      };
    });
    expect(undoResult.validationBefore.status).toBe('evaluated');
    expect(undoResult.canUndoAfterReload).toBe(false);
    expect(undoResult.validationAfter).toEqual(undoResult.validationBefore);
    expect(undoResult.projectAfter).toEqual(undoResult.projectBeforeUndo);
  });
});

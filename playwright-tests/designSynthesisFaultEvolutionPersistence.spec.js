import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { faultEvolutionFixture } from '../tests/helpers/faultEvolutionFixture.mjs';
import { buildDesignSynthesisFaultEvolutionContext, resolveDesignSynthesisFaultEvolutionValidation } from '../src/design-synthesis/faultEvolutionPersistence.mjs';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

async function importDraft(page, draft, name) {
  await page.locator('#synthesis-import').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(draft)) });
  await expect(page.locator('#synthesis-status')).toContainText(`Imported ${name}`);
}

async function createNamedProjectAndApply(page, name) {
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-apply')).toBeEnabled({ timeout: 60000 });
  await page.locator('#synthesis-apply').click();
  await expect(page.getByRole('heading', { name: 'Create New Project' })).toBeVisible({ timeout: 10000 });
  await page.locator('input[id^="project-name-"]').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a Project Template' })).toBeVisible({ timeout: 10000 });
  await page.locator('[data-template-id="blank"]').click();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Use Template', exact: true }).click()]);
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated', { timeout: 60000 });
  await expect(page.locator('#synthesis-apply')).toBeEnabled({ timeout: 60000 });
  await page.locator('#synthesis-apply').click();
  await page.waitForURL(/cableschedule\.html/, { timeout: 20000 });
}

async function readPersistedHistory(page) {
  const observed = await page.evaluate(() => {
    const scenario = window.dataStore.getCurrentScenario();
    const metadata = window.dataStore.getProjectMeta?.() || {};
    const snapshot = {
      projectMeta: window.dataStore.getProjectMeta(),
      designBasis: window.dataStore.getDesignBasis(),
      equipment: window.dataStore.getEquipment(),
      loads: window.dataStore.getLoads(),
      cables: window.dataStore.getCables(),
      trays: window.dataStore.getTrays(),
      conduits: window.dataStore.getConduits(),
      ductbanks: window.dataStore.getDuctbanks(),
      panels: window.dataStore.getPanels(),
      oneLine: window.dataStore.getOneLine(),
    };
    return {
      saved: window.dataStore.getItem('designSynthesisFaultEvolutionValidation', null, scenario),
      snapshot,
      projectId: window.currentProjectId || metadata.id || metadata.projectId || metadata.name || '',
      scenario,
      faultStudyValidation: window.dataStore.getItem('designSynthesisFaultStudyValidation', null, scenario),
      deviceFaultValidation: window.dataStore.getItem('designSynthesisDeviceFaultValidation', null, scenario),
      deviceEvidence: window.dataStore.getItem('designSynthesisDeviceEvidence', {}, scenario),
    };
  });
  const context = buildDesignSynthesisFaultEvolutionContext(observed);
  const resolved = resolveDesignSynthesisFaultEvolutionValidation(observed.saved, context);
  const jsonResolved = resolved ? JSON.parse(JSON.stringify(resolved)) : null;
  return { resolved: jsonResolved, saved: observed.saved, snapshot: observed.snapshot };
}

function threeKnotHistory(draft) {
  draft.faultEvolution.profiles[0].points = [
    { timeS: 0, emfMultiplier: 1 },
    { timeS: 0.03, emfMultiplier: 0.4 },
    { timeS: 0.1, emfMultiplier: 0 },
  ];
  return draft;
}

async function downloadText(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await pending;
  return fs.readFile(await download.path(), 'utf8');
}

async function captureStaleEvidenceScreenshot(page, path) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const section = page.locator('#synthesis-saved-fault-evolution');
    await expect(section).toContainText('do not match it');
    await expect(section.locator('[data-saved-fault-evolution-download]')).toHaveCount(0);
    await expect(section.locator('[data-saved-fault-evolution-review]')).toHaveCount(0);
    try {
      await section.screenshot({ path, style: '.top-nav { position: static !important; }' });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 2 || !message.includes('Element is not attached to the DOM')) throw error;
    }
  }
}

async function verifySavedView(page, expected, testInfo) {
  await page.goto(server.url('designsynthesis.html'));
  const section = page.locator('#synthesis-saved-fault-evolution');
  await expect(section).toContainText('matches the current canonical project');
  await expect(section.locator('[data-saved-fault-evolution-summary]')).toContainText(`${expected.faultEvolutionValidation.faultCases.length} fault cases`);
  await expect(section.locator('[data-saved-fault-evolution-summary]')).toContainText(`${expected.faultEvolutionValidation.deviceHistories.length} device histories`);
  const savedJson = JSON.parse(await downloadText(page, '[data-saved-fault-evolution-download="json"]'));
  expect(savedJson).toEqual(expected);
  const report = await downloadText(page, '[data-saved-fault-evolution-download="report"]');
  expect(report).toContain('Supplied fault source-profile history');
  expect(report).toContain('Complete JSON payload:');
  const reportPayload = JSON.parse(report.slice(report.indexOf('Complete JSON payload:') + 'Complete JSON payload:'.length).trim());
  expect(reportPayload).toEqual(expected);
  await fs.writeFile(testInfo.outputPath(`saved-history-${expected.faultEvolutionValidation.deviceHistories.length}.json`), JSON.stringify(savedJson, null, 2));
  await fs.writeFile(testInfo.outputPath(`saved-history-${expected.faultEvolutionValidation.deviceHistories.length}.txt`), report);
  await section.screenshot({ path: testInfo.outputPath(`saved-history-${expected.faultEvolutionValidation.deviceHistories.length}-overview.png`), style: '.top-nav { position: static !important; }' });
  await section.locator('[data-saved-fault-evolution-review]').click();
  await expect(section.locator('#synthesis-saved-fault-evolution-review')).toBeVisible();
  await expect(section.locator('#synthesis-saved-fault-evolution-review')).toContainText('protection adequacy');
  const firstHistory = section.locator('#synthesis-saved-fault-evolution-review h4').filter({ hasText: 'Device history summaries' }).locator('+ div > table > tbody > tr').first();
  await firstHistory.locator('details > summary').first().click();
  await firstHistory.screenshot({ path: testInfo.outputPath(`saved-history-${expected.faultEvolutionValidation.deviceHistories.length}-first-history.png`), style: '.top-nav { position: static !important; }' });
  return section;
}

test.describe('Design Synthesis saved fault source-profile history', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(server.url('designsynthesis.html'));
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  });

  test('applies 25-load utility history, reloads exact evidence, rejects stale context, and removes it after a no-profile reapply', async ({ page }, testInfo) => {
    test.setTimeout(240000);
    const draft = threeKnotHistory(faultEvolutionFixture(25, false));
    await importDraft(page, draft, 'synthetic-history-25.json');
    await createNamedProjectAndApply(page, 'Saved Fault History 25');
    let resolved = await readPersistedHistory(page);
    await fs.writeFile(testInfo.outputPath('saved-history-canonical-25.json'), JSON.stringify(resolved.snapshot, null, 2));
    expect(resolved.resolved).toMatchObject({ faultEvolution: draft.faultEvolution });
    expect(resolved.resolved.faultEvolutionValidation).toMatchObject({ status: 'evaluated', evidenceStatus: 'supplied-unverified', protectionAdequacy: 'unevaluated' });
    const expected = { faultStudy: resolved.resolved.faultStudy, faultEvolution: resolved.resolved.faultEvolution, faultEvolutionValidation: resolved.resolved.faultEvolutionValidation };
    let section = await verifySavedView(page, expected, testInfo);
    await page.reload();
    resolved = await readPersistedHistory(page);
    expect(resolved.resolved).toEqual({ faultStudy: expected.faultStudy, faultEvolution: expected.faultEvolution, faultEvolutionValidation: expected.faultEvolutionValidation });
    section = page.locator('#synthesis-saved-fault-evolution');
    await expect(section).toContainText('matches the current canonical project');

    const beforeReapply = await page.evaluate(() => ({ loads: window.dataStore.getLoads().length, equipment: window.dataStore.getEquipment().length, cables: window.dataStore.getCables().length, panels: window.dataStore.getPanels().length }));
    await importDraft(page, draft, 'synthetic-history-25-reapply.json');
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-apply')).toBeEnabled({ timeout: 60000 });
    await page.locator('#synthesis-apply').click();
    await page.waitForURL(/cableschedule\.html/, { timeout: 20000 });
    const afterReapply = await page.evaluate(() => ({ loads: window.dataStore.getLoads().length, equipment: window.dataStore.getEquipment().length, cables: window.dataStore.getCables().length, panels: window.dataStore.getPanels().length }));
    expect(afterReapply).toEqual(beforeReapply);
    expect((await readPersistedHistory(page)).resolved).toEqual(expected);
    await page.goto(server.url('designsynthesis.html'));
    section = page.locator('#synthesis-saved-fault-evolution');
    await expect(section).toContainText('matches the current canonical project');

    const originalLoads = await page.evaluate(() => window.dataStore.getLoads());
    await page.evaluate(() => {
      const loads = window.dataStore.getLoads();
      const edited = loads.map((load, index) => index === 0 ? { ...load, savedHistoryStaleProbe: 'canonical edit' } : load);
      window.dataStore.setLoads(edited, { preserveShape: true });
    });
    await expect(section).toContainText('do not match it', { timeout: 5000 });
    await expect(section.locator('[data-saved-fault-evolution-download]')).toHaveCount(0);
    await expect(section.locator('[data-saved-fault-evolution-review]')).toHaveCount(0);
    expect((await readPersistedHistory(page)).resolved).toBeNull();
    await captureStaleEvidenceScreenshot(page, testInfo.outputPath('saved-history-stale.png'));
    await page.evaluate(loads => window.dataStore.setLoads(loads, { preserveShape: true }), originalLoads);
    await expect(section).toContainText('matches the current canonical project', { timeout: 5000 });
    expect((await readPersistedHistory(page)).resolved).toEqual(expected);

    const noProfile = { ...draft };
    delete noProfile.faultEvolution;
    await importDraft(page, noProfile, 'no-source-history.json');
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-apply')).toBeEnabled({ timeout: 60000 });
    await page.locator('#synthesis-apply').click();
    await page.waitForURL(/cableschedule\.html/, { timeout: 20000 });
    expect(await page.evaluate(() => window.dataStore.getItem('designSynthesisFaultEvolutionValidation', null, window.dataStore.getCurrentScenario()))).toBeNull();
    await page.goto(server.url('designsynthesis.html'));
    await expect(page.locator('#synthesis-saved-fault-evolution')).toContainText('No saved source-history evidence');
    await page.locator('#synthesis-saved-fault-evolution').screenshot({ path: testInfo.outputPath('saved-history-removed.png'), style: '.top-nav { position: static !important; }' });
  });

  test('applies 50-load utility history and reopens its complete saved numeric report', async ({ page }, testInfo) => {
    test.setTimeout(300000);
    const draft = threeKnotHistory(faultEvolutionFixture(50, false));
    await importDraft(page, draft, 'synthetic-history-50.json');
    await createNamedProjectAndApply(page, 'Saved Fault History 50');
    const resolved = await readPersistedHistory(page);
    await fs.writeFile(testInfo.outputPath('saved-history-canonical-50.json'), JSON.stringify(resolved.snapshot, null, 2));
    expect(resolved.resolved?.faultEvolutionValidation.deviceHistories.length).toBeGreaterThan(1000);
    expect(resolved.resolved.faultEvolution.profiles).toEqual(draft.faultEvolution.profiles);
    const expected = { faultStudy: resolved.resolved.faultStudy, faultEvolution: resolved.resolved.faultEvolution, faultEvolutionValidation: resolved.resolved.faultEvolutionValidation };
    await page.reload();
    const section = await verifySavedView(page, expected, testInfo);
    const summaryTable = section.locator('#synthesis-saved-fault-evolution-review h4').filter({ hasText: 'Device history summaries' }).locator('xpath=following-sibling::div[1]/table');
    expect(await summaryTable.evaluate(table => table.tBodies[0]?.rows.length || 0)).toBe(expected.faultEvolutionValidation.deviceHistories.length);
  });
});

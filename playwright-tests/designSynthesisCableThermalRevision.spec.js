import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cableThermalRevisionFixture } from '../tests/helpers/cableThermalRevisionFixture.mjs';
import { buildDesignSynthesisFaultEvolutionContext, resolveDesignSynthesisFaultEvolutionValidation } from '../src/design-synthesis/faultEvolutionPersistence.mjs';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

async function readSavedThermalRevision(page) {
  const observed = await page.evaluate(() => {
    const scenario = window.dataStore.getCurrentScenario();
    const projectMeta = window.dataStore.getProjectMeta?.() || {};
    return {
      saved: window.dataStore.getItem('designSynthesisFaultEvolutionValidation', null, scenario),
      snapshot: {
        projectMeta: window.dataStore.getProjectMeta(), designBasis: window.dataStore.getDesignBasis(),
        equipment: window.dataStore.getEquipment(), loads: window.dataStore.getLoads(), cables: window.dataStore.getCables(),
        trays: window.dataStore.getTrays(), conduits: window.dataStore.getConduits(), ductbanks: window.dataStore.getDuctbanks(),
        panels: window.dataStore.getPanels(), oneLine: window.dataStore.getOneLine(),
      },
      canonicalCables: window.dataStore.getCables(),
      cableCatalogSource: window.dataStore.getItem('designSynthesisCableCatalogSource', null, scenario),
      faultStudyValidation: window.dataStore.getItem('designSynthesisFaultStudyValidation', null, scenario),
      projectId: window.currentProjectId || projectMeta.id || projectMeta.projectId || projectMeta.name || '',
      scenario,
      deviceFaultValidation: window.dataStore.getItem('designSynthesisDeviceFaultValidation', null, scenario),
      deviceEvidence: window.dataStore.getItem('designSynthesisDeviceEvidence', {}, scenario),
    };
  });
  const context = buildDesignSynthesisFaultEvolutionContext(observed);
  const resolved = resolveDesignSynthesisFaultEvolutionValidation(observed.saved, context, observed);
  return { observed, resolved: resolved ? JSON.parse(JSON.stringify(resolved)) : null };
}

test('automatic thermal conductor trials survive named Apply, saved review, report and JSON download', async ({ page }, testInfo) => {
  test.setTimeout(240000);
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const draft = cableThermalRevisionFixture({ count: 25, selected: true, maxRevisions: 3, r: 0.004, x: 0.012, endpoint: true });
  draft.criteria.loadFlow.minimumVoltagePu = 0.99;
  draft.supply.availableFaultCurrentKA = 25;
  draft.faultEvolution.profiles[0].points = [
    { timeS: 0, emfMultiplier: 1 }, { timeS: 0.03, emfMultiplier: 0.4 }, { timeS: 0.1, emfMultiplier: 0 },
  ];
  await page.locator('#synthesis-import').setInputFiles({
    name: 'synthetic-cable-thermal-revision.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(draft)),
  });
  await expect(page.locator('#synthesis-status')).toContainText('Imported synthetic-cable-thermal-revision.json');
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-apply')).toBeEnabled({ timeout: 90000 });
  await expect(page.locator('#synthesis-cable-fault-withstand-review')).toContainText('Automatic conductor trial history');
  await expect(page.locator('#synthesis-cable-fault-withstand-review')).toContainText('#8 AWG');
  await expect(page.locator('#synthesis-cable-fault-withstand-review')).toContainText('#4 AWG');

  await page.locator('#synthesis-apply').click();
  await expect(page.getByRole('heading', { name: 'Create New Project' })).toBeVisible();
  await page.locator('input[id^="project-name-"]').fill('Cable Thermal Revision Journey');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a Project Template' })).toBeVisible();
  await page.locator('[data-template-id="blank"]').click();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Use Template', exact: true }).click()]);
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated', { timeout: 90000 });
  await expect(page.locator('#synthesis-apply')).toBeEnabled({ timeout: 90000 });
  await page.locator('#synthesis-apply').click();
  await page.waitForURL(/cableschedule\.html/, { timeout: 20000 });

  const saved = await readSavedThermalRevision(page);
  expect(saved.resolved?.cableFaultWithstandValidation).toMatchObject({ status: 'evaluated', comparison: 'pass', qualificationStatus: 'unevaluated', protectionAdequacy: 'unevaluated' });
  expect(saved.resolved?.cableFaultWithstandRevision).toMatchObject({ schemaVersion: '1.0.0', status: 'complete', revisionBudget: { maximum: 3, used: 2, remaining: 1 }, stopReason: 'thermal-limit-passed' });
  expect(saved.resolved.cableFaultWithstandRevision.finalBinding.designCriteria).toEqual(draft.criteria);
  expect(saved.resolved.cableFaultWithstandRevision.history.map(row => row.revision)).toEqual([0, 1, 2]);
  await fs.writeFile(testInfo.outputPath('saved-cable-thermal-revision.json'), JSON.stringify(saved.resolved, null, 2));

  await page.goto(server.url('designsynthesis.html'));
  const savedSection = page.locator('#synthesis-saved-fault-evolution');
  await expect(savedSection).toContainText('matches the current canonical project');
  await savedSection.locator('[data-saved-fault-evolution-review]').click();
  const review = savedSection.locator('#synthesis-saved-cable-fault-withstand-review');
  await expect(review).toContainText('Automatic conductor trials');
  await expect(review).toContainText('2/3 used');
  await expect(review).toContainText('1-1/4');
  await expect(review).toContainText('1-1/2');
  await expect(review).toContainText('OD C-L-01 1.012 in');
  await review.locator('summary', { hasText: 'Design criteria used for these trials' }).click();
  await expect(review.locator('[data-cable-thermal-criteria]')).toContainText('"minimumVoltagePu": 0.99');
  const jsonPending = page.waitForEvent('download');
  await savedSection.locator('[data-saved-fault-evolution-download="json"]').click();
  const jsonDownload = await jsonPending;
  expect(JSON.parse(await fs.readFile(await jsonDownload.path(), 'utf8'))).toEqual(saved.resolved);
  const reportPending = page.waitForEvent('download');
  await savedSection.locator('[data-saved-fault-evolution-download="report"]').click();
  const reportDownload = await reportPending;
  const report = await fs.readFile(await reportDownload.path(), 'utf8');
  expect(report).toContain('Automatic conductor trials: complete; absolute load-flow revision budget 2/3 used');
  expect(report).toContain('Revision 0 (baseline)');
  expect(report).toContain('1-1/4');
  expect(report).toContain('1-1/2');
  expect(report).toContain('thermal-limit-passed');
  expect(report).toContain('"minimumVoltagePu":0.99');
  await fs.writeFile(testInfo.outputPath('saved-cable-thermal-revision.txt'), report);
  await review.screenshot({ path: testInfo.outputPath('saved-cable-thermal-revision.png'), style: '.top-nav { position: static !important; }' });
});

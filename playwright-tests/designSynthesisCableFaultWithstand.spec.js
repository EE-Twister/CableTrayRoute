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

async function readSaved(page) {
  const observed = await page.evaluate(() => {
    const scenario = window.dataStore.getCurrentScenario();
    const meta = window.dataStore.getProjectMeta?.() || {};
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
      projectId: window.currentProjectId || meta.id || meta.projectId || meta.name || '', scenario,
      deviceFaultValidation: window.dataStore.getItem('designSynthesisDeviceFaultValidation', null, scenario),
      deviceEvidence: window.dataStore.getItem('designSynthesisDeviceEvidence', {}, scenario),
    };
  });
  const context = buildDesignSynthesisFaultEvolutionContext(observed);
  const resolved = resolveDesignSynthesisFaultEvolutionValidation(observed.saved, context, observed);
  return { observed, resolved: resolved ? JSON.parse(JSON.stringify(resolved)) : null };
}

async function download(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  return pending;
}

test('selected cable screen is visible in saved downloads and stales when any generated cable changes', async ({ page }, testInfo) => {
  test.setTimeout(240000);
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const draft = faultEvolutionFixture(25, false);
  draft.faultStudy.sources[0].impedance = { rOhm: 1, xOhm: 3 };
  const base = await import('../analysis/designSynthesis.mjs');
  const baseProposal = base.generateDesignProposal(draft);
  const selectedCable = baseProposal.cables.find(row => row.to === 'L-01');
  draft.cableFaultWithstand = {
    schemaVersion: '1.0.0', cableSelection: { mode: 'selected', cableIds: [selectedCable.id] },
    faultSelection: { mode: 'all-generated-bus-fault-cases' },
    clearing: { maximumTotalClearingTimeS: 0.1, reference: 'Synthetic mathematical endpoint; not device clearing evidence', applicabilityReference: 'Synthetic all-source applicability statement', appliesToAllModeledSources: true },
    thermal: { conductorMaterial: 'copper', maximumInitialTemperatureC: 90, finalTemperatureC: 250, singleEvent: true, adequateRecoveryBeforeEvent: true, reference: 'Synthetic recovered single-event condition' },
  };
  await importDraft(page, draft, 'synthetic-cable-fault-withstand-selected.json');
  await createNamedProjectAndApply(page, 'Cable Fault Withstand Screen');

  let saved = await readSaved(page);
  expect(saved.resolved?.cableFaultWithstand).toEqual(draft.cableFaultWithstand);
  expect(saved.resolved?.cableFaultWithstandValidation).toMatchObject({ status: 'evaluated', comparison: 'pass', qualificationStatus: 'unevaluated', protectionAdequacy: 'unevaluated' });
  expect(saved.resolved.cableFaultWithstandValidation.coverage).toMatchObject({ scope: 'generated-bus-fault-cases-only', selectedCableCount: 1, allGeneratedCableCount: 26, generatedBusFaultCaseCount: 27 });
  expect(saved.resolved.cableFaultWithstandValidation.cases).toHaveLength(27);
  await fs.writeFile(testInfo.outputPath('saved-cable-fault-withstand-selected.json'), JSON.stringify(saved.resolved, null, 2));

  await page.goto(server.url('designsynthesis.html'));
  const section = page.locator('#synthesis-saved-fault-evolution');
  await expect(section).toContainText('matches the current canonical project');
  await section.locator('[data-saved-fault-evolution-review]').click();
  const review = section.locator('#synthesis-saved-cable-fault-withstand-review');
  await expect(review).toBeVisible();
  await expect(review).toContainText('generated-bus-fault-cases-only');
  await expect(review).toContainText('Allowable A²s');
  await expect(review).toContainText('supplied and unverified');
  const jsonDownload = await download(page, '[data-saved-fault-evolution-download="json"]');
  const jsonText = await fs.readFile(await jsonDownload.path(), 'utf8');
  expect(JSON.parse(jsonText)).toEqual(saved.resolved);
  const reportDownload = await download(page, '[data-saved-fault-evolution-download="report"]');
  const report = await fs.readFile(await reportDownload.path(), 'utf8');
  expect(report).toContain('Conditional cable fault thermal screen');
  expect(report).toContain('Nominal conductor area');
  expect(report).toContain('7a67e2e2e4c660f12484182f6c7f3ce27f16a2e7a64144d05a57d70a4cc80d5a');
  await fs.writeFile(testInfo.outputPath('saved-cable-fault-withstand-selected.txt'), report);
  await review.screenshot({ path: testInfo.outputPath('saved-cable-fault-withstand-selected.png'), style: '.top-nav { position: static !important; }' });

  const originalCables = saved.observed.canonicalCables;
  await page.evaluate(() => {
    const cables = window.dataStore.getCables();
    cables[0] = { ...cables[0], lengthFt: cables[0].lengthFt + 1 };
    window.dataStore.setCables(cables);
  });
  await expect(section).toContainText('do not match it');
  await expect(section.locator('[data-saved-fault-evolution-download]')).toHaveCount(0);
  await expect(section.locator('[data-saved-fault-evolution-review]')).toHaveCount(0);
  expect((await readSaved(page)).resolved).toBeNull();
  await fs.writeFile(testInfo.outputPath('saved-cable-fault-withstand-stale.json'), JSON.stringify({ originalCables, stale: true }, null, 2));
});

test('a failing requested cable screen is visible and cannot be applied or persisted', async ({ page }, testInfo) => {
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const draft = faultEvolutionFixture(25, false);
  draft.criteria = { ...(draft.criteria || {}), loadFlow: { ...(draft.criteria?.loadFlow || {}), maxRevisions: 0 } };
  draft.faultStudy.sources[0].impedance = { rOhm: 0.02, xOhm: 0.06 };
  draft.cableFaultWithstand = {
    schemaVersion: '1.0.0', cableSelection: { mode: 'all-modeled' },
    faultSelection: { mode: 'all-generated-bus-fault-cases' },
    clearing: { maximumTotalClearingTimeS: 0.1, reference: 'Synthetic mathematical endpoint; not device clearing evidence', applicabilityReference: 'Synthetic all-source applicability statement', appliesToAllModeledSources: true },
    thermal: { conductorMaterial: 'copper', maximumInitialTemperatureC: 90, finalTemperatureC: 250, singleEvent: true, adequateRecoveryBeforeEvent: true, reference: 'Synthetic recovered single-event condition' },
  };
  await importDraft(page, draft, 'synthetic-cable-fault-withstand-failing.json');
  await page.locator('#synthesis-generate').click();

  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked', { timeout: 60000 });
  await expect(page.locator('#synthesis-cable-fault-withstand-review')).toContainText('comparison fail');
  await expect(page.locator('#synthesis-load-dispositions')).toContainText('exceeds the conditional single-event adiabatic conductor limit');
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  const savedValidation = await page.evaluate(() => window.dataStore.getItem('designSynthesisFaultEvolutionValidation', null));
  expect(savedValidation).toBeNull();
  const state = { savedValidation };
  await fs.writeFile(testInfo.outputPath('failing-cable-fault-withstand.json'), JSON.stringify({ request: draft.cableFaultWithstand, savedState: state }, null, 2));
  await expect(page.locator('#synthesis-cable-fault-withstand-review')).toContainText('1.159438');
  await page.locator('#synthesis-cable-fault-withstand-review > table').first().screenshot({ path: testInfo.outputPath('failing-cable-fault-withstand.png'), style: '.top-nav { position: static !important; }' });
});

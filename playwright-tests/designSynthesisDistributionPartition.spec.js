import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { distributionPartitionFixture } from '../tests/helpers/distributionPartitionFixture.mjs';
import { nonmotorDistributionPartitionFixture } from '../tests/helpers/distributionPartitionFixture.mjs';
import { startStaticServer } from './staticServer.helper.js';
import { getLoadBreakerSpan } from '../src/panel-schedule/breakerLayoutModel.js';

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

async function importDraft(page, draft, filename) {
  await page.locator('#synthesis-import').setInputFiles({ name: filename, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(draft)) });
  await expect(page.locator('#synthesis-status')).toContainText(`Imported ${filename}`);
}

async function generate(page) {
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-distribution-partition-review')).toBeVisible({ timeout: 60000 });
}

function assertCompleteFeasiblePartition(proposal, originalInput) {
  const result = proposal.distributionPartitionValidation;
  expect(result.status).toBe('evaluated');
  expect(result.algorithm).toBe('deterministic-feasible-feeder-bisection-v1');
  expect(result.stoppingReason).toBe('all-feeders-feasible');
  expect(result.initialPanelCount).toBeGreaterThan(0);
  expect(result.finalPanelCount).toBeGreaterThanOrEqual(result.initialPanelCount);
  expect(result.splitCount).toBeGreaterThan(0);
  expect(result.criteria).toEqual({ maxPanelLoadKva: originalInput.criteria.maxPanelLoadKva, maxLoadsPerPanel: originalInput.criteria.maxLoadsPerPanel });
  expect(proposal.inputs.original.criteria).toEqual(originalInput.criteria);

  const originalIds = originalInput.equipment.map(load => load.id).sort();
  const assignedIds = result.groups.flatMap(group => group.loadIds).sort();
  expect(assignedIds).toEqual(originalIds);
  expect(new Set(assignedIds).size).toBe(originalIds.length);
  expect(proposal.panels.length).toBe(result.groups.length);
  for (const group of result.groups) {
    expect(group.feederId).toBeTruthy();
    expect(Number.isFinite(group.designAmpacityA) && group.designAmpacityA > 0).toBe(true);
    expect(Number.isFinite(group.ampacityA) && group.ampacityA >= group.designAmpacityA).toBe(true);
    expect(group.protectiveDeviceStatus).toBe('selected');
    const feeder = proposal.cables.find(cable => cable.id === group.feederId);
    expect(feeder?.protectiveDevice).toBeTruthy();
  }
}

test.describe('Design synthesis feeder-aware panel grouping', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(server.url('designsynthesis.html'));
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  });

  for (const count of [25, 50]) {
    test(`${count}-motor original criteria split into feasible groups deterministically with complete exports`, async ({ page }, testInfo) => {
      test.setTimeout(120000);
      const originalInput = distributionPartitionFixture(count);
      await importDraft(page, originalInput, `all-motor-${count}-default-partition-input.json`);
      await generate(page);
      const first = JSON.parse(await downloadText(page, '#synthesis-download-json'));
      assertCompleteFeasiblePartition(first, originalInput);
      await expect(page.locator('#synthesis-apply')).toBeDisabled();
      await expect(page.locator('#synthesis-distribution-partition-review')).toContainText('panel-load and load-count ceilings unchanged');
      await expect(page.locator('#synthesis-distribution-partition-review')).toContainText('Feeder-aware panel grouping');

      const summary = first.distributionPartitionValidation;
      await page.reload();
      await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
      const savedCounts = await page.evaluate(() => {
        const draft = window.dataStore.getItem('designSynthesisDraft');
        return { faultSources: draft.faultStudy.sources.length, faultEvolutionProfiles: draft.faultEvolution.profiles.length };
      });
      expect(savedCounts).toEqual({ faultSources: count + 1, faultEvolutionProfiles: count + 1 });
      await generate(page);
      const proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
      assertCompleteFeasiblePartition(proposal, originalInput);
      expect(proposal.distributionPartitionValidation).toEqual(summary);
      expect(proposal.panels.map(panel => ({ id: panel.id, loadIds: panel.loadIds })).sort((a, b) => a.id.localeCompare(b.id)))
        .toEqual(first.panels.map(panel => ({ id: panel.id, loadIds: panel.loadIds })).sort((a, b) => a.id.localeCompare(b.id)));

      const report = await downloadText(page, '#synthesis-download-report');
      expect(report).toContain('Feeder-aware panel grouping');
      expect(report).toContain('deterministic-feasible-feeder-bisection-v1');
      expect(report).toContain('actual bisection splits');
      expect(report).toContain('feeder design-current floor');
      expect(report).toContain('final feeder ampacity');
      expect(report).toContain('Complete JSON payload:');
      const firstFeeder = proposal.cables.find(cable => cable.id === proposal.distributionPartitionValidation.groups[0].feederId);
      const firstCandidate = firstFeeder.protectiveDevice.catalogNumber || firstFeeder.protectiveDevice.id;
      expect(report).toContain(firstCandidate);
      const reportPayload = JSON.parse(report.slice(report.indexOf('Complete JSON payload:') + 'Complete JSON payload:'.length).trim());
      expect(reportPayload).toEqual(proposal);
      await fs.writeFile(testInfo.outputPath(`all-motor-${count}-partition-proposal.json`), JSON.stringify(proposal, null, 2));
      await fs.writeFile(testInfo.outputPath(`all-motor-${count}-partition-report.txt`), report);
      const review = page.locator('#synthesis-distribution-partition-review');
      await review.locator('table.synthesis-table').first().screenshot({ path: testInfo.outputPath(`all-motor-${count}-partition-overview.png`), style: '.top-nav { position: static !important; }' });
      await review.locator('table.synthesis-table').last().locator('tbody tr').first().screenshot({ path: testInfo.outputPath(`all-motor-${count}-partition-first-group.png`), style: '.top-nav { position: static !important; }' });
    });
  }

  test('50 nonmotor loads apply once to the named project and remain intact across canonical reload and reapply', async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const originalInput = nonmotorDistributionPartitionFixture(50);
    const originalCriteria = structuredClone(originalInput.criteria);
    await importDraft(page, originalInput, 'nonmotor-50-default-partition-input.json');
    await generate(page);
    await expect(page.locator('#synthesis-apply')).toBeEnabled();
    const proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    assertCompleteFeasiblePartition(proposal, originalInput);
    expect(proposal.inputs.original.criteria).toEqual(originalCriteria);
    expect(proposal.distributionPartitionValidation.groups).toHaveLength(3);
    expect(proposal.distributionPartitionValidation.groups.map(group => group.loadIds.length).sort((a, b) => b - a)).toEqual([24, 23, 3]);

    const report = await downloadText(page, '#synthesis-download-report');
    expect(report).toContain('feeder design-current floor');
    expect(report).toContain('Complete JSON payload:');
    expect(JSON.parse(report.slice(report.indexOf('Complete JSON payload:') + 'Complete JSON payload:'.length).trim())).toEqual(proposal);
    await fs.writeFile(testInfo.outputPath('nonmotor-50-partition-proposal.json'), JSON.stringify(proposal, null, 2));
    await fs.writeFile(testInfo.outputPath('nonmotor-50-partition-report.txt'), report);

    await page.locator('#synthesis-apply').click();
    await expect(page.getByRole('heading', { name: 'Create New Project' })).toBeVisible();
    await page.getByRole('dialog').locator('input[name="projectName"]').fill('Nonmotor Partition Integration');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Choose a Project Template' })).toBeVisible();
    await page.locator('[data-template-id="blank"]').click();
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Use Template', exact: true }).click()]);
    await expect(page.locator('#synthesis-apply')).toBeEnabled({ timeout: 60000 });
    await page.locator('#synthesis-apply').click();
    await page.waitForURL(/cableschedule\.html/, { timeout: 30000 });
    await page.waitForFunction(() => window.__ctrProjectReady === true && Boolean(window.dataStore));

    const readCanonical = () => page.evaluate(() => ({
      equipment: window.dataStore.getEquipment(),
      loads: window.dataStore.getLoads(),
      cables: window.dataStore.getCables(),
      panels: window.dataStore.getPanels(),
      oneLine: window.dataStore.getOneLine(),
      routes: window.dataStore.getItem('latestRouteResults', {}),
    }));
    const assertCanonical = canonical => {
      const normalizedIds = rows => rows.map(row => String(row.id || '').toLowerCase()).sort();
      expect(canonical.equipment).toHaveLength(proposal.equipment.length);
      expect(normalizedIds(canonical.equipment)).toEqual(normalizedIds(proposal.equipment));
      expect(canonical.loads).toHaveLength(proposal.loads.length);
      expect(normalizedIds(canonical.loads)).toEqual(normalizedIds(proposal.loads));
      expect(canonical.cables).toHaveLength(proposal.cables.length);
      expect(normalizedIds(canonical.cables)).toEqual(normalizedIds(proposal.cables));
      expect(canonical.panels).toHaveLength(proposal.panels.length);
      expect(normalizedIds(canonical.panels)).toEqual(normalizedIds(proposal.panels));
      const assignedLoads = canonical.loads.filter(load => load.panelId);
      expect(assignedLoads).toHaveLength(50);
      expect(new Set(assignedLoads.map(load => load.id)).size).toBe(50);
      for (const panel of canonical.panels) {
        const panelLoads = assignedLoads.filter(load => String(load.panelId).toLowerCase() === String(panel.id).toLowerCase());
        const expectedLoadIds = (proposal.panels.find(row => row.id.toLowerCase() === panel.id.toLowerCase())?.loadIds || []).map(id => id.toLowerCase()).sort();
        expect(panelLoads.map(load => load.id.toLowerCase()).sort()).toEqual(expectedLoadIds);
        const spans = panelLoads.map(load => getLoadBreakerSpan(load, panel, Number(panel.circuitCount)));
        expect(spans.every(span => span.length > 0)).toBe(true);
        const flattenedSpans = spans.flat();
        expect(new Set(flattenedSpans).size).toBe(flattenedSpans.length);
      }
      const components = canonical.oneLine.sheets.flatMap(sheet => sheet.components || []);
      const connections = canonical.oneLine.sheets.flatMap(sheet => sheet.connections || []);
      expect(new Set(components.map(row => row.id)).size).toBe(components.length);
      expect(components.length).toBeGreaterThan(50);
      expect(connections.length).toBeGreaterThanOrEqual(50);
    };
    const initialCanonical = await readCanonical();
    assertCanonical(initialCanonical);
    await fs.writeFile(testInfo.outputPath('nonmotor-50-canonical-project-snapshot.json'), JSON.stringify(initialCanonical, null, 2));
    await expect.poll(async () => page.locator('#cableScheduleTable tbody tr').count()).toBeGreaterThan(50);
    await page.goto(server.url('panelschedule.html'));
    await expect.poll(async () => page.locator('body').innerText()).toContain('DP-');
    const dp01Value = await page.locator('#panel-select option').evaluateAll(options => options.find(option => option.textContent.includes('DP-01'))?.value || null);
    expect(dp01Value).toBeTruthy();
    await page.locator('#panel-select').selectOption(dp01Value);
    await expect(page.locator('#panel-sticky-summary .panel-summary-item')).toHaveCount(4);
    await expect.poll(async () => page.locator('#panel-sticky-summary').innerText()).toContain('24');
    const panelScheduleSummary = await page.locator('#panel-sticky-summary .panel-summary-item').evaluateAll(items => Object.fromEntries(items.map(item => {
      const value = item.querySelector('strong')?.textContent?.trim() || '';
      const label = [...item.querySelectorAll('span')].at(-1)?.textContent?.trim() || '';
      return [label, value];
    })));
    expect(panelScheduleSummary.Panelboard.toLowerCase()).toContain('dp-01');
    expect(Number(panelScheduleSummary['Assigned Loads'])).toBe(24);
    expect(Number(panelScheduleSummary['kVA Connected'])).toBeGreaterThan(0);
    expect(Number(panelScheduleSummary.Circuits)).toBeGreaterThanOrEqual(72);
    await page.screenshot({ path: testInfo.outputPath('nonmotor-50-panel-schedule.png'), fullPage: true });
    await page.goto(server.url('oneline.html'));
    await expect.poll(async () => page.locator('#diagram g.component').count()).toBeGreaterThan(50);
    const components = initialCanonical.oneLine.sheets[0].components;
    const links = components.flatMap(source => (source.connections || []).map((connection, index) => ({ source, connection, index })));
    const feederLink = links.find(row => row.source.type === 'utility_source' && row.connection.cableId);
    const branchLink = links.find(row => row.source.type === 'panel' && row.connection.cableId);
    expect(feederLink).toBeTruthy();
    expect(branchLink).toBeTruthy();
    const selectLink = async row => {
      await page.locator(`#diagram .connection[data-comp="${row.source.id}"][data-index="${row.index}"]`).dispatchEvent('click');
      await expect(page.locator('.connection-inspector')).toBeVisible();
    };
    for (const link of [feederLink, branchLink]) {
      const cable = initialCanonical.cables.find(row => row.tag.toLowerCase() === link.connection.cableId.toLowerCase());
      await selectLink(link);
      const review = page.locator('.connection-protection-review');
      await expect(review).toContainText(cable.protectiveDevice.catalogNumber);
      await expect(review).toContainText(`${cable.protectiveDevice.continuousCurrentA} A`);
      await expect(review).toContainText(`${cable.protectiveDevice.interruptingRatingKA} kA at ${cable.protectiveDevice.interruptingRatingVoltageVac} V`);
      await expect(review).toContainText('Screening candidate');
    }
    const branchCable = initialCanonical.cables.find(row => row.tag.toLowerCase() === branchLink.connection.cableId.toLowerCase());
    await page.evaluate(cableId => {
      const rows = window.dataStore.getCables();
      rows.find(row => row.id === cableId).protectiveDevice.interruptingRatingKA += 1;
      window.dataStore.setCables(rows);
    }, branchCable.id);
    await expect(page.locator('.connection-protection-review')).toContainText('missing or does not match');
    await expect(page.locator('.connection-protection-review')).not.toContainText(branchCable.protectiveDevice.catalogNumber);
    await page.evaluate(rows => window.dataStore.setCables(rows), initialCanonical.cables);
    await expect(page.locator('.connection-protection-review')).toContainText(branchCable.protectiveDevice.catalogNumber);
    const evidence = await page.evaluate(() => window.dataStore.getItem('designSynthesisDeviceEvidence', {}));
    await page.evaluate(() => window.dataStore.setItem('designSynthesisDeviceEvidence', {}));
    await expect(page.locator('.connection-protection-review')).toContainText('missing or does not match');
    await page.evaluate(value => window.dataStore.setItem('designSynthesisDeviceEvidence', value), evidence);
    await expect(page.locator('.connection-protection-review')).toContainText(branchCable.protectiveDevice.catalogNumber);
    await page.screenshot({ path: testInfo.outputPath('nonmotor-50-one-line.png'), fullPage: true });
    await page.reload();
    const renderedGraphCounts = await page.evaluate(() => ({
      components: window.dataStore.getOneLine().sheets.flatMap(sheet => sheet.components || []).length,
      connections: window.dataStore.getOneLine().sheets.flatMap(sheet => sheet.connections || []).length,
    }));
    expect(renderedGraphCounts.components).toBe(initialCanonical.oneLine.sheets.flatMap(sheet => sheet.components || []).length);
    expect(renderedGraphCounts.connections).toBe(initialCanonical.oneLine.sheets.flatMap(sheet => sheet.connections || []).length);
    await selectLink(branchLink);
    await expect(page.locator('.connection-protection-review')).toContainText(branchCable.protectiveDevice.catalogNumber);

    await page.goto(`${server.url('designsynthesis.html')}#Nonmotor%20Partition%20Integration`);
    await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
    await page.locator('#synthesis-generate').click();
    await expect(page.locator('#synthesis-apply')).toBeEnabled({ timeout: 60000 });
    const regenerated = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    expect(regenerated.distributionPartitionValidation).toEqual(proposal.distributionPartitionValidation);
    await fs.writeFile(testInfo.outputPath('nonmotor-50-regenerated-proposal.json'), JSON.stringify(regenerated, null, 2));
    const captureReapplyDiagnostics = async phase => {
      const diagnostics = await page.evaluate(phaseName => {
        const panels = window.dataStore.getPanels();
        const loads = window.dataStore.getLoads();
        const lastApplied = window.dataStore.getItem('designSynthesisLastApplied', {});
        return {
          phase: phaseName,
          url: location.href,
          synthesisStatus: document.querySelector('#synthesis-status')?.innerText || null,
          applyDisabled: document.querySelector('#synthesis-apply')?.disabled ?? null,
          projectId: window.currentProjectId || null,
          projectName: window.dataStore.getProjectMeta?.()?.name || null,
          counts: {
            equipment: window.dataStore.getEquipment().length,
            loads: loads.length,
            cables: window.dataStore.getCables().length,
            panels: panels.length,
          },
          panels: panels.map(panel => ({ id: panel.id, tag: panel.tag, loadIds: panel.loadIds || null, loadKva: panel.loadKva ?? null, circuitCount: panel.circuitCount ?? null })),
          loads: loads.map(load => ({ id: load.id, tag: load.tag, panelId: load.panelId ?? null, panelRef: load.panelRef ?? null, source: load.source ?? null, breaker: load.breaker ?? null })),
          lastApplied: { proposalId: lastApplied.proposalId || null, inputSignature: lastApplied.inputSignature || null },
          dataStoreKeys: window.dataStore.keys?.() || [],
        };
      }, phase);
      await fs.writeFile(testInfo.outputPath(`nonmotor-50-reapply-${phase}.json`), JSON.stringify(diagnostics, null, 2));
      return diagnostics;
    };
    await captureReapplyDiagnostics('before');
    await page.locator('#synthesis-apply').click();
    try {
      await page.waitForURL(/cableschedule\.html/, { timeout: 30000 });
    } catch (error) {
      await captureReapplyDiagnostics('after-failed-apply');
      await page.screenshot({ path: testInfo.outputPath('nonmotor-50-reapply-failure.png'), fullPage: false });
      throw error;
    }
    await page.reload();
    const reappliedCanonical = await readCanonical();
    assertCanonical(reappliedCanonical);
    expect(reappliedCanonical.equipment).toHaveLength(initialCanonical.equipment.length);
    expect(reappliedCanonical.cables).toHaveLength(initialCanonical.cables.length);
    expect(reappliedCanonical.panels).toHaveLength(initialCanonical.panels.length);
    expect(reappliedCanonical.oneLine.sheets.flatMap(sheet => sheet.components || [])).toHaveLength(initialCanonical.oneLine.sheets.flatMap(sheet => sheet.components || []).length);
  });

  test('a split retains the prior panel identity on its highest-overlap descendant and keeps its override on that ID', async ({ page }) => {
    test.setTimeout(120000);
    const input = distributionPartitionFixture(25);
    const originalIds = input.equipment.map(load => load.id);
    input.generationBaseline = { panels: [{ id: 'DP-01', loadIds: originalIds }], nextPanelNumber: 2 };
    const requestedLocation = input.overrides.panelLocations['DP-01'];
    await importDraft(page, input, 'partition-panel-identity-input.json');
    await generate(page);
    const proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    const result = proposal.distributionPartitionValidation;
    expect(result.status).toBe('evaluated');
    const overlapCount = group => group.loadIds.filter(id => originalIds.includes(id)).length;
    const maximumOverlap = Math.max(...result.groups.map(overlapCount));
    const retained = result.groups.find(group => group.panelId === 'DP-01');
    expect(retained).toBeTruthy();
    expect(overlapCount(retained)).toBe(maximumOverlap);
    expect(proposal.inputs.original.overrides.panelLocations['DP-01']).toEqual(requestedLocation);
    const override = proposal.panelLocationOverrides.find(item => item.panelId === 'DP-01');
    expect(override.effectiveLocation).toEqual({ x: requestedLocation.x, y: requestedLocation.y, z: requestedLocation.z });
    const requestedOverrides = proposal.panelLocationOverrides.filter(item => item.requestedLocation);
    expect(requestedOverrides).toHaveLength(1);
    expect(requestedOverrides[0].panelId).toBe('DP-01');
    expect(result.groups.some(group => group.panelId !== 'DP-01')).toBe(true);
  });

  test('a high-current singleton retains its blocked feasibility reason and never marks an undersized feeder pass', async ({ page }, testInfo) => {
    const input = distributionPartitionFixture(1);
    input.equipment[0].motor.fullLoadCurrentA = 1000;
    input.equipment[0].motor.nameplateCurrentA = 1000;
    input.equipment[0].motor.fullLoadCurrentBasis = { reference: 'Synthetic unserviceable-singleton stress case; not machine data.' };
    await importDraft(page, input, 'unserviceable-singleton-partition-input.json');
    await generate(page);
    const proposal = JSON.parse(await downloadText(page, '#synthesis-download-json'));
    const result = proposal.distributionPartitionValidation;
    expect(result.status).toBe('blocked');
    expect(result.stoppingReason).toBe('single-load-unservable');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].designAmpacityA).toBeGreaterThanOrEqual(1250);
    expect(proposal.issues.some(issue => issue.code === 'DISTRIBUTION_GROUP_UNSERVABLE')).toBe(true);
    const group = result.groups[0];
    expect(group.sizingStatus).not.toBe('screening-sized');
    expect(group.protectiveDeviceStatus).not.toBe('selected');
    await expect(page.locator('#synthesis-distribution-partition-review')).toContainText('single-load-unservable');
    await expect(page.locator('#synthesis-apply')).toBeDisabled();

    const report = await downloadText(page, '#synthesis-download-report');
    expect(report).toContain('single-load-unservable');
    const reportPayload = JSON.parse(report.slice(report.indexOf('Complete JSON payload:') + 'Complete JSON payload:'.length).trim());
    expect(reportPayload).toEqual(proposal);
    await fs.writeFile(testInfo.outputPath('unserviceable-singleton-proposal.json'), JSON.stringify(proposal, null, 2));
    await fs.writeFile(testInfo.outputPath('unserviceable-singleton-report.txt'), report);
    await page.locator('#synthesis-distribution-partition-review').locator('table.synthesis-table').first().screenshot({ path: testInfo.outputPath('unserviceable-singleton-overview.png'), style: '.top-nav { position: static !important; }' });
  });
});

import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

test('a motor proposal becomes a separate, persistently marked review project', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(server.url('designsynthesis.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Load motor starter sample', exact: true }).click();
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  await expect(page.locator('#synthesis-create-review-project')).toBeEnabled();
  const before = await page.evaluate(() => JSON.stringify(window.dataStore.exportProject()));
  await page.locator('#synthesis-create-review-project').click();
  await expect(page.locator('#synthesis-status')).toContainText('Separate review project created', { timeout: 60000 });
  const created = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('CTR_SAVED_PROJECTS_V1'));
    const name = Object.keys(saved).find(item => item.startsWith('PRELIMINARY REVIEW - '));
    return { name, snapshot: saved[name], current: JSON.stringify(window.dataStore.exportProject()) };
  });
  expect(created.current).toBe(before);
  expect(created.snapshot.loads).toHaveLength(25);
  expect(created.snapshot.settings.designSynthesisReviewDraft.status).toBe('preliminary-review-only');
  expect(created.snapshot.settings.designSynthesisReviewDraft.limitations.join(' ')).toContain('not copied');
  await page.evaluate(name => { void window.projectManager.openProjectByName(name); }, created.name);
  await page.waitForURL(url => decodeURIComponent(url.hash.slice(1)) === created.name);
  await page.waitForLoadState('domcontentloaded');
  await page.goto(`${server.url('oneline.html')}#${encodeURIComponent(created.name)}`);
  await page.waitForSelector('[data-oneline-ready="1"]');
  await expect(page.locator('#design-synthesis-review-draft-banner')).toContainText('NOT FOR ISSUE');
  const selected = await page.evaluate(() => {
    const cables = window.dataStore.getCables();
    const sheet = window.dataStore.getOneLine().sheets[0];
    for (const source of sheet.components) {
      for (const [index, connection] of (source.connections || []).entries()) {
        const cable = cables.find(item => String(item.id).toLowerCase() === String(connection.cableId).toLowerCase());
        if (cable?.motor?.starterCandidateSummary) return { sourceId: source.id, index, motor: cable.motor.starterCandidateSummary };
      }
    }
    return null;
  });
  expect(selected).toBeTruthy();
  await page.locator(`#diagram .connection[data-comp="${selected.sourceId}"][data-index="${selected.index}"]`).dispatchEvent('click');
  const inspector = page.locator('.connection-protection-review');
  await expect(inspector).toContainText('Motor starter screening candidate');
  await expect(inspector).toContainText(selected.motor.contactor);
  await expect(inspector).toContainText(selected.motor.overloadRelay);
  await expect(inspector).toContainText('protection, settings and coordination remain unresolved');
  const originalCables = await page.evaluate(() => structuredClone(window.dataStore.getCables()));
  await page.evaluate(() => {
    const cables = window.dataStore.getCables();
    cables.find(cable => cable.motor?.starterCandidateSummary).motor.starterCandidateSummary.contactor = 'CHANGED-CANDIDATE';
    window.dataStore.setCables(cables);
  });
  await expect(inspector).toContainText('Motor starter candidate evidence is missing or changed');
  await expect(inspector).not.toContainText('CHANGED-CANDIDATE');
  await page.evaluate(cables => window.dataStore.setCables(cables), originalCables);
  await expect(inspector).toContainText(selected.motor.contactor);
  const fileMenu = page.locator('details.command-menu').filter({ has: page.locator('summary:text-is("File")') });
  await fileMenu.locator('summary').click();
  const diagramPending = page.waitForEvent('download');
  await page.locator('#diagram-export-btn').click();
  const diagram = await fs.readFile(await (await diagramPending).path());
  expect(JSON.parse(diagram.toString()).reviewNotice).toContain('PRELIMINARY');

  await page.evaluate(name => {
    window.dataStore.setEquipment([]);
    window.dataStore.setLoads([]);
    window.dataStore.setCables([]);
    window.dataStore.setPanels([]);
    window.dataStore.setOneLine({ activeSheet: 0, sheets: [] });
    if (!window.dataStore.saveProject(name)) throw new Error('Could not save review project');
  }, created.name);
  await page.goto(`${server.url('workflowdashboard.html')}#${encodeURIComponent(created.name)}`);
  await expect(page.locator('#dashboard-review-gates')).toContainText('Preliminary review project');
  await page.goto(`${server.url('projectreport.html')}#${encodeURIComponent(created.name)}`);
  await expect(page.locator('#design-synthesis-review-draft-banner')).toContainText('NOT FOR ISSUE');
  await expect(page.locator('#rpt-print-btn')).toBeDisabled();
  await expect(page.locator('#rpt-xlsx-btn')).toBeDisabled();

  await page.evaluate(() => localStorage.clear());
  await page.goto(server.url('oneline.html?e2e=1'));
  await page.waitForSelector('[data-oneline-ready="1"]');
  await page.locator('#diagram-import-input').setInputFiles({ name: 'review-diagram.json', mimeType: 'application/json', buffer: diagram });
  await expect.poll(() => page.evaluate(() => window.dataStore.getOneLine().sheets.flatMap(sheet => sheet.components || []).filter(item => item._designSynthesis && item.physical?.motor).length)).toBeGreaterThan(0);
  await page.goto(server.url('workflowdashboard.html'));
  await expect(page.locator('#dashboard-review-gates')).toContainText('Resolve generated motor protection');
});

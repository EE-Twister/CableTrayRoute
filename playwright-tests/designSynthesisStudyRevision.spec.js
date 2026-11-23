import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixturePath = path.join(root, 'samples/design-synthesis-voltage-revision.json');
let server;

test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

async function downloadProposal(page) {
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  return JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
}

test.describe('Design synthesis load-flow revision', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(server.url('designsynthesis.html'));
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  });

  async function createNamedProject(page, name) {
    await expect(page.getByRole('heading', { name: 'Create New Project' })).toBeVisible({ timeout: 10000 });
    await page.locator('input[id^="project-name-"]').fill(name);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Choose a Project Template' })).toBeVisible({ timeout: 10000 });
    await page.locator('[data-template-id="blank"]').click();
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Use Template', exact: true }).click()]);
    await expect(page.locator('#synthesis-status')).toContainText('Proposal generated', { timeout: 20000 });
  }

  test('runs the default screening revision and reports its evidence', async ({ page }) => {
    await page.click('#synthesis-generate');
    await expect(page.locator('#synthesis-load-flow-study')).toContainText(/Status|revision/i);
    const proposal = await downloadProposal(page);
    expect(proposal.studyValidation).toBeTruthy();
    const reportPending = page.waitForEvent('download');
    await page.locator('#synthesis-download-report').click();
    const report = await fs.readFile(await (await reportPending).path(), 'utf8');
    expect(report).toContain('Automatic load-flow revision:');
    expect(report).toMatch(/minimum voltage|revision count/i);
  });

  test('performs an engineer-fixture revision when the minimum voltage criterion is raised', async ({ page }, testInfo) => {
    const input = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
    input.criteria = { ...(input.criteria || {}), loadFlow: { minimumVoltagePu: 0.995, maxRevisions: 12, maxIterations: 60 } };
    await page.locator('#synthesis-import').setInputFiles({ name: 'load-flow-revision.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
    await page.click('#synthesis-generate');
    await expect(page.locator('#synthesis-load-flow-study')).toContainText(/converged|evaluated|revision/i);
    const proposal = await downloadProposal(page);
    const study = proposal.studyValidation;
    expect(study).toBeTruthy();
    expect(Number(study.final?.minimumVoltagePu)).toBeGreaterThanOrEqual(0.995);
    expect(study.history.length).toBeGreaterThan(1);
    expect(Array.isArray(study.conductorChanges)).toBeTruthy();
    expect(study.conductorChanges.length).toBeGreaterThan(0);
    expect(study.conductorChanges.every(change => change.cableId && change.from && change.to)).toBeTruthy();
    expect(study.history.some(item => Array.isArray(item.conductorChanges) && item.conductorChanges.length > 0 && item.conductorChanges.every(change => change.cableId && change.from && change.to))).toBeTruthy();
    await expect(page.locator('#synthesis-load-flow-study')).toContainText('0.995');
    await expect(page.locator('#synthesis-load-flow-study')).toContainText(/Conductor change detail/i);
    const reportPending = page.waitForEvent('download');
    await page.locator('#synthesis-download-report').click();
    const report = await fs.readFile(await (await reportPending).path(), 'utf8');
    expect(report).toContain('Automatic load-flow revision:');
    expect(report).toContain('Calculated source losses');
    expect(report).toContain('Conductor change detail');
    await page.locator('#synthesis-load-flow-study').screenshot({ path: testInfo.outputPath('study-revision.png') });
  });

  test('invalidates study output when the operating-voltage control changes', async ({ page }) => {
    await page.click('#synthesis-generate');
    await expect(page.locator('#synthesis-download-json')).toBeEnabled();
    const control = page.locator('[data-load-flow-control="minimumVoltagePu"]');
    await control.fill('98');
    await control.press('Tab');
    await expect(page.locator('#synthesis-download-json')).toBeDisabled();
    await expect(page.locator('#synthesis-load-flow-study')).toHaveCount(0);
    await expect(page.locator('#synthesis-status')).toContainText(/Inputs changed/i);
    await expect(page.locator('#synthesis-download-report')).toBeDisabled();
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
    await page.click('#synthesis-generate');
    const proposal = await downloadProposal(page);
    expect(proposal.inputs.original.criteria.loadFlow.minimumVoltagePu).toBe(0.98);
  });

  test('blocks an exhausted revision budget and clears Apply', async ({ page }) => {
    const input = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
    input.criteria = { ...(input.criteria || {}), loadFlow: { minimumVoltagePu: 0.999, maxRevisions: 0, maxIterations: 60 } };
    await page.locator('#synthesis-import').setInputFiles({ name: 'load-flow-exhausted.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
    await page.click('#synthesis-generate');
    await expect(page.locator('#synthesis-status')).toContainText(/blocked|exhausted|nonconverged/i);
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
    await expect(page.locator('#synthesis-load-flow-study')).toContainText(/exhausted|nonconverged|blocked/i);
  });

  test('reports solver nonconvergence separately from revision exhaustion', async ({ page }) => {
    const input = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
    input.criteria = { ...(input.criteria || {}), loadFlow: { minimumVoltagePu: 0.995, maxRevisions: 12, maxIterations: 1 } };
    await page.locator('#synthesis-import').setInputFiles({ name: 'load-flow-nonconverged.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
    await page.click('#synthesis-generate');
    await expect(page.locator('#synthesis-status')).toContainText(/blocked|nonconverged|failed/i);
    const proposal = await downloadProposal(page);
    expect(proposal.studyValidation.status).toMatch(/fail|blocked|unevaluated/);
    expect(proposal.studyValidation.issues.some(issue => /NONCONVERGENCE|nonconverge/i.test(issue.code || issue.message || ''))).toBeTruthy();
    await expect(page.locator('#synthesis-apply')).toBeDisabled();
  });

  test('stores compact validation evidence only when Apply succeeds', async ({ page }) => {
    await page.click('#synthesis-generate');
    await page.click('#synthesis-apply');
    await createNamedProject(page, 'Design Synthesis Study Evidence');
    await page.click('#synthesis-apply');
    await expect(page).toHaveURL(/cableschedule\.html/);
    await page.waitForFunction(() => typeof window.dataStore?.getItem === 'function');
    const validation = await page.evaluate(() => window.dataStore.getItem('designSynthesisLoadFlowValidation', null));
    expect(validation).toBeTruthy();
    expect(JSON.stringify(validation).length).toBeLessThan(12000);
    await page.reload();
    await page.waitForFunction(() => typeof window.dataStore?.getItem === 'function');
    const reloaded = await page.evaluate(() => window.dataStore.getItem('designSynthesisLoadFlowValidation', null));
    expect(reloaded.method).toBe(validation.method);
    expect(reloaded.modelInputFingerprint).toBe(validation.modelInputFingerprint);
    expect(reloaded.final.minimumVoltagePu).toBe(validation.final.minimumVoltagePu);
    expect(reloaded.final.lossKw).toBe(validation.final.lossKw);
  });
});

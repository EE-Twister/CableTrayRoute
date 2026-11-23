import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

test('generated motor projection cannot be marked reviewed or issued through the project report', async ({ page }) => {
  await page.goto(server.url('workflowdashboard.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(async () => {
    const store = await import('/dataStore.mjs');
    window.currentProjectId = 'Motor readiness test';
    store.setProjectMeta({ id: window.currentProjectId, name: window.currentProjectId });
    store.setDesignBasis({ codeBasis: { jurisdiction: 'Test jurisdiction', ahj: 'Test authority' }, studyPrerequisites: { requireUtilityFault: false, requireProtectiveDeviceSettings: false, requireEquipmentCoordinates: false, requireArcFlashInputs: false }, approvalRules: { generatedRecordsRequireReview: false, routeResultsRequireReview: false, studiesRequireReview: false, releaseRequiresReviewer: false } });
    store.setCables([{ id: 'MOTOR-CABLE', tag: 'MOTOR-CABLE', _designSynthesis: { source: 'design-synthesis', identity: 'MOTOR-CABLE' }, motor: { overloadProtectionStatus: 'unresolved' } }]);
    store.setDesignGateApprovals({ 'design-synthesis-motor-protection-unresolved': { status: 'reviewed', reviewedBy: 'Example', approvedAt: '2026-01-01' } });
    store.setItem('workflowDashboardFocus', 'full');
    if (!store.saveProject(window.currentProjectId)) throw new Error('Test project save failed');
  });
  expect(await page.evaluate(async () => (await import('/dataStore.mjs')).getCables())).toMatchObject([{ _designSynthesis: { identity: 'MOTOR-CABLE' }, motor: { overloadProtectionStatus: 'unresolved' } }]);
  await page.reload();
  expect(await page.evaluate(async () => (await import('/dataStore.mjs')).getCables())).toMatchObject([{ _designSynthesis: { identity: 'MOTOR-CABLE' }, motor: { overloadProtectionStatus: 'unresolved' } }]);
  const review = page.locator('#dashboard-review-gates');
  await expect(review).toContainText('Resolve generated motor protection');
  const gate = review.locator('li').filter({ hasText: 'Resolve generated motor protection' });
  await expect(gate).toContainText('Starting withstand, fault duty, coordination, installation and assembly ratings');
  await expect(gate.locator('[data-review-gate]')).toHaveCount(0);
  await expect(gate.getByRole('link', { name: 'Open' })).toHaveAttribute('href', /designsynthesis\.html/);
  await page.goto(server.url('projectreport.html'));
  await expect(page.locator('#rpt-deliverable-readiness')).toContainText('Issue readiness: blocked');
  await expect(page.locator('#rpt-json-btn')).toBeDisabled();
  await expect(page.locator('#rpt-json-btn')).toHaveAttribute('title', /Resolve generated motor protection/);
});

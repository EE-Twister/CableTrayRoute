import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

test('reviews project tray geometry and assigned cables, then detects changed source data', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(server.url('designsynthesis.html?e2e=1'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  await page.evaluate(() => {
    const name = 'Existing tray handoff';
    window.currentProjectId = name;
    window.dataStore.setProjectMeta({ id: name, name });
    window.dataStore.setTrays([
      { tray_id: 'SHORT', tray_type: 'Ladder', allowed_cable_group: 'power', start_x: 0, start_y: 0, start_z: 0, end_x: 20, end_y: 0, end_z: 0, inside_width: 6, tray_depth: 6 },
      { tray_id: 'BYPASS-A', tray_type: 'Ladder', start_x: 0, start_y: 0, start_z: 0, end_x: 0, end_y: 50, end_z: 0, inside_width: 24, tray_depth: 6 },
      { tray_id: 'BYPASS-B', tray_type: 'Ladder', start_x: 0, start_y: 50, start_z: 0, end_x: 20, end_y: 0, end_z: 0, inside_width: 24, tray_depth: 6 },
    ]);
    window.dataStore.setCables([{ id: 'owner-cable', tag: 'OWNER-CABLE', cable_type: 'Power', conductor_size: '#8 AWG', conductors: 3, cable_rating: 600, diameter: 0.833, quantity: 5, raceway_ids: ['SHORT'] }]);
    window.dataStore.setItem('latestRouteResults', { batchResults: [{ cable: 'OWNER-CABLE', route_segments: [{ type: 'tray', tray_id: 'SHORT' }] }] });
    if (!window.dataStore.saveProject(name)) throw new Error('Could not save fixture');
  });
  const before = await page.evaluate(() => ({ trays: window.dataStore.getTrays(), cables: window.dataStore.getCables() }));
  await page.locator('#synthesis-load-capacity-sample').click();
  await expect(page.locator('#synthesis-status')).toContainText('sample loaded');
  const host = page.locator('#synthesis-project-trays');
  for (const id of ['SHORT', 'BYPASS-A', 'BYPASS-B']) await host.locator(`[data-project-tray-select="${id}"]`).check();
  await host.locator('[data-project-tray-reference]').fill('Synthetic verified project inventory');
  for (const basis of ['units', 'inventory', 'permission']) await host.locator(`[data-project-tray-ack="${basis}"]`).check();
  await host.locator('[data-project-tray-review]').click();
  await expect(host).toContainText('3 tray(s) reviewed');
  await expect(host).toContainText('OWNER-CABLE: 5 × #8 AWG (power, 3 conductors), 0.833 in, 600 V');
  await host.locator('[data-project-tray-copy]').click();
  await expect(page.locator('#synthesis-status')).toContainText('reviewed project tray(s) as closed corridors');
  const readGraph = async () => JSON.parse(await page.locator('#synthesis-corridors').inputValue());
  let graph = await readGraph();
  expect(graph.edges.every(edge => edge.permitted === false)).toBe(true);
  expect(await page.evaluate(() => ({ trays: window.dataStore.getTrays(), cables: window.dataStore.getCables() }))).toEqual(before);
  for (let i = 0; i < 3; i++) await page.locator(`[data-corridor-kind="edges"][data-corridor-index="${i}"][data-corridor-field="permission"]`).selectOption('allowed');
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  await expect(page.locator('#synthesis-project-tray-provenance')).toContainText('Synthetic verified project inventory');
  await expect(page.locator('#synthesis-project-tray-provenance')).toContainText('Read-only merge preview retains 3 owner tray(s)');
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  const proposal = JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
  expect(proposal.cables.filter(row => row.loadId && row.routingDecision.selectedPath.includes('SHORT'))).toHaveLength(7);
  await page.reload();
  graph = await readGraph();
  expect(graph.edges.every(edge => edge.permitted === true)).toBe(true);
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  await page.evaluate(() => { const cables = window.dataStore.getCables(); cables[0].diameter = 1; window.dataStore.setCables(cables); });
  await expect(page.locator('#synthesis-download-json')).toBeDisabled();
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Reviewed project trays are stale');
});

test('reviews owner trays after Apply only excluding prior generated records with explicit confirmation', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(server.url('designsynthesis.html?e2e=1'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  await page.evaluate(() => {
    const name = 'Generated tray inventory review';
    window.currentProjectId = name;
    window.dataStore.setProjectMeta({ id: name, name });
    if (!window.dataStore.saveProject(name)) throw new Error('Could not save project');
  });
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-apply')).toBeEnabled();
  await page.locator('#synthesis-apply').click();
  await expect(page).toHaveURL(/cableschedule\.html/);
  await page.waitForFunction(() => window.__ctrProjectReady === true && typeof window.dataStore?.getTrays === 'function');
  await page.goto(server.url('designsynthesis.html?e2e=1'));
  await page.waitForFunction(() => window.__ctrProjectReady === true && typeof window.dataStore?.getTrays === 'function');
  await page.evaluate(() => {
    const trays = window.dataStore.getTrays();
    trays.push({ tray_id: 'OWNER-TRAY', tray_type: 'Ladder', start_x: 0, start_y: 0, start_z: 0, end_x: 10, end_y: 0, end_z: 0, inside_width: 6, tray_depth: 6 });
    window.dataStore.setTrays(trays);
    if (!window.dataStore.saveProject('Generated tray inventory review')) throw new Error('Could not save owner tray');
  });
  await page.locator('#synthesis-load-capacity-sample').click();
  await expect(page.locator('#synthesis-status')).toContainText('sample loaded');
  const host = page.locator('#synthesis-project-trays');
  await host.locator('[data-project-tray-select="OWNER-TRAY"]').check();
  await host.locator('[data-project-tray-reference]').fill('Synthetic owner inventory');
  for (const basis of ['units', 'inventory', 'permission']) await host.locator(`[data-project-tray-ack="${basis}"]`).check();
  await expect(host.locator('[data-project-tray-ack="replaceGenerated"]')).not.toBeChecked();
  await host.locator('[data-project-tray-ack="replaceGenerated"]').check();
  await host.locator('[data-project-tray-review]').click();
  await expect(host).toContainText('1 tray(s) reviewed');
  await expect(host).toContainText('Explicitly empty');
  await host.locator('[data-project-tray-copy]').click();
  await expect(page.locator('#synthesis-status')).toContainText('reviewed project tray(s) as closed corridors');
  await page.reload();
  await expect(page.locator('#synthesis-corridors')).toHaveValue(/OWNER-TRAY/);
});

test('applies a referenced preliminary owner-tray design and regenerates after reload', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(server.url('designsynthesis.html?e2e=1'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  await page.evaluate(() => {
    const name = 'Referenced owner tray browser';
    window.currentProjectId = name;
    window.dataStore.setProjectMeta({ id: name, name });
    window.dataStore.setTrays([
      { tray_id: 'SHORT', tray_type: 'Ladder', start_x: 0, start_y: 0, start_z: 0, end_x: 20, end_y: 0, end_z: 0, inside_width: 6, tray_depth: 6, ownerNote: 'Keep field asset' },
      { tray_id: 'BYPASS-A', tray_type: 'Ladder', start_x: 0, start_y: 0, start_z: 0, end_x: 0, end_y: 50, end_z: 0, inside_width: 24, tray_depth: 6 },
      { tray_id: 'BYPASS-B', tray_type: 'Ladder', start_x: 0, start_y: 50, start_z: 0, end_x: 20, end_y: 0, end_z: 0, inside_width: 24, tray_depth: 6 },
    ]);
    window.dataStore.setCables([{ id: 'owner-cable', tag: 'OWNER-CABLE', cable_type: 'Power', conductor_size: '#8 AWG', conductors: 3, cable_rating: 600, diameter: 0.833, quantity: 5, raceway_ids: ['SHORT'] }]);
    window.dataStore.setItem('latestRouteResults', { batchResults: [{ cable: 'OWNER-CABLE', route_segments: [{ type: 'tray', tray_id: 'SHORT' }] }] });
    if (!window.dataStore.saveProject(name)) throw new Error('Could not save fixture');
  });
  const owners = await page.evaluate(() => ({ trays: window.dataStore.getTrays(), cables: window.dataStore.getCables() }));
  await page.locator('#synthesis-load-capacity-sample').click();
  await expect(page.locator('#synthesis-status')).toContainText('sample loaded');
  const host = page.locator('#synthesis-project-trays');
  for (const id of ['SHORT', 'BYPASS-A', 'BYPASS-B']) await host.locator(`[data-project-tray-select="${id}"]`).check();
  await host.locator('[data-project-tray-reference]').fill('Synthetic inventory');
  await host.locator('[data-project-tray-thermal-reference]').fill('Synthetic thermal review, not field evidence');
  await host.locator('[data-project-tray-installation-reference]').fill('Synthetic installation review, not field evidence');
  await host.locator('[data-project-tray-evidence-confirm]').check();
  for (const basis of ['units', 'inventory', 'permission', 'replaceGenerated']) await host.locator(`[data-project-tray-ack="${basis}"]`).check();
  await host.locator('[data-project-tray-review]').click();
  await expect(host).toContainText('3 tray(s) reviewed');
  await host.locator('[data-project-tray-copy]').click();
  await expect(page.locator('#synthesis-status')).toContainText('reviewed project tray(s) as closed corridors');
  for (let i = 0; i < 3; i++) await page.locator(`[data-corridor-kind="edges"][data-corridor-index="${i}"][data-corridor-field="permission"]`).selectOption('allowed');
  for (const id of ['SHORT', 'BYPASS-A', 'BYPASS-B']) {
    for (const [field, value] of [['Ambient temperature', '30'], ['Grouped conductors', '3'], ['Solid cover length', '0']]) {
      const control = page.getByRole('spinbutton', { name: `${field} for ${id}`, exact: true });
      await control.fill(value); await control.blur();
    }
  }
  await host.locator('[data-project-tray-bind]').click();
  await expect(page.locator('#synthesis-status')).toContainText('basis bound');
  const shortAmbient = page.getByRole('spinbutton', { name: 'Ambient temperature for SHORT', exact: true });
  await shortAmbient.fill('31'); await shortAmbient.blur();
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  await shortAmbient.fill('30'); await shortAmbient.blur();
  await host.locator('[data-project-tray-bind]').click();
  await expect(page.locator('#synthesis-status')).toContainText('basis bound');
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated');
  await expect(page.locator('#synthesis-project-tray-provenance')).toContainText('user-supplied, unverified');
  await expect(page.locator('#synthesis-apply')).toBeEnabled();
  await page.locator('#synthesis-apply').click();
  await expect(page).toHaveURL(/cableschedule\.html/);
  await page.waitForFunction(() => window.__ctrProjectReady === true && typeof window.dataStore?.getTrays === 'function');
  const applied = await page.evaluate(() => ({ trays: window.dataStore.getTrays(), cables: window.dataStore.getCables(), basis: window.dataStore.getItem('designSynthesisLastApplied', {}).projectTrayReuse }));
  expect(applied.trays).toEqual(owners.trays);
  expect(applied.cables.find(row => row.tag === 'OWNER-CABLE')).toEqual(owners.cables[0]);
  expect(applied.basis.adoption.reuseEvidence.thermalReference).toContain('Synthetic thermal review');
  await page.goto(server.url('designsynthesis.html?e2e=1'));
  await page.waitForFunction(() => window.__ctrProjectReady === true);
  await page.locator('[data-project-tray-bind]').click();
  await expect(page.locator('#synthesis-status')).toContainText('basis bound');
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated');
  await expect(page.locator('#synthesis-apply')).toBeEnabled();
});

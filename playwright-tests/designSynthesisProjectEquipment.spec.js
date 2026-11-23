import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;

test.beforeAll(async () => {
  server = await startStaticServer(root);
});
test.afterAll(async () => { await server?.close(); });

test.beforeEach(async ({ page }) => {
  await page.goto(server.url('designsynthesis.html?e2e=1'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
});

function projectRows(count) {
  return {
    equipment: Array.from({ length: count }, (_, index) => ({
      id: `project-equipment-${String(index + 1).padStart(2, '0')}`,
      tag: `EQ-${String(index + 1).padStart(2, '0')}`,
      category: 'Load',
      voltage: 480,
      phases: 3,
      x: 12 + index * 3,
      y: 10 + index % 8,
      z: 0,
      ownerCustomData: { purchaseReference: `PO-${index + 1}` },
    })),
    loads: Array.from({ length: count }, (_, index) => ({
      id: `project-load-${String(index + 1).padStart(2, '0')}`,
      equipmentId: `project-equipment-${String(index + 1).padStart(2, '0')}`,
      tag: `LOAD-${String(index + 1).padStart(2, '0')}`,
      kw: 6.5,
      voltage: 480,
      phases: 3,
      powerFactor: 0.88,
      duty: 'continuous',
      ownerCustomData: { process: `Process-${index + 1}` },
    })),
  };
}

test('equipment review retains checkbox focus and invalidates a previous mapping on selection changes', async ({ page }) => {
  const records = projectRows(25);
  await page.evaluate(records => {
    window.currentProjectId = 'Keyboard review';
    window.dataStore.setProjectMeta({ id: 'Keyboard review', name: 'Keyboard review' });
    window.dataStore.setEquipment(records.equipment);
    window.dataStore.setLoads(records.loads);
    if (!window.dataStore.saveProject('Keyboard review')) throw new Error('Could not save project');
  }, records);
  const host = page.locator('#synthesis-project-equipment');
  const selected = host.locator('[data-project-equipment-select="project-equipment-01"]');
  await expect(selected).toBeVisible();
  expect((await selected.boundingBox()).width).toBeLessThan(32);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  const original = await selected.elementHandle();
  await selected.focus();
  await selected.press('Space');
  await expect(selected).toBeChecked();
  await expect(selected).toBeFocused();
  expect(await original.evaluate(element => element.isConnected)).toBe(true);
  await page.evaluate(() => window.dataStore.setProjectMeta({ ...window.dataStore.getProjectMeta(), reviewNote: 'Unrelated metadata refresh' }));
  await expect(selected).toBeChecked();
  await expect(selected).toBeFocused();
  expect(await original.evaluate(element => element.isConnected)).toBe(true);
  for (const basis of ['electricalInputKW', 'voltageLineToLine', 'coordinatesFeet']) await host.locator(`[data-project-equipment-ack="${basis}"]`).check();
  await host.locator('[data-project-equipment-review]').click();
  await expect(host.locator('[data-project-equipment-copy]')).toBeVisible();
  await selected.focus();
  await selected.press('Space');
  await expect(selected).not.toBeChecked();
  await expect(selected).toBeFocused();
  await expect(host.locator('[data-project-equipment-copy]')).toHaveCount(0);
  await selected.press('Space');
  await host.locator('[data-project-equipment-review]').click();
  await expect(host.locator('[data-project-equipment-copy]')).toBeVisible();
  const ack = host.locator('[data-project-equipment-ack="coordinatesFeet"]');
  await ack.focus(); await ack.press('Space');
  await expect(ack).toBeFocused();
  await expect(host.locator('[data-project-equipment-copy]')).toHaveCount(0);
});

test('project frequency remains visible and blocks a conflicting 50 Hz load before synthesis', async ({ page }) => {
  test.setTimeout(90000);
  const records = projectRows(25);
  records.equipment[0].frequency = 50;
  const name = 'Frequency handoff';
  await page.evaluate(({ name, records }) => {
    window.currentProjectId = name;
    window.dataStore.setProjectMeta({ id: name, name });
    window.dataStore.setEquipment(records.equipment);
    window.dataStore.setLoads(records.loads);
    if (!window.dataStore.saveProject(name)) throw new Error('Could not save project');
  }, { name, records });
  const host = page.locator('#synthesis-project-equipment');
  await expect(host.locator('[data-project-equipment-select]:not([disabled])')).toHaveCount(25);
  for (const row of records.equipment) await host.locator(`[data-project-equipment-select="${row.id}"]`).check();
  for (const basis of ['electricalInputKW', 'voltageLineToLine', 'coordinatesFeet']) await host.locator(`[data-project-equipment-ack="${basis}"]`).check();
  await host.locator('[data-project-equipment-review]').click();
  await expect(host).toContainText('480 V · 3 phase(s) · 50 Hz');
  await host.locator('[data-project-equipment-copy]').click();
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  const pending = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  const proposal = JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
  expect(proposal.inputs.original.equipment[0].frequencyHz).toBe(50);
  expect(proposal.issues.some(item => item.path === 'equipment[0].frequencyHz')).toBe(true);
  await page.reload();
  await expect(page.locator('#synthesis-equipment')).toHaveValue(/"frequencyHz":\s*50/);
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
});

for (const count of [25, 50]) test(`reviews, applies, reloads and regenerates ${count} named-project equipment/load pairs`, async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const records = projectRows(count);
  const name = `Project equipment handoff ${count}`;
  await page.evaluate(({ name, records }) => {
    window.currentProjectId = name;
    window.dataStore.setProjectMeta({ id: name, name });
    window.dataStore.setEquipment(records.equipment);
    window.dataStore.setLoads(records.loads);
    if (!window.dataStore.saveProject(name)) throw new Error('Could not save the named source project fixture');
  }, { name, records });
  const host = page.locator('#synthesis-project-equipment');
  await expect(host).toContainText(name);
  await expect(host.locator('[data-project-equipment-select]:not([disabled])')).toHaveCount(count);
  for (const row of records.equipment) await host.locator(`[data-project-equipment-select="${row.id}"]`).check();
  for (const basis of ['electricalInputKW', 'voltageLineToLine', 'coordinatesFeet']) await host.locator(`[data-project-equipment-ack="${basis}"]`).check();
  await host.locator('[data-project-equipment-review]').click();
  await expect(host).toContainText(`${count} selected pair(s)`);
  await host.locator('[data-project-equipment-copy]').click();
  await expect(page.locator('#synthesis-status')).toContainText(`Copied ${count} reviewed project equipment/load pair`);
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-output')).toContainText('Reviewed project equipment mapping');
  await expect(page.locator('#synthesis-project-equipment-provenance tbody tr')).toHaveCount(count);
  let downloadPromise = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  let proposal = JSON.parse(await fs.readFile(await (await downloadPromise).path(), 'utf8'));
  expect(proposal.projectEquipmentAdoption.pairs).toHaveLength(count);
  expect(proposal.projectEquipmentAdoption.pairs[0]).toMatchObject({ equipmentId: records.equipment[0].id, loadId: records.loads[0].id, equipmentTag: records.equipment[0].tag, loadTag: records.loads[0].tag });
  await page.reload();
  await expect(page.locator('#synthesis-project-equipment')).toContainText(name);
  await expect(page.locator('#synthesis-equipment')).toHaveValue(new RegExp(records.equipment[count - 1].id));
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-output')).toContainText('Reviewed project equipment mapping');
  downloadPromise = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  proposal = JSON.parse(await fs.readFile(await (await downloadPromise).path(), 'utf8'));
  expect(proposal.projectEquipmentAdoption.pairs).toHaveLength(count);
  expect(proposal.status).toBe('proposal');
  downloadPromise = page.waitForEvent('download');
  await page.locator('#synthesis-download-report').click();
  const report = await fs.readFile(await (await downloadPromise).path(), 'utf8');
  expect(report).toContain(`Reviewed existing-project equipment mapping: ${name}`);
  const delimiter = 'Complete JSON payload:';
  expect(JSON.parse(report.slice(report.indexOf(delimiter) + delimiter.length).trim())).toEqual(proposal);
  await fs.writeFile(testInfo.outputPath(`project-equipment-${count}-proposal.json`), JSON.stringify(proposal, null, 2));
  await fs.writeFile(testInfo.outputPath(`project-equipment-${count}-report.txt`), report);
  await page.locator('#synthesis-project-equipment-provenance').screenshot({path:testInfo.outputPath(`project-equipment-${count}-mapping.png`),style:'.top-nav { position: static !important; }'});
  await expect(page.locator('#synthesis-apply')).toBeEnabled();
  await page.locator('#synthesis-apply').click();
  await page.waitForURL(/cableschedule\.html/, {timeout:30000});
  await page.waitForFunction(() => window.__ctrProjectReady === true && Boolean(window.dataStore));
  const readCanonical = () => page.evaluate(() => ({equipment:window.dataStore.getEquipment(),loads:window.dataStore.getLoads(),panels:window.dataStore.getPanels(),cables:window.dataStore.getCables(),oneLine:window.dataStore.getOneLine()}));
  const canonical = await readCanonical();
  expect(canonical.loads.map(row => row.id).sort()).toEqual(records.loads.map(row => row.id).sort());
  expect(canonical.panels.flatMap(row => row.loadIds).sort()).toEqual(records.loads.map(row => row.id).sort());
  for (let index = 0; index < count; index++) {
    const equipment = canonical.equipment.find(row => row.id === records.equipment[index].id);
    const load = canonical.loads.find(row => row.id === records.loads[index].id);
    expect(equipment.ownerCustomData).toEqual(records.equipment[index].ownerCustomData);
    expect(equipment._designSynthesis).toBeUndefined();
    expect(load.equipmentId).toBe(equipment.id);
    expect(load.tag).toBe(records.loads[index].tag);
    expect(load.ownerCustomData).toEqual(records.loads[index].ownerCustomData);
    const panel = canonical.panels.find(row => row.id.toLowerCase() === load.panelId.toLowerCase());
    expect(panel.breakers[load.breaker - 1]).toBe(load.tag);
  }
  expect(canonical.oneLine.sheets).toHaveLength(1);
  expect(canonical.oneLine.sheets[0].components).toHaveLength(count + canonical.panels.length + 1);
  expect(canonical.oneLine.sheets[0].connections).toHaveLength(canonical.cables.length);
  await page.goto(server.url('panelschedule.html'));
  await page.waitForFunction(() => window.__ctrProjectReady === true);
  expect((await readCanonical()).loads.map(row => row.id).sort()).toEqual(records.loads.map(row => row.id).sort());
  await page.screenshot({path:testInfo.outputPath(`project-equipment-${count}-panel-schedule.png`)});
  await page.goto(server.url('oneline.html'));
  await page.waitForFunction(() => window.__ctrProjectReady === true);
  expect((await readCanonical()).oneLine.sheets[0].connections).toHaveLength(canonical.cables.length);
  await page.goto(server.url('designsynthesis.html'));
  await expect(page.locator('#synthesis-equipment')).toHaveValue(new RegExp(records.equipment[count - 1].id));
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-apply')).toBeEnabled();
  await page.locator('#synthesis-apply').click();
  await page.waitForURL(/cableschedule\.html/);
  await page.waitForFunction(() => window.__ctrProjectReady === true);
  const reapplied = await readCanonical();
  expect(reapplied).toEqual(canonical);
  await page.reload();
  await page.waitForFunction(() => window.__ctrProjectReady === true);
  expect(await readCanonical()).toEqual(canonical);
  await fs.writeFile(testInfo.outputPath(`project-equipment-${count}-canonical.json`), JSON.stringify(canonical, null, 2));
});

test('creates and regenerates loads from rated equipment without a load list', async ({ page }) => {
  test.setTimeout(180000);
  const records = projectRows(25);
  records.equipment = records.equipment.map(row => ({ ...row, kw: 6.5, powerFactor: 0.88, duty: 'continuous', ratingsBasis: 'electrical-input-kW' }));
  await page.goto(server.url('equipmentlist.html?e2e=1'));
  await page.waitForFunction(() => window.__ctrProjectReady === true && Boolean(window.dataStore));
  await page.evaluate(() => {
    const name = 'Equipment ratings only';
    window.currentProjectId = name;
    window.dataStore.setProjectMeta({ id: name, name });
    window.dataStore.setLoads([]);
    if (!window.dataStore.saveProject(name)) throw new Error('Could not save project');
  });
  await page.evaluate(() => { window.projectManager.saveProject({ skipManual: true }); });
  const initialSave = page.getByRole('dialog', { name: 'Project Saved' });
  await expect(initialSave).toBeVisible();
  await initialSave.getByRole('button', { name: 'Close', exact: true }).click();
  const header = 'EquipmentID,Equipment Tag,Category,Voltage,Phases,Electrical Input (kW),Power Factor,Duty,Rating Basis,X,Y,Z';
  const csv = [header, ...records.equipment.map(row => [row.id, row.tag, row.category, row.voltage, row.phases, row.kw, row.powerFactor, row.duty, row.ratingsBasis, row.x, row.y, row.z].join(','))].join('\n');
  await page.locator('#import-csv-input').setInputFiles({ name: 'rated-equipment.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('dialog', { name: 'Map Equipment Import' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview Import' }).click();
  await expect(page.getByRole('dialog', { name: 'Preview Equipment Import' })).toBeVisible();
  await page.getByRole('button', { name: 'Replace Existing' }).click();
  await expect.poll(() => page.evaluate(() => window.dataStore.getEquipment().length)).toBe(25);
  expect(await page.evaluate(() => window.dataStore.getEquipment()[0])).toMatchObject({ kw: 6.5, powerFactor: 0.88, duty: 'continuous', ratingsBasis: 'electrical-input-kW' });
  await page.evaluate(() => { window.projectManager.saveProject({ skipManual: true }); });
  const importedSave = page.getByRole('dialog', { name: 'Project Saved' });
  await expect(importedSave).toBeVisible();
  await importedSave.getByRole('button', { name: 'Close', exact: true }).click();
  await page.goto(server.url('designsynthesis.html?e2e=1'));
  await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  const host = page.locator('#synthesis-project-equipment');
  await expect(host).toContainText('proposed load');
  for (const row of records.equipment) await host.locator(`[data-project-equipment-select="${row.id}"]`).check();
  for (const basis of ['electricalInputKW', 'voltageLineToLine', 'coordinatesFeet']) await host.locator(`[data-project-equipment-ack="${basis}"]`).check();
  await host.locator('[data-project-equipment-review]').click();
  await expect(host).toContainText('25 selected pair(s)');
  await host.locator('[data-project-equipment-copy]').click();
  await page.evaluate(() => { window.projectManager.saveProject({ skipManual: true }); });
  const designSave = page.getByRole('dialog', { name: 'Project Saved' });
  await expect(designSave).toBeVisible();
  await designSave.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-apply')).toBeEnabled();
  await page.locator('#synthesis-apply').click();
  await page.waitForURL(/cableschedule\.html/);
  await page.waitForFunction(() => window.__ctrProjectReady === true);
  const read = () => page.evaluate(() => ({ equipment: window.dataStore.getEquipment(), loads: window.dataStore.getLoads(), panels: window.dataStore.getPanels(), cables: window.dataStore.getCables() }));
  const applied = await read();
  const created = applied.loads.filter(row => row.equipmentId);
  expect(created).toHaveLength(25);
  for (const equipment of records.equipment) {
    const load = created.find(row => row.equipmentId === equipment.id);
    expect(load.id.toLowerCase()).toBe(`ds-load-${equipment.id}`);
    expect(Number(load.kw)).toBe(equipment.kw);
    expect(load._designSynthesis.source).toBe('design-synthesis');
    expect(Number(applied.equipment.find(row => row.id === equipment.id).kw)).toBe(equipment.kw);
  }
  await page.goto(server.url('designsynthesis.html'));
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-apply')).toBeEnabled();
  await page.locator('#synthesis-apply').click();
  await page.waitForURL(/cableschedule\.html/);
  await page.waitForFunction(() => window.__ctrProjectReady === true);
  expect(await read()).toEqual(applied);
});

test('imports motor ratings from the Equipment List and retains motor protection blockers', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(server.url('equipmentlist.html?e2e=1'));
  await page.waitForFunction(() => window.__ctrProjectReady === true && Boolean(window.dataStore));
  await page.evaluate(() => {
    const name = 'Motor equipment import';
    window.currentProjectId = name;
    window.dataStore.setProjectMeta({ id: name, name });
    window.dataStore.setLoads([]);
    if (!window.dataStore.saveProject(name)) throw new Error('Could not save project');
  });
  const csv = [
    'EquipmentID,Equipment Tag,Category,Voltage,Phases,Electrical Input (kW),Power Factor,Duty,Rating Basis,X,Y,Z,Motor Rated Voltage (V),Motor Design FLC (A),Motor Design FLC Reference,Motor Nameplate Current (A),Motor Nameplate Horsepower,Motor Nameplate Frequency (Hz),Motor Locked Rotor Current (A),Motor Locked Rotor Power Factor,Motor Starter Type,Motor Rotor Type',
    'motor-eq,M-01,Motor,480,3,9,0.86,continuous,electrical-input-kW,12,10,0,460,14,Synthetic test design current,12.8,10,60,90,0.3,dol,squirrel-cage',
  ].join('\n');
  await page.locator('#import-csv-input').setInputFiles({ name: 'motor.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Preview Import' }).click();
  await page.getByRole('button', { name: 'Replace Existing' }).click();
  await expect.poll(() => page.evaluate(() => window.dataStore.getEquipment()[0]?.motorFullLoadCurrentReference)).toBe('Synthetic test design current');
  await page.evaluate(() => { if (!window.dataStore.saveProject(window.currentProjectId)) throw new Error('Could not save import'); });
  await page.goto(server.url('designsynthesis.html?e2e=1'));
  await expect(page.locator('#synthesis-equipment')).not.toHaveValue('');
  await page.locator('#synthesis-load-motor-sample').click();
  await expect(page.locator('#synthesis-status')).toContainText('sample loaded');
  const host = page.locator('#synthesis-project-equipment');
  await host.locator('[data-project-equipment-select="motor-eq"]').check();
  for (const basis of ['electricalInputKW', 'voltageLineToLine', 'coordinatesFeet']) await host.locator(`[data-project-equipment-ack="${basis}"]`).check();
  await host.locator('[data-project-equipment-review]').click();
  await expect(host).toContainText('1 selected pair(s)');
  await expect(host).toContainText('design FLC 14 A (Synthetic test design current)');
  await expect(host).toContainText('nameplate 12.8 A; locked rotor 90 A / PF 0.3');
  await host.locator('[data-project-equipment-copy]').click();
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText('Proposal blocked');
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
  const download = page.waitForEvent('download');
  await page.locator('#synthesis-download-json').click();
  const proposal = JSON.parse(await fs.readFile(await (await download).path(), 'utf8'));
  expect(proposal.loads[0].motor).toMatchObject({ ratedVoltageV: 460, fullLoadCurrentA: 14, nameplateCurrentA: 12.8, lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, fullLoadCurrentBasis: { reference: 'Synthetic test design current' } });
  expect(proposal.motorStartingValidation.cases).toHaveLength(1);
  expect(proposal.issues.some(row => row.code === 'MOTOR_PROTECTION_UNRESOLVED')).toBe(true);
});

test('shows missing links and keeps an incomplete canonical motor blocked from transfer', async ({ page }) => {
  await page.evaluate(() => {
    window.currentProjectId = 'Incomplete project equipment';
    window.dataStore.setProjectMeta({ id: 'Incomplete project equipment', name: 'Incomplete project equipment' });
    window.dataStore.setEquipment([{ id: 'motor-eq', tag: 'M-01', category: 'Motor', voltage: 480, phases: 3, x: 0, y: 0, z: 0 }]);
    window.dataStore.setLoads([]);
    window.dataStore.saveProject(window.currentProjectId);
  });
  const host = page.locator('#synthesis-project-equipment');
  await host.locator('[data-project-equipment-select="motor-eq"]').check();
  for (const basis of ['electricalInputKW', 'voltageLineToLine', 'coordinatesFeet']) await host.locator(`[data-project-equipment-ack="${basis}"]`).check();
  await host.locator('[data-project-equipment-review]').click();
  await expect(host).toContainText('needs a uniquely linked load or an explicit equipment kW rating');
  await expect(host.locator('[data-project-equipment-copy]')).toBeHidden();
  await page.evaluate(() => window.dataStore.setLoads([{ id: 'motor-load', equipmentId: 'motor-eq', tag: 'M-01', kw: 7.5, voltage: 480, phases: 3, loadType: 'Motor' }]));
  await host.locator('[data-project-equipment-review]').click();
  await expect(host).toContainText('has no explicit motor nameplate record');
  await expect(host.locator('[data-project-equipment-copy]')).toBeHidden();
});

test('a motor reference on an otherwise unclassified project row blocks transfer without motor data', async ({ page }) => {
  const records = projectRows(1);
  records.equipment[0].motorDataReference = 'Manufacturer motor nameplate';
  await page.evaluate(records => {
    window.currentProjectId = 'Referenced motor';
    window.dataStore.setProjectMeta({ id: window.currentProjectId, name: window.currentProjectId });
    window.dataStore.setEquipment(records.equipment);
    window.dataStore.setLoads(records.loads);
    window.dataStore.saveProject(window.currentProjectId);
  }, records);
  const host = page.locator('#synthesis-project-equipment');
  await host.locator('[data-project-equipment-select]').check();
  for (const basis of ['electricalInputKW', 'voltageLineToLine', 'coordinatesFeet']) await host.locator(`[data-project-equipment-ack="${basis}"]`).check();
  await host.locator('[data-project-equipment-review]').click();
  await expect(host).toContainText('has no explicit motor nameplate record');
  await expect(host.locator('[data-project-equipment-copy]')).toBeHidden();
});

test('source edits after mapping require a fresh review before regeneration or downloads', async ({ page }) => {
  const records = projectRows(1);
  await page.evaluate(records => {
    window.currentProjectId = 'Source review freshness';
    window.dataStore.setProjectMeta({id:window.currentProjectId,name:window.currentProjectId});
    window.dataStore.setEquipment(records.equipment);
    window.dataStore.setLoads(records.loads);
    window.dataStore.saveProject(window.currentProjectId);
  }, records);
  const host = page.locator('#synthesis-project-equipment');
  await host.locator('[data-project-equipment-select]').check();
  for (const basis of ['electricalInputKW','voltageLineToLine','coordinatesFeet']) await host.locator(`[data-project-equipment-ack="${basis}"]`).check();
  await host.locator('[data-project-equipment-review]').click();
  await host.locator('[data-project-equipment-copy]').click();
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-download-json')).toBeEnabled();
  await page.evaluate(() => window.dataStore.updateEquipment(0,{x:13}));
  await expect(page.locator('#synthesis-download-json')).toBeDisabled();
  await page.locator('#synthesis-generate').click();
  await expect(page.locator('#synthesis-status')).toContainText(/review|changed|stale/i);
  await expect(page.locator('#synthesis-download-json')).toBeDisabled();
  await expect(page.locator('#synthesis-download-report')).toBeDisabled();
  await expect(page.locator('#synthesis-apply')).toBeDisabled();
});

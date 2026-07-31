import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

test('Raceway Schedule compares a read-only BIM snapshot and stores an issue', async ({ page }) => {
  await page.goto(pageUrl('racewayschedule.html?e2e=1&e2e_reset=1'));
  await page.evaluate(() => {
    window.projectStorage.writeScenarioValue('traySchedule', [{
      tray_id: 'TR-BIM-1', bim_guid: 'IFC-GUID-1',
      start_x: 0, start_y: 0, start_z: 0,
      end_x: 10, end_y: 0, end_z: 0
    }]);
  });
  await page.reload();
  const bimMenu = page.locator('details.toolbar-menu').filter({ hasText: 'CAD / BIM' });
  await bimMenu.evaluate(menu => { menu.open = true; });
  await page.click('#bim-coordination-btn');
  const dialog = page.getByRole('dialog', { name: 'BIM Coordination' });
  await dialog.locator('#bim-coordination-model-input').setInputFiles({
    name: 'coordination.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      trays: [{
        TrayID: 'TR-BIM-1', GlobalId: 'IFC-GUID-1',
        StartX: 0, StartY: 0, StartZ: 0,
        EndX: 14, EndY: 0, EndZ: 0
      }],
      ElectricalEquipment: [{ id: 'MCC-BIM-1', GlobalId: 'EQ-GUID-1', Family: 'MCC' }],
      Hangers: [{ id: 'HGR-BIM-1', GlobalId: 'SUP-GUID-1', Type: 'Trapeze', HostId: 'TR-BIM-1' }]
    }))
  });
  await expect(dialog.locator('#bim-coordination-status')).toContainText('3 BIM elements');
  await expect(dialog.locator('#bim-coordination-status')).toContainText('1 geometry changes');
  await expect(dialog.locator('#bim-coordination-differences')).toContainText('equipment');
  await expect(dialog.locator('#bim-coordination-differences')).toContainText('support');
  await dialog.locator('#bim-issue-title').fill('Confirm tray length with model team');
  await dialog.locator('#bim-issue-assignee').fill('BIM coordinator');
  await dialog.locator('#bim-create-issue-btn').click();
  await expect(dialog.locator('#bim-coordination-issues')).toContainText('Confirm tray length with model team');
  const stored = await page.evaluate(() => ({
    snapshot: JSON.parse(localStorage.getItem('base:bimCoordinationSnapshot') || '{}'),
    issues: JSON.parse(localStorage.getItem('base:bimCoordinationIssues') || '[]')
  }));
  expect(stored.snapshot.elements[0].sourceGuid).toBe('IFC-GUID-1');
  expect(stored.issues[0].assignee).toBe('BIM coordinator');
});

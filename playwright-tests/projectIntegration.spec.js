import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageUrl = file => `file://${path.join(root, file)}?e2e=1`;

const equipment = [
  { tag: 'MCC-101', description: 'Motor control center', voltage: 480, category: 'Distribution' },
  { tag: 'PMP-101', description: 'Cooling water pump', voltage: 480, category: 'Mechanical Load', subCategory: 'Pump' },
];

const loads = [
  { tag: 'PMP-101', source: 'MCC-101', description: 'Cooling water pump motor', loadType: 'Motor', kw: 18.6, powerFactor: 85, efficiency: 92, demandFactor: 100 },
  { tag: 'LTG-101', source: 'LP-101', description: 'Process building lighting', loadType: 'Lighting', kw: 3.2, demandFactor: 100 },
];

const cables = [
  { tag: 'CBL-MCC-PMP-101', from: 'MCC-101', to: 'PMP-101', conductor_size: '#4 AWG', conductor_material: 'Copper', conductors: 3, length_ft: 95, voltage: 480, raceway_ids: ['TR-1'] },
];

const trays = [{ id: 'TR-1', tray_id: 'TR-1', width: 24, height: 6 }];

const projectMeta = {
  name: 'Project Alpha',
  number: 'P-2401',
  client: 'Example Owner',
  site: 'North Utility Yard',
  location: 'Tulsa, OK',
  engineer: 'D. Engineer, PE',
  license: 'PE-12345',
  revision: '2',
  altitudeFt: 1250,
  ambientTempC: 46,
  minAmbientTempC: -20,
  maxAmbientTempC: 46,
  batteryRuntimeHours: 1.5,
};

async function seedProject(page, firstPage = 'battery.html') {
  await page.goto(pageUrl(firstPage));
  await page.evaluate(({ equipment, loads, cables, trays, projectMeta }) => {
    localStorage.clear();
    localStorage.setItem('base:equipment', JSON.stringify(equipment));
    localStorage.setItem('base:loadList', JSON.stringify(loads));
    localStorage.setItem('base:cableSchedule', JSON.stringify(cables));
    localStorage.setItem('base:traySchedule', JSON.stringify(trays));
    localStorage.setItem('base:projectMeta', JSON.stringify(projectMeta));
    localStorage.setItem('base:designBasis', JSON.stringify({ sizingDefaults: { defaultPowerFactor: 0.92, insulationType: 'THWN-2', installationType: 'conduit' } }));
    localStorage.setItem('base:studyResults', JSON.stringify({ shortCircuit: { availableFaultKa: 22.4, xrRatio: 12 } }));
  }, { equipment, loads, cables, trays, projectMeta });
  await page.reload();
}

test.describe('shared project data integration', () => {
  test('Battery and Generator Sizing reuse project inputs without duplicate entry', async ({ page }) => {
    await seedProject(page);
    await expect(page.getByRole('region', { name: 'Project data sources' })).toContainText('Load List (2 loads)');
    await expect(page.locator('#system-label')).toHaveValue('North Utility Yard');
    await expect(page.locator('#avg-load-kw')).toHaveValue('21.8');
    await expect(page.locator('#runtime-hours')).toHaveValue('1.5');
    await expect(page.locator('#ambient-temp-c')).toHaveValue('-20');
    await expect(page.locator('#ups-pf')).toHaveValue('0.92');

    await page.goto(pageUrl('generatorsizing.html'));
    await expect(page.getByRole('region', { name: 'Project data sources' })).toContainText('Load List (2 loads)');
    await expect(page.locator('#project-label')).toHaveValue('North Utility Yard');
    await expect(page.locator('#load-table-body tr')).toHaveCount(2);
    await expect(page.locator('#altitude-ft')).toHaveValue('1250');
    await expect(page.locator('#ambient-c')).toHaveValue('46');
    await expect(page.locator('#motor-hp')).toHaveValue('22.9');
  });

  test('manual overrides persist and linked study results become stale after upstream changes', async ({ page }) => {
    await seedProject(page);
    await page.locator('#avg-load-kw').fill('30');
    await page.locator('#peak-load-kw').fill('35');
    await page.locator('#battery-form button[type="submit"]').click();

    const link = await page.evaluate(() => window.dataStore.getStudies().batterySizing.projectLink);
    expect(link.overrides).toEqual(['averageLoadKw', 'peakLoadKw']);
    await page.reload();
    await expect(page.locator('#avg-load-kw')).toHaveValue('30');

    await page.getByRole('button', { name: 'Refresh from project' }).click();
    await page.locator('#battery-form button[type="submit"]').click();
    await page.evaluate(() => {
      const current = window.dataStore.getLoads();
      current[0].kw = 28.6;
      window.dataStore.setLoads(current);
    });
    await page.reload();
    await expect(page.getByText(/Project inputs changed since this result was calculated/)).toBeVisible();
  });

  test('Report Builder edits and reuses canonical project metadata', async ({ page }) => {
    await seedProject(page, 'projectreport.html');
    await expect(page.locator('#rpt-project-name')).toHaveValue('Project Alpha');
    await expect(page.locator('#rpt-project-number')).toHaveValue('P-2401');
    await expect(page.locator('#rpt-client')).toHaveValue('Example Owner');
    await expect(page.locator('#rpt-site')).toHaveValue('North Utility Yard');
    await expect(page.locator('#rpt-altitude-ft')).toHaveValue('1250');

    await page.locator('#rpt-client').fill('Updated Owner');
    await page.locator('#rpt-client').blur();
    await expect.poll(() => page.evaluate(() => window.dataStore.getProjectMeta().client)).toBe('Updated Owner');
  });

  test('common study and deliverable fields use shared site conditions', async ({ page }) => {
    await seedProject(page, 'heattracesizing.html');
    await expect(page.locator('#ambient-temp-c')).toHaveValue('-20');
    await expect(page.getByLabel('Linked source: Minimum ambient')).toBeVisible();

    await page.goto(pageUrl('busdust.html'));
    await expect(page.locator('#ambient-c')).toHaveValue('46');
    await expect(page.getByLabel('Linked source: Maximum ambient')).toBeVisible();

    await page.goto(pageUrl('submittal.html'));
    await expect(page.locator('#sub-project-name')).toHaveValue('Project Alpha');
    await expect(page.getByLabel('Linked source: Project metadata')).toBeVisible();
  });

  test('specialized studies bind to selected loads, circuits, and upstream results', async ({ page }) => {
    await seedProject(page, 'busdust.html');
    await expect(page.getByRole('combobox', { name: 'Bus duct project scope' })).toContainText('Cooling water pump motor');
    await expect(page.locator('#system-voltage')).toHaveValue('480');
    await expect(page.locator('#length-ft')).toHaveValue('95');
    await expect(page.locator('#ambient-c')).toHaveValue('46');
    await expect(page.locator('#fault-ka')).toHaveValue('22.4');

    await page.goto(pageUrl('voltageflicker.html'));
    await expect(page.locator('#nominal-kv')).toHaveValue('0.48');
    await expect(page.locator('#xr-ratio')).toHaveValue('12');
    await expect(page.locator('#system-kva')).not.toHaveValue('50000');
    await expect(page.locator('#load-steps-list .dynamic-row')).toHaveCount(1);
    await expect(page.locator('#load-steps-list .load-label')).toHaveValue('Cooling water pump motor');

    await page.goto(pageUrl('iec60287.html'));
    await expect(page.getByRole('combobox', { name: 'Cable project scope' })).toContainText('CBL-MCC-PMP-101');
    await expect(page.locator('#size-mm2')).toHaveValue('25');
    await expect(page.locator('#material')).toHaveValue('Cu');
    await expect(page.locator('#insulation')).toHaveValue('PVC');
    await expect(page.locator('#install-method')).toHaveValue('tray');
    await expect(page.locator('#ambient-temp-c')).toHaveValue('46');
    await expect(page.locator('#u0-kv')).toHaveValue('0.277');

    await page.evaluate(() => {
      const studies = window.dataStore.getStudies();
      studies.batterySizing = {
        selectedBankKwh: 250,
        chemistry: 'lead-acid-agm',
        rackLayoutInputs: { cellsPerModule: 12, modulesPerRack: 40 },
      };
      window.dataStore.setStudies(studies);
    });
    await page.goto(pageUrl('bessHazard.html'));
    await expect(page.locator('#rated-kwh')).toHaveValue('250');
    await expect(page.locator('#chemistry')).toHaveValue('lead-acid');
    await expect(page.locator('#cells-per-module')).toHaveValue('12');
    await expect(page.locator('#modules-per-rack')).toHaveValue('40');
    await expect(page.locator('#ambient-c')).toHaveValue('46');

    await page.goto(pageUrl('insulationcoordination.html'));
    await expect(page.getByRole('combobox', { name: 'Insulation coordination project scope' })).toContainText('MCC-101');
    await expect(page.locator('#nominal-kv')).toHaveValue('0.48');
    await expect(page.locator('#um-select')).toHaveValue('3.6');
    await expect(page.locator('#altitude-m')).toHaveValue('381');
  });
});

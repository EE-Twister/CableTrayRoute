import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

test('field view captures a cable observation into the project queue', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    const cables = [{
      tag: 'C-101',
      cable_type: 'Power',
      from_tag: 'SWGR-1',
      to_tag: 'MCC-1',
      conductor_size: '#4 AWG',
    }];
    const project = {
      schemaVersion: 1,
      name: 'field-observation-fixture',
      ductbanks: [],
      conduits: [],
      trays: [],
      cables,
      cableTypicals: [],
      settings: { session: {}, collapsedGroups: {}, units: 'imperial', theme: 'system' },
    };
    localStorage.setItem('CTR_PROJECT_V1', JSON.stringify(project));
    localStorage.setItem('ctr_scenarios_v1', JSON.stringify(['base']));
    localStorage.setItem('ctr_current_scenario_v1', 'base');
    localStorage.setItem('base:cableSchedule', JSON.stringify(cables));
  });

  await page.goto(pageUrl('fieldview.html#cable=C-101'));
  await page.waitForFunction(() => Boolean(window.dataStore));
  await expect(page.getByRole('heading', { name: 'Field observation / punch item' })).toBeVisible();
  await page.selectOption('[data-field-observation="type"]', 'punch');
  await page.fill('[data-field-observation="summary"]', 'Missing cable identification tag');
  await page.fill('[data-field-observation="observedBy"]', 'Field Tech');
  await page.click('[data-save-field-observation]');
  await expect(page.getByText('Saved locally and queued for the next project save.')).toBeVisible();
  await expect(page.locator('.fv-observation-item')).toContainText('Missing cable identification tag');

  const stored = await page.evaluate(() => ({
    observations: window.dataStore.getItem('fieldObservations', []),
    queue: window.dataStore.getItem('fieldObservationQueue', []),
  }));
  expect(stored.observations).toHaveLength(1);
  expect(stored.observations[0]).toMatchObject({ sourceId: 'C-101', type: 'punch', status: 'open' });
  expect(stored.queue).toEqual([stored.observations[0].id]);
});

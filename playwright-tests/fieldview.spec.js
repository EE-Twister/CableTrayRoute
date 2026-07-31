import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

test('field view captures a cable observation into the project queue', async ({ page }) => {
  await page.goto(pageUrl('fieldview.html'));
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('base:cableSchedule', JSON.stringify([{
      tag: 'C-101',
      cable_type: 'Power',
      from_tag: 'SWGR-1',
      to_tag: 'MCC-1',
      conductor_size: '#4 AWG',
    }]));
  });

  await page.goto(pageUrl('fieldview.html#cable=C-101'));
  await expect(page.getByRole('heading', { name: 'Field observation / punch item' })).toBeVisible();
  await page.selectOption('[data-field-observation="type"]', 'punch');
  await page.fill('[data-field-observation="summary"]', 'Missing cable identification tag');
  await page.fill('[data-field-observation="observedBy"]', 'Field Tech');
  await page.click('[data-save-field-observation]');
  await expect(page.getByText('Saved locally and queued for the next project save.')).toBeVisible();
  await expect(page.locator('.fv-observation-item')).toContainText('Missing cable identification tag');

  const stored = await page.evaluate(() => ({
    observations: JSON.parse(localStorage.getItem('base:fieldObservations') || '[]'),
    queue: JSON.parse(localStorage.getItem('base:fieldObservationQueue') || '[]'),
  }));
  expect(stored.observations).toHaveLength(1);
  expect(stored.observations[0]).toMatchObject({ sourceId: 'C-101', type: 'punch', status: 'open' });
  expect(stored.queue).toEqual([stored.observations[0].id]);
});

/**
 * Cable Schedule workspace layout at a common laptop viewport (1265 × 712):
 * the active project's name stays visible in the header, the editable table
 * starts above the fold, and compact controls keep their accessible names.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';

test.use({ serviceWorkers: 'block' });

const PROJECT = 'Refinery Unit 4 Expansion';
let server;
let base;
let dataDir;

test.beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-layout-'));
  const app = await createApp({ dataDir, staticRoot: process.cwd(), enforceHttps: false, rateLimit: { windowMs: 60_000, max: 500 } });
  server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (dataDir && path.basename(dataDir).startsWith('ctr-layout-')) await fs.rm(dataDir, { recursive: true, force: true });
});

async function openSeededSchedule(page) {
  await page.goto(`${base}/equipmentlist.html`);
  await page.waitForFunction(() => Boolean(window.projectManager && window.projectStorage && window.dataStore));
  await page.evaluate(name => {
    window.projectStorage.setProjectState({ ...window.projectStorage.getProjectState(), name });
    window.currentProjectId = name;
    window.dataStore.setCables(Array.from({ length: 12 }, (_, index) => ({
      tag: `CBL-${String(index + 1).padStart(3, '0')}`, from_tag: 'MCC-1', to_tag: `M-${index + 1}`,
      cable_type: 'Power', conductor_size: '#10 AWG', conductor_material: 'CU', est_load: 20,
      operating_voltage: 480, length: 100,
    })));
  }, PROJECT);
  await page.goto(`${base}/cableschedule.html#${encodeURIComponent(PROJECT)}`);
  await page.waitForFunction(() => window.__CableScheduleInitOK === true);
}

test.describe('laptop viewport', () => {
  test.use({ viewport: { width: 1265, height: 712 } });

  test('project name is visible and the first cable row starts above the fold', async ({ page }) => {
    await openSeededSchedule(page);
    const chipName = page.locator('#project-display .project-display-name');
    await expect(chipName).toBeVisible();
    await expect(chipName).toHaveText(PROJECT);
    await expect(page.locator('.project-actions-trigger')).toHaveAttribute('aria-label', new RegExp(`^Project actions for ${PROJECT}\\.`));

    const firstRow = page.locator('#cableScheduleTable tbody tr').first();
    await expect(firstRow).toBeVisible();
    const box = await firstRow.boundingBox();
    expect(box.y + box.height, 'first cable row should be fully inside the 712 px viewport').toBeLessThanOrEqual(712);

    // Next-action links render as compact inline buttons, not stretched blocks.
    const actions = page.locator('#cable-workflow-next-action a.btn');
    await expect(actions).toHaveCount(2);
    for (const action of await actions.all()) {
      const actionBox = await action.boundingBox();
      expect(actionBox.height).toBeLessThan(48);
      expect(await action.evaluate(el => getComputedStyle(el).textDecorationLine)).toBe('none');
    }
  });

  test('column group toggles announce what they collapse and their state', async ({ page }) => {
    await openSeededSchedule(page);
    const toggle = page.getByRole('button', { name: 'Collapse Terminations columns' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAttribute('type', 'button');
    await toggle.click();
    const expand = page.getByRole('button', { name: 'Expand Terminations columns' });
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expand.click();
    await expect(page.getByRole('button', { name: 'Collapse Terminations columns' })).toHaveAttribute('aria-expanded', 'true');
  });
});

test.describe('phone viewport', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('project menu shows the project name when the header collapses to an icon', async ({ page }) => {
    await openSeededSchedule(page);
    await expect(page.locator('#project-display')).toBeHidden();
    await page.locator('.project-actions-trigger').click();
    await expect(page.locator('#project-actions-heading')).toBeVisible();
    await expect(page.locator('#project-actions-heading')).toHaveText(new RegExp(`^${PROJECT} · `));
  });
});

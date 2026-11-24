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

async function openSeededSchedule(page, { sampleWorkflow = false } = {}) {
  await page.goto(`${base}/equipmentlist.html`);
  await page.waitForFunction(() => Boolean(window.projectManager && window.projectStorage && window.dataStore));
  await page.evaluate(({ name, sampleWorkflow: withSample }) => {
    window.projectStorage.setProjectState({ ...window.projectStorage.getProjectState(), name });
    window.currentProjectId = name;
    window.dataStore.setCables(Array.from({ length: 12 }, (_, index) => ({
      tag: `CBL-${String(index + 1).padStart(3, '0')}`, from_tag: 'MCC-1', to_tag: `M-${index + 1}`,
      cable_type: 'Power', conductor_size: '#10 AWG', conductor_material: 'CU', est_load: 20,
      operating_voltage: 480, length: 100,
    })));
    if (withSample) {
      // An active guided sample adds its Previous / Next / Checklist / Exit guide to the workflow band.
      const pages = ['equipmentlist.html', 'loadlist.html', 'oneline.html', 'cableschedule.html', 'racewayschedule.html', 'optimalRoute.html', 'cabletrayfill.html', 'projectreport.html'];
      window.dataStore.setItem('activeSampleWorkflow', {
        id: 'project-workflow-core',
        title: 'Project Workflow Core',
        checklist: pages.map((page, index) => ({ page, label: `Workflow step ${index + 1}`, hint: '' })),
      });
    }
  }, { name: PROJECT, sampleWorkflow });
  await page.goto(`${base}/cableschedule.html#${encodeURIComponent(PROJECT)}`);
  await page.waitForFunction(() => window.__CableScheduleInitOK === true);
}

// Measures the stacked chrome above the cable table: the workflow band, the
// Cable List heading row and toolbar, and the first rows of the table.
async function measureWorkspace(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height, center: box.top + box.height / 2 };
    };
    const rows = [...document.querySelectorAll('#cableScheduleTable tbody tr')].map(row => row.getBoundingClientRect());
    const band = document.querySelector('.workflow-step-nav');
    return {
      band: rect('.workflow-step-nav'),
      bandOverflows: band ? band.scrollWidth > band.clientWidth + 1 : false,
      stepLabel: rect('.workflow-step-nav-label'),
      guide: rect('.workflow-step-nav > .sample-workflow-guide'),
      heading: rect('.cable-schedule-header > h2'),
      toolbar: rect('.cable-schedule-toolbar'),
      firstRowBottom: rows[0]?.bottom ?? Infinity,
      fullyVisibleRows: rows.filter(box => box.top >= 0 && box.bottom <= window.innerHeight).length,
    };
  });
}

async function expectSingleRowChrome(page) {
  const layout = await measureWorkspace(page);
  // One workflow band: the step label and the sample guide share a row.
  expect(layout.band.height, 'workflow band should be one compact row').toBeLessThan(56);
  expect(layout.bandOverflows, 'workflow band content should not overflow').toBe(false);
  expect(Math.abs(layout.stepLabel.center - layout.guide.center)).toBeLessThan(12);
  // One toolbar row beside the Cable List heading.
  expect(layout.toolbar.height, 'cable toolbar should be a single row').toBeLessThan(52);
  expect(Math.abs(layout.heading.center - layout.toolbar.center)).toBeLessThan(16);
  return layout;
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

  test('a guided sample keeps one workflow band and several editable rows in view', async ({ page }) => {
    await openSeededSchedule(page, { sampleWorkflow: true });
    const layout = await expectSingleRowChrome(page);
    expect(layout.fullyVisibleRows, 'several editable cable rows should be visible').toBeGreaterThanOrEqual(3);
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

test.describe('compact laptop pane', () => {
  test.use({ viewport: { width: 1009, height: 596 } });

  test('a guided sample shows one band, one toolbar row, and the first cable row above the fold', async ({ page }) => {
    await openSeededSchedule(page, { sampleWorkflow: true });
    const guide = page.locator('.workflow-step-nav > .sample-workflow-guide');
    await expect(page.locator('.workflow-step-nav-label')).toContainText('Step 4 of');
    await expect(guide).toContainText('4 of 8');
    await expect(guide.getByRole('link', { name: /Previous/ })).toBeVisible();
    await expect(guide.getByRole('link', { name: /Next/ })).toBeVisible();
    await expect(guide.getByRole('link', { name: 'Checklist' })).toBeVisible();
    await expect(guide.getByRole('button', { name: 'Exit sample workflow' })).toBeVisible();

    // One add path: Add Cable is the primary button and Quick Add is its menu option.
    await expect(page.locator('#add-row-btn')).toBeVisible();
    await expect(page.locator('#quick-add-cables-btn')).toBeHidden();

    const layout = await expectSingleRowChrome(page);
    expect(layout.firstRowBottom, 'first cable row should sit clearly above the 596 px fold').toBeLessThanOrEqual(596 - 24);
  });

  test('Quick Add opens from the Add Cable menu and secondary actions sit under More', async ({ page }) => {
    await openSeededSchedule(page);
    const addMenu = page.locator('details.cable-add-menu');
    await addMenu.locator('summary').click();
    await expect(page.locator('#quick-add-cables-btn')).toBeVisible();

    const moreMenu = page.locator('#cable-more-menu');
    await moreMenu.locator('summary').click();
    await expect(addMenu, 'opening one toolbar menu closes the other').not.toHaveAttribute('open', '');
    for (const id of ['#load-schedule-btn', '#load-sample-cables-btn', '#open-tag-settings-btn', '#open-batch-edit-btn', '#open-change-log-btn', '#delete-all-btn']) {
      await expect(page.locator(id)).toBeVisible();
    }
    await moreMenu.locator('summary').focus();
    await page.keyboard.press('Escape');
    await expect(moreMenu).not.toHaveAttribute('open', '');
    await expect(moreMenu.locator('summary')).toBeFocused();
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

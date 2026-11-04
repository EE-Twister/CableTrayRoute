import { test, expect } from '@playwright/test';

// Pin the wall clock so time-stamped UI (for example the Cable Schedule
// "Last Change" metric) renders the same text on every run. Timers keep
// running, so debounced renders still fire.
const VISUAL_FIXED_TIME = new Date('2026-08-02T16:40:00Z');

const STABLE_VISUAL_CSS = `
  *, *::before, *::after {
    animation: none !important;
    caret-color: transparent !important;
    transition: none !important;
  }
  html, body, button, input, select, textarea {
    font-family: Arial, sans-serif !important;
  }
  #last-saved-indicator,
  [data-project-sync-status],
  .operation-toast,
  .tour-overlay,
  #tour-overlay {
    visibility: hidden !important;
  }
`;

async function openStablePage(page, path, readySelector) {
  await page.clock.setFixedTime(VISUAL_FIXED_TIME);
  await page.addInitScript(() => {
    localStorage.setItem('themePreference', JSON.stringify('light'));
    localStorage.setItem('onboarding', JSON.stringify({ completed: true, version: '2026.06' }));
  });
  await page.goto(path);
  await expect(page.locator(readySelector)).toBeVisible();
  await page.addStyleTag({ content: STABLE_VISUAL_CSS });
  await settleVisualState(page);
}

async function settleVisualState(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

test.describe('critical desktop visual contracts', () => {
  test('homepage command center', async ({ page }) => {
    await openStablePage(page, 'index.html?e2e=1&e2e_reset=1', 'main');
    // "My Projects" is filled by a dynamically imported module; wait until it
    // replaces the "Loading saved projects..." placeholder.
    await expect(page.locator('#home-projects-panel')).toHaveAttribute('data-project-workspace-mounted', 'true');
    await expect(page.locator('#home-projects-panel')).toHaveAttribute('aria-busy', 'false');
    await settleVisualState(page);
    await expect(page).toHaveScreenshot('homepage-desktop.png', { fullPage: true });
  });

  test('cable schedule populated workspace', async ({ page }) => {
    await openStablePage(page, 'cableschedule.html?e2e=1&e2e_reset=1', '#cableScheduleTable');
    await page.locator('#load-sample-cables-btn').click();
    await expect(page.locator('#cableScheduleTable tbody tr')).toHaveCount(3);
    // The KPI strip re-renders 400 ms after the click (scheduleSummaryMount.js);
    // wait for the three-cable summary so the screenshot cannot race it.
    await expect(page.locator('#schedule-summary .viz-kpis')).toBeVisible();
    await expect(page.locator('#schedule-summary .viz-kpi').first().locator('.viz-kpi__value')).toHaveText('3');
    await settleVisualState(page);
    await expect(page).toHaveScreenshot('cable-schedule-desktop.png');
  });

  test('ductbank route engineering workspace', async ({ page }) => {
    await openStablePage(page, 'ductbankroute.html?e2e=1&e2e_reset=1', '#gridWrapper');
    await page.locator('#loadDuctbankExample').click();
    await expect(page.locator('#conduitTable tbody tr')).not.toHaveCount(0);
    await settleVisualState(page);
    await expect(page).toHaveScreenshot('ductbank-route-desktop.png', { fullPage: true });
  });

  test('panel schedule workspace', async ({ page }) => {
    await openStablePage(page, 'panelschedule.html?e2e=1&e2e_reset=1', '#panel-container');
    await expect(page).toHaveScreenshot('panel-schedule-desktop.png', { fullPage: true });
  });
});

/**
 * E2E smoke tests for the Optimal Route tool.
 * Covers: page structure, tray/cable data loading, routing action, 3D view.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

test.describe('Optimal Route', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('optimalRoute.html?e2e=1&e2e_reset=1'));
    await page.locator('#optimal-ready-beacon[data-optimal-ready="1"]').waitFor();
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Optimal Route');
  });

  test('has Calculate Route button', async ({ page }) => {
    await expect(page.locator('#calculate-route-btn')).toBeVisible();
  });

  test('has tray and cable panel sections', async ({ page }) => {
    await expect(page.locator('#load-sample-trays-btn')).toBeVisible();
    await expect(page.locator('#add-cable-btn')).toBeVisible();
  });

  test('loads sample tray network', async ({ page }) => {
    await page.click('#load-sample-trays-btn');
    // After loading samples, the manual tray table should be populated
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('#trayTable tbody tr');
      return rows.length > 0;
    }, { timeout: 5000 });
    const rowCount = await page.locator('#trayTable tbody tr').count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('can add a cable to the list', async ({ page }) => {
    const initialCount = await page.locator('#cableList li, #cable-list li, #cables-panel tbody tr').count();
    await page.click('#add-cable-btn');
    // A new row or list item should appear
    const newCount = await page.locator('#cableList li, #cable-list li, #cables-panel tbody tr').count();
    expect(newCount).toBeGreaterThanOrEqual(initialCount);
  });

  test('export trays CSV triggers download', async ({ page }) => {
    await page.click('#load-sample-trays-btn');
    await page.waitForFunction(() => {
      return document.querySelectorAll('#trayTable tbody tr').length > 0;
    }, { timeout: 5000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await page.click('#export-trays-btn');
    await downloadPromise;
  });

  test('3D view container is present', async ({ page }) => {
    // The Plotly chart div should exist in the DOM
    const chartEl = page.locator('#route-plot, .js-plotly-plot, [id*="plot"]');
    await expect(chartEl.first()).toBeAttached();
  });

  test('renders the professional desktop route viewer without panel overlap', async ({ page }) => {
    await page.click('#load-sample-network-btn');
    await expect(page.locator('#pull-check-options')).toBeHidden();
    await expect(page.locator('#pull-checks-details')).toBeHidden();
    await page.locator('#perform-pull-checks').check();
    await expect(page.locator('#pull-check-options')).toBeVisible();
    await expect(page.locator('#allow-hand-pulls')).toBeChecked();
    await expect(page.locator('#hand-pull-max-length')).toHaveValue('25');
    await expect(page.locator('#hand-pull-max-tension')).toHaveValue('200');
    await page.locator('#pull-max-length').fill('100');
    await page.click('#calculate-route-btn');
    await page.waitForFunction(() => (
      window.__routeViewerDebug?.engine === 'three'
      && window.__routeViewerDebug.routeCount > 0
    ), null, { timeout: 30000 });

    const debug = await page.evaluate(() => window.__routeViewerDebug);
    expect(debug.routeCount).toBe(30);
    expect(debug.racewayKinds.tray).toBeGreaterThan(0);
    expect(debug.racewayKinds.conduit).toBeGreaterThan(0);
    expect(debug.racewayKinds.ductbank).toBeGreaterThan(0);
    expect(debug.gradePlane.transitionCount).toBeGreaterThanOrEqual(2);
    expect(debug.racewayFilter.mode).toBe('compatible');
    expect(debug.racewayFilter.selectedCableGroup).toBe('HV');
    expect(debug.racewayFilter.visibleCount).toBeLessThan(debug.racewayFilter.totalCount);
    expect(debug.racewayFilter.classCounts.HV).toBeGreaterThan(0);
    expect(debug.racewayFilter.classCounts.LV).toBeGreaterThan(0);
    expect(debug.racewayFilter.classCounts.INSTRUMENT).toBeGreaterThan(0);
    expect(debug.racewayFilter.classCounts.COMMUNICATION).toBeGreaterThan(0);
    expect(debug.layerVisibility.pullSetups).toBe(true);
    expect(debug.pullSetups.count).toBeGreaterThan(1);
    expect(debug.pullEquipment.reels).toBeGreaterThan(1);
    expect(debug.pullEquipment.tuggers).toBeGreaterThan(1);
    expect(debug.pullEquipment.handPulls).toBeGreaterThan(0);
    expect(debug.pullEquipment.sheaves).toBeGreaterThan(0);
    expect(debug.pullEquipment.rollers).toBeGreaterThan(0);
    expect(debug.render.calls).toBeGreaterThan(0);

    await expect(page.locator('#route-viewer-route-list .route-viewer-route-button')).toHaveCount(30);
    await expect(page.locator('#route-inspector-title')).toContainText('Cable 01');
    await expect(page.locator('#route-inspector-cable-class')).toHaveText('Cable class · HV');
    await expect(page.locator('#raceway-filter-summary')).toContainText('HV compatible');
    await expect(page.locator('#route-cable-class-legend')).toContainText('HV raceway');
    await expect(page.locator('#route-cable-class-legend')).toContainText('LV raceway');
    await expect(page.locator('#route-cable-class-legend')).toContainText('INSTRUMENT raceway');
    await expect(page.locator('#route-cable-class-legend')).toContainText('COMMUNICATION raceway');
    await expect(page.locator('#route-inspector-breakdown')).toContainText('60.00 ft');
    await expect(page.locator('#route-inspector-breakdown')).toContainText('Ductbank');
    await expect(page.locator('#route-inspector-breakdown')).toContainText('18.00 ft');
    await expect(page.locator('#route-inspector-breakdown')).toContainText('Conduit');
    await expect(page.locator('#route-inspector-breakdown')).toContainText('132.00 ft');
    await expect(page.locator('#route-inspector-breakdown')).toContainText('Cable tray');
    await expect(page.locator('#route-inspector-timeline')).toContainText('DB-HV-01');
    await expect(page.locator('#route-inspector-timeline')).toContainText('RISER-HV-01');
    await expect(page.locator('#route-inspector-timeline')).toContainText('ENTRY-HV');
    await expect(page.getByText('GRADE TRANSITION · RISER TO TRAY', { exact: true })).toBeVisible();
    const transitionLabelsOverlap = await page.evaluate(() => {
      const visibleLabel = className => Array.from(document.querySelectorAll(className)).find(label => !label.hidden);
      const transition = visibleLabel('.route-viewer-label--transition')?.getBoundingClientRect();
      const elevation = visibleLabel('.route-viewer-label--elevation')?.getBoundingClientRect();
      if (!transition || !elevation) return true;
      return !(
        transition.right < elevation.left
        || transition.left > elevation.right
        || transition.bottom < elevation.top
        || transition.top > elevation.bottom
      );
    });
    expect(transitionLabelsOverlap).toBe(false);
    await expect(page.locator('#route-inspector-metrics')).toContainText('Max fill');
    await expect(page.locator('#route-inspector-metrics')).toContainText('Pull sections');
    await expect(page.locator('#route-inspector-metrics')).toContainText('Reel / tugger / hand / sheave');
    await expect(page.locator('#route-inspector-pull-action')).toHaveText('Recalculate pull plan');
    await expect(page.locator('#pull-checks-details')).toBeVisible();
    await expect(page.locator('#pull-group-suggestions')).toBeChecked();
    await expect(page.locator('#pull-group-max-size')).toHaveValue('4');
    await expect(page.locator('.pull-group-review')).toBeVisible();
    await expect(page.locator('.pull-group-review')).toContainText('Automatic pull-set suggestions');
    await expect(page.locator('.pull-group-card')).toHaveCount(2);
    for (const width of [1366, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const pullGroupOverflow = await page.locator('.pull-group-review').evaluate(review => {
        const grid = review.querySelector('.pull-group-card-grid');
        const cards = Array.from(review.querySelectorAll('.pull-group-card'));
        const reviewRect = review.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        return {
          reviewLeft: reviewRect.left,
          reviewRight: reviewRect.right,
          viewportWidth,
          pageOverflows: document.documentElement.scrollWidth > viewportWidth + 1,
          reviewOutsideViewport: reviewRect.left < -1 || reviewRect.right > viewportWidth + 1,
          gridOverflows: Boolean(grid && grid.scrollWidth > grid.clientWidth + 1),
          cardContentOverflows: cards.some(card => {
            const cardRect = card.getBoundingClientRect();
            return Array.from(card.querySelectorAll('.pull-group-card-summary, .pull-group-actions'))
              .some(element => {
                const rect = element.getBoundingClientRect();
                return rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1;
              });
          })
        };
      });
      expect(pullGroupOverflow.pageOverflows, `page should not scroll horizontally at ${width}px`).toBe(false);
      expect(pullGroupOverflow.reviewOutsideViewport, `pull-set panel bounds at ${width}px: ${JSON.stringify(pullGroupOverflow)}`).toBe(false);
      expect(pullGroupOverflow.gridOverflows, `pull-set list should not scroll horizontally at ${width}px`).toBe(false);
      expect(pullGroupOverflow.cardContentOverflows, `pull-set controls should stay inside each row at ${width}px`).toBe(false);
    }
    const instrumentPullGroup = page.locator('.pull-group-card').filter({ hasText: 'Instrument' });
    await expect(instrumentPullGroup).toContainText('Cable 03');
    await expect(instrumentPullGroup).toContainText('Cable 08');
    await expect(instrumentPullGroup).toContainText('Cable 18');
    await expect(instrumentPullGroup.locator('.pull-group-card-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(instrumentPullGroup.locator('.pull-group-card-detail')).toBeHidden();
    await expect(instrumentPullGroup.getByRole('button', { name: 'Plan together' })).toBeVisible();
    await instrumentPullGroup.locator('.pull-group-card-toggle').click();
    await expect(instrumentPullGroup.locator('.pull-group-card-detail')).toBeVisible();
    await expect(instrumentPullGroup).toContainText('9 cable reels');
    await page.getByRole('button', { name: 'Expand all' }).click();
    await expect(page.locator('.pull-group-card-detail:visible')).toHaveCount(2);
    await page.getByRole('button', { name: 'Collapse all' }).click();
    await expect(page.locator('.pull-group-card-detail:visible')).toHaveCount(0);
    await expect.poll(() => page.locator('.pull-group-card-grid').evaluate(element => getComputedStyle(element).overflowY)).toBe('auto');
    await instrumentPullGroup.getByRole('button', { name: 'Plan together' }).click();
    await expect(page.locator('.pull-group-card').filter({ hasText: 'Instrument' })).toContainText('Planned together');
    await expect(page.locator('.pull-group-summary-badges')).toContainText('1 selected');
    const pullGroupCardsOverlap = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.pull-group-card'))
        .map(card => card.getBoundingClientRect());
      return cards.some((card, index) => cards.slice(index + 1).some(other => !(
        card.right <= other.left
        || card.left >= other.right
        || card.bottom <= other.top
        || card.top >= other.bottom
      )));
    });
    expect(pullGroupCardsOverlap).toBe(false);
    await page.locator('.pull-group-separate summary').click();
    await expect(page.locator('.pull-group-separate')).toHaveAttribute('open', '');
    await expect(page.locator('.pull-group-separate-list > div').first()).toContainText('Cable');
    await expect(page.locator('.pull-group-separate-list > div').first().locator('p')).not.toBeEmpty();
    await expect(page.locator('.pull-check-guidance')).toContainText('Setup locations are already calculated');
    const cableOnePullPlan = page.locator('#pull-checks-container [data-pull-route="Cable 01"]');
    await expect(cableOnePullPlan).toContainText('3 setups required');
    await expect(cableOnePullPlan).toContainText('tugger');
    await expect(cableOnePullPlan.getByRole('button', { name: /Show 3 setup locations/ })).toBeVisible();
    await page.locator('#pull-setups-toggle').uncheck();
    await page.locator('#labels-toggle').uncheck();
    await cableOnePullPlan.getByRole('button', { name: /Show 3 setup locations/ }).click();
    await expect(page.locator('#pull-setups-toggle')).toBeChecked();
    await expect(page.locator('#labels-toggle')).toBeChecked();
    await expect.poll(() => page.evaluate(() => window.__routeViewerDebug?.selectedRouteIndex)).toBe(0);
    await expect.poll(() => page.evaluate(() => window.__routeViewerDebug?.pullSetups?.count)).toBeGreaterThan(1);
    await expect(page.locator('#route-selection-status')).toContainText('3 calculated pull setup locations are displayed');
    const pullEquipmentLabelsOverlap = await page.evaluate(() => {
      const selectors = [
        '.route-viewer-label--reel',
        '.route-viewer-label--tugger',
        '.route-viewer-label--hand',
        '.route-viewer-label--sheave'
      ].join(',');
      const labels = Array.from(document.querySelectorAll(selectors))
        .filter(label => !label.hidden)
        .map(label => label.getBoundingClientRect());
      return labels.some((label, index) => labels.slice(index + 1).some(other => !(
        label.right <= other.left
        || label.left >= other.right
        || label.bottom <= other.top
        || label.top >= other.bottom
      )));
    });
    expect(pullEquipmentLabelsOverlap).toBe(false);
    const pullEquipmentLeaderSummary = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll([
        '.route-viewer-label--reel',
        '.route-viewer-label--tugger',
        '.route-viewer-label--hand',
        '.route-viewer-label--sheave'
      ].join(','))).filter(label => !label.hidden);
      const leaders = Array.from(document.querySelectorAll('.route-viewer-label-leader'))
        .filter(leader => leader.style.display !== 'none');
      return {
        labels: labels.length,
        leaders: leaders.length,
        complete: leaders.every(leader => (
          Boolean(leader.querySelector('.route-viewer-label-leader-line')?.getAttribute('d'))
          && Boolean(leader.querySelector('.route-viewer-label-leader-dot')?.getAttribute('cx'))
          && Boolean(leader.querySelector('.route-viewer-label-leader-dot')?.getAttribute('cy'))
        ))
      };
    });
    expect(pullEquipmentLeaderSummary.labels).toBeGreaterThan(3);
    expect(pullEquipmentLeaderSummary.leaders).toBe(pullEquipmentLeaderSummary.labels);
    expect(pullEquipmentLeaderSummary.complete).toBe(true);
    await expect(page.locator('.pull-field-plan')).toContainText('Selected cable field plan');
    await expect(page.locator('.pull-field-plan')).toContainText('Tugger 1');
    await expect(page.locator('.pull-field-plan')).toContainText('PULL BY HAND');
    await expect(page.locator('.pull-method-hand')).toBeVisible();
    await expect(page.locator('.route-viewer-label--hand')).toHaveCount(1);
    await expect(page.locator('.pull-field-plan')).toContainText('Weakest link');
    await expect(page.locator('.pull-sheave-strip')).toContainText('Sheave schedule');
    await page.locator('#route-breakdown-details > summary').click();
    await expect(page.locator('.route-list-table > thead')).toContainText('Candidates not used');
    await expect(page.locator('#route-screening-column-help')).toContainText('does not mean the selected route failed');
    const screeningToggle = page.locator('.route-screening-toggle').first();
    await expect(screeningToggle).toContainText('candidates not used');
    await expect(screeningToggle).toContainText('View reasons');
    const screeningCount = Number.parseInt(await screeningToggle.locator('strong').innerText(), 10);
    expect(screeningCount).toBeGreaterThan(0);
    await screeningToggle.click();
    const screeningReview = page.locator('.route-detail-row').first().locator('.route-screening-review');
    await expect(screeningReview).toBeVisible();
    await expect(screeningReview).toContainText(`Why ${screeningCount} candidates were not used`);
    await expect(screeningReview).toContainText('Selected route remains valid');
    await expect(screeningReview.locator('.route-screening-reason')).not.toHaveCount(0);
    await screeningReview.locator('.route-screening-records > summary').click();
    await expect(screeningReview.locator('.route-screening-records li')).toHaveCount(screeningCount);
    await page.locator('#pull-setups-toggle').uncheck();
    await expect.poll(() => page.evaluate(() => window.__routeViewerDebug?.pullSetups?.visible)).toBe(false);
    await expect.poll(() => page.evaluate(() => window.__routeViewerDebug?.pullSetups?.count)).toBe(0);
    await page.locator('#pull-setups-toggle').check();
    await expect.poll(() => page.evaluate(() => window.__routeViewerDebug?.pullSetups?.count)).toBeGreaterThan(1);
    await expect(page.locator('#route-inspector-metrics .route-score')).toBeVisible();
    const maxFillBeforeReload = await page.locator('#route-inspector-metrics span')
      .filter({ hasText: 'Max fill' })
      .locator('strong')
      .innerText();
    expect(Number.parseFloat(maxFillBeforeReload)).toBeGreaterThan(0);

    await page.locator('#raceway-compatibility-filter').selectOption('all');
    await expect.poll(() => page.evaluate(() => window.__routeViewerDebug?.racewayFilter?.visibleCount))
      .toBe(debug.racewayFilter.totalCount);
    await expect(page.locator('#raceway-filter-summary')).toContainText('All classes');
    await page.locator('#raceway-compatibility-filter').selectOption('group:LV');
    await expect.poll(() => page.evaluate(() => window.__routeViewerDebug?.racewayFilter?.mode)).toBe('group:LV');
    await expect(page.locator('#raceway-filter-summary')).toContainText('LV only');
    await page.locator('#raceway-compatibility-filter').selectOption('group:INSTRUMENT');
    await expect.poll(() => page.evaluate(() => window.__routeViewerDebug?.racewayFilter?.mode)).toBe('group:INSTRUMENT');
    await expect(page.locator('#raceway-filter-summary')).toContainText('INSTRUMENT only');
    await page.locator('#raceway-compatibility-filter').selectOption('group:COMMUNICATION');
    await expect.poll(() => page.evaluate(() => window.__routeViewerDebug?.racewayFilter?.mode)).toBe('group:COMMUNICATION');
    await expect(page.locator('#raceway-filter-summary')).toContainText('COMMUNICATION only');
    await page.locator('#raceway-compatibility-filter').selectOption('compatible');

    await page.locator('[data-route-view="plan"]').click();
    await expect.poll(() => page.evaluate(() => window.__routeViewerDebug?.currentView)).toBe('plan');
    await page.locator('#conduit-toggle').uncheck();
    await expect.poll(() => page.evaluate(() => window.__routeViewerDebug?.layerVisibility?.conduit)).toBe(false);
    await page.locator('#conduit-toggle').check();

    await page.locator('#route-viewer-route-list .route-viewer-route-button').nth(2).click();
    await expect(page.locator('#route-inspector-cable-class')).toContainText('INSTRUMENT');
    await expect(page.locator('#raceway-filter-summary')).toContainText('INSTRUMENT compatible');
    await expect(page.locator('#route-inspector-breakdown')).toContainText('220.00 ft');
    await expect(page.locator('#route-inspector-timeline')).toContainText('INST-ENTRY');
    await expect(page.locator('#route-inspector-timeline')).toContainText('INST-C');

    await page.locator('#route-viewer-route-list .route-viewer-route-button').nth(3).click();
    await expect(page.locator('#route-inspector-cable-class')).toContainText('COMMUNICATION');
    await expect(page.locator('#raceway-filter-summary')).toContainText('COMMUNICATION compatible');
    await expect(page.locator('#route-inspector-breakdown')).toContainText('165.00 ft');
    await expect(page.locator('#route-inspector-timeline')).toContainText('COMM-ENTRY');
    await expect(page.locator('#route-inspector-timeline')).toContainText('COMM-C');

    const boxes = await page.evaluate(() => {
      const box = selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      return {
        routeList: box('.route-review-sidebar'),
        stage: box('.route-plot-stage'),
        inspector: box('.route-viewer-inspector')
      };
    });
    expect(boxes.routeList.right).toBeLessThanOrEqual(boxes.stage.left + 1);
    expect(boxes.stage.right).toBeLessThanOrEqual(boxes.inspector.left + 1);
    expect(boxes.stage.width).toBeGreaterThan(500);
    expect(boxes.stage.height).toBeGreaterThan(450);

    await page.reload();
    await page.waitForFunction(() => window.__routeViewerDebug?.routeCount === 30);
    await expect(page.locator('#route-inspector-metrics span').filter({ hasText: 'Max fill' }).locator('strong'))
      .toHaveText(maxFillBeforeReload);
  });
});

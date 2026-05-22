import { test, expect } from '@playwright/test';
import {
  HEAT_TRACE_FIXTURES,
  assertHeatTraceResult,
  collectConsoleErrors,
  expectApprox,
  fillHeatTraceInputs,
  getSvgPathData,
  navigateHeatTrace,
  navigateWorkflowDashboard,
  readStoredHeatTraceResult,
  readStoredStudies,
  runHeatTraceAnalysis,
  saveWorkbookDownload,
} from './heatTrace.helpers.js';

test.describe('heat trace sizing acceptance', () => {
  test('acceptance HT-01 [heat trace] [AT-HT-01]: controls, navigation, and catalog breadth are available', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await navigateHeatTrace(page);

    await expect(page.locator('#nav-links a[href="heattracesizing.html"]')).toContainText('Heat Trace Sizing');
    await expect(page.locator('#pipe-material option')).toHaveCount(6);
    await expect(page.locator('#environment option')).toHaveCount(6);

    await expect(page.locator('#pipe-material')).toBeVisible();
    await expect(page.locator('#environment')).toBeVisible();
    await expect(page.locator('#unit-system')).toBeVisible();
    await expect(page.locator('#heat-trace-cable-type')).toBeVisible();
    await expect(page.locator('#voltage-v')).toBeVisible();
    await expect(page.locator('#line-length-ft')).toBeVisible();
    await expect(page.locator('#trace-run-count')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeVisible();

    await page.keyboard.press('Control+K');
    await expect(page.locator('.command-palette-overlay')).toBeVisible();
    await page.locator('.command-palette-input').fill('heat trace');
    await expect(page.locator('.command-palette-item')).toContainText('Go to Heat Trace Sizing');

    await navigateWorkflowDashboard(page);
    await expect(page.locator('#studies-summary .dash-study-name[href="heattracesizing.html"]')).toHaveText('Heat Trace Sizing');
    expect(consoleErrors).toEqual([]);
  });

  test('acceptance HT-02 [heat trace] [AT-HT-02]: deterministic sizing outputs update by material and environment', async ({ page }) => {
    await navigateHeatTrace(page);

    await fillHeatTraceInputs(page, HEAT_TRACE_FIXTURES.normal);
    await runHeatTraceAnalysis(page);
    const normalResult = await readStoredHeatTraceResult(page);
    assertHeatTraceResult(normalResult, HEAT_TRACE_FIXTURES.normal.expected);
    await expect(page.locator('#heattrace-circuit-detail')).toContainText('Selected trace output');
    await expect(page.locator('#heattrace-circuit-detail')).toContainText('8.0 W/ft');
    await expect(page.locator('#heattrace-circuit-detail')).toContainText('760 W');

    await fillHeatTraceInputs(page, HEAT_TRACE_FIXTURES.windyStainless);
    await runHeatTraceAnalysis(page);
    const windyResult = await readStoredHeatTraceResult(page);
    assertHeatTraceResult(windyResult, HEAT_TRACE_FIXTURES.windyStainless.expected);
    expect(windyResult.requiredWPerFt).toBeGreaterThan(normalResult.requiredWPerFt);

    await fillHeatTraceInputs(page, HEAT_TRACE_FIXTURES.normal);
    await runHeatTraceAnalysis(page);
    const repeatNormalResult = await readStoredHeatTraceResult(page);
    assertHeatTraceResult(repeatNormalResult, HEAT_TRACE_FIXTURES.normal.expected);
  });

  test('acceptance HT-03 [heat trace] [AT-HT-03]: saved results reload and mark dashboard study complete', async ({ page }) => {
    await navigateHeatTrace(page);
    await fillHeatTraceInputs(page, HEAT_TRACE_FIXTURES.normal);
    await runHeatTraceAnalysis(page);

    const storedBeforeReload = await readStoredHeatTraceResult(page);
    assertHeatTraceResult(storedBeforeReload, HEAT_TRACE_FIXTURES.normal.expected);

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#results')).toContainText('Required Heat Input');
    await expect(page.locator('#heattrace-circuit-detail')).toContainText('760 W');

    const storedAfterReload = await readStoredHeatTraceResult(page);
    assertHeatTraceResult(storedAfterReload, HEAT_TRACE_FIXTURES.normal.expected);

    await navigateWorkflowDashboard(page);
    const heatTraceStudy = page.locator('#studies-summary .dash-study-item', {
      has: page.locator('.dash-study-name[href="heattracesizing.html"]'),
    });
    await expect(heatTraceStudy).toContainText('Heat Trace Sizing');
    await expect(heatTraceStudy.locator('.dash-badge-text')).toHaveText('Run');
  });

  test('acceptance HT-04 [heat trace] [AT-HT-04]: dashboard details, charts, and warning severity render', async ({ page }) => {
    await navigateHeatTrace(page);
    await fillHeatTraceInputs(page, HEAT_TRACE_FIXTURES.normal);
    await runHeatTraceAnalysis(page);

    await expect(page.locator('#results .heattrace-kpi-label')).toHaveText([
      'Heat Loss',
      'Required Heat Input',
      'Installed Connected Load',
      'Circuit Check',
    ]);
    await expect(page.locator('#heattrace-thermal-detail')).toContainText('Insulation resistance');
    await expect(page.locator('#heattrace-thermal-detail')).toContainText('External film resistance');
    await expect(page.locator('#heattrace-thermal-detail')).toContainText('Total resistance');
    await expect(page.locator('#heattrace-thermal-detail')).toContainText('Environment multiplier');
    await expect(page.locator('#heattrace-thermal-detail')).toContainText('Material factor');
    await expect(page.locator('#heattrace-thermal-detail')).toContainText('Safety factor');
    await expect(page.locator('#heattrace-circuit-detail')).toContainText('Installed watt density');
    await expect(page.locator('#heattrace-circuit-detail')).toContainText('Utilization status');
    await expect(page.locator('#heattrace-circuit-detail')).toContainText('Length check');

    const temperaturePaths = await getSvgPathData(page, '#temperature-profile-chart');
    expect(temperaturePaths).toHaveLength(3);
    expect(temperaturePaths.every(path => path.trim().length > 0)).toBeTruthy();
    await expect(page.locator('#temperature-profile-legend li')).toHaveCount(3);

    const heatLossPaths = await getSvgPathData(page, '#heatloss-breakdown-chart');
    expect(heatLossPaths.length).toBeGreaterThanOrEqual(3);
    expect(heatLossPaths.every(path => path.trim().length > 0)).toBeTruthy();
    await expect(page.locator('#heatloss-breakdown-legend')).toContainText('Conduction');
    await expect(page.locator('#heatloss-breakdown-legend')).toContainText(/Convection|Soil Conduction/);
    await expect(page.locator('#heatloss-breakdown-legend')).toContainText('Radiation / Margin');

    await fillHeatTraceInputs(page, HEAT_TRACE_FIXTURES.warning);
    await runHeatTraceAnalysis(page);
    const warningResult = await readStoredHeatTraceResult(page);
    assertHeatTraceResult(warningResult, HEAT_TRACE_FIXTURES.warning.expected);

    await expect(page.locator('#results .heattrace-status-banner')).toHaveClass(/heattrace-status-banner--error/);
    await expect(page.locator('#results')).toContainText('Review');
    await expect(page.locator('#heattrace-side-warnings-list')).toContainText('Very low ambient temperature');
    await expect(page.locator('#heattrace-side-warnings-list')).toContainText('Long circuit length');
    await expect(page.locator('#heattrace-side-warnings-list')).toContainText('High wind speed');
  });

  test('acceptance HT-05 [heat trace] [AT-HT-05]: sensitivity quick apply and unit conversion stay consistent', async ({ page }) => {
    await navigateHeatTrace(page);
    await fillHeatTraceInputs(page, HEAT_TRACE_FIXTURES.normal);
    await runHeatTraceAnalysis(page);

    await expect(page.locator('#sensitivity-controls .heattrace-sensitivity-row')).toHaveCount(5);
    await expect(page.locator('#sensitivity-summary .heattrace-sensitivity-result')).toHaveCount(5);
    await expect(page.locator('#sensitivity-insights-list [data-sensitivity-apply]')).toHaveCount(3);
    await expect(page.locator('#sensitivity-insights-list .heattrace-insight-item').first()).toContainText('Insulation thickness');

    await page.locator('#sensitivity-insights-list [data-sensitivity-apply]').first().click();
    await expect(page.locator('#insulation-thickness-in')).toHaveValue('1.25');
    await expect(page.locator('#heattrace-circuit-detail')).toContainText('672 W');

    await page.locator('#sensitivity-set-baseline').click();
    await expect(page.locator('#sensitivity-summary')).toContainText('0.00 W/ft');

    await fillHeatTraceInputs(page, HEAT_TRACE_FIXTURES.normal);
    await runHeatTraceAnalysis(page);
    await page.locator('#unit-system').selectOption('metric');
    await runHeatTraceAnalysis(page);
    const metricResult = await readStoredHeatTraceResult(page);

    expectApprox(metricResult.requiredWPerFt, HEAT_TRACE_FIXTURES.normal.expected.requiredWPerFt, 0.1);
    expectApprox(metricResult.requiredWPerM, HEAT_TRACE_FIXTURES.normal.expected.requiredWPerM, 0.3);
    expect(metricResult.recommendedCableRatingWPerFt).toBe(HEAT_TRACE_FIXTURES.normal.expected.recommendedCableRatingWPerFt);
    await expect(page.locator('#insulation-thickness-label')).toContainText('mm');
    await expect(page.locator('#line-length-label')).toContainText('m');
    await expect(page.locator('#heattrace-circuit-detail')).toContainText('26.2 W/m');
    await expect(page.locator('#temperature-profile-chart')).toContainText('Pipe length (m)');
  });

  test('acceptance HT-06 [heat trace] [AT-HT-06]: branch cases, report, and export package persist expected sheets', async ({ page }) => {
    test.setTimeout(60_000);
    await navigateHeatTrace(page);
    await fillHeatTraceInputs(page, HEAT_TRACE_FIXTURES.normal);
    await runHeatTraceAnalysis(page);

    await page.locator('#circuit-case-name').fill('HT-A101');
    await page.locator('#add-circuit-case').click();
    await expect(page.locator('#circuit-case-list')).toContainText('1 heat-trace branch');
    await expect(page.locator('#circuit-case-list')).toContainText('HT-A101');

    let studies = await readStoredStudies(page);
    expect(studies.heatTraceSizingCircuits).toHaveLength(1);

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#circuit-case-list')).toContainText('1 heat-trace branch');
    await expect(page.locator('#circuit-case-list')).toContainText('HT-A101');

    await page.locator('#heattrace-tab-report').click();
    await page.locator('#heattrace-generate-report').click();
    await expect(page.locator('#heattrace-report-preview')).toBeVisible();
    await expect(page.locator('#heattrace-report-preview')).toContainText(/screening/i);
    await expect(page.locator('#heattrace-report-preview')).toContainText(/manufacturer/i);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#heattrace-export-package').click();
    const workbook = await saveWorkbookDownload(await downloadPromise, /^heat-trace-package-\d{4}-\d{2}-\d{2}\.xlsx$/);

    expect(workbook.sheetNames).toEqual(expect.arrayContaining([
      'Line List',
      'BOM',
      'Controller Schedule',
      'Assumptions',
    ]));
    expect(workbook.rowsBySheet['Line List'].flat()).toContain('HT-A101');
    expect(workbook.rowsBySheet.Assumptions.flat().join(' ')).toMatch(/manufacturer/i);
  });
});

import { test, expect } from '@playwright/test';

test.describe('advanced study desktop workflows', () => {
  test('incomplete project imports fail safely without runtime errors', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    const cases = [
      ['voltagestability.html', '#import-oneline-btn', /needs at least two buses/i],
      ['optimalpowerflow.html', '#import-project-fleet-btn', /no generator components/i],
      ['frequencyscan.html', '#import-frequency-project-btn', /short-circuit MVA/i],
      ['transientstability.html', '#import-transient-project-btn', /no synchronous generator/i],
    ];

    for (const [href, button, message] of cases) {
      await page.goto(href);
      await page.locator(button).click();
      await expect(page.locator('.modal, [role="dialog"]').filter({ visible: true }).first()).toBeVisible();
      await expect(page.locator('body')).toContainText(message);
      await page.keyboard.press('Escape');
    }

    expect(pageErrors).toEqual([]);
  });

  test('transient import allows manual transfer-limit completion before saving', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('transientstability.html?e2e=1&e2e_reset=1');
    await page.waitForFunction(() => Boolean(window.dataStore));
    await page.evaluate(() => {
      window.dataStore.setProjectMeta({ id: 'transient-import-e2e', name: 'Transient import E2E' });
      window.dataStore.setOneLine({
        activeSheet: 0,
        sheets: [{
          name: 'Main',
          components: [{
            id: 'GEN-1',
            type: 'generator',
            subtype: 'synchronous',
            max_mw: 10,
            operating_mw: 5,
            inertia: 4,
          }],
          connections: [],
        }],
      });
    });

    await page.locator('#import-transient-project-btn').click();
    await page.fill('#pmax-fault', '0.60');
    await page.fill('#pmax-post', '1.75');
    await page.fill('#t-clear', '0.200');
    await page.locator('#calc-btn').click();
    await expect(page.locator('#results')).toContainText('Simulation Results');
    const saved = await page.evaluate(() => ({
      result: window.dataStore.getStudies().transientStability,
      provenance: window.dataStore.getStudyProvenance().transientStability,
    }));
    expect(saved.result?.runMetadata?.source).toBe('project-one-line');
    expect(saved.provenance?.studyKey).toBe('transientStability');
    expect(saved.provenance?.inputsSnapshot?.Pmax_fault).toBe(0.6);
    expect(pageErrors).toEqual([]);
  });

  test('load-flow variants reject an incomplete One-Line without false results', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    for (const [href, form, expected] of [
      ['quasidynamic.html', '#qd-form', /at least two buses/i],
      ['probabilisticloadflow.html', '#mc-form', /at least two buses/i],
    ]) {
      await page.goto(href);
      await page.locator(form).evaluate(element => {
        element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await expect(page.locator('#calc-errors')).toContainText(expected);
      await expect(page.locator('#export-csv-btn')).toBeDisabled();
    }

    expect(pageErrors).toEqual([]);
  });

  test('Trust Center executes the expanded live suite', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('trustcenter.html');
    await page.locator('#run-benchmarks-btn').click();
    const executableCount = await page.evaluate(async () => {
      const module = await import('./analysis/benchmarkLibrary.mjs');
      return module.BENCHMARKS.length;
    });
    const rows = page.locator('#results-tbody tr');
    await expect(rows).toHaveCount(executableCount);
    const liveCount = await rows.count();
    expect(liveCount).toBe(executableCount);
    expect(executableCount).toBe(30);
    await expect(page.locator('#summary-card')).toContainText(`${liveCount} / ${liveCount}`);
    await page.locator('tr[data-benchmark-id="IEC60909-001"] button').click();
    await expect(page.locator('#detail-panel')).toContainText('Evidence source');
    await expect(page.locator('#detail-panel')).toContainText('Executable inputs');
    await expect(page.locator('#detail-panel')).toContainText('Tolerance basis');
    await expect(page.locator('#detail-panel')).toContainText('Known limitations');
    await expect(page.locator('#detail-panel')).toContainText('iec60909-short-circuit');
    for (const id of ['CABLE-THERMAL-001', 'CABLE-THERMAL-002']) {
      const row = page.locator(`tr[data-benchmark-id="${id}"]`);
      await expect(row).toContainText('Pass');
      await row.locator('button').click();
      await expect(page.locator('#detail-panel')).toContainText('Evidence source');
      await expect(page.locator('#detail-panel')).toContainText('Executable inputs');
      await expect(page.locator('#detail-panel')).toContainText('cable.acResistanceOhmPerKm');
      await expect(page.locator('#detail-panel')).toContainText('installation.formation');
    }

    expect(pageErrors).toEqual([]);
  });
});

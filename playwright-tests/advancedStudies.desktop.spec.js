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
    await expect(page.locator('#summary-card')).toContainText('15 / 15');
    await expect(page.locator('#results-tbody tr')).toHaveCount(15);
    await page.locator('tr[data-benchmark-id="IEC60909-001"] button').click();
    await expect(page.locator('#detail-panel')).toContainText('Official source');
    await expect(page.locator('#detail-panel')).toContainText('iec60909-short-circuit');

    expect(pageErrors).toEqual([]);
  });
});

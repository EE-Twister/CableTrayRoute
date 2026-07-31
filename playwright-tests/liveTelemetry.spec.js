import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = file => 'file://' + path.join(__dirname, '..', file);

test('One-Line stores read-only live telemetry configuration', async ({ page }) => {
  await page.addInitScript(() => {
    class TelemetryWebSocket {
      constructor() {
        queueMicrotask(() => {
          this.onopen?.();
          this.onmessage?.({ data: JSON.stringify({ readings: [{ tag: 'sub.bus.1', values: { kw: 2450, kv: 13.8, status: 'closed' } }] }) });
        });
      }
      close() {}
    }
    Object.defineProperty(window, 'WebSocket', { configurable: true, value: TelemetryWebSocket });
  });
  await page.goto(pageUrl('oneline.html?e2e=1&e2e_reset=1'));
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  const emptyLiveDialog = page.getByRole('dialog', { name: 'Live Telemetry' });
  await emptyLiveDialog.getByRole('button', { name: 'View 24-hour trend' }).click();
  const trendDialog = page.getByRole('dialog', { name: '24-hour Live Trend' });
  await expect(trendDialog.getByText('No numeric readings have been received for this metric in the last 24 hours.')).toBeVisible();
  await trendDialog.getByRole('button', { name: 'Close', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Live Telemetry' });
  await dialog.locator('[name="transport"]').selectOption('websocket');
  await dialog.locator('[name="endpoint"]').fill('wss://gateway.example.test/tags');
  await dialog.locator('[name="interval"]').fill('10');
  await dialog.locator('[name="staleAfter"]').fill('45');
  await dialog.locator('[name="mappings"]').fill('BUS-1=sub.bus.1');
  await dialog.locator('[name="alarms"]').fill('BUS-1.kw=..2000');
  await dialog.locator('[name="reconnect"]').uncheck();
  await dialog.locator('[name="operator"]').check();
  await dialog.getByRole('button', { name: 'Start live mode' }).click();
  await expect(page.locator('#connect-btn')).toBeDisabled();
  const config = await page.evaluate(() => JSON.parse(localStorage.getItem('base:liveTelemetryConfig') || '{}'));
  expect(config.transport).toBe('websocket');
  expect(config.reconnect).toBe(false);
  expect(config.endpoint).toBe('wss://gateway.example.test/tags');
  expect(config.staleAfterSeconds).toBe(45);
  expect(config.alarms).toEqual([{ componentId: 'BUS-1', metric: 'kw', low: null, high: 2000 }]);
  expect(config.mappings[0]).toEqual({ componentId: 'BUS-1', tag: 'sub.bus.1' });
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  const runningDialog = page.getByRole('dialog', { name: 'Live Telemetry' });
  await expect(runningDialog.getByRole('button', { name: 'View active alarms (1)' })).toBeVisible();
  await runningDialog.getByRole('button', { name: 'View active alarms (1)' }).click();
  await expect(page.getByRole('dialog', { name: 'Active Live Alarms' }).getByText('BUS-1 kw is above 2000 (2450).')).toBeVisible();
  await page.getByRole('dialog', { name: 'Active Live Alarms' }).getByRole('button', { name: 'Close', exact: true }).click();
  await runningDialog.getByRole('button', { name: 'View 24-hour trend' }).click();
  const populatedTrendDialog = page.getByRole('dialog', { name: '24-hour Live Trend' });
  await expect(populatedTrendDialog.getByRole('img', { name: /24-hour kw trend for BUS-1/ })).toBeVisible();
  await expect(populatedTrendDialog.locator('.live-trend-summary dd').first()).toHaveText('2,450');
  const exportButton = populatedTrendDialog.getByRole('button', { name: 'Export 24-hour CSV' });
  await expect(exportButton).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  expect((await downloadPromise).suggestedFilename()).toBe('BUS-1-kw-24h-live-trend.csv');
});

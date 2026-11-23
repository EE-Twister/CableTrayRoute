import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './staticServer.helper.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

async function holdProjectReadiness(page) {
  await page.addInitScript(() => {
    let held = true;
    let ready = false;
    Object.defineProperty(window, '__ctrProjectReady', {
      configurable: true,
      get: () => ready,
      set: value => { if (held && value === true) window.__testReadyPending = true; else ready = value; },
    });
    window.addEventListener('ctr:project-ready', event => { if (held) event.stopImmediatePropagation(); }, true);
    window.__releaseProjectReady = () => {
      held = false;
      ready = true;
      window.dispatchEvent(new Event('ctr:project-ready'));
    };
  });
  await page.goto(server.url('designsynthesis.html?e2e=1'));
  await page.waitForFunction(() => window.__testReadyPending === true);
}

test('Generate waits for project initialization and the initial draft', async ({ page }) => {
  test.setTimeout(90000);
  await holdProjectReadiness(page);
  const generate = page.locator('#synthesis-generate');
  await expect(generate).toBeDisabled();
  await expect(page.locator('#synthesis-workspace-inputs')).toHaveAttribute('inert', '');
  await expect(page.locator('#synthesis-initializing')).toBeVisible();
  const click = generate.click();
  await page.evaluate(() => window.__releaseProjectReady());
  await click;
  await expect(page.locator('#synthesis-status')).toContainText('Proposal generated', { timeout: 60000 });
  await expect(page.locator('#synthesis-download-json')).toBeEnabled();
});

test('sample actions wait until the initial project and draft are ready', async ({ page }) => {
  test.setTimeout(90000);
  await holdProjectReadiness(page);
  const click = page.locator('#synthesis-load-mixed-sample').click();
  await page.evaluate(() => window.__releaseProjectReady());
  await click;
  await expect(page.locator('#synthesis-status')).toContainText('480 V direct-load and 208 V transformer-fed sample loaded', { timeout: 30000 });
  const equipment = JSON.parse(await page.locator('#synthesis-equipment').inputValue());
  expect(equipment.some(item => item.voltage === 480)).toBeTruthy();
  expect(equipment.some(item => item.voltage === 208)).toBeTruthy();
  await expect(page.locator('#synthesis-workspace-inputs')).not.toHaveAttribute('inert');
});

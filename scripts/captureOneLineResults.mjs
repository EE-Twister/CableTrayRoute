import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'artifacts');
const baseUrl = 'http://127.0.0.1:3000';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function serverIsReady() {
  try {
    const response = await fetch(`${baseUrl}/oneline.html`);
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverIsReady()) return null;
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true
  });
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await serverIsReady()) return server;
    await delay(100);
  }
  server.kill();
  throw new Error('Local application server did not become ready.');
}

async function capture() {
  const server = await ensureServer();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    await fs.mkdir(outputDir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.goto(`${baseUrl}/oneline.html?e2e=1&e2e_reset=1`, { waitUntil: 'load' });
    await page.keyboard.press('Escape');
    await page.getByTestId('palette-button').first().waitFor({ state: 'visible' });
    await page.locator('#sample-diagram-btn').evaluate(element => element.click());
    await page.locator('#zoom-fit-btn').evaluate(element => element.click());
    await page.locator('[data-palette-filter="protection"]').evaluate(element => element.click());
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(outputDir, 'oneline-ansi.png') });

    await page.locator('#symbol-standard-select').evaluate(element => {
      element.value = 'IEC';
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#data-state-overlay-select').evaluate(element => {
      element.value = 'none';
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(outputDir, 'oneline-iec.png') });
    await page.screenshot({
      path: path.join(outputDir, 'oneline-iec-connections.png'),
      clip: { x: 360, y: 450, width: 850, height: 450 }
    });

    await page.locator('#data-state-overlay-select').evaluate(element => {
      element.value = 'operating';
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#toggle-energized').evaluate(element => {
      element.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(outputDir, 'oneline-operating-overlay.png') });
  } finally {
    await browser.close();
    server?.kill();
  }
}

capture().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

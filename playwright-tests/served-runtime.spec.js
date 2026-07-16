import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from '../server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let dataDir;
let server;
let origin;

test.beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-served-runtime-'));
  const app = await createApp({ dataDir, staticRoot: root, enforceHttps: false });
  server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (dataDir) await fs.rm(dataDir, { recursive: true, force: true });
});

test('Optimal Route dependencies load under the production CSP', async ({ page }) => {
  const requestedScripts = [];
  page.on('request', request => {
    if (request.resourceType() === 'script') requestedScripts.push(request.url());
  });
  const response = await page.goto(`${origin}/optimalRoute.html`, { waitUntil: 'networkidle' });

  const csp = response.headers()['content-security-policy'];
  expect(csp).toContain("script-src 'self'");
  await expect.poll(() => page.evaluate(() => typeof window.Plotly)).toBe('object');
  await expect.poll(() => page.evaluate(() => typeof window.Papa)).toBe('object');
  await expect.poll(() => page.evaluate(() => typeof window.XLSX)).toBe('object');
  expect(requestedScripts.some(url => url.endsWith('/dist/vendor/plotly.min.js'))).toBe(true);
  expect(requestedScripts.some(url => url.endsWith('/dist/vendor/papaparse.min.js'))).toBe(true);
  expect(requestedScripts.filter(url => new URL(url).origin !== origin)).toEqual([]);
});

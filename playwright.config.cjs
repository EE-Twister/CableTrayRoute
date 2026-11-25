const { defineConfig } = require('@playwright/test');
const os = require('os');
const path = require('path');

// Sync clients (OneDrive, Dropbox, iCloud, Google Drive) lock files Playwright
// is still writing, so downloads in test-results/ fail with EPERM. Inside a
// synced folder, write test output to the OS temp folder instead.
// PLAYWRIGHT_OUTPUT_DIR overrides the location anywhere.
const inSyncedFolder = /[\\/](OneDrive[^\\/]*|Dropbox|iCloud ?Drive|Google ?Drive)[\\/]/i.test(__dirname);
const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR
  || (inSyncedFolder ? path.join(os.tmpdir(), 'cabletrayroute-playwright') : undefined);

module.exports = defineConfig({
  testDir: path.join(__dirname, 'playwright-tests'),
  ...(outputDir ? { outputDir } : {}),
  // Visual baselines are rendered on Windows and run by playwright.visual.config.cjs.
  testIgnore: 'visual-regression.spec.js',
  use: {
    baseURL: 'file://' + __dirname + '/',
    headless: true,
  },
  // Visual snapshots run in the dedicated visual config so the functional
  // Firefox/Edge lane cannot silently use a different snapshot root.
  testIgnore: '**/visual-regression.spec.js',
  timeout: 30000,
  projects: [
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        // CI runners have no GPU; allow software WebGL so the 3D route viewer can start.
        launchOptions: {
          firefoxUserPrefs: {
            'webgl.disabled': false,
            'webgl.force-enabled': true,
            'webgl.enable-webgl2': true,
          },
        },
      },
    },
    {
      name: 'msedge',
      use: {
        browserName: 'chromium',
        channel: 'msedge',
        launchOptions: { args: ['--allow-file-access-from-files'] }
      }
    },
  ],
});

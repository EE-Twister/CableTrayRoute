const { defineConfig } = require('@playwright/test');
const path = require('path');
module.exports = defineConfig({
  testDir: path.join(__dirname, 'playwright-tests'),
  // Visual baselines are rendered on Windows and run by playwright.visual.config.cjs.
  testIgnore: 'visual-regression.spec.js',
  use: {
    baseURL: 'file://' + __dirname + '/',
    headless: true,
  },
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

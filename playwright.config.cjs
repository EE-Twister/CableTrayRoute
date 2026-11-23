const { defineConfig } = require('@playwright/test');
const path = require('path');
module.exports = defineConfig({
  testDir: path.join(__dirname, 'playwright-tests'),
  use: {
    baseURL: 'file://' + __dirname + '/',
    headless: true,
  },
  // Visual snapshots run in the dedicated visual config so the functional
  // Firefox/Edge lane cannot silently use a different snapshot root.
  testIgnore: '**/visual-regression.spec.js',
  timeout: 30000,
  projects: [
    { name: 'firefox', use: { browserName: 'firefox' } },
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

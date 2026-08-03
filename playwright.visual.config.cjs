const { defineConfig } = require('@playwright/test');
const path = require('path');

const visualBrowserChannel = process.platform === 'win32' ? { channel: 'msedge' } : {};

module.exports = defineConfig({
  testDir: path.join(__dirname, 'playwright-tests'),
  testMatch: 'visual-regression.spec.js',
  outputDir: path.join(__dirname, 'output', 'playwright', 'visual-results'),
  reporter: [['list']],
  timeout: 45000,
  expect: {
    timeout: 15000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
      scale: 'css'
    }
  },
  snapshotPathTemplate: '{testDir}/visual-baselines/{arg}{ext}',
  use: {
    baseURL: `file://${__dirname}/`,
    browserName: 'chromium',
    ...visualBrowserChannel,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ['--allow-file-access-from-files'] }
  }
});

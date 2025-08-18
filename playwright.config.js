const { defineConfig } = require('@playwright/test');
const path = require('path');
module.exports = defineConfig({
  testDir: path.join(__dirname, 'playwright-tests'),
  use: {
    baseURL: 'file://' + __dirname + '/',
    headless: true,
  },
  timeout: 30000,
});

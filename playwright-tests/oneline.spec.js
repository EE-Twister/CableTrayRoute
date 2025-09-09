const { test, expect } = require('@playwright/test');
const path = require('path');
const root = path.join(__dirname, '..');

function pageUrl(file) {
  return 'file://' + path.join(root, file);
}

test('drag first library item onto canvas', async ({ page }) => {
  await page.goto(pageUrl('oneline.html'));
  const firstBtn = page.locator('#component-buttons button').first();
  await firstBtn.waitFor({ state: 'visible' });
  const before = await page.locator('g.component').count();
  await firstBtn.dragTo(page.locator('#diagram'));
  await expect(page.locator('g.component')).toHaveCount(before + 1);
});

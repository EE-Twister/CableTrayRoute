const { test, expect } = require('@playwright/test');
const path = require('path');
const root = path.join(__dirname, '..');
const pageUrl = file => 'file://' + path.join(root, file);

test.describe('shared modal component', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl('index.html?e2e=1&e2e_reset=1'));
    await page.waitForSelector('#copy-share-link-btn');
    await page.evaluate(() => {
      window.__reloaded = false;
      const reload = window.location.reload;
      window.location.reload = () => { window.__reloaded = true; };
      try {
        Object.defineProperty(window.navigator, 'clipboard', {
          configurable: true,
          get: () => ({ writeText: () => Promise.resolve() })
        });
      } catch (err) {
        window.navigator.clipboard = { writeText: () => Promise.resolve() };
      }
    });
  });

  test('share modal announces labels and restores focus', async ({ page }) => {
    await page.click('#settings-btn');
    const shareButton = page.locator('#copy-share-link-btn');
    await shareButton.click();

    const modal = page.locator('.component-modal[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('aria-modal', 'true');

    const titleId = await modal.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    await expect(page.locator(`#${titleId}`)).toHaveText('Share Project');

    const describedBy = await modal.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const descriptionText = await page.locator(`#${describedBy.split(' ')[0]}`).innerText();
    expect(descriptionText).toContain('Share link');

    const linkInput = modal.locator('input[readonly]');
    await expect(linkInput).toBeFocused();

    await modal.locator('.primary-btn').click();
    await expect(modal).toHaveCount(0);
    await expect(shareButton).toBeFocused();
  });

  test('new project modal validates duplicate names', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('Existing:equipment', JSON.stringify([]));
    });
    await page.click('#settings-btn');
    const newButton = page.locator('#new-project-btn');
    await newButton.click();

    const modal = page.locator('.component-modal[role="dialog"]');
    await expect(modal).toBeVisible();
    const nameInput = modal.locator('input[name="projectName"]');
    const primary = modal.locator('.primary-btn');
    await expect(primary).toBeDisabled();

    await nameInput.fill('Existing');
    await primary.click();
    const error = modal.locator('.modal-error');
    await expect(error).toContainText('already exists');
    await expect(nameInput).toHaveAttribute('aria-invalid', 'true');

    await nameInput.fill('Fresh Project');
    await primary.click();
    await expect(modal).toHaveCount(0);
    await expect(newButton).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.__reloaded)).toBe(true);
  });
});

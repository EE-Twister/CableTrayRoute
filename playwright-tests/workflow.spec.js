const { test, expect } = require("@playwright/test");
const path = require("path");
const root = path.join(__dirname, "..");

function pageUrl(file) {
  return "file://" + path.join(root, file);
}

test.describe("CableTrayRoute workflow", () => {
  test("create DB-01 with three conduits appears in Optimal Route", async ({
    page,
  }) => {
    await page.goto(pageUrl("ductbankroute.html"));
    await page.fill("#ductbankTag", "DB-01");
    for (let i = 0; i < 3; i++) {
      await page.click("#addConduit");
    }
    await expect(page.locator("#conduitTable tbody tr")).toHaveCount(3);
    await page.goto(pageUrl("optimalRoute.html"));
    await expect(page.locator("#conduit-count")).toContainText("3");
  });

  test("import sample CSV/XLSX and route cables", async ({ page }) => {
    await page.goto(pageUrl("optimalRoute.html"));
    const trayFile = path.join(root, "examples", "tray_schedule.csv");
    const cableFile = path.join(root, "examples", "cable_schedule.csv");
    await page.setInputFiles("#import-trays-file", trayFile);
    await page.click("#import-trays-btn");
    await page.setInputFiles("#import-cables-file", cableFile);
    await page.click("#import-cables-btn");
    await page.click("#calculate-route-btn");
    await expect(page.locator("#results-section")).toBeVisible();
  });

  test("lock a cable and reroute", async ({ page }) => {
    await page.goto(pageUrl("optimalRoute.html"));
    await page.click("#load-sample-trays-btn");
    await page.click("#load-sample-cables-btn");
    await page.click("#calculate-route-btn");
    const firstRow = page.locator("#cable-list-container tbody tr").first();
    const lockCheckbox = firstRow.locator(
      'input[type="checkbox"][name="lock"]',
    );
    await lockCheckbox.check();
    await page.click("#calculate-route-btn");
    await expect(page.locator("#results-section")).toBeVisible();
  });

  test("dirty-state prompts appear when navigating away", async ({
    page,
    context,
  }) => {
    await page.goto(pageUrl("ductbankroute.html"));
    await page.fill("#ductbankTag", "TEMP");
    const [dialog] = await Promise.all([
      context.waitForEvent("dialog"),
      page.goto(pageUrl("index.html")),
    ]);
    expect(dialog.message()).toMatch(/unsaved|leave/i);
    await dialog.dismiss();
  });
});

const { test, expect } = require("@playwright/test");
const path = require("path");
const root = path.join(__dirname, "..");

function pageUrl(file) {
  return "file://" + path.join(root, file);
}

async function handleResume(page, yes = false) {
  const selector = yes ? "#resume-yes-btn" : "#resume-no-btn";
  const btn = page.locator(selector);
  if (await btn.isVisible()) {
    await btn.click();
  }
}

test.describe("CableTrayRoute workflow", () => {
  test("create DB-01 with three conduits appears in Optimal Route", async ({
    page,
  }) => {
    await page.goto(pageUrl("ductbankroute.html?e2e=1"));
    await page.fill("#ductbankTag", "DB-01");
    for (let i = 0; i < 3; i++) {
      await page.click("#addConduit");
    }
    await expect(page.locator("#conduitTable tbody tr")).toHaveCount(3);
    const dbData = await page.evaluate(() => {
      const tag = document.getElementById('ductbankTag').value;
      const db = {
        tag,
        start_x: 0, start_y: 0, start_z: 0,
        end_x: 0, end_y: 0, end_z: 0,
      };
      const conduits = Array.from(document.querySelectorAll('#conduitTable tbody tr')).map((tr, i) => ({
        ductbankTag: tag,
        conduit_id: i + 1,
        type: '',
        trade_size: '',
        start_x: 0, start_y: 0, start_z: 0,
        end_x: 0, end_y: 0, end_z: 0,
      }));
      return { db, conduits };
    });
    await page.addInitScript(({ db, conduits }) => {
      localStorage.setItem('base:ductbankSchedule', JSON.stringify([db]));
      localStorage.setItem('base:conduitSchedule', JSON.stringify(conduits));
      localStorage.setItem('base:traySchedule', '[]');
      localStorage.setItem('base:cableSchedule', '[]');
    }, dbData);
    await page.goto(pageUrl('optimalRoute.html?e2e=1'));
    const routeUpdated = page.evaluate(
      () => new Promise(r => document.addEventListener('route-updated', r, { once: true })),
    );
    await handleResume(page, true);
    await routeUpdated;
    await expect(page.locator("#conduit-count")).toContainText("3");
  });

  test("import sample CSV/XLSX and route cables", async ({ page }) => {
    await page.goto(pageUrl("optimalRoute.html?e2e=1"));
    await handleResume(page, false);
    const trayFile = path.join(root, "examples", "tray_schedule.csv");
    const cableFile = path.join(root, "examples", "cable_schedule.csv");
    await page.setInputFiles("#import-trays-file", trayFile);
    await page.waitForSelector("#manual-tray-table-container tbody tr", { state: 'attached' });
    await page.setInputFiles("#import-cables-file", cableFile);
    await page.waitForSelector("#cable-list-container tbody tr", { state: 'attached' });
    await page.click("#calculate-route-btn");
    await expect(page.locator("#results-section")).toBeVisible();
  });

  test("lock a cable and reroute", async ({ page }) => {
    const traySample = path.join(root, "examples", "trayNetwork.json");
    const trayJson = require("fs").readFileSync(traySample, "utf-8");
    const cableSample = path.join(root, "examples", "cableList.json");
    const cableJson = require("fs").readFileSync(cableSample, "utf-8");
    await page.addInitScript(({ trayJson, cableJson }) => {
      const originalFetch = window.fetch;
      window.fetch = (input, init) => {
        if (typeof input === "string") {
          if (input.endsWith("examples/trayNetwork.json")) {
            return Promise.resolve(
              new Response(trayJson, {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          if (input.endsWith("examples/cableList.json")) {
            return Promise.resolve(
              new Response(cableJson, {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
        }
        return originalFetch(input, init);
      };
    }, { trayJson, cableJson });
    await page.goto(pageUrl("optimalRoute.html?e2e=1"));
    await handleResume(page, false);
    await page.click("#load-sample-trays-btn");
    await page.waitForSelector("#manual-tray-table-container tbody tr", { state: 'attached' });
    await page.click("#load-sample-cables-btn");
    await page.waitForSelector("#cable-list-container tbody tr", { state: 'attached' });
    await page.click("#calculate-route-btn");
    await expect(page.locator("#results-section")).toBeVisible();
    const firstRow = page.locator("#cable-list-container tbody tr").first();
    const lockCheckbox = firstRow.locator(
      'input[type="checkbox"][name="lock"]',
    );
    await lockCheckbox.check();
    await page.click("#calculate-route-btn");
    await expect(page.locator("#results-section")).toBeVisible();
  });

  test("dirty-state prompts appear when navigating away", async ({ page }) => {
    await page.goto(pageUrl("ductbankroute.html?e2e=1"));
    await page.fill("#ductbankTag", "TEMP");
    const prevented = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);
  });
});

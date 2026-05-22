import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

async function addConduitViaModal(page) {
  await page.click("#addConduit");
  const modal = page.locator(".component-modal").last();
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Add Conduit" }).click();
  await expect(modal).toBeHidden();
}

test.describe("CableTrayRoute workflow", () => {
  test("create DB-01 with three conduits appears in Optimal Route", async ({
    page,
  }) => {
    await page.goto(pageUrl("ductbankroute.html?e2e=1"));
    await page.fill("#ductbankTag", "DB-01");
    for (let i = 0; i < 3; i++) {
      await addConduitViaModal(page);
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
    await page.evaluate(({ db, conduits }) => {
      localStorage.setItem('CTR_CONDUITS', JSON.stringify({ ductbanks: [db], conduits }));
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
    const traysReady = page.evaluate(
      () => new Promise(r => document.addEventListener('imports-ready-trays', r, { once: true })),
    );
    await page.setInputFiles("#import-trays-file", trayFile);
    await traysReady;
    const cablesReady = page.evaluate(
      () => new Promise(r => document.addEventListener('imports-ready-cables', r, { once: true })),
    );
    await page.setInputFiles("#import-cables-file", cableFile);
    await cablesReady;
    await page.click("#calculate-route-btn");
    await expect(page.locator("#results-section")).toBeVisible();
  });

  test("lock a cable and reroute", async ({ page }) => {
    test.setTimeout(60_000);
    const traySample = path.join(root, "examples", "trayNetwork.json");
    const trayJson = fs.readFileSync(traySample, "utf-8");
    const cableSample = path.join(root, "examples", "cableList.json");
    const cableJson = fs.readFileSync(cableSample, "utf-8");
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
    await expect(page.locator('#route-breakdown-container .route-list-row').first()).toBeAttached({ timeout: 30_000 });
    const lockButton = page.locator('.lock-route-btn').first();
    await expect(lockButton).toBeAttached();
    await page.locator("#route-breakdown-details").evaluate(details => {
      details.open = true;
      details.setAttribute('open', '');
    });
    await expect(lockButton).toBeVisible();
    await lockButton.click();
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

  test("design basis gates drive Auto-Build and block report export", async ({ page }) => {
    const designBasis = {
      schemaVersion: 1,
      codeBasis: {
        primaryCode: "NEC",
        edition: "2023",
        jurisdiction: "E2E Test",
        ahj: "Test AHJ",
        unitSystem: "imperial",
      },
      sizingDefaults: {
        conductorMaterial: "aluminum",
        insulationType: "XHHW-2",
        temperatureRatingC: 75,
        installationType: "conduit",
        defaultPowerFactor: 0.86,
        voltageDropLimitPct: 4,
        continuousLoadPolicy: "assume-continuous",
      },
      routingDefaults: {
        defaultLengthFt: 120,
        defaultTrayId: "TR-E2E-001",
        defaultTrayWidthIn: 18,
        defaultTrayDepthIn: 6,
        defaultTrayElevationFt: 12,
        fillLimitPct: 35,
        fieldRoutePolicy: "allow-field-legs",
      },
      studyPrerequisites: {
        requireUtilityFault: false,
        requireProtectiveDeviceSettings: true,
        requireEquipmentCoordinates: true,
        requireArcFlashInputs: false,
      },
      approvalRules: {
        generatedRecordsRequireReview: true,
        routeResultsRequireReview: true,
        studiesRequireReview: false,
        releaseRequiresReviewer: true,
        reviewer: "E2E Reviewer",
      },
      updatedAt: "2026-05-20T00:00:00.000Z",
    };

    await page.addInitScript(({ designBasis }) => {
      localStorage.clear();
      localStorage.setItem("ctr_current_scenario_v1", "base");
      localStorage.setItem("ctr_scenarios_v1", JSON.stringify(["base"]));
      localStorage.setItem("base:designBasis", JSON.stringify(designBasis));
      localStorage.setItem("base:designGateApprovals", JSON.stringify({}));
      localStorage.setItem("base:tccSettings", JSON.stringify({ devices: [], settings: {}, componentOverrides: {} }));
      localStorage.setItem("base:equipment", JSON.stringify([
        { tag: "SWBD-E2E", voltage: "480", category: "Distribution", subCategory: "Switchboard", x: 0, y: 0, z: 0 },
        { tag: "PMP-E2E", voltage: "480", category: "Mechanical Load", subCategory: "Pump", x: 95, y: 0, z: 0 },
      ]));
      localStorage.setItem("base:loadList", JSON.stringify([
        { source: "SWBD-E2E", tag: "PMP-E2E", kw: "11", voltage: "480", powerFactor: "0.86", phases: "3", duty: "Continuous" },
      ]));
      localStorage.setItem("base:oneLineDiagram", JSON.stringify({ activeSheet: 0, sheets: [] }));
      localStorage.setItem("base:cableSchedule", JSON.stringify([]));
      localStorage.setItem("base:traySchedule", JSON.stringify([]));
      localStorage.setItem("base:conduitSchedule", JSON.stringify([]));
      localStorage.setItem("base:ductbankSchedule", JSON.stringify([]));
      localStorage.setItem("base:studyResults", JSON.stringify({}));
      localStorage.setItem("base:studyApprovals", JSON.stringify({}));
      localStorage.setItem("base:reportSnapshots", JSON.stringify({}));
      localStorage.setItem("base:lifecyclePackages", JSON.stringify([]));
    }, { designBasis });

    await page.goto(pageUrl("workflowdashboard.html?e2e=1"));
    await expect(page.locator("#dashboard-guided-workflow")).toContainText("Auto-Build Workflow");
    await expect(page.locator("#dashboard-guided-workflow")).toContainText("Missing Information Prompts");
    await expect(page.locator("#dashboard-compliance-matrix")).toContainText("Protective-device settings confirmed");
    await expect(page.locator("#dashboard-review-gates")).toContainText("Confirm protective-device settings");
    await page.click('[data-review-gate="protective-device-settings"]');
    await expect(page.locator(".component-modal")).toContainText("Review Gate: Confirm protective-device settings");
    await page.selectOption("#review-gate-status", "flagged");
    await page.fill("#review-gate-note", "Waiting on final TCC settings sheet.");
    await page.click(".component-modal .primary-btn");
    await expect(page.locator("#dashboard-auto-build-status")).toContainText("flagged");
    const flaggedApproval = await page.evaluate(() => JSON.parse(localStorage.getItem("base:designGateApprovals"))["protective-device-settings"]);
    expect(flaggedApproval.status).toBe("flagged");
    await page.click("#dashboard-auto-build-btn");
    await expect(page.locator("#dashboard-auto-build-status")).toContainText("Auto-built");
    await expect(page.locator("#dashboard-compliance-matrix")).toContainText("Deliverable review gates resolved");

    const generatedCable = await page.evaluate(() => JSON.parse(localStorage.getItem("base:cableSchedule"))[0]);
    expect(generatedCable.insulation_type).toBe("XHHW-2");
    expect(generatedCable._designBasis.insulationType).toBe("XHHW-2");
    expect(generatedCable.raceway_id).toBe("TR-E2E-001");

    await page.goto(pageUrl("projectreport.html?e2e=1"));
    await expect(page.locator("#rpt-deliverable-readiness")).toContainText("design basis gate");
    await page.click("#rpt-json-btn");
    await expect(page.locator("#report-status")).toContainText("JSON export blocked");
  });
});

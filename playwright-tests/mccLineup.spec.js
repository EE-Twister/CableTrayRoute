import { test, expect } from "@playwright/test";
import { createReadStream } from "fs";
import fs from "fs/promises";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
let server;
let baseUrl;

const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".mjs": "text/javascript",
  ".svg": "image/svg+xml"
};

function pageUrl(file) {
  return `${baseUrl}/${file}`;
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
  const resolved = path.resolve(root, pathname);
  if (!resolved.startsWith(root)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentTypes[path.extname(resolved)] || "application/octet-stream" });
    createReadStream(resolved).pipe(res);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

async function changeField(page, field, value) {
  const input = page.locator(`[data-mcc-lineup-field="${field}"]`);
  await input.fill(value);
  await input.evaluate(node => node.dispatchEvent(new Event("change", { bubbles: true })));
}

async function installCleanProject(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__mccLineupSmokeInitialized")) return;
    sessionStorage.setItem("__mccLineupSmokeInitialized", "1");
    localStorage.clear();
    localStorage.setItem("CTR_PROJECT_V1", JSON.stringify({
      name: "",
      ductbanks: [],
      conduits: [],
      trays: [],
      cables: [],
      cableTypicals: [],
      settings: {
        session: {},
        collapsedGroups: {},
        units: "imperial",
        theme: "system",
        onboarding: {
          completed: true,
          version: "2026.03",
          dismissedVersion: ""
        }
      }
    }));
  });
}

test.describe("MCC Lineups", () => {
  test.beforeAll(async () => {
    server = http.createServer((req, res) => {
      serveStatic(req, res);
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  test.afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  test("creates a lineup, syncs equipment, and shows arrangement preview", async ({ page }) => {
    await installCleanProject(page);
    await page.goto(pageUrl("mcclineup.html?e2e=1"));

    await expect(page.locator("h1")).toContainText("MCC Lineups");
    await page.selectOption("#mcc-profile-preset", "heavy-duty-480v");
    await page.click("#apply-mcc-profile");
    await expect(page.locator('[data-mcc-lineup-field="horizontalBusRatingA"]')).toHaveValue("2000");
    await expect(page.locator('[data-mcc-lineup-field="sectionDepthIn"]')).toHaveValue("24");
    await changeField(page, "tag", "MCC-TEST");
    await changeField(page, "name", "Test MCC Lineup");
    await changeField(page, "equipmentTag", "MCC-TEST");
    await changeField(page, "horizontalBusRatingA", "2000");
    await changeField(page, "verticalBusRatingA", "800");
    await changeField(page, "topHorizontalWirewayHeightIn", "10");
    await changeField(page, "bottomHorizontalWirewayHeightIn", "8");
    await changeField(page, "arrangement", "MCC Room");
    const verticalWirewayInput = page.locator('[data-section-field="verticalWirewayWidthIn"]').first();
    await verticalWirewayInput.fill("5");
    await verticalWirewayInput.evaluate(node => node.dispatchEvent(new Event("change", { bubbles: true })));
    const bucketTypeSelect = page.locator('[data-bucket-field="type"]').first();
    await expect(bucketTypeSelect).toBeEnabled();
    await bucketTypeSelect.selectOption("main-mlo");
    await expect(bucketTypeSelect).toHaveValue("main-mlo");
    const firstEquipmentTag = page.locator('[data-bucket-field="equipmentTag"]').first();
    const firstEquipmentDescription = page.locator('[data-bucket-field="equipmentDescription"]').first();
    await expect(page.locator(".mcc-bucket-table").first().locator("thead")).toContainText("Equipment Tag");
    await expect(page.locator(".mcc-bucket-table").first().locator("thead")).toContainText("Equipment Description");
    await expect(page.locator('[data-bucket-field="label"]')).toHaveCount(0);
    await firstEquipmentTag.fill("11-MP-001A");
    await firstEquipmentTag.evaluate(node => node.dispatchEvent(new Event("change", { bubbles: true })));
    await firstEquipmentDescription.fill("Boiler Main Pump A");
    await firstEquipmentDescription.evaluate(node => node.dispatchEvent(new Event("change", { bubbles: true })));
    await page.click(".mcc-spec-details summary");
    await page.selectOption('[data-mcc-spec-field="busMaterial"]', "aluminum");
    await page.selectOption('[data-mcc-spec-field="busPlating"]', "other");
    await expect(page.locator('[data-mcc-spec-field="busPlatingOther"]')).toBeEnabled();
    await page.fill('[data-mcc-spec-field="busPlatingOther"]', "nickel plated");
    await page.fill('[data-mcc-spec-field="shortCircuitRatingKa"]', "100");
    await page.check('[data-mcc-spec-field="spaceHeaterRequired"]');
    await page.selectOption('[data-mcc-spec-field="communicationProtocol"]', "modbus-tcp");
    await page.fill('[data-mcc-spec-field="controlVoltage"]', "24VDC");
    await page.click("summary", { button: "left" });
    await page.locator("summary").filter({ hasText: "PDF Title Block" }).click();
    await page.fill('[data-mcc-report-field="projectName"]', "Boiler Upgrade");
    await page.locator('[data-mcc-report-field="projectName"]').dispatchEvent("change");
    await page.fill('[data-mcc-report-field="drawingNumber"]', "E-601");
    await page.locator('[data-mcc-report-field="drawingNumber"]').dispatchEvent("change");
    await page.fill('[data-mcc-report-field="revision"]', "B");
    await page.locator('[data-mcc-report-field="revision"]').dispatchEvent("change");
    await page.fill('[data-mcc-report-field="preparedBy"]', "CTR");
    await page.locator('[data-mcc-report-field="preparedBy"]').dispatchEvent("change");

    await page.click("#add-mcc-section");
    const newSection = page.locator(".mcc-section-editor").last();
    await expect(newSection.locator("tbody tr")).toHaveCount(6);
    await expect(newSection.locator('[data-bucket-field="type"]').first()).toHaveValue("space");
    await expect(newSection.locator('[data-bucket-field="heightIn"]').first()).toHaveValue("12");
    const sourceHandle = newSection.locator('tr[data-bucket-index="0"] [data-bucket-drag-handle]');
    const targetHandle = newSection.locator('tr[data-bucket-index="5"] [data-bucket-drag-handle]');
    await sourceHandle.scrollIntoViewIfNeeded();
    await targetHandle.scrollIntoViewIfNeeded();
    await sourceHandle.click();
    await expect(page.locator("#mcc-sync-status")).toContainText("Bucket move started");
    await page.locator(".mcc-section-editor").last().locator('tr[data-bucket-index="5"] [data-bucket-drag-handle]').dispatchEvent("click", { bubbles: true });
    await expect(page.locator("#mcc-sync-status")).toContainText("Bucket moved");
    await page.locator('[data-section-action="add-bucket"]').last().click();

    await expect(page.locator("#mcc-elevation-preview svg")).toBeVisible();
    await expect(page.locator("#mcc-elevation-preview")).toContainText("H Bus 2000A / V Bus 800A");
    await expect(page.locator("#mcc-elevation-preview")).toContainText("TOP HORIZONTAL WIREWAY 10");
    await expect(page.locator("#mcc-elevation-preview")).toContainText("V WIREWAY 5");
    await expect(page.locator("#mcc-elevation-preview")).toContainText("11-MP");
    await expect(page.locator("#mcc-elevation-preview")).toContainText("Boiler");
    await expect(page.locator("#mcc-elevation-preview")).toContainText("MLO");
    await expect(page.locator("#mcc-elevation-preview")).toContainText("A-C");
    await expect(page.locator("#mcc-oneline-preview svg")).toBeVisible();
    await expect(page.locator("#mcc-oneline-preview")).toContainText("MLO");
    await expect(page.locator("#mcc-validation-list li").first()).toBeVisible();
    const canvasMove = await page.evaluate(() => {
      const lineup = JSON.parse(localStorage.getItem("base:mccLineups") || "[]")[0];
      return {
        sourceBucketId: lineup.sections[2].buckets[0].id,
        targetBucketId: lineup.sections[1].buckets[0].id
      };
    });
    const canvasSource = page.locator(`#mcc-elevation-preview [data-mcc-bucket-id="${canvasMove.sourceBucketId}"]`);
    const canvasTarget = page.locator(`#mcc-elevation-preview [data-mcc-bucket-id="${canvasMove.targetBucketId}"]`);
    await canvasSource.scrollIntoViewIfNeeded();
    await canvasTarget.scrollIntoViewIfNeeded();
    const canvasSourceBox = await canvasSource.boundingBox();
    const canvasTargetBox = await canvasTarget.boundingBox();
    expect(canvasSourceBox).toBeTruthy();
    expect(canvasTargetBox).toBeTruthy();
    await page.mouse.move(canvasSourceBox.x + canvasSourceBox.width / 2, canvasSourceBox.y + canvasSourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvasTargetBox.x + canvasTargetBox.width / 2, canvasTargetBox.y + canvasTargetBox.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator("#mcc-sync-status")).toContainText("Moved bucket to Section 2");
    const selectedBucketId = await page.locator("#mcc-elevation-preview [data-mcc-bucket-id]").first().getAttribute("data-mcc-bucket-id");
    await page.locator("#mcc-elevation-preview [data-mcc-bucket-id]").first().click();
    await expect(page.locator(`#mcc-section-list tr[data-bucket-id="${selectedBucketId}"]`)).toHaveClass(/mcc-bucket-row-selected/);
    await expect(page.locator(`#mcc-oneline-preview [data-mcc-bucket-id="${selectedBucketId}"]`)).toHaveClass(/mcc-oneline-selected/);
    await expect(page.locator("#mcc-selection-status")).toContainText("Selected bucket");
    await expect(page.locator("#mcc-selection-status")).toContainText("11-MP-001A");
    await expect(page.locator("#mcc-selection-status")).toContainText("Boiler Main Pump A");
    await expect(page.locator("#mcc-selection-status")).toContainText("MLO");

    const pdfDownloadPromise = page.waitForEvent("download");
    await page.click("#export-mcc-lineup-pdf");
    const pdfDownload = await pdfDownloadPromise;
    expect(pdfDownload.suggestedFilename()).toContain("mcc-test");
    expect(pdfDownload.suggestedFilename()).toContain("mcc-lineup-report.pdf");
    await expect(page.locator("#mcc-sync-status")).toContainText("Exported PDF report for MCC-TEST");

    await page.evaluate(() => {
      window.__mccDownloads = [];
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function patchedClick() {
        window.__mccDownloads.push({ download: this.download, href: this.href });
        if (!this.download) originalClick.call(this);
      };
    });
    await page.click("#export-mcc-lineup-svg");
    const exported = await page.evaluate(() => window.__mccDownloads.at(-1));
    expect(exported.download).toContain("mcc-test");
    expect(exported.href).toContain("blob:");

    await page.click("#sync-mcc-equipment");
    await expect(page.locator("#mcc-sync-status")).toContainText("Synced");

    const stored = await page.evaluate(() => ({
      lineups: JSON.parse(localStorage.getItem("base:mccLineups") || "[]"),
      equipment: JSON.parse(localStorage.getItem("base:equipment") || "[]")
    }));
    expect(stored.lineups[0].tag).toBe("MCC-TEST");
    expect(stored.lineups[0].sections[0].buckets[0].equipmentTag).toBe("11-MP-001A");
    expect(stored.lineups[0].sections[0].buckets[0].equipmentDescription).toBe("Boiler Main Pump A");
    expect(stored.lineups[0].specRequirements.busMaterial).toBe("aluminum");
    expect(stored.lineups[0].specRequirements.busPlating).toBe("other");
    expect(stored.lineups[0].specRequirements.busPlatingOther).toBe("nickel plated");
    expect(stored.lineups[0].specRequirements.spaceHeaterRequired).toBe(true);
    expect(stored.lineups[0].specRequirements.communicationProtocol).toBe("modbus-tcp");
    expect(stored.lineups[0].reportTitleBlock.projectName).toBe("Boiler Upgrade");
    expect(stored.lineups[0].reportTitleBlock.drawingNumber).toBe("E-601");
    expect(stored.lineups[0].reportTitleBlock.revision).toBe("B");
    expect(stored.lineups[0].sections[1].buckets[0].label).toBe("SPACE 2");
    expect(stored.equipment.some(item => (
      item.tag === "MCC-TEST"
      && item.subCategory === "MCC"
      && String(item.notes || "").includes("aluminum bus")
      && String(item.notes || "").includes("nickel plated bus plating")
    ))).toBeTruthy();

    await page.evaluate(() => {
      const equipment = JSON.parse(localStorage.getItem("base:equipment") || "[]");
      const mcc = equipment.find(item => item.tag === "MCC-TEST") || {};
      const arrangement = {
        activeArrangementId: "arr-mcc-test",
        arrangements: [{
          id: "arr-mcc-test",
          name: "MCC Room",
          room: {
            width: 30,
            depth: 20,
            walls: { north: "Concrete", south: "Concrete", east: "CMU", west: "CMU" },
            interiorWalls: [],
            doorways: []
          },
          equipment: [{
            id: "eq-mcc-test",
            name: "MCC-TEST",
            listTag: "MCC-TEST",
            lineup: "MCC-TEST",
            width: Number(mcc.width || 4),
            depth: Number(mcc.depth || 2),
            height: Number(mcc.height || 7.5),
            baseElevation: 0,
            voltage: "480V",
            facing: "south",
            x: 2,
            y: 2
          }],
          scale: 20,
          source: "manual",
          listAssignment: "",
          savedViews: []
        }]
      };
      localStorage.setItem("base:equipmentArrangements", JSON.stringify(arrangement));
    });

    await page.goto(pageUrl("equipmentarrangements.html?e2e=1"));
    await page.locator("#equipment-arrangement-canvas .equipment-block").click();
    await expect(page.locator("#equipment-mcc-preview-panel")).toBeVisible();
    await expect(page.locator("#equipment-mcc-elevation-preview svg")).toBeVisible();
    await expect(page.locator("#equipment-mcc-oneline-preview svg")).toBeVisible();
    await expect(page.locator("#equipment-mcc-edit-link")).toHaveAttribute("href", /mcclineup\.html\?mccLineupId=/);
    await page.click("#equipment-mcc-edit-link");
    await expect(page).toHaveURL(/mcclineup\.html\?mccLineupId=/);
    await expect(page.locator('[data-mcc-lineup-field="tag"]')).toHaveValue("MCC-TEST");
  });

  test("places a standalone MCC lineup without an Equipment List row", async ({ page }) => {
    await installCleanProject(page);
    await page.goto(pageUrl("mcclineup.html?e2e=1"));

    await changeField(page, "tag", "MCC-ONEOFF");
    await changeField(page, "name", "One-Off MCC Lineup");
    await expect(page.locator('[data-mcc-lineup-field="equipmentTag"]')).toHaveValue("");

    await page.click("#sync-mcc-equipment");
    await expect(page.locator("#mcc-sync-status")).toContainText("Synced 0 MCC lineups");
    const equipmentCount = await page.evaluate(() => JSON.parse(localStorage.getItem("base:equipment") || "[]").length);
    expect(equipmentCount).toBe(0);

    await page.goto(pageUrl("equipmentarrangements.html?e2e=1"));
    await page.selectOption("#equipment-source", "mcc-lineup");
    await expect(page.locator("#mcc-lineup-preset-wrapper")).toBeVisible();
    await expect(page.locator("#mcc-lineup-preset")).toContainText("MCC-ONEOFF");
    await page.click("#add-equipment");

    await expect(page.locator("#equipment-arrangement-canvas .equipment-block")).toBeVisible();
    await page.locator("#equipment-arrangement-canvas .equipment-block").click();
    await expect(page.locator("#equipment-mcc-preview-panel")).toBeVisible();
    await expect(page.locator("#equipment-mcc-preview-title")).toContainText("MCC-ONEOFF");
    await expect(page.locator("#equipment-mcc-elevation-preview svg")).toBeVisible();
    await expect(page.locator("#equipment-mcc-oneline-preview svg")).toBeVisible();
  });
});

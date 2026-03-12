const assert = require("assert");
const fs = require("fs");
const path = require("path");

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log("  \u2713", name);
  } catch (err) {
    console.log("  \u2717", name);
    console.error(err);
  }
}

(async () => {
  const { buildSegmentRows, buildSummaryRows, buildBOM } = await import(
    "../resultsExport.mjs"
  );
  const conductorProps = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "data", "conductor_properties.json"),
      "utf8",
    ),
  );
  const materialCosts = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "data", "material_costs.json"),
      "utf8",
    ),
  );

  describe("buildSegmentRows", () => {
    it("creates rows with cumulative length and reasons", () => {
      const results = [
        {
          cable: "C1",
          total_length: 10,
          field_length: 4,
          segments_count: 2,
          breakdown: [
            { length: 3, tray_id: "T1", type: "tray" },
            { length: 7, conduit_id: "1", ductbankTag: "DB1", type: "field" },
          ],
          exclusions: [
            { reason: "over_capacity" },
            { reason: "group_mismatch" },
          ],
        },
      ];
      const rows = buildSegmentRows(results);
      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[0].cumulative_length, 3);
      assert.strictEqual(rows[1].cumulative_length, 10);
      assert.strictEqual(rows[0].reason_codes, "over_capacity; group_mismatch");
      assert.strictEqual(rows[1].element_type, "conduit");
      assert.strictEqual(rows[1].element_id, "DB1:1");
    });
  });

  describe("buildSummaryRows", () => {
    it("summarizes cables", () => {
      const results = [
        {
          cable: "C1",
          total_length: 10,
          field_length: 4,
          segments_count: 2,
          exclusions: [{ reason: "over_capacity" }],
        },
      ];
      const rows = buildSummaryRows(results);
      assert.deepStrictEqual(rows[0], {
        cable_tag: "C1",
        total_length: 10,
        field_length: 4,
        segments_count: 2,
        reason_codes: "over_capacity",
      });
    });
  });

  describe("buildBOM", () => {
    it("aggregates raceway lengths and cable counts", () => {
      const results = [
        {
          cable: "C1",
          total_length: 10,
          breakdown: [
            { length: 6, tray_id: "T1" },
            { length: 4, conduit_id: "C1" },
          ],
        },
      ];
      const trayData = [
        { tray_id: "T1", tray_type: "Ladder (50 % fill)" },
        { conduit_id: "C1", type: "RMC" },
      ];
      const cableList = [
        {
          tag: "C1",
          conductor_size: "#12 AWG",
          conductor_material: "Copper",
          conductors: 3,
        },
      ];
      const { raceways, cables } = buildBOM(
        results,
        trayData,
        cableList,
        conductorProps,
        materialCosts,
      );
      const ladder = raceways.find((r) => r.type === "Ladder (50 % fill)");
      const rmc = raceways.find((r) => r.type === "RMC");
      assert.strictEqual(ladder.total_length, 6);
      assert.strictEqual(rmc.total_length, 4);
      assert.strictEqual(cables[0].count, 1);
      assert.strictEqual(cables[0].total_length, 10);
      assert.ok(cables[0].weight > 0);
      assert.ok(cables[0].cost > 0);
    });
  });
})();

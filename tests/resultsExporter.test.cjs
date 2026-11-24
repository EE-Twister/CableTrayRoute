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
    process.exitCode = 1;
  }
}

(async () => {
  const { buildSegmentRows, buildSummaryRows, buildBOM } = await import(
    "../resultsExport.mjs"
  );
  const { buildRouteQuantityLedger } = await import(
    "../analysis/routeCostAssurance.mjs"
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

    it("exports segment start and end coordinates when present", () => {
      const rows = buildSegmentRows([
        {
          cable: "C2",
          breakdown: [
            {
              length: 12,
              tray_id: "T2",
              start: [1, 2, 3],
              end: [13, 2, 3],
            },
          ],
        },
      ]);
      assert.strictEqual(rows[0].start_x, 1);
      assert.strictEqual(rows[0].start_y, 2);
      assert.strictEqual(rows[0].start_z, 3);
      assert.strictEqual(rows[0].end_x, 13);
      assert.strictEqual(rows[0].end_y, 2);
      assert.strictEqual(rows[0].end_z, 3);
    });

    it("uses matching route geometry when a derived breakdown length is absent", () => {
      const rows = buildSegmentRows([{
        cable: "C3",
        route_segments: [{ length: 12.5, start: [0, 0, 0], end: [12.5, 0, 0] }],
        breakdown: [{ tray_id: "T3", start: [0, 0, 0], end: [12.5, 0, 0] }],
      }]);
      assert.strictEqual(rows[0].length, 12.5);
      assert.strictEqual(rows[0].cumulative_length, 12.5);
    });

    it("derives export rows from route_segments when breakdown is absent", () => {
      const rows = buildSegmentRows([{
        cable: "C4",
        route_segments: [{ type: "tray", tray_id: "TR-1", length: 5, start: [0, 0, 0], end: [3, 4, 0] }],
      }]);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].element_id, "TR-1");
      assert.strictEqual(rows[0].length, 5);
      assert.strictEqual(rows[0].start_x, 0);
      assert.strictEqual(rows[0].end_x, 3);
      assert.strictEqual(rows[0].end_y, 4);
    });

    it("keeps legacy breakdown rows while using route geometry for missing lengths", () => {
      const rows = buildSegmentRows([{
        cable: "C5",
        route_segments: [{ type: "conduit", conduit_id: "C-1", length: 7, start: [1, 2, 3], end: [1, 9, 3] }],
        breakdown: [{ conduit_id: "C-1", type: "conduit", start: [1, 2, 3], end: [1, 9, 3] }],
      }]);
      assert.strictEqual(rows[0].element_type, "conduit");
      assert.strictEqual(rows[0].length, 7);
      assert.strictEqual(rows[0].start_z, 3);
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

    it("builds fresh route BOMs from route_segments and cable name aliases", () => {
      const results = [{
        cable: "FRESH-1",
        total_length: 9,
        route_segments: [
          { type: "tray", tray_id: "TRAY-1", length: 3 },
          { type: "field", tray_id: "TRAY-1", length: 2 },
          { type: "conduit", tray_id: "PARENT-1", conduit_id: "COND-1", length: 4 },
        ],
      }];
      const trayData = [
        { tray_id: "TRAY-1", tray_type: "Ladder (50 % fill)" },
        { tray_id: "PARENT-1", tray_type: "Unwanted parent tray" },
        { conduit_id: "COND-1", type: "RMC" },
      ];
      const cableList = [{
        name: "FRESH-1",
        conductor_size: "#12 AWG",
        conductor_material: "Copper",
        conductors: 3,
      }];

      const { raceways, cables } = buildBOM(
        results,
        trayData,
        cableList,
        conductorProps,
        materialCosts,
      );
      assert.deepStrictEqual(
        raceways.map(row => [row.type, row.total_length]),
        [["Ladder (50 % fill)", 3], ["RMC", 4]],
      );
      assert.ok(!raceways.some(row => /field|unwanted/i.test(row.type)));
      assert.strictEqual(cables.length, 1);
      assert.strictEqual(cables[0].total_length, 9);
    });

    it("excludes field containment even when it carries a raceway id", () => {
      const { raceways } = buildBOM([
        {
          cable: "FIELD-1",
          route_segments: [
            { containmentType: "field", tray_id: "TRAY-1", length: 8 },
          ],
        },
      ], [{ tray_id: "TRAY-1", tray_type: "Ladder (50 % fill)" }]);
      assert.deepStrictEqual(raceways, []);
    });

    const sharedTray = {
      tray_id: "TR-100", tray_type: "Ladder (50 % fill)",
      start_x: 0, start_y: 0, start_z: 10, end_x: 100, end_y: 0, end_z: 10,
    };
    const fiveCablesInOneTray = ["C1", "C2", "C3", "C4", "C5"].map(cable => ({
      cable,
      status: "Routed",
      total_length: 100,
      route_segments: [{ type: "tray", tray_id: "TR-100", length: 100, start: [0, 0, 10], end: [100, 0, 10] }],
    }));

    it("counts a raceway shared by five cables once (E5)", () => {
      const { raceways, racewayUsage } = buildBOM(fiveCablesInOneTray, [sharedTray], [], conductorProps, materialCosts);
      assert.deepStrictEqual(raceways, [{
        type: "Ladder (50 % fill)", raceway_count: 1, total_length: 100, weight: 100, cost: 500,
      }]);
      assert.deepStrictEqual(racewayUsage, [{
        raceway_id: "TR-100",
        kind: "tray",
        type: "Ladder (50 % fill)",
        physical_length_ft: 100,
        length_basis: "scheduled length",
        cable_count: 5,
        routed_cable_ft: 500,
      }]);
      assert.ok(!Object.keys(racewayUsage[0]).some(key => /cost/i.test(key)));
    });

    it("matches the Cost Estimate route quantity ledger for unique tray length", () => {
      const ledger = buildRouteQuantityLedger({
        routeResults: fiveCablesInOneTray,
        cables: ["C1", "C2", "C3", "C4", "C5"].map(tag => ({ tag })),
        trays: [sharedTray],
      });
      const { raceways } = buildBOM(fiveCablesInOneTray, [sharedTray]);
      assert.strictEqual(raceways[0].total_length, ledger.summary.uniqueTrayFt);
    });

    it("uses the longest per-cable length when a raceway has no scheduled geometry", () => {
      const { raceways, racewayUsage } = buildBOM([
        {
          cable: "SPLIT",
          route_segments: [
            { type: "tray", tray_id: "TR-NOGEOM", length: 40 },
            { type: "tray", tray_id: "TR-NOGEOM", length: 60 },
          ],
        },
        { cable: "SHORT", route_segments: [{ type: "tray", tray_id: "TR-NOGEOM", length: 30 }] },
      ], [{ tray_id: "TR-NOGEOM", tray_type: "Ladder (50 % fill)" }], [], conductorProps, materialCosts);
      assert.strictEqual(raceways[0].total_length, 100);
      assert.strictEqual(raceways[0].raceway_count, 1);
      assert.strictEqual(racewayUsage[0].routed_cable_ft, 130);
      assert.match(racewayUsage[0].length_basis, /longest routed/);
    });

    it("keeps same-numbered conduits in different ductbanks apart", () => {
      const trayData = [
        { tray_id: "DB-A-1", ductbankTag: "DB-A", conduit_id: "1", type: "PVC Sch 40", start_x: 0, start_y: 0, start_z: -8, end_x: 50, end_y: 0, end_z: -8 },
        { tray_id: "DB-B-1", ductbankTag: "DB-B", conduit_id: "1", type: "PVC Sch 40", start_x: 0, start_y: 20, start_z: -8, end_x: 30, end_y: 20, end_z: -8 },
      ];
      const results = [
        { cable: "A1", route_segments: [{ type: "conduit", ductbankTag: "DB-A", conduit_id: "1", length: 50 }] },
        { cable: "A2", route_segments: [{ type: "conduit", ductbankTag: "DB-A", conduit_id: "1", length: 50 }] },
        { cable: "B1", route_segments: [{ type: "conduit", ductbankTag: "DB-B", conduit_id: "1", length: 30 }] },
      ];
      const { raceways, racewayUsage } = buildBOM(results, trayData, [], conductorProps, materialCosts);
      assert.deepStrictEqual(raceways, [{ type: "PVC Sch 40", raceway_count: 2, total_length: 80, weight: 40, cost: 160 }]);
      assert.deepStrictEqual(racewayUsage.map(row => [row.raceway_id, row.physical_length_ft, row.cable_count]), [
        ["DB-A:1", 50, 2],
        ["DB-B:1", 30, 1],
      ]);
    });
  });
})();

const assert = require("assert");

// simple in-memory localStorage stub
const store = {};
global.localStorage = {
  getItem: (key) => (key in store ? store[key] : null),
  setItem: (key, value) => {
    store[key] = value;
  },
  removeItem: (key) => {
    delete store[key];
  },
};

(async () => {
  const { exportProject, importProject } = await import("../dataStore.mjs");

  // initialize project data
  const initial = {
    ductbanks: [{ tag: "DB1" }],
    conduits: [{ conduit_id: "C1", ductbankTag: "DB1" }],
    trays: [{ id: "T1" }],
    cables: [{ name: "C1" }],
    cableTypicals: [],
    panels: [],
    equipment: [],
    loads: [],
    settings: { session: {}, collapsedGroups: {}, units: "imperial" },
    oneLine: {
      activeSheet: 0,
      sheets: [
        {
          name: "S1",
          components: [
            { id: "mcc-1", type: "panel", subtype: "mcc", props: { tag: "MCC-1", rated_voltage_kv: 0.48, bus_rating_a: 2000, main_device_type: "mccb", sccr_ka: 65, bucket_count: 8, spare_bucket_count: 2, form_type: "form_2b" } },
            { id: "busway-1", type: "busway", subtype: "busway", props: { length_ft: 120, material: "copper", insulation_type: "epoxy", enclosure_rating: "NEMA 1", busway_type: "feeder", ampacity_a: 1200, r_ohm_per_kft: 0.03, x_ohm_per_kft: 0.01, short_circuit_rating_ka: 65 } },
            { id: "ct-1", type: "ct", subtype: "ct", props: { tag: "CT-1", ratio_primary: 600, ratio_secondary: 5, accuracy_class: "0.3", burden_va: 15, knee_point_v: 400, polarity: "H1-X1", location_context: "protection" } },
            { id: "pt-1", type: "vt", subtype: "pt_vt", props: { tag: "PT-1", primary_voltage: 12470, secondary_voltage: 120, accuracy_class: "0.3", burden_va: 50, connection_type: "wye-grounded", fuse_protection: "yes" } },
            { id: "ups-1", type: "ups", subtype: "ups", props: { tag: "UPS-1", manufacturer: "Sample", model: "UPS-500", topology: "double_conversion", rated_kva: 500, input_voltage_kv: 0.48, output_voltage_kv: 0.48, efficiency_pct: 96, battery_runtime_min: 15, battery_dc_v: 480, static_bypass_supported: true, operating_mode: "normal", mode_normal_enabled: true, mode_battery_enabled: true, mode_bypass_enabled: true, runtime_normal_min: 0, runtime_battery_min: 15, runtime_bypass_min: 0 } }
          ],
          connections: []
        }
      ]
    }
  };
  importProject(initial);
  const before = exportProject();

  // simulate self-check snapshot and restore
  const snapshot = exportProject();
  importProject({
    ductbanks: [],
    conduits: [],
    trays: [],
    cables: [],
    cableTypicals: [],
    panels: [],
    equipment: [],
    loads: [],
    settings: { session: {}, collapsedGroups: {}, units: "imperial" },
  });
  // diagnostics would run here, potentially mutating schedules
  importProject(snapshot);
  const after = exportProject();

  const componentSubtypes = (after.oneLine?.sheets?.[0]?.components || []).map((component) => component.subtype);
  assert(componentSubtypes.includes("mcc"));
  assert(componentSubtypes.includes("busway"));
  assert(componentSubtypes.includes("ct"));
  assert(componentSubtypes.includes("pt_vt"));
  assert(componentSubtypes.includes("ups"));
  assert.deepStrictEqual(after, before);
  console.log("\u2713 self-check restores project data");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

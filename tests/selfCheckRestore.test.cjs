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

  assert.deepStrictEqual(after, before);
  console.log("\u2713 self-check restores project data");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

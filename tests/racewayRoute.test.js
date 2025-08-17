const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const code = fs.readFileSync(
  path.join(__dirname, "..", "routeWorker.js"),
  "utf8",
);
const sandbox = { console, self: { postMessage: () => {} } };
vm.createContext(sandbox);
vm.runInContext(
  code + "\nthis.CableRoutingSystem = CableRoutingSystem;",
  sandbox,
);
const { CableRoutingSystem } = sandbox;

// Extract rebuildTrayData from app.js for geometry warning tests
const appCode = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const startMarker = 'const rebuildTrayData = () => {';
const startIdx = appCode.indexOf(startMarker) + startMarker.length;
let idx = startIdx;
let depth = 1;
while (idx < appCode.length && depth > 0) {
  const ch = appCode[idx++];
  if (ch === '{') depth++;
  else if (ch === '}') depth--;
}
const rtBody = appCode.slice(startIdx, idx - 1);
const rebuildTrayData = new Function('state', 'CONDUIT_SPECS', rtBody);

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log("  \u2713", name);
  } catch (err) {
    console.error("  \u2717", name, err.message || err);
    process.exitCode = 1;
  }
}

describe("_racewayRoute", () => {
  it("accepts conduit IDs", () => {
    const system = new CableRoutingSystem({});
    system.addTraySegment({
      tray_id: "tray-1",
      conduit_id: "COND-1",
      start_x: 0,
      start_y: 0,
      start_z: 0,
      end_x: 0,
      end_y: 10,
      end_z: 0,
      width: 10,
      height: 10,
      current_fill: 0,
    });
    const res = system._racewayRoute([0, 0, 0], [0, 10, 0], 1, null, [
      "COND-1",
    ]);
    assert(res.success);
    assert.deepStrictEqual(Array.from(res.tray_segments), ["tray-1"]);
  });

  it("includes numeric ductbank conduit ids in base graph", () => {
    const system = new CableRoutingSystem({});
    system.addTraySegment({
      tray_id: "tray-2",
      conduit_id: 0,
      raceway_type: "ductbank",
      start_x: 0,
      start_y: 0,
      start_z: 0,
      end_x: 10,
      end_y: 0,
      end_z: 0,
      width: 10,
      height: 10,
      current_fill: 0,
    });
    system.prepareBaseGraph();
    assert(
      system.baseGraph.edges["tray-2_start"]?.["tray-2_end"],
      "ductbank conduit missing from graph",
    );
  });

  it("warns and ignores ductbank outlines without conduit ids", () => {
    const system = new CableRoutingSystem({});
    system.addTraySegment({
      tray_id: "outline-1",
      raceway_type: "ductbank",
      start_x: 0,
      start_y: 0,
      start_z: 0,
      end_x: 5,
      end_y: 0,
      end_z: 0,
      width: 1,
      height: 1,
      current_fill: 0,
    });
    let warned = false;
    const origWarn = console.warn;
    console.warn = () => {
      warned = true;
    };
    system.prepareBaseGraph();
    console.warn = origWarn;
    assert(warned, "missing ductbank warning not emitted");
    assert(
      !system.baseGraph.edges["outline-1_start"]?.["outline-1_end"],
      "outline segment should be ignored",
    );
  });

  it("includes ductbank outlines when configured", () => {
    const system = new CableRoutingSystem({ includeDuctbankOutlines: true });
    system.addTraySegment({
      raceway_type: "ductbank",
      start_x: 0,
      start_y: 0,
      start_z: 0,
      end_x: 5,
      end_y: 0,
      end_z: 0,
      width: 1,
      height: 1,
      current_fill: 0,
    });
    let warned = false;
    const origWarn = console.warn;
    console.warn = () => {
      warned = true;
    };
    system.prepareBaseGraph();
    console.warn = origWarn;
    assert(warned, "missing ductbank warning not emitted");
    assert(
      system.baseGraph.edges["ductbank_outline_0_start"]?.["ductbank_outline_0_end"],
      "ductbank outline not included",
    );
  });

  it("reports exclusions for overfilled trays", () => {
    const system = new CableRoutingSystem({ fillLimit: 0.4 });
    system.addTraySegment({
      tray_id: "tray-over",
      start_x: 0,
      start_y: 0,
      start_z: 0,
      end_x: 0,
      end_y: 10,
      end_z: 0,
      width: 10,
      height: 10,
      current_fill: 40,
    });
    const res = system.calculateRoute([0, 0, 0], [0, 10, 0], 1, null);
    assert.strictEqual(res.exclusions.length, 1);
    assert.strictEqual(res.exclusions[0].tray_id, "tray-over");
    assert.strictEqual(res.exclusions[0].reason, "over_capacity");
  });

  it("warns with mismatched record details", () => {
    const system = new CableRoutingSystem({ fillLimit: 0.4 });
    system.addTraySegment({
      tray_id: "tray-over",
      start_x: 0,
      start_y: 0,
      start_z: 0,
      end_x: 0,
      end_y: 10,
      end_z: 0,
      width: 10,
      height: 10,
      current_fill: 40,
    });
    let warned = null;
    const origWarn = console.warn;
    console.warn = (...args) => {
      warned = args;
    };
    system.calculateRoute([0, 0, 0], [0, 10, 0], 1, null, '', [], 'cable-1');
    console.warn = origWarn;
    assert(warned, 'mismatch warning not emitted');
    assert.strictEqual(warned[0], 'Mismatched raceway segments:');
    const records = warned[1];
    assert(Array.isArray(records) && records.length === 1);
    assert.strictEqual(records[0].tray_id, 'tray-over');
    assert.strictEqual(records[0].reason, 'over_capacity');
    assert.strictEqual(records[0].cable_id, 'cable-1');
    assert.deepStrictEqual(Object.keys(records[0]).sort(), ['cable_id','reason','tray_id']);
  });

  it("warns for group mismatches with formatted record", () => {
    const system = new CableRoutingSystem({ fillLimit: 0.4 });
    system.addTraySegment({
      tray_id: 'tray-group',
      start_x: 0,
      start_y: 0,
      start_z: 0,
      end_x: 0,
      end_y: 10,
      end_z: 0,
      width: 10,
      height: 10,
      current_fill: 0,
      allowed_cable_group: 'A',
    });
    let warned = null;
    const origWarn = console.warn;
    console.warn = (...args) => {
      warned = args;
    };
    system.calculateRoute([0, 0, 0], [0, 10, 0], 1, 'B', '', [], 'cable-2');
    console.warn = origWarn;
    assert(warned, 'mismatch warning not emitted');
    assert.strictEqual(warned[0], 'Mismatched raceway segments:');
    const records = warned[1];
    assert(Array.isArray(records) && records.length === 1);
    assert.strictEqual(records[0].tray_id, 'tray-group');
    assert.strictEqual(records[0].reason, 'group_mismatch');
    assert.strictEqual(records[0].cable_id, 'cable-2');
    assert.deepStrictEqual(Object.keys(records[0]).sort(), ['cable_id','reason','tray_id']);
  });

  it("routes when proximity threshold is increased", () => {
    const tray = {
      tray_id: "tray-prox",
      start_x: 0,
      start_y: 0,
      start_z: 0,
      end_x: 0,
      end_y: 10,
      end_z: 0,
      width: 10,
      height: 10,
      current_fill: 0,
    };
    const start = [0, -73, 0];
    const end = [0, 83, 0];

    let system = new CableRoutingSystem({ proximityThreshold: 72 });
    system.addTraySegment(tray);
    let result = system.calculateRoute(start, end, 1, null);
    const reasons = result.exclusions.map(e => e.reason);
    assert(reasons.includes("start_beyond_proximity"));
    assert(reasons.includes("end_beyond_proximity"));

    system = new CableRoutingSystem({ proximityThreshold: 80 });
    system.addTraySegment(tray);
    result = system.calculateRoute(start, end, 1, null);
    assert(result.success, "route should succeed with higher threshold");
    assert.strictEqual(result.exclusions.length, 0);
  });

  it("warns when ductbank has no conduits", () => {
    const appCode = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
    const startMarker = "const loadSchedulesIntoSession = async () => {";
    const startIdx = appCode.indexOf(startMarker) + startMarker.length;
    let idx = startIdx;
    let depth = 1;
    while (idx < appCode.length && depth > 0) {
      const ch = appCode[idx++];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    const fnBody = appCode.slice(startIdx, idx - 1);
    const state = {
      manualTrays: [],
      cableList: [],
      trayData: [],
      ductbankData: null,
      conduitData: [],
      ductbanksWithoutConduits: [],
    };
    const storage = {
      _data: {},
      getItem(k) {
        return this._data[k] || null;
      },
      setItem(k, v) {
        this._data[k] = String(v);
      },
      removeItem(k) {
        delete this._data[k];
      },
    };
    let warned = false;
    const sandbox = {
      state,
      localStorage: storage,
      rebuildTrayData: () => {},
      globalThis: { TableUtils: { STORAGE_KEYS: { ductbankSchedule: "db", conduitSchedule: "cond" } } },
      document: undefined,
      console: { warn: () => { warned = true; } },
      ensureConductorProps: async () => ({}),
      setRacewayIds: () => {},
    };
    const loadSchedulesIntoSession = vm.runInNewContext(
      'async function loadSchedulesIntoSession(){' + fnBody + '}; loadSchedulesIntoSession;',
      sandbox,
    );
    storage.setItem("db", JSON.stringify([{ ductbank_id: "DB1", start_x: 0, start_y: 0, start_z: 0, end_x: 1, end_y: 0, end_z: 0 }]));
    loadSchedulesIntoSession();
    assert(warned, "missing conduit warning not emitted");
    assert.strictEqual(state.ductbanksWithoutConduits.length, 1);
    assert.strictEqual(state.ductbanksWithoutConduits[0], "DB1");
  });

  it('warns and skips ductbanks lacking geometry', () => {
    const state = {
      manualTrays: [],
      trayData: [],
      ductbankData: { ductbanks: [{ id: 'DB-missing' }] },
      conduitData: [],
    };
    let warned = false;
    const origWarn = console.warn;
    console.warn = () => { warned = true; };
    rebuildTrayData(state, {});
    console.warn = origWarn;
    assert(warned, 'warning not emitted');
    assert.strictEqual(state.trayData.length, 0);
  });

  it('warns and skips conduits without paths', () => {
    const state = {
      manualTrays: [],
      trayData: [],
      ductbankData: {
        ductbanks: [
          {
            id: 'DB1',
            start_x: 0,
            start_y: 0,
            start_z: 0,
            end_x: 1,
            end_y: 0,
            end_z: 0,
            width: 12,
            height: 12,
            conduits: [
              { conduit_id: 'C1', type: 'RMC', trade_size: '1' },
            ],
          },
        ],
      },
      conduitData: [],
    };
    const specs = { RMC: { '1': 0.887 } };
    let warned = false;
    const origWarn = console.warn;
    console.warn = () => { warned = true; };
    rebuildTrayData(state, specs);
    console.warn = origWarn;
    assert(warned, 'warning not emitted');
    assert.strictEqual(state.trayData.length, 0);
  });
});

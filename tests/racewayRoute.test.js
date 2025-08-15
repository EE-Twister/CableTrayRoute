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
});

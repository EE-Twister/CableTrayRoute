const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Ensure emitAsync is globally defined for functions extracted from app.mjs
require("../utils/safeEvents.js");

// Utility functions for simple test output, mirroring existing tests
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

// Extract the conduit count expression and display function from app.mjs
const appCode = fs.readFileSync(path.join(__dirname, "..", "app.mjs"), "utf8");

const conduitMatch = appCode.match(/const conduitCount =([^;]+);/);
if (!conduitMatch) throw new Error("conduitCount expression not found");
const conduitExpr = conduitMatch[1];
const computeConduitCount = new Function("state", `return ${conduitExpr};`);

const startMarker = "const displayConduitCount = (count, hasSchedule) => {";
const startIdx = appCode.indexOf(startMarker) + startMarker.length;
let idx = startIdx;
let depth = 1;
while (idx < appCode.length && depth > 0) {
  const ch = appCode[idx++];
  if (ch === "{") depth++;
  else if (ch === "}") depth--;
}
const dcBody = appCode.slice(startIdx, idx - 1);
const displayConduitCount = new Function(
  "count",
  "hasSchedule",
  "document",
  "elements",
  "console",
  dcBody,
);

const rtMarker = "const rebuildTrayData = () => {";
const rtStart = appCode.indexOf(rtMarker) + rtMarker.length;
let idx2 = rtStart;
let depth2 = 1;
while (idx2 < appCode.length && depth2 > 0) {
  const ch = appCode[idx2++];
  if (ch === "{") depth2++;
  else if (ch === "}") depth2--;
}
const rtBody = appCode.slice(rtStart, idx2 - 1);
const rebuildTrayDataFn = new Function("state", "CONDUIT_SPECS", rtBody);

describe("displayConduitCount", () => {
  it("reflects the actual number of conduits", () => {
    const state = {
      trayData: [
        { raceway_type: "conduit" },
        { raceway_type: "ductbank" },
        { raceway_type: "conduit" },
      ],
    };

    const count = computeConduitCount(state);
    assert.strictEqual(count, 2);

    const el = { textContent: "" };
    const document = {
      getElementById: (id) => (id === "conduit-count" ? el : null),
    };
    let logged = "";
    const consoleStub = { log: (msg) => (logged = msg), warn: () => {} };

    displayConduitCount(count, false, document, {}, consoleStub);

    assert.strictEqual(el.textContent, "Conduits added: 2");
    assert.strictEqual(logged, "Conduits added: 2");
  });
});


describe("rebuildTrayData integration", () => {
  it("counts conduits from stored ductbank data", () => {
    const state = {
      manualTrays: [],
      cableList: [],
      trayData: [],
      geometryWarnings: { ductbanks: [], conduits: [] },
      includeDuctbankOutlines: false,
      ductbankData: {
        ductbanks: [
          {
            tag: "DB1",
            start_x: 0,
            start_y: 0,
            start_z: 0,
            end_x: 1,
            end_y: 1,
            end_z: 1,
            conduits: [
              { conduit_id: "C1", path: [[0,0,0],[1,0,0]], diameter: 1 },
              { conduit_id: "C2", path: [[0,0,0],[0,1,0]], diameter: 1 },
            ],
          },
        ],
      },
      conduitData: [],
    };
    rebuildTrayDataFn(state, {});
    const count = computeConduitCount(state);
    const el = { textContent: "" };
    const doc = { getElementById: id => id === "conduit-count" ? el : null };
    const consoleStub = { log: () => {}, warn: () => {} };
    displayConduitCount(count, true, doc, {}, consoleStub);
    assert.strictEqual(el.textContent, "Conduits added: 2");
  });
});

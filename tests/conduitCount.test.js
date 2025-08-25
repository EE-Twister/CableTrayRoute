const assert = require("assert");
const fs = require("fs");
const path = require("path");

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

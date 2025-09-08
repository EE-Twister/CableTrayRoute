import assert from "assert";
import ampacityLib from "../ampacity.js";
import testLib from "../test.js";

const { ampacity } = ampacityLib;
const { computeDuctbankTemperatures, calcFiniteAmpacity } = testLib;

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

describe("IEEE 835 underground benchmarks", () => {
  const conduit = {
    conduit_id: "C1",
    conduit_type: "PVC Sch 40",
    trade_size: "4",
    x: 0,
    y: 0,
  };
  const cable = {
    conduit_id: "C1",
    conductor_size: "500 kcmil",
    conductor_material: "Copper",
    insulation_type: "THHN",
    insulation_rating: "90",
    voltage_rating: "600V",
    est_load: 392,
  };
  const params = {
    soilResistivity: 90,
    ductbankDepth: 36,
    earthTemp: 20,
    hSpacing: 3,
    vSpacing: 3,
  };

  it("Neher-McGrath ampacity within 5% of IEEE 835", () => {
    const res = ampacity(
      {
        conductor_size: "500 kcmil",
        conductor_material: "Copper",
        insulation_rating: 90,
        voltage_rating: 600,
      },
      {
        soilResistivity: 90,
        ductbankDepth: 36,
        conduit_diameter: 0.1,
        ambient: 20,
      },
    );
    const err = Math.abs(res.ampacity - 392) / 392;
    assert(err <= 0.05);
  });

  it("finite-element temperature around 90C at 392A", () => {
    const temps = computeDuctbankTemperatures([conduit], [cable], params);
    const t = temps[cable.conduit_id];
    assert(Math.abs(t - 90) / 90 <= 0.05);
  });

  it("iterative ampacity solver returns ~392A", () => {
    const c = { ...cable, est_load: 100 };
    const I = calcFiniteAmpacity(c, [conduit], [c], params);
    const err = Math.abs(I - 392) / 392;
    assert(err <= 0.05);
  });
});

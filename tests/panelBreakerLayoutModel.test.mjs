import assert from "node:assert/strict";
import test from "node:test";
import {
  ensurePanelBreakerLayout,
  getLoadBreakerSpan,
  sanitizeDcLoadBreakerPoles
} from "../src/panel-schedule/breakerLayoutModel.js";
import {
  calculatePhaseSummary,
  getPhasePowerValue
} from "../src/panel-schedule/phaseLoadModel.js";

test("normalizes a three-pole AC breaker into alternating panel slots", () => {
  const panel = {
    powerType: "ac",
    phases: "3",
    poles: "3",
    breakerLayout: [
      { start: 1, size: 3, position: 0 },
      null,
      { start: 1, size: 3, position: 1 },
      null,
      { start: 1, size: 3, position: 2 },
      null
    ],
    breakerDetails: {}
  };

  const result = ensurePanelBreakerLayout(panel, 6);

  assert.deepEqual(result.layout, [
    { start: 1, size: 3, position: 0 },
    null,
    { start: 1, size: 3, position: 1 },
    null,
    { start: 1, size: 3, position: 2 },
    null
  ]);
  assert.equal(panel.breakerDetails[1].poles, 3);
  assert.equal(panel.breakerDetails[1].deviceType, "breaker");
  assert.deepEqual(getLoadBreakerSpan({ breaker: 3 }, panel, 6), [1, 3, 5]);
});

test("clamps legacy DC breaker blocks to two poles and clears the trimmed assignment", () => {
  const panel = {
    powerType: "dc",
    poles: "2",
    breakers: ["LOAD-1", null, "LOAD-1", null, "LOAD-1", null],
    breakerLayout: [
      { start: 1, size: 3, position: 0 },
      null,
      { start: 1, size: 3, position: 1 },
      null,
      { start: 1, size: 3, position: 2 },
      null
    ],
    breakerDetails: { 1: { poles: 3 } }
  };
  const loads = [{ panelId: "DC-1", breakerPoles: 3 }];

  const result = ensurePanelBreakerLayout(panel, 6);

  assert.equal(result.changed, true);
  assert.deepEqual(result.layout.filter(Boolean), [
    { start: 1, size: 2, position: 0 },
    { start: 1, size: 2, position: 1 }
  ]);
  assert.equal(panel.breakers[4], null);
  assert.equal(panel.breakerDetails[1].poles, 2);
  assert.equal(sanitizeDcLoadBreakerPoles(loads, panel, "DC-1"), true);
  assert.equal(loads[0].breakerPoles, 2);
});

test("calculates balanced three-phase load totals without DOM dependencies", () => {
  const panel = {
    powerType: "ac",
    phases: "3",
    poles: "3",
    breakers: Array(6).fill(null),
    breakerLayout: [
      { start: 1, size: 3, position: 0 },
      null,
      { start: 1, size: 3, position: 1 },
      null,
      { start: 1, size: 3, position: 2 },
      null
    ],
    breakerDetails: { 1: { poles: 3, deviceType: "breaker" } }
  };
  const loads = [{ ref: "M-1", panelId: "P-1", breaker: 1, breakerPoles: 3, demandKva: 9 }];

  const result = calculatePhaseSummary(panel, "P-1", loads, 6);

  assert.deepEqual(result.phases, ["A", "B", "C"]);
  assert.deepEqual(result.totals, { A: 3000, B: 3000, C: 3000 });
  assert.deepEqual(result.deviations, { A: 0, B: 0, C: 0 });
  assert.equal(result.unit, "VA");
});

test("preserves explicit per-phase values and AC/DC source precedence", () => {
  const panel = {
    powerType: "ac",
    phases: "3",
    poles: "3",
    breakers: Array(6).fill(null),
    breakerLayout: [
      { start: 1, size: 3, position: 0 },
      null,
      { start: 1, size: 3, position: 1 },
      null,
      { start: 1, size: 3, position: 2 },
      null
    ],
    breakerDetails: { 1: { loadVaPerPhase: { A: 5000, B: 3000, C: 3000 } } }
  };

  const result = calculatePhaseSummary(panel, "P-1", [], 6);

  assert.deepEqual(result.totals, { A: 5000, B: 3000, C: 3000 });
  assert.ok(Math.abs(result.deviations.A - (2 / 3)) < 1e-12);
  assert.equal(getPhasePowerValue({ demandKva: 4, demandKw: 3 }, "ac"), 4000);
  assert.equal(getPhasePowerValue({ demandKva: 4, demandKw: 3 }, "dc"), 3000);
  assert.equal(getPhasePowerValue({ demandKva: 0, kva: "" }, "ac"), 0);
  assert.equal(getPhasePowerValue({}, "ac"), null);
});

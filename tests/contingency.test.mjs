/**
 * Tests for analysis/contingency.mjs
 *
 * Verifies N-1 contingency analysis: branch enumeration, result structure,
 * contingency model construction, and violation detection.
 */

// Mock localStorage before any module imports so dataStore.mjs initialises
// without a browser environment.
const store = {};
global.localStorage = {
  getItem:    key          => (key in store ? store[key] : null),
  setItem:    (key, value) => { store[key] = value; },
  removeItem: key          => { delete store[key]; },
};
// Seed a minimal one-line so getOneLine() returns a usable default.
store['base:oneLine'] = JSON.stringify({ sheets: [{ name: 'S1', components: [] }] });

import assert from 'assert';
import { runContingency } from '../analysis/contingency.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Helper: build a minimal two-bus model with one explicit branch.
// ---------------------------------------------------------------------------
function twobusBranchModel() {
  return {
    buses: [
      { id: 'B1', type: 'bus', label: 'Bus 1', Vm: 1.0, Va: 0, connections: [] },
      { id: 'B2', type: 'bus', label: 'Bus 2', Vm: 1.0, Va: 0, connections: [] },
    ],
    branches: [
      { id: 'L1', name: 'Line 1', type: 'line' }
    ],
  };
}

// ---------------------------------------------------------------------------
describe('runContingency — result structure', () => {
  it('returns baseCase, contingencies, and summary', () => {
    const result = runContingency({ buses: [], branches: [] });
    assert.ok('baseCase'     in result, 'missing baseCase');
    assert.ok('contingencies' in result, 'missing contingencies');
    assert.ok('summary'      in result, 'missing summary');
  });

  it('summary contains totalBranches, criticalContingencies, totalViolations', () => {
    const { summary } = runContingency({ buses: [], branches: [] });
    assert.ok('totalBranches'         in summary);
    assert.ok('criticalContingencies' in summary);
    assert.ok('totalViolations'       in summary);
  });

  it('empty model produces 0 contingencies', () => {
    const { contingencies, summary } = runContingency({ buses: [], branches: [] });
    assert.strictEqual(contingencies.length, 0);
    assert.strictEqual(summary.totalBranches, 0);
    assert.strictEqual(summary.criticalContingencies, 0);
    assert.strictEqual(summary.totalViolations, 0);
  });
});

// ---------------------------------------------------------------------------
describe('runContingency — branch enumeration', () => {
  it('one explicit branch → one contingency entry', () => {
    const { contingencies, summary } = runContingency(twobusBranchModel());
    assert.strictEqual(contingencies.length, 1);
    assert.strictEqual(summary.totalBranches, 1);
  });

  it('each contingency entry has required keys', () => {
    const { contingencies } = runContingency(twobusBranchModel());
    const c = contingencies[0];
    assert.ok('branchId'   in c, 'missing branchId');
    assert.ok('branchName' in c, 'missing branchName');
    assert.ok('branchType' in c, 'missing branchType');
    assert.ok('converged'  in c, 'missing converged');
    assert.ok('violations' in c, 'missing violations');
    assert.ok('critical'   in c, 'missing critical');
  });

  it('branchId matches the removed branch', () => {
    const { contingencies } = runContingency(twobusBranchModel());
    assert.strictEqual(contingencies[0].branchId, 'L1');
  });

  it('violations is an array', () => {
    const { contingencies } = runContingency(twobusBranchModel());
    assert.ok(Array.isArray(contingencies[0].violations));
  });

  it('critical is true when violations > 0', () => {
    const { contingencies } = runContingency(twobusBranchModel());
    const c = contingencies[0];
    assert.strictEqual(c.critical, c.violations.length > 0);
  });

  it('three explicit branches → three contingencies', () => {
    const model = {
      buses: [],
      branches: [
        { id: 'A', name: 'Branch A', type: 'line' },
        { id: 'B', name: 'Branch B', type: 'line' },
        { id: 'C', name: 'Branch C', type: 'cable' },
      ],
    };
    const { summary } = runContingency(model);
    assert.strictEqual(summary.totalBranches, 3);
  });
});

// ---------------------------------------------------------------------------
describe('runContingency — bus-connection branch fallback', () => {
  it('enumerates branches from bus.connections when branches array is absent', () => {
    // If no top-level branches, contingency collects from bus.connections
    const model = {
      buses: [
        {
          id: 'B1', type: 'bus', Vm: 1.0, Va: 0,
          connections: [
            { componentId: 'L1', componentType: 'line' },
            { componentId: 'L2', componentType: 'cable' },
          ]
        },
      ],
      branches: [],
    };
    const { summary } = runContingency(model);
    assert.strictEqual(summary.totalBranches, 2);
  });

  it('deduplicates branches referenced by multiple buses', () => {
    const model = {
      buses: [
        { id: 'B1', type: 'bus', Vm: 1.0, Va: 0, connections: [{ componentId: 'L1' }] },
        { id: 'B2', type: 'bus', Vm: 1.0, Va: 0, connections: [{ componentId: 'L1' }] },
      ],
      branches: [],
    };
    const { summary } = runContingency(model);
    // L1 is referenced by both buses but should be counted once
    assert.strictEqual(summary.totalBranches, 1);
  });
});

// ---------------------------------------------------------------------------
describe('runContingency — custom voltage limits', () => {
  it('accepts custom voltageMinPu and voltageMaxPu options', () => {
    // Should not throw; result structure is unchanged
    const result = runContingency(
      { buses: [], branches: [] },
      { voltageMinPu: 0.90, voltageMaxPu: 1.10 }
    );
    assert.ok('summary' in result);
  });

  it('accepts custom baseMVA option', () => {
    const result = runContingency(
      { buses: [], branches: [] },
      { baseMVA: 10 }
    );
    assert.ok('summary' in result);
  });
});

// ---------------------------------------------------------------------------
describe('runContingency — summary counts', () => {
  it('criticalContingencies equals count of contingencies with violations', () => {
    const { contingencies, summary } = runContingency(twobusBranchModel());
    const expectedCritical = contingencies.filter(c => c.critical).length;
    assert.strictEqual(summary.criticalContingencies, expectedCritical);
  });

  it('totalViolations equals sum of violations across all contingencies', () => {
    const { contingencies, summary } = runContingency(twobusBranchModel());
    const expectedTotal = contingencies.reduce((s, c) => s + c.violations.length, 0);
    assert.strictEqual(summary.totalViolations, expectedTotal);
  });
});

// ---------------------------------------------------------------------------
describe('runContingency — transient stability coupling', () => {
  it('transientStability field present on every contingency entry', () => {
    const { contingencies } = runContingency(twobusBranchModel());
    assert.ok(contingencies.length > 0, 'expected at least one contingency');
    assert.ok('transientStability' in contingencies[0], 'missing transientStability field');
  });

  it('transientStability.checked is false by default (opt-in)', () => {
    const { contingencies } = runContingency(twobusBranchModel());
    assert.strictEqual(contingencies[0].transientStability.checked, false);
  });

  it('summary.transientlyUnstable exists and is 0 when check disabled', () => {
    const { summary } = runContingency(twobusBranchModel());
    assert.ok('transientlyUnstable' in summary, 'missing transientlyUnstable in summary');
    assert.strictEqual(summary.transientlyUnstable, 0);
  });

  it('summary.transientlyUnstable exists on empty model', () => {
    const { summary } = runContingency({ buses: [], branches: [] });
    assert.ok('transientlyUnstable' in summary);
    assert.strictEqual(summary.transientlyUnstable, 0);
  });

  it('with checkTransientStability:true and no generator buses, checked remains false', () => {
    // twobusBranchModel has no Pg on buses — no generators found
    const { contingencies } = runContingency(twobusBranchModel(), { checkTransientStability: true });
    assert.strictEqual(contingencies[0].transientStability.checked, false);
  });

  it('with checkTransientStability:true and a generator bus, checked is true', () => {
    const model = {
      buses: [
        { id: 'G1', label: 'Gen Bus', Vm: 1.02, Va: 0, Pg: 50, connections: [] },
        { id: 'B2', label: 'Load Bus', Vm: 1.0,  Va: 0, connections: [] },
      ],
      branches: [{ id: 'L1', name: 'Line 1', type: 'line' }],
    };
    const { contingencies } = runContingency(model, {
      checkTransientStability: true,
      generatorInertiaH: 5.0,
      baseMVA: 100,
    });
    assert.strictEqual(contingencies[0].transientStability.checked, true);
  });

  it('transientStability result has stable and deltaMax_deg fields when checked', () => {
    const model = {
      buses: [
        { id: 'G1', label: 'Gen Bus', Vm: 1.0, Va: 0, Pg: 50, connections: [] },
        { id: 'B2', label: 'Load Bus', Vm: 1.0, Va: 0, connections: [] },
      ],
      branches: [{ id: 'L1', name: 'Line 1', type: 'line' }],
    };
    const { contingencies } = runContingency(model, { checkTransientStability: true });
    const ts = contingencies[0].transientStability;
    assert.ok('stable' in ts, 'missing stable field');
    assert.ok('deltaMax_deg' in ts, 'missing deltaMax_deg field');
    assert.ok('cct_s' in ts, 'missing cct_s field');
  });

  it('stable is boolean when checked', () => {
    const model = {
      buses: [
        { id: 'G1', label: 'Gen Bus', Vm: 1.0, Va: 0, Pg: 30, connections: [] },
        { id: 'B2', label: 'Load Bus', Vm: 1.0, Va: 0, connections: [] },
      ],
      branches: [{ id: 'L1', name: 'Line 1', type: 'line' }],
    };
    const { contingencies } = runContingency(model, { checkTransientStability: true });
    const ts = contingencies[0].transientStability;
    assert.strictEqual(typeof ts.stable, 'boolean');
  });

  it('transientlyUnstable increments when generator is unstable', () => {
    // Use a very long clearing time to force instability
    const model = {
      buses: [
        { id: 'G1', label: 'Gen Bus', Vm: 1.0, Va: 0, Pg: 90, connections: [] },
        { id: 'B2', label: 'Load Bus', Vm: 1.0, Va: 0, connections: [] },
      ],
      branches: [{ id: 'L1', name: 'Line 1', type: 'line' }],
    };
    const { contingencies, summary } = runContingency(model, {
      checkTransientStability: true,
      faultClearingTime_s: 0.9,  // very slow clearing — likely unstable
      generatorInertiaH: 2.0,
    });
    const ts = contingencies[0].transientStability;
    assert.strictEqual(summary.transientlyUnstable, ts.stable === false ? 1 : 0);
  });
});

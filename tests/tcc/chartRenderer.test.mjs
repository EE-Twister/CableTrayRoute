import assert from 'node:assert/strict';
import { renderTccChart } from '../../analysis/tcc/chartRenderer.mjs';

console.log('TCC chart renderer');

{
  const state = {
    activeCoordMarkerDrawer: () => {},
    activeCurvesUpdater: () => {},
    activeEquipmentConstraintChecks: [{ id: 'old-check' }],
    activeEquipmentOverlays: [{ id: 'old-overlay' }],
    activeLegendFocusKey: 'old-focus',
    activePlotted: [{ id: 'old-plot' }],
    annotationContext: { id: 'old-annotation' },
    lastCoordState: { id: 'old-coordination' }
  };
  const statuses = [];
  const measurements = [];
  let hydratedIds;
  let clearedPending = 0;
  await renderTccChart({
    state,
    selectedDeviceIds: () => [],
    startPerformanceMeasurement: () => result => measurements.push(result),
    updateCoordinationStatus: (...args) => statuses.push(args),
    hydrateProtectiveDevices: async ids => { hydratedIds = ids; },
    deviceMap: new Map(),
    contextMenu: { hide() {} },
    clearPinnedChartDetail() {},
    chart: {
      selectAll: () => ({ remove() {} }),
      classed() {}
    },
    violationDiv: { textContent: 'old' },
    setPlotAvailability() {},
    exportCtiBtn: { classList: { add() {} } },
    renderEquipmentMetrics() {},
    getActiveComponentId: () => null,
    clearPlotRefreshPending: () => { clearedPending += 1; }
  });

  assert.deepEqual(hydratedIds, []);
  assert.deepEqual(state.activeEquipmentOverlays, []);
  assert.deepEqual(state.activeEquipmentConstraintChecks, []);
  assert.equal(state.activeLegendFocusKey, null);
  assert.equal(state.annotationContext, null);
  assert.equal(state.lastCoordState, null);
  assert.equal(clearedPending, 1);
  assert.deepEqual(measurements, [{ plottedCount: 0 }]);
  assert.deepEqual(statuses.at(-1), ['No devices selected. Choose devices to update the plot.', 'warning']);
  console.log('  ✓ preserves empty-selection status, cleanup, measurement, and published renderer state');
}

{
  const state = {};
  await assert.rejects(() => renderTccChart({
    state,
    selectedDeviceIds: () => [],
    startPerformanceMeasurement: () => () => {},
    updateCoordinationStatus() {},
    hydrateProtectiveDevices: async () => {},
    deviceMap: new Map(),
    contextMenu: { hide() { throw new Error('render failed'); } }
  }), /render failed/);
  assert.equal(state.activeLegendFocusKey, undefined);
  console.log('  ✓ publishes state through the renderer boundary even when rendering throws');
}

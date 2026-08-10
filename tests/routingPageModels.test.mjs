import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    buildRoutingReadiness,
    getDuplicateRacewayIds,
    getRacewayGroupWarnings,
    getTrayFillWarnings,
    hasValidRouteGeometry
} from '../src/routing/routingReadinessModel.mjs';
import {
    getSampleCables,
    getSampleDuctbanks,
    getSampleRiserConduits,
    getSampleTrays,
    ROUTE_PRESETS
} from '../src/routing/routingSamples.mjs';
import {
    aggregateRouteSegments,
    getRouteVisualizationMetrics,
    getTrayUtilizationPercent,
    getUtilizationHeatColor,
    groupRouteEndpoints,
    ROUTE_VIEW_PRESETS
} from '../src/routing/routeVisualizationModel.mjs';

const tray = (id = 'TR-1', overrides = {}) => ({
    tray_id: id,
    start_x: 0,
    start_y: 0,
    start_z: 10,
    end_x: 20,
    end_y: 0,
    end_z: 10,
    width: 12,
    height: 4,
    current_fill: 10,
    allowed_cable_group: 'LV',
    ...overrides
});

const cable = (overrides = {}) => ({
    name: 'C-1',
    start_tag: 'MCC-1',
    end_tag: 'LOAD-1',
    conductor_size: '#12 AWG',
    length: 100,
    raceway_ids: ['TR-1'],
    start: [0, 0, 10],
    end: [20, 0, 10],
    allowed_cable_group: 'LV',
    ...overrides
});

describe('routing page readiness model', () => {
    it('preserves the ready-state contract for complete canonical project data', () => {
        const result = buildRoutingReadiness({ trayData: [tray()], cableList: [cable()] }, { fillLimitPercent: 40 });

        assert.equal(result.ready, true);
        assert.deepEqual(result.blocking, []);
        assert.deepEqual(result.warnings, []);
        assert.equal(result.diagnostics.coordinateReady, 1);
        assert.equal(result.diagnostics.cableSummary.routingReady, 1);
        assert.equal(result.routableSegments.length, 1);
    });

    it('retains duplicate, geometry, assignment, group, fill, and source-geometry diagnostics', () => {
        const result = buildRoutingReadiness({
            trayData: [
                tray('TR-1', { current_fill: 30 }),
                tray('TR-1', { end_x: '' })
            ],
            cableList: [cable({ raceway_ids: ['MISSING'], allowed_cable_group: 'HV' })],
            geometryWarnings: { ductbanks: ['missing outline'], conduits: ['missing path'] }
        }, { fillLimitPercent: 40 });

        assert.deepEqual(result.duplicateIds, ['TR-1']);
        assert.equal(result.missingGeometry.length, 1);
        assert.deepEqual(result.groupWarnings, ['HV']);
        assert.equal(result.overLimit.length, 1);
        assert.equal(result.geometryWarnings.length, 2);
        assert.equal(result.diagnostics.invalidAssignedRefs.length, 1);
        assert.equal(result.ready, false);
        assert.ok(result.blocking.some(message => message.includes('duplicate raceway ID')));
        assert.ok(result.blocking.some(message => message.includes('do not match the Raceway Schedule')));
        assert.ok(result.warnings.some(message => message.includes('No matching raceway group for HV')));
    });

    it('keeps helper edge cases deterministic', () => {
        assert.deepEqual(getDuplicateRacewayIds([{ tray_id: 'A' }, { tray_id: 'A' }, { tray_id: '' }]), ['A']);
        assert.equal(hasValidRouteGeometry(tray()), true);
        assert.equal(hasValidRouteGeometry(tray('TR-2', { width: 0 })), false);
        assert.deepEqual(getRacewayGroupWarnings([tray()], [cable({ allowed_cable_group: 'HV' })]), ['HV']);
        assert.deepEqual(getRacewayGroupWarnings([tray('OPEN', { allowed_cable_group: '' })], [cable()]), []);
        assert.equal(getTrayFillWarnings([tray('FULL', { width: 10, height: 2, current_fill: 9 })], 40).length, 1);
    });
});

describe('routing samples and presets', () => {
    it('preserves the representative sample network contract', () => {
        const trays = getSampleTrays();
        const ductbanks = getSampleDuctbanks();
        const risers = getSampleRiserConduits();
        const cables = getSampleCables();

        assert.equal(trays.length, 27);
        assert.deepEqual([...new Set(trays.map(row => row.allowed_cable_group))].sort(), ['COMMUNICATION', 'HV', 'INSTRUMENT', 'LV']);
        assert.equal(ductbanks.ductbanks.length, 2);
        assert.equal(ductbanks.ductbanks.flatMap(row => row.conduits).length, 8);
        assert.equal(risers.length, 2);
        assert.equal(cables.length, 30);
        assert.deepEqual(cables[0].start, [-60, -12, -8]);
        assert.equal(cables[3].allowed_cable_group, 'COMMUNICATION');
        assert.deepEqual(cables[10].start, cables[0].start);
        assert.deepEqual(cables[17].start, cables[2].start);
    });

    it('returns fresh sample structures and keeps preset values unchanged', () => {
        const first = getSampleDuctbanks();
        first.ductbanks[0].outline[0][0] = 999;
        first.ductbanks[0].conduits[0].path[0][0] = 888;
        const second = getSampleDuctbanks();

        assert.equal(second.ductbanks[0].outline[0][0], -60);
        assert.equal(second.ductbanks[0].conduits[0].path[0][0], -60);
        assert.equal(ROUTE_PRESETS.conservative.fillLimit, 40);
        assert.equal(ROUTE_PRESETS['field-allowed'].maxFieldEdge, 1500);
        assert.equal(ROUTE_VIEW_PRESETS.plan.projection, 'orthographic');
    });
});

describe('routing visualization model', () => {
    it('aggregates reversed shared segments without losing route or raceway identity', () => {
        const routes = [
            { label: 'C-1', segments: [{ type: 'tray', start: [0, 0, 0], end: [10, 0, 0], tray_id: 'TR-1' }] },
            { label: 'C-2', segments: [{ type: 'tray', start: [10, 0, 0], end: [0, 0, 0], raceway_id: 'TR-1' }] },
            { label: 'C-3', segments: [{ type: 'field', start: [0, 0, 0], end: [0, 5, 0] }] }
        ];
        const aggregated = aggregateRouteSegments(routes);

        assert.equal(aggregated.length, 2);
        assert.deepEqual(aggregated[0].routeIndices, [0, 1]);
        assert.deepEqual(aggregated[0].cableLabels, ['C-1', 'C-2']);
        assert.deepEqual(aggregated[0].racewayIds, ['TR-1']);
        assert.equal(aggregated[1].type, 'field');
    });

    it('preserves visualization metrics, utilization colors, and endpoint clustering', () => {
        const metrics = getRouteVisualizationMetrics({ segments: [
            { type: 'tray', start: [0, 0, 0], end: [3, 4, 0] },
            { type: 'field', length: 7 }
        ] });
        assert.deepEqual(metrics, { segments: 2, total: 12, field: 7 });
        assert.equal(getTrayUtilizationPercent({ slotFills: [30, 20], maxFill: 50, numSlots: 2 }), 50);
        assert.equal(getTrayUtilizationPercent({ current_fill: 200, maxFill: 100 }), 100);
        assert.equal(getUtilizationHeatColor(49.9), '#14b8a6');
        assert.equal(getUtilizationHeatColor(50), '#f59e0b');
        assert.equal(getUtilizationHeatColor(80), '#ef4444');

        const groups = groupRouteEndpoints([
            { label: 'C-1', startPoint: [0, 0, 0], startTag: 'MCC-1' },
            { label: 'C-2', startPoint: [6, 0, 0], startTag: 'MCC-2' },
            { label: 'C-3', startPoint: [20, 0, 0], startTag: 'MCC-3' }
        ], 'Start');
        assert.equal(groups.length, 2);
        assert.deepEqual(groups[0].point, [3, 0, 0]);
        assert.deepEqual(groups[0].routeIndices, [0, 1]);
        assert.deepEqual(groups[0].tags, ['MCC-1', 'MCC-2']);
    });
});

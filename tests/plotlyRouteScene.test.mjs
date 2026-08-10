import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPlotlyRouteScene } from '../src/routing/plotlyRouteScene.mjs';
import { ROUTE_VIEW_PRESETS } from '../src/routing/routeVisualizationModel.mjs';

const theme = {
    surface: '#f4f7fb',
    text: '#334155',
    grid: 'rgba(100, 116, 139, 0.2)',
    axis: '#94a3b8',
    hover: '#ffffff',
    floor: '#dbeafe'
};

const trays = [
    {
        tray_id: 'TR-1', raceway_type: 'tray',
        start_x: 0, start_y: 0, start_z: 10,
        end_x: 100, end_y: 0, end_z: 10,
        width: 12, height: 4, current_fill: 20, maxFill: 40
    },
    {
        tray_id: 'DB-1', raceway_type: 'ductbank',
        start_x: 0, start_y: 20, start_z: -3,
        end_x: 100, end_y: 20, end_z: -3,
        width: 30, height: 24
    }
];

const routes = [
    {
        label: 'C-1', startPoint: [-5, 0, 10], endPoint: [105, 0, 10], startTag: 'MCC-1', endTag: 'LOAD-1',
        segments: [
            { type: 'tray', tray_id: 'TR-1', start: [0, 0, 10], end: [100, 0, 10] },
            { type: 'field', start: [100, 0, 10], end: [105, 0, 10] }
        ]
    },
    {
        label: 'C-2', startPoint: [-4, 0, 10], endPoint: [106, 0, 10], startTag: 'MCC-1', endTag: 'LOAD-2',
        segments: [
            { type: 'tray', raceway_id: 'TR-1', start: [100, 0, 10], end: [0, 0, 10] },
            { type: 'field', start: [100, 0, 10], end: [105, 0, 10] }
        ]
    }
];

describe('Plotly route scene builder', () => {
    it('preserves raceway, shared-corridor, endpoint, and layout trace contracts', () => {
        const scene = buildPlotlyRouteScene({
            trays,
            routes,
            title: 'Review',
            theme,
            view: ROUTE_VIEW_PRESETS.isometric,
            ductbankVisible: false,
            darkMode: true
        });

        assert.equal(scene.layout.uirevision, 'optimal-route-Review');
        assert.equal(scene.layout.scene.camera.projection.type, 'perspective');
        assert.equal(scene.layout.scene.xaxis.title.text, 'X');
        assert.ok(scene.traces.some(trace => trace.name === '__facility_floor__'));
        assert.ok(scene.traces.some(trace => trace.name === '__facility_grid__'));
        assert.equal(scene.traces.filter(trace => trace.type === 'mesh3d').length, 2);
        assert.equal(scene.ductbankTraceIndices.length, 2);
        scene.ductbankTraceIndices.forEach(index => assert.equal(scene.traces[index].visible, false));

        const shared = scene.traces.find(trace => trace.meta?.kind === 'route-corridor' && trace.meta.racewayIds.includes('TR-1'));
        assert.deepEqual(shared.meta.routeIndices, [0, 1]);
        assert.deepEqual(shared.meta.cableLabels, ['C-1', 'C-2']);
        const halo = scene.traces.find(trace => trace.name === '__corridor_halo__');
        assert.equal(halo.line.color, '#020617');
        assert.ok(scene.traces.some(trace => trace.name === '2 cable field jump'));

        const startEndpoints = scene.traces.find(trace => trace.meta?.kind === 'route-endpoint-cluster' && trace.meta.endpoint === 'Start');
        assert.deepEqual(startEndpoints.customdata[0][0], [0, 1]);
        assert.equal(startEndpoints.text[0], 'MCC-1');
    });

    it('applies heatmap and visibility options without DOM or Plotly globals', () => {
        const scene = buildPlotlyRouteScene({
            trays,
            routes,
            theme,
            view: ROUTE_VIEW_PRESETS.plan,
            heatmapEnabled: true,
            labelsVisible: false,
            fieldConnectionsVisible: false
        });

        assert.equal(scene.layout.scene.camera.projection.type, 'orthographic');
        assert.equal(scene.layout.margin.r, 54);
        assert.equal(scene.traces.some(trace => trace.meta?.kind === 'labels'), false);
        assert.equal(scene.traces.some(trace => trace.name?.includes('field jump')), false);
        assert.ok(scene.traces.some(trace => trace.marker?.colorbar?.title?.text === 'Fill %'));
        const trayMesh = scene.traces.find(trace => trace.type === 'mesh3d' && trace.name === 'TR-1');
        assert.equal(trayMesh.opacity, 0.8);
        assert.equal(trayMesh.color, '#f59e0b');
        assert.doesNotThrow(() => structuredClone(scene));
    });
});

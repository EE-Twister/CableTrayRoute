import {
    aggregateRouteSegments,
    getTrayUtilizationPercent,
    getUtilizationHeatColor,
    groupRouteEndpoints,
    ROUTE_COLORS
} from './routeVisualizationModel.mjs';

const traySegments = tray => {
    const start = [tray.start_x, tray.start_y, tray.start_z];
    const end = [tray.end_x, tray.end_y, tray.end_z];
    const segments = [];
    let current = start.slice();
    if (current[0] !== end[0]) {
        const next = [end[0], current[1], current[2]];
        segments.push([current, next]);
        current = next;
    }
    if (current[1] !== end[1]) {
        const next = [current[0], end[1], current[2]];
        segments.push([current, next]);
        current = next;
    }
    if (current[2] !== end[2]) {
        const next = [current[0], current[1], end[2]];
        segments.push([current, next]);
    }
    if (segments.length === 0) segments.push([start, end]);
    return segments;
};

const meshForSegment = (start, end, tray, { heatmapEnabled, ductbankVisible }) => {
    const actualWidth = (Number(tray.width) || 6) / 12;
    const actualHeight = (Number(tray.height) || 4) / 12;
    const width = Math.max(actualWidth, 1.25);
    const height = Math.max(actualHeight, 0.65);
    const [sx, sy, sz] = start;
    const [ex, ey, ez] = end;
    let vertices;
    if (sx !== ex) {
        const y1 = sy - width / 2, y2 = sy + width / 2;
        const z1 = sz - height / 2, z2 = sz + height / 2;
        vertices = [[sx,y1,z1],[sx,y2,z1],[sx,y2,z2],[sx,y1,z2],[ex,y1,z1],[ex,y2,z1],[ex,y2,z2],[ex,y1,z2]];
    } else if (sy !== ey) {
        const x1 = sx - width / 2, x2 = sx + width / 2;
        const z1 = sz - height / 2, z2 = sz + height / 2;
        vertices = [[x1,sy,z1],[x2,sy,z1],[x2,sy,z2],[x1,sy,z2],[x1,ey,z1],[x2,ey,z1],[x2,ey,z2],[x1,ey,z2]];
    } else {
        const x1 = sx - width / 2, x2 = sx + width / 2;
        const y1 = sy - height / 2, y2 = sy + height / 2;
        vertices = [[x1,y1,sz],[x2,y1,sz],[x2,y2,sz],[x1,y2,sz],[x1,y1,ez],[x2,y1,ez],[x2,y2,ez],[x1,y2,ez]];
    }
    const racewayType = tray.raceway_type || 'tray';
    const utilization = getTrayUtilizationPercent(tray);
    const color = heatmapEnabled
        ? getUtilizationHeatColor(utilization)
        : racewayType === 'ductbank'
            ? ROUTE_COLORS.ductbank
            : racewayType === 'conduit'
                ? ROUTE_COLORS.conduit
                : ROUTE_COLORS.raceway;
    return {
        type: 'mesh3d',
        x: vertices.map(vertex => vertex[0]),
        y: vertices.map(vertex => vertex[1]),
        z: vertices.map(vertex => vertex[2]),
        i: [0,0,4,4,3,3,0,0,0,0,1,1],
        j: [1,2,5,6,2,6,1,5,3,7,2,6],
        k: [2,3,6,7,6,7,5,4,7,4,6,5],
        color,
        opacity: heatmapEnabled ? 0.8 : 0.42,
        flatshading: true,
        lighting: { ambient: 0.8, diffuse: 0.55, specular: 0.05, roughness: 0.9 },
        name: tray.tray_id,
        meta: { kind: 'raceway', trayId: tray.tray_id },
        customdata: [[racewayType, tray.width, tray.height, utilization]],
        hovertemplate: `<b>${tray.tray_id}</b><br>${racewayType}<br>${tray.width || '—'} in × ${tray.height || '—'} in<br>Utilization: ${utilization.toFixed(1)}%<extra></extra>`,
        visible: racewayType === 'ductbank' ? ductbankVisible : true,
        showlegend: false
    };
};

const addFacilityFloor = (traces, geometryPoints, theme) => {
    if (!geometryPoints.length) return 0;
    const coordinates = index => geometryPoints.map(point => Number(point[index])).filter(Number.isFinite);
    const xs = coordinates(0), ys = coordinates(1), zs = coordinates(2);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const minZ = Math.min(...zs);
    const xPadding = Math.max((maxX - minX) * 0.08, 6);
    const yPadding = Math.max((maxY - minY) * 0.08, 6);
    const floorZ = minZ - Math.max((Math.max(...zs) - minZ) * 0.04, 2);
    traces.push({
        type: 'surface',
        x: [minX - xPadding, maxX + xPadding],
        y: [minY - yPadding, maxY + yPadding],
        z: [[floorZ, floorZ], [floorZ, floorZ]],
        surfacecolor: [[0, 0], [0, 0]],
        colorscale: [[0, theme.floor], [1, theme.floor]],
        opacity: 0.34,
        showscale: false,
        hoverinfo: 'skip',
        name: '__facility_floor__',
        showlegend: false
    });
    const floorGrid = { x: [], y: [], z: [] };
    const gridDivisions = 8;
    for (let index = 0; index <= gridDivisions; index += 1) {
        const x = minX - xPadding + ((maxX - minX + (2 * xPadding)) * index / gridDivisions);
        const y = minY - yPadding + ((maxY - minY + (2 * yPadding)) * index / gridDivisions);
        floorGrid.x.push(x, x, null, minX - xPadding, maxX + xPadding, null);
        floorGrid.y.push(minY - yPadding, maxY + yPadding, null, y, y, null);
        floorGrid.z.push(floorZ, floorZ, null, floorZ, floorZ, null);
    }
    traces.push({
        ...floorGrid,
        type: 'scatter3d', mode: 'lines',
        line: { color: theme.axis, width: 1 }, opacity: 0.24,
        hoverinfo: 'skip', showlegend: false, name: '__facility_grid__'
    });
    return floorZ;
};

const endpointTrace = (groups, color, endpoint, { labelsVisible, theme }) => ({
    type: 'scatter3d', mode: labelsVisible ? 'markers+text' : 'markers',
    x: groups.map(group => group.point[0]),
    y: groups.map(group => group.point[1]),
    z: groups.map(group => group.point[2]),
    text: groups.map(group => group.tags.join(', ') || `${group.labels.length} ${endpoint.toLowerCase()}`),
    textposition: 'top center',
    textfont: { size: 10, color: theme.text },
    marker: {
        color,
        size: groups.map(group => 7 + Math.min(6, Math.log2(group.routeIndices.length + 1) * 2)),
        symbol: endpoint === 'Start' ? 'circle' : 'diamond',
        opacity: 0.9,
        line: { color: theme.hover, width: 2 }
    },
    customdata: groups.map(group => [group.routeIndices, group.routeIndices.length, group.labels.join(', ')]),
    meta: { kind: 'route-endpoint-cluster', endpoint },
    hovertemplate: `<b>%{text}</b><br>%{customdata[1]} cable${endpoint === 'Start' ? ' start' : ' end'}<br>%{customdata[2]}<extra>Click to inspect</extra>`,
    showlegend: false
});

export function buildPlotlyRouteScene({
    trays = [],
    routes = [],
    title = 'Optimal routes',
    theme,
    view,
    heatmapEnabled = false,
    ductbankVisible = true,
    labelsVisible = true,
    fieldConnectionsVisible = true,
    darkMode = false
} = {}) {
    const traces = [];
    const ductbankTraceIndices = [];
    const geometryPoints = [];
    trays.forEach(tray => geometryPoints.push(
        [tray.start_x, tray.start_y, tray.start_z],
        [tray.end_x, tray.end_y, tray.end_z]
    ));
    routes.forEach(route => (route.segments || []).forEach(segment => {
        if (Array.isArray(segment.start)) geometryPoints.push(segment.start);
        if (Array.isArray(segment.end)) geometryPoints.push(segment.end);
    }));
    const facilityFloorZ = addFacilityFloor(traces, geometryPoints, theme);

    const labelX = [], labelY = [], labelZ = [], labelText = [];
    trays.forEach(tray => {
        const segments = traySegments(tray);
        segments.map(segment => meshForSegment(segment[0], segment[1], tray, { heatmapEnabled, ductbankVisible })).forEach(trace => {
            const traceIndex = traces.length;
            traces.push(trace);
            if (tray.raceway_type === 'ductbank') ductbankTraceIndices.push(traceIndex);
        });
        const centerline = { x: [], y: [], z: [] };
        segments.forEach(segment => {
            centerline.x.push(segment[0][0], segment[1][0], null);
            centerline.y.push(segment[0][1], segment[1][1], null);
            centerline.z.push(segment[0][2], segment[1][2], null);
        });
        const racewayType = tray.raceway_type || 'tray';
        const centerlineIndex = traces.length;
        traces.push({
            ...centerline,
            type: 'scatter3d', mode: 'lines',
            line: {
                color: racewayType === 'ductbank' ? '#795234' : racewayType === 'conduit' ? '#1e293b' : '#475569',
                width: racewayType === 'ductbank' ? 7 : 5
            },
            opacity: heatmapEnabled ? 0.45 : 0.62,
            name: tray.tray_id,
            meta: { kind: 'raceway', trayId: tray.tray_id },
            hovertemplate: `<b>${tray.tray_id}</b><br>${racewayType}<br>Click to inspect<extra></extra>`,
            visible: racewayType === 'ductbank' ? ductbankVisible : true,
            showlegend: false
        });
        if (racewayType === 'ductbank') ductbankTraceIndices.push(centerlineIndex);
        labelX.push((tray.start_x + tray.end_x) / 2);
        labelY.push((tray.start_y + tray.end_y) / 2);
        labelZ.push((tray.start_z + tray.end_z) / 2 + 0.75);
        labelText.push(tray.tray_id);
    });
    if (labelsVisible && labelX.length) {
        traces.push({
            type: 'scatter3d', mode: 'text', x: labelX, y: labelY, z: labelZ,
            text: labelText, textfont: { size: 10, color: theme.text },
            showlegend: false, hoverinfo: 'skip', meta: { kind: 'labels' }
        });
    }

    const aggregatedSegments = aggregateRouteSegments(routes);
    aggregatedSegments.filter(segment => segment.type === 'tray').forEach(segment => {
        const cableCount = segment.routeIndices.length;
        const corridorWidth = 4 + Math.min(9, Math.log2(cableCount + 1) * 2.4);
        const corridorColor = cableCount >= 12 ? '#1d4ed8' : cableCount >= 5 ? '#2563eb' : '#3b82f6';
        const cablePreview = segment.cableLabels.slice(0, 5).join(', ');
        const moreCables = Math.max(0, cableCount - 5);
        const racewayText = segment.racewayIds.length ? `<br>Raceway: ${segment.racewayIds.join(', ')}` : '';
        const hover = `<b>${cableCount} cable${cableCount === 1 ? '' : 's'} in this corridor</b>${racewayText}<br>${cablePreview}${moreCables ? ` +${moreCables} more` : ''}<extra>Click to inspect corridor</extra>`;
        const linePoints = {
            x: [segment.start[0], segment.end[0]],
            y: [segment.start[1], segment.end[1]],
            z: [segment.start[2], segment.end[2]]
        };
        traces.push({
            ...linePoints, type: 'scatter3d', mode: 'lines',
            line: { color: darkMode ? '#020617' : '#ffffff', width: corridorWidth + 5 },
            opacity: 0.9, hoverinfo: 'skip', showlegend: false, name: '__corridor_halo__'
        });
        traces.push({
            ...linePoints, type: 'scatter3d', mode: 'lines',
            line: { color: corridorColor, width: corridorWidth },
            opacity: 0.96,
            name: `${cableCount} cable corridor`,
            showlegend: false,
            hovertemplate: hover,
            meta: {
                kind: 'route-corridor',
                start: segment.start,
                end: segment.end,
                routeIndices: segment.routeIndices,
                cableLabels: segment.cableLabels,
                racewayIds: segment.racewayIds
            }
        });
    });
    if (fieldConnectionsVisible) {
        aggregatedSegments.filter(segment => segment.type === 'field').forEach(segment => {
            const cableCount = segment.routeIndices.length;
            traces.push({
                x: [segment.start[0], segment.end[0]],
                y: [segment.start[1], segment.end[1]],
                z: [segment.start[2], segment.end[2]],
                type: 'scatter3d', mode: 'lines',
                line: { color: ROUTE_COLORS.field, width: 2 + Math.min(4, Math.sqrt(cableCount)), dash: 'dash' },
                opacity: 0.58,
                name: `${cableCount} cable field jump`,
                showlegend: false,
                hovertemplate: `<b>Field jump</b><br>${cableCount} cable${cableCount === 1 ? '' : 's'}<extra>Click to inspect</extra>`,
                meta: {
                    kind: 'route-corridor', start: segment.start, end: segment.end,
                    routeIndices: segment.routeIndices, cableLabels: segment.cableLabels, racewayIds: []
                }
            });
        });
    }

    const endpointStemTrace = (groups, color) => {
        const points = { x: [], y: [], z: [] };
        groups.forEach(group => {
            points.x.push(group.point[0], group.point[0], null);
            points.y.push(group.point[1], group.point[1], null);
            points.z.push(facilityFloorZ, group.point[2], null);
        });
        return {
            ...points, type: 'scatter3d', mode: 'lines',
            line: { color, width: 2 }, opacity: 0.28,
            hoverinfo: 'skip', showlegend: false, name: '__endpoint_stems__'
        };
    };
    const startGroups = groupRouteEndpoints(routes, 'Start');
    const endGroups = groupRouteEndpoints(routes, 'End');
    if (startGroups.length) {
        traces.push(endpointStemTrace(startGroups, ROUTE_COLORS.start));
        traces.push(endpointTrace(startGroups, ROUTE_COLORS.start, 'Start', { labelsVisible, theme }));
    }
    if (endGroups.length) {
        traces.push(endpointStemTrace(endGroups, ROUTE_COLORS.end));
        traces.push(endpointTrace(endGroups, ROUTE_COLORS.end, 'End', { labelsVisible, theme }));
    }
    if (heatmapEnabled) {
        traces.push({
            type: 'scatter3d', mode: 'markers', x: [null], y: [null], z: [null],
            marker: {
                size: 0, color: [0], cmin: 0, cmax: 100,
                colorscale: [[0, '#14b8a6'], [0.5, '#f59e0b'], [1, '#ef4444']],
                colorbar: { title: { text: 'Fill %', side: 'right' }, thickness: 12, len: 0.55, x: 0.99 }
            },
            hoverinfo: 'skip', showlegend: false
        });
    }

    const axis = titleText => ({
        title: { text: titleText, font: { size: 11 } },
        showbackground: false, showgrid: true, gridcolor: theme.grid,
        zeroline: false, showline: true, linecolor: theme.axis,
        ticks: '', color: theme.text, showspikes: false
    });
    const layout = {
        title: { text: '' }, autosize: true, showlegend: false,
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: 'Inter, ui-sans-serif, system-ui, sans-serif', color: theme.text },
        hoverlabel: { bgcolor: theme.hover, bordercolor: theme.axis, font: { color: theme.text } },
        margin: { l: 0, r: heatmapEnabled ? 54 : 0, t: 0, b: 0 },
        scene: {
            aspectmode: 'data', bgcolor: theme.surface,
            camera: { ...structuredClone(view.camera), projection: { type: view.projection } },
            xaxis: axis('X'), yaxis: axis('Y'), zaxis: axis('Elevation')
        },
        uirevision: `optimal-route-${title}`
    };
    return { traces, layout, ductbankTraceIndices };
}

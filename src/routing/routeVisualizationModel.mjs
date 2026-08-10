export const ROUTE_COLORS = {
    route: '#2563eb',
    field: '#f59e0b',
    selected: '#06b6d4',
    raceway: '#64748b',
    conduit: '#334155',
    ductbank: '#9a6b44',
    start: '#16a34a',
    end: '#7c3aed'
};

export const ROUTE_VIEW_PRESETS = {
    isometric: {
        camera: { up: { x: 0, y: 0, z: 1 }, eye: { x: 1.45, y: 1.45, z: 1.15 } },
        projection: 'perspective'
    },
    plan: {
        camera: { up: { x: 0, y: 1, z: 0 }, eye: { x: 0, y: 0, z: 2.5 } },
        projection: 'orthographic'
    },
    front: {
        camera: { up: { x: 0, y: 0, z: 1 }, eye: { x: 0, y: -2.5, z: 0.15 } },
        projection: 'orthographic'
    },
    right: {
        camera: { up: { x: 0, y: 0, z: 1 }, eye: { x: 2.5, y: 0, z: 0.15 } },
        projection: 'orthographic'
    }
};

export const ROUTE_PLOT_CONFIG = {
    responsive: true,
    scrollZoom: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['toImage', 'sendDataToCloud', 'lasso3d', 'select2d']
};

const segmentLength = segment => {
    const explicitLength = Number(segment?.length);
    if (Number.isFinite(explicitLength)) return explicitLength;
    if (!Array.isArray(segment?.start) || !Array.isArray(segment?.end)) return 0;
    return Math.hypot(
        Number(segment.end[0]) - Number(segment.start[0]),
        Number(segment.end[1]) - Number(segment.start[1]),
        Number(segment.end[2]) - Number(segment.start[2])
    );
};

export function getRouteVisualizationMetrics(route = {}) {
    const segments = route.route_segments || route.segments || [];
    const total = segments.reduce((sum, segment) => sum + segmentLength(segment), 0);
    const field = segments
        .filter(segment => segment.type !== 'tray')
        .reduce((sum, segment) => sum + segmentLength(segment), 0);
    return { segments: segments.length, total, field };
}

export function getTrayUtilizationPercent(tray = {}) {
    const totalFill = Array.isArray(tray.slotFills)
        ? tray.slotFills.reduce((sum, fill) => sum + (Number(fill) || 0), 0)
        : (Number(tray.current_fill) || 0);
    const totalMaximum = (Number(tray.maxFill) || 0) * (Number(tray.numSlots) || 1);
    return totalMaximum ? Math.max(0, Math.min(100, (totalFill / totalMaximum) * 100)) : 0;
}

export function getUtilizationHeatColor(percent) {
    if (percent < 50) return '#14b8a6';
    if (percent < 80) return '#f59e0b';
    return '#ef4444';
}

const routePointKey = point => point.map(value => (Number(value) || 0).toFixed(3)).join(',');

const routeSegmentKey = segment => {
    const endpoints = [routePointKey(segment.start), routePointKey(segment.end)].sort();
    return `${segment.type === 'tray' ? 'tray' : 'field'}|${endpoints.join('|')}`;
};

export function aggregateRouteSegments(routes = []) {
    const segmentMap = new Map();
    routes.forEach((route, routeIndex) => {
        (route.segments || []).forEach(segment => {
            if (!Array.isArray(segment.start) || !Array.isArray(segment.end)) return;
            const key = routeSegmentKey(segment);
            if (!segmentMap.has(key)) {
                segmentMap.set(key, {
                    type: segment.type === 'tray' ? 'tray' : 'field',
                    start: segment.start,
                    end: segment.end,
                    routeIndices: new Set(),
                    cableLabels: new Set(),
                    racewayIds: new Set()
                });
            }
            const aggregate = segmentMap.get(key);
            aggregate.routeIndices.add(routeIndex);
            aggregate.cableLabels.add(route.label || `Route ${routeIndex + 1}`);
            const racewayId = segment.tray_id || segment.raceway_id || segment.conduit_id;
            if (racewayId) aggregate.racewayIds.add(racewayId);
        });
    });
    return Array.from(segmentMap.values()).map(segment => ({
        ...segment,
        routeIndices: Array.from(segment.routeIndices),
        cableLabels: Array.from(segment.cableLabels),
        racewayIds: Array.from(segment.racewayIds)
    }));
}

export function groupRouteEndpoints(routes = [], endpoint = 'Start', clusterDistance = 7.5) {
    const groups = [];
    routes.forEach((route, routeIndex) => {
        const point = endpoint === 'Start' ? route.startPoint : route.endPoint;
        if (!Array.isArray(point)) return;
        let group = groups.find(candidate => Math.hypot(
            candidate.point[0] - point[0],
            candidate.point[1] - point[1],
            candidate.point[2] - point[2]
        ) <= clusterDistance);
        if (!group) {
            group = { point: point.slice(), points: [], routeIndices: [], labels: [], tags: [] };
            groups.push(group);
        }
        group.points.push(point);
        group.routeIndices.push(routeIndex);
        group.labels.push(route.label || `Route ${routeIndex + 1}`);
        const tag = endpoint === 'Start' ? route.startTag : route.endTag;
        if (tag && !group.tags.includes(tag)) group.tags.push(tag);
        group.point = [0, 1, 2].map(coordinate => (
            group.points.reduce((sum, candidate) => sum + Number(candidate[coordinate]), 0) / group.points.length
        ));
    });
    return groups;
}

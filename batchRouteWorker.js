importScripts('routeWorker.js');

let state = null;
let cancel = false;

function processFrom(index) {
    const { system, cables, results, allRoutes } = state;
    for (let i = index; i < cables.length; i++) {
        if (cancel) {
            state.index = i;
            state.pauseStart = performance.now();
            self.postMessage({ type: 'cancelled', completed: i, total: cables.length });
            return;
        }
        if (results[i]) {
            self.postMessage({ type: 'progress', completed: i + 1, total: cables.length });
            continue;
        }

        const cable = cables[i];
        const cableArea = Math.PI * (cable.diameter / 2) ** 2;
        const result = system.calculateRoute(
            cable.start,
            cable.end,
            cableArea,
            cable.allowed_cable_group,
            cable.manual_path || '',
            cable.raceway_ids || [],
            cable.id || cable.name || null
        );

        if (result.success) {
            system.updateTrayFill(result.tray_segments, cableArea);
            system.recordSharedFieldSegments(result.route_segments);
            allRoutes.push({
                label: cable.name,
                segments: result.route_segments,
                startPoint: cable.start,
                endPoint: cable.end,
                startTag: cable.start_tag,
                endTag: cable.end_tag,
                allowed_cable_group: cable.allowed_cable_group
            });
        }

        results[i] = result;
        state.index = i + 1;
        self.postMessage({ type: 'progress', completed: i + 1, total: cables.length });
    }

    const wallTime = performance.now() - state.startTime - (state.pausedDuration || 0);
    const finalUtilization = system.getTrayUtilization();
    const finalTrays = Array.from(system.trays.values()).map(t => ({ ...t }));
    self.postMessage({
        type: 'done',
        results,
        allRoutes,
        utilization: finalUtilization,
        finalTrays,
        wallTime
    });
    state = null;
}

self.onmessage = function(e) {
    const { type } = e.data;
    if (type === 'start') {
        const { trays, options, cables } = e.data;
        const system = new CableRoutingSystem(options);
        trays.forEach(t => system.addTraySegment(t));
        system.prepareBaseGraph();
        state = {
            system,
            cables,
            results: [],
            allRoutes: [],
            index: 0,
            startTime: performance.now(),
            pausedDuration: 0
        };
        cancel = false;
        cables.forEach((c, idx) => {
            if (c.locked && Array.isArray(c.route_segments) && c.route_segments.length) {
                const area = Math.PI * (c.diameter / 2) ** 2;
                const traySegs = c.route_segments.filter(seg => seg.tray_id).map(seg => seg.tray_id);
                system.updateTrayFill(traySegs, area);
                system.recordSharedFieldSegments(c.route_segments);
                const total = c.route_segments.reduce((s, seg) => s + (seg.length || 0), 0);
                const fieldLen = c.route_segments.filter(seg => seg.type === 'field').reduce((s, seg) => s + (seg.length || 0), 0);
                state.results[idx] = {
                    success: true,
                    total_length: total,
                    field_routed_length: fieldLen,
                    tray_segments: traySegs,
                    route_segments: c.route_segments,
                    manual: false,
                    manual_raceway: false,
                    exclusions: [],
                    mismatched_records: []
                };
                state.allRoutes.push({
                    label: c.name,
                    segments: c.route_segments,
                    startPoint: c.start,
                    endPoint: c.end,
                    startTag: c.start_tag,
                    endTag: c.end_tag,
                    allowed_cable_group: c.allowed_cable_group
                });
            }
        });
        processFrom(0);
    } else if (type === 'cancel') {
        if (state && !cancel) {
            cancel = true;
        }
    } else if (type === 'resume') {
        if (state && cancel) {
            cancel = false;
            state.pausedDuration += performance.now() - (state.pauseStart || performance.now());
            processFrom(state.index);
        }
    }
};


// Filename: app.js
// (This is an improved version that adds route segment consolidation)

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let state = {
        manualTrays: [],
        cableList: [],
        trayData: [],
        latestRouteData: [],
        sharedFieldRoutes: [],
    };

    // --- ELEMENT REFERENCES ---
    const elements = {
        fillLimitIn: document.getElementById('fill-limit'),
        fillLimitOut: document.getElementById('fill-limit-value'),
        calculateBtn: document.getElementById('calculate-route-btn'),
        inputMethodRadios: document.querySelectorAll('input[name="input-method"]'),
        manualEntrySection: document.getElementById('manual-entry-section'),
        batchSection: document.getElementById('batch-section'),
        addTrayBtn: document.getElementById('add-tray-btn'),
        clearTraysBtn: document.getElementById('clear-trays-btn'),
        manualTrayTableContainer: document.getElementById('manual-tray-table-container'),
        exportTraysBtn: document.getElementById('export-trays-btn'),
        importTraysFile: document.getElementById('import-trays-file'),
        importTraysBtn: document.getElementById('import-trays-btn'),
        trayUtilizationContainer: document.getElementById('tray-utilization-container'),
        loadSampleCablesBtn: document.getElementById('load-sample-cables-btn'),
        clearCablesBtn: document.getElementById('clear-cables-btn'),
        addCableBtn: document.getElementById('add-cable-btn'),
        cableListContainer: document.getElementById('cable-list-container'),
        exportCablesBtn: document.getElementById('export-cables-btn'),
        importCablesFile: document.getElementById('import-cables-file'),
        importCablesBtn: document.getElementById('import-cables-btn'),
        resultsSection: document.getElementById('results-section'),
        messages: document.getElementById('messages'),
        metrics: document.getElementById('metrics'),
        routeBreakdownContainer: document.getElementById('route-breakdown-container'),
        plot3d: document.getElementById('plot-3d'),
        popoutPlotBtn: document.getElementById('popout-plot-btn'),
        updatedUtilizationContainer: document.getElementById('updated-utilization-container'),
        exportCsvBtn: document.getElementById('export-csv-btn'),
        progressContainer: document.getElementById('progress-container'),
        progressBar: document.getElementById('progress-bar'),
        progressLabel: document.getElementById('progress-label'),
        cancelRoutingBtn: document.getElementById('cancel-routing-btn'),
        manualTraySummary: document.getElementById('manual-tray-summary'),
        cableListSummary: document.getElementById('cable-list-summary'),
    };

    let cancelRouting = false;
    let currentWorkers = [];
    let workerResolvers = new Map();
    const taskQueue = [];
    const maxWorkers = navigator.hardwareConcurrency || 4;

    const updateTableCounts = () => {
        if (elements.manualTraySummary) {
            elements.manualTraySummary.textContent =
                `Manual Cable Tray Entry Table (${state.manualTrays.length})`;
        }
        if (elements.cableListSummary) {
            elements.cableListSummary.textContent =
                `Cables to Route Table (${state.cableList.length})`;
        }
    };
    
    // --- CORE ROUTING LOGIC (JavaScript implementation of your Python backend) ---

    class MinHeap {
        constructor() {
            this.heap = [];
        }

        push(node, priority) {
            this.heap.push({ node, priority });
            let i = this.heap.length - 1;
            while (i > 0) {
                const p = Math.floor((i - 1) / 2);
                if (this.heap[p].priority <= this.heap[i].priority) break;
                [this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]];
                i = p;
            }
        }

        pop() {
            if (this.heap.length === 0) return null;
            const min = this.heap[0];
            const last = this.heap.pop();
            if (this.heap.length > 0) {
                this.heap[0] = last;
                let i = 0;
                while (true) {
                    let l = 2 * i + 1;
                    let r = 2 * i + 2;
                    let smallest = i;
                    if (l < this.heap.length && this.heap[l].priority < this.heap[smallest].priority) smallest = l;
                    if (r < this.heap.length && this.heap[r].priority < this.heap[smallest].priority) smallest = r;
                    if (smallest === i) break;
                    [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
                    i = smallest;
                }
            }
            return min.node;
        }

        isEmpty() {
            return this.heap.length === 0;
        }
    }

    class CableRoutingSystem {
        constructor(options) {
            this.fillLimit = options.fillLimit || 0.4;
            this.proximityThreshold = options.proximityThreshold || 72.0;
            this.fieldPenalty = options.fieldPenalty || 3.0;
            this.sharedPenalty = options.sharedPenalty || 0.5;
            // Limit how far apart generic field edges can be created to avoid
            // generating a fully connected graph for large datasets
            this.maxFieldEdge = options.maxFieldEdge || 150;
            // Limit how many field connections each node keeps to further
            // reduce graph density and memory usage
            this.maxFieldNeighbors = options.maxFieldNeighbors || 8;
            this.sharedFieldSegments = [];
            this.trays = new Map();
        }

        addTraySegment(tray) {
            const maxFill = tray.width * tray.height * this.fillLimit;
            this.trays.set(tray.tray_id, { ...tray, maxFill });
        }

        updateTrayFill(trayIds, cableArea) {
             if (!Array.isArray(trayIds)) return;
             trayIds.forEach(trayId => {
                if (this.trays.has(trayId)) {
                    this.trays.get(trayId).current_fill += cableArea;
                }
             });
        }
        
        getTrayUtilization() {
            const utilization = {};
            for (const [id, tray] of this.trays.entries()) {
                utilization[id] = {
                    current_fill: tray.current_fill,
                    max_fill: tray.maxFill,
                    utilization_percentage: (tray.current_fill / tray.maxFill) * 100,
                    available_capacity: tray.maxFill - tray.current_fill,
                };
            }
            return utilization;
        }

        // Geometric helper: 3D distance
        distance(p1, p2) {
            return Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2) + Math.pow(p1[2] - p2[2], 2));
        }

        // Manhattan distance used for field routing
        manhattanDistance(p1, p2) {
            return Math.abs(p1[0] - p2[0]) + Math.abs(p1[1] - p2[1]) + Math.abs(p1[2] - p2[2]);
        }
        
        // Geometric helper: Project point p onto line segment [a, b]
        projectPointOnSegment(p, a, b) {
            const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
            const magAbSq = ab[0]*ab[0] + ab[1]*ab[1] + ab[2]*ab[2];
            if (magAbSq === 0) return a;
            
            const dot = ap[0]*ab[0] + ap[1]*ab[1] + ap[2]*ab[2];
            const t = Math.max(0, Math.min(1, dot / magAbSq));
            
            return [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]];
        }

        _consolidateSegments(segments) {
            if (segments.length === 0) return [];

            const consolidated = [];
            let current = { ...segments[0] };

            for (let i = 1; i < segments.length; i++) {
                const next = segments[i];
                // Consolidate consecutive tray segments belonging to the same tray
                if (next.type === current.type && next.type === 'tray' && next.tray_id === current.tray_id) {
                    current.end = next.end; // Extend the end point
                    current.length += next.length; // Add to the length
                } else {
                    consolidated.push(current);
                    current = { ...next };
                }
            }
            consolidated.push(current); // Add the last segment
            return consolidated;
        }

        _segmentOrientation(seg) {
            if (seg.start[0] !== seg.end[0]) return { axis: 0, const1: 1, const2: 2 };
            if (seg.start[1] !== seg.end[1]) return { axis: 1, const1: 0, const2: 2 };
            return { axis: 2, const1: 0, const2: 1 };
        }

        _segmentsOverlap(segA, segB, tol) {
            const oA = this._segmentOrientation(segA);
            const oB = this._segmentOrientation(segB);
            if (oA.axis !== oB.axis) return null;
            if (Math.abs(segA.start[oA.const1] - segB.start[oB.const1]) > tol) return null;
            if (Math.abs(segA.start[oA.const2] - segB.start[oB.const2]) > tol) return null;

            const a1 = Math.min(segA.start[oA.axis], segA.end[oA.axis]);
            const a2 = Math.max(segA.start[oA.axis], segA.end[oA.axis]);
            const b1 = Math.min(segB.start[oB.axis], segB.end[oB.axis]);
            const b2 = Math.max(segB.start[oB.axis], segB.end[oB.axis]);

            const start = Math.max(a1, b1);
            const end = Math.min(a2, b2);
            if (end + tol < start) return null;

            const pointStart = segA.start.slice();
            const pointEnd = segA.start.slice();
            pointStart[oA.axis] = start;
            pointEnd[oA.axis] = end;
            return { start: pointStart, end: pointEnd };
        }

        findCommonFieldRoutes(routes, tolerance = 1) {
            const map = {};
            const keyFor = (s, e, group) => {
                const rounded = arr => arr.map(v => v.toFixed(2)).join(',');
                return `${rounded(s)}|${rounded(e)}|${group || ''}`;
            };
            for (let i = 0; i < routes.length; i++) {
                const a = routes[i];
                for (let j = i + 1; j < routes.length; j++) {
                    const b = routes[j];
                    if (a.allowed_cable_group && b.allowed_cable_group && a.allowed_cable_group !== b.allowed_cable_group) continue;
                    for (const segA of a.segments) {
                        if (segA.type !== 'field') continue;
                        for (const segB of b.segments) {
                            if (segB.type !== 'field') continue;
                            const ov = this._segmentsOverlap(segA, segB, tolerance);
                            if (ov) {
                                const key = keyFor(ov.start, ov.end, a.allowed_cable_group);
                                if (!map[key]) {
                                    map[key] = { start: ov.start, end: ov.end, group: a.allowed_cable_group, cables: new Set() };
                                }
                                map[key].cables.add(a.label || a.name);
                                map[key].cables.add(b.label || b.name);
                            }
                        }
                    }
                }
            }
            let count = 1;
            return Object.values(map).map(r => ({
                name: `Route ${count++}`,
                start: r.start,
                end: r.end,
                allowed_cable_group: r.group,
                cables: Array.from(r.cables)
            }));
        }

        _isSharedSegment(seg, tol = 0.1) {
            for (const existing of this.sharedFieldSegments) {
                if (this._segmentsOverlap(seg, existing, tol)) return true;
            }
            return false;
        }

        _removeTrayBacktracking(segments) {
            const result = [];
            let i = 0;
            while (i < segments.length) {
                const curr = { ...segments[i] };
                if (curr.type === 'tray' && i + 1 < segments.length) {
                    const next = { ...segments[i + 1] };
                    if (next.type === 'field') {
                        const oTray = this._segmentOrientation(curr);
                        const oField = this._segmentOrientation(next);
                        if (oTray.axis === oField.axis) {
                            const trayDir = Math.sign(curr.end[oTray.axis] - curr.start[oTray.axis]);
                            const fieldDir = Math.sign(next.end[oField.axis] - next.start[oField.axis]);
                            if (trayDir !== 0 && fieldDir !== 0 && trayDir !== fieldDir) {
                                const overshoot = Math.min(Math.abs(next.end[oField.axis] - next.start[oField.axis]), curr.length);
                                curr.end[oTray.axis] -= trayDir * overshoot;
                                curr.length -= overshoot;
                                next.start[oField.axis] -= trayDir * overshoot;
                                next.length -= overshoot;
                                if (curr.length > 0.0001) result.push(curr);
                                if (next.length > 0.0001) {
                                    result.push(next);
                                }
                                i += 2;
                                continue;
                            }
                        }
                    }
                }
                result.push(curr);
                i++;
            }
            return result;
        }

        prepareBaseGraph() {
            const graph = { nodes: {}, edges: {} };
            const addNode = (id, point, type = 'generic') => {
                graph.nodes[id] = { point, type };
                graph.edges[id] = {};
            };
            const addEdge = (id1, id2, weight, type, trayId = null) => {
                if (!graph.edges[id1]) graph.edges[id1] = {};
                if (!graph.edges[id2]) graph.edges[id2] = {};
                graph.edges[id1][id2] = { weight, type, trayId };
                graph.edges[id2][id1] = { weight, type, trayId };
            };

            this.trays.forEach(tray => {
                const startId = `${tray.tray_id}_start`;
                const endId = `${tray.tray_id}_end`;
                addNode(startId, [tray.start_x, tray.start_y, tray.start_z], 'tray_endpoint');
                addNode(endId, [tray.end_x, tray.end_y, tray.end_z], 'tray_endpoint');
                const trayLength = this.distance(graph.nodes[startId].point, graph.nodes[endId].point);
                addEdge(startId, endId, trayLength, 'tray', tray.tray_id);
            });

            this.trays.forEach(trayA => {
                const startA = `${trayA.tray_id}_start`;
                const endA = `${trayA.tray_id}_end`;
                const endpoints = [
                    { id: startA, point: graph.nodes[startA].point },
                    { id: endA, point: graph.nodes[endA].point }
                ];
                this.trays.forEach(trayB => {
                    if (trayA.tray_id === trayB.tray_id) return;
                    const startB = `${trayB.tray_id}_start`;
                    const endB = `${trayB.tray_id}_end`;
                    const a = graph.nodes[startB].point;
                    const b = graph.nodes[endB].point;
                    endpoints.forEach(ep => {
                        const proj = this.projectPointOnSegment(ep.point, a, b);
                        if (this.distance(ep.point, proj) < 0.1) {
                            const projId = `${ep.id}_on_${trayB.tray_id}`;
                            addNode(projId, proj, 'projection');
                            addEdge(ep.id, projId, 0.1, 'tray_connection', trayB.tray_id);
                            addEdge(projId, startB, this.distance(proj, a), 'tray', trayB.tray_id);
                            addEdge(projId, endB, this.distance(proj, b), 'tray', trayB.tray_id);
                        }
                    });
                });
            });

            const nodeIds = Object.keys(graph.nodes);
            const candidates = {};
            nodeIds.forEach(id => candidates[id] = []);

            for (let i = 0; i < nodeIds.length; i++) {
                for (let j = i + 1; j < nodeIds.length; j++) {
                    const id1 = nodeIds[i];
                    const id2 = nodeIds[j];
                    const p1 = graph.nodes[id1].point;
                    const p2 = graph.nodes[id2].point;

                    const isSameTray = id1.startsWith(id2.split('_')[0]) && id2.startsWith(id1.split('_')[0]);
                    if (graph.edges[id1][id2] || (id1.includes('_') && isSameTray)) continue;

                    const dist = this.manhattanDistance(p1, p2);
                    if (dist > this.maxFieldEdge) continue;
                    candidates[id1].push({ id: id2, dist });
                    candidates[id2].push({ id: id1, dist });
                }
            }

            nodeIds.forEach(id1 => {
                candidates[id1].sort((a,b) => a.dist - b.dist);
                candidates[id1].slice(0, this.maxFieldNeighbors).forEach(({id: id2, dist}) => {
                    if (graph.edges[id1][id2]) return;
                    let weight, type;
                    if (dist < 0.1) {
                        weight = 0.1;
                        type = 'tray_connection';
                    } else {
                        weight = dist * this.fieldPenalty;
                        type = 'field';
                    }
                    addEdge(id1, id2, weight, type);
                });
            });

            this.baseGraph = graph;
        }

        recordSharedFieldSegments(segments) {
            segments.forEach(s => {
                if (s.type === 'field') {
                    this.sharedFieldSegments.push({ start: s.start.slice(), end: s.end.slice() });
                }
            });
        }

        calculateRoute(startPoint, endPoint, cableArea, allowedGroup) {
            if (!this.baseGraph) this.prepareBaseGraph();
            // 1. Start from the precomputed graph
            const cloneGraph = (base) => {
                const g = { nodes: {}, edges: {} };
                for (const [id, n] of Object.entries(base.nodes)) {
                    g.nodes[id] = { point: n.point.slice(), type: n.type };
                }
                for (const [id, edges] of Object.entries(base.edges)) {
                    g.edges[id] = {};
                    for (const [k, e] of Object.entries(edges)) {
                        g.edges[id][k] = { weight: e.weight, type: e.type, trayId: e.trayId };
                    }
                }
                return g;
            };
            const graph = cloneGraph(this.baseGraph);

            // Remove trays without remaining capacity
            this.trays.forEach(tray => {
                if (tray.current_fill + cableArea > tray.maxFill || tray.allowed_cable_group !== allowedGroup) {
                    const remove = Object.keys(graph.nodes).filter(n => n.includes(tray.tray_id));
                    remove.forEach(n => {
                        delete graph.nodes[n];
                        delete graph.edges[n];
                        Object.keys(graph.edges).forEach(k => { if (graph.edges[k]) delete graph.edges[k][n]; });
                    });
                }
            });

            const addNode = (id, point, type = 'generic') => {
                graph.nodes[id] = { point, type };
                graph.edges[id] = {};
            };
            const addEdge = (id1, id2, weight, type, trayId = null) => {
                if (!graph.edges[id1]) graph.edges[id1] = {};
                if (!graph.edges[id2]) graph.edges[id2] = {};
                graph.edges[id1][id2] = { weight, type, trayId };
                graph.edges[id2][id1] = { weight, type, trayId };
            };

            addNode('start', startPoint, 'start');
            addNode('end', endPoint, 'end');

            const nodeIds = Object.keys(graph.nodes);
            nodeIds.forEach(id => {
                if (id === 'start' || id === 'end') return;
                const p = graph.nodes[id].point;
                const segS = { start: startPoint, end: p };
                const segE = { start: endPoint, end: p };
                const penS = this._isSharedSegment(segS) ? this.fieldPenalty * this.sharedPenalty : this.fieldPenalty;
                const penE = this._isSharedSegment(segE) ? this.fieldPenalty * this.sharedPenalty : this.fieldPenalty;
                addEdge('start', id, this.manhattanDistance(startPoint, p) * penS, 'field');
                addEdge('end', id, this.manhattanDistance(endPoint, p) * penE, 'field');
            });

            const segSE = { start: startPoint, end: endPoint };
            const penSE = this._isSharedSegment(segSE) ? this.fieldPenalty * this.sharedPenalty : this.fieldPenalty;
            addEdge('start', 'end', this.manhattanDistance(startPoint, endPoint) * penSE, 'field');
            
            // Add projection nodes for start/end points onto trays
            this.trays.forEach(tray => {
                const startId = `${tray.tray_id}_start`;
                if (!graph.nodes[startId]) return; // Skip if tray was full
                
                const a = graph.nodes[startId].point;
                const b = graph.nodes[`${tray.tray_id}_end`].point;
                
                // Project cable's start point
                const projStart = this.projectPointOnSegment(startPoint, a, b);
                const distToProjStart = this.manhattanDistance(startPoint, projStart);
                if (distToProjStart <= this.proximityThreshold) {
                    const projId = `proj_start_on_${tray.tray_id}`;
                    addNode(projId, projStart, 'projection');
                    const penStart = this._isSharedSegment({ start: startPoint, end: projStart }) ? this.fieldPenalty * this.sharedPenalty : this.fieldPenalty;
                    addEdge('start', projId, distToProjStart * penStart, 'field');
                    addEdge(projId, startId, this.distance(projStart, a), 'tray', tray.tray_id);
                    addEdge(projId, `${tray.tray_id}_end`, this.distance(projStart, b), 'tray', tray.tray_id);
                }

                // Project cable's end point
                const projEnd = this.projectPointOnSegment(endPoint, a, b);
                const distToProjEnd = this.manhattanDistance(endPoint, projEnd);
                if (distToProjEnd <= this.proximityThreshold) {
                    const projId = `proj_end_on_${tray.tray_id}`;
                    addNode(projId, projEnd, 'projection');
                    const penEnd = this._isSharedSegment({ start: endPoint, end: projEnd }) ? this.fieldPenalty * this.sharedPenalty : this.fieldPenalty;
                    addEdge('end', projId, distToProjEnd * penEnd, 'field');
                    addEdge(projId, startId, this.distance(projEnd, a), 'tray', tray.tray_id);
                    addEdge(projId, `${tray.tray_id}_end`, this.distance(projEnd, b), 'tray', tray.tray_id);
                }
            });
            
            // 2. Dijkstra's Algorithm
            const distances = {};
            const prev = {};
            Object.keys(graph.nodes).forEach(node => distances[node] = Infinity);
            distances['start'] = 0;

            const pq = new MinHeap();
            pq.push('start', 0);
            const visited = new Set();

            while (!pq.isEmpty()) {
                const u = pq.pop();
                if (visited.has(u)) continue;
                visited.add(u);
                if (u === 'end') break;

                for (const v in graph.edges[u]) {
                    const edge = graph.edges[u][v];
                    const alt = distances[u] + edge.weight;
                    if (alt < distances[v]) {
                        distances[v] = alt;
                        prev[v] = { node: u, edge };
                        pq.push(v, alt);
                    }
                }
            }

            // 3. Reconstruct path and results
            if (distances['end'] === Infinity) {
                return { success: false, error: "No valid path could be found." };
            }

            const path = [];
            let current = 'end';
            while (current) {
                path.unshift(current);
                current = prev[current] ? prev[current].node : null;
            }
            
            let totalLength = 0;
            let fieldRoutedLength = 0;
            const routeSegments = [];
            const traySegments = new Set();

            for (let i = 0; i < path.length - 1; i++) {
                const u = path[i];
                const v = path[i+1];
                const edge = graph.edges[u][v] || graph.edges[v][u];
                const p1 = graph.nodes[u].point;
                const p2 = graph.nodes[v].point;
                const length = edge.type === 'field' ? this.manhattanDistance(p1, p2) : this.distance(p1, p2);
                totalLength += length;
                if (edge.type === 'field') {
                    fieldRoutedLength += length;
                }
                let type = edge.type;
                if (type === 'tray_connection') type = 'tray'; // Treat connections as trays for segment breakdown
                
                let tray_id = edge.trayId;
                if (!tray_id) { // Infer tray_id if not on edge
                    const node_id = u.includes('_') ? u : v;
                    tray_id = node_id.split('_')[0]
                }
                if (type === 'tray') traySegments.add(tray_id);

                if (edge.type === 'field') {
                    let curr = p1.slice();
                    if (p2[0] !== curr[0]) {
                        const next = [p2[0], curr[1], curr[2]];
                        routeSegments.push({ type, start: curr, end: next, length: Math.abs(p2[0]-curr[0]), tray_id });
                        curr = next;
                    }
                    if (p2[1] !== curr[1]) {
                        const next = [curr[0], p2[1], curr[2]];
                        routeSegments.push({ type, start: curr, end: next, length: Math.abs(p2[1]-curr[1]), tray_id });
                        curr = next;
                    }
                    if (p2[2] !== curr[2]) {
                        const next = [curr[0], curr[1], p2[2]];
                        routeSegments.push({ type, start: curr, end: next, length: Math.abs(p2[2]-curr[2]), tray_id });
                        curr = next;
                    }
                } else {
                    routeSegments.push({ type, start: p1, end: p2, length, tray_id });
                }
            }

            const cleaned = this._removeTrayBacktracking(routeSegments);
            return {
                success: true,
                total_length: totalLength,
                field_routed_length: fieldRoutedLength,
                route_segments: this._consolidateSegments(cleaned),
                tray_segments: Array.from(traySegments),
                warnings: [],
            };
        }
    }

    // --- EVENT HANDLERS & UI LOGIC (This part remains the same) ---
    
    const getSampleTrays = () => [
        {"tray_id": "H1-A", "start_x": 0, "start_y": 0, "start_z": 10, "end_x": 40, "end_y": 0, "end_z": 10, "width": 16, "height": 3.94, "current_fill": 9.30,"allowed_cable_group": "HV"},
        {"tray_id": "H1-B", "start_x": 40, "start_y": 0, "start_z": 10, "end_x": 80, "end_y": 0, "end_z": 10, "width": 16, "height": 3.94, "current_fill": 6.98,"allowed_cable_group": "HV"},
        {"tray_id": "H1-C", "start_x": 80, "start_y": 0, "start_z": 10, "end_x": 120, "end_y": 0, "end_z": 10, "width": 16, "height": 3.94, "current_fill": 12.71,"allowed_cable_group": "HV"},
        {"tray_id": "H2-A", "start_x": 0, "start_y": 0, "start_z": 30, "end_x": 40, "end_y": 0, "end_z": 30, "width": 12, "height": 3.15, "current_fill": 4.96,"allowed_cable_group": "LV"},
        {"tray_id": "H2-B", "start_x": 40, "start_y": 0, "start_z": 30, "end_x": 80, "end_y": 0, "end_z": 30, "width": 12, "height": 3.15, "current_fill": 8.99,"allowed_cable_group": "LV"},
        {"tray_id": "H2-C", "start_x": 80, "start_y": 0, "start_z": 30, "end_x": 120, "end_y": 0, "end_z": 30, "width": 12, "height": 3.15, "current_fill": 3.26,"allowed_cable_group": "LV"},
        {"tray_id": "V1", "start_x": 40, "start_y": 0, "start_z": 10, "end_x": 40, "end_y": 0, "end_z": 30, "width": 8, "height": 2.36, "current_fill": 2.79,"allowed_cable_group": "HV"},
        {"tray_id": "V2", "start_x": 80, "start_y": 0, "start_z": 10, "end_x": 80, "end_y": 0, "end_z": 30, "width": 8, "height": 2.36, "current_fill": 3.41,"allowed_cable_group": "LV"},
        {"tray_id": "C1", "start_x": 60, "start_y": 0, "start_z": 10, "end_x": 60, "end_y": 40, "end_z": 10, "width": 9, "height": 2.95, "current_fill": 5.43,"allowed_cable_group": "HV"},
        {"tray_id": "C2", "start_x": 100, "start_y": 0, "start_z": 30, "end_x": 100, "end_y": 60, "end_z": 30, "width": 9, "height": 2.95, "current_fill": 6.36,"allowed_cable_group": "LV"},
        {"tray_id": "B1", "start_x": 60, "start_y": 40, "start_z": 10, "end_x": 60, "end_y": 80, "end_z": 10, "width": 6, "height": 1.97, "current_fill": 1.86,"allowed_cable_group": "HV"},
        {"tray_id": "B2", "start_x": 100, "start_y": 60, "start_z": 30, "end_x": 100, "end_y": 100, "end_z": 30, "width": 6, "height": 1.97, "current_fill": 1.40,"allowed_cable_group": "LV"},
        {"tray_id": "TRUNK", "start_x": 0, "start_y": 20, "start_z": 50, "end_x": 120, "end_y": 20, "end_z": 50, "width": 24, "height": 5.91, "current_fill": 27.90,"allowed_cable_group": "HV"},
        {"tray_id": "EQ1", "start_x": 20, "start_y": 0, "start_z": 10, "end_x": 20, "end_y": 15, "end_z": 5, "width": 4, "height": 1.57, "current_fill": 1.24,"allowed_cable_group": "HV"},
        {"tray_id": "EQ2", "start_x": 100, "start_y": 60, "start_z": 30, "end_x": 110, "end_y": 90, "end_z": 20, "width": 4, "height": 1.57, "current_fill": 0.93,"allowed_cable_group": "LV"},
        {"tray_id": "CONN1", "start_x": 120, "start_y": 0, "start_z": 10, "end_x": 120, "end_y": 20, "end_z": 25, "width": 8, "height": 2.95, "current_fill": 3.10,"allowed_cable_group": "HV"},
        {"tray_id": "CONN2", "start_x": 120, "start_y": 20, "start_z": 25, "end_x": 120, "end_y": 20, "end_z": 50, "width": 8, "height": 2.95, "current_fill": 2.33,"allowed_cable_group": "HV"}
    ];
    
    const getSampleCables = () => [
        {
            name: "Power Cable 1",
            cable_type: "Power",
            conductors: 3,
            diameter: 1.26,
            weight: 1.5,
            start: [5, 5, 5],
            end: [110, 95, 45],
            start_tag: "ST1",
            end_tag: "ET1",
            allowed_cable_group: "HV"
        },
        {
            name: "Control Cable 1",
            cable_type: "Control",
            conductors: 3,
            diameter: 0.47,
            weight: 0.8,
            start: [10, 0, 10],
            end: [100, 80, 25],
            start_tag: "ST2",
            end_tag: "ET2",
            allowed_cable_group: "LV"
        },
        {
            name: "Data Cable 1",
            cable_type: "Signal",
            conductors: 3,
            diameter: 0.31,
            weight: 0.5,
            start: [15, 5, 15],
            end: [105, 85, 30],
            start_tag: "ST3",
            end_tag: "ET3",
            allowed_cable_group: "LV"
        },
        {
            name: "Power Cable 2",
            cable_type: "Power",
            conductors: 3,
            diameter: 1.10,
            weight: 1.3,
            start: [20, 10, 8],
            end: [115, 90, 35],
            start_tag: "ST4",
            end_tag: "ET4",
            allowed_cable_group: "HV"
        },
        {
            name: "Control Cable 2",
            cable_type: "Control",
            conductors: 3,
            diameter: 0.59,
            weight: 0.9,
            start: [25, 15, 12],
            end: [95, 75, 28],
            start_tag: "ST5",
            end_tag: "ET5",
            allowed_cable_group: "LV"
        },
    ];

    const updateFillLimitDisplay = () => {
        elements.fillLimitOut.textContent = `${elements.fillLimitIn.value}%`;
    };

    const renderTable = (container, headers, data, styleFn = null, formatters = {}) => {
        const defs = headers.map(h => typeof h === 'string' ? {
            label: h,
            key: h.toLowerCase()
                    .replace(/²/g, '2')
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/^_|_$/g, '')
        } : h);

        let table = '<table><thead><tr>';
        defs.forEach(h => table += `<th>${h.label}</th>`);
        table += '</tr></thead><tbody>';
        data.forEach(row => {
            const style = styleFn ? styleFn(row) : '';
            table += `<tr class="${style}">`;
            defs.forEach(h => {
                const val = row[h.key];
                if (formatters[h.key]) {
                    table += `<td>${formatters[h.key](val, row)}</td>`;
                } else {
                    table += `<td>${val !== undefined ? val : 'N/A'}</td>`;
                }
            });
            table += '</tr>';
        });
        table += '</tbody></table>';
        container.innerHTML = table;
    };
    
    const utilizationStyle = (row) => {
        const util = row.utilization_pct || row.utilization;
        if (util > 80) return 'util-high';
        if (util > 60) return 'util-medium';
        return 'util-low';
    };

    const updateTrayDisplay = () => {
        if (state.trayData.length === 0) {
            elements.trayUtilizationContainer.innerHTML = '<p class="info-text">No tray data loaded.</p>';
            return;
        }
        const displayData = state.trayData.map(tray => {
            const maxCapacity = tray.width * tray.height * (parseFloat(elements.fillLimitIn.value) / 100);
            return {
                ...tray,
                max_capacity: maxCapacity.toFixed(0),
                utilization_pct: ((tray.current_fill / maxCapacity) * 100).toFixed(1),
                available_space: (maxCapacity - tray.current_fill).toFixed(2),
            };
        });
        renderTable(
            elements.trayUtilizationContainer,
            [
                { label: 'Tray ID', key: 'tray_id' },
                { label: 'Start (x,y,z)', key: 'start_xyz' },
                { label: 'End (x,y,z)', key: 'end_xyz' },
                { label: 'Max Capacity (in²)', key: 'max_capacity' },
                { label: 'Current Fill (in²)', key: 'current_fill' },
                { label: 'Utilization %', key: 'utilization_pct' },
                { label: 'Available Space (in²)', key: 'available_space' }
            ],
            displayData.map(d => ({
                tray_id: d.tray_id,
                start_xyz: `(${d.start_x}, ${d.start_y}, ${d.start_z})`,
                end_xyz: `(${d.end_x}, ${d.end_y}, ${d.end_z})`,
                max_capacity: d.max_capacity,
                current_fill: d.current_fill,
                utilization_pct: d.utilization_pct,
                available_space: d.available_space
            })),
            utilizationStyle
        );
    };
    
    const handleInputMethodChange = () => {
        if (document.getElementById('sample-data').checked) {
            elements.manualEntrySection.style.display = 'none';
            state.trayData = getSampleTrays();
            elements.manualTrayTableContainer.innerHTML = '';
        } else {
            elements.manualEntrySection.style.display = 'block';
            state.trayData = state.manualTrays;
            renderManualTrayTable();
        }
        updateTrayDisplay();
        updateTableCounts();
    };
    

    const addManualTray = () => {
        const required = ['t-id','t-sx','t-sy','t-sz','t-ex','t-ey','t-ez','t-w','t-h'];
        let valid = true;
        required.forEach(id => {
            const el = document.getElementById(id);
            if (el.type === 'number') {
                if (el.value === '' || isNaN(parseFloat(el.value))) {
                    el.classList.add('input-error');
                    valid = false;
                } else {
                    el.classList.remove('input-error');
                }
            } else if (!el.value) {
                el.classList.add('input-error');
                valid = false;
            } else {
                el.classList.remove('input-error');
            }
        });
        if (!valid) return;

        const newTray = {
            tray_id: document.getElementById('t-id').value,
            start_x: parseFloat(document.getElementById('t-sx').value),
            start_y: parseFloat(document.getElementById('t-sy').value),
            start_z: parseFloat(document.getElementById('t-sz').value),
            end_x: parseFloat(document.getElementById('t-ex').value),
            end_y: parseFloat(document.getElementById('t-ey').value),
            end_z: parseFloat(document.getElementById('t-ez').value),
            width: parseFloat(document.getElementById('t-w').value),
            height: parseFloat(document.getElementById('t-h').value),
            current_fill: parseFloat(document.getElementById('t-fill').value),
            allowed_cable_group: document.getElementById('t-group').value
        };
        state.manualTrays.push(newTray);
        state.trayData = state.manualTrays;
        renderManualTrayTable();
        updateTrayDisplay();
        updateTableCounts();
    };

    const clearManualTrays = () => {
        state.manualTrays = [];
        state.trayData = [];
        elements.manualTrayTableContainer.innerHTML = '';
        updateTrayDisplay();
        updateTableCounts();
    };

    const renderManualTrayTable = () => {
        if (state.manualTrays.length === 0) {
            elements.manualTrayTableContainer.innerHTML = '';
            updateTableCounts();
            return;
        }
        let table = '<table class="sticky-table"><thead><tr><th>Tray ID</th><th>Start (X,Y,Z)</th><th>End (X,Y,Z)</th><th>Width</th><th>Height</th><th>Current Fill</th><th>Allowed Group</th><th></th><th></th></tr></thead><tbody>';
        state.manualTrays.forEach((t, idx) => {
            table += `<tr data-idx="${idx}">
                        <td><input type="text" class="tray-id-input" data-idx="${idx}" value="${t.tray_id}" style="width:80px;"></td>
                        <td>
                            <input type="number" class="tray-start-input" data-idx="${idx}" data-coord="0" value="${t.start_x}" style="width:70px;">
                            <input type="number" class="tray-start-input" data-idx="${idx}" data-coord="1" value="${t.start_y}" style="width:70px;">
                            <input type="number" class="tray-start-input" data-idx="${idx}" data-coord="2" value="${t.start_z}" style="width:70px;">
                        </td>
                        <td>
                            <input type="number" class="tray-end-input" data-idx="${idx}" data-coord="0" value="${t.end_x}" style="width:70px;">
                            <input type="number" class="tray-end-input" data-idx="${idx}" data-coord="1" value="${t.end_y}" style="width:70px;">
                            <input type="number" class="tray-end-input" data-idx="${idx}" data-coord="2" value="${t.end_z}" style="width:70px;">
                        </td>
                        <td><input type="number" class="tray-width-input" data-idx="${idx}" value="${t.width}" style="width:60px;"></td>
                        <td><input type="number" class="tray-height-input" data-idx="${idx}" value="${t.height}" style="width:60px;"></td>
                        <td><input type="number" class="tray-fill-input" data-idx="${idx}" value="${t.current_fill}" style="width:80px;"></td>
                        <td><input type="text" class="tray-group-input" data-idx="${idx}" value="${t.allowed_cable_group || ''}" style="width:100px;"></td>
                        <td><button class="icon-button dup-tray" data-idx="${idx}" title="Duplicate">📋</button></td>
                        <td><button class="icon-button delete-tray icon-delete" data-idx="${idx}" title="Delete">\u274C</button></td>
                     </tr>`;
        });
        table += '</tbody></table>';
        elements.manualTrayTableContainer.innerHTML = table;
        elements.manualTrayTableContainer.classList.add('table-scroll');
        
        const updateTrayData = () => { state.trayData = state.manualTrays; updateTrayDisplay(); };

        elements.manualTrayTableContainer.querySelectorAll('.tray-id-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.manualTrays[i].tray_id = e.target.value;
                updateTrayData();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.tray-start-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                const c = parseInt(e.target.dataset.coord, 10);
                const val = parseFloat(e.target.value);
                if (c === 0) state.manualTrays[i].start_x = val;
                if (c === 1) state.manualTrays[i].start_y = val;
                if (c === 2) state.manualTrays[i].start_z = val;
                updateTrayData();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.tray-end-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                const c = parseInt(e.target.dataset.coord, 10);
                const val = parseFloat(e.target.value);
                if (c === 0) state.manualTrays[i].end_x = val;
                if (c === 1) state.manualTrays[i].end_y = val;
                if (c === 2) state.manualTrays[i].end_z = val;
                updateTrayData();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.tray-width-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.manualTrays[i].width = parseFloat(e.target.value);
                updateTrayData();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.tray-height-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.manualTrays[i].height = parseFloat(e.target.value);
                updateTrayData();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.tray-fill-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.manualTrays[i].current_fill = parseFloat(e.target.value);
                updateTrayData();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.tray-group-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.manualTrays[i].allowed_cable_group = e.target.value;
                updateTrayData();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.delete-tray').forEach(btn => {
            btn.addEventListener('click', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.manualTrays.splice(i, 1);
                state.trayData = state.manualTrays;
                renderManualTrayTable();
                updateTrayDisplay();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.dup-tray').forEach(btn => {
            btn.addEventListener('click', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                const copy = { ...state.manualTrays[i] };
                state.manualTrays.push(copy);
                state.trayData = state.manualTrays;
                renderManualTrayTable();
                updateTrayDisplay();
            });
        });
        updateTableCounts();
    };

    const exportManualTraysCSV = () => {
        const headers = ['tray_id','start_x','start_y','start_z','end_x','end_y','end_z','width','height','current_fill','allowed_cable_group'];
        const rows = state.manualTrays;
        let csv = headers.join(',') + '\n';
        if (rows.length > 0) {
            rows.forEach(r => {
                csv += headers.map(h => r[h] !== undefined ? r[h] : '').join(',') + '\n';
            });
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tray_list.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const importManualTraysCSV = () => {
        const file = elements.importTraysFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const text = e.target.result.trim();
            const lines = text.split(/\r?\n/);
            if (lines.length === 0) return;
            const delim = lines[0].includes(',') ? ',' : /\t/;
            const headers = lines[0].split(delim);
            const newTrays = [];
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const vals = lines[i].split(delim);
                const t = {};
                headers.forEach((h, idx) => { t[h.trim()] = vals[idx] !== undefined ? vals[idx].trim() : ''; });
                newTrays.push({
                    tray_id: t.tray_id,
                    start_x: parseFloat(t.start_x) || 0,
                    start_y: parseFloat(t.start_y) || 0,
                    start_z: parseFloat(t.start_z) || 0,
                    end_x: parseFloat(t.end_x) || 0,
                    end_y: parseFloat(t.end_y) || 0,
                    end_z: parseFloat(t.end_z) || 0,
                    width: parseFloat(t.width) || 0,
                    height: parseFloat(t.height) || 0,
                    current_fill: parseFloat(t.current_fill) || 0,
                    allowed_cable_group: t.allowed_cable_group || ''
                });
            }
            state.manualTrays = newTrays;
            state.trayData = state.manualTrays;
            renderManualTrayTable();
            updateTrayDisplay();
            updateTableCounts();
        };
        reader.readAsText(file);
        // Reset the file input so importing the same file again triggers the change event
        elements.importTraysFile.value = '';
    };

    const exportCableOptionsCSV = () => {
        const headers = ['tag','start_tag','end_tag','cable_type','conductors','diameter','weight','allowed_cable_group','start_x','start_y','start_z','end_x','end_y','end_z'];
        const rows = state.cableList;
        let csv = headers.join(',') + '\n';
        if (rows.length > 0) {
            rows.forEach(c => {
                const row = [
                    c.name || '',
                    c.start_tag || '',
                    c.end_tag || '',
                    c.cable_type || '',
                    c.conductors !== undefined ? c.conductors : '',
                    c.diameter !== undefined ? c.diameter : '',
                    c.weight !== undefined ? c.weight : '',
                    c.allowed_cable_group || '',
                    c.start[0], c.start[1], c.start[2],
                    c.end[0], c.end[1], c.end[2]
                ];
                csv += row.join(',') + '\n';
            });
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cable_options.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const importCableOptionsCSV = () => {
        const file = elements.importCablesFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const text = e.target.result.trim();
            const lines = text.split(/\r?\n/);
            if (lines.length === 0) return;
            const delim = lines[0].includes(',') ? ',' : /\t/;
            const headers = lines[0].split(delim);
            const newCables = [];
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const vals = lines[i].split(delim);
                const t = {};
                headers.forEach((h, idx) => { t[h.trim()] = vals[idx] !== undefined ? vals[idx].trim() : ''; });
                newCables.push({
                    name: t.tag || '',
                    start_tag: t.start_tag || '',
                    end_tag: t.end_tag || '',
                    cable_type: t.cable_type || 'Power',
                    conductors: parseInt(t.conductors) || 0,
                    diameter: parseFloat(t.diameter) || 0,
                    weight: parseFloat(t.weight) || 0,
                    allowed_cable_group: t.allowed_cable_group || '',
                    start: [parseFloat(t.start_x) || 0, parseFloat(t.start_y) || 0, parseFloat(t.start_z) || 0],
                    end: [parseFloat(t.end_x) || 0, parseFloat(t.end_y) || 0, parseFloat(t.end_z) || 0]
                });
            }
            state.cableList = newCables;
            updateCableListDisplay();
            updateTableCounts();
        };
        reader.readAsText(file);
        // Reset the file input so importing the same file again triggers the change event
        elements.importCablesFile.value = '';
    };

    const renderBatchResults = (results) => {
        let html = '';
        results.forEach(res => {
            html += `<details><summary>${res.cable} | ${res.status} | Total ${res.total_length} | Field ${res.field_length} | Segments ${res.segments_count}</summary>`;
            if (res.breakdown && res.breakdown.length > 0) {
                html += '<div class="table-scroll"><table class="sticky-table"><thead><tr><th>Segment</th><th>Tray ID</th><th>Type</th><th>From</th><th>To</th><th>Length</th></tr></thead><tbody>';
                res.breakdown.forEach(b => {
                    html += `<tr><td>${b.segment}</td><td>${b.tray_id}</td><td>${b.type}</td><td>${b.from}</td><td>${b.to}</td><td>${b.length}</td></tr>`;
                });
                html += '</tbody></table></div>';
            }
            html += '</details>';
        });
        elements.routeBreakdownContainer.innerHTML = html;
    };
    
    const updateCableListDisplay = () => {
        if (state.cableList.length === 0) {
            elements.cableListContainer.innerHTML = '';
            updateTableCounts();
            return;
        }
        let html = '<h4>Cables to Route:</h4><table class="sticky-table"><thead><tr><th>Tag</th><th>Start Tag</th><th>End Tag</th><th>Cable Type</th><th>Conductors</th><th>Diameter (in)</th><th>Weight (lbs/ft)</th><th>Allowed Group</th><th>Start (X,Y,Z)</th><th>End (X,Y,Z)</th><th></th><th></th></tr></thead><tbody>';
        state.cableList.forEach((c, idx) => {
            html += `<tr>
                        <td><input type="text" class="cable-tag-input" data-idx="${idx}" value="${c.name}"></td>
                        <td><input type="text" class="cable-start-tag-input" data-idx="${idx}" value="${c.start_tag || ''}" style="width:240px;"></td>
                        <td><input type="text" class="cable-end-tag-input" data-idx="${idx}" value="${c.end_tag || ''}" style="width:240px;"></td>
                        <td>
                            <select class="cable-type-select" data-idx="${idx}">
                                <option value="Power" ${c.cable_type === 'Power' ? 'selected' : ''}>Power</option>
                                <option value="Control" ${c.cable_type === 'Control' ? 'selected' : ''}>Control</option>
                                <option value="Signal" ${c.cable_type === 'Signal' ? 'selected' : ''}>Signal</option>
                            </select>
                        </td>
                        <td><input type="number" class="cable-conductors-input" data-idx="${idx}" value="${c.conductors || 0}" step="1" style="width:60px;"></td>
                        <td><input type="number" class="cable-diameter-input" data-idx="${idx}" value="${c.diameter}" step="0.01" style="width:60px;"></td>
                        <td><input type="number" class="cable-weight-input" data-idx="${idx}" value="${c.weight || 0}" step="0.01" style="width:80px;"></td>
                        <td><input type="text" class="cable-group-input" data-idx="${idx}" value="${c.allowed_cable_group || ''}" style="width:120px;"></td>
                        <td>
                            <input type="number" class="cable-start-input" data-idx="${idx}" data-coord="0" value="${c.start[0]}" step="0.1" style="width:80px;">
                            <input type="number" class="cable-start-input" data-idx="${idx}" data-coord="1" value="${c.start[1]}" step="0.1" style="width:80px;">
                            <input type="number" class="cable-start-input" data-idx="${idx}" data-coord="2" value="${c.start[2]}" step="0.1" style="width:80px;">
                        </td>
                        <td>
                            <input type="number" class="cable-end-input" data-idx="${idx}" data-coord="0" value="${c.end[0]}" step="0.1" style="width:80px;">
                            <input type="number" class="cable-end-input" data-idx="${idx}" data-coord="1" value="${c.end[1]}" step="0.1" style="width:80px;">
                            <input type="number" class="cable-end-input" data-idx="${idx}" data-coord="2" value="${c.end[2]}" step="0.1" style="width:80px;">
                        </td>
                        <td><button class="icon-button dup-cable" data-idx="${idx}" title="Duplicate">📋</button></td>
                        <td><button class="icon-button del-cable icon-delete" data-idx="${idx}" title="Delete">\u274C</button></td>
                    </tr>`;
        });
        html += '</tbody></table>';
        elements.cableListContainer.innerHTML = html;
        elements.cableListContainer.classList.add('table-scroll');
        elements.cableListContainer.querySelectorAll('.cable-tag-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].name = e.target.value;
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-start-tag-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].start_tag = e.target.value;
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-end-tag-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].end_tag = e.target.value;
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-diameter-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].diameter = parseFloat(e.target.value);
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-conductors-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].conductors = parseInt(e.target.value);
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-weight-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].weight = parseFloat(e.target.value);
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-type-select').forEach(sel => {
            sel.addEventListener('change', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].cable_type = e.target.value;
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-group-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList[i].allowed_cable_group = e.target.value;
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-start-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                const coord = parseInt(e.target.dataset.coord, 10);
                state.cableList[i].start[coord] = parseFloat(e.target.value);
            });
        });
        elements.cableListContainer.querySelectorAll('.cable-end-input').forEach(input => {
            input.addEventListener('input', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                const coord = parseInt(e.target.dataset.coord, 10);
                state.cableList[i].end[coord] = parseFloat(e.target.value);
            });
        });
        elements.cableListContainer.querySelectorAll('.dup-cable').forEach(btn => {
            btn.addEventListener('click', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                const copy = JSON.parse(JSON.stringify(state.cableList[i]));
                state.cableList.splice(i + 1, 0, copy);
                updateCableListDisplay();
            });
        });
        elements.cableListContainer.querySelectorAll('.del-cable').forEach(btn => {
            btn.addEventListener('click', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.cableList.splice(i, 1);
                updateCableListDisplay();
            });
        });
        updateTableCounts();
    };

    const loadSampleCables = () => {
        state.cableList = getSampleCables();
        updateCableListDisplay();
        updateTableCounts();
    };

    const addCableToBatch = () => {
        const newCable = {
            name: `Cable ${state.cableList.length + 1}`,
            cable_type: 'Power',
            conductors: 1,
            diameter: 1.0,
            weight: 0,
            start: [0, 0, 0],
            end: [0, 0, 0],
            start_tag: '',
            end_tag: '',
            allowed_cable_group: ''
        };
        state.cableList.push(newCable);
        updateCableListDisplay();
        updateTableCounts();
    };

    const clearCableList = () => {
        state.cableList = [];
        updateCableListDisplay();
        updateTableCounts();
    };

    const showMessage = (type, text) => {
        elements.messages.innerHTML += `<div class="message ${type}">${text}</div>`;
    };

    const exportRouteXLSX = () => {
        if (!state.latestRouteData || state.latestRouteData.length === 0) {
            alert('No route data to export.');
            return;
        }

        let data = state.latestRouteData;

        if (data[0].breakdown !== undefined) {
            const flat = [];
            data.forEach(row => {
                if (Array.isArray(row.breakdown) && row.breakdown.length > 0) {
                    row.breakdown.forEach(b => {
                        flat.push({
                            cable: row.cable,
                            total_length: row.total_length,
                            field_length: row.field_length,
                            tray_segments_count: row.tray_segments_count,
                            segments_count: row.segments_count,
                            segment: b.segment,
                            tray_id: b.tray_id,
                            type: b.type,
                            from: b.from,
                            to: b.to,
                            length: b.length
                        });
                    });
                } else {
                    flat.push({
                        cable: row.cable,
                        total_length: row.total_length,
                        field_length: row.field_length,
                        tray_segments_count: row.tray_segments_count,
                        segments_count: row.segments_count,
                        segment: '', tray_id: '', type: '', from: '', to: '', length: ''
                    });
                }
            });
            data = flat;
        }

        // remove status column if present
        data = data.map(row => {
            const { status, ...rest } = row;
            return rest;
        });

        const trayMap = new Map();
        state.latestRouteData.forEach(row => {
            if (Array.isArray(row.breakdown)) {
                row.breakdown.forEach(b => {
                    if (b.tray_id && b.tray_id !== 'Field Route' && b.tray_id !== 'N/A') {
                        if (!trayMap.has(b.tray_id)) trayMap.set(b.tray_id, new Set());
                        trayMap.get(b.tray_id).add(row.cable);
                    }
                });
            }
        });

        const groupMap = new Map(state.trayData.map(t => [t.tray_id, t.allowed_cable_group || '']));
        const trayList = Array.from(trayMap.entries()).map(([tray_id, cables]) => ({
            tray_id,
            allowed_cable_group: groupMap.get(tray_id) || '',
            cables: Array.from(cables).join(', ')
        }));

        const sharedRoutes = (state.sharedFieldRoutes || []).map(r => ({
            route_name: r.name,
            allowed_cable_group: r.allowed_cable_group || '',
            start: formatPoint(r.start),
            end: formatPoint(r.end),
            cables: r.cables.join(', ')
        }));

        const wb = XLSX.utils.book_new();
        const ws1 = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws1, 'Route Data');
        const ws2 = XLSX.utils.json_to_sheet(trayList);
        XLSX.utils.book_append_sheet(wb, ws2, 'Tray Cable Map');
        if (sharedRoutes.length > 0) {
            const ws3 = XLSX.utils.json_to_sheet(sharedRoutes);
            XLSX.utils.book_append_sheet(wb, ws3, 'Shared Field Routes');
        }
        XLSX.writeFile(wb, 'route_data.xlsx');
    };

    const formatPoint = (p) => `(${p[0].toFixed(1)}, ${p[1].toFixed(1)}, ${p[2].toFixed(1)})`;

    const cancelCurrentRouting = () => {
        cancelRouting = true;
        elements.cancelRoutingBtn.disabled = true;
        elements.progressLabel.textContent = 'Cancelling...';
        currentWorkers.forEach(w => {
            w.terminate();
            const res = workerResolvers.get(w);
            if (res) res({ cancelled: true });
        });
        currentWorkers = [];
        workerResolvers.clear();
        taskQueue.length = 0;
    };

    const mainCalculation = async () => {
        elements.resultsSection.style.display = 'block';
        elements.messages.innerHTML = '';
        elements.progressContainer.style.display = 'block';
        elements.progressBar.style.width = '0%';
        elements.progressBar.setAttribute('aria-valuenow', '0');
        elements.progressLabel.textContent = 'Starting...';
        elements.cancelRoutingBtn.style.display = 'block';
        elements.cancelRoutingBtn.disabled = false;
        cancelRouting = false;

        const routingSystem = new CableRoutingSystem({
            fillLimit: parseFloat(elements.fillLimitIn.value) / 100,
            proximityThreshold: parseFloat(document.getElementById('proximity-threshold').value),
            fieldPenalty: parseFloat(document.getElementById('field-route-penalty').value),
            sharedPenalty: parseFloat(document.getElementById('shared-field-penalty').value),
            maxFieldEdge: 150,
            maxFieldNeighbors: 8
        });
        
        // Deep copy tray data so original state isn't mutated during batch routing
        const trayDataForRun = JSON.parse(JSON.stringify(state.trayData));
        trayDataForRun.forEach(tray => routingSystem.addTraySegment(tray));
        routingSystem.prepareBaseGraph();
        
        if (state.cableList.length > 0) {
            const batchResults = [];
            const allRoutesForPlotting = [];

            let completed = 0;
            const runCable = (cable, index) => {
                const cableArea = Math.PI * (cable.diameter / 2) ** 2;
                const startTask = (resolve, reject) => {
                    if (cancelRouting) { resolve({ cancelled: true }); return; }
                    const worker = new Worker('routeWorker.js');
                    currentWorkers.push(worker);
                    workerResolvers.set(worker, resolve);
                    const cleanup = () => {
                        worker.terminate();
                        currentWorkers = currentWorkers.filter(w => w !== worker);
                        workerResolvers.delete(worker);
                        if (taskQueue.length > 0 && !cancelRouting) {
                            const next = taskQueue.shift();
                            next();
                        }
                    };
                    worker.onmessage = e => { cleanup(); resolve(e.data); };
                    worker.onerror = err => { cleanup(); reject(err); };
                    worker.postMessage({
                        trays: Array.from(routingSystem.trays.values()),
                        options: {
                            fillLimit: routingSystem.fillLimit,
                            proximityThreshold: routingSystem.proximityThreshold,
                            fieldPenalty: routingSystem.fieldPenalty,
                            sharedPenalty: routingSystem.sharedPenalty,
                            maxFieldEdge: routingSystem.maxFieldEdge,
                            maxFieldNeighbors: routingSystem.maxFieldNeighbors
                        },
                        baseGraph: routingSystem.baseGraph,
                        cable,
                        cableArea
                    });
                };
                return new Promise((resolve, reject) => {
                    const task = () => startTask(resolve, reject);
                    if (currentWorkers.length < maxWorkers) {
                        task();
                    } else {
                        taskQueue.push(task);
                    }
                }).then(result => {
                    completed++;
                    const pct = (completed / state.cableList.length) * 100;
                    elements.progressBar.style.width = `${pct}%`;
                    elements.progressBar.setAttribute('aria-valuenow', Math.round(pct).toString());
                    elements.progressLabel.textContent = `Routing (${completed}/${state.cableList.length})`;
                    if (!cancelRouting && !result.cancelled) {
                        if (result.success) {
                            routingSystem.updateTrayFill(result.tray_segments, cableArea);
                            routingSystem.recordSharedFieldSegments(result.route_segments);
                            allRoutesForPlotting.push({
                                label: cable.name,
                                segments: result.route_segments,
                                startPoint: cable.start,
                                endPoint: cable.end,
                                startTag: cable.start_tag,
                                endTag: cable.end_tag,
                                allowed_cable_group: cable.allowed_cable_group
                            });
                        }
                        batchResults[index] = {
                            cable: cable.name,
                            status: result.success ? '✓ Routed' : '✗ Failed',
                            total_length: result.success ? result.total_length.toFixed(2) : 'N/A',
                            field_length: result.success ? result.field_routed_length.toFixed(2) : 'N/A',
                            tray_segments_count: result.success ? result.tray_segments.length : 0,
                            segments_count: result.success ? result.route_segments.length : 0,
                            breakdown: result.success ? result.route_segments.map((seg, i) => ({
                                segment: i + 1,
                                tray_id: seg.type === 'field' ? 'Field Route' : (seg.tray_id || 'N/A'),
                                type: seg.type,
                                from: formatPoint(seg.start),
                                to: formatPoint(seg.end),
                                length: seg.length.toFixed(2)
                            })) : []
                        };
                    }
                });
            };

            const workerPromises = state.cableList.map((c, idx) => runCable(c, idx));
            await Promise.all(workerPromises);

            if (cancelRouting) {
                elements.progressLabel.textContent = 'Cancelled';
                elements.progressContainer.style.display = 'none';
                elements.cancelRoutingBtn.style.display = 'none';
                return;
            }

            renderBatchResults(batchResults);
            state.latestRouteData = batchResults;
            const common = routingSystem.findCommonFieldRoutes(allRoutesForPlotting, 6);
            state.sharedFieldRoutes = common;
            if (common.length > 0) {
                let html = '<h4>Potential Shared Field Routes</h4><ul>';
                common.forEach(c => {
                    const group = c.allowed_cable_group ? ` (Group ${c.allowed_cable_group})` : '';
                    html += `<li>${c.name}${group}: ${formatPoint(c.start)} to ${formatPoint(c.end)} - ${c.cables.join(', ')}</li>`;
                });
                html += '</ul>';
                elements.metrics.innerHTML = html;
            } else {
                elements.metrics.innerHTML = '<p>No common field routes detected.</p>';
            }
            visualize(trayDataForRun, allRoutesForPlotting, "Batch Route Visualization");
        } else {
            alert('Please add at least one cable to route.');
            elements.cancelRoutingBtn.style.display = 'none';
            elements.progressContainer.style.display = 'none';
            return;
        }
        
        const finalUtilization = routingSystem.getTrayUtilization();
        const fillLimit = parseFloat(elements.fillLimitIn.value) / 100;
        const fillLimitPct = fillLimit * 100;
        const utilData = Object.entries(finalUtilization).map(([id, data]) => {
            const fullPct = (data.current_fill * fillLimit / data.max_fill) * 100;
            return {
                tray_id: id,
                full_pct: fullPct,
                utilization: data.utilization_percentage.toFixed(1),
                available: data.available_capacity.toFixed(2)
            };
        });
        const formatters = {
            full_pct: (val) => {
                const pct = Math.min(val, 100).toFixed(1);
                const color = val > 80 ? 'var(--error-bg)' : val > 60 ? 'var(--warning-bg)' : 'var(--success-bg)';
                return `
                    <div class="util-bar">
                        <div class="util-bar-fill" style="width:${pct}%; background-color:${color};"></div>
                        <div class="util-bar-marker" style="left:${fillLimitPct}%;"></div>
                    </div>
                    <span class="util-label">${pct}%</span>
                `;
            }
        };
        renderTable(
            elements.updatedUtilizationContainer,
            [
                { label: 'Tray ID', key: 'tray_id' },
                { label: 'Utilization', key: 'full_pct' },
                { label: 'Available (in²)', key: 'available' }
            ],
            utilData,
            (row) => utilizationStyle(row),
            formatters
        );

        elements.progressLabel.textContent = 'Complete';
        elements.progressContainer.style.display = 'none';
        elements.cancelRoutingBtn.style.display = 'none';
    };
    
    // --- VISUALIZATION ---
    const visualize = (trays, routes, title) => {
        const traces = [];

        const trayMesh = (tray) => {
            const w = tray.width / 12; // inches to ft
            const h = tray.height / 12;
            const sx = tray.start_x, sy = tray.start_y, sz = tray.start_z;
            const ex = tray.end_x, ey = tray.end_y, ez = tray.end_z;
            let verts;
            if (sx !== ex) { // along X
                const y1 = sy - w / 2, y2 = sy + w / 2;
                const z1 = sz - h / 2, z2 = sz + h / 2;
                verts = [[sx,y1,z1],[sx,y2,z1],[sx,y2,z2],[sx,y1,z2],[ex,y1,z1],[ex,y2,z1],[ex,y2,z2],[ex,y1,z2]];
            } else if (sy !== ey) { // along Y
                const x1 = sx - w / 2, x2 = sx + w / 2;
                const z1 = sz - h / 2, z2 = sz + h / 2;
                verts = [[x1,sy,z1],[x2,sy,z1],[x2,sy,z2],[x1,sy,z2],[x1,ey,z1],[x2,ey,z1],[x2,ey,z2],[x1,ey,z2]];
            } else { // along Z
                const x1 = sx - w / 2, x2 = sx + w / 2;
                const y1 = sy - h / 2, y2 = sy + h / 2;
                verts = [[x1,y1,sz],[x2,y1,sz],[x2,y2,sz],[x1,y2,sz],[x1,y1,ez],[x2,y1,ez],[x2,y2,ez],[x1,y2,ez]];
            }
            const x = verts.map(v => v[0]);
            const y = verts.map(v => v[1]);
            const z = verts.map(v => v[2]);
            const i = [0,0,4,4,3,3,0,0,0,0,1,1];
            const j = [1,2,5,6,2,6,1,5,3,7,2,6];
            const k = [2,3,6,7,6,7,5,4,7,4,6,5];
            return {type:'mesh3d', x, y, z, i, j, k, opacity:0.3, color:'lightgrey', name: tray.tray_id, hoverinfo:'name'};
        };

        trays.forEach(tray => {
            traces.push(trayMesh(tray));
            const midX = (tray.start_x + tray.end_x) / 2;
            const midY = (tray.start_y + tray.end_y) / 2;
            const midZ = (tray.start_z + tray.end_z) / 2 + (tray.height / 12) / 2 + 0.5;
            traces.push({type:'scatter3d', mode:'text', x:[midX], y:[midY], z:[midZ], text:[tray.tray_id], showlegend:false, hoverinfo:'none'});
        });

        if (routes && routes.length > 0) {
            // Sort routes alphanumerically by label so the legend order is predictable
            routes = routes.slice().sort((a, b) => {
                const la = a.label || '';
                const lb = b.label || '';
                return la.localeCompare(lb, undefined, { numeric: true, sensitivity: 'base' });
            });

            const palette = ['blue', 'green', 'orange', 'purple', 'brown', 'cyan', 'magenta', 'olive'];
            const seenTags = new Set();

            routes.forEach((route, idx) => {
                const color = palette[idx % palette.length];
                const label = route.label || `Route ${idx+1}`;

                // Placeholder trace to show legend entry without drawing a line
                traces.push({
                    x: [null], y: [null], z: [null],
                    mode: 'lines', type: 'scatter3d',
                    name: label, legendgroup: label, showlegend: true,
                    line: { color, width: 5 }, hoverinfo: 'skip'
                });

                route.segments.forEach(seg => {
                    traces.push({
                        x: [seg.start[0], seg.end[0]], y: [seg.start[1], seg.end[1]], z: [seg.start[2], seg.end[2]],
                        mode: 'lines', type: 'scatter3d',
                        name: label, legendgroup: label, showlegend: false,
                        line: { color: seg.type === 'tray' ? color : 'red', width: 5 }
                    });
                });

                if (route.startPoint && route.endPoint) {
                    traces.push({
                        x: [route.startPoint[0]], y: [route.startPoint[1]], z: [route.startPoint[2]],
                        mode: 'markers', type: 'scatter3d', showlegend: false,
                        marker: { color: 'green', size: 8 }
                    });
                    traces.push({
                        x: [route.endPoint[0]], y: [route.endPoint[1]], z: [route.endPoint[2]],
                        mode: 'markers', type: 'scatter3d', showlegend: false,
                        marker: { color: 'purple', size: 8 }
                    });
                    if (route.startTag && !seenTags.has(`s-${route.startTag}`)) {
                        traces.push({type:'scatter3d', mode:'text', x:[route.startPoint[0]], y:[route.startPoint[1]], z:[route.startPoint[2]], text:[route.startTag], showlegend:false, hoverinfo:'none'});
                        seenTags.add(`s-${route.startTag}`);
                    }
                    if (route.endTag && !seenTags.has(`e-${route.endTag}`)) {
                        traces.push({type:'scatter3d', mode:'text', x:[route.endPoint[0]], y:[route.endPoint[1]], z:[route.endPoint[2]], text:[route.endTag], showlegend:false, hoverinfo:'none'});
                        seenTags.add(`e-${route.endTag}`);
                    }
                }
            });
        }

    const layout = {
        title: title,
        scene: { aspectmode: 'data' },
        legend: { x: 1, y: 0, xanchor: 'right', yanchor: 'bottom' },
        autosize: true,
        margin: { l: 0, r: 0, t: 0, b: 0 }
    };
    Plotly.newPlot(elements.plot3d, traces, layout, {responsive: true});
    window.current3DPlot = { traces: traces, layout: layout };
    };

    const popOutPlot = () => {
        if (!window.current3DPlot) return;
        const html = `<!DOCTYPE html>
<html><head><title>3D Route Visualization</title>
<meta charset="UTF-8">
<script src="https://cdn.plot.ly/plotly-latest.min.js"><\/script>
<style>html,body{margin:0;height:100%;overflow:hidden;}#plot{width:100%;height:100%;}</style>
</head><body>
<div id="plot"></div>
<script>const data = ${JSON.stringify(window.current3DPlot.traces)};
const layout = ${JSON.stringify(window.current3DPlot.layout)};
Plotly.newPlot(document.getElementById('plot'), data, layout, {responsive: true});<\/script>
</body></html>`;
        const pop = window.open('', '_blank');
        if (pop) { pop.document.write(html); pop.document.close(); }
    };
    
    
    // --- INITIALIZATION & EVENT LISTENERS ---
    elements.fillLimitIn.addEventListener('input', updateFillLimitDisplay);
    elements.calculateBtn.addEventListener('click', mainCalculation);
    elements.inputMethodRadios.forEach(radio => radio.addEventListener('change', handleInputMethodChange));
    elements.addTrayBtn.addEventListener('click', addManualTray);
    elements.clearTraysBtn.addEventListener('click', clearManualTrays);
    elements.exportTraysBtn.addEventListener('click', exportManualTraysCSV);
    elements.importTraysBtn.addEventListener('click', () => elements.importTraysFile.click());
    elements.importTraysFile.addEventListener('change', importManualTraysCSV);
    elements.loadSampleCablesBtn.addEventListener('click', loadSampleCables);
    elements.addCableBtn.addEventListener('click', addCableToBatch);
    elements.clearCablesBtn.addEventListener('click', clearCableList);
    elements.exportCablesBtn.addEventListener('click', exportCableOptionsCSV);
    elements.importCablesBtn.addEventListener('click', () => elements.importCablesFile.click());
    elements.importCablesFile.addEventListener('change', importCableOptionsCSV);
    elements.exportCsvBtn.addEventListener('click', exportRouteXLSX);
    elements.popoutPlotBtn.addEventListener('click', popOutPlot);
    elements.cancelRoutingBtn.addEventListener('click', cancelCurrentRouting);

    // remove validation error highlight when typing
    ['t-id','t-sx','t-sy','t-sz','t-ex','t-ey','t-ez','t-w','t-h','t-fill','t-group'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => el.classList.remove('input-error'));
        }
    });
    // Initial setup
    updateCableArea();
    handleInputMethodChange();
});

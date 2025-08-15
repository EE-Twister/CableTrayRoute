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
        // Limit distance between generic field nodes to keep the graph from
        // growing quadratically when many trays are present
        this.maxFieldEdge = options.maxFieldEdge || 1000;
        // Limit the number of field connections per node to cap memory usage
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

    findCommonFieldRoutes(routes, tolerance = 1, cableMap = null) {
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
        return Object.values(map).map(r => {
            const cables = Array.from(r.cables);
            let totalArea = 0;
            if (cableMap) {
                cables.forEach(n => {
                    const d = cableMap.get(n);
                    if (d) totalArea += Math.PI * (d / 2) ** 2;
                });
            }
            return {
                name: `Route ${count++}`,
                start: r.start,
                end: r.end,
                allowed_cable_group: r.group,
                cables,
                total_area: totalArea,
                cable_count: cables.length
            };
        });
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

    _manualRoute(startPoint, endPoint, cableArea, allowedGroup, manualPath) {
        const path = manualPath.trim();
        if (!path) return null;
        if (/[a-zA-Z]/.test(path)) {
            const trayIds = path.split(/[>\s]+/).filter(Boolean);
            const segments = [];
            const traySegments = [];
            let prev = startPoint.slice();
            for (const id of trayIds) {
                const tray = this.trays.get(id);
                if (!tray) return { success: false, manual: true, manual_raceway: false, message: `Tray ${id} not found` };
                if (tray.allowed_cable_group && allowedGroup && tray.allowed_cable_group !== allowedGroup) {
                    return { success: false, manual: true, manual_raceway: false, message: `Tray ${id} not allowed` };
                }
                if (tray.current_fill + cableArea > tray.maxFill) {
                    return { success: false, manual: true, manual_raceway: false, message: `Tray ${id} over capacity` };
                }
                const a = [tray.start_x, tray.start_y, tray.start_z];
                const b = [tray.end_x, tray.end_y, tray.end_z];
                if (segments.length === 0) {
                    if (this.distance(prev, a) > 0) {
                        segments.push({ start: prev, end: a, length: this.distance(prev, a), type: 'field' });
                    }
                } else {
                    const last = segments[segments.length - 1].end;
                    if (this.distance(last, a) > 0.1) {
                        return { success: false, manual: true, manual_raceway: false, message: `Tray sequence mismatch at ${id}` };
                    }
                }
                const len = this.distance(a, b);
                segments.push({ start: a, end: b, length: len, type: 'tray', tray_id: id });
                traySegments.push(id);
                prev = b;
            }
            if (this.distance(prev, endPoint) > 0) {
                segments.push({ start: prev, end: endPoint, length: this.distance(prev, endPoint), type: 'field' });
            }
            const total = segments.reduce((s, seg) => s + seg.length, 0);
            const fieldLen = segments.filter(seg => seg.type === 'field').reduce((s, seg) => s + seg.length, 0);
            return {
                success: true,
                manual: true,
                manual_raceway: false,
                route_segments: segments,
                tray_segments: traySegments,
                total_length: total,
                field_routed_length: fieldLen,
            };
        } else {
            const points = path.split(/\s*;\s*/).filter(Boolean).map(p => p.split(',').map(Number));
            if (points.some(pt => pt.length !== 3 || pt.some(isNaN))) {
                return { success: false, manual: true, manual_raceway: false, message: 'Invalid waypoint format' };
            }
            const segments = [];
            let prev = startPoint.slice();
            points.forEach(pt => {
                segments.push({ start: prev, end: pt, length: this.distance(prev, pt), type: 'field' });
                prev = pt;
            });
            segments.push({ start: prev, end: endPoint, length: this.distance(prev, endPoint), type: 'field' });
            const total = segments.reduce((s, seg) => s + seg.length, 0);
            return {
                success: true,
                manual: true,
                manual_raceway: false,
                route_segments: segments,
                tray_segments: [],
                total_length: total,
                field_routed_length: total,
            };
        }
    }
    _racewayRoute(startPoint, endPoint, cableArea, allowedGroup, racewayIds) {
        if (!Array.isArray(racewayIds) || racewayIds.length === 0) return null;
        const knownIds = racewayIds.filter(id => this.trays.has(id));
        if (knownIds.length === 0) return null;
        if (knownIds.length < racewayIds.length) {
            console.warn(`Unknown raceway IDs: ${racewayIds.filter(id => !this.trays.has(id)).join(', ')}`);
        }
        const segments = [];
        const traySegments = [];
        let prev = startPoint.slice();
        for (const id of knownIds) {
            const tray = this.trays.get(id);
            if (tray.allowed_cable_group && allowedGroup && tray.allowed_cable_group !== allowedGroup) {
                return { success: false, manual: true, manual_raceway: true, message: `Tray ${id} not allowed` };
            }
            if (tray.current_fill + cableArea > tray.maxFill) {
                return { success: false, manual: true, manual_raceway: true, message: `Tray ${id} over capacity` };
            }
            const a = [tray.start_x, tray.start_y, tray.start_z];
            const b = [tray.end_x, tray.end_y, tray.end_z];
            if (this.distance(prev, a) > 0) {
                segments.push({ start: prev, end: a, length: this.distance(prev, a), type: 'field' });
            }
            const len = this.distance(a, b);
            segments.push({ start: a, end: b, length: len, type: 'tray', tray_id: id });
            traySegments.push(id);
            prev = b;
        }
        if (this.distance(prev, endPoint) > 0) {
            segments.push({ start: prev, end: endPoint, length: this.distance(prev, endPoint), type: 'field' });
        }
        const total = segments.reduce((s, seg) => s + seg.length, 0);
        const fieldLen = segments.filter(seg => seg.type === 'field').reduce((s, seg) => s + seg.length, 0);
        return {
            success: true,
            manual: true,
            manual_raceway: true,
            route_segments: segments,
            tray_segments: traySegments,
            total_length: total,
            field_routed_length: fieldLen,
        };
    }
    calculateRoute(startPoint, endPoint, cableArea, allowedGroup, manualPath = '', racewayIds = []) {
        if (manualPath && manualPath.trim()) {
            return this._manualRoute(startPoint, endPoint, cableArea, allowedGroup, manualPath);
        }
        if (racewayIds && racewayIds.length > 0) {
            const manualResult = this._racewayRoute(startPoint, endPoint, cableArea, allowedGroup, racewayIds);
            if (manualResult) return manualResult;
        }
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
            if (tray.current_fill + cableArea > tray.maxFill ||
                (tray.allowed_cable_group &&
                 tray.allowed_cable_group !== allowedGroup)) {
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
            manual: false,
            manual_raceway: false,
        };
    }
}


self.onmessage = function(e) {
    const { trays, options, baseGraph, cable, cableArea } = e.data;
    const system = new CableRoutingSystem(options);
    trays.forEach(t => system.addTraySegment(t));
    system.baseGraph = baseGraph;
    const result = system.calculateRoute(
        cable.start,
        cable.end,
        cableArea,
        cable.allowed_cable_group,
        cable.manual_path || '',
        cable.raceway_ids || []
    );
    self.postMessage(result);
};

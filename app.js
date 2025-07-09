// Filename: app.js
// (This is an improved version that adds route segment consolidation)

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let state = {
        manualTrays: [],
        cableList: [],
        trayData: [],
        latestRouteData: [],
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
        exportCablesBtn: document.getElementById('export-cables-btn'),
        importCablesFile: document.getElementById('import-cables-file'),
        importCablesBtn: document.getElementById('import-cables-btn'),
        clearCablesBtn: document.getElementById('clear-cables-btn'),
        addCableBtn: document.getElementById('add-cable-btn'),
        cableListContainer: document.getElementById('cable-list-container'),
        resultsSection: document.getElementById('results-section'),
        messages: document.getElementById('messages'),
        metrics: document.getElementById('metrics'),
        routeBreakdownContainer: document.getElementById('route-breakdown-container'),
        plot3d: document.getElementById('plot-3d'),
        updatedUtilizationContainer: document.getElementById('updated-utilization-container'),
        exportCsvBtn: document.getElementById('export-csv-btn'),
    };
    
    // --- CORE ROUTING LOGIC (JavaScript implementation of your Python backend) ---

    class CableRoutingSystem {
        constructor(options) {
            this.fillLimit = options.fillLimit || 0.4;
            this.proximityThreshold = options.proximityThreshold || 72.0;
            this.fieldPenalty = options.fieldPenalty || 3.0;
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

        calculateRoute(startPoint, endPoint, cableArea) {
            // 1. Build the graph
            const graph = { nodes: {}, edges: {} };
            const addNode = (id, point, type = 'generic') => {
                graph.nodes[id] = { point, type };
                graph.edges[id] = {};
            };
            const addEdge = (id1, id2, weight, type, trayId = null) => {
                graph.edges[id1][id2] = { weight, type, trayId };
                graph.edges[id2][id1] = { weight, type, trayId };
            };

            addNode('start', startPoint, 'start');
            addNode('end', endPoint, 'end');

            // Add tray endpoints as nodes if they have capacity
            this.trays.forEach(tray => {
                if (tray.current_fill + cableArea <= tray.maxFill) {
                    const startId = `${tray.tray_id}_start`;
                    const endId = `${tray.tray_id}_end`;
                    addNode(startId, [tray.start_x, tray.start_y, tray.start_z], 'tray_endpoint');
                    addNode(endId, [tray.end_x, tray.end_y, tray.end_z], 'tray_endpoint');
                    const trayLength = this.distance(graph.nodes[startId].point, graph.nodes[endId].point);
                    addEdge(startId, endId, trayLength, 'tray', tray.tray_id);
                }
            });

            // Connect tray endpoints that lie on other trays
            this.trays.forEach(trayA => {
                const endpoints = [
                    { id: `${trayA.tray_id}_start`, point: [trayA.start_x, trayA.start_y, trayA.start_z] },
                    { id: `${trayA.tray_id}_end`, point: [trayA.end_x, trayA.end_y, trayA.end_z] }
                ];
                this.trays.forEach(trayB => {
                    if (trayA.tray_id === trayB.tray_id) return;
                    const a = [trayB.start_x, trayB.start_y, trayB.start_z];
                    const b = [trayB.end_x, trayB.end_y, trayB.end_z];
                    endpoints.forEach(ep => {
                        const proj = this.projectPointOnSegment(ep.point, a, b);
                        if (this.distance(ep.point, proj) < 0.1) {
                            const projId = `${ep.id}_on_${trayB.tray_id}`;
                            addNode(projId, proj, 'projection');
                            addEdge(ep.id, projId, 0.1, 'tray_connection', trayB.tray_id);
                            addEdge(projId, `${trayB.tray_id}_start`, this.distance(proj, a), 'tray', trayB.tray_id);
                            addEdge(projId, `${trayB.tray_id}_end`, this.distance(proj, b), 'tray', trayB.tray_id);
                        }
                    });
                });
            });

            // Add edges between all nodes (field routing and tray-to-tray connections)
            const nodeIds = Object.keys(graph.nodes);
            for (let i = 0; i < nodeIds.length; i++) {
                for (let j = i + 1; j < nodeIds.length; j++) {
                    const id1 = nodeIds[i];
                    const id2 = nodeIds[j];
                    const p1 = graph.nodes[id1].point;
                    const p2 = graph.nodes[id2].point;
                    
                    const isSameTray = id1.startsWith(id2.split('_')[0]) && id2.startsWith(id1.split('_')[0]);
                    if (graph.edges[id1][id2] || (id1.includes('_') && isSameTray)) continue;

                    const dist = this.manhattanDistance(p1, p2);
                    // Connect physically adjacent tray endpoints with minimal cost
                    const weight = dist < 0.1 ? 0.1 : dist * this.fieldPenalty;
                    const type = dist < 0.1 ? 'tray_connection' : 'field';
                    addEdge(id1, id2, weight, type);
                }
            }
            
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
                    addEdge('start', projId, distToProjStart * this.fieldPenalty, 'field');
                    addEdge(projId, startId, this.distance(projStart, a), 'tray', tray.tray_id);
                    addEdge(projId, `${tray.tray_id}_end`, this.distance(projStart, b), 'tray', tray.tray_id);
                }

                // Project cable's end point
                const projEnd = this.projectPointOnSegment(endPoint, a, b);
                const distToProjEnd = this.manhattanDistance(endPoint, projEnd);
                if (distToProjEnd <= this.proximityThreshold) {
                    const projId = `proj_end_on_${tray.tray_id}`;
                    addNode(projId, projEnd, 'projection');
                    addEdge('end', projId, distToProjEnd * this.fieldPenalty, 'field');
                    addEdge(projId, startId, this.distance(projEnd, a), 'tray', tray.tray_id);
                    addEdge(projId, `${tray.tray_id}_end`, this.distance(projEnd, b), 'tray', tray.tray_id);
                }
            });
            
            // 2. Dijkstra's Algorithm
            const distances = {};
            const prev = {};
            const pq = new Set(Object.keys(graph.nodes));
            Object.keys(graph.nodes).forEach(node => distances[node] = Infinity);
            distances['start'] = 0;

            while (pq.size > 0) {
                let u = null;
                for (const node of pq) {
                    if (u === null || distances[node] < distances[u]) {
                        u = node;
                    }
                }
                if (u === 'end' || distances[u] === Infinity) break;
                pq.delete(u);

                for (const v in graph.edges[u]) {
                    const edge = graph.edges[u][v];
                    const alt = distances[u] + edge.weight;
                    if (alt < distances[v]) {
                        distances[v] = alt;
                        prev[v] = { node: u, edge };
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

            return {
                success: true,
                total_length: totalLength,
                field_routed_length: fieldRoutedLength,
                route_segments: this._consolidateSegments(routeSegments), // Use the new consolidation method
                tray_segments: Array.from(traySegments),
                warnings: [],
            };
        }
    }

    // --- EVENT HANDLERS & UI LOGIC (This part remains the same) ---
    
    const getSampleTrays = () => [
        {"tray_id": "H1-A", "start_x": 0, "start_y": 0, "start_z": 10, "end_x": 40, "end_y": 0, "end_z": 10, "width": 16, "height": 3.94, "current_fill": 9.30},
        {"tray_id": "H1-B", "start_x": 40, "start_y": 0, "start_z": 10, "end_x": 80, "end_y": 0, "end_z": 10, "width": 16, "height": 3.94, "current_fill": 6.98},
        {"tray_id": "H1-C", "start_x": 80, "start_y": 0, "start_z": 10, "end_x": 120, "end_y": 0, "end_z": 10, "width": 16, "height": 3.94, "current_fill": 12.71},
        {"tray_id": "H2-A", "start_x": 0, "start_y": 0, "start_z": 30, "end_x": 40, "end_y": 0, "end_z": 30, "width": 12, "height": 3.15, "current_fill": 4.96},
        {"tray_id": "H2-B", "start_x": 40, "start_y": 0, "start_z": 30, "end_x": 80, "end_y": 0, "end_z": 30, "width": 12, "height": 3.15, "current_fill": 8.99},
        {"tray_id": "H2-C", "start_x": 80, "start_y": 0, "start_z": 30, "end_x": 120, "end_y": 0, "end_z": 30, "width": 12, "height": 3.15, "current_fill": 3.26},
        {"tray_id": "V1", "start_x": 40, "start_y": 0, "start_z": 10, "end_x": 40, "end_y": 0, "end_z": 30, "width": 8, "height": 2.36, "current_fill": 2.79},
        {"tray_id": "V2", "start_x": 80, "start_y": 0, "start_z": 10, "end_x": 80, "end_y": 0, "end_z": 30, "width": 8, "height": 2.36, "current_fill": 3.41},
        {"tray_id": "C1", "start_x": 60, "start_y": 0, "start_z": 10, "end_x": 60, "end_y": 40, "end_z": 10, "width": 9, "height": 2.95, "current_fill": 5.43},
        {"tray_id": "C2", "start_x": 100, "start_y": 0, "start_z": 30, "end_x": 100, "end_y": 60, "end_z": 30, "width": 9, "height": 2.95, "current_fill": 6.36},
        {"tray_id": "B1", "start_x": 60, "start_y": 40, "start_z": 10, "end_x": 60, "end_y": 80, "end_z": 10, "width": 6, "height": 1.97, "current_fill": 1.86},
        {"tray_id": "B2", "start_x": 100, "start_y": 60, "start_z": 30, "end_x": 100, "end_y": 100, "end_z": 30, "width": 6, "height": 1.97, "current_fill": 1.40},
        {"tray_id": "TRUNK", "start_x": 0, "start_y": 20, "start_z": 50, "end_x": 120, "end_y": 20, "end_z": 50, "width": 24, "height": 5.91, "current_fill": 27.90},
        {"tray_id": "EQ1", "start_x": 20, "start_y": 0, "start_z": 10, "end_x": 20, "end_y": 15, "end_z": 5, "width": 4, "height": 1.57, "current_fill": 1.24},
        {"tray_id": "EQ2", "start_x": 100, "start_y": 60, "start_z": 30, "end_x": 110, "end_y": 90, "end_z": 20, "width": 4, "height": 1.57, "current_fill": 0.93},
        {"tray_id": "CONN1", "start_x": 120, "start_y": 0, "start_z": 10, "end_x": 120, "end_y": 20, "end_z": 25, "width": 8, "height": 2.95, "current_fill": 3.10},
        {"tray_id": "CONN2", "start_x": 120, "start_y": 20, "start_z": 25, "end_x": 120, "end_y": 20, "end_z": 50, "width": 8, "height": 2.95, "current_fill": 2.33}
    ];
    
    const getSampleCables = () => [
        {
            name: "Power Cable 1",
            diameter: 1.26,
            start: [5, 5, 5],
            end: [110, 95, 45],
            start_tag: "ST1",
            end_tag: "ET1"
        },
        {
            name: "Control Cable 1",
            diameter: 0.47,
            start: [10, 0, 10],
            end: [100, 80, 25],
            start_tag: "ST2",
            end_tag: "ET2"
        },
        {
            name: "Data Cable 1",
            diameter: 0.31,
            start: [15, 5, 15],
            end: [105, 85, 30],
            start_tag: "ST3",
            end_tag: "ET3"
        },
        {
            name: "Power Cable 2",
            diameter: 1.10,
            start: [20, 10, 8],
            end: [115, 90, 35],
            start_tag: "ST4",
            end_tag: "ET4"
        },
        {
            name: "Control Cable 2",
            diameter: 0.59,
            start: [25, 15, 12],
            end: [95, 75, 28],
            start_tag: "ST5",
            end_tag: "ET5"
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
    };
    

    const addManualTray = () => {
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
        };
        if (!newTray.tray_id || isNaN(newTray.width)) {
            alert("Please fill in at least Tray ID and Width.");
            return;
        }
        state.manualTrays.push(newTray);
        state.trayData = state.manualTrays;
        renderManualTrayTable();
        updateTrayDisplay();
    };

    const clearManualTrays = () => {
        state.manualTrays = [];
        state.trayData = [];
        elements.manualTrayTableContainer.innerHTML = '';
        updateTrayDisplay();
    };

    const renderManualTrayTable = () => {
        if (state.manualTrays.length === 0) {
            elements.manualTrayTableContainer.innerHTML = '';
            return;
        }
        let table = '<table><thead><tr><th>Tray ID</th><th>Start X</th><th>End X</th><th>Width</th><th>Height</th><th>Current Fill</th><th>Actions</th></tr></thead><tbody>';
        state.manualTrays.forEach((t, idx) => {
            table += `<tr><td>${t.tray_id}</td><td>${t.start_x}</td><td>${t.end_x}</td><td>${t.width}</td><td>${t.height}</td><td>${t.current_fill}</td>` +
                     `<td><button class="edit-tray" data-idx="${idx}">Edit</button>` +
                     `<button class="delete-tray" data-idx="${idx}">Delete</button>` +
                     `<button class="dup-tray" data-idx="${idx}">Duplicate</button></td></tr>`;
        });
        table += '</tbody></table>';
        elements.manualTrayTableContainer.innerHTML = table;

        elements.manualTrayTableContainer.querySelectorAll('.delete-tray').forEach(btn => {
            btn.addEventListener('click', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                state.manualTrays.splice(i, 1);
                state.trayData = state.manualTrays;
                renderManualTrayTable();
                updateTrayDisplay();
            });
        });
        elements.manualTrayTableContainer.querySelectorAll('.edit-tray').forEach(btn => {
            btn.addEventListener('click', e => {
                const i = parseInt(e.target.dataset.idx, 10);
                const t = state.manualTrays[i];
                document.getElementById('t-id').value = t.tray_id;
                document.getElementById('t-sx').value = t.start_x;
                document.getElementById('t-sy').value = t.start_y;
                document.getElementById('t-sz').value = t.start_z;
                document.getElementById('t-ex').value = t.end_x;
                document.getElementById('t-ey').value = t.end_y;
                document.getElementById('t-ez').value = t.end_z;
                document.getElementById('t-w').value = t.width;
                document.getElementById('t-h').value = t.height;
                document.getElementById('t-fill').value = t.current_fill;
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
    };

    const exportManualTraysCSV = () => {
        const headers = ['tray_id','start_x','start_y','start_z','end_x','end_y','end_z','width','height','current_fill'];
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
            const headers = lines[0].split(',');
            const newTrays = [];
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const vals = lines[i].split(',');
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
                    current_fill: parseFloat(t.current_fill) || 0
                });
            }
            state.manualTrays = newTrays;
            state.trayData = state.manualTrays;
            renderManualTrayTable();
            updateTrayDisplay();
        };
        reader.readAsText(file);
    };

    const renderBatchResults = (results) => {
        let html = '';
        results.forEach(res => {
            html += `<details><summary>${res.cable} | ${res.status} | Total ${res.total_length} | Field ${res.field_length} | Segments ${res.segments_count}</summary>`;
            if (res.breakdown && res.breakdown.length > 0) {
                html += '<table><thead><tr><th>Segment</th><th>Tray ID</th><th>Type</th><th>From</th><th>To</th><th>Length</th></tr></thead><tbody>';
                res.breakdown.forEach(b => {
                    html += `<tr><td>${b.segment}</td><td>${b.tray_id}</td><td>${b.type}</td><td>${b.from}</td><td>${b.to}</td><td>${b.length}</td></tr>`;
                });
                html += '</tbody></table>';
            }
            html += '</details>';
        });
        elements.routeBreakdownContainer.innerHTML = html;
    };
    
    const updateCableListDisplay = () => {
        if (state.cableList.length === 0) {
            elements.cableListContainer.innerHTML = '';
            return;
        }
        let html = '<h4>Cables to Route:</h4><table><thead><tr><th>Tag</th><th>Start Tag</th><th>End Tag</th><th>Diameter (in)</th><th>Start (X,Y,Z)</th><th>End (X,Y,Z)</th><th></th><th></th></tr></thead><tbody>';
        state.cableList.forEach((c, idx) => {
            html += `<tr>
                        <td><input type="text" class="cable-tag-input" data-idx="${idx}" value="${c.name}"></td>
                        <td><input type="text" class="cable-start-tag-input" data-idx="${idx}" value="${c.start_tag || ''}" style="width:80px;"></td>
                        <td><input type="text" class="cable-end-tag-input" data-idx="${idx}" value="${c.end_tag || ''}" style="width:80px;"></td>
                        <td><input type="number" class="cable-diameter-input" data-idx="${idx}" value="${c.diameter}" step="0.01" style="width:60px;"></td>
                        <td>
                            <input type="number" class="cable-start-input" data-idx="${idx}" data-coord="0" value="${c.start[0]}" step="0.1" style="width:50px;">
                            <input type="number" class="cable-start-input" data-idx="${idx}" data-coord="1" value="${c.start[1]}" step="0.1" style="width:50px;">
                            <input type="number" class="cable-start-input" data-idx="${idx}" data-coord="2" value="${c.start[2]}" step="0.1" style="width:50px;">
                        </td>
                        <td>
                            <input type="number" class="cable-end-input" data-idx="${idx}" data-coord="0" value="${c.end[0]}" step="0.1" style="width:50px;">
                            <input type="number" class="cable-end-input" data-idx="${idx}" data-coord="1" value="${c.end[1]}" step="0.1" style="width:50px;">
                            <input type="number" class="cable-end-input" data-idx="${idx}" data-coord="2" value="${c.end[2]}" step="0.1" style="width:50px;">
                        </td>
                        <td><button class="dup-cable" data-idx="${idx}">Duplicate</button></td>
                        <td><button class="del-cable" data-idx="${idx}">Delete</button></td>
                    </tr>`;
        });
        html += '</tbody></table>';
        elements.cableListContainer.innerHTML = html;
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
    };

    const loadSampleCables = () => {
        state.cableList = getSampleCables();
        updateCableListDisplay();
    };

    const addCableToBatch = () => {
        const newCable = {
            name: `Cable ${state.cableList.length + 1}`,
            diameter: 1.0,
            start: [0, 0, 0],
            end: [0, 0, 0],
            start_tag: '',
            end_tag: ''
        };
        state.cableList.push(newCable);
        updateCableListDisplay();
    };

    const clearCableList = () => {
        state.cableList = [];
        updateCableListDisplay();
    };

    const exportCableListCSV = () => {
        const headers = ['name','start_tag','end_tag','diameter','start_x','start_y','start_z','end_x','end_y','end_z'];
        let csv = headers.join(',') + '\n';
        state.cableList.forEach(c => {
            csv += [
                c.name,
                c.start_tag || '',
                c.end_tag || '',
                c.diameter,
                c.start[0], c.start[1], c.start[2],
                c.end[0], c.end[1], c.end[2]
            ].join(',') + '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cable_list.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const importCableListCSV = () => {
        const file = elements.importCablesFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const lines = e.target.result.trim().split(/\r?\n/);
            if (lines.length === 0) return;
            const headers = lines[0].split(',');
            const newCables = [];
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const vals = lines[i].split(',');
                const obj = {};
                headers.forEach((h, idx) => { obj[h.trim()] = vals[idx] !== undefined ? vals[idx].trim() : ''; });
                newCables.push({
                    name: obj.name || '',
                    start_tag: obj.start_tag || '',
                    end_tag: obj.end_tag || '',
                    diameter: parseFloat(obj.diameter) || 0,
                    start: [parseFloat(obj.start_x) || 0, parseFloat(obj.start_y) || 0, parseFloat(obj.start_z) || 0],
                    end: [parseFloat(obj.end_x) || 0, parseFloat(obj.end_y) || 0, parseFloat(obj.end_z) || 0]
                });
            }
            state.cableList = newCables;
            updateCableListDisplay();
        };
        reader.readAsText(file);
    };

    const showMessage = (type, text) => {
        elements.messages.innerHTML += `<div class="message ${type}">${text}</div>`;
    };

    const exportRouteCSV = () => {
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

        const headers = Object.keys(data[0]);
        let csv = headers.join(',') + '\n';

        data.forEach(row => {
            const line = headers.map(h => {
                let val = row[h];
                let str = String(val === undefined ? '' : val);
                if (str.includes('"')) {
                    str = str.replace(/"/g, '""');
                }
                if (str.includes(',') || str.includes('\n')) {
                    str = `"${str}"`;
                }
                return str;
            }).join(',');
            csv += line + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'route_data.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatPoint = (p) => `(${p[0].toFixed(1)}, ${p[1].toFixed(1)}, ${p[2].toFixed(1)})`;

    const mainCalculation = () => {
        elements.resultsSection.style.display = 'block';
        elements.messages.innerHTML = ''; 
        
        const routingSystem = new CableRoutingSystem({
            fillLimit: parseFloat(elements.fillLimitIn.value) / 100,
            proximityThreshold: parseFloat(document.getElementById('proximity-threshold').value),
            fieldPenalty: parseFloat(document.getElementById('field-route-penalty').value),
        });
        
        // Deep copy tray data so original state isn't mutated during batch routing
        const trayDataForRun = JSON.parse(JSON.stringify(state.trayData));
        trayDataForRun.forEach(tray => routingSystem.addTraySegment(tray));
        
        if (state.cableList.length > 0) {
            const batchResults = [];
            const allRoutesForPlotting = [];

            state.cableList.forEach(cable => {
                const cableArea = Math.PI * (cable.diameter / 2) ** 2;
                const result = routingSystem.calculateRoute(cable.start, cable.end, cableArea);
                
                if (result.success) {
                    routingSystem.updateTrayFill(result.tray_segments, cableArea);
                    allRoutesForPlotting.push({
                        label: cable.name,
                        segments: result.route_segments,
                        startPoint: cable.start,
                        endPoint: cable.end,
                        startTag: cable.start_tag,
                        endTag: cable.end_tag
                    });
                }
                
                batchResults.push({
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
                });
            });

            renderBatchResults(batchResults);
            state.latestRouteData = batchResults;
            elements.metrics.innerHTML = '';
            visualize(trayDataForRun, allRoutesForPlotting, "Batch Route Visualization");
        } else {
            alert('Please add at least one cable to route.');
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

        const layout = { title: title, scene: { aspectmode: 'data' }};
        Plotly.newPlot(elements.plot3d, traces, layout);
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
    elements.addCableBtn.addEventListener('click', addCableToBatch);    elements.clearCablesBtn.addEventListener('click', clearCableList);
    elements.exportCablesBtn.addEventListener('click', exportCableListCSV);
    elements.importCablesBtn.addEventListener('click', () => elements.importCablesFile.click());
    elements.importCablesFile.addEventListener('change', importCableListCSV);
    elements.exportCsvBtn.addEventListener('click', exportRouteCSV);

    // Initial setup
    updateCableArea();
    handleInputMethodChange();
});

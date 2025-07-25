const assert = require('assert');

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

  distance(p1, p2) {
    return Math.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2 + (p1[2]-p2[2])**2);
  }

  manhattanDistance(p1, p2) {
    return Math.abs(p1[0]-p2[0]) + Math.abs(p1[1]-p2[1]) + Math.abs(p1[2]-p2[2]);
  }

  projectPointOnSegment(p, a, b) {
    const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
    const ap = [p[0]-a[0], p[1]-a[1], p[2]-a[2]];
    const magAbSq = ab[0]*ab[0] + ab[1]*ab[1] + ab[2]*ab[2];
    if (magAbSq === 0) return a;
    const dot = ap[0]*ab[0] + ap[1]*ab[1] + ap[2]*ab[2];
    const t = Math.max(0, Math.min(1, dot/magAbSq));
    return [a[0]+t*ab[0], a[1]+t*ab[1], a[2]+t*ab[2]];
  }

  _consolidateSegments(segments) {
    if (segments.length === 0) return [];
    const consolidated = [];
    let current = { ...segments[0] };
    for (let i=1; i<segments.length; i++) {
      const next = segments[i];
      if (next.type === current.type && next.type === 'tray' && next.tray_id === current.tray_id) {
        current.end = next.end;
        current.length += next.length;
      } else {
        consolidated.push(current);
        current = { ...next };
      }
    }
    consolidated.push(current);
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

    const ps = segA.start.slice();
    const pe = segA.start.slice();
    ps[oA.axis] = start;
    pe[oA.axis] = end;
    return { start: ps, end: pe };
  }

  findCommonFieldRoutes(routes, tolerance = 1, cableMap = null) {
    const map = {};
    const keyFor = (s, e) => {
      const r = arr => arr.map(v => v.toFixed(2)).join(',');
      return `${r(s)}|${r(e)}`;
    };
    for (let i=0; i<routes.length; i++) {
      const a = routes[i];
      for (let j=i+1; j<routes.length; j++) {
        const b = routes[j];
        for (const segA of a.segments) {
          if (segA.type !== 'field') continue;
          for (const segB of b.segments) {
            if (segB.type !== 'field') continue;
            const ov = this._segmentsOverlap(segA, segB, tolerance);
            if (ov) {
              const key = keyFor(ov.start, ov.end);
              if (!map[key]) map[key] = { start: ov.start, end: ov.end, cables: new Set() };
              map[key].cables.add(a.label||a.name);
              map[key].cables.add(b.label||b.name);
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
          if (d) totalArea += Math.PI * (d/2)**2;
        });
      }
      return { name:`Route ${count++}`, start:r.start, end:r.end, cables, total_area: totalArea, cable_count: cables.length };
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

  recordSharedFieldSegments(segments) {
    segments.forEach(s => {
      if (s.type === 'field') {
        this.sharedFieldSegments.push({ start: s.start.slice(), end: s.end.slice() });
      }
    });
  }

  calculateRoute(startPoint, endPoint, cableArea) {
    const graph = { nodes: {}, edges: {} };
    const addNode = (id, point, type='generic') => { graph.nodes[id] = { point, type }; graph.edges[id] = {}; };
    const addEdge = (id1, id2, weight, type, trayId=null) => { graph.edges[id1][id2] = { weight, type, trayId }; graph.edges[id2][id1] = { weight, type, trayId }; };

    addNode('start', startPoint, 'start');
    addNode('end', endPoint, 'end');

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

    this.trays.forEach(trayA => {
      const startA = `${trayA.tray_id}_start`;
      const endA = `${trayA.tray_id}_end`;
      if (!graph.nodes[startA] || !graph.nodes[endA]) return;
      const endpoints = [
        { id:startA, point:graph.nodes[startA].point },
        { id:endA, point:graph.nodes[endA].point }
      ];
      this.trays.forEach(trayB => {
        if (trayA.tray_id === trayB.tray_id) return;
        const startB = `${trayB.tray_id}_start`;
        const endB = `${trayB.tray_id}_end`;
        if (!graph.nodes[startB] || !graph.nodes[endB]) return;
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
    for (let i=0; i<nodeIds.length; i++) {
      for (let j=i+1; j<nodeIds.length; j++) {
        const id1=nodeIds[i];
        const id2=nodeIds[j];
        const p1=graph.nodes[id1].point;
        const p2=graph.nodes[id2].point;
        const isSameTray=id1.startsWith(id2.split('_')[0]) && id2.startsWith(id1.split('_')[0]);
        if (graph.edges[id1][id2] || (id1.includes('_') && isSameTray)) continue;
        const dist=this.manhattanDistance(p1,p2);
        let weight,type;
        if(dist<0.1){
          weight=0.1;
          type='tray_connection';
        } else {
          const seg={start:p1,end:p2};
          const penalty=this._isSharedSegment(seg)?this.fieldPenalty*this.sharedPenalty:this.fieldPenalty;
          weight=dist*penalty;
          type='field';
        }
        addEdge(id1,id2,weight,type);
      }
    }

    this.trays.forEach(tray => {
      const startId=`${tray.tray_id}_start`;
      if (!graph.nodes[startId]) return;
      const a=graph.nodes[startId].point;
      const b=graph.nodes[`${tray.tray_id}_end`].point;
      const projStart=this.projectPointOnSegment(startPoint,a,b);
      const distToProjStart=this.manhattanDistance(startPoint,projStart);
      if (distToProjStart<=this.proximityThreshold) {
        const projId=`proj_start_on_${tray.tray_id}`;
        addNode(projId,projStart,'projection');
        const penStart=this._isSharedSegment({start:startPoint,end:projStart})?this.fieldPenalty*this.sharedPenalty:this.fieldPenalty;
        addEdge('start',projId,distToProjStart*penStart,'field');
        addEdge(projId,startId,this.distance(projStart,a),'tray',tray.tray_id);
        addEdge(projId,`${tray.tray_id}_end`,this.distance(projStart,b),'tray',tray.tray_id);
      }
      const projEnd=this.projectPointOnSegment(endPoint,a,b);
      const distToProjEnd=this.manhattanDistance(endPoint,projEnd);
      if (distToProjEnd<=this.proximityThreshold) {
        const projId=`proj_end_on_${tray.tray_id}`;
        addNode(projId,projEnd,'projection');
        const penEnd=this._isSharedSegment({start:endPoint,end:projEnd})?this.fieldPenalty*this.sharedPenalty:this.fieldPenalty;
        addEdge('end',projId,distToProjEnd*penEnd,'field');
        addEdge(projId,startId,this.distance(projEnd,a),'tray',tray.tray_id);
        addEdge(projId,`${tray.tray_id}_end`,this.distance(projEnd,b),'tray',tray.tray_id);
      }
    });

    const distances={};
    const prev={};
    Object.keys(graph.nodes).forEach(node=>distances[node]=Infinity);
    distances['start']=0;
    const pq=new MinHeap();
    pq.push('start',0);
    const visited=new Set();
    while(!pq.isEmpty()){
      const u=pq.pop();
      if(visited.has(u)) continue;
      visited.add(u);
      if(u==='end') break;
      for(const v in graph.edges[u]){
        const edge=graph.edges[u][v];
        const alt=distances[u]+edge.weight;
        if(alt<distances[v]){
          distances[v]=alt; prev[v]={node:u,edge}; pq.push(v,alt);
        }
      }
    }
    if(distances['end']===Infinity) return {success:false,error:'No valid path'};
    const path=[]; let current='end';
    while(current){ path.unshift(current); current=prev[current]?prev[current].node:null; }
    let totalLength=0; let fieldLen=0; const routeSegments=[]; const traySegments=new Set();
    for(let i=0;i<path.length-1;i++){
      const u=path[i]; const v=path[i+1]; const edge=graph.edges[u][v]||graph.edges[v][u];
      const p1=graph.nodes[u].point; const p2=graph.nodes[v].point;
      const length=edge.type==='field'?this.manhattanDistance(p1,p2):this.distance(p1,p2);
      totalLength+=length; if(edge.type==='field') fieldLen+=length;
      let type=edge.type; if(type==='tray_connection') type='tray';
      let tray_id=edge.trayId; if(!tray_id){ const node_id=u.includes('_')?u:v; tray_id=node_id.split('_')[0]; }
      if(type==='tray') traySegments.add(tray_id);
      if(edge.type==='field'){
        let curr=p1.slice();
        if(p2[0]!==curr[0]){ const next=[p2[0],curr[1],curr[2]]; routeSegments.push({type,start:curr,end:next,length:Math.abs(p2[0]-curr[0]),tray_id}); curr=next; }
        if(p2[1]!==curr[1]){ const next=[curr[0],p2[1],curr[2]]; routeSegments.push({type,start:curr,end:next,length:Math.abs(p2[1]-curr[1]),tray_id}); curr=next; }
        if(p2[2]!==curr[2]){ const next=[curr[0],curr[1],p2[2]]; routeSegments.push({type,start:curr,end:next,length:Math.abs(p2[2]-curr[2]),tray_id}); curr=next; }
      } else {
        routeSegments.push({type,start:p1,end:p2,length,tray_id});
      }
    }
    const cleaned = this._removeTrayBacktracking(routeSegments);
    return {success:true,total_length:totalLength,field_routed_length:fieldLen,route_segments:this._consolidateSegments(cleaned),tray_segments:Array.from(traySegments)};
  }
}

const getSampleTrays = () => [
  {"tray_id": "H1-A", "start_x": 0, "start_y": 0, "start_z": 10, "end_x": 40, "end_y": 0, "end_z": 10, "width": 16, "height": 3.94, "current_fill": 9.30, "allowed_cable_group": "HV"},
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
  { name:"Power Cable 1", diameter:1.26, start:[5,5,5], end:[110,95,45] },
  { name:"Control Cable 1", diameter:0.47, start:[10,0,10], end:[100,80,25] },
  { name:"Data Cable 1", diameter:0.31, start:[15,5,15], end:[105,85,30] },
  { name:"Power Cable 2", diameter:1.10, start:[20,10,8], end:[115,90,35] },
  { name:"Control Cable 2", diameter:0.59, start:[25,15,12], end:[95,75,28] }
];

function runBatch(count) {
  const system = new CableRoutingSystem({ sharedPenalty: 0.5, maxFieldNeighbors: 8 });
  getSampleTrays().forEach(t => system.addTraySegment({...t}));
  const cables = getSampleCables();
  const routes = [];
  for (let i=0; i<count; i++) {
    const cable = cables[i % cables.length];
    const area = Math.PI * (cable.diameter/2)**2;
    try {
      const res = system.calculateRoute(cable.start, cable.end, area);
      console.log(`Cable ${i+1}:`, res.success ? 'routed' : 'failed');
      if (res.success) {
        system.updateTrayFill(res.tray_segments, area);
        system.recordSharedFieldSegments(res.route_segments);
        routes.push({ name: cable.name, segments: res.route_segments });
      }
    } catch (err) {
      console.error(`Cable ${i+1} error:`, err.message);
      return;
    }
  }
  const cableMap = new Map(cables.map(c => [c.name, c.diameter]));
  const common = system.findCommonFieldRoutes(routes, 6, cableMap);
  if (common.length > 0) {
    console.log('Common field route segments:');
    common.forEach(c => {
      console.log(`  ${c.name} from ${c.start} to ${c.end}: ${c.cables.join(', ')} | area ${c.total_area.toFixed(2)}`);
    });
  } else {
    console.log('No common field routes detected');
  }
  console.log('Batch completed');
}

if (require.main === module) {
  runBatch(12);
}

// ----- Ductbank Thermal Calculations (ported from ductbankroute.html) -----
const AWG_AREA = {
  "18":1624,"16":2583,"14":4107,"12":6530,"10":10380,
  "8":16510,"6":26240,"4":41740,"3":52620,"2":66360,
  "1":83690,"1/0":105600,"2/0":133100,"3/0":167800,
  "4/0":211600
};

const BASE_RESISTIVITY = { cu: 0.017241, al: 0.028264 }; // ohm-mm^2/m @20C
const TEMP_COEFF = { cu: 0.00393, al: 0.00403 };

function sizeToArea(size) {
  if (!size) return 0;
  const s = size.toString().trim();
  if (/kcmil/i.test(s)) return parseFloat(s) * 1000;
  const m = s.match(/#?(\d+(?:\/0)?)/);
  if (!m) return 0;
  return AWG_AREA[m[1]] || 0;
}

function dcResistance(size, material, temp = 20) {
  const key = size ? size.toString().trim() : "";
  const mat = material && material.toLowerCase().includes("al") ? "al" : "cu";
  const areaCM = sizeToArea(key);
  if (!areaCM) return 0;
  const areaMM2 = areaCM * 0.0005067;
  const base = BASE_RESISTIVITY[mat] / areaMM2;
  return base * (1 + TEMP_COEFF[mat] * (temp - 20));
}

function neherMcGrathRise(power, Rth, depth, rho) {
  const k = 100 / (rho || 90);
  const r0 = 0.05;
  const radial = Math.log(Math.max(depth, r0) / r0) / (2 * Math.PI * k);
  return power * (Rth + radial);
}

const CONDUIT_SPECS = {
  "PVC Sch 40": { "4": 12.554 }
};

function solveDuctbankTemperatures(conduits, cables, params) {
  const width = 500;
  const height = 500;
  const scale = 40, margin = 20;
  const step = 4;
  const dx = (0.0254 / scale) * step;
  const nx = Math.ceil(width / step);
  const ny = Math.ceil(height / step);
  const k = 100 / ((params.soilResistivity) || 90);
  const hConv = 10;
  const Bi = hConv * dx / k;
  const earthT = params.earthTemp || 20;
  const airT = isNaN(params.airTemp) ? earthT : params.airTemp;

  const grid = Array.from({ length: ny }, () => Array(nx).fill(earthT));
  const newGrid = Array.from({ length: ny }, () => Array(nx).fill(earthT));
  const powerGrid = Array.from({ length: ny }, () => Array(nx).fill(0));
  const conduitCells = {};

  const heatMap = {};
  cables.forEach(c => {
    const cd = conduits.find(d => d.conduit_id === c.conduit_id);
    if (!cd) return;
    const Rin = Math.sqrt(CONDUIT_SPECS[cd.conduit_type][cd.trade_size] / Math.PI);
    const cx = (cd.x + Rin) * 0.0254;
    const cy = (cd.y + Rin) * 0.0254;
    const Rdc = dcResistance(c.conductor_size, c.conductor_material, 90);
    const current = parseFloat(c.est_load) || 0;
    const power = current * current * Rdc;
    if (!heatMap[c.conduit_id]) {
      heatMap[c.conduit_id] = { cx, cy, r: Rin * 0.0254, power: 0 };
    }
    heatMap[c.conduit_id].power += power;
  });

  Object.keys(heatMap).forEach(cid => {
    const h = heatMap[cid];
    const cxPx = Math.round((h.cx / 0.0254 * scale + margin) / step);
    const cyPx = Math.round((h.cy / 0.0254 * scale + margin) / step);
    const rPx = Math.max(1, Math.round((h.r / 0.0254 * scale) / step));
    const q = 4 * h.power / (Math.PI * h.r * h.r) * dx * dx / k;
    for (let j = Math.max(0, cyPx - rPx); j <= Math.min(ny - 1, cyPx + rPx); j++) {
      for (let i = Math.max(0, cxPx - rPx); i <= Math.min(nx - 1, cxPx + rPx); i++) {
        const dxp = i - cxPx, dyp = j - cyPx;
        if (dxp * dxp + dyp * dyp <= rPx * rPx) {
          powerGrid[j][i] += q;
          if (!conduitCells[cid]) conduitCells[cid] = [];
          conduitCells[cid].push([j, i]);
        }
      }
    }
  });

  let diff = Infinity, iter = 0, maxIter = 500;
  while (diff > 0.01 && iter < maxIter) {
    diff = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let val;
        if (j === ny - 1 || i === 0 || i === nx - 1) {
          val = earthT;
        } else if (j === 0) {
          val = (grid[j + 1][i] + Bi * airT) / (1 + Bi);
        } else {
          val = 0.25 * (
            grid[j][i - 1] + grid[j][i + 1] +
            grid[j - 1][i] + grid[j + 1][i] +
            powerGrid[j][i]
          );
        }
        newGrid[j][i] = val;
        diff = Math.max(diff, Math.abs(val - grid[j][i]));
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) grid[j][i] = newGrid[j][i];
    }
    iter++;
  }

  const temps = {};
  Object.keys(conduitCells).forEach(cid => {
    const cells = conduitCells[cid];
    let sum = 0;
    cells.forEach(([j, i]) => { sum += grid[j][i]; });
    temps[cid] = sum / cells.length;
  });
  return { grid, conduitTemps: temps };
}

function computeDuctbankTemperatures(conduits, cables, params) {
  const heatMap = {};
  cables.forEach(c => {
    const cd = conduits.find(d => d.conduit_id === c.conduit_id);
    if (!cd) return;
    const Rin = Math.sqrt(CONDUIT_SPECS[cd.conduit_type][cd.trade_size] / Math.PI);
    const cx = (cd.x + Rin) * 0.0254;
    const cy = (cd.y + Rin) * 0.0254;
    const Rdc = dcResistance(c.conductor_size, c.conductor_material, 90);
    const current = parseFloat(c.est_load) || 0;
    const power = current * current * Rdc;
    if (!heatMap[c.conduit_id]) {
      heatMap[c.conduit_id] = { cx, cy, power: 0, count: 0, cables: [], r: Rin * 0.0254 };
    }
    heatMap[c.conduit_id].power += power;
    heatMap[c.conduit_id].count++;
    heatMap[c.conduit_id].cables.push(c);
  });

  const sources = Object.keys(heatMap).map(cid => {
    const h = heatMap[cid];
    const others = Object.keys(heatMap).filter(id => id !== cid);
    const distances = others.map(id => {
      const o = heatMap[id];
      return Math.max(0, Math.sqrt((h.cx - o.cx) ** 2 + (h.cy - o.cy) ** 2) - (h.r + o.r));
    });
    const avgSpacingIn = distances.length
      ? distances.reduce((s, d) => s + d, 0) / distances.length / 0.0254
      : (params.hSpacing + params.vSpacing) / 2 || 3;
    const spacingAdj = 3 / Math.max(avgSpacingIn, 0.1);
    let Rth = (params.soilResistivity || 90) / 90 * 0.5;
    const moistAdj = 1 - Math.min(params.moistureContent || 0, 100) / 200;
    Rth *= moistAdj;
    if (params.heatSources) Rth *= 1.2;
    Rth *= spacingAdj;
    if (params.concreteEncasement) Rth *= 0.8;
    Rth *= 1 + (params.ductbankDepth || 0) / 100;
    const c0 = h.cables[0] || {};
    const ins = (c0.insulation_type || "").toUpperCase();
    if (ins.includes("XLPE")) Rth *= 0.95; else if (ins.includes("PVC")) Rth *= 1.05;
    const volt = parseFloat(c0.voltage_rating) || 600;
    if (volt > 2000) Rth *= 1.1; else if (volt < 600) Rth *= 0.95;
    if (c0.shielding_jacket) Rth *= 1.05;
    let mutualAdj = 1;
    distances.forEach(d => { mutualAdj += 0.2 * Math.exp(-d / 0.1); });
    Rth *= mutualAdj;
    Rth *= h.count;
    return { ...h, Rth, conduit: cid, r: h.r };
  }).filter(Boolean);

  function tempAt(x, y, targetR = 0) {
    let t = params.earthTemp || 20;
    for (const h of sources) {
      const dx = x - h.cx;
      const dy = y - h.cy;
      const dist = Math.max(0, Math.sqrt(dx * dx + dy * dy) - (h.r + targetR));
      t += neherMcGrathRise(h.power, h.Rth, dist, params.soilResistivity || 90);
    }
    return t;
  }

  const temps = {};
  for (const s of sources) temps[s.conduit] = tempAt(s.cx, s.cy, s.r);
  return temps;
}

// ----- Example small ductbank -----
const SMALL_CONDUITS = [
  { conduit_id: "C1", conduit_type: "PVC Sch 40", trade_size: "4", x: 0, y: 0 },
  { conduit_id: "C2", conduit_type: "PVC Sch 40", trade_size: "4", x: 7, y: 0 }
];

const SMALL_CABLES = [
  { conduit_id: "C1", conductor_size: "#2 AWG", conductor_material: "Copper",
    insulation_type: "THHN", voltage_rating: "600V", shielding_jacket: "",
    est_load: 250 },
  { conduit_id: "C2", conductor_size: "#2 AWG", conductor_material: "Copper",
    insulation_type: "THHN", voltage_rating: "600V", shielding_jacket: "",
    est_load: 250 }
];

const PARAMS = {
  soilResistivity: 90,
  moistureContent: 0,
  heatSources: false,
  hSpacing: 3,
  vSpacing: 4,
  concreteEncasement: false,
  ductbankDepth: 0,
  earthTemp: 20
};

if (require.main === module) {
  const temps = computeDuctbankTemperatures(SMALL_CONDUITS, SMALL_CABLES, PARAMS);
  console.log("Small ductbank temperatures", temps);

  // Manual check against formula
  const Rin = Math.sqrt(CONDUIT_SPECS["PVC Sch 40"]["4"] / Math.PI) * 0.0254;
  const center1 = (SMALL_CONDUITS[0].x + Rin / 0.0254) * 0.0254;
  const center2 = (SMALL_CONDUITS[1].x + Rin / 0.0254) * 0.0254;
  const centerDist = Math.abs(center2 - center1);
  const surfaceDist = Math.max(0, centerDist - 2 * Rin);
  const Rdc = dcResistance("#2 AWG", "Copper", 90);
  const power = 250 * 250 * Rdc;
  let Rth = (PARAMS.soilResistivity || 90) / 90 * 0.5;
  const spacingAdj = 3 / (surfaceDist > 0 ? surfaceDist / 0.0254 : 3);
  Rth *= spacingAdj;
  let mutualAdj = 1 + 0.2 * Math.exp(-surfaceDist / 0.1);
  Rth *= mutualAdj;
  const radial = Math.log(Math.max(surfaceDist, 0.05) / 0.05) /
    (2 * Math.PI * (100 / PARAMS.soilResistivity));
  const expected = PARAMS.earthTemp + power * Rth + power * (Rth + radial);

  console.assert(Math.abs(temps.C1 - expected) < 0.1, "C1 temperature mismatch");
  console.assert(Math.abs(temps.C2 - expected) < 0.1, "C2 temperature mismatch");
}

describe('solveDuctbankTemperatures', () => {
  it('computes conduit temperatures close to analytical values', () => {
    const result = solveDuctbankTemperatures(SMALL_CONDUITS, SMALL_CABLES, {
      earthTemp: 20,
      airTemp: 20,
      soilResistivity: 90
    });
    const temps = result.conduitTemps;
    const expected = 29; // approx from published example
    assert(Math.abs(temps.C1 - expected) < 1);
    assert(Math.abs(temps.C2 - expected) < 1);
  });
});

module.exports = {
  solveDuctbankTemperatures,
  computeDuctbankTemperatures,
  SMALL_CONDUITS,
  SMALL_CABLES,
  PARAMS,
  CONDUIT_SPECS,
  dcResistance
};

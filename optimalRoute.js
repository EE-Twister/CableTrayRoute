// ---- Inline E2E helpers (no external import) ----
const E2E = new URLSearchParams(location.search).has('e2e');

function ensureReadyBeacon(attrName, id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    // Visible enough for Playwright, invisible to users
    el.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;z-index:2147483647;';
    document.body.appendChild(el);
  }
  el.setAttribute(attrName, '1'); // exact same data-* attribute as tests wait for
}


function suppressResumeIfE2E({ resumeYesId = '#resume-yes-btn', resumeNoId = '#resume-no-btn' } = {}) {
  if (!E2E) return;

  // Do NOT clear storage by default; it breaks cross-page flows.
  // Only clear when explicitly requested via ?e2e_reset=1
  const qs = new URLSearchParams(location.search);
  const shouldClear = qs.has('e2e_reset');

  if (shouldClear) {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
  }

  // Still auto-dismiss the resume modal if it appears
  queueMicrotask(() => {
    const noBtn = document.querySelector(resumeNoId);
    const yesBtn = document.querySelector(resumeYesId);
    const isVisible = el => !!el && el.offsetParent !== null;
    if (isVisible(noBtn)) noBtn.click();
    else if (isVisible(yesBtn)) yesBtn.click();
  });
}

window.E2E = E2E;

import { emitAsync } from './utils/safeEvents.js';
suppressResumeIfE2E();

checkPrereqs([
  {key:'cableSchedule',page:'cableschedule.html',label:'Cable Schedule'},
  {key:'traySchedule',page:'racewayschedule.html',label:'Raceway Schedule'}
]);

document.addEventListener('exclusions-found', () => {
  const details = document.getElementById('route-breakdown-details');
  if (details) details.open = true;
});

const trayData = [];
const cableData = [];

document.addEventListener('DOMContentLoaded', () => {
  const trayBtn = document.getElementById('load-sample-trays-btn');
  if (trayBtn) {
    trayBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('examples/trayNetwork.json');
        const trays = await res.json();
        const details = document.getElementById('manual-tray-table-details');
        if (details) details.open = true;
        populateTrayTable(trays);
      } catch (err) {
        console.error('Failed to load sample tray network', err);
      }
    });
  }

  const addTrayBtn = document.getElementById('add-tray-btn');
  if (addTrayBtn) {
    addTrayBtn.addEventListener('click', addTrayRow);
  }

  const addCableBtn = document.getElementById('add-cable-btn');
  if (addCableBtn) {
    addCableBtn.addEventListener('click', addCableRow);
  }

  const cableBtn = document.getElementById('load-sample-cables-btn');
  if (cableBtn) {
    cableBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('examples/cableList.json');
        const cables = await res.json();
        const details = document.getElementById('cable-list-details');
        if (details) details.open = true;
        populateCableTable(cables);
      } catch (err) {
        console.error('Failed to load sample cable list', err);
      }
    });
  }

  // After any resume logic completes, ensure tray/conduit data is rebuilt
  if (typeof rebuildTrayData === 'function') rebuildTrayData();
  document.documentElement.setAttribute('data-optimal-ready', '1');
  ensureReadyBeacon('data-optimal-ready', 'optimal-ready-beacon');
});

function addTrayRow(){
  const tray = {
    tray_id: document.getElementById('t-id')?.value || '',
    start_x: parseFloat(document.getElementById('t-sx')?.value) || 0,
    start_y: parseFloat(document.getElementById('t-sy')?.value) || 0,
    start_z: parseFloat(document.getElementById('t-sz')?.value) || 0,
    end_x: parseFloat(document.getElementById('t-ex')?.value) || 0,
    end_y: parseFloat(document.getElementById('t-ey')?.value) || 0,
    end_z: parseFloat(document.getElementById('t-ez')?.value) || 0,
    width: parseFloat(document.getElementById('t-w')?.value) || 0,
    height: parseFloat(document.getElementById('t-h')?.value) || 0,
    allowed_cable_group: document.getElementById('t-group')?.value || ''
  };
  trayData.push(tray);
  const details = document.getElementById('manual-tray-table-details');
  if (details) details.open = true;
  populateTrayTable();
}

function addCableRow(){
  const startTag = prompt('Start equipment tag?') || '';
  const endTag = prompt('End equipment tag?') || '';
  const cable = {
    name: `Cable ${cableData.length + 1}`,
    start_tag: startTag,
    end_tag: endTag,
    cable_type: 'Power',
    allowed_cable_group: ''
  };
  cableData.push(cable);
  const details = document.getElementById('cable-list-details');
  if (details) details.open = true;
  populateCableTable();
}

function populateTrayTable(trays){
  if (Array.isArray(trays)) {
    trayData.length = 0;
    trayData.push(...trays);
  }
  const container = document.getElementById('manual-tray-table-container');
  if(!container) return;
  if (trayData.length === 0){
    container.innerHTML = '';
    return;
  }
  let html = '<table class="sticky-table"><thead><tr>'+
    '<th>Tray ID</th><th>Start (X,Y,Z)</th><th>End (X,Y,Z)</th>'+
    '<th>Width</th><th>Height</th><th>Group</th></tr></thead><tbody>';
  trayData.forEach(t => {
    html += `<tr><td>${t.tray_id||''}</td>`+
      `<td>${t.start_x},${t.start_y},${t.start_z}</td>`+
      `<td>${t.end_x},${t.end_y},${t.end_z}</td>`+
      `<td>${t.width}</td><td>${t.height}</td>`+
      `<td>${t.allowed_cable_group||''}</td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
  emitAsync('imports-ready-trays');
}

function populateCableTable(cables){
  if (Array.isArray(cables)) {
    cableData.length = 0;
    cableData.push(...cables);
  }
  const container = document.getElementById('cable-list-container');
  if(!container) return;
  if (cableData.length === 0){
    container.innerHTML = '';
    return;
  }
  let html = '<table class="sticky-table"><thead><tr>'+
    '<th>Name</th><th>Start Equipment</th><th>End Equipment</th>'+
    '<th>Type</th><th>Group</th></tr></thead><tbody>';
  cableData.forEach(c => {
    html += `<tr><td>${c.name||''}</td>`+
      `<td>${c.start_tag||''}</td>`+
      `<td>${c.end_tag||''}</td>`+
      `<td>${c.cable_type||''}</td>`+
      `<td>${c.allowed_cable_group||''}</td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
  emitAsync('imports-ready-cables');
}

// --- Routing worker integration and visualization ---
let routingWorker = null;

// Create a canvas for drawing the tray network and cable paths
const canvas = document.createElement('canvas');
canvas.id = 'route-canvas';
canvas.width = 800;
canvas.height = 600;
document.getElementById('main-content')?.appendChild(canvas);

function getRoutingOptions(){
  return {
    fillLimit: (parseFloat(document.getElementById('fill-limit')?.value) || 40) / 100,
    proximityThreshold: parseFloat(document.getElementById('proximity-threshold')?.value) || 72,
    maxFieldEdge: parseFloat(document.getElementById('max-field-edge')?.value) || 1000,
    fieldPenalty: parseFloat(document.getElementById('field-route-penalty')?.value) || 3.0,
    sharedPenalty: parseFloat(document.getElementById('shared-field-penalty')?.value) || 0.5,
  };
}

function calculateRoutes(){
  if (trayData.length === 0 || cableData.length === 0) {
    console.warn('No tray or cable data loaded');
    return;
  }
  if (routingWorker) routingWorker.terminate();
  routingWorker = new Worker('batchRouteWorker.js');
  routingWorker.onmessage = (e) => {
    if (e.data.type === 'done') {
      drawNetwork(e.data.finalTrays || [], e.data.allRoutes || [], e.data.utilization || {});
      const countEl = document.getElementById('conduit-count');
      if (countEl && Array.isArray(e.data.finalTrays)) {
        const conduitCount = e.data.finalTrays.filter(t => t.raceway_type === 'conduit').length;
        countEl.textContent = `Conduits added: ${conduitCount}`;
      }
      if (typeof document !== 'undefined') {
        const rs = document.getElementById('results-section');
        if (rs) {
          rs.classList.remove('hidden', 'invisible', 'is-hidden');
          rs.removeAttribute('hidden');
          rs.style.visibility = 'visible';
          rs.style.display = '';
        }
        emitAsync('route-updated');
      }
    }
  };
  routingWorker.postMessage({ type:'start', trays: trayData, options: getRoutingOptions(), cables: cableData });
}

document.getElementById('calculate-route-btn')?.addEventListener('click', calculateRoutes);

function drawNetwork(trays, routes, utilization){
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const pts=[];
  trays.forEach(t=>{pts.push([t.start_x,t.start_y]);pts.push([t.end_x,t.end_y]);});
  routes.forEach(r=>r.segments.forEach(s=>{pts.push([s.start[0],s.start[1]]);pts.push([s.end[0],s.end[1]]);}));
  if(pts.length===0)return;
  const xs=pts.map(p=>p[0]);
  const ys=pts.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const pad=20;
  const scale=Math.min((canvas.width-2*pad)/((maxX-minX)||1),(canvas.height-2*pad)/((maxY-minY)||1));
  const tx=p=>pad+(p[0]-minX)*scale;
  const ty=p=>canvas.height-(pad+(p[1]-minY)*scale);

  // Draw trays color-coded by utilization
  trays.forEach(t=>{
    const util=utilization[t.tray_id]?utilization[t.tray_id].current_fill/utilization[t.tray_id].max_fill:0;
    const color=`hsl(${(1-util)*120},100%,50%)`;
    ctx.strokeStyle=color;
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(tx([t.start_x,t.start_y]),ty([t.start_x,t.start_y]));
    ctx.lineTo(tx([t.end_x,t.end_y]),ty([t.end_x,t.end_y]));
    ctx.stroke();
  });

  // Draw cable routes
  const colors=['#0000ff','#ff00ff','#00ffff','#000000','#ffa500'];
  routes.forEach((r,idx)=>{
    ctx.strokeStyle=colors[idx%colors.length];
    ctx.lineWidth=1;
    ctx.beginPath();
    r.segments.forEach((s,i)=>{
      const sx=tx(s.start), sy=ty(s.start);
      const ex=tx(s.end), ey=ty(s.end);
      if(i===0) ctx.moveTo(sx,sy);
      ctx.lineTo(ex,ey);
    });
    ctx.stroke();
  });
}

import * as dataStore from './dataStore.mjs';

const WALL_TYPES = ['Concrete', 'CMU', 'Gypsum', 'Metal', 'Fire Rated', 'Removable Panel'];
const VOLTAGE_OPTIONS = ['120V', '208V', '480V', '600V', '4.16kV', '13.8kV', '15kV'];
const DEFAULT_SCALE = 20;
const MAX_HISTORY = 50;

const state = {
  room: {
    width: 30,
    depth: 20,
    walls: { north: 'Concrete', south: 'Concrete', east: 'CMU', west: 'CMU' },
    interiorWalls: [],
    doorways: []
  },
  equipment: [],
  scale: DEFAULT_SCALE,
  selectedIds: new Set(),
  drag: null,
  wallDraw: {
    enabled: false,
    snapStep: 0.5,
    start: null,
    current: null
  },
  violations: new Set(),
  history: []
};

let canvas;
let summaryEl;
let contextMenu = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseNumber(input, fallback) {
  const value = Number.parseFloat(input);
  return Number.isFinite(value) ? value : fallback;
}

function snapToStep(value, step = 0.5) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}

// NEC 110.26 Condition 2 applies when the facing wall is grounded (metal).
// Metal walls use Condition 2 clearances; all others use Condition 1.
function isConductive(wallType) {
  return wallType === 'Metal';
}

function clearanceDepthFt(voltageText, facingWallType) {
  const normalized = String(voltageText || '').toLowerCase();
  const kvMatch = normalized.match(/([\d.]+)\s*k\s*v/);
  let volts = Number.parseFloat(normalized);
  if (kvMatch) {
    volts = Number.parseFloat(kvMatch[1]) * 1000;
  }
  const conductive = isConductive(facingWallType);
  if (!Number.isFinite(volts) || volts <= 150) return 3;
  if (volts <= 600) return conductive ? 3.5 : 3;
  if (volts <= 2500) return conductive ? 4 : 3;
  if (volts <= 9000) return conductive ? 5 : 4;
  return conductive ? 6 : 5;
}

function facingWallType(eq) {
  switch (eq.facing) {
    case 'north': return state.room.walls.north;
    case 'south': return state.room.walls.south;
    case 'east':  return state.room.walls.east;
    case 'west':  return state.room.walls.west;
    default:      return state.room.walls.south;
  }
}

function equipmentRect(eq) {
  return { x: eq.x, y: eq.y, w: eq.width, h: eq.depth };
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function insideRoom(rect) {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= state.room.width && rect.y + rect.h <= state.room.depth;
}

function workspaceRect(eq) {
  const depth = clearanceDepthFt(eq.voltage, facingWallType(eq));
  const pad = 0.15;
  switch (eq.facing) {
    case 'north':
      return { x: eq.x - pad, y: eq.y - depth, w: eq.width + pad * 2, h: depth };
    case 'south':
      return { x: eq.x - pad, y: eq.y + eq.depth, w: eq.width + pad * 2, h: depth };
    case 'east':
      return { x: eq.x + eq.width, y: eq.y - pad, w: depth, h: eq.depth + pad * 2 };
    case 'west':
      return { x: eq.x - depth, y: eq.y - pad, w: depth, h: eq.depth + pad * 2 };
    default:
      return { x: eq.x - pad, y: eq.y + eq.depth, w: eq.width + pad * 2, h: depth };
  }
}

function interiorWallRect(wall) {
  if (wall.orientation === 'vertical') {
    return { x: wall.x - 0.1, y: wall.y, w: 0.2, h: wall.length };
  }
  return { x: wall.x, y: wall.y - 0.1, w: wall.length, h: 0.2 };
}

function accessViolation(eq, workspace) {
  const left = workspace.x;
  const right = state.room.width - (workspace.x + workspace.w);
  const top = workspace.y;
  const bottom = state.room.depth - (workspace.y + workspace.h);
  const perimeterAccess = left >= 3 || right >= 3 || top >= 3 || bottom >= 3;
  if (!perimeterAccess) return true;

  const hasNearbyBlocker = state.equipment.some(other => {
    if (other.id === eq.id) return false;
    const otherRect = equipmentRect(other);
    const near = {
      x: workspace.x - 1,
      y: workspace.y - 1,
      w: workspace.w + 2,
      h: workspace.h + 2
    };
    return intersects(otherRect, near) && !intersects(otherRect, workspace);
  });

  if (hasNearbyBlocker) return true;
  return false;
}

function evaluateViolations() {
  const violations = new Set();

  state.equipment.forEach(eq => {
    const eqRect = equipmentRect(eq);
    const workspace = workspaceRect(eq);

    if (!insideRoom(eqRect) || !insideRoom(workspace)) {
      violations.add(eq.id);
      return;
    }

    const overlapsEquipment = state.equipment.some(other => {
      if (other.id === eq.id) return false;
      return intersects(eqRect, equipmentRect(other)) || intersects(workspace, equipmentRect(other));
    });

    const overlapsInterior = state.room.interiorWalls.some(wall => {
      const wallRect = interiorWallRect(wall);
      return intersects(eqRect, wallRect) || intersects(workspace, wallRect);
    });

    if (overlapsEquipment || overlapsInterior || accessViolation(eq, workspace)) {
      violations.add(eq.id);
    }
  });

  state.violations = violations;
}

// ── History / Undo ──────────────────────────────────────────────────────────

function pushHistory() {
  const snapshot = {
    equipment: state.equipment.map(e => ({ ...e })),
    interiorWalls: state.room.interiorWalls.map(w => ({ ...w })),
    doorways: state.room.doorways.map(d => ({ ...d }))
  };
  state.history.push(snapshot);
  if (state.history.length > MAX_HISTORY) state.history.shift();
}

function undoLastAction() {
  if (!state.history.length) return;
  const snapshot = state.history.pop();
  state.equipment = snapshot.equipment;
  state.room.interiorWalls = snapshot.interiorWalls;
  state.room.doorways = snapshot.doorways;
  const ids = new Set(state.equipment.map(e => e.id));
  state.selectedIds = new Set([...state.selectedIds].filter(id => ids.has(id)));
  render();
}

// ── UI helpers ───────────────────────────────────────────────────────────────

function populateSelect(selectId, values) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '';
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function populateEquipmentPreset() {
  const select = document.getElementById('equipment-preset');
  if (!select) return;
  const equipment = dataStore.getEquipment();
  const options = equipment.length
    ? equipment.map((item, idx) => ({
        value: String(idx),
        label: `${item.tag || `Equipment-${idx + 1}`} · ${item.description || 'No description'}`,
        item
      }))
    : [{ value: '-1', label: 'No equipment in Equipment List', item: null }];

  select.innerHTML = '';
  options.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });

  if (options[0]?.item) {
    const widthInput = document.getElementById('equipment-width');
    const depthInput = document.getElementById('equipment-depth');
    widthInput.value = parseNumber(options[0].item.width, 4);
    depthInput.value = parseNumber(options[0].item.depth, 2);
  }
}

function renderInteriorWallList() {
  const list = document.getElementById('interior-wall-list');
  if (!list) return;
  list.innerHTML = '';
  if (!state.room.interiorWalls.length) {
    list.textContent = 'No interior walls added.';
    return;
  }
  state.room.interiorWalls.forEach((wall, index) => {
    const row = document.createElement('div');
    row.className = 'equipment-mini-list-row';
    row.innerHTML = `<span>${wall.orientation} wall · ${wall.type} · (${wall.x.toFixed(1)}, ${wall.y.toFixed(1)}) · ${wall.length.toFixed(1)} ft</span>`;
    const remove = document.createElement('button');
    remove.className = 'btn';
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      pushHistory();
      state.room.interiorWalls.splice(index, 1);
      render();
    });
    row.appendChild(remove);
    list.appendChild(row);
  });
}

function renderDoorwayList() {
  const list = document.getElementById('doorway-list');
  if (!list) return;
  list.innerHTML = '';
  if (!state.room.doorways.length) {
    list.textContent = 'No doorways added.';
    return;
  }
  state.room.doorways.forEach((dw, index) => {
    const row = document.createElement('div');
    row.className = 'equipment-mini-list-row';
    const tag = dw.isEgress ? ' · EGRESS' : '';
    row.innerHTML = `<span>${dw.wall} wall · ${dw.width.toFixed(1)} ft wide · ${dw.position.toFixed(1)} ft from corner${tag}</span>`;
    const remove = document.createElement('button');
    remove.className = 'btn';
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      pushHistory();
      state.room.doorways.splice(index, 1);
      render();
    });
    row.appendChild(remove);
    list.appendChild(row);
  });
}

// ── Canvas drawing helpers ───────────────────────────────────────────────────

function drawRect(rect, className, fillOpacity = 1) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  element.setAttribute('x', String(rect.x * state.scale));
  element.setAttribute('y', String(rect.y * state.scale));
  element.setAttribute('width', String(rect.w * state.scale));
  element.setAttribute('height', String(rect.h * state.scale));
  element.setAttribute('class', className);
  if (fillOpacity !== 1) {
    element.setAttribute('fill-opacity', String(fillOpacity));
  }
  canvas.appendChild(element);
  return element;
}

// Font size scales proportionally with zoom so text stays readable without crowding.
// No minimum: at low scale the SVG viewBox is small so the SVG is scaled up by the browser,
// keeping the physical pixel size consistent. A minimum would make text appear huge at low zoom.
function labelFontSize(variant) {
  if (variant === 'meta')  return Math.min(10, state.scale * 0.40);
  if (variant === 'block') return Math.min(12, state.scale * 0.50);
  if (variant === 'wall')  return Math.min(14, state.scale * 0.60);
  if (variant === 'door')  return Math.min(11, state.scale * 0.45);
  return Math.min(14, state.scale * 0.60);
}

function drawText(text, xFt, yFt, className = 'equipment-room-text', variant = 'wall') {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  element.setAttribute('x', String(xFt * state.scale));
  element.setAttribute('y', String(yFt * state.scale));
  element.setAttribute('class', className);
  element.style.fontSize = `${labelFontSize(variant)}px`;
  element.textContent = text;
  canvas.appendChild(element);
}

function drawWallLabel(text, xFt, yFt, anchor = 'start') {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  element.setAttribute('x', String(xFt * state.scale));
  element.setAttribute('y', String(yFt * state.scale));
  element.setAttribute('class', 'equipment-wall-label');
  element.setAttribute('text-anchor', anchor);
  element.style.fontSize = `${labelFontSize('wall')}px`;
  element.textContent = text;
  canvas.appendChild(element);
}

// ── Room rendering ───────────────────────────────────────────────────────────

function wallLineSegments(wallId) {
  const W = state.room.width;
  const H = state.room.depth;
  const wallLength = (wallId === 'north' || wallId === 'south') ? W : H;
  const doors = state.room.doorways
    .filter(d => d.wall === wallId)
    .sort((a, b) => a.position - b.position);

  const segments = [];
  let cur = 0;
  doors.forEach(d => {
    const start = clamp(d.position, 0, wallLength);
    const end   = clamp(d.position + d.width, 0, wallLength);
    if (start > cur) segments.push([cur, start]);
    cur = end;
  });
  if (cur < wallLength) segments.push([cur, wallLength]);
  return segments;
}

function drawWallLine(x1ft, y1ft, x2ft, y2ft) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  const s = state.scale;
  el.setAttribute('x1', String(x1ft * s));
  el.setAttribute('y1', String(y1ft * s));
  el.setAttribute('x2', String(x2ft * s));
  el.setAttribute('y2', String(y2ft * s));
  el.setAttribute('class', 'equipment-room-wall');
  canvas.appendChild(el);
}

function renderDoorways() {
  const s = state.scale;
  const H = state.room.depth;
  const W = state.room.width;

  state.room.doorways.forEach(dw => {
    const p = dw.position;
    const w = dw.width;

    let panelPath = '';
    let swingPath = '';
    let labelX = 0;
    let labelY = 0;
    let labelAnchor = 'middle';

    switch (dw.wall) {
      case 'north': {
        // Hinge at (p, 0), panel goes into room to (p, w), arc from (p+w,0) to (p,w)
        panelPath = `M ${p*s},0 L ${p*s},${w*s}`;
        swingPath = `M ${(p+w)*s},0 A ${w*s},${w*s} 0 0,1 ${p*s},${w*s}`;
        labelX = (p + w / 2) * s;
        labelY = -6;
        break;
      }
      case 'south': {
        // Hinge at (p, H), panel goes into room to (p, H-w), arc from (p+w,H) to (p,H-w)
        panelPath = `M ${p*s},${H*s} L ${p*s},${(H-w)*s}`;
        swingPath = `M ${(p+w)*s},${H*s} A ${w*s},${w*s} 0 0,0 ${p*s},${(H-w)*s}`;
        labelX = (p + w / 2) * s;
        labelY = H * s + 14;
        break;
      }
      case 'west': {
        // Hinge at (0, p), panel into room to (w, p), arc from (0,p+w) to (w,p)
        panelPath = `M 0,${p*s} L ${w*s},${p*s}`;
        swingPath = `M 0,${(p+w)*s} A ${w*s},${w*s} 0 0,0 ${w*s},${p*s}`;
        labelX = -6;
        labelY = (p + w / 2) * s;
        labelAnchor = 'end';
        break;
      }
      case 'east': {
        // Hinge at (W, p), panel into room to (W-w, p), arc from (W,p+w) to (W-w,p)
        panelPath = `M ${W*s},${p*s} L ${(W-w)*s},${p*s}`;
        swingPath = `M ${W*s},${(p+w)*s} A ${w*s},${w*s} 0 0,1 ${(W-w)*s},${p*s}`;
        labelX = W * s + 6;
        labelY = (p + w / 2) * s;
        labelAnchor = 'start';
        break;
      }
      default: return;
    }

    const panelEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    panelEl.setAttribute('d', panelPath);
    panelEl.setAttribute('class', 'equipment-doorway-panel');
    canvas.appendChild(panelEl);

    const swingEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    swingEl.setAttribute('d', swingPath);
    swingEl.setAttribute('class', 'equipment-doorway-swing');
    canvas.appendChild(swingEl);

    if (dw.isEgress) {
      const labelEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      labelEl.setAttribute('x', String(labelX));
      labelEl.setAttribute('y', String(labelY));
      labelEl.setAttribute('class', 'equipment-doorway-label');
      labelEl.setAttribute('text-anchor', labelAnchor);
      labelEl.style.fontSize = `${labelFontSize('door')}px`;
      labelEl.textContent = 'EGRESS';
      canvas.appendChild(labelEl);
    }
  });
}

function renderRoom() {
  // Room fill (no stroke — walls are drawn as separate lines with doorway gaps)
  const fillEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  fillEl.setAttribute('x', '0');
  fillEl.setAttribute('y', '0');
  fillEl.setAttribute('width', String(state.room.width * state.scale));
  fillEl.setAttribute('height', String(state.room.depth * state.scale));
  fillEl.setAttribute('rx', '4');
  fillEl.setAttribute('ry', '4');
  fillEl.setAttribute('class', 'equipment-room-fill');
  canvas.appendChild(fillEl);

  // Draw each wall as segments, leaving gaps at doorways
  wallLineSegments('north').forEach(([a, b]) => drawWallLine(a, 0,              b, 0));
  wallLineSegments('south').forEach(([a, b]) => drawWallLine(a, state.room.depth, b, state.room.depth));
  wallLineSegments('west').forEach(([a, b])  => drawWallLine(0, a,              0, b));
  wallLineSegments('east').forEach(([a, b])  => drawWallLine(state.room.width, a, state.room.width, b));

  // Door symbols drawn on top of the fill
  renderDoorways();

  // Wall type labels
  drawWallLabel(`NORTH · ${state.room.walls.north}`, state.room.width / 2, 0.75, 'middle');
  drawWallLabel(`SOUTH · ${state.room.walls.south}`, state.room.width / 2, state.room.depth - 0.25, 'middle');
  drawWallLabel(`WEST · ${state.room.walls.west}`, 0.3, state.room.depth / 2, 'start');
  drawWallLabel(`EAST · ${state.room.walls.east}`, state.room.width - 0.3, state.room.depth / 2, 'end');

  state.room.interiorWalls.forEach(wall => {
    const rect = interiorWallRect(wall);
    const element = drawRect(rect, 'equipment-interior-wall');
    element.setAttribute('data-wall-type', wall.type);
  });

  if (state.wallDraw.enabled && state.wallDraw.start && state.wallDraw.current) {
    const dx = Math.abs(state.wallDraw.current.x - state.wallDraw.start.x);
    const dy = Math.abs(state.wallDraw.current.y - state.wallDraw.start.y);
    const orientation = dx > dy ? 'horizontal' : 'vertical';
    const previewRect = wallPreviewRect(state.wallDraw.start, state.wallDraw.current, orientation);
    if (previewRect) {
      drawRect(previewRect, 'equipment-interior-wall', 0.55);
    }
  }
}

function wallPreviewRect(start, end, orientation) {
  const snappedStartX = snapToStep(start.x, state.wallDraw.snapStep);
  const snappedStartY = snapToStep(start.y, state.wallDraw.snapStep);
  const snappedEndX = snapToStep(end.x, state.wallDraw.snapStep);
  const snappedEndY = snapToStep(end.y, state.wallDraw.snapStep);
  if (orientation === 'vertical') {
    const y = clamp(Math.min(snappedStartY, snappedEndY), 0, state.room.depth);
    const length = Math.max(1, Math.abs(snappedEndY - snappedStartY));
    const safeLength = Math.min(length, Math.max(1, state.room.depth - y));
    const x = clamp(snappedStartX, 0, state.room.width);
    return interiorWallRect({ orientation: 'vertical', x, y, length: safeLength });
  }
  const x = clamp(Math.min(snappedStartX, snappedEndX), 0, state.room.width);
  const length = Math.max(1, Math.abs(snappedEndX - snappedStartX));
  const safeLength = Math.min(length, Math.max(1, state.room.width - x));
  const y = clamp(snappedStartY, 0, state.room.depth);
  return interiorWallRect({ orientation: 'horizontal', x, y, length: safeLength });
}

function addInteriorWallFromDrag(start, end) {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const orientation = dx > dy ? 'horizontal' : 'vertical';
  const type = document.getElementById('interior-type').value;
  const snappedStartX = snapToStep(start.x, state.wallDraw.snapStep);
  const snappedStartY = snapToStep(start.y, state.wallDraw.snapStep);
  const snappedEndX = snapToStep(end.x, state.wallDraw.snapStep);
  const snappedEndY = snapToStep(end.y, state.wallDraw.snapStep);

  let x;
  let y;
  let length;
  if (orientation === 'vertical') {
    x = clamp(snappedStartX, 0, state.room.width);
    y = clamp(Math.min(snappedStartY, snappedEndY), 0, state.room.depth);
    length = Math.max(1, Math.abs(snappedEndY - snappedStartY));
    length = Math.min(length, Math.max(1, state.room.depth - y));
  } else {
    x = clamp(Math.min(snappedStartX, snappedEndX), 0, state.room.width);
    y = clamp(snappedStartY, 0, state.room.depth);
    length = Math.max(1, Math.abs(snappedEndX - snappedStartX));
    length = Math.min(length, Math.max(1, state.room.width - x));
  }

  pushHistory();
  state.room.interiorWalls.push({ orientation, type, x, y, length });
}

// ── Equipment rendering ──────────────────────────────────────────────────────

function renderEquipment() {
  state.equipment.forEach(eq => {
    const eqRect = equipmentRect(eq);
    const workspace = workspaceRect(eq);
    const hasViolation = state.violations.has(eq.id);
    drawRect(workspace, hasViolation ? 'equipment-clearance equipment-clearance-danger' : 'equipment-clearance', 0.35);

    const block = drawRect(eqRect, hasViolation ? 'equipment-block equipment-block-danger' : 'equipment-block');
    block.dataset.id = eq.id;
    if (state.selectedIds.has(eq.id)) {
      block.classList.add('selected');
    }

    const textX = eq.x + 0.2;
    const textY = eq.y + Math.min(0.7, eq.depth * 0.45);
    drawText(`${eq.name} (${eq.voltage})`, textX, textY, 'equipment-block-label', 'block');
    if (eq.depth >= 1.2) {
      drawText(
        `${eq.width.toFixed(1)}×${eq.depth.toFixed(1)} ft · ${eq.facing}`,
        textX,
        textY + Math.min(0.6, eq.depth * 0.35),
        'equipment-block-meta',
        'meta'
      );
    }
  });
}

// ── Gap indicators ───────────────────────────────────────────────────────────

function drawGapIndicator(x1ft, y1ft, x2ft, y2ft, gapFt, orientation) {
  const x1 = x1ft * state.scale;
  const y1 = y1ft * state.scale;
  const x2 = x2ft * state.scale;
  const y2 = y2ft * state.scale;
  const tickSize = 5;

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(y1));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(y2));
  line.setAttribute('class', 'equipment-gap-line');
  canvas.appendChild(line);

  [[x1, y1], [x2, y2]].forEach(([tx, ty]) => {
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    if (orientation === 'horizontal') {
      tick.setAttribute('x1', String(tx)); tick.setAttribute('y1', String(ty - tickSize));
      tick.setAttribute('x2', String(tx)); tick.setAttribute('y2', String(ty + tickSize));
    } else {
      tick.setAttribute('x1', String(tx - tickSize)); tick.setAttribute('y1', String(ty));
      tick.setAttribute('x2', String(tx + tickSize)); tick.setAttribute('y2', String(ty));
    }
    tick.setAttribute('class', 'equipment-gap-line');
    canvas.appendChild(tick);
  });

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const label = `${gapFt.toFixed(2)}'`;
  const bgW = Math.max(label.length * 6 + 8, 32);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', String(midX - bgW / 2));
  bg.setAttribute('y', String(midY - 8));
  bg.setAttribute('width', String(bgW));
  bg.setAttribute('height', '14');
  bg.setAttribute('rx', '3');
  bg.setAttribute('class', 'equipment-gap-label-bg');
  canvas.appendChild(bg);

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', String(midX));
  text.setAttribute('y', String(midY + 3));
  text.setAttribute('class', 'equipment-gap-label');
  text.setAttribute('text-anchor', 'middle');
  text.style.fontSize = `${labelFontSize('meta')}px`;
  text.textContent = label;
  canvas.appendChild(text);
}

function renderGapIndicators() {
  if (!state.drag) return;
  const dragging = state.equipment.find(e => e.id === state.drag.primaryId);
  if (!dragging) return;

  state.equipment.forEach(other => {
    if (other.id === dragging.id) return;

    const overlapY0 = Math.max(dragging.y, other.y);
    const overlapY1 = Math.min(dragging.y + dragging.depth, other.y + other.depth);
    if (overlapY1 > overlapY0) {
      const midY = (overlapY0 + overlapY1) / 2;
      if (dragging.x + dragging.width <= other.x) {
        const gap = other.x - (dragging.x + dragging.width);
        if (gap < 20) drawGapIndicator(dragging.x + dragging.width, midY, other.x, midY, gap, 'horizontal');
      } else if (other.x + other.width <= dragging.x) {
        const gap = dragging.x - (other.x + other.width);
        if (gap < 20) drawGapIndicator(other.x + other.width, midY, dragging.x, midY, gap, 'horizontal');
      }
    }

    const overlapX0 = Math.max(dragging.x, other.x);
    const overlapX1 = Math.min(dragging.x + dragging.width, other.x + other.width);
    if (overlapX1 > overlapX0) {
      const midX = (overlapX0 + overlapX1) / 2;
      if (dragging.y + dragging.depth <= other.y) {
        const gap = other.y - (dragging.y + dragging.depth);
        if (gap < 20) drawGapIndicator(midX, dragging.y + dragging.depth, midX, other.y, gap, 'vertical');
      } else if (other.y + other.depth <= dragging.y) {
        const gap = dragging.y - (other.y + other.depth);
        if (gap < 20) drawGapIndicator(midX, other.y + other.depth, midX, dragging.y, gap, 'vertical');
      }
    }
  });
}

// ── Context menu ─────────────────────────────────────────────────────────────

function createContextMenu() {
  contextMenu = document.createElement('div');
  contextMenu.id = 'canvas-context-menu';
  contextMenu.style.cssText = 'position:fixed;z-index:9999;background:var(--card-bg,#fff);border:1px solid var(--border-color,#7d8790);border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.22);padding:4px 0;min-width:190px;display:none;';
  document.body.appendChild(contextMenu);
  document.addEventListener('click', hideContextMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideContextMenu(); });
}

function hideContextMenu() {
  if (contextMenu) contextMenu.style.display = 'none';
}

function addContextMenuItem(label, action, danger = false) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = `display:block;width:100%;padding:6px 14px;background:none;border:none;text-align:left;cursor:pointer;font-size:.875rem;color:${danger ? '#c0392b' : 'var(--text-color,#1f2b3a)'};`;
  btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--hover-bg,rgba(0,0,0,.07))'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
  btn.addEventListener('click', () => { action(); hideContextMenu(); });
  contextMenu.appendChild(btn);
}

function addContextMenuSeparator() {
  const sep = document.createElement('div');
  sep.style.cssText = 'border-top:1px solid var(--border-color,#ddd);margin:3px 0;';
  contextMenu.appendChild(sep);
}

function showContextMenu(clientX, clientY, eq) {
  if (!contextMenu) return;
  contextMenu.innerHTML = '';

  // Determine the target set: all selected if right-clicking a selected item, else just this item
  const selectedList = state.equipment.filter(e => state.selectedIds.has(e.id));
  const targets = (eq && state.selectedIds.has(eq.id) && selectedList.length > 0)
    ? selectedList
    : (eq ? [eq] : []);

  if (!targets.length) return;
  const isMulti = targets.length > 1;

  const apply = action => {
    pushHistory();
    targets.forEach(action);
    targets.forEach(t => { if (t.listTag) syncEquipmentPosition(t); });
    render();
  };

  if (!isMulti) {
    addContextMenuItem('Copy', () => {
      pushHistory();
      const id = `eq-${Date.now()}-${Math.round(Math.random() * 1000)}`;
      const copy = { ...eq, id, x: clamp(eq.x + 1, 0, Math.max(0, state.room.width - eq.width)), y: clamp(eq.y + 1, 0, Math.max(0, state.room.depth - eq.depth)) };
      delete copy.listTag;
      state.equipment.push(copy);
      state.selectedIds.clear();
      state.selectedIds.add(id);
      render();
    });
  }

  addContextMenuItem(`Delete${isMulti ? ` (${targets.length})` : ''}`, () => {
    pushHistory();
    const ids = new Set(targets.map(t => t.id));
    state.equipment = state.equipment.filter(e => !ids.has(e.id));
    ids.forEach(id => state.selectedIds.delete(id));
    render();
  }, true);

  addContextMenuSeparator();
  addContextMenuItem('Align to North Wall',  () => apply(e => { e.y = 0; }));
  addContextMenuItem('Align to South Wall',  () => apply(e => { e.y = Math.max(0, state.room.depth - e.depth); }));
  addContextMenuItem('Align to West Wall',   () => apply(e => { e.x = 0; }));
  addContextMenuItem('Align to East Wall',   () => apply(e => { e.x = Math.max(0, state.room.width - e.width); }));
  addContextMenuItem('Center Horizontally',  () => apply(e => { e.x = Math.max(0, (state.room.width - e.width) / 2); }));
  addContextMenuItem('Center Vertically',    () => apply(e => { e.y = Math.max(0, (state.room.depth - e.depth) / 2); }));

  if (isMulti) {
    addContextMenuSeparator();
    addContextMenuItem('Align Top Edges',    () => { const minY = Math.min(...targets.map(t => t.y));                      apply(e => { e.y = minY; }); });
    addContextMenuItem('Align Bottom Edges', () => { const maxB = Math.max(...targets.map(t => t.y + t.depth));            apply(e => { e.y = maxB - e.depth; }); });
    addContextMenuItem('Align Left Edges',   () => { const minX = Math.min(...targets.map(t => t.x));                      apply(e => { e.x = minX; }); });
    addContextMenuItem('Align Right Edges',  () => { const maxR = Math.max(...targets.map(t => t.x + t.width));            apply(e => { e.x = maxR - e.width; }); });
  }

  addContextMenuSeparator();
  addContextMenuItem('Snap to Grid (0.5 ft)', () => apply(e => {
    e.x = snapToStep(e.x, 0.5);
    e.y = snapToStep(e.y, 0.5);
  }));

  contextMenu.style.display = 'block';
  const menuW = contextMenu.offsetWidth || 190;
  const menuH = contextMenu.scrollHeight;
  contextMenu.style.left = `${Math.min(clientX, window.innerWidth - menuW - 8)}px`;
  contextMenu.style.top = `${Math.min(clientY, window.innerHeight - menuH - 8)}px`;
}

// ── Summary / render ─────────────────────────────────────────────────────────

function updateSummary() {
  const total = state.equipment.length;
  const violations = state.violations.size;
  if (!summaryEl) return;
  summaryEl.textContent = violations
    ? `${violations} of ${total} equipment item${total === 1 ? '' : 's'} has NEC working-space/access violations.`
    : total
      ? `No NEC workspace violations detected for ${total} equipment item${total === 1 ? '' : 's'}.`
      : 'Add equipment to start layout checks.';
}

function render() {
  evaluateViolations();
  renderInteriorWallList();
  renderDoorwayList();

  canvas.innerHTML = '';
  const widthPx = state.room.width * state.scale;
  const heightPx = state.room.depth * state.scale;
  canvas.setAttribute('viewBox', `0 0 ${Math.max(widthPx + 40, 400)} ${Math.max(heightPx + 40, 300)}`);

  const padGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  padGroup.setAttribute('transform', 'translate(20,20)');
  canvas.appendChild(padGroup);

  const previousCanvas = canvas;
  canvas = padGroup;
  renderRoom();
  renderEquipment();
  renderGapIndicators();
  canvas = previousCanvas;

  const zoomLabel = document.getElementById('zoom-label');
  if (zoomLabel) zoomLabel.textContent = `Scale: ${state.scale} px/ft`;
  updateSummary();
}

// ── State mutations ──────────────────────────────────────────────────────────

function addEquipment() {
  const source = document.getElementById('equipment-source').value;
  const presetSelect = document.getElementById('equipment-preset');
  const customName = document.getElementById('custom-name').value.trim();
  const width = clamp(parseNumber(document.getElementById('equipment-width').value, 4), 1, 30);
  const depth = clamp(parseNumber(document.getElementById('equipment-depth').value, 2), 1, 30);
  const voltage = document.getElementById('equipment-voltage').value;
  const facing = document.getElementById('equipment-facing').value;

  let name = 'Equipment';
  let listTag = null;
  if (source === 'equipment-list') {
    const index = Number.parseInt(presetSelect.value, 10);
    const item = dataStore.getEquipment()[index];
    if (!item) return;
    name = item.tag || item.description || `Equipment-${state.equipment.length + 1}`;
    listTag = item.tag || null;
    if (listTag && state.equipment.some(e => e.listTag === listTag)) {
      // eslint-disable-next-line no-alert
      alert(`"${name}" is already on the canvas. Each equipment item can only be placed once.`);
      return;
    }
  } else {
    name = customName || `Custom-${state.equipment.length + 1}`;
  }

  const id = `eq-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  const startX = clamp(1 + state.equipment.length * 0.8, 0, Math.max(0, state.room.width - width));
  const startY = clamp(1 + state.equipment.length * 0.6, 0, Math.max(0, state.room.depth - depth));

  const newEq = { id, name, width, depth, voltage, facing, x: startX, y: startY };
  if (listTag) newEq.listTag = listTag;

  pushHistory();
  state.equipment.push(newEq);
  state.selectedIds.clear();
  state.selectedIds.add(id);
  if (listTag) syncEquipmentPosition(newEq);
  render();
}

function applyRoomChanges() {
  pushHistory();
  state.room.width = clamp(parseNumber(document.getElementById('room-width').value, 30), 8, 200);
  state.room.depth = clamp(parseNumber(document.getElementById('room-depth').value, 20), 8, 200);
  ['north', 'south', 'east', 'west'].forEach(direction => {
    state.room.walls[direction] = document.getElementById(`wall-${direction}`).value;
  });

  state.equipment = state.equipment.map(eq => ({
    ...eq,
    x: clamp(eq.x, 0, Math.max(0, state.room.width - eq.width)),
    y: clamp(eq.y, 0, Math.max(0, state.room.depth - eq.depth))
  }));
  render();
}

function addInteriorWall() {
  const orientation = document.getElementById('interior-orientation').value;
  const type = document.getElementById('interior-type').value;
  const x = clamp(parseNumber(document.getElementById('interior-x').value, 0), 0, state.room.width);
  const y = clamp(parseNumber(document.getElementById('interior-y').value, 0), 0, state.room.depth);
  const length = clamp(parseNumber(document.getElementById('interior-length').value, 5), 1, 100);

  const adjustedLength = orientation === 'vertical'
    ? Math.min(length, state.room.depth - y)
    : Math.min(length, state.room.width - x);

  pushHistory();
  state.room.interiorWalls.push({ orientation, type, x, y, length: Math.max(1, adjustedLength) });
  render();
}

function addDoorway() {
  const wall = document.getElementById('doorway-wall').value;
  const maxPos = (wall === 'east' || wall === 'west') ? state.room.depth : state.room.width;
  const position = clamp(parseNumber(document.getElementById('doorway-position').value, 5), 0, maxPos - 1);
  const width = clamp(parseNumber(document.getElementById('doorway-width').value, 3), 1, Math.min(20, maxPos - position));
  const isEgress = document.getElementById('doorway-egress').checked;

  pushHistory();
  const id = `dw-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  state.room.doorways.push({ id, wall, position, width, isEgress });
  render();
}

function syncEquipmentPosition(eq) {
  const list = dataStore.getEquipment();
  const idx = list.findIndex(item => item.tag === eq.listTag);
  if (idx === -1) return;
  dataStore.updateEquipment(idx, {
    x: String(Math.round(eq.x * 100) / 100),
    y: String(Math.round(eq.y * 100) / 100)
  });
}

function pickEquipmentAtPoint(xFt, yFt) {
  for (let i = state.equipment.length - 1; i >= 0; i -= 1) {
    const eq = state.equipment[i];
    if (xFt >= eq.x && xFt <= eq.x + eq.width && yFt >= eq.y && yFt <= eq.y + eq.depth) {
      return eq;
    }
  }
  return null;
}

function toFeetCoordinates(event) {
  const pt = canvas.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const svgPt = pt.matrixTransform(canvas.getScreenCTM().inverse());
  const xFt = (svgPt.x - 20) / state.scale;
  const yFt = (svgPt.y - 20) / state.scale;
  return { xFt, yFt };
}

// ── Canvas interactions ───────────────────────────────────────────────────────

function bindCanvasInteractions() {
  canvas.addEventListener('contextmenu', event => {
    event.preventDefault();
    const { xFt, yFt } = toFeetCoordinates(event);
    const picked = pickEquipmentAtPoint(xFt, yFt);
    if (picked && !state.selectedIds.has(picked.id)) {
      state.selectedIds.clear();
      state.selectedIds.add(picked.id);
      render();
    }
    showContextMenu(event.clientX, event.clientY, picked);
  });

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); // prevent text-selection on shift+click
    const { xFt, yFt } = toFeetCoordinates(event);
    if (state.wallDraw.enabled) {
      state.selectedIds.clear();
      state.wallDraw.start = { x: clamp(xFt, 0, state.room.width), y: clamp(yFt, 0, state.room.depth) };
      state.wallDraw.current = { ...state.wallDraw.start };
      canvas.setPointerCapture(event.pointerId);
      render();
      return;
    }

    const picked = pickEquipmentAtPoint(xFt, yFt);

    if (event.shiftKey) {
      // Shift+click toggles the item in/out of the selection
      if (picked) {
        if (state.selectedIds.has(picked.id)) {
          state.selectedIds.delete(picked.id);
        } else {
          state.selectedIds.add(picked.id);
        }
      }
      render();
      return; // Shift+click never starts a drag
    }

    if (picked) {
      if (!state.selectedIds.has(picked.id)) {
        // Clicking a new item without shift: replace selection
        state.selectedIds.clear();
        state.selectedIds.add(picked.id);
      }
      // Start drag for all currently selected items
      pushHistory();
      state.drag = {
        primaryId: picked.id,
        primaryOffsetX: xFt - picked.x,
        primaryOffsetY: yFt - picked.y
      };
      canvas.setPointerCapture(event.pointerId);
    } else {
      // Click on empty canvas: clear selection
      state.selectedIds.clear();
    }
    render();
  });

  canvas.addEventListener('pointermove', event => {
    if (state.wallDraw.enabled && state.wallDraw.start) {
      const { xFt, yFt } = toFeetCoordinates(event);
      state.wallDraw.current = { x: clamp(xFt, 0, state.room.width), y: clamp(yFt, 0, state.room.depth) };
      render();
      return;
    }
    if (!state.drag) return;
    const { xFt, yFt } = toFeetCoordinates(event);
    const primary = state.equipment.find(item => item.id === state.drag.primaryId);
    if (!primary) return;

    const newX = clamp(xFt - state.drag.primaryOffsetX, 0, Math.max(0, state.room.width - primary.width));
    const newY = clamp(yFt - state.drag.primaryOffsetY, 0, Math.max(0, state.room.depth - primary.depth));
    const dx = newX - primary.x;
    const dy = newY - primary.y;

    // Move all selected items by the same delta
    state.selectedIds.forEach(id => {
      const eq = state.equipment.find(item => item.id === id);
      if (!eq) return;
      eq.x = clamp(eq.x + dx, 0, Math.max(0, state.room.width - eq.width));
      eq.y = clamp(eq.y + dy, 0, Math.max(0, state.room.depth - eq.depth));
    });

    render();
  });

  const release = () => {
    if (state.wallDraw.enabled && state.wallDraw.start && state.wallDraw.current) {
      addInteriorWallFromDrag(state.wallDraw.start, state.wallDraw.current);
      state.wallDraw.start = null;
      state.wallDraw.current = null;
      render();
      return;
    }
    if (state.drag) {
      state.equipment
        .filter(eq => state.selectedIds.has(eq.id) && eq.listTag)
        .forEach(eq => syncEquipmentPosition(eq));
    }
    state.drag = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
}

// ── UI bindings ───────────────────────────────────────────────────────────────

function bindUI() {
  document.getElementById('apply-room').addEventListener('click', applyRoomChanges);
  document.getElementById('add-equipment').addEventListener('click', addEquipment);
  document.getElementById('add-interior-wall').addEventListener('click', addInteriorWall);
  document.getElementById('add-doorway').addEventListener('click', addDoorway);

  document.getElementById('draw-wall-mode').addEventListener('click', event => {
    state.wallDraw.enabled = !state.wallDraw.enabled;
    state.wallDraw.start = null;
    state.wallDraw.current = null;
    event.currentTarget.setAttribute('aria-pressed', String(state.wallDraw.enabled));
    event.currentTarget.classList.toggle('primary-btn', state.wallDraw.enabled);
    render();
  });

  document.getElementById('zoom-in').addEventListener('click', () => {
    state.scale = clamp(state.scale + 2, 8, 45);
    render();
  });

  document.getElementById('zoom-out').addEventListener('click', () => {
    state.scale = clamp(state.scale - 2, 8, 45);
    render();
  });

  document.getElementById('undo-action').addEventListener('click', undoLastAction);

  document.getElementById('delete-selected-equipment').addEventListener('click', () => {
    if (!state.selectedIds.size) return;
    pushHistory();
    state.equipment = state.equipment.filter(eq => !state.selectedIds.has(eq.id));
    state.selectedIds.clear();
    render();
  });

  document.getElementById('equipment-source').addEventListener('change', event => {
    const isCustom = event.target.value === 'custom';
    document.getElementById('equipment-preset-wrapper').classList.toggle('hidden', isCustom);
    document.getElementById('custom-name-wrapper').classList.toggle('hidden', !isCustom);
  });

  document.getElementById('equipment-preset').addEventListener('change', event => {
    const index = Number.parseInt(event.target.value, 10);
    const item = dataStore.getEquipment()[index];
    if (!item) return;
    document.getElementById('equipment-width').value = parseNumber(item.width, 4);
    document.getElementById('equipment-depth').value = parseNumber(item.depth, 2);
    if (item.voltage) {
      const voltage = String(item.voltage).toUpperCase();
      const select = document.getElementById('equipment-voltage');
      const matching = Array.from(select.options).find(opt => opt.value.toUpperCase() === voltage);
      if (matching) select.value = matching.value;
    }
  });

  // Ctrl/Cmd+Z for undo
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
      event.preventDefault();
      undoLastAction();
    }
  });
}

function initialize() {
  canvas = document.getElementById('equipment-arrangement-canvas');
  summaryEl = document.getElementById('arrangement-summary');
  if (!canvas) return;

  ['wall-north', 'wall-south', 'wall-east', 'wall-west', 'interior-type'].forEach(id => populateSelect(id, WALL_TYPES));
  populateSelect('equipment-voltage', VOLTAGE_OPTIONS);
  populateEquipmentPreset();
  createContextMenu();
  bindUI();
  bindCanvasInteractions();
  render();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initialize);
}

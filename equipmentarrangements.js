import * as dataStore from './dataStore.mjs';

const WALL_TYPES = ['Concrete', 'CMU', 'Gypsum', 'Fire Rated', 'Removable Panel'];
const VOLTAGE_OPTIONS = ['120V', '208V', '480V', '600V', '4.16kV', '13.8kV', '15kV'];
const DEFAULT_SCALE = 20;

const state = {
  room: {
    width: 30,
    depth: 20,
    walls: { north: 'Concrete', south: 'Concrete', east: 'CMU', west: 'CMU' },
    interiorWalls: []
  },
  equipment: [],
  scale: DEFAULT_SCALE,
  selectedEquipmentId: null,
  drag: null,
  violations: new Set()
};

let canvas;
let summaryEl;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseNumber(input, fallback) {
  const value = Number.parseFloat(input);
  return Number.isFinite(value) ? value : fallback;
}

function clearanceDepthFt(voltageText) {
  const normalized = String(voltageText || '').toLowerCase();
  const kvMatch = normalized.match(/([\d.]+)\s*k\s*v/);
  let volts = Number.parseFloat(normalized);
  if (kvMatch) {
    volts = Number.parseFloat(kvMatch[1]) * 1000;
  }
  if (!Number.isFinite(volts) || volts <= 150) return 3;
  if (volts <= 600) return 3.5;
  return 4;
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
  const depth = clearanceDepthFt(eq.voltage);
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
  const mainRect = equipmentRect(eq);
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
      state.room.interiorWalls.splice(index, 1);
      render();
    });
    row.appendChild(remove);
    list.appendChild(row);
  });
}

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

function drawText(text, xFt, yFt, className = 'equipment-room-text') {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  element.setAttribute('x', String(xFt * state.scale));
  element.setAttribute('y', String(yFt * state.scale));
  element.setAttribute('class', className);
  element.textContent = text;
  canvas.appendChild(element);
}

function renderRoom() {
  const roomRect = drawRect({ x: 0, y: 0, w: state.room.width, h: state.room.depth }, 'equipment-room-outer');
  roomRect.setAttribute('rx', '4');
  roomRect.setAttribute('ry', '4');

  [['north', 0, 0], ['south', 0, state.room.depth], ['west', 0, 0], ['east', state.room.width, 0]].forEach(([direction, x, y]) => {
    drawText(`${direction.toUpperCase()} · ${state.room.walls[direction]}`, x + 0.3, y + (direction === 'south' ? -0.3 : 0.8), 'equipment-wall-label');
  });

  state.room.interiorWalls.forEach(wall => {
    const rect = interiorWallRect(wall);
    const element = drawRect(rect, 'equipment-interior-wall');
    element.setAttribute('data-wall-type', wall.type);
  });
}

function renderEquipment() {
  state.equipment.forEach(eq => {
    const eqRect = equipmentRect(eq);
    const workspace = workspaceRect(eq);
    const hasViolation = state.violations.has(eq.id);
    drawRect(workspace, hasViolation ? 'equipment-clearance equipment-clearance-danger' : 'equipment-clearance', 0.35);

    const block = drawRect(eqRect, hasViolation ? 'equipment-block equipment-block-danger' : 'equipment-block');
    block.dataset.id = eq.id;
    if (state.selectedEquipmentId === eq.id) {
      block.classList.add('selected');
    }

    const textX = eq.x + 0.2;
    const textY = eq.y + 0.7;
    drawText(`${eq.name} (${eq.voltage})`, textX, textY, 'equipment-block-label');
    drawText(`${eq.width.toFixed(1)}×${eq.depth.toFixed(1)} ft · facing ${eq.facing}`, textX, textY + 0.6, 'equipment-block-meta');
  });
}

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
  canvas = previousCanvas;

  const zoomLabel = document.getElementById('zoom-label');
  if (zoomLabel) zoomLabel.textContent = `Scale: ${state.scale} px/ft`;
  updateSummary();
}

function addEquipment() {
  const source = document.getElementById('equipment-source').value;
  const presetSelect = document.getElementById('equipment-preset');
  const customName = document.getElementById('custom-name').value.trim();
  const width = clamp(parseNumber(document.getElementById('equipment-width').value, 4), 1, 30);
  const depth = clamp(parseNumber(document.getElementById('equipment-depth').value, 2), 1, 30);
  const voltage = document.getElementById('equipment-voltage').value;
  const facing = document.getElementById('equipment-facing').value;

  let name = 'Equipment';
  if (source === 'equipment-list') {
    const index = Number.parseInt(presetSelect.value, 10);
    const item = dataStore.getEquipment()[index];
    if (!item) return;
    name = item.tag || item.description || `Equipment-${state.equipment.length + 1}`;
  } else {
    name = customName || `Custom-${state.equipment.length + 1}`;
  }

  const id = `eq-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  const startX = clamp(1 + state.equipment.length * 0.8, 0, Math.max(0, state.room.width - width));
  const startY = clamp(1 + state.equipment.length * 0.6, 0, Math.max(0, state.room.depth - depth));

  state.equipment.push({ id, name, width, depth, voltage, facing, x: startX, y: startY });
  state.selectedEquipmentId = id;
  render();
}

function applyRoomChanges() {
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

  state.room.interiorWalls.push({ orientation, type, x, y, length: Math.max(1, adjustedLength) });
  render();
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
  const rect = canvas.getBoundingClientRect();
  const svgX = event.clientX - rect.left;
  const svgY = event.clientY - rect.top;
  const xFt = (svgX - 20) / state.scale;
  const yFt = (svgY - 20) / state.scale;
  return { xFt, yFt };
}

function bindCanvasInteractions() {
  canvas.addEventListener('pointerdown', event => {
    const { xFt, yFt } = toFeetCoordinates(event);
    const picked = pickEquipmentAtPoint(xFt, yFt);
    state.selectedEquipmentId = picked ? picked.id : null;
    if (picked) {
      state.drag = {
        id: picked.id,
        offsetX: xFt - picked.x,
        offsetY: yFt - picked.y
      };
      canvas.setPointerCapture(event.pointerId);
    }
    render();
  });

  canvas.addEventListener('pointermove', event => {
    if (!state.drag) return;
    const { xFt, yFt } = toFeetCoordinates(event);
    const eq = state.equipment.find(item => item.id === state.drag.id);
    if (!eq) return;
    eq.x = clamp(xFt - state.drag.offsetX, 0, Math.max(0, state.room.width - eq.width));
    eq.y = clamp(yFt - state.drag.offsetY, 0, Math.max(0, state.room.depth - eq.depth));
    render();
  });

  const release = () => {
    state.drag = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
}

function bindUI() {
  document.getElementById('apply-room').addEventListener('click', applyRoomChanges);
  document.getElementById('add-equipment').addEventListener('click', addEquipment);
  document.getElementById('add-interior-wall').addEventListener('click', addInteriorWall);

  document.getElementById('zoom-in').addEventListener('click', () => {
    state.scale = clamp(state.scale + 2, 8, 45);
    render();
  });

  document.getElementById('zoom-out').addEventListener('click', () => {
    state.scale = clamp(state.scale - 2, 8, 45);
    render();
  });

  document.getElementById('delete-selected-equipment').addEventListener('click', () => {
    if (!state.selectedEquipmentId) return;
    state.equipment = state.equipment.filter(eq => eq.id !== state.selectedEquipmentId);
    state.selectedEquipmentId = null;
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
}

function initialize() {
  canvas = document.getElementById('equipment-arrangement-canvas');
  summaryEl = document.getElementById('arrangement-summary');
  if (!canvas) return;

  ['wall-north', 'wall-south', 'wall-east', 'wall-west', 'interior-type'].forEach(id => populateSelect(id, WALL_TYPES));
  populateSelect('equipment-voltage', VOLTAGE_OPTIONS);
  populateEquipmentPreset();
  bindUI();
  bindCanvasInteractions();
  render();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initialize);
}

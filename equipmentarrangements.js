import * as dataStore from './dataStore.mjs';
import { openModal } from './src/components/modal.js';

const WALL_TYPES = ['Concrete', 'CMU', 'Gypsum', 'Metal', 'Fire Rated', 'Removable Panel'];
const VOLTAGE_OPTIONS = ['120V', '208V', '480V', '600V', '4.16kV', '13.8kV', '15kV'];
const DEFAULT_SCALE = 20;
const DEFAULT_EQUIPMENT_HEIGHT = 7;
const ELEVATION_WALL_TOLERANCE_FT = 1;
const MAX_HISTORY = 50;
const ARRANGEMENTS_KEY = 'equipmentArrangements';
const WALL_IDS = ['north', 'south', 'east', 'west'];

function defaultRoom() {
  return {
    width: 30,
    depth: 20,
    walls: { north: 'Concrete', south: 'Concrete', east: 'CMU', west: 'CMU' },
    interiorWalls: [],
    doorways: []
  };
}

const state = {
  arrangements: [],
  activeArrangementId: null,
  room: defaultRoom(),
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
  canvasPadding: 20,
  showDimensions: true,
  violations: new Set(),
  violationDetails: new Map(),
  history: []
};

let canvas;
let elevationCanvas;
let summaryEl;
let clearanceDetailsEl;
let contextMenu = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseNumber(input, fallback) {
  const value = Number.parseFloat(input);
  return Number.isFinite(value) ? value : fallback;
}

function numberFromFields(source, keys, fallback) {
  if (!source) return fallback;
  for (const key of keys) {
    const raw = source[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = parseNumber(raw, Number.NaN);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function equipmentHeightFromSource(source) {
  return clamp(numberFromFields(source, ['height', 'heightFt', 'equipmentHeight', 'elevationHeight', 'enclosureHeight'], DEFAULT_EQUIPMENT_HEIGHT), 1, 40);
}

function equipmentBaseElevationFromSource(source) {
  return clamp(numberFromFields(source, ['baseElevation', 'baseElevationFt', 'mountingHeight', 'z'], 0), 0, 60);
}

function snapToStep(value, step = 0.5) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function cloneRoom(room = defaultRoom()) {
  const fallback = defaultRoom();
  return {
    width: clamp(parseNumber(room.width, fallback.width), 8, 200),
    depth: clamp(parseNumber(room.depth, fallback.depth), 8, 200),
    walls: {
      north: room.walls?.north || fallback.walls.north,
      south: room.walls?.south || fallback.walls.south,
      east: room.walls?.east || fallback.walls.east,
      west: room.walls?.west || fallback.walls.west
    },
    interiorWalls: Array.isArray(room.interiorWalls)
      ? room.interiorWalls.map(wall => ({ ...wall }))
      : [],
    doorways: Array.isArray(room.doorways)
      ? room.doorways.map(door => ({ swing: 'in', ...door }))
      : []
  };
}

function cloneEquipmentList(equipment = []) {
  return Array.isArray(equipment) ? equipment.map(eq => ({ ...eq })) : [];
}

function cloneSavedViews(savedViews = []) {
  return Array.isArray(savedViews)
    ? savedViews.map((view, index) => ({
        id: view.id || uniqueId('view'),
        name: view.name || `View ${index + 1}`,
        scale: clamp(parseNumber(view.scale, DEFAULT_SCALE), 8, 45),
        elevationWall: ['north', 'south', 'east', 'west', 'selected'].includes(view.elevationWall) ? view.elevationWall : 'south',
        showDimensions: view.showDimensions !== false,
        selectedIds: Array.isArray(view.selectedIds) ? view.selectedIds.map(String) : []
      }))
    : [];
}

function createArrangement(name, source = null) {
  return {
    id: uniqueId('arr'),
    name: name || 'Arrangement',
    room: cloneRoom(source?.room),
    equipment: cloneEquipmentList(source?.equipment),
    scale: clamp(parseNumber(source?.scale, DEFAULT_SCALE), 8, 45),
    source: source?.source || 'manual',
    listAssignment: source?.listAssignment || '',
    savedViews: cloneSavedViews(source?.savedViews)
  };
}

function hydrateArrangement(record, index) {
  const fallbackName = `Arrangement ${index + 1}`;
  const arrangement = createArrangement(record?.name || fallbackName, record);
  if (record?.id) arrangement.id = String(record.id);
  return arrangement;
}

function activeArrangementIndex() {
  return state.arrangements.findIndex(arrangement => arrangement.id === state.activeArrangementId);
}

function getActiveArrangement() {
  return state.arrangements[activeArrangementIndex()] || state.arrangements[0] || null;
}

function snapshotActiveArrangement() {
  const active = getActiveArrangement();
  return {
    id: active?.id || state.activeArrangementId || uniqueId('arr'),
    name: active?.name || 'Arrangement 1',
    room: cloneRoom(state.room),
    equipment: cloneEquipmentList(state.equipment),
    scale: state.scale,
    source: active?.source || 'manual',
    listAssignment: active?.listAssignment || '',
    savedViews: cloneSavedViews(active?.savedViews)
  };
}

function saveActiveArrangementToMemory() {
  if (!state.arrangements.length) return;
  const snapshot = snapshotActiveArrangement();
  const index = activeArrangementIndex();
  if (index === -1) {
    state.arrangements.push(snapshot);
    state.activeArrangementId = snapshot.id;
  } else {
    state.arrangements[index] = snapshot;
  }
}

let arrangementPersistTimer = null;
let applyingArrangement = false;

function persistArrangements() {
  if (!state.arrangements.length) return;
  saveActiveArrangementToMemory();
  dataStore.setItem(ARRANGEMENTS_KEY, {
    activeArrangementId: state.activeArrangementId,
    arrangements: state.arrangements.map(arrangement => ({
      id: arrangement.id,
      name: arrangement.name,
      room: cloneRoom(arrangement.room),
      equipment: cloneEquipmentList(arrangement.equipment),
      scale: arrangement.scale,
      source: arrangement.source || 'manual',
      listAssignment: arrangement.listAssignment || '',
      savedViews: cloneSavedViews(arrangement.savedViews)
    }))
  });
}

function scheduleArrangementPersist() {
  if (applyingArrangement || !state.arrangements.length || typeof window === 'undefined') return;
  if (arrangementPersistTimer) window.clearTimeout(arrangementPersistTimer);
  arrangementPersistTimer = window.setTimeout(() => {
    arrangementPersistTimer = null;
    persistArrangements();
  }, 120);
}

function applyArrangementToState(arrangement) {
  if (!arrangement) return;
  applyingArrangement = true;
  state.activeArrangementId = arrangement.id;
  state.room = cloneRoom(arrangement.room);
  state.equipment = cloneEquipmentList(arrangement.equipment);
  state.scale = clamp(parseNumber(arrangement.scale, DEFAULT_SCALE), 8, 45);
  state.selectedIds = new Set();
  state.drag = null;
  state.wallDraw.start = null;
  state.wallDraw.current = null;
  state.history = [];
  syncRoomControls();
  applyingArrangement = false;
}

function loadArrangements() {
  const stored = dataStore.getItem(ARRANGEMENTS_KEY, null);
  const records = Array.isArray(stored?.arrangements)
    ? stored.arrangements
    : (Array.isArray(stored) ? stored : []);
  state.arrangements = records.length
    ? records.map((record, index) => hydrateArrangement(record, index))
    : [createArrangement('Arrangement 1')];
  const storedActiveId = stored?.activeArrangementId;
  state.activeArrangementId = state.arrangements.some(arrangement => arrangement.id === storedActiveId)
    ? storedActiveId
    : state.arrangements[0].id;
  applyArrangementToState(getActiveArrangement());
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
  const doorwayAccess = state.room.doorways.some(door => {
    if (!door.isEgress) return false;
    const clearance = 0.5;
    switch (door.wall) {
      case 'north': {
        const overlapsX = workspace.x <= door.position + door.width && workspace.x + workspace.w >= door.position;
        return overlapsX && workspace.y <= clearance;
      }
      case 'south': {
        const overlapsX = workspace.x <= door.position + door.width && workspace.x + workspace.w >= door.position;
        return overlapsX && workspace.y + workspace.h >= state.room.depth - clearance;
      }
      case 'east': {
        const overlapsY = workspace.y <= door.position + door.width && workspace.y + workspace.h >= door.position;
        return overlapsY && workspace.x + workspace.w >= state.room.width - clearance;
      }
      case 'west': {
        const overlapsY = workspace.y <= door.position + door.width && workspace.y + workspace.h >= door.position;
        return overlapsY && workspace.x <= clearance;
      }
      default:
        return false;
    }
  });
  if (doorwayAccess) return false;

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

function addViolationDetail(violations, details, eq, message) {
  violations.add(eq.id);
  if (!details.has(eq.id)) details.set(eq.id, []);
  const messages = details.get(eq.id);
  if (!messages.includes(message)) messages.push(message);
}

function evaluateViolations() {
  const violations = new Set();
  const details = new Map();

  state.equipment.forEach(eq => {
    const eqRect = equipmentRect(eq);
    const workspace = workspaceRect(eq);

    if (!insideRoom(eqRect)) {
      addViolationDetail(violations, details, eq, 'Equipment footprint extends outside the room.');
    }

    if (!insideRoom(workspace)) {
      addViolationDetail(violations, details, eq, 'Required working clearance extends outside the room.');
    }

    state.equipment.forEach(other => {
      if (other.id === eq.id) return;
      const otherRect = equipmentRect(other);
      if (intersects(eqRect, otherRect)) {
        addViolationDetail(violations, details, eq, `Footprint overlaps ${other.name}.`);
      } else if (intersects(workspace, otherRect)) {
        addViolationDetail(violations, details, eq, `Working clearance is blocked by ${other.name}.`);
      }
    });

    state.room.interiorWalls.forEach(wall => {
      const wallRect = interiorWallRect(wall);
      if (intersects(eqRect, wallRect)) {
        addViolationDetail(violations, details, eq, `Footprint overlaps an interior ${wall.type} wall.`);
      } else if (intersects(workspace, wallRect)) {
        addViolationDetail(violations, details, eq, `Working clearance is blocked by an interior ${wall.type} wall.`);
      }
    });

    if (accessViolation(eq, workspace)) {
      addViolationDetail(violations, details, eq, 'Working space does not have a clear access path or egress doorway.');
    }
  });

  state.violations = violations;
  state.violationDetails = details;
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
    const heightInput = document.getElementById('equipment-height');
    const baseElevationInput = document.getElementById('equipment-base-elevation');
    widthInput.value = parseNumber(options[0].item.width, 4);
    depthInput.value = parseNumber(options[0].item.depth, 2);
    heightInput.value = equipmentHeightFromSource(options[0].item);
    baseElevationInput.value = equipmentBaseElevationFromSource(options[0].item);
  }
}

function syncRoomControls() {
  const widthInput = document.getElementById('room-width');
  const depthInput = document.getElementById('room-depth');
  if (widthInput) widthInput.value = state.room.width;
  if (depthInput) depthInput.value = state.room.depth;
  ['north', 'south', 'east', 'west'].forEach(direction => {
    const select = document.getElementById(`wall-${direction}`);
    if (select) select.value = state.room.walls[direction];
  });
}

function renderArrangementControls() {
  const select = document.getElementById('arrangement-select');
  const nameInput = document.getElementById('arrangement-name');
  const countEl = document.getElementById('arrangement-count');
  const deleteButton = document.getElementById('delete-arrangement');
  if (!select || !nameInput || !countEl) return;

  const active = getActiveArrangement();
  const activeIndex = Math.max(0, activeArrangementIndex());
  select.innerHTML = '';
  state.arrangements.forEach((arrangement, index) => {
    const option = document.createElement('option');
    option.value = arrangement.id;
    option.textContent = `${index + 1}. ${arrangement.name}`;
    select.appendChild(option);
  });
  if (active) {
    select.value = active.id;
    nameInput.value = active.name;
  }
  countEl.textContent = `${activeIndex + 1} of ${state.arrangements.length}`;
  if (deleteButton) deleteButton.disabled = state.arrangements.length <= 1;
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
    const swingText = dw.swing === 'out' ? 'swings out' : 'swings in';
    const tag = dw.isEgress ? ' - EGRESS' : '';
    row.innerHTML = `<span>${dw.wall} wall - ${dw.width.toFixed(1)} ft wide - ${dw.position.toFixed(1)} ft from corner - ${swingText}${tag}</span>`;
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

function activeSavedViews() {
  const active = getActiveArrangement();
  if (!active) return [];
  if (!Array.isArray(active.savedViews)) active.savedViews = [];
  return active.savedViews;
}

function renderSavedViewControls() {
  const select = document.getElementById('saved-view-select');
  const nameInput = document.getElementById('saved-view-name');
  const applyButton = document.getElementById('apply-view');
  const deleteButton = document.getElementById('delete-view');
  const dimensionsToggle = document.getElementById('show-dimensions');
  if (dimensionsToggle) dimensionsToggle.checked = state.showDimensions;
  if (!select) return;

  const views = activeSavedViews();
  const previous = select.value;
  select.innerHTML = '';
  if (!views.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No saved views';
    select.appendChild(option);
  } else {
    views.forEach(view => {
      const option = document.createElement('option');
      option.value = view.id;
      option.textContent = view.name;
      select.appendChild(option);
    });
  }

  const nextValue = views.some(view => view.id === previous) ? previous : (views[0]?.id || '');
  select.value = nextValue;
  const activeView = views.find(view => view.id === nextValue);
  if (nameInput && document.activeElement !== nameInput) {
    nameInput.value = activeView?.name || '';
  }
  if (applyButton) applyButton.disabled = !activeView;
  if (deleteButton) deleteButton.disabled = !activeView;
}

function renderClearanceDetails() {
  if (!clearanceDetailsEl) return;
  clearanceDetailsEl.innerHTML = '';
  if (!state.equipment.length) {
    clearanceDetailsEl.textContent = 'Clearance details will appear after equipment is placed.';
    return;
  }
  if (!state.violationDetails.size) {
    clearanceDetailsEl.textContent = 'All equipment currently clears the modeled room, walls, doors, and other equipment.';
    return;
  }

  const list = document.createElement('ul');
  state.equipment
    .filter(eq => state.violationDetails.has(eq.id))
    .forEach(eq => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = eq.name;
      const detail = document.createElement('span');
      detail.textContent = `: ${state.violationDetails.get(eq.id).join(' ')}`;
      item.appendChild(title);
      item.appendChild(detail);
      list.appendChild(item);
    });
  clearanceDetailsEl.appendChild(list);
}

function applyIconButton(button, config) {
  if (!button) return;
  button.classList.add('equipment-icon-btn');
  button.setAttribute('aria-label', config.label);
  button.setAttribute('title', config.title || config.label);
  button.dataset.tooltip = config.tooltip || config.label;
  button.textContent = '';

  if (config.icon) {
    const icon = document.createElement('img');
    icon.src = config.icon;
    icon.alt = '';
    icon.className = 'control-icon';
    icon.loading = 'lazy';
    icon.decoding = 'async';
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);
  } else {
    const symbol = document.createElement('span');
    symbol.className = 'equipment-toolbar-symbol';
    symbol.setAttribute('aria-hidden', 'true');
    symbol.innerHTML = config.symbolHtml || '';
    button.appendChild(symbol);
  }

  const label = document.createElement('span');
  label.className = 'sr-only';
  label.textContent = config.label;
  button.appendChild(label);
}

function compactToolbarControls() {
  const buttonConfigs = {
    'prev-arrangement': { label: 'Previous arrangement', symbolHtml: '&lsaquo;' },
    'next-arrangement': { label: 'Next arrangement', symbolHtml: '&rsaquo;' },
    'add-arrangement': { label: 'Add arrangement', icon: 'icons/toolbar/add-arrangement.svg' },
    'duplicate-arrangement': { label: 'Duplicate arrangement', icon: 'icons/toolbar/copy.svg' },
    'delete-arrangement': { label: 'Delete arrangement', icon: 'icons/toolbar/trash.svg' },
    'zoom-out': { label: 'Zoom out', symbolHtml: '&minus;' },
    'zoom-in': { label: 'Zoom in', symbolHtml: '+' },
    'undo-action': { label: 'Undo last action', title: 'Undo last action (Ctrl+Z)', tooltip: 'Undo', icon: 'icons/toolbar/undo.svg' },
    'delete-selected-equipment': { label: 'Delete selected equipment', tooltip: 'Delete selected', icon: 'icons/toolbar/delete-selected.svg' },
    'auto-layout-equipment': { label: 'Auto layout equipment', tooltip: 'Auto layout', icon: 'icons/toolbar/auto-layout.svg' },
    'build-arrangements-from-list': { label: 'Build arrangements from equipment list', tooltip: 'Build from list', icon: 'icons/toolbar/import.svg' },
    'snap-selected': { label: 'Snap selected equipment to grid', tooltip: 'Snap selected', icon: 'icons/toolbar/snap.svg' },
    'align-selected-west': { label: 'Align selected equipment west', tooltip: 'Align west', icon: 'icons/toolbar/align-left.svg' },
    'align-selected-south': { label: 'Align selected equipment south', tooltip: 'Align south', icon: 'icons/toolbar/align-bottom.svg' },
    'equal-space-selected': { label: 'Equal-space selected equipment', tooltip: 'Equal space', icon: 'icons/toolbar/distribute-h.svg' },
    'assign-lineup': { label: 'Assign selected equipment to lineup', tooltip: 'Assign lineup', icon: 'icons/toolbar/connect.svg' },
    'select-lineup': { label: 'Select lineup equipment', tooltip: 'Select lineup', icon: 'icons/equipment.svg' },
    'space-lineup': { label: 'Space lineup equipment evenly', tooltip: 'Space lineup', icon: 'icons/toolbar/distribute-v.svg' },
    'save-view': { label: 'Save view', icon: 'icons/toolbar/validate.svg' },
    'apply-view': { label: 'Apply view', icon: 'icons/toolbar/redo.svg' },
    'delete-view': { label: 'Delete view', icon: 'icons/toolbar/delete-view.svg' },
    'export-layout-report': { label: 'Export layout sheet SVG', tooltip: 'Export sheet SVG', icon: 'icons/toolbar/export.svg' },
    'download-elevation-svg': { label: 'Download elevation SVG', tooltip: 'Download SVG', icon: 'icons/toolbar/download.svg' }
  };

  Object.entries(buttonConfigs).forEach(([id, config]) => {
    applyIconButton(document.getElementById(id), config);
  });

  const dimensionsToggle = document.getElementById('show-dimensions');
  const dimensionsLabel = dimensionsToggle?.closest('label');
  if (!dimensionsLabel) return;
  dimensionsLabel.classList.remove('equipment-checkbox-label');
  dimensionsLabel.classList.add('equipment-icon-toggle');
  dimensionsLabel.setAttribute('title', 'Show dimensions');
  dimensionsLabel.dataset.tooltip = 'Dimensions';
  Array.from(dimensionsLabel.childNodes).forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) node.remove();
  });
  if (!dimensionsLabel.querySelector('img')) {
    const icon = document.createElement('img');
    icon.src = 'icons/toolbar/dimension.svg';
    icon.alt = '';
    icon.className = 'control-icon';
    icon.loading = 'lazy';
    icon.decoding = 'async';
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'sr-only';
    label.textContent = 'Show dimensions';
    dimensionsLabel.appendChild(icon);
    dimensionsLabel.appendChild(label);
  }
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

function drawLine(x1Ft, y1Ft, x2Ft, y2Ft, className) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  element.setAttribute('x1', String(x1Ft * state.scale));
  element.setAttribute('y1', String(y1Ft * state.scale));
  element.setAttribute('x2', String(x2Ft * state.scale));
  element.setAttribute('y2', String(y2Ft * state.scale));
  element.setAttribute('class', className);
  canvas.appendChild(element);
  return element;
}

function drawDimensionText(text, xFt, yFt, anchor = 'middle', rotate = false) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  const x = xFt * state.scale;
  const y = yFt * state.scale;
  element.setAttribute('x', String(x));
  element.setAttribute('y', String(y));
  element.setAttribute('class', 'equipment-dimension-label');
  element.setAttribute('text-anchor', anchor);
  if (rotate) element.setAttribute('transform', `rotate(-90 ${x} ${y})`);
  element.textContent = text;
  canvas.appendChild(element);
  return element;
}

function drawHorizontalDimension(x1Ft, x2Ft, yFt, label) {
  drawLine(x1Ft, yFt, x2Ft, yFt, 'equipment-dimension-line');
  drawLine(x1Ft, yFt - 0.18, x1Ft, yFt + 0.18, 'equipment-dimension-tick');
  drawLine(x2Ft, yFt - 0.18, x2Ft, yFt + 0.18, 'equipment-dimension-tick');
  drawDimensionText(label, (x1Ft + x2Ft) / 2, yFt - 0.15);
}

function drawVerticalDimension(xFt, y1Ft, y2Ft, label) {
  drawLine(xFt, y1Ft, xFt, y2Ft, 'equipment-dimension-line');
  drawLine(xFt - 0.18, y1Ft, xFt + 0.18, y1Ft, 'equipment-dimension-tick');
  drawLine(xFt - 0.18, y2Ft, xFt + 0.18, y2Ft, 'equipment-dimension-tick');
  drawDimensionText(label, xFt - 0.15, (y1Ft + y2Ft) / 2, 'middle', true);
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
    const swingsOut = dw.swing === 'out';

    let panelPath = '';
    let swingPath = '';
    let labelX = 0;
    let labelY = 0;
    let labelAnchor = 'middle';

    switch (dw.wall) {
      case 'north': {
        panelPath = swingsOut
          ? `M ${p*s},0 L ${p*s},${-w*s}`
          : `M ${p*s},0 L ${p*s},${w*s}`;
        swingPath = swingsOut
          ? `M ${(p+w)*s},0 A ${w*s},${w*s} 0 0,0 ${p*s},${-w*s}`
          : `M ${(p+w)*s},0 A ${w*s},${w*s} 0 0,1 ${p*s},${w*s}`;
        labelX = (p + w / 2) * s;
        labelY = swingsOut ? -w * s - 6 : -6;
        break;
      }
      case 'south': {
        panelPath = swingsOut
          ? `M ${p*s},${H*s} L ${p*s},${(H+w)*s}`
          : `M ${p*s},${H*s} L ${p*s},${(H-w)*s}`;
        swingPath = swingsOut
          ? `M ${(p+w)*s},${H*s} A ${w*s},${w*s} 0 0,1 ${p*s},${(H+w)*s}`
          : `M ${(p+w)*s},${H*s} A ${w*s},${w*s} 0 0,0 ${p*s},${(H-w)*s}`;
        labelX = (p + w / 2) * s;
        labelY = swingsOut ? (H + w) * s + 14 : H * s + 14;
        break;
      }
      case 'west': {
        panelPath = swingsOut
          ? `M 0,${p*s} L ${-w*s},${p*s}`
          : `M 0,${p*s} L ${w*s},${p*s}`;
        swingPath = swingsOut
          ? `M 0,${(p+w)*s} A ${w*s},${w*s} 0 0,1 ${-w*s},${p*s}`
          : `M 0,${(p+w)*s} A ${w*s},${w*s} 0 0,0 ${w*s},${p*s}`;
        labelX = swingsOut ? -w * s - 6 : -6;
        labelY = (p + w / 2) * s;
        labelAnchor = 'end';
        break;
      }
      case 'east': {
        panelPath = swingsOut
          ? `M ${W*s},${p*s} L ${(W+w)*s},${p*s}`
          : `M ${W*s},${p*s} L ${(W-w)*s},${p*s}`;
        swingPath = swingsOut
          ? `M ${W*s},${(p+w)*s} A ${w*s},${w*s} 0 0,0 ${(W+w)*s},${p*s}`
          : `M ${W*s},${(p+w)*s} A ${w*s},${w*s} 0 0,1 ${(W-w)*s},${p*s}`;
        labelX = swingsOut ? (W + w) * s + 6 : W * s + 6;
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

function canvasPaddingPx() {
  const maxOutSwingWidth = state.room.doorways.reduce((max, door) => (
    door.swing === 'out' ? Math.max(max, door.width) : max
  ), 0);
  const dimensionPadding = state.showDimensions ? state.scale * 2 : 20;
  return Math.max(20, Math.ceil(maxOutSwingWidth * state.scale + 28), dimensionPadding);
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

function selectedEquipment() {
  return state.equipment.filter(eq => state.selectedIds.has(eq.id));
}

function lineupGroups() {
  const groups = new Map();
  state.equipment.forEach(eq => {
    const name = String(eq.lineup || '').trim();
    if (!name) return;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(eq);
  });
  return groups;
}

function renderLineups() {
  lineupGroups().forEach((items, name) => {
    if (!items.length) return;
    const minX = Math.max(0, Math.min(...items.map(eq => eq.x)) - 0.35);
    const minY = Math.max(0, Math.min(...items.map(eq => eq.y)) - 0.35);
    const maxX = Math.min(state.room.width, Math.max(...items.map(eq => eq.x + eq.width)) + 0.35);
    const maxY = Math.min(state.room.depth, Math.max(...items.map(eq => eq.y + eq.depth)) + 0.35);
    drawRect({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, 'equipment-lineup-outline');
    drawText(name, minX + 0.15, Math.max(0.35, minY - 0.15), 'equipment-lineup-label', 'meta');
  });
}

function renderDimensions() {
  if (!state.showDimensions) return;
  drawHorizontalDimension(0, state.room.width, -1.2, `${state.room.width.toFixed(1)}' room width`);
  drawVerticalDimension(-1.2, 0, state.room.depth, `${state.room.depth.toFixed(1)}' room depth`);

  selectedEquipment().forEach(eq => {
    drawHorizontalDimension(eq.x, eq.x + eq.width, Math.max(-0.55, eq.y - 0.45), `${eq.width.toFixed(1)}'`);
    drawVerticalDimension(Math.min(state.room.width + 0.8, eq.x + eq.width + 0.45), eq.y, eq.y + eq.depth, `${eq.depth.toFixed(1)}'`);
    if (eq.x > 0.05) {
      drawHorizontalDimension(0, eq.x, Math.min(state.room.depth + 0.8, eq.y + eq.depth + 0.45), `${eq.x.toFixed(1)}' from west`);
    }
    if (eq.y > 0.05) {
      drawVerticalDimension(Math.max(-0.55, eq.x - 0.45), 0, eq.y, `${eq.y.toFixed(1)}' from north`);
    }
  });
}

function selectedElevationWall() {
  return document.getElementById('elevation-wall')?.value || 'south';
}

function elevationWallLabel(wall) {
  if (wall === 'selected') return 'Selected Equipment';
  return wall.charAt(0).toUpperCase() + wall.slice(1);
}

function elevationWallLength(wall) {
  return (wall === 'east' || wall === 'west') ? state.room.depth : state.room.width;
}

function elevationAxisOffset(eq, wall) {
  return (wall === 'east' || wall === 'west') ? eq.y : eq.x;
}

function elevationAxisSpan(eq, wall) {
  return (wall === 'east' || wall === 'west') ? eq.depth : eq.width;
}

function oppositeWall(wall) {
  switch (wall) {
    case 'north': return 'south';
    case 'south': return 'north';
    case 'east': return 'west';
    case 'west': return 'east';
    default: return '';
  }
}

function equipmentWallGap(eq, wall) {
  switch (wall) {
    case 'north': return eq.y;
    case 'south': return state.room.depth - (eq.y + eq.depth);
    case 'west': return eq.x;
    case 'east': return state.room.width - (eq.x + eq.width);
    default: return Number.POSITIVE_INFINITY;
  }
}

function equipmentElevationWall(eq) {
  const gaps = WALL_IDS
    .map(wall => ({ wall, gap: Math.max(0, equipmentWallGap(eq, wall)) }))
    .sort((a, b) => a.gap - b.gap);
  const nearestGap = gaps[0]?.gap ?? Number.POSITIVE_INFINITY;
  if (nearestGap > ELEVATION_WALL_TOLERANCE_FT) return '';

  const candidates = gaps
    .filter(item => item.gap <= Math.max(ELEVATION_WALL_TOLERANCE_FT, nearestGap + 0.01))
    .map(item => item.wall);
  const preferredWall = oppositeWall(eq.facing);
  if (candidates.includes(preferredWall)) return preferredWall;
  return candidates[0] || '';
}

function equipmentForElevationWall(wall) {
  return state.equipment.filter(eq => equipmentElevationWall(eq) === wall);
}

function syncElevationWallToSelectedEquipment() {
  const select = document.getElementById('elevation-wall');
  if (!select || select.value === 'selected') return false;
  const selectedWalls = new Set(selectedEquipment().map(eq => equipmentElevationWall(eq)).filter(Boolean));
  if (selectedWalls.size !== 1) return false;
  const [wall] = selectedWalls;
  if (select.value === wall) return false;
  select.value = wall;
  return true;
}

function selectedElevationItems() {
  return state.equipment.filter(eq => state.selectedIds.has(eq.id));
}

function selectedElevationProfile(items = selectedElevationItems()) {
  if (!items.length) {
    return { items: [], axis: 'x', origin: 0, length: 1, axisLabel: 'Selected lineup' };
  }
  const minX = Math.min(...items.map(eq => eq.x));
  const maxX = Math.max(...items.map(eq => eq.x + eq.width));
  const minY = Math.min(...items.map(eq => eq.y));
  const maxY = Math.max(...items.map(eq => eq.y + eq.depth));
  const spreadX = maxX - minX;
  const spreadY = maxY - minY;
  const axis = spreadY > spreadX ? 'y' : 'x';
  return {
    items,
    axis,
    origin: axis === 'y' ? minY : minX,
    length: Math.max(1, axis === 'y' ? spreadY : spreadX),
    axisLabel: axis === 'y' ? 'Y-axis centerline' : 'X-axis centerline'
  };
}

function truncateLabel(text, maxLength) {
  const value = String(text || '');
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 3))}...`;
}

function appendElevationElement(tag, attrs = {}, text = '') {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    element.setAttribute(key, String(value));
  });
  if (text) element.textContent = text;
  elevationCanvas.appendChild(element);
  return element;
}

function renderElevationGrid(baseY, left, top, wallLength, maxHeight, scale) {
  for (let elev = 0; elev <= maxHeight + 0.001; elev += 2) {
    const y = baseY - elev * scale;
    appendElevationElement('line', {
      x1: left,
      y1: y,
      x2: left + wallLength * scale,
      y2: y,
      class: elev === 0 ? 'equipment-elevation-ground' : 'equipment-elevation-grid'
    });
    appendElevationElement('text', {
      x: left - 10,
      y: y + 4,
      class: 'equipment-elevation-axis-label',
      'text-anchor': 'end'
    }, `${elev.toFixed(0)}'`);
  }

  for (let offset = 0; offset <= wallLength + 0.001; offset += 5) {
    const x = left + offset * scale;
    appendElevationElement('line', {
      x1: x,
      y1: top,
      x2: x,
      y2: baseY,
      class: 'equipment-elevation-grid'
    });
    appendElevationElement('text', {
      x,
      y: baseY + 18,
      class: 'equipment-elevation-axis-label',
      'text-anchor': 'middle'
    }, `${offset.toFixed(0)}'`);
  }
}

function renderElevationDoorways(wall, baseY, left, scale) {
  state.room.doorways
    .filter(door => door.wall === wall)
    .forEach(door => {
      const doorHeight = 7;
      const x = left + door.position * scale;
      const y = baseY - doorHeight * scale;
      appendElevationElement('rect', {
        x,
        y,
        width: Math.max(door.width * scale, 12),
        height: doorHeight * scale,
        class: door.isEgress ? 'equipment-elevation-door equipment-elevation-door-egress' : 'equipment-elevation-door'
      });
      appendElevationElement('text', {
        x: x + (door.width * scale) / 2,
        y: y + 16,
        class: 'equipment-elevation-door-label',
        'text-anchor': 'middle'
      }, door.isEgress ? 'EGRESS' : 'DOOR');
    });
}

function renderElevationEquipment(wall, baseY, left, wallLength, scale) {
  return equipmentForElevationWall(wall)
    .sort((a, b) => elevationAxisOffset(a, wall) - elevationAxisOffset(b, wall))
    .map(eq => {
      const span = clamp(elevationAxisSpan(eq, wall), 0.5, wallLength);
      const offset = clamp(elevationAxisOffset(eq, wall), 0, Math.max(0, wallLength - span));
      const height = equipmentHeightFromSource(eq);
      const baseElevation = equipmentBaseElevationFromSource(eq);
      const x = left + offset * scale;
      const y = baseY - (baseElevation + height) * scale;
      const width = Math.max(span * scale, 28);
      const blockHeight = Math.max(height * scale, 24);
      const hasViolation = state.violations.has(eq.id);
      appendElevationElement('rect', {
        x,
        y,
        width,
        height: blockHeight,
        rx: 3,
        class: hasViolation ? 'equipment-elevation-block equipment-elevation-block-danger' : 'equipment-elevation-block'
      });
      appendElevationElement('text', {
        x: x + 6,
        y: y + 16,
        class: 'equipment-elevation-label'
      }, truncateLabel(eq.name, Math.max(7, Math.floor((width - 8) / 7))));
      if (blockHeight > 42) {
        appendElevationElement('text', {
          x: x + 6,
          y: y + 32,
          class: 'equipment-elevation-meta'
        }, `${span.toFixed(1)} x ${height.toFixed(1)} ft`);
      }
      return eq;
    });
}

function renderSelectedElevationEquipment(profile, baseY, left, scale) {
  return profile.items
    .slice()
    .sort((a, b) => {
      const aOffset = profile.axis === 'y' ? a.y : a.x;
      const bOffset = profile.axis === 'y' ? b.y : b.x;
      return aOffset - bOffset;
    })
    .map(eq => {
      const span = profile.axis === 'y' ? eq.depth : eq.width;
      const rawOffset = profile.axis === 'y' ? eq.y : eq.x;
      const offset = Math.max(0, rawOffset - profile.origin);
      const height = equipmentHeightFromSource(eq);
      const baseElevation = equipmentBaseElevationFromSource(eq);
      const x = left + offset * scale;
      const y = baseY - (baseElevation + height) * scale;
      const width = Math.max(span * scale, 28);
      const blockHeight = Math.max(height * scale, 24);
      const hasViolation = state.violations.has(eq.id);
      appendElevationElement('rect', {
        x,
        y,
        width,
        height: blockHeight,
        rx: 3,
        class: hasViolation ? 'equipment-elevation-block equipment-elevation-block-danger' : 'equipment-elevation-block'
      });
      appendElevationElement('text', {
        x: x + 6,
        y: y + 16,
        class: 'equipment-elevation-label'
      }, truncateLabel(eq.name, Math.max(7, Math.floor((width - 8) / 7))));
      if (blockHeight > 42) {
        appendElevationElement('text', {
          x: x + 6,
          y: y + 32,
          class: 'equipment-elevation-meta'
        }, `${span.toFixed(1)} x ${height.toFixed(1)} ft`);
      }
      return eq;
    });
}

function renderElevation() {
  if (!elevationCanvas) return;
  const wall = selectedElevationWall();
  const selectedMode = wall === 'selected';
  const profile = selectedMode ? selectedElevationProfile() : null;
  const wallLength = selectedMode ? profile.length : Math.max(1, elevationWallLength(wall));
  const equipment = selectedMode ? profile.items : equipmentForElevationWall(wall);
  const tallestEquipment = equipment.reduce((max, eq) => (
    Math.max(max, equipmentBaseElevationFromSource(eq) + equipmentHeightFromSource(eq))
  ), DEFAULT_EQUIPMENT_HEIGHT);
  const maxHeight = Math.max(10, Math.ceil(tallestEquipment / 2) * 2);
  const padding = { left: 56, right: 28, top: 34, bottom: 42 };
  const scale = Math.min(
    34,
    Math.max(8, Math.min((860 - padding.left - padding.right) / wallLength, (320 - padding.top - padding.bottom) / maxHeight))
  );
  const width = Math.max(720, Math.ceil(wallLength * scale + padding.left + padding.right));
  const height = Math.max(280, Math.ceil(maxHeight * scale + padding.top + padding.bottom));
  const baseY = height - padding.bottom;

  elevationCanvas.innerHTML = '';
  elevationCanvas.setAttribute('viewBox', `0 0 ${width} ${height}`);
  appendElevationElement('rect', { x: 0, y: 0, width, height, class: 'equipment-elevation-bg' });
  renderElevationGrid(baseY, padding.left, padding.top, wallLength, maxHeight, scale);
  if (!selectedMode) {
    renderElevationDoorways(wall, baseY, padding.left, scale);
  }
  const renderedEquipment = selectedMode
    ? renderSelectedElevationEquipment(profile, baseY, padding.left, scale)
    : renderElevationEquipment(wall, baseY, padding.left, wallLength, scale);

  appendElevationElement('text', {
    x: padding.left,
    y: 22,
    class: 'equipment-elevation-title'
  }, `${getActiveArrangement()?.name || 'Arrangement'} - ${elevationWallLabel(wall)} Elevation`);
  appendElevationElement('text', {
    x: width - padding.right,
    y: 22,
    class: 'equipment-elevation-title',
    'text-anchor': 'end'
  }, selectedMode ? profile.axisLabel : `${state.room.walls[wall]} wall`);

  const status = document.getElementById('elevation-status');
  if (status) {
    if (selectedMode) {
      status.textContent = renderedEquipment.length
        ? `Selected elevation shows ${renderedEquipment.length} equipment item${renderedEquipment.length === 1 ? '' : 's'}.`
        : 'Select one or more equipment items on the plan to create a centerline elevation.';
    } else {
      status.textContent = renderedEquipment.length
        ? `${elevationWallLabel(wall)} elevation shows ${renderedEquipment.length} equipment item${renderedEquipment.length === 1 ? '' : 's'}.`
        : `No equipment is placed at the ${elevationWallLabel(wall).toLowerCase()} wall.`;
    }
  }
}

function elevationSvgStyles() {
  return [
    '.equipment-elevation-bg{fill:#f8fbff;}',
    '.equipment-elevation-grid{stroke:#d6dee8;stroke-width:1;}',
    '.equipment-elevation-ground{stroke:#374151;stroke-width:2;}',
    '.equipment-elevation-axis-label{fill:#4b5563;font:12px Arial,sans-serif;}',
    '.equipment-elevation-title{fill:#111827;font:700 14px Arial,sans-serif;}',
    '.equipment-elevation-block{fill:#267acf;stroke:#0e437a;stroke-width:1.5;}',
    '.equipment-elevation-block-danger{fill:#da3232;stroke:#7d0f0f;}',
    '.equipment-elevation-label,.equipment-elevation-meta{fill:#fff;font:700 12px Arial,sans-serif;}',
    '.equipment-elevation-meta{font-weight:500;}',
    '.equipment-elevation-door{fill:rgba(14,163,110,.12);stroke:#0ea36e;stroke-width:2;stroke-dasharray:5 3;}',
    '.equipment-elevation-door-egress{fill:rgba(14,163,110,.22);}',
    '.equipment-elevation-door-label{fill:#0b7d55;font:700 11px Arial,sans-serif;}'
  ].join('');
}

function downloadElevationSvg() {
  if (!elevationCanvas) return;
  renderElevation();
  const clone = elevationCanvas.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = elevationSvgStyles();
  clone.insertBefore(style, clone.firstChild);
  const svg = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const arrangementName = getActiveArrangement()?.name || 'arrangement';
  link.href = url;
  link.download = `${arrangementName}-${selectedElevationWall()}-elevation.svg`.replace(/[^\w.-]+/g, '-').toLowerCase();
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

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
  const firstDetail = state.violationDetails.size
    ? Array.from(state.violationDetails.values())[0]?.[0]
    : '';
  summaryEl.textContent = violations
    ? `${violations} of ${total} equipment item${total === 1 ? '' : 's'} has NEC working-space/access violations. ${firstDetail || ''}`.trim()
    : total
      ? `No NEC workspace violations detected for ${total} equipment item${total === 1 ? '' : 's'}.`
      : 'Add equipment to start layout checks.';
}

function render() {
  evaluateViolations();
  renderArrangementControls();
  renderSavedViewControls();
  renderInteriorWallList();
  renderDoorwayList();

  canvas.innerHTML = '';
  const widthPx = state.room.width * state.scale;
  const heightPx = state.room.depth * state.scale;
  const padding = canvasPaddingPx();
  state.canvasPadding = padding;
  canvas.setAttribute('viewBox', `0 0 ${Math.max(widthPx + padding * 2, 400)} ${Math.max(heightPx + padding * 2, 300)}`);

  const padGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  padGroup.setAttribute('transform', `translate(${padding},${padding})`);
  canvas.appendChild(padGroup);

  const previousCanvas = canvas;
  canvas = padGroup;
  renderRoom();
  renderEquipment();
  renderLineups();
  renderDimensions();
  renderGapIndicators();
  canvas = previousCanvas;

  renderElevation();
  const zoomLabel = document.getElementById('zoom-label');
  if (zoomLabel) zoomLabel.textContent = `Scale: ${state.scale} px/ft`;
  updateSummary();
  renderClearanceDetails();
  scheduleArrangementPersist();
}

// ── State mutations ──────────────────────────────────────────────────────────

function syncEquipmentListForItems(items) {
  items
    .filter(eq => eq.listTag)
    .forEach(eq => syncEquipmentPosition(eq));
}

function clampEquipmentPosition(eq) {
  eq.x = clamp(eq.x, 0, Math.max(0, state.room.width - eq.width));
  eq.y = clamp(eq.y, 0, Math.max(0, state.room.depth - eq.depth));
}

function mutateEquipmentItems(items, action) {
  if (!items.length) return false;
  pushHistory();
  items.forEach(action);
  items.forEach(clampEquipmentPosition);
  syncEquipmentListForItems(items);
  render();
  return true;
}

function mutateSelectedEquipment(action) {
  return mutateEquipmentItems(selectedEquipment(), action);
}

function snapSelectedToGrid() {
  mutateSelectedEquipment(eq => {
    eq.x = snapToStep(eq.x, 0.5);
    eq.y = snapToStep(eq.y, 0.5);
  });
}

function alignSelectedEdge(edge) {
  const items = selectedEquipment();
  if (!items.length) return;
  const minX = Math.min(...items.map(eq => eq.x));
  const minY = Math.min(...items.map(eq => eq.y));
  const maxX = Math.max(...items.map(eq => eq.x + eq.width));
  const maxY = Math.max(...items.map(eq => eq.y + eq.depth));
  mutateEquipmentItems(items, eq => {
    if (edge === 'west') eq.x = minX;
    if (edge === 'east') eq.x = maxX - eq.width;
    if (edge === 'north') eq.y = minY;
    if (edge === 'south') eq.y = maxY - eq.depth;
  });
}

function equalSpaceItems(items) {
  if (items.length < 2) return false;
  const minX = Math.min(...items.map(eq => eq.x));
  const maxX = Math.max(...items.map(eq => eq.x + eq.width));
  const minY = Math.min(...items.map(eq => eq.y));
  const maxY = Math.max(...items.map(eq => eq.y + eq.depth));
  const axis = (maxY - minY) > (maxX - minX) ? 'y' : 'x';
  const sizeKey = axis === 'x' ? 'width' : 'depth';
  const crossKey = axis === 'x' ? 'y' : 'x';
  const spanStart = axis === 'x' ? minX : minY;
  const spanEnd = axis === 'x' ? maxX : maxY;
  const crossStart = axis === 'x' ? minY : minX;
  const sorted = [...items].sort((a, b) => a[axis] - b[axis]);
  const totalSize = sorted.reduce((sum, eq) => sum + eq[sizeKey], 0);
  const availableGap = Math.max(0.5, (spanEnd - spanStart - totalSize) / Math.max(1, sorted.length - 1));
  let cursor = spanStart;

  return mutateEquipmentItems(sorted, eq => {
    eq[axis] = cursor;
    eq[crossKey] = crossStart;
    cursor += eq[sizeKey] + availableGap;
  });
}

function equalSpaceSelected() {
  equalSpaceItems(selectedEquipment());
}

function lineupInputName() {
  const input = document.getElementById('lineup-name');
  return String(input?.value || '').trim();
}

function setLineupInputName(value) {
  const input = document.getElementById('lineup-name');
  if (input) input.value = value;
}

function resolveLineupName() {
  const typed = lineupInputName();
  if (typed) return typed;
  const selected = selectedEquipment();
  const existing = selected.find(eq => String(eq.lineup || '').trim())?.lineup ||
    Array.from(lineupGroups().keys())[0] ||
    `${getActiveArrangement()?.name || 'Arrangement'} Lineup`;
  const name = String(existing).trim();
  setLineupInputName(name);
  return name;
}

function assignSelectedLineup() {
  const items = selectedEquipment();
  if (!items.length) {
    alert('Select equipment before assigning a lineup.');
    return;
  }
  const name = resolveLineupName();
  mutateEquipmentItems(items, eq => { eq.lineup = name; });
}

function selectLineup() {
  const name = resolveLineupName().toLowerCase();
  const matches = state.equipment.filter(eq => String(eq.lineup || '').trim().toLowerCase() === name);
  if (!matches.length) {
    alert('No equipment is assigned to that lineup.');
    return;
  }
  state.selectedIds = new Set(matches.map(eq => eq.id));
  render();
}

function spaceLineup() {
  const name = resolveLineupName().toLowerCase();
  const matches = state.equipment.filter(eq => String(eq.lineup || '').trim().toLowerCase() === name);
  const targets = matches.length ? matches : selectedEquipment();
  if (!targets.length) {
    alert('Select equipment or enter a lineup name before spacing a lineup.');
    return;
  }
  state.selectedIds = new Set(targets.map(eq => eq.id));
  if (!equalSpaceItems(targets)) render();
}

function saveNamedView() {
  const views = activeSavedViews();
  const select = document.getElementById('saved-view-select');
  const nameInput = document.getElementById('saved-view-name');
  const name = String(nameInput?.value || '').trim() || `View ${views.length + 1}`;
  const existingByName = views.find(view => view.name.toLowerCase() === name.toLowerCase());
  const existingBySelect = views.find(view => view.id === select?.value);
  const target = existingByName || existingBySelect;
  const snapshot = {
    id: target?.id || uniqueId('view'),
    name,
    scale: state.scale,
    elevationWall: selectedElevationWall(),
    showDimensions: state.showDimensions,
    selectedIds: [...state.selectedIds]
  };

  if (target) {
    Object.assign(target, snapshot);
  } else {
    views.push(snapshot);
  }
  persistArrangements();
  renderSavedViewControls();
  if (select) select.value = snapshot.id;
}

function applyNamedView() {
  const viewId = document.getElementById('saved-view-select')?.value;
  const view = activeSavedViews().find(item => item.id === viewId);
  if (!view) return;
  state.scale = clamp(parseNumber(view.scale, DEFAULT_SCALE), 8, 45);
  state.showDimensions = view.showDimensions !== false;
  const elevationWallSelect = document.getElementById('elevation-wall');
  if (elevationWallSelect) elevationWallSelect.value = view.elevationWall || 'south';
  const validIds = new Set(state.equipment.map(eq => eq.id));
  state.selectedIds = new Set((view.selectedIds || []).filter(id => validIds.has(id)));
  render();
}

function deleteNamedView() {
  const viewId = document.getElementById('saved-view-select')?.value;
  const views = activeSavedViews();
  const index = views.findIndex(view => view.id === viewId);
  if (index === -1) return;
  views.splice(index, 1);
  persistArrangements();
  renderSavedViewControls();
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function viewBoxNumbers(svg) {
  const box = String(svg.getAttribute('viewBox') || '0 0 1000 700')
    .split(/\s+/)
    .map(value => Number.parseFloat(value));
  return {
    x: Number.isFinite(box[0]) ? box[0] : 0,
    y: Number.isFinite(box[1]) ? box[1] : 0,
    width: Number.isFinite(box[2]) ? box[2] : 1000,
    height: Number.isFinite(box[3]) ? box[3] : 700
  };
}

function serializedSvgContent(svg) {
  const serializer = new XMLSerializer();
  return Array.from(svg.cloneNode(true).childNodes)
    .map(node => serializer.serializeToString(node))
    .join('');
}

function planSvgStyles() {
  return [
    '.equipment-room-fill,.equipment-room-outer{fill:#f8fbff;stroke:none;}',
    '.equipment-room-wall{stroke:#424e62;stroke-width:2;fill:none;stroke-linecap:square;}',
    '.equipment-wall-label,.equipment-room-text{fill:#1f2b3a;font-family:Arial,sans-serif;}',
    '.equipment-doorway-panel{stroke:#0ea36e;stroke-width:3;fill:none;stroke-linecap:round;}',
    '.equipment-doorway-swing{stroke:rgba(14,163,110,.72);stroke-width:2;fill:none;stroke-dasharray:3 2;stroke-linecap:round;}',
    '.equipment-doorway-label{fill:#0ea36e;font:700 11px Arial,sans-serif;letter-spacing:.04em;}',
    '.equipment-interior-wall{fill:rgba(56,63,74,.85);}',
    '.equipment-clearance{fill:rgba(255,213,110,.8);stroke:rgba(200,142,32,.95);stroke-dasharray:4 4;}',
    '.equipment-clearance-danger{fill:rgba(245,91,91,.35);stroke:rgba(213,32,32,.95);}',
    '.equipment-block{fill:rgba(38,122,207,.82);stroke:rgba(14,67,122,.95);stroke-width:1.5;}',
    '.equipment-block.selected{stroke:#fde047;stroke-width:2.5;}',
    '.equipment-block-danger{fill:rgba(218,50,50,.85);stroke:rgba(125,15,15,.95);}',
    '.equipment-block-label,.equipment-block-meta{fill:#fff;font-family:Arial,sans-serif;pointer-events:none;}',
    '.equipment-lineup-outline{fill:none;stroke:#2563eb;stroke-width:2;stroke-dasharray:8 5;pointer-events:none;}',
    '.equipment-lineup-label{fill:#1d4ed8;font:700 10px Arial,sans-serif;pointer-events:none;}',
    '.equipment-dimension-line,.equipment-dimension-tick{stroke:#111827;stroke-width:1.2;fill:none;pointer-events:none;}',
    '.equipment-dimension-label{fill:#111827;font:700 11px Arial,sans-serif;pointer-events:none;}',
    '.equipment-gap-line{stroke:#f97316;stroke-width:1.5;stroke-dasharray:4 3;fill:none;}',
    '.equipment-gap-label{font:700 10px Arial,sans-serif;fill:#f97316;}',
    '.equipment-gap-label-bg{fill:#fff;stroke:#f97316;stroke-width:1;}'
  ].join('');
}

function layoutReportSvgStyles() {
  return [
    'svg{background:#fff;}',
    '.sheet-title{fill:#111827;font:700 24px Arial,sans-serif;}',
    '.sheet-subtitle{fill:#4b5563;font:14px Arial,sans-serif;}',
    '.sheet-panel-title{fill:#111827;font:700 16px Arial,sans-serif;}',
    planSvgStyles(),
    elevationSvgStyles()
  ].join('');
}

function downloadBlob(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportLayoutReportSvg() {
  if (!canvas || !elevationCanvas) return;
  render();
  const planBox = viewBoxNumbers(canvas);
  const elevationBox = viewBoxNumbers(elevationCanvas);
  const pageWidth = 1200;
  const margin = 42;
  const titleHeight = 72;
  const panelGap = 44;
  const planScale = Math.min(1.35, (pageWidth - margin * 2) / planBox.width);
  const elevationScale = Math.min(1.35, (pageWidth - margin * 2) / elevationBox.width);
  const planHeight = planBox.height * planScale;
  const elevationHeight = elevationBox.height * elevationScale;
  const elevationY = titleHeight + planHeight + panelGap;
  const pageHeight = elevationY + elevationHeight + margin;
  const arrangementName = getActiveArrangement()?.name || 'Arrangement';
  const subtitle = `${state.equipment.length} equipment item${state.equipment.length === 1 ? '' : 's'} - ${state.violations.size} clearance issue${state.violations.size === 1 ? '' : 's'}`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${Math.ceil(pageHeight)}" viewBox="0 0 ${pageWidth} ${Math.ceil(pageHeight)}">`,
    `<style>${layoutReportSvgStyles()}</style>`,
    '<rect x="0" y="0" width="100%" height="100%" fill="#fff"/>',
    `<text x="${margin}" y="34" class="sheet-title">${escapeXml(arrangementName)}</text>`,
    `<text x="${margin}" y="56" class="sheet-subtitle">${escapeXml(subtitle)}</text>`,
    `<text x="${margin}" y="${titleHeight - 12}" class="sheet-panel-title">Plan View</text>`,
    `<g transform="translate(${margin},${titleHeight}) scale(${planScale})">${serializedSvgContent(canvas)}</g>`,
    `<text x="${margin}" y="${elevationY - 12}" class="sheet-panel-title">${escapeXml(elevationWallLabel(selectedElevationWall()))} Elevation</text>`,
    `<g transform="translate(${margin},${elevationY}) scale(${elevationScale})">${serializedSvgContent(elevationCanvas)}</g>`,
    '</svg>'
  ].join('');
  const filename = `${arrangementName}-layout-report.svg`.replace(/[^\w.-]+/g, '-').toLowerCase();
  downloadBlob(svg, filename, 'image/svg+xml');
}

function switchArrangement(id) {
  if (!id || id === state.activeArrangementId) return;
  saveActiveArrangementToMemory();
  const next = state.arrangements.find(arrangement => arrangement.id === id);
  if (!next) return;
  applyArrangementToState(next);
  persistArrangements();
  render();
}

function cycleArrangement(direction) {
  if (state.arrangements.length <= 1) return;
  const index = activeArrangementIndex();
  const nextIndex = (index + direction + state.arrangements.length) % state.arrangements.length;
  switchArrangement(state.arrangements[nextIndex].id);
}

function addArrangement() {
  saveActiveArrangementToMemory();
  const arrangement = createArrangement(`Arrangement ${state.arrangements.length + 1}`);
  state.arrangements.push(arrangement);
  applyArrangementToState(arrangement);
  persistArrangements();
  render();
}

function duplicateArrangement() {
  saveActiveArrangementToMemory();
  const active = getActiveArrangement();
  if (!active) return;
  const arrangement = createArrangement(`${active.name} Copy`, active);
  state.arrangements.push(arrangement);
  applyArrangementToState(arrangement);
  persistArrangements();
  render();
}

function deleteArrangement() {
  if (state.arrangements.length <= 1) return;
  const index = activeArrangementIndex();
  if (index === -1) return;
  state.arrangements.splice(index, 1);
  const next = state.arrangements[Math.min(index, state.arrangements.length - 1)];
  applyArrangementToState(next);
  persistArrangements();
  render();
}

function updateActiveArrangementOption() {
  const active = getActiveArrangement();
  const select = document.getElementById('arrangement-select');
  if (!active || !select) return;
  const index = activeArrangementIndex();
  Array.from(select.options).forEach(option => {
    if (option.value === active.id) {
      option.textContent = `${index + 1}. ${active.name}`;
    }
  });
}

function renameActiveArrangementLive(name) {
  const active = getActiveArrangement();
  if (!active) return;
  active.name = name || `Arrangement ${activeArrangementIndex() + 1}`;
  updateActiveArrangementOption();
  scheduleArrangementPersist();
}

function renameActiveArrangement(name) {
  const active = getActiveArrangement();
  if (!active) return;
  const cleaned = name.trim() || `Arrangement ${activeArrangementIndex() + 1}`;
  active.name = cleaned;
  persistArrangements();
  renderArrangementControls();
}

function setAutoLayoutStatus(message) {
  const status = document.getElementById('auto-layout-status');
  if (status) status.textContent = message;
}

function resolveEquipmentVoltage(value) {
  const raw = String(value || '').trim();
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  const match = VOLTAGE_OPTIONS.find(option => (
    option.toUpperCase() === raw.toUpperCase() ||
    option.replace(/\s+/g, '').toUpperCase() === compact
  ));
  return match || document.getElementById('equipment-voltage')?.value || VOLTAGE_OPTIONS[0];
}

function equipmentFromCatalogItem(item, index) {
  const widthLimit = Math.max(1, state.room.width);
  const depthLimit = Math.max(1, state.room.depth);
  const width = clamp(parseNumber(item.width, 4), 1, Math.min(30, widthLimit));
  const depth = clamp(parseNumber(item.depth, 2), 1, Math.min(30, depthLimit));
  const voltage = resolveEquipmentVoltage(item.voltage || item.voltageRating || item.nominalVoltage || item.volts);
  const name = item.tag || item.name || item.description || `Equipment-${index + 1}`;
  const equipment = {
    id: uniqueId('eq'),
    name,
    width,
    depth,
    height: equipmentHeightFromSource(item),
    baseElevation: equipmentBaseElevationFromSource(item),
    voltage,
    lineup: String(item.lineup || '').trim(),
    facing: 'south',
    x: 0,
    y: 0
  };
  if (item.tag) equipment.listTag = item.tag;
  return equipment;
}

function equipmentAssignmentName(item) {
  return String(item.arrangement || item.arrangementName || item.layout || '').trim();
}

function assignedEquipmentGroups() {
  const groups = new Map();
  dataStore.getEquipment().forEach((item, index) => {
    const assignment = equipmentAssignmentName(item);
    if (!assignment) return;
    if (!groups.has(assignment)) groups.set(assignment, []);
    groups.get(assignment).push(equipmentFromCatalogItem(item, index));
  });
  return groups;
}

function activeArrangementAssignmentName() {
  const active = getActiveArrangement();
  return String(active?.listAssignment || active?.name || '').trim();
}

function equipmentAssignedToActiveArrangement() {
  const activeName = activeArrangementAssignmentName().toLowerCase();
  if (!activeName) return [];
  return dataStore.getEquipment()
    .filter(item => equipmentAssignmentName(item).toLowerCase() === activeName)
    .map((item, index) => equipmentFromCatalogItem(item, index));
}

function normalizeAutoLayoutEquipment(eq, index) {
  const widthLimit = Math.max(1, state.room.width);
  const depthLimit = Math.max(1, state.room.depth);
  return {
    ...eq,
    id: eq.id || uniqueId('eq'),
    name: eq.name || eq.tag || eq.description || `Equipment-${index + 1}`,
    width: clamp(parseNumber(eq.width, 4), 1, Math.min(30, widthLimit)),
    depth: clamp(parseNumber(eq.depth, 2), 1, Math.min(30, depthLimit)),
    height: equipmentHeightFromSource(eq),
    baseElevation: equipmentBaseElevationFromSource(eq),
    voltage: resolveEquipmentVoltage(eq.voltage || eq.voltageRating || eq.nominalVoltage || eq.volts),
    lineup: String(eq.lineup || '').trim(),
    facing: eq.facing || 'south',
    x: 0,
    y: 0
  };
}

function autoLayoutCandidateConflicts(eq, x, y, facing, placed) {
  const candidate = { ...eq, x, y, facing };
  const rect = equipmentRect(candidate);
  const workspace = workspaceRect(candidate);
  const nearWorkspace = {
    x: workspace.x - 1,
    y: workspace.y - 1,
    w: workspace.w + 2,
    h: workspace.h + 2
  };
  if (!insideRoom(rect) || !insideRoom(workspace)) return true;

  const hitsInteriorWall = state.room.interiorWalls.some(wall => {
    const wallRect = interiorWallRect(wall);
    return intersects(rect, wallRect) || intersects(workspace, wallRect);
  });
  if (hitsInteriorWall) return true;

  return placed.some(other => {
    const otherRect = equipmentRect(other);
    const otherWorkspace = workspaceRect(other);
    const otherNearWorkspace = {
      x: otherWorkspace.x - 1,
      y: otherWorkspace.y - 1,
      w: otherWorkspace.w + 2,
      h: otherWorkspace.h + 2
    };
    return intersects(rect, otherRect) ||
      intersects(workspace, otherRect) ||
      intersects(rect, otherWorkspace) ||
      (intersects(otherRect, nearWorkspace) && !intersects(otherRect, workspace)) ||
      (intersects(rect, otherNearWorkspace) && !intersects(rect, otherWorkspace));
  });
}

function findAutoLayoutPosition(eq, placed) {
  const step = 0.5;
  const maxX = Math.max(0, state.room.width - eq.width);
  const maxY = Math.max(0, state.room.depth - eq.depth);
  const facingOrder = ['south', 'east', 'north', 'west'];

  for (let y = 0; y <= maxY + 0.001; y += step) {
    for (let x = 0; x <= maxX + 0.001; x += step) {
      const snappedX = Number(x.toFixed(2));
      const snappedY = Number(y.toFixed(2));
      for (const facing of facingOrder) {
        if (!autoLayoutCandidateConflicts(eq, snappedX, snappedY, facing, placed)) {
          return { x: snappedX, y: snappedY, facing };
        }
      }
    }
  }

  return null;
}

function fallbackAutoLayoutPosition(eq, index) {
  const gap = 1;
  const columns = Math.max(1, Math.floor(Math.max(1, state.room.width - gap) / Math.max(1, eq.width + gap)));
  const x = gap + (index % columns) * (eq.width + gap);
  const y = gap + Math.floor(index / columns) * (eq.depth + gap);
  return {
    x: clamp(x, 0, Math.max(0, state.room.width - eq.width)),
    y: clamp(y, 0, Math.max(0, state.room.depth - eq.depth)),
    facing: 'south'
  };
}

function layoutEquipmentItems(items) {
  const placed = [];
  let fallbackCount = 0;
  items.forEach((item, index) => {
    const eq = normalizeAutoLayoutEquipment(item, index);
    const position = findAutoLayoutPosition(eq, placed);
    if (position) {
      placed.push({ ...eq, ...position });
    } else {
      fallbackCount += 1;
      placed.push({ ...eq, ...fallbackAutoLayoutPosition(eq, index) });
    }
  });
  return { equipment: placed, fallbackCount };
}

function layoutEquipmentItemsForRoom(items, room) {
  const previousRoom = state.room;
  state.room = cloneRoom(room);
  const result = layoutEquipmentItems(items);
  state.room = previousRoom;
  return result;
}

function findListArrangement(name) {
  const key = name.toLowerCase();
  return state.arrangements.find(arrangement => String(arrangement.listAssignment || '').toLowerCase() === key) ||
    state.arrangements.find(arrangement => (
      String(arrangement.name || '').toLowerCase() === key &&
      (arrangement.source === 'equipment-list' || !arrangement.equipment.length)
    ));
}

function buildArrangementsFromEquipmentList() {
  const groups = assignedEquipmentGroups();
  if (!groups.size) {
    alert('Assign equipment to an Arrangement on the Equipment List page before building arrangements from the list.');
    return;
  }

  saveActiveArrangementToMemory();
  const activeRoom = cloneRoom(state.room);
  const activeScale = state.scale;
  let created = 0;
  let refreshed = 0;
  let fallbackCount = 0;
  let firstArrangement = null;

  groups.forEach((items, name) => {
    let arrangement = findListArrangement(name);
    if (!arrangement) {
      arrangement = createArrangement(name, { room: activeRoom, equipment: [], scale: activeScale, source: 'equipment-list', listAssignment: name });
      state.arrangements.push(arrangement);
      created += 1;
    } else {
      refreshed += 1;
    }

    arrangement.name = name;
    arrangement.source = 'equipment-list';
    arrangement.listAssignment = name;
    const layout = layoutEquipmentItemsForRoom(items, arrangement.room);
    arrangement.equipment = layout.equipment;
    fallbackCount += layout.fallbackCount;
    if (!firstArrangement) firstArrangement = arrangement;
  });

  if (firstArrangement) {
    applyArrangementToState(firstArrangement);
  }
  persistArrangements();
  render();

  const fallbackText = fallbackCount ? ` ${fallbackCount} item${fallbackCount === 1 ? '' : 's'} used best available placement; check red clearance highlights.` : '';
  setAutoLayoutStatus(`Built ${groups.size} list arrangement${groups.size === 1 ? '' : 's'} (${created} new, ${refreshed} refreshed).${fallbackText}`);
}

function autoLayoutEquipment() {
  const seededFromList = state.equipment.length === 0;
  const assignedToActive = seededFromList ? equipmentAssignedToActiveArrangement() : [];
  const sourceEquipment = seededFromList
    ? (assignedToActive.length ? assignedToActive : dataStore.getEquipment().map((item, index) => equipmentFromCatalogItem(item, index)))
    : state.equipment.map(eq => ({ ...eq }));

  if (!sourceEquipment.length) {
    alert('Add equipment to the Equipment List or place custom equipment on the canvas before running Auto Layout.');
    return;
  }

  const { equipment, fallbackCount } = layoutEquipmentItems(sourceEquipment);
  pushHistory();
  state.equipment = equipment;
  state.selectedIds.clear();
  state.equipment
    .filter(eq => eq.listTag)
    .forEach(eq => syncEquipmentPosition(eq));
  render();

  const verb = seededFromList ? (assignedToActive.length ? 'Loaded assigned equipment and laid out' : 'Loaded and laid out') : 'Laid out';
  const warning = fallbackCount ? ` ${fallbackCount} item${fallbackCount === 1 ? '' : 's'} used best available placement; check red clearance highlights.` : '';
  setAutoLayoutStatus(`${verb} ${state.equipment.length} equipment item${state.equipment.length === 1 ? '' : 's'}.${warning}`);
}

function addEquipment() {
  const source = document.getElementById('equipment-source').value;
  const presetSelect = document.getElementById('equipment-preset');
  const customName = document.getElementById('custom-name').value.trim();
  const width = clamp(parseNumber(document.getElementById('equipment-width').value, 4), 1, 30);
  const depth = clamp(parseNumber(document.getElementById('equipment-depth').value, 2), 1, 30);
  const height = clamp(parseNumber(document.getElementById('equipment-height').value, DEFAULT_EQUIPMENT_HEIGHT), 1, 40);
  const baseElevation = clamp(parseNumber(document.getElementById('equipment-base-elevation').value, 0), 0, 60);
  const voltage = document.getElementById('equipment-voltage').value;
  const facing = document.getElementById('equipment-facing').value;

  let name = 'Equipment';
  let listTag = null;
  let lineup = '';
  if (source === 'equipment-list') {
    const index = Number.parseInt(presetSelect.value, 10);
    const item = dataStore.getEquipment()[index];
    if (!item) return;
    name = item.tag || item.description || `Equipment-${state.equipment.length + 1}`;
    listTag = item.tag || null;
    lineup = String(item.lineup || '').trim();
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

  const newEq = { id, name, width, depth, height, baseElevation, voltage, lineup, facing, x: startX, y: startY };
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
  const swing = document.getElementById('doorway-swing').value === 'out' ? 'out' : 'in';
  const isEgress = document.getElementById('doorway-egress').checked;

  pushHistory();
  const id = `dw-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  state.room.doorways.push({ id, wall, position, width, swing, isEgress });
  render();
}

function syncEquipmentPosition(eq) {
  const list = dataStore.getEquipment();
  const idx = list.findIndex(item => item.tag === eq.listTag);
  if (idx === -1) return;
  dataStore.updateEquipment(idx, {
    width: String(Math.round(eq.width * 100) / 100),
    depth: String(Math.round(eq.depth * 100) / 100),
    height: String(Math.round(equipmentHeightFromSource(eq) * 100) / 100),
    baseElevation: String(Math.round(equipmentBaseElevationFromSource(eq) * 100) / 100),
    lineup: String(eq.lineup || ''),
    facing: eq.facing || '',
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
  const xFt = (svgPt.x - state.canvasPadding) / state.scale;
  const yFt = (svgPt.y - state.canvasPadding) / state.scale;
  return { xFt, yFt };
}

// ── Equipment detail modal ───────────────────────────────────────────────────

function showEquipmentDetailModal(eq) {
  const listItem = eq.listTag
    ? dataStore.getEquipment().find(item => item.tag === eq.listTag) || null
    : null;

  openModal({
    title: eq.name,
    primaryText: 'Close',
    secondaryText: null,
    defaultWidth: 'medium',
    render(body) {
      body.style.padding = '0';

      const card = document.createElement('div');
      card.className = 'equipment-detail-card';

      function section(label, value) {
        if (!value && value !== 0) return;
        const row = document.createElement('div');
        row.className = 'equipment-detail-row';
        const lbl = document.createElement('span');
        lbl.className = 'equipment-detail-label';
        lbl.textContent = label;
        const val = document.createElement('span');
        val.className = 'equipment-detail-value';
        val.textContent = String(value);
        row.appendChild(lbl);
        row.appendChild(val);
        card.appendChild(row);
      }

      // Canvas placement data
      section('Tag', eq.name);
      if (listItem) {
        section('Description', listItem.description);
        section('Category', listItem.category);
        section('Sub-Category', listItem.subCategory);
      }
      section('Voltage', eq.voltage);
      if (listItem) {
        section('Phases', listItem.phases);
        section('Manufacturer', listItem.manufacturer);
        section('Model', listItem.model);
      }

      const divider = document.createElement('hr');
      divider.className = 'equipment-detail-divider';
      card.appendChild(divider);

      section('Width', `${eq.width.toFixed(1)} ft`);
      section('Depth', `${eq.depth.toFixed(1)} ft`);
      section('Height', `${equipmentHeightFromSource(eq).toFixed(1)} ft`);
      section('Base Elev.', `${equipmentBaseElevationFromSource(eq).toFixed(1)} ft`);
      section('Lineup', eq.lineup);
      section('Facing', eq.facing.charAt(0).toUpperCase() + eq.facing.slice(1));
      section('Position', `(${eq.x.toFixed(2)}, ${eq.y.toFixed(2)}) ft`);

      const hasViolation = state.violations.has(eq.id);
      const statusRow = document.createElement('div');
      statusRow.className = 'equipment-detail-row';
      const statusLbl = document.createElement('span');
      statusLbl.className = 'equipment-detail-label';
      statusLbl.textContent = 'NEC Status';
      const statusVal = document.createElement('span');
      statusVal.className = `equipment-detail-value equipment-detail-status${hasViolation ? ' equipment-detail-status--violation' : ' equipment-detail-status--ok'}`;
      statusVal.textContent = hasViolation ? 'Violation' : 'Compliant';
      statusRow.appendChild(statusLbl);
      statusRow.appendChild(statusVal);
      card.appendChild(statusRow);
      if (hasViolation) {
        section('Clearance Details', (state.violationDetails.get(eq.id) || []).join(' '));
      }

      if (listItem && listItem.notes) {
        const notesDivider = document.createElement('hr');
        notesDivider.className = 'equipment-detail-divider';
        card.appendChild(notesDivider);
        section('Notes', listItem.notes);
      }

      body.appendChild(card);
    }
  });
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

  canvas.addEventListener('dblclick', event => {
    const { xFt, yFt } = toFeetCoordinates(event);
    const picked = pickEquipmentAtPoint(xFt, yFt);
    if (picked) {
      showEquipmentDetailModal(picked);
    }
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
      if (syncElevationWallToSelectedEquipment()) {
        state.drag = null;
        render();
        return;
      }
    }
    state.drag = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
}

// ── UI bindings ───────────────────────────────────────────────────────────────

function bindUI() {
  document.getElementById('arrangement-select').addEventListener('change', event => switchArrangement(event.target.value));
  document.getElementById('prev-arrangement').addEventListener('click', () => cycleArrangement(-1));
  document.getElementById('next-arrangement').addEventListener('click', () => cycleArrangement(1));
  document.getElementById('add-arrangement').addEventListener('click', addArrangement);
  document.getElementById('duplicate-arrangement').addEventListener('click', duplicateArrangement);
  document.getElementById('delete-arrangement').addEventListener('click', deleteArrangement);
  document.getElementById('arrangement-name').addEventListener('input', event => renameActiveArrangementLive(event.target.value));
  document.getElementById('arrangement-name').addEventListener('change', event => renameActiveArrangement(event.target.value));

  document.getElementById('apply-room').addEventListener('click', applyRoomChanges);
  document.getElementById('add-equipment').addEventListener('click', addEquipment);
  document.getElementById('auto-layout-equipment').addEventListener('click', autoLayoutEquipment);
  document.getElementById('build-arrangements-from-list').addEventListener('click', buildArrangementsFromEquipmentList);
  document.getElementById('show-dimensions').addEventListener('change', event => {
    state.showDimensions = event.target.checked;
    render();
  });
  document.getElementById('snap-selected').addEventListener('click', snapSelectedToGrid);
  document.getElementById('align-selected-west').addEventListener('click', () => alignSelectedEdge('west'));
  document.getElementById('align-selected-south').addEventListener('click', () => alignSelectedEdge('south'));
  document.getElementById('equal-space-selected').addEventListener('click', equalSpaceSelected);
  document.getElementById('assign-lineup').addEventListener('click', assignSelectedLineup);
  document.getElementById('select-lineup').addEventListener('click', selectLineup);
  document.getElementById('space-lineup').addEventListener('click', spaceLineup);
  document.getElementById('save-view').addEventListener('click', saveNamedView);
  document.getElementById('apply-view').addEventListener('click', applyNamedView);
  document.getElementById('delete-view').addEventListener('click', deleteNamedView);
  document.getElementById('export-layout-report').addEventListener('click', exportLayoutReportSvg);
  document.getElementById('add-interior-wall').addEventListener('click', addInteriorWall);
  document.getElementById('add-doorway').addEventListener('click', addDoorway);
  document.getElementById('elevation-wall').addEventListener('change', renderElevation);
  document.getElementById('download-elevation-svg').addEventListener('click', downloadElevationSvg);

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
    document.getElementById('equipment-height').value = equipmentHeightFromSource(item);
    document.getElementById('equipment-base-elevation').value = equipmentBaseElevationFromSource(item);
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
  elevationCanvas = document.getElementById('equipment-elevation-canvas');
  summaryEl = document.getElementById('arrangement-summary');
  clearanceDetailsEl = document.getElementById('clearance-detail-list');
  if (!canvas) return;

  ['wall-north', 'wall-south', 'wall-east', 'wall-west', 'interior-type'].forEach(id => populateSelect(id, WALL_TYPES));
  populateSelect('equipment-voltage', VOLTAGE_OPTIONS);
  populateEquipmentPreset();
  loadArrangements();
  compactToolbarControls();
  createContextMenu();
  bindUI();
  bindCanvasInteractions();
  window.addEventListener('beforeunload', persistArrangements);
  render();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initialize);
}

import { getItem as getStoredItem, setItem as setStoredItem } from './dataStore.mjs';

const STORAGE_KEY = 'customComponents';
const STORAGE_SCENARIO = '__ctr_custom_components__';
const MAX_PROPERTIES = 20;

const form = document.getElementById('component-form');
const formIndexInput = document.getElementById('component-index');
const labelInput = document.getElementById('component-label');
const subtypeInput = document.getElementById('component-subtype');
const typeInput = document.getElementById('component-type');
const categorySelect = document.getElementById('component-category');
const widthInput = document.getElementById('component-width');
const heightInput = document.getElementById('component-height');
const portTopInput = document.getElementById('port-top');
const portRightInput = document.getElementById('port-right');
const portBottomInput = document.getElementById('port-bottom');
const portLeftInput = document.getElementById('port-left');
const propertyList = document.getElementById('property-list');
const addPropertyBtn = document.getElementById('add-property-btn');
const iconCanvas = document.getElementById('icon-canvas');
const iconToolButtons = document.getElementById('icon-tool-buttons');
const undoIconBtn = document.getElementById('undo-icon-btn');
const clearIconBtn = document.getElementById('clear-icon-btn');
const iconPreview = document.getElementById('icon-preview');
const resetFormBtn = document.getElementById('reset-form-btn');
const exportBtn = document.getElementById('export-components-btn');
const importBtn = document.getElementById('import-components-btn');
const importInput = document.getElementById('import-components-input');
const tableBody = document.querySelector('#custom-components-table tbody');
const emptyMessage = document.getElementById('no-components-message');
const submitBtn = form?.querySelector('button[type="submit"]');

const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');

let components = loadComponents();
let editingIndex = null;
let currentIconData = null;
let toastTimer = null;
let iconTool = 'select';
let drawingShape = null;
let drawingStart = null;
let shapeDragState = null;
let selectedIconShape = null;

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_CANVAS_SIZE = 120;
const BUILDER_FLAG_ATTR = 'data-ctr-icon';

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    navLinks.classList.toggle('open', !expanded);
  });
}

function showToast(message, kind = 'info') {
  const toast = document.getElementById('custom-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('toast-error', 'toast-success');
  if (kind === 'error') {
    toast.classList.add('toast-error');
  } else if (kind === 'success') {
    toast.classList.add('toast-success');
  }
  toast.classList.add('show');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('show', 'toast-error', 'toast-success');
    toastTimer = null;
  }, 3000);
}

function ensureIconCanvas() {
  if (!iconCanvas) return;
  if (!iconCanvas.dataset.initialized) {
    iconCanvas.setAttribute('viewBox', `0 0 ${ICON_CANVAS_SIZE} ${ICON_CANVAS_SIZE}`);
    iconCanvas.setAttribute('role', 'img');
    iconCanvas.setAttribute('aria-label', 'Custom component icon canvas');
    iconCanvas.dataset.initialized = '1';
  }
  if (!iconCanvas.querySelector('[data-icon-layer="defs"]')) {
    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.setAttribute('data-icon-layer', 'defs');
    const pattern = document.createElementNS(SVG_NS, 'pattern');
    pattern.id = 'icon-grid-pattern';
    pattern.setAttribute('width', '10');
    pattern.setAttribute('height', '10');
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M 10 0 L 0 0 0 10');
    path.setAttribute('stroke', '#e0e5ea');
    path.setAttribute('stroke-width', '0.4');
    pattern.appendChild(path);
    defs.appendChild(pattern);
    iconCanvas.appendChild(defs);
  }
  if (!iconCanvas.querySelector('[data-icon-grid]')) {
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', ICON_CANVAS_SIZE);
    bg.setAttribute('height', ICON_CANVAS_SIZE);
    bg.setAttribute('data-icon-grid', '1');
    bg.classList.add('icon-canvas-bg');
    bg.setAttribute('fill', '#f8f9fb');
    iconCanvas.appendChild(bg);
  }
}

function setActiveIconTool(tool) {
  iconTool = tool;
  if (!iconToolButtons) return;
  const buttons = iconToolButtons.querySelectorAll('button[data-tool]');
  buttons.forEach(btn => {
    const active = btn.dataset.tool === tool;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  if (iconCanvas) {
    iconCanvas.style.cursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair';
  }
}

function selectIconShape(shape) {
  if (selectedIconShape === shape) return;
  if (selectedIconShape) selectedIconShape.classList.remove('icon-shape-selected');
  selectedIconShape = shape || null;
  if (selectedIconShape) selectedIconShape.classList.add('icon-shape-selected');
}

function roundCoord(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getCanvasPoint(event) {
  if (!iconCanvas) return null;
  const rect = iconCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const x = ((event.clientX - rect.left) / rect.width) * ICON_CANVAS_SIZE;
  const y = ((event.clientY - rect.top) / rect.height) * ICON_CANVAS_SIZE;
  return {
    x: roundCoord(Math.min(Math.max(x, 0), ICON_CANVAS_SIZE)),
    y: roundCoord(Math.min(Math.max(y, 0), ICON_CANVAS_SIZE))
  };
}

function applyLineAttributes(shape, start, end) {
  shape.dataset.x1 = String(start.x);
  shape.dataset.y1 = String(start.y);
  shape.dataset.x2 = String(end.x);
  shape.dataset.y2 = String(end.y);
  shape.setAttribute('x1', start.x);
  shape.setAttribute('y1', start.y);
  shape.setAttribute('x2', end.x);
  shape.setAttribute('y2', end.y);
}

function applyRectAttributes(shape, start, current) {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const w = Math.abs(current.x - start.x);
  const h = Math.abs(current.y - start.y);
  shape.dataset.x = String(roundCoord(x));
  shape.dataset.y = String(roundCoord(y));
  shape.dataset.width = String(roundCoord(w));
  shape.dataset.height = String(roundCoord(h));
  shape.setAttribute('x', roundCoord(x));
  shape.setAttribute('y', roundCoord(y));
  shape.setAttribute('width', roundCoord(w));
  shape.setAttribute('height', roundCoord(h));
}

function applyCircleAttributes(shape, center, point) {
  const r = Math.hypot(point.x - center.x, point.y - center.y);
  shape.dataset.cx = String(center.x);
  shape.dataset.cy = String(center.y);
  shape.dataset.r = String(roundCoord(r));
  shape.setAttribute('cx', center.x);
  shape.setAttribute('cy', center.y);
  shape.setAttribute('r', roundCoord(r));
}

function buildArcGeometry(start, point, invert = false) {
  const midX = (start.x + point.x) / 2;
  const midY = (start.y + point.y) / 2;
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  const distance = Math.hypot(dx, dy) || 1;
  const normX = -dy / distance;
  const normY = dx / distance;
  const offset = distance / 2;
  const factor = invert ? -1 : 1;
  return {
    control: {
      x: roundCoord(midX + normX * offset * factor),
      y: roundCoord(midY + normY * offset * factor)
    },
    end: { x: roundCoord(point.x), y: roundCoord(point.y) }
  };
}

function applyArcAttributes(shape, start, geometry) {
  const { control, end } = geometry;
  shape.dataset.startX = String(start.x);
  shape.dataset.startY = String(start.y);
  shape.dataset.controlX = String(control.x);
  shape.dataset.controlY = String(control.y);
  shape.dataset.endX = String(end.x);
  shape.dataset.endY = String(end.y);
  shape.setAttribute('d', `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`);
}

function applyTextAttributes(shape, point) {
  shape.dataset.x = String(point.x);
  shape.dataset.y = String(point.y);
  shape.setAttribute('x', point.x);
  shape.setAttribute('y', point.y);
}

function createShapeElement(tool) {
  let el;
  if (tool === 'line') {
    el = document.createElementNS(SVG_NS, 'line');
    el.setAttribute('stroke-linecap', 'round');
  } else if (tool === 'rectangle') {
    el = document.createElementNS(SVG_NS, 'rect');
    el.setAttribute('fill', 'none');
  } else if (tool === 'circle') {
    el = document.createElementNS(SVG_NS, 'circle');
    el.setAttribute('fill', 'none');
  } else if (tool === 'arc') {
    el = document.createElementNS(SVG_NS, 'path');
    el.setAttribute('fill', 'none');
  }
  if (el) {
    el.dataset.iconShape = '1';
    el.dataset.shapeType = tool;
    el.classList.add('icon-shape');
    el.setAttribute('stroke', '#1f2933');
    el.setAttribute('stroke-width', tool === 'line' ? '4' : '3');
    el.setAttribute('stroke-linejoin', 'round');
  }
  return el;
}

function finishDrawingShape(valid = true) {
  if (!drawingShape) return;
  if (!valid) {
    drawingShape.remove();
  } else {
    selectIconShape(drawingShape);
    commitIconChanges();
  }
  drawingShape = null;
  drawingStart = null;
}

function clearIconCanvas({ resetData = true } = {}) {
  if (!iconCanvas) return;
  iconCanvas.querySelectorAll('[data-icon-shape]').forEach(el => el.remove());
  drawingShape = null;
  drawingStart = null;
  shapeDragState = null;
  selectIconShape(null);
  iconCanvas.setAttribute('viewBox', `0 0 ${ICON_CANVAS_SIZE} ${ICON_CANVAS_SIZE}`);
  if (resetData) {
    currentIconData = null;
    updateIconPreview(null);
  }
}

function serializeIconCanvas() {
  if (!iconCanvas) return null;
  const shapes = iconCanvas.querySelectorAll('[data-icon-shape]');
  if (!shapes.length) return null;
  const clone = iconCanvas.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('[data-icon-grid]').forEach(el => el.remove());
  clone.querySelectorAll('[data-icon-layer="defs"]').forEach(el => el.remove());
  clone.querySelectorAll('.icon-shape-selected').forEach(el => el.classList.remove('icon-shape-selected'));
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', String(ICON_CANVAS_SIZE));
  clone.setAttribute('height', String(ICON_CANVAS_SIZE));
  clone.setAttribute(BUILDER_FLAG_ATTR, '1');
  const serialized = new XMLSerializer().serializeToString(clone);
  const encoded = window.btoa(unescape(encodeURIComponent(serialized)));
  return `data:image/svg+xml;base64,${encoded}`;
}

function commitIconChanges() {
  const data = serializeIconCanvas();
  currentIconData = data;
  updateIconPreview(data);
}

function decodeSvgDataUrl(dataUrl) {
  const match = /^data:image\/svg\+xml(;base64)?,(.*)$/i.exec(dataUrl || '');
  if (!match) return null;
  try {
    if (match[1]) {
      const decoded = window.atob(match[2]);
      const escaped = Array.from(decoded).map(ch => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`).join('');
      return decodeURIComponent(escaped);
    }
    return decodeURIComponent(match[2]);
  } catch {
    return null;
  }
}

function importIconData(dataUrl) {
  ensureIconCanvas();
  clearIconCanvas({ resetData: false });
  if (!dataUrl) {
    currentIconData = null;
    updateIconPreview(null);
    return;
  }
  const svgText = decodeSvgDataUrl(dataUrl);
  if (svgText) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const root = doc.documentElement;
      if (root && root.getAttribute(BUILDER_FLAG_ATTR) === '1') {
        const vb = root.getAttribute('viewBox');
        if (vb) iconCanvas.setAttribute('viewBox', vb);
        Array.from(root.children).forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.getAttribute('data-icon-grid') || node.tagName.toLowerCase() === 'defs') return;
          const imported = node.cloneNode(true);
          imported.dataset.iconShape = '1';
          if (!imported.dataset.shapeType) {
            const tag = imported.tagName.toLowerCase();
            if (tag === 'line') imported.dataset.shapeType = 'line';
            else if (tag === 'rect') imported.dataset.shapeType = 'rectangle';
            else if (tag === 'circle') imported.dataset.shapeType = 'circle';
            else if (tag === 'path') imported.dataset.shapeType = 'arc';
            else if (tag === 'text') imported.dataset.shapeType = 'text';
          }
          imported.classList.add('icon-shape');
          iconCanvas.appendChild(imported);
        });
        commitIconChanges();
        return;
      }
    } catch (err) {
      console.warn('Unable to import saved icon', err);
    }
  }
  currentIconData = dataUrl;
  updateIconPreview(dataUrl, true);
}

function captureShapeData(shape) {
  const type = shape?.dataset.shapeType;
  if (!type) return null;
  if (type === 'line') {
    return {
      x1: Number(shape.dataset.x1) || 0,
      y1: Number(shape.dataset.y1) || 0,
      x2: Number(shape.dataset.x2) || 0,
      y2: Number(shape.dataset.y2) || 0
    };
  }
  if (type === 'rectangle') {
    return {
      x: Number(shape.dataset.x) || 0,
      y: Number(shape.dataset.y) || 0,
      width: Number(shape.dataset.width) || 0,
      height: Number(shape.dataset.height) || 0
    };
  }
  if (type === 'circle') {
    return {
      cx: Number(shape.dataset.cx) || 0,
      cy: Number(shape.dataset.cy) || 0,
      r: Number(shape.dataset.r) || 0
    };
  }
  if (type === 'arc') {
    return {
      startX: Number(shape.dataset.startX) || 0,
      startY: Number(shape.dataset.startY) || 0,
      controlX: Number(shape.dataset.controlX) || 0,
      controlY: Number(shape.dataset.controlY) || 0,
      endX: Number(shape.dataset.endX) || 0,
      endY: Number(shape.dataset.endY) || 0
    };
  }
  if (type === 'text') {
    return {
      x: Number(shape.dataset.x) || 0,
      y: Number(shape.dataset.y) || 0
    };
  }
  return null;
}

function startShapeDrag(shape, point) {
  const type = shape?.dataset.shapeType;
  if (!shape || !type) return;
  const original = captureShapeData(shape);
  if (!original) return;
  shapeDragState = { shape, type, start: point, original };
}

function updateShapeDrag(point) {
  if (!shapeDragState) return;
  const { shape, type, start, original } = shapeDragState;
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  if (type === 'line') {
    const startPos = { x: roundCoord(original.x1 + dx), y: roundCoord(original.y1 + dy) };
    const endPos = { x: roundCoord(original.x2 + dx), y: roundCoord(original.y2 + dy) };
    applyLineAttributes(shape, startPos, endPos);
  } else if (type === 'rectangle') {
    const x = roundCoord(original.x + dx);
    const y = roundCoord(original.y + dy);
    shape.dataset.x = String(x);
    shape.dataset.y = String(y);
    shape.setAttribute('x', x);
    shape.setAttribute('y', y);
    shape.setAttribute('width', roundCoord(original.width));
    shape.setAttribute('height', roundCoord(original.height));
  } else if (type === 'circle') {
    const cx = roundCoord(original.cx + dx);
    const cy = roundCoord(original.cy + dy);
    shape.dataset.cx = String(cx);
    shape.dataset.cy = String(cy);
    shape.setAttribute('cx', cx);
    shape.setAttribute('cy', cy);
    shape.setAttribute('r', roundCoord(original.r));
  } else if (type === 'arc') {
    const startPos = { x: roundCoord(original.startX + dx), y: roundCoord(original.startY + dy) };
    const control = { x: roundCoord(original.controlX + dx), y: roundCoord(original.controlY + dy) };
    const endPos = { x: roundCoord(original.endX + dx), y: roundCoord(original.endY + dy) };
    applyArcAttributes(shape, startPos, { control, end: endPos });
  } else if (type === 'text') {
    const x = roundCoord(original.x + dx);
    const y = roundCoord(original.y + dy);
    applyTextAttributes(shape, { x, y });
  }
}

function finishShapeDrag(commit = true) {
  if (!shapeDragState) return;
  if (commit) commitIconChanges();
  shapeDragState = null;
}

function handleTextPlacement(point) {
  const value = window.prompt('Icon text', '');
  if (value === null) return;
  const trimmed = value.trim();
  if (!trimmed) return;
  const txt = document.createElementNS(SVG_NS, 'text');
  txt.textContent = trimmed;
  txt.dataset.iconShape = '1';
  txt.dataset.shapeType = 'text';
  txt.classList.add('icon-shape');
  txt.setAttribute('fill', '#1f2933');
  txt.setAttribute('font-size', '18');
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('dominant-baseline', 'middle');
  applyTextAttributes(txt, point);
  iconCanvas.appendChild(txt);
  selectIconShape(txt);
  commitIconChanges();
}

function handleCanvasMouseDown(event) {
  if (!iconCanvas || event.button !== 0) return;
  const point = getCanvasPoint(event);
  if (!point) return;
  ensureIconCanvas();
  const target = event.target;
  const shapeTarget = target instanceof SVGElement && target.dataset.iconShape === '1';
  if (iconTool === 'text') {
    event.preventDefault();
    handleTextPlacement(point);
    return;
  }
  if (shapeTarget && iconTool !== 'text') {
    startShapeDrag(target, point);
    selectIconShape(target);
    event.preventDefault();
    return;
  }
  if (iconTool === 'select') {
    selectIconShape(null);
    return;
  }
  const shape = createShapeElement(iconTool);
  if (!shape) return;
  drawingShape = shape;
  drawingStart = point;
  if (iconTool === 'line') {
    applyLineAttributes(shape, point, point);
  } else if (iconTool === 'rectangle') {
    applyRectAttributes(shape, point, point);
  } else if (iconTool === 'circle') {
    applyCircleAttributes(shape, point, point);
  } else if (iconTool === 'arc') {
    applyArcAttributes(shape, point, buildArcGeometry(point, point));
  }
  iconCanvas.appendChild(shape);
  selectIconShape(null);
  event.preventDefault();
}

function handleCanvasMouseMove(event) {
  const point = getCanvasPoint(event);
  if (!point) return;
  if (drawingShape && drawingStart) {
    const tool = drawingShape.dataset.shapeType;
    if (tool === 'line') {
      const start = drawingStart;
      let current = point;
      if (event.shiftKey && start) {
        const dx = Math.abs(point.x - start.x);
        const dy = Math.abs(point.y - start.y);
        if (dx >= dy) {
          current = { x: point.x, y: start.y };
        } else {
          current = { x: start.x, y: point.y };
        }
      }
      applyLineAttributes(drawingShape, start, current);
    } else if (tool === 'rectangle') {
      applyRectAttributes(drawingShape, drawingStart, point);
    } else if (tool === 'circle') {
      applyCircleAttributes(drawingShape, drawingStart, point);
    } else if (tool === 'arc') {
      const invert = event.shiftKey;
      applyArcAttributes(drawingShape, drawingStart, buildArcGeometry(drawingStart, point, invert));
    }
  } else if (shapeDragState) {
    updateShapeDrag(point);
  }
}

function handleCanvasMouseUp() {
  if (drawingShape) {
    const type = drawingShape.dataset.shapeType;
    let valid = true;
    if (type === 'line') {
      const x1 = Number(drawingShape.dataset.x1) || 0;
      const y1 = Number(drawingShape.dataset.y1) || 0;
      const x2 = Number(drawingShape.dataset.x2) || 0;
      const y2 = Number(drawingShape.dataset.y2) || 0;
      valid = Math.hypot(x2 - x1, y2 - y1) >= 1;
    } else if (type === 'rectangle') {
      const w = Number(drawingShape.dataset.width) || 0;
      const h = Number(drawingShape.dataset.height) || 0;
      valid = w >= 1 && h >= 1;
    } else if (type === 'circle') {
      const r = Number(drawingShape.dataset.r) || 0;
      valid = r >= 0.5;
    } else if (type === 'arc') {
      const sx = Number(drawingShape.dataset.startX) || 0;
      const sy = Number(drawingShape.dataset.startY) || 0;
      const ex = Number(drawingShape.dataset.endX) || 0;
      const ey = Number(drawingShape.dataset.endY) || 0;
      valid = Math.hypot(ex - sx, ey - sy) >= 1;
    }
    finishDrawingShape(valid);
  }
  if (shapeDragState) {
    finishShapeDrag(true);
  }
}

function handleCanvasDoubleClick(event) {
  if (!iconCanvas || iconTool !== 'select') return;
  const target = event.target;
  if (!(target instanceof SVGElement) || target.dataset.iconShape !== '1') return;
  if (target.dataset.shapeType === 'text') {
    event.preventDefault();
    const current = target.textContent || '';
    const next = window.prompt('Edit text', current);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) {
      target.remove();
      selectIconShape(null);
    } else {
      target.textContent = trimmed;
    }
    commitIconChanges();
  }
}

function undoLastIconShape() {
  if (!iconCanvas) return;
  const shapes = iconCanvas.querySelectorAll('[data-icon-shape]');
  if (!shapes.length) return;
  const last = shapes[shapes.length - 1];
  if (selectedIconShape === last) selectIconShape(null);
  last.remove();
  commitIconChanges();
}

function handleBuilderKeydown(event) {
  if (!selectedIconShape) return;
  if (event.key !== 'Delete' && event.key !== 'Backspace') return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))) {
    return;
  }
  event.preventDefault();
  selectedIconShape.remove();
  selectIconShape(null);
  commitIconChanges();
}

function loadComponents() {
  const data = getStoredItem(STORAGE_KEY, [], STORAGE_SCENARIO);
  if (!Array.isArray(data)) return [];
  return data;
}

function persist() {
  try {
    setStoredItem(STORAGE_KEY, components, STORAGE_SCENARIO);
    components = loadComponents();
  } catch (err) {
    console.error('Failed to store custom components', err);
    showToast('Unable to save components. Storage may be full.', 'error');
    return false;
  }
  return true;
}

function buildPorts(counts, width, height) {
  const ports = [];
  const addPorts = (count, side) => {
    const total = Math.max(0, Math.floor(Number(count) || 0));
    if (!total) return;
    for (let idx = 1; idx <= total; idx += 1) {
      if (side === 'top') {
        const spacing = width / (total + 1);
        ports.push({ x: spacing * idx, y: 0 });
      } else if (side === 'right') {
        const spacing = height / (total + 1);
        ports.push({ x: width, y: spacing * idx });
      } else if (side === 'bottom') {
        const spacing = width / (total + 1);
        ports.push({ x: spacing * idx, y: height });
      } else if (side === 'left') {
        const spacing = height / (total + 1);
        ports.push({ x: 0, y: spacing * idx });
      }
    }
  };
  addPorts(counts.top, 'top');
  addPorts(counts.right, 'right');
  addPorts(counts.bottom, 'bottom');
  addPorts(counts.left, 'left');
  return ports;
}

function sanitizeNumber(input, fallback) {
  const value = Number(input);
  return Number.isFinite(value) ? value : fallback;
}

function clearPropertyRows() {
  propertyList.innerHTML = '';
}

function addPropertyRow(data = {}) {
  if (propertyList.children.length >= MAX_PROPERTIES) {
    showToast(`Limit ${MAX_PROPERTIES} properties per component.`, 'error');
    return;
  }
  const row = document.createElement('div');
  row.className = 'property-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'prop-name';
  nameInput.placeholder = 'Property key';
  nameInput.value = data.name || '';
  nameInput.maxLength = 80;

  const typeSelect = document.createElement('select');
  typeSelect.className = 'prop-type';
  ['text', 'number', 'checkbox'].forEach(optionValue => {
    const opt = document.createElement('option');
    opt.value = optionValue;
    opt.textContent = optionValue === 'checkbox' ? 'Yes/No' : optionValue.charAt(0).toUpperCase() + optionValue.slice(1);
    if ((data.type || 'text') === optionValue) opt.selected = true;
    typeSelect.appendChild(opt);
  });

  const valueContainer = document.createElement('div');
  valueContainer.className = 'prop-value-container';

  const buildValueInput = (type, value) => {
    let input;
    if (type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'prop-value';
      input.checked = Boolean(value);
    } else {
      input = document.createElement('input');
      input.type = type === 'number' ? 'number' : 'text';
      input.className = 'prop-value';
      if (value !== undefined && value !== null && value !== '') {
        input.value = type === 'number' ? Number(value) : value;
      }
    }
    return input;
  };

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn property-remove-btn';
  removeBtn.setAttribute('aria-label', 'Remove property');
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => {
    row.remove();
  });

  const renderValueInput = () => {
    const currentType = typeSelect.value;
    const existing = valueContainer.querySelector('.prop-value');
    const currentValue = currentType === 'checkbox'
      ? existing?.checked
      : existing?.value ?? data.value;
    valueContainer.innerHTML = '';
    const input = buildValueInput(currentType, currentValue);
    valueContainer.appendChild(input);
  };

  typeSelect.addEventListener('change', renderValueInput);

  row.appendChild(nameInput);
  row.appendChild(typeSelect);
  renderValueInput();
  row.appendChild(valueContainer);
  row.appendChild(removeBtn);
  propertyList.appendChild(row);
}

function collectProperties() {
  const entries = [];
  const rows = propertyList.querySelectorAll('.property-row');
  rows.forEach(row => {
    const name = row.querySelector('.prop-name')?.value.trim();
    if (!name) return;
    const type = row.querySelector('.prop-type')?.value || 'text';
    const valueEl = row.querySelector('.prop-value');
    let value;
    if (type === 'checkbox') {
      value = valueEl?.checked || false;
    } else if (type === 'number') {
      const raw = valueEl?.value ?? '';
      if (raw === '') {
        value = '';
      } else {
        const num = Number(raw);
        if (!Number.isFinite(num)) {
          throw new Error(`Property "${name}" must be a number.`);
        }
        value = num;
      }
    } else {
      value = valueEl?.value ?? '';
    }
    entries.push({ name, type, value });
  });
  return entries;
}

function propertiesToObject(properties) {
  const obj = {};
  properties.forEach(({ name, type, value }) => {
    if (type === 'checkbox') {
      obj[name] = Boolean(value);
    } else if (type === 'number') {
      obj[name] = value === '' ? '' : Number(value);
    } else {
      obj[name] = value ?? '';
    }
  });
  return obj;
}

function resetIcon() {
  clearIconCanvas();
}

function resetForm() {
  form.reset();
  formIndexInput.value = '';
  editingIndex = null;
  if (submitBtn) submitBtn.textContent = 'Save Component';
  clearPropertyRows();
  addPropertyRow();
  resetIcon();
}

function updateIconPreview(src, nonEditable = false) {
  if (!iconPreview) return;
  iconPreview.innerHTML = '';
  if (!src) {
    iconPreview.innerHTML = '<span class="icon-placeholder">No icon defined</span>';
    return;
  }
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  iconPreview.appendChild(img);
  if (nonEditable) {
    const note = document.createElement('p');
    note.className = 'icon-note';
    note.textContent = 'Imported image icons cannot be edited. Clear to draw a new icon.';
    iconPreview.appendChild(note);
  }
}

function updateTable() {
  tableBody.innerHTML = '';
  if (!components.length) {
    emptyMessage?.classList.remove('hidden');
    return;
  }
  emptyMessage?.classList.add('hidden');
  components.forEach((comp, idx) => {
    const row = document.createElement('tr');

    const labelCell = document.createElement('td');
    labelCell.textContent = comp.label || comp.subtype;

    const subtypeCell = document.createElement('td');
    subtypeCell.textContent = comp.subtype;

    const categoryCell = document.createElement('td');
    categoryCell.textContent = comp.category;

    const typeCell = document.createElement('td');
    typeCell.textContent = comp.type;

    const portsCell = document.createElement('td');
    const counts = comp.portCounts || { top: 0, right: 0, bottom: 0, left: 0 };
    portsCell.textContent = `T${counts.top || 0} · R${counts.right || 0} · B${counts.bottom || 0} · L${counts.left || 0}`;

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => loadComponentForEdit(idx));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn secondary-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteComponent(idx));

    actionsCell.appendChild(editBtn);
    actionsCell.appendChild(deleteBtn);

    row.appendChild(labelCell);
    row.appendChild(subtypeCell);
    row.appendChild(categoryCell);
    row.appendChild(typeCell);
    row.appendChild(portsCell);
    row.appendChild(actionsCell);

    tableBody.appendChild(row);
  });
}

function loadComponentForEdit(index) {
  const comp = components[index];
  if (!comp) return;
  editingIndex = index;
  formIndexInput.value = String(index);
  labelInput.value = comp.label || '';
  subtypeInput.value = comp.subtype || '';
  typeInput.value = comp.type || '';
  categorySelect.value = comp.category || 'equipment';
  widthInput.value = comp.width || 80;
  heightInput.value = comp.height || 40;
  const counts = comp.portCounts || inferPortCounts(comp.ports || [], comp.width, comp.height);
  portTopInput.value = counts.top || 0;
  portRightInput.value = counts.right || 0;
  portBottomInput.value = counts.bottom || 0;
  portLeftInput.value = counts.left || 0;
  clearPropertyRows();
  (comp.properties || []).forEach(entry => addPropertyRow(entry));
  if (!comp.properties || comp.properties.length === 0) addPropertyRow();
  importIconData(comp.icon || null);
  if (submitBtn) submitBtn.textContent = 'Update Component';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function inferPortCounts(ports = [], width = 80, height = 40) {
  const counts = { top: 0, right: 0, bottom: 0, left: 0 };
  const w = Number(width) || 80;
  const h = Number(height) || 40;
  const epsilon = 0.5;
  ports.forEach(port => {
    if (!port || typeof port.x !== 'number' || typeof port.y !== 'number') return;
    if (Math.abs(port.y) <= epsilon) counts.top += 1;
    else if (Math.abs(port.x - w) <= epsilon) counts.right += 1;
    else if (Math.abs(port.y - h) <= epsilon) counts.bottom += 1;
    else if (Math.abs(port.x) <= epsilon) counts.left += 1;
  });
  return counts;
}

function deleteComponent(index) {
  const comp = components[index];
  if (!comp) return;
  const ok = window.confirm(`Delete ${comp.label || comp.subtype}?`);
  if (!ok) return;
  components.splice(index, 1);
  if (!persist()) return;
  showToast('Component deleted.', 'success');
  if (editingIndex === index) {
    resetForm();
  }
  updateTable();
}

function handleFormSubmit(event) {
  event.preventDefault();
  try {
    const label = labelInput.value.trim();
    const subtype = subtypeInput.value.trim();
    const type = typeInput.value.trim();
    const category = categorySelect.value.trim() || 'equipment';
    const width = sanitizeNumber(widthInput.value, 80);
    const height = sanitizeNumber(heightInput.value, 40);
    const counts = {
      top: Math.max(0, Math.floor(sanitizeNumber(portTopInput.value, 0))),
      right: Math.max(0, Math.floor(sanitizeNumber(portRightInput.value, 0))),
      bottom: Math.max(0, Math.floor(sanitizeNumber(portBottomInput.value, 0))),
      left: Math.max(0, Math.floor(sanitizeNumber(portLeftInput.value, 0)))
    };
    const totalPorts = counts.top + counts.right + counts.bottom + counts.left;
    if (!label || !subtype || !type) {
      showToast('Label, subtype, and type are required.', 'error');
      return;
    }
    if (totalPorts === 0) {
      showToast('Add at least one connection port.', 'error');
      return;
    }
    const properties = collectProperties();
    const props = propertiesToObject(properties);
    const ports = buildPorts(counts, width, height);
    const data = {
      label,
      subtype,
      type,
      category,
      width,
      height,
      ports,
      portCounts: counts,
      props,
      properties,
      icon: currentIconData || null
    };
    const duplicateIndex = components.findIndex((c, idx) => c.subtype === subtype && idx !== editingIndex);
    if (duplicateIndex !== -1) {
      showToast('Subtype must be unique.', 'error');
      return;
    }
    if (editingIndex !== null && editingIndex >= 0) {
      components[editingIndex] = data;
    } else {
      components.push(data);
    }
    if (!persist()) return;
    showToast('Component saved.', 'success');
    resetForm();
    updateTable();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Unable to save component.', 'error');
  }
}

function handleExport() {
  if (!components.length) {
    showToast('No custom components to export.', 'error');
    return;
  }
  const blob = new Blob([JSON.stringify(components, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'customComponents.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Export started.', 'success');
}

function normalizeImportedComponent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const subtype = String(raw.subtype || '').trim();
  const type = String(raw.type || raw.category || '').trim() || 'equipment';
  if (!subtype) return null;
  const label = String(raw.label || subtype);
  const category = String(raw.category || '').trim() || type;
  const width = sanitizeNumber(raw.width, 80);
  const height = sanitizeNumber(raw.height, 40);
  const counts = raw.portCounts || inferPortCounts(raw.ports || [], width, height);
  const props = raw.props && typeof raw.props === 'object' ? raw.props : {};
  const properties = Array.isArray(raw.properties)
    ? raw.properties
        .map(p => ({
          name: String(p.name || '').trim(),
          type: p.type === 'number' || p.type === 'checkbox' ? p.type : 'text',
          value: p.value
        }))
        .filter(p => p.name)
    : Object.keys(props).map(key => ({
        name: key,
        type: typeof props[key] === 'number' ? 'number' : typeof props[key] === 'boolean' ? 'checkbox' : 'text',
        value: props[key]
      }));
  const normalizedProperties = properties.map(entry => {
    if (entry.type === 'number') {
      const num = Number(entry.value);
      return { name: entry.name, type: 'number', value: Number.isFinite(num) ? num : '' };
    }
    if (entry.type === 'checkbox') {
      return { name: entry.name, type: 'checkbox', value: Boolean(entry.value) };
    }
    return { name: entry.name, type: 'text', value: entry.value == null ? '' : String(entry.value) };
  });
  const ports = buildPorts(counts, width, height);
  return {
    label,
    subtype,
    type,
    category,
    width,
    height,
    ports,
    portCounts: counts,
    props: propertiesToObject(normalizedProperties),
    properties: normalizedProperties,
    icon: raw.icon || null
  };
}

function handleImportChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const list = Array.isArray(data) ? data : [];
      if (!list.length) {
        showToast('No components found in file.', 'error');
        return;
      }
      let added = 0;
      list.forEach(raw => {
        const normalized = normalizeImportedComponent(raw);
        if (!normalized) return;
        const idx = components.findIndex(c => c.subtype === normalized.subtype);
        if (idx >= 0) components[idx] = normalized;
        else components.push(normalized);
        added += 1;
      });
      if (!added) {
        showToast('No valid components imported.', 'error');
        return;
      }
      if (!persist()) return;
      showToast(`Imported ${added} component${added === 1 ? '' : 's'}.`, 'success');
      updateTable();
    } catch (err) {
      console.error('Import failed', err);
      showToast('Invalid JSON file.', 'error');
    } finally {
      importInput.value = '';
    }
  };
  reader.onerror = () => {
    showToast('Failed to read import file.', 'error');
    importInput.value = '';
  };
  reader.readAsText(file);
}

function setupListeners() {
  form.addEventListener('submit', handleFormSubmit);
  addPropertyBtn.addEventListener('click', () => addPropertyRow());
  resetFormBtn.addEventListener('click', resetForm);
  clearIconBtn?.addEventListener('click', resetIcon);
  undoIconBtn?.addEventListener('click', undoLastIconShape);
  if (iconToolButtons) {
    iconToolButtons.addEventListener('click', e => {
      const btn = e.target.closest('button[data-tool]');
      if (!btn) return;
      setActiveIconTool(btn.dataset.tool || 'select');
    });
  }
  if (iconCanvas) {
    iconCanvas.addEventListener('mousedown', handleCanvasMouseDown);
    iconCanvas.addEventListener('dblclick', handleCanvasDoubleClick);
  }
  document.addEventListener('mousemove', handleCanvasMouseMove);
  document.addEventListener('mouseup', handleCanvasMouseUp);
  document.addEventListener('keydown', handleBuilderKeydown);
  exportBtn.addEventListener('click', handleExport);
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', handleImportChange);
  const storageSuffix = `:${STORAGE_KEY}`;
  window.addEventListener('storage', e => {
    if (!e.key) return;
    if (e.key === STORAGE_KEY || e.key.endsWith(storageSuffix)) {
      components = loadComponents();
      updateTable();
    }
  });
}

ensureIconCanvas();
setActiveIconTool('select');
resetForm();
updateTable();
setupListeners();


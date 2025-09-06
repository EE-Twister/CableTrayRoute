import { getOneLine, setOneLine, setEquipment, setPanels, setLoads, getCables, setCables, getItem, setItem } from './dataStore.mjs';

let componentMeta = {};

const typeIcons = {
  panel: 'icons/panel.svg',
  equipment: 'icons/equipment.svg',
  load: 'icons/load.svg'
};

let propSchemas = {};
let subtypeCategory = {};
let componentTypes = {};
let manufacturerDefaults = {};

async function loadComponentLibrary() {
  try {
    const res = await fetch('componentLibrary.json');
    const data = await res.json();
    data.forEach(c => {
      componentMeta[c.subtype] = {
        icon: c.icon,
        label: c.label,
        category: c.category,
        ports: c.ports
      };
      propSchemas[c.subtype] = c.schema || [];
    });
    rebuildComponentMaps();
  } catch (err) {
    console.error('Failed to load component library', err);
  }
}

async function loadManufacturerLibrary() {
  try {
    const res = await fetch('manufacturerLibrary.json');
    manufacturerDefaults = await res.json();
  } catch (err) {
    console.error('Failed to load manufacturer defaults', err);
    manufacturerDefaults = {};
  }
  const stored = getItem('manufacturerDefaults', {});
  manufacturerDefaults = { ...manufacturerDefaults, ...stored };
}

function rebuildComponentMaps() {
  subtypeCategory = {};
  componentTypes = {};
  Object.entries(componentMeta).forEach(([sub, meta]) => {
    subtypeCategory[sub] = meta.category;
    if (!componentTypes[meta.category]) componentTypes[meta.category] = [];
    componentTypes[meta.category].push(sub);
  });
}

function applyDefaults(comp) {
  const defs = manufacturerDefaults[comp.subtype];
  if (!defs) return;
  Object.entries(defs).forEach(([k, v]) => {
    if (comp[k] === undefined || comp[k] === '') {
      comp[k] = v;
    }
  });
}

const svgNS = 'http://www.w3.org/2000/svg';
let sheets = [];
let activeSheet = 0;
let components = [];
let selection = [];
let selected = null;
let dragOffset = null;
let clipboard = [];
let contextTarget = null;
let connectMode = false;
let connectSource = null;
let selectedConnection = null;
let gridSize = Number(getItem('gridSize', 20));
let gridEnabled = true;
let history = [];
let historyIndex = -1;
let validationIssues = [];
const compWidth = 80;
const compHeight = 40;
let templates = [];
let cursorPos = { x: 20, y: 20 };

// Prefix settings and counters for component labels
let labelPrefixes = getItem('labelPrefixes', {});
let labelCounters = getItem('labelCounters', {});

function getPrefix(subtype) {
  return labelPrefixes[subtype] || (subtype.slice(0, 3).toUpperCase() + '-');
}

function nextLabel(subtype) {
  const count = (labelCounters[subtype] || 0) + 1;
  labelCounters[subtype] = count;
  setItem('labelCounters', labelCounters);
  return getPrefix(subtype) + count;
}

function editPrefixes() {
  const prefixes = { ...labelPrefixes };
  Object.keys(componentMeta).forEach(sub => {
    const current = prefixes[sub] || getPrefix(sub);
    const val = prompt(`Prefix for ${sub}`, current);
    if (val !== null) prefixes[sub] = val;
  });
  labelPrefixes = prefixes;
  setItem('labelPrefixes', labelPrefixes);
}

function editManufacturerDefaults() {
  const modal = document.getElementById('defaults-modal');
  modal.innerHTML = '';
  const form = document.createElement('form');

  const subtypeLabel = document.createElement('label');
  subtypeLabel.textContent = 'Subtype ';
  const subtypeSelect = document.createElement('select');
  Object.keys(componentMeta).forEach(sub => {
    const opt = document.createElement('option');
    opt.value = sub;
    opt.textContent = sub;
    subtypeSelect.appendChild(opt);
  });
  subtypeLabel.appendChild(subtypeSelect);
  form.appendChild(subtypeLabel);

  const fields = ['manufacturer', 'model', 'voltage', 'ratings'];
  const inputs = {};
  fields.forEach(f => {
    const lbl = document.createElement('label');
    lbl.textContent = f.charAt(0).toUpperCase() + f.slice(1) + ' ';
    const input = document.createElement('input');
    input.type = f === 'voltage' ? 'number' : 'text';
    lbl.appendChild(input);
    form.appendChild(lbl);
    inputs[f] = input;
  });

  function loadValues() {
    const defs = manufacturerDefaults[subtypeSelect.value] || {};
    fields.forEach(f => {
      inputs[f].value = defs[f] || '';
    });
  }
  subtypeSelect.addEventListener('change', loadValues);
  loadValues();

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.textContent = 'Save';
  form.appendChild(saveBtn);
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => modal.classList.remove('show'));
  form.appendChild(cancelBtn);

  form.addEventListener('submit', e => {
    e.preventDefault();
    const sub = subtypeSelect.value;
    manufacturerDefaults[sub] = {};
    fields.forEach(f => {
      manufacturerDefaults[sub][f] = inputs[f].value;
    });
    setItem('manufacturerDefaults', manufacturerDefaults);
    modal.classList.remove('show');
    showToast('Defaults updated');
  });

  modal.appendChild(form);
  modal.classList.add('show');
}

// --- Tooltip module ---
const tooltip = document.createElement('div');
tooltip.id = 'component-tooltip';
tooltip.style.display = 'none';
document.body.appendChild(tooltip);

function positionTooltip(e) {
  tooltip.style.left = e.pageX + 10 + 'px';
  tooltip.style.top = e.pageY + 10 + 'px';
}

function showTooltip(e) {
  const text = e.currentTarget.dataset.tooltip;
  if (!text) return;
  tooltip.textContent = text;
  positionTooltip(e);
  tooltip.style.display = 'block';
}

function moveTooltip(e) {
  if (tooltip.style.display === 'block') positionTooltip(e);
}

function hideTooltip() {
  tooltip.style.display = 'none';
}

function pushHistory() {
  history = history.slice(0, historyIndex + 1);
  history.push(JSON.parse(JSON.stringify(components)));
  historyIndex = history.length - 1;
}

function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    components = JSON.parse(JSON.stringify(history[historyIndex]));
    selected = null;
    selection = [];
    selectedConnection = null;
    render();
    save();
  }
}

function redo() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    components = JSON.parse(JSON.stringify(history[historyIndex]));
    selected = null;
    selection = [];
    selectedConnection = null;
    render();
    save();
  }
}

function loadTemplates() {
  try {
    templates = JSON.parse(localStorage.getItem('onelineTemplates')) || [];
  } catch {
    templates = [];
  }
}

function saveTemplates() {
  localStorage.setItem('onelineTemplates', JSON.stringify(templates));
}

function renderTemplates() {
  const container = document.getElementById('template-buttons');
  if (!container) return;
  container.innerHTML = '';
  templates.forEach(t => {
    const btn = document.createElement('button');
    btn.textContent = t.name;
    btn.dataset.subtype = t.component.subtype;
    btn.dataset.label = t.name;
    btn.addEventListener('click', () => addTemplateComponent(t.component));
    container.appendChild(btn);
  });
}

function addTemplateComponent(data) {
  const id = 'n' + Date.now();
  let x = cursorPos.x;
  let y = cursorPos.y;
  if (gridEnabled) {
    x = Math.round(x / gridSize) * gridSize;
    y = Math.round(y / gridSize) * gridSize;
  }
  components.push({
    id,
    ...JSON.parse(JSON.stringify(data)),
    x,
    y,
    connections: []
  });
  pushHistory();
  render();
  save();
}

function exportTemplates() {
  const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'onelineTemplates.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importTemplates(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      templates = templates.concat(data);
      saveTemplates();
      renderTemplates();
      showToast('Templates imported');
    }
  } catch (err) {
    console.error('Failed to import templates', err);
  }
  e.target.value = '';
}

const cableColors = {
  Power: '#f00',
  Control: '#00f',
  Signal: '#0a0'
};

// Voltage range configuration used for coloring components and connections
const voltageColors = [
  { max: 600, color: '#4caf50', label: '\u2264600V' },
  { max: 5000, color: '#ff9800', label: '600V-5kV' },
  { max: Infinity, color: '#f44336', label: '>5kV' }
];

function getVoltageRange(voltage) {
  const v = parseFloat(voltage);
  if (isNaN(v)) return null;
  return voltageColors.find(r => v <= r.max) || null;
}

function updateLegend(ranges) {
  const legend = document.getElementById('voltage-legend');
  if (!legend) return;
  legend.innerHTML = '';
  voltageColors.forEach(r => {
    if (ranges.has(r)) {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'legend-color';
      swatch.style.background = r.color;
      item.appendChild(swatch);
      const lbl = document.createElement('span');
      lbl.textContent = r.label;
      item.appendChild(lbl);
      legend.appendChild(item);
    }
  });
  legend.style.display = ranges.size ? 'block' : 'none';
}

function portPosition(c, portIndex) {
  const meta = componentMeta[c.subtype] || {};
  const port = meta.ports?.[portIndex];
  if (!port) {
    return { x: c.x + compWidth / 2, y: c.y + compHeight / 2 };
  }
  let { x, y } = port;
  if (c.flipped) x = compWidth - x;
  let px = c.x + x;
  let py = c.y + y;
  const angle = (c.rotation || 0) * Math.PI / 180;
  if (angle) {
    const cx = c.x + compWidth / 2;
    const cy = c.y + compHeight / 2;
    const dx = px - cx;
    const dy = py - cy;
    px = cx + dx * Math.cos(angle) - dy * Math.sin(angle);
    py = cy + dx * Math.sin(angle) + dy * Math.cos(angle);
  }
  return { x: px, y: py };
}

function nearestPorts(src, tgt) {
  const srcPorts = componentMeta[src.subtype]?.ports || [{ x: compWidth / 2, y: compHeight / 2 }];
  const tgtPorts = componentMeta[tgt.subtype]?.ports || [{ x: compWidth / 2, y: compHeight / 2 }];
  let min = Infinity;
  let best = [0, 0];
  srcPorts.forEach((_, i) => {
    tgtPorts.forEach((_, j) => {
      const sp = portPosition(src, i);
      const tp = portPosition(tgt, j);
      const dx = sp.x - tp.x;
      const dy = sp.y - tp.y;
      const d = dx * dx + dy * dy;
      if (d < min) {
        min = d;
        best = [i, j];
      }
    });
  });
  return best;
}

function normalizeComponent(c) {
  const nc = {
    ...c,
    rotation: c.rotation ?? c.rot ?? 0,
    flipped: c.flipped || false,
    connections: (c.connections || []).map(conn =>
      typeof conn === 'string' ? { target: conn } : conn
    )
  };
  applyDefaults(nc);
  return nc;
}

function render() {
  const svg = document.getElementById('diagram');
  svg.querySelectorAll('g.component, .connection, .conn-label, .port').forEach(el => el.remove());
  const usedVoltageRanges = new Set();
  if (gridEnabled) {
    components.forEach(c => {
      c.x = Math.round(c.x / gridSize) * gridSize;
      c.y = Math.round(c.y / gridSize) * gridSize;
    });
  }

  function routeConnection(src, tgt, conn) {
    const start = portPosition(src, conn?.sourcePort);
    const end = portPosition(tgt, conn?.targetPort);

    function horizontalFirst() {
      let midX = (start.x + end.x) / 2;
      let adjusted = true;
      while (adjusted) {
        adjusted = false;
        components.forEach(comp => {
          if (comp === src || comp === tgt) return;
          const rect = { x: comp.x, y: comp.y, w: compWidth, h: compHeight };
          if (
            rect.x <= midX && midX <= rect.x + rect.w &&
            Math.min(start.y, end.y) <= rect.y + rect.h &&
            Math.max(start.y, end.y) >= rect.y
          ) {
            midX = midX < rect.x + rect.w / 2 ? rect.x - 10 : rect.x + rect.w + 10;
            adjusted = true;
          }
          if (
            start.y >= rect.y && start.y <= rect.y + rect.h &&
            Math.min(start.x, midX) <= rect.x + rect.w &&
            Math.max(start.x, midX) >= rect.x
          ) {
            midX = midX < rect.x ? rect.x - 10 : rect.x + rect.w + 10;
            adjusted = true;
          }
          if (
            end.y >= rect.y && end.y <= rect.y + rect.h &&
            Math.min(end.x, midX) <= rect.x + rect.w &&
            Math.max(end.x, midX) >= rect.x
          ) {
            midX = midX < rect.x ? rect.x - 10 : rect.x + rect.w + 10;
            adjusted = true;
          }
        });
      }
      return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
    }

    function verticalFirst() {
      let midY = (start.y + end.y) / 2;
      let adjusted = true;
      while (adjusted) {
        adjusted = false;
        components.forEach(comp => {
          if (comp === src || comp === tgt) return;
          const rect = { x: comp.x, y: comp.y, w: compWidth, h: compHeight };
          if (
            rect.y <= midY && midY <= rect.y + rect.h &&
            Math.min(start.x, end.x) <= rect.x + rect.w &&
            Math.max(start.x, end.x) >= rect.x
          ) {
            midY = midY < rect.y + rect.h / 2 ? rect.y - 10 : rect.y + rect.h + 10;
            adjusted = true;
          }
          if (
            start.x >= rect.x && start.x <= rect.x + rect.w &&
            Math.min(start.y, midY) <= rect.y + rect.h &&
            Math.max(start.y, midY) >= rect.y
          ) {
            midY = midY < rect.y ? rect.y - 10 : rect.y + rect.h + 10;
            adjusted = true;
          }
          if (
            end.x >= rect.x && end.x <= rect.x + rect.w &&
            Math.min(end.y, midY) <= rect.y + rect.h &&
            Math.max(end.y, midY) >= rect.y
          ) {
            midY = midY < rect.y ? rect.y - 10 : rect.y + rect.h + 10;
            adjusted = true;
          }
        });
      }
      return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
    }

    function intersects(path) {
      for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i + 1];
        const horizontal = p1.y === p2.y;
        const x1 = Math.min(p1.x, p2.x);
        const x2 = Math.max(p1.x, p2.x);
        const y1 = Math.min(p1.y, p2.y);
        const y2 = Math.max(p1.y, p2.y);
        for (const comp of components) {
          if (comp === src || comp === tgt) continue;
          const rect = { x: comp.x, y: comp.y, w: compWidth, h: compHeight };
          if (horizontal) {
            if (
              p1.y >= rect.y && p1.y <= rect.y + rect.h &&
              x2 >= rect.x && x1 <= rect.x + rect.w
            ) return true;
          } else {
            if (
              p1.x >= rect.x && p1.x <= rect.x + rect.w &&
              y2 >= rect.y && y1 <= rect.y + rect.h
            ) return true;
          }
        }
      }
      return false;
    }

    const h = horizontalFirst();
    if (!intersects(h)) return h;
    const v = verticalFirst();
    if (!intersects(v)) return v;
    return h.length <= v.length ? h : v;
  }

  function midpoint(points) {
    const segs = [];
    let len = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const l = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      segs.push({ p1, p2, l });
      len += l;
    }
    let half = len / 2;
    for (const s of segs) {
      if (half <= s.l) {
        const ratio = half / s.l;
        return { x: s.p1.x + (s.p2.x - s.p1.x) * ratio, y: s.p1.y + (s.p2.y - s.p1.y) * ratio };
      }
      half -= s.l;
    }
    return points[0];
  }

  // draw connections
  components.forEach(c => {
    (c.connections || []).forEach((conn, idx) => {
      const target = components.find(t => t.id === conn.target);
      if (!target) return;
      const pts = routeConnection(c, target, conn);
      const poly = document.createElementNS(svgNS, 'polyline');
      poly.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
      const vRange = getVoltageRange(conn.voltage || conn.cable?.voltage || c.voltage || target.voltage);
      if (vRange) usedVoltageRanges.add(vRange);
      const stroke = vRange?.color || cableColors[conn.cable?.cable_type] || conn.cable?.color || '#000';
      poly.setAttribute('stroke', stroke);
      poly.setAttribute('fill', 'none');
      poly.setAttribute('marker-end', 'url(#arrow)');
      poly.classList.add('connection');
      poly.addEventListener('click', e => {
        e.stopPropagation();
        selected = null;
        selection = [];
        selectedConnection = { component: c, index: idx };
      });
      svg.appendChild(poly);

      const label = document.createElementNS(svgNS, 'text');
      const mid = midpoint(pts);
      label.setAttribute('x', mid.x);
      label.setAttribute('y', mid.y);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.textContent = conn.cable?.tag || conn.cable?.cable_type || '';
      label.classList.add('conn-label');
      label.style.pointerEvents = 'none';
      svg.appendChild(label);
    });
  });

  // draw nodes
  components.forEach(c => {
    const g = document.createElementNS(svgNS, 'g');
    g.dataset.id = c.id;
    g.classList.add('component');
    const tooltipParts = [];
    if (c.label) tooltipParts.push(`Label: ${c.label}`);
    if (c.voltage) tooltipParts.push(`Voltage: ${c.voltage}`);
    if (c.rating) tooltipParts.push(`Rating: ${c.rating}`);
    if (tooltipParts.length) g.setAttribute('data-tooltip', tooltipParts.join('\n'));
    g.addEventListener('mouseenter', showTooltip);
    g.addEventListener('mousemove', moveTooltip);
    g.addEventListener('mouseleave', hideTooltip);
    const cx = c.x + compWidth / 2;
    const cy = c.y + compHeight / 2;
    const transforms = [];
    if (c.flipped) transforms.push(`translate(${cx}, ${cy}) scale(-1,1) translate(${-cx}, ${-cy})`);
    if (c.rotation) transforms.push(`rotate(${c.rotation}, ${cx}, ${cy})`);
    if (transforms.length) g.setAttribute('transform', transforms.join(' '));
    const vRange = getVoltageRange(c.voltage);
    if (vRange) {
      usedVoltageRanges.add(vRange);
      const bg = document.createElementNS(svgNS, 'rect');
      bg.setAttribute('x', c.x);
      bg.setAttribute('y', c.y);
      bg.setAttribute('width', compWidth);
      bg.setAttribute('height', compHeight);
      bg.setAttribute('fill', vRange.color);
      bg.setAttribute('opacity', 0.3);
      g.appendChild(bg);
    }
    const use = document.createElementNS(svgNS, 'use');
    use.setAttribute('x', c.x);
    use.setAttribute('y', c.y);
    use.setAttribute('width', compWidth);
    use.setAttribute('height', compHeight);
    const meta = componentMeta[c.subtype] || {};
    let href = `#icon-${c.subtype}`;
    if (!document.getElementById(`icon-${c.subtype}`)) {
      console.warn(`Missing symbol for subtype '${c.subtype}'`);
      href = '#icon-equipment';
    }
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', c.x + compWidth / 2);
    text.setAttribute('y', c.y + compHeight + 15);
    text.setAttribute('text-anchor', 'middle');
    text.textContent = c.label || meta.label || c.subtype || c.type;
    g.appendChild(use);
    if (selection.includes(c)) {
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', c.x - 2);
      rect.setAttribute('y', c.y - 2);
      rect.setAttribute('width', compWidth + 4);
      rect.setAttribute('height', compHeight + 4);
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', '#00f');
      rect.setAttribute('stroke-dasharray', '4 2');
      rect.style.pointerEvents = 'none';
      g.appendChild(rect);
    }
    g.appendChild(text);
    svg.appendChild(g);
    if (connectMode) {
      (meta.ports || []).forEach((p, idx) => {
        const pos = portPosition(c, idx);
        const circ = document.createElementNS(svgNS, 'circle');
        circ.setAttribute('cx', pos.x);
        circ.setAttribute('cy', pos.y);
        circ.setAttribute('r', 3);
        circ.classList.add('port');
        svg.appendChild(circ);
      });
    }
  });

  updateLegend(usedVoltageRanges);
}

function renderSheetTabs() {
  const tabs = document.getElementById('sheet-tabs');
  if (!tabs) return;
  tabs.innerHTML = '';
  sheets.forEach((s, i) => {
    const tab = document.createElement('button');
    tab.textContent = s.name || `Sheet ${i + 1}`;
    tab.className = 'sheet-tab' + (i === activeSheet ? ' active' : '');
    tab.addEventListener('click', () => loadSheet(i));
    tabs.appendChild(tab);
  });
}

function loadSheet(idx) {
  if (idx < 0 || idx >= sheets.length) return;
  save(false);
  activeSheet = idx;
  components = sheets[activeSheet].components;
  history = [JSON.parse(JSON.stringify(components))];
  historyIndex = 0;
  selection = [];
  selected = null;
  selectedConnection = null;
  renderSheetTabs();
  render();
}

function addSheet() {
  const name = prompt('Sheet name', `Sheet ${sheets.length + 1}`);
  if (!name) return;
  sheets.push({ name, components: [] });
  loadSheet(sheets.length - 1);
  save();
}

function renameSheet() {
  const name = prompt('Sheet name', sheets[activeSheet].name);
  if (!name) return;
  sheets[activeSheet].name = name;
  renderSheetTabs();
  save();
}

function deleteSheet() {
  if (sheets.length <= 1) return;
  if (!confirm('Delete current sheet?')) return;
  sheets.splice(activeSheet, 1);
  activeSheet = Math.max(0, activeSheet - 1);
  components = sheets[activeSheet].components;
  renderSheetTabs();
  render();
  save();
}

function save(notify = true) {
  const sheetData = sheets.map((s, i) => ({
    name: s.name,
    components: (i === activeSheet ? components : s.components).map(c => ({
      ...c,
      rotation: c.rotation || 0,
      flipped: !!c.flipped
    }))
  }));
  sheets = sheetData;
  components = sheets[activeSheet].components;
  setOneLine(sheetData);
  syncSchedules(notify);
  validateDiagram();
}

function addComponent(subtype) {
  const meta = componentMeta[subtype];
  if (!meta) return;
  const id = 'n' + Date.now();
  let x = 20, y = 20;
  if (gridEnabled) {
    x = Math.round(x / gridSize) * gridSize;
    y = Math.round(y / gridSize) * gridSize;
  }
  const comp = {
    id,
    type: meta.category,
    subtype,
    x,
    y,
    label: nextLabel(subtype),
    ref: '',
    rotation: 0,
    flipped: false,
    connections: []
  };
  applyDefaults(comp);
  components.push(comp);
  pushHistory();
  render();
  save();
}

function alignSelection(direction) {
  if (selection.length < 2) return;
  if (direction === 'left') {
    const minX = Math.min(...selection.map(c => c.x));
    selection.forEach(c => { c.x = minX; });
  } else if (direction === 'right') {
    const maxX = Math.max(...selection.map(c => c.x + compWidth));
    selection.forEach(c => { c.x = maxX - compWidth; });
  } else if (direction === 'top') {
    const minY = Math.min(...selection.map(c => c.y));
    selection.forEach(c => { c.y = minY; });
  } else if (direction === 'bottom') {
    const maxY = Math.max(...selection.map(c => c.y + compHeight));
    selection.forEach(c => { c.y = maxY - compHeight; });
  }
  pushHistory();
  render();
  save();
}

function distributeSelection(axis) {
  if (selection.length < 3) return;
  const sorted = [...selection].sort(axis === 'h' ? (a, b) => a.x - b.x : (a, b) => a.y - b.y);
  if (axis === 'h') {
    const min = sorted[0].x;
    const max = sorted[sorted.length - 1].x;
    const step = (max - min) / (sorted.length - 1);
    sorted.forEach((c, i) => { c.x = min + step * i; });
  } else {
    const min = sorted[0].y;
    const max = sorted[sorted.length - 1].y;
    const step = (max - min) / (sorted.length - 1);
    sorted.forEach((c, i) => { c.y = min + step * i; });
  }
  pushHistory();
  render();
  save();
}

function selectComponent(comp) {
  selected = comp;
  selection = [comp];
  selectedConnection = null;
  const modal = document.getElementById('prop-modal');
  modal.innerHTML = '';
  const form = document.createElement('form');
  form.id = 'prop-form';
  const schema = propSchemas[comp.subtype] || [];
  const baseFields = [
    { name: 'label', label: 'Label', type: 'text' },
    { name: 'ref', label: 'Ref ID', type: 'text' }
  ];
  [...baseFields, ...schema].forEach(f => {
    const lbl = document.createElement('label');
    lbl.textContent = f.label + ' ';
    let input;
    const defVal = manufacturerDefaults[comp.subtype]?.[f.name] || '';
    const curVal = comp[f.name] !== undefined && comp[f.name] !== '' ? comp[f.name] : defVal;
    if (f.type === 'select') {
      input = document.createElement('select');
      (f.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (curVal == opt) o.selected = true;
        input.appendChild(o);
      });
    } else if (f.type === 'textarea') {
      input = document.createElement('textarea');
      input.value = curVal;
    } else {
      input = document.createElement('input');
      input.type = f.type || 'text';
      input.value = curVal;
    }
    input.name = f.name;
    lbl.appendChild(input);
    form.appendChild(lbl);
  });
  if ((comp.connections || []).length) {
    const header = document.createElement('h3');
    header.textContent = 'Connections';
    form.appendChild(header);
    const list = document.createElement('ul');
    (comp.connections || []).forEach((conn, idx) => {
      const li = document.createElement('li');
      const target = components.find(t => t.id === conn.target);
      const span = document.createElement('span');
      span.textContent = `to ${target?.label || target?.subtype || conn.target}${conn.cable?.tag ? ` (${conn.cable.tag})` : ''}`;
      li.appendChild(span);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', async e => {
        e.stopPropagation();
        const cable = await chooseCable(comp, target, conn.cable);
        if (cable) {
          conn.cable = cable;
          pushHistory();
          render();
          save();
          selectComponent(comp);
        }
      });
      li.appendChild(edit);
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'Delete';
      del.addEventListener('click', e => {
        e.stopPropagation();
        comp.connections.splice(idx, 1);
        pushHistory();
        render();
        save();
        selectComponent(comp);
      });
      li.appendChild(del);
      li.addEventListener('click', () => {
        selectedConnection = { component: comp, index: idx };
      });
      list.appendChild(li);
    });
    form.appendChild(list);
  }
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.textContent = 'Save';
  form.appendChild(saveBtn);
  const templateBtn = document.createElement('button');
  templateBtn.type = 'button';
  templateBtn.textContent = 'Save as Template';
  templateBtn.addEventListener('click', () => {
    const name = prompt('Template name', comp.label || comp.subtype);
    if (!name) return;
    const fd = new FormData(form);
    const data = {
      subtype: comp.subtype,
      type: getCategory(comp),
      rotation: comp.rotation || 0,
      flipped: !!comp.flipped
    };
    [...baseFields, ...schema].forEach(f => {
      data[f.name] = fd.get(f.name) || '';
    });
    templates.push({ name, component: data });
    saveTemplates();
    renderTemplates();
    showToast('Template saved');
  });
  form.appendChild(templateBtn);
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    modal.classList.remove('show');
    selected = null;
    selection = [];
    selectedConnection = null;
  });
  form.appendChild(cancelBtn);
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Delete Component';
  deleteBtn.addEventListener('click', () => {
    components = components.filter(c => c !== comp);
    components.forEach(c => {
      c.connections = (c.connections || []).filter(conn => conn.target !== comp.id);
    });
    modal.classList.remove('show');
    selected = null;
    selection = [];
    selectedConnection = null;
    pushHistory();
    render();
    save();
  });
  form.appendChild(deleteBtn);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    comp.label = fd.get('label') || '';
    comp.ref = fd.get('ref') || '';
    schema.forEach(f => {
      comp[f.name] = fd.get(f.name) || '';
    });
    pushHistory();
    render();
    save();
    modal.classList.remove('show');
    selected = null;
    selection = [];
    selectedConnection = null;
  });
  modal.appendChild(form);
  modal.classList.add('show');
}

function chooseCable(source, target, existing = null) {
  return new Promise(resolve => {
    const modal = document.getElementById('cable-modal');
    modal.innerHTML = '';
    const form = document.createElement('form');

    const templates = [];
    const seen = new Set();
    getCables().forEach(c => {
      if (!seen.has(c.tag)) {
        templates.push({ ...c });
        seen.add(c.tag);
      }
    });
    components.forEach(c => {
      (c.connections || []).forEach(conn => {
        if (conn.cable && !seen.has(conn.cable.tag)) {
          templates.push({ ...conn.cable });
          seen.add(conn.cable.tag);
        }
      });
    });

    const selLabel = document.createElement('label');
    selLabel.textContent = 'Existing ';
    const select = document.createElement('select');
    const optNew = document.createElement('option');
    optNew.value = '';
    optNew.textContent = '--New Cable--';
    select.appendChild(optNew);
    templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.tag;
      opt.textContent = t.tag;
      select.appendChild(opt);
    });
    selLabel.appendChild(select);
    form.appendChild(selLabel);

    const tagLabel = document.createElement('label');
    tagLabel.textContent = 'Tag ';
    const tagInput = document.createElement('input');
    tagInput.name = 'tag';
    tagLabel.appendChild(tagInput);
    form.appendChild(tagLabel);

    const typeLabel = document.createElement('label');
    typeLabel.textContent = 'Type ';
    const typeInput = document.createElement('input');
    typeInput.name = 'cable_type';
    typeLabel.appendChild(typeInput);
    form.appendChild(typeLabel);

    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color ';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.name = 'color';
    colorLabel.appendChild(colorInput);
    form.appendChild(colorLabel);

    select.addEventListener('change', () => {
      const c = templates.find(t => t.tag === select.value);
      if (c) {
        tagInput.value = c.tag || '';
        typeInput.value = c.cable_type || '';
        colorInput.value = c.color || '#000000';
      } else {
        tagInput.value = '';
        typeInput.value = '';
        colorInput.value = '#000000';
      }
    });

    if (existing) {
      tagInput.value = existing.tag || '';
      typeInput.value = existing.cable_type || '';
      colorInput.value = existing.color || '#000000';
      if (templates.some(t => t.tag === existing.tag)) {
        select.value = existing.tag;
      }
    } else {
      colorInput.value = '#000000';
    }

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.textContent = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      modal.classList.remove('show');
      resolve(null);
    });
    form.appendChild(saveBtn);
    form.appendChild(cancelBtn);

    form.addEventListener('submit', e => {
      e.preventDefault();
      const cable = {
        tag: tagInput.value,
        cable_type: typeInput.value,
        color: colorInput.value
      };
      modal.classList.remove('show');
      resolve({ ...cable, from_tag: source.ref || source.id, to_tag: target.ref || target.id });
    });

    modal.appendChild(form);
    modal.classList.add('show');
  });
}

async function init() {
  await loadManufacturerLibrary();
  await loadComponentLibrary();
  sheets = getOneLine().map((s, i) => ({
    name: s.name || `Sheet ${i + 1}`,
    components: (s.components || []).map(normalizeComponent)
  }));
  if (!sheets.length) sheets = [{ name: 'Sheet 1', components: [] }];

  sheets.forEach(s => {
    s.components.forEach(c => {
      if (!componentMeta[c.subtype]) {
        const icon = typeIcons[c.type] || 'icons/equipment.svg';
        componentMeta[c.subtype] = {
          icon,
          label: c.subtype,
          category: c.type,
          ports: [
            { x: 0, y: 20 },
            { x: 80, y: 20 }
          ]
        };
      }
    });
  });
  rebuildComponentMaps();
  sheets.forEach(s => {
    s.components.forEach(c => {
      (c.connections || []).forEach(conn => {
        const target = s.components.find(t => t.id === conn.target);
        if (target && (conn.sourcePort === undefined || conn.targetPort === undefined)) {
          const [sp, tp] = nearestPorts(c, target);
          conn.sourcePort = sp;
          conn.targetPort = tp;
        }
      });
    });
  });

  // initialize counters from existing labels
  labelCounters = getItem('labelCounters', labelCounters);
  sheets.forEach(s => {
    s.components.forEach(c => {
      const m = (c.label || '').match(/(\d+)$/);
      if (m) {
        const num = Number(m[1]);
        if (!labelCounters[c.subtype] || labelCounters[c.subtype] < num) {
          labelCounters[c.subtype] = num;
        }
      }
    });
  });
  setItem('labelCounters', labelCounters);

  activeSheet = 0;
  components = sheets[0].components;
  history = [JSON.parse(JSON.stringify(components))];
  historyIndex = 0;
  renderSheetTabs();
  render();
  syncSchedules(false);
  validateDiagram();

  const prefixBtn = document.getElementById('prefix-settings-btn');
  if (prefixBtn) prefixBtn.addEventListener('click', editPrefixes);

  const defaultsBtn = document.getElementById('update-defaults-btn');
  if (defaultsBtn) defaultsBtn.addEventListener('click', editManufacturerDefaults);

  const palette = document.getElementById('component-buttons');
  const sectionContainers = {
    panel: document.getElementById('panel-buttons'),
    equipment: document.getElementById('equipment-buttons'),
    load: document.getElementById('load-buttons')
  };
  Object.entries(sectionContainers).forEach(([cat, container]) => {
    const summary = container?.parentElement?.querySelector('summary');
    if (summary) summary.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
  });
  Object.entries(componentTypes).forEach(([type, subs]) => {
    const container = sectionContainers[type] || palette;
    subs.forEach(sub => {
      const meta = componentMeta[sub];
      const btn = document.createElement('button');
      btn.dataset.type = type;
      btn.dataset.subtype = sub;
      btn.title = meta.label;
      btn.innerHTML = `<img src="${meta.icon}" alt="" aria-hidden="true">`;
      btn.addEventListener('click', () => addComponent(sub));
      container.appendChild(btn);
    });
  });
  document.querySelectorAll('#component-buttons details').forEach(det => {
    const key = `palette-${det.id}-open`;
    const stored = localStorage.getItem(key);
    if (stored !== null) det.open = stored === 'true';
    det.addEventListener('toggle', () => {
      localStorage.setItem(key, det.open);
    });
  });
  const paletteSearch = document.getElementById('palette-search');
  paletteSearch.addEventListener('input', () => {
    const term = paletteSearch.value.trim().toLowerCase();
    palette.querySelectorAll('button').forEach(btn => {
      const sub = (btn.dataset.subtype || '').toLowerCase();
      const label = (btn.dataset.label || componentMeta[btn.dataset.subtype]?.label || '').toLowerCase();
      btn.style.display = !term || sub.includes(term) || label.includes(term) ? '' : 'none';
    });
  });
  paletteSearch.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      paletteSearch.value = '';
      paletteSearch.dispatchEvent(new Event('input'));
    }
  });
  loadTemplates();
  renderTemplates();
  document.getElementById('template-export-btn').addEventListener('click', exportTemplates);
  document.getElementById('template-import-btn').addEventListener('click', () => document.getElementById('template-import-input').click());
  document.getElementById('template-import-input').addEventListener('change', importTemplates);
  document.getElementById('connect-btn').addEventListener('click', () => {
    connectMode = true;
    connectSource = null;
  });
  document.getElementById('undo-btn').addEventListener('click', undo);
  document.getElementById('redo-btn').addEventListener('click', redo);
  document.getElementById('align-left-btn').addEventListener('click', () => alignSelection('left'));
  document.getElementById('align-right-btn').addEventListener('click', () => alignSelection('right'));
  document.getElementById('align-top-btn').addEventListener('click', () => alignSelection('top'));
  document.getElementById('align-bottom-btn').addEventListener('click', () => alignSelection('bottom'));
  document.getElementById('distribute-h-btn').addEventListener('click', () => distributeSelection('h'));
  document.getElementById('distribute-v-btn').addEventListener('click', () => distributeSelection('v'));
  document.getElementById('export-btn').addEventListener('click', exportDiagram);
  document.getElementById('export-pdf-btn').addEventListener('click', exportPDF);
  document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-input').click());
  document.getElementById('import-input').addEventListener('change', importDiagram);
  document.getElementById('add-sheet-btn').addEventListener('click', addSheet);
  document.getElementById('rename-sheet-btn').addEventListener('click', renameSheet);
  document.getElementById('delete-sheet-btn').addEventListener('click', deleteSheet);
  document.getElementById('validate-btn').addEventListener('click', () => {
    const issues = validateDiagram();
    const modal = document.getElementById('validation-modal');
    modal.innerHTML = '';
    const header = document.createElement('h3');
    header.textContent = issues.length ? 'Validation Issues' : 'No issues found';
    modal.appendChild(header);
    if (issues.length) {
      const list = document.createElement('ul');
      issues.forEach(issue => {
        const li = document.createElement('li');
        li.textContent = issue.message;
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => {
          modal.classList.remove('show');
          focusComponent(issue.component);
        });
        list.appendChild(li);
      });
      modal.appendChild(list);
    }
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => modal.classList.remove('show'));
    modal.appendChild(closeBtn);
    modal.classList.add('show');
  });

  const gridToggle = document.getElementById('grid-toggle');
  const gridSizeInput = document.getElementById('grid-size');
  const gridPattern = document.getElementById('grid');
  const gridPath = gridPattern.querySelector('path');
  gridEnabled = gridToggle.checked;
  gridSizeInput.value = gridSize;
  gridPattern.setAttribute('width', gridSize);
  gridPattern.setAttribute('height', gridSize);
  gridPath.setAttribute('d', `M${gridSize} 0 L0 0 0 ${gridSize}`);
  document.getElementById('grid-bg').style.display = gridEnabled ? 'block' : 'none';
  gridToggle.addEventListener('change', e => {
    gridEnabled = e.target.checked;
    document.getElementById('grid-bg').style.display = gridEnabled ? 'block' : 'none';
    render();
  });
  gridSizeInput.addEventListener('change', e => {
    gridSize = Number(e.target.value) || 20;
    gridPattern.setAttribute('width', gridSize);
    gridPattern.setAttribute('height', gridSize);
    gridPath.setAttribute('d', `M${gridSize} 0 L0 0 0 ${gridSize}`);
    setItem('gridSize', gridSize);
    render();
  });

  const svg = document.getElementById('diagram');
  const menu = document.getElementById('context-menu');
  svg.addEventListener('mousedown', e => {
    const g = e.target.closest('.component');
    if (!g) {
      dragOffset = null;
      return;
    }
    const comp = components.find(c => c.id === g.dataset.id);
    if (!comp) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (selection.includes(comp)) {
        selection = selection.filter(c => c !== comp);
      } else {
        selection.push(comp);
      }
    } else if (!selection.includes(comp)) {
      selection = [comp];
    }
    selected = comp;
    dragOffset = selection.map(c => ({ comp: c, dx: e.offsetX - c.x, dy: e.offsetY - c.y }));
    render();
  });
  svg.addEventListener('mousemove', e => {
    cursorPos = { x: e.offsetX, y: e.offsetY };
  });
  svg.addEventListener('mousemove', e => {
    if (!dragOffset || !dragOffset.length) return;
    dragOffset.forEach(off => {
      let x = e.offsetX - off.dx;
      let y = e.offsetY - off.dy;
      if (gridEnabled) {
        x = Math.round(x / gridSize) * gridSize;
        y = Math.round(y / gridSize) * gridSize;
      }
      off.comp.x = x;
      off.comp.y = y;
    });
    render();
  });
  svg.addEventListener('mouseup', () => {
    if (dragOffset && dragOffset.length) {
      dragOffset = null;
      pushHistory();
      render();
      save();
    } else {
      dragOffset = null;
    }
  });
  svg.addEventListener('click', async e => {
    const g = e.target.closest('.component');
    if (!g) {
      selection = [];
      selected = null;
      selectedConnection = null;
      render();
      return;
    }
    const comp = components.find(c => c.id === g.dataset.id);
    if (!comp) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      return;
    }
    selection = [comp];
    selected = comp;
    selectedConnection = null;
    render();
    if (connectMode) {
      if (!connectSource) {
        connectSource = comp;
      } else if (connectSource !== comp) {
        const cable = await chooseCable(connectSource, comp);
        if (cable) {
          const [sPort, tPort] = nearestPorts(connectSource, comp);
          connectSource.connections.push({ target: comp.id, cable, sourcePort: sPort, targetPort: tPort });
          pushHistory();
          render();
          save();
        }
        connectMode = false;
        connectSource = null;
      }
    }
  });

  svg.addEventListener('dblclick', e => {
    const g = e.target.closest('.component');
    if (!g) return;
    const comp = components.find(c => c.id === g.dataset.id);
    if (!comp) return;
    selectComponent(comp);
  });

  svg.addEventListener('contextmenu', e => {
    e.preventDefault();
    const g = e.target.closest('.component');
    contextTarget = g ? components.find(c => c.id === g.dataset.id) : null;
    const compItems = menu.querySelectorAll('[data-context="component"]');
    const canvasItems = menu.querySelectorAll('[data-context="canvas"]');
    compItems.forEach(li => li.style.display = contextTarget ? 'block' : 'none');
    canvasItems.forEach(li => li.style.display = contextTarget ? 'none' : 'block');
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    menu.style.display = 'block';
  });

  menu.addEventListener('click', e => {
    const action = e.target.dataset.action;
    if (!action) return;
    e.stopPropagation();
    if (action === 'edit' && contextTarget) {
      selectComponent(contextTarget);
    } else if (action === 'delete' && contextTarget) {
      components = components.filter(c => c !== contextTarget);
      components.forEach(c => {
        c.connections = (c.connections || []).filter(conn => conn.target !== contextTarget.id);
      });
      selection = [];
      selected = null;
      selectedConnection = null;
      pushHistory();
      render();
      save();
      const modal = document.getElementById('prop-modal');
      if (modal) modal.classList.remove('show');
    } else if (action === 'duplicate' && contextTarget) {
      const copy = {
        ...JSON.parse(JSON.stringify(contextTarget)),
        id: 'n' + Date.now(),
        x: contextTarget.x + gridSize,
        y: contextTarget.y + gridSize,
        connections: []
      };
      components.push(copy);
      selection = [copy];
      selected = copy;
      pushHistory();
      render();
      save();
    } else if (action === 'rotate' && contextTarget) {
      contextTarget.rotation = ((contextTarget.rotation || 0) + 90) % 360;
      pushHistory();
      render();
      save();
    } else if (action === 'paste') {
      if (clipboard.length) {
        const base = Date.now();
        const idMap = {};
        const newComps = clipboard.map((c, idx) => {
          const newId = 'n' + (base + idx);
          idMap[c.id] = newId;
          return {
            ...JSON.parse(JSON.stringify(c)),
            id: newId,
            x: c.x + gridSize,
            y: c.y + gridSize,
            connections: (c.connections || []).map(conn => ({ ...conn }))
          };
        });
        newComps.forEach(c => {
          c.connections = (c.connections || [])
            .filter(conn => idMap[conn.target])
            .map(conn => ({ ...conn, target: idMap[conn.target] }));
        });
        components.push(...newComps);
        selection = newComps;
        selected = newComps[0] || null;
        pushHistory();
        render();
        save();
      }
    }
    menu.style.display = 'none';
  });

  document.addEventListener('click', e => {
    if (!menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') menu.style.display = 'none';
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Delete') return;
    const target = e.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))) {
      return;
    }
    if (selectedConnection) {
      const { component, index } = selectedConnection;
      component.connections.splice(index, 1);
      selectedConnection = null;
      pushHistory();
      render();
      save();
      if (selected) selectComponent(selected);
      return;
    }
    if (selection.length) {
      const ids = new Set(selection.map(c => c.id));
      components = components.filter(c => !ids.has(c.id));
      components.forEach(c => {
        c.connections = (c.connections || []).filter(conn => !ids.has(conn.target));
      });
      selection = [];
      selected = null;
      selectedConnection = null;
      pushHistory();
      render();
      save();
      const modal = document.getElementById('prop-modal');
      if (modal) modal.classList.remove('show');
    }
  });

  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    const target = e.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))) {
      return;
    }
    const key = e.key.toLowerCase();
    if (mod && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    } else if (mod && key === 'c') {
      e.preventDefault();
      clipboard = selection.map(c => JSON.parse(JSON.stringify(c)));
    } else if (mod && key === 'v') {
      e.preventDefault();
      if (clipboard.length) {
        const base = Date.now();
        const idMap = {};
        const newComps = clipboard.map((c, idx) => {
          const newId = 'n' + (base + idx);
          idMap[c.id] = newId;
          return {
            ...JSON.parse(JSON.stringify(c)),
            id: newId,
            x: c.x + gridSize,
            y: c.y + gridSize,
            connections: (c.connections || []).map(conn => ({ ...conn }))
          };
        });
        newComps.forEach(c => {
          c.connections = (c.connections || [])
            .filter(conn => idMap[conn.target])
            .map(conn => ({ ...conn, target: idMap[conn.target] }));
        });
        components.push(...newComps);
        selection = newComps;
        selected = newComps[0] || null;
        pushHistory();
        render();
        save();
      }
    } else if (!mod && key === 'r') {
      e.preventDefault();
      const targets = selection.length ? selection : selected ? [selected] : [];
      if (targets.length) {
        if (e.shiftKey) {
          targets.forEach(c => { c.flipped = !c.flipped; });
        } else {
          targets.forEach(c => { c.rotation = ((c.rotation || 0) + 90) % 360; });
        }
        pushHistory();
        render();
        save();
      }
    }
  });

  initSettings();
  initDarkMode();
  initCompactMode();
  initNavToggle();
}

function getCategory(c) {
  return c.type || subtypeCategory[c.subtype];
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function validateDiagram() {
  validationIssues = [];
  const svg = document.getElementById('diagram');
  if (!svg) return validationIssues;
  // reset any previous markers
  svg.querySelectorAll('g.component').forEach(g => {
    g.classList.remove('invalid');
    const comp = components.find(c => c.id === g.dataset.id);
    if (!comp) return;
    const tip = [];
    if (comp.label) tip.push(`Label: ${comp.label}`);
    if (comp.voltage) tip.push(`Voltage: ${comp.voltage}`);
    if (comp.rating) tip.push(`Rating: ${comp.rating}`);
    g.setAttribute('data-tooltip', tip.join('\n'));
  });

  const labelMap = new Map();
  const refMap = new Map();
  const inbound = new Map();
  components.forEach(c => {
    const labelKey = (c.label || '').trim().toUpperCase();
    if (labelKey) labelMap.set(labelKey, (labelMap.get(labelKey) || 0) + 1);
    if (c.ref) refMap.set(c.ref, (refMap.get(c.ref) || 0) + 1);
    inbound.set(c.id, 0);
  });

  components.forEach(c => {
    (c.connections || []).forEach(conn => {
      inbound.set(conn.target, (inbound.get(conn.target) || 0) + 1);
      const target = components.find(t => t.id === conn.target);
      if (target && c.voltage && target.voltage && c.voltage !== target.voltage) {
        validationIssues.push({
          component: c.id,
          message: `Voltage mismatch with ${target.label || target.subtype || target.id}`
        });
        validationIssues.push({
          component: target.id,
          message: `Voltage mismatch with ${c.label || c.subtype || c.id}`
        });
      }
    });
  });

  components.forEach(c => {
    if ((c.connections || []).length + (inbound.get(c.id) || 0) === 0) {
      validationIssues.push({ component: c.id, message: 'Unconnected component' });
    }
  });

  labelMap.forEach((count, label) => {
    if (count > 1) {
      components.filter(c => (c.label || '').trim().toUpperCase() === label).forEach(c => {
        validationIssues.push({ component: c.id, message: `Duplicate label "${c.label}"` });
      });
    }
  });

  refMap.forEach((count, ref) => {
    if (count > 1) {
      components.filter(c => c.ref === ref).forEach(c => {
        validationIssues.push({ component: c.id, message: `Duplicate ref "${ref}"` });
      });
    }
  });

  const byComp = {};
  validationIssues.forEach(issue => {
    if (!byComp[issue.component]) byComp[issue.component] = [];
    byComp[issue.component].push(issue.message);
  });

  Object.entries(byComp).forEach(([id, msgs]) => {
    const g = svg.querySelector(`g.component[data-id="${id}"]`);
    if (!g) return;
    g.classList.add('invalid');
    const existing = g.getAttribute('data-tooltip');
    const tip = existing ? existing + '\n' + msgs.join('\n') : msgs.join('\n');
    g.setAttribute('data-tooltip', tip);
  });

  showToast(validationIssues.length ? `Validation found ${validationIssues.length} issue${validationIssues.length === 1 ? '' : 's'}` : 'Diagram valid');
  return validationIssues;
}

function focusComponent(id) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  selection = [comp];
  selected = comp;
  selectedConnection = null;
  render();
  const svg = document.getElementById('diagram');
  const g = svg.querySelector(`g.component[data-id="${id}"]`);
  if (g && g.scrollIntoView) g.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
}

function syncSchedules(notify = true) {
  const all = sheets.flatMap(s => s.components);
  const mapFields = c => ({
    id: c.ref || c.id,
    description: c.label,
    manufacturer: c.manufacturer || '',
    model: c.model || '',
    phases: c.phases || '',
    notes: c.notes || ''
  });
  const equipment = all
    .filter(c => getCategory(c) === 'equipment')
    .map(mapFields);
  const panels = all
    .filter(c => getCategory(c) === 'panel')
    .map(mapFields);
  const loads = all
    .filter(c => getCategory(c) === 'load')
    .map(mapFields);
  setEquipment(equipment);
  setPanels(panels);
  setLoads(loads);
  const cables = getCables();
  all.forEach(c => {
    (c.connections || []).forEach(conn => {
      if (!conn.cable) return;
      const target = all.find(t => t.id === conn.target);
      const spec = { ...conn.cable, from_tag: c.ref || c.id, to_tag: target?.ref || conn.target };
      const idx = cables.findIndex(cb => cb.tag === spec.tag);
      if (idx >= 0) {
        cables[idx] = { ...cables[idx], ...spec };
      } else {
        cables.push(spec);
      }
    });
  });
  setCables(cables);
  if (notify) showToast('Schedules synced');
}

function exportDiagram() {
  save(false);
  function extractSchedules(comps) {
    const mapFields = c => ({
      id: c.ref || c.id,
      description: c.label,
      manufacturer: c.manufacturer || '',
      model: c.model || '',
      phases: c.phases || '',
      notes: c.notes || ''
    });
    const equipment = comps
      .filter(c => getCategory(c) === 'equipment')
      .map(mapFields);
    const panels = comps
      .filter(c => getCategory(c) === 'panel')
      .map(mapFields);
    const loads = comps
      .filter(c => getCategory(c) === 'load')
      .map(mapFields);
    const cables = [];
    comps.forEach(c => {
      (c.connections || []).forEach(conn => {
        if (!conn.cable) return;
        const target = comps.find(t => t.id === conn.target);
        cables.push({
          ...conn.cable,
          from_tag: c.ref || c.id,
          to_tag: target?.ref || conn.target
        });
      });
    });
    return { equipment, panels, loads, cables };
  }
  const data = {
    sheets: sheets.map(s => {
      const comps = s.components.map(c => ({
        ...c,
        rotation: c.rotation || 0,
        flipped: !!c.flipped
      }));
      return { name: s.name, components: comps, schedules: extractSchedules(comps) };
    })
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'oneline.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function serializeDiagram() {
  const svg = document.getElementById('diagram');
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svg);
  if (!source.match(/^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/)) {
    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return source;
}

async function exportPDF() {
  const original = activeSheet;
  const svgEl = document.getElementById('diagram');
  const width = svgEl.viewBox.baseVal?.width || svgEl.width.baseVal.value;
  const height = svgEl.viewBox.baseVal?.height || svgEl.height.baseVal.value;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: width > height ? 'landscape' : 'portrait', unit: 'pt', format: [width, height] });
  for (let i = 0; i < sheets.length; i++) {
    loadSheet(i);
    const svgString = serializeDiagram();
    const svg = new DOMParser().parseFromString(svgString, 'image/svg+xml').documentElement;
    await window.svg2pdf(svg, pdf, { x: 0, y: 0, width, height });
    if (i < sheets.length - 1) pdf.addPage([width, height]);
  }
  loadSheet(original);
  pdf.save('oneline.pdf');
}

async function importDiagram(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    let imported = [];
    if (Array.isArray(data)) {
      imported = [{ name: 'Sheet 1', components: data }];
    } else if (Array.isArray(data.sheets)) {
      imported = data.sheets;
    }
    if (imported.length) {
      sheets = imported.map((s, i) => ({
        name: s.name || `Sheet ${i + 1}`,
        components: (s.components || []).map(normalizeComponent)
      }));
      loadSheet(0);
      renderSheetTabs();
      save();
    }
  } catch (err) {
    console.error('Failed to import diagram', err);
  }
  e.target.value = '';
}

window.addEventListener('DOMContentLoaded', init);

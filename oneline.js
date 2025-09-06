import { getOneLine, setOneLine, setEquipment, setPanels, setLoads, getCables, setCables } from './dataStore.mjs';

const componentMeta = {
  MLO: { icon: 'icons/MLO.svg', label: 'MLO', category: 'panel' },
  MCC: { icon: 'icons/MCC.svg', label: 'MCC', category: 'panel' },
  Transformer: { icon: 'icons/Transformer.svg', label: 'Transformer', category: 'equipment' },
  Switchgear: { icon: 'icons/Switchgear.svg', label: 'Switchgear', category: 'equipment' },
  Load: { icon: 'icons/Load.svg', label: 'Load', category: 'load' }
};

const propSchemas = {
  Transformer: [
    { name: 'voltage', label: 'Voltage', type: 'number' },
    { name: 'rating', label: 'Rating', type: 'number' }
  ],
  Switchgear: [{ name: 'voltage', label: 'Voltage', type: 'number' }],
  Load: [{ name: 'voltage', label: 'Voltage', type: 'number' }],
  MLO: [{ name: 'voltage', label: 'Voltage', type: 'number' }],
  MCC: [{ name: 'voltage', label: 'Voltage', type: 'number' }]
};

const subtypeCategory = {};
const componentTypes = {};
Object.entries(componentMeta).forEach(([sub, meta]) => {
  subtypeCategory[sub] = meta.category;
  if (!componentTypes[meta.category]) componentTypes[meta.category] = [];
  componentTypes[meta.category].push(sub);
});

const svgNS = 'http://www.w3.org/2000/svg';
let components = [];
let selection = [];
let selected = null;
let dragOffset = null;
let clipboard = [];
let contextTarget = null;
let connectMode = false;
let connectSource = null;
let selectedConnection = null;
const gridSize = 20;
let gridEnabled = true;
let history = [];
let historyIndex = -1;
const compWidth = 80;
const compHeight = 40;

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

const cableColors = {
  Power: '#f00',
  Control: '#00f',
  Signal: '#0a0'
};

function render() {
  const svg = document.getElementById('diagram');
  svg.querySelectorAll('g.component, .connection, .conn-label').forEach(el => el.remove());
  if (gridEnabled) {
    components.forEach(c => {
      c.x = Math.round(c.x / gridSize) * gridSize;
      c.y = Math.round(c.y / gridSize) * gridSize;
    });
  }

  const startFor = c => ({ x: c.x + compWidth / 2, y: c.y + compHeight / 2 });

  function routeConnection(src, tgt) {
    const start = startFor(src);
    const end = startFor(tgt);

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
      const pts = routeConnection(c, target);
      const poly = document.createElementNS(svgNS, 'polyline');
      poly.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
      const stroke = cableColors[conn.cable?.cable_type] || conn.cable?.color || '#000';
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
    const img = document.createElementNS(svgNS, 'image');
    img.setAttribute('x', c.x);
    img.setAttribute('y', c.y);
    img.setAttribute('width', compWidth);
    img.setAttribute('height', compHeight);
    const meta = componentMeta[c.subtype] || componentMeta[c.type] || {};
    if (meta.icon) img.setAttribute('href', meta.icon);
    if (c.rot) {
      const cx = c.x + compWidth / 2;
      const cy = c.y + compHeight / 2;
      img.setAttribute('transform', `rotate(${c.rot}, ${cx}, ${cy})`);
    }
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', c.x + compWidth / 2);
    text.setAttribute('y', c.y + compHeight + 15);
    text.setAttribute('text-anchor', 'middle');
    text.textContent = c.label || meta.label || c.subtype || c.type;
    g.appendChild(img);
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
  });
}

function save(notify = true) {
  setOneLine(components);
  syncSchedules(notify);
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
  components.push({ id, type: meta.category, subtype, x, y, label: meta.label, ref: '', connections: [] });
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
    const input = document.createElement('input');
    input.type = f.type || 'text';
    input.name = f.name;
    input.value = comp[f.name] || '';
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

function init() {
  components = getOneLine().map(c => ({
    ...c,
    connections: (c.connections || []).map(conn => typeof conn === 'string' ? { target: conn } : conn)
  }));
  pushHistory();
  render();
  syncSchedules(false);

  const palette = document.getElementById('component-buttons');
  Object.entries(componentTypes).forEach(([type, subs]) => {
    subs.forEach(sub => {
      const meta = componentMeta[sub];
      const btn = document.createElement('button');
      btn.dataset.type = type;
      btn.dataset.subtype = sub;
      btn.title = meta.label;
      btn.innerHTML = `<img src="${meta.icon}" alt="" aria-hidden="true">`;
      btn.addEventListener('click', () => addComponent(sub));
      palette.appendChild(btn);
    });
  });
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
  document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-input').click());
  document.getElementById('import-input').addEventListener('change', importDiagram);

  const gridToggle = document.getElementById('grid-toggle');
  gridEnabled = gridToggle.checked;
  document.getElementById('grid-bg').style.display = gridEnabled ? 'block' : 'none';
  gridToggle.addEventListener('change', e => {
    gridEnabled = e.target.checked;
    document.getElementById('grid-bg').style.display = gridEnabled ? 'block' : 'none';
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
          connectSource.connections.push({ target: comp.id, cable });
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
      contextTarget.rot = ((contextTarget.rot || 0) + 90) % 360;
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

function syncSchedules(notify = true) {
  const equipment = components
    .filter(c => getCategory(c) === 'equipment')
    .map(c => ({ id: c.ref || c.id, description: c.label }));
  const panels = components
    .filter(c => getCategory(c) === 'panel')
    .map(c => ({ id: c.ref || c.id, description: c.label }));
  const loads = components
    .filter(c => getCategory(c) === 'load')
    .map(c => ({ id: c.ref || c.id, description: c.label }));
  setEquipment(equipment);
  setPanels(panels);
  setLoads(loads);
  const cables = getCables();
  components.forEach(c => {
    (c.connections || []).forEach(conn => {
      if (!conn.cable) return;
      const target = components.find(t => t.id === conn.target);
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
  const blob = new Blob([JSON.stringify(components, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'oneline.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importDiagram(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      components = data.map(c => ({
        ...c,
        connections: (c.connections || []).map(conn => typeof conn === 'string' ? { target: conn } : conn)
      }));
      pushHistory();
      selection = [];
      selected = null;
      selectedConnection = null;
      render();
      save();
    }
  } catch (err) {
    console.error('Failed to import diagram', err);
  }
  e.target.value = '';
}

window.addEventListener('DOMContentLoaded', init);

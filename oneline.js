import { getOneLine, setOneLine, setEquipment, setPanels, setLoads, getCables, setCables } from './dataStore.mjs';

const componentTypes = {
  panel: ['MLO', 'MCC'],
  equipment: ['Transformer', 'Switchgear'],
  load: ['Load']
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
Object.entries(componentTypes).forEach(([type, subs]) => {
  subs.forEach(sub => {
    subtypeCategory[sub] = type;
  });
});

const svgNS = 'http://www.w3.org/2000/svg';
let components = [];
let selected = null;
let dragOffset = null;
let connectMode = false;
let connectSource = null;
let selectedConnection = null;
const gridSize = 20;
let gridEnabled = true;
let history = [];
let historyIndex = -1;

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
  svg.querySelectorAll('g.component, line.connection').forEach(el => el.remove());
  if (gridEnabled) {
    components.forEach(c => {
      c.x = Math.round(c.x / gridSize) * gridSize;
      c.y = Math.round(c.y / gridSize) * gridSize;
    });
  }
  // draw connections
  components.forEach(c => {
    (c.connections || []).forEach((conn, idx) => {
      const target = components.find(t => t.id === conn.target);
      if (!target) return;
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', c.x + 40);
      line.setAttribute('y1', c.y + 20);
      line.setAttribute('x2', target.x + 40);
      line.setAttribute('y2', target.y + 20);
      const stroke = cableColors[conn.cable?.cable_type] || conn.cable?.color || '#000';
      line.setAttribute('stroke', stroke);
      line.classList.add('connection');
      line.addEventListener('click', e => {
        e.stopPropagation();
        selected = null;
        selectedConnection = { component: c, index: idx };
      });
      svg.appendChild(line);
    });
  });
  // draw nodes
  components.forEach(c => {
    const g = document.createElementNS(svgNS, 'g');
    g.dataset.id = c.id;
    g.classList.add('component');
    const img = document.createElementNS(svgNS, 'image');
    img.setAttribute('x', c.x);
    img.setAttribute('y', c.y);
    img.setAttribute('width', 80);
    img.setAttribute('height', 40);
    img.setAttribute('href', `icons/${c.subtype || c.type}.svg`);
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', c.x + 40);
    text.setAttribute('y', c.y + 55);
    text.setAttribute('text-anchor', 'middle');
    text.textContent = c.label || c.subtype || c.type;
    g.appendChild(img);
    g.appendChild(text);
    svg.appendChild(g);
  });
}

function save() {
  setOneLine(components);
}

function addComponent({ type, subtype }) {
  const id = 'n' + Date.now();
  let x = 20, y = 20;
  if (gridEnabled) {
    x = Math.round(x / gridSize) * gridSize;
    y = Math.round(y / gridSize) * gridSize;
  }
  components.push({ id, type, subtype, x, y, label: subtype, ref: '', connections: [] });
  pushHistory();
  render();
  save();
}

function selectComponent(comp) {
  selected = comp;
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
    modal.style.display = 'none';
    selected = null;
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
    modal.style.display = 'none';
    selected = null;
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
    modal.style.display = 'none';
    selected = null;
    selectedConnection = null;
  });
  modal.appendChild(form);
  modal.style.display = 'block';
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
      modal.style.display = 'none';
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
      modal.style.display = 'none';
      resolve({ ...cable, from_tag: source.ref || source.id, to_tag: target.ref || target.id });
    });

    modal.appendChild(form);
    modal.style.display = 'block';
  });
}

function init() {
  components = getOneLine().map(c => ({
    ...c,
    connections: (c.connections || []).map(conn => typeof conn === 'string' ? { target: conn } : conn)
  }));
  pushHistory();
  render();

  const palette = document.getElementById('component-buttons');
  Object.entries(componentTypes).forEach(([type, subs]) => {
    subs.forEach(sub => {
      const btn = document.createElement('button');
      btn.dataset.type = type;
      btn.dataset.subtype = sub;
      btn.innerHTML = `<img src="icons/${sub}.svg" alt="" aria-hidden="true"> ${sub}`;
      btn.addEventListener('click', () => addComponent({ type, subtype: sub }));
      palette.appendChild(btn);
    });
  });
  document.getElementById('connect-btn').addEventListener('click', () => {
    connectMode = true;
    connectSource = null;
  });
  document.getElementById('undo-btn').addEventListener('click', undo);
  document.getElementById('redo-btn').addEventListener('click', redo);
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
  svg.addEventListener('mousedown', e => {
    const g = e.target.closest('.component');
    if (!g) return;
    const comp = components.find(c => c.id === g.dataset.id);
    if (!comp) return;
    selected = comp;
    dragOffset = { x: e.offsetX - comp.x, y: e.offsetY - comp.y };
  });
  svg.addEventListener('mousemove', e => {
    if (!dragOffset || !selected) return;
    let x = e.offsetX - dragOffset.x;
    let y = e.offsetY - dragOffset.y;
    if (gridEnabled) {
      x = Math.round(x / gridSize) * gridSize;
      y = Math.round(y / gridSize) * gridSize;
    }
    selected.x = x;
    selected.y = y;
    render();
  });
  svg.addEventListener('mouseup', () => {
    if (dragOffset) {
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
      selected = null;
      selectedConnection = null;
      return;
    }
    const comp = components.find(c => c.id === g.dataset.id);
    if (!comp) return;
    selected = comp;
    selectedConnection = null;
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
    if (selected) {
      const comp = selected;
      components = components.filter(c => c !== comp);
      components.forEach(c => {
        c.connections = (c.connections || []).filter(conn => conn.target !== comp.id);
      });
      selected = null;
      selectedConnection = null;
      pushHistory();
      render();
      save();
      const modal = document.getElementById('prop-modal');
      if (modal) modal.style.display = 'none';
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

function exportDiagram() {
  save();
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
      render();
      save();
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
    }
  } catch (err) {
    console.error('Failed to import diagram', err);
  }
  e.target.value = '';
}

window.addEventListener('DOMContentLoaded', init);

import { getOneLine, setOneLine, setEquipment, setPanels, setLoads } from './dataStore.mjs';

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
const gridSize = 20;
let gridEnabled = true;

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
    (c.connections || []).forEach(tid => {
      const target = components.find(t => t.id === tid);
      if (!target) return;
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', c.x + 40);
      line.setAttribute('y1', c.y + 20);
      line.setAttribute('x2', target.x + 40);
      line.setAttribute('y2', target.y + 20);
      line.setAttribute('stroke', '#000');
      line.classList.add('connection');
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
  save();
  render();
}

function selectComponent(comp) {
  selected = comp;
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
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.textContent = 'Save';
  form.appendChild(saveBtn);
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  form.appendChild(cancelBtn);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    comp.label = fd.get('label') || '';
    comp.ref = fd.get('ref') || '';
    schema.forEach(f => {
      comp[f.name] = fd.get(f.name) || '';
    });
    render();
    save();
    modal.style.display = 'none';
    selected = null;
  });
  modal.appendChild(form);
  modal.style.display = 'block';
}

function init() {
  components = getOneLine();
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
    dragOffset = null;
    selected = null;
    save();
  });
  svg.addEventListener('click', e => {
    const g = e.target.closest('.component');
    if (!g) return;
    const comp = components.find(c => c.id === g.dataset.id);
    if (!comp) return;
    if (connectMode) {
      if (!connectSource) {
        connectSource = comp;
      } else if (connectSource !== comp) {
        connectSource.connections.push(comp.id);
        connectMode = false;
        connectSource = null;
        save();
        render();
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
      components = data;
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

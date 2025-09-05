import { getOneLine, setOneLine, setEquipment, setPanels, setLoads } from './dataStore.mjs';

const svgNS = 'http://www.w3.org/2000/svg';
let components = [];
let selected = null;
let dragOffset = null;
let connectMode = false;
let connectSource = null;

function render() {
  const svg = document.getElementById('diagram');
  svg.innerHTML = '';
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
      svg.appendChild(line);
    });
  });
  // draw nodes
  components.forEach(c => {
    const g = document.createElementNS(svgNS, 'g');
    g.dataset.id = c.id;
    g.classList.add('component');
    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', c.x);
    rect.setAttribute('y', c.y);
    rect.setAttribute('width', 80);
    rect.setAttribute('height', 40);
    rect.setAttribute('rx', c.type === 'panel' ? 10 : 2);
    rect.setAttribute('fill', '#fff');
    rect.setAttribute('stroke', '#000');
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', c.x + 40);
    text.setAttribute('y', c.y + 25);
    text.setAttribute('text-anchor', 'middle');
    text.textContent = c.label || c.type;
    g.appendChild(rect);
    g.appendChild(text);
    svg.appendChild(g);
  });
}

function save() {
  setOneLine(components);
}

function addComponent(type) {
  const id = 'n' + Date.now();
  components.push({ id, type, x: 20, y: 20, label: type, ref: '', connections: [] });
  save();
  render();
}

function selectComponent(comp) {
  selected = comp;
  const form = document.getElementById('prop-form');
  form.style.display = 'block';
  document.getElementById('prop-label').value = comp.label || '';
  document.getElementById('prop-ref').value = comp.ref || '';
}

function init() {
  components = getOneLine();
  render();

  document.querySelectorAll('#palette button[data-type]').forEach(btn => {
    btn.addEventListener('click', () => addComponent(btn.dataset.type));
  });
  document.getElementById('connect-btn').addEventListener('click', () => {
    connectMode = true;
    connectSource = null;
  });
  document.getElementById('export-btn').addEventListener('click', exportDiagram);
  document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-input').click());
  document.getElementById('import-input').addEventListener('change', importDiagram);

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
    selected.x = e.offsetX - dragOffset.x;
    selected.y = e.offsetY - dragOffset.y;
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
      return;
    }
    selectComponent(comp);
  });

  document.getElementById('prop-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!selected) return;
    selected.label = document.getElementById('prop-label').value;
    selected.ref = document.getElementById('prop-ref').value;
    render();
    save();
    document.getElementById('prop-form').style.display = 'none';
  });

  initSettings();
  initDarkMode();
  initCompactMode();
  initNavToggle();
}

function exportDiagram() {
  save();
  const equipment = components.filter(c => c.type === 'equipment').map(c => ({ id: c.ref || c.id, description: c.label }));
  const panels = components.filter(c => c.type === 'panel').map(c => ({ id: c.ref || c.id, description: c.label }));
  const loads = components.filter(c => c.type === 'load').map(c => ({ id: c.ref || c.id, description: c.label }));
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
      const equipment = components.filter(c => c.type === 'equipment').map(c => ({ id: c.ref || c.id, description: c.label }));
      const panels = components.filter(c => c.type === 'panel').map(c => ({ id: c.ref || c.id, description: c.label }));
      const loads = components.filter(c => c.type === 'load').map(c => ({ id: c.ref || c.id, description: c.label }));
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

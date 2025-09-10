// ---- Inline E2E helpers (no external import) ----
const E2E = new URLSearchParams(location.search).has('e2e');

function e2eOpenDetails() {
  if (!new URLSearchParams(location.search).has('e2e')) return;
  document.querySelectorAll('details').forEach(d => { d.open = true; });
}

function ensureReadyBeacon(attrName, id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;z-index:2147483647;';
    document.body.appendChild(el);
  }
  el.setAttribute(attrName, '1');
}

function setReadyWhen(selector, attrName, id, timeoutMs = 25000) {
  const start = performance.now();
  const poll = () => {
    const el = document.querySelector(selector);
    const visible = !!el && !!(el.offsetParent || el.getClientRects().length);
    if (visible) return ensureReadyBeacon(attrName, id);
    if (performance.now() - start > timeoutMs) return;
    setTimeout(poll, 50);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', poll, { once: true });
  } else {
    poll();
  }
}

function suppressResumeIfE2E() {
  if (!E2E) return;
  // Do NOT clear storage by default; only when ?e2e_reset=1 is present.
  const qs = new URLSearchParams(location.search);
  const shouldClear = qs.has('e2e_reset');
  if (shouldClear) {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
  }
  // Do NOT auto-click resume buttons. Let tests click #resume-no-btn.
}

// Show resume modal in E2E so tests can click the No button
function forceShowResumeIfE2E() {
  const E2E = new URLSearchParams(location.search).has('e2e');
  if (!E2E) return;
  const modal = document.getElementById('resume-modal');
  const noBtn = document.getElementById('resume-no-btn');
  if (modal) {
    modal.removeAttribute('hidden');
    modal.classList.remove('hidden', 'is-hidden', 'invisible');
    modal.style.display = 'block';
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
  }
  if (noBtn) {
    noBtn.style.display = 'inline-block';
    noBtn.disabled = false;
  }
}

window.E2E = E2E;

import { getOneLine, setOneLine, setEquipment, setPanels, setLoads, getCables, setCables, addCable, addRaceway, getItem, setItem, getStudies, setStudies, on, getCurrentScenario, switchScenario, STORAGE_KEYS, loadProject, saveProject } from './dataStore.mjs';
import { runLoadFlow } from './analysis/loadFlow.js';
import { runShortCircuit } from './analysis/shortCircuit.mjs';
import { runArcFlash } from './analysis/arcFlash.mjs';
import { runHarmonics } from './analysis/harmonics.js';
import { runMotorStart } from './analysis/motorStart.js';
import { runReliability } from './analysis/reliability.js';
import { generateArcFlashReport } from './reports/arcFlashReport.mjs';
import { exportAllReports } from './reports/exportAll.mjs';
import { sizeConductor } from './sizing.js';
import { runValidation } from './validation/rules.js';
import { exportPDF } from './exporters/pdf.js';
import { exportDXF, exportDWG } from './exporters/dxf.js';
import './site.js';

let componentMeta = {};

const baseHref = document.querySelector('base')?.href || new URL('.', window.location.href).href;
const asset = path => new URL(path, baseHref).href;

const projectId = typeof window !== 'undefined' ? (window.currentProjectId || 'default') : undefined;
if (projectId) {
  loadProject(projectId);
  [STORAGE_KEYS.oneLine, STORAGE_KEYS.equipment, STORAGE_KEYS.panels, STORAGE_KEYS.loads, STORAGE_KEYS.cables, STORAGE_KEYS.trays, STORAGE_KEYS.conduits, STORAGE_KEYS.ductbanks].forEach(k => {
    on(k, () => saveProject(projectId));
  });
}

const typeIcons = {
  panel: asset('icons/panel.svg'),
  equipment: asset('icons/equipment.svg'),
  load: asset('icons/load.svg'),
  bus: asset('icons/Bus.svg')
};

const placeholderIcon = asset('icons/placeholder.svg');

const builtinComponents = [
  {
    subtype: 'Bus',
    label: 'Bus',
    icon: typeIcons.bus || placeholderIcon,
    category: 'bus',
    ports: [
      { x: 0, y: 20 },
      { x: 80, y: 20 }
    ]
  },
  {
    subtype: 'Panel',
    label: 'Panel',
    icon: typeIcons.panel || placeholderIcon,
    category: 'panel',
    ports: [
      { x: 0, y: 20 },
      { x: 80, y: 20 }
    ]
  },
  {
    subtype: 'Equipment',
    label: 'Equipment',
    icon: typeIcons.equipment || placeholderIcon,
    category: 'equipment',
    ports: [
      { x: 0, y: 20 },
      { x: 80, y: 20 }
    ]
  },
  {
    subtype: 'Load',
    label: 'Load',
    icon: typeIcons.load || placeholderIcon,
    category: 'load',
    ports: [
      { x: 0, y: 20 },
      { x: 80, y: 20 }
    ]
  }
];

let propSchemas = {};
let subtypeCategory = {};
let componentTypes = {};
let manufacturerDefaults = {};
let protectiveDevices = [];

let paletteWidth = 250;
let resizingPalette = false;

const kvClasses = ['0.48 kV', '5 kV', '15 kV', '25 kV'];
const thermalRatings = ['75C', '90C', '105C'];
const manufacturerModels = {
  ABB: ['MNS', 'SafeGear'],
  Siemens: ['SB1', 'S6'],
  GE: ['EntelliGuard', 'Spectra'],
  Schneider: ['QED-2', 'Blokset'],
  Caterpillar: ['XQ125', 'C175'],
  Cummins: ['C900', 'QSK60'],
  Generac: ['G2000', 'Industrial']
};


// === REPLACE THE ENTIRE FUNCTION ===
async function loadComponentLibrary() {
  // Reset caches for a clean reload
  componentMeta = {};
  propSchemas = {};
  subtypeCategory = {};
  componentTypes = {};

  const banner = document.getElementById('component-library-banner');

  // Helper: fetch JSON with a clear error
  async function fetchJSON(url) {
    let res;
    try {
      res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error('Component library fetch failed:', url, e?.message || e);
      throw e;
    }
  }

  // Helper: normalize library shape into an array of components
  function normalizeToArray(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.components)) return data.components;
    if (data && typeof data === 'object') {
      // Accept object maps: { MLO: {...}, MCC: {...}, ... }
      const arr = Object.values(data).filter(v => v && typeof v === 'object');
      if (arr.length) return arr;
    }
    return [];
  }

  // 1) Try base-relative
  const primaryUrl = new URL('componentLibrary.json', document.baseURI).href;
  console.info('Component library URL (primary):', primaryUrl);

  let data;
  try {
    const d1 = await fetchJSON(primaryUrl);
    data = normalizeToArray(d1);
  } catch {
    // 2) Fallback: relative to this module (import.meta.url)
    try {
      const fallbackUrl = new URL('./componentLibrary.json', import.meta.url).href;
      console.info('Component library URL (fallback):', fallbackUrl);
      const d2 = await fetchJSON(fallbackUrl);
      data = normalizeToArray(d2);
    } catch (importErr) {
      console.warn('Falling back to built-in components.', importErr?.message || importErr);
      data = builtinComponents.slice(); // last resort
    }
  }

  // If after normalization we still have nothing, bail with a visible banner
  if (!Array.isArray(data) || data.length === 0) {
    console.error('Component library normalized to zero components.');
    if (banner) banner.classList.remove('hidden');
    // Build an empty palette (shows "No components available" placeholders)
    buildPalette();
    showToast('Component library parsed to zero components.');
    return;
  }

  // Validate icons without breaking the palette
  const missingIcons = [];
  await Promise.all(data.map(async c => {
    if (!isValidComponent(c)) return;
    if (!c.icon) {
      c.icon = placeholderIcon;
      missingIcons.push(c.subtype || 'unknown');
      return;
    }
    const iconUrl = new URL(c.icon, document.baseURI).href;
    // DO NOT use HEAD on GitHub Pages; do a tolerant GET and ignore failures
    try {
      const ping = await fetch(iconUrl, { method: 'GET', cache: 'no-store', mode: 'no-cors' });
      // no-cors may not yield .ok; we still accept the URL
      c.icon = iconUrl;
    } catch {
      console.warn(`Icon missing for subtype ${c.subtype}; using placeholder.`);
      c.icon = placeholderIcon;
      missingIcons.push(c.subtype || 'unknown');
    }
  }));

  // Build metadata and category map
  const reliabilityFields = [
    { name: 'mtbf', label: 'MTBF (hrs)', type: 'number' },
    { name: 'mttr', label: 'MTTR (hrs)', type: 'number' },
    { name: 'failure_modes', label: 'Failure Modes', type: 'textarea' }
  ];

  const bySubtype = new Map();
  data.forEach(c => bySubtype.set(c.subtype, c)); // last one wins

  const finalData = Array.from(bySubtype.values()).filter(isValidComponent);
  finalData.forEach(c => {
    c.schema = c.schema || [];
    reliabilityFields.forEach(f => {
      if (!c.schema.some(s => s.name === f.name)) c.schema.push(f);
    });

    componentMeta[c.subtype] = {
      icon: c.icon || placeholderIcon,
      label: c.label || c.subtype || 'Component',
      category: c.category,
      ports: c.ports
    };

    const cat = c.category;
    subtypeCategory[c.subtype] = cat;
    if (!componentTypes[cat]) componentTypes[cat] = [];
    componentTypes[cat].push(c.subtype);
  });

  console.info('Palette categories:', Object.keys(componentTypes));

  // Show/hide banner based on whether we actually have anything to show
  const hasAny = Object.values(componentTypes).some(arr => Array.isArray(arr) && arr.length);
  if (banner) banner.classList.toggle('hidden', hasAny);

  // Always render the palette
  buildPalette();

  if (missingIcons.length) {
    showToast(`Placeholder icons for: ${missingIcons.join(', ')}`);
  }
}
// === END REPLACEMENT ===

function isValidComponent(c) {
  return c && typeof c === 'object' && Array.isArray(c.ports) && c.category;
}

async function loadManufacturerLibrary() {
  try {
    const res = await fetch(asset('manufacturerLibrary.json'));
    manufacturerDefaults = await res.json();
  } catch (err) {
    console.error('Failed to load manufacturer defaults', err);
    manufacturerDefaults = {};
  }
  const stored = getItem('manufacturerDefaults', {});
  manufacturerDefaults = { ...manufacturerDefaults, ...stored };
}

async function loadProtectiveDevices() {
  try {
    const res = await fetch(asset('data/protectiveDevices.json'));
    protectiveDevices = await res.json();
  } catch (err) {
    console.error('Failed to load protective devices', err);
    protectiveDevices = [];
  }
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

function buildPalette() {
  console.info('Categories:', Object.keys(componentTypes));
  const palette = document.getElementById('component-buttons');
  const btnTemplate = document.getElementById('palette-button-template');
  const sectionContainers = {
    panel: document.getElementById('panel-buttons'),
    equipment: document.getElementById('equipment-buttons'),
    load: document.getElementById('load-buttons'),
    bus: document.getElementById('bus-buttons')
  };
  Object.values(sectionContainers).forEach(c => {
    if (c) c.innerHTML = '';
  });
  Object.entries(sectionContainers).forEach(([cat, container]) => {
    const summary = container?.parentElement?.querySelector('summary');
    if (summary) summary.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
  });
  Object.entries(componentTypes).forEach(([type, subs]) => {
    const container = sectionContainers[type] || palette;
    subs.forEach(sub => {
      const meta = componentMeta[sub];
      const btn = btnTemplate ? btnTemplate.content.firstElementChild.cloneNode(true) : document.createElement('button');
      // expose subtype/type information for drag & search and mark as draggable
      btn.draggable = true;
      btn.setAttribute('draggable', 'true');
      btn.dataset.type = type;
      btn.dataset.subtype = sub;
      btn.setAttribute('data-subtype', sub);
      btn.setAttribute('data-testid', 'palette-button');
      btn.dataset.label = meta.label;
      btn.title = `${meta.label} - Drag to canvas or click to add`;
      btn.innerHTML = `<img src="${meta.icon}" alt="" aria-hidden="true">`;
      btn.addEventListener('click', () => {
        addComponent({ type, subtype: sub });
        render();
        save();
      });
      btn.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type, subtype: sub }));
      });
      container.appendChild(btn);
    });
  });
  document.querySelectorAll('#component-buttons details').forEach(det => {
    const key = `palette-${det.id}-open`;
    const container = det.querySelector('.section-buttons');
    const hasButtons = container && container.children.length > 0;
    if (!hasButtons && container) {
      const placeholder = document.createElement('div');
      placeholder.className = 'no-components';
      placeholder.textContent = 'No components available';
      container.appendChild(placeholder);
    }
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      det.open = stored === 'true';
    } else if (!hasButtons) {
      det.open = true;
    }
    det.addEventListener('toggle', () => {
      localStorage.setItem(key, det.open);
    });
  });
  const paletteSearch = document.getElementById('palette-search');
  if (paletteSearch) {
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
  }
}

const svgNS = 'http://www.w3.org/2000/svg';
let sheets = [];
let activeSheet = 0;
let components = [];
let connections = [];
let selection = [];
let selected = null;
let dragOffset = null;
let dragging = false;
let draggingConnection = null;
let clipboard = [];
let contextTarget = null;
let connectMode = false;
let connectSource = null;
let tempConnection = null;
let hoverPort = null;
let selectedConnection = null;
let dimensionMode = false;
let dimensionStart = null;
let diagramScale = getItem('diagramScale', { unitPerPx: 1, unit: 'in' });
let cableSlackPct = Number(getItem('cableSlackPct', 0));
let slackPctInput = null;
let resizingBus = null;
let legendDrag = null;
let gridSize = Number(getItem('gridSize', 20));
let gridEnabled = getItem('gridEnabled', true);
let snapIndicatorTimeout = null;
let history = [];
let historyIndex = -1;
let validationIssues = [];
const compWidth = 80;
const compHeight = 40;
let templates = [];
const DIAGRAM_VERSION = 2;
let cursorPos = { x: 20, y: 20 };
let showOverlays = true;
let syncing = false;
let lintPanel = null;
let lintList = null;

// Re-run validation whenever diagram or study results change
on('oneLineDiagram', validateDiagram);
on('studyResults', validateDiagram);

// Studies panel setup
const studiesPanel = document.getElementById('studies-panel');
const studiesToggle = document.getElementById('studies-panel-btn');
const studiesCloseBtn = document.getElementById('studies-close-btn');
const runLFBtn = document.getElementById('run-loadflow-btn');
const runSCBtn = document.getElementById('run-shortcircuit-btn');
const runAFBtn = document.getElementById('run-arcflash-btn');
const runHBtn = document.getElementById('run-harmonics-btn');
const runMSBtn = document.getElementById('run-motorstart-btn');
const runRelBtn = document.getElementById('run-reliability-btn');
const studyResultsEl = document.getElementById('study-results');
const loadFlowResultsEl = document.getElementById('loadflow-results');
const overlayToggle = document.getElementById('toggle-overlays');

if (overlayToggle) {
  showOverlays = overlayToggle.checked;
  overlayToggle.addEventListener('change', () => {
    showOverlays = overlayToggle.checked;
    render();
  });
}

function renderStudyResults() {
  if (!studyResultsEl) return;
  const res = getStudies();
  studyResultsEl.textContent = Object.keys(res).length ? JSON.stringify(res, null, 2) : 'No results';
}

function highlightSPF(ids = []) {
  const svg = document.getElementById('diagram');
  if (!svg) return;
  svg.querySelectorAll('g.component').forEach(g => g.classList.remove('reliability-spf'));
  ids.forEach(id => {
    const g = svg.querySelector(`g.component[data-id="${id}"]`);
    if (g) g.classList.add('reliability-spf');
  });
}

if (studiesToggle) {
  studiesToggle.addEventListener('click', () => {
    studiesPanel.classList.toggle('hidden');
    renderStudyResults();
  });
}
if (studiesCloseBtn) studiesCloseBtn.addEventListener('click', () => studiesPanel.classList.add('hidden'));
if (runLFBtn) runLFBtn.addEventListener('click', () => {
  const res = runLoadFlow();
  const { sheets } = getOneLine();
  const diagram = sheets.flatMap(s => s.components);
  const buses = res.buses || res;
  buses.forEach(r => {
    const comp = diagram.find(c => c.id === r.id);
    if (!comp) return;
    if (r.phase) {
      if (typeof comp.voltage_mag !== 'object') comp.voltage_mag = {};
      if (typeof comp.voltage_angle !== 'object') comp.voltage_angle = {};
      comp.voltage_mag[r.phase] = Number(r.Vm.toFixed(4));
      comp.voltage_angle[r.phase] = Number(r.Va.toFixed(4));
    } else {
      comp.voltage_mag = Number(r.Vm.toFixed(4));
      comp.voltage_angle = Number(r.Va.toFixed(4));
    }
  });
  // store line loading results on connections
  (res.lines || []).forEach(l => {
    const src = diagram.find(c => c.id === l.from);
    const conn = src?.connections?.find(c => c.target === l.to);
    if (!conn) return;
    if (l.phase) {
      if (typeof conn.loading_kW !== 'object') conn.loading_kW = {};
      conn.loading_kW[l.phase] = Number(l.P.toFixed(2));
    } else {
      conn.loading_kW = Number(l.P.toFixed(2));
    }
  });
  setOneLine({ activeSheet, sheets });
  const studies = getStudies();
  studies.loadFlow = res;
  setStudies(studies);
  syncSchedules(false);
  renderStudyResults();
  renderLoadFlowResults(res);
  render();
});

function renderLoadFlowResults(res) {
  if (!loadFlowResultsEl) return;
  const buses = res.buses || res;
  let html = '<h3>Bus Voltages</h3><table><tr><th>Bus</th><th>Phase</th><th>Vm</th><th>Va</th></tr>';
  buses.forEach(b => {
    html += `<tr><td>${b.id}</td><td>${b.phase || ''}</td><td>${b.Vm.toFixed(4)}</td><td>${b.Va.toFixed(2)}</td></tr>`;
  });
  html += '</table>';
  if (res.lines) {
    html += '<h3>Line Flows (kW/kvar)</h3><table><tr><th>From</th><th>To</th><th>Phase</th><th>P</th><th>Q</th></tr>';
    res.lines.forEach(l => {
      html += `<tr><td>${l.from}</td><td>${l.to}</td><td>${l.phase || ''}</td><td>${l.P.toFixed(2)}</td><td>${l.Q.toFixed(2)}</td></tr>`;
    });
    html += '</table>';
    if (res.losses) {
      if (res.losses.P !== undefined) {
        html += `<p>Total Losses: ${res.losses.P.toFixed(2)} kW / ${res.losses.Q.toFixed(2)} kvar</p>`;
      } else {
        const entries = Object.entries(res.losses).map(([ph, v]) => `${ph}: ${v.P.toFixed(2)} kW / ${v.Q.toFixed(2)} kvar`).join(', ');
        html += `<p>Total Losses: ${entries}</p>`;
      }
    }
  }
  loadFlowResultsEl.innerHTML = html;
}
if (runSCBtn) runSCBtn.addEventListener('click', () => {
  const res = runShortCircuit();
  const { sheets } = getOneLine();
  const diagram = sheets.flatMap(s => s.components);
  diagram.forEach(c => {
    c.shortCircuit = res[c.id];
    (c.connections || []).forEach(conn => {
      conn.faultKA = res[conn.target]?.threePhaseKA;
    });
  });
  setOneLine({ activeSheet, sheets });
  const studies = getStudies();
  studies.shortCircuit = res;
  setStudies(studies);
  renderStudyResults();
  render();
});
if (runAFBtn) runAFBtn.addEventListener('click', async () => {
  const sc = runShortCircuit();
  const af = await runArcFlash();
  const { sheets } = getOneLine();
  const diagram = sheets.flatMap(s => s.components);
  diagram.forEach(c => {
    c.shortCircuit = sc[c.id];
    c.arcFlash = af[c.id];
    (c.connections || []).forEach(conn => {
      conn.faultKA = sc[conn.target]?.threePhaseKA;
    });
  });
  setOneLine({ activeSheet, sheets });
  const studies = getStudies();
  studies.shortCircuit = sc;
  studies.arcFlash = af;
  setStudies(studies);
  generateArcFlashReport(af);
  renderStudyResults();
  render();
});
if (runHBtn) runHBtn.addEventListener('click', () => {
  const res = runHarmonics();
  const studies = getStudies();
  studies.harmonics = res;
  setStudies(studies);
  renderStudyResults();
  window.open('harmonics.html', '_blank');
});
if (runMSBtn) runMSBtn.addEventListener('click', () => {
  const res = runMotorStart();
  const studies = getStudies();
  studies.motorStart = res;
  setStudies(studies);
  renderStudyResults();
  window.open('motorStart.html', '_blank');
});
if (runRelBtn) runRelBtn.addEventListener('click', () => {
  const { sheets } = getOneLine();
  const diagram = sheets.flatMap(s => s.components);
  const res = runReliability(diagram);
  const studies = getStudies();
  studies.reliability = res;
  setStudies(studies);
  highlightSPF(res.n1Failures);
  renderStudyResults();
});

// Guided tour steps
const tourSteps = [
  { element: '#component-buttons', text: 'Add components from the palette.' },
  { element: '#connect-btn', text: 'Connect components using this button then selecting two components.' },
  { element: '#diagram', text: 'Select a component to edit its properties.' },
  { element: '#export-btn', text: 'Use Export to download your diagram.' }
];
let tourIndex = 0;
let tourOverlay = null;
let tourModal = null;

function showTourStep() {
  const step = tourSteps[tourIndex];
  tourModal.querySelector('#tour-text').textContent = step.text;
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  const el = document.querySelector(step.element);
  if (el) el.classList.add('tour-highlight');
  const next = tourModal.querySelector('#tour-next');
  next.textContent = tourIndex === tourSteps.length - 1 ? 'Finish' : 'Next';
}

function endTour() {
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  tourOverlay?.remove();
  tourModal?.remove();
  tourOverlay = null;
  tourModal = null;
}

function startTour() {
  tourIndex = 0;
  tourOverlay = document.createElement('div');
  tourOverlay.className = 'tour-overlay';
  tourModal = document.createElement('div');
  tourModal.className = 'tour-modal';
  tourModal.innerHTML = `<p id="tour-text"></p><button id="tour-next">Next</button>`;
  document.body.appendChild(tourOverlay);
  document.body.appendChild(tourModal);
  tourModal.querySelector('#tour-next').addEventListener('click', () => {
    tourIndex++;
    if (tourIndex >= tourSteps.length) {
      endTour();
    } else {
      showTourStep();
    }
  });
  showTourStep();
}

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
  return modal;
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
  if (!templates.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'no-components';
    placeholder.textContent = 'No components available';
    container.appendChild(placeholder);
    return;
  }
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
    const snappedX = Math.round(x / gridSize) * gridSize;
    const snappedY = Math.round(y / gridSize) * gridSize;
    x = snappedX;
    y = snappedY;
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
  if (gridEnabled) flashSnapIndicator(x, y);
}

function exportTemplates() {
  const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'onelineTemplates.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  showToast('Templates exported');
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

function setupLibraryTools() {
  document.querySelectorAll('#reload-library-btn, #library-reload-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await loadComponentLibrary();
      showToast('Component library reloaded');
    });
  });
  const templateExportBtn = document.getElementById('template-export-btn');
  if (templateExportBtn) templateExportBtn.addEventListener('click', exportTemplates);
  const templateImportBtn = document.getElementById('template-import-btn');
  const templateImportInput = document.getElementById('template-import-input');
  if (templateImportBtn && templateImportInput) {
    templateImportBtn.addEventListener('click', () => templateImportInput.click());
    templateImportInput.addEventListener('change', importTemplates);
  }
}

const cableColors = {
  Power: '#f00',
  Control: '#00f',
  Signal: '#0a0'
};

// Phase sequence colors used for connection rendering
const phaseColors = {
  A: '#f00',
  B: '#00f',
  C: '#0a0',
  AB: '#800080',
  BC: '#008080',
  AC: '#ffa500',
  ABC: '#555'
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
  if (showOverlays) {
    const items = [
      { color: '#4caf50', label: 'Voltage \u2264 5% dev' },
      { color: '#ffeb3b', label: '5-10% dev' },
      { color: '#f44336', label: '>10% dev' }
    ];
    items.forEach(i => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'legend-color';
      swatch.style.background = i.color;
      item.appendChild(swatch);
      const lbl = document.createElement('span');
      lbl.textContent = i.label;
      item.appendChild(lbl);
      legend.appendChild(item);
    });
  }
  legend.style.display = ranges.size || showOverlays ? 'block' : 'none';
}

function portPosition(c, portIndex) {
  const meta = componentMeta[c.subtype] || {};
  const w = c.width || compWidth;
  const h = c.height || compHeight;
  const ports = c.ports || meta.ports;
  const port = ports?.[portIndex];
  if (!port) {
    return { x: c.x + w / 2, y: c.y + h / 2 };
  }
  let { x, y } = port;
  if (c.flipped) x = w - x;
  let px = c.x + x;
  let py = c.y + y;
  const angle = (c.rotation || 0) * Math.PI / 180;
  if (angle) {
    const cx = c.x + w / 2;
    const cy = c.y + h / 2;
    const dx = px - cx;
    const dy = py - cy;
    px = cx + dx * Math.cos(angle) - dy * Math.sin(angle);
    py = cy + dx * Math.sin(angle) + dy * Math.cos(angle);
  }
  return { x: px, y: py };
}

function nearestPorts(src, tgt) {
  const srcPorts = src.ports || componentMeta[src.subtype]?.ports || [{ x: (src.width || compWidth) / 2, y: (src.height || compHeight) / 2 }];
  const tgtPorts = tgt.ports || componentMeta[tgt.subtype]?.ports || [{ x: (tgt.width || compWidth) / 2, y: (tgt.height || compHeight) / 2 }];
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

function nearestPortToPoint(x, y, exclude) {
  let min = Infinity;
  let best = null;
  components.forEach(c => {
    if (exclude && c === exclude.component) return;
    const ports = c.ports || componentMeta[c.subtype]?.ports || [];
    ports.forEach((p, idx) => {
      const pos = portPosition(c, idx);
      const dx = pos.x - x;
      const dy = pos.y - y;
      const d = Math.hypot(dx, dy);
      if (d < min) {
        min = d;
        best = { component: c, port: idx, pos };
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
  svg.querySelectorAll('g.component, .connection, .conn-label, .port, .dimension, .dim-label, .bus-handle, .issue-badge').forEach(el => el.remove());
  const usedVoltageRanges = new Set();
  let lengthsChanged = false;
  if (gridEnabled) {
    components.forEach(c => {
      c.x = Math.round(c.x / gridSize) * gridSize;
      c.y = Math.round(c.y / gridSize) * gridSize;
    });
  }

  function routeConnection(src, tgt, conn) {
    const start = portPosition(src, conn?.sourcePort);
    const end = portPosition(tgt, conn?.targetPort);
    if (conn && conn.dir) {
      const mid = conn.mid ?? (conn.dir === 'h' ? (start.x + end.x) / 2 : (start.y + end.y) / 2);
      if (conn.dir === 'h') return [start, { x: mid, y: start.y }, { x: mid, y: end.y }, end];
      return [start, { x: start.x, y: mid }, { x: end.x, y: mid }, end];
    }

    function horizontalFirst() {
      let midX = (start.x + end.x) / 2;
      let adjusted = true;
      while (adjusted) {
        adjusted = false;
        components.forEach(comp => {
          if (comp === src || comp === tgt) return;
          const rect = { x: comp.x, y: comp.y, w: comp.width || compWidth, h: comp.height || compHeight };
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
          const rect = { x: comp.x, y: comp.y, w: comp.width || compWidth, h: comp.height || compHeight };
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
          const rect = { x: comp.x, y: comp.y, w: comp.width || compWidth, h: comp.height || compHeight };
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
    const v = verticalFirst();
    let path;
    if (!intersects(h)) path = h;
    else if (!intersects(v)) path = v;
    else path = h.length <= v.length ? h : v;
    if (conn) {
      conn.dir = path === h ? 'h' : 'v';
      conn.mid = conn.dir === 'h' ? path[1].x : path[1].y;
    }
    return path;
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

  // draw dimension lines
  components.filter(c => c.type === 'dimension').forEach(d => {
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', d.x1);
    line.setAttribute('y1', d.y1);
    line.setAttribute('x2', d.x2);
    line.setAttribute('y2', d.y2);
    line.classList.add('dimension');
    line.setAttribute('marker-start', 'url(#arrow)');
    line.setAttribute('marker-end', 'url(#arrow)');
    svg.appendChild(line);

    const midx = (d.x1 + d.x2) / 2;
    const midy = (d.y1 + d.y2) / 2;
    const dist = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
    const len = dist * (diagramScale.unitPerPx || 1);
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', midx);
    text.setAttribute('y', midy - 5);
    text.setAttribute('text-anchor', 'middle');
    text.classList.add('dim-label');
    text.textContent = `${len.toFixed(2)} ${diagramScale.unit}`;
    svg.appendChild(text);
  });

  // draw connections
  components.forEach(c => {
    (c.connections || []).forEach((conn, idx) => {
      const target = components.find(t => t.id === conn.target);
      if (!target) return;
      const pts = routeConnection(c, target, conn);
      const lenPx = pts.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
      if (Math.abs((conn.length || 0) - lenPx) > 0.5) lengthsChanged = true;
      conn.length = lenPx;
      const poly = document.createElementNS(svgNS, 'polyline');
      poly.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
      const vRange = getVoltageRange(conn.voltage || conn.cable?.voltage || c.voltage || target.voltage);
      if (vRange) usedVoltageRanges.add(vRange);
      const phaseKey = (conn.phases || []).join('');
      const phaseColor = phaseColors[phaseKey];
      const stroke = phaseColor || vRange?.color || cableColors[conn.cable?.cable_type] || conn.cable?.color || '#000';
      poly.setAttribute('stroke', stroke);
      poly.setAttribute('fill', 'none');
      poly.setAttribute('marker-end', 'url(#arrow)');
      poly.classList.add('connection');
      const vdLimit = parseFloat(target.maxVoltageDrop) || 3;
      if (conn.cable?.sizing_warning) poly.classList.add('sizing-violation');
      if (parseFloat(conn.cable?.voltage_drop_pct) > vdLimit) poly.classList.add('voltage-exceed');
      poly.addEventListener('click', e => {
        e.stopPropagation();
        selected = null;
        selection = [];
        selectedConnection = { component: c, index: idx };
      });
      poly.addEventListener('mousedown', e => {
        e.stopPropagation();
        draggingConnection = {
          component: c,
          index: idx,
          start: { x: e.offsetX, y: e.offsetY },
          mid: conn.mid ?? (conn.dir === 'h' ? pts[1].x : pts[1].y)
        };
      });
      svg.appendChild(poly);

      const label = document.createElementNS(svgNS, 'text');
      const mid = midpoint(pts);
      label.setAttribute('x', mid.x);
      label.setAttribute('y', mid.y);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('fill', stroke);
      let lblText = conn.cable?.tag || conn.cable?.cable_type || '';
      if (showOverlays) {
        const val = conn.faultKA ?? conn.loading_kW;
        if (val !== undefined) {
          const unit = conn.faultKA != null ? 'kA' : 'kW';
          lblText += ` ${Number(val).toFixed(2)} ${unit}`;
        }
      }
      label.textContent = lblText;
      label.classList.add('conn-label');
      if (conn.cable?.sizing_warning) label.classList.add('sizing-violation');
      if (parseFloat(conn.cable?.voltage_drop_pct) > vdLimit) label.classList.add('voltage-exceed');
      label.style.pointerEvents = 'none';
      svg.appendChild(label);
    });
  });

  // draw nodes
  components.filter(c => c.type !== 'dimension').forEach(c => {
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
    const w = c.width || compWidth;
    const h = c.height || compHeight;
    const cx = c.x + w / 2;
    const cy = c.y + h / 2;
    if (showOverlays && c.voltage_mag !== undefined) {
      const mags = typeof c.voltage_mag === 'object' ? Object.values(c.voltage_mag) : [c.voltage_mag];
      const dev = Math.max(...mags.map(v => Math.abs(v - 1) * 100));
      let color = '#4caf50';
      if (dev > 10) color = '#f44336';
      else if (dev > 5) color = '#ffeb3b';
      const halo = document.createElementNS(svgNS, 'circle');
      halo.setAttribute('cx', cx);
      halo.setAttribute('cy', cy);
      halo.setAttribute('r', Math.max(w, h) / 2 + 6);
      halo.setAttribute('fill', 'none');
      halo.setAttribute('stroke', color);
      halo.setAttribute('stroke-width', 6);
      halo.setAttribute('opacity', 0.5);
      g.appendChild(halo);
    }
    if (showOverlays && (c.voltage_mag !== undefined || c.shortCircuit?.threePhaseKA !== undefined)) {
      const txt = document.createElementNS(svgNS, 'text');
      txt.setAttribute('x', cx);
      txt.setAttribute('y', cy - (h / 2) - 4);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('class', 'overlay-label');
      const parts = [];
      if (c.voltage_mag !== undefined) {
        if (typeof c.voltage_mag === 'object') {
          parts.push(Object.entries(c.voltage_mag)
            .map(([ph, v]) => `${ph}:${Number(v).toFixed(3)} pu`)
            .join(' '));
        } else {
          parts.push(`${Number(c.voltage_mag).toFixed(3)} pu`);
        }
      }
      if (c.shortCircuit?.threePhaseKA !== undefined) {
        parts.push(`${Number(c.shortCircuit.threePhaseKA).toFixed(2)} kA`);
      }
      txt.textContent = parts.join(' / ');
      g.appendChild(txt);
    }
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
      bg.setAttribute('width', w);
      bg.setAttribute('height', h);
      bg.setAttribute('fill', vRange.color);
      bg.setAttribute('opacity', 0.3);
      g.appendChild(bg);
    }
    const meta = componentMeta[c.subtype] || {};
    const iconHref = meta.icon || placeholderIcon;
    const img = document.createElementNS(svgNS, 'image');
    img.setAttribute('x', c.x);
    img.setAttribute('y', c.y);
    img.setAttribute('width', w);
    img.setAttribute('height', h);
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', iconHref);
    if (iconHref !== placeholderIcon) {
      img.addEventListener('error', () => {
        console.warn(`Missing icon for subtype ${c.subtype}`);
        img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', placeholderIcon);
      }, { once: true });
    }
    g.appendChild(img);
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', c.x + w / 2);
    text.setAttribute('y', c.y + h + 15);
    text.setAttribute('text-anchor', 'middle');
    text.textContent = c.label || meta.label || c.subtype || c.type;
    if (selection.includes(c)) {
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', c.x - 2);
      rect.setAttribute('y', c.y - 2);
      rect.setAttribute('width', w + 4);
      rect.setAttribute('height', h + 4);
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', '#00f');
      rect.setAttribute('stroke-dasharray', '4 2');
      rect.style.pointerEvents = 'none';
      g.appendChild(rect);
    }
    g.appendChild(text);
    svg.appendChild(g);
    if (c.subtype === 'Bus' && selection.includes(c)) {
      const handle = document.createElementNS(svgNS, 'rect');
      handle.setAttribute('x', c.x + c.width - 5);
      handle.setAttribute('y', c.y + (c.height / 2) - 5);
      handle.setAttribute('width', 10);
      handle.setAttribute('height', 10);
      handle.classList.add('bus-handle');
      handle.dataset.id = c.id;
      svg.appendChild(handle);
    }
      if (connectMode) {
        (c.ports || meta.ports || []).forEach((p, idx) => {
          const pos = portPosition(c, idx);
          const circ = document.createElementNS(svgNS, 'circle');
          circ.setAttribute('cx', pos.x);
          circ.setAttribute('cy', pos.y);
          circ.setAttribute('r', 3);
          circ.classList.add('port');
          circ.dataset.id = c.id;
          circ.dataset.port = idx;
          svg.appendChild(circ);
        });
      }
  });

  updateLegend(usedVoltageRanges);
  if (lengthsChanged && !syncing) {
    syncing = true;
    syncSchedules(false);
    syncing = false;
    render();
  }
}

export function toggleGrid() {
  const toggle = document.getElementById('grid-toggle');
  gridEnabled = toggle?.checked;
  setItem('gridEnabled', gridEnabled);
  document.getElementById('grid-bg').style.display = gridEnabled ? 'block' : 'none';
  render();
}

function flashSnapIndicator(x, y) {
  const svg = document.getElementById('diagram');
  let indicator = document.getElementById('snap-indicator');
  if (!indicator) {
    indicator = document.createElementNS(svgNS, 'circle');
    indicator.id = 'snap-indicator';
    svg.appendChild(indicator);
  }
  indicator.setAttribute('r', Math.max(2, gridSize / 4));
  indicator.setAttribute('cx', x);
  indicator.setAttribute('cy', y);
  indicator.style.opacity = '1';
  clearTimeout(snapIndicatorTimeout);
  snapIndicatorTimeout = setTimeout(() => {
    indicator.style.opacity = '0';
  }, 200);
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
  connections = sheets[activeSheet].connections;
  history = [JSON.parse(JSON.stringify(components))];
  historyIndex = 0;
  selection = [];
  selected = null;
  selectedConnection = null;
  renderSheetTabs();
  render();
  setOneLine({ activeSheet, sheets });
}

function addSheet(name) {
  const sheetName = name || prompt('Sheet name', `Sheet ${sheets.length + 1}`);
  if (!sheetName) return;
  sheets.push({ name: sheetName, components: [], connections: [] });
  loadSheet(sheets.length - 1);
  save();
}

function renameSheet(id, newName) {
  const idx = id ?? activeSheet;
  if (idx < 0 || idx >= sheets.length) return;
  const sheetName = newName || prompt('Sheet name', sheets[idx].name);
  if (!sheetName) return;
  sheets[idx].name = sheetName;
  renderSheetTabs();
  save();
}

function deleteSheet(id) {
  if (sheets.length <= 1) return;
  const idx = id ?? activeSheet;
  if (idx < 0 || idx >= sheets.length) return;
  if (!confirm('Delete current sheet?')) return;
  sheets.splice(idx, 1);
  activeSheet = Math.max(0, idx - 1);
  components = sheets[activeSheet].components;
  connections = sheets[activeSheet].connections;
  renderSheetTabs();
  render();
  save();
}

function save(notify = true) {
  const buildConnections = comps =>
    comps.flatMap(c =>
      (c.connections || []).map(conn => ({
        ...conn,
        from: c.id,
        to: conn.target
      }))
    );
  const sheetData = sheets.map((s, i) => {
    const comps = (i === activeSheet ? components : s.components).map(c => ({
      ...c,
      rotation: c.rotation || 0,
      flipped: !!c.flipped
    }));
    return {
      name: s.name,
      components: comps,
      connections: buildConnections(comps)
    };
  });
  sheets = sheetData;
  components = sheets[activeSheet].components;
  connections = sheets[activeSheet].connections;
  setOneLine({ activeSheet, sheets: sheetData });
  setItem('diagramScale', diagramScale);
  const issues = validateDiagram();
  if (issues.length === 0) {
    syncSchedules(notify);
  } else if (notify) {
    showToast('Fix validation issues before syncing schedules');
  }
}

function updateBusPorts(bus) {
  const spacing = 20;
  const ports = [];
  for (let px = 0; px <= bus.width; px += spacing) {
    ports.push({ x: px, y: 0 });
    ports.push({ x: px, y: bus.height });
  }
  bus.ports = ports;
}

function addComponent(cfg) {
  let subtype, type, x = 20, y = 20;
  if (typeof cfg === 'string') {
    subtype = cfg;
    type = componentMeta[subtype]?.category;
  } else if (cfg && typeof cfg === 'object') {
    subtype = cfg.subtype;
    type = cfg.type || componentMeta[cfg.subtype]?.category;
    if (cfg.x !== undefined) x = cfg.x;
    if (cfg.y !== undefined) y = cfg.y;
  } else {
    return;
  }
  const meta = componentMeta[subtype];
  if (!meta) return;
  if (gridEnabled) {
    x = Math.round(x / gridSize) * gridSize;
    y = Math.round(y / gridSize) * gridSize;
  }
  const comp = {
    id: 'n' + Date.now(),
    type: type || meta.category,
    subtype,
    x,
    y,
    label: nextLabel(subtype),
    ref: '',
    rotation: 0,
    flipped: false,
    impedance: { r: 0, x: 0 },
    rating: null,
    connections: []
  };
  if (subtype === 'Bus') {
    comp.width = 200;
    comp.height = 20;
    updateBusPorts(comp);
  }
  applyDefaults(comp);
  components.push(comp);
  pushHistory();
  if (gridEnabled) flashSnapIndicator(x, y);
  return comp;
}

function alignSelection(direction) {
  if (selection.length < 2) return;
  if (direction === 'left') {
    const minX = Math.min(...selection.map(c => c.x));
    selection.forEach(c => { c.x = minX; });
  } else if (direction === 'right') {
    const maxX = Math.max(...selection.map(c => c.x + (c.width || compWidth)));
    selection.forEach(c => { c.x = maxX - (c.width || compWidth); });
  } else if (direction === 'top') {
    const minY = Math.min(...selection.map(c => c.y));
    selection.forEach(c => { c.y = minY; });
  } else if (direction === 'bottom') {
    const maxY = Math.max(...selection.map(c => c.y + (c.height || compHeight)));
    selection.forEach(c => { c.y = maxY - (c.height || compHeight); });
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

function selectComponent(compOrId) {
  const comp = typeof compOrId === 'string' ? components.find(c => c.id === compOrId) : compOrId;
  if (!comp) return;
  const rawSchema = propSchemas[comp.subtype] || [];
  if (!rawSchema.length) {
    showToast(`No properties defined for ${comp.subtype}`);
    return;
  }
  selected = comp;
  selection = [comp];
  selectedConnection = null;
  let modal = document.getElementById('prop-modal');
  if (modal._outsideHandler) modal.removeEventListener('click', modal._outsideHandler);
  if (modal._keyHandler) document.removeEventListener('keydown', modal._keyHandler);
  modal.innerHTML = '';
  const form = document.createElement('form');
  form.id = 'prop-form';

  const outsideHandler = e => { if (e.target === modal) closeModal(); };
  const keyHandler = e => { if (e.key === 'Escape') { e.preventDefault(); closeModal(); } };

  function closeModal() {
    modal.classList.remove('show');
    selected = null;
    selection = [];
    selectedConnection = null;
    modal.removeEventListener('click', outsideHandler);
    document.removeEventListener('keydown', keyHandler);
    delete modal._outsideHandler;
    delete modal._keyHandler;
  }

  const schema = rawSchema.map(f => {
    if (f.name === 'voltage_class') {
      return { ...f, type: 'select', options: kvClasses };
    }
    if (f.name === 'thermal_rating') {
      return { ...f, type: 'select', options: thermalRatings };
    }
    if (f.name === 'manufacturer') {
      return { ...f, type: 'select', options: Object.keys(manufacturerModels) };
    }
    if (f.name === 'model') {
      const manu = comp.manufacturer || Object.keys(manufacturerModels)[0];
      return { ...f, type: 'select', options: manufacturerModels[manu] || [] };
    }
    return f;
  });
  const baseFields = [
    { name: 'label', label: 'Label', type: 'text' },
    { name: 'ref', label: 'Ref ID', type: 'text' },
    { name: 'enclosure', label: 'Enclosure', type: 'select', options: ['NEMA 1', 'NEMA 3R', 'NEMA 4', 'NEMA 4X'] },
    { name: 'gap', label: 'Gap (mm)', type: 'number' },
    { name: 'working_distance', label: 'Working Distance (mm)', type: 'number' },
    { name: 'clearing_time', label: 'Clearing Time (s)', type: 'number' }
  ];
  let manufacturerInput = null;
  let modelInput = null;
  const buildField = (f, container) => {
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
    } else if (f.type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!curVal;
    } else {
      input = document.createElement('input');
      input.type = f.type || 'text';
      input.value = curVal;
    }
    input.name = f.name;
    if (f.name === 'manufacturer') manufacturerInput = input;
    if (f.name === 'model') modelInput = input;
    lbl.appendChild(input);
    container.appendChild(lbl);
  };

  const fields = [...baseFields, ...schema];
  const manufacturerFields = [];
  const noteFields = [];
  const electricalFields = [];
  fields.forEach(f => {
    if (['manufacturer', 'model'].includes(f.name)) manufacturerFields.push(f);
    else if (['notes', 'failure_modes'].includes(f.name)) noteFields.push(f);
    else electricalFields.push(f);
  });

  const addFieldset = (legendText, fieldArr) => {
    if (!fieldArr.length) return;
    const fs = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = legendText;
    fs.appendChild(legend);
    fieldArr.forEach(f => buildField(f, fs));
    form.appendChild(fs);
  };

  addFieldset('Manufacturer', manufacturerFields);
  addFieldset('Electrical', electricalFields);
  addFieldset('Notes', noteFields);

  if (manufacturerInput && modelInput) {
    const updateModels = () => {
      const models = manufacturerModels[manufacturerInput.value] || [];
      modelInput.innerHTML = '';
      models.forEach(m => {
        const o = document.createElement('option');
        o.value = m;
        o.textContent = m;
        if (comp.model === m) o.selected = true;
        modelInput.appendChild(o);
      });
    };
    manufacturerInput.addEventListener('change', updateModels);
    if (!manufacturerInput.value) manufacturerInput.value = Object.keys(manufacturerModels)[0];
    updateModels();
  }

  const tccLbl = document.createElement('label');
  tccLbl.textContent = 'TCC Device ';
  const tccInput = document.createElement('select');
  tccInput.name = 'tccId';
  const optEmpty = document.createElement('option');
  optEmpty.value = '';
  optEmpty.textContent = '--Select Device--';
  tccInput.appendChild(optEmpty);
  protectiveDevices.forEach(dev => {
    const opt = document.createElement('option');
    opt.value = dev.id;
    opt.textContent = dev.name;
    if (comp.tccId === dev.id) opt.selected = true;
    tccInput.appendChild(opt);
  });
  tccLbl.appendChild(tccInput);
  form.appendChild(tccLbl);
  const tccBtn = document.createElement('button');
  tccBtn.type = 'button';
  tccBtn.textContent = 'Edit TCC';
  tccBtn.classList.add('btn');
  tccBtn.addEventListener('click', () => {
    const dev = tccInput.value ? `&device=${encodeURIComponent(tccInput.value)}` : '';
    window.open(`tcc.html?component=${encodeURIComponent(comp.id)}${dev}`, '_blank');
  });
  form.appendChild(tccBtn);

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
      edit.classList.add('btn');
      edit.addEventListener('click', async e => {
        e.stopPropagation();
        const res = await chooseCable(comp, target, conn);
        if (res) {
          conn.cable = res.cable;
          conn.phases = res.phases;
          conn.conductors = res.conductors;
          addCable(res.cable);
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
      del.classList.add('btn');
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

  const applyBtn = document.createElement('button');
  applyBtn.type = 'submit';
  applyBtn.textContent = 'Apply';
  applyBtn.classList.add('btn');
  form.appendChild(applyBtn);

  const templateBtn = document.createElement('button');
  templateBtn.type = 'button';
  templateBtn.textContent = 'Save as Template';
  templateBtn.classList.add('btn');
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
    fields.forEach(f => {
      const v = fd.get(f.name);
      data[f.name] = f.type === 'checkbox' ? v === 'on' : (v || '');
    });
    data.tccId = fd.get('tccId') || '';
    templates.push({ name, component: data });
    saveTemplates();
    renderTemplates();
    showToast('Template saved');
  });
  form.appendChild(templateBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.classList.add('btn');
  cancelBtn.addEventListener('click', closeModal);
  form.appendChild(cancelBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Delete Component';
  deleteBtn.classList.add('btn');
  deleteBtn.addEventListener('click', () => {
    components = components.filter(c => c !== comp);
    components.forEach(c => {
      c.connections = (c.connections || []).filter(conn => conn.target !== comp.id);
    });
    closeModal();
    pushHistory();
    render();
    save();
  });
  form.appendChild(deleteBtn);

  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    fields.forEach(f => {
      const v = fd.get(f.name);
      comp[f.name] = f.type === 'checkbox' ? v === 'on' : (v || '');
    });
    comp.tccId = fd.get('tccId') || '';
    pushHistory();
    render();
    save();
    syncSchedules();
    closeModal();
  });

  modal.appendChild(form);
  modal.classList.add('show');
  modal.addEventListener('click', outsideHandler);
  document.addEventListener('keydown', keyHandler);
  modal._outsideHandler = outsideHandler;
  modal._keyHandler = keyHandler;
}

async function chooseCable(source, target, existingConn = null) {
  const templateData = [];
  try {
    const res = await fetch('cableTemplates.json');
    const arr = await res.json();
    arr.forEach(t => templateData.push(t));
  } catch (e) {}

  const existingTemplates = [];
  const seen = new Set();
  getCables().forEach(c => {
    if (!seen.has(c.tag)) {
      existingTemplates.push({ ...c });
      seen.add(c.tag);
    }
  });
  components.forEach(c => {
    (c.connections || []).forEach(conn => {
      if (conn.cable && !seen.has(conn.cable.tag)) {
        existingTemplates.push({
          ...conn.cable,
          phases: (conn.phases || []).join(','),
          conductors: conn.conductors || conn.cable?.conductors
        });
        seen.add(conn.cable.tag);
      }
    });
  });

  return new Promise(resolve => {
    const modal = document.getElementById('cable-modal');
    modal.innerHTML = '';
    const form = document.createElement('form');

    const tplLabel = document.createElement('label');
    tplLabel.textContent = 'Template ';
    const tplSelect = document.createElement('select');
    const optTpl = document.createElement('option');
    optTpl.value = '';
    optTpl.textContent = '--Template--';
    tplSelect.appendChild(optTpl);
    templateData.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = t.name;
      tplSelect.appendChild(opt);
    });
    tplLabel.appendChild(tplSelect);
    form.appendChild(tplLabel);

    const selLabel = document.createElement('label');
    selLabel.textContent = 'Existing ';
    const select = document.createElement('select');
    const optNew = document.createElement('option');
    optNew.value = '';
    optNew.textContent = '--New Cable--';
    select.appendChild(optNew);
    existingTemplates.forEach(t => {
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

    const conductorsLabel = document.createElement('label');
    conductorsLabel.textContent = 'Conductors ';
    const conductorsInput = document.createElement('input');
    conductorsInput.type = 'number';
    conductorsInput.name = 'conductors';
    conductorsLabel.appendChild(conductorsInput);
    form.appendChild(conductorsLabel);

    const phasesLabel = document.createElement('label');
    phasesLabel.textContent = 'Phases ';
    const phasesInput = document.createElement('input');
    phasesInput.name = 'phases';
    phasesInput.placeholder = 'A,B,C';
    phasesLabel.appendChild(phasesInput);
    form.appendChild(phasesLabel);

    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'Conductor Size ';
    const sizeInput = document.createElement('input');
    sizeInput.name = 'conductor_size';
    sizeLabel.appendChild(sizeInput);
    form.appendChild(sizeLabel);

    const materialLabel = document.createElement('label');
    materialLabel.textContent = 'Conductor Material ';
    const materialInput = document.createElement('input');
    materialInput.name = 'conductor_material';
    materialLabel.appendChild(materialInput);
    form.appendChild(materialLabel);

    const insulationLabel = document.createElement('label');
    insulationLabel.textContent = 'Insulation Type ';
    const insulationInput = document.createElement('input');
    insulationInput.name = 'insulation_type';
    insulationLabel.appendChild(insulationInput);
    form.appendChild(insulationLabel);

    const ambientLabel = document.createElement('label');
    ambientLabel.textContent = 'Ambient Temp (°C) ';
    const ambientInput = document.createElement('input');
    ambientInput.type = 'number';
    ambientInput.name = 'ambient_temp';
    ambientLabel.appendChild(ambientInput);
    form.appendChild(ambientLabel);

    const installLabel = document.createElement('label');
    installLabel.textContent = 'Install Method ';
    const installInput = document.createElement('input');
    installInput.name = 'install_method';
    installLabel.appendChild(installInput);
    form.appendChild(installLabel);

    const slackLabel = document.createElement('label');
    slackLabel.textContent = 'Slack % ';
    const slackInput = document.createElement('input');
    slackInput.type = 'number';
    slackInput.name = 'slack_pct';
    slackLabel.appendChild(slackInput);
    form.appendChild(slackLabel);

    const lengthLabel = document.createElement('label');
    lengthLabel.textContent = 'Length (ft) ';
    const lengthInput = document.createElement('input');
    lengthInput.type = 'number';
    lengthInput.name = 'length';
    lengthLabel.appendChild(lengthInput);
    form.appendChild(lengthLabel);

    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color ';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.name = 'color';
    colorLabel.appendChild(colorInput);
    form.appendChild(colorLabel);

    const sizeBtn = document.createElement('button');
    sizeBtn.type = 'button';
    sizeBtn.textContent = 'Size Conductor';
    sizeBtn.addEventListener('click', () => {
      const load = {
        current: parseFloat(target.current) || 0,
        voltage: parseFloat(target.voltage) || parseFloat(source.voltage) || 0,
        phases: parseInt(target.phases || source.phases || 3, 10)
      };
      const params = {
        length: parseFloat(lengthInput.value) || 0,
        material: materialInput.value || 'cu',
        insulation_rating: parseFloat(target.insulation_rating) || 90,
        ambient: parseFloat(ambientInput.value) || parseFloat(source.ambient) || 30,
        maxVoltageDrop: parseFloat(target.maxVoltageDrop) || 3,
        conductors: parseInt(conductorsInput.value) || 1,
        code: target.code || 'NEC'
      };
      const res = sizeConductor(load, params);
      if (res.size) {
        sizeInput.value = res.size;
        sizeInput.dataset.calcAmpacity = res.ampacity.toFixed(2);
        sizeInput.dataset.voltageDrop = res.voltageDrop.toFixed(2);
        sizeInput.dataset.sizingWarning = '';
        sizeInput.dataset.codeRef = res.codeRef;
        sizeInput.dataset.sizingReport = JSON.stringify(res.report || {});
        sizeInput.classList.remove('sizing-violation');
        alert(`Sized to ${res.size}`);
      } else {
        sizeInput.dataset.calcAmpacity = '';
        sizeInput.dataset.voltageDrop = '';
        sizeInput.dataset.sizingWarning = res.violation;
        sizeInput.dataset.codeRef = res.codeRef || '';
        sizeInput.dataset.sizingReport = JSON.stringify(res.report || {});
        sizeInput.classList.add('sizing-violation');
        alert(res.violation);
      }
    });
    form.appendChild(sizeBtn);

    tplSelect.addEventListener('change', () => {
      const t = templateData.find(tp => tp.name === tplSelect.value);
      if (t) {
        sizeInput.value = t.conductor_size || '';
        materialInput.value = t.conductor_material || '';
        insulationInput.value = t.insulation_type || '';
        ambientInput.value = t.ambient_temp || '';
        installInput.value = t.install_method || '';
      }
    });

    select.addEventListener('change', () => {
      const c = existingTemplates.find(t => t.tag === select.value);
      if (c) {
        tagInput.value = c.tag || '';
        typeInput.value = c.cable_type || '';
        conductorsInput.value = c.conductors || '';
        phasesInput.value = c.phases || '';
        sizeInput.value = c.conductor_size || '';
        materialInput.value = c.conductor_material || '';
        insulationInput.value = c.insulation_type || '';
        lengthInput.value = c.length || '';
        slackInput.value = c.slack_pct || cableSlackPct;
        colorInput.value = c.color || '#000000';
        ambientInput.value = c.ambient_temp || '';
        installInput.value = c.install_method || '';
      } else {
        tagInput.value = '';
        typeInput.value = '';
        conductorsInput.value = '';
        phasesInput.value = '';
        sizeInput.value = '';
        materialInput.value = '';
        insulationInput.value = '';
        lengthInput.value = '';
        slackInput.value = cableSlackPct;
        colorInput.value = '#000000';
        ambientInput.value = '';
        installInput.value = '';
        sizeInput.dataset.calcAmpacity = '';
        sizeInput.dataset.voltageDrop = '';
        sizeInput.dataset.sizingWarning = '';
        sizeInput.dataset.codeRef = '';
        sizeInput.dataset.sizingReport = '';
        sizeInput.classList.remove('sizing-violation');
      }
    });

    if (existingConn) {
      const existing = existingConn.cable || existingConn;
      tagInput.value = existing.tag || '';
      typeInput.value = existing.cable_type || '';
      conductorsInput.value = existingConn.conductors || existing.conductors || '';
      phasesInput.value = Array.isArray(existingConn.phases)
        ? existingConn.phases.join(',')
        : existing.phases || '';
      sizeInput.value = existing.conductor_size || '';
      materialInput.value = existing.conductor_material || '';
      insulationInput.value = existing.insulation_type || '';
      const autoLen = (existingConn.length || 0) * (diagramScale.unitPerPx || 1);
      const slack = parseFloat(existing.slack_pct ?? cableSlackPct) || 0;
      if (existing.length) {
        lengthInput.value = existing.length;
      } else if (autoLen) {
        lengthInput.value = (autoLen * (1 + slack / 100)).toFixed(2);
      }
      colorInput.value = existing.color || '#000000';
      ambientInput.value = existing.ambient_temp || '';
      installInput.value = existing.install_method || '';
      slackInput.value = existing.slack_pct || cableSlackPct;
      sizeInput.dataset.calcAmpacity = existing.calc_ampacity || '';
      sizeInput.dataset.voltageDrop = existing.voltage_drop_pct || existing.voltage_drop || '';
      sizeInput.dataset.sizingWarning = existing.sizing_warning || '';
      sizeInput.dataset.codeRef = existing.code_reference || '';
      sizeInput.dataset.sizingReport = existing.sizing_report || '';
      if (existing.sizing_warning) sizeInput.classList.add('sizing-violation');
      if (existingTemplates.some(t => t.tag === existing.tag)) {
        select.value = existing.tag;
      }
    } else {
      colorInput.value = '#000000';
      slackInput.value = cableSlackPct;
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
      const phases = phasesInput.value
        .split(',')
        .map(p => p.trim().toUpperCase())
        .filter(Boolean);
      const conductors = conductorsInput.value;
      const manualLen = lengthInput.value.trim() !== '';
      const cable = {
        tag: tagInput.value,
        cable_type: typeInput.value,
        conductors,
        conductor_size: sizeInput.value,
        conductor_material: materialInput.value,
        insulation_type: insulationInput.value,
        ambient_temp: ambientInput.value,
        install_method: installInput.value,
        color: colorInput.value,
        slack_pct: slackInput.value || cableSlackPct,
        phases: phases.length,
        calc_ampacity: sizeInput.dataset.calcAmpacity || '',
        voltage_drop_pct: sizeInput.dataset.voltageDrop || '',
        sizing_warning: sizeInput.dataset.sizingWarning || '',
        code_reference: sizeInput.dataset.codeRef || '',
        sizing_report: sizeInput.dataset.sizingReport || ''
      };
      if (manualLen) {
        cable.length = lengthInput.value;
        cable.manual_length = true;
      }
      modal.classList.remove('show');
      resolve({
        cable: { ...cable, from_tag: source.ref || source.id, to_tag: target.ref || target.id },
        phases,
        conductors
      });
    });

    modal.appendChild(form);
    modal.classList.add('show');
  });
}

async function init() {
  lintPanel = document.getElementById('lint-panel');
  lintList = document.getElementById('lint-list');
  const lintCloseBtn = document.getElementById('lint-close-btn');
  if (lintCloseBtn) lintCloseBtn.addEventListener('click', () => lintPanel.classList.add('hidden'));

  let svg = document.getElementById('diagram');
  if (!svg) {
    svg = document.querySelector('svg');
    if (svg) svg.id = 'diagram';
  }
  if (svg) {
    svg.addEventListener('dblclick', e => {
      const g = e.target.closest('.component');
      if (!g) return;
      selectComponent(g.dataset.id);
    });
    svg.addEventListener('dragover', e => e.preventDefault());
    svg.addEventListener('drop', e => {
      e.preventDefault();
      const dataText = e.dataTransfer.getData('text/plain');
      if (!dataText) return;
      let info;
      try {
        info = JSON.parse(dataText);
      } catch {
        showToast('Cannot drop component');
        return;
      }
      const { left, top } = svg.getBoundingClientRect();
      const x = e.clientX - left;
      const y = e.clientY - top;
      const comp = addComponent({ type: info.type, subtype: info.subtype, x, y });
      render();
      save();
      const elem = svg.querySelector(`g.component[data-id="${comp.id}"]`);
      if (elem) {
        elem.classList.add('flash');
        setTimeout(() => elem.classList.remove('flash'), 500);
      }
    });
  }

  const { sheets: storedSheets, activeSheet: storedActive = 0 } = getOneLine();
  sheets = storedSheets.map((s, i) => ({
    name: s.name || `Sheet ${i + 1}`,
    components: (s.components || []).map(normalizeComponent),
    connections: Array.isArray(s.connections) ? s.connections : []
  }));
  if (!sheets.length) sheets = [{ name: 'Sheet 1', components: [], connections: [] }];

  sheets.forEach(s => {
    s.components.forEach(c => {
      if (c.type === 'dimension') return;
      if (!componentMeta[c.subtype]) {
        const icon = typeIcons[c.type] || asset('icons/equipment.svg');
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
      if (!propSchemas[c.subtype]) {
        propSchemas[c.subtype] = [];
      }
    });
  });
  rebuildComponentMaps();
  Object.keys(componentMeta).forEach(sub => {
    if (!propSchemas[sub]) propSchemas[sub] = [];
  });
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

  activeSheet = Math.min(storedActive, sheets.length - 1);
  components = sheets[activeSheet].components;
  connections = sheets[activeSheet].connections;
  history = [JSON.parse(JSON.stringify(components))];
  historyIndex = 0;
  renderSheetTabs();
  render();
  const initIssues = validateDiagram();
  if (!initIssues.length) syncSchedules(false);

  const prefixBtn = document.getElementById('prefix-settings-btn');
  if (prefixBtn) prefixBtn.addEventListener('click', editPrefixes);

  const defaultsBtn = document.getElementById('update-defaults-btn');
  if (defaultsBtn) defaultsBtn.addEventListener('click', editManufacturerDefaults);

  const exportReportsBtn = document.getElementById('export-reports-btn');
  if (exportReportsBtn) exportReportsBtn.addEventListener('click', () => exportAllReports());

  buildPalette();
  loadTemplates();
  renderTemplates();
  const connectBtn = document.getElementById('connect-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      connectMode = !connectMode;
      connectSource = null;
      connectBtn.classList.toggle('active', connectMode);
      render();
    });
  }
  const dimensionBtn = document.getElementById('dimension-btn');
  if (dimensionBtn) {
    dimensionBtn.addEventListener('click', () => {
      dimensionMode = !dimensionMode;
      dimensionStart = null;
      connectMode = false;
      dimensionBtn.classList.toggle('active', dimensionMode);
    });
  }
  document.getElementById('undo-btn').addEventListener('click', undo);
  document.getElementById('redo-btn').addEventListener('click', redo);
  document.getElementById('align-left-btn').addEventListener('click', () => alignSelection('left'));
  document.getElementById('align-right-btn').addEventListener('click', () => alignSelection('right'));
  document.getElementById('align-top-btn').addEventListener('click', () => alignSelection('top'));
  document.getElementById('align-bottom-btn').addEventListener('click', () => alignSelection('bottom'));
  document.getElementById('distribute-h-btn').addEventListener('click', () => distributeSelection('h'));
  document.getElementById('distribute-v-btn').addEventListener('click', () => distributeSelection('v'));
  const exportBtn = document.getElementById('export-btn');
  const exportMenu = document.getElementById('export-menu');
  if (exportBtn && exportMenu) {
    exportBtn.addEventListener('click', () => {
      const expanded = exportBtn.getAttribute('aria-expanded') === 'true';
      exportBtn.setAttribute('aria-expanded', String(!expanded));
      exportMenu.classList.toggle('show');
    });
    exportMenu.addEventListener('click', e => {
      const format = e.target?.dataset?.format;
      if (!format) return;
      exportMenu.classList.remove('show');
      exportBtn.setAttribute('aria-expanded', 'false');
      if (format === 'pdf') {
        exportPDF({
          svgEl: document.getElementById('diagram'),
          sheets,
          loadSheet,
          serializeDiagram,
          activeSheet
        });
      } else if (format === 'dxf') {
        exportDXF(sheets[activeSheet]?.components || []);
      } else if (format === 'dwg') {
        exportDWG(sheets[activeSheet]?.components || []);
      }
    });
  }
  const importBtn = document.getElementById('import-btn');
  if (importBtn) importBtn.addEventListener('click', () => document.getElementById('import-input').click());
  const importInput = document.getElementById('import-input');
  if (importInput) importInput.addEventListener('change', handleImport);
  const diagramExportBtn = document.getElementById('diagram-export-btn');
  if (diagramExportBtn) diagramExportBtn.addEventListener('click', exportDiagram);
  const diagramImportBtn = document.getElementById('diagram-import-btn');
  if (diagramImportBtn) diagramImportBtn.addEventListener('click', () => document.getElementById('diagram-import-input').click());
  const diagramImportInput = document.getElementById('diagram-import-input');
  if (diagramImportInput) diagramImportInput.addEventListener('change', handleImport);
  const shareBtn = document.getElementById('diagram-share-btn');
  if (shareBtn) shareBtn.addEventListener('click', shareDiagram);
  const sampleBtn = document.getElementById('sample-diagram-btn');
  if (sampleBtn) sampleBtn.addEventListener('click', loadSampleDiagram);
  document.getElementById('add-sheet-btn').addEventListener('click', addSheet);
  document.getElementById('rename-sheet-btn').addEventListener('click', renameSheet);
  document.getElementById('delete-sheet-btn').addEventListener('click', deleteSheet);
  document.getElementById('validate-btn').addEventListener('click', validateDiagram);

  const gridToggle = document.getElementById('grid-toggle');
  const gridSizeInput = document.getElementById('grid-size');
  const gridPattern = document.getElementById('grid');
  const gridPath = gridPattern.querySelector('path');
  if (gridToggle) gridToggle.checked = gridEnabled;
  if (gridSizeInput) gridSizeInput.value = gridSize;
  gridPattern.setAttribute('width', gridSize);
  gridPattern.setAttribute('height', gridSize);
  gridPath.setAttribute('d', `M${gridSize} 0 L0 0 0 ${gridSize}`);
  document.getElementById('grid-bg').style.display = gridEnabled ? 'block' : 'none';
  gridToggle?.addEventListener('change', toggleGrid);
  gridSizeInput?.addEventListener('change', e => {
    gridSize = Number(e.target.value) || 20;
    gridPattern.setAttribute('width', gridSize);
    gridPattern.setAttribute('height', gridSize);
    gridPath.setAttribute('d', `M${gridSize} 0 L0 0 0 ${gridSize}`);
    setItem('gridSize', gridSize);
    render();
  });

  slackPctInput = document.getElementById('slack-pct');
  if (slackPctInput) slackPctInput.value = cableSlackPct;
  slackPctInput?.addEventListener('change', () => {
    cableSlackPct = Number(slackPctInput.value) || 0;
    setItem('cableSlackPct', cableSlackPct);
    syncSchedules(false);
    render();
  });

  const workspaceEl = document.querySelector('.workspace');
  const splitter = document.querySelector('.splitter');
  const paletteToggle = document.getElementById('palette-toggle');

  splitter?.addEventListener('mousedown', e => {
    resizingPalette = true;
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!resizingPalette) return;
    const rect = workspaceEl.getBoundingClientRect();
    paletteWidth = Math.min(Math.max(e.clientX - rect.left, 100), 500);
    workspaceEl.style.gridTemplateColumns = `${paletteWidth}px 1fr`;
    splitter.style.left = `${paletteWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    resizingPalette = false;
  });

  paletteToggle?.addEventListener('click', () => {
    const show = !workspaceEl.classList.contains('show-palette');
    workspaceEl.classList.toggle('show-palette', show);
    paletteToggle.setAttribute('aria-expanded', show);
    if (show) {
      workspaceEl.style.gridTemplateColumns = `${paletteWidth}px 1fr`;
      splitter.style.left = `${paletteWidth}px`;
    } else {
      workspaceEl.style.gridTemplateColumns = '1fr';
    }
  });

  const editorEl = document.querySelector('.oneline-editor');
  const legendEl = document.getElementById('voltage-legend');
  legendEl?.addEventListener('mousedown', e => {
    legendDrag = { dx: e.offsetX, dy: e.offsetY };
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!legendDrag || !legendEl || !editorEl) return;
    const rect = editorEl.getBoundingClientRect();
    legendEl.style.left = `${e.clientX - rect.left - legendDrag.dx}px`;
    legendEl.style.top = `${e.clientY - rect.top - legendDrag.dy}px`;
  });
  document.addEventListener('mouseup', () => {
    legendDrag = null;
  });

  // Reuse the diagram element fetched earlier in this function.
  // Avoid redeclaring the `svg` constant to prevent "Identifier has already been declared" errors.
  const menu = document.getElementById('context-menu');
    svg.addEventListener('mousedown', e => {
      if (connectMode && e.target.classList.contains('port')) {
        const comp = components.find(c => c.id === e.target.dataset.id);
        const port = Number(e.target.dataset.port);
        if (comp) {
          connectSource = { component: comp, port };
          const start = portPosition(comp, port);
          tempConnection = document.createElementNS(svgNS, 'line');
          tempConnection.setAttribute('x1', start.x);
          tempConnection.setAttribute('y1', start.y);
          tempConnection.setAttribute('x2', start.x);
          tempConnection.setAttribute('y2', start.y);
          tempConnection.classList.add('connection');
          tempConnection.classList.add('temp');
          svg.appendChild(tempConnection);
        }
        return;
      }
      if (e.target.classList.contains('bus-handle')) {
        const comp = components.find(c => c.id === e.target.dataset.id);
        if (comp) {
          resizingBus = { comp, startX: e.offsetX, startWidth: comp.width };
        }
        return;
      }
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
      dragging = false;
      render();
    });
    svg.addEventListener('mousemove', e => {
      cursorPos = { x: e.offsetX, y: e.offsetY };
      if (draggingConnection) {
        const { component, index, start, mid } = draggingConnection;
        const conn = component.connections[index];
        if (conn) {
          if (conn.dir === 'h') {
            conn.mid = mid + (e.offsetX - start.x);
          } else {
            conn.mid = mid + (e.offsetY - start.y);
          }
          render();
        }
        return;
      }
      if (resizingBus) {
        let newW = Math.max(40, resizingBus.startWidth + e.offsetX - resizingBus.startX);
        if (gridEnabled) newW = Math.round(newW / gridSize) * gridSize;
        resizingBus.comp.width = newW;
        updateBusPorts(resizingBus.comp);
        render();
        return;
      }
      if (connectSource && tempConnection) {
        const nearest = nearestPortToPoint(e.offsetX, e.offsetY, connectSource);
        let end = { x: e.offsetX, y: e.offsetY };
        hoverPort = null;
        if (nearest) {
          hoverPort = { component: nearest.component, port: nearest.port };
          end = nearest.pos;
        }
        tempConnection.setAttribute('x2', end.x);
        tempConnection.setAttribute('y2', end.y);
      }
    });
  svg.addEventListener('mousemove', e => {
    if (resizingBus || draggingConnection) return;
    if (!dragOffset || !dragOffset.length) return;
    let snapPos = null;
    dragOffset.forEach(off => {
      let x = e.offsetX - off.dx;
      let y = e.offsetY - off.dy;
      if (gridEnabled) {
        const snappedX = Math.round(x / gridSize) * gridSize;
        const snappedY = Math.round(y / gridSize) * gridSize;
        if (snappedX !== x || snappedY !== y) {
          snapPos = { x: snappedX, y: snappedY };
        }
        x = snappedX;
        y = snappedY;
      }
      off.comp.x = x;
      off.comp.y = y;
      dragging = true;
    });
    render();
    if (snapPos) flashSnapIndicator(snapPos.x, snapPos.y);
  });
    svg.addEventListener('mouseup', async e => {
      if (resizingBus) {
        resizingBus = null;
        pushHistory();
        render();
        save();
        return;
      }
      if (draggingConnection) {
        draggingConnection = null;
        pushHistory();
        render();
        save();
        return;
      }
      if (connectSource && tempConnection) {
        tempConnection.remove();
        tempConnection = null;
        if (hoverPort && hoverPort.component !== connectSource.component) {
          const fromComp = connectSource.component;
          const toComp = hoverPort.component;
          const fromPort = connectSource.port;
          const toPort = hoverPort.port;
          fromComp.connections = fromComp.connections || [];
          const newConn = {
            target: toComp.id,
            sourcePort: fromPort,
            targetPort: toPort,
            cable: null,
            phases: [],
            conductors: 0,
            impedance: { r: 0, x: 0 },
            rating: null
          };
          fromComp.connections.push(newConn);

          try {
            const res = await chooseCable(fromComp, toComp, newConn);
            if (res) {
              newConn.cable = res.cable;
              newConn.phases = res.phases;
              newConn.conductors = res.conductors;
              addCable(res.cable);
            }
            const fromTag = fromComp.ref || fromComp.id;
            const toTag = toComp.ref || toComp.id;
            addRaceway({ conduit_id: `${fromTag}-${toTag}`, from_tag: fromTag, to_tag: toTag });
          } catch (err) {
            console.error('Failed to record connection', err);
          }

          pushHistory();
          render();
          save();
        }
        connectSource = null;
        hoverPort = null;
        connectMode = false;
        connectBtn?.classList.remove('active');
        render();
        return;
      }
      if (dragOffset && dragOffset.length) {
        if (dragging) {
          pushHistory();
          render();
          save();
        }
        dragOffset = null;
        dragging = false;
      } else {
        dragOffset = null;
      }
    });
  svg.addEventListener('click', async e => {
    if (dimensionMode) {
      let x = e.offsetX;
      let y = e.offsetY;
      if (gridEnabled) {
        x = Math.round(x / gridSize) * gridSize;
        y = Math.round(y / gridSize) * gridSize;
      }
      if (!dimensionStart) {
        dimensionStart = { x, y };
      } else {
        components.push({ id: 'd' + Date.now(), type: 'dimension', x1: dimensionStart.x, y1: dimensionStart.y, x2: x, y2: y });
        dimensionStart = null;
        pushHistory();
        render();
        save();
      }
      return;
    }
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
      selectComponent(contextTarget.id);
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

  const tourBtn = document.getElementById('tour-btn');
  if (tourBtn) tourBtn.addEventListener('click', () => {
    startTour();
    localStorage.setItem('onelineTourDone', 'true');
  });
  if (!localStorage.getItem('onelineTourDone')) {
    startTour();
    localStorage.setItem('onelineTourDone', 'true');
  }

  const params = new URLSearchParams(window.location.search);
  const focus = params.get('component');
  if (focus) {
    const comp = components.find(c => c.id === focus);
    if (comp) selectComponent(comp);
  }

  initSettings();
  initDarkMode();
  initCompactMode();
  initNavToggle();
}

function getCategory(c) {
  return c.type || subtypeCategory[c.subtype];
}

function showToast(msg, linkText, linkHref) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  if (linkText && linkHref) {
    const a = document.createElement('a');
    a.href = linkHref;
    a.textContent = linkText;
    a.target = '_blank';
    t.append(' ', a);
  }
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
    g.querySelectorAll('.issue-badge').forEach(b => b.remove());
    const comp = components.find(c => c.id === g.dataset.id);
    if (!comp) return;
    const tip = [];
    if (comp.label) tip.push(`Label: ${comp.label}`);
    if (comp.voltage) tip.push(`Voltage: ${comp.voltage}`);
    if (comp.rating) tip.push(`Rating: ${comp.rating}`);
    g.setAttribute('data-tooltip', tip.join('\n'));
  });

  const idMap = new Map();
  const inbound = new Map();
  components.forEach(c => {
    if (c.type === 'dimension') return;
    idMap.set(c.id, (idMap.get(c.id) || 0) + 1);
    inbound.set(c.id, 0);
  });

  function phaseSet(val) {
    if (Array.isArray(val)) return val.map(p => String(p).toUpperCase());
    if (typeof val === 'number') {
      if (val === 3) return ['A', 'B', 'C'];
      if (val === 2) return ['A', 'B'];
      if (val === 1) return ['A'];
      return [];
    }
    if (typeof val === 'string') {
      if (/^\d+$/.test(val.trim())) return phaseSet(parseInt(val, 10));
      return val
        .split(/[\s,]+/)
        .map(p => p.trim().toUpperCase())
        .filter(Boolean);
    }
    return [];
  }

  components.forEach(c => {
    if (c.type === 'dimension') return;
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
      if (target) {
        const srcPh = phaseSet(c.phases);
        const tgtPh = phaseSet(target.phases);
        const connPh = conn.phases ? phaseSet(conn.phases) : null;
        if (connPh && connPh.length) {
          if (srcPh.length && !connPh.every(p => srcPh.includes(p))) {
            validationIssues.push({
              component: c.id,
              message: `Phase mismatch with ${target.label || target.subtype || target.id}`
            });
          }
          if (tgtPh.length && !connPh.every(p => tgtPh.includes(p))) {
            validationIssues.push({
              component: target.id,
              message: `Phase mismatch with ${c.label || c.subtype || c.id}`
            });
          }
        } else if (srcPh.length && tgtPh.length && !tgtPh.every(p => srcPh.includes(p))) {
          validationIssues.push({
            component: c.id,
            message: `Phase mismatch with ${target.label || target.subtype || target.id}`
          });
          validationIssues.push({
            component: target.id,
            message: `Phase mismatch with ${c.label || c.subtype || c.id}`
          });
        }
      }
    });
  });

  components.forEach(c => {
    if (c.type === 'dimension') return;
    if ((c.connections || []).length + (inbound.get(c.id) || 0) === 0) {
      validationIssues.push({ component: c.id, message: 'Unconnected component' });
    }
  });

  components.forEach(c => {
    if (c.type === 'dimension') return;
    (c.connections || []).forEach(conn => {
      if (conn.cable && conn.cable.sizing_warning) {
        validationIssues.push({ component: c.id, message: conn.cable.sizing_warning });
      }
    });
  });

  idMap.forEach((count, id) => {
    if (count > 1) {
      components.filter(c => c.id === id).forEach(c => {
        validationIssues.push({ component: c.id, message: `Duplicate ID "${id}"` });
      });
    }
  });

  // Run additional validation rules
  validationIssues.push(...runValidation(components, getStudies()));

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
    const badge = document.createElementNS(svgNS, 'g');
    badge.setAttribute('class', 'issue-badge');
    const comp = components.find(c => c.id === id) || {};
    const w = comp.width || compWidth;
    const x0 = comp.x || 0;
    const y0 = comp.y || 0;
    const circ = document.createElementNS(svgNS, 'circle');
    circ.setAttribute('cx', x0 + w - 8);
    circ.setAttribute('cy', y0 + 8);
    circ.setAttribute('r', 8);
    circ.setAttribute('fill', '#c00');
    const txt = document.createElementNS(svgNS, 'text');
    txt.setAttribute('x', x0 + w - 8);
    txt.setAttribute('y', y0 + 11);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('font-size', '12');
    txt.setAttribute('fill', '#fff');
    txt.textContent = '!';
    badge.appendChild(circ);
    badge.appendChild(txt);
    g.appendChild(badge);
  });

  lintList.innerHTML = '';
  if (validationIssues.length) {
    validationIssues.forEach(issue => {
      const li = document.createElement('li');
      li.textContent = issue.message;
      li.addEventListener('click', () => focusComponent(issue.component));
      lintList.appendChild(li);
    });
    lintPanel.classList.remove('hidden');
  } else {
    lintPanel.classList.add('hidden');
  }

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

function updateComponent(id, fields = {}) {
  const comp = components.find(c => c.id === id || c.ref === id);
  if (!comp) return;
  const mapping = { description: 'label', id: 'ref', subCategory: 'subtype' };
  Object.entries(fields).forEach(([k, v]) => {
    if (k === 'ref') return;
    const prop = mapping[k] || k;
    if (prop === 'id') return;
    comp[prop] = v;
  });
  render();
  save(false);
}

function syncSchedules(notify = true) {
  const all = sheets.flatMap(s => s.components);
  const findPanelId = id => {
    const src = all.find(s => (s.connections || []).some(conn => conn.target === id));
    if (!src) return null;
    if (getCategory(src) === 'panel') return src.ref || src.id;
    return findPanelId(src.id);
  };
  const mapFields = c => {
    const src = all.find(s => (s.connections || []).some(conn => conn.target === c.id));
    const conn = src ? (src.connections || []).find(cc => cc.target === c.id) : null;
    const connPhases = conn?.phases ? conn.phases.join(',') : c.phases ?? '';
    const connConductors = conn?.conductors || conn?.cable?.conductors || '';
    const fields = {
      id: c.ref || c.id,
      ref: c.id,
      description: c.label,
      voltage: c.voltage ?? '',
      manufacturer: c.manufacturer ?? '',
      model: c.model ?? '',
      voltage_class: c.voltage_class ?? '',
      enclosure: c.enclosure ?? '',
      thermal_rating: c.thermal_rating ?? '',
      phases: connPhases,
      conductors: connConductors,
      notes: c.notes ?? '',
      rating: c.rating ?? '',
      impedance_r: c.impedance?.r ?? '',
      impedance_x: c.impedance?.x ?? '',
      voltage_mag: typeof c.voltage_mag === 'number' ? c.voltage_mag : '',
      voltage_angle: typeof c.voltage_angle === 'number' ? c.voltage_angle : '',
      voltage_mag_a: c.voltage_mag?.A ?? c.voltage_mag?.a ?? '',
      voltage_mag_b: c.voltage_mag?.B ?? c.voltage_mag?.b ?? '',
      voltage_mag_c: c.voltage_mag?.C ?? c.voltage_mag?.c ?? '',
      voltage_angle_a: c.voltage_angle?.A ?? c.voltage_angle?.a ?? '',
      voltage_angle_b: c.voltage_angle?.B ?? c.voltage_angle?.b ?? '',
      voltage_angle_c: c.voltage_angle?.C ?? c.voltage_angle?.c ?? '',
      category: getCategory(c),
      subCategory: c.subtype ?? '',
      x: c.x ?? '',
      y: c.y ?? '',
      z: c.z ?? ''
    };
    (propSchemas[c.subtype] || []).forEach(f => {
      fields[f.name] = c[f.name] ?? f.default ?? fields[f.name] ?? '';
    });
    return fields;
  };
  const equipment = all
    .filter(c => getCategory(c) === 'equipment')
    .map(mapFields);
  const panels = all
    .filter(c => getCategory(c) === 'panel')
    .map(mapFields);
  const loads = all
    .filter(c => getCategory(c) === 'load')
    .map(c => {
      const fields = mapFields(c);
      const panelId = findPanelId(c.id);
      if (panelId) fields.panelId = panelId;
      return fields;
    });
  const buses = all
    .filter(c => c.subtype === 'Bus')
    .map(mapFields);
  setEquipment([...equipment, ...buses]);
  setPanels([...panels, ...buses]);
  setLoads(loads);
  const cables = getCables();
  all.forEach(c => {
    (c.connections || []).forEach(conn => {
      if (!conn.cable) return;
      const target = all.find(t => t.id === conn.target);
      const spec = {
        ...conn.cable,
        phases: conn.phases ? conn.phases.join(',') : conn.cable.phases,
        conductors: conn.conductors || conn.cable.conductors,
        from_tag: c.ref || c.id,
        to_tag: target?.ref || conn.target
      };
      const unitPerPx = diagramScale.unitPerPx || 1;
      const slack = parseFloat(conn.cable?.slack_pct ?? cableSlackPct) || 0;
      const autoLen = (conn.length || 0) * unitPerPx * (1 + slack / 100);
      let finalLen = autoLen;
      if (conn.cable?.manual_length) {
        const manual = parseFloat(conn.cable.length);
        if (!isNaN(manual)) finalLen = manual;
      }
      spec.length = finalLen.toFixed(2);
      spec.slack_pct = conn.cable?.slack_pct ?? cableSlackPct;
      if (conn.cable?.manual_length) spec.manual_length = true;
      conn.cable.length = spec.length;
      const load = {
        current: parseFloat(target?.current) || 0,
        voltage: parseFloat(target?.voltage) || parseFloat(c.voltage) || 0,
        phases: conn.phases ? conn.phases.length : parseInt(target?.phases || c.phases || 3, 10)
      };
      const params = {
        length: finalLen,
        material: spec.conductor_material || 'cu',
        insulation_rating: parseFloat(target?.insulation_rating) || 90,
        ambient: parseFloat(spec.ambient_temp) || parseFloat(c.ambient) || 30,
        conductors: parseInt(spec.conductors) || 1,
        maxVoltageDrop: parseFloat(target?.maxVoltageDrop) || 3,
        code: target?.code || 'NEC'
      };
      const res = sizeConductor(load, params);
      spec.calc_ampacity = res.ampacity ? res.ampacity.toFixed(2) : '';
      spec.voltage_drop_pct = res.voltageDrop ? res.voltageDrop.toFixed(2) : '';
      spec.sizing_warning = res.violation || '';
      spec.code_reference = res.codeRef || '';
      spec.sizing_report = JSON.stringify(res.report || {});
      Object.assign(conn.cable, {
        calc_ampacity: spec.calc_ampacity,
        voltage_drop_pct: spec.voltage_drop_pct,
        sizing_warning: spec.sizing_warning,
        code_reference: spec.code_reference,
        sizing_report: spec.sizing_report,
        ambient_temp: spec.ambient_temp,
        install_method: spec.install_method,
        phases: spec.phases,
        conductors: spec.conductors,
        length: spec.length,
        slack_pct: spec.slack_pct,
        manual_length: conn.cable?.manual_length
      });
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

function serializeState() {
  save(false);
  function extractSchedules(comps) {
    const mapFields = c => {
      const src = comps.find(s => (s.connections || []).some(conn => conn.target === c.id));
      const conn = src ? (src.connections || []).find(cc => cc.target === c.id) : null;
      const connPhases = conn?.phases ? conn.phases.join(',') : c.phases ?? '';
      const connConductors = conn?.conductors || conn?.cable?.conductors || '';
      const fields = {
        id: c.ref || c.id,
        ref: c.id,
        description: c.label,
        manufacturer: c.manufacturer ?? '',
        model: c.model ?? '',
        phases: connPhases,
        conductors: connConductors,
        notes: c.notes ?? '',
        voltage: c.voltage ?? '',
        voltage_mag: typeof c.voltage_mag === 'number' ? c.voltage_mag : '',
        voltage_angle: typeof c.voltage_angle === 'number' ? c.voltage_angle : '',
        voltage_mag_a: c.voltage_mag?.A ?? c.voltage_mag?.a ?? '',
        voltage_mag_b: c.voltage_mag?.B ?? c.voltage_mag?.b ?? '',
        voltage_mag_c: c.voltage_mag?.C ?? c.voltage_mag?.c ?? '',
        voltage_angle_a: c.voltage_angle?.A ?? c.voltage_angle?.a ?? '',
        voltage_angle_b: c.voltage_angle?.B ?? c.voltage_angle?.b ?? '',
        voltage_angle_c: c.voltage_angle?.C ?? c.voltage_angle?.c ?? '',
        category: getCategory(c),
        subCategory: c.subtype ?? '',
        x: c.x ?? '',
        y: c.y ?? '',
        z: c.z ?? ''
      };
      (propSchemas[c.subtype] || []).forEach(f => {
        fields[f.name] = c[f.name] ?? fields[f.name] ?? '';
      });
      return fields;
    };
    const equipment = comps
      .filter(c => getCategory(c) === 'equipment')
      .map(mapFields);
    const panels = comps
      .filter(c => getCategory(c) === 'panel')
      .map(mapFields);
    const loads = comps
      .filter(c => getCategory(c) === 'load')
      .map(mapFields);
    const buses = comps
      .filter(c => c.subtype === 'Bus')
      .map(mapFields);
    const cables = [];
    comps.forEach(c => {
      (c.connections || []).forEach(conn => {
        if (!conn.cable) return;
        const target = comps.find(t => t.id === conn.target);
        cables.push({
          ...conn.cable,
          phases: conn.phases ? conn.phases.join(',') : conn.cable.phases,
          conductors: conn.conductors || conn.cable.conductors,
          from_tag: c.ref || c.id,
          to_tag: target?.ref || conn.target
        });
      });
    });
    return { equipment: [...equipment, ...buses], panels: [...panels, ...buses], loads, cables };
  }
  return {
    meta: { scenario: getCurrentScenario() },
    version: DIAGRAM_VERSION,
    templates: templates.map(t => ({ ...t })),
    scale: diagramScale,
    sheets: sheets.map(s => {
      const comps = s.components.map(c => ({
        ...c,
        rotation: c.rotation || 0,
        flipped: !!c.flipped
      }));
      return { name: s.name, components: comps, schedules: extractSchedules(comps) };
    })
  };
}

function exportDiagram() {
  const data = {
    sheets: sheets.map(s => ({
      name: s.name,
      components: s.components.map(c => ({ ...c })),
      connections: (s.connections || []).map(conn => ({ ...conn }))
    }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'oneline.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function shareDiagram() {
  const token = prompt('GitHub token (only needed once)', getItem('gistToken', ''));
  if (!token) return;
  setItem('gistToken', token);
  const body = {
    public: true,
    files: {
      'oneline.json': {
        content: JSON.stringify(serializeState(), null, 2)
      }
    }
  };
  try {
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `token ${token}`
      },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      const data = await res.json();
      await navigator.clipboard.writeText(data.html_url);
      showToast('Share link copied to clipboard');
    } else {
      showToast('Failed to share diagram');
    }
  } catch (err) {
    console.error('Share failed', err);
    showToast('Share failed');
  }
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


function migrateDiagram(data) {
  if (Array.isArray(data)) {
    data = { version: 0, templates: [], sheets: [{ name: 'Sheet 1', components: data }] };
  }
  const version = data.version || 0;
  let migrated = data;
  if (version < 1) {
    migrated = {
      version: 1,
      templates: data.templates || [],
      sheets: data.sheets || []
    };
  }
  if (version < 2) {
    migrated.scale = data.scale || { unitPerPx: 1, unit: 'in' };
  }
  migrated.version = DIAGRAM_VERSION;
  return migrated;
}

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await importDiagram(data);
  } catch (err) {
    console.error('Failed to import diagram', err);
  }
  e.target.value = '';
}

async function importDiagram(data) {
  if (data.meta && data.meta.scenario) {
    switchScenario(data.meta.scenario);
  }
  data = migrateDiagram(data);
  diagramScale = data.scale || { unitPerPx: 1, unit: 'in' };
  setItem('diagramScale', diagramScale);
  templates = data.templates || [];
  saveTemplates();
  renderTemplates();
  sheets = (data.sheets || []).map((s, i) => ({
    name: s.name || `Sheet ${i + 1}`,
    components: (s.components || []).map(normalizeComponent),
    connections: Array.isArray(s.connections) ? s.connections : []
  }));
  if (sheets.length) {
    loadSheet(0);
    renderSheetTabs();
    save();
  }
}

async function loadSampleDiagram() {
  try {
    const res = await fetch(new URL('examples/sample_oneline.json', baseUrl).href);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    await importDiagram(data);
  } catch (err) {
    console.error('Failed to load sample diagram', err);
    showToast('Failed to load sample diagram');
  }
}

if (typeof window !== 'undefined') {
  window.updateComponent = updateComponent;
  window.loadComponentLibrary = loadComponentLibrary;
  window.loadManufacturerLibrary = loadManufacturerLibrary;
}

async function __oneline_init() {
  suppressResumeIfE2E();

  buildPalette();

  // Load libraries
  try { await loadComponentLibrary(); } catch (e) { console.error('loadComponentLibrary failed:', e); }
  try { await loadManufacturerLibrary(); } catch (e) { console.error('loadManufacturerLibrary failed:', e); }
  try { await loadProtectiveDevices(); } catch (e) { console.error('loadProtectiveDevices failed:', e); }

  await init();

  e2eOpenDetails();
  setReadyWhen('[data-testid="palette-button"]', 'data-oneline-ready', 'oneline-ready-beacon');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', __oneline_init, { once: true });
} else {
  __oneline_init();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', forceShowResumeIfE2E, { once: true });
} else {
  forceShowResumeIfE2E();
}

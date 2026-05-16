import * as dataStore from './dataStore.mjs';
import { escapeHtml as escapeAttr, escapeHtml } from './src/htmlUtils.mjs';
import { openModal, showAlertModal } from './src/components/modal.js';
import {
  getEquipmentSourceOptions,
  mergeLoadRows,
  previewLoadImport,
  summarizeLoadValidation
} from './analysis/loadWorkflow.mjs';

const E2E = typeof location !== 'undefined' && new URLSearchParams(location.search).has('e2e');
if (E2E && typeof localStorage !== 'undefined' && new URLSearchParams(location.search).has('e2e_reset')) {
  try { localStorage.clear(); sessionStorage.clear(); } catch {}
}

class ContextMenu {
  constructor(items = []) {
    this.items = items;
    this.menu = document.createElement('ul');
    this.menu.className = 'context-menu';
    this.menu.setAttribute('role', 'menu');
    document.body.appendChild(this.menu);
    document.addEventListener('click', () => this.hide());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.hide(); });
  }

  setItems(items) {
    this.items = items;
    this.menu.innerHTML = '';
    items.forEach(({ label, action }) => {
      const li = document.createElement('li');
      li.textContent = label;
      li.setAttribute('role', 'menuitem');
      li.tabIndex = 0;
      li.addEventListener('click', () => {
        const target = this.target;
        this.hide();
        action(target);
      });
      li.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); }
      });
      this.menu.appendChild(li);
    });
  }

  show(x, y, target) {
    this.target = target;
    this.menu.style.left = `${x}px`;
    this.menu.style.top = `${y}px`;
    this.menu.style.display = 'block';
  }

  hide() {
    this.menu.style.display = 'none';
    this.target = null;
  }
}

export function calculateDerived(load) {
  const qty = parseFloat(load.quantity) || 1;
  const voltage = parseFloat(load.voltage);
  const kw = parseFloat(load.kw);
  const pf = parseFloat(load.powerFactor);
  const lf = parseFloat(load.loadFactor);
  const eff = parseFloat(load.efficiency);
  const df = parseFloat(load.demandFactor);
  const phases = parseInt(load.phases, 10);
  const totalKw = isNaN(kw) ? 0 : kw * qty;
  const lfKw = isNaN(lf) ? totalKw : totalKw * (lf / 100);
  const effKw = isNaN(eff) || eff === 0 ? lfKw : lfKw / (eff / 100);
  const kVA = pf ? effKw / pf : effKw;
  const phaseFactor = phases === 1 ? 1 : Math.sqrt(3);
  const current = voltage ? (kVA * 1000) / (phaseFactor * voltage) : 0;
  const demandKW = effKw * (isNaN(df) ? 1 : df / 100);
  const demandKVA = pf ? demandKW / pf : demandKW;
  return { kva: kVA, current, demandKw: demandKW, demandKva: demandKVA };
}

export function aggregateLoadsBySource(loads) {
  return loads.reduce((acc, load) => {
    const src = load.source || '';
    const { kva, demandKw, demandKva } = calculateDerived(load);
    const qty = parseFloat(load.quantity) || 1;
    const kW = (parseFloat(load.kw) || 0) * qty;
    if (!acc[src]) acc[src] = { kW: 0, kVA: 0, demandKW: 0, demandKVA: 0 };
    acc[src].kW += kW;
    acc[src].kVA += parseFloat(load.kva) || kva;
    acc[src].demandKW += parseFloat(load.demandKw) || demandKw;
    acc[src].demandKVA += parseFloat(load.demandKva) || demandKva;
    return acc;
  }, {});
}

// Inline load list editor
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const projectId = window.currentProjectId || 'default';
    dataStore.loadProject(projectId);
    dataStore.on(dataStore.STORAGE_KEYS.loads, () => dataStore.saveProject(projectId));
    dataStore.on(dataStore.STORAGE_KEYS.equipment, () => refreshSourceOptions());
    initSettings();
    initDarkMode();
    initCompactMode();
    initNavToggle();

    const table = document.getElementById('load-table');
    const tbody = table.querySelector('tbody');
    const tfoot = table.querySelector('tfoot');
    const deleteBtn = document.getElementById('delete-selected-btn');
    const selectAll = document.getElementById('select-all');
    const summaryDiv = document.getElementById('source-summary');
    const addRowBtn = document.getElementById('add-row-btn');
    const searchInput = document.getElementById('load-search');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const resultsCount = document.getElementById('load-results-count');
    const quickFilterButtons = Array.from(document.querySelectorAll ? document.querySelectorAll('.loadlist-chip') : []);
    const summaryPanel = document.getElementById('load-summary-panel');
    const validationSummary = document.getElementById('load-validation-summary');
    const nextActionEl = document.getElementById('load-next-action');
    const sourceList = document.getElementById('load-source-list');
    const emptyGuide = document.getElementById('load-empty-guide');
    const sampleLoadsBtn = document.getElementById('load-sample-loads-btn');
    const batchEditBtn = document.getElementById('open-load-batch-btn');
    const viewPresetButtons = Array.from(document.querySelectorAll ? document.querySelectorAll('[data-load-view]') : []);
    let clipboard = null;
    let rendering = false;
    let filterQuery = '';
    let activeQuickFilter = 'all';
    let activeViewPreset = dataStore.getItem(dataStore.STORAGE_KEYS.loadListViewPreset, 'basic');
    const rowClass = tbody.dataset.rowClass || 'load-row';
    const requiredFields = {
      source: 'Source',
      kw: 'kW',
      voltage: 'Voltage',
      powerFactor: 'Power Factor',
      phases: 'Phases'
    };
    const loadTypeDefaults = {
      Motor: { loadType: 'Motor', duty: 'Continuous', voltage: '480', powerFactor: '0.85', loadFactor: '100', efficiency: '92', demandFactor: '125', phases: '3' },
      Lighting: { loadType: 'Lighting', duty: 'Continuous', voltage: '120', powerFactor: '0.95', loadFactor: '100', efficiency: '100', demandFactor: '100', phases: '1' },
      Receptacle: { loadType: 'Receptacle', duty: 'Intermittent', voltage: '120', powerFactor: '0.90', loadFactor: '100', efficiency: '100', demandFactor: '50', phases: '1' },
      HVAC: { loadType: 'HVAC', duty: 'Continuous', voltage: '480', powerFactor: '0.88', loadFactor: '100', efficiency: '92', demandFactor: '100', phases: '3' },
      Heater: { loadType: 'Heater', duty: 'Continuous', voltage: '480', powerFactor: '1.00', loadFactor: '100', efficiency: '100', demandFactor: '100', phases: '3' },
      UPS: { loadType: 'UPS', duty: 'Continuous', voltage: '480', powerFactor: '0.90', loadFactor: '100', efficiency: '95', demandFactor: '100', phases: '3' },
      'EV Charger': { loadType: 'EV Charger', duty: 'Continuous', voltage: '208', powerFactor: '0.98', loadFactor: '100', efficiency: '96', demandFactor: '100', phases: '3' },
      Spare: { loadType: 'Spare', duty: 'Stand-by', demandFactor: '0' }
    };
    const starterLoads = [
      { source: 'SWBD-1', tag: 'MTR-101', description: 'Process pump motor', quantity: '1', voltage: '480', kw: '18.6', circuit: 'MCC-1-01', ...loadTypeDefaults.Motor },
      { source: 'PNL-L1', tag: 'LTG-101', description: 'Office lighting zone', quantity: '1', voltage: '120', kw: '3.2', circuit: 'L1-03', ...loadTypeDefaults.Lighting },
      { source: 'PNL-L1', tag: 'REC-101', description: 'General receptacles', quantity: '12', voltage: '120', kw: '0.18', circuit: 'L1-05', ...loadTypeDefaults.Receptacle },
      { source: 'MCC-1', tag: 'AHU-101', description: 'Air handling unit', quantity: '1', voltage: '480', kw: '22', circuit: 'MCC-1-05', ...loadTypeDefaults.HVAC },
      { source: 'SWBD-1', tag: 'UPS-101', description: 'Controls UPS input', quantity: '1', voltage: '480', kw: '12', circuit: 'SWBD-1-12', ...loadTypeDefaults.UPS }
    ];
    const viewPresets = {
      basic: ['select', 'source', 'tag', 'description', 'quantity', 'voltage', 'loadType', 'duty', 'kw', 'powerFactor', 'phases', 'circuit', 'kva', 'current', 'actions'],
      electrical: ['select', 'source', 'tag', 'description', 'quantity', 'voltage', 'kw', 'powerFactor', 'phases', 'kva', 'current', 'circuit', 'actions'],
      demand: ['select', 'source', 'tag', 'description', 'loadType', 'duty', 'kw', 'loadFactor', 'demandFactor', 'demandKva', 'demandKw', 'actions'],
      procurement: ['select', 'source', 'tag', 'description', 'manufacturer', 'model', 'quantity', 'voltage', 'loadType', 'notes', 'actions'],
      full: ['select', 'source', 'tag', 'description', 'manufacturer', 'model', 'quantity', 'voltage', 'loadType', 'duty', 'kw', 'powerFactor', 'loadFactor', 'efficiency', 'demandFactor', 'phases', 'circuit', 'notes', 'kva', 'current', 'demandKva', 'demandKw', 'actions']
    };
    const loadFields = [
      { key: 'source', label: 'Source / Panel', aliases: ['source', 'panel', 'source panel', 'source/panel', 'feed from'] },
      { key: 'tag', label: 'Tag / ID', aliases: ['tag', 'id', 'tag/id', 'load id', 'load tag', 'equipment tag'] },
      { key: 'description', label: 'Description', aliases: ['description', 'load description', 'name', 'load name'] },
      { key: 'manufacturer', label: 'Manufacturer', aliases: ['manufacturer', 'mfr', 'make'] },
      { key: 'model', label: 'Model', aliases: ['model', 'catalog', 'part number'] },
      { key: 'quantity', label: 'Qty', aliases: ['qty', 'quantity', 'count'] },
      { key: 'voltage', label: 'Voltage', aliases: ['voltage', 'volts', 'v', 'voltage v'] },
      { key: 'loadType', label: 'Load Type', aliases: ['load type', 'type', 'category', 'load category'] },
      { key: 'duty', label: 'Duty', aliases: ['duty', 'duty cycle', 'service'] },
      { key: 'kw', label: 'kW', aliases: ['kw', 'power', 'load kw', 'kilowatt', 'kilowatts'] },
      { key: 'powerFactor', label: 'Power Factor', aliases: ['power factor', 'pf', 'p.f.', 'powerfactor'] },
      { key: 'loadFactor', label: 'Load Factor (%)', aliases: ['load factor', 'load factor %', 'lf'] },
      { key: 'efficiency', label: 'Efficiency (%)', aliases: ['efficiency', 'efficiency %', 'eff'] },
      { key: 'demandFactor', label: 'Demand Factor (%)', aliases: ['demand factor', 'demand factor %', 'df'] },
      { key: 'phases', label: 'Phases', aliases: ['phases', 'phase', 'ph'] },
      { key: 'circuit', label: 'Panel Circuit', aliases: ['circuit', 'panel circuit', 'breaker', 'ckt'] },
      { key: 'notes', label: 'Notes', aliases: ['notes', 'comments', 'remarks'] }
    ];
    const blankLoad = {
      source: '',
      tag: '',
      description: '',
      manufacturer: '',
      model: '',
      quantity: '',
      voltage: '',
      loadType: '',
      duty: '',
      kw: '',
      powerFactor: '',
      loadFactor: '',
      efficiency: '',
      demandFactor: '',
      phases: '',
      circuit: '',
      notes: ''
    };
    if (!viewPresets[activeViewPreset]) activeViewPreset = 'basic';

    // --- helpers ------------------------------------------------------------
    function format(num) {
      const n = Number(num);
      return Number.isFinite(n) && n !== 0 ? n.toFixed(2) : '';
    }

    function isMeaningfulLoad(load) {
      if (!load) return false;
      return [
        'source',
        'tag',
        'description',
        'manufacturer',
        'model',
        'quantity',
        'voltage',
        'loadType',
        'kw',
        'powerFactor',
        'phases',
        'circuit',
        'notes'
      ].some(name => String(load[name] ?? '').trim());
    }

    function requiredMissing(load) {
      if (!isMeaningfulLoad(load)) return [];
      return Object.entries(requiredFields)
        .filter(([name]) => !String(load[name] ?? '').trim())
        .map(([, label]) => label);
    }

    function hasMissingElectrical(load) {
      if (!isMeaningfulLoad(load)) return false;
      return ['kw', 'voltage', 'powerFactor', 'phases'].some(name => !String(load[name] ?? '').trim());
    }

    function getVisibleLoads(loads = dataStore.getLoads()) {
      return loads.filter(isMeaningfulLoad);
    }

    function connectedKw(load) {
      const qty = parseFloat(load.quantity) || 1;
      const kw = parseFloat(load.kw) || 0;
      return qty * kw;
    }

    function normalizeHeader(value) {
      return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    function createIcon(path) {
      const img = document.createElement('img');
      img.src = path;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      img.className = 'control-icon';
      img.loading = 'lazy';
      img.decoding = 'async';
      return img;
    }

    function setButtonContents(button, iconPath, label) {
    button.textContent = '';
    button.appendChild(createIcon(iconPath));
    if (label) button.append(document.createTextNode(label));
  }
    function gatherRow(tr) {
      const load = { ref: tr.dataset.ref || '' };
      tr.querySelectorAll('input[name],select[name],textarea[name]').forEach(el => {
        load[el.name] = el.value.trim();
      });
      load.id = tr.dataset.id || load.tag || '';
      return load;
    }

    function getStoreIndex(tr) {
      return Number(tr.dataset.storeIndex ?? tr.dataset.index);
    }

    function validateRange(input, min, max) {
      if (!input) return true;
      const raw = input.value.trim();
      if (raw === '') return true;
      const value = Number(raw);
      return Number.isFinite(value) && value >= min && value <= max;
    }

  function saveRow(tr) {
    const idx = getStoreIndex(tr);
    const load = gatherRow(tr);
    const numericFields = ['quantity','voltage','kw','powerFactor','loadFactor','efficiency','demandFactor','phases'];
    const rangeFields = [
      { name: 'powerFactor', min: 0, max: 1 },
      { name: 'loadFactor', min: 0, max: 100 },
      { name: 'efficiency', min: 0, max: 100 },
      { name: 'demandFactor', min: 0, max: 100 }
    ];
    let valid = true;
    numericFields.forEach(name => {
      const input = tr.querySelector(`input[name="${name}"]`);
      if (input) {
        const val = input.value.trim();
        if (val !== '' && isNaN(Number(val))) {
          input.classList.add('input-error');
          input.title = `${name} must be a number.`;
          valid = false;
        } else {
          input.classList.remove('input-error');
          input.removeAttribute('title');
        }
      }
    });
    rangeFields.forEach(({ name, min, max }) => {
      const input = tr.querySelector(`input[name="${name}"]`);
      if (!validateRange(input, min, max)) {
        input.classList.add('input-error');
        input.title = `${name} must be between ${min} and ${max}.`;
        valid = false;
      } else if (input) {
        input.classList.remove('input-error');
        input.removeAttribute('title');
      }
    });
    if (isMeaningfulLoad(load)) {
      Object.entries(requiredFields).forEach(([name, label]) => {
        const input = tr.querySelector(`[name="${name}"]`);
        if (!input) return;
        if (!String(load[name] || '').trim()) {
          input.classList.add('input-error');
          input.title = `${label} is required for demand and export readiness.`;
          input.setAttribute('aria-invalid', 'true');
        } else if (!input.title || (input.title || '').includes('required')) {
          input.classList.remove('input-error');
          input.removeAttribute('title');
          input.removeAttribute('aria-invalid');
        }
      });
    }
    if (!valid) return;
    const computed = calculateDerived(load);
    Object.assign(load, computed);
    dataStore.updateLoad(idx, load);
    tr.dataset.id = load.id;
    tr.querySelector('.kva').textContent = format(computed.kva);
    tr.querySelector('.current').textContent = format(computed.current);
    tr.querySelector('.demand-kva').textContent = format(computed.demandKva);
    tr.querySelector('.demand-kw').textContent = format(computed.demandKw);
    recalculateTotals();
    updateSummary();
    updateLoadStatus(dataStore.getLoads());
    const fn = window.opener?.updateComponent || window.updateComponent;
    if (fn) {
      const id = load.ref || load.id || load.tag;
      if (id) fn(id, load);
    }
  }

  function insertLoad(index, load) {
    dataStore.insertLoad(index, load);
    render();
    const row = tbody.querySelector(`tr[data-store-index="${index}"]`);
    if (row) {
      const inp = row.querySelector('input[name="description"]');
      inp && inp.focus();
    }
  }

  function generateId(existing, base) {
    let id = base || 'item';
    let i = 1;
    while (existing.includes(id)) {
      id = `${base || 'item'}_${i++}`;
    }
    return id;
  }

  tbody.addEventListener('click', e => {
    const btn = e.target;
    const tr = btn.closest('tr');
    if (!tr) return;
    const idx = getStoreIndex(tr);
    if (btn.classList.contains('insertBelowBtn')) {
      insertLoad(idx + 1, { ...blankLoad });
    } else if (btn.classList.contains('duplicateBtn')) {
      const load = gatherRow(tr);
      const ids = dataStore.getLoads().map(l => l.id).filter(Boolean);
      load.id = generateId(ids, load.id || load.tag);
      dataStore.insertLoad(idx + 1, load);
      render();
    } else if (btn.classList.contains('removeBtn')) {
      dataStore.deleteLoad(idx);
      render();
    }
  });

  function handleNav(e, td) {
    const tr = td.parentElement;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      let allSelected = true;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        const start = e.target.selectionStart ?? 0;
        const end = e.target.selectionEnd ?? 0;
        const len = (e.target.value || '').length;
        allSelected = start === 0 && end === len;
      }
      if (allSelected) {
        e.preventDefault();
        const sib = e.key === 'ArrowLeft' ? td.previousElementSibling : td.nextElementSibling;
        if (sib) {
          const next = sib.querySelector('input,select,textarea');
          if (next) {
            next.focus();
            if (typeof next.select === 'function') next.select();
          }
        }
      }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      let targetRow = tr;
      const dir = e.key === 'ArrowUp' ? 'previousElementSibling' : 'nextElementSibling';
      do { targetRow = targetRow[dir]; } while (targetRow && targetRow.style.display === 'none');
      if (targetRow && targetRow.cells[td.cellIndex]) {
        const next = targetRow.cells[td.cellIndex].querySelector('input,select,textarea');
        if (next) { next.focus(); if (typeof next.select === 'function') next.select(); }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const col = td.cellIndex;
      const nextRow = tr.nextElementSibling;
      if (nextRow && nextRow.cells[col]) {
        const next = nextRow.cells[col].querySelector('input,select,textarea');
        if (next) {
          next.focus();
          if (typeof next.select === 'function') next.select();
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      const el = e.target;
      if (el.dataset.prevValue !== undefined) {
        el.value = el.dataset.prevValue;
        el.classList.remove('input-error');
      }
    }
  }

  function applyRowValidation(tr, load) {
    const missing = requiredMissing(load);
    if (typeof tr.classList.toggle === 'function') {
      tr.classList.toggle('load-row-missing', missing.length > 0);
    } else if (missing.length > 0) {
      tr.classList.add('load-row-missing');
    } else {
      tr.classList.remove('load-row-missing');
    }
    Object.entries(requiredFields).forEach(([name, label]) => {
      const input = tr.querySelector(`[name="${name}"]`);
      if (!input) return;
      if (missing.includes(label)) {
        input.classList.add('input-error');
        input.title = `${label} is required for demand and export readiness.`;
        input.setAttribute('aria-invalid', 'true');
      } else if ((input.title || '').includes('required')) {
        input.classList.remove('input-error');
        input.removeAttribute('title');
        input.removeAttribute('aria-invalid');
      }
    });
  }

  function updateSummaryCards(loads = dataStore.getLoads()) {
    if (!summaryPanel) return;
    const visibleLoads = getVisibleLoads(loads);
    const totals = visibleLoads.reduce((acc, load) => {
      const derived = calculateDerived(load);
      acc.connectedKw += connectedKw(load);
      acc.demandKva += derived.demandKva;
      if (!String(load.source || '').trim()) acc.missingSource += 1;
      if (hasMissingElectrical(load)) acc.missingElectrical += 1;
      if (derived.demandKva >= 50) acc.highDemand += 1;
      return acc;
    }, { connectedKw: 0, demandKva: 0, missingSource: 0, missingElectrical: 0, highDemand: 0 });
    const metrics = {
      total: visibleLoads.length,
      connectedKw: totals.connectedKw.toFixed(2),
      demandKva: totals.demandKva.toFixed(2),
      missingElectrical: totals.missingElectrical,
      missingSource: totals.missingSource,
      highDemand: totals.highDemand
    };
    Object.entries(metrics).forEach(([name, value]) => {
      const el = summaryPanel.querySelector(`[data-load-metric="${name}"]`);
      if (el) el.textContent = String(value);
    });
  }

  function updateValidationSummary(loads = dataStore.getLoads()) {
    if (!validationSummary) return;
    const visibleLoads = getVisibleLoads(loads);
    const validation = summarizeLoadValidation(visibleLoads);
    if (!visibleLoads.length) {
      validationSummary.textContent = '';
      validationSummary.className = 'load-validation-summary';
    } else if (validation.incomplete) {
      const parts = [
        validation.missingSource ? `${validation.missingSource} missing source` : '',
        validation.missingKw ? `${validation.missingKw} missing kW` : '',
        validation.missingVoltage ? `${validation.missingVoltage} missing voltage` : '',
        validation.missingPowerFactor ? `${validation.missingPowerFactor} missing power factor` : '',
        validation.missingPhases ? `${validation.missingPhases} missing phases` : ''
      ].filter(Boolean);
      validationSummary.textContent = `${validation.incomplete} load${validation.incomplete === 1 ? '' : 's'} need workflow fields: ${parts.join(', ')}.`;
      validationSummary.className = 'load-validation-summary is-warning';
    } else {
      validationSummary.textContent = 'All loads have the required source and electrical fields.';
      validationSummary.className = 'load-validation-summary is-success';
    }
  }

  function updateLoadNextAction(loads = dataStore.getLoads()) {
    if (!nextActionEl) return;
    const validation = summarizeLoadValidation(getVisibleLoads(loads));
    if (!validation.total) {
      nextActionEl.innerHTML = `
        <div>
          <strong>Next action: Add loads</strong>
          <p>Use equipment tags as sources so the one-line and cable schedule can reconcile cleanly.</p>
        </div>
        <a class="btn primary-btn" href="equipmentlist.html">Review Equipment</a>
      `;
      return;
    }
    if (validation.incomplete) {
      const blockerFilter = validation.missingSource ? 'missingSource' : 'missingElectrical';
      nextActionEl.innerHTML = `
        <div>
          <strong>Next action: Complete load readiness</strong>
          <p>${validation.incomplete} load${validation.incomplete === 1 ? '' : 's'} still need source, kW, voltage, power factor, or phases.</p>
        </div>
        <button class="btn primary-btn" type="button" data-filter="${blockerFilter}">Show Blockers</button>
      `;
      nextActionEl.querySelector('button')?.addEventListener('click', () => {
        activeQuickFilter = blockerFilter;
        quickFilterButtons.forEach(chip => chip.classList.toggle('active', chip.dataset.filter === activeQuickFilter));
        render();
      });
      return;
    }
    nextActionEl.innerHTML = `
      <div>
        <strong>Next action: Continue to One-Line</strong>
        <p>${validation.complete} load${validation.complete === 1 ? '' : 's'} are ready for diagram reconciliation, demand review, or cable schedule work.</p>
      </div>
      <span>
        <a class="btn primary-btn" href="oneline.html">Continue to One-Line</a>
        <a class="btn" href="cableschedule.html">Continue to Cable Schedule</a>
      </span>
    `;
  }

  function refreshSourceOptions() {
    if (!sourceList) return;
    const options = getEquipmentSourceOptions(dataStore.getEquipment());
    sourceList.innerHTML = options.map(value => `<option value="${escapeAttr(value)}"></option>`).join('');
  }

  function updateEmptyGuide(loads = dataStore.getLoads()) {
    if (!emptyGuide) return;
    emptyGuide.hidden = getVisibleLoads(loads).length > 0;
  }

  function updateLoadStatus(loads = dataStore.getLoads()) {
    refreshSourceOptions();
    updateSummaryCards(loads);
    updateValidationSummary(loads);
    updateLoadNextAction(loads);
    updateEmptyGuide(loads);
  }

  function applyViewPreset() {
    const columns = new Set(viewPresets[activeViewPreset] || viewPresets.basic);
    table.querySelectorAll('[data-column]').forEach(cell => {
      cell.hidden = !columns.has(cell.dataset.column);
    });
    viewPresetButtons.forEach(btn => {
      const active = btn.dataset.loadView === activeViewPreset;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function createRow(load, idx, storeIndex = idx) {
    const tr = document.createElement('tr');
    tr.dataset.index = idx;
    tr.dataset.storeIndex = storeIndex;
    if (load.ref) tr.dataset.ref = load.ref;
    if (load.id) tr.dataset.id = load.id;
    tr.classList.add(rowClass);
    tr.innerHTML = `
      <td data-column="select" class="load-sticky-select"><input type="checkbox" class="row-select" aria-label="Select row"></td>
      <td data-column="source" class="load-sticky-source"><input name="source" type="text" list="load-source-list" value="${escapeAttr(load.source || '')}" placeholder="SWBD-101"></td>
      <td data-column="tag" class="load-sticky-tag"><input name="tag" type="text" value="${escapeAttr(load.tag || '')}" placeholder="MTR-101"></td>
      <td data-column="description" class="load-sticky-description"><input name="description" type="text" value="${escapeAttr(load.description || '')}" placeholder="Load description"></td>
      <td data-column="manufacturer"><input name="manufacturer" type="text" class="manufacturer-input" value="${escapeAttr(load.manufacturer || '')}"></td>
      <td data-column="model"><input name="model" type="text" class="model-input" value="${escapeAttr(load.model || '')}"></td>
      <td data-column="quantity"><input name="quantity" type="number" step="any" min="0" maxlength="15" value="${escapeAttr(load.quantity || '')}" placeholder="1"></td>
      <td data-column="voltage"><input name="voltage" type="number" step="any" min="0" maxlength="15" value="${escapeAttr(load.voltage || '')}" placeholder="480"></td>
      <td data-column="loadType"><input name="loadType" type="text" list="load-type-list" value="${escapeAttr(load.loadType || '')}" placeholder="Motor"></td>
      <td data-column="duty"><select name="duty">
        <option value=""></option>
        <option value="Continuous"${load.duty === 'Continuous' ? ' selected' : ''}>Continuous</option>
        <option value="Intermittent"${load.duty === 'Intermittent' ? ' selected' : ''}>Intermittent</option>
        <option value="Stand-by"${load.duty === 'Stand-by' ? ' selected' : ''}>Stand-by</option>
      </select></td>
      <td data-column="kw"><input name="kw" type="number" step="any" min="0" maxlength="15" value="${escapeAttr(load.kw || '')}" placeholder="15"></td>
      <td data-column="powerFactor"><input name="powerFactor" type="number" step="any" min="0" max="1" maxlength="15" value="${escapeAttr(load.powerFactor || '')}" placeholder="0.90"></td>
      <td data-column="loadFactor"><input name="loadFactor" type="number" step="any" min="0" max="100" maxlength="15" value="${escapeAttr(load.loadFactor || '')}" placeholder="100"></td>
      <td data-column="efficiency"><input name="efficiency" type="number" step="any" min="0" max="100" maxlength="15" value="${escapeAttr(load.efficiency || '')}" placeholder="95"></td>
      <td data-column="demandFactor"><input name="demandFactor" type="number" step="any" min="0" max="100" maxlength="15" value="${escapeAttr(load.demandFactor || '')}" placeholder="100"></td>
      <td data-column="phases"><input name="phases" type="number" step="1" min="1" max="3" maxlength="15" value="${escapeAttr(load.phases || '')}" placeholder="3"></td>
      <td data-column="circuit"><input name="circuit" type="text" value="${escapeAttr(load.circuit || '')}" placeholder="L1-01"></td>
      <td data-column="notes"><textarea name="notes">${escapeHtml(load.notes || '')}</textarea></td>
      <td data-column="kva" class="kva">${format(load.kva)}</td>
      <td data-column="current" class="current">${format(load.current)}</td>
      <td data-column="demandKva" class="demand-kva">${format(load.demandKva)}</td>
      <td data-column="demandKw" class="demand-kw">${format(load.demandKw)}</td>
      <td data-column="actions" class="row-actions load-sticky-actions"></td>`;

    Array.from(tr.querySelectorAll('input[type="text"],input[type="number"],select,textarea')).forEach(input => {
      const td = input.parentElement;
      input.addEventListener('focus', () => { input.dataset.prevValue = input.value; });
      input.addEventListener('blur', () => saveRow(tr));
      if (input.tagName === 'SELECT') {
        input.addEventListener('change', () => saveRow(tr));
      }
      input.addEventListener('keydown', e => handleNav(e, td));
    });

    const actTd = tr.querySelector('.row-actions');
    const insertBtn = document.createElement('button');
    insertBtn.type = 'button';
    insertBtn.className = 'insertBelowBtn row-icon-btn';
    insertBtn.title = 'Insert row below';
    insertBtn.setAttribute('aria-label', 'Insert row below');
    setButtonContents(insertBtn, 'icons/toolbar/add-arrangement.svg', '');
    actTd.appendChild(insertBtn);

    const dupBtn = document.createElement('button');
    dupBtn.type = 'button';
    dupBtn.className = 'duplicateBtn row-icon-btn';
    dupBtn.title = 'Duplicate row';
    dupBtn.setAttribute('aria-label', 'Duplicate row');
    setButtonContents(dupBtn, 'icons/toolbar/copy.svg', '');
    actTd.appendChild(dupBtn);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'removeBtn row-icon-btn danger';
    delBtn.title = 'Delete row';
    delBtn.setAttribute('aria-label', 'Delete row');
    setButtonContents(delBtn, 'icons/toolbar/trash.svg', '');
    actTd.appendChild(delBtn);

    const chk = tr.querySelector('.row-select');
    chk.addEventListener('change', () => {
      if (!chk.checked) selectAll.checked = false;
    });

    applyRowValidation(tr, load);
    return tr;
  }

  const menu = new ContextMenu();
  menu.setItems([
    { label: 'Insert Row Above', action: tr => { if (!tr) return; insertLoad(getStoreIndex(tr), blankLoad); } },
    { label: 'Insert Row Below', action: tr => { if (!tr) return; insertLoad(getStoreIndex(tr) + 1, blankLoad); } },
    { label: 'Copy Row', action: tr => { if (!tr) return; clipboard = JSON.parse(JSON.stringify(gatherRow(tr))); } },
    { label: 'Paste Row', action: tr => {
        if (!tr) return;
        if (!clipboard) return;
        const load = JSON.parse(JSON.stringify(clipboard));
        const idx = getStoreIndex(tr);
        const loads = dataStore.getLoads();
        if (idx >= loads.length - 1) {
          dataStore.addLoad(load);
        } else {
          dataStore.insertLoad(idx + 1, load);
        }
        render();
      }
    },
    { label: 'Delete Row', action: tr => { if (!tr) return; dataStore.deleteLoad(getStoreIndex(tr)); render(); } }
  ]);

  table.addEventListener('contextmenu', e => {
    const row = e.target.closest(`.${rowClass}`);
    if (row) {
      e.preventDefault();
      menu.show(e.pageX, e.pageY, row);
    } else if (e.target.closest('#load-table')) {
      e.preventDefault();
    }
  });

  document.addEventListener('keydown', e => {
    const tag = document.activeElement.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return; // allow normal copy/paste
    const row = document.activeElement.closest(`.${rowClass}`);
    if (!row) return;
    if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      clipboard = JSON.parse(JSON.stringify(gatherRow(row)));
      e.preventDefault();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
      if (!clipboard) return;
      const load = JSON.parse(JSON.stringify(clipboard));
      const idx = getStoreIndex(row);
      const loads = dataStore.getLoads();
      if (idx >= loads.length - 1) {
        dataStore.addLoad(load);
      } else {
        dataStore.insertLoad(idx + 1, load);
      }
      render();
      e.preventDefault();
    } else if (e.key === '/' && searchInput) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n' && addRowBtn) {
      e.preventDefault();
      addRowBtn.click();
    }
  });

  function recalculateTotals(loads = dataStore.getLoads()) {
    if (!tfoot) return;
    const totals = getVisibleLoads(loads).reduce((acc, row) => {
      const derived = calculateDerived(row);
      acc.kW += connectedKw(row);
      acc.kVA += derived.kva;
      acc.demandKW += derived.demandKw;
      acc.demandKVA += derived.demandKva;
      return acc;
    }, { kW: 0, kVA: 0, demandKW: 0, demandKVA: 0 });
    tfoot.innerHTML = `<tr>
      <td data-column="select" class="load-sticky-select"></td>
      <td data-column="source" class="load-sticky-source">Totals</td>
      <td data-column="tag" class="load-sticky-tag"></td>
      <td data-column="description" class="load-sticky-description"></td>
      <td data-column="manufacturer"></td>
      <td data-column="model"></td>
      <td data-column="quantity"></td>
      <td data-column="voltage"></td>
      <td data-column="loadType"></td>
      <td data-column="duty"></td>
      <td data-column="kw">${totals.kW.toFixed(2)}</td>
      <td data-column="powerFactor"></td>
      <td data-column="loadFactor"></td>
      <td data-column="efficiency"></td>
      <td data-column="demandFactor"></td>
      <td data-column="phases"></td>
      <td data-column="circuit"></td>
      <td data-column="notes"></td>
      <td data-column="kva">${totals.kVA.toFixed(2)}</td>
      <td data-column="current"></td>
      <td data-column="demandKva">${totals.demandKVA.toFixed(2)}</td>
      <td data-column="demandKw">${totals.demandKW.toFixed(2)}</td>
      <td data-column="actions" class="load-sticky-actions"></td>
    </tr>`;
    applyViewPreset();
  }

  function updateSummary(loads = dataStore.getLoads()) {
    if (!summaryDiv) return;
    const visibleLoads = getVisibleLoads(loads);
    const grouped = aggregateLoadsBySource(visibleLoads);
    const entries = Object.entries(grouped);
    if (!entries.length) {
      summaryDiv.innerHTML = '<p class="source-summary-empty">Source totals will appear after loads are added.</p>';
      return;
    }
    let html = '<div class="source-summary-grid">';
    for (const [src, totals] of entries) {
      const label = src || 'Unassigned Source';
      html += `<article class="source-summary-card">
        <h4>${escapeHtml(label)}</h4>
        <dl>
          <div><dt>kW</dt><dd>${totals.kW.toFixed(2)}</dd></div>
          <div><dt>kVA</dt><dd>${totals.kVA.toFixed(2)}</dd></div>
          <div><dt>Demand kW</dt><dd>${totals.demandKW.toFixed(2)}</dd></div>
          <div><dt>Demand kVA</dt><dd>${totals.demandKVA.toFixed(2)}</dd></div>
        </dl>
      </article>`;
    }
    html += '</div>';
    summaryDiv.innerHTML = html;
  }

  function matchesQuickFilter(load) {
    if (activeQuickFilter === 'missingSource') {
      return isMeaningfulLoad(load) && !String(load.source || '').trim();
    }
    if (activeQuickFilter === 'missingElectrical') {
      return hasMissingElectrical(load);
    }
    if (activeQuickFilter === 'highDemand') {
      const { demandKva } = calculateDerived(load);
      return Number(demandKva) >= 50;
    }
    return true;
  }

  function matchesLoadFilter(load, query) {
    if (!matchesQuickFilter(load)) return false;
    if (!query) return true;
    const haystack = [
      load.source,
      load.tag,
      load.description,
      load.manufacturer,
      load.model,
      load.loadType,
      load.circuit,
      load.notes
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  }

  function render() {
    if (rendering) return;
    rendering = true;
    try {
      tbody.innerHTML = '';
      let loads = dataStore.getLoads();
      const hasStoredLoads = loads.length > 0;
      if (!hasStoredLoads) {
        // Ensure at least one editable row renders even with no stored data
        loads = [{}];
      }
      // Recalculate derived fields for display without rewriting storage
      loads = loads.map(l => ({ ...l, ...calculateDerived(l) }));

      const filtered = loads
        .map((load, storeIndex) => ({ load, storeIndex }))
        .filter(entry => matchesLoadFilter(entry.load, filterQuery));

      if (hasStoredLoads && !filtered.length) {
        tbody.innerHTML = `<tr><td colspan="23" class="empty-state">No matching loads for the current search.</td></tr>`;
      } else {
        filtered.forEach((entry, idx) => tbody.appendChild(createRow(entry.load, idx, entry.storeIndex)));
      }

      selectAll.checked = false;
      recalculateTotals(loads);
      updateSummary(loads);
      updateLoadStatus(loads);
      applyViewPreset();

      if (resultsCount) {
        const resultCount = filtered.length;
        const totalCount = hasStoredLoads ? getVisibleLoads(loads).length : 0;
        if (!filterQuery && activeQuickFilter === 'all') {
          resultsCount.textContent = totalCount ? `${totalCount} load${totalCount === 1 ? '' : 's'}` : '';
        } else {
          resultsCount.textContent = `${resultCount} of ${totalCount} shown`;
        }
      }
    } finally {
      rendering = false;
    }
  }

  // Re-render when load data changes without causing recursive updates
  dataStore.on('loadList', render);

  function loadsToCSV(loads, delimiter = ',') {
    const header = [
      'source',
      'tag',
      'description',
      'manufacturer',
      'model',
      'quantity',
      'voltage',
      'loadType',
      'duty',
      'kw',
      'powerFactor',
      'loadFactor',
      'efficiency',
      'demandFactor',
      'phases',
      'circuit',
      'notes',
      'panelId',
      'breaker',
      'kva',
      'current',
      'demandKva',
      'demandKw'
    ].join(delimiter);
    const lines = loads.map(l => {
      const base = { source: '', manufacturer: '', model: '', notes: '', panelId: '', breaker: '', duty: '', ...l };
      const full = { ...base, ...calculateDerived(base) };
      const vals = [
        full.source,
        full.tag,
        full.description,
        full.manufacturer,
        full.model,
        full.quantity,
        full.voltage,
        full.loadType,
        full.duty,
        full.kw,
        full.powerFactor,
        full.loadFactor,
        full.efficiency,
        full.demandFactor,
        full.phases,
        full.circuit,
        full.notes,
        full.panelId,
        full.breaker,
        full.kva,
        full.current,
        full.demandKva,
        full.demandKw
      ].map(v => {
        v = String(v ?? '').replace(/"/g, '""');
        return v.includes(delimiter) ? `"${v}"` : v;
      });
      return vals.join(delimiter);
    });
    return [header, ...lines].join('\n');
  }

  function parseDelimitedRows(text, delimiter = ',') {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const next = text[i + 1];
      if (ch === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        row.push(cell.trim());
        cell = '';
      } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (ch === '\r' && next === '\n') i += 1;
        row.push(cell.trim());
        if (row.some(value => value !== '')) rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
    row.push(cell.trim());
    if (row.some(value => value !== '')) rows.push(row);
    return rows;
  }

  function inferImportMapping(headers) {
    const normalized = headers.map(normalizeHeader);
    return loadFields.reduce((mapping, field) => {
      const aliases = [field.key, field.label, ...field.aliases].map(normalizeHeader);
      const idx = normalized.findIndex(header => aliases.includes(header));
      if (idx >= 0) mapping[field.key] = headers[idx];
      return mapping;
    }, {});
  }

  function looksLikeHeaderRow(headers) {
    const inferred = inferImportMapping(headers);
    return Object.keys(inferred).length >= 2 || headers.some(header => /description|source|panel|kw|power|voltage|load/i.test(header));
  }

  function mapRowsToLoads(rows, headers, mapping) {
    const headerIndex = new Map(headers.map((header, idx) => [header, idx]));
    return rows.map(row => {
      const load = { ...blankLoad };
      Object.entries(mapping).forEach(([field, header]) => {
        const idx = headerIndex.get(header);
        if (idx !== undefined) load[field] = row[idx] || '';
      });
      const computed = calculateDerived(load);
      return { panelId: '', breaker: '', ...load, ...computed };
    }).filter(isMeaningfulLoad);
  }

  async function openImportMappingDialog(headers, rows, inferredMapping = {}) {
    return openModal({
      title: 'Map Load Import',
      description: 'Match each incoming column to a Load List field before importing.',
      primaryText: 'Import Loads',
      secondaryText: 'Cancel',
      variant: 'wide',
      defaultWidth: 'wide',
      render(body) {
        const form = document.createElement('form');
        form.className = 'modal-form import-mapping-form';
        const preview = rows.slice(0, 3).map(row => row.slice(0, headers.length).join(' | ')).join('\n');
        form.innerHTML = `
          <div class="import-mapping-grid">
            ${loadFields.map(field => `
              <label class="modal-form-field">
                <span>${escapeHtml(field.label)}</span>
                <select data-map-field="${escapeAttr(field.key)}">
                  <option value="">Do not import</option>
                  ${headers.map(header => `<option value="${escapeAttr(header)}"${inferredMapping[field.key] === header ? ' selected' : ''}>${escapeHtml(header)}</option>`).join('')}
                </select>
              </label>
            `).join('')}
          </div>
          <label class="modal-form-field">
            <span>Preview</span>
            <textarea readonly rows="4">${escapeHtml(preview)}</textarea>
          </label>
          <p class="field-hint">At minimum, map Description plus the electrical fields you have available. A preview will show replace and merge counts before changes are applied.</p>
        `;
        body.appendChild(form);
        return form.querySelector('select');
      },
      onSubmit(controller) {
        const mapping = {};
        controller.body.querySelectorAll('[data-map-field]').forEach(select => {
          if (select.value) mapping[select.dataset.mapField] = select.value;
        });
        if (!Object.keys(mapping).length) {
          showAlertModal('Import Mapping Required', 'Map at least one incoming column before importing.');
          return false;
        }
        return mapping;
      }
    });
  }

  async function importMappedRows(headers, rows) {
    const inferred = inferImportMapping(headers);
    const mapping = await openImportMappingDialog(headers, rows, inferred);
    if (!mapping) return null;
    const loads = mapRowsToLoads(rows, headers, mapping);
    if (!loads.length) {
      showAlertModal('Import Error', 'No usable load rows were found after mapping.');
      return null;
    }
    return loads;
  }

  async function openLoadImportPreview(incomingLoads) {
    const preview = previewLoadImport(dataStore.getLoads(), incomingLoads);
    return openModal({
      title: 'Preview Load Import',
      description: 'Choose whether this import replaces the current Load List or merges by ref, id, tag, or description.',
      primaryText: 'Replace Existing',
      secondaryText: 'Cancel',
      defaultWidth: 'medium',
      render(body, controller) {
        const mergeBtn = document.createElement('button');
        mergeBtn.type = 'button';
        mergeBtn.className = 'btn';
        mergeBtn.textContent = 'Merge Records';
        mergeBtn.addEventListener('click', () => controller.close({ mode: 'merge' }));
        const summary = document.createElement('div');
        summary.className = 'import-preview-list';
        summary.innerHTML = `
          <p><strong>${preview.incoming}</strong> incoming load records found.</p>
          <ul>
            <li>Replace would write ${preview.replaceCount} load rows.</li>
            <li>Merge would create ${preview.mergeCreates}, update ${preview.mergeUpdates}, and leave ${preview.mergeUnchanged} unchanged.</li>
            <li>Merge keeps existing load rows that are absent from the import.</li>
          </ul>
        `;
        body.appendChild(summary);
        body.appendChild(mergeBtn);
      },
      onSubmit() {
        return { mode: 'replace' };
      }
    });
  }

  async function applyImportedLoads(incomingLoads) {
    if (!incomingLoads) return;
    const decision = await openLoadImportPreview(incomingLoads);
    if (!decision) return;
    const nextLoads = decision.mode === 'merge'
      ? mergeLoadRows(dataStore.getLoads(), incomingLoads)
      : incomingLoads;
    dataStore.setLoads(nextLoads.map(load => ({ ...load, ...calculateDerived(load) })));
    render();
  }

  async function importCsvText(text) {
    const rows = parseDelimitedRows(text);
    if (!rows.length) return [];
    if (looksLikeHeaderRow(rows[0])) {
      return importMappedRows(rows[0], rows.slice(1));
    }
    return csvToLoads(text);
  }

  async function importJsonText(text) {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) {
      throw new Error('Invalid load data');
    }
    if (!data.length) return [];
    const keys = Array.from(data.reduce((set, row) => {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach(key => set.add(key));
      }
      return set;
    }, new Set()));
    const inferred = inferImportMapping(keys);
    const hasNativeKeys = ['description', 'kw', 'voltage'].some(key => keys.includes(key));
    if (!hasNativeKeys && keys.length) {
      const rows = data.map(row => keys.map(key => row?.[key] ?? ''));
      return importMappedRows(keys, rows);
    }
    return data.map(l => {
      const base = {
        source: '',
        tag: '',
        description: '',
        manufacturer: '',
        model: '',
        quantity: '',
        voltage: '',
        loadType: '',
        duty: '',
        kw: '',
        powerFactor: '',
        loadFactor: '',
        efficiency: '',
        demandFactor: '',
        phases: '',
        circuit: '',
        notes: '',
        panelId: '',
        breaker: '',
        ...l
      };
      if (l && 'power' in l && !String(l.kw || '').trim()) {
        base.kw = base.power;
        delete base.power;
      }
      return { ...base, ...calculateDerived(base) };
    });
  }

  function csvToLoads(text, delimiter = ',') {
    const lines = text.trim().split(/\r?\n/);
    if (!lines.length) return [];
    const first = lines[0].toLowerCase();
    if (first.includes('description') && (first.includes('kw') || first.includes('power'))) lines.shift();
    return lines.map(line => {
      const cols = line
        .split(delimiter)
        .map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
      let load;
      if (cols.length === 13 || cols.length === 14 || cols.length === 16 || cols.length === 17) {
        let source = '';
        let tag, description, manufacturer = '', model = '', quantity, voltage, loadType, duty, kw, powerFactor, loadFactor, efficiency, demandFactor, phases, circuit, notes = '';
        if (cols.length === 13) {
          [tag, description, quantity, voltage, loadType, duty, kw, powerFactor, loadFactor, efficiency, demandFactor, phases, circuit] = cols;
        } else if (cols.length === 14) {
          [source, tag, description, quantity, voltage, loadType, duty, kw, powerFactor, loadFactor, efficiency, demandFactor, phases, circuit] = cols;
        } else if (cols.length === 16) {
          [tag, description, manufacturer, model, quantity, voltage, loadType, duty, kw, powerFactor, loadFactor, efficiency, demandFactor, phases, circuit, notes] = cols;
        } else {
          [source, tag, description, manufacturer, model, quantity, voltage, loadType, duty, kw, powerFactor, loadFactor, efficiency, demandFactor, phases, circuit, notes] = cols;
        }
        const nums = [quantity, voltage, kw, powerFactor, loadFactor, efficiency, demandFactor];
        if (nums.some(n => n && isNaN(Number(n)))) throw new Error('Invalid CSV data');
        load = {
          source,
          tag,
          description,
          manufacturer,
          model,
          quantity,
          voltage,
          loadType,
          duty,
          kw,
          powerFactor,
          loadFactor,
          efficiency,
          demandFactor,
          phases,
          circuit,
          notes,
          panelId: '',
          breaker: ''
        };
      } else if (cols.length === 19 || cols.length === 20 || cols.length === 22 || cols.length === 23) {
        let source = '';
        let tag, description, manufacturer = '', model = '', quantity, voltage, loadType, duty, kw, powerFactor, loadFactor, efficiency, demandFactor, phases, circuit, notes = '', panelId, breaker, kva, current, demandKva, demandKw;
        if (cols.length === 19) {
          [
            tag,
            description,
            quantity,
            voltage,
            loadType,
            duty,
            kw,
            powerFactor,
            loadFactor,
            efficiency,
            demandFactor,
            phases,
            circuit,
            panelId,
            breaker,
            kva,
            current,
            demandKva,
            demandKw
          ] = cols;
        } else if (cols.length === 20) {
          [
            source,
            tag,
            description,
            quantity,
            voltage,
            loadType,
            duty,
            kw,
            powerFactor,
            loadFactor,
            efficiency,
            demandFactor,
            phases,
            circuit,
            panelId,
            breaker,
            kva,
            current,
            demandKva,
            demandKw
          ] = cols;
        } else if (cols.length === 22) {
          [
            tag,
            description,
            manufacturer,
            model,
            quantity,
            voltage,
            loadType,
            duty,
            kw,
            powerFactor,
            loadFactor,
            efficiency,
            demandFactor,
            phases,
            circuit,
            notes,
            panelId,
            breaker,
            kva,
            current,
            demandKva,
            demandKw
          ] = cols;
        } else {
          [
            source,
            tag,
            description,
            manufacturer,
            model,
            quantity,
            voltage,
            loadType,
            duty,
            kw,
            powerFactor,
            loadFactor,
            efficiency,
            demandFactor,
            phases,
            circuit,
            notes,
            panelId,
            breaker,
            kva,
            current,
            demandKva,
            demandKw
          ] = cols;
        }
        const nums = [quantity, voltage, kw, powerFactor, loadFactor, efficiency, demandFactor, kva, current, demandKva, demandKw];
        if (nums.some(n => n && isNaN(Number(n)))) throw new Error('Invalid CSV data');
        load = {
          source,
          tag,
          description,
          manufacturer,
          model,
          quantity,
          voltage,
          loadType,
          duty,
          kw,
          powerFactor,
          loadFactor,
          efficiency,
          demandFactor,
          phases,
          circuit,
          notes,
          panelId,
          breaker,
          kva,
          current,
          demandKva,
          demandKw
        };
      } else {
        throw new Error('Invalid CSV format');
      }
      const computed = calculateDerived(load);
      return { panelId: '', breaker: '', ...load, ...computed };
    });
  }

  function applyLoadTypeDefaults(load, type, { overwrite = false } = {}) {
    const defaults = loadTypeDefaults[type];
    if (!defaults) return load;
    const next = { ...load, loadType: type };
    Object.entries(defaults).forEach(([key, value]) => {
      if (overwrite || !String(next[key] ?? '').trim()) {
        next[key] = value;
      }
    });
    return next;
  }

  function collectFormLoad(form) {
    const load = { ...blankLoad };
    form.querySelectorAll('[name]').forEach(field => {
      load[field.name] = field.value.trim();
    });
    return load;
  }

  function renderLoadForm(body, controller, { mode = 'add', seed = {} } = {}) {
    const form = document.createElement('form');
    form.className = 'modal-form load-entry-form';
    const load = { ...blankLoad, ...seed };
    form.innerHTML = `
      <div class="load-entry-grid">
        <label class="modal-form-field">
          <span>Description</span>
          <input name="description" type="text" value="${escapeAttr(load.description || '')}" placeholder="Process pump motor">
        </label>
        <label class="modal-form-field">
          <span>Tag / ID</span>
          <input name="tag" type="text" value="${escapeAttr(load.tag || '')}" placeholder="MTR-101">
        </label>
        <label class="modal-form-field">
          <span>Source / Panel</span>
          <input name="source" type="text" list="load-source-list" value="${escapeAttr(load.source || '')}" placeholder="SWBD-101">
        </label>
        <label class="modal-form-field">
          <span>Load Type</span>
          <select name="loadType">
            <option value=""></option>
            ${Object.keys(loadTypeDefaults).map(type => `<option value="${escapeAttr(type)}"${load.loadType === type ? ' selected' : ''}>${escapeHtml(type)}</option>`).join('')}
          </select>
        </label>
        <label class="modal-form-field">
          <span>Qty</span>
          <input name="quantity" type="number" min="0" step="any" value="${escapeAttr(load.quantity || '')}" placeholder="1">
        </label>
        <label class="modal-form-field">
          <span>Voltage (V)</span>
          <input name="voltage" type="number" min="0" step="any" value="${escapeAttr(load.voltage || '')}" placeholder="480">
        </label>
        <label class="modal-form-field">
          <span>kW</span>
          <input name="kw" type="number" min="0" step="any" value="${escapeAttr(load.kw || '')}" placeholder="15">
        </label>
        <label class="modal-form-field">
          <span>Power Factor</span>
          <input name="powerFactor" type="number" min="0" max="1" step="any" value="${escapeAttr(load.powerFactor || '')}" placeholder="0.90">
        </label>
        <label class="modal-form-field">
          <span>Phases</span>
          <input name="phases" type="number" min="1" max="3" step="1" value="${escapeAttr(load.phases || '')}" placeholder="3">
        </label>
        <label class="modal-form-field">
          <span>Duty</span>
          <select name="duty">
            <option value=""></option>
            <option value="Continuous"${load.duty === 'Continuous' ? ' selected' : ''}>Continuous</option>
            <option value="Intermittent"${load.duty === 'Intermittent' ? ' selected' : ''}>Intermittent</option>
            <option value="Stand-by"${load.duty === 'Stand-by' ? ' selected' : ''}>Stand-by</option>
          </select>
        </label>
        <label class="modal-form-field">
          <span>Demand Factor (%)</span>
          <input name="demandFactor" type="number" min="0" max="100" step="any" value="${escapeAttr(load.demandFactor || '')}" placeholder="100">
        </label>
        <label class="modal-form-field">
          <span>Panel Circuit</span>
          <input name="circuit" type="text" value="${escapeAttr(load.circuit || '')}" placeholder="L1-01">
        </label>
      </div>
      <p class="field-hint">Use Full Detail view for manufacturer, model, notes, and advanced factors. Load type defaults prefill blank electrical fields.</p>
    `;
    body.appendChild(form);
    controller.registerForm(form);
    const typeSelect = form.querySelector('[name="loadType"]');
    typeSelect.addEventListener('change', () => {
      const next = applyLoadTypeDefaults(collectFormLoad(form), typeSelect.value);
      Object.entries(next).forEach(([key, value]) => {
        const field = form.querySelector(`[name="${key}"]`);
        if (field) field.value = value;
      });
    });
    return form.querySelector('[name="description"]');
  }

  function openAddLoadModal() {
    openModal({
      title: 'Add Load',
      description: 'Create a load with the fields needed for demand, panel assignment, and downstream studies.',
      primaryText: 'Add Load',
      secondaryText: 'Cancel',
      variant: 'wide',
      defaultWidth: 'wide',
      render: (body, controller) => renderLoadForm(body, controller),
      onSubmit(controller) {
        const form = controller.body.querySelector('.load-entry-form');
        let load = collectFormLoad(form);
        load = applyLoadTypeDefaults(load, load.loadType);
        if (!String(load.description || '').trim() && !String(load.tag || '').trim()) {
          showAlertModal('Load Required', 'Enter a description or tag before adding the load.');
          return false;
        }
        dataStore.addLoad({ ...load, ...calculateDerived(load) });
        render();
        return true;
      }
    });
  }

  function openBatchEditModal() {
    const selectedRows = Array.from(tbody.querySelectorAll('tr')).filter(row => row.querySelector('.row-select')?.checked);
    if (!selectedRows.length) {
      showAlertModal('No Loads Selected', 'Select one or more load rows before using Batch Edit.');
      return;
    }
    openModal({
      title: 'Batch Edit Loads',
      description: `Apply shared values to ${selectedRows.length} selected load${selectedRows.length === 1 ? '' : 's'}.`,
      primaryText: 'Apply Changes',
      secondaryText: 'Cancel',
      defaultWidth: 'medium',
      render(body, controller) {
        const form = document.createElement('form');
        form.className = 'modal-form batch-edit-controls';
        form.innerHTML = `
          <label><input data-batch-toggle="source" type="checkbox"> Source / Panel</label>
          <input data-batch-field="source" type="text" list="load-source-list" placeholder="SWBD-101">
          <label><input data-batch-toggle="loadType" type="checkbox"> Load Type</label>
          <select data-batch-field="loadType">
            <option value=""></option>
            ${Object.keys(loadTypeDefaults).map(type => `<option value="${escapeAttr(type)}">${escapeHtml(type)}</option>`).join('')}
          </select>
          <label><input data-batch-toggle="voltage" type="checkbox"> Voltage</label>
          <input data-batch-field="voltage" type="number" min="0" step="any" placeholder="480">
          <label><input data-batch-toggle="phases" type="checkbox"> Phases</label>
          <input data-batch-field="phases" type="number" min="1" max="3" step="1" placeholder="3">
          <label><input data-batch-toggle="duty" type="checkbox"> Duty</label>
          <select data-batch-field="duty">
            <option value=""></option>
            <option value="Continuous">Continuous</option>
            <option value="Intermittent">Intermittent</option>
            <option value="Stand-by">Stand-by</option>
          </select>
          <label><input data-batch-toggle="demandFactor" type="checkbox"> Demand Factor (%)</label>
          <input data-batch-field="demandFactor" type="number" min="0" max="100" step="any" placeholder="100">
        `;
        body.appendChild(form);
        controller.registerForm(form);
        return form.querySelector('[data-batch-field="source"]');
      },
      onSubmit(controller) {
        const updates = {};
        controller.body.querySelectorAll('[data-batch-toggle]').forEach(toggle => {
          if (!toggle.checked) return;
          const name = toggle.dataset.batchToggle;
          const field = controller.body.querySelector(`[data-batch-field="${name}"]`);
          updates[name] = field ? field.value.trim() : '';
        });
        if (!Object.keys(updates).length) {
          showAlertModal('No Batch Fields', 'Select at least one field to update.');
          return false;
        }
        const indices = selectedRows.map(row => getStoreIndex(row));
        const loads = dataStore.getLoads().map((load, idx) => {
          if (!indices.includes(idx)) return load;
          const next = { ...load, ...updates };
          return { ...next, ...calculateDerived(next) };
        });
        dataStore.setLoads(loads);
        render();
        return true;
      }
    });
  }

  function loadStarterLoads() {
    const existing = getVisibleLoads(dataStore.getLoads());
    if (existing.length && !confirm('Replace current Load List rows with starter sample loads?')) return;
    const loads = starterLoads.map(load => ({ ...blankLoad, ...load, ...calculateDerived(load) }));
    dataStore.setLoads(loads);
    render();
  }

  // --- events -------------------------------------------------------------
  deleteBtn.addEventListener('click', () => {
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => r.querySelector('.row-select')?.checked);
    if (!rows.length) return;
    if (!confirm('Delete selected loads?')) return;
    const indices = rows.map(r => getStoreIndex(r));
    const loads = dataStore.getLoads().filter((_, idx) => !indices.includes(idx));
    dataStore.setLoads(loads);
    render();
  });

  selectAll.addEventListener('change', e => {
    const checked = e.target.checked;
    tbody.querySelectorAll('.row-select').forEach(cb => { cb.checked = checked; });
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const data = dataStore.getLoads().map(l => {
      const base = { panelId: '', breaker: '', duty: '', manufacturer: '', model: '', notes: '', ...l };
      return { ...base, ...calculateDerived(base) };
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'loads.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('export-csv-btn').addEventListener('click', () => {
    const csv = loadsToCSV(dataStore.getLoads());
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'loads.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('copy-btn').addEventListener('click', () => {
    const tsv = loadsToCSV(dataStore.getLoads(), '\t');
    navigator.clipboard.writeText(tsv).catch(() => {
      showAlertModal('Copy Failed', 'Unable to copy to clipboard. Please try again.');
    });
  });

  const importInput = document.getElementById('import-input');
  document.getElementById('import-btn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then(async text => {
      try {
        const loads = await importJsonText(text);
        await applyImportedLoads(loads);
      } catch (err) {
        console.error('[loadlist] JSON import failed:', err);
        showAlertModal('Import Error', 'Invalid load data. Please check the file format and try again.');
      }
    });
    e.target.value = '';
  });

  const importCsvInput = document.getElementById('import-csv-input');
  document.getElementById('import-csv-btn').addEventListener('click', () => importCsvInput.click());
  importCsvInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then(async text => {
      try {
        const loads = await importCsvText(text);
        await applyImportedLoads(loads);
      } catch (err) {
        console.error('[loadlist] CSV import failed:', err);
        showAlertModal('Import Error', 'Invalid CSV load data. Please check the file format and try again.');
      }
    });
    e.target.value = '';
  });



  quickFilterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      activeQuickFilter = btn.dataset.filter || 'all';
      quickFilterButtons.forEach(chip => chip.classList.toggle('active', chip === btn));
      render();
    });
  });

  if (addRowBtn) {
    addRowBtn.addEventListener('click', () => {
      openAddLoadModal();
    });
  }

  if (sampleLoadsBtn) {
    sampleLoadsBtn.addEventListener('click', loadStarterLoads);
  }

  if (batchEditBtn) {
    batchEditBtn.addEventListener('click', openBatchEditModal);
  }

  viewPresetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      activeViewPreset = btn.dataset.loadView || 'basic';
      dataStore.setItem(dataStore.STORAGE_KEYS.loadListViewPreset, activeViewPreset);
      applyViewPreset();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', e => {
      filterQuery = e.target.value.trim().toLowerCase();
      render();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      filterQuery = '';
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      render();
    });
  }

  // Initial render for an empty table; rows populate on 'loadList' events
  render();
  window.__LoadListInitOK = true;
  });
}


import * as dataStore from './dataStore.mjs';
import {
  buildLoadDemandGovernancePackage,
  renderLoadDemandGovernanceHTML,
} from './analysis/loadDemandGovernance.mjs';
import { escapeHtml as escapeAttr, escapeHtml } from './src/htmlUtils.mjs';
import { showAlertModal } from './src/components/modal.js';

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
    const kW = parseFloat(load.kw) || 0;
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
    const demandBasisDiv = document.getElementById('demand-basis-summary');
    const saveDemandPackageBtn = document.getElementById('save-demand-package-btn');
    const exportDemandPackageBtn = document.getElementById('export-demand-package-btn');
    const printDemandPackageBtn = document.getElementById('print-demand-package-btn');
    const quickFilterButtons = Array.from(document.querySelectorAll ? document.querySelectorAll('.loadlist-chip') : []);
    let clipboard = null;
    let rendering = false;
    let filterQuery = '';
    let activeQuickFilter = 'all';
    const rowClass = tbody.dataset.rowClass || 'load-row';
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
      loadClass: '',
      continuous: '',
      noncoincidentGroup: '',
      largestMotorCandidate: '',
      demandBasisCode: '',
      demandBasisNote: '',
      spareFuturePct: '',
      loadManagementLimitKw: '',
      measuredDemandSource: '',
      demandNotes: '',
      phases: '',
      circuit: '',
      notes: ''
    };

    // --- helpers ------------------------------------------------------------
    function format(num) {
      const n = Number(num);
      return Number.isFinite(n) && n !== 0 ? n.toFixed(2) : '';
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
    const numericFields = ['quantity','voltage','kw','powerFactor','loadFactor','efficiency','demandFactor','spareFuturePct','loadManagementLimitKw','phases'];
    const rangeFields = [
      { name: 'powerFactor', min: 0, max: 1 },
      { name: 'loadFactor', min: 0, max: 100 },
      { name: 'efficiency', min: 0, max: 100 },
      { name: 'demandFactor', min: 0, max: 100 },
      { name: 'spareFuturePct', min: 0, max: 100 }
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
    updateDemandBasisSummary();
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

  function createRow(load, idx, storeIndex = idx) {
    const tr = document.createElement('tr');
    tr.dataset.index = idx;
    tr.dataset.storeIndex = storeIndex;
    if (load.ref) tr.dataset.ref = load.ref;
    if (load.id) tr.dataset.id = load.id;
    tr.classList.add(rowClass);
    tr.innerHTML = `
      <td><input type="checkbox" class="row-select" aria-label="Select row"></td>
      <td><input name="source" type="text" value="${escapeAttr(load.source || '')}"></td>
      <td><input name="tag" type="text" value="${escapeAttr(load.tag || '')}"></td>
      <td><input name="description" type="text" value="${escapeAttr(load.description || '')}"></td>
      <td><input name="manufacturer" type="text" class="manufacturer-input" value="${escapeAttr(load.manufacturer || '')}"></td>
      <td><input name="model" type="text" class="model-input" value="${escapeAttr(load.model || '')}"></td>
      <td><input name="quantity" type="number" step="any" maxlength="15" value="${escapeAttr(load.quantity || '')}"></td>
      <td><input name="voltage" type="number" step="any" maxlength="15" value="${escapeAttr(load.voltage || '')}"></td>
      <td><input name="loadType" type="text" value="${escapeAttr(load.loadType || '')}"></td>
      <td><select name="duty">
        <option value=""></option>
        <option value="Continuous"${load.duty === 'Continuous' ? ' selected' : ''}>Continuous</option>
        <option value="Intermittent"${load.duty === 'Intermittent' ? ' selected' : ''}>Intermittent</option>
        <option value="Stand-by"${load.duty === 'Stand-by' ? ' selected' : ''}>Stand-by</option>
      </select></td>
      <td><input name="kw" type="number" step="any" maxlength="15" value="${escapeAttr(load.kw || '')}"></td>
      <td><input name="powerFactor" type="number" step="any" maxlength="15" value="${escapeAttr(load.powerFactor || '')}"></td>
      <td><input name="loadFactor" type="number" step="any" maxlength="15" value="${escapeAttr(load.loadFactor || '')}"></td>
      <td><input name="efficiency" type="number" step="any" maxlength="15" value="${escapeAttr(load.efficiency || '')}"></td>
      <td><input name="demandFactor" type="number" step="any" maxlength="15" value="${escapeAttr(load.demandFactor || '')}"></td>
      <td><select name="loadClass">
        ${['', 'lighting', 'receptacle', 'motor', 'hvac', 'process', 'ev', 'kitchen', 'heatTrace', 'spare', 'future', 'generic'].map(value => `<option value="${value}"${load.loadClass === value ? ' selected' : ''}>${value}</option>`).join('')}
      </select></td>
      <td><select name="continuous">
        <option value=""></option>
        <option value="true"${load.continuous === true || load.continuous === 'true' ? ' selected' : ''}>Yes</option>
        <option value="false"${load.continuous === false || load.continuous === 'false' ? ' selected' : ''}>No</option>
      </select></td>
      <td><input name="noncoincidentGroup" type="text" value="${escapeAttr(load.noncoincidentGroup || '')}"></td>
      <td><select name="largestMotorCandidate">
        <option value=""></option>
        <option value="true"${load.largestMotorCandidate === true || load.largestMotorCandidate === 'true' ? ' selected' : ''}>Yes</option>
        <option value="false"${load.largestMotorCandidate === false || load.largestMotorCandidate === 'false' ? ' selected' : ''}>No</option>
      </select></td>
      <td><input name="spareFuturePct" type="number" step="any" maxlength="15" value="${escapeAttr(load.spareFuturePct || '')}"></td>
      <td><input name="loadManagementLimitKw" type="number" step="any" maxlength="15" value="${escapeAttr(load.loadManagementLimitKw || '')}"></td>
      <td><input name="demandBasisCode" type="text" value="${escapeAttr(load.demandBasisCode || '')}"></td>
      <td><input name="measuredDemandSource" type="text" value="${escapeAttr(load.measuredDemandSource || '')}"></td>
      <td><textarea name="demandBasisNote">${escapeHtml(load.demandBasisNote || '')}</textarea></td>
      <td><input name="phases" type="number" step="any" maxlength="15" value="${escapeAttr(load.phases || '')}"></td>
      <td><input name="circuit" type="text" value="${escapeAttr(load.circuit || '')}"></td>
      <td><textarea name="notes">${escapeHtml(load.notes || '')}</textarea></td>
      <td class="kva">${format(load.kva)}</td>
      <td class="current">${format(load.current)}</td>
      <td class="demand-kva">${format(load.demandKva)}</td>
      <td class="demand-kw">${format(load.demandKw)}</td>
      <td class="row-actions"></td>`;

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
    insertBtn.textContent = '+';
    insertBtn.className = 'insertBelowBtn';
    insertBtn.title = 'Insert row below';
    insertBtn.setAttribute('aria-label', 'Insert row below');
    actTd.appendChild(insertBtn);

    const dupBtn = document.createElement('button');
    dupBtn.type = 'button';
    dupBtn.textContent = '\u29C9';
    dupBtn.className = 'duplicateBtn';
    dupBtn.title = 'Duplicate row';
    dupBtn.setAttribute('aria-label', 'Duplicate row');
    actTd.appendChild(dupBtn);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '\u2716';
    delBtn.className = 'removeBtn';
    delBtn.title = 'Delete row';
    delBtn.setAttribute('aria-label', 'Delete row');
    actTd.appendChild(delBtn);

    const chk = tr.querySelector('.row-select');
    chk.addEventListener('change', () => {
      if (!chk.checked) selectAll.checked = false;
    });

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
    const totals = loads.reduce((acc, row) => {
      const kw = parseFloat(row.kw) || 0;
      const kva = parseFloat(row.kva) || 0;
      const df = parseFloat(row.df ?? row.demandFactor);
      const factor = isNaN(df) ? 1 : df / 100;
      acc.kW += kw;
      acc.kVA += kva;
      acc.demandKW += kw * factor;
      acc.demandKVA += kva * factor;
      return acc;
    }, { kW: 0, kVA: 0, demandKW: 0, demandKVA: 0 });
    tfoot.innerHTML = `<tr>
      <td colspan="10">Totals</td>
      <td>${totals.kW.toFixed(2)}</td>
      <td colspan="16"></td>
      <td>${totals.kVA.toFixed(2)}</td>
      <td></td>
      <td>${totals.demandKVA.toFixed(2)}</td>
      <td>${totals.demandKW.toFixed(2)}</td>
      <td></td>
    </tr>`;
  }

  function updateSummary(loads = dataStore.getLoads()) {
    if (!summaryDiv) return;
    const grouped = aggregateLoadsBySource(loads);
    const entries = Object.entries(grouped);
    if (!entries.length) {
      summaryDiv.innerHTML = '';
      return;
    }
    let html = '<table><thead><tr><th>Source</th><th>kW</th><th>kVA</th><th>Demand kW</th><th>Demand kVA</th></tr></thead><tbody>';
    for (const [src, totals] of entries) {
      html += `<tr><td>${escapeHtml(src)}</td><td>${totals.kW.toFixed(2)}</td><td>${totals.kVA.toFixed(2)}</td><td>${totals.demandKW.toFixed(2)}</td><td>${totals.demandKVA.toFixed(2)}</td></tr>`;
    }
    html += '</tbody></table>';
    summaryDiv.innerHTML = html;
  }

  function buildCurrentDemandPackage(loads = dataStore.getLoads()) {
    const studies = dataStore.getStudies();
    return buildLoadDemandGovernancePackage({
      projectName: window.currentProjectName || 'Untitled Project',
      loads,
      panels: dataStore.getPanels(),
      basis: studies.loadDemandGovernance?.basis || {},
    });
  }

  function updateDemandBasisSummary(loads = dataStore.getLoads()) {
    if (!demandBasisDiv) return;
    const pkg = buildCurrentDemandPackage(loads);
    const summary = pkg.summary || {};
    const warningRows = (pkg.warnings || []).slice(0, 5).map(row => `<li>${escapeHtml(row.message || row.code || row)}</li>`).join('');
    demandBasisDiv.innerHTML = `
      <div class="summary-grid">
        <div><strong>${summary.connectedKw || 0}</strong><span>Connected kW</span></div>
        <div><strong>${summary.governedDemandKw || 0}</strong><span>Governed demand kW</span></div>
        <div><strong>${summary.largestMotorAdderKw || 0}</strong><span>Largest motor adder kW</span></div>
        <div><strong>${summary.spareFutureAllowanceKw || 0}</strong><span>Spare/future kW</span></div>
        <div><strong>${summary.noncoincidentReductionKw || 0}</strong><span>Noncoincident reduction kW</span></div>
        <div><strong>${summary.warningCount || 0}</strong><span>Demand warnings</span></div>
      </div>
      ${warningRows ? `<ul class="compact-list">${warningRows}</ul>` : '<p class="muted">Demand governance package is ready for downstream reports.</p>'}`;
  }

  function saveDemandPackage() {
    const studies = dataStore.getStudies();
    studies.loadDemandGovernance = buildCurrentDemandPackage();
    dataStore.setStudies(studies);
    showAlertModal('Demand Package Saved', 'Panel and load demand-governance results were saved to study results.');
  }

  function downloadDemandPackage() {
    const pkg = buildCurrentDemandPackage();
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'load-demand-governance.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function printDemandPackage() {
    const pkg = buildCurrentDemandPackage();
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Panel and Load Demand Basis</title><link rel="stylesheet" href="style.css"></head><body>${renderLoadDemandGovernanceHTML(pkg)}</body></html>`);
    win.document.close();
  }

  function matchesQuickFilter(load) {
    if (activeQuickFilter === 'missingSource') {
      return !String(load.source || '').trim();
    }
    if (activeQuickFilter === 'missingElectrical') {
      return !String(load.kw || '').trim() || !String(load.voltage || '').trim();
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
      load.notes,
      load.loadClass,
      load.noncoincidentGroup,
      load.demandBasisCode,
      load.demandBasisNote,
      load.measuredDemandSource,
      load.demandNotes
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
        tbody.innerHTML = `<tr><td colspan="32" class="empty-state">No matching loads for the current search.</td></tr>`;
      } else {
        filtered.forEach((entry, idx) => tbody.appendChild(createRow(entry.load, idx, entry.storeIndex)));
      }

      selectAll.checked = false;
      recalculateTotals(loads);
      updateSummary(loads);
      updateDemandBasisSummary(loads);

      if (resultsCount) {
        const resultCount = filtered.length;
        const totalCount = hasStoredLoads ? loads.length : 0;
        if (!filterQuery) {
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
      'loadClass',
      'continuous',
      'noncoincidentGroup',
      'largestMotorCandidate',
      'spareFuturePct',
      'loadManagementLimitKw',
      'demandBasisCode',
      'measuredDemandSource',
      'demandBasisNote',
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
        full.loadClass,
        full.continuous,
        full.noncoincidentGroup,
        full.largestMotorCandidate,
        full.spareFuturePct,
        full.loadManagementLimitKw,
        full.demandBasisCode,
        full.measuredDemandSource,
        full.demandBasisNote,
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

  function csvToLoads(text, delimiter = ',') {
    const lines = text.trim().split(/\r?\n/);
    if (!lines.length) return [];
    const first = lines[0].toLowerCase();
    if (first.includes('description') && (first.includes('kw') || first.includes('power'))) {
      const header = lines.shift().split(delimiter).map(c => c.replace(/^"|"$/g, '').trim());
      const fields = new Set(header);
      if (fields.has('source') && fields.has('tag') && fields.has('demandFactor')) {
        return lines.filter(Boolean).map(line => {
          const cols = line
            .split(delimiter)
            .map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
          const load = {};
          header.forEach((field, index) => {
            if (field) load[field] = cols[index] ?? '';
          });
          const nums = ['quantity','voltage','kw','powerFactor','loadFactor','efficiency','demandFactor','spareFuturePct','loadManagementLimitKw','kva','current','demandKva','demandKw'];
          if (nums.some(name => load[name] && isNaN(Number(load[name])))) throw new Error('Invalid CSV data');
          const computed = calculateDerived(load);
          return { panelId: '', breaker: '', ...load, ...computed };
        });
      }
    }
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

  // --- events -------------------------------------------------------------
  deleteBtn.addEventListener('click', () => {
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => r.querySelector('.row-select').checked);
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

  if (saveDemandPackageBtn) saveDemandPackageBtn.addEventListener('click', saveDemandPackage);
  if (exportDemandPackageBtn) exportDemandPackageBtn.addEventListener('click', downloadDemandPackage);
  if (printDemandPackageBtn) printDemandPackageBtn.addEventListener('click', printDemandPackage);

  const importInput = document.getElementById('import-input');
  document.getElementById('import-btn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then(text => {
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          const loads = data.map(l => {
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
            loadClass: '',
            continuous: '',
            noncoincidentGroup: '',
            largestMotorCandidate: '',
            spareFuturePct: '',
            loadManagementLimitKw: '',
            demandBasisCode: '',
            measuredDemandSource: '',
            demandBasisNote: '',
            demandNotes: '',
            phases: '',
            circuit: '',
            notes: '',
            panelId: '',
            breaker: '',
            ...l
          };
            if ('power' in base && !('kw' in base)) {
              base.kw = base.power;
              delete base.power;
            }
            return { ...base, ...calculateDerived(base) };
          });
          dataStore.setLoads(loads);
          render();
        } else {
          showAlertModal('Import Error', 'Invalid load data. Please check the file format and try again.');
        }
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
    file.text().then(text => {
      try {
        const loads = csvToLoads(text);
        dataStore.setLoads(loads);
        render();
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
      dataStore.addLoad({ ...blankLoad });
      render();
      const rows = tbody.querySelectorAll('tr');
      const row = rows[rows.length - 1];
      const input = row?.querySelector('input[name="description"]');
      if (input) input.focus();
    });
  }

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
  });
}


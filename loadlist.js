import * as dataStore from './dataStore.mjs';

class ContextMenu {
  constructor(items = []) {
    this.items = items;
    this.menu = document.createElement('ul');
    this.menu.className = 'context-menu';
    Object.assign(this.menu.style, {
      position: 'absolute',
      display: 'none',
      listStyle: 'none',
      margin: '0',
      padding: '4px 0',
      background: '#fff',
      border: '1px solid #ccc',
      zIndex: 1000,
      color: '#000'
    });
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
      Object.assign(li.style, {
        padding: '4px 12px',
        cursor: 'pointer',
        background: '#fff',
        color: '#000'
      });
      li.tabIndex = 0;
      li.addEventListener('click', () => {
        const target = this.target;
        this.hide();
        action(target);
      });
      li.addEventListener('mouseenter', () => {
        li.style.background = '#eee';
        li.style.color = '#000';
      });
      li.addEventListener('mouseleave', () => {
        li.style.background = '#fff';
        li.style.color = '#000';
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
    let clipboard = null;
    let rendering = false;
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
    return {
      id: tr.dataset.id || tr.querySelector('input[name="tag"]').value.trim(),
      ref: tr.dataset.ref || '',
      source: tr.querySelector('input[name="source"]').value.trim(),
      tag: tr.querySelector('input[name="tag"]').value.trim(),
      description: tr.querySelector('input[name="description"]').value.trim(),
      manufacturer: tr.querySelector('input[name="manufacturer"]').value.trim(),
      model: tr.querySelector('input[name="model"]').value.trim(),
      quantity: tr.querySelector('input[name="quantity"]').value.trim(),
      voltage: tr.querySelector('input[name="voltage"]').value.trim(),
      loadType: tr.querySelector('input[name="loadType"]').value.trim(),
      duty: tr.querySelector('select[name="duty"]').value.trim(),
      kw: tr.querySelector('input[name="kw"]').value.trim(),
      powerFactor: tr.querySelector('input[name="powerFactor"]').value.trim(),
      loadFactor: tr.querySelector('input[name="loadFactor"]').value.trim(),
      efficiency: tr.querySelector('input[name="efficiency"]').value.trim(),
      demandFactor: tr.querySelector('input[name="demandFactor"]').value.trim(),
      phases: tr.querySelector('input[name="phases"]').value.trim(),
      circuit: tr.querySelector('input[name="circuit"]').value.trim(),
      notes: tr.querySelector('textarea[name="notes"]').value.trim()
    };
  }

  function saveRow(tr) {
    const idx = Number(tr.dataset.index);
    const load = gatherRow(tr);
    const numericFields = ['quantity','voltage','kw','powerFactor','loadFactor','efficiency','demandFactor','phases'];
    let valid = true;
    numericFields.forEach(name => {
      const input = tr.querySelector(`input[name="${name}"]`);
      if (input) {
        const val = input.value.trim();
        if (val !== '' && isNaN(Number(val))) {
          input.classList.add('input-error');
          valid = false;
        } else {
          input.classList.remove('input-error');
        }
      }
    });
    if (!valid) {
      alert('Please correct highlighted numeric fields.');
      return;
    }
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
    const fn = window.opener?.updateComponent || window.updateComponent;
    if (fn) {
      const id = load.ref || load.id || load.tag;
      if (id) fn(id, load);
    }
  }

  function insertLoad(index, load) {
    dataStore.insertLoad(index, load);
    render();
    const row = tbody.querySelector(`tr[data-index="${index}"]`);
    if (row) {
      const inp = row.querySelector('input[name="description"]');
      inp && inp.focus();
    }
  }

  function handleNav(e, td) {
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
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const col = td.cellIndex;
      const nextRow = td.parentElement.nextElementSibling;
      if (nextRow && nextRow.cells[col]) {
        const next = nextRow.cells[col].querySelector('input,select,textarea');
        if (next) {
          next.focus();
          if (typeof next.select === 'function') next.select();
        }
      }
    }
  }

  function createRow(load, idx) {
    const tr = document.createElement('tr');
    tr.dataset.index = idx;
    if (load.ref) tr.dataset.ref = load.ref;
    if (load.id) tr.dataset.id = load.id;
    tr.classList.add(rowClass);
    tr.innerHTML = `
      <td><input type="checkbox" class="row-select" aria-label="Select row"></td>
      <td><input name="source" type="text" value="${load.source || ''}"></td>
      <td><input name="tag" type="text" value="${load.tag || ''}"></td>
      <td><input name="description" type="text" value="${load.description || ''}"></td>
      <td><input name="manufacturer" type="text" class="manufacturer-input" value="${load.manufacturer || ''}"></td>
      <td><input name="model" type="text" class="model-input" value="${load.model || ''}"></td>
      <td><input name="quantity" type="number" step="any" maxlength="15" value="${load.quantity || ''}"></td>
      <td><input name="voltage" type="number" step="any" maxlength="15" value="${load.voltage || ''}"></td>
      <td><input name="loadType" type="text" value="${load.loadType || ''}"></td>
      <td><select name="duty">
        <option value=""></option>
        <option value="Continuous"${load.duty === 'Continuous' ? ' selected' : ''}>Continuous</option>
        <option value="Intermittent"${load.duty === 'Intermittent' ? ' selected' : ''}>Intermittent</option>
        <option value="Stand-by"${load.duty === 'Stand-by' ? ' selected' : ''}>Stand-by</option>
      </select></td>
      <td><input name="kw" type="number" step="any" maxlength="15" value="${load.kw || ''}"></td>
      <td><input name="powerFactor" type="number" step="any" maxlength="15" value="${load.powerFactor || ''}"></td>
      <td><input name="loadFactor" type="number" step="any" maxlength="15" value="${load.loadFactor || ''}"></td>
      <td><input name="efficiency" type="number" step="any" maxlength="15" value="${load.efficiency || ''}"></td>
      <td><input name="demandFactor" type="number" step="any" maxlength="15" value="${load.demandFactor || ''}"></td>
      <td><input name="phases" type="number" step="any" maxlength="15" value="${load.phases || ''}"></td>
      <td><input name="circuit" type="text" value="${load.circuit || ''}"></td>
      <td><textarea name="notes">${load.notes || ''}</textarea></td>
      <td class="kva">${format(load.kva)}</td>
      <td class="current">${format(load.current)}</td>
      <td class="demand-kva">${format(load.demandKva)}</td>
      <td class="demand-kw">${format(load.demandKw)}</td>`;

    Array.from(tr.querySelectorAll('input[type="text"],input[type="number"],select,textarea')).forEach(input => {
      const td = input.parentElement;
      input.addEventListener('blur', () => saveRow(tr));
      if (input.tagName === 'SELECT') {
        input.addEventListener('change', () => saveRow(tr));
      }
      input.addEventListener('keydown', e => handleNav(e, td));
    });

    const chk = tr.querySelector('.row-select');
    chk.addEventListener('change', () => {
      if (!chk.checked) selectAll.checked = false;
    });

    return tr;
  }

  const menu = new ContextMenu();
  menu.setItems([
    { label: 'Insert Row Above', action: tr => { if (!tr) return; insertLoad(Number(tr.dataset.index), blankLoad); } },
    { label: 'Insert Row Below', action: tr => { if (!tr) return; insertLoad(Number(tr.dataset.index) + 1, blankLoad); } },
    { label: 'Copy Row', action: tr => { if (!tr) return; clipboard = JSON.parse(JSON.stringify(gatherRow(tr))); } },
    { label: 'Paste Row', action: tr => {
        if (!tr) return;
        if (!clipboard) return;
        const load = JSON.parse(JSON.stringify(clipboard));
        const idx = Number(tr.dataset.index);
        const loads = dataStore.getLoads();
        if (idx >= loads.length - 1) {
          dataStore.addLoad(load);
        } else {
          dataStore.insertLoad(idx + 1, load);
        }
        render();
      }
    },
    { label: 'Delete Row', action: tr => { if (!tr) return; dataStore.deleteLoad(Number(tr.dataset.index)); render(); } }
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
      const idx = Number(row.dataset.index);
      const loads = dataStore.getLoads();
      if (idx >= loads.length - 1) {
        dataStore.addLoad(load);
      } else {
        dataStore.insertLoad(idx + 1, load);
      }
      render();
      e.preventDefault();
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
      <td colspan="7"></td>
      <td>${totals.kVA.toFixed(2)}</td>
      <td></td>
      <td>${totals.demandKVA.toFixed(2)}</td>
      <td>${totals.demandKW.toFixed(2)}</td>
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
      html += `<tr><td>${src}</td><td>${totals.kW.toFixed(2)}</td><td>${totals.kVA.toFixed(2)}</td><td>${totals.demandKW.toFixed(2)}</td><td>${totals.demandKVA.toFixed(2)}</td></tr>`;
    }
    html += '</tbody></table>';
    summaryDiv.innerHTML = html;
  }

  function render() {
    if (rendering) return;
    rendering = true;
    try {
      tbody.innerHTML = '';
      let loads = dataStore.getLoads();
      if (!loads.length) {
        // Ensure at least one editable row renders even with no stored data
        loads = [{}];
      } else {
        // Recalculate derived fields for display without rewriting storage
        loads = loads.map(l => ({ ...l, ...calculateDerived(l) }));
      }
      loads.forEach((load, idx) => tbody.appendChild(createRow(load, idx)));
      selectAll.checked = false;
      recalculateTotals(loads);
      updateSummary(loads);
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

  // --- events -------------------------------------------------------------
  deleteBtn.addEventListener('click', () => {
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => r.querySelector('.row-select').checked);
    if (!rows.length) return;
    if (!confirm('Delete selected loads?')) return;
    const indices = rows.map(r => Number(r.dataset.index));
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
      alert('Copy failed');
    });
  });

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
          alert('Invalid load data');
        }
      } catch {
        alert('Invalid load data');
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
      } catch {
        alert('Invalid CSV load data');
      }
    });
    e.target.value = '';
  });

  // Initial render for an empty table; rows populate on 'loadList' events
  render();
  });
}


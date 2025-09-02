import * as dataStore from './dataStore.mjs';

export function calculateDerived(load) {
  const qty = parseFloat(load.quantity) || 1;
  const voltage = parseFloat(load.voltage);
  const kw = parseFloat(load.kw);
  const pf = parseFloat(load.powerFactor);
  const df = parseFloat(load.demandFactor);
  const phases = parseInt(load.phases, 10);
  const totalKw = isNaN(kw) ? 0 : kw * qty;
  const kVA = pf ? totalKw / pf : totalKw;
  const phaseFactor = phases === 1 ? 1 : Math.sqrt(3);
  const current = voltage ? (kVA * 1000) / (phaseFactor * voltage) : 0;
  const demandKW = totalKw * (isNaN(df) ? 1 : df / 100);
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
    initSettings();
    initDarkMode();
    initCompactMode();
    initNavToggle();

    const tbody = document.querySelector('#load-table tbody');
    const tfoot = document.querySelector('#load-table tfoot');
    const deleteBtn = document.getElementById('delete-selected-btn');
    const selectAll = document.getElementById('select-all');
    const summaryDiv = document.getElementById('source-summary');

    // --- helpers ------------------------------------------------------------
    function format(num) {
      const n = Number(num);
      return Number.isFinite(n) && n !== 0 ? n.toFixed(2) : '';
    }
  function gatherRow(tr) {
    return {
      source: tr.querySelector('input[name="source"]').value.trim(),
      tag: tr.querySelector('input[name="tag"]').value.trim(),
      description: tr.querySelector('input[name="description"]').value.trim(),
      quantity: tr.querySelector('input[name="quantity"]').value.trim(),
      voltage: tr.querySelector('input[name="voltage"]').value.trim(),
      loadType: tr.querySelector('input[name="loadType"]').value.trim(),
      duty: tr.querySelector('select[name="duty"]').value.trim(),
      kw: tr.querySelector('input[name="kw"]').value.trim(),
      powerFactor: tr.querySelector('input[name="powerFactor"]').value.trim(),
      demandFactor: tr.querySelector('input[name="demandFactor"]').value.trim(),
      phases: tr.querySelector('input[name="phases"]').value.trim(),
      circuit: tr.querySelector('input[name="circuit"]').value.trim()
    };
  }

  function saveRow(tr) {
    const idx = Number(tr.dataset.index);
    const load = gatherRow(tr);
    const computed = calculateDerived(load);
    Object.assign(load, computed);
    dataStore.updateLoad(idx, load);
    tr.querySelector('.kva').textContent = format(computed.kva);
    tr.querySelector('.current').textContent = format(computed.current);
    tr.querySelector('.demand-kva').textContent = format(computed.demandKva);
    tr.querySelector('.demand-kw').textContent = format(computed.demandKw);
    updateFooter();
    updateSummary();
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
    tr.innerHTML = `
      <td><button type="button" class="insert-row" aria-label="Insert row">➕</button><input type="checkbox" class="row-select" aria-label="Select row"></td>
      <td><input name="source" type="text" value="${load.source || ''}"></td>
      <td><input name="tag" type="text" value="${load.tag || ''}"></td>
      <td><input name="description" type="text" value="${load.description || ''}"></td>
      <td><input name="quantity" type="number" step="any" value="${load.quantity || ''}"></td>
      <td><input name="voltage" type="number" step="any" value="${load.voltage || ''}"></td>
      <td><input name="loadType" type="text" value="${load.loadType || ''}"></td>
      <td><select name="duty">
        <option value=""></option>
        <option value="Continuous"${load.duty === 'Continuous' ? ' selected' : ''}>Continuous</option>
        <option value="Intermittent"${load.duty === 'Intermittent' ? ' selected' : ''}>Intermittent</option>
        <option value="Stand-by"${load.duty === 'Stand-by' ? ' selected' : ''}>Stand-by</option>
      </select></td>
      <td><input name="kw" type="number" step="any" value="${load.kw || ''}"></td>
      <td><input name="powerFactor" type="number" step="any" value="${load.powerFactor || ''}"></td>
      <td><input name="demandFactor" type="number" step="any" value="${load.demandFactor || ''}"></td>
      <td><input name="phases" type="text" value="${load.phases || ''}"></td>
      <td><input name="circuit" type="text" value="${load.circuit || ''}"></td>
      <td class="kva">${format(load.kva)}</td>
      <td class="current">${format(load.current)}</td>
      <td class="demand-kva">${format(load.demandKva)}</td>
      <td class="demand-kw">${format(load.demandKw)}</td>`;

    Array.from(tr.querySelectorAll('input[type="text"],input[type="number"],select')).forEach(input => {
      const td = input.parentElement;
      input.addEventListener('blur', () => saveRow(tr));
      if (input.tagName === 'SELECT') {
        input.addEventListener('change', () => saveRow(tr));
      }
      input.addEventListener('keydown', e => handleNav(e, td));
    });

    const insertBtn = tr.querySelector('.insert-row');
    insertBtn.addEventListener('click', () => {
      const index = Number(tr.dataset.index) + 1;
      insertLoad(index, {
        source: '',
        tag: '',
        description: '',
        quantity: '',
        voltage: '',
        loadType: '',
        duty: '',
        kw: '',
        powerFactor: '',
        demandFactor: '',
        phases: '',
        circuit: ''
      });
    });

    const chk = tr.querySelector('.row-select');
    chk.addEventListener('change', () => {
      if (!chk.checked) selectAll.checked = false;
    });

    return tr;
  }

  function updateFooter(loads = dataStore.getLoads()) {
    if (!tfoot) return;
    const totals = loads.reduce((acc, l) => {
      acc.kW += parseFloat(l.kw) || 0;
      acc.kVA += parseFloat(l.kva) || 0;
      acc.demandKVA += parseFloat(l.demandKva) || 0;
      acc.demandKW += parseFloat(l.demandKw) || 0;
      return acc;
    }, { kW: 0, kVA: 0, demandKVA: 0, demandKW: 0 });
    tfoot.innerHTML = `<tr>
      <td colspan="8">Totals</td>
      <td>${totals.kW.toFixed(2)}</td>
      <td colspan="4"></td>
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
    tbody.innerHTML = '';
    let loads = dataStore.getLoads();
    if (!loads.length) {
      // Ensure at least one editable row renders even with no stored data
      loads = [{}];
    } else {
      loads = loads.map(l => ({ ...l, ...calculateDerived(l) }));
    }
    dataStore.setLoads(loads);
    loads.forEach((load, idx) => tbody.appendChild(createRow(load, idx)));
    selectAll.checked = false;
    updateFooter(loads);
    updateSummary(loads);
  }

  function loadsToCSV(loads, delimiter = ',') {
    const header = [
      'source',
      'tag',
      'description',
      'quantity',
      'voltage',
      'loadType',
      'duty',
      'kw',
      'powerFactor',
      'demandFactor',
      'phases',
      'circuit',
      'panelId',
      'breaker',
      'kva',
      'current',
      'demandKva',
      'demandKw'
    ].join(delimiter);
    const lines = loads.map(l => {
      const base = { source: '', panelId: '', breaker: '', duty: '', ...l };
      const full = { ...base, ...calculateDerived(base) };
      const vals = [
        full.source,
        full.tag,
        full.description,
        full.quantity,
        full.voltage,
        full.loadType,
        full.duty,
        full.kw,
        full.powerFactor,
        full.demandFactor,
        full.phases,
        full.circuit,
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
      if (cols.length === 11 || cols.length === 12) {
        let source = '';
        let tag, description, quantity, voltage, loadType, duty, kw, powerFactor, demandFactor, phases, circuit;
        if (cols.length === 11) {
          [tag, description, quantity, voltage, loadType, duty, kw, powerFactor, demandFactor, phases, circuit] = cols;
        } else {
          [source, tag, description, quantity, voltage, loadType, duty, kw, powerFactor, demandFactor, phases, circuit] = cols;
        }
        const nums = [quantity, voltage, kw, powerFactor, demandFactor];
        if (nums.some(n => n && isNaN(Number(n)))) throw new Error('Invalid CSV data');
        load = {
          source,
          tag,
          description,
          quantity,
          voltage,
          loadType,
          duty,
          kw,
          powerFactor,
          demandFactor,
          phases,
          circuit,
          panelId: '',
          breaker: ''
        };
      } else if (cols.length === 17 || cols.length === 18) {
        let source = '';
        let tag, description, quantity, voltage, loadType, duty, kw, powerFactor, demandFactor, phases, circuit, panelId, breaker, kva, current, demandKva, demandKw;
        if (cols.length === 17) {
          [
            tag,
            description,
            quantity,
            voltage,
            loadType,
            duty,
            kw,
            powerFactor,
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
        } else {
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
        }
        const nums = [quantity, voltage, kw, powerFactor, demandFactor, kva, current, demandKva, demandKw];
        if (nums.some(n => n && isNaN(Number(n)))) throw new Error('Invalid CSV data');
        load = {
          source,
          tag,
          description,
          quantity,
          voltage,
          loadType,
          duty,
          kw,
          powerFactor,
          demandFactor,
          phases,
          circuit,
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

  document.getElementById('search').addEventListener('input', e => {
    const term = e.target.value.toLowerCase();
    Array.from(tbody.rows).forEach(row => {
      const match = Array.from(row.querySelectorAll('input[type="text"],input[type="number"],select'))
        .some(inp => (inp.value || '').toLowerCase().includes(term));
      row.style.display = match ? '' : 'none';
    });
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const data = dataStore.getLoads().map(l => {
      const base = { panelId: '', breaker: '', duty: '', ...l };
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
            quantity: '',
            voltage: '',
            loadType: '',
            duty: '',
            kw: '',
            powerFactor: '',
            demandFactor: '',
            phases: '',
            circuit: '',
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

  render();
  });
}


import * as dataStore from './dataStore.mjs';

// Inline load list editor
window.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initNavToggle();

  const tbody = document.querySelector('#load-table tbody');
  const addBtn = document.getElementById('add-row-btn');
  const deleteBtn = document.getElementById('delete-selected-btn');
  const selectAll = document.getElementById('select-all');

  // --- helpers ------------------------------------------------------------
  function gatherRow(tr) {
    return {
      description: tr.querySelector('input[name="description"]').value.trim(),
      power: tr.querySelector('input[name="power"]').value.trim(),
      phases: tr.querySelector('input[name="phases"]').value.trim(),
      circuit: tr.querySelector('input[name="circuit"]').value.trim()
    };
  }

  function saveRow(tr) {
    const idx = Number(tr.dataset.index);
    dataStore.updateLoad(idx, gatherRow(tr));
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
      <td><input type="checkbox" class="row-select" aria-label="Select row"></td>
      <td><input name="description" type="text" value="${load.description || ''}"></td>
      <td><input name="power" type="number" step="any" value="${load.power || ''}"></td>
      <td><input name="phases" type="text" value="${load.phases || ''}"></td>
      <td><input name="circuit" type="text" value="${load.circuit || ''}"></td>`;

    Array.from(tr.querySelectorAll('input[type="text"],input[type="number"]')).forEach(input => {
      const td = input.parentElement;
      input.addEventListener('blur', () => saveRow(tr));
      input.addEventListener('keydown', e => handleNav(e, td));
    });

    const chk = tr.querySelector('.row-select');
    chk.addEventListener('change', () => {
      if (!chk.checked) selectAll.checked = false;
    });

    return tr;
  }

  function render() {
    tbody.innerHTML = '';
    const loads = dataStore.getLoads();
    loads.forEach((load, idx) => tbody.appendChild(createRow(load, idx)));
    selectAll.checked = false;
  }

  function loadsToCSV(loads, delimiter = ',') {
    const header = ['description', 'power', 'phases', 'circuit'].join(delimiter);
    const lines = loads.map(l => {
      const vals = [l.description, l.power, l.phases, l.circuit].map(v => {
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
    if (first.includes('description') && first.includes('power')) lines.shift();
    return lines.map(line => {
      const cols = line
        .split(delimiter)
        .map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
      if (cols.length !== 4) throw new Error('Invalid CSV format');
      const [description, power, phases, circuit] = cols;
      if (power && isNaN(Number(power))) throw new Error('Invalid CSV data');
      return { description, power, phases, circuit };
    });
  }

  // --- events -------------------------------------------------------------
  addBtn.addEventListener('click', () => {
    dataStore.addLoad({ description: '', power: '', phases: '', circuit: '' });
    render();
    const last = tbody.lastElementChild;
    if (last) {
      const inp = last.querySelector('input[name="description"]');
      inp && inp.focus();
    }
  });

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
      const match = Array.from(row.querySelectorAll('input[type="text"],input[type="number"]'))
        .some(inp => inp.value.toLowerCase().includes(term));
      row.style.display = match ? '' : 'none';
    });
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const data = dataStore.getLoads();
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
          dataStore.setLoads(data);
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


(() => {
  const state = { rows: [] };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    bind('#btnSave', onSave);
    bind('#btnLoad', onLoad);
    bind('#btnLoadSample', onLoadSample);
    bind('#btnClearFilters', onClearFilters);
    bind('#btnExportXlsx', onExportXlsx);
    bind('#btnImportXlsx', onImportXlsx);
    bind('#btnDeleteAll', onDeleteAll);
    bind('#btnAddCable', onAddCable);
    if (!window.XLSX) {
      disable('#btnExportXlsx');
      disable('#btnImportXlsx');
    }
    render();
    window.__CableScheduleInitOK = true;
  }

  function disable(sel) {
    const el = document.querySelector(sel);
    if (el) {
      el.setAttribute('disabled', 'disabled');
      el.title = 'XLSX library not loaded';
    }
  }

  function bind(sel, fn) {
    const el = document.querySelector(sel);
    if (!el) {
      console.warn('Missing element', sel);
    }
    el?.addEventListener('click', fn);
  }

  function syncFromTable() {
    const rows = [];
    document
      .querySelectorAll('#cableScheduleTable tbody tr')
      .forEach(tr => {
        const cells = tr.querySelectorAll('td');
        rows.push({
          cable: cells[0]?.textContent.trim(),
          description: cells[1]?.textContent.trim(),
          length: cells[2]?.textContent.trim()
        });
      });
    state.rows = rows;
  }

  function onSave() {
    try {
      syncFromTable();
      localStorage.setItem('cableSchedule', JSON.stringify(state.rows));
    } catch (e) {
      console.error('Save failed', e);
    }
  }

  function onLoad() {
    try {
      state.rows = JSON.parse(localStorage.getItem('cableSchedule') || '[]');
      render();
    } catch (e) {
      console.error('Load failed', e);
    }
  }

  function onLoadSample() {
    state.rows = sampleRows();
    render();
  }

  function onClearFilters() {
    clearFilterInputs();
    render();
  }

  function onExportXlsx() {
    syncFromTable();
    if (!window.XLSX) return alert('XLSX not loaded');
    const ws = XLSX.utils.json_to_sheet(state.rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cables');
    XLSX.writeFile(wb, 'cables.xlsx');
  }

  function onImportXlsx() {
    if (!window.XLSX) return alert('XLSX not loaded');
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.xlsx,.xls';
    inp.onchange = () => {
      const file = inp.files[0];
      if (!file) return;
      const fr = new FileReader();
      fr.onload = () => {
        const data = new Uint8Array(fr.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);
        state.rows = state.rows.concat(rows);
        render();
      };
      fr.readAsArrayBuffer(file);
    };
    inp.click();
  }

  function onDeleteAll() {
    if (confirm('Delete all rows?')) {
      state.rows = [];
      localStorage.removeItem('cableSchedule');
      render();
    }
  }

  function onAddCable() {
    state.rows.push(defaultRow());
    render();
    focusLastRow();
  }

  function render() {
    const table = document.getElementById('cableScheduleTable');
    if (!table) return;
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    if (thead && !thead.innerHTML) {
      thead.innerHTML =
        '<tr><th>Cable</th><th>Description</th><th>Length</th></tr>';
    }
    if (tbody) {
      tbody.innerHTML = '';
      state.rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td contenteditable>${row.cable ?? ''}</td>
          <td contenteditable>${row.description ?? ''}</td>
          <td contenteditable>${row.length ?? ''}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  function focusLastRow() {
    document
      .querySelector('#cableScheduleTable tbody tr:last-child td:first-child')
      ?.focus();
  }

  function sampleRows() {
    return [
      { cable: 'CBL-001', description: 'Pump Motor', length: 100 },
      { cable: 'CBL-002', description: 'Lighting Circuit', length: 50 },
      { cable: 'CBL-003', description: 'Control Cable', length: 30 }
    ];
  }

  function defaultRow() {
    return { cable: '', description: '', length: 0 };
  }

  function clearFilterInputs() {
    document.querySelectorAll('[data-filter]').forEach(el => (el.value = ''));
  }
})();

import './tableUtils.js';

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initSettings();
    initDarkMode();
    initCompactMode();
    initNavToggle();

    const columns = [
      { key: 'id', label: 'ID', type: 'text' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'voltage', label: 'Voltage (V)', type: 'text' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'subCategory', label: 'Sub-Category', type: 'text' },
      { key: 'manufacturer', label: 'Manufacturer', type: 'text' },
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'phases', label: 'Phases', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'text' },
      { key: 'x', label: 'X', type: 'number' },
      { key: 'y', label: 'Y', type: 'number' },
      { key: 'z', label: 'Z', type: 'number' }
    ];

    let table;
    table = TableUtils.createTable({
      tableId: 'equipment-table',
      storageKey: TableUtils.STORAGE_KEYS.equipment,
      columnsKey: TableUtils.STORAGE_KEYS.equipmentColumns,
      addRowBtnId: 'add-row-btn',
      deleteSelectedBtnId: 'delete-selected-btn',
      exportBtnId: 'export-xlsx-btn',
      importInputId: 'import-xlsx-input',
      importBtnId: 'import-xlsx-btn',
      selectable: true,
      enableContextMenu: true,
      columns,
      onChange: () => {
        table.save();
        const fn = window.opener?.updateComponent || window.updateComponent;
        if (fn) {
          table.getData().forEach(row => {
            const id = row.ref || row.id;
            if (id) fn(id, row);
          });
        }
      }
    });

    const addColBtn = document.getElementById('add-column-btn');
    const modal = document.getElementById('add-column-modal');
    const keyInput = document.getElementById('new-col-key');
    const labelInput = document.getElementById('new-col-label');
    const typeInput = document.getElementById('new-col-type');
    const confirmBtn = document.getElementById('confirm-add-column');

    addColBtn.addEventListener('click', () => {
      modal.style.display = 'flex';
      keyInput.value = '';
      labelInput.value = '';
      typeInput.value = 'text';
      keyInput.focus();
    });

    confirmBtn.addEventListener('click', () => {
      const key = keyInput.value.trim();
      const label = labelInput.value.trim();
      const type = typeInput.value;
      if (!key || !label) return;
      table.addColumn({ key, label, type });
      modal.style.display = 'none';
    });

    modal.addEventListener('click', e => {
      if (e.target === modal) modal.style.display = 'none';
    });

    const fieldMap = {
      'EquipmentID': 'id',
      'ID': 'id',
      'Description': 'description',
      'Voltage': 'voltage',
      'Category': 'category',
      'Sub-Category': 'subCategory',
      'Manufacturer': 'manufacturer',
      'Model': 'model',
      'Phases': 'phases',
      'Notes': 'notes',
      'X': 'x',
      'Y': 'y',
      'Z': 'z'
    };

    const csvBtn = document.getElementById('import-csv-btn');
    const csvInput = document.getElementById('import-csv-input');
    if (csvBtn && csvInput) {
      csvBtn.addEventListener('click', () => csvInput.click());
      csvInput.addEventListener('change', e => {
        importCsv(e.target.files[0]);
        e.target.value = '';
      });
    }

    const xmlBtn = document.getElementById('import-xml-btn');
    const xmlInput = document.getElementById('import-xml-input');
    if (xmlBtn && xmlInput) {
      xmlBtn.addEventListener('click', () => xmlInput.click());
      xmlInput.addEventListener('change', e => {
        importXml(e.target.files[0]);
        e.target.value = '';
      });
    }

    function mapExternal(obj = {}) {
      const row = {};
      Object.keys(fieldMap).forEach(key => {
        const internal = fieldMap[key];
        row[internal] = obj[key] || obj[key.toLowerCase()] || '';
      });
      return row;
    }

    function importCsv(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (!lines.length) return;
        const headers = lines.shift().split(',').map(h => h.trim());
        const rows = lines.map(line => {
          const cells = line.split(',');
          const obj = {};
          headers.forEach((h, i) => obj[h] = cells[i] ? cells[i].trim() : '');
          return obj;
        });
        table.tbody.innerHTML = '';
        rows.forEach(r => table.addRow(mapExternal(r)));
        table.applyFilters();
        table.save();
        if (table.onChange) table.onChange();
      };
      reader.readAsText(file);
    }

    function importXml(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        const text = e.target.result;
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        const items = Array.from(doc.getElementsByTagName('equipment'))
          .concat(Array.from(doc.getElementsByTagName('item')));
        table.tbody.innerHTML = '';
        items.forEach(el => {
          const obj = {};
          Object.keys(fieldMap).forEach(key => {
            const n = el.getElementsByTagName(key)[0];
            if (n) obj[key] = n.textContent;
          });
          table.addRow(mapExternal(obj));
        });
        table.applyFilters();
        table.save();
        if (table.onChange) table.onChange();
      };
      reader.readAsText(file);
    }
  });
}


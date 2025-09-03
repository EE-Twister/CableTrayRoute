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
      onChange: () => table.save()
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
  });
}


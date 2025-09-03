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
      { key: 'voltage', label: 'Voltage (V)', type: 'text' }
    ];

    let table;
    table = TableUtils.createTable({
      tableId: 'equipment-table',
      storageKey: TableUtils.STORAGE_KEYS.equipment,
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
  });
}


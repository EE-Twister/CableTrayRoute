import * as dataStore from './dataStore.mjs';
import './tableUtils.mjs';

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const projectId = window.currentProjectId || 'default';
    dataStore.loadProject(projectId);
    initSettings();
    initDarkMode();
    initCompactMode();
    initNavToggle();

      const columns = [
        { key: 'tag', label: 'Equipment Tag', type: 'text' },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'voltage', label: 'Voltage (V)', type: 'text' },
        { key: 'category', label: 'Category', type: 'text' },
        { key: 'subCategory', label: 'Sub-Category', type: 'text' },
        { key: 'manufacturer', label: 'Manufacturer', type: 'text', className: 'manufacturer-input', filter: 'dropdown' },
        { key: 'model', label: 'Model', type: 'text', className: 'model-input' },
        { key: 'phases', label: 'Phases', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'text' },
        { key: 'x', label: 'X', type: 'number', step: 'any', maxlength: 15, validate: 'numeric' },
        { key: 'y', label: 'Y', type: 'number', step: 'any', maxlength: 15, validate: 'numeric' },
        { key: 'z', label: 'Z', type: 'number', step: 'any', maxlength: 15, validate: 'numeric' }
      ];

      const hiddenColumns = new Set(['id', 'ref']);
      const existing = new Set(columns.map(c => c.key).concat(Array.from(hiddenColumns)));
      dataStore.getEquipment().forEach(eq => {
        Object.keys(eq).forEach(k => {
          if (hiddenColumns.has(k)) return;
          if (!existing.has(k)) {
            existing.add(k);
            columns.push({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1), type: 'text' });
          }
        });
      });


    let refreshCategoryOptions = () => {};
    let applyEquipmentFilters = () => {};

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
      showActionColumn: false,
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
        dataStore.saveProject(projectId);
        refreshCategoryOptions();
        applyEquipmentFilters();
      }
    });

    const searchInput = document.getElementById('equipment-search');
    const categoryFilter = document.getElementById('equipment-category-filter');
    const presetSelect = document.getElementById('equipment-preset-select');
    const savePresetBtn = document.getElementById('save-equipment-preset-btn');
    const bulkCategoryBtn = document.getElementById('bulk-category-btn');
    const clearFiltersBtn = document.getElementById('clear-equipment-filters-btn');
    const resultsCount = document.getElementById('equipment-results-count');
    const quickFilters = document.getElementById('equipment-quick-filters');
    const validationSummary = document.getElementById('equipment-validation-summary');

    const presets = Array.isArray(dataStore.getEquipmentFilterPresets()) ? dataStore.getEquipmentFilterPresets() : [];

    const getColumnIndex = key => table.columns.findIndex(c => c.key === key);
    const getCellInput = (row, key) => {
      const idx = getColumnIndex(key);
      if (idx === -1) return null;
      const cell = row.cells[idx + table.colOffset];
      return cell && cell.firstChild ? cell.firstChild : null;
    };

    const getVisibleRowCount = () => Array.from(table.tbody.rows).filter(row => row.style.display !== 'none').length;

    const updateResultSummary = () => {
      if (!resultsCount) return;
      const total = table.tbody.rows.length;
      const visible = getVisibleRowCount();
      if (!total) {
        resultsCount.textContent = 'No equipment items yet.';
        return;
      }
      resultsCount.textContent = `${visible} of ${total} item${total === 1 ? '' : 's'} shown`;
    };

    const refreshPresetOptions = () => {
      if (!presetSelect) return;
      const selected = presetSelect.value;
      presetSelect.innerHTML = '<option value="">Filter preset...</option>';
      presets
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(preset => {
          const option = document.createElement('option');
          option.value = preset.name;
          option.textContent = preset.name;
          presetSelect.appendChild(option);
        });
      if (selected && presets.some(preset => preset.name === selected)) {
        presetSelect.value = selected;
      }
    };

    const renderQuickFilters = () => {
      if (!quickFilters) return;
      const counts = new Map();
      table.getData().forEach(row => {
        const category = String(row.category || '').trim();
        if (!category) return;
        counts.set(category, (counts.get(category) || 0) + 1);
      });
      const top = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 6);
      quickFilters.innerHTML = '';
      const chips = [{ label: 'All', value: '' }, ...top.map(([value, count]) => ({ label: `${value} (${count})`, value }) )];
      chips.forEach(chip => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'equipment-chip';
        if ((categoryFilter ? categoryFilter.value : '') === chip.value) {
          button.classList.add('active');
        }
        button.textContent = chip.label;
        button.addEventListener('click', () => {
          if (categoryFilter) categoryFilter.value = chip.value;
          applyEquipmentFilters();
        });
        quickFilters.appendChild(button);
      });
    };

    const validateEquipmentRows = () => {
      const rows = Array.from(table.tbody.rows);
      const tags = new Map();
      rows.forEach(row => {
        const tagInput = getCellInput(row, 'tag');
        const value = tagInput ? String(tagInput.value || '').trim().toLowerCase() : '';
        if (!value) return;
        tags.set(value, (tags.get(value) || 0) + 1);
      });

      let issueCount = 0;
      rows.forEach(row => {
        const tagInput = getCellInput(row, 'tag');
        const voltageInput = getCellInput(row, 'voltage');
        const manufacturerInput = getCellInput(row, 'manufacturer');
        [tagInput, voltageInput, manufacturerInput].forEach(input => {
          if (!input) return;
          input.classList.remove('equipment-input-error');
          input.removeAttribute('data-validation-message');
        });

        if (tagInput) {
          const tag = String(tagInput.value || '').trim();
          const tagKey = tag.toLowerCase();
          if (!tag) {
            issueCount += 1;
            tagInput.classList.add('equipment-input-error');
            tagInput.setAttribute('data-validation-message', 'Tag is required.');
          } else if ((tags.get(tagKey) || 0) > 1) {
            issueCount += 1;
            tagInput.classList.add('equipment-input-error');
            tagInput.setAttribute('data-validation-message', 'Tag must be unique.');
          }
        }

        if (voltageInput) {
          const voltage = String(voltageInput.value || '').trim();
          const looksValid = !voltage || /^\d+(?:\.\d+)?(?:\s*[kKmM]?[vV])?(?:\s*\/\s*\d+(?:\.\d+)?(?:\s*[kKmM]?[vV])?)?$/.test(voltage);
          if (!looksValid) {
            issueCount += 1;
            voltageInput.classList.add('equipment-input-error');
            voltageInput.setAttribute('data-validation-message', 'Use a voltage format like 480, 13.8kV, or 480/277.');
          }
        }

        if (manufacturerInput && !String(manufacturerInput.value || '').trim()) {
          issueCount += 1;
          manufacturerInput.classList.add('equipment-input-error');
          manufacturerInput.setAttribute('data-validation-message', 'Manufacturer is recommended for procurement/export.');
        }
      });

      if (validationSummary) {
        validationSummary.textContent = issueCount
          ? `${issueCount} validation issue${issueCount === 1 ? '' : 's'} detected. Fix highlighted cells.`
          : 'No validation issues detected.';
      }
    };

    applyEquipmentFilters = () => {
      const searchValue = searchInput ? searchInput.value.trim() : '';
      table.globalFilter = searchValue;
      if (categoryFilter && categoryFilter.value) {
        const category = categoryFilter.value.toLowerCase();
        table.setCustomFilter('equipment-category', row => {
          const idx = table.columns.findIndex(c => c.key === 'category');
          if (idx === -1) return true;
          const cell = row.cells[idx + table.colOffset];
          const value = cell && cell.firstChild ? String(cell.firstChild.value || '').toLowerCase() : '';
          return value === category;
        });
      } else {
        table.setCustomFilter('equipment-category', null);
      }
      table.applyFilters();
      updateResultSummary();
      renderQuickFilters();
      validateEquipmentRows();
    };

    refreshCategoryOptions = () => {
      if (!categoryFilter) return;
      const selected = categoryFilter.value;
      const categories = new Set();
      table.getData().forEach(row => {
        const value = String(row.category || '').trim();
        if (value) categories.add(value);
      });
      const sorted = Array.from(categories).sort((a, b) => a.localeCompare(b));
      categoryFilter.innerHTML = '<option value="">All categories</option>';
      sorted.forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        categoryFilter.appendChild(option);
      });
      if (selected && sorted.includes(selected)) {
        categoryFilter.value = selected;
      }
    };

    if (searchInput) {
      table.globalFilterCols = ['tag', 'description', 'manufacturer', 'category', 'model'];
      searchInput.addEventListener('input', applyEquipmentFilters);
    }

    if (categoryFilter) {
      categoryFilter.addEventListener('change', applyEquipmentFilters);
    }

    if (presetSelect) {
      presetSelect.addEventListener('change', () => {
        const preset = presets.find(item => item.name === presetSelect.value);
        if (!preset) return;
        if (searchInput) searchInput.value = preset.search || '';
        if (categoryFilter) categoryFilter.value = preset.category || '';
        applyEquipmentFilters();
      });
    }

    if (savePresetBtn) {
      savePresetBtn.addEventListener('click', () => {
        const name = window.prompt('Preset name:');
        if (!name) return;
        const normalized = name.trim();
        if (!normalized) return;
        const payload = {
          name: normalized,
          search: searchInput ? searchInput.value.trim() : '',
          category: categoryFilter ? categoryFilter.value : ''
        };
        const idx = presets.findIndex(item => item.name.toLowerCase() === normalized.toLowerCase());
        if (idx >= 0) {
          presets[idx] = payload;
        } else {
          presets.push(payload);
        }
        dataStore.setEquipmentFilterPresets(presets);
        refreshPresetOptions();
        if (presetSelect) presetSelect.value = normalized;
      });
    }

    if (bulkCategoryBtn) {
      bulkCategoryBtn.addEventListener('click', () => {
        const targetCategory = window.prompt('Set selected rows to category:');
        if (targetCategory === null) return;
        const categoryValue = targetCategory.trim();
        const categoryIdx = getColumnIndex('category');
        if (categoryIdx === -1) return;
        const selectedRows = Array.from(table.tbody.rows).filter(row => {
          const checkbox = row.querySelector('.row-select');
          return checkbox && checkbox.checked;
        });
        selectedRows.forEach(row => {
          const cell = row.cells[categoryIdx + table.colOffset];
          const input = cell && cell.firstChild ? cell.firstChild : null;
          if (input) input.value = categoryValue;
        });
        if (selectedRows.length) {
          table.save();
          if (table.onChange) table.onChange();
        }
      });
    }

    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (categoryFilter) categoryFilter.value = '';
        if (presetSelect) presetSelect.value = '';
        applyEquipmentFilters();
      });
    }

    table.tbody.addEventListener('input', e => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (!input.matches('input[type="text"], input[type="number"]')) return;
      validateEquipmentRows();
    });

    refreshPresetOptions();
    refreshCategoryOptions();
    renderQuickFilters();
    applyEquipmentFilters();

    function generateId(existing, base) {
      let id = base || 'item';
      let i = 1;
      while (existing.includes(id)) {
        id = `${base || 'item'}_${i++}`;
      }
      return id;
    }

    table.tbody.addEventListener('click', e => {
      const btn = e.target;
      const tr = btn.closest('tr');
      if (!tr) return;
      if (btn.classList.contains('duplicateBtn')) {
        e.stopImmediatePropagation();
        const data = table.getData();
        const idx = Array.from(table.tbody.rows).indexOf(tr);
        const clone = { ...data[idx] };
        const ids = data.map(r => r.id).filter(Boolean);
        clone.id = generateId(ids, clone.id);
        data.splice(idx + 1, 0, clone);
        table.setData(data);
        table.save();
        if (table.onChange) table.onChange();
      } else if (btn.classList.contains('removeBtn')) {
        e.stopImmediatePropagation();
        const data = table.getData();
        const idx = Array.from(table.tbody.rows).indexOf(tr);
        data.splice(idx, 1);
        table.setData(data);
        table.save();
        if (table.onChange) table.onChange();
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
      'Tag': 'tag',
      'Equipment Tag': 'tag',
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


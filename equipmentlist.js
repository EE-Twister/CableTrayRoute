import * as dataStore from './dataStore.mjs';
import './tableUtils.mjs';
import { openModal, showAlertModal } from './src/components/modal.js';
import {
  applyBulkEquipmentUpdate,
  inferEquipmentMapping,
  mapRowsToEquipment,
  mergeEquipmentRows,
  previewEquipmentImport,
  starterEquipment,
  summarizeEquipment
} from './analysis/equipmentWorkflow.mjs';
import { openOneLineProbe } from './src/crossProbe.js';

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const projectId = window.currentProjectId;
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
        { key: 'arrangement', label: 'Arrangement', type: 'text' },
        { key: 'width', label: 'Width (ft)', type: 'number', step: 'any', maxlength: 15, validate: 'numeric' },
        { key: 'depth', label: 'Depth (ft)', type: 'number', step: 'any', maxlength: 15, validate: 'numeric' },
        { key: 'height', label: 'Height (ft)', type: 'number', step: 'any', maxlength: 15, validate: 'numeric' },
        { key: 'baseElevation', label: 'Base Elev. (ft)', type: 'number', step: 'any', maxlength: 15, validate: 'numeric' },
        { key: 'lineup', label: 'Lineup', type: 'text' },
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
      deleteSelectedBtnId: 'delete-selected-btn',
      exportBtnId: 'export-xlsx-btn',
      selectable: true,
      enableContextMenu: true,
      contextMenuViewLabel: 'View on One-Line',
      onView: row => openOneLineProbe(row, { probeType: 'equipment' }),
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
    const bulkArrangementBtn = document.getElementById('bulk-arrangement-btn');
    const bulkLineupBtn = document.getElementById('bulk-lineup-btn');
    const clearFiltersBtn = document.getElementById('clear-equipment-filters-btn');
    const resultsCount = document.getElementById('equipment-results-count');
    const quickFilters = document.getElementById('equipment-quick-filters');
    const validationSummary = document.getElementById('equipment-validation-summary');
    const summaryCards = document.getElementById('equipment-summary-cards');
    const emptyGuide = document.getElementById('equipment-empty-guide');
    const starterBtn = document.getElementById('load-starter-equipment-btn');
    const emptyAddBtn = document.getElementById('empty-add-equipment-btn');
    const emptyImportBtn = document.getElementById('empty-import-equipment-btn');
    const emptyStarterBtn = document.getElementById('empty-starter-equipment-btn');
    const addEquipmentBtn = document.getElementById('add-row-btn');
    const importXlsxBtn = document.getElementById('import-xlsx-btn');
    const importXlsxInput = document.getElementById('import-xlsx-input');

    const presets = Array.isArray(dataStore.getEquipmentFilterPresets()) ? dataStore.getEquipmentFilterPresets() : [];

    const getColumnIndex = key => table.columns.findIndex(c => c.key === key);
    const getCellInput = (row, key) => {
      const idx = getColumnIndex(key);
      if (idx === -1) return null;
      const cell = row.cells[idx + table.colOffset];
      return cell && cell.firstChild ? cell.firstChild : null;
    };
    const getVisibleRowCount = () => Array.from(table.tbody.rows).filter(row => row.style.display !== 'none').length;
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);

    const renderEquipmentSummary = () => {
      if (!summaryCards) return;
      const summary = summarizeEquipment(table.getData());
      const cards = [
        { label: 'Equipment', value: summary.total },
        { label: 'Missing Tags', value: summary.missingTags, warn: summary.missingTags > 0 },
        { label: 'Duplicate Tags', value: summary.duplicateTags, warn: summary.duplicateTags > 0 },
        { label: 'Missing Voltage', value: summary.missingVoltage, warn: summary.missingVoltage > 0 },
        { label: 'Missing Manufacturer', value: summary.missingManufacturer, warn: summary.missingManufacturer > 0 },
        { label: 'Arrangements', value: summary.assignedArrangements }
      ];
      summaryCards.innerHTML = cards.map(card => `
        <article class="workflow-summary-card${card.warn ? ' workflow-summary-card--warn' : ''}">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
        </article>
      `).join('');
      if (emptyGuide) emptyGuide.hidden = summary.total > 0;
    };

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
      renderEquipmentSummary();
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

    const commitEquipmentRows = rows => {
      table.setData(rows);
      table.save();
      if (table.onChange) table.onChange();
    };

    const openEquipmentModal = async () => {
      const result = await openModal({
        title: 'Add Equipment',
        description: 'Capture the fields downstream modules need for load source links and one-line references.',
        primaryText: 'Add Equipment',
        secondaryText: 'Cancel',
        defaultWidth: 'medium',
        render(body, controller) {
          const form = document.createElement('form');
          form.className = 'modal-form equipment-modal-form';
          form.innerHTML = `
            <label>Equipment Tag<input name="tag" type="text" placeholder="SWBD-101" required></label>
            <label>Description<input name="description" type="text" placeholder="480 V main switchboard"></label>
            <label>Voltage<input name="voltage" type="text" placeholder="480/277" required></label>
            <label>Category<input name="category" type="text" placeholder="Distribution"></label>
            <label>Sub-Category<input name="subCategory" type="text" placeholder="Switchboard"></label>
            <label>Arrangement<input name="arrangement" type="text" placeholder="Electrical Room A"></label>
            <label>Lineup<input name="lineup" type="text" placeholder="SWBD-101"></label>
            <label>Manufacturer<input name="manufacturer" type="text" placeholder="Square D"></label>
            <label>Model<input name="model" type="text" placeholder="Power-Style QED"></label>
            <label>Phases<input name="phases" type="text" placeholder="3"></label>
            <label class="modal-form-field--full">Notes<input name="notes" type="text" placeholder="Main service equipment"></label>
          `;
          body.appendChild(form);
          controller.registerForm(form);
          return form.querySelector('input[name="tag"]');
        },
        onSubmit(controller) {
          const form = controller.body.querySelector('form');
          const data = Object.fromEntries(new FormData(form).entries());
          if (!String(data.tag || '').trim()) {
            form.querySelector('[name="tag"]').focus();
            return false;
          }
          return data;
        }
      });
      if (!result) return;
      table.addRow(result);
      table.save();
      if (table.onChange) table.onChange();
    };

    const getSelectedIndexes = () => Array.from(table.tbody.rows)
      .map((row, index) => ({ row, index }))
      .filter(entry => entry.row.querySelector('.row-select')?.checked)
      .map(entry => entry.index);

    const openBulkModal = async (field, title, label) => {
      const indexes = getSelectedIndexes();
      if (!indexes.length) {
        await showAlertModal('No Rows Selected', 'Select one or more equipment rows before applying a bulk update.');
        return;
      }
      const result = await openModal({
        title,
        description: `${indexes.length} selected equipment row${indexes.length === 1 ? '' : 's'} will be updated.`,
        primaryText: 'Apply',
        secondaryText: 'Cancel',
        render(body, controller) {
          const form = document.createElement('form');
          form.className = 'modal-form equipment-bulk-form';
          form.innerHTML = `<label>${escapeHtml(label)}<input name="value" type="text" required></label>`;
          body.appendChild(form);
          controller.registerForm(form);
          return form.querySelector('input');
        },
        onSubmit(controller) {
          const input = controller.body.querySelector('[name="value"]');
          return String(input.value || '').trim();
        }
      });
      if (result === null) return;
      commitEquipmentRows(applyBulkEquipmentUpdate(table.getData(), indexes, field, result));
    };

    const loadStarterEquipment = () => {
      const current = table.getData().filter(row => Object.values(row).some(value => String(value || '').trim()));
      const next = current.length ? mergeEquipmentRows(current, starterEquipment) : starterEquipment;
      commitEquipmentRows(next);
    };

    const parseCsvLine = line => {
      const cells = [];
      let current = '';
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"' && quoted && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = !quoted;
        } else if (ch === ',' && !quoted) {
          cells.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      cells.push(current.trim());
      return cells;
    };

    const parseCsvText = text => {
      const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
      if (!lines.length) return { headers: [], rows: [] };
      const headers = parseCsvLine(lines[0]).map(header => header.trim());
      const rows = lines.slice(1).map(parseCsvLine);
      return { headers, rows };
    };

    const parseXlsxFile = file => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'binary' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          const headers = (rows.shift() || []).map(header => String(header || '').trim());
          resolve({ headers, rows });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsBinaryString(file);
    });

    const parseXmlText = text => {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      const items = Array.from(doc.getElementsByTagName('equipment'))
        .concat(Array.from(doc.getElementsByTagName('item')));
      const headers = new Set();
      const rows = items.map(el => {
        const row = {};
        Array.from(el.children).forEach(child => {
          headers.add(child.tagName);
          row[child.tagName] = child.textContent || '';
        });
        return row;
      });
      return { headers: Array.from(headers), rows };
    };

    const openImportMappingModal = async headers => {
      const fields = ['id', 'ref', 'tag', 'description', 'voltage', 'category', 'subCategory', 'arrangement', 'width', 'depth', 'height', 'baseElevation', 'lineup', 'manufacturer', 'model', 'phases', 'notes', 'x', 'y', 'z'];
      const inferred = inferEquipmentMapping(headers);
      headers.forEach(header => {
        if (!inferred[header] && fieldMap[header]) inferred[header] = fieldMap[header];
      });
      return openModal({
        title: 'Map Equipment Import',
        description: 'Review how incoming columns should map before replacing or merging equipment records.',
        primaryText: 'Preview Import',
        secondaryText: 'Cancel',
        defaultWidth: 'wide',
        render(body, controller) {
          const form = document.createElement('form');
          form.className = 'modal-form import-mapping-form';
          form.innerHTML = `
            <div class="import-mapping-grid">
              ${headers.map((header, index) => `
                <label>
                  <span>${escapeHtml(header)}</span>
                  <select name="import-field-${index}" data-header-index="${index}">
                    <option value="">Do not import</option>
                    ${fields.map(field => `<option value="${field}"${inferred[header] === field ? ' selected' : ''}>${field}</option>`).join('')}
                  </select>
                </label>
              `).join('')}
            </div>
          `;
          body.appendChild(form);
          controller.registerForm(form);
          return form.querySelector('select');
        },
        onSubmit(controller) {
          const form = controller.body.querySelector('form');
          const mapping = {};
          headers.forEach((header, index) => {
            const value = form.elements[`import-field-${index}`]?.value || '';
            if (value) mapping[header] = value;
          });
          if (!Object.keys(mapping).length) return false;
          return mapping;
        }
      });
    };

    const openEquipmentImportPreview = async incomingRows => {
      const preview = previewEquipmentImport(table.getData(), incomingRows);
      return openModal({
        title: 'Preview Equipment Import',
        description: 'Choose whether this import replaces the current Equipment List or merges by ref, id, or tag.',
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
            <p><strong>${preview.incoming}</strong> incoming records found.</p>
            <ul>
              <li>Replace would write ${preview.replaceCount} records.</li>
              <li>Merge would create ${preview.mergeCreates}, update ${preview.mergeUpdates}, and leave ${preview.mergeUnchanged} unchanged.</li>
              <li>Merge does not delete existing equipment rows that are absent from the import.</li>
            </ul>
          `;
          body.appendChild(summary);
          body.appendChild(mergeBtn);
        },
        onSubmit() {
          return { mode: 'replace' };
        }
      });
    };

    const handleImportRows = async ({ headers, rows }) => {
      if (!headers.length || !rows.length) {
        await showAlertModal('No Import Rows', 'The selected file did not contain equipment rows to import.');
        return;
      }
      const mapping = await openImportMappingModal(headers);
      if (!mapping) return;
      const incomingRows = mapRowsToEquipment(rows, headers, mapping);
      if (!incomingRows.length) {
        await showAlertModal('No Equipment Records', 'The selected mapping did not produce any equipment records.');
        return;
      }
      const decision = await openEquipmentImportPreview(incomingRows);
      if (!decision) return;
      commitEquipmentRows(decision.mode === 'merge'
        ? mergeEquipmentRows(table.getData(), incomingRows)
        : incomingRows);
    };

    if (addEquipmentBtn) addEquipmentBtn.addEventListener('click', openEquipmentModal);
    if (emptyAddBtn) emptyAddBtn.addEventListener('click', openEquipmentModal);
    if (starterBtn) starterBtn.addEventListener('click', loadStarterEquipment);
    if (emptyStarterBtn) emptyStarterBtn.addEventListener('click', loadStarterEquipment);
    if (emptyImportBtn && importXlsxInput) emptyImportBtn.addEventListener('click', () => importXlsxInput.click());
    if (importXlsxBtn && importXlsxInput) {
      importXlsxBtn.addEventListener('click', () => importXlsxInput.click());
      importXlsxInput.addEventListener('change', async e => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
          await handleImportRows(await parseXlsxFile(file));
        } catch (err) {
          console.error('[equipmentlist] XLSX import failed:', err);
          await showAlertModal('Import Failed', 'The selected XLSX file could not be imported.');
        }
      });
    }

    if (searchInput) {
      table.globalFilterCols = ['tag', 'description', 'arrangement', 'lineup', 'manufacturer', 'category', 'model'];
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
      bulkCategoryBtn.addEventListener('click', () => openBulkModal('category', 'Set Equipment Category', 'Category'));
    }

    if (bulkArrangementBtn) {
      bulkArrangementBtn.addEventListener('click', () => openBulkModal('arrangement', 'Assign Equipment Arrangement', 'Arrangement'));
    }

    if (bulkLineupBtn) {
      bulkLineupBtn.addEventListener('click', () => openBulkModal('lineup', 'Assign Equipment Lineup', 'Lineup'));
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
      'Arrangement': 'arrangement',
      'Equipment Arrangement': 'arrangement',
      'Layout': 'arrangement',
      'Width': 'width',
      'Width (ft)': 'width',
      'Depth': 'depth',
      'Depth (ft)': 'depth',
      'Height': 'height',
      'Height (ft)': 'height',
      'Base Elev.': 'baseElevation',
      'Base Elevation': 'baseElevation',
      'Base Elev. (ft)': 'baseElevation',
      'Base Elevation (ft)': 'baseElevation',
      'Lineup': 'lineup',
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
      csvInput.addEventListener('change', async e => {
        await importCsv(e.target.files[0]);
        e.target.value = '';
      });
    }

    const xmlBtn = document.getElementById('import-xml-btn');
    const xmlInput = document.getElementById('import-xml-input');
    if (xmlBtn && xmlInput) {
      xmlBtn.addEventListener('click', () => xmlInput.click());
      xmlInput.addEventListener('change', async e => {
        await importXml(e.target.files[0]);
        e.target.value = '';
      });
    }

    function importCsv(file) {
      if (!file) return Promise.resolve();
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = async e => {
          try {
            await handleImportRows(parseCsvText(e.target.result));
          } catch (err) {
            console.error('[equipmentlist] CSV import failed:', err);
            await showAlertModal('Import Failed', 'The selected CSV file could not be imported.');
          }
          resolve();
        };
        reader.onerror = async () => {
          await showAlertModal('Import Failed', 'The selected CSV file could not be read.');
          resolve();
        };
        reader.readAsText(file);
      });
    }

    function importXml(file) {
      if (!file) return Promise.resolve();
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = async e => {
          try {
            await handleImportRows(parseXmlText(e.target.result));
          } catch (err) {
            console.error('[equipmentlist] XML import failed:', err);
            await showAlertModal('Import Failed', 'The selected XML file could not be imported.');
          }
          resolve();
        };
        reader.onerror = async () => {
          await showAlertModal('Import Failed', 'The selected XML file could not be read.');
          resolve();
        };
        reader.readAsText(file);
      });
    }
  });
}


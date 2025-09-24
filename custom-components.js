import { getItem as getStoredItem, setItem as setStoredItem } from './dataStore.mjs';

const STORAGE_KEY = 'customComponents';
const STORAGE_SCENARIO = '__ctr_custom_components__';
const MAX_PROPERTIES = 20;

const form = document.getElementById('component-form');
const formIndexInput = document.getElementById('component-index');
const labelInput = document.getElementById('component-label');
const subtypeInput = document.getElementById('component-subtype');
const typeInput = document.getElementById('component-type');
const categorySelect = document.getElementById('component-category');
const widthInput = document.getElementById('component-width');
const heightInput = document.getElementById('component-height');
const portTopInput = document.getElementById('port-top');
const portRightInput = document.getElementById('port-right');
const portBottomInput = document.getElementById('port-bottom');
const portLeftInput = document.getElementById('port-left');
const propertyList = document.getElementById('property-list');
const addPropertyBtn = document.getElementById('add-property-btn');
const iconInput = document.getElementById('component-icon');
const clearIconBtn = document.getElementById('clear-icon-btn');
const iconPreview = document.getElementById('icon-preview');
const resetFormBtn = document.getElementById('reset-form-btn');
const exportBtn = document.getElementById('export-components-btn');
const importBtn = document.getElementById('import-components-btn');
const importInput = document.getElementById('import-components-input');
const tableBody = document.querySelector('#custom-components-table tbody');
const emptyMessage = document.getElementById('no-components-message');
const submitBtn = form?.querySelector('button[type="submit"]');

const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');

let components = loadComponents();
let editingIndex = null;
let currentIconData = null;
let toastTimer = null;

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    navLinks.classList.toggle('open', !expanded);
  });
}

function showToast(message, kind = 'info') {
  const toast = document.getElementById('custom-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('toast-error', 'toast-success');
  if (kind === 'error') {
    toast.classList.add('toast-error');
  } else if (kind === 'success') {
    toast.classList.add('toast-success');
  }
  toast.classList.add('show');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('show', 'toast-error', 'toast-success');
    toastTimer = null;
  }, 3000);
}

function loadComponents() {
  const data = getStoredItem(STORAGE_KEY, [], STORAGE_SCENARIO);
  if (!Array.isArray(data)) return [];
  return data;
}

function persist() {
  try {
    setStoredItem(STORAGE_KEY, components, STORAGE_SCENARIO);
    components = loadComponents();
  } catch (err) {
    console.error('Failed to store custom components', err);
    showToast('Unable to save components. Storage may be full.', 'error');
    return false;
  }
  return true;
}

function buildPorts(counts, width, height) {
  const ports = [];
  const addPorts = (count, side) => {
    const total = Math.max(0, Math.floor(Number(count) || 0));
    if (!total) return;
    for (let idx = 1; idx <= total; idx += 1) {
      if (side === 'top') {
        const spacing = width / (total + 1);
        ports.push({ x: spacing * idx, y: 0 });
      } else if (side === 'right') {
        const spacing = height / (total + 1);
        ports.push({ x: width, y: spacing * idx });
      } else if (side === 'bottom') {
        const spacing = width / (total + 1);
        ports.push({ x: spacing * idx, y: height });
      } else if (side === 'left') {
        const spacing = height / (total + 1);
        ports.push({ x: 0, y: spacing * idx });
      }
    }
  };
  addPorts(counts.top, 'top');
  addPorts(counts.right, 'right');
  addPorts(counts.bottom, 'bottom');
  addPorts(counts.left, 'left');
  return ports;
}

function sanitizeNumber(input, fallback) {
  const value = Number(input);
  return Number.isFinite(value) ? value : fallback;
}

function clearPropertyRows() {
  propertyList.innerHTML = '';
}

function addPropertyRow(data = {}) {
  if (propertyList.children.length >= MAX_PROPERTIES) {
    showToast(`Limit ${MAX_PROPERTIES} properties per component.`, 'error');
    return;
  }
  const row = document.createElement('div');
  row.className = 'property-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'prop-name';
  nameInput.placeholder = 'Property key';
  nameInput.value = data.name || '';
  nameInput.maxLength = 80;

  const typeSelect = document.createElement('select');
  typeSelect.className = 'prop-type';
  ['text', 'number', 'checkbox'].forEach(optionValue => {
    const opt = document.createElement('option');
    opt.value = optionValue;
    opt.textContent = optionValue === 'checkbox' ? 'Yes/No' : optionValue.charAt(0).toUpperCase() + optionValue.slice(1);
    if ((data.type || 'text') === optionValue) opt.selected = true;
    typeSelect.appendChild(opt);
  });

  const valueContainer = document.createElement('div');
  valueContainer.className = 'prop-value-container';

  const buildValueInput = (type, value) => {
    let input;
    if (type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'prop-value';
      input.checked = Boolean(value);
    } else {
      input = document.createElement('input');
      input.type = type === 'number' ? 'number' : 'text';
      input.className = 'prop-value';
      if (value !== undefined && value !== null && value !== '') {
        input.value = type === 'number' ? Number(value) : value;
      }
    }
    return input;
  };

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn property-remove-btn';
  removeBtn.setAttribute('aria-label', 'Remove property');
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => {
    row.remove();
  });

  const renderValueInput = () => {
    const currentType = typeSelect.value;
    const existing = valueContainer.querySelector('.prop-value');
    const currentValue = currentType === 'checkbox'
      ? existing?.checked
      : existing?.value ?? data.value;
    valueContainer.innerHTML = '';
    const input = buildValueInput(currentType, currentValue);
    valueContainer.appendChild(input);
  };

  typeSelect.addEventListener('change', renderValueInput);

  row.appendChild(nameInput);
  row.appendChild(typeSelect);
  renderValueInput();
  row.appendChild(valueContainer);
  row.appendChild(removeBtn);
  propertyList.appendChild(row);
}

function collectProperties() {
  const entries = [];
  const rows = propertyList.querySelectorAll('.property-row');
  rows.forEach(row => {
    const name = row.querySelector('.prop-name')?.value.trim();
    if (!name) return;
    const type = row.querySelector('.prop-type')?.value || 'text';
    const valueEl = row.querySelector('.prop-value');
    let value;
    if (type === 'checkbox') {
      value = valueEl?.checked || false;
    } else if (type === 'number') {
      const raw = valueEl?.value ?? '';
      if (raw === '') {
        value = '';
      } else {
        const num = Number(raw);
        if (!Number.isFinite(num)) {
          throw new Error(`Property "${name}" must be a number.`);
        }
        value = num;
      }
    } else {
      value = valueEl?.value ?? '';
    }
    entries.push({ name, type, value });
  });
  return entries;
}

function propertiesToObject(properties) {
  const obj = {};
  properties.forEach(({ name, type, value }) => {
    if (type === 'checkbox') {
      obj[name] = Boolean(value);
    } else if (type === 'number') {
      obj[name] = value === '' ? '' : Number(value);
    } else {
      obj[name] = value ?? '';
    }
  });
  return obj;
}

function resetIcon() {
  currentIconData = null;
  if (iconPreview) {
    iconPreview.innerHTML = '<span class="icon-placeholder">No icon selected</span>';
  }
  if (iconInput) {
    iconInput.value = '';
  }
}

function resetForm() {
  form.reset();
  formIndexInput.value = '';
  editingIndex = null;
  if (submitBtn) submitBtn.textContent = 'Save Component';
  clearPropertyRows();
  addPropertyRow();
  resetIcon();
}

function updateIconPreview(src) {
  if (!iconPreview) return;
  iconPreview.innerHTML = '';
  if (!src) {
    iconPreview.innerHTML = '<span class="icon-placeholder">No icon selected</span>';
    return;
  }
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  iconPreview.appendChild(img);
}

function updateTable() {
  tableBody.innerHTML = '';
  if (!components.length) {
    emptyMessage?.classList.remove('hidden');
    return;
  }
  emptyMessage?.classList.add('hidden');
  components.forEach((comp, idx) => {
    const row = document.createElement('tr');

    const labelCell = document.createElement('td');
    labelCell.textContent = comp.label || comp.subtype;

    const subtypeCell = document.createElement('td');
    subtypeCell.textContent = comp.subtype;

    const categoryCell = document.createElement('td');
    categoryCell.textContent = comp.category;

    const typeCell = document.createElement('td');
    typeCell.textContent = comp.type;

    const portsCell = document.createElement('td');
    const counts = comp.portCounts || { top: 0, right: 0, bottom: 0, left: 0 };
    portsCell.textContent = `T${counts.top || 0} · R${counts.right || 0} · B${counts.bottom || 0} · L${counts.left || 0}`;

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => loadComponentForEdit(idx));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn secondary-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteComponent(idx));

    actionsCell.appendChild(editBtn);
    actionsCell.appendChild(deleteBtn);

    row.appendChild(labelCell);
    row.appendChild(subtypeCell);
    row.appendChild(categoryCell);
    row.appendChild(typeCell);
    row.appendChild(portsCell);
    row.appendChild(actionsCell);

    tableBody.appendChild(row);
  });
}

function loadComponentForEdit(index) {
  const comp = components[index];
  if (!comp) return;
  editingIndex = index;
  formIndexInput.value = String(index);
  labelInput.value = comp.label || '';
  subtypeInput.value = comp.subtype || '';
  typeInput.value = comp.type || '';
  categorySelect.value = comp.category || 'equipment';
  widthInput.value = comp.width || 80;
  heightInput.value = comp.height || 40;
  const counts = comp.portCounts || inferPortCounts(comp.ports || [], comp.width, comp.height);
  portTopInput.value = counts.top || 0;
  portRightInput.value = counts.right || 0;
  portBottomInput.value = counts.bottom || 0;
  portLeftInput.value = counts.left || 0;
  clearPropertyRows();
  (comp.properties || []).forEach(entry => addPropertyRow(entry));
  if (!comp.properties || comp.properties.length === 0) addPropertyRow();
  currentIconData = comp.icon || null;
  updateIconPreview(currentIconData);
  if (submitBtn) submitBtn.textContent = 'Update Component';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function inferPortCounts(ports = [], width = 80, height = 40) {
  const counts = { top: 0, right: 0, bottom: 0, left: 0 };
  const w = Number(width) || 80;
  const h = Number(height) || 40;
  const epsilon = 0.5;
  ports.forEach(port => {
    if (!port || typeof port.x !== 'number' || typeof port.y !== 'number') return;
    if (Math.abs(port.y) <= epsilon) counts.top += 1;
    else if (Math.abs(port.x - w) <= epsilon) counts.right += 1;
    else if (Math.abs(port.y - h) <= epsilon) counts.bottom += 1;
    else if (Math.abs(port.x) <= epsilon) counts.left += 1;
  });
  return counts;
}

function deleteComponent(index) {
  const comp = components[index];
  if (!comp) return;
  const ok = window.confirm(`Delete ${comp.label || comp.subtype}?`);
  if (!ok) return;
  components.splice(index, 1);
  if (!persist()) return;
  showToast('Component deleted.', 'success');
  if (editingIndex === index) {
    resetForm();
  }
  updateTable();
}

function handleFormSubmit(event) {
  event.preventDefault();
  try {
    const label = labelInput.value.trim();
    const subtype = subtypeInput.value.trim();
    const type = typeInput.value.trim();
    const category = categorySelect.value.trim() || 'equipment';
    const width = sanitizeNumber(widthInput.value, 80);
    const height = sanitizeNumber(heightInput.value, 40);
    const counts = {
      top: Math.max(0, Math.floor(sanitizeNumber(portTopInput.value, 0))),
      right: Math.max(0, Math.floor(sanitizeNumber(portRightInput.value, 0))),
      bottom: Math.max(0, Math.floor(sanitizeNumber(portBottomInput.value, 0))),
      left: Math.max(0, Math.floor(sanitizeNumber(portLeftInput.value, 0)))
    };
    const totalPorts = counts.top + counts.right + counts.bottom + counts.left;
    if (!label || !subtype || !type) {
      showToast('Label, subtype, and type are required.', 'error');
      return;
    }
    if (totalPorts === 0) {
      showToast('Add at least one connection port.', 'error');
      return;
    }
    const properties = collectProperties();
    const props = propertiesToObject(properties);
    const ports = buildPorts(counts, width, height);
    const data = {
      label,
      subtype,
      type,
      category,
      width,
      height,
      ports,
      portCounts: counts,
      props,
      properties,
      icon: currentIconData || null
    };
    const duplicateIndex = components.findIndex((c, idx) => c.subtype === subtype && idx !== editingIndex);
    if (duplicateIndex !== -1) {
      showToast('Subtype must be unique.', 'error');
      return;
    }
    if (editingIndex !== null && editingIndex >= 0) {
      components[editingIndex] = data;
    } else {
      components.push(data);
    }
    if (!persist()) return;
    showToast('Component saved.', 'success');
    resetForm();
    updateTable();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Unable to save component.', 'error');
  }
}

function handleIconChange(event) {
  const file = event.target.files?.[0];
  if (!file) {
    resetIcon();
    return;
  }
  if (!/image\/(svg\+xml|png)/.test(file.type)) {
    showToast('Icon must be an SVG or PNG file.', 'error');
    iconInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    currentIconData = reader.result;
    updateIconPreview(currentIconData);
  };
  reader.onerror = () => {
    showToast('Failed to read icon file.', 'error');
    resetIcon();
  };
  reader.readAsDataURL(file);
}

function handleExport() {
  if (!components.length) {
    showToast('No custom components to export.', 'error');
    return;
  }
  const blob = new Blob([JSON.stringify(components, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'customComponents.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Export started.', 'success');
}

function normalizeImportedComponent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const subtype = String(raw.subtype || '').trim();
  const type = String(raw.type || raw.category || '').trim() || 'equipment';
  if (!subtype) return null;
  const label = String(raw.label || subtype);
  const category = String(raw.category || '').trim() || type;
  const width = sanitizeNumber(raw.width, 80);
  const height = sanitizeNumber(raw.height, 40);
  const counts = raw.portCounts || inferPortCounts(raw.ports || [], width, height);
  const props = raw.props && typeof raw.props === 'object' ? raw.props : {};
  const properties = Array.isArray(raw.properties)
    ? raw.properties
        .map(p => ({
          name: String(p.name || '').trim(),
          type: p.type === 'number' || p.type === 'checkbox' ? p.type : 'text',
          value: p.value
        }))
        .filter(p => p.name)
    : Object.keys(props).map(key => ({
        name: key,
        type: typeof props[key] === 'number' ? 'number' : typeof props[key] === 'boolean' ? 'checkbox' : 'text',
        value: props[key]
      }));
  const normalizedProperties = properties.map(entry => {
    if (entry.type === 'number') {
      const num = Number(entry.value);
      return { name: entry.name, type: 'number', value: Number.isFinite(num) ? num : '' };
    }
    if (entry.type === 'checkbox') {
      return { name: entry.name, type: 'checkbox', value: Boolean(entry.value) };
    }
    return { name: entry.name, type: 'text', value: entry.value == null ? '' : String(entry.value) };
  });
  const ports = buildPorts(counts, width, height);
  return {
    label,
    subtype,
    type,
    category,
    width,
    height,
    ports,
    portCounts: counts,
    props: propertiesToObject(normalizedProperties),
    properties: normalizedProperties,
    icon: raw.icon || null
  };
}

function handleImportChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const list = Array.isArray(data) ? data : [];
      if (!list.length) {
        showToast('No components found in file.', 'error');
        return;
      }
      let added = 0;
      list.forEach(raw => {
        const normalized = normalizeImportedComponent(raw);
        if (!normalized) return;
        const idx = components.findIndex(c => c.subtype === normalized.subtype);
        if (idx >= 0) components[idx] = normalized;
        else components.push(normalized);
        added += 1;
      });
      if (!added) {
        showToast('No valid components imported.', 'error');
        return;
      }
      if (!persist()) return;
      showToast(`Imported ${added} component${added === 1 ? '' : 's'}.`, 'success');
      updateTable();
    } catch (err) {
      console.error('Import failed', err);
      showToast('Invalid JSON file.', 'error');
    } finally {
      importInput.value = '';
    }
  };
  reader.onerror = () => {
    showToast('Failed to read import file.', 'error');
    importInput.value = '';
  };
  reader.readAsText(file);
}

function setupListeners() {
  form.addEventListener('submit', handleFormSubmit);
  addPropertyBtn.addEventListener('click', () => addPropertyRow());
  resetFormBtn.addEventListener('click', resetForm);
  iconInput.addEventListener('change', handleIconChange);
  clearIconBtn.addEventListener('click', resetIcon);
  exportBtn.addEventListener('click', handleExport);
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', handleImportChange);
  const storageSuffix = `:${STORAGE_KEY}`;
  window.addEventListener('storage', e => {
    if (!e.key) return;
    if (e.key === STORAGE_KEY || e.key.endsWith(storageSuffix)) {
      components = loadComponents();
      updateTable();
    }
  });
}

resetForm();
updateTable();
setupListeners();


import {
  getTrayHardwareCatalogCustomProducts,
  setTrayHardwareCatalogCustomProducts
} from '../dataStore.mjs';
import {
  filterCatalogProducts,
  getCatalogOptionsFromProducts,
  mergeCatalogProducts,
  normalizeCatalogProduct,
  validateCatalogProduct
} from '../analysis/manufacturerCatalog.mjs';

/**
 * Manufacturer Catalog Browser
 *
 * Loads data/manufacturer_catalog.json and provides:
 *   - filterProducts(filters)  — query products by category, manufacturer, width, etc.
 *   - renderCatalogTable(container, products) — render a filterable product table
 *   - getCatalogProduct(id)    — look up a single product by SKU
 *
 * Intended for use by the Tray Hardware BOM wizard and the Submittal Package
 * generator to select real manufacturer part numbers and list prices.
 */

const CATALOG_URL = 'data/manufacturer_catalog.json';

let catalogCache = null;

function normalizeCustomProduct(product) {
  return normalizeCatalogProduct(product, { source: 'Project custom catalog' });
}

function getCustomProducts() {
  const stored = getTrayHardwareCatalogCustomProducts();
  if (!Array.isArray(stored)) return [];
  return stored.map(normalizeCustomProduct).filter(Boolean);
}

function setCustomProducts(products) {
  const normalized = Array.isArray(products)
    ? products.map(normalizeCustomProduct).filter(Boolean)
    : [];
  setTrayHardwareCatalogCustomProducts(normalized);
}

async function loadBaseCatalog() {
  if (catalogCache) return catalogCache;
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`Failed to load catalog: HTTP ${res.status}`);
  const data = await res.json();
  catalogCache = Array.isArray(data.products)
    ? data.products.map(product => normalizeCatalogProduct(product, { source: data._description || 'Manufacturer catalog' })).filter(Boolean)
    : [];
  return catalogCache;
}

/**
 * Load (or return cached) catalog data.
 * @returns {Promise<object[]>} array of product objects
 */
export async function loadCatalog() {
  const baseProducts = await loadBaseCatalog();
  return mergeCatalogProducts(baseProducts, getCustomProducts());
}

/**
 * Filter products by one or more criteria.
 *
 * @param {object} filters
 * @param {string}   [filters.category]     - 'tray' | 'fitting' | 'conduit' | 'accessory'
 * @param {string}   [filters.subcategory]  - e.g. 'straight' | 'elbow' | 'tee'
 * @param {string}   [filters.manufacturer] - partial match (case-insensitive)
 * @param {number}   [filters.widthIn]      - exact tray width in inches
 * @param {number}   [filters.depthIn]      - exact tray depth in inches
 * @param {string}   [filters.material]     - 'steel' | 'aluminum' | 'fiberglass' etc.
 * @param {string}   [filters.search]       - free-text search across description, id, series
 * @returns {Promise<object[]>}
 */
export async function filterProducts(filters = {}) {
  const all = await loadCatalog();
  return filterCatalogProducts(all, filters);
}

/**
 * Look up a single product by SKU/id.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getCatalogProduct(id) {
  const all = await loadCatalog();
  return all.find(p => p.id === id) ?? null;
}

/**
 * Get distinct values for a field (useful for building filter dropdowns).
 * @param {string} field - e.g. 'manufacturer', 'category', 'material'
 * @returns {Promise<string[]>}
 */
export async function getCatalogOptions(field) {
  const all = await loadCatalog();
  return getCatalogOptionsFromProducts(all, field);
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/**
 * Render a catalog product table into a container element.
 *
 * Supports:
 *   - Column headers: Part Number, Manufacturer, Description, Width, Depth, Material, List Price
 *   - onSelect(product) callback when a row is clicked or Enter is pressed
 *
 * @param {HTMLElement} container
 * @param {object[]}    products
 * @param {object}      [opts]
 * @param {function}    [opts.onSelect] - callback(product) when user selects a row
 */
export function renderCatalogTable(container, products, { onSelect } = {}) {
  if (!container) return;
  container.innerHTML = '';

  if (!products || products.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'No products match the current filters.';
    p.className = 'catalog-empty';
    container.appendChild(p);
    return;
  }

  const table = document.createElement('table');
  table.className = 'catalog-table';
  table.setAttribute('aria-label', 'Manufacturer catalog products');

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const columns = [
    { key: 'id', label: 'Part Number' },
    { key: 'manufacturer', label: 'Manufacturer' },
    { key: 'catalogNumber', label: 'Catalog No.' },
    { key: 'description', label: 'Description' },
    { key: 'dimensions.widthIn', label: 'Width (in)' },
    { key: 'dimensions.depthIn', label: 'Depth (in)' },
    { key: 'material', label: 'Material' },
    { key: 'unit', label: 'Unit' },
    { key: 'commercial.listPriceUsd', label: 'List Price' },
    { key: 'approval.status', label: 'Approval' },
  ];
  for (const col of columns) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = col.label;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const product of products) {
    const tr = document.createElement('tr');
    tr.tabIndex = 0;
    tr.setAttribute('role', 'button');
    tr.setAttribute('aria-label', `Select ${product.description}`);
    tr.dataset.productId = product.id;

    for (const col of columns) {
      const td = document.createElement('td');
      const val = col.key.split('.').reduce((value, key) => value?.[key], product);
      if (col.key === 'commercial.listPriceUsd') {
        td.textContent = val != null ? `$${Number(val).toFixed(2)}` : '—';
      } else {
        td.textContent = val != null ? String(val) : '—';
      }
      tr.appendChild(td);
    }

    if (typeof onSelect === 'function') {
      const select = () => onSelect(product);
      tr.addEventListener('click', select);
      tr.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
      });
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

/**
 * Build and mount a self-contained catalog browser widget.
 *
 * Renders filter controls + product table inside `container`.
 *
 * @param {HTMLElement} container
 * @param {object}      [opts]
 * @param {function}    [opts.onSelect] - callback(product) when user selects a row
 */
export async function mountCatalogBrowser(container, { onSelect } = {}) {
  if (!container) return;
  container.innerHTML = '<p class="catalog-loading">Loading catalog…</p>';

  let allProducts;
  try {
    allProducts = await loadCatalog();
  } catch (err) {
    container.innerHTML = `<p class="catalog-error">Failed to load catalog: ${err.message}</p>`;
    return;
  }

  // Build filter bar
  const filterBar = document.createElement('div');
  filterBar.className = 'catalog-filter-bar';

  function getDistinctOptions(field) {
    return ['', ...[...new Set(allProducts.map(p => p[field]).filter(Boolean))].sort()];
  }

  function makeSelect(labelText, options) {
    const label = document.createElement('label');
    label.className = 'catalog-filter-label';
    label.textContent = labelText + ' ';
    const sel = document.createElement('select');
    sel.className = 'catalog-filter-select';
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt || '(all)';
      sel.appendChild(o);
    }
    label.appendChild(sel);
    return { label, select: sel };
  }

  const catFilter = makeSelect('Category', getDistinctOptions('category'));
  const mfrFilter = makeSelect('Manufacturer', getDistinctOptions('manufacturer'));
  const matFilter = makeSelect('Material', getDistinctOptions('material'));
  const approvalFilter = makeSelect('Approval', ['', 'approved', 'conditional', 'rejected', 'unreviewed']);

  const searchLabel = document.createElement('label');
  searchLabel.className = 'catalog-filter-label';
  searchLabel.textContent = 'Search ';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'catalog-filter-input';
  searchInput.placeholder = 'Part number or keyword…';
  searchLabel.appendChild(searchInput);

  filterBar.appendChild(catFilter.label);
  filterBar.appendChild(mfrFilter.label);
  filterBar.appendChild(matFilter.label);
  filterBar.appendChild(approvalFilter.label);
  filterBar.appendChild(searchLabel);

  const resultsDiv = document.createElement('div');
  resultsDiv.className = 'catalog-results';

  const addSection = document.createElement('section');
  addSection.className = 'catalog-add';
  addSection.innerHTML = '<h3>Add Catalog Item</h3><p class="catalog-add-help">Add custom manufacturer items for this project scenario.</p>';

  const addForm = document.createElement('form');
  addForm.className = 'catalog-add-form';
  addForm.innerHTML = `
    <label class="catalog-filter-label">Part Number <input class="catalog-filter-input" name="id" required></label>
    <label class="catalog-filter-label">Manufacturer <input class="catalog-filter-input" name="manufacturer" required></label>
    <label class="catalog-filter-label">Category
      <select class="catalog-filter-select" name="category">
        <option value="tray">tray</option>
        <option value="fitting">fitting</option>
        <option value="conduit">conduit</option>
        <option value="accessory">accessory</option>
      </select>
    </label>
    <label class="catalog-filter-label">Description <input class="catalog-filter-input" name="description" required></label>
    <label class="catalog-filter-label">Material <input class="catalog-filter-input" name="material" placeholder="steel"></label>
    <label class="catalog-filter-label">Source <input class="catalog-filter-input" name="source" placeholder="approved list, quote, or datasheet"></label>
    <label class="catalog-filter-label">Last Verified <input class="catalog-filter-input" name="lastVerified" type="date"></label>
    <label class="catalog-filter-label">Approved <input name="approved" type="checkbox"></label>
    <label class="catalog-filter-label">Unit
      <select class="catalog-filter-select" name="unit">
        <option value="EA">EA</option>
        <option value="FT">FT</option>
        <option value="LF">LF</option>
      </select>
    </label>
    <label class="catalog-filter-label">List Price (USD) <input class="catalog-filter-input" name="list_price_usd" type="number" min="0" step="0.01" value="0"></label>
    <button type="submit">Add Item</button>
  `;
  const addStatus = document.createElement('p');
  addStatus.className = 'catalog-add-status';
  addSection.appendChild(addForm);
  addSection.appendChild(addStatus);

  container.innerHTML = '';
  container.appendChild(addSection);
  container.appendChild(filterBar);
  container.appendChild(resultsDiv);

  function repopulateSelect(select, options) {
    const previous = select.value;
    select.innerHTML = '';
    for (const opt of options) {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt || '(all)';
      select.appendChild(option);
    }
    select.value = options.includes(previous) ? previous : '';
  }

  async function refresh() {
    let filtered = await filterProducts({
      category: catFilter.select.value || undefined,
      manufacturer: mfrFilter.select.value || undefined,
      material: matFilter.select.value || undefined,
      approvedOnly: approvalFilter.select.value === 'approved',
      search: searchInput.value.trim() || undefined,
    });
    if (approvalFilter.select.value && approvalFilter.select.value !== 'approved') {
      filtered = filtered.filter(product => product.approval?.status === approvalFilter.select.value);
    }
    renderCatalogTable(resultsDiv, filtered, { onSelect });
  }

  catFilter.select.addEventListener('change', refresh);
  mfrFilter.select.addEventListener('change', refresh);
  matFilter.select.addEventListener('change', refresh);
  approvalFilter.select.addEventListener('change', refresh);
  searchInput.addEventListener('input', refresh);
  addForm.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData(addForm);
    const productId = String(formData.get('id') || '').trim();
    if (!productId) return;
    const existing = await getCatalogProduct(productId);
    if (existing) {
      addStatus.textContent = `Part number ${productId} already exists in the catalog.`;
      return;
    }
    const nextProduct = {
      id: productId,
      catalogNumber: productId,
      manufacturer: String(formData.get('manufacturer') || '').trim(),
      series: 'Custom',
      category: String(formData.get('category') || 'accessory').trim(),
      subcategory: 'custom',
      description: String(formData.get('description') || '').trim(),
      width_in: null,
      depth_in: null,
      angle_deg: null,
      material: String(formData.get('material') || '').trim() || 'steel',
      finish: 'none',
      load_class: null,
      unit: String(formData.get('unit') || 'EA').trim() || 'EA',
      list_price_usd: Number(formData.get('list_price_usd')) || 0,
      weight_lb: null,
      nec_listed: false,
      ul_classified: false,
      url: null,
      approved: formData.get('approved') === 'on',
      source: String(formData.get('source') || '').trim(),
      lastVerified: String(formData.get('lastVerified') || '').trim(),
    };
    const validation = validateCatalogProduct(nextProduct, { requireApprovalAuthority: false });
    if (!validation.valid) {
      addStatus.textContent = validation.errors.map(error => error.message).join(' ');
      return;
    }
    const custom = getCustomProducts();
    custom.push(validation.product);
    setCustomProducts(custom);
    allProducts = await loadCatalog();
    repopulateSelect(catFilter.select, getDistinctOptions('category'));
    repopulateSelect(mfrFilter.select, getDistinctOptions('manufacturer'));
    repopulateSelect(matFilter.select, getDistinctOptions('material'));
    addStatus.textContent = `Added ${nextProduct.id} to this project catalog.`;
    addForm.reset();
    await refresh();
  });

  await refresh();
}

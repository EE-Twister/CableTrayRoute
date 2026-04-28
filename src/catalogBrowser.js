import {
  getProductCatalogRows,
  getTrayHardwareCatalogCustomProducts,
  setProductCatalogRows,
  setTrayHardwareCatalogCustomProducts
} from '../dataStore.mjs';
import {
  filterApprovedCatalogRows,
  mergeProductCatalogRows,
  normalizeProductCatalog,
  normalizeProductCatalogRow,
} from '../analysis/productCatalog.mjs';

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

function getCustomProducts() {
  const stored = getTrayHardwareCatalogCustomProducts();
  const governed = getProductCatalogRows();
  return [
    ...(Array.isArray(stored) ? stored : []),
    ...(Array.isArray(governed) ? governed : []),
  ];
}

function setCustomProducts(products) {
  setTrayHardwareCatalogCustomProducts(Array.isArray(products) ? products : []);
  setProductCatalogRows(Array.isArray(products) ? products : []);
}

function mergeCatalogProducts(base, custom) {
  return mergeProductCatalogRows(base, custom).rows;
}

async function loadBaseCatalog() {
  if (catalogCache) return catalogCache;
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`Failed to load catalog: HTTP ${res.status}`);
  const data = await res.json();
  catalogCache = normalizeProductCatalog(data).rows;
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
  const base = (filters.approvedOnly || filters.standard || filters.staleOnly || filters.source)
    ? filterApprovedCatalogRows(all, filters)
    : all;
  return base.filter(p => {
    if (filters.category && p.category !== filters.category) return false;
    if (filters.subcategory && p.subcategory !== filters.subcategory) return false;
    if (filters.manufacturer && !p.manufacturer?.toLowerCase().includes(filters.manufacturer.toLowerCase())) return false;
    if (filters.widthIn != null && p.width_in !== filters.widthIn) return false;
    if (filters.depthIn != null && p.depth_in !== filters.depthIn) return false;
    if (filters.material && p.material !== filters.material) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const searchable = `${p.id} ${p.catalogNumber} ${p.description} ${p.series} ${p.manufacturer}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Look up a single product by SKU/id.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getCatalogProduct(id) {
  const all = await loadCatalog();
  return all.find(p => p.id === id || p.catalogNumber === id) ?? null;
}

/**
 * Get distinct values for a field (useful for building filter dropdowns).
 * @param {string} field - e.g. 'manufacturer', 'category', 'material'
 * @returns {Promise<string[]>}
 */
export async function getCatalogOptions(field) {
  const all = await loadCatalog();
  return [...new Set(all.map(p => p[field]).filter(Boolean))].sort();
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
    { key: 'catalogNumber', label: 'Catalog #' },
    { key: 'manufacturer', label: 'Manufacturer' },
    { key: 'description', label: 'Description' },
    { key: 'width_in', label: 'Width (in)' },
    { key: 'depth_in', label: 'Depth (in)' },
    { key: 'material', label: 'Material' },
    { key: 'approvalStatus', label: 'Approval' },
    { key: 'lastVerified', label: 'Verified' },
    { key: 'unit', label: 'Unit' },
    { key: 'list_price_usd', label: 'List Price' },
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
      const val = product[col.key] ?? product.dimensions?.[col.key.replace('_in', 'In')];
      if (col.key === 'list_price_usd') {
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
  const approvalLabel = document.createElement('label');
  approvalLabel.className = 'catalog-filter-label';
  const approvalInput = document.createElement('input');
  approvalInput.type = 'checkbox';
  approvalLabel.appendChild(approvalInput);
  approvalLabel.appendChild(document.createTextNode(' Approved only'));

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
  filterBar.appendChild(approvalLabel);
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
        <option value="heatTraceComponent">heatTraceComponent</option>
        <option value="protectiveDevice">protectiveDevice</option>
        <option value="cableType">cableType</option>
      </select>
    </label>
    <label class="catalog-filter-label">Description <input class="catalog-filter-input" name="description" required></label>
    <label class="catalog-filter-label">Material <input class="catalog-filter-input" name="material" placeholder="steel"></label>
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
    const filtered = await filterProducts({
      category: catFilter.select.value || undefined,
      manufacturer: mfrFilter.select.value || undefined,
      material: matFilter.select.value || undefined,
      approvedOnly: approvalInput.checked,
      search: searchInput.value.trim() || undefined,
    });
    renderCatalogTable(resultsDiv, filtered, { onSelect });
  }

  catFilter.select.addEventListener('change', refresh);
  mfrFilter.select.addEventListener('change', refresh);
  matFilter.select.addEventListener('change', refresh);
  approvalInput.addEventListener('change', refresh);
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
    const nextProduct = normalizeProductCatalogRow({
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
      source: 'local-custom',
      approvalStatus: 'unreviewed',
    });
    const custom = getCustomProducts();
    custom.push(nextProduct);
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

import {
  getTrayHardwareCatalogCustomProducts,
  setTrayHardwareCatalogCustomProducts
} from '../dataStore.mjs';
import {
  buildCatalogConfidence,
  catalogIdentity,
  filterCatalogProducts,
  getCatalogOptionsFromProducts,
  mergeCatalogProducts,
  normalizeCatalogProduct,
  removeCatalogProduct,
  summarizeCatalogQuality,
  upsertCatalogProduct,
  validateCatalogProduct
} from '../analysis/manufacturerCatalog.mjs';
import {
  buildCatalogExportCsv,
  buildCatalogExportWorkbook,
  buildCatalogTemplateCsv,
  buildCatalogTemplateWorkbook,
  parseCatalogCsv,
  parseCatalogWorkbook,
  importCatalogRows
} from '../analysis/catalogImport.mjs';

/**
 * Manufacturer Catalog Browser
 *
 * Loads data/manufacturer_catalog.json and provides:
 *   - filterProducts(filters)  — query products by category, manufacturer, width, etc.
 *   - renderCatalogTable(container, products) — render a filterable product table
 *   - getCatalogProduct(id)    — look up a single product by SKU
 *
 * The mounted browser also manages the project's custom catalog rows: add,
 * edit, remove, bulk import, and export. Governed evidence (approval, source,
 * verification date, datasheet, BIM, standards, EPD) is surfaced per row as a
 * catalog confidence status so unusable rows are visible before they reach BOM,
 * submittal, cost, and BIM export flows.
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
 * @param {string}   [filters.approvalStatus]   - 'approved' | 'conditional' | 'rejected' | 'unreviewed'
 * @param {string}   [filters.confidenceStatus] - 'complete' | 'review' | 'incomplete'
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

const CONFIDENCE_LABELS = {
  complete: 'Complete',
  review: 'Review',
  incomplete: 'Incomplete'
};

function confidenceLabel(confidence) {
  const label = CONFIDENCE_LABELS[confidence.status] || confidence.status;
  return `${label} ${confidence.score}%`;
}

function confidenceTitle(confidence) {
  const parts = [];
  if (confidence.missingEvidence.length) parts.push(`Missing: ${confidence.missingEvidence.join(', ')}`);
  if (confidence.staleEvidence.length) parts.push(`Stale: ${confidence.staleEvidence.join(', ')}`);
  return parts.join(' — ') || 'All governed catalog evidence present.';
}

/**
 * Render a catalog product table into a container element.
 *
 * Supports:
 *   - Column headers: Part Number, Manufacturer, Description, Width, Depth, Material, List Price
 *   - onSelect(product) callback when a row is clicked or Enter is pressed
 *   - Origin + catalog confidence columns, and edit/remove actions for the
 *     project's own catalog rows
 *
 * @param {HTMLElement} container
 * @param {object[]}    products
 * @param {object}      [opts]
 * @param {function}    [opts.onSelect] - callback(product) when user selects a row
 * @param {Set<string>} [opts.projectIdentities] - identities owned by the project catalog
 * @param {function}    [opts.onEdit]   - callback(product) for project rows
 * @param {function}    [opts.onRemove] - callback(product) for project rows
 * @param {object}      [opts.confidenceOptions] - options passed to buildCatalogConfidence
 */
export function renderCatalogTable(container, products, {
  onSelect,
  projectIdentities,
  onEdit,
  onRemove,
  confidenceOptions
} = {}) {
  if (!container) return;
  container.innerHTML = '';

  if (!products || products.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'No products match the current filters.';
    p.className = 'catalog-empty';
    container.appendChild(p);
    return;
  }

  const owned = projectIdentities instanceof Set ? projectIdentities : new Set();
  const showActions = typeof onEdit === 'function' || typeof onRemove === 'function';

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
    { key: 'confidence', label: 'Catalog Confidence' },
    { key: 'origin', label: 'Origin' },
  ];
  if (showActions) columns.push({ key: 'actions', label: 'Actions' });
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
    const identity = catalogIdentity(product);
    const isProjectRow = owned.has(identity);
    const confidence = buildCatalogConfidence(product, confidenceOptions || {});
    const tr = document.createElement('tr');
    tr.tabIndex = 0;
    tr.setAttribute('role', 'button');
    tr.setAttribute('aria-label', `Select ${product.description}`);
    tr.dataset.productId = product.id;
    tr.dataset.catalogIdentity = identity;
    tr.dataset.catalogOrigin = isProjectRow ? 'project' : 'base';

    for (const col of columns) {
      const td = document.createElement('td');
      if (col.key === 'confidence') {
        const badge = document.createElement('span');
        badge.className = `catalog-confidence catalog-confidence-${confidence.status}`;
        badge.textContent = confidenceLabel(confidence);
        badge.title = confidenceTitle(confidence);
        td.appendChild(badge);
        if (confidence.missingEvidence.length) {
          const detail = document.createElement('span');
          detail.className = 'catalog-confidence-detail';
          detail.textContent = `Missing ${confidence.missingEvidence.length}`;
          td.appendChild(detail);
        }
        tr.appendChild(td);
        continue;
      }
      if (col.key === 'origin') {
        td.textContent = isProjectRow ? 'Project' : 'Base catalog';
        tr.appendChild(td);
        continue;
      }
      if (col.key === 'actions') {
        if (isProjectRow) {
          td.className = 'catalog-row-actions';
          if (typeof onEdit === 'function') {
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'catalog-row-edit';
            editBtn.textContent = 'Edit';
            editBtn.setAttribute('aria-label', `Edit ${product.id}`);
            editBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              onEdit(product);
            });
            td.appendChild(editBtn);
          }
          if (typeof onRemove === 'function') {
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'catalog-row-remove';
            removeBtn.textContent = 'Remove';
            removeBtn.setAttribute('aria-label', `Remove ${product.id}`);
            removeBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              if (removeBtn.dataset.confirm !== 'true') {
                removeBtn.dataset.confirm = 'true';
                removeBtn.textContent = 'Confirm remove';
                return;
              }
              onRemove(product);
            });
            td.appendChild(removeBtn);
          }
        } else {
          td.textContent = '—';
        }
        tr.appendChild(td);
        continue;
      }
      const val = col.key.split('.').reduce((value, key) => value?.[key], product);
      if (col.key === 'commercial.listPriceUsd') {
        td.textContent = val != null ? `$${Number(val).toFixed(2)}` : '—';
      } else {
        td.textContent = val != null && val !== '' ? String(val) : '—';
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
 * Render a governance roll-up for the products currently in view.
 *
 * @param {HTMLElement} container
 * @param {object[]} products
 * @param {object} [options] - forwarded to summarizeCatalogQuality
 */
export function renderCatalogQuality(container, products, options = {}) {
  if (!container) return;
  const summary = summarizeCatalogQuality(products, options);
  container.innerHTML = '';

  const counts = document.createElement('p');
  counts.className = 'catalog-quality-counts';
  counts.textContent = summary.total === 0
    ? 'No catalog rows in view.'
    : `${summary.total} row(s) · ${summary.approved} approved · `
      + `${summary.byConfidence.complete} complete, ${summary.byConfidence.review} review, `
      + `${summary.byConfidence.incomplete} incomplete · average evidence score ${summary.averageScore}%`;
  container.appendChild(counts);

  if (summary.missingEvidence.length) {
    const gaps = document.createElement('p');
    gaps.className = 'catalog-quality-gaps';
    gaps.textContent = `Top evidence gaps: ${summary.missingEvidence
      .slice(0, 3)
      .map(item => `${item.evidence} (${item.count})`)
      .join(', ')}`;
    container.appendChild(gaps);
  }

  if (summary.staleRows) {
    const stale = document.createElement('p');
    stale.className = 'catalog-quality-stale';
    stale.textContent = `${summary.staleRows} row(s) carry stale verification or expired EPD evidence.`;
    container.appendChild(stale);
  }

  return summary;
}

const ADD_FORM_FIELDS = `
  <fieldset class="catalog-form-group">
    <legend>Identity</legend>
    <label class="catalog-filter-label">Part Number <input class="catalog-filter-input" name="id" required></label>
    <label class="catalog-filter-label">Manufacturer <input class="catalog-filter-input" name="manufacturer" required></label>
    <label class="catalog-filter-label">Catalog No. <input class="catalog-filter-input" name="catalogNumber" placeholder="defaults to part number"></label>
    <label class="catalog-filter-label">Category
      <select class="catalog-filter-select" name="category">
        <option value="tray">tray</option>
        <option value="fitting">fitting</option>
        <option value="conduit">conduit</option>
        <option value="accessory">accessory</option>
      </select>
    </label>
    <label class="catalog-filter-label">Subcategory <input class="catalog-filter-input" name="subcategory" placeholder="straight, elbow, cover…"></label>
    <label class="catalog-filter-label">Description <input class="catalog-filter-input" name="description" required></label>
  </fieldset>
  <fieldset class="catalog-form-group">
    <legend>Physical &amp; commercial</legend>
    <label class="catalog-filter-label">Material <input class="catalog-filter-input" name="material" placeholder="steel"></label>
    <label class="catalog-filter-label">Finish <input class="catalog-filter-input" name="finish" placeholder="pre-galvanized"></label>
    <label class="catalog-filter-label">Width (in) <input class="catalog-filter-input" name="width_in" type="number" min="0" step="0.25"></label>
    <label class="catalog-filter-label">Depth (in) <input class="catalog-filter-input" name="depth_in" type="number" min="0" step="0.25"></label>
    <label class="catalog-filter-label">Weight (lb) <input class="catalog-filter-input" name="weight_lb" type="number" min="0" step="0.1"></label>
    <label class="catalog-filter-label">Load Class <input class="catalog-filter-input" name="load_class" placeholder="20A"></label>
    <label class="catalog-filter-label">Unit
      <select class="catalog-filter-select" name="unit">
        <option value="EA">EA</option>
        <option value="FT">FT</option>
        <option value="LF">LF</option>
      </select>
    </label>
    <label class="catalog-filter-label">List Price (USD) <input class="catalog-filter-input" name="list_price_usd" type="number" min="0" step="0.01" value="0"></label>
  </fieldset>
  <fieldset class="catalog-form-group">
    <legend>Governed evidence</legend>
    <label class="catalog-filter-label">Approved <input name="approved" type="checkbox"></label>
    <label class="catalog-filter-label">Approval Authority <input class="catalog-filter-input" name="approvalAuthority" placeholder="Project EE"></label>
    <label class="catalog-filter-label">Source <input class="catalog-filter-input" name="source" placeholder="approved list, quote, or datasheet"></label>
    <label class="catalog-filter-label">Last Verified <input class="catalog-filter-input" name="lastVerified" type="date"></label>
    <label class="catalog-filter-label">Datasheet URL <input class="catalog-filter-input" name="datasheetUrl" type="url" placeholder="https://…"></label>
    <label class="catalog-filter-label">Standards <input class="catalog-filter-input" name="standards" placeholder="NEMA VE 1; UL classified"></label>
    <label class="catalog-filter-label">BIM Family <input class="catalog-filter-input" name="bimFamilyName" placeholder="Cable Tray - Ventilated"></label>
    <label class="catalog-filter-label">EPD Source <input class="catalog-filter-input" name="epdSource" placeholder="Vendor EPD reference"></label>
    <label class="catalog-filter-label">EPD Valid Until <input class="catalog-filter-input" name="epdValidUntil" type="date"></label>
    <label class="catalog-filter-label">CO2e (kg/unit) <input class="catalog-filter-input" name="co2eKgPerUnit" type="number" min="0" step="0.01"></label>
  </fieldset>
  <div class="catalog-add-actions">
    <button type="submit" class="catalog-add-submit">Add Item</button>
    <button type="button" class="catalog-add-cancel" hidden>Cancel Edit</button>
  </div>
`;

function formValue(formData, name) {
  return String(formData.get(name) || '').trim();
}

function formNumber(formData, name) {
  const raw = formValue(formData, name);
  if (raw === '') return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function productFromForm(formData) {
  const productId = formValue(formData, 'id');
  const catalogNumber = formValue(formData, 'catalogNumber') || productId;
  const standards = formValue(formData, 'standards')
    .split(/[;,]/)
    .map(item => item.trim())
    .filter(Boolean);
  return {
    id: productId,
    catalogNumber,
    manufacturer: formValue(formData, 'manufacturer'),
    series: 'Custom',
    category: formValue(formData, 'category') || 'accessory',
    subcategory: formValue(formData, 'subcategory') || 'custom',
    description: formValue(formData, 'description'),
    width_in: formNumber(formData, 'width_in'),
    depth_in: formNumber(formData, 'depth_in'),
    weight_lb: formNumber(formData, 'weight_lb'),
    angle_deg: null,
    material: formValue(formData, 'material') || 'steel',
    finish: formValue(formData, 'finish') || 'none',
    load_class: formValue(formData, 'load_class') || null,
    unit: formValue(formData, 'unit') || 'EA',
    list_price_usd: formNumber(formData, 'list_price_usd') ?? 0,
    standards,
    nec_listed: standards.some(item => /nec/i.test(item)),
    ul_classified: standards.some(item => /\bul\b/i.test(item)),
    datasheetUrl: formValue(formData, 'datasheetUrl'),
    bimRef: {
      familyName: formValue(formData, 'bimFamilyName'),
      typeName: catalogNumber,
      classification: formValue(formData, 'category')
    },
    epd: {
      source: formValue(formData, 'epdSource'),
      validUntil: formValue(formData, 'epdValidUntil'),
      co2eKgPerUnit: formNumber(formData, 'co2eKgPerUnit')
    },
    approved: formData.get('approved') === 'on',
    approval: {
      status: formData.get('approved') === 'on' ? 'approved' : 'unreviewed',
      authority: formValue(formData, 'approvalAuthority')
    },
    source: formValue(formData, 'source'),
    lastVerified: formValue(formData, 'lastVerified')
  };
}

function fillFormFromProduct(form, product) {
  const setValue = (name, value) => {
    const field = form.elements.namedItem(name);
    if (!field) return;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value == null ? '' : String(value);
  };
  setValue('id', product.id);
  setValue('manufacturer', product.manufacturer);
  setValue('catalogNumber', product.catalogNumber);
  setValue('category', product.category || 'accessory');
  setValue('subcategory', product.subcategory);
  setValue('description', product.description);
  setValue('material', product.material);
  setValue('finish', product.finish);
  setValue('width_in', product.dimensions?.widthIn);
  setValue('depth_in', product.dimensions?.depthIn);
  setValue('weight_lb', product.dimensions?.weightLb);
  setValue('load_class', product.ratings?.loadClass);
  setValue('unit', product.unit || 'EA');
  setValue('list_price_usd', product.commercial?.listPriceUsd ?? 0);
  setValue('approved', product.approved);
  setValue('approvalAuthority', product.approval?.authority);
  setValue('source', product.source);
  setValue('lastVerified', product.lastVerified);
  setValue('datasheetUrl', product.datasheetUrl);
  setValue('standards', (product.standards || []).join('; '));
  setValue('bimFamilyName', product.bimRef?.familyName);
  setValue('epdSource', product.epdSource);
  setValue('epdValidUntil', product.epdValidUntil);
  setValue('co2eKgPerUnit', product.co2eKgPerUnit ?? '');
}

/**
 * Build and mount a self-contained catalog browser widget.
 *
 * Renders governance summary, add/edit form, import/export controls, filter
 * controls, and the product table inside `container`.
 *
 * @param {HTMLElement} container
 * @param {object}      [opts]
 * @param {function}    [opts.onSelect] - callback(product) when user selects a row
 */
export async function mountCatalogBrowser(container, { onSelect } = {}) {
  if (!container) return;
  container.innerHTML = '<p class="catalog-loading">Loading catalog…</p>';

  let allProducts;
  let baseIdentities;
  try {
    const baseProducts = await loadBaseCatalog();
    baseIdentities = new Set(baseProducts.map(catalogIdentity));
    allProducts = mergeCatalogProducts(baseProducts, getCustomProducts());
  } catch (err) {
    container.innerHTML = `<p class="catalog-error">Failed to load catalog: ${err.message}</p>`;
    return;
  }

  let projectIdentities = new Set(
    getCustomProducts()
      .map(catalogIdentity)
      .filter(identity => !baseIdentities.has(identity))
  );
  let editingIdentity = '';
  let filteredProducts = [];

  const qualitySection = document.createElement('section');
  qualitySection.className = 'catalog-quality';
  qualitySection.setAttribute('aria-live', 'polite');
  qualitySection.setAttribute('aria-label', 'Catalog governance summary');

  // Build filter bar
  const filterBar = document.createElement('div');
  filterBar.className = 'catalog-filter-bar';

  function getDistinctOptions(field) {
    return ['', ...[...new Set(allProducts.map(p => p[field]).filter(Boolean))].sort()];
  }

  function makeSelect(labelText, options, filterKey) {
    const label = document.createElement('label');
    label.className = 'catalog-filter-label';
    label.textContent = labelText + ' ';
    const sel = document.createElement('select');
    sel.className = 'catalog-filter-select';
    sel.dataset.catalogFilter = filterKey;
    sel.setAttribute('aria-label', `Filter catalog by ${labelText.toLowerCase()}`);
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt || '(all)';
      sel.appendChild(o);
    }
    label.appendChild(sel);
    return { label, select: sel };
  }

  const catFilter = makeSelect('Category', getDistinctOptions('category'), 'category');
  const mfrFilter = makeSelect('Manufacturer', getDistinctOptions('manufacturer'), 'manufacturer');
  const matFilter = makeSelect('Material', getDistinctOptions('material'), 'material');
  const approvalFilter = makeSelect('Approval', ['', 'approved', 'conditional', 'rejected', 'unreviewed'], 'approval');
  const confidenceFilter = makeSelect('Confidence', ['', 'complete', 'review', 'incomplete'], 'confidence');
  const originFilter = makeSelect('Origin', ['', 'base', 'project'], 'origin');

  const searchLabel = document.createElement('label');
  searchLabel.className = 'catalog-filter-label';
  searchLabel.textContent = 'Search ';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'catalog-filter-input';
  searchInput.dataset.catalogFilter = 'search';
  searchInput.placeholder = 'Part number or keyword…';
  searchLabel.appendChild(searchInput);

  filterBar.appendChild(catFilter.label);
  filterBar.appendChild(mfrFilter.label);
  filterBar.appendChild(matFilter.label);
  filterBar.appendChild(approvalFilter.label);
  filterBar.appendChild(confidenceFilter.label);
  filterBar.appendChild(originFilter.label);
  filterBar.appendChild(searchLabel);

  const resultsDiv = document.createElement('div');
  resultsDiv.className = 'catalog-results';

  const addSection = document.createElement('section');
  addSection.className = 'catalog-add';
  addSection.innerHTML = '<h3 class="catalog-add-heading">Add Catalog Item</h3><p class="catalog-add-help">Add custom manufacturer items for this project scenario. Governed evidence fields drive the catalog confidence score used by BOM, submittal, cost, and BIM export flows.</p>';

  const addHeading = addSection.querySelector('.catalog-add-heading');
  const addForm = document.createElement('form');
  addForm.className = 'catalog-add-form';
  addForm.innerHTML = ADD_FORM_FIELDS;
  const addSubmitBtn = addForm.querySelector('.catalog-add-submit');
  const addCancelBtn = addForm.querySelector('.catalog-add-cancel');
  const addStatus = document.createElement('p');
  addStatus.className = 'catalog-add-status';
  addStatus.setAttribute('aria-live', 'polite');
  addSection.appendChild(addForm);
  addSection.appendChild(addStatus);

  const importSection = document.createElement('section');
  importSection.className = 'catalog-import';
  importSection.innerHTML = `
    <h3>Bulk Import / Export (CSV / XLSX)</h3>
    <p class="catalog-add-help">Download a template, fill it in with project-approved catalog items, and import. Imports save to this project's custom catalog. Exports use the same columns, so an exported catalog can be edited and re-imported.</p>
    <div class="catalog-import-actions">
      <button type="button" class="catalog-import-template-csv">Download CSV Template</button>
      <button type="button" class="catalog-import-template-xlsx">Download XLSX Template</button>
      <label class="catalog-filter-label">
        Import file
        <input type="file" class="catalog-import-file" accept=".csv,.xlsx" />
      </label>
    </div>
    <div class="catalog-export-actions">
      <span class="catalog-export-label">Export current view:</span>
      <button type="button" class="catalog-export-csv">CSV</button>
      <button type="button" class="catalog-export-xlsx">XLSX</button>
      <button type="button" class="catalog-export-json">JSON</button>
    </div>
    <div class="catalog-import-preview" aria-live="polite"></div>
    <div class="catalog-import-confirm" hidden>
      <button type="button" class="catalog-import-save">Save to Project Catalog</button>
      <button type="button" class="catalog-import-cancel">Discard</button>
    </div>
    <p class="catalog-import-status" aria-live="polite"></p>
  `;
  const importTemplateCsvBtn = importSection.querySelector('.catalog-import-template-csv');
  const importTemplateXlsxBtn = importSection.querySelector('.catalog-import-template-xlsx');
  const importFileInput = importSection.querySelector('.catalog-import-file');
  const importPreviewDiv = importSection.querySelector('.catalog-import-preview');
  const importConfirmDiv = importSection.querySelector('.catalog-import-confirm');
  const importSaveBtn = importSection.querySelector('.catalog-import-save');
  const importCancelBtn = importSection.querySelector('.catalog-import-cancel');
  const importStatusEl = importSection.querySelector('.catalog-import-status');
  const exportCsvBtn = importSection.querySelector('.catalog-export-csv');
  const exportXlsxBtn = importSection.querySelector('.catalog-export-xlsx');
  const exportJsonBtn = importSection.querySelector('.catalog-export-json');

  container.innerHTML = '';
  container.appendChild(qualitySection);
  container.appendChild(addSection);
  container.appendChild(importSection);
  container.appendChild(filterBar);
  container.appendChild(resultsDiv);

  let pendingImport = null;

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function getXlsx() {
    const xlsx = typeof window !== 'undefined' ? window.XLSX : undefined;
    if (!xlsx) throw new Error('XLSX library is not loaded on this page.');
    return xlsx;
  }

  function clearPreview() {
    importPreviewDiv.innerHTML = '';
    importConfirmDiv.hidden = true;
    pendingImport = null;
  }

  function renderPreview(parseResult) {
    const { products, errors, warnings } = parseResult;
    const {
      accepted,
      duplicates,
      blocked,
      importable
    } = importCatalogRows(products, allProducts, { overridableIdentities: projectIdentities });

    const summary = document.createElement('p');
    summary.className = 'catalog-import-summary';
    summary.textContent = `${accepted.length} new, ${duplicates.length} project update(s), `
      + `${blocked.length} blocked conflict(s), ${errors.length} error(s), ${warnings.length} warning(s).`;
    importPreviewDiv.innerHTML = '';
    importPreviewDiv.appendChild(summary);

    if (errors.length) {
      const list = document.createElement('ul');
      list.className = 'catalog-import-errors';
      errors.slice(0, 50).forEach(err => {
        const li = document.createElement('li');
        li.textContent = `Row ${err.row}${err.column ? ` (${err.column})` : ''}: ${err.message}`;
        list.appendChild(li);
      });
      importPreviewDiv.appendChild(list);
    }
    if (duplicates.length) {
      const dupHeader = document.createElement('p');
      dupHeader.className = 'catalog-import-dups';
      dupHeader.textContent = `Will update ${duplicates.length} existing project product(s) with the same manufacturer/catalog number on save.`;
      importPreviewDiv.appendChild(dupHeader);
    }
    if (blocked.length) {
      const blockedList = document.createElement('ul');
      blockedList.className = 'catalog-import-errors';
      blocked.slice(0, 50).forEach((entry) => {
        const li = document.createElement('li');
        li.textContent = entry.kind === 'protected-base'
          ? `${entry.product.manufacturer} ${entry.product.catalogNumber} is a protected base catalog identity.`
          : `${entry.product.manufacturer} ${entry.product.catalogNumber} appears more than once in the import file.`;
        blockedList.appendChild(li);
      });
      importPreviewDiv.appendChild(blockedList);
    }

    pendingImport = {
      accepted,
      duplicates,
      blocked,
      mergeRows: importable
    };
    importConfirmDiv.hidden = !(accepted.length || duplicates.length);
  }

  async function handleImportFile(file) {
    clearPreview();
    importStatusEl.textContent = `Parsing ${file.name}…`;
    try {
      let parseResult;
      if (/\.csv$/i.test(file.name)) {
        const text = await file.text();
        parseResult = parseCatalogCsv(text);
      } else {
        const xlsx = getXlsx();
        const buf = await file.arrayBuffer();
        parseResult = parseCatalogWorkbook(xlsx, buf);
      }
      renderPreview(parseResult);
      importStatusEl.textContent = `Parsed ${file.name}.`;
    } catch (err) {
      importStatusEl.textContent = `Import failed: ${err.message || String(err)}`;
    }
  }

  importTemplateCsvBtn?.addEventListener('click', () => {
    const csv = buildCatalogTemplateCsv();
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'manufacturer-catalog-template.csv');
  });

  importTemplateXlsxBtn?.addEventListener('click', () => {
    try {
      const xlsx = getXlsx();
      const wb = buildCatalogTemplateWorkbook(xlsx);
      const out = xlsx.write(wb, { type: 'array', bookType: 'xlsx' });
      downloadBlob(
        new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        'manufacturer-catalog-template.xlsx'
      );
    } catch (err) {
      importStatusEl.textContent = err.message || String(err);
    }
  });

  const exportStamp = () => new Date().toISOString().slice(0, 10);

  exportCsvBtn?.addEventListener('click', () => {
    const csv = buildCatalogExportCsv(filteredProducts);
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `manufacturer-catalog-${exportStamp()}.csv`);
    importStatusEl.textContent = `Exported ${filteredProducts.length} row(s) to CSV.`;
  });

  exportXlsxBtn?.addEventListener('click', () => {
    try {
      const xlsx = getXlsx();
      const wb = buildCatalogExportWorkbook(xlsx, filteredProducts);
      const out = xlsx.write(wb, { type: 'array', bookType: 'xlsx' });
      downloadBlob(
        new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `manufacturer-catalog-${exportStamp()}.xlsx`
      );
      importStatusEl.textContent = `Exported ${filteredProducts.length} row(s) to XLSX.`;
    } catch (err) {
      importStatusEl.textContent = err.message || String(err);
    }
  });

  exportJsonBtn?.addEventListener('click', () => {
    const payload = {
      _version: '2.0',
      _description: 'Manufacturer catalog export',
      _exportedAt: new Date().toISOString(),
      products: filteredProducts
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      `manufacturer-catalog-${exportStamp()}.json`
    );
    importStatusEl.textContent = `Exported ${filteredProducts.length} row(s) to JSON.`;
  });

  importFileInput?.addEventListener('change', () => {
    const file = importFileInput.files?.[0];
    if (file) handleImportFile(file);
  });

  importCancelBtn?.addEventListener('click', () => {
    clearPreview();
    if (importFileInput) importFileInput.value = '';
    importStatusEl.textContent = '';
  });

  importSaveBtn?.addEventListener('click', async () => {
    if (!pendingImport) return;
    const incoming = pendingImport.mergeRows;
    const current = getCustomProducts();
    const merged = mergeCatalogProducts(current, incoming, { allowProjectOverrides: true });
    setCustomProducts(merged);
    await reloadProducts();
    importStatusEl.textContent = `Saved ${pendingImport.accepted.length} new and updated ${pendingImport.duplicates.length} existing product(s).`;
    clearPreview();
    if (importFileInput) importFileInput.value = '';
    await refresh();
  });

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

  async function reloadProducts() {
    const baseProducts = await loadBaseCatalog();
    baseIdentities = new Set(baseProducts.map(catalogIdentity));
    allProducts = mergeCatalogProducts(baseProducts, getCustomProducts());
    projectIdentities = new Set(
      getCustomProducts()
        .map(catalogIdentity)
        .filter(identity => !baseIdentities.has(identity))
    );
    repopulateSelect(catFilter.select, getDistinctOptions('category'));
    repopulateSelect(mfrFilter.select, getDistinctOptions('manufacturer'));
    repopulateSelect(matFilter.select, getDistinctOptions('material'));
  }

  function exitEditMode() {
    editingIdentity = '';
    addForm.reset();
    addHeading.textContent = 'Add Catalog Item';
    addSubmitBtn.textContent = 'Add Item';
    addCancelBtn.hidden = true;
  }

  function enterEditMode(product) {
    editingIdentity = catalogIdentity(product);
    fillFormFromProduct(addForm, product);
    addHeading.textContent = `Edit ${product.id}`;
    addSubmitBtn.textContent = 'Save Changes';
    addCancelBtn.hidden = false;
    addStatus.textContent = `Editing project catalog row ${product.id}.`;
    // `behavior: 'instant'` opts out of the site-wide smooth scrolling so the
    // form does not keep moving under the pointer after the Edit click.
    addSection.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  }

  async function removeProjectProduct(product) {
    const remaining = removeCatalogProduct(getCustomProducts(), product);
    setCustomProducts(remaining);
    if (editingIdentity === catalogIdentity(product)) exitEditMode();
    await reloadProducts();
    addStatus.textContent = `Removed ${product.id} from this project catalog.`;
    await refresh();
  }

  async function refresh() {
    let filtered = await filterProducts({
      category: catFilter.select.value || undefined,
      manufacturer: mfrFilter.select.value || undefined,
      material: matFilter.select.value || undefined,
      approvalStatus: approvalFilter.select.value || undefined,
      confidenceStatus: confidenceFilter.select.value || undefined,
      search: searchInput.value.trim() || undefined,
    });
    if (originFilter.select.value === 'project') {
      filtered = filtered.filter(product => projectIdentities.has(catalogIdentity(product)));
    } else if (originFilter.select.value === 'base') {
      filtered = filtered.filter(product => !projectIdentities.has(catalogIdentity(product)));
    }
    filteredProducts = filtered;
    renderCatalogQuality(qualitySection, filtered);
    renderCatalogTable(resultsDiv, filtered, {
      onSelect,
      projectIdentities,
      onEdit: enterEditMode,
      onRemove: removeProjectProduct
    });
  }

  catFilter.select.addEventListener('change', refresh);
  mfrFilter.select.addEventListener('change', refresh);
  matFilter.select.addEventListener('change', refresh);
  approvalFilter.select.addEventListener('change', refresh);
  confidenceFilter.select.addEventListener('change', refresh);
  originFilter.select.addEventListener('change', refresh);
  searchInput.addEventListener('input', refresh);
  addCancelBtn.addEventListener('click', () => {
    exitEditMode();
    addStatus.textContent = 'Edit cancelled.';
  });
  addForm.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData(addForm);
    const nextProduct = productFromForm(formData);
    if (!nextProduct.id) return;

    const validation = validateCatalogProduct(nextProduct, { requireApprovalAuthority: false });
    if (!validation.valid) {
      addStatus.textContent = validation.errors.map(error => error.message).join(' ');
      return;
    }

    const nextIdentity = catalogIdentity(validation.product);
    const collides = allProducts.some(product => catalogIdentity(product) === nextIdentity
      && catalogIdentity(product) !== editingIdentity);
    if (collides) {
      addStatus.textContent = `${nextProduct.manufacturer} ${nextProduct.catalogNumber} already exists in the catalog.`;
      return;
    }

    const current = editingIdentity
      ? removeCatalogProduct(getCustomProducts(), editingIdentity)
      : getCustomProducts();
    setCustomProducts(upsertCatalogProduct(current, validation.product));
    const wasEditing = Boolean(editingIdentity);
    await reloadProducts();
    exitEditMode();
    addStatus.textContent = wasEditing
      ? `Updated ${nextProduct.id} in this project catalog.`
      : `Added ${nextProduct.id} to this project catalog.`;
    await refresh();
  });

  await refresh();
}

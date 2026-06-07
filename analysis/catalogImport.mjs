/**
 * CSV/XLSX import + template helpers for the manufacturer catalog.
 *
 * Pure module: no DOM, no globals. The XLSX-aware functions accept the
 * SheetJS module as an argument so they can be used in the browser (where
 * XLSX is loaded as a `<script>` global) and in Node tests (where the
 * `xlsx` package can be imported directly).
 */

import {
  catalogIdentity,
  normalizeCatalogProduct,
  validateCatalogProduct
} from './manufacturerCatalog.mjs';

const APPROVAL_OPTIONS = ['approved', 'conditional', 'rejected', 'unreviewed'];
const CATEGORY_OPTIONS = ['tray', 'fitting', 'conduit', 'accessory'];
const UNIT_OPTIONS = ['EA', 'FT', 'LF', 'BOX', 'CTN'];

/**
 * Column spec used to generate templates and parse imports.
 *
 * `key` matches the field that `normalizeCatalogProduct` already understands
 * (or one of its known aliases). The parser maps headers back to keys
 * case-insensitively, so users can rename headers as long as one of the
 * accepted spellings is present.
 */
export const CATALOG_IMPORT_COLUMNS = [
  { key: 'id', header: 'Part Number', type: 'text', required: true,
    notes: 'Unique SKU for this row. Must be unique within the catalog.' },
  { key: 'manufacturer', header: 'Manufacturer', type: 'text', required: true,
    notes: 'Vendor name. "Generic" / blank is treated as ungoverned.' },
  { key: 'catalogNumber', header: 'Catalog No.', type: 'text', required: true,
    aliases: ['catalog_number', 'sku', 'model'],
    notes: 'Vendor catalog or part number. Falls back to Part Number.' },
  { key: 'category', header: 'Category', type: 'enum', required: true,
    enumValues: CATEGORY_OPTIONS,
    notes: `One of: ${CATEGORY_OPTIONS.join(', ')}.` },
  { key: 'subcategory', header: 'Subcategory', type: 'text', required: false,
    notes: 'e.g. straight, elbow, tee, reducer.' },
  { key: 'description', header: 'Description', type: 'text', required: true,
    notes: 'Short human-readable description for BOM rows.' },
  { key: 'material', header: 'Material', type: 'text', required: false,
    notes: 'steel | aluminum | fiberglass | stainless | other.' },
  { key: 'finish', header: 'Finish', type: 'text', required: false,
    notes: 'e.g. pre-galvanized, hot-dip, powder-coat.' },
  { key: 'width_in', header: 'Width (in)', type: 'number', required: false },
  { key: 'depth_in', header: 'Depth (in)', type: 'number', required: false },
  { key: 'weight_lb', header: 'Weight (lb)', type: 'number', required: false },
  { key: 'unit', header: 'Unit', type: 'enum', required: false,
    enumValues: UNIT_OPTIONS, default: 'EA',
    notes: `One of: ${UNIT_OPTIONS.join(', ')}. Defaults to EA.` },
  { key: 'list_price_usd', header: 'List Price (USD)', type: 'number', required: false },
  { key: 'load_class', header: 'Load Class', type: 'text', required: false,
    notes: 'NEMA class, e.g. 20A.' },
  { key: 'nec_listed', header: 'NEC Listed', type: 'boolean', required: false },
  { key: 'ul_classified', header: 'UL Classified', type: 'boolean', required: false },
  { key: 'approved', header: 'Approved', type: 'boolean', required: false,
    notes: 'TRUE/FALSE. Approved rows require Source and Last Verified.' },
  { key: 'approval_status', header: 'Approval Status', type: 'enum', required: false,
    enumValues: APPROVAL_OPTIONS,
    notes: `One of: ${APPROVAL_OPTIONS.join(', ')}.` },
  { key: 'approval_authority', header: 'Approval Authority', type: 'text', required: false,
    notes: 'Engineering authority that signed off (e.g. Project EE).' },
  { key: 'approved_by', header: 'Approved By', type: 'text', required: false },
  { key: 'approved_at', header: 'Approved Date', type: 'date', required: false,
    notes: 'YYYY-MM-DD.' },
  { key: 'source', header: 'Source', type: 'text', required: false,
    notes: 'Required for Approved rows. e.g. "Approved list rev B".' },
  { key: 'lastVerified', header: 'Last Verified', type: 'date', required: false,
    aliases: ['last_verified'],
    notes: 'Required for Approved rows. YYYY-MM-DD.' },
  { key: 'datasheet_url', header: 'Datasheet URL', type: 'text', required: false }
];

const HEADER_INDEX = (() => {
  const index = new Map();
  for (const col of CATALOG_IMPORT_COLUMNS) {
    const headers = [col.header, col.key, ...(col.aliases || [])];
    for (const h of headers) index.set(normalizeHeader(h), col.key);
  }
  return index;
})();

function normalizeHeader(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_\-]+/g, '');
}

function coerceCellValue(column, raw) {
  if (raw === undefined || raw === null || raw === '') {
    if (column.default !== undefined) return column.default;
    return undefined;
  }
  if (column.type === 'number') {
    const num = Number(String(raw).replace(/[$,\s]/g, ''));
    return Number.isFinite(num) ? num : undefined;
  }
  if (column.type === 'boolean') {
    const text = String(raw).trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'approved'].includes(text)) return true;
    if (['false', 'no', 'n', '0', ''].includes(text)) return false;
    return undefined;
  }
  if (column.type === 'date') {
    const text = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return undefined;
  }
  return String(raw).trim();
}

/**
 * Map a raw row (header → cell value) into a partial catalog-product object.
 * Returns `{ product, rowErrors }` — rowErrors covers per-cell coercion
 * failures (enum mismatch, unparseable number). Schema-level validation
 * happens after this step, via `validateCatalogProduct`.
 */
function mapRowToProduct(rawRow, rowNumber) {
  const product = {};
  const rowErrors = [];

  for (const [headerKey, value] of Object.entries(rawRow)) {
    const key = HEADER_INDEX.get(normalizeHeader(headerKey));
    if (!key) continue;
    const column = CATALOG_IMPORT_COLUMNS.find(c => c.key === key);
    const coerced = coerceCellValue(column, value);
    if (column.type === 'enum' && coerced !== undefined && !column.enumValues.includes(coerced)) {
      rowErrors.push({
        row: rowNumber,
        column: column.header,
        message: `${column.header} must be one of: ${column.enumValues.join(', ')}.`
      });
      continue;
    }
    if (column.type === 'number' && value !== '' && value !== undefined && value !== null && coerced === undefined) {
      rowErrors.push({
        row: rowNumber,
        column: column.header,
        message: `${column.header} must be a number.`
      });
      continue;
    }
    if (column.type === 'date' && value !== '' && value !== undefined && value !== null && coerced === undefined) {
      rowErrors.push({
        row: rowNumber,
        column: column.header,
        message: `${column.header} must be a YYYY-MM-DD date.`
      });
      continue;
    }
    if (coerced !== undefined) product[key] = coerced;
  }

  if (product.approval_status && !product.approved) {
    product.approved = product.approval_status === 'approved';
  }

  if ((product.approval_authority || product.approved_by || product.approved_at) && !product.approval) {
    product.approval = {
      status: product.approval_status || (product.approved ? 'approved' : 'unreviewed'),
      authority: product.approval_authority || '',
      approvedBy: product.approved_by || '',
      approvedAt: product.approved_at || '',
      notes: ''
    };
  }

  return { product, rowErrors };
}

// ---------------------------------------------------------------------------
// Template generation
// ---------------------------------------------------------------------------

const TEMPLATE_EXAMPLES = [
  {
    id: 'BL-VCT-12-4',
    manufacturer: 'Eaton B-Line',
    catalogNumber: 'BL-VCT-12-4',
    category: 'tray',
    subcategory: 'straight',
    description: 'B-Line ventilated cable tray, 12" wide, 4" deep, 12 ft section',
    material: 'steel',
    finish: 'pre-galvanized',
    width_in: 12,
    depth_in: 4,
    weight_lb: 64,
    unit: 'EA',
    list_price_usd: 142.00,
    load_class: '20A',
    nec_listed: true,
    ul_classified: true,
    approved: true,
    approval_status: 'approved',
    approval_authority: 'Project EE',
    approved_by: 'D. Mitz',
    approved_at: '2026-05-22',
    source: 'Approved manufacturer list rev B',
    lastVerified: '2026-05-22',
    datasheet_url: 'https://example.com/datasheets/BL-VCT-12-4.pdf'
  },
  {
    id: 'BL-90E-12-4',
    manufacturer: 'Eaton B-Line',
    catalogNumber: 'BL-90E-12-4',
    category: 'fitting',
    subcategory: 'elbow',
    description: '90° horizontal elbow, 12" wide x 4" deep',
    material: 'steel',
    finish: 'pre-galvanized',
    width_in: 12,
    depth_in: 4,
    unit: 'EA',
    list_price_usd: 92.00,
    nec_listed: true,
    approved: true,
    approval_status: 'approved',
    source: 'Approved manufacturer list rev B',
    lastVerified: '2026-05-22'
  },
  {
    id: 'CONDUIT-EMT-1IN',
    manufacturer: 'Allied Tube',
    catalogNumber: 'EMT-1.00',
    category: 'conduit',
    subcategory: 'straight',
    description: '1" EMT conduit, 10 ft length',
    material: 'steel',
    finish: 'galvanized',
    unit: 'LF',
    list_price_usd: 3.45,
    nec_listed: true,
    approved: false,
    approval_status: 'unreviewed'
  },
  {
    id: 'ACC-CV-12',
    manufacturer: 'Eaton B-Line',
    catalogNumber: 'COV-12',
    category: 'accessory',
    subcategory: 'cover',
    description: 'Solid cover for 12" wide tray, 12 ft length',
    material: 'steel',
    finish: 'pre-galvanized',
    width_in: 12,
    unit: 'EA',
    list_price_usd: 78.00,
    approved: true,
    approval_status: 'approved',
    source: 'Approved manufacturer list rev B',
    lastVerified: '2026-05-22'
  }
];

export function buildCatalogTemplateRows() {
  return TEMPLATE_EXAMPLES.map(example => {
    const row = {};
    for (const col of CATALOG_IMPORT_COLUMNS) {
      const value = example[col.key];
      row[col.header] = value === undefined ? '' : value;
    }
    return row;
  });
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCatalogTemplateCsv() {
  const headers = CATALOG_IMPORT_COLUMNS.map(col => col.header);
  const rows = buildCatalogTemplateRows();
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => csvEscape(row[h])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/**
 * Build an XLSX workbook with two sheets:
 *   - "Products" — header row + example rows
 *   - "Reference" — column docs + allowed enum values
 *
 * @param {object} XLSX  SheetJS module (browser global or imported)
 * @returns {object} workbook
 */
export function buildCatalogTemplateWorkbook(XLSX) {
  if (!XLSX || !XLSX.utils || typeof XLSX.utils.book_new !== 'function') {
    throw new Error('XLSX module is required to build the template workbook.');
  }
  const wb = XLSX.utils.book_new();

  const headers = CATALOG_IMPORT_COLUMNS.map(col => col.header);
  const exampleRows = buildCatalogTemplateRows();
  const productsAoa = [headers, ...exampleRows.map(row => headers.map(h => row[h] ?? ''))];
  const productsSheet = XLSX.utils.aoa_to_sheet(productsAoa);
  productsSheet['!cols'] = headers.map(h => ({ wch: Math.max(12, Math.min(h.length + 2, 32)) }));
  XLSX.utils.book_append_sheet(wb, productsSheet, 'Products');

  const refAoa = [
    ['Field', 'Required', 'Type', 'Allowed Values', 'Notes'],
    ...CATALOG_IMPORT_COLUMNS.map(col => [
      col.header,
      col.required ? 'yes' : '',
      col.type,
      col.enumValues ? col.enumValues.join(' | ') : '',
      col.notes || ''
    ])
  ];
  const refSheet = XLSX.utils.aoa_to_sheet(refAoa);
  refSheet['!cols'] = [
    { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 28 }, { wch: 60 }
  ];
  XLSX.utils.book_append_sheet(wb, refSheet, 'Reference');

  return wb;
}

// ---------------------------------------------------------------------------
// CSV parsing (RFC 4180 — quoted strings, escaped quotes, CRLF tolerant)
// ---------------------------------------------------------------------------

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const src = String(text ?? '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') { continue; }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

function rowsToObjects(matrix) {
  if (matrix.length === 0) return [];
  const headers = matrix[0];
  return matrix.slice(1).map(cells => {
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = cells[idx] ?? '';
    });
    return obj;
  });
}

function processRawRows(rawRows, options = {}) {
  const products = [];
  const errors = [];
  const warnings = [];
  rawRows.forEach((rawRow, idx) => {
    const rowNumber = idx + 2; // +1 for header, +1 to be 1-indexed
    const { product: partial, rowErrors } = mapRowToProduct(rawRow, rowNumber);
    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }
    if (!partial.id && !partial.catalogNumber && !partial.manufacturer) {
      // Skip fully blank rows silently.
      return;
    }
    const validation = validateCatalogProduct(partial, {
      requireApprovalAuthority: options.requireApprovalAuthority !== false
    });
    if (!validation.valid) {
      validation.errors.forEach(err => errors.push({
        row: rowNumber,
        column: err.path,
        message: err.message
      }));
      return;
    }
    validation.warnings.forEach(warn => warnings.push({
      row: rowNumber,
      column: warn.path,
      message: warn.message
    }));
    products.push(validation.product);
  });
  return { products, errors, warnings };
}

/**
 * Parse a CSV string into normalized + validated catalog products.
 * @returns {{ products, errors, warnings }}
 */
export function parseCatalogCsv(text, options = {}) {
  const matrix = parseCsvText(text);
  const rawRows = rowsToObjects(matrix);
  return processRawRows(rawRows, options);
}

/**
 * Parse an XLSX workbook (raw bytes) into normalized + validated catalog products.
 * @param {object} XLSX  SheetJS module
 * @param {ArrayBuffer|Uint8Array|string} buffer
 * @returns {{ products, errors, warnings }}
 */
export function parseCatalogWorkbook(XLSX, buffer, options = {}) {
  if (!XLSX || !XLSX.read) {
    throw new Error('XLSX module is required to parse a workbook.');
  }
  const readOpts = typeof buffer === 'string'
    ? { type: 'binary' }
    : { type: buffer instanceof Uint8Array ? 'array' : 'array' };
  const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  const wb = XLSX.read(data, readOpts);
  const sheetName = wb.SheetNames.find(name => name.toLowerCase() === 'products') || wb.SheetNames[0];
  if (!sheetName) return { products: [], errors: [], warnings: [] };
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  return processRawRows(rawRows, options);
}

/**
 * Resolve an incoming batch against an existing catalog: split products into
 * accepted (new), duplicates (would overwrite an existing identity), and
 * compute an `merged` list that combines existing + new + overrides for
 * duplicates.
 *
 * @param {object[]} incomingProducts  normalized products to import
 * @param {object[]} existingProducts  current catalog (base + custom merged)
 * @returns {{ accepted, duplicates, merged }}
 */
export function importCatalogRows(incomingProducts = [], existingProducts = []) {
  const incoming = (Array.isArray(incomingProducts) ? incomingProducts : [])
    .map(p => normalizeCatalogProduct(p))
    .filter(Boolean);
  const existing = (Array.isArray(existingProducts) ? existingProducts : [])
    .map(p => normalizeCatalogProduct(p))
    .filter(Boolean);

  const existingByIdentity = new Map(existing.map(p => [catalogIdentity(p), p]));
  const accepted = [];
  const duplicates = [];
  for (const product of incoming) {
    const key = catalogIdentity(product);
    if (existingByIdentity.has(key)) duplicates.push({ key, product, existing: existingByIdentity.get(key) });
    else accepted.push(product);
  }
  return { accepted, duplicates };
}

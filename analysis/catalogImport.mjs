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
  mergeCatalogProducts,
  normalizeCatalogDate,
  normalizeCatalogProduct,
  validateCatalogProduct
} from './manufacturerCatalog.mjs';

const APPROVAL_OPTIONS = ['approved', 'conditional', 'rejected', 'unreviewed'];
const EVIDENCE_STATUS_OPTIONS = ['source_verified', 'screening'];
const CATEGORY_OPTIONS = ['tray', 'fitting', 'conduit', 'accessory', 'heat_trace', 'cable', 'protective_device'];
const HEAT_TRACE_TYPE_OPTIONS = ['selfRegulating', 'constantWattage', 'mineralInsulated'];
const PROTECTIVE_DEVICE_TYPE_OPTIONS = ['breaker', 'fuse', 'relay', 'relay_87', 'recloser', 'contactor', 'switch'];
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
  { key: 'evidenceStatus', header: 'Evidence Status', type: 'enum', required: false,
    aliases: ['evidence_status'],
    enumValues: EVIDENCE_STATUS_OPTIONS,
    default: 'screening',
    notes: 'source_verified requires Source, Last Verified, and Datasheet URL; it is not project approval.' },
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
  { key: 'datasheet_url', header: 'Datasheet URL', type: 'text', required: false },
  { key: 'heat_trace_type', header: 'Heat Trace Type', type: 'enum', required: false,
    enumValues: HEAT_TRACE_TYPE_OPTIONS,
    notes: `For heat_trace rows: one of ${HEAT_TRACE_TYPE_OPTIONS.join(', ')}.` },
  { key: 'heat_trace_voltages', header: 'Heat Trace Voltages (V)', type: 'text', required: false,
    notes: 'For heat_trace rows: semicolon-separated voltages, e.g. 120;240.' },
  { key: 'heat_trace_nominal_w_per_ft', header: 'Heat Trace Nominal W/ft', type: 'number', required: false },
  { key: 'heat_trace_max_circuit_lengths', header: 'Heat Trace Max Circuit Lengths (ft)', type: 'text', required: false,
    notes: 'For heat_trace rows: voltage:length pairs, e.g. 120:300;240:500.' },
  { key: 'heat_trace_max_exposure_temp_c', header: 'Heat Trace Max Exposure (C)', type: 'number', required: false },
  { key: 'heat_trace_hazardous_area_rating', header: 'Heat Trace Hazardous Area Rating', type: 'text', required: false },
  { key: 'heat_trace_startup_current_multiplier', header: 'Heat Trace Startup Current Multiplier', type: 'number', required: false },
  { key: 'heat_trace_family', header: 'Heat Trace Family', type: 'text', required: false },
  { key: 'cable_type', header: 'Cable Type', type: 'text', required: false,
    notes: 'For cable rows: e.g. Power, Control, Instrument, Fiber.' },
  { key: 'cable_conductors', header: 'Cable Conductors', type: 'number', required: false },
  { key: 'cable_conductor_size', header: 'Cable Conductor Size', type: 'text', required: false },
  { key: 'cable_conductor_material', header: 'Cable Conductor Material', type: 'text', required: false },
  { key: 'cable_insulation_type', header: 'Cable Insulation Type', type: 'text', required: false },
  { key: 'cable_voltage_rating', header: 'Cable Voltage Rating (V)', type: 'number', required: false },
  { key: 'cable_terminal_temp_rating', header: 'Cable Terminal Temp Rating', type: 'text', required: false },
  { key: 'cable_shielding_jacket', header: 'Cable Shielding / Jacket', type: 'text', required: false }
  , { key: 'protective_device_type', header: 'Protective Device Type', type: 'enum', required: false,
    enumValues: PROTECTIVE_DEVICE_TYPE_OPTIONS,
    notes: `For protective_device rows: one of ${PROTECTIVE_DEVICE_TYPE_OPTIONS.join(', ')}.` }
  , { key: 'protective_device_voltage_class', header: 'Protective Device Voltage Class', type: 'text', required: false }
  , { key: 'protective_device_trip_unit_model', header: 'Protective Device Trip Unit Model', type: 'text', required: false }
  , { key: 'protective_device_interrupting_ratings', header: 'Protective Device Interrupting Ratings', type: 'text', required: false,
    notes: 'For non-relay protective_device rows: voltage:kA pairs, e.g. 480:65;600:50.' }
  , { key: 'protective_device_curve', header: 'Protective Device Curve Points', type: 'text', required: false,
    notes: 'For protective_device rows: at least two current:time pairs, e.g. 100:100;500:1;1000:0.1.' }
  , { key: 'protective_device_pickup', header: 'Protective Device Pickup (A)', type: 'number', required: false }
  , { key: 'protective_device_time', header: 'Protective Device Time (s)', type: 'number', required: false }
  , { key: 'protective_device_instantaneous', header: 'Protective Device Instantaneous (A)', type: 'number', required: false }
  , { key: 'protective_device_curve_document', header: 'Protective Device Curve Document', type: 'text', required: false }
  , { key: 'protective_device_curve_revision', header: 'Protective Device Curve Revision', type: 'text', required: false }
  , { key: 'protective_device_curve_id', header: 'Protective Device Curve ID', type: 'text', required: false }
  , { key: 'protective_device_curve_extraction_method', header: 'Protective Device Curve Extraction Method', type: 'text', required: false }
  , { key: 'protective_device_curve_reviewer', header: 'Protective Device Curve Reviewer', type: 'text', required: false }
  , { key: 'protective_device_library_status', header: 'Protective Device Library Status', type: 'enum', required: false,
    enumValues: ['screening', 'source_verified', 'calculation_ready'],
    notes: 'Declared TCC readiness; the app verifies required curve/rating evidence before using it.' }
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
    const normalized = normalizeCatalogDate(text);
    if (normalized) return normalized;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
    const parsed = new Date(text);
    if (Number.isFinite(parsed.getTime())) {
      return normalizeCatalogDate(parsed.toISOString().slice(0, 10)) || undefined;
    }
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
    evidenceStatus: 'source_verified',
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
  },
  {
    id: 'HT-EXAMPLE-5',
    manufacturer: 'Example Manufacturer',
    catalogNumber: 'HT-5-240',
    category: 'heat_trace',
    subcategory: 'cable',
    description: '5 W/ft self-regulating heat-trace cable, 120/240 V',
    unit: 'FT',
    approved: false,
    approval_status: 'unreviewed',
    heat_trace_type: 'selfRegulating',
    heat_trace_voltages: '120;240',
    heat_trace_nominal_w_per_ft: 5,
    heat_trace_max_circuit_lengths: '120:300;240:500',
    heat_trace_max_exposure_temp_c: 65,
    heat_trace_startup_current_multiplier: 1.7,
    heat_trace_family: 'HT Example'
  },
  {
    id: 'CABLE-EXAMPLE-12',
    manufacturer: 'Example Manufacturer',
    catalogNumber: 'CU-THHN-12',
    category: 'cable',
    subcategory: 'building-wire',
    description: 'Copper 12 AWG THHN/THWN-2 building wire, 600 V',
    unit: 'FT',
    approved: false,
    approval_status: 'unreviewed',
    cable_type: 'Power',
    cable_conductors: 1,
    cable_conductor_size: '#12 AWG',
    cable_conductor_material: 'Copper',
    cable_insulation_type: 'THHN/THWN-2',
    cable_voltage_rating: 600,
    cable_terminal_temp_rating: '75',
    cable_shielding_jacket: 'Nylon jacket'
  },
  {
    id: 'PD-EXAMPLE-100',
    manufacturer: 'Example Manufacturer',
    catalogNumber: 'PD-100-3P',
    category: 'protective_device',
    subcategory: 'breaker',
    description: '100 A 3-pole molded-case circuit breaker',
    unit: 'EA',
    approved: false,
    approval_status: 'unreviewed',
    evidenceStatus: 'screening',
    protective_device_type: 'breaker',
    protective_device_voltage_class: 'LV',
    protective_device_trip_unit_model: 'Example electronic trip',
    protective_device_interrupting_ratings: '480:35;600:25',
    protective_device_curve: '100:100;500:1;1000:0.1',
    protective_device_pickup: 100,
    protective_device_time: 0.3,
    protective_device_instantaneous: 500,
    protective_device_library_status: 'screening'
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
// Export (round-trips back through the import parser)
// ---------------------------------------------------------------------------

function exportCellValue(product, column) {
  const direct = {
    id: product.id,
    manufacturer: product.manufacturer,
    catalogNumber: product.catalogNumber,
    category: product.category,
    subcategory: product.subcategory,
    description: product.description,
    material: product.material,
    finish: product.finish,
    width_in: product.dimensions?.widthIn,
    depth_in: product.dimensions?.depthIn,
    weight_lb: product.dimensions?.weightLb,
    unit: product.unit,
    list_price_usd: product.commercial?.listPriceUsd,
    load_class: product.ratings?.loadClass,
    nec_listed: product.ratings?.necListed,
    ul_classified: product.ratings?.ulClassified,
    approved: product.approved,
    approval_status: product.approval?.status,
    approval_authority: product.approval?.authority,
    approved_by: product.approval?.approvedBy,
    approved_at: product.approval?.approvedAt,
    source: product.source,
    lastVerified: product.lastVerified,
    datasheet_url: product.datasheetUrl,
    heat_trace_type: product.heat_trace_type,
    heat_trace_voltages: product.heat_trace_voltages,
    heat_trace_nominal_w_per_ft: product.heat_trace_nominal_w_per_ft,
    heat_trace_max_circuit_lengths: product.heat_trace_max_circuit_lengths,
    heat_trace_max_exposure_temp_c: product.heat_trace_max_exposure_temp_c,
    heat_trace_hazardous_area_rating: product.heat_trace_hazardous_area_rating,
    heat_trace_startup_current_multiplier: product.heat_trace_startup_current_multiplier,
    heat_trace_family: product.heat_trace_family,
    cable_type: product.cable_type,
    cable_conductors: product.cable_conductors,
    cable_conductor_size: product.cable_conductor_size,
    cable_conductor_material: product.cable_conductor_material,
    cable_insulation_type: product.cable_insulation_type,
    cable_voltage_rating: product.cable_voltage_rating,
    cable_terminal_temp_rating: product.cable_terminal_temp_rating,
    cable_shielding_jacket: product.cable_shielding_jacket,
    protective_device_type: product.protective_device_type,
    protective_device_voltage_class: product.protective_device_voltage_class,
    protective_device_trip_unit_model: product.protective_device_trip_unit_model,
    protective_device_interrupting_ratings: product.protective_device_interrupting_ratings,
    protective_device_curve: product.protective_device_curve,
    protective_device_pickup: product.protective_device_pickup,
    protective_device_time: product.protective_device_time,
    protective_device_instantaneous: product.protective_device_instantaneous,
    protective_device_curve_document: product.protective_device_curve_document,
    protective_device_curve_revision: product.protective_device_curve_revision,
    protective_device_curve_id: product.protective_device_curve_id,
    protective_device_curve_extraction_method: product.protective_device_curve_extraction_method,
    protective_device_curve_reviewer: product.protective_device_curve_reviewer,
    protective_device_library_status: product.protective_device_library_status
  }[column.key];

  if (direct === undefined || direct === null) return '';
  if (column.type === 'boolean') return direct ? 'TRUE' : 'FALSE';
  return direct;
}

/**
 * Build export rows (header → value) for the same column spec used by the
 * import template, so an exported catalog can be edited and re-imported.
 *
 * @param {object[]} products catalog products (normalized or raw)
 * @returns {object[]}
 */
export function buildCatalogExportRows(products = []) {
  return (Array.isArray(products) ? products : [])
    .map(product => normalizeCatalogProduct(product))
    .filter(Boolean)
    .map((product) => {
      const row = {};
      for (const col of CATALOG_IMPORT_COLUMNS) {
        row[col.header] = exportCellValue(product, col);
      }
      return row;
    });
}

/**
 * Serialize a catalog to CSV using the import template headers.
 * @param {object[]} products
 * @returns {string}
 */
export function buildCatalogExportCsv(products = []) {
  const headers = CATALOG_IMPORT_COLUMNS.map(col => col.header);
  const rows = buildCatalogExportRows(products);
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => csvEscape(row[h])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/**
 * Build an XLSX workbook of the catalog (Products sheet + Reference sheet),
 * matching the import template layout.
 *
 * @param {object} XLSX SheetJS module (browser global or imported)
 * @param {object[]} products
 * @returns {object} workbook
 */
export function buildCatalogExportWorkbook(XLSX, products = []) {
  if (!XLSX || !XLSX.utils || typeof XLSX.utils.book_new !== 'function') {
    throw new Error('XLSX module is required to build the catalog workbook.');
  }
  const wb = XLSX.utils.book_new();
  const headers = CATALOG_IMPORT_COLUMNS.map(col => col.header);
  const rows = buildCatalogExportRows(products);
  const aoa = [headers, ...rows.map(row => headers.map(h => row[h] ?? ''))];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = headers.map(h => ({ wch: Math.max(12, Math.min(h.length + 2, 32)) }));
  XLSX.utils.book_append_sheet(wb, sheet, 'Products');
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
 * accepted (new), duplicates (allowed project-row updates), and blocked rows
 * (protected base identities or duplicate identities inside the same file).
 * `overridableIdentities` must explicitly name identities the caller owns.
 *
 * @param {object[]} incomingProducts  normalized products to import
 * @param {object[]} existingProducts  current catalog (base + custom merged)
 * @param {object} [options]
 * @param {Set<string>|string[]} [options.overridableIdentities]
 * @returns {{ accepted, duplicates, blocked, importable, merged }}
 */
export function importCatalogRows(incomingProducts = [], existingProducts = [], options = {}) {
  const incoming = (Array.isArray(incomingProducts) ? incomingProducts : [])
    .map(p => normalizeCatalogProduct(p))
    .filter(Boolean);
  const existing = (Array.isArray(existingProducts) ? existingProducts : [])
    .map(p => normalizeCatalogProduct(p))
    .filter(Boolean);

  const existingByIdentity = new Map(existing.map(p => [catalogIdentity(p), p]));
  const overridableIdentities = options.overridableIdentities instanceof Set
    ? options.overridableIdentities
    : new Set(Array.isArray(options.overridableIdentities) ? options.overridableIdentities : []);
  const incomingCounts = incoming.reduce((counts, product) => {
    const key = catalogIdentity(product);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
  const accepted = [];
  const duplicates = [];
  const blocked = [];

  for (const product of incoming) {
    const key = catalogIdentity(product);
    if (incomingCounts.get(key) > 1) {
      blocked.push({
        key,
        kind: 'incoming-duplicate',
        product,
        existing: null
      });
      continue;
    }
    if (!existingByIdentity.has(key)) {
      accepted.push(product);
      continue;
    }
    const duplicate = { key, kind: 'existing', product, existing: existingByIdentity.get(key) };
    if (overridableIdentities.has(key)) duplicates.push(duplicate);
    else blocked.push({ ...duplicate, kind: 'protected-base' });
  }
  const importable = [...accepted, ...duplicates.map(entry => entry.product)];
  const merged = mergeCatalogProducts(existing, importable, { allowProjectOverrides: true });
  return { accepted, duplicates, blocked, importable, merged };
}

export const PRODUCT_CATALOG_SCHEMA_VERSION = 'product-catalog-v1';

export const PRODUCT_CATALOG_TYPES = [
  'tray',
  'conduit',
  'fitting',
  'heatTraceComponent',
  'protectiveDevice',
  'cableType',
];

const TYPE_ALIASES = {
  trays: 'tray',
  cableTray: 'tray',
  conduits: 'conduit',
  fittings: 'fitting',
  accessory: 'fitting',
  accessories: 'fitting',
  heatTrace: 'heatTraceComponent',
  heatTraceComponents: 'heatTraceComponent',
  heat_trace_component: 'heatTraceComponent',
  protectiveDevices: 'protectiveDevice',
  protective_device: 'protectiveDevice',
  breaker: 'protectiveDevice',
  cable: 'cableType',
  cableTypes: 'cableType',
  cable_type: 'cableType',
};

const SHARED_TEMPLATE_FIELDS = [
  'manufacturer',
  'catalogNumber',
  'category',
  'subcategory',
  'description',
  'standards',
  'approved',
  'approvalStatus',
  'approvedBy',
  'approvedAt',
  'source',
  'sourceUrl',
  'lastVerified',
  'datasheetUrl',
  'bimRef',
  'verificationNotes',
  'tags',
];

const TYPE_TEMPLATE_FIELDS = {
  tray: ['series', 'width_in', 'depth_in', 'material', 'finish', 'load_class', 'unit', 'list_price_usd', 'weight_lb'],
  conduit: ['series', 'trade_size', 'material', 'finish', 'standard', 'unit', 'list_price_usd', 'weight_lb'],
  fitting: ['series', 'width_in', 'depth_in', 'angle_deg', 'material', 'finish', 'unit', 'list_price_usd', 'weight_lb'],
  heatTraceComponent: ['componentType', 'voltageV', 'wattDensityWPerFt', 'hazardousAreaRating', 'temperatureClass', 'unit'],
  protectiveDevice: ['deviceType', 'voltageV', 'ampRatingA', 'interruptRatingKa', 'frame', 'tripUnit', 'curveRef'],
  cableType: ['conductorSize', 'conductorMaterial', 'insulationType', 'voltageRating', 'temperatureRatingC', 'ampacityA'],
};

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  if (typeof value === 'string') {
    return value.split(/[;,]/).map(item => item.trim()).filter(Boolean);
  }
  return [value];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringValue(value = '') {
  return String(value ?? '').trim();
}

function nullableNumber(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^(true|yes|y|1|approved)$/i.test(value.trim())) return true;
    if (/^(false|no|n|0|unapproved|pending|rejected)$/i.test(value.trim())) return false;
  }
  return fallback;
}

function slug(value = '') {
  return stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function normalizeType(value = '') {
  const raw = stringValue(value);
  if (PRODUCT_CATALOG_TYPES.includes(raw)) return raw;
  return TYPE_ALIASES[raw] || TYPE_ALIASES[raw.replace(/[-\s]/g, '')] || raw || 'fitting';
}

function dateValue(value = '') {
  const raw = stringValue(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function standardsFromRow(row = {}) {
  const standards = new Set(asArray(row.standards || row.standard));
  if (row.nec_listed === true || row.necListed === true) standards.add('NEC Listed');
  if (row.ul_classified === true || row.ulClassified === true) standards.add('UL Classified');
  return [...standards].sort();
}

function ratingsFromRow(row = {}) {
  const ratings = { ...asObject(row.ratings) };
  const copy = {
    loadClass: row.load_class ?? row.loadClass,
    voltageV: row.voltageV ?? row.voltage_v,
    ampRatingA: row.ampRatingA ?? row.amp_rating_a,
    interruptRatingKa: row.interruptRatingKa ?? row.interrupt_rating_ka,
    sccrKa: row.sccrKa ?? row.sccr_ka,
    wattDensityWPerFt: row.wattDensityWPerFt ?? row.watt_density_w_per_ft,
    temperatureRatingC: row.temperatureRatingC ?? row.temperature_rating_c,
    voltageRating: row.voltageRating ?? row.voltage_rating,
  };
  Object.entries(copy).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') ratings[key] = value;
  });
  return ratings;
}

function dimensionsFromRow(row = {}) {
  const dimensions = { ...asObject(row.dimensions) };
  const numeric = {
    widthIn: row.width_in ?? row.widthIn,
    depthIn: row.depth_in ?? row.depthIn,
    angleDeg: row.angle_deg ?? row.angleDeg,
    weightLb: row.weight_lb ?? row.weightLb,
    tradeSize: row.trade_size ?? row.tradeSize,
    conduitOdIn: row.conduit_od_in ?? row.conduitOdIn,
  };
  Object.entries(numeric).forEach(([key, value]) => {
    const parsed = nullableNumber(value);
    if (parsed !== null) dimensions[key] = parsed;
  });
  return dimensions;
}

export function normalizeProductCatalogRow(row = {}, options = {}) {
  const source = asObject(row);
  const category = normalizeType(source.category || options.defaultCategory);
  const manufacturer = stringValue(source.manufacturer);
  const catalogNumber = stringValue(
    source.catalogNumber
      || source.catalog_number
      || source.catalogNo
      || source.partNumber
      || source.part_number
      || source.sku
      || source.id
  );
  const approved = booleanValue(source.approved, false);
  const approvalStatus = stringValue(source.approvalStatus || source.approval_status || (approved ? 'approved' : 'unreviewed'));
  const normalized = {
    ...source,
    id: stringValue(source.id) || slug(`${manufacturer}-${catalogNumber}-${category}`),
    manufacturer,
    catalogNumber,
    series: stringValue(source.series),
    category,
    subcategory: stringValue(source.subcategory || source.componentType || source.deviceType),
    description: stringValue(source.description || source.label || source.name),
    standards: standardsFromRow(source),
    ratings: ratingsFromRow(source),
    dimensions: dimensionsFromRow(source),
    bimRef: stringValue(source.bimRef || source.bim_ref || source.revitFamilyUrl || source.revit_family_url),
    datasheetUrl: stringValue(source.datasheetUrl || source.datasheet_url || source.url),
    approved,
    approvalStatus,
    approvedBy: stringValue(source.approvedBy || source.approved_by),
    approvedAt: dateValue(source.approvedAt || source.approved_at),
    source: stringValue(source.source || (source.url ? 'manufacturer-url' : 'local-catalog')),
    sourceUrl: stringValue(source.sourceUrl || source.source_url || source.url),
    lastVerified: dateValue(source.lastVerified || source.last_verified),
    verificationNotes: stringValue(source.verificationNotes || source.verification_notes),
    replacementFor: stringValue(source.replacementFor || source.replacement_for),
    tags: asArray(source.tags).map(String).sort(),
  };
  return JSON.parse(JSON.stringify(normalized));
}

export function normalizeProductCatalog(rawCatalog = {}, options = {}) {
  const products = Array.isArray(rawCatalog)
    ? rawCatalog
    : Array.isArray(rawCatalog.products)
      ? rawCatalog.products
      : Array.isArray(rawCatalog.rows)
        ? rawCatalog.rows
        : [];
  const rows = products.map(row => normalizeProductCatalogRow(row, options));
  return {
    version: PRODUCT_CATALOG_SCHEMA_VERSION,
    sourceVersion: rawCatalog?._version || rawCatalog?.version || '',
    rows,
    summary: {
      total: rows.length,
      approved: rows.filter(row => row.approved).length,
      unapproved: rows.filter(row => !row.approved).length,
      categories: [...new Set(rows.map(row => row.category).filter(Boolean))].sort(),
      manufacturers: [...new Set(rows.map(row => row.manufacturer).filter(Boolean))].sort(),
    },
  };
}

export function validateProductCatalogRow(row = {}, schema = {}) {
  const normalized = normalizeProductCatalogRow(row, schema);
  const errors = [];
  const warnings = [];
  if (!normalized.manufacturer) errors.push('manufacturer is required');
  if (!normalized.catalogNumber) errors.push('catalogNumber is required');
  if (!normalized.category) errors.push('category is required');
  if (!normalized.description) errors.push('description is required');
  if (!PRODUCT_CATALOG_TYPES.includes(normalized.category)) {
    warnings.push(`category ${normalized.category} is not one of ${PRODUCT_CATALOG_TYPES.join(', ')}`);
  }
  if (normalized.approved && !normalized.lastVerified) warnings.push('approved rows should include lastVerified');
  if (normalized.approved && !normalized.approvedBy) warnings.push('approved rows should include approvedBy');
  return { valid: errors.length === 0, errors, warnings, row: normalized };
}

function mergeKey(row = {}) {
  const normalized = normalizeProductCatalogRow(row);
  return [
    normalized.manufacturer.toLowerCase(),
    normalized.catalogNumber.toLowerCase(),
    normalized.category.toLowerCase(),
  ].join('|');
}

function changedFields(previous = {}, next = {}) {
  const fields = ['description', 'series', 'subcategory', 'standards', 'ratings', 'dimensions', 'approved', 'approvalStatus', 'lastVerified'];
  return fields.filter(field => JSON.stringify(previous[field] ?? null) !== JSON.stringify(next[field] ?? null));
}

export function mergeProductCatalogRows(existingRows = [], importedRows = [], options = {}) {
  const rowsByKey = new Map();
  const duplicates = [];
  const warnings = [];
  asArray(existingRows).map(row => normalizeProductCatalogRow(row)).forEach(row => {
    rowsByKey.set(mergeKey(row), row);
  });
  asArray(importedRows).map(row => normalizeProductCatalogRow(row)).forEach(row => {
    const key = mergeKey(row);
    if (rowsByKey.has(key)) {
      const previous = rowsByKey.get(key);
      const fields = changedFields(previous, row);
      duplicates.push({
        key,
        manufacturer: row.manufacturer,
        catalogNumber: row.catalogNumber,
        category: row.category,
        changedFields: fields,
      });
      if (fields.length) {
        warnings.push(`Catalog row ${row.manufacturer} ${row.catalogNumber} changed fields: ${fields.join(', ')}`);
      }
      rowsByKey.set(key, options.preserveExisting ? { ...row, ...previous } : { ...previous, ...row });
    } else {
      rowsByKey.set(key, row);
    }
  });
  const rows = [...rowsByKey.values()].sort((a, b) => mergeKey(a).localeCompare(mergeKey(b)));
  return { rows, duplicates, warnings };
}

function isStale(row = {}, options = {}) {
  const maxAgeDays = options.maxAgeDays ?? 365;
  if (!row.lastVerified) return false;
  const verified = new Date(row.lastVerified);
  if (Number.isNaN(verified.getTime())) return true;
  const ageDays = (Date.now() - verified.getTime()) / 86400000;
  return ageDays > maxAgeDays;
}

export function filterApprovedCatalogRows(rows = [], filters = {}) {
  const normalized = asArray(rows).map(row => normalizeProductCatalogRow(row));
  return normalized.filter(row => {
    if (filters.approvedOnly && !row.approved) return false;
    if (filters.category && row.category !== normalizeType(filters.category)) return false;
    if (filters.manufacturer && !row.manufacturer.toLowerCase().includes(stringValue(filters.manufacturer).toLowerCase())) return false;
    if (filters.standard && !row.standards.some(standard => standard.toLowerCase().includes(stringValue(filters.standard).toLowerCase()))) return false;
    if (filters.source && row.source !== filters.source) return false;
    if (filters.staleOnly && !isStale(row, filters)) return false;
    if (filters.search) {
      const q = stringValue(filters.search).toLowerCase();
      const haystack = `${row.id} ${row.manufacturer} ${row.catalogNumber} ${row.series} ${row.category} ${row.description} ${row.tags.join(' ')}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function buildProductCatalogImportTemplate(productType = 'tray') {
  const category = normalizeType(productType);
  const fields = [...SHARED_TEMPLATE_FIELDS, ...(TYPE_TEMPLATE_FIELDS[category] || [])];
  const row = Object.fromEntries(fields.map(field => [field, '']));
  row.category = category;
  row.approved = false;
  row.approvalStatus = 'unreviewed';
  return {
    version: PRODUCT_CATALOG_SCHEMA_VERSION,
    productType: category,
    csvHeaders: fields,
    csv: `${fields.join(',')}\n${fields.map(field => row[field]).join(',')}`,
    jsonRows: [row],
  };
}

function buildDuplicates(rows = []) {
  const seen = new Map();
  const duplicates = [];
  rows.forEach(row => {
    const key = mergeKey(row);
    if (seen.has(key)) {
      duplicates.push({
        key,
        manufacturer: row.manufacturer,
        catalogNumber: row.catalogNumber,
        category: row.category,
      });
    } else {
      seen.set(key, row);
    }
  });
  return duplicates;
}

function usageLabel(usage = {}) {
  return stringValue(usage.label || usage.tag || usage.id || usage.ref || usage.description || 'Project item');
}

function buildUsageIssues(catalogRows = [], usageRows = [], options = {}) {
  const byKey = new Map(catalogRows.map(row => [mergeKey(row), row]));
  return asArray(usageRows).map(usage => {
    const normalizedUsage = {
      label: usageLabel(usage),
      manufacturer: stringValue(usage.manufacturer),
      catalogNumber: stringValue(usage.catalogNumber || usage.catalog_number || usage.partNumber || usage.id),
      category: normalizeType(usage.category || usage.productType || usage.kind),
      source: stringValue(usage.source || usage.pageHref || 'project'),
    };
    const hasCatalogId = normalizedUsage.manufacturer && normalizedUsage.catalogNumber;
    if (!hasCatalogId) {
      return {
        ...normalizedUsage,
        status: 'generic',
        message: `${normalizedUsage.label} uses generic product data without manufacturer/catalog number.`,
      };
    }
    const match = byKey.get(mergeKey(normalizedUsage));
    if (!match) {
      return {
        ...normalizedUsage,
        status: 'unmatched',
        message: `${normalizedUsage.label} references ${normalizedUsage.manufacturer} ${normalizedUsage.catalogNumber}, which is not in the governed catalog.`,
      };
    }
    if (!match.approved) {
      return {
        ...normalizedUsage,
        status: 'unapproved',
        message: `${normalizedUsage.label} uses ${match.manufacturer} ${match.catalogNumber}, which is not approved in the local catalog.`,
      };
    }
    if (isStale(match, options)) {
      return {
        ...normalizedUsage,
        status: 'stale',
        message: `${normalizedUsage.label} uses ${match.manufacturer} ${match.catalogNumber}, which needs verification refresh.`,
      };
    }
    return null;
  }).filter(Boolean);
}

export function buildProductCatalogGovernancePackage({ catalog = [], projectUsage = [], approvals = {}, generatedAt = null } = {}) {
  const rows = normalizeProductCatalog(Array.isArray(catalog) ? catalog : catalog?.products || catalog?.rows || []).rows;
  const duplicates = buildDuplicates(rows);
  const staleRows = rows.filter(row => isStale(row));
  const unapprovedUsage = buildUsageIssues(rows, projectUsage);
  const warnings = [
    ...duplicates.map(row => `Duplicate catalog key: ${row.manufacturer} ${row.catalogNumber} (${row.category}).`),
    ...staleRows.map(row => `Catalog row ${row.manufacturer} ${row.catalogNumber} was last verified ${row.lastVerified}.`),
    ...unapprovedUsage.map(row => row.message),
  ];
  const templates = Object.fromEntries(PRODUCT_CATALOG_TYPES.map(type => [type, buildProductCatalogImportTemplate(type)]));
  return {
    version: PRODUCT_CATALOG_SCHEMA_VERSION,
    generatedAt: generatedAt || new Date().toISOString(),
    summary: {
      total: rows.length,
      approved: rows.filter(row => row.approved).length,
      unapproved: rows.filter(row => !row.approved).length,
      stale: staleRows.length,
      duplicates: duplicates.length,
      unapprovedUsage: unapprovedUsage.length,
      warnings: warnings.length,
    },
    rows,
    duplicates,
    staleRows,
    unapprovedUsage,
    approvals: asObject(approvals),
    importTemplates: templates,
    warnings,
    assumptions: [
      'Product catalog governance is local project metadata for engineering review.',
      'Approved status does not represent manufacturer certification or formal document control.',
      'Catalog rows are user-curated or imported; CableTrayRoute does not fetch live manufacturer data in this workflow.',
    ],
  };
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderProductCatalogGovernanceHTML(pkg = {}) {
  const rows = asArray(pkg.rows);
  const usage = asArray(pkg.unapprovedUsage);
  return `<section class="report-section" id="rpt-product-catalog">
  <h2>Manufacturer Product Catalog Governance</h2>
  <p class="report-note">Local approved-catalog governance for product-grade manufacturer selections. Final manufacturer data and submittals require project review.</p>
  <dl class="report-dl">
    <dt>Catalog Rows</dt><dd>${escapeHtml(pkg.summary?.total || 0)}</dd>
    <dt>Approved</dt><dd>${escapeHtml(pkg.summary?.approved || 0)}</dd>
    <dt>Unapproved</dt><dd>${escapeHtml(pkg.summary?.unapproved || 0)}</dd>
    <dt>Stale Verification</dt><dd>${escapeHtml(pkg.summary?.stale || 0)}</dd>
    <dt>Duplicate Keys</dt><dd>${escapeHtml(pkg.summary?.duplicates || 0)}</dd>
    <dt>Usage Warnings</dt><dd>${escapeHtml(pkg.summary?.unapprovedUsage || 0)}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Manufacturer</th><th>Catalog #</th><th>Category</th><th>Description</th><th>Approved</th><th>Last Verified</th><th>Source</th></tr></thead>
      <tbody>${rows.slice(0, 50).map(row => `<tr>
        <td>${escapeHtml(row.manufacturer)}</td>
        <td>${escapeHtml(row.catalogNumber)}</td>
        <td>${escapeHtml(row.category)}</td>
        <td>${escapeHtml(row.description)}</td>
        <td>${escapeHtml(row.approvalStatus || (row.approved ? 'approved' : 'unreviewed'))}</td>
        <td>${escapeHtml(row.lastVerified || 'not verified')}</td>
        <td>${escapeHtml(row.source)}</td>
      </tr>`).join('') || '<tr><td colspan="7">No governed catalog rows.</td></tr>'}</tbody>
    </table>
  </div>
  ${usage.length ? `<h3>Catalog Usage Warnings</h3>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Item</th><th>Status</th><th>Manufacturer</th><th>Catalog #</th><th>Message</th></tr></thead>
      <tbody>${usage.map(row => `<tr>
        <td>${escapeHtml(row.label)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.manufacturer || 'generic')}</td>
        <td>${escapeHtml(row.catalogNumber || 'n/a')}</td>
        <td>${escapeHtml(row.message)}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>` : '<p class="report-empty">No catalog usage warnings detected.</p>'}
</section>`;
}

import { normalizeProductCatalog } from './productCatalog.mjs';

export const PRICING_FEED_GOVERNANCE_VERSION = 'pricing-feed-governance-v1';

export const PRICING_SOURCE_TYPES = [
  'vendorQuote',
  'distributorExport',
  'rsMeansBook',
  'manualBook',
  'genericDefault',
];

const SOURCE_ALIASES = {
  vendor: 'vendorQuote',
  quote: 'vendorQuote',
  vendor_quote: 'vendorQuote',
  distributor: 'distributorExport',
  distributor_export: 'distributorExport',
  rsmeans: 'rsMeansBook',
  rsMeans: 'rsMeansBook',
  rs_means: 'rsMeansBook',
  manual: 'manualBook',
  manual_book: 'manualBook',
  default: 'genericDefault',
  generic: 'genericDefault',
};

const CATEGORY_ALIASES = {
  cable: 'cableType',
  cables: 'cableType',
  cabletype: 'cableType',
  cable_type: 'cableType',
  tray: 'tray',
  trays: 'tray',
  cabletray: 'tray',
  cableTray: 'tray',
  conduit: 'conduit',
  conduits: 'conduit',
  fitting: 'fitting',
  fittings: 'fitting',
  labor: 'labor',
  productivity: 'productivity',
  protective_device: 'protectiveDevice',
  protectiveDevices: 'protectiveDevice',
  heat_trace_component: 'heatTraceComponent',
  heatTrace: 'heatTraceComponent',
};

const SHARED_TEMPLATE_FIELDS = [
  'sourceType',
  'sourceName',
  'quoteNumber',
  'quoteDate',
  'expiresAt',
  'currency',
  'region',
  'manufacturer',
  'catalogNumber',
  'category',
  'description',
  'uom',
  'unitPrice',
  'laborUnitPrice',
  'leadTimeDays',
  'minOrderQty',
  'priceBreaks',
  'escalationPct',
  'verifiedBy',
  'lastVerified',
  'approvalStatus',
  'notes',
];

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  if (typeof value === 'string') return value.split(/[;,]/).map(item => item.trim()).filter(Boolean);
  return [value];
}

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function stringValue(value = '') {
  return String(value ?? '').trim();
}

function numberValue(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^(true|yes|y|1|approved|active)$/i.test(value.trim())) return true;
    if (/^(false|no|n|0|unapproved|pending|rejected|inactive)$/i.test(value.trim())) return false;
  }
  return fallback;
}

function dateValue(value = '') {
  const raw = stringValue(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function slug(value = '') {
  return stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function normalizeSourceType(value = '') {
  const raw = stringValue(value || 'manualBook');
  if (PRICING_SOURCE_TYPES.includes(raw)) return raw;
  const compact = raw.replace(/[-\s]/g, '_');
  return SOURCE_ALIASES[raw] || SOURCE_ALIASES[compact] || SOURCE_ALIASES[compact.toLowerCase()] || raw || 'manualBook';
}

function normalizeCategory(value = '') {
  const raw = stringValue(value || 'custom');
  const compact = raw.replace(/[-_\s]/g, '');
  return CATEGORY_ALIASES[raw] || CATEGORY_ALIASES[compact] || CATEGORY_ALIASES[raw.toLowerCase()] || raw || 'custom';
}

function normalizeApprovalStatus(value = '', sourceType = 'manualBook') {
  const raw = stringValue(value);
  if (raw) return raw;
  return sourceType === 'genericDefault' ? 'genericDefault' : 'unreviewed';
}

function parsePriceBreaks(value) {
  if (Array.isArray(value)) return value.map(row => ({ ...asObject(row) })).filter(row => Object.keys(row).length);
  if (!value) return [];
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return [];
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(row => ({ ...asObject(row) })) : [];
      } catch {
        return [];
      }
    }
    return raw.split(';').map(part => {
      const [qty, price] = part.split(':').map(item => item.trim());
      return { minQty: numberValue(qty, null), unitPrice: numberValue(price, null) };
    }).filter(row => row.minQty !== null || row.unitPrice !== null);
  }
  return [];
}

function keyParts(row = {}) {
  return [
    stringValue(row.manufacturer).toLowerCase(),
    stringValue(row.catalogNumber || row.catalog_number || row.partNumber || row.key).toLowerCase(),
    normalizeCategory(row.category || row.productType).toLowerCase(),
  ];
}

function mergeKey(row = {}) {
  return keyParts(row).join('|');
}

function estimateKey(row = {}) {
  return [
    normalizeCategory(row.category).toLowerCase(),
    stringValue(row.catalogNumber || row.key || row.estimateKey || row.description).toLowerCase(),
    stringValue(row.uom || row.unit).toLowerCase(),
  ].join('|');
}

function isApproved(row = {}) {
  return row.approved === true || /^(approved|active|accepted)$/i.test(row.approvalStatus || '');
}

function referenceDate(options = {}) {
  const value = options.asOf || options.generatedAt || new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function daysBetween(fromDate, toDate) {
  if (!fromDate) return null;
  const parsed = new Date(fromDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return (toDate.getTime() - parsed.getTime()) / 86400000;
}

function isExpired(row = {}, options = {}) {
  if (!row.expiresAt) return false;
  const expires = new Date(row.expiresAt);
  if (Number.isNaN(expires.getTime())) return true;
  return expires.getTime() < referenceDate(options).getTime();
}

function isStale(row = {}, options = {}) {
  const maxAgeDays = options.maxAgeDays ?? 180;
  if (!row.lastVerified && !row.quoteDate) return row.sourceType !== 'genericDefault';
  const age = daysBetween(row.lastVerified || row.quoteDate, referenceDate(options));
  return age === null ? true : age > maxAgeDays;
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function csvEscape(value = '') {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function normalizePricingFeedDescriptor(input = {}) {
  const source = asObject(input);
  const sourceType = normalizeSourceType(source.sourceType || source.type || source.kind);
  const sourceName = stringValue(source.sourceName || source.name || source.vendor || source.distributor || source.provider);
  return JSON.parse(JSON.stringify({
    ...source,
    id: stringValue(source.id) || `pricing-feed-${slug(`${sourceType}-${sourceName || source.connectorType || 'local'}`)}`,
    version: stringValue(source.version || PRICING_FEED_GOVERNANCE_VERSION),
    sourceType,
    sourceName,
    sourceUrl: stringValue(source.sourceUrl || source.url),
    contractVersion: stringValue(source.contractVersion || PRICING_FEED_GOVERNANCE_VERSION),
    currency: stringValue(source.currency || 'USD').toUpperCase(),
    region: stringValue(source.region || source.market || ''),
    quoteNumber: stringValue(source.quoteNumber || source.quote_number || source.reference),
    quoteDate: dateValue(source.quoteDate || source.quote_date || source.date),
    expiresAt: dateValue(source.expiresAt || source.expires_at || source.expirationDate),
    verifiedBy: stringValue(source.verifiedBy || source.verified_by || source.reviewer),
    lastVerified: dateValue(source.lastVerified || source.last_verified || source.quoteDate || source.date),
    approvalStatus: normalizeApprovalStatus(source.approvalStatus || source.approval_status, sourceType),
    notes: stringValue(source.notes || source.description),
    warnings: asArray(source.warnings).map(stringValue).filter(Boolean),
  }));
}

export function normalizePricingFeedRow(row = {}, options = {}) {
  const source = asObject(row);
  const descriptor = normalizePricingFeedDescriptor({
    ...(options.descriptor || {}),
    sourceType: source.sourceType || source.source_type || options.sourceType || options.descriptor?.sourceType,
    sourceName: source.sourceName || source.source || options.sourceName || options.descriptor?.sourceName,
    quoteNumber: source.quoteNumber || source.quote_number || options.quoteNumber || options.descriptor?.quoteNumber,
    quoteDate: source.quoteDate || source.quote_date || source.date || options.quoteDate || options.descriptor?.quoteDate,
    expiresAt: source.expiresAt || source.expires_at || options.expiresAt || options.descriptor?.expiresAt,
    currency: source.currency || options.currency || options.descriptor?.currency,
    region: source.region || options.region || options.descriptor?.region,
  });
  const sourceType = normalizeSourceType(source.sourceType || source.source_type || descriptor.sourceType);
  const manufacturer = stringValue(source.manufacturer || source.mfr || source.vendorManufacturer);
  const catalogNumber = stringValue(source.catalogNumber || source.catalog_number || source.catalogNo || source.partNumber || source.part_number || source.sku || source.key);
  const category = normalizeCategory(source.category || source.productType || source.itemCategory);
  const unitPrice = numberValue(source.unitPrice ?? source.unit_price ?? source.price ?? source.materialUnitPrice, null);
  const laborUnitPrice = numberValue(source.laborUnitPrice ?? source.labor_unit_price ?? source.laborPrice, null);
  const approvalStatus = normalizeApprovalStatus(source.approvalStatus || source.approval_status, sourceType);
  const normalized = {
    ...source,
    id: stringValue(source.id) || `pricing-row-${slug(`${descriptor.sourceName}-${manufacturer}-${catalogNumber || source.key || source.description}-${category}`)}`,
    version: stringValue(source.version || PRICING_FEED_GOVERNANCE_VERSION),
    sourceType,
    sourceName: stringValue(source.sourceName || source.source || descriptor.sourceName),
    sourceUrl: stringValue(source.sourceUrl || source.source_url || descriptor.sourceUrl),
    quoteNumber: stringValue(source.quoteNumber || source.quote_number || descriptor.quoteNumber),
    quoteDate: dateValue(source.quoteDate || source.quote_date || source.date || descriptor.quoteDate),
    expiresAt: dateValue(source.expiresAt || source.expires_at || descriptor.expiresAt),
    currency: stringValue(source.currency || descriptor.currency || 'USD').toUpperCase(),
    region: stringValue(source.region || descriptor.region),
    projectId: stringValue(source.projectId || source.project_id),
    manufacturer,
    catalogNumber,
    category,
    description: stringValue(source.description || source.item || source.name || catalogNumber),
    key: stringValue(source.key || catalogNumber || source.description),
    uom: stringValue(source.uom || source.unit || 'ea'),
    unitPrice,
    laborUnitPrice,
    leadTimeDays: numberValue(source.leadTimeDays ?? source.lead_time_days, null),
    minOrderQty: numberValue(source.minOrderQty ?? source.min_order_qty, null),
    priceBreaks: parsePriceBreaks(source.priceBreaks || source.price_breaks),
    escalationPct: numberValue(source.escalationPct ?? source.escalation_pct, 0),
    verifiedBy: stringValue(source.verifiedBy || source.verified_by || descriptor.verifiedBy),
    lastVerified: dateValue(source.lastVerified || source.last_verified || descriptor.lastVerified || source.quoteDate || source.date),
    approvalStatus,
    approved: boolValue(source.approved, /^approved$/i.test(approvalStatus)),
    notes: stringValue(source.notes || source.note),
    warnings: asArray(source.warnings).map(stringValue).filter(Boolean),
  };
  return JSON.parse(JSON.stringify(normalized));
}

export function normalizePricingFeedPackage(input = {}, options = {}) {
  const source = asObject(input);
  const descriptorRows = Array.isArray(source.feedDescriptors)
    ? source.feedDescriptors
    : Array.isArray(source.descriptors)
      ? source.descriptors
      : source.descriptor
        ? [source.descriptor]
        : [];
  const feedDescriptors = descriptorRows.map(normalizePricingFeedDescriptor);
  const rowInput = Array.isArray(input)
    ? input
    : Array.isArray(source.pricingRows)
      ? source.pricingRows
      : Array.isArray(source.rows)
        ? source.rows
        : Array.isArray(source.prices)
          ? source.prices
          : [];
  const defaultDescriptor = feedDescriptors[0] || options.descriptor || {};
  const pricingRows = rowInput.map(row => normalizePricingFeedRow(row, { ...options, descriptor: defaultDescriptor }));
  return {
    version: PRICING_FEED_GOVERNANCE_VERSION,
    sourceVersion: source.version || source.sourceVersion || '',
    feedDescriptors,
    pricingRows,
    summary: {
      descriptorCount: feedDescriptors.length,
      rowCount: pricingRows.length,
      approved: pricingRows.filter(isApproved).length,
      expired: pricingRows.filter(row => isExpired(row, options)).length,
      stale: pricingRows.filter(row => isStale(row, options)).length,
      sourceTypes: [...new Set(pricingRows.map(row => row.sourceType).filter(Boolean))].sort(),
      currencies: [...new Set(pricingRows.map(row => row.currency).filter(Boolean))].sort(),
    },
  };
}

export function validatePricingFeedRow(row = {}, catalogRows = [], options = {}) {
  const source = asObject(row);
  const normalized = normalizePricingFeedRow(row, options);
  const errors = [];
  const warnings = [...normalized.warnings];
  if (!normalized.sourceType) errors.push('sourceType is required');
  if (!PRICING_SOURCE_TYPES.includes(normalized.sourceType)) warnings.push(`sourceType ${normalized.sourceType} is not one of ${PRICING_SOURCE_TYPES.join(', ')}`);
  if (!normalized.sourceName) errors.push('sourceName is required');
  if (!source.currency && !options.currency && !options.descriptor?.currency) errors.push('currency is required');
  if (!normalized.uom) errors.push('uom is required');
  if (normalized.unitPrice === null && normalized.laborUnitPrice === null) errors.push('unitPrice or laborUnitPrice is required');
  if (normalized.unitPrice !== null && normalized.unitPrice < 0) errors.push('unitPrice must be non-negative');
  if (normalized.laborUnitPrice !== null && normalized.laborUnitPrice < 0) errors.push('laborUnitPrice must be non-negative');
  if (!normalized.catalogNumber && !normalized.key) warnings.push('catalogNumber or key should be provided for estimate mapping');
  if (normalized.category === 'custom' && !normalized.description) warnings.push('description should be provided for custom pricing rows');
  if (isExpired(normalized, options)) warnings.push('quote or feed row is expired');
  if (isStale(normalized, options)) warnings.push('pricing verification is stale or missing');
  if (normalized.escalationPct > 10) warnings.push('escalationPct is high and should be reviewed');
  if (normalized.leadTimeDays !== null && normalized.leadTimeDays > 180) warnings.push('leadTimeDays exceeds 180 days');
  const catalog = normalizeProductCatalog(catalogRows).rows;
  if (catalog.length && normalized.manufacturer && normalized.catalogNumber) {
    const match = catalog.find(row => mergeKey(row) === mergeKey(normalized));
    if (!match) warnings.push('pricing row does not match a governed product catalog row');
    if (match && !match.approved) warnings.push('pricing row maps to an unapproved product catalog row');
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    row: {
      ...normalized,
      warnings: [...new Set(warnings)],
    },
  };
}

export function mapPricingRowsToCatalog({ pricingRows = [], catalogRows = [] } = {}) {
  const pricing = normalizePricingFeedPackage({ pricingRows }).pricingRows;
  const catalog = normalizeProductCatalog(catalogRows).rows;
  const catalogByKey = new Map(catalog.map(row => [mergeKey(row), row]));
  const catalogByFallback = new Map();
  catalog.forEach(row => {
    const key = [
      stringValue(row.manufacturer).toLowerCase(),
      normalizeCategory(row.category).toLowerCase(),
      stringValue(row.description || row.series).toLowerCase(),
    ].join('|');
    if (!catalogByFallback.has(key)) catalogByFallback.set(key, row);
  });
  const rows = pricing.map(priceRow => {
    const exact = catalogByKey.get(mergeKey(priceRow));
    const fallback = exact ? null : catalogByFallback.get([
      stringValue(priceRow.manufacturer).toLowerCase(),
      normalizeCategory(priceRow.category).toLowerCase(),
      stringValue(priceRow.description).toLowerCase(),
    ].join('|'));
    const match = exact || fallback || null;
    const warnings = [];
    if (!match && priceRow.manufacturer && priceRow.catalogNumber) warnings.push('No governed catalog row matches this pricing row.');
    if (!match && (!priceRow.manufacturer || !priceRow.catalogNumber)) warnings.push('Pricing row is generic and cannot be mapped to catalog identity.');
    if (match && !match.approved) warnings.push('Matched catalog row is not approved.');
    return {
      pricingRowId: priceRow.id,
      catalogId: match?.id || '',
      manufacturer: priceRow.manufacturer,
      catalogNumber: priceRow.catalogNumber,
      category: priceRow.category,
      sourceName: priceRow.sourceName,
      unitPrice: priceRow.unitPrice,
      currency: priceRow.currency,
      matchType: exact ? 'manufacturerCatalogCategory' : fallback ? 'descriptionCategory' : 'none',
      status: match ? (match.approved ? 'ready' : 'unapprovedCatalog') : 'unmapped',
      warnings,
    };
  });
  return {
    rows,
    summary: {
      total: rows.length,
      ready: rows.filter(row => row.status === 'ready').length,
      unmapped: rows.filter(row => row.status === 'unmapped').length,
      unapprovedCatalog: rows.filter(row => row.status === 'unapprovedCatalog').length,
    },
  };
}

function buildActivePricingMap(pricingRows = [], options = {}) {
  const rows = normalizePricingFeedPackage({ pricingRows }, options).pricingRows;
  const approved = rows.filter(row => isApproved(row) && !isExpired(row, options));
  const byEstimate = new Map();
  approved.forEach(row => {
    const keys = [
      estimateKey(row),
      [normalizeCategory(row.category).toLowerCase(), stringValue(row.key).toLowerCase(), stringValue(row.uom).toLowerCase()].join('|'),
      [normalizeCategory(row.category).toLowerCase(), stringValue(row.catalogNumber).toLowerCase(), stringValue(row.uom).toLowerCase()].join('|'),
      [normalizeCategory(row.category).toLowerCase(), 'default', stringValue(row.uom).toLowerCase()].join('|'),
    ].filter(key => !key.includes('||'));
    keys.forEach(key => {
      if (!byEstimate.has(key)) byEstimate.set(key, []);
      byEstimate.get(key).push(row);
    });
  });
  return byEstimate;
}

function lineItemKeys(item = {}) {
  const category = normalizeCategory(item.category === 'Cable' ? 'cableType' : item.category);
  const unit = stringValue(item.unit || item.uom || 'ea').toLowerCase();
  return [
    [category.toLowerCase(), stringValue(item.id).toLowerCase(), unit].join('|'),
    [category.toLowerCase(), stringValue(item.description).toLowerCase(), unit].join('|'),
    [category.toLowerCase(), stringValue(item.size || item.key).toLowerCase(), unit].join('|'),
    [category.toLowerCase(), 'default', unit].join('|'),
  ];
}

export function buildPricingCoverageRows({ estimateLineItems = [], pricingRows = [], catalogRows = [] } = {}, options = {}) {
  const pricingMap = buildActivePricingMap(pricingRows, options);
  const mappings = mapPricingRowsToCatalog({ pricingRows, catalogRows }).rows;
  const mappingByPrice = new Map(mappings.map(row => [row.pricingRowId, row]));
  return asArray(estimateLineItems).map(item => {
    const matches = lineItemKeys(item).flatMap(key => pricingMap.get(key) || []);
    const selected = matches[0] || null;
    const conflicts = selected ? matches.filter(row => row.id !== selected.id && row.unitPrice !== selected.unitPrice) : [];
    const mapping = selected ? mappingByPrice.get(selected.id) : null;
    const status = selected
      ? conflicts.length
        ? 'conflict'
        : mapping?.status === 'unapprovedCatalog'
          ? 'unapprovedCatalog'
          : isStale(selected, options)
            ? 'stale'
            : 'approvedQuote'
      : Number(item.unitPrice || 0) > 0
        ? 'genericDefault'
        : 'unpriced';
    const warnings = [];
    if (!selected && Number(item.unitPrice || 0) > 0) warnings.push('Estimate line uses generic/default pricing.');
    if (!selected && !Number(item.unitPrice || 0)) warnings.push('Estimate line has no pricing source.');
    if (selected && isStale(selected, options)) warnings.push('Selected pricing row is stale.');
    if (selected && conflicts.length) warnings.push('Multiple approved pricing rows conflict for this estimate line.');
    if (mapping?.status === 'unapprovedCatalog') warnings.push('Selected price maps to an unapproved catalog row.');
    return {
      lineItemId: stringValue(item.id),
      category: stringValue(item.category),
      description: stringValue(item.description),
      quantity: numberValue(item.quantity, 0),
      unit: stringValue(item.unit),
      estimateUnitPrice: numberValue(item.unitPrice, null),
      pricingRowId: selected?.id || '',
      pricingSource: selected?.sourceName || (Number(item.unitPrice || 0) > 0 ? 'generic/default estimate price' : ''),
      sourceType: selected?.sourceType || (Number(item.unitPrice || 0) > 0 ? 'genericDefault' : ''),
      quoteNumber: selected?.quoteNumber || '',
      quoteDate: selected?.quoteDate || '',
      expiresAt: selected?.expiresAt || '',
      currency: selected?.currency || 'USD',
      governedUnitPrice: selected?.unitPrice ?? null,
      catalogStatus: mapping?.status || (selected ? 'unmapped' : ''),
      conflictCount: conflicts.length,
      status,
      warnings,
    };
  });
}

function changedFields(previous = {}, next = {}) {
  const fields = ['unitPrice', 'laborUnitPrice', 'currency', 'uom', 'quoteNumber', 'expiresAt', 'approvalStatus', 'lastVerified'];
  return fields.filter(field => JSON.stringify(previous[field] ?? null) !== JSON.stringify(next[field] ?? null));
}

export function mergePricingFeedRows(existingRows = [], importedRows = [], options = {}) {
  const rowsByKey = new Map();
  const conflicts = [];
  const warnings = [];
  asArray(existingRows).map(row => normalizePricingFeedRow(row, options)).forEach(row => {
    rowsByKey.set(`${mergeKey(row)}|${row.sourceName}|${row.quoteNumber}|${row.uom}`, row);
  });
  asArray(importedRows).map(row => normalizePricingFeedRow(row, options)).forEach(row => {
    const key = `${mergeKey(row)}|${row.sourceName}|${row.quoteNumber}|${row.uom}`;
    if (rowsByKey.has(key)) {
      const previous = rowsByKey.get(key);
      const fields = changedFields(previous, row);
      if (fields.length) {
        conflicts.push({
          key,
          manufacturer: row.manufacturer,
          catalogNumber: row.catalogNumber,
          category: row.category,
          sourceName: row.sourceName,
          quoteNumber: row.quoteNumber,
          changedFields: fields,
        });
        warnings.push(`Pricing row ${row.manufacturer || row.category} ${row.catalogNumber || row.key} changed fields: ${fields.join(', ')}`);
      }
      rowsByKey.set(key, options.preserveExisting ? { ...row, ...previous } : { ...previous, ...row });
    } else {
      rowsByKey.set(key, row);
    }
  });
  const rows = [...rowsByKey.values()].sort((a, b) => `${mergeKey(a)}|${a.sourceName}|${a.quoteNumber}|${a.uom}`.localeCompare(`${mergeKey(b)}|${b.sourceName}|${b.quoteNumber}|${b.uom}`));
  return { rows, conflicts, warnings };
}

export function buildPricingFeedImportTemplate(sourceType = 'vendorQuote') {
  const normalizedSourceType = normalizeSourceType(sourceType);
  const row = Object.fromEntries(SHARED_TEMPLATE_FIELDS.map(field => [field, '']));
  row.sourceType = normalizedSourceType;
  row.currency = 'USD';
  row.approvalStatus = 'unreviewed';
  row.uom = 'ea';
  return {
    version: PRICING_FEED_GOVERNANCE_VERSION,
    sourceType: normalizedSourceType,
    csvHeaders: SHARED_TEMPLATE_FIELDS,
    csv: `${SHARED_TEMPLATE_FIELDS.join(',')}\n${SHARED_TEMPLATE_FIELDS.map(field => csvEscape(row[field])).join(',')}\n`,
    jsonRows: [row],
  };
}

export function buildPricingFeedGovernancePackage(context = {}) {
  const projectName = stringValue(context.projectName || context.name || 'CableTrayRoute Project');
  const normalized = normalizePricingFeedPackage({
    feedDescriptors: context.feedDescriptors || context.descriptors || [],
    pricingRows: context.pricingRows || context.rows || [],
  }, context);
  const pricingRows = normalized.pricingRows;
  const feedDescriptors = normalized.feedDescriptors;
  const catalogRows = context.catalogRows || context.productCatalog || [];
  const estimateLineItems = asArray(context.estimateLineItems || context.lineItems);
  const validations = pricingRows.map(row => validatePricingFeedRow(row, catalogRows, context));
  const invalidRows = validations.filter(row => !row.valid);
  const catalogMappings = mapPricingRowsToCatalog({ pricingRows, catalogRows });
  const estimateCoverageRows = buildPricingCoverageRows({ estimateLineItems, pricingRows, catalogRows }, context);
  const merged = mergePricingFeedRows([], pricingRows, context);
  const staleRows = pricingRows.filter(row => isStale(row, context));
  const expiredRows = pricingRows.filter(row => isExpired(row, context));
  const conflictRows = [
    ...merged.conflicts,
    ...estimateCoverageRows.filter(row => row.status === 'conflict'),
  ];
  const unpricedRows = estimateCoverageRows.filter(row => row.status === 'unpriced' || row.status === 'genericDefault');
  const warningRows = [
    ...invalidRows.flatMap(row => row.errors.map(error => ({ code: 'invalid-pricing-row', severity: 'error', sourceId: row.row.id, message: `${row.row.description || row.row.id}: ${error}` }))),
    ...validations.flatMap(row => row.warnings.map(warning => ({ code: 'pricing-row-review', severity: /expired|stale|unapproved|missing|does not match/i.test(warning) ? 'warning' : 'info', sourceId: row.row.id, message: `${row.row.description || row.row.id}: ${warning}` }))),
    ...catalogMappings.rows.flatMap(row => row.warnings.map(warning => ({ code: 'catalog-mapping-review', severity: row.status === 'unmapped' ? 'warning' : 'info', sourceId: row.pricingRowId, message: `${row.manufacturer || row.category} ${row.catalogNumber || ''}: ${warning}` }))),
    ...estimateCoverageRows.flatMap(row => row.warnings.map(warning => ({ code: 'estimate-pricing-coverage', severity: row.status === 'unpriced' ? 'error' : 'warning', sourceId: row.lineItemId, message: `${row.lineItemId || row.description}: ${warning}` }))),
  ];
  return {
    version: PRICING_FEED_GOVERNANCE_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName,
    summary: {
      descriptorCount: feedDescriptors.length,
      pricingRowCount: pricingRows.length,
      approvedRowCount: pricingRows.filter(isApproved).length,
      staleRowCount: staleRows.length,
      expiredRowCount: expiredRows.length,
      catalogMappedCount: catalogMappings.summary.ready,
      estimateLineCount: estimateCoverageRows.length,
      unpricedLineCount: unpricedRows.length,
      conflictCount: conflictRows.length,
      warningCount: warningRows.length,
      status: invalidRows.length || unpricedRows.some(row => row.status === 'unpriced') || conflictRows.length
        ? 'action-required'
        : warningRows.length
          ? 'review'
          : 'ready',
    },
    feedDescriptors,
    pricingRows,
    catalogMappings,
    estimateCoverageRows,
    staleRows,
    expiredRows,
    conflictRows,
    unpricedRows,
    warningRows,
    importTemplates: Object.fromEntries(PRICING_SOURCE_TYPES.map(type => [type, buildPricingFeedImportTemplate(type)])),
    warnings: warningRows.map(row => row.message),
    assumptions: [
      'Pricing feed governance is local estimate-basis metadata, not live procurement or quote acceptance.',
      'CableTrayRoute does not fetch live manufacturer/distributor pricing or ship licensed pricing datasets in this workflow.',
      'Imported vendor, distributor, RS Means, and manual price rows require project-specific commercial verification.',
      'Approved pricing rows can be used as estimator inputs only after the user explicitly selects the governed pricing action.',
    ],
  };
}

export function renderPricingFeedGovernanceHTML(pkg = {}) {
  const rows = asArray(pkg.pricingRows);
  const coverageRows = asArray(pkg.estimateCoverageRows);
  const warnings = asArray(pkg.warningRows);
  return `<section class="report-section" id="rpt-pricing-feed-governance">
  <h2>Pricing Feed and Quote Governance</h2>
  <p class="report-note">Local pricing-source governance for estimate traceability. Live manufacturer and distributor APIs remain outside this package and require commercial data agreements.</p>
  <dl class="report-dl">
    <dt>Pricing Rows</dt><dd>${escapeHtml(pkg.summary?.pricingRowCount || 0)}</dd>
    <dt>Approved Rows</dt><dd>${escapeHtml(pkg.summary?.approvedRowCount || 0)}</dd>
    <dt>Stale Rows</dt><dd>${escapeHtml(pkg.summary?.staleRowCount || 0)}</dd>
    <dt>Expired Rows</dt><dd>${escapeHtml(pkg.summary?.expiredRowCount || 0)}</dd>
    <dt>Unpriced Lines</dt><dd>${escapeHtml(pkg.summary?.unpricedLineCount || 0)}</dd>
    <dt>Status</dt><dd>${escapeHtml(pkg.summary?.status || 'review')}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Source</th><th>Quote</th><th>Manufacturer</th><th>Catalog #</th><th>Category</th><th>Description</th><th>UOM</th><th>Unit Price</th><th>Approval</th><th>Expires</th></tr></thead>
      <tbody>${rows.slice(0, 60).map(row => `<tr>
        <td>${escapeHtml(row.sourceName)}</td>
        <td>${escapeHtml(row.quoteNumber || 'n/a')}</td>
        <td>${escapeHtml(row.manufacturer || 'generic')}</td>
        <td>${escapeHtml(row.catalogNumber || row.key || 'n/a')}</td>
        <td>${escapeHtml(row.category)}</td>
        <td>${escapeHtml(row.description)}</td>
        <td>${escapeHtml(row.uom)}</td>
        <td>${escapeHtml(row.unitPrice ?? row.laborUnitPrice ?? '')} ${escapeHtml(row.currency)}</td>
        <td>${escapeHtml(row.approvalStatus)}</td>
        <td>${escapeHtml(row.expiresAt || 'not set')}</td>
      </tr>`).join('') || '<tr><td colspan="10">No pricing feed rows.</td></tr>'}</tbody>
    </table>
  </div>
  <h3>Estimate Coverage</h3>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Line Item</th><th>Category</th><th>Pricing Source</th><th>Status</th><th>Unit Price</th><th>Warnings</th></tr></thead>
      <tbody>${coverageRows.slice(0, 75).map(row => `<tr>
        <td>${escapeHtml(row.lineItemId || row.description)}</td>
        <td>${escapeHtml(row.category)}</td>
        <td>${escapeHtml(row.pricingSource || 'n/a')}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.governedUnitPrice ?? row.estimateUnitPrice ?? '')} ${escapeHtml(row.currency || '')}</td>
        <td>${escapeHtml(asArray(row.warnings).join('; '))}</td>
      </tr>`).join('') || '<tr><td colspan="6">No estimate line items were supplied for pricing coverage.</td></tr>'}</tbody>
    </table>
  </div>
  ${warnings.length ? `<h3>Pricing Governance Warnings</h3>
  <ul>${warnings.slice(0, 25).map(row => `<li>${escapeHtml(row.message || row)}</li>`).join('')}</ul>` : '<p class="report-empty">No pricing governance warnings detected.</p>'}
</section>`;
}

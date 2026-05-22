/**
 * Governed manufacturer catalog helpers.
 *
 * The catalog layer normalizes legacy SKU-style rows and newer governed
 * product rows into one shape that downstream BOM, submittal, BIM, and report
 * flows can trust.
 */

export const CATALOG_SCHEMA_VERSION = 2;

export const APPROVAL_STATUSES = new Set([
  'approved',
  'conditional',
  'rejected',
  'unreviewed'
]);

const GENERIC_MANUFACTURERS = new Set([
  '',
  'generic',
  'n/a',
  'na',
  'none',
  'tbd',
  'unknown',
  'unspecified'
]);

function cleanText(value) {
  return String(value ?? '').trim();
}

function cleanDate(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function toNumberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = cleanText(value).toLowerCase();
  if (['true', 'yes', 'y', '1', 'approved'].includes(text)) return true;
  if (['false', 'no', 'n', '0', 'rejected', 'unreviewed'].includes(text)) return false;
  return false;
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(cleanText).filter(Boolean))];
  }
  if (typeof value === 'string') {
    return [...new Set(value.split(/[;,]/).map(cleanText).filter(Boolean))];
  }
  return [];
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeStatus(product, approved) {
  const approval = normalizeObject(product.approval);
  const raw = cleanText(
    approval.status
      ?? product.approvalStatus
      ?? product.approval_status
      ?? product.catalogApprovalStatus
      ?? ''
  ).toLowerCase();
  if (APPROVAL_STATUSES.has(raw)) return raw;
  return approved ? 'approved' : 'unreviewed';
}

function inferStandards(product) {
  const standards = normalizeArray(product.standards);
  if (product.nec_listed === true || product.necListed === true) standards.push('NEC listed');
  if (product.ul_classified === true || product.ulClassified === true) standards.push('UL classified');
  return [...new Set(standards)];
}

function buildIdentity(manufacturer, catalogNumber, fallbackId) {
  const mfr = cleanText(manufacturer).toLowerCase();
  const catalog = cleanText(catalogNumber).toLowerCase();
  if (mfr && catalog) return `${mfr}::${catalog}`;
  return cleanText(fallbackId).toLowerCase();
}

export function catalogIdentity(product) {
  const normalized = normalizeCatalogProduct(product);
  if (!normalized) return '';
  return buildIdentity(normalized.manufacturer, normalized.catalogNumber, normalized.id);
}

export function normalizeCatalogProduct(product, options = {}) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) return null;

  const manufacturer = cleanText(product.manufacturer ?? product.mfr ?? product.vendor);
  const catalogNumber = cleanText(
    product.catalogNumber
      ?? product.catalog_number
      ?? product.partNumber
      ?? product.part_number
      ?? product.sku
      ?? product.model
      ?? product.id
  );
  const id = cleanText(product.id) || [manufacturer, catalogNumber].filter(Boolean).join(' ');
  if (!id && !catalogNumber) return null;

  const approval = normalizeObject(product.approval);
  const approved = toBoolean(
    product.approved
      ?? product.approved_part
      ?? product.catalog_approved
      ?? product.catalogApproved
      ?? approval.status
  );
  const approvalStatus = normalizeStatus(product, approved);
  const listPriceUsd = toNumberOrNull(
    product.listPriceUsd
      ?? product.list_price_usd
      ?? product.unitPriceUsd
      ?? product.unit_price_usd
  );

  const dimensions = {
    ...normalizeObject(product.dimensions),
    widthIn: toNumberOrNull(product.dimensions?.widthIn ?? product.width_in ?? product.widthIn),
    depthIn: toNumberOrNull(product.dimensions?.depthIn ?? product.depth_in ?? product.depthIn),
    angleDeg: toNumberOrNull(product.dimensions?.angleDeg ?? product.angle_deg ?? product.angleDeg),
    weightLb: toNumberOrNull(product.dimensions?.weightLb ?? product.weight_lb ?? product.weightLb)
  };

  Object.keys(dimensions).forEach((key) => {
    if (dimensions[key] === null || dimensions[key] === undefined || dimensions[key] === '') delete dimensions[key];
  });

  const ratings = {
    ...normalizeObject(product.ratings),
    loadClass: cleanText(product.ratings?.loadClass ?? product.load_class ?? product.loadClass),
    necListed: toBoolean(product.ratings?.necListed ?? product.nec_listed ?? product.necListed),
    ulClassified: toBoolean(product.ratings?.ulClassified ?? product.ul_classified ?? product.ulClassified)
  };

  if (!ratings.loadClass) delete ratings.loadClass;

  const commercial = {
    ...normalizeObject(product.commercial),
    unit: cleanText(product.commercial?.unit ?? product.unit ?? 'EA') || 'EA',
    listPriceUsd
  };
  if (commercial.listPriceUsd === null) delete commercial.listPriceUsd;

  const bimRef = {
    ...normalizeObject(product.bimRef ?? product.bim_ref),
    familyName: cleanText(product.bimRef?.familyName ?? product.bim_ref?.familyName ?? product.bim_family ?? product.bimFamily),
    typeName: cleanText(product.bimRef?.typeName ?? product.bim_ref?.typeName ?? product.bim_type ?? product.bimType ?? catalogNumber),
    classification: cleanText(product.bimRef?.classification ?? product.bim_ref?.classification ?? product.classification)
  };
  Object.keys(bimRef).forEach((key) => {
    if (bimRef[key] === '') delete bimRef[key];
  });

  const lastVerified = cleanDate(
    product.lastVerified
      ?? product.last_verified
      ?? product.verifiedAt
      ?? product.verified_at
      ?? approval.lastVerified
  );

  return {
    ...product,
    schemaVersion: CATALOG_SCHEMA_VERSION,
    id,
    manufacturer,
    catalogNumber,
    catalog_number: catalogNumber,
    partNumber: cleanText(product.partNumber ?? product.part_number ?? catalogNumber),
    series: cleanText(product.series),
    category: cleanText(product.category),
    subcategory: cleanText(product.subcategory),
    description: cleanText(product.description),
    material: cleanText(product.material),
    finish: cleanText(product.finish),
    unit: commercial.unit,
    list_price_usd: commercial.listPriceUsd ?? 0,
    standards: inferStandards(product),
    ratings,
    dimensions,
    commercial,
    bimRef,
    datasheetUrl: cleanText(product.datasheetUrl ?? product.datasheet_url ?? product.url),
    approved: approvalStatus === 'approved',
    approved_part: approvalStatus === 'approved',
    approval: {
      status: approvalStatus,
      authority: cleanText(approval.authority ?? product.approvalAuthority ?? product.approval_authority),
      approvedBy: cleanText(approval.approvedBy ?? product.approvedBy ?? product.approved_by),
      approvedAt: cleanDate(approval.approvedAt ?? product.approvedAt ?? product.approved_at),
      notes: cleanText(approval.notes ?? product.approvalNotes ?? product.approval_notes)
    },
    source: cleanText(product.source ?? product.catalog_source ?? options.source),
    lastVerified
  };
}

export function validateCatalogProduct(product, options = {}) {
  const normalized = normalizeCatalogProduct(product, options);
  const errors = [];
  const warnings = [];

  if (!normalized) {
    return {
      valid: false,
      product: null,
      errors: [{ path: '', message: 'Catalog product must be an object with a catalog number or id.' }],
      warnings
    };
  }

  ['manufacturer', 'catalogNumber', 'category', 'description'].forEach((field) => {
    if (!cleanText(normalized[field])) {
      errors.push({ path: field, message: `${field} is required for governed catalog rows.` });
    }
  });

  if (!cleanText(normalized.unit)) {
    errors.push({ path: 'unit', message: 'unit is required for BOM and estimating output.' });
  }

  if (normalized.approved) {
    if (!cleanText(normalized.source)) {
      errors.push({ path: 'source', message: 'Approved catalog rows must include a source.' });
    }
    if (!normalized.lastVerified) {
      errors.push({ path: 'lastVerified', message: 'Approved catalog rows must include lastVerified as YYYY-MM-DD.' });
    }
    if (!normalized.approval.authority && options.requireApprovalAuthority !== false) {
      warnings.push({ path: 'approval.authority', message: 'Approved catalog rows should name the approving authority.' });
    }
  }

  if (normalized.datasheetUrl && !/^https?:\/\//i.test(normalized.datasheetUrl)) {
    warnings.push({ path: 'datasheetUrl', message: 'datasheetUrl should be an absolute HTTP(S) URL.' });
  }

  if (normalized.standards.length === 0) {
    warnings.push({ path: 'standards', message: 'Catalog row has no standards/listing metadata.' });
  }

  return {
    valid: errors.length === 0,
    product: normalized,
    errors,
    warnings
  };
}

export function validateCatalog(products, options = {}) {
  const rows = Array.isArray(products) ? products : [];
  const seen = new Map();
  const errors = [];
  const warnings = [];
  const normalizedProducts = [];

  rows.forEach((row, index) => {
    const result = validateCatalogProduct(row, options);
    if (result.product) {
      normalizedProducts.push(result.product);
      const key = catalogIdentity(result.product);
      if (key && seen.has(key)) {
        warnings.push({
          path: `products[${index}]`,
          message: `Duplicate manufacturer/catalog number also appears at products[${seen.get(key)}].`
        });
      } else if (key) {
        seen.set(key, index);
      }
    }
    result.errors.forEach(error => errors.push({ ...error, path: `products[${index}].${error.path}`.replace(/\.$/, '') }));
    result.warnings.forEach(warning => warnings.push({ ...warning, path: `products[${index}].${warning.path}`.replace(/\.$/, '') }));
  });

  return {
    valid: errors.length === 0,
    products: normalizedProducts,
    errors,
    warnings
  };
}

function mergeProduct(existing, next) {
  const merged = normalizeCatalogProduct({
    ...existing,
    ...next,
    standards: [...new Set([...(existing.standards || []), ...(next.standards || [])])],
    ratings: { ...(existing.ratings || {}), ...(next.ratings || {}) },
    dimensions: { ...(existing.dimensions || {}), ...(next.dimensions || {}) },
    commercial: { ...(existing.commercial || {}), ...(next.commercial || {}) },
    bimRef: { ...(existing.bimRef || {}), ...(next.bimRef || {}) },
    approval: { ...(existing.approval || {}), ...(next.approval || {}) }
  });
  return merged || next || existing;
}

export function mergeCatalogProducts(baseProducts = [], projectProducts = []) {
  const byIdentity = new Map();
  const merged = [];

  [...baseProducts, ...projectProducts].forEach((raw) => {
    const product = normalizeCatalogProduct(raw);
    if (!product) return;
    const key = catalogIdentity(product);
    const existingIndex = byIdentity.get(key);
    if (existingIndex === undefined) {
      byIdentity.set(key, merged.length);
      merged.push(product);
      return;
    }
    merged[existingIndex] = mergeProduct(merged[existingIndex], product);
  });

  return merged;
}

export function filterCatalogProducts(products = [], filters = {}) {
  return (Array.isArray(products) ? products : [])
    .map(product => normalizeCatalogProduct(product))
    .filter(Boolean)
    .filter((product) => {
      if (filters.approvedOnly && !product.approved) return false;
      if (filters.category && product.category !== filters.category) return false;
      if (filters.subcategory && product.subcategory !== filters.subcategory) return false;
      if (filters.manufacturer && !product.manufacturer.toLowerCase().includes(String(filters.manufacturer).toLowerCase())) return false;
      if (filters.widthIn != null && product.dimensions.widthIn !== Number(filters.widthIn)) return false;
      if (filters.depthIn != null && product.dimensions.depthIn !== Number(filters.depthIn)) return false;
      if (filters.material && product.material !== filters.material) return false;
      if (filters.search) {
        const q = String(filters.search).toLowerCase();
        const searchable = [
          product.id,
          product.catalogNumber,
          product.description,
          product.series,
          product.manufacturer,
          product.category,
          product.subcategory
        ].join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
}

export function getCatalogOptionsFromProducts(products = [], field) {
  return [...new Set((Array.isArray(products) ? products : [])
    .map(product => normalizeCatalogProduct(product))
    .filter(Boolean)
    .map((product) => {
      if (field === 'approvalStatus') return product.approval.status;
      if (field === 'widthIn') return product.dimensions.widthIn;
      if (field === 'depthIn') return product.dimensions.depthIn;
      return product[field];
    })
    .filter(value => value !== undefined && value !== null && value !== ''))]
    .map(String)
    .sort();
}

export function buildBomCatalogFields(record = {}) {
  const product = normalizeCatalogProduct(record) || {};
  return {
    manufacturer: product.manufacturer || cleanText(record.manufacturer),
    catalogNumber: product.catalogNumber || cleanText(record.catalogNumber ?? record.catalog_number ?? record.part_number ?? record.model),
    model: cleanText(record.model ?? product.model),
    approvedPart: Boolean(product.approved || record.approved_part || record.catalog_approved),
    approvalStatus: product.approval?.status || cleanText(record.approvalStatus ?? record.approval_status) || 'unreviewed',
    source: product.source || cleanText(record.catalog_source),
    lastVerified: product.lastVerified || cleanText(record.catalog_last_verified),
    datasheetUrl: product.datasheetUrl || cleanText(record.datasheet_url ?? record.url),
    bimRef: product.bimRef && Object.keys(product.bimRef).length ? product.bimRef : normalizeObject(record.bimRef ?? record.bim_ref),
    standards: Array.isArray(product.standards) ? product.standards : []
  };
}

function recordIdentity(record = {}) {
  return cleanText(
    record.tag
      ?? record.cable_tag
      ?? record.tray_id
      ?? record.conduit_id
      ?? record.id
      ?? record.ref
      ?? record.description
      ?? 'Catalog item'
  );
}

function hasGenericManufacturer(manufacturer) {
  return GENERIC_MANUFACTURERS.has(cleanText(manufacturer).toLowerCase());
}

export function buildCatalogWarnings(records = [], catalogProducts = [], options = {}) {
  const catalog = Array.isArray(catalogProducts)
    ? catalogProducts.map(product => normalizeCatalogProduct(product)).filter(Boolean)
    : [];
  const catalogByIdentity = new Map(catalog.map(product => [catalogIdentity(product), product]));
  const catalogById = new Map(catalog.map(product => [cleanText(product.id).toLowerCase(), product]));
  const shouldCheckUnknownCatalog = catalog.length > 0 || options.checkUnknownCatalog === true;

  return (Array.isArray(records) ? records : []).flatMap((record, index) => {
    const fields = buildBomCatalogFields(record);
    const id = recordIdentity(record);
    const warnings = [];

    if (hasGenericManufacturer(fields.manufacturer) || !fields.catalogNumber) {
      warnings.push({
        index,
        id,
        code: 'missing-catalog-selection',
        severity: 'warning',
        message: `${id} is missing governed manufacturer/catalog selection.`
      });
      return warnings;
    }

    const key = buildIdentity(fields.manufacturer, fields.catalogNumber, fields.catalogNumber);
    const product = catalogByIdentity.get(key) || catalogById.get(fields.catalogNumber.toLowerCase()) || null;

    if (shouldCheckUnknownCatalog && !product) {
      warnings.push({
        index,
        id,
        code: 'unknown-catalog-selection',
        severity: 'warning',
        message: `${id} references ${fields.manufacturer} ${fields.catalogNumber}, which is not in the approved catalog.`
      });
      return warnings;
    }

    const approvalStatus = product?.approval?.status || fields.approvalStatus;
    const approved = product ? product.approved : fields.approvedPart;
    if (!approved || approvalStatus !== 'approved') {
      warnings.push({
        index,
        id,
        code: 'unapproved-catalog-selection',
        severity: 'warning',
        message: `${id} uses ${fields.manufacturer} ${fields.catalogNumber}, but the catalog status is ${approvalStatus || 'unreviewed'}.`
      });
    }

    if ((product || fields.approvedPart) && !fields.lastVerified && !product?.lastVerified) {
      warnings.push({
        index,
        id,
        code: 'missing-catalog-verification',
        severity: 'warning',
        message: `${id} uses a catalog part without last-verified metadata.`
      });
    }

    return warnings;
  });
}

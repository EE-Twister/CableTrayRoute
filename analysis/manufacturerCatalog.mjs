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

export const CATALOG_CONFIDENCE_STATUS = Object.freeze({
  complete: 'complete',
  review: 'review',
  incomplete: 'incomplete'
});

export const CATALOG_EVIDENCE_STATUS = Object.freeze({
  sourceVerified: 'source_verified',
  screening: 'screening'
});

const CATALOG_EVIDENCE_STATUS_VALUES = new Set(Object.values(CATALOG_EVIDENCE_STATUS));
const HEAT_TRACE_TYPES = new Set(['selfRegulating', 'constantWattage', 'mineralInsulated']);
const PROTECTIVE_DEVICE_TYPES = new Set(['breaker', 'fuse', 'relay', 'relay_87', 'recloser', 'contactor', 'switch']);

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
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day) {
    return '';
  }
  return text;
}

export function normalizeCatalogDate(value) {
  return cleanDate(value);
}

function cleanUrl(value) {
  return cleanText(value);
}

function toNumberOrNull(value) {
  if (cleanText(value) === '') return null;
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

function hasObjectValues(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).some(item => cleanText(item) !== '');
}

function hasBimEvidence(bimRef, catalogNumber = '') {
  if (!hasObjectValues(bimRef)) return false;
  if (cleanText(bimRef.familyName) || cleanText(bimRef.classification) || cleanText(bimRef.url)) return true;
  const typeName = cleanText(bimRef.typeName);
  return !!typeName && typeName.toLowerCase() !== cleanText(catalogNumber).toLowerCase();
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

function hasPositiveHeatTraceVoltages(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(/[;,\s]+/);
  return values.some(item => Number.isFinite(Number(item)) && Number(item) > 0);
}

function hasHeatTraceCircuitLengths(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.values(value).some(item => Number.isFinite(Number(item)) && Number(item) > 0);
  }
  return String(value ?? '').split(/[;,]+/).some((pair) => {
    const [, length] = pair.split(':');
    return Number.isFinite(Number(length)) && Number(length) > 0;
  });
}

function normalizeEvidenceStatus(product) {
  const raw = cleanText(
    product.evidenceStatus
      ?? product.evidence_status
      ?? product.catalogEvidenceStatus
      ?? ''
  ).toLowerCase();
  return CATALOG_EVIDENCE_STATUS_VALUES.has(raw)
    ? raw
    : CATALOG_EVIDENCE_STATUS.screening;
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
  const evidenceStatus = normalizeEvidenceStatus(product);
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
    classification: cleanText(product.bimRef?.classification ?? product.bim_ref?.classification ?? product.classification),
    url: cleanUrl(product.bimRef?.url ?? product.bim_ref?.url ?? product.bim_url ?? product.bimUrl)
  };
  Object.keys(bimRef).forEach((key) => {
    if (bimRef[key] === '') delete bimRef[key];
  });

  const epd = {
    ...normalizeObject(product.epd),
    source: cleanText(product.epd?.source ?? product.epdSource ?? product.epd_source),
    validUntil: cleanDate(product.epd?.validUntil ?? product.epdValidUntil ?? product.epd_valid_until),
    co2eKgPerUnit: toNumberOrNull(product.epd?.co2eKgPerUnit ?? product.co2eKgPerUnit ?? product.co2e_kg_per_unit)
  };
  Object.keys(epd).forEach((key) => {
    if (epd[key] === null || epd[key] === undefined || epd[key] === '') delete epd[key];
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
    list_price_usd: commercial.listPriceUsd,
    standards: inferStandards(product),
    ratings,
    dimensions,
    commercial,
    bimRef,
    datasheetUrl: cleanUrl(product.datasheetUrl ?? product.datasheet_url ?? product.url),
    epd,
    epdSource: epd.source || '',
    epdValidUntil: epd.validUntil || '',
    co2eKgPerUnit: epd.co2eKgPerUnit,
    approved: approvalStatus === 'approved',
    approved_part: approvalStatus === 'approved',
    evidenceStatus,
    evidence_status: evidenceStatus,
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

  if (normalized.category === 'heat_trace') {
    const type = cleanText(normalized.heat_trace_type ?? normalized.type);
    const voltages = normalized.heat_trace_voltages ?? normalized.voltages;
    const nominalWPerFt = Number(normalized.heat_trace_nominal_w_per_ft ?? normalized.nominalWPerFt);
    const maxCircuitLengths = normalized.heat_trace_max_circuit_lengths ?? normalized.maxCircuitLengthFt;
    if (!HEAT_TRACE_TYPES.has(type)) {
      errors.push({ path: 'heat_trace_type', message: 'heat_trace rows require Heat Trace Type (selfRegulating, constantWattage, or mineralInsulated).' });
    }
    if (!hasPositiveHeatTraceVoltages(voltages)) {
      errors.push({ path: 'heat_trace_voltages', message: 'heat_trace rows require one or more positive Heat Trace Voltages.' });
    }
    if (!Number.isFinite(nominalWPerFt) || nominalWPerFt <= 0) {
      errors.push({ path: 'heat_trace_nominal_w_per_ft', message: 'heat_trace rows require a positive Heat Trace Nominal W/ft.' });
    }
    if (!hasHeatTraceCircuitLengths(maxCircuitLengths)) {
      errors.push({ path: 'heat_trace_max_circuit_lengths', message: 'heat_trace rows require Heat Trace Max Circuit Lengths as voltage:length pairs.' });
    }
  }

  if (normalized.category === 'cable') {
    const conductorCount = Number(normalized.cable_conductors ?? normalized.conductors);
    const voltageRating = Number(normalized.cable_voltage_rating ?? normalized.cable_rating);
    if (!cleanText(normalized.cable_conductor_size ?? normalized.conductor_size)) {
      errors.push({ path: 'cable_conductor_size', message: 'cable rows require Cable Conductor Size.' });
    }
    if (!cleanText(normalized.cable_conductor_material ?? normalized.conductor_material)) {
      errors.push({ path: 'cable_conductor_material', message: 'cable rows require Cable Conductor Material.' });
    }
    if (!cleanText(normalized.cable_insulation_type ?? normalized.insulation_type)) {
      errors.push({ path: 'cable_insulation_type', message: 'cable rows require Cable Insulation Type.' });
    }
    if (!Number.isFinite(conductorCount) || conductorCount <= 0) {
      errors.push({ path: 'cable_conductors', message: 'cable rows require a positive Cable Conductors count.' });
    }
    if (!Number.isFinite(voltageRating) || voltageRating <= 0) {
      errors.push({ path: 'cable_voltage_rating', message: 'cable rows require a positive Cable Voltage Rating.' });
    }
  }

  if (normalized.category === 'protective_device') {
    const type = cleanText(normalized.protective_device_type ?? normalized.device_type ?? normalized.type).toLowerCase();
    const curve = cleanText(normalized.protective_device_curve ?? normalized.curve);
    const ratings = cleanText(normalized.protective_device_interrupting_ratings ?? normalized.interruptingRatings);
    if (!PROTECTIVE_DEVICE_TYPES.has(type)) {
      errors.push({ path: 'protective_device_type', message: 'protective_device rows require Protective Device Type (breaker, fuse, relay, relay_87, recloser, contactor, or switch).' });
    }
    if (curve.split(/[;\n]+/).filter(Boolean).length < 2) {
      errors.push({ path: 'protective_device_curve', message: 'protective_device rows require at least two Curve Points as current:time pairs.' });
    }
    if (type !== 'relay' && !ratings.split(/[;\n]+/).some(pair => {
      const [voltage, current] = pair.split(/[:@]/, 2).map(Number);
      return voltage > 0 && current > 0;
    })) {
      errors.push({ path: 'protective_device_interrupting_ratings', message: 'Non-relay protective_device rows require Interrupting Ratings as voltage:kA pairs.' });
    }
    if (normalized.evidenceStatus === CATALOG_EVIDENCE_STATUS.sourceVerified) {
      ['protective_device_curve_document', 'protective_device_curve_revision', 'protective_device_curve_id', 'protective_device_curve_extraction_method'].forEach((field) => {
        if (!cleanText(normalized[field])) {
          errors.push({ path: field, message: `Source-verified protective_device rows require ${field.replaceAll('_', ' ')}.` });
        }
      });
    }
    if (cleanText(normalized.protective_device_library_status).toLowerCase() === 'calculation_ready'
      && normalized.evidenceStatus !== CATALOG_EVIDENCE_STATUS.sourceVerified) {
      errors.push({ path: 'protective_device_library_status', message: 'Calculation-ready protective_device rows must be source-verified catalog rows.' });
    }
  }

  if (normalized.evidenceStatus === CATALOG_EVIDENCE_STATUS.sourceVerified) {
    if (hasGenericManufacturer(normalized.manufacturer) || !normalized.catalogNumber) {
      errors.push({ path: 'evidenceStatus', message: 'Source-verified catalog rows require a manufacturer and catalog number.' });
    }
    if (!normalized.source) {
      errors.push({ path: 'source', message: 'Source-verified catalog rows require a manufacturer source.' });
    }
    if (!normalized.lastVerified) {
      errors.push({ path: 'lastVerified', message: 'Source-verified catalog rows require lastVerified as YYYY-MM-DD.' });
    }
    if (!normalized.datasheetUrl) {
      errors.push({ path: 'datasheetUrl', message: 'Source-verified catalog rows require a manufacturer product or datasheet URL.' });
    }
  }

  if (normalized.datasheetUrl && !/^https?:\/\//i.test(normalized.datasheetUrl)) {
    warnings.push({ path: 'datasheetUrl', message: 'datasheetUrl should be an absolute HTTP(S) URL.' });
  }

  if (normalized.bimRef?.url && !/^https?:\/\//i.test(normalized.bimRef.url)) {
    warnings.push({ path: 'bimRef.url', message: 'bimRef.url should be an absolute HTTP(S) URL.' });
  }

  if (normalized.standards.length === 0) {
    warnings.push({ path: 'standards', message: 'Catalog row has no standards/listing metadata.' });
  }

  if (normalized.co2eKgPerUnit != null && normalized.co2eKgPerUnit < 0) {
    errors.push({ path: 'co2eKgPerUnit', message: 'co2eKgPerUnit must be non-negative when provided.' });
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
    epd: { ...(existing.epd || {}), ...(next.epd || {}) },
    approval: { ...(existing.approval || {}), ...(next.approval || {}) }
  });
  return merged || next || existing;
}

export function mergeCatalogProducts(baseProducts = [], projectProducts = [], options = {}) {
  const byIdentity = new Map();
  const merged = [];

  const append = (raw, allowOverride) => {
    const product = normalizeCatalogProduct(raw);
    if (!product) return;
    const key = catalogIdentity(product);
    const existingIndex = byIdentity.get(key);
    if (existingIndex === undefined) {
      byIdentity.set(key, merged.length);
      merged.push(product);
      return;
    }
    if (allowOverride) {
      merged[existingIndex] = mergeProduct(merged[existingIndex], product);
    }
  };

  (Array.isArray(baseProducts) ? baseProducts : []).forEach(product => append(product, false));
  const allowProjectOverrides = options.allowProjectOverrides === true;
  (Array.isArray(projectProducts) ? projectProducts : [])
    .forEach(product => append(product, allowProjectOverrides));

  return merged;
}

/**
 * Insert or replace a product in a catalog list, matching on the governed
 * manufacturer/catalog identity. Returns a new array; the input is untouched.
 */
export function upsertCatalogProduct(products = [], product) {
  const normalized = normalizeCatalogProduct(product);
  const list = (Array.isArray(products) ? products : [])
    .map(row => normalizeCatalogProduct(row))
    .filter(Boolean);
  if (!normalized) return list;
  const key = catalogIdentity(normalized);
  const index = list.findIndex(row => catalogIdentity(row) === key);
  if (index === -1) return [...list, normalized];
  const next = [...list];
  next[index] = mergeProduct(next[index], normalized);
  return next;
}

/**
 * Remove a product from a catalog list. `target` may be a product object, a
 * catalog identity string (`manufacturer::catalogNumber`), or a row id.
 */
export function removeCatalogProduct(products = [], target) {
  const list = (Array.isArray(products) ? products : [])
    .map(row => normalizeCatalogProduct(row))
    .filter(Boolean);
  if (!target) return list;
  const key = typeof target === 'string'
    ? cleanText(target).toLowerCase()
    : catalogIdentity(target);
  if (!key) return list;
  return list.filter(row => catalogIdentity(row) !== key && cleanText(row.id).toLowerCase() !== key);
}

/**
 * Roll up catalog governance evidence across a product list so the catalog
 * browser, audits, and reports can show how much of the catalog is usable for
 * approved-part workflows.
 */
export function summarizeCatalogQuality(products = [], options = {}) {
  const rows = (Array.isArray(products) ? products : [])
    .map(product => normalizeCatalogProduct(product))
    .filter(Boolean);

  const byConfidence = {
    [CATALOG_CONFIDENCE_STATUS.complete]: 0,
    [CATALOG_CONFIDENCE_STATUS.review]: 0,
    [CATALOG_CONFIDENCE_STATUS.incomplete]: 0
  };
  const byApprovalStatus = { approved: 0, conditional: 0, rejected: 0, unreviewed: 0 };
  const byEvidenceStatus = {
    [CATALOG_EVIDENCE_STATUS.sourceVerified]: 0,
    [CATALOG_EVIDENCE_STATUS.screening]: 0
  };
  const missingCounts = new Map();
  const staleCounts = new Map();
  let approved = 0;
  let scoreTotal = 0;
  let staleRows = 0;

  rows.forEach((product) => {
    const confidence = buildCatalogConfidence(product, options);
    byConfidence[confidence.status] = (byConfidence[confidence.status] || 0) + 1;
    const status = product.approval?.status || 'unreviewed';
    byApprovalStatus[status] = (byApprovalStatus[status] || 0) + 1;
    const evidenceStatus = product.evidenceStatus || CATALOG_EVIDENCE_STATUS.screening;
    byEvidenceStatus[evidenceStatus] = (byEvidenceStatus[evidenceStatus] || 0) + 1;
    if (product.approved) approved += 1;
    scoreTotal += confidence.score;
    confidence.missingEvidence.forEach((evidence) => {
      missingCounts.set(evidence, (missingCounts.get(evidence) || 0) + 1);
    });
    if (confidence.staleEvidence.length) staleRows += 1;
    confidence.staleEvidence.forEach((evidence) => {
      staleCounts.set(evidence, (staleCounts.get(evidence) || 0) + 1);
    });
  });

  const toSortedCounts = map => [...map.entries()]
    .map(([evidence, count]) => ({ evidence, count }))
    .sort((a, b) => b.count - a.count || a.evidence.localeCompare(b.evidence));

  return {
    total: rows.length,
    approved,
    averageScore: rows.length ? Math.round(scoreTotal / rows.length) : 0,
    byConfidence,
    byApprovalStatus,
    byEvidenceStatus,
    missingEvidence: toSortedCounts(missingCounts),
    staleEvidence: toSortedCounts(staleCounts),
    staleRows
  };
}

export function filterCatalogProducts(products = [], filters = {}) {
  return (Array.isArray(products) ? products : [])
    .map(product => normalizeCatalogProduct(product))
    .filter(Boolean)
    .filter((product) => {
      if (filters.approvedOnly && !product.approved) return false;
      if (filters.approvalStatus && (product.approval?.status || 'unreviewed') !== filters.approvalStatus) return false;
      if (filters.evidenceStatus && product.evidenceStatus !== filters.evidenceStatus) return false;
      if (filters.confidenceStatus
        && buildCatalogConfidence(product, filters.confidenceOptions || {}).status !== filters.confidenceStatus) return false;
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
  const confidence = buildCatalogConfidence(record);
  return {
    manufacturer: product.manufacturer || cleanText(record.manufacturer),
    catalogNumber: product.catalogNumber || cleanText(record.catalogNumber ?? record.catalog_number ?? record.part_number ?? record.model),
    model: cleanText(record.model ?? product.model),
    approvedPart: product.approved === true,
    approvalStatus: product.approval?.status || cleanText(record.approvalStatus ?? record.approval_status) || 'unreviewed',
    evidenceStatus: product.evidenceStatus || cleanText(record.evidenceStatus ?? record.evidence_status) || CATALOG_EVIDENCE_STATUS.screening,
    source: product.source || cleanText(record.catalog_source),
    lastVerified: product.lastVerified || cleanText(record.catalog_last_verified),
    datasheetUrl: product.datasheetUrl || cleanText(record.datasheet_url ?? record.url),
    bimRef: product.bimRef && Object.keys(product.bimRef).length ? product.bimRef : normalizeObject(record.bimRef ?? record.bim_ref),
    standards: Array.isArray(product.standards) ? product.standards : [],
    co2eKgPerUnit: product.co2eKgPerUnit ?? toNumberOrNull(record.co2eKgPerUnit ?? record.co2e_kg_per_unit),
    epdSource: product.epdSource || cleanText(record.epdSource ?? record.epd_source ?? record.epd?.source),
    epdValidUntil: product.epdValidUntil || cleanDate(record.epdValidUntil ?? record.epd_valid_until ?? record.epd?.validUntil),
    catalogConfidenceScore: confidence.score,
    catalogConfidenceStatus: confidence.status,
    catalogMissingEvidence: confidence.missingEvidence
  };
}

function parseDateOnly(value) {
  const date = cleanDate(value);
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateAgeDays(dateValue, todayValue) {
  const date = parseDateOnly(dateValue);
  const today = parseDateOnly(todayValue);
  if (!date || !today) return null;
  return Math.floor((today.getTime() - date.getTime()) / 86400000);
}

function isDateExpired(dateValue, todayValue) {
  const date = parseDateOnly(dateValue);
  const today = parseDateOnly(todayValue);
  if (!date || !today) return false;
  return date.getTime() < today.getTime();
}

function catalogEvidenceFields(record = {}) {
  const product = normalizeCatalogProduct(record) || {};
  const approval = product.approval || normalizeObject(record.approval);
  const bimRef = product.bimRef && Object.keys(product.bimRef).length
    ? product.bimRef
    : normalizeObject(record.bimRef ?? record.bim_ref);
  const standards = Array.isArray(product.standards) ? product.standards : normalizeArray(record.standards);
  const epdSource = product.epdSource || cleanText(record.epdSource ?? record.epd_source ?? record.epd?.source);
  const epdValidUntil = product.epdValidUntil || cleanDate(record.epdValidUntil ?? record.epd_valid_until ?? record.epd?.validUntil);
  return {
    product,
    manufacturer: product.manufacturer || cleanText(record.manufacturer),
    catalogNumber: product.catalogNumber || cleanText(record.catalogNumber ?? record.catalog_number ?? record.partNumber ?? record.part_number ?? record.model),
    approvedPart: product.approved === true || toBoolean(record.approved_part ?? record.approved),
    approvalStatus: product.approval?.status || cleanText(record.approvalStatus ?? record.approval_status ?? approval.status) || 'unreviewed',
    evidenceStatus: product.evidenceStatus || cleanText(record.evidenceStatus ?? record.evidence_status) || CATALOG_EVIDENCE_STATUS.screening,
    source: product.source || cleanText(record.catalog_source ?? record.source),
    lastVerified: product.lastVerified || cleanDate(record.catalog_last_verified ?? record.lastVerified ?? record.last_verified),
    datasheetUrl: product.datasheetUrl || cleanUrl(record.datasheet_url ?? record.datasheetUrl ?? record.url),
    bimRef,
    standards,
    co2eKgPerUnit: product.co2eKgPerUnit ?? toNumberOrNull(record.co2eKgPerUnit ?? record.co2e_kg_per_unit),
    epdSource,
    epdValidUntil
  };
}

export function buildCatalogConfidence(record = {}, options = {}) {
  const fields = catalogEvidenceFields(record);
  const today = cleanDate(options.today) || cleanDate(new Date().toISOString().slice(0, 10));
  const verificationMaxAgeDays = Number.isFinite(Number(options.verificationMaxAgeDays))
    ? Number(options.verificationMaxAgeDays)
    : 365;
  const missingEvidence = [];
  const staleEvidence = [];
  let score = 0;

  const hasIdentity = !hasGenericManufacturer(fields.manufacturer) && !!fields.catalogNumber;
  if (hasIdentity) score += 20;
  else missingEvidence.push('manufacturer/catalog identity');

  if (fields.approvedPart && fields.approvalStatus === 'approved') score += 20;
  else missingEvidence.push('approved part status');

  if (fields.source) score += 10;
  else missingEvidence.push('approval source');

  if (fields.lastVerified) {
    score += 10;
    const ageDays = dateAgeDays(fields.lastVerified, today);
    if (ageDays != null && ageDays > verificationMaxAgeDays) {
      staleEvidence.push('catalog verification date');
    }
  } else {
    missingEvidence.push('last verified date');
  }

  if (fields.datasheetUrl) score += 15;
  else missingEvidence.push('datasheet URL');

  if (hasBimEvidence(fields.bimRef, fields.catalogNumber)) score += 10;
  else missingEvidence.push('BIM reference');

  if (fields.standards.length > 0) score += 10;
  else missingEvidence.push('standards/listing metadata');

  if (fields.epdSource || fields.epdValidUntil || fields.co2eKgPerUnit != null) {
    if (fields.epdSource && fields.epdValidUntil && fields.co2eKgPerUnit != null) score += 5;
    else missingEvidence.push('complete EPD/CO2e metadata');
    if (fields.epdValidUntil && isDateExpired(fields.epdValidUntil, today)) {
      staleEvidence.push('EPD validity date');
    }
  } else {
    missingEvidence.push('EPD/CO2e metadata');
  }

  let status = CATALOG_CONFIDENCE_STATUS.incomplete;
  if (score >= 80 && missingEvidence.length <= 1 && staleEvidence.length === 0) {
    status = CATALOG_CONFIDENCE_STATUS.complete;
  } else if (score >= 50) {
    status = CATALOG_CONFIDENCE_STATUS.review;
  }

  return {
    score,
    status,
    missingEvidence,
    staleEvidence,
    evidence: {
      manufacturer: fields.manufacturer,
      catalogNumber: fields.catalogNumber,
      approvalStatus: fields.approvalStatus,
      approvedPart: fields.approvedPart,
      evidenceStatus: fields.evidenceStatus,
      source: fields.source,
      lastVerified: fields.lastVerified,
      datasheetUrl: fields.datasheetUrl,
      bimRef: fields.bimRef,
      standards: fields.standards,
      co2eKgPerUnit: fields.co2eKgPerUnit,
      epdSource: fields.epdSource,
      epdValidUntil: fields.epdValidUntil
    }
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

function normalizedCatalogIndexes(catalogProducts = []) {
  const catalog = Array.isArray(catalogProducts)
    ? catalogProducts.map(product => normalizeCatalogProduct(product)).filter(Boolean)
    : [];
  return {
    catalog,
    byIdentity: new Map(catalog.map(product => [catalogIdentity(product), product]))
  };
}

export function findCatalogProductForRecord(record = {}, catalogProducts = []) {
  const fields = buildBomCatalogFields(record);
  const { byIdentity } = normalizedCatalogIndexes(catalogProducts);
  if (hasGenericManufacturer(fields.manufacturer) || !fields.catalogNumber) return null;
  const identity = buildIdentity(fields.manufacturer, fields.catalogNumber, fields.catalogNumber);
  return byIdentity.get(identity) || null;
}

export function buildCatalogWarnings(records = [], catalogProducts = [], options = {}) {
  const { catalog, byIdentity: catalogByIdentity } = normalizedCatalogIndexes(catalogProducts);
  const shouldCheckUnknownCatalog = catalog.length > 0 || options.checkUnknownCatalog === true;
  const today = cleanDate(options.today) || cleanDate(new Date().toISOString().slice(0, 10));
  const verificationMaxAgeDays = Number.isFinite(Number(options.verificationMaxAgeDays))
    ? Number(options.verificationMaxAgeDays)
    : 365;

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
    const product = catalogByIdentity.get(key) || null;

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

    const verificationAgeDays = dateAgeDays(product?.lastVerified || fields.lastVerified, today);
    if (verificationAgeDays != null && verificationAgeDays > verificationMaxAgeDays) {
      warnings.push({
        index,
        id,
        code: 'stale-catalog-verification',
        severity: 'warning',
        message: `${id} catalog verification is ${verificationAgeDays} days old.`
      });
    }

    const datasheetUrl = product?.datasheetUrl || fields.datasheetUrl;
    if (options.requireDatasheet && !datasheetUrl) {
      warnings.push({
        index,
        id,
        code: 'missing-datasheet',
        severity: 'warning',
        message: `${id} is missing a manufacturer datasheet URL.`
      });
    }

    const bimRef = product?.bimRef || fields.bimRef;
    if (options.requireBimRef && !hasBimEvidence(bimRef, fields.catalogNumber)) {
      warnings.push({
        index,
        id,
        code: 'missing-bim-reference',
        severity: 'warning',
        message: `${id} is missing BIM family/type reference metadata.`
      });
    }

    const epdSource = product?.epdSource || fields.epdSource;
    const epdValidUntil = product?.epdValidUntil || fields.epdValidUntil;
    const co2eKgPerUnit = product?.co2eKgPerUnit ?? fields.co2eKgPerUnit;
    if (options.requireEpd && (!epdSource || !epdValidUntil || co2eKgPerUnit == null)) {
      warnings.push({
        index,
        id,
        code: 'missing-epd-metadata',
        severity: 'warning',
        message: `${id} is missing complete EPD source, validity, or CO2e metadata.`
      });
    }
    if (epdValidUntil && isDateExpired(epdValidUntil, today)) {
      warnings.push({
        index,
        id,
        code: 'expired-epd',
        severity: 'warning',
        message: `${id} EPD metadata expired on ${epdValidUntil}.`
      });
    }

    return warnings;
  });
}

export function buildCatalogTraceabilityReport(records = [], catalogProducts = [], options = {}) {
  const rows = (Array.isArray(records) ? records : []).map((record, index) => {
    const matchedProduct = findCatalogProductForRecord(record, catalogProducts);
    const basis = matchedProduct
      ? { ...record, ...matchedProduct, tag: record.tag, id: record.id ?? matchedProduct.id }
      : record;
    const fields = buildBomCatalogFields(basis);
    const confidence = buildCatalogConfidence(basis, options);
    const warnings = buildCatalogWarnings([record], catalogProducts, { ...options, checkUnknownCatalog: options.checkUnknownCatalog ?? true })
      .map(warning => ({ ...warning, index }));
    return {
      index,
      id: recordIdentity(record),
      matchedCatalogId: matchedProduct?.id || '',
      manufacturer: fields.manufacturer,
      catalogNumber: fields.catalogNumber,
      approvalStatus: fields.approvalStatus,
      approvedPart: fields.approvedPart,
      source: fields.source,
      lastVerified: fields.lastVerified,
      datasheetUrl: fields.datasheetUrl,
      bimRef: fields.bimRef,
      standards: fields.standards,
      co2eKgPerUnit: fields.co2eKgPerUnit,
      epdSource: fields.epdSource,
      epdValidUntil: fields.epdValidUntil,
      confidence,
      warnings
    };
  });

  const summary = rows.reduce((acc, row) => {
    acc.total += 1;
    if (row.matchedCatalogId) acc.matched += 1;
    if (row.approvedPart && row.approvalStatus === 'approved') acc.approved += 1;
    acc.byConfidence[row.confidence.status] = (acc.byConfidence[row.confidence.status] || 0) + 1;
    acc.warningCount += row.warnings.length;
    return acc;
  }, {
    total: 0,
    matched: 0,
    approved: 0,
    warningCount: 0,
    byConfidence: {
      [CATALOG_CONFIDENCE_STATUS.complete]: 0,
      [CATALOG_CONFIDENCE_STATUS.review]: 0,
      [CATALOG_CONFIDENCE_STATUS.incomplete]: 0
    }
  });

  return { summary, rows };
}

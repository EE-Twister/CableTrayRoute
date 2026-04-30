import { normalizeProductCatalog } from './productCatalog.mjs';

export const BIM_OBJECT_LIBRARY_VERSION = 'bim-object-library-v1';

export const BIM_OBJECT_PRODUCT_CLASSES = [
  'tray',
  'conduit',
  'fitting',
  'support',
  'equipment',
  'protectiveDevice',
  'heatTraceComponent',
  'cableType',
  'custom',
];

export const BIM_OBJECT_NATIVE_FORMATS = [
  'revitFamily',
  'ifcObject',
  'autocadBlock',
  'genericMetadata',
];

const CATEGORY_ALIASES = {
  trays: 'tray',
  cableTray: 'tray',
  cabletray: 'tray',
  conduits: 'conduit',
  fittings: 'fitting',
  accessory: 'fitting',
  accessories: 'fitting',
  supports: 'support',
  equipmentlist: 'equipment',
  protectiveDevices: 'protectiveDevice',
  protective_device: 'protectiveDevice',
  breaker: 'protectiveDevice',
  heatTrace: 'heatTraceComponent',
  heatTraceComponents: 'heatTraceComponent',
  heat_trace_component: 'heatTraceComponent',
  cable: 'cableType',
  cables: 'cableType',
  cableTypes: 'cableType',
  cable_type: 'cableType',
};

const FORMAT_ALIASES = {
  revit: 'revitFamily',
  rfa: 'revitFamily',
  revitfamily: 'revitFamily',
  ifc: 'ifcObject',
  ifcobject: 'ifcObject',
  autocad: 'autocadBlock',
  cad: 'autocadBlock',
  dwg: 'autocadBlock',
  block: 'autocadBlock',
  generic: 'genericMetadata',
  metadata: 'genericMetadata',
};

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
    if (/^(true|yes|y|1|approved)$/i.test(value.trim())) return true;
    if (/^(false|no|n|0|unapproved|pending|rejected)$/i.test(value.trim())) return false;
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

function normalizeCategory(value = '') {
  const raw = stringValue(value || 'custom');
  if (BIM_OBJECT_PRODUCT_CLASSES.includes(raw)) return raw;
  const compact = raw.replace(/[-_\s]/g, '');
  return CATEGORY_ALIASES[raw] || CATEGORY_ALIASES[compact] || raw || 'custom';
}

function normalizeNativeFormat(value = '') {
  const raw = stringValue(value || 'genericMetadata');
  if (BIM_OBJECT_NATIVE_FORMATS.includes(raw)) return raw;
  return FORMAT_ALIASES[raw.toLowerCase().replace(/[-_\s]/g, '')] || raw || 'genericMetadata';
}

function normalizeLod(value = '') {
  const raw = stringValue(value || 'LOD 300').toUpperCase().replace(/^LOD\s*/, '');
  const numeric = numberValue(raw, null);
  return numeric === null ? stringValue(value || 'LOD 300') : `LOD ${numeric}`;
}

function objectFromDimensionFields(row = {}) {
  const source = asObject(row);
  const base = { ...asObject(source.nominalDimensions || source.dimensions) };
  const fields = {
    widthIn: source.widthIn ?? source.width_in,
    depthIn: source.depthIn ?? source.depth_in,
    heightIn: source.heightIn ?? source.height_in,
    lengthIn: source.lengthIn ?? source.length_in,
    tradeSize: source.tradeSize ?? source.trade_size,
    weightLb: source.weightLb ?? source.weight_lb ?? source.weight,
  };
  Object.entries(fields).forEach(([key, value]) => {
    const parsed = numberValue(value, null);
    if (parsed !== null) base[key] = parsed;
  });
  return base;
}

function isStale(row = {}, options = {}) {
  const maxAgeDays = options.maxAgeDays ?? 365;
  if (!row.lastVerified) return false;
  const verified = new Date(row.lastVerified);
  if (Number.isNaN(verified.getTime())) return true;
  return (Date.now() - verified.getTime()) / 86400000 > maxAgeDays;
}

function mergeKey(row = {}) {
  return [
    stringValue(row.manufacturer).toLowerCase(),
    stringValue(row.catalogNumber || row.catalog_number || row.partNumber).toLowerCase(),
    normalizeCategory(row.category || row.productType).toLowerCase(),
  ].join('|');
}

function fallbackKey(row = {}) {
  return [
    stringValue(row.manufacturer).toLowerCase(),
    stringValue(row.series).toLowerCase(),
    normalizeCategory(row.category || row.productType).toLowerCase(),
  ].join('|');
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeBimObjectFamily(row = {}, options = {}) {
  const source = asObject(row);
  const manufacturer = stringValue(source.manufacturer || options.manufacturer);
  const catalogNumber = stringValue(
    source.catalogNumber
      || source.catalog_number
      || source.catalogNo
      || source.partNumber
      || source.part_number
      || options.catalogNumber
  );
  const category = normalizeCategory(source.category || source.productType || options.category);
  const familyName = stringValue(source.familyName || source.family_name || source.revitFamily || source.name || source.description);
  const nativeFormat = normalizeNativeFormat(source.nativeFormat || source.native_format || source.format);
  const approved = boolValue(source.approved, false);
  const normalized = {
    ...source,
    id: stringValue(source.id) || `bim-family-${slug(`${manufacturer}-${catalogNumber}-${category}-${familyName || nativeFormat}`)}`,
    version: stringValue(source.version || BIM_OBJECT_LIBRARY_VERSION),
    manufacturer,
    catalogNumber,
    series: stringValue(source.series),
    category,
    subcategory: stringValue(source.subcategory),
    familyName,
    familyType: stringValue(source.familyType || source.family_type || source.type || 'type'),
    nativeFormat,
    formatVersion: stringValue(source.formatVersion || source.format_version),
    lod: normalizeLod(source.lod || source.levelOfDevelopment),
    ifcClass: stringValue(source.ifcClass || source.ifc_class || source.ifcType),
    omniClass: stringValue(source.omniClass || source.omniclass),
    uniformat: stringValue(source.uniformat || source.uniFormat),
    revitCategory: stringValue(source.revitCategory || source.revit_category),
    connectorTypes: asArray(source.connectorTypes || source.connector_types || source.connectors).map(stringValue).filter(Boolean).sort(),
    nominalDimensions: objectFromDimensionFields(source),
    parametricDimensions: { ...asObject(source.parametricDimensions || source.parametric_dimensions) },
    mountingMetadata: { ...asObject(source.mountingMetadata || source.mounting_metadata || source.mounting) },
    material: stringValue(source.material),
    finish: stringValue(source.finish),
    weightLb: numberValue(source.weightLb ?? source.weight_lb ?? source.weight, null),
    datasheetUrl: stringValue(source.datasheetUrl || source.datasheet_url || source.url),
    familySource: stringValue(source.familySource || source.family_source || source.source || 'local-metadata'),
    sourceUrl: stringValue(source.sourceUrl || source.source_url || source.url),
    approved,
    approvalStatus: stringValue(source.approvalStatus || source.approval_status || (approved ? 'approved' : 'unreviewed')),
    approvedBy: stringValue(source.approvedBy || source.approved_by),
    approvedAt: dateValue(source.approvedAt || source.approved_at),
    lastVerified: dateValue(source.lastVerified || source.last_verified),
    verificationNotes: stringValue(source.verificationNotes || source.verification_notes || source.notes),
    tags: asArray(source.tags).map(stringValue).filter(Boolean).sort(),
    warnings: asArray(source.warnings).map(stringValue).filter(Boolean),
  };
  return JSON.parse(JSON.stringify(normalized));
}

export function normalizeBimObjectLibrary(input = {}, options = {}) {
  const rows = Array.isArray(input)
    ? input
    : Array.isArray(input.familyRows)
      ? input.familyRows
      : Array.isArray(input.rows)
        ? input.rows
        : Array.isArray(input.families)
          ? input.families
          : [];
  const familyRows = rows.map(row => normalizeBimObjectFamily(row, options));
  return {
    version: BIM_OBJECT_LIBRARY_VERSION,
    sourceVersion: input?.version || input?.sourceVersion || '',
    familyRows,
    summary: {
      total: familyRows.length,
      approved: familyRows.filter(row => row.approved).length,
      unapproved: familyRows.filter(row => !row.approved).length,
      stale: familyRows.filter(row => isStale(row, options)).length,
      categories: [...new Set(familyRows.map(row => row.category).filter(Boolean))].sort(),
      nativeFormats: [...new Set(familyRows.map(row => row.nativeFormat).filter(Boolean))].sort(),
    },
  };
}

export function validateBimObjectFamily(family = {}, catalogRows = []) {
  const source = asObject(family);
  const row = normalizeBimObjectFamily(family);
  const errors = [];
  const warnings = [...row.warnings];
  if (!row.manufacturer) errors.push('manufacturer is required');
  if (!row.catalogNumber) errors.push('catalogNumber is required');
  if (!row.category) errors.push('category is required');
  if (!row.familyName) errors.push('familyName is required');
  if (!stringValue(source.nativeFormat || source.native_format || source.format)) errors.push('nativeFormat is required');
  if (!row.ifcClass) errors.push('ifcClass is required');
  if (!Object.keys(row.nominalDimensions).length && !Object.keys(row.parametricDimensions).length) warnings.push('family should include nominalDimensions or parametricDimensions');
  if (!row.connectorTypes.length) warnings.push('family should include connectorTypes for connector/BIM handoff');
  if (row.approved && !row.lastVerified) warnings.push('approved family should include lastVerified');
  const normalizedCatalog = normalizeProductCatalog(catalogRows).rows;
  if (normalizedCatalog.length && !normalizedCatalog.some(catalog => mergeKey(catalog) === mergeKey(row))) {
    warnings.push('family does not match a governed product catalog row by manufacturer, catalogNumber, and category');
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    family: {
      ...row,
      warnings: [...new Set(warnings)],
    },
  };
}

export function mapCatalogRowsToBimFamilies({ catalogRows = [], familyRows = [] } = {}) {
  const catalog = normalizeProductCatalog(catalogRows).rows;
  const families = normalizeBimObjectLibrary(familyRows).familyRows;
  const exact = new Map();
  const fallback = new Map();
  families.forEach(family => {
    const key = mergeKey(family);
    if (!exact.has(key)) exact.set(key, []);
    exact.get(key).push(family);
    const fb = fallbackKey(family);
    if (fb.replace(/\|/g, '')) {
      if (!fallback.has(fb)) fallback.set(fb, []);
      fallback.get(fb).push(family);
    }
  });
  const rows = catalog.map(catalogRow => {
    const exactMatches = exact.get(mergeKey(catalogRow)) || [];
    const fallbackMatches = exactMatches.length ? [] : (fallback.get(fallbackKey(catalogRow)) || []);
    const matches = exactMatches.length ? exactMatches : fallbackMatches;
    const family = matches[0] || null;
    const warnings = [];
    if (!family) warnings.push('Approved catalog row has no BIM object family metadata.');
    if (matches.length > 1) warnings.push('Multiple BIM object families match this catalog row; review conflicting mappings.');
    if (family && !family.approved) warnings.push('Matched BIM object family is not approved.');
    if (family && isStale(family)) warnings.push('Matched BIM object family verification is stale.');
    if (family && !family.connectorTypes.length) warnings.push('Matched BIM object family is missing connector metadata.');
    if (family && !Object.keys(family.nominalDimensions).length && !Object.keys(family.parametricDimensions).length) warnings.push('Matched BIM object family is missing dimension metadata.');
    const status = !family
      ? 'missingFamily'
      : matches.length > 1
        ? 'conflict'
        : !family.approved
          ? 'unapprovedFamily'
          : isStale(family)
            ? 'staleFamily'
            : warnings.length
              ? 'review'
              : 'ready';
    return {
      catalogId: catalogRow.id,
      manufacturer: catalogRow.manufacturer,
      catalogNumber: catalogRow.catalogNumber,
      series: catalogRow.series,
      category: catalogRow.category,
      description: catalogRow.description,
      catalogApproved: Boolean(catalogRow.approved),
      familyId: family?.id || '',
      familyName: family?.familyName || '',
      nativeFormat: family?.nativeFormat || '',
      ifcClass: family?.ifcClass || '',
      matchType: family ? (exactMatches.length ? 'exact' : 'seriesCategory') : 'none',
      status,
      warnings,
    };
  });
  return {
    rows,
    summary: {
      catalogCount: rows.length,
      ready: rows.filter(row => row.status === 'ready').length,
      missingFamily: rows.filter(row => row.status === 'missingFamily').length,
      conflict: rows.filter(row => row.status === 'conflict').length,
      unapprovedFamily: rows.filter(row => row.status === 'unapprovedFamily').length,
      staleFamily: rows.filter(row => row.status === 'staleFamily').length,
      review: rows.filter(row => row.status !== 'ready').length,
    },
    conflicts: rows.filter(row => row.status === 'conflict'),
    missingFamilies: rows.filter(row => row.status === 'missingFamily'),
  };
}

export function buildBimObjectPropertySets({ familyRows = [], catalogRows = [] } = {}) {
  const catalogByKey = new Map(normalizeProductCatalog(catalogRows).rows.map(row => [mergeKey(row), row]));
  return normalizeBimObjectLibrary(familyRows).familyRows.map(family => {
    const catalog = catalogByKey.get(mergeKey(family)) || {};
    return {
      id: `pset-${family.id}`,
      familyId: family.id,
      name: 'CableTrayRoute.BimObjectFamily',
      appliesTo: family.ifcClass || family.revitCategory || family.category,
      properties: {
        manufacturer: family.manufacturer,
        catalogNumber: family.catalogNumber,
        series: family.series || catalog.series || '',
        category: family.category,
        familyName: family.familyName,
        familyType: family.familyType,
        nativeFormat: family.nativeFormat,
        lod: family.lod,
        ifcClass: family.ifcClass,
        revitCategory: family.revitCategory,
        connectorTypes: family.connectorTypes,
        nominalDimensions: family.nominalDimensions,
        parametricDimensions: family.parametricDimensions,
        catalogApproved: Boolean(catalog.approved),
        familyApproved: Boolean(family.approved),
        lastVerified: family.lastVerified,
      },
    };
  });
}

export function buildBimObjectConnectorHints({ familyRows = [], projectState = {} } = {}) {
  const families = normalizeBimObjectLibrary(familyRows).familyRows;
  const state = asObject(projectState);
  const familyByKey = new Map(families.map(row => [mergeKey(row), row]));
  const projectRows = [
    ...asArray(state.trays).map(row => ({ ...row, elementType: 'cableTray', category: 'tray', projectId: row.id || row.tray_id || row.tag, tag: row.tag || row.tray_id || row.id })),
    ...asArray(state.conduits).map(row => ({ ...row, elementType: 'conduit', category: 'conduit', projectId: row.id || row.conduit_id || row.tag, tag: row.tag || row.conduit_id || row.id })),
    ...asArray(state.equipment).map(row => ({ ...row, elementType: 'equipment', category: row.category || 'equipment', projectId: row.id || row.equipment_id || row.tag, tag: row.tag || row.id || row.equipment_id })),
  ];
  return projectRows.map(row => {
    const family = familyByKey.get(mergeKey(row));
    const warnings = [];
    if (!family && (row.manufacturer || row.catalogNumber || row.catalog_number)) warnings.push('Project row references product data without matching BIM family metadata.');
    if (family && !family.connectorTypes.length) warnings.push('BIM family has no connector metadata.');
    return {
      projectId: stringValue(row.projectId),
      tag: stringValue(row.tag),
      elementType: stringValue(row.elementType),
      manufacturer: stringValue(row.manufacturer),
      catalogNumber: stringValue(row.catalogNumber || row.catalog_number || row.partNumber),
      category: normalizeCategory(row.category),
      familyId: family?.id || '',
      familyName: family?.familyName || '',
      nativeFormat: family?.nativeFormat || 'genericMetadata',
      ifcClass: family?.ifcClass || '',
      confidence: family ? 0.95 : 0.25,
      status: family ? 'ready' : 'genericPlaceholder',
      warnings,
    };
  });
}

export function buildBimObjectLibraryPackage(context = {}) {
  const projectName = stringValue(context.projectName || context.name || 'CableTrayRoute Project');
  const catalogRows = context.catalogRows || context.productCatalog || context.catalog || [];
  const familyRows = normalizeBimObjectLibrary(context.familyRows || context.bimObjectFamilies || context.families || []).familyRows;
  const validations = familyRows.map(row => validateBimObjectFamily(row, catalogRows));
  const invalidRows = validations.filter(row => !row.valid);
  const catalogCoverage = mapCatalogRowsToBimFamilies({ catalogRows, familyRows });
  const propertySets = buildBimObjectPropertySets({ familyRows, catalogRows });
  const connectorHints = buildBimObjectConnectorHints({ familyRows, projectState: context.projectState || context });
  const staleRows = familyRows.filter(row => isStale(row));
  const warnings = [
    ...invalidRows.flatMap(row => row.errors.map(error => `${row.family.familyName || row.family.id}: ${error}`)),
    ...validations.flatMap(row => row.warnings.map(warning => `${row.family.familyName || row.family.id}: ${warning}`)),
    ...catalogCoverage.rows.flatMap(row => row.warnings.map(warning => `${row.manufacturer} ${row.catalogNumber}: ${warning}`)),
    ...connectorHints.flatMap(row => row.warnings.map(warning => `${row.tag || row.projectId}: ${warning}`)),
  ];
  return {
    version: BIM_OBJECT_LIBRARY_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName,
    summary: {
      familyCount: familyRows.length,
      approvedFamilyCount: familyRows.filter(row => row.approved).length,
      unapprovedFamilyCount: familyRows.filter(row => !row.approved).length,
      staleFamilyCount: staleRows.length,
      catalogRows: catalogCoverage.summary.catalogCount,
      readyCatalogRows: catalogCoverage.summary.ready,
      missingFamilyCount: catalogCoverage.summary.missingFamily,
      conflictCount: catalogCoverage.summary.conflict,
      connectorHintCount: connectorHints.length,
      genericPlaceholderCount: connectorHints.filter(row => row.status === 'genericPlaceholder').length,
      warningCount: warnings.length,
      status: invalidRows.length || catalogCoverage.summary.conflict ? 'action-required' : warnings.length ? 'review' : 'ready',
    },
    familyRows,
    validationRows: validations.map(row => ({
      familyId: row.family.id,
      familyName: row.family.familyName,
      valid: row.valid,
      status: row.valid ? (row.warnings.length ? 'review' : 'pass') : 'fail',
      errors: row.errors,
      warnings: row.warnings,
    })),
    catalogCoverage,
    propertySets,
    connectorHints,
    warningRows: warnings.map((message, index) => ({ id: `bim-family-warning-${index + 1}`, status: /required|conflicting|Multiple/i.test(message) ? 'fail' : 'review', message })),
    warnings,
    assumptions: [
      'BIM object library rows are local metadata and mapping hints, not proprietary manufacturer family binaries.',
      'Product Catalog approval remains authoritative for catalog governance; BIM object approval only indicates local model-family readiness.',
      'Generic placeholders are allowed for connector exchange but must be reviewed before native BIM handoff.',
      'Final Revit RFA, IFC, or CAD family content still requires manufacturer or project-specific validation.',
    ],
  };
}

export function renderBimObjectLibraryHTML(pkg = {}) {
  const summary = pkg.summary || {};
  const coverageRows = asArray(pkg.catalogCoverage?.rows);
  const familyRows = asArray(pkg.familyRows);
  return `<section class="report-section" id="rpt-bim-object-library">
  <h2>BIM Object Library and Family Metadata</h2>
  <p class="report-note">Local BIM family readiness metadata for connector/property-set handoff. Proprietary manufacturer RFA/IFC content is not included.</p>
  <dl class="report-dl">
    <dt>Family Rows</dt><dd>${escapeHtml(summary.familyCount || 0)}</dd>
    <dt>Approved Families</dt><dd>${escapeHtml(summary.approvedFamilyCount || 0)}</dd>
    <dt>Ready Catalog Rows</dt><dd>${escapeHtml(summary.readyCatalogRows || 0)} / ${escapeHtml(summary.catalogRows || 0)}</dd>
    <dt>Missing Families</dt><dd>${escapeHtml(summary.missingFamilyCount || 0)}</dd>
    <dt>Conflicts</dt><dd>${escapeHtml(summary.conflictCount || 0)}</dd>
    <dt>Status</dt><dd>${escapeHtml(summary.status || 'review')}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Manufacturer</th><th>Catalog #</th><th>Family</th><th>Format</th><th>IFC Class</th><th>Approved</th><th>Verified</th></tr></thead>
      <tbody>${familyRows.slice(0, 50).map(row => `<tr>
        <td>${escapeHtml(row.manufacturer)}</td>
        <td>${escapeHtml(row.catalogNumber)}</td>
        <td>${escapeHtml(row.familyName)}</td>
        <td>${escapeHtml(row.nativeFormat)}</td>
        <td>${escapeHtml(row.ifcClass)}</td>
        <td>${escapeHtml(row.approvalStatus)}</td>
        <td>${escapeHtml(row.lastVerified || 'not verified')}</td>
      </tr>`).join('') || '<tr><td colspan="7">No BIM object family metadata rows.</td></tr>'}</tbody>
    </table>
  </div>
  <h3>Catalog Coverage</h3>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Catalog Row</th><th>Category</th><th>Family</th><th>Match</th><th>Status</th><th>Warnings</th></tr></thead>
      <tbody>${coverageRows.slice(0, 75).map(row => `<tr>
        <td>${escapeHtml(`${row.manufacturer} ${row.catalogNumber}`)}</td>
        <td>${escapeHtml(row.category)}</td>
        <td>${escapeHtml(row.familyName || 'n/a')}</td>
        <td>${escapeHtml(row.matchType)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.warnings.join('; '))}</td>
      </tr>`).join('') || '<tr><td colspan="6">No catalog coverage rows.</td></tr>'}</tbody>
    </table>
  </div>
  ${asArray(pkg.warnings).length ? `<h3>Warnings</h3><ul>${asArray(pkg.warnings).slice(0, 30).map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
</section>`;
}

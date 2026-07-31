/**
 * Cable typical library governance.
 *
 * A source-verified cable typical has manufacturer traceability, a dated
 * manufacturer source, and the construction fields required to use it as a
 * scheduling/sizing starting point. Source verification is intentionally
 * separate from project approval.
 */

export const CABLE_LIBRARY_EVIDENCE_STATUS = Object.freeze({
  sourceVerified: 'source_verified',
  screening: 'screening'
});

const VALID_STATUSES = new Set(Object.values(CABLE_LIBRARY_EVIDENCE_STATUS));

function text(value) {
  return String(value ?? '').trim();
}

function validDate(value) {
  const candidate = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return false;
  const [year, month, day] = candidate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validUrl(value) {
  try {
    const url = new URL(text(value));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function assessCableTypical(input = {}) {
  const typical = input && typeof input === 'object' ? input : {};
  const requestedStatus = text(typical.catalog_evidence_status).toLowerCase();
  const wantsSourceVerification = requestedStatus === CABLE_LIBRARY_EVIDENCE_STATUS.sourceVerified;
  const missing = [];

  if (!text(typical.manufacturer)) missing.push('manufacturer');
  if (!text(typical.model)) missing.push('model or catalog reference');
  if (!text(typical.catalog_source)) missing.push('manufacturer source');
  if (!validDate(typical.catalog_last_verified)) missing.push('last verified date');
  if (!validUrl(typical.datasheet_url)) missing.push('manufacturer product or datasheet URL');
  if (!text(typical.conductor_size)) missing.push('conductor size');
  if (!text(typical.conductor_material)) missing.push('conductor material');
  if (!text(typical.insulation_type)) missing.push('insulation type');
  if (!(Number(typical.cable_rating) > 0)) missing.push('cable voltage rating');

  const sourceVerified = wantsSourceVerification && missing.length === 0;
  return {
    requestedStatus: VALID_STATUSES.has(requestedStatus)
      ? requestedStatus
      : CABLE_LIBRARY_EVIDENCE_STATUS.screening,
    status: sourceVerified
      ? CABLE_LIBRARY_EVIDENCE_STATUS.sourceVerified
      : CABLE_LIBRARY_EVIDENCE_STATUS.screening,
    sourceVerified,
    missing
  };
}

export function normalizeCableTypical(input = {}) {
  const typical = input && typeof input === 'object' ? { ...input } : {};
  const assessment = assessCableTypical(typical);
  return {
    ...typical,
    catalog_evidence_status: assessment.status
  };
}

/**
 * Adapt a governed shared-manufacturer-catalog cable row into a reusable
 * Cable Library typical. The adapter deliberately requires the same core
 * construction fields as source verification, so incomplete commercial rows
 * cannot appear as usable cable constructions.
 */
export function normalizeCableCatalogProduct(product) {
  if (!product || typeof product !== 'object' || String(product.category || '').toLowerCase() !== 'cable') return null;
  const conductorSize = text(product.cable_conductor_size ?? product.conductor_size);
  const conductorMaterial = text(product.cable_conductor_material ?? product.conductor_material);
  const insulationType = text(product.cable_insulation_type ?? product.insulation_type);
  const cableRating = Number(product.cable_voltage_rating ?? product.cable_rating);
  const conductors = Number(product.cable_conductors ?? product.conductors) || 1;
  const manufacturer = text(product.manufacturer);
  const model = text(product.catalogNumber ?? product.catalog_number ?? product.id);
  if (!manufacturer || !model || !conductorSize || !conductorMaterial || !insulationType || !(cableRating > 0)) return null;
  return normalizeCableTypical({
    label: text(product.cable_label) || [manufacturer, model, conductorSize].filter(Boolean).join(' '),
    manufacturer,
    model,
    catalog_evidence_status: text(product.evidenceStatus ?? product.evidence_status) === CABLE_LIBRARY_EVIDENCE_STATUS.sourceVerified
      ? CABLE_LIBRARY_EVIDENCE_STATUS.sourceVerified
      : CABLE_LIBRARY_EVIDENCE_STATUS.screening,
    catalog_source: text(product.source),
    catalog_last_verified: text(product.lastVerified ?? product.last_verified),
    datasheet_url: text(product.datasheetUrl ?? product.datasheet_url),
    cable_type: text(product.cable_type) || 'Power',
    conductors,
    conductor_size: conductorSize,
    conductor_material: conductorMaterial,
    insulation_type: insulationType,
    cable_rating: cableRating,
    terminal_temp_rating: text(product.cable_terminal_temp_rating ?? product.terminal_temp_rating),
    shielding_jacket: text(product.cable_shielding_jacket ?? product.shielding_jacket),
  });
}

export function summarizeCableLibrary(typicals = []) {
  const rows = Array.isArray(typicals) ? typicals : [];
  return rows.reduce((summary, typical) => {
    const assessment = assessCableTypical(typical);
    summary.total += 1;
    summary[assessment.status] += 1;
    return summary;
  }, {
    total: 0,
    [CABLE_LIBRARY_EVIDENCE_STATUS.sourceVerified]: 0,
    [CABLE_LIBRARY_EVIDENCE_STATUS.screening]: 0
  });
}

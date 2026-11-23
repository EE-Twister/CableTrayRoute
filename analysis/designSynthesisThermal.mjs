import { ambientTempFactor, bundlingFactor } from './autoSize.mjs';

const THERMAL_KEYS = new Set(['ambientTempC', 'bundledConductors', 'solidCoverContinuousLengthFt']);
const CRITERIA_THERMAL_KEYS = new Set(['method', 'solidCoverContinuousLengthFt']);
const MAX_AMBIENT_C = 90;

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function issue(code, message, path) { return { code, message, severity: 'blocking', path }; }

function validateThermalObject(value, path, issues) {
  if (!object(value)) { issues.push(issue('INVALID_THERMAL_OBJECT', 'thermal must be an object.', path)); return; }
  for (const key of Object.keys(value)) if (!THERMAL_KEYS.has(key)) issues.push(issue('UNKNOWN_THERMAL_FIELD', `Unknown thermal field ${key}.`, `${path}.${key}`));
  if (value.ambientTempC !== undefined && (!finite(value.ambientTempC) || value.ambientTempC < 0 || value.ambientTempC > MAX_AMBIENT_C)) issues.push(issue('INVALID_THERMAL_AMBIENT', 'Thermal ambientTempC must be between 0 and 90 C for the NEC correction table.', `${path}.ambientTempC`));
  if (value.bundledConductors !== undefined && (!Number.isInteger(value.bundledConductors) || value.bundledConductors < 1)) issues.push(issue('INVALID_THERMAL_BUNDLING', 'Thermal bundledConductors must be a positive integer.', `${path}.bundledConductors`));
  if (value.solidCoverContinuousLengthFt !== undefined && (!finite(value.solidCoverContinuousLengthFt) || value.solidCoverContinuousLengthFt < 0)) issues.push(issue('INVALID_SOLID_COVER_LENGTH', 'solidCoverContinuousLengthFt must be a nonnegative finite number.', `${path}.solidCoverContinuousLengthFt`));
}

export function validateDesignSynthesisThermalInput(input = {}) {
  const issues = [];
  const criteria = input.criteria;
  if (object(criteria) && criteria.thermal !== undefined) {
    if (!object(criteria.thermal)) issues.push(issue('INVALID_THERMAL_OBJECT', 'criteria.thermal must be an object.', 'criteria.thermal'));
    else {
      for (const key of Object.keys(criteria.thermal)) if (!CRITERIA_THERMAL_KEYS.has(key)) issues.push(issue('UNKNOWN_THERMAL_FIELD', `Unknown thermal field ${key}.`, `criteria.thermal.${key}`));
      if (criteria.thermal.method !== undefined && criteria.thermal.method !== 'nec-table-screening') issues.push(issue('UNSUPPORTED_THERMAL_METHOD', 'Only nec-table-screening is supported for route synthesis.', 'criteria.thermal.method'));
      if (criteria.thermal.solidCoverContinuousLengthFt !== undefined && (!finite(criteria.thermal.solidCoverContinuousLengthFt) || criteria.thermal.solidCoverContinuousLengthFt < 0)) issues.push(issue('INVALID_SOLID_COVER_LENGTH', 'solidCoverContinuousLengthFt must be a nonnegative finite number.', 'criteria.thermal.solidCoverContinuousLengthFt'));
    }
  }
  for (const [index, edge] of (Array.isArray(input.corridors?.edges) ? input.corridors.edges : []).entries()) if (edge?.thermal !== undefined) validateThermalObject(edge.thermal, `corridors.edges[${index}].thermal`, issues);
  return { ok: issues.length === 0, issues };
}

function segmentThermal(segment, edge, criteria, temperatureRating) {
  const global = { ambientTempC: criteria.ambientTempC ?? 30, bundledConductors: criteria.bundledConductors ?? 3 };
  const local = edge?.thermal || {};
  const ambientTempC = local.ambientTempC ?? global.ambientTempC;
  const bundledConductors = local.bundledConductors ?? global.bundledConductors;
  const ambientFactor = ambientTempFactor(ambientTempC, temperatureRating);
  const groupingFactor = bundlingFactor(bundledConductors);
  const solidCoverLength = local.solidCoverContinuousLengthFt ?? criteria.thermal?.solidCoverContinuousLengthFt;
  const solidCoverFactor = segment.type === 'tray' && Number.isFinite(solidCoverLength) && solidCoverLength > 6 ? 0.95 : 1;
  return { segmentId: segment.segmentId, type: segment.type, ambientTempC, bundledConductors, solidCoverContinuousLengthFt: local.solidCoverContinuousLengthFt ?? criteria.thermal?.solidCoverContinuousLengthFt ?? null, ambientFactor, bundlingFactor: groupingFactor, solidCoverFactor, adjustmentFactor: ambientFactor * groupingFactor * solidCoverFactor, tableBasis: 'NEC Table 310.16 with NEC ambient/bundling corrections; multiconductor MC tray baseline', source: local.ambientTempC === undefined && local.bundledConductors === undefined ? 'global-criteria-default' : 'corridor-edge-thermal' };
}

export function evaluateDesignSynthesisRouteThermal({ route, edges = [], criteria = {}, temperatureRating = 75 } = {}) {
  if (!route || route.status !== 'routed') return { status: 'blocked', model: 'NEC-table-screening', limitingSegmentId: null, adjustmentFactor: 0, limitingAmpacityA: null, segments: [], assumptions: ['Thermal assessment withheld because the route is unavailable.'] };
  const edgeMap = new Map(edges.map(edge => [String(edge.id), edge]));
  const routeSegments = [];
  for (const edgeId of route.edgeIds || []) routeSegments.push({ segmentId: String(edgeId), type: 'tray' });
  if ((route.sourceAttachmentFt || 0) > 0) routeSegments.unshift({ segmentId: 'field-source', type: 'field' });
  if ((route.destinationAttachmentFt || 0) > 0) routeSegments.push({ segmentId: 'field-destination', type: 'field' });
  if (!routeSegments.length) routeSegments.push({ segmentId: 'field-point', type: 'field' });
  const segments = routeSegments.map(segment => segmentThermal(segment, edgeMap.get(segment.segmentId), criteria, temperatureRating));
  const limiting = segments.reduce((best, segment) => !best || segment.adjustmentFactor < best.adjustmentFactor ? segment : best, null);
  const assumptions = ['NEC tabulated screening only; detailed IEC/direct-burial thermal methods are outside this LV multicore MC route model.', 'Ambient and bundling values are evaluated as a pair on each segment; unspecified segments use global criteria defaults.', 'Tray touching/spaced labels do not apply the single-conductor 0.65 tray factor to multiconductor MC.'];
  if (criteria.thermal?.solidCoverContinuousLengthFt > 6) assumptions.push('Explicit solid-cover continuous length applies the NEC 392.80(A) 0.95 factor to tray segments.');
  return { status: limiting && limiting.adjustmentFactor > 0 ? 'evaluated' : 'blocked', model: 'NEC-table-screening', limitingSegmentId: limiting?.segmentId || null, adjustmentFactor: limiting?.adjustmentFactor || 0, limitingAmpacityA: null, segments, assumptions };
}

export default { validateDesignSynthesisThermalInput, evaluateDesignSynthesisRouteThermal };

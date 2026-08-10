import { sanitizeCurve } from '../tccUtils.js';

export const CUSTOM_CURVE_VARIANT_ROLE_OPTIONS = Object.freeze([
  { value: 'standard', label: 'General curve' },
  { value: 'melting', label: 'Melting (minimum melt)' },
  { value: 'clearing', label: 'Clearing (total clearing)' },
  { value: 'symmetrical_rms_peak', label: 'Peak let-through (symmetrical RMS)' }
]);

export function cloneCustomCurvePoints(points) {
  return Array.isArray(points)
    ? points.map(point => ({ current: point.current, time: point.time }))
    : [];
}

export function normalizeCustomCurveVariantRole(value) {
  if (typeof value !== 'string') return 'standard';
  const trimmed = value.trim().toLowerCase();
  return ['melting', 'clearing', 'symmetrical_rms_peak'].includes(trimmed) ? trimmed : 'standard';
}

export function defaultCustomCurveVariantName(index, role = 'standard') {
  if (role === 'melting') return 'Melting curve';
  if (role === 'clearing') return 'Clearing curve';
  if (role === 'symmetrical_rms_peak') return 'Peak let-through curve';
  return `Curve ${index + 1}`;
}

export function getCustomCurveVariantDisplayName(variant, index) {
  const explicit = typeof variant?.name === 'string' ? variant.name.trim() : '';
  return explicit || defaultCustomCurveVariantName(index, normalizeCustomCurveVariantRole(variant?.role));
}

export function resolveCustomCurvePointHighlight(points, highlight, lastCapturedPoint) {
  const sanitized = sanitizeCurve(points);
  const approxEqual = (a, b) => {
    const diff = Math.abs(a - b);
    const scale = Math.max(1, Math.abs(a), Math.abs(b));
    return diff <= 1e-6 * scale;
  };
  const resolve = target => {
    if (!target) return null;
    const current = Number(target.current);
    const time = Number(target.time);
    if (!Number.isFinite(current) || !Number.isFinite(time)) return null;
    return sanitized.find(point => approxEqual(point.current, current) && approxEqual(point.time, time)) || null;
  };
  const matched = resolve(highlight) || resolve(lastCapturedPoint);
  if (matched) return { points: sanitized, lastCapturedPoint: { ...matched } };
  const fallback = sanitized[sanitized.length - 1];
  return { points: sanitized, lastCapturedPoint: fallback ? { ...fallback } : null };
}

export function buildCustomCurveProfilesPayload(curveVariants) {
  return (Array.isArray(curveVariants) ? curveVariants : []).map((variant, index) => {
    const role = normalizeCustomCurveVariantRole(variant.role);
    const payload = {
      id: variant.id,
      name: getCustomCurveVariantDisplayName(variant, index),
      curve: cloneCustomCurvePoints(variant.points)
    };
    if (role !== 'standard') payload.role = role;
    return payload;
  });
}

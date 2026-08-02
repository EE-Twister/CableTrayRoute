import { sanitizeCurve } from '../tccUtils.js';
import { CUSTOM_CURVE_SETTING_CONFIG } from './viewModel.mjs';

export const CUSTOM_CURVE_VENDOR_FALLBACK = 'Custom Curves';
export const CUSTOM_CURVE_CATEGORY = 'custom curve';

const CUSTOM_CURVE_ALLOWED_ROLES = new Set(['melting', 'clearing', 'symmetrical_rms_peak']);

export function createCustomCurveId(counter = null) {
  if (Number.isFinite(counter) && counter >= 0) return `custom-curve-${counter}`;
  return `custom-curve-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function sanitizeAxisSpec(raw = {}) {
  if (!raw || typeof raw !== 'object') return {};
  const axis = {};
  const currentMin = Number(raw.currentMin ?? raw.minCurrent ?? raw.xMin ?? raw.minCurrentAmp);
  const currentMax = Number(raw.currentMax ?? raw.maxCurrent ?? raw.xMax ?? raw.maxCurrentAmp);
  const timeMin = Number(raw.timeMin ?? raw.minTime ?? raw.yMin ?? raw.minTimeSec);
  const timeMax = Number(raw.timeMax ?? raw.maxTime ?? raw.yMax ?? raw.maxTimeSec);
  if (Number.isFinite(currentMin) && currentMin > 0) axis.currentMin = currentMin;
  if (Number.isFinite(currentMax) && currentMax > 0) axis.currentMax = currentMax;
  if (Number.isFinite(timeMin) && timeMin > 0) axis.timeMin = timeMin;
  if (Number.isFinite(timeMax) && timeMax > 0) axis.timeMax = timeMax;
  if (axis.currentMin !== undefined && axis.currentMax !== undefined && axis.currentMax <= axis.currentMin) {
    const swap = axis.currentMin;
    axis.currentMin = Math.min(axis.currentMin, axis.currentMax / 1.5 || axis.currentMin);
    axis.currentMax = Math.max(swap, axis.currentMax);
  }
  if (axis.timeMin !== undefined && axis.timeMax !== undefined && axis.timeMax <= axis.timeMin) {
    const swap = axis.timeMin;
    axis.timeMin = Math.min(axis.timeMin, axis.timeMax / 1.5 || axis.timeMin);
    axis.timeMax = Math.max(swap, axis.timeMax);
  }
  return axis;
}

export function sanitizeBoundsSpec(raw = {}) {
  if (!raw || typeof raw !== 'object') return {};
  const bounds = {};
  const left = Number(raw.left ?? raw.leftOffset ?? raw.xPadding ?? raw.paddingLeft);
  const right = Number(raw.right ?? raw.rightOffset ?? raw.paddingRight);
  const top = Number(raw.top ?? raw.topOffset ?? raw.paddingTop);
  const bottom = Number(raw.bottom ?? raw.bottomOffset ?? raw.paddingBottom);
  if (Number.isFinite(left) && left >= 0) bounds.left = left;
  if (Number.isFinite(right) && right >= 0) bounds.right = right;
  if (Number.isFinite(top) && top >= 0) bounds.top = top;
  if (Number.isFinite(bottom) && bottom >= 0) bounds.bottom = bottom;
  return bounds;
}

export function sanitizeToleranceSpec(raw = {}) {
  if (!raw || typeof raw !== 'object') return undefined;
  const lower = Number(raw.timeLower ?? raw.lower ?? raw.timeLowerBound);
  const upper = Number(raw.timeUpper ?? raw.upper ?? raw.timeUpperBound);
  const tolerance = {};
  if (Number.isFinite(lower) && lower > 0) tolerance.timeLower = lower;
  if (Number.isFinite(upper) && upper > 0) tolerance.timeUpper = upper;
  return Object.keys(tolerance).length ? tolerance : undefined;
}

export function sanitizeCustomCurveSettings(raw = {}) {
  if (!raw || typeof raw !== 'object') return {};
  const sanitized = {};
  Object.entries(raw).forEach(([field, value]) => {
    const config = CUSTOM_CURVE_SETTING_CONFIG.get(field);
    if (!config) return;
    if (config.numeric) {
      const numberValue = Number(value);
      if (Number.isFinite(numberValue) && numberValue >= 0) sanitized[field] = numberValue;
      return;
    }
    if (value !== undefined && value !== null) {
      const strValue = String(value).trim();
      if (strValue) sanitized[field] = strValue;
    }
  });
  return sanitized;
}

export function sanitizeCustomCurveText(value, maxLength = 240) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

export function sanitizeCustomInterruptingRatings(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(rating => {
      if (!rating || typeof rating !== 'object') return null;
      const voltageVac = Number(rating.voltageVac ?? rating.voltage ?? rating.ratedVoltageVac);
      const currentKA = Number(rating.currentKA ?? rating.valueKA ?? rating.value);
      if (!Number.isFinite(voltageVac) || voltageVac <= 0 || !Number.isFinite(currentKA) || currentKA <= 0) return null;
      return {
        voltageVac,
        currentKA,
        currentType: sanitizeCustomCurveText(rating.currentType || 'AC', 12) || 'AC',
        ratingType: sanitizeCustomCurveText(rating.ratingType || 'AIR', 24) || 'AIR'
      };
    })
    .filter(Boolean);
}

export function sanitizeCustomCurveEvidence(raw = {}) {
  if (!raw || typeof raw !== 'object') return {};
  const evidence = {
    document: sanitizeCustomCurveText(raw.document, 300),
    revision: sanitizeCustomCurveText(raw.revision, 100),
    date: sanitizeCustomCurveText(raw.date, 40),
    curveNumber: sanitizeCustomCurveText(raw.curveNumber ?? raw.curveId, 100),
    page: sanitizeCustomCurveText(raw.page, 40),
    extractionMethod: sanitizeCustomCurveText(raw.extractionMethod, 100),
    reviewer: sanitizeCustomCurveText(raw.reviewer, 160)
  };
  return Object.fromEntries(Object.entries(evidence).filter(([, value]) => value));
}

export function normalizeCustomCurveRole(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return CUSTOM_CURVE_ALLOWED_ROLES.has(trimmed) ? trimmed : null;
}

export function sanitizeCustomCurveProfiles(rawProfiles = []) {
  if (!Array.isArray(rawProfiles)) return [];
  const seenIds = new Set();
  let counter = 0;
  const ensureName = (name, index) => typeof name === 'string' && name.trim() ? name.trim() : `Curve ${index + 1}`;
  const syncCounter = id => {
    if (typeof id !== 'string') return;
    const match = /([0-9]+)$/.exec(id);
    if (!match || match[1].length > 15) return;
    const parsed = Number(match[1]);
    if (Number.isSafeInteger(parsed) && parsed >= 0) counter = Math.max(counter, parsed);
  };
  const reserveId = candidate => {
    let base = '';
    if (typeof candidate === 'string' && candidate.trim()) base = candidate.trim();
    else if (Number.isFinite(candidate)) base = `curve-${Math.abs(Math.trunc(candidate))}`;
    if (!base) base = `curve-${++counter}`;
    let id = base;
    syncCounter(id);
    while (seenIds.has(id)) id = `${base}-${++counter}`;
    seenIds.add(id);
    syncCounter(id);
    return id;
  };

  return rawProfiles
    .map((profile, index) => {
      if (!profile || typeof profile !== 'object') return null;
      const points = Array.isArray(profile.curve)
        ? profile.curve
        : Array.isArray(profile.points)
          ? profile.points
          : [];
      const curve = sanitizeCurve(points);
      if (!curve.length) return null;
      return {
        id: reserveId(profile.id ?? profile.key ?? profile.name ?? profile.label ?? ''),
        name: ensureName(profile.name ?? profile.label, index),
        curve,
        settings: sanitizeCustomCurveSettings(profile.settings ?? {}),
        tolerance: sanitizeToleranceSpec(profile.tolerance ?? {}),
        role: normalizeCustomCurveRole(profile.role ?? profile.kind) || undefined
      };
    })
    .filter(Boolean);
}

export function sanitizeCustomCurve(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const points = Array.isArray(raw.curve) ? raw.curve : Array.isArray(raw.points) ? raw.points : [];
  const profiles = Array.isArray(raw.curveProfiles)
    ? raw.curveProfiles
    : Array.isArray(raw.curves)
      ? raw.curves
      : [];
  let curve = sanitizeCurve(points);
  let curveProfiles = sanitizeCustomCurveProfiles(profiles);
  if (!curveProfiles.length && curve.length) {
    curveProfiles = [{ id: 'curve-1', name: 'Curve 1', curve: curve.map(point => ({ ...point })), settings: {} }];
  }
  if (!curve.length && curveProfiles.length) curve = curveProfiles[0].curve.map(point => ({ ...point }));
  if (!curve.length) return null;
  const sequence = Number(raw.sequence ?? raw.order ?? raw.index ?? raw.position);
  const manufacturer = typeof raw.manufacturer === 'string' && raw.manufacturer.trim()
    ? raw.manufacturer.trim()
    : (typeof raw.vendor === 'string' ? raw.vendor.trim() : '');
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : createCustomCurveId(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Custom Curve',
    manufacturer,
    deviceType: typeof raw.deviceType === 'string' && raw.deviceType.trim() ? raw.deviceType.trim() : CUSTOM_CURVE_CATEGORY,
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    curve,
    curveProfiles,
    axes: sanitizeAxisSpec(raw.axes ?? raw.axis ?? {}),
    bounds: sanitizeBoundsSpec(raw.bounds ?? raw.padding ?? {}),
    settings: sanitizeCustomCurveSettings(raw.settings ?? raw.adjustableSettings ?? raw.deviceSettings ?? {}),
    catalogNumber: sanitizeCustomCurveText(raw.catalogNumber ?? raw.catalog ?? raw.model, 160),
    interruptingRatings: sanitizeCustomInterruptingRatings(raw.interruptingRatings),
    curveEvidence: sanitizeCustomCurveEvidence(raw.curveEvidence ?? raw.evidence ?? {}),
    libraryStatus: raw.libraryStatus === 'calculation_ready' ? 'calculation_ready' : undefined,
    sequence: Number.isFinite(sequence) ? sequence : null,
    tolerance: sanitizeToleranceSpec(raw.tolerance)
  };
}

export function buildCustomCurveBaseDevice(curve, id = `custom:${curve?.id || ''}`) {
  const vendor = curve?.manufacturer || CUSTOM_CURVE_VENDOR_FALLBACK;
  const profiles = Array.isArray(curve?.curveProfiles)
    ? curve.curveProfiles.filter(profile => Array.isArray(profile?.curve) && profile.curve.length)
    : [];
  const baseCurve = Array.isArray(curve?.curve) && curve.curve.length
    ? curve.curve
    : profiles[0]?.curve || [];
  return {
    id,
    name: curve?.name || 'Custom Curve',
    type: curve?.deviceType || CUSTOM_CURVE_CATEGORY,
    curve: baseCurve,
    curveProfiles: profiles.length ? profiles : undefined,
    settings: { ...(curve?.settings || {}) },
    vendor,
    manufacturer: vendor,
    tolerance: curve?.tolerance,
    catalogNumber: curve?.catalogNumber || '',
    interruptingRatings: sanitizeCustomInterruptingRatings(curve?.interruptingRatings),
    curveEvidence: sanitizeCustomCurveEvidence(curve?.curveEvidence),
    libraryStatus: curve?.libraryStatus
  };
}

export function sortCustomCurveList(list = []) {
  if (!Array.isArray(list)) return [];
  return list.slice().sort((a, b) => {
    const sequenceDelta = (Number(a?.sequence) || 0) - (Number(b?.sequence) || 0);
    if (sequenceDelta) return sequenceDelta;
    return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
  });
}

export function normalizeCustomCurveSequences(list = []) {
  let sequence = 0;
  return sortCustomCurveList(list).map(curve => ({ ...curve, sequence: ++sequence }));
}

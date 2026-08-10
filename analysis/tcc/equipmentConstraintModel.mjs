import { interpolateTime } from '../tccAutoCoord.mjs';
import { collectNearestDirectionalDeviceUids } from '../tccContext.mjs';

export const PROTECTIVE_DEVICE_TYPES = Object.freeze([
  'breaker',
  'fuse',
  'relay',
  'relay_87',
  'recloser',
  'contactor',
  'switch'
]);
const PROTECTIVE_TYPE_SET = new Set(PROTECTIVE_DEVICE_TYPES);
const EQUIPMENT_OVERLAY_KINDS = new Set(['cable', 'inrush', 'transformerDamage', 'motorStart', 'motorThermal']);

function normalizeProtectionType(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isProtectiveEntry(entry) {
  return isProtectiveDeviceType(entry?.selection?.baseDevice?.type);
}

function isComponentBoundProtectiveEntry(entry, componentDeviceUidMap) {
  const selection = entry?.selection;
  const componentId = selection?.componentId ? String(selection.componentId) : '';
  if (!componentId || selection?.kind !== 'component' || !isProtectiveEntry(entry)) return false;
  return componentDeviceUidMap?.get(componentId) === selection.uid;
}

function equipmentAssociationComponentId(overlay) {
  const value = overlay?.kind === 'cable' ? overlay?.targetId : overlay?.sourceId;
  return value ? String(value) : '';
}

function constraintKind(overlay) {
  return overlay?.kind === 'inrush' || overlay?.kind === 'motorStart'
    ? 'rideThrough'
    : 'damageLimit';
}

function buildAssociationReview(overlay, associationReason, associatedDeviceUids = []) {
  return {
    kind: constraintKind(overlay),
    status: 'review',
    screeningStatus: 'unknown',
    associationReason,
    associatedDeviceUids,
    overlay,
    entry: null
  };
}

export function resolveEquipmentProtectiveEntry(
  overlay,
  plotted = [],
  { componentFlowMap, componentDeviceUidMap, depthLimit = 4 } = {}
) {
  const componentId = equipmentAssociationComponentId(overlay);
  if (!componentId) {
    return { entry: null, reason: 'missing_equipment_reference', deviceUids: [] };
  }

  const nearestUids = [...collectNearestDirectionalDeviceUids(
    componentId,
    componentFlowMap,
    componentDeviceUidMap,
    'upstream',
    depthLimit
  )];
  if (!nearestUids.length) {
    return { entry: null, reason: 'no_nearest_upstream_device', deviceUids: [] };
  }
  if (nearestUids.length !== 1) {
    return { entry: null, reason: 'ambiguous_nearest_upstream_devices', deviceUids: nearestUids };
  }

  const uid = nearestUids[0];
  const matches = plotted.filter(entry => (
    entry?.selection?.uid === uid
    && isComponentBoundProtectiveEntry(entry, componentDeviceUidMap)
  ));
  if (!matches.length) {
    return { entry: null, reason: 'associated_device_not_plotted', deviceUids: nearestUids };
  }
  if (matches.length !== 1) {
    return { entry: null, reason: 'ambiguous_plotted_device', deviceUids: nearestUids };
  }
  return { entry: matches[0], reason: null, deviceUids: nearestUids };
}

export function isProtectiveDeviceType(value) {
  return PROTECTIVE_TYPE_SET.has(normalizeProtectionType(value));
}

function protectiveCheckCurve(entry, mode) {
  if (!entry?.scaled) return [];
  if (mode === 'rideThrough') {
    return entry.scaled.minCurve?.length ? entry.scaled.minCurve : (entry.scaled.curve || []);
  }
  return entry.scaled.maxCurve?.length ? entry.scaled.maxCurve : (entry.scaled.curve || []);
}

export function evaluateRideThroughConstraint(overlay, protectiveEntry) {
  const current = overlay.current || overlay.lockedRotor;
  const duration = overlay.normalizedDuration || overlay.duration || overlay.startTime;
  if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(duration) || duration <= 0) return null;
  const entry = Array.isArray(protectiveEntry) ? protectiveEntry[0] : protectiveEntry;
  if (!entry) return null;
  const tripTime = interpolateTime(protectiveCheckCurve(entry, 'rideThrough'), current);
  const margin = tripTime - duration;
  return {
    kind: 'rideThrough',
    status: margin > 0 ? 'ok' : 'warning',
    overlay,
    current,
    duration,
    entry,
    tripTime,
    margin
  };
}

export function evaluateDamageLimitConstraint(overlay, protectiveEntry) {
  const points = Array.isArray(overlay.curve)
    ? overlay.curve.filter(point => Number.isFinite(point.current) && point.current > 0 && Number.isFinite(point.time) && point.time > 0)
    : [];
  if (!points.length) return null;
  const entry = Array.isArray(protectiveEntry) ? protectiveEntry[0] : protectiveEntry;
  if (!entry) return null;
  let worst = null;
  points.forEach(point => {
    const tripTime = interpolateTime(protectiveCheckCurve(entry, 'damage'), point.current);
    const margin = point.time - tripTime;
    const evaluation = { entry, tripTime, margin, point };
    if (!worst || evaluation.margin < worst.margin) worst = evaluation;
  });
  if (!worst) return null;
  return {
    kind: 'damageLimit',
    status: worst.margin >= 0 ? 'ok' : 'warning',
    overlay,
    ...worst
  };
}

export function evaluateEquipmentConstraints(plotted = [], overlays = [], associationContext = {}) {
  return overlays
    .filter(entry => EQUIPMENT_OVERLAY_KINDS.has(entry.kind))
    .map(overlay => {
      const association = resolveEquipmentProtectiveEntry(overlay, plotted, associationContext);
      if (!association.entry) {
        return buildAssociationReview(overlay, association.reason, association.deviceUids);
      }
      let evaluation;
      if (overlay.kind === 'inrush' || overlay.kind === 'motorStart') {
        evaluation = evaluateRideThroughConstraint(overlay, association.entry);
      } else {
        evaluation = evaluateDamageLimitConstraint(overlay, association.entry);
      }
      return evaluation || {
        ...buildAssociationReview(overlay, 'constraint_data_incomplete', association.deviceUids),
        entry: association.entry
      };
    })
    .filter(Boolean);
}
